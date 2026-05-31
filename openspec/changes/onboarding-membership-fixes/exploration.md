# Exploración — Bugs de onboarding / membership (items 2 + 3)

> Fase: `sdd-explore`. NO se escribió código de producción. Investigación de root-cause
> sobre dos bugs detectados al cerrar el spine de permisos (#82), ambos en el bounded
> context membership / invitaciones / RBAC. Ambos bloquearon el smoke visual del gating.
>
> Verificado por el orquestador directamente en código (no solo por sub-agentes).

## Resumen ejecutivo

Dos bugs independientes pero del mismo bounded context:

- **BUG #3 — `register → activeTenantId`**: una org recién creada por `POST /auth/register`
  no permite gatear nada porque el usuario nunca obtiene `activeTenantId`. Causa: `register`
  **solo crea el `User`**, no crea organización ni membership. El JWT del login sale sin
  `activeTenantId` y `GET /me/permissions` devuelve 403 `ME_PERMISSIONS_SIN_TENANT`.
  Backend-céntrico (UX/onboarding).
- **BUG #2 — CustomRole no aparece al invitar**: el dialog de invitar miembros tiene un
  `<Select>` **estático hardcodeado** con solo ADMIN/OWNER. El backend, el DTO, el schema Zod
  y el `onSubmit` ya soportan `customRoleId` — la desconexión es **exclusivamente UI**.
  Frontend-céntrico, con una decisión de política RBAC detrás.

Recomendación de fasing: **2 changes / 2 PRs separados** (scopes distintos `auth`/`tenant` vs
`memberships-ui`; §9.1 del CLAUDE.md prohíbe scope doble). El #2 es más chico y de menor riesgo.

---

## BUG #3 — `register → activeTenantId` — ⚠️ RESUELTO: NO ES UN BUG

**Corrección (verificada en código por el orquestador):** el frontend YA orquesta el flujo
correcto. `frontend/src/features/auth/register-form.tsx:40-94` hace, en este orden:
`registerUser` → `login` (token sin tenant) → `createTenant(nombre, modulo)` (crea org + membership
OWNER, siembra por vertical) → `switchTenant(org.id)` (token con `activeTenantId`) → `navigate('/')`,
con `clear()` de sesión si falla provisionar (línea 98). El comentario del archivo (líneas 40-45)
describe exactamente este flujo de 4 pasos.

**El 403 del smoke fue un artefacto de prueba**, no un bug de producto: el owner de prueba tenía
`findActivasByUserId` vacío → la membership nunca se creó → se probó por API cruda (register + login,
saltando createTenant + switchTenant). Un `register+login` aislado nunca resuelve `activeTenantId`,
**por diseño correcto** (register = identidad pura, doc §3).

**Lo único legítimo que queda (opcional, menor, NO amerita change SDD):**
1. Falta un **e2e backend** del happy path `register → login → POST /tenants → switch-tenant →
   /me/permissions = 200` (+ el negativo 403). Habría evitado el falso bug.
2. **Drift de doc**: el Swagger de `POST /auth/register` dice "Register a new user and tenant" — solo
   crea el user. Corregir el `@ApiOperation`.

Lo que sigue abajo es el análisis backend original (correcto a nivel API, pero el frontend ya cubre el gap).

### Flujo actual (verificado, con archivo:línea)

1. `POST /auth/register` → `auth.controller.ts` → `AuthService.register` (`auth.service.ts:51-62`).
   **Solo** hace `usersWriter.create({ email, hashedPassword, displayName? })`. No crea
   `Organization` ni `Membership`. (El Swagger dice "Register a new user and tenant" — mentira,
   drift de doc.)
2. `POST /auth/login` → `AuthService.login` (`auth.service.ts:80-108`):
   - `const memberships = await this.memberships.findActivasByUserId(user.id)` (`:88`)
   - `const activeTenantId = memberships[0]?.organizationId` (`:90`) → `undefined` para el user nuevo.
   - JWT se emite con spread condicional `...(activeTenantId !== undefined ? { activeTenantId } : {})`
     (`:96`) → el claim **se omite**.
3. `GET /me/permissions` con ese JWT → 403 `ME_PERMISSIONS_SIN_TENANT`
   ("Se requiere contexto de organización"). Documentado como caso válido en
   `test/me-permissions.e2e-spec.ts:86-103`.
4. El paso que falta es `POST /tenants` (con el JWT del login): `prisma-tenant.repository.ts:24-40`
   crea `Organization` + `Membership { systemRole: OWNER }` en nested write atómico. La membership
   nace con `deactivatedAt: null` (default) → recién ahí `findActivasByUserId` la devuelve.

`findActivasByUserId` (`memberships-reader.adapter.ts:18-26`) filtra `where: { userId, deactivatedAt: null }`.
**El filtro es correcto** — el problema no es la query, es que no existe la fila.

### Causa raíz

El onboarding del owner es de **3 pasos** (`register → login → POST /tenants`) pero ni el backend
ni el frontend lo guían. Quien hace solo `register + login` queda en un limbo: autenticado pero sin
tenant, y todo endpoint con contexto de org le da 403. No es un bug de una línea: es un **gap de
diseño del flujo de alta**.

### Reproducción

```
POST /api/auth/register { email, password }        → 201
POST /api/auth/login    { email, password }        → 200 (accessToken SIN activeTenantId)
GET  /api/me/permissions  (Bearer ese token)       → 403 ME_PERMISSIONS_SIN_TENANT
```

### Opciones de fix (con tradeoffs — DECISIÓN DE MARCO)

| Opción | Qué hace | Toca | Riesgo / nota | Migración |
|---|---|---|---|---|
| **A — Endpoint atómico `register-and-onboard`** | Un endpoint que en TX crea User + Organization + Membership OWNER y devuelve tokens con `activeTenantId` ya seteado. | nuevo DTO, `auth.service`/`auth.controller`, inyectar `TenantRepositoryPort` en `auth.module` (NO importar lógica de tenant directo — §3.7) | UX de 1 paso. Cuida hexagonal vía port. Encaja con la dirección "seeding por tipo de org al crear" ([[direccion-producto-plataforma]]). | No |
| **B — Frontend orquesta los 3 pasos** | Wizard post-register: `POST /tenants` + re-login (o `switch-tenant`) antes de cualquier ruta protegida. | solo frontend (onboarding) | Backend intacto, separación limpia. Frágil: un bug de navegación deja al user sin tenant; el backend no lo guía. | No |
| **C — Señal explícita "necesita onboarding"** | JWT sin `activeTenantId` se trata como señal válida; el front redirige a crear org. | front + quizá un flag en respuesta de login | Mínimo backend. No resuelve la UX, solo la encauza. | No |

Nota de producto: ya existe trabajo de onboarding en branch `feat/auth-ui-onboarding`
(ver [[direccion-producto-plataforma]]) — confirmar si A/B/C se alinea con eso antes de proponer.

### Tests relevantes / faltantes

- Existen: `test/auth.e2e-spec.ts` (register aislado), `test/me-permissions.e2e-spec.ts:86-103`
  (documenta el 403 como caso válido, no como bug).
- **Faltan**: e2e de la cadena completa `register → login → POST /tenants → /me/permissions = 200`
  (happy path) y el negativo `register → login → /me/permissions = 403`. Habrían cazado esto antes
  del smoke manual.

---

## BUG #2 — CustomRole no aparece al invitar miembros

### Flujo actual (verificado, con archivo:línea)

- **Crear CustomRole (backend, OK)**: `POST /api/custom-roles` persiste con `organizationId`,
  `isSystemDefault:false`, `isEditable:true`. Queda usable de inmediato. `GET /api/custom-roles`
  (`custom-roles.controller.ts:43-44`) lista los del tenant — **protegido por
  `@RequirePermissions('organizacion.roles.read')`**.
- **Dialog de invitar (frontend, AQUÍ EL BUG)**:
  `frontend/src/features/memberships/components/invite-member-dialog.tsx`
  - Comentario placeholder explícito `:41-43` ("solo exponemos los 2 systemRoles…").
  - `<Select>` `:126-154` con **solo** `<SelectItem value="ADMIN">` (`:137`) y `value="OWNER"` (`:145`).
  - Nunca llama `useRoles()`. `roleKind` queda siempre `'system'`.
- **Schema y submit ya preparados**: `schemas/invite-form-schema.ts` tiene
  `roleKind: 'system'|'custom'` y `customRoleId?`. El `onSubmit` (`:69-79`) ya arma el body con
  `customRoleId` cuando `roleKind==='custom'`.
- **Backend de invitaciones, OK end-to-end**: `CreateInvitationDto` acepta `customRoleId`;
  `InvitationsService.create` valida `belongsToTenant` antes de persistir.
- **Hook ya existe**: `frontend/src/features/roles/hooks/use-roles.ts` + `api/get-roles.ts`
  (`GET /api/custom-roles`). Solo falta consumirlo en el dialog.

### Causa raíz

Placeholder intencional del slice: la UI del dialog nunca se cableó a `useRoles()`. Todo el resto
del stack (backend, DTO, schema, submit) ya soporta CustomRole. Es un **fix de cableado de UI**, no
un bug de lógica.

### El nudo real: permisos (DECISIÓN DE MARCO)

`GET /custom-roles` exige `organizacion.roles.read`. Un usuario con `organizacion.miembros.invite`
pero **sin** `roles.read` recibiría 403 al pedir los roles → el select quedaría sin CustomRoles
(degradación silenciosa). La decisión no es "cómo renderizar el select", es **qué fuente de datos
usa y bajo qué permiso**:

| Opción | Qué hace | Toca | Riesgo / nota |
|---|---|---|---|
| **A — `useRoles()` + manejar `isError`** | El dialog consume `GET /custom-roles`; si falla, fallback elegante (sección CustomRoles oculta o aviso). | solo `invite-member-dialog.tsx` | Mínimo. Pero acopla invitar a tener `roles.read`; quien no lo tenga no ve CustomRoles. |
| **B — Endpoint dedicado `GET /invitations/assignable-roles`** | Devuelve `id+name` de los CustomRoles del tenant, gateado por `miembros.invite`. | back (`invitations.controller/service/module`) + 2 archivos front nuevos | Resuelve permisos limpio. Duplica "listar roles del tenant". Endpoint extra a mantener. |
| **C — Política RBAC: invitar ⇒ leer roles** | Todo preset con `miembros.invite` incluye `roles.read`. | solo catálogo de permisos | Cero código de feature. Habilita A sin el 403. Acopla dos conceptos que podrían ser independientes. |

Combinación natural: **A + C** (cablear el select y garantizar el permiso por política), o **B** si
se quiere que invitar nunca exponga el detalle completo de roles.

### Tests relevantes / faltantes

- Backend cubre la validación `belongsToTenant`. Falta integration con `customRoleId` válido e
  inválido (cross-tenant).
- **Frontend**: no hay ningún test en `memberships/components/`. Falta uno que verifique que los
  CustomRoles del tenant aparecen en el select y que al elegir uno el body lleva `customRoleId`
  (y NO `systemRole`).

---

## Decisiones cerradas (Marco, 2026-05-31) — REVISADAS contra el doc de plataforma

Tras revisar `docs/disenos/plataforma-multi-vertical.md` (§3 identidad, §1.3 seeding, §3.1 catálogo
asignable, §4 scopes), se corrigieron 2 de las 3 decisiones iniciales porque dejaban deuda futura.
Son **2 changes / 2 PRs separados, secuenciados (uno primero, luego el otro)**.

1. **Fasing**: ✅ **2 changes / 2 PRs separados, en secuencia** (no en paralelo).

2. **BUG #3** — ✅ **Frontend orquesta sobre seams existentes** (NO `register-and-onboard` en auth):
   - `register` queda como **identidad pura** de plataforma (doc §3: User no pertenece a vertical ni tenant).
   - `POST /tenants` es el **único camino de provisioning** — y YA siembra por vertical
     (`tenants.service.ts`: `flagsParaModulo`, `planCuentasSeeder.seedDefaultsForTenant`, `tiposDocSeeder`,
     `switch(dto.modulo)`). Un endpoint en auth lo bypassearía → deuda con granja/multi-org.
   - El limbo del `activeTenantId` se cierra con `POST /auth/switch-tenant` (`auth.controller.ts:94`), que
     **ya existe** y reemite tokens con tenant activo.
   - El onboarding (register → login → POST /tenants con `modulo` → switch-tenant) lo orquesta el
     **frontend** (branch `feat/auth-ui-onboarding`). Opcional/diferible: que `POST /tenants` devuelva el
     token con `activeTenantId` (refinamiento EN `tenants`, reusando `switchTenant`) para ahorrar un round-trip.
   - Cero acoplamiento nuevo, menos código que la opción descartada.

3. **BUG #2** — ✅ **Endpoint `assignable-roles` propio** (NO acoplar invite→roles.read):
   - Read en el contexto invitaciones/membership, gateado por `organizacion.miembros.invite`, que devuelve
     los roles asignables de la org (system + custom).
   - Deja el **seam listo para el filtro por vertical + packs** que el doc §3.1 exige (hoy solo contabilidad;
     mañana granja filtra en UN lugar).
   - No mezcla los scopes `roles.*` y `miembros.*` (§4). Reutilizable para invitar Y para cambiar el rol de
     un miembro. El frontend cablea el `<Select>` del `invite-member-dialog.tsx` a ese endpoint.

### Próximo paso
Dos proposals SDD independientes y secuenciados (config cacheada: Automatic / Opus / hybrid). Orden a
confirmar con Marco — recomendado arrancar por el **#3** (onboarding): una org bien provisionada con
`activeTenantId` es prerequisito para siquiera ejercitar invitaciones+roles del #2, y desbloquea tu smoke
del gating.

## Archivos clave

**Backend**: `auth/auth.service.ts` (register `:51`, login `:80`), `auth/auth.controller.ts`,
`memberships/adapters/memberships-reader.adapter.ts:18`, `tenants/adapters/prisma-tenant.repository.ts:24`,
`tenants/tenants.service.ts`, `invitations/dto/create-invitation.dto.ts`, `invitations/invitations.service.ts`,
`custom-roles/custom-roles.controller.ts:43`.
**Frontend**: `features/memberships/components/invite-member-dialog.tsx` (bug),
`features/memberships/schemas/invite-form-schema.ts`, `features/roles/hooks/use-roles.ts`,
`features/roles/api/get-roles.ts`.
**Tests**: `test/auth.e2e-spec.ts`, `test/me-permissions.e2e-spec.ts:86`.
