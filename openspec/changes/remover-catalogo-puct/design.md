# Design: remover-catalogo-puct

> Fecha: 2026-05-19
> Fase: design
> Tipo: refactor de eliminación
> Proyecto: avicont
> Owner: backend-lead

---

## 0. Convenciones del documento

- Las decisiones del proposal son **input cerrado**. Este doc baja a shape de
  datos, wiring concreto, schema y orden de commits.
- El campo de tenant se llama `organizationId` en código/BD (convención del
  repo).
- Lectura de entrada obligatoria de apply: `docs/claude/dominio-contable.md`
  (CLAUDE.md §12.1) antes de tocar `comercial.ts` / schema.

---

## 1. Technical Approach

Refactor de eliminación **de afuera hacia adentro**, verde entre cada commit
atómico. El orden NO es negociable: el seed `comercial.ts` hoy LEE
`CatalogoPuct` (`findMany` L212) y ESCRIBE `versionPuctMapeado` (L276). Si se
dropea el catálogo antes de inlinear, el seed queda roto. Por eso **se inlinean
los datos PRIMERO** (commit 1), luego se retira la superficie del módulo
(commit 2), luego se dropea el schema (commit 3), y por último docs (commit 4).

---

## 2. Architecture Decisions

### Decisión 1: Qué inlinear — solo `nombre`, derivar `nivel` y `claseCuenta`

**Choice**: Inlinear en `CuentaHoja` únicamente `nombre`. NO inlinear `nivel`
ni `claseCuenta` — se derivan del código. Mantener un mapa separado de nombres
de ancestros.

**Alternatives considered**: (a) inlinear los 3 campos en cada hoja; (b) inlinear
solo nombre + mapa de ancestros (elegido).

**Rationale**: `nivel` = cantidad de segmentos (`calcularNivelDesdeCodigo`, ya
existe). `claseCuenta` = primer dígito del código (el parser ya lo hace con
`CLASE_POR_DIGITO`). Ambos son funciones puras del código — inlinearlos sería
redundancia que puede desincronizarse. Solo `nombre` es texto libre genuino.
Para ancestros (niveles 1-3, sin entrada en `CUENTAS_HOJA_COMERCIAL`) hace falta
un mapa explícito `NOMBRES_ANCESTRO` porque su nombre tampoco es derivable.

### Decisión 2: `claseCuenta` se deriva con helper local

**Choice**: agregar `claseCuentaDe(codigo): ClaseCuenta` en `comercial.ts`
(primer dígito → clase), reusando la tabla del parser.

**Rationale**: el parser se borra junto con `prisma/seeds/prod/puct/`; la única
copia viva del mapeo dígito→clase debe quedar en `comercial.ts`.

### Decisión 3: Rename `MAPEO_PUCT_A_CONCEPTO` → `MAPEO_CODIGO_A_CONCEPTO`

**Choice**: renombrar la constante, su tipo derivado y el parámetro
`porCodigoPuct` → `porCodigoInterno` en `SeedPlanCuentasResult`. La lógica
sobrevive intacta (alimenta `OrgConfiguracionContable`).

**Rationale**: el mapeo opera sobre `codigoInterno`, no sobre el catálogo. El
consumidor `seed-demo-tenant.ts` (`stats.porCodigoPuct`) se actualiza en el
mismo commit.

### Decisión 4: Migración destructiva nueva, NO editar la aplicada

**Choice**: nueva migración `remover-catalogo-puct`. NO tocar
`20260423023544_add_plan_cuentas_y_catalogo_puct`.

**Rationale**: editar migración aplicada rompe el historial determinístico
(CLAUDE.md §9.3). Drift de raw SQL (§11.6) no aplica: ninguno de los objetos
raw SQL vivos pertenece a `catalogo_puct`/`cuentas.codigoPuct`.

---

## 3. Shape de datos inlineado (interfaz exacta)

```typescript
// comercial.ts — nuevo shape
interface CuentaHoja {
  codigo: string;
  nombre: string;                 // INLINE: antes venía de CatalogoPuct.nombre
  esRequeridaSistema?: boolean;
  esContraria?: boolean;
  requiereContacto?: boolean;
}

// NUEVO: nombres de los agrupadores (niveles 1-3). Antes venían del catálogo.
// Clave = código del ancestro, valor = nombre. Cubre todos los ancestros
// únicos de las 61 hojas.
const NOMBRES_ANCESTRO: Record<string, string> = {
  '1': 'ACTIVO', '1.1': 'ACTIVO CORRIENTE', '1.1.1': 'DISPONIBILIDADES', /* ... */
};

// NUEVO: derivación de clase (reemplaza CLASE_POR_DIGITO del parser borrado).
const CLASE_POR_DIGITO: Record<string, ClaseCuenta> = {
  '1': 'ACTIVO', '2': 'PASIVO', '3': 'PATRIMONIO', '4': 'INGRESO', '5': 'EGRESO',
};
function claseCuentaDe(codigo: string): ClaseCuenta { /* primer segmento */ }
function nombreDe(codigo: string, esHoja: boolean): string { /* hoja→CuentaHoja.nombre, ancestro→NOMBRES_ANCESTRO */ }
```

`sembrarPlanCuentasComercial` pierde el bloque `prisma.catalogoPuct.findMany`
(L211-233) y el `puctMap`; el orden por nivel usa `calcularNivelDesdeCodigo`.
El `upsert` (L269-291) deja de escribir `codigoPuct`, `nombrePuctSnapshot`,
`versionPuctMapeado`; `nombre`/`nivel`/`claseCuenta` salen de los helpers.

---

## 4. Wiring del módulo `cuentas` (before/after)

`cuentas.module.ts` providers:

```
ANTES                                              DESPUÉS
─────────────────────────────────────────────     ──────────────────────────────────
CuentasService, PrismaService,                     CuentasService, PrismaService,
TenantContextService,                              TenantContextService,
{ CUENTA_REPOSITORY_PORT: PrismaCuentaRepository } { CUENTA_REPOSITORY_PORT: ... }
{ CATALOGO_PUCT_READER_PORT: PrismaCatalogo... }   ── (borrado)
{ MOVIMIENTOS_READER_PORT: factory }               { MOVIMIENTOS_READER_PORT: factory }
{ CUENTA_READER_PORT: CuentaReaderAdapter }        { CUENTA_READER_PORT: ... }
PrismaCuentasReaderAdapter + useExisting           PrismaCuentasReaderAdapter + useExisting
```

`CuentasService`: se elimina el ctor `@Inject(CATALOGO_PUCT_READER_PORT)`,
los métodos `resolverPuctSnapshot()` y `mapearPuct()`, la rama `codigoPuct` en
`crear()` (L147-156 + campos en `repo.crear`), y los imports del port +
`validarNivelPuct`. `cuentas.controller.ts` pierde `POST :id/mapear-puct` y el
import de `MapearPuctDto`. `cuenta.repository.port.ts` / `prisma-cuenta.repository.ts`
pierden `MapearPuctData`, el método `mapearPuct` y los 3 campos PUCT del create data.

---

## 5. Schema + migration plan

**`schema.prisma`**: borrar `model CatalogoPuct` (L372-394). En `model Cuenta`:
borrar `codigoPuct`, `nombrePuctSnapshot`, `versionPuctMapeado` (L407-411) y
`@@index([organizationId, codigoPuct])` (L479).

**Migración** (`npx prisma migrate dev --name remover-catalogo-puct`): genera
`DROP TABLE "catalogo_puct"`, `DROP INDEX "cuentas_organizationId_codigoPuct_idx"`,
3 × `ALTER TABLE "cuentas" DROP COLUMN`. Revisar §11.6: confirmar que NO mete
`DROP` de objetos raw SQL legítimos (no debería — son de otras tablas).

**Destructivo**: se pierde el catálogo sembrado y todo valor `codigoPuct`.
Aceptable pre-producción (sin organizaciones reales). Borrar
`prisma/seeds/prod/puct/` (parser, seed, `source/puct.xlsx`, README, test) y
`ensurePuctSeeded()` en el mismo commit.

**Rollback**: (1) `git revert` del PR squash restaura código, seed, parser,
xlsx y docs; (2) el schema NO se recrea solo — generar migración inversa que
recree `catalogo_puct`, las 3 columnas y el índice, y aplicar `migrate dev`;
(3) re-correr `catalogo-puct.seed.ts` (vuelto con el revert) repuebla la tabla.
Valores `codigoPuct` previos en `Cuenta` se pierden (sin backup) — irrelevante
pre-prod.

---

## 6. Inventario exacto de archivos

| Archivo | Acción |
|---|---|
| `prisma/seeds/prod/puct/parser.ts` | **DELETE** |
| `prisma/seeds/prod/puct/catalogo-puct.seed.ts` | **DELETE** |
| `prisma/seeds/prod/puct/source/puct.xlsx` + `source/README.md` | **DELETE** |
| `prisma/seeds/prod/puct/__tests__/parser.spec.ts` | **DELETE** |
| `src/cuentas/domain/codigo-puct.ts` + `codigo-puct.spec.ts` | **DELETE** |
| `src/cuentas/ports/catalogo-puct-reader.port.ts` | **DELETE** |
| `src/cuentas/adapters/prisma-catalogo-puct-reader.ts` | **DELETE** |
| `src/cuentas/dto/mapear-puct.dto.ts` | **DELETE** |
| `prisma/seeds/prod/planes-cuentas/comercial.ts` | EDIT — inline `nombre`, `NOMBRES_ANCESTRO`, `claseCuentaDe`; quitar `findMany`/`versionPuctMapeado`; rename mapeo + `porCodigoInterno` |
| `prisma/seeds/prod/planes-cuentas/__tests__/puct-a-concepto.spec.ts` | EDIT + **RENAME** → `codigo-a-concepto.spec.ts`; importar `MAPEO_CODIGO_A_CONCEPTO` |
| `prisma/seeds/dev/seed-demo-tenant.ts` | EDIT — `stats.porCodigoPuct` → `stats.porCodigoInterno` |
| `src/cuentas/cuentas.service.ts` | EDIT — quitar reader inject, `resolverPuctSnapshot`, `mapearPuct`, rama `codigoPuct`, `validarNivelPuct` import |
| `src/cuentas/cuentas.controller.ts` | EDIT — quitar endpoint `mapear-puct` + import |
| `src/cuentas/cuentas.module.ts` | EDIT — quitar provider + imports PUCT |
| `src/cuentas/domain/cuenta-validator.ts` | EDIT — quitar `validarNivelPuct` + `NIVEL_PUCT_REQUERIDO` + comentario §6 |
| `src/cuentas/domain/cuenta-errors.ts` | EDIT — quitar `CODIGO_PUCT_INVALIDO`, `CODIGO_PUCT_NIVEL_INSUFICIENTE` |
| `src/cuentas/dto/create-cuenta.dto.ts` | EDIT — quitar campo `codigoPuct?` |
| `src/cuentas/dto/cuenta-response.dto.ts` | EDIT — quitar 3 campos + 3 líneas de `toCuentaResponse` |
| `src/cuentas/ports/cuenta.repository.port.ts` | EDIT — quitar `MapearPuctData`, método `mapearPuct`, 3 campos del create data |
| `src/cuentas/adapters/prisma-cuenta.repository.ts` | EDIT — quitar `mapearPuct` + import |
| `src/cuentas/cuentas.service.spec.ts` | EDIT — quitar `MockCatalogo`, mock del reader, tests de mapeo |
| `src/cuentas/domain/cuenta-validator.spec.ts` | EDIT — quitar tests de `validarNivelPuct` |
| `test/helpers/test-factory.ts` | EDIT — borrar `ensurePuctSeeded()` + comentario L79 |
| `test/cuentas.e2e-spec.ts` | EDIT — quitar import/llamada `ensurePuctSeeded`, tests de `mapear-puct` |
| `test/configuracion-contable.e2e-spec.ts` | EDIT — quitar import/llamada `ensurePuctSeeded` |
| `prisma/schema.prisma` | EDIT — drop modelo + 3 columnas + índice |
| `prisma/migrations/<ts>_remover_catalogo_puct/migration.sql` | **CREATE** (vía `migrate dev`) |

---

## 7. Ediciones de docs / constitución (anti-drift §12.3, MISMO PR)

| Doc | Edición |
|---|---|
| `CLAUDE.md` §10.3 | Borrar la fila "PUCT \| Catálogo compartido…" (L783) |
| `CLAUDE.md` §10.9 | Confirmar que SIN sigue fuera de scope; sin referencia a tabla PUCT |
| `CLAUDE.md` §4.2 / línea 589 | Quitar `CatalogoPuct` de los ejemplos de catálogo compartido → dejar `CotizacionUfv`, `TipoCambio` |
| `CLAUDE.md` §11.5 | Borrar paso 2 que ordena `catalogo-puct.seed.ts` (L984) |
| `CLAUDE.md` §11.3 / §11.6 / §12.1 | Quitar menciones a `CatalogoPuct sembrado` (L954, L965), `seed:puct`, ejemplo `fix(puct)` (L676 `feat(db): agregar tabla CatalogoPuct`), scope `puct` (L660), trigger "catálogo-puct" (L1053) |
| `README.md` | Borrar L39 (seed PUCT en "Arrancar en local"); ajustar L22 (PUCT → "plan de cuentas oficial") y L76 (`fix(puct)`) |
| `docs/disenos/plan-cuentas-comercial.md` | Marcar Pregunta 3 / secciones PUCT como obsoletas (decisión revertida); avisar antes de borrar (config archive) |
| `docs/claude/dominio-contable.md` | L65 (codigoPuct opcional) y L116 (ejemplo catálogo compartido → `CotizacionUfv`/`TipoCambio`); actualizar header de versionado |
| `.atl/skill-registry.md` | L42, L75: reemplazar `PUCT` por `CotizacionUfv`/`TipoCambio` en los ejemplos de catálogo compartido; L86: quitar `ensurePuctSeeded()` |

---

## 8. Orden de commits atómicos (verde entre cada uno)

1. `refactor(cuentas): inline catálogo en seed comercial y renombrar mapeo` —
   `comercial.ts` + test renombrado + `seed-demo-tenant.ts`. Seed autocontenido,
   sigue leyendo `CatalogoPuct` ya NO. Verde: suite de seeds + tsc.
2. `refactor(cuentas): remover superficie PUCT del módulo cuentas` —
   VO/port/adapter/DTO/endpoint/validador/error codes + service/controller/module/
   response DTO + repo + specs. Verde: suite `cuentas` + tsc.
3. `chore(db): drop CatalogoPuct y columnas codigoPuct de Cuenta` —
   schema + migración + borrar `prisma/seeds/prod/puct/` + `ensurePuctSeeded`.
   Verde: `migrate status` + e2e cuentas/configuración-contable.
4. `docs: remover PUCT de constitución, docs y skill-registry` — §7.

---

## 9. Testing Strategy

| Layer | Qué | Cómo |
|---|---|---|
| Unit | `comercial.ts` mapeo + helpers; `cuenta-validator` sin `validarNivelPuct` | `npx jest src/cuentas prisma/seeds` |
| Unit | `puct-a-concepto` → `codigo-a-concepto` coherencia plantilla↔mapeo | test renombrado, mismos 4 invariantes |
| Integration | `prisma-cuenta.repository` sin `mapearPuct` | suite existente verde |
| E2E | `cuentas.e2e` / `configuracion-contable.e2e` sin `ensurePuctSeeded` ni `mapear-puct` | `e2e_command`, mismas 61 cuentas sembradas |

Comportamiento observable del plan de cuentas NO cambia: 61 hojas, mismos
códigos/nombres/niveles/clases, mismos 8 conceptos de `OrgConfiguracionContable`.

## 10. Open Questions

- Ninguna que bloquee. Textos exactos de docs (§7) son mecánicos, revisados en PR.
