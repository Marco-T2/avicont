# sidebar-por-modulo — Delta spec: frontend-sidebar-nav

> Fase SDD: **spec**. Artifact store: hybrid (este archivo + engram `sdd/sidebar-por-modulo/spec`).
> Change: `sidebar-por-modulo`. Fecha: 2026-06-14.
> Capability afectada: `frontend-sidebar-nav` (nueva — no existía spec previa).

---

## Tipo de delta

`ADDED` — Capability nueva. La spec viva completa vive en:
`openspec/specs/frontend-sidebar-nav/spec.md`

Este archivo es el punto de entrada del change. Referencia los requisitos que este
change introduce y anota el estado de cada uno al completar la implementación.

---

## Requirements introducidos por este change

| ID | Título | Estado |
|---|---|---|
| REQ-SB-01 | Tipo `NavSection` y constante `NAV_SECTIONS` | Pendiente |
| REQ-SB-02 | Mapeo de ítems a secciones y orden dentro de Contabilidad | Pendiente |
| REQ-SB-03 | Header de módulo adaptativo | Pendiente |
| REQ-SB-04 | Sección sin ítems visibles — header suprimido | Pendiente |
| REQ-SB-05 | Preservación del gating fail-closed por ítem | Pendiente |
| REQ-SB-06 | Sincronización desktop / mobile — fuente única | Pendiente |
| REQ-SB-07 | Modo collapsed en desktop — headers suprimidos | Pendiente |
| REQ-SB-08 | No regresión — rutas y metadata de ítems intactas | Pendiente |
| REQ-SB-09 | Responsivo — checklist de viewports y dark mode | Pendiente |

---

## Capabilities afectadas (MODIFIED — no ADDED)

Las siguientes capabilities existentes **no se modifican en su contrato** pero
sus implementaciones leen de `NAV_SECTIONS` en lugar de `NAV_ITEMS`:

| Capability | Cambio |
|---|---|
| `frontend-permission-gating` (REQ-FG-04) | `NavList` ahora itera `NAV_SECTIONS`; el predicado de filtrado es idéntico. El tipo `NavItem` no cambia. Los guards anti-drift se adaptan a `NAV_SECTIONS.flatMap(s => s.items)`. |
| `shell-vertical` (REQ-SV-2) | El filtrado por `verticalActivo` se aplica al nivel de ítem dentro de la sección. No cambia la lógica; sí cambia la fuente de datos iterada. |
| `packs-riel` (campo `NavItem.pack?`) | El campo y su predicado se preservan intactos. No se agrega ningún ítem con `pack` en este change. |

---

## Archivos afectados (estimado — confirmar en apply)

| Archivo | Tipo de cambio |
|---|---|
| `frontend/src/components/nav-items.ts` | MODIFIED — introduce `NavSection`, `NAV_SECTIONS`, `PANEL_ITEM`; elimina `NAV_ITEMS` (o lo mantiene como export derivado) |
| `frontend/src/components/nav-list.tsx` | MODIFIED — render de headers + filtrado por sección |
| `frontend/src/components/nav-list.test.tsx` | MODIFIED — adapta guards anti-drift; agrega describe de secciones/orden |
| `frontend/src/components/app-sidebar.tsx` | SIN CAMBIO (salvo mínimo ajuste de estilos si collapsed exige) |
| `frontend/src/components/mobile-sidebar.tsx` | SIN CAMBIO |

---

## Preguntas abiertas (OQ)

- **OQ-1** (apply): ¿hay otros importadores de `NAV_ITEMS` en el frontend además de
  `nav-list.tsx` y `nav-list.test.tsx`? Resolver con grep; cubrir en REQ-SB-08.
- **OQ-2** (smoke, Marco): en collapsed, ¿divider `border-sidebar-border` o solo
  spacing extra entre secciones? Recomendación: divider sutil. Marco confirma visual.
