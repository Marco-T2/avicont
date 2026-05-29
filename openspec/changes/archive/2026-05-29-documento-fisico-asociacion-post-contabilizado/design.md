# Design: documento-fisico-asociacion-post-contabilizado

> Fecha: 2026-05-29
> Fase: design
> Proyecto: avicont

---

## 1. Contexto técnico verificado (citas leídas)

- `comprobantes.service.ts:817-876` `asociarDocumentos`: usa `prisma.$transaction` directo (NO `auditedTx`). Gate duro `comp.estado !== BORRADOR → ComprobanteNoEsBorradorError` (827-829). Persiste con `comprobanteEstado: EstadoComprobante.BORRADOR` HARDCODEADO (línea 868) — bug latente.
- `comprobantes.service.ts:884-898` `desasociarDocumento`: lee sin TX (`this.repo.findById` sin `tx`). Gate duro `!== BORRADOR → ComprobanteDocumentoNoDesasociableContabilizadoError`. Llama `asociacionRepo.desasociar` sin TX.
- `comprobantes.service.ts:476-666` `editarContabilizado`: ES EL PATRÓN. Verifica `edit-posted` vía `this.rbac.hasPermission` (484-491) → `SinPermisoEditarContabilizadoError`. Lee pre-TX, `validarEstadoParaEditar` (498), resuelve `this.periodos.obtenerReaperturaActiva` (514), corre `this.auditedTx.run({ userId, motivo?, reaperturaId? }, ...)`. Dentro de la TX re-lee, valida estado, valida período con `this.periodos.obtenerPorFecha(..., tx)` y `status !== ABIERTO && !reapertura → ComprobanteEditarContabilizadoEnPeriodoCerradoError` (552).
- `comprobantes.service.ts:402-421` flujo `contabilizar`: ya hace `asociacionRepo.listarPorComprobante` → `documentosFisicosReader.idsYaAsociadosAContabilizado(tenantId, ids, comprobanteId, tx)` → si hay match `throw DocumentoFisicoYaAsociadoAOtroContabilizadoError(primerYaContabilizado)` → luego `asociacionRepo.refrescarEstadoComprobante(tenantId, id, CONTABILIZADO, tx)`. **Esta es la lógica reutilizable.**
- `comprobantes.service.ts:790-799` `validarEstadoParaEditar(id, estado, anulado)`: helper privado. `anulado → ComprobanteAnuladoNoEditableError`; `estado !== CONTABILIZADO → ComprobanteEstadoNoEditableContabilizadoError`.
- `audited-transaction.runner.ts`: `run({ userId, motivo?, reaperturaId? }, fn)` setea `app.audit_user_id`, `app.audit_motivo`, `app.audit_reapertura_id`, `app.audit_during_reopening` vía `set_config(..., true)` (SET LOCAL). userId obligatorio.
- `asociacion-comprobante.repository.port.ts`: `asociar(tenantId, { comprobanteId, documentoFisicoId, comprobanteEstado }, tx?)`, `desasociar(tenantId, comprobanteId, docId, tx?)`, `refrescarEstadoComprobante(tenantId, comprobanteId, nuevoEstado, tx?)`, `listarPorComprobante(tenantId, comprobanteId, tx?)`. El adapter mapea `P2002` del índice parcial a un `DomainError`.
- `PeriodosReaderPort` (`@/periodos-fiscales/ports/periodos-reader.port`): provee `obtenerPorFecha(tenantId, fecha, tx?)` y `obtenerReaperturaActiva(tenantId, periodoFiscalId)`.
- `schema.prisma:928-960` `ComprobanteDocumentoFisico` con `comprobanteEstado EstadoComprobante`. Índice parcial raw SQL `comprobante_documento_fisico_unique_contabilizado ... WHERE comprobanteEstado='CONTABILIZADO'` (§11.6).
- Controller `comprobantes.controller.ts:174-209`: ambos endpoints piden `@RequirePermissions('contabilidad.documentos-fisicos.update', 'contabilidad.asientos.update')`. `edit-posted` NO está en el decorator — igual que en `editarContabilizado`, se verifica en el service.

## 2. Decisiones de diseño

### D1 — Bifurcación por estado dentro del service (no dos métodos públicos)

`asociarDocumentos` y `desasociarDocumento` mantienen su firma pública. Internamente bifurcan según el estado leído del comprobante:

- **BORRADOR** → rama actual intacta (sin `edit-posted`, `prisma.$transaction` directo, `comprobanteEstado = BORRADOR`).
- **CONTABILIZADO** → rama nueva con blindaje §4.3.
- **otro estado** (BLOQUEADO) o **anulado** → reusar la semántica de `validarEstadoParaEditar` para rechazar (`ComprobanteAnuladoNoEditableError` / estado no editable).

Razón: el endpoint es el mismo; el caller no sabe ni debe saber el estado de antemano. La bifurcación es responsabilidad del dominio.

### D2 — Helper compartido de "validar editable post-contabilizado"

Extraer un helper privado reutilizable por `editarContabilizado` y por las dos ramas CONTABILIZADO de asociación. Propuesta: `private async resolverContextoEdicionPostContabilizado(tenantId, userId, comprobante, tx?)` que:

1. Verifica permiso `edit-posted` (lanza `SinPermisoEditarContabilizadoError`).
2. Llama `validarEstadoParaEditar(id, estado, anulado)`.
3. Resuelve `obtenerReaperturaActiva` y devuelve `{ reaperturaId? }`.

Y un helper de validación de período DENTRO de la TX: `private async validarPeriodoEditablePostContabilizadoEnTx(tenantId, fechaContable, reapertura, tx)` que reusa la lógica de líneas 544-557 (`obtenerPorFecha` + `status !== ABIERTO && !reapertura → error`). Para asociación, el error específico es `ComprobanteDocumentoAsociacionPeriodoCerradoError` (code nuevo) en vez de `ComprobanteEditarContabilizadoEnPeriodoCerradoError`, para que el mensaje al usuario sea preciso. ALTERNATIVA evaluada: reutilizar el mismo error de editarContabilizado — descartada porque el mensaje ("no se puede editar el comprobante") no describe la operación de asociación. Decisión: code propio, misma mecánica.

**Trade-off**: el refactor de `editarContabilizado` para usar los helpers es OPCIONAL y de bajo riesgo; si se hace, debe quedar verde toda la suite existente de `editarContabilizado`. Recomendación: extraer los helpers y hacer que asociación los use; el refactor de `editarContabilizado` para consumirlos puede ser un commit aparte si introduce ruido. Mínimo viable: helpers nuevos consumidos por asociación, sin tocar `editarContabilizado`.

### D3 — Rama CONTABILIZADO de `asociarDocumentos` (pseudo-flujo)

```
asociarDocumentos(tenantId, comprobanteId, ids):
  if ids.empty: return []
  comp = repo.findById(tenantId, comprobanteId)        # pre-TX, sin lock
  if !comp: throw ComprobanteNoEncontradoError
  if comp.estado === BORRADOR:
     return <rama BORRADOR actual, sin cambios salvo comprobanteEstado=BORRADOR explícito>
  # rama CONTABILIZADO
  ctx = resolverContextoEdicionPostContabilizado(tenantId, userId, comp)   # edit-posted + estado + reapertura
  return auditedTx.run({ userId, reaperturaId?: ctx.reaperturaId }, async tx => {
     compTx = repo.findById(tenantId, comprobanteId, tx)        # re-lee en TX
     validarEstadoParaEditar(compTx.id, compTx.estado, compTx.anulado)
     validarPeriodoEditablePostContabilizadoEnTx(tenantId, FechaContable.fromDbDate(compTx.fechaContable), ctx.reapertura, tx)
     docMap = documentosFisicosReader.obtenerBatchParaAsociar(tenantId, ids, tx)   # existencia + tipo compatible (REQ-A-11)
     <validar existencia + tiposComprobanteAplicables, igual que rama BORRADOR>
     ya = asociacionRepo.listarPorComprobante(tenantId, comprobanteId, tx)
     idsAInsertar = dedup(ids) - ya                              # idempotencia
     # REQ-A-06: unicidad inmediata (reuso de la lógica de contabilizar)
     yaContab = documentosFisicosReader.idsYaAsociadosAContabilizado(tenantId, idsAInsertar, comprobanteId, tx)
     if yaContab.first: throw DocumentoFisicoYaAsociadoAOtroContabilizadoError(yaContab.first)
     for id in idsAInsertar:
        asociacionRepo.asociar(tenantId, { comprobanteId, documentoFisicoId: id, comprobanteEstado: CONTABILIZADO }, tx)
  })
```

`userId` debe entrar como parámetro: **cambio de firma** de `asociarDocumentos`/`desasociarDocumento` para recibir `userId` (hoy solo reciben `tenantId, comprobanteId, ids`). El controller ya tiene `req` con el usuario autenticado (igual que `editarContabilizado` recibe `userId`). Esto NO rompe la rama BORRADOR (el `userId` simplemente no se usa ahí, salvo que se decida auditar también borradores — fuera de scope).

### D4 — Rama CONTABILIZADO de `desasociarDocumento` (pseudo-flujo)

Simétrico: pre-TX leer comp; si BORRADOR → rama actual; si CONTABILIZADO → `resolverContextoEdicionPostContabilizado` + `auditedTx.run` + re-lee + `validarEstadoParaEditar` + `validarPeriodoEditablePostContabilizadoEnTx` + `asociacionRepo.desasociar(tenantId, comprobanteId, docId, tx)`. No requiere chequeo de unicidad (desasociar nunca crea conflicto). No re-numera nada.

### D5 — Cache `comprobanteEstado` (REQ-A-13)

La rama BORRADOR pasa `comprobanteEstado: BORRADOR` (ya hoy, pero hoy está hardcodeado: dejarlo EXPLÍCITO leyendo `comp.estado`). La rama CONTABILIZADO pasa `comprobanteEstado: CONTABILIZADO`. Mejor: pasar siempre `comprobanteEstado: comp.estado` (el estado real leído en TX), eliminando el hardcode. Esto es PREREQUISITO del invariante de unicidad: el índice parcial solo aplica a filas con `comprobanteEstado='CONTABILIZADO'`; si una asociación a un CONTABILIZADO se insertara con `BORRADOR` (bug actual), el índice NO la protegería y dos comprobantes contabilizados podrían compartir el documento. **Test de integración obligatorio** que verifique este caso contra Postgres real.

### D6 — Validación de unicidad reutilizada (REQ-A-06)

Reusar `documentosFisicosReader.idsYaAsociadosAContabilizado(tenantId, ids, comprobanteId, tx)` — el mismo método que usa `contabilizar`. Excluye al propio `comprobanteId` (param 3), así re-asociar a uno mismo no se autodetecta. El índice parcial sigue siendo la última línea de defensa: el adapter `asociar` mapea `P2002` al `DomainError` (riesgo heredado: el adapter no tiene el `numero` real en el contexto del P2002 — la pre-validación lanza con datos completos; el P2002 es solo el backstop bajo race).

### D7 — Errores

NUEVO en `comprobantes/domain/comprobante-errors.ts`:
- `ComprobanteDocumentoAsociacionPeriodoCerradoError extends ConflictError`, code `COMPROBANTE_DOCUMENTO_ASOCIACION_PERIODO_CERRADO`, 409. Detalles: `{ comprobanteId, periodoFiscalId, periodoStatus }`.

REUSO: `SinPermisoEditarContabilizadoError` (ForbiddenError), `ComprobanteAnuladoNoEditableError`, `ComprobanteEstadoNoEditableContabilizadoError` (para BLOQUEADO), `DocumentoFisicoYaAsociadoAOtroContabilizadoError`, `ComprobanteNoEncontradoError`, `DocumentoFisicoReferenciadoNoExisteError`, `TipoDocumentoIncompatibleConComprobanteError`.

`ComprobanteNoEsBorradorError` y `ComprobanteDocumentoNoDesasociableContabilizadoError`: dejan de lanzarse en la rama CONTABILIZADO+período abierto. Decisión: NO eliminarlos (evita romper otros consumidores / tests que los importen); revisar si quedan huérfanos al final y, si lo están, eliminarlos en un commit de limpieza separado. Verificar con grep en apply.

### D8 — Auditoría (REQ-A-14) — trade-off documentado

**Hallazgo verificado**: los triggers `trg_audit_comprobantes` (sobre `comprobantes`) y `trg_audit_lineas_comprobante` (sobre `lineas_comprobante`) NO cubren la tabla `comprobante_documento_fisico` (§11.6, migration `20260527190718_*`). Por tanto un INSERT/DELETE en la tabla de asociación **no** genera fila en `comprobantes_audit`.

Opciones:
- **(A) Mínimo (RECOMENDADO para esta entrega)**: correr la operación dentro de `auditedTx` para establecer el actor en la sesión. NO se agrega trigger sobre `comprobante_documento_fisico`. Justificación: la asociación de un documento físico es metadata de respaldo, no afecta partida doble, montos ni numeración; el nivel de auditoría exigido por §4.3 aplica a cabecera+líneas (lo que mueve dinero). Avicont es PyME con control interno (§10.9), no auditoría externa rígida. Costo: no queda traza inmutable de "quién adjuntó/quitó qué papel y cuándo".
- **(B) Completo**: agregar un trigger `trg_audit_comprobante_documento_fisico` que escriba en `comprobantes_audit` (o una tabla `comprobante_documento_fisico_audit`) en INSERT/DELETE, leyendo el contexto de sesión que ya setea `auditedTx`. Costo: migration con raw SQL (rompe el out-of-scope "sin migración"), nueva entrada en la lista §11.6, más superficie de test.

**Decisión CONFIRMADA por el usuario (2026-05-29)**: **(A)** para esta entrega — solo `auditedTx` (registra actor/motivo/reapertura en la sesión Postgres durante la TX). NO se crea trigger sobre `comprobante_documento_fisico`. NO hay migración. Si en el futuro se quiere traza inmutable completa de adjuntos post-contabilización, se trata como cambio separado (requiere migration y entra en §11.6). Documentar explícitamente en el PR.

### D9 — Permisos en controller

Mantener `@RequirePermissions('contabilidad.documentos-fisicos.update', 'contabilidad.asientos.update')` en ambos endpoints (cubre BORRADOR y es el piso de CONTABILIZADO). `edit-posted` se verifica en el service SOLO en la rama CONTABILIZADO (igual que `editarContabilizado` no lo pone en el decorator). Razón: el decorator es estático, no conoce el estado del comprobante en runtime; meter `edit-posted` en el decorator rompería la rama BORRADOR (exigiría un permiso que el contador de borradores no necesita).

## 3. Transaccionalidad y cicatriz F-03

La validación de período DEBE ocurrir dentro de la TX (`auditedTx.run`), re-leyendo el comprobante con `tx` y consultando `periodos.obtenerPorFecha(..., tx)`. Igual que `editarContabilizado` (no usa `FOR UPDATE` explícito sobre el período; el patrón vigente del módulo es re-leer-en-TX + validar status, suficiente para esta operación que no cambia el período). NO introducir un `FOR UPDATE` nuevo si `editarContabilizado` no lo hace — mantener consistencia con el patrón existente. La ventana de race con un cierre concurrente es la misma que ya acepta `editarContabilizado`; si se quisiera endurecer, sería un cambio transversal a todo el módulo, fuera de scope.

## 4. Migración Prisma — NO se necesita

JUSTIFICACIÓN:
- `ComprobanteDocumentoFisico` ya existe con `comprobanteEstado EstadoComprobante`.
- El índice parcial `comprobante_documento_fisico_unique_contabilizado` ya enforza el invariante de unicidad (§11.6, raw SQL vivo).
- El bug del hardcode `comprobanteEstado = BORRADOR` es código de aplicación, no schema.
- Los errores nuevos son clases TS, no enums de BD.
- La auditoría opción (A) no toca schema.

→ **NO hay migración**. Si el usuario eligiera la opción (B) de auditoría, ESA sí requeriría migration (trigger raw SQL + entrada §11.6) — pero está fuera del scope acordado.

## 5. Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| Unicidad bajo concurrencia (dos asociaciones al mismo doc a dos CONTABILIZADOS) | Pre-validación `idsYaAsociadosAContabilizado` + índice parcial en BD + mapeo P2002 en adapter. Test de integración con dos inserts. |
| Cache `comprobanteEstado` mal escrito → índice no protege | Eliminar hardcode, pasar `comp.estado` real. Test de integración que verifica el valor persistido. |
| Cambio de firma `asociarDocumentos`/`desasociarDocumento` (agregar `userId`) | Actualizar el único caller (controller) + specs. La rama BORRADOR no usa userId (salvo auditoría futura). |
| Romper consumidores de los errores deprecados | Grep antes de eliminar; no eliminar en este change, marcar como huérfanos si aplica. |
| Refactor de `editarContabilizado` para usar helpers introduce regresión | Mínimo viable: helpers consumidos solo por asociación. Refactor de editarContabilizado opcional/separado. |
| Auditoría insuficiente (opción A) | Documentar trade-off; confirmar con usuario; opción B disponible como follow-up. |
