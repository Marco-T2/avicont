# frontend-sidebar-nav — Especificación

<!--
Última edición: 2026-06-14
Última revisión contra core: 2026-06-14
Owner: frontend-lead
-->

> Fecha: 2026-06-14
> Fase: spec (live)
> Proyecto: avicont
> Capability nueva: `frontend-sidebar-nav` (no existía spec previa)
> Origen: change `sidebar-por-modulo` (en progreso)
> Stack: frontend (Vite + React 19 + TanStack Query)

---

## Propósito

El sidebar de navegación DEBE organizarse en **secciones por módulo** en lugar de
una lista plana de ítems. Esta capability cubre: el tipo `NavSection`, la constante
`NAV_SECTIONS` que reemplaza `NAV_ITEMS`, el renderizado de headers de sección con
su lógica de adaptación (ocultar header de módulo cuando hay un solo módulo visible),
y la preservación byte-equivalente del gating de permisos/vertical/pack/systemRole.

> **Dependencias**:
> - `frontend-permission-gating` (REQ-FG-04): tipo `NavItem` con `requiredPermission`,
>   `vertical`, `pack`, `requiredSystemRole` — se conserva sin cambios.
> - `shell-vertical` (REQ-SV-2): filtrado del nav por `verticalActivo` —
>   la cascada AND fail-closed se preserva intacta.
> - `packs-riel` (campo `NavItem.pack?`): el riel de pack queda operativo; ningún
>   pack nuevo se incorpora en este change.

---

## Glosario

- **`NavSection`**: tipo nuevo `{ id: string; label: string; kind: 'modulo' | 'transversal'; items: NavItem[] }`.
- **`NAV_SECTIONS`**: constante que reemplaza `NAV_ITEMS` como única fuente de verdad del menú.
- **Ítem suelto (Panel)**: el ítem `/` (Panel) se modela fuera de las secciones. No lleva header.
- **Sección `modulo`**: sección cuyo contenido pertenece a un vertical o pack (Contabilidad, Granja). Mutuamente exclusivas en runtime por el gating de vertical.
- **Sección `transversal`**: sección cross-vertical siempre visible (Administración, Configuración).
- **Header de módulo adaptativo**: el header de una sección `modulo` se oculta cuando hay exactamente una sección `modulo` con ítems visibles; aparece cuando hay ≥2.
- **Fail-closed**: si un predicado de gating no está resuelto (permisos/vertical cargando), el ítem NO se muestra. Sin excepciones.
- **Sección vacía**: sección en la que ningún ítem supera el filtro AND de gating. No se renderiza su header.

---

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

### REQ-SB-01: Tipo NavSection y constante NAV_SECTIONS

El frontend DEBE introducir el tipo `NavSection` en `frontend/src/components/nav-items.ts`
con la forma:

```ts
export interface NavSection {
  id: string;
  label: string;
  kind: 'modulo' | 'transversal';
  items: NavItem[];
}
```

La constante `NAV_SECTIONS: NavSection[]` DEBE reemplazar `NAV_ITEMS: NavItem[]` como
única fuente de verdad del menú principal. El tipo `NavItem` NO se DEBE modificar:
todos sus campos (`to`, `label`, `icon`, `disabled`, `requiredPermission`, `vertical`,
`pack`, `requiredSystemRole`) se preservan sin cambios.

El ítem Panel (`to: '/'`) DEBE exportarse como constante separada (`PANEL_ITEM`)
o equivalente, para que `NavList` lo renderice como ítem suelto sin header.

#### Escenario: estructura de NAV_SECTIONS cumple el mapeo definido

- DADO el archivo `nav-items.ts` actualizado
- CUANDO se inspecciona `NAV_SECTIONS`
- ENTONCES contiene exactamente 4 secciones con `id` distintos:
  `'contabilidad'`, `'granja'`, `'administracion'`, `'configuracion'`
- Y los ítems de cada sección son los especificados en REQ-SB-02
- Y el ítem Panel (`to: '/'`) está modelado como ítem suelto fuera de `NAV_SECTIONS`

#### Escenario: guard anti-drift — todo ítem no-público declara su sección

- DADO el conjunto completo de ítems en `NAV_SECTIONS.flatMap(s => s.items)`
- CUANDO se verifica que cada ítem con `requiredPermission` o `requiredSystemRole`
  pertenece a su sección esperada
- ENTONCES no hay ítems "perdidos" fuera de las 4 secciones ni duplicados

---

### REQ-SB-02: Mapeo de ítems a secciones y orden dentro de Contabilidad

Cada ítem DEBE pertenecer a su sección según la siguiente tabla (ítem por ítem,
en el orden en que deben aparecer dentro de la sección):

| Sección (`id`) | `kind` | Ítems en orden |
|---|---|---|
| `'contabilidad'` | `modulo` | `/comprobantes` · `/libros/diario` · `/libros/mayor` · `/eeff/balance` · `/eeff/resultados` · `/plan-cuentas` · `/contactos` · `/documentos-fisicos` |
| `'granja'` | `modulo` | `/granja` · `/granja/lotes` · `/granja/tipos-registro` |
| `'administracion'` | `transversal` | `/settings/empresa` · `/settings/members` · `/settings/roles` · `/settings/features` · `/settings/complementos` |
| `'configuracion'` | `transversal` | `/periodos-fiscales` · `/tipos-documento-fisico` · `/configuracion` |

El orden de secciones en `NAV_SECTIONS` DEBE ser:
secciones `modulo` (Contabilidad, Granja) → Administración → Configuración.
Configuración DEBE ser la última sección.

Los ítems `/periodos-fiscales` (Períodos fiscales) y `/tipos-documento-fisico`
(Tipos de documento) DEBEN estar en la sección `'configuracion'`, NO en `'contabilidad'`.
Cada uno conserva su `vertical: 'CONTABILIDAD'` y su `requiredPermission` sin cambio —
el gating es por ítem, no por sección.

El ítem `/configuracion` (Configuración contable) DEBE permanecer en `'configuracion'`
con `disabled: true` y `vertical: 'CONTABILIDAD'`.

#### Escenario: orden dentro de Contabilidad — Comprobantes primero

- DADO el vertical activo `'CONTABILIDAD'` y permisos completos (isOwner)
- CUANDO se renderiza `NavList` y se obtiene la lista de ítems visibles en la sección Contabilidad
- ENTONCES los ítems aparecen en este orden:
  Comprobantes, Libro Diario, Libro Mayor, Balance General, Estado de Resultados,
  Plan de cuentas, Contactos, Documentos físicos

#### Escenario: Períodos fiscales y Tipos de documento aparecen bajo Configuración

- DADO el vertical activo `'CONTABILIDAD'` y permisos completos
- CUANDO se renderiza `NavList`
- ENTONCES los ítems "Períodos fiscales" y "Tipos de documento" son visibles
- Y están agrupados bajo el header de sección "Configuración"
- Y NO aparecen bajo el header "Contabilidad"

#### Escenario: Configuración es la última sección del nav

- DADO cualquier usuario autenticado con vertical y permisos suficientes
- CUANDO se renderiza `NavList` y se leen los headers de sección en orden de aparición
- ENTONCES el header "Configuración" es el último de todos los headers de sección visibles

#### Escenario: Complementos aparece bajo Administración

- DADO un usuario con `SystemRole OWNER`
- CUANDO se renderiza `NavList`
- ENTONCES el ítem "Complementos" (`to: '/settings/complementos'`) es visible
- Y aparece agrupado bajo el header de sección "Administración"

---

### REQ-SB-03: Header de módulo adaptativo

El header de una sección con `kind: 'modulo'` DEBE renderizarse solo cuando hay
**≥2 secciones `modulo` con al menos un ítem visible** después de aplicar el
gating completo.

Cuando hay exactamente **1 sección `modulo` con ítems visibles**, el header de esa
sección NO DEBE renderizarse. Los ítems de la sección sí se muestran; solo el título
se omite.

Las secciones con `kind: 'transversal'` (Administración, Configuración) DEBEN mostrar
siempre su header, **independientemente** de cuántas secciones `modulo` haya.

Esta regla es estrictamente de presentación. No afecta el gating, la estructura de
datos ni el orden de ítems.

#### Escenario: vertical CONTABILIDAD — header de módulo NO se renderiza

- DADO un usuario de una organización con vertical `'CONTABILIDAD'` (único módulo visible)
- Y permisos suficientes para ver al menos un ítem de Contabilidad
- CUANDO se renderiza `NavList`
- ENTONCES el texto "Contabilidad" NO está presente en el DOM (no hay header de módulo)
- Y los ítems de la sección Contabilidad sí están en el DOM
- Y los headers "Administración" y "Configuración" sí están presentes en el DOM

#### Escenario: dos módulos visibles — ambos headers de módulo se renderizan

- DADO un `NavList` al que se le inyectan dos secciones `modulo` con ítems visibles
  (ejemplo: Contabilidad + una segunda sección `modulo` de prueba como `'granja'`)
- CUANDO se renderiza `NavList`
- ENTONCES ambos headers de módulo ("Contabilidad" y el de la segunda sección) están en el DOM

#### Escenario: headers transversales siempre visibles

- DADO cualquier usuario con vertical `'CONTABILIDAD'` o `'GRANJA'`
- Y al menos un ítem visible en cada sección transversal
- CUANDO se renderiza `NavList`
- ENTONCES los textos "Administración" y "Configuración" siempre están en el DOM
- independientemente de cuántos módulos haya

---

### REQ-SB-04: Sección sin ítems visibles — header suprimido

Cuando todos los ítems de una sección son filtrados por el gating (ninguno supera
la cascada AND), la sección completa DEBE suprimirse: ni header ni separadores.

Esta regla se aplica a secciones `modulo` y `transversal` por igual.

Un usuario sin ningún permiso `contabilidad.*` NO DEBE ver el header "Contabilidad"
(ni ningún ítem de esa sección).

Un usuario sin permisos `organizacion.*` y sin `requiredSystemRole` correspondiente
NO DEBE ver el header "Administración".

#### Escenario: sección Contabilidad sin ítems visibles — header no aparece

- DADO un usuario sin ningún permiso `contabilidad.*` y sin `isOwner`
- Y con vertical `'CONTABILIDAD'` (el gating de vertical pasa para esa sección)
- CUANDO se renderiza `NavList`
- ENTONCES el texto "Contabilidad" NO está en el DOM
- Y ningún ítem de la sección Contabilidad está en el DOM

#### Escenario: sección Configuración sin ítems visibles — header no aparece

- DADO un usuario que no tiene ningún permiso para ítems de la sección Configuración
  ni vertical `'CONTABILIDAD'` (los tres ítems tienen `vertical: 'CONTABILIDAD'`)
- CUANDO se renderiza `NavList`
- ENTONCES el texto "Configuración" NO está en el DOM

#### Escenario: sección Administración parcialmente visible — header sí aparece

- DADO un usuario con permiso para ver "Datos de la empresa" pero sin permisos
  para Miembros, Roles ni Módulos activos, y sin `requiredSystemRole` OWNER/ADMIN
- CUANDO se renderiza `NavList`
- ENTONCES el texto "Administración" SÍ aparece en el DOM
- Y solo el ítem "Datos de la empresa" está visible bajo ese header

---

### REQ-SB-05: Preservación del gating fail-closed por ítem

El filtrado de ítems dentro de cada sección DEBE aplicar exactamente la misma
cascada AND que la implementación plana actual:

```
visible = pasaPermiso(ítem) ∧ pasaVertical(ítem) ∧ pasaPack(ítem) ∧ pasaSystemRole(ítem)
```

Donde:
- `pasaPermiso`: `item.requiredPermission === undefined || has(item.requiredPermission)`
- `pasaVertical`: `item.vertical === undefined || item.vertical === verticalActivo`
- `pasaPack`: `item.pack === undefined || packsActivos.includes(item.pack)`
- `pasaSystemRole`: `item.requiredSystemRole === undefined || useHasSystemRole(item.requiredSystemRole)`

**Fail-closed**: mientras `isLoading` (permisos pendientes) O `verticalActivo === undefined`
(vertical pendiente), cualquier ítem con `requiredPermission` o `vertical` declarado
DEBE quedar oculto. Ítems sin ambos campos (`Panel`) siguen visibles.

El ítem con `disabled: true` DEBE seguir siendo visible independientemente de su
`requiredPermission` — el flag `disabled` es independiente del gating de acceso.

`NavList` DEBE llamar a `usePermissions()` y `useVerticalActivo()` **una sola vez**
cada uno, y pasar los resultados al predicado por ítem. NO DEBE llamar a esos hooks
una vez por ítem ni por sección.

#### Escenario: usuario sin permiso de lectura — ítem oculto en su sección

- DADO un usuario sin `contabilidad.libro-diario.read`
- CUANDO se renderiza `NavList` con vertical `'CONTABILIDAD'`
- ENTONCES el ítem "Libro Diario" NO está en el DOM
- Y los demás ítems de Contabilidad con sus permisos sí están visibles

#### Escenario: vertical GRANJA — ítems de Contabilidad ocultos

- DADO un usuario con vertical `'GRANJA'` y todos los permisos de contabilidad
- CUANDO se renderiza `NavList`
- ENTONCES ningún ítem con `vertical: 'CONTABILIDAD'` está en el DOM
- Y la sección Contabilidad no muestra ni ítems ni header

#### Escenario: pack requerido ausente — ítem oculto

- DADO un usuario con todos los permisos pero sin pack `'contabilidad.adjuntos'` activo
- Y un ítem de prueba con `pack: 'contabilidad.adjuntos'` en la sección Contabilidad
- CUANDO se renderiza `NavList`
- ENTONCES ese ítem NO está en el DOM

#### Escenario: fail-closed durante carga de permisos

- DADO que `isLoading` es `true` (query de `/me/permissions` en vuelo)
- CUANDO se renderiza `NavList`
- ENTONCES los ítems con `requiredPermission` NO están en el DOM
- Y el ítem Panel (sin `requiredPermission`) sí está en el DOM

#### Escenario: isOwner — todos los ítems visibles (excepto gating de vertical/pack)

- DADO un usuario con `isOwner: true` y vertical `'CONTABILIDAD'`
- CUANDO se renderiza `NavList`
- ENTONCES todos los ítems con `requiredPermission` y `vertical: 'CONTABILIDAD'` son visibles
- Y los ítems con `vertical: 'GRANJA'` siguen ocultos (el gating de vertical no lo sobreescribe `isOwner`)

#### Escenario: ítem disabled visible aunque no tenga permiso

- DADO el ítem `/configuracion` (Configuración contable, `disabled: true`) con `vertical: 'CONTABILIDAD'`
- Y un usuario sin ningún permiso de contabilidad (pero con vertical `'CONTABILIDAD'`)
- CUANDO se renderiza `NavList`
- ENTONCES el ítem "Configuración contable" SÍ está en el DOM (con apariencia deshabilitada)

---

### REQ-SB-06: Sincronización desktop / mobile — fuente única

`app-sidebar.tsx` (desktop) y `mobile-sidebar.tsx` (mobile drawer) DEBEN consumir
el mismo componente `NavList` sin duplicar la lógica de secciones. Un único cambio
en `NavList` o en `NAV_SECTIONS` DEBE reflejarse en ambas superficies sin edición adicional.

`app-sidebar.tsx` y `mobile-sidebar.tsx` NO DEBEN importar ni referenciar `NAV_SECTIONS`
directamente. Toda la lógica de secciones vive en `NavList`.

#### Escenario: nueva sección se refleja en desktop y mobile sin tocar sus archivos

- DADO que se agrega una nueva `NavSection` a `NAV_SECTIONS`
- CUANDO se renderiza `NavList` (en desktop vía `app-sidebar` y en mobile vía `mobile-sidebar`)
- ENTONCES la nueva sección aparece en ambas superficies
- Y ninguno de los dos archivos de shell fue modificado

#### Escenario: cambio de gating se aplica igual en desktop y mobile

- DADO que se modifica el predicado de filtrado en `NavList`
- CUANDO un usuario sin el permiso afectado abre el sidebar en mobile
- ENTONCES el ítem filtrado tampoco aparece en el drawer mobile

---

### REQ-SB-07: Modo collapsed en desktop — headers suprimidos

Cuando `app-sidebar` está en modo colapsado (`w-16`, solo iconos), los headers de
sección DEBEN suprimirse completamente: ni texto ni espacio de header visible.

En modo collapsed DEBE mantenerse **separación visual mínima entre grupos de ítems**
(divider sutil o espaciado extra) para conservar la noción de bloques, sin mostrar texto.

Los labels de los ítems ya se ocultan en modo collapsed (comportamiento existente);
los headers de sección siguen la misma regla: sin texto visible en `w-16`.

#### Escenario: sidebar colapsado no muestra texto de header

- DADO el sidebar desktop en modo colapsado (`collapsed: true`)
- CUANDO se renderiza `NavList` con `collapsed={true}`
- ENTONCES ningún texto de header de sección ("Contabilidad", "Administración", "Configuración")
  está presente en el DOM (o su contenedor tiene `aria-hidden` / clase `sr-only`)
- Y los iconos de los ítems sí son visibles

#### Escenario: sidebar expandido muestra headers (transversales siempre)

- DADO el sidebar desktop en modo expandido (`collapsed: false`)
- Y al menos un ítem visible por sección transversal
- CUANDO se renderiza `NavList`
- ENTONCES los textos "Administración" y "Configuración" están visibles en el DOM

---

### REQ-SB-08: No regresión — rutas y metadata de ítems intactas

Todos los campos `to`, `label`, `icon`, `disabled`, `requiredPermission`, `vertical`,
`pack` y `requiredSystemRole` de cada ítem deben ser byte-equivalentes entre la
implementación plana anterior (`NAV_ITEMS`) y la nueva implementación por secciones
(`NAV_SECTIONS.flatMap(s => s.items)`).

Ninguna ruta de navegación DEBE cambiar como consecuencia de este refactor.

Los guards anti-drift del archivo de tests DEBEN adaptarse para iterar
`NAV_SECTIONS.flatMap(s => s.items)` en lugar de `NAV_ITEMS`, preservando todas
las garantías documentadas en `frontend-permission-gating`.

#### Escenario: guard anti-drift — todo ítem no-público declara gate

- DADO el conjunto de ítems en `NAV_SECTIONS.flatMap(s => s.items)`
- CUANDO se ejecutan los guards anti-drift del test
- ENTONCES cada ítem que no es el Panel y no tiene `disabled: true`
  declara al menos uno de: `requiredPermission`, `requiredSystemRole`, o `vertical`

#### Escenario: guard anti-drift — ítems de contabilidad declaran vertical

- DADO el conjunto de ítems en `NAV_SECTIONS.flatMap(s => s.items)`
- CUANDO se filtran los ítems cuyo `requiredPermission` empieza con `'contabilidad.'`
- ENTONCES todos tienen `vertical: 'CONTABILIDAD'`

#### Escenario: guard anti-drift — ningún ítem de producción declara pack

- DADO el conjunto de ítems en `NAV_SECTIONS.flatMap(s => s.items)`
- CUANDO se verifica el campo `pack` en todos los ítems
- ENTONCES ningún ítem de producción tiene `pack` definido
  (el riel está listo pero ningún pack de nav existe aún)

#### Escenario: retrocompat — export NAV_ITEMS derivado si hay consumidores externos

- DADO que existen otros módulos del frontend que importan `NAV_ITEMS` de `nav-items.ts`
- CUANDO se aplica el refactor
- ENTONCES se exporta `NAV_ITEMS` como flatten derivado de `NAV_SECTIONS`
  (`NAV_SECTIONS.flatMap(s => s.items)` más el `PANEL_ITEM`) para no romper esos importadores
- O se migran todos los importadores a `NAV_SECTIONS` antes del merge

---

### REQ-SB-09: Responsivo — checklist de viewports y dark mode

El renderizado de los headers de sección DEBE usar exclusivamente **variables semánticas
del tema** (e.g. `text-muted-foreground`, `text-sidebar-foreground`). Ningún color
Tailwind literal está permitido (Anti-F-10, `frontend/CLAUDE.md §6`).

El estilo del header de sección DEBE seguir el patrón documentado en
`frontend/CLAUDE.md §13.2` (header de sección interna):

```tsx
<h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
  {label}
</h2>
```

adaptado al contexto del sidebar (ajustar padding/margin al espacio lateral del nav,
no al contenido de página).

Los tap targets de los ítems de nav (≥44×44 px) NO DEBEN alterarse por la presencia
de headers de sección.

#### Escenario: dark mode — headers sin colores literales

- DADO el sidebar en modo oscuro (clase `.dark` en `<html>`)
- CUANDO se renderiza `NavList` con secciones visibles
- ENTONCES los textos de header de sección tienen el color correcto del tema oscuro
- Y no se observan colores grises o blancos hardcodeados

#### Escenario: mobile 375 px — headers visibles y compactos

- DADO un viewport de 375 px (iPhone SE)
- Y el drawer mobile abierto
- CUANDO se renderiza `NavList` dentro del drawer
- ENTONCES los headers de sección "Administración" y "Configuración" son legibles
- Y los tap targets de los ítems son de al menos 44 px de alto

---

## Notas de la capability

- **Esta capability es UI pura, sin backend**: no hay cambios en API, migraciones, ni OpenAPI.
- **El gating no cambia en su lógica**: la reorganización es solo estructural. Los
  predicados `pasaPermiso`, `pasaVertical`, `pasaPack` y `pasaSystemRole` se mueven
  textualmente, no se reescriben.
- **Riel de packs listo**: el campo `NavItem.pack?` se preserva. Cuando un pack
  futuro necesite entrada en el nav, agrega su sección `modulo` a `NAV_SECTIONS` y
  la regla de header adaptativo (REQ-SB-03) la mostrará automáticamente al aparecer
  un segundo módulo visible.
- **OQ-1 (abierta para apply)**: verificar si hay importadores de `NAV_ITEMS` además de
  `nav-list.tsx` y `nav-list.test.tsx`. Si los hay, decidir entre export derivado o migración.
  (REQ-SB-08 cubre las dos opciones.)
- **OQ-2 (menor, confirmar en smoke)**: en modo collapsed, ¿divider entre secciones o
  solo espaciado? Recomendación: divider sutil `border-sidebar-border`. Marco confirma
  en el smoke visual.
