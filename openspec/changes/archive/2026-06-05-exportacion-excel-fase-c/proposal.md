# Proposal: Exportación a Excel — Fase C (Listado de Comprobantes)

> Artifact store: hybrid
> Topic key: `sdd/exportacion-excel-fase-c/proposal`
> Fecha: 2026-06-05
> Cierra la capability `exportacion-excel`. Fase 3 de 3 (A → B → C). Sigue a la Fase B (PR #180, commit `8d528bf`).

## Intent

Las **Fases A y B** llevaron a Excel los 4 informes contables que ya se renderizan en el frontend
sobre JSON tipado ya cacheado (Libro Diario, Libro Mayor, Balance General, Estado de Resultados).
En todos ellos el dataset completo YA estaba en el cache de TanStack Query (los informes no paginan;
están acotados server-side por env), así que el export fue **frontend-puro sobre la `data` en cache**.

La **Fase C** cierra el ciclo con el **listado de comprobantes**. Acá hay una diferencia
arquitectónica de fondo: el listado de comprobantes **SÍ pagina** (`GET /api/comprobantes` con
`page`/`limit`, default 20). El cache solo tiene la **página visible**, no el rango filtrado completo.
Exportar "todo lo que matchea los filtros" obliga a **traer el dataset completo sin paginar**, y eso
requiere un **endpoint backend nuevo** `GET /api/comprobantes/export` que reusa los mismos filtros del
listado, sin `page`/`limit`, con un cap defensivo. Es la primera fase del export con backend.

Decisión de producto (Marco, INMUTABLE — ver engram `sdd/exportacion-excel-fase-c/decision-producto`):
**un solo botón** "Exportar a Excel" que baja TODAS las filas del rango filtrado (NO "página actual",
NO export de detalle individual). "Página actual" se descartó porque exporta un corte arbitrario de
paginación sin significado contable.

Lo que desbloquea: con Fase C cerrada, los 5 datasets contables del frontend (4 informes + listado de
comprobantes) exportan a Excel con cabecera fiscal. La capability `exportacion-excel` queda completa.

## Scope

### In Scope

**Backend (módulo `comprobantes/`, hexagonal §3):**
- **Endpoint nuevo** `GET /api/comprobantes/export` en `ComprobantesController`. Gateado por
  `contabilidad.asientos.read` (mismo permiso que `GET /api/comprobantes`). Reusa los filtros del
  listado SIN paginación: `periodoFiscalId`, `tipo`, `estado`, `q`, `incluirAnulados`.
- **Nuevo `ExportarComprobantesQueryDto`** = el `ListarComprobantesQueryDto` SIN `page`/`limit`
  (conserva `fechaDesde`/`fechaHasta` en el DTO por consistencia con `ListarFiltros`, aunque la UI
  hoy no los expone — el endpoint los soporta gratis).
- **Nuevo método en el port** `ComprobanteRepositoryPort.listarParaExport(tenantId, filtros): Promise<ComprobanteListRow[]>`
  — sin pagination, sin `total`. Reusa el tipo `ListarFiltros` y `ComprobanteListRow` existentes.
- **Adapter Prisma** `PrismaComprobanteRepository.listarParaExport`: `findMany` SIN `skip`/`take`,
  con el mismo `LIST_INCLUDE` y el **mismo WHERE** que `listar` (Anti-31 `organizationId: tenantId`
  + `incluirAnulados` + filtros), pero **orden cronológico ASCENDENTE**:
  `orderBy: [{ fechaContable: 'asc' }, { numero: { sort: 'asc', nulls: 'last' } }]`
  (DISTINTO del listado, que ordena DESC con NULLS FIRST).
- **Cap de seguridad** `COMPROBANTES_EXPORT_MAX` (env, default 1000) leído en el service vía
  `ConfigService`. El service hace un `count` previo y, si supera el cap, lanza un `DomainError`
  con code estable (patrón idéntico a `LIBRO_DIARIO_MAX_ASIENTOS` / `RangoExcedeLimiteError`).
- **Nuevo método service** `ComprobantesService.exportar(tenantId, query)`: arma `ListarFiltros`,
  cuenta (reusa el WHERE), valida cap, llama `listarParaExport`, mapea con el `toComprobanteListItem`
  existente. Devuelve `{ items: ComprobanteListItemDto[] }` (sin page/limit/total).
- **Nuevo `ExportarComprobantesResponseDto`** = `{ items: ComprobanteListItemDto[] }` (reusa el
  `ComprobanteListItemDto` ya existente — trae todos los campos de las 9 columnas). Endpoint
  decorado con `@ApiOkResponse({ type: ExportarComprobantesResponseDto })`.
- **Error de count para count**: nuevo método `count` en el port (o reuso del WHERE). Ver design §3.
- **Regeneración de contrato**: `pnpm run openapi:dump` (backend) + `pnpm run gen:api-types`
  (frontend) commiteados. El job CI `contract-drift` rompe el build si no.
- **Tests backend**: integration del adapter (`*.integration.spec.ts`, Postgres real: orden ASC,
  sin paginar, Anti-31 aislamiento por tenant, incluirAnulados, filtros) + unit del service (cap
  excedido lanza DomainError, cap no excedido pasa, filtros pasados al port, count previo) + e2e del
  endpoint si aplica (403 sin permiso, 200 con permiso, cap → error mapeado).

**Frontend (feature `comprobantes/`):**
- **Nuevo `api/export-comprobantes.ts`**: `exportComprobantes(params)` → `GET /api/comprobantes/export`
  (los mismos params del listado, sin page/limit). A diferencia de Fase A/B, el export **FETCHEA
  on-demand** (el cache solo tiene la página visible), no consume `data` cacheada.
- **Nuevo `lib/exportar-comprobantes.ts`**: `mapearComprobantesAFilas(items, perfil): Celda[][]`
  (función pura, testeable sin render). 9 columnas en orden: Fecha, Número, Tipo, Documento respaldo,
  Nro. Ref., Contacto, Glosa, Estado, Total BOB. Reusa `armarCabeceraFiscal` + `formatearFechaCelda`.
- **Nuevo `components/boton-exportar-comprobantes.tsx`**: `PermissionButton` gateado por
  `PERMISSIONS.contabilidad.asientos.read`, con estado "Generando…" (Anti-F-07). Al click: fetchea el
  rango con los filtros activos, mapea, construye hoja, descarga. Recibe los filtros activos + perfil.
- **`ComprobantesPage`** monta el botón en el header (al lado de "Nuevo comprobante") + consume
  `useEmpresa()` para la cabecera fiscal, y le pasa los filtros activos de la URL.
- **Tests Vitest** (describe/it en español): mapeo a `Celda[][]` (9 columnas, arrays concatenados con
  " / ", borrador sin número → celda vacía, anulado → "Anulado" en Estado, cabecera fiscal con campos
  null, monto string §4.5, fecha §4.6) + gating/estado del botón.

### Out of Scope (explícito)

- **Export de "página actual"** (frontend-puro sobre la página cacheada): DESCARTADO por Marco.
  Un solo botón que baja todo el rango filtrado.
- **Export de detalle individual de un comprobante** (líneas del asiento): fuera de scope.
- **Filtro de fechas libre** (`fechaDesde`/`fechaHasta`) en la UI de comprobantes: la UI filtra por
  `periodoFiscalId`, no por rango suelto. El DTO los conserva (el backend ya los soporta), pero NO se
  agregan controles de UI. "Todo el rango filtrado" = lo que matchea los filtros actuales de la UI
  (tipo, estado, periodoFiscalId, q, incluirAnulados).
- **Export a PDF** (no pedido).
- **Estilos ricos** (logo, merge, freeze panes): cabecera fiscal + formato numérico es suficiente.
- **Nueva dependencia**: NO se agrega ninguna. `write-excel-file` ya está instalada (Fase A).
- **Cambiar el render en pantalla del listado** (la tabla existente no se toca).
- **Cruzar a `reportes/`**: el endpoint vive en `comprobantes/`. El listado sin paginar es la misma
  proyección que el paginado — no agrega, no calcula saldos. `reportes/` es para informes con
  agregación (Libro Diario/Mayor, EE.FF.).

## Capabilities

### Modified Capabilities

- `exportacion-excel`: se ADICIONAN los requisitos del export de comprobantes (endpoint backend sin
  paginar + cap + orden ASC + mapeo a Excel del listado). NO contradice los requisitos de Fase A/B
  (frontend-puro): introduce el primer requisito CON backend para esta capability, justificado por la
  paginación del listado.
- `comprobantes` (backend): se agrega el endpoint de export como superficie nueva del módulo.

## Approach (alto nivel)

1. **Backend primero (TDD), de adentro hacia afuera**: port → adapter (integration RED→GREEN) →
   service (unit del cap + filtros) → controller + DTOs → `@ApiOkResponse` → `openapi:dump`.
2. **El adapter reusa TODO el WHERE de `listar`** (Anti-31 + incluirAnulados + filtros): se extrae
   el armado del WHERE a un helper privado compartido entre `listar` y `listarParaExport` para no
   duplicar la lógica de aislamiento por tenant (riesgo de drift de seguridad). Lo único distinto:
   sin `skip`/`take`, orden ASC con NULLS LAST. El count del cap usa el mismo WHERE.
3. **El cap espeja `LibroDiarioService`**: env `COMPROBANTES_EXPORT_MAX` (default 1000) leído en el
   constructor vía `ConfigService`; `count` previo; si `> cap` → `DomainError`. Code estable
   `COMPROBANTE_EXPORT_RANGO_EXCEDIDO` (formato `{MODULO}_{SUBDOMINIO}_{CONDICION}`).
4. **El DTO de response reusa `ComprobanteListItemDto`** tal cual — ya expone todos los campos de las
   9 columnas. NO se crea un DTO de fila nuevo. Solo se crea el wrapper `ExportarComprobantesResponseDto`
   `{ items }` para que el endpoint quede tipado en OpenAPI.
5. **Frontend espeja la estructura de Fase A/B** (`lib/exportar-*.ts` puro + `components/boton-*.tsx`),
   con la diferencia de que **fetchea on-demand** en vez de consumir cache (api nuevo
   `export-comprobantes.ts`). La página le pasa los filtros activos de la URL + `useEmpresa()`.
6. **Las 9 columnas**: arrays (`contactos[]`, `documentosRespaldo[]`) se concatenan en una celda con
   separador `" / "`. "Documento respaldo" = los `tipoNombre` concatenados; "Nro. Ref." = los `numero`
   concatenados. BORRADOR (`numero === null`) → celda vacía. Anulado → "Anulado" en columna Estado
   (patrón `exportar-libro-diario.ts`).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/comprobantes/ports/comprobante.repository.port.ts` | Modified | Nuevo método `listarParaExport` + (si aplica) `contarParaExport`/`count` |
| `backend/src/comprobantes/adapters/prisma-comprobante.repository.ts` | Modified | Implementa `listarParaExport` (findMany sin skip/take, orden ASC NULLS LAST); extrae helper de WHERE compartido con `listar` |
| `backend/src/comprobantes/dto/listar-comprobantes.dto.ts` | Modified | Nuevo `ExportarComprobantesQueryDto` (sin page/limit) |
| `backend/src/comprobantes/dto/comprobante-response.dto.ts` | Modified | Nuevo `ExportarComprobantesResponseDto` `{ items: ComprobanteListItemDto[] }` |
| `backend/src/comprobantes/domain/comprobante-errors.ts` | Modified | Nuevo `ComprobanteExportRangoExcedidoError extends InvalidStateError` |
| `backend/src/comprobantes/comprobantes.service.ts` | Modified | Nuevo método `exportar`; lee `COMPROBANTES_EXPORT_MAX` por `ConfigService` (inyectar si falta) |
| `backend/src/comprobantes/comprobantes.controller.ts` | Modified | Nuevo `GET export` + `@ApiOkResponse` |
| `backend/openapi.json` | Modified | Regenerado (`openapi:dump`) |
| `frontend/src/types/api.generated.ts` + `types/api.ts` | Modified | Regenerado (`gen:api-types`) + alias del nuevo response/params |
| `frontend/src/features/comprobantes/api/export-comprobantes.ts` | New | Fetch on-demand del export |
| `frontend/src/features/comprobantes/lib/exportar-comprobantes.ts` | New | Mapeo `ComprobanteListItem[]` → `Celda[][]` (9 cols) + test |
| `frontend/src/features/comprobantes/components/boton-exportar-comprobantes.tsx` | New | Botón gateado (`contabilidad.asientos.read`), fetch + descarga |
| `frontend/src/features/comprobantes/components/comprobantes-page.tsx` | Modified | Monta el botón + `useEmpresa()` + pasa filtros activos |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Drift de seguridad: `listarParaExport` olvida el `organizationId: tenantId` (Anti-31, bug de seguridad §4.2) | **Med** | Extraer el armado del WHERE a un helper privado compartido con `listar`; integration test que crea comprobantes en dos tenants y verifica que el export de uno NO ve los del otro |
| Orden incorrecto: el listado ordena DESC NULLS FIRST; el export va ASC NULLS LAST y es fácil copiar el orden viejo | **Med** | Orden explícito `[{ fechaContable: 'asc' }, { numero: { sort: 'asc', nulls: 'last' } }]`; integration test que assertea el orden cronológico ascendente con borradores (numero NULL) al final |
| Cap no aplicado o aplicado mal (sin count previo, o comparación `>=` vs `>`) | **Med** | Replicar exactamente el patrón `LibroDiarioService` (count previo, `> cap` → error); unit test con cap=2 y 3 filas → error, con 2 filas → OK |
| Sin paginar + dataset grande bloquea el response | **Low** | El cap (default 1000) acota el volumen; el listado es liviano (sin líneas, solo contactos deduplicados + docs); feedback "Generando…" en el botón |
| contract-drift rojo por olvidar regenerar artefactos | **Med** | Tarea explícita de `openapi:dump` + `gen:api-types` ANTES de cerrar; el job CI lo verifica |
| Confusión de columnas "Documento respaldo" vs "Nro. Ref.": NO existe un campo `numeroReferencia` en el modelo — ambas columnas salen de `documentosRespaldo[]` (tipoNombre y numero) | **High** (hallazgo) | Documentado en design §2. "Documento respaldo" = `documentosRespaldo[].tipoNombre` concatenado; "Nro. Ref." = `documentosRespaldo[].numero` concatenado. Sin documentos → celda vacía. Test con 0, 1 y 2 documentos |
| Mapeo de arrays: contacto con varios → cómo concatenar | **Low** | Separador `" / "` documentado; el export concatena TODOS (no usa el "Varios" de la tabla — el Excel sí tiene espacio). Test con 0/1/2 contactos |
| §4.5/§4.6 ya cumplidos en el DTO (`totalDebitoBob` string, `fechaContable` ISO) pero el mapeo Excel debe respetarlos | **Low** | Monto → `CeldaNumero` (boundary string→Number en `construirHoja`); fecha → `formatearFechaCelda` (split sin Date). Tests anti-recálculo y anti-UTC |

## Rollback Plan

Cambio aditivo. Revertir el PR (squash → `git revert <sha>`). El endpoint `GET /api/comprobantes/export`
y el método `listarParaExport` son nuevos — eliminarlos no afecta el listado existente. El frontend
nuevo (api/lib/boton) se elimina; la única modificación a código vivo del frontend es montar el botón +
`useEmpresa()` en `ComprobantesPage` (se quitan las líneas). El helper de WHERE extraído en el adapter
es refactor interno transparente. Regenerar `openapi.json` + `api.generated.ts` tras el revert. Sin
migración, sin cambio de schema.

## Dependencies

- Infra `frontend/src/lib/export-excel/` (ya existe — Fase A/B): `armarCabeceraFiscal`, `construirHoja`,
  `descargarBlob`, `generarNombreArchivo`, `formatearFechaCelda`, `parsearMontoCelda`, tipos `Celda`/`ColumnaHoja`.
- `write-excel-file` (ya instalada — Fase A).
- `useEmpresa()` / `EmpresaPerfil` (ya existe — Fase 1 `datos-empresa`).
- `PermissionButton` + permiso `contabilidad.asientos.read` (ya en el repo y en `PERMISSIONS.*`).
- `ComprobanteListItemDto`, `ListarFiltros`, `ComprobanteListRow`, `toComprobanteListItem` (ya existen
  en `comprobantes/`).
- `ConfigService` (`@nestjs/config`, ya usado por `LibroDiarioService`).
- `LIBRO_DIARIO_MAX_ASIENTOS` / `RangoExcedeLimiteError` como patrón de referencia para el cap.
- Job CI `contract-drift` (ya existe).

## Success Criteria

- [ ] Existe `GET /api/comprobantes/export` en `comprobantes/`, gateado por `contabilidad.asientos.read`,
      que devuelve `{ items: ComprobanteListItemDto[] }` con TODOS los comprobantes que matchean los
      filtros (sin paginar), orden cronológico **ascendente** (`fechaContable ASC`, desempate `numero
      ASC NULLS LAST`).
- [ ] El WHERE del export incluye SIEMPRE `organizationId: tenantId` (Anti-31) y respeta `incluirAnulados`
      (default false), `tipo`, `estado`, `periodoFiscalId`, `q`. Integration test prueba aislamiento por tenant.
- [ ] El cap `COMPROBANTES_EXPORT_MAX` (env, default 1000) se valida con `count` previo; superarlo lanza
      `ComprobanteExportRangoExcedidoError` con code estable. Unit test cubre cap excedido (caso +) y no
      excedido (caso −).
- [ ] El `ComprobanteListItemDto` reutilizado expone `fechaContable` (ISO), `numero` (nullable), `tipo`,
      `documentosRespaldo[]`, `contactos[]`, `glosa`, `estado`, `anulado`, `totalDebitoBob` (string §4.5);
      el endpoint queda tipado con `@ApiOkResponse`.
- [ ] `backend/openapi.json` y `frontend/src/types/api.generated.ts` regenerados y commiteados; job
      `contract-drift` verde.
- [ ] La `ComprobantesPage` tiene un botón "Exportar a Excel" que descarga un `.xlsx` con TODO el rango
      filtrado (no la página), con cabecera fiscal (tolera campos null), deshabilitado con tooltip sin
      permiso (§14.7), con "Generando…" durante el fetch+armado.
- [ ] El `.xlsx` tiene 9 columnas en orden: Fecha, Número, Tipo, Documento respaldo, Nro. Ref., Contacto,
      Glosa, Estado, Total BOB. Arrays concatenados con " / "; BORRADOR sin número → celda vacía; anulado →
      "Anulado" en Estado; fecha `dd/mm/yyyy` sin corrimiento UTC; Total BOB como celda numérica `#,##0.00`.
- [ ] Tests Vitest (describe/it en español) cubren el mapeo (9 columnas, arrays 0/1/2, borrador, anulado,
      cabecera fiscal completa/null, monto §4.5, fecha §4.6) y el botón (gating, estado generando).
- [ ] `tsc -b`/`tsc --noEmit` y `eslint` limpios back+front; cero `any`. Backend: unit + integration + e2e verdes.
