# Tasks — `spine-permisos`

<!--
Última edición: 2026-05-31
Owner: backend-lead
-->

> Change: spine-permisos
> Fase: tasks
> Specs de referencia: specs/me-permissions/spec.md · specs/frontend-permission-gating/spec.md (inline en proposal)
> Cada fase es candidata a un commit o PR atómico.

---

## Resumen de fases

| Fase | Nombre | Tareas | Scope commit |
|------|--------|--------|--------------|
| 1 | RbacService — `resolverPermisosConContexto()` | 5 | `refactor(rbac): ...` |
| 2 | Módulo `me` backend + e2e | 8 | `feat(me): ...` |
| 3 | Frontend — objeto PERMISSIONS + api + hook | 6 | `feat(auth-ui): ...` |
| 4 | Frontend — componentes gating `<Can>` + `<PermissionButton>` | 6 | `feat(auth-ui): ...` |
| 5 | Frontend — `requiredPermission` en NavItem + filtrado sidebar | 5 | `feat(auth-ui): ...` |
| 6 | Frontend — `<RequirePermission>` wrapper ruta + gateo páginas | 6 | `feat(auth-ui): ...` |

**Total: 36 tareas**

---

## Gotchas de proyecto (aplicar en las tareas indicadas)

- **G-1** Tests integración/e2e backend: Postgres en `127.0.0.1`, DATABASE_URL inline (el sandbox no lee `.env`).
- **G-2** Frontend CI: `pnpm exec tsc -b` (NO `tsc --noEmit`) — typechequea project refs.
- **G-3** `lint` backend = `eslint src/` (NO cubre `test/`) → lint e2e explícito si se toca código en `test/`.
- **G-4** Tras Edits en archivos EXISTENTES (router, nav-items, app.module) verificar con grep que el cambio quedó.
- **G-5** Tooltip shadcn sobre `<button disabled>`: el disabled no emite hover → envolver en `<span>` o div wrapper.
- **G-6** `describe`/`it` en español en todos los tests.
- **G-7** `useWatch` y cualquier hook son funciones → NO inline dentro de JSX; izar a `const` antes del return.

---

## Fase 1 — RbacService: `resolverPermisosConContexto()` (commit aislado)

> **Crítico**: este commit va SOLO, ANTES de todo lo demás. El `PermissionsGuard` ya usa `getPermissions()` con su firma actual — la refactorización no puede romper esa superficie pública. Correr la suite `rbac` existente como red de seguridad ANTES y DESPUÉS.

**Objetivo**: añadir un método `resolverPermisosConContexto(userId, organizationId)` que devuelva `{ permissions: string[], isOwner: boolean }` con los permisos efectivos ya expandidos contra el catálogo (sin wildcards). `getPermissions()` MANTIENE su firma sin cambios.

---

- [x] **1.1** RED — Tests del método nuevo en `rbac.service.spec.ts`
  - Cubre REQ-MP-01, REQ-MP-04, REQ-MP-05
  - Crear (o extender) `backend/src/rbac/rbac.service.spec.ts`
  - Tests en español:
    - `describe('resolverPermisosConContexto')`:
      - OWNER → `isOwner: true` y `permissions` = todos los keys del `CATALOGO_PERMISOS` (sin wildcards)
      - ADMIN → `isOwner: false` y `permissions` = todos los keys del catálogo
      - MEMBER con CustomRole `["contabilidad.*"]` → solo permisos con prefijo `contabilidad.`
      - MEMBER con CustomRole vacío → `permissions: []`
      - `getPermissions()` sigue devolviendo `ResolvedPermissions` sin cambio (regresión)
  - **Recordatorio G-1**: estos son tests unitarios puros con mocks — NO necesitan Postgres
  - Ejecutar: `cd backend && pnpm exec jest src/rbac/rbac.service.spec.ts` → debe estar **RED**

- [x] **1.2** GREEN — Implementar `resolverPermisosConContexto()` en `RbacService`
  - Cubre REQ-MP-01, REQ-MP-03, REQ-MP-04, REQ-MP-05
  - Archivo: `backend/src/rbac/rbac.service.ts`
  - Lógica: llama a `getPermissions(userId, organizationId)` → si `esOwner || esAdmin` → expandir `['*']` contra `CATALOGO_PERMISOS`; si no → expandir cada wildcard en `wildcards[]` con `expandirPatron()` de `catalogo.ts`; deduplicar con `Set`; devolver `{ permissions: string[], isOwner: boolean }`
  - NO modificar firma de `getPermissions()` ni del resto de métodos públicos
  - Ejecutar: `cd backend && pnpm exec jest src/rbac/rbac.service.spec.ts` → **GREEN**

- [x] **1.3** Exportar el método nuevo desde `rbac/index.ts` si se necesita
  - Verificar que `src/rbac/index.ts` re-exporte `RbacService` (ya lo hace) — confirmar que el tipo del retorno nuevo es visible para `MeModule` cuando lo importe

- [x] **1.4** Verificación: suite rbac completa pasa sin regredir
  - `cd backend && pnpm exec jest src/rbac/` → **todo verde**
  - `cd backend && pnpm exec tsc --noEmit -p tsconfig.json` → **0 errores**

- [x] **1.5** Lint y typecheck previo al commit
  - `cd backend && pnpm run lint` → 0 errores
  - Commit: `refactor(rbac): add resolverPermisosConContexto() expanding wildcards against catalog`
  - El scope es `rbac`; message en inglés según §9.1 CLAUDE.md

---

## Fase 2 — Módulo `me` backend + e2e

> Depende de Fase 1 completa. PR independiente: `feat(me): GET /me/permissions endpoint`.

**Objetivo**: crear el módulo `me/` con `MeController` exponiendo `GET /api/me/permissions` y los tests e2e cubriendo todos los escenarios del spec.

---

- [x] **2.1** RED — Tests e2e en `backend/test/me-permissions.e2e-spec.ts`
  - Cubre REQ-MP-01, REQ-MP-02, REQ-MP-04, REQ-MP-05, REQ-MP-06, REQ-MP-07, REQ-MP-08
  - Crear `backend/test/me-permissions.e2e-spec.ts` siguiendo el patrón de `custom-roles.e2e-spec.ts`:
    - Bootstrap `AppModule`, `setGlobalPrefix('api')`, `ValidationPipe`, `cleanupTestData()` en `beforeEach`
    - Tests en español:
      - `describe('GET /api/me/permissions')`:
        - sin JWT → 401
        - JWT sin `activeTenantId` → 403 con código `ME_PERMISSIONS_SIN_TENANT`
        - OWNER con tenant → 200, `isOwner: true`, `permissions` contiene todos los keys del catálogo, sin `"*"` literal
        - ADMIN → 200, `isOwner: false`, `permissions` = todos los keys del catálogo
        - MEMBER con CustomRole `["contabilidad.libro-diario.read", "contabilidad.libro-mayor.read"]` → 200, `isOwner: false`, solo esos dos permisos
        - MEMBER sin CustomRole → 200, `isOwner: false`, `permissions: []`
        - membresía desactivada → 403 con código `ME_PERMISSIONS_MEMBRESIA_INACTIVA` (o 403 genérico según nota impl)
  - **Recordatorio G-1**: `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh"` inline
  - Ejecutar: `cd backend && DATABASE_URL="..." JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/me-permissions.e2e-spec.ts --runInBand --forceExit` → **RED** (módulo no existe aún)

- [x] **2.2** Crear `MePermissionsResponseDto`
  - Archivo nuevo: `backend/src/me/dto/me-permissions-response.dto.ts`
  - Campos: `permissions: string[]`, `isOwner: boolean`, `activeTenantId: string`
  - **Sin** `class-transformer` decorators extra — es un DTO de salida plano

- [x] **2.3** Crear `MeController`
  - Archivo nuevo: `backend/src/me/me.controller.ts`
  - `@Controller('me')` + `@UseGuards(JwtAuthGuard)` a nivel de clase
  - `@Get('permissions')` → `@CurrentUser()` para extraer `userId` y `activeTenantId`
  - Si `!activeTenantId` → lanzar `ForbiddenError` con código `ME_PERMISSIONS_SIN_TENANT` (usando `DomainError` de `@/common/errors/`)
  - Llamar a `rbacService.resolverPermisosConContexto(userId, activeTenantId)`
  - Si `isOwner: false && permissions.length === 0` Y la membresía fue desactivada → detectar y lanzar `ForbiddenError` con `ME_PERMISSIONS_MEMBRESIA_INACTIVA`
    - Nota: ver REQ-MP-08. Alternativa aceptada si la verificación extra tiene costo: devolver 403 genérico con mensaje "Acceso denegado al tenant activo". **Decidir durante apply** qué opción usar.
  - Devolver `MePermissionsResponseDto` construido como objeto plano

- [x] **2.4** Crear `MeModule`
  - Archivo nuevo: `backend/src/me/me.module.ts`
  - Importa `RbacModule` (que exporta `RbacService`)
  - Declara y registra `MeController`
  - **NO** declara `PermissionsGuard` como provider propio — `JwtAuthGuard` viene de `@/common/guards/`

- [x] **2.5** Registrar `MeModule` en `AppModule`
  - Archivo: `backend/src/app.module.ts`
  - Agregar `MeModule` al array `imports`
  - **Recordatorio G-4**: verificar con `grep 'MeModule' backend/src/app.module.ts` que el import quedó

- [x] **2.6** GREEN — Ejecutar e2e y verificar verde
  - `cd backend && DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/me-permissions.e2e-spec.ts --runInBand --forceExit` → **todos los casos GREEN**

- [x] **2.7** Typecheck + lint backend
  - `cd backend && pnpm exec tsc --noEmit -p tsconfig.json` → 0 errores
  - `cd backend && pnpm run lint` → 0 errores
  - **Recordatorio G-3**: `lint` no cubre `test/` → no es necesario lint adicional a menos que se haya tocado código compartido

- [x] **2.8** Suite completa backend pasa
  - `cd backend && DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/ --runInBand --forceExit` → verde (incluye el e2e nuevo)
  - Commit: `feat(me): add GET /me/permissions endpoint resolving effective user permissions`

---

## Fase 3 — Frontend: objeto PERMISSIONS + api + hook `usePermissions`

> Depende de Fase 2 completa (endpoint existe). PR propio o parte del PR frontend.

**Objetivo**: el frontend puede consultar los permisos efectivos del usuario autenticado, con cache por tenant y helper `has()`.

---

- [ ] **3.1** Agregar `MePermissionsResponse` a `frontend/src/types/api.ts`
  - Cubre REQ-MP-01 (shape del DTO)
  - Agregar interfaz al final del archivo:
    ```ts
    export interface MePermissionsResponse {
      permissions: string[];
      isOwner: boolean;
      activeTenantId: string;
    }
    ```
  - **Recordatorio G-4**: verificar con grep

- [ ] **3.2** RED — Tests del objeto `PERMISSIONS` y de la función api
  - Archivo nuevo: `frontend/src/features/permissions/lib/permissions.test.ts`
  - Tests en español (funciones puras, sin render):
    - `describe('PERMISSIONS')`: los keys de EEFF, libro-diario, libro-mayor están definidos correctamente (exactamente `contabilidad.eeff.read`, `contabilidad.libro-diario.read`, `contabilidad.libro-mayor.read`)
    - Confirmar que los strings coinciden con el catálogo del backend (`CATALOGO_PERMISOS` en `backend/src/common/permisos/catalogo.ts`)
  - Ejecutar: `cd frontend && pnpm exec vitest run src/features/permissions/lib/permissions.test.ts` → **RED**

- [ ] **3.3** GREEN — Crear `frontend/src/features/permissions/lib/permissions.ts`
  - Cubre REQ-FPG-01 (objeto central de constantes)
  - Objeto `PERMISSIONS` con claves semánticas:
    ```ts
    export const PERMISSIONS = {
      contabilidad: {
        eeff: { read: 'contabilidad.eeff.read' },
        libroDiario: { read: 'contabilidad.libro-diario.read' },
        libroMayor: { read: 'contabilidad.libro-mayor.read' },
      },
    } as const;
    ```
  - Verificar: `cd frontend && pnpm exec vitest run src/features/permissions/lib/permissions.test.ts` → **GREEN**

- [ ] **3.4** Crear `frontend/src/features/permissions/api/get-me-permissions.ts`
  - Cubre REQ-MP-03 (fuente única)
  - Función pura que llama a `api.get<MePermissionsResponse>('/api/me/permissions')` y devuelve `res.data`
  - Sin lógica adicional — la función es solo el fetcher

- [ ] **3.5** RED — Tests del hook `usePermissions` en `frontend/src/features/permissions/hooks/use-permissions.test.tsx`
  - Cubre REQ-FPG-01, REQ-FPG-02 (invalidación por tenant)
  - Tests en español con `renderHook` + QueryClientProvider wrapper:
    - Si `activeTenantId` no está en el store → la query está deshabilitada (`{ enabled: false }`)
    - Con `activeTenantId`, la query key incluye `activeTenantId` (testeado con `queryKey` del hook)
    - `has('contabilidad.eeff.read')` devuelve `true` cuando el permiso está en la respuesta
    - `has('permiso.inexistente')` devuelve `false`
    - Si `isOwner: true` → `has()` devuelve `true` para cualquier permiso
    - En estado loading → `has()` devuelve `false` (default seguro)
  - **Recordatorio G-7**: no usar `useWatch` ni hooks inline en JSX — los helpers van en `const` dentro de `renderHook`
  - Ejecutar: `cd frontend && pnpm exec vitest run src/features/permissions/hooks/use-permissions.test.tsx` → **RED**

- [ ] **3.6** GREEN — Crear `frontend/src/features/permissions/hooks/use-permissions.ts`
  - Cubre REQ-FPG-01, REQ-FPG-02
  - Importa `useAuthStore` para leer `activeTenantId`
  - `useQuery`:
    - `queryKey: ['me-permissions', activeTenantId]`
    - `queryFn: getMePermissions`
    - `staleTime: 5 * 60 * 1000` (5 minutos)
    - `enabled: Boolean(activeTenantId)` — deshabilitada si no hay tenant activo
  - Devuelve:
    - `has(permission: string): boolean` — si `isLoading` retorna `false`; si `isOwner` retorna `true`; si no, busca en `permissions[]`
    - `isOwner: boolean`
    - `permissions: string[]`
    - `isLoading: boolean`
    - `isError: boolean`
  - Exportar también `useMePermissions` como alias si se quiere evitar choque de nombres con `use-permissions.ts` de `src/lib/` (el archivo existente hace checks de `SystemRole`, NO es el mismo hook)
  - Ejecutar: `cd frontend && pnpm exec vitest run src/features/permissions/hooks/use-permissions.test.tsx` → **GREEN**
  - `cd frontend && pnpm exec tsc -b` → 0 errores

---

## Fase 4 — Frontend: componentes de gating `<Can>` + `<PermissionButton>`

> Depende de Fase 3 completa. Puede ser parte del mismo PR o PR propio.

**Objetivo**: componentes declarativos de gating UX. La autoridad sigue siendo el backend.

---

- [ ] **4.1** RED — Tests de `<Can>` en `frontend/src/features/permissions/components/can.test.tsx`
  - Cubre REQ-FPG-03 (ocultar sin permiso)
  - Tests en español:
    - Con `isOwner: true` → renderiza children
    - Con permiso en la lista → renderiza children
    - Sin permiso → NO renderiza children (retorna null)
    - En loading (`isLoading: true`) → NO renderiza children (default seguro)
  - Mockear `use-permissions` hook para inyectar el estado deseado
  - Ejecutar: `cd frontend && pnpm exec vitest run src/features/permissions/components/can.test.tsx` → **RED**

- [ ] **4.2** GREEN — Crear `frontend/src/features/permissions/components/can.tsx`
  - Cubre REQ-FPG-03
  - Props: `permission: string`, `children: React.ReactNode`
  - Llama a `usePermissions().has(permission)` — si no tiene permiso retorna `null`
  - Si está en loading retorna `null` (evitar flash)
  - **NO** tiene modo "disable" — ese es responsabilidad de `<PermissionButton>`
  - Ejecutar: verde en el test anterior

- [ ] **4.3** RED — Tests de `<PermissionButton>` en `frontend/src/features/permissions/components/permission-button.test.tsx`
  - Cubre REQ-FPG-04 (deshabilitar con tooltip)
  - Tests en español:
    - Con permiso → renderiza `<Button>` habilitado, sin tooltip wrapper
    - Sin permiso → renderiza `<Button>` deshabilitado con `disabled` y tooltip "No tenés permiso para esta acción"
    - El tooltip se muestra en un `<span>` wrapper (no en el `<button>` directo — por G-5)
    - Con `isOwner: true` → button habilitado aunque se pase cualquier permiso
  - Ejecutar: `cd frontend && pnpm exec vitest run src/features/permissions/components/permission-button.test.tsx` → **RED**

- [ ] **4.4** GREEN — Crear `frontend/src/features/permissions/components/permission-button.tsx`
  - Cubre REQ-FPG-04
  - Props: extiende props de `Button` de shadcn + `permission: string`
  - Llama a `usePermissions().has(permission)`
  - Si tiene permiso → renderiza `<Button {...rest}>{children}</Button>` normalmente
  - Si NO tiene permiso → el `<button>` queda `disabled`; envuelve en `<span>` con `<Tooltip>` porque los buttons deshabilitados no emiten hover events (**Recordatorio G-5**)
  - Tooltip content: "No tenés permiso para esta acción"
  - **Recordatorio G-7**: `const { has } = usePermissions()` declarado como const antes del return, nunca inline en JSX
  - Ejecutar: verde en el test anterior

- [ ] **4.5** Crear barrel export `frontend/src/features/permissions/index.ts`
  - Re-exporta: `PERMISSIONS`, `usePermissions`, `Can`, `PermissionButton`
  - Facilita imports cross-feature: `import { Can, PermissionButton } from '@/features/permissions'`

- [ ] **4.6** Typecheck frontend
  - `cd frontend && pnpm exec tsc -b` → 0 errores
  - `cd frontend && pnpm exec vitest run src/features/permissions/` → todos los tests de la feature GREEN

---

## Fase 5 — Frontend: `requiredPermission` en NavItem + filtrado sidebar

> Depende de Fase 3+4 completas.

**Objetivo**: el sidebar oculta ítems sin permiso. Cierra la deuda documentada en JSDoc de las páginas de reportes.

---

- [ ] **5.1** RED — Tests de `NavList` con filtrado por permiso en `frontend/src/components/nav-list.test.tsx`
  - Cubre REQ-FPG-05 (filtrado de nav)
  - Tests en español:
    - Ítem sin `requiredPermission` → siempre visible
    - Ítem con `requiredPermission` y el hook devuelve `has() = false` → NO visible (no renderizado)
    - Ítem con `requiredPermission` y el hook devuelve `has() = true` → visible
    - Con `isOwner: true` → todos los ítems con `requiredPermission` son visibles
  - Mockear `use-permissions` para controlar el retorno de `has()`
  - Ejecutar: `cd frontend && pnpm exec vitest run src/components/nav-list.test.tsx` → **RED**

- [ ] **5.2** GREEN — Extender `NavItem` con `requiredPermission?`
  - Archivo: `frontend/src/components/nav-items.ts`
  - Agregar campo opcional `requiredPermission?: string` a la interfaz `NavItem`
  - Agregar `requiredPermission` a los ítems pertinentes del array `NAV_ITEMS`:
    - Libro Diario → `requiredPermission: PERMISSIONS.contabilidad.libroDiario.read`
    - Libro Mayor → `requiredPermission: PERMISSIONS.contabilidad.libroMayor.read`
    - Balance General → `requiredPermission: PERMISSIONS.contabilidad.eeff.read`
    - Estado de Resultados → `requiredPermission: PERMISSIONS.contabilidad.eeff.read`
  - **Recordatorio G-4**: verificar con `grep 'requiredPermission' frontend/src/components/nav-items.ts`

- [ ] **5.3** GREEN — Filtrar `NavList` por permisos
  - Archivo: `frontend/src/components/nav-list.tsx`
  - Importar `usePermissions` del barrel `@/features/permissions`
  - Llamar `const { has } = usePermissions()` al inicio de `NavList` (**Recordatorio G-7**: const antes del return)
  - En el map: si `item.requiredPermission && !has(item.requiredPermission)` → no renderizar el item
  - Ejecutar el test de la tarea 5.1 → **GREEN**

- [ ] **5.4** Verificar que `NavList` en estado loading no flashea ítems que luego desaparecen
  - Durante carga de `usePermissions` (`isLoading: true`), `has()` devuelve `false` → los ítems con `requiredPermission` permanecen ocultos hasta que cargue
  - Confirmar en test que si `isLoading: true`, los ítems con permiso requerido NO se muestran

- [ ] **5.5** Typecheck + vitest frontend
  - `cd frontend && pnpm exec tsc -b` → 0 errores
  - `cd frontend && pnpm exec vitest run` → suite completa verde

---

## Fase 6 — Frontend: `<RequirePermission>` wrapper ruta + gateo de páginas

> Depende de Fase 3+4+5 completas. PR atómico: `feat(auth-ui): permission-based route gating`.

**Objetivo**: wrappear las páginas de reportes contables con `<RequirePermission>` para mostrar una vista inline "no tenés permiso" en lugar de redirigir.

---

- [ ] **6.1** RED — Tests de `<RequirePermission>` en `frontend/src/features/permissions/components/require-permission.test.tsx`
  - Cubre REQ-FPG-06 (wrapper de ruta con vista inline)
  - Tests en español:
    - Con permiso → renderiza `children`
    - Sin permiso → renderiza vista inline de "No tenés permiso para ver esta página" (no redirige)
    - La vista inline contiene un CTA/enlace "Volver al inicio"
    - Con `isOwner: true` → renderiza `children` independientemente del permiso
    - En loading → NO renderiza children NI vista de error (muestra skeleton/spinner)
  - Ejecutar: `cd frontend && pnpm exec vitest run src/features/permissions/components/require-permission.test.tsx` → **RED**

- [ ] **6.2** GREEN — Crear `frontend/src/features/permissions/components/require-permission.tsx`
  - Cubre REQ-FPG-06
  - Props: `permission: string`, `children: React.ReactNode`
  - Llama a `const { has, isLoading } = usePermissions()`
  - Si `isLoading` → renderizar skeleton (`<Skeleton className="h-40 w-full" />`)
  - Si `has(permission)` → renderizar `children`
  - Si no tiene permiso → renderizar vista inline:
    ```
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <Lock className="h-12 w-12 text-muted-foreground" />
      <h2 className="text-lg font-semibold">No tenés permiso para ver esta página</h2>
      <p className="text-sm text-muted-foreground">Contactá al administrador...</p>
      <Button variant="outline" asChild><Link to="/">Volver al inicio</Link></Button>
    </div>
    ```
  - Agregar a barrel export de `@/features/permissions`
  - Ejecutar: verde en el test anterior

- [ ] **6.3** Wrappear páginas de reportes en el router con `<RequirePermission>`
  - Archivo: `frontend/src/routes/router.tsx`
  - Cuatro rutas afectadas:
    - `/eeff/balance` → envolver `<BalanceGeneralPage />` con `<RequirePermission permission={PERMISSIONS.contabilidad.eeff.read}>`
    - `/eeff/resultados` → ídem
    - `/libros/diario` → `PERMISSIONS.contabilidad.libroDiario.read`
    - `/libros/mayor` → `PERMISSIONS.contabilidad.libroMayor.read`
  - **Recordatorio G-4**: verificar con `grep 'RequirePermission' frontend/src/routes/router.tsx`
  - Los componentes de página no cambian internamente — el gate es en el wrapper del router

- [ ] **6.4** Invalidar la query `me-permissions` al hacer switch de tenant
  - Archivo: wherever el switch-tenant se ejecuta (`features/tenants/` o `stores/`)
  - Buscar dónde se llama al endpoint `POST /api/auth/switch-tenant` → en el callback de éxito, llamar `queryClient.invalidateQueries({ queryKey: ['me-permissions'] })`
  - Cubre REQ-FPG-02 (riesgo de permisos stale por cambio de tenant)
  - **Recordatorio G-4**: verificar con grep que el `invalidateQueries` quedó en el archivo correcto

- [ ] **6.5** Tests de regresión sidebar: los ítems sin `requiredPermission` siguen visibles
  - Verificar que `NAV_ITEMS` sin `requiredPermission` (Panel, Plan de cuentas, Comprobantes, etc.) nunca se filtran, independientemente del estado del hook
  - Test en `nav-list.test.tsx` si no estaba cubierto ya en 5.1

- [ ] **6.6** Verificación final — typecheck + lint + vitest + tsc
  - `cd frontend && pnpm exec tsc -b` → 0 errores (typechequea project refs incluyendo tests)
  - `cd frontend && pnpm exec vitest run` → toda la suite verde
  - `cd backend && pnpm run lint && pnpm exec tsc --noEmit -p tsconfig.json` → limpio
  - `cd backend && DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/ --runInBand --forceExit` → verde

---

## Resumen de archivos nuevos/modificados

### Backend (nuevos)
- `backend/src/me/dto/me-permissions-response.dto.ts`
- `backend/src/me/me.controller.ts`
- `backend/src/me/me.module.ts`
- `backend/test/me-permissions.e2e-spec.ts`

### Backend (modificados)
- `backend/src/rbac/rbac.service.ts` — método `resolverPermisosConContexto()` nuevo
- `backend/src/app.module.ts` — importar `MeModule`

### Frontend (nuevos)
- `frontend/src/features/permissions/lib/permissions.ts`
- `frontend/src/features/permissions/lib/permissions.test.ts`
- `frontend/src/features/permissions/api/get-me-permissions.ts`
- `frontend/src/features/permissions/hooks/use-permissions.ts`
- `frontend/src/features/permissions/hooks/use-permissions.test.tsx`
- `frontend/src/features/permissions/components/can.tsx`
- `frontend/src/features/permissions/components/can.test.tsx`
- `frontend/src/features/permissions/components/permission-button.tsx`
- `frontend/src/features/permissions/components/permission-button.test.tsx`
- `frontend/src/features/permissions/components/require-permission.tsx`
- `frontend/src/features/permissions/components/require-permission.test.tsx`
- `frontend/src/features/permissions/index.ts`

### Frontend (modificados)
- `frontend/src/types/api.ts` — agregar `MePermissionsResponse`
- `frontend/src/components/nav-items.ts` — agregar `requiredPermission` a la interfaz y a 4 ítems
- `frontend/src/components/nav-list.tsx` — filtrar por `requiredPermission`
- `frontend/src/routes/router.tsx` — wrappear 4 rutas con `<RequirePermission>`
- Archivo de switch-tenant (a confirmar) — invalidar query `me-permissions`

---

## Notas de apply

- **`resolverPermisosConContexto` vs `getPermissions`**: el nombre del método nuevo es deliberado — `getPermissions` mantiene la semántica actual (devuelve `ResolvedPermissions` con wildcards crudos, usada por el guard); `resolverPermisosConContexto` devuelve la forma expandida orientada al cliente HTTP.
- **Permisos stale al cambiar de tenant** (riesgo del proposal): el `queryKey: ['me-permissions', activeTenantId]` garantiza que al cambiar de tenant la query es distinta y se re-fetcha. La invalidación explícita en 6.4 es adicional para forzar refresh inmediato sin esperar `staleTime`.
- **REQ-MP-08 (membresía desactivada)**: el `RbacService.getPermissions()` devuelve `EMPTY` para usuario no-miembro Y para membresía desactivada. Distinguir ambos casos requiere un call extra al repo. Durante apply, evaluar costo: si es bajo, implementar distinción; si no, devolver 403 con mensaje genérico "Acceso denegado al tenant activo" (aceptado por el spec).
- **Tooltip sobre button disabled (G-5)**: `<PermissionButton>` DEBE envolver el `<button disabled>` en un `<span>` antes del `<TooltipTrigger>` — shadcn/Radix no dispara hover en elementos disabled.
- **`use-permissions.ts` en `src/lib/`**: el archivo existente (`useHasSystemRole`, `usePuedeReabrir`) NO es el nuevo hook — es checking de SystemRole basado en el JWT, NO en el endpoint. Ambos coexisten. El nuevo hook vive en `features/permissions/hooks/`.
