# Delta for packs-riel

> Origen: change `conciliacion-bancaria`. Extiende el riel con otorgamiento
> automático — necesario porque `contabilidad.conciliacion` (decisión 5,
> `architecture/conciliacion-bancaria` #952) es el primer pack **activo por
> defecto** al provisionar una organización nueva, sin intervención del
> super-admin. Las 4 invariantes transversales del riel (§Propósito de la
> spec viva) NO cambian.

## ADDED Requirements

### Requirement: Otorgamiento automático de packs por defecto en la provisión de organización

`Pack` DEBE exponer un campo `otorgadoPorDefecto: Boolean` (default `false`,
migración aditiva, cero impacto en packs existentes). Al provisionar una
organización nueva, el sistema DEBE otorgar Y activar automáticamente todo
pack del catálogo con `otorgadoPorDefecto=true` cuyo `verticalAplicable`
coincida con el vertical de la organización — en la MISMA transacción que
crea la organización, en **ambos** entry points de provisión
(`TenantsService.create` self-serve y
`PlatformAdminService.crearOrgConOwner` de super-admin).

El `habilitadoPorUserId` del entitlement auto-otorgado DEBE propagarse desde
el actor humano que dispara la provisión. `Organization` NO tiene columna
`ownerUserId` (el owner se materializa como `Membership` con
`systemRole=OWNER`, nunca como columna en `organizations`) — el valor sale
del `ownerUserId` recibido como parámetro de entrada por el caller de
provisión (`OrgsWriterPort`), no de una lectura post-commit de la org. La
columna `habilitadoPorUserId` sigue NO-NULA, sin necesidad de sentinel de
"actor sistema" ni de tocar su nullability.

Este otorgamiento automático NO reemplaza el flujo manual existente
(super-admin habilita, Owner activa) para packs con
`otorgadoPorDefecto=false` — ambos caminos coexisten.

**Invariante protegida — el camino manual sigue dando `activo=false` por
default.** El mecanismo de otorgamiento automático PUEDE extender la
firma del método de habilitación con un parámetro opcional (ej. `opts?: {
activo?: boolean; tx?: ... }`) para poder pedir `activo=true` en la misma
llamada. Ese parámetro adicional DEBE ser opcional y, cuando se omite,
DEBE preservar el comportamiento normativo ya firmado en la spec viva
(`openspec/specs/packs-riel/spec.md`, requisito "Entitlement por org con
activación embebida", escenario "Habilitar crea la fila con
`activo = false`"): el camino manual del super-admin (sin pasar `opts`)
NUNCA DEBE quedar `activo=true` por default. Este delta es ADDED, no
MODIFIED, porque el comportamiento normativo existente no cambia — solo se
agrega una forma nueva de invocar el método con un resultado distinto
cuando se pide explícitamente.

#### Scenario: Camino manual del super-admin — sigue dando `activo=false`

- GIVEN una org sin entitlement del pack `contabilidad.adjuntos`
  (`otorgadoPorDefecto=false`)
- WHEN el super-admin habilita el pack por el flujo manual existente, SIN
  pasar el parámetro opcional de activación
- THEN la fila `OrgPackEntitlement` se crea con `activo=false`, igual que
  antes de este change — el default del método NO cambió

#### Scenario: Org nueva de vertical CONTABILIDAD nace con el pack activo

- GIVEN el catálogo tiene `contabilidad.conciliacion` con
  `otorgadoPorDefecto=true` y `verticalAplicable=CONTABILIDAD`
- WHEN se provisiona una organización nueva con `dto.modulo=CONTABILIDAD`
  (por cualquiera de los dos entry points)
- THEN existe una fila `OrgPackEntitlement` para esa org y ese pack con
  `activo=true`, sin intervención del super-admin
- AND `habilitadoPorUserId` es el owner/creador humano de la organización

#### Scenario: Org de vertical distinto no recibe el pack

- GIVEN `contabilidad.conciliacion` tiene `verticalAplicable=CONTABILIDAD`
- WHEN se provisiona una organización nueva con `dto.modulo=GRANJA`
- THEN NO se crea ningún `OrgPackEntitlement` para ese pack en esa org

#### Scenario: Pack sin `otorgadoPorDefecto` sigue requiriendo flujo manual

- GIVEN un pack del catálogo con `otorgadoPorDefecto=false` (ej.
  `contabilidad.adjuntos`) y `verticalAplicable` coincidente
- WHEN se provisiona una organización nueva de ese vertical
- THEN NO se crea ningún `OrgPackEntitlement` automático para ese pack
- AND sigue requiriendo que el super-admin lo habilite explícitamente

#### Scenario: Invalidación de cache post-commit

- GIVEN el otorgamiento automático ocurre dentro de la transacción de
  creación de la organización
- WHEN la transacción confirma (commit)
- THEN la invalidación de cache Redis `org-packs:<orgId>` ocurre DESPUÉS del
  commit (para una org nueva la clave no existe todavía — no hay nada que
  invalidar antes, pero tampoco debe quedar cache obsoleta si la clave se
  llegó a poblar por una lectura concurrente)
