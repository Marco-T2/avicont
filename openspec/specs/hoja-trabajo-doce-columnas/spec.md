# Hoja de Trabajo de 12 Columnas — Especificación

<!--
Última edición: 2026-06-15
Última revisión contra core: 2026-06-15
Owner: backend-lead
-->

> Fecha: 2026-06-15
> Fase: spec canónica
> Proyecto: avicont
> Capability: `hoja-trabajo-doce-columnas`

---

## Propósito

La **Hoja de Trabajo de 12 columnas** (worksheet / hoja de trabajo de cierre) es el
instrumento de papel de trabajo que el contador boliviano elabora **antes de cerrar el
ejercicio**. Consolida en una sola hoja auditable la trazabilidad completa:

```
Sumas (ordinarias) → Saldos → Ajustes → Saldos Ajustados → Estado de Resultados → Balance General
```

más la fila sintética de carry-over (utilidad/pérdida del ejercicio) que hace cuadrar
las dos últimas secciones. Es el insumo estándar del cierre contable y un control
cruzado fuerte: sus **Saldos Ajustados DEBEN coincidir con los Saldos del Balance de
Comprobación** del mismo rango (porque ambos agregan el mismo universo de movimientos —
la diferencia es que la Hoja separa AJUSTE en su propia columna y excluye CIERRE).

Expone el endpoint `GET /api/eeff/hoja-trabajo`.

Se ubica en el módulo `backend/src/reportes/` y extiende el port
`EeffSaldosReaderPort` con un nuevo método de lectura de saldos con split
AJUSTE/ordinario. Las firmas de los métodos existentes no cambian.

---

## Nota de nomenclatura de campos (implementación vs borrador)

> Los nombres de campos del DTO siguen la nomenclatura del **diseño técnico** (objetos
> anidados con nombres completos), NO el borrador plano de la delta spec. La delta spec
> usaba nombres planos (`totalErPerdidas`, `cuadraER`, `cuadraBG`, etc.) que se
> refinaron durante el diseño a nombres descriptivos en objetos anidados. Esta spec viva
> refleja el contrato OpenAPI real.

En la respuesta final:
- Los cuadres viven en el objeto anidado `cuadres` (`CuadresHojaTrabajoDto`) con nombres
  completos: `cuadraEstadoResultados` / `cuadraBalanceGeneral` / `diferenciaEstadoResultados`
  / `diferenciaBalanceGeneral` (no `cuadraER`/`cuadraBG`/`diferenciaER`/`diferenciaBG`).
- Los totales viven en el objeto anidado `totales` (`TotalesHojaTrabajoDto`) con nombres
  completos: `perdidas` / `ganancias` / `activo` / `pasivoPatrimonio` (no
  `totalErPerdidas`/`totalErGanancias`/`totalBgActivo`/`totalBgPasPat`).
- Las columnas 9–12 de cada fila se llaman `erPerdidas` / `erGanancias` / `bgActivo` /
  `bgPasPat` (prefijo de sección, conciso, sin redundancia con el anidado de totales).

---

## Glosario

- **Cuenta de detalle**: `esDetalle=true` — cuenta imputable, tiene movimientos reales.
- **Cuenta agrupadora**: `esDetalle=false` — no aparece en el reporte.
- **Comprobante ordinario**: `TipoComprobante NOT IN (AJUSTE, CIERRE)` — aporta a las columnas Sumas y Saldos.
- **Comprobante de ajuste**: `TipoComprobante = AJUSTE` — aporta exclusivamente a las columnas Ajustes.
- **Comprobante de cierre**: `TipoComprobante = CIERRE` — **excluido de todas las columnas** (la Hoja es pre-cierre por definición).
- **Sumas: Debe / Haber**: Σ débitos / Σ créditos BOB de comprobantes ordinarios en el rango.
- **Saldos: Deudor / Acreedor**: `MAX(sumasDebe − sumasHaber, 0)` / `MAX(sumasHaber − sumasDebe, 0)`.
- **Ajustes: Debe / Haber**: Σ débitos / Σ créditos BOB de comprobantes tipo AJUSTE en el rango.
- **Saldos Ajustados: Deudor / Acreedor**: `MAX((sumasDebe + ajustesDebe) − (sumasHaber + ajustesHaber), 0)` / simétrico.
- **Estado de Resultados: Pérdidas**: aportan cuentas `EGRESO` → su `saldoAjustadoDeudor`.
- **Estado de Resultados: Ganancias**: aportan cuentas `INGRESO` → su `saldoAjustadoAcreedor`.
- **Balance General: Activo**: aportan cuentas `ACTIVO` → su `saldoAjustadoDeudor` (con inversión de signo si `esContraria=true`).
- **Balance General: Pasivo-Patrimonio**: aportan cuentas `PASIVO | PATRIMONIO` → su `saldoAjustadoAcreedor` (con inversión de signo si `esContraria=true`).
- **Carry-over (fila sintética)**: fila adicional representando la utilidad/pérdida del ejercicio que equilibra el ER y el BG.
- **Cuenta contraria** (`esContraria=true`): su saldo ajustado RESTA del total de su sección BG en vez de sumar (ej. Depreciación Acumulada resta del Activo). Se coloca con signo negativo en la misma columna de su clase (D-05 del diseño).
- **`cuadra`**: AND de los 6 invariantes de cuadre de la hoja, tolerancia ±Bs 0.01 (§4.1 CLAUDE.md).
- **Monto string**: todo importe viaja como `string` decimal (`"1000.00"`), nunca `number` (§4.5 CLAUDE.md).
- **FechaContable**: fecha calendario puro `"YYYY-MM-DD"`, sin hora ni UTC (§4.6 CLAUDE.md).

---

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

### REQ-HT-01 — Endpoint y rango por dos modos mutuamente excluyentes

El sistema DEBE exponer `GET /api/eeff/hoja-trabajo` que acepta el rango del reporte
en exactamente UNO de dos modos:
- **Modo rango**: `desde` + `hasta`, ambos `YYYY-MM-DD`.
- **Modo período**: `periodoFiscalId` (UUID v4), del cual deriva `[desde, hasta]`
  como el mes completo del período vía `PeriodosReaderPort.obtenerRangoFechas`.

Además acepta `incluirAnulados?` (boolean, default `false`).

#### Escenario: rango directo válido

- DADO un tenant con comprobantes CONTABILIZADO en abril 2026
- CUANDO consulta `GET /api/eeff/hoja-trabajo?desde=2026-04-01&hasta=2026-04-30`
- ENTONCES responde 200 con la hoja de trabajo y `fechaDesde="2026-04-01"`,
  `fechaHasta="2026-04-30"`.

#### Escenario: por periodoFiscalId

- DADO un período fiscal de abril 2026 con id `P`
- CUANDO consulta `GET /api/eeff/hoja-trabajo?periodoFiscalId=P`
- ENTONCES el service resuelve el rango `[2026-04-01, 2026-04-30]` vía
  `PeriodosReaderPort.obtenerRangoFechas` y responde 200.

#### Escenario: ambos modos a la vez

- CUANDO consulta con `desde`/`hasta` Y `periodoFiscalId` simultáneamente
- ENTONCES responde 422 con código `REPORTES_HOJA_TRABAJO_RANGO_AMBIGUO`.

#### Escenario: ningún modo proporcionado

- CUANDO consulta sin `desde`/`hasta` ni `periodoFiscalId`
- ENTONCES responde 422 con código `REPORTES_HOJA_TRABAJO_RANGO_REQUERIDO`.

---

### REQ-HT-02 — Validación del rango de fechas

El sistema DEBE validar el rango antes de leer saldos.

#### Escenario: formato de fecha inválido

- CUANDO `desde=2026-13-40` (fecha imposible o formato erróneo)
- ENTONCES responde 422 con código `REPORTES_HOJA_TRABAJO_RANGO_INVALIDO`.

#### Escenario: desde posterior a hasta

- CUANDO `desde=2026-04-30&hasta=2026-04-01`
- ENTONCES responde 422 con código `REPORTES_HOJA_TRABAJO_RANGO_INVALIDO`.

#### Escenario: modo rango incompleto (solo una fecha)

- CUANDO `desde=2026-04-01` sin `hasta` (o `hasta` sin `desde`)
- ENTONCES responde 422 con código `REPORTES_HOJA_TRABAJO_RANGO_INVALIDO`.

#### Escenario: periodoFiscalId inexistente o de otro tenant

- CUANDO `periodoFiscalId` no existe o pertenece a otro tenant
- ENTONCES responde 422 con código `REPORTES_HOJA_TRABAJO_PERIODO_NO_ENCONTRADO`
  (no distingue inexistente de ajeno — defense in depth §4.2 CLAUDE.md).

---

### REQ-HT-03 — Columnas Sumas por cuenta de detalle con movimiento

Por cada cuenta con `esDetalle=true` y movimiento **ordinario** en el rango, el
sistema DEBE calcular las columnas Sumas:
- `sumasDebe` = Σ `debitoBob` de comprobantes ordinarios (`tipo NOT IN (AJUSTE, CIERRE)`)
  con estado `IN (CONTABILIZADO, BLOQUEADO)` en el rango.
- `sumasHaber` = Σ `creditoBob` de comprobantes ordinarios.

Los comprobantes tipo `CIERRE` quedan excluidos de esta columna Y de todas las demás.

#### Escenario: cuenta con comprobantes ordinarios

- DADO una cuenta con Σ débitos ordinarios `1200.00` y Σ créditos ordinarios `400.00`
  en el rango
- ENTONCES `sumasDebe="1200.00"` y `sumasHaber="400.00"` en la fila de esa cuenta.

#### Escenario: comprobante de cierre no suma a ninguna columna

- DADO un comprobante tipo CIERRE con débito `500.00` en la cuenta
- CUANDO se consulta la hoja de trabajo
- ENTONCES ese débito NO aparece en `sumasDebe` ni en ninguna otra columna de la cuenta.

---

### REQ-HT-04 — Columnas Saldos (mecánica universal)

A partir de las columnas Sumas, el sistema DEBE calcular:
- `saldoDeudor` = `MAX(sumasDebe − sumasHaber, 0)`.
- `saldoAcreedor` = `MAX(sumasHaber − sumasDebe, 0)`.

`saldoDeudor` y `saldoAcreedor` son mutuamente excluyentes. La mecánica es universal
(no depende de la naturaleza de la cuenta), idéntica al Balance de Comprobación.

#### Escenario: cuenta con débito ordinario mayor que crédito ordinario

- DADO `sumasDebe=1200.00`, `sumasHaber=400.00`
- ENTONCES `saldoDeudor="800.00"`, `saldoAcreedor="0.00"`.

#### Escenario: cuenta con crédito ordinario mayor que débito ordinario

- DADO `sumasDebe=300.00`, `sumasHaber=900.00`
- ENTONCES `saldoDeudor="0.00"`, `saldoAcreedor="600.00"`.

#### Escenario: sumas ordinarias iguales (saldo neto cero)

- DADO `sumasDebe=500.00`, `sumasHaber=500.00`
- ENTONCES `saldoDeudor="0.00"`, `saldoAcreedor="0.00"`.

---

### REQ-HT-05 — Columnas Ajustes

Por cada cuenta con `esDetalle=true`, el sistema DEBE calcular las columnas Ajustes
a partir de comprobantes tipo `AJUSTE` con estado `IN (CONTABILIZADO, BLOQUEADO)`:
- `ajustesDebe` = Σ `debitoBob` de comprobantes tipo AJUSTE en el rango.
- `ajustesHaber` = Σ `creditoBob` de comprobantes tipo AJUSTE en el rango.

Si la cuenta no tiene comprobantes AJUSTE en el rango, ambas columnas son `"0.00"`.

#### Escenario: cuenta con asientos de ajuste

- DADO una cuenta con Σ débitos AJUSTE `200.00` y Σ créditos AJUSTE `0.00`
- ENTONCES `ajustesDebe="200.00"` y `ajustesHaber="0.00"`.

#### Escenario: cuenta sin asientos de ajuste

- DADO una cuenta sin comprobantes tipo AJUSTE en el rango
- ENTONCES `ajustesDebe="0.00"` y `ajustesHaber="0.00"`.

---

### REQ-HT-06 — Columnas Saldos Ajustados

A partir de la combinación de Sumas y Ajustes, el sistema DEBE calcular:
- `saldoAjustadoDeudor` = `MAX((sumasDebe + ajustesDebe) − (sumasHaber + ajustesHaber), 0)`.
- `saldoAjustadoAcreedor` = `MAX((sumasHaber + ajustesHaber) − (sumasDebe + ajustesDebe), 0)`.

Ambos son mutuamente excluyentes: a lo sumo uno es > 0.

#### Escenario: ajuste que amplía el saldo deudor

- DADO `sumasDebe=1200.00`, `sumasHaber=400.00`, `ajustesDebe=100.00`, `ajustesHaber=0.00`
- ENTONCES `saldoAjustadoDeudor="900.00"` (`(1200+100)−(400+0)`),
  `saldoAjustadoAcreedor="0.00"`.

#### Escenario: ajuste que revierte un saldo deudor a acreedor

- DADO `sumasDebe=300.00`, `sumasHaber=200.00`, `ajustesDebe=0.00`, `ajustesHaber=200.00`
- ENTONCES la suma total deudora `300` < la suma total acreedora `400`,
  por lo que `saldoAjustadoDeudor="0.00"` y `saldoAjustadoAcreedor="100.00"`.

#### Escenario: cuenta con solo movimiento de ajuste (sumas ordinarias en cero)

- DADO una cuenta con `sumasDebe=0.00`, `sumasHaber=0.00`, `ajustesDebe=0.00`,
  `ajustesHaber=350.00`
- ENTONCES la cuenta APARECE en la hoja (tiene movimiento AJUSTE) con
  `saldoAjustadoDeudor="0.00"` y `saldoAjustadoAcreedor="350.00"`.
- Y sus columnas Sumas son `"0.00"` / `"0.00"`, sus columnas Saldos son `"0.00"` / `"0.00"`.

---

### REQ-HT-07 — Columnas Estado de Resultados (Pérdidas / Ganancias)

El sistema DEBE distribuir el saldo ajustado de las cuentas de resultado al Estado de
Resultados según su `claseCuenta`:
- Cuentas `EGRESO`: `saldoAjustadoDeudor` va a la columna **Pérdidas** (`erPerdidas`).
  Las cuentas EGRESO no aportan a Ganancias.
- Cuentas `INGRESO`: `saldoAjustadoAcreedor` va a la columna **Ganancias** (`erGanancias`).
  Las cuentas INGRESO no aportan a Pérdidas.
- Cuentas `ACTIVO`, `PASIVO`, `PATRIMONIO`: NO aportan a ninguna columna del ER.

#### Escenario: cuenta EGRESO aporta a Pérdidas

- DADO una cuenta `claseCuenta=EGRESO` con `saldoAjustadoDeudor="3000.00"`
- ENTONCES `erPerdidas="3000.00"` y `erGanancias="0.00"` para esa cuenta.

#### Escenario: cuenta INGRESO aporta a Ganancias

- DADO una cuenta `claseCuenta=INGRESO` con `saldoAjustadoAcreedor="8000.00"`
- ENTONCES `erGanancias="8000.00"` y `erPerdidas="0.00"` para esa cuenta.

#### Escenario: cuenta de ACTIVO no aporta al ER

- DADO una cuenta `claseCuenta=ACTIVO` con `saldoAjustadoDeudor="5000.00"`
- ENTONCES `erPerdidas="0.00"` y `erGanancias="0.00"` para esa cuenta en la sección ER.

---

### REQ-HT-08 — Columnas Balance General (Activo / Pasivo-Patrimonio)

El sistema DEBE distribuir el saldo ajustado de las cuentas de posición al Balance
General según su `claseCuenta` y el flag `esContraria`:

- Cuentas `ACTIVO`:
  - Si `esContraria=false`: `saldoAjustadoDeudor` va a **Activo** (`bgActivo`).
  - Si `esContraria=true`: el saldo del lado de la naturaleza real (acreedor) va a **Activo**
    con signo negativo — se RESTA del total de Activo (ej. Depreciación Acumulada).
- Cuentas `PASIVO | PATRIMONIO`:
  - Si `esContraria=false`: `saldoAjustadoAcreedor` va a **Pasivo-Patrimonio** (`bgPasPat`).
  - Si `esContraria=true`: el saldo del lado de la naturaleza real (deudor) va a
    **Pasivo-Patrimonio** con signo negativo — se RESTA del total de Pasivo-Patrimonio.
- Cuentas `INGRESO`, `EGRESO`: NO aportan a ninguna columna del BG.

**Regla D-05** (diseño): el signo negativo NO cambia la columna de destino — el valor se
coloca en `bgActivo` o `bgPasPat` como valor negativo. Al totalizar por suma directa, el
negativo resta — espejo del árbol en `balance-arbol.ts`.

#### Escenario: cuenta ACTIVO normal aporta a Activo

- DADO una cuenta `claseCuenta=ACTIVO`, `esContraria=false`,
  `saldoAjustadoDeudor="5000.00"`
- ENTONCES `bgActivo="5000.00"` y `bgPasPat="0.00"` para esa cuenta.

#### Escenario: cuenta contraria ACTIVO resta del Activo

- DADO una cuenta `claseCuenta=ACTIVO`, `esContraria=true`,
  `saldoAjustadoAcreedor="1500.00"` (Depreciación Acumulada)
- ENTONCES `bgActivo="-1500.00"` (resta del Activo total) y `bgPasPat="0.00"`.

#### Escenario: cuenta PASIVO normal aporta a Pasivo-Patrimonio

- DADO una cuenta `claseCuenta=PASIVO`, `esContraria=false`,
  `saldoAjustadoAcreedor="2000.00"`
- ENTONCES `bgPasPat="2000.00"` y `bgActivo="0.00"` para esa cuenta.

#### Escenario: cuenta INGRESO no aporta al BG

- DADO una cuenta `claseCuenta=INGRESO` con `saldoAjustadoAcreedor="8000.00"`
- ENTONCES `bgActivo="0.00"` y `bgPasPat="0.00"` para esa cuenta en la sección BG.

---

### REQ-HT-09 — Fila sintética de carry-over (utilidad/pérdida del ejercicio)

El sistema DEBE agregar, tras las filas de detalle, una **fila sintética de carry-over**
que represente la utilidad o pérdida del ejercicio y equilibre las secciones ER y BG.

El cálculo es:
```
utilidadEjercicio = Σganancias − Σperdidas  (sobre los totales del ER acumulados)
```

- Si `utilidadEjercicio > 0` (utilidad): la fila aporta `utilidadEjercicio` a la columna
  **Pérdidas** (para igualar Ganancias) Y a la columna **Pasivo-Patrimonio** (el resultado
  del ejercicio engrosa el patrimonio).
- Si `utilidadEjercicio < 0` (pérdida neta): el valor absoluto aporta a la columna
  **Ganancias** (para igualar Pérdidas) Y a la columna **Activo** (pérdida reduce el neto).
- Si `utilidadEjercicio = 0`: la fila se OMITE (resultado 0 → ER y BG ya cuadran).

La fila sintética lleva:
- `esSintetica: true`
- `cuentaId: null`
- `codigoInterno: null`
- `nombre: "Utilidad del Ejercicio"` (si positiva) o `"Pérdida del Ejercicio"` (si negativa)
- Columnas 1–8 (`sumasDebe`..`saldoAjustadoAcreedor`): `"0.00"`.

#### Escenario: ejercicio con utilidad

- DADO `Σtotales.ganancias=10000.00` y `Σtotales.perdidas=7000.00`
- ENTONCES `utilidadEjercicio=3000.00`
- Y la fila sintética aporta `3000.00` a Pérdidas y `3000.00` a Pasivo-Patrimonio.
- Y tras el carry-over `Σperdidas = Σganancias = 10000.00`.
- Y `Σbgactivo = ΣbgpasPat` (incluye el `3000.00` de patrimonio).

#### Escenario: ejercicio con pérdida neta

- DADO `Σtotales.ganancias=5000.00` y `Σtotales.perdidas=9000.00`
- ENTONCES `utilidadEjercicio=-4000.00`
- Y la fila sintética aporta `4000.00` a Ganancias y `4000.00` a Activo.
- Y tras el carry-over `Σperdidas = Σganancias = 9000.00`.
- Y `ΣbgActivo = ΣbgPasPat`.

---

### REQ-HT-10 — Invariantes de cuadre (±Bs 0.01)

El sistema DEBE verificar y exponer los siguientes invariantes de cuadre en el objeto
`cuadres`, todos con tolerancia ±Bs 0.01 (§4.1 CLAUDE.md, vía `Money.balanceadoEnBobCon`):

1. `cuadraSumas`: `totales.sumasDebe ≈ totales.sumasHaber`.
2. `cuadraSaldos`: `totales.saldoDeudor ≈ totales.saldoAcreedor`.
3. `cuadraAjustes`: `totales.ajustesDebe ≈ totales.ajustesHaber`.
4. `cuadraSaldosAjustados`: `totales.saldoAjustadoDeudor ≈ totales.saldoAjustadoAcreedor`.
5. `cuadraEstadoResultados` (post carry-over): `totales.perdidas ≈ totales.ganancias`.
6. `cuadraBalanceGeneral` (post carry-over): `totales.activo ≈ totales.pasivoPatrimonio`.

El campo raíz `cuadres.cuadra: boolean` = AND de los seis invariantes.
Además se exponen las diferencias: `diferenciaSumas`, `diferenciaSaldos`, `diferenciaAjustes`,
`diferenciaSaldosAjustados`, `diferenciaEstadoResultados`, `diferenciaBalanceGeneral`.

El reporte NO falla cuando detecta un descuadre — lo reporta como señal de control.

#### Escenario: hoja completamente cuadrada

- DADO comprobantes que respetan la partida doble y ajustes balanceados
- ENTONCES todos los `cuadres.cuadra*=true`, `cuadres.cuadra=true`, todas las `diferencia*="0.00"`.

#### Escenario: descuadre detectado en Sumas

- DADO datos que violan la partida doble (Σdébitos ≠ Σcréditos)
- ENTONCES `cuadres.cuadraSumas=false`, `cuadres.cuadra=false`, `cuadres.diferenciaSumas` refleja la diferencia.
  El endpoint responde 200 — el descuadre se reporta, no lanza error.

---

### REQ-HT-11 — Control cruzado: Saldos Ajustados == Saldos del Balance de Comprobación

El sistema DEBE garantizar que, para el mismo rango y el mismo toggle `incluirAnulados`,
los `saldoAjustadoDeudor` / `saldoAjustadoAcreedor` de la Hoja de Trabajo sean
equivalentes a los `saldoDeudor` / `saldoAcreedor` del Balance de Comprobación.

Fundamento: el Balance de Comprobación agrega TODO (ordinario + AJUSTE), y la Hoja
separa AJUSTE en su propia columna antes de recombinar. CIERRE queda fuera de ambos.

#### Escenario: cross-check E2E

- DADO los mismos comprobantes (ordinarios + AJUSTE, sin CIERRE), mismo rango, mismo tenant
- CUANDO se consultan tanto `GET /api/eeff/balance-comprobacion?desde=…&hasta=…`
  como `GET /api/eeff/hoja-trabajo?desde=…&hasta=…`
- ENTONCES para cada cuenta que aparece en ambos reportes:
  `hojaLinea.saldoAjustadoDeudor == bcLinea.saldoDeudor` (±0.01)
  `hojaLinea.saldoAjustadoAcreedor == bcLinea.saldoAcreedor` (±0.01)

---

### REQ-HT-12 — Solo cuentas de detalle con movimiento

El sistema DEBE incluir SOLO las cuentas que cumplen `esDetalle=true` Y tienen al menos
uno de los siguientes: `sumasDebe > 0`, `sumasHaber > 0`, `ajustesDebe > 0`,
`ajustesHaber > 0`. Las cuentas agrupadoras y las de detalle sin ningún movimiento en el
rango se OMITEN.

#### Escenario: cuenta de detalle sin ningún movimiento omitida

- DADO una cuenta de detalle activa sin líneas ordinarias ni de ajuste en el rango
- ENTONCES NO aparece en `lineas`.

#### Escenario: cuenta agrupadora omitida

- DADO una cuenta agrupadora (`esDetalle=false`) con descendientes con movimiento
- ENTONCES la agrupadora NO aparece como fila.

#### Escenario: cuenta con solo movimiento de ajuste incluida

- DADO una cuenta de detalle con `sumasDebe=0.00`, `sumasHaber=0.00`,
  `ajustesDebe=0.00`, `ajustesHaber=350.00`
- ENTONCES la cuenta SÍ aparece en `lineas` (tiene movimiento de ajuste).

---

### REQ-HT-13 — Orden de las líneas

El sistema DEBE ordenar las filas de detalle por `codigoInterno` ASC (`localeCompare`).
La fila sintética de carry-over aparece al FINAL, tras todas las filas de detalle.

#### Escenario: orden por código

- DADO cuentas `1101`, `2101`, `4101`, `5101` con movimiento
- ENTONCES las filas salen en orden `1101`, `2101`, `4101`, `5101`,
  seguidas de la fila sintética de carry-over (si la hay).

---

### REQ-HT-14 — Anulados excluidos por default

El sistema DEBE excluir comprobantes con `anulado=true` salvo que
`incluirAnulados=true` (§4.7 CLAUDE.md). BORRADOR nunca se incluye (estado garantizado
por el port).

#### Escenario: anulado excluido por default

- DADO un comprobante anulado (ordinario o AJUSTE) en el rango
- CUANDO consulta sin `incluirAnulados`
- ENTONCES sus líneas NO suman a ninguna columna de la hoja.

#### Escenario: anulado incluido con toggle

- CUANDO consulta con `incluirAnulados=true`
- ENTONCES las líneas del comprobante anulado sí suman a sus columnas correspondientes.

---

### REQ-HT-15 — Multi-tenant aislado (CRÍTICO)

El sistema DEBE computar el reporte solo con datos del tenant del JWT activo. El
`tenantId` se resuelve del JWT y es el **primer predicado** de toda lectura
(§4.2 CLAUDE.md, Anti-31).

#### Escenario: aislamiento entre tenants

- DADO dos tenants A y B con comprobantes en el mismo rango
- CUANDO un usuario de A consulta la hoja de trabajo
- ENTONCES ninguna fila ni total incluye montos de B.

---

### REQ-HT-16 — RBAC y módulo

El endpoint DEBE exigir el permiso `contabilidad.eeff.read` y el módulo `contabilidad`
habilitado (`@RequireModule('contabilidad')` a nivel de clase en `EeffController`).

#### Escenario: sin permiso

- DADO un usuario sin `contabilidad.eeff.read`
- ENTONCES responde 403.

#### Escenario: módulo contabilidad deshabilitado

- DADO un tenant con el módulo contabilidad deshabilitado
- ENTONCES responde 403 (ModuleEnabledGuard).

---

### REQ-HT-17 — Serialización de montos y fechas

El sistema DEBE serializar todos los montos como `string` decimal con 2 decimales
(`"700.00"`, §4.5 CLAUDE.md) y las fechas como `"YYYY-MM-DD"` (§4.6 CLAUDE.md).

#### Escenario: tipos de la respuesta

- ENTONCES todos los campos de montos en `lineas` (`sumasDebe`, `sumasHaber`,
  `saldoDeudor`, `saldoAcreedor`, `ajustesDebe`, `ajustesHaber`, `saldoAjustadoDeudor`,
  `saldoAjustadoAcreedor`, `erPerdidas`, `erGanancias`, `bgActivo`, `bgPasPat`) son
  strings decimales.
- Y todos los campos de `totales` y `cuadres.diferencia*` son strings decimales.
- Y `fechaDesde`, `fechaHasta` son `"YYYY-MM-DD"`.
- Y `cuadres.cuadra`, `cuadres.cuadraSumas`, `cuadres.cuadraSaldos`,
  `cuadres.cuadraAjustes`, `cuadres.cuadraSaldosAjustados`,
  `cuadres.cuadraEstadoResultados`, `cuadres.cuadraBalanceGeneral` son booleans.

---

### REQ-HT-18 — Señal de cuentas de naturaleza opuesta

El sistema DEBE devolver `cuentasNaturalezaOpuesta`: lista de cuentas cuyo **saldo
ajustado** cayó del lado opuesto a su `naturaleza`:
- Cuenta `DEUDORA` con `saldoAjustadoAcreedor > 0`.
- Cuenta `ACREEDORA` con `saldoAjustadoDeudor > 0`.

Es una señal de calidad para el contador (ajustes excesivos, errores de carga).
NO afecta los totales ni los invariantes de cuadre.

#### Escenario: cuenta deudora con saldo ajustado acreedor

- DADO una cuenta `naturaleza=DEUDORA` con `saldoAjustadoAcreedor=200.00`
  (ajuste que revirtió el saldo)
- ENTONCES aparece en `cuentasNaturalezaOpuesta` con su código, nombre, naturaleza
  y el saldo del lado opuesto; los totales NO cambian por ello.

#### Escenario: todas las cuentas con saldo ajustado de su naturaleza

- DADO todas las cuentas con `saldoAjustado` del lado esperado
- ENTONCES `cuentasNaturalezaOpuesta=[]`.

---

### REQ-HT-19 — Sin movimiento → hoja vacía cuadrada

El sistema DEBE devolver una respuesta válida (no error) cuando no hay cuentas con
movimiento en el rango.

#### Escenario: rango sin movimiento

- DADO un rango donde ninguna cuenta tiene líneas
- ENTONCES `lineas=[]` (sin fila sintética, ya que el resultado es 0), todos los
  `totales.*="0.00"`, `cuadres.cuadra=true`, `cuentasNaturalezaOpuesta=[]`.

---

### REQ-HT-20 — Robustez ante fila de saldo sin cuenta en la estructura

El sistema DEBE tolerar que una fila de saldo referencia un `cuentaId` que no está en
la estructura activa (cuenta inactiva o borrada con movimiento histórico): esa fila
se IGNORA sin lanzar error.

#### Escenario: fila de saldo de cuenta ausente en estructura

- DADO una fila de saldo del adapter con `cuentaId` que no aparece en la estructura activa
- ENTONCES esa fila se omite del reporte sin error y no afecta ningún total.

---

### REQ-HT-21 — Split AJUSTE/ordinario como única extensión del port

El sistema DEBE obtener, en una sola llamada al port, los cuatro agregados por cuenta
necesarios para las columnas de la hoja vía el método
`obtenerSaldosEnRangoSeparandoAjustes(tenantId, desde, hasta, incluirAnulados)`:
- `debitoOrdinarioBob` = Σ débitos de comprobantes `tipo NOT IN ('AJUSTE','CIERRE')`.
- `creditoOrdinarioBob` = Σ créditos de comprobantes `tipo NOT IN ('AJUSTE','CIERRE')`.
- `debitoAjusteBob` = Σ débitos de comprobantes `tipo = 'AJUSTE'`.
- `creditoAjusteBob` = Σ créditos de comprobantes `tipo = 'AJUSTE'`.

Este es el ÚNICO método nuevo del port `EeffSaldosReaderPort`. Las firmas de
`obtenerSaldosEnRango`, `obtenerSaldosHasta` y `obtenerEstructuraCuentas` permanecen
sin cambios.

El adapter implementa la segregación mediante **agregación condicional SQL**:
`SUM(lc.debitoBob) FILTER (WHERE c.tipo = 'AJUSTE')` y
`SUM(lc.debitoBob) FILTER (WHERE c.tipo NOT IN ('AJUSTE','CIERRE'))`.

El predicado base del WHERE (organizationId primero — Anti-31; estado IN
CONTABILIZADO/BLOQUEADO; rango fechaContable; flag anulado) es compartido vía el
helper privado `whereBaseRango` — mismo helper que usa `obtenerSaldosEnRango` tras el
refactor anti-drift incluido en este change.

#### Escenario: anti-drift del WHERE base

- DADO el adapter con el helper WHERE compartido
- CUANDO se llama al nuevo método del port con los mismos parámetros que
  `obtenerSaldosEnRango` (sin comprobantes CIERRE en los datos)
- ENTONCES `debitoOrdinarioBob + debitoAjusteBob` por cuenta es igual al `totalDebitoBob`
  que devuelve `obtenerSaldosEnRango` para el mismo rango y tenant (±0.01).

---

## Forma del DTO de respuesta (contrato OpenAPI real)

La respuesta cumple esta forma exacta (montos `string`, fechas `"YYYY-MM-DD"`).
Los objetos `totales` y `cuadres` son DTOs anidados (`TotalesHojaTrabajoDto` y
`CuadresHojaTrabajoDto`).

```typescript
// HojaTrabajoResponseDto
{
  fechaDesde: string,                // "YYYY-MM-DD" — inicio del rango
  fechaHasta: string,                // "YYYY-MM-DD" — fin del rango

  lineas: Array<LineaHojaTrabajoDto>,

  totales: {                         // TotalesHojaTrabajoDto
    sumasDebe: string,
    sumasHaber: string,
    saldoDeudor: string,
    saldoAcreedor: string,
    ajustesDebe: string,
    ajustesHaber: string,
    saldoAjustadoDeudor: string,
    saldoAjustadoAcreedor: string,
    perdidas: string,                // Σ columna ER Pérdidas (incluye carry-over)
    ganancias: string,               // Σ columna ER Ganancias (incluye carry-over)
    activo: string,                  // Σ columna BG Activo (incluye carry-over)
    pasivoPatrimonio: string,        // Σ columna BG Pasivo+Patrimonio (incluye carry-over)
  },

  cuadres: {                         // CuadresHojaTrabajoDto
    cuadra: boolean,                 // AND de los 6 invariantes
    cuadraSumas: boolean,
    cuadraSaldos: boolean,
    cuadraAjustes: boolean,
    cuadraSaldosAjustados: boolean,
    cuadraEstadoResultados: boolean, // post carry-over
    cuadraBalanceGeneral: boolean,   // post carry-over
    diferenciaSumas: string,
    diferenciaSaldos: string,
    diferenciaAjustes: string,
    diferenciaSaldosAjustados: string,
    diferenciaEstadoResultados: string,
    diferenciaBalanceGeneral: string,
  },

  cuentasNaturalezaOpuesta: Array<{
    cuentaId: string,
    codigoInterno: string,
    nombre: string,
    naturaleza: "DEUDORA" | "ACREEDORA",
    saldoOpuesto: string             // saldoAjustado del lado contrario a su naturaleza
  }>
}

// LineaHojaTrabajoDto — fila de detalle
{
  cuentaId: string | null,           // null solo en la fila sintética de carry-over
  codigoInterno: string | null,      // null solo en la fila sintética de carry-over
  nombre: string,
  naturaleza: string | null,         // "DEUDORA" | "ACREEDORA" | null (fila sintética)
  claseCuenta: string | null,        // "ACTIVO" | "PASIVO" | "PATRIMONIO" | "INGRESO" | "EGRESO" | null (fila sintética)
  esContraria: boolean,
  esSintetica: boolean,              // true SOLO en la fila de carry-over
  // — Par 1: Sumas (solo ordinarios, excluye AJUSTE y CIERRE) —
  sumasDebe: string,
  sumasHaber: string,
  // — Par 2: Saldos —
  saldoDeudor: string,               // MAX(sumasDebe - sumasHaber, 0)
  saldoAcreedor: string,             // MAX(sumasHaber - sumasDebe, 0)
  // — Par 3: Ajustes (solo tipo AJUSTE) —
  ajustesDebe: string,
  ajustesHaber: string,
  // — Par 4: Saldos Ajustados —
  saldoAjustadoDeudor: string,       // MAX((sumasDebe+ajustesDebe)-(sumasHaber+ajustesHaber), 0)
  saldoAjustadoAcreedor: string,     // MAX((sumasHaber+ajustesHaber)-(sumasDebe+ajustesDebe), 0)
  // — Par 5: Estado de Resultados —
  erPerdidas: string,                // EGRESO → saldoAjustadoDeudor; demás "0.00"
  erGanancias: string,               // INGRESO → saldoAjustadoAcreedor; demás "0.00"
  // — Par 6: Balance General —
  bgActivo: string,                  // ACTIVO normal → saldoAjustadoDeudor; contraria → "-saldoAjustadoAcreedor"
  bgPasPat: string,                  // PASIVO|PATRIMONIO normal → saldoAjustadoAcreedor; contraria → "-saldoAjustadoDeudor"
}
```

---

## Códigos de error

| Código | HTTP | Descripción |
|--------|------|-------------|
| `REPORTES_HOJA_TRABAJO_RANGO_REQUERIDO` | 422 | No se proporcionó ningún modo de rango |
| `REPORTES_HOJA_TRABAJO_RANGO_AMBIGUO` | 422 | Se proporcionaron ambos modos simultáneamente |
| `REPORTES_HOJA_TRABAJO_RANGO_INVALIDO` | 422 | Fecha con formato inválido, `desde > hasta`, o modo rango incompleto |
| `REPORTES_HOJA_TRABAJO_PERIODO_NO_ENCONTRADO` | 422 | `periodoFiscalId` inexistente o de otro tenant |

Namespace `REPORTES_HOJA_TRABAJO_*` propio (no se reusan los de `balance-comprobacion`)
para garantizar la estabilidad pública del contrato de errores (§6.3 CLAUDE.md).

---

## Notas de implementación

- **Sin migración**: el reporte se computa sobre datos existentes, sin cambiar el schema Prisma.
- **Método nuevo del port**: `obtenerSaldosEnRangoSeparandoAjustes` — tipo de retorno
  `SaldoCuentaSeparadoRow { cuentaId, debitoOrdinarioBob, creditoOrdinarioBob, debitoAjusteBob, creditoAjusteBob }`.
- **Helper compartido `whereBaseRango`**: helper privado del adapter que elimina el drift
  entre `obtenerSaldosEnRango` y `obtenerSaldosEnRangoSeparandoAjustes`. Refactor incluido.
- **Builder de dominio puro** (`domain/hoja-trabajo.ts`): función `construirHojaTrabajo` sin NestJS/Prisma.
- **Cuadre con `Money.balanceadoEnBobCon`**: tolerancia ±Bs 0.01 ya implementada en el VO.
- **`CuentaNaturalezaOpuestaDto` reutilizado** de `balance-comprobacion-response.dto.ts` (re-export).
- **Contrato OpenAPI**: `backend/openapi.json` + `frontend/src/types/api.generated.ts` regenerados.
- **Frontend pendiente**: vista + export a Excel en change futuro separado (la infra `lib/export-excel` ya existe).

## Notas regulatorias

- La Hoja de Trabajo es el instrumento estándar del cierre contable (práctica contable boliviana,
  Plan General de Contabilidad). Consolida la trazabilidad de ajustes pre-cierre en un solo
  instrumento auditable.
- Los montos se expresan en BOB (moneda funcional, §4.5 CLAUDE.md).
- Las fechas son `FechaContable` (calendario puro, §4.6 CLAUDE.md).
- El cuadre de sumas (Σ débitos = Σ créditos) verifica el invariante fundamental de la
  partida doble (Código Tributario art. 47).
- La exclusión del tipo CIERRE es esencial: la Hoja es un instrumento pre-cierre; incluir
  los asientos de cierre distorsionaría las columnas ER y BG.
