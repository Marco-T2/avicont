# Propuesta — `platform-admin-ui`

Fase: **sdd-propose** · Change: `platform-admin-ui` · Proyecto: avicont · Fecha: 2026-06-02

---

## Intent / problema

El **backend de plataforma está 100% construido** (PRs #118–#127): el super-admin puede
listar/crear/suspender/archivar organizaciones, ajustar plan y verticales (entitlement) y
gestionar feature-flags globales. **Pero hoy todo eso solo se opera por Swagger/curl.** No
existe panel `/platform-admin` en el frontend.

El bloqueo real **no es dibujar pantallas** (el stack frontend tiene un patrón maduro y
repetible: feature → `api/` → `hooks/` → `pages/`). El bloqueo es **la entrada al panel**:

1. **`GET /me/permissions` lanza 403 a un super-admin sin tenant activo** (`me.controller.ts:28`).
   Todo el gating del frontend se alimenta de ese endpoint. Un super-admin "puro" (sin membresía)
   nunca obtiene 200 → el frontend nunca sabe que es super-admin ni puede mostrar el panel.
2. **El frontend nunca expone `isSuperAdmin`** — ni hay patrón de gating "org-less".
3. **`IndexRedirect` deja a un super-admin sin tenant en skeleton infinito** (la query del vertical
   está deshabilitada sin `activeTenantId`).

Por eso el change es un **pre-requisito backend chico** (un endpoint nuevo org-less) + **un panel
frontend** que replica el patrón de features existente, gateado server-authoritative.

---

## Scope

### IN (v1)

- **Backend**: endpoint nuevo **org-less** `GET /me/platform` → `{ isSuperAdmin: boolean }`.
- **Frontend primitivos de gating de plataforma**: `useEsSuperAdmin()`, `<RequireSuperAdmin>`,
  `PlatformShell` (layout dedicado sin org-switcher), ramificación de `IndexRedirect`.
- **Lista de organizaciones** (`GET /admin/platform/orgs`): tabla con name/slug/status/plan/verticales/createdAt.
- **Crear organización** (`POST /admin/platform/orgs`): name + modulo (CONTABILIDAD|GRANJA) + ownerEmail.
  Manejo del 422 (ownerEmail no corresponde a usuario registrado).
- **Cambiar status** (`PATCH /admin/platform/orgs/:id/status`): ACTIVE / SUSPENDED / ARCHIVED.
- **Editar entitlement** (`PATCH /admin/platform/orgs/:id/entitlement`): plan FREE/PRO + verticales;
  422 si ambas verticales quedan en `true`.
- **Feature-flags globales** (`GET/POST/PUT /admin/feature-flags`, `POST :key/toggle`, `DELETE :key`).

### OUT (explícito)

- **Impersonation cross-tenant desde plataforma** → **diferida a v1.1**. Requiere una API de
  listado de miembros cross-tenant (de dónde saca el super-admin el `targetUserId`) que **no existe
  hoy**, y un flujo que pase `X-Tenant-ID`. No se construye en v1.
- **Listado de miembros/usuarios cross-tenant** — superficie API inexistente; entra solo cuando
  se haga impersonation v1.1.
- **Tipos DTO auto-generados** (`openapi-typescript`) — fuera de scope. Los tipos del frontend se
  escriben a mano espejando los DTOs backend (deuda conocida §10.10).
- **Tocar `GET /me/permissions`** o su 403 — se deja **intacto** (tiene 5 callers; el endpoint nuevo
  `GET /me/platform` lo evita por completo).
- **Generalizar revocación de tokens / `X-Tenant-ID`** — no aplica en v1.

---

## Approach de alto nivel

1. **Backend (1 endpoint trivial)**: `GET /me/platform`, org-less, protegido solo por `JwtAuthGuard`
   (NO el guard de tenant). Lee `isSuperAdmin` del claim ya presente en `req.user` y lo devuelve.
   Read trivial — sin sobre-ingeniería hexagonal (no toca dominio).
2. **Frontend — primitivos de gating**: feature nueva `features/platform-admin/` con un hook
   `useEsSuperAdmin()` que consume `GET /me/platform` vía TanStack Query (server-authoritative),
   un `<RequireSuperAdmin>` (route guard análogo a `RequirePermission`), y un `PlatformShell`
   dedicado (sin org-switcher, sin contexto de tenant). El router monta `/platform-admin/*` bajo
   `ProtectedRoute` (auth) pero FUERA de `DashboardShell`.
3. **Frontend — pantallas**: cada pantalla replica `api/ → hooks/ → pages/` con tabla / Sheet-form /
   AlertDialog, espejando los DTOs backend en `types/api.ts`.

### Decisiones cerradas (lockeadas por el usuario — no se re-abren)

1. **Entrada al panel = endpoint nuevo org-less `GET /me/platform`** → `{ isSuperAdmin: boolean }`.
   NO se toca `GET /me/permissions` ni su 403. El endpoint nuevo NO requiere `activeTenantId`.
2. **Gating server-authoritative**: el frontend NO decodifica el JWT para saber si es super-admin;
   consume `GET /me/platform` (TanStack Query) para que la **revocación-epoch del super-admin** se
   respete (token revocado → el guard backend rechaza → la query falla → gating cierra).
3. **Scope v1** = orgs (list/crear/status/entitlement) + feature-flags globales. **Impersonation
   diferida a v1.1.**
4. **Layout = `PlatformShell` propio**: shell dedicado SIN org-switcher ni contexto de tenant.
   Nav propio. Conceptualmente plataforma ≠ tenant.

---

## Particionado en PRs

PRs chicas y por scope (§9). Squash merge, scope por módulo, sin Co-Authored-By.

| PR | Título sugerido | Contenido | Test |
|----|-----------------|-----------|------|
| **PR-0** | `feat(platform): GET /me/platform + primitivos de gating + PlatformShell` | Backend `GET /me/platform` org-less. Frontend: `useEsSuperAdmin()`, `<RequireSuperAdmin>`, `PlatformShell` (layout + nav propio), ruta `/platform-admin` montada (page placeholder), ramificación de `IndexRedirect` (super-admin sin tenant → `/platform-admin`). | e2e backend (200 super-admin / 403 no-super-admin / org-less sin tenant) + Vitest (`useEsSuperAdmin`, `RequireSuperAdmin`, `IndexRedirect` rama nueva) |
| **PR-1** | `feat(platform-ui): lista de organizaciones` | `features/platform-admin/api/get-orgs.ts` + `hooks/use-orgs.ts` + `pages/orgs-page.tsx` (tabla, badges de status/plan, skeleton, empty state). Ítem de nav en `PlatformShell`. | Vitest (render tabla, badges, empty/loading) |
| **PR-2** | `feat(platform-ui): crear organización` | `api/create-org.ts` + `hooks/use-create-org.ts` + Sheet-form (name + modulo select + ownerEmail) + schema zod. Manejo del 422 (ownerEmail inexistente). Invalidación de `['platform-orgs']`. | Vitest (validación form, submit isPending, mapeo 422) |
| **PR-3** | `feat(platform-ui): status y entitlement de organización` | `api/update-org-status.ts` + `api/update-entitlement.ts` + hooks + acciones desde la lista/detalle: AlertDialog para status (suspender/reactivar/archivar) + Sheet-form para entitlement (plan + verticales, guard de exclusividad → 422). | Vitest (confirm dialogs, form entitlement, mapeo 422 verticales) |
| **PR-4** | `feat(platform-ui): feature-flags globales` | `features/platform-admin/` sub-área de flags: `api/` (get/create/update/toggle/delete) + hooks + `pages/feature-flags-page.tsx` (tabla + switch toggle + Sheet crear/editar + AlertDialog eliminar). | Vitest (tabla, toggle switch, form crear/editar, confirm delete) |

> PR-0 es el habilitador (sin él no hay entrada al panel). PR-1..PR-4 son independientes entre sí
> una vez mergeado PR-0; pueden ir en cualquier orden.

---

## Riesgos y mitigaciones

| # | Riesgo | Mitigación |
|---|--------|------------|
| R1 | **`IndexRedirect` deja al super-admin puro en skeleton infinito** (query del vertical deshabilitada sin tenant). | En PR-0, ramificar `IndexRedirect`: si `useEsSuperAdmin()` es `true` Y no hay `activeTenantId` → `<Navigate to="/platform-admin" replace>`. El orden importa: chequear super-admin-sin-tenant ANTES del `vertical === undefined`. |
| R2 | **Gating frontend desincronizado con revocación-epoch** si se decodificara el JWT. | Decisión lockeada #2: `useEsSuperAdmin()` consume `GET /me/platform` (server-authoritative). Token revocado → guard rechaza → query falla → `useEsSuperAdmin()` fail-closed (`false`). |
| R3 | **`X-Tenant-ID` no aplica en v1** (era para impersonation cross-tenant). | Impersonation está OUT (v1.1). El `api` client del frontend no setea `X-Tenant-ID`; ninguna request de v1 lo necesita. |
| R4 | **`ProtectedRoute` llama `usePermissions()` como warm-up** → 403 silencioso para super-admin sin tenant. | Ya está fail-safe: el hook tiene `enabled: Boolean(accessToken && activeTenantId)` → la query ni se dispara sin tenant. No rompe; solo no precalienta (irrelevante para el panel, que no usa permisos finos). |
| R5 | **Drift de tipos DTO front↔back** (espejo manual). | Aceptado como deuda (§10.10 `openapi-typescript`). Mitigación: tipos en `types/api.ts` con union literals para `status`/`plan`/`modulo`; comentario que referencia el DTO backend de origen. |
| R6 | **`status`/`plan` llegan como `string`** en `PlatformOrgResponseDto` (no enum). | El frontend tipa con union literal (`'ACTIVE'|'SUSPENDED'|'ARCHIVED'`, `'FREE'|'PRO'`). El render de badges hace fallback defensivo para valores inesperados (no romper la tabla). |

---

## Definición de "listo"

- Un super-admin (con o sin tenant activo) entra a la app y es ramificado a `/platform-admin`.
- Puede listar orgs, crear una org con OWNER por email, suspender/reactivar/archivar, editar plan y
  verticales (con el 422 de exclusividad manejado), y gestionar feature-flags globales.
- Un usuario NO super-admin nunca ve el panel (route guard + nav oculto) y el backend lo rechazaría
  igual (defensa real).
- `pnpm exec tsc -b` limpio en frontend, e2e backend verde, Vitest verde.
