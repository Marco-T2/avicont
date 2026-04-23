<!--
Última edición: 2026-04-23
Última revisión contra core: 2026-04-23
Owner: backend-lead
-->

# Seguridad y permisos — detalle

> Este doc expande los invariantes de seguridad del `CLAUDE.md` (multi-tenant
> estricto, defense in depth). Acá viven las decisiones concretas sobre
> tokens, rotación, impersonation y switch de tenant.
>
> **Cuándo leer este doc**: antes de editar código en
> `backend/src/modules/{auth,memberships,invitations}/**` o cualquier código
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
| **Fuente de `tenantId`** | `JWT.activeTenantId`; header `X-Tenant-ID` solo para super-admin |
| **Switch de tenant** | Endpoint explícito `POST /auth/switch-tenant`, emite JWT nuevo, auditado |
| **Impersonation** | Flujo explícito, JWT dedicado 30 min, auditoría doble |
| **Resolución por subdomain** | Descartada, remover del starter |

### 5.2 Access token (JWT)

- Vida 1h. 15 min es overkill; 4h es laxo para sistema con plata.
- Firmado con `JWT_ACCESS_SECRET`. Algoritmo HS256 (el starter viene así).
- Claims mínimos: `sub` (userId), `email`, `activeTenantId`, `roles`, `iat`, `exp`.
- **Revocación inmediata**: blocklist en Redis, key `saas:revoked:access:{jti}`, TTL = `exp - now`. El guard consulta la blocklist en cada request (una sola roundtrip a Redis).

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
2. Header `X-Tenant-ID` — válido **solo si** `JWT.role === 'super_admin'`, siempre con auditoría.
3. Subdomain — **eliminar del starter** (no se usa).

Un usuario puede pertenecer a varios tenants con roles distintos. La tabla `Membership` refleja eso.

### 5.5 Switch de tenant

```
POST /auth/switch-tenant
Body: { tenantId: string }
```

Flujo:
1. Verificar que el usuario tiene `Membership` en ese tenant.
2. Emitir nuevo access token con `activeTenantId` actualizado.
3. Registrar en `AuditLog` el switch: `{ userId, fromTenantId, toTenantId, timestamp }`.

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
- **Servicio**: usa `TenantContext` inyectado para enforce `tenantId` en queries.
- **Repositorio**: todo método de repositorio recibe `tenantId` como parámetro obligatorio y lo añade al `where`. Un método sin filtro por `tenantId` es **bug de seguridad** y debe romper tests.

Ninguna capa confía en que la anterior hizo su trabajo.

### 5.8 Secrets y configuración

- Nunca commitear secrets al repo. `.env` en `.gitignore`, `.env.example` con placeholders.
- Secrets obligatorios: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, `REDIS_PASSWORD` (si aplica).
- Var de entorno obligatoria para CORS: `FRONTEND_URL` (ej. `http://localhost:5173` en dev). CORS se abre con `credentials: true` **solo** a ese origin — necesario para que la cookie `refreshToken` viaje entre frontend y backend.
- Rotación de secrets documentada en `docs/security/secret-rotation.md` (pendiente).
