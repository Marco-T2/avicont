# Proposal: contactos-ui

> Fecha: 2026-05-21 (actualizado: 2026-05-21 — se incorpora Fase 0 backend)
> Fase: proposal
> Proyecto: avicont
> Scope: **FRONTEND** (React/Vite) + **un cambio menor de BACKEND** (DTO `activo='all'`).

---

## Why

El backend de **Contactos** (clientes/proveedores) ya está maduro y mergeado:
expone el CRUD completo + búsqueda trigram + desactivar/reactivar. Hoy NO tiene
UI: un usuario del vertical contable no puede dar de alta ni consultar sus
clientes/proveedores desde la app. Sin contactos no se puede avanzar al
siguiente slice contable (comprobantes que referencian un contacto).

Este es el **primer slice del vertical contable en el frontend después de
`plan-cuentas`**. La feature `plan-cuentas` ya estableció el patrón canónico de
una feature contable en el front (`api/` + `hooks/` + `components/` + `pages/` +
`schemas/`, TanStack Query, react-hook-form + zod, drawer de detalle, sheet de
form, dialog de confirmación). La estrategia de este cambio es **espejo 1:1 de
`plan-cuentas` con 5 adaptaciones** justificadas por las diferencias del dominio
(contactos es plano, no jerárquico; tiene reactivar; el form es más simple).

Replicar el patrón ya probado minimiza riesgo, acelera la entrega y mantiene la
consistencia que pide la Screaming Architecture del frontend (un dev externo
abre `src/features/` y entiende el dominio).

---

## What Changes

- Nueva feature `frontend/src/features/contactos/` con la estructura estándar
  (`api/`, `hooks/`, `components/`, `pages/`, `schemas/`), espejo de
  `plan-cuentas`.
- **Lista** paginada de contactos con tabla (razón social, nombre comercial,
  documento, flags cliente/proveedor, estado activo).
- **Filtros**: control segmentado **Todos | Clientes | Proveedores** + toggle
  **"Incluir inactivos"** + buscador `q` con debounce (Decisión Q2, cerrada).
- **Crear / Editar** vía Sheet con `ContactoForm` (más simple que `CuentaForm`).
- **Detalle** en un drawer lateral con acciones: Editar, Desactivar y —cuando el
  contacto está inactivo— **Reactivar** (UI NUEVA, no existe en `plan-cuentas`).
- **Desactivar** con AlertDialog de confirmación. **Reactivar** es idempotente,
  sin AlertDialog (acción no destructiva).
- Schema zod con `.refine()` cross-field `esCliente || esProveedor` y manejo de
  `documento` vacío → `null`.
- Plumbing compartido: nuevos tipos en `types/api.ts`, ruta + nav item, mapeo de
  los error codes `CONTACTO_*` en `error-messages.ts`.
- Tests vitest (TDD strict): schema, filtros, form, dialog/drawer, plumbing.

---

## Scope

### In scope

- Feature `contactos` completa: list, filtros, búsqueda, crear, editar,
  desactivar, **reactivar**.
- Tipos del modelo `Contacto` (13 campos) + `ListarContactosParams` +
  `ContactoListResponse` en `types/api.ts`.
- Ruta `/contactos` en `router.tsx` + item en `nav-items.ts`.
- Mapeo de los 5 error codes `CONTACTO_*` (mensajes UI amigables donde aplica).
- `api/eliminar.ts` (DELETE físico) se **crea** como función del data layer pero
  **sin botón en UI** en este slice (Decisión Q1, cerrada — ver abajo).
- Tests: schema zod, filtros (segmentado + toggle + buscador), form
  (validaciones + cross-field), drawer (estados activo/inactivo → Reactivar),
  dialog de desactivación.

### Out of scope (defer)

- **Botón DELETE físico en UI** (slice 2 posterior). El DELETE no es testeable
  de punta a punta hasta que existan comprobantes que referencien contactos →
  `409 CONTACTO_REFERENCIADO`. El slice 1 LIDERA con desactivar/reactivar como
  el ciclo de vida operativo. Ver Decisión Q1.
- **Backend de contactos** — ya mergeado, este cambio NO lo toca.
- **Selector de contacto embebido en otros formularios** (ej. línea de
  comprobante con `contactoId`). Va con el slice de comprobantes.
- **Migración a `openapi-typescript`** para tipos compartidos — deuda
  preexistente (CLAUDE.md §10.10). Los tipos se espejan a mano como el resto.
- **MSW para mocks de API en tests** — deuda del frontend (CLAUDE.md §9). Los
  tests siguen mockeando `@/lib/api` con `vi.mock` como hace `plan-cuentas`.

---

## Decisiones de producto YA CERRADAS (no se reabren)

### Q1 — DELETE físico: diferido a slice 2

El backend expone `DELETE /api/contactos/:id` (204) que es **borrado físico**
(distinto de `plan-cuentas`, donde DELETE es desactivación). Pero el DELETE solo
falla con `409 CONTACTO_REFERENCIADO` cuando hay comprobantes apuntando al
contacto, y esos comprobantes **aún no existen** en el producto. Sin ese camino
de error, el botón no es testeable de forma significativa.

**Decisión**: el slice 1 LIDERA con desactivar/reactivar (ciclo de vida
operativo). Se crea `api/eliminar.ts` (está en la lista de archivos) para tener
el data layer listo, pero **no se expone botón de DELETE en la UI**. Cuando
exista el slice de comprobantes, se agrega el botón + el manejo del 409. Esto es
una **decisión de scope**, no un pendiente abierto.

### Q2 — Filtros: segmentado + toggle inactivos + buscador

Control segmentado **Todos | Clientes | Proveedores** (mapea a
`esCliente`/`esProveedor`) + toggle **"Incluir inactivos"** (manda `activo='all'`
— unión de activos e inactivos; sin él el backend solo devuelve activos) + buscador
`q` con debounce. **Cerrado** por el usuario. El contrato `activo='all'` requiere
un cambio menor en el DTO backend (Fase 0).

### Q3 — Contrato `activo`: 3-state con `'all'` (decisión 2026-05-21)

El toggle "Incluir inactivos" necesita ver la UNIÓN de activos e inactivos, no
solo los inactivos. El backend ya soportaba `activo: 'all'` en el service y el
repositorio, pero el DTO HTTP (`ListarContactosQueryDto`) solo aceptaba `boolean`.
**Decisión**: exponer `activo='all'` en el DTO HTTP (cambio mínimo: transform +
validación). El service y el repo NO cambian. Esto convierte el slice de "solo
frontend" a "frontend + cambio chico de backend" en el scope. **Cerrado**.

---

## Las 5 adaptaciones vs `plan-cuentas` (resumen — detalle en design)

| # | Adaptación | Motivo |
|---|------------|--------|
| 1 | SIN tabs lista/árbol | Contactos es **plano**, no jerárquico. No hay `get-cuenta-tree`, `cuenta-tree-view`, `cuenta-parent-picker` ni `lib/sugerir-codigo-hijo`. |
| 2 | Filtros = segmentado + toggle inactivos + buscador | Q2. `plan-cuentas` filtra por clase con chips; contactos filtra por rol + estado. |
| 3 | Botón **Reactivar** en el drawer cuando `activo=false` | UI NUEVA. `plan-cuentas` no tiene reactivación en la UI. Idempotente, sin AlertDialog. |
| 4 | `ContactoForm` más simple que `CuentaForm` | Sin selects clase/subclase/naturaleza, sin árbol padre. Checkboxes `esCliente`/`esProveedor`. |
| 5 | Schema zod con cross-field flags + `documento` `null` | `.refine(esCliente \|\| esProveedor)` con `path`. `documento` vacío → `null` (unique parcial WHERE documento IS NOT NULL). |

---

## Capabilities

### New Capabilities

- `contactos-ui`: la interfaz de gestión de contactos (clientes/proveedores) del
  vertical contable: listar, filtrar, buscar, crear, editar, desactivar y
  reactivar.

### Modified Capabilities

- `app-navigation`: nuevo item "Contactos" en el menú principal + ruta
  `/contactos` protegida.

---

## Affected Modules / Files

### Archivos MODIFICADOS — BACKEND (cambio de contrato `activo='all'`)

> Scope de commit: `contactos` (NO `contactos-ui` — es un cambio de backend).

| Archivo | Cambio |
|---------|--------|
| `backend/src/contactos/dto/listar-contactos.dto.ts` | Transform + validación para `boolean \| 'all'`; `@ApiPropertyOptional` actualizado |
| `backend/src/contactos/contactos.controller.ts` | Verificar propagación de `'all'` al serviceInput (el type debe aceptar `boolean \| 'all'`) |
| `backend/test/contactos.e2e-spec.ts` | Agregar casos `activo=all` (unión), `activo=false` (inactivos), regresiones sin param y con `activo=true` |

### Archivos NUEVOS (`frontend/src/features/contactos/`)

| Carpeta | Archivos |
|---------|----------|
| `api/` | `get-contactos.ts`, `get-contacto-detail.ts`, `create-contacto.ts`, `update-contacto.ts`, `desactivar-contacto.ts`, `reactivar-contacto.ts`, `eliminar-contacto.ts` |
| `hooks/` | `use-contactos.ts`, `use-contacto-detail.ts`, `use-contacto-mutations.ts` |
| `schemas/` | `contacto-form-schema.ts` |
| `components/` | `contacto-list-table.tsx`, `contacto-list-filters.tsx`, `contacto-detail-drawer.tsx`, `contacto-form.tsx`, `contacto-form-sheet.tsx`, `desactivar-contacto-dialog.tsx` |
| `pages/` | `contactos-page.tsx` |

### Archivos a MODIFICAR (plumbing compartido)

| Archivo | Cambio |
|---------|--------|
| `frontend/src/types/api.ts` | `Contacto` (13 campos), `ContactoListResponse`, `ListarContactosParams`. **OJO**: el response NO trae `organizationId` (a diferencia de `Cuenta`); sí trae `createdByUserId`. Sin enums nuevos. |
| `frontend/src/routes/router.tsx` | Ruta `/contactos` → `ContactosPage` dentro del `DashboardShell`. |
| `frontend/src/components/nav-items.ts` | Item "Contactos" con un icono de lucide. |
| `frontend/src/lib/error-messages.ts` | Mapeo de los 5 codes `CONTACTO_*` (helper o catálogo de labels). |

### Archivos REUTILIZADOS sin cambio

- `frontend/src/lib/api.ts` (cliente axios único).
- `frontend/src/lib/use-debounced-value.ts` (buscador con debounce).
- `frontend/src/components/ui/*` (Button, Input, Sheet, AlertDialog, Table,
  Checkbox, Switch, Skeleton, sonner).
- `frontend/src/test/setup.ts` (polyfills Radix para vitest).

---

## Invariantes / Riesgos del frontend a respetar

Aplican las reglas de `frontend/CLAUDE.md`:

- **§4 State**: server state SOLO en TanStack Query — nunca duplicar en Zustand.
- **§5 Forms**: toda entrada va por react-hook-form + zodResolver. Mensajes en
  español. `<Button disabled={isPending}>` (Anti-F-07, crítico).
- **§8 API**: componentes importan SOLO del hook, nunca de `api/*.ts`
  (Anti-F-12). Una request por endpoint en `api/`.
- **§6 Estilos**: variables semánticas del tema, cero colores literales
  (Anti-F-10). Dark mode obligatorio.
- **§7 Responsive**: tabla con scroll-x + primera columna sticky; sheet/dialog
  usable en mobile; tap targets ≥ 44px; checklist pre-commit de UI.
- **Tipado**: cero `any` (Anti-F-01), `unknown` con narrowing.

### Riesgos a documentar

- **R1 — Drift de tipos backend↔frontend**: el response de `Contacto` NO trae
  `organizationId` (a diferencia de `Cuenta`) y SÍ trae `createdByUserId`.
  Espejar exactamente `ContactoResponseDto` del backend, no copiar `Cuenta`.
- **R2 — Contrato 3-state `activo`**: el param acepta `true`/`false`/`'all'`.
  El toggle "Incluir inactivos" manda `activo='all'` (unión); apagado, NO se manda
  `activo` (default backend = solo activos). `activo=false` significa "solo
  inactivos" — semántica diferente de la unión. La Fase 0 expone `'all'` en el DTO
  del backend para que el contrato sea explícito y sin ambigüedad.
- **R3 — `documento` `""` vs `null`**: el backend tiene unique parcial
  `WHERE documento IS NOT NULL`. El form vacío DEBE enviar `null`, no `""`, o
  dos contactos sin documento colisionarían.
- **R4 — flags cross-field default false**: `esCliente`/`esProveedor` arrancan
  en `false`; el schema DEBE rechazar el caso "ambos false" con un error en el
  path correcto, antes de pegarle al backend (`CONTACTO_FLAGS_INVALIDOS`).
- **R5 — "Reactivar" es UI nueva**: no hay precedente en `plan-cuentas`. El
  drawer cambia de acciones según `activo` (activo → Editar/Desactivar;
  inactivo → Reactivar). Requiere test dedicado de ambos estados.

---

## Rollback plan

El slice es mayoritariamente aditivo de frontend. El único cambio de backend
(Fase 0) es retrocompatible: el nuevo valor `'all'` es aditivo (no rompe clientes
que ya usan `true`/`false`/sin-param).

1. `git revert` del PR de backend (Fase 0): `activo='all'` vuelve a ser rechazado
   con 400 por el DTO. Sin impacto en datos (solo query param).
2. `git revert` del PR de frontend: elimina la feature `contactos/` y revierte
   las 4 ediciones de plumbing (`types/api.ts`, `router.tsx`, `nav-items.ts`,
   `error-messages.ts`).
3. Sin datos persistidos por el frontend — no hay limpieza de BD.
4. La ruta `/contactos` deja de existir; `nav-items` vuelve a su estado previo.

Sin downtime, sin pérdida de datos, sin coordinación con equipos externos.

---

## Dependencias

- Backend de contactos — **cerrado, mergeado**. Provee todos los endpoints.
- Feature `plan-cuentas` (frontend) — **patrón a espejar**, no se modifica.
- `lib/api.ts`, `lib/use-debounced-value.ts`, `components/ui/*` — existentes.

## Desbloquea

- **Slice de comprobantes** — el selector de contacto (`contactoId` en línea) y
  el botón DELETE físico (con manejo de `409 CONTACTO_REFERENCIADO`) se enchufan
  sobre esta feature.
- **Vertical contable** en general — contactos es prerequisito de varios slices.

---

## Success Criteria

- [ ] `/contactos` lista los contactos del tenant activo con paginación.
- [ ] El segmentado Todos/Clientes/Proveedores filtra correctamente (mapea a
      `esCliente`/`esProveedor`).
- [ ] El toggle "Incluir inactivos" muestra activos + inactivos (manda `activo='all'`);
      sin él solo se ven activos. `activo=false` muestra SOLO inactivos (distinto).
- [ ] El buscador `q` filtra con debounce.
- [ ] Crear un contacto con al menos un flag (cliente/proveedor) funciona;
      ambos flags en false es rechazado por el form ANTES del request.
- [ ] `documento` vacío se envía como `null`.
- [ ] Editar un contacto activo funciona (PATCH).
- [ ] Desactivar pide confirmación; reactivar es directo (sin dialog) y solo
      aparece cuando el contacto está inactivo.
- [ ] Los error codes `CONTACTO_*` muestran mensajes en español.
- [ ] `npm run build` (`tsc -b && vite build`) + `npx vitest run` en verde.
- [ ] Checklist pre-commit de UI (375/768/1440px, dark mode, tap targets).

---

**Fin del proposal.**
