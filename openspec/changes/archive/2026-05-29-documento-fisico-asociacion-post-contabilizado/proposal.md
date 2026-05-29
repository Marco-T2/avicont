# Proposal: documento-fisico-asociacion-post-contabilizado

> Fecha: 2026-05-29
> Fase: proposal
> Proyecto: avicont
> Change name: documento-fisico-asociacion-post-contabilizado
> Spec afectada (delta): documento-fisico

---

## 1. Intent

Permitir **asociar y desasociar documentos físicos a un comprobante CONTABILIZADO mientras su período fiscal esté abierto** (o tenga una reapertura activa), con el mismo blindaje que `editarContabilizado` (§4.3 CLAUDE.md).

## 2. Problema (asimetría no intencional)

La feature de documentos físicos (slice `2026-05-20-documento-fisico`) se construyó bajo el modelo VIEJO donde **CONTABILIZADO = inmutable total**. Por eso:

- `asociarDocumentos` (`comprobantes.service.ts:817`) tiene un gate duro: `if (comp.estado !== BORRADOR) throw ComprobanteNoEsBorradorError` (líneas 827-829).
- `desasociarDocumento` (`comprobantes.service.ts:884`) tiene un gate duro simétrico: `throw ComprobanteDocumentoNoDesasociableContabilizadoError` (líneas 891-896). Su JSDoc cita §4.3 con la lectura VIEJA ("el comprobante ya consumió numeración y es inmutable").

Pero el §4.3 ACTUAL dice lo contrario: un CONTABILIZADO **es editable** (cabecera + líneas) mientras su período esté ABIERTO o haya una `PeriodoFiscalReopening` activa. `editarContabilizado` (`comprobantes.service.ts:476`) ya implementa ese modelo: permiso `contabilidad.asientos.edit-posted`, `auditedTx`, chequeo de período cerrado, resolución de reapertura, número correlativo inmutable.

La asociación de documentos físicos es **parte de la superficie editable de un comprobante**. Hoy quedó fuera de ese modelo por accidente histórico, no por decisión. Un contador que adjuntó la factura equivocada a un asiento ya contabilizado de un mes abierto NO puede corregirlo sin anular el asiento entero — fricción operativa real, contradice §4.3.

## 3. Enfoque elegido — CAMINO 1

Incorporar asociar/desasociar de documentos físicos a la **superficie editable post-CONTABILIZADO del §4.3**:

- `asociarDocumentos` acepta el comprobante en **BORRADOR** (comportamiento actual, sin cambios) **O CONTABILIZADO si su período está abierto / tiene reapertura activa**.
- `desasociarDocumento`, simétrico: permitido en CONTABILIZADO + período abierto.
- En la rama CONTABILIZADO se exige el mismo blindaje que `editarContabilizado`:
  - Permiso `contabilidad.asientos.edit-posted` (además de los permisos de endpoint actuales).
  - TX vía `auditedTx.run` con contexto de auditoría (userId, reaperturaId).
  - Chequeo de período: si está CERRADO o BLOQUEADO sin reapertura → rechazar con error estable.
  - Resolución de reapertura activa → propagación de `reaperturaId` al audit context (`fueDuranteReapertura`).
- El cache denormalizado `comprobanteEstado` de `ComprobanteDocumentoFisico` se escribe con el estado **REAL** del comprobante (hoy está hardcodeado a `BORRADOR` en la línea 868 — bug latente que esta feature corrige y que es PREREQUISITO de la validación de unicidad).
- La validación de unicidad "1 documento : 1 comprobante CONTABILIZADO" (`idsYaAsociadosAContabilizado`, hoy embebida en el flujo `contabilizar`) se **reutiliza** al asociar directamente a un CONTABILIZADO. El índice parcial raw SQL `comprobante_documento_fisico_unique_contabilizado` queda como última línea de defensa (defense in depth, §4.8).

### Por qué CAMINO 1 (y no anular+recrear)

Anular+recrear destruye el correlativo, fuerza re-numeración y rompe la trazabilidad del asiento original. El §4.3 ya decidió que un CONTABILIZADO de período abierto es corregible in-place; la asociación de papeles es exactamente ese tipo de corrección. Alinea la feature con el invariante vigente en vez de mantener una excepción huérfana del modelo viejo.

## 4. Scope (in)

- Modificar `asociarDocumentos` y `desasociarDocumento` en `comprobantes.service.ts` para la doble vía (BORRADOR | CONTABILIZADO+período abierto).
- Corregir el cache `comprobanteEstado` para reflejar el estado real al asociar.
- Reutilizar `idsYaAsociadosAContabilizado` para la validación de unicidad inmediata en la rama CONTABILIZADO.
- Errores de dominio estables nuevos (o reuso de los existentes) para los casos: período cerrado/bloqueado, sin permiso `edit-posted`, documento ya contabilizado en otro.
- Actualizar permisos en el controller para la rama CONTABILIZADO (verificación de `edit-posted` desde el service, como hace `editarContabilizado`).
- Delta spec sobre `documento-fisico` (REQ-A-* nuevos/modificados) + escenarios `+`/`−`.
- Tests TDD: unit (service con ports mockeados), integración (adapter Prisma + UNIQUE parcial), e2e (HTTP, los casos clave).

## 5. Out of scope

- **Migración de Prisma / cambios de schema**: NO se necesitan (ver design §"Migración"). La tabla `ComprobanteDocumentoFisico`, el campo cache `comprobanteEstado` y el índice parcial `comprobante_documento_fisico_unique_contabilizado` ya soportan el invariante. El bug del hardcode `BORRADOR` es de código de aplicación, no de schema.
- **Comportamiento BORRADOR actual**: NO cambia. Asociar/desasociar en BORRADOR sigue idéntico (sin `edit-posted`, sin auditedTx, idempotente, aditivo).
- **Numeración correlativa**: inmutable, no se toca (§4.9).
- **Módulo de ventas / generación automática de asientos**: fuera de scope.
- **Auditoría vía triggers de `comprobante_documento_fisico`**: los triggers actuales cubren `comprobantes` y `lineas_comprobante`, NO la tabla de asociación. El design decide si basta el contexto `auditedTx` o si se necesita extender; cualquier extensión de triggers, de requerirse, se trata como decisión explícita documentada (no se asume en esta entrega).

## 6. Riesgos

- **Invariante de unicidad bajo concurrencia**: dos requests asociando el mismo documento a dos CONTABILIZADOS distintos en paralelo. La pre-validación (`idsYaAsociadosAContabilizado`) + el índice parcial en BD deben cubrirlo (defense in depth). El adapter `asociar` debe mapear el `P2002` del índice parcial al `DomainError` correcto.
- **Cache `comprobanteEstado` desincronizado**: si se escribe mal, el índice parcial no protege o protege de más. Esta feature lo corrige; los tests de integración deben verificarlo contra Postgres real.
- **Race con cierre de período concurrente** (cicatriz F-03): la validación de período debe ocurrir DENTRO de la TX, igual que en `anular`/`editarContabilizado`.

## 7. Persistencia (hybrid)

- Archivos en `openspec/changes/documento-fisico-asociacion-post-contabilizado/`.
- Engram topic_keys: `sdd/documento-fisico-asociacion-post-contabilizado/{proposal,spec,design,tasks}`.
