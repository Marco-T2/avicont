# Granja frontend — contratos exactos (referencia S6)

> Extraído de los controllers/DTOs reales del backend (`backend/src/granja/`) + exploración de convenciones frontend. Fuente de verdad para implementar `frontend/src/features/granja/`.

## Convenciones de la casa (frontend) — pre-digerido

- **Cliente HTTP**: `import { api } from '@/lib/api'` (axios, `withCredentials`, inyecta `Authorization` y refresh 401 solo). NO baseURL — usar rutas `/api/...`. El `tenantId` lo infiere el backend del JWT; NO mandarlo.
- **react-query v5** (`@tanstack/react-query`): `useQuery({ queryKey, queryFn, enabled })`, `useMutation({ mutationFn, onSuccess })`. NO `onSuccess`/`onError` en `useQuery`. `gcTime` (no `cacheTime`). Invalidación: `qc.invalidateQueries({ queryKey: [...] })`.
- **activeTenantId**: `const activeTenantId = useAuthStore((s) => s.user?.activeTenantId)`. Usarlo en queryKey para aislar cache por tenant + `enabled: Boolean(activeTenantId)`.
- **Forms**: RHF (`react-hook-form` v7) + `zodResolver` (zod v4). Shadcn primitivos (`Label`+`Input`), NO el `<Form>` wrapper. Mensajes de error en español EN EL SCHEMA. Submit: `<form onSubmit={(e) => { void handleSubmit(onSubmit)(e); }} noValidate>`. Cast `resolver: zodResolver(schema) as Resolver<FormValues>` cuando hay `.default()`.
- **Dinero como string**: nunca number. Patrón `DECIMAL_STRING = z.string().regex(/^\d+(\.\d{1,2})?$/, 'mensaje')`. Input text con `className="text-base md:text-sm"`.
- **Gating**: `import { PERMISSIONS } from '@/lib/permissions'`. `<Can permission={...}>` (string | string[] AND; ocultar o render-prop `(allowed) => ...`). `<PermissionButton permission={...} deniedReason="...">`. `<RequirePermission permission="...">` (solo string, para páginas/rutas). `usePermissions()` → `{ has, hasAll, isOwner, permissions }` (fail-closed). Todos en `@/components/shared/`.
- **Mobile-first ESTRICTO**: base 375px (clases sin prefijo = mobile), `min-h-[44px]` en tap targets, inputs `text-base md:text-sm`, **costo/pollo como dato más prominente** (`text-3xl`+).
- **Fechas**: `@db.Date` viajan como `'YYYY-MM-DD'`. Para mostrar dd/MM/yyyy usar `Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz' })` y agregar `T12:00:00` para evitar shift UTC (patrón `features/comprobantes/lib/formatear-fecha-contable.ts`). `createdAt`/`updatedAt` son ISO timestamptz UTC → convertir a `America/La_Paz` al mostrar (deuda §3.5).
- **UI disponibles** (`@/components/ui/`): Card, Button, Input, Label, Select, Tabs, Dialog, AlertDialog, Sheet, Badge, Switch, Skeleton, Table, Textarea, Tooltip, DropdownMenu, Checkbox, Popover, Command, Sonner (toast via `import { toast } from 'sonner'`). Íconos: `lucide-react`.
- **Test**: vitest + testing-library. `pnpm exec vitest run <path>`. Typecheck: `pnpm exec tsc -b` (NO `--noEmit`). Wrapper con `QueryClientProvider` (retry:false, gcTime:0). Mock de permisos: `vi.mock('@/lib/use-permissions', async (o) => ({ ...(await o()), usePermissions: () => ({ has: () => true, hasAll: () => true, isOwner: false, permissions: [] }) }))`. Componentes con gate fail-closed → envolver con `TooltipProvider`.
- **Nav/vertical gating**: NO existe store `granjaEnabled`. La visibilidad es 100% RBAC: si el tenant activó granja, el backend otorga `granja.*` y `has('granja.lotes.read')` da true. Nav item con `requiredPermission: PERMISSIONS.granja.X.read` se auto-filtra en `nav-list.tsx`. NO construir shell de plataforma.

## PERMISSIONS.granja (bloque EXACTO a agregar en `frontend/src/lib/permissions.ts`)

```ts
granja: {
  dashboard: { read: 'granja.dashboard.read' },
  lotes: {
    read: 'granja.lotes.read',
    create: 'granja.lotes.create',
    update: 'granja.lotes.update',
    delete: 'granja.lotes.delete',
  },
  tiposRegistro: {
    read: 'granja.tipos-registro.read',
    create: 'granja.tipos-registro.create',
    update: 'granja.tipos-registro.update',
    delete: 'granja.tipos-registro.delete',
  },
  movimientos: {
    read: 'granja.movimientos.read',
    create: 'granja.movimientos.create',
    update: 'granja.movimientos.update',
    delete: 'granja.movimientos.delete',
  },
  chat: { interact: 'granja.chat.interact' },
},
```
> ASIMETRÍA intencional: key JS `tiposRegistro` (camel) ↔ string `granja.tipos-registro.*` (kebab). NO "corregir". Espeja `tiposDocumento` en contabilidad.

## 15 endpoints

| # | Método | Ruta | Permiso | Request | Response |
|---|--------|------|---------|---------|----------|
| 1 | GET | `/api/granja/dashboard` | `granja.dashboard.read` | — | `LoteDashboardItemDto[]` |
| 2 | POST | `/api/granja/lotes` | `granja.lotes.create` | `CreateLoteDto` | `LoteResponseDto` |
| 3 | GET | `/api/granja/lotes?estado=&page=&pageSize=` | `granja.lotes.read` | query | `ListarLotesResponseDto` |
| 4 | GET | `/api/granja/lotes/:id` | `granja.lotes.read` | — | `LoteResponseDto` |
| 5 | PATCH | `/api/granja/lotes/:id` | `granja.lotes.update` | `UpdateLoteDto` | `LoteResponseDto` |
| 6 | POST | `/api/granja/lotes/:id/cerrar` | `granja.lotes.update` | — | `LoteResponseDto` |
| 7 | GET | `/api/granja/tipos-registro?naturaleza=&activo=` | `granja.tipos-registro.read` | query | `TipoRegistroResponseDto[]` |
| 8 | POST | `/api/granja/tipos-registro` | `granja.tipos-registro.create` | `CreateTipoRegistroDto` | `TipoRegistroResponseDto` |
| 9 | PATCH | `/api/granja/tipos-registro/:id` | `granja.tipos-registro.update` | `UpdateTipoRegistroDto` | `TipoRegistroResponseDto` |
| 10 | DELETE | `/api/granja/tipos-registro/:id` | `granja.tipos-registro.delete` | — | 200/204 |
| 11 | POST | `/api/granja/lotes/:id/movimientos/inversion` | `granja.movimientos.create` | `CreateMovimientoInversionDto` | `MovimientoInversionResponseDto` |
| 12 | POST | `/api/granja/lotes/:id/movimientos/cantidad` | `granja.movimientos.create` | `CreateMovimientoCantidadDto` | `MovimientoCantidadResponseDto` |
| 13 | GET | `/api/granja/lotes/:id/movimientos` | `granja.movimientos.read` | — | `{ inversiones: MovimientoInversionResponseDto[], cantidades: MovimientoCantidadResponseDto[] }` |
| 14 | DELETE | `/api/granja/lotes/:id/movimientos/inversion/:movId` | `granja.movimientos.delete` | — | 204 |
| 15 | DELETE | `/api/granja/lotes/:id/movimientos/cantidad/:movId` | `granja.movimientos.delete` | — | 204 |

## Request shapes (TS)

```ts
interface CreateLoteRequest {
  cantidadInicial: number;          // int > 0, INMUTABLE tras crear
  fechaIngreso: string;             // 'YYYY-MM-DD'
  nombre?: string;                  // max 120
  galpon?: string;                  // max 120
  fechaEstimadaSaca?: string;       // 'YYYY-MM-DD'
  detalle?: string;                 // max 500
}
interface UpdateLoteRequest {        // NO cantidadInicial (backend la ignora)
  nombre?: string; galpon?: string; detalle?: string;
  fechaIngreso?: string; fechaEstimadaSaca?: string;
}
interface CreateTipoRegistroRequest { nombre: string; naturaleza: 'INVERSION' | 'CANTIDAD'; }  // nombre 1..100
interface UpdateTipoRegistroRequest { nombre?: string; activo?: boolean; }
interface CreateMovimientoInversionRequest {
  monto: string;                    // /^\d+(\.\d{1,2})?$/  > 0
  fecha: string;                    // 'YYYY-MM-DD'
  tipoRegistroId: string;           // uuid, naturaleza INVERSION
  detalle?: string;                 // max 500
}
interface CreateMovimientoCantidadRequest {
  cantidad: number;                 // int >= 1
  fecha: string; tipoRegistroId: string; detalle?: string;
}
```

## Response shapes (TS)

```ts
type EstadoLote = 'ACTIVO' | 'CERRADO';
type NaturalezaRegistro = 'INVERSION' | 'CANTIDAD';

interface ResumenLote {
  avesVivas: number;
  costoAcumulado: string;           // BOB string
  costoPorPolloVivo: string | null; // null si avesVivas = 0 (mortalidad total)
  porcentajeMortalidad: number;     // 0..1 (multiplicar x100 para %)
  edadDias: number;
}
interface LoteDashboardItem {
  id: string; nombre: string | null; galpon: string | null;
  estado: EstadoLote; cantidadInicial: number; fechaIngreso: string;
  edadDias: number; avesVivas: number;
  costoAcumulado: string; costoPorPolloVivo: string | null; porcentajeMortalidad: number;
}
interface LoteResponse {            // GET :id, POST, PATCH, cerrar
  id: string; nombre: string | null; cantidadInicial: number;
  fechaIngreso: string; fechaEstimadaSaca: string | null; fechaCierre: string | null;
  galpon: string | null; detalle: string | null; estado: EstadoLote;
  organizationId: string; resumen: ResumenLote; createdAt: string; updatedAt: string;
}
interface LoteListItem {           // GET /lotes (sin resumen)
  id: string; nombre: string | null; cantidadInicial: number;
  fechaIngreso: string; fechaCierre: string | null; galpon: string | null; estado: EstadoLote;
}
interface ListarLotesResponse { items: LoteListItem[]; total: number; page: number; pageSize: number; }
interface TipoRegistroResponse {
  id: string; nombre: string; naturaleza: NaturalezaRegistro;
  esSistema: boolean; activo: boolean; organizationId: string; createdAt: string; updatedAt: string;
}
interface MovimientoInversionResponse {
  id: string; loteId: string; tipoRegistroId: string;
  monto: string; detalle: string | null; fecha: string; createdAt: string;
}
interface MovimientoCantidadResponse {
  id: string; loteId: string; tipoRegistroId: string;
  cantidad: number; detalle: string | null; fecha: string; createdAt: string;
}
interface MovimientosResponse { inversiones: MovimientoInversionResponse[]; cantidades: MovimientoCantidadResponse[]; }
```

## Derivados client-side (NO vienen del backend)

- **Desglose de costos por tipo** (lote-detail-page): agrupar `movimientos.inversiones` por `tipoRegistroId`, sumar `monto` (con decimal-safe — usar string math o Number con cuidado, preferir agrupar y formatear), y joinear el `nombre` desde `tipos-registro`. NO hay endpoint para esto.
- **costoPorPolloVivo === null** → mortalidad total (avesVivas=0). Mostrar con estilo visual distinto ("—" o alerta).
