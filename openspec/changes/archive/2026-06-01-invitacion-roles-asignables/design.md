# Design: Roles asignables al invitar miembros (fix BUG #2)

## Technical Approach

Nuevo endpoint de LECTURA en el módulo `memberships` que devuelve los **roles asignables** de la org activa (system + custom), gateado por `organizacion.miembros.invite`. El `<Select>` del `invite-member-dialog.tsx` se cablea a un hook nuevo que lo consume. La lectura de `CustomRole` cruza frontera de módulo vía el `CustomRolesReaderPort` existente (custom-roles es dueño), al que se le agrega un método `listarAsignablesPorOrg`. El service compone `[system roles] + [custom roles]` pasando por un seam `filtrarPorVerticalYPacks(...)` que hoy es no-op.

## Architecture Decisions

| Decisión | Opciones | Elección + rationale |
|---|---|---|
| Módulo dueño | `invitations` / `memberships` / `custom-roles` | **`memberships`** — reutilizable para invitar HOY y cambiar rol de un miembro MAÑANA. Ya tiene controller (`memberships.controller.ts:16`) e importa `CustomRolesModule` (`memberships.module.ts:22`). |
| URL | `/api/miembros/...` / `/api/memberships/...` | **`GET /api/memberships/roles-asignables`** — el controller real usa base path inglés `memberships` (`memberships.controller.ts:16`); renombrarlo a español es fuera de scope. Subrecurso en español de dominio. (Ver R3.) |
| Gating | `organizacion.miembros.invite` / `roles.read` | **`organizacion.miembros.invite`** (clave del catálogo `catalogo.ts:69`). NO acopla scopes (§4). El `invite` real del controller usa `users.invite` (`:23`, legacy inconsistente) — usamos la clave canónica del catálogo, espejo del invitations.controller (`:80`). |
| Leer custom roles cross-módulo | nuevo port / método al `CustomRolesReaderPort` existente | **Agregar `listarAsignablesPorOrg(orgId)` a `CustomRolesReaderPort`** (`custom-roles-reader.port.ts:14`) — ya es el port cross-módulo que consume memberships (`belongsToTenant`). El adapter (`prisma-custom-roles-reader.adapter.ts`) lo implementa con `findMany({ where: { organizationId } })`. custom-roles registra el adapter (`custom-roles.module.ts:25`). |
| OWNER-only | filtrar siempre / según solicitante | **OWNER aparece SOLO si el solicitante es OWNER.** Espejo en lectura del enforcement de `InvitationsService.create` (`invitations.service.ts:69-77`) que ya rechaza vía `InvitacionAsignacionOwnerNoPermitidaError`. Defense in depth. |
| Determinar OWNER | — | `rbacService.resolverPermisosConContexto(userId, orgId)` → `{ permissions, isOwner }` (`rbac.service.ts:40-60`). Mismo método del #83. |
| Seam vertical+packs | adapter / service / frontend | **service** (capa de composición). Función privada `filtrarPorVerticalYPacks(roles)` que hoy retorna `roles` tal cual. Hoy solo existe Contabilidad. |

## Data Flow

    invite-member-dialog ──useAssignableRoles()──▶ api/get-assignable-roles
                                                          │ GET /api/memberships/roles-asignables
                                                          ▼
    MembershipsController.rolesAsignables (PermissionsGuard: miembros.invite, @CurrentTenant, @CurrentUser)
                                                          ▼
    MembershipsService.listarRolesAsignables(orgId, userId)
       ├─ rbacService.resolverPermisosConContexto(userId, orgId) → isOwner
       ├─ system roles fijos: ADMIN (+ OWNER solo si isOwner)
       ├─ customRolesReader.listarAsignablesPorOrg(orgId)  ← port, org-filtered
       └─ filtrarPorVerticalYPacks([...]) (no-op hoy)  →  AssignableRoleDto[]

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/src/custom-roles/ports/custom-roles-reader.port.ts` | Modify | + `abstract listarAsignablesPorOrg(orgId): Promise<{id;name;slug}[]>` |
| `backend/src/custom-roles/adapters/prisma-custom-roles-reader.adapter.ts` | Modify | implementar con `findMany({ where:{ organizationId } , select:{id,name,slug}, orderBy:{name:'asc'} })` |
| `backend/src/memberships/dto/assignable-role.dto.ts` | Create | `AssignableRoleDto { id; name; kind:'system'\|'custom'; description?: string }` |
| `backend/src/memberships/memberships.service.ts` | Modify | + `listarRolesAsignables(orgId, userId)` + seam privado `filtrarPorVerticalYPacks` |
| `backend/src/memberships/memberships.controller.ts` | Modify | + `GET roles-asignables` (`@RequirePermissions('organizacion.miembros.invite')`, `@CurrentTenant`, `@CurrentUser`) |
| `backend/test/memberships-roles-asignables.e2e-spec.ts` | Create | integración del endpoint (ver Testing) |
| `frontend/src/types/api.ts` | Modify | + `AssignableRole { id; name; kind:'system'\|'custom'; description?:string }` |
| `frontend/src/features/memberships/api/get-assignable-roles.ts` | Create | `GET /api/memberships/roles-asignables` → `AssignableRole[]` |
| `frontend/src/features/memberships/hooks/use-assignable-roles.ts` | Create | `useQuery(['memberships','assignable-roles'], enabled: open)` |
| `frontend/src/features/memberships/components/invite-member-dialog.tsx` | Modify | select dinámico 2 grupos; remover placeholder `:41-43` y copy `:156`; loading/error inline (Anti-F-13) |
| `frontend/src/features/memberships/components/invite-member-dialog.test.tsx` | Create | component test (ver Testing) |

## Interfaces / Contracts

```ts
// backend — assignable-role.dto.ts
export interface AssignableRoleDto {
  id: string;            // system: 'ADMIN'|'OWNER'; custom: uuid
  name: string;          // 'Admin' | 'Owner' | CustomRole.name
  kind: 'system' | 'custom';
  description?: string;  // copy de los system roles (hoy hardcodeado en el dialog)
}
// Respuesta: AssignableRoleDto[]  (system primero, luego custom)
```

```ts
// frontend mapeo selección → schema Zod (invite-form-schema.ts, sin cambios):
// kind==='system' → roleKind:'system', systemRole: id ('ADMIN'|'OWNER')
// kind==='custom' → roleKind:'custom', customRoleId: id (uuid)
```

El `value` del `<SelectItem>` codifica `${kind}:${id}`; el `onValueChange` parsea y setea `roleKind` + (`systemRole` | `customRoleId`). El `onSubmit` existente (`:69-79`) ya arma el body correcto.

## Testing Strategy

| Layer | Qué | Cómo |
|---|---|---|
| Integration (back) | endpoint devuelve system+custom del tenant A; nunca custom del tenant B; OWNER omitido si solicitante NO es OWNER y presente si lo es; 403 sin `miembros.invite` | e2e Supertest + Postgres real, dos tenants + custom roles distintos |
| Component (front) | custom roles del tenant aparecen en el select; elegir uno manda `customRoleId` y NO `systemRole`; OWNER no aparece cuando el hook no lo devuelve | Testing Library + user-event, hook mockeado |

## Migration / Rollout

No migration required. Sin cambios de schema. Endpoint nuevo aditivo; `GET /api/custom-roles` y su gating quedan intactos.

## Open Questions

- [ ] Ninguna bloqueante. Decisiones de política (OWNER-only, gating, módulo dueño) ya cerradas por Marco.
