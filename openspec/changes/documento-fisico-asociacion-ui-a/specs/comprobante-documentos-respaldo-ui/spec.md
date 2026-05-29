# comprobante-documentos-respaldo-ui Specification

## Purpose

Sección "Documentos de respaldo" inline dentro del form/detalle del comprobante.
Permite buscar un documento físico existente o crear uno nuevo y asociarlo,
todo sin salir de la pantalla del comprobante. También permite desasociar.
Dos contextos: editable (BORRADOR | CONTABILIZADO en período abierto) y
read-only (BLOQUEADO | anulado).

---

## Requirements

### Requirement: Gating editable vs read-only

La sección DEBE renderizar en modo **editable** cuando el comprobante está
en estado `BORRADOR`, o en estado `CONTABILIZADO` con su período fiscal abierto.
La sección DEBE renderizar en modo **read-only** (sin botones de acción) cuando
el comprobante está en estado `BLOQUEADO` o tiene flag `anulado = true`.

#### Scenario: BORRADOR muestra sección editable

- GIVEN un comprobante en estado `BORRADOR`
- WHEN el usuario abre el form de edición
- THEN la sección "Documentos de respaldo" muestra el combobox y botones de desasociar

#### Scenario: CONTABILIZADO período abierto muestra sección editable

- GIVEN un comprobante `CONTABILIZADO` cuyo período fiscal está `ABIERTO`
- WHEN el usuario abre el detalle
- THEN la sección muestra el combobox y botones de desasociar

#### Scenario: BLOQUEADO muestra sección read-only

- GIVEN un comprobante en estado `BLOQUEADO`
- WHEN el usuario abre el detalle
- THEN la sección muestra la lista de documentos asociados sin botones de acción

#### Scenario: Anulado muestra sección read-only

- GIVEN un comprobante con `anulado = true`
- WHEN el usuario abre el detalle
- THEN la sección muestra la lista de documentos asociados sin botones de acción

---

### Requirement: Lista de documentos asociados

La sección DEBE mostrar la lista de documentos físicos asociados al comprobante,
con hasta 50 ítems. Cada ítem DEBE mostrar: tipo (nombre), número, fecha de
emisión, y monto/moneda si el tipo es tributario.

#### Scenario: Lista con documentos asociados

- GIVEN un comprobante con 2 documentos físicos asociados
- WHEN la sección carga
- THEN se muestran ambos documentos con tipo, número, fecha e indicador de monto si aplica

#### Scenario: Lista vacía

- GIVEN un comprobante sin documentos físicos asociados
- WHEN la sección carga
- THEN se muestra un estado vacío (sin ítems, sin error)

#### Scenario: Lista en estado loading

- GIVEN la sección iniciando la consulta `GET /comprobantes/:id/documentos-fisicos`
- WHEN la respuesta aún no llegó
- THEN se muestran skeletons en lugar de la lista

---

### Requirement: Pre-filtro de compatibilidad en el combobox

El combobox DEBE buscar solo documentos cuyo `tipo.tiposComprobanteAplicables`
incluye el tipo del comprobante en pantalla. El filtro DEBE aplicarse en la
query de búsqueda (parámetro `tipoComprobanteAplicable`), no en client-side post-fetch.

#### Scenario: Combobox solo muestra tipos compatibles

- GIVEN un comprobante de tipo `EGRESO`
- WHEN el usuario abre el combobox de búsqueda
- THEN solo aparecen documentos cuyo tipo tiene `EGRESO` en `tiposComprobanteAplicables`

#### Scenario: Tipo incompatible no aparece en la lista

- GIVEN un documento físico cuyo tipo tiene `tiposComprobanteAplicables = ['INGRESO']`
- WHEN el usuario busca en el combobox de un comprobante `EGRESO`
- THEN ese documento NO aparece en los resultados

---

### Requirement: Buscar documento existente y asociar

El combobox DEBE permitir buscar documentos físicos por número. Al seleccionar
uno, la UI DEBE llamar `POST /comprobantes/:id/documentos-fisicos` con el id
del documento seleccionado y refrescar la lista.

#### Scenario: Búsqueda encuentra documento y lo asocia

- GIVEN el combobox abierto y el usuario tipea "F-001"
- WHEN aparece el documento "F-001" en resultados y el usuario lo selecciona
- THEN se llama el endpoint de asociación y el documento aparece en la lista

#### Scenario: Búsqueda sin resultados muestra opción "Crear nuevo"

- GIVEN el usuario tipea "XYZ-999" en el combobox y no hay coincidencias
- WHEN los resultados se renderizan
- THEN aparece únicamente la opción "Crear nuevo documento"

#### Scenario: Combobox cierra tras asociación exitosa

- GIVEN el usuario seleccionó un documento existente
- WHEN la mutación de asociación se completa con éxito
- THEN el combobox se cierra y el input queda vacío

---

### Requirement: Crear documento inline y asociar

Cuando el usuario elige "Crear nuevo", la UI DEBE mostrar un mini-form inline
con los campos: tipo (select), número, fecha de emisión. Los campos
monto y moneda DEBEN mostrarse solo si el tipo seleccionado tiene `esTributario = true`.
Al confirmar, la UI DEBE crear el documento y asociarlo en dos pasos secuenciales
(POST `/documentos-fisicos` → POST `/comprobantes/:id/documentos-fisicos`).

#### Scenario: Mini-form sin monto para tipo no tributario

- GIVEN el usuario elige "Crear nuevo" y selecciona un tipo con `esTributario = false`
- WHEN el mini-form se renderiza
- THEN los campos monto y moneda NO aparecen

#### Scenario: Mini-form con monto para tipo tributario

- GIVEN el usuario elige "Crear nuevo" y selecciona un tipo con `esTributario = true`
- WHEN el mini-form se renderiza
- THEN los campos monto (> 0) y moneda (BOB | USD) aparecen como obligatorios

#### Scenario: Crear inline y asociar exitoso

- GIVEN el mini-form con datos válidos (tipo, número, fecha)
- WHEN el usuario confirma
- THEN se crea el documento y se asocia al comprobante; aparece en la lista

#### Scenario: Botón "Confirmar" deshabilitado mientras pending

- GIVEN el usuario confirmó el mini-form
- WHEN la operación está en curso
- THEN el botón muestra spinner y está `disabled`

#### Scenario: Número duplicado al crear inline

- GIVEN existe un documento con el mismo tipo y número en el tenant
- WHEN el usuario intenta crear ese documento inline
- THEN se muestra el mensaje de error de conflicto en el mini-form (no toast genérico)

---

### Requirement: Desasociar documento

En modo editable, cada ítem de la lista DEBE mostrar un botón de desasociar.
Al confirmar, la UI DEBE llamar `DELETE /comprobantes/:id/documentos-fisicos/:docId`
y refrescar la lista.

#### Scenario: Desasociar exitoso

- GIVEN un comprobante editable con un documento asociado
- WHEN el usuario hace clic en desasociar y confirma
- THEN el documento deja de aparecer en la lista

#### Scenario: Read-only no muestra botón desasociar

- GIVEN un comprobante en estado `BLOQUEADO`
- WHEN la sección carga
- THEN ningún ítem tiene botón de desasociar

---

### Requirement: Manejo de errores accionables

La UI DEBE mostrar mensajes en español que correspondan al código de error
específico del backend, no el mensaje genérico de HTTP.

| Code backend | Mensaje al usuario |
|---|---|
| `DOCUMENTO_FISICO_YA_ASOCIADO_A_OTRO_CONTABILIZADO` | "Este documento ya está asociado a otro asiento contabilizado." |
| `SIN_PERMISO_EDITAR_CONTABILIZADO` | "No tienes permiso para modificar un asiento contabilizado." |
| `COMPROBANTE_DOCUMENTO_ASOCIACION_PERIODO_CERRADO` / `COMPROBANTE_NO_EDITABLE_ESTADO_INVALIDO` | "El período fiscal está cerrado. No se puede modificar el asiento." |
| `TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE` | "Este tipo de documento no es compatible con el tipo de comprobante." |

#### Scenario: Error 409 ya asociado muestra mensaje accionable

- GIVEN el usuario intenta asociar un documento ya vinculado a otro contabilizado
- WHEN el backend responde 409 `DOCUMENTO_FISICO_YA_ASOCIADO_A_OTRO_CONTABILIZADO`
- THEN se muestra "Este documento ya está asociado a otro asiento contabilizado."

#### Scenario: Error 403 sin permiso editar contabilizado

- GIVEN el usuario sin permiso `asientos.edit-posted` intenta asociar en un comprobante `CONTABILIZADO`
- WHEN el backend responde 403 `SIN_PERMISO_EDITAR_CONTABILIZADO`
- THEN se muestra "No tienes permiso para modificar un asiento contabilizado."

#### Scenario: Error 409 período cerrado

- GIVEN el comprobante corresponde a un período que fue cerrado entre la carga y la acción
- WHEN el backend responde 409 período cerrado
- THEN se muestra "El período fiscal está cerrado. No se puede modificar el asiento."

#### Scenario: Error 422 tipo incompatible (caso residual)

- GIVEN el pre-filtro no bloqueó la acción y el backend rechaza con 422 `TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE`
- WHEN la mutación falla
- THEN se muestra "Este tipo de documento no es compatible con el tipo de comprobante."
