# Delta Spec: super-admin de plataforma (pasos 2-9)

<!--
Última edición: 2026-06-02
Última revisión contra core: 2026-06-02
Owner: backend-lead
-->

> Fecha: 2026-06-01
> Fase: spec
> Change: `super-admin`
> Proyecto: avicont
> Stack: backend (NestJS + Prisma + PostgreSQL). UI diferida a v1.1.
> Insumos: `proposal.md` (pasos 2-9) + `docs/disenos/super-admin-plataforma.md`

---

## Propósito de este delta

Construir el **sujeto de plataforma** que hoy no existe en el modelo de datos:
`User.isSuperAdmin Boolean`, con su claim JWT, guards de autorización, bypass
disciplinado del scoping multi-tenant, auditoría cross-tenant, bootstrap, endpoints
de administración de plataforma e impersonation cross-tenant.

El **paso 1** (gatear `PATCH /tenants/current`) ya está hecho y mergeado (PR #118).
**No se re-especifica acá.**

La **UI de plataforma** se difiere a v1.1. En v1 se opera por API/Swagger.

Cada invariante de seguridad crítico lleva un escenario negativo explícito (CLAUDE.md §4.2).

---

## Glosario

- **Super-admin**: usuario con `User.isSuperAdmin === true`. Identidad de plataforma,
  opera POR ENCIMA de los tenants. NO es un `SystemRole` por-org.
- **Tenant de destino**: la organización sobre la que el super-admin opera, indicada por
  el header `X-Tenant-ID` en su request.
- **Bypass disciplinado**: el `TenantGuard` acepta `X-Tenant-ID` sin exigir membresía
  SOLO cuando el caller es super-admin. El filtro `WHERE organizationId` de los
  repositorios NO se toca — el super-admin "entra" a un tenant pero no ve dos a la vez.
- **`platform_audit`**: tabla separada de `AuditLog` que registra toda acción con el
  flag `isSuperAdmin` que mute estado o acceda cross-tenant.
- **Bootstrap**: mecanismo de asignación del primer super-admin sin endpoint protegido
  (seed por `SUPER_ADMIN_EMAIL` + CLI grant/revoke).
- **Entitlement**: qué verticales y packs puede activar una org (potestad exclusiva del
  super-admin). Distinto de **activación** (potestad del OWNER dentro de su entitlement).

---

## Capacidad 1: Modelo de datos — `User.isSuperAdmin`

### REQ-SA-01: Campo `isSuperAdmin` en el modelo `User`

El modelo `User` DEBE incluir el campo `isSuperAdmin Boolean @default(false)` como
atributo de identidad de plataforma.

**Reglas:**
- Todos los usuarios existentes quedan con `false` (migration aditiva, sin backfill).
- El campo NO DEBE aparecer en ningún DTO de respuesta de usuario común (perfil, listado
  de miembros, `/me/*`). Es un atributo de seguridad, no de presentación.
- NO puede asignarse por ningún endpoint self-service de usuario.

#### Escenario: migration aditiva — usuarios existentes son `false`

- DADO un sistema con usuarios existentes sin el campo `isSuperAdmin`
- CUANDO se aplica la migration aditiva
- ENTONCES todos los usuarios existentes tienen `isSuperAdmin = false`
- Y ningún usuario tiene `isSuperAdmin = true` salvo asignación explícita posterior

#### Escenario: `isSuperAdmin` no se expone en DTOs de usuario

- DADO un usuario con `isSuperAdmin = true`
- CUANDO otro usuario (o el mismo) consulta su perfil o listado de miembros
- ENTONCES la respuesta NO incluye el campo `isSuperAdmin`
- Y el campo no está en ningún `UserResponseDto` ni `MemberResponseDto`

---

## Capacidad 2: Autenticación — claim JWT e invalidación

### REQ-SA-02: Claim `isSuperAdmin` en el JWT de acceso

El `JwtPayload` DEBE incluir el campo `isSuperAdmin?: boolean`, seteado desde
`user.isSuperAdmin` en `JwtClaims.forUser()`. `JwtStrategy.validate()` DEBE propagar
el claim a `req.user`.

**Puntos de toque obligatorios:** `auth/domain/jwt-claims.ts` (interface + factory) y
`strategies/jwt.strategy.ts` (validate).

#### Escenario: super-admin recibe claim `isSuperAdmin: true` en su JWT

- DADO un usuario con `isSuperAdmin = true`
- CUANDO se autentica y recibe su access token
- ENTONCES el payload del JWT contiene `isSuperAdmin: true`
- Y `req.user.isSuperAdmin === true` en cada request con ese token

#### Escenario: usuario regular NO recibe claim `isSuperAdmin`

- DADO un usuario con `isSuperAdmin = false` (o campo no seteado)
- CUANDO se autentica y recibe su access token
- ENTONCES el payload del JWT NO contiene `isSuperAdmin: true`
- Y `req.user.isSuperAdmin` es `false` o `undefined` en cada request

---

### REQ-SA-03: Revocación inmediata al revocar el flag

Cuando el flag `isSuperAdmin` de un usuario es revocado (grant→revoke), TODOS sus
tokens de acceso activos DEBEN ser invalidados inmediatamente vía blocklist Redis
(mecanismo §5.2 core). NO se espera a la expiración natural del JWT (1h).

> Justificación: un super-admin comprometido con token activo durante 1h es un
> incidente grave con impacto cross-tenant (CLAUDE.md §4.2).

#### Escenario: revocar flag invalida tokens activos del ex-super-admin

- DADO un usuario super-admin con un access token válido (no expirado)
- CUANDO su flag `isSuperAdmin` es revocado via CLI o endpoint de bootstrap
- ENTONCES el token activo es agregado a la blocklist Redis
- Y una request subsiguiente con ese token recibe 401 (token revocado)
- Y no debe esperar a la expiración del JWT para que el acceso cese

#### Escenario: user regular con token activo no se ve afectado por revocación de otro

- DADO un usuario regular con su propio token válido
- CUANDO el token de OTRO usuario (super-admin) es revocado
- ENTONCES el usuario regular puede seguir usando su token normalmente
- Y la blocklist solo contiene tokens del usuario revocado

---

### REQ-SA-04: Token de impersonation NO lleva `isSuperAdmin`

El token de impersonation generado cuando un super-admin impersona a un usuario de un
tenant DEBE tener `isSuperAdmin: false` (o el campo ausente). El operador impersonado
actúa CON la identidad del target, sin poderes de plataforma.

#### Escenario: token de impersonation no hereda poderes de plataforma

- DADO un super-admin que inicia impersonation sobre un usuario regular
- CUANDO se genera el token de impersonation
- ENTONCES ese token NO contiene `isSuperAdmin: true`
- Y las requests con el token de impersonation son rechazadas por `SuperAdminGuard`
- Y el operador actúa dentro del scope del tenant destino como el usuario target

---

## Capacidad 3: Autorización — guards

### REQ-SA-05: `SuperAdminGuard` nuevo

DEBE existir un `SuperAdminGuard` que verifique `req.user?.isSuperAdmin === true`.
Se DEBE aplicar a todos los endpoints `/admin/platform/*`. Rechaza con 403 si la
condición no se cumple.

#### Escenario: super-admin pasa el guard (caso positivo)

- DADO un usuario con `isSuperAdmin = true` y un JWT válido
- CUANDO realiza una request a un endpoint protegido por `SuperAdminGuard`
- ENTONCES la request pasa el guard y es procesada

#### Escenario: usuario regular es rechazado con 403 (caso negativo)

- DADO un usuario con `isSuperAdmin = false` (OWNER, ADMIN o cualquier rol por-org)
- CUANDO realiza una request a un endpoint protegido por `SuperAdminGuard`
- ENTONCES la respuesta es 403
- Y el mensaje de error NO expone información sobre la existencia del flag

#### Escenario: request sin JWT es rechazada antes del guard

- DADO una request a un endpoint de plataforma sin header `Authorization`
- CUANDO llega al pipeline de guards
- ENTONCES `JwtAuthGuard` rechaza con 401
- Y `SuperAdminGuard` nunca es evaluado

---

### REQ-SA-06: Bypass disciplinado del `TenantGuard` para super-admin

El `TenantGuard` DEBE aceptar el header `X-Tenant-ID` SIN exigir membresía cuando
`req.user.isSuperAdmin === true`, seteando `req.tenantId` con el valor del header.

**Regla dura**: el bypass SOLO relaja la exigencia de membresía. El filtro
`WHERE organizationId` de todos los repositorios NO se modifica. El super-admin
opera dentro del tenant indicado por `X-Tenant-ID`; no ve datos de múltiples
tenants en una sola query (CLAUDE.md §4.2 defense in depth intacta).

#### Escenario: super-admin opera en org sin ser miembro (caso positivo)

- DADO un super-admin sin membresía en la org con id `org-X`
- CUANDO realiza una request con `X-Tenant-ID: org-X` y JWT válido
- ENTONCES `TenantGuard` setea `req.tenantId = 'org-X'` y deja pasar la request
- Y las queries del repositorio usan `organizationId = 'org-X'` (scope correcto)

#### Escenario: usuario regular sin membresía es rechazado (caso negativo — invariante §4.2)

- DADO un usuario regular (OWNER, ADMIN, o miembro de OTRA org) sin membresía en `org-X`
- CUANDO realiza una request con `X-Tenant-ID: org-X`
- ENTONCES `TenantGuard` rechaza con 403 (comportamiento actual intacto)
- Y el bypass NO se activa para ningún usuario que no sea super-admin

#### Escenario: super-admin sin `X-Tenant-ID` — sin acceso cross-tenant implícito

- DADO un super-admin que realiza una request a un endpoint de tenant SIN enviar `X-Tenant-ID`
- CUANDO llega al `TenantGuard`
- ENTONCES la request falla (no hay tenant de destino válido)
- Y el super-admin NO obtiene acceso sin indicar explícitamente el tenant

#### Escenario: el filtro de repositorio no se toca (defensa en profundidad)

- DADO un super-admin operando en `org-X` via `X-Tenant-ID: org-X`
- CUANDO el servicio llama al repositorio
- ENTONCES el repositorio filtra sus queries con `WHERE organizationId = 'org-X'`
- Y no devuelve registros de `org-Y` ni de ninguna otra organización

---

### REQ-SA-07: Short-circuit `esSuperAdmin` en el RBAC

El `PermissionsGuard` (o `RbacService`) DEBE corto-circuitar la evaluación de
permisos cuando `req.user.isSuperAdmin === true`, autorizando la request
independientemente del permiso requerido, con la misma forma que el short-circuit
actual para `esOwner / esAdmin`.

> El flag `isSuperAdmin` viene del JWT (no del cache RBAC por-org). El corte se
> hace en el guard antes de llamar al resolver por-org, para no mezclar identidad
> de plataforma con identidad de tenant.

#### Escenario: super-admin pasa cualquier chequeo de permiso (caso positivo)

- DADO un super-admin operando con `X-Tenant-ID` en una org donde NO es miembro
- CUANDO la request llega a un endpoint que exige `@RequirePermissions('contabilidad.asientos.create')`
- ENTONCES el `PermissionsGuard` corto-circuita y autoriza la request
- Y no se intenta resolver permisos por-org para ese usuario

#### Escenario: no-super-admin sigue el flujo RBAC normal (caso negativo)

- DADO un usuario regular (OWNER, ADMIN o miembro con permisos limitados)
- CUANDO la request llega a un endpoint con `@RequirePermissions(...)`
- ENTONCES el `PermissionsGuard` evalúa el permiso normalmente vía `RbacService`
- Y el short-circuit `esSuperAdmin` NO se activa

---

## Capacidad 4: Auditoría cross-tenant (`platform_audit`)

### REQ-SA-08: Tabla `platform_audit` separada de `AuditLog`

DEBE existir una tabla `platform_audit` en la base de datos, separada de `AuditLog`
(que tiene `organizationId NOT NULL`), con al menos los campos:
- `actorUserId String` (el super-admin que actuó)
- `action String` (descriptor de la acción, ej. `platform.orgs.suspend`)
- `targetOrganizationId String?` (org afectada, nullable para acciones globales)
- `payload Json?` (datos relevantes de la acción)
- `createdAt Timestamptz` (timestamp UTC via `ClockPort`, CLAUDE.md §4.6)

#### Escenario: la tabla `platform_audit` existe y es independiente de `AuditLog`

- DADO el schema de base de datos tras aplicar la migration
- ENTONCES existe la tabla `platform_audit` con los campos descritos
- Y `AuditLog.organizationId` permanece `NOT NULL` (sin cambio)

---

### REQ-SA-09: Toda acción con `isSuperAdmin` que mute estado deja rastro en `platform_audit`

Un interceptor DEBE registrar en `platform_audit` TODA request donde
`req.user.isSuperAdmin === true` que:
- Mute estado (métodos POST, PUT, PATCH, DELETE), O
- Acceda a datos cross-tenant (cualquier método en endpoints `/admin/platform/*`).

El timestamp se obtiene de `ClockPort` (NUNCA `new Date()` directamente, CLAUDE.md §4.6).

Acciones que DEBEN auditarse siempre:
- Grant/revoke del flag `isSuperAdmin` a cualquier usuario.
- Creación, suspensión, reactivación de organizaciones.
- Asignación de entitlement (plan/verticales/packs).
- Inicio de impersonation cross-tenant.
- Cambio de feature flags globales.

#### Escenario: acción de plataforma deja fila en `platform_audit`

- DADO un super-admin que suspende la org `org-X`
- CUANDO ejecuta `PATCH /admin/platform/orgs/org-X/status`
- ENTONCES se crea una fila en `platform_audit` con `actorUserId`, `action = 'platform.orgs.suspend'`, `targetOrganizationId = 'org-X'`, y timestamp del `ClockPort`
- Y la fila es visible inmediatamente (dentro de la misma transacción o antes del commit)

#### Escenario: grant/revoke del flag `isSuperAdmin` queda auditado

- DADO un super-admin que revoca el flag a otro usuario
- CUANDO ejecuta el comando CLI `super-admin:revoke <email>`
- ENTONCES se crea una fila en `platform_audit` con `action = 'platform.superadmin.revoke'`, `actorUserId`, y el `targetUserId` en `payload`

#### Escenario: request de lectura de usuario regular NO genera fila en `platform_audit`

- DADO un usuario regular (no super-admin) que consulta sus propios datos
- CUANDO realiza `GET /me/permissions`
- ENTONCES NO se crea ninguna fila en `platform_audit`
- Y la tabla no crece con ruido de requests normales

---

## Capacidad 5: Bootstrap

### REQ-SA-10: Seed idempotente por `SUPER_ADMIN_EMAIL`

El seed de Prisma DEBE leer la variable de entorno `SUPER_ADMIN_EMAIL`. Si está
presente y el usuario con ese email existe, DEBE setear `isSuperAdmin = true`.
El seed DEBE ser idempotente: ejecutarlo dos veces NO crea un segundo super-admin
ni lanza un error.

#### Escenario: seed asigna super-admin al usuario indicado (caso positivo)

- DADO la variable `SUPER_ADMIN_EMAIL = "operador@avicont.com"` en el entorno
- Y un usuario con ese email ya existente en la BD
- CUANDO se ejecuta `pnpm run seed`
- ENTONCES el usuario tiene `isSuperAdmin = true`
- Y se crea una fila en `platform_audit` con `action = 'platform.superadmin.grant'`

#### Escenario: seed idempotente — segunda ejecución no duplica ni falla

- DADO que el seed ya se ejecutó y el usuario tiene `isSuperAdmin = true`
- CUANDO se ejecuta `pnpm run seed` una segunda vez
- ENTONCES el usuario sigue con `isSuperAdmin = true`
- Y no se crea una fila duplicada en `platform_audit`
- Y el seed termina sin error

#### Escenario: `SUPER_ADMIN_EMAIL` no definida — seed no hace nada relacionado con super-admin

- DADO que `SUPER_ADMIN_EMAIL` no está en el entorno
- CUANDO se ejecuta `pnpm run seed`
- ENTONCES el seed corre normalmente (sin la parte de super-admin)
- Y ningún usuario queda con `isSuperAdmin = true` por este mecanismo

#### Escenario: email no existe en BD — seed falla con mensaje claro, no silenciosamente

- DADO `SUPER_ADMIN_EMAIL = "noexiste@avicont.com"` y ningún usuario con ese email
- CUANDO se ejecuta el seed
- ENTONCES el proceso falla con un error descriptivo (no en silencio)
- Y ningún otro usuario queda con `isSuperAdmin = true`

---

### REQ-SA-11: Comando CLI grant/revoke para super-admins posteriores

DEBE existir un comando CLI `super-admin:grant <email>` / `super-admin:revoke <email>`
para asignar o revocar el flag en operadores posteriores al primero.

**Reglas:**
- Grant solo puede ejecutarlo alguien con acceso al servidor (no es un endpoint HTTP).
- Revoke DEBE disparar la revocación inmediata de tokens activos (REQ-SA-03).
- Ambas acciones DEBEN dejar fila en `platform_audit`.
- El comando NO permite auto-asignación (un usuario no puede darse el flag a sí mismo
  vía CLI — depende de quién tiene acceso al servidor, no de auth del sistema).

#### Escenario: grant via CLI asigna el flag y audita

- DADO un usuario `nuevo@avicont.com` con `isSuperAdmin = false`
- CUANDO se ejecuta `pnpm super-admin:grant nuevo@avicont.com` desde el servidor
- ENTONCES el usuario tiene `isSuperAdmin = true`
- Y se crea una fila en `platform_audit` con `action = 'platform.superadmin.grant'`
- Y el próximo login del usuario genera JWT con `isSuperAdmin: true`

#### Escenario: revoke via CLI revoca el flag, invalida tokens y audita

- DADO un super-admin `operador@avicont.com` con token activo
- CUANDO se ejecuta `pnpm super-admin:revoke operador@avicont.com`
- ENTONCES `isSuperAdmin = false` en la BD
- Y los tokens activos del usuario son agregados a la blocklist Redis (REQ-SA-03)
- Y se crea una fila en `platform_audit` con `action = 'platform.superadmin.revoke'`
- Y una request posterior con el token activo recibe 401

---

## Capacidad 6: Endpoints de plataforma (`/admin/platform/*`)

Todos los endpoints de esta capacidad DEBEN estar protegidos por `SuperAdminGuard`.
Un OWNER, ADMIN o cualquier usuario regular que intente acceder DEBE recibir 403.

### REQ-SA-12: `GET /admin/platform/orgs` — listado cross-tenant de organizaciones

DEBE devolver una lista paginada/filtrable de todas las organizaciones del sistema,
con al menos: `id`, `name`, `status`, `plan`, `verticales habilitadas`, `createdAt`.

#### Escenario: super-admin lista todas las orgs (caso positivo)

- DADO un super-admin autenticado
- CUANDO consulta `GET /admin/platform/orgs`
- ENTONCES recibe la lista de TODAS las organizaciones del sistema (sin filtro de tenant)
- Y la respuesta incluye orgs de distintos tenants

#### Escenario: OWNER regular no puede listar todas las orgs (caso negativo)

- DADO un OWNER de su propia org
- CUANDO intenta `GET /admin/platform/orgs`
- ENTONCES recibe 403
- Y NO se expone información de otras organizaciones

---

### REQ-SA-13: `POST /admin/platform/orgs` — crear org con OWNER designado

DEBE crear una organización y asignar como primer OWNER a un usuario existente
designado explícitamente (no el caller). Difiere de `POST /tenants` (self-service
donde el creador queda OWNER).

El campo `ownerEmail` (o `ownerUserId`) en el body DEBE designar a un usuario
existente que queda como OWNER de la nueva org. Si el usuario no existe → 422.

#### Escenario: super-admin crea org con OWNER ajeno

- DADO un super-admin y un usuario existente `cliente@empresa.com`
- CUANDO ejecuta `POST /admin/platform/orgs` con body `{ name: "Empresa SA", ownerEmail: "cliente@empresa.com", ... }`
- ENTONCES se crea la organización
- Y `cliente@empresa.com` tiene una membresía `SystemRole.OWNER` en esa org
- Y el super-admin NO queda como miembro de la nueva org
- Y se crea una fila en `platform_audit`

#### Escenario: designar OWNER con email inexistente → 422 con error claro

- DADO un super-admin que intenta crear org con `ownerEmail: "noexiste@nada.com"`
- CUANDO ejecuta `POST /admin/platform/orgs`
- ENTONCES la respuesta es 422 con código de error descriptivo
- Y ninguna org es creada (la operación es atómica)

---

### REQ-SA-14: `PATCH /admin/platform/orgs/:id/status` — suspender/reactivar

DEBE cambiar `Organization.status` a `SUSPENDED` o `ACTIVE` según corresponda.

**Efecto de suspensión**: usuarios de la org suspendida NO pueden autenticarse ni
usar la API (el `TenantGuard` o la validación de membership activa los debe bloquear).

#### Escenario: super-admin suspende org

- DADO una org activa con usuarios autenticados
- CUANDO el super-admin ejecuta `PATCH /admin/platform/orgs/:id/status` con `{ status: 'SUSPENDED' }`
- ENTONCES la org queda en estado `SUSPENDED`
- Y se crea una fila en `platform_audit`

#### Escenario: super-admin reactiva org suspendida

- DADO una org en estado `SUSPENDED`
- CUANDO el super-admin ejecuta `PATCH /admin/platform/orgs/:id/status` con `{ status: 'ACTIVE' }`
- ENTONCES la org vuelve a estado `ACTIVE`
- Y sus usuarios pueden operar con normalidad
- Y se crea una fila en `platform_audit`

#### Escenario: OWNER regular no puede suspender su propia org (caso negativo)

- DADO un OWNER de su propia org
- CUANDO intenta `PATCH /admin/platform/orgs/:id/status` (siendo `:id` su propia org)
- ENTONCES recibe 403 (el endpoint está protegido por `SuperAdminGuard`, no por membresía)

---

### REQ-SA-15: `PATCH /admin/platform/orgs/:id/entitlement` — asignar entitlement

DEBE actualizar el entitlement de una organización: `plan` (enum `Plan`), verticales
habilitadas (`contabilidadEnabled`, `granjaEnabled`), y packs cuando existan.

Regla de exclusividad vertical (CLAUDE.md §4.2, schema check): no se puede habilitar
`contabilidadEnabled = true` Y `granjaEnabled = true` simultáneamente.

#### Escenario: super-admin asigna entitlement a org

- DADO una org con plan `FREE` y sin verticales
- CUANDO el super-admin ejecuta `PATCH /admin/platform/orgs/:id/entitlement` con
  `{ plan: 'PRO', contabilidadEnabled: true }`
- ENTONCES la org queda con `plan = PRO` y `contabilidadEnabled = true`
- Y se crea una fila en `platform_audit` con el payload del cambio

#### Escenario: entitlement dual vertical es rechazado (invariante §4.2)

- DADO cualquier caller (incluido super-admin)
- CUANDO intenta setear `{ contabilidadEnabled: true, granjaEnabled: true }`
- ENTONCES la respuesta es 422 con error sobre exclusividad de vertical
- Y la org NO cambia su estado

---

### REQ-SA-16: Mover `sistema.feature-flags.admin` a `SuperAdminGuard`

El endpoint existente `/admin/feature-flags` (o similar) que administra feature flags
globales (`sistema.*`) DEBE ser protegido por `SuperAdminGuard` en lugar del wildcard
actual (`esOwner || esAdmin` vía RBAC).

#### Escenario: super-admin administra feature flags globales (caso positivo)

- DADO un super-admin autenticado
- CUANDO accede al endpoint de feature flags globales
- ENTONCES puede leer y modificar los flags de `sistema.*`

#### Escenario: OWNER/ADMIN no puede administrar feature flags de plataforma (caso negativo — cierra deuda §3.3)

- DADO un OWNER o ADMIN de cualquier org
- CUANDO intenta acceder al endpoint de feature flags globales
- ENTONCES recibe 403
- Y el wildcard RBAC ya NO les otorga acceso a `sistema.*`

---

## Capacidad 7: Impersonation cross-tenant

### REQ-SA-17: Super-admin puede impersonar en org donde no es miembro

El `ImpersonationService.start()` DEBE incluir una rama aditiva `if (caller.isSuperAdmin)`
que omite el requisito de `SystemRole.OWNER` en la org destino. El resto del flujo de
impersonation (doble auditoría, ventana de 30 min, token de impersonation) permanece INTACTO.

La restricción `TargetEsOwnerError` (no impersonar a un OWNER) DEBE mantenerse también
para el super-admin. Un super-admin NO puede impersonar a un OWNER.

`StartImpersonationDto` DEBE incluir el campo opcional `organizationId?: string`
(`@IsOptional @IsUUID`). El controller DEBE resolver la org destino según el caller:

```
callerEsSuperAdmin && dto.organizationId !== undefined
  ? dto.organizationId          // SA org-less: org explícita en body
  : resolveTenantId(req)        // OWNER: header X-Tenant-ID o activeTenantId (intacto)
```

Si el SA no envía `organizationId` en el body y no tiene tenant activo, `resolveTenantId`
lanza `ForbiddenException('Se requiere contexto de organización')` — ese es el error correcto.

#### Escenario: SA impersona usuario no-OWNER en org ajena con `organizationId` (caso positivo)

- DADO un super-admin sin membresía en `org-X`
- Y un usuario `usuario-regular` miembro no-OWNER de `org-X`
- CUANDO el SA llama `POST /admin/impersonate` con `{ targetUserId, reason, organizationId: 'org-X' }`
- ENTONCES recibe `201` con `{ impersonationToken, expiresAt, impersonationId }`
- Y el token de impersonation NO contiene `isSuperAdmin: true` (REQ-SA-04 intacto)
- Y se crea fila en `ImpersonationLog` y en `platform_audit` con `targetOrganizationId = 'org-X'`

#### Escenario: SA sin `organizationId` y sin tenant activo → error de contexto (caso negativo)

- DADO un super-admin org-less (sin `activeTenantId` en JWT, sin `X-Tenant-ID`)
- CUANDO llama `POST /admin/impersonate` sin `organizationId` en el body
- ENTONCES recibe `403` con mensaje "Se requiere contexto de organización"
- Y NO se genera token de impersonation

#### Escenario: SA intenta impersonar a OWNER de org ajena → 403 (invariante de seguridad)

- DADO un super-admin y un usuario OWNER de `org-X`
- CUANDO el SA llama `POST /admin/impersonate` con `{ targetUserId: <owner-id>, organizationId: 'org-X' }`
- ENTONCES recibe error `IMPERSONATION_TARGET_ES_OWNER` (403)
- Y no se genera token de impersonation

#### Escenario: SA no envía `organizationId` pero tiene tenant activo → path OWNER (retrocompat)

- DADO un super-admin con `activeTenantId` en su JWT (o `X-Tenant-ID` en header)
- CUANDO llama `POST /admin/impersonate` sin `organizationId` en el body
- ENTONCES el controller resuelve org desde `resolveTenantId(req)` (path OWNER intacto)
- Y el flujo procede como antes de este change

#### Escenario: OWNER del tenant sin `organizationId` → comportamiento INTACTO (regresión)

- DADO un OWNER de `org-Y` con `activeTenantId` en su JWT
- Y un miembro no-OWNER de `org-Y`
- CUANDO el OWNER llama `POST /admin/impersonate` con `{ targetUserId, reason }` (sin `organizationId`)
- ENTONCES recibe `201` con el token de impersonation — exactamente como antes
- Y el campo `organizationId` ausente no afecta el comportamiento del OWNER

#### Escenario: super-admin impersona en org donde el target NO es miembro → 404

- DADO un super-admin con `organizationId = 'org-X'` en el body
- Y el `targetUserId` no tiene membresía en `org-X`
- CUANDO llama `POST /admin/impersonate`
- ENTONCES recibe error `IMPERSONATION_TARGET_NO_MIEMBRO` (404)
- Y no se genera token de impersonation

#### Escenario: super-admin no puede impersonarse a sí mismo (invariante intacto)

- DADO un super-admin que envía su propio `sub` como `targetUserId`
- CUANDO llama `POST /admin/impersonate`
- ENTONCES recibe error `IMPERSONATION_SELF_NO_PERMITIDA` (400)

#### Escenario: usuario regular no-miembro no puede impersonar (caso negativo — invariante §4.2)

- DADO un OWNER de `org-A` (sin `isSuperAdmin`) que envía `organizationId: 'org-B'`
- CUANDO llama `POST /admin/impersonate`
- ENTONCES `organizationId` en el body es ignorado (el caller no es SA)
- Y `resolveTenantId(req)` resuelve la org desde el contexto del caller
- Y el service rechaza la impersonation (target no es de `org-A` o caller no es OWNER de `org-B`)

#### Escenario: impersonation cross-tenant queda en `platform_audit`

- DADO un super-admin que impersona en `org-X` vía `organizationId`
- CUANDO el service completa exitosamente
- ENTONCES se crea una fila en `platform_audit` con `action = 'platform.impersonation.start'`,
  `targetOrganizationId = 'org-X'`, `actorUserId` del super-admin, y datos del usuario target en `payload`
- Y también se crea el registro normal en `ImpersonationLog` (auditoría existente intacta)

---

## Requisitos diferidos (v1.1)

Los siguientes requisitos están FUERA DE SCOPE de v1. Se documentan para evitar
implementarlos por accidente:

- **REQ-SA-UI-01** _(entregado en v1.1)_: UI `/platform-admin` implementada en el change
  `platform-admin-v1.1` (archivado 2026-06-02). Ver `openspec/specs/platform-admin-ui/spec.md`
  y `openspec/specs/platform-members/spec.md` para la especificación completa. La extensión de
  `/me/permissions` con `isSuperAdmin` se resolvió con `GET /me/platform` (org-less, REQ-PAUI-01).
- **REQ-SA-SEC-01** _(diferido)_: MFA obligatorio para cuentas `isSuperAdmin`.
- **REQ-SA-SEC-02** _(diferido)_: Allowlist de IP para super-admins.
- **REQ-SA-SEC-03** _(diferido)_: Expiración/rotación automática del privilegio super-admin.
- **REQ-SA-ROLE-01** _(diferido)_: Enum `platformRole` con niveles diferenciados
  (soporte read-only vs full). V1 es `Boolean` YAGNI.

---

## Impacto en specs vivos y docs

| Artefacto | Acción requerida al implementar |
|-----------|--------------------------------|
| `docs/claude/seguridad.md §5.4` | Reconciliar: reemplazar `role: 'super_admin'` por `isSuperAdmin` (el sujeto real). El bypass del header `X-Tenant-ID` ahora sí existe. |
| `docs/disenos/plataforma-multi-vertical.md §10.1` | Mover a "✅ CERRADA" referenciando `super-admin-plataforma.md`. |
| `docs/deudas-arquitecturales.md §3.3` | Marcar como saldada (no existe concepto de super-admin → ya existe). |

---

## Requisitos de testing (TDD estricto, CLAUDE.md §7)

Cada capacidad DEBE tener tests antes de la implementación (Strict TDD Mode activo).
Prioridad de tipo de test: integración (Postgres real) > unit.

| Capacidad | Tipo de test recomendado |
|-----------|-------------------------|
| REQ-SA-01 (modelo) | Integration: verifica `isSuperAdmin = false` en todos los usuarios tras la migration. |
| REQ-SA-02 (claim JWT) | Unit: `JwtClaims.forUser` incluye el claim; `JwtStrategy.validate` lo propaga. |
| REQ-SA-03 (revocación) | Integration: revocar flag → token activo en blocklist → 401 en siguiente request. |
| REQ-SA-04 (token impersonation) | Unit: `ImpersonationJwtClaims` NO incluye `isSuperAdmin`. |
| REQ-SA-05 (SuperAdminGuard) | Unit: super-admin pasa; no-super-admin → 403. |
| REQ-SA-06 (TenantGuard bypass) | Unit: super-admin sin membresía pasa; no-super-admin sin membresía → 403 (caso − obligatorio). |
| REQ-SA-07 (RBAC short-circuit) | Unit: super-admin matchea cualquier permiso; no-super-admin sigue flujo normal. |
| REQ-SA-08/09 (platform_audit) | Integration: cada acción de plataforma deja fila; acción de usuario regular NO deja fila. Usar `FakeClock`. |
| REQ-SA-10/11 (bootstrap) | Integration: seed idempotente; CLI grant/revoke + auditoría + blocklist. |
| REQ-SA-12 a REQ-SA-16 (endpoints) | E2E (`--runInBand --forceExit`): cada endpoint gateado — OWNER → 403; super-admin → 200/201/204. |
| REQ-SA-17 (impersonation cross-tenant) | E2E: super-admin impersona en org sin membresía; no puede impersonar OWNER; no-super-admin no-miembro → 403. |
