# Diseño técnico — Exportación a PDF Fase A

> Change: `pdf-export-fase-a` · FRONTEND-ONLY
> Capability: `exportacion-pdf` (nueva)

---

## 1. Decisión central: el tipo `Celda` YA es compartido excel↔pdf

**El "problema crítico" del brief no existe: la infra PDF ya importa el `Celda`
de export-excel.** Verificado abriendo ambos archivos:

- El tipo `Celda` se define UNA vez en
  `frontend/src/lib/export-excel/construir-hoja.ts:32`:
  ```ts
  export type Celda = CeldaNumero | CeldaTexto;   // construir-hoja.ts:32
  ```
  con `CeldaEstilo` (`construir-hoja.ts:9`, `fontWeight?: 'bold'` + `align?`),
  `CeldaNumero` (`construir-hoja.ts:19`, `type:'numero'; value:string`) y
  `CeldaTexto` (`construir-hoja.ts:27`, `type:'texto'; value:string`). Reexportado
  en `frontend/src/lib/export-excel/index.ts:4`.

- La infra PDF **consume ESE MISMO tipo**, no uno propio:
  ```ts
  // frontend/src/lib/export-pdf/construir-reporte-pdf.tsx:4
  import type { Celda } from '@/lib/export-excel';
  // frontend/src/lib/export-pdf/componentes/tabla-pdf.tsx:3
  import type { Celda } from '@/lib/export-excel';
  ```
  `TablaPdf` ya respeta `celda.type === 'numero'` (alinea derecha + `formatearMontoPdf`),
  `celda.align` y `celda.fontWeight === 'bold'` (→ Helvetica-Bold). Es exactamente
  el mismo contrato que `construirHoja` consume para Excel.

**Conclusión:** NO hay dos tipos `Celda`, NO hay que unificar nada, NO hay que
crear un `lib/export-shared/`. El tipo ya vive en `export-excel` y es la fuente de
verdad compartida. Mantenerlo ahí (no moverlo) — moverlo sería churn sin valor y
rompería 30+ imports. **Decisión: reutilizar `Celda` de `@/lib/export-excel` tal
cual, en mapeadores y botones PDF.**

> Nota de naming/ubicación: que un tipo "de export-excel" lo consuma también el PDF
> es leve incomodidad semántica, pero es la realidad ya establecida por el PDF del
> Libro Diario en `main`. Renombrar la carpeta o el módulo está FUERA de scope de
> Fase A (sería un refactor transversal); si en el futuro molesta, se evalúa mover
> `Celda` a un `lib/export-shared/`. Hoy: cero deuda nueva, se respeta lo que hay.

---

## 2. El problema REAL: la cabecera fiscal embebida en el mapeador Excel

El verdadero choque excel↔pdf es la **cabecera fiscal**, no el tipo `Celda`.

Los 3 mapeadores Excel hoy **prependen** la cabecera fiscal DENTRO de la matriz:

```ts
// features/libro-mayor/lib/exportar-libro-mayor.ts
filas.push(...armarCabeceraFiscal(perfil));   // ← filas 0..N: cabecera fiscal
filas.push([ ...encabezados de columna... ]); // ← luego encabezados
// features/balance-comprobacion/lib/exportar-balance-comprobacion.ts → idem
// features/comprobantes/lib/exportar-comprobantes.ts → idem
```

En PDF la cabecera fiscal la renderiza `<CabeceraFiscalPdf perfil>` DENTRO de
`construirReportePdf` (`construir-reporte-pdf.tsx`), y al builder se le pasa
`perfil` aparte; las `filas` son SOLO la tabla. Si pasáramos las filas del
mapeador Excel verbatim, la cabecera fiscal saldría **dos veces**.

`armarCabeceraFiscal` (`lib/export-excel/cabecera-fiscal.ts`) y `CabeceraFiscalPdf`
(`lib/export-pdf/componentes/cabecera-fiscal-pdf.tsx`) ya son **dos
representaciones espejo del mismo `CAMPOS_FISCALES`** (razonSocial en negrita sin
etiqueta; resto "Etiqueta: valor"; campos null omitidos). Eso ya está bien: cada
medio tiene su render. El problema es solo que el mapeador Excel **mezcla** la
cabecera con los datos.

### Decisión: extraer el mapeador a "filas de datos" puras (sin cabecera fiscal)

Para cada uno de los 3 reportes, refactorizar el mapeador en **dos funciones**:

1. `mapear<Reporte>AFilasDatos(response/items): Celda[][]` — SOLO encabezados de
   columna + filas de detalle + totales/cuadre/secciones. **Sin perfil, sin
   cabecera fiscal.** Es la función que comparten Excel y PDF.
2. La función pública existente `mapear<Reporte>AFilas(response/items, perfil): Celda[][]`
   se mantiene (no romper su firma ni sus tests) y queda como **wrapper Excel**:
   ```ts
   export function mapearLibroMayorAFilas(response, perfil): Celda[][] {
     return [...armarCabeceraFiscal(perfil), ...mapearLibroMayorAFilasDatos(response)];
   }
   ```

Resultado:
- **Cero duplicación de lógica de mapeo de dominio**: las filas de datos se derivan
  en UN solo lugar; Excel les antepone la cabecera fiscal, PDF se la pasa al builder.
- **Output Excel byte-equivalente**: el wrapper produce exactamente la misma matriz
  que antes (cabecera fiscal + datos en el mismo orden). Los tests Excel existentes
  (`exportar-libro-mayor.test.ts`, etc.) son la red de seguridad — NO se tocan y
  deben seguir verdes.
- **§4.5/§4.6/§4.7 preservados sin re-derivar**: las celdas de datos (montos string
  crudo, `formatearFechaCelda`, marca de anulado) se mueven tal cual al
  `...FilasDatos`; no se re-escribe la lógica.

Alternativa descartada: que el botón PDF reciba la matriz CON cabecera fiscal y la
"recorte" — frágil (depende de contar filas) y deja el PDF acoplado al formato
Excel. La extracción de `...FilasDatos` es más limpia y explícita.

---

## 3. Columnas, orientación y permisos por reporte

`ColumnaPdf = { flex: number }` (`lib/export-pdf/types.ts`). Los `flex` se calcan
proporcionalmente de los `width` que ya usa cada `COLUMNS_*` del Excel.

### 3.1 Libro Mayor — portrait, 7 columnas
- Permiso: `contabilidad.libro-mayor.read` (espeja `boton-exportar-libro-mayor.tsx:66`).
- Columnas (flex ≈ width Excel del Libro Diario hermano): Fecha 14 · Comprobante 12
  · Glosa 40 · Debe 16 · Haber 16 · Saldo 16 · Estado 10.
  ```ts
  const COLUMNAS_PDF_LIBRO_MAYOR: ColumnaPdf[] = [
    { flex: 14 }, { flex: 12 }, { flex: 40 }, { flex: 16 }, { flex: 16 }, { flex: 16 }, { flex: 10 },
  ];
  ```
- Orientación: `portrait` (default).
- Data: del cache (la pantalla ya tiene la respuesta del Libro Mayor cargada).

### 3.2 Balance de Comprobación — portrait, 7 columnas
- Permiso: `contabilidad.eeff.read` (espeja `boton-exportar-balance-comprobacion.tsx:62`).
- Columnas (flex = `COLUMNS_BALANCE_COMPROBACION` del Excel): Código 14 · Cuenta 40
  · Naturaleza 12 · Sumas Débito 16 · Sumas Crédito 16 · Saldo Deudor 16 · Saldo
  Acreedor 16.
- Orientación: `portrait`.
- Notas:
  - La **fila de cuadre** y la **sección "naturaleza opuesta"** del Excel usan
    distinta cantidad de columnas que la tabla principal (ver
    `exportar-balance-comprobacion.ts`: el cuadre usa 7 celdas, la sección de
    naturaleza opuesta empieza con filas de 1 y 4 celdas). `TablaPdf` reparte por
    `flex` y tolera filas más cortas (las columnas faltantes simplemente no se
    pintan), igual que el Excel. Para Fase A esto es paridad con Excel, aceptable.
  - El mapeador de datos compartido conserva totales + cuadre + sección opuesta;
    solo se le quita la cabecera fiscal.

### 3.3 Listado de Comprobantes — LANDSCAPE, 9 columnas
- Permiso: `contabilidad.asientos.read` (espeja `boton-exportar-comprobantes.tsx`).
- Columnas (flex = `COLUMNS_COMPROBANTES` del Excel): Fecha 14 · Número 16 · Tipo 12
  · Documento respaldo 18 · Nro. Ref. 14 · Contacto 28 · Glosa 40 · Estado 14 ·
  Total BOB 16.
- Orientación: **`landscape`** (9 columnas exceden el ancho útil de A4 portrait;
  regla: contenido > ~240 mm → landscape).
- **Fetch on-demand**: el botón PDF fetchea el conjunto completo vía
  `exportComprobantes(filtros)` (`features/comprobantes/api/export-comprobantes.ts`,
  ya usado por el botón Excel — `GET /api/comprobantes/export`) y luego mapea. El
  cache del listado solo tiene la página visible. Errores vía `toast` (Anti-F-13).

---

## 4. Patrón del botón PDF (clon del Libro Diario)

Clonar la mecánica de `boton-exportar-libro-diario-pdf.tsx`:
- `useState(generando)`.
- `PermissionButton` con el permiso `read` del reporte, `deniedReason` en español.
- `disabled={!data || generando}` (Libro Mayor / Balance) o `disabled={generando}`
  (Comprobantes, que siempre puede fetchear) — Anti-F-07.
- `PERFIL_VACIO` fallback cuando `perfil` es null/undefined (todos los campos null;
  `armarCabeceraFiscal`/`CabeceraFiscalPdf` lo toleran).
- **Dynamic import** del builder PDF en el handler:
  `const { construirReportePdf } = await import('@/lib/export-pdf');`
  (`@react-pdf/renderer` pesado, fuera del chunk de la ruta).
- `construirReportePdf({ titulo, subtitulo, perfil, columnas, filas, orientacion })`
  con `filas = mapear<Reporte>AFilasDatos(data)` (sin cabecera fiscal — el builder
  la renderiza).
- `descargarBlob(blob, '<reporte>-<rango>.pdf')` (`descargarBlob` de
  `@/lib/export-excel`).
- Texto "Generando…" / "Exportar a PDF".

> A diferencia del Libro Diario (que tiene su builder custom agrupado por asiento),
> estos 3 usan el builder GENÉRICO `construirReportePdf` directamente — no hace
> falta un `construir-<reporte>-pdf.tsx` por feature. El dynamic import apunta a
> `@/lib/export-pdf`.

Subtítulo: rango legible (`Del dd/mm/yyyy al dd/mm/yyyy`) usando `formatearFechaCelda`,
igual que el Libro Diario.

---

## 5. Ubicación de archivos

### Modificados (refactor de mapeadores — extraer `...FilasDatos`)
- `frontend/src/features/libro-mayor/lib/exportar-libro-mayor.ts`
- `frontend/src/features/balance-comprobacion/lib/exportar-balance-comprobacion.ts`
- `frontend/src/features/comprobantes/lib/exportar-comprobantes.ts`

### Modificados (wirear el botón PDF en la página)
- `frontend/src/features/libro-mayor/pages/libro-mayor-page.tsx`
- `frontend/src/features/balance-comprobacion/pages/balance-comprobacion-page.tsx`
- `frontend/src/features/comprobantes/components/comprobantes-page.tsx`

### Nuevos (botón PDF + su test, por reporte)
- `frontend/src/features/libro-mayor/components/boton-exportar-libro-mayor-pdf.tsx` + `.test.tsx`
- `frontend/src/features/balance-comprobacion/components/boton-exportar-balance-comprobacion-pdf.tsx` + `.test.tsx`
- `frontend/src/features/comprobantes/components/boton-exportar-comprobantes-pdf.tsx` + `.test.tsx`

### Tests de mapeador (ampliar los existentes o agregar casos para `...FilasDatos`)
- `frontend/src/features/libro-mayor/lib/exportar-libro-mayor.test.ts`
- `frontend/src/features/balance-comprobacion/lib/exportar-balance-comprobacion.test.ts`
- `frontend/src/features/comprobantes/lib/exportar-comprobantes.test.ts`

> Las constantes de columnas PDF (`COLUMNAS_PDF_*`) viven junto al botón PDF o en el
> `lib/` del reporte (preferible en el `lib/exportar-*.ts` junto a su mapeador, para
> que columnas y filas vivan cerca).

### Infra PDF
- **Sin cambios.** `construirReportePdf`, `TablaPdf`, `CabeceraFiscalPdf`,
  `formatearMontoPdf`, `ColumnaPdf`/`OrientacionPdf` ya soportan todo lo necesario.
  `TablaPdf` NO soporta headers agrupados multinivel — no se necesita en Fase A.

---

## 6. Qué NO se hace (anti-deuda explícito)

- NO se mueve el tipo `Celda` de lugar (ya es compartido; moverlo sería churn).
- NO se duplica la lógica de mapeo: un solo `...FilasDatos` por reporte alimenta
  Excel y PDF.
- NO se duplica la cabecera fiscal: Excel la antepone, PDF la pasa por `perfil`.
- NO se toca el output Excel (wrapper preserva byte-equivalencia; tests Excel = red).
- NO se crea un builder PDF por feature (se usa el genérico `construirReportePdf`).
- NO se toca backend ni `api.generated.ts` (el endpoint export de comprobantes ya
  existe; los tipos ya están generados).
