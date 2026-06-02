# Tasks — Riel de packs (eje 2), Fase 1

> **Modo TDD estricto activo**: cada tarea de código arranca por el test (rojo →
> verde → refactor). Tests en español (describe/it). Honeycomb: integración (Postgres
> real vía `DATABASE_URL`) > unit > e2e. Naming: dominio español (`Pack`, `VerticalPack`,
> `TipoPack`), framework inglés (Service/Guard/Repository/Dto/Module); archivos
> kebab-case doble dot. Hexagonal estricto. Multi-tenant: toda query de
> `OrgPackEntitlement` filtra `organizationId`. Sin `Co-Authored-By`.
>
> **Cada slice = un PR squasheable.** Orden por dependencia. Paralelizables marcados.
> Anclas del molde (verificadas al 2026-06-02, vigentes):
> `module-enabled.guard.ts:30`, `require-module.decorator.ts:13`,
> `me.controller.ts:46-78`, `platform-admin.service.ts:146` /
> `platform-admin.controller.ts:43-143`, `custom-roles.service.ts:149`,
> `permissions.controller.ts:15-25`, `catalogo.ts:281` (`catalogoAgrupado`),
> `nav-items.ts:24-41`, `nav-list.tsx:30-34`, `use-vertical.ts`.

---

## Slice 1 — Schema `Pack` + `OrgPackEntitlement` + enums + migración + seed
**Scope de commit**: `feat(db): add Pack catalog + OrgPackEntitlement + enums`
**Depende de**: — (base, primero)
**Entregable**: tablas `packs` + `org_pack_entitlements`, enums `VerticalPack`/`TipoPack`,
migración aplicada, catálogo seedeado con claves placeholder.

- [ ] 1.1 Agregar a `schema.prisma`: enums `VerticalPack {CONTABILIDAD, GRANJA}` y
  `TipoPack {DOMINIO, CAPACIDAD}` (valores en español/mayúsculas, core §1).
- [ ] 1.2 Agregar modelo `Pack` (`@@map("packs")`): `id`, `clave @unique`, `nombre`,
  `descripcion?`, `verticalAplicable VerticalPack`, `tipo TipoPack`, `activo @default(true)`,
  timestamps `@db.Timestamptz(3)`, relación `entitlements`.
- [ ] 1.3 Agregar modelo `OrgPackEntitlement` (`@@map("org_pack_entitlements")`):
  `id`, `organizationId`, `packId`, `activo @default(false)`, `habilitadoPorUserId`,
  timestamps; relaciones a `Organization` (`onDelete: Cascade`) y `Pack`
  (`onDelete: Restrict`); `@@unique([organizationId, packId])`, `@@index([organizationId])`.
- [ ] 1.4 Agregar relación inversa `packEntitlements OrgPackEntitlement[]` en `Organization`.
- [ ] 1.5 Generar migración (`prisma migrate dev --name add_packs_riel`). Aplicar el
  **protocolo §11.6** (revisar DROP de objetos raw SQL legítimos antes de aplicar). Las
  constraints (`@@unique`, FKs) son nativas de Prisma → no requieren raw SQL.
- [ ] 1.6 Seed del catálogo (`prisma/seeds/` o `seed.ts`): insertar packs placeholder
  `contabilidad.adjuntos` y `contabilidad.rag` (`verticalAplicable = CONTABILIDAD`,
  `tipo = CAPACIDAD`). Idempotente (upsert por `clave`).
- [ ] 1.7 **Test**: integración del seed (catálogo creado, idempotente al re-correr) +
  verificar que el `@@unique` rechaza clave duplicada.
- **Hecho cuando**: migración aplica limpia, `prisma generate` OK, seed idempotente verde,
  `tsc --noEmit` 0.

---

## Slice 2 — Módulo `packs/` hexagonal + `OrgPacksReaderPort`
**Scope de commit**: `feat(packs): add hexagonal packs module with ports and repository`
**Depende de**: Slice 1
**Entregable**: módulo `backend/src/packs/` con domain/ ports/ adapters/ + service,
registrable en `app.module.ts`, exportando `OrgPacksReaderPort`.

- [ ] 2.1 **Test (integración, Postgres real)**: `PrismaOrgPackRepository` —
  `habilitar(orgId, packId, userId)` crea fila `activo=false`; `findByOrg(orgId)`
  filtra por tenant; `setActivo(orgId, packId, bool)`; `findActivosByOrg(orgId)` devuelve
  claves activas; `revocar(orgId, packId)` borra. Todas las queries filtran `organizationId`.
- [ ] 2.2 `domain/pack.ts` (entidad pura: clave, nombre, verticalAplicable, tipo) +
  `domain/pack-errors.ts` (`PackNoHabilitadoError extends ForbiddenError` con código
  `PACK_NO_HABILITADO`, mensaje español; `PackNoEncontradoError`; `PackVerticalNoAplicableError`).
- [ ] 2.3 `ports/pack-catalog.reader.port.ts` (listar catálogo `Pack`),
  `ports/org-pack.repository.port.ts` (entitlement + activación por org),
  `ports/org-packs.reader.port.ts` (← superficie que OTROS módulos leen: `packsActivos(orgId)`).
- [ ] 2.4 `adapters/prisma-org-pack.repository.ts` (implementa ambos ports de repo;
  toda query filtra `organizationId`).
- [ ] 2.5 `pack.service.ts` (lógica: habilitar con validación de vertical, revocar,
  activar/desactivar con validación de frontera, listar). `ClockPort` si necesita
  timestamps de dominio (`new Date()` prohibido en service).
- [ ] 2.6 `pack.module.ts`: registra adapters como providers de los ports, **exporta**
  `OrgPacksReaderPort` (token) para consumo cross-módulo. Registrar el módulo en `app.module.ts`.
- [ ] 2.7 **Test (unit)**: `pack.service` — habilitar pack de vertical ajeno →
  `PackVerticalNoAplicableError`; activar sin entitlement → `PackNoHabilitadoError`.
- **Hecho cuando**: módulo compila y se inyecta; integración + unit verdes; `OrgPacksReaderPort`
  exportado y consumible.

---

## Slice 3 — `@RequirePack` + `PackEnabledGuard` + cache Redis `org-packs:<id>`
**Scope de commit**: `feat(packs): add RequirePack decorator and PackEnabledGuard`
**Depende de**: Slice 2 (usa `OrgPacksReaderPort`)
**Entregable**: decorador + guard en `common/`, cache Redis, 404 deliberado.

- [ ] 3.1 **Test (unit del guard)**: pack activo → true; pack habilitado-no-activo → 404;
  pack no habilitado → 404; sin `@RequirePack` → true (transparente); sin tenant →
  Forbidden (coherente con `ModuleEnabledGuard`). Mockear `OrgPacksReaderPort` + Redis.
- [ ] 3.2 `common/decorators/require-pack.decorator.ts` — `SetMetadata(REQUIRE_PACK_KEY,
  clave)` (clon de `require-module.decorator.ts:13`).
- [ ] 3.3 `common/guards/pack-enabled.guard.ts` (clon de `module-enabled.guard.ts:30`):
  lee `req.user.activeTenantId`/`X-Tenant-ID`, resuelve packs activos vía
  `OrgPacksReaderPort`, cache Redis `org-packs:<id>` TTL 300 (lista de claves activas),
  404 si la clave requerida no está activa. Tolerar fallo de Redis (fallback a BD, NO
  fail-open, patrón `module-enabled.guard.ts:67-72`).
- [ ] 3.4 Invalidación: en `pack.service` (habilitar/revocar/activar/desactivar) hacer
  `redis.del('org-packs:<orgId>')` (mismo patrón que `actualizarStatus` en
  `platform-admin.service.ts:136`).
- [ ] 3.5 **Test (unit)**: invalidación de cache llamada en cada mutación de pack.
- **Hecho cuando**: guard registrable por-controller (DESPUÉS de `AuthGuard('jwt')`, ANTES
  de `PermissionsGuard`); tests verdes; cache invalidada en mutaciones.

> Nota: NINGÚN controller de dominio se decora con `@RequirePack` en esta fase (no hay
> pack concreto). El guard se valida con un endpoint de prueba en el e2e del Slice 6.

---

## Slice 4 — `packsActivos` en `GET /me/permissions`
**Scope de commit**: `feat(me): expose packsActivos in /me/permissions`
**Depende de**: Slice 2 (lee packs activos)
**Entregable**: `MePermissionsResponseDto.packsActivos: string[]`, llenado en el mismo handler.
**Paralelizable con**: Slice 3 (ambos dependen solo de Slice 2).

- [ ] 4.1 **Test (e2e/integración)**: org con pack activo → `packsActivos` incluye su clave;
  org sin packs → `packsActivos: []`. Aditivo (no rompe el resto de la respuesta).
- [ ] 4.2 Extender `MePermissionsResponseDto` con `packsActivos: string[]` (+ `@ApiProperty`
  para que entre al OpenAPI — recordar contrato front↔back).
- [ ] 4.3 En `me.controller.ts:46-78` agregar la relación de packs activos al `select`
  existente (vía `OrgPacksReaderPort` o include en el mismo lookup) y devolver
  `packsActivos`. Cero round-trip extra (invariante del eje vertical).
- [ ] 4.4 Regenerar OpenAPI (`openapi:dump` back + `gen:api-types` front) para no romper
  el job `contract-drift` del CI (deuda openapi-typescript ya cerrada).
- **Hecho cuando**: e2e verde, DTO en OpenAPI, sin drift de contrato.

---

## Slice 5 — Entitlement admin (super-admin habilitar/revocar)
**Scope de commit**: `feat(packs): super-admin pack entitlement endpoints`
**Depende de**: Slice 2
**Entregable**: `POST`/`DELETE /admin/platform/orgs/:id/packs[/:packId]`, validación de
vertical, auditoría.
**Paralelizable con**: Slices 3 y 4 (todos dependen solo de Slice 2).

- [ ] 5.1 **Test (e2e)**: super-admin habilita pack del vertical correcto → 201 + fila
  `activo=false` + entrada en `platform_audit`; habilitar pack de vertical ajeno → error;
  no super-admin → 403; revocar → borra fila + invalida cache.
- [ ] 5.2 DTO `habilitar-pack.dto.ts` (packId o clave). Métodos
  `PlatformAdminService.habilitarPack(orgId, packId, actorUserId)` /
  `revocarPack(orgId, packId)` (clon de `actualizarEntitlement`,
  `platform-admin.service.ts:146`): valida vertical de la org vs `pack.verticalAplicable`,
  delega en `OrgPackRepositoryPort`, invalida cache `org-packs:<id>`.
- [ ] 5.3 Endpoints en `platform-admin.controller.ts` (`@Controller('admin/platform')`,
  ya bajo `SuperAdminGuard` + `PlatformAuditInterceptor`): `POST orgs/:id/packs`,
  `DELETE orgs/:id/packs/:packId`. Poblar `req['tenantId'] = id` para la auditoría
  cross-tenant (patrón `orgs/:id/members`, controller `:92`).
- [ ] 5.4 `GET orgs/:id/packs` (listar catálogo + estado entitlement/activación de la org,
  para el panel super-admin) — opcional pero recomendado para la UI futura.
- **Hecho cuando**: e2e verde (incl. 403 y validación de vertical), auditoría registrada.

---

## Slice 6 — Activación por el Owner (`PATCH activo`, frontera)
**Scope de commit**: `feat(packs): owner pack activation endpoint`
**Depende de**: Slice 2, Slice 3 (el e2e valida el guard con un endpoint de prueba)
**Entregable**: `pack.controller.ts` con `PATCH` de activación gateado por SystemRole
OWNER/ADMIN, validación de frontera; e2e del flujo completo del riel.

- [ ] 6.1 **Test (e2e del flujo completo)**: super-admin habilita → Owner activa
  (`PATCH activo=true`) → endpoint de prueba con `@RequirePack` responde 200; Owner
  desactiva → 404; Owner intenta activar pack NO habilitado → 403 `PACK_NO_HABILITADO`;
  activación de org A no afecta org B (filtro por tenant).
- [ ] 6.2 DTO `activar-pack.dto.ts` (`activo: boolean`) + `pack-response.dto.ts`.
- [ ] 6.3 `pack.controller.ts` (endpoints del Owner): `PATCH` sobre la activación,
  gateado por SystemRole OWNER/ADMIN (`useHasSystemRole`/guard equivalente, NO permiso
  fino). El service valida frontera (sin entitlement → `PackNoHabilitadoError` 403).
  `GET` "mis packs" (catálogo + estado para la org) opcional.
- [ ] 6.4 Endpoint de prueba interno (controller de test o fixture e2e) decorado con
  `@RequirePack('contabilidad.adjuntos')` para validar el guard end-to-end. NO es un
  pack concreto — es el shakedown del riel.
- **Hecho cuando**: e2e del flujo completo verde (habilitar→activar→200, desactivar→404,
  frontera→403, aislamiento por tenant).

---

## Slice 7 — Cierre de la deuda RBAC (catálogo asignable filtrado)
**Scope de commit**: `feat(rbac): filter assignable permission catalog by vertical and packs`
**Depende de**: Slice 2 (lee vertical + packs activos)
**Entregable**: catálogo asignable filtrado backend-autoritativo + `validatePermissions`
suma el filtro + frontend espeja.

- [ ] 7.1 **Test (integración/e2e)**: org de Contabilidad con pack `contabilidad.adjuntos`
  activo → catálogo asignable incluye `contabilidad.adjuntos.*`; sin el pack → NO los
  incluye; nunca incluye `granja.*`; siempre incluye `organizacion.*`/`sistema.*`.
  Crear `CustomRole` con permiso de pack no activo → `PermisoNoHabilitadoError`.
- [ ] 7.2 Función de filtrado (en `common/permisos/` o servicio): dado vertical + packs
  activos de la org, filtra `CATALOGO_PERMISOS`/`catalogoAgrupado()`. **Convención**: un
  submódulo `{modulo}.{submodulo}` que sea clave de un `Pack` solo entra si ese pack está
  activo; submódulos cross-vertical (`organizacion`, `sistema`) y del vertical activo no
  asociados a pack entran siempre; submódulos de otro vertical se excluyen.
- [ ] 7.3 Endpoint asignable: filtrar el catálogo en `permissions.controller.ts`
  (`GET /permissions/grouped` ya consumido por la UI, o nuevo `GET /permissions/asignables`)
  por vertical + packs activos del tenant. Server-authoritative.
- [ ] 7.4 `custom-roles.service.ts:149` (`validatePermissions`): sumar el filtro — un
  permiso de un submódulo de pack no activo → `PermisoNoHabilitadoError`. Mantener el
  comportamiento de wildcards existente.
- [ ] 7.5 `PermisoNoHabilitadoError` en `custom-roles/domain/custom-role-errors.ts`
  (código estable, mensaje español).
- [ ] 7.6 **Frontend**: `permissions-picker.tsx`
  (`frontend/src/features/roles/components/`) consume el catálogo YA filtrado (no
  re-filtra; espeja el backend como `usePermissions`). Ajustar el hook/api del picker al
  endpoint asignable. Regenerar OpenAPI si cambió el contrato.
- [ ] 7.7 **Test (frontend)**: el picker no muestra permisos de packs no activos
  (renderiza lo que el backend devuelve).
- **Hecho cuando**: backend filtra y `validatePermissions` rechaza permisos de pack no
  activo; front espeja; tests back + front verdes; sin drift de contrato.

---

## Slice 8 — Frontend riel (`pack?` en NavItem + `useMisPacks` + filtro)
**Scope de commit**: `feat(frontend): pack gating in sidebar navigation`
**Depende de**: Slice 4 (`packsActivos` en `/me/permissions`)
**Entregable**: tercer eje de filtrado en el sidebar.
**Paralelizable con**: Slice 5, 6, 7 (todos dependen de Slice 2/4, no entre sí).

- [ ] 8.1 **Test (`nav-list.test.tsx`)**: ítem con `pack` activo → visible; ítem con `pack`
  no activo → oculto; ítem sin `pack` → pasa el filtro de pack; loading
  (`packsActivos` indefinido) → fail-closed (oculto). Mockear `useMisPacks`.
- [ ] 8.2 `NavItem` (`nav-items.ts:24-41`) gana `pack?: string` (clave del pack). JSDoc:
  ítems sin `pack` siempre pasan el filtro de pack (como ítems sin `vertical`).
- [ ] 8.3 `useMisPacks` (`frontend/src/lib/use-packs.ts`, clon de `use-vertical.ts`): lee
  `packsActivos` del MISMO `queryKey ['me-permissions', activeTenantId]`. Server state →
  TanStack Query, NUNCA Zustand (Anti-F-05). Cero red extra (dedup por queryKey).
- [ ] 8.4 `NavList` (`nav-list.tsx:30-34`): agregar tercer filtro
  `pasaPack = item.pack === undefined || packsActivos.includes(item.pack)`;
  `return pasaPermiso && pasaVertical && pasaPack`. Fail-closed durante loading.
- [ ] 8.5 (Demostración del riel, opcional) marcar 1 NavItem placeholder con
  `pack: 'contabilidad.adjuntos'` SOLO si hay una ruta para mostrar; si no, dejar el
  filtro listo sin ítem (el riel queda probado por los tests unit). NO construir pantalla
  de pack.
- **Hecho cuando**: `nav-list.test.tsx` verde, `tsc -b` + lint 0 (front), checklist UI
  §7 frontend si se toca render visible.

---

## Mapa de dependencias / paralelización

```
Slice 1 (schema)
   └─> Slice 2 (módulo packs/ + OrgPacksReaderPort)
          ├─> Slice 3 (guard + cache)          ─┐
          ├─> Slice 4 (/me/permissions)         │ paralelizables
          ├─> Slice 5 (entitlement admin)       │ (todos solo dependen de S2,
          ├─> Slice 7 (deuda RBAC)             ─┘  S7 también de S2)
          │
          └─> Slice 6 (activación Owner)  [depende de S2 + S3]
                 └─ e2e end-to-end del riel

   Slice 8 (frontend nav)  [depende de S4]   ── paralelizable con S5/S6/S7
```

**Secuenciales obligatorios**: 1 → 2 → {3,4,5,7} ; 6 tras {2,3} ; 8 tras 4.
**Paralelizables** una vez listo Slice 2: 3, 4, 5, 7 entre sí; y 8 una vez listo 4.
**Recomendado para el shakedown**: cerrar 6 (e2e completo) antes de pulir 7/8, porque
valida el riel de punta a punta (habilitar → activar → guard 200/404 → frontera 403).
