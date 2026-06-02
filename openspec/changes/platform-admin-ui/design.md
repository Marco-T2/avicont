# Diseño técnico — `platform-admin-ui`

Fase: **sdd-design** · Change: `platform-admin-ui` · Proyecto: avicont · Fecha: 2026-06-02

> Acompaña a `proposal.md`. Las 4 decisiones lockeadas son la base. Este doc resuelve
> los trade-offs concretos de implementación. **No** se escribe código de producción aquí.

---

## 1. Backend — `GET /me/platform`

### 1.1 Dónde vive

**Decisión: ruta nueva en `MeController` (`me.controller.ts`), NO un controller nuevo.**

Trade-off considerado:
- (a) Nueva ruta en `MeController` — el controller ya está bajo `@Controller('me')` con
  `@UseGuards(JwtAuthGuard)` a nivel de clase. La ruta `GET /me/platform` encaja semánticamente
  ("identidad del usuario actual") y reusa el guard de clase. **Elegida.**
- (b) Controller nuevo `MePlatformController` — sobre-ingeniería para un read de un claim.

**Punto fino**: el 403 de `/me/permissions` ocurre **dentro del método** `permissions()` (línea 28),
NO en un guard de clase. Por eso agregar `GET /me/platform` en el MISMO controller es seguro: el
guard de clase es solo `JwtAuthGuard` (exige token válido, NO tenant). La nueva ruta simplemente
no replica el chequeo `if (!user.activeTenantId) throw 403`. **Es org-less por construcción.**

### 1.2 Cómo lee `isSuperAdmin`

El claim ya está normalizado a boolean estricto en `req.user` (`jwt.strategy.ts:50`). Hoy la
interface local `JwtUser` (`me.controller.ts:10`) no lo declara — hay que **ampliar esa interface**
con `isSuperAdmin?: boolean` (o `boolean`, según lo que el strategy garantice; el exploration dice
que el strategy lo normaliza a boolean estricto → declararlo `boolean`).

El método es un read directo:
```
@Get('platform')
mePlatform(@CurrentUser() user: JwtUser): MePlatformResponseDto {
  return { isSuperAdmin: user.isSuperAdmin };
}
```
Sin `async`, sin Prisma, sin RbacService. No toca dominio → **no se aplica hexagonal** (no hay
puerto/adapter; es un proyección de un claim ya resuelto upstream por el strategy). Esto es
consistente con §3.5 (la capa de presentación puede leer del request sin pasar por dominio cuando
no hay lógica de negocio).

### 1.3 Shape del response DTO

`MePlatformResponseDto` (nuevo, en `me/dto/me-platform-response.dto.ts`):
```
class MePlatformResponseDto {
  @ApiProperty()
  isSuperAdmin!: boolean;
}
```
Mínimo a propósito. **No** incluir `userId`/`email` (ya están en el JWT que el frontend tiene; el
panel no los necesita de este endpoint). Si v1.1 los pide, se amplía aditivamente.

### 1.4 Guard

`JwtAuthGuard` (heredado del `@UseGuards` de clase). **NO** se agrega `SuperAdminGuard` a esta ruta:
un usuario normal debe poder llamarla y recibir `{ isSuperAdmin: false }` (200). Si se gateara con
`SuperAdminGuard`, un usuario normal recibiría 403 y el frontend no podría distinguir "no soy
super-admin" de "error" → fail-closed funcionaría igual, pero 200+`false` es semánticamente más
limpio y evita ruido de 403 en logs/observabilidad para cada usuario normal que abre la app.

### 1.5 Tests backend

- e2e en `test/`: (1) super-admin con tenant → `200 { isSuperAdmin: true }`; (2) super-admin SIN
  tenant activo → `200 { isSuperAdmin: true }` (prueba que es org-less, NO 403); (3) usuario normal
  → `200 { isSuperAdmin: false }`; (4) sin token → `401`.
- Strict TDD: el test (2) es el que prueba el valor del change (org-less) — escribirlo primero.

---

## 2. Frontend — estructura de la feature

```
frontend/src/features/platform-admin/
├── api/
│   ├── get-me-platform.ts          GET /me/platform
│   ├── get-orgs.ts                 GET /admin/platform/orgs
│   ├── create-org.ts               POST /admin/platform/orgs
│   ├── update-org-status.ts        PATCH /admin/platform/orgs/:id/status
│   ├── update-entitlement.ts       PATCH /admin/platform/orgs/:id/entitlement
│   ├── get-feature-flags.ts        GET /admin/feature-flags
│   ├── create-feature-flag.ts      POST /admin/feature-flags
│   ├── update-feature-flag.ts      PUT /admin/feature-flags/:key
│   ├── toggle-feature-flag.ts      POST /admin/feature-flags/:key/toggle
│   └── delete-feature-flag.ts      DELETE /admin/feature-flags/:key
├── hooks/
│   ├── use-es-super-admin.ts       useEsSuperAdmin()
│   ├── use-orgs.ts
│   ├── use-create-org.ts
│   ├── use-update-org-status.ts
│   ├── use-update-entitlement.ts
│   ├── use-feature-flags.ts
│   ├── use-create-feature-flag.ts
│   ├── use-update-feature-flag.ts
│   ├── use-toggle-feature-flag.ts
│   └── use-delete-feature-flag.ts
├── components/
│   ├── org-status-badge.tsx        badge ACTIVE/SUSPENDED/ARCHIVED
│   ├── org-plan-badge.tsx          badge FREE/PRO
│   ├── create-org-sheet.tsx        Sheet-form crear org
│   ├── org-status-dialog.tsx       AlertDialog cambiar status
│   ├── entitlement-sheet.tsx       Sheet-form editar entitlement
│   ├── feature-flag-sheet.tsx      Sheet-form crear/editar flag
│   └── feature-flag-delete-dialog.tsx
├── pages/
│   ├── platform-home-page.tsx      placeholder/landing del panel (PR-0)
│   ├── orgs-page.tsx               lista de orgs (PR-1)
│   └── feature-flags-page.tsx      flags globales (PR-4)
├── schemas/
│   ├── create-org-schema.ts
│   ├── entitlement-schema.ts
│   └── feature-flag-schema.ts
└── types.ts                         tipos locales de la feature (si hace falta)
```

Gating primitivo y shell (cross-feature, viven fuera de `features/`):
```
frontend/src/components/shared/require-super-admin.tsx   <RequireSuperAdmin>
frontend/src/components/shells/platform-shell.tsx        PlatformShell
```

> `useEsSuperAdmin` vive en `features/platform-admin/hooks/` porque es la fachada de la feature
> (consume su API). `<RequireSuperAdmin>` vive en `components/shared/` porque es un guard de routing
> transversal (análogo a `require-permission.tsx`). El shell va en `components/shells/`.

### 2.1 `useEsSuperAdmin()`

```
// hooks/use-es-super-admin.ts (forma)
const accessToken = useAuthStore((s) => s.accessToken);
const query = useQuery({
  queryKey: ['me-platform'],          // org-less: NO depende de activeTenantId
  queryFn: getMePlatform,
  staleTime: 5 * 60 * 1000,
  enabled: Boolean(accessToken),       // basta el token; NO requiere tenant
});
return { esSuperAdmin: query.data?.isSuperAdmin ?? false, isLoading: query.isLoading };
```

Puntos clave:
- **queryKey `['me-platform']` SIN `activeTenantId`** — es identidad de plataforma, no de tenant.
  Esto la diferencia de `['me-permissions', activeTenantId]` y evita que un switch de tenant la
  invalide innecesariamente.
- **`enabled: Boolean(accessToken)`** — basta el token; funciona para super-admin sin tenant (que
  es exactamente el caso que `usePermissions` no cubre).
- **Fail-closed**: `?? false`. Sin data (cargando, error, revocado) → `false`.
- **Server-authoritative** (decisión #2): la revocación-epoch del super-admin hace que el guard
  backend devuelva 403/401 → la query falla → `esSuperAdmin` cae a `false` en el siguiente refetch.

### 2.2 `<RequireSuperAdmin>`

Análogo a `RequirePermission` pero gateando por `esSuperAdmin`:
- `isLoading` → skeleton (NO flash, NO redirect prematuro).
- `esSuperAdmin === false` (resuelto) → `<Navigate to="/" replace>` (lo saca del panel; el
  `IndexRedirect` lo manda a su destino normal de tenant).
- `esSuperAdmin === true` → render children.

Es el guard de **toda** ruta `/platform-admin/*`.

### 2.3 `PlatformShell`

Layout dedicado (`components/shells/platform-shell.tsx`), **independiente de `DashboardShell`**:
- **Sin org-switcher, sin contexto de tenant** (decisión #4). El super-admin opera cross-tenant.
- **Nav propio** (constante local `PLATFORM_NAV_ITEMS` en el shell, NO el `NAV_ITEMS` del dashboard):
  ítems "Organizaciones" (`/platform-admin/orgs`) y "Feature flags" (`/platform-admin/feature-flags`).
  No usa el modelo `vertical`/`requiredPermission` del nav de tenant — es navegación plana de plataforma.
- **Salida a la app de tenant**: incluir un link/acción "Volver a la app" → `/` (si el super-admin
  también tiene un tenant) o simplemente el logout. Detalle de UX a resolver en PR-0; mínimo viable:
  el `ThemeToggle` + logout que ya usa `DashboardShell`.
- Topbar + sidebar con el mismo chrome visual que `DashboardShell` (reusar primitivos `ui/`), pero
  marcado visualmente como "Plataforma" para que sea obvio que no es un tenant.
- Mobile: drawer/hamburger igual que el dashboard (§7 frontend), nav propio adentro.

> **Decisión**: NO reutilizar `DashboardShell` con un flag `modo="plataforma"`. Un shell propio es
> más limpio que ramificar el dashboard con condicionales (org-switcher sí/no, nav A/B). Plataforma
> ≠ tenant también a nivel de componente.

### 2.4 Routing — montaje de `/platform-admin/*`

`router.tsx`: agregar un bloque hermano del `DashboardShell`, **bajo `ProtectedRoute`** (necesita
auth) pero **FUERA de `DashboardShell`** (usa `PlatformShell`):

```
{
  element: <ProtectedRoute />,
  children: [
    { element: <DashboardShell />, children: [ /* rutas de tenant ... */ ] },
    {
      element: <PlatformShell />,
      children: [
        { path: '/platform-admin', element: <RequireSuperAdmin><PlatformHomePage /></RequireSuperAdmin> },
        { path: '/platform-admin/orgs', element: <RequireSuperAdmin><OrgsPage /></RequireSuperAdmin> },
        { path: '/platform-admin/feature-flags', element: <RequireSuperAdmin><FeatureFlagsPage /></RequireSuperAdmin> },
      ],
    },
  ],
},
```

Notas:
- `ProtectedRoute` llama `usePermissions()` como warm-up — para super-admin sin tenant esa query
  está deshabilitada (`enabled` con `activeTenantId`) → no dispara, no rompe. Confirmado en código.
- El catch-all `{ path: '*', element: <Navigate to="/" replace /> }` se mantiene al final.
- Cada ruta envuelta en `<RequireSuperAdmin>` (defensa de routing); el nav del `PlatformShell` solo
  se muestra a super-admins porque el shell entero vive detrás del guard.

### 2.5 `IndexRedirect` — ramificación del super-admin puro

Hoy `IndexRedirect` (`index-redirect.tsx`) resuelve por `useVerticalActivo()`: un super-admin sin
tenant cae en `vertical === undefined` para siempre (query deshabilitada) → skeleton infinito (R1).

**Decisión**: agregar al inicio de `IndexRedirect`, ANTES del chequeo `vertical === undefined`:
```
const { esSuperAdmin, isLoading } = useEsSuperAdmin();
const activeTenantId = useAuthStore((s) => s.user?.activeTenantId);

if (esSuperAdmin && !activeTenantId) {
  return <Navigate to="/platform-admin" replace />;
}
```

Orden y semántica:
- Solo ramifica al super-admin **sin tenant activo**. Un super-admin que TAMBIÉN tiene un tenant
  activo sigue el flujo normal (ve su dashboard de tenant) y entra a plataforma vía el nav/URL.
  Esto evita secuestrar la home de un super-admin que está trabajando en una org.
- Mientras `useEsSuperAdmin().isLoading` → mantener el skeleton actual (no flash, no redirect
  prematuro). El skeleton existente cubre este caso.

### 2.6 Tipos DTO (espejo manual)

Agregar a `frontend/src/types/api.ts` (con comentario que referencia el DTO backend de origen):
- `MePlatformResponse = { isSuperAdmin: boolean }`.
- `PlatformOrg = { id, name, slug, status: OrgStatus, plan: OrgPlan, contabilidadEnabled, granjaEnabled, createdAt: string }`.
- `OrgStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED'`.
- `OrgPlan = 'FREE' | 'PRO'`.
- `ModuloOrganizacion = 'CONTABILIDAD' | 'GRANJA'`.
- `CreateOrgRequest = { name: string; modulo: ModuloOrganizacion; ownerEmail: string }`.
- `UpdateOrgStatusRequest = { status: OrgStatus }`.
- `UpdateEntitlementRequest = { plan?: OrgPlan; contabilidadEnabled?: boolean; granjaEnabled?: boolean }`.
- `FeatureFlag = { id, key, name, description?, enabled, tenantId?, metadata?, createdAt: string, updatedAt: string }`.
- `CreateFeatureFlagRequest = { key, name, description?, enabled?, metadata? }`.
- `UpdateFeatureFlagRequest = { name?, description?, enabled?, metadata? }`.

**Trade-off aceptado** (decisión OUT de la propuesta): espejo manual, no `openapi-typescript`.
Mitigación de drift: union literals para enums + comentario `// Espeja backend X.dto.ts` por bloque.
`createdAt`/`updatedAt` se tipan como `string` (JSON serializa `Date` → ISO string sobre HTTP).

### 2.7 API client — sin `X-Tenant-ID`

Todas las requests de v1 van por el `api` axios único (Anti-F-03). Ninguna setea `X-Tenant-ID` (eso
era solo para impersonation cross-tenant, OUT). Los endpoints `/admin/platform/*` y
`/admin/feature-flags` son org-less en el backend (no usan `TenantGuard`) → el Bearer del super-admin
basta. **Nada que configurar** más allá del patrón estándar.

### 2.8 Manejo de errores específicos

- **422 al crear org** (`ownerEmail` no es usuario registrado): el `onError` de la mutation muestra
  `toast.error` con el `message` del backend (ya en español) o un mensaje compuesto vía
  `mensajeDeError` (`lib/error-messages.ts`). El form NO se cierra (el usuario corrige el email).
- **422 al editar entitlement** (ambas verticales `true`): idem — `toast.error` + form abierto. El
  schema zod del front puede prevenir el caso obvio (no permitir marcar ambas), pero el backend es
  el guard real (defense in depth); el 422 cubre el race/edge.
- **Badges defensivos** (R6): `OrgStatusBadge`/`OrgPlanBadge` mapean valores conocidos a variantes
  de color; valor inesperado → badge neutro con el string crudo (no romper la tabla).

---

## 3. Estrategia de tests Vitest (por pantalla)

Convención §9 frontend: tests al lado del código, query por rol/label/texto. No MSW (deuda) → mockear
hooks/API.

| Unidad | Qué testear | Cómo mockear |
|--------|-------------|--------------|
| `useEsSuperAdmin` | `true`/`false`/fail-closed sin data | Mockear `getMePlatform` (o el `api`) → assert con `renderHook` + QueryClient |
| `<RequireSuperAdmin>` | loading→skeleton, false→redirect, true→children | `vi.mock` del hook `useEsSuperAdmin` |
| `IndexRedirect` (rama nueva) | super-admin sin tenant → `/platform-admin`; super-admin con tenant → flujo normal; no-super-admin → flujo normal | `vi.mock` de `useEsSuperAdmin` + `useVerticalActivo` + `auth-store` |
| `OrgsPage` | render tabla, badges, loading skeleton, empty state | `vi.mock('../hooks/use-orgs')` devolviendo data/loading/empty |
| `CreateOrgSheet` | validación zod, submit deshabilitado con `isPending`, mapeo 422 | mock de `useCreateOrg` (mutation con `isPending`, `mutate`) |
| `OrgStatusDialog` | AlertDialog confirma con `preventDefault` + `onSuccess` cierra | mock de `useUpdateOrgStatus` |
| `EntitlementSheet` | form plan+verticales, guard de exclusividad, mapeo 422 | mock de `useUpdateEntitlement` |
| `FeatureFlagsPage` + sheets | tabla, switch toggle, crear/editar form, confirm delete | mocks de los hooks de flags |

Patrón de mock de hook (igual que el resto del repo):
`vi.mock('@/features/platform-admin/hooks/use-orgs', () => ({ useOrgs: () => ({ data, isLoading, isError }) }))`.

**NO testear** los wrappers triviales de TanStack Query (§9.4) — cubrir la lógica (forms, gating,
mapeo de error, badges defensivos).

---

## 4. Resumen de decisiones de diseño tomadas

1. **`GET /me/platform` vive en `MeController`** como ruta nueva (reusa `JwtAuthGuard` de clase, NO
   replica el 403 de tenant). Read trivial del claim — sin hexagonal.
2. **Response mínimo** `{ isSuperAdmin }` — sin userId/email (ya en el JWT).
3. **Guard solo `JwtAuthGuard`** (NO `SuperAdminGuard`): usuario normal → `200 { false }`, no 403.
4. **`useEsSuperAdmin` con queryKey `['me-platform']`** (sin `activeTenantId`), `enabled` solo con
   token → cubre el super-admin sin tenant. Fail-closed `?? false`. Server-authoritative.
5. **`PlatformShell` propio**, NO un `DashboardShell` con flag. Nav plano local, sin org-switcher.
6. **Rutas `/platform-admin/*` bajo `ProtectedRoute` pero fuera de `DashboardShell`**, cada una con
   `<RequireSuperAdmin>`.
7. **`IndexRedirect` ramifica solo al super-admin SIN tenant** (no secuestra al super-admin que está
   trabajando en una org).
8. **Tipos DTO espejo manual** con union literals + comentario de origen; `Date`→`string`.
9. **Impersonation OUT** (v1.1) — no se construye `X-Tenant-ID` ni listado de miembros cross-tenant.
