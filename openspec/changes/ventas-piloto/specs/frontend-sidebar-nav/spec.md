# Delta for frontend-sidebar-nav

> Origen: change `ventas-piloto`. El mecanismo de grupos YA EXISTE
> (REQ-SB-11: `NavGroup` sin gating propio, visibilidad derivada de la cascada
> por ítem de REQ-SB-05). Este delta NO cambia el mecanismo — agrega el grupo
> `comercial` a la sección Contabilidad. No toca REQ-SB-12 (cohesión de pack):
> Ventas es FREE sin pack (D-01), así que sus ítems NO declaran `pack` y el
> guard bidireccional de `bancos` no los ve. La tabla de REQ-SB-02 se extiende
> con la fila nueva al archivar (mismo tratamiento que REQ-SB-10 en su
> momento). Presión de R-3 (anti-agobio) registrada: palancas restantes son la
> página índice `/reportes` y Cmd+K.

## ADDED Requirements

### REQ-SB-15: Grupo `comercial` en la sección Contabilidad

La sección `'contabilidad'` DEBE sumar el grupo `comercial`
(`NavGroup.icon` obligatorio) con estos ítems, en este orden:

| Ítem | `to` | `requiredPermission` | `vertical` | `pack` |
|---|---|---|---|---|
| Ventas | `/ventas` | `contabilidad.ventas.read` | `'CONTABILIDAD'` | — |
| Cobros | `/cobros` | `contabilidad.cobros.read` | `'CONTABILIDAD'` | — |
| Ítems | `/items` | `contabilidad.items.read` | `'CONTABILIDAD'` | — |

El grupo DEBE ubicarse inmediatamente después del ítem suelto
`/comprobantes` y antes del grupo `libros`: la operación comercial es de uso
diario y va arriba de los reportes (*posición propuesta — el proposal no la
fija; ver pregunta abierta PA-2 en la spec de `ventas` de este change*).

El grupo NO declara gating propio (REQ-SB-11): su visibilidad se DERIVA de la
cascada fail-closed por ítem de REQ-SB-05, sin código nuevo en `NavList`.
Ningún ítem declara `pack` (D-01: FREE). Las rutas correspondientes en
`router.tsx` quedan bajo `RequirePermission` con los mismos permisos.

#### Escenario: usuario con permisos comerciales — grupo visible

- DADO un usuario con `contabilidad.ventas.read`, `contabilidad.cobros.read` y
  vertical `'CONTABILIDAD'`
- CUANDO se renderiza `NavList` expandido
- ENTONCES el header del grupo `comercial` está en el DOM entre "Comprobantes"
  y el grupo `libros`

#### Escenario: sin ningún permiso comercial — grupo entero ausente

- DADO un usuario sin `contabilidad.{ventas,cobros,items}.read`, con vertical
  `'CONTABILIDAD'` y el resto de permisos contables
- CUANDO se renderiza `NavList`
- ENTONCES no hay header ni ítems del grupo `comercial` en el DOM (REQ-SB-11:
  grupo sin ítems visibles desaparece entero)
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
