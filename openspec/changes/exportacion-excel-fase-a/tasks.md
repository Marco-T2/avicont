# Tasks: exportacion-excel-fase-a

> Artifact store: hybrid
> Topic key: `sdd/exportacion-excel-fase-a/tasks`
> Fecha: 2026-06-04
> Spec: `openspec/changes/exportacion-excel-fase-a/specs/exportacion-excel/spec.md`
> Convención TDD: cada unidad sigue la secuencia TEST-ROJO → IMPLEMENTACIÓN → TEST-VERDE.
> No se escribe código de implementación antes de que exista el test que lo exige.

---

## Grupo 0 — Dependencia (sin test, prerequisito de todo lo demás)

### T-00: Instalar `write-excel-file` en frontend

- [ ] Desde `frontend/`, ejecutar `pnpm add write-excel-file`.
- [ ] Verificar que el paquete aparece en `frontend/package.json` bajo `dependencies`.
- [ ] Verificar que no introduce CVE conocido (`pnpm audit`).

> **Riesgo**: librería equivocada. Instalar ÚNICAMENTE `write-excel-file` (client build). NO instalar `xlsx`/SheetJS (CVE conocido) ni `exceljs` (~1 MB browser build). Ver Proposal §Librería elegida.

---

## Grupo 1 — `frontend/src/lib/export-excel/formato-celda.ts`

> Cubre: REQ "Formateo es-BO de montos y fechas" (7 escenarios).
> Riesgo §4.6: NUNCA construir `new Date(fechaIso)` sin `T12:00:00` ni depender de zona horaria.
> Riesgo §4.5: la conversión string→Number es SOLO para celda, nunca para recalcular.

### T-01 (TEST ROJO): Vitest — `formato-celda.test.ts`

Crear `frontend/src/lib/export-excel/formato-celda.test.ts` con los siguientes bloques, usando describe/it en **español**. El archivo debe importar las funciones que AÚN NO EXISTEN → corre rojo.

```
describe('formatearFechaCelda', () => {
  it('convierte fecha de día intermedio a dd/mm/yyyy')
    // DADO "2026-06-15" → ENTONCES "15/06/2026"
  it('no corre el día para 2026-01-31 (fin de mes)')
    // DADO "2026-01-31" → ENTONCES "31/01/2026"
    // RIESGO §4.6: si se usa new Date("2026-01-31") UTC → "30/01/2026"
  it('no corre el día para 2026-12-31 (fin de año)')
    // DADO "2026-12-31" → ENTONCES "31/12/2026"
  it('no corre el día para 2026-03-01 (primer día de mes)')
    // DADO "2026-03-01" → ENTONCES "01/03/2026"
    // RIESGO §4.6: UTC−4 puede desplazar al mes anterior
})

describe('parsearMontoCelda', () => {
  it('convierte string decimal "1250.50" al número 1250.50')
    // NO devuelve el string "1.250,50" — eso es formatearMontoBob (pantalla)
  it('convierte string entero "1000" al número 1000')
  it('aplica fallback 0 ante string inválido "abc"')
    // DADO "abc" → ENTONCES 0 (nunca NaN en una celda numérica)
  it('aplica fallback 0 ante string vacío ""')
    // DADO "" → ENTONCES 0
})
```

> Referencia de escenarios spec: "Fecha de día intermedio", "Fecha de fin de mes no se corre de día", "Fecha de fin de año", "Fecha del día 01", "Monto string decimal a número de celda (+)", "Monto entero sin decimales", "Monto string inválido (−)".

### T-02 (IMPLEMENTACIÓN): `formato-celda.ts`

Crear `frontend/src/lib/export-excel/formato-celda.ts`:

- `formatearFechaCelda(fechaIso: string): string`
  - Estrategia determinística sin UTC: partir `fechaIso` por `"-"`, reordenar `[dd, mm, yyyy]` y unir con `"/"`. SIN construir `new Date()` — evita §4.6.
  - Devuelve string (celda de **texto**, no celda de fecha Excel).
- `parsearMontoCelda(monto: string): number`
  - `parseFloat(monto)` → si `isNaN`, fallback `0`. Nunca `NaN` a la celda.
  - NO reutilizar ni copiar `formatearMontoBob` (devuelve string locale, no número).
  - Esta función es el único boundary §4.5 permitido; NO usarla para aritmética.
- Cero `any`. Cero imports de React ni de infraestructura.

> Después de implementar: `pnpm exec vitest run src/lib/export-excel/formato-celda.test.ts` → verde.

---

## Grupo 2 — `frontend/src/lib/export-excel/cabecera-fiscal.ts`

> Cubre: REQ "Bloque de cabecera fiscal" (3 escenarios).
> Riesgo: cabecera fiscal puede tener cualquier combinación de nulls — nunca imprimir `"null"`.

### T-03 (TEST ROJO): Vitest — `cabecera-fiscal.test.ts`

Crear `frontend/src/lib/export-excel/cabecera-fiscal.test.ts`. El archivo importa `armarCabeceraFiscal` que AÚN NO EXISTE → corre rojo.

```
describe('armarCabeceraFiscal', () => {
  it('incluye una fila por cada campo presente (6/6)')
    // DADO todos los campos seteados → ENTONCES 6 filas en orden:
    // razonSocial, nit, direccion, representanteLegal, telefono, email
  it('devuelve array vacío cuando todos los campos son null')
    // DADO { razonSocial: null, nit: null, ... } → ENTONCES []
    // Y ninguna celda contiene el string "null"
  it('no lanza error cuando todos los campos son null')
  it('incluye solo las filas de campos presentes (mezcla razonSocial+nit, 4 en null)')
    // DADO razonSocial="Avicont", nit="1234567", otros 4 null → ENTONCES 2 filas
  it('nunca escribe la cadena literal "null" en ninguna celda')
    // Asegura invariante global de la cabecera
})
```

> Referencia de escenarios spec: "Todos los campos fiscales presentes", "Todos los campos null", "Mezcla de campos presentes y null".

### T-04 (IMPLEMENTACIÓN): `cabecera-fiscal.ts`

Crear `frontend/src/lib/export-excel/cabecera-fiscal.ts`:

- `import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa'`
- `armarCabeceraFiscal(perfil: EmpresaPerfil): CeldaTexto[][]`
  - Iterar los 6 campos en orden (`razonSocial`, `nit`, `direccion`, `representanteLegal`, `telefono`, `email`).
  - Por cada campo NO null: emitir una fila `[{ type: 'texto', value: campo }]`.
  - Por cada campo null: omitir (no emitir fila, no emitir `"null"`).
  - El tipo `CeldaTexto` lo define `construir-hoja.ts` (T-05); si se implementan en orden, importar del index después de T-08.
  - Alternativamente, definir el tipo mínimo `{ type: 'texto'; value: string }` localmente y refactorizar al unificar en index.

> Después de implementar: `pnpm exec vitest run src/lib/export-excel/cabecera-fiscal.test.ts` → verde.

---

## Grupo 3 — `frontend/src/lib/export-excel/construir-hoja.ts`

> Cubre: REQ "Builder genérico de hoja Excel" (5 escenarios).
> Riesgo §4.5: los montos deben ser `type: Number` con `format: '#,##0.00'` — nunca string pre-formateado.

### T-05 (TEST ROJO): Vitest — `construir-hoja.test.ts`

Crear `frontend/src/lib/export-excel/construir-hoja.test.ts`. Importa `construirHoja` y el tipo `Celda` que AÚN NO EXISTEN → corre rojo.

```
describe('construirHoja', () => {
  it('produce un Blob con MIME type xlsx para una matriz válida')
    // DADO una fila con al menos una celda
    // ENTONCES devuelve Blob; blob.type contiene "spreadsheet" o "xlsx"
  it('la celda numérica tiene type Number y format #,##0.00')
    // DADO celda { type: "numero", value: "1250.50" }
    // ENTONCES la celda resultante: type === Number, valor 1250.50, format '#,##0.00'
    // RIESGO §4.5: nunca pasar el string "1.250,50" (locale) como value
  it('la celda de texto tiene type String con el mismo valor')
    // DADO celda { type: "texto", value: "Compra de insumos" }
    // ENTONCES type === String, sin format numérico
  it('no pierde precisión en monto string "1234567.89"')
    // DADO celda { type: "numero", value: "1234567.89" }
    // ENTONCES valor resultante === 1234567.89 (exacto, sin redondeo)
  it('la fila de totales escribe los valores recibidos tal cual (sin sumar)')
    // DADO varias filas numéricas y una fila de totales con valor "5000.00"
    // ENTONCES la celda de totales contiene 5000 (no la suma de las otras filas)
    // Verifica invariante: el builder NO suma columnas — §4.5 Anti-recálculo
})
```

> Referencia de escenarios spec: "Celda numérica con formato de moneda", "Celda de texto", "Monto string decimal no pierde precisión (+)", "El builder no realiza aritmética sobre los montos (−)", "Produce un blob descargable".

> Nota de implementación para el test: `write-excel-file` llama a `URL.createObjectURL` internamente — puede requerir mock en jsdom (`vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })`).

### T-06 (IMPLEMENTACIÓN): `construir-hoja.ts`

Crear `frontend/src/lib/export-excel/construir-hoja.ts`:

- Definir tipos:
  ```typescript
  export interface CeldaNumero { type: 'numero'; value: string }
  export interface CeldaTexto  { type: 'texto';  value: string }
  export type Celda = CeldaNumero | CeldaTexto
  ```
- `construirHoja(filas: Celda[][]): Promise<Blob>`
  - Mapear cada `Celda` al formato de `write-excel-file`:
    - `CeldaNumero` → `{ type: Number, value: parsearMontoCelda(celda.value), format: '#,##0.00' }`
    - `CeldaTexto`  → `{ type: String, value: celda.value }`
  - Llamar a `writeXlsxFile(data, { fileName: undefined })` o equivalente para obtener el Blob.
  - Configurar anchos de columna razonables (ver cómo los define `write-excel-file`).
  - El builder NO suma ni deriva valores. Los `value` de cada celda se escriben tal cual.
- Cero `any`.

> Después de implementar: `pnpm exec vitest run src/lib/export-excel/construir-hoja.test.ts` → verde.

---

## Grupo 4 — `frontend/src/lib/export-excel/descargar-blob.ts`

> Cubre: REQ "Descarga del blob en el navegador" (2 escenarios).
> No tiene riesgos del dominio contable, pero sí un riesgo de fuga de `ObjectURL`.

### T-07 (TEST ROJO): Vitest — `descargar-blob.test.ts`

Crear `frontend/src/lib/export-excel/descargar-blob.test.ts`. Importa `descargarBlob` que AÚN NO EXISTE → corre rojo.

```
describe('descargarBlob', () => {
  it('crea un enlace con el blob como href y lo clica')
    // Mock: URL.createObjectURL, document.createElement('a'), link.click
    // DADO un Blob válido y nombre "libro-diario-2026-06.xlsx"
    // ENTONCES se crea un <a> con href = objectUrl, download = nombre, y se llama click()
  it('revoca la ObjectURL tras disparar el clic (sin fuga)')
    // ENTONCES URL.revokeObjectURL se llama con la misma URL del objeto
  it('el nombre de archivo incluye referencia al informe y al período')
    // Testear la función auxiliar que genera el nombre:
    // DADO ("libro-diario", "2026-06") → ENTONCES "libro-diario-2026-06.xlsx"
    // El nombre está en español con extensión .xlsx — §1
})
```

> Referencia de escenarios spec: "Nombre de archivo derivado del informe y el rango", "Se dispara la descarga".

### T-08 (IMPLEMENTACIÓN): `descargar-blob.ts`

Crear `frontend/src/lib/export-excel/descargar-blob.ts`:

- `generarNombreArchivo(informe: string, rango: string): string`
  - Devuelve `${informe}-${rango}.xlsx` en minúsculas (ej. `"libro-diario-2026-06.xlsx"`).
  - Nombres en español, extensión `.xlsx` — §1.
- `descargarBlob(blob: Blob, nombre: string): void`
  - Crea `<a>` temporal, asigna `href = URL.createObjectURL(blob)` y `download = nombre`.
  - Llama `.click()`.
  - Llama `URL.revokeObjectURL(url)` para liberar memoria.
  - No fuga `ObjectURL`.

> Después de implementar: `pnpm exec vitest run src/lib/export-excel/descargar-blob.test.ts` → verde.

---

## Grupo 5 — `frontend/src/lib/export-excel/index.ts`

> Sin test propio (es barrel file). Prerequisito antes de que el código consumidor importe.

### T-09: API pública del módulo `index.ts`

Crear `frontend/src/lib/export-excel/index.ts` como barrel:

```typescript
export { formatearFechaCelda, parsearMontoCelda } from './formato-celda'
export { armarCabeceraFiscal } from './cabecera-fiscal'
export { construirHoja } from './construir-hoja'
export type { Celda, CeldaNumero, CeldaTexto } from './construir-hoja'
export { descargarBlob, generarNombreArchivo } from './descargar-blob'
```

> Verificar que no hay exports con nombre duplicado. No hay lógica en este archivo.

---

## Grupo 6 — `frontend/src/features/libro-diario/lib/exportar-libro-diario.ts`

> Cubre: REQ "Libro Diario — Exportar a Excel (piloto)" — escenarios de MAPEO (5 de 8).
> Riesgo §4.5: `debeBob`/`haberBob`/`totalDebeBob`/`totalHaberBob` llegan como string decimal — NUNCA sumar en cliente.
> Riesgo §4.6: `fechaContable` llega "YYYY-MM-DD" — usar `formatearFechaCelda` del infra, nunca `formatearFechaLibroDiario` (devuelve string con Intl pero sigue siendo válido; la infra lo hace sin Date).
> Riesgo cabecera null: llamar siempre `armarCabeceraFiscal(perfil)` — tolera todos los campos null.

### T-10 (TEST ROJO): Vitest — `exportar-libro-diario.test.ts`

Crear `frontend/src/features/libro-diario/lib/exportar-libro-diario.test.ts`. Importa `mapearLibroDiarioAFilas` que AÚN NO EXISTE → corre rojo.

```
describe('mapearLibroDiarioAFilas', () => {
  it('aplana asiento→líneas: 2 asientos (2+3 líneas) → 5 filas de detalle')
    // DADO response con asientos[0].lineas.length=2, asientos[1].lineas.length=3
    // ENTONCES la función devuelve exactamente 5 filas de detalle (+ 1 cabecera + 1 totales)
    // Verifica aplanado correcto — escenario "Mapeo de Libro Diario a hoja"
  it('cada fila de detalle contiene: fecha dd/mm/yyyy, codigoCuenta, nombreCuenta, glosa, debeBob (CeldaNumero), haberBob (CeldaNumero)')
    // Verifica que debeBob y haberBob son { type: "numero", value: string }
    // — §4.5: no son strings pre-formateados
  it('la fila de totales usa totalDebeBob y totalHaberBob del backend (sin recálculo)')
    // DADO totalDebeBob="5000.00", totalHaberBob="5000.00"
    // ENTONCES la fila de totales tiene esos valores, no la suma de las filas
    // — §4.5 Anti-recálculo: escenario "Fila de totales con los valores del backend"
  it('marca las filas de un asiento anulado con texto "Anulado"')
    // DADO asiento.anulado=true
    // ENTONCES las filas de ese asiento incluyen una celda con texto "Anulado"
    // — escenario "Asiento anulado marcado en la hoja"
  it('la celda de glosa queda vacía (no "null") cuando glosa es null')
    // DADO linea.glosa=null
    // ENTONCES la celda de glosa es { type: "texto", value: "" }
    // — escenario "Glosa null en una línea no rompe el mapeo"
  it('incluye la cabecera fiscal al inicio cuando todos los campos están presentes')
    // — escenario "Export con cabecera fiscal completa produce el archivo"
  it('no rompe cuando el perfil fiscal tiene todos los campos null')
    // DADO perfil con los 6 campos null
    // ENTONCES el archivo se genera sin error, sin líneas de cabecera vacías
    // — escenario "Export con cabecera fiscal con campos null no rompe (−)"
})
```

> Referencia de escenarios spec: todos los del bloque "Libro Diario — Exportar a Excel (piloto)" excepto los 2 de gating del botón (que se cubren en el componente).

### T-11 (IMPLEMENTACIÓN): `exportar-libro-diario.ts`

Crear `frontend/src/features/libro-diario/lib/exportar-libro-diario.ts`:

- Imports:
  ```typescript
  import type { LibroDiarioResponse } from '@/types/api'
  import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa'
  import { armarCabeceraFiscal, formatearFechaCelda, parsearMontoCelda } from '@/lib/export-excel'
  import type { Celda } from '@/lib/export-excel'
  ```
- `mapearLibroDiarioAFilas(response: LibroDiarioResponse, perfil: EmpresaPerfil): Celda[][]`
  - Emitir filas de cabecera fiscal (`armarCabeceraFiscal(perfil)` — tolera null).
  - Emitir fila de encabezados de columna: `["Fecha", "Código", "Cuenta", "Glosa", "Debe (BOB)", "Haber (BOB)", "Estado"]` (todas `CeldaTexto`).
  - Por cada `asiento` en `response.asientos`, por cada `linea` en `asiento.lineas`, emitir fila:
    - `fechaContable`: `formatearFechaCelda(asiento.fechaContable)` → `CeldaTexto` (texto, no celda fecha Excel — §4.6).
    - `codigoCuenta`, `nombreCuenta`: `CeldaTexto`.
    - `glosa`: `CeldaTexto` con `value: linea.glosa ?? ''` — NUNCA imprimir `"null"`.
    - `debeBob`: `CeldaNumero` con `value: linea.debeBob` (el builder lo convierte a Number vía `parsearMontoCelda`).
    - `haberBob`: `CeldaNumero` con `value: linea.haberBob`.
    - `estado`: `CeldaTexto` con `value: asiento.anulado ? 'Anulado' : ''`.
  - Emitir fila de totales con `totalDebeBob` y `totalHaberBob` del backend como `CeldaNumero` — SIN recalcular (`response.totalDebeBob` y `response.totalHaberBob` se usan tal cual).
- Cero `any`. Cero aritmética sobre montos.

> Después de implementar: `pnpm exec vitest run src/features/libro-diario/lib/exportar-libro-diario.test.ts` → verde.

---

## Grupo 7 — `frontend/src/features/libro-diario/components/boton-exportar-libro-diario.tsx`

> Cubre: REQ "Libro Diario — Exportar a Excel" — escenarios de GATING (2 de 8).
> Riesgo: botón habilitado sin datos → validar con `disabled={!data}`.

### T-12 (TEST ROJO): Vitest + Testing Library — `boton-exportar-libro-diario.test.tsx`

Crear `frontend/src/features/libro-diario/components/boton-exportar-libro-diario.test.tsx`. Importa `BotonExportarLibroDiario` que AÚN NO EXISTE → corre rojo.

```
describe('BotonExportarLibroDiario', () => {
  it('muestra "Exportar a Excel" como texto del botón')
    // UI en español — §1
  it('el botón está deshabilitado cuando data es undefined')
    // DADO data={undefined}
    // ENTONCES el botón tiene atributo disabled
    // — escenario "Botón deshabilitado sin datos"
  it('el botón está habilitado cuando hay data (con permiso)')
    // DADO data={...response válida} y mock usePermissions con libro-diario.read=true
    // ENTONCES el botón NO tiene disabled
  it('el botón está deshabilitado con tooltip cuando falta el permiso')
    // Mock usePermissions con libro-diario.read=false
    // ENTONCES el botón tiene disabled y existe un TooltipContent visible
    // — escenario "Botón gateado sin permiso"
    // Envolver en <TooltipProvider> para que el tooltip se monte
  it('llama a construirHoja y descargarBlob al hacer clic (con datos y permiso)')
    // Mock: vi.mock('@/lib/export-excel') → construirHoja = vi.fn(async () => new Blob())
    //                                       descargarBlob = vi.fn()
    // DADO data válida, permiso presente
    // CUANDO el usuario hace clic
    // ENTONCES construirHoja se llamó con las filas del mapeo
    // Y descargarBlob se llamó con el blob y un nombre .xlsx
})
```

> Referencia de escenarios spec: "Botón gateado sin permiso", "Botón deshabilitado sin datos".

### T-13 (IMPLEMENTACIÓN): `boton-exportar-libro-diario.tsx`

Crear `frontend/src/features/libro-diario/components/boton-exportar-libro-diario.tsx`:

- Props:
  ```typescript
  interface Props {
    data: LibroDiarioResponse | undefined
    perfil: EmpresaPerfil | undefined
    rango: string  // ej. "2026-06" para el nombre del archivo
  }
  ```
- Usa `PermissionButton` con `permission={PERMISSIONS.libroDiario.read}` y `deniedReason="No tenés permiso para exportar el Libro Diario"`.
- El botón está `disabled` si `!data` (sin datos) O si el `PermissionButton` lo deshabilita por permiso.
  - Implementar el `disabled` de falta de datos directamente en el `PermissionButton` como prop adicional: `<PermissionButton ... disabled={!data || ...buttonProps.disabled}`.
  - Alternativa si `PermissionButton` no permite componer `disabled` externo: envolver en lógica propia (verificar implementación del componente antes de codear).
- Al hacer clic, ejecutar:
  1. `const filas = mapearLibroDiarioAFilas(data, perfil ?? {razonSocial:null,...})`.
  2. `const blob = await construirHoja(filas)`.
  3. `descargarBlob(blob, generarNombreArchivo('libro-diario', rango))`.
- Estado de carga `"Generando…"` mientras el `await` procesa (evita doble clic — Anti-F-07).
- Cero `any`. Cero re-fetch del informe (usa la `data` recibida por prop — la data ya está en cache).
- Texto del botón: "Exportar a Excel" (español, §1).

> Después de implementar: `pnpm exec vitest run src/features/libro-diario/components/boton-exportar-libro-diario.test.tsx` → verde.

---

## Grupo 8 — Integración en `LibroDiarioPage`

> Sin test nuevo (la página ya tiene tests existentes; este task solo monta el componente nuevo).
> Prerequisito: T-13 completado.

### T-14: Montar `BotonExportarLibroDiario` en `libro-diario-page.tsx`

Modificar `frontend/src/features/libro-diario/pages/libro-diario-page.tsx`:

- Importar `useEmpresa` desde `@/features/tenants/hooks/use-empresa`.
- Llamar `const { data: empresa } = useEmpresa()` en el cuerpo del componente.
  - `// Cross-feature: perfil fiscal para la cabecera del export a Excel.` (§14.6).
- Calcular `rango` a partir de `params` ya disponible:
  - Si `params.periodoFiscalId`, usar `params.periodoFiscalId` como fallback de rango (o el id del período).
  - Si `params.fechaDesde` y `params.fechaHasta`, usar `"${params.fechaDesde}_${params.fechaHasta}"`.
  - Si sin params, usar `"sin-rango"` (el botón estará disabled porque `data` es undefined).
- Agregar `<BotonExportarLibroDiario data={data} perfil={empresa} rango={rango} />` en el header canónico (dentro del `div` derecho del flex, junto al área de acciones — §13.1).
- La `data` que se pasa es la misma del hook `useLibroDiario(params)` — NO re-fetchea.
- No alterar la lógica de filtros, tabla ni estados de carga existentes.

> Verificar visualmente que el botón aparece en el header cuando hay datos y se deshabilita sin ellos.

---

## Grupo 9 — Verificación final

### T-15: TypeScript — `pnpm exec tsc -b` (NO `--noEmit` en frontend)

> Convención del repo: en `frontend/`, el comando correcto es `pnpm exec tsc -b` (no `--noEmit`).
> Ver CLAUDE.md §11.4 y la nota en el MEMORY del proyecto.

- [ ] Desde `frontend/`: `pnpm exec tsc -b`
- [ ] Resultado: cero errores.
- [ ] Si hay errores de tipos (ej. `EmpresaPerfil` con campo undefined), corregir en el archivo correspondiente sin usar `any` ni `!`.

### T-16: Lint — `pnpm run lint`

> Correr COMPLETO, no solo sobre los archivos modificados.
> GOTCHA documentado en el MEMORY: el CI caza prettier/lint que un run parcial no ve.

- [ ] Desde `frontend/`: `pnpm run lint`
- [ ] Resultado: cero errores, cero warnings en los archivos nuevos.
- [ ] Si hay warnings de `no-explicit-any` o `no-floating-promises`: corregir antes de commit.

### T-17: Tests — `pnpm exec vitest run`

- [ ] Desde `frontend/`: `pnpm exec vitest run`
- [ ] Resultado: todos los tests pasan (incluyendo los preexistentes — sin regresión).
- [ ] Conteo esperado de tests nuevos por archivo:
  - `formato-celda.test.ts`: 8 its (4 fechas + 4 montos)
  - `cabecera-fiscal.test.ts`: 5 its
  - `construir-hoja.test.ts`: 5 its
  - `descargar-blob.test.ts`: 3 its
  - `exportar-libro-diario.test.ts`: 7 its
  - `boton-exportar-libro-diario.test.tsx`: 5 its
  - **Total mínimo**: ~33 its nuevos.
- [ ] Cobertura de los 25 escenarios del spec: verificar que cada escenario tiene al menos un `it` correspondiente.

---

## Resumen de tasks por grupo

| Grupo | Tasks | Archivos | Tests |
|-------|-------|----------|-------|
| 0 — Dep | T-00 | `package.json` | — |
| 1 — formato-celda | T-01, T-02 | `formato-celda.ts` + test | 8 its |
| 2 — cabecera-fiscal | T-03, T-04 | `cabecera-fiscal.ts` + test | 5 its |
| 3 — construir-hoja | T-05, T-06 | `construir-hoja.ts` + test | 5 its |
| 4 — descargar-blob | T-07, T-08 | `descargar-blob.ts` + test | 3 its |
| 5 — index | T-09 | `index.ts` | — |
| 6 — exportar-libro-diario | T-10, T-11 | `exportar-libro-diario.ts` + test | 7 its |
| 7 — boton-exportar | T-12, T-13 | `boton-exportar-libro-diario.tsx` + test | 5 its |
| 8 — integración página | T-14 | `libro-diario-page.tsx` (mod.) | — |
| 9 — verificación | T-15, T-16, T-17 | — (gates de calidad) | todos pasan |

**Total: 18 tasks, ~33 its nuevos.**

---

## Orden de dependencias

```
T-00 (instalar dep)
  └── T-01/T-02 (formato-celda) — sin deps del proyecto
        └── T-03/T-04 (cabecera-fiscal) — usa EmpresaPerfil (ya existe)
              └── T-05/T-06 (construir-hoja) — usa parsearMontoCelda de T-02
                    └── T-07/T-08 (descargar-blob) — independiente del builder
                          └── T-09 (index) — barrel de todos los anteriores
                                └── T-10/T-11 (exportar-libro-diario) — usa index + types/api
                                      └── T-12/T-13 (boton-exportar) — usa mapper + lib + PermissionButton
                                            └── T-14 (integración página) — monta el botón
                                                  └── T-15/T-16/T-17 (verificación final)
```

> T-07/T-08 (descargar-blob) es independiente de construir-hoja y puede implementarse en paralelo con T-05/T-06 si se trabaja con dos contextos.
