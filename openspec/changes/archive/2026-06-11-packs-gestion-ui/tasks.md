# Tasks: packs-gestion-ui

> TDD estricto: cada slice es RED → GREEN. Slice 0 bloquea Slices 1 y 2.
> Commit squash por slice. Verde (tsc + suite + lint) entre PRs.

---

## Resumen de fases

| Slice | PR commit | Tareas | Foco |
|-------|-----------|--------|------|
| Slice 0 | `feat(platform): add GET /admin/platform/packs and regenerate types` | 7 | Backend GAP-1 + tipos + aliases |
| Slice 1 | `feat(frontend): platform-admin pack entitlement sheet` | 9 | UI super-admin habilitar/revocar |
| Slice 2 | `feat(frontend): owner complementos page and nav gating` | 12 | UI Owner activación + nav SystemRole |
| **Total** | | **28** | |

**Dependencia**: Slice 0 DEBE estar mergeado (aliases en `api.ts`, tipos generados) antes de iniciar Slice 1 o Slice 2.
Slices 1 y 2 son independientes entre sí y pueden desarrollarse en paralelo, pero se entregan como PRs separados.

---

## Slice 0 — Backend GAP-1 + tipos

> Rama: `feat/platform-packs-catalogo`
> PR: `feat(platform): add GET /admin/platform/packs and regenerate types`

### RED — tests primero

- [x] 0.1 Crear `backend/test/packs-catalogo.e2e-spec.ts`: test `GET /api/admin/platform/packs` con JWT super-admin → 404 (rojo); test mismo endpoint con JWT no-SA → 403 (ya rojo).
  Reutilizar helpers de `test/` (`createTestTenant`, helper JWT SA). El 404 valida que el endpoint aún no existe.

### GREEN — implementación

- [x] 0.2 En `backend/src/platform/platform-admin.service.ts`: agregar método `listarCatalogoPacks(): Promise<PackResponseDto[]>` que delega a `this.packs.listarCatalogo()` y mapea con `toPackResponse` (importar de `@/packs/dto/pack-response.dto`). Sin port nuevo.
- [x] 0.3 En `backend/src/platform/platform-admin.controller.ts`: agregar `@Get('packs')` con `@ApiOperation`, `@ApiOkResponse({ type: [PackResponseDto] })`, `@ApiResponse({ status: 403 })`. Guards heredados del controller (clase). Sin guards adicionales al método.
- [x] 0.4 Correr suite e2e de slice 0 — verificar verde (200 SA con array de packs del seed; 403 no-SA).

### Tipos + aliases

- [x] 0.5 Regenerar `backend/openapi.json` desde `backend/` con el comando exacto (5 env MINIO_* + DATABASE_URL + REDIS_HOST inline — ver design §0.3). Verificar que el único diff sea el path `/api/admin/platform/packs`.
- [x] 0.6 Desde `frontend/`: correr `pnpm run gen:api-types` → actualiza `src/types/api.generated.ts`.
- [x] 0.7 En `frontend/src/types/api.ts`: agregar bloque de aliases "Packs (eje 2)": `Pack`, `OrgPackEntitlement`, `ActivacionPack`, `HabilitarPackRequest`, `ActivarPackRequest` (ver design §0.4). Verificar `git diff --exit-code` sobre `openapi.json` + `api.generated.ts` solo muestra el path nuevo.

**Verde Slice 0**: `tsc --noEmit` backend + e2e packs-catalogo + `tsc -b` frontend + `contract-drift` local limpio.

---

## Slice 1 — UI super-admin (entitlement de packs)

> Rama: `feat/platform-packs-entitlement-ui`
> PR: `feat(frontend): platform-admin pack entitlement sheet`
> Requiere: Slice 0 mergeado

### RED — tests primero

- [ ] 1.1 Crear `frontend/src/features/platform-admin/components/org-packs-sheet.test.tsx` con mocks de todos los hooks (`vi.mock('../hooks/use-packs-catalogo')`, etc.). Tres casos ROJOS: (a) org CONTABILIDAD con 1 pack habilitado → badge "Habilitado" + botón "Revocar"; otro pack → "Habilitar"; (b) org GRANJA → solo packs `verticalAplicable==='GRANJA'` visibles; (c) click "Habilitar" → `mutate({ orgId, clave })` (no id).

### GREEN — implementación

- [ ] 1.2 Crear `frontend/src/features/platform-admin/api/get-packs-catalogo.ts` — `GET /api/admin/platform/packs` → `Pack[]`.
- [ ] 1.3 Crear `frontend/src/features/platform-admin/api/get-org-packs.ts` — `GET /api/admin/platform/orgs/:id/packs` → `OrgPackEntitlement[]`.
- [ ] 1.4 Crear `frontend/src/features/platform-admin/api/habilitar-pack.ts` — `POST /api/admin/platform/orgs/:id/packs` con `{ clave }` → `OrgPackEntitlement`.
- [ ] 1.5 Crear `frontend/src/features/platform-admin/api/revocar-pack.ts` — `DELETE /api/admin/platform/orgs/:id/packs/:packId` → `void`.
- [ ] 1.6 Crear los 4 hooks en `frontend/src/features/platform-admin/hooks/`: `use-packs-catalogo.ts` (query key `['platform-packs-catalogo']`), `use-org-packs.ts` (query key `['platform-org-packs', orgId]`, `enabled: orgId !== null`), `use-habilitar-pack.ts` (mutación, toast en hook, invalida `['platform-org-packs', orgId]`), `use-revocar-pack.ts` (mutación, toast en hook, invalida `['platform-org-packs', orgId]`).
- [ ] 1.7 Crear `frontend/src/features/platform-admin/components/org-packs-sheet.tsx`: Sheet right, `OrgPacksSheetProps { org, open, onOpenChange }`, filtro vertical desde `org.contabilidadEnabled`/`org.granjaEnabled`, cruce catálogo↔entitlements con Map, fila por pack con badge estado + botón acción, skeleton en loading, banner en error, footer "Cerrar". Tap target ≥44px.
- [ ] 1.8 Modificar `frontend/src/features/platform-admin/pages/orgs-page.tsx`: estado `packsOrg`, item "Gestionar packs" en `OrgRowActions`, prop `onManagePacks` propagada, `<OrgPacksSheet>` renderizado junto a `EntitlementSheet`.
- [ ] 1.9 Correr `tsc -b`, `lint`, `vitest` frontend — verde.

---

## Slice 2 — UI Owner (activación)

> Rama: `feat/frontend-complementos-owner`
> PR: `feat(frontend): owner complementos page and nav gating`
> Requiere: Slice 0 mergeado

### RED — tests primero

- [ ] 2.1 Crear `frontend/src/features/packs/pages/complementos-page.test.tsx`: mock de `useMisPacksGestion`. Tres casos ROJOS: (a) data vacía → copy exacto del empty state; (b) 2 entitlements → 2 `ComplementoRow` con switch reflejando `activo`; (c) `isError` → banner inline (no toast).
- [ ] 2.2 Crear `frontend/src/features/packs/components/complemento-row.test.tsx`: mock de `useActivarPack`. Tres casos: switch `checked` = `entitlement.activo`; `onCheckedChange` → `mutate({ clave, activo })`; disabled cuando `isPending`.
- [ ] 2.3 Crear/extender `nav-list.test.tsx`: ítem "Complementos" visible con `user.roles=['OWNER']`; oculto con custom role sin OWNER/ADMIN; oculto sin `user.roles` (fail-closed).
- [ ] 2.4 Crear `frontend/src/components/shared/require-system-role.test.tsx`: redirige a `/` sin rol OWNER/ADMIN; renderiza children con OWNER.

### GREEN — implementación

- [ ] 2.5 Crear `frontend/src/features/packs/api/get-mis-packs.ts` — `GET /api/packs/mis-packs` → `OrgPackEntitlement[]`.
- [ ] 2.6 Crear `frontend/src/features/packs/api/activar-pack.ts` — `PATCH /api/packs/:clave` con `{ activo: boolean }` → `ActivacionPack`.
- [ ] 2.7 Crear `frontend/src/features/packs/hooks/use-mis-packs-gestion.ts`: query key `['mis-packs-gestion', activeTenantId]`, `enabled: Boolean(accessToken) && Boolean(activeTenantId)`. **NO reutilizar `lib/use-packs.ts`.**
- [ ] 2.8 Crear `frontend/src/features/packs/hooks/use-activar-pack.ts`: mutación, invalida `['mis-packs-gestion', activeTenantId]` Y `['me-permissions', activeTenantId]`, toast en hook. Estrategia: invalidación (no optimistic) → el switch revierte solo en error porque el cache no se tocó.
- [ ] 2.9 Crear `frontend/src/features/packs/components/complemento-row.tsx`: clona `FeatureFlagRow`, props `{ entitlement: OrgPackEntitlement }`, switch `checked=entitlement.activo`, `disabled=mutation.isPending`, llama `useActivarPack`. Toast en hook, no en componente.
- [ ] 2.10 Crear `frontend/src/features/packs/pages/complementos-page.tsx`: clona `FeaturesPage`, header "Complementos" + subtítulo, skeleton loading, banner error inline, empty state con copy exacto, lista de `ComplementoRow`.
- [ ] 2.11 Crear `frontend/src/components/shared/require-system-role.tsx`: clona `require-permission.tsx` pero usa `useHasSystemRole(roles)` (sincrónico, sin loading state). Redirige a `/` si no tiene el rol.
- [ ] 2.12 Modificar `frontend/src/navigation/nav-items.ts`: agregar campo `requiredSystemRole?: SystemRole[]` a la interfaz `NavItem` (importar `SystemRole` de `@/types/api`). Agregar nav item `{ to: '/settings/complementos', label: 'Complementos', icon: Boxes, requiredSystemRole: ['OWNER', 'ADMIN'] }` sin `vertical` ni `pack`.
- [ ] 2.13 Modificar `frontend/src/navigation/nav-list.tsx`: leer `userRoles = useAuthStore((s) => s.user?.roles)` UNA vez; agregar condición `pasaSystemRole` al `.filter` existente (ver design §2.6). NO llamar `useHasSystemRole` por ítem.
- [ ] 2.14 Modificar `frontend/src/router.tsx`: agregar ruta `/settings/complementos` dentro de `DashboardShell`, envuelta en `<RequireSystemRole roles={['OWNER', 'ADMIN']}>`, importar `ComplementosPage` y `RequireSystemRole`.
- [ ] 2.15 Correr `tsc -b`, `lint`, `vitest` frontend — verde.

---

## Smoke manual (Marco)

Flujo end-to-end para validar los 3 slices integrados:

1. Iniciar sesión como super-admin (`smoke-admin@avicont.dev`).
2. Ir a `/platform-admin/orgs` → abrir dropdown de una org con vertical CONTABILIDAD → "Gestionar packs".
3. Verificar que el sheet muestra los packs CONTABILIDAD del catálogo (no los de GRANJA).
4. Habilitar un pack que no esté habilitado → toast de éxito → la fila cambia a "Habilitado / Revocar".
5. Cambiar a sesión Owner de esa org → ir a `/settings/complementos`.
6. Verificar que el pack habilitado aparece con switch OFF (habilitado pero inactivo).
7. Activar el switch → toast "Complemento activado" → nav actualiza (ítem del pack aparece si tiene nav item gateado).
8. Desactivar el switch → nav item desaparece.
9. Con un usuario de rol custom (sin OWNER/ADMIN): verificar que `/settings/complementos` redirige y el ítem "Complementos" no aparece en el nav.
10. Super-admin: volver al sheet y revocar el pack → la fila vuelve a "Habilitar".
