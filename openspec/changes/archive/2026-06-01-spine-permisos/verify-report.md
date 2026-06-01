# Verify Report — `spine-permisos`

<!--
Última edición: 2026-05-31
Fase: sdd-verify
Reviewer: sdd-verify sub-agent (adversarial)
-->

> **Veredicto final:** APROBADO_CON_WARNINGS
> Ningún CRITICAL bloqueante. Tres WARNING prioritarios (uno architectural, dos drift de documentación). Dos SUGGESTION.

---

## Verificación de greens (números reales)

| Check | Resultado |
|-------|-----------|
| `backend: tsc --noEmit` | ✅ 0 errores |
| `backend: jest src/rbac/` | ✅ 8/8 tests |
| `backend: jest test/me-permissions.e2e-spec.ts --runInBand --forceExit` | ✅ 7/7 tests |
| `frontend: tsc -b` | ✅ 0 errores |
| `frontend: lint (eslint)` | ✅ 0 errores |
| `frontend: vitest run` | ✅ 742/742 tests |

**Nota:** los e2e fallaron en el primer intento porque Postgres y Redis estaban apagados (Docker no iniciado). Con servicios activos, todos pasan.

---

## Cobertura REQ

### Backend — me-permissions spec

| REQ | Estado | Evidencia |
|-----|--------|-----------|
| REQ-MP-01: shape DTO `{ permissions, isOwner, activeTenantId }` | ✅ CUBIERTO | `me-permissions-response.dto.ts:1-5`; e2e verifica shape completo |
| REQ-MP-02: JwtAuthGuard → 401 sin JWT | ✅ CUBIERTO | `@UseGuards(JwtAuthGuard)` en clase; e2e `sin JWT → 401` |
| REQ-MP-03: delegar en RbacService, NO leer BD | ⚠️ PARCIAL | Usa `resolverPermisosConContexto` ✓ pero también lee Prisma directo para la membresía (REQ-MP-08). Ver WARNING-1 |
| REQ-MP-04: OWNER → isOwner: true, todos los keys del catálogo, sin `"*"` | ✅ CUBIERTO | `rbac.service.spec.ts:42-54`; e2e:`114-129` |
| REQ-MP-04: ADMIN → isOwner: false, catálogo completo | ✅ CUBIERTO | `rbac.service.spec.ts:56-66`; e2e:`131-145` |
| REQ-MP-05: MEMBER con CustomRole parcial | ✅ CUBIERTO | `rbac.service.spec.ts:96-108`; e2e:`147-162` |
| REQ-MP-05: MEMBER sin CustomRole → `permissions: []` | ✅ CUBIERTO | `rbac.service.spec.ts:85-94`; e2e:`164-174` |
| REQ-MP-05: MEMBER con wildcard de módulo | ✅ CUBIERTO | `rbac.service.spec.ts:68-83` (unit); sin e2e para este path |
| REQ-MP-06: sin `activeTenantId` → 403 + `ME_PERMISSIONS_SIN_TENANT` | ✅ CUBIERTO | `me.controller.ts:28-31`; e2e:`86-104` |
| REQ-MP-07: multi-tenant — solo datos propios, no acepta tenantId por param | ✅ CUBIERTO | JWT-only; sin query/body param; PermissionsGuard no aplica aquí |
| REQ-MP-08: membresía desactivada → 403 + `ME_PERMISSIONS_MEMBRESIA_INACTIVA` | ✅ CUBIERTO | `me.controller.ts:54-59`; e2e:`176-193` |
| REQ-MP-09: ruta `/api/me/permissions`, no `/api/permissions` | ✅ CUBIERTO | `@Controller('me')` + `@Get('permissions')`; `app.module.ts:82` |

**Backend: 11/11 cubiertos — 1 PARCIAL con deviación documentada.**

### Frontend — frontend-permission-gating spec

| REQ | Estado | Evidencia |
|-----|--------|-----------|
| REQ-FG-01: `usePermissions()` con `{ permissions, isOwner, has(), isLoading }` | ✅ CUBIERTO | `use-permissions.ts:52-82`; `use-permissions-hook.test.tsx` |
| REQ-FG-01: TanStack Query, NO leer JWT del auth-store | ✅ CUBIERTO | Lee `accessToken` y `user.activeTenantId` del store, datos del endpoint |
| REQ-FG-01: `has()` fail-closed (sin data → false) | ✅ CUBIERTO | `use-permissions.ts:69`; test `has() devuelve false durante loading` |
| REQ-FG-01: `has()` isOwner → true | ✅ CUBIERTO | `use-permissions.ts:71`; test `isOwner true devuelve true para cualquier permiso` |
| REQ-FG-02: `<Can>` oculta sin permiso | ✅ CUBIERTO | `can.tsx:44-45`; `can.test.tsx` 7 escenarios |
| REQ-FG-02: `<Can>` fail-closed en loading | ✅ CUBIERTO | `can.test.tsx:70-80` |
| REQ-FG-03: gating de acciones con disable + tooltip | ⚠️ PARCIAL | Implementado via render-prop de `<Can>` (per design D-F2). Sin `<ActionButton>`. **El test de disable+tooltip no existe.** Ver WARNING-2 |
| REQ-FG-04: `NavItem.requiredPermission?` + filtrado en `NavList` | ✅ CUBIERTO | `nav-items.ts:30-32`; `nav-list.tsx:23-26`; `nav-list.test.tsx` 5 escenarios |
| REQ-FG-04: `NavList` llama `usePermissions()` UNA sola vez | ✅ CUBIERTO | `nav-list.tsx:23` — una sola llamada al hook |
| REQ-FG-04: fail-closed en loading (ítems con permiso ocultos) | ✅ CUBIERTO | `nav-list.test.tsx:85-94` |
| REQ-FG-05: páginas gateadas — acceso denegado inline (no redirect) | ✅ CUBIERTO | `require-permission.tsx:44-57`; `router.tsx:50-81` (4 rutas) |
| REQ-FG-05: `/libros/diario`, `/libros/mayor`, `/eeff/balance`, `/eeff/resultados` gateadas | ✅ CUBIERTO | `router.tsx:50-81` |
| REQ-FG-05: loading → skeleton (no muestra datos ni acceso denegado) | ✅ CUBIERTO | `require-permission.tsx:34-42`; `require-permission.test.tsx:87-100` |
| REQ-FG-06: `queryKey ['me', 'permissions']` | ⚠️ DRIFT | Implementado como `['me-permissions', activeTenantId]`. Ver WARNING-3 |
| REQ-FG-06: `staleTime` ≥ 60 segundos | ✅ CUBIERTO | `staleTime: 5 * 60 * 1000` (5 min) |
| REQ-FG-06: query deshabilitada sin `accessToken` | ✅ CUBIERTO | `enabled: Boolean(accessToken) && Boolean(activeTenantId)` |
| REQ-FG-07: sin lógica de permisos en componentes individuales | ✅ CUBIERTO | Gating en `<Can>`, `<RequirePermission>`, `NavList` — no en páginas directamente |

**Frontend: 15/17 cubiertos — 2 PARCIAL/DRIFT.**

---

## Hallazgos por severidad

### WARNING (3)

#### WARNING-1: `MeController` lee Prisma directo — viola REQ-MP-03 (deviación consciente)

**Archivo:** `backend/src/me/me.controller.ts:7,23,40-51`

**Qué:** `MeController` inyecta `PrismaService` directamente y hace `prisma.membership.findUnique()` para distinguir membresía desactivada (REQ-MP-08) de usuario sin permisos. El spec REQ-MP-03 dice explícitamente "NO DEBE leer la base de datos directamente."

**Evidencia:** El spec (§REQ-MP-08) reconoce el costo: "se acepta que, si la verificación extra tiene costo, el endpoint devuelva 403 genérico sin distinguir la causa." El design (D-B3) no menciona Prisma directo — la deviación fue decidida en apply.

**Evaluación del veredicto (pedido por el orquestador):** ACEPTABLE como deuda consciente, NO como CRITICAL. Razones:
1. El spec acepta explícitamente el 403 genérico como alternativa. La implementación fue más específica (distingue códigos), lo que es mejor para el usuario.
2. La query es multi-tenant-safe: filtra por `{ organizationId: activeTenantId, userId: user.sub }` — ambos vienen del JWT, no del request body. No hay riesgo de cross-tenant.
3. El costo es 1 query Prisma extra por request a `/me/permissions` (que ya está cacheada por TanStack Query con staleTime de 5 min — en práctica se ejecuta raramente).
4. La alternativa correcta según arquitectura hexagonal sería un `MembershipReaderPort` en el módulo `memberships/` con una implementación Prisma, consumido por `MeModule` via port. Esto es over-engineering para este endpoint específico.

**Fix propuesto (deuda futura, NO bloqueante):** Si `memberships/` crea un `MembershipStatusPort` para este tipo de checks, migrar. Agregar a `docs/deudas-arquitecturales.md`.

**Adicionalmente:** `MeModule` registra `TenantContextService` como provider pero NUNCA se inyecta ni usa en ningún componente del módulo. Dead code sin daño funcional.
- Archivo: `backend/src/me/me.module.ts:4,10`
- Fix: remover `TenantContextService` del `providers[]`.

---

#### WARNING-2: REQ-FG-03 sin cobertura de test para el patrón disable+tooltip

**Archivo:** No existe `permission-button.test.tsx`; `can.test.tsx` no cubre el escenario.

**Qué:** REQ-FG-03 especifica escenarios observables: botón `disabled` + tooltip "No tenés permiso". El design reemplazó `<PermissionButton>` por render-prop de `<Can>`, pero los tests de `<Can>` solo verifican el render-prop con un `allowed: boolean` en texto, no el patrón visual completo. Los e2e tampoco lo cubren (no existen para UI).

**Evaluación:** No rompe funcionalidad — la lógica del render-prop es correcta y está testeada. Pero hay falta de evidencia de que el patrón (span wrapper + button disabled + TooltipContent) efectivamente se monta y funciona. El G-5 (shadcn tooltip + disabled) es el gotcha más propenso a ser mal implementado silenciosamente.

**Fix propuesto:** Agregar en `can.test.tsx` un test "render-prop con button disabled muestra tooltip de permiso" que monte el patrón completo y verifique el atributo `disabled` en el botón y la presencia del tooltip content. No es bloqueante para el merge actual.

---

#### WARNING-3: Drift de `queryKey` entre spec, design e implementación

**Archivo:** `frontend/src/lib/use-permissions.ts:57`

**Qué:**
- Spec REQ-FG-06: `queryKey: ['me', 'permissions']`
- Design D-F1: `queryKey: ['my-permissions', activeTenantId]`
- Implementación: `queryKey: ['me-permissions', activeTenantId]`
- `use-switch-tenant.ts:32`: invalida con `queryKey: ['me-permissions']` ✓ (alineado con implementación)

**Evaluación:** La implementación es CORRECTA funcionalmente. La key es interna al cliente y la invalidación explícita en switch-tenant usa la misma clave. El drift es solo de documentación vs código. El riesgo real: si un futuro developer lee el spec e intenta invalidar con `['me', 'permissions']`, no afectará el cache real.

**Fix propuesto:** Actualizar el spec REQ-FG-06 para que refleje la queryKey real `['me-permissions', activeTenantId]`. Actualizar el design D-F1 con el mismo cambio.

---

### SUGGESTION (2)

#### SUGGESTION-1: Documentación frontend dice "wildcards" cuando el backend envía strings expandidos

**Archivos:** `frontend/src/types/api.ts:1015-1021`, `frontend/src/lib/me-permissions.ts:8-10`

**Qué:** Los comentarios JSDoc dicen `permissions` son "patrones de wildcards (ej. 'contabilidad.*')" cuando en realidad el backend llama a `resolverPermisosConContexto()` que ya EXPANDE todo. El API responde strings exactos, no patrones.

**Impacto:** El `matchesPermission` en el hook funciona correctamente para strings exactos (exact→exact siempre retorna true), pero la documentación engañosa puede llevar a futuros developers a creer que el matcher es necesario por wildcards cuando ya no lo es.

**Fix:** Actualizar JSDoc en `api.ts` y `me-permissions.ts` para decir "strings exactos del catálogo (sin wildcards, ya expandidos por el backend)."

---

#### SUGGESTION-2: PERMISSIONS object tiene strings que NO existen en el catálogo del backend

**Archivo:** `frontend/src/lib/permissions.ts:12-28`

**Qué:** El objeto `PERMISSIONS` define:
- `contabilidad.comprobantes.{read,create,update,delete}` — NO existe en el catálogo (el catálogo tiene `contabilidad.asientos.*`)
- `contabilidad.cuentas.read` — NO existe en el catálogo (el catálogo tiene `contabilidad.plan-cuentas.*`)

**Impacto actual:** BAJO, porque ningún componente usa `PERMISSIONS.contabilidad.comprobantes.*` ni `PERMISSIONS.contabilidad.cuentas.read` en gating real (no hay `<Can>` ni `<RequirePermission>` que los referencie). Son constantes definidas pero sin consumo de gating.

**Riesgo futuro:** Si se usan en un `<Can>` sin verificar contra el catálogo, el gating siempre dará `false` para no-owners, ocultando acciones que el usuario SÍ puede realizar. El error sería silencioso.

**Fix:** Renombrar para alinear con el catálogo real:
- `contabilidad.comprobantes.*` → eliminar o renombrar a `contabilidad.asientos.*` (el catálogo usa `contabilidad.asientos.{read,create,update,delete,post,void}`)
- `contabilidad.cuentas.read` → `contabilidad['plan-cuentas'].read` o `planCuentas.read: 'contabilidad.plan-cuentas.read'`

El design D-F6 indica verificar contra el catálogo antes de fijar — esta verificación no se realizó completamente.

---

## Veredicto sobre deviaciones pedidas por el orquestador

### Veredicto deviación Prisma en MeController

**ACEPTABLE como implementación, DEUDA para refactor futuro.**

El spec acepta el 403 genérico como alternativa. La implementación eligió ser más específica (distinguir INACTIVA vs SIN_TENANT). La query es multi-tenant-safe (filtra por `organizationId AND userId` del JWT). El único argumento de pureza hexagonal (port) es over-engineering para este endpoint. Registrar como deuda en `docs/deudas-arquitecturales.md` cuando se cree un `MembershipStatusPort` en el módulo memberships.

### Veredicto redundancia del permission-matcher frontend

**INOFENSIVO funcionalmente, CONFUSO documentalmente.**

- El backend ahora envía strings expandidos (via `resolverPermisosConContexto`). El `matchesPermission` se llama con exact→exact, lo que retorna `true` correctamente.
- La función NO genera falsos positivos ni negativos en el flujo real.
- El test de wildcard (`contabilidad.eeff.*` → `contabilidad.eeff.read`) pasa porque el patrón de 3 partes con `*` en tercera posición SÍ funciona en el matcher.
- El patrón de 2 partes (`contabilidad.*`) NO matchea 3-part strings, pero el backend nunca envía ese patrón en la respuesta actual — el riesgo es solo teórico.
- El matcher es útil como biblioteca si en algún momento el backend cambia a devolver wildcards. No es dead code per se, pero la documentación que dice "los permisos son wildcards" ES incorrecta.

---

## Cobertura total

| Dimensión | Cubierto | Parcial | Faltante |
|-----------|----------|---------|---------|
| REQ backend (11) | 10 | 1 | 0 |
| REQ frontend (17) | 15 | 2 | 0 |
| Tipado (cero `any`) | ✅ 0 `any` | — | — |
| Multi-tenant seguro | ✅ | — | — |
| Backend = autoridad (guards intactos) | ✅ | — | — |
| isLoading fail-closed | ✅ | — | — |
| queryKey aislado por tenant | ✅ | — | — |

---

## Next recommended

1. **Inmediato (fix no-bloqueante antes de merge):** Remover `TenantContextService` del `providers[]` de `MeModule` — dead code sin uso.
2. **Post-merge (deuda menor):** Actualizar JSDoc en `frontend/src/types/api.ts` y `me-permissions.ts` — `permissions` son strings exactos, no wildcards.
3. **Post-merge (drift docs):** Actualizar spec REQ-FG-06 y design D-F1 con el queryKey real `['me-permissions', activeTenantId]`.
4. **Siguiente iteración:** Corregir `PERMISSIONS.contabilidad.comprobantes.*` → `contabilidad.asientos.*` y `contabilidad.cuentas.read` → `contabilidad.plan-cuentas.read` antes de usar en gating real.
5. **Deuda futura:** Agregar test de disable+tooltip con render-prop de `<Can>` para REQ-FG-03.

---

## Corrección post-verify (orquestador, 2026-05-31)

**WARNING-1 era INCORRECTO en parte.** El sub-hallazgo "`TenantContextService` es
dead code, removerlo" se intentó y **rompió el e2e (7/7 fail)**: Nest no podía
resolver `PrismaService (MetricsService, ?)`. `TenantContextService` es el segundo
parámetro (opcional) del constructor de `PrismaService`; al declarar `PrismaService`
como provider propio de `MeModule`, Nest necesita ese token en el contexto del
módulo para instanciarlo. **NO es dead code** — se restauró (commit `fix(me): restore
TenantContextService provider`). El resto de WARNING-1 (deviación Prisma en el
controller para distinguir membresía inactiva) sigue siendo ACEPTABLE.

**SUGGESTION-2 (strings inexistentes en el catálogo) SÍ era correcto y se corrigió:**
`PERMISSIONS.contabilidad.comprobantes.*` (no existe; el catálogo usa `asientos.*`)
eliminado, y `cuentas.read` → `planCuentas.read` (`contabilidad.plan-cuentas.read`).
Verificado que los 3 permisos realmente gateados (`libro-diario.read`,
`libro-mayor.read`, `eeff.read`) SÍ existen en el catálogo.

**SUGGESTION-1 (JSDoc "wildcards") corregido:** el backend devuelve strings exactos
expandidos; JSDoc de `api.ts` y `me-permissions.ts` actualizado.

Verde final: backend tsc 0 / lint 0 / me e2e 7/7; frontend tsc -b 0 / lint 0 / vitest 742/742.
