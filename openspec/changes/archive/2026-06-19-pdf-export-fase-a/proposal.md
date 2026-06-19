# Exportación a PDF — Fase A (reportes tabulares planos) — Propuesta

> Fecha: 2026-06-19
> Fase: proposal del change `pdf-export-fase-a`
> Proyecto: avicont
> Capability: `exportacion-pdf` (NUEVA — ver justificación abajo)
> Alcance: FRONTEND-ONLY

---

## Qué

Extender la exportación a **PDF** —hoy disponible SOLO en el **Libro Diario**
(`frontend/src/features/libro-diario/`, vía `@react-pdf/renderer` + la infra
compartida `frontend/src/lib/export-pdf/`)— a tres reportes **tabulares planos**:

1. **Libro Mayor** (`features/libro-mayor/`) — portrait, 7 columnas.
2. **Balance de Comprobación** (`features/balance-comprobacion/`) — portrait,
   7 columnas + totales + fila de cuadre + sección opcional "naturaleza opuesta".
3. **Listado de Comprobantes** (`features/comprobantes/`) — **landscape**, 9
   columnas, con **fetch on-demand** (el listado pagina; ya existe el endpoint
   `GET /api/comprobantes/export`).

Cada reporte gana un botón **"Exportar a PDF"** al lado de su botón "Exportar a
Excel" ya existente, gateado por el **mismo permiso `read`** del reporte.

## Por qué

El Libro Diario ya prueba que el PDF aporta valor (informe imprimible/firmable con
cabecera fiscal de la organización). Esos tres reportes ya tienen su exportación a
Excel cerrada (capability `exportacion-excel`) y son **tabulares planos** — encajan
exactos en el builder genérico `construirReportePdf({ ..., columnas, filas })` que
la infra PDF ya expone. El esfuerzo marginal es bajo y desbloquea la paridad
PDF↔Excel para los reportes de uso diario del contador.

Esta es la **Fase A** de un plan en tres fases. **B y C quedan fuera de scope**
(ver Out of scope).

## Decisión de capability: `exportacion-pdf` NUEVA (no delta a `exportacion-excel`)

**Elegido: capability NUEVA `exportacion-pdf`.** Justificación:

- La capability `exportacion-excel` (spec viva `openspec/specs/exportacion-excel/spec.md`)
  declara un contrato de salida **Excel** (`write-excel-file`, `construirHoja`,
  celdas numéricas Excel, nombre `.xlsx`). PDF es **otro medio de salida**, con
  su propia infra (`@react-pdf/renderer`, `construirReportePdf`, orientación
  portrait/landscape, cabecera fiscal como componente react-pdf separado). Mezclar
  ambos en una sola capability difumina la frontera de comportamiento.
- El precedente del PDF del Libro Diario **ya existe en código** pero **no tiene
  spec viva propia** (se construyó sin capability declarada). Crear `exportacion-pdf`
  ahora le da hogar a TODO el comportamiento PDF, incluyendo el Libro Diario ya
  hecho (que el delta documenta como contexto, sin re-implementar).
- Mantiene `exportacion-excel` intacta y limpia: este change **no toca** ni un
  requirement de Excel.

**Lo que SÍ comparten Excel y PDF** (y se documenta como reutilización, no como
fusión de capabilities): el **tipo `Celda`** y los **mapeadores de filas de datos**.
Ver `design.md` — es la decisión arquitectónica central de este change.

## Scope

### In scope

- Capability NUEVA `exportacion-pdf` con sus requirements (delta `## ADDED`).
- Botón "Exportar a PDF" en cada uno de los 3 reportes, gateado por su permiso
  `read` (§14.7, `PermissionButton`, fail-closed):
  - Libro Mayor → `contabilidad.libro-mayor.read`
  - Balance de Comprobación → `contabilidad.eeff.read`
  - Listado de Comprobantes → `contabilidad.asientos.read`
- Reutilización del builder genérico `construirReportePdf` (matriz `Celda[][]`).
- **Refactor anti-deuda** de los 3 mapeadores Excel para separar "filas de
  cabecera fiscal" de "filas de datos+encabezados", de modo que UN solo mapeador
  de datos alimente Excel Y PDF sin duplicar lógica ni doble-renderizar la
  cabecera fiscal. Ver `design.md`.
- Definición de columnas PDF (`ColumnaPdf[]` con `flex`) por reporte.
- Orientación por reporte: Libro Mayor portrait, Balance Comprobación portrait,
  Listado Comprobantes **landscape**.
- Fetch on-demand del endpoint `GET /api/comprobantes/export` en el botón PDF de
  comprobantes (igual que su botón Excel — el cache del listado solo tiene la
  página visible).
- Tests vitest: mapeadores de datos (puros) + botones (mock del builder, mock de
  permisos, factory de data). Patrón de `boton-exportar-libro-diario-pdf.test.tsx`
  y `exportar-libro-diario-pdf.test.ts`.

### Out of scope

- **Fase B** (árboles jerárquicos: Balance General, Estado de Resultados) —
  requieren render de jerarquía/indentación, NO tabla plana. Change separado.
- **Fase C** (EFE, EEPN, Hoja de Trabajo de 12 columnas) — EFE/EEPN tienen
  secciones+conciliación; la Hoja de Trabajo necesita **headers agrupados
  multinivel** que `TablaPdf` hoy NO soporta. Change separado.
- **Backend**: cero endpoints nuevos, cero DTO nuevo (el de comprobantes/export
  ya existe). Cero migración.
- **Permisos**: cero permisos nuevos. Se reusan los `read` heredados.
- **Re-implementar el PDF del Libro Diario**: ya está en `main`; el delta solo lo
  documenta como contexto de la capability.
- **Headers agrupados multinivel en `TablaPdf`**: no se necesita en Fase A.

## Riesgos

- **R1 — Doble cabecera fiscal**: los mapeadores Excel hoy prependen
  `armarCabeceraFiscal(perfil)` DENTRO de `Celda[][]`. En PDF la cabecera la
  renderiza `<CabeceraFiscalPdf perfil>` aparte. Reusar el mapeador Excel verbatim
  → la cabecera saldría DOS veces. **Mitigación (decisión central del design)**:
  refactorizar cada mapeador para que devuelva SOLO filas de datos+encabezados
  (sin cabecera fiscal); el botón Excel prepende `armarCabeceraFiscal`, el botón
  PDF pasa `perfil` al builder. Un solo mapeador, cero duplicación, cero doble
  render. Se preserva el output Excel byte-equivalente (los tests Excel existentes
  son la red de seguridad).
- **R2 — Anchos de columna landscape (Comprobantes)**: 9 columnas en portrait se
  desbordan. **Mitigación**: orientación `landscape` + `ColumnaPdf[]` con `flex`
  proporcional calcado de los `width` del `COLUMNS_COMPROBANTES` Excel.
- **R3 — `TablaPdf` no soporta la fila de cuadre / sección "naturaleza opuesta"
  del Balance de Comprobación como bloques visuales distintos**: hoy `TablaPdf`
  es una matriz homogénea. **Mitigación**: esas filas se modelan como filas
  normales de la matriz (negrita, texto del backend), idéntico a como el Excel
  las representa hoy. Es aceptable para Fase A (paridad con Excel, no superación).
- **R4 — Olvidar §4.5/§4.6/§4.7**: montos string crudos (no recalcular), fechas
  sin UTC, flag `anulado`/estado. **Mitigación**: el refactor PRESERVA los mismos
  `formatearFechaCelda` / `type:'numero'` con string crudo / marca de anulado que
  ya usan los mapeadores Excel — no se re-deriva nada. Requirements explícitos en
  el spec.
- **R5 — `@react-pdf/renderer` en el chunk de la ruta**: motor pesado.
  **Mitigación**: dynamic import del builder dentro del handler del botón (patrón
  ya establecido por el Libro Diario).
