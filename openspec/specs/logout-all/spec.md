# Delta Spec: logout-all (revocación generalizada de access tokens)

<!--
Última edición: 2026-06-02
Última revisión contra core: 2026-06-02
Owner: backend-lead
-->

> Fecha: 2026-06-02
> Fase: archivado (implementado — PR #145, commit d357680)
> Change: `logout-all`
> Proyecto: avicont
> Stack: backend (NestJS + Prisma + PostgreSQL + Redis).
> Insumos: `proposal.md` + engram `sdd/logout-all/decision` (#592).

---

## Propósito de este delta

Generalizar la revocación de access tokens —hoy acotada al claim `isSuperAdmin`— a un
**logout-all de cualquier usuario**. El mecanismo epoch existente (`super-admin`,
2026-06-02) se SUBSUME: una única clave Redis `revoked:access:{userId}`, un único check en
`JwtStrategy.validate` que corre para TODOS los usuarios, y un endpoint `POST /auth/logout-all`
que el usuario autenticado invoca sobre sí mismo.

Cada invariante de seguridad lleva escenario positivo y negativo (CLAUDE.md §4.2).
La regresión de la revocación de super-admin es un requisito explícito (REQ-LA-05).

---

## Glosario

- **Epoch de revocación**: timestamp en ms (string) escrito en Redis bajo
  `saas:revoked:access:{userId}`. Marca el instante a partir del cual todo token con
  `iat` anterior se considera muerto.
- **Logout-all**: revocación atómica de TODAS las sesiones (access + refresh) de un usuario.
  Distinto de `logout` (que solo revoca el refresh token de la sesión actual).
- **Self logout-all**: el endpoint opera sobre `req.user.sub` — el usuario revoca SUS PROPIAS
  sesiones. No existe (en este change) revocar las sesiones de otro usuario.
- **`iat`**: claim estándar JWT (issued-at, en segundos) que `passport-jwt` expone en el payload.

---

## Capacidad 1: Generalización del epoch de revocación

### REQ-LA-01: Clave de revocación generalizada y única

El mecanismo de epoch DEBE usar una única clave Redis `revoked:access:{userId}` (prefijo
`saas:` automático del `RedisService`), aplicable a CUALQUIER usuario. La clave anterior
`superadmin:revoked:{userId}`, específica de plataforma, DEBE dejar de usarse.

**Reglas:**
- El valor es el timestamp actual en ms como string. El TTL es 3600s (vida del access token).
- El timestamp lo provee `ClockPort` en código de servicio (CLAUDE.md §4.6 — `new Date()`
  prohibido en `*.service.ts`). En scripts standalone (CLI) `Date.now()` es admisible.
- Los TRES puntos de toque (escritura en `auth.service.ts`, escritura en
  `super-admin-bootstrap.ts`, lectura en `jwt.strategy.ts`) DEBEN usar la MISMA clave base.

#### Escenario: la escritura y la lectura del epoch usan la clave generalizada

- DADO un usuario cuyo epoch de revocación se escribe en `revoked:access:{userId}`
- CUANDO `JwtStrategy.validate` evalúa un token de ese usuario
- ENTONCES lee de `revoked:access:{userId}` (la misma clave)
- Y NO consulta `superadmin:revoked:{userId}` (clave obsoleta)

---

### REQ-LA-02: El check de revocación corre para TODOS los usuarios

`JwtStrategy.validate` DEBE consultar el epoch de revocación para CUALQUIER token
autenticado, sin condicionarlo a `payload.isSuperAdmin`. Un token cuyo `iat` es anterior
al epoch DEBE ser rechazado con `UnauthorizedException` (HTTP 401), independientemente de
si el usuario es super-admin o regular.

> Nota de consistencia: `JwtStrategy.validate` ya usa `UnauthorizedException` para el caso
> de revocación (change super-admin). Se mantiene ese tipo para no romper el contrato HTTP 401.

**Reglas:**
- Comparación: `revokedAtMs > iat * 1000` → token revocado.
- Si no existe marca en Redis (`get` devuelve `null`) → el token pasa.
- El guard `if (payload.isSuperAdmin === true)` que envolvía el check DEBE eliminarse.

#### Escenario: usuario regular con token anterior al epoch es rechazado

- DADO un usuario regular (`isSuperAdmin` ausente o `false`) con epoch escrito en
  `revoked:access:{userId}` cuyo valor es POSTERIOR al `iat` de su token
- CUANDO presenta ese token en un request autenticado
- ENTONCES `JwtStrategy.validate` lanza `UnauthorizedException` (HTTP 401)

#### Escenario: usuario regular sin epoch pasa normalmente

- DADO un usuario regular sin marca de revocación en Redis (`get` → `null`)
- CUANDO presenta un token válido y no expirado
- ENTONCES `JwtStrategy.validate` resuelve `req.user` sin lanzar excepción

#### Escenario (negativo de cobertura): el check NO se omite para usuarios regulares

- DADO un usuario regular con un epoch de revocación activo posterior a su `iat`
- CUANDO presenta su token
- ENTONCES el sistema NO omite la consulta a Redis por no ser super-admin
- Y el token es rechazado igual que para un super-admin

---

## Capacidad 2: Endpoint self logout-all

### REQ-LA-03: `POST /auth/logout-all` revoca todas las sesiones del usuario autenticado

DEBE existir un endpoint `POST /auth/logout-all` gateado por `JwtAuthGuard` que opere
EXCLUSIVAMENTE sobre `req.user.sub`. Al invocarse:

1. Escribe el epoch de revocación del propio `userId` → invalida todos sus access tokens activos.
2. Revoca TODOS los refresh tokens activos del usuario en BD.
3. Limpia la cookie `refreshToken` de la respuesta.

**Reglas:**
- El endpoint NO acepta un `userId` de entrada: el sujeto es siempre `req.user.sub`. Un
  usuario NO puede revocar las sesiones de otro por este endpoint.
- Sin `JwtAuthGuard` válido → 401 (sin token, no hay `sub`).
- Respuesta: HTTP 204 No Content (consistente con `logout`).

#### Escenario: logout-all invalida los access tokens emitidos antes de la llamada

- DADO un usuario autenticado con un access token A válido
- CUANDO invoca `POST /auth/logout-all`
- Y luego presenta el token A en un request autenticado
- ENTONCES el token A es rechazado con HTTP 401 (su `iat` es anterior al epoch)

#### Escenario: un token emitido DESPUÉS del logout-all sigue válido

- DADO un usuario que invocó `POST /auth/logout-all` (epoch escrito en T)
- CUANDO se autentica de nuevo y obtiene un token B con `iat` posterior a T
- Y presenta el token B
- ENTONCES el token B es aceptado (su `iat` es posterior al epoch)

#### Escenario: logout-all revoca los refresh tokens del usuario en BD

- DADO un usuario con varios refresh tokens activos (`revokedAt IS NULL`) en distintas familias
- CUANDO invoca `POST /auth/logout-all`
- ENTONCES todos sus refresh tokens activos quedan con `revokedAt` no nulo y `revokedReason` seteado
- Y un intento posterior de `POST /auth/refresh` con cualquiera de esos refresh tokens es rechazado

#### Escenario (negativo): logout-all sin autenticación es rechazado

- DADO un request a `POST /auth/logout-all` sin un access token válido
- CUANDO se procesa
- ENTONCES el `JwtAuthGuard` lo rechaza con HTTP 401
- Y no se escribe ningún epoch ni se revoca ningún refresh token

#### Escenario (negativo de aislamiento): logout-all de un usuario NO afecta a otro

- DADO dos usuarios distintos, cada uno con sesiones activas
- CUANDO el usuario 1 invoca `POST /auth/logout-all`
- ENTONCES los tokens del usuario 2 siguen válidos
- Y solo se escribe el epoch `revoked:access:{user1}`

---

## Capacidad 3: Revocación masiva de refresh tokens (puerto)

### REQ-LA-04: `CredentialsRepositoryPort.revokeAllByUserId`

El `CredentialsRepositoryPort` DEBE exponer `revokeAllByUserId(userId, reason)` que marque
como revocados TODOS los refresh tokens activos del usuario, en una sola operación.

**Reglas:**
- Solo afecta tokens con `revokedAt IS NULL` (no re-revoca los ya revocados ni toca otros usuarios).
- Setea `revokedAt` y `revokedReason`.
- El adapter Prisma usa `updateMany WHERE userId = ? AND revokedAt IS NULL` (no enumera filas).

#### Escenario: revoca solo los activos del usuario indicado

- DADO un usuario con 3 refresh tokens activos y 1 ya revocado, y otro usuario con tokens activos
- CUANDO se llama `revokeAllByUserId(userId, 'logout-all')`
- ENTONCES los 3 activos del usuario quedan revocados con reason `'logout-all'`
- Y el ya revocado conserva su `revokedAt`/`revokedReason` original
- Y los tokens del otro usuario quedan intactos

---

## Capacidad 4: Regresión — la revocación de super-admin sigue funcionando

### REQ-LA-05: `super-admin revoke` invalida tokens vía el mecanismo generalizado

Tras unificar la clave, el flujo de revocación del flag `isSuperAdmin` (vía
`AuthService.revocarTokensSuperAdmin` y el CLI `revokeSuperAdmin`) DEBE seguir invalidando
inmediatamente los tokens activos del ex-super-admin, usando AHORA la clave generalizada
`revoked:access:{userId}`. La auditoría en `platform_audit` NO DEBE alterarse.

#### Escenario: revocar el flag isSuperAdmin invalida tokens activos (vía clave generalizada)

- DADO un super-admin con un access token válido (no expirado)
- CUANDO su flag `isSuperAdmin` es revocado (CLI o endpoint de bootstrap)
- ENTONCES se escribe el epoch en `revoked:access:{userId}` (clave generalizada)
- Y su access token activo es rechazado con HTTP 401 en el siguiente request

#### Escenario: la auditoría de la revocación de super-admin se preserva

- DADO un super-admin cuyo flag se revoca vía CLI
- CUANDO se ejecuta la revocación
- ENTONCES se crea una fila en `platform_audit` con `action: 'platform.superadmin.revoke'`
- Y el rename de la clave Redis NO altera esa escritura de auditoría

---

## Notas de impacto sobre el core (CLAUDE.md)

- **§10.4 (Revocación epoch super-admin)**: la capacidad deja de estar acotada al claim
  `isSuperAdmin`. La entrada del core se actualiza para reflejar la generalización (este
  delta COMPLETA §10.4, no la contradice — la revocación de super-admin pasa a ser un caso
  particular del mecanismo general).
- **§10.10 deuda #2 ("Generalizar revocación epoch a logout-all")**: se marca como RESUELTA.
- Ningún invariante de §4 (dominio contable) se toca. Multi-tenant (§4.2) no aplica: el
  logout-all es por `userId` global, no por tenant.
