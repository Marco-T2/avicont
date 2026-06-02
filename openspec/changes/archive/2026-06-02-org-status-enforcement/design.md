# Design: Enforcement de Organization.status (no-ACTIVE → read-only)

## Technical Approach

Guard global `OrgStatusGuard` (`APP_GUARD`) que bloquea mutaciones cuando la org
activa no es `ACTIVE`. Hallazgo decisivo durante el design: la autenticación en
avicont es **por-controller** (`@UseGuards(AuthGuard('jwt'), ...)`), NO global —
no hay `APP_GUARD` de JWT ni decorator `@Public`. Como los guards globales corren
ANTES de los guards de controller, un `APP_GUARD` que lea `req.user` lo vería vacío
para usuarios normales (mismo trap documentado en `app.module.ts:97-100` para
ModuleEnabledGuard) → enforcement nulo. La solución: el guard **decodifica el JWT
por su cuenta** (best-effort), sin forzar autenticación (sin token → transparente,
para no romper `/auth/login`, `register`, `refresh`).

## Architecture Decisions

### Decisión 1: Cómo accede al JWT (punto crítico)
| Opción | Tradeoff | Decisión |
|--------|----------|----------|
| A) APP_GUARD leyendo `req.user` | Corre antes del AuthGuard de controller → `req.user` vacío → enforcement nulo | ❌ |
| B) APP_GUARD extends `AuthGuard('jwt')` | Forzaría auth en login/register/refresh (rutas sin JWT) → las rompe; no hay `@Public` | ❌ |
| C) APP_GUARD con `JwtService.verify` best-effort | Self-contained, no fuerza auth (sin/invalid token → transparente), lee `activeTenantId`/`isSuperAdmin`/`iat` propio | ✅ |
| D) Aplicar per-controller tras AuthGuard | Toca ~9 controllers, se olvida en controllers nuevos → reabre el GAP | ❌ |

**Rationale**: C cubre TODOS los controllers de dominio (que es lo que el GAP exige)
sin el trap de orden ni romper rutas públicas. OrgStatusGuard NO re-valida revocación
ni membership (eso es responsabilidad del AuthGuard/JwtStrategy de la ruta protegida);
solo extrae claims para decidir status. Si el token es inválido/ausente, el guard es
transparente y el AuthGuard de la ruta (si existe) rechaza con 401 después.

**Wiring del JwtService (gap detectado)**: `AuthModule` NO exporta `JwtModule` (solo
`AuthService`) y no es `@Global`. Por eso `app.module.ts` debe importar
`JwtModule.register({ secret: JWT_ACCESS_SECRET })` (mismo secret que AuthModule, vía
ConfigService) para que el guard pueda inyectar `JwtService`. `RedisService` y
`ClockPort` SÍ son `@Global` → inyectables sin importar nada.

### Decisión 2: Orden de guards
APP_GUARD `OrgStatusGuard` se registra DESPUÉS de `ThrottlerGuard`. Como es
self-contained (decodifica JWT solo), su posición relativa a los guards de
controller (AuthGuard/PermissionsGuard/ModuleEnabledGuard) es irrelevante para la
corrección: no depende de `req.user`. Coexiste sin orden requerido.

### Decisión 3: Lectura del status — puerto
| Opción | Decisión |
|--------|----------|
| Reusar `OrgsReaderPort.findById` (devuelve `Organization` completa) | ❌ trae toda la fila; sobra |
| Nuevo `OrgStatusReaderPort` con `getStatus(id): Promise<OrganizationStatus \| null>` | ✅ superficie mínima, lo define `common` (consumidor), lo implementa `tenants` (dueño) |

**Rationale**: CLAUDE.md §3.3 — el consumidor define el puerto. Adapter
`PrismaOrgStatusReaderAdapter` en `src/tenants/adapters/`, registrado y exportado
por `TenantsModule` vía token `ORG_STATUS_READER_PORT`. `common` no importa adapter
de `tenants` directo.

### Decisión 4: Cache — clave separada
| Opción | Tradeoff | Decisión |
|--------|----------|----------|
| Extender `org-features:<id>` con `status` | Cambia el shape cacheado; ModuleEnabledGuard y OrgStatusGuard compartirían invalidación cruzada y acoplan dos guards a un mismo objeto | ❌ |
| Clave nueva `org-status:<id>` (TTL 300s) | Independiente, invalidación aislada en el setter de status | ✅ |

**Rationale**: separar evita que un cambio de features invalide status y viceversa,
y que el shape de un guard rompa al otro. Mismo patrón que ModuleEnabledGuard
(get → miss → `findUnique` select mínimo → set TTL 300s; fallo de Redis → `logger.warn`
y fallback a BD, nunca rompe el request).

### Decisión 5: Lectura vs mutación
`GET`/`HEAD`/`OPTIONS` = lectura (transparente). `POST`/`PUT`/`PATCH`/`DELETE` =
mutación (sujeta a check). Confirmado por grep: 0 endpoints de búsqueda/reporte/export
en métodos de mutación → la heurística pura por método es segura HOY.

### Decisión 6: Guard rail `@AllowOnNonActiveOrg()`
Decorator + `Reflector.getAllAndOverride` en el guard. Si está presente en handler o
clase → el guard retorna `true` aunque sea mutación. Cubre futuros POST-de-lectura
(búsqueda con body, export vía POST). Hoy sin casos, pero la convención existe y se
documenta. Preferido sobre allowlist de paths (acoplado a strings frágiles).

### Decisión 7: 403 vs 404 para org inexistente
Si `getStatus` devuelve `null` (org no existe): OrgStatusGuard retorna `true`
(transparente), NO lanza. Rationale: no es responsabilidad de este guard validar
existencia — TenantGuard/membership o el repositorio scoped lo hacen. Lanzar 404 acá
duplicaría semántica de ModuleEnabledGuard y podría disparar en rutas donde el
tenantId del header es basura. El guard solo bloquea cuando hay un status REAL ≠ ACTIVE.

## Data Flow

    request ──→ [OrgStatusGuard APP_GUARD]
                  │ 1. decode Bearer (JwtService.verify, best-effort)
                  │ 2. sin token / sin activeTenantId → return true
                  │ 3. isSuperAdmin === true → return true
                  │ 4. método lectura (GET/HEAD/OPTIONS) → return true
                  │ 5. @AllowOnNonActiveOrg presente → return true
                  │ 6. status = cache(org-status:<id>) ?? BD
                  │ 7. status === ACTIVE → return true
                  │    status ≠ ACTIVE → throw OrgStatusNoActivaError (403)
                  ↓
            [AuthGuard('jwt') + ModuleEnabledGuard + PermissionsGuard del controller]

    actualizarStatus(orgId, status) ──→ writer.updateStatus ──→ redis.del(org-status:<orgId>)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/common/guards/org-status.guard.ts` | Create | Guard global; decode JWT best-effort, lógica 1-7 |
| `src/common/guards/org-status.guard.spec.ts` | Create | Unit con mocks |
| `src/common/decorators/allow-on-non-active-org.decorator.ts` | Create | `@AllowOnNonActiveOrg()` + `ALLOW_ON_NON_ACTIVE_ORG_KEY` |
| `src/common/ports/org-status-reader.port.ts` | Create | `OrgStatusReaderPort` + `ORG_STATUS_READER_PORT` token |
| `src/common/errors/org-status-no-activa.error.ts` | Create | `OrgStatusNoActivaError extends ForbiddenError`, code `ORG_STATUS_NO_ACTIVE` |
| `src/common/errors/index.ts` | Modify | export del error nuevo |
| `src/common/guards/index.ts` | Modify | export del guard |
| `src/tenants/adapters/prisma-org-status-reader.adapter.ts` | Create | Implementa el puerto (`select: { status }`) |
| `src/tenants/tenants.module.ts` | Modify | Registrar + exportar `ORG_STATUS_READER_PORT` |
| `src/app.module.ts` | Modify | Importar `JwtModule.register({secret: JWT_ACCESS_SECRET})`; importar `TenantsModule` (provee el puerto); `{ provide: APP_GUARD, useClass: OrgStatusGuard }` tras ThrottlerGuard |
| `src/platform/platform-admin.service.ts` | Modify | `actualizarStatus` invalida `org-status:<orgId>` vía RedisService |
| `test/org-status-enforcement.e2e-spec.ts` | Create | E2E rutas reales |

## Interfaces / Contracts

```typescript
// src/common/ports/org-status-reader.port.ts
import type { OrganizationStatus } from '@prisma/client';
export const ORG_STATUS_READER_PORT = Symbol('ORG_STATUS_READER_PORT');
export abstract class OrgStatusReaderPort {
  /** Status de la org, o null si no existe. */
  abstract getStatus(organizationId: string): Promise<OrganizationStatus | null>;
}

// error: code estable, 403 vía ForbiddenError
export class OrgStatusNoActivaError extends ForbiddenError {
  constructor(status: OrganizationStatus) {
    super('ORG_STATUS_NO_ACTIVE',
      'La organización no está activa: solo se permiten operaciones de lectura.',
      { status });
  }
}
```

## Testing Strategy

| Layer | Qué | Cómo |
|-------|-----|------|
| Unit | Guard: matriz status(ACTIVE/SUSPENDED/ARCHIVED) × método(GET/POST) × SA × decorator × sin-token × sin-tenantId × org-inexistente(null→true) | Mock `JwtService`, `OrgStatusReaderPort`, `RedisService`, `Reflector`, `ExecutionContext` con headers/handler. Sin DB |
| Unit | Cache: hit no consulta BD; miss consulta y setea; fallo Redis → fallback BD sin throw | Mock RedisService que lanza |
| Integration | Adapter `PrismaOrgStatusReaderAdapter.getStatus` contra Postgres | `.integration.spec.ts` con org seed |
| E2E | POST mutación en SUSPENDED/ARCHIVED → 403 `ORG_STATUS_NO_ACTIVE`; GET → 200; SA muta sin bloqueo; ACTIVE sin regresión; cambio de status vía setter refleja sin TTL (invalidación) | `test/*.e2e-spec.ts`, Postgres real, JWTs por status |

## Migration / Rollout

No requiere migración de datos (la columna `status` ya existe). Rollback: remover el
`APP_GUARD` de `app.module.ts` (status vuelve a display puro) o `git revert` del squash.

## Open Questions

- Ninguna que bloquee. Residual no-bloqueante: si en el futuro aparece un POST-de-lectura,
  aplicar `@AllowOnNonActiveOrg()` (convención ya provista).
