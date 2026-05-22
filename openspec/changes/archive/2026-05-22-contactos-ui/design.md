# Design: contactos-ui

> Fecha: 2026-05-21
> Fase: design
> Proyecto: avicont
> Scope: FRONTEND (React 19 + Vite + TanStack Query + react-hook-form + zod v4).

---

## 0. Convenciones del documento

- `Dx` = decisión de arquitectura. `Adaptación N` = una de las 5 desviaciones
  vs `plan-cuentas`.
- Paths relativos a `frontend/`.
- Idioma: dominio en español (`Contacto`, `razonSocial`, `esCliente`),
  framework en inglés (`useContactos`, `getContactos`, `ContactoForm`).
- La verdad de testing/arquitectura de este slice es el **frontend**
  (vitest + Testing Library, feature-based), NO el `openspec/config.yaml` (que
  describe backend).

---

## 1. Technical Approach

**Espejo 1:1 de `plan-cuentas` con 5 adaptaciones.** `plan-cuentas` es el patrón
canónico de una feature contable del frontend (ya mergeado y probado). Se replica
su estructura (`api/` + `hooks/` + `components/` + `pages/` + `schemas/`),
sus convenciones de query keys, su patrón de drawer→sheet→dialog, y su estilo de
tests. Las desviaciones se justifican por el dominio: contactos es **plano**
(no jerárquico), tiene **reactivación** (UI nueva), y su form es **más simple**.

```
frontend/src/features/contactos/
├── api/
│   ├── get-contactos.ts          GET /api/contactos        → ContactoListResponse
│   ├── get-contacto-detail.ts    GET /api/contactos/:id    → Contacto
│   ├── create-contacto.ts        POST /api/contactos       → Contacto
│   ├── update-contacto.ts        PATCH /api/contactos/:id  → Contacto
│   ├── desactivar-contacto.ts    POST .../:id/desactivar   → Contacto
│   ├── reactivar-contacto.ts     POST .../:id/reactivar    → Contacto
│   └── eliminar-contacto.ts      DELETE /api/contactos/:id → void (sin botón UI)
├── hooks/
│   ├── use-contactos.ts          useQuery ['contactos', params]
│   ├── use-contacto-detail.ts    useQuery ['contactos','detalle', id]
│   └── use-contacto-mutations.ts useCreate/useUpdate/useDesactivar/useReactivar
├── schemas/
│   └── contacto-form-schema.ts   zod + cross-field refine + ContactoFormValues
├── components/
│   ├── contacto-list-table.tsx       presentacional, key=id
│   ├── contacto-list-filters.tsx     segmentado + toggle inactivos + buscador
│   ├── contacto-detail-drawer.tsx    Sheet detalle + acciones (estados act/inact)
│   ├── contacto-form.tsx             react-hook-form + zod, simple
│   ├── contacto-form-sheet.tsx       Sheet contenedor del form, orquesta mutación
│   └── desactivar-contacto-dialog.tsx AlertDialog de confirmación
└── pages/
    └── contactos-page.tsx        container: orquesta hooks + componentes
```

---

## 2. Architecture Decisions

### D1: Tipos espejo exacto del `ContactoResponseDto` — NO copiar `Cuenta`

`Contacto` se define a mano en `types/api.ts` (Opción 1A, CLAUDE.md §10.10).
**Diferencias críticas vs `Cuenta`** (Riesgo R1):

- `Contacto` **NO trae `organizationId`** (el response del backend no lo incluye).
  `Cuenta` sí lo trae. Copiar `Cuenta` como base introduciría un campo fantasma.
- `Contacto` trae `createdByUserId` (string), que `Cuenta` no tiene.
- Sin enums nuevos. `Contacto` no tiene `claseCuenta`/`subClaseCuenta`/
  `naturaleza`/`nivel`/`esDetalle` etc.

```ts
export interface Contacto {
  id: string;
  razonSocial: string;
  nombreComercial: string | null;
  documento: string | null;
  esCliente: boolean;
  esProveedor: boolean;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  activo: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}
```

### D2: Data layer — una función por endpoint, vía `@/lib/api`

Idéntico a `plan-cuentas`. El cliente único trae el interceptor Bearer + el 401→
refresh dedup; cualquier request por fuera lo pierde (Anti-F-03). Las funciones
son puras y tipadas, sin lógica de UI.

**Manejo de `documento` (Riesgo R3 — `""` vs `null`)**: `create-contacto.ts` y
`update-contacto.ts` transforman `documento === ''` (o `undefined`) en `null`
antes de armar el body. El backend tiene unique parcial
`WHERE documento IS NOT NULL`: si se mandara `""`, dos contactos sin documento
chocarían contra la constraint. Mismo trato para los demás opcionales que el
backend espera nullables (`email`, `telefono`, `direccion`, `nombreComercial`):
vacío → `null`.

**`update-contacto.ts` NO envía `activo`**: el estado se cambia por
desactivar/reactivar, no por PATCH (espejo del comentario de
`update-cuenta.ts`).

### D3: Hooks — query keys y placeholderData

```ts
['contactos', params]           // lista paginada/filtrada
['contactos', 'detalle', id]    // detalle individual
```

- `useContactos(params)`: `useQuery` + `placeholderData: keepPreviousData` (la
  lista no parpadea al cambiar filtros/página) — copiado de `use-cuentas`.
- `useContactoDetail(id: string | null)`: `enabled: id !== null`; con el drawer
  cerrado (`id === null`) no dispara request — copiado de `use-cuenta-detail`.
- Mutaciones en `use-contacto-mutations.ts`: un helper `useInvalidateContactos()`
  que hace `invalidateQueries({ queryKey: ['contactos'] })` en cada `onSuccess`,
  invalidando lista + detalle de una vez. Cuatro mutaciones: create, update,
  desactivar, **reactivar** (esta última es la novedad — Adaptación 3).

### D4: Schema zod — cross-field flags + opcionales nullables

```ts
export const contactoFormSchema = z
  .object({
    razonSocial: z.string().min(2, 'La razón social es obligatoria (mín. 2)')
      .max(200, 'Máximo 200 caracteres'),
    nombreComercial: z.string().max(200).optional().or(z.literal('')),
    documento: z.string().max(50).optional().or(z.literal('')),
    email: z.string().email('Email inválido').optional().or(z.literal('')),
    telefono: z.string().max(50).optional().or(z.literal('')),
    direccion: z.string().max(300).optional().or(z.literal('')),
    esCliente: z.boolean(),
    esProveedor: z.boolean(),
  })
  // Cross-field: al menos un rol. Espejo de CONTACTO_FLAGS_INVALIDOS del backend.
  .refine((v) => v.esCliente || v.esProveedor, {
    message: 'El contacto debe ser cliente, proveedor o ambos',
    path: ['esCliente'],
  });

export type ContactoFormValues = z.infer<typeof contactoFormSchema>;
```

Notas:
- `email` vacío DEBE ser válido → `.optional().or(z.literal(''))` + el
  `.email()` solo aplica a strings no vacíos (zod valida el formato solo cuando
  hay valor; con `.or(z.literal(''))` el `''` pasa por la rama literal).
- El `path: ['esCliente']` ancla el error del refine en un campo concreto para
  que react-hook-form lo muestre en el checkbox (no como error global suelto).
- La conversión `'' → null` NO vive en el schema (mantiene `ContactoFormValues`
  como strings) — vive en el data layer (D2), que es donde se arma el body HTTP.

### D5: Filtros — segmentado + toggle inactivos + buscador (Adaptación 2)

`contacto-list-filters.tsx` es presentacional (recibe estado por props, emite
callbacks). Componentes:

1. **Segmentado** Todos | Clientes | Proveedores. Tipo del estado:
   `type RolFiltro = 'todos' | 'clientes' | 'proveedores'`. Patrón visual:
   chips/segmented control con `aria-pressed` (espejo de los `ChipButton` de
   `cuenta-list-filters`, pero mutuamente exclusivos en vez de toggle por clase).
2. **Toggle "Incluir inactivos"**: un `Switch` de shadcn (disponible en
   `components/ui/switch.tsx`) con su `<label>`.
3. **Buscador**: `Input` con icono `Search` + botón "limpiar" cuando hay texto
   (copiado del buscador de `cuenta-list-filters`). El debounce NO vive aquí —
   vive en la página (D9), igual que `plan-cuentas`.

**Contrato HTTP 3-state — `activo`** (decisión de producto 2026-05-21):

El backend expone tres valores para el param `activo`:
- Sin param (o `activo=true`): solo activos — comportamiento default.
- `activo=false`: solo inactivos.
- **`activo=all` (NUEVO)**: activos + inactivos (unión completa).

El DTO del backend (`ListarContactosQueryDto`) fue extendido para aceptar
`boolean | 'all'`. El service (`ListarContactosInput.activo?: boolean | 'all'`)
y el repo (where vacío sobre `activo` cuando `filtros.activo === 'all'`) ya lo
soportaban antes del cambio del DTO. Solo el DTO HTTP + el campo del controller
necesitaron ajuste (Fase 0 de las tasks).

**Mapeo a params** (lo hace la PÁGINA, no el filtro — separación de
responsabilidades):

| Estado UI | Param a `useContactos` |
|-----------|------------------------|
| `rol='todos'` | (ninguno) |
| `rol='clientes'` | `esCliente: true` |
| `rol='proveedores'` | `esProveedor: true` |
| `incluirInactivos=false` | (ninguno → backend default = solo activos) |
| `incluirInactivos=true` | `activo: 'all'` — unión de activos + inactivos |
| `q` (debounced) no vacío | `q: <texto>` |

> **R2 actualizado**: "Incluir inactivos" manda `activo='all'` (NOT `activo=false`).
> El valor `activo=false` significa "solo inactivos" — semántica incorrecta para
> el toggle que debe mostrar la UNIÓN. El param `'all'` es el contrato correcto.
> `ListarContactosParams.activo` es ahora `boolean | 'all'` en el frontend para
> espejar el DTO del backend.

### D6: Form — más simple que `CuentaForm` (Adaptación 4)

`contacto-form.tsx` usa el mismo andamiaje que `CuentaForm` (los subcomponentes
`Field` / `CheckRow` se pueden replicar inline o copiar), pero:

- Campos: `razonSocial` (required), `nombreComercial`, `documento`, `email`,
  `telefono`, `direccion`, + dos checkboxes `esCliente` / `esProveedor`.
- **Sin** selects de clase/subclase/naturaleza, **sin** `CuentaParentPicker`,
  **sin** `useEffect` de auto-naturaleza ni reset de subclase.
- Modos `create` / `edit`. En `edit`, `razonSocial` y los demás campos se editan
  libremente (el backend no marca campos inmutables como en cuentas). `activo` no
  es un campo del form.
- Botón submit deshabilitado con `isSubmitting` (Anti-F-07).
- `documento` vacío se entrega como `''` al `onSubmit` (el data layer lo convierte
  a `null`); el form trabaja con strings (más simple para react-hook-form).

`mapContactoToFormValues(c: Contacto): ContactoFormValues` para precargar en
`edit` (espejo de `mapCuentaToFormValues`): convierte los `null` del response a
`''` para los inputs.

### D7: Drawer — estados activo / inactivo (Adaptación 3, UI NUEVA)

`contacto-detail-drawer.tsx` carga el detalle vía `useContactoDetail(contactoId)`
y monta acciones según `activo`:

```
                  ┌─────────────────────────────────────────┐
                  │   ContactoDetailDrawer (Sheet lateral)   │
                  │   useContactoDetail(contactoId)          │
                  └──────────────────┬──────────────────────┘
                                     │ data.activo ?
                 ┌───────────────────┴────────────────────┐
                 │                                         │
        activo === true                          activo === false
                 │                                         │
   ┌─────────────┴──────────────┐              ┌───────────┴───────────┐
   │ [Editar]   [Desactivar]    │              │     [Reactivar]       │
   │  ↓ abre        ↓ abre      │              │  ↓ invoca directo     │
   │ ContactoFormSheet  Desactivar│            │ useReactivarContacto  │
   │  (mode=edit)     -Dialog    │             │  (sin AlertDialog)    │
   └────────────────────────────┘              └───────────────────────┘
```

- **activo**: muestra **Editar** (abre `ContactoFormSheet` mode=edit) y
  **Desactivar** (abre `DesactivarContactoDialog`). NO muestra Reactivar.
- **inactivo**: muestra **Reactivar** (invoca `useReactivarContacto` directo, sin
  dialog — acción no destructiva e idempotente). NO muestra Editar ni Desactivar.
- El drawer maneja loading (skeleton) + error de carga, igual que
  `cuenta-detail-drawer`.
- **DELETE físico**: NO se renderiza botón en el slice 1 (Decisión Q1). El
  `eliminar-contacto.ts` existe en el data layer pero el drawer no lo expone.

Esta divergencia respecto de `plan-cuentas` (que solo desactiva) es el punto que
más cuidado requiere en tests (E-DRAW-01/02/03).

### D8: Sheet de form + Dialog de desactivación

- `contacto-form-sheet.tsx`: espejo de `cuenta-form-sheet`. Orquesta
  `useCreateContacto` / `useUpdateContacto` según `mode`, toasts de éxito/error
  con `backendErrorMessage`, cierra el Sheet en éxito.
- `desactivar-contacto-dialog.tsx`: espejo simplificado de
  `deactivate-cuenta-dialog` (sin la lógica especial de
  `CUENTA_CONFIGURADA_COMO_CONCEPTO`). AlertDialog + botón confirmar con
  `isPending`. En error, `backendErrorMessage`. La reactivación NO usa dialog.

### D9: Página — container, debounce, reset de página (Adaptación 1)

`contactos-page.tsx` es el contenedor (Anti-F-11). Estado local:

- `rol: RolFiltro` (segmentado), `incluirInactivos: boolean` (toggle),
  `search: string` → `debouncedSearch = useDebouncedValue(search, 150)`,
  `page: number`, `selectedId: string | null` (drawer), `createOpen: boolean`.
- **Adaptación 1**: SIN `<Tabs>` lista/árbol. Una sola vista de lista. No hay
  `ArbolTab` ni `useCuentaTree`.
- Mapea el estado de filtros a `ListarContactosParams` (tabla de D5) y se lo pasa
  a `useContactos`.
- Reset de `page` a 1 cuando cambia cualquier filtro (REQ-PAGE-03), igual que
  `plan-cuentas-page`.
- Paginación con botones prev/next (copiado de `ListaTab`).

### D10: Plumbing

- **`router.tsx`**: agregar `{ path: '/contactos', element: <ContactosPage /> }`
  dentro de los children del `DashboardShell` (junto a `/plan-cuentas`).
- **`nav-items.ts`**: agregar
  `{ to: '/contactos', label: 'Contactos', icon: <icono lucide> }` (ej.
  `Contact` o `Users2` de lucide-react). Posicionarlo después de "Plan de
  cuentas" (orden de dominio contable).
- **`error-messages.ts`**: el helper `backendErrorMessage` ya devuelve el
  `message` del backend (que viene en español). Para mensajes compuestos
  (`CONTACTO_DOCUMENTO_DUPLICADO` con `details.contactoExistenteId`,
  `CONTACTO_REFERENCIADO`), agregar un catálogo de labels o un helper específico
  análogo a `conceptosBloqueantes`. Mínimo viable: dejar que el `message` del
  backend pase; ideal: catálogo `CONTACTO_ERROR_LABELS`.

---

## 3. Data Flow

### Crear contacto

```
ContactosPage
  └─ [Nuevo contacto] → setCreateOpen(true)
       └─ ContactoFormSheet (mode=create)
            └─ ContactoForm (react-hook-form + zodResolver)
                 │ submit válido (esCliente||esProveedor garantizado por refine)
                 ↓
            useCreateContacto.mutate(values)
                 └─ createContacto(values)  [documento '' → null]
                      └─ POST /api/contactos
                 onSuccess → invalidate(['contactos']) + toast + cerrar Sheet
                 onError   → toast(backendErrorMessage)  [CONTACTO_DOCUMENTO_DUPLICADO…]
```

### Listar + filtrar + buscar

```
ContactosPage (rol, incluirInactivos, search→debounced, page)
  └─ mapea a ListarContactosParams
       └─ useContactos(params)  [queryKey ['contactos', params], keepPreviousData]
            └─ getContactos(params) → GET /api/contactos
       └─ render: ContactoListFilters (presentacional) + ContactoListTable + paginación
            └─ row click → setSelectedId(id) → ContactoDetailDrawer
```

### Detalle → reactivar (estado inactivo)

```
ContactoDetailDrawer(contactoId)
  └─ useContactoDetail(contactoId)  [enabled: contactoId !== null]
       └─ data.activo === false → botón [Reactivar]
            └─ useReactivarContacto.mutate(id)
                 └─ reactivarContacto(id) → POST /api/contactos/:id/reactivar
                 onSuccess → invalidate(['contactos']) + toast
```

---

## 4. File Changes

### Nuevos (16 archivos)

`features/contactos/api/{get-contactos,get-contacto-detail,create-contacto,update-contacto,desactivar-contacto,reactivar-contacto,eliminar-contacto}.ts`
`features/contactos/hooks/{use-contactos,use-contacto-detail,use-contacto-mutations}.ts`
`features/contactos/schemas/contacto-form-schema.ts`
`features/contactos/components/{contacto-list-table,contacto-list-filters,contacto-detail-drawer,contacto-form,contacto-form-sheet,desactivar-contacto-dialog}.tsx`
`features/contactos/pages/contactos-page.tsx`

### Nuevos tests (≥ 5 archivos)

`schemas/contacto-form-schema.test.ts`,
`components/contacto-list-filters.test.tsx`,
`components/contacto-form.test.tsx`,
`components/contacto-detail-drawer.test.tsx`,
`components/desactivar-contacto-dialog.test.tsx`.
(Opcional: `components/contacto-list-table.test.tsx`.)

### Modificados (4 archivos)

`types/api.ts`, `routes/router.tsx`, `components/nav-items.ts`,
`lib/error-messages.ts`.

---

## 5. Testing Strategy (vitest + Testing Library)

- **Setup existente**: `src/test/setup.ts` ya trae los polyfills de Radix
  (`ResizeObserver`, `hasPointerCapture`, `scrollIntoView`) necesarios para
  Sheet/Dialog/Select en JSDOM. Config en `vite.config.ts` bloque `test`
  (`environment: 'jsdom'`, `globals: true`).
- **Patrón de mock de API**: `vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))`
  + un `wrapper()` con `QueryClientProvider` (copiado de `cuenta-form.test.tsx`).
- **Prioridad**: queries por rol/label/texto visible (`getByRole`,
  `getByLabelText`), no `data-testid` (CLAUDE.md frontend §9).
- **Strict TDD**: el test se escribe ANTES de la implementación de cada
  subsistema (refleja en tasks.md el orden test→impl).
- **NO testear** hooks triviales de TanStack Query (`use-contactos`,
  `use-contacto-detail`).

---

## 6. Las 5 adaptaciones — justificación consolidada

| # | Adaptación | Qué se OMITE de plan-cuentas | Qué se AGREGA | Justificación |
|---|------------|------------------------------|---------------|---------------|
| 1 | Sin tabs lista/árbol | `Tabs`, `ArbolTab`, `get-cuenta-tree`, `cuenta-tree-view`, `cuenta-parent-picker`, `lib/sugerir-codigo-hijo` | nada | Contacto es plano, no jerárquico. |
| 2 | Filtros por rol + estado | chips por `ClaseCuenta` | segmentado Todos/Clientes/Proveedores + Switch "Incluir inactivos" | Contactos se filtran por rol y estado, no por clase. (Q2) |
| 3 | Reactivar en el drawer | — | botón **Reactivar** (estado inactivo) + `useReactivarContacto` + `reactivar-contacto.ts` | El backend expone reactivar; UI nueva sin precedente. |
| 4 | Form simple | selects clase/subclase/naturaleza, parent picker, useEffects de naturaleza | checkboxes `esCliente`/`esProveedor` | Contacto no tiene estructura jerárquica ni naturaleza contable. |
| 5 | Schema cross-field + null | refine subclase↔clase | refine `esCliente \|\| esProveedor` con `path`; `documento` ''→null en data layer | Regla de negocio del backend (flags, unique parcial). |

---

## 7. Scope in / out

**In**: la feature `contactos` completa (list/filtros/búsqueda/crear/editar/
desactivar/reactivar) + plumbing. `eliminar-contacto.ts` en data layer.

**Out**: botón DELETE físico en UI (slice 2, Q1); selector de contacto embebido
en otros forms; backend (mergeado); `openapi-typescript`; MSW.

---

## 8. Migration / Rollout

Sin migración. Feature aditiva de frontend, sin cambio de contrato HTTP.
Rollback = `git revert` del PR (ver proposal). Verificación pre-merge: checklist
de UI responsive/dark mode (frontend §7) en 375/768/1440px.

---

## 9. Open Questions

- **Ninguna.** La exploración (sdd-explore, Ready for Proposal = YES) cerró Q1 y
  Q2. El contrato de `activo` se confirmó en 2026-05-21 (ver D5): el param usa
  `'all'` para la unión, `false` para solo inactivos, `true`/sin-param para solo
  activos. El DTO fue extendido en Fase 0 (backend) antes del slice frontend.

---

**Fin del design.**
