# Clasificación de actividad de flujo en cuentas — Especificación

<!--
Última edición: 2026-06-16
Última revisión contra core: 2026-06-16
Owner: backend-lead / frontend-lead
-->

> Fecha: 2026-06-16
> Fase: spec canónica
> Proyecto: avicont
> Capability: `cuenta-actividad-flujo`
> Alcance: FULL-STACK (backend + frontend, change `cuenta-actividad-flujo-ui` 2026-06-16)

---

## Propósito

El campo `Cuenta.actividadFlujo` permite al contador **clasificar manualmente** una
cuenta como `EFECTIVO`, `OPERACION`, `INVERSION` o `FINANCIACION`, anclando la
clasificación explícitamente en lugar de depender siempre de la heurística automática
del Estado de Flujo de Efectivo (EFE).

El campo ya existía en `schema.prisma` y en la BD desde la migración del EFE
(`20260616000000_estado_flujo_efectivo`), pero no estaba expuesto en ningún DTO ni en
la UI — las cuentas solo podían clasificarse por la heurística. Este change cierra ese
gap: expone el campo en `UpdateCuentaDto` y agrega un `<Select>` en el form de edición.

**Relación con el EFE**: el reporte EFE backend ya implementa la resolución en 3 capas
(explícito → heurística de código → heurística de subclase). Este change habilita la
capa 1 (explícito) por primera vez.

---

## Glosario

- **`actividadFlujo`**: campo nullable en `Cuenta` (enum `ActividadFlujo`). `NULL`
  significa "sin clasificar" — el EFE aplica su heurística automática.
- **Limpiar la clasificación**: enviar `actividadFlujo: null` vía PATCH → el campo
  queda en NULL → el EFE vuelve a la heurística para esa cuenta.
- **Sentinel `__none__`**: valor interno del `<Select>` frontend que representa `null`
  (el select no puede tener `value={null}` — se mapea `null ↔ '__none__'` en el
  form).
- **Spread condicional**: `...(dto.actividadFlujo !== undefined ? { actividadFlujo: dto.actividadFlujo } : {})` — `undefined` = no tocar; `null` = limpiar.

---

## Requirements (RFC 2119: MUST / MUST NOT / MAY)

---

### REQ-CAF-01 — El campo es editable vía `PATCH /api/cuentas/:id`

El sistema MUST permitir clasificar una cuenta con `actividadFlujo` mediante
`PATCH /api/cuentas/:id`, aceptando los 4 valores del enum (`EFECTIVO`, `OPERACION`,
`INVERSION`, `FINANCIACION`) o `null` (limpiar). El campo MUST NOT estar expuesto en
`CreateCuentaDto` (solo edición posterior).

El permiso requerido es el ya existente `contabilidad.plan-cuentas.update`. NO hay
permiso nuevo.

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

---

### REQ-CAF-02 — El campo aparece en `CuentaResponseDto`

El sistema MUST incluir `actividadFlujo` con su valor actual (o `null`) en
`CuentaResponseDto` en toda respuesta de obtención o actualización de cuentas.

#### Scenario: el response siempre incluye el campo

- **GIVEN** cualquier cuenta del tenant
- **WHEN** se la obtiene o actualiza (`GET` o `PATCH /api/cuentas/:id`)
- **THEN** el `CuentaResponseDto` MUST incluir `actividadFlujo` con su valor actual o
  `null`

---

### REQ-CAF-03 — Propagación hexagonal completa en el módulo `cuentas`

El campo MUST propagarse por todas las capas del módulo:

1. **Dominio**: `cuenta.ts` incluye `actividadFlujo: ActividadFlujo | null`.
2. **Port**: `ActualizarCuentaData` incluye `actividadFlujo?: ActividadFlujo | null`.
3. **Adapter**: `prisma-cuenta.repository.ts` mapea el campo en `toDominio()` (null
   passthrough) y lo persiste en `actualizar()`.
4. **Enum mapper**: `cuentas/adapters/enum-mappers.ts` tiene `toDominioActividadFlujo`
   y `toPrismaActividadFlujo` (DUPLICADO deliberado — §3.3 prohíbe importar de
   `reportes`; la duplicación es explícita y barata).
5. **Service**: spread condicional en `actualizar` (`undefined` → no tocar; `null` →
   limpiar).
6. **DTO**: `UpdateCuentaDto` con `@ValidateIf((o) => o.actividadFlujo !== null)` +
   `@IsEnum` para aceptar `null` pero rechazar strings fuera del enum.

---

### REQ-CAF-04 — `actividadFlujo` NO es campo estructural protegido

El campo MUST NOT agregarse a `CAMPOS_PROTEGIDOS_ESTRUCTURALES` en
`cuentas.service.ts`. Clasificar el flujo de una cuenta no altera su estructura
contable; MUST poder editarse en cualquier momento, incluso si la cuenta tiene
movimientos.

---

### REQ-CAF-05 — La UI muestra el selector SOLO en modo edición

El formulario de cuenta (`cuenta-form.tsx`) MUST mostrar un `<Select>` de
`actividadFlujo` **únicamente en modo edición**. En modo creación el control
MUST NOT renderizarse (el backend no acepta el campo al crear).

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

---

### REQ-CAF-06 — Sentinel `__none__` en el form (null ↔ select value)

El `<Select>` MUST usar el patrón de sentinel `__none__` (igual que `subClaseCuenta`
en el mismo form): `value={campo ?? '__none__'}`, con un `<SelectItem value="__none__">`
que al seleccionarse envía `actividadFlujo: null` al PATCH. El `useWatch` MUST izarse
a `const` fuera del JSX (regla del repo: `useWatch` es un hook).

---

### REQ-CAF-07 — OpenAPI / contract-drift

El campo `actividadFlujo` MUST aparecer en `openapi.json` (`CuentaResponseDto.actividadFlujo`
como enum nullable) y en `frontend/src/types/api.generated.ts` (regenerado). `api.ts`
MUST exportar el enum `ActividadFlujo` como `const satisfies Record<...>` anclado a
`Schemas['CuentaResponseDto']['actividadFlujo']`. El job CI `contract-drift` MUST
quedar verde (sin diff entre `openapi.json` + `api.generated.ts` commiteados y los
regenerados).

---

### REQ-CAF-08 — Sin migración, sin permiso nuevo

El campo ya existe en la BD (`schema.prisma:416`, migración `20260616000000_estado_flujo_efectivo`).
Este change MUST NOT generar ninguna migración de schema adicional. MUST NOT crear ningún
permiso nuevo en el catálogo RBAC; reusa `contabilidad.plan-cuentas.update`.

---

### REQ-CAF-09 — Multi-tenant aislado

El `PATCH /api/cuentas/:id` MUST aplicar el cambio SOLO sobre cuentas del tenant del
JWT activo. El `tenantId` es el primer predicado de la búsqueda de la cuenta
(§4.2 CLAUDE.md, Anti-31). Una cuenta de otro tenant con el mismo `id` MUST resultar
en 404 (no en actualización cross-tenant).

---

## Detalles de implementación

### Backend

| Archivo | Cambio |
|---|---|
| `backend/src/cuentas/domain/cuenta.ts` | `+ actividadFlujo: ActividadFlujo \| null` |
| `backend/src/cuentas/adapters/enum-mappers.ts` | `+ toDominioActividadFlujo` / `toPrismaActividadFlujo` |
| `backend/src/cuentas/adapters/prisma-cuenta.repository.ts` | map en `toDominio` + persist en `actualizar` |
| `backend/src/cuentas/ports/cuenta.repository.port.ts` | `+ actividadFlujo?` en `ActualizarCuentaData` |
| `backend/src/cuentas/dto/update-cuenta.dto.ts` | `actividadFlujo` con `@ValidateIf` + `@IsEnum` |
| `backend/src/cuentas/dto/cuenta-response.dto.ts` | `+ actividadFlujo` en clase + `toCuentaResponse` |
| `backend/src/cuentas/cuentas.service.ts` | spread condicional en `actualizar` |
| `backend/openapi.json` | regenerado (`pnpm run openapi:dump`) |

### Frontend

| Archivo | Cambio |
|---|---|
| `frontend/src/types/api.generated.ts` | regenerado (`pnpm run gen:api-types`, NO manual) |
| `frontend/src/types/api.ts` | `ActividadFlujo` const satisfies anclado a `Schemas['CuentaResponseDto']['actividadFlujo']` |
| `frontend/src/features/plan-cuentas/schemas/cuenta-form-schema.ts` | zod + `LABELS_ACTIVIDAD_FLUJO` + campo en `mapCuentaToFormValues` |
| `frontend/src/features/plan-cuentas/components/cuenta-form.tsx` | `<Select>` solo en modo edición, sentinel `__none__` |
| `frontend/src/features/plan-cuentas/api/update-cuenta.ts` | `actividadFlujo: values.actividadFlujo ?? null` en body del PATCH |

### Validación DTO (`UpdateCuentaDto`)

```typescript
// La distinción clave: undefined = omitido (no tocar); null = limpiar.
@ApiPropertyOptional({ enum: ActividadFlujo, nullable: true })
@IsOptional()
@ValidateIf((o) => o.actividadFlujo !== null)  // null salta la validación de enum
@IsEnum(ActividadFlujo)
actividadFlujo?: ActividadFlujo | null;
```

### Spread condicional en el service (`cuentas.service.ts`)

```typescript
// exactOptionalPropertyTypes: undefined nunca se pasa; null (definido) sí se propaga.
...(dto.actividadFlujo !== undefined ? { actividadFlujo: dto.actividadFlujo } : {})
```

---

## Cobertura de tests

- **`cuentas.service.spec.ts`**: factory + 3 tests de `actualizar` (clasificar, limpiar,
  omitir). Verde: 97 tests totales del módulo cuentas.
- **`update-cuenta.dto.spec.ts`**: 8 tests de validación (valores válidos, null, omitido,
  valor fuera del enum).
- **Frontend**: `cuenta-form-schema.test.ts` (fixture + caso opcional) +
  `cuenta-form.test.tsx` (aparece en edición, no aparece en creación). 1396 vitest total.

---

## Plan de rollback

Trivial: `git revert` del PR. No hay migración que revertir (la columna preexiste y queda
intacta), no hay permiso nuevo que limpiar. Las cuentas que ya tengan `actividadFlujo`
seteado por este flujo siguen siendo datos válidos que el EFE sabe consumir. Revertir
solo quita la superficie de edición; la BD no cambia de forma.
