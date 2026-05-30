# Design: Reporte Libro Mayor (backend) — segundo libro del módulo `reportes`

## Technical Approach

Se EXTIENDE el módulo existente `backend/src/reportes/` (hexagonal estricto §3.2),
agregando el sub-recurso `GET /api/libros/mayor` al lado del Libro Diario. **Backend-only**
(decisión cerrada #392): sin frontend, sin migración de schema.

El Mayor es la vista **por cuenta**: para cada cuenta de detalle toma su **saldo inicial**
(acarreo histórico = suma de líneas con `fechaContable < fechaDesde`), los movimientos del
rango y calcula un **saldo corriente acumulado** movimiento a movimiento, con el signo
determinado por la `naturaleza` de la cuenta (DEUDORA/ACREEDORA).

A diferencia del Diario (listado fiel, cero cálculo), el Mayor introduce **lógica de cálculo
nueva**: el saldo inicial y el running balance. Esa lógica vive en el **SERVICE** con el VO
`Money` (§4.5), NUNCA en la DB. El adapter solo provee filas crudas agregadas/proyectadas;
el service decide el signo y acumula.

Piezas:
- `LibroMayorReaderPort` (port nuevo, definido EN `reportes/ports/`, espeja la decisión #1 del
  Diario: el dueño del contrato es reportes, no importa `comprobantes/` directo — §3.3).
- `PrismaLibroMayorReaderAdapter` con **`$queryRaw`** parametrizado (JOIN cross-tabla por
  `fechaContable`, decisión 2).
- Reusa `PeriodosReaderPort.obtenerRangoFechas` ya existente (resolución período → rango).
- `LibroMayorService` (orquesta validación + ports + running balance + mapeo).
- DTOs query/response (montos `string`, fechas `YYYY-MM-DD`).
- `libro-mayor-errors.ts` (`REPORTES_LIBRO_MAYOR_*`).

## Architecture Decisions

### Decisión 1: Port propio de lectura `LibroMayorReaderPort` en `reportes/ports/`

**Choice**: port nuevo `LibroMayorReaderPort` (abstract class + `Symbol('LIBRO_MAYOR_READER_PORT')`),
definido en `reportes/ports/`, separado de `ComprobantesReaderPort` (que sirve al Diario).

**Alternatives**: (a) ampliar `ComprobantesReaderPort` con métodos del Mayor → mezcla dos
capabilities distintas en una sola superficie; (b) que reportes lea Prisma directo sin port
→ viola §3.5 (service tocaría infraestructura).

**Rationale**: el Mayor necesita una superficie DISTINTA al Diario: agregados por cuenta y
saldo histórico, no "asientos con líneas". Port separado mantiene cada contrato cohesivo y
mínimo (§3.7). El adapter concreto puede ser el mismo objeto o uno nuevo; serán dos `useExisting`
sobre dos clases distintas (Diario ya tiene la suya).

**Firma exacta** (ver §Interfaces). Tres métodos:
- `contarMovimientos(tenantId, filtros)` → tope defensivo (espeja `contarAsientos`).
- `obtenerMovimientos(tenantId, filtros)` → filas crudas de las líneas del rango con datos de
  cabecera + cuenta. Una fila por línea de comprobante.
- `obtenerSaldosIniciales(tenantId, filtros)` → agregado `SUM(debitoBob), SUM(creditoBob)` por
  cuenta, de TODAS las líneas con `fechaContable < fechaDesde`. Una fila por cuenta.

Se separan saldo inicial y movimientos en DOS métodos (no uno combinado) porque son DOS queries
de naturaleza distinta: el saldo inicial es un `GROUP BY cuenta` agregado (no devuelve filas
individuales — sería un desperdicio traer años de movimientos solo para sumarlos), y los
movimientos son filas individuales que el service recorre para el running balance. Combinarlas
forzaría a traer todo el histórico fila por fila.

### Decisión 2: Query `$queryRaw` parametrizado (NO Prisma `findMany`)

**Choice**: el adapter usa `prisma.$queryRaw<Row[]>` con SQL explícito y JOIN
`lineas_comprobante lc JOIN comprobantes c ON lc.comprobante_id = c.id`, parámetros posicionales.

**Alternatives**: Prisma `findMany` sobre `lineaComprobante` con `where: { comprobante: {...} }`
(filtro relacional) + agregación en memoria.

**Rationale**: el Diario usó `findMany` porque consultaba la cabecera (`comprobante`) y la fecha
vive en la misma tabla. El Mayor consulta **líneas** filtrando por una fecha que vive en la
**cabecera** (`comprobantes.fechaContable`), más un **agregado** (`SUM` por cuenta para el saldo
inicial). Con `findMany`:
- El saldo inicial requeriría `groupBy` sobre `lineaComprobante` filtrando por relación
  `comprobante.fechaContable < x` — Prisma `groupBy` NO soporta filtros sobre relaciones
  (`where` de `groupBy` es sobre campos escalares de la tabla agrupada). Tendríamos que traer
  TODAS las líneas históricas a memoria y sumar — inviable a escala.
- El JOIN cross-tabla con SQL explícito permite que Postgres use los índices existentes
  (`lineas_comprobante [organizationId, cuentaId]` + `comprobantes [organizationId, fechaContable]`)
  y agregue en la DB.

`$queryRaw` (template tag, NO `$queryRawUnsafe`) parametriza con `${valor}` → genera placeholders
posicionales (`$1, $2, …`), inmune a inyección. **Defense in depth (§4.2, Anti-31)**: la cláusula
`lc."organizationId" = ${tenantId}` va SIEMPRE en AMBOS queries (movimientos y saldos iniciales),
como primer predicado. Comentario regulatorio obligatorio en el SQL explicando la inmunidad
cross-tenant. El filtro de estado es FIJO `c.estado IN ('CONTABILIZADO','BLOQUEADO')` (BORRADOR
nunca, espeja decisión 3 del Diario), nunca parametrizable.

**Coste**: `$queryRaw` devuelve `unknown` tipado por el genérico — hay que tipar el `Row` a mano
y mapear `Decimal`/snake_case con cuidado. Aceptable: el SQL es la herramienta correcta para esta
forma de consulta agregada cross-tabla.

### Decisión 3: El running balance (saldo corriente) vive en el SERVICE con `Money`

**Choice**: el adapter NO calcula saldos acumulados ni aplica signo. Devuelve débito/crédito BOB
crudos por movimiento y el agregado del saldo inicial. El SERVICE, con el VO `Money`, recorre los
movimientos en orden determinístico y acumula aplicando la `naturaleza`.

**Alternatives**: window function `SUM(...) OVER (PARTITION BY cuenta ORDER BY fecha)` en SQL.

**Rationale**: (a) el dinero se opera con `Money`/`Decimal`, nunca con aritmética SQL que podría
introducir floats o redondeos no controlados; (b) la regla de signo por naturaleza es **lógica de
dominio** y debe ser testeable sin DB (§3.5, §7.8 — el service se testea con mocks de port, sin
Prisma); (c) el window function ataría el orden a la DB y mezclaría reporte con persistencia.

**Algoritmo (pseudo-código)**:

```
// Regla de dominio (schema.prisma:82-90):
//   DEUDORA  → saldo += debe − haber   (Activo, Egreso)
//   ACREEDORA → saldo += haber − debe   (Pasivo, Patrimonio, Ingreso)
// esContraria NO se aplica aquí: usa `naturaleza` directamente (solo afecta Balance General).

para cada cuenta C (con movimientos y/o saldo inicial):
    saldoInicial = saldoInicialPorCuenta[C.id] ?? Money.ZERO   // ya viene con signo aplicado
    saldoCorriente = saldoInicial
    totalDebe = Money.ZERO
    totalHaber = Money.ZERO

    movimientosOrdenados = movimientos[C.id] ordenados por:
        1. fechaContable ASC
        2. numeroComprobante ASC NULLS LAST   // desempate dentro del día
        3. comprobanteId ASC, orden ASC       // desempate estable y determinístico

    para cada mov en movimientosOrdenados:
        debe  = Money.of(mov.debitoBob)
        haber = Money.of(mov.creditoBob)
        totalDebe  = totalDebe.plus(debe)
        totalHaber = totalHaber.plus(haber)
        delta = C.naturaleza === DEUDORA
                  ? debe.minus(haber)
                  : haber.minus(debe)
        saldoCorriente = saldoCorriente.plus(delta)
        mov.saldoCorrienteBob = saldoCorriente.toBob()   // snapshot tras este movimiento

    C.saldoFinal = saldoCorriente
```

El saldo inicial se calcula con la MISMA fórmula de signo a partir del agregado
`SUM(debitoBob) − SUM(creditoBob)` (DEUDORA) o `SUM(creditoBob) − SUM(debitoBob)` (ACREEDORA).
El orden determinístico del SQL DEBE coincidir con el del service (el adapter ordena en el
`ORDER BY`, el service confía en ese orden pero re-aplica el tie-break estable por seguridad).

### Decisión 4: `soloConMovimiento=false` resuelto con la query de saldos iniciales como fuente de cuentas

**Choice**: por default (`soloConMovimiento=true`) el Mayor lista solo cuentas con ≥1 movimiento
en el rango. Con `soloConMovimiento=false` también incluye cuentas con saldo inicial ≠ 0 pero sin
movimientos en el rango.

**Mecanismo**: el adapter ya ejecuta DOS queries independientes (decisión 1):
- `obtenerMovimientos` → cuentas con actividad en el rango.
- `obtenerSaldosIniciales` → cuentas con actividad ANTES del rango (saldo inicial ≠ 0).

El SERVICE hace la UNIÓN por `cuentaId`:
- `soloConMovimiento=true` → set de cuentas = solo las de `obtenerMovimientos`. Las cuentas que
  solo tienen saldo inicial se descartan (pero su saldo inicial igual se usa si la cuenta también
  tiene movimientos).
- `soloConMovimiento=false` → set de cuentas = unión(movimientos ∪ saldosIniciales con saldo ≠ 0).
  Las cuentas sin movimientos aparecen con `movimientos: []`, `totalDebe/Haber = 0` y
  `saldoFinal === saldoInicial`.

No degrada la query principal: `obtenerSaldosIniciales` ya se ejecuta SIEMPRE (se necesita el saldo
inicial de toda cuenta con movimiento). El toggle solo cambia qué cuentas el service decide incluir
en la salida; no agrega queries. Si `cuentaId` está presente (consulta de UNA cuenta), el toggle es
irrelevante: se devuelve esa cuenta con su saldo inicial aunque no tenga movimientos.

### Decisión 5: Filtro `cuentaId` opcional + validación de cuenta de detalle

**Choice**: `cuentaId?` opcional. Si se omite → Mayor de todas las cuentas (con movimiento, o
todas con saldo si `soloConMovimiento=false`). Si se pasa → solo esa cuenta.

El service valida que la cuenta consultada sea de **detalle** (`esDetalle = true`). MVP solo soporta
cuentas de detalle (decisión cerrada #392: solo `esDetalle=true` tiene líneas directas). Si el
usuario pide explícitamente una cuenta agrupadora (`esDetalle=false`) → `CuentaNoDetalleError`.

**Mecanismo**: el adapter, dentro del mismo `$queryRaw`, hace `JOIN cuentas cu` y trae `cu.naturaleza`,
`cu.codigo_interno`, `cu.nombre`, `cu.es_detalle`. El JOIN ya filtra `cu."esDetalle" = true` para el
listado general (las agrupadoras no tienen líneas, así que naturalmente no aparecen). Para el caso
`cuentaId` explícito, el service necesita distinguir "no existe / no es tuya" de "existe pero es
agrupadora": el port expone `obtenerCuentaDetalle(tenantId, cuentaId)` que devuelve la cuenta o
`null`, y el service decide el error. (Esto evita el smell de inferir "agrupadora" por ausencia de
movimientos — una cuenta de detalle nueva también tiene cero movimientos.)

### Decisión 6: DomainErrors `REPORTES_LIBRO_MAYOR_*` (espeja `libro-diario-errors.ts`)

**Choice**: archivo `domain/libro-mayor-errors.ts` con subclases de `DomainError` (§6.2), mismas
clases base que el Diario (`ValidationError`, `NotFoundError`, `InvalidStateError`):

| Error | Base | HTTP | Código estable |
|-------|------|------|----------------|
| `FiltroRequeridoError` | `ValidationError` | 400 | `LIBRO_MAYOR_FILTRO_INVALIDO` |
| `RangoInvalidoError` | `ValidationError` | 400 | `LIBRO_MAYOR_RANGO_INVALIDO` |
| `CuentaNoDetalleError` | `ValidationError` | 400 | `LIBRO_MAYOR_CUENTA_NO_DETALLE` |
| `MovimientosExcedenLimiteError` | `InvalidStateError` | 422 | `LIBRO_MAYOR_RANGO_EXCEDIDO` |
| `PeriodoNoEncontradoError` | `NotFoundError` | 404 | `LIBRO_MAYOR_PERIODO_NO_ENCONTRADO` |
| `CuentaNoEncontradaError` | `NotFoundError` | 404 | `LIBRO_MAYOR_CUENTA_NO_ENCONTRADA` |

`CuentaNoEncontradaError` y `CuentaNoDetalleError` se distinguen: la primera es 404 (no existe / no
es del tenant — no enumera ids ajenos), la segunda es 400 (existe y es tuya pero es agrupadora, error
de uso). El `GlobalExceptionFilter` ya mapea `DomainError` al formato estándar (§6.4).

### Decisión 7: Tope defensivo inyectable (espeja `LIBRO_DIARIO_MAX_ASIENTOS`)

**Choice**: `LIBRO_MAYOR_MAX_MOVIMIENTOS_ENV = 'LIBRO_MAYOR_MAX_MOVIMIENTOS'`, default
`LIBRO_MAYOR_MAX_MOVIMIENTOS_DEFAULT = 20_000`, leído via `ConfigService` en el constructor del
service. El service hace `contarMovimientos(filtros)` ANTES de traer las filas; si excede →
`MovimientosExcedenLimiteError` (422).

**Rationale**: el Mayor cuenta LÍNEAS (no asientos), y una consulta sin `cuentaId` puede traer todas
las líneas del rango. El tope se mide en movimientos (líneas del rango); default mayor que el del
Diario (20k vs 5k) porque la unidad es la línea, no el asiento (~2-4 líneas por asiento). Un reporte
truncado en silencio es peor que un error explícito que pide acotar (mismo criterio que el Diario).
El `count` extra es barato sobre los índices existentes.

### Decisión 8: Wiring en `reportes.module.ts` y `reportes.controller.ts`

**Choice**:
- `reportes.module.ts`: agregar `LibroMayorService` a `providers`; registrar el adapter
  `PrismaLibroMayorReaderAdapter` y el binding `{ provide: LIBRO_MAYOR_READER_PORT, useExisting:
  PrismaLibroMayorReaderAdapter }`. `PeriodosReaderModule` y `RbacModule` ya están importados.
- `reportes.controller.ts`: agregar método `@Get('mayor')` con
  `@RequirePermissions('contabilidad.libro-mayor.read')` (permiso YA en el catálogo,
  `common/permisos/catalogo.ts:138`) + `@ApiOperation`. Reusa `resolveTenantId(req)` ya existente.
  Inyecta `LibroMayorService` por constructor (junto a `LibroDiarioService`). Spread condicional
  para opcionales (§2.5.1 `exactOptionalPropertyTypes`).

El controller NO tiene lógica: resuelve tenant, arma el objeto de query con spread condicional y
delega al service.

## Data Flow

    HTTP GET /api/libros/mayor?cuentaId?&(periodoFiscalId | fechaDesde+fechaHasta)&incluirAnulados&soloConMovimiento
        │  AuthGuard('jwt') + ModuleEnabledGuard('contabilidad') + PermissionsGuard
        │  @RequirePermissions('contabilidad.libro-mayor.read')
        ▼
    ReportesController.obtenerLibroMayor ── resolveTenantId(req) (JWT.activeTenantId / X-Tenant-ID)
        ▼
    LibroMayorService
        ├─ valida filtro de forma (DomainError: período XOR rango, fechaDesde ≤ fechaHasta)
        ├─ si periodoFiscalId → PeriodosReaderPort.obtenerRangoFechas() → {desde, hasta}
        ├─ si cuentaId → LibroMayorReaderPort.obtenerCuentaDetalle() → null⇒404 / agrupadora⇒400
        ├─ LibroMayorReaderPort.contarMovimientos(org, filtros) → tope (422 si excede)
        ├─ LibroMayorReaderPort.obtenerSaldosIniciales(org, filtros)  ── SUM por cuenta < fechaDesde
        ├─ LibroMayorReaderPort.obtenerMovimientos(org, filtros)      ── líneas del rango + cabecera + cuenta
        ├─ agrupa movimientos por cuentaId; aplica saldo inicial (signo por naturaleza)
        ├─ running balance con Money por cuenta (orden fecha→numero→comprobante→orden)
        ├─ une saldos iniciales sin movimiento si soloConMovimiento=false
        └─ mapea → LibroMayorResponseDto (Decimal/Money→string toBob(), fecha→YYYY-MM-DD)
        ▼
    { rango, cuentas:[{..., saldoInicialBob, totalDebeBob, totalHaberBob, saldoFinalBob, movimientos:[{..., saldoCorrienteBob}]}], generadoEn }

## Interfaces / Contracts

```typescript
// reportes/ports/libro-mayor-reader.port.ts
import type { Comprobante, LineaComprobante, Cuenta, NaturalezaCuenta } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export const LIBRO_MAYOR_READER_PORT = Symbol('LIBRO_MAYOR_READER_PORT');

/** Filtros resueltos que llegan al adapter (rango siempre como Date). */
export interface LibroMayorFiltros {
  /** Si presente, restringe a una sola cuenta de detalle. */
  cuentaId?: string;
  /** Inicio del rango calendario — inclusive. */
  fechaDesde: Date;
  /** Fin del rango calendario — inclusive. */
  fechaHasta: Date;
  /** Si true, incluye comprobantes anulados. Default false. */
  incluirAnulados: boolean;
}

/**
 * Fila cruda de un movimiento (una línea de comprobante) del rango, con datos
 * de la cabecera y de la cuenta. Decimal de Prisma — el service convierte a Money/string.
 * Proyección plana (resultado de $queryRaw con JOIN), NO entidad de dominio (decisión 1 del Diario).
 */
export interface MovimientoMayorRow {
  cuentaId: string;
  codigoInterno: string;
  nombreCuenta: string;
  naturaleza: NaturalezaCuenta;
  comprobanteId: string;
  numeroComprobante: string | null;
  fechaContable: Date;
  glosa: string;            // glosa de la cabecera
  glosaLinea: string | null;
  estado: string;
  anulado: boolean;
  orden: number;            // orden de la línea dentro del comprobante (desempate)
  debitoBob: Decimal;
  creditoBob: Decimal;
}

/** Saldo histórico agregado de una cuenta antes del rango (SUM por cuenta). */
export interface SaldoInicialRow {
  cuentaId: string;
  codigoInterno: string;
  nombreCuenta: string;
  naturaleza: NaturalezaCuenta;
  totalDebitoBob: Decimal;   // SUM(debitoBob) con fechaContable < fechaDesde
  totalCreditoBob: Decimal;  // SUM(creditoBob) con fechaContable < fechaDesde
}

export abstract class LibroMayorReaderPort {
  /**
   * Cuenta los movimientos (líneas) CONTABILIZADO/BLOQUEADO del rango para el tope
   * defensivo. Respeta cuentaId, incluirAnulados y organizationId. BORRADOR nunca.
   * @param tenantId - organizationId del JWT activo (§4.2)
   */
  abstract contarMovimientos(tenantId: string, filtros: LibroMayorFiltros): Promise<number>;

  /**
   * Movimientos (líneas) del rango de cuentas de detalle, con datos de cabecera y cuenta.
   * Ordenados cuentaId, fechaContable ASC, numeroComprobante ASC NULLS LAST,
   * comprobanteId ASC, orden ASC (orden determinístico para el running balance).
   * Filtra organizationId SIEMPRE (§4.2). estado IN (CONTABILIZADO, BLOQUEADO).
   * @param tenantId - organizationId del JWT activo (§4.2)
   */
  abstract obtenerMovimientos(
    tenantId: string,
    filtros: LibroMayorFiltros,
  ): Promise<MovimientoMayorRow[]>;

  /**
   * Saldo inicial agregado por cuenta: SUM(debitoBob), SUM(creditoBob) de toda línea
   * con fechaContable < filtros.fechaDesde (mismo tenant, estado firme, respeta anulados).
   * Una fila por cuenta de detalle con actividad previa. Filtra organizationId SIEMPRE.
   * @param tenantId - organizationId del JWT activo (§4.2)
   */
  abstract obtenerSaldosIniciales(
    tenantId: string,
    filtros: LibroMayorFiltros,
  ): Promise<SaldoInicialRow[]>;

  /**
   * Devuelve la cuenta si existe, es del tenant y es de detalle. `null` si no existe
   * o no pertenece al tenant (no enumera ids ajenos, §4.2). Si existe pero es
   * agrupadora, devuelve la cuenta con esDetalle=false para que el service lance
   * CuentaNoDetalleError (400) en lugar de 404.
   * @param tenantId - organizationId del JWT activo (§4.2)
   */
  abstract obtenerCuentaDetalle(
    tenantId: string,
    cuentaId: string,
  ): Promise<Pick<Cuenta, 'id' | 'esDetalle'> | null>;
}
```

SQL del adapter (forma, parámetros posicionales vía `$queryRaw`):

```sql
-- obtenerMovimientos. organizationId SIEMPRE primero (§4.2, Anti-31): inmune cross-tenant.
SELECT cu.id AS "cuentaId", cu."codigoInterno", cu.nombre AS "nombreCuenta",
       cu.naturaleza, c.id AS "comprobanteId", c.numero AS "numeroComprobante",
       c."fechaContable", c.glosa, lc."glosaLinea", c.estado, c.anulado, lc.orden,
       lc."debitoBob", lc."creditoBob"
FROM lineas_comprobante lc
JOIN comprobantes c ON c.id = lc."comprobanteId"
JOIN cuentas cu     ON cu.id = lc."cuentaId"
WHERE lc."organizationId" = ${tenantId}          -- defense in depth, primer predicado
  AND c.estado IN ('CONTABILIZADO','BLOQUEADO')  -- FIJO; BORRADOR nunca
  AND c."fechaContable" >= ${fechaDesde} AND c."fechaContable" <= ${fechaHasta}
  AND cu."esDetalle" = true
  [AND lc."cuentaId" = ${cuentaId}]              -- solo si filtros.cuentaId
  [AND c.anulado = false]                        -- solo si NOT incluirAnulados
ORDER BY cu.id, c."fechaContable" ASC, c.numero ASC NULLS LAST, c.id ASC, lc.orden ASC;

-- obtenerSaldosIniciales. Mismo filtro de org/estado/anulados, fecha < fechaDesde, GROUP BY cuenta.
SELECT cu.id AS "cuentaId", cu."codigoInterno", cu.nombre AS "nombreCuenta", cu.naturaleza,
       COALESCE(SUM(lc."debitoBob"), 0)  AS "totalDebitoBob",
       COALESCE(SUM(lc."creditoBob"), 0) AS "totalCreditoBob"
FROM lineas_comprobante lc
JOIN comprobantes c ON c.id = lc."comprobanteId"
JOIN cuentas cu     ON cu.id = lc."cuentaId"
WHERE lc."organizationId" = ${tenantId}
  AND c.estado IN ('CONTABILIZADO','BLOQUEADO')
  AND c."fechaContable" < ${fechaDesde}
  AND cu."esDetalle" = true
  [AND lc."cuentaId" = ${cuentaId}]
  [AND c.anulado = false]
GROUP BY cu.id, cu."codigoInterno", cu.nombre, cu.naturaleza;
```

DTO de respuesta (montos `string`, fechas `YYYY-MM-DD`):

```typescript
// reportes/dto/libro-mayor-response.dto.ts
export interface MovimientoMayorDto {
  fechaContable: string;            // "YYYY-MM-DD" (§4.6)
  numeroComprobante: string | null; // null teórico; firmes siempre tienen numero
  glosa: string;                    // glosa de la cabecera
  glosaLinea: string | null;
  debeBob: string;                  // string decimal 2 dec (§4.5)
  haberBob: string;
  saldoCorrienteBob: string;        // saldo acumulado DESPUÉS de este movimiento
  anulado: boolean;
}

export interface CuentaMayorDto {
  cuentaId: string;
  codigoInterno: string;
  nombreCuenta: string;
  naturaleza: 'DEUDORA' | 'ACREEDORA';
  saldoInicialBob: string;          // acarreo histórico, con signo por naturaleza
  totalDebeBob: string;             // SUM debe de movimientos del rango
  totalHaberBob: string;            // SUM haber de movimientos del rango
  saldoFinalBob: string;            // saldoInicial ± movimientos
  movimientos: MovimientoMayorDto[];
}

export interface LibroMayorResponseDto {
  rango: { fechaDesde: string; fechaHasta: string };
  cuentas: CuentaMayorDto[];
  generadoEn: string;               // ISO timestamp (createdAt/updatedAt UTC — informativo)
}

// Mapper puro (espeja toLibroDiarioResponse): Decimal/Money → toBob(); Date → formatFechaContable.
export function toLibroMayorResponse(...): LibroMayorResponseDto { ... }
```

```typescript
// reportes/dto/libro-mayor-query.dto.ts — class-validator, FORMA solo (§10.10)
export class LibroMayorQueryDto {
  @IsOptional() @IsUUID('4') cuentaId?: string;
  @IsOptional() @IsUUID('4') periodoFiscalId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) fechaDesde?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) fechaHasta?: string;
  @IsOptional() @Transform(...) @IsBoolean() incluirAnulados?: boolean;   // default false
  @IsOptional() @Transform(...) @IsBoolean() soloConMovimiento?: boolean; // default true
}
```

## Mapeo a DTO (decisión 9: espeja el mapper del Diario)

- `Decimal`/`Money` → `string`: reusar `decimalToString(d) = d.toFixed(2)` y `Money.toBob()`
  (ambos 2 decimales, BOB §4.5). El saldo inicial y los saldos corrientes se construyen con `Money`
  en el service y se serializan con `.toBob()`. Los totales debe/haber del rango se acumulan con
  `Money.plus` y se serializan con `.toBob()`.
- `FechaContable` (`@db.Date`, Prisma lo devuelve como `Date` UTC 00:00Z) → `"YYYY-MM-DD"` con
  `formatFechaContable(date)` (getUTC*, idéntico al Diario; §4.6).
- `generadoEn`: timestamp informativo (no es dato del dominio contable). El service NO usa
  `new Date()` directamente (§4.6 prohíbe en service) — se inyecta `ClockPort` o se computa en el
  controller/borde. **FLAG**: revisar en apply si hay un `ClockPort` disponible; si no, `generadoEn`
  puede omitirse del MVP (no es dato contable, solo metadato de generación). El Diario NO incluye
  `generadoEn`, así que la opción más segura es **omitirlo** y dejarlo para el frontend change.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `domain/libro-mayor-errors.ts` | Create | 6 DomainErrors `LIBRO_MAYOR_*` (espeja libro-diario-errors) |
| `ports/libro-mayor-reader.port.ts` | Create | `LibroMayorReaderPort` abstract + Symbol + tipos `LibroMayorFiltros`, `MovimientoMayorRow`, `SaldoInicialRow` |
| `adapters/prisma-libro-mayor-reader.adapter.ts` | Create | `$queryRaw` JOIN + count + saldos iniciales + obtenerCuentaDetalle; filtro organizationId SIEMPRE |
| `adapters/prisma-libro-mayor-reader.adapter.integration.spec.ts` | Create | Postgres real, 2 tenants, saldo inicial, anulados, orden, agrupadora |
| `dto/libro-mayor-query.dto.ts` | Create | class-validator forma: cuentaId?, periodoFiscalId?, fechas, incluirAnulados?, soloConMovimiento? |
| `dto/libro-mayor-response.dto.ts` | Create | DTOs anidados + `toLibroMayorResponse` mapper |
| `dto/libro-mayor-response.dto.spec.ts` | Create | unit del mapper (Decimal→string, fecha, running balance, naturaleza) |
| `libro-mayor.service.ts` | Create | validación + ports + running balance Money + unión saldos/movimientos + mapeo |
| `libro-mayor.service.spec.ts` | Create | unit con mocks de ports (NUNCA Prisma §7.8): signo DEUDORA y ACREEDORA, saldo inicial, soloConMovimiento, tope, filtro inválido |
| `reportes.controller.ts` | Modify | + `@Get('mayor')` con RequirePermissions + Swagger; inyectar LibroMayorService |
| `reportes.module.ts` | Modify | + LibroMayorService + adapter + binding useExisting LIBRO_MAYOR_READER_PORT |
| `backend/test/libro-mayor.e2e-spec.ts` | Create | e2e: 401/403, filtros, 2 tenants sin fuga, saldo inicial, naturaleza |

Sin migración. Sin cambios a `schema.prisma`, `app.module.ts` (ReportesModule ya registrado),
`periodos-reader.port.ts` (`obtenerRangoFechas` ya existe). Permiso `contabilidad.libro-mayor.read`
ya en `common/permisos/catalogo.ts:138`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (service) | signo DEUDORA (debe−haber) Y ACREEDORA (haber−debe); saldo inicial aplicado con signo; running balance acumulado; soloConMovimiento true/false; cuentaId agrupadora→400, inexistente→404; tope→422; filtro inválido→400; orden determinístico | mocks de `LibroMayorReaderPort` + `PeriodosReaderPort`; NUNCA Prisma (§7.8); Money para asserts |
| Unit (mapper) | Decimal→`toBob()`; Date→`YYYY-MM-DD`; estructura anidada cuenta→movimientos | función pura |
| Integration (adapter) | filtro `organizationId` aísla 2 tenants (test + y −, obligatorio Anti-31); BORRADOR excluido; anulados toggle; saldo inicial = SUM histórica < fechaDesde; orden cuenta/fecha/numero; agrupadora sin líneas no aparece; obtenerCuentaDetalle null vs esDetalle | Postgres real (§7.2), seed 2 tenants, TX por test |
| E2E | 401 sin token; 403 sin `contabilidad.libro-mayor.read`; período vs rango; 2 tenants sin fuga; saldo inicial correcto cruzando meses; naturaleza correcta | Supertest + AppModule, `--runInBand --forceExit` |

Cobertura objetivo: ≥95% en dominio del módulo (§7.5). Invariantes críticos con test + y −:
multi-tenant (2 tenants), signo por naturaleza (ambas), BORRADOR excluido.

## Migration / Rollout

No migration. Solo lectura sobre `Comprobante`, `LineaComprobante`, `Cuenta`. Permiso ya en catálogo.
Rollback = revertir el PR (squash): quitar `@Get('mayor')`, el binding y el provider de
`reportes.module.ts`. El Diario no se toca.

## Open Questions

- [ ] `generadoEn` en el DTO: el Diario NO lo incluye y el service no puede usar `new Date()` (§4.6).
      RECOMENDACIÓN: omitirlo del MVP backend (no es dato contable); el frontend change lo agrega si
      lo necesita. Resolver en apply según haya `ClockPort` disponible.
- [ ] Gating granular en frontend: N/A (este change es backend-only; el backend es la autoridad RBAC).
- [ ] Performance del JOIN sin `cuentaId`: el tope de 20k movimientos acota el peor caso. Disparador
      para desnormalizar `fechaContable` en la línea (Opción C, diferida): queries de Mayor >500ms
      medidas en prod (decisión #392).
