# frontend-sidebar-nav — Especificación

<!--
Última edición: 2026-07-25
Última revisión contra core: 2026-07-25
Owner: frontend-lead
-->

> Fecha: 2026-06-14
> Fase: spec (live)
> Proyecto: avicont
> Capability nueva: `frontend-sidebar-nav` (no existía spec previa)
> Origen: change `sidebar-por-modulo` (archivado, PR #192)
> Extendida por: change `conciliacion-bancaria` (PR #236) — REQ-SB-10
> Extendida por: `sidebar-subgrupos` (2026-07-25) — REQ-SB-11 a REQ-SB-14
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

- **`NavSection`**: tipo `{ id, label, kind, items, groups?, trailingItems? }` — ver REQ-SB-01.
- **`NavGroup`**: subgrupo colapsable DENTRO de una sección `{ id, label, icon, items }`. Segundo y **último** nivel de jerarquía: no hay grupos dentro de grupos.
- **`NAV_SECTIONS`**: constante que reemplaza `NAV_ITEMS` como única fuente de verdad del menú.
- **Ítem suelto (Panel)**: el ítem `/` (Panel) se modela fuera de las secciones. No lleva header.
- **Ítem suelto de sección**: ítem que vive directo en la sección, sin grupo y sin plegado. Arriba de los grupos (`items`) para lo de uso diario, abajo (`trailingItems`) para lo esporádico y de alto impacto.
- **Visibilidad derivada**: un `NavGroup` NO declara gating propio. Se muestra si y solo si al menos uno de sus ítems supera la cascada de REQ-SB-05. Un grupo sin ítems visibles desaparece entero, header incluido.
- **Flyout de riel**: en modo colapsado (`w-16`) el grupo se representa con un único botón-icono que abre un popover lateral con sus ítems.
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
  /** Ítems sueltos ARRIBA de los grupos, sin plegado. */
  items: NavItem[];
  /** Subgrupos colapsables, renderizados DESPUÉS de `items` (REQ-SB-11). */
  groups?: NavGroup[];
  /** Ítems sueltos ABAJO de los grupos, sin plegado. */
  trailingItems?: NavItem[];
}

export interface NavGroup {
  id: string;
  label: string;
  /** Icono del grupo en el riel de 64px (REQ-SB-13). Obligatorio. */
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}
```

La constante `NAV_SECTIONS: NavSection[]` DEBE reemplazar `NAV_ITEMS: NavItem[]` como
única fuente de verdad del menú principal. El tipo `NavItem` NO se DEBE modificar:
todos sus campos (`to`, `label`, `icon`, `disabled`, `requiredPermission`, `vertical`,
`pack`, `requiredSystemRole`) se preservan sin cambios.

El orden de render dentro de una sección DEBE ser: `items` → `groups` → `trailingItems`.
El export derivado `NAV_ITEMS` DEBE aplanar en ese MISMO orden, para que los guards
anti-drift que lo iteran vean el universo completo de ítems (REQ-SB-08).

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

- DADO el conjunto completo de ítems de `NAV_SECTIONS` (sueltos + de grupo + finales)
- CUANDO se verifica que cada ítem con `requiredPermission` o `requiredSystemRole`
  pertenece a su sección esperada
- ENTONCES no hay ítems "perdidos" fuera de las 4 secciones ni duplicados

#### Escenario: guard anti-drift — todo grupo declara id, label e icono únicos

- DADO el conjunto de grupos en `NAV_SECTIONS.flatMap(s => s.groups ?? [])`
- CUANDO se inspecciona cada grupo
- ENTONCES cada uno declara `label` no vacío, al menos un ítem, e `icon` definido
- Y no hay dos grupos con el mismo `id` (el `id` es clave de plegado persistido)

---

### REQ-SB-02: Mapeo de ítems a secciones y orden dentro de Contabilidad

Cada ítem DEBE pertenecer a su sección según la siguiente tabla (ítem por ítem,
en el orden en que deben aparecer dentro de la sección):

| Sección (`id`) | `kind` | Contenido en orden de render |
|---|---|---|
| `'contabilidad'` | `modulo` | **sueltos**: `/comprobantes` — **grupos**: `libros` (`/libros/diario` · `/libros/mayor`), `eeff` (`/eeff/balance` · `/eeff/balance-comprobacion` · `/eeff/hoja-trabajo` · `/eeff/resultados` · `/eeff/evolucion-patrimonio` · `/eeff/flujo-efectivo`), `bancos` (`/movimientos-bancarios` · `/conciliacion` · `/settings/cuentas-bancarias`), `maestros` (`/plan-cuentas` · `/contactos` · `/documentos-fisicos`) — **finales**: `/gestiones/cierre` |
| `'granja'` | `modulo` | `/granja` · `/granja/lotes` · `/granja/tipos-registro` |
| `'administracion'` | `transversal` | `/settings/empresa` · `/settings/members` · `/settings/roles` · `/settings/features` · `/settings/complementos` |
| `'configuracion'` | `transversal` | `/periodos-fiscales` · `/tipos-documento-fisico` · `/configuracion` |

El orden de secciones en `NAV_SECTIONS` DEBE ser:
secciones `modulo` (Contabilidad, Granja) → Administración → Configuración.
Configuración DEBE ser la última sección.

`/comprobantes` DEBE quedar como ítem suelto arriba de los grupos: es la pantalla de
uso diario y esconderla tras un click de plegado sería una regresión de usabilidad.
`/gestiones/cierre` DEBE quedar como ítem suelto final: es de uso anual y alto
impacto — visible sin plegar, pero sin competir por el lugar de arriba.

`/settings/cuentas-bancarias` NO DEBE vivir en la sección `'configuracion'`: pertenece
al grupo `bancos` junto al resto de la superficie de su pack (REQ-SB-12).

Los ítems `/periodos-fiscales` (Períodos fiscales) y `/tipos-documento-fisico`
(Tipos de documento) DEBEN estar en la sección `'configuracion'`, NO en `'contabilidad'`.
Cada uno conserva su `vertical: 'CONTABILIDAD'` y su `requiredPermission` sin cambio —
el gating es por ítem, no por sección.

El ítem `/configuracion` (Configuración contable) DEBE permanecer en `'configuracion'`
con `disabled: true` y `vertical: 'CONTABILIDAD'`.

#### Escenario: orden dentro de Contabilidad — Comprobantes primero, Cierre último

- DADO el vertical activo `'CONTABILIDAD'`, permisos completos (isOwner) y el pack
  `'contabilidad.conciliacion'` activo
- CUANDO se aplana la sección Contabilidad en orden de render
  (sueltos → grupos → finales)
- ENTONCES los ítems aparecen en este orden:
  Comprobantes, Libro Diario, Libro Mayor, Balance General, Balance de Comprobación,
  Hoja de Trabajo, Estado de Resultados, Evolución del Patrimonio, Estado de Flujo de
  Efectivo, Movimientos bancarios, Conciliación bancaria, Cuentas bancarias,
  Plan de cuentas, Contactos, Documentos físicos, Cierre del ejercicio

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

Los **subgrupos** en modo collapsed NO se aplanan a iconos sueltos: colapsan a un
único botón-icono con flyout (REQ-SB-13). Los ítems sueltos de sección (`items` y
`trailingItems`) sí se renderizan planos como iconos, igual que antes.

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

#### ~~Escenario: guard anti-drift — ningún ítem de producción declara pack~~ (OBSOLETO)

> **Superado por REQ-SB-10** (change `conciliacion-bancaria`, PR #236). Cuando se
> escribió este escenario el riel de packs estaba construido pero ningún `NavItem`
> real lo usaba. Hoy hay tres ítems de producción con `pack`, todos del pack
> `contabilidad.conciliacion`. El guard vigente es el de REQ-SB-12 (cohesión de
> pack), no la ausencia de packs. Se conserva tachado como registro histórico.

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

### REQ-SB-10: Primer ítem de navegación de pack de dominio (conciliación)

> Origen: change `conciliacion-bancaria`. El mecanismo genérico de gating por
> pack en la navegación YA EXISTE y ya está cubierto por REQ-SB-05 (cascada
> `pasaPermiso ∧ pasaVertical ∧ pasaPack ∧ pasaSystemRole`). Este requisito NO
> cambia el mecanismo — registra que `conciliacion-bancaria` es el primer
> `NavItem` **real** (no de prueba) que declara `pack`, con su regresión.

El `NavItem` de "Conciliación bancaria" DEBE declarar
`pack: 'contabilidad.conciliacion'` (además de `requiredPermission:
'contabilidad.conciliacion.read'` y `vertical: 'CONTABILIDAD'`), y DEBE
quedar sujeto exactamente a la misma cascada fail-closed descrita en
REQ-SB-05, sin código nuevo en `NavList` ni en el filtrado por pack.

#### Escenario: Pack `contabilidad.conciliacion` activo — ítem visible

- DADO un usuario con `contabilidad.conciliacion.read`, vertical
  `'CONTABILIDAD'` y el pack `'contabilidad.conciliacion'` activo
- CUANDO se renderiza `NavList`
- ENTONCES el ítem "Conciliación bancaria" está en el DOM

#### Escenario: Pack `contabilidad.conciliacion` no activo — ítem oculto

- DADO un usuario con `contabilidad.conciliacion.read` y vertical
  `'CONTABILIDAD'`, pero sin el pack `'contabilidad.conciliacion'` activo
  (org que lo desactivó tras el otorgamiento por defecto)
- CUANDO se renderiza `NavList`
- ENTONCES el ítem "Conciliación bancaria" NO está en el DOM

#### Escenario: Permiso ausente — ítem oculto aunque el pack esté activo

- DADO un usuario sin `contabilidad.conciliacion.read`, con el pack
  `'contabilidad.conciliacion'` activo
- CUANDO se renderiza `NavList`
- ENTONCES el ítem "Conciliación bancaria" NO está en el DOM (la cascada es
  AND — el pack activo no compensa un permiso faltante)

---

### REQ-SB-11: Subgrupos colapsables dentro de una sección

> Origen: `sidebar-subgrupos` (2026-07-25). Dispara la palanca "secciones
> colapsables" que `sidebar-por-modulo` había dejado **anotada como diferida**
> con disparador "org con ~12-15 ítems visibles / 2-3 packs". La sección
> Contabilidad llegó a 15 ítems planos (25 filas de sidebar) y el disparador se
> cumplió.

Una `NavSection` PUEDE declarar `groups: NavGroup[]`. Cada grupo DEBE renderizarse,
en modo expandido, como un header clickeable (`<button>` con `aria-expanded` y
`aria-controls`) que pliega y despliega sus ítems.

El grupo NO DEBE declarar campos de gating propios. Su visibilidad DEBE derivarse de
sus ítems: si ninguno supera la cascada de REQ-SB-05, el grupo entero —header
incluido— NO DEBE renderizarse. Un grupo con gate propio introduciría una segunda
verdad desincronizable respecto de la cascada por ítem.

El estado de plegado DEBE persistirse por `NavGroup.id` en `useSidebarStore`
(`openGroups: Record<string, boolean>`). Una clave AUSENTE NO significa "cerrado":
significa "sin preferencia del usuario", y en ese caso el grupo DEBE arrancar abierto
si contiene la ruta activa, cerrado si no. La preferencia guardada DEBE ganar sobre
ese default, incluido el caso "el usuario cerró a propósito el grupo donde está
parado" — por eso el valor es booleano y no un conjunto de abiertos.

Cuando un grupo está plegado pero contiene la ruta activa, su header DEBE recibir una
marca visual de activo: es la única pista de dónde está parado el usuario.

La coincidencia con la ruta activa DEBE ser por **prefijo** (`pathname === to ||
pathname.startsWith(to + '/')`), no por igualdad: en `/conciliacion/:id` el grupo
sigue siendo el activo aunque el `NavLink` (que usa `end`) ya no se pinte.

#### Escenario: plegado por defecto — header visible, ítems fuera del DOM

- DADO un usuario sin preferencia guardada, parado en una ruta ajena al grupo
- CUANDO se renderiza `NavList` expandido
- ENTONCES el header del grupo está en el DOM con `aria-expanded="false"`
- Y ninguno de sus ítems está en el DOM
- Y los ítems sueltos de la sección SÍ están visibles (no se pliegan nunca)

#### Escenario: el grupo de la ruta activa arranca abierto

- DADO un usuario sin preferencia guardada, parado en `/conciliacion`
- CUANDO se renderiza `NavList` expandido
- ENTONCES el grupo `bancos` tiene `aria-expanded="true"` y sus ítems están en el DOM
- Y los demás grupos siguen con `aria-expanded="false"`

#### Escenario: la preferencia guardada gana sobre el default de ruta activa

- DADO `openGroups = { bancos: false }` y el usuario parado en `/conciliacion`
- CUANDO se renderiza `NavList` expandido
- ENTONCES el grupo `bancos` tiene `aria-expanded="false"`

#### Escenario: grupo sin ítems visibles — desaparece entero

- DADO un usuario cuyo gating oculta TODOS los ítems de un grupo
- CUANDO se renderiza `NavList`
- ENTONCES no hay header de ese grupo en el DOM (no queda header huérfano)
- Y las demás secciones y grupos siguen renderizándose normalmente

---

### REQ-SB-12: Cohesión de pack — un pack, un solo grupo

Todos los ítems de navegación que declaran la misma clave de `pack` DEBEN vivir en un
único `NavGroup`, y ese grupo NO DEBE contener ítems de otro pack ni ítems sin pack.

Un pack es una unidad **comercial**: el Owner lo activa y desactiva desde
`/settings/complementos`, y su superficie de navegación debe aparecer y desaparecer
como un bloque único. Repartir los ítems de un pack por afinidad temática rompe el
modelo mental "activé esto → obtuve esto" y, al desactivarlo, hace desaparecer cosas
de dos menús distintos.

Concretamente, las tres pantallas de `contabilidad.conciliacion` (`/movimientos-bancarios`,
`/conciliacion`, `/settings/cuentas-bancarias`) DEBEN estar en el grupo `bancos` de la
sección `'contabilidad'`.

Este requisito NO agrega gating: cada ítem sigue declarando su propio `pack` y pasando
la cascada de REQ-SB-05 individualmente. Es una restricción de **ubicación**, verificada
por guard estático.

#### Escenario: guard anti-drift — todo ítem con pack de conciliación vive en `bancos`

- DADO el universo completo de ítems (`NAV_ITEMS` derivado)
- CUANDO se filtran los que declaran `pack: 'contabilidad.conciliacion'`
- ENTONCES todos pertenecen al grupo `bancos`

#### Escenario: guard anti-drift — todo ítem de `bancos` declara el pack

- DADO el grupo `bancos`
- CUANDO se inspecciona cada uno de sus ítems
- ENTONCES todos declaran `pack: 'contabilidad.conciliacion'`

#### Escenario: pack inactivo — el bloque entero desaparece

- DADO un usuario con permiso `contabilidad.conciliacion.read` y vertical
  `'CONTABILIDAD'`, pero sin el pack activo
- CUANDO se renderiza `NavList`
- ENTONCES el grupo `bancos` no está en el DOM, ni su header ni sus tres ítems
- Y el resto de la sección Contabilidad sigue visible

---

### REQ-SB-13: Modo riel — el grupo colapsa a un icono con flyout

En modo colapsado (`w-16`), cada `NavGroup` visible DEBE renderizarse como un único
botón-icono que abre un **flyout** (popover lateral, `side="right"`) con los ítems del
grupo y su label como encabezado. Los ítems dentro del flyout DEBEN mostrarse con su
label visible, no como iconos.

Cada `NavGroup` DEBE declarar `icon`. Es obligatorio porque en el riel es lo ÚNICO que
representa al grupo. En modo expandido ese icono NO se usa: el header es chevron +
label, que se lee como encabezado y no compite visualmente con los ítems.

El flyout DEBE abrirse por **click**, no por hover: accesible por teclado y sin
aperturas accidentales al mover el mouse por el riel. DEBE cerrarse al elegir un ítem.

El botón del grupo DEBE marcarse con `aria-current="true"` cuando contiene la ruta
activa: en el riel el ítem activo está escondido dentro del flyout, así que la pista
de ubicación solo puede darla el grupo.

El estado `openGroups` (plegado del modo expandido) NO DEBE consultarse en el riel:
son dos modelos de interacción distintos y mezclarlos produce saltos al alternar
Ctrl+B.

Los grupos NO DEBEN agregar divisores en modo riel: los divisores siguen siendo uno
por par de secciones visibles (REQ-SB-07).

#### Escenario: riel — un botón por grupo, ítems fuera del DOM

- DADO el sidebar colapsado con vertical `'CONTABILIDAD'` y permisos completos
- CUANDO se renderiza `NavList` con `collapsed={true}`
- ENTONCES hay exactamente un botón por grupo visible (Libros, Estados financieros,
  Bancos, Maestros)
- Y ninguno de los ítems de esos grupos está en el DOM
- Y los ítems sueltos (Panel, Comprobantes, Cierre del ejercicio) sí están, como iconos

#### Escenario: riel — el click abre el flyout con los ítems del grupo

- DADO el sidebar colapsado
- CUANDO se clickea el botón del grupo `bancos`
- ENTONCES aparecen "Movimientos bancarios", "Conciliación bancaria" y
  "Cuentas bancarias" con su label visible
- Y los ítems de los demás grupos siguen fuera del DOM

#### Escenario: riel — el grupo con la ruta activa queda marcado

- DADO el sidebar colapsado y el usuario parado en `/conciliacion`
- CUANDO se renderiza `NavList` con `collapsed={true}`
- ENTONCES el botón del grupo `bancos` declara `aria-current="true"`
- Y los botones de los demás grupos no declaran `aria-current`

#### Escenario: riel — el plegado del modo expandido no lo afecta

- DADO `openGroups = { bancos: true, libros: true }`
- CUANDO se renderiza `NavList` con `collapsed={true}`
- ENTONCES los ítems de esos grupos NO están en el DOM (mandan los flyouts, cerrados)

---

### REQ-SB-14: El nav DEBE scrollear por su cuenta

El `<nav>` de `NavList` DEBE declarar `min-h-0` junto con `overflow-y-auto`, y los
bloques fijos que lo rodean (header y footer del `<aside>` en desktop, `SheetHeader`
en el drawer mobile) DEBEN declarar `shrink-0`.

`min-h-0` es imprescindible y NO es opcional: un hijo flex no baja de su content
height por default, así que `overflow-y-auto` por sí solo nunca llega a activarse.

Sin esto, y dado que `dashboard-shell` monta la sidebar dentro de un contenedor
`flex h-screen` sin scroll de página, el contenido que excede el alto del viewport
queda FUERA de la pantalla sin barra de scroll: los ítems de abajo no quedan "más
abajo", quedan **inalcanzables**. El drawer mobile (`SheetContent`, `flex flex-col
h-full`) tiene la misma exposición.

#### Escenario: el nav declara su propio scroll

- DADO `NavList` renderizado en cualquier modo
- CUANDO se inspecciona el elemento `<nav>`
- ENTONCES declara `overflow-y-auto` y `min-h-0`

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
- **Sección propia vs subgrupo, para packs futuros**: `bancos` es subgrupo de
  Contabilidad porque `contabilidad.conciliacion` está namespaceado bajo contabilidad
  y es satélite del núcleo contable. Los packs de **área de negocio** (Ventas,
  Compras, RRHH) van como **sección `modulo` propia**, no como subgrupo: son dominios
  distintos, y al aparecer un segundo módulo visible REQ-SB-03 muestra los headers
  automáticamente. La jerarquía se queda en dos niveles (sección → grupo): no hay
  grupos anidados.
- **Palancas anti-agobio restantes**: `sidebar-por-modulo` anotó tres. "Secciones
  colapsables" quedó CONSUMIDA por REQ-SB-11. Siguen disponibles: (a) página índice
  `/reportes` que saque los 6 estados financieros del sidebar detrás de un solo ítem
  —bajaría el grupo `eeff` entero a una fila—; (b) command palette Cmd+K.
- **OQ-1 (abierta para apply)**: verificar si hay importadores de `NAV_ITEMS` además de
  `nav-list.tsx` y `nav-list.test.tsx`. Si los hay, decidir entre export derivado o migración.
  (REQ-SB-08 cubre las dos opciones.)
- **OQ-2 (CERRADA, 2026-06-14)**: en modo collapsed se usa divider sutil
  `border-sidebar-border` entre secciones (nunca antes de la primera). Confirmado por
  Marco en smoke. Los subgrupos NO agregan divisores (REQ-SB-13).
  en el smoke visual.
