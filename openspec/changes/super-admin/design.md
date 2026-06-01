# Design: super-admin

<!--
Última edición: 2026-06-01
Última revisión contra core: 2026-06-01
Owner: backend-lead
-->

> Fase: design
> Change: `super-admin`
> Proyecto: avicont (backend NestJS + Prisma + PostgreSQL)
> Proposal hermana: `openspec/changes/super-admin/proposal.md`
> **Fuente arquitectural**: `docs/disenos/super-admin-plataforma.md` (guía §10.1, decisión CERRADA).

---

## 0. Alcance de este documento

Este design **NO duplica** la guía `docs/disenos/super-admin-plataforma.md`. La guía
fija el QUÉ y el porqué (decisión §10.1: `User.isSuperAdmin Boolean`; modelo de
autorización §4; auditoría §6; bootstrap §5; alcance funcional §7). Acá se cierran las
**8 decisiones de implementación** que el proposal destapó, con la **forma concreta del
código** (firmas, esqueletos, orden de guards, migración) verificada contra el código
real al 2026-06-01.

**Regla aplicada**: el código es la fuente de verdad. Donde la guía contradice al
código, gana el código y se anota (ver §0.1). NO se escribe código de producción acá;
se muestran firmas/esqueletos.

### 0.1 Correcciones a la guía detectadas en el código (atender en spec/tasks)

| # | La guía / CLAUDE.md dice | El código real dice | Consecuencia en el design |
|---|---|---|---|
| C-1 | "Access token revocable vía **blocklist Redis** (§5.2 core / CLAUDE.md §10.4)" | **NO existe blocklist de access tokens.** `RedisService` solo tiene `get/set/del/incr/hget/hset` (sin `sadd/sismember`). Solo los **refresh tokens** se revocan, y en **DB** (`prisma-credentials.repository.ts`), no en Redis. El JWT se firma **sin `jti`** (`auth.service.ts:102`). | La "blocklist" hay que **construirla** como parte de este change. Se diseña como un **per-user revocation epoch** en Redis chequeado en `JwtStrategy.validate`. Ver Decisión 4. NO se puede revocar "por token" porque no hay `jti`; se revoca por `sub`. |
| C-2 | Impersonation "asume caller OWNER/ADMIN del tenant destino" | `impersonation.service.ts:57` exige **`SystemRole.OWNER` estricto** → `SoloOwnerPuedeImpersonarError`. ADMIN no puede. | La rama aditiva se inserta exactamente en ese check (líneas 53-59). Ver Decisión 7. |
| C-3 | `PermissionsGuard` "valida X-Tenant-ID en otro guard" | `permissions.guard.ts:35-37` ya lee `X-Tenant-ID` con comentario apuntando a un guard que **no existe**. `TenantGuard` rechaza por membership ANTES. | El bypass de `TenantGuard` (Decisión 2) cierra ese cabo. El short-circuit RBAC (Decisión 1) hace que `hasAllPermissions` ni siquiera necesite resolver permisos por-org para el super-admin. |
| C-4 | Guard chain "global" | Los guards son **per-controller** (`@UseGuards(...)`), NO globales (`app.module.ts:94-98`: solo `ThrottlerGuard` es `APP_GUARD`). Orden típico: `JwtAuthGuard → TenantGuard → [ModuleEnabledGuard] → PermissionsGuard`. | `SuperAdminGuard` se aplica per-controller en `/admin/platform/*`. Ver Decisión 3. |
| C-5 | `JwtPayload` vive en `auth/domain/jwt-claims.ts` | Confirmado, y se **re-exporta** desde `auth.service.ts:31` (`export type { JwtPayload }`); `JwtStrategy` lo importa de `../auth.service` (`jwt.strategy.ts:5`). | Tocar el claim = 3 puntos: interface `jwt-claims.ts`, factory `JwtClaims.forUser`, `JwtStrategy.validate`. Ver Decisión 4. |

---

## 1. Decisión 1 — Short-circuit RBAC: cortar en `PermissionsGuard`, NO en el resolver

### Elección

**Cortar en `PermissionsGuard` apenas detecta `req.user.isSuperAdmin === true`, ANTES
de llamar a `RbacService`.** Además, agregar `esSuperAdmin: boolean` a
`ResolvedPermissions` y honrarlo en los tres `has*` de `RbacService` como red de
seguridad para consumidores que llamen al servicio directo.

### Fundamento

El patrón `esOwner/esAdmin` del resolver (`rbac.service.ts:75,85,95`) deriva del
**`Membership` por-org** (cache RBAC keyed por `userId+organizationId`). El
super-admin **NO es una propiedad por-org**: es identidad de plataforma que viaja en el
**JWT** (`req.user`), no en el cache RBAC. Forzar `esSuperAdmin` dentro de
`resolver.resolve(userId, organizationId)` obligaría al resolver a leer `User.isSuperAdmin`
de la BD en cada resolución (round-trip extra) y a invalidar el cache RBAC del super-admin
en cada org — acoplamiento espurio. El flag ya está en `req.user`; el lugar natural para
consumirlo es el guard que tiene acceso a `req`.

Cortar en el guard también evita poblar/leer el cache RBAC para el super-admin (que
matchea TODO de todas formas), y deja el short-circuit del servicio como **defensa en
profundidad** para el caso teórico de un caller que invoque `RbacService` sin pasar por
`PermissionsGuard`.

### Forma del código

`rbac/guards/permissions.guard.ts` (MODIFICADO) — short-circuit al tope:

```ts
const request = context.switchToHttp().getRequest();
const user = request.user as
  | { sub?: string; activeTenantId?: string; isSuperAdmin?: boolean }
  | undefined;
if (!user?.sub) throw new UnauthorizedException('No autenticado');

// Super-admin de plataforma: corto-circuita el matcher de permisos por-org.
// El flag viene del JWT (req.user), NO del cache RBAC por-org. Coherente con
// el short-circuit esOwner/esAdmin del resolver, pero a nivel de identidad de
// plataforma (docs/disenos/super-admin-plataforma.md §4.3).
if (user.isSuperAdmin === true) return true;
```

`rbac/ports/permissions-resolver.port.ts` (MODIFICADO) — agregar el flag al contrato:

```ts
export interface ResolvedPermissions {
  esOwner: boolean;
  esAdmin: boolean;
  esSuperAdmin: boolean; // NUEVO — default false en el resolver por-org
  wildcards: string[];
}
```

`rbac/rbac.service.ts` (MODIFICADO) — honrar el flag en los tres `has*` y en `EMPTY`:

```ts
const EMPTY: ResolvedPermissions = {
  esOwner: false, esAdmin: false, esSuperAdmin: false, wildcards: [],
};

// en hasPermission / hasAllPermissions / hasAnyPermission:
if (perms.esOwner || perms.esAdmin || perms.esSuperAdmin) return true;
```

> Nota: el resolver por-org (`PrismaPermissionsResolver`) seteará
> `esSuperAdmin: false` siempre — el super-admin NO se resuelve por membership. El
> campo existe en `ResolvedPermissions` solo para el camino de defensa en profundidad;
> el camino real es el short-circuit del guard. (Alternativa considerada: NO tocar
> `ResolvedPermissions` y cortar solo en el guard. Se agrega igual el campo por
> coherencia del contrato y para que un test pueda forzar el caso, pero NO se cablea
> ninguna lectura de `User.isSuperAdmin` en el resolver.)

---

## 2. Decisión 2 — Bypass de `TenantGuard`: relaja membership, NO el filtro `WHERE organizationId`

### Elección

En `TenantGuard.canActivate`, **antes** del lookup de `Membership`, si
`req.user?.isSuperAdmin === true` se acepta el `X-Tenant-ID` indicado y se setea
`req.tenantId` **sin exigir membresía**. El filtro `WHERE organizationId` de los
repositorios **NO se toca** — sigue scoped al `tenantId` elegido (defensa en
profundidad CLAUDE.md §4.2 intacta).

### Fundamento

El bypass es **del guard de tenant** (la exigencia de membresía), no del scoping de
datos (guía §4.3: *"el super-admin no ve dos tenants a la vez en una query; cambia de
tenant explícitamente"*). El super-admin elige EN QUÉ tenant opera vía header; dentro de
ese tenant, las queries siguen filtrando por ese único `organizationId`. Ninguna query de
dominio hereda el bypass: `req.tenantId` se setea a UN valor concreto.

### Forma del código

`common/guards/tenant.guard.ts` (MODIFICADO):

```ts
const headerTenantId = req.headers['x-tenant-id'] as string | undefined;
const user = req.user as
  | { sub?: string; activeTenantId?: string; isSuperAdmin?: boolean }
  | undefined;
const tenantId = headerTenantId || user?.activeTenantId;
if (!tenantId) throw new ForbiddenException('Tenant context is required');

req.tenantId = tenantId;

// Bypass disciplinado de membresía para super-admin (docs/disenos/super-admin-
// plataforma.md §4.3). Acota SOLO la exigencia de Membership: el filtro
// WHERE organizationId del repositorio sigue scoped a este tenantId concreto.
// El super-admin elige en QUÉ tenant opera, no ve dos a la vez.
if (user?.isSuperAdmin === true) return true;

if (user?.sub) {
  const membership = await this.prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: tenantId, userId: user.sub } },
  });
  if (!membership || membership.deactivatedAt) {
    throw new ForbiddenException('You are not a member of this tenant');
  }
}
return true;
```

### Invariante de test (CRÍTICO, casos + y −)

- **+**: super-admin con `X-Tenant-ID` de una org donde NO es miembro → pasa.
- **−**: **no-super-admin** sin membresía en esa org → 403 (invariante de seguridad
  CLAUDE.md §4.2 — el caso negativo es el que más importa).
- El bypass NUNCA se activa si `req.user.isSuperAdmin` no es exactamente `=== true`
  (un `truthy` no basta; comparación estricta).

---

## 3. Decisión 3 — `SuperAdminGuard`: ubicación, qué lee, orden en la cadena

### Elección

`SuperAdminGuard` vive en **`backend/src/common/guards/super-admin.guard.ts`** (junto a
`tenant.guard.ts` y `jwt-auth.guard.ts`). Lee `req.user.isSuperAdmin`; 403 si no es
`=== true`. Se aplica **per-controller** (no global), DESPUÉS de `JwtAuthGuard`.

### Fundamento

Los guards del proyecto son per-controller vía `@UseGuards` (corrección C-4); no hay
cadena global salvo `ThrottlerGuard`. `SuperAdminGuard` es transversal (gatea endpoints
de plataforma de cualquier módulo) → vive en `common/guards/` como sus hermanos.

**Orden en `/admin/platform/*`**: `JwtAuthGuard → SuperAdminGuard → TenantGuard`.
- `JwtAuthGuard` primero (sin token válido → 401, no 403).
- `SuperAdminGuard` segundo: si no es super-admin, 403 inmediato sin tocar tenant.
- `TenantGuard` al final SOLO en endpoints que operan sobre una org concreta vía
  `X-Tenant-ID` (suspend/entitlement) — y ahí el bypass de Decisión 2 lo deja pasar sin
  membresía. Los endpoints org-less (listar todas las orgs, crear org) **NO** usan
  `TenantGuard`.
- **NO** se usa `PermissionsGuard` en `/admin/platform/*`: la autorización es el flag, no
  un permiso del catálogo por-org.

### Forma del código

`common/guards/super-admin.guard.ts` (NUEVO, ~18 líneas):

```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as { isSuperAdmin?: boolean } | undefined;
    if (user?.isSuperAdmin !== true) {
      // Mismo cuerpo de error que el resto: no se filtra la existencia del recurso.
      throw new ForbiddenException('Se requiere privilegio de plataforma');
    }
    return true;
  }
}
```

Uso en el controller de plataforma (Decisión 7):

```ts
@Controller('admin/platform')
@UseGuards(JwtAuthGuard, SuperAdminGuard) // TenantGuard solo en handlers org-scoped
export class PlatformAdminController { ... }
```

### Re-gating de `/admin/feature-flags` (paso 7 guía)

`feature-flags-admin.controller.ts` HOY usa
`@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)` +
`@RequirePermissions('sistema.feature-flags.admin')` (mal gateado: cualquier OWNER/ADMIN
matchea por wildcard). Cambia a:

```ts
@UseGuards(JwtAuthGuard, SuperAdminGuard)
// se elimina @RequirePermissions('sistema.feature-flags.admin') y TenantGuard
```

El catálogo `sistema.feature-flags.admin` (`catalogo.ts:98-109`) queda reservado pero
deja de ser la vía de autorización del endpoint; actualizar su comentario para reflejar
que ahora gatea `SuperAdminGuard`.

---

## 4. Decisión 4 — Claim + revocación: 3 puntos del claim + epoch de revocación en Redis

### 4.1 El claim (3 puntos)

`auth/domain/jwt-claims.ts` (MODIFICADO):

```ts
export interface JwtPayload {
  sub: string;
  email: string;
  activeTenantId?: string;
  roles?: string[];
  impersonatedBy?: string;
  impersonationId?: string;
  isSuperAdmin?: boolean; // identidad de plataforma; ausente/false en tokens normales
}

// JwtClaims.forUser — agregar param + spread condicional (exactOptionalPropertyTypes):
static forUser(params: {
  userId: string;
  email: string;
  activeTenantId?: string;
  roles?: string[];
  isSuperAdmin?: boolean; // NUEVO
}): JwtClaims {
  // ...validaciones existentes...
  const payload: JwtPayload = {
    sub: params.userId,
    email: params.email,
    roles: params.roles ?? [],
    ...(params.activeTenantId !== undefined ? { activeTenantId: params.activeTenantId } : {}),
    ...(params.isSuperAdmin === true ? { isSuperAdmin: true } : {}), // solo si true
  };
  return new JwtClaims(payload);
}
```

> Solo se incluye el claim cuando es `true` (no se ensucia el token de usuarios
> normales con `isSuperAdmin: false`). `exactOptionalPropertyTypes` exige spread
> condicional, no `isSuperAdmin: undefined`.

`auth/strategies/jwt.strategy.ts` (MODIFICADO) — propagar a `req.user`:

```ts
validate(payload: JwtPayload) {
  return {
    sub: payload.sub,
    email: payload.email,
    activeTenantId: payload.activeTenantId,
    roles: payload.roles,
    isSuperAdmin: payload.isSuperAdmin === true, // normaliza a boolean
    impersonatedBy: payload.impersonatedBy,
    impersonationId: payload.impersonationId,
  };
}
```

`auth/auth.service.ts` (MODIFICADO) — los 3 call sites de `JwtClaims.forUser` (login
~95, refresh ~127, switchTenant ~160) deben pasar `isSuperAdmin` desde el `User`.
`login`/`switchTenant` ya cargan el `User`/membership; `refresh` carga por `stored.userId`
— hay que leer el flag del user. Decisión: el `MembershipsReaderPort`/`UsersReaderPort`
que ya devuelve datos del user expone `isSuperAdmin`, o se agrega un lookup mínimo. Se
cierra el cableado exacto en **tasks** (es mecánico, no arquitectural).

### 4.2 Revocación inmediata — epoch por usuario en Redis (NO "blocklist por jti")

**Corrección C-1**: no hay blocklist de access tokens ni `jti` en el JWT. Construir una
blocklist por-token exigiría agregar `jti` y trackear cada token emitido — sobre-diseño
para v1. La forma correcta y barata para "invalidar TODOS los tokens activos de un
usuario al revocar su flag" es un **revocation epoch por `sub`** en Redis:

- **Al revocar** `isSuperAdmin` (CLI/endpoint, Decisión 8): escribir en Redis
  `superadmin:revoked:<userId> = <now-ms>` con TTL = vida del access token (1h), vía
  `RedisService.set(key, ts, 3600)`. El timestamp lo da `ClockPort` (no `new Date()`).
- **En `JwtStrategy.validate`**, si el token trae `isSuperAdmin === true`, chequear que
  NO exista una marca de revocación más nueva que el `iat` del token. Si existe →
  el strategy descarta el claim de plataforma (o lanza `UnauthorizedException` según el
  caso). Como `passport-jwt` expone `iat` en el payload, la comparación es
  `revokedAt <= iat * 1000 ? válido : revocado`.

> Por qué epoch y no set por jti: invalida TODOS los tokens del usuario de una sola
> escritura, sin enumerar tokens, sin agregar `jti`, y se auto-limpia por TTL (pasada
> 1h ningún token viejo sigue vivo, la marca ya no hace falta). Reusa el `RedisService`
> existente (`set`/`get`) — NO requiere `sadd/sismember`.

> **Cicatriz documentada**: CLAUDE.md §10.4 dice "access token revocable vía blocklist
> Redis" — hoy ESO NO EXISTE para access tokens (solo refresh en DB). Este change
> construye la primera revocación real de access tokens (acotada al claim de
> plataforma). Anotar en tasks que §10.4 describe capacidad aún no construida para el
> caso general; acá se construye solo para `isSuperAdmin`. Generalizarla a logout-all /
> cambio de password es deuda separada (no de este change).

`JwtStrategy` necesita inyectar `RedisService` (hoy no inyecta nada salvo `ConfigService`)
y `ClockPort`. Se cierra el wiring en tasks.

---

## 5. Decisión 5 — `platform_audit`: tabla separada + interceptor

### Elección

**Tabla `platform_audit` SEPARADA** (NO relajar `AuditLog.organizationId` a nullable).
Captura vía **interceptor** dedicado, no por servicio disperso.

### Fundamento

- `AuditLog.organizationId` es `NOT NULL` (`schema.prisma:322`) con FK a `Organization`
  (`onDelete: Cascade`) e índices `[organizationId, ...]`. Relajarlo a nullable
  contaminaría el modelo de auditoría **por-tenant** con filas "sin org" y exigiría una
  migración invasiva sobre una tabla central con triggers/índices que la asumen NOT NULL.
- La acción del super-admin es un **evento de plataforma** (puede ser org-less: "listó
  todos los tenants"), conceptualmente distinto de la auditoría de un tenant. Tabla
  separada = separación de responsabilidades limpia (guía §6, recomendado).
- Interceptor (no servicio): la guía §6 exige que **TODA** request con el flag que mute
  estado o acceda cross-tenant deje rastro. Un interceptor en los controllers de
  plataforma garantiza cobertura uniforme sin depender de que cada handler recuerde
  llamar a un servicio de audit (riesgo de "acción sin rastro", riesgo del proposal).

### Schema Prisma

`prisma/schema.prisma` (NUEVO model):

```prisma
model PlatformAudit {
  id                   String   @id @default(uuid())
  actorUserId          String   // super-admin que ejecutó la acción
  action               String   // ej: "POST /admin/platform/orgs", "GRANT super-admin"
  targetOrganizationId String?  // org afectada; null para acciones org-less o grant/revoke
  payload              Json?    // request body redactado / metadata relevante
  createdAt            DateTime @default(now()) @db.Timestamptz(3)

  actor                User          @relation("PlatformAuditActor", fields: [actorUserId], references: [id])
  targetOrganization   Organization? @relation(fields: [targetOrganizationId], references: [id], onDelete: SetNull)

  @@index([actorUserId, createdAt])
  @@index([targetOrganizationId, createdAt])
  @@map("platform_audit")
}
```

Requiere relación inversa en `User` (`platformAudits PlatformAudit[] @relation("PlatformAuditActor")`)
y en `Organization` (`platformAudits PlatformAudit[]`). Migración aditiva.

### Interceptor

`backend/src/audit/platform-audit.interceptor.ts` (NUEVO), aplicado en
`PlatformAdminController` (y disparado también desde el flujo grant/revoke):

```ts
@Injectable()
export class PlatformAuditInterceptor implements NestInterceptor {
  constructor(
    @Inject(PLATFORM_AUDIT_PORT) private readonly audit: PlatformAuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const method = req.method as string;
    // Solo mutaciones (no GET read-only) generan fila — coherente con §6:
    // "toda request que MUTE estado o acceda cross-tenant".
    return next.handle().pipe(
      tap(() => {
        if (method === 'GET') return; // los listados read-only no mutan (decidir en spec si se auditan también)
        void this.audit.record({
          actorUserId: req.user.sub,
          action: `${method} ${req.route?.path ?? req.url}`,
          targetOrganizationId: req.tenantId ?? null,
          payload: redactarSensibles(req.body),
          createdAt: this.clock.now(),
        });
      }),
    );
  }
}
```

- Timestamp vía `ClockPort` (CLAUDE.md §4.6: `new Date()` prohibido en service/domain).
- `payload` pasa por la redacción de secretos existente (CLAUDE.md §6.7).
- Hexagonal: el interceptor depende de un `PlatformAuditPort` (escritura), implementado
  por un `PrismaPlatformAuditRepository` adapter en el módulo de plataforma.
- **A cerrar en spec**: si los GET read-only cross-tenant también se auditan. La guía §6
  dice "mute estado **o** acceda cross-tenant" → un GET cross-tenant a otra org SÍ
  califica. Recomendación: auditar también los GET org-scoped a una org ajena (cuando
  `req.tenantId` no es del actor), pero NO el listado global de orgs (ruido). Cerrar el
  criterio fino en spec.

---

## 6. Decisión 6 — Boolean vs enum `platformRole`: Boolean v1 (YAGNI)

### Elección

**`User.isSuperAdmin Boolean @default(false)`**. NO enum en v1.

### Fundamento

V1 tiene **un solo nivel de operador** (acceso total de plataforma). Un enum
(`PlatformRole { SUPPORT, OPERATOR, ... }`) modela una distinción que hoy no existe →
YAGNI (guía §3). Un Boolean es trivial de chequear en guards y de migrar.

### Disparador de migración futura (documentado)

Migrar `Boolean → enum platformRole` cuando aparezca un **segundo nivel de operador
diferenciado**, p. ej. "soporte read-only" (puede impersonar y leer, no puede suspender
orgs ni cambiar entitlement) vs "operador full". En ese momento:
`isSuperAdmin = true` mapea a `platformRole = OPERATOR`; se agrega `SUPPORT`; los guards
pasan de chequear un boolean a chequear el nivel requerido. Anotar en CLAUDE.md §10.10
(decisiones diferidas).

### Migración

`prisma/migrations/<ts>_user_is_super_admin/migration.sql`:
`ALTER TABLE "users" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;`
Aditiva, sin backfill (todos `false`). Protocolo §11.6 de CLAUDE.md no aplica (no toca
objetos raw SQL), pero verificar que la migration regenerada no arrastre DROPs espurios.

---

## 7. Decisión 7 — Impersonation cross-tenant: rama aditiva sin romper OWNER estricto

### Elección

Rama aditiva en `ImpersonationService.start()` (líneas 53-59): si el caller
`isSuperAdmin`, **saltear** el requisito de `SystemRole.OWNER` en la org destino. El
resto del flujo (sesión activa única, no self, target miembro/activo, **no impersonar
OWNER**, doble auditoría, ventana 30 min) queda intacto. El token de impersonation **NO**
lleva `isSuperAdmin`.

### Fundamento

El código exige OWNER **estricto** (corrección C-2), no "OWNER/ADMIN". El super-admin
opera cross-tenant donde probablemente **ni es miembro** → no tiene `adminMembership`. La
rama aditiva preserva el camino normal (un OWNER real impersonando en su org) y agrega el
camino de plataforma sin reescribir la lógica sensible. El target sigue protegido por
`TargetEsOwnerError` (no se impersona a un OWNER, ni siquiera siendo super-admin) — evita
toma de control.

El token impersonado actúa **COMO el target** (poderes del target dentro de esa org), sin
poderes de plataforma — evita escalada durante soporte. `ImpersonationJwtClaims.forImpersonation`
NO recibe ni setea `isSuperAdmin` (es el factory de payload de impersonation, distinto de
`JwtClaims.forUser`).

### Forma del código

Necesita propagar `isSuperAdmin` del caller hasta `start()`. Hoy la firma es
`start(adminUserId, organizationId, dto)`. El controller (`impersonation.controller.ts`)
tiene `req.user` → pasar el flag como 4º parámetro:

```ts
async start(
  adminUserId: string,
  organizationId: string,
  dto: StartImpersonationDto,
  callerEsSuperAdmin = false, // NUEVO, default preserva el comportamiento existente
): Promise<...> {
  const reason = ImpersonationReason.of(dto.reason);

  const adminMembership = await this.memberships.findForImpersonation(adminUserId, organizationId);

  // Camino normal: exige OWNER estricto del tenant destino.
  // Camino plataforma: el super-admin opera en orgs donde NO es miembro → saltea
  // el requisito de OWNER (docs/disenos/super-admin-plataforma.md §4.4). El resto
  // de las protecciones (target no-OWNER, doble auditoría, ventana) se mantiene.
  if (!callerEsSuperAdmin && (!adminMembership || adminMembership.systemRole !== SystemRole.OWNER)) {
    throw new SoloOwnerPuedeImpersonarError(adminUserId, organizationId);
  }
  // ...resto idéntico: active, self, target checks, TargetEsOwnerError, claims, sign...
}
```

> `ImpersonationLog.organizationId` ya es nullable (`schema.prisma:343`), pero acá se
> pasa la org destino concreta → no hace falta migrar el log. El controller decide
> `callerEsSuperAdmin` desde `req.user.isSuperAdmin`. El `targetUserId` debe ser miembro
> de la org destino (los checks `TargetNoMiembroError` etc. se mantienen) — el
> super-admin impersona a un usuario REAL de esa org, no crea uno.

### Tests (+/−)

- **+**: super-admin impersona a un MEMBER de una org donde no es miembro → token emitido.
- **−**: super-admin NO puede impersonar a un OWNER (`TargetEsOwnerError` se mantiene).
- **−**: un caller no-super-admin sin OWNER en la org destino → `SoloOwnerPuedeImpersonarError`
  (regresión: el comportamiento default no cambia).
- El token de impersonation resultante NO contiene `isSuperAdmin`.

---

## 8. Decisión 8 — Bootstrap: seed gateado por `SUPER_ADMIN_EMAIL` + CLI grant/revoke

### Elección

- **Primer operador**: bloque idempotente en `prisma/seed.ts` gateado por
  `process.env.SUPER_ADMIN_EMAIL`. Si la var existe y el user existe, setea
  `isSuperAdmin = true` (no-op si ya lo es).
- **Posteriores**: comando CLI `super-admin:grant <email>` / `super-admin:revoke <email>`.
  `revoke` dispara la revocación de tokens (Decisión 4.2) y ambos auditan en
  `platform_audit`.

### Fundamento

Problema huevo-gallina (guía §5): el primer super-admin no puede asignarse por un endpoint
protegido por `SuperAdminGuard`. El seed gateado por env es idempotente, versionado y
auditable en git (recomendado por la guía §5). El proyecto ya tiene
`"seed": "ts-node prisma/seed.ts"` (`package.json:18`) — se reutiliza el patrón.
`UPDATE` directo en BD queda PROHIBIDO (CLAUDE.md §4.3).

### Forma del seed (idempotente)

`prisma/seed.ts` (MODIFICADO, bloque al final):

```ts
// Bootstrap del primer super-admin de plataforma (huevo-gallina).
// Gateado por env: si SUPER_ADMIN_EMAIL apunta a un user existente, lo marca.
// Idempotente: correr el seed dos veces deja UN solo super-admin (update no-op).
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
if (superAdminEmail) {
  const user = await prisma.user.findUnique({ where: { email: superAdminEmail } });
  if (user && !user.isSuperAdmin) {
    await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: true } });
    console.log(`[seed] super-admin granted to ${superAdminEmail}`);
  }
}
```

### Esqueleto del comando CLI

El proyecto NO tiene `nest-commander` hoy (solo `ts-node`). Opción mínima y consistente:
un script `ts-node` standalone (mismo patrón que el seed), invocado vía package script.

`prisma/scripts/super-admin.ts` (NUEVO, esqueleto):

```ts
// Uso: SUPER_ADMIN_ACTOR=<email-del-actor> ts-node prisma/scripts/super-admin.ts grant|revoke <email>
// El actor (otro super-admin ya existente) se exige para grants posteriores al primero
// y queda en platform_audit. El primer grant sale del seed, no de acá.
async function main() {
  const [, , accion, email] = process.argv; // 'grant' | 'revoke'
  const target = await prisma.user.findUniqueOrThrow({ where: { email } });

  if (accion === 'grant') {
    await prisma.user.update({ where: { id: target.id }, data: { isSuperAdmin: true } });
  } else if (accion === 'revoke') {
    await prisma.user.update({ where: { id: target.id }, data: { isSuperAdmin: false } });
    // revocar tokens activos del target (Decisión 4.2): set Redis epoch.
    // (en script standalone se hace vía un RedisService liviano o ioredis directo)
  } else {
    throw new Error('acción inválida: grant|revoke');
  }
  // auditar en platform_audit (actor = SUPER_ADMIN_ACTOR resuelto a userId)
}
```

`package.json` (MODIFICADO): agregar
`"super-admin": "ts-node prisma/scripts/super-admin.ts"`.

> Alternativa considerada: endpoint `POST /admin/platform/super-admins` gateado por
> `SuperAdminGuard`. Es más operable pero NO resuelve el primer grant (huevo-gallina) y
> agrega superficie de escalada. Se difiere a v1.1 como conveniencia; el seed+CLI cubre
> v1 sin abrir un endpoint de auto-promoción. A confirmar en spec si el grant/revoke
> posterior va por CLI (v1) o también por endpoint.

---

## 9. Endpoints de plataforma (`/admin/platform/*`) — forma

`backend/src/platform/` (NUEVO módulo, hexagonal estricto). Controller gateado por
`@UseGuards(JwtAuthGuard, SuperAdminGuard)` + `@UseInterceptors(PlatformAuditInterceptor)`:

| Método | Ruta | TenantGuard | Acción |
|---|---|---|---|
| `GET` | `/admin/platform/orgs` | NO (org-less) | listar orgs read-only |
| `POST` | `/admin/platform/orgs` | NO | crear org + designar OWNER ajeno |
| `PATCH` | `/admin/platform/orgs/:id/status` | sí (X-Tenant-ID = :id) | suspender/reactivar (`Organization.status`) |
| `PATCH` | `/admin/platform/orgs/:id/entitlement` | sí | plan + verticales + packs |

- "Crear org + designar OWNER ajeno": el `POST /tenants` self-service deja al creador como
  OWNER; este endpoint crea la org y crea la `Membership` OWNER para un user designado
  (por email/id). Reusa servicios de `tenants`/`memberships` vía **port cross-module** (no
  import directo de otro módulo — CLAUDE.md §3.3).
- `entitlement`: respeta el CHECK de vertical exclusivo (`organizations_vertical_exclusivo_check`)
  y la frontera entitlement→activación (el super-admin setea el entitlement; el OWNER solo
  activa lo habilitado).
- DTOs en español de dominio donde aplica (`status`, `plan`, `verticales`), framework en
  inglés. Errores como `DomainError` (no `*Exception` nuevos — CLAUDE.md §10.10).

> Detalle fino de DTOs/ports cross-module se cierra en spec; acá basta la forma y el
> riel de guards/interceptor.

---

## 10. Archivos a tocar (consolidado)

### Schema / migraciones
- **MODIFICADO** `prisma/schema.prisma` — `User.isSuperAdmin`, model `PlatformAudit` + relaciones inversas.
- **NUEVO** `prisma/migrations/<ts>_user_is_super_admin/`
- **NUEVO** `prisma/migrations/<ts>_platform_audit/`

### Auth / claim / revocación
- **MODIFICADO** `src/auth/domain/jwt-claims.ts` — claim `isSuperAdmin` + `forUser`.
- **MODIFICADO** `src/auth/strategies/jwt.strategy.ts` — propagar + chequear epoch de revocación.
- **MODIFICADO** `src/auth/auth.service.ts` — 3 call sites de `forUser` pasan el flag.

### Guards / RBAC
- **NUEVO** `src/common/guards/super-admin.guard.ts`
- **MODIFICADO** `src/common/guards/tenant.guard.ts` — bypass de membership.
- **MODIFICADO** `src/rbac/guards/permissions.guard.ts` — short-circuit.
- **MODIFICADO** `src/rbac/rbac.service.ts` — honrar `esSuperAdmin` en `has*` + `EMPTY`.
- **MODIFICADO** `src/rbac/ports/permissions-resolver.port.ts` — `esSuperAdmin` en contrato.

### Auditoría de plataforma
- **NUEVO** `src/audit/platform-audit.interceptor.ts`
- **NUEVO** `src/platform/ports/platform-audit.port.ts` + adapter Prisma.

### Plataforma (endpoints)
- **NUEVO** `src/platform/platform-admin.controller.ts` + service + DTOs + ports cross-module + module.
- **MODIFICADO** `src/feature-flags/feature-flags-admin.controller.ts` — re-gate a `SuperAdminGuard`.
- **MODIFICADO** `src/common/permisos/catalogo.ts` — comentario `sistema.feature-flags.admin`.

### Impersonation
- **MODIFICADO** `src/impersonation/impersonation.service.ts` — rama aditiva `callerEsSuperAdmin`.
- **MODIFICADO** `src/impersonation/impersonation.controller.ts` — pasar `req.user.isSuperAdmin`.

### Bootstrap
- **MODIFICADO** `prisma/seed.ts` — bloque `SUPER_ADMIN_EMAIL`.
- **NUEVO** `prisma/scripts/super-admin.ts` + script en `package.json`.

### Reconciliación de docs (al implementar, §13 guía)
- `docs/claude/seguridad.md §5.4` (`role: 'super_admin'` → `isSuperAdmin`).
- `docs/disenos/plataforma-multi-vertical.md §10.1` → "✅ CERRADA".
- `docs/deudas-arquitecturales.md §3.3` → saldada.
- CLAUDE.md §10.4 (anotar que la blocklist de access tokens se construye acá, acotada al flag).

---

## 11. Estrategia de tests (TDD estricto — casos + y −)

| Pieza | Nivel | Casos clave |
|---|---|---|
| Migration `isSuperAdmin` | integración | default `false`; ningún user existente quedó `true`. |
| `JwtClaims.forUser` | unit | incluye `isSuperAdmin: true` solo cuando se pasa `true`; ausente si no. |
| `JwtStrategy.validate` | unit | propaga `isSuperAdmin` a `req.user`; token normal → `false`. |
| Revocación (epoch Redis) | integración | tras revocar, un token con `iat` previo → claim de plataforma rechazado; token nuevo → válido. |
| `SuperAdminGuard` | unit | **+** super-admin pasa; **−** no-super-admin → 403; truthy no-`true` → 403. |
| `TenantGuard` bypass | unit/integración | **+** super-admin sin membership pasa; **−** no-super-admin sin membership → 403 (invariante §4.2). |
| `PermissionsGuard` short-circuit | unit | **+** super-admin matchea cualquier permiso sin tocar RBAC; **−** no-super-admin sigue el matcher. |
| `RbacService.has*` | unit | `esSuperAdmin: true` → todos `true` (defensa en profundidad). |
| `PlatformAuditInterceptor` | integración | toda mutación con el flag deja fila; timestamp del `ClockPort` (fake); payload redactado. |
| Impersonation cross-tenant | integración | **+** super-admin impersona MEMBER en org ajena; **−** no impersona OWNER; **−** no-super-admin sin OWNER → error (regresión). Token sin `isSuperAdmin`. |
| Endpoints `/admin/platform/*` | e2e | OWNER normal → 403; super-admin lista/crea/suspende/entitlement; cada mutación audita. |
| Bootstrap seed | integración | idempotente (dos corridas → un solo super-admin). |
| `/admin/feature-flags` re-gate | e2e | OWNER que antes pasaba por wildcard → ahora 403; super-admin → 200. |

Backend e2e/integración con `DATABASE_URL` + `--runInBand --forceExit` (CLAUDE.md §11.3).
Tiempo vía `ClockPort` (fake clock), nunca `new Date()` (CLAUDE.md §4.6, §7.9).

---

## 12. Riesgos y dudas para spec

- **Blocklist de access tokens no existía** (C-1): este change construye la primera; el
  alcance se acota al claim de plataforma. Generalizar a logout-all es deuda separada —
  confirmar que no se quiere ampliar acá.
- **Criterio de auditoría de GETs cross-tenant** (Decisión 5): cerrar en spec si los GET
  org-scoped a una org ajena se auditan (recomendado sí) y si el listado global se excluye.
- **Grant/revoke posterior**: CLI (v1) vs endpoint (v1.1) — confirmar en spec.
- **Wiring de `isSuperAdmin` en `refresh`** (Decisión 4.1): `refresh` no carga el `User`
  hoy; definir el lookup mínimo del flag en tasks.
- **`JwtStrategy` gana dependencias** (Redis + ClockPort) para la revocación — confirmar
  que no rompe el bootstrap de Passport (hoy solo inyecta `ConfigService`).
