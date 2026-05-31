# Technical Design — Reporte Balance General (backend)

> Change: `reportes-balance-general` (Change 3 del fasing de reportes)
> Artifact store: hybrid · Topic key: `sdd/reportes-balance-general/design`
> Scope: BACKEND-ONLY · Fecha: 2026-05-30
> Lee primero: `proposal.md` (decisión opción (b) del `BalanceReaderPort`)

---

## 0. Resumen de la decisión arquitectónica

El módulo `reportes/` ya tiene Libro Diario y Libro Mayor. Este change agrega el
primer Estado Financiero (Balance General) **espejando exactamente** el patrón del
Mayor: **port de lectura propio** (`reportes` dueño del contrato, §3.7) +
**adapter Prisma `$queryRaw`** (agregado por cuenta) + **service que calcula el
árbol en memoria con `Money`** + **DTO con montos `string`**. Sin migración:
todas las queries se apoyan en índices existentes.

Tres piezas de lógica nueva respecto del Mayor:
1. **Propagación jerárquica** hoja → agrupadores (`parentId`/`nivel`).
2. **`esContraria`** (resta del total del grupo).
3. **Resultado del Ejercicio** = `Σ INGRESO − Σ EGRESO` de la gestión vigente,
   con la MISMA fuente de verdad (el mismo `BalanceReaderPort`) que reutilizará el
   Estado de Resultados (Change 4).

---

## 1. Estructura de archivos

### Nuevos

```
backend/src/reportes/
├── ports/
│   └── balance-reader.port.ts            (abstract class + Symbol BALANCE_READER_PORT)
├── adapters/
│   ├── prisma-balance-reader.adapter.ts  ($queryRaw agregado + findMany estructura)
│   └── prisma-balance-reader.adapter.integration.spec.ts
├── domain/
│   ├── saldo-naturaleza.ts               (helper signo-por-naturaleza EXTRAÍDO del Mayor)
│   ├── saldo-naturaleza.spec.ts
│   ├── balance-arbol.ts                  (construcción del árbol + propagación + esContraria, PURO)
│   ├── balance-arbol.spec.ts
│   ├── balance-errors.ts                 (DomainErrors REPORTES_BALANCE_*)
│   └── balance-errors.spec.ts
├── dto/
│   ├── balance-query.dto.ts              (fecha de corte, gestionId?, incluirAnulados?)
│   ├── balance-response.dto.ts           (árbol anidado + mapper + tipos internos)
│   └── balance-response.dto.spec.ts
├── balance-general.service.ts            (orquestación)
├── balance-general.service.spec.ts       (unit con ports mockeados)
└── eeff.controller.ts                    (GET /api/eeff/balance)
```

### Modificados

```
backend/src/reportes/
├── reportes.module.ts                    (+ bindings Balance, + EeffController, + CuentasReaderModule ya importado)
├── libro-mayor.service.ts                (refactor: usa saldo-naturaleza.ts; sin cambio funcional)
└── ports/periodos-reader.port.ts         (periodos-fiscales) — ver §6: NUEVO método obtenerRangoGestionPorFecha
```

> **Decisión de routing**: `EeffController` **separado** con `@Controller('eeff')`
> dentro del mismo módulo `reportes` (default recomendado P3, confirmado por Marco).
> Los EEFF son una familia distinta de los Libros; Change 4 sumará `eeff/resultados`
> al MISMO `EeffController`. El `ReportesController` (libros) queda intacto.

---

## 2. Contrato del `BalanceReaderPort`

`reportes/ports/balance-reader.port.ts` — abstract class + Symbol, **dueño del
contrato `reportes`** (§3.7). Difiere del `LibroMayorReaderPort` porque el Mayor
expone "movimientos línea-a-línea + saldo inicial separado por cuenta" (forma
running-balance), mientras el Balance necesita **saldo neto agregado por cuenta
hoja ≤ fecha de corte** + **estructura completa del árbol**.

```typescript
export const BALANCE_READER_PORT = Symbol('BALANCE_READER_PORT');

/** Saldo neto acumulado de una cuenta HOJA hasta la fecha de corte (inclusive). */
export interface SaldoCuentaRow {
  cuentaId: string;
  totalDebitoBob: Decimal;   // COALESCE(SUM(lc.debitoBob),0) — string Postgres → Decimal en adapter
  totalCreditoBob: Decimal;
}

/** Metadata estructural de una cuenta (para armar el árbol). TODAS las activas del tenant. */
export interface CuentaEstructuraRow {
  id: string;
  parentId: string | null;
  nivel: number;
  esDetalle: boolean;
  esContraria: boolean;
  claseCuenta: ClaseCuenta;          // ACTIVO|PASIVO|PATRIMONIO|INGRESO|EGRESO
  subClaseCuenta: SubClaseCuenta | null;
  naturaleza: NaturalezaCuenta;
  codigoInterno: string;
  nombre: string;
}

export interface BalanceFiltros {
  /** Corte inclusive: lineas con c.fechaContable <= fechaCorte. */
  fechaCorte: Date;
  /** Si true, incluye comprobantes con anulado=true. Default false (§4.7). */
  incluirAnulados: boolean;
}

export abstract class BalanceReaderPort {
  /**
   * Saldo neto agregado por cuenta (GROUP BY cuentaId) de las líneas
   * CONTABILIZADO/BLOQUEADO con c.fechaContable <= fechaCorte.
   * BORRADOR NUNCA (§4.1). organizationId SIEMPRE primer predicado (§4.2 Anti-31).
   * Cuenta sin movimiento puede no aparecer — el service la trata como saldo 0.
   *
   * Las cuentas INGRESO/EGRESO TAMBIÉN se devuelven: el service las usa para el
   * Resultado del Ejercicio (acotado por rango de gestión, §5) y NUNCA las cuelga
   * del árbol del Balance (el Balance solo presenta ACTIVO/PASIVO/PATRIMONIO).
   */
  abstract obtenerSaldosHasta(
    tenantId: string,
    filtros: BalanceFiltros,
  ): Promise<SaldoCuentaRow[]>;

  /**
   * Suma de débitos/créditos por cuenta acotada a un rango [desde, hasta] (ambos
   * inclusive) — usada para el Resultado del Ejercicio de la gestión vigente.
   * Misma fuente de verdad que el saldo agregado: GROUP BY cuentaId, mismos
   * estados/filtros, mismo predicado organizationId. Solo cambia el rango de fecha.
   */
  abstract obtenerSaldosEnRango(
    tenantId: string,
    desde: Date,
    hasta: Date,
    incluirAnulados: boolean,
  ): Promise<SaldoCuentaRow[]>;

  /**
   * Estructura de TODAS las cuentas ACTIVAS del tenant (activa=true), incluidas
   * las agrupadoras sin movimiento (son nodos estructurales del árbol).
   * findMany simple scoped por organizationId (defense in depth §4.2).
   */
  abstract obtenerEstructuraCuentas(tenantId: string): Promise<CuentaEstructuraRow[]>;
}
```

**Notas de contrato:**
- `obtenerSaldosHasta` y `obtenerSaldosEnRango` retornan **solo** `cuentaId` +
  totales (NO naturaleza/codigo): la metadata viene de `obtenerEstructuraCuentas`,
  evitando duplicarla y manteniendo el JOIN del agregado mínimo (no necesita
  `JOIN cuentas`). El service cruza por `cuentaId` con la estructura.
- `Decimal` se construye en el adapter desde el `string` que Postgres devuelve para
  `numeric` en `$queryRaw` (mismo patrón que el Mayor).
- **NO** se importa el repositorio de `comprobantes` ni de `cuentas` (§3.3):
  `reportes` define su propia superficie de lectura, como ya hace con el Mayor.

---

## 3. Helper extraído: `domain/saldo-naturaleza.ts`

Hoy `calcularSaldoInicial(row)` vive como función privada al final de
`libro-mayor.service.ts` (líneas 320-337). Se **extrae sin cambio funcional** a un
util de dominio puro reutilizable por Mayor, Balance y el futuro Estado de
Resultados.

```typescript
// reportes/domain/saldo-naturaleza.ts
import { NaturalezaCuenta } from '@prisma/client';
import { Money } from '@/common/domain/money';

/**
 * Saldo neto de una cuenta según su naturaleza contable.
 * DEUDORA: debe − haber (activos/egresos). ACREEDORA: haber − debe (pasivos/patrimonio/ingresos).
 * Código Tributario art. 47: la naturaleza determina el signo del saldo.
 * Un saldo negativo es válido (ej. descubierto bancario en cuenta DEUDORA).
 */
export function calcularSaldoNeto(
  totalDebitoBob: Money | string | Decimal,
  totalCreditoBob: Money | string | Decimal,
  naturaleza: NaturalezaCuenta,
): Money {
  const debe = Money.of(totalDebitoBob);
  const haber = Money.of(totalCreditoBob);
  return naturaleza === NaturalezaCuenta.DEUDORA ? debe.minus(haber) : haber.minus(debe);
}
```

**Refactor del Mayor sin romperlo:** `libro-mayor.service.ts` reemplaza su función
`calcularSaldoInicial(row)` por `calcularSaldoNeto(row.totalDebitoBob,
row.totalCreditoBob, row.naturaleza)`. La firma cambia de "recibe `SaldoInicialRow`"
a "recibe los 3 campos", pero el cálculo es idéntico. Los tests existentes del Mayor
(`libro-mayor.service.spec.ts` + integration) son el safety net: deben seguir verdes
sin tocarlos. Como Strict TDD está activo, el refactor se hace en su propio commit
RED→GREEN del nuevo `saldo-naturaleza.spec.ts` (caso DEUDORA, ACREEDORA, negativo,
cero), y luego se rewirea el Mayor verificando que su suite no regresiona.

---

## 4. Estrategia de query `$queryRaw`

### 4.1 `obtenerSaldosHasta` (saldo agregado ≤ corte)

```sql
SELECT
  lc."cuentaId"                         AS "cuentaId",
  COALESCE(SUM(lc."debitoBob"), 0)      AS "totalDebitoBob",
  COALESCE(SUM(lc."creditoBob"), 0)     AS "totalCreditoBob"
FROM lineas_comprobante lc
JOIN comprobantes c ON c.id = lc."comprobanteId"
WHERE lc."organizationId" = ${tenantId}            -- PRIMER predicado (§4.2 Anti-31)
  AND c.estado IN ('CONTABILIZADO','BLOQUEADO')    -- FIJO, BORRADOR nunca (§4.1)
  AND c."fechaContable" <= ${fechaCorte}
  -- AND c.anulado = false                          -- solo cuando incluirAnulados=false
GROUP BY lc."cuentaId"
```

`obtenerSaldosEnRango` es idéntica salvo el filtro de fecha
(`>= desde AND <= hasta`). Ambas se ramifican en 2 variantes por el toggle
`incluirAnulados` (igual que el Mayor: el predicado `anulado=false` no se
parametriza, se ramifica el statement — Prisma `$queryRaw` no admite SQL dinámico
seguro de otra forma sin `Prisma.sql` fragments; se mantiene el patrón del Mayor
con statements explícitos por rama).

> **Optimización**: a diferencia del Mayor, NO se hace `JOIN cuentas` aquí — el
> agregado solo necesita `cuentaId` + sumas. La metadata (naturaleza, clase, etc.)
> la trae `obtenerEstructuraCuentas` por separado. Menos columnas en el GROUP BY,
> JOIN más barato.

### 4.2 `obtenerEstructuraCuentas`

`prisma.cuenta.findMany({ where: { organizationId: tenantId, activa: true },
select: { id, parentId, nivel, esDetalle, esContraria, claseCuenta,
subClaseCuenta, naturaleza, codigoInterno, nombre } })`. No requiere `$queryRaw`
(lookup simple scoped por tenant, igual que `obtenerCuentaDetalle` del Mayor usa
`findFirst`).

### 4.3 Confirmación de índices (SIN MIGRACIÓN)

| Query | Predicados | Índice que la cubre |
|-------|-----------|---------------------|
| `obtenerSaldosHasta` / `EnRango` | `lc.organizationId` + GROUP BY `lc.cuentaId` | `lineas_comprobante @@index([organizationId, cuentaId])` (schema:741) |
| JOIN a comprobantes por fecha | `c.organizationId` + `c.fechaContable` | `comprobantes @@index([organizationId, fechaContable])` (schema:701) |
| `obtenerEstructuraCuentas` | `cuenta.organizationId` (+ `activa`) | `cuentas @@index([organizationId, claseCuenta])` cubre el prefijo `organizationId`; el `activa` se filtra post-index (cardinalidad baja, volumen PyME ~100-150 cuentas) |

El JOIN `lc → c` usa la PK `comprobantes.id`. El agregado por `cuentaId` y el corte
por `fechaContable` están ambos indexados. **No falta ningún índice → no se toca
`schema.prisma`.** (Confirma proposal §Scope/Out of Scope y Decisión 2.)

---

## 5. Lógica del service — `balance-general.service.ts`

Inyecta SOLO ports: `BalanceReaderPort`, `PeriodosReaderPort`,
`OrgConfigReaderPort` (ver §5.4). Throws SOLO `DomainError`. Cero `any`.

### 5.1 Orquestación

```
consultarBalanceGeneral(tenantId, { fecha, gestionId?, incluirAnulados }):
  1. Validar/parsear fecha de corte → Date (REPORTES_BALANCE_FECHA_INVALIDA si no parsea).
  2. Resolver rango de la gestión vigente para el Resultado del Ejercicio:
       - si gestionId provisto → periodosReader.obtenerRangoGestion(tenantId, gestionId)
       - si no → periodosReader.obtenerRangoGestionPorFecha(tenantId, fechaCorte)
       → { desde, hasta }  (REPORTES_BALANCE_SIN_GESTION si null)
  3. En paralelo (Promise.all):
       saldosHasta   = balanceReader.obtenerSaldosHasta(tenantId, { fechaCorte, incluirAnulados })
       saldosGestion = balanceReader.obtenerSaldosEnRango(tenantId, desde, hasta, incluirAnulados)
       estructura    = balanceReader.obtenerEstructuraCuentas(tenantId)
       config        = orgConfigReader.obtenerCuentasResultado(tenantId)  (§5.4)
  4. resultadoEjercicio = sumResultado(saldosGestion, estructura)   (§5.3)
  5. arbol = construirBalance(saldosHasta, estructura, resultadoEjercicio, config)  (domain/balance-arbol.ts)
  6. return toBalanceResponse(arbol, { fechaCorte, cuadra, diferencia })
```

### 5.2 Construcción del árbol — `domain/balance-arbol.ts` (PURO, testeable sin NestJS)

1. **Saldo por hoja**: para cada `CuentaEstructuraRow` con `esDetalle=true`, cruzar
   su `cuentaId` con `saldosHasta`; aplicar `calcularSaldoNeto(debe, haber,
   naturaleza)` (§3). Cuenta hoja sin fila en `saldosHasta` → `Money.ZERO`.
2. **Indexar** cuentas por `id` y por `parentId` (hijos). Procesar por `nivel`
   descendente (hojas primero) para propagar hacia arriba.
3. **Propagación**: `saldoGrupo(nodo) = Σ saldoNeto(hijos)`, donde un hijo con
   `esContraria=true` **RESTA** en vez de sumar (`− saldoNeto(hijo)`). Solo
   `esDetalle=true` aporta saldo propio; las agrupadoras solo agregan hijos
   (evita doble conteo).
4. **Ensamblar secciones** por `claseCuenta` → `subClaseCuenta`:
   - ACTIVO → ACTIVO_CORRIENTE / ACTIVO_NO_CORRIENTE
   - PASIVO → PASIVO_CORRIENTE / PASIVO_NO_CORRIENTE
   - PATRIMONIO → PATRIMONIO_CAPITAL / PATRIMONIO_RESULTADOS (+ Resultado del Ejercicio, §5.3)
   - INGRESO/EGRESO **NO** se cuelgan del Balance (solo alimentan el Resultado).
5. **Regla de omisión (Decisión 6)**: hojas con saldo 0 se omiten del detalle;
   agrupadoras se incluyen si tienen ≥1 descendiente con saldo; grupo sin saldo se omite.
6. Todo en `Money`; serialización a `string` en el mapper (§7).

### 5.3 Resultado del Ejercicio

```
ResultadoEjercicio = Σ saldoNeto(cuentas INGRESO de la gestión)
                   − Σ saldoNeto(cuentas EGRESO de la gestión)
```
Se calcula sobre `saldosGestion` (saldos en el rango `[desde, hasta]` de la gestión
vigente, NO el acumulado histórico ≤ corte) cruzado con `estructura` para conocer
`claseCuenta`/`naturaleza` de cada cuenta. INGRESO es naturaleza ACREEDORA (saldo =
haber−debe, positivo = ganancia); EGRESO es DEUDORA (saldo = debe−haber, positivo =
gasto). `calcularSaldoNeto` ya da el signo correcto por cuenta; sumamos
`Σ INGRESO − Σ EGRESO`.

> **Sutileza del corte de gestión**: el rango de la gestión se acota además por la
> fecha de corte si la fecha cae DENTRO de la gestión vigente (no tiene sentido
> sumar ingresos posteriores al corte). El service usa `hastaEfectivo = min(hasta,
> fechaCorte)` al llamar `obtenerSaldosEnRango`. Si `fechaCorte < desde` (corte
> antes del inicio de la gestión) → Resultado = 0 (gestión sin movimientos aún).

### 5.4 Mapeo a la cuenta de Patrimonio (decisión EXPLÍCITA)

El proposal dejó abierto si el Resultado se **inyecta como saldo en la cuenta
`resultadoEjercicioId`** o como **línea sintética**. **Decisión: línea sintética**.

Razón: la cuenta `resultadoEjercicioId` (PATRIMONIO_RESULTADOS) normalmente tiene
**saldo 0 durante la gestión vigente** (solo recibe movimiento real al ejecutar el
asiento de CIERRE, Fase 1.5, fuera de scope). Si inyectáramos el Resultado calculado
COMO si fuera el saldo real de esa cuenta, en una empresa que YA cerró su gestión
contaríamos el resultado dos veces (una vez en el saldo real de la cuenta de cierre,
otra vez en el cálculo). En cambio:

- **Resultados Acumulados** (`resultadosAcumuladosId`) y **Resultado del Ejercicio
  cuenta de cierre** (`resultadoEjercicioId`) aparecen en el árbol con su **saldo
  REAL** (movimientos de cierres previos) vía la propagación normal de PATRIMONIO.
- El **Resultado del Ejercicio CALCULADO** (gestión vigente, aún sin asiento de
  cierre) se agrega como una **línea sintética adicional** dentro de la subsección
  PATRIMONIO_RESULTADOS, con `cuentaId: null`, `esSintetica: true`, etiqueta
  "Resultado del Ejercicio (en curso)".

Esto implementa el **tratamiento dual** que Marco confirmó (P2): Resultados
Acumulados = saldos reales; Resultado del Ejercicio = calculado. El
`orgConfigReader.obtenerCuentasResultado(tenantId)` solo se necesita para **ubicar
la subsección** y para una validación defensiva (que `resultadoEjercicioId` exista y
sea PATRIMONIO_RESULTADOS); no se usa para inyectar saldo. Si la org no tiene
config (caso borde), la línea sintética se cuelga igual de PATRIMONIO_RESULTADOS por
`subClaseCuenta`.

> **Port cross-module para la config**: se reutiliza/define un reader leaf. El
> proposal nota que `configuracion-contable` ya expone un `CuentaReaderPort`. Para
> mantener `reportes` desacoplado y sin ciclo CJS, se define
> `OrgConfigReaderPort` (Symbol + abstract) en un **leaf module**
> `OrgConfigReaderModule` (mismo patrón que `PeriodosReaderModule` /
> `CuentasReaderModule`), con un único método
> `obtenerCuentasResultado(tenantId): Promise<{ resultadoEjercicioId: string | null;
> resultadosAcumuladosId: string | null } | null>`. Si crear el leaf module resulta
> innecesario (porque la línea sintética se ubica por `subClaseCuenta` sin leer la
> config), el service prescinde de él — se decide en `apply` con un test que
> demuestre que la ubicación por subclase es suficiente. **Default de diseño:
> ubicar por `subClaseCuenta=PATRIMONIO_RESULTADOS` sin leer config** (más simple,
> sin nuevo módulo); la lectura de config queda como mejora opcional documentada.

### 5.5 Cuadre de la ecuación contable

```
totalActivo     = Σ saldos secciones ACTIVO
totalPasivo     = Σ saldos secciones PASIVO
totalPatrimonio = Σ saldos secciones PATRIMONIO + ResultadoEjercicio
diferencia      = totalActivo − (totalPasivo + totalPatrimonio)
cuadra          = |diferencia| ≤ Money.TOLERANCIA_BOB   (±Bs 0.01, Código Trib. art. 47)
```
`cuadra` + `diferencia` son **datos de salida**, NO error duro (un descuadre real
por datos corruptos se ve en `diferencia`). Comentario regulatorio obligatorio en
el código (§2.2).

---

## 6. Resolución de la gestión vigente (NUEVO método en `PeriodosReaderPort`)

**Hallazgo clave**: `PeriodosReaderPort.obtenerPorFecha(tenantId, fecha)` devuelve
solo `{ id, status }` del PERÍODO (mes), y `obtenerRangoFechas(tenantId, periodoId)`
da el rango de UN período (mes), no de la GESTIÓN (año fiscal de 12 meses). El
Resultado del Ejercicio es de toda la GESTIÓN, no de un mes.

**Decisión**: extender `PeriodosReaderPort` (dueño del dominio períodos/gestiones,
§3.7) con un método owner-owned:

```typescript
/**
 * Rango calendario [desde, hasta] de la GESTIÓN fiscal (año fiscal de 12 meses)
 * que contiene la fecha dada. Deriva de GestionFiscal (year, mesInicio) + sus
 * períodos. Retorna null si el tenant no tiene gestión que cubra esa fecha.
 * Consumido por `reportes` para acotar el Resultado del Ejercicio del Balance.
 */
abstract obtenerRangoGestionPorFecha(
  tenantId: string,
  fecha: Date,
): Promise<{ gestionId: string; desde: Date; hasta: Date } | null>;

/** Igual, pero por gestionId explícito (cuando el cliente lo pasa). */
abstract obtenerRangoGestion(
  tenantId: string,
  gestionId: string,
): Promise<{ desde: Date; hasta: Date } | null>;
```

El adapter `PrismaPeriodosReaderAdapter` los implementa (deriva el rango de
`GestionFiscal.year`/`mesInicio` + `MIN/MAX` de los `PeriodoFiscal.year/month` de la
gestión, o calculando `mesInicio..mesInicio+11`). `PeriodosReaderModule` ya exporta
el port → `reportes` lo consume sin cambios de wiring. **Este es el único cambio a
otro módulo además de la extracción del helper**, y es aditivo (no rompe a
`comprobantes`, el otro consumidor del port).

> Alternativa descartada: resolver la gestión dentro de `reportes` leyendo
> `GestionFiscal` directo → violaría §3.3 (cross-module sin port). El dueño del
> dato períodos/gestiones debe exponer su propia superficie.

---

## 7. DTOs

### 7.1 Query — `balance-query.dto.ts`

```typescript
export class BalanceQueryDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe tener formato YYYY-MM-DD' })
  fecha!: string;                              // corte — REQUERIDO

  @IsOptional() @IsUUID('4')
  gestionId?: string;                          // opcional — delimita la gestión del Resultado

  @IsOptional() @Transform(boolBuilder) @IsBoolean()
  incluirAnulados?: boolean;                   // default false
}
```
Validación de **forma** en el DTO (class-validator); regla de negocio
(fecha→gestión) en el service con `DomainError` (§10.10).

### 7.2 Response — `balance-response.dto.ts`

```typescript
interface CuentaBalanceDto {
  cuentaId: string | null;          // null en la línea sintética del Resultado
  codigoInterno: string | null;
  nombre: string;
  esContraria: boolean;
  esSintetica: boolean;             // true solo para "Resultado del Ejercicio (en curso)"
  saldoBob: string;                 // string decimal (§4.5)
}

interface SubseccionBalanceDto {
  subClaseCuenta: string;           // ACTIVO_CORRIENTE | ... | PATRIMONIO_RESULTADOS
  titulo: string;                   // etiqueta legible
  cuentas: CuentaBalanceDto[];      // árbol aplanado por subsección (o anidado, ver nota)
  totalBob: string;
}

interface SeccionBalanceDto {
  claseCuenta: string;              // ACTIVO | PASIVO | PATRIMONIO
  titulo: string;
  subsecciones: SubseccionBalanceDto[];
  totalBob: string;
}

export interface BalanceResponseDto {
  fechaCorte: string;               // "YYYY-MM-DD"
  gestionId: string;                // gestión usada para el Resultado del Ejercicio
  activo: SeccionBalanceDto;
  pasivo: SeccionBalanceDto;
  patrimonio: SeccionBalanceDto;
  resultadoEjercicioBob: string;    // el escalar calculado, expuesto aparte para trazabilidad
  totalActivoBob: string;
  totalPasivoBob: string;
  totalPatrimonioBob: string;
  cuadra: boolean;
  diferenciaBob: string;            // Activo − (Pasivo + Patrimonio)
}
```

> **Forma del árbol**: el árbol jerárquico completo (con agrupadoras anidadas
> `parentId`) puede aplanarse por subsección o anidarse. **Decisión: anidamiento por
> subClaseCuenta con detalle de cuentas hoja/agrupadoras planas dentro de cada
> subsección**, preservando `codigoInterno` para que el frontend pueda indentar por
> nivel. El árbol completo anidado (nodo→hijos) se deja para el frontend si lo
> necesita; el MVP entrega secciones → subsecciones → lista de cuentas con su nivel.
> Tipos internos del service (`*Calculado` con `Money`) separados de los DTO
> (`string`), igual que el Mayor. `formatFechaContable` se reutiliza de
> `libro-mayor-response.dto.ts` (o se mueve a un helper común de `reportes/dto`).

---

## 8. DomainErrors — `domain/balance-errors.ts`

Prefijo **`REPORTES_BALANCE_*`** (consistente con `LIBRO_MAYOR_*` / `LIBRO_DIARIO_*`
del módulo). Extienden las clases base de `@/common/errors`.

| Clase | Code | Base | HTTP |
|-------|------|------|------|
| `FechaCorteInvalidaError` | `REPORTES_BALANCE_FECHA_INVALIDA` | `ValidationError` | 400 |
| `GestionNoEncontradaError` | `REPORTES_BALANCE_SIN_GESTION` | `NotFoundError` | 404 |

`GestionNoEncontradaError`: la fecha de corte no cae en ninguna gestión del tenant
(o el `gestionId` provisto no existe / no es del tenant — defense in depth §4.2, no
distingue "no existe" de "no es tuyo"). Mensaje al usuario en español.

> No hay error de "no cuadra": el descuadre es dato de salida (`cuadra: false` +
> `diferencia`), no excepción (Decisión del proposal §Riesgos).

---

## 9. Wiring — `reportes.module.ts`

```typescript
@Module({
  imports: [
    RbacModule,
    PeriodosReaderModule,    // ya importado — ahora también expone obtenerRangoGestion*
    CuentasReaderModule,     // ya importado
    // OrgConfigReaderModule, // SOLO si se decide leer config (default: no, ver §5.4)
  ],
  controllers: [ReportesController, EeffController],   // + EeffController
  providers: [
    PrismaService,
    TenantContextService,
    // ... providers existentes Diario + Mayor ...

    // Balance General
    BalanceGeneralService,
    PrismaBalanceReaderAdapter,
    { provide: BALANCE_READER_PORT, useExisting: PrismaBalanceReaderAdapter },
  ],
})
export class ReportesModule {}
```
`useExisting` (no `useClass`) para que el adapter sea singleton compartido. El módulo
exporta solo ports si otro módulo los consumiera (no es el caso aquí). PrismaService
+ TenantContextService ya listados.

`EeffController`: `@Controller('eeff')`, mismos guards que `ReportesController`
(`AuthGuard('jwt')`, `ModuleEnabledGuard`, `PermissionsGuard`),
`@RequireModule('contabilidad')`, y en el método
`@RequirePermissions('contabilidad.eeff.read')` + Swagger `@ApiOperation`. Reutiliza
`resolveTenantId(req)` (se extrae a un helper compartido `reportes/tenant-id.ts` o se
duplica el patrón mínimo — decisión menor de apply; preferible extraer para no
duplicar el resolver de tenant).

---

## 10. Plan de tests (Honeycomb, TDD estricto)

### 10.1 Unit (`.spec.ts`, sin DB)

- **`saldo-naturaleza.spec.ts`**: DEUDORA (debe−haber), ACREEDORA (haber−debe),
  saldo negativo válido, cero. (RED→GREEN antes de rewirear el Mayor.)
- **`balance-arbol.spec.ts`** (núcleo de dominio, cobertura ≥95% §7.5):
  - propagación hoja → agrupador (árbol 3-4 niveles).
  - `esContraria` RESTA del grupo (Depreciación Acumulada en ACTIVO/ACREEDORA →
    reduce el Activo No Corriente).
  - hoja saldo 0 omitida; agrupadora con ≥1 hijo con saldo presente; grupo vacío omitido.
  - Resultado del Ejercicio = Σ INGRESO − Σ EGRESO; línea sintética en
    PATRIMONIO_RESULTADOS.
  - ecuación: caso que cuadra (`cuadra=true`, `diferencia="0.00"`) y caso que
    descuadra por datos (`cuadra=false`, `diferencia≠0`), tolerancia ±0.01.
- **`balance-general.service.spec.ts`**: orquestación con `BalanceReaderPort` y
  `PeriodosReaderPort` MOCKEADOS (nunca Prisma, §7.8):
  - fecha inválida → `REPORTES_BALANCE_FECHA_INVALIDA`.
  - sin gestión → `REPORTES_BALANCE_SIN_GESTION`.
  - `gestionId` explícito vs inferido por fecha.
  - `hastaEfectivo = min(hasta, fechaCorte)` aplicado al rango de gestión.
  - `incluirAnulados` propagado a ambas queries de saldo.
- **`balance-errors.spec.ts`**: codes estables + shape `details`.
- **`balance-response.dto.spec.ts`**: serialización Money→string, fecha→"YYYY-MM-DD",
  estructura del árbol, `cuadra`/`diferencia`.

### 10.2 Integración (`.integration.spec.ts`, Postgres real, 2 tenants)

`prisma-balance-reader.adapter.integration.spec.ts` (espeja
`prisma-libro-mayor-reader.adapter.integration.spec.ts`):
- **Aislamiento multi-tenant CRÍTICO** (§4.2 Anti-31): 2 tenants con cuentas/saldos
  en el MISMO rango de fechas; verificar que A no ve nada de B en las 3 queries.
- BORRADOR nunca afecta saldos (insertar BORRADOR → no suma).
- toggle `incluirAnulados` (anulado=true incluido/excluido).
- `obtenerSaldosHasta` con corte: línea con fecha > corte no suma; = corte suma.
- `obtenerSaldosEnRango`: solo el rango de gestión.
- `obtenerEstructuraCuentas`: trae agrupadoras sin movimiento; `activa=false` excluida;
  escenario con cuenta `esContraria=true`.
- COALESCE → cuenta sin movimiento devuelve 0/ausente correctamente.

### 10.3 E2E (`test/*.e2e-spec.ts`)

`GET /api/eeff/balance` full-stack (Supertest + AppModule):
- 200 con árbol completo (Activo/Pasivo/Patrimonio), `cuadra`, montos `string`,
  fecha "YYYY-MM-DD".
- 400 sin `fecha` o formato inválido.
- 403 sin permiso `contabilidad.eeff.read`.
- 404 fecha sin gestión.
- Resultado del Ejercicio presente en Patrimonio (escenario con ventas y gastos).
- Multi-tenant vía header/JWT (el tenant del JWT, no fuga).

---

## 11. Confirmación: SIN MIGRACIÓN

Confirmado en §4.3: las 3 queries (`obtenerSaldosHasta`, `obtenerSaldosEnRango`,
`obtenerEstructuraCuentas`) se apoyan en índices existentes
(`lineas_comprobante[organizationId,cuentaId]`,
`comprobantes[organizationId,fechaContable]`,
`cuentas[organizationId,claseCuenta]` para el prefijo `organizationId`). El método
nuevo de `PeriodosReaderPort` lee `GestionFiscal`/`PeriodoFiscal` con sus uniques
existentes (`[organizationId, year]`, `[organizationId, year, month]`). **`schema.prisma`
NO se toca. Cero migraciones.**

---

## 12. Riesgos técnicos y mitigaciones

| Riesgo | Mitigación de diseño |
|--------|----------------------|
| Fuga cross-tenant en `$queryRaw`/findMany | `organizationId` PRIMER predicado en las 3 lecturas; test 2-tenants obligatorio |
| `esContraria` ignorada → Activo inflado | Lógica en `balance-arbol.ts` PURO con test dedicado (Depreciación Acumulada) |
| Doble conteo del Resultado del Ejercicio (cuenta de cierre + cálculo) | Línea SINTÉTICA `cuentaId:null`, NO se inyecta en el saldo real de `resultadoEjercicioId` (§5.4) |
| Divergencia Resultado Balance vs Estado de Resultados (Change 4) | Mismo `BalanceReaderPort` + `calcularSaldoNeto` compartido = una sola fuente de verdad |
| Refactor del helper rompe el Mayor | Helper extraído sin cambio funcional; suite del Mayor (unit+integration) como safety net; commit propio RED→GREEN |
| Inferir mal la gestión desde `fecha` | Método owner-owned en `PeriodosReaderPort` que deriva de `GestionFiscal`; `min(hasta, fechaCorte)` para no sumar post-corte |
| Montos serializados como `number` | DTO `string`, cálculo con `Money`; test de forma JSON |
| Volumen alto degrada el agregado | Un solo GROUP BY por query, índices cubren; volumen PyME ~15k líneas / ~150 cuentas |

---

## 13. Invariantes CLAUDE.md en juego

§4.1 (ecuación contable ±Bs 0.01) · §4.2 (multi-tenant defense in depth) ·
§4.5 (Money/string, nunca number) · §4.6 (FechaContable calendario puro) ·
§4.7 (anulados excluidos por default). §3.2/§3.3/§3.7 (hexagonal estricto,
cross-module por port, owner-owned). §2.2 (comentarios regulatorios obligatorios
en cuadre y signo-por-naturaleza).
