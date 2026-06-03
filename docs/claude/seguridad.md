<!--
Última edición: 2026-06-03
Última revisión contra core: 2026-06-02
Owner: backend-lead
-->
<!-- Actualizado: enforcement de Organization.status vía OrgStatusGuard APP_GUARD (change org-status-enforcement 2026-06-02) -->
<!-- Actualizado: removida referencia a AuditLog en switch-tenant (audit genérico eliminado, PR #166 2026-06-03) -->
<!-- Actualizado: revocación de access tokens generalizada a todos los usuarios (change logout-all 2026-06-02) -->

# Seguridad y permisos — detalle

> Este doc expande los invariantes de seguridad del `CLAUDE.md` (multi-tenant
> estricto, defense in depth). Acá viven las decisiones concretas sobre
> tokens, rotación, impersonation y switch de tenant.
>
> **Cuándo leer este doc**: antes de editar código en
> `backend/src/{auth,memberships,invitations}/**` o cualquier código
> que toque JWT / refresh / impersonation / `tenantId` / guards de permisos.
>
> **Regla anti-drift**: si al editar este doc descubrís algo que contradice
> el invariante "multi-tenant estricto" del core, el cambio debe ir primero
> al core (CLAUDE.md §4-core) y recién después propagarse acá.

---

## 5. Seguridad y permisos

### 5.1 Tokens

| Aspecto | Decisión |
|---------|----------|
| **Access token** | JWT firmado, vida 1h, revocable vía blocklist Redis |
| **Refresh token** | Hash SHA-256 en Postgres, rotativo con detección de reuso, 30 días |
| **Fuente de `tenantId`** | `JWT.activeTenantId`; header `X-Tenant-ID` solo si `JWT.isSuperAdmin === true` |
| **Switch de tenant** | Endpoint explícito `POST /auth/switch-tenant`, emite JWT nuevo, auditado |
| **Impersonation** | Flujo explícito, JWT dedicado 30 min, auditoría doble |
| **Resolución por subdomain** | Descartada, remover del starter |

### 5.2 Access token (JWT)

- Vida 1h. 15 min es overkill; 4h es laxo para sistema con plata.
- Firmado con `JWT_ACCESS_SECRET`. Algoritmo HS256 (el starter viene así).
- Claims mínimos: `sub` (userId), `email`, `activeTenantId`, `roles`, `iat`, `exp`.
- **Revocación inmediata (mecanismo epoch por usuario)**: clave Redis `saas:revoked:access:{userId}`, TTL 1h. `JwtStrategy.validate` consulta la clave para TODOS los usuarios (no solo super-admins) en cada request. Si `revokedAtMs > iat * 1000` → `UnauthorizedException`. Se escribe en: `AuthService.logoutAll` (self logout-all) y `revocarTokensSuperAdmin` (revoke de super-admin). El CLI de revoke escribe la misma clave directamente. Change `logout-all` (2026-06-02). Ver `design.md Decisiones B y C` en `openspec/changes/logout-all/design.md`.
- **`POST /auth/logout-all`** (self-only): escribe el epoch + revoca todos los refresh tokens activos del usuario en BD. Responde 204. Sin parámetro userId — opera sobre `req.user.sub`.

### 5.3 Refresh token

- Token opaco (no JWT), 256 bits de entropía, enviado al cliente una sola vez.
- **Almacenado hasheado** (SHA-256) en tabla `RefreshToken`: `{ tokenHash, userId, tenantId?, familyId, expiresAt, revokedAt?, replacedById? }`.
- **Rotación obligatoria**: cada uso emite nuevo token y marca el anterior como `replacedById`.
- **Detección de reuso**: si llega un refresh ya rotado (su `replacedById` no es null), **revocar toda la familia** (todos los tokens con ese `familyId`). Caso clásico de token robado.
- Vida 30 días.
- Logout en un dispositivo: revoca el token actual. Logout en todos: revoca toda la familia del usuario.

### 5.4 Resolución de `tenantId` en un request autenticado

**Precedencia:**
1. `JWT.activeTenantId` — fuente normal para usuarios regulares.
2. Header `X-Tenant-ID` — válido **solo si** `JWT.isSuperAdmin === true` (claim booleano en el JWT), siempre con auditoría. El `TenantGuard` implementa un bypass disciplinado para este caso: si `user.isSuperAdmin === true`, saltea el lookup de `Membership` y setea `req.tenantId` directamente desde el header. **El bypass relaja SOLO la exigencia de pertenencia (`Membership`): el filtro `WHERE organizationId` de los repositorios sigue scoped a ese `tenantId` concreto** — el super-admin no obtiene lectura global cross-tenant, sino acceso a un tenant del que no es miembro. Comparación estricta `=== true` (un valor truthy como `1` no activa el bypass). Ver `src/common/guards/tenant.guard.ts` y `docs/disenos/super-admin-plataforma.md §4.3`.
3. Subdomain — **eliminar del starter** (no se usa).

Un usuario puede pertenecer a varios tenants con roles distintos. La tabla `Membership` refleja eso.

> **Nota implementación**: el campo `isSuperAdmin` es un `Boolean` en la tabla `users` (no un `SystemRole` por-membership). El claim se incluye en el JWT **solo cuando es `true`** (spread condicional en `JwtClaims.forUser`). Los tokens de impersonation **no heredan** el claim `isSuperAdmin` — `ImpersonationJwtClaims.forImpersonation` no lo incluye (REQ-SA-04).

### 5.5 Switch de tenant

```
POST /auth/switch-tenant
Body: { tenantId: string }
```

Flujo:
1. Verificar que el usuario tiene `Membership` en ese tenant.
2. Emitir nuevo access token con `activeTenantId` actualizado.

Los refresh tokens existentes no se invalidan. El cliente descarta el access token viejo.

### 5.6 Impersonation (admin entra a cuenta de otro usuario)

**Flujo explícito, nunca implícito.**

```
POST /admin/impersonate
Body: { targetUserId: string, reason: string }
Response: { impersonationToken: string, expiresAt: string }
```

- Backend emite JWT especial:
  - `sub = targetUserId` (el impersonado).
  - Claim `impersonatedBy = adminUserId` (el admin real).
  - Claim `impersonationId` (UUID único de la sesión).
  - Vida 30 min. **No refrescable.**
- Cada acción durante la sesión se audita **en dos lugares**:
  - Tabla del dominio (`userId = impersonado`).
  - Tabla `AccionImpersonada` (`adminRealId, impersonationId, accion, timestamp`).
- Cierre explícito: `POST /admin/impersonate/end`.

**Restricciones de impersonation:**

- No impersonar a otro super-admin.
- No impersonar usuarios desactivados.
- No abrir una impersonation sin cerrar la anterior (máximo una activa por admin).

**Acciones prohibidas durante impersonation aunque el rol permita:**

- Cambiar email/password del impersonado.
- Emitir tokens API en nombre del impersonado.
- Modificar billing del tenant.

### 5.7 Defense in depth

- **Guard (JWT + Permisos)**: primera línea. Rechaza requests sin auth o con permisos insuficientes.
- **`OrgStatusGuard` (`APP_GUARD`)**: segunda línea. Bloquea mutaciones (POST/PUT/PATCH/DELETE) en orgs SUSPENDED/ARCHIVED → 403. Lecturas siempre pasan. SuperAdmin bypassa. Ver `src/common/guards/org-status.guard.ts` y `openspec/specs/org-status-enforcement/`. Change `org-status-enforcement` (2026-06-02).
- **Servicio**: usa `TenantContext` inyectado para enforce `tenantId` en queries.
- **Repositorio**: todo método de repositorio recibe `tenantId` como parámetro obligatorio y lo añade al `where`. Un método sin filtro por `tenantId` es **bug de seguridad** y debe romper tests.

Ninguna capa confía en que la anterior hizo su trabajo.

### 5.8 Secrets y configuración

- Nunca commitear secrets al repo. `.env` en `.gitignore`, `.env.example` con placeholders.
- Secrets obligatorios: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, `REDIS_PASSWORD` (si aplica).
- Var de entorno obligatoria para CORS: `FRONTEND_URL` (ej. `http://localhost:5173` en dev). CORS se abre con `credentials: true` **solo** a ese origin — necesario para que la cookie `refreshToken` viaje entre frontend y backend.
- Rotación de secrets documentada en `docs/security/secret-rotation.md` (pendiente).
