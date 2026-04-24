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
| periodos-fiscales | 1.2 | B+ | `domain/` minimalista, sin response DTOs |
| impersonation | 0 | B | `domain/` vacío |
| invitations | 0 | B− | `domain/` vacío + imports concretos cross-module |
| custom-roles | 0 | C+ | `domain/` |
| feature-flags | 0 | C | `domain/`, `ports/`, `adapters/` |
| memberships | 0 | C | `domain/`, `ports/`, `adapters/` |
| tenants | 0 | D+ | `domain/`, `ports/`, `adapters/` |
| users | 0 | D | `domain/`, `ports/`, `adapters/` |
| auth | 0 | D | `domain/`, `ports/`, `adapters/` |
| permissions | 0 | N/A | Stub intencional (catálogo read-only) |

---

## 1. Alta prioridad — atacar primero

### 1.1 Deudas puntuales de Fase 1.x (chicas, verde por commit)

Todos verdes al cerrar cada item.

- **cuentas/adapters/cuenta-reader.adapter.ts**: usa `../../configuracion-contable/ports/cuenta-reader.port` → migrar a `@/configuracion-contable/ports/cuenta-reader.port` (§3.6).
- **periodos-fiscales.module.ts**: importa `PrismaComprobantesLockAdapter` concreto desde `@/comprobantes/adapters/...` (§3.3 violation). Solución: re-exportar el adapter o exportar un `ComprobantesLockPort` symbol desde `ComprobantesModule.exports` y que el binding viva ahí — NO en periodos.
- **periodos-fiscales**: controllers retornan ORM entities directas. Crear `gestion-response.dto.ts` y `periodo-fiscal-response.dto.ts` + mappers `toGestionResponse` / `toPeriodoResponse` (patrón idéntico a `toComprobanteResponse`).
- **cuentas/domain/**: solo tiene validators + errors. Crear VOs `CodigoInterno` (valida regex jerárquico 1..8 niveles) y `CodigoPuct` (valida nivel 4 del catálogo).
- **periodos-fiscales/domain/**: sólo tiene errors. Extraer lógica de `rangoCalendario()` a un VO `RangoPeriodoFiscal`.
- **comprobantes/domain/**: `Prisma.Decimal` usado directo en validator. Crear `common/domain/Money` VO y migrar. Encapsula partida doble + redondeo ±0.01 BOB en un solo lugar.
- **comprobantes/domain/numeracion.ts**: `formatearNumero()` es función plana. Oportunidad: `NumeroComprobante` VO con invariantes del formato `{prefijo}{YY}{MM}-{correlativo:6}` y método `parse(string)` / `toString()`.

**Estimación**: 1 sesión de ~2h.

### 1.2 Desacoplar `memberships → rbac` y `invitations → rbac/notifications`

**Por qué primero**: cada cambio en RBAC hoy rompe 3 callers concretos (`memberships`, `invitations`, `custom-roles`). Es el acoplamiento más costoso en el proyecto.

Plan:
1. **RBAC expone `PermissionsCacheInvalidationPort`** (dueño del dominio cache RBAC). Interface mínima: `invalidateUser(userId)`, `invalidateUsersByCustomRole(roleId)`, `invalidateOrg(orgId)`.
2. **memberships, invitations, custom-roles** inyectan el port via Symbol + `@Inject`.
3. **Eliminar imports concretos** de `RbacService` en los 3 callers.

Mismo patrón con **`NotificationsService` → `NotificationPort`** (consumido por invitations).

**Estimación**: 1 sesión de ~3h.

---

## 2. Media prioridad — refactor cuando haya espacio

### 2.1 Hexagonizar auth + users

Es el punto de entrada de toda la app. Desacoplar vale porque:
- Cualquier cambio en `UsersService` rompe auth.
- Tests unit de auth requieren BD real hoy.
- Bloquea futuras integraciones SSO/OAuth sin romper backwards-compat.

Plan:
1. **users**: crear `domain/` (VO `Email`, `UserId`, `DisplayName`), `ports/user.repository.port.ts`, `adapters/prisma-user.repository.ts`. Exportar `USER_REPOSITORY_PORT` y `USERS_READER_PORT` (superficie mínima para auth: `findByEmail`, `findById`).
2. **auth**: reescribir `auth.service.ts` inyectando `USERS_READER_PORT` en vez de `UsersService`. Crear también `domain/`, `ports/credentials.repository.port.ts` para refresh tokens.
3. Migrar tests: mocks del port reemplazan Prisma-based setup.

**Estimación**: 2 sesiones (refactor grande, area crítica, mucho test a migrar).

### 2.2 Hexagonizar feature-flags

**Por qué**: cuando granja (Fase 2) o algún slice futuro quiera consultar flags, hoy tiene que importar `FeatureFlagsService` concreto.

Plan:
1. Crear `domain/` (VO `FeatureFlagKey` validado, enum-like `FeatureFlagState`).
2. `ports/feature-flag.repository.port.ts` + `ports/feature-flag-reader.port.ts` (superficie mínima para consumers: `isEnabled(tenantId, key)`).
3. Adapter Prisma.
4. Service refactorizado para inyectar ports + cache port (hoy inyecta `CacheService` directo).

**Estimación**: 1 sesión de ~2h.

---

## 3. Baja prioridad — nice to have

### 3.1 VOs faltantes transversales

Introducir **oportunísticamente** cuando se tocan esos archivos:

- `Email` (users, invitations, auth)
- `Password` (auth; invariante: nunca circula post-hash)
- `Token` / `RefreshToken` (auth; invariante: nunca en logs sin redact)
- `Nit` — **ya existe en common/domain** — extender a más lugares (facturas, LCV)
- `TenantSlug` (tenants; validación kebab-case)
- `ImpersonationWindow` (impersonation; hoy es const hardcoded 30min)

### 3.2 Módulos Fase 0 restantes

- **tenants**, **custom-roles**, **impersonation**: hexagonizar siguiendo el patrón de contactos cuando se necesite tocarlos. Menos críticos porque tienen menos callers cross-module.
- **memberships**: después del desacople de 1.2, revisar si vale un refactor completo.

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

**Última revisión**: 2026-04-23.
**Auditoría fuente**: 4 agentes de exploración sobre 13 módulos, grep de
imports cross-module, verificación de Symbol + abstract class bindings,
revisión de `@Inject` en services.
