# Tasks — balance-comprobacion (SOLO BACKEND, TDD)

> Orden: tests primero donde aplique (Strict TDD). Cobertura dominio ≥95% (§7.5).
> Todos los paths relativos a `backend/`. Sin migración. Sin cambios al port.
> Comandos de test: ver CLAUDE.md §11.3.

## 1. Errores de dominio

- [x] 1.1 Escribir `src/reportes/domain/balance-comprobacion-errors.spec.ts`:
  verifica `code`, `message` y clase base (`ValidationError`/`InvalidStateError`)
  de cada error (DR-5).
- [x] 1.2 Implementar `src/reportes/domain/balance-comprobacion-errors.ts` con:
  - `RangoRequeridoError` → `REPORTES_BALANCE_COMPROBACION_RANGO_REQUERIDO`
  - `RangoAmbiguoError` → `REPORTES_BALANCE_COMPROBACION_RANGO_AMBIGUO`
  - `RangoInvalidoError` → `REPORTES_BALANCE_COMPROBACION_RANGO_INVALIDO`
  - `PeriodoNoEncontradoError` → `REPORTES_BALANCE_COMPROBACION_PERIODO_NO_ENCONTRADO`
  (extienden `DomainError` vía `@/common/errors`, comentario regulatorio §4.1).
- [x] 1.3 Verde: `pnpm exec jest src/reportes/domain/balance-comprobacion-errors.spec.ts`.

## 2. Builder de dominio (núcleo — cobertura ≥95%)

- [x] 2.1 Definir los tipos internos `*Calculada` (Money) y el `BalanceComprobacionResult`
  en `dto/balance-comprobacion-response.dto.ts` (sección "tipos internos", se completa
  con el DTO público en la tarea 4) — el builder los importa, como hace
  `resultados-arbol.ts` con `eeff-resultados-response.dto.ts`.
- [x] 2.2 Escribir `src/reportes/domain/balance-comprobacion.spec.ts` cubriendo:
  - REQ-BC-03: 4 columnas — débito>crédito → saldoDeudor; crédito>débito →
    saldoAcreedor; débito=crédito (saldo 0 con movimiento) → ambos 0 pero presente.
  - REQ-BC-04: cuenta de detalle sin movimiento omitida; cuenta agrupadora nunca
    aparece como fila.
  - REQ-BC-05: orden por `codigoInterno` ASC.
  - REQ-BC-06: totales de las 4 columnas; `cuadra=true` cuadrado;
    `cuadra=false` + `diferenciaSumas`/`diferenciaSaldos` ante descuadre;
    tolerancia ±0.01 vía `balanceadoEnBobCon`.
  - REQ-BC-07: `cuentasNaturalezaOpuesta` (DEUDORA con saldoAcreedor, ACREEDORA
    con saldoDeudor); `[]` cuando todas del lado esperado; no afecta totales.
  - REQ-BC-12: estructura/saldos vacíos → `lineas=[]`, totales "0.00", `cuadra=true`.
  - REQ-BC-13: fila de saldo con `cuentaId` ausente en estructura → ignorada.
- [x] 2.3 Implementar `src/reportes/domain/balance-comprobacion.ts`
  (`construirBalanceComprobacion`, función pura sin NestJS/Prisma). Lista plana
  de cuentas de detalle (DR-2); `MAX(diff, 0)` vía `isPositive() ? diff : Money.ZERO`;
  cuadre con `Money.balanceadoEnBobCon`. Comentarios regulatorios §4.1 (Código
  Tributario art. 47 / cuadre de sumas y saldos).
- [x] 2.4 Verde + cobertura ≥95%:
  `pnpm exec jest src/reportes/domain/balance-comprobacion.spec.ts --coverage --collectCoverageFrom='src/reportes/domain/balance-comprobacion.ts'`.

## 3. Query DTO

- [x] 3.1 Implementar `src/reportes/dto/balance-comprobacion-query.dto.ts`:
  `desde?`/`hasta?` (`@Matches(/^\d{4}-\d{2}-\d{2}$/)`), `periodoFiscalId?`
  (`@IsUUID('4')`), `incluirAnulados?` (`@IsBoolean` + `@Transform`). Forma en DTO,
  XOR de modos en el service (regla de oro §10.10). Comentarios por REQ-BC-01/02.

## 4. DTO de respuesta + mapper

- [x] 4.1 Escribir `src/reportes/dto/balance-comprobacion-response.dto.spec.ts`:
  verifica que `toBalanceComprobacionResponse` serializa Money→string 2 decimales
  (§4.5), Date→"YYYY-MM-DD" (§4.6), preserva `cuadra` boolean, y mapea
  `cuentasNaturalezaOpuesta` (REQ-BC-11).
- [x] 4.2 Completar `src/reportes/dto/balance-comprobacion-response.dto.ts`:
  clases DTO públicas (`LineaBalanceComprobacionDto`,
  `CuentaNaturalezaOpuestaDto`, `BalanceComprobacionResponseDto`) con `@ApiProperty`
  en cada campo, + `toBalanceComprobacionResponse(result, {desde, hasta})`.
- [x] 4.3 Verde: `pnpm exec jest src/reportes/dto/balance-comprobacion-response.dto.spec.ts`.

## 5. Service

- [x] 5.1 Escribir `src/reportes/balance-comprobacion.service.spec.ts` con mock
  TIPADO de `EeffSaldosReaderPort` y `PeriodosReaderPort` (NO Prisma, §7.8).
  Cubrir:
  - REQ-BC-01: modo rango directo; modo periodoFiscalId resuelto vía
    `obtenerRangoFechas`; ambos modos → `RangoAmbiguoError`; ningún modo →
    `RangoRequeridoError`.
  - REQ-BC-02: formato inválido / `desde>hasta` / modo rango incompleto →
    `RangoInvalidoError`; `periodoFiscalId` null → `PeriodoNoEncontradoError`.
  - REQ-BC-03/06: orquestación correcta (usa `obtenerSaldosEnRango`, NUNCA
    `obtenerSaldosHasta`); pasa `incluirAnulados` al port (REQ-BC-08, default false).
  - REQ-BC-09: `tenantId` propagado como primer argumento a cada lectura.
- [x] 5.2 Implementar `src/reportes/balance-comprobacion.service.ts`
  (`@Injectable`, inyecta los dos ports por símbolo, clon estructural de
  `EstadoResultadosService`; `Promise.all` de las dos lecturas; delega al builder;
  mapea a DTO).
- [x] 5.3 Verde: `pnpm exec jest src/reportes/balance-comprobacion.service.spec.ts`.

## 6. Controller + module

- [x] 6.1 Agregar `@Get('balance-comprobacion')` a
  `src/reportes/eeff.controller.ts`: `@RequirePermissions('contabilidad.eeff.read')`,
  `@ApiOperation`, `@ApiOkResponse({ type: BalanceComprobacionResponseDto })`,
  spread condicional por `exactOptionalPropertyTypes` (§2.5.1). Inyectar
  `BalanceComprobacionService` en el constructor.
- [x] 6.2 Registrar `BalanceComprobacionService` en `providers` de
  `src/reportes/reportes.module.ts` (sin adapter nuevo, sin import nuevo —
  `EEFF_SALDOS_READER_PORT` y `PeriodosReaderModule` ya están).

## 7. Integración / E2E del endpoint

- [x] 7.1 Escribir `test/balance-comprobacion.e2e-spec.ts` (clon de
  `test/balance-general.e2e-spec.ts`, fixtures con `test-factory`). Cubrir vía HTTP:
  - REQ-BC-01: rango directo 200; periodoFiscalId 200; ambos modos 422; sin modo 422.
  - REQ-BC-02: formato inválido / `desde>hasta` 422; periodoFiscalId ajeno 422.
  - REQ-BC-03/06: 4 columnas y cuadre `cuadra=true` con comprobantes balanceados.
  - REQ-BC-04: cuenta de detalle sin movimiento ausente.
  - REQ-BC-07: cuenta de naturaleza opuesta listada.
  - REQ-BC-08: anulado excluido por default; incluido con `incluirAnulados=true`.
  - REQ-BC-09: aislamiento entre tenants (CRÍTICO).
  - REQ-BC-10: 403 sin `contabilidad.eeff.read`; 403 módulo deshabilitado.
  - REQ-BC-11: montos string "NNN.NN", fechas "YYYY-MM-DD", `cuadra` boolean.
  - REQ-BC-12: rango sin movimiento → reporte vacío cuadrado.
- [x] 7.2 Verde E2E (Postgres arriba, ver §11.3):
  `DATABASE_URL=... JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh
  pnpm exec jest test/balance-comprobacion.e2e-spec.ts --runInBand --forceExit`.

## 8. Contrato OpenAPI (contract-drift)

- [x] 8.1 Regenerar `backend/openapi.json` (`pnpm run openapi:dump` o equivalente).
- [x] 8.2 Regenerar `frontend/src/types/api.generated.ts` (`pnpm run gen:api-types`
  en `frontend/`).
- [x] 8.3 Commitear ambos artefactos junto al código (si no, el job CI
  `contract-drift` rompe el build).

## 9. Cierre de calidad

- [x] 9.1 Typecheck: `pnpm exec tsc --noEmit -p tsconfig.json` (cero `any`, §2.5).
- [x] 9.2 Lint: `pnpm run lint` (y `--fix` si aplica).
- [x] 9.3 Regresión del módulo:
  `pnpm exec jest src/reportes/` + e2e de `reportes` (sin romper Balance General /
  Estado de Resultados existentes).
- [x] 9.4 Verificar comentarios regulatorios presentes (§2.2: Código Tributario
  art. 47 / cuadre §4.1) y JSDoc en el builder y el service.
