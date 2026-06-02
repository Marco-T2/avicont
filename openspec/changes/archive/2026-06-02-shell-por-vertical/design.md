# Design: shell-por-vertical

<!--
Última edición: 2026-06-01
Última revisión contra core: 2026-06-01
Owner: backend-lead
-->

> Fase: design
> Change: `shell-por-vertical`
> Proyecto: avicont
> Spec hermana: `openspec/changes/shell-por-vertical/spec.md`

---

## 0. Resumen de la decisión

El frontend conoce el vertical extendiendo `GET /api/me/permissions` con un campo
`vertical` aditivo, derivado de los flags `contabilidadEnabled` / `granjaEnabled`
de la org activa. El frontend lo consume del MISMO cache de TanStack Query que
`usePermissions` (cero red extra), filtra el nav con un predicado de vertical
aditivo al de permiso, y redirige `/` al destino del vertical. `vertical: null`
NO inventa onboarding: reusa `/settings/features`.

---

## 1. Backend — derivación del vertical

### 1.1 Shape del DTO extendido

`backend/src/me/dto/me-permissions-response.dto.ts` (MODIFICADO):

```ts
export type VerticalActivo = 'CONTABILIDAD' | 'GRANJA' | null;

export class MePermissionsResponseDto {
  @ApiProperty({ type: [String], description: 'Permisos efectivos exactos del usuario' })
  readonly permissions!: string[];

  @ApiProperty({ description: 'true si el usuario es OWNER o ADMIN' })
  readonly isOwner!: boolean;

  @ApiProperty({ description: 'ID del tenant activo en el JWT' })
  readonly activeTenantId!: string;

  @ApiProperty({
    enum: ['CONTABILIDAD', 'GRANJA'],
    nullable: true,
    description:
      'Vertical de la organización activa, derivado de sus flags. null si la org no tiene vertical asignado.',
  })
  readonly vertical!: VerticalActivo;
}
```

> Nota: el DTO actual es una `interface`. Se mantiene como `interface` o se pasa a
> `class` según el patrón del módulo `me`. El catálogo de reglas exige `@ApiProperty`
> en DTOs de respuesta; si el resto del módulo `me` ya usa `interface` sin decoradores
> Swagger (es el caso hoy — el DTO actual es interface plana), basta agregar el campo a
> la interface y dejar la documentación Swagger como está. Decisión de implementación:
> **mantener `interface`** para no introducir un cambio de patrón fuera de scope; el
> `vertical` se agrega como campo de la interface. (El `@ApiProperty` aplica solo si se
> migra a class; no es bloqueante para este change.)

Forma mínima recomendada (coherente con el código actual):

```ts
export type VerticalActivo = 'CONTABILIDAD' | 'GRANJA' | null;

export interface MePermissionsResponseDto {
  readonly permissions: string[];
  readonly isOwner: boolean;
  readonly activeTenantId: string;
  readonly vertical: VerticalActivo;
}
```

### 1.2 Dónde se deriva — sin query nueva, sin romper hexagonal

**Hallazgo clave:** `MeController.permissions` (`backend/src/me/me.controller.ts`) YA
hace un `prisma.membership.findUnique` directo para distinguir membresía
activa/inactiva (REQ-MP-08). El modelo `Membership` tiene relación `organization`
(`schema.prisma` línea ~197). Por lo tanto el vertical se obtiene **en la MISMA query**,
agregando un `select` anidado de los dos flags — **cero round-trip extra**:

```ts
const membresia = await this.prisma.membership.findUnique({
  where: { organizationId_userId: { organizationId: activeTenantId, userId: user.sub } },
  select: {
    deactivatedAt: true,
    organization: { select: { contabilidadEnabled: true, granjaEnabled: true } },
  },
});
```

Derivación (helper privado puro en el controller, o función local):

```ts
function derivarVertical(org: { contabilidadEnabled: boolean; granjaEnabled: boolean }): VerticalActivo {
  // Invariante schema (CHECK organizations_vertical_exclusivo_check): nunca ambos true.
  if (org.contabilidadEnabled) return 'CONTABILIDAD';
  if (org.granjaEnabled) return 'GRANJA';
  return null;
}
```

Respuesta:

```ts
return {
  permissions: resolved.permissions,
  isOwner: resolved.isOwner,
  activeTenantId,
  vertical: derivarVertical(membresia.organization),
};
```

**Por qué NO un port hacia `tenants` (decisión de superficie mínima):**
`MeController` ya depende de `PrismaService` directamente (lo inyecta hoy para el
lookup de membresía). El vertical NO es una query nueva: es un `select` adicional
sobre una query que el controller YA ejecuta. Introducir un `VerticalReaderPort`
hacia el módulo `tenants` para leer dos booleanos que ya viajan en la fila de
membresía sería sobre-ingeniería — agregaría un import cross-module y un módulo
proveedor para no ahorrar ninguna query. El módulo `tenants` ya expone
`TenantsService.getFeatures` / `repo.findFeatures` (devuelve
`{contabilidadEnabled, granjaEnabled}`), pero usarlo obligaría a `MeModule` a
importar `TenantsModule` y a una segunda query (`findFeatures` hace su propio
`findUnique`). El `select` anidado es estrictamente más barato y se mantiene dentro
del módulo `me` sin cruzar frontera.

> Trade-off honesto: el `me.controller` lee columnas de `Organization` directamente
> vía Prisma, lo que técnicamente "conoce" el shape de otra entidad. Es aceptable
> porque (a) el controller ya hace lookup directo de `Membership` (mismo nivel de
> acoplamiento a Prisma), (b) son dos booleanos de configuración, no lógica de
> dominio de tenants, y (c) la alternativa (port) no ahorra queries y agrega
> acoplamiento de módulos. Si el día de mañana la derivación del vertical gana lógica
> (packs, entitlements), AHÍ se justifica mover a un `TenantContextReaderPort`. Hoy no.

### 1.3 Archivos backend

- **MODIFICADO** `backend/src/me/dto/me-permissions-response.dto.ts` — campo `vertical` + tipo `VerticalActivo`.
- **MODIFICADO** `backend/src/me/me.controller.ts` — `select` anidado de flags + `derivarVertical` + campo en el return.
- **MODIFICADO** `backend/test/me-permissions.e2e-spec.ts` — escenarios de los 3 verticales + regresión.
- `backend/src/me/me.module.ts` — SIN cambio (no se importa `TenantsModule`).

---

## 2. Frontend — hook de vertical

### 2.1 Tipo compartido

`frontend/src/types/api.ts` (MODIFICADO): agregar `vertical` a `MePermissionsResponse`:

```ts
export type VerticalActivo = 'CONTABILIDAD' | 'GRANJA' | null;

export interface MePermissionsResponse {
  permissions: string[];
  isOwner: boolean;
  activeTenantId: string;
  /** Vertical de la org activa. null si la org no tiene módulo asignado. */
  vertical: VerticalActivo;
}
```

### 2.2 Forma del hook — `useVerticalActivo`

Hook hermano de `usePermissions` (NO extender la superficie de `usePermissions`,
mantener responsabilidades separadas — recomendación §5.1 del proposal). Vive en
`frontend/src/lib/use-vertical.ts` (junto a `use-permissions.ts`).

Comparte el queryKey `['me-permissions', activeTenantId]` y el mismo `queryFn`
(`getMePermissions`), `enabled` y `staleTime` que `usePermissions`. TanStack
deduplica por queryKey → una sola request HTTP aunque ambos hooks corran.

```ts
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { getMePermissions } from './me-permissions';
import type { VerticalActivo } from '@/types/api';

/**
 * Vertical activo de la org del tenant actual, leído del MISMO cache que
 * usePermissions (queryKey ['me-permissions', activeTenantId]) → cero red extra.
 *
 * Fail-closed: mientras la query carga o no hay data, `vertical` es `undefined`
 * (estado indeterminado). NO asume un vertical por defecto.
 *
 * Server state → vive en Query, NUNCA en Zustand (Anti-F-05).
 */
export function useVerticalActivo(): {
  vertical: VerticalActivo | undefined;
  isLoading: boolean;
} {
  const accessToken = useAuthStore((s) => s.accessToken);
  const activeTenantId = useAuthStore((s) => s.user?.activeTenantId);

  const query = useQuery({
    queryKey: ['me-permissions', activeTenantId],
    queryFn: getMePermissions,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: Boolean(accessToken) && Boolean(activeTenantId),
  });

  return {
    // undefined = indeterminado (cargando). null = org sin vertical. string = vertical.
    vertical: query.data?.vertical,
    isLoading: query.isLoading,
  };
}
```

**Distinción crítica de estados** (el consumidor DEBE tratarlos distinto):
- `vertical === undefined` → cargando / sin data → **fail-closed** (skeleton, ocultar operación).
- `vertical === null` → org sin módulo → flujo de activación (`/settings/features`).
- `vertical === 'CONTABILIDAD' | 'GRANJA'` → vertical resuelto.

### 2.3 Archivos frontend (hook)

- **MODIFICADO** `frontend/src/types/api.ts` — `vertical` en `MePermissionsResponse` + tipo `VerticalActivo`.
- **NUEVO** `frontend/src/lib/use-vertical.ts` — `useVerticalActivo`.
- `frontend/src/lib/me-permissions.ts` — SIN cambio (el fetcher ya devuelve el shape completo).

---

## 3. Frontend — `NavItem` y filtrado

### 3.1 Tipo `NavItem`

`frontend/src/components/nav-items.ts` (MODIFICADO): agregar campo opcional.

```ts
export interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  requiredPermission?: string;
  /**
   * Vertical al que pertenece el ítem. Si está ausente, el ítem es de
   * ADMINISTRACIÓN (cross-vertical) y se muestra en ambos verticales.
   * Items contabilidad.* → 'CONTABILIDAD'; granja.* → 'GRANJA'.
   */
  vertical?: 'CONTABILIDAD' | 'GRANJA';
}
```

Asignación en `NAV_ITEMS`:
- `/plan-cuentas`, `/comprobantes`, `/libros/*`, `/eeff/*`, `/contactos`,
  `/tipos-documento-fisico`, `/documentos-fisicos`, `/periodos-fiscales` →
  `vertical: 'CONTABILIDAD'`.
- `/granja`, `/granja/lotes`, `/granja/tipos-registro` → `vertical: 'GRANJA'`.
- `/`, `/settings/members`, `/settings/roles`, `/settings/features`,
  `/configuracion` → SIN `vertical` (administración / panel).

Actualizar el comentario "Visibilidad: 100% RBAC… Sin flag granjaEnabled en store"
en la sección Granja: ahora el gating es RBAC **+ vertical** (aditivo).

### 3.2 Filtro en `nav-list.tsx`

`frontend/src/components/nav-list.tsx` (MODIFICADO): AND de dos predicados.

```ts
const { has } = usePermissions();
const { vertical: verticalActivo } = useVerticalActivo();

const visibleItems = NAV_ITEMS.filter((item) => {
  const pasaPermiso = item.requiredPermission === undefined || has(item.requiredPermission);
  // Fail-closed: si verticalActivo es undefined (cargando) o null (org sin vertical),
  // ningún ítem con vertical declarado pasa. Items de administración (sin vertical) sí.
  const pasaVertical = item.vertical === undefined || item.vertical === verticalActivo;
  return pasaPermiso && pasaVertical;
});
```

`undefined === 'CONTABILIDAD'` y `null === 'GRANJA'` son `false` → el fail-closed
sale gratis de la comparación estricta. No hace falta lógica especial.

### 3.3 Guard anti-drift

Extender el `describe('NAV_ITEMS — cobertura de gating')` de `nav-list.test.tsx`:
todo ítem cuyo `to` empiece con `/granja` o que sea de contabilidad DEBE declarar
`vertical`. Criterio simple y robusto: un ítem de operación (no público, no
disabled, con `requiredPermission` de namespace `contabilidad.*` o `granja.*`) debe
tener `vertical` definido. Los `organizacion.*` NO deben tenerlo.

### 3.4 Archivos frontend (nav)

- **MODIFICADO** `frontend/src/components/nav-items.ts` — campo `vertical` + asignación.
- **MODIFICADO** `frontend/src/components/nav-list.tsx` — predicado de vertical.
- **MODIFICADO** `frontend/src/components/nav-list.test.tsx` — tests de filtrado por vertical + guard.

---

## 4. Frontend — redirect de ruta default y anti-flash

### 4.1 Componente de decisión `IndexRedirect`

`/` hoy renderiza `DashboardPage` directo (`router.tsx` línea 48). Se interpone un
componente que decide según vertical. **NUEVO**
`frontend/src/routes/index-redirect.tsx`:

```tsx
import { Navigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { SinModulo } from '@/routes/sin-modulo';
import { useVerticalActivo } from '@/lib/use-vertical';

// Resuelve el destino de `/` según el vertical activo. Fail-closed contra el
// flash: mientras el vertical no resuelve (undefined), muestra skeleton — NO el
// dashboard contable. Ver REQ-SV-3.
export function IndexRedirect(): React.JSX.Element {
  const { vertical } = useVerticalActivo();

  // undefined = cargando → skeleton, NO flash de la pantalla contable.
  if (vertical === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (vertical === 'GRANJA') return <Navigate to="/granja" replace />;

  // null → org sin módulo: componente liviano diferenciado por rol (REQ-SV-4).
  // Admin: mensaje + botón a /settings/features.
  // No-admin: mensaje sin acción.
  // NO se redirige directamente: el no-admin en /settings/features vería
  // el estado denegado de RequirePermission, que no es la UX correcta.
  if (vertical === null) return <SinModulo />;

  // 'CONTABILIDAD' → dashboard contable actual (comportamiento previo).
  return <DashboardPage />;
}
```

Router (`router.tsx` MODIFICADO): la ruta index pasa de
`{ path: '/', element: <DashboardPage /> }` a
`{ path: '/', element: <IndexRedirect /> }`.

### 4.2 Por qué no hay flash

El `ProtectedRoute` ya invoca `usePermissions()` como warm-up (línea 20), por lo que
el cache de `['me-permissions', activeTenantId]` se empieza a poblar al entrar a la
zona autenticada. `IndexRedirect` lee del MISMO cache vía `useVerticalActivo`.
Mientras `vertical === undefined`, renderiza skeleton — nunca `DashboardPage`. Solo
cuando el cache tiene data se evalúa el destino. El `<Navigate replace>` para granja
ocurre antes de cualquier render del dashboard contable.

### 4.3 Archivos frontend (redirect)

- **NUEVO** `frontend/src/routes/index-redirect.tsx` — componente de decisión.
- **NUEVO** `frontend/src/routes/index-redirect.test.tsx` — tests del redirect.
- **NUEVO** `frontend/src/routes/sin-modulo.tsx` — estado liviano para `null` (admin vs no-admin).
- **NUEVO** `frontend/src/routes/sin-modulo.test.tsx` — tests del estado sin módulo.
- **MODIFICADO** `frontend/src/routes/router.tsx` — `/` usa `IndexRedirect`.

---

## 5. Tratamiento de `vertical: null` — resultado de la verificación de onboarding

### 5.1 Verificación realizada (REQUISITO DURO de no-deuda)

- `git branch -a | grep onboarding` → **sin ramas** de onboarding.
- `grep -rli onboard frontend/src` → única coincidencia es un COMENTARIO en
  `frontend/src/types/api.ts` ("…el switch-tenant posterior al onboarding"). NO hay
  componente, página ni ruta de onboarding.
- `grep` de "elegir/seleccionar módulo/vertical" → solo falsos positivos (balance,
  accept-invite). **No existe pantalla de "elegí tu módulo".**

### 5.2 Cómo se asigna hoy el vertical

El único punto donde se elige el vertical es el **alta self-service**
(`frontend/src/features/auth/register-form.tsx` + `register-schema.ts`): el form tiene
un `<Select>` "Tipo de organización" con `CONTABILIDAD | GRANJA | OTROS` (default
`CONTABILIDAD`). El backend mapea ese `modulo` a los flags
(`TenantsService.flagsParaModulo`): `OTROS` → ambos flags `false` → `vertical: null`.
Tras crear la org, el usuario aterriza en `/` (`navigate('/', { replace: true })`).

Además, `/settings/features` ("Módulos activos") permite a un admin cambiar el
vertical después (vía `updateFeatures`, con el CHECK de exclusividad).

### 5.3 Ruta de integración elegida (sin onboarding paralelo, con `<SinModulo>`)

`vertical === null` se da hoy SOLO cuando el usuario eligió `OTROS` en el alta (caso
raro y consciente) o en data legacy. Crear una pantalla de onboarding nueva para ese
caso borde sería gold-plating y violaría "no inventar un flujo paralelo".

**Decisión:** `null` renderiza un componente liviano `<SinModulo>` (NUEVO, en
`frontend/src/routes/sin-modulo.tsx`) diferenciado por rol:

- **Admin** (`useHasSystemRole(['OWNER','ADMIN'])`): mensaje "No hay un módulo activo"
  + botón/enlace a `/settings/features`. El admin navega ahí, activa un módulo; al
  hacerlo, `useSetFeatureFlag.onSuccess` invalida `['me-permissions', activeTenantId]`
  → el vertical pasa a `'CONTABILIDAD'`/`'GRANJA'` → el siguiente paso por `/`
  redirige al dashboard correcto.
- **No-admin**: mensaje "Tu organización no tiene un módulo activo. Pedile a tu
  administrador que active uno." Sin botón de acción. El no-admin NO se redirige a
  `/settings/features`: el RBAC de esa ruta (`RequirePermission features.read`) le
  mostraría el estado denegado de `RequirePermission`, que es una UX incorrecta para
  este caso (el usuario no intentó acceder a un recurso prohibido — simplemente no
  tiene módulo activo).

- **Invalidación necesaria:** al togglear un módulo en `/settings/features`, se DEBE
  invalidar `['me-permissions', activeTenantId]` para que `useVerticalActivo` refleje
  el nuevo vertical sin esperar el `staleTime`. (Tarea de implementación: agregar la
  invalidación en el `onSuccess` de `useSetFeatureFlag` en
  `frontend/src/features/feature-flags/hooks/use-feature-flags.ts`.)

### 5.4 Tensión con la decisión cerrada #2 — reportada (no silenciada)

La decisión cerrada dice: "`null` = estado de onboarding 'elegí tu módulo', NO default
silencioso a contabilidad" e "integrá/reusá el flujo existente si lo hay". El flujo
existente de elección de módulo es el `<Select>` del **alta** (one-shot, no
re-visitable) y, post-alta, `/settings/features`. NO hay un onboarding re-entrante.
Esta solución HONRA la intención (no default silencioso a contabilidad; reusa la única
superficie existente), pero `/settings/features` es una pantalla de admin, no un
onboarding amable para un miembro no-admin. Si el producto quiere un onboarding
dedicado para `null`, es un change aparte. Ver `riesgos_o_dudas`.

---

## 6. Alternativas consideradas (y por qué se descartan)

| Alternativa | Por qué NO |
|-------------|-----------|
| `vertical` en el JWT | Staleness (TTL 1h miente tras cambio de vertical); infla el token; no escala a packs. Descartada en proposal §4 (opción a). |
| Reusar `GET /tenants/current/features` | Gateado por `organizacion.feature-flags.read` → 403 para el granjero base (proposal §3.1). Descartada. |
| Port `VerticalReaderPort` hacia `tenants` | No ahorra queries (el `select` anidado en la query de membresía ya existente es más barato) y agrega acoplamiento de módulos. Sobre-ingeniería para dos booleanos. §1.2. |
| Pantalla de onboarding nueva para `null` | No existe flujo de onboarding; crear uno es gold-plating para un caso borde (`OTROS`). Se reusa `/settings/features`. §5. |
| Extender `usePermissions` con `vertical` | Infla la superficie del hook de permisos. Hook hermano que comparte cache es más limpio y testeable (proposal §5.1). §2.2. |
| `GranjaShell` físico separado | Diferido por decisión cerrada #3. `DashboardShell` con nav filtrado alcanza. |

---

## 7. Lista consolidada de archivos a tocar

### Backend
- **MODIFICADO** `backend/src/me/dto/me-permissions-response.dto.ts`
- **MODIFICADO** `backend/src/me/me.controller.ts`
- **MODIFICADO** `backend/test/me-permissions.e2e-spec.ts`

### Frontend
- **MODIFICADO** `frontend/src/types/api.ts`
- **NUEVO** `frontend/src/lib/use-vertical.ts`
- **MODIFICADO** `frontend/src/components/nav-items.ts`
- **MODIFICADO** `frontend/src/components/nav-list.tsx`
- **MODIFICADO** `frontend/src/components/nav-list.test.tsx`
- **NUEVO** `frontend/src/routes/index-redirect.tsx`
- **NUEVO** `frontend/src/routes/index-redirect.test.tsx`
- **NUEVO** `frontend/src/routes/sin-modulo.tsx` — componente liviano para `vertical === null` (admin vs no-admin)
- **NUEVO** `frontend/src/routes/sin-modulo.test.tsx` — test de admin muestra botón, no-admin solo mensaje
- **MODIFICADO** `frontend/src/routes/router.tsx`
- **MODIFICADO** `frontend/src/features/feature-flags/hooks/use-feature-flags.ts` — invalidar `['me-permissions', activeTenantId]` en `onSuccess` de `useSetFeatureFlag`

---

## 8. Estrategia de tests (TDD estricto)

| Nivel | Archivo | Qué cubre |
|-------|---------|-----------|
| Backend e2e | `backend/test/me-permissions.e2e-spec.ts` (extender) | `vertical` para org contable / granja / sin vertical; regresión de `permissions`/`isOwner`/`activeTenantId`; el 403 sin tenant no produce vertical |
| Frontend componente | `frontend/src/components/nav-list.test.tsx` (extender) | filtrado AND por vertical (granja oculta contabilidad y viceversa; admin siempre; undefined/null ocultan operación); guard anti-drift de `vertical` en items de operación |
| Frontend componente | `frontend/src/routes/index-redirect.test.tsx` (nuevo) | GRANJA → Navigate a /granja; CONTABILIDAD → DashboardPage; undefined → skeleton (no flash, no navigate); null → renderiza SinModulo |
| Frontend componente | `frontend/src/routes/sin-modulo.test.tsx` (nuevo) | admin (`isOwner=true`) → muestra botón/enlace a /settings/features; no-admin → solo mensaje, sin botón |

Mock de `useVerticalActivo` + `usePermissions` con el patrón §14.7
(`vi.spyOn` / `vi.mock` con `importOriginal`). Para `IndexRedirect`, mockear
`useVerticalActivo` y assertear el render (`<Navigate>` se testea por efecto:
`MemoryRouter` + ruta `/granja` que renderiza un sentinel, o assertion sobre el
componente devuelto). NO testear wrappers triviales de Query (frontend §9.4).

Backend e2e corre con `DATABASE_URL` + `--runInBand --forceExit` (CLAUDE.md §11.3).
Frontend con `pnpm exec vitest` y `pnpm exec tsc -b` (NO `--noEmit`) para typecheck.
