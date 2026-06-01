# Spec: granja-tipos-registro

> Fecha: 2026-06-01
> Fase: spec
> Change: granja-v1
> Proyecto: avicont
> Fuente de verdad del modelo: `docs/disenos/granja.md` §4.2 (`TipoRegistro`), §5.3, §6

## Purpose

Catálogo per-org de `TipoRegistro` — la pieza configurable que clasifica cada
movimiento. Cada tipo declara su `naturaleza` (`INVERSION` o `CANTIDAD`), lo que
enruta cada movimiento a su tabla. El catálogo viene con tipos de fábrica
(`esSistema = true`), sembrados al activar el vertical de forma idempotente, y
el granjero agrega los suyos (`esSistema = false`). Los de sistema no se borran
ni se les cambia el nombre ni la naturaleza; sí se pueden desactivar.

## Glosario

| Término | Definición |
|---------|-----------|
| **TipoRegistro** | Clasificación configurable de un movimiento. Único por `(organizationId, nombre)`. |
| **naturaleza** | Enum de dominio propio `NaturalezaRegistro`: `INVERSION` \| `CANTIDAD`. Declara a qué tabla de movimiento pertenece el tipo. Inmutable tras crear. |
| **esSistema** | `true` = sembrado de fábrica al activar granja, no se elimina ni se renombra. `false` = creado por el granjero. |
| **activo** | Soft-disable (default `true`). Un tipo inactivo no puede usarse en movimientos nuevos. |
| **seed de fábrica** | 12 tipos predefinidos: 11 de `INVERSION` + Mortalidad (`CANTIDAD`). Sembrados al activar granja, idempotentes vía upsert por `(organizationId, nombre, naturaleza)`. |

---

## Requirements

### Requirement: Seed de tipos de fábrica al activar el vertical

El sistema DEBE sembrar 12 `TipoRegistro` de fábrica (`esSistema = true`) en la
org cuando el vertical granja se activa (`granjaEnabled` pasa a `true`). El seed
DEBE ser **idempotente**: invocarlo más de una vez NO crea duplicados (upsert
por `(organizationId, nombre, naturaleza)`). Los 12 tipos son — `INVERSION`:
Compra de pollitos, Alimento, Alquiler Galpón, Mantenimiento Galpón, Vacunas,
Veterinario, Mano de Obra, Chala, Garrafas (gas), Agua y Luz, Otros gastos;
`CANTIDAD`: Mortalidad.

#### Scenario: Activar granja siembra los 12 tipos de fábrica

- GIVEN una org sin tipos de registro y `granjaEnabled = false`
- WHEN se activa `granjaEnabled = true`
- THEN se crean exactamente 12 `TipoRegistro` con `esSistema = true` (11 `INVERSION` + 1 `CANTIDAD` "Mortalidad")

#### Scenario: Seed idempotente — re-activar no duplica

- GIVEN una org que ya tiene los 12 tipos de fábrica sembrados
- WHEN el seeder se invoca de nuevo (p.ej. `updateFeatures(granjaEnabled=true)` se repite)
- THEN siguen existiendo exactamente 12 tipos `esSistema` (ningún duplicado), y los tipos propios del granjero quedan intactos

---

### Requirement: Listar tipos de registro

El sistema DEBE permitir que un usuario con permiso `granja.tipos-registro.read`
liste los `TipoRegistro` de su org (de fábrica + propios), incluyendo inactivos.
El listado NO DEBE incluir tipos de otras orgs.

#### Scenario: Listado mezcla fábrica y propios de la org

- GIVEN una org con 12 tipos de fábrica y 2 tipos propios ("Fletes", "Descarte")
- WHEN el usuario lista los tipos
- THEN recibe los 14 tipos, marcando cuáles son `esSistema`

#### Scenario: Aislamiento — no listar tipos de otra org

- GIVEN la org "A" tiene 14 tipos y la org "B" tiene 12
- WHEN un usuario de "A" lista
- THEN recibe solo los 14 de "A"

---

### Requirement: Crear tipo de registro propio

El sistema DEBE permitir que un usuario con permiso
`granja.tipos-registro.create` cree un `TipoRegistro` con `nombre` (string,
obligatorio, 1..100) y `naturaleza` (`INVERSION` | `CANTIDAD`, obligatoria). El
tipo se crea con `esSistema = false` y `activo = true`. El `nombre` DEBE ser
único por `(organizationId, nombre)`.

#### Scenario: Crear tipo propio de inversión

- GIVEN un usuario con permiso `granja.tipos-registro.create`
- WHEN crea un tipo `nombre = "Fletes"`, `naturaleza = INVERSION`
- THEN se persiste con `esSistema = false`, `activo = true`, `naturaleza = INVERSION`

#### Scenario: Nombre duplicado en la misma org es rechazado

- GIVEN ya existe un tipo "Alimento" en la org
- WHEN el usuario intenta crear otro "Alimento"
- THEN el sistema rechaza con `GRANJA_TIPO_REGISTRO_NOMBRE_DUPLICADO` (409)

#### Scenario: Mismo nombre en dos orgs distintas es válido

- GIVEN la org "A" tiene un tipo "Fletes"
- WHEN un usuario de la org "B" crea un tipo "Fletes"
- THEN ambos coexisten (la unicidad es por org, no global)

---

### Requirement: Editar y desactivar tipo de registro

El sistema DEBE permitir editar el `nombre` y el flag `activo` de un
`TipoRegistro` propio (`esSistema = false`) con permiso
`granja.tipos-registro.update`. La `naturaleza` es **inmutable** tras crear
(cambiarla rompería la coherencia de los movimientos ya ligados). La
desactivación (`activo = false`) es la vía para retirar un tipo de uso.

#### Scenario: Desactivar tipo propio

- GIVEN un tipo propio "Fletes" con `activo = true`
- WHEN el usuario lo edita a `activo = false`
- THEN el tipo queda inactivo y no aparece como opción para movimientos nuevos

#### Scenario: Cambiar la naturaleza es rechazado

- GIVEN un tipo "Fletes" con `naturaleza = INVERSION`
- WHEN el usuario intenta editarlo a `naturaleza = CANTIDAD`
- THEN el sistema rechaza con `GRANJA_TIPO_REGISTRO_NATURALEZA_INMUTABLE`

---

### Requirement: Tipos de sistema protegidos

El sistema NO DEBE permitir eliminar ni renombrar ni cambiar la naturaleza de un
`TipoRegistro` con `esSistema = true`. El único cambio permitido sobre un tipo
de sistema es `activo` (soft-disable). El sistema NO DEBE permitir eliminar
físicamente ningún `TipoRegistro` (de sistema o propio) que tenga movimientos
asociados — la vía correcta es desactivarlo.

#### Scenario: Borrar tipo de sistema es rechazado

- GIVEN el tipo de fábrica "Mortalidad" (`esSistema = true`)
- WHEN el usuario intenta `DELETE` sobre él
- THEN el sistema rechaza con `GRANJA_TIPO_REGISTRO_SISTEMA_NO_ELIMINABLE`

#### Scenario: Renombrar tipo de sistema es rechazado

- GIVEN el tipo de fábrica "Alimento" (`esSistema = true`)
- WHEN el usuario intenta editar su `nombre`
- THEN el sistema rechaza con `GRANJA_TIPO_REGISTRO_SISTEMA_NO_EDITABLE`

#### Scenario: Desactivar tipo de sistema sí es permitido

- GIVEN el tipo de fábrica "Garrafas (gas)" (`esSistema = true`, `activo = true`)
- WHEN el usuario lo desactiva (`activo = false`)
- THEN el cambio se aplica (el único campo editable de un tipo de sistema)

#### Scenario: Borrar tipo con movimientos asociados es rechazado

- GIVEN un tipo propio "Fletes" que ya tiene 1 `MovimientoInversion` asociado
- WHEN el usuario intenta `DELETE` sobre él
- THEN el sistema rechaza con `GRANJA_TIPO_REGISTRO_EN_USO` y sugiere desactivarlo
