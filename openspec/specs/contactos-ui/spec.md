# Spec: contactos-ui

> Fecha: 2026-05-21
> Fase: spec
> Proyecto: avicont
> Scope: FRONTEND. Testing = vitest + @testing-library/react.

---

## 1. Glosario

- **Contacto**: cliente y/o proveedor del tenant. Entidad plana (no jerárquica).
- **razonSocial**: nombre legal del contacto. Obligatorio (2–200 chars).
- **nombreComercial**: nombre de fantasía. Opcional (nullable).
- **documento**: NIT / CI / CEX / pasaporte, texto libre. Opcional (nullable).
  Unicidad parcial en backend `WHERE documento IS NOT NULL`.
- **esCliente / esProveedor**: flags de rol. Al menos uno DEBE ser `true`.
- **activo**: estado del contacto. Cambia por desactivar/reactivar, NUNCA por
  PATCH (update).
- **Drawer**: panel lateral (Sheet de shadcn) con el detalle + acciones.
- **Sheet de form**: panel lateral con el `ContactoForm` (crear/editar).
- **Segmentado**: control de filtro Todos | Clientes | Proveedores.

---

## 2. Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

### 2.1 Tipos compartidos (`types/api.ts`)

- **REQ-TIPO-01**: El sistema DEBE definir la interfaz `Contacto` con exactamente
  estos 13 campos, espejo de `ContactoResponseDto` del backend: `id` (string),
  `razonSocial` (string), `nombreComercial` (string | null), `documento`
  (string | null), `esCliente` (boolean), `esProveedor` (boolean), `email`
  (string | null), `telefono` (string | null), `direccion` (string | null),
  `activo` (boolean), `createdByUserId` (string), `createdAt` (string),
  `updatedAt` (string).

- **REQ-TIPO-02**: La interfaz `Contacto` NO DEBE incluir `organizationId`. El
  response del backend de contactos no lo trae (a diferencia de `Cuenta`).

- **REQ-TIPO-03**: El sistema DEBE definir `ContactoListResponse` con `items`
  (Contacto[]), `total` (number), `page` (number), `pageSize` (number).

- **REQ-TIPO-04**: El sistema DEBE definir `ListarContactosParams` con: `q?`
  (string), `documento?` (string), `esCliente?` (boolean), `esProveedor?`
  (boolean), `activo?: boolean | 'all'`, `page?` (number), `pageSize?` (number).
  El tipo 3-state de `activo` espeja el contrato del DTO del backend:
  `true`/sin-param → solo activos; `false` → solo inactivos; `'all'` → unión
  completa. Todos opcionales.

### 2.2 Data layer (`api/`)

- **REQ-API-01**: Cada endpoint del backend DEBE tener exactamente una función
  pura en `api/`, que use el cliente único `@/lib/api`. NO se permite `fetch`
  directo ni `axios` por fuera de `@/lib/api` (Anti-F-03).

- **REQ-API-02**: `getContactos(params)` DEBE pegarle a `GET /api/contactos` y
  devolver `ContactoListResponse`.

- **REQ-API-03**: `getContactoDetail(id)` DEBE pegarle a
  `GET /api/contactos/:id` y devolver `Contacto`.

- **REQ-API-04**: `createContacto(values)` DEBE pegarle a `POST /api/contactos`.
  Cuando `documento` está vacío, el body DEBE enviar `null` (no `""`), por la
  unicidad parcial del backend.

- **REQ-API-05**: `updateContacto(id, values)` DEBE pegarle a
  `PATCH /api/contactos/:id`. NO DEBE enviar `activo` (el estado se cambia por
  desactivar/reactivar, no por update). `documento` vacío DEBE enviarse `null`.

- **REQ-API-06**: `desactivarContacto(id)` DEBE pegarle a
  `POST /api/contactos/:id/desactivar`.

- **REQ-API-07**: `reactivarContacto(id)` DEBE pegarle a
  `POST /api/contactos/:id/reactivar`.

- **REQ-API-08**: `eliminarContacto(id)` DEBE pegarle a
  `DELETE /api/contactos/:id`. La función DEBE existir en el data layer, pero
  NO DEBE haber un botón que la invoque en la UI del slice 1 (Decisión Q1).

### 2.3 Hooks (`hooks/`)

- **REQ-HOOK-01**: `useContactos(params)` DEBE usar `useQuery` con queryKey
  `['contactos', params]` y `placeholderData: keepPreviousData` (lista no
  parpadea al cambiar filtros/página).

- **REQ-HOOK-02**: `useContactoDetail(id: string | null)` DEBE usar `useQuery`
  con queryKey `['contactos', 'detalle', id]` y `enabled: id !== null` (no
  dispara request con el drawer cerrado).

- **REQ-HOOK-03**: Las mutaciones (`useCreateContacto`, `useUpdateContacto`,
  `useDesactivarContacto`, `useReactivarContacto`) DEBEN invalidar todo el cache
  de la feature con `invalidateQueries({ queryKey: ['contactos'] })` en
  `onSuccess`, para que lista y detalle queden stale → re-fetch.

- **REQ-HOOK-04**: Los componentes DEBEN importar SOLO de los hooks, NUNCA de
  `api/*.ts` (Anti-F-12). El único lugar que importa `api/` son los hooks.

### 2.4 Schema zod (`schemas/contacto-form-schema.ts`)

- **REQ-FORM-01**: El schema DEBE requerir `razonSocial` con mínimo 2 y máximo
  200 caracteres, con mensaje en español.

- **REQ-FORM-02**: El schema DEBE aceptar `nombreComercial`, `documento`,
  `email`, `telefono`, `direccion` como opcionales (string o vacío).

- **REQ-FORM-03**: El schema DEBE validar `email` con formato de email cuando se
  provee un valor no vacío. Vacío DEBE ser válido (opcional).

- **REQ-FORM-04**: El schema DEBE incluir `esCliente` (boolean) y `esProveedor`
  (boolean).

- **REQ-FORM-05**: El schema DEBE incluir un `.refine()` cross-field que rechace
  el caso `esCliente === false && esProveedor === false`, con `path` apuntando a
  un campo de los flags y mensaje en español (espejo de
  `CONTACTO_FLAGS_INVALIDOS`).

- **REQ-FORM-06**: El tipo `ContactoFormValues` DEBE derivarse con
  `z.infer<typeof contactoFormSchema>` (single source of truth).

### 2.5 Backend: contrato `activo` 3-state (prerequisito de Fase 0)

- **REQ-BE-01**: El backend DEBE exponer el param `activo` con tres valores
  válidos: `true` (solo activos, default), `false` (solo inactivos) y `'all'`
  (activos + inactivos). El DTO HTTP (`ListarContactosQueryDto.activo`) DEBE
  aceptar los tres valores sin devolver 400.

- **REQ-BE-02**: Con `activo=all`, el sistema DEBE devolver la unión de
  contactos activos e inactivos del tenant. `total` DEBE ser la suma de activos
  + inactivos.

- **REQ-BE-03**: El toggle "Incluir inactivos" del frontend DEBE, cuando
  encendido, producir `activo='all'` en el request HTTP al backend. Con el
  toggle apagado, NO DEBE enviarse el param `activo`.

### 2.6 Filtros (`contacto-list-filters.tsx`)

- **REQ-FILT-01**: El componente DEBE renderizar un control segmentado con tres
  opciones: **Todos**, **Clientes**, **Proveedores**.

- **REQ-FILT-02**: Seleccionar **Clientes** DEBE producir un filtro
  `esCliente=true`; **Proveedores** DEBE producir `esProveedor=true`; **Todos**
  NO DEBE enviar ninguno de los dos flags.

- **REQ-FILT-03**: El componente DEBE renderizar un toggle **"Incluir
  inactivos"**. Encendido DEBE producir `activo='all'` (unión de activos e
  inactivos — semántica de inclusión, no de filtro exclusivo); apagado NO DEBE
  enviar `activo` (default backend = solo activos).

- **REQ-FILT-04**: El componente DEBE renderizar un buscador de texto que emita
  el valor de `q`. La página DEBE aplicar debounce antes de mandarlo al hook.

- **REQ-FILT-05**: El componente DEBE ser presentacional: recibe el estado por
  props y emite cambios por callbacks. No DEBE consultar hooks de datos.

### 2.7 Lista (`contacto-list-table.tsx`)

- **REQ-LIST-01**: La tabla DEBE mostrar, por contacto: razón social, nombre
  comercial, documento, indicadores de rol (cliente/proveedor) y estado activo.

- **REQ-LIST-02**: La tabla DEBE usar `key={contacto.id}` por fila (Anti-F-06,
  nunca el index).

- **REQ-LIST-03**: La tabla DEBE manejar el estado de carga (skeleton) y el
  estado vacío (mensaje "No se encontraron contactos…").

- **REQ-LIST-04**: Click en una fila DEBE emitir `onSelect(contacto)` (abre el
  drawer de detalle).

- **REQ-LIST-05**: La tabla DEBE ser usable en mobile (scroll horizontal o card
  stack), siguiendo `frontend/CLAUDE.md §7`.

### 2.8 Form (`contacto-form.tsx`)

- **REQ-FORMUI-01**: El form DEBE usar `react-hook-form` + `zodResolver` con
  `contactoFormSchema`. Ningún campo DEBE manejarse con `useState` suelto.

- **REQ-FORMUI-02**: El form DEBE tener modos `create` y `edit`. En `edit` DEBE
  precargar los valores del contacto.

- **REQ-FORMUI-03**: Cada input DEBE tener su `<label>` asociado, `aria-invalid`
  cuando hay error y el mensaje de error visible (accesibilidad, §10).

- **REQ-FORMUI-04**: El botón de submit DEBE estar deshabilitado mientras la
  mutación está en curso (`isSubmitting` / `isPending`) — Anti-F-07.

- **REQ-FORMUI-05**: El form NO DEBE contener selects de clase/subclase/
  naturaleza ni picker de cuenta padre. Los flags `esCliente`/`esProveedor`
  DEBEN ser checkboxes.

- **REQ-FORMUI-06**: Cuando `documento` queda vacío, el valor enviado a la
  mutación DEBE ser `null` (no `""`).

### 2.9 Sheet de form (`contacto-form-sheet.tsx`)

- **REQ-SHEET-01**: El Sheet DEBE orquestar la mutación correcta según el `mode`
  (`useCreateContacto` en create, `useUpdateContacto` en edit).

- **REQ-SHEET-02**: En éxito DEBE mostrar un toast de éxito (sonner) y cerrar el
  Sheet. En error DEBE mostrar un toast con el mensaje del backend
  (`backendErrorMessage`).

### 2.10 Drawer de detalle (`contacto-detail-drawer.tsx`)

- **REQ-DRAW-01**: El drawer DEBE cargar el detalle vía `useContactoDetail`,
  habilitado solo cuando hay un `contactoId` seleccionado.

- **REQ-DRAW-02**: Cuando el contacto está **activo**, el drawer DEBE ofrecer
  **Editar** y **Desactivar**.

- **REQ-DRAW-03**: Cuando el contacto está **inactivo** (`activo === false`), el
  drawer DEBE ofrecer **Reactivar** y NO DEBE ofrecer Desactivar ni Editar.

- **REQ-DRAW-04**: **Reactivar** DEBE invocar `useReactivarContacto` sin
  AlertDialog (acción no destructiva, idempotente). En éxito DEBE mostrar toast.

- **REQ-DRAW-05**: El drawer DEBE manejar loading (skeleton) y error de carga.

### 2.11 Dialog de desactivación (`desactivar-contacto-dialog.tsx`)

- **REQ-DIAL-01**: La desactivación DEBE confirmarse con un AlertDialog.

- **REQ-DIAL-02**: El botón de confirmar DEBE deshabilitarse mientras la mutación
  está en curso (Anti-F-07).

- **REQ-DIAL-03**: En éxito DEBE mostrar toast y cerrar el dialog. En error DEBE
  mostrar el mensaje del backend.

### 2.12 Página (`contactos-page.tsx`)

- **REQ-PAGE-01**: La página DEBE orquestar hooks + componentes (patrón
  container/presentational, Anti-F-11). NO DEBE renderizar tabs lista/árbol
  (contactos es plano — Adaptación 1).

- **REQ-PAGE-02**: La página DEBE debouncar el buscador `q` con
  `useDebouncedValue` antes de pasarlo a `useContactos`.

- **REQ-PAGE-03**: La página DEBE resetear la página a 1 cuando cambia un filtro
  (segmentado, toggle inactivos o búsqueda).

- **REQ-PAGE-04**: La página DEBE mapear el estado del segmentado a los params:
  Todos → ninguno; Clientes → `esCliente: true`; Proveedores →
  `esProveedor: true`. Y el toggle "Incluir inactivos" → `activo: 'all'`
  (solo cuando está encendido; apagado = omitir param).

### 2.13 Plumbing (routing, nav, errores)

- **REQ-PLUMB-01**: `router.tsx` DEBE registrar la ruta `/contactos` →
  `ContactosPage` dentro del `DashboardShell` protegido.

- **REQ-PLUMB-02**: `nav-items.ts` DEBE incluir un item "Contactos" con `to:
  '/contactos'` y un icono de lucide.

- **REQ-PLUMB-03**: `error-messages.ts` DEBE poder traducir/mostrar mensajes en
  español para los codes `CONTACTO_NO_ENCONTRADO`,
  `CONTACTO_DOCUMENTO_DUPLICADO`, `CONTACTO_REFERENCIADO`,
  `CONTACTO_RAZON_SOCIAL_REQUERIDA`, `CONTACTO_FLAGS_INVALIDOS`. Para
  `CONTACTO_DOCUMENTO_DUPLICADO` PUEDE usar `details.contactoExistenteId` para
  un mensaje más útil.

### 2.14 Tipado y calidad

- **REQ-CAL-01**: Cero `any` en código de producción (Anti-F-01); usar `unknown`
  con narrowing donde aplique.

- **REQ-CAL-02**: Cero colores literales de Tailwind; variables semánticas del
  tema (Anti-F-10), dark mode funcional.

- **REQ-CAL-03**: El build (`tsc -b && vite build`) y `npx vitest run` DEBEN
  pasar en verde.

---

## 3. Escenarios (Given/When/Then)

### 3.1 Backend — filtro `activo` 3-state (E-BE)

> Escenarios de e2e en `backend/test/contactos.e2e-spec.ts` (NestJS + Supertest).
> Cubren la Fase 0 del plan de tasks.

**E-BE-01** (activo=all devuelve unión):
- **Given** un tenant con 2 contactos activos y 1 inactivo.
- **When** se hace `GET /api/contactos?activo=all`.
- **Then** `status=200`, `total=3`, todos los ids presentes en `items`.

**E-BE-02** (sin param = solo activos):
- **Given** el mismo tenant.
- **When** se hace `GET /api/contactos` (sin param `activo`).
- **Then** `total=2` (solo los activos).

**E-BE-03** (activo=true = solo activos):
- **Given** el mismo tenant.
- **When** se hace `GET /api/contactos?activo=true`.
- **Then** `total=2`.

**E-BE-04** (activo=false = solo inactivos):
- **Given** el mismo tenant.
- **When** se hace `GET /api/contactos?activo=false`.
- **Then** `total=1` (solo el inactivo).

**E-BE-05** (activo=all rechazado hasta Fase 0 — RED inicial):
- **Given** el DTO sin el cambio de la Fase 0.
- **When** se hace `GET /api/contactos?activo=all`.
- **Then** `status=400` (el `@IsBoolean()` rechaza el string 'all'). Este
  escenario ROJO justifica la task 0.1.

### 3.2 Schema zod — flags cross-field (E-FORM)

**E-FORM-01** (válido con un flag):
- **Given** un payload con `razonSocial` válida y `esCliente=true`,
  `esProveedor=false`.
- **When** se valida con `contactoFormSchema.safeParse`.
- **Then** `success === true`.

**E-FORM-02** (rechaza ambos flags false):
- **Given** un payload válido salvo `esCliente=false` y `esProveedor=false`.
- **When** se valida con `safeParse`.
- **Then** `success === false` y hay un error en el path de los flags.

**E-FORM-03** (razón social muy corta):
- **Given** un payload con `razonSocial` de 1 carácter.
- **When** se valida.
- **Then** `success === false`.

**E-FORM-04** (email inválido):
- **Given** un payload válido salvo `email='no-es-email'`.
- **When** se valida.
- **Then** `success === false`.

**E-FORM-05** (campos opcionales vacíos válidos):
- **Given** un payload válido con `nombreComercial`, `documento`, `email`,
  `telefono`, `direccion` todos en `''`.
- **When** se valida.
- **Then** `success === true`.

### 3.2 Filtros (E-FILT)

**E-FILT-01** (segmentado Clientes):
- **Given** el segmentado en "Todos".
- **When** el usuario hace click en "Clientes".
- **Then** se emite el cambio de filtro a "Clientes" (que la página mapea a
  `esCliente: true`).

**E-FILT-02** (segmentado Proveedores):
- **Given** el segmentado en "Todos".
- **When** el usuario hace click en "Proveedores".
- **Then** se emite el cambio a "Proveedores" (`esProveedor: true`).

**E-FILT-03** (toggle inactivos):
- **Given** el toggle "Incluir inactivos" apagado.
- **When** el usuario lo enciende.
- **Then** se emite `incluirInactivos=true` (la página manda `activo: 'all'`).

**E-FILT-04** (buscador):
- **Given** el buscador vacío.
- **When** el usuario escribe "ferre".
- **Then** se emite `onSearchChange('ferre')`.

### 3.3 Lista (E-LIST)

**E-LIST-01** (render de filas):
- **Given** una lista con 2 contactos.
- **When** se renderiza la tabla.
- **Then** se ven las 2 razones sociales.

**E-LIST-02** (vacío):
- **Given** una lista vacía y no loading.
- **When** se renderiza.
- **Then** se ve el mensaje de "No se encontraron contactos…".

**E-LIST-03** (select):
- **Given** una tabla con un contacto.
- **When** el usuario hace click en la fila.
- **Then** se emite `onSelect(contacto)`.

### 3.4 Form (E-FORMUI)

**E-FORMUI-01** (create habilitado):
- **Given** el form en `mode='create'`.
- **When** se renderiza.
- **Then** el input de razón social está habilitado y el botón dice "Crear
  contacto".

**E-FORMUI-02** (edit precargado):
- **Given** el form en `mode='edit'` con `initialData`.
- **When** se renderiza.
- **Then** los campos muestran los valores del contacto y el botón dice
  "Guardar cambios".

**E-FORMUI-03** (submit deshabilitado en pending):
- **Given** el form con `isSubmitting=true`.
- **When** se renderiza.
- **Then** el botón de submit está deshabilitado.

**E-FORMUI-04** (documento vacío → null):
- **Given** el form completado con `documento` vacío y un flag activo.
- **When** el usuario envía.
- **Then** el `onSubmit` recibe `documento: null` (no `''`).

### 3.5 Drawer — estados activo / inactivo (E-DRAW)

**E-DRAW-01** (contacto activo):
- **Given** un drawer abierto sobre un contacto con `activo=true`.
- **When** se renderiza.
- **Then** se ven los botones **Editar** y **Desactivar**, y NO se ve
  **Reactivar**.

**E-DRAW-02** (contacto inactivo):
- **Given** un drawer abierto sobre un contacto con `activo=false`.
- **When** se renderiza.
- **Then** se ve el botón **Reactivar**, y NO se ven **Editar** ni
  **Desactivar**.

**E-DRAW-03** (reactivar sin dialog):
- **Given** un drawer sobre un contacto inactivo.
- **When** el usuario hace click en **Reactivar**.
- **Then** se invoca la mutación de reactivar directamente (sin AlertDialog
  intermedio).

### 3.6 Desactivación (E-DIAL)

**E-DIAL-01** (confirmación):
- **Given** un contacto activo y el dialog de desactivación abierto.
- **When** el usuario confirma.
- **Then** se invoca `desactivarContacto(id)` y, en éxito, se cierra el dialog
  con un toast.

**E-DIAL-02** (cancelar):
- **Given** el dialog abierto.
- **When** el usuario cancela.
- **Then** NO se invoca la mutación y el dialog se cierra.

### 3.7 Errores del backend (E-ERR)

**E-ERR-01** (documento duplicado):
- **Given** una creación que el backend rechaza con
  `CONTACTO_DOCUMENTO_DUPLICADO` (409).
- **When** la mutación falla.
- **Then** se muestra un toast en español indicando documento duplicado.

**E-ERR-02** (flags inválidos del backend):
- **Given** una creación que el backend rechaza con `CONTACTO_FLAGS_INVALIDOS`
  (400) — caso defensivo, el form ya lo previene.
- **When** la mutación falla.
- **Then** se muestra un mensaje en español sobre el rol obligatorio.

### 3.8 Página — integración de filtros (E-PAGE)

**E-PAGE-01** (reset de página al filtrar):
- **Given** la página en `page=3`.
- **When** el usuario cambia un filtro (segmentado, toggle o búsqueda).
- **Then** la página vuelve a `page=1`.

**E-PAGE-02** (mapeo de params):
- **Given** el segmentado en "Clientes" y "Incluir inactivos" encendido.
- **When** la página construye los params de `useContactos`.
- **Then** los params incluyen `esCliente: true` y `activo: 'all'`, y NO
  incluyen `esProveedor`.

---

## 4. Códigos de error (reusan los del backend)

| Code | HTTP | UI |
|------|------|-----|
| `CONTACTO_NO_ENCONTRADO` | 404 | "Contacto no encontrado." |
| `CONTACTO_DOCUMENTO_DUPLICADO` | 409 | "Ya existe un contacto con ese documento." (PUEDE referenciar `details.contactoExistenteId`) |
| `CONTACTO_REFERENCIADO` | 409 | "No se puede eliminar: el contacto tiene movimientos. Desactivalo en su lugar." (relevante en slice 2) |
| `CONTACTO_RAZON_SOCIAL_REQUERIDA` | 400 | "La razón social es obligatoria." |
| `CONTACTO_FLAGS_INVALIDOS` | 400 | "El contacto debe ser cliente, proveedor o ambos." |

> Los mensajes del backend ya vienen en español; mostrar `message` directo es
> válido. Para `CONTACTO_DOCUMENTO_DUPLICADO` y `CONTACTO_REFERENCIADO` se PUEDE
> componer un mensaje más útil con `details` (CLAUDE.md frontend §8).

---

## 5. Endpoints consumidos

> El endpoint de listado recibe un cambio menor de contrato en Fase 0 (backend).
> El resto de endpoints no cambia.

| Método | Ruta | Status | Uso frontend |
|--------|------|--------|--------------|
| `POST` | `/api/contactos` | 201 | crear |
| `GET` | `/api/contactos` | 200 | lista paginada `{items,total,page,pageSize}` |
| `GET` | `/api/contactos/:id` | 200 | detalle |
| `PATCH` | `/api/contactos/:id` | 200 | editar |
| `POST` | `/api/contactos/:id/desactivar` | 200 | desactivar |
| `POST` | `/api/contactos/:id/reactivar` | 200 | reactivar |
| `DELETE` | `/api/contactos/:id` | 204 | eliminar (data layer, sin botón slice 1) |

Búsqueda: query `q` → GIN trigram sobre `razonSocial` + `nombreComercial`.
`activo`: `true`/sin-param → solo activos; `false` → solo inactivos;
`'all'` (NUEVO, Fase 0) → activos + inactivos. Default sin param = solo activos.

---

## 6. Coverage objetivo

| Capa | Qué se testea | Herramienta |
|------|---------------|-------------|
| **Backend e2e** | **Filtro `activo=all`: unión activos+inactivos, `activo=false` solo inactivos, sin param solo activos** | **Jest + Supertest (backend)** |
| Schema | `contacto-form-schema` (válido, flags cross-field, razón social, email, opcionales) | vitest unit |
| Filtros | segmentado, toggle inactivos, buscador (interacciones) | vitest + Testing Library |
| Form | create/edit, submit disabled en pending, documento vacío→null | vitest + Testing Library |
| Drawer | estados activo/inactivo → botones correctos, reactivar sin dialog | vitest + Testing Library |
| Dialog | confirmar/cancelar desactivación | vitest + Testing Library |

> Hooks triviales de TanStack Query (`use-contactos`, `use-contacto-detail`) NO
> se testean (CLAUDE.md frontend §9.4). `use-contacto-mutations` PUEDE tener un
> test ligero de invalidación si aporta valor.

---

## 7. Forma esperada de los DTOs (frontend)

```ts
// types/api.ts
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
  createdByUserId: string;   // NOTA: no hay organizationId
  createdAt: string;
  updatedAt: string;
}

export interface ContactoListResponse {
  items: Contacto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListarContactosParams {
  q?: string;
  documento?: string;
  esCliente?: boolean;
  esProveedor?: boolean;
  activo?: boolean | 'all';  // 'all' → activos + inactivos (toggle "Incluir inactivos")
  page?: number;
  pageSize?: number;
}
```

---

**Fin del spec.**
