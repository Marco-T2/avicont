# Proposal: Exportación a Excel — Fase A (infraestructura + Libro Diario piloto)

> Artifact store: hybrid
> Topic key: `sdd/exportacion-excel-fase-a/proposal`
> Fecha: 2026-06-04
> Sigue a la exploración `sdd/exportacion-excel-reportes/explore`. Fase 1 de 3 (A → B → C).

## Intent

Los informes contables bolivianos se presentan/archivan en `.xlsx` con una cabecera fiscal (razón social, NIT, dirección, etc.) sobre los datos del informe. Hoy el frontend ya renderiza los 4 informes (Diario, Mayor, Balance, Resultados) sobre JSON tipado, con la cabecera fiscal disponible vía `GET /api/tenants/current` (Fase 1 `datos-empresa`), pero **no existe ninguna capacidad de export en ningún stack**.

Esta fase construye **una sola vez** la infraestructura de export frontend (builder de hoja, cabecera fiscal, formateo es-BO, descarga del blob) y la valida con el **Libro Diario** como piloto. Lo que desbloquea: el patrón reutilizable que las Fases B (Libro Mayor + Balance + Estado de Resultados) y C (Comprobantes) copian sin re-resolver la elección de librería, el bloque de cabecera fiscal, el formateo numérico/fecha ni el disparo de descarga.

Por qué el Libro Diario primero: es el informe de estructura **anidada** más simple (asiento → líneas), valida el aplanado a filas sin la complejidad del árbol jerárquico de 3 niveles del Balance. Si la infra sirve para el Diario, sirve para los demás.

## Scope

### In Scope

- **Infraestructura de export frontend reutilizable** (`frontend/src/lib/export-excel/`):
  - Builder genérico de hoja `.xlsx`: filas/columnas, distinción celda numérica vs texto, formato de número `#,##0.00`, ancho de columna.
  - Helper de **cabecera fiscal**: toma el `EmpresaPerfil` (`razonSocial`, `nit`, `direccion`, `representanteLegal`, `telefono`, `email` — todos `string | null`) y arma el bloque de cabecera tolerando campos null (omite/deja en blanco, no rompe).
  - Formateo **es-BO** reutilizable: fechas `"YYYY-MM-DD"` → `"dd/mm/yyyy"` SIN pasar por `Date`/UTC; y conversión de **monto string decimal → `Number`** destinado a una celda numérica con formato (no a un string pre-formateado).
  - Disparo de **descarga del blob** en el navegador (nombre de archivo derivado del informe + rango).
- **Libro Diario como piloto**: botón "Exportar a Excel" en `LibroDiarioPage`, gateado por permiso, que serializa la data ya cargada en cache de TanStack Query (`LibroDiarioResponse`: `asientos[]` → `lineas[]`) usando la infra anterior.
- **Tests Vitest** del dominio puro de la infra (formateo es-BO, builder de hoja, cabecera con campos null) y del mapeo Libro Diario → hoja.
- Propuesta de **una nueva dependencia de frontend** (no se instala en esta fase; se instala en apply).

### Out of Scope (explícito)

- **Libro Mayor, Balance General, Estado de Resultados** → Fase B.
- **Comprobantes** (listado y detalle) → Fase C, que además arrastra la única decisión de producto abierta (página visible vs. rango completo).
- **Cualquier cambio de backend**: ni endpoint de export, ni `Content-Disposition`/`StreamableFile`, ni Port nuevo cross-módulo, ni dependencia de export en backend. La generación es 100% frontend sobre el JSON ya fetcheado.
- **Endpoint de export sin paginar** para listados masivos (sería un sub-change backend de Fase C, no de esta fase).
- Export a **PDF** (no pedido).
- Estilos ricos avanzados (logo embebido, temas de color); la cabecera fiscal + bold en totales + formato numérico es suficiente para el informe oficial.

## Capabilities

### New Capabilities

- `exportacion-excel`: infraestructura frontend para serializar informes contables a `.xlsx` con cabecera fiscal de la organización, formateo es-BO, montos como celda numérica (sin recálculo) y descarga en el navegador; piloto sobre el Libro Diario.

### Modified Capabilities

- `libro-diario` (frontend): se agrega la afordancia "Exportar a Excel" a la pantalla existente. No cambia el fetch ni el render actual.

## Approach

### Librería elegida: `write-excel-file`

`write-excel-file` (client build). **Por qué (1 línea):** liviana, mantenida, API declarativa de matriz de celdas, soporta celda numérica con `format: '#,##0.00'` y `type: Number`, y **evita los CVE / el abandono de `xlsx` (SheetJS) en npm**; `exceljs` browser pesa ~1MB y trae una superficie imperativa innecesaria para informes tabulares. La elección final se confirma en diseño, pero `write-excel-file` es la recomendación.

### Estructura de archivos propuesta

El repo tiene dos convenciones claras: utilidades **cross-feature** viven en `frontend/src/lib/` (hoy archivos planos), y formateadores **específicos de una feature** viven en `frontend/src/features/<f>/lib/`. El export es cross-feature (lo usarán 4+ informes), por lo que va en `src/lib/`. Como es un conjunto cohesivo de varios archivos, se agrupa en un subdirectorio `export-excel/` (primer subdir de `lib/`, justificado por cohesión):

```
frontend/src/lib/export-excel/
├── construir-hoja.ts            Builder genérico: matriz de celdas tipadas → blob .xlsx (wrappea write-excel-file)
├── construir-hoja.test.ts       Vitest: tipos de celda, formato numérico, anchos
├── cabecera-fiscal.ts           EmpresaPerfil (nullable) → filas de cabecera del informe
├── cabecera-fiscal.test.ts      Vitest: campos presentes, todos null, mezcla
├── formato-celda.ts             es-BO: fecha "YYYY-MM-DD"→"dd/mm/yyyy" sin UTC; monto string→Number para celda
├── formato-celda.test.ts        Vitest: fechas límite (fin de mes), montos con/sin decimales, string inválido
├── descargar-blob.ts            Dispara la descarga del .xlsx en el navegador
└── index.ts                     API pública del módulo

frontend/src/features/libro-diario/
├── lib/
│   ├── exportar-libro-diario.ts       Mapea LibroDiarioResponse + EmpresaPerfil → matriz de celdas (usa src/lib/export-excel)
│   └── exportar-libro-diario.test.ts  Vitest: aplanado asiento→líneas, fila de totales, anulados
└── components/
    └── boton-exportar-libro-diario.tsx  Botón gateado (PermissionButton) que orquesta fetch-empresa + map + descarga
```

`LibroDiarioPage` monta `<BotonExportarLibroDiario>` en su header, recibiendo la `data` ya cargada (no re-fetchea el informe).

### Cómo se inyecta la cabecera fiscal

`useEmpresa()` (`features/tenants/hooks/use-empresa.ts`, queryKey `['tenant','empresa']`) **ya existe** y devuelve `EmpresaPerfil`. El botón de export consume ese hook; al hacer clic, pasa el `EmpresaPerfil` a `cabecera-fiscal.ts`, que arma las filas de cabecera tolerando null por campo (un campo null se omite o se deja en blanco; nunca se imprime `"null"` ni se rompe). Cero fetch nuevo, cero Port backend.

### Money-as-string (§4.5) y FechaContable (§4.6)

- **Money**: el backend entrega `debeBob`/`haberBob`/`totalDebeBob` como **string decimal** (`"1250.50"`). La celda Excel debe ser **numérica** (`type: Number`, `format: '#,##0.00'`) para que el usuario pueda operar sobre ella. La conversión `string → Number` se hace **solo en el boundary de serialización a celda** y **nunca para recalcular**: los totales (`totalDebeBob`, etc.) ya vienen calculados del backend y se escriben tal cual; no se suman columnas en el cliente. Se **NO** reusa `formatearMontoBob` para el valor de celda (devuelve un string locale `"1.250,50"`, no un número) — se abstrae la conversión a `Number` en `formato-celda.ts`. `formatearMontoBob` sigue sirviendo solo para la pantalla.
- **Fecha**: las fechas de dominio llegan `"YYYY-MM-DD"`. Se formatean a `"dd/mm/yyyy"` **sin construir un `Date` UTC** (corrompe el día). Reusar el patrón de `formatear-fecha-libro-diario.ts` (fija `T12:00:00` + `Intl.DateTimeFormat` `America/La_Paz`) o, mejor para una celda de texto determinística, partir el string `"YYYY-MM-DD"` y reordenar sin `Date`. Se escribe como **texto** (no celda de fecha Excel) para evitar reinterpretación de zona horaria por Excel.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/package.json` | Modified | + `write-excel-file` (se instala en apply, no ahora) |
| `frontend/src/lib/export-excel/**` | New | Infra reutilizable (builder, cabecera fiscal, formato es-BO, descarga) + tests |
| `frontend/src/features/libro-diario/lib/exportar-libro-diario.ts` | New | Mapeo `LibroDiarioResponse` → hoja + test |
| `frontend/src/features/libro-diario/components/boton-exportar-libro-diario.tsx` | New | Botón gateado que orquesta el export |
| `frontend/src/features/libro-diario/pages/libro-diario-page.tsx` | Modified | Monta el botón en el header (recibe `data` ya cargada) |
| Backend | None | Sin cambios — generación 100% frontend |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **§4.5** convertir string→Number recalcula o pierde precisión | Med | Conversión solo en el boundary celda; totales se escriben tal cual del backend; sin aritmética en cliente; test con montos de muchos decimales y string inválido (fallback) |
| **§4.6** fecha `YYYY-MM-DD` corrompida por UTC al pasar por `Date` | Med | Formateo sin `Date` UTC (split del string o `T12:00:00` + La_Paz); celda de **texto**, no fecha Excel; test con fin de mes (2026-01-31, 2026-12-31) |
| Cabecera fiscal con campos null rompe el armado | Med | `cabecera-fiscal.ts` tolera null por campo; test "todos null" y "mezcla" |
| CVE / abandono de la librería de export | Med | Elegir `write-excel-file` (mantenida, sin CVE conocido); evitar `xlsx`/SheetJS de npm; auditar versión en apply |
| Botón visible sin permiso (afordancia engañosa) | Low | `PermissionButton` con `contabilidad.libro-diario.read`; backend sigue siendo la autoridad (§5 defense in depth) |
| Texto del botón en inglés / i18n inconsistente | Low | UI en español (§1): "Exportar a Excel"; estados ("Generando…") y nombre de archivo en español |
| Export de datasets grandes (tope 5.000 asientos) bloquea el hilo | Low | Acotado por el tope server-side; si tarda, feedback "Generando…"; sin paginar en cliente (el informe ya viene completo) |

## Rollback Plan

Cambio aditivo y aislado en frontend: revertir el PR (squash → `git revert <sha>`). La infra `src/lib/export-excel/` es nueva (eliminarla no afecta nada existente); la única modificación a código vivo es montar el botón en `LibroDiarioPage` (se quita la línea). Sin migración, sin cambio de contrato, sin backend.

## Dependencies

- `write-excel-file` (nueva dep de frontend, se instala en apply).
- `useEmpresa()` / `EmpresaPerfil` (ya existe — Fase 1 `datos-empresa`).
- `PermissionButton` + permiso `contabilidad.libro-diario.read` (ya en el repo).
- `LibroDiarioResponse` tipado desde `@/types/api` (ya generado de OpenAPI).

## Success Criteria

- [ ] Existe `frontend/src/lib/export-excel/` con builder de hoja, cabecera fiscal, formateo es-BO y descarga de blob, reutilizable por las Fases B y C.
- [ ] La pantalla del Libro Diario tiene un botón "Exportar a Excel" (texto en español) que descarga un `.xlsx` con la data en pantalla.
- [ ] El `.xlsx` incluye la cabecera fiscal de la organización y no rompe si algún campo fiscal es `null`.
- [ ] Los montos quedan como **celda numérica** con formato `#,##0.00` (operables en Excel), sin recálculo en el cliente; los totales son los del backend.
- [ ] Las fechas aparecen como `dd/mm/yyyy` correctas (sin corrimiento de día por UTC), verificado en fin de mes.
- [ ] El botón está gateado por `contabilidad.libro-diario.read` (deshabilitado con tooltip sin permiso) y deshabilitado si la query no tiene data.
- [ ] Tests Vitest (describe/it en español) cubren: formateo es-BO de fecha y monto, builder de hoja (tipos de celda, formato numérico), cabecera fiscal con campos presentes / todos null / mezcla, y el mapeo Libro Diario (aplanado asiento→líneas + fila de totales + anulados).
- [ ] `tsc -b` y `eslint` limpios; cero `any`. Sin cambios de backend (job `contract-drift` no aplica).
