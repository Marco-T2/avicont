# Deudas arquitecturales

> **Fuente**: auditoría §3 del 2026-04-23 sobre 13 módulos del backend.
> **Objetivo**: priorizar trabajo de refactor hacia hexagonal estricto.
>
> Regla general que se venía aplicando: *"código nuevo cumple CLAUDE.md §3;
> código heredado del starter se toca solo cuando lo necesitamos"*. La
> auditoría confirma que se cumplió. Fase 1.x (cuentas, configuracion-contable,
> periodos-fiscales, comprobantes, contactos) es sólida. La deuda vive en
> Fase 0 — módulos traídos del starter Multi-Tenant-SaaS-Starter-NestJS que
> nunca se hexagonizaron del todo.

---

## Grades actuales (snapshot 2026-04-23)

| Módulo | Fase | Grade | Carpetas faltantes |
|--------|------|-------|---------------------|
| configuracion-contable | 1.1 | A | — |
| comprobantes | 1.3 | A− | — (1 violación menor externa) |
| cuentas | 1.0 | A− | — (1 import relativo) |
| contactos | 1.4 | A− | — |
| rbac | 0 | A− | — |
| users | 0 | A− | — (2026-04-24: §2.1 Sesión A cerrada) |
| periodos-fiscales | 1.2 | B+ | `domain/` minimalista, sin response DTOs |
| impersonation | 0 | A | §3.2.d cerrada 2026-04-24 |
| invitations | 0 | B− | `domain/` vacío + imports concretos cross-module |
| feature-flags | 0 | A− | — (2026-04-24: §2.2 cerrada) |
| memberships | 0 | A | §3.2.a cerrada 2026-04-24; ambas fugas bidireccionales cerradas (§3.2.b custom-roles + §2.1 remanente users) 2026-04-24; sin deuda viva |
| custom-roles | 0 | A− | domain + CUSTOM_ROLES_READER_PORT + domain errors 2026-04-24 (§3.2.b); invitations también migrado al port en el mismo batch |
| tenants | 0 | A | §3.2.c cerrada 2026-04-25; sin deuda viva |
| auth | 0 | A− | — (2026-04-24: §2.1 Sesión B cerrada) |
| permissions | 0 | N/A | Stub intencional (catálogo read-only) |

---

## 1. Alta prioridad — atacar primero

### 1.1 Deudas puntuales de Fase 1.x — ✅ CERRADO 2026-04-24

Los 7 items se entregaron en 7 commits verdes sobre `main` (ver `git log`):

- ✅ `cuentas`: imports `../../` → `@/` (3 adapters).
- ✅ `comprobantes`: binding de `COMPROBANTES_LOCK_PORT` migrado a
  `ComprobantesModule.exports`, ciclo resuelto con `forwardRef` en
  ambas direcciones. `periodos-fiscales` ya no conoce el adapter concreto.
- ✅ `periodos-fiscales`: `GestionResponseDto`,
  `GestionConPeriodosResponseDto`, `PeriodoFiscalResponseDto` con
  mappers; controllers ya no retornan ORM entities.
- ✅ `cuentas/domain/`: VOs `CodigoInterno` (1..8 niveles) y `CodigoPuct`
  (4 segmentos, nivel PUCT del catálogo).
- ✅ `periodos-fiscales/domain/`: VO `RangoPeriodoFiscal.of(year, month)`
  reemplaza las funciones `rangoCalendario`, `diasEnMes`, `esBisiesto`
  que vivían en `common/domain/`.
- ✅ `common/domain/`: VO `Money` envuelve `Prisma.Decimal` y centraliza
  `TOLERANCIA_BOB`, `balanceadoEnBobCon`, `toBob`, aritmética decimal.
  `comprobante-validator` y `comprobantes.service` migrados.
- ✅ `comprobantes/domain/`: VO `NumeroComprobante` con `of()`, `parse()`,
  `toString()`, `equals()`. `formatearNumero` eliminada; `numeracion.ts`
  queda sólo con el mapa `PREFIJO_POR_TIPO`.

Al cierre: 547/547 tests verdes en la suite completa (unit + integration + E2E).

### 1.2 Desacoplar `memberships → rbac` y `invitations → rbac/notifications`

### 1.2 Desacoplar `memberships → rbac` y `invitations → rbac/notifications` — ✅ CERRADO 2026-04-24

Entregado en 5 commits atómicos sobre `main`:

- ✅ `rbac`: `PermissionsCacheInvalidationPort` (Symbol + abstract class),
  `RbacService implements` el port, módulo lo exporta vía `useExisting`.
  Superficie mínima: `invalidateUser` + `invalidateUsersByCustomRole`.
  `invalidateOrganization` queda interno (nadie externo lo usa).
- ✅ `notifications`: `InvitationEmailsPort` +
  `NotificationsInvitationEmailsAdapter` (wraps `NotificationsService`,
  descarta `EmailResult`). `NotificationPort` preexistente intacto.
- ✅ `memberships`: inyecta `PERMISSIONS_CACHE_INVALIDATION_PORT`.
- ✅ `custom-roles`: inyecta `PERMISSIONS_CACHE_INVALIDATION_PORT`.
  (`assertValidPermissionPattern` sigue como helper de dominio puro.)
- ✅ `invitations`: inyecta `PERMISSIONS_CACHE_INVALIDATION_PORT` +
  `INVITATION_EMAILS_PORT`. Sin imports concretos de RbacService ni
  NotificationsService.

**Próximo paso**: §2.1 (users/auth hexagonal) o §2.2 (feature-flags).

---

## 2. Media prioridad — refactor cuando haya espacio

### 2.1 Hexagonizar auth + users — ✅ CERRADA 2026-04-24 (A y B)

#### Sesión A — users side ✅ CERRADA 2026-04-24

Entregado en 5 commits atómicos sobre `main` (ver `git log`):

- ✅ `feat(users): add domain VOs Email, UserId, DisplayName and errors`
  — VOs + specs (36 tests) + jerarquía `UsuarioNoEncontradoError` /
  `UsuarioEmailDuplicadoError` / `EmailInvalidoError` / `UserIdInvalidoError` /
  `DisplayNameInvalidoError` subclases de `DomainError` con codes
  `USER_*` estables (CLAUDE.md §6.3).
- ✅ `feat(users): add USER_REPOSITORY_PORT with PrismaUserRepository adapter`
  — port interno con superficie completa (`findByEmail`, `findById`,
  `create`, `update`), binding vía `useExisting`.
- ✅ `feat(users): expose minimal cross-module USERS_READER_PORT + USERS_WRITER_PORT`
  — superficie ULTRA mínima (regla #5): reader sólo `findByEmail →
  UsuarioParaAuth`; writer sólo `create → UsuarioCreadoParaAuth`.
  Adapters dedicados con `select` restringido para no filtrar columnas
  sensibles.
- ✅ `refactor(users): consume USER_REPOSITORY_PORT in service` — service
  delega al port; `getProfile` sigue con Prisma directo (compone
  memberships/organizations — extracción atada a hexagonizar
  memberships, §3.2).
- ✅ `refactor(auth): consume USERS_READER_PORT + USERS_WRITER_PORT; drop UsersService`
  — AuthService ya no inyecta `UsersService` concreto; depende sólo de
  los dos Symbols. Blast radius cross-module de `AuthService` confirmado
  cero (el Explore agent reportó un falso positivo en `impersonation`).

Verde al cierre: 486/486 (unit + integration) + 10/10 auth E2E. Typecheck limpio.

#### Sesión B — auth hexagonal propio ✅ CERRADA 2026-04-24

Entregado en 9 commits atómicos sobre `main` (warm-up de follow-ups +
auth hexagonal + memberships reader port):

- ✅ `fix(auth): block login for deactivated users` — `validateUser`
  rechaza users con `isActive=false` después del `bcrypt.compare`
  (mismo mensaje genérico, mismo timing).
- ✅ `chore(auth): remove unused LocalStrategy` — strategy + provider +
  dep `passport-local` eliminados. Login va por JSON body contra
  `AuthController`, no Passport.
- ✅ `chore(users): remove dead findByEmail/findById from UsersService`
  — métodos sin callers externos al módulo post-Sesión A; el port
  interno `USER_REPOSITORY_PORT` los sigue exponiendo para `getProfile`.
- ✅ `feat(auth): add domain VOs and errors` — VOs `RefreshTokenHash`
  (SHA-256 hex), `TokenFamily` (UUID), `JwtClaims` (factory centralizado
  del payload); jerarquía `CredencialesInvalidasError` /
  `TokenInvalidoError` / `NoMiembroDeTenantError` + VO guards con codes
  `AUTH_*` estables. 32 tests unit de dominio.
- ✅ `feat(auth): add CREDENTIALS_REPOSITORY_PORT with Prisma adapter`
  — interface + Symbol, adapter Prisma con `select` restringido;
  `findActiveByHash` devuelve `userEmail` inline para evitar segundo
  roundtrip.
- ✅ `refactor(auth): consume CREDENTIALS_REPOSITORY_PORT in service`
  — `refreshTokens` / `logout` / `createRefreshToken` delegan al port;
  VOs reemplazan el manejo crudo de hashes y UUIDs; unit tests con
  port mockeado.
- ✅ `feat(memberships): expose MEMBERSHIPS_READER_PORT` — abstract
  class + Symbol cross-módulo, adapter dedicado con `select` mínimo
  (`organizationId`, `systemRole`, `customRole.slug`, `user.email`).
  `Organization` y `customRole.permissions` dejan de cruzar la
  frontera.
- ✅ `refactor(auth): consume MEMBERSHIPS_READER_PORT; drop PrismaService`
  — `login` / `refreshTokens` / `switchTenant` consumen el port;
  `PrismaService` fuera del constructor de `AuthService`. 11 tests
  unit nuevos cubriendo login / switchTenant / validateUser.

Verde al cierre: 529/529 unit+integration + 20/20 e2e auth+users+
tenant-isolation+impersonation. Typecheck limpio.

**Deuda remanente** (fuera de scope de §2.1):
- ✅ **§3.2 memberships full refactor**: CERRADA 2026-04-24 —
  `778ca67..32135c1`. Ver §3.2.a para el detalle.
- **`TenantContextService` provider en `auth.module.ts` sin consumers**:
  cosmético, borrar en la próxima pasada sobre auth.
- **`users.service.ts` sigue con `prisma.user.findUnique(include: memberships)`
  en `getProfile`**: Sesión A lo dejó explícito. Migrar a
  `MEMBERSHIPS_READER_PORT.findActivasByUserId` más `USER_REPOSITORY_PORT.findById`
  ahora sí es posible — queda como follow-up rápido.
- ✅ **Extender `USERS_READER_PORT` con `findMinimalByEmail(email)`**
  — CERRADA 2026-04-24 (`15a7a48..`). Método nuevo en el port con
  shape `UsuarioMinimo = { id, email, displayName: string | null }`.
  `memberships.invite` lo consume y dropea la inyección de
  `PrismaService` del service. Ciclo `memberships ↔ users` resuelto
  con `forwardRef` en ambas direcciones (patrón §1.1 comprobantes).

#### Follow-up descubiertos durante Sesión A

- ✅ **Leak de `hashedPassword`** — fijado 2026-04-24 en commit
  `d94631a` `fix(users): strip hashedPassword from PATCH /users/me response`.
  `UserResponseDto` + mapper allow-list + e2e de regresión.
- ✅ **`isActive` no validado en login** — fijado en §2.1 Sesión B
  (commit `b7da3be`).
- ✅ **`LocalStrategy` registrada pero sin uso** — removida en §2.1
  Sesión B (commit `a0b2fa9`).

### 2.2 Hexagonizar feature-flags — ✅ CERRADA 2026-04-24

Entregada en 5 commits verdes sobre `main` (`f60711b..27b463b`):

- ✅ `domain/feature-flag-key.ts` + spec (VO con regex y longitud; 22
  tests). Reemplaza el `@Matches` del DTO como fuente de verdad.
- ✅ `domain/feature-flag-errors.ts` — `FeatureFlagKeyInvalidaError`,
  `FeatureFlagNoEncontradaError`, `FeatureFlagDuplicadaError` (subclases
  de `ValidationError / NotFoundError / ConflictError`). Reemplazan los
  `NotFoundException / ConflictException` que tiraba el service.
- ✅ `ports/feature-flag.repository.port.ts` — CRUD interno completo,
  infra pura (no conoce cache).
- ✅ `ports/feature-flag-reader.port.ts` — superficie mínima cross-módulo
  (`isEnabled / getAllForTenant / invalidate`). Único dueño del cache.
  Pensado para granja (Fase 2) y cualquier consumer futuro sin tener
  que tocar `FeatureFlagsService`.
- ✅ `adapters/prisma-feature-flag.repository.ts` — traducción directa
  a Prisma.
- ✅ `adapters/prisma-feature-flag-reader.adapter.ts` — concentra el
  caching (cache → DB → cache, TTL 60s) + invalidación post-commit.
  Resiliente a Redis caído (GET y SET con `try/catch` y fallback a
  DB; `invalidate` absorbe errores y deja que el TTL expire).
- ✅ `FeatureFlagsService` refactorizado: inyecta los 2 ports, dropea
  `PrismaService` y `CacheService`. `isEnabled` / `getAllForTenant`
  salieron del service — ahora los controllers consumen el reader
  directo.
- ✅ `FeatureFlagGuard` depende sólo de `FEATURE_FLAG_READER_PORT`;
  queda reusable sin arrastrar la API admin.
- ✅ `FeatureFlagsAdminController` deja de estar expuesto: agrega
  `JwtAuthGuard + TenantGuard + PermissionsGuard` y requiere
  `sistema.feature-flags.admin` (permiso nuevo en el catálogo bajo
  el módulo `sistema`). Cierra el comentario "should be protected
  in production" que arrastraba el starter.

**No se hizo** (decisión consciente):
- `FeatureFlagState` enum-like del plan original — innecesario, es
  `boolean` + `metadata: Json` opcional; no tiene invariantes propios.
- `FeatureFlagCachePort` separado — el reader port es dueño único del
  cache, no hace falta un puerto extra que sólo el adapter usa.

**Deudas descubiertas durante §2.2** (abiertas, no bloqueantes):
- `FeatureFlagsController` usa `@RequirePermissions('settings.read')`
  y `settings.write` — **esas keys no existen en el catálogo**. Hoy
  pasan sólo porque OWNER/ADMIN matchean vía wildcard `*`. Cualquier
  CustomRole que quisiera otorgarlas sería rechazado por
  `permisoExisteEnCatalogo`. Fix cuando se necesite: decidir si
  renombramos a `organizacion.feature-flags.read/update` (que sí
  existen y son tenant-scoped) o agregamos `settings.*` al catálogo.
- Modelo de super-admin global (ver §3.3 nueva).

---

## 3. Baja prioridad — nice to have

### 3.1 VOs faltantes transversales

Introducir **oportunísticamente** cuando se tocan esos archivos:

- `Email` (users, invitations, auth)
- `Password` (auth; invariante: nunca circula post-hash)
- `Token` / `RefreshToken` (auth; invariante: nunca en logs sin redact)
- `Nit` — **ya existe en common/domain** — extender a más lugares (facturas, LCV)
- ✅ ~~`TenantSlug`~~ — extraído 2026-04-25 en §3.2.c (vive en `tenants/domain/`).
- ✅ ~~`ImpersonationWindow`~~ — extraído 2026-04-24 en §3.2.d.

### 3.2 Módulos Fase 0 restantes

Hexagonizar siguiendo el patrón de `contactos`. Orden y prioridad:

#### 3.2.a memberships — ✅ CERRADA 2026-04-24

Full refactor entregado en 4 commits atómicos sobre `main`
(`778ca67..`). Reader port cross-módulo ya venía de §2.1 Sesión B.
- ✅ Domain: VOs (`MembershipId`, `MembershipRole`) + 9 domain errors
  con codes `MEMBERSHIP_*` estables.
- ✅ Port interno `MEMBERSHIP_REPOSITORY_PORT` + adapter Prisma +
  integration spec (19 tests).
- ✅ `MembershipsService` consume el port, domain errors reemplazan
  `HttpException` crudos. Unit spec con ports mockeados (22 tests).
- ✅ `MembershipsService` fuera del `exports` del módulo y del barrel
  `index.ts` — no es API pública; sólo el controller interno lo usa.

624/624 unit + integration + 87/87 e2e verdes al cierre.

**Deudas bidireccionales** (cerradas 2026-04-24):
- ✅ ~~`CUSTOM_ROLES_READER_PORT.belongsToTenant`~~ — §3.2.b.
  `MembershipsService` e `InvitationsService` consumen el port.
- ✅ ~~`USERS_READER_PORT.findMinimalByEmail`~~ — §2.1 remanente.
  `MembershipsService` consume el port y dropea `PrismaService`.
  Ciclo `memberships ↔ users` resuelto con `forwardRef`.

`MembershipsService` ya no inyecta `PrismaService`. Sin deudas
bidireccionales abiertas.

#### 3.2.b custom-roles — ✅ CERRADA 2026-04-24

Entregada en 3 commits sobre `main` + 1 para consumir desde
memberships (bidireccional). Repo port pre-existente (ya desde
§1.2), acá se agregó lo que faltaba:

- ✅ `domain/` — VOs `CustomRoleId` (UUID), `CustomRoleSlug`
  (kebab-case 2..50) + 9 domain errors con codes `CUSTOM_ROLE_*`
  estables. 28 unit tests.
- ✅ `CUSTOM_ROLES_READER_PORT` cross-módulo con superficie mínima:
  un solo método `belongsToTenant(customRoleId, tenantId)`.
  Adapter `PrismaCustomRolesReaderAdapter` + integration spec
  (4 tests). La docstring deja explícito que el caller no
  distingue "no existe" de "existe en otro tenant" — ambos
  retornan `false` para no filtrar IDs cross-tenant.
- ✅ `CustomRolesService` reemplaza los 7 HttpException por los
  domain errors (`CustomRoleNoEncontradoError`,
  `CustomRoleSlugDuplicadoError`, `CustomRoleConMiembrosActivosError`,
  `CustomRoleNoEditableError`, `CustomRoleDelSistemaError`,
  `PermisoInvalidoError`, `PermisoDesconocidoError`). Unit spec
  con repo mockeado (22 tests). Contrato público intacto — el
  e2e `custom-roles.e2e-spec.ts` pasa sin tocar.
- ✅ `MembershipsService` consume `CUSTOM_ROLES_READER_PORT` —
  dropea `prisma.customRole.findUnique` y cierra la primera
  fuga bidireccional documentada en §3.2.a.

**Deuda remanente** (fuera de scope de §3.2.b):
- ✅ ~~`invitations.service.ts:assertCustomRoleBelongsToTenant`~~
  — cerrada en el mismo batch (bonus commit). InvitationsService
  consume `CUSTOM_ROLES_READER_PORT.belongsToTenant`. Sin cambio
  de contrato público, e2e verde.
- `CustomRoleRepositoryPort` sigue siendo `interface` en lugar de
  `abstract class` — consistencia con el resto del proyecto.
  Cambio mecánico, sin impacto. Postponed.

#### 3.2.c tenants — ✅ CERRADA 2026-04-25

Entregada en 5 commits atómicos sobre `main` (`e8a08f4..7975d56`).
D+ → A.

- ✅ `feat(tenants): add domain VOs and errors` — VOs `OrganizationId`
  (UUID) y `TenantSlug` (kebab-case 1..100, derivable desde name con
  `fromName()` y NFKD para preservar diacríticos). Jerarquía de domain
  errors con codes `TENANT_*` estables: `TenantNoEncontradoError` (404),
  `TenantSlugDuplicadoError` (409), `TipoEmpresaInmutableError` (409,
  code `TENANT_EMPRESA_INMUTABLE` preservado del impl previo),
  `OrganizationIdInvalidoError` (400), `TenantSlugInvalidoError` (400).
  45 unit tests de dominio.
- ✅ `feat(tenants): add TENANT_REPOSITORY_PORT and Prisma adapter` —
  abstract class con superficie mínima (create con nested write
  atómico, findById, findBySlug, existsBySlug, update con patch parcial,
  findFeatures con proyección, updateFeatures con patch parcial).
  Integration spec con 13 tests cubre nested write, UNIQUE constraint
  en slug, patch parcial y proyección.
- ✅ `feat(memberships): extend MEMBERSHIPS_READER_PORT with findAllByTenant`
  — nuevo shape `MembershipDeTenantParaAdmin` (id, userId, systemRole,
  customRoleId, deactivatedAt, createdAt, user{id,email,displayName},
  customRole{id,slug,name}|null) para que `tenants.getMembers` consuma
  el reader en lugar de tocar `prisma.membership.findMany` directo.
  Integration spec dedicada (5 tests): aislamiento cross-tenant, mix
  activas/desactivadas, tenant vacío.
- ✅ `refactor(tenants): apply domain errors and VOs in service` —
  reemplaza HttpException crudos por domain errors. Centraliza la
  generación del slug en `TenantSlug.fromName`.
- ✅ `refactor(tenants): consume ports; drop PrismaService from service`
  — última fuga cross-módulo eliminada. Unit spec del service nueva
  (15 tests) con ports mockeados. `TenantsModule` importa
  `MembershipsModule` y wirea `TenantRepositoryPort -> PrismaTenantRepository`.

**Cambios de contrato deliberados**:
- `POST /tenants` con slug duplicado: 400 BadRequest → 409 Conflict
  (code `TENANT_SLUG_DUPLICADO`). Status anterior era un bug — un
  duplicado es un conflicto de estado, no un input inválido.
- `POST /tenants` con name sin caracteres alfanuméricos (e.g. `"!!!"`):
  antes generaba slug vacío y la segunda vez chocaba con la UNIQUE;
  ahora 400 con `TENANT_SLUG_INVALIDO`.

`TenantsService` ya no inyecta `PrismaService`. `PrismaService` y
`TenantContextService` siguen registrados como providers porque
PrismaService los requiere transitivamente (patrón documentado en
§3.2.d, fuera de scope hasta migrar a un `PrismaModule` global).

874/874 unit + integration + 87/87 e2e verdes al cierre.

#### 3.2.d impersonation — ✅ CERRADA 2026-04-24

Entregada en 4 commits atómicos sobre `main` + 1 commit adicional en
`memberships` para el reader port extendido. B → A.

- ✅ `feat(impersonation): add domain VOs and errors` — VOs
  `ImpersonationId` (UUID), `ImpersonationReason` (min 10 chars
  post-trim), `ImpersonationWindow` (TTL default 30min, CLAUDE.md §5.6),
  `ImpersonationJwtClaims` (factory con claims obligatorios — más
  estricto que el `JwtPayload` genérico de auth). Jerarquía de domain
  errors con codes `IMPERSONATION_*` estables (9 errores de negocio +
  4 errores de VO). 42 tests unit de dominio.
- ✅ `refactor(impersonation): apply domain errors and VOs in service`
  — reemplaza HttpException crudos por domain errors. Mismos códigos
  HTTP, contrato público intacto (e2e pasa sin tocar). Dropea
  `ConfigService` (inyectado pero sin uso).
- ✅ `feat(memberships): extend MEMBERSHIPS_READER_PORT with findForImpersonation`
  — shape `MembershipParaImpersonation` expone `deactivatedAt` y
  `userIsActive` explícitamente (los otros métodos los filtran). El
  caller puede distinguir "no miembro" (null) de "miembro desactivado"
  o "cuenta desactivada". Integration spec nueva (5 tests).
- ✅ `refactor(impersonation): consume MEMBERSHIPS_READER_PORT; drop PrismaService`
  — última fuga cross-módulo eliminada. Unit spec del service nueva
  (18 tests) con ports mockeados. `ImpersonationModule` importa
  `MembershipsModule`.

**Deuda descubierta pero DESCARTADA**: intentamos sacar
`TenantContextService` del providers del módulo porque ningún service
del módulo lo inyecta. E2E falló — `PrismaService` lo requiere
transitivamente en su constructor. Regla: mientras `PrismaService` se
registre per-module en lugar de vivir en un `PrismaModule` global,
`TenantContextService` debe acompañarlo. Aplicará a todos los módulos
que listan `PrismaService` en providers. Cleanup genuino requiere
refactor mayor (migrar a `PrismaModule` global) — fuera del scope de
esta deuda.

780/780 tests verdes al cierre (42 domain impersonation + 5 integration
reader + 18 unit service + resto de la suite).

### 3.3 Modelo de super-admin global

El catálogo RBAC es **tenant-scoped**: `PermissionsGuard` exige un
`tenantId` (JWT `activeTenantId` o header `X-Tenant-ID`) y resuelve
permisos contra la membership del caller en ese tenant. No existe
concepto de "super-admin global" en el modelo de datos — `SystemRole`
es `OWNER | ADMIN` por membership, no a nivel de `User`.

**Consecuencia hoy** (descubierta al cerrar §2.2): las operaciones
cross-tenant legítimas (p. ej. administrar el catálogo global de
feature flags en `POST /api/admin/feature-flags`) no tienen un
modelo natural para decir "sólo un subconjunto de humanos puede
ejecutar esto". La solución interina que quedó en `sistema.feature-flags.admin`
es: caller debe ser OWNER o ADMIN de **algún** tenant (matchean vía
wildcard `*` del rbac resolver) y pasar un `X-Tenant-ID` válido.
Eso cierra el endpoint frente al público anónimo pero no frente a
owners de otros tenants — es mejor que el hoyo abierto del starter,
pero no es la respuesta final.

Para refinar — cuando aparezca la presión real (p. ej. cliente paga
por onboarding, o compliance):
1. Agregar `User.isSuperAdmin: Boolean` (o tabla `SuperAdmin` si se
   quiere auditar mejor) con flag booleano.
2. Extender el resolver para que `isSuperAdmin` otorgue wildcard
   global `sistema.*` sin depender de membership.
3. Endpoint cross-tenant sin `TenantGuard`: guard dedicado
   `SuperAdminGuard` que valide el flag directamente.
4. Auditoría obligatoria de cualquier acción `sistema.*`.

Permisos afectados hoy (único ítem de módulo `sistema` del catálogo):
- `sistema.feature-flags.admin`

---

## 4. Explícitamente fuera de scope

- **permissions**: es un stub intencional (catálogo read-only que expone `common/permisos/catalogo.ts`). No hexagonizar — está bien así.
- **Guards, decorators, interceptors, strategies Passport**: infraestructura NestJS legítima, no viola hexagonal.

---

## 5. Divergencia sistémica aceptada (no es deuda)

`import type { X } from '@prisma/client'` en ports y services del proyecto.

El ideal hexagonal puro diría que dominio no debe importar tipos de Prisma.
El proyecto eligió pragmatismo desde Fase 1.0: usar los tipos generados por
Prisma como entidades de dominio, evitando mapeo ORM↔domain boilerplate.

**Condición**: solo `import type` (sin runtime). Sin `new PrismaClient()` ni
llamadas al cliente desde domain/ o ports/. Si algún día se cambia ORM, el
cambio estructural es local a cada port + adapter.

Si esto se formaliza, actualizar `CLAUDE.md §3.5` para reflejar la realidad
en vez del ideal. Decisión diferida hasta que haya presión real (otro equipo,
otro ORM, etc.).

---

## 6. Reglas de oro al atacar la deuda

1. **Verde entre cada commit** (typecheck + suite tests del subsistema).
2. **Commits atómicos**: no mezclar refactor de 2 módulos en un commit.
3. **Cuando toques un módulo de Fase 0, hexagonalo antes de agregar features nuevas** — no acumular más deuda encima.
4. **Los ports se definen primero, los adapters después** — si aparece la tentación de saltarse el port "porque solo hay un adapter", releer CLAUDE.md §3.2 ("incluso con un solo adapter, la consistencia es el beneficio").
5. **Todo port cross-module arranca con superficie mínima** — no copiar el Repository entero al Reader. Si el consumidor solo necesita `isActive`, expone solo `isActive`.

---

## 7. Priorización recomendada (1 mes de trabajo estimado)

```
Sesión 1: §1.1 deudas puntuales Fase 1.x        [2h]
Sesión 2: §1.2 RBAC cache invalidation port      [3h]
Sesión 3: §2.1 users → hexagonal                 [2h]
Sesión 4: §2.1 auth → hexagonal                  [2h]
Sesión 5: §2.2 feature-flags → hexagonal         [2h]
Sesión 6: §3.2 tenants / custom-roles (si se toca)
```

Total aprox: **11h de trabajo puro**, distribuido según disponibilidad.

---

**Última revisión**: 2026-04-25 (§1.1 + §1.2 + §2.1 A/B + §2.1
remanente + §2.2 + §3.2.a + §3.2.b + §3.2.c + §3.2.d cerradas;
CERO fugas cross-módulo documentadas activas, CERO módulos Fase 0
sin hexagonalizar. Deuda viva: §3.3 super-admin global, §3.1 VOs
oportunísticos (Email, Password, Token, Nit en más lugares)).
**Auditoría fuente**: 4 agentes de exploración sobre 13 módulos, grep de
imports cross-module, verificación de Symbol + abstract class bindings,
revisión de `@Inject` en services.
