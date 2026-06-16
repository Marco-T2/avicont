# Proposal — `cuenta-actividad-flujo-ui`

## Qué

Exponer el campo existente `Cuenta.actividadFlujo` (enum `ActividadFlujo`:
`EFECTIVO` / `OPERACION` / `INVERSION` / `FINANCIACION`, nullable) en la API y en
la UI del plan de cuentas, para que el contador pueda **clasificar manualmente**
cuentas y mejorar la calidad del Estado de Flujo de Efectivo (EFE).

El campo ya vive en `schema.prisma` (línea 416) y en la BD; el EFE backend ya lo
consume con una heurística de 3 capas. Lo único que falta es la **superficie de
edición**: hoy no aparece en ningún DTO ni en la pantalla, así que ninguna cuenta
puede marcarse explícitamente y el EFE solo muestra la señal de calidad "cuentas
identificadas por heurística, ninguna marcada como EFECTIVO".

## Por qué

- El EFE depende de la heurística porque no hay forma de fijar la clasificación a
  mano. Para cuentas ambiguas (equivalentes de efectivo, partidas de inversión vs
  operación) el contador necesita poder anclar la actividad explícitamente.
- El trabajo es chico y de bajo riesgo: la columna ya existe, no hay migración, no
  hay permiso nuevo. Es enchufar el campo en el flujo de edición existente.

## Alcance

### In-scope

- **Backend**: exponer `actividadFlujo` SOLO en `UpdateCuentaDto` (editable vía
  `PATCH /api/cuentas/:id`), persistirlo, y devolverlo en `CuentaResponseDto`.
  Aceptar los 4 valores del enum y `null` (limpiar la clasificación → volver a la
  heurística automática). Propagar el campo por dominio (`Cuenta`), port
  (`ActualizarCuentaData`), service (`actualizar`), adapter (`toDominio` +
  mapper de enum) y response.
- **Frontend**: `<Select>` con las 4 opciones + "— Sin clasificar (heurística
  automática) —" en `cuenta-form`, visible **solo en modo edición**. Zod schema,
  labels, mapeo de form, y body del `PATCH`.
- Regenerar `openapi.json` (backend) y `api.generated.ts` + ancla de tipo en
  `api.ts` (frontend) para que el job CI `contract-drift` quede verde.

### Out-of-scope (NO tocar)

- **`CreateCuentaDto`** — el campo no se expone en creación. La heurística cubre el
  día cero; el contador clasifica después vía PATCH. El `<Select>` se oculta
  directamente en modo create.
- **Migración** — la columna ya está en la BD (`schema.prisma:416`). Cero cambios
  de schema.
- **Permiso nuevo** — se reusa `contabilidad.plan-cuentas.update`. No se toca el
  catálogo RBAC.
- **Heurística del EFE** — no se modifica el reporte; solo se le habilita una fuente
  de datos explícita que antes no podía poblarse.

## Módulos afectados

- `backend/src/cuentas/**` (dominio, dto, port, service, adapter, enum-mapper, tests)
- `frontend/src/features/plan-cuentas/**` (schema, form, api, tests)
- `frontend/src/types/api.ts` + `api.generated.ts` (regenerado)
- `backend/openapi.json` (regenerado)

## Plan de rollback

Trivial: `git revert` del PR. No hay migración que revertir (la columna preexiste y
queda intacta), no hay permiso nuevo que limpiar, y las cuentas que ya tengan
`actividadFlujo` seteado por este flujo siguen siendo datos válidos que el EFE sabe
consumir. Revertir solo quita la superficie de edición; la BD no cambia de forma.
