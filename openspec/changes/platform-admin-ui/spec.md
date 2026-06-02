# Spec (delta) — `platform-admin-ui`

Fase: **sdd-spec** · Change: `platform-admin-ui` · Proyecto: avicont · Fecha: 2026-06-02

> Delta specs del change. Acompaña a `proposal.md` y `design.md`. Las 4 decisiones lockeadas
> son la base. Idioma de dominio/user-facing: **español**. Impersonation = **OUT** (v1.1).

---

## REQ-PAUI-01 — `GET /me/platform`: identidad de plataforma org-less

El backend DEBE exponer `GET /me/platform` que devuelve `{ isSuperAdmin: boolean }` para
cualquier usuario autenticado, **sin exigir tenant activo**. Reusa el `JwtAuthGuard` de clase
del `MeController`; NO usa `SuperAdminGuard` (un usuario normal recibe `200 { isSuperAdmin: false }`,
no `403`). Es un read directo del claim `isSuperAdmin` de `req.user` (ya normalizado a boolean por
`jwt.strategy.ts`). No toca dominio — sin hexagonal.

### Scenario: super-admin CON tenant activo
- **Given** un usuario con `isSuperAdmin = true` y un `activeTenantId` en su JWT
- **When** llama `GET /me/platform` con su Bearer token
- **Then** recibe `200` con body `{ isSuperAdmin: true }`

### Scenario: super-admin SIN tenant activo (caso clave del change — org-less)
- **Given** un usuario con `isSuperAdmin = true` y **sin** `activeTenantId` en su JWT
- **When** llama `GET /me/platform` con su Bearer token
- **Then** recibe `200` con body `{ isSuperAdmin: true }`
- **And** NO recibe `403` (a diferencia de `GET /me/permissions`, que sí exige tenant)

### Scenario: usuario normal (no super-admin)
- **Given** un usuario con `isSuperAdmin = false`
- **When** llama `GET /me/platform` con su Bearer token
- **Then** recibe `200` con body `{ isSuperAdmin: false }`
- **And** NO recibe `403`

### Scenario: sin token
- **Given** una request sin Bearer token (o con token inválido/expirado)
- **When** llama `GET /me/platform`
- **Then** recibe `401`

### Scenario: el contrato de `/me/permissions` NO cambia
- **Given** el endpoint `GET /me/permissions` ya existente
- **When** un super-admin sin tenant lo llama
- **Then** sigue devolviendo `403` (`ME_PERMISSIONS_SIN_TENANT`) como hoy — este change NO lo toca

---

## REQ-PAUI-02 — `useEsSuperAdmin()` fail-closed y server-authoritative

El frontend DEBE proveer un hook `useEsSuperAdmin()` que consulta `GET /me/platform` vía TanStack
Query con `queryKey ['me-platform']` (sin `activeTenantId`), `enabled: Boolean(accessToken)`, y
devuelve `{ esSuperAdmin: boolean, isLoading: boolean }` con default fail-closed `?? false`.

### Scenario: super-admin resuelto
- **Given** `GET /me/platform` responde `{ isSuperAdmin: true }`
- **When** un componente usa `useEsSuperAdmin()`
- **Then** obtiene `{ esSuperAdmin: true, isLoading: false }`

### Scenario: usuario normal resuelto
- **Given** `GET /me/platform` responde `{ isSuperAdmin: false }`
- **When** un componente usa `useEsSuperAdmin()`
- **Then** obtiene `{ esSuperAdmin: false }`

### Scenario: cargando — fail-closed mientras no hay data
- **Given** la query está en vuelo (sin data aún)
- **When** un componente usa `useEsSuperAdmin()`
- **Then** obtiene `esSuperAdmin === false` y `isLoading === true`

### Scenario: error / token revocado — fail-closed (server-authoritative)
- **Given** el backend rechaza la request (revocación-epoch del super-admin → `401`/`403`)
- **When** la query falla o no hay data
- **Then** `esSuperAdmin` resuelve a `false` (no se confía en el decode del JWT)

### Scenario: sin access token
- **Given** no hay `accessToken` en el store
- **When** se monta el hook
- **Then** la query está deshabilitada (`enabled === false`) y `esSuperAdmin === false`

---

## REQ-PAUI-03 — `<RequireSuperAdmin>` gatea las rutas de plataforma

El frontend DEBE proveer `<RequireSuperAdmin>` (en `components/shared/`) que gatea toda ruta
`/platform-admin/*`: muestra skeleton mientras carga, redirige a `/` si no es super-admin, y
renderiza children si lo es.

### Scenario: super-admin → render
- **Given** `useEsSuperAdmin()` resuelve `esSuperAdmin === true`
- **When** se renderiza `<RequireSuperAdmin>{children}</RequireSuperAdmin>`
- **Then** se renderizan los `children`

### Scenario: no super-admin → redirect
- **Given** `useEsSuperAdmin()` resuelve `esSuperAdmin === false` (no loading)
- **When** se renderiza `<RequireSuperAdmin>`
- **Then** redirige a `/` con `<Navigate replace>` (no muestra los children)

### Scenario: cargando → skeleton sin flash
- **Given** `useEsSuperAdmin()` está en `isLoading`
- **When** se renderiza `<RequireSuperAdmin>`
- **Then** muestra un skeleton y NO redirige ni renderiza children (evita flash)

---

## REQ-PAUI-04 — `IndexRedirect` ramifica al super-admin sin tenant

`IndexRedirect` DEBE ramificar a `/platform-admin` cuando el usuario es super-admin **sin** tenant
activo. Un super-admin que TAMBIÉN tiene tenant activo, y un usuario normal, siguen el flujo
existente (vertical). El check va al inicio, antes del chequeo `vertical === undefined`.

### Scenario: super-admin sin tenant → panel de plataforma
- **Given** `esSuperAdmin === true` y `activeTenantId` ausente
- **When** se resuelve `/`
- **Then** navega a `/platform-admin` con `replace`

### Scenario: super-admin con tenant → flujo normal (no secuestrar)
- **Given** `esSuperAdmin === true` y `activeTenantId` presente
- **When** se resuelve `/`
- **Then** sigue el flujo de vertical existente (NO redirige a `/platform-admin`)

### Scenario: usuario normal → flujo normal
- **Given** `esSuperAdmin === false`
- **When** se resuelve `/`
- **Then** sigue el flujo de vertical existente (dashboard / granja / sin-módulo)

### Scenario: cargando → skeleton (no flash, no redirect prematuro)
- **Given** `useEsSuperAdmin().isLoading === true`
- **When** se resuelve `/`
- **Then** mantiene el skeleton actual hasta que resuelva

---

## REQ-PAUI-05 — `PlatformShell`: layout dedicado sin contexto de tenant

El frontend DEBE renderizar las rutas `/platform-admin/*` dentro de un `PlatformShell` propio
(`components/shells/`), **independiente de `DashboardShell`**: sin org-switcher, sin contexto de
tenant, nav plano local (`Organizaciones`, `Feature flags`), salida "Volver a la app" / logout.

### Scenario: nav de plataforma
- **Given** un super-admin dentro de `/platform-admin/*`
- **When** ve el shell
- **Then** el nav muestra "Organizaciones" (`/platform-admin/orgs`) y "Feature flags"
  (`/platform-admin/feature-flags`)
- **And** NO muestra org-switcher ni navegación de tenant

### Scenario: marcado visual de plataforma
- **Given** el `PlatformShell` montado
- **When** el super-admin lo ve
- **Then** está marcado visualmente como "Plataforma" (distinguible del shell de tenant)
- **And** ofrece una acción de salida ("Volver a la app" hacia `/` y/o logout)

---

## REQ-PAUI-06 — Lista de organizaciones

La pantalla `/platform-admin/orgs` DEBE listar las organizaciones (`GET /admin/platform/orgs`) en
una tabla con name/slug/status/plan/verticales/createdAt, con badges defensivos de status y plan, y
estados de loading / empty / error.

### Scenario: lista con datos
- **Given** `GET /admin/platform/orgs` devuelve N organizaciones
- **When** se monta `OrgsPage`
- **Then** muestra una tabla con una fila por org (name, slug, status, plan, verticales, createdAt)
- **And** cada status se muestra con `OrgStatusBadge` (ACTIVE/SUSPENDED/ARCHIVED)
- **And** cada plan se muestra con `OrgPlanBadge` (FREE/PRO)

### Scenario: estado loading
- **Given** la query de orgs está cargando
- **When** se monta `OrgsPage`
- **Then** muestra un skeleton de tabla (no la tabla vacía)

### Scenario: estado vacío
- **Given** `GET /admin/platform/orgs` devuelve `[]`
- **When** se monta `OrgsPage`
- **Then** muestra un empty state ("No hay organizaciones") en español

### Scenario: estado error
- **Given** la query de orgs falla
- **When** se monta `OrgsPage`
- **Then** muestra un mensaje de error en español (no la tabla)

### Scenario: badge defensivo ante valor inesperado (R6)
- **Given** una org con `status` o `plan` fuera de los valores conocidos
- **When** se renderiza el badge
- **Then** muestra un badge neutro con el string crudo (no rompe la tabla)

---

## REQ-PAUI-07 — Crear organización (manejo 422 ownerEmail)

La pantalla DEBE permitir crear una organización vía un Sheet-form (`name`, `modulo`
CONTABILIDAD/GRANJA, `ownerEmail`) que llama `POST /admin/platform/orgs`. Valida con zod en el
cliente y maneja el `422` del backend (ownerEmail no es usuario registrado) sin cerrar el form.

### Scenario: crear org exitoso
- **Given** el form con `name`, `modulo` y `ownerEmail` válidos
- **When** el super-admin envía el form y el backend responde `201`
- **Then** la org se crea, el Sheet se cierra, la lista se refresca y se muestra un toast de éxito

### Scenario: validación zod en cliente
- **Given** el form con `name` vacío o `ownerEmail` sin formato de email
- **When** el super-admin intenta enviar
- **Then** se muestran errores de validación en español y NO se llama al backend

### Scenario: 422 ownerEmail inexistente — form abierto
- **Given** el backend responde `422` (el `ownerEmail` no corresponde a un usuario registrado)
- **When** falla la mutation
- **Then** se muestra `toast.error` con el mensaje del backend (en español)
- **And** el Sheet permanece abierto para que el usuario corrija el email

### Scenario: submit deshabilitado mientras envía
- **Given** la mutation está `isPending`
- **When** el form se renderiza
- **Then** el botón de submit está deshabilitado (evita doble envío)

---

## REQ-PAUI-08 — Cambiar status de organización

La pantalla DEBE permitir cambiar el status de una org (ACTIVE / SUSPENDED / ARCHIVED) vía
`AlertDialog` de confirmación que llama `PATCH /admin/platform/orgs/:id/status`.

### Scenario: suspender / archivar / reactivar con confirmación
- **Given** una org en la lista
- **When** el super-admin elige cambiar su status y confirma en el `AlertDialog`
- **Then** se llama `PATCH .../status` con el nuevo status
- **And** al éxito la lista se refresca y se muestra un toast

### Scenario: cancelar la confirmación
- **Given** el `AlertDialog` de cambio de status abierto
- **When** el super-admin cancela
- **Then** NO se llama al backend y el status queda igual

---

## REQ-PAUI-09 — Editar entitlement (plan + verticales, 422 exclusividad)

La pantalla DEBE permitir editar el entitlement de una org (plan FREE/PRO + verticales
contabilidad/granja) vía Sheet-form que llama `PATCH /admin/platform/orgs/:id/entitlement`. El
schema zod previene marcar ambas verticales `true`; el backend es el guard real y devuelve `422`
ante el estado inválido.

### Scenario: actualizar plan y vertical
- **Given** el form con `plan` y a lo sumo una vertical en `true`
- **When** el super-admin envía y el backend responde `200`
- **Then** el entitlement se actualiza, el Sheet se cierra, la lista se refresca, toast de éxito

### Scenario: guard de exclusividad en cliente
- **Given** el super-admin intenta marcar contabilidad **y** granja en `true`
- **When** el form valida con zod
- **Then** muestra error de exclusividad en español y NO llama al backend

### Scenario: 422 verticales exclusivas — form abierto
- **Given** el backend responde `422` (estado resultante deja ambas verticales `true`)
- **When** falla la mutation
- **Then** se muestra `toast.error` con el mensaje del backend
- **And** el Sheet permanece abierto

---

## REQ-PAUI-10 — Feature-flags globales (CRUD + toggle)

La pantalla `/platform-admin/feature-flags` DEBE listar los feature-flags globales
(`GET /admin/feature-flags`) y permitir crear (`POST`), editar (`PUT /:key`), togglear
(`POST /:key/toggle`) y eliminar (`DELETE /:key`), con estados de loading / empty / error.

### Scenario: lista de flags
- **Given** `GET /admin/feature-flags` devuelve flags
- **When** se monta `FeatureFlagsPage`
- **Then** muestra una tabla con key, name, description, enabled (switch)
- **And** muestra loading skeleton, empty state ("No hay feature flags") y error en español según el caso

### Scenario: toggle de flag
- **Given** un flag en la tabla
- **When** el super-admin acciona el switch
- **Then** se llama `POST /admin/feature-flags/:key/toggle`
- **And** al éxito el estado `enabled` se refleja en la tabla

### Scenario: crear flag
- **Given** el Sheet-form con `key` (patrón `^[a-z][a-z0-9_]*$`), `name` y campos opcionales
- **When** el super-admin envía y el backend responde `201`
- **Then** el flag se crea, el Sheet se cierra, la lista se refresca, toast de éxito
- **And** un `key` con formato inválido es rechazado por el schema zod antes de llamar al backend

### Scenario: editar flag
- **Given** un flag existente
- **When** el super-admin edita name/description/enabled/metadata y guarda
- **Then** se llama `PUT /admin/feature-flags/:key` y la lista se refresca

### Scenario: eliminar flag con confirmación
- **Given** un flag en la tabla
- **When** el super-admin elige eliminar y confirma en el dialog
- **Then** se llama `DELETE /admin/feature-flags/:key` y el flag desaparece de la lista

---

## Fuera de scope (v1)

- Impersonation cross-tenant desde plataforma (v1.1 — requiere API de listado de miembros
  cross-tenant inexistente + header `X-Tenant-ID`).
- Tipos DTO auto-generados (`openapi-typescript`, deuda §10.10) — el espejo manual queda.
- Modificar `GET /me/permissions` o su `403` (5 callers, intacto).
