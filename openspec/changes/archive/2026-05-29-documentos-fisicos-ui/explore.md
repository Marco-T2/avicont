<!--
Change: documentos-fisicos-ui
Fase: explore
Fecha: 2026-05-29
Status: COMPLETADO
-->

# Exploración — Change B: `documentos-fisicos-ui`

> CRUD standalone de `documentos-fisicos` en el frontend (React/Vite).
> El backend está mergeado (PR #45, #46). El brief de handoff está en
> `docs/disenos/documento-fisico-ui-asociacion.md`.

---

## 1. Contrato real del backend (verificado contra código)

### Endpoints (base: `/documentos-fisicos`)

| Método | Ruta | Permiso requerido | Notas |
|--------|------|-------------------|-------|
| POST | `/documentos-fisicos` | `contabilidad.documentos-fisicos.create` | Crea un doc físico |
| GET | `/documentos-fisicos` | `contabilidad.documentos-fisicos.read` | Lista paginada con filtros |
| GET | `/documentos-fisicos/:id` | `contabilidad.documentos-fisicos.read` | Detalle con `comprobantesAsociados` |
| PATCH | `/documentos-fisicos/:id` | `contabilidad.documentos-fisicos.update` | PATCH parcial; 409 si está en contabilizado |
| DELETE | `/documentos-fisicos/:id` | `contabilidad.documentos-fisicos.delete` | 204; 409 si tiene asociaciones activas |

### Query params de GET /documentos-fisicos

| Param | Tipo | Descripción |
|-------|------|-------------|
| `tipoDocumentoFisicoId` | UUID (opcional) | Filtrar por tipo |
| `fechaDesde` | string YYYY-MM-DD (opcional) | Desde fecha emisión (inclusive) |
| `fechaHasta` | string YYYY-MM-DD (opcional) | Hasta fecha emisión (inclusive) |
| `contactoId` | UUID (opcional) | Filtrar por contacto |
| `estadoAsociacion` | `SUELTO \| EN_BORRADOR \| CONTABILIZADO` (opcional) | Estado de asociación a comprobantes |
| `numero` | string (opcional) | Búsqueda parcial sobre número (case-insensitive) |
| `page` | number (default: 1) | Paginación |
| `pageSize` | number (default: 20, max: 100) | Tamaño de página |

**Mapeo interno `EstadoAsociacion` → filtro del port:**
- `SUELTO` → `libre` (sin ningún comprobante)
- `EN_BORRADOR` → `asociado` (en ≥1 borrador)
- `CONTABILIZADO` → `contabilizado` (en ≥1 contabilizado)

### Shape de request POST (CreateDocumentoFisicoDto)

```typescript
{
  tipoDocumentoFisicoId: string;        // UUID, requerido
  numero: string;                        // 1-50 chars; se normaliza trim+uppercase
  fechaEmision: string;                  // YYYY-MM-DD
  monto?: string | null;                 // Decimal string "1250.50"; requerido si tipo.esTributario
  moneda?: 'BOB' | 'USD' | null;        // requerido si tipo.esTributario
  contactoId?: string | null;           // UUID opcional
  glosa?: string | null;               // max 500 chars
}
```

### Shape de request PATCH (UpdateDocumentoFisicoDto)

Todos los campos son opcionales. Mismos tipos que POST.

**Regla de mutabilidad crítica**: si el doc tiene ≥1 asociación a comprobante CONTABILIZADO → 409
`DOCUMENTO_FISICO_INMUTABLE_POR_COMPROBANTE_CONTABILIZADO`. En ese caso NINGÚN campo es editable.
Si solo está en borradores → editable.

### Shape de response DocumentoFisicoDto

```typescript
{
  id: string;
  numero: string;
  fechaEmision: string;                  // YYYY-MM-DD (slice 0-10 de ISO)
  monto: string | null;                  // Decimal como string (§4.5)
  moneda: string | null;
  glosa: string | null;
  tipoDocumentoFisico: {
    id: string;
    nombre: string;
    codigo: string;
    esTributario: boolean;
  };
  contacto: { id: string; razonSocial: string } | null;
  organizationId: string;
  createdAt: string;                     // ISO timestamp
}
```

### Shape de response DocumentoFisicoDetalleDto (GET /:id)

Extiende `DocumentoFisicoDto` con:
```typescript
{
  comprobantesAsociados: Array<{
    id: string;
    numero: string | null;
    estado: string;  // 'BORRADOR' | 'CONTABILIZADO' | 'BLOQUEADO'
  }>;
}
```

### Shape de response lista (GET /)

```typescript
{
  items: DocumentoFisicoDto[];
  total: number;
  page: number;
  pageSize: number;
}
```

### Errores relevantes para la UI

| Code | HTTP | Cuándo mostrar |
|------|------|----------------|
| `DOCUMENTO_FISICO_NUMERO_DUPLICADO` | 409 | Al crear/editar con número ya usado para ese tipo en el tenant |
| `DOCUMENTO_FISICO_NUMERO_FORMATO_INVALIDO` | 422 | Número con chars no permitidos (solo `A-Z0-9./-`) |
| `DOCUMENTO_FISICO_MONTO_REQUERIDO_PARA_TRIBUTARIO` | 422 | Tipo tributario sin monto/moneda |
| `DOCUMENTO_FISICO_MONTO_NO_PERMITIDO_PARA_NO_TRIBUTARIO` | 422 | Tipo no tributario con monto |
| `DOCUMENTO_FISICO_INMUTABLE_POR_COMPROBANTE_CONTABILIZADO` | 409 | Editar doc con comprobante CONTABILIZADO |
| `DOCUMENTO_FISICO_REFERENCIADO_POR_COMPROBANTE` | 409 | Eliminar doc con asociaciones activas |
| `TIPO_DOCUMENTO_FISICO_NO_ENCONTRADO` | 404 | Tipo de doc no existe/inactivo |
| `CONTACTO_NO_ENCONTRADO` | 404 | Contacto no existe en el tenant |

### Diferencias brief vs código real

1. **El brief dice** "editable solo si suelto o solo en borradores; inmutable si está en un contabilizado". **El código confirma** esto exactamente: `countAsociacionesContabilizadas > 0 → throw`. El DELETE falla si `countAsociaciones > 0` (cualquier estado, no solo contabilizados).
2. **El brief NO menciona** que el DELETE falla también con borradores activos. El código `eliminar()` llama `countAsociaciones` (TOTAL), no solo contabilizadas. **La UI debe reflejar esto**: eliminar es posible solo si el doc está `SUELTO`.
3. **Monto requerido**: el service valida monto+moneda para tributarios, y que monto+moneda sean NULL para no-tributarios. Si el tipo no es tributario y se envía monto → 422. La UI debe condicionar la visibilidad del campo monto/moneda según `tipo.esTributario`.

---

## 2. Patrón frontend a replicar

### Estructura de archivos (de `tipos-documento-fisico/`)

```
frontend/src/features/documentos-fisicos/
├── api/
│   ├── create-documento-fisico.ts          # POST /documentos-fisicos
│   ├── get-documentos-fisicos.ts           # GET /documentos-fisicos (lista)
│   ├── get-documento-fisico-detalle.ts     # GET /documentos-fisicos/:id
│   ├── update-documento-fisico.ts          # PATCH /documentos-fisicos/:id
│   └── eliminar-documento-fisico.ts        # DELETE /documentos-fisicos/:id
├── hooks/
│   ├── use-documentos-fisicos.ts           # useQuery lista
│   ├── use-documento-fisico-detalle.ts     # useQuery detalle (enabled: id !== null)
│   └── use-documento-fisico-mutations.ts   # create/update/eliminar mutations
├── components/
│   ├── documento-fisico-form.tsx           # Form puro (props: mode, initialData, onSubmit, isSubmitting)
│   ├── documento-fisico-form-sheet.tsx     # Sheet contenedor (orquesta mutations)
│   ├── documento-fisico-list-filters.tsx   # Filtros: búsqueda + estado asociación + tipo + rango fechas
│   ├── documento-fisico-list-table.tsx     # Tabla con acciones editar/eliminar
│   ├── documento-fisico-detalle-drawer.tsx # Drawer de detalle con comprobantesAsociados
│   ├── eliminar-documento-fisico-dialog.tsx # AlertDialog de confirmación para eliminar
│   ├── documento-fisico-form.test.tsx      # tests del form
│   ├── documento-fisico-list-filters.test.tsx
│   ├── documento-fisico-list-table.test.tsx
│   └── eliminar-documento-fisico-dialog.test.tsx
├── pages/
│   └── documentos-fisicos-page.tsx         # Orquestador: filtros + tabla + paginación + modales
├── schemas/
│   ├── documento-fisico-form-schema.ts     # zod schema + types + mappers
│   └── documento-fisico-form-schema.test.ts
├── lib/
│   ├── build-documentos-fisicos-params.ts  # mapeo filtros UI → query params
│   └── build-documentos-fisicos-params.test.ts
└── types.ts                                # tipos locales si aplica
```

### Convenciones observadas en el patrón

1. **Query keys**: `['documentos-fisicos', params]` para lista; `['documentos-fisicos', 'detalle', id]` para detalle.
2. **`keepPreviousData`** (TanStack Query `placeholderData: keepPreviousData`) en todas las queries de lista — evita parpadeo al cambiar filtros.
3. **Invalidación**: `queryClient.invalidateQueries({ queryKey: ['documentos-fisicos'] })` limpia todo el cache tras mutations.
4. **`useInvalidateDocumentosFisicos()`**: hook utilitario que devuelve la función de invalidación, usado por cada mutation hook (patrón de `tipos-documento-fisico`).
5. **Toasts**: `toast.success()` en `onSuccess`, `toast.error(backendErrorMessage(err, fallback))` en `onError` de mutations. NUNCA en cuerpo del componente (Anti-F-13).
6. **Form**: `react-hook-form` + `zodResolver`. Submit deshabilitado con `disabled={isSubmitting}` (Anti-F-07 crítico).
7. **Sheets**: `sm:max-w-xl` para forms de 3-6 campos. El form con 7 campos (más un select de tipos con texto largo) debería usar `sm:max-w-3xl` según §14.2.
8. **Dialog de confirmación**: `AlertDialog` con `e.preventDefault()` en `AlertDialogAction` + cierre manual desde `onSuccess` (§14.3).
9. **Debounce**: búsqueda por texto debounceada 350ms (patrón de `tipos-documento-fisico`, ver uso de `useDebouncedValue`).
10. **Reset de página**: al cambiar cualquier filtro, `setPage(1)`.

---

## 3. Tipos compartidos a agregar en `frontend/src/types/api.ts`

Los siguientes tipos NO existen aún y deben agregarse:

```typescript
// ============================================================
// Documentos físicos
// ============================================================

export const EstadoAsociacion = {
  SUELTO: 'SUELTO',
  EN_BORRADOR: 'EN_BORRADOR',
  CONTABILIZADO: 'CONTABILIZADO',
} as const;
export type EstadoAsociacion = (typeof EstadoAsociacion)[keyof typeof EstadoAsociacion];

// Tipo embebido en DocumentoFisico (no el catálogo completo TipoDocumentoFisico).
export interface TipoDocumentoFisicoEmbebido {
  id: string;
  nombre: string;
  codigo: string;
  esTributario: boolean;
}

export interface ContactoEmbebido {
  id: string;
  razonSocial: string;
}

export interface ComprobanteAsociadoView {
  id: string;
  numero: string | null;
  estado: string;                        // 'BORRADOR' | 'CONTABILIZADO' | 'BLOQUEADO'
}

// Espejo de DocumentoFisicoDto en backend/src/documentos-fisicos/dto/documento-fisico-response.dto.ts
export interface DocumentoFisico {
  id: string;
  numero: string;
  fechaEmision: string;                  // YYYY-MM-DD
  monto: string | null;                  // Decimal como string (§4.5) — NUNCA number
  moneda: string | null;                 // 'BOB' | 'USD' | null
  glosa: string | null;
  tipoDocumentoFisico: TipoDocumentoFisicoEmbebido;
  contacto: ContactoEmbebido | null;
  organizationId: string;
  createdAt: string;
}

// Espejo de DocumentoFisicoDetalleDto (extiende DocumentoFisico)
export interface DocumentoFisicoDetalle extends DocumentoFisico {
  comprobantesAsociados: ComprobanteAsociadoView[];
}

export interface DocumentoFisicoListResponse {
  items: DocumentoFisico[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateDocumentoFisicoRequest {
  tipoDocumentoFisicoId: string;
  numero: string;
  fechaEmision: string;                  // YYYY-MM-DD
  monto?: string | null;                 // string decimal, no number
  moneda?: Moneda | null;
  contactoId?: string | null;
  glosa?: string | null;
}

export interface UpdateDocumentoFisicoRequest {
  tipoDocumentoFisicoId?: string;
  numero?: string;
  fechaEmision?: string;
  monto?: string | null;
  moneda?: Moneda | null;
  contactoId?: string | null;
  glosa?: string | null;
}

// Query params para GET /api/documentos-fisicos
export interface ListarDocumentosFisicosParams {
  tipoDocumentoFisicoId?: string;
  fechaDesde?: string;                   // YYYY-MM-DD
  fechaHasta?: string;                   // YYYY-MM-DD
  contactoId?: string;
  estadoAsociacion?: EstadoAsociacion;
  numero?: string;
  page?: number;
  pageSize?: number;
}
```

**Tipo ya existente y reutilizable**: `TipoDocumentoFisico` (catálogo completo, para el selector). `Contacto` + `ListarContactosParams` (para el selector de contacto).

---

## 4. Routing y navegación

### Registro en `router.tsx`

Agregar ruta:
```typescript
{ path: '/documentos-fisicos', element: <DocumentosFisicosPage /> },
```

Importar:
```typescript
import { DocumentosFisicosPage } from '@/features/documentos-fisicos/pages/documentos-fisicos-page';
```

### Registro en `nav-items.tsx`

Agregar item al array `NAV_ITEMS`:
```typescript
{ to: '/documentos-fisicos', label: 'Documentos físicos', icon: FileStack }
// FileStack o Receipt (lucide-react) — ambos disponibles
```

Posición sugerida: después de `Tipos de documento` y antes de `Períodos fiscales`, ya que es el módulo de uso del catálogo de tipos.

---

## 5. Dependencias entre catálogos (hooks reutilizables existentes)

### Para el selector de tipo de documento

**Hook existente**: `useTiposDocumentoFisico(params)` en `@/features/tipos-documento-fisico/hooks/use-tipos-documento-fisico`.

Uso en el form:
```typescript
// Cross-feature: tipos activos para el select del form de documentos físicos.
// pageSize 50 = suficiente para el catálogo típico de un tenant boliviano.
const { data: tiposData } = useTiposDocumentoFisico({ activo: undefined, pageSize: 50 });
```

El hook acepta `ListarTiposDocumentoFisicoParams`. Para el selector solo se necesitan los activos (default del backend: solo activos).

**La selección del tipo determina si los campos `monto`/`moneda` son visibles y requeridos** — lógica en el schema zod (superRefine) y en el form (condicional por `watch('tipoDocumentoFisicoId')` + lookup en tipos cargados).

### Para el selector de contacto

**Hook existente**: `useContactos(params)` en `@/features/contactos/hooks/use-contactos`.

Uso:
```typescript
// Cross-feature: contactos activos para el select/combobox de documento físico.
// Búsqueda server-side si hay muchos; pageSize 50 para el caso happy path.
const { data: contactosData } = useContactos({ activo: true, pageSize: 50 });
```

No existe aún un `ContactoCombobox` compartido. Se puede crear uno en `components/shared/` o hacer un select local dentro del feature. El feature de `comprobantes` probablemente ya tiene o necesitará uno — coordinar.

### Para filtros de la lista de documentos físicos

El filtro `tipoDocumentoFisicoId` requiere cargar los tipos disponibles. Reutilizar `useTiposDocumentoFisico({ pageSize: 100 })` para poblar un select de filtro.

---

## 6. Gotchas frontend vigentes (de `frontend/CLAUDE.md`)

| Gotcha | Regla aplicable |
|--------|-----------------|
| **Anti-F-14: Textarea en Sheet** | El campo `glosa` es textarea. Dentro del Sheet del form, debe llevar `className="w-full max-w-full resize-y [field-sizing:fixed] min-h-[80px] text-base md:text-sm"` |
| **JSDOM sin media queries** (`getAllByText` vs `getByText`) | En tests con shadcn Select/Command, el DOM puede renderizar múltiples instancias del mismo texto (el trigger + la opción en el popover). Usar `getAllByText` o buscar por rol más específico. |
| **`noUncheckedIndexedAccess`** | `onSubmit.mock.calls[0]?.[0]` — usar optional chaining en todos los accesos a arrays por índice en tests. |
| **No anidar `<tr>` en `<tr>`** | Skeletons de tabla deben ir FUERA del `<TableBody>`, reemplazando la tabla entera. |
| **`monto` como string** | `monto` es `string | null` en el DTO. El input debe ser `type="text"`, nunca `type="number"`. Validar con zod regex del backend: `/^(?!0+(\.0+)?$)\d+(\.\d+)?$/`. |
| **Colores hardcodeados** | Solo variables del tema (`text-foreground`, `bg-card`, etc.). El badge de estado de asociación necesitará colores semánticos. |
| **`isPending` en submit** | Anti-F-07: el botón de submit SIEMPRE `disabled={mutation.isPending}`. |
| **Toast solo en mutations** | Anti-F-13: nunca `toast.error()` en cuerpo del componente. Solo en `onError` de `useMutation`. |

---

## 7. Testing

### Stack

- **Vitest** + `@testing-library/react` + `@testing-library/user-event` + `@testing-library/jest-dom`.
- Configuración en `vite.config.ts` (`test.environment: 'jsdom'`, `setupFiles: ['./src/test/setup.ts']`).
- Tests al lado del código.

### Comando

```bash
cd frontend
pnpm test               # todos los tests
pnpm test -- --run      # una sola pasada (no watch)
pnpm test -- src/features/documentos-fisicos   # solo los del feature
```

### Qué testear (patrón de `tipos-documento-fisico`)

1. **`documento-fisico-form.test.tsx`**:
   - mode=create: campos habilitados, botón "Crear documento".
   - mode=edit: campos pre-poblados, `numero` editable solo si no hay contabilizados.
   - `isSubmitting=true` → submit disabled.
   - Campos `monto`/`moneda` visibles solo cuando `esTributario=true` del tipo seleccionado.
   - Validación zod: numero vacío → error; monto con formato inválido → error.

2. **`documento-fisico-list-table.test.tsx`**:
   - `isLoading + items=[]` → skeleton visible, no tabla.
   - `!isLoading + items=[]` → empty state.
   - Fila con estado CONTABILIZADO → botón Editar disabled (doc inmutable).
   - Click Editar → `onEditar` llamado con el item.
   - Click Eliminar → `onEliminar` llamado solo si el doc es SUELTO.

3. **`documento-fisico-list-filters.test.tsx`**:
   - Chips de estadoAsociacion: click SUELTO → activo; click reset → `onEstadoChange` con undefined.
   - Input de número: typing → `onNumeroChange`.

4. **`build-documentos-fisicos-params.test.ts`**:
   - Sin filtros → solo `page` + `pageSize`.
   - `estadoAsociacion='SUELTO'` → param incluido.
   - `fechaDesde` y `fechaHasta` → incluidos.
   - `numero` vacío → omitido.

5. **`documento-fisico-form-schema.test.ts`**:
   - Tipo tributario + monto null → error de validación.
   - Tipo no tributario + monto → error de validación.
   - Número `fac 0042` (con espacio) → error regex.
   - Número `FAC-0042` (ya uppercase, con guión) → válido.

---

## 8. Decisiones abiertas / riesgos para la fase de propuesta

### D1: Condicionalidad monto/moneda en el form

El campo `monto` y `moneda` son requeridos si el tipo seleccionado es tributario, prohibidos si no lo es. Esto requiere:
- Cargar los tipos activos al montar el form.
- Hacer el schema zod `superRefine` dinámico (o validar en `onSubmit` si zod no lo soporta limpiamente).
- **Riesgo**: el schema estático de zod no tiene acceso al estado de `tipoDocumentoFisicoId` → necesita `superRefine` o validación manual post-parse.
- **Alternativa**: validar en el handler `onSubmit` del form antes de llamar la mutation, mostrando errores manuales vía `form.setError`.

### D2: Edit condicional del campo `numero`

El campo `numero` es editable si el doc NO tiene comprobantes contabilizados. Para mode=edit, se necesita saber el `estadoAsociacion` del documento antes de abrir el Sheet. Opciones:
- **A**: cargar el detalle (`GET /:id`) al abrir el Sheet — añade una request extra.
- **B**: la lista (`GET /`) ya incluye suficiente info para determinar editabilidad si se añade `estadoAsociacion` al DTO de lista... pero el DTO de lista no incluye eso actualmente.
- **C (simpler)**: deshabilitar `numero` en mode=edit si `comprobantesAsociados.length > 0` — pero eso requiere el detalle. 
- **Recomendación**: simplificar para MVP: el campo `numero` siempre editable en el Sheet; si el backend rechaza con 409, mostrar toast claro. El `PATCH` falla atómicamente con mensaje "Documento inmutable por comprobante contabilizado".

### D3: Cómo mostrar `estadoAsociacion` en la lista

El DTO de lista (`DocumentoFisicoDto`) NO incluye un campo `estadoAsociacion` explícito. Solo incluye el conjunto de datos del documento. Para mostrar el estado de asociación en la tabla, necesitaríamos información adicional. Opciones:
- **A**: agregar un campo derivado al DTO de lista (requeriría cambio de backend — agrega carga).
- **B**: inferir del detalle al abrir el drawer.
- **C**: mostrar en la lista solo si el filtro `estadoAsociacion` está activo (el usuario ya sabe que está filtrando).
- **D (recomendada)**: mostrar estado en el drawer de detalle (donde están `comprobantesAsociados`), no en la lista. La lista muestra tipo, número, fecha, monto — datos de identificación. El detalle muestra el estado contextual.

### D4: Eliminar — cuándo habilitar el botón

Según el service, DELETE falla si hay CUALQUIER asociación (no solo contabilizadas). La UI debe:
- Deshabilitar el botón Eliminar si el doc está en algún comprobante (borrador o contabilizado).
- Esto requiere saber el estado de asociación. Ver D3 — sin ese dato en la lista, el botón siempre aparece habilitado y el backend devuelve 409 si hay asociaciones.
- **MVP pragmático**: botón siempre visible; el 409 muestra toast "No se puede eliminar: el documento está asociado a comprobantes". El `backendErrorMessage` cubre el fallback.

### D5: Selector de contacto — combobox vs select

La lista de contactos puede ser larga (miles de registros). El `<Select>` con 50 ítems es manejable; con más, necesita búsqueda server-side via `Command` (shadcn). El backend tiene búsqueda por `q` en contactos.

**Recomendación**: para MVP, usar `Select` con los primeros 50 contactos activos (`useContactos({ activo: true, pageSize: 50 })`). Si el tenant tiene muchos contactos, agregar búsqueda inline como deuda documentada.

### D6: Rango de fechas en filtros

Los filtros tienen `fechaDesde`/`fechaHasta`. El patrón existente (tipos-documento-fisico, contactos) no tiene filtros de rango de fechas. Se debe crear desde cero. Opciones:
- **A**: dos inputs de tipo `date` simples.
- **B**: `Popover` + calendario shadcn (más elegante).
- **MVP recomendado**: dos inputs `type="date"` con label "Desde" y "Hasta". Más simple, menos código.

### D7: ¿Existe `FileStack` o `Receipt` en lucide-react?

Para el nav item. Verificar en la versión instalada. Si no existe, usar `File` (siempre disponible).

### R1: Riesgo de tipos anidados en tests JSDOM

El `Select` de shadcn usa Radix UI, que en JSDOM puede no renderizar correctamente el portal. En tests del form donde el tipo se selecciona via `Select`, puede requerirse un mock o asegurar que el test use `userEvent` con la secuencia correcta para abrir el popover.

### R2: `monto` como string en zod

El schema debe validar `monto` como string con regex decimal. El componente `Input` debe ser `type="text"` (no `number`). El user verá "1250.50" en texto — aceptable para contadores bolivianos acostumbrados a escribir montos manualmente.

---

## 9. Inventario de archivos a crear

```
frontend/src/features/documentos-fisicos/
├── api/
│   ├── create-documento-fisico.ts
│   ├── get-documentos-fisicos.ts
│   ├── get-documento-fisico-detalle.ts
│   ├── update-documento-fisico.ts
│   └── eliminar-documento-fisico.ts
├── hooks/
│   ├── use-documentos-fisicos.ts
│   ├── use-documento-fisico-detalle.ts
│   └── use-documento-fisico-mutations.ts
├── components/
│   ├── documento-fisico-form.tsx
│   ├── documento-fisico-form.test.tsx
│   ├── documento-fisico-form-sheet.tsx
│   ├── documento-fisico-list-filters.tsx
│   ├── documento-fisico-list-filters.test.tsx
│   ├── documento-fisico-list-table.tsx
│   ├── documento-fisico-list-table.test.tsx
│   ├── documento-fisico-detalle-drawer.tsx
│   └── eliminar-documento-fisico-dialog.tsx
├── pages/
│   └── documentos-fisicos-page.tsx
├── schemas/
│   ├── documento-fisico-form-schema.ts
│   └── documento-fisico-form-schema.test.ts
└── lib/
    ├── build-documentos-fisicos-params.ts
    └── build-documentos-fisicos-params.test.ts
```

**Archivos a modificar:**
- `frontend/src/types/api.ts` — agregar tipos `DocumentoFisico`, `DocumentoFisicoDetalle`, `EstadoAsociacion`, etc.
- `frontend/src/routes/router.tsx` — agregar ruta `/documentos-fisicos`.
- `frontend/src/components/nav-items.tsx` — agregar item de nav.

**Total archivos nuevos**: ~22. **Modificaciones**: 3 archivos existentes.
