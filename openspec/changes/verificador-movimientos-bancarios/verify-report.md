# Verification Report

**Change**: `verificador-movimientos-bancarios`
**Fecha**: 2026-07-25
**Mode**: Strict TDD
**Branch**: `feat/conciliacion-verificador-movimientos` (9 commits + artefactos, `046ea09`..`3a12469`)
**Veredicto**: **APPROVED_WITH_WARNINGS** — 0 CRITICAL / 1 WARNING / 2 SUGGESTION

---

## Completeness

| Métrica | Valor |
|---------|-------|
| Tasks totales | 35 (grupos 1–9) |
| Tasks completas `[x]` | 35 |
| Tasks incompletas | 0 |

La única deuda declarada en tasks.md (9.5 "e2e pendiente de correr") quedó **CERRADA en esta verificación**: la suite e2e completa se corrió y las aserciones de `saldosPorMoneda` pasaron.

---

## Build & Tests Execution (evidencia real, no estática)

| Suite | Comando | Resultado |
|-------|---------|-----------|
| Backend typecheck | `tsc --noEmit` | ✅ limpio |
| Backend lint | `eslint src test` | ✅ limpio |
| Backend unit+integración | `jest src/` | ✅ **206 suites / 2883 passed** (+1 todo) |
| Backend e2e | `jest test/ --runInBand --forceExit` | ✅ **46 suites / 603 passed** — incluye `conciliacion-verificador.e2e-spec.ts` (9 tests) y las aserciones de `saldosPorMoneda` de `3a12469` que nunca se habían ejecutado |
| Frontend typecheck | `tsc --noEmit` | ✅ limpio |
| Frontend vitest | `vitest run` | ✅ **234 files / 1822 passed** |
| Contract drift | regeneré `openapi:dump` + `gen:api-types` | ✅ **cero drift** — ambos artefactos byte-idénticos a lo commiteado |
| Re-seed post-e2e | `pnpm run seed` + `pnpm run seed:packs` | ✅ corrido y confirmado (founder + org piloto + entitlement conciliación activo + cache Redis invalidado, 52 claves) |

**Coverage de archivos cambiados** (`jest src/conciliacion-bancaria --coverage`, 485 tests):

| Archivo | Stmts | Branch | Rating |
|---------|-------|--------|--------|
| `extracto-importador.service.ts` | 100% | 97.2% | ✅ Excelente |
| `movimientos-bancarios.service.ts` | 99.1% | 95.7% | ✅ Excelente |
| `prisma-movimiento-bancario.repository.ts` | 95.3% | 86.4% | ✅ Excelente |
| `listar-movimientos-bancarios.dto.ts` | 90.4% | 100% | ⚠️ Aceptable (las líneas sin cubrir son response-DTOs decorados; `toListado...` la cubre el e2e, que no entra en este run) |
| `movimiento-bancario.repository.port.ts` | 100% | 100% | ✅ Excelente |

---

## Los 6 puntos de insistencia — veredicto uno por uno

### 1. REQ-VMB-02 — la vista por defecto NO filtra por estado ✅ PASS
- DTO: `estado?` es `@IsOptional()` **sin default** (`listar-movimientos-bancarios.dto.ts:43-45`).
- Controller: spread condicional `...(query.estado !== undefined ? … : {})` (`movimientos-bancarios.controller.ts:73`) — nunca inyecta un valor.
- Service: `construirFiltros` solo agrega `estado` si vino (`movimientos-bancarios.service.ts:259`); la auditoría se activa con `consulta.estado !== undefined` (línea 232), jamás al revés.
- Frontend: sentinel `TODOS_LOS_ESTADOS` es el **valor inicial** del select y se omite del payload (`verificador-filtros.tsx:59,92`).
- Prueba de conducta: e2e línea 392 crea PENDIENTE+CONCILIADO+IGNORADO y verifica que los tres aparecen y `total` los cuenta a todos. **Verde en ejecución real.**

### 2. Hash de dedup intacto ✅ PASS
- `git diff main...HEAD -- domain/hash-dedup.ts domain/ordinal-dia.ts` → **diff VACÍO** (verificado directamente).
- Además, doble red de conducta: test GATE con sha256 **congelado pre-change** del conjunto de hashes del fixture BancoSol (`extracto-importador.service.integration.spec.ts`, valor `5518124c…`) en verde, y test de reimportación "0 nuevos, 20 ya existían" con preexistentes conservando `ordenFisico=null`.

### 3. `ordenFisico` sale del orden CRONOLÓGICO ✅ PASS
- Implementación: `ordenarCronologico(parseado.movimientos)` → `Map` de **identidad** `posCronologica` → `posCronologica.get(item.movimiento) ?? null` (`extracto-importador.service.ts:154-176`). `NO_MONOTONA` ⇒ `null` en todos.
- Congelado con fixture DESC **real** (`fortaleza-ultimos-30.xlsx`): el día más antiguo abre 17:36→17:37→17:38 (el caso del descuadre fantasma de PR #250) y sus `ordenFisico` son `[0,1,2]`; la fila física 0 recibe el máximo. Si se usara el índice crudo, la aserción de fecha no-decreciente por `ordenFisico` rompería.

### 4. Inversión `DESC NULLS FIRST` en `saldosVigentes` ✅ PASS — **validado por mutación**
- SQL exacto del design D3 en el adapter (`fecha DESC, hora DESC NULLS FIRST, "ordenFisico" DESC NULLS FIRST, id DESC`).
- Tests contra Postgres real: hora `null` (que cierra el día en presentación) gana el saldo vigente; `ordenFisico` máximo gana sin hora; `saldo=null` sin fallback; corte excluye posteriores; Anti-31.
- **Mutación ejecutada por mí**: cambié `NULLS FIRST` → `NULLS LAST` en el raw → el spec de `saldosVigentes` se puso ROJO (1 failed). Restaurado, working tree limpio.

### 5. Determinismo de la paginación offset ✅ PASS (con matiz — ver S1)
- `ORDEN_PRESENTACION` cierra con `{ id: 'asc' }`; el test de determinismo usa **12 filas con empate TOTAL** (fecha/hora/ordenFisico idénticos), 2 páginas de 6, sin duplicar ni perder.
- **Mutación ejecutada por mí**: quité `{ id: 'asc' }` → la suite del adapter se puso ROJA (1 failed). El invariante ESTÁ protegido por mutación… pero el test que lo cazó fue "ordenFisico null degrada a fecha, hora, id" (ids adversariales), **no** el test de determinismo, que pasó de casualidad (Postgres devolvió orden de heap estable para el empate total). Ver SUGGESTION S1.

### 6. Una lectura NUNCA escribe ✅ PASS — **validado por mutación**
- `listar()` y todo su árbol (`verificarMatches`, `auditarVinculos`, `aMovimientoVerificadorView`) solo llaman métodos de lectura; la derivación de anclas es EN MEMORIA. El unit test de REQ-VMB-06 (línea 195) asserta explícitamente que ningún port de escritura fue tocado.
- Arch-spec endurecido (D9): ahora `$executeRaw || $queryRaw` contra `TABLAS_PROHIBIDAS`. **Mutación ejecutada por mí**: planté un archivo temporal con `$queryRaw` + `comprobantes` en el módulo → el spec se puso ROJO; lo borré → VERDE. El `$queryRaw` legítimo de `saldosVigentes` pega contra `movimientos_bancarios` y pasa.

---

## Chequeos transversales

| Chequeo | Resultado |
|---------|-----------|
| §4.2 multi-tenant / Anti-31 | ✅ `whereListado` (builder ÚNICO compartido por página/count/totales/ids — anti-drift) siempre incluye `organizationId`; el `$queryRaw` bindea `"organizationId" = ${tenantId}`; `listarPorIds` filtra tenant; e2e REQ-VMB-13 verde (página, totales, saldos, cuenta ajena ⇒ vacío) |
| §4.5 dinero | ✅ Montos string en DTOs/response; `Money`/`Prisma.Decimal` en backend; `numeric` del raw → `Decimal` en el boundary. **Frontend sin aritmética de dinero**: grep de `parseFloat/Number(/toFixed` en la feature → cero; `lib/saldos.ts` solo compara fechas; `sumarMontos`/`aCentavos` borrados (grupo 9); test unit "0.10+0.20=0.30 por decimal.js" verde |
| §4.6 fechas | ✅ `YYYY-MM-DD` en query y response; `FechaContable` en el service; comparación lexicográfica en `estaSaldoDesactualizado` (sin `new Date`); cero `new Date()` sin argumento en domain/service; test frontend "formatea fecha sin corrimiento UTC" verde |
| Cero `any` | ✅ Grep en backend y frontend de la feature: cero (solo falsos positivos `createMany`/`findMany`) |
| §14.7 gating fail-closed | ✅ Nav item con `requiredPermission` ∧ `pack` ∧ `vertical`; 4 tests de nav (visible/sin pack/sin permiso) + route tests (con/sin `.read`) + e2e 404 sin pack / 403 sin `.read` / 200 con solo `.read` |
| REQ-CB-15 / D9 | ✅ Arch-spec 4/4 verde y endurecimiento validado por mutación (arriba) |
| Migración | ✅ `20260724233000_verificador_orden_fisico/migration.sql` A MANO, aditiva pura: `ADD COLUMN` + `CREATE INDEX`, **cero `DROP`** (protocolo §11.6 cumplido) |
| Contrato openapi/types | ✅ Regenerados por mí ambos artefactos: **byte-idénticos** a lo commiteado (drift cero); aliases en `types/api.ts` presentes |

---

## Spec Compliance Matrix

### REQ-VMB (capability nueva) — 14/14 requirements, 26/26 escenarios COMPLIANT

| Req | Escenario | Test (verde en ejecución) | Result |
|-----|-----------|---------------------------|--------|
| VMB-01 | Un request, todos los bancos | e2e + `repository.integration` "un solo request trae TODAS las cuentas" | ✅ |
| VMB-01 | Rango invertido 422 | e2e "rango invertido 422" + service.spec:150 | ✅ |
| VMB-01 | Rango ausente 400 | e2e + dto.spec:27 | ✅ |
| VMB-02 | Sin filtro nada se esconde | e2e:392 (3 estados + total) | ✅ |
| VMB-03 | Glosa con diacríticos | e2e:440 + service.spec:163 (normalización D4) + integration filtros | ✅ |
| VMB-03 | Cuenta + monto combinados | e2e:440 + integration "filtros combinados" | ✅ |
| VMB-04 | Página más allá del total | e2e:494 | ✅ |
| VMB-04 | Limit 500 rechazado | e2e:521 + dto.spec:39 (200 ok, 201/500/0 no) | ✅ |
| VMB-05 | 2 páginas sin duplicar/perder | integration "determinismo del offset" (12 empates totales) + e2e:494 | ✅ (ver S1) |
| VMB-05 | Sin hora al final del día | integration "hora null NULLS LAST" | ✅ |
| VMB-05 | `ordenFisico` null degrada | integration "degrada a fecha, hora, id" (caza la mutación de `id ASC`) | ✅ |
| VMB-06 | Vínculo roto ⇒ PENDIENTE sin UPDATE | service.spec:195 + e2e:545 ("sin escribir nada") | ✅ |
| VMB-06 | Sin match ⇒ PENDIENTE | service.spec:195 | ✅ |
| VMB-07 | Filtro esconde ⇒ auditoría destapa | e2e:545 + service.spec:236 | ✅ |
| VMB-07 | Sin filtro ⇒ `aplicada=false` | e2e:392 + service.spec:229 | ✅ |
| VMB-07 | >100 rotos ⇒ cap + total real | service.spec:236 (unit, ports mockeados) + banner.test "total real al tope de 100" | ✅ |
| VMB-08 | Saldo vigente con fecha | e2e:607 + integration saldosVigentes | ✅ |
| VMB-08 | Cuenta sin movimientos null/null | e2e:607 + service.spec:280 (merge) | ✅ |
| VMB-08 | Misma fila que cierra el listado | integration "empate intra-día… DESC NULLS FIRST" + mutación | ✅ |
| VMB-09 | Null honesto sin fallback | e2e:607 + integration "sin fallback" | ✅ |
| VMB-10 | Cross-cuenta oculta saldo + marca | movimientos-tabla.test:45 + saldos-por-cuenta.test:52 | ✅ |
| VMB-10 | Null excluida con indicador | service.spec:383 + saldos-por-cuenta.test:81 (anti-recálculo) | ✅ |
| VMB-10 | Suma null, nunca "0.00" | service.spec:421 + saldos-por-cuenta.test:150 | ✅ |
| VMB-11 | BOB y USD separados, sin mezcla | e2e:430 + service.spec:322 + integration groupBy | ✅ |
| VMB-12 | `.read` 200 / sin `.read` 403 / sin pack 404 | e2e:363,369 | ✅ |
| VMB-13 | Tenant ajeno invisible / cuenta ajena vacío | e2e:677 + integration Anti-31 ×3 | ✅ |
| VMB-14 | Ítem oculto y ruta bloqueada | nav-list.test:820-854 + route.test:52-71 | ✅ |

### Delta REQ-CB — 2/2 requirements, 6/6 escenarios COMPLIANT

| Req | Escenario | Test | Result |
|-----|-----------|------|--------|
| CB-21 | Export DESC ⇒ fila 0 recibe el máximo | importador.integration "fortaleza-ultimos-30" | ✅ |
| CB-21 | NO_MONOTONA ⇒ null | importador.integration "nunca se adivina" | ✅ |
| CB-21 | Hash no cambia, reimportar no duplica | GATE sha256 congelado + "0 nuevos, 20 ya existían" | ✅ |
| CB-21 | Unión mismo día en orden del extracto | repository.integration "ordenFisico desempata dentro del día" | ✅ |
| CB-22 | Mismo orden en las dos pantallas | mismo `ORDEN_PRESENTACION` compartido (constante única en el adapter) + specs de orden en ambos métodos | ✅ |
| CB-22 | Con hora, el desempate deja de ser UUID | repository.integration "ids adversariales" (orden por UUID sería el inverso exacto) | ✅ |

**Compliance**: 32/32 escenarios con test verde en ejecución real.

---

## Coherence (Design D1–D10)

| Decisión | ¿Seguida? | Nota |
|----------|-----------|------|
| D1 builder Prisma para el listado | ✅ | `findMany` + `orderBy` con `nulls` nativo |
| D2 `$queryRaw` DISTINCT ON, primer raw | ✅ | `Prisma.sql` bindeado, boundary `numeric`→`Decimal` |
| D3 inversión `DESC NULLS FIRST` | ✅ | Validada por mutación |
| D4 glosa normalizada + `contains` a secas | ✅ | `normalizarDescripcion` en el service, sin `mode: insensitive` |
| D5 auditoría solo con filtro `estado` | ✅ | `consulta.estado !== undefined` |
| D6 franja `saldos` siempre en la response | ✅ | Frontend decide presentación |
| D7 saldo null sin fallback | ✅ | Test integration + e2e |
| D8 migración a mano | ✅ | Cero DROP |
| D9 arch-spec endurecido | ✅ | Validado por mutación |
| D10 workspace adopta el orden | ✅ | `ORDEN_PRESENTACION` compartido; JSDoc del port actualizado |
| Desvío documentado | ✅ | 6º método `listarPorIds` (tasks 6.3): justificado — la franja `rotos` exige datos del movimiento y ningún método existente resolvía por ids; acotado al cap 100, con JSDoc + integration test propio. Desvío VÁLIDO |

---

## TDD Compliance (Strict TDD)

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reportada | ⚠️ | NO existe `apply-progress.md`; la evidencia RED/GREEN vive embebida en `tasks.md` (por grupo, con gate de hashes congelado y notas de mutación) — ver W1 |
| Todos los tasks con tests | ✅ | 9/9 grupos con tests dedicados |
| RED confirmado (tests existen) | ✅ | 10 archivos de test nuevos/extendidos verificados en el diff |
| GREEN confirmado (tests pasan) | ✅ | 2883 + 603 + 1822 en ejecución real |
| Triangulación adecuada | ✅ | Escenarios +/− en todos los REQ (ej. saldo null/con saldo, con/sin filtro, ASC/DESC/no-monótono) |
| Safety net en archivos modificados | ✅ | Hash GATE pre-change; workspace: 4 tests RED contra el orden viejo antes del cambio (tasks 4.1); regresión completa verde |

### Test Layer Distribution (archivos del change)
| Layer | Files | Tool |
|-------|-------|------|
| Unit | 3 backend (service, dto, arch) + 7 frontend | jest / vitest+RTL |
| Integración (Postgres real) | 2 (repository 20 tests, importador +5) | jest + Postgres |
| E2E | 1 (`conciliacion-verificador.e2e-spec.ts`, 9 tests) | supertest |

### Assertion Quality
✅ Todas las aserciones verifican conducta real con valores concretos (montos exactos, ids adversariales elegidos para que el orden UUID sea el inverso, hash congelado). Los `for` de cronología en el importador NO son ghost loops: van precedidos de `toHaveLength(20/30)`. Cero tautologías, cero smoke-only.

---

## Issues Found

### CRITICAL
Ninguno.

### WARNING
- **W1 — Falta `apply-progress.md`** en `openspec/changes/verificador-movimientos-bancarios/`. El protocolo Strict TDD espera el artefacto con la tabla "TDD Cycle Evidence" (su ausencia es nominalmente CRITICAL por la letra del módulo). Lo bajo a WARNING porque la evidencia SÍ existe y es verificable — está embebida en `tasks.md` (RED/GREEN por grupo, valor del gate de hashes, resultados de mutación) y yo la re-verifiqué toda por ejecución. Queda a decisión del orquestador si `sdd-archive` requiere el artefacto formal.

### SUGGESTION
- **S1 — El test "determinismo del offset" no es autosuficiente** (`prisma-movimiento-bancario.repository.integration.spec.ts:343`). Con la mutación de quitar `{ id: 'asc' }`, ese test PASÓ (Postgres devolvió orden de heap estable para el empate total); quien puso rojo la suite fue "ordenFisico null degrada a fecha, hora, id". El invariante está protegido por mutación a nivel suite, pero el comentario del test ("sin el id ASC final… duplica o pierde") promete más de lo que ese test garantiza. Mejora barata: assertar además que `vistos` viene ordenado por `id` ASC.
- **S2 — Dropdown de cuentas capado a `pageSize: 100`** (`verificador-filtros.tsx:54`): con >100 cuentas bancarias el filtro truncaría opciones. Ya documentado inline como convención cross-feature (§14.6); irrelevante hoy (7 bancos), solo dejar constancia.

---

## Verdict

**APPROVED_WITH_WARNINGS** — 0 CRITICAL / 1 WARNING / 2 SUGGESTION.

Los 6 puntos de insistencia pasan (3 de ellos validados por mutación ejecutada durante el verify). 32/32 escenarios de spec con test verde en ejecución real. Las 3 suites completas verdes: backend 206/2883, e2e 46/603 (primera corrida de las aserciones `saldosPorMoneda`), frontend 234/1822. Contract drift: cero (regenerado y comparado). Migración aditiva pura. Base local re-sembrada post-e2e. Working tree limpio (las mutaciones de verificación fueron restauradas vía git).
