# Proposal: Filtro de Período con Presets (QuickBooks-style)

<!--
Artifact: proposal
Change: filtro-periodo-presets
Fecha: 2026-06-19
Status: DRAFT
Decision: cerradas con el usuario — ver "Decisiones cerradas"
-->

## Intent

Reemplazar el filtro de período/gestión de los reportes contables por un modelo
estilo QuickBooks: campos Desde/Hasta SIEMPRE visibles y editables, más un selector
de PRESET que los rellena. El query SIEMPRE viaja por `fechaDesde`/`fechaHasta` —
la UI nunca emite `periodoFiscalId` ni `gestionId`.

**Por qué (el bug que lo motiva):** seleccionar "Gestión + mes Todos" emitía
`fechaDesde`/`fechaHasta` en `undefined`, porque `GET /periodos` nunca proyectó
`fechaInicio`/`fechaFin` y el tipo `Periodo` hand-written de `api.ts` *mentía*
(los declara obligatorios; en runtime son `undefined`). Resultado: EEPN → 400,
Libro Mayor → la query nunca dispara. El contrato roto pasó CI porque
`PeriodoFiscalResponseDto` no está decorado con `@ApiOkResponse` (no entra al
`openapi.json`) y los tests de filtros mockean `usePeriodos` con fixtures que sí
incluyen las fechas que el backend real nunca envía.

## Scope

### In scope

**Backend (fundación — mismo cambio, no PR aparte):**
- `backend/src/periodos-fiscales/dto/periodo-fiscal-response.dto.ts` — +2 campos
  `fechaInicio`/`fechaFin` con `@ApiProperty`; `toPeriodoResponse` los deriva con
  `RangoPeriodoFiscal.of(p.year, p.month).inicio()/.fin()` (clona lo que ya hace
  `obtenerResumenPrecierre`).
- `backend/src/periodos-fiscales/periodos-fiscales.controller.ts` —
  `@ApiOkResponse({ type: [PeriodoFiscalResponseDto] })` en `GET /periodos` (mínimo;
  los demás endpoints del controller si cierra la deuda sin costo).
- `backend/openapi.json` + `frontend/src/types/api.generated.ts` — regenerar.
- `frontend/src/types/api.ts` — sincronizar el tipo `Periodo` hand-written
  (cierra la deuda del tipo-que-miente).
- `backend/test/periodos-fiscales.e2e-spec.ts` — assertar `fechaInicio`/`fechaFin`
  en cada item de `GET /periodos`.
- `backend/.../periodo-fiscal-response.dto.spec.ts` — unit del mapper (TDD).

**Frontend (rediseño del componente compartido + 6 features):**
- `frontend/src/components/shared/periodo-gestion-filtro.tsx` — rediseño completo
  (presets + Desde/Hasta editables).
- `frontend/src/components/shared/periodo-gestion-filtro.test.tsx` — reescritura.
- `frontend/src/features/periodos-fiscales/lib/` — nueva función pura
  `calcularRangoGestionISO(year, mesInicio)` → `{ fechaInicio, fechaFin }` YYYY-MM-DD
  (resuelve el principio: el preset elige el período correcto y COPIA fechas
  backend; para la gestión se deriva del rango ya conocido sin aritmética de
  calendario riesgosa).
- `frontend/src/lib/fecha-actual.ts` — base existente `hoyEnLaPazISO`; helpers de
  mes si DESIGN los necesita.
- Los 6 features que usan `PeriodoGestionFiltro`: **libro-diario, libro-mayor,
  balance-comprobacion, hoja-trabajo, flujo-efectivo, evolucion-patrimonio**.
  Por cada uno: `components/*-filtros.tsx`, `components/*-filtros.test.tsx`,
  `schemas/*-filtro-schema.ts` (quitar `modo:'periodo'`), `api/get-*.ts` (quitar
  rama `periodoFiscalId`), `hooks/use-*.ts` (simplificar `enabled`).

### Out of scope

- **Balance General** (filtro "as-of date" único, no usa `PeriodoGestionFiltro`) y
  **Estado de Resultados** (inputs date directos, no usa el componente) → follow-up.
- Contratos de los endpoints EEFF del backend: SIGUEN aceptando `periodoFiscalId`
  (no se tocan); solo la UI deja de usarlo.
- Migración de BD: ninguna. `fechaInicio`/`fechaFin` son derivadas en cómputo.
- Persistencia del preset/fechas en URL (`useSearchParams`): no es objetivo.

## Approach — 3 piezas de un mismo cambio

### 1. Modelo QuickBooks en el componente compartido

`PeriodoGestionFiltro` ofrece campos Desde/Hasta siempre visibles + un selector de
presets: **"Esta gestión" · "Gestión anterior" · "Este mes" · "Mes anterior" ·
"Personalizado"**. Elegir un preset rellena Desde/Hasta; editar las fechas a mano
fuerza "Personalizado". Las fechas son el ESTADO DE VERDAD; el preset es un
acelerador de selección. No hay selector de mes puntual: un mes no listado se tipea
y cae en "Personalizado". El output es siempre `{ fechaDesde, fechaHasta }`.

### 2. Fundación backend (proyectar fechas + cerrar el contrato)

`GET /periodos` proyecta `fechaInicio`/`fechaFin` clonando `RangoPeriodoFiscal`
(§4.6: aritmético en enteros, sin `new Date()`). Se decora con `@ApiOkResponse`,
se regeneran `openapi.json` + `api.generated.ts`, y se sincroniza el tipo `Periodo`
de `api.ts`. Así el frontend COPIA fechas reales del backend en vez de inventarlas,
y el contrato deja de mentir.

### 3. Simplificación de schemas (siempre rango)

Eliminar el discriminante `modo:'periodo'` de los 6 zod schemas, sus API handlers
y tests. La UI siempre resuelve a rango antes de llamar al API. Borra código muerto
sin tocar el contrato del backend.

**Resolución de presets sin aritmética de calendario en el frontend (principio):**
cada preset elige el/los períodos correctos y COPIA las fechas que el backend ya
calculó vía `RangoPeriodoFiscal`; el frontend no calcula bisiestos/días-del-mes.
- "Esta gestión" = min(fechaInicio)/máx(fechaFin) de los períodos de la gestión
  ABIERTA más reciente (fallback: la de mayor año).
- "Gestión anterior" = ídem sobre la gestión inmediatamente previa por año.
- "Este mes" = el período cuyo (year, month) coincide con HOY (America/La_Paz, vía
  `hoyEnLaPazISO`); se copian sus fechas backend.
- "Mes anterior" = el período del mes calendario anterior a hoy.
- El detalle fino de fallbacks (qué pasa si no existe el período de hoy) se resuelve
  en DESIGN.

## Risks & tradeoffs

- **Quitar `modo:'periodo'` = blast radius en 6 schemas + 6 API handlers + tests.**
  Mitigación: borra código muerto y unifica el contrato de salida; el backend sigue
  aceptando `periodoFiscalId` si en el futuro se quiere restaurar (la UI solo deja
  de emitirlo). Strict TDD: actualizar tests antes del código.
- **Presets relativos a "hoy"** ("Este mes" / "Mes anterior"): los tests deben
  inyectar la fecha vía el `clock` de `fecha-actual.ts` (`hoyEnLaPazISO(clock)`),
  nunca depender del reloj real → tests deterministas.
- **Caso "no existe el período de hoy"** (la org aún no creó el período del mes
  actual): el preset "Este mes"/"Mes anterior" no encuentra período del cual copiar.
  Se enuncia como riesgo; el comportamiento exacto (deshabilitar el preset, caer a
  "Personalizado vacío", etc.) se decide en DESIGN.
- **Tipo `Periodo` hand-written → alias generado**: sincronizarlo cierra una deuda,
  pero hay que verificar que ningún consumidor dependa de los campos fantasma de
  `GestionConPeriodos` (R3 de la exploración). Acotar a `Periodo`; la limpieza de
  `GestionConPeriodos` queda fuera salvo que caiga gratis al decorar DTOs.

## Result Contract

- **status:** proposal-ready
- **executive_summary:** Filtro QuickBooks (Desde/Hasta editables + 5 presets que
  rellenan fechas) sobre 6 reportes, apoyado en una fundación backend que proyecta
  `fechaInicio`/`fechaFin` en `GET /periodos` y cierra el contrato OpenAPI, más la
  eliminación del `modo:'periodo'` de los schemas. Cierra el bug de
  `fechaDesde/fechaHasta` undefined.
- **artifacts:** `openspec/changes/filtro-periodo-presets/proposal.md` + engram
  `sdd/filtro-periodo-presets/proposal`.
- **next_recommended:** **spec + design en paralelo.** Spec: requisitos y scenarios
  de presets/Personalizado y de la proyección backend. Design: resolución fina de
  presets (gestión ABIERTA vs mayor año, "Gestión anterior" por año, fallback
  "no existe período de hoy"), forma exacta de `calcularRangoGestionISO`, máquina de
  estado fechas↔preset, alcance del `@ApiOkResponse`.
- **risks:** ver sección Risks & tradeoffs.
- **skill_resolution:** injected (Strict TDD, hexagonal §3.x, §4.6, screaming arch
  frontend, §14.7 gating, conventional commits / squash / PR Qué·Por qué·Cómo probar).
