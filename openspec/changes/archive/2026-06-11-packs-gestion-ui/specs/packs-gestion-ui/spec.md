# Delta para packs-gestion-ui

<!--
Última edición: 2026-06-11
Última revisión contra core: 2026-06-11
Owner: backend-lead
Change de origen: packs-gestion-ui
-->

## Contexto

Este delta agrega la **UI completa de gestión de packs** sobre el riel ya construido en `packs-riel`.
El backend de activación/entitlement ya existe; este change agrega:
- **Slice 0**: `GET /admin/platform/packs` (catálogo global, GAP-1) + regenerar tipos
- **Slice 1**: UI super-admin para habilitar/revocar packs a una org
- **Slice 2**: UI Owner `/settings/complementos` para activar/desactivar sus packs habilitados

Naming user-facing: **"Complementos"** (español). "Pack" = vocabulario interno de código/schema.

---

## ADDED Requirements

---

### Requirement: Catálogo global de packs accesible por super-admin (GAP-1)

El sistema DEBE exponer `GET /admin/platform/packs` que devuelva el catálogo completo de packs
(`PackResponseDto[]`), gateado por `SuperAdminGuard`. El response DEBE estar decorado con
`@ApiOkResponse({ type: [PackResponseDto] })` para que el DTO aparezca en el OpenAPI generado.
Tras agregar el endpoint, DEBE regenerarse `backend/openapi.json` y `frontend/src/types/api.generated.ts`.
Los aliases de los DTOs de packs DEBEN re-exportarse en `frontend/src/types/api.ts`.

#### Scenario: SA autenticado obtiene el catálogo

- GIVEN un usuario con `isSuperAdmin = true`
- WHEN hace `GET /admin/platform/packs`
- THEN responde 200 con array `PackResponseDto[]` conteniendo los packs del seed
- AND cada item incluye `{ id, clave, nombre, descripcion, verticalAplicable, tipo, activo }`

#### Scenario: Usuario sin isSuperAdmin — 403

- GIVEN un usuario con `isSuperAdmin = false`
- WHEN hace `GET /admin/platform/packs`
- THEN responde 403 (`SuperAdminGuard`)

#### Scenario: Respuesta tipada en OpenAPI

- GIVEN el endpoint existe con `@ApiOkResponse({ type: [PackResponseDto] })`
- WHEN se ejecuta `openapi:dump`
- THEN `backend/openapi.json` incluye el schema `PackResponseDto` y el path del endpoint
- AND `gen:api-types` no genera diff en `api.generated.ts` (CI `contract-drift` verde)

---

### Requirement: UI super-admin — gestión de entitlements de packs por org

En la página `/platform-admin/orgs`, el super-admin DEBE poder abrir un sheet por org para
ver, habilitar y revocar sus packs. El sheet DEBE cargar el catálogo filtrado por el vertical
de la org (D-04) y marcar los ya habilitados. Habilitar DEBE enviar siempre `clave` (R-07).
La UI DEBE reflejar el estado actual de los entitlements de la org al abrir.

#### Scenario: SA ve packs habilitados y disponibles de la org

- GIVEN una org con vertical CONTABILIDAD y con el pack `contabilidad.adjuntos` ya habilitado
- WHEN el SA abre el sheet de packs de esa org
- THEN ve `contabilidad.adjuntos` marcado como "Habilitado" con botón "Revocar"
- AND ve los demás packs CONTABILIDAD del catálogo con botón "Habilitar"
- AND NO ve packs de vertical GRANJA (filtrado D-04)

#### Scenario: SA habilita un pack no habilitado

- GIVEN org Contabilidad sin entitlement de `contabilidad.rag`
- WHEN SA hace clic en "Habilitar" sobre `contabilidad.rag`
- THEN se llama `POST /admin/platform/orgs/:id/packs` con `{ clave: "contabilidad.rag" }`
- AND se crea el entitlement con `activo = false`
- AND el sheet se actualiza (invalidación `['platform-org-packs', orgId]`)
- AND aparece un toast de éxito

#### Scenario: SA revoca un pack habilitado

- GIVEN org con entitlement del pack `contabilidad.adjuntos`
- WHEN SA hace clic en "Revocar"
- THEN se llama `DELETE /admin/platform/orgs/:id/packs/:packId`
- AND la fila de entitlement se borra
- AND el sheet se actualiza

#### Scenario: Pack de vertical incompatible no se ofrece en la UI

- GIVEN org con vertical GRANJA
- WHEN el SA abre el sheet de packs
- THEN NO aparece `contabilidad.adjuntos` ni `contabilidad.rag` en el catálogo del sheet
- AND solo se muestran packs con `verticalAplicable = GRANJA`

#### Scenario: Backend rechaza pack de vertical ajeno aunque llegue la request

- GIVEN org Contabilidad y el request llega con `{ clave: "granja.rag" }`
- WHEN se hace `POST /admin/platform/orgs/:id/packs`
- THEN responde 400 `PACK_VERTICAL_NO_APLICABLE` (defensa real del backend, ya existente)

#### Scenario: Estado vacío — org sin packs habilitados

- GIVEN org sin ningún entitlement
- WHEN SA abre el sheet
- THEN ve el catálogo completo (filtrado por vertical) sin ningún item marcado
- AND todos los packs tienen botón "Habilitar"

---

### Requirement: UI Owner — pantalla `/settings/complementos`

El sistema DEBE exponer la ruta `/settings/complementos` gateada por
`useHasSystemRole(['OWNER', 'ADMIN'])`. La pantalla DEBE listar los packs habilitados
de la org (`GET /api/packs/mis-packs`) con un switch ON/OFF por pack.
Switch ON = activo, Switch OFF = habilitado pero inactivo.
Un pack NO habilitado NO DEBE aparecer en la lista.

#### Scenario: Owner ve sus complementos habilitados (activos e inactivos)

- GIVEN org con `contabilidad.adjuntos` habilitado y activo, y `contabilidad.rag` habilitado e inactivo
- WHEN Owner navega a `/settings/complementos`
- THEN ve dos filas: `contabilidad.adjuntos` con switch ON, `contabilidad.rag` con switch OFF
- AND puede interactuar con ambos switches

#### Scenario: Org sin packs habilitados — empty state

- GIVEN org sin ningún entitlement en `OrgPackEntitlement`
- WHEN Owner navega a `/settings/complementos`
- THEN ve mensaje: "Tu organización no tiene complementos habilitados. Contactá al administrador de la plataforma."
- AND no hay switches ni acciones disponibles

#### Scenario: Usuario sin rol Owner/Admin no accede a la ruta

- GIVEN usuario con rol custom (sin OWNER ni ADMIN)
- WHEN intenta navegar a `/settings/complementos`
- THEN la ruta falla-cerrado: redirige o muestra 403 (no renderiza el contenido)

#### Scenario: Nav item "Complementos" no aparece para usuarios sin rol

- GIVEN usuario con rol custom (sin OWNER ni ADMIN)
- WHEN el nav se renderiza
- THEN el ítem "Complementos" no aparece en la navegación (filtro `requiredSystemRole`)

---

### Requirement: Activar / desactivar un complemento (Owner)

El Owner DEBE poder encender o apagar un pack habilitado usando el switch.
Activar llama `PATCH /api/packs/:clave { activo: true }`.
Desactivar llama `PATCH /api/packs/:clave { activo: false }`.
Tras el toggle exitoso, el nav DEBE reflejar el cambio (invalidación de `me-permissions`).

#### Scenario: Owner activa un complemento inactivo

- GIVEN pack `contabilidad.adjuntos` habilitado con `activo = false`
- WHEN Owner pone el switch en ON
- THEN se llama `PATCH /api/packs/contabilidad.adjuntos { activo: true }`
- AND el switch queda en ON en la UI
- AND `['me-permissions', activeTenantId]` y `['own-packs', activeTenantId]` se invalidan
- AND los ítems de nav gateados por ese pack aparecen

#### Scenario: Owner desactiva un complemento activo

- GIVEN pack `contabilidad.adjuntos` habilitado con `activo = true`
- WHEN Owner pone el switch en OFF
- THEN se llama `PATCH /api/packs/contabilidad.adjuntos { activo: false }`
- AND los ítems de nav gateados por ese pack desaparecen

#### Scenario: Error de red — switch revierte

- GIVEN pack habilitado con `activo = false`
- WHEN Owner pone el switch en ON y la request falla con error de red
- THEN el switch revierte a OFF
- AND se muestra un banner de error inline en la página

#### Scenario: Pack no habilitado — 403 del backend (defense in depth)

- GIVEN org SIN entitlement del pack X (situación que la UI no debería producir)
- WHEN llega `PATCH /api/packs/X { activo: true }` al backend
- THEN responde 403 `PACK_NO_HABILITADO` (invariante ya existente en el riel)

---

### Requirement: Nav item "Complementos" gateado por SystemRole

`NavItem` para `/settings/complementos` DEBE incluir `requiredSystemRole: ['OWNER', 'ADMIN']`.
`NavList` DEBE filtrar por `requiredSystemRole` usando `useHasSystemRole`.
El ítem NO DEBE tener campo `pack` ni campo `vertical` (es cross-vertical y no está gateado por un pack específico).
Fail-closed: si `systemRoles` no está resuelto (cargando), el ítem se oculta.

#### Scenario: Owner/Admin ve el ítem "Complementos" en el nav

- GIVEN usuario con SystemRole OWNER o ADMIN
- WHEN el nav se renderiza
- THEN aparece el ítem "Complementos" vinculado a `/settings/complementos`

#### Scenario: Rol no-OWNER/ADMIN no ve el ítem

- GIVEN usuario con rol solo custom (sin OWNER/ADMIN) o super-admin sin tenant activo
- WHEN el nav se renderiza
- THEN el ítem "Complementos" NO aparece

#### Scenario: Ítem sin pack ni vertical — no afectado por filtros de pack/vertical

- GIVEN `NavItem` "Complementos" sin campos `pack` ni `vertical`
- THEN pasa los filtros de pack y vertical siempre (solo lo filtra `requiredSystemRole`)
