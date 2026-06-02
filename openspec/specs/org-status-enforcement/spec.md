# Spec: org-status-enforcement (enforcement de Organization.status)

<!--
Última edición: 2026-06-02
Última revisión contra core: 2026-06-02
Owner: backend-lead
-->

> Fecha: 2026-06-02
> Fase: archivado (implementado — PR #147)
> Change: `org-status-enforcement`
> Proyecto: avicont
> Stack: backend (NestJS + Prisma + PostgreSQL + Redis).

---

## Propósito

Garantizar que las organizaciones en estado SUSPENDED o ARCHIVED operen en modo lectura únicamente. Cualquier mutación (POST/PUT/PATCH/DELETE) sobre recursos de una org no-ACTIVE es bloqueada con 403. Los SuperAdmins y las rutas sin contexto de tenant no son afectados.

---

## Requirements

### Requirement: Bloqueo de mutaciones en org no-ACTIVE

El sistema DEBE bloquear toda operación de mutación (método HTTP POST, PUT, PATCH o DELETE) cuando la organización activa del request tiene `status` distinto de `ACTIVE`. El bloqueo se materializa como 403 con código de error estable `ORG_STATUS_NO_ACTIVE` y mensaje en español.

#### Scenario: Mutación en org ACTIVE — permitida

- GIVEN una organización con `status = ACTIVE`
- WHEN un usuario autenticado realiza una petición POST/PUT/PATCH/DELETE a cualquier endpoint del tenant
- THEN el guard no interviene y la petición continúa su procesamiento normal

#### Scenario: Lectura en org SUSPENDED — permitida

- GIVEN una organización con `status = SUSPENDED`
- WHEN un usuario autenticado realiza una petición GET a cualquier endpoint del tenant
- THEN el guard devuelve true y la petición retorna 200

#### Scenario: Mutación en org SUSPENDED — bloqueada

- GIVEN una organización con `status = SUSPENDED`
- WHEN un usuario autenticado realiza una petición POST/PUT/PATCH/DELETE a cualquier endpoint del tenant
- THEN el sistema responde 403 con código `ORG_STATUS_NO_ACTIVE` y mensaje en español

#### Scenario: Lectura en org ARCHIVED — permitida

- GIVEN una organización con `status = ARCHIVED`
- WHEN un usuario autenticado realiza una petición GET a cualquier endpoint del tenant
- THEN el guard devuelve true y la petición retorna 200

#### Scenario: Mutación en org ARCHIVED — bloqueada

- GIVEN una organización con `status = ARCHIVED`
- WHEN un usuario autenticado realiza una petición DELETE a cualquier endpoint del tenant
- THEN el sistema responde 403 con código `ORG_STATUS_NO_ACTIVE` y mensaje en español

---

### Requirement: Bypass para SuperAdmin

El sistema DEBE permitir que un usuario con `isSuperAdmin === true` realice cualquier tipo de operación (lectura o mutación) sobre una organización, independientemente del `status` de la misma.

#### Scenario: SuperAdmin muta en org SUSPENDED — permitida

- GIVEN una organización con `status = SUSPENDED`
- AND el token del request corresponde a un usuario con `isSuperAdmin = true`
- WHEN el SuperAdmin realiza una petición POST/PUT/PATCH/DELETE sobre el tenant
- THEN el guard devuelve true sin verificar el status y la petición continúa

---

### Requirement: Transparencia en rutas sin contexto de tenant

El sistema DEBE dejar pasar cualquier request que no tenga `tenantId` resuelto en el JWT (rutas org-less como `/admin/platform/*`, `/auth/*`), sin bloquear ni lanzar error.

#### Scenario: Request org-less — guard transparente

- GIVEN un request a una ruta que no requiere contexto de tenant (ej. `POST /admin/platform/orgs`)
- WHEN no hay `tenantId` en el payload del JWT
- THEN el guard devuelve true y no realiza ninguna verificación de status

---

### Requirement: Guard rail para endpoints que deben ser eximidos

El sistema DEBE proveer un mecanismo declarativo (`@AllowOnNonActiveOrg()`) para que endpoints individuales sean eximidos del bloqueo por status. Un endpoint decorado con este decorator DEBE poder recibir mutaciones incluso en org no-ACTIVE.

#### Scenario: Endpoint exento + mutación en org SUSPENDED — permitida

- GIVEN una organización con `status = SUSPENDED`
- AND el endpoint destino está decorado con `@AllowOnNonActiveOrg()`
- WHEN un usuario autenticado realiza una petición POST a ese endpoint
- THEN el guard devuelve true y la petición continúa sin bloqueo

#### Scenario: Endpoint sin decorator + mutación en org SUSPENDED — bloqueada

- GIVEN una organización con `status = SUSPENDED`
- AND el endpoint destino NO tiene el decorator `@AllowOnNonActiveOrg()`
- WHEN un usuario autenticado realiza una petición POST al endpoint
- THEN el sistema responde 403 con código `ORG_STATUS_NO_ACTIVE`

---

### Requirement: Invalidación de caché tras cambio de status

El sistema DEBE invalidar la entrada de caché asociada a la organización (`org-features:<tenantId>`) inmediatamente cuando el SuperAdmin actualiza el `status` de la organización. Posterior a la invalidación, el siguiente request al guard DEBE obtener el status actualizado.

#### Scenario: Invalidación al cambiar status — enforcement refleja nuevo estado

- GIVEN una organización con `status = ACTIVE` cuyo status está cacheado en Redis
- WHEN el SuperAdmin actualiza el `status` a `SUSPENDED` vía `PATCH /admin/platform/orgs/:id/status`
- THEN la clave `org-features:<tenantId>` es eliminada de Redis
- AND el siguiente request de mutación de un usuario común al tenant recibe 403
