# Design — `cuenta-actividad-flujo-ui`

## Resumen

Enchufar `Cuenta.actividadFlujo` (ya en BD) en el flujo de edición de cuentas y en
la UI del plan de cuentas. Cambio chico, sin migración, sin permiso nuevo. El grueso
es propagación de un campo a través de las capas hexagonales del módulo `cuentas` y
clonado del patrón de `<Select>` con sentinel ya existente en el frontend.

## Decisiones técnicas

### D1 — Solo `UpdateCuentaDto`, nunca `CreateCuentaDto`

`actividadFlujo` es no-estructural y editable siempre. La heurística del EFE cubre el
día cero (cuentas recién creadas sin clasificar caen en la heurística por
subClaseCuenta/código). Exponerlo en creación agregaría ruido al alta sin valor:
el contador clasifica cuando lo necesita, después. Por eso solo `PATCH` lo acepta y
el `<Select>` se renderiza únicamente en modo edición.

**Importante**: NO agregar `actividadFlujo` a `CAMPOS_PROTEGIDOS_ESTRUCTURALES`
(`cuentas.service.ts:39`). Es mutable incluso con movimientos — clasificar el flujo
no cambia la estructura contable de la cuenta.

### D2 — Aceptar `null` explícito con class-validator

`@IsEnum(ActividadFlujo)` rechaza `null`, pero necesitamos `null` para limpiar la
clasificación (volver a la heurística). La distinción semántica es:

- **campo ausente** (`undefined`) → no tocar (spread condicional `!== undefined`).
- **`null` explícito** → limpiar a `NULL` en BD.

Solución en el DTO: `@ValidateIf((o) => o.actividadFlujo !== null)` antes de
`@IsEnum`, de modo que `null` salta la validación de enum y pasa como valor válido,
mientras un string fuera del enum sigue siendo rechazado (400). El campo se tipa
`actividadFlujo?: ActividadFlujo | null`.

En el service, el spread condicional ya usado para los otros campos
(`cuentas.service.ts:191-199`) se replica:
`...(dto.actividadFlujo !== undefined ? { actividadFlujo: dto.actividadFlujo } : {})`.
Esto respeta `exactOptionalPropertyTypes`: `undefined` nunca se pasa, y `null` (que
sí está definido) se propaga al port.

### D3 — Duplicar el mapper de enum en `cuentas/adapters` (convención §3.3)

Existe `toDominioActividadFlujo` en `reportes/adapters/enum-mappers.ts:85-94`, pero
la regla §3.3 prohíbe importar cross-module fuera de un port. `cuentas` no consume un
port de `reportes`, así que se DUPLICA el mapper en
`cuentas/adapters/enum-mappers.ts` (que ya tiene los mappers de Moneda /
ClaseCuenta / NaturalezaCuenta / SubClaseCuenta). Se agregan:

- `toDominioActividadFlujo(p: PrismaActividadFlujo): ActividadFlujo`
- `toPrismaActividadFlujo(d: ActividadFlujo): PrismaActividadFlujo`

Ambos con passthrough de `null` manejado en el call-site (el mapper opera sobre el
valor no-nulo; el adapter hace el guard de null). Es duplicación deliberada y barata
(4 valores), no deuda.

### D4 — Propagación en el adapter `toDominio`

`prisma-cuenta.repository.ts` `toDominio()` (~líneas 43-52) usa `...row` + sobreescribe
los enums. Se agrega `actividadFlujo: row.actividadFlujo === null ? null :
toDominioActividadFlujo(row.actividadFlujo)`. En `actualizar`, el `data` que llega del
port ya trae el valor de dominio; al persistir, mapear con `toPrismaActividadFlujo`
(o passthrough de null) — los enums de dominio y Prisma comparten literales, pero el
mapper explícito mantiene el boundary tipado y consistente con los demás campos.

### D5 — `Cuenta` (dominio puro) gana el campo

`cuenta.ts` (~línea 30) suma `actividadFlujo: ActividadFlujo | null`. Es dato puro,
sin lógica. `ActualizarCuentaData` (`cuenta.repository.port.ts:42-48`) suma
`actividadFlujo?: ActividadFlujo | null`.

### D6 — `CuentaResponseDto` ancla el contrato

Agregar `@ApiProperty({ enum: ActividadFlujo, nullable: true }) actividadFlujo!:
ActividadFlujo | null` y mapearlo en `toCuentaResponse()`. Esto es lo que hace que el
campo aparezca en `openapi.json` y, tras regenerar, en `api.generated.ts` — el ancla
de tipo del frontend.

### D7 — Frontend: `<Select>` con sentinel `__none__`, clonando subClaseCuenta

El patrón ya existe en `cuenta-form.tsx:284-313` (subClaseCuenta): `<Select>` con
`value={campo ?? '__none__'}`, un `<SelectItem value="__none__">` y `onValueChange`
que mapea `__none__ → undefined`. Se clona para `actividadFlujo`:

- `useWatch` para leer el campo (no inline en JSX — izar a const, regla del repo).
- Item none con label "— Sin clasificar (heurística automática) —".
- El bloque entero se renderiza SOLO en modo edición (guard por la prop/flag que el
  form ya usa para distinguir create vs edit; en create no se monta).

Zod (`cuenta-form-schema.ts`): `actividadFlujo` `.optional()` + constante
`LABELS_ACTIVIDAD_FLUJO` (mapa valor→etiqueta en español: Efectivo, Operación,
Inversión, Financiación). `mapCuentaToFormValues` suma el campo con spread condicional
(igual que subClaseCuenta).

`api/update-cuenta.ts`: agregar `actividadFlujo: values.actividadFlujo ?? null` al
body del PATCH — `undefined` del form se traduce a `null` explícito (limpiar).
Nota: como el form solo se monta en edición, no hay riesgo de enviar el campo en create.

### D8 — Ancla de tipo en `api.ts`

Tras regenerar `api.generated.ts`, agregar en `api.ts` (líneas 64-100) un
`ActividadFlujo` como `const satisfies Record<...>` anclado a
`Schemas['CuentaResponseDto']['actividadFlujo']`, siguiendo el patrón de los demás
enums del archivo. Esto garantiza que el enum del frontend no driftee del backend.

### D9 — Protocolo OpenAPI / contract-drift

El job CI `contract-drift` corre `git diff --exit-code` sobre `openapi.json` +
`api.generated.ts`. Hay que regenerar y commitear **ambos**:

1. Backend: `pnpm run openapi:dump` (desde `backend/`) → `openapi.json`.
2. Frontend: `pnpm run gen:api-types` (desde `frontend/`) → `api.generated.ts`.

NO editar `api.generated.ts` a mano. Si el diff queda sin commitear, CI rojo.

## Archivos a tocar

**Backend** (sin migración):

| Archivo | Cambio |
|---|---|
| `src/cuentas/domain/cuenta.ts` | `+ actividadFlujo: ActividadFlujo \| null` |
| `src/cuentas/adapters/enum-mappers.ts` | `+ toDominioActividadFlujo` / `toPrismaActividadFlujo` |
| `src/cuentas/adapters/prisma-cuenta.repository.ts` | map en `toDominio` + persist en `actualizar` |
| `src/cuentas/ports/cuenta.repository.port.ts` | `+ actividadFlujo?` en `ActualizarCuentaData` |
| `src/cuentas/dto/update-cuenta.dto.ts` | `+ actividadFlujo` con `@ValidateIf` + `@IsEnum` |
| `src/cuentas/dto/cuenta-response.dto.ts` | `+ actividadFlujo` en clase + `toCuentaResponse` |
| `src/cuentas/cuentas.service.ts` | spread condicional en `actualizar` |
| `src/cuentas/cuentas.service.spec.ts` | `cuentaFactory` + tests de `actualizar` |
| `openapi.json` | regenerado |

**Frontend**:

| Archivo | Cambio |
|---|---|
| `src/types/api.generated.ts` | regenerado (no manual) |
| `src/types/api.ts` | ancla `ActividadFlujo` const satisfies |
| `src/features/plan-cuentas/schemas/cuenta-form-schema.ts` | zod + `LABELS_ACTIVIDAD_FLUJO` + map |
| `src/features/plan-cuentas/components/cuenta-form.tsx` | `<Select>` solo en edición |
| `src/features/plan-cuentas/api/update-cuenta.ts` | `actividadFlujo` en body |
| `src/features/plan-cuentas/.../cuenta-form-schema.test.ts` | fixture |
| `src/features/plan-cuentas/.../cuenta-form.test.tsx` | fixture `SAMPLE` + assert |

## No incluido

- Sin migración (columna preexiste, `schema.prisma:416`).
- Sin permiso nuevo (reusa `contabilidad.plan-cuentas.update`).
- Sin error de dominio nuevo (es solo aceptar un valor más; los inválidos los rechaza
  la validación de class-validator con 400).
- Sin cambios en el reporte EFE.
