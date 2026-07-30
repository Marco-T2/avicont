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
- ✅ `cuentas/domain/`: VO `CodigoInterno` (1..8 niveles).
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

### 2.3 El trigger de `comprobantes_audit` castea `''::boolean` sin proteger

**Detectado** 2026-07-29, construyendo la Fase 4 de `ventas-piloto`. Preexistente
desde la migración `20260527190718_comprobantes_anulacion_as_flag_and_audit_triggers`.
**Latente: hoy NO es alcanzable.** Fix acordado con Marco: change propio, después
de la Fase 4 — no se mezcla con una feature de ventas.

`AuditedTransactionRunner` setea los GUC con `set_config(..., true)`, o sea
`is_local = true`: transaction-scoped. Pero Postgres tiene una particularidad con
los GUC **custom**: una vez que los tocás, al terminar la TX no vuelven a
"no definidos" sino a **string vacío**, y quedan así en esa conexión del pool.

Entonces, en `trg_comprobantes_audit`:

```sql
-- línea 152 — NO protegida: el cast revienta antes de que el COALESCE ayude
COALESCE(current_setting('app.audit_during_reopening', true)::boolean, false),
-- línea 153 — SÍ protegida, con el NULLIF que a la de arriba le falta
NULLIF(current_setting('app.audit_reapertura_id', true), '')::uuid,
```

Un write a `comprobantes` / `lineas_comprobante` **fuera** del runner auditado,
sobre una conexión del pool que antes corrió una TX auditada, encuentra `''` y
falla con **22P02** (`invalid input syntax for type boolean`) → 500. El error no
nombra la causa: apunta al trigger, no al GUC vacío.

**Por qué no es alcanzable hoy** (verificado, no supuesto): todos los call sites
de escritura de comprobantes pasan `tx`, y ese `tx` sale siempre del runner.
`CierreComprobanteWriterPort` declara `tx?: Prisma.TransactionClient` **opcional**,
así que el tipo lo PERMITE, pero ningún consumidor lo ejercita.

**Por qué igual hay que arreglarlo**: la asimetría con la línea 153 se lee como
olvido, no como decisión, y el día que alguien escriba a comprobantes sin el
runner se come un 500 opaco. Fix de una línea — el mismo `NULLIF` de la 153:

```sql
COALESCE(NULLIF(current_setting('app.audit_during_reopening', true), '')::boolean, false),
```

**Cuidado al hacerlo**: exige migración que recree la función del trigger, y
`prisma migrate dev` **no se puede usar en este repo** (pide resetear la base de
desarrollo porque `20260726010000_arranque_anulacion` fue editada a mano y el
checksum ya no coincide). Va escrita a mano con el protocolo §11.6, como las
migraciones de los perfiles de extracto y la de `ventas.cuentaDestinoId`.

**Corolario para tests, este SÍ vigente hoy**: todo cleanup que borre
comprobantes debe correr **dentro** del runner auditado. Ya está resuelto así en
`backend/src/ventas/ventas.service.integration.spec.ts`.

### 2.4 Fechas validadas SÓLO con regex → `RangeError` crudo → 500

**Detectado** 2026-07-29, construyendo la Fase 4 de `ventas-piloto`. Preexistente,
**alcanzable hoy por cualquier usuario**.

`"2026-02-31"` es un string bien formateado y una fecha que no existe. Un DTO que
valida con `@Matches(/^\d{4}-\d{2}-\d{2}$/)` lo acepta, y después
`FechaContable.fromIso` lanza un **`RangeError` crudo**:

```
RangeError: FechaContable: día inválido 31 para 2026-02 (máx 28)
```

Verificado ejecutándolo, no leyéndolo: **no es un `DomainError`** (no tiene
`httpStatus`), así que el `GlobalExceptionFilter` no lo mapea al formato de §6.4
y sale un **500**. El usuario recibe un error de servidor por un dato de entrada
inválido, que es exactamente lo que §6.2 existe para evitar.

**15 DTOs afectados** (al 2026-07-29):

| Módulo | Archivos | Severidad |
|---|---|---|
| `comprobantes` | `create-comprobante.dto.ts`, `listar-comprobantes.dto.ts` | **alta** — camino de escritura |
| `conciliacion-bancaria` | `declarar-arranque.dto.ts` + 4 query DTOs | **alta** en `declarar-arranque` (escritura), baja en los query |
| `reportes` | 9 query DTOs | baja — 500 en un GET con parámetro malo |

**Ya resuelto donde se tocó**: `ventas` valida con el decorador propio
`EsFechaContableIso` (`backend/src/ventas/dto/es-fecha-contable-iso.ts`), que
construye la `FechaContable` y rechaza con 422. `documentos-fisicos` y `granja`
usan `IsDateString`, que también cubre el caso.

**Fix**: reusar `EsFechaContableIso` en los 15. No requiere migración ni cambia
contratos — sólo convierte un 500 en el 422 que corresponde. Aplicar por la
**regla de oro** del CLAUDE.md (al tocar un módulo para agregar features, migrar
primero sus errores), o de una sola vez: son 15 archivos y un import.

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

### 3.3 Modelo de super-admin global — ✅ SALDADA (2026-06-02, change `super-admin`)

El catálogo RBAC es **tenant-scoped**: `PermissionsGuard` exige un
`tenantId` (JWT `activeTenantId` o header `X-Tenant-ID`) y resuelve
permisos contra la membership del caller en ese tenant. No existía
concepto de "super-admin global" en el modelo de datos — `SystemRole`
es `OWNER | ADMIN` por membership, no a nivel de `User`.

**Saldada** con el change `super-admin` (branch `feat/super-admin-impersonation`):
1. `User.isSuperAdmin: Boolean @default(false)` en DB + claim JWT condicional.
2. `SuperAdminGuard` valida el flag directamente (comparación estricta `=== true`).
3. `TenantGuard` con bypass disciplinado: si `isSuperAdmin === true`, saltea
   el lookup de `Membership` y setea `req.tenantId` desde `X-Tenant-ID`.
4. `PermissionsGuard` con short-circuit: si `isSuperAdmin === true`, retorna `true`
   sin consultar `RbacService`.
5. Tabla `platform_audit` + `PlatformAuditInterceptor` para trazabilidad de
   todas las acciones del super-admin.
6. `feature-flags-admin.controller.ts` re-gateado con `SuperAdminGuard` (ya no
   es accesible para owners de tenants arbitrarios).

**Guía de diseño**: `docs/disenos/super-admin-plataforma.md`.
**Doc de seguridad reconciliado**: `docs/claude/seguridad.md §5.4`.

### 3.4 A8 — Drift de extensions Postgres no declaradas en `schema.prisma` — ✅ FIX PARCIAL APLICADO (PR #27)

> **Estado al 2026-06-01**: el fix parcial YA está en `schema.prisma`:
> `previewFeatures = ["postgresqlExtensions"]` + `extensions = [pgTrgm(map: "pg_trgm")]`.
> Esto cierra el drift de la EXTENSIÓN (`pg_trgm` ya no se dropea al regenerar).
> Lo que NO se cierra (ni se puede, son inexpresables en schema): índices GIN
> trigram, uniques/índices parciales con `WHERE` y CHECK multi-columna — siguen
> como raw SQL y dependen del protocolo manual de CLAUDE.md §11.6. La deuda
> residual es organizacional, no técnica.

- **Problema**: `pg_trgm` + índices GIN trigram (módulo `contactos`), índices/uniques parciales con `WHERE` y CHECK constraints multi-columna viven como raw SQL al final de su migration de origen porque Prisma no los expresa nativamente. Cada vez que se regenera una migration nueva, Prisma los detecta como drift y mete `DROP INDEX`/`DROP EXTENSION` al inicio del `migration.sql` regenerado. Si se aplica tal cual, se destruyen los objetos. Detectado al regenerar la migration de `documento-fisico` (Fase 1.4 slice 2) — los DROP fueron eliminados manualmente del SQL antes de aplicar.
- **Fix parcial**: activar `previewFeatures = ["postgresqlExtensions"]` en el `generator client` y declarar `extensions = [pgTrgm]` en `datasource db`. Resuelve el drift de la extensión; los índices GIN trigram, parciales y CHECK seguirán como raw SQL drift porque siguen sin ser expresables en schema.
- **Fix completo**: el protocolo manual del runbook (CLAUDE.md §11.6) — buscar `DROP INDEX`/`DROP EXTENSION`/`DROP TYPE` en cada migration regenerada y verificar contra la lista de objetos raw SQL vivos antes de aplicar. Es un workaround organizacional, no técnico — exige disciplina del agente o dev.
- **Trigger para revisar**: próxima edición de `schema.prisma` que regenere migration. La deuda no se cierra sola: requiere accionar el fix parcial o aceptar el protocolo manual indefinidamente.
- **Esfuerzo**: 30 min para activar el preview feature + agregar `pgTrgm` al datasource + verificar que la próxima migration regenerada no tire `DROP EXTENSION pg_trgm`. El protocolo manual ya quedó documentado en CLAUDE.md §11.6.

---

### 3.5 A9 — Columnas de timestamp son `timestamp` (sin zona), no `timestamptz` — ✅ CERRADA (PR #25)

> **Estado al 2026-06-01**: CERRADA en storage. Las columnas de timestamp se
> migraron a `@db.Timestamptz(3)` (verificado: 54 columnas `Timestamptz`,
> 0 `DateTime` planos fuera de `@db.Date`). La zona es explícita en el tipo,
> ya no depende de la config del contenedor (defense in depth §4.6).
> El pendiente de PRESENTACIÓN (frontend convierte UTC → `America/La_Paz` al
> mostrar) está cubierto por los formateadores de cada feature
> (`Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz' })`), incluido
> `features/granja/lib/formatters.ts`.

- **Problema**: CLAUDE.md §4.6 manda `timestamptz` en UTC para `createdAt`/`updatedAt`/`auditoria.timestamp`, pero el schema usa `DateTime` plano → Prisma genera `TIMESTAMP(3)` (sin time zone) con `DEFAULT CURRENT_TIMESTAMP`. El valor que se guarda depende de la zona de la sesión de Postgres, que no estaba pineada. Detectado al revisar el manejo de fechas (2026-05-20). `fechaContable` (`@db.Date`) está correcta y NO entra en esta deuda.
- **Mitigación YA aplicada** (rama `chore/infra-tz-utc`): `TZ=UTC` + `PGTZ=UTC` + `-c timezone=UTC` en el contenedor `postgres`, y `TZ=UTC` en el contenedor `app` (Dockerfile + compose). Con esto `CURRENT_TIMESTAMP` evalúa en UTC → los valores se persisten en UTC. Cierra el riesgo operativo inmediato, **NO** cambia el tipo de columna.
- **Fix completo (lo que queda como deuda)**: migrar las columnas de timestamp a `@db.Timestamptz(3)` en `schema.prisma`, para que la zona sea explícita en el tipo y la corrección no dependa de la config del contenedor (defense in depth, §4.6).
- **Trigger para hacerlo**: ANTES de que entren datos de producción. Sin datos, migrar `timestamp → timestamptz` es 1 migration trivial; con datos reales exige convertir interpretando la zona de cada fila y validar que nada se corra una hora. Barato hoy, caro mañana.
- **Pendiente relacionado (frontend)**: verificar que la capa de presentación convierte UTC → `America/La_Paz` al mostrar. La corrección de storage NO arregla la presentación — son responsabilidades separadas.
- **Esfuerzo**: ~30 min (cambiar a `@db.Timestamptz(3)` + 1 migration, sin datos prod) + revisión en frontend.

### 3.6 Documento físico (Fase 1.4 slice 2)

**Cerrado en este slice:**
- ✅ `contabilidad.contactos.*` agregado a `common/permisos/catalogo.ts` (deuda retroactiva del slice 1 de contactos, cerrada en la task 8.1 junto con los 8 permisos nuevos de tipos/documentos). 12 permisos en total vía helper `CRUD()`.
- ✅ `monto > 0` del `DocumentoFisico`: el spec REQ-D-01/E-D-07 lo exigía pero la implementación de servicios/DTOs no lo tenía (un documento tributario con `monto: "0.00"` devolvía 201). Cerrado con `@Matches(DECIMAL_POSITIVO)` en los DTOs create/update + unit spec del DTO. Lo destapó la suite E2E (Fase 10).

**Abierto por este slice:**
- **E-EL-02 (`DOCUMENTO_FISICO_CON_HISTORIAL`)**: hoy un documento cuya única asociación se eliminó al anular el comprobante (la TX de `anular` hace `desasociarTodasDelComprobante`) queda **elegible para DELETE**, porque `countAsociaciones = 0`. Para retener histórico real (que el auditor espera) hace falta una **tabla de auditoría de asociaciones** que registre los vínculos a comprobantes anulados. El test E-EL-02 quedó como `it.todo` y el error `DocumentoFisicoConHistorialError` existe pero no se lanza. Riesgo R6 del design. **Trigger**: requerimiento explícito de un auditor o contador.
- **Estado derivado `SUELTO|EN_BORRADOR|CONTABILIZADO`**: se calcula en runtime con `where: { asociaciones: { some/none } }` (sub-query EXISTS). Materializarlo como columna denormalizada solo si el listado por estado se vuelve lento (>100k filas). Riesgo R5. **Trigger**: regresión medida con `EXPLAIN`.
- **Reapertura de período + `refrescarEstadoComprobante`**: cuando `PeriodosFiscalesModule` implemente la reapertura (hoy diferida), debe re-sincronizar el cache `comprobanteEstado` de las asociaciones del comprobante que vuelve de BLOQUEADO a CONTABILIZADO. El enchufe está pendiente. Decisión D8 / Riesgo R1. **Trigger**: implementación de reapertura.
- **Campo `descripcion` de `TipoDocumentoFisico`**: el spec §7 + REQ-T-01/T-05 lo piden, pero schema, service y DTOs lo omitieron (se difirió en la task 6.1 para no meter una migración en un commit HTTP). Si se quiere, agregar columna nullable `descripcion String?` + inputs del service + repo + response mapper en un commit aparte. **Trigger**: si la UI necesita una descripción larga del tipo.

---

### 3.7 Huecos de borde en la integridad de extractos (change `informe-conciliacion-bancaria`)

**Abierto por este change:**
- ~~**`detectarHuecos` solo ve huecos ENTRE importaciones.**~~ — ✅ **CERRADA 2026-07-26.** `detectarHuecosDeBorde(rangos, ventana)` en `cobertura-extracto.ts` compara la cobertura contra la ventana `arranque.fecha < fecha ≤ corte` y el informe emite `HUECO_INICIAL` / `HUECO_FINAL` (REQ-ICB-05c). Se dejó como función SEPARADA en vez de darle ventana a `detectarHuecos`: esa sirve al endpoint `/integridad`, donde la serie se juzga sola y no existen ni arranque ni corte — meterle el concepto ahí habría sido acoplar dos preguntas distintas.
  - **El caso que justifica el motivo** (y que ningún otro cubre): con cobertura únicamente ANTERIOR al arranque, `saldoExtracto` NO es nulo —sale de un movimiento viejo— así que `SIN_SALDO_EXTRACTO` no se dispara y el informe cerraba mostrando un saldo de mayo como si fuera el del 31/07, sin una sola señal. Está congelado como test.
  - **El borde final se advierte sin mirar el reloj**: que el tramo todavía no haya ocurrido no lo vuelve conciliable, y el saldo comparado sigue sin ser el del día pedido. Evita además meter `ClockPort` en un cálculo que no lo necesita (§4.6).
  - **Sin arranque no se emite ningún borde**: no hay ventana, y `SIN_ARRANQUE` ya retiene la conclusión. Reclamar cobertura ahí sería exigírsela a quien todavía no declaró desde dónde mirar.

**Menor, del mismo change:**
- ~~La atribución del historial de arranques muestra `declaradoPorUserId` **crudo**~~ — ✅ **CERRADA 2026-07-26**. Se abrió `UsuarioReaderPort` en `users/` (módulo-puerto leaf, molde `lineas-cuenta-reader.module.ts`) y el DTO viaja con `declaradoPorNombre`. El cruce temido hacia `members` no hizo falta: el port filtra por membresía del tenant —único predicado que impide leer nombre y email de otra organización, porque `User` es global— y devuelve `displayName ?? email`. Es el primer reader de identidad del repo: hasta acá TODOS los `*PorUserId` salían crudos al cliente, así que queda disponible para el resto.
- `vigenteA` desempata por `createdAt` con precisión de milisegundos: dos declaraciones dentro del mismo ms serían ambiguas. Irrelevante para actos humanos; si algún día se declara por lote, sumar `id` al orden.

**Abierta por la corrección de 2026-07-26 (auditoría posterior al merge):**
- **Las partidas abiertas del arranque no se pueden derivar solas.** Una línea contable anterior al arranque sin movimiento que la reclame es indistinguible entre un cheque en circulación —que SÍ es partida— y el asiento de apertura, cuyo saldo ya está dentro del extracto declarado. Si la organización importó extractos recién desde el arranque, TODA línea anterior parece en tránsito. Se resolvió poniéndolo a confirmación del contador, con la verificación aritmética `Σ partidas = saldoLibros − saldoExtracto + residual` como desambiguador. **Lo que queda**: cuando SÍ hay cobertura de extractos anterior al arranque, los candidatos podrían pre-marcarse solos y dejar la confirmación como revisión en vez de como carga. **Trigger**: si adoptar una cuenta con historia larga se vuelve tedioso.
- **El anti-join "líneas sin match" no se puede expresar.** El ancla `(comprobanteId, orden)` de `MatchConciliacion` no tiene FK (deliberado, ver el modelo), así que Prisma no puede filtrar por relación; y el SQL crudo contra `lineas_comprobante` desde `conciliacion-bancaria` está vedado por `no-escribe-comprobantes.arch.spec.ts` (esquivaría el read port y su filtro de tenant). Por eso las partidas abiertas se CONGELAN al declarar en vez de derivarse en cada lectura. No es deuda a pagar — es una restricción del diseño que conviene tener escrita antes de que alguien intente el atajo.

### 3.8 Frontend del piloto comercial (change `ventas-piloto`, Fase 6)

**Menor, abierta — ya son TRES instancias (2026-07-30):**
- `mensaje-items.ts`, `mensaje-ventas.ts` y `mensaje-cobros.ts` viven en `features/<x>/lib/` en vez de `src/lib/error-messages.ts`, donde el resto de los módulos concentra los mapeos de códigos de error del backend (`mensajePeriodosFiscales`, `mensajeComprobantes`, `mensajeDocumentosFisicos`, `mensajeCierreEjercicio`, `mensajeConciliacion`).
  - Nació como una excepción en el PR #313 y el PR del piloto comercial la **replicó dos veces**, a sabiendas: los agentes tenían prohibido tocar `error-messages.ts` para no colisionar entre sí. Es el mecanismo típico por el que una excepción se vuelve el patrón — cada instancia nueva es más barata de agregar que de consolidar.
  - **Por qué NO se consolidó en ese mismo PR**: son 371 líneas en 6 archivos y 10 sitios de import, con cero cambio de conducta. Meter un refactor mecánico de ese tamaño en un PR que ya trae 3 features, el nav y un arreglo de contrato del backend ensucia el diff y le quita valor al `git bisect` (§9.3). Va como change propio.
  - Al consolidar: mover las tres funciones a `src/lib/error-messages.ts` con sus tests, respetando el orden alfabético de las secciones existentes, y borrar los `features/<x>/lib/mensaje-*.ts`.

**Menor, abierta — resolución de nombres en los listados comerciales:**
- Los listados de ventas y cobros resuelven `contactoId`/`cuentaDestinoId` con `useContactos`/`useCuentas` a `pageSize: 100`, que es el tope del backend (`LIST_MAX_PAGE_SIZE`). Con más de 100 contactos activos, las filas de arriba muestran el **UUID crudo** en vez de la razón social. Mismo patrón —y misma deuda— que `CuentaAutocomplete`. La salida real es que el listado proyecte el nombre desde el backend (como ya hace `ComprobanteListItemDto` con sus contactos embebidos), no subir el tope.
- En la pantalla de edición de un cobro, una venta ya **SALDADA** aparece con su UUID: el estado de cuenta solo publica ventas con saldo > 0, así que la aplicación existente no encuentra su fila. Se resuelve leyendo `useVentas({ contactoId })` en esa pantalla.

**Clase de bug que apareció acá y conviene tener escrita — no es deuda, es una regla:**
- **Un requisito que manda `details` para que el usuario los LEA no está cumplido hasta que el frontend los muestre.** REQ-ITM-05 exige rechazar la desactivación de una cuenta enchufada a ítems "devolviendo en `details` la lista de ítems afectados" (Anti-41: *el admin no desactiva una cuenta sin saber que está enchufada*). El backend cumplía al pie de la letra y el diálogo del frontend caía al fallback genérico, así que el admin leía "re-mapealos" sin saber cuáles: el requisito estaba verde en los tests del backend y **muerto en la pantalla**. Cerrado en el PR #313.
  - **Por qué se escapa**: el error lo TIRA un módulo (`cuentas`) y lo CAUSA otro (`items`). Quien construye la feature nueva no mira el diálogo de la vieja, y quien revisa la vieja no sabe que apareció un código nuevo. Cuando un change agrega un error code a un módulo ajeno, revisar **quién lo renderiza**, no solo quién lo lanza.
  - Ya existía el molde a copiar (`conceptosBloqueantes` para `CUENTA_CONFIGURADA_COMO_CONCEPTO`, el error hermano del mismo diálogo). El costo de la omisión no fue no saber cómo, fue no mirar.

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

### 5.2 — Import directo de **error classes** entre módulos

`documentos-fisicos.service.ts` importa y throwea `TipoDocumentoFisicoNoEncontradoError`,
`TipoDocumentoFisicoInactivoError`, `ContactoNoEncontradoError` de módulos vecinos.
`comprobantes.service.ts` importa y throwea `DocumentoFisicoYaAsociadoAOtroContabilizadoError`.

**Por qué se acepta como divergencia**:
- Una clase de error es **contrato público del módulo proveedor** — parte de su superficie
  expuesta vía port, no una implementación interna. El `code` estable del error
  (`{MODULO}_{SUBDOMINIO}_{CONDICION}`) ya forma parte del contrato que el frontend consume.
- Re-throwear como error propio generaría duplicación sin información nueva y un
  breaking change de los códigos que el frontend usa.
- Mover los errores comunes a `common/errors/` solo aplicaría si fueran genuinamente
  transversales. No es el caso: `ContactoNoEncontradoError` pertenece al dominio
  `contactos`; los demás, a sus módulos respectivos.

**Condiciones del patrón aceptado**:
- Solo se importan **classes de error** (subclases de `DomainError`) — no services,
  no repositorios, no ports concretos de otro módulo.
- La clase de error importada debe vivir en `<otro-modulo>/domain/<otro-modulo>-errors.ts`
  (carpeta `domain/`, sin lógica más allá del code + message).
- El service consumer **throwea** el error tal cual o lo deja propagar. No se permite
  catchear-y-re-throwear con la misma semántica (eso sería duplicar el contrato).

**Detectado**: 2026-05-28, exploración SDD `sdd/deudas/explore`.

### 5.3 — Prisma runtime en domain — política de severidad (L1/L2/L3)

`CLAUDE.md §3.5` dice "dominio puro: NO importar Prisma runtime; `import type` sí".
La auditoría 2026-05-28 (`engram://sdd/deudas/explore`) encontró 8 archivos en
`backend/src/**/domain/**` con value imports de `@prisma/client`. **No son
una sola deuda uniforme** — hay tres niveles muy distintos de severidad, cada
uno con política propia.

| Nivel | Definición | Archivos | Política |
|-------|-----------|----------|----------|
| **L1 — Runtime real** | `new X()` o `instanceof X` de tipo Prisma usado en lógica de dominio | `common/domain/money.ts` (usa `new Prisma.Decimal`, `instanceof Prisma.Decimal`) | **Divergencia aceptada**. Documentada acá. NO se migra. |
| **L2 — Enum value import** | `Record<EnumPrisma, ...>`, `===` con miembro del enum, iteración sobre el enum — el enum entra al runtime | `common/domain/cierre-fiscal-por-tipo-empresa.ts` (`TipoEmpresa`), `memberships/domain/membership-role.ts` (`SystemRole`), `cuentas/domain/cuenta-validator.ts` (`ClaseCuenta`, `NaturalezaCuenta`, `SubClaseCuenta`), `comprobantes/domain/numeracion.ts` (`TipoComprobante`), `comprobantes/domain/numero-comprobante.ts` (`TipoComprobante`), `comprobantes/domain/comprobante-validator.ts` (`Moneda`), `configuracion-contable/domain/concepto-reglas.ts` (`ClaseCuenta`) | **Deuda real, política incremental**. Se migra al tocar el módulo (regla de oro de abajo). |
| **L3 — Type-only mal escrito** | El import es value pero el uso es 100% type-only (annotations, generics) | `comprobantes/domain/comprobante-validator.ts:23` (`Prisma.Decimal` en `LineaParaValidar`) | **Bug trivial**. Fix con `import type`. Se incluye en este PR como subset cierto y barato. |

#### Política L1 — `Prisma.Decimal` runtime en `Money`

`common/domain/money.ts` usa `new Prisma.Decimal(value)` y `value instanceof Prisma.Decimal`
para construir y validar montos. Bajo el ideal §3.5, debería usar `Decimal` de
`decimal.js` directamente. Lo dejamos como divergencia aceptada por tres razones:

1. **Costo del cambio supera el beneficio**: `toPrismaDecimal()` (line 135 de
   `money.ts`) es invocado por cada adapter que persiste algo derivado de `Money`.
   Migrar a `Decimal` requeriría envolver toda persistencia con un cast
   `decimal → Prisma.Decimal` en ~15 lugares (comprobantes, cuentas, tipos de
   cambio, UFV, etc.). El beneficio de pureza no compensa.
2. **Precedente**: `import type { Prisma }` ya es divergencia aceptada desde
   Fase 1.0 (§5.1 implícito de este mismo documento).
3. **El motor de decimales es el mismo**: `Prisma.Decimal` ES `decimal.js`
   bundleado dentro del runtime de Prisma. No estamos eligiendo otra librería;
   estamos eligiendo usar el bundle de Prisma en vez de la dep directa.

**Mitigación introducida en este PR**: `decimal.js@^10.5.0` agregado como
dep directa en `backend/package.json` (Prisma 6.19.x bundlea `10.5.0`).
Documenta lo que YA usamos. Si Prisma cambia su bundling en un upgrade
mayor, la dep directa actúa como ancla — el motor de decimales no cambia
silenciosamente al actualizar Prisma.

**Política de versión**: caret `^10.5.0`. Si Prisma upgrade trae
`decimal.js@10.6.x`, pnpm resuelve consistente. Si Prisma rompe a `11.x`,
ya es breaking change que requiere intervención humana de todos modos.
**No usar exact-pinning** (`"10.5.0"`) — crea fricción con cada upgrade
de Prisma.

**Si en el futuro se migra el motor** (cambio de ORM, Prisma rompe
semántica de decimales): reemplazar `Prisma.Decimal` por `Decimal` de
`decimal.js` en `money.ts` y agregar `toPrismaDecimal()` cast a cada
adapter persistente. Deuda diferida documentada.

#### Política L2 — Enum value imports, migración incremental

El enum entra al runtime (lookup, comparación, iteración). Para una pureza
estricta hay que:
1. Redefinir el enum propio en `<modulo>/domain/enums.ts` o `common/domain/enums.ts`
   (ver convención abajo).
2. Mapear `dominioEnum ↔ prismaEnum` en el adapter del módulo dueño.

**No se migran en lote**. Los 7 enums afectados (`TipoEmpresa`, `SystemRole`,
`ClaseCuenta`, `NaturalezaCuenta`, `SubClaseCuenta`, `TipoComprobante`, `Moneda`)
viven en 12+ módulos. Un PR batch tocaría todo el backend → viola branch ≤ 3 días
(§9.2 CLAUDE.md) y blast radius enorme contra beneficio chico (el dominio sigue
funcionando bien con value imports).

**Regla de oro (vigente desde 2026-05-28)**: al tocar un módulo del backend
para agregar features o refactor, **migrar primero los value imports de Prisma
de su `domain/` a enums propios + mapper** antes de la feature. La deuda no
crece (la regla previene acumulación nueva) y se resuelve al ritmo que cada
módulo va siendo tocado por trabajo de negocio.

**Convención: dónde vive cada enum propio (Opción C)**:

- **Cross-module** (usado en >1 módulo) → `backend/src/common/domain/enums.ts`.
  Candidatos: `Moneda`, `SystemRole`, `TipoEmpresa`, `TipoComprobante`, `ClaseCuenta`,
  `NaturalezaCuenta`, `SubClaseCuenta`.
- **Single-module** (usado solo dentro del módulo dueño) → `<modulo>/domain/enums.ts`.
  Hoy ningún enum queda en esta categoría: `NaturalezaCuenta` y `SubClaseCuenta` se
  promovieron a `common/` en el PR #96 cuando `reportes` empezó a consumirlos. Lección:
  un enum "single-module" deja de serlo apenas un segundo módulo lo lee — al promoverlo,
  borrá el barrel re-export del módulo original si queda sin consumidores (era dead code).

Mismo criterio que rige para errores (`common/errors/` vs `<modulo>/domain/<modulo>-errors.ts`).

**Convención: forma del enum propio**:
- Nombre en español (igual que el de Prisma): `enum Moneda { BOB = 'BOB', USD = 'USD' }`.
- Valores idénticos string-for-string a Prisma — el mapper es identity en runtime,
  solo separa los namespaces.

**Convención: mapper dominio ↔ Prisma**:
- Vive en el adapter del módulo dueño del enum. NO en `common/adapters/` (eso
  acoplaría `common` a Prisma).
- **Un módulo consumidor que lee Prisma en su propio boundary tiene su PROPIO
  mapper; NO importa el del dueño.** Importar el adapter de otro módulo violaría
  §3.3 (cruce de frontera sin port). Ej: `reportes/adapters/enum-mappers.ts`
  (PR #96) mapea `ClaseCuenta`/`SubClaseCuenta`/`NaturalezaCuenta` Prisma→dominio
  sin tocar `cuentas/adapters/enum-mappers.ts`. La duplicación del `Record` identity
  es intencional y barata (es un guard de compile-time). El mapper expone solo el
  sentido que ese boundary usa: `reportes` solo lee → solo `toDominio*`.
- Naming: `toDominio<Enum>(p: PrismaEnum): Enum` y `toPrisma<Enum>(d: Enum): PrismaEnum`.
- Si el adapter mapea 1 solo enum: inline en el archivo del repository.
- Si el adapter mapea 2+: archivo separado `<modulo>/adapters/enum-mappers.ts`.

```typescript
// Ejemplo de mapper inline (cuando el módulo migre Moneda):
// backend/src/comprobantes/adapters/prisma-comprobantes.repository.ts

import { Moneda as PrismaMoneda } from '@prisma/client';
import { Moneda } from '@/common/domain/enums';

function toDominioMoneda(p: PrismaMoneda): Moneda {
  return Moneda[p];  // identity: mismos valores string
}

function toPrismaMoneda(d: Moneda): PrismaMoneda {
  return PrismaMoneda[d];
}
```

#### Política L3 — Type-only mal escrito

Si el uso del símbolo importado es 100% en `type` annotations (params de
interfaces, generics, return types), el import debe ser `import type`.
Si está como value import por error, es bug trivial — fix de 1 línea.

`comprobantes/domain/comprobante-validator.ts:23` fue el único caso encontrado
en la auditoría 2026-05-28. Resuelto en este PR.

**Cómo detectarlo en revisión**: si removés el símbolo del runtime (mental
trick: ¿el código compila si reemplazo `import { X }` por `declare const X: any`?)
y el archivo sigue compilando, es type-only.

#### Resumen de qué cubre este PR vs qué queda

| Item | Estado |
|------|--------|
| L1 documentado como divergencia aceptada | ✅ acá |
| `decimal.js@^10.5.0` como dep directa explícita | ✅ acá |
| L3 fix en `comprobante-validator.ts` | ✅ acá |
| L2 política + convenciones (enum location, mapper naming) | ✅ acá (documentación) |
| L2 migración de los 7 enums | 🟡 incremental, regla de oro al tocar cada módulo. Avance: `cuentas` (`NaturalezaCuenta`/`SubClaseCuenta` — PR #37 C/D), `reportes` + promoción de ambos a `common/` (PR #96) |
| `Money` migrado a `Decimal` de `decimal.js` directo | 🔲 diferido (solo si cambia ORM o Prisma rompe semántica) |
| ESLint rule custom para detectar value imports de Prisma en `domain/` | 🔲 fuera de scope (tooling) |

---

## 6. Reglas de oro al atacar la deuda

1. **Verde entre cada commit** (typecheck + suite tests del subsistema).
2. **Commits atómicos**: no mezclar refactor de 2 módulos en un commit.
3. **Cuando toques un módulo de Fase 0, hexagonalo antes de agregar features nuevas** — no acumular más deuda encima.
4. **Los ports se definen primero, los adapters después** — si aparece la tentación de saltarse el port "porque solo hay un adapter", releer CLAUDE.md §3.2 ("incluso con un solo adapter, la consistencia es el beneficio").
5. **Todo port cross-module arranca con superficie mínima** — no copiar el Repository entero al Reader. Si el consumidor solo necesita `isActive`, expone solo `isActive`.

---

## 7. Priorización recomendada

### Cola VIGENTE (actualizada 2026-07-30)

Lo de abajo son las deudas **abiertas**, en el orden en que conviene atacarlas.
Ninguna es bloqueante y ninguna va antes de la Fase 5 de `ventas-piloto`.

```
§2.4  fechas validadas sólo con regex → 500        [1h]   ← primera
§2.3  trigger de auditoría: ''::boolean sin NULLIF [2h]
§3.3  modelo de super-admin global                 [—]
§3.1  VOs oportunísticos (Email, Password, Nit)    [—]    ← al tocar cada archivo
§3.6  documento físico (items con trigger)         [—]
      migración L2 de enums Prisma, incremental    [—]    ← regla de oro §5.3
```

**Por qué §2.4 primero**: es la única de las dos nuevas que **puede dispararse
hoy**. Un usuario escribe una fecha que no existe (`"2026-02-31"` pasa el regex) y
recibe un **500** en vez de un 422 con mensaje claro. No corrompe ni pierde nada
—es un mensaje de error malo— pero es lo más barato de arreglar de toda la lista:
reusar `EsFechaContableIso` (`backend/src/ventas/dto/es-fecha-contable-iso.ts`)
en los 14 DTOs restantes. Un import y un decorador por archivo, sin migración y
sin cambio de contrato.

**Por qué §2.3 después**: verificado que **no es alcanzable hoy** (todos los call
sites pasan `tx`). El fix es una línea, pero su costo real es la **migración**,
que hay que escribir a mano con el protocolo §11.6 porque recrea la función del
trigger — y `prisma migrate dev` está bloqueado en este repo. Decisión de Marco
(2026-07-29): change propio, no mezclado con una feature.

### Histórico — cola original (todas CERRADAS)

```
§1.1 deudas puntuales Fase 1.x        [2h]   ✅ 2026-04-25
§1.2 RBAC cache invalidation port     [3h]   ✅ 2026-04-25
§2.1 users → hexagonal                [2h]   ✅ 2026-04-24
§2.1 auth → hexagonal                 [2h]   ✅ 2026-04-24
§2.2 feature-flags → hexagonal        [2h]   ✅ 2026-04-24
§3.2 tenants / custom-roles                  ✅ 2026-04-25 (a/b/c/d)
```

---

**Última revisión**: 2026-07-30 — se suman **§2.3** (trigger de
`comprobantes_audit` casteando `''::boolean` sin `NULLIF`, latente) y **§2.4**
(14 DTOs con fechas validadas sólo por regex ⇒ `RangeError` crudo ⇒ 500
alcanzable hoy), detectadas al construir la Fase 4 de `ventas-piloto`. La cola
del §7 se rehizo: la original estaba entera cerrada y seguía figurando como
pendiente, así que quien la leyera trabajaba sobre una lista falsa. **No es
deuda pero se anota**: el umbral de RSS del health check pasó de 300 a 512 MB
(`fix(health)`, PR #309) porque 300 ya lo excedía `main` — si el consumo sigue
creciendo ~6 MB por módulo, revisarlo de nuevo alrededor de los 30 módulos.

**Revisión previa**: 2026-06-01 (§3.4 (A8) fix parcial aplicado PR #27 +
§3.5 (A9) cerrada PR #25 — reconciliado contra `schema.prisma` real durante
el slice de frontend granja). Cierres previos (2026-04-25): §1.1 + §1.2 +
§2.1 A/B + §2.1 remanente + §2.2 + §3.2.a + §3.2.b + §3.2.c + §3.2.d;
CERO fugas cross-módulo documentadas activas, CERO módulos Fase 0
sin hexagonalizar. Deuda viva: §3.3 super-admin global, §3.1 VOs
oportunísticos (Email, Password, Token, Nit en más lugares),
§3.6 documento físico (items con trigger), migración L2 enums Prisma
incremental (regla de oro §5.3).
**Auditoría fuente**: 4 agentes de exploración sobre 13 módulos, grep de
imports cross-module, verificación de Symbol + abstract class bindings,
revisión de `@Inject` en services.
