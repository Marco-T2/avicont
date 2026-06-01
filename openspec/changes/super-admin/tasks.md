# Tasks: super-admin

<!--
Última edición: 2026-06-01
Owner: backend-lead
-->

> Change: `super-admin`
> Spec: `openspec/changes/super-admin/spec.md`
> Design: `openspec/changes/super-admin/design.md`
> TDD estricto: tests PRIMERO en todos los slices con lógica no-trivial.
> Scope de commit: un scope por slice (ver cada sección).
> Backend e2e: siempre con `DATABASE_URL` inline + `--runInBand --forceExit` (CLAUDE.md §11.3).

---

## Slice 1 — Migration aditiva `User.isSuperAdmin`

Scope de commit: `feat(db): add User.isSuperAdmin boolean field`
REQ cubiertos: REQ-SA-01
Migration: SÍ

- [ ] **T1.1 — Protocolo §11.6 previo**
  - Antes de generar la migration, leer `docs/claude/dominio-contable.md` §4.1–4.2.
  - Ejecutar: `grep -E "^DROP (INDEX|EXTENSION|TYPE)" prisma/migrations/<ts>_*/migration.sql`
    para verificar que la migration regenerada no incluya DROPs de la lista del CLAUDE.md §11.6.
  - Si aparece algún DROP de la lista → borrarlo y dejar comentario referenciando la migration de origen.

- [ ] **T1.2 — TEST de integración primero** (TDD)
  - Archivo: `backend/src/users/users.integration.spec.ts` (nuevo, o extender si existe)
  - Describe: `'REQ-SA-01: campo isSuperAdmin'`
  - Casos:
    - `'todos los usuarios existentes tienen isSuperAdmin = false por defecto'`:
      crear un `User` sin pasar el campo → verificar que `user.isSuperAdmin === false`.
    - `'el campo no aparece en UserResponseDto'`:
      verificar que la serialización de `UserResponseDto` no incluye la clave `isSuperAdmin`.
  - Ejecutar: falla (rojo) → avanzar a T1.3.
  - Comando: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" pnpm exec jest src/users/users.integration.spec.ts --runInBand --forceExit`

- [ ] **T1.3 — Agregar `isSuperAdmin` al schema Prisma**
  - Archivo: `backend/prisma/schema.prisma`
  - En el model `User` agregar: `isSuperAdmin Boolean @default(false)`
  - NO agregar el campo a ningún DTO de respuesta ni a la interface de `UserResponseDto`.

- [ ] **T1.4 — Agregar `PlatformAudit` al schema Prisma**
  - Archivo: `backend/prisma/schema.prisma`
  - Agregar el model `PlatformAudit` según el esqueleto del design §5:
    - `id`, `actorUserId`, `action`, `targetOrganizationId?`, `payload?`, `createdAt @db.Timestamptz(3)`.
    - Relación `actor User @relation("PlatformAuditActor", ...)`.
    - Relación `targetOrganization Organization? @relation(...)`.
    - `@@index([actorUserId, createdAt])`, `@@index([targetOrganizationId, createdAt])`.
    - `@@map("platform_audit")`.
  - Agregar relaciones inversas en `User` (`platformAudits PlatformAudit[] @relation("PlatformAuditActor")`)
    y en `Organization` (`platformAudits PlatformAudit[]`).
  - Nota: dos models en un solo schema change → una sola migration aditiva para este slice.

- [ ] **T1.5 — Generar y aplicar migration**
  - Desde `backend/`:
    ```bash
    DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
      pnpm exec prisma migrate dev --name user_is_super_admin_and_platform_audit
    ```
  - Verificar que la migration generada contenga:
    - `ALTER TABLE "users" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;`
    - `CREATE TABLE "platform_audit" (...);`
  - Aplicar protocolo §11.6: repetir el grep del T1.1 sobre la migration recién generada.
  - Verificar post-apply: `docker compose exec postgres psql -U postgres -d saas -c "\d users"` (columna presente).

- [ ] **T1.6 — Verificar verde**
  - Correr tests de integración del T1.2 → todos verdes.
  - Typecheck: `pnpm exec tsc --noEmit -p tsconfig.json` desde `backend/`.

---

## Slice 2 — Claim JWT + propagación + revocation-epoch en Redis

Scope de commit: `feat(auth): add isSuperAdmin JWT claim and revocation epoch`
REQ cubiertos: REQ-SA-02, REQ-SA-03, REQ-SA-04
Migration: NO

- [ ] **T2.1 — TEST unitario: claim JWT** (TDD)
  - Archivo: `backend/src/auth/domain/jwt-claims.spec.ts` (extender el existente)
  - Describe: `'REQ-SA-02: claim isSuperAdmin en JWT'`
  - Casos:
    - `'forUser incluye isSuperAdmin: true solo cuando se pasa true'`:
      verificar que `JwtClaims.forUser({ ..., isSuperAdmin: true }).payload.isSuperAdmin === true`.
    - `'forUser NO incluye isSuperAdmin cuando es false o ausente'`:
      verificar que la clave `isSuperAdmin` NO existe (ni como `false`) en el payload resultante.
    - `'token de impersonation no hereda isSuperAdmin'` (REQ-SA-04):
      verificar que `ImpersonationJwtClaims.forImpersonation(...)` no incluye `isSuperAdmin`.
  - Ejecutar: `pnpm exec jest src/auth/domain/jwt-claims.spec.ts`

- [ ] **T2.2 — TEST unitario: JwtStrategy propaga el claim** (TDD)
  - Archivo: `backend/src/auth/strategies/jwt.strategy.spec.ts` (nuevo)
  - Describe: `'REQ-SA-02: JwtStrategy.validate propaga isSuperAdmin'`
  - Casos (mockeando `RedisService` y `ClockPort`):
    - `'super-admin: isSuperAdmin normaliza a true en req.user'`.
    - `'usuario regular: isSuperAdmin normaliza a false aunque el campo esté ausente'`.
    - `'token revocado por epoch: isSuperAdmin: true en payload pero Redis marca más nueva que iat → UnauthorizedException'` (REQ-SA-03).
    - `'token válido post-epoch: iat posterior a la marca Redis → pasa'`.
  - Ejecutar: `pnpm exec jest src/auth/strategies/jwt.strategy.spec.ts`

- [ ] **T2.3 — Modificar `JwtPayload` e interface**
  - Archivo: `backend/src/auth/domain/jwt-claims.ts`
  - Agregar `isSuperAdmin?: boolean` a la interface `JwtPayload` (con `exactOptionalPropertyTypes`).
  - En `JwtClaims.forUser`: agregar parámetro `isSuperAdmin?: boolean` y spread condicional:
    `...(params.isSuperAdmin === true ? { isSuperAdmin: true } : {})`.
  - Confirmar que `ImpersonationJwtClaims.forImpersonation` NO recibe ni escribe el campo.

- [ ] **T2.4 — Modificar `JwtStrategy.validate` + inyectar Redis y ClockPort**
  - Archivo: `backend/src/auth/strategies/jwt.strategy.ts`
  - Inyectar `RedisService` (desde `@/cache`) y `ClockPort` (desde `@/common/domain`) en el constructor.
  - En `validate(payload: JwtPayload)`:
    - Si `payload.isSuperAdmin === true`, chequear Redis: `get('superadmin:revoked:<sub>')`.
      - Si la clave existe y `revokedAt > payload.iat * 1000` → `throw new UnauthorizedException('Token revocado')`.
    - Retornar `{ ..., isSuperAdmin: payload.isSuperAdmin === true }` (normalizar a boolean).
  - Registrar `RedisService` y `ClockPort` en `backend/src/auth/auth.module.ts` si no están ya inyectados en el módulo.

- [ ] **T2.5 — Modificar `auth.service.ts`: los 3 call sites de `JwtClaims.forUser`**
  - Archivo: `backend/src/auth/auth.service.ts`
  - Los 3 call sites: `login` (~línea 95), `refresh` (~línea 127), `switchTenant` (~línea 160).
  - `login`: ya carga el `User` → pasar `isSuperAdmin: user.isSuperAdmin`.
  - `switchTenant`: ya carga el `User`/membership → pasar `isSuperAdmin: user.isSuperAdmin`.
  - `refresh`: NO carga el `User` hoy (solo `stored.userId`) → agregar lookup mínimo:
    `const user = await this.usersReader.findById(stored.userId)` (o `prisma.user.findUniqueOrThrow`
    si no hay port para esto) → pasar `isSuperAdmin: user.isSuperAdmin`.

- [ ] **T2.6 — Implementar escritura del revocation-epoch en Redis**
  - Archivo: `backend/src/auth/auth.service.ts` (o un método dedicado en un servicio de revocación)
  - Extraer/crear función `revocarTokensSuperAdmin(userId: string)`:
    - Clave Redis: `superadmin:revoked:<userId>`.
    - Valor: timestamp actual via `ClockPort.now()` en ms (string).
    - TTL: 3600 segundos (vida del access token).
    - Usar `RedisService.set(key, ts, 3600)`.
  - Esta función se llama desde el CLI de revoke (Slice 5) y debe poder invocarse de forma standalone.

- [ ] **T2.7 — Verificar verde**
  - Correr tests unitarios: `pnpm exec jest src/auth/domain/jwt-claims.spec.ts src/auth/strategies/jwt.strategy.spec.ts`
  - Typecheck: `pnpm exec tsc --noEmit -p tsconfig.json`

---

## Slice 3 — `SuperAdminGuard` + bypass `TenantGuard` + short-circuit RBAC

Scope de commit: `feat(rbac): add SuperAdminGuard, TenantGuard bypass, and RBAC short-circuit`
REQ cubiertos: REQ-SA-05, REQ-SA-06, REQ-SA-07
Migration: NO

- [ ] **T3.1 — TEST unitario: `SuperAdminGuard`** (TDD — casos + y − PRIMERO)
  - Archivo: `backend/src/common/guards/super-admin.guard.spec.ts` (NUEVO)
  - Describe: `'REQ-SA-05: SuperAdminGuard'`
  - Casos:
    - `'[+] super-admin con isSuperAdmin === true → pasa el guard'`.
    - `'[-] usuario regular (isSuperAdmin === false) → 403'`.
    - `'[-] isSuperAdmin truthy pero no === true (ej: 1) → 403'` (comparación estricta).
    - `'[-] req.user undefined → 403'`.
    - `'[-] request sin JWT previo (JwtAuthGuard rechazó antes) — el guard no debe ser invocado'` (nota: este caso se verifica en el e2e del Slice 6, no acá).
  - Ejecutar: `pnpm exec jest src/common/guards/super-admin.guard.spec.ts`

- [ ] **T3.2 — TEST unitario: `TenantGuard` bypass** (TDD — invariante §4.2 CRÍTICO)
  - Archivo: `backend/src/common/guards/tenant.guard.spec.ts` (extender o crear)
  - Describe: `'REQ-SA-06: TenantGuard bypass para super-admin'`
  - Casos:
    - `'[+] super-admin con X-Tenant-ID sin membresía → pasa y setea req.tenantId'`.
    - `'[-] NO-super-admin sin membresía en la org → 403 (invariante §4.2 intacto)'`.
    - `'[-] super-admin SIN X-Tenant-ID → error (no hay tenant de destino válido)'`.
    - `'[-] req.user.isSuperAdmin truthy pero no === true → bypass NO se activa'`.
  - Ejecutar: `pnpm exec jest src/common/guards/tenant.guard.spec.ts`

- [ ] **T3.3 — TEST unitario: `PermissionsGuard` short-circuit y `RbacService`** (TDD)
  - Archivo: `backend/src/rbac/guards/permissions.guard.spec.ts` (extender o crear)
  - Describe: `'REQ-SA-07: short-circuit RBAC para super-admin'`
  - Casos:
    - `'[+] super-admin corto-circuita sin invocar RbacService'`:
      spy sobre `RbacService.hasPermission` → no debe llamarse para el super-admin.
    - `'[-] no-super-admin OWNER sigue el flujo normal del resolver'`.
  - Archivo: `backend/src/rbac/rbac.service.spec.ts` (extender)
  - Casos en `RbacService`:
    - `'esSuperAdmin: true en ResolvedPermissions → hasPermission retorna true para cualquier permiso'`.
    - `'esSuperAdmin: false → sigue el matcher normal'`.
  - Ejecutar: `pnpm exec jest src/rbac/guards/permissions.guard.spec.ts src/rbac/rbac.service.spec.ts`

- [ ] **T3.4 — Implementar `SuperAdminGuard`**
  - Archivo: `backend/src/common/guards/super-admin.guard.ts` (NUEVO)
  - Esqueleto del design §3 (~18 líneas): `@Injectable() export class SuperAdminGuard implements CanActivate`.
  - Exportar desde `backend/src/common/guards/index.ts`.

- [ ] **T3.5 — Modificar `TenantGuard` con bypass disciplinado**
  - Archivo: `backend/src/common/guards/tenant.guard.ts`
  - Insertar el bloque de bypass ANTES del lookup de `Membership` (forma del design §2):
    `if (user?.isSuperAdmin === true) return true;`
  - El filtro `WHERE organizationId` de los repositorios NO se toca.
  - Añadir comentario regulatorio: referencia a `docs/disenos/super-admin-plataforma.md §4.3`.

- [ ] **T3.6 — Modificar `PermissionsGuard` con short-circuit**
  - Archivo: `backend/src/rbac/guards/permissions.guard.ts`
  - Insertar el bloque de short-circuit al tope del `canActivate` (forma del design §1):
    `if (user.isSuperAdmin === true) return true;`
  - Añadir comentario referenciando el diseño.

- [ ] **T3.7 — Modificar `ResolvedPermissions` y `RbacService`**
  - Archivo: `backend/src/rbac/ports/permissions-resolver.port.ts`
    - Agregar `esSuperAdmin: boolean` a la interface `ResolvedPermissions`.
  - Archivo: `backend/src/rbac/rbac.service.ts`
    - Agregar `esSuperAdmin: false` al objeto `EMPTY`.
    - En los métodos `has*`: honrar `perms.esSuperAdmin` igual que `esOwner/esAdmin`.
  - El resolver por-org (`PrismaPermissionsResolver`) siempre setea `esSuperAdmin: false`.

- [ ] **T3.8 — Verificar verde**
  - Correr los tests unitarios: `pnpm exec jest src/common/guards/ src/rbac/`
  - Typecheck: `pnpm exec tsc --noEmit -p tsconfig.json`

---

## Slice 4 — Tabla `platform_audit` + interceptor de auditoría

Scope de commit: `feat(audit): add platform_audit interceptor`
REQ cubiertos: REQ-SA-08, REQ-SA-09
Migration: NO (tabla ya generada en Slice 1)

- [ ] **T4.1 — TEST de integración: `PlatformAuditInterceptor`** (TDD)
  - Archivo: `backend/src/audit/platform-audit.interceptor.spec.ts` (NUEVO, integración)
  - Usar `FakeClock` (o el mock de `ClockPort` existente en el proyecto) — nunca `new Date()`.
  - Describe: `'REQ-SA-08/09: PlatformAuditInterceptor'`
  - Casos:
    - `'[+] POST con isSuperAdmin === true → crea fila en platform_audit con actorUserId, action, timestamp del ClockPort'`.
    - `'[+] PATCH con isSuperAdmin === true y X-Tenant-ID → incluye targetOrganizationId'`.
    - `'[-] GET read-only con isSuperAdmin === true → NO crea fila'` (solo mutaciones mutan).
    - `'[-] request de usuario regular (isSuperAdmin === false) → NO crea fila'`.
    - `'[+] payload sensible es redactado antes de guardarlo'` (campos de passwords/tokens → `[REDACTED]`).
  - Comando: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" pnpm exec jest src/audit/platform-audit.interceptor.spec.ts --runInBand --forceExit`

- [ ] **T4.2 — Definir `PlatformAuditPort`**
  - Archivo: `backend/src/platform/ports/platform-audit.port.ts` (NUEVO)
  - Interface con método `record(entry: PlatformAuditEntry): Promise<void>`.
  - Type `PlatformAuditEntry` con los campos del design §5: `actorUserId`, `action`, `targetOrganizationId?`, `payload?`, `createdAt`.
  - Exportar token de inyección `PLATFORM_AUDIT_PORT`.

- [ ] **T4.3 — Implementar `PrismaPlatformAuditRepository`**
  - Archivo: `backend/src/platform/adapters/prisma-platform-audit.repository.ts` (NUEVO)
  - Implementa `PlatformAuditPort`. Escribe en tabla `platform_audit` vía `PrismaService`.

- [ ] **T4.4 — Implementar `PlatformAuditInterceptor`**
  - Archivo: `backend/src/audit/platform-audit.interceptor.ts` (NUEVO)
  - Esqueleto del design §5: inyecta `PlatformAuditPort` y `ClockPort`.
  - Solo audita mutaciones (POST, PUT, PATCH, DELETE) donde `req.user?.isSuperAdmin === true`.
  - Los GET org-scoped a org ajena (donde `req.tenantId !== req.user?.activeTenantId`) también se auditan (decisión tomada del design §5: "mute estado O acceda cross-tenant").
  - El listado global de orgs (`GET /admin/platform/orgs`, org-less) se excluye del audit de GET (evita ruido).
  - Timestamp vía `ClockPort.now()` — NUNCA `new Date()`.
  - Payload redactado con la utilidad de `src/logger/` o `src/common/` que ya redacta secrets (CLAUDE.md §6.7).

- [ ] **T4.5 — Registrar en módulo**
  - Archivo: `backend/src/platform/platform.module.ts` (NUEVO o existente)
  - Registrar `PrismaPlatformAuditRepository` como provider con token `PLATFORM_AUDIT_PORT`.
  - Exportar `PlatformAuditInterceptor` para uso en `PlatformAdminController`.

- [ ] **T4.6 — Verificar verde**
  - Correr tests de integración del T4.1 → verdes.
  - Typecheck: `pnpm exec tsc --noEmit -p tsconfig.json`

---

## Slice 5 — Bootstrap: seed idempotente + CLI grant/revoke

Scope de commit: `feat(auth): add super-admin bootstrap seed and CLI grant/revoke`
REQ cubiertos: REQ-SA-10, REQ-SA-11
Migration: NO

- [ ] **T5.1 — TEST de integración: seed idempotente** (TDD)
  - Archivo: `backend/src/auth/super-admin-bootstrap.integration.spec.ts` (NUEVO)
  - Describe: `'REQ-SA-10: seed idempotente por SUPER_ADMIN_EMAIL'`
  - Usar Prisma real con `DATABASE_URL` del entorno.
  - Casos:
    - `'[+] SUPER_ADMIN_EMAIL definida con usuario existente → isSuperAdmin = true y fila en platform_audit'`.
    - `'[+] segunda ejecución idempotente → no duplica fila en platform_audit, isSuperAdmin sigue true'`.
    - `'[-] SUPER_ADMIN_EMAIL no definida → ningún usuario queda super-admin'`.
    - `'[-] email no existe en BD → falla con error descriptivo (no silencioso)'`.
  - Describe: `'REQ-SA-11: CLI grant/revoke'`
  - Casos:
    - `'[+] grant: isSuperAdmin = true, fila en platform_audit con action = platform.superadmin.grant'`.
    - `'[+] revoke: isSuperAdmin = false, epoch en Redis, fila en platform_audit con action = platform.superadmin.revoke'`.
    - `'[+] revoke: token con iat previo al epoch → rechazado'` (integrar con T2.4).
  - Comando: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" pnpm exec jest src/auth/super-admin-bootstrap.integration.spec.ts --runInBand --forceExit`

- [ ] **T5.2 — Modificar `prisma/seed.ts`**
  - Archivo: `backend/prisma/seed.ts`
  - Al final del seed, agregar el bloque idempotente (forma del design §8):
    - Leer `process.env.SUPER_ADMIN_EMAIL`.
    - Si existe y el usuario existe y ya es super-admin → no-op (log informativo, sin nueva fila en platform_audit).
    - Si existe y el usuario existe y NO es super-admin → `update isSuperAdmin = true`, crear fila en `platform_audit` con `action = 'platform.superadmin.grant'`, `actorUserId = 'seed'` (o constante especial).
    - Si existe y el usuario NO existe → `throw new Error(...)` con mensaje descriptivo.
    - Si no existe → skip sin error.

- [ ] **T5.3 — Crear script CLI `prisma/scripts/super-admin.ts`**
  - Archivo: `backend/prisma/scripts/super-admin.ts` (NUEVO)
  - Esqueleto del design §8: comandos `grant` y `revoke` vía `process.argv`.
  - `revoke`: llama a la función de revocación de epoch Redis del T2.6.
  - Ambos: escriben fila en `platform_audit` con `actorUserId` del actor (resuelto desde `SUPER_ADMIN_ACTOR` env o hardcoded como `'cli'` en v1).
  - `grant` y `revoke` fallan con error descriptivo si el email no existe.
  - Usar `prisma.$disconnect()` en `finally`.

- [ ] **T5.4 — Agregar script a `package.json`**
  - Archivo: `backend/package.json`
  - Agregar: `"super-admin": "ts-node prisma/scripts/super-admin.ts"`.
  - El comando se invoca como: `pnpm super-admin grant <email>` / `pnpm super-admin revoke <email>`.

- [ ] **T5.5 — Verificar verde**
  - Correr tests de integración del T5.1 → verdes.
  - Typecheck: `pnpm exec tsc --noEmit -p tsconfig.json`

---

## Slice 6 — Endpoints `/admin/platform/*` + re-gating de feature-flags

Scope de commit: `feat(platform): add platform admin endpoints and re-gate feature-flags`
REQ cubiertos: REQ-SA-12, REQ-SA-13, REQ-SA-14, REQ-SA-15, REQ-SA-16
Migration: NO

- [ ] **T6.1 — TEST E2E primero: gating 403 para no-super-admin** (TDD — casos negativos PRIMERO)
  - Archivo: `backend/test/platform-admin.e2e-spec.ts` (NUEVO)
  - Describe: `'Platform Admin — gating (REQ-SA-05, REQ-SA-12..16)'`
  - Setup: crear un tenant + OWNER normal. Crear usuario super-admin con `isSuperAdmin = true`.
  - Casos negativos (403):
    - OWNER hace `GET /admin/platform/orgs` → 403.
    - OWNER hace `POST /admin/platform/orgs` → 403.
    - OWNER hace `PATCH /admin/platform/orgs/:id/status` → 403.
    - OWNER hace `PATCH /admin/platform/orgs/:id/entitlement` → 403.
    - OWNER hace `GET /admin/feature-flags` (o la ruta de feature-flags globales) → 403.
    - Usuario sin JWT → 401 (JwtAuthGuard actúa antes).
  - Ejecutar: fallan (rojo, rutas no existen) → avanzar a T6.2.
  - Comando: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/platform-admin.e2e-spec.ts --runInBand --forceExit`

- [ ] **T6.2 — TEST E2E: casos positivos de super-admin** (TDD, mismo archivo)
  - Describe: `'Platform Admin — acceso super-admin (REQ-SA-12..15)'`
  - Casos positivos:
    - `'[+] REQ-SA-12: GET /admin/platform/orgs → 200 con lista de todas las orgs'`.
    - `'[+] REQ-SA-13: POST /admin/platform/orgs → 201, org creada, ownerEmail queda como OWNER'`.
    - `'[+] REQ-SA-13: ownerEmail inexistente → 422'`.
    - `'[+] REQ-SA-14: PATCH /admin/platform/orgs/:id/status (SUSPENDED) → 200 o 204'`.
    - `'[+] REQ-SA-14: PATCH /admin/platform/orgs/:id/status (ACTIVE) → revierte suspensión'`.
    - `'[+] REQ-SA-15: PATCH /admin/platform/orgs/:id/entitlement → actualiza plan y verticales'`.
    - `'[-] REQ-SA-15: entitlement dual vertical → 422'`.
    - `'[+] REQ-SA-16: super-admin accede a feature-flags admin → 200'`.
    - `'[-] REQ-SA-16: OWNER accede a feature-flags admin → 403 (antes pasaba por wildcard)'`.
    - Cada mutación exitosa deja una fila en `platform_audit` (verificar en BD).
  - Ejecutar: fallan (rojo) → avanzar a T6.3+.

- [ ] **T6.3 — Crear módulo `platform`**
  - Archivo: `backend/src/platform/platform.module.ts` (NUEVO o ampliar si existe del Slice 4)
  - Importar: `PrismaModule`, `PlatformAuditInterceptor`, `PrismaPlatformAuditRepository`, ports cross-module de `TenantsModule` y `MembershipsModule`.
  - Registrar `PlatformAdminService` y `PlatformAdminController`.
  - Importar en `app.module.ts`.

- [ ] **T6.4 — Definir ports cross-module para `platform`**
  - Archivos en `backend/src/platform/ports/`:
    - `orgs-reader.port.ts` (NUEVO): `listAll(filtros?)`, `findById(id)`.
    - `orgs-writer.port.ts` (NUEVO): `create(dto)`, `updateStatus(id, status)`, `updateEntitlement(id, dto)`.
    - `memberships-writer.port.ts` (NUEVO): `createOwnerMembership(userId, organizationId)`.
  - Los adapters de estos ports son implementaciones en los módulos `tenants` y `memberships` (NO se importan directamente — CLAUDE.md §3.3).

- [ ] **T6.5 — Implementar `PlatformAdminService`**
  - Archivo: `backend/src/platform/platform-admin.service.ts` (NUEVO)
  - Lógica de negocio para: listar orgs, crear org + asignar OWNER, cambiar status, cambiar entitlement.
  - `crearOrg`: atómico — si el OWNER designado no existe → lanzar `DomainError` (NO `*Exception` nueva — CLAUDE.md §10.10) con código `PLATFORM_ORG_OWNER_NOT_FOUND`.
  - `cambiarEntitlement`: validar exclusividad de vertical antes de escribir (el CHECK de BD es la defensa en profundidad; la validación en servicio da error amigable 422).
  - Toda mutación llama a `PlatformAuditPort.record(...)` vía inyección (NO audit directo en el interceptor para estas acciones especiales como grant/revoke).

- [ ] **T6.6 — Implementar `PlatformAdminController`**
  - Archivo: `backend/src/platform/platform-admin.controller.ts` (NUEVO)
  - Decoradores: `@Controller('admin/platform')`, `@UseGuards(JwtAuthGuard, SuperAdminGuard)`, `@UseInterceptors(PlatformAuditInterceptor)`.
  - `TenantGuard` solo en handlers org-scoped (PATCH status, PATCH entitlement) — los endpoints org-less (GET orgs, POST orgs) NO usan `TenantGuard`.
  - DTOs en `backend/src/platform/dto/`: `CreateOrgDto`, `UpdateOrgStatusDto`, `UpdateEntitlementDto`, `PlatformOrgResponseDto`.
  - Errores como `DomainError` (no `*Exception` nuevas).

- [ ] **T6.7 — Re-gating de `feature-flags-admin.controller.ts`**
  - Archivo: `backend/src/feature-flags/feature-flags-admin.controller.ts`
  - Reemplazar `@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)` + `@RequirePermissions('sistema.feature-flags.admin')` por `@UseGuards(JwtAuthGuard, SuperAdminGuard)`.
  - Eliminar el decorador `@RequirePermissions` de este controller (ya no es la vía de autorización).
  - Archivo: `backend/src/common/permisos/catalogo.ts` (o donde esté `sistema.feature-flags.admin`)
    - Actualizar comentario del permiso para indicar que ahora gatea `SuperAdminGuard`, no RBAC.

- [ ] **T6.8 — Verificar verde**
  - Correr e2e: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/platform-admin.e2e-spec.ts --runInBand --forceExit`
  - Typecheck: `pnpm exec tsc --noEmit -p tsconfig.json`

---

## Slice 7 — Impersonation cross-tenant

Scope de commit: `feat(impersonation): allow super-admin cross-tenant impersonation`
REQ cubiertos: REQ-SA-17
Migration: NO

- [ ] **T7.1 — TEST E2E primero** (TDD — casos + y − PRIMERO)
  - Archivo: `backend/test/impersonation.e2e-spec.ts` (extender el existente)
  - Describe: `'REQ-SA-17: impersonation cross-tenant'`
  - Casos positivos:
    - `'[+] super-admin impersona MEMBER en org donde no es miembro → token emitido'`.
    - `'[+] token de impersonation resultante NO contiene isSuperAdmin'` (REQ-SA-04).
    - `'[+] impersonation cross-tenant deja fila en platform_audit con action = platform.impersonation.start'`.
    - `'[+] también se crea registro en ImpersonationLog (auditoría existente intacta)'`.
  - Casos negativos:
    - `'[-] super-admin NO puede impersonar a un OWNER → TargetEsOwnerError'`.
    - `'[-] usuario no-super-admin sin OWNER en org destino → SoloOwnerPuedeImpersonarError (regresión)'`.
    - `'[-] no-super-admin sin membresía en org destino → 403'`.
  - Ejecutar: fallan (rojo) → avanzar a T7.2+.
  - Comando: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/impersonation.e2e-spec.ts --runInBand --forceExit`

- [ ] **T7.2 — TEST unitario: `ImpersonationService.start` con rama aditiva** (TDD)
  - Archivo: `backend/src/impersonation/impersonation.service.spec.ts` (extender)
  - Describe: `'REQ-SA-17: rama aditiva callerEsSuperAdmin'`
  - Casos (usando mocks de memberships, no BD real):
    - `'[+] callerEsSuperAdmin = true sin adminMembership → no lanza SoloOwnerPuedeImpersonarError'`.
    - `'[-] callerEsSuperAdmin = true pero target es OWNER → lanza TargetEsOwnerError'`.
    - `'[-] callerEsSuperAdmin = false sin adminMembership → lanza SoloOwnerPuedeImpersonarError (regresión)'`.
  - Ejecutar: `pnpm exec jest src/impersonation/impersonation.service.spec.ts`

- [ ] **T7.3 — Modificar `ImpersonationService.start`**
  - Archivo: `backend/src/impersonation/impersonation.service.ts`
  - Agregar parámetro `callerEsSuperAdmin = false` a la firma de `start()` (4º parámetro, con default preserva comportamiento actual).
  - Reemplazar la guarda `if (!adminMembership || adminMembership.systemRole !== SystemRole.OWNER)` por:
    `if (!callerEsSuperAdmin && (!adminMembership || adminMembership.systemRole !== SystemRole.OWNER))`
  - La restricción `TargetEsOwnerError` (no impersonar a un OWNER) se mantiene INTACTA para todos los callers.
  - El token de impersonation (generado por `ImpersonationJwtClaims.forImpersonation`) NO recibe `isSuperAdmin` — verificar que no se filtra.
  - Después de completar el flujo, llamar a `PlatformAuditPort.record(...)` con `action = 'platform.impersonation.start'` si `callerEsSuperAdmin`.

- [ ] **T7.4 — Modificar `ImpersonationController`**
  - Archivo: `backend/src/impersonation/impersonation.controller.ts`
  - En el handler que llama a `start()`, extraer `req.user.isSuperAdmin` y pasarlo como 4º argumento.
  - Si se necesita acceso cross-tenant (super-admin impersonando en org donde no es miembro), verificar que `TenantGuard` con bypass (Slice 3) ya cubre el acceso — el endpoint de impersonation puede requerir `X-Tenant-ID` para el super-admin cross-tenant.

- [ ] **T7.5 — Reconciliar docs (CLAUDE.md §12.1)**
  - `docs/claude/seguridad.md §5.4`: reemplazar `role: 'super_admin'` → `isSuperAdmin`. Actualizar el bypass de `X-Tenant-ID` indicando que ahora existe.
  - `docs/disenos/plataforma-multi-vertical.md §10.1`: mover `super-admin de plataforma` a "✅ CERRADA" referenciando la guía `super-admin-plataforma.md`.
  - `docs/deudas-arquitecturales.md §3.3`: marcar como saldada.
  - `CLAUDE.md §10.4`: anotar que la blocklist de access tokens se construye en este change, acotada al claim `isSuperAdmin`; generalizar a logout-all es deuda separada.
  - Actualizar los headers `Última edición` / `Última revisión contra core` en cada doc.

- [ ] **T7.6 — Verificar verde (suite completa)**
  - Correr `impersonation.service.spec.ts` → verde.
  - Correr e2e de impersonation → verde.
  - Regresión completa:
    ```bash
    DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
    JWT_ACCESS_SECRET="test-secret" \
    JWT_REFRESH_SECRET="test-refresh" \
    pnpm exec jest test/ --runInBand --forceExit
    ```
  - Typecheck: `pnpm exec tsc --noEmit -p tsconfig.json`

---

## Orden de dependencias entre slices

```
Slice 1 (migration + schema)
  → Slice 2 (claim JWT + revocation — depende de que isSuperAdmin exista en User)
  → Slice 3 (guards + RBAC — depende del claim en req.user, i.e. Slice 2)
  → Slice 4 (platform_audit interceptor — depende de la tabla del Slice 1 y los guards del Slice 3)
  → Slice 5 (bootstrap — depende del campo del Slice 1 y la revocación del Slice 2)
  → Slice 6 (endpoints — depende del guard del Slice 3 y el interceptor del Slice 4)
  → Slice 7 (impersonation — depende del guard Slice 3 y audit Slice 4)
```

Los slices 5, 6 y 7 pueden avanzar en paralelo una vez completos Slices 1-4.

---

## Notas de implementación

- **Un commit por slice** (regla §9.1 del CLAUDE.md raíz). El scope de commit está declarado al inicio de cada sección.
- **NUNCA** Co-Authored-By en commits.
- **No buildear** entre cambios — solo typecheck (`pnpm exec tsc --noEmit`) y jest.
- **Backend e2e**: siempre con `DATABASE_URL` inline + `--runInBand --forceExit`. Sin BD en unit specs.
- **ClockPort**: NUNCA `new Date()` en domain/service (CLAUDE.md §4.6). Usar `FakeClock` en tests de audit.
- **Errores**: no crear `throw new *Exception(...)` nuevos — usar `DomainError` (CLAUDE.md §10.10).
- **Imports**: `@/` para cross-module, relativos dentro del módulo (CLAUDE.md §3.6).
- **Blocklist epoch**: la implementación de este change es la PRIMERA revocación real de access tokens del proyecto. Su alcance está acotado al claim `isSuperAdmin`. Generalizar a logout-all es deuda separada anotada en CLAUDE.md §10.10.
- **Migration §11.6**: aplicar el protocolo de revisión de DROP en cada slice que genera migration (solo Slice 1).
