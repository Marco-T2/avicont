# Tasks — `platform-admin-v1.1`

Fase: **sdd-tasks** · Change: `platform-admin-v1.1` · Proyecto: avicont · Fecha: 2026-06-02

> Checklist TDD estricto: test RED primero, luego impl GREEN. Dos slices = dos PRs squash independientes.
> Slice 2 depende del Slice 1 (UI de miembros). Sin Co-Authored-By. Un scope de commit por slice.
>
> - Backend desde `backend/`. Frontend desde `frontend/`.
> - Backend e2e: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/<archivo> --runInBand --forceExit`.
> - Frontend typecheck: `pnpm exec tsc -b` (NO `--noEmit`). Tests: `pnpm exec vitest run <path>`.

---

## SLICE 1 — Miembros cross-tenant (full-stack, fundacional)

Branch: `feat/platform-admin-v1.1-members`
Scope de commit: `feat(platform): GET orgs/:id/members cross-tenant + UI miembros`
REQ cubiertos: REQ-PM-01, REQ-PM-02, REQ-PAUI-11

### Backend — `GET /admin/platform/orgs/:id/members` (TDD)

- [x] **S1-B1 [test]** Crear `backend/test/platform-members.e2e-spec.ts` con los 5 casos de REQ-PM-01:
  - `'[+] SA lista miembros de org existente → 200 con array (activos + desactivados)'` — verificar shape completa del DTO.
  - `'[+] fila en platform_audit con targetOrganizationId = org.id'` — verificar tabla `platform_audit` post-request.
  - `'[-] org inexistente → 404 PLATFORM_ORG_NO_ENCONTRADA'`.
  - `'[-] usuario OWNER sin isSuperAdmin → 403'`.
  - `'[-] sin token → 401'`.
  - Ejecutar: fallan (rojo) → avanzar a S1-B2+.

- [x] **S1-B2 [impl]** Crear `backend/src/platform/dto/platform-org-member-response.dto.ts`:
  - Shape: `id`, `userId`, `systemRole: string | null`, `customRoleId: string | null`, `customRole: { id, slug, name } | null`, `deactivatedAt: string | null`, `createdAt: string`, `user: { id, email, displayName: string | null }`.
  - Mapeo directo desde `MembershipDeTenantParaAdmin` (ya existe en `memberships-reader.port.ts:62`).

- [x] **S1-B3 [impl]** En `backend/src/platform/platform-admin.service.ts`:
  - Agregar método `listarMiembros(orgId: string): Promise<PlatformOrgMemberResponseDto[]>`.
  - Valida existencia org vía `OrgsReaderPort.findById(orgId)` → lanza `PLATFORM_ORG_NO_ENCONTRADA` si null.
  - Delega en `MembershipsReaderPort.findAllByTenant(orgId)` y mapea al DTO.

- [x] **S1-B4 [impl]** En `backend/src/platform/platform-admin.controller.ts`:
  - Agregar `@Get('orgs/:id/members')` handler.
  - Puebla `req.tenantId = id` ANTES de que `PlatformAuditInterceptor` capture (mismo patrón que `actualizarStatus`).
  - Delega en `PlatformAdminService.listarMiembros(id)`.

- [x] **S1-B5 [impl]** En `backend/src/platform/platform.module.ts`:
  - Importar `MembershipsReaderModule` (o el módulo que exporta `MembershipsReaderPort`).

- [x] **S1-B6 [chore]** Verificar verde backend:
  ```bash
  cd backend && pnpm exec tsc --noEmit -p tsconfig.json && pnpm run lint
  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/platform-members.e2e-spec.ts --runInBand --forceExit
  ```

### Frontend — tipos + api + hook + página (TDD)

- [x] **S1-F1 [impl]** En `frontend/src/types/api.ts`:
  - Agregar `PlatformOrgMember` con la shape completa del DTO backend.
  - Comentario: `// Espeja backend platform-org-member-response.dto.ts`.

- [x] **S1-F2 [impl]** Crear `frontend/src/features/platform-admin/api/get-org-members.ts`:
  - `GET /admin/platform/orgs/:id/members` → `PlatformOrgMember[]`.

- [x] **S1-F3 [test]** Test primero: `frontend/src/features/platform-admin/hooks/use-org-members.test.ts`:
  - Mock `get-org-members`: data → array de miembros; loading → `isLoading: true`; error → `isError: true`.
  - Ejecutar: fallan (rojo) → avanzar a S1-F4.

- [x] **S1-F4 [impl]** Crear `frontend/src/features/platform-admin/hooks/use-org-members.ts`:
  - `useQuery({ queryKey: ['platform', 'org-members', id], queryFn: () => getOrgMembers(id) })`.

- [x] **S1-F5 [test]** Test primero: `frontend/src/features/platform-admin/pages/org-members-page.test.tsx`:
  - Mock `use-org-members`: tabla con filas (email, displayName, systemRole, customRole, estado, createdAt); miembro desactivado distinguible visualmente; loading → skeleton; empty state `'No hay miembros'`; error → mensaje español. Responde REQ-PM-02 escenarios.
  - Ejecutar: fallan (rojo) → avanzar a S1-F6.

- [x] **S1-F6 [impl]** Crear `frontend/src/features/platform-admin/pages/org-members-page.tsx`:
  - Consume `useOrgMembers(id)`. Tabla `ui/table`. Columnas: email, displayName, systemRole, customRole, estado (activo/desactivado), createdAt. States: skeleton / empty / error.

- [x] **S1-F7 [impl]** En `frontend/src/routes/router.tsx`:
  - Agregar ruta `/platform-admin/orgs/:id/members` bajo `PlatformShell` + `<RequireSuperAdmin>`, apuntando a `OrgMembersPage`.

- [x] **S1-F8 [impl]** En la tabla de la `OrgsPage` (`pages/orgs-page.tsx`):
  - Agregar enlace/botón por fila que navega a `/platform-admin/orgs/{id}/members`. Responde REQ-PAUI-11.

- [x] **S1-F9 [chore]** Verificar verde frontend:
  ```bash
  cd frontend && pnpm exec tsc -b && pnpm run lint
  pnpm exec vitest run src/features/platform-admin
  ```

### Cierre Slice 1

- [x] **S1-C1 [chore]** Regresión backend completa: `pnpm exec jest test/ --runInBand --forceExit` (con env vars).
- [ ] **S1-C2 [chore]** Commit `feat(platform): GET orgs/:id/members cross-tenant + UI miembros` + PR Slice 1.

---

## SLICE 2 — Impersonation desde el panel (sensible a seguridad)

Branch: `feat/platform-admin-v1.1-impersonation`
Scope de commit: `feat(impersonation): SA cross-tenant via organizationId body + panel UI`
REQ cubiertos: REQ-SA-17 (delta), REQ-PAUI-12, REQ-PAUI-13, REQ-PAUI-14

### Backend — `organizationId?` en `StartImpersonationDto` (TDD)

- [x] **S2-B1 [test]** En `backend/test/impersonation.e2e-spec.ts` (extender), agregar describe `'REQ-SA-17 delta: SA org-less impersonation con organizationId'`:
  - `'[+] SA envía organizationId → 201 + impersonationToken; token NO contiene isSuperAdmin'`.
  - `'[+] fila en platform_audit y en ImpersonationLog'`.
  - `'[-] SA sin organizationId y sin tenant activo → 403 "Se requiere contexto de organización"'`.
  - `'[-] SA intenta impersonar a OWNER de org ajena → IMPERSONATION_TARGET_ES_OWNER'`.
  - `'[-] SA con organizationId pero target no es miembro de esa org → IMPERSONATION_TARGET_NO_MIEMBRO'`.
  - `'[-] SA intenta impersonarse a sí mismo → IMPERSONATION_SELF_NO_PERMITIDA'`.
  - `'[regresión] OWNER sin organizationId → 201 exactamente como antes (retrocompat)'`.
  - `'[-] OWNER envía organizationId de otra org → ignorado; resolveTenantId usa contexto propio'`.
  - Ejecutar: fallan (rojo) → avanzar a S2-B2+.

- [x] **S2-B2 [test]** Unitario: en `backend/src/impersonation/impersonation.controller.spec.ts` (nuevo o extender):
  - `'SA + dto.organizationId → service.start recibe dto.organizationId como organizationId arg'`.
  - `'OWNER sin dto.organizationId → service.start recibe resolveTenantId(req)'`.
  - Mockear service. Ejecutar: fallan (rojo) → avanzar a S2-B3.

- [x] **S2-B3 [impl]** En `backend/src/impersonation/dto/start-impersonation.dto.ts`:
  - Agregar `@IsOptional() @IsUUID() organizationId?: string`. Sin romper DTO existente.

- [x] **S2-B4 [impl]** En `backend/src/impersonation/impersonation.controller.ts` (handler `start`):
  - Resolver `organizationId` según caller:
    ```ts
    const callerEsSuperAdmin = req.user.isSuperAdmin === true;
    const organizationId =
      callerEsSuperAdmin && dto.organizationId !== undefined
        ? dto.organizationId
        : resolveTenantId(req);
    return this.service.start(req.user.sub, organizationId, dto, callerEsSuperAdmin);
    ```
  - El service NO cambia de firma (ya recibe `organizationId` y `callerEsSuperAdmin`).

- [x] **S2-B5 [chore]** Verificar verde backend:
  ```bash
  cd backend && pnpm exec tsc --noEmit -p tsconfig.json && pnpm run lint
  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/impersonation.e2e-spec.ts --runInBand --forceExit
  ```

### Frontend — api + dialog + botón por miembro (TDD)

- [x] **S2-F1 [impl]** En `frontend/src/types/api.ts`:
  - Agregar `organizationId?` a `StartImpersonationRequest`. Spread condicional en uso (`exactOptionalPropertyTypes`).

- [x] **S2-F2 [test]** Test primero: `frontend/src/features/impersonation/api/start-impersonation.test.ts`:
  - Con `organizationId` → body incluye el campo; sin `organizationId` → body NO incluye el campo.
  - Ejecutar: fallan (rojo) → avanzar a S2-F3.

- [x] **S2-F3 [impl]** En `frontend/src/features/impersonation/api/start-impersonation.ts`:
  - Aceptar `organizationId?` en el request; spread condicional para omitir si undefined.

- [x] **S2-F4 [test]** Test primero: `frontend/src/features/platform-admin/components/platform-impersonate-dialog.test.tsx` (REQ-PAUI-13):
  - Renderiza con targetUser + orgId; reason vacío → botón disabled; reason < 10 chars → error validación, no llama backend; reason válido + confirm → llama mutation con `{ targetUserId, reason, organizationId }`; `isPending` → botón disabled; error backend → toast.error + dialog abierto; éxito → setToken + navegación.
  - Ejecutar: fallan (rojo) → avanzar a S2-F5.

- [x] **S2-F5 [impl]** Crear `frontend/src/features/platform-admin/components/platform-impersonate-dialog.tsx`:
  - Props: `open`, `onOpenChange`, `targetUser: { id, email, displayName }`, `orgId: string`.
  - Campo `reason` (mínimo 10 chars, validación cliente). Botón confirm deshabilitado con `isPending` o `reason < 10`.
  - Al éxito: `setToken(impersonationToken)` + `navigate('/')` (IndexRedirect lleva a DashboardShell del target).
  - Al error: `toast.error` con mensaje del backend; dialog permanece abierto.

- [x] **S2-F6 [test]** Test primero: `frontend/src/features/platform-admin/components/platform-members-table.test.tsx` (REQ-PAUI-12):
  - Miembro regular → botón "Impersonar" habilitado; OWNER (`systemRole === 'OWNER'`) → botón ausente/disabled; SA mismo (`userId === currentUser.sub`) → botón ausente/disabled; click botón → abre `PlatformImpersonateDialog`.
  - Ejecutar: fallan (rojo) → avanzar a S2-F7.

- [x] **S2-F7 [impl]** Crear `frontend/src/features/platform-admin/components/platform-members-table.tsx`:
  - Tabla presentacional. Botón "Impersonar" por fila con gating (no-OWNER, no-self). Abre `PlatformImpersonateDialog` con org y target.

- [x] **S2-F8 [impl]** En `frontend/src/features/platform-admin/pages/org-members-page.tsx`:
  - Reemplazar tabla standalone por `<PlatformMembersTable>` con el botón de impersonar integrado.

- [x] **S2-F9 [chore]** Verificar verde frontend:
  ```bash
  cd frontend && pnpm exec tsc -b && pnpm run lint
  pnpm exec vitest run src/features/platform-admin src/features/impersonation/api/start-impersonation.test.ts
  ```

### Cierre Slice 2

- [x] **S2-C1 [chore]** Regresión backend completa: `pnpm exec jest test/ --runInBand --forceExit` (con env vars). Verificar que todos los e2e existentes de impersonation/platform siguen verdes.
- [x] **S2-C2 [chore]** Regresión frontend completa: `pnpm exec vitest run src/` — 0 regresiones.
- [ ] **S2-C3 [chore]** Commit `feat(impersonation): SA cross-tenant via organizationId body + panel UI` + PR Slice 2.

---

## Notas de implementación

- **TDD**: cada `[test]` va antes de su `[impl]`. No commitear hasta verde.
- **Errores**: no crear `throw new *Exception(...)` nuevos — usar `DomainError` (CLAUDE.md §10.10).
- **ClockPort**: NUNCA `new Date()` en domain/service (CLAUDE.md §4.6).
- **Imports**: `@/` para cross-module; relativos dentro del módulo (CLAUDE.md §3.6).
- **`exactOptionalPropertyTypes`**: spread condicional para campos opcionales — nunca asignar `undefined`.
- **Backend e2e**: siempre `--runInBand --forceExit` con env vars inline (CLAUDE.md §11.3).
- **Auditoría**: `req.tenantId = id` ANTES del interceptor (patrón de `actualizarStatus` — design §3).
- **Flujo de salida**: `ImpersonationBanner` y `useEndImpersonation` NO se modifican (design §3 "flujo intacto"). `IndexRedirect` ya ramifica SA-sin-tenant → `/platform-admin`.
