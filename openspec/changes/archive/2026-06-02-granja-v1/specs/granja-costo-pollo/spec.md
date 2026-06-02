# Spec: granja-costo-pollo

> Fecha: 2026-06-01
> Fase: spec
> Change: granja-v1
> Proyecto: avicont
> Fuente de verdad del modelo: `docs/disenos/granja.md` §1.1, §4.1 (derivados), §5.5

## Purpose

El read-model de derivados — la joya del vertical. Calcula, **en lectura y nunca
persistido** (espejo del patrón de saldos contables, evita drift), el costo por
pollo vivo y los demás indicadores de un lote: `avesVivas`, `costoAcumulado`,
`costoPorPolloVivo`, `edadDias`, `porcentajeMortalidad`. Provee el informe de un
lote (totales + desglose por `TipoRegistro`) y un dashboard batch de N lotes
activos sin incurrir en N×2 queries.

## Glosario

| Derivado | Fórmula | Tipo / Notas |
|----------|---------|--------------|
| **avesVivas** | `cantidadInicial − Σ(MovimientoCantidad.cantidad)` | `Int`, invariante `≥ 0` |
| **costoAcumulado** | `Σ(MovimientoInversion.monto)` | `Money`, siempre `≥ 0` |
| **costoPorPolloVivo** | `avesVivas > 0 ? costoAcumulado / avesVivas : null` | `Money` o `null` (UI muestra "—") |
| **edadDias** | `ClockPort.hoyEnLaPaz() − fechaIngreso` | `Int` |
| **porcentajeMortalidad** | `Σ(muertes) / cantidadInicial` | porcentaje |

---

## Requirements

### Requirement: Calcular costo por pollo vivo en lectura

El sistema DEBE calcular `costoPorPolloVivo` como
`costoAcumulado / avesVivas`, usando `Money` (nunca float), al momento de leer
el lote. El valor NUNCA se persiste. El cálculo usa los movimientos reales como
única fuente de verdad.

#### Scenario: Lote con inversiones y mortalidad

- GIVEN un lote con `cantidadInicial = 5000`, inversiones que suman `Bs 75000.00`, y `Σ(muertes) = 100`
- WHEN se lee el resumen del lote
- THEN `avesVivas = 4900`, `costoAcumulado = Bs 75000.00`, `costoPorPolloVivo = Bs 15.31` (75000 / 4900, redondeo `Money`)

#### Scenario: La mortalidad encarece cada sobreviviente (el norte del módulo)

- GIVEN un lote con `costoAcumulado = Bs 75000.00` y `avesVivas = 5000` → `costoPorPolloVivo = Bs 15.00`
- WHEN mueren 500 pollos (sin nuevas inversiones), `avesVivas = 4500`
- THEN `costoAcumulado` NO baja (sigue `Bs 75000.00`) y `costoPorPolloVivo` SUBE a `Bs 16.67`

#### Scenario: Lote sin inversiones

- GIVEN un lote recién creado con `cantidadInicial = 3000`, sin inversiones ni muertes
- WHEN se lee el resumen
- THEN `costoAcumulado = Bs 0.00`, `avesVivas = 3000`, `costoPorPolloVivo = Bs 0.00`

---

### Requirement: Manejo de avesVivas = 0 (división por cero)

El sistema DEBE devolver `costoPorPolloVivo = null` cuando `avesVivas = 0` (no
hay sobrevivientes que repartan el costo). NUNCA DEBE lanzar una división por
cero. La UI representa `null` como "—".

#### Scenario: Mortalidad total → costoPorPolloVivo null

- GIVEN un lote con `cantidadInicial = 5000`, inversiones por `Bs 30000.00`, y `Σ(muertes) = 5000` (avesVivas = 0)
- WHEN se lee el resumen
- THEN `avesVivas = 0`, `costoAcumulado = Bs 30000.00`, `costoPorPolloVivo = null` (no se divide entre cero)

#### Scenario: porcentajeMortalidad con mortalidad total

- GIVEN el lote anterior (5000 inicial, 5000 muertes)
- WHEN se lee el resumen
- THEN `porcentajeMortalidad = 100%`

---

### Requirement: Informe del lote (totales + desglose por tipo)

El sistema DEBE proveer, con permiso `granja.lotes.read`, un informe del lote
con: los derivados (avesVivas, costoAcumulado, costoPorPolloVivo, edadDias,
porcentajeMortalidad) y el **desglose de costos por `TipoRegistro`** (cuánto se
gastó en Alimento, Vacunas, etc.).

#### Scenario: Desglose por tipo de inversión

- GIVEN un lote con inversiones: Alimento `Bs 50000.00`, Vacunas `Bs 8000.00`, Mano de Obra `Bs 12000.00`
- WHEN se lee el informe del lote
- THEN el desglose muestra cada tipo con su subtotal y la suma `costoAcumulado = Bs 70000.00`

#### Scenario: edadDias usa ClockPort, no new Date

- GIVEN un lote con `fechaIngreso = 2026-06-01` y `ClockPort.hoyEnLaPaz()` fijado en `2026-06-15`
- WHEN se lee el informe
- THEN `edadDias = 14` (el cálculo usa `ClockPort`, determinista en test)

---

### Requirement: Dashboard batch de lotes activos

El sistema DEBE proveer, con permiso `granja.dashboard.read`,
`GET /api/granja/dashboard` que devuelve los lotes `ACTIVO` de la org con su
`costoPorPolloVivo`, `avesVivas` y `porcentajeMortalidad`. El cálculo de N lotes
DEBE hacerse en **batch** (queries `WHERE loteId IN (...)`), NO con N×2 queries
individuales. El costo por pollo NUNCA se agrega a nivel org (cada lote es
independiente).

#### Scenario: Dashboard con varios lotes activos

- GIVEN una org con 3 lotes `ACTIVO` (distintas edades y mortalidades) y 1 lote `CERRADO`
- WHEN el usuario consulta el dashboard
- THEN recibe los 3 lotes activos, cada uno con su `costoPorPolloVivo` y `porcentajeMortalidad` calculados independientemente; el lote `CERRADO` no aparece

#### Scenario: Dashboard sin lotes activos

- GIVEN una org sin lotes `ACTIVO`
- WHEN consulta el dashboard
- THEN recibe una lista vacía (sin error)

#### Scenario: Aislamiento — dashboard solo trae lotes de la org activa

- GIVEN la org "A" tiene 2 lotes activos y la org "B" tiene 5
- WHEN un usuario de "A" consulta el dashboard
- THEN recibe exactamente los 2 lotes de "A"

#### Scenario: No se agrega costo a nivel organización

- GIVEN una org con un lote de 10 días y otro de 40 días
- WHEN se consulta el dashboard
- THEN cada lote muestra su propio `costoPorPolloVivo`; NO existe un total/promedio de costo por pollo a nivel org
