# Super-admin de plataforma — Guía de diseño (§10.1)

> **Estado: GUÍA DE DISEÑO / NO IMPLEMENTADO** (2026-06-01) — Documento que cierra
> la decisión abierta §10.1 de `docs/disenos/plataforma-multi-vertical.md` y guía la
> futura sesión de implementación. **No hay código aún**: esto describe el QUÉ y el
> CÓMO antes de construir.
>
> Este doc **presupone** el `CLAUDE.md` raíz (multi-tenancy flat §4.2, seguridad
> §5/§10.4), `docs/claude/seguridad.md` y `docs/disenos/plataforma-multi-vertical.md`
> (modelo de tres alcances de administración §4, entitlement vs activación §5). Si
> algo acá contradice un invariante del core → va al core primero (regla anti-drift).
>
> **Fuente de verdad de implementación**: el código y `schema.prisma`. Las
> referencias `archivo:línea` reflejan el estado al 2026-06-01 (exploración previa al
> build); verificá contra el código actual antes de implementar.

El super-admin es el **alcance de plataforma** del modelo de administración
(`plataforma-multi-vertical.md` §4): el operador del SaaS que crea/suspende orgs,
asigna entitlement (qué verticales y packs puede activar cada org), administra
feature flags globales (`sistema.*`) y tiene potestad cross-tenant auditada. Hoy
ese alcance **no tiene sujeto** en el modelo de datos. Este documento lo modela.

---

## 1. Decisión tomada

**§10.1 cerrada: enfoque (a) — identidad de plataforma en `User` (`isSuperAdmin`).**

El super-admin es un atributo de **identidad de plataforma**, coherente con
`plataforma-multi-vertical.md` §3.1: *"`User` es identidad de plataforma. No
pertenece a un vertical ni a un tenant."* El super-admin tampoco: opera POR ENCIMA
de los tenants, no dentro de uno. Por eso vive en `User`, **no** como `SystemRole`
(que es por-org por definición, `Membership.systemRole`).

Alternativas descartadas (análisis completo en el explore de esta sesión):

| Enfoque | Por qué se descartó |
|---|---|
| **(b) Org-plataforma especial** | Obliga a modificar `ImpersonationService.start()` para relajar el check de membresía cross-tenant — lógica sensible, cadena de inferencia confusa ("soy OWNER de org X que es la plataforma, luego puedo en org Z"). (a) lo resuelve con un guard nuevo sin tocar impersonation. |
| **(c) Manual/SQL** | Bypassea invariantes y auditoría; `UPDATE` directo en BD está prohibido por CLAUDE.md §4.3. Útil solo como **interino** mientras no se construye (a) — ver §11. |

---

## 2. Estado actual — lo que NO existe

El "super-admin" es hoy **diseño sobre papel**. La contradicción aparente entre
`docs/claude/seguridad.md §5.4` (*"Header `X-Tenant-ID` válido solo si
`JWT.role === 'super_admin'`"*) y el código se resuelve así: **esa verificación
nunca se implementó.**

| Pieza | Estado real | Evidencia (al 2026-06-01) |
|---|---|---|
| Flag de plataforma en `User` | **No existe** | `schema.prisma` model User: solo `id, email, hashedPassword, displayName, isEmailVerified, isActive, timestamps`. Cero flags de plataforma. |
| `SystemRole` global | **No existe** | `SystemRole = OWNER \| ADMIN`, es campo de `Membership` — estrictamente por-org. |
| Check de rol en `X-Tenant-ID` | **No implementado** | `common/guards/tenant.guard.ts:18` lee el header y solo verifica que el caller tenga `Membership` activa en esa org. No hay verificación de "super-admin". |
| Claim JWT de plataforma | **No existe** | `auth/domain/jwt-claims.ts`: claims = `sub, email, activeTenantId?, roles?, impersonatedBy?, impersonationId?`. Sin `isSuperAdmin`/`role: 'super_admin'`. |
| Impersonation cross-tenant | **No** (scoped al tenant) | `impersonation.service.ts:53`: asume que el caller ya es OWNER/ADMIN del tenant destino. No sirve para un operador externo a la org. |
| Deuda registrada | **Sí** | `docs/deudas-arquitecturales.md §3.3`: *"No existe concepto de super-admin global en el modelo de datos"* + pasos para construirlo. |

**Lo que SÍ existe y se reutiliza** (no hay que construirlo):

- El namespace `sistema.*` ya está reservado en el catálogo de permisos para acciones
  de plataforma (`sistema.feature-flags.admin` ya se usa).
- La cadena de guards (`JwtAuthGuard → TenantGuard → ModuleEnabledGuard →
  PermissionsGuard`) es extensible: se le enchufa un guard nuevo.
- El flujo de impersonation con doble auditoría (§5.6 core) — se reutiliza tal cual
  para que el super-admin actúe como un usuario dentro de un tenant.
- `Organization.plan` (enum `Plan`) + `BillingService` — el entitlement grueso que el
  super-admin administra.

---

## 3. Modelo de datos

```prisma
model User {
  // ... campos existentes ...
  isSuperAdmin Boolean @default(false)  // identidad de plataforma; bypassea scoping por tenant
}
```

**Reglas:**

- `@default(false)`: ningún usuario es super-admin salvo asignación explícita.
- NO se expone en ningún DTO de respuesta de usuario común ni en el perfil. Es un
  atributo de seguridad, no de presentación.
- NO se asigna por endpoint self-service (ver §5, bootstrap).
- Migration aditiva, sin backfill (todos `false`).

**Por qué un `Boolean` y no un enum `platformRole`**: v1 tiene un solo nivel de
operador (acceso total de plataforma). Si en el futuro aparecen roles de plataforma
diferenciados (soporte read-only vs operador full), se migra `Boolean → enum`. No se
sobre-diseña ahora (YAGNI). Queda anotado en §12.

---

## 4. Modelo de autorización

### 4.1 Claim JWT

El flag se propaga al token para no pegarle a la BD en cada request:

- `auth/domain/jwt-claims.ts`: agregar `isSuperAdmin?: boolean` al payload, seteado en
  `JwtClaims.forUser()` desde `user.isSuperAdmin`.
- `strategies/jwt.strategy.ts`: `validate()` propaga el claim a `req.user`.

**Cicatriz de seguridad a respetar**: el access token vive 1h y es revocable vía
blocklist Redis (§5.2 core). Si se **revoca** el super-admin de un usuario, hay que
**invalidar sus tokens activos** (agregar a blocklist), no esperar a que expire el
JWT — un super-admin comprometido 1h es un incidente grave. Documentar en el flujo de
revocación.

### 4.2 `SuperAdminGuard`

Guard nuevo (~20 líneas) que verifica `req.user?.isSuperAdmin === true`. Se usa en los
endpoints de plataforma (`/admin/platform/*`, ver §7). Rechaza con 403 si no.

### 4.3 Bypass de scoping — defense in depth, con disciplina

El poder del super-admin es **actuar cross-tenant**, lo que significa relajar la
defensa multi-tenant (CLAUDE.md §4.2). Esto es la mayor superficie de riesgo del
sistema y se trata con ese peso:

- **`TenantGuard`**: cuando `req.user.isSuperAdmin === true`, aceptar el `X-Tenant-ID`
  indicado **sin exigir membresía** en esa org. Este es exactamente el comportamiento
  que `seguridad.md §5.4` describía y nunca se construyó. Acá se construye, con el
  sujeto real (`isSuperAdmin`) en vez del `role: 'super_admin'` que nunca existió.
- **`PermissionsGuard`**: `isSuperAdmin` corto-circuita el check de permisos
  (`sistema.*` y cualquier `{vertical}.*`), igual que hoy OWNER/ADMIN corto-circuitan
  vía wildcard. El resolver de RBAC ya tiene el patrón `esOwner/esAdmin` — se agrega
  `esSuperAdmin` con la misma forma.

> **Regla dura**: el bypass de `TenantGuard` por `isSuperAdmin` **solo** se activa en
> requests que ya pasaron `JwtAuthGuard` (token válido, no revocado) Y que están
> marcadas para auditoría cross-tenant (§6). Ninguna query de dominio "normal" debe
> heredar el bypass por accidente — el bypass es del guard de tenant, no del filtro
> `WHERE organizationId` del repositorio. La defensa en el repo (§4.2 core, "ninguna
> capa confía en la anterior") sigue intacta: el super-admin elige EN QUÉ tenant
> opera (via header), pero dentro de ese tenant las queries siguen scoped a ese
> `organizationId`. **El super-admin no ve dos tenants a la vez en una query; cambia
> de tenant explícitamente.**

### 4.4 Acción cross-tenant: dos modos

1. **Operar sobre la org** (cambiar plan, suspender, asignar entitlement): el
   super-admin manda `X-Tenant-ID: <org destino>` a los endpoints de plataforma. El
   `TenantGuard` lo deja pasar por el flag (§4.3). No necesita impersonation.
2. **Operar COMO un usuario del tenant** (reproducir un bug del cliente, soporte): el
   super-admin usa el flujo de **impersonation existente** (`POST /admin/impersonate`),
   que ya tiene doble auditoría. Requiere extender `ImpersonationService` para permitir
   que un `isSuperAdmin` impersone en una org donde NO es miembro (hoy exige OWNER/ADMIN
   del tenant destino, `impersonation.service.ts:53`). Este es el único cambio a
   impersonation, y es aditivo (rama `if isSuperAdmin`).

---

## 5. Bootstrap del primer super-admin (problema huevo-gallina)

No se puede asignar el primer super-admin por un endpoint protegido por
`SuperAdminGuard` (nadie es super-admin todavía). Opciones:

| Mecanismo | Tradeoff |
|---|---|
| **Seed/migration con email de env var** | Idempotente, versionado, auditable en git. `SUPER_ADMIN_EMAIL` en env → seed setea `isSuperAdmin = true` si el user existe. **Recomendado.** |
| Comando CLI dedicado (`pnpm super-admin:grant <email>`) | Explícito, pero requiere acceso al servidor. Bueno como complemento del seed para grants posteriores. |
| `UPDATE users SET isSuperAdmin = true` directo | Solo como último recurso documentado; viola el espíritu de §4.3 core (no `UPDATE` directo). |

**Recomendación**: seed gateado por `SUPER_ADMIN_EMAIL` para el primer operador +
comando CLI para grants/revokes posteriores (que internamente sí pueden exigir que el
caller sea super-admin, una vez que existe el primero). Todo grant/revoke se audita
(§6).

---

## 6. Auditoría cross-tenant

**Problema**: `AuditLog.organizationId` es `NOT NULL` (`schema.prisma`). Una acción
del super-admin que afecta a OTRA org (o a ninguna org en particular: "listó todos los
tenants") no encaja en el modelo de auditoría scoped a un tenant.

| Opción | Tradeoff |
|---|---|
| Relajar `AuditLog.organizationId` a nullable + flag `actorIsSuperAdmin` | Menos tablas, pero contamina el modelo de auditoría de tenant con filas "sin org". |
| **Tabla `platform_audit` separada** (actor, acción, org afectada opcional, payload, timestamp) | Separa claramente auditoría de plataforma de auditoría de tenant. La cross-tenant es un evento de plataforma, no de un tenant. **Recomendado.** |

**Regla dura**: **toda** request con `isSuperAdmin === true` que mute estado o acceda a
datos cross-tenant se audita en `platform_audit`. Un super-admin que actúa sin dejar
rastro es inaceptable. Esto incluye los grants/revokes del propio flag (§5).

---

## 7. Alcance funcional (qué administra el super-admin)

Mapea al alcance "Plataforma" de `plataforma-multi-vertical.md §4`:

| Capacidad | v1 | Notas |
|---|---|---|
| Crear orgs en nombre de un cliente y asignar el primer OWNER | ✅ | Hoy `POST /tenants` es self-service (el creador queda OWNER). El super-admin necesita crear una org y designar a OTRO como OWNER. |
| Suspender/reactivar orgs (`Organization.status`) | ✅ | Endpoint de plataforma gateado por `SuperAdminGuard`. |
| Asignar entitlement (plan + verticales + packs habilitados) | ✅ | Es el "entitlement" de §5 del doc plataforma. Conecta con §10.3 (frontera entitlement→activación). |
| Administrar feature flags globales (`sistema.*`) | ✅ | Ya existe `/admin/feature-flags`, hoy mal gateado (cualquier OWNER/ADMIN vía wildcard). Mover a `SuperAdminGuard`. |
| Impersonation cross-tenant (soporte) | ✅ | Extensión aditiva de impersonation (§4.4). |
| Vista cross-tenant / portfolio (listar todas las orgs) | ✅ (mínima) | Listado read-only de orgs. La vista "portfolio" rica de §10.5 sigue diferida. |
| Billing automático / cobros | ❌ | Billing sigue manual (§5 doc plataforma). El super-admin setea el plan; el cobro es fuera de banda. |

**Frontera v1**: el super-admin **administra la plataforma** (orgs, entitlement,
flags, soporte). NO entra al dominio contable/granja de un cliente para "hacerle la
contabilidad" — para eso está la invitación normal + RBAC, o la impersonation auditada.

---

## 8. Pre-requisito de seguridad (BLOQUEANTE)

El explore destapó un bug que **debe cerrarse antes o junto con** el super-admin:

**`PATCH /tenants/current` acepta `plan` y `status` con solo `TenantGuard`** (sin
`@RequirePermissions`). Hoy **cualquier miembro activo puede cambiar el plan de su
propia org o suspenderla.** Esto:

1. Es un bug de autorización por sí mismo.
2. Rompe la frontera entitlement→activación (§5 doc plataforma / §10.3): el
   entitlement (`plan`) lo decide la **plataforma**, no el Owner. Hoy el Owner lo
   toca libremente.

**Acción**: quitar `plan` y `status` del `UpdateTenantDto` que el Owner puede tocar.
El `plan` (entitlement) solo lo cambia el super-admin vía endpoint de plataforma. El
Owner conserva la **activación** (feature flags de lo habilitado), nunca el
entitlement. Esto es §10.3 resuelto "en chico" como efecto colateral del super-admin.

---

## 9. Superficie de riesgo y mitigaciones

Un `Boolean` en `User` que bypassea el filtrado por tenant es **la mayor concentración
de poder del sistema**. Mitigaciones obligatorias:

- **Auditoría total** (§6): toda acción con el flag deja rastro en `platform_audit`.
- **Revocación inmediata** (§4.1): revocar el flag invalida los tokens activos vía
  blocklist Redis, no espera la expiración.
- **Sin auto-asignación**: ningún endpoint permite que un usuario se vuelva
  super-admin a sí mismo; el bootstrap es por seed/CLI controlado (§5).
- **Bypass acotado al guard de tenant, no al repo** (§4.3): el super-admin elige
  tenant; las queries siguen scoped a ese tenant. No hay "ver todos los tenants en una
  query".
- **Futuro (anotado, no v1)**: MFA obligatorio para cuentas con `isSuperAdmin`;
  allowlist de IP; expiración/rotación del privilegio. Ver §12.

---

## 10. Frontend

Una sección `/platform-admin` en la SPA existente, protegida por routing que exige
`isSuperAdmin` (el flag viaja en `GET /me/permissions` o en un claim leído por el
front). Reusa el shell existente.

**Recomendación de secuencia**: construir **primero la API** (endpoints de plataforma
+ guard + auditoría) y operar por API/Swagger en v1. La UI de plataforma se enchufa
después — no bloquea el valor (crear/suspender orgs, asignar entitlement ya se puede
hacer por API gateada). Evita acoplar el build del backend a UI.

---

## 11. Secuencia de construcción recomendada (para la sesión de implementación)

Orden con dependencias. **Strict TDD** (test primero) en todo lo que toque dominio/auth:

1. **Pre-requisito bloqueante**: gatear `PATCH /tenants/current` — sacar `plan`/`status`
   del control del Owner (§8). Cierra el bug y la frontera entitlement→activación.
2. **Modelo**: migration aditiva `User.isSuperAdmin` (§3).
3. **Auth**: claim JWT + propagación en `JwtClaims.forUser` y `JwtStrategy` (§4.1) +
   invalidación de tokens en revocación.
4. **Guards**: `SuperAdminGuard` + bypass disciplinado en `TenantGuard` y
   `PermissionsGuard` (§4.2–4.3). Tests de seguridad con casos + y − (un no-super-admin
   NO bypassea).
5. **Auditoría**: tabla `platform_audit` + interceptor que registra toda request con el
   flag (§6).
6. **Bootstrap**: seed `SUPER_ADMIN_EMAIL` + comando CLI grant/revoke (§5).
7. **Endpoints de plataforma** (`/admin/platform/*`): listar orgs, crear org con OWNER
   designado, suspender/reactivar, asignar entitlement (plan/verticales/packs), mover
   feature-flags admin a `SuperAdminGuard` (§7).
8. **Impersonation cross-tenant**: rama aditiva `if isSuperAdmin` en
   `ImpersonationService.start()` (§4.4).
9. **(Opcional v1.1)** UI `/platform-admin` (§10).

Si los pasos 1–5 se hacen bien (el riel de seguridad), 6–9 son "enchufar endpoints",
no re-arquitecturar.

---

## 12. Decisiones abiertas (cerrar antes/durante el build)

| Tema | Recomendación | Disparador |
|---|---|---|
| `Boolean` vs enum `platformRole` | `Boolean` en v1 | Cuando aparezcan niveles de operador diferenciados (soporte read-only vs full) |
| `AuditLog` nullable vs `platform_audit` separada | Tabla separada (§6) | Decidir en el paso 5 del build |
| MFA / allowlist IP para super-admins | Diferido, anotado (§9) | Cuando haya operadores múltiples o clientes con datos sensibles |
| Flujo de "crear org y designar OWNER ajeno" | Construir en paso 7 | El `POST /tenants` self-service actual no cubre provisioning por el operador |
| ¿El super-admin puede ser también miembro normal de orgs? | Sí (ortogonal): el flag es de plataforma, las membresías son aparte | — |

---

## 13. Relación con otras piezas

- **`plataforma-multi-vertical.md §10.1`**: esta guía la cierra. Al implementar, mover
  §10.1 a "✅ CERRADA" referenciando este doc.
- **`plataforma-multi-vertical.md §10.3`** (frontera entitlement→activación): se
  resuelve parcialmente acá (§8) — el entitlement pasa a ser potestad exclusiva del
  super-admin.
- **`docs/claude/seguridad.md §5.4`**: esta guía construye el "super-admin del header
  X-Tenant-ID" que ahí se describía y nunca se implementó. Al construir, reconciliar
  §5.4 con `isSuperAdmin` (el sujeto real) en vez de `role: 'super_admin'`.
- **`docs/deudas-arquitecturales.md §3.3`**: esta guía es el plan para saldar esa deuda.

---

**Fin del documento.** Documento vivo: se versiona en git, cualquier cambio se discute
en PR. Al implementar cada pieza, actualizar el estado y reconciliar los docs cruzados
(§13).
