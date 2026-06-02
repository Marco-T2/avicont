# Riel de packs (eje 2) — Spec viva

<!--
Última edición: 2026-06-02
Última revisión contra core: 2026-06-02
Owner: backend-lead
Change de origen: packs-riel (PRs #150–#157, main 86105e8)
-->

## Propósito

El **eje 2 (packs)** de la plataforma multi-vertical: el mecanismo que permite
habilitar funcionalidades opcionales (típicamente de pago) DENTRO de un vertical,
gobernadas por la cadena **catálogo → entitlement → activación → gating**. Esta
spec describe el RIEL completo construido. Ningún pack concreto fue construido en
esta fase — el catálogo contiene claves placeholder.

Diseño completo: `docs/disenos/packs-eje2.md`.

**Invariantes transversales (las 4 reglas del diseño):**
1. Entitlement granular = tabla explícita (`OrgPackEntitlement`), NO enum `Plan`.
2. Granularidad = BUNDLE: un pack agrupa su nav + sus permisos + su capacidad.
3. Pack ↔ org-status = ortogonales: `PackEnabledGuard` y `OrgStatusGuard` son
   cadenas independientes; el entitlement NO se pierde al suspender.
4. Frontera de oro: activación ⊆ entitlement (estructural — la activación vive
   DENTRO de la fila de entitlement como columna `activo`).

---

## Módulo `backend/src/packs/`

Hexagonal estricto. Archivos: `domain/pack.ts`, `domain/pack-errors.ts`,
`ports/org-pack.repository.port.ts`, `ports/org-packs.reader.port.ts`,
`ports/org-vertical.reader.port.ts`, `ports/pack-catalog.reader.port.ts`,
`adapters/prisma-org-pack.repository.ts`, `adapters/prisma-pack-catalog.reader.ts`,
`adapters/prisma-org-vertical.reader.ts`, `pack.service.ts`, `pack.controller.ts`,
`pack.module.ts`, `dto/*.ts`.

---

## Schema (`schema.prisma`)

```prisma
enum VerticalPack { CONTABILIDAD  GRANJA }
enum TipoPack      { DOMINIO       CAPACIDAD }

model Pack {
  id                String             @id @default(uuid())
  clave             String             @unique          // "{modulo}.{submodulo}"
  nombre            String
  descripcion       String?
  verticalAplicable VerticalPack
  tipo              TipoPack
  activo            Boolean            @default(true)
  createdAt         DateTime           @default(now()) @db.Timestamptz(3)
  updatedAt         DateTime           @updatedAt       @db.Timestamptz(3)
  entitlements      OrgPackEntitlement[]
  @@map("packs")
}

model OrgPackEntitlement {
  id                  String       @id @default(uuid())
  organizationId      String
  packId              String
  activo              Boolean      @default(false)     // activación embebida
  habilitadoPorUserId String
  createdAt           DateTime     @default(now()) @db.Timestamptz(3)
  updatedAt           DateTime     @updatedAt           @db.Timestamptz(3)
  organization        Organization @relation(onDelete: Cascade)
  pack                Pack         @relation(onDelete: Restrict)
  @@unique([organizationId, packId])
  @@index([organizationId])
  @@map("org_pack_entitlements")
}
```

Migración: `20260602212634_packs_catalogo_y_entitlement`. Constraints nativas de
Prisma (sin objetos raw SQL) → no aplica el protocolo §11.6.

Seed catálogo (idempotente, upsert por `clave`): `contabilidad.adjuntos`,
`contabilidad.rag` (CONTABILIDAD, CAPACIDAD), `granja.rag` (GRANJA, CAPACIDAD).
Los packs del seed son **placeholders sin permisos en el catálogo**: el filtro RBAC
de pack solo "muerde" cuando el submódulo tiene permisos asignados en `catalogo.ts`.

---

## Requirement: Catálogo global de packs

El sistema mantiene un catálogo cerrado de packs (`Pack`) como recurso global sin
`organizationId`, legible desde cualquier tenant (análogo a `CotizacionUfv`,
excepción §4.2 core).

### Scenario: Catálogo seedeado con los packs definidos
- GIVEN la migración `20260602212634_packs_catalogo_y_entitlement` aplicada
- WHEN se ejecuta el seed del catálogo
- THEN existen filas `Pack` con claves placeholder (`contabilidad.adjuntos`,
  `contabilidad.rag`, `granja.rag`) con sus `verticalAplicable` y `tipo = CAPACIDAD`
- AND ninguna construye dominio de pack concreto (solo entradas de catálogo)

### Scenario: Clave de pack única
- GIVEN un `Pack` con `clave = "contabilidad.adjuntos"`
- WHEN se intenta crear otro `Pack` con la misma clave
- THEN la constraint `@@unique([clave])` lo rechaza

---

## Requirement: Entitlement por org con activación embebida

`OrgPackEntitlement` modela el entitlement de packs por org. La existencia de una
fila `(organizationId, packId)` significa "la plataforma habilitó este pack a esta
org". La columna `activo` ES la activación: NO existe una tabla de activación
separada. `@@unique([organizationId, packId])` previene doble entitlement bajo
concurrencia.

### Scenario: Habilitar crea la fila con activo=false
- GIVEN una org sin entitlement del pack `contabilidad.adjuntos`
- WHEN la plataforma habilita el pack
- THEN existe una fila `OrgPackEntitlement` con `activo = false`

### Scenario: Frontera estructural — sin entitlement no hay activación
- GIVEN una org SIN fila `OrgPackEntitlement` para un pack
- WHEN el servicio intenta `setActivo`
- THEN `findByOrgYPack` devuelve null → `PackNoHabilitadoError` (403, `PACK_NO_HABILITADO`)

### Scenario: Doble entitlement rechazado
- GIVEN una org con entitlement del pack X
- WHEN se intenta habilitar el pack X de nuevo
- THEN `@@unique([organizationId, packId])` rechaza la segunda fila

---

## Requirement: Entitlement administrado por super-admin

Solo un super-admin (`isSuperAdmin === true`, `SuperAdminGuard`) puede habilitar
o revocar entitlement de packs vía `POST /admin/platform/orgs/:id/packs` y
`DELETE /admin/platform/orgs/:id/packs/:packId`. La habilitación valida que
`pack.verticalAplicable` coincida con el vertical de la org. Las mutaciones quedan
auditadas por `PlatformAuditInterceptor`. El cache `org-packs:<id>` se invalida.

La lógica de dominio (validación de vertical, escritura del entitlement, invalidación
de cache) vive en `PackService`, no en `PlatformAdminService` (delega).

### Endpoints
- `POST /admin/platform/orgs/:id/packs` — Body: `{ packId?: string; clave?: string }`. 201.
- `DELETE /admin/platform/orgs/:id/packs/:packId` — 204.
- `GET /admin/platform/orgs/:id/packs` — Lista entitlements + estado de activación.

### Error codes
- `PACK_VERTICAL_NO_APLICABLE` — 400: pack.verticalAplicable ≠ vertical de la org.
- `PACK_NO_ENCONTRADO` — 404: pack no existe en el catálogo.

### Scenario: Super-admin habilita un pack del vertical correcto
- GIVEN org Contabilidad y pack `contabilidad.adjuntos` (CONTABILIDAD)
- WHEN SA hace `POST /admin/platform/orgs/:id/packs`
- THEN entitlement creado (`activo = false`) y auditado en `platform_audit`

### Scenario: Habilitar pack de vertical ajeno — rechazado
- GIVEN org Contabilidad y pack `granja.rag` (GRANJA)
- WHEN SA intenta habilitarlo
- THEN 400 `PACK_VERTICAL_NO_APLICABLE`, sin fila creada

### Scenario: No super-admin — 403
- GIVEN usuario sin `isSuperAdmin`
- WHEN intenta `POST /admin/platform/orgs/:id/packs`
- THEN 403 (`SuperAdminGuard`)

### Scenario: Revocar borra fila y cache
- GIVEN org con entitlement activo del pack X
- WHEN SA revoca
- THEN fila `OrgPackEntitlement` borrada + cache `org-packs:<id>` invalidado

---

## Requirement: Activación por el Owner (⊆ entitlement)

El Owner/ADMIN (gateado por `@RequireSystemRole(OWNER, ADMIN)` + `SystemRolesGuard`,
NO por permiso fino) puede activar/desactivar un pack YA habilitado. Si no existe la
fila de entitlement → `PackNoHabilitadoError` (403). El cache `org-packs:<id>` se
invalida al activar/desactivar.

### Endpoints
- `PATCH /api/packs/:clave` — Body: `{ activo: boolean }`. Responde `ActivacionPackResponseDto`.
- `GET /api/packs/mis-packs` — Lista entitlements + estado de activación de la org.

### `SystemRolesGuard` (net-new, reutilizable)
Guard en `common/guards/system-roles.guard.ts`. Lee el claim `roles` del JWT
(poblado por `auth.service`). Los valores de `SystemRole` son MAYÚSCULAS (`OWNER`,
`ADMIN`); custom roles son minúsculas → sin colisión. Endpoints sin
`@RequireSystemRole` pasan transparentes. Registrable a nivel de controller
(después de `JwtAuthGuard`).

### Error codes
- `PACK_NO_HABILITADO` — 403: Owner intenta activar pack sin entitlement.
- `PACK_NO_ENCONTRADO` — 404: clave no existe en el catálogo.
- `PACK_SIN_CONTEXTO_ORG` — 403: request sin `activeTenantId` (sin tenant activo).

### Scenario: Owner activa un pack habilitado
- GIVEN org con entitlement (`activo = false`) del pack `contabilidad.adjuntos`
- WHEN Owner hace `PATCH /api/packs/contabilidad.adjuntos` `{ activo: true }`
- THEN `activo` pasa a true y cache `org-packs:<id>` se invalida

### Scenario: Owner intenta activar pack NO habilitado — 403
- GIVEN org SIN entitlement del pack X
- WHEN Owner intenta activarlo
- THEN 403 `PACK_NO_HABILITADO`

### Scenario: Aislamiento por tenant
- GIVEN orgs A y B con entitlement del mismo pack
- WHEN Owner de A activa
- THEN solo cambia la fila de A; B no se afecta

---

## Requirement: Guard de pack `@RequirePack` (404 si apagado)

Decorador `@RequirePack(clave)` en `common/decorators/require-pack.decorator.ts`.
Guard `PackEnabledGuard` en `common/guards/pack-enabled.guard.ts`. Cache Redis
`org-packs:<id>` TTL 300. Fallo de Redis → fallback a BD (no fail-open). Endpoints
sin `@RequirePack` pasan transparentes.

**404 deliberado**: si el pack no está activo, el endpoint "no existe" para esa org
(no revela que existe pero está apagado). Mismo patrón que `ModuleEnabledGuard`.

**Ortogonalidad**: `PackEnabledGuard` (visibilidad/acceso) y `OrgStatusGuard`
(mutaciones) son cadenas independientes. No se mezclan.

**Orden de guards**: `JwtAuthGuard` → `PackEnabledGuard` → `PermissionsGuard`.
El 404 del pack gana al 403 del permiso (no revela que el endpoint existe).

### Scenario: Endpoint con @RequirePack y pack activo — pasa
- GIVEN org con pack `contabilidad.adjuntos` activo
- WHEN endpoint decorado con `@RequirePack('contabilidad.adjuntos')`
- THEN guard devuelve true

### Scenario: Pack habilitado pero NO activo — 404
- GIVEN org con entitlement pero `activo = false`
- WHEN endpoint decorado con ese pack
- THEN 404 (`PackNoEncontradoError` lanzada por el guard)

### Scenario: Pack NO habilitado — 404
- GIVEN org SIN entitlement
- THEN 404

### Scenario: Endpoint sin @RequirePack — transparente
- GIVEN endpoint sin decorador
- THEN guard devuelve true sin consultar packs

---

## Requirement: Packs activos en `GET /me/permissions`

`MePermissionsResponseDto` gana `packsActivos: string[]` (claves de packs activos
de la org del tenant). Leído en el MISMO handler que deriva el vertical, vía
`OrgPacksReaderPort` (cero round-trip extra).

### Scenario: Org con un pack activo
- GIVEN org con `contabilidad.adjuntos` activo
- WHEN `GET /me/permissions`
- THEN `packsActivos: ["contabilidad.adjuntos"]`

### Scenario: Org sin packs activos
- GIVEN org sin packs activos
- WHEN `GET /me/permissions`
- THEN `packsActivos: []`

---

## Requirement: Catálogo de permisos asignable filtrado por vertical + packs

`GET /permissions/grouped` es ahora server-autoritativo: filtra por vertical activo
de la org + packs activos. `GET /permissions` sigue disponible como referencia plana.

**Convención de mapeo pack→permisos**: `Pack.clave = {modulo}.{submodulo}` es el
prefijo de sus permisos (`{modulo}.{submodulo}.*`). Sin metadata extra en la tabla.
El catálogo de permisos ya agrupa por `modulo` + `submodulo` (`catalogoAgrupado()`).

**Regla de filtrado**:
- Submódulo `{modulo}.{submodulo}` que sea clave de un pack → solo asignable si ese
  pack está activo.
- Submódulos cross-vertical (`organizacion.*`, `sistema.*`) → siempre asignables.
- Submódulos del vertical activo no asociados a pack → siempre asignables.
- Submódulos de otro vertical → excluidos.

`custom-roles.service.validatePermissions` suma el mismo filtro: permiso de pack no
activo → `PermisoNoHabilitadoError` (código `CUSTOM_ROLE_PERMISO_NO_HABILITADO`, 400).

**Nota**: los packs del seed (`contabilidad.adjuntos`, `contabilidad.rag`, `granja.rag`)
son placeholders SIN permisos en `catalogo.ts` todavía. El filtro solo "muerde" cuando
el submódulo tiene permisos en el catálogo. Al construir el primer pack concreto hay que
agregar sus permisos al catálogo.

### Scenario: Pack activo → sus permisos son asignables
- GIVEN org Contabilidad con `contabilidad.adjuntos` activo
- WHEN `GET /permissions/grouped`
- THEN incluye permisos `contabilidad.adjuntos.*`

### Scenario: Pack NO activo → sus permisos NO son asignables
- GIVEN org sin el pack activo
- THEN NO incluye `contabilidad.adjuntos.*`

### Scenario: Asignar permiso de pack no activo — rechazado
- GIVEN org sin el pack activo
- WHEN crear/editar `CustomRole` con `contabilidad.adjuntos.create`
- THEN `validatePermissions` rechaza con `CUSTOM_ROLE_PERMISO_NO_HABILITADO`

---

## Requirement: Gating frontend por pack en la navegación

`NavItem` gana `pack?: string` (clave). `useMisPacks` (`frontend/src/lib/use-packs.ts`)
lee `packsActivos` del cache `['me-permissions', activeTenantId]` (TanStack Query,
NUNCA Zustand — Anti-F-05, cero red extra). `NavList` agrega el tercer filtro:
`pasaPack = item.pack === undefined || packsActivos.includes(item.pack)`. Fail-closed
durante loading (ítems con `pack` se ocultan hasta que cargue `packsActivos`).

El gating frontend es UX, no seguridad. El candado real es `PackEnabledGuard`.

### Scenario: Ítem con pack activo — visible
- GIVEN `NavItem` con `pack = "contabilidad.adjuntos"` y pack activo
- THEN visible (si también pasa permiso y vertical)

### Scenario: Ítem con pack NO activo — oculto
- GIVEN `NavItem` con pack no activo
- THEN oculto

### Scenario: Ítem sin pack — siempre pasa
- GIVEN `NavItem` sin campo `pack`
- THEN pasa el filtro de pack

### Scenario: Loading — fail-closed
- GIVEN `packsActivos` undefined (cargando)
- THEN ítems con `pack` permanecen ocultos
