# Tasks — sidebar-por-modulo

> Fase SDD: **tasks**. Artifact store: hybrid (este archivo + engram `sdd/sidebar-por-modulo/tasks`).
> Change: `sidebar-por-modulo`. Fecha: 2026-06-14.
> Stack: **frontend** (Vite/React) — UI pura, sin backend, sin migración.
> **1 PR** — scope `frontend`, squash merge.
> Estimado: pequeño (3 archivos, ~4-6h de trabajo). TDD estricto: RED primero, GREEN después en cada tarea de comportamiento.
> Verde entre fases: `cd frontend && pnpm exec tsc -b && pnpm exec vitest run src/components/nav-list.test.tsx && pnpm run lint`

---

## Fase 1 — Modelo de datos: `NavSection`, `NAV_SECTIONS`, `PANEL_ITEM`

Archivo: `frontend/src/components/nav-items.ts`

- [x] **T-01** `[TEST RED]` Escribir tests de estructura en `nav-list.test.tsx` describe `"NAV_SECTIONS — estructura de datos"`:
  - Que `NAV_SECTIONS` es un array con exactamente 4 secciones con `id` `['contabilidad', 'granja', 'administracion', 'configuracion']` (REQ-SB-01, REQ-SB-02)
  - Que el orden de secciones es `['contabilidad', 'granja', 'administracion', 'configuracion']` (REQ-SB-02, Decisión 4)
  - Que cada sección tiene `id`, `label`, `kind`, `items` (REQ-SB-01)
  - Que `kind` de `contabilidad` y `granja` es `'modulo'` y el de `administracion` y `configuracion` es `'transversal'` (REQ-SB-01)
  - Que `PANEL_ITEM.to === '/'` (D-01)
  - Que `NAV_ITEMS` exportado es `[PANEL_ITEM, ...NAV_SECTIONS.flatMap(s => s.items)]` (D-05, REQ-SB-08)
  - Verificar que estos tests fallan (archivo no exporta `NavSection`/`NAV_SECTIONS`/`PANEL_ITEM` aún)

- [x] **T-02** `[TEST RED]` Escribir tests del orden interno de Contabilidad en el mismo describe:
  - Que `NAV_SECTIONS.find(s => s.id === 'contabilidad')!.items.map(i => i.to)` === `['/comprobantes', '/libros/diario', '/libros/mayor', '/eeff/balance', '/eeff/resultados', '/plan-cuentas', '/contactos', '/documentos-fisicos']` (REQ-SB-02, Decisión 2)

- [x] **T-03** `[TEST RED]` Escribir tests del mapeo ítem→sección en el mismo describe:
  - Sección `configuracion` contiene `/periodos-fiscales` y `/tipos-documento-fisico` (Decisión 1)
  - Sección `contabilidad` NO contiene `/periodos-fiscales` ni `/tipos-documento-fisico`
  - Sección `granja` contiene `/granja`, `/granja/lotes`, `/granja/tipos-registro`
  - Sección `administracion` contiene `/settings/empresa`, `/settings/members`, `/settings/roles`, `/settings/features`, `/settings/complementos`
  - Sección `configuracion` contiene `/configuracion` (disabled, vertical CONTABILIDAD)

- [x] **T-04** `[IMPL GREEN]` Introducir en `nav-items.ts` el tipo `NavSection` y el export `PANEL_ITEM` (D-01, D-02):
  - `export interface NavSection { id: string; label: string; kind: 'modulo' | 'transversal'; items: NavItem[]; }`
  - `export const PANEL_ITEM: NavItem = { ... }` (mismo objeto que hoy en línea ~63)

- [x] **T-05** `[IMPL GREEN]` Crear `export const NAV_SECTIONS: NavSection[]` con las 4 secciones en orden (REQ-SB-01, REQ-SB-02):
  - `contabilidad` (kind: `'modulo'`): Comprobantes, Libro Diario, Libro Mayor, Balance General, Estado de Resultados, Plan de cuentas, Contactos, Documentos físicos — en ese orden (Decisión 2)
  - `granja` (kind: `'modulo'`): Dashboard(`/granja`), Mis Lotes(`/granja/lotes`), Tipos de Registro(`/granja/tipos-registro`)
  - `administracion` (kind: `'transversal'`): Datos de la empresa, Miembros, Roles, Módulos activos, Complementos — con su `requiredPermission`/`requiredSystemRole` original
  - `configuracion` (kind: `'transversal'`): Períodos fiscales, Tipos de documento, Configuración contable(disabled, vertical: 'CONTABILIDAD') — preservar comentario del disabled
  - Cada objeto-ítem copia exacta del actual en `NAV_ITEMS` (mismo `to`, `label`, `icon`, `requiredPermission`, `vertical`, `pack?`, `requiredSystemRole?`)

- [x] **T-06** `[IMPL GREEN]` Agregar export derivado `NAV_ITEMS` al final del archivo (D-05):
  - `export const NAV_ITEMS: NavItem[] = [PANEL_ITEM, ...NAV_SECTIONS.flatMap((s) => s.items)];`
  - El orden de declaración en el archivo: `NavItem` (interface, ya existe) → `NavSection` → `PANEL_ITEM` → `NAV_SECTIONS` → `NAV_ITEMS` derivado
  - Preservar el tipo `NavItem` exportado sin cambios (REQ-SB-05, REQ-SB-08)

- [x] **T-07** `[VERDE]` Verificar: `pnpm exec tsc -b` sin errores + tests de estructura T-01..T-03 en verde + lint

---

## Fase 2 — Refactor de NavList: filtrado por sección y render

Archivo: `frontend/src/components/nav-list.tsx`

- [x] **T-08** `[TEST RED]` Escribir describe `"NAV_SECTIONS — header adaptativo"` en `nav-list.test.tsx` con los 8 casos nuevos (D-03, REQ-SB-03, REQ-SB-04, REQ-SB-07):
  - **Caso 1 — 1 módulo visible NO renderiza header de módulo**: vertical CONTABILIDAD, isOwner, hasAll permisos → `screen.queryByRole('heading', { name: 'Contabilidad' })` → `null`; ítems contables SÍ visibles; headers de `Administración` y `Configuración` SÍ presentes (`getByRole('heading', { name: ... })`) (REQ-SB-03)
  - **Caso 2 — 2 módulos visibles SÍ renderiza ambos headers**: push sonda `{ id: 'ventas', label: 'Ventas', kind: 'modulo', items: [un ítem sin vertical/pack] }` a `NAV_SECTIONS` en beforeEach, cleanup afterEach; vertical CONTABILIDAD + isOwner → `getByRole('heading', { name: 'Contabilidad' })` presente y `getByRole('heading', { name: 'Ventas' })` presente (REQ-SB-03, patrón análogo D-06)
  - **Caso 3 — sección sin ítems visibles no renderiza header**: vertical GRANJA + sin permisos contables → `queryByRole('heading', { name: 'Contabilidad' })` → `null` (REQ-SB-04)
  - **Caso 4 — collapsed suprime todos los headers**: render `<NavList collapsed />` con sonda de 2 módulos → `screen.queryByRole('heading')` para labels de sección → null para todos (REQ-SB-07)
  - **Caso 5 — Panel siempre visible sin header propio**: `getAllByText('Panel')` presente en DOM; no hay `getByRole('heading', { name: 'Panel' })`
  - **Caso 6 — headers transversales siempre presentes con ítems**: vertical CONTABILIDAD + isOwner → `Administración` y `Configuración` headers visibles
  - **Caso 7 — headers transversales ausentes sin ítems visibles**: sin ningún permiso de admin ni configuración → headers de `Administración` y `Configuración` ausentes (REQ-SB-04)
  - **Caso 8 — Configuración contable ausente en vertical GRANJA**: `queryByText('Configuración contable')` → `null` cuando vertical es GRANJA (gating por ítem dentro de sección transversal, D-02)
  - Verificar que fallan (NavList aún itera el array plano)

- [x] **T-09** `[TEST RED]` Adaptar la sonda pack del describe existente `"filtrado por pack"` (D-06, REQ-SB-05):
  - Cambiar `beforeEach`/`afterEach` de pack para que pushee/quite el `probeItem` sobre `NAV_SECTIONS.find((s) => s.id === 'contabilidad')!.items` en lugar de `NAV_ITEMS`
  - Verificar que los tests de filtrado por pack siguen en rojo (NavList aún itera `NAV_ITEMS`)

- [x] **T-10** `[IMPL GREEN]` Refactorizar `nav-list.tsx` — actualizar imports y extraer predicado `pasaFiltro` (REQ-SB-05):
  - Cambiar import: `import { NAV_SECTIONS, PANEL_ITEM, type NavItem, type NavSection }` (quitar `NAV_ITEMS`)
  - Agregar import de `SystemRole` si no está
  - Extraer la cascada `pasaFiltro` (lógica byte-idéntica a `:42-49` actual) como closure dentro del componente, que capture `has`/`verticalActivo`/`packsActivos`/`userRoles`

- [x] **T-11** `[IMPL GREEN]` Introducir `useMemo` de `seccionesVisibles` y `modulosVisibles` (D-03, REQ-SB-03, REQ-SB-04):
  - `seccionesVisibles = useMemo(() => NAV_SECTIONS.map(s => ({ section: s, visibleItems: s.items.filter(pasaFiltro) })).filter(s => s.visibleItems.length > 0), [has, verticalActivo, packsActivos, userRoles])`
  - `modulosVisibles = useMemo(() => seccionesVisibles.filter(s => s.section.kind === 'modulo').length, [seccionesVisibles])`
  - Función `debeMostrarHeader(section: NavSection): boolean`: si `collapsed` → `false`; si `kind === 'transversal'` → `true`; si `kind === 'modulo'` → `modulosVisibles >= 2`

- [x] **T-12** `[IMPL GREEN]` Factorizar `NavItemSlot` y reescribir el render de `NavList` (D-07, REQ-SB-06, REQ-SB-07):
  - Extraer bloque `div-vs-Tooltip` actual (`:54-65`) a función/mini-componente `NavItemSlot({ item, onItemClick, collapsed })` dentro del archivo — `NavItemRenderer` (`:77-117`) intacto
  - Nuevo `<nav>`: Panel arriba (via `NavItemSlot(PANEL_ITEM)`) → `seccionesVisibles.map` con `key={section.id}` → por sección: `debeMostrarHeader` → `<h2 className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">` → si `collapsed`: `<div className="mx-2 my-1 border-t border-sidebar-border" aria-hidden="true" />` → `visibleItems.map` con `key={item.to}` → `NavItemSlot`
  - Keys estables: sección por `section.id`, ítem por `item.to` — nunca por index (Anti-F-06)
  - Firma de `NavListProps` sin cambios: `onItemClick?`, `collapsed?` (REQ-SB-06)

- [x] **T-13** `[VERDE]` Verificar: tsc -b + todos los tests existentes de visibilidad (permiso/vertical/pack/systemRole) en verde + 8 nuevos casos del describe de headers + sonda pack adaptada + lint

---

## Fase 3 — Adaptar guards anti-drift

Archivo: `frontend/src/components/nav-list.test.tsx`

- [x] **T-14** `[TEST]` Verificar que los 2 guards anti-drift siguen en verde tras el cambio (REQ-SB-08):
  - Guard de gating (`:171-211`): itera `NAV_ITEMS` derivado (incluye todos los ítems + Panel). Si falla, actualizar la fuente a `[PANEL_ITEM, ...NAV_SECTIONS.flatMap(s => s.items)]` — misma garantía, misma lógica
  - Guard de riel pack (`:493-505`): itera `NAV_ITEMS` derivado. Verificar que el `probeItem` de la sonda pack se elimina antes de que corra este guard (cleanup correcto del `afterEach`)
  - Si algún guard falla por lógica rota (no por fuente), investigar antes de continuar — los guards son la red de seguridad del gating

- [x] **T-15** `[TEST]` Verificar que todos los describes de regresión de visibilidad pasaron sin tocar sus aserciones (REQ-SB-05):
  - `"filtrado por requiredPermission"` (`:82-166`) — sin cambios
  - `"filtrado por vertical"` (`:213-337`) — sin cambios de lógica (fuente ahora es `NAV_SECTIONS`, pero los tests buscan por label/texto, agnósticos a estructura)
  - `"filtrado por requiredSystemRole"` (`:434-491`) — sin cambios
  - Documentar en el PR si algún test necesitó ajuste mínimo y por qué

- [x] **T-16** `[VERDE]` Verde final completo: `cd frontend && pnpm exec tsc -b && pnpm exec vitest run src/components/nav-list.test.tsx && pnpm run lint`
  - Contar tests totales — esperado: tests previos + ~10 tests nuevos
  - Si hay errores de lint, corregir antes de continuar

---

## Fase 4 — Verde final y smoke manual

- [x] **T-17** `[VERDE GLOBAL]` Correr suite completa de vitest frontend: `cd frontend && pnpm exec vitest run`
  - Sin regresiones en ningún otro módulo
  - Si hay fallos, investigar antes de abrir el PR

- [ ] **T-18** `[SMOKE MANUAL]` — REQ-SB-09 (obligatorio pre-merge, Marco confirma):
  - **375px (mobile drawer)**: abrir sidebar mobile, verificar secciones Administración y Configuración con header, ítems contables sin header de módulo "Contabilidad" (1 módulo visible), Panel arriba sin header
  - **768px (tablet)**: sidebar expandido, misma verificación de headers
  - **1440px (desktop expandido)**: sidebar expandido, verificar que Administración y Configuración tienen header visible con estilo `text-xs font-semibold uppercase tracking-wide text-muted-foreground`, que los ítems tienen tap targets ≥44px
  - **1440px collapsed (w-16)**: sidebar colapsado, verificar que NO aparece ningún texto de header de sección, que aparecen dividers sutiles entre bloques (`border-sidebar-border`), que los tooltips de ítems funcionan con su label
  - **Dark mode**: en cualquier viewport, verificar que los headers de sección usan colores del tema (no hardcoded), que el divider collapsed es `border-sidebar-border` y no un color literal
  - **OQ-2 visual**: confirmar si el divider collapsed entre bloques es correcto o preferir solo spacing — registrar la decisión
  - Confirmar que `Períodos fiscales` y `Tipos de documento` aparecen bajo "Configuración" y NO entre los ítems contables diarios

- [ ] **T-19** `[COMMIT + PR]` Abrir 1 PR con scope `frontend`:
  - Título: `feat(frontend): sidebar por módulo con secciones Contabilidad / Administración / Configuración`
  - Descripción con secciones Qué / Por qué / Cómo probar (§9.4)
  - Squash merge — 1 commit en main

---

## Checklist de reglas cruzadas

- [x] Ningún import de `NAV_ITEMS` en `nav-list.tsx` (usa `NAV_SECTIONS` + `PANEL_ITEM` directo)
- [x] Export `NAV_ITEMS` derivado presente en `nav-items.ts` (para guard anti-drift y retrocompat de tests)
- [x] `NavItem` interface sin cambios (D-02, REQ-SB-08)
- [x] `app-sidebar.tsx` y `mobile-sidebar.tsx` intactos (REQ-SB-06)
- [x] Headers de sección con variables del tema, sin color literal (Anti-F-10)
- [x] Keys de sección: `section.id`; keys de ítem: `item.to` — nunca index (Anti-F-06)
- [x] Selector `useAuthStore` sigue devolviendo valor crudo (Anti-F-15 — sin `?? false` dentro del selector)
- [x] Sin `any` en código nuevo (§2.5 CLAUDE.md)

---

## Resumen

| | |
|---|---|
| Fases | 4 |
| Tareas totales | 19 (7 TEST RED/GREEN + 5 IMPL + 5 VERDE/SMOKE + 2 regresión/guard) |
| PRs | **1** |
| Archivos modificados | `nav-items.ts`, `nav-list.tsx`, `nav-list.test.tsx` |
| Archivos NO tocados | `app-sidebar.tsx`, `mobile-sidebar.tsx` |
| Backend / migración | Ninguno |
