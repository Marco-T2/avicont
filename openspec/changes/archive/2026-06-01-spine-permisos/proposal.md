# Proposal — `spine-permisos`

> El "spine de permisos" de la plataforma Avicont: exponer por HTTP los
> permisos efectivos del usuario autenticado y gatear la UI con ellos.
> Primer build de la visión multi-vertical (`docs/disenos/plataforma-multi-vertical.md` §3).

## Intent / Por qué

Avicont está pasando de "sistema contable" a **plataforma multi-vertical**. El
diseño (`plataforma-multi-vertical.md` §3) identifica el primer paso concreto:
el **spine de permisos**.

Hoy el backend YA resuelve los permisos efectivos de un usuario
(`RbacService.getPermissions(userId, organizationId)`) y el `PermissionsGuard`
los usa para proteger endpoints. Pero **el frontend no tiene forma de
preguntarle al backend "¿qué puedo hacer?"**. Existe `GET /permissions` y
`/permissions/grouped`, pero esos devuelven el **catálogo completo del sistema**,
no la intersección efectiva del usuario.

Consecuencia actual (deuda documentada): el nav muestra todos los ítems a todos
los usuarios, las páginas EEFF / Libro Diario / Libro Mayor no gatean por
permiso (deuda aceptada en su JSDoc), y no existe ningún hook ni componente de
gating en el frontend. Un usuario de solo-lectura ve botones de acción que, al
pulsarlos, fallan con 403 contra el backend — UX pobre aunque seguro.

**Por qué ahora**: es el spine sobre el que se montan los siguientes pasos de la
plataforma (entitlement, packs, activación de verticales). Sin él, cada feature
nueva re-improvisa su propio gating. Es la pieza de menor UI / mayor
apalancamiento de la secuencia.

Filosofía rectora: **"amigable adelante, riguroso atrás"**. El backend RBAC
sigue siendo la única autoridad real; el gating de UI es exclusivamente
experiencia de usuario.

## Scope (qué entra)

### Backend
- Nuevo endpoint `GET /me/permissions` (protegido por `JwtAuthGuard`, en
  `src/common/guards/jwt-auth.guard.ts`) que responde:
  ```json
  { "permissions": ["contabilidad.eeff.read", "..."], "isOwner": true, "activeTenantId": "uuid" }
  ```
  donde `permissions` es la lista de **wildcards efectivos** del usuario (ver Open
  Question #5: hoy el service devuelve wildcards como `['*']` o `['contabilidad.*']`,
  NO una lista plana expandida — el front matchea con wildcard, como ya hace el guard).
- Endpoint fino: delega en `RbacService.getPermissions(user.userId, user.activeTenantId)`.
  NO recalcula nada; solo serializa.
- DTO de respuesta tipado (`MePermissionsResponseDto` o equivalente).

> **OJO — discrepancia verificada en código (corrige el brief del orquestador):**
> `RbacService` NO expone `resolverPermisos(): Promise<Set<string>>` ni un método
> `esOwner()`. La superficie REAL es:
> `getPermissions(userId, organizationId): Promise<ResolvedPermissions>` donde
> `ResolvedPermissions = { esOwner: boolean; esAdmin: boolean; wildcards: string[] }`
> (más helpers `hasPermission` / `hasAllPermissions` / `hasAnyPermission`).
> Para OWNER/ADMIN, `wildcards` es `['*']` (un comodín), **NO** la lista expandida
> del catálogo. Esto impacta la **forma del endpoint** (ver Open Question #5).

### Frontend
- Hook `usePermissions()` sobre TanStack Query que consume `GET /me/permissions`
  y expone helpers (`has(permission)`, `isOwner`, `permissions`, estado de carga).
- Componente(s) de gating para el **patrón mixto**:
  - **Ocultar** (nav): los ítems sin permiso no se renderizan.
  - **Deshabilitar** (acciones en página): botones deshabilitados con tooltip
    "no tenés permiso".
- Soporte de `requiredPermission` en `NavItem` del sidebar (cierra la deuda
  documentada) — items sin permiso se ocultan.
- Gateo de las páginas-ruta existentes:
  - Balance General (`/eeff/balance`) → `contabilidad.eeff.read`
  - Estado de Resultados (`/eeff/resultados`) → `contabilidad.eeff.read`
  - Libro Diario → `contabilidad.libro-diario.read`
  - Libro Mayor → `contabilidad.libro-mayor.read`

## Out of scope (qué NO)

- **Entitlement / packs**: el eje "¿qué contrató la org?" (`plataforma-multi-vertical.md` §4)
  es el paso 2 de la secuencia. Este corte devuelve SOLO la intersección
  `rol ∩ catálogo` (sin el eje de packs).
- **Activación de verticales** por organización.
- **UI de administración** de roles/permisos/custom roles.
- **Cambios en `RbacService.resolverPermisos`** ni en la resolución de permisos —
  ya existe y es correcta. Solo la exponemos.
- **Refactor del catálogo de permisos** ni nuevos permisos.
- **Gating retroactivo de TODAS las páginas/botones del sistema**: este change
  cubre el spine + las páginas de reportes contables ya listadas como caso
  testigo del patrón. El resto se gatea incrementalmente al tocar cada módulo.

## Approach (alto nivel)

### Backend — dónde vive el endpoint

El diseño pide literalmente `GET /me/permissions`. La URL `/me/*` es un recurso
**técnico-transversal** ("yo"), por lo que va en inglés según §1 del CLAUDE.md
(URLs en español para dominio, inglés para recursos técnicos).

**Decisión recomendada: nuevo módulo `me/` (`MeController` + `MeModule`).**

Razones:
- `/me/*` es un namespace transversal del usuario autenticado que crecerá
  (`/me/permissions`, plausiblemente `/me/organizations`, `/me/notifications`).
  Merece su propio módulo en vez de inflar `auth` (que es autenticación/tokens,
  no "perfil del usuario") o `rbac` (que es resolución/guards, no exposición HTTP
  orientada a "yo").
- Respeta hexagonal: `MeModule` importa `RbacModule` y depende de `RbacService`
  (cruce de frontera de módulo vía el servicio público ya exportado en
  `src/rbac/index.ts` / `rbac.module.ts`). No importa repositorios ni adapters de
  rbac directamente.
- `MeController` usa `@CurrentUser()` y `JwtAuthGuard`
  (`src/common/guards/jwt-auth.guard.ts`) para obtener `user.userId` y
  `user.activeTenantId`.

Alternativa considerada: extender `AuthController` con `/me/permissions`. Se
descarta porque mezcla responsabilidades (auth = credenciales/tokens; "me" =
perfil/capacidades del usuario ya autenticado) y porque `/auth/me` ya existe con
otra semántica (datos del usuario), lo que invita a confusión de rutas.

El controller es delgado: invoca `resolverPermisos` + `esOwner`, arma el DTO
(convirtiendo el `Set<string>` a `string[]`) y lo devuelve. Sin lógica de
dominio nueva. No requiere migración ni cambios de schema.

### Frontend — gating mixto

- **`usePermissions()`** (en `frontend/src/features/auth/` o un nuevo
  `features/permissions/`, a decidir en design): wrappea TanStack Query sobre
  `apiClient.get('/me/permissions')`. Cachea por sesión/tenant. Expone:
  - `has(permission: string): boolean` — matchea por wildcard (OWNER/`'*'` ⇒
    siempre `true`); reusa la lógica de `matchesPermission` del backend
  - `isOwner: boolean`
  - `permissions: string[]` (los wildcards efectivos)
  - flags de carga/error.
- **Componente de gating declarativo** (p. ej. `<Can permission="...">` o un
  `<PermissionGate>`): renderiza children solo si hay permiso (modo ocultar) o
  con un render-prop / variante que deshabilita y muestra tooltip (modo
  deshabilitar). El patrón MIXTO se resuelve con un solo componente parametrizado
  (`mode="hide" | "disable"`) o dos componentes hermanos — a definir en design.
- **`NavItem`** gana `requiredPermission?: string`; el sidebar filtra ítems sin
  permiso (modo ocultar).
- **Páginas-ruta**: las cuatro páginas listadas se envuelven con el gating de
  ruta. Mientras `usePermissions` carga, mostrar skeleton/spinner para evitar
  flash de "no tenés permiso".

El gating front NUNCA reemplaza al guard: toda acción real pega contra un
endpoint protegido por `PermissionsGuard`. Si el front se equivoca, el backend
responde 403.

## Capabilities afectadas (para las delta specs de la fase spec)

- **`rbac` / permisos efectivos** (nueva capability HTTP): exposición de los
  permisos efectivos del usuario autenticado vía `GET /me/permissions`.
- **`auth` / sesión del usuario**: se apoya en `JwtAuthGuard` + `@CurrentUser()`
  (sin cambios de contrato, solo consumo).
- **`frontend` / gating de UI**: hook `usePermissions`, componente(s) de gating,
  `requiredPermission` en `NavItem`, gateo de páginas de reportes contables.

## Decisiones cerradas (input de Marco — NO re-abrir)

1. **Enfoque**: SDD completo (proposal → spec → design → tasks → apply → verify).
2. **Forma del endpoint**: `GET /me/permissions` →
   `{ permissions: string[], isOwner: boolean, activeTenantId: string }`.
   Solo permisos + meta; sin entitlement/verticales en este corte.
3. **UX de gating MIXTO**:
   - Nav → **ocultar** ítems sin permiso.
   - Acciones en página (botones) → **deshabilitar** con tooltip "no tenés
     permiso".

## Risks

- **Flash de contenido durante la carga**: si la UI renderiza antes de resolver
  `usePermissions`, puede mostrar/ocultar ítems incorrectamente por un instante.
  Mitigación: estados de carga explícitos + cache de TanStack Query; resolver
  permisos temprano (idealmente junto al `currentUser`).
- **Invalidación al cambiar de tenant**: el switch de tenant emite un JWT nuevo
  con otro `activeTenantId`; la query de `/me/permissions` debe invalidarse /
  re-fetchearse al cambiar de tenant. Riesgo de permisos stale si no se incluye
  `activeTenantId` en la query key.
- **Drift catálogo ↔ permisos usados en front**: los strings de permiso
  (`contabilidad.eeff.read`, etc.) se hardcodean en el front. Si el catálogo
  backend cambia un código, el gating queda mal silenciosamente. Mitigación
  (fuera de scope, anotar como deuda): generar constantes compartidas o validar
  contra catálogo.
- **Falsa sensación de seguridad**: ocultar un botón NO protege nada. El equipo
  debe recordar que la autoridad es el backend. Mitigación: documentarlo en el
  spec/design y mantener `PermissionsGuard` en todos los endpoints.

## Open questions (a resolver en spec/design)

1. **Página-ruta sin permiso: vista vs redirect.**
   **Recomendación**: mostrar una vista in-place "No tenés permiso para ver esta
   página" (con CTA a volver al inicio), NO redirect.
   Razón: el redirect oculta el motivo y confunde (el usuario navegó a propósito
   y "rebota" sin explicación); la vista es honesta, accesible y consistente con
   el tooltip de los botones ("amigable adelante"). Queda como decisión de design,
   pero esta es la opción recomendada.
2. **Ubicación del hook/componentes**: ¿dentro de `features/auth/` o un nuevo
   `features/permissions/`? (Design decide; sugerencia: módulo propio
   `features/permissions/` por cohesión y crecimiento futuro.)
3. **¿`usePermissions` independiente o derivado de `useCurrentUser`?** ¿Se fetchea
   `/me/permissions` por separado o se compone con el flujo de currentUser para
   resolver ambos antes del primer render?
4. **Confirmación de los strings de permiso exactos** de Libro Diario / Libro
   Mayor / EEFF contra el catálogo real del backend (la spec debe verificarlos,
   no asumirlos).
5. **¿`permissions` devuelve wildcards o lista expandida?** El service devuelve
   `wildcards: string[]` (ej. `['*']` para OWNER, `['contabilidad.*']` para un
   rol), NO la lista plana de cada permiso atómico.
   **Recomendación**: devolver los wildcards tal cual y que `usePermissions.has()`
   matchee por wildcard reusando la MISMA lógica del backend
   (`matchesPermission` en `src/rbac/domain/permission-matcher.ts` — portarla o
   reimplementarla en el front). Razón: es la fuente de verdad, evita expandir el
   catálogo en cada respuesta y mantiene consistencia exacta con el guard. La
   alternativa (expandir a lista plana en el endpoint) infla el payload y duplica
   lógica de expansión. Decisión de design, pero esta es la opción recomendada.

## Confirmación: el backend ya es la autoridad

Sí. El `PermissionsGuard` ya protege los endpoints reales consumiendo
`resolverPermisos(user.userId, user.activeTenantId)` y devuelve 403 cuando falta
el permiso. **Este change NO cambia esa autoridad**: el gating de frontend es
exclusivamente UX ("amigable adelante, riguroso atrás"). No se toca ningún
invariante §4 del CLAUDE.md.
