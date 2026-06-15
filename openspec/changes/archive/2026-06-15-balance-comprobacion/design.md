# Design — balance-comprobacion

## Contexto

El Balance de Comprobación de Sumas y Saldos es un reporte de control. Para cada
cuenta de **detalle** con movimiento en `[desde, hasta]` muestra 4 columnas y
verifica dos invariantes de cuadre. Se construye sobre la infraestructura del
módulo `reportes` ya existente (la misma que alimenta Balance General y Estado
de Resultados), sin migración ni cambios al port de lectura.

## Decisiones cerradas por el orquestador (documentadas, NO reabiertas)

| # | Decisión | Justificación |
|---|----------|---------------|
| D-1 | Reusar `EeffSaldosReaderPort.obtenerSaldosEnRango` + `obtenerEstructuraCuentas`. CERO cambios al port, CERO adapter, CERO migración. | El port ya devuelve `totalDebitoBob`/`totalCreditoBob` por cuenta en un rango, filtrando estados CONTABILIZADO/BLOQUEADO y `tenantId`. Es exactamente la entrada que el Balance de Comprobación necesita. |
| D-2 | Modelo de 4 columnas por rango; `saldoDeudor=MAX(sumasDebito−sumasCredito,0)`, `saldoAcreedor=MAX(sumasCredito−sumasDebito,0)`. | Validado contra el repo de referencia avicont-ia (engram #794). Mecánica universal del Balance de Comprobación de Sumas y Saldos. |
| D-3 | Flujo puro del rango, SIN saldo inicial de gestiones previas. | Avicont no tiene mecanismo de apertura/saldo inicial. Mismo concepto que el Estado de Resultados (`obtenerSaldosEnRango`, nunca `obtenerSaldosHasta`). |
| D-4 | Totales de las 4 columnas + `cuadra`/`diferenciaSumas`/`diferenciaSaldos`, tolerancia ±Bs 0.01 (§4.1). | Invariante de cuadre del dominio (`docs/claude/dominio-contable.md` §4.1, "Libros contables"). |
| D-5 | `cuentasNaturalezaOpuesta` computada en dominio puro; NO afecta totales. | Señal de calidad para el contador. |
| D-6 | Query: `desde`/`hasta` XOR `periodoFiscalId` + `incluirAnulados?`. Validar exactamente uno. | Mismo patrón conceptual que el Libro Mayor / Estado de Resultados. |
| D-7 | Ruta `GET /api/eeff/balance-comprobacion` en `EeffController`. | Es un Estado Financiero más. |
| D-8 | Permiso `contabilidad.eeff.read` + `@RequireModule('contabilidad')`. | Otro EEFF; sin permiso nuevo en el catálogo. |
| D-9 | Money interno; DTO serializa string 2 decimales (§4.5). FechaContable, no timestamp (§4.6). | Reglas duras del dominio. |
| D-10 | Naming español: `BalanceComprobacionService`, `balance-comprobacion.*`, `domain/balance-comprobacion.ts`, `domain/balance-comprobacion-errors.ts`, DTOs `balance-comprobacion-{query,response}.dto.ts`. Métodos genéricos en inglés. | §1 CLAUDE.md. |

## Decisiones resueltas en este design (con criterio propio)

### DR-1 — Solo cuentas de detalle CON movimiento (omitir saldo cero)

**Decisión**: incluir SOLO cuentas `esDetalle=true` con `sumasDebito>0 OR
sumasCredito>0`. Las de detalle sin movimiento en el rango se omiten.

**Justificación**: el Balance de Comprobación es un reporte de movimiento del
período, no un inventario del plan de cuentas. Mostrar cientos de cuentas en
cero hace ilegible el reporte que el contador usa para cazar descuadres. El
mismo criterio "omitir saldo/movimiento cero" ya se aplica en el Balance General
(REQ-BG-08) y el Estado de Resultados. Una cuenta con `débito=crédito>0` (saldo
cero PERO con movimiento) SÍ aparece — tuvo actividad en el rango.

### DR-2 — Solo cuentas de detalle, nunca agrupadoras

**Decisión**: el reporte es una **lista plana** de cuentas de movimiento
(`esDetalle=true`), no un árbol jerárquico. No hay subtotales por agrupador.

**Justificación**: el Balance de Comprobación de Sumas y Saldos clásico es
tabular y plano — una fila por cuenta imputable, totales al pie. La jerarquía
(secciones/subsecciones) es propia del Balance General y el Estado de Resultados,
no de este reporte. Esto SIMPLIFICA el builder respecto a `balance-arbol.ts` /
`resultados-arbol.ts`: no hay propagación de hojas a agrupadores ni `esContraria`.

### DR-3 — Resolución del rango por `periodoFiscalId`

**Decisión**: usar `PeriodosReaderPort.obtenerRangoFechas(tenantId,
periodoFiscalId)` (idéntico a como el Libro Diario y el Estado de Resultados
resuelven el período fiscal). `null` → `PeriodoNoEncontradoError` (422).

**Justificación**: ya existe el método, ya está scoped por tenant (defense in
depth), ya devuelve `{desde, hasta}`. No reinventar.

### DR-4 — Robustez ante desajuste estructura ↔ saldos

**Decisión**:
- Fila de saldo cuyo `cuentaId` no está en la estructura activa → se IGNORA
  (no se puede clasificar; podría ser una cuenta desactivada con movimiento
  histórico en el rango). NO lanza error.
- Cuenta de estructura sin fila de saldo → no aparece (sin movimiento, DR-1).

**Justificación**: las dos lecturas (`obtenerSaldosEnRango` y
`obtenerEstructuraCuentas`) provienen de fuentes distintas. `obtenerEstructura`
devuelve solo cuentas `activa=true`; una cuenta desactivada que tuvo movimiento
en el rango podría aparecer en saldos pero no en estructura. Ignorarla es
defensivo y evita filas sin nombre/naturaleza. Caso de borde, no esperado en
operación normal, pero el builder no debe romper. (Mismo espíritu que el
Map-lookup defensivo de `resultados-arbol.ts`.)

### DR-5 — Validación de fechas y errores

**Decisión**: reusar `parseFechaContable` (rechaza formato e impossibles como
2026-02-30). Errores como `DomainError` (§6.2), prefijo
`REPORTES_BALANCE_COMPROBACION_*`. La FORMA (formato `YYYY-MM-DD`, UUID) se valida
en el DTO con class-validator; la regla de negocio (exactamente un modo, rango
coherente, período existe) en el service con `DomainError` (regla de oro §10.10).

Códigos:
- `REPORTES_BALANCE_COMPROBACION_RANGO_REQUERIDO` (422) — ningún modo provisto.
- `REPORTES_BALANCE_COMPROBACION_RANGO_AMBIGUO` (422) — ambos modos a la vez.
- `REPORTES_BALANCE_COMPROBACION_RANGO_INVALIDO` (422) — fecha mal formada,
  modo rango incompleto, o `desde > hasta`.
- `REPORTES_BALANCE_COMPROBACION_PERIODO_NO_ENCONTRADO` (422) — `periodoFiscalId`
  inexistente o de otro tenant.

`RANGO_INVALIDO` mapea a `ValidationError`; los demás a `InvalidStateError`
(mismo split que `balance-errors.ts`: formato → Validation, regla de negocio →
InvalidState). Decisión: usar `InvalidStateError` (422) para REQUERIDO/AMBIGUO/
PERIODO porque son violaciones de combinación de parámetros, no de forma; y
`RANGO_INVALIDO` también como `InvalidStateError` (422) para alinear con
`RangoInvalidoError` del Estado de Resultados, que ya es 422. Se mantiene la
coherencia con el módulo: un solo "rango inválido" no debe ser 400 en un endpoint
y 422 en otro.

## Estructura de archivos a crear

```
backend/src/reportes/
├── domain/
│   ├── balance-comprobacion.ts            ← builder puro (función, NO @Injectable)
│   ├── balance-comprobacion.spec.ts       ← unit ≥95% cobertura
│   ├── balance-comprobacion-errors.ts     ← DomainError subclasses
│   └── balance-comprobacion-errors.spec.ts
├── dto/
│   ├── balance-comprobacion-query.dto.ts
│   ├── balance-comprobacion-response.dto.ts        ← tipos Money internos + DTO string + mapper
│   └── balance-comprobacion-response.dto.spec.ts   ← mapper Money→string
├── balance-comprobacion.service.ts        ← orquestador @Injectable
├── balance-comprobacion.service.spec.ts   ← mock tipado del port (NO Prisma)
└── (modificar) eeff.controller.ts, reportes.module.ts

backend/test/
└── balance-comprobacion.e2e-spec.ts       ← e2e HTTP (clon de balance-general.e2e-spec.ts)
```

Sin adapter nuevo, sin cambios al port, sin migración.

## Forma del builder de dominio (`domain/balance-comprobacion.ts`)

Función pura, sin NestJS/Prisma:

```
construirBalanceComprobacion(params: {
  estructura: CuentaEstructuraRow[];
  saldosRango: SaldoCuentaRow[];
}): BalanceComprobacionResult
```

Algoritmo:
1. Indexar estructura por `id` (Map). Filtrar a `esDetalle === true`.
2. Para cada fila de `saldosRango`:
   - Buscar la cuenta en el índice de estructura. Si no está o no es de detalle
     → IGNORAR (DR-4).
   - `sumasDebito = Money.of(totalDebitoBob)`, `sumasCredito = Money.of(totalCreditoBob)`.
   - Si ambos son cero → omitir (DR-1; defensivo, normalmente el port no
     devuelve filas en cero pero el builder no debe asumirlo).
   - `saldoDeudor = Money.max(sumasDebito.minus(sumasCredito), Money.ZERO)`
     (o `diff.isPositive() ? diff : ZERO`).
   - `saldoAcreedor = Money.max(sumasCredito.minus(sumasDebito), Money.ZERO)`.
   - Construir la fila con `cuentaId`, `codigoInterno`, `nombre`, `naturaleza`,
     y los 4 Money.
3. Ordenar filas por `codigoInterno` ASC (`localeCompare`).
4. Totales: reduce de cada columna con `Money.plus`.
5. Cuadre:
   - `cuadra = totalSumasDebito.balanceadoEnBobCon(totalSumasCredito) &&
     totalSaldoDeudor.balanceadoEnBobCon(totalSaldoAcreedor)`.
   - `diferenciaSumas = totalSumasDebito.minus(totalSumasCredito)`.
   - `diferenciaSaldos = totalSaldoDeudor.minus(totalSaldoAcreedor)`.
6. `cuentasNaturalezaOpuesta`: filtrar filas donde
   `(naturaleza===DEUDORA && saldoAcreedor.isPositive())` o
   `(naturaleza===ACREEDORA && saldoDeudor.isPositive())`. Cada entrada lleva
   `cuentaId`, `codigoInterno`, `nombre`, `naturaleza`, y el `saldoOpuesto`
   (el lado con valor).

> Nota: `Money.max` puede no existir; usar `diff.isPositive() ? diff : Money.ZERO`
> (la API confirmada tiene `isPositive`, `minus`, `plus`, `balanceadoEnBobCon`,
> `isZero`, `ZERO`). Decidir en `apply` según la API real de `Money`.

`balanceadoEnBobCon` ya implementa la tolerancia ±Bs 0.01 (confirmado en
`money.ts:124`) — reusarlo en vez de reimplementar la tolerancia.

## Contrato del DTO de respuesta

`balance-comprobacion-response.dto.ts` (patrón idéntico a
`eeff-resultados-response.dto.ts`: tipos `*Calculada` con Money + DTO con string +
mapper `toBalanceComprobacionResponse`).

DTO público (`@ApiProperty` en cada campo, montos string, fechas YYYY-MM-DD):

```
LineaBalanceComprobacionDto {
  cuentaId: string
  codigoInterno: string
  nombre: string
  naturaleza: string            // "DEUDORA" | "ACREEDORA"
  sumasDebito: string           // "1000.00"
  sumasCredito: string
  saldoDeudor: string
  saldoAcreedor: string
}

CuentaNaturalezaOpuestaDto {
  cuentaId: string
  codigoInterno: string
  nombre: string
  naturaleza: string
  saldoOpuesto: string          // el lado contrario a su naturaleza
}

BalanceComprobacionResponseDto {
  fechaDesde: string            // "2026-04-01"
  fechaHasta: string
  lineas: LineaBalanceComprobacionDto[]
  totalSumasDebito: string
  totalSumasCredito: string
  totalSaldoDeudor: string
  totalSaldoAcreedor: string
  cuadra: boolean
  diferenciaSumas: string
  diferenciaSaldos: string
  cuentasNaturalezaOpuesta: CuentaNaturalezaOpuestaDto[]
}
```

El mapper serializa Money con `.toBob()` (string 2 decimales) y Date con
`formatFechaContable`.

## Forma del service (`balance-comprobacion.service.ts`)

Clon estructural de `EstadoResultadosService`:
- Inyecta `EeffSaldosReaderPort` (símbolo `EEFF_SALDOS_READER_PORT`) +
  `PeriodosReaderPort` (símbolo `PERIODOS_READER_PORT`).
- `consultarBalanceComprobacion(tenantId, query)`:
  1. Resolver modo (XOR `desde`/`hasta` vs `periodoFiscalId`) → errores DR-5.
  2. Resolver `[desde, hasta]` (parseo directo o `obtenerRangoFechas`).
  3. `Promise.all([obtenerSaldosEnRango(tenant, desde, hasta, incluirAnulados),
     obtenerEstructuraCuentas(tenant)])`. NUNCA `obtenerSaldosHasta` (flujo, DR-3).
  4. `construirBalanceComprobacion({estructura, saldosRango})`.
  5. `toBalanceComprobacionResponse(result, {desde, hasta})`.

## Forma del controller (endpoint a agregar a `EeffController`)

```
@Get('balance-comprobacion')
@RequirePermissions('contabilidad.eeff.read')
@ApiOperation({ summary: 'Balance de Comprobación de Sumas y Saldos ... REQ-BC-01..13' })
@ApiOkResponse({ type: BalanceComprobacionResponseDto })
obtenerBalanceComprobacion(@Req() req, @Query() query: BalanceComprobacionQueryDto) {
  const tenantId = resolveTenantId(req);
  return this.balanceComprobacionService.consultarBalanceComprobacion(tenantId, {
    ...(query.desde !== undefined ? { desde: query.desde } : {}),
    ...(query.hasta !== undefined ? { hasta: query.hasta } : {}),
    ...(query.periodoFiscalId !== undefined ? { periodoFiscalId: query.periodoFiscalId } : {}),
    incluirAnulados: query.incluirAnulados ?? false,
  });
}
```

Guards heredados a nivel de clase (`AuthGuard('jwt')`, `ModuleEnabledGuard`,
`PermissionsGuard`, `@RequireModule('contabilidad')`). Spread condicional por
`exactOptionalPropertyTypes` (§2.5.1).

## Query DTO

`balance-comprobacion-query.dto.ts` (class-validator, `@Transform` para boolean):
- `desde?` `@Matches(/^\d{4}-\d{2}-\d{2}$/)`
- `hasta?` `@Matches(...)`
- `periodoFiscalId?` `@IsUUID('4')`
- `incluirAnulados?` `@IsBoolean()` + `@Transform` (string "true"/"false" → bool)

La forma (formato/UUID) en el DTO; el XOR de modos en el service.

## Registro en module

`reportes.module.ts`: agregar `BalanceComprobacionService` a `providers`. NO se
agrega adapter (reusa `EEFF_SALDOS_READER_PORT` ya registrado) ni import nuevo
(`PeriodosReaderModule` ya está importado).

## OpenAPI / contract-drift

El nuevo `BalanceComprobacionResponseDto` decorado con `@ApiOkResponse` entra al
schema. Tras implementar: regenerar `backend/openapi.json` (`openapi:dump`) y
`frontend/src/types/api.generated.ts` (`gen:api-types`) y commitear ambos, o el
job CI `contract-drift` rompe el build.

## Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| `Money.max` puede no existir en la API. | Usar `diff.isPositive() ? diff : Money.ZERO`. Confirmar API en apply. |
| Confundir el modelo con saldo neto firmado (como el Balance General). | El Balance de Comprobación usa SUMAS y `MAX(...,0)`, no `calcularSaldoNeto`. Tests explícitos del builder cubren la mecánica (REQ-BC-03). |
| Tolerancia de cuadre reimplementada inconsistente. | Reusar `Money.balanceadoEnBobCon` (ya ±0.01). |
| Cuenta desactivada con movimiento histórico aparece en saldos pero no en estructura. | DR-4: ignorar la fila sin estructura, sin romper. Test de robustez (REQ-BC-13). |
| `obtenerRangoFechas` devuelve `desde`/`hasta` a medianoche UTC; el rango del port es inclusivo. | Es el mismo método que ya usa Libro Diario/Estado de Resultados; comportamiento ya validado. |
| Olvidar regenerar openapi → CI rojo. | Task explícita de regeneración. |
