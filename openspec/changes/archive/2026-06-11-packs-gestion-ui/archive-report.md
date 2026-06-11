# Archive Report — packs-gestion-ui

> Fecha de archivo: 2026-06-11
> PRs: feat #189 + deps #190 (@grpc/grpc-js 1.14.4)
> Estado final: APROBADO (1 CRITICAL C-01 corregido antes del merge)

---

## Qué se construyó

UI completa de gestión de packs sobre el riel `packs-riel` (PRs #150–#157), en 3 slices:

**Slice 0 — Endpoint catálogo (GAP-1)**
- `GET /admin/platform/packs` en `platform-admin.controller.ts`, gateado por `SuperAdminGuard`.
- Expone `PackService.listarCatalogo` → `PackResponseDto[]` con `@ApiOkResponse`.
- `backend/openapi.json` y `frontend/src/types/api.generated.ts` regenerados; aliases
  re-exportados en `api.ts`. CI `contract-drift` verde.

**Slice 1 — UI super-admin (entitlement)**
- Componente `org-packs-sheet.tsx` en `frontend/src/features/platform-admin/components/`.
- Sheet por org en `/platform-admin/orgs`: muestra catálogo filtrado por vertical, marca
  packs habilitados, botones Habilitar/Revocar.
- Habilitar → `POST /admin/platform/orgs/:id/packs { clave }`.
- Revocar → `DELETE /admin/platform/orgs/:id/packs/:packId` con `pack.id` (id del catálogo).
  **Fix C-01 aplicado**: el verify adversarial detectó que apply usaba `entitlement.id`
  en lugar de `pack.id`; corregido en código + test antes del merge.

**Slice 2 — UI Owner (activación)**
- Feature en `frontend/src/features/packs/`: `complementos-page.tsx`,
  `complemento-row.tsx`, `use-activar-pack.ts`.
- Ruta `/settings/complementos` gateada por `RequireSystemRole(['OWNER','ADMIN'])`.
- Switch ON/OFF por pack; activar/desactivar vía `PATCH /api/packs/:clave`.
- Invalida `me-permissions` + `mis-packs-gestion` tras toggle.
- `NavItem.requiredSystemRole?` campo nuevo; `NavList` filtra con `useHasSystemRole`.
- Empty state: "Tu organización no tiene complementos habilitados. Contactá al
  administrador de la plataforma."

---

## Archivos clave

| Archivo | Qué hace |
|---------|----------|
| `backend/src/platform/platform-admin.controller.ts` | Endpoint `GET /admin/platform/packs` |
| `frontend/src/features/platform-admin/components/org-packs-sheet.tsx` | UI entitlement SA |
| `frontend/src/features/packs/complementos-page.tsx` | Pantalla Owner |
| `frontend/src/features/packs/complemento-row.tsx` | Fila con switch ON/OFF |
| `frontend/src/features/packs/use-activar-pack.ts` | Mutación activar/desactivar |
| `frontend/src/components/nav-items.ts` | `requiredSystemRole?` en NavItem |
| `frontend/src/components/nav-list.tsx` | Filtro por `requiredSystemRole` |
| `frontend/src/routing/require-system-role.tsx` | Guard de routing por SystemRole |

---

## Estado de verificación

| Suite | Resultado |
|-------|-----------|
| Backend `tsc --noEmit` | ✅ PASS |
| Backend `pnpm run lint` | ✅ PASS |
| Backend e2e `packs-catalogo.e2e-spec.ts` | ✅ 4/4 (requiere env MINIO_*) |
| Frontend `tsc -b` | ✅ PASS |
| Frontend `pnpm run lint` | ✅ PASS |
| Frontend `vitest run` | ✅ 1266 tests |
| CI `contract-drift` | ✅ sin diff |

**CRITICAL corregido antes del merge**: C-01 (revocar usaba `entitlement.id` → no-op silencioso).
**WARNING residual**: W-01 (sin test explícito de "switch revierte en error"; garantizado estructuralmente por componente controlado + invalidación).

---

## Artifacts SDD

| Artifact | Ruta |
|----------|------|
| Exploration | `openspec/changes/archive/2026-06-11-packs-gestion-ui/exploration.md` |
| Proposal | `openspec/changes/archive/2026-06-11-packs-gestion-ui/proposal.md` |
| Design | `openspec/changes/archive/2026-06-11-packs-gestion-ui/design.md` |
| Tasks | `openspec/changes/archive/2026-06-11-packs-gestion-ui/tasks.md` |
| Verify report | `openspec/changes/archive/2026-06-11-packs-gestion-ui/verify-report.md` |
| Delta spec | `openspec/changes/archive/2026-06-11-packs-gestion-ui/specs/packs-gestion-ui/spec.md` |
| Spec viva | `openspec/specs/packs-gestion-ui/spec.md` |

---

## Ciclo SDD completo

explore → propose → design → tasks → apply → verify → **archive ✅**
