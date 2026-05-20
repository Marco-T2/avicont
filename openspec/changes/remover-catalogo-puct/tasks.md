# Tasks: remover-catalogo-puct

> Breakdown en **4 commits atómicos**. Cada checkbox `###` = un commit. **Verde
> entre cada commit** (regla #1 doc de deudas + config `apply.tdd: true`). Orden
> de afuera hacia adentro (design §8): inline → módulo → schema → docs. NO
> negociable: el seed LEE `CatalogoPuct` hoy; si se dropea antes de inlinear,
> queda roto.

## Reglas globales

- Idioma de código: español dominio + inglés framework (CLAUDE.md §1).
- Branch: `refactor/cuentas-remover-puct` — squash merge contra `main`.
- TDD strict (CLAUDE.md §10.6): test de regresión/ajuste PRIMERO en rojo, luego código a verde.
- Verde por commit: `npx tsc --noEmit -p tsconfig.json` + suite del subsistema tocado.
- Lectura de entrada OBLIGATORIA antes de tocar `comercial.ts`/schema: `docs/claude/dominio-contable.md` (CLAUDE.md §12.1).
- Toda inserción/query filtra `organizationId` (CLAUDE.md §4.2). Cero `any`. No `Co-Authored-By:`.
- Comportamiento observable NO cambia: 61 hojas, mismos códigos/nombres/niveles/clases, 8 conceptos `OrgConfiguracionContable`.

---

## Commit 1 — `refactor(cuentas): inline catálogo en seed comercial y renombrar mapeo`

> Inline-first (design Decisión 1-3). El seed se vuelve autocontenido ANTES de que el catálogo desaparezca. **TDD: actualizar la guarda de regresión del seed PRIMERO.**

### 1.1 ☑ Refactor `comercial.ts` autocontenido + rename mapeo + guarda de regresión

**Entrega**: `comercial.ts` deja de leer `CatalogoPuct` y de escribir `versionPuctMapeado`; `nombre` inline en `CUENTAS_HOJA_COMERCIAL`, `NOMBRES_ANCESTRO` + `claseCuentaDe()` + `nombreDe()` locales; `MAPEO_PUCT_A_CONCEPTO`→`MAPEO_CODIGO_A_CONCEPTO` y `porCodigoPuct`→`porCodigoInterno`. Test del mapeo renombrado y consumidor demo ajustado.

**TDD (rojo primero)**:
- `backend/prisma/seeds/prod/planes-cuentas/__tests__/puct-a-concepto.spec.ts` → **RENAME** a `codigo-a-concepto.spec.ts`; importar `MAPEO_CODIGO_A_CONCEPTO`; mismos 4 invariantes plantilla↔mapeo. (Escenario: *8 de 8 conceptos mapeados*).
- Reforzar/agregar guarda de regresión del seed: 61 hojas `esDetalle=true`, jerarquía + distribución por nivel idénticas, 8 `esRequeridaSistema` (`1.1.6.001`,`2.1.4.001`,`2.1.4.002`,`2.1.4.004`,`3.1.3.001`,`3.1.4.001`,`4.4.1.003`,`5.6.1.003`), 8/8 conceptos, filtrando `organizationId`, **sin** llamar `prisma.catalogoPuct.findMany`. (Escenarios: *Mismo total sin consultar CatalogoPuct*, *8 requeridas*, *codigoInterno conserva numeración*).

**Archivos (EDIT)**:
- `backend/prisma/seeds/prod/planes-cuentas/comercial.ts` — inline `nombre`; `NOMBRES_ANCESTRO`, `CLASE_POR_DIGITO`, `claseCuentaDe`, `nombreDe`; quitar `catalogoPuct.findMany`/`puctMap`; `upsert` deja de escribir `codigoPuct`/`nombrePuctSnapshot`/`versionPuctMapeado`; orden por `calcularNivelDesdeCodigo`; rename mapeo + `porCodigoInterno`.
- `backend/prisma/seeds/dev/seed-demo-tenant.ts` — `stats.porCodigoPuct` → `stats.porCodigoInterno`.

**Verde**: `npx tsc --noEmit -p tsconfig.json` + `npx jest prisma/seeds`.

---

## Commit 2 — `refactor(cuentas): remover superficie PUCT del módulo cuentas`

> Retirar VO/port/adapter/DTO/endpoint/validador/error codes y limpiar service/controller/module/repo/response. **TDD: ajustar specs (quitar casos PUCT) en el mismo commit que el código.**

### 2.1 ☑ Quitar maquinaria PUCT del módulo y ajustar specs

**Entrega**: módulo `cuentas` sin superficie PUCT. CRUD/tree/conceptos intactos.

**TDD (ajuste de specs)**:
- `backend/src/cuentas/cuentas.service.spec.ts` (EDIT) — quitar `MockCatalogo`, mock del reader y tests de `mapearPuct`/`resolverPuctSnapshot`.
- `backend/src/cuentas/domain/cuenta-validator.spec.ts` (EDIT) — quitar tests de `validarNivelPuct`.

**Archivos (DELETE)**:
- `backend/src/cuentas/domain/codigo-puct.ts` + `codigo-puct.spec.ts`
- `backend/src/cuentas/ports/catalogo-puct-reader.port.ts`
- `backend/src/cuentas/adapters/prisma-catalogo-puct-reader.ts`
- `backend/src/cuentas/dto/mapear-puct.dto.ts`

**Archivos (EDIT)**:
- `cuentas.service.ts` — quitar inject `CATALOGO_PUCT_READER_PORT`, `resolverPuctSnapshot()`, `mapearPuct()`, rama `codigoPuct` en `crear()`, import `validarNivelPuct`. (Escenario: *CRUD funciona igual sin PUCT*).
- `cuentas.controller.ts` — quitar endpoint `POST :id/mapear-puct` + import `MapearPuctDto`. (Escenario: *El endpoint mapear-puct deja de existir*).
- `cuentas.module.ts` — quitar provider `CATALOGO_PUCT_READER_PORT` + imports.
- `domain/cuenta-validator.ts` — quitar `validarNivelPuct` + `NIVEL_PUCT_REQUERIDO` + comentario §6.
- `domain/cuenta-errors.ts` — quitar `CODIGO_PUCT_INVALIDO`, `CODIGO_PUCT_NIVEL_INSUFICIENTE`. (Escenario: *Los códigos de error PUCT no se emiten*).
- `dto/create-cuenta.dto.ts` — quitar campo `codigoPuct?`. (Escenario: *Crear cuenta ignorando codigoPuct enviado*).
- `dto/cuenta-response.dto.ts` — quitar 3 campos + 3 líneas de `toCuentaResponse`. (Escenario: *Listar y obtener cuentas sin campos PUCT*).
- `ports/cuenta.repository.port.ts` — quitar `MapearPuctData`, método `mapearPuct`, 3 campos del create data.
- `adapters/prisma-cuenta.repository.ts` — quitar `mapearPuct` + import.

**Verde**: `npx tsc --noEmit -p tsconfig.json` + `npx jest src/cuentas/`.

---

## Commit 3 — `chore(db): drop CatalogoPuct y columnas codigoPuct de Cuenta`

> Migración destructiva nueva (design Decisión 4). NO editar `20260423023544_add_plan_cuentas_y_catalogo_puct`. Borrar seed PUCT + `ensurePuctSeeded()` en el mismo commit.

### 3.1 ☑ Drop schema PUCT + migración + borrar seed/parser/helper

**Entrega**: tabla `catalogo_puct`, 3 columnas de `Cuenta` e índice eliminados; carpeta `prisma/seeds/prod/puct/` borrada; E2E sin `ensurePuctSeeded`.

**Archivos (EDIT schema)**:
- `backend/prisma/schema.prisma` — borrar `model CatalogoPuct`; en `model Cuenta` borrar `codigoPuct`, `nombrePuctSnapshot`, `versionPuctMapeado` y `@@index([organizationId, codigoPuct])`.

**Proceso migración**:
1. `cd backend && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" npx prisma migrate dev --name remover-catalogo-puct`
2. Revisar `prisma/migrations/<ts>_remover_catalogo_puct/migration.sql` por protocolo §11.6: `grep -E "^DROP (INDEX|EXTENSION|TYPE)"`. Confirmar que SOLO dropea `catalogo_puct`, `cuentas_organizationId_codigoPuct_idx` y las 3 columnas; **borrar** cualquier `DROP` de objetos raw SQL vivos ajenos (pg_trgm, índices trigram de contactos, UNIQUE parciales, CHECK).
3. `DATABASE_URL=... npx prisma generate`

**Archivos (DELETE)**:
- `backend/prisma/seeds/prod/puct/` completo (`parser.ts`, `catalogo-puct.seed.ts`, `source/puct.xlsx`, `source/README.md`, `__tests__/parser.spec.ts`).

**Archivos (EDIT tests)**:
- `backend/test/helpers/test-factory.ts` — borrar `ensurePuctSeeded()` + comentario.
- `backend/test/cuentas.e2e-spec.ts` — quitar import/llamada `ensurePuctSeeded` y tests de `mapear-puct`. (Escenarios: *desactivar/reactivar*, *El endpoint mapear-puct deja de existir → 404*).
- `backend/test/configuracion-contable.e2e-spec.ts` — quitar import/llamada `ensurePuctSeeded`.

**Verde**: `DATABASE_URL=... npx prisma migrate status` + `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh npx jest test/cuentas test/configuracion-contable --runInBand --forceExit` (mismas 61 cuentas sembradas).

---

## Commit 4 — `docs: remover PUCT de constitución, docs y skill-registry`

> Anti-drift §12.3: core/docs en el MISMO PR. Avisar antes de borrar `docs/disenos/plan-cuentas-comercial.md` (config archive).

### 4.1 ☑ Sincronizar constitución, docs extendidos, README y skill-registry

**Entrega**: cero referencias a `CatalogoPuct`/`seed:puct`/`codigoPuct`; ejemplos de catálogo compartido → `CotizacionUfv`/`TipoCambio`.

**Archivos (EDIT)**:
- `CLAUDE.md` — §10.3: borrar fila "PUCT | Catálogo compartido…"; §4.2/L589: ejemplos catálogo compartido → `CotizacionUfv`/`TipoCambio`; §11.5: borrar paso que ordena `catalogo-puct.seed.ts`; §11.3/§11.6/§12.1: quitar menciones a `CatalogoPuct sembrado`, `seed:puct`, scope `puct`, ejemplo `feat(db): agregar tabla CatalogoPuct`, trigger "catálogo-puct".
- `README.md` — borrar paso seed PUCT en "Arrancar en local"; ajustar mención PUCT → "plan de cuentas oficial" y ejemplo `fix(puct)`.
- `docs/disenos/plan-cuentas-comercial.md` — marcar Pregunta 3 / secciones PUCT como obsoletas (decisión revertida). **Avisar antes de borrar.**
- `docs/claude/dominio-contable.md` — quitar `codigoPuct` opcional (L65) y ejemplo catálogo compartido → `CotizacionUfv`/`TipoCambio` (L116); actualizar header de versionado (`Última edición`/`Última revisión contra core`).
- `.atl/skill-registry.md` — reemplazar `PUCT` por `CotizacionUfv`/`TipoCambio` en ejemplos de catálogo compartido; quitar `ensurePuctSeeded()`.

**Verde**: diff legible, sin matches de `PUCT`/`CatalogoPuct` salvo en `openspec/changes/` (historia del change). `grep -ri "catalogoPuct\|catalogo-puct\|seed:puct" CLAUDE.md README.md docs/ .atl/` → vacío.

---

## Commit final — Verificación integral

### 5.1 ☑ Suite completa verde + typecheck + lint

**Entrega**: gate de cierre antes del squash merge.

**Comandos**:
- `cd backend && npx tsc --noEmit -p tsconfig.json`
- `npm run lint`
- `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" npx jest src/`
- `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh npx jest test/ --runInBand --forceExit`

**Verde**: todo en verde; cero `any`, cero query sin `tenantId`, cero `new Date()` en dominio (CLAUDE.md verify rules). 61 cuentas hoja + 8 conceptos sin `CatalogoPuct`.

---

## Resumen

| Commit | Tasks | Foco | Verde |
|--------|-------|------|-------|
| 1 | 1.1 | Inline seed + rename mapeo | tsc + `jest prisma/seeds` |
| 2 | 2.1 | Remover superficie PUCT módulo | tsc + `jest src/cuentas/` |
| 3 | 3.1 | Drop schema + migración + seed | `migrate status` + e2e cuentas/config |
| 4 | 4.1 | Docs / constitución / registry | grep limpio |
| final | 5.1 | Verificación integral | tsc + lint + suite completa |
