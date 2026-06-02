# Delta for platform-admin-ui

<!--
Última edición: 2026-06-02
Última revisión contra core: 2026-06-02
Owner: backend-lead
-->

> Fecha: 2026-06-02
> Fase: spec
> Change: `platform-admin-v1.1`
> Slices: 1 y 2
> Stack: frontend (Vite + React)
> Capability: MODIFICADA — delta sobre `openspec/specs/platform-admin-ui/spec.md`

---

## Propósito del delta

El panel suma (Slice 1) navegación desde la lista de orgs hacia la vista de miembros y
(Slice 2) acción "Impersonar" por miembro en esa vista, con dialog de confirmación y
flujo completo de entrada/salida de impersonation.

REQ-PAUI-01 a REQ-PAUI-10 permanecen INTACTOS. Solo se agregan nuevos requirements.

---

## ADDED Requirements

---

### REQ-PAUI-11 (Slice 1): Navegación desde la lista de orgs a la vista de miembros

La tabla de organizaciones en `/platform-admin/orgs` DEBE incluir por cada fila un
enlace o botón que navegue a `/platform-admin/orgs/:id/members`. Puede ser una acción
en el menú de fila o un enlace directo sobre el nombre de la org.

#### Escenario: clic en enlace de miembros → navegación (Slice 1)

- DADO la tabla de orgs con al menos una fila
- CUANDO el SA acciona el enlace/botón de miembros de una org
- ENTONCES el router navega a `/platform-admin/orgs/{id}/members`
- Y la URL es bookmark-able (ruta dedicada, no drawer efímero)

#### Escenario: org sin miembros — enlace igualmente visible (Slice 1)

- DADO una org con 0 miembros
- CUANDO el SA ve la fila en la tabla
- ENTONCES el enlace/botón de miembros sigue siendo visible y navegable
- Y la página de destino muestra empty state (no error)

---

### REQ-PAUI-12 (Slice 2): Botón "Impersonar" por miembro en vista de miembros

La tabla de miembros (`/platform-admin/orgs/:id/members`) DEBE incluir por cada fila
un botón "Impersonar" SALVO cuando:
- El miembro tiene `systemRole === 'OWNER'` (invariante `IMPERSONATION_TARGET_ES_OWNER`).
- El miembro es el propio SA (`userId === currentUser.sub`) (invariante `IMPERSONATION_SELF_NO_PERMITIDA`).

Para esos casos el botón DEBE estar ausente o deshabilitado con tooltip explicativo.

#### Escenario: botón "Impersonar" visible para miembro regular (Slice 2)

- DADO un miembro sin `systemRole === 'OWNER'` y que no es el SA logueado
- CUANDO el SA ve la fila del miembro
- ENTONCES el botón "Impersonar" está visible y habilitado

#### Escenario: botón oculto/deshabilitado para OWNER (Slice 2)

- DADO un miembro con `systemRole === 'OWNER'`
- CUANDO el SA ve la fila
- ENTONCES el botón "Impersonar" está ausente o deshabilitado con indicación visual

#### Escenario: botón oculto/deshabilitado para el SA mismo (Slice 2)

- DADO la fila del propio SA en la lista
- CUANDO se renderiza la tabla
- ENTONCES el botón "Impersonar" está ausente o deshabilitado

---

### REQ-PAUI-13 (Slice 2): Dialog de confirmación de impersonation

Al accionar "Impersonar", DEBE abrirse un dialog (`PlatformImpersonateDialog`) que
solicita `reason` (mínimo 10 caracteres) y confirma la org target. Al confirmar,
llama `POST /admin/impersonate` con `{ targetUserId, reason, organizationId }` (donde
`organizationId` es el `:id` del parámetro de ruta). La validación de `reason` DEBE
hacerse en cliente antes de enviar.

#### Escenario: dialog se abre con contexto correcto (Slice 2)

- DADO el SA acciona "Impersonar" para el miembro `M` de `org-X`
- CUANDO se abre el dialog
- ENTONCES muestra el nombre/email del target y la org
- Y tiene un campo `reason` vacío y botón de confirmar deshabilitado

#### Escenario: validación de reason en cliente (Slice 2)

- DADO el dialog abierto con `reason` de menos de 10 caracteres
- CUANDO el SA intenta confirmar
- ENTONCES se muestra error de validación en español y NO se llama al backend

#### Escenario: impersonation exitosa — entra al contexto del target (Slice 2)

- DADO el dialog con `reason` válido (≥ 10 caracteres)
- CUANDO el SA confirma y el backend responde `201` con `impersonationToken`
- ENTONCES el token del target es seteado en el store (`setToken(impersonationToken)`)
- Y la UI navega fuera de `/platform-admin` hacia el contexto del target (bajo `DashboardShell`)
- Y el banner rojo de impersonation se monta en `DashboardShell`

#### Escenario: error del backend (ej. target OWNER, self, desactivado) — dialog abierto (Slice 2)

- DADO el backend responde con error (403 `IMPERSONATION_TARGET_ES_OWNER`, etc.)
- CUANDO falla la mutation
- ENTONCES se muestra `toast.error` con el mensaje del backend en español
- Y el dialog permanece abierto para que el SA pueda corregir o cancelar

#### Escenario: submit deshabilitado mientras envía (Slice 2)

- DADO la mutation está `isPending`
- CUANDO se renderiza el dialog
- ENTONCES el botón de confirmar está deshabilitado (evita doble envío)

---

### REQ-PAUI-14 (Slice 2): Salida de impersonation — regreso al panel

Al accionar "Salir" en el banner de impersonation, `useEndImpersonation` hace
`POST /auth/refresh` que restaura el JWT del SA org-less. El SA queda sin `activeTenantId`
y `IndexRedirect` lo lleva a `/platform-admin`. Este comportamiento NO requiere cambio de
código (diseño §3 "flujo de salida intacto"); este REQ lo documenta como invariante testeable.

#### Escenario: "Salir" restaura el SA al panel (Slice 2)

- DADO un SA dentro de una sesión de impersonation iniciada desde `/platform-admin/orgs/:id/members`
- CUANDO acciona "Salir" en el banner rojo
- ENTONCES el refresh restaura el token SA org-less (sin `activeTenantId`)
- Y `IndexRedirect` navega a `/platform-admin` (ramificación SA-sin-tenant, REQ-PAUI-04 intacto)
- Y el banner de impersonation desaparece (ya no está bajo `DashboardShell`)

---

## Notas de scope de este delta

- El `ImpersonationBanner` y `useEndImpersonation` NO cambian (ya funcionan para este flujo).
- `PlatformShell` NO monta el banner — vive solo en `DashboardShell`. El SA bajo `/platform-admin` no ve banner.
- `start-impersonation.ts` (api front) DEBE aceptar `organizationId?` en el request body (alineado con REQ-SA-17 delta).
