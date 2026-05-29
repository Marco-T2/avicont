<!--
Última edición: 2026-05-29
Owner: backend/frontend-lead
Estado: BRIEF para próxima sesión (UI). Backend ya implementado (PR #45) y archivado (#47).
-->

# Brief de implementación — UI de documentos físicos y su asociación a comprobantes

> Documento de **handoff** para la sesión de UI. El backend ya está completo y mergeado.
> Acá está el QUÉ y el CÓMO acordados; la sesión de UI ejecuta sobre este contrato estable.

## 0. Contexto en una frase

Un **documento físico** es el papel que respalda un asiento (factura, recibo, nota de
despacho). Ya existe la UI del **catálogo de tipos** (`tipos-documento-fisico`, PR #44).
Falta: (1) la **UI de asociación** de documentos a un comprobante, y (2) la **UI standalone
CRUD** de `documentos-fisicos`. El backend de ambas está listo.

## 1. Alcance de la sesión de UI

| Parte | Qué | Prioridad |
|-------|-----|-----------|
| **A. Asociación en comprobante** | Sección en el form/detalle del comprobante para asociar/desasociar documentos físicos | Principal |
| **B. CRUD standalone** | Pantalla propia de `documentos-fisicos` (listar/crear/editar/eliminar) | Necesaria para el picker de A |

Recomendación de orden: **B primero** (el picker de A necesita documentos que existan), luego **A**.
Alternativa: si se hace "crear inline" en A, B puede ir después.

## 2. UX acordada (con Marco, sesión 2026-05-29)

### Camino principal: asociación INLINE "buscar o crear"
El contador tiene el papel en la mano y registra el asiento. NO debe saltar de pantalla.
En el form del comprobante, sección "Documentos de respaldo" con un **combobox**:
- **Tipea el número** → si el documento ya existe (reuso o cargado antes), aparece y lo selecciona.
- **Si no existe** → opción "➕ Crear nuevo" abre un mini-form (tipo, número, fecha, y
  **monto/moneda solo si el tipo es `esTributario`**) sin salir de la pantalla; al confirmar,
  crea el documento y lo asocia en un paso.

### Dos contextos del comprobante
- **Editable** (BORRADOR, o CONTABILIZADO con período abierto): se puede asociar/desasociar.
- **Read-only** (período cerrado → comprobante BLOQUEADO, o anulado): card de documentos
  asociados sin botones.

### Pre-filtro de compatibilidad
El picker solo muestra documentos cuyo `tipo.tiposComprobanteAplicables` **incluye el tipo
del comprobante** (INGRESO/EGRESO/AJUSTE/DIARIO/etc.). Así se evita ofrecer opciones que el
backend rechazaría con 422 (`TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE`).

## 3. Reglas de cardinalidad a reflejar en la UI

- **Asiento → N documentos** (hasta 50). La UI muestra una **lista**, no un campo único.
- **Documento → 1 comprobante CONTABILIZADO** (índice parcial). Puede estar en N borradores.
- **Tipo → sin límite**. Es solo clasificación.
- La validación de unicidad (documento ya en otro contabilizado) salta **al contabilizar**
  o **al asociar directo a un contabilizado**, no al asociar en borrador.

## 4. Contrato backend disponible (ya mergeado)

### Sub-recursos de comprobante (asociación)
| Método | Ruta | Permiso | Notas |
|--------|------|---------|-------|
| GET | `/comprobantes/:id/documentos-fisicos` | `contabilidad.documentos-fisicos.read` | Lista asociados (`DocumentoFisicoAsociadoDto`: id, numero, tipo {id,nombre}, monto, moneda, fechaEmision) |
| POST | `/comprobantes/:id/documentos-fisicos` | `documentos-fisicos.update` + `asientos.update` (+ `asientos.edit-posted` si CONTABILIZADO) | Body `{ documentoFisicoIds: string[] }` (máx 50). Aditivo + idempotente |
| DELETE | `/comprobantes/:id/documentos-fisicos/:documentoFisicoId` | igual | Desasocia |

**NUEVO (PR #45):** asociar/desasociar ahora funciona también en **CONTABILIZADO con período
abierto** (antes solo BORRADOR). En ese caso el backend exige `contabilidad.asientos.edit-posted`.

### CRUD standalone de documentos-fisicos
- GET `/documentos-fisicos` con filtros: `tipoDocumentoFisicoId`, `fechaDesde`/`fechaHasta`,
  `contactoId`, `estadoAsociacion` (`SUELTO|EN_BORRADOR|CONTABILIZADO`), `numero` + paginación.
- GET `/documentos-fisicos/:id` → incluye `comprobantesAsociados`.
- POST / PATCH / DELETE. Permisos `contabilidad.documentos-fisicos.*`.
- `monto`/`moneda` **obligatorios si el tipo es tributario**; `monto` cruza como **string** (§4.5).
- `numero` normalizado (trim + uppercase, regex `^[A-Z0-9./-]+$`). Editable solo si suelto o
  en borradores; inmutable si está en un CONTABILIZADO.

### Errores a manejar en la UI
| Code | HTTP | Cuándo |
|------|------|--------|
| `DOCUMENTO_FISICO_YA_ASOCIADO_A_OTRO_CONTABILIZADO` | 409 | El documento ya respalda otro asiento contabilizado |
| `SIN_PERMISO_EDITAR_CONTABILIZADO` (edit-posted) | 403 | Falta permiso para tocar un contabilizado |
| `COMPROBANTE_DOCUMENTO_ASOCIACION_PERIODO_CERRADO` / `COMPROBANTE_NO_EDITABLE_ESTADO_INVALIDO` | 409 | Período cerrado → comprobante BLOQUEADO |
| `TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE` | 422 | Tipo de doc no aplica a ese tipo de comprobante (la UI debería pre-filtrar) |

> Nota: el toast genérico de 422 oculta el mensaje real (deuda UX conocida). Mostrar el
> `error.message`/`code` real cuando sea accionable.

## 5. Patrón de frontend a seguir

Replicar la estructura ya consolidada de `frontend/src/features/tipos-documento-fisico/`
(y `contactos`):
```
features/documentos-fisicos/
├── api/        (1 archivo por endpoint, tipados)
├── hooks/      (useQuery con keepPreviousData; useMutation con invalidations)
├── components/ (list-table, list-filters, form, form-sheet, dialogs)
├── pages/      (orquestador)
├── schemas/    (zod + zodResolver, mensajes en español)
├── lib/        (build-params)
└── types.ts
```
- UI: **shadcn** (Table, Sheet, Dialog, Combobox/Command, Input, Checkbox) + Tailwind + lucide-react.
- Sheet `sm:max-w-xl` para forms. Skeletons al cargar. Botones con `disabled={isPending}` + spinner.
- Tests: **vitest** + testing-library. Ver patrones de `tipos-documento-fisico/*.test.tsx`.
- Gotchas frontend vigentes: ver `frontend/CLAUDE.md` (Anti-F-14 textarea en Sheet, JSDOM sin
  media queries → `getAllByText`, `noUncheckedIndexedAccess` narrowing, no anidar `<tr>`).

## 6. Antes de tocar código

- Leer `docs/claude/dominio-contable.md` (§12.1 lo exige para `documentos-fisicos`/`comprobantes`).
- Spec vivo del dominio: `openspec/specs/documento-fisico/spec.md` (ya incluye el delta del PR #45).
- Diseño de dominio original: `docs/disenos/documento-fisico.md`.
- Stack docker arriba (`docker compose up -d`) + frontend `pnpm dev` (:5173). Si comprobantes
  da 500 → `docker compose up -d --build app` (gotcha imagen stale).

## 7. Deuda asociada (hacer DESPUÉS de esta UI)

- **Item 2 (backstop de race en `contabilizar`)**: `mapP2002Contabilizar` lanza
  `DocumentoFisicoYaAsociadoAOtroContabilizadoError('')` con id vacío en una race TOCTOU.
  Fix: en el service, catch tras `refrescarEstadoComprobante` → re-query
  `idsYaAsociadosAContabilizado` → re-throw con id real. Bajo valor; cerrar tras la UI.
- **Capacidad futura**: numeración lineal generada por el sistema para documentos (modo
  SISTEMA vs MANUAL), patrón `SecuenciaComprobante`. Y auto-entries del futuro módulo ventas
  (`origenTipo`/`origenId`). Ambas Fase 1.5+, fuera de esta UI.
