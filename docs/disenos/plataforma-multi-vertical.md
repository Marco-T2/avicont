# Plataforma multi-vertical — Modelo de verticales, packs, RBAC y administración

> **Estado: BASES / EN DISEÑO** (2026-05-31) — Documento fundacional del rumbo
> multi-vertical del producto. Captura el modelo conceptual acordado y el estado
> real del código al momento de escribirlo. Contiene **decisiones abiertas** (§10)
> que deben cerrarse antes de construir cada pieza.
>
> **Última reconciliación contra el código: 2026-06-02.** Se cerró §10.3 (frontera
> entitlement→activación, change `packs-riel`). Se actualizó §9 (estado del riel de
> packs y NavItem, dashboard portfolio cross-tenant) y §11 (secuencia, paso 3).
> Verticales construidos: Contabilidad y Granja. Riel de packs construido; packs
> concretos pendientes. Dashboard portfolio super-admin construido (PR #159).
>
> Este doc **presupone** el `CLAUDE.md` raíz (multi-tenancy flat §4.2, seguridad
> §5/§10.4, RBAC) y `docs/claude/seguridad.md`. Si algo acá contradice un
> invariante del core → va al core primero, acá después (regla anti-drift §12 core).
>
> **Fuente de verdad de implementación**: el código y `schema.prisma`. Este doc
> describe el modelo y la dirección; cuando el código diverja, se reconcilia acá.

Avicont no es "un sistema contable". Es una **plataforma** sobre la que viven
varios productos (verticales). Contabilidad es el primero y el único construido;
Granja es el siguiente; habrá otros. Lo que comparten es la **base de plataforma**
(identidad, tenants, RBAC, billing, observabilidad); lo que NO comparten es el
**dominio** de cada vertical.

Este documento existe para que esa distinción sea explícita y para que agregar un
vertical o un pack sea "enchufar contra un riel diseñado", no re-arquitecturar.

---

## 1. Glosario y desambiguación de naming

Durante el diseño se detectaron **tres choques de nombres** que confunden. Esta
sección es canónica: ante la duda, esto manda.

### 1.1 Conceptos centrales

**Plataforma** — La base compartida por todos los verticales: autenticación,
organizaciones (tenants), membresías, RBAC, billing, tema, observabilidad. No
tiene dominio de negocio propio; es la infraestructura sobre la que corren los
verticales.

**Vertical** — Un producto completo dentro de la plataforma, con su propio
dominio y modelo de datos. Hoy: **Contabilidad** (para empresas) y **Granja**
(para socios avicultores). Dos verticales NO comparten tablas ni lógica de
dominio; solo comparten la plataforma. `OTROS` es el placeholder de verticales
futuros.

**Pack** (módulo opcional dentro de un vertical) — Funcionalidad que **extiende**
un vertical y es opcional por organización. Ejemplo: dentro de Contabilidad, los
módulos avícolas (compras, fletes, liquidaciones) que algunas empresas usan y
otras no. Un pack **comparte el dominio de su vertical** (genera comprobantes,
mueve el plan de cuentas) — por eso es un pack, no un vertical aparte.

**Permiso (RBAC)** — String `{modulo}.{submodulo}.{accion}` (ej.
`contabilidad.asientos.create`, `granja.lotes.read`). Decide qué puede hacer un
usuario. Soporta wildcards (`contabilidad.*`, `*.read`).

### 1.2 Los tres choques de naming (NO confundir)

| Término en código | Qué ES realmente | Qué NO es |
|---|---|---|
| **`ModuloOrganizacion`** (`CONTABILIDAD`/`GRANJA`/`OTROS`) en `CreateTenantDto` | El **vertical** que se le asigna a la org al crearla. Input **transitorio**: no se persiste como columna, mapea a los flags booleanos (ver §1.3, Design D1) | NO es la clasificación contable de la empresa |
| **`TipoEmpresa`** (`COMERCIAL`/`SERVICIOS`/`INDUSTRIAL`/…) en `Organization.tipoEmpresaPrincipal` | Clasificación **contable/fiscal** del giro de la empresa. Define mes de inicio de gestión (Ley 843 art. 46) y el seed del plan de cuentas | NO tiene relación con el vertical ni con qué packs usa |
| **`FeatureFlag`** (modelo) + overrides por tenant | Banderas de funcionalidad **genéricas** y su capa de override por org. Es lo que renderiza la pantalla "Módulos activos" | NO son los module-flags del vertical (`contabilidadEnabled`/`granjaEnabled`). El propio schema lo advierte (`schema.prisma`: "NO confundir con los flags de módulo") |

> **Deuda de naming conocida**: la pantalla `/settings/features` se titula
> "Módulos activos" pero renderiza el sistema `FeatureFlag` genérico, no los
> module-flags del vertical. Es un desajuste label↔dominio a corregir cuando se
> formalicen los packs (§7).

### 1.3 Cómo se persiste el vertical HOY (Design D1)

`Organization` **NO tiene** una columna `modulo`. El vertical se representa con
**flags booleanos** independientes:

```prisma
model Organization {
  contabilidadEnabled Boolean @default(true)
  granjaEnabled       Boolean @default(false)
  // ...
}
```

El `modulo` del `CreateTenantDto` es input transitorio que el `TenantsService`
mapea a esos flags y usa para el seeding inicial:

| `modulo` (input) | `contabilidadEnabled` | `granjaEnabled` |
|---|---|---|
| `CONTABILIDAD` | `true` | `false` |
| `GRANJA` | `false` | `true` |
| `OTROS` | `false` | `false` |

**Consecuencia arquitectónica a registrar**: estos dos booleanos **mezclan dos
conceptos** — "qué vertical es la org" y "está el módulo habilitado". La regla
"un vertical por org" es ahora **invariante de base** (CHECK constraint
`organizations_vertical_exclusivo_check`, `NOT (ambos true)`), no solo convención
del flujo de creación — ver decisión **cerrada** §10.4. El caso `OTROS` (ambos
`false`) sigue permitido.

---

## 2. Los tres ejes (la pieza conceptual central)

Toda visibilidad y acceso en el sistema se compone de **tres ejes independientes**.
Confundirlos es la causa #1 de diseño enredado. Se componen **en cascada**:

```
Vertical de la org   →  qué FAMILIA de pantallas/dominio existe
   ∩
Packs activos        →  qué EXTENSIONES de ese vertical están prendidas
   ∩
Permisos del usuario →  cuáles de esas pantallas/acciones puede USAR
```

| Eje | Pregunta que responde | Granularidad | Se modela con | Estado |
|---|---|---|---|---|
| **1. Vertical** | ¿Qué producto ES este tenant? | Por organización | `contabilidadEnabled`/`granjaEnabled` (hoy) | ✅ construido (shell-por-vertical, gating, /me/permissions) |
| **2. Packs** | ¿Qué extensiones del vertical están prendidas? | Por organización | `Pack` + `OrgPackEntitlement` (activo embebido) | ✅ riel construido (change packs-riel, 2026-06-02); packs concretos ❌ |
| **3. Permisos** | ¿Qué puede hacer ESTE usuario? | Por membresía (user×org) | strings `{modulo}.{submodulo}.{accion}` | ✅ catálogo + enforcement backend + gating frontend |

**Regla mental**: el Vertical decide qué EXISTE, los Packs agregan/quitan dentro
de eso, y el RBAC decide qué de lo existente puede tocar el usuario.

El **sidebar** del frontend es la materialización visible de esta cascada:
`items visibles = árbol del vertical activo ∩ packs activos ∩ permisos del usuario`.

---

## 3. Modelo de identidad y acceso

Este modelo es el que hace que el escenario "un contador en granja Y contabilidad"
funcione sin esfuerzo. Las tres reglas:

1. **`User` es identidad de plataforma.** No pertenece a un vertical ni a un
   tenant. Solo email/password/perfil. Un usuario es global.
2. **`Organization` (tenant) tiene el vertical.** El vertical es propiedad de la
   org (§1.3), no del usuario.
3. **`Membership` es la bisagra.** Relaciona `(organizationId, userId)` —único por
   par— con un rol (`systemRole` O `customRoleId`). Un usuario tiene N membresías
   en orgs de cualquier vertical.

```prisma
model Membership {
  organizationId String
  userId         String
  systemRole     SystemRole?   // OWNER | ADMIN (hardcoded)
  customRoleId   String?       // FK a CustomRole de la org (resto de roles)
  @@unique([organizationId, userId])
}
```

### 3.1 El escenario del contador cross-vertical

> *"Un contador puede tener acceso a granjas para ayudar a administrar, pero
> también estar en contabilidad."*

Se resuelve **solo** con el modelo de arriba:

- El contador tiene **una** cuenta `User`.
- El avicultor (OWNER de "Granja Juan", vertical Granja) lo invita con un rol
  `granja.*` → ahora tiene una `Membership` en esa org.
- El contador también trabaja en "Estudio Contable" (vertical Contabilidad) con
  permisos `contabilidad.*` → otra `Membership`.
- Loguea **una vez**. El `OrgSwitcher` lista ambas orgs. Al entrar a una, el JWT
  se reemite con ese `activeTenantId`, el shell muta al vertical de esa org, y el
  RBAC resuelve **sus permisos EN esa org** (de granja o de contabilidad, según
  corresponda).

**Clave**: un usuario no "es de contabilidad" ni "es de granja". Es un usuario con
membresías en orgs, cada una con su vertical. La misma persona es contador en una
y administrador-de-granja en otra, sin duplicar identidad ni mezclar permisos.

El catálogo de permisos ya está **namespaced por vertical** (existen
`contabilidad.*` Y `granja.*`), así que al armar un rol en una org de granja solo
se ofrecen permisos `granja.*`, y en una de contabilidad solo `contabilidad.*`.
El catálogo asignable se filtra por **vertical + packs activos** de la org.

---

## 4. Modelo de administración (tres alcances)

La administración tiene **tres alcances que no se mezclan**:

| Alcance | Quién | Qué administra | Cómo se identifica |
|---|---|---|---|
| **Plataforma** | El operador del SaaS | Crear/suspender orgs, asignar plan/entitlement (qué verticales y packs puede activar cada org), feature flags globales (`sistema.*`), billing, impersonation auditada | **No modelado explícitamente hoy** (ver §10.1) |
| **Organización** | OWNER / ADMIN del tenant | Invitar/quitar miembros (`organizacion.miembros.*`), crear y asignar roles (`organizacion.roles.*`), activar/desactivar packs **de lo que su plan habilita** ("Módulos activos"), config del vertical | `SystemRole` OWNER/ADMIN en la membership |
| **Rol** | (lo define el Owner) | Define el subconjunto del catálogo que un miembro puede usar | OWNER/ADMIN = todo (hardcoded); `CustomRole` = subconjunto filtrado por vertical+packs de la org |

### 4.1 Cross-tenant: impersonation

Existe `POST /admin/impersonate` (+ `/end`) con doble auditoría (§5.6 core). Es el
mecanismo por el cual un administrador entra al tenant de otro usuario. **Hoy el
schema describe esto como "un OWNER/ADMIN entra al tenant de otro"**, pero no
define quién es el operador de plataforma con potestad cross-tenant — ver §10.1.

---

## 5. Entitlement vs Activación (la frontera de billing)

Hay **dos niveles** de "está disponible", y mantenerlos separados es lo que evita
que un Owner se prenda algo que no contrató:

- **Entitlement** (lo que el plan/contrato habilita) → lo decide la
  **plataforma/billing**. Hoy: `Organization.plan` (enum `Plan`, default `FREE`)
  + `BillingService`. Billing es **manual** por ahora (org sin pago → read-only).
- **Activación** (lo que la org prende de lo habilitado) → **self-service del
  Owner**, vía la pantalla "Módulos activos" (feature flags override).

**Regla de oro**: la activación es siempre un **subconjunto del entitlement**. El
Owner nunca puede activar fuera de lo que la plataforma le habilitó. Hoy esta
restricción no es explícita en el modelo — formalizarla es parte de cerrar las
bases (§10.3).

Flujo de negocio completo:

```
Plataforma:  "este cliente paga plan X"  → habilita verticales/packs (entitlement)
     ↓
Owner:       prende los que va a usar     → activación (⊆ entitlement)
     ↓
Owner:       asigna roles a sus miembros  → RBAC (⊆ lo activado)
     ↓
Usuario:     sidebar = vertical ∩ packs activos ∩ permisos del rol
```

---

## 6. Verticales

### 6.1 Contabilidad (construido)

Sistema contable completo para empresas (PyMEs bolivianas, control interno). Es el
único vertical funcional. Catálogo de permisos `contabilidad.*` definido:
dashboard, plan-cuentas, asientos, libro-diario, libro-mayor, ventas, compras,
gestiones, periodos, cierre-mensual, eeff, configuracion, contactos,
tipos-documento-fisico, documentos-fisicos.

### 6.2 Granja (construido — v1)

Operativo avícola simple para socios/avicultores que quieren controlar su
producción de forma fácil. **No comparte nada con Contabilidad** (otras tablas,
otro usuario, otro propósito; el avicultor opera en el gallinero con el celular).
Estado: **construido (v1, 2026-06-01)** — backend `src/granja/` (lotes,
movimientos, tipos-registro, dashboard; hexagonal completo con specs), frontend
`features/granja/` (api, components, hooks, pages, schemas, mobile-first), y 4
tablas en schema (`Lote`, `TipoRegistro`, `MovimientoInversion`,
`MovimientoCantidad`, migration `20260601145425_granja_v1_schema`). Permisos
`granja.*` en el catálogo y enforzados vía `@RequirePermissions`:
`granja.{dashboard,lotes,movimientos,tipos-registro}.{read,create,update,delete}`.
Pendiente respecto del plan original: no hay roles default de granja seedeados
(el acceso depende de OWNER/ADMIN hardcoded + `CustomRole` por org — ver §10.2).

### 6.3 Qué comparten y qué no

| Capa | Compartido entre verticales |
|---|---|
| Identidad (`User`), tenants (`Organization`), membresías, RBAC, billing, tema, observabilidad | **Sí** (plataforma) |
| Modelo de datos de dominio, lógica de negocio, shell/navegación | **No** (cada vertical el suyo) |

---

## 7. Packs (módulos opcionales dentro de un vertical)

Los packs avícolas dentro de Contabilidad (compras, fletes, liquidaciones) son
**extensiones del vertical contable**, no un vertical aparte: generan
comprobantes/asientos y mueven el plan de cuentas. Por eso viven en el **eje 2**
(feature flag por tenant), no en el eje 1.

El catálogo ya tiene `contabilidad.compras` y `contabilidad.ventas` como
submódulos. Estado: **no existen como módulos construidos** (compras/fletes/
liquidaciones). Se modelarán como packs activables por org cuando se definan a
nivel producto.

> Tu frase *"el sistema contable les sirve a unas empresas tal cual, a otras no"*
> = exactamente el caso de uso de un pack opcional: core contable para todos, pack
> avícola encima para las que lo necesiten.

---

## 8. Arquitectura frontend

**Una sola SPA.** El shell y el árbol de navegación se eligen según el **vertical
de la org activa**:

- Entrás a una org de Contabilidad → sidebar contable (Plan de cuentas, Libro
  Diario, Balance, etc.).
- Entrás a una org de Granja → el sidebar **muta** a operación avícola.

NO dos apps separadas (duplicaría auth/infra para cero beneficio mientras haya un
solo vertical funcional — YAGNI).

### 8.1 Estado actual del sidebar

`NAV_ITEMS` (`components/nav-items.ts`) es una lista plana que `NavList` filtra por
**dos ejes**: permiso (`requiredPermission`) y vertical (`vertical?`). `NavItem` hoy
es `{ to, label, icon, requiredPermission?, vertical?, disabled? }`. El eje `pack`
todavía no existe (greenfield).

### 8.2 Hacia dónde

El `NavItem` ya es **extensible** y compone hoy dos de los tres ejes:

```
NavItem = { to, label, icon, requiredPermission?, vertical?, pack? }
items visibles = filtrar NAV_ITEMS por:
   (vertical ausente ∨ vertical === vertical de la org activa)   ← implementado
   ∧ (pack ausente ∨ pack ∈ packs activos)                       ← pendiente (greenfield)
   ∧ (requiredPermission ausente ∨ requiredPermission ∈ permisos) ← implementado
```

El eje de permisos se construyó primero (spine), y el eje de vertical encima
(change `shell-por-vertical`): items `organizacion.*` no llevan `vertical` (admin
cross-vertical, siempre visibles), items `contabilidad.*`/`granja.*` llevan el suyo.
El frontend conoce el vertical activo vía `vertical` en `GET /me/permissions`
(hook `useVerticalActivo`, mismo cache que `usePermissions`, cero red extra). El eje
`pack` enchufa con la misma forma cuando lleguen los packs avícolas.

---

## 9. Estado actual vs por construir

| Pieza | Estado |
|---|---|
| Catálogo de permisos namespaced por vertical (`contabilidad.*`, `granja.*`, `organizacion.*`, `sistema.*`) | ✅ existe |
| Enforcement RBAC en backend (`@RequirePermissions` + `PermissionsGuard` en 15+ controllers) | ✅ existe |
| `Membership` (user×org×rol), `SystemRole` (OWNER/ADMIN), `CustomRole` por org | ✅ existe |
| `OrgSwitcher` (ver/cambiar tenant, reemite JWT) | ✅ existe |
| Impersonation auditada (`/admin/impersonate`) | ✅ existe |
| `Organization.plan` + `BillingService` (entitlement grueso) | ✅ existe |
| Feature flags genéricas + override por tenant ("Módulos activos") | ✅ existe |
| **Vertical exclusivo por org** (invariante §10.4: CHECK `organizations_vertical_exclusivo_check` + guard `VerticalNoExclusivoError`) | ✅ existe |
| **`GET /me/permissions`** (permisos efectivos del usuario) | ✅ existe |
| **Gating frontend** (`usePermissions` + filtrar sidebar/rutas/botones) | ✅ existe |
| `NavItem` extensible (requiredPermission/vertical/pack) | ✅ construido (change `packs-riel`, 2026-06-02: los tres ejes completos) |
| Shell/navegación por vertical | ✅ existe (change `shell-por-vertical`: nav filtrado por vertical, ruta default por vertical, estado "sin módulo") |
| Super-admin de plataforma explícito | ✅ construido (change `super-admin`, 2026-06-02, ver `docs/disenos/super-admin-plataforma.md`) |
| Vertical Granja (dominio, tablas, UI) | ✅ construido (v1, 2026-06-01) |
| **Riel de packs** (`Pack`/`OrgPackEntitlement`/`PackEnabledGuard`/`@RequirePack`/`useMisPacks`/catálogo asignable filtrado) | ✅ construido (change `packs-riel`, 2026-06-02, PRs #150–#157). Ver `docs/disenos/packs-eje2.md` |
| Packs avícolas concretos (compras/fletes/liquidaciones/adjuntos/RAG) | ❌ greenfield (el riel está hecho; enchufar el primer pack concreto es la siguiente fase) |
| Frontera entitlement→activación explícita | ✅ cerrada (§10.3, change `packs-riel`, 2026-06-02) |
| **Dashboard portfolio super-admin** (`GET /admin/platform/dashboard` + `GET /admin/platform/activity`) | ✅ construido (change `portfolio-cross-tenant`, 2026-06-02, PR #159). KPIs orgs por status/plan/vertical + total usuarios + serie altas 12 meses + timeline paginado cursor sobre `platform_audit`. Excepción cross-tenant deliberada a Anti-31 documentada en ports. Sin migración. Spec viva: `openspec/specs/portfolio-cross-tenant/spec.md` |

> **Nota de seguridad**: el gating frontend es **UX, no seguridad**. El backend ya
> enforza RBAC (403 ante falta de permiso). Ocultar opciones que el usuario no
> puede usar es pulido/experiencia, no el candado. El candado ya está atrás.

---

## 10. Decisiones abiertas

Estas son **producto**, no técnica. Deben cerrarse antes de construir la pieza que
cada una afecta. Se registran acá con recomendación; al decidirse, se documentan
en su sección correspondiente.

### 10.1 Super-admin de plataforma — ✅ CERRADA (2026-06-02, change `super-admin`)

**Decisión implementada: (a) identidad de plataforma en `User` (`isSuperAdmin`).** El
super-admin es atributo de identidad de plataforma (coherente con §3.1: `User` no
pertenece a un tenant), no un `SystemRole` (que es por-org). Descartados: (b)
org-plataforma (obliga a tocar `ImpersonationService`, cadena confusa) y (c)
manual/SQL (solo interino).

**Implementado** (branch `feat/super-admin-impersonation`, 7 slices):
- `User.isSuperAdmin: Boolean` en DB + claim JWT (solo cuando `true`).
- `SuperAdminGuard`, bypass `TenantGuard`, short-circuit RBAC.
- Tabla `platform_audit` + `PlatformAuditInterceptor`.
- Bootstrap seed + CLI `grant`/`revoke`.
- Endpoints `/admin/platform/*` (listar/crear orgs, cambiar status/entitlement).
- Impersonation cross-tenant (ImpersonationService con `callerEsSuperAdmin`).

**Guía de diseño completa**: `docs/disenos/super-admin-plataforma.md`.
**Doc de seguridad reconciliado**: `docs/claude/seguridad.md §5.4` (reemplazado `role: 'super_admin'` → `isSuperAdmin`, documentado el bypass de `TenantGuard`).

### 10.2 Profundidad de RBAC en Granja — ✅ CERRADA (2026-06-01, de facto)

Resuelta al construir Granja v1: usa el **mismo motor RBAC** que Contabilidad
(`@RequirePermissions` + `PermissionsGuard`, ya de plataforma), con permisos
namespaced `granja.{dashboard,lotes,movimientos,tipos-registro}.{read,create,update,delete}`.

La parte de la recomendación que **no** se tomó: no se seedearon roles default
simples (Dueño / Operario) para granja. Hoy el acceso depende de OWNER/ADMIN
hardcoded + `CustomRole` creado por org. **Disparador para reabrir**: si aparece
fricción de onboarding (un Owner de granja teniendo que armar roles a mano cada
vez), seedear 2-3 roles default de granja.

### 10.3 Frontera entitlement → activación — ✅ CERRADA (2026-06-02, change `packs-riel`)

**Decisión implementada**: la activación es un campo `activo` DENTRO de la fila
`OrgPackEntitlement` (activación embebida). Sin fila de entitlement no hay `activo`
que prender → la frontera es estructural, no solo un chequeo de código. Defense in
depth: el servicio también valida (`PackNoHabilitadoError` 403) como capa friendly.

**Implementado** (PRs #150–#157):
- `OrgPackEntitlement.activo` (default false): la existencia de la fila = entitlement;
  el campo `activo` = activación. Un owner nunca puede prender lo que no fue habilitado
  por la plataforma (sin fila, no hay `activo` sobre el que operar).
- `PackEnabledGuard` en `common/guards/pack-enabled.guard.ts` (404 deliberado si pack
  no activo — no revela que existe pero está apagado).
- `@RequirePack(clave)` en `common/decorators/require-pack.decorator.ts`.
- Cache Redis `org-packs:<id>` TTL 300, invalidado en cada mutación de entitlement/activación.
- Catálogo `GET /permissions/grouped` filtrado por vertical + packs activos (server-autoritativo).
- `validatePermissions` rechaza permisos de packs no activos (`CUSTOM_ROLE_PERMISO_NO_HABILITADO`).

**Diseño completo**: `docs/disenos/packs-eje2.md`.
**Spec viva**: `openspec/specs/packs-riel/spec.md`.

### 10.4 Exclusividad del vertical por org — ✅ CERRADA (2026-05-31)

**Decisión: vertical EXCLUSIVO por org.** Una org es de un solo vertical
(Contabilidad O Granja, no ambos); los packs (eje 2) cubren la necesidad de
"extender" sin volver multi-vertical. El caso `OTROS` (ambos `false`) sigue válido.

Implementado con **defense in depth** (CLAUDE.md §4.8):
- **Hard** — CHECK constraint `organizations_vertical_exclusivo_check`
  (`NOT ("contabilidadEnabled" AND "granjaEnabled")`), migration
  `20260531180000`. Objeto raw SQL, registrado en CLAUDE.md §11.6.
- **Friendly** — guard `VerticalNoExclusivoError` (409,
  `TENANT_VERTICAL_NO_EXCLUSIVO`) en `TenantsService.updateFeatures`, que valida
  el estado RESULTANTE del patch parcial. El `create` ya era exclusivo vía
  `flagsParaModulo`.

> Esta decisión cierra el **invariante** (exclusividad), no la UI. El
> shell-switching por vertical a nivel de navegación **ya se construyó** (§8.2, §9,
> §11 paso 2: nav filtrado por vertical + ruta default + estado "sin módulo",
> change `shell-por-vertical`, #115). Lo que sigue diferido (YAGNI) es un
> `GranjaShell` físicamente separado: el `DashboardShell` con nav filtrado alcanza.

### 10.5 Vista "portfolio" del contador (diferible)

Un contador con muchas granjas-cliente querrá verlas todas de un vistazo (estilo
QuickBooks Accountant), no cambiar una por una. **Recomendación**: diferir — hoy
el `OrgSwitcher` alcanza. Reabrir cuando exista demanda real (varios verticales +
contadores con carteras grandes).

---

## 11. Secuencia de construcción recomendada

No se construye todo de una. La columna vertebral primero, los verticales después:

1. **Spine de permisos (eje 3)** — `GET /me/permissions` → `usePermissions` →
   gating de sidebar/rutas/botones por permiso. Se hace con solo Contabilidad
   existiendo, pero deja el riel puesto y el `NavItem` extensible. Independiente de
   las decisiones abiertas. **Primer ladrillo.**
2. **Shell/navegación por vertical (eje 1)** — ✅ **construido** (change
   `shell-por-vertical`, 2026-06-01). El frontend conoce el vertical activo (campo
   `vertical` en `GET /me/permissions`), el nav se filtra por vertical, `/` redirige
   al dashboard del vertical activo y `vertical: null` muestra un estado "sin módulo"
   honesto (admin → activar módulo; no-admin → pedir al admin). Un `GranjaShell`
   físico distinto se difirió (YAGNI): el `DashboardShell` con nav filtrado alcanza.
3. **Riel de packs (eje 2)** — ✅ **construido** (change `packs-riel`, 2026-06-02,
   PRs #150–#157). El catálogo (`Pack`), el entitlement (`OrgPackEntitlement` con
   activación embebida), el guard (`PackEnabledGuard`/`@RequirePack`), la exposición
   en `/me/permissions` (`packsActivos`), el filtrado del catálogo RBAC, y el gating
   frontend (`useMisPacks` + tercer filtro en `NavList`) están construidos. §10.3
   cerrada. **Lo que sigue**: enchufar el PRIMER PACK CONCRETO (Marco decide cuál):
   agregar sus permisos al catálogo + decorar su controller con `@RequirePack` +
   agregar su `NavItem` con `pack`. Ver `docs/disenos/packs-eje2.md`.
4. **Vertical Granja** — ✅ **construido** (v1, 2026-06-01). Shell mobile-first,
   tablas, árbol de navegación, RBAC `granja.*`.

Si el paso 1 se hace bien, los pasos 2-4 son "registrar un árbol de nav + flags +
permisos", no re-arquitecturar.

---

**Fin del documento.** Documento vivo: se versiona en git, cualquier cambio se
discute en PR. Al cerrar una decisión abierta (§10), moverla a su sección y
actualizar el estado (§9).
