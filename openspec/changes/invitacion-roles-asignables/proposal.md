# Proposal — Roles asignables al invitar miembros (fix BUG #2)

> Fase: `sdd-propose`. Artifact store: hybrid (archivo + engram `sdd/invitacion-roles-asignables/proposal`).
> Basado en la exploración `openspec/changes/onboarding-membership-fixes/exploration.md` (BUG #2 + "Decisiones cerradas")
> y el doc de plataforma `docs/disenos/plataforma-multi-vertical.md` (§3, §3.1, §4).
> Enfoque ya elegido por Marco; este proposal lo fundamenta y delimita, NO reabre la decisión.

## Qué

Un `CustomRole` recién creado en la organización **no aparece** al invitar un miembro: el dialog
de invitación ofrece un `<Select>` estático con solo `ADMIN`/`OWNER` hardcodeados. Este change
crea un endpoint propio del contexto invitaciones/membership — `roles-asignables` — que devuelve
los roles asignables de la org (system + custom), gateado por `organizacion.miembros.invite`, y
cablea el `<Select>` del dialog a esa fuente. Deja el **seam** listo para filtrar por
vertical + packs (doc §3.1) sin implementarlo aún (hoy solo existe Contabilidad).

## Por qué

El gap es real y verificado en código:

- `frontend/src/features/memberships/components/invite-member-dialog.tsx:41-43` tiene un comentario
  placeholder explícito ("solo exponemos los 2 systemRoles…") y el `<Select>` `:126-154` solo
  renderiza `<SelectItem value="ADMIN">` (`:137`) y `value="OWNER"` (`:145`). Nunca consulta roles del tenant.
- El resto del stack YA soporta custom: `CreateInvitationDto` acepta `customRoleId`
  (`backend/src/invitations/dto/create-invitation.dto.ts`), el schema Zod tiene `roleKind`/`customRoleId`,
  y el `onSubmit` (`invite-member-dialog.tsx:69-79`) ya arma el body con `customRoleId` cuando
  `roleKind === 'custom'`. La desconexión es **solo de UI + la fuente de datos**.

Por qué un endpoint propio y NO cablear `useRoles()` (que ya existe y pega a `GET /api/custom-roles`):

- `GET /api/custom-roles` está gateado por `organizacion.roles.read`
  (`backend/src/custom-roles/custom-roles.controller.ts`, `@RequirePermissions('organizacion.roles.read')`).
  Cablearlo acoplaría el scope `miembros.*` al `roles.*`, que el doc **§4** mantiene **separados a
  propósito** (administrar miembros ≠ administrar el catálogo de roles). Un usuario con
  `miembros.invite` pero sin `roles.read` recibiría 403 y vería el select sin custom roles
  (degradación silenciosa).
- `GET /api/custom-roles` devuelve roles **crudos**, sin el filtro por **vertical + packs activos**
  que el doc **§3.1** exige ("El catálogo asignable se filtra por vertical + packs activos de la org").
  El endpoint nuevo es el lugar natural para ese filtro cuando llegue granja — en UN solo lugar.

Por eso este enfoque **no deja deuda**: respeta la separación de scopes (§4), pone el seam del
filtro vertical+packs donde corresponde (§3.1), y es reutilizable para invitar HOY y para cambiar
el rol de un miembro a futuro.

## Alcance

### Dentro (DO)

**Backend**
- Endpoint nuevo `GET` de roles asignables de la organización activa, gateado por
  `@RequirePermissions('organizacion.miembros.invite')`, que devuelve system roles
  (`OWNER`/`ADMIN`) + los `CustomRole` del tenant.
- La lectura cruza frontera de módulo (necesita leer `CustomRole`, dueño = `custom-roles`):
  resolverse vía **port** que el módulo dueño define (§3.7), NO import directo de otro módulo (§3.3).
- Filtrado multi-tenant por `organizationId` en la query (§4.2, defense in depth).
- **Seam** explícito (función/punto de extensión documentado) donde mañana se aplica el filtro por
  vertical + packs (§3.1). Hoy es no-op porque solo existe Contabilidad.

**Frontend**
- `api/` nuevo (función pura de request) + `hooks/` nuevo (wrapper TanStack Query) en la feature
  que sea hogar del consumo (`memberships`), siguiendo Screaming Architecture.
- Cablear el `<Select>` de `invite-member-dialog.tsx` a ese hook: render dinámico de system roles +
  custom roles; al elegir un custom, setear `roleKind: 'custom'` + `customRoleId` (el `onSubmit` ya
  lo soporta). Remover el comentario placeholder `:41-43` y el copy "Los roles personalizados llegan
  en Configuración → Roles" (`:156`).
- Manejo de loading/error del nuevo query SIN side-effects en el cuerpo del componente (Anti-F-13).
- El componente consume del **hook**, nunca de `api/` directo (§8 frontend, Anti-F-12).

**Tests**
- Backend: integration del endpoint — devuelve system + custom del tenant, filtra cross-tenant,
  403 sin `miembros.invite`.
- Frontend: test del dialog — los custom roles del tenant aparecen en el select y al elegir uno el
  body lleva `customRoleId` (y NO `systemRole`). (Hoy no hay tests en `memberships/components/`.)

### Fuera (NON-GOALS)

- **NO** implementar el filtro real por vertical + packs (§3.1). Solo dejar el seam; el filtro se
  escribe cuando llegue granja. Hoy sería código muerto (un solo vertical).
- **NO** tocar `register` / onboarding / `register-and-onboard` (eso es BUG #3, change separado).
- **NO** cerrar ninguna decisión abierta del doc §10 (super-admin, exclusividad de vertical, etc.).
- **NO** construir el flujo de "cambiar el rol de un miembro existente". El endpoint queda
  reutilizable para eso, pero la UI de cambio de rol no entra en este change.
- **NO** modificar `GET /api/custom-roles` ni su gating — sigue intacto para `/settings/roles`.

## Enfoque (alto nivel — el diseño detallado es la fase design)

1. **Backend**: el módulo que aloje el endpoint expone un controller method gateado por
   `miembros.invite`. Para obtener los custom roles, declara un **port** (interface) "lector de roles
   asignables" que el módulo dueño de `CustomRole` implementa con un adapter (registra el adapter en
   su `*.module.ts`). El service compone la lista [system roles fijos] + [custom roles del tenant],
   pasando por un punto de extensión `filtrarPorVerticalYPacks(...)` que hoy retorna la lista tal cual.
2. **Frontend**: nuevo `api/get-roles-asignables` + `hooks/use-roles-asignables`; el dialog consume el
   hook y renderiza el select dinámicamente. Si el query falla, banner/estado inline (no toast en render).
3. **Naming/URLs**: dominio en español, sufijos NestJS en inglés, archivos kebab-case con doble dot,
   URL en español (la forma exacta se decide en design — ver preguntas abiertas).

## Preguntas abiertas para la fase design (NO decididas aquí — surgidas para el design)

1. **¿Qué módulo es dueño del endpoint: `invitations` o `memberships`?** El recurso "roles asignables"
   sirve para invitar HOY y para cambiar el rol de un miembro MAÑANA. ¿`memberships` es el hogar más
   amplio/correcto, o vive en `invitations` por estar atado al flujo de invitación actual? Define el
   scope del commit (§9.1) y dónde vive el port.
2. **¿Un ADMIN puede asignar el rol OWNER al invitar?** Hoy el select estático ofrece OWNER a cualquiera
   que abra el dialog. ¿Es correcto que un ADMIN otorgue OWNER, o eso debe restringirse (solo OWNER puede
   crear OWNER)? Es **política RBAC** — afecta qué system roles devuelve el endpoint según el rol del solicitante.
3. **Forma de la respuesta**: ¿system roles y custom roles en una sola lista homogénea o separados en dos
   grupos? ¿Qué campos por ítem (`id`, `name`, `kind: 'system' | 'custom'`, descripción)? Impacta cómo el
   front mapea a `roleKind`/`systemRole`/`customRoleId`.
4. **URL del endpoint** (español, dominio): p. ej. `GET /api/invitaciones/roles-asignables` vs
   `GET /api/miembros/roles-asignables`. Depende de la respuesta a la pregunta 1.

## Riesgos

- **R1 — Doble fuente de "listar roles del tenant"**: el endpoint nuevo y `GET /api/custom-roles`
  listan custom roles del mismo tenant con shape distinto. Mitigación: el port lo aísla; el endpoint
  nuevo es el único con la semántica "asignable" (system + custom + futuro filtro). Aceptado: la
  duplicación es intencional para no acoplar scopes (§4).
- **R2 — Pregunta 2 sin cerrar bloquea el shape**: si la política "ADMIN puede dar OWNER" cambia, cambia
  qué devuelve el endpoint. Debe resolverse en design antes de spec, no después.
- **R3 — Seam mal ubicado**: si el punto de extensión vertical+packs queda en el frontend o en el adapter
  en vez del service, el día que llegue granja habría que reabrir. El design debe fijarlo en el service
  (capa de composición), no en el adapter de lectura.
- **R4 — Gating frontend es UX, no seguridad** (doc §9 nota): ocultar OWNER/custom roles en el select NO
  reemplaza el enforcement backend. El backend ya valida `belongsToTenant` en `InvitationsService.create`;
  cualquier restricción de política (pregunta 2) debe enforzarse también en backend, no solo en el select.

## Cómo se prueba (alto nivel)

- **Backend (integration)**: con dos tenants y custom roles distintos — el endpoint del tenant A devuelve
  solo sus custom roles + system roles; nunca los del tenant B; 403 para un usuario sin `miembros.invite`.
- **Frontend (Testing Library)**: montar el dialog con custom roles mockeados vía el hook; verificar que
  aparecen en el select y que al seleccionar uno el `onSubmit` arma `{ customRoleId }` sin `systemRole`.
- **Manual / smoke**: crear un CustomRole en `/settings/roles`, abrir "Invitar miembro" y confirmar que
  el rol nuevo aparece y se puede invitar con él (cierra el reporte original de BUG #2).
