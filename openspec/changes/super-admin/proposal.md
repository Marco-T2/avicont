# Propuesta de cambio — Super-admin de plataforma (pasos 2-9)

> Fase SDD: **proposal**. Artifact store: hybrid (este archivo + engram `sdd/super-admin/proposal`).
> Stack afectado: **backend** (NestJS + Prisma + PostgreSQL). UI de plataforma diferida a v1.1.
> Fecha: 2026-06-01.
> Fuente de diseño: `docs/disenos/super-admin-plataforma.md` (decisión §10.1 CERRADA, no se re-abre).

---

## 1. Intent / Por qué

El **alcance de plataforma** del modelo de administración (`plataforma-multi-vertical.md` §4) —
el operador del SaaS que crea/suspende orgs, asigna entitlement (plan + verticales + packs),
administra feature flags globales (`sistema.*`) y opera cross-tenant auditado — **no tiene
sujeto en el modelo de datos**. Hoy ese poder no existe formalmente: las acciones `sistema.*` del
catálogo las matchea por accidente cualquier OWNER/ADMIN vía el wildcard del resolver
(`backend/src/common/permisos/catalogo.ts:98-109` lo documenta como deuda), y la verificación de
`X-Tenant-ID` "solo para super-admin" que describe `docs/claude/seguridad.md §5.4` **nunca se
construyó**.

La decisión §10.1 está cerrada: el super-admin es **`User.isSuperAdmin Boolean`** — identidad de
plataforma (opera POR ENCIMA de los tenants), no un `SystemRole` por-org. Este cambio **construye
los pasos 2-9** de la secuencia de `super-admin-plataforma.md §11`: modelo de datos, claim JWT con
revocación, guard de plataforma + bypass disciplinado de scoping, auditoría cross-tenant, bootstrap,
endpoints de plataforma e impersonation cross-tenant. El **paso 1** (pre-requisito bloqueante) **ya
está hecho y mergeado** (PR #118, verificado en §3) — NO entra acá.

Un `Boolean` que relaja el filtrado multi-tenant es **la mayor concentración de poder del sistema**
(`super-admin-plataforma.md §9`). El cambio se trata con ese peso: cada pieza lleva test de
seguridad con casos `+` y `−`, y toda acción del flag deja rastro auditado.

---

## 2. Scope

### Entra (pasos 2-9 de la guía §11)

1. **Modelo**: migration aditiva `User.isSuperAdmin Boolean @default(false)`, sin backfill (§3 guía).
2. **Auth**: claim `isSuperAdmin` en el JWT (`JwtPayload` + `JwtClaims.forUser` + `JwtStrategy`) e
   **invalidación inmediata de tokens activos** vía blocklist Redis al revocar el flag (§4.1 guía).
3. **Guards**:
   - `SuperAdminGuard` nuevo (verifica `req.user.isSuperAdmin === true`, 403 si no).
   - Bypass disciplinado en `TenantGuard` (acepta `X-Tenant-ID` sin exigir membresía cuando el caller
     es super-admin) y short-circuit `esSuperAdmin` en `RbacService` (igual forma que `esOwner/esAdmin`).
   - Tests `+`/`−`: un no-super-admin NO bypassea.
4. **Auditoría**: tabla `platform_audit` separada + interceptor que registra toda request con el flag
   que mute estado o acceda cross-tenant (§6 guía).
5. **Bootstrap**: seed gateado por env `SUPER_ADMIN_EMAIL` (primer operador) + comando CLI grant/revoke
   para posteriores (§5 guía).
6. **Endpoints de plataforma** (`/admin/platform/*`, gateados por `SuperAdminGuard`): listar orgs
   (read-only), crear org con OWNER designado, suspender/reactivar (`Organization.status`), asignar
   entitlement (plan + verticales + packs), y **mover `sistema.feature-flags.admin` a `SuperAdminGuard`**
   (hoy mal gateado por wildcard de OWNER/ADMIN).
7. **Impersonation cross-tenant**: rama aditiva `if isSuperAdmin` en `ImpersonationService.start()` para
   permitir impersonar en una org donde el caller NO es miembro (§4.4 guía).

### NO entra (diferido explícitamente)

- **UI `/platform-admin`** (paso 9 / §10 guía): se opera por API/Swagger en v1. La UI se enchufa en
  **v1.1** sin bloquear el valor. Recomendación de la guía respetada (construir API primero).
- **Enum `platformRole`**: v1 tiene un solo nivel de operador → `Boolean` (YAGNI, §3 guía). Migrar a
  enum cuando aparezcan niveles diferenciados (soporte read-only vs full).
- **Billing automático / cobros**: billing sigue manual; el super-admin setea el plan, el cobro es
  fuera de banda (§7 guía).
- **MFA / allowlist de IP / expiración del privilegio** para super-admins: anotado como futuro (§9 guía),
  no v1.
- **Vista "portfolio" rica** de `plataforma-multi-vertical.md §10.5`: v1 solo lista read-only de orgs.
- **Re-arquitectura del RBAC**: el short-circuit `esSuperAdmin` se agrega con la forma existente, no se
  rediseña el matcher.

---

## 3. Hallazgos de código (verificados hoy, 2026-06-01)

El código es la fuente de verdad. Las referencias `archivo:línea` de la guía son del 2026-06-01 pre-build;
las verifiqué una a una. Resultado:

### 3.1 Confirmados (la guía acierta)

| Claim de la guía | Verificación | Estado |
|---|---|---|
| `User` no tiene flag de plataforma | `schema.prisma:117-135`: solo `id, email, hashedPassword, displayName, isEmailVerified, isActive, timestamps` + relaciones. Cero flags. | ✅ |
| `TenantGuard` solo verifica membership, sin check de super-admin | `common/guards/tenant.guard.ts:29-42`: lee `X-Tenant-ID` (línea 18) y exige `Membership` activa. No hay rama super-admin. | ✅ |
| Claim JWT de plataforma no existe | `auth/domain/jwt-claims.ts:11-18`: `JwtPayload = sub, email, activeTenantId?, roles?, impersonatedBy?, impersonationId?`. Sin `isSuperAdmin`. | ✅ |
| `AuditLog.organizationId` es `NOT NULL` | `schema.prisma:322`: `organizationId String` (no opcional). Confirma el problema de auditoría cross-tenant (§6 guía). | ✅ |
| Check de `X-Tenant-ID` para super-admin nunca se implementó | `seguridad.md §5.4:56` dice "válido solo si `JWT.role === 'super_admin'`" pero ese `role` no existe en `JwtPayload` ni hay guard que lo verifique. | ✅ |
| Namespace `sistema.*` reservado, mal gateado | `catalogo.ts:98-109`: `sistema.feature-flags.admin` existe; comentario reconoce que "cualquier OWNER/ADMIN los matchea vía wildcard" y referencia la deuda §3.3. | ✅ |
| RBAC short-circuita por `esOwner/esAdmin` | `rbac.service.ts:75,85,95`: `if (perms.esOwner \|\| perms.esAdmin) return true` en `hasPermission/hasAll/hasAny`. Punto exacto para agregar `esSuperAdmin`. | ✅ |
| Bootstrap por seed es viable | `prisma/seed.ts` + `package.json:18` (`"seed": "ts-node prisma/seed.ts"`). Patrón existente para gatear por `SUPER_ADMIN_EMAIL`. | ✅ |
| `ClockPort` existe (no usar `new Date()`) | `src/common/clock/` (port + system/fake adapters). El interceptor de `platform_audit` toma el timestamp del `ClockPort`. | ✅ |

### 3.2 Difieren de la guía (CORRECCIONES — atender en spec)

1. **PASO 1 YA ESTÁ HECHO (PR #118).** La guía lo lista como pendiente bloqueante (§8, §11.1). Verificado:
   `tenants.controller.ts:38-40` — `PATCH /tenants/current` ahora exige
   `@RequirePermissions('organizacion.configuracion.update')`, y `UpdateTenantDto`
   (`dto/update-tenant.dto.ts`) **ya NO tiene `plan` ni `status`** (un comentario en el DTO referencia
   `super-admin-plataforma.md §8`). El proposal cubre solo pasos 2-9. **No re-implementar el paso 1.**

2. **Impersonation exige `SystemRole.OWNER` estricto, NO "OWNER/ADMIN".** La guía (§2 tabla, §4.4) dice
   que `impersonation.service.ts:53` "asume que el caller ya es OWNER/ADMIN del tenant destino". El
   código real (`impersonation.service.ts:53-59`) chequea
   `adminMembership.systemRole !== SystemRole.OWNER` → lanza `SoloOwnerPuedeImpersonarError`. Es **solo
   OWNER**, ADMIN no puede impersonar hoy. La rama aditiva `if isSuperAdmin` debe insertarse en ese
   chequeo (líneas 53-59), no en un check "OWNER/ADMIN" inexistente.

3. **`PermissionsGuard` YA lee `X-Tenant-ID` y deja un comentario apuntando a un guard inexistente.**
   `rbac/guards/permissions.guard.ts:35-37`: toma `tenantId` del header `X-Tenant-ID` con comentario
   *"caso super-admin con impersonation, validado en otro guard"*. Pero ese "otro guard" (el bypass de
   `TenantGuard` para super-admin) NO existe — `TenantGuard` rechaza por falta de membership ANTES de
   llegar a `PermissionsGuard`. Es decir: la infraestructura de lectura del header existe, pero la
   autorización del super-admin para usarlo no. El `SuperAdminGuard` + bypass de `TenantGuard` cierran
   ese cabo suelto que el código ya anticipaba.

4. **`/me/permissions` YA devuelve `vertical`** (no es del super-admin, pero condiciona el frontend).
   `src/me/dto/me-permissions-response.dto.ts` ya expone `vertical: 'CONTABILIDAD' | 'GRANJA' | null`
   (cambio shell-por-vertical ya mergeado). Si en v1.1 el front necesita saber `isSuperAdmin`, el lugar
   natural y barato es extender este mismo DTO (aditivo), NO una segunda llamada de red ni un claim que
   el front decodee. Anotado para la fase de UI; **no entra en este proposal**.

5. **`JwtPayload` se define en `auth/domain/jwt-claims.ts` y se re-exporta desde `auth.service.ts`.**
   `JwtStrategy` (`strategies/jwt.strategy.ts:5`) lo importa de `../auth.service`. Al agregar el claim
   `isSuperAdmin` hay que tocar **tres puntos**: la interface en `jwt-claims.ts`, el factory
   `JwtClaims.forUser` (líneas 28-51), y `JwtStrategy.validate` (líneas 18-29, que arma `req.user`). El
   `ImpersonationJwtClaims` (`domain/impersonation-jwt-claims.ts`) es otro factory de payload — decidir
   en spec si el token de impersonation puede/debe llevar `isSuperAdmin` (recomendación: NO, el token
   impersonado actúa COMO el target, sin poderes de plataforma).

6. **`ImpersonationLog.organizationId` YA es nullable** (`schema.prisma:343`: `organizationId String?`).
   Buena base para impersonation cross-tenant: el modelo ya tolera una org de destino opcional. No hay
   que migrar el log para soportar el caso super-admin.

---

## 4. Decisión arquitectural central — sujeto de plataforma en `User`

La decisión §10.1 está **cerrada** (no se re-abre): `User.isSuperAdmin Boolean`. Este proposal
**implementa** esa decisión y resuelve las decisiones de implementación que la guía deja a este nivel.

### 4.1 Por qué `User`, no `SystemRole`

`User` es identidad de plataforma; `SystemRole` es por-org (`Membership.systemRole`). El super-admin
opera POR ENCIMA de los tenants → vive en `User`. Esto evita tocar la lógica sensible de membresía y
permite un guard nuevo aislado (`SuperAdminGuard`) en vez de relajar el modelo RBAC por-org.

### 4.2 El bypass es del GUARD de tenant, no del repositorio (regla dura §4.3 guía)

El super-admin **elige en qué tenant opera** (vía `X-Tenant-ID`); dentro de ese tenant las queries
siguen scoped a ese `organizationId`. **No hay "ver dos tenants en una query".** La defensa en el repo
(CLAUDE.md §4.2, "ninguna capa confía en la anterior") permanece intacta. El bypass solo levanta la
exigencia de *membresía* en `TenantGuard`; el filtro `WHERE organizationId` del repositorio no se toca.

### 4.3 Cicatriz de revocación inmediata

Revocar `isSuperAdmin` de un usuario **debe agregar sus tokens activos a la blocklist Redis** (§5.2 core),
no esperar la expiración del JWT (1h). Un super-admin comprometido durante 1h es un incidente grave. El
grant/revoke (vía CLI/endpoint) dispara la invalidación y queda auditado en `platform_audit`.

---

## 5. Approach de alto nivel (mapeo a los pasos 2-9)

### Paso 2 — Modelo (`schema.prisma`)
- `User.isSuperAdmin Boolean @default(false)`. Migration aditiva, sin backfill (todos `false`).
- NO se expone en DTOs de respuesta de usuario común ni en el perfil (atributo de seguridad).

### Paso 3 — Auth (claim + revocación)
- `JwtPayload.isSuperAdmin?: boolean` (`jwt-claims.ts`), seteado en `JwtClaims.forUser` desde
  `user.isSuperAdmin`, propagado en `JwtStrategy.validate` a `req.user`.
- Flujo de revocación: blocklist Redis de los tokens activos del usuario (reusar el mecanismo §5.2 core).

### Paso 4 — Guards (riel de seguridad)
- `SuperAdminGuard` (~20 líneas): 403 si `req.user?.isSuperAdmin !== true`.
- `TenantGuard`: rama `if (user.isSuperAdmin) { req.tenantId = tenantId; return true; }` ANTES del check
  de membership (no exige `Membership` cuando es super-admin).
- `RbacService`: `if (perms.esOwner || perms.esAdmin || perms.esSuperAdmin) return true` en los tres
  métodos `has*`, propagando `esSuperAdmin` desde `req.user` al resolver (decidir el cableado en design:
  el flag no viene del cache RBAC por-org, viene del JWT → posiblemente el `PermissionsGuard` corta antes
  de llamar a `RbacService` si `req.user.isSuperAdmin`).
- **Tests `+`/`−` obligatorios**: super-admin sin membership pasa; no-super-admin sin membership es 403.

### Paso 5 — Auditoría (`platform_audit`)
- Tabla nueva: `actorUserId`, `action`, `targetOrganizationId String?` (cross-tenant u org-less),
  `payload Json?`, `createdAt Timestamptz`. Separada de `AuditLog` (decisión §8 abajo).
- Interceptor que registra **toda** request con `isSuperAdmin === true` que mute estado o acceda
  cross-tenant, incluidos los grants/revokes del propio flag. Timestamp vía `ClockPort`.

### Paso 6 — Bootstrap
- Seed gateado por `SUPER_ADMIN_EMAIL` (idempotente: setea `isSuperAdmin = true` si el user existe).
- Comando CLI `super-admin:grant <email>` / `:revoke <email>` para posteriores (puede exigir caller
  super-admin una vez que existe el primero). Todo grant/revoke audita en `platform_audit`.

### Paso 7 — Endpoints de plataforma (`/admin/platform/*`, `SuperAdminGuard`)
- `GET /admin/platform/orgs` (listado read-only).
- `POST /admin/platform/orgs` (crear org + designar OWNER ajeno — el `POST /tenants` self-service actual
  no cubre provisioning por operador).
- `PATCH /admin/platform/orgs/:id/status` (suspender/reactivar).
- `PATCH /admin/platform/orgs/:id/entitlement` (plan + verticales + packs).
- Mover `sistema.feature-flags.admin` (endpoint `/admin/feature-flags`) de wildcard OWNER/ADMIN a
  `SuperAdminGuard`.

### Paso 8 — Impersonation cross-tenant
- Rama aditiva en `ImpersonationService.start()` (líneas 53-59): si el caller `isSuperAdmin`, saltear el
  requisito de `SystemRole.OWNER` en la org destino (que el caller probablemente ni es miembro). Resto
  del flujo (doble auditoría, ventana 30 min, no impersonar OWNER) intacto.
- Decidir en design: el token de impersonation NO debe llevar `isSuperAdmin` (actúa COMO el target).

### Paso 9 — UI (DIFERIDA v1.1)
- Fuera de scope. Se opera por API/Swagger. Cuando se construya, extender `/me/permissions` con
  `isSuperAdmin` (hallazgo §3.2.4), no decodificar el JWT en el front.

---

## 6. Riesgos y mitigación

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| **Bypass del filtrado multi-tenant** | Concentración máxima de poder; fuga cross-tenant si se filtra mal | Bypass acotado al guard de tenant, NO al repo (§4.2). Tests `+`/`−`. Defensa en repo intacta. |
| **Super-admin comprometido** vive 1h con el JWT | Incidente grave | Revocación inmediata vía blocklist Redis (§4.3), no esperar expiración. |
| **Auto-asignación del flag** | Escalada de privilegios | Ningún endpoint permite auto-grant. Bootstrap solo por seed/CLI controlado. |
| **Acción sin rastro** | Auditoría rota | `platform_audit` obligatorio para toda request con el flag (§5 paso 5). |
| **El short-circuit `esSuperAdmin` se cuela en queries de dominio** | Dominio "normal" hereda el bypass | El short-circuit es solo en `RbacService.has*` (autorización), no en los repos. Las queries siguen scoped por `organizationId`. |
| **Impersonation cross-tenant abre puerta a impersonar OWNERs** | Toma de control | Mantener `TargetEsOwnerError` (no impersonar OWNER) también para super-admin. |
| **Token de impersonation con poderes de plataforma** | Escalada durante soporte | El token impersonado NO lleva `isSuperAdmin` (actúa como target). |
| **Drift docs**: al implementar, `seguridad.md §5.4` queda obsoleto (`role: 'super_admin'`) | Confusión futura | Reconciliar §5.4 con `isSuperAdmin` y §10.1 plataforma a "✅ CERRADA" (guía §13). |

---

## 7. Preguntas abiertas (para Marco, antes de specs)

Las que NO bloquean specs pero conviene cerrar (alineadas con §12 de la guía):

1. **Cableado del short-circuit RBAC**: ¿el `PermissionsGuard` corta apenas detecta
   `req.user.isSuperAdmin` (sin tocar `RbacService`), o se propaga `esSuperAdmin` al `RbacService` para
   centralizar? Recomendación: cortar en el guard (el flag viene del JWT, no del cache por-org) y
   además agregar `esSuperAdmin` al `ResolvedPermissions` por si algún consumidor llama `RbacService`
   directo. A cerrar en design.
2. **`isSuperAdmin` en el token de impersonation**: confirmar que NO se incluye (el operador actúa COMO
   el target). Recomendación: NO incluirlo.
3. **Nombre del comando CLI y mecanismo de revocación de tokens**: ¿reusar el blocklist existente por
   `jti`/`sub`? A definir contra el código del blocklist en design.

> Ninguna BLOQUEA el avance a specs. Estado: **ok**, no blocked.

---

## 8. Decisiones a cerrar (de §12 de la guía — con recomendación)

| Tema | Recomendación | Fundamento |
|---|---|---|
| **`Boolean` vs enum `platformRole`** | **`Boolean`** en v1 | Un solo nivel de operador hoy. YAGNI. Migrar a enum cuando aparezcan niveles diferenciados (soporte read-only vs full). Decisión cerrada por la guía §3. |
| **`AuditLog` nullable vs tabla `platform_audit`** | **Tabla `platform_audit` separada** | La acción cross-tenant es un evento de PLATAFORMA, no de un tenant. Relajar `AuditLog.organizationId` a nullable contaminaría el modelo de auditoría por-tenant con filas "sin org". `AuditLog.organizationId` es `NOT NULL` hoy (verificado `schema.prisma:322`) — separar evita una migración invasiva sobre una tabla central. |
| **MFA / allowlist IP** | **Diferido**, anotado | No v1. Disparador: múltiples operadores o clientes con datos sensibles. |
| **Crear org y designar OWNER ajeno** | **Construir en paso 7** | El `POST /tenants` self-service deja al creador como OWNER; el operador necesita designar a OTRO. |
| **¿Super-admin puede ser miembro normal de orgs?** | **Sí (ortogonal)** | El flag es de plataforma; las membresías son aparte. No hay conflicto. |
| **¿El token de impersonation lleva `isSuperAdmin`?** | **No** (nuevo, §7) | El operador impersonado actúa COMO el target, sin poderes de plataforma. Evita escalada. |

---

## 9. Impacto en tests

Strict TDD (test primero) en todo lo que toque dominio/auth (CLAUDE.md §7, guía §11):

- **Migration/modelo**: integración que verifica `isSuperAdmin` default `false` y que ningún user
  existente quedó en `true` tras el backfill (no hay backfill → todos `false`).
- **Auth (claim)**: `JwtClaims.forUser` incluye `isSuperAdmin` cuando el user lo tiene; `JwtStrategy`
  lo propaga a `req.user`. Token de usuario regular → `isSuperAdmin` ausente/false.
- **Guards (`+`/`−`)**:
  - `SuperAdminGuard`: super-admin pasa; no-super-admin → 403.
  - `TenantGuard`: super-admin sin membership en org X pasa; **no-super-admin sin membership → 403**
    (el caso `−` es el invariante de seguridad crítico, CLAUDE.md §4.2).
  - `RbacService`/`PermissionsGuard`: super-admin matchea cualquier permiso; no-super-admin sigue el
    matcher normal.
- **Revocación**: revocar el flag invalida tokens activos (blocklist Redis) — test de integración.
- **Auditoría**: toda request con el flag que muta estado deja fila en `platform_audit`; grants/revokes
  también. Timestamp vía `ClockPort` (fake clock en test).
- **Bootstrap**: seed con `SUPER_ADMIN_EMAIL` es idempotente (corre dos veces → un solo super-admin).
- **Endpoints de plataforma**: e2e gateados por `SuperAdminGuard` (un OWNER normal → 403); crear org
  con OWNER ajeno; suspender/reactivar; asignar entitlement.
- **Impersonation cross-tenant**: super-admin impersona en org donde NO es miembro (caso `+`); sigue sin
  poder impersonar a un OWNER (`TargetEsOwnerError` se mantiene); un no-super-admin no-miembro → error.

---

## 10. Resumen ejecutivo

Se construye el **sujeto de plataforma** que hoy no existe: `User.isSuperAdmin Boolean`, propagado al
JWT con revocación inmediata vía blocklist, autorizado por un `SuperAdminGuard` nuevo y un **bypass
disciplinado** del `TenantGuard` (relaja solo la exigencia de membresía, NO el filtro `organizationId`
del repo) más un short-circuit `esSuperAdmin` en el RBAC con la misma forma que `esOwner/esAdmin`. Toda
acción del flag se audita en una **tabla `platform_audit` separada** (no se relaja `AuditLog`, que es
`NOT NULL` por-org). El bootstrap es por seed gateado con `SUPER_ADMIN_EMAIL` + CLI grant/revoke. Sobre
ese riel se enchufan los endpoints de plataforma (`/admin/platform/*`: listar/crear/suspender orgs,
asignar entitlement, mover feature-flags-admin) y la impersonation cross-tenant (rama aditiva en
`ImpersonationService.start()`). El **paso 1 ya está hecho (PR #118)** y la **UI se difiere a v1.1**.
Correcciones clave a la guía: impersonation exige `SystemRole.OWNER` estricto (no "OWNER/ADMIN"),
`PermissionsGuard` ya lee `X-Tenant-ID` apuntando a un guard que este cambio construye, y
`/me/permissions` ya devuelve `vertical` (el lugar para `isSuperAdmin` en v1.1). Próxima fase: **sdd-spec**.
