# Design — Hoja de Trabajo de 12 columnas (`hoja-trabajo-doce-columnas`)

> Quinto reporte de `backend/src/reportes/`. Backend-only, read-only, sin migración,
> sin permiso RBAC nuevo (hereda `contabilidad.eeff.read`). Reusa el módulo, el port
> y la mecánica universal de saldos del Balance de Comprobación.
>
> Este documento bloquea las decisiones técnicas. NO contiene código de producción.

---

## Resumen de decisiones bloqueadas (TL;DR)

| # | Decisión | Veredicto |
|---|----------|-----------|
| D-01 | Nuevo tipo de retorno del port | `SaldoCuentaSeparadoRow` (4 agregados `Decimal`: ordinario D/H + ajuste D/H) |
| D-02 | Método nuevo del port | `obtenerSaldosEnRangoSeparandoAjustes(tenantId, desde, hasta, incluirAnulados)` |
| D-03 | Implementación del adapter | `$queryRaw` con `SUM(...) FILTER (WHERE ...)` por bucket; helper SQL compartido del WHERE base con `obtenerSaldosEnRango` |
| D-04 | Forma del builder | `construirHojaTrabajo(params)` puro → `HojaTrabajoResult` (12 columnas Money + fila carry-over + cuadres + naturaleza-opuesta) |
| D-05 | Regla `esContraria` en lista plana | El saldo ajustado entra a su columna BG con **signo invertido** (negativo) si `esContraria=true`. NO se mueve de columna. |
| D-06 | Namespace de errores | **NUEVO** `REPORTES_HOJA_TRABAJO_*` (archivo propio, sin reusar) |
| D-07 | DTO / mapper / controller / módulo | Clon de balance-comprobacion; DI reusa `EEFF_SALDOS_READER_PORT` (cero providers nuevos) |
| D-08 | Plan de tests (Strict TDD) | red-first: unit builder (cada columna + carry-over + cuadres + contra + solo-ajuste + vacío), integration adapter (split + reconciliación), e2e endpoint |

Los tres que pidió el orquestador explícitamente:
- **Nuevo tipo de retorno**: `SaldoCuentaSeparadoRow { cuentaId; debitoOrdinarioBob; creditoOrdinarioBob; debitoAjusteBob; creditoAjusteBob }` (todos `Decimal`).
- **Regla `esContraria` en lista plana (D-05)**: la cuenta contraria NO cambia de columna BG; su `saldoAjustado` se coloca en la columna que le toca por clase, pero **con signo negado**, de modo que al totalizar la columna RESTA — espejo exacto de la propagación de árbol de `balance-arbol.ts` (donde `esContraria` hace `.minus()`), pero aplanado a una fila. Ejemplo abajo (§4.5).
- **Namespace de errores (D-06)**: NUEVO `REPORTES_HOJA_TRABAJO_*`. No se reusan los de balance-comprobacion. Justificación en §5.

---

## 1. Contexto y mecánica del reporte

La Hoja de Trabajo presenta, por cada cuenta `esDetalle=true` con movimiento en el rango,
**6 pares de columnas (12 columnas)**:

| Par | Columna izq | Columna der | Origen |
|-----|-------------|-------------|--------|
| 1. Sumas | `sumasDebe` | `sumasHaber` | Σ D / Σ H de comprobantes **ordinarios** |
| 2. Saldos | `saldoDeudor` | `saldoAcreedor` | `MAX(sumasDebe−sumasHaber,0)` / simétrico |
| 3. Ajustes | `ajustesDebe` | `ajustesHaber` | Σ D / Σ H de comprobantes **AJUSTE** |
| 4. Saldos Ajustados | `saldoAjustadoDeudor` | `saldoAjustadoAcreedor` | `MAX((sumasDebe+ajustesDebe)−(sumasHaber+ajustesHaber),0)` / simétrico |
| 5. Estado de Resultados | `perdidas` | `ganancias` | Por clase (EGRESO→pérdidas, INGRESO→ganancias) |
| 6. Balance General | `activo` | `pasivoPatrimonio` | Por clase (ACTIVO→activo, PASIVO/PATRIMONIO→pasPat) |

Más una **fila sintética de carry-over** (utilidad/pérdida del ejercicio) que hace cuadrar
los pares 5 y 6. Más los **totales** de las 12 columnas, **señales de cuadre** (±Bs 0.01) y
la señal de calidad `cuentasNaturalezaOpuesta` reusada del Balance de Comprobación.

**Mecánica universal (NO por naturaleza)** para Saldos y Saldos Ajustados — idéntica al
Balance de Comprobación: a lo sumo uno de los dos lados es > 0 (vía `MAX(diff,0)`).

**Control cruzado clave**: los Saldos Ajustados de la Hoja DEBEN igualar los Saldos del
Balance de Comprobación del mismo rango — porque BC agrega TODO (incluido AJUSTE) y la
única diferencia es que la Hoja separa AJUSTE en su columna y **excluye CIERRE de ambos
buckets**. El e2e verifica esto contra el endpoint real de balance-comprobacion.

### Clasificación de tipos (LOCKED — del proposal)

`TipoComprobante` tiene 7 valores: `APERTURA, DIARIO, INGRESO, EGRESO, AJUSTE, TRASPASO, CIERRE`.

- **Ordinario** (pares 1–2): tipo `NOT IN ('AJUSTE','CIERRE')` → APERTURA, DIARIO, INGRESO, EGRESO, TRASPASO.
- **Ajuste** (par 3): tipo `= 'AJUSTE'`.
- **Excluido de TODO** (la hoja es pre-cierre): tipo `= 'CIERRE'`.

El bucket ordinario se define por **exclusión** (`NOT IN`) a propósito: un `TipoComprobante`
nuevo futuro cae por default en ordinario, no se pierde silenciosamente. CIERRE se excluye
de **ambos** buckets por el WHERE base.

---

## 2. Extensión del port (D-01, D-02)

### 2.1 Nuevo tipo de retorno

Se agrega a `ports/eeff-saldos-reader.port.ts`:

```ts
/**
 * Saldo de flujo de una cuenta HOJA en un rango [desde, hasta], con los
 * movimientos SEPARADOS en dos buckets por tipo de comprobante:
 *   - "ordinario" = tipo NOT IN ('AJUSTE','CIERRE')
 *   - "ajuste"    = tipo = 'AJUSTE'
 *
 * CIERRE queda EXCLUIDO de ambos buckets (la Hoja de Trabajo es pre-cierre).
 *
 * Reconstrucción: para el mismo rango/tenant/incluirAnulados,
 *   debitoOrdinarioBob + debitoAjusteBob  == SaldoCuentaRow.totalDebitoBob de obtenerSaldosEnRango  (salvo CIERRE)
 *   creditoOrdinarioBob + creditoAjusteBob == SaldoCuentaRow.totalCreditoBob (salvo CIERRE)
 * El test de integración prueba esta reconciliación en datos SIN comprobantes CIERRE.
 */
export interface SaldoCuentaSeparadoRow {
  cuentaId: string;
  /** COALESCE(SUM(lc.debitoBob) FILTER (tipo ordinario), 0) → Decimal en adapter. */
  debitoOrdinarioBob: Decimal;
  /** COALESCE(SUM(lc.creditoBob) FILTER (tipo ordinario), 0). */
  creditoOrdinarioBob: Decimal;
  /** COALESCE(SUM(lc.debitoBob) FILTER (tipo = 'AJUSTE'), 0). */
  debitoAjusteBob: Decimal;
  /** COALESCE(SUM(lc.creditoBob) FILTER (tipo = 'AJUSTE'), 0). */
  creditoAjusteBob: Decimal;
}
```

### 2.2 Nuevo método abstracto (firma + JSDoc bloqueado)

```ts
/**
 * Suma de débitos/créditos por cuenta (GROUP BY cuentaId) acotada a un rango
 * [desde, hasta] (ambos inclusive), SEPARANDO movimientos ordinarios de ajustes.
 *
 * Usado SOLO por la Hoja de Trabajo de 12 columnas. Misma fuente de verdad,
 * mismos estados (CONTABILIZADO/BLOQUEADO, BORRADOR nunca — §4.1) y mismo
 * predicado organizationId-primero (§4.2 Anti-31) que `obtenerSaldosEnRango`;
 * comparten el WHERE base vía helper privado para no driftear (cicatriz de drift).
 *
 * Buckets: ordinario = tipo NOT IN ('AJUSTE','CIERRE'); ajuste = tipo = 'AJUSTE'.
 * CIERRE excluido de ambos (la Hoja es pre-cierre).
 *
 * Una cuenta con SOLO movimiento de ajuste (ordinario en 0, ajuste > 0) SÍ debe
 * aparecer en el resultado. Cuenta sin ningún movimiento puede no aparecer.
 * // organizationId SIEMPRE primer predicado (§4.2 Anti-31)
 */
abstract obtenerSaldosEnRangoSeparandoAjustes(
  tenantId: string,
  desde: Date,
  hasta: Date,
  incluirAnulados: boolean,
): Promise<SaldoCuentaSeparadoRow[]>;
```

**Las 3 firmas existentes del port NO cambian** — el port solo gana un método. Cero impacto
de regresión sobre Balance General / Estado de Resultados / Balance de Comprobación.

---

## 3. Implementación del adapter + anti-drift (D-03)

### 3.1 Estrategia: `$queryRaw` con `FILTER (WHERE ...)`

Elegido `SUM(...) FILTER (WHERE c.tipo = 'AJUSTE')` + `SUM(...) FILTER (WHERE c.tipo NOT IN
('AJUSTE','CIERRE'))` sobre Prisma `groupBy`. Razones:

1. **Consistencia con el patrón vivo**: `obtenerSaldosHasta` y `obtenerSaldosEnRango` ya usan
   `$queryRaw` porque Prisma `groupBy` no filtra por relaciones (el JOIN a `comprobantes` para
   filtrar por `c.fechaContable`/`c.estado`/`c.tipo`). Mantener el mismo motor.
2. **Una sola pasada**: `FILTER` produce los 4 agregados en un único `GROUP BY cuentaId`. El
   fold-en-adapter por (cuentaId, tipo) requeriría agregar en TS y es más propenso a error.
3. CIERRE queda fuera de ambos buckets sin escribirlo: el WHERE base agrega
   `AND c.tipo <> 'CIERRE'`, y dentro de los `SUM FILTER` el bucket ordinario usa
   `NOT IN ('AJUSTE','CIERRE')` (redundante con el WHERE base pero explícito y a prueba de
   futuros tipos).

```sql
SELECT
  lc."cuentaId" AS "cuentaId",
  COALESCE(SUM(lc."debitoBob")  FILTER (WHERE c.tipo NOT IN ('AJUSTE','CIERRE')), 0) AS "debitoOrdinarioBob",
  COALESCE(SUM(lc."creditoBob") FILTER (WHERE c.tipo NOT IN ('AJUSTE','CIERRE')), 0) AS "creditoOrdinarioBob",
  COALESCE(SUM(lc."debitoBob")  FILTER (WHERE c.tipo = 'AJUSTE'), 0) AS "debitoAjusteBob",
  COALESCE(SUM(lc."creditoBob") FILTER (WHERE c.tipo = 'AJUSTE'), 0) AS "creditoAjusteBob"
FROM lineas_comprobante lc
JOIN comprobantes c ON c.id = lc."comprobanteId"
WHERE <WHERE BASE COMPARTIDO>
GROUP BY lc."cuentaId"
HAVING
  COALESCE(SUM(lc."debitoBob")  FILTER (WHERE c.tipo NOT IN ('AJUSTE','CIERRE')), 0) <> 0
  OR COALESCE(SUM(lc."creditoBob") FILTER (WHERE c.tipo NOT IN ('AJUSTE','CIERRE')), 0) <> 0
  OR COALESCE(SUM(lc."debitoBob")  FILTER (WHERE c.tipo = 'AJUSTE'), 0) <> 0
  OR COALESCE(SUM(lc."creditoBob") FILTER (WHERE c.tipo = 'AJUSTE'), 0) <> 0
```

> El `HAVING` es opcional — el builder ya descarta cuentas con los 4 agregados en cero
> (defensivo, igual que balance-comprobacion). Se documenta como permitido pero el builder
> NO asume que el port lo aplica. (Para no añadir riesgo, la tarea puede omitir el HAVING;
> la decisión queda en manos del apply, ambas son correctas.)

### 3.2 Anti-drift del WHERE base — helper compartido

El riesgo (open question del proposal) es que el filtro base de
`obtenerSaldosEnRangoSeparandoAjustes` diverja del de `obtenerSaldosEnRango`. Mitigación:

**Extraer un helper privado que construya el fragmento `Prisma.Sql` del WHERE base** y usarlo
en AMBOS métodos. El WHERE base contiene exactamente:

```
lc."organizationId" = ${tenantId}            -- §4.2 Anti-31, PRIMER predicado SIEMPRE
AND c.estado IN ('CONTABILIZADO','BLOQUEADO') -- §4.1, BORRADOR nunca, no parametrizable
AND c."fechaContable" >= ${desde}
AND c."fechaContable" <= ${hasta}
[ AND c.anulado = false ]                     -- solo si NO incluirAnulados (§4.7)
```

Implementación con `Prisma.sql` / `Prisma.join` (tagged-template composable):

```ts
import { Prisma } from '@prisma/client';

private whereBaseRango(tenantId: string, desde: Date, hasta: Date, incluirAnulados: boolean): Prisma.Sql {
  // §4.2 Anti-31: organizationId PRIMER predicado, no confiamos en el caller.
  // §4.1: estado FIJO CONTABILIZADO/BLOQUEADO, BORRADOR nunca.
  const anulado = incluirAnulados ? Prisma.empty : Prisma.sql`AND c.anulado = false`;
  return Prisma.sql`
    lc."organizationId" = ${tenantId}
    AND c.estado IN ('CONTABILIZADO','BLOQUEADO')
    AND c."fechaContable" >= ${desde}
    AND c."fechaContable" <= ${hasta}
    ${anulado}
  `;
}
```

> **Refactor incluido en el alcance**: `obtenerSaldosEnRango` se reescribe para consumir
> `whereBaseRango(...)` en lugar de su SQL ramificado actual (2 branches `incluirAnulados`).
> Esto elimina la cicatriz de drift en su origen: si mañana el filtro base cambia, cambia en
> un solo lugar y ambas lecturas lo heredan. La regresión de Balance de Comprobación /
> Balance General (que usan `obtenerSaldosEnRango`) debe seguir verde tras el refactor —
> es la red de seguridad del refactor.
>
> Nota: `obtenerSaldosHasta` usa `fechaContable <= fechaCorte` (corte, no rango) — NO comparte
> este helper; su WHERE es estructuralmente distinto. No se toca.

`Prisma.Sql` se interpola dentro del `$queryRaw` tagged template con `${this.whereBaseRango(...)}`,
preservando la parametrización (no hay string-concat → no hay SQL injection).

### 3.3 Mapeo de salida (string Postgres → Decimal)

`$queryRaw` devuelve `numeric` como `string`; el adapter mapea cada agregado con
`new Decimal(row.<campo>)`, idéntico al patrón existente de `obtenerSaldosEnRango`.

### 3.4 Test de integración de reconciliación (prueba el anti-drift)

`*.integration.spec.ts` contra Postgres real (Testcontainers / `DATABASE_URL`):

- Sembrar un tenant con cuentas y comprobantes de **varios tipos** (DIARIO, INGRESO, EGRESO,
  AJUSTE, TRASPASO) en un rango, **sin comprobantes CIERRE**.
- Llamar `obtenerSaldosEnRango` y `obtenerSaldosEnRangoSeparandoAjustes` con el mismo rango.
- Aserción de reconciliación por cuenta:
  `debitoOrdinarioBob + debitoAjusteBob === totalDebitoBob` y simétrico para crédito.
  (Válida porque sin CIERRE el WHERE base es idéntico → la partición ordinario∪ajuste = total.)
- Caso CIERRE: agregar un comprobante CIERRE en el rango y verificar que `obtenerSaldosEnRango`
  **lo incluye** (su WHERE no excluye CIERRE) mientras
  `obtenerSaldosEnRangoSeparandoAjustes` **lo excluye de ambos buckets** → la reconciliación
  ahora difiere exactamente por el monto del CIERRE. Esto documenta la única diferencia.
- Caso solo-ajuste: cuenta con únicamente movimiento AJUSTE → aparece con ordinario en 0.
- Caso `incluirAnulados` toggle: comprobante anulado contado solo cuando el flag es true.
- Caso Anti-31: dos tenants, verificar que el resultado de uno no incluye filas del otro.

---

## 4. Builder de dominio (D-04, D-05)

Archivo nuevo `domain/hoja-trabajo.ts` — función pura, cero NestJS/Prisma (`import type` ok),
cobertura objetivo 100% (§7.5). Reusa `Money`, `NaturalezaCuenta`, `ClaseCuenta`.

### 4.1 Entrada

```ts
export interface ConstruirHojaTrabajoParams {
  estructura: CuentaEstructuraRow[];          // obtenerEstructuraCuentas
  saldosSeparados: SaldoCuentaSeparadoRow[];   // obtenerSaldosEnRangoSeparandoAjustes
}
```

### 4.2 Tipos de salida (internos, con Money — en el response DTO)

```ts
export interface LineaHojaTrabajoCalculada {
  cuentaId: string | null;        // null en la fila sintética de carry-over
  codigoInterno: string | null;   // null en la fila sintética
  nombre: string;
  naturaleza: NaturalezaCuenta;   // de la cuenta; en carry-over: ACREEDORA (patrimonio)
  claseCuenta: ClaseCuenta;       // routing ER/BG; en carry-over no aplica (ver §4.6)
  esContraria: boolean;
  esSintetica: boolean;           // true SOLO en la fila de carry-over

  // Par 1
  sumasDebe: Money;
  sumasHaber: Money;
  // Par 2
  saldoDeudor: Money;
  saldoAcreedor: Money;
  // Par 3
  ajustesDebe: Money;
  ajustesHaber: Money;
  // Par 4
  saldoAjustadoDeudor: Money;
  saldoAjustadoAcreedor: Money;
  // Par 5 (Estado de Resultados)
  perdidas: Money;
  ganancias: Money;
  // Par 6 (Balance General)
  activo: Money;
  pasivoPatrimonio: Money;
}

export interface HojaTrabajoResult {
  lineas: LineaHojaTrabajoCalculada[];     // cuentas de detalle + fila carry-over al final
  totales: TotalesHojaTrabajoCalculada;    // las 12 columnas sumadas
  cuadres: CuadresHojaTrabajo;             // ver §4.7
  cuentasNaturalezaOpuesta: CuentaNaturalezaOpuestaCalculada[]; // reusa el tipo de balance-comprobacion
}

export interface TotalesHojaTrabajoCalculada {
  sumasDebe: Money; sumasHaber: Money;
  saldoDeudor: Money; saldoAcreedor: Money;
  ajustesDebe: Money; ajustesHaber: Money;
  saldoAjustadoDeudor: Money; saldoAjustadoAcreedor: Money;
  perdidas: Money; ganancias: Money;
  activo: Money; pasivoPatrimonio: Money;
}

export interface CuadresHojaTrabajo {
  cuadra: boolean;                       // AND de los 6 cuadres
  cuadraSumas: boolean;                  // ΣsumasDebe ≈ ΣsumasHaber
  cuadraSaldos: boolean;                 // ΣsaldoDeudor ≈ ΣsaldoAcreedor
  cuadraAjustes: boolean;                // ΣajustesDebe ≈ ΣajustesHaber
  cuadraSaldosAjustados: boolean;        // ΣsaldoAjustadoDeudor ≈ ΣsaldoAjustadoAcreedor
  cuadraEstadoResultados: boolean;       // Σperdidas ≈ Σganancias (post carry-over)
  cuadraBalanceGeneral: boolean;         // Σactivo ≈ ΣpasivoPatrimonio (post carry-over)
  // diferencias por par (para diagnóstico; pueden ser negativas)
  diferenciaSumas: Money;
  diferenciaSaldos: Money;
  diferenciaAjustes: Money;
  diferenciaSaldosAjustados: Money;
  diferenciaEstadoResultados: Money;
  diferenciaBalanceGeneral: Money;
}
```

`CuentaNaturalezaOpuestaCalculada` se **reusa** importándolo de
`balance-comprobacion-response.dto.ts` (mismo concepto, mismos campos). No se duplica el tipo.

### 4.3 Algoritmo del builder (paso a paso)

1. Índice de cuentas de detalle por id (`esDetalle=true`), igual que balance-comprobacion.
2. Para cada `SaldoCuentaSeparadoRow`:
   - Buscar la cuenta de detalle; si no existe (cuenta desactivada/agrupadora), **ignorar**.
   - `sumasDebe = Money.of(debitoOrdinarioBob)`, `sumasHaber = Money.of(creditoOrdinarioBob)`,
     `ajustesDebe = Money.of(debitoAjusteBob)`, `ajustesHaber = Money.of(creditoAjusteBob)`.
   - **Descartar** si los 4 agregados son cero (defensivo).
   - **Par 2 (Saldos)**: mecánica universal `MAX(diff,0)`:
     - `dDeudor = sumasDebe.minus(sumasHaber)`; `saldoDeudor = dDeudor.isPositive() ? dDeudor : Money.ZERO`.
     - `dAcreedor = sumasHaber.minus(sumasDebe)`; `saldoAcreedor = dAcreedor.isPositive() ? dAcreedor : Money.ZERO`.
   - **Par 4 (Saldos Ajustados)**: misma mecánica sobre sumas+ajustes:
     - `totDebe = sumasDebe.plus(ajustesDebe)`; `totHaber = sumasHaber.plus(ajustesHaber)`.
     - `dAjDeudor = totDebe.minus(totHaber)`; `saldoAjustadoDeudor = dAjDeudor.isPositive() ? dAjDeudor : Money.ZERO`.
     - `saldoAjustadoAcreedor` simétrico.
   - **Par 5 + Par 6 (routing por clase, con `esContraria` — §4.5)**: ver tabla §4.4.
   - Push la línea.
3. Ordenar `lineas` por `codigoInterno` ASC (`localeCompare`), igual que balance-comprobacion.
   La fila sintética de carry-over se agrega DESPUÉS del sort, al final (no tiene codigoInterno).
4. Acumular totales de las 12 columnas **antes** del carry-over.
5. Calcular y agregar la **fila carry-over** (§4.6); re-sumar a totales solo las columnas
   que el carry-over toca (perdidas/ganancias + activo/pasivoPatrimonio).
6. Calcular `cuadres` (§4.7) sobre los totales finales.
7. Calcular `cuentasNaturalezaOpuesta` sobre los **Saldos Ajustados** (el saldo de cierre real
   de la cuenta): DEUDORA con `saldoAjustadoAcreedor > 0`, o ACREEDORA con `saldoAjustadoDeudor > 0`.

### 4.4 Routing ER/BG por clase (Par 5 y Par 6)

La cuenta aporta a UNA sección (ER o BG) según su `claseCuenta`, usando su **Saldo Ajustado**:

| `claseCuenta` | Aporta a | Columna | Valor base (antes de esContraria) |
|---------------|----------|---------|-----------------------------------|
| `EGRESO` | Estado Resultados | `perdidas` | `saldoAjustadoDeudor` |
| `INGRESO` | Estado Resultados | `ganancias` | `saldoAjustadoAcreedor` |
| `ACTIVO` | Balance General | `activo` | `saldoAjustadoDeudor` |
| `PASIVO` | Balance General | `pasivoPatrimonio` | `saldoAjustadoAcreedor` |
| `PATRIMONIO` | Balance General | `pasivoPatrimonio` | `saldoAjustadoAcreedor` |

Las otras 4 columnas de esa cuenta en los pares 5/6 quedan en `Money.ZERO`. Es decir: una
cuenta ACTIVO tiene `perdidas=ganancias=pasivoPatrimonio=0` y solo `activo` poblado.

> **Por qué el lado fijo por clase** (deudor para ACTIVO/EGRESO, acreedor para
> INGRESO/PASIVO/PATRIMONIO): es el lado "esperado" por la naturaleza de la clase. Si una
> cuenta ACTIVO terminara con saldo ajustado ACREEDOR (anómalo), su `activo` quedaría 0 y la
> anomalía la captura `cuentasNaturalezaOpuesta` como señal de calidad. Esto coincide con la
> intención de `balance-arbol.ts`, que cuelga ACTIVO/EGRESO del lado deudor y el resto del
> acreedor. No se inventa una regla nueva.

### 4.5 Regla `esContraria` en lista plana (D-05) — BLOQUEADA

`balance-arbol.ts` maneja contrarias propagando hacia el agrupador con `.minus()`
(línea ~132 y ~291): la contraria **resta** del total de su grupo. En la Hoja de Trabajo NO
hay árbol; la lista es plana y los totales de columna son sumas directas. Para reproducir el
mismo efecto:

> **REGLA D-05**: si `cuenta.esContraria === true`, su aporte a la columna BG/ER se coloca
> **negado** (`valorBase.mul(-1)`, es decir un `Money` negativo) en la MISMA columna que le
> toca por clase (§4.4). NO se mueve a la columna opuesta. Al totalizar la columna por suma
> directa, ese valor negativo RESTA — exactamente como el `.minus()` del árbol.

**Ejemplo — Depreciación Acumulada de Activo Fijo** (`claseCuenta = ACTIVO`,
`naturaleza = ACREEDORA`, `esContraria = true`):

- Saldos ajustados de la cuenta: `saldoAjustadoAcreedor = 5000`, `saldoAjustadoDeudor = 0`.
- Routing por clase (§4.4): ACTIVO → columna `activo`, valor base = `saldoAjustadoDeudor = 0`.
  Pero es contraria y de naturaleza acreedora; la depreciación DEBE reducir el activo.
- **Aplicación de D-05 corregida para contrarias**: cuando `esContraria`, el valor que va a la
  columna es el saldo ajustado del lado de su **naturaleza real** (acreedor aquí = 5000),
  **negado** y colocado en la columna de su **clase** (`activo`): `activo = -5000`.
- Resultado de fila: `activo = -5000`, `pasivoPatrimonio = 0`. Al sumar la columna `activo`
  del total, la depreciación resta 5000 del Activo bruto — espejo del árbol.

**Regla precisa para contrarias** (refina §4.4): para una cuenta `esContraria`:
- el monto contraria = saldo ajustado del lado de su naturaleza
  (`naturaleza === ACREEDORA ? saldoAjustadoAcreedor : saldoAjustadoDeudor`);
- se coloca como `monto.mul(-1)` en la columna de su `claseCuenta` (activo / pasivoPatrimonio
  para BG; perdidas / ganancias para ER si llegara a haber una contra-cuenta de resultado, ej.
  "Devoluciones sobre ventas" contraria de INGRESO → `ganancias` negado).

Para cuentas NO contrarias se aplica §4.4 tal cual (lado fijo por clase, signo positivo).

> Helper sugerido `clasificarParaSecciones(cuenta, saldoAjDeudor, saldoAjAcreedor)` que
> devuelve `{ perdidas, ganancias, activo, pasivoPatrimonio }`. Centraliza §4.4 + §4.5 en un
> solo lugar testeable, espejo de `calcularSaldoNeto` + el manejo de `esContraria` del árbol.

### 4.6 Fila sintética de carry-over (utilidad/pérdida del ejercicio)

`utilidadEjercicio = Σganancias − Σperdidas` (sobre las columnas ER ya acumuladas, **post**
esContraria — coincide con `calcularResultadoEjercicio` del árbol que hace
`ΣINGRESO − ΣEGRESO` vía saldo neto firmado).

Se agrega UNA fila al final con `esSintetica=true`, `cuentaId=null`, `codigoInterno=null`,
`nombre='Resultado del Ejercicio (en curso)'` (mismo texto que balance-arbol), todas las
columnas de los pares 1–4 en `Money.ZERO`, y:

- Si `utilidadEjercicio > 0` (**utilidad**):
  - `perdidas = utilidadEjercicio` (iguala Σperdidas a Σganancias → cuadra ER).
  - `pasivoPatrimonio = utilidadEjercicio` (el resultado es patrimonio → cuadra BG).
  - `ganancias = 0`, `activo = 0`.
- Si `utilidadEjercicio < 0` (**pérdida**, valor negativo):
  - `ganancias = utilidadEjercicio.abs()` (iguala Σganancias a Σperdidas).
  - `activo = utilidadEjercicio.abs()` (la pérdida reduce patrimonio; se balancea por el lado
    del activo en la presentación de hoja de trabajo).
  - `perdidas = 0`, `pasivoPatrimonio = 0`.
- Si `utilidadEjercicio == 0`: la fila puede omitirse (igual que balance-arbol omite la
  subsección si el resultado es cero) o agregarse en cero. **Decisión**: omitir la fila si es
  exactamente cero, para no ensuciar la salida (consistente con balance-arbol). Documentar en
  spec/tests que la ausencia de fila ⇒ resultado 0.

Tras el carry-over, los totales de ER y BG se recalculan sumando la fila → cuadran.

> **Nota sobre el lado del carry-over de pérdida**: el proposal lo fija como "se suma a
> Ganancias y a Activo" — D-06 LOCKED. Es la convención de hoja de trabajo de 12 columnas
> boliviana: el par que NO cuadra se completa del lado contrario para igualar. La utilidad va
> a Pérdidas+PasPat; la pérdida va a Ganancias+Activo. Tests cubren ambos signos.

### 4.7 Señales de cuadre (±Bs 0.01 vía `Money.balanceadoEnBobCon`)

Sobre los totales finales (post carry-over):

```
cuadraSumas            = totSumasDebe.balanceadoEnBobCon(totSumasHaber)
cuadraSaldos           = totSaldoDeudor.balanceadoEnBobCon(totSaldoAcreedor)
cuadraAjustes          = totAjustesDebe.balanceadoEnBobCon(totAjustesHaber)
cuadraSaldosAjustados  = totSaldoAjDeudor.balanceadoEnBobCon(totSaldoAjAcreedor)
cuadraEstadoResultados = totPerdidas.balanceadoEnBobCon(totGanancias)
cuadraBalanceGeneral   = totActivo.balanceadoEnBobCon(totPasivoPatrimonio)
cuadra                 = AND de los 6
```

Las `diferencia*` son `totIzq.minus(totDer)` por par (pueden ser negativas), igual que
balance-comprobacion. NO reimplementar la tolerancia — siempre `balanceadoEnBobCon`.

---

## 5. Namespace de errores (D-06) — NUEVO

**Decisión: crear `domain/hoja-trabajo-errors.ts` con prefijo `REPORTES_HOJA_TRABAJO_*`.**
NO se reusan los `REPORTES_BALANCE_COMPROBACION_*`.

Códigos (4, espejo de balance-comprobacion, todos `extends InvalidStateError` → HTTP 422):

| Clase | `code` |
|-------|--------|
| `RangoRequeridoError` | `REPORTES_HOJA_TRABAJO_RANGO_REQUERIDO` |
| `RangoAmbiguoError` | `REPORTES_HOJA_TRABAJO_RANGO_AMBIGUO` |
| `RangoInvalidoError` | `REPORTES_HOJA_TRABAJO_RANGO_INVALIDO` |
| `PeriodoNoEncontradoError` | `REPORTES_HOJA_TRABAJO_PERIODO_NO_ENCONTRADO` |

**Justificación (estabilidad de contrato §6.3)**: los `code` son IDs públicos estables. Si la
Hoja de Trabajo emitiera `REPORTES_BALANCE_COMPROBACION_RANGO_REQUERIDO`, un cliente que mapee
ese código no podría distinguir de qué endpoint vino, y un cambio futuro en la semántica del
rango de uno arrastraría al otro. Cada reporte es un recurso con su propio contrato de errores.
El costo es ~40 líneas de clases gemelas — barato frente a acoplar dos contratos públicos. Es
el mismo patrón que ya siguió Estado de Resultados vs Balance de Comprobación (cada uno tiene
su `RangoInvalidoError` con su propio prefijo, según comenta `balance-comprobacion-errors.ts`).

La lógica de validación (XOR, rango coherente, período existe) en el service es **idéntica** a
balance-comprobacion; solo cambian las clases de error importadas.

---

## 6. DTO, mapper, service, controller, módulo, OpenAPI (D-07)

### 6.1 Query DTO — `dto/hoja-trabajo-query.dto.ts`

Clon exacto de `BalanceComprobacionQueryDto`: `desde?`/`hasta?` (`@Matches YYYY-MM-DD`),
`periodoFiscalId?` (`@IsUUID('4')`), `incluirAnulados?` (`@Transform` bool + `@IsBoolean`).
Validación de FORMA en el DTO; regla de negocio (XOR, coherencia) en el service (§10.10).

### 6.2 Response DTO + mapper — `dto/hoja-trabajo-response.dto.ts`

- Tipos internos `*Calculada` (Money) ya definidos en §4.2 — viven aquí (igual que
  balance-comprobacion mantiene sus `*Calculada` en su response DTO).
- Clases `@ApiProperty` con strings: `LineaHojaTrabajoDto` (12 columnas string + cuentaId
  nullable + codigoInterno nullable + naturaleza string + claseCuenta string + esContraria
  bool + esSintetica bool), `TotalesHojaTrabajoDto` (12 strings), `CuadresHojaTrabajoDto`
  (6 bools + `cuadra` bool + 6 diferencias string), `CuentaNaturalezaOpuestaDto`
  (**reusar** el de balance-comprobacion-response.dto, re-exportando o importando),
  `HojaTrabajoResponseDto` (`fechaDesde`, `fechaHasta`, `lineas[]`, `totales`, `cuadres`,
  `cuentasNaturalezaOpuesta[]`).
- Campos nullable (`cuentaId`, `codigoInterno`): usar `@ApiProperty({ nullable: true, type: String })`
  para que OpenAPI los emita como `string | null` y el contract-drift no rompa (cicatriz
  conocida §10.10: nullable sin `type:` → `Record<string,never>`).
- Money → string con `.toBob()` (2 decimales, §4.5). Date → `formatFechaContable` (`YYYY-MM-DD`, §4.6).
- `toHojaTrabajoResponse(result, { desde, hasta })`, espejo de `toBalanceComprobacionResponse`.

### 6.3 Service — `hoja-trabajo.service.ts`

Espejo casi exacto de `balance-comprobacion.service.ts`:
- Inyecta SOLO `EeffSaldosReaderPort` + `PeriodosReaderPort` (cero adapters concretos).
- Pasos 1–2 (XOR + resolución de rango) idénticos, pero importando los errores
  `REPORTES_HOJA_TRABAJO_*`.
- Paso 3: `Promise.all([ obtenerSaldosEnRangoSeparandoAjustes(...), obtenerEstructuraCuentas(...) ])`.
  **NUNCA** `obtenerSaldosHasta` ni `obtenerSaldosEnRango` (la Hoja necesita el split).
- Paso 4: `construirHojaTrabajo({ estructura, saldosSeparados })`.
- Paso 5: `toHojaTrabajoResponse(result, { desde, hasta })`.
- Solo lanza `DomainError` (§6.2). Strict / `noUncheckedIndexedAccess` /
  `exactOptionalPropertyTypes` (spread condicional). Cero `any`.

### 6.4 Controller — endpoint en `eeff.controller.ts`

Nuevo `@Get('hoja-trabajo')` en `EeffController` (ya tiene `@RequireModule('contabilidad')` a
nivel de clase + `AuthGuard('jwt')`, `ModuleEnabledGuard`, `PermissionsGuard`):

```ts
@Get('hoja-trabajo')
@RequirePermissions('contabilidad.eeff.read')
@ApiOperation({ summary: 'Hoja de Trabajo de 12 columnas (pre-cierre)... REQ-HT-01..NN.' })
@ApiOkResponse({ type: HojaTrabajoResponseDto })
obtenerHojaTrabajo(@Req() req: AuthenticatedRequest, @Query() query: HojaTrabajoQueryDto) {
  const tenantId = resolveTenantId(req);
  return this.hojaTrabajoService.consultarHojaTrabajo(tenantId, {
    ...(query.desde !== undefined ? { desde: query.desde } : {}),
    ...(query.hasta !== undefined ? { hasta: query.hasta } : {}),
    ...(query.periodoFiscalId !== undefined ? { periodoFiscalId: query.periodoFiscalId } : {}),
    incluirAnulados: query.incluirAnulados ?? false,
  });
}
```

Inyectar `HojaTrabajoService` en el constructor del controller (4º service).

### 6.5 Módulo — `reportes.module.ts`

Agregar `HojaTrabajoService` al array `providers`. **NO se crea provider ni adapter nuevo**:
el método nuevo vive en el adapter `PrismaEeffSaldosReaderAdapter` ya registrado bajo
`EEFF_SALDOS_READER_PORT` (`useExisting`). Confirmado: cero providers nuevos.

### 6.6 OpenAPI

Tras tocar DTOs backend: regenerar `backend/openapi.json` (`pnpm openapi:dump`) +
`frontend/src/types/api.generated.ts` (`pnpm gen:api-types`) y commitear ambos, o el job CI
`contract-drift` rompe el build (§10.10). Tarea explícita en el checklist.

---

## 7. Plan de tests (Strict TDD — red-first) (D-08)

Orden de implementación: cada test se escribe ROJO antes del código que lo verde.

### 7.1 Unit del builder — `domain/hoja-trabajo.spec.ts` (100% cobertura)

`describe`/`it` en español (§7.6). Mocks triviales (objetos planos `CuentaEstructuraRow` +
`SaldoCuentaSeparadoRow`); NO Prisma, NO NestJS.

1. **Par 1 (Sumas)**: una cuenta DIARIO → `sumasDebe`/`sumasHaber` = agregados ordinarios.
2. **Par 2 (Saldos) mecánica universal**: cuenta con debe>haber → solo `saldoDeudor`;
   haber>debe → solo `saldoAcreedor`; ambos lados nunca > 0 a la vez.
3. **Par 3 (Ajustes)**: cuenta con movimiento AJUSTE → columnas `ajustesDebe`/`ajustesHaber`.
4. **Par 4 (Saldos Ajustados)**: `MAX((sumas+ajustes)diff, 0)`; verificar que el ajuste mueve
   el saldo (ej. sumas dan deudor 100, ajuste haber 30 → saldoAjustadoDeudor 70).
5. **Cuenta solo-ajuste**: ordinario en 0, ajuste > 0 → fila presente, `sumas*`=0,
   `saldoAjustado*`>0. (open question del proposal cubierta.)
6. **Routing ER**: cuenta EGRESO → `perdidas = saldoAjustadoDeudor`, resto ER/BG en 0;
   cuenta INGRESO → `ganancias = saldoAjustadoAcreedor`.
7. **Routing BG**: ACTIVO → `activo`; PASIVO → `pasivoPatrimonio`; PATRIMONIO → `pasivoPatrimonio`.
8. **Contra-cuenta de ACTIVO** (D-05): cuenta ACTIVO, naturaleza ACREEDORA, esContraria=true,
   saldoAjustadoAcreedor=5000 → `activo = -5000`; el total `activo` baja en 5000.
9. **Contra-cuenta de INGRESO** (D-05, ER): naturaleza DEUDORA, esContraria=true → `ganancias`
   negado.
10. **Carry-over utilidad**: Σganancias>Σperdidas → fila sintética con `perdidas` y
    `pasivoPatrimonio` = utilidad; post → ER y BG cuadran; `esSintetica=true`, `cuentaId=null`.
11. **Carry-over pérdida**: Σperdidas>Σganancias → fila con `ganancias` y `activo` = |pérdida|;
    cuadran.
12. **Carry-over cero**: resultado 0 → fila omitida; ER y BG ya cuadran sin ella.
13. **Cuadres**: caso balanceado → los 6 `cuadra*`=true y `cuadra`=true; caso desbalanceado
    artificial → `cuadra`=false y la `diferencia*` correcta (incluida negativa).
14. **Tolerancia ±0.01**: diferencia de 0.01 → cuadra true; de 0.02 → false
    (vía `balanceadoEnBobCon`).
15. **naturalezaOpuesta**: cuenta DEUDORA con saldoAjustadoAcreedor>0 → aparece en la señal;
    NO afecta totales.
16. **Cuenta sin cuenta de detalle en estructura** (saldo huérfano) → ignorada.
17. **Los 4 agregados en cero** → fila descartada.
18. **Vacío**: `saldosSeparados=[]` → `lineas=[]` (o solo nada), totales en 0, `cuadra=true`.
19. **Orden por codigoInterno ASC**; carry-over siempre al final.

### 7.2 Integración del adapter — `adapters/prisma-eeff-saldos-reader.adapter.integration.spec.ts`

(Extender el spec existente del adapter, o archivo dedicado; vs Postgres real, `DATABASE_URL`.)
`describe`/`it` español. Casos en §3.4:

1. **Split correcto**: tipos mixtos → ordinario vs ajuste separados bien.
2. **Reconciliación SIN CIERRE**: `ordinario+ajuste === obtenerSaldosEnRango.total` por cuenta.
3. **CIERRE excluido**: con un comprobante CIERRE en rango, el split lo excluye de ambos
   buckets y `obtenerSaldosEnRango` lo incluye → diferencia == monto CIERRE.
4. **Solo-ajuste**: cuenta con únicamente AJUSTE aparece con ordinario 0.
5. **Toggle anulados**: anulado contado solo si `incluirAnulados=true`.
6. **Anti-31**: dos tenants, sin fuga de filas entre ellos.
7. **Regresión**: `obtenerSaldosEnRango` (refactorizado con el helper compartido) sigue dando
   los mismos resultados que antes (los specs existentes del adapter deben seguir verdes).

### 7.3 E2E del endpoint — `test/eeff-hoja-trabajo.e2e-spec.ts`

Supertest + AppModule + Postgres (`--runInBand --forceExit`). `describe`/`it` español.

1. **Happy path modo rango**: 200, estructura de respuesta (12 columnas string, totales,
   cuadres, fila sintética cuando hay resultado).
2. **Happy path modo período**: 200 equivalente.
3. **XOR RANGO_AMBIGUO**: `desde`+`hasta`+`periodoFiscalId` → 422
   `REPORTES_HOJA_TRABAJO_RANGO_AMBIGUO`.
4. **XOR RANGO_REQUERIDO**: sin ningún modo → 422 `REPORTES_HOJA_TRABAJO_RANGO_REQUERIDO`.
5. **RANGO_INVALIDO**: `desde > hasta` o fecha imposible → 422.
6. **PERIODO_NO_ENCONTRADO**: UUID inexistente → 422.
7. **Gate de permiso**: usuario sin `contabilidad.eeff.read` → 403.
8. **Gate de módulo**: tenant sin módulo `contabilidad` → 403/404 (según `ModuleEnabledGuard`).
9. **Cross-check (el control fuerte)**: para el mismo tenant+rango, llamar
   `GET /api/eeff/hoja-trabajo` y `GET /api/eeff/balance-comprobacion`; verificar que
   `saldoAjustadoDeudor`/`saldoAjustadoAcreedor` por cuenta de la Hoja == `saldoDeudor`/
   `saldoAcreedor` del Balance de Comprobación **en datos sin CIERRE**. (Si hay CIERRE en el
   set, sembrar el cross-check sin CIERRE para que la igualdad sea exacta.)
10. **incluirAnulados toggle** end-to-end.

### 7.4 Regresión esperada

Balance General / Estado de Resultados / Balance de Comprobación sin cambios funcionales. El
único punto de riesgo es el refactor de `obtenerSaldosEnRango` para usar `whereBaseRango`;
sus specs de integración + los e2e de balance-comprobacion son la red. Deben seguir verdes.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Drift del WHERE base entre las dos lecturas del rango | Helper `whereBaseRango` compartido + test de reconciliación (§3.4). El refactor lo elimina en el origen. |
| `esContraria` mal aplicado en lista plana | Regla D-05 explícita con ejemplo numérico + 2 tests dedicados (ACTIVO y INGRESO contraria). Helper `clasificarParaSecciones` centraliza. |
| Lado del carry-over de pérdida (Ganancias+Activo) contraintuitivo | LOCKED del proposal; convención de hoja de 12 columnas; 2 tests (utilidad y pérdida). |
| CIERRE filtrándose a algún bucket | `c.tipo <> 'CIERRE'` en WHERE base + `NOT IN ('AJUSTE','CIERRE')` en el FILTER ordinario (doble candado) + test de integración CIERRE. |
| contract-drift por campos nullable (cuentaId/codigoInterno) | `@ApiProperty({ nullable: true, type: String })` explícito (cicatriz §10.10). |
| Refactor de `obtenerSaldosEnRango` rompe BG/BC | Regresión obligatoria verde antes de avanzar; el refactor es mecánico (mismo SQL, helper extraído). |

## 9. Confirmaciones de alcance

- **Sin migración Prisma, sin schema, sin permiso RBAC nuevo.** Confirmado.
- **Cero providers nuevos en el módulo** — el método nuevo cuelga del adapter existente.
- **Las 3 firmas existentes del port no cambian.**
- **Frontend (vista + export Excel) fuera de scope** — change futuro separado.
- **Opción B (ajustes propuestos) y CIERRE incluido: descartados.**
