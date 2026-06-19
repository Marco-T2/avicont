# Tasks — Exportación a PDF Fase A

> Change: `pdf-export-fase-a` · FRONTEND-ONLY · TDD red→green · describe/it en español
> Molde botón/test: `frontend/src/features/libro-diario/components/boton-exportar-libro-diario-pdf.tsx` + `.test.tsx`
> Molde mapeador/test: `features/libro-diario/lib/exportar-libro-diario-pdf.ts` + `.test.ts`
> Comandos (desde `frontend/`): typecheck `pnpm exec tsc -b` · lint `pnpm run lint` · tests `pnpm test` (vitest)
> Regla anti-deuda: un solo `...FilasDatos` por reporte alimenta Excel Y PDF; cero duplicación; output Excel byte-equivalente.

---

## Fase 0 — Baseline

- [x] Correr `pnpm test` y anotar el total de tests verde antes de tocar nada (baseline para no regresar).

---

## Fase A — Refactor de mapeadores: extraer `...FilasDatos` (sin cabecera fiscal)

> Para cada reporte: extraer las filas de datos (encabezados de columna + detalle +
> totales/cuadre/secciones) a `mapear<Reporte>AFilasDatos`, y dejar
> `mapear<Reporte>AFilas(.., perfil)` como wrapper que antepone `armarCabeceraFiscal`.
> Los tests Excel existentes deben seguir verdes SIN modificarlos.

### Libro Mayor
- [x] (RED) En `features/libro-mayor/lib/exportar-libro-mayor.test.ts` agregar tests de `mapearLibroMayorAFilasDatos`: la primera fila es la de encabezados de columna (no la cabecera fiscal); montos string crudo (§4.5); fecha `dd/mm/yyyy` (§4.6); marca de anulado (§4.7); fila de totales del backend.
- [x] Refactorizar `features/libro-mayor/lib/exportar-libro-mayor.ts`: extraer `mapearLibroMayorAFilasDatos(response): Celda[][]`; `mapearLibroMayorAFilas(response, perfil)` = `[...armarCabeceraFiscal(perfil), ...mapearLibroMayorAFilasDatos(response)]`.
- [x] (GREEN) `pnpm test` verde — tests nuevos + los Excel existentes intactos.

### Balance de Comprobación
- [x] (RED) En `features/balance-comprobacion/lib/exportar-balance-comprobacion.test.ts` agregar tests de `mapearBalanceComprobacionAFilasDatos`: primera fila = encabezados; totales; fila de cuadre (`cuadra` + diferencias del backend); sección "naturaleza opuesta" SOLO si `length > 0`.
- [x] Refactorizar `features/balance-comprobacion/lib/exportar-balance-comprobacion.ts`: extraer `mapearBalanceComprobacionAFilasDatos(response): Celda[][]`; wrapper con `armarCabeceraFiscal`.
- [x] (GREEN) `pnpm test` verde.

### Listado de Comprobantes
- [x] (RED) En `features/comprobantes/lib/exportar-comprobantes.test.ts` agregar tests de `mapearComprobantesAFilasDatos`: primera fila = 9 encabezados; `totalDebitoBob` string crudo (§4.5); fecha sin UTC (§4.6); BORRADOR (`numero===null`) → Número vacío; anulado → "Anulado" (§4.7).
- [x] Refactorizar `features/comprobantes/lib/exportar-comprobantes.ts`: extraer `mapearComprobantesAFilasDatos(items): Celda[][]`; wrapper con `armarCabeceraFiscal`.
- [x] (GREEN) `pnpm test` verde.

---

## Fase B — Constantes de columnas PDF

- [x] En `features/libro-mayor/lib/exportar-libro-mayor.ts` exportar `COLUMNAS_PDF_LIBRO_MAYOR: ColumnaPdf[]` (7 flex: 14·12·40·16·16·16·10).
- [x] En `features/balance-comprobacion/lib/exportar-balance-comprobacion.ts` exportar `COLUMNAS_PDF_BALANCE_COMPROBACION: ColumnaPdf[]` (7 flex = widths del Excel).
- [x] En `features/comprobantes/lib/exportar-comprobantes.ts` exportar `COLUMNAS_PDF_COMPROBANTES: ColumnaPdf[]` (9 flex = widths de `COLUMNS_COMPROBANTES`).
- [x] Importar `ColumnaPdf` desde `@/lib/export-pdf` en los tres `lib/`.

---

## Fase C — Botón PDF Libro Mayor (test → componente)

- [x] (RED) Crear `features/libro-mayor/components/boton-exportar-libro-mayor-pdf.test.tsx` (clon de `boton-exportar-libro-diario-pdf.test.tsx`): mock del builder `@/lib/export-pdf`, mock de permisos, factory de data. Escenarios: gateado por `contabilidad.libro-mayor.read`; `disabled` sin data; "Generando…" durante; descarga con `libro-mayor-<rango>.pdf`; pasa `filas = mapearLibroMayorAFilasDatos(data)` y `perfil` al builder (cabecera NO en filas); `orientacion` portrait.
- [x] Crear `features/libro-mayor/components/boton-exportar-libro-mayor-pdf.tsx` (dynamic import de `construirReportePdf`, `COLUMNAS_PDF_LIBRO_MAYOR`, portrait).
- [x] (GREEN) `pnpm test` verde.

---

## Fase D — Botón PDF Balance de Comprobación (test → componente)

- [x] (RED) Crear `features/balance-comprobacion/components/boton-exportar-balance-comprobacion-pdf.test.tsx`: gateado por `contabilidad.eeff.read`; `disabled` sin data; descarga `balance-comprobacion-<rango>.pdf`; filas incluyen totales+cuadre; sección naturaleza opuesta presente/ausente según data; portrait.
- [x] Crear `features/balance-comprobacion/components/boton-exportar-balance-comprobacion-pdf.tsx`.
- [x] (GREEN) `pnpm test` verde.

---

## Fase E — Botón PDF Listado de Comprobantes (test → componente, landscape + fetch on-demand)

- [x] (RED) Crear `features/comprobantes/components/boton-exportar-comprobantes-pdf.test.tsx` (clon de `boton-exportar-comprobantes.test.tsx` PERO PDF): gateado por `contabilidad.asientos.read`; **fetch on-demand** vía `exportComprobantes(filtros)` mockeado; mapea con `mapearComprobantesAFilasDatos`; `orientacion: 'landscape'`; error de fetch → toast (Anti-F-13); descarga `comprobantes-<rango>.pdf`.
- [x] Crear `features/comprobantes/components/boton-exportar-comprobantes-pdf.tsx` (fetch `exportComprobantes`, dynamic import builder, `COLUMNAS_PDF_COMPROBANTES`, `landscape`, toast en catch).
- [x] (GREEN) `pnpm test` verde.

---

## Fase F — Wirear los botones en las páginas

- [x] `features/libro-mayor/pages/libro-mayor-page.tsx`: montar `<BotonExportarLibroMayorPdf data={...} perfil={...} rango={...} />` junto al botón Excel.
- [x] `features/balance-comprobacion/pages/balance-comprobacion-page.tsx`: montar el botón PDF junto al Excel.
- [x] `features/comprobantes/components/comprobantes-page.tsx`: montar `<BotonExportarComprobantesPdf filtros={...} perfil={...} rango={...} />` junto al botón Excel.
- [x] Si alguna `*-page.test.tsx` existente verifica los controles de export (ej. `libro-mayor-page.test.tsx`), actualizarla para contemplar el nuevo botón.

---

## Fase G — Verificación final

- [x] `cd frontend && pnpm exec tsc -b` → 0 errores de tipo.
- [x] `cd frontend && pnpm run lint` → 0 warnings ni errores.
- [x] `cd frontend && pnpm test` (vitest) → todo verde; el total = baseline (Fase 0) + tests nuevos, SIN regresiones en los tests Excel.
- [x] **Anti-duplicación**: confirmar que NO existe lógica de mapeo de dominio duplicada — el PDF y el Excel de cada reporte comparten `mapear<Reporte>AFilasDatos`; el único delta entre medios es la cabecera fiscal (Excel la antepone, PDF la pasa al builder).
- [x] Confirmar sin drift de tipos: `pnpm run gen:api-types` → `api.generated.ts` sin cambios (este change no toca backend). `git diff --stat` del archivo vacío.
- [ ] Smoke visual: PENDIENTE (requiere dev en caliente con Docker, lo hace Marco) — exportar a PDF cada reporte y verificar cabecera fiscal única, orientación correcta (Comprobantes landscape), montos/fechas/anulados.
