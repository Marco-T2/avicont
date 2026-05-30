## Exploration: comprobante-drag-drop-lineas

### Current State

El campo `orden Int` YA EXISTE en `LineaComprobante` (schema.prisma línea 716) con
`@@unique([comprobanteId, orden])`. El campo es 1-based, contiguo, y se asigna en el
service como `idx + 1` derivado del índice del array recibido del DTO. **No se necesita
migración de schema.**

El backend persiste el orden mediante el patrón `deleteMany: {} + create:` (atómico en TX
de Prisma). Todos los reads usan `orderBy: { orden: 'asc' }` (constante `LINEAS_INCLUDE`).

El frontend tiene un `LineasEditor` con `useFieldArray({ name: 'lineas' })` de RHF.
Cada fila es un `LineaRow` con `key={field.id}` (ID estable de RHF). El `_localKey`
(UUID en `LineaFormValues`) es el identificador estable del cliente. No hay librería de
drag-and-drop instalada (`@dnd-kit` ausente del `package.json`).

### Affected Areas

#### Backend (mínimo)
- `backend/test/comprobantes.e2e-spec.ts` — Agregar test: PATCH con líneas en orden distinto, verificar que la respuesta respeta el nuevo orden
- No hay cambios en service, repository, DTOs ni schema

#### Frontend
- `frontend/package.json` — Agregar `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- `frontend/src/features/comprobantes/components/lineas-editor.tsx` — Integrar DnD con `DndContext`, `SortableContext`, `onDragEnd → move(oldIndex, newIndex)`, sensores con KeyboardSensor
- `frontend/src/features/comprobantes/components/linea-row.tsx` — Agregar `useSortable`, drag handle visual (GripVertical de lucide), disable cuando `editorDisabled`
- `frontend/src/features/comprobantes/components/lineas-editor.test.tsx` — Tests de reorder
- `frontend/src/features/comprobantes/components/linea-row.test.tsx` — Test del drag handle accesible

### Flujo §4.3 — cómo `orden` sobrevive el re-insert atómico

1. Front envía PATCH con `lineas: [...]` en el NUEVO ORDEN deseado (tras drag)
2. Service (`editarContabilizado`, línea 598): `lineasInput.map((l, idx) => { const orden = idx + 1; })`
3. Repository (`reemplazarComprobante`, líneas 129-131): `deleteMany: {}` borra TODAS las líneas existentes; `create:` re-inserta con el `orden` calculado
4. El DELETE ocurre primero (Prisma garantiza orden): no hay violación del `@@unique([comprobanteId, orden])`
5. La respuesta tiene las líneas con el nuevo `orden` en `LineaResponseDto`

No hay ningún cambio requerido en el service ni en el repositorio.

### Decisiones de diseño

#### 1. ¿Front manda `orden` explícito vs back deriva del índice del array?
**Recomendación**: back deriva del índice (status quo, NO cambiar).
- El servicio hace `const orden = index + 1` en ambos flujos (crear y editar)
- El front envía el array en el orden deseado → el back indexa automáticamente
- Tradeoff: ninguno. Simplidad sin costo

#### 2. Esquema de `orden`: 1-based contiguo vs gaps (10, 20, 30)
**Recomendación**: 1-based contiguo (status quo, NO cambiar).
- El modelo de re-insert atómico siempre re-indexa desde 1
- Los gaps no aportan nada con deleteMany + create total

#### 3. Constraint `@@unique([comprobanteId, orden])` — mantener o quitar
**Recomendación**: MANTENER el constraint existente.
- El patrón deleteMany + create dentro de la misma TX no viola el unique
- El constraint protege contra bugs de doble-escritura

#### 4. Estrategia de backfill en migración
**No aplica** — el campo existe desde el inicio con valores correctos.
El protocolo §11.6 sí aplica si alguien regenera una migración que toque `lineas_comprobante`
(los triggers de auditoría están en raw SQL y Prisma los dropearía si no se revisan).

#### 5. `fieldArray.move()` vs estado separado
**Recomendación**: `fieldArray.move(oldIndex, newIndex)` de RHF.
- Integración directa con RHF fieldArray
- Sin duplicación de estado
- El submit toma el array en el orden actual → el backend hace idx+1

### Approaches

1. **@dnd-kit/sortable + `fieldArray.move()`** (recomendado)
   - `DndContext` + `SortableContext` envolviendo el `<tbody>` o el contenedor
   - `useSortable(id)` en `LineaRow` para el drag handle (usar `field.id` de RHF como id)
   - Sensors: `PointerSensor` + `KeyboardSensor` (a11y obligatoria)
   - `onDragEnd`: buscar oldIndex/newIndex en `fields` por id, llamar `move(oldIndex, newIndex)`
   - Pros: a11y nativa, integración limpia, sin estado extra
   - Cons: nueva dependencia (~20KB gzip)
   - Effort: Medium

2. **Estado separado de orden** — NO recomendado (duplicación de estado, anti-patrón F-05)

### Recommendation

Opción 1. Backend sin cambios funcionales. Frontend: instalar @dnd-kit, integrar en
`lineas-editor.tsx` y `linea-row.tsx`, deshabilitar drag en `editorDisabled`, tests.

### Risks

1. **Bug de foco**: `key={field.id}` ya está correcto; `move()` preserva los field.id. Sin riesgo.
2. **Alt+Delete post-move**: El handler busca el índice del TR en el DOM. Tras un move, el `data-row-index` del TR refleja el índice actual en el map → correcto.
3. **Accesibilidad teclado**: Usar `KeyboardSensor` de @dnd-kit. El drag handle debe estar en un elemento separado de los inputs para no capturar las flechas.
4. **`<tr>` dentro de DnD**: @dnd-kit soporta tablas pero el `<DragOverlay>` no puede ser un `<tr>` fuera del `<tbody>`. Alternativa: usar `<DragOverlay>` como un `<div>` con snapshot de la fila, o evitar el overlay y usar solo el handle visible.
5. **§11.6**: No aplica (sin migración nueva). Pero si en el futuro se toca `lineas_comprobante`, revisar los triggers de auditoría.
6. **Disabled en contabilizado**: Deshabilitar el drag handle cuando `editorDisabled === true` (el toggle "Reemplazar líneas" no está activo).

### Effort

- Backend: S (solo un test e2e)
- Frontend: M (instalar deps + 2 componentes + tests)
- Total: M

### Ready for Proposal

Yes — el scope está delimitado, no hay cambios de schema ni migración, el mecanismo de
persistencia ya funciona, y la integración con RHF está clara.
