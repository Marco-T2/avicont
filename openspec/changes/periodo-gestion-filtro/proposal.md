# Propuesta: Filtro de período por Gestión + Mes (componente compartido)

> Change: `periodo-gestion-filtro`
> Tipo: **frontend-puro** (cero backend, cero migración, cero RBAC nuevo)
> Diseño: **APROBADO por el usuario** (no se re-decide)

## Why (intent / motivación)

Hoy 7 filtros de reportes (Libro Mayor, Libro Diario, Balance de Comprobación,
Hoja de Trabajo, Estado de Flujo de Efectivo, Evolución del Patrimonio, y el
mismo Libro Mayor piloto) renderean un `<Select>` con **TODOS los períodos del
tenant** (12 meses × N gestiones). Ese listado:

1. **Crece sin techo**: con 3-4 gestiones cerradas el dropdown tiene 36-48 ítems
   indistinguibles (solo "Mes Año"), sin agrupar por gestión.
2. **Está copiado en cada feature**: el mismo bloque "Por período / Por rango" +
   `<Select>` de períodos se reescribe en cada filtro, divergiendo en detalles.
3. **Arranca inválido**: el form parte vacío y exige elegir un período antes de
   consultar, sumando una fricción que no aporta.

Se reemplaza por un **componente compartido** con DOS selects acotados:
**Gestión** + **Mes** (con opción "Todos"). El modo "rango de fechas libre" se
**conserva** detrás de un toggle secundario.

## What changes (scope acotado)

### Componente nuevo
- `frontend/src/components/shared/periodo-gestion-filtro.tsx` — self-contained
  (carga gestiones + períodos por dentro vía los hooks existentes). Emite un
  `PeriodoSeleccion` (XOR `{modo:'periodo'}` / `{modo:'rango'}`).
- `frontend/src/components/shared/periodo-gestion-filtro.test.tsx` — cobertura de
  defaults, mes específico, rango personalizado, empty/loading, error.

### Migración piloto (esta rebanada)
- `frontend/src/features/libro-mayor/components/libro-mayor-filtros.tsx` —
  reemplaza el bloque toggle período/rango + `<Select>` de períodos por
  `<PeriodoGestionFiltro>`. **Conserva** los toggles `incluirAnulados` +
  `soloConMovimiento` + el `CuentaAutocomplete` + el botón "Consultar" manual.
  El TYPE `LibroMayorFiltroValues` que recibe la page **NO cambia**.
- `frontend/src/features/libro-mayor/components/libro-mayor-filtros.test.tsx` —
  actualizado a la nueva UI.

### Fan-out (rebanadas siguientes, fuera de esta entrega)
Los otros 5 reportes EEFF: `libro-diario`, `balance-comprobacion`,
`hoja-trabajo`, `flujo-efectivo`, `evolucion-patrimonio`. **Comprobantes
DIFERIDO** (su listado pagina y el endpoint de export tiene su propia mecánica).

## Approach (alto nivel)

El componente mapea la selección del usuario al contrato de salida **sin
cambiar lo que aceptan los reportes EEFF** (`{modo:'periodo', periodoFiscalId}`
XOR `{modo:'rango', fechaDesde, fechaHasta}`):

- Gestión G + mes **específico** P → `{ modo:'periodo', periodoFiscalId: P.id }`.
- Gestión G + **"Todos"** → `{ modo:'rango', fechaDesde: 1erPeríodo.fechaInicio,
  fechaHasta: últimoPeríodo.fechaFin }`. Las fechas vienen YA en `YYYY-MM-DD`
  desde el período (proyectadas por el backend); **NO se calculan a mano** (§4.6).
- Toggle rango libre → `{ modo:'rango', fechaDesde, fechaHasta }` (dos inputs date).

**Defaults**: gestión = la más reciente (year DESC; ante mismo year, preferí la
`ABIERTA`). Mes = "Todos". El componente emite el `onChange` inicial → el form
queda **válido** desde el arranque. Se mantiene el botón "Consultar" manual
(NO auto-query al montar).

## Out of scope (explícito)

- **Backend / migración / RBAC**: cero cambios.
- **Comprobantes**: diferido (pagina; mecánica de export propia).
- **Los otros 5 reportes EEFF**: en rebanadas siguientes (mismo patrón del piloto).
- **`api.generated.ts`**: no se regenera (no se toca ningún DTO).

## Risks

1. **Emisión inicial doble / loop**: el componente emite `onChange` al resolver
   el default. Mitigación: una única vía de emisión (efecto que compara firma
   JSON del `PeriodoSeleccion` resuelto) — no emite si la firma no cambió.
2. **`onChange` inestable del caller**: si el caller pasa un `onChange` que
   cambia identidad cada render, el efecto no entra en loop (se guarda por
   `react-hooks/exhaustive-deps` deshabilitado en esa línea + guard de firma),
   pero el caller debería pasar un handler estable. Documentado en el JSDoc.
3. **Gestión sin períodos**: en modo "Todos" sin períodos cargados, la selección
   resuelve a `null` y no se emite (el form sigue inválido hasta que lleguen).
   Correcto: no se emite un rango incompleto.
