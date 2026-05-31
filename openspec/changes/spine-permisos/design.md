# spine-permisos — Design

> Fase: sdd-design. Decisiones de arquitectura y approach. NO contiene implementación completa.
> Artifact store: hybrid (este archivo + engram `sdd/spine-permisos/design`).
> Filosofía rectora (Marco): **"amigable adelante, riguroso atrás"** — el gating de UI es SOLO UX
> (ocultar/deshabilitar para no frustrar). La autoridad real sigue siendo el backend
> (`PermissionsGuard`). El frontend NUNCA es la barrera de seguridad.

---

## 0. Correcciones al proposal (verificado contra el repo real)

El proposal asumió varias cosas que NO coinciden con el código actual. El design corrige sobre
hechos leídos de los archivos. Estas correcciones son vinculantes para la fase tasks:

| Proposal asume | Realidad verificada en el repo |
|---|---|
| No existe hook de gating en frontend | **YA EXISTE `frontend/src/lib/use-permissions.ts`** (+ `use-permissions.test.tsx`). El change EXTIENDE/COMPLETA, no crea de cero. **Tasks debe leer ese archivo primero.** |
| Backend usa `@CurrentUser()` en `src/auth/decorators/...` | El decorator vive en `src/common/decorators/current-user.decorator.ts` (existe). |
| `req.user.userId` | El payload es `{ sub, email, activeTenantId, roles, impersonatedBy, impersonationId }`. El id es **`sub`**, NO `userId`. |
| `RbacService.resolverPermisos(...)` + `esOwner(...)` | NO existen esos métodos. `RbacService` expone `getPermissions(userId, organizationId) → ResolvedPermissions` y `hasPermission/hasAllPermissions/hasAnyPermission`. |
| `resolverPermisos` devuelve `{ esOwner, permisos: Set<string> }` | `ResolvedPermissions = { esOwner: boolean, esAdmin: boolean, wildcards: string[] }`. NO hay `permisos` como Set; hay `wildcards: string[]` (patrones tipo `contabilidad.*`, no la lista expandida). También hay `esAdmin` además de `esOwner`. |
| `JwtAuthGuard` en `src/auth/guards/...` | Está en `src/common/guards/jwt-auth.guard.ts`. |
| Frontend: `api-client.ts`, `features/auth/`, `layout/nav-items.ts`, `app/router.tsx`, `features/reportes/` | Reales: `src/lib/api.ts` (`api`), gating actual en `src/lib/`, `src/components/nav-items.ts` + `nav-list.tsx`, `src/routes/router.tsx` + `protected-route.tsx`, páginas en `features/balance-general/` y `features/estado-resultados/`. NO existe `features/auth/index.ts` ni `types.ts`. |
| Tooltip "no existe" | **`src/components/ui/tooltip.tsx` SÍ existe.** El botón deshabilitado puede usar Tooltip real. |
| Códigos de permiso EEFF/libros | Catálogo real: `contabilidad.eeff.read`, `contabilidad.libro-diario.read`, `contabilidad.libro-mayor.read`, `contabilidad.comprobantes.read`, etc. (con guiones, no camelCase). |

**Consecuencia de diseño grande:** como `getPermissions` devuelve `wildcards` (patrones) y banderas
`esOwner/esAdmin` — NO la lista plana de permisos efectivos — el endpoint debe decidir QUÉ serializa.
Ver D-B2.

> Acción para sdd-spec / nota cruzada: el spec del proposal debe revisarse contra estas correcciones
> (formato de la respuesta y códigos de permiso). El proposal queda como intención; el contrato real
> lo fija este design + el spec.

---

## 1. Contexto verificado en el repo

**Backend**
- `RbacService` (`backend/src/rbac/rbac.service.ts`) es público (lo exporta `RbacModule`):
  - `getPermissions(userId, organizationId): Promise<ResolvedPermissions>` (con cache Redis).
  - `ResolvedPermissions = { esOwner: boolean; esAdmin: boolean; wildcards: string[] }`.
  - `hasPermission / hasAllPermissions / hasAnyPermission`: owner||admin ⇒ `true`; si no, matchea
    `wildcards` contra el permiso vía `matchesPermission` (`domain/permission-matcher.ts`).
- `PermissionsGuard` (`backend/src/rbac/guards/permissions.guard.ts`): lee `req.user` (`{ sub, activeTenantId }`),
  `tenantId = header X-Tenant-ID || user.activeTenantId`; si falta lanza
  `ForbiddenException('Se requiere contexto de organización')`; si falta el permiso,
  `ForbiddenException('Permisos insuficientes')`.
- `JwtStrategy.validate` → `req.user = { sub, email, activeTenantId, roles, impersonatedBy, impersonationId }`.
- `@CurrentUser()` existe en `src/common/decorators/current-user.decorator.ts`; `JwtAuthGuard` en
  `src/common/guards/jwt-auth.guard.ts`.
- `GET /auth/me` NO existe en `AuthController` (sí `login/register/refresh/logout/switch-tenant`).
  Lo que existe orientado a catálogo es `PermissionsController` (`GET /permissions`, catálogo completo).
- NO existe módulo `me`. Módulos se registran agregándolos a `imports` en `app.module.ts`.

**Frontend**
- `src/lib/api.ts` exporta `api` (cliente único con interceptor Bearer + refresh-on-401).
- **`src/lib/use-permissions.ts` YA EXISTE** (con `use-permissions.test.tsx` al lado). El change debe
  partir de ese archivo: leerlo, ver qué expone hoy y completar lo que falte (`has()`, fetch real a
  `/me/permissions`, `queryKey` con tenant). No reinventar uno nuevo en otra carpeta.
- `src/stores/auth-store.ts`: store zustand con `accessToken` (top-level) y `user` (decodificado del
  JWT). **`activeTenantId` NO es campo top-level del store** — vive en `user.activeTenantId` (opcional).
  `user.roles` ya está poblado (lo usa `useHasSystemRole`). El hook de permisos debe leer
  `useAuthStore((s) => s.user?.activeTenantId)`, NO `s.activeTenantId`.
- El matcher de wildcards del backend (`rbac/domain/permission-matcher.ts`) es una función PURA trivial
  (`*` → todo; `modulo.*` → prefijo; exacto → match; sin wildcards en el medio). Se portea 1:1 al front.
- Nav: `src/components/nav-items.ts` (data) + `nav-list.tsx` (render). Sin filtro por permiso hoy.
- Router: `src/routes/router.tsx` + `src/routes/protected-route.tsx` (gatea auth, no permiso).
- Páginas a gatear: `features/balance-general/pages/balance-general-page.tsx`,
  `features/estado-resultados/pages/estado-resultados-page.tsx`, y las páginas de libro diario/mayor
  cuando existan (el proposal las lista; confirmar rutas reales en tasks).
- UI kit `components/ui/` incluye `button`, `tooltip`, `card`, `skeleton`, `sheet`, etc.

---

## Decisiones — Backend

### D-B1 — Ubicación del endpoint: módulo `me` nuevo; controller delgado que consume `RbacService` directo

**Decisión:** crear módulo `me` (`backend/src/me/`) con `me.controller.ts` + `me.module.ts`.
El controller depende de `RbacService` **directo** (importando `RbacModule`), **sin port propio y sin
service propio**.

```
backend/src/me/
├── dto/
│   └── me-permissions-response.dto.ts
├── me.controller.ts        // GET /me/permissions
└── me.module.ts            // imports: [RbacModule]; controllers: [MeController]
```
`me.module.ts` se agrega a `app.module.ts` → `imports`.

**Justificación:**
1. **`me` vs extender `auth`** — el diseño de plataforma pide LITERAL `GET /me/permissions`. `/auth/*`
   es autenticación/tokens; `/me/*` es el perfil contextual del usuario autenticado (permisos hoy;
   entitlements/módulos activos/preferencias mañana). Namespace propio = extensible y semánticamente
   limpio. Además `GET /auth/me` ni siquiera existe hoy, así que no hay nada que "extender".
2. **`RbacService` directo vs port propio** — §3.3/§3.7 dicen "cruzar módulo → port", PERO el dueño
   (rbac) YA expone `RbacService` como superficie pública (exportado por `RbacModule`, consumido por
   `PermissionsGuard` y por otros módulos). Crear un `RbacReaderPort` solo para un endpoint de lectura
   fino sería sobre-ingeniería: no hay segundo consumidor que justifique invertir la dependencia, no hay
   lógica de dominio en `me` que mockear. Criterio de Marco: "sin sobre-ingeniería para un endpoint de
   lectura fino". `me` consume el contrato público existente.
3. **Sin `MeService`** — `me` no tiene lógica de dominio: una llamada a `RbacService` + armar DTO plano.
   Un service sería capa de paso vacía. Si en el futuro `me` combina permisos + entitlements + módulos,
   ahí se introduce. Hoy no.

> `me` NO toca Prisma ni BD: toda lectura pasa por `RbacService`. Controller = presentación; rbac = dueño
> de la resolución. Separación dominio/infra respetada.

**Firma (no implementación):**
```typescript
@ApiTags('Me')
@Controller('me')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class MeController {
  constructor(private readonly rbac: RbacService) {}

  @Get('permissions')
  async permissions(
    @CurrentUser() user: { sub: string; activeTenantId: string | null },
  ): Promise<MePermissionsResponseDto> {
    // 1. si !user.activeTenantId → ForbiddenException (ver D-B3)
    // 2. const resolved = await this.rbac.getPermissions(user.sub, user.activeTenantId)
    // 3. mapear a DTO plano (ver D-B2)
  }
}
```
Usa el `@CurrentUser()` existente. El id es `user.sub` (NO `userId`).

### D-B2 — DTO de respuesta: objeto plano `{ permissions, isOwner, activeTenantId }`; `permissions` = `wildcards`

**Decisión:** `MePermissionsResponseDto` = **objeto plano** (no `new Dto()`, no value object — no hay
invariantes que proteger):
```typescript
export interface MePermissionsResponseDto {
  readonly permissions: string[];   // los wildcards/patrones del usuario (ej. ['contabilidad.*'])
  readonly isOwner: boolean;        // esOwner || esAdmin (ver abajo)
  readonly activeTenantId: string;  // no-null acá (garantizado por D-B3)
}
```

**Qué se serializa** — punto crítico que el proposal no vio: `getPermissions` devuelve
`{ esOwner, esAdmin, wildcards }`, NO una lista plana de permisos. Decisión:

- `permissions` = `resolved.wildcards` **tal cual** (los patrones). El matching del frontend replica el
  del backend (wildcard-aware), no compara igualdad exacta. Ver D-F1 (`has()` debe usar matching de
  patrón, NO `includes`). Esto evita expandir el catálogo completo por la red y evita drift cuando el
  catálogo crece.
- `isOwner` = `resolved.esOwner || resolved.esAdmin`. Ambos implican "tiene todo" (el backend ya los
  trata igual: `hasPermission` retorna `true` para ambos). Para el frontend, un solo flag "tiene todo"
  es suficiente y más simple. Se documenta que `isOwner` significa "owner O admin" (capacidad total),
  no estrictamente el rol owner.

**Origen — opción elegida: reusar `getPermissions` tal cual, NO ampliar `RbacService`.**
`getPermissions` ya devuelve los tres campos en una sola llamada (con cache). El controller solo mapea:
```typescript
const r = await this.rbac.getPermissions(user.sub, user.activeTenantId);
return { permissions: r.wildcards, isOwner: r.esOwner || r.esAdmin, activeTenantId: user.activeTenantId };
```
Menos invasiva: no se toca rbac, una sola query, aprovecha el cache Redis existente. Mapeo
dominio(español: `esOwner`/`esAdmin`/`wildcards`)→DTO(inglés técnico: `isOwner`/`permissions`) coherente
con §1.

> Riesgo a anotar para tasks/verify: el frontend DEBE matchear permisos con la misma semántica de
> wildcards que `matchesPermission` del backend. Si el front hiciera `includes('contabilidad.eeff.read')`
> contra `['contabilidad.*']`, fallaría. Ver D-F1.

### D-B3 — Sin `activeTenantId`: `ForbiddenException` (403), coherente con `PermissionsGuard`

**Decisión:** si `user.activeTenantId` es `null` → `ForbiddenException('Se requiere contexto de organización')`
(MISMO mensaje y status que `PermissionsGuard`).

**Justificación:**
- **Coherencia de contrato:** toda la app trata "sin tenant activo" como 403 con ese mensaje. El frontend
  maneja UN comportamiento. Devolver `200 { permissions: [], isOwner: false }` sería ambiguo (¿sin permisos
  o sin tenant?).
- Un usuario autenticado normalmente tiene `activeTenantId`; el null es transitorio (bootstrap/switch) y el
  frontend lo evita con `enabled` (D-F1), así que el 403 es un borde real, no flujo normal.
- **Deuda menor (no bloqueante):** §10.10 pide migrar a `DomainError`, no agregar `*Exception` nuevos. Acá
  se usa `ForbiddenException` DELIBERADAMENTE para replicar exacto el guard (mismo status/mensaje/mapeo en
  `GlobalExceptionFilter`). Migrar guard + endpoint juntos a un `DomainError` compartido es un refactor que
  va completo, no parcial. Anotado, no se hace acá.

---

## Decisiones — Frontend

> Punto de partida obligatorio: **leer `src/lib/use-permissions.ts` y su test existentes** antes de tocar
> nada. Las decisiones de abajo describen el estado objetivo; tasks decide si se completa el archivo
> actual o se reestructura mínimamente, preservando los tests verdes.

### D-F1 — `usePermissions`: TanStack Query, `queryKey` con `activeTenantId`, `has()` con matching de wildcards

**Decisión:** `usePermissions()` sobre TanStack Query, fetch a `GET /me/permissions` vía `api` (`src/lib/api.ts`).
Ubicación: mantener en `src/lib/` (donde ya vive el hook actual) salvo que tasks justifique moverlo; el
fetch puro va en un `api/` coherente con la convención del front (§8) — p. ej. `src/lib/me-permissions.ts`
o `features/<x>/api/`. Decisión de carpeta fina = tasks, respetando "componentes importan del hook, no del
api".

```typescript
export interface MyPermissions {
  permissions: string[];   // wildcards
  isOwner: boolean;
  activeTenantId: string;
}

export function usePermissions() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const activeTenantId = useAuthStore((s) => s.user?.activeTenantId);  // NO s.activeTenantId — vive en user

  const query = useQuery({
    queryKey: ['my-permissions', activeTenantId],   // activeTenantId AISLA cache por tenant
    queryFn: getMyPermissions,                       // api puro: api.get('/me/permissions')
    enabled: !!accessToken && !!activeTenantId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const has = (permission: string): boolean => {
    const data = query.data;
    if (!data) return false;                  // fail-closed en UI mientras carga/error
    if (data.isOwner) return true;            // owner/admin ⇒ todo
    return data.permissions.some((w) => matchesPermission(w, permission)); // wildcard-aware
  };

  return { ...query, has, isOwner: query.data?.isOwner ?? false };
}
```

**Justificación:**
- **`activeTenantId` en `queryKey` es OBLIGATORIO** (riesgo del proposal): al hacer switch de tenant el
  JWT cambia y los permisos del tenant anterior NO deben sobrevivir. Con el tenant en la key, el switch
  genera una entrada de cache distinta y TanStack refetchea solo, sin invalidación manual ni races. Más
  robusto que `staleTime: Infinity` + invalidación explícita.
- **`staleTime: 5min`** alineado con el resto del front; los permisos cambian poco intra-sesión y el
  backend sigue siendo la autoridad si quedan stale.
- **`enabled: token && activeTenantId`** evita disparar durante bootstrap/switch (cuando tenant es null),
  eliminando el 403 de D-B3 como flujo normal.
- **`has()` debe usar matching de wildcards**, NO `includes` — porque `permissions` son patrones
  (D-B2). Portear `matchesPermission` del backend (`rbac/domain/permission-matcher.ts`) a un helper puro
  en el front (`src/lib/permission-matcher.ts`, testeable). Es función trivial (verificado): `'*'`→todo,
  `'modulo.*'`→prefijo, exacto→match. Esto es el detalle MÁS fácil de equivocar; queda explícito.
- **El archivo `use-permissions.ts` actual exporta `useHasSystemRole`, `usePuedeReabrir` y re-exporta
  `usePuedeEditarContabilizado`** — esos hooks resuelven contra `user.roles` del JWT (SystemRole), una
  fuente distinta. Se PRESERVAN intactos (sus tests deben seguir verdes); `usePermissions` se AGREGA al
  mismo archivo. Coexisten: roles de sistema (sincrónico, del JWT) vs permisos finos (async, de `/me/permissions`).
- **fail-closed en UI**: sin data → `false` → no se muestra la acción (nunca un botón que daría 403).

### D-F2 — Gating de componentes: `<Can>` (oculta) con render-prop para deshabilitar; Tooltip real

**Decisión:**
- `<Can permission="..." fallback?>children</Can>` → **oculta** si `!has(permission)` (default `fallback = null`).
- Para **deshabilitar** (visible pero inerte), `<Can>` acepta **render-prop** `(allowed) => ...`.
- El botón deshabilitado usa el **`Tooltip` real** (`components/ui/tooltip.tsx`, que SÍ existe) con
  "No tenés permiso". NO se crea `<PermissionButton>`.

```tsx
interface CanProps {
  permission: string;
  children: ReactNode | ((allowed: boolean) => ReactNode);
  fallback?: ReactNode;
}
export function Can({ permission, children, fallback = null }: CanProps) {
  const { has } = usePermissions();
  const allowed = has(permission);
  if (typeof children === 'function') return <>{children(allowed)}</>;
  return allowed ? <>{children}</> : <>{fallback}</>;
}
```

Uso:
```tsx
<Can permission={PERMISSIONS.contabilidad.comprobantes.create}>
  <Button onClick={...}>Nuevo asiento</Button>
</Can>

<Can permission={PERMISSIONS.contabilidad.comprobantes.post}>
  {(allowed) => (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* span wrapper: un button disabled no dispara eventos de tooltip */}
        <span><Button disabled={!allowed}>Contabilizar</Button></span>
      </TooltipTrigger>
      {!allowed && <TooltipContent>No tenés permiso</TooltipContent>}
    </Tooltip>
  )}
</Can>
```

**Justificación:** UNA pieza cubre ocultar Y deshabilitar (Marco: "menos UI, sin sobre-ingeniería").
Un `<PermissionButton>` acoplaría el gating al Button y obligaría a clonar el patrón para select/link/icon.
Como Tooltip YA existe en el kit, el feedback del disabled es accesible y consistente con shadcn (gotcha
conocido: envolver el button disabled en `<span>` para que el trigger reciba el hover). Ubicación sugerida:
`src/components/shared/can.tsx` (composite transversal, coherente con §3 frontend).

### D-F3 — `requiredPermission?` opcional en `NavItem`, filtrado en `nav-list.tsx` con `has()`

**Decisión:** extender el `NavItem` real de `nav-items.ts` (que ya tiene `to/label/icon/disabled?`) con
`requiredPermission?: string`; filtrar la constante `NAV_ITEMS` en `nav-list.tsx`.

```typescript
// nav-items.ts (data) — agregar el campo al interface existente
export interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  requiredPermission?: string;   // opcional → migración incremental
}
// y completar los items reales (paths reales: /eeff/balance, /eeff/resultados, /libros/diario, /libros/mayor):
//   { to: '/eeff/balance', label: 'Balance General', icon: Scale, requiredPermission: PERMISSIONS.contabilidad.eeff.read },
//   { to: '/libros/diario', label: 'Libro Diario', icon: BookText, requiredPermission: PERMISSIONS.contabilidad.libroDiario.read },
```
```tsx
// nav-list.tsx (render) — filtrar NAV_ITEMS antes del .map existente
const { has } = usePermissions();
const visibleItems = NAV_ITEMS.filter((i) => !i.requiredPermission || has(i.requiredPermission));
// luego: visibleItems.map(...) en vez de NAV_ITEMS.map(...)
```

**Justificación:** `requiredPermission` opcional → items sin permiso (Panel) siguen siempre visibles, no
rompe nada (migración incremental). El filtro vive en `nav-list.tsx` (render), `nav-items.ts` queda data
declarativa. Mismo string en nav/ruta/botón vía `PERMISSIONS` (D-F6) → cero drift entre "ves el menú",
"entrás" y "ves el botón". `has()` ya resuelve owner. Nota: `nav-list.tsx` ya importa `Tooltip` (lo usa
para el modo colapsado) — no hay dep nueva. El item `disabled` (Configuración contable) es ortogonal a
`requiredPermission` y se mantiene.

### D-F4 — Página-ruta sin permiso: vista INLINE `<RequirePermission>`, NO redirect

**Decisión:** wrapper `<RequirePermission permission>` que renderiza children si hay permiso, o una **vista
inline "No tenés permiso"** (con `Card`). **Se descarta el redirect.**

```tsx
interface RequirePermissionProps { permission: string; children: ReactNode; }
export function RequirePermission({ permission, children }: RequirePermissionProps) {
  const { has, isLoading } = usePermissions();
  if (isLoading) return <PageSkeleton />;        // skeleton/spinner del kit, evita flash
  if (!has(permission)) return <SinPermisoView />;
  return <>{children}</>;
}
```
En `src/routes/router.tsx`, envolver el `element` de cada ruta gateada (paths REALES):
```tsx
{ path: '/eeff/balance',     element: <RequirePermission permission={PERMISSIONS.contabilidad.eeff.read}><BalanceGeneralPage /></RequirePermission> }
{ path: '/eeff/resultados',  element: <RequirePermission permission={PERMISSIONS.contabilidad.eeff.read}><EstadoResultadosPage /></RequirePermission> }
{ path: '/libros/diario',    element: <RequirePermission permission={PERMISSIONS.contabilidad.libroDiario.read}><LibroDiarioPage /></RequirePermission> }
{ path: '/libros/mayor',     element: <RequirePermission permission={PERMISSIONS.contabilidad.libroMayor.read}><LibroMayorPage /></RequirePermission> }
```

**Justificación:** inline gana al redirect (recomendación del proposal): preserva la URL — crítico para
soporte e **impersonation** (§5.6) — y evita el flash de rebote. `isLoading → skeleton` (no fail-closed
inmediato) para no parpadear "sin permiso" antes de los datos; difiere del `has()` fail-closed de botones
porque en una página completa SÍ vale esperar el dato. `RequirePermission` envuelve solo el `element`, sin
tocar `protected-route.tsx` (auth) — separación auth vs autorización. Ubicación: `src/components/shared/`.
Páginas concretas a gatear (códigos REALES): Balance General y Estado de Resultados →
`contabilidad.eeff.read`; Libro Diario → `contabilidad.libro-diario.read`; Libro Mayor →
`contabilidad.libro-mayor.read`.

### D-F5 — Precarga en el provider/root, consumo lazy por componente

**Decisión:** disparar `usePermissions()` como warm-up en `ProtectedRoute` (`src/routes/protected-route.tsx`)
— es el primer punto del árbol donde el usuario YA está autenticado (`accessToken !== null`) y dentro de
las rutas protegidas. NO en `BootstrapGate` (corre ANTES de que exista token; `enabled` lo bloquearía) ni
en `App.tsx` (fuera del scope autenticado). Los componentes llaman `usePermissions()` libremente; TanStack
deduplica por `queryKey` → una sola request compartida.

Implementación: en `ProtectedRoute`, llamar `usePermissions()` (ignorando el retorno; solo para warm-up)
antes del `return <Outlet />`. Como es un hook, va al tope del componente, no condicional.

**Justificación:** `ProtectedRoute` ya vive en el camino autenticado y envuelve TODO el dashboard, así que
la query queda caliente para el primer `<Can>`/`<RequirePermission>`. `enabled` (token + tenant) gobierna
el disparo. No se expone por contexto: el hook + dedup de TanStack lo hace innecesario y mantiene el
contexto chico. El `TooltipProvider` global ya está montado en `App.tsx`, así que los tooltips de D-F2
funcionan sin setup extra.

### D-F6 — Constantes de permisos centralizadas: objeto `PERMISSIONS` tipado `as const`

**Decisión:** objeto central `PERMISSIONS` (NO strings sueltos), con los códigos REALES del catálogo:
```typescript
// src/lib/permissions.ts
export const PERMISSIONS = {
  contabilidad: {
    comprobantes: { read: 'contabilidad.comprobantes.read' },
    asientos:     { read: 'contabilidad.asientos.read', create: 'contabilidad.asientos.create', post: 'contabilidad.asientos.post', void: 'contabilidad.asientos.void' },
    cuentas:      { read: 'contabilidad.cuentas.read' },
    eeff:         { read: 'contabilidad.eeff.read' },            // Balance General + Estado de Resultados
    libroDiario:  { read: 'contabilidad.libro-diario.read' },
    libroMayor:   { read: 'contabilidad.libro-mayor.read' },
    contactos:    { read: 'contabilidad.contactos.read' },
    periodos:     { read: 'contabilidad.periodos.read' },
  },
  // granja, organizacion, etc. a futuro
} as const;
```

**Justificación:** anti-drift. Strings sueltos son foco de typos silenciosos: un código mal escrito da
`false` → el botón desaparece sin error visible. Objeto `as const` da autocomplete y un solo lugar para
ajustar. **Los strings DEBEN espejar EXACTAMENTE el catálogo backend** (verificado: usan guiones, ej.
`contabilidad.libro-diario.read`, `contabilidad.eeff.read`; NO camelCase). Tasks verifica cada código
contra el catálogo real (`PermissionsController` / seed) antes de fijarlo. Codegen desde el catálogo =
deuda futura (alineado con la deuda "openapi-typescript").

---

## Resumen de archivos afectados (para tasks)

**Backend (nuevos):**
- `backend/src/me/me.controller.ts`
- `backend/src/me/me.module.ts`
- `backend/src/me/dto/me-permissions-response.dto.ts`
- `backend/src/app.module.ts` (registrar `MeModule` en `imports`)

**Frontend (extender/nuevos):**
- `src/lib/use-permissions.ts` (**ya existe** — completar: fetch a `/me/permissions`, `queryKey` con tenant, `has()` wildcard-aware) + su test.
- `src/lib/me-permissions.ts` (api puro `getMyPermissions`) — o ubicación que tasks decida coherente con §8.
- `src/lib/permission-matcher.ts` (helper puro de matching de wildcards, porteado del backend) + test.
- `src/lib/permissions.ts` (objeto `PERMISSIONS`).
- `src/components/shared/can.tsx` + test.
- `src/components/shared/require-permission.tsx` + test.
- `src/components/shared/sin-permiso-view.tsx`.

**Frontend (modificados):**
- `src/components/nav-items.ts` (+ `requiredPermission?`).
- `src/components/nav-list.tsx` (filtrar por `has()`).
- `src/routes/router.tsx` (envolver rutas EEFF/libros con `<RequirePermission>`).
- root autenticado (warm-up `usePermissions()` — archivo a confirmar en tasks).

---

## Riesgos

1. **Matching de wildcards mal portado** (NUEVO, el más importante): `permissions` son patrones, no la
   lista expandida. Si el front usa `includes` en vez del matcher, todo el gating de no-owners falla
   silencioso. Mitigación: helper `permission-matcher.ts` con test que cubra wildcard + exacto + miss.
   Severidad: alta.
2. **Drift de strings** front vs catálogo. Mitigación: `PERMISSIONS` central + verificación de códigos
   reales (con guiones) en tasks. Severidad: media.
3. **Cache cross-tenant** si se omite `activeTenantId` en la `queryKey`. Mitigación: invariante de D-F1,
   testear con cambio de tenant. Severidad: alta.
4. **Hook existente**: ignorar `src/lib/use-permissions.ts` y duplicar lógica. Mitigación: tasks lo lee
   primero y extiende. Severidad: media.
5. **No es seguridad**: la UI se puede forzar; el backend bloquea igual. Documentar para no confundir
   gating UI con autorización. Severidad: nula a nivel datos.

## Notas de testing (para tasks)

- Backend (integración, Postgres real/Testcontainers, §7.2): `GET /me/permissions` →
  owner/admin ⇒ `isOwner:true`; rol con wildcards ⇒ lista de patrones; sin `activeTenantId` ⇒ 403
  ('Se requiere contexto de organización').
- Frontend (Vitest): `permission-matcher` (wildcard/exacto/miss); `has()` (owner, patrón match,
  miss, sin data); `<Can>` (oculta / render-prop / fallback / tooltip en disabled);
  filtrado de `nav-list`; `<RequirePermission>` (loading→skeleton / permitido / denegado→inline);
  `queryKey` aislado por tenant (cambio de tenant ⇒ no usa cache anterior). Reusar/no romper
  `use-permissions.test.tsx` existente.
