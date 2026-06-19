# frontend-periodo-gestion-filtro — Especificación

<!--
Última edición: 2026-06-19
Última revisión contra core: 2026-06-19
Owner: frontend-lead
-->

> Fecha: 2026-06-19
> Fase: spec (live)
> Proyecto: avicont
> Capability: `frontend-periodo-gestion-filtro`
> Alcance: BACKEND (`GET /periodos`) + FRONTEND (componente compartido + 6 features)
> Origen: changes `periodo-gestion-filtro` (PR #226, 2026-06-17) + `filtro-periodo-presets` (PR #232, 2026-06-19)
> Stack: NestJS + Vite + React 19 + TanStack Query

---

## Propósito

Especificación del componente compartido de selección de período y de la fundación
backend que lo sustenta. El componente `PeriodoGestionFiltro` adopta el modelo
QuickBooks: un selector de presets que rellena los campos Desde/Hasta siempre
visibles, con output uniforme por rango de fechas. Los 6 reportes que usan el
componente (`libro-diario`, `libro-mayor`, `balance-comprobacion`, `hoja-trabajo`,
`flujo-efectivo`, `evolucion-patrimonio`) consumen siempre `fechaDesde`/`fechaHasta`.

**Problema raíz resuelto**: `GET /periodos` no proyectaba `fechaInicio`/`fechaFin`,
causando que el componente emitiera `fechaDesde: undefined`/`fechaHasta: undefined`
al seleccionar "gestión completa", lo que generaba 400 en los endpoints de reportes.

---

## Glosario

- **Preset**: opción del selector que rellena los campos Desde/Hasta
  (`esta-gestion`, `gestion-anterior`, `este-mes`, `mes-anterior`, `personalizado`).
- **Desde/Hasta**: campos de fecha en formato `"YYYY-MM-DD"` siempre visibles y
  editables por el usuario.
- **Gestión ABIERTA más reciente**: gestión con `status === 'ABIERTA'` de mayor
  `year`. Si no existe ninguna ABIERTA, la de mayor `year` con cualquier status.
- **Gestión anterior**: la primera gestión con `year` estrictamente menor al
  `year` de la gestión efectiva (no necesariamente `year - 1` exacto — puede
  haber saltos si hay gestiones eliminadas o no creadas).
- **Hoy en La Paz**: fecha calendario obtenida con `Intl.DateTimeFormat` en
  `timeZone: 'America/La_Paz'` (§4.6 CLAUDE.md). Inyectable vía `clock` para tests.
- **FechaContable**: string `"YYYY-MM-DD"`, sin hora ni UTC (§4.6 CLAUDE.md).
- **RangoPeriodoFiscal**: value object en
  `backend/src/periodos-fiscales/domain/rango-periodo-fiscal.ts`; calcula
  inicio/fin de un mes sin `new Date()`, con regla bisiesta gregoriana.
- **`RangoFechas`**: contrato de salida del componente:
  `{ fechaDesde: string; fechaHasta: string }`. El componente NUNCA emite
  `periodoFiscalId` ni el discriminante `modo`.

---

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

## BACKEND

---

### REQ-FPF-B-01 — `GET /periodos` proyecta `fechaInicio` y `fechaFin`

El endpoint `GET /api/periodos` DEBE incluir los campos `fechaInicio` y `fechaFin`
en cada objeto de la respuesta.

- `fechaInicio`: primer día calendario del mes del período, formato `"YYYY-MM-DD"`.
  Derivado como `RangoPeriodoFiscal.of(year, month).inicio()`.
- `fechaFin`: último día calendario del mes del período, formato `"YYYY-MM-DD"`.
  Derivado como `RangoPeriodoFiscal.of(year, month).fin()`.
- Ambos campos son **no nulos** — todo período tiene un mes bien definido.
- El cálculo es **aritmético puro**: NO usa `new Date()`, NO depende del timezone
  del servidor (§4.6 CLAUDE.md).

> **Nota de backend**: este requirement vive aquí y no en `gestion-fiscal/spec.md`
> porque el cambio afecta exclusivamente al mapper del DTO de período
> (`PeriodoFiscalResponseDto`) y es la fundación directa del componente de filtro.
> La spec de `gestion-fiscal` cubre el ciclo de vida de la gestión y el cierre;
> no es el lugar natural para un detalle de proyección de campos de respuesta.

#### Escenario: período estándar (mes de 31 días)

- DADO el período `(year=2026, month=1)` del tenant activo
- CUANDO se consulta `GET /api/periodos`
- ENTONCES el objeto del período `(2026, 1)` incluye
  `fechaInicio: "2026-01-01"` y `fechaFin: "2026-01-31"`

#### Escenario: período de febrero — año no bisiesto

- DADO el período `(year=2026, month=2)`
- CUANDO se consulta `GET /api/periodos`
- ENTONCES ese período incluye `fechaInicio: "2026-02-01"` y `fechaFin: "2026-02-28"`

#### Escenario: período de febrero — año bisiesto

- DADO el período `(year=2028, month=2)`
- CUANDO se consulta `GET /api/periodos`
- ENTONCES ese período incluye `fechaInicio: "2028-02-01"` y `fechaFin: "2028-02-29"`

#### Escenario: período de mes corto (abril, junio, septiembre, noviembre)

- DADO el período `(year=2026, month=4)`
- CUANDO se consulta `GET /api/periodos`
- ENTONCES ese período incluye `fechaFin: "2026-04-30"` (30 días)

---

### REQ-FPF-B-02 — Contrato OpenAPI de `GET /periodos` decorado

El endpoint `GET /api/periodos` DEBE estar decorado con `@ApiOkResponse` usando
`PeriodoFiscalResponseDto` como tipo de respuesta (array).

- El campo `fechaInicio` DEBE aparecer en el schema del `openapi.json` generado.
- El campo `fechaFin` DEBE aparecer en el schema del `openapi.json` generado.
- El tipo `Periodo` en `frontend/src/types/api.ts` DEBE estar sincronizado con el
  schema generado en `api.generated.ts` (cierra la deuda del tipo-que-miente).

#### Escenario: contract-drift detecta desincronización

- DADO que se agrega `fechaInicio`/`fechaFin` al DTO backend pero NO se regeneran
  los artefactos
- CUANDO corre el job `contract-drift` en CI
- ENTONCES el job FALLA con diferencias en `openapi.json` o `api.generated.ts`

---

## FRONTEND

---

### REQ-FPF-F-01 — Campos Desde/Hasta siempre visibles y editables

El componente `PeriodoGestionFiltro` DEBE mostrar los campos Desde y Hasta de tipo
fecha (`"YYYY-MM-DD"`) en todo momento, independientemente del preset seleccionado.

- Ambos campos son editables directamente por el usuario.
- NO existe selector de mes puntual ni selector de gestión en la UX.
- El layout visible siempre es: `[Selector de Preset] [Desde] [Hasta]`.

#### Escenario: componente montado sin valor inicial

- DADO que el componente `PeriodoGestionFiltro` se monta
- CUANDO no se le pasa valor inicial
- ENTONCES se muestran los campos Desde y Hasta vacíos, con el preset en
  "Esta gestión"; una vez que carguen las gestiones los campos se rellenan
  automáticamente con el rango de la gestión efectiva

---

### REQ-FPF-F-02 — Selector de preset con 5 opciones

El componente DEBE ofrecer un selector con exactamente cinco opciones de preset:

| Valor interno      | Etiqueta visible   |
|--------------------|--------------------|
| `esta-gestion`     | "Esta gestión"     |
| `gestion-anterior` | "Gestión anterior" |
| `este-mes`         | "Este mes"         |
| `mes-anterior`     | "Mes anterior"     |
| `personalizado`    | "Personalizado"    |

El selector DEBE estar visible en todo momento junto a los campos Desde/Hasta.

---

### REQ-FPF-F-03 — Elegir un preset rellena los campos Desde/Hasta

Al seleccionar un preset (excepto "Personalizado"), el componente DEBE rellenar
automáticamente los campos Desde y Hasta con las fechas correspondientes.

**Reglas por preset:**

- **"Esta gestión"**: Desde/Hasta del rango completo de la gestión ABIERTA más
  reciente, calculado via `calcularRangoGestionISO(year, mesInicio)` (función pura
  frontend que espeja `RangoPeriodoFiscal`).
- **"Gestión anterior"**: Desde/Hasta del rango completo de la primera gestión con
  `year` estrictamente menor al de la gestión efectiva. Si no existe ninguna gestión
  anterior, el preset se deshabilita (ver REQ-FPF-F-07).
- **"Este mes"**: Desde = primer día del mes actual en La Paz (`primerDiaDelMesISO`);
  Hasta = último día del mes actual en La Paz (`ultimoDiaDelMesISO`). Cálculo puro
  aritmético (sin `new Date()` para derivar días; `Intl` solo para obtener "hoy").
  Este preset NUNCA se deshabilita (ver REQ-FPF-F-07).
- **"Mes anterior"**: Desde/Hasta del mes calendario anterior al mes actual en La Paz
  (`rangoMesAnteriorISO`). Este preset NUNCA se deshabilita (ver REQ-FPF-F-07).

#### Escenario: preset "Esta gestión" sobre gestión ABIERTA 2026

- DADO que existe una gestión ABIERTA con `year=2026`, `mesInicio=1`
- CUANDO el usuario selecciona el preset "Esta gestión"
- ENTONCES Desde se rellena con `"2026-01-01"` y Hasta con `"2026-12-31"`

#### Escenario: preset "Este mes" en junio 2026

- DADO que hoy es `2026-06-15` en La Paz (clock inyectado)
- CUANDO el usuario selecciona el preset "Este mes"
- ENTONCES Desde se rellena con `"2026-06-01"` y Hasta con `"2026-06-30"`

#### Escenario: preset "Mes anterior" en junio 2026

- DADO que hoy es `2026-06-15` en La Paz (clock inyectado)
- CUANDO el usuario selecciona el preset "Mes anterior"
- ENTONCES Desde se rellena con `"2026-05-01"` y Hasta con `"2026-05-31"`

#### Escenario: preset "Gestión anterior" — elige la gestión con year menor

- DADO que existen dos gestiones: `{year:2025, status:'CERRADA'}` y
  `{year:2026, status:'ABIERTA'}`
- CUANDO el usuario selecciona "Esta gestión"
- ENTONCES Desde/Hasta corresponden a la gestión 2026 (la ABIERTA más reciente)
- Y CUANDO el usuario selecciona "Gestión anterior"
- ENTONCES Desde/Hasta corresponden a la gestión 2025

---

### REQ-FPF-F-04 — Editar fecha manualmente fuerza preset "Personalizado"

Si el usuario edita directamente el campo Desde o Hasta, el preset DEBE cambiar
automáticamente a "Personalizado".

- El cambio a "Personalizado" ocurre **sin confirmación** ni dialog.
- Las fechas previamente rellenadas por el preset se preservan en el campo;
  el usuario las está editando.
- No se limpia ni resetea el valor del campo al pasar a "Personalizado".

#### Escenario: usuario edita Hasta después de seleccionar "Esta gestión"

- DADO que el usuario seleccionó "Esta gestión" y los campos muestran
  Desde="2026-01-01", Hasta="2026-12-31"
- CUANDO el usuario cambia el campo Hasta a "2026-06-30"
- ENTONCES el selector de preset muestra "Personalizado"
- Y el campo Desde sigue mostrando "2026-01-01"

---

### REQ-FPF-F-05 — Output del componente siempre por `fechaDesde`/`fechaHasta`

El componente `PeriodoGestionFiltro` DEBE emitir SIEMPRE su resultado como
`{ fechaDesde: string, fechaHasta: string }`. NUNCA emite `periodoFiscalId`,
`gestionId` ni el discriminante `modo`.

- Si los campos Desde/Hasta están vacíos (estado inicial antes de que carguen
  las gestiones, o "Personalizado" con inputs incompletos), el componente NO
  dispara la consulta al reporte (`enabled=false` en el hook).
- Cuando ambos campos tienen valor válido, el output es el par de strings YYYY-MM-DD.

#### Escenario de regresión: "Esta gestión" ABIERTA 2026 dispara la consulta

- DADO una gestión ABIERTA 2026
- CUANDO el usuario selecciona el preset "Esta gestión" en el Libro Diario
- ENTONCES el componente emite `{ fechaDesde: "2026-01-01", fechaHasta: "2026-12-31" }`
- Y la query `GET /api/libros/diario?fechaDesde=2026-01-01&fechaHasta=2026-12-31` se
  dispara
- Y el reporte devuelve datos (HTTP 200, no 400) — **regresión del bug original**

#### Escenario de regresión: EEPN "Esta gestión" ABIERTA 2026 no da 400

- DADO una gestión ABIERTA 2026
- CUANDO el usuario selecciona "Esta gestión" en el reporte de Evolución de
  Patrimonio
- ENTONCES la query viaja con `fechaDesde` y `fechaHasta` con valor definido
- Y el endpoint NO responde 400

---

### REQ-FPF-F-06 — Validación de rango Desde ≤ Hasta

El componente DEBE validar que Desde ≤ Hasta cuando ambos campos tienen valor.

- Si Desde > Hasta, DEBE mostrar un mensaje de error en español visible al usuario.
- El mensaje: `"La fecha 'Desde' debe ser anterior o igual a 'Hasta'"`.
- Mientras el error esté activo, la consulta al reporte NO DEBE dispararse.
- La validación se activa al intentar consultar (submit), no en tiempo real
  mientras el usuario tipea.
- Si alguno de los dos campos está vacío, la validación de orden no aplica
  (el campo vacío ya impide la consulta por `enabled=false`).

#### Escenario: Desde posterior a Hasta — consulta bloqueada

- DADO el componente con Desde="2026-06-30" y Hasta="2026-06-01"
- CUANDO se intenta lanzar la consulta
- ENTONCES NO se dispara la query al reporte
- Y se muestra el mensaje de error de rango

#### Escenario: Desde igual a Hasta — válido (un solo día)

- DADO el componente con Desde="2026-06-15" y Hasta="2026-06-15"
- ENTONCES no hay error de validación
- Y la query se dispara con ese rango

---

### REQ-FPF-F-07 — Caso borde: presets disponibles según datos cargados

Los presets "Este mes" y "Mes anterior" NUNCA se deshabilitan. Al ser calculados
por funciones puras aritméticas (helpers de `lib/fecha-actual.ts`), SIEMPRE
resuelven a un rango válido independientemente de si existe un período en BD para
ese mes. Si el backend recibe el rango y no hay comprobantes, devuelve resultado
vacío (estado vacío del reporte, comportamiento ya cubierto).

El preset "Gestión anterior" DEBE mostrarse como **deshabilitado** en el selector
cuando no existe ninguna gestión con `year` estrictamente menor al de la gestión
efectiva actual. Los campos Desde/Hasta NO se modifican al intentar seleccionarlo.

#### Escenario: "Gestión anterior" sin gestión previa

- DADO que la org solo tiene la gestión 2026 (no existe ninguna gestión con
  year < 2026)
- CUANDO el selector muestra las opciones de preset
- ENTONCES la opción "Gestión anterior" está deshabilitada (no seleccionable)

#### Escenario: "Este mes" siempre disponible aunque no exista el período en BD

- DADO una org que tiene períodos hasta mayo 2026 pero hoy es junio 2026
  Y el período de junio no ha sido creado aún en BD
- CUANDO el selector muestra las opciones de preset
- ENTONCES la opción "Este mes" está habilitada y al seleccionarla rellena
  Desde="2026-06-01", Hasta="2026-06-30" (calculados aritméticamente)

---

### REQ-FPF-F-08 — Fechas sin recalcular calendario complejo y sin UTC (§4.5 / §4.6)

Los helpers `primerDiaDelMesISO`, `ultimoDiaDelMesISO` y `rangoMesAnteriorISO`
(en `frontend/src/lib/fecha-actual.ts`) DEBEN usar aritmética entera pura para
derivar los días del mes (sin `new Date()` para el cálculo de días; `Intl` se usa
SOLO para obtener "hoy" en La Paz).

La función `calcularRangoGestionISO(year, mesInicio)` (en
`frontend/src/features/periodos-fiscales/lib/`) DEBE espejear la lógica de
`RangoPeriodoFiscal` del backend, cubierta por tests propios.

Los tests de "Este mes" y "Mes anterior" DEBEN inyectar la fecha actual vía el
parámetro `clock` de los helpers (tests deterministas, §10.6 CLAUDE.md).

#### Escenario: test de "Este mes" con fecha inyectada

- DADO que el clock del test está fijado en `2026-06-15`
- CUANDO se selecciona "Este mes"
- ENTONCES Desde="2026-06-01" y Hasta="2026-06-30" (calculados aritméticamente)

---

### REQ-FPF-F-09 — Schemas de los 6 features: siempre rango, sin modo 'periodo'

Los 6 schemas Zod de los features que usan `PeriodoGestionFiltro`:

- `libro-diario-filtro-schema.ts`
- `libro-mayor-filtro-schema.ts`
- `balance-comprobacion-filtro-schema.ts`
- `hoja-trabajo-filtro-schema.ts`
- `flujo-efectivo-filtro-schema.ts`
- `evolucion-patrimonio-filtro-schema.ts`

DEBEN ser schemas planos con `fechaDesde` y `fechaHasta` como campos requeridos.
El discriminante `modo` NO DEBE existir en ninguno de estos schemas. Los handlers
de API (`get-*.ts`) NUNCA envían `periodoFiscalId` al backend. Los hooks (`use-*.ts`)
basan la condición `enabled` únicamente en la presencia de `fechaDesde`/`fechaHasta`.

#### Escenario: schema válido con rango directo

- DADO el schema `libroDiarioFiltroSchema`
- CUANDO se valida `{ fechaDesde: "2026-01-01", fechaHasta: "2026-01-31", incluirAnulados: false }`
- ENTONCES la validación pasa sin error

#### Escenario: schema rechaza periodoFiscalId (campo eliminado)

- DADO el schema `libroDiarioFiltroSchema`
- CUANDO se valida `{ periodoFiscalId: "some-uuid" }`
- ENTONCES la validación falla (el campo no existe en el schema)

---

### REQ-FPF-F-10 — Comportamiento preservado de los reportes

Los siguientes comportamientos DEBEN mantenerse sin cambio:

- El toggle `incluirAnulados` (presente en los 6 features) sigue funcionando igual.
- El toggle `soloConMovimiento` del Libro Mayor sigue funcionando igual.
- El filtro de cuenta opcional del Libro Mayor sigue funcionando igual.
- El filtro de cuenta opcional del Libro Diario sigue funcionando igual.
- El gating de permisos de cada reporte (§14.7 CLAUDE.md) no cambia.
- Los endpoints del backend `GET /api/eeff/*`, `GET /api/libros/*` siguen
  aceptando `periodoFiscalId` como parámetro válido — solo la UI deja de enviarlo.

#### Escenario: incluirAnulados funciona con el nuevo filtro

- DADO el Libro Mayor con Desde="2026-01-01", Hasta="2026-06-30", toggle
  `incluirAnulados` activado
- CUANDO se lanza la consulta
- ENTONCES la URL incluye `incluirAnulados=true` además de `fechaDesde` y `fechaHasta`
- Y el reporte incluye comprobantes anulados del rango

---

## Notas de la capability

- **Sin migración de BD**: `fechaInicio`/`fechaFin` son derivadas en cómputo por
  `RangoPeriodoFiscal` y no se persisten.
- **Los endpoints de reportes no cambian**: `GET /api/eeff/*` y `GET /api/libros/*`
  siguen aceptando `periodoFiscalId`; es la UI quien deja de enviarlo.
- **`usePeriodos` eliminado del componente compartido**: los presets de mes usan
  funciones puras en lugar de copiar fechas de períodos cargados; los de gestión
  usan `useGestiones` + `calcularRangoGestionISO`. Esto elimina un request y
  simplifica los mocks de tests.
- **Persistencia de preset/fechas en URL** (`useSearchParams`) está fuera de scope.
- **Balance General y Estado de Resultados** no forman parte de esta capability;
  usan filtros propios que no son `PeriodoGestionFiltro`.
