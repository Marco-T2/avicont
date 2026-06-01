# Tasks — `invitacion-roles-asignables`

<!--
Última edición: 2026-05-31
Owner: backend-lead
-->

> Change: invitacion-roles-asignables
> Fase: tasks
> Specs de referencia: specs/roles-asignables/spec.md (REQ-RA-01..09)
> Design de referencia: design.md (File Changes table + decisiones)
> Cada fase es candidata a un commit o PR atómico.

---

## Resumen de fases

| Fase | Nombre | Tareas | Scope commit |
|------|--------|--------|--------------|
| 1 | Backend — Port + Adapter (custom-roles) | 4 | `refactor(custom-roles): ...` |
| 2 | Backend — DTO + Service + Controller (memberships) | 7 | `feat(memberships): ...` |
| 3 | Backend — Tests e2e endpoint | 3 | (parte del PR de Fase 2) |
| 4 | Frontend — Tipos + API function + Hook | 5 | `feat(memberships-ui): ...` |
| 5 | Frontend — Select dinámico en `invite-member-dialog` | 5 | (parte del PR de Fase 4) |
| 6 | Frontend — Tests de componente | 4 | (parte del PR de Fase 4) |

**Total: 28 tareas**

---

## Gotchas de proyecto (aplicar en las tareas indicadas)

- **G-1** Tests integración/e2e backend: Postgres en `127.0.0.1`, `DATABASE_URL` inline (el sandbox no lee `.env`). Comando base: `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh"`.
- **G-2** Frontend typecheck: `pnpm exec tsc -b` (NO `tsc --noEmit`) — typechequea project refs.
- **G-3** `lint` backend = `eslint src/` (NO cubre `test/`) → lint explícito del e2e solo si se toca código compartido.
- **G-4** Tras edits en archivos EXISTENTES, verificar con `grep` que el cambio quedó.
- **G-5** `describe`/`it` en español en todos los tests.
- **G-6** `RbacService` ya es exportado por `RbacModule` — no requiere re-exportar ni rebindear.
- **G-7** `MembershipsModule` ya importa `CustomRolesModule` (que registra `CUSTOM_ROLES_READER_PORT`) y `RbacModule` (que exporta `RbacService`) — no se necesitan cambios al módulo.
- **G-8** El `TenantContextService` ya inyectado en `MembershipsService` — usar `this.getTenantId()` para `orgId`; `@CurrentUser` para `userId`.
- **G-9** `useWatch` y cualquier hook son funciones → NO inline dentro de JSX; izar a `const` antes del return.

---

## Fase 1 — Backend: Port + Adapter en `custom-roles`

> Commit aislado ANTES del resto. Es un contrato cross-módulo: la Fase 2 depende de este método.
> Scope de commit: `refactor(custom-roles): add listarAsignablesPorOrg to CustomRolesReaderPort`.

**Objetivo**: ampliar `CustomRolesReaderPort` con el método `listarAsignablesPorOrg(orgId)` e implementarlo en el adapter. Sin cambios a la superficie existente (`belongsToTenant` intacta).

---

- [ ] **1.1** RED — Ampliar el test de integración del adapter existente
  - Cubre REQ-RA-04 (filtrado por tenant en la query del adapter)
  - Archivo: `backend/src/custom-roles/adapters/prisma-custom-roles-reader.adapter.integration.spec.ts`
  - Agregar `describe('listarAsignablesPorOrg')`:
    - Dado dos orgs con custom roles distintos → devuelve solo los de la org consultada
    - Dado org sin custom roles → devuelve array vacío
    - Los custom roles se ordenan por `name` ASC
  - **Recordatorio G-1**: requiere `DATABASE_URL` inline; **G-5**: tests en español
  - Ejecutar: `DATABASE_URL="..." pnpm exec jest src/custom-roles/adapters/prisma-custom-roles-reader.adapter.integration.spec.ts --runInBand` → **RED** (método no existe)

- [ ] **1.2** Modificar `CustomRolesReaderPort` — agregar método abstracto
  - Cubre REQ-RA-04 (contrato cross-módulo filtrado por org)
  - Archivo: `backend/src/custom-roles/ports/custom-roles-reader.port.ts`
  - Agregar después de `belongsToTenant`:
    ```ts
    /**
     * Devuelve los custom roles de la organización ordenados por nombre ASC.
     * Filtrado en la query del adapter — nunca post-filtrado en el servicio consumidor.
     */
    abstract listarAsignablesPorOrg(orgId: string): Promise<{ id: string; name: string; slug: string }[]>;
    ```
  - **Recordatorio G-4**: verificar con `grep 'listarAsignablesPorOrg' backend/src/custom-roles/ports/custom-roles-reader.port.ts`

- [ ] **1.3** GREEN — Implementar en `PrismaCustomRolesReaderAdapter`
  - Cubre REQ-RA-04
  - Archivo: `backend/src/custom-roles/adapters/prisma-custom-roles-reader.adapter.ts`
  - Implementación:
    ```ts
    async listarAsignablesPorOrg(orgId: string): Promise<{ id: string; name: string; slug: string }[]> {
      return this.prisma.customRole.findMany({
        where: { organizationId: orgId },
        select: { id: true, name: true, slug: true },
        orderBy: { name: 'asc' },
      });
    }
    ```
  - Ejecutar: `DATABASE_URL="..." pnpm exec jest src/custom-roles/adapters/prisma-custom-roles-reader.adapter.integration.spec.ts --runInBand` → **GREEN**
  - `cd backend && pnpm exec tsc --noEmit -p tsconfig.json` → 0 errores

- [ ] **1.4** Verificación: suite custom-roles + typecheck + lint
  - `cd backend && DATABASE_URL="..." pnpm exec jest src/custom-roles/ --runInBand` → verde (regresión `belongsToTenant` intacta)
  - `cd backend && pnpm run lint` → 0 errores
  - Commit: `refactor(custom-roles): add listarAsignablesPorOrg to CustomRolesReaderPort`

---

## Fase 2 — Backend: DTO + Service + Controller en `memberships`

> Depende de Fase 1 completa. PR atómico: `feat(memberships): GET /memberships/roles-asignables`.

**Objetivo**: crear el DTO de respuesta, implementar `listarRolesAsignables` en el service (con seam `filtrarPorVerticalYPacks`) y exponer el endpoint en el controller.

---

- [ ] **2.1** Crear `AssignableRoleDto`
  - Cubre REQ-RA-01 (shape del DTO)
  - Archivo NUEVO: `backend/src/memberships/dto/assignable-role.dto.ts`
  - Contenido:
    ```ts
    export class AssignableRoleDto {
      id!: string;         // system: 'ADMIN'|'OWNER'; custom: uuid
      name!: string;       // 'Administrador'|'Propietario'|CustomRole.name
      kind!: 'system' | 'custom';
      description?: string;
    }
    ```
  - Sin decoradores class-transformer extra — es un DTO de salida plano

- [ ] **2.2** RED — Tests unitarios de `listarRolesAsignables` en el service
  - Cubre REQ-RA-01, REQ-RA-03, REQ-RA-04, REQ-RA-05
  - Archivo: `backend/src/memberships/memberships.service.spec.ts` — agregar al describe existente
  - `describe('listarRolesAsignables')`:
    - OWNER consulta → respuesta incluye `{ id: 'OWNER', kind: 'system' }` + `{ id: 'ADMIN', kind: 'system' }` + custom roles del tenant
    - ADMIN consulta → respuesta NO incluye `OWNER`, SÍ incluye `ADMIN` y custom roles
    - MEMBER con permiso pero sin ser owner → sin OWNER, con ADMIN y custom roles
    - Orden: system primero, luego custom (ASC por nombre) — REQ-RA-01
    - Custom roles vienen del port con orgId correcto — REQ-RA-04
    - El seam `filtrarPorVerticalYPacks` se llama con la lista completa y devuelve el mismo array (no-op) — REQ-RA-05
  - Mockear: `CustomRolesReaderPort.listarAsignablesPorOrg`, `RbacService.resolverPermisosConContexto`
  - **Recordatorio G-5**: tests en español
  - Ejecutar: `cd backend && pnpm exec jest src/memberships/memberships.service.spec.ts` → **RED**

- [ ] **2.3** GREEN — Implementar `listarRolesAsignables` en `MembershipsService`
  - Cubre REQ-RA-01, REQ-RA-03, REQ-RA-04, REQ-RA-05
  - Archivo: `backend/src/memberships/memberships.service.ts`
  - Inyectar `RbacService` en el constructor (ya disponible vía `RbacModule` importado por `MembershipsModule` — **G-6, G-7**)
  - Implementar método público:
    ```ts
    async listarRolesAsignables(orgId: string, userId: string): Promise<AssignableRoleDto[]> {
      const { isOwner } = await this.rbacService.resolverPermisosConContexto(userId, orgId);
      const systemRoles: AssignableRoleDto[] = [
        ...(isOwner ? [{ id: 'OWNER', name: 'Propietario', kind: 'system' as const, description: 'Control total — puede agregar/quitar owners' }] : []),
        { id: 'ADMIN', name: 'Administrador', kind: 'system' as const, description: 'Todos los permisos excepto transferir ownership' },
      ];
      const rawCustom = await this.customRoles.listarAsignablesPorOrg(orgId);
      const customRoles: AssignableRoleDto[] = rawCustom.map((r) => ({ id: r.id, name: r.name, kind: 'custom' as const }));
      return this.filtrarPorVerticalYPacks([...systemRoles, ...customRoles]);
    }
    ```
  - Agregar método privado no-op (seam REQ-RA-05):
    ```ts
    private filtrarPorVerticalYPacks(roles: AssignableRoleDto[]): AssignableRoleDto[] {
      // Seam para filtro por vertical + packs cuando llegue módulo Granja.
      // Hoy solo existe el vertical Contabilidad — retorna sin filtrar.
      return roles;
    }
    ```
  - Ejecutar: `cd backend && pnpm exec jest src/memberships/memberships.service.spec.ts` → **GREEN**

- [ ] **2.4** Agregar endpoint en `MembershipsController`
  - Cubre REQ-RA-02, REQ-RA-06
  - Archivo: `backend/src/memberships/memberships.controller.ts`
  - Agregar import `Get` de `@nestjs/common` si no está
  - Agregar antes del método `invite`:
    ```ts
    @Get('roles-asignables')
    @UseGuards(PermissionsGuard)
    @RequirePermissions('organizacion.miembros.invite')
    @ApiOperation({ summary: 'Listar roles asignables al invitar un miembro' })
    @ApiResponse({ status: 200, description: 'Lista de roles asignables (system + custom del tenant)' })
    @ApiResponse({ status: 403, description: 'Sin permiso organizacion.miembros.invite' })
    async rolesAsignables(
      @CurrentTenant() orgId: string,
      @CurrentUser() user: { sub: string },
    ): Promise<AssignableRoleDto[]> {
      return this.membershipsService.listarRolesAsignables(orgId, user.sub);
    }
    ```
  - Agregar import de `AssignableRoleDto` desde `./dto/assignable-role.dto`
  - **Recordatorio G-4**: `grep 'roles-asignables' backend/src/memberships/memberships.controller.ts`

- [ ] **2.5** Typecheck backend
  - `cd backend && pnpm exec tsc --noEmit -p tsconfig.json` → 0 errores
  - `cd backend && pnpm run lint` → 0 errores

---

## Fase 3 — Backend: Tests e2e del endpoint

> Se incluye en el mismo PR que la Fase 2.

**Objetivo**: cobertura e2e (Supertest + Postgres real) de todos los escenarios del spec: gating, OWNER-only, multi-tenant, shape de respuesta.

---

- [ ] **3.1** RED — Crear `backend/test/memberships-roles-asignables.e2e-spec.ts`
  - Cubre REQ-RA-01, REQ-RA-02, REQ-RA-03, REQ-RA-04, REQ-RA-06
  - Patrón: seguir `custom-roles.e2e-spec.ts` (bootstrap `AppModule`, `setGlobalPrefix('api')`, `ValidationPipe`, cleanup en `beforeEach`)
  - Setup: dos orgs (`orgA`, `orgB`), cada una con OWNER propio + ADMIN + custom roles distintos; un MEMBER con custom role que incluye `organizacion.miembros.invite`
  - `describe('GET /api/memberships/roles-asignables')` (en español — **G-5**):
    - sin JWT → 401
    - JWT de MEMBER sin `miembros.invite` (solo `SystemRole.MEMBER` sin custom role) → 403
    - JWT de OWNER de orgA → 200, respuesta incluye `{ id: 'OWNER', kind: 'system' }`, `{ id: 'ADMIN', kind: 'system' }`, custom de orgA; NO incluye custom de orgB
    - JWT de ADMIN de orgA → 200, sin OWNER, con ADMIN, custom de orgA; sin cross-tenant
    - JWT de MEMBER con custom role que tiene `organizacion.miembros.invite` → 200, sin OWNER, con ADMIN, con custom roles del tenant
    - orgA sin custom roles (solo system) → 200, solo `ADMIN` (OWNER si es OWNER); array de custom vacío
    - shape de cada ítem: `{ id, name, kind }` con `kind: 'system'|'custom'`; custom tienen `id` UUID
    - orden: system primero, luego custom ASC por nombre (REQ-RA-01 escenario ASC)
  - **Recordatorio G-1**: `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh"` inline
  - Ejecutar: `DATABASE_URL="..." JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/memberships-roles-asignables.e2e-spec.ts --runInBand --forceExit` → **RED**

- [ ] **3.2** GREEN — Verificar que todos los casos pasan
  - Ejecutar el mismo comando → **GREEN** (implementación de Fase 1+2 ya en su lugar)

- [ ] **3.3** Suite e2e completa sin regresiones
  - `DATABASE_URL="..." JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/ --runInBand --forceExit` → todo verde
  - Commit: `feat(memberships): add GET /memberships/roles-asignables endpoint with OWNER-only filter`

---

## Fase 4 — Frontend: Tipos + API function + Hook

> Depende de Fase 2+3 completas (endpoint vivo). PR propio: `feat(memberships-ui): dynamic role select in invite-member-dialog`.

**Objetivo**: el frontend puede consultar roles asignables con un hook TanStack Query habilitado solo cuando el dialog está abierto.

---

- [ ] **4.1** Agregar `AssignableRole` a `frontend/src/types/api.ts`
  - Cubre REQ-RA-07 (tipado de la respuesta)
  - Agregar al final del archivo:
    ```ts
    export interface AssignableRole {
      id: string;
      name: string;
      kind: 'system' | 'custom';
      description?: string;
    }
    ```
  - **Recordatorio G-4**: `grep 'AssignableRole' frontend/src/types/api.ts`

- [ ] **4.2** Crear `frontend/src/features/memberships/api/get-assignable-roles.ts`
  - Cubre REQ-RA-07 (función pura API)
  - Archivo NUEVO — función pura que llama `GET /api/memberships/roles-asignables` y retorna `AssignableRole[]` tipado
  - Seguir patrón de `get-members.ts` del mismo feature (usar `api.get<AssignableRole[]>(...)`)
  - Sin lógica adicional — solo el fetcher

- [ ] **4.3** RED — Tests del hook en `frontend/src/features/memberships/hooks/use-assignable-roles.test.ts`
  - Cubre REQ-RA-07 (hook disabled cuando `open: false`, habilitado cuando `open: true`)
  - Tests en español (**G-5**) con `renderHook` + `QueryClientProvider` wrapper:
    - `describe('useAssignableRoles')`:
      - Con `open: false` → query deshabilitada (no se dispara request)
      - Con `open: true` → query habilitada; `queryKey` incluye `['memberships', 'assignable-roles']`
  - Mockear `getAssignableRoles` con `vi.mock`
  - Ejecutar: `cd frontend && pnpm exec vitest run src/features/memberships/hooks/use-assignable-roles.test.ts` → **RED**

- [ ] **4.4** GREEN — Crear `frontend/src/features/memberships/hooks/use-assignable-roles.ts`
  - Cubre REQ-RA-07
  - Hook con TanStack Query:
    ```ts
    export function useAssignableRoles(open: boolean) {
      return useQuery({
        queryKey: ['memberships', 'assignable-roles'],
        queryFn: getAssignableRoles,
        enabled: open,
      });
    }
    ```
  - Ejecutar: `cd frontend && pnpm exec vitest run src/features/memberships/hooks/use-assignable-roles.test.ts` → **GREEN**
  - `cd frontend && pnpm exec tsc -b` → 0 errores (**G-2**)

- [ ] **4.5** Verificación de tipos y tests del hook
  - `cd frontend && pnpm exec tsc -b` → 0 errores
  - `cd frontend && pnpm exec vitest run src/features/memberships/hooks/` → verde

---

## Fase 5 — Frontend: Select dinámico en `invite-member-dialog`

> Depende de Fase 4 completa. Se incluye en el mismo PR.

**Objetivo**: reemplazar el `<Select>` estático hardcodeado con grupos dinámicos Sistema / Personalizados consumiendo `useAssignableRoles`. Eliminar el placeholder y el copy desactualizado.

---

- [ ] **5.1** Modificar `invite-member-dialog.tsx` — cableado del hook y nuevo `<Select>`
  - Cubre REQ-RA-07, REQ-RA-08, REQ-RA-09
  - Archivo: `frontend/src/features/memberships/components/invite-member-dialog.tsx`
  - Cambios:
    1. Agregar import de `useAssignableRoles` desde `../hooks/use-assignable-roles`
    2. Agregar `SelectGroup`, `SelectLabel` a los imports de shadcn Select
    3. Remover `useWatch` para `systemRole` — ya no controla el select directamente
    4. Agregar en el cuerpo del componente (antes del return — **G-9**):
       ```ts
       const { data: roles = [], isLoading: rolesLoading, isError: rolesError } = useAssignableRoles(open);
       ```
    5. Reemplazar el bloque `<Select>` estático (`:156-175` aprox.) con select dinámico agrupado:
       - `<Select disabled={rolesLoading} onValueChange={...}>` parseando `"${kind}:${id}"` → setea `roleKind` + (`systemRole` | `customRoleId`)
       - `<SelectGroup>` "Sistema" con items `kind === 'system'`
       - `<SelectGroup>` "Personalizados" con items `kind === 'custom'` (si los hay)
       - `<SelectItem value="${kind}:${id}">`nombre del rol`</SelectItem>`
    6. Si `rolesError` → mostrar `<p className="text-xs text-destructive">No se pudieron cargar los roles. Intentá de nuevo.</p>` inline (Anti-F-13 — NO toast fuera de handler)
    7. Remover comentario placeholder (`:41-43`) y la `<p>` "Los roles personalizados llegan en Configuración → Roles" (`:156` aprox.)
    8. Cuando `rolesLoading: true` → `<Select disabled>` + `<SelectTrigger>` muestra "Cargando roles…" o spinner inline; el botón submit también se deshabilita con `disabled={mutation.isPending || rolesLoading}`
  - **Recordatorio G-4**: `grep 'useAssignableRoles' frontend/src/features/memberships/components/invite-member-dialog.tsx`

- [ ] **5.2** Ajustar `defaultValues` del formulario
  - El `defaultValues.systemRole: 'ADMIN'` puede mantenerse como fallback inicial
  - El `value` del `<Select>` inicial debe ser `"system:ADMIN"` (string compuesto) para que el select muestre el ítem correcto al abrir
  - Verificar que el `onValueChange` parsea correctamente: `const [kind, id] = v.split(':')` → `setValue('roleKind', kind)` + (`setValue('systemRole', id)` si `kind === 'system'` | `setValue('customRoleId', id)` si `kind === 'custom'`)

- [ ] **5.3** Typecheck frontend
  - `cd frontend && pnpm exec tsc -b` → 0 errores (**G-2**)

---

## Fase 6 — Frontend: Tests de componente `invite-member-dialog`

> Se incluye en el mismo PR. TDD: los tests van antes que el código de Fase 5 en la práctica del apply, pero aquí la fase se separa para claridad.

**Objetivo**: cobertura de Testing Library de los escenarios de REQ-RA-07..09 en el dialog.

---

- [ ] **6.1** RED — Crear `frontend/src/features/memberships/components/invite-member-dialog.test.tsx`
  - Cubre REQ-RA-07, REQ-RA-08, REQ-RA-09
  - Tests en español (**G-5**) con Testing Library + `user-event`; mockear `useAssignableRoles` con `vi.mock`
  - `describe('InviteMemberDialog')`:
    - Con `open: false` → el hook no dispara request (verified vía mock)
    - Con `open: true` y hook en loading (`isLoading: true`) → el `<Select>` está deshabilitado; botón "Enviar" deshabilitado
    - Con hook devolviendo `[{ id: 'ADMIN', kind: 'system', name: 'Administrador' }, { id: 'uuid-1', kind: 'custom', name: 'Contador' }]`:
      - El select muestra el grupo "Sistema" con "Administrador"
      - El select muestra el grupo "Personalizados" con "Contador"
      - `OWNER` NO aparece (hook no lo devuelve)
    - Elegir custom role `uuid-1` → al enviar el form, el body contiene `customRoleId: 'uuid-1'` y NO `systemRole`
    - Elegir system role `ADMIN` → body contiene `systemRole: 'ADMIN'` y NO `customRoleId`
    - Con hook en `isError: true` → aparece mensaje de error inline; componente NO lanza excepción no capturada
    - Con hook devolviendo solo system roles (sin custom) → grupo "Personalizados" vacío o ausente; grupo "Sistema" funcional
  - Ejecutar: `cd frontend && pnpm exec vitest run src/features/memberships/components/invite-member-dialog.test.tsx` → **RED** (componente aún estático)

- [ ] **6.2** GREEN — Verificar tests verdes tras Fase 5
  - Ejecutar el test de 6.1 → **GREEN** (implementación de Fase 5 ya en su lugar)

- [ ] **6.3** Suite completa frontend sin regresiones
  - `cd frontend && pnpm exec vitest run` → toda la suite verde

- [ ] **6.4** Verificación final — typecheck + lint + e2e backend
  - `cd frontend && pnpm exec tsc -b` → 0 errores
  - `cd backend && pnpm exec tsc --noEmit -p tsconfig.json` → 0 errores
  - `cd backend && pnpm run lint` → 0 errores
  - `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/ --runInBand --forceExit` → toda la suite e2e verde
  - Commits listos para squash merge al PR

---

## Resumen de archivos nuevos/modificados

### Backend (modificados)
- `backend/src/custom-roles/ports/custom-roles-reader.port.ts` — + `abstract listarAsignablesPorOrg`
- `backend/src/custom-roles/adapters/prisma-custom-roles-reader.adapter.ts` — implementación del método nuevo
- `backend/src/custom-roles/adapters/prisma-custom-roles-reader.adapter.integration.spec.ts` — casos de `listarAsignablesPorOrg`
- `backend/src/memberships/memberships.service.ts` — + `listarRolesAsignables` + `filtrarPorVerticalYPacks` + inyección de `RbacService`
- `backend/src/memberships/memberships.controller.ts` — + `GET roles-asignables`
- `backend/src/memberships/memberships.service.spec.ts` — + describe `listarRolesAsignables`

### Backend (nuevos)
- `backend/src/memberships/dto/assignable-role.dto.ts`
- `backend/test/memberships-roles-asignables.e2e-spec.ts`

### Frontend (modificados)
- `frontend/src/types/api.ts` — + `AssignableRole`
- `frontend/src/features/memberships/components/invite-member-dialog.tsx` — select dinámico con grupos

### Frontend (nuevos)
- `frontend/src/features/memberships/api/get-assignable-roles.ts`
- `frontend/src/features/memberships/hooks/use-assignable-roles.ts`
- `frontend/src/features/memberships/hooks/use-assignable-roles.test.ts`
- `frontend/src/features/memberships/components/invite-member-dialog.test.tsx`

---

## Notas de apply

- **Inyección de `RbacService` en `MembershipsService`**: `RbacModule` ya está importado por `MembershipsModule` y exporta `RbacService` — solo agregar `private readonly rbacService: RbacService` al constructor sin necesidad de cambiar el módulo (**G-6, G-7**).
- **`MembershipsModule` sin cambios**: CustomRolesModule y RbacModule ya están en `imports`. El nuevo método del port ya es registrado por el adapter existente. No se toca `memberships.module.ts`.
- **Parseo del `value` del `<Select>`**: el valor compuesto `"${kind}:${id}"` permite parsear con `v.split(':')` solo si el UUID no contiene `:`. Los UUIDs v4 no tienen `:` — el parseo es seguro.
- **OWNER en `defaultValues`**: el dialog carga con `systemRole: 'ADMIN'` por default. Si el hook aún está cargando al abrir, el select aparece deshabilitado (REQ-RA-09). Cuando carga, el `value` inicial del select debería ser `"system:ADMIN"` para mostrar el ítem seleccionado.
- **Anti-F-13 (toast en body del componente)**: el error de `useAssignableRoles` se muestra como `<p>` inline en el dialog, NO como `toast.error()` fuera de un handler de evento. El toast de la mutación de invitación sí va en el `onError` del handler — eso es correcto.
- **Seam `filtrarPorVerticalYPacks`**: método privado en el service. No se testea directamente — queda cubierto implícitamente porque los tests de `listarRolesAsignables` verifican que todos los roles pasan (REQ-RA-05).
