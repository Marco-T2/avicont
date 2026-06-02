# platform-members — Especificación

<!--
Última edición: 2026-06-02
Última revisión contra core: 2026-06-02
Owner: backend-lead
-->

> Fecha: 2026-06-02
> Fase: spec
> Change: `platform-admin-v1.1`
> Slice: 1
> Stack: backend (NestJS) + frontend (Vite + React)
> Capability: NUEVA — no existía spec previa

---

## Propósito

Dar al super-admin visibilidad de las personas que componen cualquier organización:
endpoint `GET /admin/platform/orgs/:id/members` (org-less, auditado) y vista de panel
`/platform-admin/orgs/:id/members`.

---

## Requirements

---

### REQ-PM-01 (Slice 1): `GET /admin/platform/orgs/:id/members` — listado cross-tenant de miembros

El backend DEBE exponer `GET /admin/platform/orgs/:id/members` protegido por
`JwtAuthGuard` + `SuperAdminGuard` y auditado por `PlatformAuditInterceptor`.
El service DEBE validar existencia de la org antes de delegar en
`MembershipsReaderPort.findAllByTenant(id)`.

La respuesta DEBE incluir miembros **activos y desactivados** con la siguiente
shape por elemento: `id`, `userId`, `systemRole`, `customRoleId`, `customRole`
(`{id, slug, name} | null`), `deactivatedAt`, `createdAt`, `user` (`{id, email, displayName}`).

El controller DEBE poblar `req.tenantId = id` antes del interceptor para que
`targetOrganizationId` quede registrado en `platform_audit` (idéntico al patrón de
`actualizarStatus`).

#### Escenario: SA lista miembros de org existente (caso positivo)

- DADO un super-admin autenticado y una org `org-X` con 3 miembros (2 activos, 1 desactivado)
- CUANDO llama `GET /admin/platform/orgs/org-X/members`
- ENTONCES recibe `200` con un array de 3 elementos
- Y cada elemento incluye `id`, `userId`, `systemRole`, `customRole`, `deactivatedAt`, `createdAt`, `user{id,email,displayName}`
- Y el miembro desactivado aparece con `deactivatedAt` no nulo

#### Escenario: SA lista miembros — fila en `platform_audit`

- DADO un super-admin que consulta `GET /admin/platform/orgs/org-X/members`
- CUANDO la request completa con `200`
- ENTONCES se crea una fila en `platform_audit` con `actorUserId` del SA, `targetOrganizationId = 'org-X'`, y `action` que identifica la consulta

#### Escenario: org inexistente → 404 (caso negativo)

- DADO un super-admin autenticado
- CUANDO llama `GET /admin/platform/orgs/org-inexistente/members`
- ENTONCES recibe `404` con código `PLATFORM_ORG_NO_ENCONTRADA`
- Y NO se crea fila en `platform_audit`

#### Escenario: usuario NO super-admin → 403 (invariante §4.2)

- DADO un usuario OWNER o ADMIN de cualquier org (sin `isSuperAdmin`)
- CUANDO llama `GET /admin/platform/orgs/:id/members`
- ENTONCES recibe `403`
- Y NO se expone información de miembros de ninguna org

#### Escenario: sin token → 401

- DADO una request sin Bearer token
- CUANDO llega al endpoint
- ENTONCES `JwtAuthGuard` rechaza con `401` antes de evaluar `SuperAdminGuard`

---

### REQ-PM-02 (Slice 1): Vista `/platform-admin/orgs/:id/members` bajo `PlatformShell`

El frontend DEBE proveer una ruta `/platform-admin/orgs/:id/members` registrada
bajo `PlatformShell` + `RequireSuperAdmin`. La página DEBE consumir
`GET /admin/platform/orgs/:id/members` vía TanStack Query y mostrar los miembros
en tabla con columnas: email, displayName, systemRole, customRole, estado
(activo/desactivado), createdAt.

DEBE manejar estados loading (skeleton), empty state ("No hay miembros") y error
(mensaje en español).

#### Escenario: tabla de miembros con datos

- DADO el backend devuelve miembros para `org-X`
- CUANDO el SA navega a `/platform-admin/orgs/org-X/members`
- ENTONCES ve una tabla con una fila por miembro (email, displayName, systemRole, customRole, estado, createdAt)
- Y los miembros desactivados se distinguen visualmente del resto

#### Escenario: estado loading → skeleton

- DADO la query está en vuelo
- CUANDO se monta la página
- ENTONCES muestra skeleton (no tabla vacía, no error)

#### Escenario: estado vacío

- DADO el backend devuelve `[]`
- CUANDO se monta la página
- ENTONCES muestra empty state en español ("No hay miembros")

#### Escenario: estado error

- DADO la query falla (ej. 403 / 500)
- CUANDO se monta la página
- ENTONCES muestra mensaje de error en español (no la tabla)

#### Escenario: ruta gateada — no-SA redirige a `/`

- DADO un usuario sin `isSuperAdmin` que navega directamente a la URL
- CUANDO se monta `RequireSuperAdmin`
- ENTONCES redirige a `/` con `<Navigate replace>`
- Y el backend devolvería `403` si la query llegara

---

## Códigos de error

| Código | HTTP | Descripción |
|--------|------|-------------|
| `PLATFORM_ORG_NO_ENCONTRADA` | 404 | La org `id` no existe (ya existe en `platform-errors.ts`) |
