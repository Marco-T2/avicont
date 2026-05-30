# Proposal: Drag & drop para reordenar líneas de comprobante (UI)

## Intent

El editor de líneas de comprobantes (`lineas-editor.tsx` + `linea-row.tsx`) permite agregar,
editar y eliminar líneas, pero NO permite **reordenarlas**. El contador, al cargar un asiento,
suele querer ordenar las líneas (débitos arriba, créditos abajo; o por relevancia) y hoy solo
puede hacerlo borrando y re-creando filas. El orden se persiste en el backend vía el campo
`orden Int` de `LineaComprobante` — que **ya existe** — pero la UI no expone ninguna forma de
cambiarlo. Cerramos el gap agregando drag & drop accesible sobre las filas.

## Scope

### In Scope

- Reordenar las filas del editor de líneas mediante **drag & drop** con un **handle dedicado**
  (no la fila entera), usando `@dnd-kit`.
- Reorden accesible por **teclado** (`KeyboardSensor` de @dnd-kit) activado solo desde el handle,
  para no chocar con las flechas de los inputs Debe/Haber.
- Deshabilitar el handle en `mode='contabilizado'` mientras el toggle "Reemplazar líneas" esté off
  (`editorDisabled === true`).
- Persistencia transparente: el front envía el array de líneas en el nuevo orden; el backend
  re-deriva `orden = idx + 1` en el re-insert atómico §4.3 (sin cambios de service/repo/DTO).
- Backend: **1 test e2e** que verifica que un PATCH con líneas reordenadas persiste `orden`
  correctamente y las devuelve en el nuevo orden.

### Out of Scope

- Cambios de schema o migración: el campo `orden Int` y `@@unique([comprobanteId, orden])` ya
  existen (schema.prisma:716). CERO migración, CERO backfill.
- Cambios en service, repository o DTOs del backend: el patrón `deleteMany + create` con
  `orden = idx + 1` ya persiste el orden recibido.
- El front NO envía `orden` explícito por línea — solo el array en el orden deseado.
- Multi-drag (reordenar varias líneas a la vez): se reordena de a una.
- Cambiar el esquema de `orden` a gaps (10, 20, 30): se mantiene 1-based contiguo.

## Capabilities

### New Capabilities

- `comprobante-drag-drop-lineas-ui` — comportamiento UI nuevo: reordenar líneas por drag & drop
  y por teclado, con persistencia del orden.

### Modified Capabilities

- None a nivel contrato backend. El mecanismo de persistencia del `orden` ya existe; esta spec
  cubre el comportamiento UI observable más una verificación e2e del contrato existente.

## Approach

Integrar `@dnd-kit` (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`) con el
`useFieldArray` de RHF:

1. **`lineas-editor.tsx`**: envolver el `<tbody>` con `DndContext` + `SortableContext`
   (strategy `verticalListSortingStrategy`). En `onDragEnd`, mapear `active.id`/`over.id` a
   `oldIndex`/`newIndex` buscando por `field.id` y llamar `fieldArray.move(oldIndex, newIndex)`.
   Sensores: `PointerSensor` + `KeyboardSensor` (con `sortableKeyboardCoordinates`).
2. **`linea-row.tsx`**: usar `useSortable({ id: field.id })` por fila; aplicar `transform`/
   `transition` a la fila in-place (sin `<DragOverlay>` — un `<tr>` fuera de `<tbody>` es HTML
   inválido); agregar una celda con un **handle** (botón con `GripVertical` de lucide) que lleva
   `attributes`/`listeners`; el handle se deshabilita (`disabled`/`aria-disabled`) cuando
   `editorDisabled`.
3. **Preservar `key={field.id}`** (ID estable de RHF) — `move()` lo preserva, evitando el bug
   histórico de foco en Debe/Haber. NUNCA `key={index}`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/package.json` | Modified | Agregar `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |
| `frontend/src/features/comprobantes/components/lineas-editor.tsx` | Modified | `DndContext` + `SortableContext` + `onDragEnd → move()` + sensores |
| `frontend/src/features/comprobantes/components/linea-row.tsx` | Modified | `useSortable` + celda con drag handle (`GripVertical`) deshabilitable |
| `frontend/src/features/comprobantes/components/lineas-editor.test.tsx` | Modified | Tests de reorden (drag y teclado) |
| `frontend/src/features/comprobantes/components/linea-row.test.tsx` | Modified | Test del drag handle accesible / deshabilitado |
| `backend/test/comprobantes.e2e-spec.ts` | Modified | 1 test: PATCH con líneas reordenadas persiste `orden` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `<DragOverlay>` con `<tr>` produce HTML inválido fuera de `<tbody>` | Alta | NO usar overlay; animar la fila in-place con `transform`/`transition` de @dnd-kit |
| `KeyboardSensor` captura Space/flechas que los inputs Debe/Haber también usan | Alta | El drag se activa SOLO desde el handle dedicado; los inputs no son draggable |
| Bug histórico de foco en Debe/Haber tras reordenar | Med | Preservar `key={field.id}` (RHF lo mantiene en `move()`); prohibido `key={index}` |
| Alt+Delete post-reorden borra la fila equivocada | Med | El handler usa `data-row-index`; tras `move()` los TR se re-renderizan en orden — test lo cubre |
| Handle drag activo en comprobante contabilizado sin "Reemplazar líneas" | Med | Deshabilitar handle (`disabled`/`aria-disabled`) cuando `editorDisabled === true` |
| `@dnd-kit` con bajo ritmo de commits (rewrite en curso) | Low | 2.8M descargas/sem, estable 6.x, superficie de uso minúscula → riesgo de mantenimiento bajo |

## Rollback Plan

Revertir el PR (squash). El backend no cambia (solo se agrega un test), así que cualquier
comprobante guardado con un orden de líneas dado persiste igual; quitar el drag & drop solo
revierte la capacidad de reordenar desde la UI. Sin migraciones que deshacer.

## Dependencies

- Campo `orden Int` con `@@unique([comprobanteId, orden])` en `LineaComprobante` (ya existe).
- Backend re-deriva `orden = idx + 1` en `editarContabilizado` (service ~L599) y
  `reemplazarComprobante` (repo L129-131) — ya existe.
- `useFieldArray.move()` de react-hook-form (ya instalado, v7).
- `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (a instalar).
