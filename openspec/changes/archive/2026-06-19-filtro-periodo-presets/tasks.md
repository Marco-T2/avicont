# Tasks: Filtro de Período con Presets (QuickBooks-style)

<!--
Artifact: tasks
Change: filtro-periodo-presets
Fecha: 2026-06-19
Status: READY-FOR-APPLY
Modo: Strict TDD — test PRIMERO en cada bloque
Override autoritativo: Camino B (funciones puras en frontend, sin proyectar fechas en backend)
-->

## OVERRIDE AUTORITATIVO — Camino B (decisión firmada)

El backend NO proyecta `fechaInicio`/`fechaFin`. Solo higiene de contrato: `@ApiOkResponse` +
regeneración de artefactos. El tipo `Periodo` en `api.ts` PIERDE los campos fantasma y se
convierte en alias de `Schemas['PeriodoFiscalResponseDto']` (que refleja el contrato real).
Las fechas de los presets las calculan funciones puras en el frontend.

Ver engram `sdd/filtro-periodo-presets/design` para la decisión completa.

---

## Slice 1 — Backend: higiene de contrato

> **Dependencia**: ninguna. Es el primer paso.
> **Por qué primero**: cierra la raíz del bug (contrato sin tipo en OpenAPI + tipo hand-written que mentía). El job `contract-drift` debe quedar verde antes de tocar el frontend.

### T1.1 — Test unitario del mapper `toPeriodoResponse` (NUEVO, test primero)

- **Archivo test**: `backend/src/periodos-fiscales/dto/periodo-fiscal-response.dto.spec.ts` (crear)
- **Casos a cubrir**:
  - [ ] Período estándar (enero 2026): `fechaInicio='2026-01-01'`, `fechaFin='2026-01-31'`
  - [ ] Abril (30 días): `fechaFin='2026-04-30'`
  - [ ] Febrero no bisiesto 2026: `fechaFin='2026-02-28'`
  - [ ] Febrero bisiesto 2024: `fechaFin='2024-02-29'`
  - [ ] Diciembre: `fechaFin='YYYY-12-31'`
  - [ ] Shape completo conservado (todos los campos existentes presentes)

> Test escrito → rojo → implementar T1.2 → verde.

### T1.2 — Decorar `PeriodoFiscalResponseDto` con `fechaInicio`/`fechaFin`

- **Archivo**: `backend/src/periodos-fiscales/dto/periodo-fiscal-response.dto.ts`
- [ ] Agregar `@ApiProperty` para `fechaInicio` (ejemplo: `'2026-04-01'`)
- [ ] Agregar `@ApiProperty` para `fechaFin` (ejemplo: `'2026-04-30'`)
- [ ] Actualizar `toPeriodoResponse`: agregar `const rango = RangoPeriodoFiscal.of(p.year, p.month)` + `fechaInicio: rango.inicio()` + `fechaFin: rango.fin()`
- [ ] Verificar que `rango.inicio()` / `rango.fin()` devuelven `string` YYYY-MM-DD (confirmar en `rango-periodo-fiscal.ts`)
- **Test unitario**: T1.1 debe quedar verde

### T1.3 — Agregar `@ApiOkResponse` al controller de periodos

- **Archivo**: `backend/src/periodos-fiscales/periodos-fiscales.controller.ts`
- [ ] Decorar `listar` (`GET /periodos`) con `@ApiOkResponse({ type: [PeriodoFiscalResponseDto] })`
- [ ] Decorar `obtener` (`GET /periodos/:id`) con `@ApiOkResponse({ type: PeriodoFiscalResponseDto })`
- [ ] Decorar `cerrar` (`POST /periodos/:id/cerrar`) con `@ApiOkResponse({ type: PeriodoFiscalResponseDto })`
- [ ] Decorar `reabrir` / `marcarDefinitivo` con `@ApiOkResponse({ type: PeriodoFiscalResponseDto })` (si existen en el controller)
- [ ] NO tocar `resumen` (devuelve `ResumenPrecierre`, fuera de scope)

### T1.4 — Actualizar test e2e de periodos (ACTUALIZAR)

- **Archivo**: `backend/test/periodos-fiscales.e2e-spec.ts`
- [ ] En el test `"GET /periodos lista los 12"` (buscar por string en el archivo): assertar que cada item incluye `fechaInicio` y `fechaFin` con formato `YYYY-MM-DD`
- [ ] Caso puntual: el período de enero incluye `fechaInicio: '2026-01-01'` y `fechaFin: '2026-01-31'`

### T1.5 — Regenerar artefactos de contrato (orden estricto)

- [ ] Desde `backend/`: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" pnpm run openapi:dump` → actualiza `backend/openapi.json`
  - Verificar que `GET /periodos` ya no es `{}` y declara `PeriodoFiscalResponseDto` con `fechaInicio`/`fechaFin`
- [ ] Desde `frontend/`: `pnpm run gen:api-types` → actualiza `frontend/src/types/api.generated.ts`

### T1.6 — Sincronizar `frontend/src/types/api.ts` — eliminar campos fantasma

- **Archivo**: `frontend/src/types/api.ts`
- [ ] Localizar el tipo `Periodo` (actualmente hand-written con `fechaInicio`/`fechaFin` marcados como "client-only")
- [ ] **OVERRIDE Camino B**: El backend NO proyecta esos campos → el tipo generado NO los tendrá → convertir `Periodo` a alias del generado: `export type Periodo = Schemas['PeriodoFiscalResponseDto']`
- [ ] Eliminar el comentario `// el backend los proyecta` (ya no aplica) y el bloque hand-written
- [ ] Verificar que `Gestion` / `GestionConPeriodos` siguen siendo client-only (fuera de scope, NO tocar)
- [ ] `pnpm exec tsc -b` desde `frontend/` → 0 errores

### T1.7 — Verificar contract-drift verde

- [ ] Desde raíz: `git diff backend/openapi.json frontend/src/types/api.generated.ts` → sin cambios pendientes
- [ ] O correr el job de CI localmente: `pnpm run gen:api-types && git diff --exit-code frontend/src/types/api.generated.ts`

---

## Slice 2 — Funciones puras frontend

> **Dependencia**: ninguna (paralelo con Slice 1 si se trabaja en ramas; en apply secuencial va después de Slice 1).
> **Por qué antes del componente**: el componente (Slice 3) las importa.

### T2.1 — Test de `calcularRangoGestionISO` (NUEVO, test primero)

- **Archivo test**: `frontend/src/features/periodos-fiscales/lib/calcular-rango-gestion-iso.test.ts` (crear)
- **Casos**:
  - [ ] `mesInicio=1, year=2026` → `{ fechaInicio: '2026-01-01', fechaFin: '2026-12-31' }`
  - [ ] `mesInicio=4, year=2026` (empresa industrial, cierre en marzo) → `{ fechaInicio: '2026-04-01', fechaFin: '2027-03-31' }`
  - [ ] `mesInicio=2, year=2024` → gestión feb2024–ene2025, `fechaFin: '2025-01-31'`
  - [ ] Cruce de año con bisiesto: `mesInicio=3, year=2024` → `fechaFin` del último mes (febrero 2025) = `'2025-02-28'` (2025 no bisiesto)
  - [ ] `mesInicio=12, year=2026` → `{ fechaInicio: '2026-12-01', fechaFin: '2027-11-30' }`
  - [ ] Validación: `mesInicio` fuera de 1-12 lanza error

> Test escrito → rojo → implementar T2.2 → verde.

### T2.2 — Implementar `calcularRangoGestionISO`

- **Archivo**: `frontend/src/features/periodos-fiscales/lib/calcular-rango-gestion-iso.ts` (crear)
- [ ] Función pura `calcularRangoGestionISO(year: number, mesInicio: number): { fechaInicio: string; fechaFin: string }`
- [ ] Calcula el primer día: `YYYY-MM-01` (padding manual, sin `new Date()` para el cálculo)
- [ ] Helper interno `diasEnMes(year, month)`: regla bisiesta gregoriana (año bisiesto = divisible por 4, excepto centenarios no divisibles por 400) — espeja `RangoPeriodoFiscal` del backend (comentar referencia: `// Espeja backend/src/periodos-fiscales/domain/rango-periodo-fiscal.ts (§4.6)`)
- [ ] Calcula el último mes de la gestión: `mesCierre = mesInicio === 1 ? 12 : mesInicio - 1`, `yearCierre = mesInicio === 1 ? year : year + 1`
- [ ] Calcula `fechaFin`: `${yearCierre}-${padMes(mesCierre)}-${diasEnMes(yearCierre, mesCierre)}`
- [ ] Sin imports de React ni IO — función pura exportable

### T2.3 — Ampliar tests de `fecha-actual.ts` (ACTUALIZAR)

- **Archivo test**: `frontend/src/lib/fecha-actual.test.ts` (ampliar sección existente)
- **Casos nuevos** (con clock inyectado — `() => new Date('YYYY-MM-DDTHH:mm:ss')`):
  - [ ] `primerDiaDelMesISO(() => new Date('2026-04-15T10:00:00'))` → `'2026-04-01'`
  - [ ] `primerDiaDelMesISO(() => new Date('2026-01-31T23:59:59'))` → `'2026-01-01'`
  - [ ] `ultimoDiaDelMesISO(() => new Date('2026-04-15T10:00:00'))` → `'2026-04-30'`
  - [ ] `ultimoDiaDelMesISO(() => new Date('2024-02-10T00:00:00'))` → `'2024-02-29'` (bisiesto)
  - [ ] `ultimoDiaDelMesISO(() => new Date('2026-02-10T00:00:00'))` → `'2026-02-28'` (no bisiesto)
  - [ ] `rangoMesAnteriorISO(() => new Date('2026-01-15T10:00:00'))` → `{ fechaDesde: '2025-12-01', fechaHasta: '2025-12-31' }` (cruce de año)
  - [ ] `rangoMesAnteriorISO(() => new Date('2026-06-01T00:00:00'))` → `{ fechaDesde: '2026-05-01', fechaHasta: '2026-05-31' }`
  - [ ] Borde de medianoche La Paz vs UTC: instante `2026-06-01T04:30:00Z` (04:30 UTC = 00:30 La Paz, aún junio) → `primerDiaDelMesISO` devuelve `'2026-06-01'` (confirma que usa La Paz)
  - [ ] Instante `2026-05-31T23:30:00Z` (23:30 UTC = 19:30 La Paz, aún mayo) → `rangoMesAnteriorISO` devuelve mes de abril

> Tests escritos → rojos → implementar T2.4 → verdes.

### T2.4 — Implementar helpers de mes en `fecha-actual.ts`

- **Archivo**: `frontend/src/lib/fecha-actual.ts` (ampliar)
- [ ] `export function primerDiaDelMesISO(clock = () => new Date()): string` — obtiene año/mes de La Paz, devuelve `${year}-${padMes(month)}-01`
- [ ] `export function ultimoDiaDelMesISO(clock = () => new Date()): string` — reusa `diasEnMes` interno (misma regla bisiesta), devuelve `${year}-${padMes(month)}-${dias}`
- [ ] `export function rangoMesAnteriorISO(clock = () => new Date()): { fechaDesde: string; fechaHasta: string }` — calcula mes anterior por aritmética de enteros (si `month===1` → `{year-1, 12}`), sin aritmética de días para el mes-1
- [ ] Helper interno `diasEnMes(year, month)` compartido con `calcularRangoGestionISO` o replicado con comentario (mismo algoritmo bisiesto gregoriano)
- [ ] Todos usan `Intl.DateTimeFormat` solo para obtener "hoy en La Paz" (igual que `hoyEnLaPazISO` existente), el resto es aritmética de enteros

---

## Slice 3 — Componente compartido `PeriodoGestionFiltro` (reescritura)

> **Dependencia**: Slice 2 (usa `calcularRangoGestionISO` + helpers de mes).
> **No depende de Slice 1** (Camino B: ya no usa `fechaInicio`/`fechaFin` del backend).

### T3.1 — Reescribir tests del componente compartido (test primero)

- **Archivo**: `frontend/src/components/shared/periodo-gestion-filtro.test.tsx` (reescritura completa)
- **Setup**: mockear `@/lib/fecha-actual` para fijar "hoy" a una fecha conocida (ej. `2026-06-15`); mockear `useGestiones` con fixtures deterministas; NO mockear `usePeriodos` (ya no se usa)
- **Tests obligatorios**:
  - [ ] **TEST DE REGRESIÓN del bug**: gestión ABIERTA 2026 (`mesInicio=1`), preset default "Esta gestión" → `onChange` recibe `{ fechaDesde: '2026-01-01', fechaHasta: '2026-12-31' }` (no vacío, no undefined)
  - [ ] Default al montar: preset = "Esta gestión", onChange emitido con rango no-vacío
  - [ ] Preset "Gestión anterior" con gestión 2025 existente → emite rango correcto
  - [ ] Preset "Gestión anterior" sin gestión previa → opción deshabilitada, NO emite onChange
  - [ ] Preset "Este mes" (clock mockeado a 2026-06-15) → `fechaDesde='2026-06-01'`, `fechaHasta='2026-06-30'`
  - [ ] Preset "Mes anterior" (clock mockeado a 2026-06-15) → `fechaDesde='2026-05-01'`, `fechaHasta='2026-05-31'`
  - [ ] Preset "Mes anterior" en enero (clock mockeado a 2026-01-15) → `fechaDesde='2025-12-01'`, `fechaHasta='2025-12-31'`
  - [ ] Preset "Personalizado": NO emite onChange al montar (fechas vacías → enabled=false)
  - [ ] Editar input Hasta → preset cambia a "Personalizado", Desde preservado
  - [ ] Editar input Desde → preset cambia a "Personalizado", Hasta preservado
  - [ ] Seleccionar preset DESPUÉS de editar a mano → preset resuelve y sobreescribe
  - [ ] Estado "no hay gestiones": mensaje de error/vacío preservado
  - [ ] Estado "cargando gestiones": estado de carga preservado
  - [ ] Empresa con `mesInicio=4, year=2026`: preset "Esta gestión" → `fechaDesde='2026-04-01'`, `fechaHasta='2027-03-31'`
  - [ ] Validación Desde > Hasta: onChange no se emite

> Tests escritos → rojos → implementar T3.2 → verdes.

### T3.2 — Reescribir `periodo-gestion-filtro.tsx`

- **Archivo**: `frontend/src/components/shared/periodo-gestion-filtro.tsx` (reescritura)
- **Nuevo contrato de salida**:
  - [ ] Definir `export interface RangoFechas { fechaDesde: string; fechaHasta: string }`
  - [ ] Props: `onChange: (rango: RangoFechas) => void; value?: RangoFechas` (o sin value si es uncontrolled)
- **Estado interno**:
  - [ ] `const [preset, setPreset] = useState<Preset>('esta-gestion')`
  - [ ] `const [fechaDesde, setFechaDesde] = useState('')`
  - [ ] `const [fechaHasta, setFechaHasta] = useState('')`
  - [ ] Type `Preset = 'esta-gestion' | 'gestion-anterior' | 'este-mes' | 'mes-anterior' | 'personalizado'`
- **Handler `handlePresetChange`** (NO useEffect para derivar — Anti-F-02):
  - [ ] Resuelve el rango del preset llamando a `resolverPreset(preset, gestiones, hoy)`
  - [ ] Hace `setFechaDesde(r.fechaDesde); setFechaHasta(r.fechaHasta); setPreset(nuevo)` todo en el handler
- **Handler `handleFechaDesdeChange` / `handleFechaHastaChange`**:
  - [ ] `setFechaDesde(v); setPreset('personalizado')` — editar a mano SIEMPRE fuerza "Personalizado"
- **`resolverPreset` (función pura interna o en lib)**:
  - [ ] `'esta-gestion'`: `calcularRangoGestionISO(gEfectiva.year, gEfectiva.mesInicio)` → `{ fechaDesde: rangoGestion.fechaInicio, fechaHasta: rangoGestion.fechaFin }`
  - [ ] `'gestion-anterior'`: gestión con `year < gEfectiva.year` (primera de la lista ordenada DESC) → `calcularRangoGestionISO`; si no existe → null
  - [ ] `'este-mes'`: `{ fechaDesde: primerDiaDelMesISO(), fechaHasta: ultimoDiaDelMesISO() }`
  - [ ] `'mes-anterior'`: `rangoMesAnteriorISO()` → `{ fechaDesde, fechaHasta }`
  - [ ] `'personalizado'`: usar `{ fechaDesde, fechaHasta }` del state
- **`useMemo` de emisión** (patrón actual preservado):
  - [ ] `rangoResuelto = useMemo(...)` — deriva el rango a emitir (para "personalizado": usa state; para otros: re-resuelve el preset)
  - [ ] `useRef ultimaFirma` + 1 `useEffect` que compara JSON y llama `onChange(rangoResuelto)`
- **Eliminar**:
  - [ ] `usePeriodos` (ya no se usa)
  - [ ] Select de gestión y select de mes
  - [ ] Toggle "rango personalizado"
  - [ ] Discriminante `modo:'periodo'`
- **UI**:
  - [ ] `<Select>` de Preset con 5 opciones; opción "Gestión anterior" deshabilitada si no hay gestión previa (con `disabled` + tooltip Radix)
  - [ ] Dos `<Input type="date">` Desde/Hasta SIEMPRE visibles
  - [ ] Mensaje de error si Desde > Hasta
  - [ ] Mobile: inputs `text-base md:text-sm`
- **Exports**:
  - [ ] Exportar `RangoFechas` para que los 6 features lo importen

---

## Slice 4 — Piloto: libro-diario

> **Dependencia**: Slices 1, 2 y 3 completados.
> **Por qué es el piloto**: es el feature más completo (tiene `cuentaId` + `keepPreviousData`). Sirve de molde validado para el fan-out.

### T4.1 — Simplificar schema libro-diario (test primero)

- **Archivo test**: `frontend/src/features/libro-diario/schemas/libro-diario-filtro-schema.test.ts` (actualizar)
- [ ] Quitar asserts de `modo:'periodo'` y `periodoFiscalId` (esos casos ya no existen en el schema)
- [ ] Agregar assert: schema válido con `{ fechaDesde, fechaHasta, incluirAnulados }` pasa sin error
- [ ] Agregar assert: schema válido con `{ fechaDesde, fechaHasta, cuentaId: 'uuid-válido' }` pasa
- [ ] Agregar assert: `{ periodoFiscalId: 'uuid' }` sin `fechaDesde`/`fechaHasta` FALLA (campo eliminado)
- [ ] Agregar assert: `fechaDesde > fechaHasta` falla con mensaje de error de rango

> Tests actualizados → rojos → actualizar schema → verdes.

- **Archivo**: `frontend/src/features/libro-diario/schemas/libro-diario-filtro-schema.ts` (actualizar)
- [ ] Eliminar `z.discriminatedUnion('modo', [...])`
- [ ] Schema plano: `z.object({ fechaDesde: fechaContableZod, fechaHasta: fechaContableZod, incluirAnulados: z.boolean().optional().default(false), cuentaId: z.string().uuid().optional() }).refine(d => d.fechaDesde <= d.fechaHasta, { message: "La fecha 'Desde' debe ser anterior o igual a 'Hasta'", path: ['fechaHasta'] })`

### T4.2 — Simplificar API handler libro-diario

- **Archivo**: `frontend/src/features/libro-diario/api/get-libro-diario.ts` (actualizar)
- [ ] Eliminar rama `if (filtros.modo === 'periodo')` / `periodoFiscalId`
- [ ] Siempre construir params con `fechaDesde`/`fechaHasta` (spread condicional para `cuentaId` e `incluirAnulados`)

### T4.3 — Simplificar hook libro-diario

- **Archivo**: `frontend/src/features/libro-diario/hooks/use-libro-diario.ts` (actualizar)
- [ ] `enabled = filtros !== null && filtros.fechaDesde !== '' && filtros.fechaHasta !== ''` (sin rama `periodoFiscalId`)
- [ ] Mantener `placeholderData: keepPreviousData`

### T4.4 — Actualizar componente de filtros libro-diario (test primero)

- **Archivo test**: `frontend/src/features/libro-diario/components/libro-diario-filtros.test.tsx` (actualizar)
- [ ] Quitar mock de `usePeriodos`
- [ ] Quitar asserts de `modo:'periodo'` / `periodoFiscalId`
- [ ] Assertar que "Consultar" llama `onBuscar({ fechaDesde, fechaHasta, incluirAnulados, cuentaId? })`
- [ ] Mantener tests de `incluirAnulados`, `cuentaId` (filtro de cuenta), validación rango

> Tests actualizados → rojos → actualizar componente → verdes.

- **Archivo**: `frontend/src/features/libro-diario/components/libro-diario-filtros.tsx` (actualizar)
- [ ] `useState<RangoFechas | null>(null)` (importar `RangoFechas` del componente compartido)
- [ ] `handleConsultar`: eliminar branch por `modo`; validar fechas no-vacías y `desde <= hasta`; llamar `onBuscar({ fechaDesde, fechaHasta, incluirAnulados, ...(cuentaId ? {cuentaId} : {}) })`
- [ ] JSX: `<PeriodoGestionFiltro onChange={setSeleccion} />` con nuevo contrato

---

## Slice 5 — Fan-out: los 5 features restantes

> **Dependencia**: Slice 4 (piloto) completado y verde.
> **PARALELIZABLE**: cada sub-tarea toca un conjunto disjunto de archivos. Se pueden implementar en paralelo.

> Patrón para libro-mayor: igual que piloto + mantiene `cuentaId` + `keepPreviousData` (idéntico al piloto).
> Patrón para balance-comprobacion / hoja-trabajo / flujo-efectivo / evolucion-patrimonio: no tienen `cuentaId`; `enabled: filtros !== null` (sin `keepPreviousData` si no lo tienen).

### T5.A — libro-mayor (paralelo)

- **Archivos a actualizar**:
  - [ ] `frontend/src/features/libro-mayor/schemas/libro-mayor-filtro-schema.test.ts` — mismo patrón T4.1 (schema plano, quitar modo:periodo, mantener cuentaId)
  - [ ] `frontend/src/features/libro-mayor/schemas/libro-mayor-filtro-schema.ts` — schema plano con `cuentaId` y `.refine`
  - [ ] `frontend/src/features/libro-mayor/api/get-libro-mayor.ts` — quitar rama periodoFiscalId
  - [ ] `frontend/src/features/libro-mayor/hooks/use-libro-mayor.ts` — enabled simplificado, mantener `keepPreviousData`
  - [ ] `frontend/src/features/libro-mayor/components/libro-mayor-filtros.test.tsx` — quitar mock usePeriodos + asserts modo:periodo
  - [ ] `frontend/src/features/libro-mayor/components/libro-mayor-filtros.tsx` — nuevo contrato `RangoFechas`

### T5.B — balance-comprobacion (paralelo)

- **Archivos a actualizar**:
  - [ ] `frontend/src/features/balance-comprobacion/schemas/balance-comprobacion-filtro-schema.test.ts`
  - [ ] `frontend/src/features/balance-comprobacion/schemas/balance-comprobacion-filtro-schema.ts`
  - [ ] `frontend/src/features/balance-comprobacion/api/get-balance-comprobacion.ts`
  - [ ] `frontend/src/features/balance-comprobacion/hooks/use-balance-comprobacion.ts`
  - [ ] `frontend/src/features/balance-comprobacion/components/balance-comprobacion-filtros.test.tsx`
  - [ ] `frontend/src/features/balance-comprobacion/components/balance-comprobacion-filtros.tsx`

### T5.C — hoja-trabajo (paralelo)

- **Archivos a actualizar**:
  - [ ] `frontend/src/features/hoja-trabajo/schemas/hoja-trabajo-filtro-schema.test.ts`
  - [ ] `frontend/src/features/hoja-trabajo/schemas/hoja-trabajo-filtro-schema.ts`
  - [ ] `frontend/src/features/hoja-trabajo/api/get-hoja-trabajo.ts`
  - [ ] `frontend/src/features/hoja-trabajo/hooks/use-hoja-trabajo.ts`
  - [ ] `frontend/src/features/hoja-trabajo/components/hoja-trabajo-filtros.test.tsx`
  - [ ] `frontend/src/features/hoja-trabajo/components/hoja-trabajo-filtros.tsx`

### T5.D — flujo-efectivo (paralelo)

- **Archivos a actualizar**:
  - [ ] `frontend/src/features/flujo-efectivo/schemas/flujo-efectivo-filtro-schema.test.ts`
  - [ ] `frontend/src/features/flujo-efectivo/schemas/flujo-efectivo-filtro-schema.ts`
  - [ ] `frontend/src/features/flujo-efectivo/api/get-flujo-efectivo.ts`
  - [ ] `frontend/src/features/flujo-efectivo/hooks/use-flujo-efectivo.ts`
  - [ ] `frontend/src/features/flujo-efectivo/components/flujo-efectivo-filtros.test.tsx`
  - [ ] `frontend/src/features/flujo-efectivo/components/flujo-efectivo-filtros.tsx`

### T5.E — evolucion-patrimonio (paralelo)

- **Archivos a actualizar**:
  - [ ] `frontend/src/features/evolucion-patrimonio/schemas/evolucion-patrimonio-filtro-schema.test.ts`
  - [ ] `frontend/src/features/evolucion-patrimonio/schemas/evolucion-patrimonio-filtro-schema.ts`
  - [ ] `frontend/src/features/evolucion-patrimonio/api/get-evolucion-patrimonio.ts`
  - [ ] `frontend/src/features/evolucion-patrimonio/hooks/use-evolucion-patrimonio.ts`
  - [ ] `frontend/src/features/evolucion-patrimonio/components/evolucion-patrimonio-filtros.test.tsx`
  - [ ] `frontend/src/features/evolucion-patrimonio/components/evolucion-patrimonio-filtros.tsx`

---

## Slice 6 — Verificación final

> **Dependencia**: Slices 1-5 completados.

### T6.1 — Typecheck y lint

- [ ] Desde `backend/`: `pnpm exec tsc --noEmit -p tsconfig.json` → 0 errores
- [ ] Desde `backend/`: `pnpm run lint` → 0 errores
- [ ] Desde `frontend/`: `pnpm exec tsc -b` → 0 errores
- [ ] Desde `frontend/`: `pnpm run lint` → 0 errores

### T6.2 — Suite de tests completa

- [ ] Desde `backend/`: `pnpm exec jest src/` → todos los tests unitarios verdes (incluye T1.1)
- [ ] Desde `backend/` con `DATABASE_URL`: `pnpm exec jest test/ --runInBand --forceExit` → E2E verdes (incluye T1.4)
- [ ] Desde `frontend/`: `pnpm exec vitest run` → suite completa verde (incluye T2.1, T2.3, T3.1, T4.1, T4.4, T5.A-E)

### T6.3 — Contract-drift verde

- [ ] `pnpm run gen:api-types && git diff --exit-code frontend/src/types/api.generated.ts` desde raíz → sin diferencias

### T6.4 — Smoke manual (Marco) — checklist §7

> Estas verificaciones son manuales. Anotar resultado en este task.

- [ ] Resolución 375px (mobile): Select de preset + inputs Desde/Hasta se ven y funcionan
- [ ] Resolución 768px (tablet): layout correcto
- [ ] Resolución 1440px (desktop): layout correcto
- [ ] Dark mode: colores correctos en Select y inputs
- [ ] Libro Diario: preset "Esta gestión" → consulta dispara con fechas correctas (no 400)
- [ ] EEPN: preset "Esta gestión" → consulta dispara (bug de regresión crítico — no 400)
- [ ] Libro Mayor: preset "Esta gestión" → query dispara (antes nunca disparaba)
- [ ] Preset "Gestión anterior" sin gestión previa → opción deshabilitada visible
- [ ] Editar fecha a mano → preset muestra "Personalizado"
- [ ] Desde > Hasta → mensaje de error visible, consulta bloqueada

---

## Resumen

| Slice | Tareas | Paralelizable |
|-------|--------|--------------|
| 1 — Backend contrato | T1.1, T1.2, T1.3, T1.4, T1.5, T1.6, T1.7 (7 tareas) | No (secuencial) |
| 2 — Funciones puras | T2.1, T2.2, T2.3, T2.4 (4 tareas) | No internamente; paralelo con Slice 1 si hay 2 implementadores |
| 3 — Componente compartido | T3.1, T3.2 (2 tareas grandes) | No (depende de Slice 2) |
| 4 — Piloto libro-diario | T4.1, T4.2, T4.3, T4.4 (4 tareas) | No (depende de Slices 1-3) |
| 5 — Fan-out 5 features | T5.A, T5.B, T5.C, T5.D, T5.E (5 sub-tareas, 6 archivos c/u) | **SÍ — entre sí** (dependen de Slice 4) |
| 6 — Verificación final | T6.1, T6.2, T6.3, T6.4 (4 tareas) | Parcial (T6.1-T6.3 en secuencia; T6.4 manual) |

**Total**: ~26 tareas atómicas.

**Ruta crítica**: Slice 1 → Slice 2 → Slice 3 → Slice 4 → Slice 5 (paralelo) → Slice 6.

**Archivo de test de regresión clave** (el que cierra el bug):
`frontend/src/components/shared/periodo-gestion-filtro.test.tsx` → test "Default al montar: gestión ABIERTA emite rango no-vacío" (en T3.1).

**Archivos nuevos a crear** (no existían):
- `backend/src/periodos-fiscales/dto/periodo-fiscal-response.dto.spec.ts`
- `frontend/src/features/periodos-fiscales/lib/calcular-rango-gestion-iso.ts`
- `frontend/src/features/periodos-fiscales/lib/calcular-rango-gestion-iso.test.ts`
