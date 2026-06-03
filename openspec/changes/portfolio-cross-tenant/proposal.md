# Propuesta de cambio — Portfolio cross-tenant (KPIs + actividad reciente)

> Fase SDD: **proposal**. Artifact store: hybrid (este archivo + engram `sdd/portfolio-cross-tenant/proposal`).
> Stack afectado: **backend** (NestJS + Prisma) + **frontend** (Vite/React). Fecha: 2026-06-02.
> Continúa los changes `super-admin` (#118-#127), `platform-admin-ui` v1 (#131-#138) y `platform-admin-v1.1` (#140-#142).

---

## 1. Why / Por qué

La consola super-admin (`/platform-admin`) ya tiene TODO el CRUD operativo org-por-org
(listar/crear orgs, status, entitlement, packs, miembros cross-tenant, impersonation). Pero
la **landing está vacía** (`platform-home-page.tsx` es un placeholder con un título) y **no
existe NINGUNA agregación cross-tenant**: el super-admin no puede responder de un vistazo
"¿cuántas orgs activas tengo?", "¿cuántas suspendidas?", "¿qué pasó últimamente en la
plataforma?". Para eso hoy tiene que entrar org por org.

La data ya existe y se captura:
- `Organization` tiene `status`, `plan`, `contabilidadEnabled`, `granjaEnabled`, `createdAt`, y relación `memberships[]`.
- `platform_audit` ya registra cada mutación + GET cross-tenant del super-admin (`action`, `targetOrganizationId`, `actorUserId`, `createdAt`, `payload` redactado), con índices `[actorUserId, createdAt]` y `[targetOrganizationId, createdAt]`.

Falta SOLO **exponer y mostrar** esa data agregada. Este slice convierte la landing vacía en
un dashboard real con dos vistas: KPIs de salud operativa y un timeline de actividad reciente.

## 2. What changes / Scope

### Entra (IN)

**Vista A — Salud operativa / KPIs agregados** (sobre `Organization`):
- Conteo de orgs por `status`: ACTIVE / SUSPENDED / ARCHIVED.
- Conteo de orgs por `plan`: FREE / PRO.
- Conteo de orgs por vertical: `contabilidadEnabled` true vs `granjaEnabled` true (no excluyentes en el conteo, aunque el CHECK constraint los hace exclusivos por org).
- Total de organizaciones y total de usuarios de la plataforma (count de `User`, o de memberships activas — decisión en §3).
- Timeline de altas: orgs nuevas agrupadas por período (mes) sobre `createdAt`, para ver el ritmo de crecimiento.

**Vista B — Actividad reciente cross-tenant** (sobre `platform_audit`):
- Timeline paginado de las últimas acciones de plataforma: `action`, org afectada (`targetOrganizationId` + nombre resuelto), `actorUserId` (+ email/displayName resuelto), `createdAt`.
- Filtro opcional por org (`orgId`) reusando el índice `[targetOrganizationId, createdAt]`.

**Frontend**: reemplazar `PlatformHomePage` con un dashboard real — cards de KPIs (Vista A) +
sección de timeline de actividad (Vista B), siguiendo el patrón `api/* → hooks/* → componentes`
del panel y el header canónico de `frontend/CLAUDE.md §13`.

### NO entra (OUT — slice futuro, NO proponer)
- **Drill-down financiero por org** (volumen de comprobantes, montos, actividad contable por tenant).
- **Adopción de packs** (cuántas orgs tienen cada pack habilitado/activado — el eje packs es reciente, métricas de adopción son un slice aparte).
- **Gráficos ricos / charting library**: el timeline de altas se entrega como serie de datos agregada; la visualización inicial puede ser una tabla o un mini-barchart simple con primitivos. Una librería de charts dedicada queda fuera.
- **Métricas en tiempo real / streaming / auto-refresh agresivo**: TanStack Query con `staleTime` razonable basta; no websockets.
- **Exportar el portfolio (CSV/PDF)**.

## 3. Approach

### 3.1 Backend

Dos endpoints nuevos en el `PlatformAdminController` existente (ruta base `/admin/platform`,
ya org-less, ya gateada por `JwtAuthGuard` + `SuperAdminGuard` + `PlatformAuditInterceptor`):

1. **`GET /admin/platform/dashboard`** → KPIs agregados (Vista A). Respuesta única con todos
   los conteos + la serie de altas por mes. Un solo round-trip; la data es chica (un puñado de
   counts y una serie de N meses), no se pagina.

2. **`GET /admin/platform/activity?limit&cursor&orgId?`** → timeline de actividad (Vista B),
   **paginado por cursor** sobre `platform_audit`.

**Forma de la agregación (Vista A)** — un nuevo **reader port** `PlatformStatsReaderPort`
(abstract class, definido por `platform` como consumidor, adapter Prisma registrado en
`PlatformModule`; el dueño del dominio `Organization` es `tenants`, así que el adapter de stats
de orgs vive idealmente en `tenants/adapters/` y se registra con su token en `PlatformModule`,
idéntico al patrón `OrgsReaderPort`/`PrismaOrgsReaderAdapter`). Implementación con
`prisma.organization.groupBy({ by: ['status'] })`, `groupBy({ by: ['plan'] })`, `count()` con
`where`, y para la serie de altas un `groupBy` por mes (o un `$queryRaw` con `date_trunc('month', "createdAt")`
si `groupBy` por mes truncado no alcanza — decisión fina de design). El total de usuarios sale
de `prisma.user.count()` (o memberships activas distintas — ver Open Questions).

**Forma de la actividad (Vista B)** — un nuevo **reader port** `PlatformActivityReaderPort`
(el `PlatformAuditPort` existente es **write-only**: solo expone `record()`; NO se mezcla la
lectura ahí — se agrega un port de lectura separado, o se extiende el existente con `findRecent`).
Recomendación: **extender** `PlatformAuditPort` con `findRecent({ limit, cursor, orgId? })` o
crear `PlatformActivityReaderPort` dedicado (decisión de design; me inclino por port dedicado de
lectura para no mezclar responsabilidades read/write). El adapter resuelve los nombres de org y
actor con `include`/join (`targetOrganization`, `actor`) en la misma query.

**Paginación: cursor, NO offset.** Razón:
- `platform_audit` es **append-only y crece sin techo**; offset paginación degrada (`OFFSET N` escanea+descarta N filas) y, peor, **se desincroniza** cuando llegan filas nuevas entre páginas (un evento nuevo empuja todo y el usuario ve duplicados al pasar de página).
- El índice `[targetOrganizationId, createdAt]` (y un futuro/implícito orden por `createdAt`) soporta cursor sobre `(createdAt, id)` de forma estable. Cursor opaco = `createdAt` + `id` del último item (desempate por `id` ante timestamps iguales).
- Es un timeline "scroll hacia atrás en el tiempo", el caso de uso natural para cursor (no salto a página arbitraria).

**DTOs de respuesta**: `PlatformDashboardResponseDto` (conteos + serie) y
`PlatformActivityResponseDto` (`items[]` + `nextCursor: string | null`), decorados con
`@ApiOkResponse` para que entren al OpenAPI dump (CLAUDE.md §10.10 — drift-gate de contrato).

### 3.2 Excepción DELIBERADA a Anti-31 (multi-tenant)

**Estas queries agregan TODAS las orgs sin filtrar por `tenantId`. Es CORRECTO, no un bug.**
La consola de plataforma es cross-tenant por naturaleza — igual que el `GET /admin/platform/orgs`
ya existente. El enforcement está en `SuperAdminGuard` (`isSuperAdmin === true`), no en un filtro
de tenant. Esto se documenta explícito en el port (JSDoc) y en la spec/design para que nadie lo
"arregle" agregando un `where: { tenantId }` que rompería el feature. Anti-31 aplica a entidades
de dominio servidas a un tenant; NO aplica a la superficie super-admin.

### 3.3 Frontend

Reemplazar `PlatformHomePage` (placeholder) por un dashboard contenedor que orquesta dos hooks
(`usePlatformDashboard`, `usePlatformActivity`) y compone componentes presentacionales:
- `api/get-platform-dashboard.ts`, `api/get-platform-activity.ts` (funciones puras, vía `@/lib/api`).
- `hooks/use-platform-dashboard.ts`, `hooks/use-platform-activity.ts` (TanStack Query; activity con `useInfiniteQuery` para el cursor).
- Componentes: cards de KPI (status/plan/vertical/totales), mini-serie de altas, tabla/lista de actividad con "cargar más". Header canónico §13.1, empty states §13.4, dark-mode y responsive (§6, §7) obligatorios.
- Tipos desde `types/api.ts` (regenerados del OpenAPI, CLAUDE.md §10.10) — no DTOs a mano.

## 4. Alternatives considered

| Alternativa | Tradeoff | Decisión |
|---|---|---|
| **Endpoint único `/dashboard` con KPIs + actividad embebida** vs **dos endpoints separados** | Único: 1 round-trip, pero acopla dos cadencias distintas (KPIs cambian lento y se cachean fuerte; la actividad es un timeline paginado e infinito). Mezclarlos obliga a re-pedir KPIs en cada "cargar más". | **Dos endpoints separados.** KPIs (`/dashboard`) se cachean con `staleTime` alto; actividad (`/activity`) pagina por cursor independiente. |
| **Cálculo en vivo (`groupBy`/`count` por request)** vs **vista materializada / tabla de métricas pre-agregada** | Materializado escala mejor a millones de orgs, pero agrega complejidad (refresh job, staleness, migración). A la escala actual (decenas/cientos de orgs) un `count`/`groupBy` indexado es sub-milisegundo. | **Cálculo en vivo**, con `staleTime` en el cliente para no martillar. Materializar es un follow-up SI y solo si el volumen lo exige (anotado en Risks/Open Questions). |
| **Paginación offset** vs **cursor** para `/activity` | Offset permite salto a página N arbitraria y es trivial, pero degrada en tablas grandes y se desincroniza con inserts concurrentes (audit es append-only de alto ritmo). Cursor es estable y eficiente pero no permite salto arbitrario. | **Cursor** — el timeline es "hacia atrás en el tiempo", no necesita salto arbitrario; la estabilidad ante inserts es el factor decisivo. |
| **Reusar `PlatformAuditPort` (write) para leer** vs **port de lectura dedicado** | Reusar evita una clase nueva, pero mezcla read/write en un puerto cuya única responsabilidad hoy es `record()`. | **Port de lectura dedicado** (`PlatformActivityReaderPort`) — separa responsabilidades, mantiene la superficie de cada port mínima (patrón del proyecto). Decisión final en design. |

## 5. Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| **Performance de los counts cross-tenant a escala** (groupBy/count sobre toda `Organization` y `platform_audit` en cada request) | Baja hoy (pocas orgs) / Media a futuro | `staleTime` alto en el cliente para KPIs; `count`/`groupBy` se apoyan en índices; `platform_audit` se lee SOLO paginado por cursor (nunca un `count(*)` total). Follow-up: materializar si el volumen crece. Design debe confirmar que existen los índices necesarios (status/plan no están indexados hoy — evaluar si hace falta a esta escala). |
| **Redacción del `payload` en el timeline de actividad** — el `payload` de `platform_audit` ya viene redactado en escritura (`PlatformAuditInterceptor` + `redact-secrets`), pero si la Vista B muestra el payload crudo podría exponer datos sensibles que se colaron | Media | La Vista B **NO muestra el `payload` crudo** por default; muestra `action` + org + actor + fecha (suficiente para un timeline legible). Si se muestra payload, confiar en la redacción de escritura y NO re-exponer campos sensibles. Design define qué campos del payload, si alguno, se renderizan. |
| **Resolución de nombres (org/actor) con N+1** al armar el timeline | Media | Resolver con `include` (join) en la misma query del adapter, NO loop de lookups. |
| **Serie de altas por mes con `groupBy` truncado** — Prisma `groupBy` no trunca fechas a mes nativamente | Media | Usar `$queryRaw` con `date_trunc('month', "createdAt")` (FechaContable no aplica acá: `createdAt` es timestamptz de auditoría, CLAUDE.md §4.6). Tipar el resultado raw con narrowing (cero `any`). |

## 6. Open questions

1. **Total de usuarios** = `prisma.user.count()` (todos los usuarios del sistema) **o** count de memberships activas distintas (usuarios con al menos una org activa)? El segundo es más significativo para "salud de la plataforma" pero más caro. Recomiendo arrancar con `user.count()` simple y refinar si se pide.
2. **Granularidad de la serie de altas**: ¿por mes (recomendado) o configurable (semana/mes)? Arranco por mes fijo; configurable es follow-up.
3. **¿Cuántos meses de timeline de altas** mostrar por default? (ej. últimos 12). Decisión de design/spec.
4. **¿La Vista B muestra algún campo del `payload`** o solo action/org/actor/fecha? Recomiendo solo metadata, sin payload, por el riesgo de redacción.

## 7. Affected areas

| Área | Impacto | Descripción |
|---|---|---|
| `backend/src/platform/platform-admin.controller.ts` | Modified | + `GET /dashboard`, `GET /activity` |
| `backend/src/platform/ports/platform-stats-reader.port.ts` | New | Port de agregación de orgs |
| `backend/src/platform/ports/platform-activity-reader.port.ts` | New | Port de lectura de actividad (cursor) |
| `backend/src/tenants/adapters/prisma-platform-stats-reader.adapter.ts` | New | Adapter Prisma (dueño del dominio Organization) |
| `backend/src/platform/adapters/*` | New/Modified | Adapter de actividad sobre `platform_audit` |
| `backend/src/platform/dto/platform-dashboard-response.dto.ts` | New | DTO KPIs (`@ApiOkResponse`) |
| `backend/src/platform/dto/platform-activity-response.dto.ts` | New | DTO actividad + `nextCursor` |
| `backend/src/platform/platform.module.ts` | Modified | Registrar nuevos ports/adapters |
| `frontend/src/features/platform-admin/{api,hooks,components}/` | New | Dashboard real |
| `frontend/src/features/platform-admin/pages/platform-home-page.tsx` | Modified | Reemplaza placeholder por dashboard |
| `frontend/src/types/api.ts` | Modified | Tipos regenerados del OpenAPI |

## 8. Success criteria

- [ ] `GET /admin/platform/dashboard` devuelve conteos por status, plan y vertical + totales + serie de altas, agregando TODAS las orgs (cross-tenant deliberado).
- [ ] `GET /admin/platform/activity` devuelve un timeline paginado por cursor sobre `platform_audit`, con org y actor resueltos, filtrable por `orgId`.
- [ ] La landing `/platform-admin` muestra KPIs + actividad reciente (ya no es un placeholder).
- [ ] Un no-super-admin recibe 403 en ambos endpoints (test `+`/`−`).
- [ ] Ningún `new Date()` en domain/service; `any` cero; queries cross-tenant documentadas como excepción deliberada a Anti-31.
- [ ] Drill-down financiero y adopción de packs quedan explícitamente fuera (slice futuro).
