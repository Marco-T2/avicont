# Tasks: shell-por-vertical

<!--
Última edición: 2026-06-01
Owner: backend-lead
-->

> Change: `shell-por-vertical`
> Spec: `openspec/changes/shell-por-vertical/spec.md`
> Design: `openspec/changes/shell-por-vertical/design.md`
> TDD estricto: tests PRIMERO en todos los slices con lógica no-trivial.
> Commit scope: `feat(me): ...` backend · `feat(<módulo>-ui): ...` o `feat(frontend): ...` frontend.

---

## Slice 1 — Backend: `vertical` en `/me/permissions`

Scope de commit: `feat(me): ...`

- [ ] **T1.1 — TEST E2E primero** (TDD)
  - Archivo: `backend/test/me-permissions.e2e-spec.ts` (extender)
  - En el `describe('con tenant activo')`, agregar un `beforeEach` por escenario de vertical,
    o reutilizar el bloque existente con creación de org con flags específicos.
  - Nuevos casos dentro de un `describe('campo vertical')`:
    - org con `contabilidadEnabled: true, granjaEnabled: false` → `res.body.vertical === 'CONTABILIDAD'`
    - org con `granjaEnabled: true, contabilidadEnabled: false` → `res.body.vertical === 'GRANJA'`
    - org con ambos `false` (default) → `res.body.vertical === null`
    - regresión: `permissions`, `isOwner`, `activeTenantId` siguen presentes con el mismo shape
    - el 403 sin tenant (`ME_PERMISSIONS_SIN_TENANT`) NO produce campo `vertical`
  - Ejecutar: fallan (rojo) → avanzar a T1.2.
  - Comando: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" pnpm exec jest test/me-permissions.e2e-spec.ts --runInBand --forceExit`

- [ ] **T1.2 — Tipo `VerticalActivo` + extender DTO**
  - Archivo: `backend/src/me/dto/me-permissions-response.dto.ts`
  - Agregar `export type VerticalActivo = 'CONTABILIDAD' | 'GRANJA' | null;`
  - Agregar campo `readonly vertical: VerticalActivo;` a la interface `MePermissionsResponseDto`.

- [ ] **T1.3 — Derivar el vertical en el controller**
  - Archivo: `backend/src/me/me.controller.ts`
  - Extender la query de `prisma.membership.findUnique` para hacer `select` anidado de
    `organization: { select: { contabilidadEnabled: true, granjaEnabled: true } }`.
  - Agregar función local pura `derivarVertical(org)` con la lógica de los 3 casos
    (contabilidad → `'CONTABILIDAD'`, granja → `'GRANJA'`, ni uno → `null`).
    Comentario regulatorio: invariante `organizations_vertical_exclusivo_check` del schema.
  - Incluir `vertical: derivarVertical(membresia.organization)` en el objeto de retorno.
  - `backend/src/me/me.module.ts` — SIN cambios.

- [ ] **T1.4 — Verificar verde**
  - Correr los e2e del slice completo (T1.1) → todos verdes.
  - Typecheck: `pnpm exec tsc --noEmit -p tsconfig.json` desde `backend/`.

---

## Slice 2 — Frontend tipos: `vertical` en `MePermissionsResponse`

Scope de commit: `feat(frontend): add vertical to MePermissionsResponse type`

- [ ] **T2.1 — Extender tipo compartido**
  - Archivo: `frontend/src/types/api.ts`
  - Agregar `export type VerticalActivo = 'CONTABILIDAD' | 'GRANJA' | null;` (junto al
    bloque de la interface o cerca del tipo `ModuloOrganizacion` existente).
  - Agregar campo `vertical: VerticalActivo;` a `MePermissionsResponse` con JSDoc.
  - El fetcher `frontend/src/lib/me-permissions.ts` — SIN cambios (ya usa el tipo).

---

## Slice 3 — Frontend hook: `useVerticalActivo`

Scope de commit: `feat(frontend): add useVerticalActivo hook`

- [ ] **T3.1 — TEST del hook primero** (TDD)
  - Archivo: `frontend/src/lib/use-vertical.test.ts` (NUEVO)
  - Usar `renderHook` + `QueryClientProvider` con datos pre-poblados.
  - Casos:
    - cache con `vertical: 'GRANJA'` → devuelve `'GRANJA'`
    - cache con `vertical: 'CONTABILIDAD'` → devuelve `'CONTABILIDAD'`
    - cache con `vertical: null` → devuelve `null` (NO `undefined`)
    - query pending (sin data) → `vertical === undefined`, `isLoading === true`
    - cambio de `activeTenantId` → nueva queryKey → vertical `undefined` (re-fetch)
  - Verificar que el queryKey es EXACTAMENTE `['me-permissions', activeTenantId]`
    (mismo que `usePermissions`) para asegurar dedup de red — el test puede verificarlo
    inspeccionando el `queryKey` del query resultante o mockeando `useQuery` y
    assertando el key.
  - Ejecutar: falla (rojo) → avanzar a T3.2.

- [ ] **T3.2 — Implementar `useVerticalActivo`**
  - Archivo: `frontend/src/lib/use-vertical.ts` (NUEVO)
  - Hook hermano de `usePermissions`. Usa el MISMO `queryKey`, `queryFn` (`getMePermissions`),
    `staleTime` (5 min) y `gcTime` (10 min) y `enabled`.
  - Devuelve `{ vertical: VerticalActivo | undefined; isLoading: boolean }`.
  - `vertical === undefined` = indeterminado (cargando o sin data), NO asumir default.
  - Importar `VerticalActivo` desde `@/types/api`.

- [ ] **T3.3 — Verificar verde**
  - Correr `pnpm exec vitest run src/lib/use-vertical.test.ts` → verde.
  - Typecheck: `pnpm exec tsc -b` desde `frontend/` → sin errores.

---

## Slice 4 — Frontend nav: `NavItem.vertical` + filtrado en `NavList`

Scope de commit: `feat(frontend): add vertical gating to nav`

- [ ] **T4.1 — TEST del filtrado por vertical primero** (TDD, extender el existente)
  - Archivo: `frontend/src/components/nav-list.test.tsx` (extender)
  - Agregar helper `mockVertical(v: VerticalActivo | undefined)` que mockea
    `useVerticalActivo` de `@/lib/use-vertical` (patrón análogo a `mockPermissions`).
  - Nuevos describes:
    - `describe('NavList — filtrado por vertical')`:
      - `GRANJA`: oculta todos los ítems `contabilidad.*`, muestra los de `granja.*`
        para los que tenga permiso, y muestra los de administración (`organizacion.*`).
      - `CONTABILIDAD`: oculta los ítems `granja.*`, muestra los de `contabilidad.*`
        para los que tenga permiso.
      - `undefined` (cargando): oculta toda operación (contabilidad Y granja); Panel
        y administración con permiso siguen visibles.
      - `null`: oculta toda operación; administración con permiso sigue visible.
      - items `organizacion.*` (Miembros, Roles, Módulos activos) visibles en AMBOS
        verticales cuando hay permiso.
      - defensa en profundidad: `GRANJA` + permiso `contabilidad.eeff.read` por error →
        "Balance General" igual NO aparece.
    - Extender el `describe('NAV_ITEMS — cobertura de gating')`:
      - Nuevo test: todo ítem con `requiredPermission` de namespace `contabilidad.*`
        o `granja.*` (ítems de operación) DEBE declarar `vertical`.
      - Nuevo test: ningún ítem de namespace `organizacion.*` ni la ruta `/` DEBE
        declarar `vertical` (son cross-vertical).
  - Ejecutar: falla (rojo) → avanzar a T4.2 + T4.3.

- [ ] **T4.2 — Extender tipo `NavItem` con `vertical?`**
  - Archivo: `frontend/src/components/nav-items.ts`
  - Agregar campo `vertical?: 'CONTABILIDAD' | 'GRANJA';` a la interface `NavItem`
    con JSDoc explicando que ausente = administración cross-vertical.
  - Poblar `vertical` en `NAV_ITEMS`:
    - ítems `contabilidad.*` (plan-cuentas, comprobantes, libros, eeff, contactos,
      tipos-documento-fisico, documentos-fisicos, periodos-fiscales, configuracion) →
      `vertical: 'CONTABILIDAD'`.
    - ítems `granja.*` (Dashboard `/granja`, Mis Lotes `/granja/lotes`,
      Tipos de Registro `/granja/tipos-registro`) → `vertical: 'GRANJA'`.
    - Panel `/`, Miembros, Roles, Módulos activos, Configuración contable → SIN `vertical`.
  - Actualizar el comentario "Visibilidad: 100% RBAC… Sin flag granjaEnabled en store"
    en la sección Granja: ahora el gating es RBAC **+ vertical** (aditivo).

- [ ] **T4.3 — Filtrado AND en `nav-list.tsx`**
  - Archivo: `frontend/src/components/nav-list.tsx`
  - Importar `useVerticalActivo` de `@/lib/use-vertical`.
  - Cambiar el filtro a AND de dos predicados:
    1. Permiso (existente): `item.requiredPermission === undefined || has(item.requiredPermission)`
    2. Vertical (nuevo): `item.vertical === undefined || item.vertical === verticalActivo`
  - El fail-closed sale gratis: `undefined === 'CONTABILIDAD'` y `null === 'GRANJA'`
    son `false` → sin lógica especial.

- [ ] **T4.4 — Verificar verde**
  - Correr `pnpm exec vitest run src/components/nav-list.test.tsx` → verde.
  - Typecheck: `pnpm exec tsc -b` → sin errores.

---

## Slice 5 — Frontend estado sin módulo: `<SinModulo>`

Scope de commit: `feat(frontend): add SinModulo component for null vertical`

- [ ] **T5.1 — TEST de `<SinModulo>` primero** (TDD)
  - Archivo: `frontend/src/routes/sin-modulo.test.tsx` (NUEVO)
  - Mockear `useHasSystemRole` de `@/lib/use-permissions` (patrón §14.7).
  - Casos:
    - `useHasSystemRole(['OWNER', 'ADMIN']) === true` → texto "No hay un módulo activo"
      visible; botón/enlace con texto "Activá un módulo" visible; link apunta a
      `/settings/features`.
    - `useHasSystemRole(['OWNER', 'ADMIN']) === false` → texto "Tu organización no
      tiene un módulo activo." visible; NO hay botón ni enlace a `/settings/features`.
  - Usar `MemoryRouter` para el `Link` / `Navigate`.
  - Ejecutar: falla (rojo) → avanzar a T5.2.

- [ ] **T5.2 — Implementar `<SinModulo>`**
  - Archivo: `frontend/src/routes/sin-modulo.tsx` (NUEVO)
  - Componente liviano (no página, no shell completo). Usa variables del tema
    (sin colores hardcoded, §6 del frontend CLAUDE.md).
  - Admin (`useHasSystemRole(['OWNER','ADMIN'])` true): mensaje + `<Link to="/settings/features">` o `<Button asChild>`.
  - No-admin: solo el mensaje, sin botón ni link.
  - Importar `useHasSystemRole` desde `@/lib/use-permissions`.

- [ ] **T5.3 — Verificar verde**
  - Correr `pnpm exec vitest run src/routes/sin-modulo.test.tsx` → verde.

---

## Slice 6 — Frontend redirect: `IndexRedirect` + cablear router

Scope de commit: `feat(frontend): add IndexRedirect and wire router`

- [ ] **T6.1 — TEST de `IndexRedirect` primero** (TDD)
  - Archivo: `frontend/src/routes/index-redirect.test.tsx` (NUEVO)
  - Mockear `useVerticalActivo` de `@/lib/use-vertical`.
  - Casos:
    - `vertical === 'GRANJA'` → se navega a `/granja` (usar `MemoryRouter` con ruta
      `/granja` que renderiza un sentinel `<div>granja-sentinel</div>` para assertar).
    - `vertical === 'CONTABILIDAD'` → renderiza `DashboardPage` (mockear la import para
      simplificar si el componente tiene dependencias pesadas).
    - `vertical === undefined` (cargando) → muestra skeleton (assertar que existen
      elementos con rol presentation o aria; o que NO se navega y NO se renderiza
      `DashboardPage`); NO se dispara `<Navigate>`.
    - `vertical === null` → renderiza `<SinModulo>` (mockear `SinModulo` como
      `<div>sin-modulo-sentinel</div>`).
  - Ejecutar: falla (rojo) → avanzar a T6.2.

- [ ] **T6.2 — Implementar `IndexRedirect`**
  - Archivo: `frontend/src/routes/index-redirect.tsx` (NUEVO)
  - Lógica: ver design §4.1 (con la variante actualizada: `null → <SinModulo />`).
  - Importar `SinModulo` desde `./sin-modulo`.
  - Usar `<Navigate replace>` (Anti-F-09 del frontend CLAUDE.md).

- [ ] **T6.3 — Cablear en `router.tsx`**
  - Archivo: `frontend/src/routes/router.tsx`
  - Cambiar `{ path: '/', element: <DashboardPage /> }` a
    `{ path: '/', element: <IndexRedirect /> }`.
  - Agregar import de `IndexRedirect`.
  - El catch-all `path: '*' → <Navigate to="/" replace />` se mantiene sin cambio.

- [ ] **T6.4 — Verificar verde**
  - Correr `pnpm exec vitest run src/routes/index-redirect.test.tsx` → verde.
  - Typecheck: `pnpm exec tsc -b` → sin errores.

---

## Slice 7 — Frontend invalidación de cache al togglear módulo

Scope de commit: `feat(feature-flags-ui): invalidate me-permissions on toggle`

- [ ] **T7.1 — Agregar invalidación en `useSetFeatureFlag`**
  - Archivo: `frontend/src/features/feature-flags/hooks/use-feature-flags.ts`
  - En el `onSuccess` del mutation `useSetFeatureFlag`, además de invalidar
    `['feature-flags']`, también invalidar `['me-permissions']` con
    `qc.invalidateQueries({ queryKey: ['me-permissions'] })`.
  - Razón: cuando el admin activa un módulo desde `/settings/features`, el vertical
    cambia. Sin esta invalidación, `useVerticalActivo` no lo refleja hasta que expira
    el `staleTime` (5 min). Con la invalidación, el re-fetch ocurre inmediatamente y
    `/` redirige al dashboard correcto.
  - Para invalidar todas las queries `['me-permissions', *]` (cualquier tenant),
    usar `queryKey: ['me-permissions']` (sin el segundo elemento): esto invalida
    todos los entries que empiecen con esa key.
  - Para obtener `activeTenantId` en el hook (si se quiere invalidar solo el tenant
    activo): `useAuthStore((s) => s.user?.activeTenantId)`. Ambas estrategias son
    aceptables; la global es más simple y segura.

  > Nota: NO se escribe test nuevo para esto — el `onSuccess` ya está cubierto por
  > el test implícito de que el cache se invalida (patrón de la feature). Si el
  > equipo quiere cobertura explícita de la invalidación cross-feature, puede
  > agregarse un test unitario del hook usando `queryClient.invalidateQueries`
  > como spy, pero no es bloqueante para el merge.

---

## Orden sugerido de apply

```
Slice 1 (backend)
  → Slice 2 (tipos frontend — depende de que el backend esté definido)
  → Slice 3 (hook — depende del tipo)
  → Slice 4 (nav — depende del hook)
  → Slice 5 (SinModulo — independiente del nav, depende del tipo)
  → Slice 6 (redirect — depende del hook + SinModulo)
  → Slice 7 (invalidación — independiente, ajuste de comportamiento)
```

Los slices 5, 6 y 7 pueden implementarse en paralelo una vez listos los slices 2 y 3.

---

## Notas de implementación

- **Commits separados por slice** (regla §9.1 del CLAUDE.md raíz). Nunca mezclar backend + frontend en un commit.
- **Scopes**: `feat(me): ...` para T1; `feat(frontend): ...` para T2-T6 si son transversales; `feat(feature-flags-ui): ...` para T7.
- **NUNCA** Co-Authored-By en commits.
- **No buildear** entre cambios — no se corre `pnpm build`; solo typecheck y vitest.
- **Frontend typecheck**: `pnpm exec tsc -b` (NO `--noEmit`) desde `frontend/`.
- **Backend e2e**: siempre con `DATABASE_URL` inline + `--runInBand --forceExit`.
