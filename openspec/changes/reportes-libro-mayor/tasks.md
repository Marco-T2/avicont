# Tasks: Reporte Libro Mayor (módulo `reportes`) — backend-only

> Strict TDD Mode: RED → GREEN por tarea de implementación.
> Conventional commit scope: `reportes` (singular).
> Sin migración — cero cambios en `schema.prisma`, `app.module.ts` o `periodos-reader.port.ts`.
>
> **Reconciliaciones aplicadas:**
> - **Código de error cuenta agrupadora**: `LIBRO_MAYOR_CUENTA_NO_DETALLE` (prefijo `LIBRO_MAYOR_*`
>   consistente con el resto de errors, igual que `LIBRO_DIARIO_*` usa el prefijo del capability).
>   El spec menciona `REPORTES_LIBRO_MAYOR_CUENTA_NO_DETALLE`; el código real que aplica el design
>   es `LIBRO_MAYOR_CUENTA_NO_DETALLE`. **Decisión**: usar `LIBRO_MAYOR_*` (sin prefijo `REPORTES_`)
>   para ser consistente con el patrón `libro-diario-errors.ts` existente. El spec (que lista
>   `REPORTES_LIBRO_MAYOR_*`) se alinea al código real en apply.
> - **Tope defensivo default**: `LIBRO_MAYOR_MAX_MOVIMIENTOS_DEFAULT = 20_000` (líneas, no asientos).
>   El spec menciona 10.000 como umbral del escenario; el design fija 20.000 como default.
>   **Resolución**: el default en código es **20.000**. Los tests del service INYECTAN el token
>   con un valor reducido (ej. `LIMIT_TEST = 10`) via override de `ConfigService` para evitar
>   números mágicos. El escenario del spec (10.001 líneas → 422) se cubre con el token inyectado
>   igual a 10.000 en el test de integración E2E.

---

## Fase 1 — Dominio y errores

- [ ] 1.1 **[RED unit]** Crear `reportes/domain/libro-mayor-errors.spec.ts` — verifica que cada
  subclase tiene el `httpStatus` y `code` esperados. 6 casos:
  - `FiltroRequeridoError` → 400, `LIBRO_MAYOR_FILTRO_INVALIDO`
  - `RangoInvalidoError` → 400, `LIBRO_MAYOR_RANGO_INVALIDO`, details con fechaDesde/fechaHasta
  - `CuentaNoDetalleError` → 400, `LIBRO_MAYOR_CUENTA_NO_DETALLE`, details con cuentaId
  - `MovimientosExcedenLimiteError` → 422, `LIBRO_MAYOR_RANGO_EXCEDIDO`, details con cantidad/limite
  - `PeriodoNoEncontradoError` → 404, `LIBRO_MAYOR_PERIODO_NO_ENCONTRADO`, details con periodoFiscalId
  - `CuentaNoEncontradaError` → 404, `LIBRO_MAYOR_CUENTA_NO_ENCONTRADA`, details con cuentaId
  > REQ-LM-01, REQ-LM-07, REQ-LM-12, REQ-LM-13

- [ ] 1.2 **[GREEN]** Crear `reportes/domain/libro-mayor-errors.ts` con las 6 subclases.
  Espeja el patrón de `libro-diario-errors.ts` (mismas clases base: `ValidationError`,
  `NotFoundError`, `InvalidStateError` de `@/common/errors`). Códigos estables: `LIBRO_MAYOR_*`.
  Comentario regulatorio en `CuentaNoDetalleError`: solo cuentas `esDetalle=true` tienen
  movimientos directos (Código de Comercio art. 36, plan de cuentas analítico).
  > REQ-LM-01, REQ-LM-07, REQ-LM-12, REQ-LM-13

  _Commit sugerido_: `feat(reportes): DomainErrors libro-mayor con 6 subclases LIBRO_MAYOR_*`

---

## Fase 2 — Port + DTOs + mapper

- [ ] 2.1 **[setup]** Crear `reportes/ports/libro-mayor-reader.port.ts`:
  - `Symbol('LIBRO_MAYOR_READER_PORT')` exportado como `LIBRO_MAYOR_READER_PORT`
  - `LibroMayorFiltros`: `{ cuentaId?: string; fechaDesde: Date; fechaHasta: Date; incluirAnulados: boolean }`
  - `MovimientoMayorRow`: proyección plana del JOIN (cuentaId, codigoInterno, nombreCuenta,
    naturaleza, comprobanteId, numeroComprobante, fechaContable, glosa, glosaLinea, estado,
    anulado, orden, debitoBob: Decimal, creditoBob: Decimal)
  - `SaldoInicialRow`: `{ cuentaId, codigoInterno, nombreCuenta, naturaleza, totalDebitoBob: Decimal, totalCreditoBob: Decimal }`
  - `abstract class LibroMayorReaderPort` con 4 métodos: `contarMovimientos`, `obtenerMovimientos`,
    `obtenerSaldosIniciales`, `obtenerCuentaDetalle`
  - JSDoc en cada método (port es contrato público §2.3); comentario multi-tenant obligatorio (§4.2).
  > REQ-LM-01..13 (contrato base de todo el change)

- [ ] 2.2 **[setup]** Crear `reportes/dto/libro-mayor-query.dto.ts`:
  - `@IsOptional() @IsUUID('4') cuentaId?: string`
  - `@IsOptional() @IsUUID('4') periodoFiscalId?: string`
  - `@IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) fechaDesde?: string`
  - `@IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) fechaHasta?: string`
  - `@IsOptional() @Transform(→ boolean) @IsBoolean() incluirAnulados?: boolean` (default false)
  - `@IsOptional() @Transform(→ boolean) @IsBoolean() soloConMovimiento?: boolean` (default true)
  > REQ-LM-01, REQ-LM-03, REQ-LM-07, REQ-LM-08, REQ-LM-11

- [ ] 2.3 **[RED unit]** Crear `reportes/dto/libro-mayor-response.dto.spec.ts` — verifica
  la función pura `toLibroMayorResponse` (o el mapper que compute saldos ya calculados):
  - `Decimal → string` con 2 decimales fijos: `"1250.50"`, nunca `1250.5` (REQ-LM-10)
  - `Date UTC 00:00Z → "YYYY-MM-DD"` correcto con `formatFechaContable` (§4.6)
  - `glosaLinea: null` cuando la línea no tiene glosa propia (REQ-LM-10)
  - estructura anidada `cuentas[].movimientos[]` correcta
  - cuenta sin movimientos: `movimientos: []`, `saldoFinalBob === saldoInicialBob` (REQ-LM-06)
  - `totalDebeBob` y `totalHaberBob` reflejan la suma del rango (REQ-LM-06)
  > REQ-LM-06, REQ-LM-10

- [ ] 2.4 **[GREEN]** Crear `reportes/dto/libro-mayor-response.dto.ts`:
  - Interfaces: `MovimientoMayorDto`, `CuentaMayorDto`, `LibroMayorResponseDto` (forma exacta
    del spec REQ-LM-10). `generadoEn` **OMITIDO** del MVP (el Diario no lo tiene;
    el service no puede usar `new Date()` directo §4.6 y ClockPort no se inyecta en el mapper;
    el frontend lo agrega si necesita — decisión de diseño documentada en design.md OpenQuestion).
  - Función pura `toLibroMayorResponse(cuentas: CuentaMayorCalculada[], rango)` que recibe
    cuentas ya calculadas (saldos por naturaleza ya aplicados por el service) y serializa
    `Money/.toBob()` + `formatFechaContable` (reusa el patrón del Diario).
  - Helpers privados `formatFechaContable` (getUTC*, idéntico al Diario §4.6) y
    `decimalToString` (d.toFixed(2)) o importados si se extraen a shared.
  > REQ-LM-06, REQ-LM-10

  _Commit sugerido_: `feat(reportes): LibroMayorReaderPort + DTOs + mapper libro-mayor`

---

## Fase 3 — Service (corazón del cálculo)

- [ ] 3.1 **[RED unit]** Crear `reportes/libro-mayor.service.spec.ts` — mocks de
  `LibroMayorReaderPort` (4 métodos) + `PeriodosReaderPort` + `ConfigService` (con helper
  `makeConfigService(limit)` que inyecta el token con valor reducido para tests de tope).
  No se mockea Prisma directamente (§7.8). Fixture helpers: `makeMovimientoRow(overrides)`,
  `makeSaldoInicialRow(overrides)`.

  **Casos RED — validación de filtros** (REQ-LM-01):
  - Lanza `FiltroRequeridoError` si no se recibe ningún filtro de rango
  - Lanza `FiltroRequeridoError` si se reciben periodoFiscalId + fechaDesde simultáneamente
  - Lanza `FiltroRequeridoError` si fechaDesde sin fechaHasta (y viceversa)
  - Lanza `RangoInvalidoError` si fechaDesde > fechaHasta

  **Casos RED — resolución de período** (REQ-LM-13):
  - Lanza `PeriodoNoEncontradoError` si `obtenerRangoFechas` devuelve `null`
  - Resuelve periodoFiscalId → rango y pasa el rango al adapter

  **Casos RED — validación de cuenta** (REQ-LM-07):
  - Lanza `CuentaNoEncontradaError` (404) si `obtenerCuentaDetalle` devuelve `null`
  - Lanza `CuentaNoDetalleError` (400) si `obtenerCuentaDetalle` devuelve cuenta con `esDetalle=false`
  - No llama a `obtenerCuentaDetalle` si cuentaId no viene en el query

  **Casos RED — tope defensivo** (REQ-LM-12):
  - Lanza `MovimientosExcedenLimiteError` (422) si `contarMovimientos` > limit inyectado
  - No lanza si count === limit (exacto al límite)
  - No llama a `obtenerMovimientos` si el tope se excede

  **Casos RED — saldo inicial por naturaleza** (REQ-LM-04):
  - DEUDORA: saldoInicial = totalDebitoBob − totalCreditoBob (resultado positivo, ej. 700)
  - ACREEDORA: saldoInicial = totalCreditoBob − totalDebitoBob (resultado positivo, ej. 600)
  - Saldo inicial negativo válido (cuenta DEUDORA con más créditos que débitos → "-300.00")
  - Sin historial previo: `saldoInicialBob === "0.00"` (saldoInicialRow ausente)

  **Casos RED — running balance** (REQ-LM-05):
  - DEUDORA con saldoInicial 500: 3 movimientos (debe 200, haber 100, debe 50)
    → saldoCorriente: "700.00", "600.00", "650.00"
  - ACREEDORA con saldoInicial 1000: 2 movimientos (haber 500, debe 200)
    → saldoCorriente: "1500.00", "1300.00"
  - Determinismo: 2 movimientos misma fecha; el adapter ya los entrega en orden → el service
    confía en ese orden y el saldo corriente es determinístico

  **Casos RED — saldo final** (REQ-LM-06):
  - saldoFinalBob coincide con saldoCorriente del último movimiento
  - Sin movimientos en el rango: saldoFinalBob === saldoInicialBob, movimientos: []

  **Casos RED — soloConMovimiento** (REQ-LM-08):
  - `soloConMovimiento=true` (default): cuenta con saldoInicial pero sin movimientos en el rango → excluida
  - `soloConMovimiento=false`: cuenta con saldoInicial ≠ 0 pero sin movimientos → incluida con
    `movimientos: []`, `saldoFinalBob === saldoInicialBob`
  - `soloConMovimiento=false`: cuenta con saldoInicial === 0 y sin movimientos → excluida

  **Caso RED — sin cuentaId (todas las cuentas)** (REQ-LM-08):
  - No llama a `obtenerCuentaDetalle` cuando no hay cuentaId
  - Respuesta con `cuentas: []` cuando no hay movimientos ni saldos previos (no error)

  > REQ-LM-01, REQ-LM-04, REQ-LM-05, REQ-LM-06, REQ-LM-07, REQ-LM-08, REQ-LM-12, REQ-LM-13

- [ ] 3.2 **[GREEN]** Crear `reportes/libro-mayor.service.ts`:
  - Constantes exportadas: `LIBRO_MAYOR_MAX_MOVIMIENTOS_ENV = 'LIBRO_MAYOR_MAX_MOVIMIENTOS'`,
    `LIBRO_MAYOR_MAX_MOVIMIENTOS_DEFAULT = 20_000`. Default documentado: 20.000 líneas
    (unidad es línea, no asiento; ~2-4 líneas por asiento implica ≈5.000–10.000 asientos).
  - `@Inject(LIBRO_MAYOR_READER_PORT)` + `@Inject(PERIODOS_READER_PORT)` + `ConfigService`.
  - Método `consultarLibroMayor(tenantId, query)` que orquesta:
    1. Validación XOR filtro de forma (DomainErrors §1.2)
    2. Resolución periodoFiscalId → rango (PeriodosReaderPort) o parseFechaContable
    3. Si cuentaId → `obtenerCuentaDetalle` → null→404, esDetalle=false→400
    4. `contarMovimientos` → tope (422 si excede)
    5. `obtenerSaldosIniciales` + `obtenerMovimientos` (en paralelo — sin dependencia entre sí)
    6. Agrupar movimientos por cuentaId (Map)
    7. Determinar set de cuentas (movimientos ∪ saldosIniciales≠0 según soloConMovimiento)
    8. Por cada cuenta: calcular saldoInicial con signo (Money, naturaleza), running balance
       (algoritmo del design §Decisión 3), saldoFinal, totalesDebe/Haber
    9. Ordenar cuentas por codigoInterno ASC (REQ-LM-08)
    10. Mapear → `LibroMayorResponseDto` (toLibroMayorResponse o mapeo inline)
  - Función privada `calcularSaldoInicial(row: SaldoInicialRow): Money` — aplica signo por naturaleza.
  - Función privada `calcularRunningBalance(movimientos, saldoInicial, naturaleza)` — acumula con Money.
  - `parseFechaContable` (idéntico al del Diario — puede importarse si se extrae a shared o copiarse).
  > REQ-LM-01, REQ-LM-04, REQ-LM-05, REQ-LM-06, REQ-LM-07, REQ-LM-08, REQ-LM-12, REQ-LM-13

  _Commit sugerido_: `feat(reportes): LibroMayorService — running balance, saldo inicial, soloConMovimiento`

---

## Fase 4 — Adapter Prisma (`$queryRaw`)

> ⚠️ **Requiere Postgres** (`docker compose up -d postgres`).
> Correr desde `backend/`: `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" pnpm exec jest src/reportes/adapters/prisma-libro-mayor-reader.adapter.integration.spec.ts --runInBand`

- [ ] 4.1 **[RED integration]** Crear `reportes/adapters/prisma-libro-mayor-reader.adapter.integration.spec.ts`.
  Patrón idéntico al de `prisma-comprobantes-reader.adapter.integration.spec.ts`:
  `beforeAll` crea `PrismaClient` + adapter; `beforeEach` hace cleanup + seed de 2 tenants
  con gestión/período/cuentas (2 DEUDORA + 2 ACREEDORA, una cuenta agrupadora para test de detalle);
  `afterAll` cleanup + `$disconnect`.

  **Helpers de seed**: `crearMovimientoContabilizado(tenantId, periodoId, cuentaDeId, cuentaHaberId, fecha, debeBob, creditoBob, anulado?)`

  **Casos RED — `contarMovimientos`** (REQ-LM-12):
  - Cuenta solo líneas de CONTABILIZADO/BLOQUEADO, excluye BORRADOR
  - Respeta `incluirAnulados`: sin flag → excluye anulados; con flag → los incluye
  - Respeta `cuentaId`: cuenta solo líneas de esa cuenta
  - Cuenta por tenant (2 tenants con misma fecha → counts separados y correctos)

  **Casos RED — `obtenerMovimientos`** (REQ-LM-02, REQ-LM-03, REQ-LM-05, REQ-LM-09):
  - BORRADOR nunca aparece en movimientos (REQ-LM-02)
  - Sin `incluirAnulados`: anulados excluidos; con flag: incluidos con `anulado=true` (REQ-LM-03)
  - Orden correcto: cuentaId → fechaContable ASC → numeroComprobante ASC NULLS LAST → id ASC → orden ASC (REQ-LM-05)
  - **CRÍTICO — aislamiento multi-tenant (Anti-31)**: 2 tenants, misma fecha, mismos códigos de cuenta
    → query de Tenant A devuelve SOLO movimientos de Tenant A (REQ-LM-09)
  - Filtro `cuentaId`: devuelve solo líneas de esa cuenta cuando está presente
  - Campos proyectados correctos: `naturaleza`, `glosaLinea: null` cuando vacío, `debitoBob`/`creditoBob`
    como Decimal, `fechaContable` como Date UTC

  **Casos RED — `obtenerSaldosIniciales`** (REQ-LM-04, REQ-LM-09):
  - Suma histórica `< fechaDesde`: líneas con fecha en enero → no aparecen en saldo inicial de consulta de febrero
  - Líneas con fecha en diciembre anterior → aparecen en saldo inicial de consulta de enero
  - BORRADOR excluido del saldo inicial (REQ-LM-02)
  - Sin `incluirAnulados`: anulados excluidos del saldo inicial (REQ-LM-03)
  - **CRÍTICO — multi-tenant**: 2 tenants, misma cuenta código → `obtenerSaldosIniciales` de Tenant A
    devuelve solo SUMs de Tenant A (REQ-LM-09)
  - `cuentaId` presente: devuelve solo la fila de esa cuenta
  - Cuenta sin historial previo → no aparece en el resultado (array vacío o sin esa fila)

  **Casos RED — `obtenerCuentaDetalle`** (REQ-LM-07):
  - Devuelve `{ id, esDetalle: true }` para cuenta de detalle del tenant
  - Devuelve cuenta con `esDetalle: false` para cuenta agrupadora del tenant
  - Devuelve `null` si el cuentaId no existe
  - Devuelve `null` si el cuentaId pertenece a otro tenant (defense in depth §4.2)
  > REQ-LM-02, REQ-LM-03, REQ-LM-04, REQ-LM-05, REQ-LM-07, REQ-LM-09, REQ-LM-12

- [ ] 4.2 **[GREEN]** Crear `reportes/adapters/prisma-libro-mayor-reader.adapter.ts`:
  - `@Injectable() class PrismaLibroMayorReaderAdapter extends LibroMayorReaderPort`
  - Constructor: `@InjectPrismaService() prisma: PrismaService` (o `PrismaClient` según patrón del módulo).
  - `contarMovimientos`: `$queryRaw<[{count: bigint}]>` → convierte `Number(count)`.
  - `obtenerMovimientos`: `$queryRaw<MovimientoMayorRow[]>` con el SQL del design §Interfaces.
    Construcción del SQL: `$queryRaw` template tag con parámetros posicionales. Manejo condicional
    de `cuentaId` y `incluirAnulados` mediante SQL dinámico tipado (misma técnica que Diario si la usó,
    o composición de template literals condicionalmente). **Defense in depth** (§4.2, Anti-31):
    `lc."organizationId" = ${tenantId}` como PRIMER predicado, comentario regulatorio obligatorio.
    Estado FIJO: `c.estado IN ('CONTABILIZADO','BLOQUEADO')` — nunca parametrizable.
  - `obtenerSaldosIniciales`: `$queryRaw<SaldoInicialRow[]>` — mismo tenant/estado/anulados,
    `c."fechaContable" < ${fechaDesde}`, `GROUP BY cu.id, cu."codigoInterno", cu.nombre, cu.naturaleza`.
    `COALESCE(SUM(...), 0)` — Postgres devuelve `null` si la cuenta no tiene filas; el `0` evita
    nulls inesperados. Mapear `bigint`/`string` del `$queryRaw` a `Decimal` con cuidado (Postgres
    devuelve `numeric` como `string` en `$queryRaw` — construir `new Decimal(row.totalDebitoBob)` en
    el adapter antes de devolver).
  - `obtenerCuentaDetalle`: Prisma `findFirst` (no necesita `$queryRaw` — simple lookup por PK con
    `where: { id: cuentaId, organizationId: tenantId }`). Devuelve `{ id, esDetalle }` o `null`.
  > REQ-LM-02, REQ-LM-03, REQ-LM-04, REQ-LM-05, REQ-LM-07, REQ-LM-09, REQ-LM-12

  _Commit sugerido_: `feat(reportes): PrismaLibroMayorReaderAdapter — $queryRaw JOIN multi-tenant`

---

## Fase 5 — Controller + wiring

- [ ] 5.1 **[GREEN]** Modificar `reportes/reportes.controller.ts`:
  - Agregar `LibroMayorService` al constructor (junto a `LibroDiarioService`).
  - Agregar método `@Get('mayor')`:
    ```typescript
    @Get('mayor')
    @RequirePermissions('contabilidad.libro-mayor.read')
    @ApiOperation({ summary: 'Libro Mayor: vista por cuenta ...' })
    obtenerLibroMayor(@Req() req, @Query() query: LibroMayorQueryDto) { ... }
    ```
  - Reusa `resolveTenantId(req)` ya existente.
  - Spread condicional para opcionales (`cuentaId`, `periodoFiscalId`, `fechaDesde`, `fechaHasta`)
    por `exactOptionalPropertyTypes` activo (§2.5.1).
  - Delegación directa a `LibroMayorService.consultarLibroMayor(tenantId, query-shaped-obj)`.
  - Sin lógica en el controller (solo resuelve tenant + spread + delega).
  - Guards heredados del clase: `AuthGuard('jwt')`, `ModuleEnabledGuard`, `PermissionsGuard`.
  - `@RequireModule('contabilidad')` heredado del clase.
  > REQ-LM-11

- [ ] 5.2 **[GREEN]** Modificar `reportes/reportes.module.ts`:
  - Agregar `LibroMayorService` a `providers`.
  - Agregar `PrismaLibroMayorReaderAdapter` a `providers`.
  - Agregar binding: `{ provide: LIBRO_MAYOR_READER_PORT, useExisting: PrismaLibroMayorReaderAdapter }`.
  - Imports existentes (`RbacModule`, `PeriodosReaderModule`) ya cubren las dependencias.
  > REQ-LM-11 (wiring del módulo)

  _Commit sugerido_: `feat(reportes): controller GET /libros/mayor + wiring ReportesModule`

---

## Fase 6 — E2E

> ⚠️ **Requiere Postgres** (`docker compose up -d postgres redis`).
> Correr desde `backend/`:
> ```bash
> DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" \
> JWT_ACCESS_SECRET="test-secret" \
> JWT_REFRESH_SECRET="test-refresh" \
> pnpm exec jest test/libro-mayor.e2e-spec.ts --runInBand --forceExit
> ```

- [ ] 6.1 **[RED e2e]** Crear `backend/test/libro-mayor.e2e-spec.ts`.
  Patrón idéntico al `libro-diario.e2e-spec.ts` (AppModule, cleanupTestData, `seedTenant`).
  Helpers adicionales: `seedCuentaAgrupadora`, `seedMovimientoConFechaAnterior` (para saldo inicial).

  **Casos RED — RBAC** (REQ-LM-11):
  - `GET /api/libros/mayor` sin JWT → 401
  - Con JWT sin `contabilidad.libro-mayor.read` → 403
  - Con JWT y permiso + filtro válido → 200

  **Casos RED — filtros** (REQ-LM-01):
  - Sin ningún filtro → 400, code `LIBRO_MAYOR_FILTRO_INVALIDO`
  - Ambos periodoFiscalId + fechaDesde → 400, code `LIBRO_MAYOR_FILTRO_INVALIDO`
  - fechaDesde sin fechaHasta → 400, code `LIBRO_MAYOR_FILTRO_INVALIDO`
  - periodoFiscalId inexistente → 404, code `LIBRO_MAYOR_PERIODO_NO_ENCONTRADO` (REQ-LM-13)
  - periodoFiscalId de otro tenant → 404, code `LIBRO_MAYOR_PERIODO_NO_ENCONTRADO`
  - fechaDesde > fechaHasta → 400, code `LIBRO_MAYOR_RANGO_INVALIDO`

  **Casos RED — cuenta agrupadora** (REQ-LM-07):
  - cuentaId de cuenta agrupadora → 400, code `LIBRO_MAYOR_CUENTA_NO_DETALLE`
  - cuentaId inexistente → 404, code `LIBRO_MAYOR_CUENTA_NO_ENCONTRADA`

  **Casos RED — respuesta correcta** (REQ-LM-04, REQ-LM-05, REQ-LM-06, REQ-LM-10):
  - Happy path `fechaDesde`+`fechaHasta`: responde 200 con `cuentas` bien formadas
  - Cuenta DEUDORA: saldo inicial calculado correctamente (movimientos previos al rango)
  - Cuenta ACREEDORA: saldo inicial calculado con signo correcto
  - saldoFinalBob coincide con saldoCorriente del último movimiento del rango
  - BORRADOR excluido de movimientos y de saldo inicial (REQ-LM-02)
  - `incluirAnulados=true`: anulados aparecen con `"anulado": true` (REQ-LM-03)
  - `soloConMovimiento=false`: cuenta con saldo previo pero sin movimientos en el rango aparece
    con `movimientos: []` y `saldoFinalBob === saldoInicialBob` (REQ-LM-08)
  - Sin cuentaId: responde todas las cuentas con movimiento (REQ-LM-08)
  - Montos como string: `debeBob`, `haberBob`, `saldoCorrienteBob`, `saldoInicialBob`,
    `saldoFinalBob` son strings `"NNN.NN"`, no números (REQ-LM-10)

  **Caso RED — aislamiento multi-tenant (CRÍTICO)** (REQ-LM-09):
  - 2 tenants con misma cuenta código, movimientos en el mismo rango de fechas
  - Tenant A consulta → respuesta contiene SOLO movimientos de Tenant A
  - `saldoInicialBob` de Tenant A no incluye movimientos de Tenant B

  **Caso RED — tope** (REQ-LM-12):
  - Superar el límite inyectado → 422, code `LIBRO_MAYOR_RANGO_EXCEDIDO`, mensaje legible en español
  > REQ-LM-01..13 (cobertura E2E transversal)

- [ ] 6.2 **[GREEN]** Hacer pasar todos los E2E del 6.1. Las implementaciones de Fase 3, 4 y 5
  ya deben estar verdes; este paso es confirmar que el stack completo (AppModule) funciona end-to-end.
  Si algún caso falla, ajustar la implementación correspondiente (NO ajustar el test).

  _Commit sugerido_: `feat(reportes): E2E libro-mayor (happy path, RBAC, filtros, saldo inicial, multi-tenant)`

---

## Fase 7 — Verde final

> Correr todos desde `backend/` (salvo que se indique `frontend/`).

- [ ] 7.1 **[verde — unit + integration]** `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" pnpm exec jest src/ --runInBand`
  — unit (`.spec.ts` sin DB) + integration (`.integration.spec.ts` vs Postgres real). Todo verde.
  GOTCHA: integration specs requieren Postgres en `127.0.0.1` (NO `localhost`) — §11.3 CLAUDE.md.

- [ ] 7.2 **[verde — E2E]** `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/ --runInBand --forceExit`
  — suite E2E completa (Diario + Mayor). Sin regresiones en el Diario.

- [ ] 7.3 **[verde — typecheck]** `pnpm exec tsc --noEmit -p tsconfig.json` desde `backend/`.
  Cero errores. `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` activos (§2.5.1).

- [ ] 7.4 **[verde — lint]** `pnpm run lint` desde `backend/`. Cero warnings/errors ESLint.
  Verificar que no hay `any` en código de producción (§2.5) ni `new Date()` en service (§4.6).

---

## Resumen de tareas por fase

| Fase | Tareas | Tipo |
|------|--------|------|
| 1 — Dominio y errores | 1.1, 1.2 | RED unit → GREEN |
| 2 — Port + DTOs + mapper | 2.1, 2.2, 2.3, 2.4 | setup + RED unit → GREEN |
| 3 — Service | 3.1, 3.2 | RED unit → GREEN |
| 4 — Adapter Prisma | 4.1, 4.2 | RED integration (Postgres) → GREEN |
| 5 — Controller + wiring | 5.1, 5.2 | GREEN (cubierto por E2E) |
| 6 — E2E | 6.1, 6.2 | RED e2e (Postgres) → GREEN |
| 7 — Verde final | 7.1, 7.2, 7.3, 7.4 | verificación |
| **Total** | **16** | |

## Archivos nuevos y modificados

| Archivo | Acción |
|---------|--------|
| `backend/src/reportes/domain/libro-mayor-errors.ts` | Crear |
| `backend/src/reportes/domain/libro-mayor-errors.spec.ts` | Crear |
| `backend/src/reportes/ports/libro-mayor-reader.port.ts` | Crear |
| `backend/src/reportes/dto/libro-mayor-query.dto.ts` | Crear |
| `backend/src/reportes/dto/libro-mayor-response.dto.ts` | Crear |
| `backend/src/reportes/dto/libro-mayor-response.dto.spec.ts` | Crear |
| `backend/src/reportes/libro-mayor.service.ts` | Crear |
| `backend/src/reportes/libro-mayor.service.spec.ts` | Crear |
| `backend/src/reportes/adapters/prisma-libro-mayor-reader.adapter.ts` | Crear |
| `backend/src/reportes/adapters/prisma-libro-mayor-reader.adapter.integration.spec.ts` | Crear |
| `backend/src/reportes/reportes.controller.ts` | Modificar |
| `backend/src/reportes/reportes.module.ts` | Modificar |
| `backend/test/libro-mayor.e2e-spec.ts` | Crear |

Sin migración. Sin tocar `schema.prisma`, `app.module.ts` ni `periodos-reader.port.ts`.
