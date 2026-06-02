# granja-movimientos — Especificación

<!--
Última edición: 2026-06-02
Última revisión contra core: 2026-06-02
Owner: backend-lead
-->

> Fecha: 2026-06-02
> Fase: spec (live)
> Proyecto: avicont
> Capability nueva: `granja-movimientos` (no existía spec previa)
> Origen: change `granja-v1` (archivado 2026-06-02)
> Fuente de verdad del modelo: `docs/disenos/granja.md` §4.2, §5.2, §5.4

---

## Propósito

Registro de los dos tipos de movimiento que cuelgan de un lote:
`MovimientoInversion` (lleva `monto`, plata que entra al lote) y
`MovimientoCantidad` (lleva `cantidad`, aves que **salen** — mortalidad/descarte).
Cada movimiento se enruta por la `naturaleza` de su `TipoRegistro`. El lote tiene
un único ingreso de aves (`cantidadInicial`), por lo que todo `MovimientoCantidad`
es una **resta**, sujeta al invariante duro `avesVivas ≥ 0`.

---

## Glosario

| Término | Definición |
|---------|-----------|
| **MovimientoInversion** | Costo incurrido en el lote. Lleva `monto` (`Money`, `Decimal(18,2)`, > 0). Su `TipoRegistro.naturaleza` debe ser `INVERSION`. |
| **MovimientoCantidad** | Aves que salen del lote (mortalidad). Lleva `cantidad` (`Int`, > 0). Su `TipoRegistro.naturaleza` debe ser `CANTIDAD`. Siempre resta. |
| **avesVivas** | Derivado: `cantidadInicial − Σ(MovimientoCantidad.cantidad)`. Invariante `≥ 0`. |
| **detalle** | Texto libre opcional en ambos movimientos, `@MaxLength(500)`. La válvula que mantiene chico el catálogo de tipos (§5.3). |
| **monto en HTTP** | Cruza la API como `string` (ej. `"1250.50"`) para evitar pérdida IEEE-754 (CLAUDE.md §4.5). |

---

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

### REQ-GM-01: Registrar movimiento de inversión

El sistema DEBE permitir, con permiso `granja.movimientos.create`, registrar un
`MovimientoInversion` sobre un lote `ACTIVO` con: `tipoRegistroId` (UUID,
obligatorio, debe ser un `TipoRegistro` de la org con `naturaleza = INVERSION` y
`activo = true`), `monto` (`Money` > 0, recibido como string), `fecha`
(`FechaContable`, obligatoria — PUEDE ser anterior a `fechaIngreso`), `detalle`
(string opcional, ≤ 500). El `organizationId` se denormaliza desde el lote.

#### Escenario: registrar inversión válida

- DADO un lote `ACTIVO` y un tipo "Alimento" (`INVERSION`, `activo`)
- CUANDO el usuario registra `monto = "1250.50"`, `fecha = 2026-06-05`, `tipoRegistroId = Alimento`
- ENTONCES se persiste el `MovimientoInversion` con `monto = 1250.50` y `organizationId` del lote

#### Escenario: inversión con monto cero o negativo es rechazada

- DADO un lote `ACTIVO`
- CUANDO el usuario registra una inversión con `monto = "0"` (o `"-50"`)
- ENTONCES el sistema rechaza con `GRANJA_MOVIMIENTO_INVERSION_MONTO_INVALIDO`

#### Escenario: fecha previa al ingreso es válida (gastos previos)

- DADO un lote con `fechaIngreso = 2026-06-01`
- CUANDO el usuario registra una inversión "Mantenimiento Galpón" con `fecha = 2026-05-20`
- ENTONCES el movimiento se acepta (gastos previos a la entrada de los pollitos son válidos)

#### Escenario: detalle excede 500 chars es rechazado

- DADO un lote `ACTIVO`
- CUANDO el usuario registra una inversión con `detalle` de 501 caracteres
- ENTONCES el sistema rechaza con error de validación (`@MaxLength(500)`)

---

### REQ-GM-02: Ruteo por naturaleza del TipoRegistro

El sistema DEBE rechazar un `MovimientoInversion` cuyo `TipoRegistro` tenga
`naturaleza = CANTIDAD`, y un `MovimientoCantidad` cuyo `TipoRegistro` tenga
`naturaleza = INVERSION`. La naturaleza del tipo DEBE matchear la tabla del
movimiento.

#### Escenario: inversión con tipo de naturaleza CANTIDAD es rechazada

- DADO el tipo "Mortalidad" (`naturaleza = CANTIDAD`)
- CUANDO el usuario intenta registrar un `MovimientoInversion` con `tipoRegistroId = Mortalidad`
- ENTONCES el sistema rechaza con `GRANJA_TIPO_REGISTRO_NATURALEZA_INVALIDA`

#### Escenario: cantidad con tipo de naturaleza INVERSION es rechazada

- DADO el tipo "Alimento" (`naturaleza = INVERSION`)
- CUANDO el usuario intenta registrar un `MovimientoCantidad` con `tipoRegistroId = Alimento`
- ENTONCES el sistema rechaza con `GRANJA_TIPO_REGISTRO_NATURALEZA_INVALIDA`

#### Escenario: tipo de registro inactivo es rechazado

- DADO el tipo "Fletes" (`INVERSION`) está `activo = false`
- CUANDO el usuario intenta registrar una inversión con ese tipo
- ENTONCES el sistema rechaza con `GRANJA_TIPO_REGISTRO_INACTIVO`

---

### REQ-GM-03: Registrar movimiento de cantidad (mortalidad) con invariante avesVivas ≥ 0

El sistema DEBE permitir, con permiso `granja.movimientos.create`, registrar un
`MovimientoCantidad` sobre un lote `ACTIVO` con: `tipoRegistroId` (`naturaleza =
CANTIDAD`, `activo`), `cantidad` (`Int` > 0), `fecha` (`FechaContable`),
`detalle` (opcional ≤ 500). El sistema NO DEBE permitir una salida que deje
`avesVivas` en negativo: `Σ(muertes) + nuevaCantidad ≤ cantidadInicial`. Este
invariante se enforza en el service (no hay CHECK de BD posible, P6), y la
validación DEBE hacerse de forma consistente bajo concurrencia (`SELECT FOR
UPDATE` sobre el lote dentro de la transacción).

#### Escenario: registrar mortalidad dentro del límite

- DADO un lote con `cantidadInicial = 5000` y 0 muertes registradas
- CUANDO el usuario registra `MovimientoCantidad` con `cantidad = 30`
- ENTONCES se persiste; `avesVivas` pasa a ser `4970`

#### Escenario: mortalidad acumulada que supera las aves vivas es rechazada

- DADO un lote con `cantidadInicial = 5000` y `Σ(muertes) = 4990` (avesVivas = 10)
- CUANDO el usuario registra una muerte con `cantidad = 20`
- ENTONCES el sistema rechaza con `GRANJA_MOVIMIENTO_CANTIDAD_EXCEDE_VIVAS` y NO persiste el movimiento; `avesVivas` sigue en 10

#### Escenario: mortalidad exacta que deja avesVivas = 0 es válida

- DADO un lote con `cantidadInicial = 5000` y `Σ(muertes) = 4990` (avesVivas = 10)
- CUANDO el usuario registra una muerte con `cantidad = 10`
- ENTONCES se persiste; `avesVivas` pasa a ser exactamente `0`

#### Escenario: cantidad cero o negativa es rechazada

- DADO un lote `ACTIVO`
- CUANDO el usuario registra un `MovimientoCantidad` con `cantidad = 0` (o `-5`)
- ENTONCES el sistema rechaza con `GRANJA_MOVIMIENTO_CANTIDAD_INVALIDA`

#### Escenario: concurrencia — dos muertes simultáneas no dejan avesVivas negativo

- DADO un lote con `cantidadInicial = 5000` y `avesVivas = 10`
- CUANDO dos requests concurrentes intentan registrar `cantidad = 8` cada uno
- ENTONCES a lo sumo uno tiene éxito (8 ≤ 10); el otro es rechazado con `GRANJA_MOVIMIENTO_CANTIDAD_EXCEDE_VIVAS`; el estado final NUNCA deja `avesVivas` negativo (gracias al `SELECT FOR UPDATE` sobre el lote en la TX)

---

### REQ-GM-04: Listar movimientos de un lote

El sistema DEBE permitir, con permiso `granja.movimientos.read`, listar los
movimientos (inversión y/o cantidad) de un lote de la org activa.

#### Escenario: listar movimientos del lote

- DADO un lote con 3 inversiones y 2 movimientos de cantidad
- CUANDO el usuario lista los movimientos del lote
- ENTONCES recibe los 5 movimientos clasificados por naturaleza

---

### REQ-GM-05: No registrar movimientos en lote CERRADO

El sistema NO DEBE permitir registrar (ni eliminar) ningún movimiento sobre un
lote en estado `CERRADO` (granja.md §5.6).

#### Escenario: inversión sobre lote cerrado es rechazada

- DADO un lote en estado `CERRADO`
- CUANDO el usuario intenta registrar un `MovimientoInversion`
- ENTONCES el sistema rechaza con `GRANJA_LOTE_CERRADO_NO_EDITABLE`

#### Escenario: mortalidad sobre lote cerrado es rechazada

- DADO un lote en estado `CERRADO`
- CUANDO el usuario intenta registrar un `MovimientoCantidad`
- ENTONCES el sistema rechaza con `GRANJA_LOTE_CERRADO_NO_EDITABLE`

---

### REQ-GM-06: Multi-tenant defense in depth en movimientos

Todo movimiento DEBE tener `organizationId` NOT NULL (denormalizado desde el
lote). El sistema DEBE validar que el `loteId` y el `tipoRegistroId` pertenecen
a la misma org activa antes de crear el movimiento. Toda query DEBE filtrar por
`organizationId`.

#### Escenario: registrar movimiento en lote de otra org es imposible

- DADO un lote `L1` pertenece a la org "B"
- CUANDO un usuario de la org "A" intenta registrar un movimiento sobre `L1`
- ENTONCES el sistema responde `GRANJA_LOTE_NO_ENCONTRADO` (404) y no persiste nada

#### Escenario: usar un TipoRegistro de otra org es imposible

- DADO un lote `L1` de la org "A" y un tipo `T_B` que pertenece a la org "B"
- CUANDO un usuario de "A" intenta registrar un movimiento en `L1` con `tipoRegistroId = T_B`
- ENTONCES el sistema rechaza con `GRANJA_TIPO_REGISTRO_NO_ENCONTRADO` (no cruza el tipo entre orgs)

---

## Códigos de error

| Código | HTTP | Descripción |
|--------|------|-------------|
| `GRANJA_MOVIMIENTO_INVERSION_MONTO_INVALIDO` | 422 | Monto cero o negativo |
| `GRANJA_TIPO_REGISTRO_NATURALEZA_INVALIDA` | 422 | Naturaleza del tipo no coincide con el movimiento |
| `GRANJA_TIPO_REGISTRO_INACTIVO` | 422 | TipoRegistro está inactivo |
| `GRANJA_MOVIMIENTO_CANTIDAD_EXCEDE_VIVAS` | 422 | La cantidad de muertes dejaría avesVivas negativo |
| `GRANJA_MOVIMIENTO_CANTIDAD_INVALIDA` | 422 | Cantidad cero o negativa |
| `GRANJA_TIPO_REGISTRO_NO_ENCONTRADO` | 404 | TipoRegistro no existe o pertenece a otra org |
