# Tasks: Balance General (módulo `reportes`) — backend-only

> Strict TDD Mode: RED → GREEN por tarea de implementación.
> Conventional commit scope: `reportes` (singular).
> Sin migración — cero cambios en `schema.prisma` ni en `app.module.ts`.
> La única extensión cross-módulo es **aditiva**: 2 métodos nuevos en
> `PeriodosReaderPort` + su adapter (no rompe ningún consumidor existente).
>
> **Decisiones cerradas aplicadas:**
> - Endpoint: `GET /api/eeff/balance?fecha=YYYY-MM-DD` en `EeffController`
>   separado con `@Controller('eeff')`, mismo módulo `reportes/`.
> - Port: `BalanceReaderPort` con 3 métodos (no reutiliza `LibroMayorReaderPort`).
> - Resultado del Ejercicio como **línea sintética** (`cuentaId:null`,
>   `esSintetica:true`) en PATRIMONIO_RESULTADOS. No se inyecta en saldo real.
> - Helper `calcularSaldoNeto` extraído a `reportes/domain/saldo-naturaleza.ts`,
>   reutilizado por Mayor y Balance (safety net = suite del Mayor sin tocar).
> - Errores con prefijo `REPORTES_BALANCE_*` (spec usa este prefijo; difiere de
>   `LIBRO_MAYOR_*` porque el design lo ratifica explícitamente para EEFF).
> - `GestionNoEncontradaError` → HTTP 422 (spec REQ-BG-02 dice 422; design §8
>   dice 404). **Decisión**: usar **422** (spec prevalece; es más correcto
>   semánticamente: la petición es válida pero la entidad de negocio no existe
>   para ese parámetro).

---

## Fase 1 — Refactor helper `saldo-naturaleza.ts` (RED→GREEN, safety net Mayor)

> Extracción pura sin cambio funcional. El safety net son los tests existentes del
> Mayor: `libro-mayor.service.spec.ts` + `prisma-libro-mayor-reader.adapter.integration.spec.ts`.
> No se tocan esos tests — si fallan, el refactor introdujo un bug.
>
> REQ cubiertos: REQ-BG-16

- [x] 1.1 **[RED unit]** Crear `reportes/domain/saldo-naturaleza.spec.ts`.
  Casos mínimos que deben pasar en RED antes de crear el archivo de producción:
  - DEUDORA: `calcularSaldoNeto(debe=5000, haber=1200, DEUDORA)` → `"3800.00"`
  - ACREEDORA: `calcularSaldoNeto(debe=2000, haber=8000, ACREEDORA)` → `"6000.00"`
  - Saldo negativo válido: DEUDORA con más créditos que débitos → resultado negativo
  - Cero: ambos lados iguales → `"0.00"`
  - Parámetros como `Decimal`, `string` y `Money` (el helper acepta los 3)
  > REQ-BG-16, REQ-BG-05

- [x] 1.2 **[GREEN]** Crear `reportes/domain/saldo-naturaleza.ts`.
  Extraer la lógica de `calcularSaldoInicial` de `libro-mayor.service.ts`
  (líneas 320-337) como función pura exportada `calcularSaldoNeto(debe, haber,
  naturaleza): Money`. Sin cambio de comportamiento. Comentario regulatorio
  obligatorio: `// Código Tributario art. 47: la naturaleza determina el signo del saldo.`
  y referencia a NCB para naturaleza DEUDORA/ACREEDORA.
  > REQ-BG-16

- [x] 1.3 **[GREEN — refactor Mayor]** Modificar `reportes/libro-mayor.service.ts`:
  reemplazar la función privada `calcularSaldoInicial(row)` por una llamada a
  `calcularSaldoNeto(row.totalDebitoBob, row.totalCreditoBob, row.naturaleza)`.
  **Verificar que `libro-mayor.service.spec.ts` sigue en verde sin ningún cambio.**
  Sin cambios funcionales.
  > REQ-BG-16

  _Verificación_: `pnpm exec jest src/reportes/domain/saldo-naturaleza.spec.ts
  src/reportes/libro-mayor.service.spec.ts` — todo verde.

  _Commit sugerido_: `refactor(reportes): extraer calcularSaldoNeto a saldo-naturaleza.ts`

---

## Fase 2 — Extensión `PeriodosReaderPort` para rango de gestión

> Dos métodos nuevos en el port `periodos-fiscales`. Aditivo: no rompe a
> `comprobantes` ni `reportes` existentes.
>
> REQ cubiertos: REQ-BG-02, REQ-BG-09

- [x] 2.1 **[setup]** Modificar `periodos-fiscales/ports/periodos-reader.port.ts`:
  agregar 2 métodos abstractos nuevos al final de `PeriodosReaderPort`:

  ```typescript
  /**
   * Rango calendario [desde, hasta] de la GESTIÓN fiscal (año fiscal completo)
   * que contiene la fecha dada. Deriva de GestionFiscal.year + mesInicio +
   * períodos asociados. Retorna null si el tenant no tiene gestión que cubra
   * esa fecha.
   * Consumido por `reportes` para acotar el Resultado del Ejercicio del Balance
   * (REQ-BG-02, REQ-BG-09).
   */
  abstract obtenerRangoGestionPorFecha(
    tenantId: string,
    fecha: Date,
  ): Promise<{ gestionId: string; desde: Date; hasta: Date } | null>;

  /**
   * Igual, pero por gestionId explícito (cuando el cliente lo pasa como
   * parámetro opcional en el query). Defense in depth §4.2: scoped al tenant.
   */
  abstract obtenerRangoGestion(
    tenantId: string,
    gestionId: string,
  ): Promise<{ desde: Date; hasta: Date } | null>;
  ```
  > REQ-BG-02

- [x] 2.2 **[RED integration]** Agregar casos a
  `periodos-fiscales/adapters/prisma-periodos-reader.adapter.integration.spec.ts`
  (o crear si no tiene suficientes casos para los nuevos métodos). Casos RED para
  `obtenerRangoGestionPorFecha`:
  - Fecha dentro de una gestión abierta: devuelve `{ gestionId, desde, hasta }` con
    el rango correcto del año fiscal (primer día del `mesInicio` al último día del mes 12).
  - Fecha sin gestión: devuelve `null`.
  - Defense in depth: fecha del tenant A no retorna gestión del tenant B.
  Casos RED para `obtenerRangoGestion`:
  - `gestionId` existente del tenant: devuelve rango.
  - `gestionId` de otro tenant: devuelve `null`.
  - `gestionId` inexistente: devuelve `null`.
  > REQ-BG-02

- [x] 2.3 **[GREEN]** Implementar los 2 métodos en
  `periodos-fiscales/adapters/prisma-periodos-reader.adapter.ts`.
  - `obtenerRangoGestionPorFecha`: `prisma.gestionFiscal.findFirst` filtrando por
    `organizationId` + rango que cubra la fecha. Derivar `desde`/`hasta` de
    `GestionFiscal.year` + `mesInicio` usando los períodos de la gestión
    (`MIN(year,month)` → `MAX(year,month)` de `PeriodoFiscal` asociados), o
    calculando `mesInicio..mesInicio+11` modular. Fecha calendario puro UTC (§4.6).
    Comentario: `// Defense in depth (§4.2): organizationId primer predicado.`
  - `obtenerRangoGestion`: `prisma.gestionFiscal.findFirst` por `id + organizationId`,
    mismo cálculo de rango.
  > REQ-BG-02

  _Verificación_: `DATABASE_URL=... pnpm exec jest src/periodos-fiscales/adapters/
  prisma-periodos-reader.adapter.integration.spec.ts --runInBand` — verde.

  _Commit sugerido_: `feat(reportes): extender PeriodosReaderPort con obtenerRangoGestion*`

---

## Fase 3 — DomainErrors Balance

> REQ cubiertos: REQ-BG-01, REQ-BG-02

- [x] 3.1 **[RED unit]** Crear `reportes/domain/balance-errors.spec.ts`.
  Verifica `httpStatus`, `code` y shape de `details` de cada error:
  - `FechaCorteInvalidaError` → HTTP 400, `REPORTES_BALANCE_FECHA_INVALIDA`
  - `GestionNoEncontradaError` → HTTP 422, `REPORTES_BALANCE_SIN_GESTION`,
    incluye la `fecha` en `details`
  > REQ-BG-01, REQ-BG-02

- [x] 3.2 **[GREEN]** Crear `reportes/domain/balance-errors.ts`.
  Dos subclases:
  - `FechaCorteInvalidaError extends ValidationError` — code `REPORTES_BALANCE_FECHA_INVALIDA`.
    Mensaje en español: `"La fecha de corte debe tener formato YYYY-MM-DD"`.
  - `GestionNoEncontradaError extends InvalidStateError` — code `REPORTES_BALANCE_SIN_GESTION`.
    HTTP 422. Mensaje en español: `"No existe una gestión fiscal que cubra la fecha indicada"`.
    `details: { fecha: string }`.
  Espeja el patrón de `libro-mayor-errors.ts` (mismas clases base de `@/common/errors`).
  Comentario: `// NCB art. 36: el Balance debe estar asociado a una gestión fiscal activa.`
  > REQ-BG-01, REQ-BG-02

  _Commit sugerido_: `feat(reportes): DomainErrors balance-general REPORTES_BALANCE_*`

---

## Fase 4 — Port + DTOs + mapper Balance

> REQ cubiertos: REQ-BG-01, REQ-BG-03..05, REQ-BG-11..15

- [x] 4.1 **[setup]** Crear `reportes/ports/balance-reader.port.ts`.
  - `export const BALANCE_READER_PORT = Symbol('BALANCE_READER_PORT')`
  - Interfaces:
    - `SaldoCuentaRow`: `{ cuentaId: string; totalDebitoBob: Decimal; totalCreditoBob: Decimal }`
    - `CuentaEstructuraRow`: `{ id, parentId, nivel, esDetalle, esContraria, claseCuenta,
      subClaseCuenta, naturaleza, codigoInterno, nombre }`
    - `BalanceFiltros`: `{ fechaCorte: Date; incluirAnulados: boolean }`
  - `abstract class BalanceReaderPort` con 3 métodos abstractos:
    - `obtenerSaldosHasta(tenantId, filtros): Promise<SaldoCuentaRow[]>` — saldos ≤ fechaCorte
    - `obtenerSaldosEnRango(tenantId, desde, hasta, incluirAnulados): Promise<SaldoCuentaRow[]>`
    - `obtenerEstructuraCuentas(tenantId): Promise<CuentaEstructuraRow[]>`
  - JSDoc en cada método (port es contrato público §2.3); comentario multi-tenant en los 3
    (`// organizationId SIEMPRE primer predicado (§4.2 Anti-31)`).
  > REQ-BG-03..05, REQ-BG-12 (contrato base)

- [x] 4.2 **[setup]** Crear `reportes/dto/balance-query.dto.ts`.
  - `@IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) fecha: string` — REQUERIDO
  - `@IsOptional() @IsUUID('4') gestionId?: string`
  - `@IsOptional() @Transform(boolBuilder) @IsBoolean() incluirAnulados?: boolean` (default false)
  > REQ-BG-01, REQ-BG-04

- [x] 4.3 **[RED unit]** Crear `reportes/dto/balance-response.dto.spec.ts`.
  Verifica el mapper/función pura que construye el DTO desde datos calculados:
  - `Money → string` con 2 decimales fijos: `"1250.50"`, nunca `1250.5` (REQ-BG-15)
  - Fecha `Date UTC 00:00Z → "YYYY-MM-DD"` correcto con `formatFechaContable` (§4.6)
  - Estructura `activo.subSecciones[].grupos[].cuentas[]` correcta (REQ-BG-10, REQ-BG-15)
  - `resultadoEjercicioBob` como string decimal (REQ-BG-09)
  - `cuadra: true` cuando diferencia ≤ 0.01; `cuadra: false` con diferencia en string (REQ-BG-11)
  - Línea sintética: `cuentaId: null`, `esSintetica: true` en PATRIMONIO_RESULTADOS (REQ-BG-09)
  > REQ-BG-09, REQ-BG-11, REQ-BG-15

- [x] 4.4 **[GREEN]** Crear `reportes/dto/balance-response.dto.ts`.
  - Interfaces internas de tipos calculados con `Money` (separados de los DTO de respuesta).
  - Interfaces DTO de respuesta: `CuentaBalanceDto`, `GrupoBalanceDto`,
    `SubseccionBalanceDto`, `SeccionBalanceDto`, `BalanceResponseDto`
    según el contrato de §7.2 del design.
  - Función pura exportada (o mapper) que serializa `Money → string` y `Date → "YYYY-MM-DD"`.
  - `formatFechaContable` reutilizada de `libro-mayor-response.dto.ts` (si no se extrae
    a shared, copiar el helper idéntico con un comentario que apunte al original — §4.6).
  > REQ-BG-09, REQ-BG-11, REQ-BG-15

  _Commit sugerido_: `feat(reportes): BalanceReaderPort + DTOs + mapper balance-general`

---

## Fase 5 — Dominio `balance-arbol.ts` (propagación, esContraria, cuadre)

> Corazón de la lógica de dominio nueva. Cero NestJS, cero Prisma. Testeable
> en aislamiento total. Cobertura objetivo ≥ 95% (§7.5 CLAUDE.md).
>
> REQ cubiertos: REQ-BG-05..09, REQ-BG-11

- [x] 5.1 **[RED unit]** Crear `reportes/domain/balance-arbol.spec.ts`.
  Fixtures: helpers `makeCuentaEstructura(overrides)` y `makeSaldo(cuentaId, debe, haber)`.
  Verificar que los tests fallan antes de existir `balance-arbol.ts`.

  **Casos RED — saldo neto de hoja** (REQ-BG-05):
  - Hoja DEUDORA: saldo = debe − haber (positivo)
  - Hoja ACREEDORA: saldo = haber − debe (positivo)
  - Hoja sin fila en saldos (no aparece en GROUP BY) → saldo = 0

  **Casos RED — propagación jerárquica** (REQ-BG-06):
  - Árbol 3 niveles Activo: `1` → `1.1` → `[1.1.01, 1.1.02]` → saldo de `1.1` = suma
    de hojas; saldo de `1` = suma de sus hijos de nivel 2
  - Árbol 4 niveles: sin doble conteo (REQ-BG-06b) — `1` no suma `1.1` más `1.1.01`
    por separado
  - Agrupador con un solo hijo: propagación correcta

  **Casos RED — esContraria** (REQ-BG-07, CRÍTICO):
  - Depreciación Acumulada en ACTIVO_NO_CORRIENTE: `esContraria=true`, ACREEDORA,
    saldo neto = Bs 2000 → el agrupador `1.2` tiene saldo = 8000 − 2000 = 6000
  - Cuenta con `esContraria=true` y saldo 0 → no afecta al grupo
  - Grupo sin cuentas contrarias → todos los saldos se suman normalmente

  **Casos RED — omisión de saldo 0** (REQ-BG-08):
  - Hoja con saldo 0 → omitida del reporte
  - Agrupador con todos los hijos en saldo 0 → omitido también
  - Agrupador con ≥1 hijo con saldo ≠ 0 → presente aunque tenga otros hijos en 0

  **Casos RED — Resultado del Ejercicio** (REQ-BG-09):
  - `Σ saldoNeto(INGRESO) − Σ saldoNeto(EGRESO)` = correcto con datos de fixture
  - Resultado negativo (pérdida) → string negativo `"-10000.00"` en patrimonio
  - Línea sintética en PATRIMONIO_RESULTADOS: `cuentaId: null`, `esSintetica: true`
  - Cuentas INGRESO/EGRESO NO aparecen en el árbol de Balance (no se cuelgan)

  **Casos RED — cuadre de ecuación contable** (REQ-BG-11):
  - Activo = Pasivo + Patrimonio: `cuadra=true`, `diferencia="0.00"`
  - Descuadre de Bs 1.50: `cuadra=false`, `diferencia="1.50"` (respuesta 200, no error)
  - Diferencia dentro de tolerancia (±0.01): `cuadra=true`
  - Comentario regulatorio obligatorio en el código del cuadre:
    `// Código Tributario art. 47: Activo = Pasivo + Patrimonio (ecuación de la partida doble).`
  > REQ-BG-05, REQ-BG-06, REQ-BG-06b, REQ-BG-07, REQ-BG-08, REQ-BG-09, REQ-BG-11

- [x] 5.2 **[GREEN]** Crear `reportes/domain/balance-arbol.ts`.
  Función(es) puras exportadas — cero `@Injectable()`, cero `import` de NestJS/Prisma.
  Algoritmo (ver design §5.2):
  1. Para cada cuenta hoja: cruzar con `saldosHasta`; aplicar `calcularSaldoNeto`
     (importado de `saldo-naturaleza.ts`).
  2. Indexar cuentas por `id` y por `parentId` (Map de hijos).
  3. Propagar de hojas a agrupadores recorriendo por nivel descendente
     (nivel máximo primero → nivel 1 al final).
  4. Al propagar: hijo con `esContraria=true` RESTA; hijo normal SUMA.
     Solo `esDetalle=true` tiene saldo propio.
  5. Ensamblar secciones por `claseCuenta` → `subClaseCuenta`.
     INGRESO/EGRESO NO se incluyen en el árbol.
  6. Omitir hojas con saldo 0; omitir agrupadores sin descendientes con saldo.
  7. Calcular Resultado del Ejercicio (sobre `saldosGestion`); insertar como
     línea sintética en PATRIMONIO_RESULTADOS.
  8. Calcular cuadre: `|Activo − (Pasivo + Patrimonio)| ≤ Money.TOLERANCIA_BOB`.
  Todo con `Money` (decimal.js); serialización al final vía el mapper del DTO.
  Comentarios regulatorios obligatorios en `esContraria` y cuadre (§2.2 CLAUDE.md).
  > REQ-BG-05, REQ-BG-06, REQ-BG-06b, REQ-BG-07, REQ-BG-08, REQ-BG-09, REQ-BG-11

  _Verificación_: `pnpm exec jest src/reportes/domain/balance-arbol.spec.ts` — todo verde.

  _Commit sugerido_: `feat(reportes): balance-arbol dominio puro — propagación + esContraria + cuadre`

---

## Fase 6 — Service (`balance-general.service.ts`)

> REQ cubiertos: REQ-BG-01..04, REQ-BG-09, REQ-BG-10..15

- [x] 6.1 **[RED unit]** Crear `reportes/balance-general.service.spec.ts`.
  Mocks: `BalanceReaderPort` (3 métodos), `PeriodosReaderPort` (con los 2 métodos nuevos).
  No se mockea Prisma directamente (§7.8 CLAUDE.md). Fixture helpers:
  `makeSaldoCuentaRow(cuentaId, debe, haber)`, `makeCuentaEstructuraRow(overrides)`.

  **Casos RED — validación fecha** (REQ-BG-01):
  - `fecha` ausente → `FechaCorteInvalidaError` (400, `REPORTES_BALANCE_FECHA_INVALIDA`)
  - `fecha` con formato inválido (`"31-05-2026"`) → mismo error
  - `fecha` válida → no lanza

  **Casos RED — inferencia de gestión** (REQ-BG-02):
  - Sin gestión para la fecha → `GestionNoEncontradaError` (422, `REPORTES_BALANCE_SIN_GESTION`)
  - Con `gestionId` explícito → llama a `obtenerRangoGestion`, no a `obtenerRangoGestionPorFecha`
  - Sin `gestionId` → llama a `obtenerRangoGestionPorFecha`
  - `hastaEfectivo = min(hasta_gestion, fechaCorte)` al llamar a `obtenerSaldosEnRango`
    (evitar sumar ingresos/egresos posteriores al corte dentro de la gestión vigente)
  - `fechaCorte < desde_gestion` → Resultado del Ejercicio = "0.00" (gestión sin movimientos aún)

  **Casos RED — toggle incluirAnulados** (REQ-BG-04):
  - `incluirAnulados=false` (default) → propagado a `obtenerSaldosHasta` y `obtenerSaldosEnRango`
  - `incluirAnulados=true` → también propagado a ambas queries

  **Casos RED — orquestación** (REQ-BG-03, REQ-BG-09, REQ-BG-10):
  - `Promise.all` para las 3 queries simultáneas (saldosHasta, saldosGestion, estructura)
  - `gestionId` presente en la respuesta
  - `fechaCorte` en formato "YYYY-MM-DD" en la respuesta
  - Tenant sin comprobantes → respuesta con totales `"0.00"`, `cuadra: true` (REQ-BG-14)
  - Respuesta tiene las 3 secciones ACTIVO/PASIVO/PATRIMONIO (REQ-BG-10)
  > REQ-BG-01, REQ-BG-02, REQ-BG-04, REQ-BG-09, REQ-BG-10, REQ-BG-14

- [x] 6.2 **[GREEN]** Crear `reportes/balance-general.service.ts`.
  - `@Injectable()` con `@Inject(BALANCE_READER_PORT)` + `@Inject(PERIODOS_READER_PORT)`.
  - Método público `consultarBalanceGeneral(tenantId, query)` siguiendo la orquestación
    del design §5.1:
    1. Validar/parsear `fecha` → Date (lanzar `FechaCorteInvalidaError` si no parsea).
    2. Resolver rango gestión: `gestionId` provisto → `obtenerRangoGestion`;
       else → `obtenerRangoGestionPorFecha`. Lanzar `GestionNoEncontradaError` si null.
    3. Calcular `hastaEfectivo = min(hasta, fechaCorte)`.
    4. `Promise.all([obtenerSaldosHasta, obtenerSaldosEnRango, obtenerEstructuraCuentas])`.
    5. Delegar construcción del árbol a `balance-arbol.ts` (función pura importada).
    6. Mapear a `BalanceResponseDto` vía el mapper del DTO.
  - Solo `DomainError`, cero `any`, cero `new Date()` (§4.6 CLAUDE.md).
  - `parseFechaContable` reutilizada de `libro-mayor.service.ts` (copiar o importar
    si se extrae a shared en este change).
  > REQ-BG-01, REQ-BG-02, REQ-BG-04, REQ-BG-09, REQ-BG-10, REQ-BG-14

  _Commit sugerido_: `feat(reportes): BalanceGeneralService — orquestación, inferencia gestión, propagación`

---

## Fase 7 — Adapter Prisma (`prisma-balance-reader.adapter.ts`)

> ⚠️ **Requiere Postgres** (`docker compose up -d postgres`).
> Correr desde `backend/`:
> ```bash
> DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" \
> pnpm exec jest src/reportes/adapters/prisma-balance-reader.adapter.integration.spec.ts --runInBand
> ```
>
> REQ cubiertos: REQ-BG-03, REQ-BG-04, REQ-BG-12

- [x] 7.1 **[RED integration]** Crear
  `reportes/adapters/prisma-balance-reader.adapter.integration.spec.ts`.
  Patrón idéntico al de `prisma-libro-mayor-reader.adapter.integration.spec.ts`:
  `beforeAll` crea `PrismaClient`; `beforeEach` limpia + siembra 2 tenants con
  plan de cuentas (ACTIVO/PASIVO/PATRIMONIO/INGRESO/EGRESO, incluir al menos una
  cuenta con `esContraria=true` y una cuenta agrupadora);
  `afterAll` limpieza + `$disconnect`.

  **Helper de seed**: `crearComprobanteContabilizado(tenantId, periodoId, cuentaDeId,
  cuentaHaberId, fecha, montoBob, anulado?)`.

  **Casos RED — `obtenerSaldosHasta`** (REQ-BG-03, REQ-BG-04, REQ-BG-12):
  - **CRÍTICO — aislamiento multi-tenant** (REQ-BG-12, Anti-31): 2 tenants con las
    mismas fechas y mismos códigos de cuenta → query del Tenant A devuelve SOLO saldos
    del Tenant A; Tenant B no contamina
  - BORRADOR nunca aporta a los saldos (REQ-BG-03)
  - Sin `incluirAnulados`: anulados excluidos; con flag: incluidos (REQ-BG-04)
  - Corte: línea con `fechaContable > fechaCorte` no suma; `= fechaCorte` sí suma
  - COALESCE: cuenta sin movimientos no aparece (array vacío — el service la trata como 0)
  - Cuentas INGRESO y EGRESO también devueltas (necesarias para Resultado del Ejercicio)

  **Casos RED — `obtenerSaldosEnRango`** (REQ-BG-09, REQ-BG-12):
  - Líneas fuera del rango `[desde, hasta]` no aparecen
  - `desde` inclusive, `hasta` inclusive
  - Aislamiento multi-tenant análogo al de `obtenerSaldosHasta`
  - Toggle `incluirAnulados` (idem)

  **Casos RED — `obtenerEstructuraCuentas`** (REQ-BG-06, REQ-BG-12):
  - Devuelve agrupadoras sin movimiento (son nodos estructurales del árbol)
  - Cuenta con `activa=false` excluida
  - Cuenta con `esContraria=true` presente con el flag correcto
  - Aislamiento multi-tenant: estructuras de Tenant A no mezclan con Tenant B
  > REQ-BG-03, REQ-BG-04, REQ-BG-06, REQ-BG-09, REQ-BG-12

- [x] 7.2 **[GREEN]** Crear `reportes/adapters/prisma-balance-reader.adapter.ts`.
  - `@Injectable() class PrismaBalanceReaderAdapter extends BalanceReaderPort`
  - `obtenerSaldosHasta` y `obtenerSaldosEnRango`: `$queryRaw` con SQL del design §4.1.
    - **PRIMER predicado**: `lc."organizationId" = ${tenantId}` (§4.2 Anti-31).
      Comentario regulatorio: `// Defense in depth (CLAUDE.md §4.2): primer predicado siempre.`
    - Estado FIJO: `IN ('CONTABILIZADO','BLOQUEADO')` — nunca parametrizable (§4.1).
    - `anulado` ramificado en 2 statements (no parametrizado — patrón del Mayor).
    - `COALESCE(SUM(...), 0)` para evitar nulls.
    - Mapeo: `bigint`/`string` de Postgres → `new Decimal(row.totalDebitoBob)` antes de retornar.
    - `obtenerSaldosEnRango`: predicado `>= desde AND <= hasta` en lugar de `<= corte`.
  - `obtenerEstructuraCuentas`: `prisma.cuenta.findMany({ where: { organizationId: tenantId,
    activa: true }, select: { id, parentId, nivel, esDetalle, esContraria, claseCuenta,
    subClaseCuenta, naturaleza, codigoInterno, nombre } })` — no requiere `$queryRaw`.
  - Cero `any`. `exactOptionalPropertyTypes` activo (§2.5.1).
  > REQ-BG-03, REQ-BG-04, REQ-BG-06, REQ-BG-09, REQ-BG-12

  _Verificación_: integration spec verde con 2-tenants aislados.

  _Commit sugerido_: `feat(reportes): PrismaBalanceReaderAdapter — $queryRaw saldos + estructura`

---

## Fase 8 — Controller `EeffController` + wiring del módulo

> REQ cubiertos: REQ-BG-01, REQ-BG-02, REQ-BG-13

- [x] 8.1 **[GREEN]** Crear `reportes/eeff.controller.ts`.
  - `@ApiTags('Estados Financieros') @ApiBearerAuth('JWT-auth')`
  - `@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard)`
  - `@RequireModule('contabilidad')`
  - `@Controller('eeff')` — separado de `ReportesController` (@Controller('libros'))
  - Constructor inyecta `BalanceGeneralService`.
  - Método `@Get('balance') @RequirePermissions('contabilidad.eeff.read')
    @ApiOperation({ summary: 'Balance General: Estado de Situación Financiera ...' })`
  - Usa `resolveTenantId(req)` — extraer el helper a `reportes/tenant-id.ts` (shared
    dentro del módulo) en lugar de duplicarlo; importar en ambos controllers.
  - Spread condicional para `gestionId` e `incluirAnulados` (`exactOptionalPropertyTypes`).
  - Delegación directa a `BalanceGeneralService.consultarBalanceGeneral` sin lógica propia.
  > REQ-BG-01, REQ-BG-13

- [x] 8.2 **[GREEN]** Modificar `reportes/reportes.module.ts`.
  - Agregar a `controllers`: `EeffController`.
  - Agregar a `providers`:
    - `BalanceGeneralService`
    - `PrismaBalanceReaderAdapter`
    - `{ provide: BALANCE_READER_PORT, useExisting: PrismaBalanceReaderAdapter }`
  - Imports existentes (`RbacModule`, `PeriodosReaderModule`, `CuentasReaderModule`)
    ya cubren todas las dependencias. No agregar `OrgConfigReaderModule` (la línea sintética
    se ubica por `subClaseCuenta=PATRIMONIO_RESULTADOS` sin leer config — design §5.4 default).
  > REQ-BG-13 (wiring del módulo)

  _Commit sugerido_: `feat(reportes): EeffController GET /eeff/balance + wiring ReportesModule`

---

## Fase 9 — E2E full-stack

> ⚠️ **Requiere Postgres + Redis** (`docker compose up -d postgres redis`).
> Correr desde `backend/`:
> ```bash
> DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" \
> JWT_ACCESS_SECRET="test-secret" \
> JWT_REFRESH_SECRET="test-refresh" \
> pnpm exec jest test/balance-general.e2e-spec.ts --runInBand --forceExit
> ```
>
> REQ cubiertos: REQ-BG-01..15 (cobertura E2E transversal)

- [x] 9.1 **[RED e2e]** Crear `backend/test/balance-general.e2e-spec.ts`.
  Patrón idéntico a `libro-mayor.e2e-spec.ts` (AppModule, `cleanupTestData`, `seedTenant`).
  Helpers adicionales: `seedCuentaEsContraria`, `seedGestion`, `seedMovimientoIngreso`,
  `seedMovimientoEgreso`.

  **Casos RED — RBAC** (REQ-BG-13):
  - `GET /api/eeff/balance?fecha=2026-05-31` sin JWT → 401
  - Con JWT sin `contabilidad.eeff.read` → 403
  - Con JWT y permiso + fecha válida → 200

  **Casos RED — validación fecha** (REQ-BG-01):
  - Sin `?fecha` → 400, code `REPORTES_BALANCE_FECHA_INVALIDA`
  - `?fecha=31-05-2026` (formato inválido) → 400, code `REPORTES_BALANCE_FECHA_INVALIDA`

  **Casos RED — gestión fiscal** (REQ-BG-02):
  - Fecha fuera de cualquier gestión del tenant → 422, code `REPORTES_BALANCE_SIN_GESTION`
  - Fecha dentro de gestión abierta → 200 con `gestionId` correcto

  **Casos RED — respuesta correcta** (REQ-BG-05..11, REQ-BG-15):
  - Happy path: 200 con árbol ACTIVO/PASIVO/PATRIMONIO bien formado
  - Montos como string: `saldoBob`, `totalBob`, `resultadoEjercicioBob` son `"NNN.NN"`
    nunca números (REQ-BG-15)
  - `fechaCorte: "2026-05-31"` en la respuesta (REQ-BG-15)
  - BORRADOR excluido de todos los saldos (REQ-BG-03)
  - `incluirAnulados=true`: anulado contribuye al saldo (REQ-BG-04)
  - Cuenta con `esContraria=true` resta del grupo, no suma (REQ-BG-07, CRÍTICO)
  - Cuenta hoja con saldo 0 → ausente del reporte (REQ-BG-08)
  - Resultado del Ejercicio presente en Patrimonio como línea sintética
    con `"resultado"` o etiqueta legible (REQ-BG-09)
  - `cuadra: true` cuando datos son coherentes (REQ-BG-11)
  - Tenant sin plan de cuentas → 200 con todos los totales `"0.00"`, `cuadra: true` (REQ-BG-14)

  **Caso RED — multi-tenant** (REQ-BG-12, CRÍTICO):
  - 2 tenants con Activo diferente, misma fecha de corte
  - Tenant A consulta → Activo refleja SOLO datos del Tenant A
  - Ninguna cuenta ni saldo del Tenant B aparece
  > REQ-BG-01..15

- [x] 9.2 **[GREEN]** Hacer pasar todos los E2E del 9.1.
  Las implementaciones de Fases 1–8 ya deben estar verdes; este paso es confirmar
  el stack completo (AppModule + HTTP). Si algún caso falla, corregir la implementación
  correspondiente (NO ajustar el test).

  _Commit sugerido_: `feat(reportes): E2E balance-general (happy path, RBAC, esContraria, multi-tenant)`

---

## Fase 10 — Verde final

> Correr todos desde `backend/`.

- [x] 10.1 **[verde — unit]** `pnpm exec jest src/ --testPathPattern='\.spec\.ts$'
  --testPathIgnorePatterns='integration'`
  — solo unit puro (sin DB). Todo verde incluyendo suite del Mayor (sin regresión).

- [x] 10.2 **[verde — integration]**
  `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" pnpm exec jest src/ --runInBand`
  — unit + integration (Postgres real). GOTCHA: usar `127.0.0.1` no `localhost` (§11.3 CLAUDE.md).

- [x] 10.3 **[verde — E2E completo]**
  `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/ --runInBand --forceExit`
  — suite E2E completa (Diario + Mayor + Balance). Sin regresiones en Diario ni Mayor.

- [x] 10.4 **[verde — typecheck]** `pnpm exec tsc --noEmit -p tsconfig.json` desde `backend/`.
  Cero errores. Flags estrictos activos: `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride` (§2.5.1 CLAUDE.md).

- [x] 10.5 **[verde — lint]** `pnpm run lint` desde `backend/`. Cero warnings/errors ESLint.
  Verificar: cero `any` en producción (§2.5), cero `new Date()` en service/dominio (§4.6),
  comentarios regulatorios presentes en cuadre y signo-por-naturaleza (§2.2).

- [x] 10.6 **[confirmar SIN migración]** Verificar que `schema.prisma` NO fue modificado.
  `git diff --name-only HEAD backend/prisma/schema.prisma` → sin salida (ningún cambio).
  Confirmar con `DATABASE_URL=... pnpm exec prisma migrate status` → todas las migrations
  already applied, sin pending drift.
  > Decisión: sin migración (design §11, confirmado en spec §10.9).

---

## Resumen de tareas por fase

| Fase | Tareas | Tipo | PR candidato |
|------|--------|------|-------------|
| 1 — Helper `saldo-naturaleza.ts` | 1.1, 1.2, 1.3 | RED unit → GREEN + refactor | Sí |
| 2 — Extensión `PeriodosReaderPort` | 2.1, 2.2, 2.3 | setup + RED integration → GREEN | Sí |
| 3 — DomainErrors Balance | 3.1, 3.2 | RED unit → GREEN | Con Fase 4 |
| 4 — Port + DTOs + mapper | 4.1, 4.2, 4.3, 4.4 | setup + RED unit → GREEN | Con Fase 3 |
| 5 — Dominio `balance-arbol.ts` | 5.1, 5.2 | RED unit → GREEN | Sí |
| 6 — Service | 6.1, 6.2 | RED unit → GREEN | Con Fase 5 |
| 7 — Adapter Prisma | 7.1, 7.2 | RED integration → GREEN | Sí |
| 8 — Controller + wiring | 8.1, 8.2 | GREEN (cubierto por E2E) | Con Fase 9 |
| 9 — E2E | 9.1, 9.2 | RED e2e → GREEN | Con Fase 8 |
| 10 — Verde final | 10.1..10.6 | verificación | — |
| **Total** | **25** | | |

---

## Archivos nuevos y modificados

| Archivo | Acción |
|---------|--------|
| `backend/src/reportes/domain/saldo-naturaleza.ts` | **Crear** |
| `backend/src/reportes/domain/saldo-naturaleza.spec.ts` | **Crear** |
| `backend/src/reportes/domain/balance-errors.ts` | **Crear** |
| `backend/src/reportes/domain/balance-errors.spec.ts` | **Crear** |
| `backend/src/reportes/domain/balance-arbol.ts` | **Crear** |
| `backend/src/reportes/domain/balance-arbol.spec.ts` | **Crear** |
| `backend/src/reportes/ports/balance-reader.port.ts` | **Crear** |
| `backend/src/reportes/dto/balance-query.dto.ts` | **Crear** |
| `backend/src/reportes/dto/balance-response.dto.ts` | **Crear** |
| `backend/src/reportes/dto/balance-response.dto.spec.ts` | **Crear** |
| `backend/src/reportes/balance-general.service.ts` | **Crear** |
| `backend/src/reportes/balance-general.service.spec.ts` | **Crear** |
| `backend/src/reportes/adapters/prisma-balance-reader.adapter.ts` | **Crear** |
| `backend/src/reportes/adapters/prisma-balance-reader.adapter.integration.spec.ts` | **Crear** |
| `backend/src/reportes/eeff.controller.ts` | **Crear** |
| `backend/src/reportes/tenant-id.ts` | **Crear** (helper shared extraído de ReportesController) |
| `backend/test/balance-general.e2e-spec.ts` | **Crear** |
| `backend/src/reportes/libro-mayor.service.ts` | **Modificar** (rewire a `calcularSaldoNeto`) |
| `backend/src/reportes/reportes.controller.ts` | **Modificar** (importar `resolveTenantId` del nuevo helper) |
| `backend/src/reportes/reportes.module.ts` | **Modificar** (+ EeffController, + Balance providers) |
| `backend/src/periodos-fiscales/ports/periodos-reader.port.ts` | **Modificar** (+ 2 métodos abstractos) |
| `backend/src/periodos-fiscales/adapters/prisma-periodos-reader.adapter.ts` | **Modificar** (implementar los 2 métodos) |
| `backend/src/periodos-fiscales/adapters/prisma-periodos-reader.adapter.integration.spec.ts` | **Modificar** (+ casos nuevos) |

**Sin migración. `schema.prisma` y `app.module.ts` no se tocan.**

---

## Trazabilidad REQ-BG

| REQ | Fase(s) que la cubre |
|-----|---------------------|
| REQ-BG-01 (fecha obligatoria YYYY-MM-DD) | 4.2, 6.1, 6.2, 8.1, 9.1 |
| REQ-BG-02 (inferencia gestión vigente) | 2.1, 2.2, 2.3, 6.1, 6.2, 9.1 |
| REQ-BG-03 (BORRADOR excluido) | 7.1, 7.2, 9.1 |
| REQ-BG-04 (toggle incluirAnulados) | 4.2, 6.1, 7.1, 7.2, 9.1 |
| REQ-BG-05 (saldo neto por naturaleza) | 1.1, 1.2, 5.1, 5.2 |
| REQ-BG-06 (propagación jerárquica) | 5.1, 5.2, 7.1 |
| REQ-BG-06b (sin doble conteo) | 5.1, 5.2 |
| REQ-BG-07 (esContraria resta del grupo) | 5.1, 5.2, 9.1 |
| REQ-BG-08 (omisión saldo 0) | 5.1, 5.2 |
| REQ-BG-09 (Resultado del Ejercicio en Patrimonio) | 5.1, 5.2, 6.1, 6.2, 7.1, 9.1 |
| REQ-BG-10 (estructura árbol Activo/Pasivo/Patrimonio) | 4.3, 4.4, 5.2, 6.1 |
| REQ-BG-11 (cuadra + diferencia, tolerancia ±0.01) | 4.3, 5.1, 5.2, 9.1 |
| REQ-BG-12 (multi-tenant estricto, CRÍTICO) | 7.1, 7.2, 9.1 |
| REQ-BG-13 (RBAC contabilidad.eeff.read) | 8.1, 8.2, 9.1 |
| REQ-BG-14 (sin plan de cuentas → balance en cero) | 6.1, 9.1 |
| REQ-BG-15 (forma DTO, montos string) | 4.3, 4.4, 9.1 |
| REQ-BG-16 (helper saldo-naturaleza.ts extraído) | 1.1, 1.2, 1.3 |
