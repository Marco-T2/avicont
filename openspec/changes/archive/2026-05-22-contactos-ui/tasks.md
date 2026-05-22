# Tasks: contactos-ui

> Breakdown en commits atómicos. Cada checkbox = un commit. **Verde entre cada
> commit** (`tsc -b` / build del subsistema + `npx vitest run` de los tests
> tocados). **Strict TDD**: el test se escribe ANTES de la implementación — el
> orden de las tasks lo refleja (test primero, impl después).
>
> Branch: `feat/contactos-ui` — squash merge contra `main`.

## Reglas globales

- Idioma de código: dominio español (`Contacto`, `razonSocial`, `esCliente`) +
  framework inglés (`useContactos`, `getContactos`, `ContactoForm`).
- Comandos desde `frontend/`:
  - typecheck/build: `npm run build` (`tsc -b && vite build`) — o `npx tsc -b`
    para typecheck rápido.
  - tests: `npx vitest run` (o `npx vitest run <path>` para el subsistema).
  - lint: `npm run lint`. **Correr `npm run lint` ANTES de pushear** (el CI
    `frontend` falla por prettier sin formatear).
- Imports: alias `@/` para `src/` (espejá cómo lo hace `plan-cuentas`).
- Componentes importan SOLO del hook, nunca de `api/*.ts` (Anti-F-12).
- Server state SOLO en TanStack Query, nunca en Zustand (§4).
- Forms: react-hook-form + zodResolver; submit `disabled={isPending}` (Anti-F-07).
- Estilos: variables semánticas del tema, dark mode (Anti-F-10).
- Cero `any` (Anti-F-01).
- Commits: conventional inglés con scope `contactos-ui`
  (`feat(contactos-ui): ...`). Squash only. NUNCA `Co-Authored-By`. NUNCA
  `--no-verify`. Commits atómicos chicos.

---

## Orden de dependencias entre fases

```
Fase 0 (backend: exponer activo='all')  ← prerequisito contractual para el frontend
       ↓
Fase 1 (tipos + plumbing)        ← base de todo el data layer
       ↓
Fase 2 (api layer)               ← depende de los tipos
       ↓
Fase 3 (hooks)                   ← envuelven el api layer
       ↓
Fase 4 (schema zod, TDD)         ← independiente de hooks; puede ir en paralelo a 2-3
       ↓
Fase 5 (filtros, TDD)
       ↓
Fase 6 (tabla)
       ↓
Fase 7 (form, TDD)
       ↓
Fase 8 (form-sheet)
       ↓
Fase 9 (dialog desactivar, TDD)
       ↓
Fase 10 (drawer detalle, TDD — estados activo/inactivo→reactivar)
       ↓
Fase 11 (página + routing + nav)
       ↓
Fase 12 (error-messages)
       ↓
Fase 13 (verde final + checklist UI)
```

> Fase 4 (schema) no depende de las fases 2-3; se puede adelantar. Se ubica acá
> por legibilidad. Las fases 5-10 dependen de hooks (3) y schema (4).

---

## Fase 0 — Backend: exponer `activo='all'`

> El service (`contactos.service.ts`) y el repo (`prisma-contactos.repository.ts`)
> ya soportan `activo: 'all'` internamente. Solo el DTO HTTP y el controller
> necesitan cambio. Scope de commit: `contactos` (NO `contactos-ui`).
>
> Comandos backend (desde `backend/`):
> - typecheck: `npx tsc --noEmit -p tsconfig.json`
> - e2e: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/saas JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh npx jest test/ --runInBand --forceExit` (requiere Postgres up)

### 0.1 - [ ] `test(contactos): add e2e for GET /api/contactos?activo=all (RED)`

**Entrega**: nuevos casos en `backend/test/contactos.e2e-spec.ts` que cubren el
filtro 3-state. Se EXTIENDE el archivo existente (no se crea uno nuevo).

**Casos a agregar** (dentro del `describe('Contactos (e2e)')`):

```
it('GET /api/contactos?activo=all devuelve activos + inactivos', ...)
  1) seed() → token
  2) crear 2 contactos activos + 1 inactivo (desactivar con POST /:id/desactivar)
  3) GET /api/contactos?activo=all  → total=3, todos los ids presentes
  4) GET /api/contactos             → total=2 (solo activos, default)
  5) GET /api/contactos?activo=true → total=2
  6) GET /api/contactos?activo=false→ total=1 (solo inactivos)
```

**Por qué ROJO**: el DTO rechaza `activo=all` con 400 (`@IsBoolean()`). El test
espera 200 con todos los contactos; recibirá 400.

**Verificación**: `... npx jest test/contactos.e2e-spec.ts --runInBand --forceExit` — ROJO.

**Cubre**: R2 (contrato activo 3-state), parte del escenario E-FILT-03 actualizado.

### 0.2 - [ ] `feat(contactos): expose activo='all' filter in listar DTO (GREEN)`

**Entrega**: el DTO y el controller que hacen pasar el test de 0.1.

**Archivos a modificar** (scope `contactos`, NO `contactos-ui`):

- `backend/src/contactos/dto/listar-contactos.dto.ts`:
  - Eliminar el `@Transform(toBool)` + `@IsBoolean()` del campo `activo`.
  - Reemplazar por un `@Transform` que devuelva `boolean | 'all' | undefined`:
    - `'true'`/`'1'`/`true` → `true`
    - `'false'`/`'0'`/`false` → `false`
    - `'all'` → `'all'`
    - cualquier otra cosa (o ausente) → `undefined`
  - Agregar `@IsIn([true, false, 'all'])` (o un `@IsBoolean() | @Equals('all')` con
    custom validator) para la validación.
  - Cambiar tipo del campo a `activo?: boolean | 'all'`.
  - Actualizar `@ApiPropertyOptional({ description: ... })` a:
    `'true (default) → solo activos; false → solo inactivos; all → activos + inactivos.'`

- `backend/src/contactos/contactos.controller.ts` (línea ~89):
  - La línea `if (query.activo !== undefined) serviceInput.activo = query.activo;`
    ya propaga correctamente cualquier valor; verificar que el tipo del assignment
    lo acepte (ahora `activo?: boolean | 'all'` en el DTO, igual que en el service).
    Si hay error de tipos, ajustar.

**El service y el repo NO se tocan** — ya soportan `'all'` (cicatrices documentadas
en `contactos.service.ts:52` y `prisma-contactos.repository.ts:113-121`).

**Verificación**:
1. `npx tsc --noEmit -p tsconfig.json` — verde.
2. `DATABASE_URL=... JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh npx jest test/contactos.e2e-spec.ts --runInBand --forceExit` — verde (test de 0.1 pasa).
3. Suite contactos completa verde (no regresiones en tests existentes).

**Cubre**: R2 (contrato activo 3-state), E-FILT-03 actualizado.

---

## Fase 1 — Tipos compartidos + plumbing base

### 1.1 - [ ] `feat(contactos-ui): add Contacto types to api types`

**Entrega**: tipos del modelo en `types/api.ts`, espejo EXACTO de
`ContactoResponseDto` (NO copiar `Cuenta`).

**Archivos** (modificado):
- `frontend/src/types/api.ts` — agregar sección "Contactos":
  - `interface Contacto` (13 campos: `id`, `razonSocial`, `nombreComercial|null`,
    `documento|null`, `esCliente`, `esProveedor`, `email|null`, `telefono|null`,
    `direccion|null`, `activo`, `createdByUserId`, `createdAt`, `updatedAt`).
    **SIN `organizationId`**. Comentario apuntando al DTO del backend.
  - `interface ContactoListResponse` (`items`, `total`, `page`, `pageSize`).
  - `interface ListarContactosParams` (`q?`, `documento?`, `esCliente?`,
    `esProveedor?`, `activo?: boolean | 'all'`, `page?`, `pageSize?`).
    El tipo 3-state refleja el contrato del backend post-Fase-0.

**Tests**: ninguno (solo tipos).

**Verificación**: `npx tsc -b` verde.

**Cubre**: REQ-TIPO-01..04, Riesgo R1.

---

## Fase 2 — Data layer (`api/`)

### 2.1 - [ ] `feat(contactos-ui): add contactos api layer`

**Entrega**: 7 funciones puras, una por endpoint, vía `@/lib/api`.

**Archivos** (nuevos):
- `api/get-contactos.ts` — `getContactos(params: ListarContactosParams = {})`
  → `GET /api/contactos` → `ContactoListResponse`.
- `api/get-contacto-detail.ts` — `getContactoDetail(id)` → `GET /api/contactos/:id`.
- `api/create-contacto.ts` — `createContacto(values: ContactoFormValues)` →
  `POST /api/contactos`. **`documento`/`nombreComercial`/`email`/`telefono`/
  `direccion` vacíos → `null`** en el body (Riesgo R3).
- `api/update-contacto.ts` — `updateContacto(id, values)` → `PATCH`. Mismo trato
  de vacíos→null. **NO envía `activo`**.
- `api/desactivar-contacto.ts` — `desactivarContacto(id)` →
  `POST /api/contactos/:id/desactivar`.
- `api/reactivar-contacto.ts` — `reactivarContacto(id)` →
  `POST /api/contactos/:id/reactivar`.
- `api/eliminar-contacto.ts` — `eliminarContacto(id)` → `DELETE /api/contactos/:id`
  (data layer; sin botón en UI — Decisión Q1, dejar comentario que lo aclare).

**Tests**: ninguno obligatorio (funciones puras triviales). Si la conversión
`''→null` de create/update se vuelve compleja, extraerla a un helper y testearla.

**Verificación**: `npx tsc -b` verde.

**Cubre**: REQ-API-01..08, Riesgo R3.

---

## Fase 3 — Hooks (`hooks/`)

### 3.1 - [ ] `feat(contactos-ui): add contactos query and mutation hooks`

**Entrega**: hooks de query + mutaciones con invalidación.

**Archivos** (nuevos):
- `hooks/use-contactos.ts` — `useQuery` queryKey `['contactos', params]`,
  `placeholderData: keepPreviousData`.
- `hooks/use-contacto-detail.ts` — `useQuery` queryKey
  `['contactos','detalle', id]`, `enabled: id !== null`.
- `hooks/use-contacto-mutations.ts` — helper `useInvalidateContactos()` +
  `useCreateContacto`, `useUpdateContacto(id)`, `useDesactivarContacto`,
  `useReactivarContacto` (la novedad). Cada una invalida `['contactos']` en
  `onSuccess`.

**Tests**: ninguno (wrappers triviales de TanStack Query — CLAUDE.md §9.4).

**Verificación**: `npx tsc -b` verde.

**Cubre**: REQ-HOOK-01..04.

---

## Fase 4 — Schema zod (TDD)

### 4.1 - [ ] `test(contactos-ui): add contacto form schema spec (RED)`

**Entrega**: spec del schema en ROJO (antes de la implementación).

**Archivos** (nuevo):
- `schemas/contacto-form-schema.test.ts` — casos:
  - válido con `esCliente=true`, resto mínimo (E-FORM-01).
  - rechaza `esCliente=false && esProveedor=false` con error en path de flags
    (E-FORM-02).
  - rechaza `razonSocial` de 1 char (E-FORM-03).
  - rechaza `email='no-es-email'` (E-FORM-04).
  - acepta opcionales vacíos (`nombreComercial/documento/email/telefono/
    direccion` = `''`) (E-FORM-05).

**Verificación**: `npx vitest run schemas/contacto-form-schema.test.ts` — ROJO
(el schema no existe aún).

**Cubre**: REQ-FORM-01..06 (tests), E-FORM-01..05.

### 4.2 - [ ] `feat(contactos-ui): implement contacto form schema (GREEN)`

**Entrega**: el schema que pasa la spec de 4.1.

**Archivos** (nuevo):
- `schemas/contacto-form-schema.ts` — `contactoFormSchema` (ver design D4) +
  `.refine(esCliente||esProveedor, { path: ['esCliente'] })` +
  `export type ContactoFormValues = z.infer<...>`. Mensajes en español.

**Verificación**: `npx vitest run schemas/` VERDE + `npx tsc -b`.

**Cubre**: REQ-FORM-01..06, E-FORM-01..05.

---

## Fase 5 — Filtros (TDD)

### 5.1 - [ ] `test(contactos-ui): add contacto list filters spec (RED)`

**Entrega**: spec del componente de filtros en ROJO.

**Archivos** (nuevo):
- `components/contacto-list-filters.test.tsx` — casos (Testing Library +
  user-event):
  - click en "Clientes" emite el cambio de rol (E-FILT-01).
  - click en "Proveedores" emite el cambio de rol (E-FILT-02).
  - encender "Incluir inactivos" emite `incluirInactivos=true` (E-FILT-03).
  - escribir en el buscador emite `onSearchChange` (E-FILT-04).

**Verificación**: ROJO (componente no existe).

### 5.2 - [ ] `feat(contactos-ui): implement contacto list filters (GREEN)`

**Entrega**: componente presentacional. Props: `rol`, `onRolChange`,
`incluirInactivos`, `onIncluirInactivosChange`, `search`, `onSearchChange`.

**Archivos** (nuevo):
- `components/contacto-list-filters.tsx` — segmentado Todos|Clientes|Proveedores
  (`aria-pressed`), `Switch` **"Incluir inactivos"** con `<label>`, buscador con
  icono + botón limpiar (espejo de `cuenta-list-filters`). Variables del tema,
  tap targets ≥44px en mobile.
  - El toggle se llama **"Incluir inactivos"** (semántica unión, NO "Solo
    inactivos"). Encendido → la página mandará `activo: 'all'` al hook.

**Verificación**: `npx vitest run components/contacto-list-filters.test.tsx`
VERDE + `npx tsc -b`.

**Cubre**: REQ-FILT-01..05, E-FILT-01..04, Adaptación 2.

---

## Fase 6 — Tabla de lista

### 6.1 - [ ] `feat(contactos-ui): implement contacto list table`

**Entrega**: tabla presentacional (loading skeleton + estado vacío + select por
fila). Test opcional (E-LIST-01..03) si aporta valor.

**Archivos** (nuevo):
- `components/contacto-list-table.tsx` — columnas: razón social, nombre
  comercial, documento, rol (cliente/proveedor), estado activo. `key={c.id}`
  (Anti-F-06). Scroll-x + primera columna sticky en mobile (§7). `onSelect(c)`.
- (opcional) `components/contacto-list-table.test.tsx`.

**Verificación**: `npx tsc -b` + (si hay test) `npx vitest run`.

**Cubre**: REQ-LIST-01..05, E-LIST-01..03.

---

## Fase 7 — Form (TDD)

### 7.1 - [ ] `test(contactos-ui): add contacto form spec (RED)`

**Entrega**: spec del form en ROJO. Mock de `@/lib/api` + `wrapper()` con
`QueryClientProvider` (patrón de `cuenta-form.test.tsx`).

**Archivos** (nuevo):
- `components/contacto-form.test.tsx` — casos:
  - `mode=create` renderiza razón social habilitada y botón "Crear contacto"
    (E-FORMUI-01).
  - `mode=edit` con `initialData` precarga y botón "Guardar cambios"
    (E-FORMUI-02).
  - `isSubmitting=true` → submit deshabilitado (E-FORMUI-03).
  - `documento` vacío → `onSubmit` recibe `documento` que el data layer
    convertirá a null; testear que el form NO bloquea por documento vacío
    (E-FORMUI-04 — la conversión a null se testea en el data layer/helper).

**Verificación**: ROJO (form no existe).

### 7.2 - [ ] `feat(contactos-ui): implement contacto form (GREEN)`

**Entrega**: `ContactoForm` simple (sin selects estructurales ni parent picker).

**Archivos** (nuevo):
- `components/contacto-form.tsx` — react-hook-form + zodResolver. Campos:
  `razonSocial` (required), `nombreComercial`, `documento`, `email`, `telefono`,
  `direccion`, + checkboxes `esCliente`/`esProveedor`. `mapContactoToFormValues`
  para `edit` (null→''). `<label>` + `aria-invalid` + error visible.
  Submit `disabled={isSubmitting}` (Anti-F-07).

**Verificación**: `npx vitest run components/contacto-form.test.tsx` VERDE +
`npx tsc -b`.

**Cubre**: REQ-FORMUI-01..06, E-FORMUI-01..04, Adaptación 4.

---

## Fase 8 — Sheet de form

### 8.1 - [ ] `feat(contactos-ui): implement contacto form sheet`

**Entrega**: Sheet contenedor que orquesta la mutación según `mode`, toasts y
cierre en éxito (espejo de `cuenta-form-sheet`).

**Archivos** (nuevo):
- `components/contacto-form-sheet.tsx` — props `mode`, `initialData?`, `open`,
  `onOpenChange`. `useCreateContacto`/`useUpdateContacto`. `toast.success` +
  cerrar en éxito; `toast.error(backendErrorMessage(...))` en error.

**Verificación**: `npx tsc -b`.

**Cubre**: REQ-SHEET-01..02.

---

## Fase 9 — Dialog de desactivación (TDD)

### 9.1 - [ ] `test(contactos-ui): add desactivar contacto dialog spec (RED)`

**Entrega**: spec del dialog en ROJO.

**Archivos** (nuevo):
- `components/desactivar-contacto-dialog.test.tsx` — casos:
  - confirmar invoca `desactivarContacto(id)` (mock) (E-DIAL-01).
  - cancelar NO invoca la mutación (E-DIAL-02).

**Verificación**: ROJO.

### 9.2 - [ ] `feat(contactos-ui): implement desactivar contacto dialog (GREEN)`

**Entrega**: AlertDialog de confirmación (espejo simplificado de
`deactivate-cuenta-dialog`, sin lógica de concepto).

**Archivos** (nuevo):
- `components/desactivar-contacto-dialog.tsx` — `useDesactivarContacto`,
  confirmar con `isPending` (Anti-F-07), toast éxito/error, cierra en éxito.

**Verificación**: `npx vitest run components/desactivar-contacto-dialog.test.tsx`
VERDE + `npx tsc -b`.

**Cubre**: REQ-DIAL-01..03, E-DIAL-01..02.

---

## Fase 10 — Drawer de detalle (TDD — estados activo/inactivo→reactivar)

> **Task de mayor riesgo** — UI NUEVA (Adaptación 3). El drawer cambia de
> acciones según `activo`. Reactivar es directo (sin dialog).

### 10.1 - [ ] `test(contactos-ui): add contacto detail drawer spec (RED)`

**Entrega**: spec del drawer en ROJO. Mock de `@/lib/api` para
`useContactoDetail`.

**Archivos** (nuevo):
- `components/contacto-detail-drawer.test.tsx` — casos:
  - contacto `activo=true` → se ven **Editar** y **Desactivar**, NO **Reactivar**
    (E-DRAW-01).
  - contacto `activo=false` → se ve **Reactivar**, NO **Editar** ni
    **Desactivar** (E-DRAW-02).
  - click en **Reactivar** invoca la mutación directo, sin AlertDialog
    (E-DRAW-03).

**Verificación**: ROJO.

### 10.2 - [ ] `feat(contactos-ui): implement contacto detail drawer (GREEN)`

**Entrega**: drawer con detalle + acciones condicionadas por `activo`
(ver diagrama design D7).

**Archivos** (nuevo):
- `components/contacto-detail-drawer.tsx` — `useContactoDetail(contactoId)`
  (`enabled` cuando hay id). Loading skeleton + error. Estado **activo**: botones
  Editar (abre `ContactoFormSheet` edit) + Desactivar (abre
  `DesactivarContactoDialog`). Estado **inactivo**: botón Reactivar
  (`useReactivarContacto` directo + toast). NO botón DELETE (Q1).

**Verificación**: `npx vitest run components/contacto-detail-drawer.test.tsx`
VERDE + `npx tsc -b`.

**Cubre**: REQ-DRAW-01..05, E-DRAW-01..03, Adaptación 3.

---

## Fase 11 — Página + routing + nav

### 11.1 - [ ] `feat(contactos-ui): implement contactos page with routing and nav`

**Entrega**: la página contenedor + ruta + item de menú (un commit: la página no
es navegable sin routing/nav, y routing/nav no tienen destino sin la página).

**Archivos** (nuevo + modificados):
- `pages/contactos-page.tsx` — container (Anti-F-11). Estado: `rol`,
  `incluirInactivos`, `search`→`useDebouncedValue(150)`, `page`, `selectedId`,
  `createOpen`. Mapea filtros → `ListarContactosParams` (tabla design D5 actualizada).
  Reset `page=1` al cambiar filtro (REQ-PAGE-03). **SIN Tabs** (Adaptación 1).
  Compone `ContactoListFilters` + `ContactoListTable` + paginación +
  `ContactoDetailDrawer` + `ContactoFormSheet` (create). Botón "Nuevo contacto".
  **Mapeo del toggle**: `incluirInactivos=true` → `activo: 'all'` (NO `activo: false`);
  `incluirInactivos=false` → omitir param (default backend = solo activos).
- `routes/router.tsx` — ruta `/contactos` → `<ContactosPage />` dentro del
  `DashboardShell`.
- `components/nav-items.ts` — item `{ to: '/contactos', label: 'Contactos',
  icon: <lucide> }` después de "Plan de cuentas".

**Tests**: opcional un smoke test de la página (E-PAGE-01/02) si el wiring de
filtros→params justifica el setup. El mapeo de params se puede cubrir extrayendo
la función `buildParams(rol, incluirInactivos, q, page)` a algo testeable.

**Verificación**: `npx tsc -b` + `npm run build` + navegación manual a
`/contactos`.

**Cubre**: REQ-PAGE-01..04, REQ-PLUMB-01..02, E-PAGE-01..02, Adaptación 1.

---

## Fase 12 — Mapeo de error codes

### 12.1 - [ ] `feat(contactos-ui): map CONTACTO error codes`

**Entrega**: mensajes en español para los codes `CONTACTO_*`.

**Archivos** (modificado):
- `lib/error-messages.ts` — `backendErrorMessage` ya devuelve el `message` del
  backend (español). Agregar lo necesario para mensajes compuestos:
  - catálogo `CONTACTO_ERROR_LABELS` (o helper) para `CONTACTO_DOCUMENTO_DUPLICADO`
    (puede usar `details.contactoExistenteId`) y `CONTACTO_REFERENCIADO`
    (sugerir desactivar).
  - confirmar que `CONTACTO_NO_ENCONTRADO`, `CONTACTO_RAZON_SOCIAL_REQUERIDA`,
    `CONTACTO_FLAGS_INVALIDOS` muestran un mensaje claro (fallback al `message`
    del backend basta).

**Tests**: opcional unit del helper si tiene lógica (ej. composición con
`details`).

**Verificación**: `npx tsc -b`.

**Cubre**: REQ-PLUMB-03, E-ERR-01..02, §4 (códigos de error).

---

## Fase 13 — Verde final + checklist UI

### 13.1 - [ ] `chore(contactos-ui): final green check — build + vitest + lint`

**Entrega**: verificación de que el slice completo no rompió nada.

**Comandos** (desde `frontend/`):
```bash
npm run lint           # prettier/eslint — CRÍTICO antes de pushear (CI frontend)
npx tsc -b             # typecheck
npx vitest run         # toda la suite
npm run build          # tsc -b && vite build
```

**Checklist pre-commit de UI** (frontend §7, obligatorio — copiar al PR):
- [ ] Render correcto en 375px (iPhone SE)
- [ ] Render correcto en 768px (iPad)
- [ ] Render correcto en 1440px (laptop)
- [ ] Tap targets ≥ 44×44px en mobile
- [ ] Dark mode verificado — cero colores literales
- [ ] Nav accesible en `<md` (drawer/hamburger)
- [ ] Inputs sin auto-zoom en iOS (text-base en mobile)
- [ ] Tabla con estrategia explícita (scroll-x + sticky)
- [ ] Sheet/Dialog usable en mobile (no centered atrapado)
- [ ] Submit deshabilitado con `isPending` (Anti-F-07)

**Todo verde + checklist → PR listo para squash merge.**

**Cubre**: REQ-CAL-01..03.

---

## Estimación

| Fase | Tasks | Estimado |
|------|-------|----------|
| **0 — Backend: exponer activo='all'** | **2** | **~40 min** |
| 1 — Tipos + plumbing base | 1 | ~20 min |
| 2 — Data layer | 1 | ~30 min |
| 3 — Hooks | 1 | ~20 min |
| 4 — Schema (TDD) | 2 | ~40 min |
| 5 — Filtros (TDD) | 2 | ~1h |
| 6 — Tabla | 1 | ~40 min |
| 7 — Form (TDD) | 2 | ~1.5h |
| 8 — Form sheet | 1 | ~30 min |
| 9 — Dialog (TDD) | 2 | ~40 min |
| 10 — Drawer (TDD) | 2 | ~1.5h |
| 11 — Página + routing + nav | 1 | ~1h |
| 12 — Error codes | 1 | ~20 min |
| 13 — Verde final + checklist | 1 | ~20 min |
| **Total** | **20 tasks** | **~9h 40min efectivos** |

---

## Recordatorio de riesgos (desde design)

| Riesgo | Task donde se mitiga |
|--------|----------------------|
| R1 (drift tipos: sin `organizationId`, con `createdByUserId`) | 1.1 |
| R2 (contrato 3-state `activo`: `true`/`false`/`'all'`) | **0.1/0.2** (backend e2e + DTO) + 5.2 (toggle "Incluir inactivos") + 11.1 (mapeo `activo: 'all'`) |
| R3 (`documento` `''`→`null`) | 2.1 (data layer create/update) |
| R4 (flags cross-field default false) | 4.1/4.2 (schema refine) |
| R5 ("Reactivar" es UI nueva) | 10.1/10.2 (drawer, estados act/inact) |

## Task de mayor riesgo

**Fase 10** (drawer): es la única UI sin precedente en `plan-cuentas`. Los tres
escenarios (activo→Editar/Desactivar, inactivo→Reactivar, reactivar sin dialog)
DEBEN estar verdes antes de la página. Si el drawer falla, la página arrastra el
bug.

---

**Fin de tasks.**
