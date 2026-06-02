# granja-lotes — Especificación

<!--
Última edición: 2026-06-02
Última revisión contra core: 2026-06-02
Owner: backend-lead
-->

> Fecha: 2026-06-02
> Fase: spec (live)
> Proyecto: avicont
> Capability nueva: `granja-lotes` (no existía spec previa)
> Origen: change `granja-v1` (archivado 2026-06-02)
> Fuente de verdad del modelo: `docs/disenos/granja.md` §4.1, §4.2, §5.1, §5.4, §5.6

---

## Propósito

CRUD del `Lote` — la unidad de crianza y aggregate root del vertical Granja.
Un `Lote` es una camada de pollos parrilleros que ingresa junta, se cría como
unidad, y se cierra al venderse (saca). Toda operación de granja cuelga de un
lote. Esta capability cubre crear, listar, ver, editar y cerrar lotes, con el
invariante duro de que `cantidadInicial` es **inmutable** tras la creación (es
el denominador base del costo por pollo) y que un lote `CERRADO` es de solo
lectura.

---

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

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

### REQ-GL-01: Crear lote

El sistema DEBE permitir que un usuario con permiso `granja.lotes.create` cree
un `Lote` con: `cantidadInicial` (`Int`, obligatorio, > 0), `fechaIngreso`
(`FechaContable`, obligatoria), `nombre` (string opcional, 0..120),
`galpon` (string opcional, texto libre sin unicidad), `fechaEstimadaSaca`
(`FechaContable?` opcional), `detalle` (string opcional). El lote se crea
siempre en estado `ACTIVO` con `organizationId` tomado del `JWT.activeTenantId`.

#### Escenario: crear lote válido queda ACTIVO

- DADO un usuario con permiso `granja.lotes.create` en la org "Avícola X"
- CUANDO crea un lote con `cantidadInicial = 5000`, `fechaIngreso = 2026-06-01`, `galpon = "El Alto"`
- ENTONCES el lote se persiste en estado `ACTIVO`, con `organizationId` de "Avícola X", `fechaCierre = null` y `cantidadInicial = 5000`

#### Escenario: rechazar cantidadInicial cero o negativa

- DADO un usuario con permiso `granja.lotes.create`
- CUANDO intenta crear un lote con `cantidadInicial = 0` (o `-100`)
- ENTONCES el sistema rechaza con error `GRANJA_LOTE_CANTIDAD_INICIAL_INVALIDA` y no persiste nada

#### Escenario: galpón es texto libre sin unicidad

- DADO ya existe un lote con `galpon = "El Alto"` en la org
- CUANDO el usuario crea un segundo lote con `galpon = "El Alto"`
- ENTONCES ambos lotes coexisten sin error de unicidad

---

### REQ-GL-02: Listar lotes del tenant

El sistema DEBE permitir que un usuario con permiso `granja.lotes.read` liste
los lotes de su org. El listado NO DEBE incluir lotes de otras orgs. El sistema
DEBE permitir filtrar por `estado` (`ACTIVO` | `CERRADO`).

#### Escenario: listado solo trae lotes de la org activa

- DADO la org "A" tiene 3 lotes y la org "B" tiene 2 lotes
- CUANDO un usuario de "A" lista los lotes
- ENTONCES recibe exactamente los 3 lotes de "A" y ninguno de "B"

#### Escenario: filtrar por estado ACTIVO

- DADO la org tiene 2 lotes `ACTIVO` y 1 lote `CERRADO`
- CUANDO el usuario lista filtrando `estado = ACTIVO`
- ENTONCES recibe solo los 2 lotes activos

---

### REQ-GL-03: Ver lote por id

El sistema DEBE permitir obtener un `Lote` por `id` con permiso
`granja.lotes.read`, validando que pertenece a la org activa.

#### Escenario: ver lote propio

- DADO un lote `L1` de la org "A"
- CUANDO un usuario de "A" pide `GET /api/granja/lotes/L1`
- ENTONCES recibe el lote con todos sus campos

#### Escenario: aislamiento — no ver lote de otra org

- DADO un lote `L1` pertenece a la org "B"
- CUANDO un usuario de la org "A" pide `GET /api/granja/lotes/L1`
- ENTONCES el sistema responde `GRANJA_LOTE_NO_ENCONTRADO` (404), nunca expone el lote de "B"

---

### REQ-GL-04: Editar lote — cantidadInicial inmutable

El sistema DEBE permitir editar `nombre`, `galpon`, `fechaIngreso`,
`fechaEstimadaSaca` y `detalle` de un lote `ACTIVO` con permiso
`granja.lotes.update`. El campo `cantidadInicial` es **inmutable**: el sistema
NO DEBE permitir modificarlo bajo ninguna circunstancia, ni siquiera por un
admin. El estado tampoco se cambia vía edición (solo vía el endpoint de cerrar).

#### Escenario: editar campos mutables

- DADO un lote `ACTIVO` con `galpon = "El Alto"`
- CUANDO el usuario hace `PATCH` con `galpon = "Santa Rosa"` y `nombre = "Lote junio"`
- ENTONCES el lote queda con los nuevos valores y `cantidadInicial` sin cambios

#### Escenario: PATCH que intenta cambiar cantidadInicial es rechazado

- DADO un lote `ACTIVO` con `cantidadInicial = 5000`
- CUANDO el usuario envía `PATCH` con `cantidadInicial = 4800`
- ENTONCES el sistema rechaza con `GRANJA_LOTE_CANTIDAD_INICIAL_INMUTABLE` y el lote conserva `cantidadInicial = 5000`

#### Escenario: PATCH que intenta cambiar estado es rechazado

- DADO un lote `ACTIVO`
- CUANDO el usuario envía `PATCH` con `estado = CERRADO`
- ENTONCES el sistema ignora/rechaza el cambio de estado (el cierre solo ocurre vía `POST /api/granja/lotes/:id/cerrar`)

---

### REQ-GL-05: Cerrar lote

El sistema DEBE permitir cerrar un lote `ACTIVO` mediante
`POST /api/granja/lotes/:id/cerrar` con permiso `granja.lotes.update`. Al cerrar,
el `estado` pasa a `CERRADO` y `fechaCierre` se setea a `ClockPort.hoyEnLaPaz()`.
La transición `ACTIVO → CERRADO` es la única permitida. El sistema NO DEBE
permitir cerrar un lote que ya está `CERRADO`.

#### Escenario: cerrar lote activo

- DADO un lote `ACTIVO` sin `fechaCierre`
- CUANDO el usuario hace `POST /api/granja/lotes/:id/cerrar`
- ENTONCES el lote pasa a `CERRADO` y `fechaCierre = hoy` (La Paz)

#### Escenario: cerrar lote ya cerrado es rechazado

- DADO un lote en estado `CERRADO`
- CUANDO el usuario intenta cerrarlo de nuevo
- ENTONCES el sistema rechaza con `GRANJA_LOTE_YA_CERRADO` y no modifica `fechaCierre`

---

### REQ-GL-06: Lote CERRADO es de solo lectura

El sistema NO DEBE permitir editar un lote `CERRADO` ni agregarle/editarle/
borrarle movimientos (ver spec `granja-movimientos`). La reapertura de
lotes se difiere a v2 (granja.md §5.6).

#### Escenario: editar lote cerrado es rechazado

- DADO un lote en estado `CERRADO`
- CUANDO el usuario hace `PATCH` sobre cualquier campo mutable
- ENTONCES el sistema rechaza con `GRANJA_LOTE_CERRADO_NO_EDITABLE`

#### Escenario: lote cerrado sigue siendo legible

- DADO un lote en estado `CERRADO`
- CUANDO el usuario hace `GET /api/granja/lotes/:id`
- ENTONCES el sistema devuelve el lote y sus derivados calculados (lectura permitida)

---

### REQ-GL-07: Multi-tenant defense in depth en Lote

Todo `Lote` DEBE tener `organizationId` NOT NULL. Toda query de lotes DEBE
filtrar por `organizationId` en repo + service. Una query sin ese filtro es bug
de seguridad (CLAUDE.md §4.2).

#### Escenario: editar lote de otra org es imposible

- DADO un lote `L1` de la org "B"
- CUANDO un usuario de la org "A" hace `PATCH /api/granja/lotes/L1`
- ENTONCES el sistema responde `GRANJA_LOTE_NO_ENCONTRADO` (404) sin modificar `L1`

#### Escenario: cerrar lote de otra org es imposible

- DADO un lote `L1` de la org "B"
- CUANDO un usuario de la org "A" hace `POST /api/granja/lotes/L1/cerrar`
- ENTONCES el sistema responde `GRANJA_LOTE_NO_ENCONTRADO` (404) sin cerrar `L1`

---

## Códigos de error

| Código | HTTP | Descripción |
|--------|------|-------------|
| `GRANJA_LOTE_CANTIDAD_INICIAL_INVALIDA` | 422 | `cantidadInicial` es cero o negativa |
| `GRANJA_LOTE_CANTIDAD_INICIAL_INMUTABLE` | 422 | Intento de modificar `cantidadInicial` |
| `GRANJA_LOTE_NO_ENCONTRADO` | 404 | Lote no existe o pertenece a otra org |
| `GRANJA_LOTE_YA_CERRADO` | 422 | Intento de cerrar un lote ya cerrado |
| `GRANJA_LOTE_CERRADO_NO_EDITABLE` | 422 | Intento de editar o agregar movimientos a un lote cerrado |
