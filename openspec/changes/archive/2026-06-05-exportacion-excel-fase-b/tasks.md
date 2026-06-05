# Tasks: exportacion-excel-fase-b

> Artifact store: hybrid
> Topic key: `sdd/exportacion-excel-fase-b/tasks`
> Fecha: 2026-06-05
> Spec: `openspec/changes/exportacion-excel-fase-b/specs/exportacion-excel/spec.md`
> Design: `openspec/changes/exportacion-excel-fase-b/design.md`
> Convención TDD (Strict Mode): cada unidad sigue TEST-ROJO → IMPLEMENTACIÓN → TEST-VERDE.
> No se escribe código de implementación antes de que exista el test que lo exige.
> Tests con describe/it en **español**. Cero `any`. `tsc -b` + `eslint` limpios al cerrar cada grupo.

---

## Grupo 0 — Prerrequisito (sin test)

### T-00: Confirmar infra Fase A disponible

- [ ] Verificar que `write-excel-file` ya está en `frontend/package.json` (Fase A) — NO instalar nada nuevo.
- [ ] Verificar que `frontend/src/lib/export-excel/{construir-hoja,cabecera-fiscal,formato-celda,descargar-blob,index}.ts` existen y exportan lo esperado.
- [ ] Verificar permisos en `frontend/src/lib/permissions.ts`: `PERMISSIONS.contabilidad.libroMayor.read` y `PERMISSIONS.contabilidad.eeff.read` existen.

---

## Grupo 1 — Parametrizar `construirHoja` (retrocompatible)

> Cubre: design §4. Riesgo: romper el contrato del Diario (Fase A).

### T-01 (TEST ROJO): test de `columns` opcional en `construir-hoja.test.ts`

- [ ] Agregar a `construir-hoja.test.ts` un caso: `construirHoja(filas, [{width:30},{width:16}])` produce un Blob xlsx (sin romper) y, vía el mock de `write-excel-file/browser`, se verifica que se pasaron esas columnas.
- [ ] Verificar que el test EXISTENTE (`construirHoja(filas)` sin columns) sigue pasando (default = 7 widths Diario). Corre rojo porque el parámetro aún no existe.

### T-02 (GREEN): parametrizar `construirHoja`

- [ ] En `construir-hoja.ts`: extraer las 7 columnas actuales a `const COLUMNS_LIBRO_DIARIO`; exportar `interface ColumnaHoja { width: number }`; cambiar firma a `construirHoja(filas, columns: ColumnaHoja[] = COLUMNS_LIBRO_DIARIO)`.
- [ ] Re-exportar `ColumnaHoja` desde `index.ts`.
- [ ] Verde: el nuevo test y todos los de Fase A pasan.

---

## Grupo 2 — Helper de aplanado de árbol (COMPARTIDO, va primero)

> Cubre: REQ "Aplanado de árbol jerárquico de 3 niveles" (6 escenarios). Design §2.
> Es la pieza nueva más sensible; se construye antes que los informes que la consumen.

### T-03 (TEST ROJO): `aplanar-arbol.test.ts`

- [ ] Crear `frontend/src/lib/export-excel/aplanar-arbol.test.ts` (importa `aplanarArbol` y tipos `SeccionArbol`, que aún no existen → rojo). Casos:
  - `describe('aplanarArbol')`
    - `it('aplana sección con una subsección y dos cuentas: fila de sección + fila de subsección + 2 filas de cuenta')` — verifica conteo de filas y que cada cuenta lleva nombre + saldoBob (CeldaNumero).
    - `it('refleja el nivel por indentación: sección sin sangría, subsección 1 sangría, cuenta 2 sangrías')` — assert sobre el prefijo de espacios en la celda "Concepto".
    - `it('usa los totalBob del backend en los subtotales, sin sumar las cuentas (anti-recálculo)')` — sección/subsección con `totalBob` que NO es la suma de las cuentas; assert que la fila de subtotal usa el valor del backend.
    - `it('una sección sin subsecciones aparece con su subtotal y sin filas de detalle, sin error')`.
    - `it('una subsección sin cuentas aparece con su subtotal y sin filas de cuenta')`.
    - `it('una cuenta con codigoInterno null omite el código (no imprime "null") y conserva nombre y saldoBob')`.

### T-04 (GREEN): implementar `aplanar-arbol.ts`

- [ ] Crear `aplanar-arbol.ts` con tipos `CuentaArbol`/`SubseccionArbol`/`SeccionArbol` (design §2.2) y `aplanarArbol(secciones: SeccionArbol[]): Celda[][]`.
- [ ] Por sección: fila `[{texto: titulo sin sangría}, {numero: totalBob}]`; por subsección: fila con 1 sangría; por cuenta: fila con 2 sangrías, `código + nombre` (omitir código si null), sufijo `(contraria)` si `esContraria`, `{numero: saldoBob}`.
- [ ] Sangría = `'  '.repeat(nivel)`. SIN recálculo de totales.
- [ ] Re-exportar `aplanarArbol` y los tipos `*Arbol` desde `index.ts`.
- [ ] Verde: T-03 pasa. `tsc -b` + `eslint` limpios.

---

## Grupo 3 — Libro Mayor → Excel

> Cubre: REQ "Libro Mayor — Exportar a Excel" (8 escenarios). Design §3.1, §5, §6.

### T-05 (TEST ROJO): `exportar-libro-mayor.test.ts`

- [ ] Crear `features/libro-mayor/lib/exportar-libro-mayor.test.ts` (importa `mapearLibroMayorAFilas`, inexistente → rojo). Factory `crearResponseLibroMayor(overrides?)` + `perfilCompleto`/`perfilTodoNull` (calcar del Diario). Casos:
  - `it('aplana cuenta→movimientos: 2 cuentas (3+2 movs) → por cuenta una fila de cabecera + filas de movimiento')`.
  - `it('cada movimiento lleva fecha dd/mm/yyyy, comprobante, glosa, debe, haber y saldo corriente (CeldaNumero)')`.
  - `it('el saldo corriente usa saldoCorrienteBob del backend, sin acumular debe/haber en cliente')` — assert que el value de la celda es exactamente el del backend.
  - `it('la fila de total general usa totalDebeBob/totalHaberBob del backend (sin recálculo)')`.
  - `it('marca el movimiento anulado con texto "Anulado"')`.
  - `it('no corre el día: fechaContable 2026-01-31 → "31/01/2026"')`.
  - `it('la celda de glosa queda vacía (no "null") cuando glosaLinea es null')`.
  - `it('incluye la cabecera fiscal al inicio cuando el perfil está completo / no rompe con todo null')`.

### T-06 (GREEN): implementar `exportar-libro-mayor.ts`

- [ ] `mapearLibroMayorAFilas(response, perfil)`: cabecera fiscal → encabezados de columna → por cuenta (fila cabecera de cuenta con saldos del backend + filas de movimiento con `saldoCorrienteBob`) → fila total general.
- [ ] Fecha vía `formatearFechaCelda`; glosa `glosaLinea ?? glosa ?? ''`; marca "Anulado" si `m.anulado`.
- [ ] Verde: T-05 pasa.

### T-07 (TEST ROJO): `boton-exportar-libro-mayor.test.tsx`

- [ ] Crear el test del botón (calcar `boton-exportar-libro-diario.test.tsx`): renderiza el botón; con permiso `contabilidad.libro-mayor.read` y `data` presente → habilitado; sin permiso → deshabilitado con tooltip (mock de `usePermissions`, envolver en `TooltipProvider`); sin `data` → deshabilitado.

### T-08 (GREEN): implementar `boton-exportar-libro-mayor.tsx`

- [ ] Calcar el botón del Diario: props `{ data, perfil, rango }`, `useState` `generando`, fallback perfil null, `PermissionButton` con `PERMISSIONS.contabilidad.libroMayor.read`, handler `mapear → construirHoja(filas, columnsMayor) → descargarBlob(blob, generarNombreArchivo('libro-mayor', rango))`.
- [ ] Verde: T-07 pasa.

### T-09: montar el botón en `libro-mayor-page.tsx`

- [ ] Agregar `useEmpresa()`, derivar `rango` (igual que el Diario: `fechaDesde_fechaHasta` o `periodoFiscalId`), montar `<BotonExportarLibroMayor data={data} perfil={empresa} rango={rango} />` en el header. NO tocar el render de la tabla.

---

## Grupo 4 — Balance General → Excel

> Cubre: REQ "Balance General — Exportar a Excel" (6 escenarios). Design §3.2, §5, §6.

### T-10 (TEST ROJO): `exportar-balance-general.test.ts`

- [ ] Crear `features/balance-general/lib/exportar-balance-general.test.ts` (importa `mapearBalanceGeneralAFilas`, inexistente → rojo). Factory `crearResponseBalance(overrides?)` con `activo`/`pasivo`/`patrimonio`. Casos:
  - `it('mapea las 3 secciones aplanadas vía el helper de árbol, con subtotales del backend')`.
  - `it('incluye una fila de cuadre con totalActivoBob/totalPasivoBob/totalPatrimonioBob, cuadra y diferenciaBob del backend (sin sumar Pasivo+Patrimonio en cliente)')`.
  - `it('marca la cuenta contraria (esContraria true) en la hoja')`.
  - `it('aplana una cuenta sintética con cuentaId/codigoInterno null sin imprimir "null"')`.
  - `it('incluye la cabecera fiscal al inicio / no rompe con perfil todo null')`.

### T-11 (GREEN): implementar `exportar-balance-general.ts`

- [ ] `adaptarSeccionesBalance(response): SeccionArbol[]` = `[activo, pasivo, patrimonio]` mapeados a la forma común.
- [ ] `mapearBalanceGeneralAFilas`: cabecera fiscal → encabezados (`Concepto | Saldo (BOB)`) → `aplanarArbol(adaptarSeccionesBalance(response))` → fila(s) de cuadre con los campos del backend.
- [ ] Verde: T-10 pasa.

### T-12 (TEST ROJO): `boton-exportar-balance-general.test.tsx`

- [ ] Test del botón: permiso `contabilidad.eeff.read` habilita; sin permiso deshabilita con tooltip; sin `data` deshabilita.

### T-13 (GREEN): implementar `boton-exportar-balance-general.tsx`

- [ ] Calcar el botón; `PermissionButton` con `PERMISSIONS.contabilidad.eeff.read`; handler → `construirHoja(filas, columnsEeff)` → `descargarBlob(blob, generarNombreArchivo('balance-general', rango))`.
- [ ] Verde: T-12 pasa.

### T-14: montar el botón en `balance-general-page.tsx`

- [ ] Agregar `useEmpresa()`, derivar `rango` (`response.fechaCorte` o el `fecha` del filtro), montar el botón en el header. NO tocar la tabla.

---

## Grupo 5 — Estado de Resultados → Excel

> Cubre: REQ "Estado de Resultados — Exportar a Excel" (6 escenarios). Design §3.3, §5, §6.
> Reusa el MISMO helper de aplanado que el Balance (no duplicar).

### T-15 (TEST ROJO): `exportar-estado-resultados.test.ts`

- [ ] Crear `features/estado-resultados/lib/exportar-estado-resultados.test.ts` (importa `mapearEstadoResultadosAFilas`, inexistente → rojo). Factory `crearResponseResultados(overrides?)` con `ingreso`/`egreso`. Casos:
  - `it('mapea las 2 secciones aplanadas vía el helper de árbol, con subtotales del backend')`.
  - `it('incluye una fila de Resultado del Ejercicio con totalIngresoBob/totalEgresoBob/resultadoEjercicioBob y esGanancia del backend (sin restar Ingreso−Egreso en cliente)')`.
  - `it('indica Ganancia cuando esGanancia true y Pérdida cuando false')`.
  - `it('usa el mismo helper aplanarArbol que el Balance (no duplica lógica de aplanado)')` — assert estructural: las filas de detalle tienen el mismo shape (indentación por nivel) que el Balance.
  - `it('incluye la cabecera fiscal al inicio / no rompe con perfil todo null')`.

### T-16 (GREEN): implementar `exportar-estado-resultados.ts`

- [ ] `adaptarSeccionesResultados(response): SeccionArbol[]` = `[ingreso, egreso]` mapeados (CuentaResultados → CuentaArbol; `codigoInterno` string, `esContraria`).
- [ ] `mapearEstadoResultadosAFilas`: cabecera fiscal → encabezados → `aplanarArbol(...)` → fila de Resultado del Ejercicio con los campos del backend.
- [ ] Verde: T-15 pasa.

### T-17 (TEST ROJO): `boton-exportar-estado-resultados.test.tsx`

- [ ] Test del botón: permiso `contabilidad.eeff.read` habilita; sin permiso deshabilita con tooltip; sin `data` deshabilita.

### T-18 (GREEN): implementar `boton-exportar-estado-resultados.tsx`

- [ ] Calcar el botón; `PermissionButton` con `PERMISSIONS.contabilidad.eeff.read`; handler → `construirHoja(filas, columnsEeff)` → `descargarBlob(blob, generarNombreArchivo('estado-resultados', rango))`.
- [ ] Verde: T-17 pasa.

### T-19: montar el botón en `estado-resultados-page.tsx`

- [ ] Agregar `useEmpresa()`, derivar `rango` (`fechaDesde_fechaHasta`), montar el botón en el header. NO tocar la tabla.

---

## Grupo 6 — Cierre

### T-20: verificación global

- [ ] `pnpm exec tsc -b` limpio (cero errores).
- [ ] `pnpm run lint` COMPLETO limpio (correr el lint completo, no solo los archivos tocados — el CI caza prettier que el flujo parcial no).
- [ ] `pnpm exec vitest run` verde (todos los tests nuevos + regresión).
- [ ] Cero `any` en los archivos nuevos.
- [ ] Confirmar que el job CI `contract-drift` NO aplica (no se tocó ningún DTO backend ni `api.generated.ts`).

### T-21: smoke manual (caller humano)

- [ ] En `/libros/mayor`, `/eeff/balance` y `/eeff/resultados`: consultar un rango con datos, click "Exportar a Excel", abrir el `.xlsx` y verificar: cabecera fiscal, indentación por nivel (Balance/Resultados), saldo corriente y marca de anulados (Mayor), montos como número operable, fechas `dd/mm/yyyy` sin corrimiento.
- [ ] Verificar gating: con un rol sin el permiso correspondiente, el botón aparece deshabilitado con tooltip.
- [ ] Checklist pre-commit de UI (frontend §7) sobre las 3 páginas modificadas (375/768/1440 px, dark mode).
