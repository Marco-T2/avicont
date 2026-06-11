# Design técnico: packs-gestion-ui

> Change: `packs-gestion-ui` — UI completa de gestión de packs (entitlement super-admin → activación Owner)
> Fase: design | Artifact store: hybrid | Fecha: 2026-06-11
>
> Este documento es el CÓMO concreto. apply lo ejecuta sin re-decidir. Toda firma
> referenciada acá fue verificada contra el código real (file:line incluidos).

---

## 0. Hallazgos de verificación (lo que cambia respecto a la exploración)

| Verificación | Resultado | Impacto en el design |
|---|---|---|
| `PlatformModule` ya importa `PacksModule` (`platform.module.ts:11,52`) | ✅ | GAP-1 NO necesita wiring de módulo nuevo. |
| `PlatformAdminService` ya inyecta `PackService` (`platform-admin.service.ts:73`) | ✅ | GAP-1 = 1 método en el service que delega a `this.packs.listarCatalogo()`. SIN port nuevo. |
| `PackService.listarCatalogo(): Promise<Pack[]>` existe (`pack.service.ts:51`) | ✅ | Devuelve `Pack[]` (entidad dominio), NO `PackResponseDto`. El service de plataforma mapea con `toPackResponse` (`pack-response.dto.ts:18`). |
| `PackResponseDto` ya en `api.generated.ts` (~1954) y es el shape de catálogo | ✅ | Aliasar en `api.ts`. NO necesita DTO nuevo. |
| `OrgPackEntitlementResponseDto`, `ActivacionPackResponseDto`, `HabilitarPackDto` en generado | ✅ | Aliasar en `api.ts`. |
| `useHasSystemRole(roles: SystemRole[]): boolean` existe (`use-permissions.ts:20`) | ✅ | Lee `user.roles` del JWT (sincrónico, Zustand). Gating ruta + nav lo usa. |
| `dump-openapi.ts` hace `NestFactory.create(AppModule)` → instancia `MinioStorageAdapter` que llama `config.getOrThrow('MINIO_*')` en su constructor (`minio-storage.adapter.ts:46-50`) | ⚠️ | **El dump FALLA sin las 5 env MINIO_*.** El docstring del script solo menciona DATABASE_URL/REDIS_HOST — gotcha real. Ver §1.4. |
| `PlatformOrgResponseDto` tiene `contabilidadEnabled` + `granjaEnabled` (`platform-org-response.dto.ts:26,29`) | ✅ | El vertical de la org para el filtro del catálogo (D-04) se deriva en cliente de `org.contabilidadEnabled`/`org.granjaEnabled` — ya están en `PlatformOrg`. |
| `NavList` filtra con hooks (`usePermissions`, `useVerticalActivo`, `useMisPacks`) al tope (`nav-list.tsx:32-41`) | ✅ | El filtro `requiredSystemRole` se computa con `useHasSystemRole` llamado en `NavList`. Ver §2.6 — hay una sutileza (no se puede llamar el hook por-item). |

**Conclusión**: GAP-1 es minimal (1 método + 1 endpoint, sin port ni módulo nuevo). El frontend clona patrones existentes byte-por-byte.

---

## SLICE 0 — Backend GAP-1 + tipos

### 0.1 Service: `PlatformAdminService.listarCatalogoPacks()`

Archivo: `backend/src/platform/platform-admin.service.ts` (MODIFICAR).

```typescript
// Importar el mapper (ya hay import de OrgPackEntitlement; agregar toPackResponse):
import { PackResponseDto, toPackResponse } from '@/packs/dto/pack-response.dto';

/**
 * Lista el catálogo global de packs vendibles para el panel super-admin.
 * Delega a PackService (frontera de módulo); mapea Pack (dominio) → DTO HTTP.
 * Org-less: el catálogo es global, no depende de ninguna org.
 */
async listarCatalogoPacks(): Promise<PackResponseDto[]> {
  const packs = await this.packs.listarCatalogo();
  return packs.map(toPackResponse);
}
```

- `PackService.listarCatalogo()` devuelve `Pack[]` (entidad). `toPackResponse(pack: Pack): PackResponseDto` ya existe (`pack-response.dto.ts:18`). NO se crea DTO ni port nuevo.
- NO se popula `req.tenantId` (es org-less, como `getDashboard`/`getActivity`). No hay `:id` que auditar como target.

### 0.2 Controller: `GET /admin/platform/packs`

Archivo: `backend/src/platform/platform-admin.controller.ts` (MODIFICAR).

Ubicación: junto a los demás GET org-less (después de `getActivity`, o tras `listarOrgs`). Patrón idéntico a `getDashboard` (`:263-272`).

```typescript
import { PackResponseDto } from '@/packs/dto/pack-response.dto';

/**
 * Catálogo global de packs vendibles (eje 2) para el panel super-admin.
 *
 * Endpoint org-less: el catálogo no pertenece a ninguna org. Sin TenantGuard.
 * El super-admin lo consulta para saber qué packs puede habilitar a una org
 * (POST orgs/:id/packs). El filtro por vertical de la org se hace en el cliente
 * (UX); el backend valida el vertical al habilitar (PackService.habilitar §8).
 */
@Get('packs')
@ApiOperation({ summary: 'Listar el catálogo global de packs (super-admin)' })
@ApiOkResponse({ description: 'Catálogo de packs vendibles', type: [PackResponseDto] })
@ApiResponse({ status: 403, description: 'No es super-admin de plataforma' })
async listarCatalogoPacks(): Promise<PackResponseDto[]> {
  return this.platformAdminService.listarCatalogoPacks();
}
```

- **`@ApiOkResponse({ type: [PackResponseDto] })` es OBLIGATORIO** — sin él el DTO no entra al OpenAPI (regla del repo, ya visto en `getDashboard`). Como `PackResponseDto` YA está en el OpenAPI (referenciado por `OrgPackEntitlementResponseDto.pack` y por el controller de packs Owner), el dump no debería introducir un schema nuevo, pero el **path** sí es nuevo → el generado cambia → `gen:api-types` produce diff.
- Guards heredados del controller (`@UseGuards(JwtAuthGuard, SuperAdminGuard)` a nivel clase, `:59`). NO agregar guards al método.
- `PlatformAuditInterceptor` a nivel clase audita; un GET org-less sin `req.tenantId` se registra sin `targetOrganizationId` (igual que dashboard/activity). Aceptable.

**Ruta de orden de `@Get`**: `@Get('packs')` vs `@Get('orgs/:id/packs')` — son paths distintos (`packs` vs `orgs/:id/packs`), no colisionan. Express los matchea exacto. Sin riesgo de captura.

### 0.3 Regeneración de tipos — comandos EXACTOS

**Desde `backend/`** (con la infra arriba — Postgres + Redis):

```bash
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
REDIS_HOST="localhost" \
MINIO_ENDPOINT="localhost" \
MINIO_PORT="9000" \
MINIO_ACCESS_KEY="minioadmin" \
MINIO_SECRET_KEY="minioadmin" \
MINIO_BUCKET="avicont-adjuntos" \
  pnpm run openapi:dump
```

> **GOTCHA (verificado):** sin las 5 env `MINIO_*` el dump tira `getOrThrow` desde
> `MinioStorageAdapter` durante `NestFactory.create(AppModule)`. Los valores de
> arriba son los del `docker-compose.yml`/`.env.example` (apply debe confirmar
> contra `backend/.env.example`); cualquier string no-vacío sirve porque el
> adapter NO se conecta a MinIO en construcción, solo crea el `S3Client` con esas
> creds. El bucket no se toca en el dump.

**Desde `frontend/`:**

```bash
cd frontend
pnpm run gen:api-types   # openapi-typescript ../backend/openapi.json -o src/types/api.generated.ts
```

Verificar drift localmente ANTES del PR (réplica del job CI `contract-drift`):

```bash
git diff --exit-code backend/openapi.json frontend/src/types/api.generated.ts
# Debe mostrar SOLO el path nuevo /api/admin/platform/packs (y nada más).
```

### 0.4 Aliases en `frontend/src/types/api.ts`

Agregar en la sección "Administración de plataforma" (tras `PlatformOrgMember`, ~línea 787) y/o una sección nueva "Packs (eje 2)". Nombres EXACTOS:

```typescript
// ============================================================
// Packs (eje 2) — catálogo, entitlement y activación
// ============================================================

// Catálogo global (GET /admin/platform/packs + embebido en entitlement).
export type Pack = Schemas['PackResponseDto'];

// Entitlement de un pack para una org (GET mis-packs, GET orgs/:id/packs, POST).
// Incluye `activo` + `pack` embebido.
export type OrgPackEntitlement = Schemas['OrgPackEntitlementResponseDto'];

// Respuesta del PATCH /api/packs/:clave — NO incluye `pack` embebido.
export type ActivacionPack = Schemas['ActivacionPackResponseDto'];

// Body de POST /admin/platform/orgs/:id/packs — packId? OR clave? (al menos uno).
export type HabilitarPackRequest = Schemas['HabilitarPackDto'];

// Body de PATCH /api/packs/:clave — { activo: boolean }.
export type ActivarPackRequest = Schemas['ActivarPackDto'];
```

- `ActivarPackDto` ya existe en el backend (`activar-pack.dto.ts`, referenciado por el PATCH del Owner). Verificar que entró al generado tras el dump; si no, NO bloquea — el body `{ activo: boolean }` se puede tipar inline. Preferir el alias si está.
- Reusar enums: `verticalAplicable`/`tipo` de `Pack` son uniones de string del generado (`VerticalPack`/`TipoPack`). NO se necesita objeto `as const` runtime salvo que la UI compare por valor — el filtro de vertical (§1.x SA) compara contra `'CONTABILIDAD'`/`'GRANJA'` literales, alcanza con el union type.

### 0.5 Tests Slice 0

- **Integration** (`backend/src/platform/`): `platform-admin.controller` ya tiene e2e en `test/`. Agregar al e2e existente de platform-admin (o crear `packs-catalogo.e2e-spec.ts` en `test/`):
  - `GET /api/admin/platform/packs` con JWT super-admin → 200 + array con los 3 packs del seed (`contabilidad.adjuntos`, `contabilidad.rag`, `granja.rag`).
  - Mismo endpoint con JWT NO super-admin → 403.
  - (TDD: escribir el e2e ROJO antes del endpoint.)
- NO hace falta unit del service (es un map trivial delega-y-mapea); el e2e cubre el contrato real. Si se quiere unit, mock de `PackService.listarCatalogo` → assert `toPackResponse` aplicado.

---

## SLICE 1 — UI super-admin (entitlement de packs)

### 1.1 Archivos nuevos (feature `platform-admin/`)

```
frontend/src/features/platform-admin/
├── api/
│   ├── get-packs-catalogo.ts        ← GET /admin/platform/packs
│   ├── get-org-packs.ts             ← GET /admin/platform/orgs/:id/packs
│   ├── habilitar-pack.ts            ← POST /admin/platform/orgs/:id/packs
│   └── revocar-pack.ts              ← DELETE /admin/platform/orgs/:id/packs/:packId
├── hooks/
│   ├── use-packs-catalogo.ts        ← useQuery ['platform-packs-catalogo']
│   ├── use-org-packs.ts             ← useQuery ['platform-org-packs', orgId]
│   ├── use-habilitar-pack.ts        ← useMutation
│   └── use-revocar-pack.ts          ← useMutation
└── components/
    └── org-packs-sheet.tsx          ← Sheet por org (lista catálogo + estado)
```

Archivo MODIFICADO: `pages/orgs-page.tsx` (DropdownMenu item + estado del sheet).

### 1.2 API functions (firmas exactas)

```typescript
// api/get-packs-catalogo.ts
import { api } from '@/lib/api';
import type { Pack } from '@/types/api';
export async function getPacksCatalogo(): Promise<Pack[]> {
  const res = await api.get<Pack[]>('/api/admin/platform/packs');
  return res.data;
}

// api/get-org-packs.ts
import { api } from '@/lib/api';
import type { OrgPackEntitlement } from '@/types/api';
export async function getOrgPacks(orgId: string): Promise<OrgPackEntitlement[]> {
  const res = await api.get<OrgPackEntitlement[]>(`/api/admin/platform/orgs/${orgId}/packs`);
  return res.data;
}

// api/habilitar-pack.ts  — SIEMPRE envía `clave` (R-07, más estable que UUID)
import { api } from '@/lib/api';
import type { OrgPackEntitlement } from '@/types/api';
export async function habilitarPack(orgId: string, clave: string): Promise<OrgPackEntitlement> {
  const res = await api.post<OrgPackEntitlement>(
    `/api/admin/platform/orgs/${orgId}/packs`,
    { clave },
  );
  return res.data;
}

// api/revocar-pack.ts  — 204, sin body de respuesta
import { api } from '@/lib/api';
export async function revocarPack(orgId: string, packId: string): Promise<void> {
  await api.delete(`/api/admin/platform/orgs/${orgId}/packs/${packId}`);
}
```

### 1.3 Hooks (query keys + invalidación)

```typescript
// hooks/use-packs-catalogo.ts — catálogo global, no depende de org.
export function usePacksCatalogo() {
  return useQuery({ queryKey: ['platform-packs-catalogo'], queryFn: getPacksCatalogo });
}

// hooks/use-org-packs.ts — entitlements de UNA org. enabled solo si hay orgId.
export function useOrgPacks(orgId: string | null) {
  return useQuery({
    queryKey: ['platform-org-packs', orgId],
    queryFn: () => getOrgPacks(orgId as string),
    enabled: orgId !== null,
  });
}

// hooks/use-habilitar-pack.ts — toast en el hook (Anti-F-13).
export function useHabilitarPack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, clave }: { orgId: string; clave: string }) => habilitarPack(orgId, clave),
    onSuccess: (_data, { orgId }) => {
      void qc.invalidateQueries({ queryKey: ['platform-org-packs', orgId] });
      toast.success('Pack habilitado');
    },
    onError: (err) => { toast.error(backendErrorMessage(err, 'No se pudo habilitar el pack')); },
  });
}

// hooks/use-revocar-pack.ts
export function useRevocarPack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, packId }: { orgId: string; packId: string }) => revocarPack(orgId, packId),
    onSuccess: (_data, { orgId }) => {
      void qc.invalidateQueries({ queryKey: ['platform-org-packs', orgId] });
      toast.success('Pack revocado');
    },
    onError: (err) => { toast.error(backendErrorMessage(err, 'No se pudo revocar el pack')); },
  });
}
```

- Invalidación = solo `['platform-org-packs', orgId]` (el sheet re-lee la lista de entitlements). El catálogo global no cambia → no se invalida. `['platform-orgs']` NO se invalida (la tabla de orgs no muestra packs).
- Cache Redis `org-packs:<orgId>` lo invalida el backend (`PackService.habilitar`/`revocar` → `redis.del`, ver `pack.service.ts:104,111`). Sin acción frontend (R-01).

### 1.4 Componente `org-packs-sheet.tsx`

Patrón: lista de acciones (NO form). Más cercano a `FeaturesPage` (switches/badges) que a `EntitlementSheet` (form). Recibe la org seleccionada.

```typescript
interface OrgPacksSheetProps {
  org: PlatformOrg | null;   // null = cerrado
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

Lógica de render:
1. `const catalogoQuery = usePacksCatalogo();`
2. `const orgPacksQuery = useOrgPacks(org?.id ?? null);`
3. **Filtro por vertical de la org (D-04)**: derivar el vertical desde `org.contabilidadEnabled`/`org.granjaEnabled`:
   ```typescript
   const verticalOrg: 'CONTABILIDAD' | 'GRANJA' | null =
     org?.contabilidadEnabled ? 'CONTABILIDAD' : org?.granjaEnabled ? 'GRANJA' : null;
   const catalogoVisible = (catalogoQuery.data ?? []).filter(
     (p) => verticalOrg !== null && p.verticalAplicable === verticalOrg && p.activo,
   );
   ```
   Si `verticalOrg === null` (org OTROS sin vertical): mostrar empty state "Esta organización no tiene un vertical activo; no hay packs aplicables." (el backend rechazaría todo igual con 400).
4. Cruzar catálogo con entitlements: un `Set` de `packId` habilitados desde `orgPacksQuery.data`:
   ```typescript
   const habilitadosById = new Map(orgPacksQuery.data?.map((e) => [e.packId, e]) ?? []);
   ```
5. Cada fila del catálogo visible → `OrgPackRow`:
   - Nombre + descripción + badge del `tipo`.
   - Si `habilitadosById.has(pack.id)`: badge "Habilitado" (+ badge "Activo" si `entitlement.activo`) + botón **Revocar** (variant outline, reversible → NO destructive, §14.4) → `useRevocarPack().mutate({ orgId: org.id, packId: pack.id })`.
   - Si no: botón **Habilitar** → `useHabilitarPack().mutate({ orgId: org.id, clave: pack.clave })`.
   - Botón disabled con `mutation.isPending` (Anti-F-07). Tap target ≥44px en mobile (`h-11 md:h-9`).

Estructura del Sheet: seguir §14.1 detail-drawer canónico — `side="right"`, `className="w-full sm:max-w-xl overflow-y-auto overflow-x-hidden"`, `SheetHeader` con título "Packs de «{org.name}»", body `space-y-4`, skeleton mientras `catalogoQuery.isLoading || orgPacksQuery.isLoading`, banner inline en error (Anti-F-13), footer con "Cerrar".

### 1.5 Integración en `orgs-page.tsx` (MODIFICAR)

- Nuevo estado: `const [packsOrg, setPacksOrg] = useState<PlatformOrg | null>(null);`
- En `OrgRowActions` (dropdown), agregar item junto a "Editar entitlement" (`:256`):
  ```tsx
  <DropdownMenuItem onClick={() => onManagePacks(org)}>
    Gestionar packs
  </DropdownMenuItem>
  ```
  Propagar `onManagePacks` por props desde `OrgsPage` → `OrgsContent` → `OrgRowActions` (mismo patrón que `onEditEntitlement`).
- Renderizar el sheet al final, junto a `EntitlementSheet` (`:96`):
  ```tsx
  <OrgPacksSheet
    org={packsOrg}
    open={packsOrg !== null}
    onOpenChange={(open) => { if (!open) setPacksOrg(null); }}
  />
  ```

### 1.6 Tests Slice 1 (vitest)

- `org-packs-sheet.test.tsx`: mock de los 4 hooks (vi.mock de `../hooks/*`).
  - Catálogo con 2 packs CONTABILIDAD, org `contabilidadEnabled=true`, uno habilitado → la fila habilitada muestra badge "Habilitado" + botón "Revocar"; la otra muestra "Habilitar".
  - Filtro de vertical: org `granjaEnabled=true` → solo packs `verticalAplicable==='GRANJA'` visibles; los CONTABILIDAD no se renderizan.
  - Click "Habilitar" → llama `mutate({ orgId, clave })` con la `clave` (no el id).
  - Botón disabled cuando `isPending`.
- NO testear los hooks triviales de useQuery (regla §9.4 frontend).

---

## SLICE 2 — UI Owner (activación)

### 2.1 Decisión de naming del directorio

Directorio interno: **`frontend/src/features/packs/`** (vocabulario técnico/dominio interno, consistente con `lib/use-packs.ts` y la `clave` del sistema). Label user-facing: **"Complementos"** (D-01). Ruta: `/settings/complementos`. Screaming architecture se respeta — `features/packs/` grita "el sistema tiene packs"; el label de UI es presentación.

### 2.2 Archivos nuevos (feature `packs/`)

```
frontend/src/features/packs/
├── api/
│   ├── get-mis-packs.ts             ← GET /api/packs/mis-packs
│   └── activar-pack.ts              ← PATCH /api/packs/:clave
├── hooks/
│   ├── use-mis-packs-gestion.ts     ← useQuery ['mis-packs-gestion', activeTenantId]
│   └── use-activar-pack.ts          ← useMutation
├── components/
│   └── complemento-row.tsx          ← fila con switch (clona FeatureFlagRow)
└── pages/
    └── complementos-page.tsx        ← página Owner (clona FeaturesPage)
```

> **NO reutilizar `lib/use-packs.ts` (`useMisPacks`)**: ese hook lee `packsActivos`
> de `me-permissions` (solo claves ACTIVAS, para el nav). La pantalla necesita
> `GET /api/packs/mis-packs` completo (todos los habilitados con su flag `activo`).
> Query key NUEVA `['mis-packs-gestion', activeTenantId]` — NO colisiona con
> `['me-permissions', activeTenantId]`.

### 2.3 API functions

```typescript
// api/get-mis-packs.ts
import { api } from '@/lib/api';
import type { OrgPackEntitlement } from '@/types/api';
export async function getMisPacks(): Promise<OrgPackEntitlement[]> {
  const res = await api.get<OrgPackEntitlement[]>('/api/packs/mis-packs');
  return res.data;
}

// api/activar-pack.ts
import { api } from '@/lib/api';
import type { ActivacionPack } from '@/types/api';
export async function activarPack(clave: string, activo: boolean): Promise<ActivacionPack> {
  const res = await api.patch<ActivacionPack>(`/api/packs/${clave}`, { activo });
  return res.data;
}
```

### 2.4 Hooks (query keys + invalidación — D-05)

```typescript
// hooks/use-mis-packs-gestion.ts
export function useMisPacksGestion() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const activeTenantId = useAuthStore((s) => s.user?.activeTenantId);
  return useQuery({
    queryKey: ['mis-packs-gestion', activeTenantId],
    queryFn: getMisPacks,
    enabled: Boolean(accessToken) && Boolean(activeTenantId),
  });
}

// hooks/use-activar-pack.ts — toast en el hook (Anti-F-13).
export function useActivarPack() {
  const qc = useQueryClient();
  const activeTenantId = useAuthStore((s) => s.user?.activeTenantId);
  return useMutation({
    mutationFn: ({ clave, activo }: { clave: string; activo: boolean }) => activarPack(clave, activo),
    onSuccess: (_data, { activo }) => {
      // Refresca la lista de la página + el nav (useMisPacks lee de me-permissions).
      void qc.invalidateQueries({ queryKey: ['mis-packs-gestion', activeTenantId] });
      void qc.invalidateQueries({ queryKey: ['me-permissions', activeTenantId] });
      toast.success(activo ? 'Complemento activado' : 'Complemento desactivado');
    },
    onError: (err) => { toast.error(backendErrorMessage(err, 'No se pudo actualizar el complemento')); },
  });
}
```

- **Estrategia: invalidación, NO optimistic update.** El switch refleja `entitlement.activo` de la query; tras el toggle se invalida y re-lee. En error: el toast avisa y la query NO cambió → el switch vuelve a su estado real automáticamente (no se tocó cache optimistamente). Más simple y honesto que optimistic; el toggle de un pack no es alta frecuencia.
- Invalidar `['me-permissions', activeTenantId]` es **clave**: el nav del Owner se gatea con `useMisPacks` que deriva de ahí; sin esto, activar un pack no refresca el nav (D-05).

### 2.5 Componente `complemento-row.tsx` + página `complementos-page.tsx`

`complemento-row.tsx` — clona `FeatureFlagRow` (`feature-flag-row.tsx`):
```typescript
interface ComplementoRowProps { entitlement: OrgPackEntitlement; }
```
- `const mutation = useActivarPack();`
- Card `flex ... rounded-md border bg-card p-4` (idéntico a FeatureFlagRow).
- Nombre = `entitlement.pack.nombre`, descripción = `entitlement.pack.descripcion`, `<code>` con `entitlement.pack.clave`.
- `<Switch checked={entitlement.activo} disabled={mutation.isPending} onCheckedChange={(next) => mutation.mutate({ clave: entitlement.pack.clave, activo: next })} aria-label={...} />`.
- Toast: vive en el hook (`useActivarPack`), NO en el componente (a diferencia de `FeatureFlagRow` que lo hace inline — acá seguimos la regla estricta Anti-F-13 con toast en el hook).

`complementos-page.tsx` — clona `FeaturesPage` (`features-page.tsx`):
- `const query = useMisPacksGestion();`
- Header canónico §13.1: `<h1>Complementos</h1>` + subtítulo "Activá o desactivá los complementos que la plataforma habilitó para tu organización."
- `query.isLoading` → skeleton (5 filas `h-20`, §14.5).
- `query.isError` → banner inline (Anti-F-13, NO toast en el cuerpo): `<div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">`.
- `query.data.length === 0` → empty state de página §13.4: "Tu organización no tiene complementos habilitados. Contactá al administrador de la plataforma." (sin CTA — el Owner no puede habilitarse packs).
- `query.data.map((e) => <ComplementoRow key={e.id} entitlement={e} />)`.

### 2.6 Gating: `requiredSystemRole` en `NavItem` + filtro en `NavList`

**Tipo `NavItem`** (`nav-items.ts`, MODIFICAR) — agregar campo opcional:
```typescript
export interface NavItem {
  // ... existentes ...
  /**
   * SystemRoles que pueden ver el ítem. Si está ausente, sin gate de rol de
   * sistema. Si está presente, el ítem solo se muestra si el usuario tiene al
   * menos uno (useHasSystemRole). Coincide con el @RequireSystemRole del backend.
   */
  requiredSystemRole?: SystemRole[];
}
```
(importar `SystemRole` de `@/types/api`).

**Nuevo nav item** (en la sección Administración cross-vertical, tras "Módulos activos" `:151`):
```typescript
{
  to: '/settings/complementos',
  label: 'Complementos',
  icon: Boxes,   // lucide — agregar al import (o Package/Blocks)
  requiredSystemRole: ['OWNER', 'ADMIN'],
},
```
Sin `vertical` (cross-vertical), sin `pack` (la pantalla de gestión NO se gatea por pack — gatearla por pack sería circular).

**Filtro en `NavList`** (`nav-list.tsx`, MODIFICAR) — SUTILEZA: `useHasSystemRole(roles)` toma un array y devuelve un bool; no se puede llamar por-item (rompe reglas de hooks). Solución: leer `user.roles` UNA vez y filtrar in-line, replicando la lógica de `useHasSystemRole`:

```typescript
import { useAuthStore } from '@/stores/auth-store';
// ... dentro de NavList, junto a los otros hooks (:32-34):
const userRoles = useAuthStore((s) => s.user?.roles);  // selector estable (Anti-F-15)

const visibleItems = NAV_ITEMS.filter((item) => {
  const pasaPermiso = item.requiredPermission === undefined || has(item.requiredPermission);
  const pasaVertical = item.vertical === undefined || item.vertical === verticalActivo;
  const pasaPack = item.pack === undefined || (packsActivos?.includes(item.pack) ?? false);
  const pasaSystemRole =
    item.requiredSystemRole === undefined ||
    (userRoles?.some((r) => item.requiredSystemRole!.includes(r as SystemRole)) ?? false);
  return pasaPermiso && pasaVertical && pasaPack && pasaSystemRole;
});
```

- Selector `useAuthStore((s) => s.user?.roles)` devuelve referencia cruda (NO `?? []` dentro — Anti-F-15). El `?? false` va afuera, en el filtro.
- `as SystemRole` en el `.includes`: `userRoles` es `string[] | undefined` (puede traer slugs de custom roles además de OWNER/ADMIN); el `.includes` contra `requiredSystemRole: SystemRole[]` matchea solo OWNER/ADMIN, los slugs no matchean. Correcto.

> **Alternativa descartada**: extraer un sub-componente `<NavItemGated>` por ítem
> que llame `useHasSystemRole` — viola la simetría del filtro actual (todos los
> gates se computan en un solo `.filter`) y agrega renders condicionales de hooks.
> La lectura única de `user.roles` es más simple y consistente.

### 2.7 Ruta en `router.tsx` (MODIFICAR)

La ruta va dentro de `DashboardShell` (es una pantalla de settings del tenant, NO del panel super-admin). Gating: NO `RequirePermission` (no hay permiso fino) — se necesita un guard por SystemRole.

**Verificación**: NO existe un componente `RequireSystemRole` de routing (solo `RequirePermission` y `RequireSuperAdmin`). Opciones:
- **Opción elegida**: crear un guard inline mínimo o reutilizar gating. Como el backend ya rechaza con 403 (defensa real) y el nav ya oculta el ítem, la ruta puede gatearse con un wrapper liviano. Crear `frontend/src/components/shared/require-system-role.tsx` clonando `require-permission.tsx` pero usando `useHasSystemRole`:
  ```typescript
  export function RequireSystemRole({ roles, children }: {
    roles: SystemRole[]; children: React.ReactNode;
  }): React.JSX.Element {
    const allowed = useHasSystemRole(roles);
    if (!allowed) return <Navigate to="/" replace />;
    return <>{children}</>;
  }
  ```
  (apply debe leer `require-permission.tsx` para clonar su estructura de loading/redirect exacta — si `RequirePermission` tiene estado de loading mientras carga permisos, `RequireSystemRole` NO lo necesita porque `user.roles` es sincrónico del JWT en Zustand, sin query.)

Ruta nueva (dentro del bloque `DashboardShell`, junto a `/settings/features` `:184`):
```tsx
{
  path: '/settings/complementos',
  element: (
    <RequireSystemRole roles={['OWNER', 'ADMIN']}>
      <ComplementosPage />
    </RequireSystemRole>
  ),
},
```
+ import de `ComplementosPage` y `RequireSystemRole`.

### 2.8 Tests Slice 2 (vitest)

- `complementos-page.test.tsx`: mock de `useMisPacksGestion`.
  - data vacía → empty state con el copy exacto.
  - data con 2 entitlements → 2 `ComplementoRow`; switch refleja `activo`.
  - isError → banner inline (NO toast en cuerpo).
- `complemento-row.test.tsx`: mock de `useActivarPack`.
  - Switch `checked` = `entitlement.activo`.
  - `onCheckedChange` → `mutate({ clave, activo })` con la clave del pack.
  - disabled cuando `isPending`.
- `nav-list.test.tsx` (si existe; sino crear): item Complementos visible con `user.roles=['OWNER']`; oculto con `user.roles=['contador-slug']` (custom role sin OWNER/ADMIN); oculto sin `user.roles`.
- `require-system-role.test.tsx`: redirige a `/` sin rol; renderiza children con OWNER.
- NO testear los hooks triviales de useQuery.

---

## TRANSVERSAL

### T.1 Orden de implementación y puntos verdes

```
Slice 0 (backend + tipos)
  └─ verde: e2e packs-catalogo (200 SA / 403 no-SA) + tsc/lint backend
            + dump+gen sin diff salvo el path nuevo (contract-drift local OK)
  ── BLOQUEA a 1 y 2 (ambos consumen aliases de api.ts) ──
Slice 1 (UI super-admin)         Slice 2 (UI Owner)
  └─ verde: vitest sheet+filtro    └─ verde: vitest page+row+nav+guard
            tsc -b / lint front              tsc -b / lint front
```

- Slice 1 y 2 son independientes entre sí (features distintas, sin imports cruzados) → pueden ir en paralelo tras Slice 0, pero se entregan como PRs separados (squash, dependencia lineal de tipos).
- Cada PR: checklist mobile §7 del frontend (375/768/1440, dark mode, tap targets 44px) — hay Sheet (Slice 1) y switches (Slice 2).

### T.2 TDD por slice (estricto)

1. **Slice 0**: e2e ROJO (`GET /admin/platform/packs` 404 porque no existe) → endpoint → VERDE.
2. **Slice 1**: vitest del sheet con hooks mockeados ROJO → componente → VERDE.
3. **Slice 2**: vitest page/row/nav/guard ROJO → implementación → VERDE.

Backend integration usa Postgres real (Testcontainers / `DATABASE_URL`), patrón del repo. El e2e de platform-admin ya tiene helpers (`createTestTenant`, super-admin JWT) en `test/` — reutilizarlos.

### T.3 Riesgos técnicos y resolución

| ID | Riesgo | Resolución concreta |
|----|--------|---------------------|
| RT-01 | Dump OpenAPI falla por `getOrThrow('MINIO_*')` en `MinioStorageAdapter` durante `NestFactory.create` | Pasar las 5 env `MINIO_*` inline en el comando `openapi:dump` (§0.3). Valores dummy no-vacíos bastan (el adapter no se conecta en construcción). **apply DEBE setearlas o el dump revienta.** |
| RT-02 | CI `contract-drift` rojo tras regenerar | Correr `git diff --exit-code` local antes del PR (§0.3). El único cambio esperado es el path `/api/admin/platform/packs`. Si aparece otro diff (DTO movido), revisar. |
| RT-03 | Cache Redis `org-packs:<id>` del `PackEnabledGuard` quedaría stale tras habilitar/revocar/activar | **Ya resuelto en backend**: `PackService.habilitar/revocar/activar` hace `redis.del` (`pack.service.ts:104,111,171`). El flujo SA pasa por `PlatformAdminService → PackService`; el Owner por `PackController → PackService`. Sin acción nueva. |
| RT-04 | Filtro de vertical en cliente (D-04) podría ofrecer un pack que el backend rechaza (400 `PACK_VERTICAL_NO_APLICABLE`) | El filtro deriva el vertical de `org.contabilidadEnabled`/`granjaEnabled` (campos reales en `PlatformOrg`). El backend valida igual (`pack.service.ts:94-101`) → defensa real. Si por drift el filtro fallara, el `onError` del hook muestra el message del backend. |
| RT-05 | Gating fail-closed del nav: `user.roles` undefined durante bootstrap | El filtro usa `userRoles?.some(...) ?? false` → fail-closed (oculta el ítem hasta que el JWT esté en Zustand). `user.roles` viene del JWT decodificado al setear el token (sincrónico, sin query), así que el window de undefined es mínimo. |
| RT-06 | `ActivacionPackResponseDto` (PATCH) no trae `pack` embebido (R-06) | La UI Owner invalida `['mis-packs-gestion']` en `onSuccess` y re-lee `GET /mis-packs` (que sí trae `pack`). El switch no depende del response del PATCH. |
| RT-07 | `RequireSystemRole` de routing no existe | Crearlo clonando `require-permission.tsx` pero con `useHasSystemRole` (sincrónico, sin loading state). §2.7. |
| RT-08 | Anti-31 (cross-tenant) en `GET /admin/platform/packs` | Es org-less (catálogo global, sin `tenantId` en la query); enforcement en `SuperAdminGuard`. Coherente con dashboard/activity. NO es una query cross-tenant de entidad de dominio. |

### T.4 Lo que NO se toca (guard rails)

- `PackEnabledGuard`, `PackService` (salvo NADA — `listarCatalogo` ya existe), schema de packs, cache Redis, seed del catálogo.
- `lib/use-packs.ts` (`useMisPacks` del nav) — se deja intacto; la gestión usa hook nuevo.
- Catálogo RBAC / `permissions.ts` — no se agregan permisos (gating por SystemRole).
- Backend de activación/entitlement (POST/DELETE/PATCH/GET orgs/:id/packs, PATCH /packs/:clave, GET /packs/mis-packs) — ya existen, no se modifican.
