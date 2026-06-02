# Propuesta de cambio — Logout-all (revocación generalizada de access tokens)

> Fase SDD: **proposal**. Artifact store: hybrid (este archivo + engram `sdd/logout-all/proposal`).
> Stack afectado: **backend** (NestJS + Prisma + PostgreSQL + Redis).
> Fecha: 2026-06-02.
> Decisión base: engram `sdd/logout-all/decision` (#592, Opción A — epoch-por-usuario). CERRADA, no se re-abre.
> Cierra: deuda #2 de CLAUDE.md §10.10 ("Generalizar revocación epoch a logout-all").

---

## 1. Intent / Por qué

El change `super-admin` (2026-06-02) construyó la **primera revocación real de access
tokens** del proyecto, pero acotada al claim de plataforma: la clave Redis
`superadmin:revoked:{userId}` se escribe SOLO al revocar `isSuperAdmin`, y el check en
`JwtStrategy.validate` corre SOLO si `payload.isSuperAdmin === true`
(`backend/src/auth/strategies/jwt.strategy.ts:31`). Un usuario regular cuya cuenta fue
comprometida, que cambió su contraseña, o que fue expulsado por un admin **no puede
matar sus sesiones activas**: el access token sigue vivo hasta su expiración natural (1h),
y el `logout` actual (`auth.controller.ts:79`) solo revoca el refresh token en BD —
el access token queda intacto.

CLAUDE.md §10.4 ya describe "access token revocable vía blocklist Redis" como capacidad
del sistema, pero hoy ESO solo existe para super-admins. Este change **generaliza el
mecanismo epoch** para que cubra a CUALQUIER usuario, con **cero deuda nueva**: en vez de
construir un segundo sistema de revocación, el epoch existente se SUBSUME — una única clave
`saas:revoked:access:{userId}`, un único check en `JwtStrategy.validate` que corre para
TODOS los usuarios, y `super-admin revoke` pasa a llamar al mismo camino generalizado.

La deuda §10.10 confundía dos capacidades distintas: **logout-all** (matar todas las
sesiones de un usuario → epoch) y **logout selectivo de sesión** (matar UNA sesión
específica → blocklist por `jti`). Este change resuelve la primera. La segunda es feature
futura aditiva y opcional, fuera de scope (ver §3).

---

## 2. Scope

### Entra

1. **Generalización del epoch**:
   - Unificar la clave Redis `superadmin:revoked:{userId}` → `revoked:access:{userId}`
     en los tres puntos de toque (escritura en `auth.service.ts`, escritura en
     `super-admin-bootstrap.ts`, lectura en `jwt.strategy.ts`).
   - Quitar el guard `if (payload.isSuperAdmin === true)` en `JwtStrategy.validate`:
     el check de revocación corre AHORA para todos los tokens autenticados.
   - `revocarTokensSuperAdmin(userId)` y el CLI `revokeSuperAdmin` pasan a escribir la
     clave generalizada (delegan en el mismo camino) → la revocación de super-admin sigue
     funcionando byte-idéntica, solo cambia el nombre de la clave.

2. **Endpoint self logout-all**: `POST /auth/logout-all` (gateado por `JwtAuthGuard`,
   opera sobre `req.user.sub` — el usuario revoca SUS PROPIAS sesiones, nunca las de otro):
   - Escribe el epoch de revocación del propio `userId` (mata todos sus access tokens).
   - Revoca TODOS sus refresh tokens activos en BD (método nuevo `revokeAllByUserId`).
   - Limpia la cookie `refreshToken` de la respuesta (consistente con `logout`).

3. **Puerto de revocación de credenciales**: método nuevo `revokeAllByUserId(userId, reason)`
   en `CredentialsRepositoryPort` + adapter Prisma (`updateMany WHERE userId AND revokedAt IS NULL`).

4. **Reconciliación de docs**: CLAUDE.md §10.4 (la capacidad ahora es general, no solo
   super-admin) y §10.10 deuda #2 marcada como resuelta. `docs/claude/seguridad.md`
   actualizado si referencia el epoch acotado a super-admin.

### NO entra (diferido explícitamente)

- **Logout selectivo de sesión (`jti`-blocklist)**: matar UNA sesión por token requiere
  agregar `jti` a TODOS los JWT y trackear cada token emitido. Feature futura aditiva,
  no pedida. **NO se agrega `jti` en este change.**
- **Admin-force-logout** (un admin/super-admin mata las sesiones de OTRO usuario): el
  endpoint v1 es estrictamente self (`req.user.sub`). El force-logout cross-user es una
  capacidad de plataforma distinta — se evalúa por separado cuando aparezca el caso de uso
  (expulsión forzada, cuenta comprometida administrada por soporte).
- **Optimización del costo Redis** (bloom filter / flag global "hay revocaciones activas"
  para evitar el GET en el caso común): se documenta como diferible en design, NO se
  implementa. El costo asumido (1 GET Redis por request autenticado, sub-ms) es aceptable
  para el perfil de carga de PyMEs bolivianas.
- **Revocación automática en cambio de password / cambio de email**: el HOOK existe (este
  change provee el camino), pero conectar `change-password` → `logout-all` es trabajo de
  esos endpoints (que hoy no existen). Aditivo, fuera de scope.

---

## 3. Enfoque elegido (Opción A — epoch por usuario)

**Mecanismo**: una clave Redis `saas:revoked:access:{userId}` = timestamp en ms (string).
En `JwtStrategy.validate`, todo token se rechaza si `iat * 1000 < epoch` (el token fue
emitido ANTES de la revocación). El TTL de la clave = vida del access token (3600s = 1h):
pasada 1h, ningún token viejo sigue vivo, la marca se auto-limpia.

**Por qué epoch y no blocklist por `jti`** (resumen — detalle en engram #592):
- El caso real de logout-all (cuenta comprometida / cambio password / expulsión) exige
  matar TODAS las sesiones atómicamente. El epoch lo hace en UNA escritura (`iat < epoch`
  → muerto), sin enumerar tokens. La blocklist por `jti` NO puede lograr lockout total sin
  un índice `userId → [jtis]` que hoy no existe.
- Cero deuda: ya existe el epoch para super-admin. Agregar `jti` crearía DOS sistemas de
  revocación paralelos. Generalizar el epoch los UNIFICA en uno.
- Se auto-limpia por TTL, reusa `RedisService.get/set` existente (no requiere `sadd/sismember`).

---

## 4. Riesgos

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| Romper la revocación de super-admin al renombrar la clave | Alta | Tests de regresión: el flujo `super-admin revoke` debe seguir invalidando tokens activos del ex-super-admin. Renombrar los TRES puntos de toque atómicamente (escritura ×2 + lectura ×1) en un solo slice. |
| Costo Redis: 1 GET por request autenticado para TODOS los usuarios (hoy solo super-admins lo pagan) | Media | Aceptado en la decisión. Sub-ms para PyMEs. Optimización documentada como diferible. NO se implementa ahora. |
| Tests existentes que asumen "usuario regular NO consulta Redis" se invierten | Media | `jwt.strategy.spec.ts:97-105` afirma que un regular NO consulta Redis — ese test DEBE invertirse (ahora TODOS consultan). El test de clave `superadmin:revoked:` (línea 81) DEBE actualizarse a `revoked:access:`. Identificado, va en tasks. |
| Clave huérfana `superadmin:revoked:{userId}` en Redis de entornos ya desplegados tras el rename | Baja | El epoch viejo tiene TTL 1h: las claves huérfanas mueren solas en ≤1h. No hace falta migración de datos en Redis. Documentar en design. |
| `JwtStrategy` ya inyecta `RedisService` + `ClockPort` (del change super-admin) | — | Sin riesgo de wiring: las deps ya están inyectadas. Solo cambia el cuerpo de `validate`. |
| Auditoría `platform_audit` del super-admin se rompe | Baja | El rename de la clave NO toca la escritura en `platform_audit` (que registra `action: platform.superadmin.revoke`). El epoch y la auditoría son ortogonales. Verificar en tests. |
