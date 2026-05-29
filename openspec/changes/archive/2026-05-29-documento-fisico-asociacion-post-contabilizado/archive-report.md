# Archive Report: documento-fisico-asociacion-post-contabilizado

> Fecha de cierre: 2026-05-29
> PR: #45 (mergeado a main)
> HEAD al cierre: 19eb683 (base) → PR #45 squash merge

---

## Estado final

**ARCHIVADO**. Implementación completa, verificada y mergeada a main en PR #45.

---

## Qué se hizo

Permitir asociar y desasociar documentos físicos a/de un comprobante CONTABILIZADO mientras su período fiscal esté abierto (o tenga una `PeriodoFiscalReopening` activa), con el mismo blindaje que `editarContabilizado` (§4.3 CLAUDE.md).

## Delta sincronizado al spec principal

Archivo: `openspec/specs/documento-fisico/spec.md`

### REQ modificados

| REQ | Cambio |
|-----|--------|
| **REQ-A-02** | Expandido: desasociar permitido también en CONTABILIZADO + período abierto (con blindaje §4.3). Antes: solo BORRADOR. |
| **REQ-A-03** | Ajustado: rechazo solo si CONTABILIZADO + período cerrado/bloqueado sin reapertura. Incluye nota de implementación sobre `PeriodoFiscalStatus` (solo ABIERTO/CERRADO). |
| **REQ-A-06** | Expandido: validación de unicidad compartida entre flujo `contabilizar` Y asociar directo a CONTABILIZADO. Mismo port `idsYaAsociadosAContabilizado`. |
| **REQ-P-09** | Expandido: cuando comprobante destino = CONTABILIZADO, exige `edit-posted` verificado desde el service. Para BORRADOR sin cambios. |
| **REQ-P-10** | Expandido: cuando comprobante = CONTABILIZADO, exige `edit-posted` desde service. Para BORRADOR sin cambios. |

### REQ agregados

| REQ | Descripción |
|-----|-------------|
| **REQ-A-12** | Asociar en CONTABILIZADO + período abierto: blindaje completo (edit-posted, auditedTx, chequeo período in-TX, unicidad, cache). |
| **REQ-A-13** | Cache `comprobanteEstado` refleja estado REAL del comprobante al asociar (corrige bug hardcode `BORRADOR`). |
| **REQ-A-14** | Auditoría: operaciones sobre CONTABILIZADO corren en `auditedTx.run` con contexto de actor. Decisión D8 opción A: sin trigger adicional sobre `comprobante_documento_fisico`. |

### Código de error agregado

| Code | HTTP | Cuándo |
|------|------|--------|
| `COMPROBANTE_DOCUMENTO_ASOCIACION_PERIODO_CERRADO` | 409 | Asociar/desasociar en CONTABILIZADO con período CERRADO/BLOQUEADO sin reapertura |

### Escenarios agregados

E-A-12 a E-A-24 (13 escenarios: 7 `+` y 6 `−`) incorporados en §3.3 del spec principal.

### Nota sobre COMPROBANTE_DOCUMENTO_NO_DESASOCIABLE_CONTABILIZADO

Marcado como DEPRECATED en la rama de período abierto en el spec. El code sigue en código de producción para el caso de período cerrado/anulado (no se eliminó para mantener retrocompat).

---

## Decisiones documentadas en este change

| ID | Decisión |
|----|----------|
| D8 opción A | Sin trigger adicional sobre `comprobante_documento_fisico`. Solo `auditedTx` establece el contexto del actor. Confirmado por el usuario el 2026-05-29. |
| Sin migración Prisma | El schema, `comprobanteEstado` y el índice parcial ya soportan el invariante. El bug del hardcode era de código de aplicación. |

---

## Archivos del change (preservados aquí)

- `proposal.md` — motivación y enfoque elegido (CAMINO 1 vs anular+recrear)
- `design.md` — decisiones arquitecturales, flujos detallados, decisión D8
- `specs/spec.md` — delta spec (fuente de los REQ sincronizados al spec principal)
- `tasks.md` — checklist TDD completo (todos los ítems marcados `[x]`)
