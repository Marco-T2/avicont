# Tasks: Verificador de movimientos bancarios

> 1 grupo = 1 commit atómico. TDD estricto: test (RED) antes que implementación (GREEN).
> Verde backend = `cd backend && pnpm exec tsc --noEmit -p tsconfig.json && NODE_OPTIONS="--experimental-vm-modules" DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" pnpm exec jest src/conciliacion-bancaria`
> Backend completo (grupos 1–7) verde ANTES de arrancar frontend (grupo 8).

## Grupo 1 — Migración a mano + schema (D8) · `feat(db): add ordenFisico and org+fecha index to movimientos_bancarios`

- [x] 1.1 `schema.prisma`: `ordenFisico Int?` + `@@index([organizationId, fecha])` en `MovimientoBancario`.
- [x] 1.2 Escribir A MANO `prisma/migrations/<ts>_verificador_orden_fisico/migration.sql`: `ALTER TABLE ... ADD COLUMN "ordenFisico" INTEGER;` + `CREATE INDEX "movimientos_bancarios_organizationId_fecha_idx" ...`. NUNCA `migrate dev` ciego.
- [x] 1.3 Protocolo §11.6: `grep -E '^DROP (INDEX|EXTENSION|TYPE|TABLE)' migration.sql` → cero matches (precedente: `migrate dev` llegó a generar `DROP TABLE comprobantes_audit`, 210k filas).
- [x] 1.4 Aplicar con `DATABASE_URL=... pnpm exec prisma migrate deploy` + `pnpm exec prisma generate`; verificar `migrate status` limpio.
- [x] 1.5 Verde backend (comando del header).

## Grupo 2 — Endurecer arch-spec (D9) · `test(conciliacion): harden arch spec to cover $queryRaw`

Depende de: nada. DEBE mergear antes del grupo 5 (primer raw del módulo).

- [x] 2.1 `src/conciliacion-bancaria/no-escribe-comprobantes.arch.spec.ts` (raíz del módulo, **no** `adapters/`): el chequeo de SQL crudo (línea ~118) pasa de `$executeRaw` a `$executeRaw || $queryRaw` contra `TABLAS_PROHIBIDAS`. La ubicación importa: el spec escanea `__dirname`, así que moverlo achicaría su alcance al subdirectorio.
- [x] 2.2 Validar por MUTACIÓN: meter un `$queryRaw` de prueba contra `comprobantes` → spec ROJO; sacarlo → VERDE. Documentar en el commit.
- [x] 2.3 Verde backend.

## Grupo 3 — Captura `ordenFisico` en importador (REQ-CB-21) · `feat(conciliacion): persist ordenFisico on import`

Depende de: grupo 1.

- [x] 3.1 RED — extender `extracto-importador.service.integration.spec.ts`: hashes IDÉNTICOS contra los fixtures existentes (reimportar = "0 nuevos, N ya existían", preexistentes conservan `ordenFisico=null`). **Este test manda: si un hash cambia, la captura está MAL — parar.** GATE PASÓ: sha256 del set de hashes idéntico al valor congelado pre-change.
- [x] 3.2 RED — tests: fixture DESC → fila física 0 recibe `ordenFisico` máximo y el cronológicamente primero `0`; secuencia `NO_MONOTONA` → todos `null` (nunca adivinar).
- [x] 3.3 GREEN — `ports/movimiento-bancario.repository.port.ts`: `MovimientoBancarioCreateData` += `ordenFisico: number | null`; `crearMuchos` lo mapea en el adapter.
- [x] 3.4 GREEN — `extracto-importador.service.ts`: mover `ordenarCronologico` ANTES de `ordenarCanonico`, `Map` de identidad `posCronologica`, pasar `posCronologica.get(item.movimiento) ?? null`. `calcularHashDedup` NO se toca.
- [x] 3.5 Verde backend (3.1 y 3.2 en verde juntos).

## Grupo 4 — Workspace adopta el orden (D10, REQ-CB-22) · `feat(conciliacion): adopt presentation order in workspace listing`

Depende de: grupo 3.

- [x] 4.1 RED — actualizar los tests de orden EXISTENTES de `listarPorCuentaBancariaEnRango` (van a romper: hoy `[{fecha},{ordinalDia},{id}]`) + test nuevo: horas `09:15/14:02/21:40` con ids desordenados salen cronológicos. NOTA: no existía NINGÚN test que fijara el orden viejo (vivía solo en el adapter, como dice REQ-CB-22) — se creó `adapters/prisma-movimiento-bancario.repository.integration.spec.ts` con 5 tests de orden (4 RED contra el orden viejo).
- [x] 4.2 GREEN — adapter: orderBy `fecha ASC, hora ASC NULLS LAST, ordenFisico ASC NULLS LAST, id ASC`; actualizar JSDoc del port.
- [x] 4.3 Verde backend + suite del workspace (`jest src/conciliacion-bancaria`).

## Grupo 5 — Port +5 métodos + adapter (D1/D2/D3) · `feat(conciliacion): add cross-account listing queries to repository`

Depende de: grupos 1 y 2.

- [x] 5.1 RED — `prisma-movimiento-bancario.repository.integration.spec.ts` (Postgres real, obligatorio para el raw; datos acotados a tenants creados por el test): `listarCrossCuenta` orden con `hora`/`ordenFisico` null + **determinismo: 2 páginas consecutivas sin duplicar ni perder fila** (protege el `id ASC` final); `contarCrossCuenta`; `totalesPorMoneda`; `listarIdsConMatch`; `saldosVigentes` (empates intra-día → misma fila que cierra el listado por inversión `DESC NULLS FIRST`, `hora` null, `saldo` null ⇒ null sin fallback, multi-tenant Anti-31, cuenta de otro tenant ⇒ vacío).
- [x] 5.2 GREEN — port: `FiltrosListadoMovimientos` + 5 abstracts con JSDoc; adapter: builder Prisma para listado/count/groupBy, `$queryRaw` `DISTINCT ON` con `Prisma.sql` bindeado, `numeric` string → `Decimal` en el boundary.
- [x] 5.3 Arch-spec sigue verde (el raw pega contra `movimientos_bancarios`). Verde backend. Nota: el arch-spec endurecido CAZÓ un falso positivo real — un comentario del adapter decía "de comprobantes" en el mismo archivo del `$queryRaw`; se reformuló el comentario (el chequeo es textual a propósito).

## Grupo 6 — DTO + service + controller (REQ-VMB-01..09, 11..13) · `feat(conciliacion): expose GET /movimientos-bancarios unified ledger`

Depende de: grupos 4 y 5.

- [x] 6.1 RED — `dto/listar-movimientos-bancarios.dto.spec.ts`: `desde`/`hasta` obligatorios `YYYY-MM-DD`, `limit` max 200, montos `@Matches(/^\d+(\.\d{1,2})?$/)`.
- [x] 6.2 RED — `movimientos-bancarios.service.spec.ts` (ports mockeados): rango invertido → `CONCILIACION_LISTADO_RANGO_INVALIDO` (422); glosa normalizada con `normalizarDescripcion`; derivación `estadoEfectivo` por página (roto/sin match, sin escrituras); auditoría SOLO con filtro `estado` (chunks, cap 100 + total real); merge `saldos` con `CuentaBancariaRepositoryPort.listar` (cuenta sin movimientos ⇒ null/null); totales por moneda sin conversión BOB; montos string/fechas `YYYY-MM-DD`.
- [x] 6.3 GREEN — `dto/listar-movimientos-bancarios.dto.ts` (query + response), `DomainError` nueva, `movimientos-bancarios.service.listar()` (orquesta/deriva/audita), controller `@Get()` con `contabilidad.conciliacion.read` (sin permisos nuevos). DESVÍO documentado: el port ganó un 6º método `listarPorIds(tenantId, ids)` — el design tipa `listarIdsConMatch` como `{id}[]` pero la franja `rotos` de la response exige datos del movimiento (cuentaBancariaId/fecha/monto/descripcion) y ningún método existente resuelve por ids; acotado al cap 100, con JSDoc e integration test propio.
- [x] 6.4 Regenerar `backend/openapi.json` + `frontend/src/types/api.generated.ts` (job `contract-drift` rompe si falta).
- [x] 6.5 Verde backend.

## Grupo 7 — E2E · `test(conciliacion): e2e for movimientos bancarios verifier`

Depende de: grupo 6.

- [x] 7.1 `test/conciliacion-verificador.e2e-spec.ts`: filtros combinados; default sin `estado` muestra todo; asimetría `.read` 200 / sin `.read` 403; sin pack 404; vínculo roto en franja de auditoría; paginación con `total`. 9 tests (incluye además saldos null-honesto REQ-VMB-08/09, totales por moneda REQ-VMB-11 y multi-tenant REQ-VMB-13 en página/totales/saldos).
- [x] 7.2 Correr: `NODE_OPTIONS="--experimental-vm-modules" DATABASE_URL=... JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh pnpm exec jest test/ --runInBand --forceExit`. ⚠️ **VACÍA la base local** (`cleanupTestData()` sin `WHERE`): recuperar con `pnpm run seed` + `pnpm run seed:packs`. Resultado: 46 suites / 603 tests verdes — ningún e2e ajeno rojo (el orden nuevo del workspace no rompió nada).

## Grupo 8 — Frontend (REQ-VMB-10, 14) · `feat(conciliacion): verificador bancario frontend`

Depende de: grupos 1–7 verdes (backend completo primero).

- [ ] 8.1 RED — vitest: hook `useMovimientosBancarios`; saldo dual (columna `saldo` visible solo con cuenta seleccionada, oculta cross-cuenta); badge desactualización cuando `fechaUltimoMovimiento < hasta`; suma solo misma moneda con `null` excluido + indicador; franja auditoría con link al workspace; nav item fail-closed (sin permiso o sin pack ⇒ oculto y ruta bloqueada).
- [ ] 8.2 GREEN — `frontend/src/features/verificador-bancario/` (`api/ hooks/ components/ pages/`, molde conciliación; badges reusados de `features/conciliacion`); ruta `/movimientos-bancarios`.
- [ ] 8.3 GREEN — `nav-items.ts`: ítem "Movimientos bancarios" en Contabilidad con `conciliacion.read` + `pack` (molde línea 189).
- [ ] 8.4 Verde: `cd frontend && pnpm exec tsc --noEmit && pnpm exec vitest run`.
