# Tasks — Frontend del Estado de Flujo de Efectivo (EFE)

> Change: `flujo-efectivo-frontend` · FRONTEND-ONLY · TDD red→green donde aplique · describe/it en español
> Molde: `frontend/src/features/evolucion-patrimonio/` (EEPN, PR #210)
> Comandos operativos: correr desde `frontend/`. Typecheck: `pnpm exec tsc -b`. Tests: `pnpm test` (vitest).

---

## Fase A — Tipos / alias

- [x] Abrir `frontend/src/types/api.ts` y localizar la línea del alias `EvolucionPatrimonioResponse`
      (aprox. línea 783, patrón `export type EvolucionPatrimonioResponse = Schemas['EvolucionPatrimonioResponseDto'];`).
- [x] Agregar, inmediatamente después, el alias:
      `export type EstadoFlujoEfectivoResponse = Schemas['EstadoFlujoEfectivoResponseDto'];`
- [x] Verificar que el tipo resuelve sin error (`pnpm exec tsc -b`): el DTO ya existe en
      `api.generated.ts` (PR #211), no hace falta regenerar nada.

---

## Fase B — Schema Zod del filtro (test)

- [x] (RED) Crear `frontend/src/features/flujo-efectivo/schemas/flujo-efectivo-filtro-schema.test.ts`
- [x] Crear `frontend/src/features/flujo-efectivo/schemas/flujo-efectivo-filtro-schema.ts`
- [x] (GREEN) `pnpm test` verde en los 4 escenarios del schema.

---

## Fase C — API + hook

- [x] Crear `frontend/src/features/flujo-efectivo/api/get-flujo-efectivo.ts`
- [x] Crear `frontend/src/features/flujo-efectivo/hooks/use-flujo-efectivo.ts`

---

## Fase D — Componente filtros

- [x] Crear `frontend/src/features/flujo-efectivo/components/flujo-efectivo-filtros.tsx`

---

## Fase E — Componente tabla (test)

- [x] (RED) Crear `frontend/src/features/flujo-efectivo/components/flujo-efectivo-tabla.test.tsx` (11 tests)
- [x] Crear `frontend/src/features/flujo-efectivo/lib/etiquetas-tipo-flujo.ts`
- [x] Crear `frontend/src/features/flujo-efectivo/components/flujo-efectivo-tabla.tsx`
- [x] (GREEN) `pnpm test` verde en los 11 escenarios del test de tabla.

---

## Fase F — Lib export Excel (test)

- [x] (RED) Crear `frontend/src/features/flujo-efectivo/lib/exportar-flujo-efectivo.test.ts` (8 tests)
- [x] Crear `frontend/src/features/flujo-efectivo/lib/exportar-flujo-efectivo.ts`
- [x] (GREEN) `pnpm test` verde en los 8 escenarios del test de export.

---

## Fase G — Botón exportar

- [x] Crear `frontend/src/features/flujo-efectivo/components/boton-exportar-flujo-efectivo.tsx`

---

## Fase H — Page container

- [x] Crear `frontend/src/features/flujo-efectivo/pages/flujo-efectivo-page.tsx`

---

## Fase I — Ruta + sidebar

- [x] Ruta `/eeff/flujo-efectivo` agregada en `frontend/src/routes/router.tsx`
- [x] Import de `FlujoEfectivoPage` en router.tsx
- [x] Ítem "Estado de Flujo de Efectivo" agregado en `frontend/src/components/nav-items.ts` (después de Evolución del Patrimonio)
- [x] `Droplet` importado de lucide-react en nav-items.ts
- [x] Test `nav-list.test.tsx` actualizado con el nuevo ítem en el orden correcto

---

## Fase J — Verificación final

- [x] `cd frontend && pnpm exec tsc -b` → 0 errores de tipo.
- [x] `cd frontend && pnpm run lint` → 0 warnings ni errores.
- [x] `cd frontend && pnpm test` (vitest) → 1391 tests, todos verdes (23 nuevos + 1 fix en nav-list.test.tsx).
- [x] Confirmar sin drift: `pnpm run gen:api-types` → api.generated.ts sin cambios. `git diff --stat` vacío.
- [ ] Smoke visual: pendiente (requiere dev en caliente con Docker)
