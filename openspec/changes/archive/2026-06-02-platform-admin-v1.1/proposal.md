# Propuesta de cambio — Panel super-admin v1.1 (miembros + impersonation)

> Fase SDD: **proposal**. Artifact store: hybrid (este archivo + engram `sdd/platform-admin-v1.1/proposal`).
> Stack afectado: **backend** (NestJS + Prisma) + **frontend** (Vite/React). Fecha: 2026-06-02.
> Continúa el change `super-admin` (#118-#127, backend) y `platform-admin-ui` v1 (#131-#138, UI).

---

## 1. Intent / Por qué

El panel `/platform-admin` v1 deja al super-admin **ciego sobre las personas**: lista orgs, cambia
status, edita entitlement y feature-flags, pero **no muestra quién está dentro de cada org ni permite
actuar como ellos**. El backend ya soporta ambas cosas (impersonation cross-tenant en
`impersonation.service.ts:48-144`, lectura de miembros en `MembershipsReaderPort.findAllByTenant`), pero
NO hay endpoint de plataforma para miembros ni UI que lo consuma. v1.1 cierra ese hueco en **dos slices
secuenciales**: primero VER los miembros de cualquier org, luego ACTUAR (impersonar) sobre ellos.

## 2. Scope

### Entra

**Slice 1 — Miembros cross-tenant (read-only)**
- Backend: endpoint de plataforma `GET /admin/platform/orgs/:id/members` (org-less, `SuperAdminGuard`),
  delegando en `MembershipsReaderPort.findAllByTenant` vía port. `PlatformModule` importa
  `MembershipsReaderModule`.
- Frontend: ruta `/platform-admin/orgs/:id/members` bajo `PlatformShell` + `RequireSuperAdmin`; lista de
  miembros (email, displayName, systemRole, customRole, estado activo/desactivado).

**Slice 2 — Impersonation desde el panel**
- Backend: permitir que el `POST /admin/impersonate` reciba la **org target explícita** para el SA
  cross-tenant (hoy el `tenantId` no llega bien para un SA sin tenant activo — ver §4 Riesgos). Sin
  endpoint nuevo si el diseño resuelve pasar la org en el body; con endpoint nuevo si se decide separar.
- Frontend: botón "Impersonar" por miembro en la lista del Slice 1 → diálogo (reason min 10) → arranca
  impersonation cross-tenant y entra al contexto del target (reusar banner rojo existente).

### NO entra (diferido)
- **Historial / auditoría de impersonations** (no hay GET de historial hoy; queda fuera).
- **Onboarding o invitación de miembros** desde el panel (solo lectura + impersonate).
- **Editar/quitar miembros, cambiar roles** cross-tenant desde el panel.
- **Portfolio cross-tenant rico** (`plataforma-multi-vertical.md §10.5`).
- **Generalizar revocación epoch a logout-all** (deuda §10.10, ortogonal).

## 3. Capabilities

> Research hecho contra `openspec/specs/`: existen `platform-admin-ui` (UI v1) y `super-admin` (backend).

### New Capabilities
- `platform-members`: lectura cross-tenant de los miembros de una org por el super-admin (endpoint de
  plataforma + vista de panel). Cubre Slice 1.

### Modified Capabilities
- `super-admin`: la impersonation cross-tenant existe pero hoy el `tenantId` del target no llega para un
  SA sin tenant activo; el requisito de "cómo el SA indica la org target" se formaliza. Cubre Slice 2.
- `platform-admin-ui`: el panel suma ruta de miembros y acción de impersonate (navegación + gating).

## 4. Approach de alto nivel

**Slice 1** es de bajo riesgo y aditivo: nuevo endpoint org-less gateado por `SuperAdminGuard`,
auditado por `PlatformAuditInterceptor` (toda lectura cross-tenant del SA se audita, CLAUDE.md §4.2),
delegando en el port de miembros ya existente. UI replica el patrón `api/* + hooks TanStack` del panel.

**Slice 2** depende de Slice 1 (el botón vive en su lista). El núcleo de diseño es **cómo el SA indica
la org target** en `POST /admin/impersonate`: el service `start(adminUserId, tenantId, dto, callerEsSuperAdmin)`
hoy toma `tenantId` del contexto, pero un SA org-less no tiene tenant activo. **Esto se resuelve en la
fase design**, no acá. Resto del flujo de impersonation (JWT 30min no-refrescable, doble auditoría,
no impersonar OWNER, banner de salida) ya existe e intacto.

## 5. Affected Areas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `backend/src/platform/platform-admin.controller.ts` | Modified | + `GET .../orgs/:id/members` (Slice 1) |
| `backend/src/platform/platform.module.ts` | Modified | importa `MembershipsReaderModule` |
| `backend/src/impersonation/*` | Modified | org target explícita para SA cross-tenant (Slice 2) |
| `frontend/src/features/platform-admin/{api,hooks,components}/` | New | vista miembros + acción impersonate |
| `frontend/src/router.tsx` | Modified | ruta `/platform-admin/orgs/:id/members` |
| `frontend/src/types/api.ts` | Modified | tipos de miembros de plataforma |

## 6. Risks

| Riesgo | Prob. | Mitigación |
|--------|-------|------------|
| **Org target del impersonation cross-tenant**: el SA org-less no tiene `tenantId` activo; el service lo toma del contexto. Pasarlo mal abre impersonation contra la org equivocada o rompe la auditoría. | **Alta** | DECISIÓN DE DISEÑO (fase design): definir si la org viaja en body/param y cómo el controller la propaga al service. Mantener doble auditoría + no-impersonar-OWNER. |
| Lectura cross-tenant de miembros sin auditar | Med | `PlatformAuditInterceptor` ya cubre las rutas `/admin/platform/*`; verificar que el GET quede registrado. |
| Banner de impersonation asume contexto del tenant activo (x-tenant-id del store) | Med | El nuevo JWT del target trae su `activeTenantId`; validar que el banner/salida funcione iniciado desde el panel org-less. |

## 7. Rollback Plan
Cada slice es un PR squash independiente y aditivo. Revertir Slice 2 (`git revert <sha>`) deja Slice 1
operativo; revertir Slice 1 quita la ruta de miembros sin afectar el resto del panel. Ningún cambio de
schema/migración previsto.

## 8. Dependencies
- Slice 2 **depende de** Slice 1 (la acción de impersonate vive en la lista de miembros).
- Backend de impersonation cross-tenant ya mergeado (#126); port de miembros ya existe.

## 9. Success Criteria
- [ ] El SA ve, desde el panel, los miembros (activos y desactivados) de cualquier org.
- [ ] La lectura cross-tenant de miembros queda auditada en `platform_audit`.
- [ ] El SA inicia impersonation de un miembro de una org ajena desde el panel y entra a su contexto.
- [ ] La org target del impersonation se determina sin ambigüedad (no usa un tenant activo inexistente).
- [ ] Tests `+`/`−`: un no-SA no accede a ninguno de los dos endpoints (403).
