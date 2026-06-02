# Proposal: Riel de packs (eje 2) — Fase 1, riel completo SIN pack concreto

## Intent

El vertical Contabilidad es el core FREE. Las funcionalidades opcionales de pago
(Adjuntos, RAG, sub-dominios de Ventas/Compras/etc.) viven DENTRO de un vertical y
hoy no tienen riel para enchufarse. Este change construye el **eje 2 (packs)**:
el mecanismo entitlement → activación → gating que permite que la plataforma habilite
un pack a una org, el Owner lo active, y su navegación + permisos + capacidad aparezcan
solos, sin re-arquitecturar.

**Esta fase construye el RIEL completo (pasos 2–8 de la secuencia §9 del design), NO un
pack concreto.** El catálogo `Pack` se seedea con claves placeholder
(`contabilidad.adjuntos`, `contabilidad.rag`) pero ningún dominio de pack se construye.

Diseño completo: `docs/disenos/packs-eje2.md` (commit `244589b`). Engram
`sdd/packs/design`, `sdd/packs/reglas-producto`, `sdd/packs/explore`. Las decisiones
menores quedaron cerradas (ver Approach).

## Scope

### In Scope
- **Modelo `Pack`** (catálogo global, sin tenant — excepción §4.2 core) + enums
  `VerticalPack {CONTABILIDAD, GRANJA}` y `TipoPack {DOMINIO, CAPACIDAD}`.
- **`OrgPackEntitlement`** (entitlement por org) con activación EMBEBIDA (columna
  `activo`, default false) → frontera activación⊆entitlement garantizada por la forma
  del modelo. `@@unique([organizationId, packId])` (defense in depth §4.8). Migración
  + seed del catálogo.
- **Módulo `packs/` hexagonal** (domain/ ports/ adapters/ dto/ + service + controller +
  module) con `OrgPacksReaderPort` como única superficie que otros módulos leen.
- **`@RequirePack` + `PackEnabledGuard`** en `common/` (clon de `@RequireModule` /
  `ModuleEnabledGuard`), 404 si pack apagado, cache Redis `org-packs:<id>` TTL 300.
- **`packsActivos: string[]`** en `GET /me/permissions` (mismo `select`, cero red extra).
- **Entitlement admin** (super-admin): `habilitarPack`/`revocarPack` +
  `POST/DELETE /admin/platform/orgs/:id/packs`, validando `pack.verticalAplicable`
  contra el vertical de la org.
- **Activación Owner**: `PATCH` sobre `OrgPackEntitlement.activo` (gateado por SystemRole
  OWNER/ADMIN, no permiso fino), validando la frontera activación⊆entitlement.
- **Cierre de la deuda RBAC** (§7 design): catálogo asignable filtrado por
  vertical + packs activos (backend autoritativo en `permissions.controller` +
  `custom-roles.service.validatePermissions`; frontend espeja sin re-filtrar).
- **Frontend riel**: `pack?` en `NavItem` + `useMisPacks` (clon de `useVerticalActivo`,
  mismo cache `['me-permissions', tenantId]`) + tercer filtro en `NavList`.
- **Tests TDD** (Strict TDD Mode): integración (Postgres real) > unit > e2e, español.

### Out of Scope
- **Ningún pack concreto** (Adjuntos, RAG, Ventas/Compras/Costos/POS/Despachos/RRHH).
  El paso 9 de la secuencia §9 (primer pack enchufado) NO entra en esta fase.
- Proveedor de storage (Adjuntos) ni embeddings/LLM (RAG) — detalles internos de cada
  pack, fuera del riel.
- CUÁL es el primer pack concreto — decisión de Marco, fase posterior.
- Renombrar/reemplazar la pantalla "Módulos activos" (`/settings/features`) por una de
  activación de packs — opcional, fase final, NO en este change.
- Promover la activación a tabla propia (`OrgPackActivacion`) — solo si la activación
  gana estado propio en el futuro. Por ahora embebida.

## Capabilities

### New Capabilities
- `packs-riel`: riel de packs opcionales por vertical (catálogo global + entitlement
  por org + activación embebida + `@RequirePack`/guard 404 + exposición en
  `/me/permissions` + cierre de la deuda RBAC del catálogo asignable + gating frontend).

### Modified Capabilities
- `me-permissions`: `MePermissionsResponseDto` gana `packsActivos: string[]` (aditivo).
- `roles-asignables` / catálogo de permisos: el endpoint de catálogo asignable se filtra
  por vertical + packs activos (cierra contradicción §3 fundacional).

## Approach

El riel es **"otro module-flag con un nivel de entitlement encima"**. El proyecto ya
tiene el precedente EXACTO (eje vertical: `ModuleEnabledGuard` + `@RequireModule` + cache
Redis `org-features:<id>` + derivación en `/me/permissions` + `vertical?` en `NavItem`).
**Clonar el patrón, no inventar.** Tabla de clonado en `docs/disenos/packs-eje2.md` §5.1.

**Decisiones menores cerradas** (§10.2 design, dueño aprobó el doc al pedir el riel):
1. **Activación embebida**: una tabla `OrgPackEntitlement` con columna `activo`, NO dos
   tablas. La frontera activación⊆entitlement es estructural (sin entitlement no hay
   fila → no hay `activo` que prender).
2. **Mapeo pack→submódulos por convención de naming**: `Pack.clave = {modulo}.{submodulo}`
   (ej. `contabilidad.adjuntos`) = prefijo de sus permisos (`contabilidad.adjuntos.*`).
   Sin metadata extra en la tabla. El catálogo de permisos ya agrupa por `modulo` +
   `submodulo` (`catalogoAgrupado()`), así que el filtro es directo: un submódulo
   `(modulo, submodulo)` es asignable si `{modulo}.{submodulo}` NO es la clave de ningún
   pack, o si lo es y ese pack está activo.

**Invariantes del riel** (las 4 reglas cerradas, §6 design — un PR que las viole no entra):
1. Entitlement granular = tabla explícita, NO enum `Plan` con bundles.
2. Granularidad = BUNDLE (nav + permisos + capacidad, todo junto).
3. Pack ↔ org-status = ejes ORTOGONALES. `PackEnabledGuard` (visibilidad/acceso) y
   `OrgStatusGuard` (mutaciones) son cadenas independientes; el entitlement NO se pierde
   al suspender la org.
4. Frontera de oro: activación ⊆ entitlement (estructural).

**404 vs 403**: `PackEnabledGuard` replica el 404 deliberado del `ModuleEnabledGuard`
(no revela que el pack existe pero está apagado). El 403 queda para RBAC.

## Cómo probar
- Backend: tests de integración (Postgres real) del repositorio + guard; e2e del flujo
  super-admin habilita → Owner activa → endpoint protegido por `@RequirePack` responde
  200 (activo) / 404 (apagado o no habilitado); validación de frontera
  (`PATCH activo` sin entitlement → 403); validación de vertical en habilitación.
- Frontend: tests de `NavList` (ítem con `pack` oculto si no activo, visible si activo,
  fail-closed durante loading) + `useMisPacks`.
- Verde: `tsc --noEmit` + lint 0 (back y front); migración aplica + seed; suite completa.
