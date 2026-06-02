# Design: logout-all

<!--
Última edición: 2026-06-02
Owner: backend-lead
-->

> Change: `logout-all`
> Spec: `openspec/changes/logout-all/specs/logout-all/spec.md`
> Proposal: `openspec/changes/logout-all/proposal.md`
> Decisión base (CERRADA): engram `sdd/logout-all/decision` (#592) — Opción A, epoch por usuario.

---

## 0. Alcance de este documento

Resuelve las decisiones técnicas concretas de la generalización. La decisión arquitectónica
de alto nivel (epoch vs jti-blocklist) YA está tomada (#592) y no se re-abre. Acá se fija:
puerto vs redis directo, rename de la clave y migración, firmas exactas, el cambio puntual
en `JwtStrategy.validate`, el endpoint, el TTL y el impacto en auditoría.

---

## 1. Decisión A — Redis directo en el service, NO puerto nuevo `TokenRevocationPort`

### Elección

Mantener el acceso a Redis **directo en `AuthService`** (vía `RedisService` ya inyectado),
igual que el patrón existente de `revocarTokensSuperAdmin`. **NO** se introduce un
`TokenRevocationPort`.

### Fundamento

- **Consistencia con el código circundante.** El change `super-admin` (mergeado, en
  producción) escribe el epoch con `this.redis.set(key, val, ttl)` directo en
  `auth.service.ts:206`, y `JwtStrategy` lee con `this.redis.get(key)` directo. Introducir
  un puerto AHORA crearía dos estilos para el mismo mecanismo: parte por puerto, parte
  directo. Eso es PEOR que el statu quo.
- **El boundary hexagonal ya está resuelto a nivel infraestructura.** `RedisService` ES la
  abstracción sobre ioredis; `AuthService` no toca el driver. La regla de §3.5 (servicios
  dependen de puertos, no de adapters concretos) se cumple razonablemente: `RedisService`
  es un servicio de infraestructura compartido, no un adapter de un puerto de dominio. El
  epoch de revocación es un detalle de implementación de auth, no un contrato de dominio que
  otro módulo consuma.
- **YAGNI.** No hay un segundo backend de revocación previsible (la optimización bloom/flag
  está diferida y, si llega, vive DENTRO de la misma capa Redis). Un puerto sin segundo
  adapter es ceremonia sin beneficio para este caso.

### Consecuencia

La lógica de "escribir epoch" se concentra en un único método privado de `AuthService`
(`escribirEpochRevocacion`) que `revocarTokensSuperAdmin` y el nuevo `logoutAll` reusan.
El CLI standalone (`super-admin-bootstrap.ts`) sigue escribiendo Redis directo con su propio
helper de clave (no comparte el `AuthService`), pero usando la MISMA clave base generalizada.

---

## 2. Decisión B — Unificar la clave: `superadmin:revoked:{userId}` → `revoked:access:{userId}`

### Elección

Renombrar la clave en los **tres** puntos de toque y eliminar el mecanismo paralelo. NO se
mantiene `superadmin:revoked:` separado.

### Los tres puntos de toque (rename atómico, mismo slice)

| Punto | Archivo | Hoy | Pasa a |
|-------|---------|-----|--------|
| Escritura (service) | `auth.service.ts:204` | `` `superadmin:revoked:${userId}` `` | `` `revoked:access:${userId}` `` |
| Escritura (CLI) | `super-admin-bootstrap.ts:30` | `` `${PREFIX}superadmin:revoked:${userId}` `` | `` `${PREFIX}revoked:access:${userId}` `` |
| Lectura (strategy) | `jwt.strategy.ts:32` | `` `superadmin:revoked:${payload.sub}` `` | `` `revoked:access:${payload.sub}` `` |

### Migración de datos en Redis

**Ninguna migración explícita.** El epoch viejo `superadmin:revoked:{userId}` tiene TTL 1h.
Tras desplegar, las claves viejas mueren solas en ≤1h. En la ventana de transición, un
super-admin recién revocado podría tener su epoch en la clave vieja mientras el strategy ya
lee la nueva — pero esa ventana es teórica: el deploy es atómico (todo el proceso reinicia),
así que escritura y lectura cambian juntas. Las claves huérfanas pre-deploy expiran sin daño.

> No se construye un fallback "leer ambas claves": agregaría complejidad permanente para
> cubrir una ventana de minutos. El TTL hace el trabajo.

### Fundamento

Un único mecanismo de revocación = cero deuda (decisión #592). `revoked:access:` es un nombre
genérico que describe QUÉ se revoca (access tokens) sin atarlo al claim de plataforma. El
prefijo `saas:` lo agrega `RedisService` automáticamente; el CLI lo añade explícito porque
accede a ioredis sin NestJS.

---

## 3. Decisión C — Cambio puntual en `JwtStrategy.validate`

### Forma del código

Hoy (`jwt.strategy.ts:31-41`):

```typescript
if (payload.isSuperAdmin === true) {
  const key = `superadmin:revoked:${payload.sub}`;
  const revokedAtStr = await this.redis.get<string>(key);
  if (revokedAtStr !== null) {
    const revokedAtMs = Number(revokedAtStr);
    const iatMs = (payload.iat ?? 0) * 1000;
    if (revokedAtMs > iatMs) {
      throw new UnauthorizedException('Token revocado');
    }
  }
}
```

Pasa a (se elimina el guard `if (isSuperAdmin)`, el check corre siempre):

```typescript
// Revocación generalizada de access tokens (logout-all + super-admin revoke).
// Epoch por usuario en Redis: si existe una marca posterior al iat del token,
// el token está revocado. Mecanismo único para todos los usuarios.
// docs/claude/seguridad.md, design.md Decisión C.
const key = `revoked:access:${payload.sub}`;
const revokedAtStr = await this.redis.get<string>(key);
if (revokedAtStr !== null) {
  const revokedAtMs = Number(revokedAtStr);
  const iatMs = (payload.iat ?? 0) * 1000;
  if (revokedAtMs > iatMs) {
    throw new UnauthorizedException('Token revocado');
  }
}
```

- `RedisService` y `ClockPort` YA están inyectados en `JwtStrategy` (del change super-admin).
  No hay wiring nuevo. (Nota: `ClockPort` no se usa en `validate` hoy ni después — el `iat`
  viene del payload; se mantiene la inyección como está, no se toca.)
- `UnauthorizedException` se conserva (consistencia HTTP 401, evita romper contrato).
- El bloque de propagación de claims (`return { sub, email, ..., isSuperAdmin, ... }`) NO cambia.

### Costo

1 `GET` Redis por request autenticado para TODOS los usuarios (hoy solo super-admins).
Aceptado en #592. Sub-ms. Optimización (flag global "¿hay alguna revocación activa?" para
saltar el GET en el caso común) documentada como diferible — NO se implementa.

---

## 4. Decisión D — Firmas de los métodos nuevos/modificados

### 4.1 `AuthService`

**Refactor del método de escritura del epoch** (privado, reusable):

```typescript
/** Escribe el epoch de revocación de access tokens del usuario en Redis.
 *  Invalida todos sus tokens con iat anterior a este instante (logout-all).
 *  TTL = vida del access token (1h) → se auto-limpia. */
private async escribirEpochRevocacion(userId: string): Promise<void> {
  const key = `revoked:access:${userId}`;
  const nowMs = this.clock.now().getTime();
  await this.redis.set(key, String(nowMs), ACCESS_REVOCATION_TTL_SECONDS);
}
```

**`revocarTokensSuperAdmin` pasa a delegar** (preserva la API pública que usan los callers
de super-admin, solo cambia el cuerpo):

```typescript
async revocarTokensSuperAdmin(userId: string): Promise<void> {
  await this.escribirEpochRevocacion(userId);
}
```

> Alternativa evaluada: renombrar `revocarTokensSuperAdmin` → `revocarTokensDeUsuario`. Se
> DESCARTA en este change para no tocar sus callers (menor blast radius). Renombrar es
> cosmético y se difiere; la deuda de naming se anota pero no bloquea. Si el verify lo pide,
> es un rename mecánico de un único caller en código de producción.

**Método nuevo `logoutAll`** (orquesta epoch + revocación de refresh):

```typescript
/** Revoca TODAS las sesiones del usuario: epoch de access tokens + refresh tokens en BD. */
async logoutAll(userId: string): Promise<void> {
  await this.escribirEpochRevocacion(userId);
  await this.credentials.revokeAllByUserId(userId, 'logout-all');
}
```

**Constante TTL** — se renombra `SUPER_ADMIN_REVOCATION_TTL_SECONDS` →
`ACCESS_REVOCATION_TTL_SECONDS` (mismo valor 3600). El nombre viejo era específico de
super-admin; el mecanismo ahora es general.

### 4.2 `CredentialsRepositoryPort` + adapter

```typescript
// ports/credentials.repository.port.ts (agregar al interface)
/** Marca como revocados TODOS los refresh tokens activos del usuario. Usado en logout-all. */
revokeAllByUserId(userId: string, reason: string): Promise<void>;
```

```typescript
// adapters/prisma-credentials.repository.ts (implementar)
async revokeAllByUserId(userId: string, reason: string): Promise<void> {
  await this.prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}
```

> `new Date()` en el adapter es admisible: es capa de infraestructura, no `domain/` ni
> `*.service.ts` (CLAUDE.md §4.6). Es consistente con `revokeById`/`revokeByHash` existentes.

---

## 5. Decisión E — Endpoint `POST /auth/logout-all`

### Forma del controller

```typescript
@Post('logout-all')
@UseGuards(JwtAuthGuard)
@HttpCode(HttpStatus.NO_CONTENT)
@ApiBearerAuth('JWT-auth')
@ApiOperation({ summary: 'Revoke ALL sessions of the authenticated user (access + refresh)' })
@ApiResponse({ status: 204, description: 'All sessions revoked' })
@ApiResponse({ status: 401, description: 'Missing or invalid access token' })
async logoutAll(
  @CurrentUser() user: { sub: string },
  @Res({ passthrough: true }) res: Response,
): Promise<void> {
  await this.authService.logoutAll(user.sub);
  this.clearRefreshCookie(res);
}
```

- **Self only.** El sujeto es `user.sub` del JWT validado por `JwtAuthGuard`. No hay
  parámetro de `userId` de entrada. Un usuario no puede revocar a otro (REQ-LA-03).
- Reusa el helper `clearRefreshCookie` existente (mismo path/sameSite/secure que `logout`).
- 204 No Content, consistente con `logout`.

### Por qué self-only en v1

El admin-force-logout (revocar sesiones de OTRO usuario) es una capacidad de plataforma
distinta, con su propio modelo de autorización (¿quién puede forzar logout a quién? ¿admin
del tenant? ¿super-admin global?). Mezclarla con el self logout-all acoplaría dos features.
El objetivo primario (#592: cuenta comprometida / cambio password / expulsión auto-iniciada)
se cubre con self. Force-logout es aditivo y se evalúa cuando aparezca el caso de uso.

---

## 6. Decisión F — TTL

Se conserva **3600s (1h)**, igual a la vida del access token. Sin cambio funcional, solo el
rename de la constante (`SUPER_ADMIN_REVOCATION_TTL_SECONDS` → `ACCESS_REVOCATION_TTL_SECONDS`).

Garantía: pasada 1h desde la revocación, ningún token emitido antes sigue vivo (expiró por su
propio `exp`), por lo que la marca epoch ya no hace falta y se auto-limpia. El CLI
(`super-admin-bootstrap.ts`) mantiene su `REVOCATION_TTL_SECONDS = 3600` local (renombrado
para claridad si se desea, no obligatorio).

---

## 7. Decisión G — Impacto en auditoría `platform_audit`

**Cero impacto funcional.** El rename de la clave Redis toca SOLO la escritura/lectura del
epoch. La escritura en `platform_audit` (`action: 'platform.superadmin.revoke'` con payload
`epochMs`) en `super-admin-bootstrap.ts:141-153` NO cambia su lógica: sigue registrando la
revocación del FLAG. El `epochMs` que persiste en el payload sigue siendo el timestamp escrito
en Redis (ahora bajo la clave generalizada). Tests de regresión confirman que la fila de
auditoría se crea igual (REQ-LA-05, escenario de preservación de auditoría).

> El `POST /auth/logout-all` self NO escribe en `platform_audit` (esa tabla es para acciones
> de plataforma del super-admin, no para self-service de usuarios regulares). Si en el futuro
> se quiere auditar logout-all en el `AuditLog` por-tenant, es aditivo y fuera de scope.

---

## 8. Archivos a tocar (consolidado)

### Auth — generalización del epoch + endpoint

- `backend/src/auth/strategies/jwt.strategy.ts` — quitar guard `isSuperAdmin`, rename clave.
- `backend/src/auth/auth.service.ts` — `escribirEpochRevocacion` privado, `logoutAll` nuevo,
  `revocarTokensSuperAdmin` delega, rename constante TTL + clave.
- `backend/src/auth/super-admin-bootstrap.ts` — rename clave base en `superAdminRevocationKey`
  (la función puede renombrarse a `accessRevocationKey`; opcional).
- `backend/src/auth/auth.controller.ts` — endpoint `POST /auth/logout-all`.
- `backend/src/auth/ports/credentials.repository.port.ts` — agregar `revokeAllByUserId`.
- `backend/src/auth/adapters/prisma-credentials.repository.ts` — implementar `revokeAllByUserId`.

### Tests a actualizar (regresión que se invierte)

- `backend/src/auth/strategies/jwt.strategy.spec.ts` — el test "usuario regular NO consulta
  Redis" (líneas 97-105) se INVIERTE a "usuario regular SÍ consulta Redis"; el assert de
  clave `superadmin:revoked:` (línea 81) pasa a `revoked:access:`.
- `backend/src/auth/super-admin-bootstrap.integration.spec.ts` — actualizar la clave esperada
  a `revoked:access:` y verificar regresión (revoke del flag sigue invalidando + auditoría intacta).

### Reconciliación de docs

- `CLAUDE.md` §10.4 — la capacidad ahora es general (no solo super-admin).
- `CLAUDE.md` §10.10 deuda #2 — marcar RESUELTA.
- `docs/claude/seguridad.md` — actualizar si referencia el epoch acotado a super-admin.

---

## 9. Riesgos residuales

- **Romper super-admin revoke**: mitigado por REQ-LA-05 (regresión con test). Rename atómico.
- **Costo Redis general**: aceptado (#592), optimización diferida documentada.
- **Tests invertidos**: identificados explícitamente arriba — no son sorpresa, van en tasks.
