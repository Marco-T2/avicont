# Tasks: Estado de Resultados (módulo `reportes`) — backend-only

> Strict TDD Mode: RED → GREEN por tarea de implementación.
> Conventional commit scope: `reportes` (singular).
> Sin migración — cero cambios en `schema.prisma` ni en `app.module.ts`.
> `PeriodosReaderPort` ya tiene `obtenerRangoFechas` y `obtenerRangoGestion` (PR #77). Sin extensiones.
>
> **Decisiones cerradas aplicadas:**
> - D-01: rename `BalanceReaderPort` → `EeffSaldosReaderPort` en commit aparte PRIMERO,
>   con suite del Balance como safety net (balance verde antes y después).
> - D-02: `resultados-arbol.ts` duplica variante de flujo (no generalizar propagación).
>   Reusa `calcularSaldoNeto` de `saldo-naturaleza.ts` (ya compartido).
> - Endpoint: `GET /api/eeff/resultados` en `EeffController` existente.
> - Errores prefijo `REPORTES_RESULTADOS_*`.
> - ResultadoEjercicio = Σ INGRESO − Σ EGRESO; puede ser negativo. No línea sintética.

---

## Fase 1 — Rename D-01: `BalanceReaderPort` → `EeffSaldosReaderPort` (safety net Balance)

> Refactor 100% mecánico. Sin cambio de superficie ni de comportamiento.
> Safety net = suite completa del Balance (unit + integration + E2E) verde antes y después.
> 6 archivos modificados + 1 archivo renombrado.

- [x] 1.1 **[safety net — verificar verde]** Ejecutar suite completa del Balance antes del rename:
  `pnpm exec jest src/reportes/ --runInBand` (unit) + integration spec del adapter.
  Confirmar que TODOS los tests del Balance pasan. Si alguno falla, **no continuar**.

- [x] 1.2 **[rename — port]** Renombrar `ports/balance-reader.port.ts` → `ports/eeff-saldos-reader.port.ts`.
  Dentro del archivo: `BALANCE_READER_PORT` → `EEFF_SALDOS_READER_PORT`;
  `BalanceReaderPort` → `EeffSaldosReaderPort`.
  Los tipos `SaldoCuentaRow`, `CuentaEstructuraRow`, `BalanceFiltros` permanecen sin cambio.

- [x] 1.3 **[rename — adapter]** Renombrar `adapters/prisma-balance-reader.adapter.ts` →
  `adapters/prisma-eeff-saldos-reader.adapter.ts`.
  Dentro: `PrismaBalanceReaderAdapter` → `PrismaEeffSaldosReaderAdapter`; actualizar import del port.

- [x] 1.4 **[rename — integration spec]** Renombrar
  `adapters/prisma-balance-reader.adapter.integration.spec.ts` →
  `adapters/prisma-eeff-saldos-reader.adapter.integration.spec.ts`.
  Actualizar referencias internas: clase, import, `describe`.

- [x] 1.5 **[rename — 3 consumidores intra-módulo]** Actualizar imports y referencias en:
  - `balance-general.service.ts` (inyección `@Inject(EEFF_SALDOS_READER_PORT)`, tipo `EeffSaldosReaderPort`)
  - `balance-general.service.spec.ts` (mock y tipo del port)
  - `reportes.module.ts` (import clase + Symbol, binding `provide/useExisting`)

- [x] 1.6 **[safety net — verde post-rename]** Verificar suite completa del Balance verde después del rename:
  `pnpm exec jest src/reportes/ --runInBand` + `pnpm exec tsc --noEmit -p tsconfig.json`.
  **Sin ningún cambio funcional. Si falla: revertir y revisar.**

  _Commit sugerido_: `refactor(reportes): renombrar BalanceReaderPort → EeffSaldosReaderPort (D-01)`

---

## Fase 2 — DomainErrors Estado de Resultados

> REQ cubiertos: REQ-ER-01

- [x] 2.1 **[RED unit]** Crear `reportes/domain/resultados-errors.spec.ts`.
  Verificar `httpStatus`, `code` y shape de `details` de cada error:
  - `RangoInvalidoError` → HTTP 400, `REPORTES_RESULTADOS_RANGO_INVALIDO`
  - `PeriodoNoEncontradoError` → HTTP 422, `REPORTES_RESULTADOS_SIN_PERIODO`
  - `GestionNoEncontradaError` → HTTP 422, `REPORTES_RESULTADOS_SIN_GESTION`
  Los tests deben FALLAR (archivo de producción no existe aún).

- [x] 2.2 **[GREEN]** Crear `reportes/domain/resultados-errors.ts`.
  Tres subclases extendiendo `@/common/errors`:
  - `RangoInvalidoError extends ValidationError` → `REPORTES_RESULTADOS_RANGO_INVALIDO`, HTTP 400.
    Cubre: ninguna forma provista, múltiples formas, fecha mal formada, `desde > hasta`.
    Mensaje: `"El rango de fechas del Estado de Resultados es inválido o no fue proporcionado"`.
  - `PeriodoNoEncontradoError extends InvalidStateError` → `REPORTES_RESULTADOS_SIN_PERIODO`, HTTP 422.
    Mensaje: `"No existe un período fiscal con el ID indicado para este tenant"`.
  - `GestionNoEncontradaError extends InvalidStateError` → `REPORTES_RESULTADOS_SIN_GESTION`, HTTP 422.
    Mensaje: `"No existe una gestión fiscal con el ID indicado para este tenant"`.
  Comentario: `// NCB art. 36: el Estado de Resultados debe estar acotado a un período válido.`

  _Commit sugerido_: `feat(reportes): DomainErrors estado-resultados REPORTES_RESULTADOS_*`

---

## Fase 3 — DTOs query y response

> REQ cubiertos: REQ-ER-01, REQ-ER-12

- [x] 3.1 **[setup]** Crear `reportes/dto/eeff-resultados-query.dto.ts`.
  - `@IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) fechaDesde?: string`
  - `@IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) fechaHasta?: string`
  - `@IsOptional() @IsUUID('4') periodoFiscalId?: string`
  - `@IsOptional() @IsUUID('4') gestionId?: string`
  - `@IsOptional() @Transform(boolBuilder) @IsBoolean() incluirAnulados?: boolean` (default false)
  Sin validación "exactamente una forma" en DTO — eso va en el service con `DomainError`.

- [x] 3.2 **[RED unit]** Crear `reportes/dto/eeff-resultados-response.dto.spec.ts`.
  Verificar el mapper/función pura que construye el DTO desde datos calculados:
  - `Money → string` con 2 decimales fijos: `"1250.50"` nunca `1250.5`
  - `resultadoEjercicioBob` negativo serializado correctamente: `"-10000.00"`
  - Fechas `YYYY-MM-DD` correctas con `formatFechaContable` (§4.6)
  - `esGanancia: true` cuando `resultadoEjercicioBob >= 0`; `false` cuando negativo
  - Estructura `ingreso.subsecciones[].cuentas[]` y `egreso.subsecciones[].cuentas[]` correcta
  - `totalIngresoBob`, `totalEgresoBob`, `resultadoEjercicioBob` como string en raíz

- [x] 3.3 **[GREEN]** Crear `reportes/dto/eeff-resultados-response.dto.ts`.
  Interfaces internas con `Money` (`*Calculado`) separadas de interfaces DTO de respuesta.
  Interfaces DTO: `CuentaResultadosDto`, `SubseccionResultadosDto`, `SeccionResultadosDto`,
  `EstadoResultadosResponseDto`. Función pura exportada `toEstadoResultadosResponse(arbol, rango)`.
  Reusa `formatFechaContable` de `libro-mayor-response.dto.ts` (importar o re-exportar desde shared).
  Sin `esSintetica` — no hay línea sintética en el Estado de Resultados.

  _Commit sugerido_: `feat(reportes): DTOs query + response estado-resultados`

---

## Fase 4 — Dominio `resultados-arbol.ts` (propagación de flujo)

> Corazón de la lógica nueva. Cero NestJS, cero Prisma. Cobertura objetivo ≥ 95% (§7.5).
> REQ cubiertos: REQ-ER-02, REQ-ER-05, REQ-ER-06, REQ-ER-07, REQ-ER-08, REQ-ER-09

- [x] 4.1 **[RED unit]** Crear `reportes/domain/resultados-arbol.spec.ts`.
  Fixtures: helpers `makeCuentaResultados(overrides)` y `makeSaldoRango(cuentaId, debe, haber)`.
  Los tests deben FALLAR antes de crear `resultados-arbol.ts`.

  **Casos RED — saldo de flujo por hoja** (REQ-ER-05):
  - Hoja ACREEDORA (INGRESO): `saldoFlujo = Σcredito − Σdebito` en rango → positivo
  - Hoja DEUDORA (EGRESO): `saldoFlujo = Σdebito − Σcredito` en rango → positivo
  - Hoja sin fila en `saldosRango` → `Money.ZERO` (flujo parte de 0, REQ-ER-02)

  **Casos RED — propagación jerárquica** (REQ-ER-06):
  - Árbol 3 niveles INGRESO: `4` → `4.1` → `[4.1.01, 4.1.02]`; saldo de `4.1` = suma hojas
  - Sin doble conteo: `4` no suma `4.1` más `4.1.01` por separado
  - `esContraria=true` (devoluciones sobre ventas): hoja contraria RESTA del agrupador (CRÍTICO)
  - Grupo sin cuentas contrarias → todos los saldos suman normalmente

  **Casos RED — omisión saldo 0** (REQ-ER-07):
  - Hoja con saldo de flujo 0 → omitida del reporte
  - Agrupador con todos los hijos en 0 → omitido
  - Agrupador con ≥1 hijo ≠ 0 → presente aunque tenga otros hijos en 0

  **Casos RED — Resultado del Ejercicio** (REQ-ER-08):
  - `ResultadoEjercicio = Σ saldoFlujo(INGRESO) − Σ saldoFlujo(EGRESO)` correcto con fixture
  - Resultado negativo (pérdida): `resultadoEjercicioBob` como `Money` negativo
  - Cuentas ACTIVO/PASIVO/PATRIMONIO ignoradas (INGRESO/EGRESO únicamente)

  **Casos RED — estructura dos secciones** (REQ-ER-09):
  - Resultado contiene `ingreso` y `egreso` con subsecciones por `subClaseCuenta`
  - Solo subsecciones con descendientes de saldo ≠ 0 aparecen
  - Orden por `codigoInterno` ASC dentro de cada subsección

- [x] 4.2 **[GREEN]** Crear `reportes/domain/resultados-arbol.ts`.
  Función(es) puras exportadas — cero `@Injectable()`, cero imports de NestJS/Prisma.
  Algoritmo:
  1. Para cada cuenta hoja: cruzar `cuentaId` con `saldosRango`; aplicar `calcularSaldoNeto`
     (importado de `saldo-naturaleza.ts`). Sin fila → `Money.ZERO`.
  2. Indexar por `id` y `parentId`. Propagar hojas → agrupadores por nivel descendente.
  3. `esContraria=true` RESTA en la propagación (idéntico al Balance).
  4. Ensamblar DOS secciones: `INGRESO` (OPERATIVO / NO_OPERATIVO) y `EGRESO`
     (OPERATIVO / ADMINISTRATIVO / COMERCIALIZACION / FINANCIERO / NO_OPERATIVO).
     Ignorar cuentas ACTIVO/PASIVO/PATRIMONIO.
  5. Calcular `ResultadoEjercicio = Σ INGRESO − Σ EGRESO` (scalar, no línea sintética).
  6. Omitir hojas con saldo 0; omitir agrupadores sin descendientes con saldo ≠ 0.
  Todo con `Money` (decimal.js). Comentarios regulatorios en `esContraria` y fórmula:
  `// NCB / NIC 1: Estado de Resultados de flujo del período, sin arrastre histórico.`
  `// Código Tributario art. 47: ResultadoEjercicio = Σ Ingresos − Σ Egresos del período.`

  _Verificación_: `pnpm exec jest src/reportes/domain/resultados-arbol.spec.ts` — todo verde.

  _Commit sugerido_: `feat(reportes): resultados-arbol dominio puro — flujo, esContraria, Resultado`

---

## Fase 5 — Service `estado-resultados.service.ts`

> REQ cubiertos: REQ-ER-01, REQ-ER-02, REQ-ER-03, REQ-ER-04, REQ-ER-08, REQ-ER-10

- [x] 5.1 **[RED unit]** Crear `reportes/estado-resultados.service.spec.ts`.
  Mocks: `EeffSaldosReaderPort` (3 métodos) y `PeriodosReaderPort` (sin cambios al port).
  No mockear Prisma directamente (§7.8 CLAUDE.md).

  **Casos RED — resolución de rango (REQ-ER-01):**
  - Sin ninguna forma → `RangoInvalidoError` (400, `REPORTES_RESULTADOS_RANGO_INVALIDO`)
  - `fechaDesde` sin `fechaHasta` → `RangoInvalidoError`
  - `fechaDesde > fechaHasta` → `RangoInvalidoError`
  - Fecha con formato inválido → `RangoInvalidoError`
  - Prioridad: `fechaDesde+fechaHasta` > `periodoFiscalId` > `gestionId`
  - `periodoFiscalId` → llama `obtenerRangoFechas`; retorna null → `PeriodoNoEncontradoError`
  - `gestionId` → llama `obtenerRangoGestion`; retorna null → `GestionNoEncontradaError`
  - Rango directo válido → llama `obtenerSaldosEnRango` (NUNCA `obtenerSaldosHasta`)

  **Casos RED — garantía de FLUJO (REQ-ER-02, CRÍTICO):**
  - Service llama `obtenerSaldosEnRango` (NEVER `obtenerSaldosHasta`)
  - `incluirAnulados` propagado correctamente al reader

  **Casos RED — toggle incluirAnulados (REQ-ER-04):**
  - `false` (default) → propagado; `true` → propagado
  - `Promise.all` para `obtenerSaldosEnRango` + `obtenerEstructuraCuentas` simultáneos

  **Casos RED — orquestación:**
  - Tenant sin comprobantes → respuesta 200 con `totalIngresoBob: "0.00"`,
    `totalEgresoBob: "0.00"`, `resultadoEjercicioBob: "0.00"`

- [x] 5.2 **[GREEN]** Crear `reportes/estado-resultados.service.ts`.
  `@Injectable()` inyecta `@Inject(EEFF_SALDOS_READER_PORT) EeffSaldosReaderPort`
  y `@Inject(PERIODOS_READER_PORT) PeriodosReaderPort`. Solo `DomainError`, cero `any`.
  Método `consultarEstadoResultados(tenantId, query)`:
  1. Resolver rango según forma provista (prioridad: fechas > periodoId > gestionId).
     `parseFechaContable` reutilizada de `balance-general.service.ts` (extraer a helper
     `reportes/fecha-contable.ts` si no existe aún; shared dentro del módulo).
  2. `Promise.all([obtenerSaldosEnRango(tenantId, desde, hasta, incluirAnulados),
     obtenerEstructuraCuentas(tenantId)])`.
  3. `arbol = construirEstadoResultados({ estructura, saldosRango })`.
  4. `return toEstadoResultadosResponse(arbol, { desde, hasta })`.
  Cero `new Date()` (§4.6 CLAUDE.md).

  _Commit sugerido_: `feat(reportes): EstadoResultadosService — resolución rango, flujo puro, orquestación`

---

## Fase 6 — Controller endpoint + wiring del módulo

> REQ cubiertos: REQ-ER-01, REQ-ER-09, REQ-ER-11

- [x] 6.1 **[GREEN]** Modificar `reportes/eeff.controller.ts`.
  Agregar al constructor: `EstadoResultadosService`.
  Agregar método:
  ```typescript
  @Get('resultados')
  @RequirePermissions('contabilidad.eeff.read')
  @ApiOperation({ summary: 'Estado de Resultados (Income Statement) — flujo del período' })
  obtenerEstadoResultados(@Req() req, @Query() query: EstadoResultadosQueryDto) {
    const tenantId = resolveTenantId(req);
    return this.estadoResultadosService.consultarEstadoResultados(tenantId, { /* spread condicional §2.5.1 */ });
  }
  ```
  Mismo patrón de guards que el endpoint `balance` existente en el mismo controller.

- [x] 6.2 **[GREEN]** Modificar `reportes/reportes.module.ts`.
  Agregar a `providers`:
  - `EstadoResultadosService`
  `EeffSaldosReaderPort` (renombrado) y `PeriodosReaderModule` ya están wired desde PR #77.
  Sin nuevos imports de módulos externos.

  _Commit sugerido_: `feat(reportes): EeffController GET /eeff/resultados + wiring ReportesModule`

---

## Fase 7 — Tests de integración explícitos (flujo, multi-tenant, no-arrastre)

> ⚠️ **Requiere Postgres** (`docker compose up -d postgres`).
> `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas"`
>
> REQ cubiertos: REQ-ER-02 (no-arrastre CRÍTICO), REQ-ER-03, REQ-ER-04, REQ-ER-10

- [x] 7.1 **[RED integration]** Agregar escenarios de flujo al spec del adapter
  `adapters/prisma-eeff-saldos-reader.adapter.integration.spec.ts` (renombrado en Fase 1).

  **Casos RED — no-arrastre de flujo (REQ-ER-02, CRÍTICO):**
  - Comprobante CONTABILIZADO con `fechaContable < fechaDesde` → NO aparece en `obtenerSaldosEnRango`
  - Comprobante CONTABILIZADO con `fechaContable = fechaDesde` → SÍ aparece
  - Comprobante con `fechaContable > fechaHasta` → NO aparece

  **Casos RED — multi-tenant (REQ-ER-10, CRÍTICO):**
  - Tenant A e Tenant B con cuentas INGRESO y EGRESO en mismo rango
  - Query de Tenant A devuelve SOLO datos de Tenant A; sin contaminación de Tenant B

  **Casos RED — estados (REQ-ER-03, REQ-ER-04):**
  - BORRADOR no aporta al flujo
  - `incluirAnulados=false`: anulado excluido; `incluirAnulados=true`: incluido

- [x] 7.2 **[GREEN]** Hacer pasar los casos RED del 7.1.
  Los predicados ya están en el adapter (Fase 1 solo renombrÓ, no cambió SQL).
  Si algún caso falla, es regresión del rename → corregir. No cambiar los tests.

  _Verificación_: integration spec verde con Postgres real (2 tenants aislados).

  _Commit sugerido_: `test(reportes): integration specs flujo puro + multi-tenant estado-resultados`

---

## Fase 8 — E2E full-stack

> ⚠️ **Requiere Postgres + Redis** (`docker compose up -d postgres redis`).
> ```bash
> DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" \
> JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" \
> pnpm exec jest test/estado-resultados.e2e-spec.ts --runInBand --forceExit
> ```
>
> REQ cubiertos: REQ-ER-01..12 (cobertura E2E transversal)

- [x] 8.1 **[RED e2e]** Crear `backend/test/estado-resultados.e2e-spec.ts`.
  Patrón idéntico a `balance-general.e2e-spec.ts` (AppModule, `cleanupTestData`, `seedTenant`).

  **Casos RED — RBAC (REQ-ER-11):**
  - Sin JWT → 401; con JWT sin `contabilidad.eeff.read` → 403
  - Con JWT y permiso + rango válido → 200

  **Casos RED — validación de rango (REQ-ER-01):**
  - Sin ningún parámetro → 400, code `REPORTES_RESULTADOS_RANGO_INVALIDO`
  - `fechaDesde=2026-06-01&fechaHasta=2026-05-01` → 400, `REPORTES_RESULTADOS_RANGO_INVALIDO`
  - `periodoFiscalId` inexistente → 422, `REPORTES_RESULTADOS_SIN_PERIODO`
  - `gestionId` inexistente → 422, `REPORTES_RESULTADOS_SIN_GESTION`

  **Casos RED — respuesta correcta (REQ-ER-02, REQ-ER-05..09, REQ-ER-12):**
  - Happy path: 200 con árbol `ingreso`/`egreso` bien formado
  - Montos como string: `saldoBob`, `totalBob`, `totalIngresoBob`, `resultadoEjercicioBob`
  - Fechas `fechaDesde`/`fechaHasta` en raíz como `"YYYY-MM-DD"`
  - BORRADOR excluido (REQ-ER-03)
  - `incluirAnulados=true`: anulado contribuye (REQ-ER-04)
  - Cuenta `esContraria=true` (devoluciones) RESTA del grupo, no suma (REQ-ER-06, CRÍTICO)
  - Cuenta hoja con flujo 0 → ausente del reporte (REQ-ER-07)
  - Resultado negativo (pérdida): `resultadoEjercicioBob: "-10000.00"` + `esGanancia: false`
  - Comprobante con `fechaContable < fechaDesde` → NO contribuye (REQ-ER-02, CRÍTICO)

  **Caso RED — coincidencia Balance vs Estado de Resultados (REQ-ER-08, CRÍTICO):**
  - Tenant con ingresos y egresos en una gestión
  - `GET /api/eeff/balance?fecha=<fin gestión>` y `GET /api/eeff/resultados?gestionId=<id>`
  - `balanceResponse.resultadoEjercicioBob === estadoResultadosResponse.resultadoEjercicioBob`

  **Caso RED — multi-tenant (REQ-ER-10, CRÍTICO):**
  - Tenant A (Ingresos Bs 100000) y Tenant B (Ingresos Bs 300000), mismo rango
  - Tenant A consulta → `ingreso.totalBob: "100000.00"`, sin datos del Tenant B

  **Caso RED — tenant sin comprobantes (REQ-ER-10):**
  - Tenant recién creado → 200 con `totalIngresoBob: "0.00"`, `totalEgresoBob: "0.00"`,
    `resultadoEjercicioBob: "0.00"`

- [x] 8.2 **[GREEN]** Hacer pasar todos los E2E del 8.1.
  Las Fases 1–6 ya deben estar completas. Este paso confirma el stack completo.
  Si algún caso falla, corregir la implementación — NO ajustar el test.

  _Commit sugerido_: `feat(reportes): E2E estado-resultados — flujo, RBAC, esContraria, coincidencia Balance`

---

## Fase 9 — Verde final

> Ejecutar desde `backend/`.

- [x] 9.1 **[verde — unit]** `pnpm exec jest src/ --testPathPattern='\.spec\.ts$' --testPathIgnorePatterns='integration'`
  Todo verde incluyendo suite del Balance (sin regresión del rename D-01).

- [x] 9.2 **[verde — integration]**
  `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" pnpm exec jest src/ --runInBand`
  Unit + integration (Postgres real). GOTCHA: `127.0.0.1` no `localhost` (§11.3 CLAUDE.md).

- [x] 9.3 **[verde — E2E completo]**
  `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/ --runInBand --forceExit`
  Suite E2E completa (Diario + Mayor + Balance + Estado de Resultados). Sin regresiones.

- [x] 9.4 **[verde — typecheck]** `pnpm exec tsc --noEmit -p tsconfig.json` desde `backend/`.
  Cero errores. `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` (§2.5.1).

- [x] 9.5 **[verde — lint]** `pnpm run lint` desde `backend/`. Cero warnings/errors ESLint.
  Verificar: cero `any` en producción (§2.5), cero `new Date()` en service/dominio (§4.6),
  comentarios regulatorios en `esContraria` y fórmula `ResultadoEjercicio` (§2.2).

- [x] 9.6 **[confirmar SIN migración]** `git diff --name-only HEAD backend/prisma/schema.prisma` → sin salida.
  `DATABASE_URL=... pnpm exec prisma migrate status` → todo applied, sin drift.

---

## Resumen de tareas por fase

| Fase | Tareas | Tipo | Notas |
|------|--------|------|-------|
| 1 — Rename D-01 `EeffSaldosReaderPort` | 1.1…1.6 | refactor mecánico + safety net | Commit aparte PRIMERO |
| 2 — DomainErrors `REPORTES_RESULTADOS_*` | 2.1, 2.2 | RED unit → GREEN | Con Fase 3 |
| 3 — DTOs query + response | 3.1, 3.2, 3.3 | setup + RED unit → GREEN | Con Fase 2 |
| 4 — Dominio `resultados-arbol.ts` | 4.1, 4.2 | RED unit → GREEN | Core, ≥95% cobertura |
| 5 — Service `estado-resultados.service.ts` | 5.1, 5.2 | RED unit → GREEN | Con Fase 4 |
| 6 — Controller + wiring | 6.1, 6.2 | GREEN (cubierto por E2E) | Con Fase 5 |
| 7 — Integration: flujo + multi-tenant | 7.1, 7.2 | RED integration → GREEN | Postgres real |
| 8 — E2E full-stack | 8.1, 8.2 | RED e2e → GREEN | Con coincidencia Balance |
| 9 — Verde final | 9.1…9.6 | verificación | — |
| **Total** | **27** | | |

---

## Archivos nuevos y modificados

| Archivo | Acción |
|---------|--------|
| `backend/src/reportes/ports/eeff-saldos-reader.port.ts` | **Renombrar** desde `balance-reader.port.ts` (D-01) |
| `backend/src/reportes/adapters/prisma-eeff-saldos-reader.adapter.ts` | **Renombrar** desde `prisma-balance-reader.adapter.ts` (D-01) |
| `backend/src/reportes/adapters/prisma-eeff-saldos-reader.adapter.integration.spec.ts` | **Renombrar** desde `prisma-balance-reader.adapter.integration.spec.ts` (D-01) |
| `backend/src/reportes/balance-general.service.ts` | **Modificar** (D-01: update imports/tipos) |
| `backend/src/reportes/balance-general.service.spec.ts` | **Modificar** (D-01: update mock/tipo) |
| `backend/src/reportes/reportes.module.ts` | **Modificar** (D-01 + wiring `EstadoResultadosService`) |
| `backend/src/reportes/domain/resultados-errors.ts` | **Crear** |
| `backend/src/reportes/domain/resultados-errors.spec.ts` | **Crear** |
| `backend/src/reportes/dto/eeff-resultados-query.dto.ts` | **Crear** |
| `backend/src/reportes/dto/eeff-resultados-response.dto.ts` | **Crear** |
| `backend/src/reportes/dto/eeff-resultados-response.dto.spec.ts` | **Crear** |
| `backend/src/reportes/domain/resultados-arbol.ts` | **Crear** |
| `backend/src/reportes/domain/resultados-arbol.spec.ts` | **Crear** |
| `backend/src/reportes/estado-resultados.service.ts` | **Crear** |
| `backend/src/reportes/estado-resultados.service.spec.ts` | **Crear** |
| `backend/src/reportes/eeff.controller.ts` | **Modificar** (+ endpoint `GET /eeff/resultados`) |
| `backend/test/estado-resultados.e2e-spec.ts` | **Crear** |

**Sin migración. `schema.prisma` y `app.module.ts` no se tocan.**

---

## Trazabilidad REQ-ER

| REQ | Fase(s) que la cubre |
|-----|---------------------|
| REQ-ER-01 (tres formas de rango) | 3.1, 5.1, 5.2, 6.1, 8.1 |
| REQ-ER-02 (flujo sin arrastre, CRÍTICO) | 4.1, 4.2, 5.1, 5.2, 7.1, 8.1 |
| REQ-ER-03 (BORRADOR excluido) | 7.1, 8.1 |
| REQ-ER-04 (toggle incluirAnulados) | 3.1, 5.1, 7.1, 8.1 |
| REQ-ER-05 (saldo neto flujo por naturaleza) | 4.1, 4.2 |
| REQ-ER-06 (propagación jerárquica + esContraria) | 4.1, 4.2, 8.1 |
| REQ-ER-07 (omisión saldo 0) | 4.1, 4.2 |
| REQ-ER-08 (Resultado + coincidencia Balance, CRÍTICO) | 4.1, 4.2, 5.1, 8.1 |
| REQ-ER-09 (estructura árbol Ingreso/Egreso) | 4.1, 4.2, 3.2, 3.3, 8.1 |
| REQ-ER-10 (multi-tenant, CRÍTICO) | 7.1, 7.2, 8.1 |
| REQ-ER-11 (RBAC contabilidad.eeff.read) | 6.1, 8.1 |
| REQ-ER-12 (forma DTO, montos string) | 3.2, 3.3, 8.1 |
