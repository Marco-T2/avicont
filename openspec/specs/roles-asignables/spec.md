# roles-asignables — Especificación

<!--
Última edición: 2026-06-01
Última revisión contra core: 2026-06-01
Owner: backend-lead
-->

> Fecha: 2026-05-31
> Fase: spec (live)
> Proyecto: avicont
> Capability nueva: `roles-asignables` (no existía spec previa)
> Origen: change `invitacion-roles-asignables` (archivado 2026-06-01, PR #84)

---

## Propósito

Exponer los **roles asignables** de la organización activa para poblar el
`<Select>` del dialog de invitación. El endpoint `GET /api/memberships/roles-asignables`
devuelve system roles (`ADMIN`, `OWNER`) + custom roles del tenant, gateado por
`organizacion.miembros.invite`. El frontend cablea el hook y elimina el
`<Select>` estático hardcodeado (BUG #2).

La lectura de custom roles cruza frontera de módulo vía `CustomRolesReaderPort`
(§3.7 CLAUDE.md). El rol OWNER se filtra en el servicio según si el solicitante
es OWNER en la org. Un seam explícito `filtrarPorVerticalYPacks` queda como
extensión futura para el filtro por vertical + packs (§3.1 plataforma).

---

## Glosario

- **Rol asignable**: rol que puede concederse a un nuevo miembro en la invitación.
  Incluye roles de sistema (`ADMIN`, `OWNER`) y custom roles del tenant activo.
- **System role**: `ADMIN` o `OWNER` — valores de enum `SystemRole` del catálogo.
  `id` = `"ADMIN"` / `"OWNER"` (string del enum).
- **Custom role**: rol creado por el tenant con un `uuid` como `id`.
- **`kind`**: discriminador del ítem — `"system"` para roles de sistema,
  `"custom"` para roles del tenant.
- **OWNER-only**: el rol OWNER aparece en la lista SOLO si el solicitante
  es OWNER en la org activa. Para un no-owner, OWNER se omite de la respuesta.
- **Seam vertical+packs**: función privada del servicio `filtrarPorVerticalYPacks(roles)`
  que hoy es no-op (retorna la lista tal cual). Punto de extensión para cuando
  llegue el módulo Granja y el filtro por entitlement.
- **`organizacion.miembros.invite`**: clave canónica del catálogo que gatea el endpoint.
  (Histórico: existía la clave legacy `users.invite` en `memberships.controller.ts`;
  migrada a `organizacion.miembros.invite` en PR #90, 2026-06-01.)

---

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

### REQ-RA-01: Forma del DTO de respuesta

El endpoint `GET /api/memberships/roles-asignables` DEBE devolver un array de
`AssignableRoleDto` con esta forma:

```
[
  { id: string, name: string, kind: "system" | "custom", description?: string }
]
```

- `id`: para system roles es el enum string (`"ADMIN"` / `"OWNER"`); para custom roles es el `uuid` del `CustomRole`.
- `name`: para system roles es el nombre en español del rol (`"Administrador"`, `"Propietario"`); para custom roles es `CustomRole.name`.
- `kind`: `"system"` o `"custom"` — discriminador para que el frontend sepa cómo armar el body de la invitación.
- `description` (opcional): copia descriptiva de los roles de sistema (hardcodeada en el DTO); `undefined` para custom roles.

Los ítems de sistema DEBEN aparecer antes que los custom (system primero,
custom después). Los custom DEBEN ordenarse por `name` ASC.

#### Escenario: respuesta incluye system y custom correctamente formados

- DADO que el tenant activo tiene 2 custom roles: `"Contador"` (uuid A) y `"Auditor"` (uuid B)
- Y el solicitante es OWNER
- CUANDO consulta `GET /api/memberships/roles-asignables`
- ENTONCES la respuesta es un array ordenado: `[OWNER, ADMIN, Auditor, Contador]`
- Y cada ítem cumple el shape `{ id, name, kind, description? }`
- Y los custom tienen `kind: "custom"` e `id` UUID

#### Escenario: custom roles ordenados por nombre ASC

- DADO que el tenant tiene custom roles: `"Zapador"` y `"Auditor"`
- CUANDO consulta el endpoint
- ENTONCES en la respuesta los custom aparecen como `["Auditor", "Zapador"]` (ASC)

---

### REQ-RA-02: Gating de acceso — `organizacion.miembros.invite`

El endpoint DEBE estar protegido por `@RequirePermissions('organizacion.miembros.invite')`.
Un usuario autenticado sin ese permiso DEBE recibir HTTP 403.
Un request sin JWT DEBE recibir HTTP 401.

NO DEBE exigir `organizacion.roles.read` ni ningún otro permiso — eso acoplaría
los scopes `miembros.*` y `roles.*` que el diseño mantiene separados a propósito.

#### Escenario: sin permiso `miembros.invite` — 403

- DADO un usuario autenticado con `SystemRole.MEMBER` sin custom role (sin `miembros.invite`)
- CUANDO consulta `GET /api/memberships/roles-asignables`
- ENTONCES el sistema responde HTTP 403

#### Escenario: con permiso `miembros.invite` — 200

- DADO un usuario autenticado con permiso `organizacion.miembros.invite`
- CUANDO consulta `GET /api/memberships/roles-asignables`
- ENTONCES el sistema responde HTTP 200

#### Escenario: sin JWT — 401

- CUANDO se hace `GET /api/memberships/roles-asignables` sin cabecera `Authorization`
- ENTONCES el sistema responde HTTP 401

---

### REQ-RA-03: OWNER-only — filtro según rol del solicitante

El rol `OWNER` DEBE aparecer en la lista SI Y SOLO SI el solicitante tiene
`SystemRole.OWNER` en la organización activa. Para un solicitante `ADMIN`,
`MEMBER`, o cualquier otro rol, `OWNER` DEBE omitirse.

La determinación de si el solicitante es OWNER DEBE hacerse consultando
`rbacService.resolverPermisosConContexto(userId, orgId)` — mismo método
del enforcement en `InvitationsService.create` (defense in depth).

Este filtro es solo de LECTURA: no reemplaza el enforcement en
`InvitationsService.create`, que rechaza la creación de una invitación
con `systemRole: OWNER` si el solicitante no es OWNER.

#### Escenario: OWNER consulta — incluye rol OWNER en la lista

- DADO un usuario con `SystemRole.OWNER` en la org activa
- CUANDO consulta `GET /api/memberships/roles-asignables`
- ENTONCES la respuesta incluye un ítem con `{ id: "OWNER", kind: "system" }`

#### Escenario: ADMIN consulta — NO incluye rol OWNER en la lista

- DADO un usuario con `SystemRole.ADMIN` en la org activa
- CUANDO consulta `GET /api/memberships/roles-asignables`
- ENTONCES la respuesta NO contiene ningún ítem con `id: "OWNER"`
- Y SÍ contiene `{ id: "ADMIN", kind: "system" }`

#### Escenario: MEMBER con custom role `miembros.invite` consulta — sin OWNER

- DADO un usuario con `SystemRole.MEMBER` y un custom role que incluye `organizacion.miembros.invite`
- CUANDO consulta el endpoint
- ENTONCES la respuesta NO contiene `OWNER`, SÍ contiene `ADMIN` y los custom roles del tenant

---

### REQ-RA-04: Multi-tenant — solo custom roles de la org activa

El servicio DEBE leer únicamente los `CustomRole` cuyo `organizationId` coincide
con el tenant activo del JWT. NUNCA DEBE devolver custom roles de otra organización.

La fuente de `organizationId` es el `@CurrentTenant` del JWT (`activeTenantId`).
NO DEBE aceptar ningún parámetro en query o body para especificar otro tenant.

La lectura cross-módulo se hace vía `CustomRolesReaderPort.listarAsignablesPorOrg(orgId)` —
filtrado en la query del adapter, no post-filtrado en el servicio.

#### Escenario: dos tenants — sin fuga cross-tenant

- DADO que el Tenant A tiene el custom role `"Contador A"` y el Tenant B tiene `"Contador B"`
- CUANDO el usuario del Tenant A consulta `GET /api/memberships/roles-asignables`
- ENTONCES la respuesta incluye `"Contador A"` y NO incluye `"Contador B"`

#### Escenario: tenant sin custom roles — solo system roles

- DADO que la org activa no tiene ningún `CustomRole`
- CUANDO consulta el endpoint (solicitante con `miembros.invite`)
- ENTONCES la respuesta contiene solo los system roles aplicables (`ADMIN`, opcionalmente `OWNER`)

---

### REQ-RA-05: Seam vertical+packs — no-op hoy, extensible mañana

El servicio DEBE pasar la lista compuesta `[...systemRoles, ...customRoles]` por
una función privada `filtrarPorVerticalYPacks(roles, orgId)` ANTES de armar
la respuesta. Hoy esta función DEBE retornar la lista tal cual (no-op), ya que
el tenant tiene solo el vertical Contabilidad.

La función DEBE estar en el servicio (capa de composición), NOT en el adapter
ni en el frontend. Cuando se agregue el vertical Granja, esta función recibirá
los packs activos del tenant y filtrará los custom roles por vertical.

#### Escenario: seam no-op — todos los roles pasan

- DADO que el tenant activo tiene Contabilidad como único vertical activo
- CUANDO consulta el endpoint
- ENTONCES la respuesta incluye todos los roles de la org sin filtrado por vertical

---

### REQ-RA-06: Módulo dueño — `memberships`

El endpoint DEBE vivir en `MembershipsController` bajo la ruta base `/api/memberships`.
NO DEBE vivir en `InvitationsController`, `CustomRolesController`, ni en un módulo nuevo.

Razón: el recurso "roles asignables" sirve para invitar HOY y para cambiar el
rol de un miembro MAÑANA — `memberships` es el contexto más amplio y correcto.
`MembershipsModule` ya importa `CustomRolesModule` (que registra el port).

#### Escenario: ruta del endpoint

- CUANDO se consulta `GET /api/memberships/roles-asignables`
- ENTONCES el sistema responde (no 404)
- Y no existe `GET /api/invitations/roles-asignables` ni `GET /api/custom-roles/roles-asignables`

---

### REQ-RA-07: Frontend — hook y API function

El frontend DEBE proveer:

1. `frontend/src/features/memberships/api/get-assignable-roles.ts` — función pura que llama
   `GET /api/memberships/roles-asignables` y retorna `AssignableRole[]` tipado.
2. `frontend/src/features/memberships/hooks/use-assignable-roles.ts` — hook con TanStack Query,
   `queryKey: ['memberships', 'assignable-roles']`, habilitado solo cuando el dialog está abierto
   (`enabled: open`).

El componente `invite-member-dialog.tsx` DEBE consumir el hook, NUNCA llamar al
API function directamente (Anti-F-12).

#### Escenario: hook disabled cuando el dialog está cerrado

- DADO que el dialog de invitación está cerrado (`open: false`)
- CUANDO el componente está montado
- ENTONCES el hook NO dispara ningún request a `GET /api/memberships/roles-asignables`

#### Escenario: hook habilitado al abrir el dialog

- DADO que el dialog de invitación se abre (`open: true`)
- CUANDO se monta el hook con `enabled: open`
- ENTONCES se dispara el request y el `<Select>` se puebla con la respuesta

---

### REQ-RA-08: Frontend — select dinámico con grupos

El `<Select>` de `invite-member-dialog.tsx` DEBE renderizar los roles obtenidos
del hook en lugar de los items estáticos hardcodeados.

El select DEBE agrupar ítems en dos grupos visuales:
- `"Sistema"` — los system roles (`ADMIN`, `OWNER` si aplica).
- `"Personalizados"` — los custom roles del tenant (vacío si no hay).

El `value` de cada `<SelectItem>` DEBE codificar `"${kind}:${id}"` para que el
`onValueChange` pueda parsear y setear `roleKind` + `systemRole`/`customRoleId`
en el formulario. El `onSubmit` existente (`:69-79`) ya arma el body correcto:
- `kind === 'system'` → `{ roleKind: 'system', systemRole: id }`
- `kind === 'custom'` → `{ roleKind: 'custom', customRoleId: id }`

El comentario placeholder (`:41-43`) y el copy `"Los roles personalizados llegan
en Configuración → Roles"` (`:156`) DEBEN eliminarse.

#### Escenario: custom roles del tenant aparecen en el select

- DADO que el hook devuelve `[{ id: 'ADMIN', kind: 'system', name: 'Administrador' }, { id: 'uuid-1', kind: 'custom', name: 'Contador' }]`
- CUANDO se monta el dialog abierto
- ENTONCES el select muestra el grupo "Sistema" con "Administrador" y el grupo "Personalizados" con "Contador"

#### Escenario: elegir custom role — body con `customRoleId`

- DADO que el usuario selecciona el custom role `{ id: 'uuid-1', kind: 'custom' }`
- CUANDO el formulario se envía
- ENTONCES el body de la invitación contiene `{ customRoleId: 'uuid-1' }` y NO contiene `systemRole`

#### Escenario: elegir system role — body con `systemRole`

- DADO que el usuario selecciona `{ id: 'ADMIN', kind: 'system' }`
- CUANDO el formulario se envía
- ENTONCES el body contiene `{ systemRole: 'ADMIN' }` y NO contiene `customRoleId`

#### Escenario: si no hay custom roles — grupo "Personalizados" vacío o ausente

- DADO que el hook devuelve solo system roles (tenant sin custom roles)
- CUANDO se monta el dialog
- ENTONCES el grupo "Personalizados" está vacío o no se renderiza; el grupo "Sistema" es funcional

---

### REQ-RA-09: Frontend — estados loading y error sin romper el render

Mientras el hook está en `isLoading`, el `<Select>` DEBE mostrarse deshabilitado
o con un indicador de carga inline — NO DEBE romper el render ni lanzar errores
no capturados (Anti-F-13).

Si el query falla, DEBE mostrarse un mensaje de error inline en el dialog
(NO un `toast` lanzado en el cuerpo del componente fuera de un handler). El
formulario NO DEBE quedar en estado de render roto.

#### Escenario: loading — select deshabilitado

- DADO que el hook está en `isLoading: true`
- CUANDO el dialog está abierto
- ENTONCES el `<Select>` está deshabilitado (o muestra skeleton) y el usuario no puede hacer submit

#### Escenario: error — mensaje inline sin crash

- DADO que el request a `GET /api/memberships/roles-asignables` falla con 500
- CUANDO el dialog está abierto
- ENTONCES aparece un mensaje de error inline en el dialog; el componente NO lanza excepción no capturada

---

## Códigos de error

| Código | HTTP | Descripción |
|--------|------|-------------|
| `MEMBERSHIPS_ROLES_ASIGNABLES_SIN_PERMISO` | 403 | El usuario no tiene `organizacion.miembros.invite` (manejado por `PermissionsGuard`) |

> Nota: el guard existente ya devuelve un 403 estándar. No se requiere un código
> de error de dominio nuevo para el caso de acceso denegado — el `PermissionsGuard`
> lo maneja de forma consistente con el resto del sistema.

---

## Coverage objetivo

| Capa | Qué | Cómo |
|------|-----|------|
| Integration (backend) | Endpoint devuelve system + custom del tenant A; nunca custom del tenant B; OWNER omitido si el solicitante no es OWNER; OWNER incluido si es OWNER; 403 sin `miembros.invite` | E2E Supertest + Postgres real, 2 tenants, custom roles distintos (`backend/test/memberships-roles-asignables.e2e-spec.ts`) |
| Component (frontend) | Custom roles del tenant aparecen en el select; elegir custom manda `customRoleId` y no `systemRole`; elegir system manda `systemRole`; OWNER ausente cuando el hook no lo devuelve; loading deshabilia el select; error muestra mensaje inline | Testing Library + user-event, hook mockeado (`frontend/src/features/memberships/components/invite-member-dialog.test.tsx`) |

Trazabilidad por REQ:

| REQ | Test que lo cubre |
|-----|-------------------|
| REQ-RA-01 | E2E: verifica el shape de cada ítem; Component: verifica labels y grouping |
| REQ-RA-02 | E2E: 403 sin permiso, 401 sin JWT, 200 con permiso |
| REQ-RA-03 | E2E: OWNER presente para OWNER, ausente para ADMIN; Component: hook mock sin OWNER |
| REQ-RA-04 | E2E: dos tenants sin fuga; tenant vacío devuelve solo system |
| REQ-RA-05 | (seam no-op — cubierto implícitamente por REQ-RA-01) |
| REQ-RA-06 | E2E: ruta `/memberships/roles-asignables` responde |
| REQ-RA-07 | Component: hook disabled cuando `open: false`, habilitado cuando `open: true` |
| REQ-RA-08 | Component: select muestra grupos, body correcto para system/custom |
| REQ-RA-09 | Component: loading deshabilia select, error muestra mensaje inline |

---

## Notas de scope

- **`GET /api/custom-roles` intacto**: el endpoint existente para gestionar el catálogo
  de roles (`organizacion.roles.read`) no se modifica. Los dos endpoints tienen semánticas
  distintas: uno gestiona el catálogo, el otro expone los roles asignables al invitar.
- **`users.invite`/`users.manage` legacy**: al crearse este change, el controller de
  memberships usaba claves legacy (`users.invite`/`users.manage`) en otros métodos, y
  este change NO las migró (usó `organizacion.miembros.invite` directo en el endpoint
  nuevo). Esas claves legacy fueron migradas a `organizacion.miembros.{invite,update,remove}`
  más tarde, en PR #90 (2026-06-01) — ya no quedan referencias legacy en el controller.
- **Cambio de rol de miembro existente**: el endpoint es reutilizable para ese flujo,
  pero la UI de cambio de rol no entra en este change.
- **Sin migración de schema**: no hay cambios en `schema.prisma`. El endpoint es puramente aditivo.
