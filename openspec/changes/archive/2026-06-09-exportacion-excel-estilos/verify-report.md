# Verification Report

**Change**: exportacion-excel-estilos
**Version**: N/A (delta spec sobre exportacion-excel)
**Mode**: Strict TDD (vitest, TDD RED→GREEN por tasks)
**Verifier**: sdd-verify sub-agent (adversarial)
**Date**: 2026-06-09

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 20 |
| Tasks complete | 19 |
| Tasks incomplete | 1 |

**Incomplete tasks:**
- `[ ] 9.4` Smoke manual: exportar cada uno de los 5 informes y abrir el `.xlsx` — verificar negritas en encabezados y totales, montos alineados a la derecha, cabecera fiscal con etiquetas

(Smoke manual es por definición fuera del gate automatizado; no bloquea.)

---

## Build & Tests Execution

**TypeScript build** (`pnpm exec tsc -b`): ✅ Passed (exit code 0, 0 errores)

**Lint** (`pnpm run lint` — COMPLETO): ✅ Passed (exit code 0, 0 errores)

**Tests** (`pnpm exec vitest run`):
```
Test Files  169 passed (169)
     Tests  1216 passed (1216)
  Start at  21:35:50
  Duration  36.43s
EXIT_CODE: 0
```
✅ 1216/1216 passed, 0 failed, 0 skipped.

(Suite anterior: 1176 tests — Fase C terminó en 1176. Esta fase agrega ~40 tests nuevos. Confirmado: el número creció, ninguno falló.)

**Coverage**: No ejecutado (no configurado con threshold en este proyecto).

---

## Spec Compliance Matrix

### Requisito: Props de estilo opcionales en `Celda`

| Escenario | Test | Resultado |
|-----------|------|-----------|
| fontWeight se propaga | `construir-hoja.test.ts > (estilo-a) CeldaNumero con fontWeight:"bold" → sheetData[r][c].fontWeight === "bold"` | ✅ COMPLIANT |
| Sin estilo — retrocompatible | `construir-hoja.test.ts > (estilo-c) CeldaTexto SIN estilo → output NO tiene fontWeight ni align (retrocompat)` | ✅ COMPLIANT |
| §4.5 intacto con estilo | `construir-hoja.test.ts > (estilo-e) §4.5 intacto con estilo: value === parsearMontoCelda(...) y format === "#,##0.00"` | ✅ COMPLIANT |

### Requisito: Alineación derecha por defecto en `CeldaNumero`

| Escenario | Test | Resultado |
|-----------|------|-----------|
| Default right y override | `construir-hoja.test.ts > (estilo-b) CeldaNumero SIN align → output tiene align === "right"` + `(estilo-d) override: CeldaNumero con align:"left" → output align === "left"` | ✅ COMPLIANT |
| CeldaTexto sin align | `construir-hoja.test.ts > (estilo-c) CeldaTexto SIN estilo → output NO tiene fontWeight ni align` | ✅ COMPLIANT |

### Requisito: Cabeceras de columna en negrita

| Escenario | Test | Resultado |
|-----------|------|-----------|
| Encabezados en negrita (Libro Diario) | `exportar-libro-diario.test.ts > (estilo) fila de encabezados de columna → todas las celdas con fontWeight:"bold"` | ✅ COMPLIANT |
| Encabezados en negrita (Libro Mayor) | `exportar-libro-mayor.test.ts > (estilo) fila de encabezados de columna → todas las celdas con fontWeight:"bold"` | ✅ COMPLIANT |
| Encabezados en negrita (Balance General) | `exportar-balance-general.test.ts > (estilo) fila de encabezados de columna → todas las celdas con fontWeight:"bold"` | ✅ COMPLIANT |
| Encabezados en negrita (Estado de Resultados) | `exportar-estado-resultados.test.ts > (estilo) fila de encabezados de columna → todas las celdas con fontWeight:"bold"` | ✅ COMPLIANT |
| Encabezados en negrita (Comprobantes) | `exportar-comprobantes.test.ts > (12) fila de encabezados de columna → todas las celdas con fontWeight:"bold"` | ✅ COMPLIANT |

### Requisito: Filas de totales y subtotales en negrita

| Escenario | Test | Resultado |
|-----------|------|-----------|
| Total general en negrita (Libro Diario) | `exportar-libro-diario.test.ts > (estilo) fila TOTAL → todas las celdas con fontWeight:"bold"` | ✅ COMPLIANT |
| Total general en negrita (Libro Mayor) | `exportar-libro-mayor.test.ts > (estilo) fila TOTAL → todas las celdas con fontWeight:"bold"` | ✅ COMPLIANT |
| Subtotales jerárquicos en negrita (Balance) | `exportar-balance-general.test.ts > (estilo) filas TOTAL ACTIVO, TOTAL PASIVO, TOTAL PATRIMONIO y cuadre → todas las celdas con fontWeight:"bold"` + `aplanar-arbol.test.ts > (estilo) filas de sección y subsección llevan fontWeight:"bold"` | ✅ COMPLIANT |
| Subtotales jerárquicos en negrita (Estado de Resultados) | `exportar-estado-resultados.test.ts > (estilo) filas TOTAL INGRESOS, TOTAL EGRESOS y Resultado del Ejercicio → fontWeight:"bold"` | ✅ COMPLIANT |
| Detalle sin negrita (Balance) | `exportar-balance-general.test.ts > (estilo) filas de cuenta de detalle → SIN fontWeight` + `aplanar-arbol.test.ts > (estilo) filas de cuenta de detalle NO llevan fontWeight` | ✅ COMPLIANT |
| Detalle sin negrita (Estado de Resultados) | `exportar-estado-resultados.test.ts > (estilo) filas de cuenta de detalle → SIN fontWeight` | ✅ COMPLIANT |
| Comprobantes — sin fila de totales | `exportar-comprobantes.test.ts > (13) NO existe fila de totales — este informe no agrega montos` | ✅ COMPLIANT |

### Requisito: Bloque de cabecera fiscal (MODIFIED)

| Escenario | Test | Resultado |
|-----------|------|-----------|
| Todos los campos presentes → razonSocial negrita, sin etiqueta; resto con etiqueta | `cabecera-fiscal.test.ts > (estilo-a) razón social → fila con fontWeight:"bold"` + `(estilo-b) nit presente → value === "NIT: <valor>" SIN fontWeight` + `(estilo-e) orden preservado` | ✅ COMPLIANT |
| razonSocial null — sin negrita | `cabecera-fiscal.test.ts > (estilo-d) todos null salvo email → 1 fila con "Email: ..." SIN fontWeight` | ✅ COMPLIANT |
| Campo null omitido | `cabecera-fiscal.test.ts > (estilo-c) campo null (direccion) → no genera fila, nunca "Dirección: null"` | ✅ COMPLIANT |
| Todos null — sin error | `cabecera-fiscal.test.ts > devuelve array vacío cuando todos los campos son null` + `no lanza error cuando todos los campos son null` | ✅ COMPLIANT |

**Compliance summary**: 13/13 escenarios compliant.

---

## Correctness (Static — Structural Evidence)

| Requisito | Status | Notas |
|-----------|--------|-------|
| `CeldaEstilo` base con `fontWeight?` y `align?` planos | ✅ Implementado | `construir-hoja.ts:9-12` — exactamente la forma del design |
| `CeldaNumero` y `CeldaTexto` extienden `CeldaEstilo` | ✅ Implementado | `construir-hoja.ts:19,27` |
| Spread condicional (exactOptionalPropertyTypes) | ✅ Implementado | `construir-hoja.ts:71-80` — `...(celda.fontWeight !== undefined ? {...} : {})` |
| Default `align:'right'` en `CeldaNumero` | ✅ Implementado | `construir-hoja.ts:76` — `celda.align ?? 'right'` |
| `CeldaTexto` sin `align` → sin prop en output | ✅ Implementado | `construir-hoja.ts:77-79` — spread condicional |
| `parsearMontoCelda` único boundary string→Number | ✅ Verificado | `construir-hoja.ts:85` — `value: parsearMontoCelda(celda.value)` — sin aritmética adicional |
| `CeldaTextoLocal` eliminado de `cabecera-fiscal.ts` | ✅ Implementado | El archivo importa `CeldaTexto` de `./construir-hoja` |
| Etiquetas fiscales con prefijo por campo | ✅ Implementado | `cabecera-fiscal.ts:10-19` — mapa CAMPOS_FISCALES correcto |
| Filter null ANTES de componer string | ✅ Implementado | `cabecera-fiscal.ts:35` — `.filter(({ campo }) => perfil[campo] !== null)` |
| razonSocial: negrita condicional a su presencia | ✅ Implementado | `cabecera-fiscal.ts:40-43` — `etiqueta === undefined` → `fontWeight: 'bold'` |
| `aplanar-arbol.ts`: sección/subsección/subtotales en negrita | ✅ Implementado | `aplanar-arbol.ts:61-99` — fontWeight:'bold' en todos los agrupadores |
| Detalle de cuentas sin fontWeight | ✅ Implementado | `aplanar-arbol.ts:80-84` — filas de cuenta sin prop `fontWeight` |
| Los 5 ensambladores con encabezados en negrita | ✅ Implementado | Verificado en los 5 archivos `.ts` |
| Fila de TOTAL en negrita (Libro Diario, Libro Mayor) | ✅ Implementado | `exportar-libro-diario.ts:67-75`, `exportar-libro-mayor.ts` análogo |
| `index.ts` re-exporta `CeldaEstilo` | ✅ Implementado | `index.ts:4` — `CeldaEstilo` en el re-export |

---

## §4.5 Anti-recálculo: verificación adversarial

El `value` numérico en `construirHoja` sale ÚNICAMENTE de `parsearMontoCelda(celda.value)` (`construir-hoja.ts:85`). El objeto `estilo` solo contiene `fontWeight` y `align` — no toca `value` ni `format`. El spread `...estilo` ocurre DESPUÉS de que el valor ya fue computado, y solo añade propiedades de presentación. No hay aritmética colada.

Verificado también con el test `(estilo-e) §4.5 intacto con estilo` que asevera `value === parsearMontoCelda('9876.54')` y `format === '#,##0.00'` con estilo activo.

---

## Retrocompatibilidad: verificación adversarial

Las filas de detalle en `exportar-libro-diario.test.ts` usan `toEqual({ type: 'texto', value: '10/06/2026' })` — esto es una igualdad ESTRICTA del objeto completo. Si `fontWeight` o `align` estuvieran presentes en la celda de detalle, este assert fallaría. El test pasa: las celdas de detalle son idénticas a antes de la implementación de estilos.

---

## Coherence (Design)

| Decisión | Seguida? | Notas |
|----------|----------|-------|
| Props de estilo planas (no sub-objeto `estilo`) | ✅ Sí | `CeldaEstilo` es base con props directas; `CeldaNumero`/`CeldaTexto` extienden |
| `align:'right'` default en `construirHoja`, NO en ensambladores | ✅ Sí | Ningún ensamblador repite `align:'right'` en montos; solo el builder lo aplica |
| `cabecera-fiscal.ts` usa `CeldaTexto`, elimina duplicado | ✅ Sí | Importa `CeldaTexto` de `./construir-hoja`; `CeldaTextoLocal` eliminado |
| Etiquetas fiscales vía mapa campo→etiqueta | ✅ Sí | `CAMPOS_FISCALES: ReadonlyArray<{etiqueta?, campo}>` — forma exacta del design |
| Negrita en encabezados + totales en los 5 ensambladores | ✅ Sí | Todos los archivos relevantes modificados |
| `aplanar-arbol.ts` marca subtotales sección/subsección | ✅ Sí | Las 4 filas de agrupación tienen `fontWeight:'bold'` |

Tabla de archivos del design vs implementación:

| Archivo (design) | Estado real |
|-----------------|-------------|
| `lib/export-excel/construir-hoja.ts` | ✅ Modificado |
| `lib/export-excel/cabecera-fiscal.ts` | ✅ Modificado |
| `lib/export-excel/aplanar-arbol.ts` | ✅ Modificado |
| `features/libro-diario/lib/exportar-libro-diario.ts` | ✅ Modificado |
| `features/libro-mayor/lib/exportar-libro-mayor.ts` | ✅ Modificado |
| `features/balance-general/lib/exportar-balance-general.ts` | ✅ Modificado |
| `features/estado-resultados/lib/exportar-estado-resultados.ts` | ✅ Modificado |
| `features/comprobantes/lib/exportar-comprobantes.ts` | ✅ Modificado |
| `lib/export-excel/index.ts` | ✅ Modificado (re-exporta `CeldaEstilo`) |

---

## Issues Found

**CRITICAL**: Ninguno.

**WARNING**:

- **W1** — Escenario `razonSocial: null` con otro campo presente (e.g. nit) NO tiene test que asevere EXPLÍCITAMENTE que ese campo no recibe `fontWeight`. El test `(estilo-d)` cubre `razonSocial=null` con `email` como único campo y verifica `fontWeight undefined`. Sin embargo, el test lo verifica con un solo campo presente; con `razonSocial=null` y `nit` presente (2 filas), no hay un assert que diga `filas[0]?.[0].fontWeight === undefined`. La lógica es correcta (`etiqueta === undefined` → negrita, y cuando `razonSocial=null` no pasa el `.filter`, no hay entrada sin etiqueta), pero la cobertura del escenario de spec `"razonSocial null — sin negrita"` está cubierto indirectamente, no por un test con ese nombre explícito.

  **Severidad**: WARNING. El comportamiento es correcto y está cubierto transitivamente; no es un bug. Sería más robusto tener un test `(estilo-razonSocial-null) razonSocial null con nit presente → nit fila sin fontWeight`.

- **W2** — Los tests de Libro Diario y Libro Mayor no tienen un test explícito que verifique que las filas de DETALLE no tienen `fontWeight` (al estilo de `aplanar-arbol.test.ts` y `exportar-balance-general.test.ts`). La retrocompatibilidad está implícitamente cubierta por los `toEqual` de igualdad estricta sobre el objeto completo (`{ type: 'texto', value: '10/06/2026' }`), pero un test explícito `"filas de detalle NO tienen fontWeight"` haría la intención más visible y resistente a refactors futuros.

  **Severidad**: WARNING menor (la cobertura real está dada por los `toEqual` estrictos; no es un hueco de comportamiento).

**SUGGESTION**:

- **S1** — Task 9.4 (smoke visual manual) marcada como incompleta en `tasks.md`. Es la única task sin checkmark. No bloquea el gate automatizado pero debería ser completada por un humano antes de archive.

- **S2** — El test `(estilo-c)` en `construir-hoja.test.ts` asevera que `CeldaTexto` SIN estilo no tiene `fontWeight` ni `align`. Sería útil agregar un caso espejo: `CeldaNumero` con estilo SIN `align` explícito → tiene `align:'right'` pero NO `fontWeight` (cuando `fontWeight` no se setea). Este edge case está cubierto en `(estilo-b)` solo para `align`; la ausencia de `fontWeight` en el output de una `CeldaNumero` sin fontWeight no está testeada explícitamente (aunque la lógica del spread condicional lo garantiza y tsc lo valida).

---

## Verdict

**APROBADO CON WARNINGS**

Gate automatizado: ✅ tsc 0 errores, lint 0 errores, 1216/1216 tests pasados.
Los 13 escenarios de spec tienen cobertura de tests que pasaron.
Los 2 warnings son de cobertura complementaria, no de comportamiento incorrecto.
El código no tiene `any`, `@ts-ignore`, `@ts-expect-error` ni `eslint-disable`.
§4.5 verificado adversarialmente: el estilo es ortogonal al valor numérico.
Retrocompatibilidad verificada por `toEqual` estricto en filas de detalle.
