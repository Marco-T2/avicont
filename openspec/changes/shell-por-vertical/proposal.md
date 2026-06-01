# Propuesta de cambio — Shell por vertical (frontend consciente del vertical)

> Fase SDD: **proposal**. Artifact store: hybrid (este archivo + engram `sdd/shell-por-vertical/proposal`).
> Stack afectado: **frontend** principalmente; **una adición chica de backend** (ver decisión central).
> Fecha: 2026-06-01.

---

## 1. Intent / Por qué

Avicont tiene dos verticales **mutuamente exclusivos** por organización: `CONTABILIDAD` y
`GRANJA`. A nivel de datos y entitlement la separación YA EXISTE y está cerrada:

- `Organization.contabilidadEnabled` / `Organization.granjaEnabled` en el schema, con CHECK
  constraint `organizations_vertical_exclusivo_check` que prohíbe ambos en true
  (`backend/prisma/schema.prisma`).
- Seeding diferenciado al crear la org (plan de cuentas vs. 12 tipos de registro de granja).

**El problema está en el frontend**: HOY la UI separa los verticales de forma **implícita y frágil**,
deduciéndola del RBAC. El nav (`frontend/src/components/nav-list.tsx`) filtra items SOLO por
`requiredPermission`, y las rutas (`frontend/src/routes/router.tsx`) se gatean con
`<RequirePermission>`. El comentario explícito en `frontend/src/components/nav-items.ts` lo reconoce:

```ts
// Visibilidad: 100% RBAC. Si el tenant activó granja, el backend otorga
// granja.* y has('granja.X.read') da true. Sin flag granjaEnabled en store.
```

Consecuencias de esta fragilidad:

1. **El frontend no sabe "esta org es granja"**, solo sabe "tengo permisos `granja.*`". Si mañana
   un rol de contabilidad recibiera por error un permiso `granja.*` (o viceversa), la UI mezclaría
   verticales. La separación de producto descansa en que el catálogo RBAC nunca se cruce — un
   invariante que el frontend no puede afirmar.
2. **Ruta default rota para el granjero**: todos los usuarios aterrizan en `/` = dashboard contable
   (`router.tsx` línea 48, `DashboardPage`). El granjero ve una pantalla contable vacía antes de
   navegar manualmente a `/granja`. Mala primera impresión en un público (productores avícolas) que
   opera desde el celular.
3. **`NavItem` no tiene forma de expresar "este item pertenece al vertical X"** — solo
   `requiredPermission`. No hay gating explícito ni aditivo por vertical.

La separación de verticales es una decisión de PRODUCTO; el frontend debe poder afirmarla
**explícitamente**, no inferirla de un efecto colateral del RBAC. Este cambio cierra el "Eje 1
(shell por vertical)" marcado ❌ NO EXISTE en `docs/disenos/plataforma-multi-vertical.md` §9.

---

## 2. Scope

### Entra

1. **Frontend consciente del vertical activo** vía un dato de servidor confiable (decisión central, §4).
2. **Ruta default por vertical**: el granjero aterriza en `/granja`, el contador en `/`.
3. **`NavItem` extensible con campo `vertical`** para gatear el nav de forma EXPLÍCITA y ADITIVA al RBAC.
4. **Decisión sobre el shell**: ¿granja necesita un shell físico distinto o alcanza el `DashboardShell`
   actual con nav filtrado por vertical? (recomendación en §5.4).
5. Tests del nuevo gating por vertical y del redirect default.

### NO entra (se difiere explícitamente)

- **Más de dos verticales / "packs"**: el modelo se diseña para ESCALAR a más verticales, pero hoy
  solo existen dos. No se implementa infraestructura especulativa para packs (Eje 2 del doc
  plataforma) — solo se elige una fuente de verdad que NO genere deuda cuando lleguen.
- **Rediseño visual del dashboard de granja**: ya existe `GranjaDashboardPage`. No se toca su contenido.
- **Cambiar el sistema de permisos RBAC**: el gating por permiso fino sigue vigente y es la capa de
  seguridad real (backend → 403). El gating por vertical es ADITIVO, NO lo reemplaza.
- **Reescribir el sistema de feature-flags** (`/settings/features`): es un sistema SEPARADO (flags
  globales + overrides) que NO usa las columnas `contabilidadEnabled`/`granjaEnabled`. Se deja intacto.
- **Multi-vertical simultáneo en una org**: el CHECK constraint lo prohíbe; no se contempla.

---

## 3. Hallazgos de código que condicionan la decisión

Verificado contra el código hoy (2026-06-01). Estos hallazgos REORIENTAN la decisión central
respecto del enunciado de la tarea:

1. **`GET /tenants/current/features` NO sirve para el granjero base.** Está gateado con
   `@RequirePermissions('organizacion.feature-flags.read')`
   (`backend/src/tenants/tenants.controller.ts` línea 58). Un operador de granja que solo tiene
   `granja.*` recibiría **403** al consultarlo. Confirmado: `feature-flags` es un submódulo
   ADMIN en el catálogo (`backend/src/common/permisos/catalogo.ts` líneas 91, 105). → **La opción
   (b) "reusar el endpoint existente" está descartada tal cual**: el dato de vertical lo necesita
   TODO usuario autenticado, no solo los admins.

2. **El frontend ya hace UN fetch al cargar toda zona autenticada**: `usePermissions()` se invoca en
   `ProtectedRoute` como warm-up (`frontend/src/routes/protected-route.tsx` línea 20), pegándole a
   `GET /me/permissions`. Ese endpoint YA tiene el `activeTenantId` y YA resuelve contexto de tenant
   (`backend/src/me/me.controller.ts`). Es el lugar natural para agregar el vertical SIN una segunda
   llamada de red.

3. **El backend de `/me/permissions` ya consulta la membresía y el tenant activo** — agregar el
   vertical es un `select` extra barato sobre la org, no una query nueva pesada.

4. **El JWT NO incluye los flags de vertical** (`frontend/src/stores/auth-store.ts`,
   `JwtPayload` en `frontend/src/types/api.ts`). Solo trae `sub`, `email`, `activeTenantId`, `roles`.

---

## 4. Decisión arquitectural central — cómo el frontend conoce el vertical

### Las tres opciones

| # | Opción | Cómo | Pros | Contras |
|---|--------|------|------|---------|
| **(a)** | **Flags en el JWT** | Agregar `contabilidadEnabled`/`granjaEnabled` (o `vertical: 'CONTABILIDAD'\|'GRANJA'`) al payload del access token. El front lo lee del `auth-store` (como `roles`). | Cero red extra; síncrono; disponible desde el primer render. | **Stale hasta el refresh del token**: si un admin cambia el vertical de la org, el JWT viejo (TTL 1h) miente hasta refrescar. Acopla el contrato del token a un dato de producto que va a CRECER (packs, entitlements) → cada vertical/pack nuevo obliga a tocar el emisor de JWT y el decoder. **NO escala a más verticales sin inflar el token.** El JWT debe llevar identidad y claims estables, no estado de configuración mutable. |
| **(b)** | **Endpoint dedicado** | Consumir `GET /tenants/current/features` (existe) o crear un GET nuevo. | El endpoint existe. | **`/tenants/current/features` está gateado por `organizacion.feature-flags.read` → 403 para el granjero base** (hallazgo §3.1). Crear un GET nuevo solo-para-vertical = **una segunda llamada de red** en cada carga, redundante con el fetch de permisos que YA se hace. Dos llamadas para resolver "qué puede ver el usuario". |
| **(c)** | **Derivar del cache de TanStack Query** combinando `/me/permissions` con el vertical | Extender el endpoint `/me/permissions` (o un `/me/context`) para que devuelva, además de permisos, el `vertical` de la org activa. El front lo consume del MISMO hook (`usePermissions` → o un `useTenantContext` hermano que comparte queryKey). | **Una sola llamada** resuelve permisos + vertical (ya se hace en `ProtectedRoute`). Server state vive en Query cache, aislado por `activeTenantId` → al cambiar de tenant se refetcha y el vertical se actualiza **sin staleness** (a diferencia del JWT). Cumple Anti-F-05 (server state en Query, no Zustand). **Escala a packs/entitlements**: el día que haya más verticales o packs, `/me/*` devuelve un objeto de contexto más rico SIN tocar el JWT ni agregar llamadas. | Toca el backend (extender el response de `/me`). Es trabajo, no gratis. |

### Recomendación: **(c)** — extender el contrato `/me` para devolver el vertical activo

**Fundamento cero-deuda y escalabilidad:**

1. **Una sola fuente de verdad para "qué puede ver el usuario"**: permisos + vertical viajan juntos
   en la respuesta que el front YA pide en `ProtectedRoute`. No se agrega red. No se duplica estado.

2. **Sin staleness, a diferencia del JWT (a)**: el vertical es estado de configuración MUTABLE de la
   org. Vive correctamente como server state en Query cache, aislado por `activeTenantId` (D-F1 del
   design existente). Si un admin cambia el vertical, invalidar la query lo refleja al instante; el
   JWT no puede.

3. **Escala a más verticales y a packs sin tocar el token**: el doc plataforma (`§Eje 2 packs`,
   `§entitlement`) anticipa que esto va a crecer. Un contrato `/me/context` que devuelve
   `{ permissions, isOwner, activeTenantId, vertical }` (y mañana `entitlements`, `packs`) es el
   punto de extensión natural. Meter eso en el JWT lo infla y obliga a re-emitir tokens por cada
   cambio de configuración — deuda garantizada.

4. **Respeta el contrato existente**: `MePermissionsResponseDto` ya devuelve
   `{ permissions, isOwner, activeTenantId }`. Agregar `vertical` es aditivo y no rompe consumidores.

**Forma del cambio de backend (mínimo):** extender `MePermissionsResponseDto` y `MeController.permissions`
para incluir `vertical: 'CONTABILIDAD' | 'GRANJA' | null`, derivado de un `select` de
`contabilidadEnabled`/`granjaEnabled` sobre la org activa (la membresía ya se consulta ahí). El
`null` cubre el caso transitorio de una org sin vertical asignado.

> **Nota de naming (CLAUDE.md §1):** el valor del vertical es un enum de DOMINIO → va en español y en
> mayúsculas: `CONTABILIDAD` / `GRANJA`. NO `accounting`/`farm`.

> **Decisión abierta menor (ver §7):** ¿extender `/me/permissions` in-place, o renombrar a
> `/me/context`? Recomendación: extender `/me/permissions` para no romper el consumidor actual; si se
> prefiere un nombre que grite "contexto", crear `/me/context` y deprecar el otro. Es cosmético, no
> bloquea specs.

---

## 5. Approach de alto nivel (los 4 puntos del scope)

### 5.1 Frontend consciente del vertical

- Backend: extender `MePermissionsResponseDto` + `MeController` con `vertical`.
- Frontend: extender el tipo `MePermissionsResponse` (`src/types/api.ts`) con `vertical`.
- Exponer un selector/hook fino — opción A: `usePermissions()` retorna también `vertical`; opción B:
  un `useVerticalActivo()` que lee del MISMO queryKey (`['me-permissions', activeTenantId]`) para
  compartir cache sin segunda request. **Recomendación: B** (separación de responsabilidades: el hook
  de permisos no debería crecer en superficie; un hook hermano que comparte cache es más limpio y
  testeable). A decidir fino en design.
- **Server state → Query, NUNCA Zustand** (Anti-F-05). El vertical NO va al `auth-store`.

### 5.2 Ruta default por vertical

- En `/` (hoy `DashboardPage` contable), interponer un componente de decisión que lee el vertical:
  - vertical `GRANJA` → `<Navigate to="/granja" replace />`.
  - vertical `CONTABILIDAD` (o `null`) → `DashboardPage` actual.
- Mientras el vertical carga (query pending) → skeleton, NO flash de la pantalla contable (mismo
  patrón fail-closed que `RequirePermission`).
- Mantener el catch-all `path: '*' → Navigate to '/'` (router.tsx línea 214): cae en `/`, que ahora
  redirige según vertical. Consistente.

### 5.3 `NavItem` extensible con campo `vertical`

- Agregar a `NavItem` (`src/components/nav-items.ts`) un campo opcional
  `vertical?: 'CONTABILIDAD' | 'GRANJA'`:
  - items `contabilidad.*` → `vertical: 'CONTABILIDAD'`.
  - items `granja.*` → `vertical: 'GRANJA'`.
  - items `organizacion.*` (Miembros, Roles, Módulos activos, Configuración) y el "Panel" raíz →
    **SIN** `vertical` = visibles en AMBOS (ADMINISTRACIÓN cross-vertical).
- En `nav-list.tsx`, el filtro pasa a ser AND de dos predicados:
  1. `item.requiredPermission === undefined || has(item.requiredPermission)` (gating actual, intacto).
  2. `item.vertical === undefined || item.vertical === verticalActivo` (gating nuevo por vertical).
- **Criterio de gating del nav (confirmado en código, respetado):** el nav del granjero =
  OPERACIÓN (`granja.*`) + ADMINISTRACIÓN (`organizacion.*`). Lo que NO ve: `contabilidad.*`. Los
  items `organizacion.*` siguen 100% RBAC (OWNER/ADMIN reciben wildcard, `organizacion.miembros.read`
  vive en namespace `organizacion.*`). El campo `vertical` NO se aplica a items de administración.
- **Defensa en profundidad ADITIVA**: un granjero no tiene permisos `contabilidad.*` (RBAC ya lo
  oculta), PERO ahora ADEMÁS el filtro por vertical lo oculta explícitamente. Cinturón y tiradores —
  el frontend afirma la separación en vez de inferirla.

### 5.4 Shell: ¿uno o dos?

**Recomendación: NO crear un shell físico distinto en este cambio. Mantener `DashboardShell` con el
nav filtrado por vertical.** Fundamento:

- El `DashboardShell` actual (`src/components/shells/dashboard-shell.tsx`) ya es responsive: sidebar
  fijo en desktop (`AppSidebar`) + drawer mobile (hamburger → `Sheet`), ambos consumiendo el MISMO
  `NAV_ITEMS` (frontend/CLAUDE.md §7 "items del nav en un solo lugar"). Filtrado por vertical, el
  granjero ya ve SOLO sus items, grandes y tocables.
- `features/granja/**` es mobile-first ESTRICTO (frontend/CLAUDE.md §7), pero eso es regla de las
  PÁGINAS de granja, no obliga a un layout transversal distinto. El shell ya soporta mobile bien.
- Crear un `GranjaShell` separado HOY = duplicar topbar, impersonation banner, lógica de drawer, por
  un beneficio especulativo. Viola "no gold-plating".
- **Disparador para re-evaluar (anotado, NO se hace ahora):** si el granjero necesitara una bottom
  tab bar mobile-native (en vez del drawer hamburger) o un chrome radicalmente distinto, AHÍ se
  justifica un `GranjaShell`. Hoy no hay evidencia de esa necesidad. Se difiere con criterio.

---

## 6. Riesgos y mitigación

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| **Flash de pantalla contable** antes de resolver el vertical en `/` | El granjero ve por un instante la UI contable | Fail-closed: mientras la query del vertical está pending, render skeleton (mismo patrón que `RequirePermission`). No renderizar `DashboardPage` hasta tener el vertical. |
| **Org sin vertical asignado** (`vertical: null`) | Caso borde transitorio (org recién creada o data legacy) | Default seguro: `null` → tratar como CONTABILIDAD (comportamiento actual) o mostrar un estado neutro. A definir en spec. No romper. |
| **Segunda llamada de red accidental** si se implementa mal el hook de vertical | Doble request a `/me/*` | El hook de vertical DEBE compartir el queryKey `['me-permissions', activeTenantId]` con `usePermissions` → TanStack deduplica. Test que verifique una sola request. |
| **Cambio de vertical de una org no se refleja** | UI stale tras toggle de admin | Server state en Query con `staleTime` controlado + invalidación del queryKey al cambiar features. Por eso NO va al JWT (opción a descartada por esto). |
| **Romper el consumidor actual de `/me/permissions`** | Regresión en gating de permisos | El cambio de backend es ADITIVO (`vertical` opcional). Test de contrato del response. |
| **Tests de gating por vertical ausentes** | Regresión silenciosa de separación | Cubrir explícitamente nav filter + redirect default (ver §8). |

---

## 7. Preguntas abiertas (para Marco, antes de specs)

1. **Forma del endpoint**: ¿extender `GET /me/permissions` in-place agregando `vertical` (no rompe
   nada, recomendado), o introducir `GET /me/context` como nombre que grita "contexto del usuario en
   el tenant" y deprecar el otro? Recomendación: extender in-place. Decisión cosmética.
2. **Org sin vertical (`vertical: null`)**: ¿default a CONTABILIDAD (comportamiento actual) o estado
   neutro/onboarding? Afecta el redirect de `/` y el caso borde de orgs legacy. Recomendación: tratar
   `null` como CONTABILIDAD por compatibilidad, salvo que existan orgs sin vertical que deban onboardear.
3. **Confirmación del criterio del shell único**: ¿de acuerdo con NO crear `GranjaShell` ahora y
   diferirlo hasta que haya necesidad real (bottom tab bar nativa)? Recomendación: sí, diferir.

> Ninguna de estas BLOQUEA el avance a specs — son refinamientos. El estado es **ok**, no blocked.

---

## 8. Impacto en tests

- **Backend** (`backend/src/me/`): integración del response de `/me/permissions` incluyendo `vertical`
  para org de granja, org de contabilidad y org sin vertical (`null`). Espeja el patrón de los
  integration specs existentes del módulo `me` (REQ-MP-*).
- **Frontend — `nav-list.test.tsx`**: el filtro AND oculta `contabilidad.*` cuando `vertical === 'GRANJA'`,
  oculta `granja.*` cuando `vertical === 'CONTABILIDAD'`, y SIEMPRE muestra `organizacion.*` en ambos.
  Mock de `usePermissions`/`useVerticalActivo` (patrón frontend/CLAUDE.md §14.7).
- **Frontend — redirect default**: test del componente de decisión en `/`: `GRANJA` → navega a
  `/granja`; `CONTABILIDAD`/`null` → renderiza `DashboardPage`; pending → skeleton (no flash).
- **Frontend — dedup de red**: verificar que `usePermissions` + hook de vertical comparten queryKey
  (una sola request). Test de hook si vale la pena, o assertion en el test del nav.
- NO testear wrappers triviales de Query (frontend/CLAUDE.md §9.4).

---

## 9. Resumen ejecutivo de la decisión

El frontend conoce el vertical **extendiendo el contrato `/me` para devolver `vertical` junto con los
permisos** (opción **c**), consumido del MISMO queryKey que `usePermissions` para no agregar red. Se
descarta el JWT (opción a) por staleness y por no escalar a packs sin inflar el token, y se descarta
reusar `/tenants/current/features` (opción b) porque está gateado por permiso de admin → 403 para el
granjero base. Con el vertical disponible como server state: (1) `NavItem` gana un campo `vertical`
ADITIVO al RBAC, (2) `/` redirige al dashboard del vertical activo, (3) el `DashboardShell` actual se
mantiene (no se justifica un `GranjaShell` hoy). Próxima fase: **sdd-spec**.
