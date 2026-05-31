# me-permissions — Especificación

<!--
Última edición: 2026-05-31
Última revisión contra core: 2026-05-31
Owner: backend-lead
-->

> Fecha: 2026-05-31
> Fase: spec
> Change: spine-permisos
> Capability: `me-permissions` (nueva — no existe spec previa)

---

## Propósito

Endpoint `GET /me/permissions` que devuelve los permisos efectivos del usuario
autenticado en su tenant activo (intersección de su rol en el tenant con el
catálogo de permisos). Primer eslabón del spine de permisos: sin este endpoint
el frontend no puede gatear rutas ni acciones por permiso.

Este endpoint NO duplica lógica de resolución: delega en `RbacService.getPermissions()`
que ya existe y es la única fuente de verdad. La lógica de wildcard matching
(`*`, `modulo.*`, etc.) ya vive en `permission-matcher.ts`.

---

## Glosario

- **Permisos efectivos**: el conjunto de strings de permiso que el usuario tiene en su tenant activo, después de aplicar la lógica de wildcards del sistema de roles. NO es el catálogo completo.
- **`isOwner`**: el usuario tiene `SystemRole.OWNER` en el tenant activo. El frontend lo usa para saltear chequeos de permisos individuales.
- **`activeTenantId`**: el `organizationId` del tenant activo tomado del JWT. Siempre coincide con el del token.
- **Sin tenant activo**: el JWT no lleva `activeTenantId` (usuario sin membresía activa, recién registrado, o token de acceso emitido sin tenant).
- **Catálogo**: lista estática de todos los permisos posibles — devuelto por `GET /permissions`. Distinto de los permisos efectivos del usuario.

---

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

### REQ-MP-01: Forma del DTO de respuesta

El endpoint DEBE devolver exactamente este shape:

```
{
  permissions: string[],    // permisos efectivos resueltos, sin wildcards (strings exactos del catálogo)
  isOwner: boolean,         // true si el usuario es OWNER del tenant activo
  activeTenantId: string    // organizationId del JWT activo (nunca null en 200)
}
```

Los strings en `permissions` DEBEN ser permisos exactos del catálogo (ej. `"contabilidad.libro-diario.read"`), no patrones con wildcards. El resolver ya hace el expand; el endpoint NO expone los wildcards crudos.

#### Escenario: respuesta contiene permisos exactos sin wildcards

- DADO un usuario con `CustomRole` que tiene `permissions: ["contabilidad.*"]`
- CUANDO consulta `GET /api/me/permissions`
- ENTONCES la respuesta contiene todos los permisos del módulo `contabilidad` como strings exactos (ej. `"contabilidad.libro-diario.read"`, `"contabilidad.asientos.create"`, etc.), NO el string `"contabilidad.*"`

---

### REQ-MP-02: Autenticación — JwtAuthGuard obligatorio

El endpoint DEBE estar protegido con `JwtAuthGuard`. Un request sin JWT válido
DEBE recibir HTTP 401.

NO DEBE requerir ningún permiso adicional: todo usuario autenticado puede consultar
sus propios permisos efectivos.

#### Escenario: sin JWT — 401

- CUANDO se hace `GET /api/me/permissions` sin cabecera `Authorization`
- ENTONCES el sistema responde HTTP 401

#### Escenario: JWT vencido — 401

- CUANDO se hace `GET /api/me/permissions` con un JWT expirado
- ENTONCES el sistema responde HTTP 401

#### Escenario: JWT válido — 200

- DADO un usuario autenticado con JWT válido y tenant activo
- CUANDO consulta `GET /api/me/permissions`
- ENTONCES el sistema responde HTTP 200

---

### REQ-MP-03: Fuente única — delegar en RbacService

El endpoint DEBE obtener los permisos efectivos llamando a
`RbacService.getPermissions(userId, activeTenantId)` sin duplicar lógica de resolución.

La respuesta del servicio (`ResolvedPermissions`) devuelve `wildcards: string[]`.
El endpoint DEBE expandir esos wildcards contra el catálogo para devolver
solo permisos exactos (sin `*`).

NO DEBE leer la base de datos directamente. NO DEBE reimplementar la lógica de roles.

#### Escenario: permisos servidos desde caché Redis

- DADO que el usuario ya realizó requests previas (caché caliente)
- CUANDO consulta `GET /api/me/permissions`
- ENTONCES el servicio responde desde caché sin hit a BD (transparente para el endpoint)

---

### REQ-MP-04: OWNER — isOwner true y permissions con catálogo completo

Un usuario con `SystemRole.OWNER` en el tenant activo DEBE recibir
`isOwner: true` y `permissions` con TODOS los permisos del catálogo expandidos.

El sistema NO DEBE devolver `permissions: ["*"]` como string literal — siempre strings exactos.

#### Escenario: OWNER recibe catálogo completo

- DADO un usuario con `SystemRole.OWNER` en el tenant activo
- CUANDO consulta `GET /api/me/permissions`
- ENTONCES `isOwner: true`
- Y `permissions` contiene todos los strings del catálogo de permisos (`CATALOGO_PERMISOS`)
- Y NO aparece el string literal `"*"` en el array

#### Escenario: ADMIN recibe catálogo completo — isOwner false

- DADO un usuario con `SystemRole.ADMIN` en el tenant activo
- CUANDO consulta `GET /api/me/permissions`
- ENTONCES `isOwner: false`
- Y `permissions` contiene todos los strings del catálogo (el ADMIN también tiene wildcard `*`)

---

### REQ-MP-05: Usuario con CustomRole — permisos expandidos del rol

Un usuario con `SystemRole.MEMBER` y un `CustomRole` asignado DEBE recibir
los permisos efectivos resultantes de expandir los wildcards del `CustomRole`
contra el catálogo.

#### Escenario: MEMBER con CustomRole parcial

- DADO un usuario con `SystemRole.MEMBER` y `CustomRole.permissions = ["contabilidad.libro-diario.read", "contabilidad.libro-mayor.read"]`
- CUANDO consulta `GET /api/me/permissions`
- ENTONCES `isOwner: false`
- Y `permissions = ["contabilidad.libro-diario.read", "contabilidad.libro-mayor.read"]`
- Y NO incluye permisos fuera de ese CustomRole

#### Escenario: MEMBER sin CustomRole — permissions vacío

- DADO un usuario con `SystemRole.MEMBER` sin `CustomRole` asignado (el campo es `null`)
- CUANDO consulta `GET /api/me/permissions`
- ENTONCES `isOwner: false`
- Y `permissions: []`

#### Escenario: MEMBER con CustomRole wildcard de módulo

- DADO un usuario con `CustomRole.permissions = ["contabilidad.*"]`
- CUANDO consulta `GET /api/me/permissions`
- ENTONCES `permissions` contiene exactamente todos los permisos cuyo primer segmento es `contabilidad`
- Y NO contiene permisos de otros módulos (ej. `granja.*`)

---

### REQ-MP-06: Sin tenant activo — 403

Si el JWT del usuario autenticado no lleva `activeTenantId` (usuario sin membresía
activa o con token emitido sin tenant), el endpoint DEBE responder HTTP 403 con
código de error `ME_PERMISSIONS_SIN_TENANT`.

Razón: los permisos son siempre relativos a un tenant. Sin tenant activo no hay
contexto para resolver permisos. Este comportamiento es coherente con la ForbiddenException
que lanza el `PermissionsGuard` cuando `tenantId` es null.

NO DEBE devolver `{ permissions: [], isOwner: false, activeTenantId: null }` —
ese shape sería ambiguo (¿el usuario realmente no tiene permisos o simplemente
no hay tenant?).

#### Escenario: sin tenant activo — 403

- DADO un usuario autenticado cuyo JWT no tiene `activeTenantId`
- CUANDO consulta `GET /api/me/permissions`
- ENTONCES el sistema responde HTTP 403 con código `ME_PERMISSIONS_SIN_TENANT`

#### Escenario: con tenant activo — 200 (caso nominal)

- DADO un usuario autenticado cuyo JWT tiene `activeTenantId` válido
- CUANDO consulta `GET /api/me/permissions`
- ENTONCES el sistema responde HTTP 200

---

### REQ-MP-07: Multi-tenant — datos propios únicamente

El endpoint DEBE resolver permisos SOLO para el `activeTenantId` del JWT del
usuario que hace el request. NO DEBE aceptar un `tenantId` por query param ni
por body para evitar cross-tenant.

Excepción administrada: el header `X-Tenant-ID` puede ser aceptado solo si el
request proviene de un super-admin con impersonation activa (mismo comportamiento
que el `PermissionsGuard`). En ese caso el `activeTenantId` del header reemplaza
al del JWT — este flujo ya lo maneja el guard existente.

#### Escenario: usuario A no puede ver permisos del tenant de usuario B

- DADO el usuario A (tenant A) y el usuario B (tenant B)
- CUANDO el usuario A consulta `GET /api/me/permissions`
- ENTONCES recibe los permisos de su propio tenant A, sin posibilidad de especificar el tenant B

---

### REQ-MP-08: Membresía desactivada — 403

Si la membresía del usuario en el tenant activo fue desactivada (`deactivatedAt` no nulo),
`RbacService.getPermissions()` devuelve `EMPTY` (`esOwner: false, esAdmin: false, wildcards: []`).

El endpoint DEBE retornar HTTP 403 con código `ME_PERMISSIONS_MEMBRESIA_INACTIVA`
en este caso (no silenciar con `permissions: []`), porque un usuario con membresía
desactivada no debería poder operar en el tenant.

#### Escenario: membresía desactivada — 403

- DADO un usuario cuya membresía en el tenant activo tiene `deactivatedAt` con fecha pasada
- CUANDO consulta `GET /api/me/permissions`
- ENTONCES el sistema responde HTTP 403 con código `ME_PERMISSIONS_MEMBRESIA_INACTIVA`

> **Nota de implementación**: el `RbacService.getPermissions()` devuelve `EMPTY` tanto para
> membresía desactivada como para usuario no-miembro. Para distinguir el 403 de membresía
> inactiva se requiere una verificación adicional en el endpoint o en el servicio.
> Se acepta que, si la verificación extra tiene costo, el endpoint devuelva 403 genérico
> sin distinguir la causa — el mensaje puede ser "Acceso denegado al tenant activo".

---

### REQ-MP-09: Ubicación del endpoint

El endpoint DEBE vivir en el módulo `auth` o en un módulo `me` nuevo, bajo la
ruta `/api/me/permissions`. NO DEBE vivir en `/api/permissions` (que ya existe
para el catálogo completo) para evitar confusión.

---

## Códigos de error

| Código | HTTP | Descripción |
|--------|------|-------------|
| `ME_PERMISSIONS_SIN_TENANT` | 403 | El JWT no lleva `activeTenantId` |
| `ME_PERMISSIONS_MEMBRESIA_INACTIVA` | 403 | La membresía del usuario en el tenant activo está desactivada |

---

## Notas de scope

- **Entitlement fuera de scope**: este corte NO filtra permisos por módulos activados del
  tenant (entitlement). El filtro de entitlement se agrega cuando exista el modelo de
  entitlement (paso 2 de la secuencia de la plataforma multi-vertical). Hoy devuelve
  toda la intersección rol∩catálogo sin verificar si el módulo está activado.
- **Catálogo compartido**: `CATALOGO_PERMISOS` ya existe en `src/common/permisos/catalogo.ts`.
  El expand de wildcards usa ese array como referencia fija.
