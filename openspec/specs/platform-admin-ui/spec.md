# platform-admin-ui — Especificación

<!--
Última edición: 2026-06-02
Última revisión contra core: 2026-06-02
Owner: backend-lead
Delta v1.1 integrado: 2026-06-02 (REQ-PAUI-11..14 — miembros + impersonation desde panel)
-->

> Fecha: 2026-06-02
> Fase: spec (live)
> Proyecto: avicont
> Capability nueva: `platform-admin-ui` (no existía spec previa)
> Origen: change `platform-admin-ui` (archivado 2026-06-02)
> Stack: backend (NestJS) `GET /me/platform` + frontend (Vite + React) panel `/platform-admin/*`

---

## Propósito

Dar al super-admin de plataforma una **UI propia** (`/platform-admin/*`) para administrar
organizaciones (listar, crear, cambiar status, editar entitlement) y feature-flags globales,
sin contexto de tenant. El candado real vive en el backend (`SuperAdminGuard`); el gating del
frontend es UX (fail-closed, server-authoritative).

El único endpoint backend net-new de este corte es `GET /me/platform`, que devuelve la identidad
de plataforma del usuario (`{ isSuperAdmin }`) **org-less** — a diferencia de `GET /me/permissions`,
que exige tenant activo y devuelve `403` sin él. El resto de endpoints consumidos
(`/admin/platform/orgs`, `/admin/feature-flags`) ya existían.

Impersonation cross-tenant desde plataforma fue entregado en v1.1 (REQ-PAUI-11..14 + `platform-members`).

---

## Glosario

- **Super-admin de plataforma**: usuario con `User.isSuperAdmin = true`. Sujeto org-less: opera sobre la plataforma, no sobre un tenant.
- **Org-less**: sin contexto de tenant activo. `GET /me/platform` resuelve para super-admins que no tienen (ni necesitan) `activeTenantId`.
- **Fail-closed**: ante ausencia de data, error, loading o token revocado, el frontend resuelve `esSuperAdmin === false` (nunca abre el panel por defecto).
- **Server-authoritative**: el frontend NO decodifica el JWT para decidir si es super-admin; consume `GET /me/platform`, de modo que la revocación-epoch del super-admin (`401`/`403`) cierra el panel.
- **Entitlement**: el plan (`FREE`/`PRO`) más las verticales activadas (`contabilidadEnabled`, `granjaEnabled`) de una organización. Las verticales son mutuamente exclusivas.
- **`modulo`** (al crear org): vertical inicial de la organización — `CONTABILIDAD | GRANJA | OTROS` (3 valores, espeja el enum `ModuloOrganizacion` del backend).

---

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

### REQ-PAUI-01: `GET /me/platform` — identidad de plataforma org-less

El backend DEBE exponer `GET /me/platform` que devuelve `{ isSuperAdmin: boolean }` para cualquier
usuario autenticado, **sin exigir tenant activo**. Reusa el `JwtAuthGuard` de clase del
`MeController`; NO usa `SuperAdminGuard` (un usuario normal recibe `200 { isSuperAdmin: false }`,
no `403`). Es un read directo del claim `isSuperAdmin` de `req.user` (ya normalizado a boolean por
`jwt.strategy.ts`). No toca dominio — sin hexagonal.

NO DEBE modificar `GET /me/permissions` ni su `403` (`ME_PERMISSIONS_SIN_TENANT`).

#### Escenario: super-admin CON tenant activo

- DADO un usuario con `isSuperAdmin = true` y un `activeTenantId` en su JWT
- CUANDO llama `GET /me/platform` con su Bearer token
- ENTONCES recibe `200` con body `{ isSuperAdmin: true }`

#### Escenario: super-admin SIN tenant activo (caso clave — org-less)

- DADO un usuario con `isSuperAdmin = true` y **sin** `activeTenantId` en su JWT
- CUANDO llama `GET /me/platform` con su Bearer token
- ENTONCES recibe `200` con body `{ isSuperAdmin: true }`
- Y NO recibe `403` (a diferencia de `GET /me/permissions`, que sí exige tenant)

#### Escenario: usuario normal (no super-admin)

- DADO un usuario con `isSuperAdmin = false`
- CUANDO llama `GET /me/platform` con su Bearer token
- ENTONCES recibe `200` con body `{ isSuperAdmin: false }`
- Y NO recibe `403`

#### Escenario: sin token — 401

- DADO una request sin Bearer token (o con token inválido/expirado)
- CUANDO llama `GET /me/platform`
- ENTONCES recibe `401`

#### Escenario: el contrato de `/me/permissions` NO cambia

- DADO el endpoint `GET /me/permissions` ya existente
- CUANDO un super-admin sin tenant lo llama
- ENTONCES sigue devolviendo `403` (`ME_PERMISSIONS_SIN_TENANT`) como hoy — este change NO lo toca

---

### REQ-PAUI-02: `useEsSuperAdmin()` fail-closed y server-authoritative

El frontend DEBE proveer un hook `useEsSuperAdmin()` que consulta `GET /me/platform` vía TanStack
Query con `queryKey ['me-platform']` (sin `activeTenantId`), `enabled: Boolean(accessToken)`, y
devuelve `{ esSuperAdmin: boolean, isLoading: boolean }` con default fail-closed `?? false`.

NO DEBE decodificar el JWT para decidir el rol — la fuente de verdad es el endpoint.

#### Escenario: super-admin resuelto

- DADO `GET /me/platform` responde `{ isSuperAdmin: true }`
- CUANDO un componente usa `useEsSuperAdmin()`
- ENTONCES obtiene `{ esSuperAdmin: true, isLoading: false }`

#### Escenario: usuario normal resuelto

- DADO `GET /me/platform` responde `{ isSuperAdmin: false }`
- CUANDO un componente usa `useEsSuperAdmin()`
- ENTONCES obtiene `{ esSuperAdmin: false }`

#### Escenario: cargando — fail-closed mientras no hay data

- DADO la query está en vuelo (sin data aún)
- CUANDO un componente usa `useEsSuperAdmin()`
- ENTONCES obtiene `esSuperAdmin === false` y `isLoading === true`

#### Escenario: error / token revocado — fail-closed (server-authoritative)

- DADO el backend rechaza la request (revocación-epoch del super-admin → `401`/`403`)
- CUANDO la query falla o no hay data
- ENTONCES `esSuperAdmin` resuelve a `false`

#### Escenario: sin access token

- DADO no hay `accessToken` en el store
- CUANDO se monta el hook
- ENTONCES la query está deshabilitada (`enabled === false`) y `esSuperAdmin === false`

---

### REQ-PAUI-03: `<RequireSuperAdmin>` gatea las rutas de plataforma

El frontend DEBE proveer `<RequireSuperAdmin>` (en `components/shared/`) que gatea toda ruta
`/platform-admin/*`: muestra skeleton mientras carga, redirige a `/` si no es super-admin, y
renderiza children si lo es.

#### Escenario: super-admin → render

- DADO `useEsSuperAdmin()` resuelve `esSuperAdmin === true`
- CUANDO se renderiza `<RequireSuperAdmin>{children}</RequireSuperAdmin>`
- ENTONCES se renderizan los `children`

#### Escenario: no super-admin → redirect

- DADO `useEsSuperAdmin()` resuelve `esSuperAdmin === false` (no loading)
- CUANDO se renderiza `<RequireSuperAdmin>`
- ENTONCES redirige a `/` con `<Navigate replace>` (no muestra los children)

#### Escenario: cargando → skeleton sin flash

- DADO `useEsSuperAdmin()` está en `isLoading`
- CUANDO se renderiza `<RequireSuperAdmin>`
- ENTONCES muestra un skeleton y NO redirige ni renderiza children (evita flash)

---

### REQ-PAUI-04: `IndexRedirect` ramifica al super-admin sin tenant

`IndexRedirect` DEBE ramificar a `/platform-admin` cuando el usuario es super-admin **sin** tenant
activo. Un super-admin que TAMBIÉN tiene tenant activo, y un usuario normal, siguen el flujo
existente (vertical). El check va al inicio, antes del chequeo `vertical === undefined`.

#### Escenario: super-admin sin tenant → panel de plataforma

- DADO `esSuperAdmin === true` y `activeTenantId` ausente
- CUANDO se resuelve `/`
- ENTONCES navega a `/platform-admin` con `replace`

#### Escenario: super-admin con tenant → flujo normal (no secuestrar)

- DADO `esSuperAdmin === true` y `activeTenantId` presente
- CUANDO se resuelve `/`
- ENTONCES sigue el flujo de vertical existente (NO redirige a `/platform-admin`)

#### Escenario: usuario normal → flujo normal

- DADO `esSuperAdmin === false`
- CUANDO se resuelve `/`
- ENTONCES sigue el flujo de vertical existente (dashboard / granja / sin-módulo)

#### Escenario: cargando → skeleton (no flash, no redirect prematuro)

- DADO `useEsSuperAdmin().isLoading === true`
- CUANDO se resuelve `/`
- ENTONCES mantiene el skeleton actual hasta que resuelva

---

### REQ-PAUI-05: `PlatformShell` — layout dedicado sin contexto de tenant

El frontend DEBE renderizar las rutas `/platform-admin/*` dentro de un `PlatformShell` propio
(`components/shells/`), **independiente de `DashboardShell`**: sin org-switcher, sin contexto de
tenant, nav plano local (`Organizaciones`, `Feature flags`), salida "Volver a la app" / logout.

#### Escenario: nav de plataforma

- DADO un super-admin dentro de `/platform-admin/*`
- CUANDO ve el shell
- ENTONCES el nav muestra "Organizaciones" (`/platform-admin/orgs`) y "Feature flags" (`/platform-admin/feature-flags`)
- Y NO muestra org-switcher ni navegación de tenant

#### Escenario: marcado visual de plataforma

- DADO el `PlatformShell` montado
- CUANDO el super-admin lo ve
- ENTONCES está marcado visualmente como "Plataforma" (distinguible del shell de tenant)
- Y ofrece una acción de salida ("Volver a la app" hacia `/` y/o logout)

---

### REQ-PAUI-06: Lista de organizaciones

La pantalla `/platform-admin/orgs` DEBE listar las organizaciones (`GET /admin/platform/orgs`) en
una tabla con name/slug/status/plan/verticales/createdAt, con badges defensivos de status y plan, y
estados de loading / empty / error.

#### Escenario: lista con datos

- DADO `GET /admin/platform/orgs` devuelve N organizaciones
- CUANDO se monta `OrgsPage`
- ENTONCES muestra una tabla con una fila por org (name, slug, status, plan, verticales, createdAt)
- Y cada status se muestra con `OrgStatusBadge` (ACTIVE/SUSPENDED/ARCHIVED)
- Y cada plan se muestra con `OrgPlanBadge` (FREE/PRO)

#### Escenario: estado loading

- DADO la query de orgs está cargando
- CUANDO se monta `OrgsPage`
- ENTONCES muestra un skeleton de tabla (no la tabla vacía)

#### Escenario: estado vacío

- DADO `GET /admin/platform/orgs` devuelve `[]`
- CUANDO se monta `OrgsPage`
- ENTONCES muestra un empty state ("No hay organizaciones") en español

#### Escenario: estado error

- DADO la query de orgs falla
- CUANDO se monta `OrgsPage`
- ENTONCES muestra un mensaje de error en español (no la tabla)

#### Escenario: badge defensivo ante valor inesperado (R6)

- DADO una org con `status` o `plan` fuera de los valores conocidos
- CUANDO se renderiza el badge
- ENTONCES muestra un badge neutro con el string crudo (no rompe la tabla)

---

### REQ-PAUI-07: Crear organización (manejo 422 ownerEmail)

La pantalla DEBE permitir crear una organización vía un Sheet-form (`name`, `modulo`
`CONTABILIDAD | GRANJA | OTROS`, `ownerEmail`) que llama `POST /admin/platform/orgs`. Valida con
zod en el cliente y maneja el `422` del backend (ownerEmail no es usuario registrado) sin cerrar el
form.

> El enum `modulo` tiene **3 valores** (`CONTABILIDAD`, `GRANJA`, `OTROS`), espejando
> `ModuloOrganizacion` del backend.

#### Escenario: crear org exitoso

- DADO el form con `name`, `modulo` y `ownerEmail` válidos
- CUANDO el super-admin envía el form y el backend responde `201`
- ENTONCES la org se crea, el Sheet se cierra, la lista se refresca y se muestra un toast de éxito

#### Escenario: validación zod en cliente

- DADO el form con `name` vacío o `ownerEmail` sin formato de email
- CUANDO el super-admin intenta enviar
- ENTONCES se muestran errores de validación en español y NO se llama al backend

#### Escenario: 422 ownerEmail inexistente — form abierto

- DADO el backend responde `422` (`PLATFORM_ORG_OWNER_NOT_FOUND`: el `ownerEmail` no corresponde a un usuario registrado)
- CUANDO falla la mutation
- ENTONCES se muestra `toast.error` con el mensaje del backend (en español)
- Y el Sheet permanece abierto para que el usuario corrija el email

#### Escenario: submit deshabilitado mientras envía

- DADO la mutation está `isPending`
- CUANDO el form se renderiza
- ENTONCES el botón de submit está deshabilitado (evita doble envío)

---

### REQ-PAUI-08: Cambiar status de organización

La pantalla DEBE permitir cambiar el status de una org (ACTIVE / SUSPENDED / ARCHIVED) vía
`AlertDialog` de confirmación que llama `PATCH /admin/platform/orgs/:id/status`.

#### Escenario: suspender / archivar / reactivar con confirmación

- DADO una org en la lista
- CUANDO el super-admin elige cambiar su status y confirma en el `AlertDialog`
- ENTONCES se llama `PATCH .../status` con el nuevo status
- Y al éxito la lista se refresca y se muestra un toast

#### Escenario: cancelar la confirmación

- DADO el `AlertDialog` de cambio de status abierto
- CUANDO el super-admin cancela
- ENTONCES NO se llama al backend y el status queda igual

---

### REQ-PAUI-09: Editar entitlement (plan + verticales, 422 exclusividad)

La pantalla DEBE permitir editar el entitlement de una org (plan FREE/PRO + verticales
contabilidad/granja) vía Sheet-form que llama `PATCH /admin/platform/orgs/:id/entitlement`. El
schema zod previene marcar ambas verticales `true`; el backend es el guard real y devuelve `422`
ante el estado inválido.

#### Escenario: actualizar plan y vertical

- DADO el form con `plan` y a lo sumo una vertical en `true`
- CUANDO el super-admin envía y el backend responde `200`
- ENTONCES el entitlement se actualiza, el Sheet se cierra, la lista se refresca, toast de éxito

#### Escenario: guard de exclusividad en cliente

- DADO el super-admin intenta marcar contabilidad **y** granja en `true`
- CUANDO el form valida con zod
- ENTONCES muestra error de exclusividad en español y NO llama al backend

#### Escenario: 422 verticales exclusivas — form abierto

- DADO el backend responde `422` (`PLATFORM_VERTICAL_NO_EXCLUSIVO`: el estado resultante deja ambas verticales `true`)
- CUANDO falla la mutation
- ENTONCES se muestra `toast.error` con el mensaje del backend
- Y el Sheet permanece abierto

---

### REQ-PAUI-10: Feature-flags globales (CRUD + toggle)

La pantalla `/platform-admin/feature-flags` DEBE listar los feature-flags globales
(`GET /admin/feature-flags`) y permitir crear (`POST`), editar (`PUT /:key`), togglear
(`POST /:key/toggle`) y eliminar (`DELETE /:key`), con estados de loading / empty / error.

#### Escenario: lista de flags

- DADO `GET /admin/feature-flags` devuelve flags
- CUANDO se monta `FeatureFlagsPage`
- ENTONCES muestra una tabla con key, name, description, enabled (switch)
- Y muestra loading skeleton, empty state ("No hay feature flags") y error en español según el caso

#### Escenario: toggle de flag

- DADO un flag en la tabla
- CUANDO el super-admin acciona el switch
- ENTONCES se llama `POST /admin/feature-flags/:key/toggle`
- Y al éxito el estado `enabled` se refleja en la tabla

#### Escenario: crear flag

- DADO el Sheet-form con `key` (patrón `^[a-z][a-z0-9_]*$`), `name` y campos opcionales
- CUANDO el super-admin envía y el backend responde `201`
- ENTONCES el flag se crea, el Sheet se cierra, la lista se refresca, toast de éxito
- Y un `key` con formato inválido es rechazado por el schema zod antes de llamar al backend
- Y un `key` duplicado devuelve `409` (`FEATURE_FLAG_DUPLICADA`) del backend

#### Escenario: editar flag

- DADO un flag existente
- CUANDO el super-admin edita name/description/enabled/metadata y guarda
- ENTONCES se llama `PUT /admin/feature-flags/:key` y la lista se refresca
- Y el `key` es inmutable en edición

#### Escenario: eliminar flag con confirmación

- DADO un flag en la tabla
- CUANDO el super-admin elige eliminar y confirma en el dialog
- ENTONCES se llama `DELETE /admin/feature-flags/:key` y el flag desaparece de la lista

---

### REQ-PAUI-11 (Slice 1): Navegación desde la lista de orgs a la vista de miembros

La tabla de organizaciones en `/platform-admin/orgs` DEBE incluir por cada fila un
enlace o botón que navegue a `/platform-admin/orgs/:id/members`. Puede ser una acción
en el menú de fila o un enlace directo sobre el nombre de la org.

#### Escenario: clic en enlace de miembros → navegación

- DADO la tabla de orgs con al menos una fila
- CUANDO el SA acciona el enlace/botón de miembros de una org
- ENTONCES el router navega a `/platform-admin/orgs/{id}/members`
- Y la URL es bookmark-able (ruta dedicada, no drawer efímero)

#### Escenario: org sin miembros — enlace igualmente visible

- DADO una org con 0 miembros
- CUANDO el SA ve la fila en la tabla
- ENTONCES el enlace/botón de miembros sigue siendo visible y navegable
- Y la página de destino muestra empty state (no error)

---

### REQ-PAUI-12 (Slice 2): Botón "Impersonar" por miembro en vista de miembros

La tabla de miembros (`/platform-admin/orgs/:id/members`) DEBE incluir por cada fila
un botón "Impersonar" SALVO cuando:
- El miembro tiene `systemRole === 'OWNER'` (invariante `IMPERSONATION_TARGET_ES_OWNER`).
- El miembro es el propio SA (`userId === currentUser.sub`) (invariante `IMPERSONATION_SELF_NO_PERMITIDA`).

Para esos casos el botón DEBE estar ausente o deshabilitado con tooltip explicativo.

#### Escenario: botón "Impersonar" visible para miembro regular

- DADO un miembro sin `systemRole === 'OWNER'` y que no es el SA logueado
- CUANDO el SA ve la fila del miembro
- ENTONCES el botón "Impersonar" está visible y habilitado

#### Escenario: botón oculto/deshabilitado para OWNER

- DADO un miembro con `systemRole === 'OWNER'`
- CUANDO el SA ve la fila
- ENTONCES el botón "Impersonar" está ausente o deshabilitado con indicación visual

#### Escenario: botón oculto/deshabilitado para el SA mismo

- DADO la fila del propio SA en la lista
- CUANDO se renderiza la tabla
- ENTONCES el botón "Impersonar" está ausente o deshabilitado

---

### REQ-PAUI-13 (Slice 2): Dialog de confirmación de impersonation

Al accionar "Impersonar", DEBE abrirse un dialog (`PlatformImpersonateDialog`) que
solicita `reason` (mínimo 10 caracteres) y confirma la org target. Al confirmar,
llama `POST /admin/impersonate` con `{ targetUserId, reason, organizationId }` (donde
`organizationId` es el `:id` del parámetro de ruta). La validación de `reason` DEBE
hacerse en cliente antes de enviar.

#### Escenario: dialog se abre con contexto correcto

- DADO el SA acciona "Impersonar" para el miembro `M` de `org-X`
- CUANDO se abre el dialog
- ENTONCES muestra el nombre/email del target y la org
- Y tiene un campo `reason` vacío y botón de confirmar deshabilitado

#### Escenario: validación de reason en cliente

- DADO el dialog abierto con `reason` de menos de 10 caracteres
- CUANDO el SA intenta confirmar
- ENTONCES se muestra error de validación en español y NO se llama al backend

#### Escenario: impersonation exitosa — entra al contexto del target

- DADO el dialog con `reason` válido (≥ 10 caracteres)
- CUANDO el SA confirma y el backend responde `201` con `impersonationToken`
- ENTONCES el token del target es seteado en el store (`setToken(impersonationToken)`)
- Y la UI navega fuera de `/platform-admin` hacia el contexto del target (bajo `DashboardShell`)
- Y el banner rojo de impersonation se monta en `DashboardShell`

#### Escenario: error del backend (ej. target OWNER, self, desactivado) — dialog abierto

- DADO el backend responde con error (403 `IMPERSONATION_TARGET_ES_OWNER`, etc.)
- CUANDO falla la mutation
- ENTONCES se muestra `toast.error` con el mensaje del backend en español
- Y el dialog permanece abierto para que el SA pueda corregir o cancelar

#### Escenario: submit deshabilitado mientras envía

- DADO la mutation está `isPending`
- CUANDO se renderiza el dialog
- ENTONCES el botón de confirmar está deshabilitado (evita doble envío)

---

### REQ-PAUI-14 (Slice 2): Salida de impersonation — regreso al panel

Al accionar "Salir" en el banner de impersonation, `useEndImpersonation` hace
`POST /auth/refresh` que restaura el JWT del SA org-less. El SA queda sin `activeTenantId`
y `IndexRedirect` lo lleva a `/platform-admin`. Este comportamiento NO requiere cambio de
código (el flujo de salida ya estaba diseñado para este escenario); este REQ lo documenta
como invariante testeable.

#### Escenario: "Salir" restaura el SA al panel

- DADO un SA dentro de una sesión de impersonation iniciada desde `/platform-admin/orgs/:id/members`
- CUANDO acciona "Salir" en el banner rojo
- ENTONCES el refresh restaura el token SA org-less (sin `activeTenantId`)
- Y `IndexRedirect` navega a `/platform-admin` (ramificación SA-sin-tenant, REQ-PAUI-04 intacto)
- Y el banner de impersonation desaparece (ya no está bajo `DashboardShell`)

---

## Códigos de error (consumidos del backend)

| Código | HTTP | Descripción |
|--------|------|-------------|
| `PLATFORM_ORG_OWNER_NOT_FOUND` | 422 | El `ownerEmail` al crear org no corresponde a un usuario registrado |
| `PLATFORM_VERTICAL_NO_EXCLUSIVO` | 422 | El entitlement resultante deja ambas verticales `true` (exclusividad) |
| `FEATURE_FLAG_DUPLICADA` | 409 | El `key` del feature-flag ya existe |

---

## Seguridad / multi-tenant

- Las rutas `/platform-admin/*` viven bajo `ProtectedRoute` + `PlatformShell`, cada una envuelta en `<RequireSuperAdmin>`. Catch-all `*` al final.
- **Defense in depth**: el gating del frontend es UX; el candado real es backend (`@UseGuards(JwtAuthGuard, SuperAdminGuard)` en ambos controllers). Un usuario normal que fuerce la URL ve el `<Navigate to="/" replace>` del guard front Y recibiría `403` del backend.
- **Fail-closed real**: `useEsSuperAdmin` no decodifica el JWT; consume el endpoint server-authoritative (revocación-epoch → `401`/`403` → query falla → `false`).

---

## Notas de scope

- **Impersonation cross-tenant desde plataforma**: entregado en v1.1 (REQ-PAUI-11..14). El SA navega a `/platform-admin/orgs/:id/members` y puede impersonar desde ahí. Ver también `openspec/specs/platform-members/spec.md` para la especificación del endpoint y la vista de miembros.
- **Tipos DTO**: espejo manual en `frontend/src/types/api.ts` (union literals + comentario `// Espeja backend X.dto.ts`). `openapi-typescript` queda como deuda (§10.10).
- **`GET /me/permissions` intacto**: este corte NO modifica `/me/permissions` ni su `403` (5 callers).
