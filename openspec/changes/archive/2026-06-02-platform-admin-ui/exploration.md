# Exploración — `platform-admin-ui`

Fase: **sdd-explore** · Change: `platform-admin-ui` · Proyecto: avicont · Fecha: 2026-06-02

---

## Resumen ejecutivo

El **backend de plataforma ya está 100% construido** (PRs #118–#127): el super-admin
puede listar/crear/suspender/archivar orgs, ajustar plan y verticales (entitlement),
gestionar feature-flags globales e impersonar cross-tenant — **todo solo por API/Swagger**.
Falta el **frontend `/platform-admin`**.

El stack frontend (Vite + React 19 + TanStack Query + shadcn) tiene un patrón maduro y
repetible (Screaming Architecture por feature, `api/` → `hooks/` → `pages/`, gating con
`usePermissions`/`<PermissionButton>`, shell con nav filtrado por vertical+permiso). Montar
el panel es replicar ese patrón en una feature nueva `features/platform-admin/`.

**El bloqueo real no es la UI, es la entrada al panel.** Hay tres piezas que el RBAC
normal del frontend NO resuelve:

1. **`GET /me/permissions` lanza 403 a un super-admin sin tenant activo** (`me.controller.ts:28`).
   Todo el gating del frontend (`usePermissions`, `useVerticalActivo`, el nav, `IndexRedirect`)
   se alimenta de ese endpoint. Un super-admin "puro" (sin membresía) nunca obtiene 200 → no
   tiene forma de saber que es super-admin ni de ver el panel.
2. **El frontend nunca expone `isSuperAdmin`.** El backend SÍ lo firma en el JWT
   (`auth.service.ts:108`, también en refresh y switch-tenant), pero el `JwtPayload` del
   frontend (`types/api.ts:29`) no lo declara y `auth-store.decodeJwt` no lo copia a `AuthUser`.
   No existe ningún `useEsSuperAdmin()` ni gating por super-admin.
3. **No hay patrón de gating "org-less"**: todo el gating existente asume un tenant activo.

Por eso el change tiene un **pre-requisito backend chico** + un **panel frontend**.

---

## Superficie API backend (lo que la UI consume)

Todos bajo `@Controller('admin/platform')`, guards `JwtAuthGuard + SuperAdminGuard`
(rechaza con 403 si `req.user.isSuperAdmin !== true`), interceptor `PlatformAuditInterceptor`.
**Org-less**: NO usan `TenantGuard` (el super-admin opera cross-tenant, sin tenant activo).
Archivo: `backend/src/platform/platform-admin.controller.ts`.

| # | Método | Ruta | Request DTO | Response | Códigos |
|---|--------|------|-------------|----------|---------|
| 1 | GET | `/admin/platform/orgs` | — | `PlatformOrgResponseDto[]` | 200 / 403 |
| 2 | POST | `/admin/platform/orgs` | `CreateOrgDto` | `PlatformOrgResponseDto` | 201 / 403 / 422 |
| 3 | PATCH | `/admin/platform/orgs/:id/status` | `UpdateOrgStatusDto` | `PlatformOrgResponseDto` | 200 / 403 / 404 |
| 4 | PATCH | `/admin/platform/orgs/:id/entitlement` | `UpdateEntitlementDto` | `PlatformOrgResponseDto` | 200 / 403 / 404 / 422 |

**Feature-flags globales** — re-gateado a `SuperAdminGuard` en Slice 6b (REQ-SA-16).
Archivo: `backend/src/feature-flags/feature-flags-admin.controller.ts`, `@Controller('admin/feature-flags')`, también org-less.

| # | Método | Ruta | Request DTO | Response |
|---|--------|------|-------------|----------|
| 5 | GET | `/admin/feature-flags` | — | lista de flags |
| 6 | POST | `/admin/feature-flags` | `CreateFeatureFlagDto` | flag creado |
| 7 | PUT | `/admin/feature-flags/:key` | `UpdateFeatureFlagDto` | flag actualizado |
| 8 | POST | `/admin/feature-flags/:key/toggle` | — | `{ key, enabled }` |
| 9 | DELETE | `/admin/feature-flags/:key` | — | `{ success: true }` |

**Impersonation cross-tenant** (PR #126, REQ-SA-17).
Archivo: `backend/src/impersonation/impersonation.controller.ts`, `@Controller('admin/impersonate')`, guard `AuthGuard('jwt')`.

| # | Método | Ruta | Request DTO | Response |
|---|--------|------|-------------|----------|
| 10 | POST | `/admin/impersonate` | `StartImpersonationDto` `{ targetUserId: uuid, reason: string(min 10) }` | `{ impersonationToken, expiresAt, impersonationId }` |
| 11 | POST | `/admin/impersonate/end` | — (token de impersonation) | 204 |

> **Cross-tenant en impersonation**: el controller resuelve el tenant vía header
> `X-Tenant-ID` (o `activeTenantId` del JWT como fallback). Un super-admin sin tenant
> activo DEBE mandar `X-Tenant-ID` con la org del target. El service ya permite que un
> super-admin impersone sin ser miembro (`impersonation.service.ts:64`,
> `callerEsSuperAdmin`). El frontend actual (`features/impersonation/api/start-impersonation.ts`)
> NO manda `X-Tenant-ID` — está pensado para el OWNER del tenant activo. La UI de plataforma
> necesita un flujo que pase ese header.

### DTOs (shapes para tipar el frontend)

**`CreateOrgDto`** (`platform/dto/create-org.dto.ts`):
```ts
{ name: string (≤100), modulo: ModuloOrganizacion (enum CONTABILIDAD|GRANJA), ownerEmail: string (email) }
```
422 si `ownerEmail` no corresponde a un usuario ya registrado.

**`PlatformOrgResponseDto`** (`platform/dto/platform-org-response.dto.ts`) — proyección plana de `Organization`:
```ts
{ id: string, name: string, slug: string, status: string, plan: string,
  contabilidadEnabled: boolean, granjaEnabled: boolean, createdAt: Date }
```

**`UpdateOrgStatusDto`**: `{ status: OrganizationStatus }` — enum `ACTIVE | SUSPENDED | ARCHIVED`.

**`UpdateEntitlementDto`** (todos opcionales): `{ plan?: Plan (FREE|PRO), contabilidadEnabled?: boolean, granjaEnabled?: boolean }`.
422 si el estado resultante deja ambos verticales en `true` (defense in depth con el CHECK `organizations_vertical_exclusivo_check`).

**Feature flags** (`feature-flags/dto/feature-flag.dto.ts`):
- `CreateFeatureFlagDto`: `{ key: string (^[a-z][a-z0-9_]*$, ≤100), name: string (≤200), description?: string (≤500), enabled?: boolean, metadata?: object }`
- `UpdateFeatureFlagDto`: `{ name?, description?, enabled?, metadata? }`
- `FeatureFlagResponseDto`: `{ id, key, name, description?, enabled, tenantId?, metadata?, createdAt, updatedAt }`

---

## Pre-requisito backend — `/me/permissions` + el 403 del super-admin puro

Estado actual (`backend/src/me/me.controller.ts`):
- Línea 28–32: si `!user.activeTenantId` → `throw ForbiddenError('ME_PERMISSIONS_SIN_TENANT')` (403). REQ-MP-06.
- Línea 70–75: respuesta `{ permissions, isOwner, activeTenantId, vertical }`. **No incluye `isSuperAdmin`.**
- `isSuperAdmin` SÍ está en `req.user` (`jwt.strategy.ts:50`, normalizado a boolean estricto), pero el `JwtUser` interface del controller (`me.controller.ts:10`) ni lo declara.

El frontend usa este endpoint como **única fuente de autorización** (`usePermissions`,
`useVerticalActivo`, `nav-list`, `IndexRedirect`). Por eso el 403 del super-admin puro
deja al frontend ciego respecto al privilegio de plataforma.

**Dónde tocar / decisiones del pre-req (a resolver en propuesta):**

1. **Exponer `isSuperAdmin`** en el contrato. Dos caminos:
   - (a) Agregarlo a `MePermissionsResponseDto` (+ frontend `MePermissionsResponse` y `usePermissions`).
   - (b) Endpoint nuevo `GET /me` liviano org-less que devuelva `{ userId, email, isSuperAdmin }`
     sin exigir tenant, dejando `/me/permissions` como está (tenant-scoped).
2. **Resolver el caso super-admin sin tenant.** Hoy el 403 es correcto para el flujo
   tenant-scoped. Opciones: (a) que `/me/permissions` devuelva 200 con `permissions: []`,
   `isSuperAdmin: true`, `activeTenantId: null` cuando no hay tenant pero sí es super-admin;
   (b) endpoint separado (opción 1b) y dejar `/me/permissions` intacto. **Recomendación:
   opción 1b/2b** — separar "identidad de plataforma" (org-less) de "permisos en el tenant"
   (tenant-scoped) es más limpio y no toca el contrato que ya consumen 5 callers.
3. **Frontend del pre-req**: agregar `isSuperAdmin` al `JwtPayload` (`types/api.ts:29`),
   copiarlo a `AuthUser` en `auth-store.decodeJwt`, y exponer un `useEsSuperAdmin()`.
   El JWT ya trae el claim — esto es decode-only, **cero red extra**. (Aun así conviene
   un endpoint server-authoritative para el caso de revocación-epoch; ver riesgos.)

---

## Convenciones frontend (sobre las que montar el panel)

### Routing (`frontend/src/routes/`)
- `router.tsx`: `createBrowserRouter`. Rutas protegidas envueltas en `<ProtectedRoute>` →
  `<DashboardShell>`. Cada ruta de feature se gatea con `<RequirePermission permission={…}>`.
- `index-redirect.tsx`: `/` resuelve destino por `useVerticalActivo()` (skeleton mientras
  `undefined`, `/granja` si GRANJA, `<SinModulo>` si null, dashboard si CONTABILIDAD).
  **Punto de integración**: un super-admin sin tenant cae acá → hoy vería skeleton infinito
  (la query está deshabilitada sin `activeTenantId`). Habrá que ramificar a `/platform-admin`.
- Patrón para agregar ruta: importar la page, añadir objeto `{ path, element }` al array,
  envolver en guard. Catch-all `{ path: '*', element: <Navigate to="/" replace /> }`.

### Gating (`frontend/CLAUDE.md §14.7`, `frontend/src/lib/use-permissions.ts`)
- `usePermissions()` → `{ has(p), hasAll([p]), isOwner, permissions, ...query }`. Fail-closed.
  Lee `GET /me/permissions` vía queryKey `['me-permissions', activeTenantId]`.
- `useHasSystemRole(['OWNER','ADMIN'])` para gating por SystemRole (no permiso fino).
- `<PermissionButton permission={…} deniedReason="…">` (disable + tooltip) → botones.
- `<Can permission={…}>` → mostrar/ocultar bloques. Keys en `@/lib/permissions.ts`.
- **No existe gating por `isSuperAdmin`.** Hay que crear `useEsSuperAdmin()` +
  `<RequireSuperAdmin>` (análogo a `RequirePermission`) para gatear la ruta `/platform-admin`
  y su ítem de nav. Es net-new pero pequeño.

### Nav / shell (`frontend/src/components/nav-items.ts`, `nav-list.tsx`, `shells/dashboard-shell.tsx`)
- `NAV_ITEMS` es la única fuente de verdad del menú. `NavItem { to, label, icon, requiredPermission?, vertical?, disabled? }`.
- `nav-list.tsx` filtra por `has(requiredPermission)` AND `vertical` activo. Items sin
  `vertical` son cross-vertical (administración). **El ítem de plataforma no encaja en el
  modelo vertical/permiso** → necesita un campo nuevo (`superAdminOnly?: boolean`) o un nav
  separado para el contexto super-admin. Decisión de propuesta.

### API client (`frontend/src/lib/api.ts`)
- Axios único `api` con `withCredentials`. Interceptor request inyecta `Bearer` desde
  `useAuthStore`. Interceptor response: 401 → refresh dedupe → retry.
- **Toda request va vía `api`** (Anti-F-03). Header `X-Tenant-ID` NO se setea por default;
  para impersonation cross-tenant hay que pasarlo explícito en el config de la request.
- Patrón por feature: `features/<x>/api/*.ts` (1 fn por endpoint, tipada) → `features/<x>/hooks/use-*.ts`
  (TanStack Query/Mutation). Componentes importan SOLO del hook (Anti-F-12).
- Tipos DTO compartidos en `frontend/src/types/api.ts` (espejo manual del backend —
  `MePermissionsResponse` línea 1022, `SystemRole` línea 185, etc.).

### UI kit (`frontend/src/components/ui/`)
Disponibles: `table`, `dialog`, `alert-dialog`, `sheet`, `form` (via rhf), `input`, `select`,
`checkbox`, `switch`, `badge`, `button`, `card`, `tabs`, `dropdown-menu`, `popover`, `command`,
`tooltip`, `skeleton`, `textarea`, `label`, `sonner`. **Suficiente** para tablas (lista de orgs,
flags), forms en Sheet (crear org, editar entitlement), badges de status/plan, confirm dialogs
(suspender/archivar), switches (toggle flags). Compartidos útiles: `pagination-bar`,
`require-permission`, `permission-button`, `<Can>`. Page chrome canónico en `frontend/CLAUDE.md §13`.

### Tests (`frontend/CLAUDE.md §9`)
- Vitest + Testing Library + user-event. Tests al lado del código (`*.test.tsx`).
- Query por rol/label/texto visible. No MSW aún (deuda) → los tests cubren forms, gating y
  lógica pura; los wrappers triviales de TanStack Query no se testean.
- Mock de gating: `vi.mock('@/lib/use-permissions', async (o) => ({ ...(await o()), usePermissions: () => ({...}) }))`
  con `importOriginal`. Para `isSuperAdmin` habrá que mockear el hook nuevo igual.
- Ejemplo de feature de punta a punta para replicar: **`features/impersonation/`** (api/ +
  hooks/ con mutation que intercambia token + schema zod + dialog) y **`features/tenants/`**
  (org-switcher con mutation + invalidación de cache).

---

## Scope tentativo

### (a) Pre-requisito backend
- **PR-0**: exponer identidad de plataforma org-less. Recomendado: endpoint liviano
  `GET /me` (o ampliar `/me/permissions` con manejo del caso sin-tenant) que devuelva
  `isSuperAdmin` sin exigir tenant activo. Frontend: agregar `isSuperAdmin` a `JwtPayload` +
  `AuthUser` + `useEsSuperAdmin()`. Tests backend (e2e) + frontend.

### (b) Panel frontend — feature `features/platform-admin/`
Pantallas propuestas (cada una replica el patrón api/→hooks/→pages/):
1. **Gating/entrada**: `<RequireSuperAdmin>` + ítem de nav `/platform-admin` (solo super-admin) +
   ramificación en `IndexRedirect` para super-admin sin tenant.
2. **Lista de organizaciones** (`/platform-admin/orgs`): tabla con name/slug/status/plan/verticales/createdAt,
   badges de status (ACTIVE/SUSPENDED/ARCHIVED) y plan (FREE/PRO). GET `/admin/platform/orgs`.
3. **Crear organización** (Sheet/form): name + modulo (select CONTABILIDAD/GRANJA) + ownerEmail.
   POST `/admin/platform/orgs`. Manejo del 422 (ownerEmail inexistente).
4. **Detalle / acciones de org**: cambiar status (suspender/reactivar/archivar vía AlertDialog) +
   editar entitlement (plan + verticales, con guard de exclusividad → 422). PATCH status / entitlement.
5. **Feature-flags globales** (`/platform-admin/feature-flags`): tabla + crear/editar/toggle (switch)/eliminar.
   GET/POST/PUT/POST toggle/DELETE `/admin/feature-flags`.
6. **Impersonation desde plataforma**: iniciar impersonation cross-tenant pasando `X-Tenant-ID`
   (extender o duplicar el flujo de `features/impersonation/` para soportar el header). Reutiliza
   `impersonation-banner` existente para el end.

> Posible split en slices: PR-0 (pre-req) → orgs lista+crear → status+entitlement →
> feature-flags → impersonation cross-tenant.

---

## Riesgos y preguntas abiertas (para la fase de propuesta)

1. **403 del super-admin puro en `/me/permissions`** — bloqueante de la entrada al panel.
   ¿Ampliar `/me/permissions` (toca contrato de 5 callers) o crear `GET /me` org-less separado?
   Recomendación: separar. **Decisión de propuesta.**
2. **`isSuperAdmin` ausente en el frontend** — el JWT ya lo trae (`auth.service.ts:108`) pero
   `JwtPayload`/`AuthUser`/`auth-store` no lo exponen. ¿Confiar en el decode del JWT (cero red,
   pero no respeta revocación-epoch en caliente) o gatear server-authoritative vía el endpoint
   nuevo? El gating frontend es UX (el candado real es `SuperAdminGuard`), así que el decode
   alcanza para mostrar/ocultar — pero el endpoint da consistencia con revocación.
3. **Gating por `isSuperAdmin` inexistente** — hay que crear `useEsSuperAdmin()` +
   `<RequireSuperAdmin>` + decidir cómo el `NAV_ITEMS`/nav-list incorpora un ítem que no es
   ni vertical ni permiso fino (campo `superAdminOnly?` vs nav separado).
4. **Tipos DTO duplicados front↔back** — `types/api.ts` es espejo manual. Sumar
   `PlatformOrgResponse`, `CreateOrgRequest`, `UpdateEntitlementRequest`, `UpdateOrgStatusRequest`,
   `FeatureFlag*`. Riesgo de drift (deuda conocida §10.10: `openapi-typescript`). No bloqueante.
5. **Impersonation cross-tenant necesita `X-Tenant-ID`** — el flujo frontend actual no lo manda.
   ¿Reutilizar `features/impersonation/` con un param de tenant, o un flujo propio en el panel?
   Además: ¿de dónde saca el super-admin el `targetUserId`? Hoy no hay endpoint de plataforma
   para listar usuarios/miembros de una org arbitraria → puede faltar superficie API (verificar
   si listar miembros cross-tenant existe; si no, es scope extra o se difiere).
6. **`IndexRedirect` con super-admin sin tenant** — hoy cae en skeleton infinito (query
   deshabilitada sin `activeTenantId`). Hay que ramificar explícitamente a `/platform-admin`.
7. **¿Layout del panel?** ¿Vive dentro del `DashboardShell` (con org-switcher que el super-admin
   puro no puede usar) o un shell propio `PlatformShell` sin contexto de tenant? Decisión de UX.
8. **Status como `string` en el response DTO** — `PlatformOrgResponseDto.status/plan` son `string`,
   no el enum. El frontend tipará con union literal manual; verificar que el backend no devuelva
   valores fuera de `ACTIVE|SUSPENDED|ARCHIVED` / `FREE|PRO`.

---

### Archivos clave (referencia rápida)

Backend:
- `backend/src/platform/platform-admin.controller.ts` + `dto/{create-org,platform-org-response,update-org-status,update-entitlement}.dto.ts`
- `backend/src/feature-flags/feature-flags-admin.controller.ts` + `dto/feature-flag.dto.ts`
- `backend/src/impersonation/impersonation.controller.ts` + `dto/start-impersonation.dto.ts` + `impersonation.service.ts:64`
- `backend/src/me/me.controller.ts:28` (403) + `dto/me-permissions-response.dto.ts`
- `backend/src/auth/strategies/jwt.strategy.ts:50` (isSuperAdmin en req.user) + `auth.service.ts:108` (claim en JWT)
- `backend/src/common/guards/super-admin.guard.ts`

Frontend:
- `frontend/src/routes/{router,index-redirect,protected-route}.tsx` + `components/shared/require-permission.tsx`
- `frontend/src/lib/{use-permissions,use-vertical,me-permissions,api}.ts`
- `frontend/src/components/{nav-items.ts,nav-list.tsx,shells/dashboard-shell.tsx,shared/permission-button.tsx}`
- `frontend/src/stores/auth-store.ts` (decodeJwt → AuthUser, sin isSuperAdmin) + `types/api.ts:29,1022`
- `frontend/src/features/impersonation/*` + `features/tenants/*` (features de referencia)
- `frontend/CLAUDE.md §13` (page chrome), `§14.7` (gating)
