# Propuesta de cambio: `granja-v1` — vertical Granja (engorde de pollos parrilleros), núcleo operativo

> Fase SDD: **propose** — 2026-06-01
> Artifact store: **hybrid** (este archivo + engram topic_key `sdd/granja-v1/proposal`)
> Inputs: `openspec/changes/granja-v1/exploration.md`, `docs/disenos/granja.md` (fuente de verdad del modelo), decisiones cerradas P1–P8 (engram `sdd/granja-v1/decisiones-explore`).
>
> Esta propuesta NO escribe código ni specs detalladas ni task breakdown. Define **intención, scope y enfoque arquitectónico**. Las fases siguientes son `sdd-spec` + `sdd-design` → `sdd-tasks` → `sdd-apply`.

---

## 1. Intención / Problema

El granjero de engorde (socio de una asociación de avicultores boliviana) **no necesita contabilidad** para tomar la única decisión que le importa en cada crianza: a qué precio vender el pollo. Hoy lleva esos números en un cuaderno o de memoria. Granja-v1 le da un **operativo simple, mobile-first** (lo opera desde el celular, en el gallinero) que registra cuánto invirtió en cada lote y cuántas aves siguen vivas, y le devuelve en tiempo real **cuánto le cuesta cada pollo vivo**. Sin partida doble, sin asientos, sin plan de cuentas — es control de costos puro, un mundo separado del vertical Contabilidad.

El andamiaje de plataforma (flag `granjaEnabled`, `@RequireModule('granja')`, `ModuleEnabledGuard`, permisos `granja.*` en el catálogo, template `Granjero` en seed, `VerticalNoExclusivoError`) **ya existe**. granja-v1 solo construye el dominio del vertical y lo enchufa al riel.

---

## 2. Norte medible

```
costo por pollo vivo  =        Σ(MovimientoInversion.monto del lote)
                         ───────────────────────────────────────────────
                         cantidadInicial − Σ(MovimientoCantidad.cantidad)
```

La métrica vale por **cómo se comporta conforme avanza la crianza**: cuando mueren pollos, el numerador (la plata gastada) NO baja, pero el denominador SÍ. Resultado: el costo de cada **sobreviviente sube**. El granjero ve en vivo cómo la mortalidad le encarece cada pollo y, cerca de la saca, fija precio con ese número en la mano ("me cuesta Bs 15, lo vendo a Bs 20"). La decisión de precio queda **fuera del sistema en v1**.

Reglas del cálculo (todas en **lectura**, nunca persistidas — espejo del patrón de saldos contables, evita drift):
- `avesVivas = cantidadInicial − Σ(muertes)` (Int, invariante `≥ 0`).
- `costoAcumulado = Σ(inversiones)` (`Money`, siempre `≥ 0`).
- `costoPorPolloVivo = avesVivas > 0 ? costoAcumulado / avesVivas : null` (UI muestra "—" si es null).
- `edadDias = ClockPort.hoyEnLaPaz() − fechaIngreso`.
- `porcentajeMortalidad = Σ(muertes) / cantidadInicial`.

---

## 3. Scope IN (v1)

**Backend**
- **Schema Prisma**: 4 tablas + 2 enums.
  - Tablas: `Lote` (aggregate root), `TipoRegistro`, `MovimientoInversion`, `MovimientoCantidad`.
  - Enums: `EstadoLote (ACTIVO|CERRADO)`, `NaturalezaRegistro (INVERSION|CANTIDAD)`.
  - Multi-tenant: `organizationId` NOT NULL en las 4 (denormalizado en los movimientos, patrón `LineaComprobante.organizationId`).
  - Constraints: `UNIQUE(organizationId, nombre)` en `TipoRegistro`; CHECK `cantidadInicial > 0` en `Lote`; índices por `organizationId`, `loteId`, e índice parcial `WHERE estado = 'ACTIVO'` en `Lote` para el dashboard. Decimales: `monto @db.Decimal(18,2)` BOB.
- **Módulo hexagonal `backend/src/granja/`** (espejando `tipos-documento-fisico/`): `domain/` (entidades puras + `enums.ts` propio + `granja.errors.ts`), `ports/`, `adapters/` (Prisma), `dto/`, services, controller(s), `granja.module.ts`.
- **Seed por org al activar el vertical**: `TipoRegistroSeederPort` + adapter idempotente (upsert por `(organizationId, nombre, naturaleza)`), 12 tipos de fábrica (`esSistema=true`): 11 de INVERSION + Mortalidad (CANTIDAD). Disparado desde `TenantsService.updateFeatures` cuando `granjaEnabled` pasa a `true`.
- **CRUD Lote**: crear, listar, ver, editar (NO `cantidadInicial` — inmutable), **cerrar** (`POST /api/granja/lotes/:id/cerrar`).
- **CRUD TipoRegistro**: listar (fábrica + propios), crear, editar, soft-disable (`activo=false`); no se borran los `esSistema`.
- **Registro de movimientos**: `MovimientoInversion` (`monto`) y `MovimientoCantidad` (`cantidad`), ruteados por `TipoRegistro.naturaleza`. Campo `detalle` opcional `@MaxLength(500)` en ambos.
- **Cálculo costo/pollo en lectura** vía read-model batch en el port (no inline) → dashboard de N lotes sin N×2 queries.
- **Informe del lote**: desglose de costos por tipo, % mortalidad, edad en días, aves vivas, costo por pollo.
- **Dashboard**: `GET /api/granja/dashboard` — lotes activos lado a lado con costo/pollo y mortalidad.
- **RBAC + module gating**: `@RequireModule('granja')` + `@RequirePermissions(...)` en cada endpoint (404 si el módulo está deshabilitado, 403 si falta permiso).
- **Tests**: invariantes de dominio (unit), adapters Prisma (integration vs Postgres real), endpoints con aislamiento multi-tenant estricto (e2e). TDD Strict.

**Frontend**
- `frontend/src/features/granja/` (screaming: `api/`, `hooks/`, `components/`, `pages/`, `schemas/`, `lib/`), **mobile-first estricto** (base 375px, tap targets ≥ 44px, `text-base` en inputs, costo/pollo como dato más visible).
- Bloque `granja` en `frontend/src/lib/permissions.ts` (FALTA hoy) espejando el catálogo backend.
- Gating con `<Can>` / `<PermissionButton>`. Formularios RHF + Zod.
- Tests de componentes (Testing Library) + lógica pura en `lib/`.

---

## 4. Scope OUT (faseo deliberado YAGNI — NO es deuda)

Lo siguiente queda fuera de v1 por decisión consciente. **No es deuda técnica**: es faseo. El riesgo real es cerrar puertas en el schema; por eso v1 deja el riel **aditivo** (ver nota al final de esta sección).

| Fuera de v1 | Fase | Por qué |
|-------------|------|---------|
| Calculadora de utilidad *what-if* (no persiste) | v1.5 | Aritmética pura sobre lo ya calculado; barata, no toca el modelo. |
| Cierre de lote con snapshot de precio de venta final | v1.5 | Captura histórica para análisis; campos aditivos al `Lote` y/o `MovimientoVenta`. |
| Registro de **ventas reales** + utilidad real persistida | v2+ | Necesita uso y datos reales primero. |
| **Asistente IA / chat de granja** | v2+ | Gobernado por ADR-0001 (releer ANTES de su SDD). |
| Comparativa entre lotes (histórico) | v2+ | Requiere lotes cerrados con snapshot. |
| **Ponedoras** (postura diaria, % postura, ciclo ~18m) | v2+ | Otro dominio. |
| `Galpón` como entidad (analítica por galpón) | v2+ | Campo de texto alcanza en v1 (granja.md §5.1). |
| Reapertura de lote `CERRADO` | v2+ | v1 lo deja read-only (granja.md §5.6). |
| Inventario/consumo de alimento, FCR | v2+ | v1 registra el costo del alimento, no su inventario ni la métrica zootécnica. |

**Riel aditivo que v1 debe respetar (no cerrar puertas para v1.5/v2)**:
- El cierre de lote en v1 es un cambio de `estado → CERRADO` + `fechaCierre`. **No** se diseña un esquema rígido que impida agregar luego `precioVentaFinal`, `costoPorPolloFinal`, `mortalidadFinal` como columnas **nullable aditivas** al `Lote`.
- La venta se modela en el futuro como **nueva tabla `MovimientoVenta`** o columnas aditivas — v1 NO debe meter `monto`/`cantidad` con semántica de venta en las tablas de inversión/cantidad. Mantener las dos tablas de movimiento limpias y de naturaleza única deja la puerta abierta sin migración destructiva.
- `NaturalezaRegistro` se diseña como enum **extensible** (agregar `VENTA` en v2 es una migración aditiva de enum, no un rediseño).

---

## 5. Enfoque arquitectónico

- **Módulo hexagonal estricto** `backend/src/granja/`, espejando `tipos-documento-fisico/` (la referencia más cercana: seed de fábrica + CRUD + hexagonal). Capas: `domain/ → ports/ → adapters/ → dto/ → service → controller → module`. Cruce de frontera de módulo solo vía port (el seeder se expone como port para que `TenantsModule` lo consuma); dentro del módulo, inyección directa.
- **`Lote` es aggregate root**: todo cuelga del lote, todo se calcula POR lote. El costo/pollo NUNCA se agrega a nivel organización (sumar un lote de 10 días con uno de 40 no tiene sentido). Los movimientos se crean validando que `loteId` pertenece al mismo `organizationId`.
- **Dos tablas de movimiento separadas** (no unificada): `MovimientoInversion` (lleva `monto`, obligatorio > 0) y `MovimientoCantidad` (lleva `cantidad`, obligatorio > 0). `TipoRegistro.naturaleza` rutea cada tipo a su tabla. Invariantes limpios y self-validating, sin columnas nullables ambiguas.
- **Read-model batch para el dashboard**: el port expone un método de resumen que hace queries `WHERE loteId IN (...)` en batch (no N loops). El service orquesta; el cálculo de `Money`/derivados vive en el service, no en el adapter.
- **Reuso de primitivos de plataforma**: `Money` (decimal.js) para todo dinero (nunca `number`, DTOs cruzan HTTP como string), `FechaContable` para fechas de dominio (`fechaIngreso`, `fecha` de movimientos, `fechaCierre`), `ClockPort.hoyEnLaPaz()` para "hoy" (nunca `new Date()` en domain/service). Enums de dominio en `granja/domain/enums.ts` propio (P2), espejando los de Prisma sin importarlos.
- **Multi-tenant defense-in-depth** en cada capa: guard (`ModuleEnabledGuard` + permisos) + service (filtra por `organizationId` desde `JWT.activeTenantId`) + repo (toda query lleva `organizationId`). Una query sin filtro es bug de seguridad.
- **Errores** con jerarquía `DomainError` y códigos `GRANJA_{SUBDOMINIO}_{CONDICION}` (`GRANJA_LOTE_NO_ENCONTRADO`, `GRANJA_MOVIMIENTO_CANTIDAD_EXCEDE_VIVAS`, `GRANJA_TIPO_REGISTRO_NATURALEZA_INVALIDA`, etc.).
- **Frontend** en `frontend/src/features/granja/` con gating (`PERMISSIONS.granja` a crear). Mobile-first es la excepción de granja al estándar de frontend.

---

## 6. Plan de ataque (slices incrementales, 1 PR por slice idealmente, TDD Strict)

1. **Slice 1 — Schema Prisma + migración** (backend). 2 enums + 4 tablas, constraints e índices (incl. parcial `WHERE estado='ACTIVO'`), migración limpia siguiendo §11.6 del core. Entrega: migración aplicable, verificada con `\d lotes`. (Schema-only, sin TDD.)
2. **Slice 2 — Dominio puro + ports** (backend). Entidades en `granja/domain/` (sin NestJS/Prisma), `enums.ts` propio, `granja.errors.ts`, value objects si aplican, los 4 repository ports + `TipoRegistroSeederPort`. TDD: invariantes (`avesVivas ≥ 0`, `cantidadInicial > 0`, no mover lote cerrado, naturaleza del tipo == tabla del movimiento).
3. **Slice 3 — Adapters Prisma + services CRUD básicos** (backend). `PrismaLoteRepository`, `PrismaTipoRegistroRepository`, seeder adapter; `LoteService` + `TipoRegistroService` (CRUD, sin derivados todavía); wiring base del `GranjaModule`. TDD: integration de adapters + unit de services con mocks de ports.
4. **Slice 4 — Movimientos + cálculo costo/pollo (la joya)** (backend). Adapters de movimientos; `MovimientoService` con cálculo de derivados (`Money` + `ClockPort`); read-model batch para resumen; invariante `avesVivas ≥ 0` con `SELECT FOR UPDATE` sobre el lote en la TX. TDD: casos del cálculo (lote vacío, 1/varios movimientos, mortalidad total → null) + invariante de cantidad negativa + concurrencia.
5. **Slice 5 — Controllers + DTOs + RBAC + wiring del seed** (backend). Controllers bajo `/api/granja/*`, DTOs request/response (`detalle @MaxLength(500)`), `@RequireModule('granja')` + `@RequirePermissions(...)`, dashboard endpoint, y enganche del seeder en `TenantsService.updateFeatures(granjaEnabled→true)`. TDD: e2e con aislamiento multi-tenant + 404 con módulo deshabilitado + 403 sin permiso.
6. **Slice 6 — Frontend mobile-first** (frontend). `features/granja/` completa (dashboard + lotes + tipos-registro + movimientos), bloque `PERMISSIONS.granja`, gating, formularios RHF+Zod. TDD: componentes + lógica pura.
7. **Slice 7 — Toggle de activación del vertical en UI** (frontend, último, no bloquea núcleo). Toggle OWNER/ADMIN que llama al endpoint de feature flags; el error amigable `VerticalNoExclusivoError` (ya existe en backend) se renderiza si la org tiene `contabilidadEnabled`.

---

## 7. Decisiones cerradas (P1–P8, criterio rector: la opción que NO deja deuda futura)

| # | Decisión | Resolución |
|---|----------|-----------|
| P1 | Seed `TipoRegistro` | Por org al **activar** el vertical (patrón `TipoDocumentoFisico`), idempotente vía upsert. No script global. |
| P2 | Enums de dominio | `granja/domain/enums.ts` **propio** (`EstadoLote`, `NaturalezaRegistro`). NO en `common/domain`. |
| P3 | Cálculo `costoPorPolloVivo` | **Read-model / método batch** en el port. NUNCA almacenado, calculado en lectura. Evita N×2 queries en dashboard. |
| P4 | URLs | Namespace unificado por vertical: `/api/granja/lotes`, `/api/granja/tipos-registro`, `/api/granja/lotes/:id/movimientos`, `/api/granja/dashboard`. |
| P5 | `VerticalNoExclusivoError` | **YA EXISTE** (`backend/src/tenants/domain/tenant-errors.ts`, extiende `ConflictError`, ya thrown en `TenantsService.updateFeatures`). No hay que crearlo. |
| P6 | `avesVivas ≥ 0` | Solo en service (agregado calculado, sin CHECK de BD posible) + test del invariante. |
| P7 | Campo `detalle` | Texto libre opcional en AMBOS movimientos, `@MaxLength(500)`. |
| P8 | Toggle activación UI | Slice 7 (último), no bloquea el núcleo. |

---

## 8. Riesgos y mitigaciones

| Riesgo | Sev. | Mitigación |
|--------|------|-----------|
| `cantidadInicial` inmutable pero sin CHECK de BD que lo enforce | Media | Service ignora/rechaza el campo en el PATCH. **Test del PATCH** que intenta cambiarla. |
| Dashboard N lotes → N×2 queries si se hace ingenuamente | Media | Read-model batch en el port (`WHERE loteId IN (...)`) — P3. Decisión de diseño del Slice 4. |
| Race condition en `MovimientoCantidad` deja `avesVivas` negativo | Baja (single-user/org) | `SELECT FOR UPDATE` sobre el lote dentro de la TX al registrar la salida. |
| Seed invocado múltiples veces si `updateFeatures(granjaEnabled=true)` se repite | Baja | Upsert idempotente por `(organizationId, nombre, naturaleza)`. |
| `PERMISSIONS.granja` faltante en frontend → botones sin gatear con strings sueltos | Alta | Agregar el bloque ANTES de cualquier componente (Slice 6). ESLint no lo detecta. |
| Wiring del seed en `updateFeatures` NO existe hoy (solo está el guard de exclusividad) | Media | Slice 5 agrega la llamada al seeder tras el `updateFeatures` exitoso con `granjaEnabled=true`. |

---

## 9. Cómo se valida (alto nivel)

- **Invariantes de dominio** (unit, `granja/domain/`): `avesVivas ≥ 0`, `cantidadInicial > 0`, no agregar movimiento a lote `CERRADO`, naturaleza del `TipoRegistro` matchea la tabla del movimiento.
- **Cálculo costo/pollo** (unit, service): lote vacío → costo 0 / costoPorPollo null; 1 y varios movimientos; mortalidad total → `avesVivas=0` → `costoPorPolloVivo=null` ("—"); precisión `Money`.
- **Adapters** (integration, Postgres real): persistencia + read-model batch + constraints (`UNIQUE(organizationId, nombre)`).
- **Multi-tenant** (e2e): un tenant NO accede a lote/tipo/movimiento de otro; `organizationId` filtrado en cada capa.
- **Module gating** (e2e): 404 con `granjaEnabled=false`, 403 sin el permiso `granja.*`.
- **Inmutabilidad** (e2e/integration): PATCH que intenta cambiar `cantidadInicial` falla.
- **Frontend** (componentes): gating con `<Can>`/`<PermissionButton>`, render del costo/pollo, mobile-first.

---

*Propuesta completada. Próximo paso recomendado: `sdd-spec granja-v1` + `sdd-design granja-v1` (pueden correr en paralelo; spec necesita esta propuesta, design también).*
