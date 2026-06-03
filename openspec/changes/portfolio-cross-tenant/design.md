# Design: Portfolio cross-tenant (KPIs + actividad super-admin)

> Fase SDD: **design**. Artifact store: hybrid (este archivo + engram `sdd/portfolio-cross-tenant/design`).
> Lee la proposal `sdd/portfolio-cross-tenant/proposal`. Stack: backend NestJS + Prisma + frontend Vite/React.

## Technical Approach

Dos endpoints nuevos en el `PlatformAdminController` existente (`/admin/platform`, ya gateado por
`JwtAuthGuard + SuperAdminGuard + PlatformAuditInterceptor`, org-less). Cada uno se respalda en un
**reader port dedicado** consumido por `PlatformAdminService`. Las queries agregan TODAS las orgs
sin filtrar `tenantId` — excepción deliberada a Anti-31 (enforcement vía `SuperAdminGuard`),
documentada en JSDoc de ambos ports. El frontend reemplaza el placeholder `PlatformHomePage` por un
dashboard contenedor con dos hooks. Patrón anclado en `OrgsReaderPort`/`PrismaOrgsReaderAdapter`
(adapter del dueño del dominio registrado en `PlatformModule`).

## Architecture Decisions

| Decisión | Opción elegida | Rationale (sobre el código real) |
|---|---|---|
| Adapter de stats de orgs | Vive en `tenants/adapters/` (dueño de `Organization`), registrado con token en `PlatformModule` | Idéntico a `PrismaOrgsReaderAdapter` ya registrado en module.ts:16,63-64. No cruza módulos (§3.3). |
| Adapter de actividad | Vive en `platform/adapters/` (lee `platform_audit`, tabla dueña de `platform`) | `platform` ya es dueño de `platform_audit` (escribe vía `PrismaPlatformAuditRepository`). La lectura es del mismo módulo → adapter local, registrado directo. |
| Port de actividad | `PlatformActivityReaderPort` NUEVO, separado de `PlatformAuditPort` (write-only `record()`) | No mezclar read/write; superficie mínima por port (patrón del proyecto). |
| Resolución org/actor | `include: { targetOrganization, actor }` en la misma query Prisma | Evita N+1 (relaciones ya existen en schema: PlatformAudit.actor / targetOrganization). |
| Serie de altas | `$queryRaw` con `date_trunc('month', "createdAt")`, narrowing tipado, 12 meses | Prisma `groupBy` no trunca a mes. `createdAt` es timestamptz auditoría, no FechaContable (§4.6). |
| Cursor | Opaco `base64("<createdAt ISO>|<id>")`, orden `createdAt DESC, id DESC`, predicado `(createdAt,id) < (c.createdAt,c.id)` | Estable ante inserts append-only; desempate por id. |
| Índice DB | **NINGUNO nuevo** en este slice | groupBy/count sobre decenas/cientos de orgs es sub-ms; activity sin orgId ordena por createdAt (volumen bajo, follow-up si crece). Con orgId usa `[targetOrganizationId, createdAt]` existente. Evita migración + riesgo §11.6. |
| Total usuarios | `prisma.user.count()` global | Default del orquestador. |
| Vista B payload | Solo metadata (action/org/actor/createdAt), NUNCA payload crudo | Riesgo de redacción (proposal §5). |

## Data Flow

    GET /dashboard ─→ Service ─→ PlatformStatsReaderPort ─→ Prisma groupBy/count/$queryRaw ─→ DashboardDto
    GET /activity?cursor ─→ Service ─→ PlatformActivityReaderPort ─→ Prisma findMany(include) ─→ ActivityDto{items,nextCursor}
    Frontend: usePlatformDashboard (useQuery) + usePlatformActivity (useInfiniteQuery, getNextPageParam=nextCursor)

## Backend — Interfaces / Contracts

**`platform/ports/platform-stats-reader.port.ts`** (NEW)
```ts
export const PLATFORM_STATS_READER_PORT = Symbol('PLATFORM_STATS_READER_PORT');
export interface OrgStatusCount { status: OrganizationStatus; count: number; }
export interface OrgPlanCount { plan: Plan; count: number; }
export interface AltasPorMes { mes: string; count: number; } // mes = 'YYYY-MM'
export interface PlatformStats {
  porStatus: OrgStatusCount[];
  porPlan: OrgPlanCount[];
  contabilidadEnabledCount: number;
  granjaEnabledCount: number;
  totalOrgs: number;
  totalUsuarios: number;
  altasPorMes: AltasPorMes[]; // últimos 12 meses, asc
}
export abstract class PlatformStatsReaderPort {
  /** Agrega TODAS las orgs sin filtrar tenantId — cross-tenant deliberado (Anti-31 N/A, SuperAdminGuard gate). */
  abstract getStats(): Promise<PlatformStats>;
}
```

**`platform/ports/platform-activity-reader.port.ts`** (NEW)
```ts
export const PLATFORM_ACTIVITY_READER_PORT = Symbol('PLATFORM_ACTIVITY_READER_PORT');
export interface ActivityItem {
  id: string; action: string; createdAt: Date;
  actorUserId: string; actorEmail: string; actorDisplayName: string | null;
  targetOrganizationId: string | null; targetOrganizationName: string | null;
}
export interface ActivityPage { items: ActivityItem[]; nextCursor: string | null; }
export interface ActivityQuery { limit: number; cursor?: { createdAt: Date; id: string }; orgId?: string; }
export abstract class PlatformActivityReaderPort {
  /** Lee platform_audit cross-tenant (Anti-31 N/A). Orden createdAt DESC,id DESC. Resuelve actor/org por include. */
  abstract findRecent(q: ActivityQuery): Promise<ActivityPage>;
}
```

Adapter de activity: `findMany({ where: { ...(orgId && {targetOrganizationId:orgId}), ...(cursor && {OR:[{createdAt:{lt}},{createdAt:cursor.createdAt,id:{lt}}]}) }, include:{actor:{select:{email,displayName}}, targetOrganization:{select:{name}}}, orderBy:[{createdAt:'desc'},{id:'desc'}], take: limit+1 })`. `nextCursor` = encode del item `limit+1` si existe.

**Service** `getDashboard()` (delega a statsReader) y `getActivity(dto)` (decode cursor → activityReader → encode nextCursor). Cursor codec en `platform/lib/activity-cursor.ts` (función pura: `encodeCursor/decodeCursor`, lanza `PlatformActivityCursorInvalidoError` si malformado).

**DTOs** (NEW, `@ApiOkResponse` + `@ApiProperty`):
- `PlatformDashboardResponseDto` — espeja `PlatformStats` (sub-DTOs `OrgStatusCountDto`, `OrgPlanCountDto`, `AltasPorMesDto` con `@ApiProperty({type:[...]})`). `createdAt`-free.
- `PlatformActivityResponseDto` — `items: PlatformActivityItemDto[]` + `nextCursor: string | null`. `createdAt` se serializa ISO (como `PlatformOrgResponseDto.createdAt`).
- `PlatformActivityQueryDto` — `limit?: number` (`@IsInt @Min(1) @Max(100)`, default 20), `cursor?: string`, `orgId?: string` (`@IsUUID`).

**Error**: `PlatformActivityCursorInvalidoError extends DomainError` → 400, code `PLATFORM_ACTIVITY_CURSOR_INVALIDO`, en `platform/domain/platform-errors.ts`.

## File Changes — Backend

| File | Action | Description |
|---|---|---|
| `platform/ports/platform-stats-reader.port.ts` | Create | Port stats + tipos |
| `platform/ports/platform-activity-reader.port.ts` | Create | Port activity + tipos |
| `tenants/adapters/prisma-platform-stats-reader.adapter.ts` | Create | groupBy/count/$queryRaw |
| `platform/adapters/prisma-platform-activity-reader.adapter.ts` | Create | findMany cursor + include |
| `platform/lib/activity-cursor.ts` | Create | encode/decode opaco (puro) |
| `platform/dto/platform-dashboard-response.dto.ts` | Create | DTO KPIs + sub-DTOs |
| `platform/dto/platform-activity-response.dto.ts` | Create | DTO items + nextCursor |
| `platform/dto/platform-activity-query.dto.ts` | Create | limit/cursor/orgId |
| `platform/domain/platform-errors.ts` | Modify | + CursorInvalidoError |
| `platform/platform-admin.controller.ts` | Modify | + GET /dashboard, GET /activity |
| `platform/platform-admin.service.ts` | Modify | + getDashboard/getActivity + inject 2 ports |
| `platform/platform.module.ts` | Modify | Registrar 2 ports + adapter stats (cross-module) + adapter activity (local) |
| `backend/openapi.json` | Modify | Regenerar (`openapi:dump`) — gate §10.10 |

## Frontend — File Changes

| File | Action | Description |
|---|---|---|
| `features/platform-admin/api/get-platform-dashboard.ts` | Create | `api.get('/api/admin/platform/dashboard')` |
| `features/platform-admin/api/get-platform-activity.ts` | Create | params `{limit,cursor?,orgId?}` |
| `features/platform-admin/hooks/use-platform-dashboard.ts` | Create | `useQuery(['platform-dashboard'], staleTime 60_000)` |
| `features/platform-admin/hooks/use-platform-activity.ts` | Create | `useInfiniteQuery(['platform-activity',orgId], getNextPageParam: p=>p.nextCursor ?? undefined)` |
| `features/platform-admin/components/kpi-card.tsx` | Create | Card presentacional (label/value/icon) |
| `features/platform-admin/components/dashboard-kpis.tsx` | Create | Grid de cards (status/plan/vertical/totales) |
| `features/platform-admin/components/altas-chart.tsx` | Create | Mini barras con primitivos (sin lib) |
| `features/platform-admin/components/activity-timeline.tsx` | Create | Lista + botón "Cargar más" |
| `features/platform-admin/pages/platform-home-page.tsx` | Modify | Reemplaza placeholder; orquesta ambos hooks (container) |
| `frontend/src/types/api.ts` | Modify | + alias `PlatformDashboard`, `PlatformActivity`, `PlatformActivityItem` desde Schemas |

Header canónico §13.1; KPIs `useQuery` con staleTime alto; activity `useInfiniteQuery`; empty/loading/error inline (Anti-F-13, §13.4); dark-mode + responsive (375/768/1440); tap targets ≥44px. Componentes presentacionales reciben props planas (Anti-F-11).

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit (back) | Cursor codec encode/decode roundtrip + malformado→error | `activity-cursor.spec.ts` puro |
| Unit (back) | Service getDashboard/getActivity orquesta ports + propaga nextCursor + decode cursor | `platform-admin.service.spec.ts` mocks de ambos ports |
| Integration (back) | Stats adapter (groupBy/count/$queryRaw mes) + activity adapter (cursor estable, include resuelve org/actor, filtro orgId) vs Postgres real | `*.integration.spec.ts` (DATABASE_URL) |
| E2E (back) | 200 super-admin en /dashboard + /activity; 403 no-super-admin (test +/−); paginación cursor (page1→page2 sin dup); cross-tenant agrega ≥2 orgs | `test/platform-portfolio.e2e-spec.ts` |
| Unit (front) | kpi-card, dashboard-kpis, altas-chart, activity-timeline renders + "Cargar más" callback | Testing Library |
| Unit (front) | platform-home-page container loading/empty/error | mock de hooks |

TDD strict: cada pieza con su test ANTES (cursor codec y adapters primero, son el núcleo).

## Migration / Rollout

**No migration required.** Sin índice nuevo (decisión arriba). Si el volumen de `platform_audit` o `Organization` crece, follow-up: índice `[createdAt, id]` en platform_audit (seguir §11.6) y/o materializar KPIs.

## Open Questions

- [ ] Ninguna bloqueante. Defaults cerrados por orquestador: user.count global, 12 meses fijos, Vista B solo metadata.
