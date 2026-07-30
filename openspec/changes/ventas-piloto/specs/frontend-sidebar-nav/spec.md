# Delta for frontend-sidebar-nav

> Origen: change `ventas-piloto`. El mecanismo de **gating** YA EXISTE y NO se
> toca (REQ-SB-11: `NavGroup` sin gating propio, visibilidad derivada de la
> cascada por ítem de REQ-SB-05). Lo que sí cambia es el **orden de render**:
> este delta agrega `leadingGroups` a `NavSection` para poder poner un grupo
> ANTES de los ítems sueltos — ver REQ-SB-16. No toca REQ-SB-12 (cohesión de pack):
> Ventas es FREE sin pack (D-01), sus ítems NO declaran `pack`, así que el
> guard anti-drift bidireccional de `bancos` en `nav-list.test.tsx` (todo ítem
> con el pack vive en `bancos` ∧ todo ítem de `bancos` declara el pack) no los
> ve en ninguna de sus dos direcciones. La tabla de REQ-SB-02 se extiende con
> la fila nueva al archivar (mismo tratamiento que REQ-SB-10 en su momento).
> Presión de R-3 (anti-agobio) registrada: palancas restantes son la página
> índice `/reportes` y Cmd+K.

## ADDED Requirements

### REQ-SB-15: Grupo `comercial` — PRIMERO en la sección Contabilidad

La sección `'contabilidad'` DEBE sumar el grupo `comercial` con estos ítems,
en este orden:

| Ítem | `to` | `requiredPermission` | `vertical` | `pack` |
|---|---|---|---|---|
| Ventas | `/ventas` | `contabilidad.ventas.read` | `'CONTABILIDAD'` | — |
| Cobros | `/cobros` | `contabilidad.cobros.read` | `'CONTABILIDAD'` | — |
| Estado de cuenta | `/estado-cuenta` | `contabilidad.cobros.read` | `'CONTABILIDAD'` | — |
| Ítems | `/items` | `contabilidad.items.read` | `'CONTABILIDAD'` | — |

**El 4º ítem entró el 2026-07-30 por decisión de Marco.** Esta tabla se escribió
antes de que existieran las pantallas y declaraba tres; la task 6.7 agrega el
estado de cuenta por cliente, que sin entrada de nav quedaba **construido e
inalcanzable**. Se descartó la alternativa de llegar sólo desde el drawer de
contacto: "¿cuánto me debe X?" es una tarea propia del contador, no un desvío
de la ficha del cliente, y la pantalla ya trae su propio selector.

El orden sigue el flujo de trabajo —vendo → cobro → consulto la deuda— y deja
el maestro al final: Ítems es catálogo, se toca al dar de alta un producto y no
todos los días.

Que el estado de cuenta vaya bajo **`cobros.read`** y no bajo un permiso propio
es deliberado y lo fija REQ-CXC-10: quien sólo lee no registra ni aplica cobros,
pero SÍ consulta la deuda del cliente. **No se crea permiso nuevo.**

**Posición (PA-2, cerrada por Marco 2026-07-28 — decisión de producto
deliberada)**: el grupo va **PRIMERO en la sección, ANTES del ítem suelto
`/comprobantes`**, y para eso se declara en el campo `leadingGroups` que
introduce REQ-SB-16. El piloto apunta a que el uso diario sea comercial y el
asiento manual quede como excepción. Orden final de la sección:

```
▸ Comercial   (Ventas · Cobros · Estado de cuenta · Ítems)   ← primero
  Comprobantes                            ← sigue suelto; solo cambia de posición
▸ Libros
▸ Estados financieros
▸ Bancos
▸ Maestros
  Cierre del ejercicio                    ← suelto final, sin cambio
```

Esto cambia A PROPÓSITO la forma *suelto → grupos → suelto* que dejó
`sidebar-subgrupos`: la sección ahora ABRE con un grupo colapsable. No entra
por accidente — queda firmado acá. `/comprobantes` NO se mete dentro de
`comercial` ni se pliega jamás (la justificación de REQ-SB-02 "uso diario, no
se pliega" sigue vigente): solo cambia su posición relativa.

`NavGroup.icon` es OBLIGATORIO (REQ-SB-13, riel de 64px): `comercial` usa
**`ShoppingCart`**, que no colisiona con los iconos de grupo existentes
(`libros` = Library, `eeff` = BarChart3, `bancos` = Landmark,
`maestros` = FolderOpen).

El grupo NO declara gating propio (REQ-SB-11): su visibilidad se DERIVA de la
cascada fail-closed por ítem de REQ-SB-05, **sin una sola línea de gating
nueva** — un gate propio crearía dos verdades desincronizables. Un grupo
declarado en `leadingGroups` se filtra **exactamente igual** que uno de
`groups`: mismo predicado, mismo colapso a cero, misma persistencia de plegado.
Ningún ítem declara `pack` (D-01: FREE, núcleo del vertical CONTABILIDAD). Las
rutas correspondientes en `router.tsx` quedan bajo `RequirePermission` con los
mismos permisos.

> **Nota de alcance (corregida 2026-07-29).** Este requisito decía "sin código
> nuevo en `NavList`" y **era imposible**: `NavSection.items` está documentado
> como *"ítems sueltos que van ARRIBA de los grupos"* y `groups` como
> *"renderizados DESPUÉS de `items`"*, y `nav-list.tsx` los consume en ese
> orden. Poner un grupo primero exige tocar el render. Lo que NO se toca —y era
> la intención real de la frase— es el **gating**. Ver REQ-SB-16.

#### Escenario: el grupo abre la sección

- DADO un usuario con `contabilidad.ventas.read`, `contabilidad.cobros.read`,
  `contabilidad.asientos.read` y vertical `'CONTABILIDAD'`
- CUANDO se renderiza `NavList` expandido y se lee la sección Contabilidad en
  orden de aparición
- ENTONCES el header del grupo `comercial` es lo PRIMERO de la sección, antes
  del ítem "Comprobantes"

#### Escenario: `/comprobantes` sigue suelto y sin plegarse

- DADO cualquier usuario con `contabilidad.asientos.read` y vertical
  `'CONTABILIDAD'`, con el grupo `comercial` plegado
- CUANDO se renderiza `NavList` expandido
- ENTONCES el ítem "Comprobantes" está en el DOM, fuera de todo grupo —
  visible sin ningún click de plegado

#### Escenario: sin ningún permiso comercial — grupo entero ausente

- DADO un usuario sin `contabilidad.{ventas,cobros,items}.read`, con vertical
  `'CONTABILIDAD'` y el resto de permisos contables
- CUANDO se renderiza `NavList`
- ENTONCES no hay header ni ítems del grupo `comercial` en el DOM (REQ-SB-11:
  grupo sin ítems visibles desaparece entero) y "Comprobantes" vuelve a ser lo
  primero de la sección
- Y el resto de la sección Contabilidad se renderiza normal

#### Escenario: permiso parcial — solo el ítem gateado aparece

- DADO un usuario con `contabilidad.ventas.read` pero sin
  `contabilidad.cobros.read` ni `contabilidad.items.read`
- CUANDO se renderiza `NavList` con el grupo desplegado
- ENTONCES "Ventas" está en el DOM y "Cobros" e "Ítems" no

#### Escenario: vertical GRANJA — invisible

- DADO un usuario con todos los permisos comerciales y vertical `'GRANJA'`
- CUANDO se renderiza `NavList`
- ENTONCES ningún ítem del grupo `comercial` está en el DOM (la cascada es
  AND — REQ-SB-05)

### REQ-SB-16: `leadingGroups` — grupos ANTES de los ítems sueltos

`NavSection` DEBE sumar un campo **opcional**
`leadingGroups?: NavGroup[]`, y `NavList` DEBE renderizar una sección en este
orden:

```
leadingGroups  →  items  →  groups  →  trailingItems
```

Motivo: hasta hoy el contrato era `items → groups → trailingItems`, con `items`
documentado como *"ítems sueltos que van ARRIBA de los grupos"*. Ese orden no
admite lo que PA-2 decidió (grupo comercial primero, `/comprobantes` suelto
detrás). Las alternativas se descartaron con motivo:

| Alternativa | Por qué no |
|---|---|
| `/comprobantes` a `trailingItems` | cae al FINAL de la sección, después de Maestros y pegado a "Cierre del ejercicio" — es el acceso de uso diario y REQ-SB-02 lo protege explícitamente |
| `comercial` como primer `groups` | renderiza DESPUÉS de `/comprobantes`; abandona PA-2, que es decisión de producto firmada |

**El campo es aditivo y opcional**: las 4 secciones existentes no lo declaran y
su render queda **byte-idéntico**. Es la misma forma en que `groups` y
`trailingItems` entraron con `sidebar-subgrupos`.

**`leadingGroups` es un `NavGroup` completo**, sin semántica propia: mismo
gating derivado (REQ-SB-11), mismo `icon` obligatorio (REQ-SB-13, riel de
64px), misma persistencia de plegado en `useSidebarStore.openGroups`, misma
regla de abrir-si-contiene-la-ruta-activa por prefijo. **PROHIBIDO** darle
gating propio o un modelo de plegado distinto: sería un segundo mecanismo de
grupo que habría que mantener sincronizado con el primero.

En el riel colapsado de 64px, los `leadingGroups` aportan su botón-icono con
flyout **antes** que los de `groups`, respetando el mismo orden de la vista
expandida.

#### Escenario: el grupo de `leadingGroups` precede al ítem suelto

- DADO la sección Contabilidad con `comercial` en `leadingGroups` y
  `/comprobantes` en `items`
- CUANDO se renderiza `NavList` expandido
- ENTONCES el header de `comercial` aparece en el DOM **antes** que
  "Comprobantes", y "Comprobantes" antes que el header de "Libros"

#### Escenario: sección sin `leadingGroups` no cambia

- DADO las secciones Granja, Administración y Configuración, que no declaran
  `leadingGroups`
- CUANDO se renderizan
- ENTONCES su orden y su contenido son idénticos a los previos al change
  (`items → groups → trailingItems`)

#### Escenario: `leadingGroups` colapsa igual que `groups`

- DADO un usuario sin ninguno de `contabilidad.{ventas,cobros,items}.read`
- CUANDO se renderiza `NavList`
- ENTONCES el grupo `comercial` desaparece **entero, header incluido**, por la
  cascada de REQ-SB-11 — sin ningún predicado nuevo

#### Escenario: riel de 64px respeta el orden

- DADO la sidebar colapsada al riel y un usuario con todos los permisos
  contables
- CUANDO se leen los botones-icono de la sección Contabilidad en orden
- ENTONCES el icono `ShoppingCart` de `comercial` precede a los de `libros`,
  `eeff`, `bancos` y `maestros`
