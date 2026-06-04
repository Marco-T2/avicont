# Exploration: Exportación a Excel de Informes Contables + Comprobantes

> Artifact store: hybrid
> Topic key: sdd/exportacion-excel-reportes/explore
> Fecha: 2026-06-03
> Fase 2 (sigue a "datos-empresa" Fase 1, que agregó la cabecera fiscal)

---

## Objetivo

Permitir exportar a Excel (`.xlsx`) cinco fuentes de datos:

1. **Libro Diario** — `GET /api/libros/diario`
2. **Libro Mayor** — `GET /api/libros/mayor`
3. **Balance General** — `GET /api/eeff/balance`
4. **Estado de Resultados** — `GET /api/eeff/resultados`
5. **Comprobantes** — `GET /api/comprobantes` (listado) y `GET /api/comprobantes/:id` (detalle)

La cabecera fiscal de cada informe (razón social, NIT, dirección, etc.) viene de los 6 campos agregados en la Fase 1 `datos-empresa`, expuestos por `GET /tenants/current`.

---

## A. ¿Qué existe HOY?

### Módulo `reportes` (backend) — COMPLETO y maduro

`backend/src/reportes/` es hexagonal estricto y los 4 informes ya producen **JSON estructurado, tipado y listo para exportar**. Montos como `string` decimal (§4.5), fechas como `"YYYY-MM-DD"` (§4.6). No falta nada de cálculo.

| Informe | Endpoint | Controller | Service | Response DTO |
|---------|----------|------------|---------|--------------|
| Libro Diario | `GET /api/libros/diario` | `reportes.controller.ts:30` | `libro-diario.service.ts` | `LibroDiarioResponseDto` (`dto/libro-diario-response.dto.ts:49`) |
| Libro Mayor | `GET /api/libros/mayor` | `reportes.controller.ts:51` | `libro-mayor.service.ts` | `LibroMayorResponseDto` (`dto/libro-mayor-response.dto.ts:62`) |
| Balance General | `GET /api/eeff/balance` | `eeff.controller.ts:38` | `balance-general.service.ts` | `BalanceResponseDto` (`dto/balance-response.dto.ts:91`) |
| Estado de Resultados | `GET /api/eeff/resultados` | `eeff.controller.ts:58` | `estado-resultados.service.ts` | `EstadoResultadosResponseDto` (`dto/eeff-resultados-response.dto.ts`) |

Estructura de cada DTO (relevante para mapear a celdas):

- **Libro Diario** (`libro-diario-response.dto.ts:49`): `{ rango: {fechaDesde, fechaHasta}, asientos: [{ id, fechaContable, numero, tipo, estado, glosa, anulado, lineas: [{ codigoCuenta, nombreCuenta, glosa, debeBob, haberBob }] }], totalDebeBob, totalHaberBob }`. Estructura **anidada** (asiento → líneas) → en Excel se aplana a filas con sub-filas o filas de cabecera por asiento.
- **Libro Mayor** (`libro-mayor-response.dto.ts:62`): `{ rango, cuentas: [{ cuentaId, codigoInterno, nombreCuenta, naturaleza, saldoInicialBob, saldoFinalBob, totalDebeBob, totalHaberBob, movimientos: [{ numeroComprobante, fechaContable, glosa, debeBob, haberBob, saldoCorrienteBob, ... }] }], totalDebeBob, totalHaberBob }`. Anidado (cuenta → movimientos con running balance).
- **Balance General** (`balance-response.dto.ts:91`): árbol `{ fechaCorte, gestionId, activo/pasivo/patrimonio: { secciones → subsecciones → cuentas }, totales, cuadra, diferenciaBob }`. Jerárquico de 3 niveles.
- **Estado de Resultados**: análogo, secciones Ingresos/Egresos + resultado.

Topes server-side (relevantes para el tamaño del export): Libro Diario 5.000 asientos (`libro-diario.service.ts:30`, env `LIBRO_DIARIO_MAX_ASIENTOS`), Libro Mayor 20.000 movimientos (`libro-mayor.service.ts:43`, env `LIBRO_MAYOR_MAX_MOVIMIENTOS`). **Estos topes acotan el peor caso del export.**

### Módulo `comprobantes` (backend)

- `GET /api/comprobantes` → `ListarComprobantesResponseDto` (`dto/comprobante-response.dto.ts:100`): `{ items: ComprobanteListItemDto[], total, page, limit }`. **PAGINADO**: default 50, máx 200 (`dto/listar-comprobantes.dto.ts:18-19`). A diferencia de los 4 informes, NO devuelve el dataset completo en una sola llamada.
- `GET /api/comprobantes/:id` → `ComprobanteResponseDto` (`dto/comprobante-response.dto.ts:25`): cabecera + líneas completas.
- Filtros disponibles: `periodoFiscalId, tipo, estado, fechaDesde, fechaHasta, q (texto)`. El listado **NO** tiene flag `incluirAnulados` explícito (los reportes sí lo tienen: §4.7).

### Cabecera fiscal (Fase 1 — ya disponible)

- `GET /tenants/current` (`tenants/tenants.controller.ts:29`) devuelve los 6 campos fiscales (`razonSocial, nit, direccion, representanteLegal, telefono, email`), nullable. Spec viva: `openspec/specs/datos-empresa/spec.md`. **Esta es la fuente de la cabecera del informe.** Su scope dejó "Export a Excel/PDF fuera de scope" explícitamente — esta exploración lo retoma.

### Frontend — COMPLETO para visualización

`frontend/src/features/{libro-diario,libro-mayor,balance-general,comprobantes}/` ya existen con páginas, hooks TanStack Query y tablas. Consumen los DTOs tipados desde `@/types/api` (generados de OpenAPI). Ya hay formateo boliviano: `formatearMontoBob` usa `toLocaleString('es-BO', {minimumFractionDigits:2})` → `"1250.50"` ⇒ `"1.250,50"` (`features/libro-diario/lib/formatear-monto-bob.ts:10`). React 19, Vite 8, TanStack Query, axios, zod.

### Librerías de export — INEXISTENTES en AMBOS stacks (confirmado)

- Backend `package.json`: **sin** `exceljs`, `xlsx`, `node-xlsx`, `csv`. Sin `StreamableFile`/`Content-Disposition` en `src`.
- Frontend `package.json`: **sin** `xlsx`, `sheetjs`, `file-saver`, `exceljs`.
- Cero endpoints de export, cero menciones de `excel`/`pdf`/`export` en specs de reportes.

**Conclusión parcial:** toda la data ya existe en JSON limpio y tipado. El trabajo es PURAMENTE de **presentación/serialización a `.xlsx`** + cablear el disparador de descarga. Cero lógica contable nueva.

---

## B. DECISIÓN ARQUITECTÓNICA: ¿Dónde se genera el Excel?

### Opción 1 — Backend (`exceljs`): endpoint dedicado que devuelve `.xlsx` como buffer/stream

**A favor:**
- Formato server-controlado y consistente (mismas fórmulas, estilos, anchos de columna para todos).
- La cabecera fiscal se embebe server-side leyendo `Organization` directamente (sin segundo fetch del cliente).
- Totales/fórmulas Excel nativas posibles (`SUM`, formato de celda numérico con 2 decimales).
- `Decimal` → celda numérica sin pasar por `parseFloat` del cliente: se mapea `string` decimal → `Number` o se escribe como número con formato. Auditable.
- Para comprobantes (paginado), el backend puede iterar el dataset completo internamente sin que el cliente pagine 50-en-50.

**En contra (concreto para este proyecto):**
- **Nueva dependencia pesada** en el backend (`exceljs` ~1MB+, históricamente con CVEs de prototype pollution — auditar versión).
- **Frontera hexagonal (§3.2):** un endpoint de export que junta "datos del informe + cabecera fiscal (otro módulo) + serialización xlsx" cruza fronteras. El módulo `reportes` tendría que leer `Organization` de `tenants` vía un Port nuevo (`OrgFiscalReaderPort`), y la serialización xlsx es infraestructura que debe vivir en un adapter. Diseñable, pero agrega superficie.
- **Decimal→celda:** los DTOs ya serializan `Money` a `string`; el adapter de export tendría que re-parsear ese string a número (o re-leer el `Money`/`Decimal` antes de la serialización a DTO). Riesgo de doble conversión.
- Streaming HTTP + `Content-Disposition` + manejo de buffers en NestJS (`StreamableFile`) — patrón nuevo en el repo (no existe hoy).
- Re-ejecuta el cálculo del informe en el servidor (otra query) salvo que se reuse el service.

### Opción 2 — Frontend (`SheetJS`/`xlsx` o `exceljs` browser): genera el `.xlsx` en el navegador sobre el JSON ya fetcheado

**A favor:**
- **Cero backend nuevo.** Los 4 informes + detalle de comprobante ya devuelven el dataset completo (bounded por los topes server-side); el frontend YA TIENE la data en el cache de TanStack Query cuando el usuario ve el informe en pantalla. El botón "Exportar" serializa lo que ya está cargado.
- **Cero cruce de fronteras hexagonales backend.** El backend no cambia.
- El formateo boliviano (`es-BO`, `dd/mm/yyyy`) **ya vive en el frontend** (`formatearMontoBob`); reusable directo.
- La cabecera fiscal ya está disponible vía `GET /tenants/current` (el frontend la fetchea con un hook). Sin Port nuevo.
- Iteración rápida: el cambio es una feature de frontend (`lib/` puro de mapeo DTO→hoja + un botón).

**En contra (concreto para este proyecto):**
- **Dependencia en frontend** (`xlsx`/SheetJS ~800KB; la versión community de SheetJS tuvo CVEs — preferir `exceljs` o la versión mantenida de `xlsx` desde el CDN oficial de SheetJS, NO la de npm desactualizada). Evaluar `write-excel-file` (más liviana, sin CVEs conocidos) como alternativa.
- **Comprobantes (listado) es paginado**: exportar "todos los comprobantes del filtro" requiere o bien (a) que el frontend pagine hasta juntar todo (N llamadas con `limit=200`), o (b) exportar solo la página visible. Los 4 informes NO tienen este problema (devuelven todo).
- Formato más limitado que server-side si se quisieran estilos ricos (aunque SheetJS/exceljs-browser soportan estilos suficientes para informes contables: merges para cabecera, bold en totales, formato numérico `#,##0.00`).
- La lógica de presentación fiscal (cómo se ve el informe oficial) vive en el cliente — si mañana hay otro consumidor (API, móvil), se duplica. Hoy NO hay otro consumidor.

### RECOMENDACIÓN: **Frontend (Opción 2)** para los 4 informes + detalle de comprobante; reconsiderar backend SOLO para el listado masivo de comprobantes si se pide.

**Justificación de una línea:** la data ya está completa y tipada en el cliente, el formateo `es-BO` ya existe en el frontend, y evita agregar dependencia pesada + cruce de fronteras hexagonales + patrón de streaming nuevo al backend para un problema que es puramente de presentación.

Matices:
- Para los **4 informes** (Diario, Mayor, Balance, Resultados): frontend es claramente superior — datasets acotados por topes server-side, ya cargados en cache, cero backend.
- Para **comprobantes listado**: si Marco quiere "exportar TODO el rango filtrado" (no solo la página), evaluar un endpoint backend `GET /api/comprobantes/export` que devuelva JSON sin paginar (o el `.xlsx` directo), porque paginar 50-en-50 desde el cliente para juntar miles de filas es frágil. Si alcanza con "exportar la página/vista actual", frontend basta. **Esta es una pregunta de producto para Marco** (ver fases).
- Librería sugerida: **`write-excel-file`** (liviana, mantenida, sin CVEs conocidos, API declarativa) o `exceljs` browser. Evitar `xlsx`/SheetJS de npm (desactualizado, CVEs). Decisión final en la fase de diseño.

---

## C. ¿Es mucho para un change? Propuesta de FASES

Sí conviene partirlo. El riesgo está en: (1) elegir/cablear la librería + el patrón de descarga + la cabecera fiscal compartida una sola vez, y (2) la forma anidada/jerárquica distinta de cada informe. Corte propuesto:

### Fase A — Infraestructura de export + 1 informe piloto (Libro Diario)
- Elegir e instalar la librería de export en frontend (decisión de diseño).
- Crear utilidad compartida `lib/export-excel/` (frontend, `lib/` puro): builder de hoja + helper de cabecera fiscal (consume `GET /tenants/current`) + formateo `es-BO`/`dd-mm-yyyy` + helper de descarga del blob.
- Implementar el export del **Libro Diario** (estructura anidada asiento→líneas; valida el aplanado).
- Botón "Exportar a Excel" en la página, gateado por permiso (deshabilitado si la query no tiene data).
- **Dependencia:** ninguna (los informes ya existen). Es la fase fundacional — define el patrón que las siguientes copian.

### Fase B — Libro Mayor + Estados Financieros (Balance + Resultados)
- Reusa la infraestructura de Fase A.
- Libro Mayor (anidado cuenta→movimientos, running balance).
- Balance General y Estado de Resultados (árbol jerárquico de secciones→subsecciones→cuentas; el aplanado de un árbol es el caso más distinto, por eso va después del piloto).
- **Dependencia:** Fase A (infraestructura + patrón establecido).

### Fase C — Comprobantes (listado + detalle)
- Export del detalle de comprobante (`GET /:id`) — directo, reusa infraestructura.
- Export del listado: **requiere decisión de producto** (página visible vs. rango completo). Si es rango completo → posible mini-change backend `GET /api/comprobantes/export` (sin paginar). Por eso va último: tiene una dependencia/decisión que las otras no.
- **Dependencia:** Fase A. La parte "listado completo" puede a su vez gatillar un sub-change backend.

**Corte alternativo si se quiere aún más fino:** A (infra + Diario), B1 (Mayor), B2 (Balance), B3 (Resultados), C (comprobantes). Pero A+B+C es el balance razonable: la infraestructura se prueba con el piloto, los 4 informes comparten forma de presentación, y comprobantes se aísla porque tiene la única decisión de producto abierta.

---

## D. Riesgos / Invariantes a respetar

| Invariante (CLAUDE.md) | Aplica al export | Cómo respetarlo |
|---|---|---|
| **§4.5 Money = Decimal, nunca Float** | SÍ, crítico | Los DTOs ya entregan montos como `string` decimal. Al escribir a celda Excel, mapear el string a número con formato `#,##0.00`. **No** hacer aritmética sobre el float parseado — los totales ya vienen calculados del backend (`totalDebeBob`, etc.). Si se necesita formato visual, `parseFloat` SOLO para display (igual que `formatearMontoBob`), nunca para recalcular. |
| **§4.6 FechaContable ≠ timestamp** | SÍ | Las fechas de dominio llegan como `"YYYY-MM-DD"` (sin hora/UTC). En Excel mostrar como `dd/mm/yyyy` (formato boliviano). NO convertir a `Date` con timezone (corrupción de día por UTC). Distinguir de `createdAt`/`updatedAt` (timestamptz) que NO van en el informe oficial. |
| **§4.2 Multi-tenant estricto** | SÍ | Si el export es frontend: ningún riesgo nuevo (consume endpoints ya filtrados por `tenantId` vía JWT). Si se agrega endpoint backend de export: DEBE filtrar por `tenantId` igual que el resto (defense in depth). La cabecera fiscal (`GET /tenants/current`) ya resuelve el tenant del JWT. |
| **§4.7 Comprobantes ANULADOS** | SÍ | Los 4 informes ya tienen `incluirAnulados` (default false) y marcan `anulado: boolean` por fila. El export debe respetar el toggle activo y, si incluye anulados, marcarlos visualmente (nota/columna "Anulado"). El listado de comprobantes NO tiene el toggle hoy — si se exporta, decidir si excluir anulados por default. |
| **Formato numérico/fecha boliviano** | SÍ | Separador decimal coma, miles punto (`es-BO`), fechas `dd/mm/yyyy`. El frontend ya tiene `formatearMontoBob`; reusar. En Excel, preferir celda numérica con formato `#,##0.00` (deja que Excel localice) sobre string pre-formateado, para que el usuario pueda operar sobre las celdas. Decisión de diseño. |
| **Cabecera fiscal nullable** | SÍ | Los 6 campos de `datos-empresa` son nullable. El export debe tolerar campos vacíos (no romper si `nit === null`): mostrar la fila de cabecera con los campos presentes, omitir o dejar en blanco los null. |
| **Topes de tamaño (5k/20k)** | Menor | Los informes están acotados server-side. El export en navegador de 20k filas es viable pero puede tardar; considerar feedback de "generando…". Para comprobantes en rango completo (sin tope), evaluar el riesgo de N páginas. |
| **§3 Hexagonal (solo si backend)** | Condicional | Si se elige backend para algún export: serialización xlsx = adapter (infraestructura), lectura de `Organization` = Port cross-módulo (`OrgFiscalReaderPort`), nunca import directo entre módulos. La recomendación frontend EVITA este riesgo. |
| **CVE de la librería de export** | SÍ | `xlsx`/SheetJS de npm está desactualizado con CVEs. Elegir `write-excel-file` o `exceljs` (browser) o SheetJS desde su CDN oficial. Auditar en la fase de diseño. |

---

## E. Resumen para la decisión de fases

- **Estado:** toda la data existe en JSON tipado y limpio (backend `reportes` + `comprobantes` maduros). Cabecera fiscal lista (Fase 1). **Cero librería de export instalada en ningún stack.** El trabajo es de presentación/serialización, no de cálculo contable.
- **Recomendación:** generar el Excel en el **frontend** (`write-excel-file` o exceljs-browser) sobre el JSON ya fetcheado; reconsiderar un endpoint backend SOLO para exportar el listado masivo de comprobantes (decisión de producto de Marco).
- **Fases:** A (infraestructura + Libro Diario piloto) → B (Mayor + Balance + Resultados) → C (Comprobantes, con la única decisión de producto abierta: página vs. rango completo).
- **Riesgos clave:** Money como string→celda numérica sin recálculo (§4.5), fechas `YYYY-MM-DD`→`dd/mm/yyyy` sin UTC (§4.6), respetar toggle de anulados (§4.7), cabecera fiscal nullable, CVE de librería de export.
