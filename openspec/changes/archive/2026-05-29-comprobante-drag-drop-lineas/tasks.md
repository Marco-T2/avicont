# Tasks: Drag & drop para reordenar líneas de comprobante (UI)

_Change: comprobante-drag-drop-lineas | Strict TDD: test ANTES de implementación_

> Comandos de verificación verde:
> - Frontend: `cd frontend && pnpm exec tsc -b` + `pnpm exec vitest run <archivo>`
> - Backend e2e: desde `backend/`, con Postgres arriba (127.0.0.1, no localhost):
>   `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/comprobantes.e2e-spec.ts --runInBand --forceExit`

---

## Grupo A — Dependencias

- [x] A-1 Agregar deps a `frontend/package.json`: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (`cd frontend && pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`)
- [x] A-2 Verificar instalación: `cd frontend && pnpm exec tsc -b` — 0 errores (los nuevos paquetes traen sus tipos)

---

## Grupo B — Drag handle accesible en `linea-row.tsx` (REQ-DDL-UI-01, REQ-DDL-UI-04)

- [x] B-T1 (RED) Extender `frontend/src/features/comprobantes/components/linea-row.test.tsx`: escenarios REQ-DDL-UI-01 (cada fila muestra un handle con `aria-label` "Reordenar línea") y REQ-DDL-UI-04 (handle deshabilitado cuando `disabled=true`; habilitado cuando `disabled=false`). Verificar que fallan. NOTA: envolver el `<LineaRow>` del test en un `<DndContext>`/`<SortableContext>` mínimo porque `useSortable` requiere el contexto.
- [x] B-1 (GREEN) Modificar `linea-row.tsx`: agregar prop `id: string` (el `field.id`); usar `useSortable({ id, disabled })` de `@dnd-kit/sortable`; aplicar `ref={setNodeRef}` y `style={{ transform: CSS.Transform.toString(transform), transition }}` al `<tr>`; agregar una celda inicial con un `<button type="button" aria-label="Reordenar línea" {...attributes} {...listeners} disabled={disabled}>` con ícono `GripVertical` de lucide; color del ícono vía `text-muted-foreground` (no literal)
- [x] B-2 Verificar: `cd frontend && pnpm exec vitest run src/features/comprobantes/components/linea-row.test.tsx`

---

## Grupo C — Integración DnD en `lineas-editor.tsx` (REQ-DDL-UI-02, REQ-DDL-UI-03, REQ-DDL-UI-05)

- [x] C-T1 (RED) Extender `frontend/src/features/comprobantes/components/lineas-editor.test.tsx`: escenario de reorden (REQ-DDL-UI-02) — disparar el reorden vía la API de @dnd-kit / un helper que invoque `onDragEnd` con `active`/`over` (usando los `field.id` de dos filas) y verificar que las filas quedan en el nuevo orden conservando sus valores; escenario REQ-DDL-UI-05 (Alt+Delete elimina la fila correcta tras un reorden). Verificar que fallan; verificar que los tests EXISTENTES siguen pasando tras envolver el editor en `DndContext`.
- [x] C-1 (GREEN) Modificar `lineas-editor.tsx`: importar `DndContext`, `closestCenter`, `KeyboardSensor`, `PointerSensor`, `useSensor`, `useSensors` (`@dnd-kit/core`) y `SortableContext`, `verticalListSortingStrategy`, `sortableKeyboardCoordinates` (`@dnd-kit/sortable`); definir `sensors`; envolver el `<table>`/`<tbody>` con `<DndContext sensors collisionDetection={closestCenter} onDragEnd={handleDragEnd}>` + `<SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>`; implementar `handleDragEnd(event: DragEndEvent)` que, si `active.id !== over?.id`, calcula `oldIndex`/`newIndex` por `field.id` (early return si `-1` o `over == null`) y llama `move(oldIndex, newIndex)`
- [x] C-2 (GREEN) Agregar la columna del handle al layout de la tabla en `lineas-editor.tsx`: una `<col>` de ancho fijo (ej. `w-[32px]`) en el `<colgroup>` y un `<th aria-label="Reordenar">` (o vacío) en el `<thead>`; pasar `id={field.id}` a cada `<LineaRow>` (mantener `key={field.id}`, PROHIBIDO `key={index}`)
- [x] C-3 Verificar: `cd frontend && pnpm exec vitest run src/features/comprobantes/components/lineas-editor.test.tsx`

---

## Grupo D — Verificación e2e del contrato de persistencia (REQ-DDL-UI-06)

- [x] D-T1 (RED) Agregar test en `backend/test/comprobantes.e2e-spec.ts`, dentro del describe `PATCH /:id — editarContabilizado (periodo abierto)`: crear y contabilizar (helper `crearYContabilizar`), luego `PATCH /api/comprobantes/:id` enviando las dos líneas INVERTIDAS respecto al orden original (cuentaB primero, cuentaA segundo, montos balanceados); assert que `res.status === 200`, que `res.body.lineas[0].cuentaId === ventasId` con `orden === 1` y `res.body.lineas[1].cuentaId === cajaId` con `orden === 2` (orden persistido = orden enviado). Verificar que el test corre (es la verificación del contrato existente; debería pasar sin tocar service/repo)
- [x] D-1 (GREEN) Confirmar que el test pasa sin cambios de producción (el backend ya re-deriva `orden = idx + 1`). Si el assert sobre `orden` falla por shape de respuesta, ajustar SOLO el test al shape real de `ComprobanteResponseDto` (que expone `orden` por línea, `comprobante-response.dto.ts:13,172`). NO modificar service/repo/DTO.
- [x] D-2 Verificar: desde `backend/`, `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/comprobantes.e2e-spec.ts --runInBand --forceExit`

---

## Grupo E — Checklist responsive y dark (§7 frontend)

- [ ] E-1 Verificar en 375 px que la columna del handle no rompe el layout (la tabla ya tiene `overflow-x-auto` + `min-w-[800px]` en `lineas-editor.tsx`)
- [ ] E-2 Verificar en 768 px y 1440 px que el handle queda alineado y es un tap target usable
- [x] E-3 Verificar en dark mode que el ícono `GripVertical` usa `text-muted-foreground` (variable del tema, no color literal) y es legible
- [x] E-4 Verificar a11y: el handle es focusable por teclado, expone `aria-label` en español, y el reorden por teclado funciona desde el handle (REQ-DDL-UI-03)

---

## Tarea final de verificación verde completa

- [x] Z-1 `cd frontend && pnpm exec tsc -b` — 0 errores
- [x] Z-2 `cd frontend && pnpm exec vitest run src/features/comprobantes/components/linea-row.test.tsx src/features/comprobantes/components/lineas-editor.test.tsx` — todos verdes; correr también la suite completa `pnpm exec vitest run` para confirmar 0 regresiones
- [x] Z-3 `cd frontend && pnpm run lint` — 0 warnings/errores
- [x] Z-4 Backend: e2e de comprobantes verde (comando del Grupo D-2)
