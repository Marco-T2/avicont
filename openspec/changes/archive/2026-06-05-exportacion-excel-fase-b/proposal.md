# Proposal: Exportación a Excel — Fase B (Libro Mayor, Balance General, Estado de Resultados)

> Artifact store: hybrid
> Topic key: `sdd/exportacion-excel-fase-b/proposal`
> Fecha: 2026-06-05
> Sigue a la Fase A (PR #178, commit `76efffc`). Fase 2 de 3 (A → B → C).

## Intent

La **Fase A** construyó la infraestructura de export frontend (`frontend/src/lib/export-excel/`: builder de hoja, cabecera fiscal, formateo es-BO, descarga de blob) y la validó con el **Libro Diario** como piloto. La infra es reutilizable pero hoy solo un informe la usa.

La **Fase B** extiende esa infra a los 3 informes contables restantes que ya se renderizan en el frontend sobre JSON tipado: **Libro Mayor**, **Balance General** y **Estado de Resultados**. Cada uno gana un botón "Exportar a Excel" que serializa la `data` ya en cache de TanStack Query, sin tocar backend.

El caso técnico NUEVO respecto a la Fase A es el **aplanado de árbol jerárquico de 3 niveles** (`Sección → Subsección → Cuenta`), que Balance y Resultados comparten en su forma. Ese aplanado se construye **una sola vez** como helper reutilizable en `lib/export-excel/` y lo consumen ambos informes EEFF. El Libro Mayor es anidado `cuenta → movimientos` (parecido al Diario), con la particularidad del **saldo corriente acumulado** (`saldoCorrienteBob`), valor que YA viene calculado del backend por fila.

Lo que desbloquea: con Fase B cerrada, los 4 informes contables del frontend exportan a Excel con cabecera fiscal. Solo queda Comprobantes (Fase C), que arrastra una decisión de producto abierta (página visible vs. rango completo).

## Scope

### In Scope

- **Helper de aplanado jerárquico compartido** (`frontend/src/lib/export-excel/`): toma las secciones EEFF (`Sección[]`, cada una `Sección → Subsección → Cuenta`) y las aplana a filas de Excel, representando la jerarquía por **nivel/indentación** y emitiendo las filas de subtotal de sección y subsección (los totales ya vienen del backend, NO se recalculan). Reutilizable por Balance y Resultados.
- **Libro Mayor → Excel**: mapeo `LibroMayorResponse` (`cuentas[]` → `movimientos[]`) a hoja, aplanando cuenta → movimientos, con una fila de cabecera por cuenta (saldo inicial/debe/haber/saldo final) y el `saldoCorrienteBob` por movimiento. Botón gateado por `contabilidad.libro-mayor.read`, montado en `LibroMayorPage`.
- **Balance General → Excel**: mapeo `BalanceGeneralResponse` (secciones fijas `activo`/`pasivo`/`patrimonio`) usando el helper de aplanado, con la fila de cuadre de la ecuación contable al pie (`cuadra`/`diferenciaBob` del backend). Botón gateado por `contabilidad.eeff.read`, montado en `BalanceGeneralPage`.
- **Estado de Resultados → Excel**: mapeo `EstadoResultadosResponse` (secciones fijas `ingreso`/`egreso`) usando el mismo helper, con la fila de Resultado del Ejercicio (`resultadoEjercicioBob`/`esGanancia` del backend) al pie. Botón gateado por `contabilidad.eeff.read`, montado en `EstadoResultadosPage`.
- **Parametrización del builder de hoja**: `construirHoja` hoy tiene un `columns` (anchos) hardcodeado para el Libro Diario (7 columnas). Se vuelve un parámetro opcional para que cada informe pase sus anchos. Cambio retrocompatible (el default mantiene el comportamiento de la Fase A).
- **Cableado del perfil fiscal**: `LibroMayorPage`, `BalanceGeneralPage` y `EstadoResultadosPage` consumen `useEmpresa()` (ya existe) para la cabecera, igual que hizo `LibroDiarioPage` en la Fase A.
- **Tests Vitest** (describe/it en español, TDD): helper de aplanado (con casos de árbol vacío, subsección sin cuentas, niveles), mapeo de cada informe (aplanado, cabecera por cuenta del Mayor, saldo corriente, subtotales del backend, anulados, cabecera fiscal con campos null), y gating de cada botón.

### Out of Scope (explícito)

- **Comprobantes** (listado y detalle) → Fase C, que arrastra la decisión de producto abierta (página visible vs. rango completo) y posible endpoint de export sin paginar.
- **Cualquier cambio de backend**: ni endpoint de export, ni `StreamableFile`, ni Port nuevo, ni dependencia de export en backend. Generación 100% frontend sobre el JSON ya fetcheado (los 3 informes devuelven el dataset completo, bounded server-side por env 5k/20k; no paginan).
- Export a **PDF** (no pedido).
- Estilos ricos avanzados (logo embebido, merge de celdas, temas de color, freeze panes). La cabecera fiscal + formato numérico + indentación por nivel es suficiente para el informe oficial.
- Nueva dependencia: NO se agrega ninguna. `write-excel-file` ya está instalada (Fase A).
- Cambiar el render en pantalla de los 3 informes (las tablas existentes no se tocan).

## Capabilities

### Modified Capabilities

- `exportacion-excel`: se ADICIONAN los requisitos de Libro Mayor, Balance General y Estado de Resultados a la capability existente (sin contradecir los de Fase A). Se agrega el helper de aplanado jerárquico como pieza nueva de la infra.
- `libro-mayor` (frontend): se agrega la afordancia "Exportar a Excel" a la pantalla existente.
- `balance-general` (frontend): ídem.
- `estado-resultados` (frontend): ídem.

## Approach (alto nivel)

1. **Reusar la infra Fase A tal cual**: `armarCabeceraFiscal`, `construirHoja`, `descargarBlob`, `generarNombreArchivo`, `formatearFechaCelda`, `parsearMontoCelda` se consumen sin cambios (salvo parametrizar `columns` en `construirHoja`).
2. **El aplanado jerárquico es el único concepto nuevo**: vive en `lib/export-excel/aplanar-arbol.ts`, recibe `Sección[]` genéricas (estructura común de Balance y Resultados) y devuelve `Celda[][]`. Cada informe le pasa sus secciones + su columna de monto.
3. **El Libro Mayor reusa el patrón del Diario** (aplanar lo anidado), agregando la cabecera de cuenta y la columna de saldo corriente. No necesita el helper de árbol (es de 2 niveles, no 3).
4. **Cada informe tiene su `lib/exportar-<informe>.ts`** (mapeo puro, testeable sin render) + su `components/boton-exportar-<informe>.tsx` (orquesta el export, gateado), espejando exactamente la estructura del Libro Diario de la Fase A.
5. **Las páginas montan el botón en el header**, consumiendo `data` ya cargada y `useEmpresa()`. Sin re-fetch.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/src/lib/export-excel/aplanar-arbol.ts` | New | Helper de aplanado jerárquico 3 niveles + test |
| `frontend/src/lib/export-excel/construir-hoja.ts` | Modified | `columns` pasa a parámetro opcional (retrocompatible) |
| `frontend/src/lib/export-excel/index.ts` | Modified | Re-exporta el helper de aplanado |
| `frontend/src/features/libro-mayor/lib/exportar-libro-mayor.ts` | New | Mapeo `LibroMayorResponse` → hoja + test |
| `frontend/src/features/libro-mayor/components/boton-exportar-libro-mayor.tsx` | New | Botón gateado (`contabilidad.libro-mayor.read`) |
| `frontend/src/features/libro-mayor/pages/libro-mayor-page.tsx` | Modified | Monta el botón + `useEmpresa()` |
| `frontend/src/features/balance-general/lib/exportar-balance-general.ts` | New | Mapeo `BalanceGeneralResponse` → hoja + test |
| `frontend/src/features/balance-general/components/boton-exportar-balance-general.tsx` | New | Botón gateado (`contabilidad.eeff.read`) |
| `frontend/src/features/balance-general/pages/balance-general-page.tsx` | Modified | Monta el botón + `useEmpresa()` |
| `frontend/src/features/estado-resultados/lib/exportar-estado-resultados.ts` | New | Mapeo `EstadoResultadosResponse` → hoja + test |
| `frontend/src/features/estado-resultados/components/boton-exportar-estado-resultados.tsx` | New | Botón gateado (`contabilidad.eeff.read`) |
| `frontend/src/features/estado-resultados/pages/estado-resultados-page.tsx` | Modified | Monta el botón + `useEmpresa()` |
| Backend | None | Sin cambios — generación 100% frontend |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| El árbol de Balance y Resultados NO es genéricamente uniforme: Balance tiene `activo`/`pasivo`/`patrimonio` + cuadre, Resultados tiene `ingreso`/`egreso` + resultado del ejercicio; además `CuentaBalance.cuentaId` es nullable (línea sintética) y tiene `esSintetica`, mientras `CuentaResultados.cuentaId` es non-null y NO tiene `esSintetica` | **Med** | El helper aplana una `Sección[]` (estructura común `Sección→Subsección→Cuenta`); cada informe le PASA sus secciones (3 vs 2) y arma su propio pie (cuadre vs resultado) fuera del helper. El helper trata `codigoInterno`/`cuentaId` nullable de forma uniforme (omite código si null) y no asume `esSintetica`. Tests con cuenta sintética sin código y con cuenta normal. |
| `construirHoja` tiene `columns` hardcodeado a 7 cols del Diario → romper widths de los nuevos informes | **Low** | Parametrizar `columns` como opcional con default = comportamiento Fase A. Cambio retrocompatible verificado por el test existente de `construir-hoja`. |
| Permiso equivocado en el botón. Balance Y Resultados comparten `contabilidad.eeff.read` (un solo permiso EEFF); el Mayor usa `contabilidad.libro-mayor.read` | **Med** | Verificado en `frontend/src/lib/permissions.ts`: `eeff.read` cubre ambos EEFF, `libroMayor.read` el Mayor. Usar las keys de `PERMISSIONS.*`, nunca strings sueltos. |
| §4.5: recalcular subtotales/saldo corriente en cliente | **Med** | Subtotales de sección/subsección, saldo corriente, total general, cuadre y resultado del ejercicio YA vienen del backend. El cliente NUNCA suma columnas. Tests anti-recálculo que pasan subtotales que no son la suma de las filas. |
| §4.6: fecha del Mayor corrompida por UTC | **Low** | Reusar `formatearFechaCelda` (split de string, sin `Date`). Solo el Mayor tiene fechas por movimiento; Balance/Resultados usan fecha de corte/rango en cabecera. |
| §4.7: anulados del Mayor no marcados | **Low** | Cada `MovimientoMayor` trae `anulado`; marcar la fila con "Anulado" igual que el Diario. Balance/Resultados ya excluyen anulados por default (toggle en filtros); el flag del informe se respeta vía el `incluirAnulados` del fetch (la data ya viene filtrada). |
| Dataset grande del Mayor (tope 20k movs) bloquea el hilo | **Low** | Acotado server-side; feedback "Generando…"; sin paginar en cliente (el informe ya viene completo en cache). |

## Rollback Plan

Cambio aditivo y aislado en frontend: revertir el PR (squash → `git revert <sha>`). Los archivos nuevos (`aplanar-arbol.ts`, los 3 `exportar-*.ts` y los 3 `boton-exportar-*.tsx`) se eliminan sin afectar nada. Las modificaciones a código vivo son: parametrizar `columns` en `construirHoja` (retrocompatible) y montar el botón + `useEmpresa()` en las 3 páginas (se quitan las líneas). Sin migración, sin cambio de contrato, sin backend.

## Dependencies

- Infra `frontend/src/lib/export-excel/` (ya existe — Fase A).
- `write-excel-file` (ya instalada — Fase A).
- `useEmpresa()` / `EmpresaPerfil` (ya existe — Fase 1 `datos-empresa`).
- `PermissionButton` + permisos `contabilidad.libro-mayor.read` y `contabilidad.eeff.read` (ya en el repo y en `PERMISSIONS.*`).
- `LibroMayorResponse`, `BalanceGeneralResponse`, `EstadoResultadosResponse` tipados desde `@/types/api` (ya generados de OpenAPI).

## Success Criteria

- [ ] Existe `frontend/src/lib/export-excel/aplanar-arbol.ts` que aplana `Sección[]` (3 niveles) a `Celda[][]` con indentación por nivel y filas de subtotal del backend, reutilizado por Balance y Resultados.
- [ ] El Libro Mayor, el Balance General y el Estado de Resultados tienen cada uno un botón "Exportar a Excel" (texto en español) que descarga un `.xlsx` con la data en pantalla.
- [ ] Cada `.xlsx` incluye la cabecera fiscal de la organización y no rompe si algún campo fiscal es `null`.
- [ ] Los montos quedan como **celda numérica** `#,##0.00`, sin recálculo en el cliente; subtotales, saldo corriente, total general, cuadre y resultado del ejercicio son los del backend.
- [ ] El export del Libro Mayor incluye el `saldoCorrienteBob` por movimiento y marca los movimientos anulados; las fechas aparecen como `dd/mm/yyyy` sin corrimiento por UTC.
- [ ] El botón del Mayor está gateado por `contabilidad.libro-mayor.read`; los de Balance y Resultados por `contabilidad.eeff.read`; los 3 deshabilitados (con tooltip) sin permiso y sin data.
- [ ] `construirHoja` acepta `columns` opcional sin romper el test/uso de la Fase A.
- [ ] Tests Vitest (describe/it en español) cubren: aplanado de árbol (niveles, árbol vacío, subsección sin cuentas, cuenta sintética sin código), mapeo de cada informe (aplanado, cabecera por cuenta del Mayor, saldo corriente, subtotales del backend, anulados, cabecera fiscal completa/null), y gating de cada botón.
- [ ] `tsc -b` y `eslint` limpios; cero `any`. Sin cambios de backend (job `contract-drift` no aplica).
