<!--
Change: comprobante-drag-drop-lineas
Fase: design
Fecha: 2026-05-30
Status: EN PROGRESO
Última revisión contra core: 2026-05-30
Owner: frontend-lead
-->

# Design: Drag & drop para reordenar líneas de comprobante (UI)

## Contexto

El editor de líneas usa `useFieldArray({ name: 'lineas' })` de RHF. Cada fila es un
`<LineaRow>` con `key={field.id}` (ID estable de RHF). El backend ya persiste el orden de las
líneas vía el campo `orden Int` (`@@unique([comprobanteId, orden])`), re-derivado como
`orden = idx + 1` del array recibido durante el re-insert atómico §4.3
(`editarContabilizado` service ~L599, `reemplazarComprobante` repo L129-131). Todos los reads
usan `orderBy: { orden: 'asc' }`. Falta solo la **UI** para reordenar.

La decisión de librería (**@dnd-kit**) está cerrada (engram `sdd/comprobante-drag-drop-lineas/decision-libreria`):
pointer sensors conviven limpio con los inputs editables, `KeyboardSensor` da a11y de teclado
out-of-the-box, e integra con `useFieldArray.move()`. formkit descartado (a11y de teclado
removida); pragmatic descartado (native HTML5 DnD roza con inputs; sus ventajas de escala son
irrelevantes para un puñado de líneas).

## Decisiones de diseño

### Decisión 1 — Handle dedicado, no fila draggable completa

**Qué**: agregar una celda con un botón-handle (`GripVertical` de lucide) que lleva los
`attributes`/`listeners` de `useSortable`. La fila NO es draggable como un todo.

**Por qué**: los inputs Debe/Haber usan flechas del teclado para editar; si la fila completa
fuera el target del `KeyboardSensor`, las flechas se las robaría el drag. Aislar el drag al
handle es la única forma de que ambos convivan (riesgo 2 de la exploración). También evita que
un click-drag accidental sobre un input mueva la fila.

**Tradeoff**: una columna/celda extra en la tabla. Mínima — el handle es un ícono.

### Decisión 2 — Animación in-place, SIN `<DragOverlay>`

**Qué**: aplicar `transform` (de `@dnd-kit/utilities` `CSS.Transform.toString`) + `transition`
al `<tr>` de la fila arrastrada. NO usar `<DragOverlay>`.

**Por qué**: `<DragOverlay>` renderiza el elemento arrastrado en un portal fuera del árbol. Un
`<tr>` fuera de un `<tbody>` es **HTML inválido** (riesgo 1 de la exploración) y rompe el
layout de la tabla. La estrategia `verticalListSortingStrategy` + animación in-place de la fila
es suficiente y válida.

**Tradeoff**: sin "ghost" flotante durante el drag; la fila se desplaza en su lugar. Aceptable
para una tabla de pocas filas.

### Decisión 3 — `id` de sortable = `field.id` de RHF

**Qué**: `useSortable({ id: field.id })` por fila; el `SortableContext` recibe
`items={fields.map(f => f.id)}`.

**Por qué**: `field.id` es el ID estable que RHF genera y **preserva** a través de `move()`.
Usarlo como id de sortable y como `key` del `<LineaRow>` garantiza que React no re-monta la
fila al reordenar, preservando el estado interno de los inputs y el foco (riesgo 3: bug
histórico de salto de foco en Debe/Haber). **Prohibido `key={index}`** (Anti-F-06).

### Decisión 4 — `onDragEnd → fieldArray.move(oldIndex, newIndex)`

**Qué**: en `onDragEnd(event)`, si `active.id !== over?.id`, buscar
`oldIndex = fields.findIndex(f => f.id === active.id)` y
`newIndex = fields.findIndex(f => f.id === over.id)`, y llamar `move(oldIndex, newIndex)`.

**Por qué**: `move()` reordena el fieldArray sin duplicar estado (anti-patrón F-05). El submit
toma el array en el orden actual → el backend hace `idx + 1`. Sin estado separado de orden,
sin `useEffect`.

**Narrowing** (`noUncheckedIndexedAccess`): `over` puede ser `null`; los `findIndex` devuelven
`-1` si no hay match → early return cuando `oldIndex === -1 || newIndex === -1`.

### Decisión 5 — Drag deshabilitado cuando `editorDisabled`

**Qué**: pasar `disabled` (= `editorDisabled`) a `useSortable({ id, disabled })` y al botón
handle (`disabled` + `aria-disabled`). El `DndContext` no necesita deshabilitarse globalmente
si cada sortable está disabled.

**Por qué**: en mode `'contabilizado'` sin "Reemplazar líneas", las líneas son read-only
(las modificaciones se descartan en el submit). Permitir reordenar sería incoherente. Reusa el
flag `editorDisabled` ya existente.

### Decisión 6 — Sensores: Pointer + Keyboard

**Qué**:
```ts
const sensors = useSensors(
  useSensor(PointerSensor),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
);
```

**Por qué**: `PointerSensor` (no native HTML5 DnD) convive con los inputs editables.
`KeyboardSensor` + `sortableKeyboardCoordinates` dan a11y de teclado out-of-the-box
(CLAUDE.md §10). Activación solo desde el handle (Decisión 1).

## Estructura de la solución

```
lineas-editor.tsx
├── useSensors(PointerSensor, KeyboardSensor)
├── <DndContext sensors onDragEnd={handleDragEnd}>
│     └── <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
│           └── <tbody>{fields.map(f => <LineaRow key={f.id} id={f.id} ... />)}</tbody>
│
└── handleDragEnd(event): oldIndex/newIndex por field.id → move()

linea-row.tsx
├── const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
│       useSortable({ id, disabled })
├── <tr ref={setNodeRef} style={{ transform, transition }} data-row-index={...}>
│     ├── <td>{<button handle> {...attributes} {...listeners} disabled aria-label="Reordenar línea"><GripVertical/></button>}</td>
│     ├── ... celdas existentes (Cuenta, Debe, Haber, Glosa, Contacto, Eliminar) ...
```

> Nota: la celda del handle agrega una columna; actualizar el `<colgroup>` y el `<thead>` del
> `lineas-editor.tsx` (una `<col>` de ancho fijo tipo `w-[32px]` + un `<th>` vacío o con
> `aria-label`). El `<tr>` del `LineaRow` debe recibir `id` y exponer `setNodeRef`/`style`.

## Riesgos y mitigaciones

| Riesgo | Mitigación (decisión) |
|--------|----------------------|
| `<tr>` en `<DragOverlay>` = HTML inválido | Decisión 2: animación in-place, sin overlay |
| KeyboardSensor roba flechas de los inputs | Decisión 1 + 6: drag solo desde el handle |
| Salto de foco en Debe/Haber tras reorden | Decisión 3: `id`/`key` = `field.id`; nunca `key={index}` |
| Alt+Delete borra fila equivocada tras reorden | El handler usa `data-row-index`; tras `move()` los TR se re-renderizan en orden → test REQ-DDL-UI-05 lo cubre |
| Drag en contabilizado bloqueado | Decisión 5: `disabled = editorDisabled` en sortable + handle |
| §11.6 migrations | No aplica (sin migración nueva). Si en el futuro se regenera una migration que toque `lineas_comprobante`, revisar los triggers de auditoría raw SQL |

## Testing (honeycomb)

- **Componentes (vitest)**: el grueso. `lineas-editor.test.tsx` (reorden + tests existentes
  verdes) y `linea-row.test.tsx` (handle accesible + deshabilitable). Simular el reorden vía la
  API de @dnd-kit o un helper que dispare `onDragEnd` con `active`/`over` mockeados — testear el
  efecto (`move`) sobre el orden de filas, no la mecánica interna de la librería.
- **E2E (jest, Postgres real)**: 1 test en `comprobantes.e2e-spec.ts` que verifica el contrato
  de persistencia del `orden` (REQ-DDL-UI-06) — PATCH con líneas invertidas devuelve el nuevo
  `orden`. La respuesta (`ComprobanteResponseDto`) expone `orden` por línea
  (`comprobante-response.dto.ts:13,172`) y los reads usan `orderBy: { orden: 'asc' }`.

## Notas de implementación (gotchas)

- **`tsc -b`, no `--noEmit`** en frontend (build de proyecto compuesto).
- **JSDOM no implementa `PointerEvent`/`DOMRect` completos** → no testear la mecánica de drag
  real con mouse; testear el **resultado** del reorden invocando el handler o la API de la
  librería. Si se simula `onDragEnd`, construir el `DragEndEvent` mínimo (`active`, `over`) con
  los `field.id` correspondientes.
- Importar `arrayMove` de `@dnd-kit/sortable` NO es necesario: `fieldArray.move()` ya reordena
  el estado; `arrayMove` sería duplicar estado (Anti-F-05).
- El handle es un `<button type="button">` para no disparar submit; lleva `aria-label` en
  español ("Reordenar línea").
- Respetar el checklist responsive/dark (§7 frontend): el handle es un tap target — usar al
  menos `size="icon"` con ajuste mobile si aplica; color del ícono vía variable del tema
  (`text-muted-foreground`), nunca literal.
