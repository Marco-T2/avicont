# Spec: Filtro compartido de período (Gestión + Mes)

> Capability: `frontend-periodo-gestion-filtro`
> Componente: `src/components/shared/periodo-gestion-filtro.tsx`

## ADDED Requirements

### REQ-PGF-01: Selección por Gestión y Mes
El componente DEBE ofrecer dos selects: **Gestión** (las gestiones del tenant) y
**Mes** (los períodos de la gestión seleccionada, más una opción "Todos").

#### Scenario: el select de gestión lista las gestiones del tenant
- **DADO** que el tenant tiene gestiones 2025 (CERRADA) y 2026 (ABIERTA)
- **CUANDO** se monta el componente
- **ENTONCES** el select de Gestión muestra ambas gestiones rotuladas por año y estado

#### Scenario: el select de mes lista los períodos de la gestión seleccionada
- **DADO** que la gestión seleccionada tiene períodos Enero..Diciembre
- **CUANDO** se abre el select de Mes
- **ENTONCES** muestra la opción "Todos los meses" seguida de los 12 meses de esa gestión, en orden

### REQ-PGF-02: Default válido al montar
El componente DEBE seleccionar por default la gestión más reciente (year DESC;
ante mismo year, la `ABIERTA`) y el mes "Todos", y DEBE emitir el `onChange`
inicial para que el form consumidor quede válido desde el arranque.

#### Scenario: default selecciona gestión más reciente y emite rango de toda la gestión
- **DADO** gestiones 2025 (CERRADA) y 2026 (ABIERTA), y la 2026 con períodos Ene (01-01..01-31) .. Dic (12-01..12-31)
- **CUANDO** se monta el componente
- **ENTONCES** emite `{ modo:'rango', fechaDesde:'2026-01-01', fechaHasta:'2026-12-31' }`

#### Scenario: ante mismo year prefiere la ABIERTA
- **DADO** dos gestiones 2026, una CERRADA y una ABIERTA
- **CUANDO** se monta el componente
- **ENTONCES** la gestión efectiva por default es la ABIERTA (sus períodos son los que se cargan)

### REQ-PGF-03: Mes específico → modo período
Elegir un mes concreto (≠ "Todos") DEBE emitir `{ modo:'periodo', periodoFiscalId }`
con el `id` del período elegido.

#### Scenario: elegir Febrero emite el período de febrero
- **DADO** la gestión tiene el período Febrero con `id = 'p-feb'`
- **CUANDO** el usuario elige "Febrero" en el select de Mes
- **ENTONCES** emite `{ modo:'periodo', periodoFiscalId:'p-feb' }`

### REQ-PGF-04: Mes "Todos" → rango de toda la gestión
Con el mes "Todos", el componente DEBE emitir `{ modo:'rango', fechaDesde, fechaHasta }`
usando `fechaInicio` del primer período y `fechaFin` del último período de la
gestión. Las fechas se toman DIRECTAMENTE del período (ya en `YYYY-MM-DD`); NO se
calculan en el frontend (§4.6).

#### Scenario: "Todos" arma el rango con las fechas de los períodos extremos
- **DADO** la gestión con período Ene (fechaInicio 2026-01-01) y Dic (fechaFin 2026-12-31)
- **CUANDO** el mes seleccionado es "Todos"
- **ENTONCES** emite `{ modo:'rango', fechaDesde:'2026-01-01', fechaHasta:'2026-12-31' }`

### REQ-PGF-05: Modo rango personalizado conservado
El componente DEBE ofrecer un toggle "Rango de fechas personalizado" que, al
activarse, deshabilita los selects de Gestión/Mes y muestra dos inputs date.
La selección emitida en ese modo es `{ modo:'rango', fechaDesde, fechaHasta }`
con las fechas tipeadas.

#### Scenario: el toggle de rango emite las fechas tipeadas
- **DADO** el componente montado con su default
- **CUANDO** el usuario activa "Rango de fechas personalizado" y tipea Desde=2026-03-01, Hasta=2026-03-31
- **ENTONCES** emite `{ modo:'rango', fechaDesde:'2026-03-01', fechaHasta:'2026-03-31' }`

### REQ-PGF-06: Estados de carga y vacío
El componente DEBE mostrar un indicador mientras cargan las gestiones y un empty
state cuando no hay ninguna gestión.

#### Scenario: sin gestiones muestra empty state
- **DADO** que el tenant no tiene gestiones
- **CUANDO** se monta el componente
- **ENTONCES** muestra "No hay gestiones fiscales todavía…" y NO emite ninguna selección

#### Scenario: gestiones cargando muestra indicador
- **DADO** que `useGestiones` está en estado loading
- **CUANDO** se monta el componente
- **ENTONCES** muestra "Cargando gestiones…"

### REQ-PGF-07: Mensaje de error del consumidor
El componente DEBE renderizar el `error` que le pasa el consumidor y marcar
`aria-invalid` en los controles relevantes.

#### Scenario: muestra el error provisto
- **DADO** que el consumidor pasa `error="Seleccioná un período válido"`
- **CUANDO** se renderiza el componente
- **ENTONCES** el mensaje es visible bajo los controles

### REQ-PGF-08: Contrato de salida estable (no rompe a los consumidores)
La salida del componente DEBE ser exactamente `{ modo:'periodo', periodoFiscalId }`
XOR `{ modo:'rango', fechaDesde, fechaHasta }`, el mismo contrato que ya aceptan
los reportes EEFF. Los filtros consumidores mapean esa salida a su payload propio
SIN cambiar el TYPE que reciben sus pages.

#### Scenario: el piloto Libro Mayor preserva su payload
- **DADO** el filtro del Libro Mayor migrado al componente compartido
- **CUANDO** el usuario consulta con cualquier selección
- **ENTONCES** `onBuscar` recibe un `LibroMayorFiltroValues` con la misma forma que antes (período XOR rango + `incluirAnulados` + `soloConMovimiento` + `cuentaId?`)
