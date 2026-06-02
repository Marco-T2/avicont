# Riel de packs (eje 2) — Specification

## Purpose

Construir el riel del **eje 2 (packs)** de la plataforma multi-vertical: el mecanismo
que permite habilitar funcionalidades opcionales (típicamente de pago) DENTRO de un
vertical, gobernadas por la cadena **catálogo → entitlement → activación → gating**.
Esta fase construye el riel completo SIN ningún pack concreto. Diseño:
`docs/disenos/packs-eje2.md`.

**Invariantes transversales** (las 4 reglas, §6 design):
1. Entitlement granular = tabla explícita (`OrgPackEntitlement`), NO enum `Plan`.
2. Granularidad = BUNDLE: un pack agrupa su nav + sus permisos + su capacidad.
3. Pack ↔ org-status = ortogonales: `PackEnabledGuard` (acceso) y `OrgStatusGuard`
   (mutaciones) son cadenas independientes; el entitlement NO se pierde al suspender.
4. Frontera de oro: activación ⊆ entitlement (estructural — la activación vive DENTRO
   de la fila de entitlement).

## Requirements

### Requirement: Catálogo global de packs

El sistema DEBE mantener un catálogo cerrado de packs (`Pack`) como recurso global sin
`organizationId`, legible desde cualquier tenant (excepción §4.2 core, análoga a
`CotizacionUfv`). Cada `Pack` declara `clave` (única, namespaced `{modulo}.{submodulo}`,
ej. `contabilidad.adjuntos`), `nombre`, `descripcion?`, `verticalAplicable`
(`VerticalPack`), `tipo` (`TipoPack`) y `activo` (un pack retirado no se vende).

#### Scenario: Catálogo seedeado con los packs definidos
- GIVEN la migración inicial del riel aplicada
- WHEN se ejecuta el seed del catálogo
- THEN existen filas `Pack` con claves placeholder (`contabilidad.adjuntos`,
  `contabilidad.rag`) con `verticalAplicable = CONTABILIDAD` y `tipo = CAPACIDAD`
- AND ninguna construye dominio de pack (solo entradas de catálogo)

#### Scenario: Clave de pack única
- GIVEN un `Pack` con `clave = "contabilidad.adjuntos"`
- WHEN se intenta crear otro `Pack` con la misma clave
- THEN la constraint `UNIQUE` lo rechaza

---

### Requirement: Entitlement por org con activación embebida

El sistema DEBE modelar el entitlement de packs por org con la tabla
`OrgPackEntitlement` (`organizationId`, `packId`, `activo` default false,
`habilitadoPorUserId`). La existencia de una fila `(organizationId, packId)` significa
"la plataforma habilitó este pack a esta org". La columna `activo` ES la activación: NO
existe una fila de activación independiente. La constraint `@@unique([organizationId,
packId])` (hard, defense in depth §4.8) impide doble entitlement bajo concurrencia. Toda
query filtra por `organizationId` (multi-tenant estricto §4.2, defense in depth
guard+servicio+repo).

#### Scenario: Habilitar crea la fila con activo=false
- GIVEN una org sin entitlement del pack `contabilidad.adjuntos`
- WHEN la plataforma habilita el pack
- THEN existe una fila `OrgPackEntitlement` con `activo = false` (habilitar ≠ activar)

#### Scenario: Frontera estructural — sin entitlement no hay activación
- GIVEN una org SIN fila `OrgPackEntitlement` para un pack
- WHEN se intenta marcar ese pack como activo
- THEN no hay fila sobre la que setear `activo` → activar es estructuralmente imposible

#### Scenario: Doble entitlement rechazado
- GIVEN una org con entitlement del pack X
- WHEN se intenta habilitar el pack X de nuevo (concurrencia)
- THEN `@@unique([organizationId, packId])` rechaza la segunda fila

---

### Requirement: Entitlement administrado por super-admin

El sistema DEBE permitir que SOLO un super-admin (`isSuperAdmin === true`,
`SuperAdminGuard`) habilite/revoque entitlement de packs, vía
`POST /admin/platform/orgs/:id/packs` y `DELETE /admin/platform/orgs/:id/packs/:packId`.
La habilitación DEBE validar que `pack.verticalAplicable` coincida con el vertical de la
org (no romper la exclusividad de vertical §10.4). Las mutaciones quedan auditadas por
`PlatformAuditInterceptor`. El cache `org-packs:<id>` se invalida en habilitar/revocar.

#### Scenario: Super-admin habilita un pack del vertical correcto
- GIVEN una org de Contabilidad y el pack `contabilidad.adjuntos` (CONTABILIDAD)
- WHEN el super-admin hace `POST /admin/platform/orgs/:id/packs` con ese pack
- THEN se crea el entitlement (`activo = false`) y se audita en `platform_audit`

#### Scenario: Habilitar pack de vertical ajeno — rechazado
- GIVEN una org de Contabilidad y un pack con `verticalAplicable = GRANJA`
- WHEN el super-admin intenta habilitarlo
- THEN el sistema responde error (vertical no aplicable) y NO crea la fila

#### Scenario: Usuario no super-admin — 403
- GIVEN un usuario con `isSuperAdmin = false`
- WHEN intenta `POST /admin/platform/orgs/:id/packs`
- THEN `SuperAdminGuard` responde 403

#### Scenario: Revocar entitlement borra la fila (revoca también la activación)
- GIVEN una org con entitlement activo del pack X
- WHEN el super-admin revoca el pack X
- THEN la fila `OrgPackEntitlement` se borra → el pack deja de estar habilitado Y activo
- AND el cache `org-packs:<id>` se invalida

---

### Requirement: Activación por el Owner (⊆ entitlement)

El sistema DEBE permitir que el Owner/ADMIN (gateado por SystemRole OWNER/ADMIN, NO un
permiso fino) active/desactive un pack YA habilitado, vía `PATCH` sobre
`OrgPackEntitlement.activo`. El servicio DEBE validar la frontera activación⊆entitlement:
si no existe la fila de entitlement → `PackNoHabilitadoError` (403, mensaje español). El
cache `org-packs:<id>` se invalida al activar/desactivar.

#### Scenario: Owner activa un pack habilitado
- GIVEN una org con entitlement (`activo = false`) del pack `contabilidad.adjuntos`
- WHEN el Owner hace `PATCH` activando el pack
- THEN `activo` pasa a true y el cache se invalida

#### Scenario: Owner intenta activar un pack NO habilitado — 403
- GIVEN una org SIN entitlement del pack X
- WHEN el Owner intenta activarlo
- THEN el sistema responde 403 con código `PACK_NO_HABILITADO` y mensaje en español

#### Scenario: Activación filtrada por tenant
- GIVEN dos orgs A y B, ambas con entitlement del mismo pack
- WHEN el Owner de A activa el pack
- THEN solo cambia la fila de A (query filtra `organizationId`); B no se afecta

---

### Requirement: Guard de pack `@RequirePack` (404 si apagado)

El sistema DEBE proveer el decorador `@RequirePack('{modulo}.{submodulo}')` y el guard
`PackEnabledGuard` (en `common/`, clon de `ModuleEnabledGuard`). El guard lee la
activación efectiva de la org activa (`OrgPackEntitlement.activo` por
`(tenantId, clave)`, cache Redis `org-packs:<id>` TTL 300). Si el pack NO está activo
(no habilitado, o habilitado pero apagado), responde **404 deliberado** (no revela que
existe pero está apagado). Endpoints sin `@RequirePack` pasan transparentes. El guard
NO se mezcla con `OrgStatusGuard` (regla 3, ejes ortogonales).

#### Scenario: Endpoint con @RequirePack y pack activo — pasa
- GIVEN una org con el pack `contabilidad.adjuntos` activo
- WHEN se llama un endpoint decorado con `@RequirePack('contabilidad.adjuntos')`
- THEN el guard devuelve true y la request continúa

#### Scenario: Pack habilitado pero NO activo — 404
- GIVEN una org con entitlement del pack pero `activo = false`
- WHEN se llama un endpoint decorado con ese pack
- THEN el guard responde 404 (no revela que está apagado)

#### Scenario: Pack NO habilitado — 404
- GIVEN una org SIN entitlement del pack
- WHEN se llama un endpoint decorado con ese pack
- THEN el guard responde 404

#### Scenario: 404 de pack gana al 403 de permiso
- GIVEN un endpoint con `@RequirePack` (apagado) Y `@RequirePermissions` (sin permiso)
- WHEN se llama el endpoint
- THEN `PackEnabledGuard` corre antes y responde 404 (no revela el endpoint)

#### Scenario: Endpoint sin @RequirePack — transparente
- GIVEN un endpoint sin el decorador
- WHEN se lo llama
- THEN el guard devuelve true sin tocar packs

---

### Requirement: Packs activos en `GET /me/permissions`

El sistema DEBE devolver `packsActivos: string[]` (claves de los packs activos de la org
del tenant) en `GET /me/permissions`, leído en el MISMO `select` que deriva el vertical
(cero round-trip extra). El campo es aditivo en `MePermissionsResponseDto`.

#### Scenario: Org con un pack activo
- GIVEN una org con el pack `contabilidad.adjuntos` activo
- WHEN el usuario llama `GET /me/permissions`
- THEN la respuesta incluye `packsActivos: ["contabilidad.adjuntos"]` junto a `vertical`

#### Scenario: Org sin packs activos
- GIVEN una org sin packs activos (entitlements apagados o inexistentes)
- WHEN el usuario llama `GET /me/permissions`
- THEN `packsActivos = []`

---

### Requirement: Catálogo de permisos asignable filtrado por vertical + packs

El sistema DEBE filtrar el catálogo de permisos asignable a un `CustomRole` por el
vertical activo de la org + sus packs activos (backend autoritativo). El catálogo
asignable incluye: permisos del vertical activo (`contabilidad.*` o `granja.*`), permisos
cross-vertical (`organizacion.*`, `sistema.*`, siempre), y permisos de submódulos cuyo
pack esté activo (un submódulo `{modulo}.{submodulo}` que sea clave de un pack solo es
asignable si ese pack está activo). `validatePermissions` (`custom-roles.service`) DEBE
sumar el mismo filtro: un `CustomRole` no puede asignar permisos de un pack no activo →
error (`PermisoNoHabilitadoError`). El frontend espeja el catálogo filtrado sin re-filtrar.

#### Scenario: Pack activo → sus permisos son asignables
- GIVEN una org de Contabilidad con el pack `contabilidad.adjuntos` activo
- WHEN se pide el catálogo asignable
- THEN incluye los permisos `contabilidad.adjuntos.*`

#### Scenario: Pack NO activo → sus permisos NO son asignables
- GIVEN una org de Contabilidad sin el pack `contabilidad.adjuntos` activo
- WHEN se pide el catálogo asignable
- THEN NO incluye `contabilidad.adjuntos.*`

#### Scenario: Permisos de otro vertical excluidos
- GIVEN una org de Contabilidad
- WHEN se pide el catálogo asignable
- THEN incluye `contabilidad.*` y `organizacion.*`/`sistema.*`, pero NO `granja.*`

#### Scenario: Asignar permiso de pack no activo a un CustomRole — rechazado
- GIVEN una org sin el pack `contabilidad.adjuntos` activo
- WHEN se intenta crear/editar un `CustomRole` con `contabilidad.adjuntos.create`
- THEN `validatePermissions` rechaza con `PermisoNoHabilitadoError`

---

### Requirement: Gating frontend por pack en la navegación

El frontend DEBE filtrar los ítems del sidebar por pack además de permiso y vertical.
`NavItem` gana `pack?: string` (clave). El hook `useMisPacks` lee `packsActivos` del MISMO
cache `['me-permissions', tenantId]` (cero red extra, server state en TanStack Query,
NUNCA Zustand — Anti-F-05). `NavList` agrega el tercer filtro:
`pasaPack = item.pack === undefined || packsActivos.includes(item.pack)`. Fail-closed:
durante loading (`packsActivos` indefinido) los ítems con `pack` se ocultan. El gating
frontend es UX, no seguridad (el candado real es `PackEnabledGuard`).

#### Scenario: Ítem con pack activo — visible
- GIVEN un `NavItem` con `pack = "contabilidad.adjuntos"` y el pack activo
- WHEN se renderiza `NavList`
- THEN el ítem es visible (si también pasa permiso y vertical)

#### Scenario: Ítem con pack NO activo — oculto
- GIVEN un `NavItem` con `pack` cuyo pack no está activo
- WHEN se renderiza `NavList`
- THEN el ítem NO aparece

#### Scenario: Ítem sin pack — siempre pasa el filtro de pack
- GIVEN un `NavItem` sin campo `pack`
- WHEN se renderiza `NavList`
- THEN pasa el filtro de pack (gatea solo por permiso y vertical)

#### Scenario: Loading — fail-closed
- GIVEN `packsActivos` indefinido (cargando)
- WHEN se renderiza `NavList`
- THEN los ítems con `pack` permanecen ocultos hasta que cargue
