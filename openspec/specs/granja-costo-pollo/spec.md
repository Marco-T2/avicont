# granja-costo-pollo — Especificación

<!--
Última edición: 2026-06-02
Última revisión contra core: 2026-06-02
Owner: backend-lead
-->

> Fecha: 2026-06-02
> Fase: spec (live)
> Proyecto: avicont
> Capability nueva: `granja-costo-pollo` (no existía spec previa)
> Origen: change `granja-v1` (archivado 2026-06-02)
> Fuente de verdad del modelo: `docs/disenos/granja.md` §1.1, §4.1 (derivados), §5.5

---

## Propósito

El read-model de derivados — la joya del vertical. Calcula, **en lectura y nunca
persistido** (espejo del patrón de saldos contables, evita drift), el costo por
pollo vivo y los demás indicadores de un lote: `avesVivas`, `costoAcumulado`,
`costoPorPolloVivo`, `edadDias`, `porcentajeMortalidad`. Provee el informe de un
lote (totales + desglose por `TipoRegistro`) y un dashboard batch de N lotes
activos sin incurrir en N×2 queries.

---

## Glosario

| Derivado | Fórmula | Tipo / Notas |
|----------|---------|--------------|
| **avesVivas** | `cantidadInicial − Σ(MovimientoCantidad.cantidad)` | `Int`, invariante `≥ 0` |
| **costoAcumulado** | `Σ(MovimientoInversion.monto)` | `Money`, siempre `≥ 0` |
| **costoPorPolloVivo** | `avesVivas > 0 ? costoAcumulado / avesVivas : null` | `Money` o `null` (UI muestra "—") |
| **edadDias** | `ClockPort.hoyEnLaPaz() − fechaIngreso` | `Int` |
| **porcentajeMortalidad** | `Σ(muertes) / cantidadInicial` | porcentaje |

---

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

### REQ-GCP-01: Calcular costo por pollo vivo en lectura

El sistema DEBE calcular `costoPorPolloVivo` como
`costoAcumulado / avesVivas`, usando `Money` (nunca float), al momento de leer
el lote. El valor NUNCA se persiste. El cálculo usa los movimientos reales como
única fuente de verdad.

#### Escenario: lote con inversiones y mortalidad

- DADO un lote con `cantidadInicial = 5000`, inversiones que suman `Bs 75000.00`, y `Σ(muertes) = 100`
- CUANDO se lee el resumen del lote
- ENTONCES `avesVivas = 4900`, `costoAcumulado = Bs 75000.00`, `costoPorPolloVivo = Bs 15.31` (75000 / 4900, redondeo `Money`)

#### Escenario: la mortalidad encarece cada sobreviviente (el norte del módulo)

- DADO un lote con `costoAcumulado = Bs 75000.00` y `avesVivas = 5000` → `costoPorPolloVivo = Bs 15.00`
- CUANDO mueren 500 pollos (sin nuevas inversiones), `avesVivas = 4500`
- ENTONCES `costoAcumulado` NO baja (sigue `Bs 75000.00`) y `costoPorPolloVivo` SUBE a `Bs 16.67`

#### Escenario: lote sin inversiones

- DADO un lote recién creado con `cantidadInicial = 3000`, sin inversiones ni muertes
- CUANDO se lee el resumen
- ENTONCES `costoAcumulado = Bs 0.00`, `avesVivas = 3000`, `costoPorPolloVivo = Bs 0.00`

---

### REQ-GCP-02: Manejo de avesVivas = 0 (división por cero)

El sistema DEBE devolver `costoPorPolloVivo = null` cuando `avesVivas = 0` (no
hay sobrevivientes que repartan el costo). NUNCA DEBE lanzar una división por
cero. La UI representa `null` como "—".

#### Escenario: mortalidad total → costoPorPolloVivo null

- DADO un lote con `cantidadInicial = 5000`, inversiones por `Bs 30000.00`, y `Σ(muertes) = 5000` (avesVivas = 0)
- CUANDO se lee el resumen
- ENTONCES `avesVivas = 0`, `costoAcumulado = Bs 30000.00`, `costoPorPolloVivo = null` (no se divide entre cero)

#### Escenario: porcentajeMortalidad con mortalidad total

- DADO el lote anterior (5000 inicial, 5000 muertes)
- CUANDO se lee el resumen
- ENTONCES `porcentajeMortalidad = 100%`

---

### REQ-GCP-03: Informe del lote (totales + desglose por tipo)

El sistema DEBE proveer, con permiso `granja.lotes.read`, un informe del lote
con: los derivados (avesVivas, costoAcumulado, costoPorPolloVivo, edadDias,
porcentajeMortalidad) y el **desglose de costos por `TipoRegistro`** (cuánto se
gastó en Alimento, Vacunas, etc.).

#### Escenario: desglose por tipo de inversión

- DADO un lote con inversiones: Alimento `Bs 50000.00`, Vacunas `Bs 8000.00`, Mano de Obra `Bs 12000.00`
- CUANDO se lee el informe del lote
- ENTONCES el desglose muestra cada tipo con su subtotal y la suma `costoAcumulado = Bs 70000.00`

#### Escenario: edadDias usa ClockPort, no new Date

- DADO un lote con `fechaIngreso = 2026-06-01` y `ClockPort.hoyEnLaPaz()` fijado en `2026-06-15`
- CUANDO se lee el informe
- ENTONCES `edadDias = 14` (el cálculo usa `ClockPort`, determinista en test)

---

### REQ-GCP-04: Dashboard batch de lotes activos

El sistema DEBE proveer, con permiso `granja.dashboard.read`,
`GET /api/granja/dashboard` que devuelve los lotes `ACTIVO` de la org con su
`costoPorPolloVivo`, `avesVivas` y `porcentajeMortalidad`. El cálculo de N lotes
DEBE hacerse en **batch** (queries `WHERE loteId IN (...)`), NO con N×2 queries
individuales. El costo por pollo NUNCA se agrega a nivel org (cada lote es
independiente).

#### Escenario: dashboard con varios lotes activos

- DADO una org con 3 lotes `ACTIVO` (distintas edades y mortalidades) y 1 lote `CERRADO`
- CUANDO el usuario consulta el dashboard
- ENTONCES recibe los 3 lotes activos, cada uno con su `costoPorPolloVivo` y `porcentajeMortalidad` calculados independientemente; el lote `CERRADO` no aparece

#### Escenario: dashboard sin lotes activos

- DADO una org sin lotes `ACTIVO`
- CUANDO consulta el dashboard
- ENTONCES recibe una lista vacía (sin error)

#### Escenario: aislamiento — dashboard solo trae lotes de la org activa

- DADO la org "A" tiene 2 lotes activos y la org "B" tiene 5
- CUANDO un usuario de "A" consulta el dashboard
- ENTONCES recibe exactamente los 2 lotes de "A"

#### Escenario: no se agrega costo a nivel organización

- DADO una org con un lote de 10 días y otro de 40 días
- CUANDO se consulta el dashboard
- ENTONCES cada lote muestra su propio `costoPorPolloVivo`; NO existe un total/promedio de costo por pollo a nivel org
