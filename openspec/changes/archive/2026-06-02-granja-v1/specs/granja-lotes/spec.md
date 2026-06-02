# Spec: granja-lotes

> Fecha: 2026-06-01
> Fase: spec
> Change: granja-v1
> Proyecto: avicont
> Fuente de verdad del modelo: `docs/disenos/granja.md` §4.1, §4.2, §5.1, §5.4, §5.6

## Purpose

CRUD del `Lote` — la unidad de crianza y aggregate root del vertical Granja.
Un `Lote` es una camada de pollos parrilleros que ingresa junta, se cría como
unidad, y se cierra al venderse (saca). Toda operación de granja cuelga de un
lote. Esta capability cubre crear, listar, ver, editar y cerrar lotes, con el
invariante duro de que `cantidadInicial` es **inmutable** tras la creación (es
el denominador base del costo por pollo) y que un lote `CERRADO` es de solo
lectura.

## Glosario

| Término | Definición |
|---------|-----------|
| **Lote** | Camada de pollos BB que entra junta (misma fecha, mismo galpón) y se maneja como unidad. Aggregate root del vertical. |
| **cantidadInicial** | Pollitos BB que ingresaron. `Int > 0`. **Inmutable tras crear** — es el denominador base de `costoPorPolloVivo`. |
| **galpon** | Instalación física donde se cría el lote. Campo de **texto libre opcional**, sin unicidad (granja.md §5.1). |
| **EstadoLote** | Enum de dominio propio (`granja/domain/enums.ts`): `ACTIVO` \| `CERRADO`. Transición única `ACTIVO → CERRADO`. |
| **fechaIngreso** | `FechaContable` — cuándo entraron los pollitos BB. |
| **fechaCierre** | `FechaContable?` — se setea al cerrar; null mientras `ACTIVO`. |

---

## Requirements

### Requirement: Crear lote

El sistema DEBE permitir que un usuario con permiso `granja.lotes.create` cree
un `Lote` con: `cantidadInicial` (`Int`, obligatorio, > 0), `fechaIngreso`
(`FechaContable`, obligatoria), `nombre` (string opcional, 0..120),
`galpon` (string opcional, texto libre sin unicidad), `fechaEstimadaSaca`
(`FechaContable?` opcional), `detalle` (string opcional). El lote se crea
siempre en estado `ACTIVO` con `organizationId` tomado del `JWT.activeTenantId`.

#### Scenario: Crear lote válido queda ACTIVO

- GIVEN un usuario con permiso `granja.lotes.create` en la org "Avícola X"
- WHEN crea un lote con `cantidadInicial = 5000`, `fechaIngreso = 2026-06-01`, `galpon = "El Alto"`
- THEN el lote se persiste en estado `ACTIVO`, con `organizationId` de "Avícola X", `fechaCierre = null` y `cantidadInicial = 5000`

#### Scenario: Rechazar cantidadInicial cero o negativa

- GIVEN un usuario con permiso `granja.lotes.create`
- WHEN intenta crear un lote con `cantidadInicial = 0` (o `-100`)
- THEN el sistema rechaza con error `GRANJA_LOTE_CANTIDAD_INICIAL_INVALIDA` y no persiste nada

#### Scenario: Galpón es texto libre sin unicidad

- GIVEN ya existe un lote con `galpon = "El Alto"` en la org
- WHEN el usuario crea un segundo lote con `galpon = "El Alto"`
- THEN ambos lotes coexisten sin error de unicidad

---

### Requirement: Listar lotes del tenant

El sistema DEBE permitir que un usuario con permiso `granja.lotes.read` liste
los lotes de su org. El listado NO DEBE incluir lotes de otras orgs. El sistema
DEBE permitir filtrar por `estado` (`ACTIVO` | `CERRADO`).

#### Scenario: Listado solo trae lotes de la org activa

- GIVEN la org "A" tiene 3 lotes y la org "B" tiene 2 lotes
- WHEN un usuario de "A" lista los lotes
- THEN recibe exactamente los 3 lotes de "A" y ninguno de "B"

#### Scenario: Filtrar por estado ACTIVO

- GIVEN la org tiene 2 lotes `ACTIVO` y 1 lote `CERRADO`
- WHEN el usuario lista filtrando `estado = ACTIVO`
- THEN recibe solo los 2 lotes activos

---

### Requirement: Ver lote por id

El sistema DEBE permitir obtener un `Lote` por `id` con permiso
`granja.lotes.read`, validando que pertenece a la org activa.

#### Scenario: Ver lote propio

- GIVEN un lote `L1` de la org "A"
- WHEN un usuario de "A" pide `GET /api/granja/lotes/L1`
- THEN recibe el lote con todos sus campos

#### Scenario: Aislamiento — no ver lote de otra org

- GIVEN un lote `L1` pertenece a la org "B"
- WHEN un usuario de la org "A" pide `GET /api/granja/lotes/L1`
- THEN el sistema responde `GRANJA_LOTE_NO_ENCONTRADO` (404), nunca expone el lote de "B"

---

### Requirement: Editar lote — cantidadInicial inmutable

El sistema DEBE permitir editar `nombre`, `galpon`, `fechaIngreso`,
`fechaEstimadaSaca` y `detalle` de un lote `ACTIVO` con permiso
`granja.lotes.update`. El campo `cantidadInicial` es **inmutable**: el sistema
NO DEBE permitir modificarlo bajo ninguna circunstancia, ni siquiera por un
admin. El estado tampoco se cambia vía edición (solo vía el endpoint de cerrar).

#### Scenario: Editar campos mutables

- GIVEN un lote `ACTIVO` con `galpon = "El Alto"`
- WHEN el usuario hace `PATCH` con `galpon = "Santa Rosa"` y `nombre = "Lote junio"`
- THEN el lote queda con los nuevos valores y `cantidadInicial` sin cambios

#### Scenario: PATCH que intenta cambiar cantidadInicial es rechazado

- GIVEN un lote `ACTIVO` con `cantidadInicial = 5000`
- WHEN el usuario envía `PATCH` con `cantidadInicial = 4800`
- THEN el sistema rechaza con `GRANJA_LOTE_CANTIDAD_INICIAL_INMUTABLE` y el lote conserva `cantidadInicial = 5000`

#### Scenario: PATCH que intenta cambiar estado es rechazado

- GIVEN un lote `ACTIVO`
- WHEN el usuario envía `PATCH` con `estado = CERRADO`
- THEN el sistema ignora/rechaza el cambio de estado (el cierre solo ocurre vía `POST /api/granja/lotes/:id/cerrar`)

---

### Requirement: Cerrar lote

El sistema DEBE permitir cerrar un lote `ACTIVO` mediante
`POST /api/granja/lotes/:id/cerrar` con permiso `granja.lotes.update`. Al cerrar,
el `estado` pasa a `CERRADO` y `fechaCierre` se setea a `ClockPort.hoyEnLaPaz()`.
La transición `ACTIVO → CERRADO` es la única permitida. El sistema NO DEBE
permitir cerrar un lote que ya está `CERRADO`.

#### Scenario: Cerrar lote activo

- GIVEN un lote `ACTIVO` sin `fechaCierre`
- WHEN el usuario hace `POST /api/granja/lotes/:id/cerrar`
- THEN el lote pasa a `CERRADO` y `fechaCierre = hoy` (La Paz)

#### Scenario: Cerrar lote ya cerrado es rechazado

- GIVEN un lote en estado `CERRADO`
- WHEN el usuario intenta cerrarlo de nuevo
- THEN el sistema rechaza con `GRANJA_LOTE_YA_CERRADO` y no modifica `fechaCierre`

---

### Requirement: Lote CERRADO es de solo lectura

El sistema NO DEBE permitir editar un lote `CERRADO` ni agregarle/editarle/
borrarle movimientos (ver capability `granja-movimientos`). La reapertura de
lotes se difiere a v2 (granja.md §5.6).

#### Scenario: Editar lote cerrado es rechazado

- GIVEN un lote en estado `CERRADO`
- WHEN el usuario hace `PATCH` sobre cualquier campo mutable
- THEN el sistema rechaza con `GRANJA_LOTE_CERRADO_NO_EDITABLE`

#### Scenario: Lote cerrado sigue siendo legible

- GIVEN un lote en estado `CERRADO`
- WHEN el usuario hace `GET /api/granja/lotes/:id`
- THEN el sistema devuelve el lote y sus derivados calculados (lectura permitida)

---

### Requirement: Multi-tenant defense in depth en Lote

Todo `Lote` DEBE tener `organizationId` NOT NULL. Toda query de lotes DEBE
filtrar por `organizationId` en repo + service. Una query sin ese filtro es bug
de seguridad (§4.2 core).

#### Scenario: Editar lote de otra org es imposible

- GIVEN un lote `L1` de la org "B"
- WHEN un usuario de la org "A" hace `PATCH /api/granja/lotes/L1`
- THEN el sistema responde `GRANJA_LOTE_NO_ENCONTRADO` (404) sin modificar `L1`

#### Scenario: Cerrar lote de otra org es imposible

- GIVEN un lote `L1` de la org "B"
- WHEN un usuario de la org "A" hace `POST /api/granja/lotes/L1/cerrar`
- THEN el sistema responde `GRANJA_LOTE_NO_ENCONTRADO` (404) sin cerrar `L1`
