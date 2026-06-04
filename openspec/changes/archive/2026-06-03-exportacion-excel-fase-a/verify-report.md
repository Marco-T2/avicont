# Verify Report: exportacion-excel-fase-a

> Fecha: 2026-06-04
> Reviewer: sdd-verify (adversarial)
> Branch: `feat/reportes-export-excel-fase-a`
> **Status: APROBADO_CON_WARNINGS**

---

## Executive Summary

La implementación del change `exportacion-excel-fase-a` está **funcionalmente correcta**. Los invariantes críticos del dominio (§4.5, §4.6, null safety, gating) se respetan en el código de producción. Los 25 escenarios del spec tienen cobertura de test, build tsc limpio, lint limpio y 1132 tests pasan (33 nuevos). Sin backend changes. Sin scope creep.

Se identificaron **2 WARNINGs** de calidad de tests en `construir-hoja.test.ts`: dos tests son tautológicos y no verifican realmente la invariante que declaran cubrir. No son CRITICAL porque las invariantes sí están enforzadas en el código de producción — solo la cobertura de test es frágil.

---

## Ejecución real de herramientas

### TypeScript — `pnpm exec tsc -b`
```
(sin output = cero errores)
```
**VERDE. 0 errores.**

### Lint — `pnpm run lint`
```
(sin output = cero errores)
```
**VERDE. 0 errores.**

### Vitest — `pnpm exec vitest run`
```
 Test Files  160 passed (160)
      Tests  1132 passed (1132)
   Start at  23:09:19
   Duration  34.41s
```
**VERDE. 1132/1132 (33 tests nuevos, 0 regresiones).**

---

## Hallazgos CRITICAL

**Ninguno.**

---

## Hallazgos WARNING

### W-1: Test tautológico en `construir-hoja.test.ts` — escenario "Celda numérica con formato de moneda"

**Archivo**: `frontend/src/lib/export-excel/construir-hoja.test.ts`, líneas 24–34

**Descripción**: El test `'la celda numérica tiene type Number y format #,##0.00'` NO llama a `construirHoja`. Solo llama a `parsearMontoCelda` (que tiene sus propios tests en `formato-celda.test.ts`) y verifica `typeof montoParsado === 'number'`. El formato `'#,##0.00'` que es la invariante central del escenario **nunca se verifica**. Un mutante que cambie `format: '#,##0.00'` a `format: '#,##0'` (o lo elimine) pasaría este test sin problemas.

**Por qué importa**: La invariante del spec ("las celdas numéricas DEBEN escribirse con `type: Number` y formato `#,##0.00`") queda sin cobertura de test real. El código de producción es correcto — la implementación en `construir-hoja.ts` línea 41 sí asigna el formato correcto — pero el test no lo protege contra regresiones.

**Fix sugerido** (opcional, no bloqueante):
```typescript
it('la celda numérica tiene type Number y format #,##0.00', async () => {
  // Para inspeccionar las celdas internas, mockear writeXlsxFile y capturar el argumento
  const capturedData: unknown[] = [];
  vi.mocked(writeXlsxFile).mockImplementationOnce(async (data: unknown) => {
    capturedData.push(data);
    return { toBlob: async () => new Blob(), toFile: async () => undefined };
  });
  
  const filas: Celda[][] = [[{ type: 'numero', value: '1250.50' }]];
  await construirHoja(filas);
  
  const primeraFila = (capturedData[0] as unknown[][])[0];
  const celda = (primeraFila as unknown[])[0];
  expect(celda).toMatchObject({ type: Number, value: 1250.5, format: '#,##0.00' });
});
```
O alternativamente: extraer la función de mapeo de celda como función pura exportada y testearla directamente.

---

### W-2: Test tautológico en `construir-hoja.test.ts` — escenario "Builder no realiza aritmética"

**Archivo**: `frontend/src/lib/export-excel/construir-hoja.test.ts`, líneas 70–72

**Descripción**: La aserción de la invariante anti-recálculo es:
```typescript
expect(parsearMontoCelda('2000.00') + parsearMontoCelda('3000.00')).not.toBe(
  parsearMontoCelda('5000.00') + parsearMontoCelda('2000.00') + parsearMontoCelda('3000.00'),
);
```
Esto evalúa `5000 !== 10000`, que es **siempre verdadero**, completamente independiente del comportamiento del builder. Un mutante que introdujera `datos.reduce(...)` en el builder pasaría este test igual.

El test sí produce un Blob correctamente (línea 65 lo verifica), pero la invariante específica "el builder no suma" no está verificada de forma significativa.

**Por qué importa**: La cobertura del escenario "El builder no realiza aritmética sobre los montos (caso −)" del spec es superficial. El código de producción es correcto (el builder es un `.map()` puro), pero si se introdujera un bug de suma accidental, este test no lo capturaría.

**Fix sugerido** (opcional, no bloqueante): El escenario es mejor cubierto en `exportar-libro-diario.test.ts` donde se verifica que `totalDebeBob` se pasa tal cual del backend. Ese test sí es significativo. En `construir-hoja.test.ts` el anti-recálculo se puede eliminar o reemplazar por uno que mockee `writeXlsxFile` y capture el argumento para verificar que los valores no fueron modificados.

---

## Hallazgos SUGGESTION

### S-1: Columnas hardcodeadas a 7 en `construir-hoja.ts` vs filas de cabecera fiscal con 1 celda

**Archivo**: `frontend/src/lib/export-excel/construir-hoja.ts`, líneas 51–59

La configuración `columns: [{ width: 14 }, ..., { width: 10 }]` tiene 7 entradas, pero las filas de cabecera fiscal generadas por `armarCabeceraFiscal` tienen solo 1 celda. La librería `write-excel-file` tolera filas con menos celdas que columnas (no rompe), pero los anchos de columna quedan "fijos" en 7 aunque las filas de cabecera usen menos. Funcionalmente correcto; es un detalle cosmético.

**Si a futuro se quiere que la cabecera fiscal ocupe el span completo** se podría usar una celda con `span` o generar la cabecera como hojas separadas. No es necesario para Fase A.

---

## Verificación adversarial de invariantes

### §4.5 Money string → celda sin aritmética

**PASA.**

- `parsearMontoCelda` hace `parseFloat(monto)` — único boundary string→Number en el código.
- No se encontró `+` aritmético, `.reduce()`, ni `formatearMontoBob` en ningún path del export.
- `construirHoja` es un `.map()` puro que nunca suma columnas.
- `mapearLibroDiarioAFilas` usa `totalDebeBob`/`totalHaberBob` directamente del backend como `{ type: 'numero', value: response.totalDebeBob }` — no suma líneas.
- Búsqueda exhaustiva de `parseFloat|Number(|\.reduce|\.sum|formatearMontoBob` en todos los archivos del change: solo aparece en `formato-celda.ts` (el boundary autorizado).

### §4.6 FechaContable sin UTC

**PASA.**

- `formatearFechaCelda` parte `fechaIso.split('-')` y reordena — cero `new Date()`, `Date.`, `toISOString`, `toLocaleDateString`, ni `Intl.DateTimeFormat`.
- Los 4 casos límite (día intermedio, fin de mes, fin de año, día 01) tienen tests explícitos.

### Cabecera nullable — ningún "null" literal

**PASA.**

- `armarCabeceraFiscal` filtra con `.filter((campo): campo is string => campo !== null)` — los `null` nunca llegan al `value` de ninguna celda.
- `mapearLibroDiarioAFilas` usa `linea.glosa ?? ''` para la glosa — nunca `String(null)` ni template literal con null.

### Gating por `contabilidad.libro-diario.read`

**PASA.**

- `BotonExportarLibroDiario` usa `<PermissionButton permission={PERMISSIONS.contabilidad.libroDiario.read}>`.
- `PERMISSIONS.contabilidad.libroDiario.read` = `'contabilidad.libro-diario.read'` (espeja el catálogo backend).
- `PermissionButton` es el mecanismo establecido del repo (§14.7 frontend CLAUDE.md).
- `disabled={!data || generando}` está correctamente compuesto con el gating de permiso.

### Cero `any` en código de producción

**PASA.** Búsqueda exhaustiva en todos los archivos del change: sin resultado.

### Sin cambios en backend

**PASA.** `git status` confirma que los únicos archivos modificados son:
- `frontend/package.json` (agregado `write-excel-file`)
- `frontend/pnpm-lock.yaml`
- `frontend/src/features/libro-diario/pages/libro-diario-page.tsx`

Los archivos nuevos son todos en `frontend/src/`.

### Sin scope creep (Libro Mayor / Balance / Resultados / Comprobantes)

**PASA.** El directorio `openspec/changes/exportacion-excel-reportes/` contiene solo `exploration.md` (documento de planificación para Fase B) — sin código.

---

## Cobertura de los 25 escenarios del spec

| # | Escenario del spec | Test que lo cubre | Estado |
|---|---|---|---|
| 1 | Celda numérica con formato de moneda | `construir-hoja.test.ts` — 'la celda numérica tiene type Number...' | ⚠️ WARNING-1 (test tautológico) |
| 2 | Celda de texto | `construir-hoja.test.ts` — 'la celda de texto tiene type String' | ✅ |
| 3 | Monto string decimal no pierde precisión (+) | `construir-hoja.test.ts` — 'no pierde precisión en monto string 1234567.89' | ✅ |
| 4 | Builder no realiza aritmética (−) | `construir-hoja.test.ts` — 'la fila de totales escribe los valores tal cual' | ⚠️ WARNING-2 (test tautológico) |
| 5 | Produce un blob descargable | `construir-hoja.test.ts` — 'produce un Blob con MIME type xlsx' | ✅ |
| 6 | Todos los campos fiscales presentes | `cabecera-fiscal.test.ts` — 'incluye una fila por campo (6/6)' | ✅ |
| 7 | Todos los campos null | `cabecera-fiscal.test.ts` — 'devuelve array vacío cuando todos son null' | ✅ |
| 8 | Mezcla de campos presentes y null | `cabecera-fiscal.test.ts` — 'incluye solo las filas de campos presentes' | ✅ |
| 9 | Fecha de día intermedio | `formato-celda.test.ts` — 'convierte fecha de día intermedio a dd/mm/yyyy' | ✅ |
| 10 | Fecha de fin de mes no se corre de día | `formato-celda.test.ts` — 'no corre el día para 2026-01-31 (fin de mes)' | ✅ |
| 11 | Fecha de fin de año no se corre de día | `formato-celda.test.ts` — 'no corre el día para 2026-12-31 (fin de año)' | ✅ |
| 12 | Fecha del día 01 no se corre al mes anterior | `formato-celda.test.ts` — 'no corre el día para 2026-03-01 (primer día)' | ✅ |
| 13 | Monto string decimal a número de celda (+) | `formato-celda.test.ts` — 'convierte string decimal 1250.50 al número' | ✅ |
| 14 | Monto entero sin decimales | `formato-celda.test.ts` — 'convierte string entero 1000 al número 1000' | ✅ |
| 15 | Monto string inválido (−) | `formato-celda.test.ts` — 'aplica fallback 0 ante string inválido abc' + vacío | ✅ |
| 16 | Nombre de archivo derivado del informe y rango | `descargar-blob.test.ts` — 'el nombre de archivo incluye referencia al informe' | ✅ |
| 17 | Se dispara la descarga | `descargar-blob.test.ts` — 'crea un enlace con el blob como href y lo clica' | ✅ |
| 18 | Mapeo de Libro Diario a hoja (estructura aplanada) | `exportar-libro-diario.test.ts` — 'aplana asiento→líneas: 2 asientos (2+3)' | ✅ |
| 19 | Fila de totales con los valores del backend | `exportar-libro-diario.test.ts` — 'la fila de totales usa totalDebeBob...' | ✅ |
| 20 | Asiento anulado marcado en la hoja | `exportar-libro-diario.test.ts` — 'marca las filas de un asiento anulado' | ✅ |
| 21 | Glosa null no rompe el mapeo | `exportar-libro-diario.test.ts` — 'la celda de glosa queda vacía (no null)' | ✅ |
| 22 | Export con cabecera fiscal completa produce el archivo | `exportar-libro-diario.test.ts` — 'incluye la cabecera fiscal al inicio' | ✅ |
| 23 | Export con cabecera null no rompe (−) | `exportar-libro-diario.test.ts` — 'no rompe cuando el perfil fiscal tiene todos null' | ✅ |
| 24 | Botón gateado sin permiso | `boton-exportar-libro-diario.test.tsx` — 'el botón está deshabilitado con tooltip...' | ✅ |
| 25 | Botón deshabilitado sin datos | `boton-exportar-libro-diario.test.tsx` — 'el botón está deshabilitado cuando data es undefined' | ✅ |

**25/25 escenarios cubiertos. 2 con cobertura de test frágil (W-1, W-2).**

---

## Conteo de tests nuevos

| Archivo | Tests nuevos |
|---|---|
| `formato-celda.test.ts` | 8 |
| `cabecera-fiscal.test.ts` | 5 |
| `construir-hoja.test.ts` | 5 |
| `descargar-blob.test.ts` | 3 |
| `exportar-libro-diario.test.ts` | 7 |
| `boton-exportar-libro-diario.test.tsx` | 5 |
| **Total** | **33** |

---

## Veredicto final

**APROBADO_CON_WARNINGS**

Los 2 WARNINGs son de calidad de test, no de correctitud de código. El código de producción es correcto. Se puede mergear. Se recomienda cerrar W-1 y W-2 antes o durante la Fase B para que los tests del builder protejan contra regresiones cuando se reutilice la infraestructura con otros informes.
