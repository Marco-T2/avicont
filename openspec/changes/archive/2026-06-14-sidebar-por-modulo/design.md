# Diseño técnico — sidebar-por-modulo

> Fase SDD: **design**. Artifact store: hybrid (este archivo + engram `sdd/sidebar-por-modulo/design`).
> Stack: **frontend** (Vite/React) — UI pura, sin backend, sin migración. Fecha: 2026-06-14.
> Lee: `proposal.md`. Continúa el riel de `packs-riel` (#150-#157) y `packs-gestion-ui` (#189).

---

## Contexto técnico (file:line)

Estado actual del nav, leído del código real:

- **`frontend/src/components/nav-items.ts:27-58`** — interface `NavItem` con campos: `to`, `label`, `icon`, `disabled?`, `requiredPermission?`, `vertical?: 'CONTABILIDAD' | 'GRANJA'`, `pack?: string`, `requiredSystemRole?: SystemRole[]`. Es el tipo EXACTO; el gating vive todo acá, por ítem.
- **`frontend/src/components/nav-items.ts:63-197`** — `export const NAV_ITEMS: NavItem[]` — array plano de 20 ítems en este orden: Panel(`/`), Plan de cuentas, Comprobantes, Libro Diario, Libro Mayor, Balance General, Estado de Resultados, Contactos, Tipos de documento, Documentos físicos, Períodos fiscales, Datos de la empresa, Miembros, Roles, Módulos activos, Complementos, Configuración contable (disabled), Dashboard(granja), Mis Lotes, Tipos de Registro.
- **`frontend/src/components/nav-list.tsx:20-69`** — `NavList({ onItemClick?, collapsed? })`. Hooks reales: `usePermissions()` → `has` (`:34`), `useVerticalActivo()` → `vertical` (`:35`), `useMisPacks()` → `packsActivos` (`:36`), y `useAuthStore((s) => s.user?.roles)` → `userRoles` (`:40`, selector crudo Anti-F-15; el `?? false` va afuera, en el predicado). **NO usa `useHasSystemRole` por-ítem** (rompería reglas de hooks) — hace el check de rol inline (`:46-48`).
- **`frontend/src/components/nav-list.tsx:41-50`** — cascada de filtro AND fail-closed: `pasaPermiso ∧ pasaVertical ∧ pasaPack ∧ pasaSystemRole`. Esta es la lógica a PRESERVAR textualmente.
- **`frontend/src/components/nav-list.tsx:52-67`** — render: `<nav className="flex-1 space-y-1 p-2">` → `visibleItems.map` → `NavItemRenderer` envuelto en `<div key={item.to}>` (expandido) o `<Tooltip key={item.to}>` (collapsed, tooltip side right con `item.label`).
- **`frontend/src/components/nav-list.tsx:77-117`** — `NavItemRenderer` (item, onItemClick, collapsed) — **NO se toca**. Renderiza `<span aria-disabled>` si `disabled`, sino `<NavLink>`. En collapsed oculta el `<span>{label}</span>`.
- **`frontend/src/components/app-sidebar.tsx:43`** — `<NavList collapsed={collapsed} />`. `collapsed` viene de `useSidebarStore`. Ancho `w-16` (64px) cuando collapsed (`:28`).
- **`frontend/src/components/mobile-sidebar.tsx:38`** — `<NavList onItemClick={() => setOpen(false)} />` (sin collapsed → expandido siempre).

Hooks/tipos confirmados:
- `useMisPacks(): { packsActivos: string[] | undefined; isLoading }` (`use-packs.ts:20-38`).
- `useVerticalActivo(): { vertical: VerticalActivo | undefined; isLoading }` (`use-vertical.ts`). `VerticalActivo = 'CONTABILIDAD' | 'GRANJA' | null` (`types/api.ts:758`, vía `MePermissionsResponseDto['vertical']`).
- `SystemRole = 'OWNER' | 'ADMIN'` (`types/api.ts:172`).

---

## Importadores y retrocompat

**Grep exhaustivo** (`grep -rn "NAV_ITEMS\|NavItem\|nav-items" src`):

| Archivo | Usa |
|---|---|
| `nav-list.tsx` | `import { NAV_ITEMS, type NavItem }` (`:11`); `NAV_ITEMS.filter` (`:41`); `NavItem` como tipo de prop (`:72,77`) |
| `nav-list.test.tsx` | `import * as navItemsModule`, `import { NAV_ITEMS, type NavItem }` (`:13-14`); itera y muta `NAV_ITEMS` (sonda pack `:359/363`) |
| `platform-shell.tsx` | `PlatformNavItem` / `PLATFORM_NAV_ITEMS` (`:18,27`) — **constante PROPIA, sin relación con `NAV_ITEMS`** (comentario explícito en `:24` "NO el NAV_ITEMS del dashboard"). **No es importador.** |

**Conclusión — D-04**: solo `nav-list.tsx` y `nav-list.test.tsx` consumen `NAV_ITEMS`/`NavItem` real. Ningún consumidor externo. **NO hace falta export retrocompat para producción.** PERO el test (`nav-list.test.tsx`) hace `NAV_ITEMS.push/splice` (sonda pack, `:359/363/364`) y los 2 guards anti-drift iteran `NAV_ITEMS`. Para minimizar blast-radius del test y mantener un único punto de iteración, se exporta un derivado `NAV_ITEMS = NAV_SECTIONS.flatMap(...)` (ver D-05). El tipo `NavItem` se exporta sin cambios.

---

## Tipo de datos (NavSection / NavItem)

### `NavItem` — SIN cambios

El gating sigue siendo **por ítem**, no por sección. El tipo (`nav-items.ts:27-58`) queda byte-idéntico. Justificación: mover el gating a la sección rompería casos reales que ya existen en el mapeo:
- La sección **Configuración** es `transversal` pero contiene `Configuración contable` con `vertical: 'CONTABILIDAD'` (el granjero NO debe verlo). Si el vertical viviera en la sección, ese ítem heredaría "transversal" y se mostraría al granjero → regresión del test `nav-list.test.tsx:244-253`.
- Los ítems de Administración tienen cada uno su `requiredPermission` distinto (`organizacion.miembros.read`, `organizacion.roles.read`, etc.) y `Complementos` usa `requiredSystemRole` en vez de permiso. El gating es heterogéneo por ítem dentro de una misma sección.

### `NavSection` — tipo nuevo

```typescript
export interface NavSection {
  /** ID estable para la key de React (Anti-F-06). Ej: 'contabilidad', 'administracion'. */
  id: string;
  /** Header visible de la sección. Ej: 'Contabilidad', 'Configuración'. */
  label: string;
  /**
   * 'modulo'     → sección de un vertical/pack. Su header se OCULTA cuando es el
   *                único módulo visible (decisión 3 del proposal); visible con ≥2.
   * 'transversal' → Administración / Configuración. Header SIEMPRE visible si la
   *                sección tiene ≥1 ítem visible.
   */
  kind: 'modulo' | 'transversal';
  /** Ítems de la sección. El gating sigue siendo por ítem (cada uno declara su gate). */
  items: NavItem[];
}
```

**Decisión sobre el ítem suelto Panel — D-01**: `Panel` (`/`) NO va en ninguna sección (no lleva header, va arriba de todo). Se modela como **export aparte**:

```typescript
export const PANEL_ITEM: NavItem = { to: '/', label: 'Panel', icon: Home };
```

Rechazado: una "pseudo-sección sin label" — ensucia el tipo (`label` pasaría a opcional o `''`) y obliga a casos especiales en el render y en los guards. Un export `PANEL_ITEM` separado es explícito y el flatten retrocompat lo incluye (D-05).

### `NAV_SECTIONS` — nueva fuente de verdad

```typescript
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'contabilidad',
    label: 'Contabilidad',
    kind: 'modulo',
    items: [ /* Comprobantes, Libro Diario, Libro Mayor, Balance General,
                Estado de Resultados, Plan de cuentas, Contactos, Documentos físicos */ ],
  },
  {
    id: 'granja',
    label: 'Granja',
    kind: 'modulo',
    items: [ /* Dashboard, Mis Lotes, Tipos de Registro */ ],
  },
  {
    id: 'administracion',
    label: 'Administración',
    kind: 'transversal',
    items: [ /* Datos de la empresa, Miembros, Roles, Módulos activos, Complementos */ ],
  },
  {
    id: 'configuracion',
    label: 'Configuración',
    kind: 'transversal',
    items: [ /* Períodos fiscales, Tipos de documento, Configuración contable (disabled) */ ],
  },
];
```

Cada objeto-ítem dentro de `items` es **idéntico** al actual (mismo `to`, `label`, `icon`, `requiredPermission`, `vertical`, `pack?`, `requiredSystemRole?`). Solo cambian de contenedor y de **orden** (Decisión 2 del proposal: Contabilidad reordenada Comprobantes→…→Documentos físicos; Períodos/Tipos-documento mudados a Configuración). El comentario regulatorio/explicativo de `Configuración contable` (disabled + vertical) se preserva.

---

## Lógica de header adaptativo

Regla (Decisión 3 del proposal): el header de una sección `kind: 'modulo'` se RENDERIZA solo si hay **≥2 secciones `modulo` con al menos 1 ítem visible**. Las `transversal` muestran header siempre que tengan ≥1 ítem visible.

Cálculo, en `NavList`, con `useMemo` sobre el resultado del filtrado:

```typescript
// 1. Por sección, computar ítems visibles (mismo predicado de gating).
const seccionesVisibles = useMemo(
  () =>
    NAV_SECTIONS
      .map((s) => ({ section: s, visibleItems: s.items.filter(pasaFiltro) }))
      .filter((s) => s.visibleItems.length > 0), // descartar secciones sin ítems → sin header huérfano
  [/* deps: has, verticalActivo, packsActivos, userRoles */],
);

// 2. Contar módulos visibles para decidir el header adaptativo.
const modulosVisibles = useMemo(
  () => seccionesVisibles.filter((s) => s.section.kind === 'modulo').length,
  [seccionesVisibles],
);

// 3. ¿Mostrar el header de ESTA sección?
//    - transversal con ítems → SÍ (ya garantizado: solo llegan secciones con ítems).
//    - modulo → SÍ solo si hay ≥2 módulos visibles.
function debeMostrarHeader(section: NavSection): boolean {
  if (collapsed) return false;            // collapsed: nunca headers (riel de 64px)
  if (section.kind === 'transversal') return true;
  return modulosVisibles >= 2;            // modulo: solo con contraste
}
```

Notas:
- `pasaFiltro` es la cascada de `nav-list.tsx:42-49` extraída a un predicado (ver Refactor). Como depende de `has`/`verticalActivo`/`packsActivos`/`userRoles` (valores no estables entre renders por venir de hooks), el `useMemo` declara esas deps. **`has` viene de `usePermissions()`** — si su identidad no es estable, el `useMemo` recalcula igual cada render; aceptable (el cómputo es 20 items × O(1)). No introduce loops (Anti-F-15 ya respetado: `userRoles` es crudo del selector).
- Una sección sin ítems visibles **no entra a `seccionesVisibles`** → su header nunca se evalúa → cero headers huérfanos (riesgo del proposal cubierto por construcción).
- Hoy, con verticales exclusivos (CHECK `organizations_vertical_exclusivo_check`), `modulosVisibles` es siempre `0` o `1` → ningún header de módulo se muestra. El día que un pack agregue una 2da sección `modulo`, `modulosVisibles` llega a 2 y los headers aparecen automáticamente. La estructura YA está lista; solo cambia la presentación.

---

## Refactor de NavList

### Predicado de gating extraído (lógica intacta)

```typescript
// Cascada AND fail-closed — MISMA lógica que nav-list.tsx:42-49, movida a closure.
const pasaFiltro = (item: NavItem): boolean => {
  const pasaPermiso = item.requiredPermission === undefined || has(item.requiredPermission);
  const pasaVertical = item.vertical === undefined || item.vertical === verticalActivo;
  const pasaPack =
    item.pack === undefined || (packsActivos?.includes(item.pack) ?? false);
  const pasaSystemRole =
    item.requiredSystemRole === undefined ||
    (userRoles?.some((r) => item.requiredSystemRole!.includes(r as SystemRole)) ?? false);
  return pasaPermiso && pasaVertical && pasaPack && pasaSystemRole;
};
```

Idéntica a la actual, textualmente. El `PANEL_ITEM` también pasa por `pasaFiltro` (no declara ningún gate → pasa siempre), para uniformidad — aunque al no tener gates su visibilidad no cambia.

### Render (firma de `NavList` SIN cambios)

`NavListProps` (`onItemClick?`, `collapsed?`) NO cambia. `app-sidebar.tsx` y `mobile-sidebar.tsx` NO se tocan (requisito §7 frontend: un solo lugar). Nuevo render:

```tsx
return (
  <nav className="flex-1 space-y-1 p-2">
    {/* Ítem suelto Panel — siempre arriba, sin header. */}
    <NavItemSlot item={PANEL_ITEM} onItemClick={onItemClick} collapsed={collapsed} />

    {seccionesVisibles.map(({ section, visibleItems }, idx) => (
      <div key={section.id} className="space-y-1">
        {debeMostrarHeader(section) && (
          <h2 className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {section.label}
          </h2>
        )}
        {/* Collapsed: divider sutil entre bloques en vez de header (OQ-2). */}
        {collapsed && idx >= 0 && (
          <div className="mx-2 my-1 border-t border-sidebar-border" aria-hidden="true" />
        )}
        {visibleItems.map((item) => (
          <NavItemSlot key={item.to} item={item} onItemClick={onItemClick} collapsed={collapsed} />
        ))}
      </div>
    ))}
  </nav>
);
```

- **`NavItemSlot`** = extracción del bloque actual `nav-list.tsx:54-65` (la decisión div-vs-Tooltip según `collapsed`). Hoy está inline en el `.map`; se factoriza a un mini-componente/función para reusarlo en Panel y en los ítems de sección sin duplicar la lógica del Tooltip. `NavItemRenderer` (`:77-117`) **NO se toca**.
- **Keys estables (Anti-F-06)**: sección por `section.id`, ítem por `item.to`. Nunca index. (El `idx` del map solo se usa para lógica de divider, no como key.)
- **Header (§13.2 frontend)**: `<h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">` — variables del tema, sin color literal (Anti-F-10). Se usa `text-xs` (no `text-sm` del §13.2) porque es un header de NAV lateral compacto, no un header de sección de página; ajustable en el smoke visual de Marco.
- **Collapsed (Decisión OQ-2 → D-03)**: headers suprimidos (`debeMostrarHeader` retorna `false` si `collapsed`); en su lugar un `<div border-t border-sidebar-border>` sutil entre bloques para conservar la noción de grupo sin texto. El divider va con variable del tema. (Detalle exacto a confirmar por Marco en smoke; el proposal lo dejó como OQ-2 con recomendación de divider.)

---

## Plan de tests

Archivo: `frontend/src/components/nav-list.test.tsx`. Stack: Vitest + Testing Library (ya montado). Los mocks de hooks (`mockPermissions`, `mockVertical`, `mockPacks`, `setAuthRoles`) **no cambian** — siguen mockeando `usePermissions`/`useVerticalActivo`/`useMisPacks`/`auth-store`.

### Guards anti-drift — migración de la fuente (D-05)

Los 2 guards iteran hoy `NAV_ITEMS` directo (`:175,187,201` cobertura de gating; `:498` riel pack). Como `NAV_ITEMS` pasa a ser un **derivado exportado** `NAV_SECTIONS.flatMap((s) => s.items)`, los guards **siguen funcionando sin cambio de código** si seguimos exportando `NAV_ITEMS`. Para que el guard cubra TODO (incluido Panel, que ahora es `PANEL_ITEM` fuera de secciones), el flatten debe incluir Panel:

```typescript
// nav-items.ts — export derivado para retrocompat de tests y futura iteración total.
export const NAV_ITEMS: NavItem[] = [PANEL_ITEM, ...NAV_SECTIONS.flatMap((s) => s.items)];
```

Así los guards (`RUTAS_PUBLICAS = new Set(['/'])` ya excluye Panel) recorren exactamente el mismo universo que antes. **El test de sonda pack (`:359 NAV_ITEMS.push` / `:363 splice`) es el único punto frágil**: muta el array. Dos opciones:
- **(a)** mantener `NAV_ITEMS` como array mutable derivado (un `const` array normal es mutable con push/splice) — la sonda sigue funcionando porque opera sobre el array flatten, y `NavList` itera `NAV_SECTIONS` directamente, **NO** `NAV_ITEMS` → la sonda dejaría de afectar el render. **Esto rompe los tests de filtrado por pack (`:367-431`)** que esperan que el ítem-sonda aparezca/desaparezca en el render.
- **(b) elegida — D-06**: migrar la sonda pack a empujar/quitar sobre una **sección real de `NAV_SECTIONS`**. El test pushea el `probeItem` a `NAV_SECTIONS.find((s) => s.id === 'contabilidad')!.items` en `beforeEach` y lo quita en `afterEach`. Como `NavList` itera `NAV_SECTIONS`, la sonda vuelve a afectar el render igual que hoy. El guard anti-drift de "ningún pack en producción" (`:496-505`) sigue iterando `NAV_ITEMS` (derivado) y la sonda se quita antes de que corra (está en otro `describe`, cleanup por `afterEach`).

### Tests de visibilidad existentes — sin cambio de aserción

Los describes `filtrado por requiredPermission` (`:82-166`), `filtrado por vertical` (`:213-337`), `filtrado por pack` (`:339-432`), `filtrado por requiredSystemRole` (`:434-491`) consultan por **label/texto visible** (`getAllByText`/`queryByText`), agnósticos a la estructura de secciones → **pasan sin tocar** (salvo el ajuste D-06 de la sonda en el describe de pack). Confirmado: ninguno asume orden de DOM ni presencia de headers.

### Describe NUEVO — `NAV_SECTIONS — orden y secciones`

Mockear `isOwner: true` + vertical para tener todo visible. Casos:

1. **Mapeo ítem→sección**: para cada sección, sus `items` contienen los `to` esperados (assert sobre la estructura `NAV_SECTIONS`, no sobre el render). Ej: la sección `contabilidad` contiene `/comprobantes` y NO contiene `/periodos-fiscales`; la sección `configuracion` contiene `/periodos-fiscales` y `/tipos-documento-fisico`.
2. **Orden interno de Contabilidad** (Decisión 2): `NAV_SECTIONS.find(id==='contabilidad').items.map(i=>i.to)` === `['/comprobantes','/libros/diario','/libros/mayor','/eeff/balance','/eeff/resultados','/plan-cuentas','/contactos','/documentos-fisicos']`.
3. **Orden de secciones** (Decisión 4): `NAV_SECTIONS.map(s=>s.id)` === `['contabilidad','granja','administracion','configuracion']` → módulos primero, Administración, Configuración última.
4. **Header adaptativo — 1 módulo visible NO renderiza header de módulo**: vertical CONTABILIDAD (granja oculta por filtro) → `screen.queryByText('Contabilidad')` (rol heading) NOT in document; pero los ítems contables SÍ visibles. Assert también que `Administración` y `Configuración` (transversales) SÍ tienen header (`getByRole('heading', { name: 'Administración' })`).
5. **Header adaptativo — 2 módulos visibles SÍ renderiza headers**: sonda de una **2da sección `modulo`** (patrón análogo a la sonda de pack `:344-365`): push de `{ id: 'ventas', label: 'Ventas', kind: 'modulo', items: [un ítem sin vertical/pack visible] }` a `NAV_SECTIONS` en el test; vertical CONTABILIDAD + isOwner → ahora `modulosVisibles === 2` → `getByRole('heading', { name: 'Contabilidad' })` SÍ presente y `name: 'Ventas'` SÍ presente. Cleanup en `afterEach`.
6. **Sección sin ítems visibles no renderiza header**: vertical GRANJA + sin permisos contables → la sección `contabilidad` queda con 0 ítems → su header (aunque hubiera 2 módulos) no se evalúa; assert `queryByText('Contabilidad')` (heading) not in document.
7. **Collapsed suprime headers**: render `<NavList collapsed />` con 2 módulos (sonda) → ningún `role="heading"` con label de sección presente; los ítems siguen (vía aria-label/tooltip). Assert: `screen.queryByRole('heading')` para los labels de sección → null.
8. **Panel siempre arriba sin header**: `getAllByText('Panel')` presente; no hay heading 'Panel'.

Para distinguir header de ítem en aserciones: el header es `<h2>` (`getByRole('heading')`), el ítem es link/span con su label → usar `getByRole('heading', { name })` para headers y `getAllByText` para ítems.

---

## Riesgos técnicos

1. **`useMemo` deps con `has` inestable** → recalculo cada render. Mitigación: el cómputo es trivial (20 ítems); aceptable. NO se memoiza `pasaFiltro` con `useCallback` por costumbre (Anti-F-08 dice no memoizar sin necesidad).
2. **Romper la sonda pack del test** al iterar `NAV_SECTIONS` en vez de `NAV_ITEMS`. Mitigación: D-06 (la sonda pushea a `NAV_SECTIONS[contabilidad].items`).
3. **Header huérfano** (sección con título pero sin ítems). Mitigación: por construcción — `seccionesVisibles` ya filtró `visibleItems.length > 0`; test 6 lo cubre.
4. **Collapsed rompe layout 64px** con headers de texto. Mitigación: `debeMostrarHeader` retorna `false` si collapsed; test 7 lo verifica.
5. **Regresión visual mobile/dark** (Sheet mobile usa `<NavList>` sin collapsed → headers SÍ aparecen en mobile cuando hay ≥2 módulos; hoy con 1 módulo no aparecen). Mitigación: checklist §7 obligatorio (375/768/1440 + dark); headers con `text-muted-foreground`/`border-sidebar-border`.
6. **`NAV_ITEMS` derivado se evalúa al import** (`flatMap`) — orden de inicialización de módulo: `PANEL_ITEM` y `NAV_SECTIONS` deben declararse ANTES del `export const NAV_ITEMS`. Mitigación: orden de declaración en el archivo (consts arriba, derivado al final).

---

## Decisiones (numeradas)

- **D-01 — Panel como `PANEL_ITEM` export aparte**, no pseudo-sección. Mantiene `NavSection.label` siempre presente (no opcional) y evita casos especiales en render/guards.
- **D-02 — Gating por ÍTEM, `NavItem` sin cambios.** La sección NO hereda vertical/pack. Justificado por `Configuración contable` (transversal-section pero ítem con vertical) y por el gating heterogéneo de Administración. Una sección sin ítems visibles no renderiza header (filtrado en `seccionesVisibles`).
- **D-03 — Header adaptativo**: `modulosVisibles = count(secciones kind='modulo' con ≥1 ítem visible)`. Header de `modulo` solo si `modulosVisibles >= 2`; `transversal` siempre (con ítems); ninguno si `collapsed`. Cálculo con `useMemo` en `NavList`.
- **D-04 — Sin retrocompat para producción**: solo `nav-list.tsx`/`nav-list.test.tsx` usan `NAV_ITEMS`. `platform-shell.tsx` tiene su propia constante, no es importador.
- **D-05 — Exportar `NAV_ITEMS = [PANEL_ITEM, ...NAV_SECTIONS.flatMap(s=>s.items)]`** como derivado, SOLO para que los 2 guards anti-drift sigan iterando un universo único sin reescribir su lógica. `NavList` itera `NAV_SECTIONS` directo (no el derivado).
- **D-06 — Sonda pack del test migra a `NAV_SECTIONS`**: el `beforeEach`/`afterEach` del describe de pack pushea/quita el `probeItem` sobre `NAV_SECTIONS.find(id==='contabilidad').items` (no sobre `NAV_ITEMS`), porque `NavList` ahora itera secciones. Patrón de sonda reusado para el test de "2 módulos visibles" (push de una sección `modulo` completa).
- **D-07 — `NavItemSlot`** factoriza el bloque div-vs-Tooltip (`nav-list.tsx:54-65`) para reusarlo en Panel y en ítems de sección. `NavItemRenderer` (`:77-117`) intacto.
- **D-08 — Collapsed**: headers suprimidos, divider `border-t border-sidebar-border` sutil entre bloques (OQ-2, recomendación del proposal). Exacto a confirmar en smoke visual de Marco.

---

## Resumen para el orquestador

Diseño cerrado. **`NavItem` no cambia** (gating por ítem, D-02): justificado porque `Configuración contable` es un ítem `vertical:CONTABILIDAD` dentro de una sección transversal y el gating de Administración es heterogéneo. Nuevo tipo `NavSection { id, label, kind:'modulo'|'transversal', items }`; `NAV_SECTIONS` reemplaza el array plano; **Panel se modela como `PANEL_ITEM` export suelto** (D-01). Header adaptativo: se cuenta `modulosVisibles` (secciones `modulo` con ≥1 ítem tras filtrar) con `useMemo` en `NavList`; header de módulo solo si ≥2, transversales siempre, ninguno en collapsed (D-03). **Importadores: SOLO `nav-list.tsx` y `nav-list.test.tsx`** — `platform-shell.tsx` tiene constante propia, no cuenta (D-04). Se exporta `NAV_ITEMS` derivado (`flatMap`) solo para los 2 guards anti-drift (D-05). **Riesgo técnico principal**: la sonda pack del test muta `NAV_ITEMS`; como `NavList` ahora itera `NAV_SECTIONS`, hay que migrar la sonda a pushear sobre `NAV_SECTIONS[contabilidad].items` (D-06) o los tests de filtrado por pack rompen. La cascada de gating se mueve textual (cero reescritura). Firma de `NavList` y `app-sidebar`/`mobile-sidebar` intactas (un solo cambio sincroniza desktop+mobile). 8 casos nuevos de test + 1 ajuste a la sonda; guards anti-drift sin cambio de lógica.
