# comprobante-contacto-linea-ui Specification

## Purpose

Selector de contacto por línea de comprobante en UI (frontend).
El backend valida `requiereContacto` y acepta `contactoId` en `LineaComprobanteDto`.
Esta spec cubre exclusivamente el comportamiento UI observable: búsqueda, validación visual,
preservación en edición, visualización en read-only, manejo de errores.

---

## Requirements

### Requirement: Selector de contacto en `linea-row.tsx`

El componente `linea-row.tsx` DEBE incluir un campo `ContactoCombobox` para seleccionar
un contacto por búsqueda server-side (`GET /api/contactos?q=<término>&activo=true`).
El campo DEBE estar siempre visible en la fila de línea (no condicionado a `requiereContacto`),
pero el requerimiento visual se activa según el siguiente requisito.

#### Scenario: El combobox aparece en cada fila de línea

- GIVEN el editor de comprobante abierto con al menos una línea
- WHEN se renderiza la tabla de líneas
- THEN cada fila muestra un campo "Contacto" con el combobox de búsqueda

#### Scenario: Búsqueda server-side encuentra contacto por nombre

- GIVEN el combobox de contacto de una línea abierto
- WHEN el usuario tipea "Avícola"
- THEN el combobox busca en `GET /api/contactos?q=Avícola&activo=true` y muestra los resultados con `razonSocial`

#### Scenario: Sin resultados muestra estado vacío

- GIVEN el combobox abierto y el usuario tipea un nombre inexistente
- WHEN la búsqueda devuelve cero resultados
- THEN el combobox muestra "Sin resultados" (no error, no spinner infinito)

#### Scenario: Seleccionar contacto fija el valor en la línea

- GIVEN el usuario ve resultados en el combobox
- WHEN selecciona un contacto de la lista
- THEN el campo muestra `razonSocial` del contacto y el form registra `contactoId` en la línea correspondiente

#### Scenario: Búsqueda debouncada no emite requests por keystroke

- GIVEN el combobox abierto
- WHEN el usuario tipea "Av" rápidamente (varios keystrokes en < 300 ms)
- THEN solo se emite una request al backend tras el debounce, no una por keystroke

---

### Requirement: Validación visual cuando `requiereContacto = true`

Cuando la cuenta asignada a la línea tiene `requiereContacto = true`, el campo
Contacto DEBE marcarse visualmente como requerido. El campo DEBE mostrar
un mensaje de error inline si el usuario intenta contabilizar sin haberlo completado.
Guardar como BORRADOR NO DEBE bloquearse por falta de contacto.

#### Scenario: Línea con `requiereContacto = true` y sin contacto marca el campo

- GIVEN una línea cuya cuenta tiene `requiereContacto = true`
- WHEN el campo Contacto está vacío
- THEN el label muestra indicador de requerido (asterisco o similar) y el campo tiene `aria-invalid="true"`

#### Scenario: Línea con `requiereContacto = false` no marca el campo como requerido

- GIVEN una línea cuya cuenta tiene `requiereContacto = false`
- WHEN el campo Contacto está vacío
- THEN el campo no muestra indicador de requerido ni `aria-invalid`

#### Scenario: Guardar BORRADOR con contacto faltante no bloquea

- GIVEN una línea con `requiereContacto = true` y sin contacto asignado
- WHEN el usuario hace clic en "Guardar" (guardar borrador)
- THEN el comprobante se guarda en estado BORRADOR sin error por el contacto

#### Scenario: Intento de contabilizar con contacto faltante muestra aviso

- GIVEN al menos una línea con `requiereContacto = true` y sin contacto asignado
- WHEN el usuario hace clic en "Contabilizar"
- THEN la UI muestra un aviso claro en español indicando qué líneas requieren contacto
- AND el botón "Contabilizar" no dispara la request hasta que el usuario complete el campo

---

### Requirement: Preservar contacto en comprobante existente (mode=edit)

Al abrir un comprobante existente que ya tiene líneas con `contactoId`,
el selector DEBE mostrar el nombre del contacto (`razonSocial`) en el campo,
no el UUID ni un campo vacío.

#### Scenario: Apertura de comprobante con contacto asignado muestra el nombre

- GIVEN un comprobante con una línea que tiene `contactoId = "uuid-abc"` cuya `razonSocial = "Avícola Sur"`
- WHEN el usuario abre el form de edición
- THEN el campo Contacto de esa línea muestra "Avícola Sur"

#### Scenario: Edición no pierde el contacto ya asignado al cambiar otro campo

- GIVEN una línea con contacto asignado visible en el combobox
- WHEN el usuario edita la glosa de la línea
- THEN el campo Contacto mantiene "Avícola Sur" sin perder el valor

---

### Requirement: Detalle read-only muestra nombre del contacto

En el detalle read-only del comprobante (`comprobante-detail-page.tsx`),
cada línea que tiene `contactoId` DEBE mostrar el `razonSocial` del contacto,
no el UUID. Líneas sin contacto NO DEBEN mostrar el campo o DEBEN mostrar "—".

#### Scenario: Línea con contacto muestra `razonSocial` en read-only

- GIVEN un comprobante en detalle read-only con una línea que tiene `contactoId`
- WHEN se renderiza la tabla de líneas
- THEN la columna Contacto de esa línea muestra `razonSocial`, no el UUID

#### Scenario: Línea sin contacto muestra guión en read-only

- GIVEN una línea sin `contactoId` en el detalle read-only
- WHEN se renderiza la tabla
- THEN la columna Contacto muestra "—" (no vacío, no UUID null)

#### Scenario: Loading de nombres en read-only muestra skeleton

- GIVEN el detalle cargando los contactos de las líneas
- WHEN la respuesta del backend no ha llegado
- THEN la columna Contacto muestra skeletons por cada fila pendiente

---

### Requirement: Manejo de errores del backend al contabilizar

La UI DEBE capturar y mostrar en español los errores específicos del backend
relacionados con contactos, devueltos al intentar contabilizar.

| Code backend | Mensaje al usuario |
|---|---|
| `CONTACTO_REQUERIDO` | "La línea N requiere un contacto. Asigná uno antes de contabilizar." |
| `CONTACTO_INACTIVO` | "El contacto asignado en la línea N está inactivo. Cambialo antes de contabilizar." |
| `CONTACTO_REFERENCIADO_NO_EXISTE` | "El contacto de la línea N ya no existe en esta organización." |

#### Scenario: Error `CONTACTO_REQUERIDO` muestra mensaje por línea

- GIVEN el usuario contabiliza un comprobante con una línea sin contacto donde `requiereContacto = true`
- WHEN el backend responde con `CONTACTO_REQUERIDO`
- THEN se muestra "La línea N requiere un contacto. Asigná uno antes de contabilizar."
- AND el campo Contacto de esa línea queda marcado con `aria-invalid="true"`

#### Scenario: Error `CONTACTO_INACTIVO` muestra mensaje accionable

- GIVEN el usuario contabiliza y el contacto de una línea fue desactivado
- WHEN el backend responde con `CONTACTO_INACTIVO`
- THEN se muestra "El contacto asignado en la línea N está inactivo. Cambialo antes de contabilizar."

#### Scenario: Error `CONTACTO_REFERENCIADO_NO_EXISTE` muestra mensaje accionable

- GIVEN el contacto seleccionado fue eliminado entre la carga y el intento de contabilizar
- WHEN el backend responde con `CONTACTO_REFERENCIADO_NO_EXISTE`
- THEN se muestra "El contacto de la línea N ya no existe en esta organización."

---

### Requirement: Accesibilidad del campo Contacto

El campo Contacto en cada fila DEBE cumplir los requisitos mínimos de accesibilidad
del frontend (CLAUDE.md §10).

#### Scenario: Label asociado al combobox

- GIVEN una línea renderizada en el editor
- WHEN se inspecciona el DOM del campo Contacto
- THEN existe un `<label>` con `htmlFor` apuntando al input del combobox, o el combobox expone `aria-label`

#### Scenario: Campo inválido expone `aria-invalid`

- GIVEN una línea con `requiereContacto = true` y sin contacto, tras intento de contabilizar
- WHEN se inspecciona el DOM
- THEN el input del combobox tiene `aria-invalid="true"` y hay un mensaje de error visible asociado

#### Scenario: Mensaje de error legible por lectores de pantalla

- GIVEN el campo Contacto con error visible
- WHEN un lector de pantalla inspecciona el campo
- THEN el mensaje de error está en el DOM como texto visible (no solo color rojo) y asociado al input

---

### Requirement: Tests de lógica y componentes

Tests que cubren los escenarios críticos del selector y la validación condicional.
Stack: Vitest + `@testing-library/react` + `@testing-library/user-event`.

#### Sub-requirement: `contacto-combobox.test.tsx`

- Renderiza sin errores con `value=null`.
- Tipear término dispara `onSearch` (o el hook) tras debounce; no por keystroke.
- Seleccionar opción llama `onChange` con el `id` del contacto.
- Sin resultados: muestra "Sin resultados", no error.

#### Sub-requirement: `linea-row.test.tsx` (extensión del test existente)

- Cuenta con `requiereContacto = true` + contacto vacío: campo Contacto tiene `aria-invalid`.
- Cuenta con `requiereContacto = false`: campo Contacto sin `aria-invalid`.
- Contacto asignado en edición: campo muestra `razonSocial`.

#### Sub-requirement: Validación pre-contabilizar

- Al menos una línea con `requiereContacto = true` y sin contacto: botón "Contabilizar" no despacha la mutación; se muestra aviso.
- Todas las líneas con `requiereContacto` satisfecho: "Contabilizar" procede.

**Criterios transversales**:
- Sin `any` (excepto `Partial<T>` en mocks donde sea impracticable).
- Queries por rol/label (`getByRole`, `getByLabelText`), no `data-testid` como primera opción.
- `afterEach(() => vi.clearAllMocks())`.

---

## Requirements Index

| REQ | Title | Scenarios |
|-----|-------|-----------|
| Selector de contacto en `linea-row.tsx` | Selector de contacto en `linea-row.tsx` | 5 |
| Validación visual cuando `requiereContacto = true` | Validación visual cuando `requiereContacto = true` | 4 |
| Preservar contacto en mode=edit | Preservar contacto en comprobante existente (mode=edit) | 2 |
| Detalle read-only muestra nombre | Detalle read-only muestra nombre del contacto | 3 |
| Manejo de errores backend | Manejo de errores del backend al contabilizar | 3 |
| Accesibilidad | Accesibilidad del campo Contacto | 3 |
| Tests | Tests de lógica y componentes | Sub-reqs en 07.1–07.3 |

---

## Traceability

Este spec fue creado como resultado de la change `comprobante-contacto-linea-ui`,
archivada el 2026-05-29. Es el spec principal (source of truth) para toda implementación
futura de selector de contacto por línea de comprobante en frontend.
