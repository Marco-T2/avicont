# Exportación a PDF — Fase A (delta spec)

<!--
Última edición: 2026-06-19
Última revisión contra core: 2026-06-19
Owner: frontend-lead
-->

> Fecha: 2026-06-19
> Fase: delta spec del change `pdf-export-fase-a`
> Proyecto: avicont
> Capability: `exportacion-pdf` (NUEVA)
> Alcance: FRONTEND-ONLY

Este delta CREA la capability `exportacion-pdf` y agrega los requirements de la
exportación a PDF de los tres reportes tabulares planos de la Fase A: **Libro
Mayor**, **Balance de Comprobación** y **Listado de Comprobantes**. El PDF del
**Libro Diario** ya existe en `main` (sin spec previa) y se menciona aquí solo como
contexto del contrato compartido; este change no lo re-implementa.

Invariantes del core que aplican a TODOS los requirements de abajo:
- **§4.5 Money**: los montos viajan como `string` crudo del backend. El único
  boundary string→Number es la celda numérica del builder. NUNCA se acumula ni
  recalcula en cliente.
- **§4.6 FechaContable**: las fechas `YYYY-MM-DD` se formatean a `dd/mm/yyyy` vía
  `formatearFechaCelda` (partiendo el string, sin `Date`/UTC).
- **§4.7 Anulación**: el flag `anulado` / el `estado` del comprobante se propaga
  visiblemente al PDF.
- **§14.7 Gating**: cada botón es un `PermissionButton` fail-closed con el permiso
  `read` del reporte.

---

## ADDED Requirements

### Requirement: Tipo `Celda` y mapeadores de datos compartidos entre Excel y PDF

La exportación a PDF de un reporte tabular plano DEBE reutilizar el mismo tipo
`Celda` (`@/lib/export-excel`) y el mismo mapeador de **filas de datos** que su
exportación a Excel, sin duplicar la lógica de mapeo de dominio. La cabecera fiscal
NO forma parte de las filas de datos: en Excel se prepende vía `armarCabeceraFiscal`,
en PDF la renderiza `<CabeceraFiscalPdf perfil>`.

#### Scenario: El mapeador de datos no incluye la cabecera fiscal

- **DADO** un reporte tabular plano (Libro Mayor / Balance de Comprobación / Listado de Comprobantes)
- **CUANDO** su mapeador de filas de datos produce la matriz `Celda[][]`
- **ENTONCES** la primera fila de la matriz es la fila de **encabezados de columna** (en negrita), no la cabecera fiscal
- **Y** la cabecera fiscal NO aparece en ninguna fila de la matriz

#### Scenario: El botón Excel preserva su salida con la cabecera fiscal embebida

- **DADO** el botón "Exportar a Excel" del reporte
- **CUANDO** construye la hoja
- **ENTONCES** antepone `armarCabeceraFiscal(perfil)` a las filas de datos del mapeador compartido
- **Y** el archivo `.xlsx` resultante es equivalente al anterior al refactor (los tests Excel existentes siguen verdes)

#### Scenario: El botón PDF pasa el perfil fiscal al builder, no a las filas

- **DADO** el botón "Exportar a PDF" del reporte
- **CUANDO** construye el PDF
- **ENTONCES** invoca `construirReportePdf({ titulo, subtitulo, perfil, columnas, filas, orientacion })` con `filas` = las filas de datos del mapeador compartido
- **Y** la cabecera fiscal se renderiza UNA sola vez (vía `<CabeceraFiscalPdf>` interno del builder)

---

### Requirement: Exportar el Libro Mayor a PDF

La pantalla del Libro Mayor ofrece un botón "Exportar a PDF" gateado por
`contabilidad.libro-mayor.read`, que genera un PDF **portrait** de 7 columnas
(Fecha | Comprobante | Glosa | Debe (BOB) | Haber (BOB) | Saldo (BOB) | Estado).

#### Scenario: El botón está gateado por el permiso de lectura del Libro Mayor

- **DADO** un usuario sin el permiso `contabilidad.libro-mayor.read`
- **CUANDO** se renderiza la pantalla del Libro Mayor
- **ENTONCES** el botón "Exportar a PDF" está deshabilitado con razón de denegación en español

#### Scenario: El botón está deshabilitado sin datos y muestra progreso al generar

- **DADO** que la consulta del Libro Mayor aún no devolvió datos (`data === undefined`)
- **CUANDO** se renderiza el botón
- **ENTONCES** está deshabilitado (Anti-F-07)
- **Y** mientras genera el PDF muestra "Generando…" y vuelve a "Exportar a PDF" al terminar

#### Scenario: Genera y descarga el PDF con el nombre del rango

- **DADO** datos del Libro Mayor cargados en cache y un perfil fiscal (posiblemente con campos null)
- **CUANDO** el usuario presiona "Exportar a PDF"
- **ENTONCES** se hace dynamic import del builder PDF (`@react-pdf/renderer` fuera del chunk de la ruta)
- **Y** se construye un PDF portrait de 7 columnas con cabecera fiscal, título "Libro Mayor" y el rango en el subtítulo
- **Y** se descarga vía `descargarBlob` con un nombre `libro-mayor-<rango>.pdf`

#### Scenario: Respeta §4.5 / §4.6 / §4.7 en el contenido

- **DADO** movimientos con montos string del backend, fechas `YYYY-MM-DD` y comprobantes anulados
- **CUANDO** se mapean a la matriz `Celda[][]`
- **ENTONCES** los montos (`debeBob`, `haberBob`, `saldoCorrienteBob`, totales) van como celda numérica con el string crudo, sin recalcular (§4.5)
- **Y** las fechas se formatean a `dd/mm/yyyy` sin `Date`/UTC (§4.6)
- **Y** los movimientos de comprobantes anulados se marcan visiblemente en la columna Estado (§4.7)

---

### Requirement: Exportar el Balance de Comprobación a PDF

La pantalla del Balance de Comprobación ofrece un botón "Exportar a PDF" gateado
por `contabilidad.eeff.read`, que genera un PDF **portrait** de 7 columnas
(Código | Cuenta | Naturaleza | Sumas Débito | Sumas Crédito | Saldo Deudor |
Saldo Acreedor) con totales, fila de cuadre y sección opcional de naturaleza
opuesta.

#### Scenario: El botón está gateado por el permiso de lectura de EEFF

- **DADO** un usuario sin el permiso `contabilidad.eeff.read`
- **CUANDO** se renderiza la pantalla del Balance de Comprobación
- **ENTONCES** el botón "Exportar a PDF" está deshabilitado con razón en español

#### Scenario: Genera el PDF con totales y fila de cuadre

- **DADO** una respuesta del Balance de Comprobación cargada en cache
- **CUANDO** el usuario exporta a PDF
- **ENTONCES** el PDF incluye una fila de **TOTALES** (las 4 columnas de montos en negrita, valores del backend sin recalcular, §4.5)
- **Y** una fila de **cuadre** con `cuadra` (✓/✗) y las diferencias `diferenciaSumas` / `diferenciaSaldos` del backend

#### Scenario: La sección "naturaleza opuesta" aparece solo cuando hay cuentas a revisar

- **DADO** una respuesta con `cuentasNaturalezaOpuesta.length > 0`
- **CUANDO** se genera el PDF
- **ENTONCES** se agrega un bloque titulado "CUENTAS CON SALDO DE NATURALEZA OPUESTA (revisar)" con sus filas
- **Y** si `cuentasNaturalezaOpuesta` está vacío, ese bloque NO aparece

---

### Requirement: Exportar el Listado de Comprobantes a PDF (landscape, fetch on-demand)

La pantalla de Comprobantes ofrece un botón "Exportar a PDF" gateado por
`contabilidad.asientos.read`, que genera un PDF **landscape** de 9 columnas
(Fecha | Número | Tipo | Documento respaldo | Nro. Ref. | Contacto | Glosa |
Estado | Total BOB), fetcheando el conjunto completo on-demand.

#### Scenario: El botón está gateado por el permiso de lectura de asientos

- **DADO** un usuario sin el permiso `contabilidad.asientos.read`
- **CUANDO** se renderiza la pantalla de Comprobantes
- **ENTONCES** el botón "Exportar a PDF" está deshabilitado con razón en español

#### Scenario: Fetch on-demand del endpoint export al exportar

- **DADO** que el listado de comprobantes está paginado (el cache solo tiene la página visible)
- **CUANDO** el usuario presiona "Exportar a PDF"
- **ENTONCES** se fetchea el conjunto completo vía `GET /api/comprobantes/export` con los filtros activos (sin `page`/`limit`)
- **Y** recién entonces se mapean los `items` a la matriz `Celda[][]` y se construye el PDF
- **Y** un fallo del fetch se reporta vía toast en español (Anti-F-13), sin romper la pantalla

#### Scenario: El PDF se genera en orientación landscape por el ancho de 9 columnas

- **DADO** que el reporte tiene 9 columnas (excede el ancho útil de A4 portrait, regla > ~240 mm → landscape)
- **CUANDO** se construye el PDF
- **ENTONCES** se invoca `construirReportePdf({ ..., orientacion: 'landscape' })`
- **Y** las columnas reparten el ancho por `flex` proporcional

#### Scenario: Respeta §4.5 / §4.6 / §4.7 en el contenido

- **DADO** comprobantes con `totalDebitoBob` string, `fechaContable` ISO, comprobantes en BORRADOR (`numero === null`) y anulados
- **CUANDO** se mapean a la matriz `Celda[][]`
- **ENTONCES** `totalDebitoBob` va como celda numérica con el string crudo, sin recalcular (§4.5)
- **Y** la fecha se formatea a `dd/mm/yyyy` sin `Date`/UTC (§4.6)
- **Y** un comprobante BORRADOR muestra Número vacío; un comprobante anulado muestra "Anulado" en Estado (§4.7)
