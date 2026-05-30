<!--
Change: comprobante-drag-drop-lineas
Fase: spec
Fecha: 2026-05-30
Status: EN PROGRESO
Última revisión contra core: 2026-05-30
Owner: frontend-lead
-->

# Spec: Drag & drop para reordenar líneas de comprobante (UI)

> Spec nueva — capacidad UI sobre un contrato backend existente.
> El campo `orden Int` y `@@unique([comprobanteId, orden])` ya existen en `LineaComprobante`
> (schema.prisma:716). El backend re-deriva `orden = idx + 1` del array recibido en el
> re-insert atómico §4.3. Esta spec cubre el comportamiento UI observable más una verificación
> e2e del contrato existente.

---

## REQ-DDL-UI-01 — Handle de arrastre dedicado por fila

Cada fila del editor de líneas (`linea-row.tsx`) DEBE incluir un **handle de arrastre dedicado**
(botón con ícono `GripVertical`), separado de los inputs editables (Cuenta, Debe, Haber, Glosa,
Contacto). El arrastre SOLO se activa desde este handle, nunca desde la fila completa ni desde
los inputs.

#### Scenario: Cada fila muestra un handle de arrastre

- GIVEN el editor de comprobante abierto con al menos una línea
- WHEN se renderiza la tabla de líneas
- THEN cada fila muestra un control de arrastre accesible (botón con `aria-label` descriptivo, ej. "Reordenar línea")

#### Scenario: Los inputs de la fila no inician arrastre

- GIVEN una fila con foco en el input Debe o Haber
- WHEN el usuario usa las flechas del teclado dentro del input
- THEN el input recibe las flechas normalmente y NO se inicia ninguna operación de arrastre

---

## REQ-DDL-UI-02 — Reordenar por arrastre (pointer)

El usuario DEBE poder reordenar las líneas arrastrando una fila desde su handle hasta otra
posición. El reorden se refleja inmediatamente en el editor y se persiste como nuevo `orden`
al guardar (el front envía el array en el nuevo orden; el backend re-deriva `orden = idx + 1`).

#### Scenario: Arrastrar una fila la mueve a la nueva posición

- GIVEN un editor con 3 líneas en orden A, B, C
- WHEN el usuario arrastra la fila A desde su handle hasta la posición de C
- THEN las filas quedan en orden B, C, A en el editor

#### Scenario: El reorden no altera el contenido de las líneas

- GIVEN un editor con líneas que tienen valores Debe/Haber/Glosa cargados
- WHEN el usuario reordena dos filas
- THEN cada fila conserva intactos sus valores Debe, Haber, Glosa, Cuenta y Contacto (solo cambia la posición)

#### Scenario: El reorden NO usa un DragOverlay con `<tr>`

- GIVEN el editor renderiza las filas dentro de un `<tbody>`
- WHEN una fila está siendo arrastrada
- THEN la fila se anima in-place (transform/transition de la librería) y NO se monta un `<tr>` fuera del `<tbody>` (HTML inválido)

---

## REQ-DDL-UI-03 — Reordenar por teclado (accesibilidad)

El reorden DEBE ser operable por teclado a través del handle, sin interferir con la navegación
de teclado de los inputs de la fila. El handle DEBE responder al `KeyboardSensor` de la librería.

#### Scenario: Activar y mover el handle por teclado reordena la fila

- GIVEN el foco en el handle de arrastre de una fila
- WHEN el usuario activa el arrastre por teclado y mueve la fila una posición hacia abajo
- THEN la fila cambia de posición sin necesidad de mouse

#### Scenario: El handle expone foco y rol accesibles

- GIVEN una fila renderizada en el editor
- WHEN se inspecciona el handle de arrastre en el DOM
- THEN el handle es focusable por teclado y expone un `aria-label` en español

---

## REQ-DDL-UI-04 — Drag deshabilitado en comprobante contabilizado bloqueado

Cuando `editorDisabled === true` (mode `'contabilizado'` con el toggle "Reemplazar líneas" en
off), el handle de arrastre DEBE estar deshabilitado: no inicia arrastre y expone
`aria-disabled` / `disabled`.

#### Scenario: Handle deshabilitado sin "Reemplazar líneas"

- GIVEN un comprobante en mode `'contabilizado'` con el toggle "Reemplazar líneas" desactivado
- WHEN se renderiza la tabla de líneas
- THEN el handle de arrastre de cada fila está deshabilitado (`disabled` o `aria-disabled="true"`) y no inicia arrastre

#### Scenario: Activar "Reemplazar líneas" habilita el handle

- GIVEN un comprobante en mode `'contabilizado'` con el toggle desactivado
- WHEN el usuario activa el toggle "Reemplazar líneas"
- THEN el handle de arrastre de cada fila se habilita y permite reordenar

---

## REQ-DDL-UI-05 — Preservar foco e identidad de fila tras reordenar

El reorden DEBE preservar la identidad estable de cada fila (`key={field.id}` de RHF) para
evitar el bug histórico de salto de foco en los inputs Debe/Haber. El handler Alt+Delete DEBE
seguir eliminando la fila correcta tras un reorden.

#### Scenario: Reordenar no salta el foco a otra fila

- GIVEN un editor con varias líneas y foco en un input de una fila
- WHEN el usuario reordena otra fila
- THEN el foco permanece en el input correcto (no salta a la fila adyacente)

#### Scenario: Alt+Delete elimina la fila correcta tras un reorden

- GIVEN un editor con 3 líneas reordenadas mediante drag
- WHEN el usuario hace Alt+Delete con foco en el botón eliminar de una fila concreta
- THEN se elimina esa misma fila (el `data-row-index` refleja el índice actual post-reorden)

---

## REQ-DDL-UI-06 — Persistencia del orden (verificación de contrato backend)

Al guardar un comprobante con líneas reordenadas, el backend DEBE persistir el nuevo `orden`
(`orden = idx + 1` del array recibido) y devolver las líneas en ese orden. No hay cambio de
contrato — esta verificación cubre el contrato existente vía un test e2e.

#### Scenario: PATCH con líneas reordenadas persiste el nuevo orden

- GIVEN un comprobante CONTABILIZADO con líneas [cuentaA (orden 1), cuentaB (orden 2)] en período abierto
- WHEN se hace `PATCH /api/comprobantes/:id` enviando las líneas invertidas [cuentaB, cuentaA]
- THEN la respuesta devuelve las líneas con `orden` 1 = cuentaB y `orden` 2 = cuentaA
- AND la partida doble se mantiene válida (sin cambio de montos)

---

## REQ-DDL-UI-07 — Tests de componentes

Tests que cubren los escenarios críticos del reorden. Stack: Vitest + `@testing-library/react`
+ `@testing-library/user-event`. El backend se cubre con 1 test e2e (REQ-DDL-UI-06).

### 07.1 — `lineas-editor.test.tsx` (extensión)

- El editor renderiza dentro de un `DndContext`/`SortableContext` sin romper los tests existentes.
- Reorden vía la API de la librería (simular `onDragEnd` o helper) llama a `move(oldIndex, newIndex)` y reordena las filas.
- Los tests existentes (agregar/eliminar fila, totales, Alt+Delete) siguen verdes.

### 07.2 — `linea-row.test.tsx` (extensión)

- La fila renderiza un handle de arrastre con `aria-label` accesible.
- El handle está deshabilitado cuando `disabled` (editorDisabled) es true.
- El handle está habilitado cuando `disabled` es false.
- `key={field.id}` se preserva (no se introduce `key={index}`).

**Criterios transversales**:

- Sin `any` (excepto `Partial<T>` en mocks donde sea impracticable); `unknown` + narrowing.
- `noUncheckedIndexedAccess`: narrow `array[i]` antes de operar.
- Queries por rol/label (`getByRole`, `getByLabelText`), no `data-testid` como primera opción.
- `getAllByText()` cuando hay totales o tablas duplicadas (Anti-JSDOM-dup).
- `afterEach(() => vi.clearAllMocks())`.

---

## Índice de requisitos

| REQ | Título | Escenarios |
|-----|--------|-----------|
| REQ-DDL-UI-01 | Handle de arrastre dedicado por fila | 2 |
| REQ-DDL-UI-02 | Reordenar por arrastre (pointer) | 3 |
| REQ-DDL-UI-03 | Reordenar por teclado (accesibilidad) | 2 |
| REQ-DDL-UI-04 | Drag deshabilitado en contabilizado bloqueado | 2 |
| REQ-DDL-UI-05 | Preservar foco e identidad de fila | 2 |
| REQ-DDL-UI-06 | Persistencia del orden (contrato backend) | 1 |
| REQ-DDL-UI-07 | Tests de componentes | Sub-escenarios en §07.1–07.2 |

---

## Decisiones cerradas reflejadas (trazabilidad)

| Decisión | REQ que la implementa |
|---|---|
| Librería @dnd-kit (pointer + KeyboardSensor) | REQ-DDL-UI-02, REQ-DDL-UI-03 |
| Handle dedicado, no fila entera (no choca con inputs) | REQ-DDL-UI-01 |
| Sin DragOverlay con `<tr>` (animación in-place) | REQ-DDL-UI-02 |
| Drag deshabilitado cuando `editorDisabled` | REQ-DDL-UI-04 |
| `fieldArray.move()` + `key={field.id}` (anti salto de foco) | REQ-DDL-UI-05 |
| Front manda array reordenado; backend deriva `orden = idx + 1` | REQ-DDL-UI-06 |
| Sin migración, sin cambios de schema/service/repo/DTO | (fuera de scope) |
