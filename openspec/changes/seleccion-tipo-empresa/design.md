# Design: Selección de Tipo de Empresa

## Technical Approach

Exponer el `tipoEmpresaPrincipal` editable en el form de perfil fiscal (`empresa-form`). El backend de edición ya existe (`PATCH /tenants/current` + guard `TipoEmpresaInmutableError`, `tenants.service.ts:134` — INTACTO). Sólo se añade un flag derivado `tipoEmpresaEditable` en la respuesta de `GET /tenants/current` (reusa `gestionesReader.existeAlgunaGestion`, puerto ya inyectado) y se tipa el endpoint con `@ApiOkResponse`. Frontend: `<Select>` shadcn con las 8 opciones, `disabled` por el flag + tooltip. Sin migración Prisma.

## Architecture Decisions

| Decisión | Opción elegida | Alternativa rechazada | Rationale |
|----------|----------------|----------------------|-----------|
| Dónde derivar `tipoEmpresaEditable` | En `tenants.service.getCurrent`, negando `existeAlgunaGestion` | Endpoint separado `/tenants/current/editable` | Misma data en un round-trip; el form ya consume `GET current`; sin red extra |
| Forma del response DTO | NUEVO `TenantCurrentResponseDto` (clase con `@ApiProperty`) | Decorar la entidad Prisma | Prisma no se decora; el DTO entra al OpenAPI y cierra WARNING-1 §10.10 |
| Renombrar `getCurrent`→nuevo método | `getCurrent` separado de `findById` | Modificar `findById` (lo usan `/:id` y `findBySlug`) | `findById` devuelve `Organization` crudo y lo consumen otros endpoints; no contaminar su shape con el flag |
| Autoridad de inmutabilidad | Backend guard (re-chequea en el service en la TX del PATCH) | Confiar en el `disabled` del select | El `disabled` es UX (§14.7); el candado real es backend. El guard re-lee `existeAlgunaGestion` al hacer PATCH → autoritativo ante carrera |
| Validación de enum frontend | `z.enum` de los 8 valores en el schema | input libre | Single source of truth con `z.infer`; espeja `TipoEmpresa` de `api.ts:466` |

## Data Flow

    GET /tenants/current
      controller.getCurrent ─→ service.getCurrent(tenantId)
                                  ├─ repo.findById(tenantId)            → Organization
                                  └─ gestionesReader.existeAlgunaGestion → bool
                                  └─→ { ...org, tipoEmpresaEditable: !tieneGestion }
      ─→ TenantCurrentResponseDto (con tipoEmpresaPrincipal + tipoEmpresaEditable)

    Frontend empresa-page
      useEmpresa() ─→ getEmpresa() lee tipoEmpresaPrincipal + tipoEmpresaEditable
      EmpresaForm  ─→ <Select> disabled={!tipoEmpresaEditable} + tooltip
      submit ─→ updateEmpresa() PATCH (incluye tipoEmpresaPrincipal)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/tenants/dto/tenant-current-response.dto.ts` | Create | `TenantCurrentResponseDto`: campos de org expuestos hoy (id, name, razonSocial, nit, direccion, representanteLegal, telefono, email, contabilidadEnabled, granjaEnabled, vertical/status según lo que ya devuelve `findById`) + `tipoEmpresaPrincipal` (enum) + `tipoEmpresaEditable: boolean`. Cada campo con `@ApiProperty`/`@ApiPropertyOptional` |
| `backend/src/tenants/tenants.service.ts` | Modify | Nuevo método `getCurrent(tenantId)`: `findById` + `existeAlgunaGestion`, retorna `{ ...org, tipoEmpresaEditable: !tieneGestion }`. `update` INTACTO |
| `backend/src/tenants/tenants.controller.ts` | Modify | `getCurrent` → `this.tenantsService.getCurrent(tenantId)` + `@ApiOkResponse({ type: TenantCurrentResponseDto })` |
| `backend/openapi.json` | Modify | Regenerar (`openapi:dump`) |
| `frontend/src/types/api.generated.ts` | Modify | Regenerar (`gen:api-types`) — MISMO commit (CI contract-drift) |
| `frontend/src/features/tenants/api/get-empresa.ts` | Modify | `EmpresaPerfil` += `tipoEmpresaPrincipal: TipoEmpresa` + `tipoEmpresaEditable: boolean`; extraerlos del response |
| `frontend/src/features/tenants/schemas/empresa-form-schema.ts` | Modify | `tipoEmpresaPrincipal: z.enum([...8 valores])` |
| `frontend/src/features/tenants/api/update-empresa.ts` | Modify | Incluir `tipoEmpresaPrincipal` en el payload PATCH |
| `frontend/src/features/tenants/components/empresa-form.tsx` | Modify | `<Select>` con 8 opciones + `defaultValues` + `disabled`/tooltip; nueva prop `tipoEmpresaEditable: boolean` |
| `frontend/src/features/tenants/pages/empresa-page.tsx` | Modify | Pasar `tipoEmpresaPrincipal`/`tipoEmpresaEditable` a defaults y prop |

## Interfaces / Contracts

```ts
// tenant-current-response.dto.ts (backend)
export class TenantCurrentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ type: String, nullable: true }) razonSocial!: string | null;
  // ... nit, direccion, representanteLegal, telefono, email (todos nullable)
  // + flags de módulo que findById ya devuelve hoy
  @ApiPropertyOptional({ enum: [...8 valores] }) tipoEmpresaPrincipal?: TipoEmpresa;
  @ApiProperty({ description: 'false si ya existe una gestión fiscal' })
  tipoEmpresaEditable!: boolean;
}
```

Etiquetas es-BO para el `<Select>` (constante en `empresa-form.tsx`): Comercial, Servicios, Transporte, Industrial, Petrolera, Construcción, Agropecuaria, Minera.

Error code ya estable si se bypasea el disabled: `TENANT_EMPRESA_INMUTABLE` (409) → mensaje friendly vía `backendErrorMessage` (ya en uso en `empresa-page.tsx`).

## Testing Strategy (Strict TDD)

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (service) | `getCurrent` deriva `tipoEmpresaEditable = !existeAlgunaGestion` (true sin gestión, false con gestión); `update` sigue lanzando `TipoEmpresaInmutableError` con gestión | Mock de `gestionesReader` + `repo` (NO Prisma, §7.8) |
| E2E | `GET /tenants/current` incluye `tipoEmpresaEditable`; `PATCH` cambia el tipo sin gestión (200) y lo rechaza con gestión (409 `TENANT_EMPRESA_INMUTABLE`) | Supertest + AppModule (`test/`) |
| Component (front) | Select renderiza 8 opciones; disabled + tooltip cuando `tipoEmpresaEditable=false`; submit disabled mientras `isPending` (Anti-F-07); el valor seleccionado llega al `onSubmit` | Testing Library + user-event; query por rol/label |
| Schema (front) | `z.enum` acepta los 8 valores, rechaza otros | Test directo del schema |

NO Prisma migration. Regenerar OpenAPI artefactos en el mismo commit (CI `contract-drift`).

## Migration / Rollout

No migration. `git revert` del PR squash deja BD y backend de edición intactos.

## Open Questions

- [ ] Confirmar qué campos exactos devuelve `findById` HOY (Organization) para que `TenantCurrentResponseDto` espeje el shape actual sin omitir campos que el frontend ya consume — resolver leyendo el modelo `Organization` en apply (no bloquea el diseño; el flag y `tipoEmpresaPrincipal` son aditivos).
