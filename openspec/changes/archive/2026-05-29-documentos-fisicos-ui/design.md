<!-- Última edición: 2026-05-29 | Owner: backend-lead -->

# Design: documentos-fisicos-ui

## Technical Approach

CRUD standalone de `documentos-fisicos` en `frontend/`, replicando 1:1 el patrón consolidado de `tipos-documento-fisico/` (api/ → hooks/ → components/ → pages/ + schemas/ + lib/). Aditivo: ningún archivo existente se reescribe, solo se extienden `types/api.ts`, `router.tsx`, `nav-items.ts`. Backend ya mergeado (PR #45/#46). Decisiones cerradas D1–D7 (proposal) se materializan abajo.

## Architecture Decisions

| # | Choice | Alternativa rechazada | Rationale |
|---|--------|-----------------------|-----------|
| D1 | `buildFormSchema(esTributario)` factory zod via `superRefine`, recreado con `useMemo(tipoSeleccionado)`. Campos monto/moneda **ocultos** + limpiados al cambiar tipo | schema estático + validación en `onSubmit` | El estado del tipo es dinámico; `superRefine` mantiene una sola fuente de verdad. Ocultar (no disable) espeja los dos 422 del backend |
| D2 | `numero` input `disabled` si ≥1 comprobante CONTABILIZADO (derivado de `comprobantesAsociados` del GET :id) | siempre editable + confiar en 409 | Evita un submit destinado a fallar; alinea con `INMUTABLE_POR_COMPROBANTE_CONTABILIZADO` |
| D3 | `estadoAsociacion` solo como **filtro** + en **drawer** (derivado de `comprobantesAsociados`); NO columna | columna en tabla | DTO de lista NO trae el campo (verificado). Evita N+1 |
| D4 | Eliminar siempre habilitado; 409 → `toast` en `onError` (Anti-F-13), AlertDialog queda abierto | predecir editabilidad por fila | Lista no trae conteo de asociaciones. Backend es la autoridad |
| D5 | `ContactoCombobox` (Popover + Command) con `useContactos({ search, pageSize: 50 })` debounce 350 ms | `<Select>` simple | Contactos escala a cientos (GIN trigram server-side) |
| D6 | Filtros en `useSearchParams`; cualquier cambio resetea `page=1`. `contactoId` diferido del MVP | estado local `useState` | URL state (§4) permite compartir/back-button |
| D7 | `numero` uppercase en vivo (`onChange`), `trim` en blur; regex `^[A-Z0-9./-]+$` sobre valor normalizado | normalización silenciosa al enviar | Transparencia: el usuario ve lo que se guarda |

**Hallazgo clave**: `backendErrorMessage(err, fallback)` ya devuelve el `message` del backend (español). Los 6 códigos de documento-físico **NO requieren entradas nuevas** en `error-messages.ts` — el fallback genérico de mutation cubre todo. Solo se añade un mapeo custom si se quiere UX especial (no en MVP).

## Data Flow

    DocumentosFisicosPage (useSearchParams: filtros+page)
       │  buildParams() → useDocumentosFisicos(params) ──→ GET /api/documentos-fisicos
       ├─→ ListFilters (numero debounce, tipo, estado, fechas)
       ├─→ ListTable (items) → onEditar/onEliminar/onVerDetalle
       ├─→ DetalleDrawer ── useDocumentoFisicoDetalle(id) ──→ GET /:id (comprobantesAsociados)
       ├─→ FormSheet ── useDocumentoFisicoDetalle(id, edit) + mutations ──→ POST/PATCH
       │       └─→ Form (buildFormSchema(esTributario) + ContactoCombobox)
       └─→ EliminarDialog ── useEliminarDocumentoFisico ──→ DELETE /:id

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `features/documentos-fisicos/api/{create,get-documentos-fisicos,get-documento-fisico-detalle,update,eliminar}-*.ts` | Create | 1 fn pura por endpoint, tipada, vía `api` de `@/lib/api` |
| `features/documentos-fisicos/lib/build-documentos-fisicos-params.ts` (+`.test.ts`) | Create | filtros UI → `ListarDocumentosFisicosParams` (spread condicional, omite vacíos) |
| `features/documentos-fisicos/hooks/use-documentos-fisicos.ts` | Create | `useQuery(['documentos-fisicos', params])` + `keepPreviousData` |
| `features/documentos-fisicos/hooks/use-documento-fisico-detalle.ts` | Create | `useQuery(['documentos-fisicos','detalle',id])`, `enabled: id !== null` |
| `features/documentos-fisicos/hooks/use-documento-fisico-mutations.ts` | Create | `useInvalidate…` + create/update/eliminar; `onError → toast` |
| `features/documentos-fisicos/schemas/documento-fisico-form-schema.ts` (+`.test.ts`) | Create | factory `buildFormSchema`, defaults, mappers |
| `features/documentos-fisicos/components/documento-fisico-form.tsx` (+`.test.tsx`) | Create | form presentacional con lógica condicional D1/D2/D7 |
| `features/documentos-fisicos/components/documento-fisico-form-sheet.tsx` | Create | Sheet `sm:max-w-3xl` (7 campos), orquesta detalle+mutations |
| `features/documentos-fisicos/components/documento-fisico-list-filters.tsx` (+`.test.tsx`) | Create | numero, tipo, estado, fechaDesde/Hasta |
| `features/documentos-fisicos/components/documento-fisico-list-table.tsx` (+`.test.tsx`) | Create | tabla + skeleton fuera de TableBody + empty state |
| `features/documentos-fisicos/components/documento-fisico-detalle-drawer.tsx` | Create | §14.1; deriva estado de `comprobantesAsociados` |
| `features/documentos-fisicos/components/eliminar-documento-fisico-dialog.tsx` (+`.test.tsx`) | Create | AlertDialog destructive + preventDefault (§14.3) |
| `features/documentos-fisicos/components/contacto-combobox.tsx` | Create | Popover+Command, `useContactos` debounce 350 ms |
| `features/documentos-fisicos/pages/documentos-fisicos-page.tsx` | Create | orquestador (header §13.1, PaginationBar §13.3) |
| `types/api.ts` | Modify | +8 tipos (ver Interfaces) |
| `routes/router.tsx` | Modify | ruta `/documentos-fisicos` |
| `components/nav-items.ts` | Modify | item nav (icono `FileStack`/`Receipt`; fallback `File`) |

## Interfaces / Contracts

```ts
// types/api.ts — espejo de los DTO del backend
export const EstadoAsociacion = { SUELTO:'SUELTO', EN_BORRADOR:'EN_BORRADOR', CONTABILIZADO:'CONTABILIZADO' } as const;
export type EstadoAsociacion = (typeof EstadoAsociacion)[keyof typeof EstadoAsociacion];
export interface DocumentoFisico { id:string; numero:string; fechaEmision:string; monto:string|null; moneda:string|null; glosa:string|null; tipoDocumentoFisico:{id:string;nombre:string;codigo:string;esTributario:boolean}; contacto:{id:string;razonSocial:string}|null; organizationId:string; createdAt:string }
export interface DocumentoFisicoDetalle extends DocumentoFisico { comprobantesAsociados:{id:string;numero:string|null;estado:string}[] }
export interface DocumentoFisicoListResponse { items:DocumentoFisico[]; total:number; page:number; pageSize:number }
export interface CreateDocumentoFisicoRequest { tipoDocumentoFisicoId:string; numero:string; fechaEmision:string; monto?:string|null; moneda?:Moneda|null; contactoId?:string|null; glosa?:string|null }
export type UpdateDocumentoFisicoRequest = Partial<CreateDocumentoFisicoRequest>;
export interface ListarDocumentosFisicosParams { tipoDocumentoFisicoId?:string; fechaDesde?:string; fechaHasta?:string; contactoId?:string; estadoAsociacion?:EstadoAsociacion; numero?:string; page?:number; pageSize?:number }
```

**Schema zod (factory D1/D7)** — `monto` como string decimal, mensajes en español:
```ts
const MONTO_REGEX = /^(?!0+(\.0+)?$)\d+(\.\d+)?$/;        // §4.5: positivo, no cero
const NUMERO_REGEX = /^[A-Z0-9./-]+$/;                     // espeja FORMATO_INVALIDO del backend
export function buildFormSchema(esTributario: boolean) {
  const base = z.object({
    tipoDocumentoFisicoId: z.string().uuid('Seleccioná un tipo'),
    numero: z.string().trim().min(1,'El número es requerido').max(50).regex(NUMERO_REGEX,'Solo letras, números, punto, guion y barra'),
    fechaEmision: z.string().min(1,'La fecha es requerida'),
    monto: z.string().trim().optional(),
    moneda: z.enum(['BOB','USD']).optional(),
    contactoId: z.string().uuid().optional(),
    glosa: z.string().max(500).optional(),
  });
  return base.superRefine((v, ctx) => {
    if (esTributario) {
      if (!v.monto || !MONTO_REGEX.test(v.monto)) ctx.addIssue({ path:['monto'], code:'custom', message:'El monto es requerido y debe ser un decimal válido' });
      if (!v.moneda) ctx.addIssue({ path:['moneda'], code:'custom', message:'La moneda es requerida' });
    }
  });
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (lib) | `buildDocumentosFisicosParams`: sin filtros→solo page/pageSize; cada filtro incluido; vacíos omitidos | fn pura, sin render |
| Unit (schema) | tributario+monto null→error; no-tributario válido sin monto; numero con espacio→error regex; uppercase OK | `buildFormSchema(bool).safeParse(...)` |
| Component (form) | create habilitado; edit pre-poblado; `numero` disabled si CONTABILIZADO (D2); monto/moneda visibles solo si tributario (D1); submit disabled si `isPending` | RTL + user-event; mockear hooks `useTiposDocumentoFisico`/`useContactos` con `vi.mock` |
| Component (table) | loading→skeleton (no tabla); vacío→empty state; click editar/eliminar/detalle dispara callback | props planas |
| Component (filters) | typing numero→onChange; estado/tipo/fechas→onChange | RTL |
| Component (dialog) | confirm llama mutate con preventDefault; cierra en onSuccess | RTL |

**Mock de portales Radix (gotcha JSDOM)**: `Select`/`Command`/`Popover` renderizan en portal y duplican texto (trigger + opción) → usar `getAllByText` o roles específicos (`getByRole('option')`). `noUncheckedIndexedAccess`: `onSubmit.mock.calls[0]?.[0]` con optional chaining en todo acceso por índice.

## Gotchas a respetar

- **Anti-F-14**: `glosa` Textarea en Sheet → `className="w-full max-w-full resize-y [field-sizing:fixed] min-h-[80px] text-base md:text-sm"`.
- **Anti-F-07**: submit `disabled={mutation.isPending}` + spinner.
- **Anti-F-13**: `toast.error` SOLO en `onError` de mutations, nunca en cuerpo.
- **§4.5**: `monto` input `type="text"` (nunca `number`), tipo `string|null`.
- **No anidar `<tr>`**: skeleton fuera de `<TableBody>`, reemplaza la tabla.
- **`noUncheckedIndexedAccess`** en tests.

## Migration / Rollout

No migration required. Cambio puramente aditivo en frontend. Branch `feat/documentos-fisicos-ui`. Rollback = revert del squash.

## Open Questions

- [ ] Confirmar nombre exacto del icono lucide disponible (`FileStack` vs `Receipt`) en la versión instalada; fallback `File`. (No bloqueante.)
