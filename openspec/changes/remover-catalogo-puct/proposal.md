# Proposal: remover-catalogo-puct

> Fecha: 2026-05-19
> Fase: proposal
> Tipo: refactor de eliminación (Opción 1 — REMOCIÓN TOTAL)
> Proyecto: avicont

---

## Why

El PUCT (Plan Único de Cuentas Tributario, catálogo oficial del SIN —
RND-101800000004) entró al código como andamiaje para una eventual
consolidación tributaria al SIN. Esa integración está **fuera de scope
total del producto** (CLAUDE.md §10.9), y el usuario confirma que "no es
algo que a futuro se va a meter". Hoy el PUCT cumple **3 roles conflados**
que pagamos en complejidad sin recibir valor:

1. **Fuente del seed del plan de cuentas** — tabla compartida
   `CatalogoPuct` poblada desde un Excel de 154KB vía parser, consultada
   por `comercial.ts` solo para obtener `nombre/nivel/claseCuenta/versionPuct`
   de 61 cuentas hoja **cuyos códigos ya están embebidos** en el seed.
2. **Metadata especulativa de mapeo tributario** — `Cuenta.codigoPuct`,
   `nombrePuctSnapshot`, `versionPuctMapeado`, endpoint `mapear-puct`, VO
   `CodigoPuct`, port + adapter reader, validador de nivel PUCT. Maquinaria
   pura para una integración que no existirá.
3. **Mapeo interno concepto → cuenta** (`MAPEO_PUCT_A_CONCEPTO`) — esto SÍ
   tiene valor (alimenta `OrgConfiguracionContable`), pero solo está mal
   nombrado: usa "PUCT" cuando es un mapeo de códigos internos.

Mantener un Excel binario, un parser de 185 líneas, una tabla compartida,
un VO, un port/adapter y un endpoint para un caso de uso que NUNCA llegará
es deuda muerta. Este change la elimina: el plan de cuentas per-tenant
sobrevive intacto, el seed se vuelve **autocontenido y más simple**, y la
numeración estilo PUCT de los `codigoInterno` se conserva como **códigos
internos puros** (sin referencia al catálogo).

---

## What Changes

- **Borrar la tabla compartida `CatalogoPuct`** del schema y toda su
  cadena de alimentación: `prisma/seeds/prod/puct/` completo (parser,
  seed, `source/puct.xlsx`, `source/README.md`, tests del parser).
- **Inlinear los 3 datos** (`nombre`, `nivel`, `claseCuenta`) en
  `CUENTAS_HOJA_COMERCIAL` dentro de `comercial.ts`, eliminar la consulta
  `prisma.catalogoPuct.findMany` y la escritura de `versionPuctMapeado`
  durante el seed. El seed queda autocontenido.
- **Eliminar la metadata especulativa** de `Cuenta`: columnas `codigoPuct`,
  `nombrePuctSnapshot`, `versionPuctMapeado` + el índice
  `@@index([organizationId, codigoPuct])`. NO se conserva `codigoPuct` ni
  como texto libre (decisión explícita del usuario).
- **Borrar la superficie PUCT del módulo `cuentas`**: VO `CodigoPuct` +
  spec, port `catalogo-puct-reader.port.ts`, adapter
  `prisma-catalogo-puct-reader.ts`, DTO `mapear-puct.dto.ts`, endpoint
  `POST /cuentas/:id/mapear-puct`, métodos `resolverPuctSnapshot()` /
  `mapearPuct()` del service, la rama `codigoPuct` en `crear()`, el wiring
  del port en `cuentas.module.ts`, el validador `validarNivelPuct` +
  `NIVEL_PUCT_REQUERIDO`, los códigos de error `CODIGO_PUCT_INVALIDO` y
  `CODIGO_PUCT_NIVEL_INSUFICIENTE`, y los 3 campos PUCT de
  `cuenta-response.dto.ts` / `create-cuenta.dto.ts`.
- **Renombrar** `MAPEO_PUCT_A_CONCEPTO` → `MAPEO_CODIGO_A_CONCEPTO` (y su
  spec `puct-a-concepto.spec.ts`). La lógica SOBREVIVE — solo deja de
  decir "PUCT" porque mapea códigos internos, no códigos del catálogo.
- **Migración Prisma destructiva nueva** (`remover-catalogo-puct`) que
  dropea la tabla `catalogo_puct`, las 3 columnas de `cuentas` y el índice.
  NO se edita la migración aplicada `20260423023544_add_plan_cuentas_y_catalogo_puct`.
- **Actualizar tests** afectados (~75 refs): `cuentas.service.spec.ts`,
  `cuenta-validator.spec.ts`, `test/cuentas.e2e-spec.ts`,
  `test/configuracion-contable.e2e-spec.ts`; **borrar** `codigo-puct.spec.ts`
  y `prisma/seeds/prod/puct/__tests__/parser.spec.ts`; eliminar/ajustar
  `ensurePuctSeeded()` en `test/helpers/test-factory.ts`.
- **Cambio constitucional + docs** (anti-drift CLAUDE.md §12.3): actualizar
  `CLAUDE.md` §10.3 (decisión PUCT), §10.9, §11.5 (checklist que ordena
  sembrar `catalogo-puct.seed.ts`), `README` (paso del seed PUCT en
  "Arrancar en local"), `docs/disenos/plan-cuentas-comercial.md`,
  `docs/claude/dominio-contable.md` (sección PUCT / plan de cuentas), y
  `.atl/skill-registry.md` (reemplazar PUCT como ejemplo de catálogo
  compartido por `CotizacionUfv` / `TipoCambio`).

---

## Scope

### In scope

- Remoción total de `CatalogoPuct` (modelo, seed, parser, Excel) y de la
  metadata especulativa de mapeo tributario en `Cuenta` y el módulo
  `cuentas`.
- Inline de `nombre/nivel/claseCuenta` en `CUENTAS_HOJA_COMERCIAL` para
  que el seed sea autocontenido (61 cuentas idénticas, mismos códigos).
- Rename de `MAPEO_PUCT_A_CONCEPTO` → `MAPEO_CODIGO_A_CONCEPTO`,
  preservando el wiring a `OrgConfiguracionContable` (8 conceptos).
- Migración destructiva única que dropea tabla + columnas + índice.
- Actualización de toda la suite de tests afectada (mantener verde).
- Actualización de la constitución (`CLAUDE.md`), docs extendidos,
  README y skill-registry — el cambio constitucional va ANTES o JUNTO
  con el código (CLAUDE.md §12.3).

### Out of scope (defer / no se hace)

- **Conservar `codigoPuct` como texto libre** — descartado por decisión
  explícita del usuario. SIN fuera de scope (CLAUDE.md §10.9); no se
  agrega maquinaria especulativa.
- **Renumerar los `codigoInterno`** — se conservan tal cual (numeración
  estilo PUCT como código interno puro). Renumerar sería un change
  separado de alto impacto sin valor hoy.
- **Tocar la lógica del plan de cuentas** (CRUD, tree, conceptos,
  validaciones de partida del plan) — no cambia comportamiento; solo se
  retiran las ramas PUCT.
- **Tocar `CotizacionUfv` / `TipoCambio`** (los otros catálogos
  compartidos) — solo pasan a ser los ejemplos de referencia en docs.
- **Backfill / preservación de datos PUCT** — migración destructiva
  asumida (pre-producción, sin organizaciones reales).

---

## Capabilities

> No hay specs en `openspec/specs/` todavía y este change es un refactor
> de eliminación: el comportamiento observable del plan de cuentas NO
> cambia (mismas 61 cuentas, mismo CRUD, mismos conceptos). Se retira
> únicamente maquinaria especulativa que nunca tuvo escenarios de uso.

### New Capabilities

None.

### Modified Capabilities

None — ningún requisito a nivel spec cambia. Las cuentas se siguen
sembrando con los mismos códigos/nombres/niveles; el endpoint
`mapear-puct` que se elimina nunca formó parte de un flujo contable real.

---

## Approach

Refactor de eliminación en capas, de afuera hacia adentro, manteniendo
verde entre cada commit atómico (config `apply.tdd: true`, regla "verde
entre commits"):

1. **Inline primero** (commit `refactor(cuentas)`): mover
   `nombre/nivel/claseCuenta` al array `CUENTAS_HOJA_COMERCIAL`, quitar el
   `findMany` y la escritura de `versionPuctMapeado`. El seed deja de
   depender del catálogo ANTES de que el catálogo desaparezca — así nunca
   queda roto a mitad de camino. Renombrar `MAPEO_PUCT_A_CONCEPTO`.
2. **Retirar la superficie del módulo `cuentas`** (commit
   `refactor(cuentas)`): borrar VO/port/adapter/DTO/endpoint/validador/
   error codes y limpiar `service`, `controller`, `module`, response DTO.
   Ajustar/borrar los tests correspondientes en el mismo commit.
3. **Schema + migración destructiva** (commit `chore(db)`): editar
   `schema.prisma` (drop modelo `CatalogoPuct`, 3 columnas e índice de
   `Cuenta`), generar migración `remover-catalogo-puct`,
   borrar `prisma/seeds/prod/puct/` y `ensurePuctSeeded()`.
4. **Constitución + docs** (commit `docs`): aplicar el anti-drift §12.3
   sobre CLAUDE.md, docs extendidos, README y skill-registry.

Antes de tocar código contable, las fases de apply DEBEN leer
`docs/claude/dominio-contable.md` (regla CLAUDE.md §12.1) — es requisito
de entrada, no opcional.

---

## Affected Modules

| Área | Tipo de cambio | Blast radius |
|---|---|---|
| `prisma/seeds/prod/puct/` | **Removido** | Carpeta completa: `parser.ts`, `catalogo-puct.seed.ts`, `source/puct.xlsx`, `source/README.md`, `__tests__/parser.spec.ts`. |
| `prisma/seeds/prod/planes-cuentas/comercial.ts` | Modificado | Inline `nombre/nivel/claseCuenta` en `CUENTAS_HOJA_COMERCIAL`; quitar `catalogoPuct.findMany` y `versionPuctMapeado`; renombrar `MAPEO_PUCT_A_CONCEPTO`. Seed queda autocontenido. |
| `cuentas/domain` | Removido + modificado | Borrar `codigo-puct.ts` + `codigo-puct.spec.ts`. En `cuenta-validator.ts` quitar `validarNivelPuct` + `NIVEL_PUCT_REQUERIDO`; en `cuenta-errors.ts` quitar `CODIGO_PUCT_INVALIDO` + `CODIGO_PUCT_NIVEL_INSUFICIENTE`. |
| `cuentas/ports` + `cuentas/adapters` | Removido | Borrar `catalogo-puct-reader.port.ts` y `prisma-catalogo-puct-reader.ts`. |
| `cuentas/dto` | Removido + modificado | Borrar `mapear-puct.dto.ts`; quitar campo `codigoPuct?` de `create-cuenta.dto.ts` y los 3 campos PUCT de `cuenta-response.dto.ts`. |
| `cuentas.service.ts` | Modificado | Quitar `resolverPuctSnapshot()`, `mapearPuct()`, rama `codigoPuct` en `crear()`, inyección del reader port. |
| `cuentas.controller.ts` | Modificado | Quitar endpoint `POST /cuentas/:id/mapear-puct`. |
| `cuentas.module.ts` | Modificado | Quitar wiring del port/adapter PUCT. |
| `prisma/schema.prisma` + migración | **Destructivo** | Drop modelo `CatalogoPuct`; drop columnas `codigoPuct`/`nombrePuctSnapshot`/`versionPuctMapeado` + índice de `Cuenta`. Migración nueva `remover-catalogo-puct`. |
| Tests (`cuentas.service.spec.ts`, `cuenta-validator.spec.ts`, `test/cuentas.e2e-spec.ts`, `test/configuracion-contable.e2e-spec.ts`, `puct-a-concepto.spec.ts`, `test/helpers/test-factory.ts`) | Modificado / Removido | ~75 refs; eliminar `ensurePuctSeeded()`; renombrar test del mapeo. |
| `CLAUDE.md`, `docs/claude/dominio-contable.md`, `docs/disenos/plan-cuentas-comercial.md`, `README`, `.atl/skill-registry.md` | Modificado | Cambio constitucional + docs (anti-drift §12.3). |

---

## Invariantes del core respetados

- **§4.5 Dinero = Decimal**: no se toca ningún campo monetario; el plan de
  cuentas sigue con sus decimales.
- **§4.2 Multi-tenant**: `Cuenta` sigue per-tenant; al borrar el último
  catálogo compartido PUCT, los ejemplos de "catálogo compartido sin
  tenantId" pasan a `CotizacionUfv` / `TipoCambio` (skill-registry).
- **§4.7 No soft-delete en contabilidad**: la migración dropea estructura,
  no agrega `deletedAt`; `Cuenta` conserva su política de
  desactivar/reactivar sin cambios.
- **§12.3 Anti-drift core ↔ docs**: la decisión PUCT está documentada en
  el core; su remoción es cambio constitucional → el core se actualiza
  ANTES o JUNTO con el código, nunca después.
- **§12.1 Requisito de entrada**: apply lee `docs/claude/dominio-contable.md`
  antes de tocar código contable.

---

## Risks & Rollback

### Riesgos

| Riesgo | Prob. | Mitigación |
|---|---|---|
| **R1 — Migración destructiva**: se pierde el catálogo sembrado y todo valor `codigoPuct`. | Media | Aceptable en pre-producción (sin organizaciones reales). Declarado explícito; rollback solo posible vía revert + re-seed del Excel (que también se borra). |
| **R2 — Cambio constitucional mal sincronizado**: si el código se mergea antes de actualizar `CLAUDE.md` §10.3/§10.9/§11.5, el core queda mintiendo. | Media | §12.3: docs en el mismo PR; commit `docs` obligatorio antes del merge. |
| **R3 — Onboarding roto**: README + §11.5 ordenan correr `catalogo-puct.seed.ts`, que dejará de existir → un dev nuevo falla el setup. | Alta si se omite | Actualizar README y §11.5 es parte del scope (no opcional). |
| **R4 — Perder el mapeo concepto→cuenta** al renombrar `MAPEO_PUCT_A_CONCEPTO`. | Baja | Solo se renombra, no se altera la lógica; `puct-a-concepto.spec.ts` (renombrado) cubre el wiring a `OrgConfiguracionContable`. |
| **R5 — Seed roto a mitad del refactor** si se borra el catálogo antes de inlinear los datos. | Media | Orden del approach: inline PRIMERO (paso 1), drop del catálogo DESPUÉS (paso 3). |
| **R6 — Drift en skill-registry**: PUCT usado como ejemplo de catálogo compartido en triggers de schema/adapters. | Baja | Reemplazar el ejemplo por `CotizacionUfv` / `TipoCambio` (en scope). |

### Rollback plan

El cambio mezcla remoción de código (revertible) con una migración
destructiva (parcialmente irreversible):

1. **Código**: `git revert` del PR squash → restaura módulo, seed, parser,
   docs y constitución a su estado previo.
2. **Schema**: revertir el revert NO recrea la migración aplicada; hay que
   generar una migración inversa que recree `catalogo_puct`, las 3
   columnas y el índice. Aplicar `prisma migrate dev`.
3. **Datos del catálogo**: el `puct.xlsx` vuelve con el `git revert`, así
   que el `catalogo-puct.seed.ts` restaurado puede re-poblar la tabla. Los
   valores `codigoPuct`/`nombrePuctSnapshot`/`versionPuctMapeado` que
   hubieran existido en `Cuenta` se pierden (no hay backup) — irrelevante
   en pre-producción (no hay datos reales).

Sin downtime más allá del deploy estándar. Sin breaking change de API
relevante: el único endpoint retirado (`mapear-puct`) no tiene consumidores
en producción.

---

## Dependencias

- **Plan de cuentas / módulo `cuentas`** (Fase actual) — se conserva; este
  change opera sobre él retirando solo la maquinaria PUCT.
- **`OrgConfiguracionContable`** — sigue alimentándose vía
  `MAPEO_CODIGO_A_CONCEPTO` (renombrado), sin cambio de comportamiento.
- **Seeds demo** (`seed-demo-tenant.ts`) — usa `comercial.ts`; sigue
  funcionando tras el inline. El `prisma/seed.ts` principal NO siembra
  plan de cuentas (solo user/org/roles/membership), no toca PUCT.

---

## Cuestiones diferidas a la fase spec/design

- **Estructura final de `CuentaHoja`** tras inlinear `nombre/nivel/claseCuenta`:
  ¿se mantiene un único array literal o se factoriza? Va en design.
- **Nombre definitivo del mapeo** (`MAPEO_CODIGO_A_CONCEPTO` propuesto) y de
  su tipo `ConceptoMapeado` / spec renombrado. Va en design.
- **Texto exacto** de los reemplazos en `CLAUDE.md` §10.3/§10.9/§11.5,
  README, `docs/claude/dominio-contable.md` y `.atl/skill-registry.md`. Va
  en tasks (mecánico) con revisión humana en el PR.
- **Orden fino de los commits atómicos** y el comando exacto de la
  migración (`npx prisma migrate dev --name remover-catalogo-puct`). Va en
  tasks.

---

**Fin del proposal.**
