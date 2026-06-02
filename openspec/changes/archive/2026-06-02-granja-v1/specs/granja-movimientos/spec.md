# Spec: granja-movimientos

> Fecha: 2026-06-01
> Fase: spec
> Change: granja-v1
> Proyecto: avicont
> Fuente de verdad del modelo: `docs/disenos/granja.md` §4.2, §5.2, §5.4

## Purpose

Registro de los dos tipos de movimiento que cuelgan de un lote:
`MovimientoInversion` (lleva `monto`, plata que entra al lote) y
`MovimientoCantidad` (lleva `cantidad`, aves que **salen** — mortalidad/descarte).
Cada movimiento se enruta por la `naturaleza` de su `TipoRegistro`. El lote tiene
un único ingreso de aves (`cantidadInicial`), por lo que todo `MovimientoCantidad`
es una **resta**, sujeta al invariante duro `avesVivas ≥ 0`.

## Glosario

| Término | Definición |
|---------|-----------|
| **MovimientoInversion** | Costo incurrido en el lote. Lleva `monto` (`Money`, `Decimal(18,2)`, > 0). Su `TipoRegistro.naturaleza` debe ser `INVERSION`. |
| **MovimientoCantidad** | Aves que salen del lote (mortalidad). Lleva `cantidad` (`Int`, > 0). Su `TipoRegistro.naturaleza` debe ser `CANTIDAD`. Siempre resta. |
| **avesVivas** | Derivado: `cantidadInicial − Σ(MovimientoCantidad.cantidad)`. Invariante `≥ 0`. |
| **detalle** | Texto libre opcional en ambos movimientos, `@MaxLength(500)`. La válvula que mantiene chico el catálogo de tipos (§5.3). |
| **monto en HTTP** | Cruza la API como `string` (ej. `"1250.50"`) para evitar pérdida IEEE-754 (§4.5 core). |

---

## Requirements

### Requirement: Registrar movimiento de inversión

El sistema DEBE permitir, con permiso `granja.movimientos.create`, registrar un
`MovimientoInversion` sobre un lote `ACTIVO` con: `tipoRegistroId` (UUID,
obligatorio, debe ser un `TipoRegistro` de la org con `naturaleza = INVERSION` y
`activo = true`), `monto` (`Money` > 0, recibido como string), `fecha`
(`FechaContable`, obligatoria — PUEDE ser anterior a `fechaIngreso`), `detalle`
(string opcional, ≤ 500). El `organizationId` se denormaliza desde el lote.

#### Scenario: Registrar inversión válida

- GIVEN un lote `ACTIVO` y un tipo "Alimento" (`INVERSION`, `activo`)
- WHEN el usuario registra `monto = "1250.50"`, `fecha = 2026-06-05`, `tipoRegistroId = Alimento`
- THEN se persiste el `MovimientoInversion` con `monto = 1250.50` y `organizationId` del lote

#### Scenario: Inversión con monto cero o negativo es rechazada

- GIVEN un lote `ACTIVO`
- WHEN el usuario registra una inversión con `monto = "0"` (o `"-50"`)
- THEN el sistema rechaza con `GRANJA_MOVIMIENTO_INVERSION_MONTO_INVALIDO`

#### Scenario: Fecha previa al ingreso es válida (gastos previos)

- GIVEN un lote con `fechaIngreso = 2026-06-01`
- WHEN el usuario registra una inversión "Mantenimiento Galpón" con `fecha = 2026-05-20`
- THEN el movimiento se acepta (gastos previos a la entrada de los pollitos son válidos)

#### Scenario: detalle excede 500 chars es rechazado

- GIVEN un lote `ACTIVO`
- WHEN el usuario registra una inversión con `detalle` de 501 caracteres
- THEN el sistema rechaza con error de validación (`@MaxLength(500)`)

---

### Requirement: Ruteo por naturaleza del TipoRegistro

El sistema DEBE rechazar un `MovimientoInversion` cuyo `TipoRegistro` tenga
`naturaleza = CANTIDAD`, y un `MovimientoCantidad` cuyo `TipoRegistro` tenga
`naturaleza = INVERSION`. La naturaleza del tipo DEBE matchear la tabla del
movimiento.

#### Scenario: Inversión con tipo de naturaleza CANTIDAD es rechazada

- GIVEN el tipo "Mortalidad" (`naturaleza = CANTIDAD`)
- WHEN el usuario intenta registrar un `MovimientoInversion` con `tipoRegistroId = Mortalidad`
- THEN el sistema rechaza con `GRANJA_TIPO_REGISTRO_NATURALEZA_INVALIDA`

#### Scenario: Cantidad con tipo de naturaleza INVERSION es rechazada

- GIVEN el tipo "Alimento" (`naturaleza = INVERSION`)
- WHEN el usuario intenta registrar un `MovimientoCantidad` con `tipoRegistroId = Alimento`
- THEN el sistema rechaza con `GRANJA_TIPO_REGISTRO_NATURALEZA_INVALIDA`

#### Scenario: Tipo de registro inactivo es rechazado

- GIVEN el tipo "Fletes" (`INVERSION`) está `activo = false`
- WHEN el usuario intenta registrar una inversión con ese tipo
- THEN el sistema rechaza con `GRANJA_TIPO_REGISTRO_INACTIVO`

---

### Requirement: Registrar movimiento de cantidad (mortalidad) con invariante avesVivas ≥ 0

El sistema DEBE permitir, con permiso `granja.movimientos.create`, registrar un
`MovimientoCantidad` sobre un lote `ACTIVO` con: `tipoRegistroId` (`naturaleza =
CANTIDAD`, `activo`), `cantidad` (`Int` > 0), `fecha` (`FechaContable`),
`detalle` (opcional ≤ 500). El sistema NO DEBE permitir una salida que deje
`avesVivas` en negativo: `Σ(muertes) + nuevaCantidad ≤ cantidadInicial`. Este
invariante se enforza en el service (no hay CHECK de BD posible, P6), y la
validación DEBE hacerse de forma consistente bajo concurrencia (`SELECT FOR
UPDATE` sobre el lote dentro de la transacción).

#### Scenario: Registrar mortalidad dentro del límite

- GIVEN un lote con `cantidadInicial = 5000` y 0 muertes registradas
- WHEN el usuario registra `MovimientoCantidad` con `cantidad = 30`
- THEN se persiste; `avesVivas` pasa a ser `4970`

#### Scenario: Mortalidad acumulada que supera las aves vivas es rechazada

- GIVEN un lote con `cantidadInicial = 5000` y `Σ(muertes) = 4990` (avesVivas = 10)
- WHEN el usuario registra una muerte con `cantidad = 20`
- THEN el sistema rechaza con `GRANJA_MOVIMIENTO_CANTIDAD_EXCEDE_VIVAS` y NO persiste el movimiento; `avesVivas` sigue en 10

#### Scenario: Mortalidad exacta que deja avesVivas = 0 es válida

- GIVEN un lote con `cantidadInicial = 5000` y `Σ(muertes) = 4990` (avesVivas = 10)
- WHEN el usuario registra una muerte con `cantidad = 10`
- THEN se persiste; `avesVivas` pasa a ser exactamente `0`

#### Scenario: Cantidad cero o negativa es rechazada

- GIVEN un lote `ACTIVO`
- WHEN el usuario registra un `MovimientoCantidad` con `cantidad = 0` (o `-5`)
- THEN el sistema rechaza con `GRANJA_MOVIMIENTO_CANTIDAD_INVALIDA`

#### Scenario: Concurrencia — dos muertes simultáneas no dejan avesVivas negativo

- GIVEN un lote con `cantidadInicial = 5000` y `avesVivas = 10`
- WHEN dos requests concurrentes intentan registrar `cantidad = 8` cada uno
- THEN a lo sumo uno tiene éxito (8 ≤ 10); el otro es rechazado con `GRANJA_MOVIMIENTO_CANTIDAD_EXCEDE_VIVAS`; el estado final NUNCA deja `avesVivas` negativo (gracias al `SELECT FOR UPDATE` sobre el lote en la TX)

---

### Requirement: Listar movimientos de un lote

El sistema DEBE permitir, con permiso `granja.movimientos.read`, listar los
movimientos (inversión y/o cantidad) de un lote de la org activa.

#### Scenario: Listar movimientos del lote

- GIVEN un lote con 3 inversiones y 2 movimientos de cantidad
- WHEN el usuario lista los movimientos del lote
- THEN recibe los 5 movimientos clasificados por naturaleza

---

### Requirement: No registrar movimientos en lote CERRADO

El sistema NO DEBE permitir registrar (ni eliminar) ningún movimiento sobre un
lote en estado `CERRADO` (granja.md §5.6).

#### Scenario: Inversión sobre lote cerrado es rechazada

- GIVEN un lote en estado `CERRADO`
- WHEN el usuario intenta registrar un `MovimientoInversion`
- THEN el sistema rechaza con `GRANJA_LOTE_CERRADO_NO_EDITABLE`

#### Scenario: Mortalidad sobre lote cerrado es rechazada

- GIVEN un lote en estado `CERRADO`
- WHEN el usuario intenta registrar un `MovimientoCantidad`
- THEN el sistema rechaza con `GRANJA_LOTE_CERRADO_NO_EDITABLE`

---

### Requirement: Multi-tenant defense in depth en movimientos

Todo movimiento DEBE tener `organizationId` NOT NULL (denormalizado desde el
lote). El sistema DEBE validar que el `loteId` y el `tipoRegistroId` pertenecen
a la misma org activa antes de crear el movimiento. Toda query DEBE filtrar por
`organizationId`.

#### Scenario: Registrar movimiento en lote de otra org es imposible

- GIVEN un lote `L1` pertenece a la org "B"
- WHEN un usuario de la org "A" intenta registrar un movimiento sobre `L1`
- THEN el sistema responde `GRANJA_LOTE_NO_ENCONTRADO` (404) y no persiste nada

#### Scenario: Usar un TipoRegistro de otra org es imposible

- GIVEN un lote `L1` de la org "A" y un tipo `T_B` que pertenece a la org "B"
- WHEN un usuario de "A" intenta registrar un movimiento en `L1` con `tipoRegistroId = T_B`
- THEN el sistema rechaza con `GRANJA_TIPO_REGISTRO_NO_ENCONTRADO` (no cruza el tipo entre orgs)
