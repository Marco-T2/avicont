# granja-tipos-registro — Especificación

<!--
Última edición: 2026-06-02
Última revisión contra core: 2026-06-02
Owner: backend-lead
-->

> Fecha: 2026-06-02
> Fase: spec (live)
> Proyecto: avicont
> Capability nueva: `granja-tipos-registro` (no existía spec previa)
> Origen: change `granja-v1` (archivado 2026-06-02)
> Fuente de verdad del modelo: `docs/disenos/granja.md` §4.2 (`TipoRegistro`), §5.3, §6

---

## Propósito

Catálogo per-org de `TipoRegistro` — la pieza configurable que clasifica cada
movimiento. Cada tipo declara su `naturaleza` (`INVERSION` o `CANTIDAD`), lo que
enruta cada movimiento a su tabla. El catálogo viene con tipos de fábrica
(`esSistema = true`), sembrados al activar el vertical de forma idempotente, y
el granjero agrega los suyos (`esSistema = false`). Los de sistema no se borran
ni se les cambia el nombre ni la naturaleza; sí se pueden desactivar.

---

## Glosario

| Término | Definición |
|---------|-----------|
| **TipoRegistro** | Clasificación configurable de un movimiento. Único por `(organizationId, nombre)`. |
| **naturaleza** | Enum de dominio propio `NaturalezaRegistro`: `INVERSION` \| `CANTIDAD`. Declara a qué tabla de movimiento pertenece el tipo. Inmutable tras crear. |
| **esSistema** | `true` = sembrado de fábrica al activar granja, no se elimina ni se renombra. `false` = creado por el granjero. |
| **activo** | Soft-disable (default `true`). Un tipo inactivo no puede usarse en movimientos nuevos. |
| **seed de fábrica** | 12 tipos predefinidos: 11 de `INVERSION` + Mortalidad (`CANTIDAD`). Sembrados al activar granja, idempotentes vía upsert por `(organizationId, nombre, naturaleza)`. |

---

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

### REQ-GTR-01: Seed de tipos de fábrica al activar el vertical

El sistema DEBE sembrar 12 `TipoRegistro` de fábrica (`esSistema = true`) en la
org cuando el vertical granja se activa (`granjaEnabled` pasa a `true`). El seed
DEBE ser **idempotente**: invocarlo más de una vez NO crea duplicados (upsert
por `(organizationId, nombre, naturaleza)`). Los 12 tipos son — `INVERSION`:
Compra de pollitos, Alimento, Alquiler Galpón, Mantenimiento Galpón, Vacunas,
Veterinario, Mano de Obra, Chala, Garrafas (gas), Agua y Luz, Otros gastos;
`CANTIDAD`: Mortalidad.

#### Escenario: activar granja siembra los 12 tipos de fábrica

- DADO una org sin tipos de registro y `granjaEnabled = false`
- CUANDO se activa `granjaEnabled = true`
- ENTONCES se crean exactamente 12 `TipoRegistro` con `esSistema = true` (11 `INVERSION` + 1 `CANTIDAD` "Mortalidad")

#### Escenario: seed idempotente — re-activar no duplica

- DADO una org que ya tiene los 12 tipos de fábrica sembrados
- CUANDO el seeder se invoca de nuevo (p.ej. `updateFeatures(granjaEnabled=true)` se repite)
- ENTONCES siguen existiendo exactamente 12 tipos `esSistema` (ningún duplicado), y los tipos propios del granjero quedan intactos

---

### REQ-GTR-02: Listar tipos de registro

El sistema DEBE permitir que un usuario con permiso `granja.tipos-registro.read`
liste los `TipoRegistro` de su org (de fábrica + propios), incluyendo inactivos.
El listado NO DEBE incluir tipos de otras orgs.

#### Escenario: listado mezcla fábrica y propios de la org

- DADO una org con 12 tipos de fábrica y 2 tipos propios ("Fletes", "Descarte")
- CUANDO el usuario lista los tipos
- ENTONCES recibe los 14 tipos, marcando cuáles son `esSistema`

#### Escenario: aislamiento — no listar tipos de otra org

- DADO la org "A" tiene 14 tipos y la org "B" tiene 12
- CUANDO un usuario de "A" lista
- ENTONCES recibe solo los 14 de "A"

---

### REQ-GTR-03: Crear tipo de registro propio

El sistema DEBE permitir que un usuario con permiso
`granja.tipos-registro.create` cree un `TipoRegistro` con `nombre` (string,
obligatorio, 1..100) y `naturaleza` (`INVERSION` | `CANTIDAD`, obligatoria). El
tipo se crea con `esSistema = false` y `activo = true`. El `nombre` DEBE ser
único por `(organizationId, nombre)`.

#### Escenario: crear tipo propio de inversión

- DADO un usuario con permiso `granja.tipos-registro.create`
- CUANDO crea un tipo `nombre = "Fletes"`, `naturaleza = INVERSION`
- ENTONCES se persiste con `esSistema = false`, `activo = true`, `naturaleza = INVERSION`

#### Escenario: nombre duplicado en la misma org es rechazado

- DADO ya existe un tipo "Alimento" en la org
- CUANDO el usuario intenta crear otro "Alimento"
- ENTONCES el sistema rechaza con `GRANJA_TIPO_REGISTRO_NOMBRE_DUPLICADO` (409)

#### Escenario: mismo nombre en dos orgs distintas es válido

- DADO la org "A" tiene un tipo "Fletes"
- CUANDO un usuario de la org "B" crea un tipo "Fletes"
- ENTONCES ambos coexisten (la unicidad es por org, no global)

---

### REQ-GTR-04: Editar y desactivar tipo de registro

El sistema DEBE permitir editar el `nombre` y el flag `activo` de un
`TipoRegistro` propio (`esSistema = false`) con permiso
`granja.tipos-registro.update`. La `naturaleza` es **inmutable** tras crear
(cambiarla rompería la coherencia de los movimientos ya ligados). La
desactivación (`activo = false`) es la vía para retirar un tipo de uso.

#### Escenario: desactivar tipo propio

- DADO un tipo propio "Fletes" con `activo = true`
- CUANDO el usuario lo edita a `activo = false`
- ENTONCES el tipo queda inactivo y no aparece como opción para movimientos nuevos

#### Escenario: cambiar la naturaleza es rechazado

- DADO un tipo "Fletes" con `naturaleza = INVERSION`
- CUANDO el usuario intenta editarlo a `naturaleza = CANTIDAD`
- ENTONCES el sistema rechaza con `GRANJA_TIPO_REGISTRO_NATURALEZA_INMUTABLE`

---

### REQ-GTR-05: Tipos de sistema protegidos

El sistema NO DEBE permitir eliminar ni renombrar ni cambiar la naturaleza de un
`TipoRegistro` con `esSistema = true`. El único cambio permitido sobre un tipo
de sistema es `activo` (soft-disable). El sistema NO DEBE permitir eliminar
físicamente ningún `TipoRegistro` (de sistema o propio) que tenga movimientos
asociados — la vía correcta es desactivarlo.

#### Escenario: borrar tipo de sistema es rechazado

- DADO el tipo de fábrica "Mortalidad" (`esSistema = true`)
- CUANDO el usuario intenta `DELETE` sobre él
- ENTONCES el sistema rechaza con `GRANJA_TIPO_REGISTRO_SISTEMA_NO_ELIMINABLE`

#### Escenario: renombrar tipo de sistema es rechazado

- DADO el tipo de fábrica "Alimento" (`esSistema = true`)
- CUANDO el usuario intenta editar su `nombre`
- ENTONCES el sistema rechaza con `GRANJA_TIPO_REGISTRO_SISTEMA_NO_EDITABLE`

#### Escenario: desactivar tipo de sistema sí es permitido

- DADO el tipo de fábrica "Garrafas (gas)" (`esSistema = true`, `activo = true`)
- CUANDO el usuario lo desactiva (`activo = false`)
- ENTONCES el cambio se aplica (el único campo editable de un tipo de sistema)

#### Escenario: borrar tipo con movimientos asociados es rechazado

- DADO un tipo propio "Fletes" que ya tiene 1 `MovimientoInversion` asociado
- CUANDO el usuario intenta `DELETE` sobre él
- ENTONCES el sistema rechaza con `GRANJA_TIPO_REGISTRO_EN_USO` y sugiere desactivarlo

---

## Códigos de error

| Código | HTTP | Descripción |
|--------|------|-------------|
| `GRANJA_TIPO_REGISTRO_NOMBRE_DUPLICADO` | 409 | Nombre ya existe en la org |
| `GRANJA_TIPO_REGISTRO_NATURALEZA_INMUTABLE` | 422 | Intento de cambiar la naturaleza |
| `GRANJA_TIPO_REGISTRO_SISTEMA_NO_ELIMINABLE` | 422 | Intento de eliminar un tipo de sistema |
| `GRANJA_TIPO_REGISTRO_SISTEMA_NO_EDITABLE` | 422 | Intento de renombrar un tipo de sistema |
| `GRANJA_TIPO_REGISTRO_EN_USO` | 422 | Tipo tiene movimientos asociados |
