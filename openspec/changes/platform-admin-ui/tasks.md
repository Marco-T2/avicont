# Tasks — `platform-admin-ui`

Fase: **sdd-tasks** · Change: `platform-admin-ui` · Proyecto: avicont · Fecha: 2026-06-02

> Checklist de implementación agrupado por PR, en orden de dependencia. **Strict TDD**: el test
> va PRIMERO, luego la implementación. Cada item es marcable. Idioma: dominio/UI español,
> framework inglés. Conventional commits, squash, sin Co-Authored-By.
>
> - Backend desde `backend/`. Frontend desde `frontend/`.
> - Backend test env: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (ver §11.3).
> - Frontend typecheck: `pnpm exec tsc -b` (NO `--noEmit`). Tests: `pnpm exec vitest`.
> - PR-0 es el habilitador (bloquea PR-1..4). PR-1..4 son independientes entre sí tras PR-0.

---

## PR-0 — Habilitador: `GET /me/platform` + primitivos de gating + shell + ruta + IndexRedirect

Branch: `feat/platform-admin-enabler`. Cubre REQ-PAUI-01..05.

### Backend — `GET /me/platform` (TDD)

- [x] **Test e2e primero**: crear `backend/test/me-platform.e2e-spec.ts` con los 4 casos de REQ-PAUI-01:
  - [x] super-admin CON tenant → `200 { isSuperAdmin: true }`
  - [x] super-admin SIN tenant activo → `200 { isSuperAdmin: true }` (caso clave org-less, NO 403)
  - [x] usuario normal → `200 { isSuperAdmin: false }`
  - [x] sin token → `401`
  - (reusar fixtures/helpers de `backend/test/me-permissions.e2e-spec.ts` para emitir JWTs con/sin `activeTenantId` y con `isSuperAdmin`)
- [x] Crear DTO `backend/src/me/dto/me-platform-response.dto.ts`: `class MePlatformResponseDto { @ApiProperty() isSuperAdmin!: boolean }`.
- [x] En `backend/src/me/me.controller.ts`: ampliar la interface local `JwtUser` con `isSuperAdmin: boolean`.
- [x] En `backend/src/me/me.controller.ts`: agregar `@Get('platform')` que retorna `{ isSuperAdmin: user.isSuperAdmin }` (sin `async`, sin Prisma, sin RbacService; reusa `JwtAuthGuard` de clase; NO replica el `if (!activeTenantId) throw`).
- [x] Verificación PR-0 backend:
  ```bash
  cd backend
  pnpm exec tsc --noEmit -p tsconfig.json
  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
  JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" \
  pnpm exec jest test/me-platform.e2e-spec.ts --runInBand --forceExit
  ```

### Frontend — tipos + api + hook `useEsSuperAdmin` (TDD)

- [x] En `frontend/src/types/api.ts`: agregar `MePlatformResponse = { isSuperAdmin: boolean }` (con comentario `// Espeja backend me-platform-response.dto.ts`).
- [x] Crear `frontend/src/features/platform-admin/api/get-me-platform.ts`: `GET /me/platform` vía `api`, retorna `MePlatformResponse`.
- [x] **Test primero**: `frontend/src/features/platform-admin/hooks/use-es-super-admin.test.ts` — `renderHook` + `QueryClientProvider`, mockear `get-me-platform` (o `api`):
  - [x] data `{ isSuperAdmin: true }` → `{ esSuperAdmin: true, isLoading: false }`
  - [x] data `{ isSuperAdmin: false }` → `esSuperAdmin: false`
  - [x] loading → `esSuperAdmin === false`, `isLoading === true` (fail-closed)
  - [x] error / sin data → `esSuperAdmin === false`
- [x] Crear `frontend/src/features/platform-admin/hooks/use-es-super-admin.ts`: `useQuery({ queryKey: ['me-platform'], queryFn: getMePlatform, staleTime: 5*60*1000, enabled: Boolean(accessToken) })`, retorna `{ esSuperAdmin: query.data?.isSuperAdmin ?? false, isLoading: query.isLoading }`.

### Frontend — `<RequireSuperAdmin>` (TDD)

- [x] **Test primero**: `frontend/src/components/shared/require-super-admin.test.tsx` (mock `vi.mock` de `useEsSuperAdmin`):
  - [x] `esSuperAdmin true` → renderiza children
  - [x] `esSuperAdmin false` (no loading) → redirige a `/` (`<Navigate replace>`)
  - [x] `isLoading` → skeleton, sin redirect ni children
- [x] Crear `frontend/src/components/shared/require-super-admin.tsx` (análogo a `require-permission.tsx`).

### Frontend — `PlatformShell` + ruta `/platform-admin` + IndexRedirect

- [x] Crear `frontend/src/features/platform-admin/pages/platform-home-page.tsx` (landing/placeholder del panel).
- [x] Crear `frontend/src/components/shells/platform-shell.tsx`: nav plano local `PLATFORM_NAV_ITEMS` (Organizaciones `/platform-admin/orgs`, Feature flags `/platform-admin/feature-flags`), sin org-switcher, marcado visual "Plataforma", acción salida ("Volver a la app" `/` + logout), `<Outlet />`. Reusar primitivos `ui/` y patrón visual de `dashboard-shell.tsx`.
- [x] En `frontend/src/routes/router.tsx`: agregar bloque hermano de `DashboardShell` bajo `ProtectedRoute`, con `element: <PlatformShell />` y children `/platform-admin`, `/platform-admin/orgs`, `/platform-admin/feature-flags`, cada uno envuelto en `<RequireSuperAdmin>`. (orgs/feature-flags pueden apuntar a placeholders en PR-0; se llenan en PR-1/PR-4). Mantener el catch-all `*` al final.
- [x] **Test primero**: extender `frontend/src/routes/index-redirect.test.tsx` con la rama nueva (mock `useEsSuperAdmin` + `useVerticalActivo` + `auth-store`):
  - [x] super-admin sin `activeTenantId` → `Navigate /platform-admin`
  - [x] super-admin con `activeTenantId` → flujo de vertical existente
  - [x] no super-admin → flujo existente
  - [x] `useEsSuperAdmin().isLoading` → skeleton existente
- [x] En `frontend/src/routes/index-redirect.tsx`: agregar AL INICIO (antes de `vertical === undefined`) la rama `if (esSuperAdmin && !activeTenantId) return <Navigate to="/platform-admin" replace />` y respetar `isLoading` → skeleton.

- [x] Verificación PR-0 frontend:
  ```bash
  cd frontend
  pnpm exec tsc -b
  pnpm exec vitest run src/features/platform-admin src/components/shared/require-super-admin.test.tsx src/routes/index-redirect.test.tsx
  ```

---

## PR-1 — Lista de organizaciones (REQ-PAUI-06)

Branch: `feat/platform-admin-orgs-list`. Depende de PR-0.

- [ ] Tipos en `frontend/src/types/api.ts`: `OrgStatus = 'ACTIVE'|'SUSPENDED'|'ARCHIVED'`, `OrgPlan = 'FREE'|'PRO'`, `PlatformOrg = { id; name; slug; status: OrgStatus; plan: OrgPlan; contabilidadEnabled; granjaEnabled; createdAt: string }` (comentario `// Espeja backend platform-org-response.dto.ts`).
- [ ] `api/get-orgs.ts`: `GET /admin/platform/orgs` → `PlatformOrg[]`.
- [ ] `hooks/use-orgs.ts`: `useQuery(['platform-orgs'], getOrgs)`.
- [ ] **Tests primero**: `components/org-status-badge.test.tsx` y `org-plan-badge.test.tsx` (valor conocido → variante; valor inesperado → badge neutro con string crudo, R6). Luego `org-status-badge.tsx` / `org-plan-badge.tsx`.
- [ ] **Test primero**: `pages/orgs-page.test.tsx` (mock `use-orgs`): tabla con filas, badges, loading skeleton, empty state ("No hay organizaciones"), error en español. Luego `pages/orgs-page.tsx` (tabla `ui/table`, page chrome §13).
- [ ] Conectar la ruta `/platform-admin/orgs` del router a `OrgsPage` real (reemplazar placeholder de PR-0).
- [ ] Verificación PR-1:
  ```bash
  cd frontend
  pnpm exec tsc -b
  pnpm exec vitest run src/features/platform-admin
  ```

---

## PR-2 — Crear organización (REQ-PAUI-07)

Branch: `feat/platform-admin-create-org`. Depende de PR-0/PR-1.

- [ ] Tipos: `ModuloOrganizacion = 'CONTABILIDAD'|'GRANJA'`, `CreateOrgRequest = { name: string; modulo: ModuloOrganizacion; ownerEmail: string }`.
- [ ] `api/create-org.ts`: `POST /admin/platform/orgs`.
- [ ] `schemas/create-org-schema.ts`: zod — `name` (≤100, no vacío), `modulo` enum, `ownerEmail` email; mensajes en español.
- [ ] `hooks/use-create-org.ts`: `useMutation` con `onSuccess` (invalidar `['platform-orgs']` + toast éxito), `onError` (toast.error con `mensajeDeError`, sin cerrar form).
- [ ] **Test primero**: `components/create-org-sheet.test.tsx` (mock `use-create-org`): validación zod (name vacío / email inválido → no llama backend), submit deshabilitado con `isPending`, éxito cierra + refresca, 422 → toast + form abierto.
- [ ] `components/create-org-sheet.tsx` (Sheet + react-hook-form + zod + select modulo).
- [ ] Botón "Crear organización" en `OrgsPage` que abre el Sheet.
- [ ] Verificación PR-2:
  ```bash
  cd frontend
  pnpm exec tsc -b
  pnpm exec vitest run src/features/platform-admin
  ```

---

## PR-3 — Status + entitlement (REQ-PAUI-08, REQ-PAUI-09)

Branch: `feat/platform-admin-status-entitlement`. Depende de PR-0/PR-1.

- [ ] Tipos: `UpdateOrgStatusRequest = { status: OrgStatus }`, `UpdateEntitlementRequest = { plan?: OrgPlan; contabilidadEnabled?: boolean; granjaEnabled?: boolean }`. Usar spread condicional para campos opcionales (`exactOptionalPropertyTypes`).
- [ ] `api/update-org-status.ts`: `PATCH /admin/platform/orgs/:id/status`. `api/update-entitlement.ts`: `PATCH /admin/platform/orgs/:id/entitlement`.
- [ ] `schemas/entitlement-schema.ts`: zod — `plan` enum opcional + guard de exclusividad (no ambas verticales `true`), mensaje en español.
- [ ] `hooks/use-update-org-status.ts` y `hooks/use-update-entitlement.ts`: mutations con invalidación de `['platform-orgs']` + toast; `onError` toast.error sin cerrar (entitlement: mapear 422 exclusividad).
- [ ] **Test primero**: `components/org-status-dialog.test.tsx` (mock `use-update-org-status`): confirmar llama mutation + cierra al éxito; cancelar no llama. Luego `components/org-status-dialog.tsx` (`AlertDialog`).
- [ ] **Test primero**: `components/entitlement-sheet.test.tsx` (mock `use-update-entitlement`): guard exclusividad en cliente (ambas true → error, no llama), submit OK, 422 → toast + form abierto. Luego `components/entitlement-sheet.tsx` (Sheet + plan select + switches verticales).
- [ ] Acciones por fila en `OrgsPage` (dropdown-menu): "Cambiar estado" → `OrgStatusDialog`, "Editar entitlement" → `EntitlementSheet`.
- [ ] Verificación PR-3:
  ```bash
  cd frontend
  pnpm exec tsc -b
  pnpm exec vitest run src/features/platform-admin
  ```

---

## PR-4 — Feature-flags globales (REQ-PAUI-10)

Branch: `feat/platform-admin-feature-flags`. Depende de PR-0.

- [ ] Tipos: `FeatureFlag = { id; key; name; description?; enabled; tenantId?; metadata?; createdAt: string; updatedAt: string }`, `CreateFeatureFlagRequest = { key; name; description?; enabled?; metadata? }`, `UpdateFeatureFlagRequest = { name?; description?; enabled?; metadata? }` (espeja `feature-flag.dto.ts`). Spread condicional para opcionales.
- [ ] `api/`: `get-feature-flags.ts` (GET), `create-feature-flag.ts` (POST), `update-feature-flag.ts` (PUT `/:key`), `toggle-feature-flag.ts` (POST `/:key/toggle`), `delete-feature-flag.ts` (DELETE `/:key`).
- [ ] `schemas/feature-flag-schema.ts`: zod — `key` patrón `^[a-z][a-z0-9_]*$` (≤100), `name` (≤200), `description?` (≤500); mensajes en español.
- [ ] `hooks/`: `use-feature-flags.ts` (query `['feature-flags-global']`), `use-create-feature-flag.ts`, `use-update-feature-flag.ts`, `use-toggle-feature-flag.ts`, `use-delete-feature-flag.ts` (mutations con invalidación + toast).
- [ ] **Test primero**: `pages/feature-flags-page.test.tsx` (mock hooks): tabla con switch, loading/empty/error en español, toggle llama mutation. Luego `pages/feature-flags-page.tsx`.
- [ ] **Test primero**: `components/feature-flag-sheet.test.tsx` (mock create/update): validación de `key` (formato inválido no llama backend), crear y editar. Luego `components/feature-flag-sheet.tsx`.
- [ ] **Test primero**: `components/feature-flag-delete-dialog.test.tsx` (mock delete): confirmar llama, cancelar no. Luego `components/feature-flag-delete-dialog.tsx` (`AlertDialog`).
- [ ] Conectar la ruta `/platform-admin/feature-flags` del router a `FeatureFlagsPage` real (reemplazar placeholder de PR-0).
- [ ] Verificación PR-4:
  ```bash
  cd frontend
  pnpm exec tsc -b
  pnpm exec vitest run src/features/platform-admin
  ```

---

## Fuera de scope (v1)

- Impersonation cross-tenant (v1.1). Tipos DTO auto-generados. Tocar `/me/permissions`.
