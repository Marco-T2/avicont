# Diseño técnico: Filtro de período por Gestión + Mes

> Change: `periodo-gestion-filtro` — frontend-puro.

## 1. Componente compartido `PeriodoGestionFiltro`

Vive en `src/components/shared/` (es cross-feature: lo consumen 6 reportes EEFF).

### Firma pública

```ts
export type PeriodoSeleccion =
  | { modo: 'periodo'; periodoFiscalId: string }
  | { modo: 'rango'; fechaDesde: string; fechaHasta: string };

interface PeriodoGestionFiltroProps {
  value?: PeriodoSeleccion | null; // contrato externo; el componente es self-resolving
  onChange: (sel: PeriodoSeleccion) => void;
  error?: string;
  className?: string;
}
```

- **Self-contained**: carga gestiones (`useGestiones()`) y períodos por gestión
  (`usePeriodos({ gestionId })`) por dentro. El caller NO le pasa data.
- **`value` es informativo**: el componente maneja su propio estado interno; no
  se usa `value` para controlarlo. Existe para que el caller pueda inspeccionar
  la selección vigente si lo necesita.

### Estado interno

| Estado | Tipo | Rol |
|--------|------|-----|
| `gestionElegida` | `string \| null` | gestión elegida explícitamente; `null` = usar default derivado |
| `mes` | `string` | `MES_TODOS` (sentinel) o el `id` de un período concreto |
| `usarRangoLibre` | `boolean` | toggle de rango personalizado |
| `fechaDesde` / `fechaHasta` | `string` | inputs date del rango libre |

**Gestión efectiva derivada** (sin setState-en-efecto, evita
`react-hooks/set-state-in-effect`):
```ts
const gestionId = gestionElegida ?? gestionesOrdenadas[0]?.id ?? null;
```

### Resolución (función pura vía `useMemo`)

```
usarRangoLibre        → { modo:'rango', fechaDesde, fechaHasta }
mes !== TODOS         → { modo:'periodo', periodoFiscalId: mes }
mes === TODOS         → rango [1erPeríodo.fechaInicio .. últimoPeríodo.fechaFin]
                        (null si no hay períodos cargados todavía)
```

### Emisión (única vía)

Un solo `useEffect` observa la `seleccionResuelta`. Compara su firma
(`JSON.stringify`) con la última emitida; si cambió y no es `null`, llama
`onChange`. Esto cubre **también el default al montar** — los handlers solo
actualizan estado, nunca llaman `onChange` directo. Evita doble-emisión y loops.

## 2. Mapeo selección → payload

El contrato de salida es el que ya aceptan los reportes EEFF — **no cambia**:

| Selección del usuario | `PeriodoSeleccion` emitido |
|-----------------------|----------------------------|
| Gestión G + mes P específico | `{ modo:'periodo', periodoFiscalId: P.id }` |
| Gestión G + "Todos" | `{ modo:'rango', fechaDesde: P1.fechaInicio, fechaHasta: Pn.fechaFin }` |
| Toggle rango libre | `{ modo:'rango', fechaDesde, fechaHasta }` (inputs date) |

Las fechas del caso "Todos" salen directo de `Periodo.fechaInicio` /
`Periodo.fechaFin` (ya en `YYYY-MM-DD`, proyectadas por el backend). **Cero
aritmética de fechas en el frontend** (§4.6).

## 3. Defaults

- **Gestión**: la más reciente. Orden: `year` DESC; ante mismo year, la `ABIERTA`
  primero (es la de trabajo).
- **Mes**: "Todos".
- El componente emite el `onChange` inicial → el form arranca **válido**.
- Sin auto-query: el botón "Consultar" sigue siendo manual (lo decide la page/
  filtro consumidor).

## 4. Decisión: conservar el rango libre

El modo "rango de fechas libre" **se mantiene** (no se elimina) detrás de un
toggle secundario (`Switch` "Rango de fechas personalizado"). Razón: algunos
reportes de auditoría necesitan rangos arbitrarios que no calzan con un mes ni
con una gestión completa. Cuando el toggle está activo, los selects de Gestión y
Mes se deshabilitan (la selección activa es el rango libre).

## 5. Integración con el filtro consumidor (patrón a replicar)

El piloto `libro-mayor-filtros.tsx` NO usa RHF para el período: el
`PeriodoGestionFiltro` es self-contained y emite el `PeriodoSeleccion`, que el
filtro guarda en `useState`. Los toggles propios (`incluirAnulados`,
`soloConMovimiento`, `cuentaId`) son estado local simple sin validación cruzada
→ `useState`. La validación (rango incompleto / fecha desde > hasta) se hace en
`handleConsultar` antes de mapear al payload `LibroMayorFiltroValues` (TYPE
intacto). El botón "Consultar" lleva `disabled={isFetching}` (Anti-F-07).

> Nota: el `<form>` + `zodResolver` original se reemplaza por este patrón porque
> el período ya no es un campo de formulario sino un sub-componente con estado
> propio, y los toggles restantes no tienen validación cruzada. El schema zod se
> conserva SOLO como source-of-truth del TYPE `LibroMayorFiltroValues`.

## 6. Edge cases

| Caso | Comportamiento |
|------|----------------|
| Sin gestiones | Empty state: "No hay gestiones fiscales todavía…". No se emite. |
| Gestiones cargando | "Cargando gestiones…". |
| "Todos" sin períodos cargados | Selección resuelve a `null` → no se emite (form sigue inválido). |
| Cambio de gestión | Resetea `mes` a "Todos"; al llegar los nuevos períodos se emite el rango de esa gestión. |
| Rango libre con fechas vacías | Emite `{modo:'rango', fechaDesde:'', fechaHasta:''}`; el filtro consumidor valida y muestra error. |
| `error` provisto por el caller | Se renderiza bajo los controles + `aria-invalid` en el select de mes y los inputs de fecha. |

## 7. Convenciones aplicadas

- Primitivos shadcn (`Select`, `Switch`, `Input type=date`, `Label`).
- Variables de tema, nunca colores literales (Anti-F-10).
- Inputs date `text-base md:text-sm` (anti auto-zoom iOS, §7).
- `Label htmlFor` + `aria-invalid` donde hay error.
- Mobile-first (`flex-wrap`, gaps escalables).
- `// Cross-feature:` al importar los hooks de `periodos-fiscales` (§14.6).
- Tests por rol/label/texto visible, no `data-testid`.
