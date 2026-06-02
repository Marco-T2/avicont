# Tasks — Riel de packs (eje 2), Fase 1

> **Completado 2026-06-02** — 8 slices, PRs #150–#157, mergeado a main `86105e8`.
> Tasks marcadas como completadas en el archive. Detalle de implementación en la
> spec viva: `openspec/specs/packs-riel/spec.md`.

---

## Slice 1 — Schema `Pack` + `OrgPackEntitlement` + enums + migración + seed
**PR**: #150
**Estado**: ✅ COMPLETADO

- [x] 1.1 Enums `VerticalPack {CONTABILIDAD, GRANJA}` y `TipoPack {DOMINIO, CAPACIDAD}` en `schema.prisma`.
- [x] 1.2 Modelo `Pack` (`@@map("packs")`): clave @unique, nombre, descripcion?, verticalAplicable, tipo, activo @default(true), timestamps, relación entitlements.
- [x] 1.3 Modelo `OrgPackEntitlement` (`@@map("org_pack_entitlements")`): activo @default(false), habilitadoPorUserId; relaciones Organization (Cascade) y Pack (Restrict); `@@unique([organizationId, packId])`, `@@index([organizationId])`.
- [x] 1.4 Relación inversa `packEntitlements OrgPackEntitlement[]` en `Organization`.
- [x] 1.5 Migración `20260602212634_packs_catalogo_y_entitlement`. Protocolo §11.6 aplicado (constraints nativas de Prisma, sin objetos raw SQL).
- [x] 1.6 Seed del catálogo idempotente (upsert por `clave`): `contabilidad.adjuntos`, `contabilidad.rag`, `granja.rag` (placeholder, verticalAplicable=CONTABILIDAD/GRANJA, tipo=CAPACIDAD).
- [x] 1.7 Tests: integración del seed (idempotente) + `@@unique` rechaza clave duplicada.

---

## Slice 2 — Módulo `packs/` hexagonal + `OrgPacksReaderPort`
**PR**: #151
**Estado**: ✅ COMPLETADO

- [x] 2.1 Test integración `PrismaOrgPackRepository`: habilitar, findByOrg (filtra por tenant), setActivo, findActivosByOrg, revocar.
- [x] 2.2 `domain/pack.ts` + `domain/pack-errors.ts` (`PackNoHabilitadoError` 403, `PackNoEncontradoError` 404, `PackVerticalNoAplicableError` 400).
- [x] 2.3 `ports/pack-catalog.reader.port.ts`, `ports/org-pack.repository.port.ts`, `ports/org-packs.reader.port.ts`.
- [x] 2.4 `adapters/prisma-org-pack.repository.ts`, `adapters/prisma-pack-catalog.reader.ts`, `adapters/prisma-org-vertical.reader.ts`.
- [x] 2.5 `pack.service.ts`: habilitar con validación de vertical, revocar, activar/desactivar con frontera, listar.
- [x] 2.6 `pack.module.ts`: registra ports, exporta `OrgPacksReaderPort`. Registrado en `app.module.ts`.
- [x] 2.7 Tests unit: vertical ajeno → `PackVerticalNoAplicableError`; sin entitlement → `PackNoHabilitadoError`.

---

## Slice 3 — `@RequirePack` + `PackEnabledGuard` + cache Redis
**PR**: #152
**Estado**: ✅ COMPLETADO

- [x] 3.1 Test unit guard: pack activo → true; habilitado-no-activo → 404; no habilitado → 404; sin @RequirePack → true; sin tenant → Forbidden.
- [x] 3.2 `common/decorators/require-pack.decorator.ts` — `SetMetadata(REQUIRE_PACK_KEY, clave)`.
- [x] 3.3 `common/guards/pack-enabled.guard.ts`: cache Redis `org-packs:<id>` TTL 300, fallback a BD en fallo Redis (no fail-open), 404 deliberado.
- [x] 3.4 Invalidación cache en `pack.service` (habilitar/revocar/activar/desactivar) via `redis.del('org-packs:<orgId>')`.
- [x] 3.5 Test unit: invalidación llamada en cada mutación.

---

## Slice 4 — `packsActivos` en `GET /me/permissions`
**PR**: #153
**Estado**: ✅ COMPLETADO

- [x] 4.1 Test e2e: org con pack activo → `packsActivos` incluye clave; sin packs → `packsActivos: []`.
- [x] 4.2 `MePermissionsResponseDto` gana `packsActivos: string[]` + `@ApiProperty`.
- [x] 4.3 Handler en `me.controller.ts` vía `OrgPacksReaderPort`, cero round-trip extra.
- [x] 4.4 OpenAPI regenerado (back `openapi:dump` + front `gen:api-types`).

---

## Slice 5 — Entitlement admin (super-admin habilitar/revocar/listar)
**PR**: #154
**Estado**: ✅ COMPLETADO

- [x] 5.1 Test e2e: SA habilita pack correcto → 201 + activo=false + platform_audit; vertical ajeno → error; no-SA → 403; revocar → borra fila + invalida cache.
- [x] 5.2 `habilitar-pack.dto.ts` (packId o clave). `PlatformAdminService.habilitarPack`/`revocarPack` delegan en `PackService` (lógica en packs/, no en platform/).
- [x] 5.3 Endpoints en `platform-admin.controller.ts`: `POST /admin/platform/orgs/:id/packs`, `DELETE /admin/platform/orgs/:id/packs/:packId`. Auditoría via `PlatformAuditInterceptor`.
- [x] 5.4 `GET /admin/platform/orgs/:id/packs` (listar entitlements + estado para panel SA).

---

## Slice 6 — Activación por el Owner + `SystemRolesGuard` net-new
**PR**: #155
**Estado**: ✅ COMPLETADO

- [x] 6.1 Test e2e del flujo completo: SA habilita → Owner activa → endpoint @RequirePack 200; Owner desactiva → 404; Owner activa sin entitlement → 403 `PACK_NO_HABILITADO`; aislamiento por tenant.
- [x] 6.2 `activar-pack.dto.ts` + `activacion-pack-response.dto.ts`.
- [x] 6.3 `pack.controller.ts`: `PATCH /api/packs/:clave` + `GET /api/packs/mis-packs`, gateado por `@RequireSystemRole(OWNER, ADMIN)` + `SystemRolesGuard` net-new en `common/`. Service valida frontera (PackNoHabilitadoError 403).
- [x] 6.4 `ShakedownProtegidoController` en e2e (`test/packs-activacion-owner.e2e-spec.ts` vía `ShakedownModule`) para validar guard end-to-end.

> **Net-new**: `SystemRolesGuard` (`common/guards/system-roles.guard.ts`) + decorator
> `@RequireSystemRole` (`common/decorators/require-system-role.decorator.ts`) son
> piezas reutilizables para cualquier controller que requiera OWNER/ADMIN sin ser
> el `SuperAdminGuard`.

---

## Slice 7 — Cierre de la deuda RBAC (catálogo asignable filtrado)
**PR**: #156
**Estado**: ✅ COMPLETADO

- [x] 7.1 Test e2e: pack activo → catálogo incluye permisos del pack; sin pack → no incluye; nunca granja.* en org contabilidad; CustomRole con permiso de pack no activo → `PermisoNoHabilitadoError`.
- [x] 7.2 Función de filtrado: `{modulo}.{submodulo}` = clave de un pack → solo asignable si activo. Submódulos cross-vertical (organizacion.*, sistema.*) y del vertical no asociados a pack: siempre.
- [x] 7.3 `GET /permissions/grouped` filtrado por vertical + packs activos del tenant. `GET /permissions` sigue como referencia plana.
- [x] 7.4 `custom-roles.service.ts` `validatePermissions`: permiso de pack no activo → `PermisoNoHabilitadoError` (`CUSTOM_ROLE_PERMISO_NO_HABILITADO`).
- [x] 7.5 `PermisoNoHabilitadoError` en `custom-roles/domain/custom-role-errors.ts`.
- [x] 7.6 Frontend: permissions-picker consume `GET /permissions/grouped` ya filtrado (server-authoritative, sin re-filtrar). OpenAPI regenerado.
- [x] 7.7 Test frontend: picker no muestra permisos de packs no activos.

---

## Slice 8 — Frontend riel (`pack?` en NavItem + `useMisPacks` + filtro)
**PR**: #157
**Estado**: ✅ COMPLETADO

- [x] 8.1 Test `nav-list.test.tsx`: ítem con pack activo → visible; no activo → oculto; sin pack → pasa; loading → fail-closed.
- [x] 8.2 `NavItem` gana `pack?: string`.
- [x] 8.3 `useMisPacks` (`frontend/src/lib/use-packs.ts`): lee `packsActivos` del cache `['me-permissions', activeTenantId]`. TanStack Query, cero red extra.
- [x] 8.4 `NavList`: tercer filtro `pasaPack = item.pack === undefined || packsActivos.includes(item.pack)`. Fail-closed durante loading.
- [x] 8.5 No se marcó ningún NavItem de producción con `pack` (no hay pack concreto aún). El riel queda probado por los tests unit.
