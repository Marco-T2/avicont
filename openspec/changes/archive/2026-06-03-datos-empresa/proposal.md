# Proposal: Datos de la empresa (perfil fiscal de la organización)

## Intent

La cabecera de cualquier informe contable boliviano exige datos fiscales de la empresa (razón social, NIT, dirección, representante legal, contacto) que HOY no se modelan en `Organization`. Antes de exportar informes (change posterior), la org debe poder capturar y editar estos datos.

## Scope

### In Scope
- Migración aditiva: 6 columnas nullable en `organizations` (`razonSocial`, `nit`, `direccion`, `representanteLegal`, `telefono`, `email`).
- Extender `UpdateTenantDto` con validación (NIT 7-12 dígitos por RND 10-0025-14; `email` válido; `maxLength` en texto). Reusar `PATCH /tenants/current` + permiso `organizacion.configuracion.update`.
- Asegurar que `update` persista (spread condicional por `exactOptionalPropertyTypes`) y que `findById`/response los devuelva.
- Frontend: página `/settings/empresa` (react-hook-form + zod), API get/update en feature `tenants`, nav-item con `RequirePermission`.
- Tests: service spec + e2e (NIT válido/inválido), vitest del form.

### Out of Scope
- Export a Excel/PDF de informes (change posterior).
- Logo (sin object storage; iteración futura).
- Cambios a `name`, `plan`, `status`, entitlement (los maneja super-admin).

## Capabilities

### New Capabilities
- `datos-empresa`: perfil fiscal editable de la organización (campos fiscales nullable, validación NIT/email, endpoint reusado, pantalla de edición gated por permiso).

### Modified Capabilities
- None.

## Approach

`name` queda como nombre comercial/display; `razonSocial` nuevo es el nombre legal. Todos los campos nuevos opcionales/nullable (orgs existentes no los tienen). Cero infra nueva: se extiende el DTO y el flujo de update existente. Validación de NIT con el patrón del value object `Nit` (`/^\d{7,12}$/`), comentario regulatorio RND 10-0025-14. Service lanza `DomainError`, no `HttpException` nuevo.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `prisma/schema.prisma` + nueva migration | Modified | 6 columnas nullable en `organizations` |
| `src/tenants/dto/update-tenant.dto.ts` | Modified | Campos fiscales + class-validator + `@ApiPropertyOptional` |
| `src/tenants/tenants.service.ts` | Modified | Persistir con spread condicional |
| `src/tenants/tenants.controller.ts` | Modified | Sin lógica; reusa permiso existente |
| `frontend/src/features/tenants/*` + `routes/router.tsx` | New/Modified | Página `/settings/empresa`, API, nav-item |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Migration regenerada DROPea objetos raw SQL (§11.6) | Low | Migración aditiva ADD COLUMN; revisar `migration.sql` por `DROP` antes de aplicar |
| `exactOptionalPropertyTypes` rompe el update | Med | Spread condicional `...(field !== undefined ? { field } : {})` |
| Drift OpenAPI front↔back (job `contract-drift`) | Med | Regenerar `openapi.json` + `api.generated.ts` tras tocar el DTO |

## Rollback Plan

Migración aditiva: `prisma migrate resolve --rolled-back` + DROP de las 6 columnas en migración inversa. Sin backfill, sin datos legacy afectados (todo nullable). Frontend/DTO: revertir el PR (squash → `git revert <sha>`).

## Dependencies

- Permiso `organizacion.configuracion.update` (ya en catálogo RBAC).
- Value object `Nit` (ya existe) como referencia del patrón de validación.

## Success Criteria

- [ ] Owner edita razón social, NIT, dirección, representante legal, teléfono y email vía `/settings/empresa`.
- [ ] `GET /tenants/current` devuelve los 6 campos.
- [ ] NIT fuera de 7-12 dígitos → 400 con error en español; e2e cubre válido/inválido.
- [ ] Sin permiso → form no accesible (gating front) y `PATCH` → 403 (back).
- [ ] Invariantes core respetados: §4.2 multi-tenant (la org es su propio scope), §4.6 timestamps UTC sin tocar; ningún invariante contable §4.1/4.3/4.4 afectado.
