# Tasks: documento-fisico-asociacion-post-contabilizado

> Fase: tasks
> Modo: Strict TDD — tests primero, luego implementación. Nunca buildear.
> Todos los comandos corren desde `backend/`.

---

## 0. Pre-flight (lectura obligatoria, sin código)

- [x] 0.1 Leer `docs/claude/dominio-contable.md` (§4.3 edición post-CONTABILIZADO, §4.4 period lock, sección documentos físicos) y `docs/claude/antipatrones.md` (smells contables, Anti-14/17 sobre asientos automáticos, Anti-22/23 si se tocara schema — no aplica aquí).
- [x] 0.2 Confirmar con orquestador/usuario la **decisión de auditoría D8 opción (A)** (sin trigger sobre `comprobante_documento_fisico`). → CONFIRMADO (A) por el usuario el 2026-05-29: solo `auditedTx`, sin trigger, sin migración.

## 1. Errores de dominio (RED → impl trivial)

- [x] 1.1 Test unit: `comprobantes/domain/comprobante-errors.spec.ts` — agregar caso para `ComprobanteDocumentoAsociacionPeriodoCerradoError`: code `COMPROBANTE_DOCUMENTO_ASOCIACION_PERIODO_CERRADO`, httpStatus 409, details `{ comprobanteId, periodoFiscalId, periodoStatus }`.
- [x] 1.2 Impl: agregar la clase en `comprobantes/domain/comprobante-errors.ts` extendiendo `ConflictError`, con comentario de trazabilidad (§4.3/§4.4).
- [x] 1.3 Verificar: `pnpm exec jest src/comprobantes/domain/comprobante-errors.spec.ts`

## 2. Helpers compartidos en el service (RED primero)

- [x] 2.1 Test unit en `comprobantes/comprobantes.service.spec.ts`: `resolverContextoEdicionPostContabilizado` — (a) sin `edit-posted` lanza `SinPermisoEditarContabilizadoError`; (b) comprobante anulado lanza `ComprobanteAnuladoNoEditableError`; (c) estado BLOQUEADO lanza `ComprobanteEstadoNoEditableContabilizadoError`; (d) CONTABILIZADO con permiso devuelve `{ reaperturaId? }` resolviendo `periodos.obtenerReaperturaActiva`.
- [x] 2.2 Test unit: `validarPeriodoEditablePostContabilizadoEnTx` — período ABIERTO pasa; CERRADO/BLOQUEADO sin reapertura lanza `ComprobanteDocumentoAsociacionPeriodoCerradoError`; CERRADO con reapertura pasa.
- [x] 2.3 Impl: extraer ambos helpers privados en `comprobantes.service.ts` (reutilizando `this.rbac.hasPermission`, `validarEstadoParaEditar`, `this.periodos.obtenerReaperturaActiva`, `this.periodos.obtenerPorFecha`). Mocks de ports en el spec (nunca Prisma).
- [x] 2.4 Verificar: `pnpm exec jest src/comprobantes/comprobantes.service.spec.ts`

## 3. `asociarDocumentos` — rama CONTABILIZADO (RED → GREEN)

- [x] 3.1 Test unit (service spec, ports mockeados) cubriendo: E-A-12 (+), E-A-13 (− sin permiso), E-A-14/E-A-15 (− período cerrado/bloqueado), E-A-16 (+ reapertura), E-A-17 (− ya contabilizado en otro → `DocumentoFisicoYaAsociadoAOtroContabilizadoError`), E-A-18 (− anulado), E-A-19 (+ BORRADOR retrocompat sin edit-posted), E-A-20 (+ idempotencia CONTABILIZADO). Verificar que la rama CONTABILIZADO llama `auditedTx.run` con `{ userId, reaperturaId? }` y que `comprobanteEstado` pasado a `asociar` es `CONTABILIZADO`.
- [x] 3.2 Impl: bifurcar `asociarDocumentos` por estado (D1/D3). Agregar `userId` a la firma. Rama BORRADOR: mantener lógica, pero pasar `comprobanteEstado: comp.estado` (eliminar hardcode `BORRADOR`, REQ-A-13). Rama CONTABILIZADO: helpers + `auditedTx.run` + `idsYaAsociadosAContabilizado` + insert con `comprobanteEstado: CONTABILIZADO`.
- [x] 3.3 Verificar: `pnpm exec jest src/comprobantes/comprobantes.service.spec.ts`

## 4. `desasociarDocumento` — rama CONTABILIZADO (RED → GREEN)

- [x] 4.1 Test unit cubriendo: E-A-21 (+), E-A-22 (− sin permiso), E-A-23 (− período cerrado), E-A-24 (+ BORRADOR retrocompat). Verificar `auditedTx.run` y desasociar dentro de la TX.
- [x] 4.2 Impl: bifurcar `desasociarDocumento` por estado (D4). Agregar `userId` a la firma. Rama CONTABILIZADO: helpers + `auditedTx.run` + `asociacionRepo.desasociar(..., tx)`.
- [x] 4.3 Verificar: `pnpm exec jest src/comprobantes/comprobantes.service.spec.ts`

## 5. Controller — propagar userId (sin lógica de negocio)

- [x] 5.1 Impl: en `comprobantes.controller.ts`, pasar el `userId` (de `req`) a `service.asociarDocumentos(...)` y `service.desasociarDocumento(...)`. Mantener los `@RequirePermissions('contabilidad.documentos-fisicos.update','contabilidad.asientos.update')` (D9). Actualizar el `@ApiOperation` summary (ya no es "solo BORRADOR").
- [x] 5.2 Verificar typecheck: `pnpm exec tsc --noEmit -p tsconfig.json`

## 6. Integración adapter Prisma (Postgres real)

- [x] 6.1 Test integración en el `*.integration.spec.ts` del adapter de asociación: insertar asociación con `comprobanteEstado=CONTABILIZADO` y verificar que un segundo INSERT del mismo `documentoFisicoId` en otro comprobante CONTABILIZADO viola el índice parcial → el adapter mapea `P2002` a `DocumentoFisicoYaAsociadoAOtroContabilizadoError` (o el DomainError que ya use). Verificar que con `comprobanteEstado=BORRADOR` el segundo INSERT SÍ se permite (REQ-A-05).
- [x] 6.2 Test integración: `refrescarEstadoComprobante` / `asociar` persisten el `comprobanteEstado` correcto (lectura post-insert).
- [x] 6.3 Verificar: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" pnpm exec jest src/comprobantes/ src/documentos-fisicos/` (requiere `docker compose up -d postgres redis`).

## 7. E2E (HTTP full stack)

- [x] 7.1 Test e2e en `test/`: golden paths y negativos clave — E-A-12 (200 asociar a contabilizado), E-A-13 (403 sin edit-posted), E-A-14 (409 período cerrado), E-A-16 (200 con reapertura), E-A-17 (409 ya contabilizado en otro), E-A-21 (204 desasociar de contabilizado), E-A-22 (403), E-A-23 (409). Reusar las factories/fixtures existentes de comprobantes + documentos-fisicos.
- [x] 7.2 Verificar: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/ --runInBand --forceExit`

## 8. Limpieza y cierre

- [x] 8.1 Grep huérfanos: `ComprobanteNoEsBorradorError` y `ComprobanteDocumentoNoDesasociableContabilizadoError` — si ya no se referencian fuera de su definición/tests, decidir eliminación en commit separado (no en este change salvo que sea trivial).
- [x] 8.2 Actualizar el JSDoc de `asociarDocumentos`/`desasociarDocumento` (hoy citan §4.3 con lectura vieja "inmutable") al modelo nuevo.
- [x] 8.3 Suite completa unit+integración: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" pnpm exec jest src/`
- [x] 8.4 Typecheck + lint: `pnpm exec tsc --noEmit -p tsconfig.json` && `pnpm run lint`
- [x] 8.5 NO buildear. Commit conventional: `feat(comprobante): permitir asociar/desasociar documentos físicos en CONTABILIZADO con período abierto`. Sin Co-Authored-By.

---

## Verificación final (checklist de aceptación)

- [x] Rama BORRADOR de asociar/desasociar: comportamiento idéntico al previo (E-A-19, E-A-24 verdes).
- [x] `comprobanteEstado` se persiste con el estado real (sin hardcode), verificado contra Postgres.
- [x] Unicidad 1-doc:1-CONTABILIZADO enforzada en service (pre-val) Y BD (índice parcial), verificada con concurrencia simulada en integración.
- [x] `edit-posted` exigido solo en rama CONTABILIZADO, verificado en service y e2e.
- [x] Período cerrado/bloqueado/anulado rechazado con codes estables.
- [x] Reapertura activa habilita la operación y propaga `reaperturaId` al audit context.
- [x] Sin migración Prisma (confirmado). Decisión de auditoría D8 documentada y confirmada.
