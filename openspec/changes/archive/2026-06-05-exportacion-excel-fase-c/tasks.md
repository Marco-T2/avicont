# Tasks: Exportación a Excel — Fase C (Listado de Comprobantes)

> Artifact store: hybrid
> Topic key: `sdd/exportacion-excel-fase-c/tasks`
> Strict TDD Mode: ACTIVO — cada unidad es RED (test que falla) → GREEN (implementación mínima).
> Orden de dependencia: backend (port → adapter → service → DTO/controller → openapi) → frontend
> (api → lib → botón → página → gen-types) → cierre (tsc/lint/tests) → smoke manual.

## Grupo 1 — Backend: port

- [ ] **T1.1** Agregar al port `ComprobanteRepositoryPort` (`backend/src/comprobantes/ports/comprobante.repository.port.ts`)
  las firmas abstractas `contarParaExport(tenantId, filtros, tx?): Promise<number>` y
  `listarParaExport(tenantId, filtros, tx?): Promise<ComprobanteListRow[]>` con JSDoc (reusan
  `ListarFiltros` y `ComprobanteListRow` ya definidos). Documentar orden ASC NULLS LAST en el JSDoc de
  `listarParaExport`.

## Grupo 2 — Backend: adapter (integration TDD)

- [ ] **T2.1 (RED)** Escribir `prisma-comprobante.repository.integration.spec.ts` (o ampliar el
  existente al lado del adapter) con casos para `listarParaExport`/`contarParaExport`: (a) trae todas
  las filas sin paginar; (b) orden cronológico ASCENDENTE; (c) borradores (numero NULL) al final dentro
  de la misma fecha (NULLS LAST); (d) **Anti-31**: dos tenants, el export de A no ve los de B;
  (e) `incluirAnulados` true/false; (f) filtros tipo/estado/periodoFiscalId/q; (g) `contarParaExport`
  devuelve el count del mismo WHERE. Postgres real. Tests en RED.
- [ ] **T2.2 (GREEN)** En `prisma-comprobante.repository.ts`: extraer helper privado
  `construirWhereListado(tenantId, filtros)` con el WHERE actual de `listar` (Anti-31 +
  incluirAnulados + filtros); refactorizar `listar` para usarlo (sin cambiar su comportamiento);
  implementar `contarParaExport` (count con el helper) y `listarParaExport` (findMany sin skip/take,
  `include: LIST_INCLUDE`, `orderBy: [{ fechaContable: 'asc' }, { numero: { sort: 'asc', nulls: 'last' } }]`).
  Verde T2.1 + los tests existentes de `listar` siguen verdes.

## Grupo 3 — Backend: error de dominio

- [ ] **T3.1 (RED)** En `comprobante-errors.spec.ts` agregar caso para `ComprobanteExportRangoExcedidoError`:
  code `COMPROBANTE_EXPORT_RANGO_EXCEDIDO`, mensaje con cantidad/límite, `details` con `{ cantidad, limite }`.
- [ ] **T3.2 (GREEN)** En `comprobante-errors.ts` agregar `ComprobanteExportRangoExcedidoError extends
  InvalidStateError` (espeja `RangoExcedeLimiteError` del Libro Diario). Verde T3.1.

## Grupo 4 — Backend: DTOs

- [ ] **T4.1** En `listar-comprobantes.dto.ts` agregar `ExportarComprobantesQueryDto` (= el query del
  listado SIN `page`/`limit`; conserva periodoFiscalId/tipo/estado/fechaDesde/fechaHasta/q/incluirAnulados
  con sus decoradores y el `@Transform` del boolean). Definido plano (no `OmitType`).
- [ ] **T4.2** En `comprobante-response.dto.ts` agregar `ExportarComprobantesResponseDto`
  `{ items: ComprobanteListItemDto[] }` con `@ApiProperty({ type: () => [ComprobanteListItemDto] })`.
  Reusa `ComprobanteListItemDto` y `toComprobanteListItem` existentes (sin DTO de fila nuevo).

## Grupo 5 — Backend: service (unit TDD)

- [ ] **T5.1 (RED)** Escribir/ampliar `comprobantes.service.spec.ts` con `exportar`: (a) cap excedido
  (mock `contarParaExport` > cap) → lanza `ComprobanteExportRangoExcedidoError`; (b) cap no excedido →
  devuelve `{ items }` mapeados; (c) los filtros se pasan correctamente al port (count y listarParaExport
  reciben el mismo `ListarFiltros`); (d) el `count` se invoca ANTES de `listarParaExport`. Mock del port,
  cero Prisma. Tests en RED.
- [ ] **T5.2 (GREEN)** En `comprobantes.service.ts`: inyectar `ConfigService` (si no está), exportar
  `COMPROBANTES_EXPORT_MAX_ENV` + `COMPROBANTES_EXPORT_MAX_DEFAULT = 1000`, leer el cap en el
  constructor, implementar `exportar(tenantId, query)` (arma `ListarFiltros` igual que `listar`, count
  previo, `> cap` → error, `listarParaExport`, mapea con `toComprobanteListItem`). Verde T5.1.
  Verificar que el `ComprobantesModule` provea `ConfigModule`/`ConfigService` (ya disponible global vía
  `@nestjs/config` — confirmar).

## Grupo 6 — Backend: controller + e2e

- [ ] **T6.1 (RED, e2e)** En el e2e de comprobantes agregar: (a) `GET /api/comprobantes/export` sin
  permiso → 403; (b) con permiso → 200 con `items` del rango filtrado, orden ASC; (c) cap excedido →
  422 con code `COMPROBANTE_EXPORT_RANGO_EXCEDIDO` (setear `COMPROBANTES_EXPORT_MAX` bajo en el test).
  Tests en RED.
- [ ] **T6.2 (GREEN)** En `comprobantes.controller.ts` agregar `@Get('export')` (ANTES de `@Get(':id')`)
  con `@RequirePermissions('contabilidad.asientos.read')`, `@ApiOperation`, `@ApiOkResponse({ type:
  ExportarComprobantesResponseDto })`, handler `exportar(req, query)` → `service.exportar(resolveTenantId(req), query)`.
  Verde T6.1.

## Grupo 7 — Backend: contract dump

- [ ] **T7.1** `cd backend && DATABASE_URL=... pnpm run openapi:dump` → regenerar `backend/openapi.json`.
  Verificar que aparecen `ExportarComprobantesQueryDto`/`ExportarComprobantesResponseDto` y el path
  `/api/comprobantes/export`. Commitear.

## Grupo 8 — Frontend: tipos generados

- [ ] **T8.1** `cd frontend && pnpm run gen:api-types` → regenerar `frontend/src/types/api.generated.ts`.
- [ ] **T8.2** En `frontend/src/types/api.ts` agregar los alias:
  `export type ExportarComprobantesResponse = Schemas['ExportarComprobantesResponseDto'];` y el tipo de
  params del export (reusar `ListarComprobantesParams` sin page/limit, o `ExportarComprobantesParams`).

## Grupo 9 — Frontend: api on-demand

- [ ] **T9.1** Crear `frontend/src/features/comprobantes/api/export-comprobantes.ts`:
  `exportComprobantes(params)` → `api.get('/api/comprobantes/export', { params })` (vía `@/lib/api`,
  Anti-F-03). Tipar params (sin page/limit) y response con `ExportarComprobantesResponse`.

## Grupo 10 — Frontend: mapeo a Excel (TDD)

- [ ] **T10.1 (RED)** Crear `frontend/src/features/comprobantes/lib/exportar-comprobantes.test.ts`
  (describe/it español) para `mapearComprobantesAFilas`: (a) 9 columnas en el orden Fecha/Número/Tipo/
  Documento respaldo/Nro. Ref./Contacto/Glosa/Estado/Total BOB; (b) comprobante completo; (c) borrador
  `numero=null` → celda Número vacía (no "null"); (d) 0/1/2 contactos concatenados con " / "; (e) 0/1/2
  documentos → "Documento respaldo" (tipoNombre) y "Nro. Ref." (numero) concatenados con " / ";
  (f) anulado → "Anulado" en Estado; (g) cabecera fiscal completa y con nulls (campos null omitidos);
  (h) monto §4.5 (celda tipo numero con el string del backend, sin recalcular); (i) fecha §4.6
  (`dd/mm/yyyy` sin corrimiento UTC). Tests en RED.
- [ ] **T10.2 (GREEN)** Crear `frontend/src/features/comprobantes/lib/exportar-comprobantes.ts`:
  `mapearComprobantesAFilas(items, perfil): Celda[][]` (cabecera fiscal + encabezados + filas con las 9
  columnas, separador `" / "`, borrador→vacío, anulado→"Anulado", monto→CeldaNumero, fecha→formatearFechaCelda)
  + `COLUMNS_COMPROBANTES: ColumnaHoja[]` (9 anchos). Reusa `armarCabeceraFiscal`/`formatearFechaCelda`/
  tipos de `@/lib/export-excel`. Verde T10.1.

## Grupo 11 — Frontend: botón (TDD)

- [ ] **T11.1 (RED)** Crear `boton-exportar-comprobantes.test.tsx` (describe/it español): (a) sin permiso
  → botón deshabilitado + tooltip (mock `usePermissions`, envolver en `TooltipProvider`); (b) con permiso
  → habilitado; (c) al click muestra "Generando…" y dispara la descarga (mockear `exportComprobantes`,
  `construirHoja`/`descargarBlob`). Tests en RED.
- [ ] **T11.2 (GREEN)** Crear `boton-exportar-comprobantes.tsx`: `PermissionButton` gateado por
  `PERMISSIONS.contabilidad.asientos.read`; handler con `useState(generando)` que fetchea
  `exportComprobantes(filtros)`, mapea con `mapearComprobantesAFilas`, `construirHoja(filas,
  COLUMNS_COMPROBANTES)`, `descargarBlob(blob, generarNombreArchivo('comprobantes', rango))`;
  `try/catch` con `toast.error`; `disabled={generando}`; texto `{generando ? 'Generando…' : 'Exportar a
  Excel'}`. Perfil nullable tolerado (default todos null). Verde T11.1.

## Grupo 12 — Frontend: montar en la página

- [ ] **T12.1** En `comprobantes-page.tsx`: importar `useEmpresa`, obtener el perfil; montar
  `<BotonExportarComprobantes filtros={...} perfil={...} rango={...} />` en el header (junto a "Nuevo
  comprobante"); pasar los filtros activos (los de `params` sin page/limit) y `rango` (periodoFiscalId o
  'todos'). No tocar la tabla ni la paginación.
- [ ] **T12.2** (Opcional, si el header se vuelve apretado) Verificar el layout responsive del header
  con dos botones (375/768/1440 px) — checklist UI §7 frontend.

## Grupo 13 — Cierre y verificación

- [ ] **T13.1** Backend: `pnpm exec tsc --noEmit -p tsconfig.json` + `pnpm run lint` limpios; cero `any`.
- [ ] **T13.2** Backend: unit (`pnpm exec jest src/`) + integration (`DATABASE_URL=... pnpm exec jest
  src/`) + e2e (`DATABASE_URL=... pnpm exec jest test/ --runInBand --forceExit`) verdes.
- [ ] **T13.3** Frontend: `pnpm exec tsc -b` + `pnpm run lint` limpios; `pnpm exec vitest run` verde.
- [ ] **T13.4** **contract-drift local**: correr `openapi:dump` + `gen:api-types` de nuevo y verificar
  `git diff --exit-code` sin cambios (los artefactos commiteados están sincronizados). El job CI lo
  exige.

## Grupo 14 — Smoke manual (Marco)

- [ ] **T14.1** Levantar stack (`docker compose up -d postgres redis` + backend dev + frontend). Con un
  usuario CON `contabilidad.asientos.read`: aplicar filtros en `/comprobantes`, presionar "Exportar a
  Excel", verificar que el `.xlsx` baja con TODO el rango (no la página), 9 columnas en orden, cabecera
  fiscal, fechas `dd/mm/yyyy`, total numérico, borradores sin número, anulado marcado (con toggle).
- [ ] **T14.2** Con un usuario SIN el permiso: verificar botón deshabilitado + tooltip.
- [ ] **T14.3** (Opcional) Setear `COMPROBANTES_EXPORT_MAX` bajo y verificar el error de cap excedido.
