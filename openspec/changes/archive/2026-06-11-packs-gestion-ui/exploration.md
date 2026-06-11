# Exploration: packs-gestion-ui

> Generado: 2026-06-11
> Change: `packs-gestion-ui` — UI completa de gestión de packs (entitlement super-admin + activación Owner)

---

## 1. Superficie backend real de packs

### 1.1 Endpoints del Owner (PackController — `backend/src/packs/pack.controller.ts`)

Guards: `JwtAuthGuard` + `SystemRolesGuard` + `@RequireSystemRole(OWNER, ADMIN)`.
Opera sobre `req.user.activeTenantId`.

| Método | Ruta | Request | Response | Descripción |
|--------|------|---------|----------|-------------|
| `GET` | `/api/packs/mis-packs` | — | `OrgPackEntitlementResponseDto[]` | Lista TODOS los entitlements habilitados para la org, cada uno con `activo: boolean`. No solo los activos. |
| `PATCH` | `/api/packs/:clave` | `ActivarPackDto` (`activo: boolean`) | `ActivacionPackResponseDto` | Activa/desactiva un pack habilitado. 403 `PACK_NO_HABILITADO` si no hay entitlement. 404 `PACK_NO_ENCONTRADO` si la clave no existe en el catálogo. |

**Detalle crítico de `GET /api/packs/mis-packs`**: devuelve `OrgPackEntitlementConPack[]` (port `org-pack.repository.port.ts:63`) → todos los entitlements de la org sin importar `activo`. El frontend puede mostrar habilitados-inactivos y habilitados-activos en la misma lista. Cada item trae `pack` embebido (id, clave, nombre, descripcion, verticalAplicable, tipo). Fuente: `pack.service.ts:136` → `repo.findByOrg(organizationId)`.

**ActivacionPackResponseDto** (respuesta PATCH): `{ id, organizationId, packId, activo }` — NO incluye el `pack` embebido (solo OrgPackEntitlementResponseDto lo incluye).

### 1.2 Endpoints del Super-Admin (PlatformAdminController — `backend/src/platform/platform-admin.controller.ts`)

Guards: `JwtAuthGuard` + `SuperAdminGuard` + `PlatformAuditInterceptor`.
Todos hacen `req['tenantId'] = id` para que el interceptor capture `targetOrganizationId`.

| Método | Ruta | Request | Response | Descripción |
|--------|------|---------|----------|-------------|
| `POST` | `/api/admin/platform/orgs/:id/packs` | `HabilitarPackDto` (`packId?`, `clave?`) | `OrgPackEntitlementResponseDto` (201) | Habilita un pack a la org. Valida vertical. Crea con `activo=false`. |
| `DELETE` | `/api/admin/platform/orgs/:id/packs/:packId` | — | 204 | Revoca el entitlement (borra la fila). Idempotente. |
| `GET` | `/api/admin/platform/orgs/:id/packs` | — | `OrgPackEntitlementResponseDto[]` | Lista entitlements de la org con pack embebido y `activo`. |

**HabilitarPackDto** (`backend/src/packs/dto/habilitar-pack.dto.ts`): acepta `packId` (UUID) OR `clave` (string estable). Al menos uno es obligatorio. `ValidateIf` enforza esto.

**OrgPackEntitlementResponseDto** (`backend/src/packs/dto/org-pack-entitlement-response.dto.ts`): `{ id, organizationId, packId, activo, habilitadoPorUserId, pack: PackResponseDto }`.

**PackResponseDto** (`backend/src/packs/dto/pack-response.dto.ts`): `{ id, clave, nombre, descripcion, verticalAplicable, tipo, activo }`.

### 1.3 Catálogo de packs (`GET /me/permissions`)

`MePermissionsResponseDto` incluye `packsActivos: string[]` — solo claves de packs con `activo=true`. Es la fuente que usa `useMisPacks()` para el gating del nav. No expone el catálogo completo ni los habilitados-inactivos.

### 1.4 Catálogo global (seed `backend/prisma/seeds/packs-catalogo.ts`)

3 packs activos en el catálogo:
- `contabilidad.adjuntos` — `CONTABILIDAD`, `CAPACIDAD`
- `contabilidad.rag` — `CONTABILIDAD`, `CAPACIDAD`
- `granja.rag` — `GRANJA`, `CAPACIDAD`

---

## 2. Gaps de endpoint detectados

### GAP-1: No existe `GET /admin/platform/packs` (catálogo global para SA) — **CRÍTICO**

El super-admin necesita saber QUÉ packs puede habilitar a una org antes de llamar a `POST /admin/platform/orgs/:id/packs`. Hoy:
- `PackService.listarCatalogo()` existe (`pack.service.ts:51`) pero **no está expuesto en ningún controller**.
- El único método GET de packs del SA (`GET /admin/platform/orgs/:id/packs`) devuelve los ya habilitados, no el catálogo completo.

**Sin este endpoint, el SA no puede saber qué packs existen sin conocer las claves de memoria.** Para habilitar un pack, tendría que conocer la `clave` o el `packId` a priori.

Opciones:
- **Opción A (recomendada)**: Agregar `GET /admin/platform/packs` que devuelva `PackResponseDto[]`. Endpoint org-less bajo SuperAdminGuard. Minimal: reusa `PackService.listarCatalogo()`.
- **Opción B**: No crear endpoint, filtrar la lista de habilitados para mostrar solo los disponibles según el vertical de la org. Problema: el SA no puede habilitar un pack que la org no tiene todavía → la pantalla de "habilitar pack nuevo" quedaría ciega.

**Conclusión: hay que crear el backend endpoint antes de construir la UI del SA.**

### GAP-2: No hay tipos frontend para DTOs de packs (en `api.ts`)

Los tipos `OrgPackEntitlementResponseDto`, `PackResponseDto`, `ActivacionPackResponseDto`, `HabilitarPackDto` están en `api.generated.ts` (líneas 1954, 1966, 1979, 2412) pero **no están re-exportados en `frontend/src/types/api.ts`**. Hay que agregar los aliases antes de construir las funciones de api del frontend.

Además, si se agrega el endpoint `GET /admin/platform/packs`, hay que correr `openapi:dump` + `gen:api-types` para que aparezca en el generado.

---

## 3. Patrones frontend a clonar

### 3.1 Patrón SA — Sheet + Form + Mutation + Invalidación

El molde más cercano es el entitlement de verticales, distribuido en:
- **Schema zod**: `frontend/src/features/platform-admin/schemas/entitlement-schema.ts` — valida con `z.object()` + `.refine()` para reglas cross-field, mensajes en español.
- **API function**: `frontend/src/features/platform-admin/api/update-entitlement.ts` — `api.patch<PlatformOrg>(url, body)`, tipado con alias de `api.ts`.
- **Hook mutation**: `frontend/src/features/platform-admin/hooks/use-update-entitlement.ts` — `useMutation`, `onSuccess` invalida `['platform-orgs']` + toast. Toast vive en el hook (Anti-F-13). Sheet cierra en `onSuccess` del caller.
- **Componente Sheet**: `frontend/src/features/platform-admin/components/entitlement-sheet.tsx` — `Sheet` + `react-hook-form` + `zodResolver`, `useEffect` para re-sync al cambiar org, `<Button disabled={mutation.isPending}>` (Anti-F-07).
- **Página orquestadora**: `frontend/src/features/platform-admin/pages/orgs-page.tsx` — estado local `useState<PlatformOrg | null>` para la org seleccionada, pasa a `EntitlementSheet`. DropdownMenu por fila con "Editar entitlement".

**Para packs del SA**: mismo patrón. Diferencias clave:
- El sheet de packs no es un form de edición de campos de la org — es una lista de packs habilitables con toggle. Más parecido a `FeaturesPage` (lista de switches) que a `EntitlementSheet` (form con selects).
- La invalidación post-mutación debe limpiar `['platform-orgs']` (lista SA) Y `['platform-org-packs', orgId]` (nueva query key para los packs de la org).
- Además hay que invalidar el cache Redis `org-packs:<orgId>` — eso lo hace el backend automáticamente (`PackService.habilitar/revocar` borra la clave vía `RedisService.del`).

### 3.2 Patrón Owner — Settings page con switches

El molde es `features-page.tsx` (`frontend/src/features/tenants/pages/features-page.tsx`):
- Página de settings con lista de toggles.
- Skeleton mientras carga, banner inline en error (Anti-F-13: no toast).
- Cada fila es un `FeatureFlagRow` con switch.

**Para packs del Owner** (`/settings/complementos` o similar):
- Query: `useMisPacks()` ya existe pero devuelve solo las claves activas, NO los habilitados-inactivos.
- Se necesita una nueva query `useOwnPacks()` (o renombrar) que llame a `GET /api/packs/mis-packs` y devuelva `OrgPackEntitlementResponseDto[]` completo (habilitados con su `activo`).
- Mutation: nueva `useActivarPack()` que llame a `PATCH /api/packs/:clave` → invalide `['me-permissions', activeTenantId]` (para que `useMisPacks` refleje el cambio) + `['own-packs', activeTenantId]` (la nueva query).
- El switch del toggle SOLO aparece si el pack está habilitado (`OrgPackEntitlementResponseDto` existe). Si no está habilitado, el pack no aparece en la lista (no hay forma de habilitarse uno mismo → eso es rol del SA).

### 3.3 Gating de la ruta Owner

Molde: `router.tsx:176-191` — `/settings/empresa` gateada con `RequirePermission` + `PERMISSIONS.organizacion.configuracion.read`.

Para `/settings/complementos`:
- **Permiso a usar**: ver decisiones abiertas §4. Opciones: `organizacion.configuracion.read` (reutilizar) o permiso nuevo `organizacion.packs.read`.
- El permiso que usa el backend en `PackController` es `@RequireSystemRole(OWNER, ADMIN)` — NO es un permiso fino del catálogo. Por tanto, la ruta se gatéa con `useHasSystemRole(['OWNER', 'ADMIN'])` (igual que `usePuedeReabrir`), no con `usePermissions().has(...)`.

### 3.4 Nav item para `/settings/complementos`

Molde: `nav-items.ts:127-154` — ítems de administración cross-vertical (sin campo `vertical`).
El ítem de packs no debe tener `vertical` (los packs pueden existir en cualquier vertical) pero podría tener `pack` vacío o ser filtrado por `isOwner`.

### 3.5 Gating del panel SA — cómo se abre el sheet de packs

Molde: `orgs-page.tsx:56-103` — `useState<PlatformOrg | null>` + DropdownMenuItem "Gestionar packs" → abre el sheet. El sheet carga `GET /admin/platform/orgs/:id/packs` (ya existe) para mostrar los habilitados, y `GET /admin/platform/packs` (nuevo) para mostrar el catálogo completo.

---

## 4. Tipos generados: estado actual

En `api.generated.ts` ya existen:
- `PackResponseDto` (línea ~1954): `{ id, clave, nombre, descripcion, verticalAplicable, tipo, activo }`
- `OrgPackEntitlementResponseDto` (línea ~1966): `{ id, organizationId, packId, activo, habilitadoPorUserId, pack: PackResponseDto }`
- `ActivacionPackResponseDto` (línea ~1979): `{ id, organizationId, packId, activo }`
- `HabilitarPackDto` (línea ~2412): `{ packId?: string, clave?: string }`
- Endpoint `/api/packs/mis-packs` (línea ~347): `GET` → `OrgPackEntitlementResponseDto[]`
- Endpoint `/api/packs/{clave}` (línea ~364): `PATCH` → `ActivacionPackResponseDto`
- Endpoint `/api/admin/platform/orgs/{id}/packs` (línea ~1132): `GET` → `[]`, `POST` → `OrgPackEntitlementResponseDto`
- Endpoint `/api/admin/platform/orgs/{id}/packs/{packId}` (línea ~1150): `DELETE` → 204

**Lo que falta en `api.ts`** (fachada): ninguno de estos tipos está re-exportado. Hay que agregar aliases antes de escribir el código frontend.

**Después de agregar el endpoint GA P-1** (`GET /admin/platform/packs`): regenerar con `openapi:dump` + `gen:api-types` → el nuevo endpoint aparece en `api.generated.ts` → agregar su alias en `api.ts`.

---

## 5. Decisiones abiertas para el Propose

### D-01: Ruta del Owner para gestionar packs
- Opción A: `/settings/complementos` (nombre de dominio, comunica propósito)
- Opción B: `/settings/packs` (técnico, consistente con la clave del sistema)
- Opción C: Tab adicional en `/settings/features` (aprovecha pantalla existente, pero mezcla feature-flags con packs eje 2)
- **Recomendación**: Opción A (`/settings/complementos`) — más claro para el usuario final ("complementos de tu plan").

### D-02: Permiso que gatéa `/settings/complementos`
- Opción A: Usar `useHasSystemRole(['OWNER', 'ADMIN'])` — coherente con el backend (`SystemRolesGuard`). No requiere cambios al catálogo de permisos.
- Opción B: Crear `organizacion.packs.read` en el catálogo — agrega granularidad pero ningún caso de uso real la requiere (los packs siempre son OWNER/ADMIN).
- **Recomendación**: Opción A. Ruta sin permiso fino, gateada por SystemRole.

### D-03: UX de "habilitado pero inactivo" vs "no habilitado"
- La pantalla Owner debe mostrar SOLO los packs habilitados por el SA (los que tienen fila en `OrgPackEntitlement`). Un pack no habilitado no aparece (el Owner no puede habilitarse packs por su cuenta — eso es del SA).
- Switch ON = activo, Switch OFF = habilitado pero inactivo.
- Si no hay ningún pack habilitado: empty state con mensaje "No hay complementos habilitados. Contactá al administrador de la plataforma."

### D-04: Cómo el SA sabe qué packs puede habilitar (requires GAP-1)
- Requiere `GET /admin/platform/packs` (catálogo completo).
- El SA ve el catálogo completo filtrado por el vertical de la org. Los ya habilitados se marcan diferente o se excluyen del formulario de "agregar".
- UX posible: lista de packs del catálogo, cada uno con botón "Habilitar" si no está habilitado, o badge "Habilitado" + botón "Revocar" si ya lo está. Todo en un sheet sobre la org.

### D-05: Invalidación de caches tras mutación
- Backend: el `PackService` ya invalida Redis `org-packs:<orgId>` en cada mutación (habilitarParaOrg, revocar, activar). Sin acción adicional.
- Frontend SA: invalidar `['platform-org-packs', orgId]` (nueva query key). Si el listado de orgs muestra un badge de packs habilitados, también invalidar `['platform-orgs']`.
- Frontend Owner: invalidar `['me-permissions', activeTenantId]` (para que `useMisPacks` actualice el nav) + `['own-packs', activeTenantId]` (la lista de la página de complementos).

### D-06: ¿El SA debe poder ACTIVAR/DESACTIVAR packs (no solo habilitar/revocar)?
- Hoy el backend SOLO expone habilitación/revocación al SA. La activación es del Owner (`PATCH /api/packs/:clave`).
- **Recomendación**: NO agregar activación al SA. El diseño intencional es que la activación es decision del Owner. El SA solo controla la disponibilidad.

### D-07: Nav item en DashboardShell para el Owner
- Agregar ítem en `nav-items.ts` para `/settings/complementos`, sin `vertical` (cross-vertical), sin `pack` (es la pantalla de gestión de packs, no gateada por pack).
- Gateado en `NavList` con `useHasSystemRole(['OWNER', 'ADMIN'])` — requiere ajustar el filtro del NavList (hoy solo filtra por `requiredPermission`, `vertical`, `pack`).
- Alternativa: agregar un campo `requiredSystemRole?: string[]` a `NavItem` y filtrarlo en `NavList`.

---

## 6. Riesgos y cicatrices

### R-01: Invalidación de cache Redis `org-packs:<tenantId>` TTL 300
- El `PackEnabledGuard` usa la clave `org-packs:<tenantId>` con TTL 300s.
- El `PackService` ya invalida en habilitación y revocación (habilitar:104, revocar:111, activar:171 en `pack.service.ts`).
- Riesgo si el super-admin llama directo a Prisma sin pasar por el service — no aplica acá ya que el flow pasa por `PlatformAdminService → PackService`.
- **No hay riesgo nuevo**, el mecanismo ya funciona.

### R-02: Exclusividad de vertical
- El backend valida que el pack pertenezca al vertical de la org antes de habilitar (`pack.service.ts:94-101`). Error `PACK_VERTICAL_NO_APLICABLE` (400).
- En la UI del SA: el catálogo de packs a mostrar debe filtrar por el vertical de la org. Evita que el SA intente habilitar `granja.rag` a una org de CONTABILIDAD.
- La org tiene `contabilidadEnabled` y `granjaEnabled` en `PlatformOrg`. El frontend puede derivar el vertical y filtrar el catálogo en cliente (defensa UX) antes de llamar al backend (defensa real).

### R-03: Anti-31 (tenantId)
- Los endpoints del SA son cross-tenant por diseño (excepción documentada en JSDoc del controller, enforcement en SuperAdminGuard).
- Los endpoints del Owner operan sobre `activeTenantId` del JWT — no hay riesgo de cross-tenant leak.

### R-04: Fail-closed en nav
- `useMisPacks()` ya implementa fail-closed: `packsActivos === undefined` → ocultar ítems con `pack`. No hay parpadeo: los ítems gateados por pack aparecen solo cuando el cache está resuelto.
- Si se agrega un nuevo nav item para `/settings/complementos`, no va gateado por pack → no hay riesgo de fail-closed incorrecto.

### R-05: Tipos no re-exportados en `api.ts`
- Hay que agregar aliases ANTES de escribir código de api functions. Si se omite, los tipos se inferirán como `components["schemas"]["OrgPackEntitlementResponseDto"]` lo que es válido pero rompe el contrato de la fachada (CLAUDE.md §10.10 regla re: openapi-typescript).

### R-06: `ActivacionPackResponseDto` no incluye `pack` embebido
- La respuesta del PATCH (`ActivacionPackResponseDto`) solo tiene `{ id, organizationId, packId, activo }`. Si la UI Owner necesita actualizar el nombre del pack tras el toggle, debe usar el pack del item original (que ya tiene `pack` embebido de la query `GET /api/packs/mis-packs`). No es un problema si se invalida la query en onSuccess.

### R-07: `HabilitarPackDto` acepta `packId` OR `clave` pero no ninguno
- Si el front envía sin ningún campo, el backend recibe error de validación (400). La UI del SA debe siempre enviar al menos la `clave` (más estable que el UUID).

---

## 7. Archivos afectados (estimado)

### Backend (solo GAP-1)
- `backend/src/packs/pack.controller.ts` — agregar `@Get('catalogo')` OR crear endpoint en platform
- `backend/src/platform/platform-admin.controller.ts` — alternativa: agregar `GET /admin/platform/packs`
- `backend/src/platform/platform-admin.service.ts` — agregar `listarCatalogoPacks()`
- `backend/openapi.json` — regenerar
- `frontend/src/types/api.generated.ts` — regenerar

### Frontend
- `frontend/src/types/api.ts` — agregar aliases `OrgPackEntitlement`, `PackCatalogItem`, `ActivacionPack`, `HabilitarPackRequest`
- `frontend/src/features/platform-admin/api/get-org-packs.ts` — nueva función
- `frontend/src/features/platform-admin/api/get-packs-catalogo.ts` — nueva función (requiere GAP-1)
- `frontend/src/features/platform-admin/api/habilitar-pack.ts` — nueva función
- `frontend/src/features/platform-admin/api/revocar-pack.ts` — nueva función
- `frontend/src/features/platform-admin/hooks/use-org-packs.ts` — nueva query
- `frontend/src/features/platform-admin/hooks/use-packs-catalogo.ts` — nueva query
- `frontend/src/features/platform-admin/hooks/use-habilitar-pack.ts` — nueva mutation
- `frontend/src/features/platform-admin/hooks/use-revocar-pack.ts` — nueva mutation
- `frontend/src/features/platform-admin/components/org-packs-sheet.tsx` — sheet SA
- `frontend/src/features/platform-admin/pages/orgs-page.tsx` — agregar "Gestionar packs" al dropdown
- `frontend/src/features/packs/api/get-mis-packs.ts` — nueva feature packs/
- `frontend/src/features/packs/api/activar-pack.ts` — nueva función
- `frontend/src/features/packs/hooks/use-mis-packs.ts` — nueva query (reemplaza/complementa `useMisPacks` de `lib/`)
- `frontend/src/features/packs/hooks/use-activar-pack.ts` — nueva mutation
- `frontend/src/features/packs/components/pack-row.tsx` — fila con switch
- `frontend/src/features/packs/pages/complementos-page.tsx` — página Owner
- `frontend/src/routes/router.tsx` — agregar ruta `/settings/complementos`
- `frontend/src/components/nav-items.ts` — agregar nav item
- `frontend/src/components/nav-list.tsx` — ajustar filtro para SystemRole (D-07)

---

## Ready for Proposal

**Sí**, con la condición de que el propose cierre las decisiones abiertas D-01 a D-07 y confirme la creación del endpoint `GET /admin/platform/packs` (GAP-1) como parte del scope del change.

El scope sugerido para dividir el trabajo en slices:
1. **Slice 0 (backend gap)**: `GET /admin/platform/packs` + regenerar tipos + aliases en `api.ts`.
2. **Slice 1 (SA entitlement packs)**: `OrgPacksSheet` en la page de orgs (listar packs habilitados + habilitar nuevo + revocar).
3. **Slice 2 (Owner activación)**: feature `packs/`, ruta `/settings/complementos`, nav item.
