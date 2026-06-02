# Tasks: logout-all

<!--
Última edición: 2026-06-02
Owner: backend-lead
-->

> Change: `logout-all`
> Spec: `openspec/changes/logout-all/specs/logout-all/spec.md`
> Design: `openspec/changes/logout-all/design.md`
> TDD estricto: tests PRIMERO en todo slice con lógica no-trivial.
> Scope de commit: `auth` en todos los slices (un solo módulo).
> Backend e2e: `DATABASE_URL` inline + `--runInBand --forceExit` (CLAUDE.md §11.3).
> Sin migración Prisma: este change no toca el schema.

---

## Slice 1 — Unificar el epoch: rename de clave + check general en JwtStrategy

Scope de commit: `refactor(auth): generalize revocation epoch to all users`
REQ cubiertos: REQ-LA-01, REQ-LA-02, REQ-LA-05 (parte strategy)
Migration: NO

- [x] **T1.1 — Actualizar el test unitario de `JwtStrategy`** (TDD — el test cambia primero)
  - Archivo: `backend/src/auth/strategies/jwt.strategy.spec.ts`
  - Invertir el caso "usuario regular: no consulta Redis aunque no sea super-admin"
    (líneas ~97-105) → AHORA debe afirmar que un usuario regular SÍ consulta Redis:
    `expect(redis.get).toHaveBeenCalledWith('revoked:access:' + basePayload.sub)`.
  - Actualizar el assert de clave del caso de revocación (línea ~81):
    `superadmin:revoked:` → `revoked:access:`.
  - Agregar caso nuevo (REQ-LA-02 negativo): usuario regular (sin `isSuperAdmin`) con epoch
    posterior a `iat` → `rejects.toThrow(UnauthorizedException)`.
  - Mantener los casos positivos (super-admin sin revocación pasa; iat posterior al epoch pasa).
  - Ejecutar: rojo → avanzar a T1.2.
  - Comando: `pnpm exec jest src/auth/strategies/jwt.strategy.spec.ts`

- [x] **T1.2 — Modificar `JwtStrategy.validate`**
  - Archivo: `backend/src/auth/strategies/jwt.strategy.ts`
  - Eliminar el guard `if (payload.isSuperAdmin === true) { ... }` — el check corre siempre.
  - Renombrar la clave a `` `revoked:access:${payload.sub}` ``.
  - Conservar `UnauthorizedException('Token revocado')` y la comparación `revokedAtMs > iatMs`.
  - Actualizar el comentario al mecanismo generalizado (referenciar design.md Decisión C).
  - NO tocar el bloque `return { sub, email, ..., isSuperAdmin, ... }`.

- [x] **T1.3 — Modificar `auth.service.ts`: epoch generalizado**
  - Archivo: `backend/src/auth/auth.service.ts`
  - Renombrar constante `SUPER_ADMIN_REVOCATION_TTL_SECONDS` → `ACCESS_REVOCATION_TTL_SECONDS` (3600).
  - Extraer método privado `escribirEpochRevocacion(userId)` que escribe
    `` `revoked:access:${userId}` `` con `this.clock.now().getTime()` y TTL `ACCESS_REVOCATION_TTL_SECONDS`.
  - `revocarTokensSuperAdmin(userId)` pasa a delegar: `await this.escribirEpochRevocacion(userId)`.
  - NO renombrar `revocarTokensSuperAdmin` (preservar callers — design.md §4.1).

- [x] **T1.4 — Actualizar `super-admin-bootstrap.ts`: clave generalizada**
  - Archivo: `backend/src/auth/super-admin-bootstrap.ts`
  - En `superAdminRevocationKey` cambiar la clave base a `revoked:access:${userId}`
    (conservando el prefijo `saas:` explícito). Renombrada a `accessRevocationKey`.
  - Actualizar los JSDoc que mencionan `superadmin:revoked:` a la clave nueva.
  - NO tocar la escritura en `platform_audit` (design.md Decisión G).

- [x] **T1.5 — Actualizar el integration spec del bootstrap** (regresión REQ-LA-05)
  - Archivo: `backend/src/auth/super-admin-bootstrap.integration.spec.ts`
  - Actualizar la clave Redis esperada (`superadmin:revoked:` → `revoked:access:`).
  - Verificar que el escenario de revoke sigue: el flag baja a `false`, el epoch se escribe en
    la clave nueva, y la fila `platform_audit` con `action: 'platform.superadmin.revoke'` se crea.
  - Comando: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" pnpm exec jest src/auth/super-admin-bootstrap.integration.spec.ts --runInBand --forceExit`

- [x] **T1.6 — Verificar verde**
  - Unit: `pnpm exec jest src/auth/strategies/jwt.strategy.spec.ts`
  - Integración bootstrap (Postgres + Redis arriba): comando del T1.5.
  - Typecheck: `pnpm exec tsc --noEmit -p tsconfig.json` desde `backend/`.

---

## Slice 2 — Revocación masiva de refresh tokens (puerto + adapter)

Scope de commit: `feat(auth): add revokeAllByUserId to credentials port`
REQ cubiertos: REQ-LA-04
Migration: NO

- [x] **T2.1 — TEST de integración del adapter primero** (TDD)
  - Archivo: `backend/src/auth/adapters/prisma-credentials.repository.integration.spec.ts`
    (nuevo, o extender si existe).
  - Describe: `'REQ-LA-04: revokeAllByUserId'`.
  - Casos:
    - `'revoca todos los refresh tokens activos del usuario'`: crear N refresh tokens activos
      (distintas familias) → `revokeAllByUserId(userId, 'logout-all')` → todos con `revokedAt`
      no nulo y `revokedReason = 'logout-all'`.
    - `'no re-revoca los ya revocados ni toca otros usuarios'`: un token ya revocado conserva su
      `revokedAt` original; los tokens de otro usuario quedan intactos.
  - Ejecutar: rojo (método no existe) → avanzar a T2.2.
  - Comando: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" pnpm exec jest src/auth/adapters/prisma-credentials.repository.integration.spec.ts --runInBand --forceExit`

- [x] **T2.2 — Agregar `revokeAllByUserId` al puerto**
  - Archivo: `backend/src/auth/ports/credentials.repository.port.ts`
  - Agregar al interface: `revokeAllByUserId(userId: string, reason: string): Promise<void>;`
    con JSDoc (logout-all).

- [x] **T2.3 — Implementar en el adapter Prisma**
  - Archivo: `backend/src/auth/adapters/prisma-credentials.repository.ts`
  - `updateMany WHERE { userId, revokedAt: null } data { revokedAt: new Date(), revokedReason: reason }`.
  - (`new Date()` admisible: adapter de infra — CLAUDE.md §4.6, consistente con `revokeById`.)

- [x] **T2.4 — Verificar verde**
  - Integración del T2.1 → verde. Typecheck.

---

## Slice 3 — `AuthService.logoutAll` + endpoint `POST /auth/logout-all`

Scope de commit: `feat(auth): add self logout-all endpoint`
REQ cubiertos: REQ-LA-03 (+ cierre de REQ-LA-04 a nivel servicio)
Migration: NO

- [x] **T3.1 — TEST unitario de `AuthService.logoutAll`** (TDD)
  - Archivo: `backend/src/auth/auth.service.spec.ts` (nuevo o extender).
  - Mock de `RedisService` (`set`), `ClockPort` (`now`) y `CredentialsRepositoryPort`
    (`revokeAllByUserId`). NUNCA mockear Prisma (CLAUDE.md §7.8).
  - Casos:
    - `'escribe el epoch revoked:access del usuario con el timestamp del ClockPort'`.
    - `'llama revokeAllByUserId con el userId y reason logout-all'`.
  - Ejecutar: rojo → avanzar a T3.2.
  - Comando: `pnpm exec jest src/auth/auth.service.spec.ts`

- [x] **T3.2 — Implementar `AuthService.logoutAll`**
  - Archivo: `backend/src/auth/auth.service.ts`
  - `async logoutAll(userId)`: `await this.escribirEpochRevocacion(userId)` +
    `await this.credentials.revokeAllByUserId(userId, 'logout-all')`.

- [x] **T3.3 — TEST E2E del endpoint primero** (TDD — casos + y −)
  - Archivo: `backend/test/auth-logout-all.e2e-spec.ts` (nuevo).
  - Casos (REQ-LA-03):
    - `'logout-all invalida un access token emitido antes de la llamada'`: login → token A →
      `POST /auth/logout-all` con A → request autenticado con A → 401.
    - `'un token emitido después del logout-all sigue válido'`: tras logout-all, re-login →
      token B (iat posterior) → request con B → 200.
    - `'logout-all revoca los refresh tokens del usuario'`: tras logout-all, `POST /auth/refresh`
      con el refresh cookie viejo → 401.
    - `'logout-all sin autenticación → 401'` (sin Bearer).
    - `'aislamiento: logout-all de user1 no afecta a user2'` (token de user2 sigue 200).
  - Levantar Postgres + Redis. Ejecutar: rojo (endpoint no existe) → avanzar a T3.4.
  - Comando: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/auth-logout-all.e2e-spec.ts --runInBand --forceExit`
  - Nota TTL/iat: el `iat` del JWT es en segundos; si el test es muy rápido, el token re-emitido
    puede compartir `iat` con el epoch. Forzar separación con el `ClockPort` fake o esperar 1s
    entre logout-all y re-login para que `iat_B * 1000 >= epoch`. Documentar el truco en el test.

- [x] **T3.4 — Implementar el endpoint en el controller**
  - Archivo: `backend/src/auth/auth.controller.ts`
  - `@Post('logout-all')` + `@UseGuards(JwtAuthGuard)` + `@HttpCode(204)` + `@ApiBearerAuth`.
  - Body: `await this.authService.logoutAll(user.sub)` + `this.clearRefreshCookie(res)`.
  - Sujeto SIEMPRE `@CurrentUser().sub` — sin parámetro de userId (self-only, REQ-LA-03).

- [x] **T3.5 — Verificar verde**
  - Unit T3.1 + E2E T3.3 → verde. Typecheck + lint (`pnpm run lint` desde `backend/`).

---

## Slice 4 — Reconciliación de docs

Scope de commit: `docs(auth): generalize revocation epoch, close debt #2`
REQ cubiertos: notas de impacto del spec
Migration: NO

- [x] **T4.1 — CLAUDE.md §10.4**
  - Actualizar la fila "Revocación epoch super-admin": la capacidad ahora es general
    (logout-all para cualquier usuario); super-admin revoke es un caso particular.

- [x] **T4.2 — CLAUDE.md §10.10 deuda #2**
  - Marcar "Generalizar revocación epoch a logout-all" como RESUELTA (referenciar este change).

- [x] **T4.3 — `docs/claude/seguridad.md`**
  - Si referencia el epoch acotado a `isSuperAdmin`, actualizar al mecanismo general
    (clave `revoked:access:{userId}`, check para todos en `JwtStrategy.validate`).
  - Actualizar el header de versionado (`Última edición`, `Última revisión contra core`).

- [x] **T4.4 — Verificación final del change**
  - Suite auth completa unit + integración: `pnpm exec jest src/auth/` (con `DATABASE_URL`).
  - E2E auth: `pnpm exec jest test/auth*.e2e-spec.ts --runInBand --forceExit` (con env).
  - Typecheck + lint limpios. Confirmar que la regresión de super-admin (REQ-LA-05) pasa.
