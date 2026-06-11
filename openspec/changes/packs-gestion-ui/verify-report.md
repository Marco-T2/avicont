# Verify Report — packs-gestion-ui

> Fase: sdd-verify (adversarial) | Fecha: 2026-06-11 | Branch: `feat/packs-gestion-ui`
> Commits: `7ced056` (Slice 0), `d3b40c4` (Slice 1), `7b123cf` (Slice 2)
> Veredicto: **RECHAZADO** — 1 CRITICAL (revocar usa el id equivocado → la revocación es un no-op silencioso en producción).

---

## Resultado REAL de cada suite (ejecutado)

| Suite | Resultado | Números |
|-------|-----------|---------|
| Backend `tsc --noEmit` | ✅ PASS | exit 0 |
| Backend `pnpm run lint` (eslint src) | ✅ PASS | exit 0 |
| Backend e2e `test/packs-catalogo.e2e-spec.ts` | ✅ PASS (con env MINIO_*) | **4/4 tests, 1 suite** |
| Frontend `tsc -b` | ✅ PASS | exit 0 |
| Frontend `pnpm run lint` (eslint .) | ✅ PASS | exit 0 |
| Frontend `vitest run` | ✅ PASS | **1266 tests, 175 files** |
| Contract-drift (`openapi:dump` + `gen:api-types` + `git diff --exit-code`) | ✅ PASS | exit 0, sin diff |

### Nota sobre el e2e — gotcha del comando, NO del código

El comando de verificación del orquestador para el e2e **NO incluía las 5 env MINIO_***.
Sin ellas el e2e FALLA (4/4 fail) porque `NestFactory.create(AppModule)` instancia
`MinioStorageAdapter` (`comprobantes.module.ts:70`), cuyo constructor hace
`config.getOrThrow('MINIO_ENDPOINT'/'MINIO_PORT'/'MINIO_ACCESS_KEY'/'MINIO_SECRET_KEY'/'MINIO_BUCKET')`
(`minio-storage.adapter.ts:46-50`).

Re-corrido con las env MINIO_* incluidas (como hace el CI) → **4/4 PASS**. El código del
e2e está bien; el comando de verificación estaba incompleto. El design (RT-01, §0.3) ya
documentaba este gotcha. **No es un hallazgo contra la implementación.**

Comando correcto:
```
NODE_OPTIONS="--experimental-vm-modules" DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh \
MINIO_ENDPOINT=localhost MINIO_PORT=9000 MINIO_ACCESS_KEY=minioadmin MINIO_SECRET_KEY=minioadmin \
MINIO_BUCKET=avicont-adjuntos MINIO_USE_SSL=false \
pnpm exec jest test/packs-catalogo.e2e-spec.ts --runInBand --forceExit
```

---

## CRITICAL

### C-01 — Revocar pack envía `entitlement.id` en lugar de `pack.id` → la revocación NO borra nada en producción

**Archivo**: `frontend/src/features/platform-admin/components/org-packs-sheet.tsx:180`

```tsx
onClick={() =>
  revocarMutation.mutate({ orgId, packId: entitlement.id })   // ❌ entitlement.id
}
```

**Qué está mal**: el backend `DELETE /admin/platform/orgs/:id/packs/:packId` interpreta el
parámetro `:packId` como el **id del Pack del catálogo** (FK `orgPackEntitlement.packId`), NO
el id de la fila de entitlement:

- `platform-admin.controller.ts:249` → `revocarPack(id, packId)`
- `platform-admin.service.ts:261` → `this.packs.revocar(orgId, packId)`
- `pack.service.ts:109-110` → `this.repo.revocar(organizationId, packId)`
- `prisma-org-pack.repository.ts:38` → `deleteMany({ where: { organizationId, packId } })`

`OrgPackEntitlement` tiene DOS ids distintos (`api.generated.ts:1983-1990`): `id` (PK del
entitlement, ej. `ent-1`) y `packId` (FK al Pack del catálogo, ej. `pack-1`). El frontend
envía `entitlement.id` (`ent-1`); el `deleteMany` filtra `packId = 'ent-1'` → **0 filas
matcheadas** → nada se borra. Como `deleteMany` es idempotente (no falla con 0 matches), la
mutation resuelve OK, dispara el toast "Pack revocado" e invalida la query — pero al re-leer,
el entitlement SIGUE ahí y el pack vuelve a aparecer como "Habilitado".

**Evidencia de que el backend espera `pack.id`**: el e2e del riel original
`packs-entitlement-admin.e2e-spec.ts:240` revoca con `pack.id`:
```ts
.delete(`/api/admin/platform/orgs/${contabilidadOrgId}/packs/${pack.id}`)  // pack.id, no entitlement.id
```

**Spec violado**: escenario "SA revoca un pack habilitado" (spec.md:80-86) — "la fila de
entitlement se borra". En producción NO se borra.

**El design tenía la firma correcta y apply la cambió**: design §1.4 línea 297 dice
`useRevocarPack().mutate({ orgId: org.id, packId: pack.id })`. apply usó `entitlement.id`.

**El test codifica el mismo bug** (test verde sobre comportamiento incorrecto):
`org-packs-sheet.test.tsx:215` assertea `packId: ENTITLEMENT_ADJUNTOS.id` (= `ent-1`). El test
pasa porque test y código cometen el mismo error. Debe assertear `pack.id` (= `pack-1`).

**Fix** (2 líneas):
1. `org-packs-sheet.tsx:180`: `packId: entitlement.id` → `packId: pack.id` (`pack` ya está en scope en `OrgPackRow`).
2. `org-packs-sheet.test.tsx:215`: `packId: ENTITLEMENT_ADJUNTOS.id` → `packId: PACK_CONTABILIDAD_ADJUNTOS.id` (y que sean ids distintos en el fixture, ya lo son).

**Reproducción manual**: como SA, habilitar un pack a una org, luego "Revocar" → toast de éxito
pero la fila sigue "Habilitada" tras el refetch. Confirmado vía análisis de código + e2e backend
de referencia (el shakedown del riel ya prueba que el backend filtra por `pack.id`).

---

## WARNING

### W-01 — Sin test del escenario "switch revierte en error" (REQ-4, spec.md:169-174)

No hay test que cubra explícitamente que el switch del Owner revierte a su estado real cuando
la mutation falla. La estrategia (componente controlado `checked={entitlement.activo}` +
invalidación, no optimistic — `complemento-row.tsx:33`, `use-activar-pack.ts`) lo garantiza
estructuralmente: en error no se toca el cache, el switch sigue reflejando el valor real. Es
correcto por diseño, pero el escenario del spec no tiene cobertura directa. Gap de cobertura,
no bug.

### W-02 — Desviación de paths del design (no afecta funcionalidad)

El design ubicaba `nav-items.ts`/`nav-list.tsx` en `frontend/src/navigation/` (§2.6) y
`require-system-role.tsx` clonando `require-permission.tsx`. La realidad del repo es
`frontend/src/components/`. apply usó los paths reales (correcto). El design verificó rutas
inexistentes en esos puntos; no rompe nada, pero el design quedó desincronizado con el árbol real.

---

## SUGGESTION

### S-01 — Documentar la env MINIO_* en el comando e2e de packs-catalogo

El gotcha de RT-01 (dump + e2e fallan sin las 5 env MINIO_*) es real y mordió en esta misma
verificación. Vale la pena un comentario en el header de `packs-catalogo.e2e-spec.ts` o en
tasks.md con el comando completo, para que nadie lo corra sin las env y crea que el código está roto.

---

## Cobertura spec → código (5 REQ / 20 escenarios)

| REQ / escenario | Cubierto | Dónde |
|---|---|---|
| REQ-1 SA obtiene catálogo | ✅ | `platform-admin.controller.ts:70` `@ApiOkResponse({type:[PackResponseDto]})`; e2e `packs-catalogo.e2e-spec.ts:97` |
| REQ-1 no-SA → 403 | ✅ | e2e `:128`; guards heredados de clase (`SuperAdminGuard`) |
| REQ-1 sin JWT → 401 | ✅ (extra) | e2e `:136` |
| REQ-1 respuesta tipada OpenAPI | ✅ | contract-drift sin diff; aliases `api.ts:847-863` |
| REQ-2 SA ve habilitados/disponibles | ✅ | `org-packs-sheet.tsx`; test `:136` |
| REQ-2 habilita envía `clave` | ✅ | `org-packs-sheet.tsx:192`; test `:190` assertea `{orgId, clave}` |
| REQ-2 **revoca** | ❌ **C-01** | `org-packs-sheet.tsx:180` envía id equivocado |
| REQ-2 filtro vertical (no muestra GRANJA) | ✅ | `org-packs-sheet.tsx:44-53`; test org GRANJA |
| REQ-2 backend rechaza vertical ajeno 400 | ✅ (backend existente) | `pack.service.ts:94-101` |
| REQ-2 estado vacío (org sin packs) | ✅ | `org-packs-sheet.tsx:96` |
| REQ-3 Owner ve complementos | ✅ | `complementos-page.tsx`; test `:83` |
| REQ-3 empty state copy exacto | ✅ | `complementos-page.tsx:41`; test `:68,:77` |
| REQ-3 sin rol no accede (ruta) | ✅ | `RequireSystemRole`; test `require-system-role.test.tsx:43` |
| REQ-3 nav item oculto sin rol | ✅ | `nav-list.test.tsx:462,472,482` |
| REQ-4 activa complemento | ✅ | `complemento-row.tsx:35`; test `:80` |
| REQ-4 desactiva complemento | ✅ | mismo switch; test `:69` |
| REQ-4 invalida `me-permissions` + `mis-packs-gestion` | ✅ | `use-activar-pack.ts:27-28` (ambas keys) |
| REQ-4 switch revierte en error | ⚠️ W-01 | estructural (controlado+invalidación), sin test directo |
| REQ-4 403 PACK_NO_HABILITADO | ✅ (backend existente) | invariante del riel |
| REQ-5 OWNER/ADMIN ve item | ✅ | `nav-list.test.tsx:442,452` |
| REQ-5 no-OWNER/ADMIN no ve item | ✅ | `nav-list.test.tsx:462,472,482` (incl. fail-closed undefined + []) |
| REQ-5 item sin pack/vertical pasa esos filtros | ✅ | `nav-items.ts:161-168` (sin pack/vertical); `nav-list.tsx:41-49` |
| REQ-5 fail-closed durante loading | ✅ | `nav-list.tsx:48` `?? false`; `RequireSystemRole` sin loading (rol sincrónico del JWT) |

---

## Reglas del proyecto

| Check | Resultado |
|---|---|
| `any` nuevo en producción | ✅ ninguno (solo `as unknown` en mocks de test) |
| `new Date()` en dominio/service backend | ✅ N/A (no se tocó dominio) |
| Zustand para server state | ✅ no — server state en TanStack Query; solo `user.roles` (JWT, excepción documentada §4) |
| Owner-facing dice "Complementos" | ✅ `complementos-page.tsx:16`, nav label, copy |
| SA puede decir "pack" (técnico) | ✅ `org-packs-sheet.tsx` "Packs de «...»" (aceptable) |
| Anti-31 / cross-tenant | ✅ catálogo org-less, enforcement en `SuperAdminGuard`; `mis-packs`/`activar` filtran por tenant del JWT (riel existente) |
| Anti-F-13 toast en hook, banner inline en query error | ✅ `use-activar-pack.ts` toast en hook; `complementos-page.tsx:31` banner |
| Anti-F-15 selector Zustand estable | ✅ `nav-list.tsx:40` `user?.roles` crudo, `?? false` afuera |
| Reglas de hooks en nav-list | ✅ `userRoles` leído UNA vez, sin hook por-item |

---

## Veredicto final: **RECHAZADO**

Un CRITICAL bloqueante (C-01): la revocación de packs desde la UI super-admin no funciona en
producción — envía el id del entitlement donde el backend espera el id del Pack del catálogo, y
el test codifica el mismo error (verde falso). El resto del change es sólido: 7 suites verdes,
contract-drift limpio, 19/20 escenarios cubiertos, fail-closed correcto en nav y ruta, naming
"Complementos" respetado. Tras el fix de 2 líneas (código + test) + re-correr vitest, pasa a
APROBADO.
