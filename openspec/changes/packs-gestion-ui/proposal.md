# Proposal: packs-gestion-ui

> Change: `packs-gestion-ui` — UI completa de gestión de packs (entitlement super-admin + activación Owner)
> Fase: propose | Artifact store: hybrid | Fecha: 2026-06-11

---

## Intent

El riel de packs (eje 2) está construido en backend desde el change `packs-riel`: existe
el modelo `Pack` + `OrgPackEntitlement`, el flujo entitlement→activación, el `PackEnabledGuard`
con cache Redis, y los endpoints de activación (Owner) y entitlement (super-admin). **Pero no
hay NINGUNA UI**: un super-admin no puede habilitar un pack a una org sin ir a la base de datos,
y un Owner no puede encender/apagar un pack habilitado. El riel es invisible para los usuarios.

Este change cierra esa brecha construyendo la UI completa de los dos niveles del modelo
(super-admin habilita/revoca → Owner activa/desactiva) y el único endpoint de backend que falta
(catálogo de packs para el super-admin). Es el paso natural tras `packs-riel`: el riel ya existe,
ahora se le da volante.

---

## Scope

### Entra

- **GAP-1 (backend)**: `GET /admin/platform/packs` que expone `PackService.listarCatalogo()` →
  `PackResponseDto[]`. Org-less, bajo `SuperAdminGuard`, con `@ApiOkResponse` (sin él el DTO no
  entra al OpenAPI). Es el único endpoint nuevo: sin él el super-admin no sabe qué packs existen
  para habilitar.
- **GAP-2 (tipos)**: regenerar `backend/openapi.json` (`openapi:dump`) + `frontend/src/types/api.generated.ts`
  (`gen:api-types`) y re-exportar los DTOs de packs en `frontend/src/types/api.ts` (la fachada del repo).
- **UI super-admin (entitlement)**: en `/platform-admin`, sheet por org para habilitar/revocar packs.
  Lista el catálogo (filtrado por vertical de la org) + los entitlements ya creados. Habilitar =
  `POST .../orgs/:id/packs`; revocar = `DELETE .../orgs/:id/packs/:packId`.
- **UI Owner (activación)**: pantalla `/settings/complementos` con switches por pack habilitado.
  Encender/apagar = `PATCH /api/packs/:clave`. Empty state si la org no tiene packs habilitados.
- **Nav + gating**: nuevo nav item "Complementos" gateado por `requiredSystemRole` (campo nuevo en
  `NavItem` + filtro en `NavList`). Ruta gateada por `useHasSystemRole(['OWNER','ADMIN'])`.

### NO entra (non-goals)

- Nada de IA / RAG / agente. Los packs `contabilidad.rag` y `granja.rag` son del catálogo pero su
  capacidad concreta NO se construye acá — solo se los puede habilitar/activar como cualquier otro.
- NO se toca el `PackEnabledGuard`, el modelo de datos (`Pack`, `OrgPackEntitlement`), ni la cache
  Redis. El backend de activación/entitlement ya existe y NO se modifica (salvo agregar GAP-1).
- NO se crean packs nuevos en el catálogo ni se agregan permisos al catálogo RBAC.
- El super-admin NO activa packs (ver D-06). Solo habilita/revoca.

---

## Approach por slices

Slicing en 3 PRs squasheables, dependencia lineal (Slice 0 → 1 → 2). Slice 0 desbloquea a 1 y 2
porque ambos consumen tipos de `api.ts`.

### Slice 0 — backend GAP-1 + tipos · `feat(packs)`

1. Agregar `GET /admin/platform/packs` en `platform-admin.controller.ts` (cohesión: el resto de los
   endpoints SA cross-org viven ahí, no en `pack.controller.ts` que es del Owner sobre `activeTenantId`).
   - Service: `PlatformAdminService.listarCatalogoPacks()` delega a `PackService.listarCatalogo()`
     (ya existe, `pack.service.ts:51`). Si la frontera entre módulos lo exige, exponerlo vía el
     `OrgPacksReaderPort` existente o un método del port; evaluar en design — no inventar port nuevo
     si `listarCatalogo` ya es superficie pública del service de packs.
   - Controller: guards `JwtAuthGuard` + `SuperAdminGuard`, `@ApiOkResponse({ type: [PackResponseDto] })`.
2. Regenerar `openapi.json` + `api.generated.ts`.
3. Re-exportar en `frontend/src/types/api.ts`: `PackCatalogItem` (= `PackResponseDto`),
   `OrgPackEntitlement` (= `OrgPackEntitlementResponseDto`), `ActivacionPack`, `HabilitarPackRequest`.

CI `contract-drift` debe pasar (dump+gen sin diff). Tests: e2e del nuevo endpoint (200 SA, 403 no-SA).

### Slice 1 — UI super-admin entitlement · `feat(frontend)`

Feature `platform-admin/`, clonando el patrón entitlement-sheet (`entitlement-sheet.tsx` +
`use-update-entitlement.ts`), pero más cercano a una lista de toggles/acciones que a un form.

- `api/get-packs-catalogo.ts` (GAP-1), `api/get-org-packs.ts`, `api/habilitar-pack.ts`, `api/revocar-pack.ts`.
- Hooks: `use-packs-catalogo`, `use-org-packs` (query key `['platform-org-packs', orgId]`),
  `use-habilitar-pack`, `use-revocar-pack` (toast en el hook, invalidan `['platform-org-packs', orgId]`).
- `components/org-packs-sheet.tsx`: lista el catálogo filtrado por vertical de la org; cada pack con
  badge "Habilitado" + botón "Revocar", o botón "Habilitar". Habilitar siempre envía `clave` (estable, R-07).
- `pages/orgs-page.tsx`: agregar "Gestionar packs" al dropdown por fila → abre el sheet con la org seleccionada.

### Slice 2 — UI Owner activación · `feat(frontend)`

Feature nueva `packs/`, clonando el patrón settings-con-switches (`features-page.tsx`).

- `api/get-mis-packs.ts` (`GET /api/packs/mis-packs` → `OrgPackEntitlement[]` completo, con `activo`),
  `api/activar-pack.ts` (`PATCH /api/packs/:clave`).
- Hooks: `use-mis-packs` (query key `['own-packs', activeTenantId]`), `use-activar-pack`
  (invalida `['own-packs', activeTenantId]` + `['me-permissions', activeTenantId]` → refresca nav, D-05).
- `components/pack-row.tsx`: fila con nombre/descripción + switch ON=activo / OFF=habilitado-inactivo.
- `pages/complementos-page.tsx`: lista; skeleton al cargar; banner inline en error de query; empty state
  ("Tu organización no tiene complementos habilitados. Contactá al administrador de la plataforma.").
- `routes/router.tsx`: ruta `/settings/complementos` gateada por `useHasSystemRole(['OWNER','ADMIN'])`.
- `components/nav-items.ts`: nav item "Complementos" con `requiredSystemRole: ['OWNER','ADMIN']`, sin
  `vertical`, sin `pack`.
- `components/nav-list.tsx`: agregar filtro por `requiredSystemRole` (D-07) usando `useHasSystemRole`.

---

## Decisiones

| ID | Decisión | Justificación (1 línea) |
|----|----------|-------------------------|
| **D-01** | Ruta Owner `/settings/complementos`; label nav y página = **"Complementos"** | Término user-facing en español; "pack" es vocabulario interno. **Sujeto a veto de naming de Marco** (única open question). |
| **D-02** | Gating ruta/nav Owner = `useHasSystemRole(['OWNER','ADMIN'])`, NO permiso fino | Coherente con el `SystemRolesGuard` del backend; ningún caso de uso requiere granularidad RBAC. |
| **D-03** | Owner ve SOLO packs habilitados (con fila en `OrgPackEntitlement`); switch OFF = habilitado-inactivo toggleable; sin packs → empty state | El Owner no puede habilitarse packs a sí mismo (eso es del SA); UX honesta sin acciones imposibles. |
| **D-04** | UI super-admin filtra el catálogo por el vertical de la org | UX honesta (no ofrecer lo que el backend rechazará con 400 `PACK_VERTICAL_NO_APLICABLE`); el backend sigue siendo la defensa real. Requiere GAP-1. |
| **D-05** | Invalidación Owner tras toggle = `['me-permissions', activeTenantId]` (refresca nav) + `['own-packs', activeTenantId]`; SA = `['platform-org-packs', orgId]` | El nav del Owner se gatea con `useMisPacks` (deriva de `/me/permissions`); sin invalidar, el nav no refleja el cambio. |
| **D-06** | El super-admin SOLO habilita/revoca (crea/borra entitlement con `activo=false`); NO activa | Separación entitlement→activación del modelo eje 2: el SA controla disponibilidad, el Owner decide encendido. Intencional, confirmado. |
| **D-07** | Campo `requiredSystemRole?: SystemRole[]` en `NavItem` + filtro en `NavList` | El nav hoy solo filtra por `requiredPermission`/`vertical`/`pack`; el item Complementos se gatea por rol de sistema, no por pack ni permiso fino. |
| **GAP-1** | Crear `GET /admin/platform/packs` (catálogo global) bajo `SuperAdminGuard` | Sin él el SA no conoce las claves de packs habilitables → la pantalla de habilitar quedaría ciega. `listarCatalogo()` ya existe en el service. |
| **GAP-2** | Tras tocar backend, regenerar `openapi.json` + `api.generated.ts` + aliases en `api.ts` | Regla operativa del repo (CLAUDE.md §10.10): tocar un DTO/endpoint → regenerar ambos artefactos o CI `contract-drift` rojo. |

---

## Riesgos y mitigaciones

| ID | Riesgo | Mitigación |
|----|--------|------------|
| R-01 | Invalidación cache Redis `org-packs:<id>` (TTL 300) del guard | **Ya resuelto en backend**: `PackService.habilitar/revocar/activar` borra la clave. Sin acción nueva (el flow SA pasa por `PlatformAdminService → PackService`). |
| R-02 | Exclusividad de vertical (`granja.rag` a org CONTABILIDAD → 400) | UI SA filtra el catálogo por vertical de la org (defensa UX, D-04); el backend valida de verdad (`pack.service.ts:94-101`). |
| R-03 | Anti-31 (queries cross-tenant) | Endpoints SA cross-tenant son excepción documentada (enforcement en `SuperAdminGuard`); endpoints Owner operan sobre `activeTenantId` del JWT — sin leak. |
| R-04 | Fail-closed en nav | El item Complementos NO va gateado por `pack` (va por `requiredSystemRole`), así que no aplica el fail-closed de `useMisPacks`; `useHasSystemRole` deriva de `/me/permissions` ya cargado. |
| R-05 | Tipos no re-exportados en `api.ts` | GAP-2: agregar aliases ANTES de escribir las api functions (regla fachada CLAUDE.md §10.10). |
| R-06 | `ActivacionPackResponseDto` (PATCH) no trae `pack` embebido | Irrelevante: la UI invalida `['own-packs']` en `onSuccess` y re-lee `GET /mis-packs` (que sí trae `pack`). |
| R-07 | `HabilitarPackDto` exige `packId` OR `clave` | La UI SA siempre envía `clave` (más estable que el UUID). |
| R-08 | CI `contract-drift` rojo tras regenerar mal | Slice 0 corre `openapi:dump` + `gen:api-types` y verifica `git diff --exit-code` localmente antes del PR. |

---

## Out of scope / non-goals

- Capacidad concreta de los packs RAG/IA (vectorización, agente, stores). Solo se gestionan como
  entradas de catálogo.
- Modificar el `PackEnabledGuard`, el schema de packs, o la cache Redis.
- Crear packs nuevos o permisos RBAC nuevos.
- Activación de packs por el super-admin (decisión D-06).
- Reemplazar `/settings/features` (FeatureFlag genérico) — es otra deuda de naming, no de este change.

---

## Open questions

1. **Naming de D-01** ("Complementos" como label user-facing de la ruta `/settings/complementos`).
   Marco puede vetarlo y elegir otro término. Es la única decisión abierta real; todo lo demás está cerrado.
