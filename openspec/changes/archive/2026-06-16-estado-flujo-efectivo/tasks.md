# Tasks — Estado de Flujo de Efectivo (EFE)

> Change: `estado-flujo-efectivo` · BACKEND-ONLY · TDD red→green · describe/it en español
> Comandos operativos: CLAUDE.md §11 (correr desde `backend/`, `DATABASE_URL` inline).

---

## Fase 0 — Enum de dominio + schema

- [x] Agregar enum `ActividadFlujo { EFECTIVO, OPERACION, INVERSION, FINANCIACION }` a
      `backend/src/common/domain/enums.ts` con comentario de dueño/consumidores (design §8).
- [x] Agregar enum `ActividadFlujo` (mismos 4 valores) a `backend/prisma/schema.prisma`.
- [x] Agregar campo nullable `actividadFlujo ActividadFlujo?` al model `Cuenta` con
      comentario (NIC 7, heurística si null).

## Fase 1 — Migración aditiva (protocolo §11.6)

- [x] Generar migración: `cd backend && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" pnpm exec prisma migrate dev --name estado_flujo_efectivo`.
- [x] Abrir el `migration.sql` generado y `grep -E "^DROP (INDEX|EXTENSION|TYPE)"`. Borrar
      a mano cualquier `DROP` de objetos raw SQL vivos (pg_trgm, índices trigram de
      contactos, triggers `comprobantes_audit`, CHECKs de organizations/lotes, índice
      parcial de documento físico). La migración debe ser SOLO `CREATE TYPE` + `ADD COLUMN`.
- [x] Aplicar y verificar post-apply que los objetos raw siguen presentes
      (`\d cuentas` muestra `actividadFlujo`; `\d contactos` conserva índices trigram).
- [x] `DATABASE_URL=... pnpm exec prisma generate`.

## Fase 2 — Port + adapter (única extensión, sin método nuevo)

- [x] (RED) Extender `prisma-eeff-saldos-reader.adapter.integration.spec.ts`: assert que
      `obtenerEstructuraCuentas` devuelve `actividadFlujo` (NULL por default; valor seteado).
- [x] Agregar `actividadFlujo: ActividadFlujo | null` a `CuentaEstructuraRow` en
      `ports/eeff-saldos-reader.port.ts` (firmas de métodos SIN cambio).
- [x] Agregar `actividadFlujo: true` al `select` de `obtenerEstructuraCuentas` en el adapter
      y mapear en el boundary vía `enum-mappers.ts` (enum Prisma → enum dominio).
- [x] (GREEN) Integration spec verde contra Postgres real.

## Fase 3 — Builder de dominio puro + unit tests (≥95%)

- [x] (RED) `domain/estado-flujo-efectivo.spec.ts`: escenarios de REQ-FE-04..11 y 17 —
      clasificación explícita vs heurística (5 ramos), efectivo (explícito/heurística/ninguna),
      resultado del ejercicio como punto de partida, signo de variaciones (activo↑ consume `-`,
      pasivo↑ libera `+`), partida no monetaria (depreciación acumulada), las 3 secciones,
      conciliación, cuadre con + y − (±0.01), no doble-conteo de ingresos/egresos, fila de
      saldo sin cuenta en estructura ignorada, EFE vacío cuadrado.
- [x] (RED) Unit del helper `resolverActividadFlujo`: prioridad del campo explícito + los 5
      ramos del default heurístico.
- [x] Implementar `domain/estado-flujo-efectivo.ts` (función pura `construirEstadoFlujoEfectivo`
      + `resolverActividadFlujo` + constante `CODIGO_EFECTIVO_PREFIJO='1.1.1'`). Reusar
      `calcularSaldoNeto` y `calcularResultadoEjercicioBob`. Comentarios regulatorios NIC 7.
- [x] Tipos internos del builder (`*Calculado` con `Money`) + interfaz `EstadoFlujoEfectivoResult`.
- [x] (GREEN) Unit verde, cobertura del builder ≥95%.

## Fase 4 — Errores de dominio

- [x] Crear `domain/estado-flujo-efectivo-errors.ts` con las 4 subclases `DomainError`
      (namespace `REPORTES_FLUJO_EFECTIVO_*`, todas 422), siguiendo `evolucion-patrimonio-errors.ts`.

## Fase 5 — Service + unit tests

- [x] (RED) `estado-flujo-efectivo.service.spec.ts`: resolución de rango (los 4 errores:
      REQUERIDO/AMBIGUO/INVALIDO/PERIODO_NO_ENCONTRADO), orquestación de las 4 lecturas
      (mocks del port — NUNCA Prisma), mapeo a DTO, toggle `incluirAnulados`.
- [x] Implementar `estado-flujo-efectivo.service.ts` (clon de `EvolucionPatrimonioService`,
      rango XOR período — sin `gestionId`): resolver rango → `Promise.all` de 4 lecturas →
      builder → mapper.
- [x] (GREEN) Unit del service verde.

## Fase 6 — DTOs (query + response + mapper)

- [x] Crear `dto/estado-flujo-efectivo-query.dto.ts` (`desde?`, `hasta?`, `periodoFiscalId?`,
      `incluirAnulados?`) con validación de formato; validación de exclusividad/rango va en
      el service.
- [x] Crear `dto/estado-flujo-efectivo-response.dto.ts`: tipos internos del builder + clases
      DTO (`@ApiProperty`, montos `string`, nullable tipado) + `toEstadoFlujoEfectivoResponse`
      (Money→string, Date→`YYYY-MM-DD`, signo preservado). Shape exacto en design §5.

## Fase 7 — Controller + módulo

- [x] Agregar método `obtenerFlujoEfectivo` a `eeff.controller.ts`: `@Get('flujo-efectivo')`,
      `@RequirePermissions('contabilidad.eeff.read')`, `@ApiOperation`,
      `@ApiOkResponse({ type: EstadoFlujoEfectivoResponseDto })`, spread condicional de query
      (exactOptionalPropertyTypes §2.5.1). `@RequireModule('contabilidad')` ya está a nivel clase.
- [x] Registrar `EstadoFlujoEfectivoService` en `reportes.module.ts` (providers + el service
      en el controller).

## Fase 8 — OpenAPI + contract-drift

- [x] `cd backend && pnpm run openapi:dump` → regenerar `backend/openapi.json`.
- [x] `cd frontend && pnpm run gen:api-types` → regenerar `frontend/src/types/api.generated.ts`.
- [x] Commitear ambos artefactos (el job CI `contract-drift` rompe si hay drift, §10.10).

## Fase 9 — E2E

- [x] (RED→GREEN) `test/estado-flujo-efectivo.e2e-spec.ts`: 200 con rango y con período,
      los 4 errores 422, 403 sin permiso y con módulo deshabilitado, aislamiento multi-tenant,
      cuadre del invariante, señales de calidad (sin efectivo / solo heurística), toggle
      `incluirAnulados`, cross-check `efectivoFinal − efectivoInicial == variacionNeta` (±0.01).

## Fase 10 — Verificación final

- [x] `cd backend && pnpm exec tsc --noEmit -p tsconfig.json` (0 errores) + `pnpm run lint` (0).
- [x] Unit + integration verdes (`pnpm exec jest src/` con `DATABASE_URL`).
- [x] E2E verde (`pnpm exec jest test/ --runInBand --forceExit` con env de §11.3).
- [x] Frontend typecheck verde (`cd frontend && pnpm exec tsc -b`) tras regenerar tipos.
