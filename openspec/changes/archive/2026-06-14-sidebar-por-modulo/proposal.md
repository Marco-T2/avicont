# Propuesta de cambio — sidebar-por-modulo

> Fase SDD: **proposal**. Artifact store: hybrid (este archivo + engram `sdd/sidebar-por-modulo/proposal`).
> Stack afectado: **frontend** (Vite/React) — UI pura, sin backend, sin migración. Fecha: 2026-06-14.
> Continúa el riel de `packs-riel` (#150-#157) y `packs-gestion-ui` (#189): deja el nav listo para que cada pack/módulo entre como sección.

---

## Proposal: sidebar-por-modulo

### Why

El sidebar es hoy una **lista plana** de 20 ítems (`NAV_ITEMS`, `nav-items.ts:63-197`) sin agrupación visual: Panel, 10 ítems de Contabilidad, 5 de Administración, 1 disabled, 3 de Granja, todos al mismo nivel. Funciona con un solo vertical, pero el norte del producto es **multi-módulo** (Ventas/Compras/RRHH como packs futuros del eje 2, riel ya construido). Sumar packs a una lista plana produciría un menú indistinguible de 30+ entradas. Ahora es el momento: el riel de packs ya existe (`NavItem.pack?`), el gating por vertical/pack/systemRole ya está sólido, y reorganizar antes de tener el primer pack con nav propio evita reescribir el menú cuando ya tenga tráfico.

### What Changes

Cambio de modelo de datos del nav de array plano → **lista de secciones**, y render de headers de sección en `NavList`. Gating intacto.

- **`frontend/src/components/nav-items.ts:27-58`** — el tipo `NavItem` se conserva sin cambios (campos y metadata de gating idénticos). Se agrega un tipo nuevo `NavSection` = `{ id: string; label: string; items: NavItem[]; kind: 'modulo' | 'transversal' }` (o equivalente; ver Approach).
- **`frontend/src/components/nav-items.ts:63-197`** — `NAV_ITEMS: NavItem[]` (array plano) se reemplaza por `NAV_SECTIONS: NavSection[]` (única fuente de orden, ahora jerárquica). Cada ítem actual se mueve a su sección con el mapeo de §Decisiones cerradas. **El campo `Panel` queda fuera de secciones**, como ítem suelto arriba de todo (no lleva header).
- **`frontend/src/components/nav-list.tsx:41-50`** — el `.filter` plano pasa a un mapeo por sección: por cada sección, filtrar sus `items` con la MISMA cascada AND fail-closed (`pasaPermiso ∧ pasaVertical ∧ pasaPack ∧ pasaSystemRole`, líneas 42-49 intactas en su lógica); luego **descartar secciones que quedan sin ítems visibles** (no renderizar header huérfano).
- **`frontend/src/components/nav-list.tsx:52-68`** — el `<nav>` ahora renderiza, por sección visible: un header de sección (salvo el caso del módulo único, ver decisión #3) + sus ítems (mismo `NavItemRenderer`, sin tocar). El ítem suelto `Panel` se renderiza arriba sin header.
- **`frontend/src/components/app-sidebar.tsx:43`** y **`frontend/src/components/mobile-sidebar.tsx:38`** — NO cambian: siguen consumiendo `<NavList collapsed?>`. Un solo cambio en `NavList` sincroniza desktop + mobile (requisito §7 frontend).
- **Modo `collapsed` (desktop, `app-sidebar.tsx:28` w-16)** — cuando el sidebar está colapsado, los headers de sección **se ocultan** igual que los labels de ítem (un header de texto en un riel de 64px es ruido). Se mantiene separación visual mínima entre grupos (divider/espaciado) para no perder la noción de bloque.
- **`frontend/src/components/nav-list.test.tsx`** — los guards anti-drift de gating (`:171-211`, `:493-505`) se preservan adaptados a recorrer `NAV_SECTIONS.flatMap(s => s.items)`; se agrega un describe nuevo de **orden/secciones**.

### Decisiones cerradas

**Decisión 1 — Mapeo final de cada ítem a su sección** (ítem por ítem, con su `to`):

| Sección | `kind` | Ítems (en orden) |
|---|---|---|
| _(suelto, sin header)_ | — | `/` Panel |
| **Contabilidad** | `modulo` | `/comprobantes` Comprobantes · `/libros/diario` Libro Diario · `/libros/mayor` Libro Mayor · `/eeff/balance` Balance General · `/eeff/resultados` Estado de Resultados · `/plan-cuentas` Plan de cuentas · `/contactos` Contactos · `/documentos-fisicos` Documentos físicos |
| **Granja** | `modulo` | `/granja` Dashboard · `/granja/lotes` Mis Lotes · `/granja/tipos-registro` Tipos de Registro |
| **Administración** | `transversal` | `/settings/empresa` Datos de la empresa · `/settings/members` Miembros · `/settings/roles` Roles · `/settings/features` Módulos activos · `/settings/complementos` Complementos |
| **Configuración** | `transversal` | `/periodos-fiscales` Períodos fiscales · `/tipos-documento-fisico` Tipos de documento · `/configuracion` Configuración contable _(disabled)_ |

Notas del mapeo:
- **Períodos fiscales** y **Tipos de documento** se MUEVEN de "operación contable" a la sección **Configuración**: son setup/maestros que se tocan rara vez, no flujo diario. Esto refina el orden actual (`nav-items.ts:114-134`) donde estaban mezclados con la operación.
- `Configuración contable` (disabled, `nav-items.ts:171`) conserva `vertical: 'CONTABILIDAD'` y vive en la sección Configuración. La sección Configuración es transversal, pero ese ítem individual mantiene su gate de vertical (no aparece para el granjero) — el gating es por ítem, no por sección.
- Las secciones `modulo` (Contabilidad, Granja) son MUTUAMENTE EXCLUSIVAS en runtime por el filtro de vertical (org = Contabilidad O Granja, CHECK `organizations_vertical_exclusivo_check`): nunca se ven las dos a la vez. Los packs futuros (Ventas/Compras/RRHH) entran como secciones `modulo` adicionales gateadas por `pack?`.

**Decisión 2 — Orden interno de Contabilidad**: lo más usado arriba → Comprobantes, Libro Diario, Libro Mayor, Balance General, Estado de Resultados, Plan de cuentas, Contactos, Documentos físicos. (Períodos y Tipos de documento salen a Configuración — ver decisión 1.) Justificación: el contador entra todos los días a cargar comprobantes y consultar libros/EEFF; Plan de cuentas y Contactos son maestros que se consultan menos; Documentos físicos es el más periférico de la operación.

**Decisión 3 — Header "CONTABILIDAD" cuando es el único módulo visible** → **OCULTAR el header del módulo cuando hay exactamente una sección `kind: 'modulo'` visible.** Postura justificada: hoy, con verticales exclusivos, SIEMPRE hay un solo módulo visible (Contabilidad O Granja). Mostrar un header "CONTABILIDAD" sobre los ítems contables, cuando no hay otro módulo con qué contrastarlo, es redundancia visual pura (le pone título a lo único que hay). La **estructura de datos ya es por secciones** (lista para multi-módulo el día que un pack agregue una segunda sección `modulo`); el header del módulo solo se RENDERIZA cuando hay ≥2 secciones `modulo` visibles. Las secciones `transversal` (Administración, Configuración) **siempre muestran header** — ahí el contraste con el bloque de módulo justifica el título desde el día 1. Esta regla es puramente de presentación en `NavList`; no toca el gating ni la estructura de datos.

**Decisión 4 — Configuración arriba o abajo** → **ABAJO** (última sección). Justificación: Períodos/Tipos de documento/Configuración contable son setup de onboarding que se tocan una vez y rara vez se vuelven a abrir; en el uso diario estorban arriba. Orden final de secciones: módulo(s) → Administración → Configuración.

### Scope / Out of scope

**Dentro (IN):**
- Solo `frontend/` nav: `nav-items.ts` (modelo `NavSection[]`), `nav-list.tsx` (render de headers + filtrado por sección), `nav-list.test.tsx` (guards adaptados + test de secciones/orden).
- Modelo "por módulo": secciones Contabilidad, Granja, Administración (transversal), Configuración (transversal).
- Preservar el riel: el campo `NavItem.pack?` y el filtro de pack quedan intactos, listos para que un pack futuro agregue su sección `modulo`.

**Fuera (OUT — NO proponer aquí):**
- Implementar packs Ventas/Compras/Costos/POS/RRHH (solo se deja el riel listo; ninguna sección nueva de pack se crea).
- Cualquier cambio de backend, OpenAPI o migración Prisma.
- Cambios en el gating mismo (la cascada de filtros se preserva byte-equivalente en lógica; solo se mueve de "plano" a "por sección").
- Rediseño visual del sidebar más allá de agregar headers de sección (colores, iconos por sección, collapse por sección, etc.).
- Tocar `app-sidebar.tsx`/`mobile-sidebar.tsx` salvo que el header de sección exija ajuste mínimo de estilos (no se prevé).

### Approach (alto nivel, sin código)

1. **Refactor de `nav-items.ts`**: introducir `NavSection` (id, label, kind, items). `NAV_SECTIONS: NavSection[]` reemplaza `NAV_ITEMS`. `Panel` se modela como ítem suelto (export aparte, ej. `PANEL_ITEM`, o primera "pseudo-sección" sin label que `NavList` reconoce). El tipo `NavItem` no cambia: el gating sigue siendo por ítem. Naming: archivo kebab-case ya existente, constante `NAV_SECTIONS` SCREAMING_SNAKE_CASE, tipo `NavSection` PascalCase (§3 frontend).
2. **Refactor de `NavList`**: extraer la cascada de filtros actual (`nav-list.tsx:42-49`) a un predicado reutilizable y aplicarlo a `section.items`. Por sección, computar `visibleItems`; descartar secciones vacías. Render: ítem suelto Panel arriba → por cada sección visible, header condicional (decisión 3: header de `modulo` solo si hay ≥2 módulos visibles; `transversal` siempre) + ítems. En `collapsed`, suprimir todos los headers y dejar solo separación visual (divider con variables del tema, nunca color literal — Anti-F-10). Keys estables por `section.id` e `item.to` (Anti-F-06). Selectores zustand devuelven valor crudo (Anti-F-15) — ya cumplido, no se introduce default dentro del selector.
3. **Preservación del gating**: la lógica de `pasaPermiso/pasaVertical/pasaPack/pasaSystemRole` se mueve intacta. Defense-in-depth de UX se mantiene: nav OCULTA (no deshabilita), fail-closed durante loading. Los headers de sección solo aparecen si la sección tiene al menos un ítem que pasa el filtro → un usuario sin permisos contables no ve el header "Contabilidad" colgando vacío.
4. **Tests**: (a) adaptar los guards anti-drift de gating (`:171-211` cobertura de gating; `:493-505` riel sin pack) para iterar `NAV_SECTIONS.flatMap(s => s.items)` — la garantía no cambia, solo la fuente; (b) adaptar los tests de filtrado por permiso/vertical/pack/systemRole (siguen verificando visibilidad de labels, agnósticos a secciones — deberían pasar casi sin tocar); (c) describe NUEVO "NAV_SECTIONS — orden y secciones": valida el orden de secciones (módulo→Administración→Configuración), el mapeo ítem→sección, que Configuración va última, que Períodos/Tipos-documento están en Configuración, que un header de módulo NO se renderiza con un solo módulo visible y SÍ con dos (sonda de segunda sección modulo, patrón análogo a la sonda de pack en `:344-365`), que secciones sin ítems visibles no renderizan header.

### Risks & Mitigations

- **Riesgo: romper el gating al reorganizar.** → Mitigación: la cascada de filtros se mueve textualmente, no se reescribe; los guards anti-drift de gating se preservan; describe de regresión por vertical/permiso/pack/systemRole intacto.
- **Riesgo: header de sección huérfano (sección sin ítems visibles muestra título solo).** → Mitigación: regla explícita "descartar sección sin ítems visibles antes de render"; test dedicado.
- **Riesgo: tests existentes acoplados al array plano `NAV_ITEMS`.** → Mitigación: los tests de visibilidad consultan por label/texto (agnósticos a estructura); solo los 2 guards que iteran `NAV_ITEMS` directo necesitan cambiar la fuente a `NAV_SECTIONS.flatMap(...)`. Mantener un export derivado `NAV_ITEMS` (flatten de `NAV_SECTIONS`) reduciría el blast radius si otro consumidor lo importa — verificar en apply si hay otros importadores de `NAV_ITEMS`.
- **Riesgo: modo collapsed con headers rompe el layout de 64px.** → Mitigación: suprimir headers en collapsed (decisión explícita); cubierto en el checklist de viewports + un assert de que collapsed no renderiza texto de header.
- **Riesgo: regresión visual mobile/dark.** → Mitigación: checklist §7 obligatorio (375/768/1440 + dark); headers con variables del tema (`text-muted-foreground`, `text-sidebar-foreground`), patrón §13.2 de header de sección como referencia de estilo.

### Test Plan

- **Unit/render (Vitest + Testing Library, `nav-list.test.tsx`)**:
  - Guards anti-drift adaptados a `NAV_SECTIONS.flatMap(s => s.items)`: todo ítem no-público/no-disabled declara gate; `contabilidad.*`/`granja.*` declaran vertical; `organizacion.*` y `/` no declaran vertical; ningún ítem de producción declara `pack`.
  - Regresión de visibilidad (sin cambios de aserción): vertical CONTABILIDAD/GRANJA/undefined/null, filtrado por permiso, por pack (sonda), por systemRole (Complementos).
  - **Nuevos**: orden de secciones (módulo → Administración → Configuración); Configuración es la última; Períodos fiscales y Tipos de documento aparecen bajo Configuración; header de módulo OCULTO con un solo módulo visible y VISIBLE con dos módulos (sonda de segunda sección `modulo`); headers `transversal` (Administración/Configuración) siempre presentes cuando tienen ≥1 ítem visible; sección sin ítems visibles no renderiza su header.
- **Manual (checklist §7 frontend, obligatorio pre-merge)**: render correcto en **375px / 768px / 1440px**; **dark mode** sin colores literales; drawer mobile muestra las mismas secciones; sidebar **collapsed** (desktop w-16) oculta headers y mantiene separación; tap targets ≥44px intactos.

### Open Questions

- **OQ-1 (apply)**: ¿hay otros importadores de `NAV_ITEMS` además de `nav-list.tsx`/`nav-list.test.tsx`? Si los hay, decidir entre exponer un `NAV_ITEMS` derivado (flatten) por retrocompat o migrarlos. (No bloquea la propuesta; se resuelve con un grep en apply.)
- **OQ-2 (diseño, menor)**: en modo collapsed, ¿divider entre secciones o solo espaciado extra? Recomendación: divider sutil (`border-sidebar-border`) para conservar la noción de bloque sin texto. A confirmar por Marco en el smoke visual.
