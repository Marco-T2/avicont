# Spec delta — Plan de cuentas: clasificación de actividad de flujo de efectivo

> Capability: plan de cuentas (`cuentas`). Esta delta AGREGA requisitos sobre la
> edición de cuentas. No modifica creación ni los invariantes estructurales.

## ADDED Requirements

### Requirement: La cuenta puede clasificarse con una actividad de flujo de efectivo

El sistema MUST permitir asignar a una cuenta una `actividadFlujo` opcional, uno de
`EFECTIVO`, `OPERACION`, `INVERSION`, `FINANCIACION`, vía la edición de la cuenta. El
campo MUST ser nullable: `null` significa "sin clasificar", y el reporte EFE MUST
recurrir a su heurística automática para esas cuentas. La clasificación MUST poder
editarse en cualquier momento (no es un campo estructural protegido).

El campo `actividadFlujo` MUST NOT exponerse en la creación de cuentas: solo se
clasifica vía edición posterior.

#### Scenario: clasificar una cuenta con un valor válido

- **GIVEN** una cuenta existente del tenant
- **WHEN** se envía `PATCH /api/cuentas/:id` con `actividadFlujo: "INVERSION"` y el
  usuario tiene el permiso `contabilidad.plan-cuentas.update`
- **THEN** la respuesta MUST ser 200 con `actividadFlujo: "INVERSION"` en el
  `CuentaResponseDto`
- **AND** la cuenta persistida MUST quedar con `actividadFlujo = INVERSION`

#### Scenario: limpiar la clasificación volviendo a la heurística

- **GIVEN** una cuenta con `actividadFlujo = "EFECTIVO"`
- **WHEN** se envía `PATCH /api/cuentas/:id` con `actividadFlujo: null`
- **THEN** la respuesta MUST ser 200 con `actividadFlujo: null`
- **AND** la cuenta persistida MUST quedar con `actividadFlujo = NULL` (el EFE vuelve
  a aplicar la heurística para esa cuenta)

#### Scenario: omitir el campo no altera la clasificación existente

- **GIVEN** una cuenta con `actividadFlujo = "OPERACION"`
- **WHEN** se envía `PATCH /api/cuentas/:id` actualizando solo `nombre`, sin incluir
  `actividadFlujo`
- **THEN** la respuesta MUST ser 200
- **AND** la cuenta MUST conservar `actividadFlujo = OPERACION` (omitir ≠ limpiar)

#### Scenario: rechazar un valor fuera del enum

- **GIVEN** una cuenta existente del tenant
- **WHEN** se envía `PATCH /api/cuentas/:id` con `actividadFlujo: "CAJA"` (no es un
  valor del enum)
- **THEN** la respuesta MUST ser 400 (validación) y la cuenta MUST NOT cambiar

#### Scenario: el response siempre incluye el campo

- **GIVEN** cualquier cuenta del tenant
- **WHEN** se la obtiene o actualiza (`GET`/`PATCH /api/cuentas/:id`)
- **THEN** el `CuentaResponseDto` MUST incluir `actividadFlujo` con su valor actual o
  `null`

### Requirement: La UI permite clasificar la actividad de flujo solo al editar

El formulario de cuenta MUST mostrar un control de selección de `actividadFlujo`
**únicamente en modo edición**. En modo creación el control MUST NOT renderizarse
(el backend no acepta el campo al crear).

#### Scenario: editar muestra el selector con las opciones

- **GIVEN** el formulario de cuenta abierto en modo edición
- **THEN** el usuario MUST ver un `<Select>` con las cuatro opciones (Efectivo,
  Operación, Inversión, Financiación) más una opción "— Sin clasificar (heurística
  automática) —"
- **AND** al elegir "Sin clasificar" y guardar, el `PATCH` MUST enviar
  `actividadFlujo: null`

#### Scenario: crear no muestra el selector

- **GIVEN** el formulario de cuenta abierto en modo creación
- **THEN** el control de `actividadFlujo` MUST NOT estar presente en el DOM
