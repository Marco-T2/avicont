# Delta Spec: documento-fisico-asociacion-post-contabilizado

> Fecha: 2026-05-29
> Fase: spec (DELTA sobre `openspec/specs/documento-fisico/spec.md`)
> Proyecto: avicont
> Capability afectada: documento-fisico § 2.3 (Asociación Comprobante ↔ DocumentoFisico)

Este documento es un DELTA. Solo lista lo que CAMBIA, se AGREGA o se MODIFICA respecto al spec base. Lo no mencionado permanece igual.

---

## MODIFIED Requirements

### REQ-A-02 (MODIFIED) — Desasociar permitido en BORRADOR y en CONTABILIZADO+período abierto

> Antes: "siempre que el comprobante esté en estado BORRADOR".

El sistema DEBE permitir desasociar un `DocumentoFisico` de un `Comprobante` mediante `DELETE /api/comprobantes/:comprobanteId/documentos-fisicos/:documentoFisicoId` cuando:

- el comprobante está en estado **BORRADOR** (comportamiento existente, sin blindaje extra), **O**
- el comprobante está en estado **CONTABILIZADO** y su `PeriodoFiscal` está **ABIERTO** o tiene una `PeriodoFiscalReopening` activa. En este caso el sistema DEBE aplicar el blindaje de §4.3 (ver REQ-A-12).

### REQ-A-03 (MODIFIED) — Rechazo de desasociar solo si CONTABILIZADO con período cerrado/bloqueado

> Antes: "NO DEBE permitir desasociar de un Comprobante que ya esté CONTABILIZADO".

El sistema NO DEBE permitir desasociar un `DocumentoFisico` de un `Comprobante` CONTABILIZADO cuyo período esté cerrado y sin reapertura activa. La corrección solo es posible vía el flujo de reapertura (§4.4). Un comprobante ANULADO no admite asociar/desasociar (terminal, §4.7) → retorna `COMPROBANTE_ANULADO_NO_EDITABLE` (409).

> **HALLAZGO DE IMPLEMENTACIÓN (2026-05-29)**: el enum `PeriodoFiscalStatus`
> tiene SOLO `ABIERTO | CERRADO` (no existe `BLOQUEADO` a nivel período).
> Cerrar un período transiciona sus comprobantes CONTABILIZADO a estado
> **BLOQUEADO** (§4.1 CLAUDE.md). Por tanto, en la práctica un comprobante cuyo
> período fue cerrado ya NO está en estado CONTABILIZADO: `validarEstadoParaEditar`
> lo rechaza ANTES de evaluar el período con `COMPROBANTE_NO_EDITABLE_ESTADO_INVALIDO`
> (409). El code `COMPROBANTE_DOCUMENTO_ASOCIACION_PERIODO_CERRADO` queda como
> defensa in-TX para el caso (no alcanzable por el flujo normal) en que el
> comprobante siga CONTABILIZADO pero su período figure CERRADO. Esto es idéntico
> al comportamiento de `editarContabilizado`. La corrección de un período cerrado
> sigue pasando por reabrir el período (reapertura), que devuelve los comprobantes
> a CONTABILIZADO y el período a ABIERTO.

### REQ-A-06 (MODIFIED) — Validación de unicidad compartida entre contabilizar y asociar-a-contabilizado

> Antes: la validación corría solo dentro del flujo `contabilizar`.

El sistema DEBE validar que un `DocumentoFisico` no quede asociado a más de un `Comprobante` CONTABILIZADO **tanto al contabilizar (BORRADOR → CONTABILIZADO) como al asociar un documento directamente a un comprobante CONTABILIZADO**. Ambos flujos consumen la misma fuente de verdad: `DOCUMENTOS_FISICOS_READER_PORT.idsYaAsociadosAContabilizado(tenantId, ids[], comprobanteId, tx)` (pre-validación UX). El UNIQUE PARCIAL de BD `comprobante_documento_fisico_unique_contabilizado` es la última línea de defensa (defense in depth, §4.8). Al detectar conflicto, retorna `DOCUMENTO_FISICO_YA_ASOCIADO_A_OTRO_CONTABILIZADO`.

### REQ-P-09 (MODIFIED) — Permiso adicional `edit-posted` al asociar a CONTABILIZADO

`POST /api/comprobantes/:id/documentos-fisicos` requiere `contabilidad.documentos-fisicos.update` Y `contabilidad.asientos.update` (endpoint, sin cambios). **Adicionalmente**, cuando el comprobante destino está CONTABILIZADO, el sistema DEBE exigir `contabilidad.asientos.edit-posted`, verificado desde el service (igual que `editarContabilizado`, §3.7). Si falta, retorna `SIN_PERMISO_EDITAR_CONTABILIZADO` (403). Para un comprobante en BORRADOR no se exige `edit-posted`.

### REQ-P-10 (MODIFIED) — Permiso adicional `edit-posted` al desasociar de CONTABILIZADO

`DELETE /api/comprobantes/:id/documentos-fisicos/:docId` requiere `contabilidad.documentos-fisicos.update` Y `contabilidad.asientos.update` (endpoint, sin cambios). **Adicionalmente**, cuando el comprobante está CONTABILIZADO, el sistema DEBE exigir `contabilidad.asientos.edit-posted` verificado desde el service. Para BORRADOR no se exige.

---

## ADDED Requirements

### REQ-A-12 (ADDED) — Asociar permitido en CONTABILIZADO+período abierto con blindaje §4.3

El sistema DEBE permitir asociar uno o más `DocumentoFisico` a un `Comprobante` CONTABILIZADO mediante `POST /api/comprobantes/:comprobanteId/documentos-fisicos` cuando su `PeriodoFiscal` esté ABIERTO o tenga una `PeriodoFiscalReopening` activa, aplicando el blindaje de §4.3:

1. Verificar permiso `contabilidad.asientos.edit-posted` desde el service (REQ-P-09).
2. Ejecutar dentro de `auditedTx.run` con `{ userId, reaperturaId? }` para que el contexto de auditoría se propague (`fueDuranteReapertura`).
3. Resolver la reapertura activa del período del comprobante ANTES de abrir la TX (igual patrón que `editarContabilizado`/`anular`).
4. Dentro de la TX, validar el período del comprobante: si su estado no es ABIERTO y no hay reapertura → rechazar con `COMPROBANTE_DOCUMENTO_ASOCIACION_PERIODO_CERRADO` (REQ-A-03).
5. Re-validar unicidad (REQ-A-06) antes de insertar.
6. Persistir cada asociación nueva con `comprobanteEstado = CONTABILIZADO` (REQ-A-13). La operación sigue siendo **aditiva e idempotente** (re-asociar un par existente es no-op).

El comportamiento para comprobante en BORRADOR NO cambia (sin `edit-posted`, sin auditedTx, sin chequeo de período). El número correlativo del comprobante es inmutable y no se toca (§4.9).

### REQ-A-13 (ADDED) — Cache `comprobanteEstado` refleja el estado real del comprobante

El sistema DEBE persistir el campo cache `ComprobanteDocumentoFisico.comprobanteEstado` con el estado **real** del comprobante al momento de asociar: `BORRADOR` si el comprobante está en borrador, `CONTABILIZADO` si está contabilizado. NO DEBE hardcodearse a `BORRADOR`. Este cache es la columna sobre la que opera el índice parcial `comprobante_documento_fisico_unique_contabilizado` (§11.6); un valor incorrecto rompe el invariante de unicidad o lo aplica de más.

### REQ-A-14 (ADDED) — Auditoría de cambios de asociación post-contabilización

Cuando se asocia o desasocia un documento físico a/de un comprobante CONTABILIZADO, la operación DEBE correr dentro de `auditedTx.run` de modo que el contexto de auditoría (actor `userId`, `reaperturaId`, `fueDuranteReapertura`) quede establecido en la sesión Postgres durante la TX. NOTA: los triggers actuales (`trg_audit_comprobantes`, `trg_audit_lineas_comprobante`) NO cubren la tabla `comprobante_documento_fisico`; la decisión sobre si se requiere un trigger adicional para esa tabla se documenta en `design.md` §"Auditoría". El requisito mínimo de esta entrega es que el actor quede correctamente establecido en la TX (no `NULL`).

---

## ADDED — Códigos de error (delta § 4.3)

| Code | HTTP | Mensaje | Cuándo |
|------|------|---------|--------|
| `COMPROBANTE_DOCUMENTO_ASOCIACION_PERIODO_CERRADO` | 409 | No se puede modificar las asociaciones de documentos del comprobante porque su período está cerrado o bloqueado | Asociar/desasociar en CONTABILIZADO con período CERRADO/BLOQUEADO y sin reapertura |

REUSO (sin code nuevo):
- `SIN_PERMISO_EDITAR_CONTABILIZADO` (403) — falta `edit-posted` al tocar asociación de un CONTABILIZADO.
- `DOCUMENTO_FISICO_YA_ASOCIADO_A_OTRO_CONTABILIZADO` (409/422 según ubicación) — documento ya en otro CONTABILIZADO. Mantener el HTTP status coherente con el existente; el design fija el code estable.
- `COMPROBANTE_ANULADO_NO_EDITABLE` (409) — comprobante anulado, terminal.
- `COMPROBANTE_NO_ENCONTRADO` (404), `DOCUMENTO_FISICO_REFERENCIADO_NO_EXISTE` (422), `TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE` (422) — sin cambios.

DEPRECADO en la rama de período abierto (sigue vivo para período cerrado/anulado vía los codes nuevos):
- `COMPROBANTE_DOCUMENTO_NO_DESASOCIABLE_CONTABILIZADO` — ya NO se lanza cuando el comprobante está CONTABILIZADO con período abierto. El design decide si se elimina o se reserva.

---

## Escenarios (Given/When/Then) — casos `+` y `−`

### Asociar a CONTABILIZADO

**E-A-12 (+): Asociar documento libre a CONTABILIZADO de período abierto con permiso**
- **Given** `comp-cont` está CONTABILIZADO en `acme`, su período `P` está ABIERTO
- **And** el usuario tiene `documentos-fisicos.update` + `asientos.update` + `asientos.edit-posted`
- **And** `doc-libre` existe en `acme`, tipo compatible con el tipo del comprobante, no asociado a ningún CONTABILIZADO
- **When** `POST /api/comprobantes/comp-cont/documentos-fisicos` con `{ documentoFisicoIds: ["doc-libre"] }`
- **Then** **200 OK** con la lista actualizada
- **And** existe fila `ComprobanteDocumentoFisico(comp-cont, doc-libre)` con `comprobanteEstado = CONTABILIZADO`
- **And** la TX corrió bajo `auditedTx` con el `userId` correcto

**E-A-13 (−): Asociar a CONTABILIZADO sin permiso `edit-posted`**
- **Given** `comp-cont` CONTABILIZADO, período ABIERTO
- **And** el usuario tiene `documentos-fisicos.update` + `asientos.update` pero NO `asientos.edit-posted`
- **When** `POST .../documentos-fisicos`
- **Then** **403 Forbidden**, `SIN_PERMISO_EDITAR_CONTABILIZADO`

**E-A-14 (−): Asociar a CONTABILIZADO de período CERRADO**
- **Given** `comp-cont` CONTABILIZADO, su período está CERRADO, sin reapertura activa
- **And** el usuario tiene todos los permisos
- **When** `POST .../documentos-fisicos`
- **Then** **409 Conflict**, `COMPROBANTE_DOCUMENTO_ASOCIACION_PERIODO_CERRADO`

**E-A-15 (−): Asociar a CONTABILIZADO de período BLOQUEADO**
- **Given** `comp-cont` CONTABILIZADO, su período está BLOQUEADO, sin reapertura
- **When** `POST .../documentos-fisicos` con todos los permisos
- **Then** **409 Conflict**, `COMPROBANTE_DOCUMENTO_ASOCIACION_PERIODO_CERRADO`

**E-A-16 (+): Asociar a CONTABILIZADO de período cerrado pero con reapertura activa**
- **Given** `comp-cont` CONTABILIZADO, su período tiene una `PeriodoFiscalReopening` ACTIVA
- **And** el usuario tiene todos los permisos
- **When** `POST .../documentos-fisicos` con `{ documentoFisicoIds: ["doc-libre"] }`
- **Then** **200 OK**
- **And** la TX corrió con `reaperturaId` propagado (audit context `fueDuranteReapertura = true`)

**E-A-17 (−): Asociar a CONTABILIZADO un documento ya contabilizado en OTRO comprobante**
- **Given** `doc-1` ya está asociado a `comp-A` CONTABILIZADO
- **And** `comp-B` está CONTABILIZADO en período abierto, usuario con permisos
- **When** `POST /api/comprobantes/comp-B/documentos-fisicos` con `{ documentoFisicoIds: ["doc-1"] }`
- **Then** **409/422** `DOCUMENTO_FISICO_YA_ASOCIADO_A_OTRO_CONTABILIZADO`, `details.comprobanteContabilizadoId = "comp-A"`
- **And** NO se inserta fila nueva; el índice parcial no llegó a violarse (pre-validación lo atrapó)

**E-A-18 (−): Asociar a comprobante ANULADO**
- **Given** `comp-anulado` está CONTABILIZADO con `anulado = true`
- **When** `POST .../documentos-fisicos` con permisos
- **Then** **409 Conflict**, `COMPROBANTE_ANULADO_NO_EDITABLE`

**E-A-19 (+): Asociar a BORRADOR sigue sin exigir `edit-posted` (retrocompat)**
- **Given** `comp-borrador` BORRADOR, usuario con `documentos-fisicos.update` + `asientos.update` SIN `edit-posted`
- **When** `POST .../documentos-fisicos` con `{ documentoFisicoIds: ["doc-libre"] }`
- **Then** **200 OK** — comportamiento idéntico al actual; fila con `comprobanteEstado = BORRADOR`

**E-A-20 (+): Idempotencia en CONTABILIZADO**
- **Given** `doc-1` ya asociado a `comp-cont` (CONTABILIZADO, período abierto)
- **When** `POST .../documentos-fisicos` con `{ documentoFisicoIds: ["doc-1"] }` de nuevo
- **Then** **200 OK**, no-op (no se duplica la fila)

### Desasociar de CONTABILIZADO

**E-A-21 (+): Desasociar de CONTABILIZADO de período abierto con permiso**
- **Given** `doc-1` asociado a `comp-cont` (CONTABILIZADO, período ABIERTO), usuario con `edit-posted`
- **When** `DELETE /api/comprobantes/comp-cont/documentos-fisicos/doc-1`
- **Then** **204 No Content**
- **And** no existe la fila de asociación; `doc-1` persiste y queda libre para re-asociar

**E-A-22 (−): Desasociar de CONTABILIZADO sin `edit-posted`**
- **Given** `comp-cont` CONTABILIZADO período abierto, usuario sin `edit-posted`
- **When** `DELETE .../documentos-fisicos/doc-1`
- **Then** **403 Forbidden**, `SIN_PERMISO_EDITAR_CONTABILIZADO`

**E-A-23 (−): Desasociar de CONTABILIZADO de período CERRADO**
- **Given** `comp-cont` CONTABILIZADO, período CERRADO sin reapertura, usuario con permisos
- **When** `DELETE .../documentos-fisicos/doc-1`
- **Then** **409 Conflict**, `COMPROBANTE_DOCUMENTO_ASOCIACION_PERIODO_CERRADO`

**E-A-24 (+): Desasociar de BORRADOR sigue igual (retrocompat, REQ-A-02 base)**
- **Given** `doc-1` asociado a `comp-borrador` (BORRADOR)
- **When** `DELETE .../documentos-fisicos/doc-1`
- **Then** **204 No Content** — sin `edit-posted`, sin auditedTx

---

## Coverage objetivo (delta)

- Unit service: ramas nuevas (BORRADOR vs CONTABILIZADO, período abierto/cerrado/reapertura, con/sin `edit-posted`, documento libre/ya-contabilizado) con ports mockeados.
- Integración adapter Prisma: verificar que `comprobanteEstado` se persiste correcto (CONTABILIZADO) y que el índice parcial bloquea el segundo INSERT contra Postgres real.
- E2E: los `+`/`−` clave (E-A-12, E-A-13, E-A-14, E-A-16, E-A-17, E-A-21, E-A-22, E-A-23).
