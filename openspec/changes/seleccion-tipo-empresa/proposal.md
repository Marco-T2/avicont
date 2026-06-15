# Proposal: Selección de Tipo de Empresa

## Intent

El tipo de empresa (Ley 843 art. 46) determina el `mesInicio` de la gestión fiscal, que deriva los 12 períodos, base del futuro cierre de gestión. Hoy ese vínculo está muerto: **toda org nace COMERCIAL y nadie puede cambiarlo desde la UI**. El backend ya soporta la edición (`PATCH /tenants/current` con guard de inmutabilidad); falta exponerlo en el formulario de perfil de empresa. Es el cimiento fundacional para los períodos y el cierre.

## Scope

### In Scope
- `<Select>` de `tipoEmpresaPrincipal` (8 valores del enum) en el form de perfil de empresa (`empresa-form`).
- Select **deshabilitado con tooltip explicativo** cuando ya existe una gestión (refleja la inmutabilidad backend, gating UX no seguridad).
- Flag derivado `tipoEmpresaEditable` (o equivalente) en la respuesta de `GET /tenants/current` para que el frontend sepa si bloquear el select.
- `@ApiOkResponse` tipado en `GET /tenants/current` (lo exige el flag nuevo + cierra WARNING-1 §10.10) → regenerar `openapi.json` + `api.generated.ts`.

### Out of Scope
- Exponer `tipoEmpresaPrincipal` en `CreateTenantDto` (creación de org en platform-admin) → follow-up.
- `tiposEmpresaActivos[]` (para seed PUCT) → no se toca.
- Consumir `calcularMesCierre()` (hoy unused) → será del cierre de gestión, no de aquí.
- Refactor de duplicación de meses en `derivar-rango-gestion.ts` → deuda menor, separada.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `datos-empresa`: el perfil fiscal de la organización ahora permite **elegir** `tipoEmpresaPrincipal` (antes solo lectura); la respuesta GET incluye un flag de editabilidad derivado de la existencia de gestiones.

## Approach

1. **Backend (mínimo)**: agregar al response de `getCurrent` el flag `tipoEmpresaEditable`, derivado de `GestionesReaderPort.existeAlgunaGestion` (puerto YA inyectado en `tenants.service`). Decorar el endpoint con DTO de respuesta tipado. Edición ya funciona vía `UpdateTenantDto` + guard `TipoEmpresaInmutableError` — no se toca.
2. **Frontend**: añadir `tipoEmpresaPrincipal` al `empresa-form-schema` (zod enum), renderizar `<Select>` con las 8 opciones en `empresa-form`, `disabled` cuando `!tipoEmpresaEditable` + tooltip. Submit `disabled={mutation.isPending}` (Anti-F-07).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/tenants/tenants.controller.ts` | Modified | `@ApiOkResponse(TenantResponseDto)` en `getCurrent` |
| `backend/src/tenants/tenants.service.ts` | Modified | `getCurrent` agrega `tipoEmpresaEditable` (reusa `existeAlgunaGestion`) |
| `backend/src/tenants/dto/` | New | `TenantResponseDto` con el flag |
| `backend/openapi.json` + `frontend/src/types/api.generated.ts` | Modified | Regenerar (contract-drift) |
| `frontend/.../empresa-form-schema.ts`, `empresa-form.tsx`, `empresa-page.tsx` | Modified | Select + gating por flag |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Drift OpenAPI rompe CI | Med | Regenerar ambos artefactos en el mismo commit |
| Usuario espera editar tras crear gestión | Low | Tooltip explícito; inmutabilidad es regla de dominio |

## Rollback Plan

`git revert` del PR (squash). Sin migración → BD intacta. El flag y el select desaparecen; el backend de edición preexistente sigue funcionando.

## Dependencies

- Ninguna externa. `GestionesReaderPort` ya inyectado en `tenants`. **Sin migración Prisma** (modelo ya existe: `schema.prisma:164`).

## Success Criteria

- [ ] Owner sin gestión puede elegir el tipo de empresa y se persiste.
- [ ] Con gestión existente el select aparece deshabilitado con tooltip (no oculto).
- [ ] El backend rechaza el cambio post-gestión (`TipoEmpresaInmutableError`, ya cubierto).
- [ ] CI `contract-drift` verde tras regenerar tipos.
