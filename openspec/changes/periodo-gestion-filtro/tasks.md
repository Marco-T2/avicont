# Tareas: Filtro de período por Gestión + Mes

## 1. Componente compartido
- [x] `src/components/shared/periodo-gestion-filtro.tsx` — Gestión + Mes ("Todos") + toggle rango libre, self-contained, emite `PeriodoSeleccion`.
- [x] Defaults: gestión más reciente (year DESC, ABIERTA primero) + "Todos"; emite `onChange` inicial → form válido.
- [x] Estados loading / empty (sin gestiones) / error.
- [x] `src/components/shared/periodo-gestion-filtro.test.tsx` — default emite rango de gestión; mes específico → `{modo:'periodo'}`; rango libre → `{modo:'rango'}` con fechas tipeadas; empty state; loading; error. Mocks de `useGestiones`/`usePeriodos`.

## 2. Migración piloto — Libro Mayor
- [x] `libro-mayor-filtros.tsx` usa `<PeriodoGestionFiltro>` en vez del toggle período/rango + `<Select>` de períodos.
- [x] Conserva `incluirAnulados` (default false) + `soloConMovimiento` (default true) + `CuentaAutocomplete` + botón "Consultar" con `disabled={isFetching}`.
- [x] Payload `LibroMayorFiltroValues` IDÉNTICO (la page `libro-mayor-page.tsx` NO se toca).
- [x] `libro-mayor-filtros.test.tsx` actualizado a la nueva UI (verde).

## 3. Verificación de esta rebanada
- [x] `pnpm exec tsc -b` → 0 errores.
- [x] `pnpm exec vitest run src/components/shared/periodo-gestion-filtro.test.tsx src/features/libro-mayor` → verde (66 tests).
- [x] lint de los archivos tocados → 0 errores.

## 4. Fan-out (rebanadas siguientes — fuera de esta entrega)
- [x] `libro-diario` — migrar su filtro al componente compartido.
- [x] `balance-comprobacion` — idem.
- [x] `hoja-trabajo` — idem.
- [x] `flujo-efectivo` — idem.
- [x] `evolucion-patrimonio` — idem.
- [ ] (DIFERIDO) `comprobantes` — su listado pagina; mecánica de export propia.

## 5. Cierre
- [ ] `/sdd-verify` sobre el componente y el piloto.
- [ ] `/sdd-archive` cuando los 6 reportes estén migrados.
