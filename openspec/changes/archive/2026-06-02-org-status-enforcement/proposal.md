# Proposal: Enforcement de `Organization.status` (SUSPENDED/ARCHIVED → read-only)

## Intent

`Organization.status` (ACTIVE/SUSPENDED/ARCHIVED) es hoy un flag de display puro:
ningún guard, servicio ni repo lo enforcea. Una org SUSPENDED o ARCHIVED opera con
plenas capacidades — GAP de seguridad (exploración #601). Cerramos el GAP con UN punto
de enforcement por request: mutación en org no-ACTIVE → 403; lectura siempre permitida.

## Scope

### In Scope
- Guard global dedicado `OrgStatusGuard` (`APP_GUARD`) que bloquea mutaciones cuando la org activa no es ACTIVE.
- Regla única: org no-ACTIVE (SUSPENDED **o** ARCHIVED) → lectura OK, mutación → 403 en español.
- Distinción lectura/mutación por método HTTP (GET/HEAD/OPTIONS = lectura; POST/PUT/PATCH/DELETE = mutación).
- Bypass SuperAdmin preservado: `isSuperAdmin === true` → return true antes del check de status.
- Lookup de status vía cache Redis, reusando la clave existente `org-features:<tenantId>` (extender el `select` con `status`); invalidar esa clave en el setter `actualizarStatus`.
- Mensaje/`DomainError` nuevo (`ORG_STATUS_NO_ACTIVE`) con texto en español.
- Tests: unit del guard (ACTIVE/SUSPENDED/ARCHIVED × lectura/mutación × SA) + e2e (mutación 403, GET 200, SA entra).

### Out of Scope
- `auth/login`, `switchTenant`, `impersonation`: NO se tocan — orgs no-ACTIVE son read-only, el usuario debe poder entrar a verlas. Enforcement vive solo en el guard por request (elimina el problema del JWT ya emitido).
- Enriquecer el modelo (`statusChangedAt`, `statusReason`) — follow-up posible, fuera de este change.
- Máquina de transiciones de status.
- Filtrar orgs no-ACTIVE del listado del login (siguen visibles, solo read-only).

## Capabilities

### New Capabilities
- `org-status-enforcement`: bloqueo de mutaciones por estado de organización (read-only para SUSPENDED/ARCHIVED), con bypass SuperAdmin.

### Modified Capabilities
- None

## Approach

Guard global `OrgStatusGuard` (`APP_GUARD`), corre tras autenticar (lee `req.user`/`X-Tenant-ID`).
Orden de evaluación: (1) sin `tenantId` → transparente (rutas org-less/auth no afectadas);
(2) `isSuperAdmin === true` → `return true`; (3) método de lectura → `return true`;
(4) método de mutación → leer status (cache Redis `org-features:<tenantId>`, extendido con `status`);
si ≠ ACTIVE → `throw` `DomainError` 403 en español. Setter `actualizarStatus` invalida la clave de cache.

> NOTA arquitectónica clave (descubrimiento, va a design): `TenantGuard` NO es global —
> se aplica selectivamente y NO cubre los controllers de dominio (comprobantes, cuentas,
> granja, reportes, periodos-fiscales usan `PermissionsGuard`+`ModuleEnabledGuard`, NO `TenantGuard`).
> Por eso extender `TenantGuard` dejaría sin cubrir el grueso de las mutaciones de dominio.
> El guard DEBE ser global (`APP_GUARD`) para cubrir todo. Patrón de cache tomado de `ModuleEnabledGuard`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/common/guards/org-status.guard.ts` | New | Guard global de enforcement |
| `src/app.module.ts` | Modified | Registrar `OrgStatusGuard` como `APP_GUARD` |
| `src/common/guards/module-enabled.guard.ts` | Modified | Extender `select` de cache con `status` (clave compartida) |
| `src/platform/platform-admin.service.ts` | Modified | Invalidar `org-features:<id>` en `actualizarStatus` |
| `src/common/errors/*` | New | `DomainError` `ORG_STATUS_NO_ACTIVE` (403, mensaje ES) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **POST que en realidad son lecturas** (búsqueda con body, reportes vía POST) bloqueados por la heurística de método HTTP | Med | **CONFIRMADO hoy NO existen** (grep sobre controllers: 0 endpoints search/report/export en POST/PUT/PATCH/DELETE). **Design debe cerrar la guard rail**: decorator allowlist `@AllowOnNonActiveOrg()` (vía Reflector) para futuros POST-de-lectura. Documentar la convención. |
| Guard global corre en rutas org-less (auth, platform) y rompe algo | Low | Sin `tenantId` → transparente (`return true`). Verificado: auth/platform no pueblan `activeTenantId` para estas rutas. |
| Cache Redis stale tras cambio de status (org sigue operando ~5min) | Low | Invalidar la clave en el setter `actualizarStatus`. Si Redis falla, fallback a `findUnique` directo (mismo patrón `ModuleEnabledGuard`). |
| Doble lookup (este guard + ModuleEnabledGuard) | Low | Clave de cache compartida `org-features:<tenantId>` → un solo fetch por request real. |

## Rollback Plan

Remover el provider `OrgStatusGuard` de `APP_GUARD` en `app.module.ts` (vuelve al comportamiento actual — status como display puro). El guard y el `DomainError` quedan en el árbol sin efecto. Revert trivial del PR completo vía `git revert <sha>` (squash merge).

## Dependencies

- Redis (ya en stack) — para cache de status; no es bloqueante (fallback a BD).
- Setter de status existente: `platform-admin.service.ts` `actualizarStatus`.

## Success Criteria

- [ ] Mutación (POST/PUT/PATCH/DELETE) en org SUSPENDED o ARCHIVED → 403 con mensaje en español.
- [ ] GET en org SUSPENDED/ARCHIVED → 200 (read-only funciona).
- [ ] SuperAdmin ejecuta mutaciones en org no-ACTIVE sin bloqueo.
- [ ] Mutación en org ACTIVE → sin cambio de comportamiento (no regresión).
- [ ] Cambio de status vía `actualizarStatus` se refleja sin esperar TTL (cache invalidada).
- [ ] Guard rail (decorator allowlist) lista para futuros POST-de-lectura, documentada.
