# Filtro de Período con Presets — Delta Spec

<!--
Artifact: spec (delta)
Change: filtro-periodo-presets
Fecha: 2026-06-19
Status: DRAFT
Capability afectada: periodo-gestion-filtro
Alcance: BACKEND (GET /periodos) + FRONTEND (PeriodoGestionFiltro compartido + 6 features)
Última revisión contra core: 2026-06-19
Owner: backend-lead
-->

> Fecha: 2026-06-19
> Fase: spec delta
> Proyecto: avicont
> Capability: `periodo-gestion-filtro`
> Tipo: ADDED (comportamiento nuevo) + MODIFIED (comportamiento existente cambia) + REMOVED (comportamiento a eliminar)

---

## Propósito

Delta spec del change `filtro-periodo-presets`. Describe el comportamiento observable
que debe cumplir el sistema tras el cambio, sin entrar en implementación.

**Problema raíz**: `GET /periodos` nunca proyectó `fechaInicio`/`fechaFin`. El tipo
`Periodo` en `api.ts` los declara obligatorios pero en runtime son `undefined`. El
componente `PeriodoGestionFiltro` emitía `fechaDesde: undefined`, `fechaHasta: undefined`
al seleccionar "Gestión + mes Todos", causando un 400 en EEPN y que la query del
Libro Mayor nunca disparara.

**Solución observable**: dos piezas coordinadas:

1. `GET /periodos` proyecta `fechaInicio`/`fechaFin` derivadas aritméticamente.
2. El componente compartido adopta el modelo QuickBooks: Desde/Hasta siempre
   visibles, preset que los rellena, query SIEMPRE por `fechaDesde`/`fechaHasta`.

---

## Glosario

- **Preset**: opción del selector que rellena los campos Desde/Hasta ("Esta gestión",
  "Gestión anterior", "Este mes", "Mes anterior", "Personalizado").
- **Desde/Hasta**: campos de fecha en formato `"YYYY-MM-DD"` que el usuario ve y
  puede editar directamente.
- **Gestión ABIERTA más reciente**: gestión con `status === 'ABIERTA'` de mayor `year`.
  Si no existe ninguna ABIERTA, la de mayor `year` con cualquier status.
- **Gestión anterior**: la gestión con `year = gestionActual.year - 1`. Si no existe,
  el preset está deshabilitado.
- **Hoy en La Paz**: fecha calendario calculada con `Intl.DateTimeFormat` en
  `timeZone: 'America/La_Paz'` (§4.6 CLAUDE.md). Inyectable via `clock` para tests.
- **FechaContable**: `"YYYY-MM-DD"`, sin hora ni UTC (§4.6).
- **RangoPeriodoFiscal**: lógica aritmética existente en backend
  `periodos-fiscales/domain/rango-periodo-fiscal.ts`; calcula inicio/fin de un mes
  sin `new Date()`.

---

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

## BACKEND

---

### REQ-FPP-B-01 — `GET /periodos` proyecta `fechaInicio` y `fechaFin`

**ADDED**

El endpoint `GET /api/periodos` DEBE incluir los campos `fechaInicio` y `fechaFin`
en cada objeto de la respuesta.

- `fechaInicio`: primer día calendario del mes del período, formato `"YYYY-MM-DD"`.
  Derivado como `RangoPeriodoFiscal.of(year, month).inicio()`.
- `fechaFin`: último día calendario del mes del período, formato `"YYYY-MM-DD"`.
  Derivado como `RangoPeriodoFiscal.of(year, month).fin()`.
- Ambos campos son **no nulos** — todo período tiene un mes bien definido.
- El cálculo es **aritmético puro**: NO usa `new Date()`, NO depende del timezone
  del servidor (§4.6 CLAUDE.md).

#### Escenario: período estándar (mes de 31 días)

- DADO el período `(year=2026, month=1)` del tenant activo
- CUANDO se consulta `GET /api/periodos`
- ENTONCES cada objeto del período `(2026, 1)` incluye
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

### REQ-FPP-B-02 — Contrato OpenAPI de `GET /periodos` decorado

**ADDED**

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

### REQ-FPP-F-01 — Campos Desde/Hasta siempre visibles y editables

**MODIFIED** (antes: ocultos cuando se usaba selector de período/gestión)

El componente `PeriodoGestionFiltro` DEBE mostrar los campos Desde y Hasta de tipo
fecha (`"YYYY-MM-DD"`) en todo momento, independientemente del preset seleccionado.

- Ambos campos son editables directamente por el usuario.
- NO existe selector de mes puntual ni selector de período específico en la UX.
- El layout visible siempre es: `[Selector de Preset] [Desde] [Hasta]`.

#### Escenario: componente montado sin valor inicial

- DADO que el componente `PeriodoGestionFiltro` se monta
- CUANDO no se le pasa valor inicial
- ENTONCES se muestran los campos Desde y Hasta vacíos, con el preset en "Personalizado"

---

### REQ-FPP-F-02 — Selector de preset con 5 opciones

**ADDED**

El componente DEBE ofrecer un selector con exactamente cinco opciones de preset:

| Valor interno | Etiqueta visible |
|---------------|-----------------|
| `esta-gestion` | "Esta gestión" |
| `gestion-anterior` | "Gestión anterior" |
| `este-mes` | "Este mes" |
| `mes-anterior` | "Mes anterior" |
| `personalizado` | "Personalizado" |

El selector DEBE estar visible en todo momento junto a los campos Desde/Hasta.

---

### REQ-FPP-F-03 — Elegir un preset rellena los campos Desde/Hasta

**ADDED**

Al seleccionar un preset (excepto "Personalizado"), el componente DEBE rellenar
automáticamente los campos Desde y Hasta con las fechas correspondientes.

Las fechas PROVIENEN de los datos devueltos por el backend — el componente NO
calcula aritmética de calendario por sí mismo; COPIA `fechaInicio`/`fechaFin`
de los períodos recibidos de `useGestiones`/`usePeriodos`.

**Reglas por preset:**

- **"Esta gestión"**: Desde = `fechaInicio` del primer período de la gestión ABIERTA
  más reciente; Hasta = `fechaFin` del último período de esa misma gestión.
- **"Gestión anterior"**: Desde = `fechaInicio` del primer período de la gestión
  con `year = gestionActual.year - 1`; Hasta = `fechaFin` de su último período.
- **"Este mes"**: Desde = `fechaInicio` del período cuyo `(year, month)` coincide
  con el mes actual en horario de La Paz; Hasta = `fechaFin` de ese mismo período.
- **"Mes anterior"**: Desde = `fechaInicio` del período cuyo `(year, month)` coincide
  con el mes calendario anterior al mes actual en La Paz; Hasta = `fechaFin` de
  ese período.

#### Escenario: preset "Esta gestión" sobre gestión ABIERTA 2026

- DADO que existe una gestión ABIERTA con `year=2026`, `mesInicio=1`, y 12 períodos
  cuyos `fechaInicio`/`fechaFin` vienen del backend
- CUANDO el usuario selecciona el preset "Esta gestión"
- ENTONCES Desde se rellena con `"2026-01-01"` y Hasta con `"2026-12-31"`

#### Escenario: preset "Este mes" en junio 2026

- DADO que hoy es `2026-06-15` en La Paz
  Y existe el período `(year=2026, month=6)` con `fechaInicio="2026-06-01"`,
  `fechaFin="2026-06-30"` devueltos por el backend
- CUANDO el usuario selecciona el preset "Este mes"
- ENTONCES Desde se rellena con `"2026-06-01"` y Hasta con `"2026-06-30"`

#### Escenario: preset "Mes anterior" en junio 2026

- DADO que hoy es `2026-06-15` en La Paz
  Y existe el período `(year=2026, month=5)` con `fechaInicio="2026-05-01"`,
  `fechaFin="2026-05-31"` devueltos por el backend
- CUANDO el usuario selecciona el preset "Mes anterior"
- ENTONCES Desde se rellena con `"2026-05-01"` y Hasta con `"2026-05-31"`

#### Escenario: preset "Gestión anterior" — fallback de gestión ABIERTA más reciente

- DADO que existen dos gestiones: `{year:2025, status:'CERRADA'}` y
  `{year:2026, status:'ABIERTA'}`, ambas con sus períodos incluidos en la response
- CUANDO el usuario selecciona "Esta gestión"
- ENTONCES Desde/Hasta corresponden a la gestión 2026 (la ABIERTA más reciente)
- Y CUANDO el usuario selecciona "Gestión anterior"
- ENTONCES Desde/Hasta corresponden a la gestión 2025

---

### REQ-FPP-F-04 — Editar fecha manualmente fuerza preset "Personalizado"

**ADDED**

Si el usuario edita directamente el campo Desde o Hasta (tipeando o usando el
date picker), el preset DEBE cambiar automáticamente a "Personalizado".

- El cambio a "Personalizado" ocurre **sin confirmación** — no hay dialog.
- Las fechas previamente rellenadas por el preset se preservan y se muestran como
  valor actual; el usuario las está editando.
- No se limpia ni resetea el valor del campo al pasar a "Personalizado".

#### Escenario: usuario edita Hasta después de seleccionar "Esta gestión"

- DADO que el usuario seleccionó "Esta gestión" y los campos muestran Desde="2026-01-01", Hasta="2026-12-31"
- CUANDO el usuario cambia el campo Hasta a "2026-06-30"
- ENTONCES el selector de preset muestra "Personalizado"
- Y el campo Desde sigue mostrando "2026-01-01"

---

### REQ-FPP-F-05 — Output del componente siempre por `fechaDesde`/`fechaHasta`

**MODIFIED** (antes: podía emitir `periodoFiscalId` o `modo:'periodo'`)

El componente `PeriodoGestionFiltro` DEBE emitir SIEMPRE su resultado como
`{ fechaDesde: string, fechaHasta: string }`. NUNCA emite `periodoFiscalId`,
`gestionId` ni el discriminante `modo:'periodo'`.

- Si los campos Desde/Hasta están vacíos (estado inicial sin preset elegido),
  el componente NO dispara la consulta al reporte (condición `enabled=false`).
- Cuando ambos campos tienen valor válido, el output es el par de strings YYYY-MM-DD.

#### Escenario de regresión: "Esta gestión" ABIERTA 2026 dispara la consulta

- DADO una gestión ABIERTA 2026 con períodos cuyas fechas vienen del backend
- CUANDO el usuario selecciona el preset "Esta gestión" en el Libro Diario
- ENTONCES el componente emite `{ fechaDesde: "2026-01-01", fechaHasta: "2026-12-31" }`
- Y la query `GET /api/libros/diario?fechaDesde=2026-01-01&fechaHasta=2026-12-31` se dispara
- Y el reporte devuelve datos (HTTP 200, no 400) — **escenario de regresión crítico**

#### Escenario de regresión: EEPN "Esta gestión" ABIERTA 2026 no da 400

- DADO una gestión ABIERTA 2026
- CUANDO el usuario selecciona "Esta gestión" en el reporte de Evolución de Patrimonio
- ENTONCES la query viaja con `fechaDesde` y `fechaHasta` con valor definido
- Y el endpoint NO responde 400

---

### REQ-FPP-F-06 — Validación de rango Desde ≤ Hasta

**ADDED**

El componente DEBE validar que Desde ≤ Hasta cuando ambos campos tienen valor.

- Si Desde > Hasta, DEBE mostrar un mensaje de error en español visible al usuario.
- El mensaje sugerido: `"La fecha 'Desde' debe ser anterior o igual a 'Hasta'"`.
- Mientras el error esté activo, la consulta al reporte NO debe dispararse.
- Si alguno de los dos campos está vacío, la validación de orden no aplica
  (el campo vacío impide la consulta por `enabled=false`).

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

### REQ-FPP-F-07 — Caso borde: no existe período para el mes del preset

**ADDED**

Si el preset seleccionado ("Este mes", "Mes anterior") NO encuentra un período
con el `(year, month)` correspondiente entre los datos cargados:

- El preset DEBE mostrarse como **deshabilitado** en el selector.
- Los campos Desde/Hasta NO se modifican.
- El selector permanece en el valor anterior (o "Personalizado" si no había valor).
- NO se muestra un error de validación — la ausencia de período es una condición
  esperada (la org aún no creó el período de ese mes).

Si el preset seleccionado ("Gestión anterior") NO encuentra una gestión con
`year = gestionActual.year - 1`:

- El preset "Gestión anterior" DEBE mostrarse como **deshabilitado** en el selector.
- Los campos Desde/Hasta NO se modifican.

#### Escenario: "Este mes" sin período creado para el mes actual

- DADO una org que tiene períodos hasta mayo 2026 pero hoy es junio 2026
  Y el período de junio no ha sido creado aún
- CUANDO el selector muestra las opciones de preset
- ENTONCES la opción "Este mes" está deshabilitada (no seleccionable)

#### Escenario: "Gestión anterior" sin gestión previa

- DADO que la org solo tiene la gestión 2026 (no existe gestión 2025)
- CUANDO el selector muestra las opciones de preset
- ENTONCES la opción "Gestión anterior" está deshabilitada

---

### REQ-FPP-F-08 — Fechas sin recalcular y sin UTC (§4.5 / §4.6)

**ADDED**

Las fechas que el componente emite son strings copiados directamente de
`fechaInicio`/`fechaFin` devueltos por el backend para presets de período, o
bien el valor que el usuario tipeó directamente.

- El componente NO recalcula fechas de calendario en JavaScript.
- NO usa `new Date()` para derivar inicio/fin de mes.
- El helper de "hoy en La Paz" (`hoyEnLaPazISO`) se usa SOLO para identificar el
  `(year, month)` del período a copiar, no para construir `fechaFin`.
- Los tests de presets de "Este mes"/"Mes anterior" DEBEN inyectar la fecha actual
  vía el parámetro `clock` del helper (tests deterministas, §10.6 CLAUDE.md).

#### Escenario: test de "Este mes" con fecha inyectada

- DADO que el clock del test está fijado en `2026-06-15`
  Y los datos de períodos incluyen `{year:2026, month:6, fechaInicio:"2026-06-01", fechaFin:"2026-06-30"}`
- CUANDO se selecciona "Este mes"
- ENTONCES Desde="2026-06-01" y Hasta="2026-06-30" (copiados del backend)

---

### REQ-FPP-F-09 — Schemas de los 6 features: siempre rango, sin modo 'periodo'

**MODIFIED** (antes: discriminatedUnion 'periodo' | 'rango')

Los 6 schemas Zod de los features que usan `PeriodoGestionFiltro`:

- `libro-diario-filtro-schema.ts`
- `libro-mayor-filtro-schema.ts`
- `balance-comprobacion-filtro-schema.ts`
- `hoja-trabajo-filtro-schema.ts`
- `flujo-efectivo-filtro-schema.ts`
- `evolucion-patrimonio-filtro-schema.ts`

DEBEN simplificarse a un schema plano con `fechaDesde` y `fechaHasta` como
campos requeridos. El discriminante `modo` DEBE eliminarse de todos estos schemas.

Los handlers de API de cada feature (`get-*.ts`) DEBEN eliminar la rama
`periodoFiscalId` — NUNCA envían ese parámetro al backend.

Los hooks de cada feature (`use-*.ts`) DEBEN simplificar la condición `enabled`
para basarse únicamente en la presencia de `fechaDesde` y `fechaHasta`.

#### Escenario: schema válido con rango directo

- DADO el schema `libroDiarioFiltroSchema`
- CUANDO se valida `{ fechaDesde: "2026-01-01", fechaHasta: "2026-01-31", incluirAnulados: false }`
- ENTONCES la validación pasa sin error

#### Escenario: schema rechaza periodoFiscalId (campo eliminado)

- DADO el schema `libroDiarioFiltroSchema`
- CUANDO se valida `{ periodoFiscalId: "some-uuid" }`
- ENTONCES la validación falla (el campo no existe en el schema)

---

### REQ-FPP-F-10 — Comportamiento preservado de los reportes

**NO MODIFICADO** (assertion de no regresión)

Los siguientes comportamientos DEBEN mantenerse sin cambio tras el rediseño:

- El toggle `incluirAnulados` (presente en los 6 features) sigue funcionando igual.
- El toggle `soloConMovimiento` del Libro Mayor sigue funcionando igual.
- El filtro de cuenta opcional del Libro Mayor sigue funcionando igual.
- El filtro de cuenta opcional del Libro Diario sigue funcionando igual.
- El gating de permisos de cada reporte (§14.7 CLAUDE.md) no cambia.
- Los endpoints del backend `GET /api/eeff/*`, `GET /api/libros/*` siguen
  aceptando `periodoFiscalId` como parámetro válido — solo la UI deja de enviarlo.

#### Escenario: incluirAnulados funciona con el nuevo filtro

- DADO el Libro Mayor con Desde="2026-01-01", Hasta="2026-06-30", toggle `incluirAnulados` activado
- CUANDO se lanza la consulta
- ENTONCES la URL incluye `incluirAnulados=true` además de `fechaDesde` y `fechaHasta`
- Y el reporte incluye comprobantes anulados del rango

---

## REMOVED — Comportamientos a eliminar

### REQ-FPP-R-01 — Eliminar selector de mes y modo 'periodo' de la UX

**REMOVED**

El selector de mes puntual (el `<select>` de período dentro de una gestión) DEBE
ser eliminado del componente `PeriodoGestionFiltro`.

El discriminante `modo: 'periodo'` en el estado interno y en el output del
componente DEBE ser eliminado.

Ningún reporte de los 6 features DEBE emitir `periodoFiscalId` hacia el backend.

---

## Notas de alcance

- **Balance General** y **Estado de Resultados** NO forman parte de este change.
  Usan filtros propios que no son `PeriodoGestionFiltro`.
- Ningún endpoint de backend EEFF es modificado. Los backends siguen aceptando
  `periodoFiscalId`; es la UI quien deja de enviarlo.
- NO hay migración de BD. `fechaInicio`/`fechaFin` son derivadas en cómputo
  por `RangoPeriodoFiscal` y no se persisten.
- La persistencia del preset o fechas en URL (`useSearchParams`) está fuera de scope.
