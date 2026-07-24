# Delta for frontend-sidebar-nav

> Origen: change `conciliacion-bancaria`. El mecanismo genérico de gating por
> pack en la navegación YA EXISTE y ya está cubierto por REQ-SB-05 (cascada
> `pasaPermiso ∧ pasaVertical ∧ pasaPack ∧ pasaSystemRole`, con el escenario
> genérico "pack requerido ausente — ítem oculto"). Este delta NO cambia el
> mecanismo — registra que `conciliacion-bancaria` es el primer `NavItem`
> **real** (no de prueba) que declara `pack`, y agrega un escenario de
> regresión con la clave concreta.

## ADDED Requirements

### REQ-SB-10: Primer ítem de navegación de pack de dominio (conciliación)

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
