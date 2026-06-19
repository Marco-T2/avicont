# Design: Filtro de Período con Presets (QuickBooks-style)

<!--
Artifact: design
Change: filtro-periodo-presets
Fecha: 2026-06-19
Status: READY-FOR-APPLY
Decisiones: FIRMES (guían apply con Strict TDD)
-->

## 0. Correcciones a supuestos del orquestador (verificadas en código)

Antes de diseñar, dos supuestos del prompt se verificaron FALSOS contra el código real:

1. **"flujo-efectivo/EEPN traducen a `desde`/`hasta` en su capa api"** → **FALSO.**
   `get-flujo-efectivo.ts` y `get-evolucion-patrimonio.ts` envían `params.fechaDesde`/
   `params.fechaHasta` (verbatim, líneas 23-24 / 23-24). NO existe traducción a
   `desde`/`hasta`. Los 6 features usan `fechaDesde`/`fechaHasta` de punta a punta
   (coincide con Gap 4 de la exploración). **No hay nada que "preservar" — el diseño
   unifica `fechaDesde`/`fechaHasta` y punto.**

2. **El tipo `Periodo` en `api.ts` "miente" declarando `fechaInicio`/`fechaFin`** → cierto,
   pero el tipo YA los declara (líneas 524-526) con el comentario `// el backend los
   proyecta en la response`. La deuda es que el backend NO los proyecta todavía. Tras el
   fix backend, el tipo hand-written queda CORRECTO sin tocarlo. Igual lo sincronizamos
   (paso backend) por disciplina de contrato.

---

## 1. Backend — fundación (sin migración)

### 1.1 DTO + mapper (diff exacto)

`backend/src/periodos-fiscales/dto/periodo-fiscal-response.dto.ts`:

```ts
// + import al tope:
import { RangoPeriodoFiscal } from '../domain/rango-periodo-fiscal';

// + 2 @ApiProperty en la clase (después de `month`, junto a las fechas de dominio):
@ApiProperty({ example: '2026-04-01', description: 'Primer día del mes calendario (YYYY-MM-DD, §4.6)' })
fechaInicio!: string;
@ApiProperty({ example: '2026-04-30', description: 'Último día del mes calendario (YYYY-MM-DD, §4.6)' })
fechaFin!: string;

// + 2 líneas en toPeriodoResponse (clona obtenerResumenPrecierre service:92-93):
export function toPeriodoResponse(p: PeriodoFiscal): PeriodoFiscalResponseDto {
  const rango = RangoPeriodoFiscal.of(p.year, p.month);
  return {
    ...campos existentes...,
    fechaInicio: rango.inicio(),  // YYYY-MM-01, aritmético puro, sin new Date()
    fechaFin: rango.fin(),        // YYYY-MM-DD (bisiesto correcto), sin new Date()
  };
}
```

**Confirmado**: `service.listar` devuelve filas `PeriodoFiscal` de Prisma → tienen `year`
y `month` (no-null por schema). `RangoPeriodoFiscal.of(year, month)` valida 1-12 y NO usa
`Date` (cumple §4.6). Cero riesgo de timezone.

**SIN migración**: `fechaInicio`/`fechaFin` son derivadas en cómputo, no columnas.

### 1.2 Controller — `@ApiOkResponse`

`periodos-fiscales.controller.ts` NO tiene ningún `@ApiOkResponse` hoy. Decorar los
**4 endpoints que devuelven `PeriodoFiscalResponseDto`** (cierra la deuda de contrato del
`Periodo`, sin costo extra):

| Método | Decorador |
|--------|-----------|
| `listar` (`GET /periodos`) — **el mínimo obligatorio** | `@ApiOkResponse({ type: [PeriodoFiscalResponseDto] })` |
| `obtener` (`GET /periodos/:id`) | `@ApiOkResponse({ type: PeriodoFiscalResponseDto })` |
| `cerrar` (`POST /periodos/:id/cerrar`) | `@ApiOkResponse({ type: PeriodoFiscalResponseDto })` |
| `reabrir` / `marcarDefinitivo` | `@ApiOkResponse({ type: PeriodoFiscalResponseDto })` |

`resumen` devuelve `ResumenPrecierre` (interface, no DTO decorado) → **NO se toca** (fuera de
scope; mantenemos el cambio acotado a lo que proyecta fechas).

### 1.3 Regeneración de contrato (orden estricto)

Desde `backend/`:
1. `pnpm run openapi:dump` → actualiza `backend/openapi.json` (ahora `GET /periodos` deja de
   ser `{}` y declara `PeriodoFiscalResponseDto` con `fechaInicio`/`fechaFin`).
2. Desde `frontend/`: `pnpm run gen:api-types` → actualiza `frontend/src/types/api.generated.ts`.
3. `frontend/src/types/api.ts`: el tipo `Periodo` hand-written ya tiene los campos
   (líneas 514-529). Sincronizar = confirmar que coincide con el schema generado. Como ahora
   `PeriodoFiscalResponseDto` SÍ entra al OpenAPI, **migrar `Periodo` a alias del generado**
   (`export type Periodo = Schemas['PeriodoFiscalResponseDto']`) y borrar el comentario
   "client-only" que aplicaba a `Periodo` (dejarlo solo para `Gestion`/`GestionConPeriodos`,
   que siguen sin `@ApiOkResponse` — fuera de scope, R3 de la exploración).
4. Job CI `contract-drift` debe quedar verde (dump + gen + `git diff --exit-code`).

---

## 2. Frontend — modelo de estado del componente compartido

### 2.1 Nuevo contrato de salida

`PeriodoSeleccion` deja de ser XOR. **SIEMPRE** emite rango:

```ts
// Antes: { modo:'periodo'; periodoFiscalId } | { modo:'rango'; fechaDesde; fechaHasta }
// Ahora:
export interface RangoFechas {
  fechaDesde: string; // YYYY-MM-DD, puede ser '' si el preset no resolvió
  fechaHasta: string;
}
```

El componente emite `onChange(rango: RangoFechas)`. Se elimina `modo` por completo del
contrato del componente y, en cascada, de los 6 schemas (ver §4).

### 2.2 Estado interno + máquina preset↔fechas

Presets: `'esta-gestion' | 'gestion-anterior' | 'este-mes' | 'mes-anterior' | 'personalizado'`.

Estado interno (3 piezas de `useState`, cero `setState`-en-efecto — respeta Anti-F-02):

```ts
const [preset, setPreset] = useState<Preset>('esta-gestion'); // default
const [fechaDesde, setFechaDesde] = useState('');
const [fechaHasta, setFechaHasta] = useState('');
```

**Las fechas son el ESTADO DE VERDAD; el preset es un acelerador.** Máquina:

- **Seleccionar un preset** (handler `handlePresetChange`): resuelve el rango del preset
  (§3) y hace `setFechaDesde(r.fechaDesde); setFechaHasta(r.fechaHasta); setPreset(nuevo)`.
  Todo en el handler del `onValueChange` del Select — NO en efecto.
- **Editar un input de fecha** (handler `handleFechaDesdeChange` / `handleFechaHastaChange`):
  `setFechaDesde(v); setPreset('personalizado')`. Editar a mano SIEMPRE fuerza
  "Personalizado". (No intentamos "re-detectar" si las fechas tipeadas coinciden con un
  preset: es complejidad innecesaria; el contador que tipea quiere control manual.)

**Default al montar**: `preset='esta-gestion'`. El rango se resuelve en el `useMemo` de
resolución (§2.3) en cuanto los datos de gestión están cargados. Las fechas arrancan `''` y
el `useMemo` las llena vía el path de resolución — NO se setean en efecto.

> **Decisión clave (modelo de estado):** el preset y las fechas son estados independientes
> en `useState`. El preset se mueve a `'personalizado'` SOLO por edición manual de inputs.
> El rango emitido se DERIVA (`useMemo`) priorizando: si `preset==='personalizado'` → usar
> `fechaDesde/fechaHasta` del state; si no → resolver el preset contra los datos cargados.
> Esto evita el bug actual (rango undefined) porque el rango emitido nunca depende de un
> campo que el backend no manda.

### 2.3 Resolución y emisión (patrón actual preservado: `useMemo` + 1 `useEffect`)

```ts
const rangoResuelto: RangoFechas | null = useMemo(() => {
  if (preset === 'personalizado') {
    if (fechaDesde === '' || fechaHasta === '') return null; // aún incompleto
    return { fechaDesde, fechaHasta };
  }
  return resolverPreset(preset, gestionesOrdenadas, periodosDeLaGestion, hoyEnLaPazISO());
  // resolverPreset puede devolver null si falta data o no hay período (§3.4)
}, [preset, fechaDesde, fechaHasta, gestionesOrdenadas, periodosDeLaGestion]);

const ultimaFirma = useRef('');
useEffect(() => {
  if (rangoResuelto === null) return;
  const firma = JSON.stringify(rangoResuelto);
  if (ultimaFirma.current === firma) return;
  ultimaFirma.current = firma;
  onChange(rangoResuelto);
}, [rangoResuelto]); // onChange estable por contrato (igual que hoy)
```

**Importante**: cuando se selecciona un preset, el handler también setea `fechaDesde/fechaHasta`
en state (para que los inputs muestren las fechas resueltas y sean editables). Pero el `useMemo`
para presets NO lee esas fechas del state — las RE-resuelve. Esto evita una carrera: el input
refleja la resolución, pero la verdad emitida viene del cálculo puro. El `setFecha*` en el
handler de preset es presentación (poblar el input visible), no fuente de verdad.

---

## 3. Resolución de presets a fechas — SIN aritmética de calendario

Principio rector: **derivar fechas de los `fechaInicio`/`fechaFin` que el backend ya calculó
por período NO es aritmética**; calcular fin de mes en el front SÍ lo es y se evita.

### 3.1 Datos disponibles en el componente

- `useGestiones()` → `Gestion[]` con `year`, `mesInicio`, `status` (confirmado: `get-gestiones`
  devuelve este shape). Ordenadas igual que hoy: `year DESC`, ABIERTA primero ante empate.
- `usePeriodos({ gestionId })` → `Periodo[]` de ESA gestión, ahora CON `fechaInicio`/`fechaFin`
  reales (tras fix backend). El componente carga los períodos de la **gestión efectiva**.

### 3.2 Qué gestión carga el componente

El componente mantiene `gestionId` derivado (como hoy: elegida o la más reciente). Para los
presets de gestión necesitamos los períodos de DOS gestiones (actual y anterior). Decisión:

> **Decisión (qué períodos cargar):** el componente carga los períodos de la **gestión
> efectiva seleccionada** vía `usePeriodos({ gestionId })`. Los presets "Esta gestión",
> "Este mes" y "Mes anterior" resuelven contra ESA gestión. "Gestión anterior" NO requiere
> cargar otra lista de períodos: se resuelve por **aritmética sobre los `fechaInicio`/`fechaFin`
> que ya conocemos NO** — se resuelve eligiendo la gestión anterior y derivando su rango
> SIN un segundo `usePeriodos`. Ver §3.3.

Para evitar un segundo hook condicional (anti-pattern de hooks), "Esta gestión" / "Gestión
anterior" derivan su rango de los **períodos de la gestión efectiva** cuando el preset coincide
con ella, o de un helper puro cuando es otra gestión.

### 3.3 Función pura `calcularRangoGestionISO` (la elegida)

La exploración dudaba entre derivar de min/máx de períodos vs función pura. **Decisión: usar
función pura `calcularRangoGestionISO(year, mesInicio)` que delega en el MISMO algoritmo de
`RangoPeriodoFiscal`** (espejo frontend del value object backend). Razón:

- Una gestión tiene 12 períodos. El rango de la gestión = `inicio del 1er período` ..
  `fin del 12º período`. El 1er período es `(year, mesInicio)`; el 12º es el mes anterior a
  `mesInicio` del año siguiente (o mismo año si `mesInicio===1`).
- Derivar de min/máx de períodos exige cargar los 12 períodos de CADA gestión que se quiera
  resolver — imposible para "Gestión anterior" sin un segundo `usePeriodos`. La función pura
  resuelve cualquier gestión solo con `year + mesInicio` (que `useGestiones` ya trae).
- **`calcularRangoGestionISO` NO es "aritmética de calendario riesgosa"**: clona la lógica de
  bisiestos YA probada en `RangoPeriodoFiscal` (días-del-mes gregoriano). Es el MISMO cálculo
  que el backend hace y que está cubierto por tests. Replicarlo en una función pura testeada
  del front es aceptable y es la opción con MENOS hooks/condicionales.

```ts
// frontend/src/features/periodos-fiscales/lib/calcular-rango-gestion-iso.ts
// Espeja backend/src/periodos-fiscales/domain/rango-periodo-fiscal.ts (§4.6: enteros, sin Date).
export function calcularRangoGestionISO(
  year: number,
  mesInicio: number,
): { fechaInicio: string; fechaFin: string } {
  // mesInicio (1-12). 1er día del mesInicio del year.
  // último día del (mesInicio-1) del year+1 (o mismo year si mesInicio===1).
  // diasEnMes con regla bisiesta gregoriana, padding manual. Sin new Date().
}
```

- **"Esta gestión"** = `calcularRangoGestionISO(gestionEfectiva.year, gestionEfectiva.mesInicio)`.
- **"Gestión anterior"** = elegir la gestión inmediatamente previa por `year` (la siguiente en
  `gestionesOrdenadas` que tenga `year < gestionEfectiva.year`; si no existe → null, ver §3.4)
  y aplicar `calcularRangoGestionISO`.

### 3.4 "Este mes" / "Mes anterior" — la decisión más delicada

Hoy (en La Paz, vía `hoyEnLaPazISO`) → extraer `year` y `month` (slice de la string ISO, sin
`Date`). Para "Mes anterior": `month===1 ? {year-1, 12} : {year, month-1}` (resta de enteros,
no aritmética de calendario de días).

**El problema: ¿de qué fechas saco el rango del mes?** Dos caminos:

**Camino A (preferido por el orquestador): copiar fechas del período backend.**
Buscar en `periodosDeLaGestion` el período con `(year, month)` == el mes objetivo y copiar su
`fechaInicio`/`fechaFin`. PROBLEMA: el componente solo carga los períodos de la gestión
EFECTIVA. El mes de "hoy" puede caer en otra gestión (empresa con `mesInicio≠1`), o la org
puede no haber creado el período aún.

**Camino B: calcular el rango del mes con un helper puro de lib.**
`primerDiaDelMesISO(clock)` = `${año}-${mm}-01`; `ultimoDiaDelMesISO(clock)` = mismo cálculo de
días-del-mes gregoriano de `RangoPeriodoFiscal`.

> **DECISIÓN (Este mes / Mes anterior): Camino B con helper puro, NO copiar de períodos.**
>
> Justificación:
> 1. **Robustez**: "Este mes" debe funcionar SIEMPRE, aun si la org no creó el período del
>    mes actual o si hoy cae fuera de la gestión efectiva. Copiar de períodos lo haría fallar
>    silenciosamente (el bug que este change vino a MATAR). Un preset que a veces resuelve a
>    `null` es peor UX que uno que siempre da el mes correcto.
> 2. **No viola §4.6**: §4.6 prohíbe `new Date()` en `domain/` y `*.service.ts` del BACKEND, y
>    exige fecha-contable calendario-puro. Estos helpers viven en `frontend/src/lib/` (capa de
>    PRESENTACIÓN), NO calculan una fecha contable que se persista — calculan el rango que va
>    como filtro de consulta. Producen YYYY-MM-DD aritmético puro (enteros, padding manual,
>    bisiesto gregoriano), SIN `Date` para el cálculo de días. `hoyEnLaPazISO` ya usa `Intl`
>    solo para obtener "hoy en La Paz" — eso es correcto y ya está en el repo.
> 3. **Mínimo cálculo**: reusa el algoritmo de bisiestos que ya existe (lo extraemos a una
>    función compartible o lo replicamos cubierto por tests). El front NO inventa nada nuevo
>    de calendario que el backend no haga ya.
>
> **Fallback observable**: NO hay fallback "deshabilitar preset" — "Este mes"/"Mes anterior"
> SIEMPRE resuelven a un rango válido (no dependen de que exista el período en BD). Si el
> backend recibe un rango sin comprobantes, devuelve resultado vacío (estado vacío de cada
> reporte, ya cubierto). El único `null` posible en resolución es "Gestión anterior" cuando no
> hay gestión previa, o "Personalizado" con un input vacío — ambos manejados en §2.3.

**Helpers a agregar en `frontend/src/lib/fecha-actual.ts`** (junto a `hoyEnLaPazISO`,
`primerDiaDelAnioISO` ya existentes):

```ts
export function primerDiaDelMesISO(clock = () => new Date()): string; // {hoy}-{mm}-01
export function ultimoDiaDelMesISO(clock = () => new Date()): string;  // {hoy}-{mm}-{diasMes}
export function rangoMesAnteriorISO(clock = () => new Date()): { fechaDesde; fechaHasta };
```

Todos inyectan `clock` para tests deterministas. `diasEnMes` con regla bisiesta gregoriana
(copiada de `RangoPeriodoFiscal` con comentario que referencia el value object backend como
fuente de verdad — §4.6).

### 3.5 Tabla resumen de resolución

| Preset | Fuente | Resultado |
|--------|--------|-----------|
| Esta gestión | `calcularRangoGestionISO(gEfectiva.year, gEfectiva.mesInicio)` | rango completo gestión |
| Gestión anterior | gestión previa por year + `calcularRangoGestionISO`; null si no hay | rango completo gestión anterior |
| Este mes | `primerDiaDelMesISO`/`ultimoDiaDelMesISO` (clock La Paz) | mes calendario actual |
| Mes anterior | `rangoMesAnteriorISO` (clock La Paz) | mes calendario anterior |
| Personalizado | inputs del usuario; null si vacío | lo tipeado |

### 3.6 ¿Se elimina `usePeriodos` del componente?

**Decisión: SÍ, se elimina `usePeriodos` del componente compartido** (R6 de la exploración).
Con Camino B, ningún preset copia fechas de períodos individuales: gestión vía función pura,
mes vía helpers de lib. El componente solo necesita `useGestiones` (para year+mesInicio y para
el estado vacío "no hay gestiones"). Esto:
- Elimina una dependencia cross-feature y un request.
- Simplifica los mocks de tests (ya no se mockea `usePeriodos`).
- El select de "Mes puntual" desaparece (era lo que necesitaba los períodos); coherente con el
  modelo QuickBooks (un mes no listado se logra tipeando → Personalizado).

> Si en una iteración futura se quiere "copiar fechas exactas del período backend" para un mes
> que SÍ existe, se re-introduce `usePeriodos` como optimización — pero NO es necesario para
> cerrar el bug ni para el modelo QuickBooks.

### 3.7 UI resultante del componente

- Un `<Select>` de Preset (5 opciones, default "Esta gestión").
- Dos `<Input type="date">` Desde/Hasta SIEMPRE visibles y editables (no detrás de toggle).
- Se elimina: select de Gestión, select de Mes, toggle "Rango personalizado", `usePeriodos`.
- Si "Gestión anterior" no tiene gestión previa → la opción se deshabilita en el Select con
  tooltip "No hay gestión anterior" (afordancia §14.7; es navegación de preset, no acción
  destructiva, pero deshabilitar+tooltip es más honesto que ocultar).
- Estados vacío/carga de gestiones: se preservan tal cual (mensaje "No hay gestiones…",
  "Cargando gestiones…").
- Respeta mobile (§7): inputs `text-base md:text-sm`, labels arriba.

---

## 4. Simplificación de los 6 schemas / api / hooks

### 4.1 Schemas (`*-filtro-schema.ts`)

Eliminar el `z.discriminatedUnion('modo', [...])`. Queda un objeto plano:

```ts
export const libroDiarioFiltroSchema = z
  .object({
    fechaDesde: fechaContableZod,
    fechaHasta: fechaContableZod,
    incluirAnulados: z.boolean().optional().default(false),
    cuentaId: z.string().uuid().optional(), // solo libro-diario y libro-mayor
  })
  .refine((d) => d.fechaDesde <= d.fechaHasta, {
    message: 'La fecha de inicio no puede ser posterior a la fecha final',
    path: ['fechaHasta'],
  });
```

- `cuentaId` solo en libro-diario y libro-mayor (los otros 4 no lo tienen).
- `incluirAnulados` en los 6.
- Se borra la rama `modo:'periodo'` + `periodoFiscalId`.

### 4.2 API handlers (`get-*.ts`)

Eliminar la rama `if (filtros.modo === 'periodo')`. Siempre `fechaDesde`/`fechaHasta`:

```ts
// flujo-efectivo / EEPN (objeto params):
const params: Record<string, string | boolean> = {
  incluirAnulados: filtros.incluirAnulados,
  fechaDesde: filtros.fechaDesde,
  fechaHasta: filtros.fechaHasta,
};

// libro-diario / libro-mayor (spread condicional, mantienen cuentaId):
params: {
  ...(params.cuentaId !== undefined ? { cuentaId } : {}),
  fechaDesde: params.fechaDesde,
  fechaHasta: params.fechaHasta,
  ...(params.incluirAnulados === true ? { incluirAnulados: true } : {}),
}
```

El backend sigue aceptando `periodoFiscalId` (no se toca su contrato); la UI simplemente no
lo envía nunca. Confirmado: los 6 mandan `fechaDesde`/`fechaHasta` (NO `desde`/`hasta`).

### 4.3 Hooks (`use-*.ts`)

- **libro-diario / libro-mayor**: `enabled = fechaDesde !== undefined && fechaHasta !== undefined`
  (se cae la rama `periodoFiscalId`). `placeholderData: keepPreviousData` se MANTIENE.
- **balance-comprobacion / hoja-trabajo / flujo-efectivo / EEPN**: `enabled: filtros !== null`
  se mantiene tal cual (el `filtros` ya es el objeto plano o null).

### 4.4 Componentes de filtro (`*-filtros.tsx`)

Los 6 siguen el MISMO patrón (verificado en libro-diario y balance-comprobacion; el explore
confirma hoja-trabajo/EEPN idénticos): `useState<PeriodoSeleccion | null>` + `handleConsultar`
que mapea `modo`. Cambio en los 6:

- `useState<RangoFechas | null>(null)` (el nuevo contrato del componente).
- `handleConsultar`: elimina el branch por `modo`; valida fechas no-vacías y `desde <= hasta`;
  llama `onBuscar({ fechaDesde, fechaHasta, incluirAnulados, ...(cuentaId?) })`.
- El JSX que renderiza `<PeriodoGestionFiltro value={...} onChange={setSeleccion} error={error}/>`
  se mantiene (mismo contrato de props, distinto tipo de payload).

---

## 5. Plan de TESTS (Strict TDD — tests PRIMERO)

### 5.1 Backend

- `periodo-fiscal-response.dto.spec.ts` (**NUEVO**, unit del mapper):
  - `toPeriodoResponse` proyecta `fechaInicio='2026-04-01'`/`fechaFin='2026-04-30'` para abril.
  - Caso bisiesto: febrero 2024 → `fechaFin='2024-02-29'`; febrero 2026 → `'2026-02-28'`.
  - Diciembre → `fechaFin='YYYY-12-31'`.
  - Conserva todos los campos previos (no rompe el shape).
- `periodos-fiscales.e2e-spec.ts` (**ACTUALIZAR** test "GET /periodos lista los 12", línea 239):
  - Assertar que cada item tiene `fechaInicio`/`fechaFin` con formato YYYY-MM-DD y que el de
    enero es `2026-01-01`/`2026-01-31`.

### 5.2 Frontend — funciones puras (lo más barato, primero)

- `calcular-rango-gestion-iso.test.ts` (**NUEVO**):
  - `mesInicio=1, year=2026` → `2026-01-01` / `2026-12-31`.
  - `mesInicio=4, year=2026` (industrial) → `2026-04-01` / `2027-03-31`.
  - Cruce de año bisiesto en el mes de cierre.
- `fecha-actual.test.ts` (**AMPLIAR**) con `clock` inyectado:
  - `primerDiaDelMesISO(() => new Date('2026-04-15T10:00'))` → `2026-04-01`.
  - `ultimoDiaDelMesISO` abril → `2026-04-30`; febrero bisiesto → `2024-02-29`.
  - `rangoMesAnteriorISO` en enero → `2025-12-01`/`2025-12-31` (cruce de año).
  - Borde de medianoche La Paz vs UTC (un instante UTC del día siguiente que en La Paz aún es
    el mes anterior) → confirma que usa el día de La Paz.

### 5.3 Frontend — componente compartido (`periodo-gestion-filtro.test.tsx`, REESCRITURA)

Inyección de "hoy": mockear `@/lib/fecha-actual` o pasar las gestiones de modo que el clock
real no importe para los presets de gestión; para "Este mes"/"Mes anterior" mockear
`hoyEnLaPazISO`/helpers con `vi.mock`. Quitar el mock de `usePeriodos` (ya no se usa).

- **Default al montar**: preset "Esta gestión" → emite el rango completo de la gestión más
  reciente (year DESC, ABIERTA primero). **Este es el test de REGRESIÓN del bug**: sobre una
  gestión ABIERTA emite `{ fechaDesde, fechaHasta }` NO vacíos.
- Cada preset rellena fechas correctas:
  - "Esta gestión" / "Gestión anterior" → rango de la función pura.
  - "Este mes" / "Mes anterior" → rango de los helpers (con clock mockeado a una fecha fija).
- "Gestión anterior" sin gestión previa → opción deshabilitada (no emite null silencioso).
- **Editar un input de fecha → preset pasa a "Personalizado"** y emite el rango tipeado.
- Seleccionar preset DESPUÉS de editar a mano → vuelve a resolver el preset (sobreescribe).
- Estados vacío ("no hay gestiones") y carga se preservan.

### 5.4 Frontend — los 6 `*-filtros.test.tsx` (ACTUALIZAR)

Para cada uno (libro-diario, libro-mayor, balance-comprobacion, hoja-trabajo, flujo-efectivo,
evolucion-patrimonio):
- Quitar asserts de `modo:'periodo'` y de `periodoFiscalId`.
- Quitar el mock de `usePeriodos` (el componente ya no lo usa).
- Assertar que "Consultar" llama `onBuscar({ fechaDesde, fechaHasta, incluirAnulados, ... })`
  (objeto plano, sin `modo`).
- Mantener tests de toggles propios (incluirAnulados, cuentaId donde aplique) y de validación
  `desde > hasta`.

---

## 6. Orden de implementación para apply

1. **Backend foundation** (TDD): dto.spec → DTO+mapper → controller `@ApiOkResponse` → e2e
   update → regen openapi.json + api.generated.ts + sync `api.ts` (`Periodo` → alias). Verificar
   `contract-drift` verde. Es la base que destraba el front.
2. **Funciones puras** (TDD): `calcular-rango-gestion-iso.test.ts` + impl; ampliar
   `fecha-actual.test.ts` + helpers de mes.
3. **Componente compartido** (TDD): reescribir `periodo-gestion-filtro.test.tsx` → reescribir
   `periodo-gestion-filtro.tsx` (nuevo contrato `RangoFechas`, presets, eliminar `usePeriodos`).
4. **Piloto: libro-diario** (TDD): schema → api → hook → filtros + test. Es el más completo
   (tiene `cuentaId` + keepPreviousData) → sirve de molde validado.
5. **Fan-out de los 5 restantes** (libro-mayor, balance-comprobacion, hoja-trabajo,
   flujo-efectivo, evolucion-patrimonio): son clones del piloto.

> **Fan-out recomendado**: pasos 1, 2, 3 son secuenciales (dependencias). Paso 4 (piloto) valida
> el molde. Paso 5 se puede paralelizar en 5 sub-tareas independientes (1 feature c/u) tras el
> piloto, porque son mecánicos y no comparten archivos entre sí. libro-mayor comparte el patrón
> `cuentaId`+keepPreviousData con el piloto; los otros 4 son el patrón `enabled: filtros!==null`.

---

## 7. Cumplimiento de reglas

- **Backend hexagonal**: el DTO/mapper vive en `dto/`, reusa el value object `RangoPeriodoFiscal`
  del `domain/`. Sin tocar puertos ni adapters.
- **§4.6**: backend usa `RangoPeriodoFiscal` (sin `Date`). Front: `hoyEnLaPazISO` (Intl, La Paz)
  + helpers aritméticos puros; justificado como capa de presentación (no fecha contable
  persistida) en §3.4.
- **Screaming arch frontend**: `calcularRangoGestionISO` en `features/periodos-fiscales/lib/`
  (función pura, sin React/IO). Helpers de mes en `lib/fecha-actual.ts` (transversal).
- **zod/RHF**: schemas planos con `.refine`; los componentes de filtro siguen con `useState`
  local para los toggles (igual que hoy — no son forms RHF completos, son paneles de filtro).
- **§14.7 gating**: NO cambia permisos. La opción "Gestión anterior" deshabilitada usa
  afordancia disable+tooltip.
- **Anti-F-02**: derivación vía `useMemo`; el único `useEffect` emite `onChange` comparando
  firma JSON (patrón actual preservado), no deriva state.
- **Anti-F-15**: no aplica selectores Zustand nuevos; `useGestiones`/`useQuery` no cambian.
- **Strict TDD**: tests antes del código en cada paso.

## 8. Result Contract

- **status**: design-ready
- **executive_summary**: ver resumen ejecutivo en el mensaje del orquestador.
- **artifacts**: `openspec/changes/filtro-periodo-presets/design.md` + engram
  `sdd/filtro-periodo-presets/design`.
- **next_recommended**: `sdd-tasks` (breakdown) → `sdd-apply` con el orden de §6.
- **risks**: replicar el cálculo de bisiestos en el front (mitigado: función pura testeada que
  espeja el VO backend); "Este mes" con helper en vez de copiar período (mitigado: decisión
  justificada §3.4, es lo robusto).
- **skill_resolution**: injected.
