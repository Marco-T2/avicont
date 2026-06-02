# Design: Panel super-admin v1.1 (miembros + impersonation)

## Technical Approach

Dos slices secuenciales, ambos aditivos y sin migración. **Slice 1** suma un GET org-less
de miembros al `PlatformAdminController` existente (ya tiene `JwtAuthGuard + SuperAdminGuard +
PlatformAuditInterceptor`), reusando `MembershipsReaderPort.findAllByTenant` vía port. **Slice 2**
hace que `POST /admin/impersonate` reciba la **org target explícita** en el body para un SA
org-less, manteniendo intacto el flujo OWNER (org del contexto). El frontend replica el patrón
`api/* + hooks TanStack` del panel y reusa el `ImpersonateDialog` parametrizándolo con la org.

## Architecture Decisions

### Decision: org target del SA viaja en el BODY (`organizationId?`), no en la ruta

| Opción | Tradeoff | Decisión |
|--------|----------|----------|
| `organizationId` opcional en `StartImpersonationDto` | El controller resuelve org: SA → `dto.organizationId`; OWNER → `resolveTenantId(req)`. Retrocompatible (campo opcional, OWNER lo ignora) | **ELEGIDA** |
| Header `X-Tenant-ID` (como el TenantGuard del SA) | El endpoint impersonate NO usa TenantGuard; reusar header acopla a un mecanismo que no aplica acá y es menos explícito en Swagger | Rechazada |
| Endpoint nuevo `/admin/platform/impersonate` | Duplica lógica del service; el service ya soporta cross-tenant (`callerEsSuperAdmin`). Solo falta de dónde sale la org | Rechazada |

**Rationale**: el service `start(adminUserId, organizationId, dto, callerEsSuperAdmin)` ya recibe
`organizationId` como parámetro y ya valida todo lo cross-tenant (no-OWNER, no-self, target miembro
de ESA org, doble auditoría). El único hueco es: el OWNER lo toma de `resolveTenantId(req)` (header/JWT),
pero un SA org-less no tiene tenant activo. Pasarlo en el body es lo más explícito, queda en Swagger,
y no toca el contrato del service.

### Decision: el controller resuelve la org según el caller

```ts
// impersonation.controller.ts — start()
const callerEsSuperAdmin = req.user.isSuperAdmin === true;
const organizationId =
  callerEsSuperAdmin && dto.organizationId !== undefined
    ? dto.organizationId
    : resolveTenantId(req); // OWNER: header/JWT como hoy
return this.service.start(req.user.sub, organizationId, dto, callerEsSuperAdmin);
```

**Rationale**: OWNER no manda `organizationId` → cae en `resolveTenantId(req)` exactamente como hoy
(retrocompatible). SA org-less manda `organizationId` en el body → se usa directo. Las invariantes
(no-OWNER, no-self, target-miembro-de-esa-org, JWT 30min no-refrescable, doble auditoría
`ImpersonationLog` + `platform_audit`) viven en el service y NO se tocan. Si un SA manda
`organizationId` pero NO es miembro, el bypass `callerEsSuperAdmin` ya lo cubre (§5.4: relaja
pertenencia, no el `WHERE organizationId`).

### Decision: flujo de salida del banner — NO requiere cambio de código

| Hecho verificado | Implicación |
|------------------|-------------|
| El JWT del target trae su `activeTenantId` (org real) | Durante impersonation el usuario es un tenant-user normal bajo `DashboardShell` |
| `ImpersonationBanner` se monta SOLO en `DashboardShell` (no en `PlatformShell`) | El banner aparece correctamente en el contexto del target |
| `useEndImpersonation` hace `/auth/refresh` → restaura el token del **admin SA org-less** (refresh cookie nunca tocado) | El SA recupera su JWT sin `activeTenantId` |
| El banner navega a `/` → `IndexRedirect` | `IndexRedirect` ya ramifica: SA sin `activeTenantId` → `<Navigate to="/platform-admin">` |

**Veredicto**: el flujo de salida **funciona como está**. El SA inicia impersonation desde
`/platform-admin/orgs/:id/members`, entra al `DashboardShell` del target (banner visible), y al
"Salir" el refresh restaura su token org-less → `/` → `IndexRedirect` → `/platform-admin`. Cero
ajuste en banner/hook/shell. (Riesgo del proposal §6 "banner asume tenant activo" → descartado.)

### Decision: Slice 1 — org inexistente devuelve 404; el GET queda auditado

**Choice**: si `:id` no existe → 404 vía `OrgsReaderPort` (mismo patrón que `actualizarStatus`).
El service de plataforma valida existencia antes de delegar en `findAllByTenant`. El controller
puebla `req.tenantId = id` para que `PlatformAuditInterceptor` registre `targetOrganizationId`
(idéntico a status/entitlement). **El interceptor audita el GET cross-tenant** (CLAUDE.md §4.2:
toda lectura cross-tenant del SA se audita).

## Data Flow

```
Slice 1 (read members):
  GET /admin/platform/orgs/:id/members
    → JwtAuthGuard → SuperAdminGuard → PlatformAuditInterceptor (req.tenantId=:id)
    → PlatformAdminService.listarMiembros(id)
        → OrgsReaderPort.existe(id)  (404 si no)
        → MembershipsReaderPort.findAllByTenant(id)  ──[port, cross-module]
    → PlatformOrgMemberResponseDto[]

Slice 2 (impersonate from panel):
  members-view → PlatformImpersonateDialog(org, target) → useStartImpersonation
    → POST /admin/impersonate { targetUserId, reason, organizationId }
    → controller: org = dto.organizationId (SA) → service.start(sub, org, dto, true)
    → setToken(impersonationToken) → DashboardShell del target + banner
    → "Salir" → /auth/refresh (token SA) → / → IndexRedirect → /platform-admin
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/platform/platform-admin.controller.ts` | Modify | `GET orgs/:id/members`; puebla `req.tenantId=id` |
| `backend/src/platform/platform-admin.service.ts` | Modify | `listarMiembros(id)`: valida existencia + delega en port |
| `backend/src/platform/dto/platform-org-member-response.dto.ts` | Create | DTO de respuesta de miembro |
| `backend/src/platform/platform.module.ts` | Modify | importa `MembershipsReaderModule` |
| `backend/src/impersonation/dto/start-impersonation.dto.ts` | Modify | `organizationId?: string` (`@IsUUID @IsOptional`) |
| `backend/src/impersonation/impersonation.controller.ts` | Modify | resuelve org SA-vs-OWNER |
| `frontend/src/features/platform-admin/api/get-org-members.ts` | Create | GET miembros de org |
| `frontend/src/features/platform-admin/hooks/use-org-members.ts` | Create | `useQuery(['platform','org-members',id])` |
| `frontend/src/features/platform-admin/pages/org-members-page.tsx` | Create | página de miembros |
| `frontend/src/features/platform-admin/components/platform-impersonate-dialog.tsx` | Create | dialog con org+reason (o reuso parametrizado) |
| `frontend/src/features/impersonation/api/start-impersonation.ts` | Modify | acepta `organizationId?` |
| `frontend/src/features/platform-admin/components/platform-members-table.tsx` | Create | tabla presentacional + acción impersonar |
| `frontend/src/routes/router.tsx` | Modify | ruta `/platform-admin/orgs/:id/members` bajo `PlatformShell` + `RequireSuperAdmin` |
| `frontend/src/types/api.ts` | Modify | `PlatformOrgMember`, `organizationId?` en `StartImpersonationRequest` |

### Decision: ruta `/platform-admin/orgs/:id/members` (no drawer)

**Choice**: ruta dedicada bajo `PlatformShell`. **Alternatives**: drawer desde `orgs-page`.
**Rationale**: el `PlatformShell` es la nav del panel y la fila de orgs ya navega; una ruta es
URL-shareable, soporta deep-link y refresh, y es consistente con el resto del panel (`/orgs`,
`/feature-flags`). El drawer escondería la lista de personas detrás de un click efímero.

## Interfaces / Contracts

```ts
// backend — DTO de respuesta (shape pedido)
export class PlatformOrgMemberResponseDto {
  id!: string;
  userId!: string;
  systemRole!: string | null;
  customRoleId!: string | null;
  customRole!: { id: string; slug: string; name: string } | null;
  deactivatedAt!: string | null; // ISO; FechaContable N/A (es timestamptz auditoría)
  createdAt!: string;            // ISO
  user!: { id: string; email: string; displayName: string | null };
}
// map directo desde MembershipDeTenantParaAdmin (memberships-reader.port.ts:62)

// backend — DTO impersonation (aditivo)
class StartImpersonationDto {
  @IsUUID() targetUserId!: string;
  @IsString() @MinLength(10) reason!: string;
  @IsOptional() @IsUUID() organizationId?: string; // solo SA org-less
}

// service — firma INTACTA (ya recibe organizationId)
start(adminUserId, organizationId, dto, callerEsSuperAdmin): Promise<{impersonationToken, expiresAt, impersonationId}>
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| E2E | `GET orgs/:id/members`: 200 SA, 403 no-SA (test `−`), 404 org inexistente; fila en `platform_audit` | Supertest + AppModule (`test/`) |
| Unit | controller impersonate: SA usa `dto.organizationId`, OWNER usa `resolveTenantId` (retrocompat) | jest mock del service, assert arg `organizationId` |
| E2E | impersonate SA cross-tenant con `organizationId` en body: 201 + token; target OWNER → 403; sin org y SA → 403 (sin tenant) | Supertest |
| Unit (front) | `PlatformMembersTable`: render filas, acción "Impersonar" dispara dialog (gating por fila: no-self, no-OWNER) | Testing Library |
| Unit (front) | `start-impersonation` api manda `organizationId` cuando se pasa | vitest |

TDD §7: tests `+` y `−` por endpoint (no-SA → 403). Idioma español en `describe/it`.

## Migration / Rollout

No migration required. Cada slice es PR squash independiente; Slice 2 depende de Slice 1 (UI).
`git revert` de Slice 2 deja Slice 1 operativo.

## Anti-drift §3.5

- **Completa** §5.6 (impersonation): el "de dónde sale la org target para un SA org-less" no estaba
  formalizado; este diseño lo fija (body `organizationId`), sin alterar ninguna restricción del core
  (no-OWNER, no-self, JWT 30min no-refrescable, doble auditoría). NO contradice ningún invariante.
- **Completa** §4.2: confirma que la lectura cross-tenant de miembros queda auditada
  (`PlatformAuditInterceptor` + `req.tenantId`).

## Open Questions

- Ninguna que bloquee. (Confirmado: banner/salida NO requiere cambio de código.)
