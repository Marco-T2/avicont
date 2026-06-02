# Verification Report — platform-admin-v1.1

<!--
Generado: 2026-06-02
Modo: Strict TDD
Veredicto: APROBADO_CON_WARNINGS
-->

**Change**: platform-admin-v1.1  
**Spec date**: 2026-06-02  
**Branch verificada**: `feat/platform-v1.1-impersonation`  
**Mode**: Strict TDD

---

## Completeness

| Métrica | Valor |
|---------|-------|
| Tasks totales | 34 |
| Tasks completas | 32 |
| Tasks incompletas | 2 |

Tareas pendientes (esperado — son commit+PR post-verify):
- `S1-C2`: Commit + PR Slice 1
- `S2-C3`: Commit + PR Slice 2

---

## Build & Tests Execution

| Comando | Exit code | Resultado |
|---------|-----------|-----------|
| `backend: pnpm exec tsc --noEmit` | 0 | ✅ Passed |
| `backend: pnpm run lint` | 0 | ✅ Passed |
| `frontend: pnpm exec tsc -b` | 0 | ✅ Passed |
| `frontend: pnpm run lint` | 0 | ✅ Passed |
| `backend e2e: impersonation.e2e-spec.ts + platform-members.e2e-spec.ts` | 0 | ✅ 25 passed |
| `backend unit: impersonation.controller.spec.ts` | 0 | ✅ 7 passed |
| `frontend vitest: platform-admin + impersonation` | 0 | ✅ 96 passed (24 files) |

---

## Issues Found

### CRITICAL — None

### WARNING

**W1 — Spec-code drift conocido: `TargetNoMiembroError` → HTTP 404, no 403**
- Spec (`specs/super-admin/spec.md` línea 99): "ENTONCES recibe error `IMPERSONATION_TARGET_NO_MIEMBRO` **(403)**"
- Código: `TargetNoMiembroError extends NotFoundError` → HTTP **404** (intencional por diseño semántico)
- Test: `expect(res.status).toBe(404)` — test matches code, not spec
- Acción: reconciliar spec al archivar. NO cambiar el código.

**W2 — Gap en test de seguridad: "OWNER sends organizationId → ignorado"**
- El test e2e (`impersonation.e2e-spec.ts` línea 490) prueba el happy path (201 porque el target SÍ es miembro de la org propia), pero no hay test negativo dedicado que pruebe que un OWNER NO puede impersonar a un miembro de org-B enviando `organizationId: orgB`.
- La invariante SÍ está probada a nivel unit (controller.spec.ts línea 135: `service.start` recibe `ownerOrgId`, no `'ajena-org-id'`).
- No es un bug; es un gap de cobertura explícita del caso adversarial.
- Recomendación: agregar test e2e negativo: OWNER de org-A + `organizationId: orgB` + target solo en org-B → 403.

**W3 — Botón "Impersonar" ausente (null) en vez de deshabilitado con tooltip para OWNER/self/desactivado**
- Spec REQ-PAUI-12: "el botón DEBE estar ausente **o** deshabilitado con tooltip explicativo"
- Código: renderiza `null` (ausente, sin tooltip)
- Test acepta ambas opciones (queryByRole → null = ausente, pass)
- Funcionalmente correcto. UX podría mejorar con tooltip que explique por qué.
- No es bloqueante.

**W4 — Test de `platform_audit` para GET members no verifica el campo `action`**
- Test (línea 139-144) verifica `targetOrganizationId` pero no el campo `action`
- Valor real escrito: `GET /admin/platform/orgs/:id/members`
- Riesgo bajo; el campo crítico (targetOrganizationId) sí se verifica.

### SUGGESTION

**S1** — Agregar test de controller para SA con `dto.organizationId = undefined` explícito (distinto del SA-con-xTenantId).

**S2** — REQ-PAUI-14 (salida de impersonation → /platform-admin) no tiene test dedicado frontend. Aceptable porque no hubo cambio de código en `IndexRedirect`/`useEndImpersonation`.

---

## Spec Compliance Matrix

| Requirement | Escenario | Test | Resultado |
|---|---|---|---|
| REQ-PM-01 | SA lista miembros existente → 200 + shape completa | `platform-members.e2e-spec.ts` | ✅ COMPLIANT |
| REQ-PM-01 | platform_audit con targetOrganizationId | `platform-members.e2e-spec.ts` | ✅ COMPLIANT |
| REQ-PM-01 | org inexistente → 404 PLATFORM_ORG_NO_ENCONTRADA | `platform-members.e2e-spec.ts` | ✅ COMPLIANT |
| REQ-PM-01 | OWNER sin isSuperAdmin → 403 | `platform-members.e2e-spec.ts` | ✅ COMPLIANT |
| REQ-PM-01 | sin token → 401 | `platform-members.e2e-spec.ts` | ✅ COMPLIANT |
| REQ-PM-02 | tabla con filas (email, displayName, roles, estado, createdAt) | `org-members-page.test.tsx` | ✅ COMPLIANT |
| REQ-PM-02 | miembro desactivado distinguible visualmente | `org-members-page.test.tsx` | ✅ COMPLIANT |
| REQ-PM-02 | loading → skeleton | `org-members-page.test.tsx` | ✅ COMPLIANT |
| REQ-PM-02 | vacío → empty state "No hay miembros" | `org-members-page.test.tsx` | ✅ COMPLIANT |
| REQ-PM-02 | error → mensaje español | `org-members-page.test.tsx` | ✅ COMPLIANT |
| REQ-PM-02 | ruta gateada no-SA → RequireSuperAdmin | `router.tsx` (structural, sin test dedicado de redirect) | ⚠️ PARTIAL |
| REQ-SA-17 delta | SA + organizationId → 201 + token sin isSuperAdmin | `impersonation.e2e-spec.ts` | ✅ COMPLIANT |
| REQ-SA-17 delta | ImpersonationLog + platform_audit ambos creados | `impersonation.e2e-spec.ts` | ✅ COMPLIANT |
| REQ-SA-17 delta | SA sin organizationId y sin tenant → 403 | `impersonation.e2e-spec.ts` | ✅ COMPLIANT |
| REQ-SA-17 delta | SA impersona OWNER → 403 | `impersonation.e2e-spec.ts` | ✅ COMPLIANT |
| REQ-SA-17 delta | SA target no miembro → (spec 403) código 404 | `impersonation.e2e-spec.ts` | ⚠️ PARTIAL (drift W1) |
| REQ-SA-17 delta | SA self-impersonation → 400 | `impersonation.e2e-spec.ts` | ✅ COMPLIANT |
| REQ-SA-17 delta | OWNER sin organizationId → 201 retrocompat | `impersonation.e2e-spec.ts` | ✅ COMPLIANT |
| REQ-SA-17 delta | OWNER envía organizationId → ignorado | `impersonation.e2e-spec.ts` + `controller.spec.ts` | ✅ COMPLIANT |
| REQ-SA-17 delta | platform_audit action + targetOrganizationId correctos | `impersonation.e2e-spec.ts` | ✅ COMPLIANT |
| REQ-PAUI-11 | clic → navega a /orgs/{id}/members | `orgs-page.test.tsx` (existing) | ✅ COMPLIANT |
| REQ-PAUI-12 | miembro regular → botón habilitado | `platform-members-table.test.tsx` | ✅ COMPLIANT |
| REQ-PAUI-12 | OWNER → botón ausente/disabled | `platform-members-table.test.tsx` | ✅ COMPLIANT |
| REQ-PAUI-12 | self → botón ausente/disabled | `platform-members-table.test.tsx` | ✅ COMPLIANT |
| REQ-PAUI-12 | click → abre PlatformImpersonateDialog | `platform-members-table.test.tsx` | ✅ COMPLIANT |
| REQ-PAUI-13 | dialog con contexto del target | `platform-impersonate-dialog.test.tsx` | ✅ COMPLIANT |
| REQ-PAUI-13 | reason vacío → no llama backend | `platform-impersonate-dialog.test.tsx` | ✅ COMPLIANT |
| REQ-PAUI-13 | reason < 10 → error validación, no backend | `platform-impersonate-dialog.test.tsx` | ✅ COMPLIANT |
| REQ-PAUI-13 | reason válido → mutation con { targetUserId, reason, organizationId } | `platform-impersonate-dialog.test.tsx` | ✅ COMPLIANT |
| REQ-PAUI-13 | isPending → botón disabled | `platform-impersonate-dialog.test.tsx` | ✅ COMPLIANT |
| REQ-PAUI-13 | éxito → navigate('/') | `platform-impersonate-dialog.test.tsx` | ✅ COMPLIANT |
| REQ-PAUI-13 | error backend → toast.error + dialog abierto | `platform-impersonate-dialog.test.tsx` | ✅ COMPLIANT |
| REQ-PAUI-14 | salida → restore SA + IndexRedirect → /platform-admin | No test (sin cambio de código) | ⚠️ PARTIAL |

**Compliance summary**: 29/32 scenarios COMPLIANT · 3 PARTIAL · 0 FAILING · 0 UNTESTED

---

## Security Invariants — Análisis Foco (§5.6/§5.4)

| Invariante | Estado | Evidencia |
|---|---|---|
| No-SA no puede impersonar cross-tenant | ✅ INTACTO | Ternario en controller: `callerEsSuperAdmin && dto.organizationId !== undefined`. OWNER ignora organizationId body. Probado e2e + unit. |
| Service invariants sin modificar | ✅ INTACTO | `ImpersonationService` no fue tocado. Todos los errors domain checks en place. |
| Token impersonation NO lleva isSuperAdmin | ✅ INTACTO | `ImpersonationJwtClaims.forImpersonation` nunca agrega claim. Probado en 2 tests. |
| SA no puede impersonar a OWNER | ✅ INTACTO | `TargetEsOwnerError` en service, probado e2e |
| Doble auditoría SA: ImpersonationLog + platform_audit | ✅ INTACTO | Service escribe ImpersonationLog siempre; `if(callerEsSuperAdmin)` escribe platform_audit. Probado e2e. |
| OWNER retrocompat (sin organizationId) | ✅ INTACTO | Probado e2e regresión |

---

## Coherence (Design)

| Decisión de diseño | Seguida | Notas |
|---|---|---|
| `req.tenantId = id` antes del interceptor (GET listarMiembros) | ✅ | Patrón idéntico a `actualizarStatus`. Interceptor evalúa post-handler. |
| ImpersonationBanner/useEndImpersonation sin cambios | ✅ | Flujo de salida intacto; DashboardShell monta banner. |
| PlatformShell NO monta banner | ✅ | SA bajo /platform-admin no ve banner. |
| Spread condicional para organizationId (exactOptionalPropertyTypes) | ✅ | `start-impersonation.ts` usa spread condicional. |
| Service firma intacta | ✅ | `start(adminUserId, organizationId, dto, callerEsSuperAdmin)` sin cambios. |

---

## Veredicto

**APROBADO_CON_WARNINGS**

- 0 issues CRITICAL
- 4 WARNINGS (1 drift spec conocido, 1 gap de test de seguridad no bloqueante, 2 menores)
- 32/34 tasks completas (las 2 pendientes son commit+PR — post-verify)
- Todos los exit codes: 0
- Seguridad: invariantes intactos, ningún bypass posible
