# Delta for frontend-sidebar-nav

> Origen: change `ventas-piloto`. El mecanismo de grupos YA EXISTE
> (REQ-SB-11: `NavGroup` sin gating propio, visibilidad derivada de la cascada
> por ítem de REQ-SB-05). Este delta NO cambia el mecanismo — agrega el grupo
> `comercial` a la sección Contabilidad. No toca REQ-SB-12 (cohesión de pack):
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
| Ítems | `/items` | `contabilidad.items.read` | `'CONTABILIDAD'` | — |

**Posición (PA-2, cerrada por Marco 2026-07-28 — decisión de producto
deliberada)**: el grupo va **PRIMERO en la sección, ANTES del ítem suelto
`/comprobantes`**. El piloto apunta a que el uso diario sea comercial y el
asiento manual quede como excepción. Orden final de la sección:

```
▸ Comercial   (Ventas · Cobros · Ítems)   ← primero
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
cascada fail-closed por ítem de REQ-SB-05, sin código nuevo en `NavList` — un
gate propio crearía dos verdades desincronizables. Ningún ítem declara `pack`
(D-01: FREE, núcleo del vertical CONTABILIDAD). Las rutas correspondientes en
`router.tsx` quedan bajo `RequirePermission` con los mismos permisos.

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
