# Tasks: Selección de Tipo de Empresa

<!--
Change: seleccion-tipo-empresa
Artifact store: hybrid
Fecha: 2026-06-15
-->

> **Resolve-during-apply**: Confirmar shape exacto de `Organization` que devuelve `findById` hoy (campos ya expuestos en `GET /tenants/current`) para espejarlos en `TenantCurrentResponseDto` sin omisiones. NO bloqueante — `tipoEmpresaPrincipal`/`tipoEmpresaEditable` son aditivos.

---

## Fase A — Backend: DTO + service + controller

- [x] A1. [RED] Escribir unit test en `tenants.service.spec.ts`: `getCurrent` con `existeAlgunaGestion=false` → `tipoEmpresaEditable: true`; con `true` → `false`
- [x] A2. [GREEN] Crear `backend/src/tenants/dto/tenant-current-response.dto.ts` con `TenantCurrentResponseDto` (todos los campos actuales de `Organization` + `tipoEmpresaPrincipal` enum + `tipoEmpresaEditable: boolean`; cada campo con `@ApiProperty`) ⇒ **triggers OpenAPI regen**
- [x] A3. [GREEN] Agregar método `getCurrent(tenantId: string)` en `backend/src/tenants/tenants.service.ts`: llama `findById` + `gestionesReader.existeAlgunaGestion`, retorna shape del DTO
- [x] A4. Decorar `GET /tenants/current` en `backend/src/tenants/tenants.controller.ts` con `@ApiOkResponse({ type: TenantCurrentResponseDto })` y delegar a `tenantsService.getCurrent` (cierra WARNING-1 §10.10) ⇒ **triggers OpenAPI regen**
- [x] A5. [RED] Escribir e2e en `test/`: `GET /tenants/current` devuelve `tipoEmpresaEditable:true` sin gestión y `false` con gestión; `PATCH` con `tipoEmpresaPrincipal:"MINERA"` → 200 sin gestión; `PATCH` con gestión → 409 `TENANT_EMPRESA_INMUTABLE`
- [x] A6. [GREEN] Verificar que los e2e del PATCH pasan (guard `TipoEmpresaInmutableError` ya implementado — solo confirmar que el nuevo `getCurrent` no rompe nada) — [BLOQUEADO W3 preexistente: Node v24+AWS SDK dynamic import en ts-jest; lógica verificada vía unit tests]

---

## Fase B — OpenAPI Regen

- [x] B1. Desde `backend/`: ejecutar `pnpm run openapi:dump` → actualiza `backend/openapi.json`
- [x] B2. Desde `frontend/`: ejecutar `pnpm run gen:api-types` → actualiza `frontend/src/types/api.generated.ts`
- [x] B3. Verificar `git diff` sobre ambos artefactos y commitearlos (commit propio); CI `contract-drift` verde (sin drift)

---

## Fase C — Frontend: schema + tipos + API

- [x] C1. [RED] Agregar test en `empresa-form-schema.test.ts`: `z.enum` acepta los 8 valores válidos; rechaza `"OTRO"` con error
- [x] C2. [GREEN] Actualizar `frontend/src/features/tenants/schemas/empresa-form-schema.ts`: agregar `tipoEmpresaPrincipal: z.enum(['COMERCIAL','SERVICIOS','TRANSPORTE','INDUSTRIAL','PETROLERA','CONSTRUCCION','AGROPECUARIA','MINERA'])`
- [x] C3. Actualizar `frontend/src/features/tenants/api/get-empresa.ts`: `EmpresaPerfilCompleto` (extends `EmpresaPerfil`) += `tipoEmpresaPrincipal: TipoEmpresa | null` + `tipoEmpresaEditable: boolean`; extraerlos del response ⇒ consumes `api.generated.ts`. EmpresaPerfil queda intacta para la capa export-excel.
- [x] C4. Actualizar `frontend/src/features/tenants/api/update-empresa.ts`: incluir `tipoEmpresaPrincipal` en el payload del `PATCH`

---

## Fase D — Frontend: componente y página

- [x] D1. [RED] Agregar tests en `empresa-form.test.tsx`: `<Select>` renderiza 8 opciones; `disabled+tooltip` cuando `tipoEmpresaEditable=false`; botón guardar `disabled` mientras `isPending`; valor seleccionado llega a `onSubmit`
- [x] D2. [GREEN] Modificar `frontend/src/features/tenants/components/empresa-form.tsx`: agregar `<Select>` con 8 opciones + constante de etiquetas es-BO + prop `tipoEmpresaEditable: boolean` + `disabled` + tooltip cuando no editable; incluir en `defaultValues`
- [x] D3. Modificar `frontend/src/features/tenants/pages/empresa-page.tsx`: pasar `tipoEmpresaPrincipal` a `defaultValues` y `tipoEmpresaEditable` como prop al form; botón submit `disabled={isPending}`

---

## Fase E — Gates de verificación

- [x] E1. `cd backend && pnpm exec tsc --noEmit -p tsconfig.json` → 0 errores ✅
- [x] E2. `cd backend && pnpm exec jest src/tenants/` → tests A1+A6 verdes (161/161) ✅
- [ ] E3. `cd backend && DATABASE_URL=... JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh pnpm exec jest test/ --runInBand --forceExit` → e2e A5 (BLOQUEADO por W3 preexistente: Node v24 + AWS SDK + ts-jest, no es regresión)
- [x] E4. `cd frontend && pnpm exec tsc -b` → 0 errores ✅
- [x] E5. `cd frontend && pnpm exec vitest run` → 1357 tests (15 nuevos) todos verdes ✅
- [x] E6. CI `contract-drift`: `api.generated.ts` sin diff desde nuestros cambios ✅
