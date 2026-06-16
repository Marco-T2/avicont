# Estado de Flujo de Efectivo (EFE) — Especificación

<!--
Última edición: 2026-06-16
Última revisión contra core: 2026-06-16
Owner: backend-lead
-->

> Fecha: 2026-06-16
> Fase: spec canónica
> Proyecto: avicont
> Capability: `estado-flujo-efectivo`
> Alcance: BACKEND-ONLY (frontend diferido)

---

## Propósito

El **Estado de Flujo de Efectivo (EFE)** por **método indirecto** muestra cómo el efectivo
y sus equivalentes variaron en un período, conciliando el **resultado del ejercicio** con
la **variación neta de efectivo** a través de tres actividades (NIC 7):

```
Resultado del ejercicio
  (+) partidas no monetarias (depreciación, amortización, previsiones)
  (±) variaciones de capital de trabajo (Δ cuentas por cobrar, Δ inventarios, Δ cuentas por pagar…)
  = Flujo de actividades de OPERACIÓN
  ± Flujo de actividades de INVERSIÓN
  ± Flujo de actividades de FINANCIACIÓN
  = Variación neta de efectivo
```

Control cruzado (invariante de calidad): `efectivo_inicial + variación_neta ≈ efectivo_final`
(±Bs 0.01).

Expone el endpoint `GET /api/eeff/flujo-efectivo`. Vive en el módulo
`backend/src/reportes/`. Reutiliza `EeffSaldosReaderPort` **sin agregar métodos nuevos**
(solo extiende el tipo `CuentaEstructuraRow` con `actividadFlujo`).

---

## Glosario

- **Cuenta de detalle**: `esDetalle=true` — cuenta imputable, tiene movimientos.
- **Variación de cuenta**: `saldoNeto(final) − saldoNeto(inicial)` respetando naturaleza.
- **Cuenta de efectivo**: cuenta marcada con `actividadFlujo='EFECTIVO'` o, si NULL,
  identificada por el prefijo de efectivo del plan de cuentas (heurística). Es el OBJETIVO
  de la conciliación, NO una sección de actividad.
- **Partida no monetaria**: gasto/ingreso del resultado que no implicó movimiento de
  efectivo (depreciación, amortización, previsiones). Se SUMA de vuelta al resultado.
- **Variación de capital de trabajo**: variación de activos/pasivos corrientes
  no-efectivo de operación (Δ cuentas por cobrar, Δ inventarios, Δ cuentas por pagar).
- **Actividad de operación / inversión / financiación**: las 3 categorías de la NIC 7.
- **Cuenta de resultados acumulados** (`subClaseCuenta=PATRIMONIO_RESULTADOS`): cuenta
  patrimonial que recibe el traslado del resultado del ejercicio (asiento de cierre /
  devengo). Se EXCLUYE de financiación para no doble-contar el resultado, que ya es el
  punto de partida de operación (ver REQ-FE-08).
- **Monto string**: todo importe viaja como `string` decimal (`"1000.00"`), con signo
  cuando corresponde (`"-500.00"`), nunca `number` (§4.5 CLAUDE.md).
- **FechaContable**: fecha calendario puro `"YYYY-MM-DD"`, sin hora ni UTC (§4.6 CLAUDE.md).

---

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

### REQ-FE-01 — Endpoint y rango por dos modos mutuamente excluyentes

El sistema DEBE exponer `GET /api/eeff/flujo-efectivo` que acepta el rango en exactamente
UNO de dos modos:
- **Modo rango**: `desde` + `hasta`, ambos `YYYY-MM-DD`.
- **Modo período**: `periodoFiscalId` (UUID), del cual deriva `[desde, hasta]` vía
  `PeriodosReaderPort.obtenerRangoFechas`.

Además acepta `incluirAnulados?` (boolean, default `false`).

#### Escenario: rango directo válido

- DADO un tenant con comprobantes CONTABILIZADO en 2026
- CUANDO consulta `GET /api/eeff/flujo-efectivo?desde=2026-01-01&hasta=2026-12-31`
- ENTONCES responde 200 con el EFE y `fechaDesde="2026-01-01"`, `fechaHasta="2026-12-31"`.

#### Escenario: por periodoFiscalId

- DADO un período fiscal de abril 2026 con id `P`
- CUANDO consulta `GET /api/eeff/flujo-efectivo?periodoFiscalId=P`
- ENTONCES resuelve `[2026-04-01, 2026-04-30]` y responde 200.

#### Escenario: ambos modos a la vez

- CUANDO consulta con `desde`/`hasta` Y `periodoFiscalId` simultáneamente
- ENTONCES responde 422 con código `REPORTES_FLUJO_EFECTIVO_RANGO_AMBIGUO`.

#### Escenario: ningún modo proporcionado

- CUANDO consulta sin `desde`/`hasta` ni `periodoFiscalId`
- ENTONCES responde 422 con código `REPORTES_FLUJO_EFECTIVO_RANGO_REQUERIDO`.

---

### REQ-FE-02 — Validación del rango de fechas (en el service, no en el DTO)

El sistema DEBE validar el rango antes de leer saldos.

#### Escenario: formato inválido

- CUANDO `desde=2026-13-40`
- ENTONCES responde 422 con código `REPORTES_FLUJO_EFECTIVO_RANGO_INVALIDO`.

#### Escenario: desde posterior a hasta

- CUANDO `desde=2026-12-31&hasta=2026-01-01`
- ENTONCES responde 422 con código `REPORTES_FLUJO_EFECTIVO_RANGO_INVALIDO`.

#### Escenario: modo rango incompleto

- CUANDO `desde=2026-01-01` sin `hasta` (o viceversa)
- ENTONCES responde 422 con código `REPORTES_FLUJO_EFECTIVO_RANGO_INVALIDO`.

#### Escenario: periodoFiscalId inexistente o de otro tenant

- CUANDO `periodoFiscalId` no existe o pertenece a otro tenant
- ENTONCES responde 422 con código `REPORTES_FLUJO_EFECTIVO_PERIODO_NO_ENCONTRADO`
  (no distingue inexistente de ajeno — defense in depth §4.2 CLAUDE.md).

---

### REQ-FE-03 — Saldos inicial y final por corte de fecha (cero método nuevo de port)

El sistema DEBE obtener el saldo INICIAL y FINAL de cada cuenta llamando dos veces a
`obtenerSaldosHasta`:
- INICIAL: `fechaCorte = diaAnterior(desde)`.
- FINAL: `fechaCorte = hasta`.

Y el flujo del período vía `obtenerSaldosEnRango(desde, hasta)` para el resultado del
ejercicio y las partidas no monetarias. La estructura de cuentas vía
`obtenerEstructuraCuentas`.

#### Escenario: corte de saldo inicial en día previo

- DADO `desde=2026-04-01`
- CUANDO el service lee saldos iniciales
- ENTONCES corta en `2026-03-31` de modo que
  `saldoInicial + movimiento(rango) = saldoFinal` sin hueco ni solape.

---

### REQ-FE-04 — Clasificación de cuentas por actividad (campo explícito + default heurístico)

El sistema DEBE clasificar cada cuenta de detalle en una de las 4 actividades:
`EFECTIVO | OPERACION | INVERSION | FINANCIACION`.

Resolución (Enfoque C):
1. Si `cuenta.actividadFlujo` NO es NULL → usar ese valor.
2. Si es NULL → aplicar el **default heurístico**:
   - Cuenta de efectivo por código (prefijo de efectivo del plan de cuentas) → `EFECTIVO`.
   - `subClaseCuenta = ACTIVO_NO_CORRIENTE` → `INVERSION`.
   - `subClaseCuenta = PASIVO_NO_CORRIENTE` o `claseCuenta = PATRIMONIO` → `FINANCIACION`.
   - Resto (activos/pasivos corrientes no-efectivo, ingresos, egresos) → `OPERACION`.

#### Escenario: cuenta con actividadFlujo explícito gana sobre la heurística

- DADO una cuenta con `subClaseCuenta=ACTIVO_NO_CORRIENTE` y `actividadFlujo='OPERACION'`
- ENTONCES se clasifica como `OPERACION` (el campo explícito tiene prioridad).

#### Escenario: cuenta sin actividadFlujo cae en la heurística

- DADO una cuenta `subClaseCuenta=ACTIVO_NO_CORRIENTE`, `actividadFlujo=NULL`
- ENTONCES se clasifica como `INVERSION`.

#### Escenario: patrimonio sin actividadFlujo → financiación

- DADO una cuenta `claseCuenta=PATRIMONIO`, `actividadFlujo=NULL`, no es resultado del ejercicio
- ENTONCES se clasifica como `FINANCIACION`.

---

### REQ-FE-05 — Identificación de cuentas EFECTIVO

El sistema DEBE identificar las cuentas que representan efectivo y equivalentes:
1. Cuentas con `actividadFlujo='EFECTIVO'` (explícito).
2. Si ninguna cuenta tiene `actividadFlujo='EFECTIVO'`, las cuentas de detalle cuyo
   `codigoInterno` empieza con el **prefijo de efectivo del plan de cuentas** (`1.1.1`,
   "EFECTIVO Y EQUIVALENTES DE EFECTIVO") se identifican por heurística.

El efectivo NO va en ninguna sección de actividad: es el OBJETIVO de la conciliación.
`efectivo_inicial` = Σ saldoNeto(inicial) de las cuentas de efectivo;
`efectivo_final` = Σ saldoNeto(final).

#### Escenario: cuenta de efectivo explícita

- DADO una cuenta marcada `actividadFlujo='EFECTIVO'` con saldo inicial `5000.00` y final `8000.00`
- ENTONCES `efectivoInicial="5000.00"`, `efectivoFinal="8000.00"` y la cuenta NO aporta a
  ninguna sección de actividad.

#### Escenario: fallback heurístico por código

- DADO ninguna cuenta marcada `actividadFlujo='EFECTIVO'` y una cuenta `1.1.1.001 CAJA`
- ENTONCES CAJA se trata como efectivo por heurística.

---

### REQ-FE-06 — Sección OPERACIÓN por método indirecto

La sección de operación DEBE partir del **resultado del ejercicio** y ajustar:
- (+) partidas no monetarias (depreciación/amortización/previsiones — cuentas de activo no
  corriente con `esContraria=true`; la depreciación acumulada es la señal robusta del día
  uno, su variación se redirige a operación como partida no monetaria).
- (±) variaciones de capital de trabajo: variación de las cuentas clasificadas como
  `OPERACION` que NO son de resultado (activos/pasivos corrientes no-efectivo).

El **resultado del ejercicio** se computa con `calcularResultadoEjercicioBob` (la misma
fuente de verdad que Balance General y EEPN — anti-drift). NO se debe doble-contar: las
cuentas de ingreso/egreso ya están sintetizadas en el resultado del ejercicio y NO se
listan además como variaciones de capital de trabajo. La línea sintética
`RESULTADO_EJERCICIO` (`cuentaId=null`) encabeza las líneas de operación.

#### Escenario: punto de partida es el resultado del ejercicio

- DADO ingresos del rango `Σ=20000.00` y egresos `Σ=15000.00`
- ENTONCES el flujo de operación parte de `resultadoEjercicio="5000.00"`.

#### Escenario: variación de cuentas por cobrar reduce el flujo de operación

- DADO Δ cuentas por cobrar (activo corriente de operación) = `+3000.00` (aumentó)
- ENTONCES la variación entra como `-3000.00` en operación (un aumento de un activo
  consume efectivo).

#### Escenario: variación de cuentas por pagar aumenta el flujo de operación

- DADO Δ cuentas por pagar (pasivo corriente de operación) = `+2000.00` (aumentó)
- ENTONCES la variación entra como `+2000.00` en operación (un aumento de un pasivo
  libera efectivo).

#### Escenario: ingresos/egresos no se doble-cuentan

- DADO una cuenta de ingreso con variación de flujo en el rango
- ENTONCES su monto NO aparece como línea de variación de capital de trabajo (ya está
  dentro del resultado del ejercicio).

---

### REQ-FE-07 — Sección INVERSIÓN

La sección de inversión DEBE incluir la variación de las cuentas clasificadas como
`INVERSION` no contrarias (típicamente activos no corrientes "brutos"). Signo: un aumento
de un activo de inversión consume efectivo (signo negativo); una disminución libera
efectivo (positivo). Las cuentas contrarias de inversión (depreciación acumulada) NO entran
acá: ya se redirigen a operación como partida no monetaria (no se doble-cuentan).

#### Escenario: compra de activo fijo

- DADO un activo no corriente cuya variación = `+10000.00` (aumentó)
- ENTONCES aparece como `-10000.00` en la sección de inversión.

---

### REQ-FE-08 — Sección FINANCIACIÓN (exclusión de resultados acumulados — anti doble-conteo)

La sección de financiación DEBE incluir la variación de las cuentas clasificadas como
`FINANCIACION` (pasivos no corrientes + patrimonio). Signo: un aumento de un
pasivo/patrimonio de financiación libera efectivo (positivo); una disminución lo consume
(negativo).

El sistema NO DEBE incluir en financiación las cuentas patrimoniales de resultados
acumulados (`subClaseCuenta=PATRIMONIO_RESULTADOS`). El movimiento de esa cuenta es la
contrapartida del asiento de cierre/devengo que traslada el resultado del ejercicio al
patrimonio; el resultado YA es el punto de partida de operación, así que contarlo también
en financiación lo **doble-contaría** y rompería el cuadre del EFE. Esta exclusión se aplica
sobre la `subClaseCuenta`, no sobre la clase `PATRIMONIO` completa (los aportes de capital
SÍ son financiación legítima).

> LIMITACIÓN CONOCIDA: si la cuenta de resultados acumulados también registrara
> distribución de dividendos o retiros, esos SÍ serían financiación real. El día uno la
> exclusión es total sobre `PATRIMONIO_RESULTADOS`; el refinamiento se hace marcando
> `actividadFlujo` cuenta por cuenta (enfoque C) cuando exista la UI.

#### Escenario: aporte de capital

- DADO una cuenta de patrimonio de capital (`subClaseCuenta ≠ PATRIMONIO_RESULTADOS`),
  `claseCuenta=PATRIMONIO`, cuya variación = `+50000.00`
- ENTONCES aparece como `+50000.00` en la sección de financiación.

#### Escenario: el resultado del ejercicio no entra en financiación (CRÍTICO)

- DADO una cuenta patrimonial con `subClaseCuenta=PATRIMONIO_RESULTADOS` cuyo saldo varió
  por el traslado del resultado del ejercicio
- ENTONCES NO aparece como línea de financiación (se excluye para no doble-contar el
  resultado, que ya es el punto de partida de operación).

---

### REQ-FE-09 — Conciliación y variación neta de efectivo

El sistema DEBE calcular:
```
variacionNeta = flujoOperacion + flujoInversion + flujoFinanciacion
```
y exponer la conciliación: `efectivoInicial`, `variacionNeta`, `efectivoFinal`.

#### Escenario: variación neta suma las tres secciones

- DADO `flujoOperacion="5000.00"`, `flujoInversion="-10000.00"`, `flujoFinanciacion="50000.00"`
- ENTONCES `variacionNeta="45000.00"`.

---

### REQ-FE-10 — Invariante de cuadre (±Bs 0.01)

El sistema DEBE verificar `efectivoInicial + variacionNeta ≈ efectivoFinal` con tolerancia
±Bs 0.01 (vía `Money.balanceadoEnBobCon`) y exponer `cuadra: boolean` + `diferencia: string`.
El reporte NO falla cuando detecta un descuadre — lo reporta como señal de control
(HTTP 200).

#### Escenario: EFE cuadrado

- DADO `efectivoInicial="5000.00"`, `variacionNeta="3000.00"`, `efectivoFinal="8000.00"`
- ENTONCES `cuadra=true`, `diferencia="0.00"`.

#### Escenario: descuadre detectado

- DADO datos donde la suma de actividades no reconstruye la variación de efectivo
- ENTONCES `cuadra=false`, `diferencia` refleja el delta, y el endpoint responde 200.

---

### REQ-FE-11 — Señales de calidad

El sistema DEBE exponer señales de calidad (espejo de `cuentasNaturalezaOpuesta`):
- `advertencias`: lista de mensajes legibles, p.ej. "No se identificó ninguna cuenta de
  efectivo" o "Las cuentas de efectivo se identificaron por heurística de código (ninguna
  marcada explícitamente)".
- `cuentasEfectivoDetectadasPorHeuristica`: lista de cuentas de efectivo que se
  identificaron por el fallback de código (no por `actividadFlujo='EFECTIVO'`).

Estas señales NO afectan los totales ni el invariante de cuadre.

#### Escenario: ninguna cuenta de efectivo

- DADO un tenant sin cuentas de efectivo identificables (ni explícitas ni por código)
- ENTONCES `advertencias` incluye el aviso, `efectivoInicial="0.00"`,
  `efectivoFinal="0.00"`, y `cuadra` refleja si las actividades suman 0.

#### Escenario: efectivo identificado solo por heurística

- DADO cuentas de efectivo solo por código (`1.1.1.*`), ninguna marcada explícitamente
- ENTONCES `advertencias` incluye el aviso de heurística y
  `cuentasEfectivoDetectadasPorHeuristica` lista esas cuentas.

---

### REQ-FE-12 — Anulados excluidos por default

El sistema DEBE excluir comprobantes con `anulado=true` salvo `incluirAnulados=true`
(§4.7 CLAUDE.md). BORRADOR nunca se incluye (garantizado por el port).

#### Escenario: anulado excluido por default

- DADO un comprobante anulado en el rango
- CUANDO consulta sin `incluirAnulados`
- ENTONCES sus líneas NO afectan ningún flujo ni saldo de efectivo.

---

### REQ-FE-13 — Multi-tenant aislado (CRÍTICO)

El sistema DEBE computar el reporte solo con datos del tenant del JWT activo. El
`tenantId` se resuelve del JWT y es el **primer predicado** de toda lectura (§4.2 CLAUDE.md,
Anti-31).

#### Escenario: aislamiento entre tenants

- DADO dos tenants A y B con movimientos en el mismo rango
- CUANDO un usuario de A consulta el EFE
- ENTONCES ninguna línea, sección ni total incluye montos de B.

---

### REQ-FE-14 — RBAC y módulo

El endpoint DEBE exigir el permiso `contabilidad.eeff.read` (HEREDADO, NO crear permiso
nuevo) y el módulo `contabilidad` habilitado (`@RequireModule('contabilidad')` a nivel de
clase en `EeffController`).

#### Escenario: sin permiso

- DADO un usuario sin `contabilidad.eeff.read`
- ENTONCES responde 403.

#### Escenario: módulo contabilidad deshabilitado

- DADO un tenant con el módulo contabilidad deshabilitado
- ENTONCES responde 403 (ModuleEnabledGuard).

---

### REQ-FE-15 — Serialización de montos y fechas

El sistema DEBE serializar todos los montos como `string` decimal con 2 decimales,
con signo cuando aplica (`"-10000.00"`, §4.5 CLAUDE.md), y las fechas como `"YYYY-MM-DD"`
(§4.6 CLAUDE.md). `cuadra` es boolean.

#### Escenario: tipos de la respuesta

- ENTONCES `efectivoInicial`, `variacionNeta`, `efectivoFinal`, `diferencia`, los
  subtotales de sección y los montos de cada línea son strings decimales; `fechaDesde`,
  `fechaHasta` son `"YYYY-MM-DD"`; `cuadra` es boolean.

---

### REQ-FE-16 — Campo `actividadFlujo` nullable en el modelo `Cuenta`

El sistema DEBE agregar a `Cuenta` el campo `actividadFlujo` (enum `ActividadFlujo`,
nullable, sin default) vía migración aditiva. Es retrocompatible: las cuentas existentes
quedan en NULL y el reporte resuelve por heurística. El campo se incorpora al `select` de
`obtenerEstructuraCuentas` y al tipo `CuentaEstructuraRow`. La FIRMA de los métodos del
port NO cambia.

#### Escenario: cuenta existente sin actividadFlujo tras la migración

- DADO una cuenta creada antes de la migración
- ENTONCES su `actividadFlujo` es NULL y el reporte la clasifica por heurística.

---

### REQ-FE-17 — Sin movimiento → EFE vacío cuadrado

El sistema DEBE devolver una respuesta válida (no error) cuando no hay movimiento en el
rango.

#### Escenario: rango sin movimiento

- DADO un rango sin líneas
- ENTONCES todas las secciones tienen `lineas=[]` y subtotal `"0.00"`,
  `variacionNeta="0.00"`, `efectivoInicial`/`efectivoFinal` reflejan el saldo de arrastre
  (puede ser 0), y `cuadra=true` si arrastre inicial == final.

---

## Forma del DTO de respuesta (contrato OpenAPI real)

La respuesta cumple esta forma exacta (montos `string`, fechas `"YYYY-MM-DD"`).

```typescript
// EstadoFlujoEfectivoResponseDto
{
  fechaDesde: string,              // "YYYY-MM-DD"
  fechaHasta: string,              // "YYYY-MM-DD"

  // Punto de partida del método indirecto (informativo, dentro de operación)
  resultadoEjercicio: string,      // BOB string (utilidad +, pérdida −)

  operacion: {                     // SeccionFlujoDto
    lineas: Array<LineaFlujoDto>,  // RESULTADO_EJERCICIO + partidas no monetarias + Δ capital de trabajo
    subtotal: string,
  },
  inversion: {
    lineas: Array<LineaFlujoDto>,
    subtotal: string,
  },
  financiacion: {
    lineas: Array<LineaFlujoDto>,
    subtotal: string,
  },

  // Conciliación de efectivo
  efectivoInicial: string,         // Σ saldoNeto(inicial) de cuentas de efectivo
  variacionNeta: string,           // subtotalOperacion + subtotalInversion + subtotalFinanciacion
  efectivoFinal: string,           // Σ saldoNeto(final) de cuentas de efectivo

  // Invariante de cuadre (±Bs 0.01)
  cuadra: boolean,                 // (efectivoInicial + variacionNeta) ≈ efectivoFinal
  diferencia: string,              // (efectivoInicial + variacionNeta) − efectivoFinal; "0.00" si cuadra

  // Señales de calidad (no afectan totales)
  advertencias: string[],
  cuentasEfectivoDetectadasPorHeuristica: Array<{
    cuentaId: string,
    codigoInterno: string,
    nombre: string,
  }>,
}

// LineaFlujoDto — una línea dentro de una sección
{
  cuentaId: string | null,         // null en la línea sintética "Resultado del ejercicio"
  codigoInterno: string | null,
  nombre: string,                  // nombre de la cuenta o concepto sintético
  tipo: "RESULTADO_EJERCICIO" | "PARTIDA_NO_MONETARIA" | "VARIACION_CAPITAL_TRABAJO" | "VARIACION_CUENTA",
  monto: string,                   // flujo de caja con signo: "+x" libera, "-x" consume
}
```

---

## Códigos de error

| Código | HTTP | Descripción |
|--------|------|-------------|
| `REPORTES_FLUJO_EFECTIVO_RANGO_REQUERIDO` | 422 | No se proporcionó ningún modo de rango |
| `REPORTES_FLUJO_EFECTIVO_RANGO_AMBIGUO` | 422 | Se proporcionaron ambos modos simultáneamente |
| `REPORTES_FLUJO_EFECTIVO_RANGO_INVALIDO` | 422 | Fecha con formato inválido, `desde > hasta`, o modo rango incompleto |
| `REPORTES_FLUJO_EFECTIVO_PERIODO_NO_ENCONTRADO` | 422 | `periodoFiscalId` inexistente o de otro tenant |

Namespace `REPORTES_FLUJO_EFECTIVO_*` propio (§6.3 CLAUDE.md).

---

## Notas de implementación

- **Migración ADITIVA** (protocolo §11.6): `CREATE TYPE "ActividadFlujo"` +
  `ALTER TABLE "cuentas" ADD COLUMN "actividadFlujo" "ActividadFlujo"` (nullable, sin
  default). Migración `20260616000000_estado_flujo_efectivo`. Retrocompatible.
- **Enum de dominio** `ActividadFlujo { EFECTIVO, OPERACION, INVERSION, FINANCIACION }` en
  `backend/src/common/domain/enums.ts`; enum Prisma espejo en `schema.prisma`. Dueño:
  módulo `cuentas` (campo `Cuenta.actividadFlujo`); consumidor: `reportes` (EFE).
- **Cero método nuevo de port**: se reutiliza `EeffSaldosReaderPort` —
  `obtenerSaldosHasta(diaAnterior(desde))` (inicial), `obtenerSaldosHasta(hasta)` (final),
  `obtenerSaldosEnRango(desde, hasta)` (resultado + partidas no monetarias),
  `obtenerEstructuraCuentas`. La única extensión es el campo `actividadFlujo` en
  `CuentaEstructuraRow`; el adapter lo agrega al `select` y lo mapea en el boundary vía
  `enum-mappers.ts`. Firmas de los 4 métodos sin cambio.
- **Builder de dominio puro** `domain/estado-flujo-efectivo.ts`: función
  `construirEstadoFlujoEfectivo` + helper `resolverActividadFlujo` + constante
  `CODIGO_EFECTIVO_PREFIJO='1.1.1'`. Sin NestJS/Prisma. Reusa `calcularSaldoNeto` y
  `calcularResultadoEjercicioBob` (anti-drift con BG/EEPN).
- **Errores de dominio** `domain/estado-flujo-efectivo-errors.ts`: 4 subclases `DomainError`
  (namespace `REPORTES_FLUJO_EFECTIVO_*`, todas 422).
- **Service** `estado-flujo-efectivo.service.ts` (clon de `EvolucionPatrimonioService`,
  rango XOR período — sin `gestionId`).
- **Corrección del CRITICAL — anti doble-conteo** (REQ-FE-08): el builder excluye las
  cuentas `subClaseCuenta=PATRIMONIO_RESULTADOS` de la sección de financiación. El traslado
  del resultado al patrimonio es la contrapartida del cierre/devengo; el resultado ya es el
  punto de partida de operación, así que incluirlo en financiación lo doble-contaba y rompía
  el cuadre. La exclusión es por `subClaseCuenta` (no por la clase `PATRIMONIO` entera) para
  preservar los aportes de capital como financiación legítima.
- **OpenAPI**: `backend/openapi.json` + `frontend/src/types/api.generated.ts` regenerados;
  job CI `contract-drift` (§10.10).
- **Tests** (honeycomb §7.1, describe/it en español): builder unit ≥95%
  (`domain/estado-flujo-efectivo.spec.ts`), service unit
  (`estado-flujo-efectivo.service.spec.ts`), integration del adapter extendida
  (`actividadFlujo` en `obtenerEstructuraCuentas`), e2e
  (`test/estado-flujo-efectivo.e2e-spec.ts`). Verde: 432 unit+integración + 13 e2e,
  tsc/lint limpios.
- **Frontend DIFERIDO**: ninguna pantalla, ruta, hook ni componente. Tampoco UI para editar
  `actividadFlujo` (ni `CreateCuentaDto` ni `UpdateCuentaDto` lo exponen aún) — follow-up
  explícito.

## Notas regulatorias

- La NC N°11 obliga a presentar el flujo de efectivo; el método se rige supletoriamente
  por la **NIC 7** (Resolución CTNAC 01/2012). Bolivia no tiene norma nacional propia.
- NIC 7 define 3 actividades: operación, inversión, financiación.
- El método indirecto es el de facto en Bolivia (Formulario 605 del SIN).
- Los montos se expresan en BOB (moneda funcional, §4.5 CLAUDE.md).
- Las fechas son `FechaContable` (calendario puro, §4.6 CLAUDE.md).
- Comentarios regulatorios obligatorios en el código contable: referenciar `NIC 7` (y
  `NC N°11` donde aplique), formato `// <norma> <ref>: <descripción>`.
