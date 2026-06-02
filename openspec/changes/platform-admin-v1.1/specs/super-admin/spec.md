# Delta for super-admin

<!--
Última edición: 2026-06-02
Última revisión contra core: 2026-06-02
Owner: backend-lead
-->

> Fecha: 2026-06-02
> Fase: spec
> Change: `platform-admin-v1.1`
> Slice: 2
> Stack: backend (NestJS)
> Capability: MODIFICADA — delta sobre `openspec/specs/super-admin/spec.md`

---

## Propósito del delta

Formalizar cómo el super-admin org-less indica la organización target al llamar
`POST /admin/impersonate`. El service ya recibe `organizationId` como parámetro;
el hueco era que el controller lo tomaba de `resolveTenantId(req)`, que falla
para un SA sin tenant activo. Este delta agrega `organizationId?` al DTO y
actualiza el controller para que el SA lo pase explícitamente en el body.

**NO se re-especifican** REQ-SA-01 a REQ-SA-16. Solo se modifica REQ-SA-17.

---

## MODIFIED Requirements

### REQ-SA-17: Super-admin puede impersonar en org donde no es miembro

El `ImpersonationService.start()` DEBE incluir una rama aditiva `if (caller.isSuperAdmin)`
que omite el requisito de `SystemRole.OWNER` en la org destino. El resto del flujo de
impersonation (doble auditoría, ventana de 30 min, token de impersonation) permanece INTACTO.

La restricción `TargetEsOwnerError` (no impersonar a un OWNER) DEBE mantenerse también
para el super-admin. Un super-admin NO puede impersonar a un OWNER.

`StartImpersonationDto` DEBE incluir el campo opcional `organizationId?: string`
(`@IsOptional @IsUUID`). El controller DEBE resolver la org destino según el caller:

```
callerEsSuperAdmin && dto.organizationId !== undefined
  ? dto.organizationId          // SA org-less: org explícita en body
  : resolveTenantId(req)        // OWNER: header X-Tenant-ID o activeTenantId (intacto)
```

Si el SA no envía `organizationId` en el body y no tiene tenant activo, `resolveTenantId`
lanza `ForbiddenException('Se requiere contexto de organización')` — ese es el error correcto.

(Previously: el controller solo usaba `resolveTenantId(req)`; no existía vía para que el SA
org-less pasara la org target, lo que impedía impersonar cross-tenant desde el panel.)

#### Escenario: SA impersona usuario no-OWNER en org ajena con `organizationId` (caso positivo — Slice 2)

- DADO un super-admin sin membresía en `org-X`
- Y un usuario `usuario-regular` miembro no-OWNER de `org-X`
- CUANDO el SA llama `POST /admin/impersonate` con `{ targetUserId, reason, organizationId: 'org-X' }`
- ENTONCES recibe `201` con `{ impersonationToken, expiresAt, impersonationId }`
- Y el token de impersonation NO contiene `isSuperAdmin: true` (REQ-SA-04 intacto)
- Y se crea fila en `ImpersonationLog` y en `platform_audit` con `targetOrganizationId = 'org-X'`

#### Escenario: SA sin `organizationId` y sin tenant activo → error de contexto (caso negativo — Slice 2)

- DADO un super-admin org-less (sin `activeTenantId` en JWT, sin `X-Tenant-ID`)
- CUANDO llama `POST /admin/impersonate` sin `organizationId` en el body
- ENTONCES recibe `403` con mensaje "Se requiere contexto de organización"
- Y NO se genera token de impersonation

#### Escenario: SA intenta impersonar a OWNER de org ajena → 403 (invariante de seguridad)

- DADO un super-admin y un usuario OWNER de `org-X`
- CUANDO el SA llama `POST /admin/impersonate` con `{ targetUserId: <owner-id>, organizationId: 'org-X' }`
- ENTONCES recibe error `IMPERSONATION_TARGET_ES_OWNER` (403)
- Y no se genera token de impersonation

#### Escenario: SA no envía `organizationId` pero tiene tenant activo → path OWNER (retrocompat — Slice 2)

- DADO un super-admin con `activeTenantId` en su JWT (o `X-Tenant-ID` en header)
- CUANDO llama `POST /admin/impersonate` sin `organizationId` en el body
- ENTONCES el controller resuelve org desde `resolveTenantId(req)` (path OWNER intacto)
- Y el flujo procede como antes de este change

#### Escenario: OWNER del tenant sin `organizationId` → comportamiento INTACTO (regresión — Slice 2)

- DADO un OWNER de `org-Y` con `activeTenantId` en su JWT
- Y un miembro no-OWNER de `org-Y`
- CUANDO el OWNER llama `POST /admin/impersonate` con `{ targetUserId, reason }` (sin `organizationId`)
- ENTONCES recibe `201` con el token de impersonation — exactamente como antes de este change
- Y el campo `organizationId` ausente no afecta el comportamiento del OWNER

#### Escenario: super-admin impersona en org donde el target NO es miembro → 403

- DADO un super-admin con `organizationId = 'org-X'` en el body
- Y el `targetUserId` no tiene membresía en `org-X`
- CUANDO llama `POST /admin/impersonate`
- ENTONCES recibe error `IMPERSONATION_TARGET_NO_MIEMBRO` (403)
- Y no se genera token de impersonation

#### Escenario: super-admin no puede impersonarse a sí mismo (invariante intacto)

- DADO un super-admin que envía su propio `sub` como `targetUserId`
- CUANDO llama `POST /admin/impersonate`
- ENTONCES recibe error `IMPERSONATION_SELF_NO_PERMITIDA` (403)

#### Escenario: usuario regular no-miembro no puede impersonar (invariante §4.2 — Slice 2)

- DADO un OWNER de `org-A` (sin `isSuperAdmin`) que envía `organizationId: 'org-B'`
- CUANDO llama `POST /admin/impersonate`
- ENTONCES `organizationId` en el body es ignorado (el caller no es SA)
- Y `resolveTenantId(req)` resuelve la org desde el contexto del caller
- Y el service rechaza la impersonation (target no es de `org-A` o caller no es OWNER de `org-B`)

#### Escenario: impersonation cross-tenant del SA queda en `platform_audit` (invariante REQ-SA-09)

- DADO un super-admin que impersona en `org-X` vía `organizationId`
- CUANDO el service completa exitosamente
- ENTONCES se crea fila en `platform_audit` con `action = 'platform.impersonation.start'`, `targetOrganizationId = 'org-X'`, `actorUserId` del SA, datos del target en `payload`
- Y también se crea registro en `ImpersonationLog` (auditoría existente intacta)
