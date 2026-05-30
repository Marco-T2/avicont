# Tasks: Reporte Libro Diario (módulo `reportes`)

> Strict TDD Mode: RED → GREEN por tarea de implementación.
> Conventional commit scope: `reportes` (singular).

---

## Fase 1: Infraestructura y dominio base

- [x] 1.1 **[setup]** Crear estructura de carpetas `backend/src/reportes/{domain,ports,adapters,dto}/`.
- [x] 1.2 **[RED unit]** Escribir `reportes/domain/libro-diario-errors.spec.ts` — verifica que cada subclase (`FiltroRequeridoError`, `RangoInvalidoError`, `RangoExcedeLimiteError`, `PeriodoNoEncontradoError`) tiene el `httpStatus` y `code` esperados (REQ-LD-01, REQ-LD-10).
- [x] 1.3 **[GREEN]** Crear `reportes/domain/libro-diario-errors.ts` con las 4 subclases de `DomainError` (`REPORTES_LIBRO_DIARIO_FILTRO_REQUERIDO` 400, `REPORTES_LIBRO_DIARIO_RANGO_INVALIDO` 400, `REPORTES_LIBRO_DIARIO_RANGO_EXCEDE_LIMITE` 422, `REPORTES_PERIODO_NO_ENCONTRADO` 404).
- [x] 1.4 **[RED integration — periodos]** En `periodos-fiscales/adapters/prisma-periodos-reader.adapter.integration.spec.ts`, agregar casos: `obtenerRangoFechas` devuelve `{desde, hasta}` para año/mes del período; devuelve `null` si `periodoId` no existe o es de otro tenant (REQ-LD-01, §4.2).
- [x] 1.5 **[GREEN]** Ampliar `periodos-fiscales/ports/periodos-reader.port.ts` con `obtenerRangoFechas(tenantId, periodoId): Promise<{desde: Date; hasta: Date} | null>`. Implementar en `prisma-periodos-reader.adapter.ts` (deriva `[year-month-01, fin-de-mes]` desde `year`+`month` del período). Registro en `PeriodosReaderModule`.
  - _Commit sugerido_: `feat(periodos-fiscales): ampliar PeriodosReaderPort con obtenerRangoFechas`

---

## Fase 2: Port y adapter de comprobantes

- [x] 2.1 **[setup]** Crear `reportes/ports/comprobantes-reader.port.ts` — `ComprobantesReaderPort` abstract con `Symbol`, tipos `LibroDiarioFiltros` y `ComprobanteLibroDiarioRow` (filas Prisma, decisión 1).
- [x] 2.2 **[RED integration]** Crear `reportes/adapters/prisma-comprobantes-reader.adapter.integration.spec.ts` — seed 2 tenants, probar (REQ-LD-02, REQ-LD-03, REQ-LD-04, REQ-LD-08):
  - `contarAsientos`: cuenta solo CONTABILIZADO/BLOQUEADO del tenant, excluye BORRADOR, respeta `incluirAnulados`.
  - `obtenerAsientosParaLibroDiario`: aísla tenant (2 tenants en misma fecha → sin fuga), orden cronológico estable, líneas ordenadas por `orden`, anulados excluidos/incluidos por flag.
- [x] 2.3 **[GREEN]** Crear `reportes/adapters/prisma-comprobantes-reader.adapter.ts` — `findMany` con include anidado (`lineas → cuenta`), `where` con `organizationId` + `estado IN [CONTABILIZADO, BLOQUEADO]` + `anulado` condicional + `fechaContable` rango; orden `fechaContable ASC, numero ASC NULLS LAST, createdAt ASC`; `count` paralelo para el tope.
  - _Commit sugerido_: `feat(reportes): ComprobantesReaderPort + adapter Prisma con aislamiento multi-tenant`

---

## Fase 3: DTOs y mapper

- [x] 3.1 **[RED unit]** Crear `reportes/dto/libro-diario-response.dto.spec.ts` — verifica `toLibroDiarioResponse`: `Decimal → string` con 2 decimales, fecha `@db.Date → "YYYY-MM-DD"`, líneas anidadas correctas, `totalDebeBob === totalHaberBob` para asiento válido, período vacío → `"0.00"` (REQ-LD-05, REQ-LD-06, REQ-LD-07).
- [x] 3.2 **[GREEN]** Crear `reportes/dto/libro-diario-response.dto.ts` — DTO anidado + función pura `toLibroDiarioResponse(rows, rango)`.
- [x] 3.3 **[setup]** Crear `reportes/dto/libro-diario-query.dto.ts` — class-validator: `periodoFiscalId?` (IsUUID), `fechaDesde?`/`fechaHasta?` (regex `^\d{4}-\d{2}-\d{2}$`), `incluirAnulados?` (`@Transform` → boolean, default false).

---

## Fase 4: Service

- [x] 4.1 **[RED unit]** Crear `reportes/libro-diario.service.spec.ts` — mocks de `ComprobantesReaderPort` + `PeriodosReaderPort`, casos (REQ-LD-01, REQ-LD-10):
  - Lanza `FiltroRequeridoError` si ningún filtro.
  - Lanza `FiltroRequeridoError` si ambas formas presentes.
  - Lanza `RangoInvalidoError` si `fechaDesde > fechaHasta`.
  - Resuelve `periodoFiscalId → rango` vía `PeriodosReaderPort.obtenerRangoFechas`; lanza `PeriodoNoEncontradoError` si `null`.
  - Lanza `RangoExcedeLimiteError` si `contarAsientos > 5000`.
  - Retorna `LibroDiarioResponseDto` bien formado en happy path.
- [x] 4.2 **[GREEN]** Crear `reportes/libro-diario.service.ts` — orquesta validación → resolución período → `count` previo → `obtenerAsientos` → mapper → totales.
  - _Commit sugerido_: `feat(reportes): LibroDiarioService con validación, tope defensivo y mapeo`

---

## Fase 5: Controller y módulo

- [x] 5.1 **[RED e2e]** Crear `backend/test/libro-diario.e2e-spec.ts` — `--runInBand --forceExit`, seed 2 tenants con comprobantes CONTABILIZADO/BORRADOR/anulado, casos (REQ-LD-08, REQ-LD-09, REQ-LD-02, REQ-LD-03, REQ-LD-10):
  - `GET /api/libros/diario` sin JWT → 401.
  - Con JWT sin `contabilidad.libro-diario.read` → 403.
  - Con JWT y permiso + `periodoFiscalId` válido → 200, sin BORRADOR, sin asientos de Tenant B.
  - Con `fechaDesde`+`fechaHasta` → 200.
  - Ambas formas simultáneas → 400 `REPORTES_LIBRO_DIARIO_FILTRO_REQUERIDO`.
  - Sin filtro → 400.
  - Con `incluirAnulados=true` → anulado visible con `"anulado":true`.
  - Tope 5.000 excedido → 422 `REPORTES_LIBRO_DIARIO_RANGO_EXCEDE_LIMITE`.
- [x] 5.2 **[GREEN]** Crear `reportes/reportes.controller.ts` — `@Controller('libros')`, `GET diario`, `@RequirePermissions('contabilidad.libro-diario.read')`, guards: `JwtAuthGuard`, `ModuleEnabledGuard('contabilidad')`, `PermissionsGuard`.
- [x] 5.3 **[GREEN]** Crear `reportes/reportes.module.ts` — DI: `ComprobantesReaderPort → PrismaComprobantesReaderAdapter`; imports: `PrismaModule`, `PeriodosReaderModule`, `RbacModule`.
- [x] 5.4 **[GREEN]** Registrar `ReportesModule` en `backend/src/app.module.ts`.
  - _Commit sugerido_: `feat(reportes): controller GET /libros/diario + módulo + wiring app`

---

## Fase 6: Frontend

- [ ] 6.1 **[RED vitest]** Crear `frontend/src/features/libro-diario/schemas/libro-diario-filtro-schema.test.ts` — refine "período O rango requerido", "no ambos", "fechaDesde ≤ fechaHasta", mensajes en español (REQ-LD-01, REQ-LD-11).
- [ ] 6.2 **[GREEN]** Crear `frontend/src/features/libro-diario/schemas/libro-diario-filtro-schema.ts` — zod con refine.
- [ ] 6.3 **[setup]** Crear `frontend/src/features/libro-diario/types.ts` + agregar `LibroDiarioParams`, `LibroDiarioResponse` en `frontend/src/types/api.ts` (REQ-LD-07).
- [ ] 6.4 **[setup]** Crear `frontend/src/features/libro-diario/api/get-libro-diario.ts` — `api.get('/api/libros/diario', { params })`.
- [ ] 6.5 **[setup]** Crear `frontend/src/features/libro-diario/hooks/use-libro-diario.ts` — `useQuery(['libro-diario', params])`, `keepPreviousData`, `enabled` cuando el filtro es válido.
- [ ] 6.6 **[RED vitest]** Crear `frontend/src/features/libro-diario/components/libro-diario-tabla.test.tsx` — Testing Library: tabla agrupa asientos (cabecera + subfilas líneas), total al pie, estado vacío, estado error (REQ-LD-11).
- [ ] 6.7 **[GREEN]** Crear `frontend/src/features/libro-diario/components/libro-diario-tabla.tsx` + `libro-diario-filtros.tsx` (RHF + zodResolver, selector período/rango, toggle anulados).
- [ ] 6.8 **[setup]** Crear `frontend/src/features/libro-diario/pages/libro-diario-page.tsx` — contenedor: hook + filtros + tabla + gating por módulo `contabilidad`.
- [ ] 6.9 **[setup]** Registrar ruta `/libros/diario → LibroDiarioPage` en `frontend/src/routes/router.tsx` + item "Libro Diario" en `dashboard-shell.tsx`.
  - _Commit sugerido_: `feat(reportes): feature libro-diario frontend (schema, tabla, página, ruta)`

---

## Fase 7: Cierre y verificación

- [ ] 7.1 **[verde]** Correr `DATABASE_URL=... pnpm exec jest src/ --runInBand` desde `backend/` — unit + integration verde. (GOTCHA: integration specs requieren Postgres en `127.0.0.1`.)
- [ ] 7.2 **[verde]** Correr e2e `DATABASE_URL=... JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=... pnpm exec jest test/ --runInBand --forceExit`.
- [ ] 7.3 **[verde]** Correr `pnpm exec tsc --noEmit -p tsconfig.json` desde `backend/`.
- [ ] 7.4 **[verde]** Correr `pnpm exec tsc -b` (NO `--noEmit`) desde `frontend/`.
- [ ] 7.5 **[verde]** Correr `pnpm run vitest` desde `frontend/`.
- [ ] 7.6 **[verde]** Correr lint: `pnpm run lint` desde `backend/` y `frontend/`.
