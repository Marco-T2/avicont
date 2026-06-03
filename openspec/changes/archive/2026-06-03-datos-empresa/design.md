# Design: Datos de la empresa (perfil fiscal de la organización)

## Technical Approach

Extensión aditiva del flujo `tenants` existente: 6 columnas nullable en `Organization`, `UpdateTenantDto` ampliado, persistencia con spread condicional, y una página `/settings/empresa` espejo de `features-page.tsx`. CERO infra nueva, CERO refactor del módulo. `name` = nombre comercial/display; `razonSocial` nuevo = nombre legal. El endpoint, permiso y guards ya existen; solo se amplía el payload.

## Architecture Decisions

| Tema | Opción elegida | Alternativa rechazada | Rationale |
|------|----------------|----------------------|-----------|
| Validación NIT en DTO | `@Matches(/^\d{7,12}$/)` + comentario regulatorio RND 10-0025-14 | Instanciar value object `Nit` en el DTO | El VO `Nit` **NO existe** hoy en `backend/src/common/domain/` (es ejemplo de CLAUDE.md §3.4). El DTO es plano y no debe importar dominio. El regex es la misma regla; el VO se introduce el día que haya lógica de NIT, no ahora. Evita scope creep. |
| Hexagonalización | Mantener patrón actual (`TenantRepositoryPort` + `TenantUpdateData`) | Refactor a más ports/entidades de dominio | `tenants` YA usa port+adapter. Solo se agregan campos a `TenantUpdateData` y al spread del adapter. NO se crea entidad `Empresa` ni VOs — sería scope creep (Project Standards: respetar legacy Fase-0). |
| Response DTO | Reusar el objeto Prisma `Organization` que ya devuelve `findById`/`update` | Crear `TenantResponseDto` tipado | El controller hoy retorna el row Prisma crudo. Agregar columnas las incluye automáticamente. Para OpenAPI los tipos salen del dump Swagger → `api.generated.ts`. NO romper el patrón del módulo. |
| Persistencia opcional | Spread condicional `...(v !== undefined ? { v } : {})` en el adapter | Pasar `undefined` directo a Prisma | `exactOptionalPropertyTypes` (CLAUDE.md §2.5.1) — patrón YA usado en `prisma-tenant.repository.ts:63-68`. |
| Error de validación | `BadRequestException` de class-validator (ValidationPipe) | `DomainError` nuevo | La validación de formato es transversal del DTO, no regla de dominio. El service ya lanza `DomainError` solo para reglas (e.g. `TipoEmpresaInmutableError`). No agregamos throws nuevos. |

## Data Flow (PATCH)

```
/settings/empresa form (zod)
   │ useMutation → patchEmpresa()  PATCH /api/tenants/current  { razonSocial, nit, ... }
   ▼
TenantGuard → PermissionsGuard('organizacion.configuracion.update')
   ▼
UpdateTenantDto  ──ValidationPipe──▶ @Matches NIT / @IsEmail / @MaxLength  (400 si falla)
   ▼
TenantsService.update(id, dto)  ── repo.update(id, TenantUpdateData)
   ▼
PrismaTenantRepository.update  ── spread condicional ──▶ organization.update
   ▼
Organization (6 campos) ──▶ controller ──▶ JSON ──▶ invalida queryKey ['tenant','current']
```

`GET /tenants/current` → `findById` → row Prisma con los 6 campos nuevos (sin cambios de código en el GET).

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/prisma/schema.prisma` | Modify | 6 columnas en `Organization`: `razonSocial String?`, `nit String?`, `direccion String?`, `representanteLegal String?`, `telefono String?`, `email String?` — todas nullable, sin default |
| `backend/prisma/migrations/<ts>_datos_empresa/migration.sql` | Create | `ALTER TABLE "organizations" ADD COLUMN ...` ×6. Revisar por líneas `DROP` (§11.6) antes de aplicar |
| `backend/src/tenants/dto/update-tenant.dto.ts` | Modify | 6 props con `@IsOptional` + validadores + `@ApiPropertyOptional` |
| `backend/src/tenants/ports/tenant.repository.port.ts` | Modify | Agregar los 6 campos opcionales a `interface TenantUpdateData` |
| `backend/src/tenants/adapters/prisma-tenant.repository.ts` | Modify | 6 líneas de spread condicional en `update()` |
| `backend/openapi.json` | Modify | Regenerar (`pnpm run openapi:dump`) |
| `frontend/src/types/api.generated.ts` | Modify | Regenerar (`pnpm run gen:api-types`) |
| `frontend/src/features/tenants/api/get-empresa.ts` | Create | GET `/api/tenants/current` |
| `frontend/src/features/tenants/api/update-empresa.ts` | Create | PATCH `/api/tenants/current` |
| `frontend/src/features/tenants/hooks/use-empresa.ts` | Create | `useQuery` perfil + `useMutation` update |
| `frontend/src/features/tenants/schemas/empresa-form-schema.ts` | Create | zod espejo: NIT `/^\d{7,12}$/`, email, maxLength |
| `frontend/src/features/tenants/components/empresa-form.tsx` | Create | Form presentacional react-hook-form |
| `frontend/src/features/tenants/pages/empresa-page.tsx` | Create | Page contenedora (header §13.1) |
| `frontend/src/routes/router.tsx` | Modify | Ruta `/settings/empresa` con `RequirePermission` |
| `frontend/src/components/nav-items.ts` | Modify | Nav-item "Datos de la empresa" |
| `frontend/src/lib/permissions.ts` | Modify | Agregar `configuracion: { read, update }` a `PERMISSIONS.organizacion` (NO existe hoy) |

## Interfaces / Contracts

```prisma
// Organization — datos fiscales para cabecera de informes (RND 10-0025-14).
razonSocial         String?  // nombre legal; `name` queda como display/comercial
nit                 String?
direccion           String?
representanteLegal   String?
telefono            String?
email               String?
```

```typescript
// update-tenant.dto.ts (añadidos)
@ApiPropertyOptional({ maxLength: 200 })
@IsOptional() @IsString() @MaxLength(200)
razonSocial?: string;

// RND 10-0025-14: el NIT tiene entre 7 y 12 dígitos numéricos.
@ApiPropertyOptional({ example: '1234567', pattern: '^\\d{7,12}$' })
@IsOptional() @Matches(/^\d{7,12}$/, { message: 'NIT inválido: debe tener entre 7 y 12 dígitos' })
nit?: string;
// direccion(@MaxLength 300), representanteLegal(200), telefono(30), email(@IsEmail) análogos
```

```typescript
// empresa-form-schema.ts (zod espejo, mensajes en español)
nit: z.string().regex(/^\d{7,12}$/, 'El NIT debe tener entre 7 y 12 dígitos').optional().or(z.literal('')),
email: z.string().email('Email inválido').optional().or(z.literal('')),
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit (service `.spec.ts`) | `update` persiste campos nuevos; `tipoEmpresaPrincipal` inmutable intacto | Mock `TenantRepositoryPort` |
| Integration (`prisma-tenant.repository.integration.spec.ts`) | adapter escribe/lee los 6 campos | Postgres real |
| E2E (`tenants.e2e-spec.ts`) | NIT válido → 200; NIT inválido → 400 ES; sin permiso → 403; GET devuelve los 6 | Supertest |
| Vitest (front) | `empresa-form` valida NIT/email, submit deshabilitado con `isPending` (Anti-F-07) | Testing Library |

## Migration / Rollout

Migración **aditiva** ADD COLUMN nullable, sin backfill, sin afectar datos legacy. **§11.6**: abrir `migration.sql` y `grep -E "^DROP (INDEX|EXTENSION|TYPE)"` antes de aplicar; riesgo bajo por ser solo ADD COLUMN, pero el protocolo es obligatorio (Prisma puede meter DROPs de objetos raw SQL al regenerar). Rollback: revert del PR + DROP de las 6 columnas.

## OpenAPI / Contract-drift

Tocar `UpdateTenantDto` rompe el job CI `contract-drift`. En el MISMO PR: `pnpm run openapi:dump` (regenera `backend/openapi.json`) + `pnpm run gen:api-types` (regenera `frontend/src/types/api.generated.ts`), y commitear ambos.

## Open Questions

- Ninguna que bloquee. Nota: `PERMISSIONS.organizacion.configuracion` no existe en el frontend hoy (solo `miembros/roles/features`) — agregarlo es parte del change, no un blocker.
