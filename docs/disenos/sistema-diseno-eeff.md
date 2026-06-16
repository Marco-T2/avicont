# Sistema de diseño de los Estados Financieros (EEFF)

<!--
Última edición: 2026-06-16
Última revisión contra core: 2026-06-16
Owner: backend-lead / frontend-lead
-->

> **Estado: VIGENTE / REGLAS CONGELADAS** (2026-06-16) — Documento que fija las
> reglas de diseño compartidas por las 8 pantallas de reportes contables (EEFF) del
> frontend. No describe una feature nueva: **congela** el contrato visual y de datos
> que ya existe para que el próximo reporte no lo viole por accidente ni "corrija"
> diferencias que son correctas por dominio.
>
> **Fuente de verdad de implementación**: el código en `frontend/src/features/<reporte>/`.
> Las referencias a archivos reflejan el estado al 2026-06-16; verificá contra el
> código actual antes de tocar. Si algo acá contradice un invariante del `CLAUDE.md`
> raíz (§4.5 dinero, §4.6 fecha) → va al core primero (regla anti-drift §12.3).

---

## 1. Propósito y contexto

Las 8 pantallas de reportes se construyeron **clonando una de la anterior**:

```
libro-diario  →  libro-mayor  →  balance-comprobacion  →  hoja-trabajo
                 balance-general / estado-resultados  (clones del molde EEFF)
                 evolucion-patrimonio (EEPN)  →  flujo-efectivo (clon del molde EEPN)
```

El clon iterativo es eficiente, pero **acumula drift**: cada nuevo reporte heredó
las decisiones del anterior, incluyendo las que eran accidentales (un `className`
distinto, un nombre de query param distinto) y las que eran **correctas por dominio**
(un Balance General es una foto a una fecha, no un rango; un Estado de Resultados no
"cuadra"). Sin un documento que distinga **drift accidental** de **diferencia
legítima**, el próximo dev hace una de dos cosas malas:

1. **Propaga el drift**: clona el reporte equivocado y arrastra el bug (ej. derivar el
   `rango` del archivo Excel de los filtros del usuario en vez del `response` del
   backend, que es donde están las fechas resueltas cuando se elige un período).
2. **"Homogeneiza" lo que NO debía**: ve que el Balance General no tiene filtro de
   rango y le agrega uno "por consistencia", rompiendo la semántica contable.

Este documento existe para cortar las dos. Define **9 reglas (R1–R9)** con su
rationale, una **matriz de cumplimiento** que muestra el drift real hoy, una sección
explícita de **diferencias que NO son drift**, y un **checklist** para el próximo
reporte.

---

## 2. Inventario actual (verificado contra el código)

Una fila por reporte. Valores extraídos del código real (rutas en `routes/router.tsx`,
nav en `components/nav-items.ts`, params en `features/<r>/api/get-*.ts`, filtros y
export en sus componentes/páginas).

| Reporte | Ruta | Ícono | Filtro temporal | Toggles extra | Card wrapper filtros | Tabla / headers | Cuadre | Señales de calidad | Permiso export |
|---------|------|-------|-----------------|---------------|----------------------|-----------------|--------|--------------------|----------------|
| **Libro Diario** | `/libros/diario` | `BookText` | XOR período / rango | `incluirAnulados` + **filtro por cuenta** | ❌ NO | Plana, agrupada por asiento | ❌ | ❌ | `contabilidad.libroDiario.read` |
| **Libro Mayor** | `/libros/mayor` | `BookMarked` | XOR período / rango | `incluirAnulados` + **filtro por cuenta** + `soloConMovimiento` | ❌ NO | Por cuenta, expandible a movimientos | ❌ | ❌ | `contabilidad.libroMayor.read` |
| **Balance General** | `/eeff/balance` | `Scale` | **Fecha de corte única** (`fecha`) | `incluirAnulados` | ✅ | Árbol jerárquico 3 niveles | ✅ (A=P+Pat) | ❌ | `contabilidad.eeff.read` |
| **Estado de Resultados** | `/eeff/resultados` | `TrendingUp` | Rango (`fechaDesde`/`fechaHasta`) | `incluirAnulados` | ✅ | Árbol jerárquico 3 niveles | ❌ (no cuadra) | ❌ | `contabilidad.eeff.read` |
| **Balance de Comprobación** | `/eeff/balance-comprobacion` | `ListChecks` | XOR período / rango | `incluirAnulados` | ✅ | Plana, 4 cols (sumas + saldos) | ✅ | ✅ `cuentasNaturalezaOpuesta` | `contabilidad.eeff.read` |
| **Hoja de Trabajo** | `/eeff/hoja-trabajo` | `Columns3` | XOR período / rango | `incluirAnulados` | ✅ | **Headers agrupados 2 niveles** (12 cols / 6 pares) | ✅ (6 parciales + global) | ✅ `cuentasNaturalezaOpuesta` | `contabilidad.eeff.read` |
| **Evolución del Patrimonio (EEPN)** | `/eeff/evolucion-patrimonio` | `Landmark` | XOR período / rango | `incluirAnulados` | ✅ | Matriz por componente patrimonial | ✅ | ❌ | `contabilidad.eeff.read` |
| **Estado de Flujo de Efectivo (EFE)** | `/eeff/flujo-efectivo` | `Droplet` | XOR período / rango | `incluirAnulados` | ✅ | 3 secciones (Operación/Inversión/Financiación) | ✅ (CONCILIACIÓN) | ✅ `advertencias` + heurística efectivo | `contabilidad.eeff.read` |

### Notas del inventario

- **Query params reales por reporte** (capa `api/get-*.ts`, ver §3 R8):
  - Libro Diario / Libro Mayor: `periodoFiscalId`, `fechaDesde`, `fechaHasta`, `incluirAnulados`, `cuentaId` (+ `soloConMovimiento` en Mayor).
  - Balance General: **`fecha`** (corte único) + `incluirAnulados`. **Sin** `periodoFiscalId`, sin rango.
  - Estado de Resultados: `fechaDesde`, `fechaHasta`, `incluirAnulados`. **Sin** `periodoFiscalId`.
  - Balance de Comprobación / Hoja de Trabajo: `periodoFiscalId`, `fechaDesde`/`fechaHasta`, `incluirAnulados` (canonizados en R8, 2026-06-16).
  - EEPN (Evolución del Patrimonio): `periodoFiscalId`, `fechaDesde`/`fechaHasta`, `incluirAnulados`.
  - EFE (Flujo de Efectivo): `periodoFiscalId`, `fechaDesde`/`fechaHasta`, `incluirAnulados` (canonizado en R8, 2026-06-16).
- **El filtro por cuenta lo tienen los DOS libros**, no solo el Mayor (ambos son detalle por cuenta — ver R3).
- **`fecha` de formato es-BO**: las fechas se muestran/parsean como `YYYY-MM-DD` sin pasar por `Date`/UTC (§4.6); el período se renderiza con `formatPeriodoCorto` de `@/lib/meses`.

---

## 3. Reglas (R1–R9)

Cada regla: **enunciado**, **rationale** (por qué) y **a qué reportes aplica / diverge**.

### R1 — Filtro temporal según la naturaleza del reporte

**Enunciado.** El control temporal depende de si el reporte es una **foto** o un **flujo**:

- **Foto / saldo** (estado a una fecha) → **fecha de corte única**.
- **Flujo / movimiento** (acumulado en un período) → **XOR período-fiscal / rango**.

**Rationale.** El Balance General muestra el estado patrimonial **a una fecha**: un
rango no tiene sentido contable (¿el saldo de Caja "entre el 1 y el 31"?). El Estado
de Resultados, los libros, la comprobación, la hoja de trabajo, el EEPN y el EFE son
**flujos**: acumulan movimiento en un intervalo, así que el control natural es un
período o un rango.

**Aplica / diverge.**

| Reporte | Naturaleza | Control |
|---------|-----------|---------|
| Balance General | **Foto** | Fecha de corte única (`fecha`) |
| Estado de Resultados | Flujo | Rango (`fechaDesde`/`fechaHasta`) — sin selector de período hoy |
| Libro Diario / Mayor | Flujo | XOR período / rango |
| Balance de Comprobación | Flujo | XOR período / rango |
| Hoja de Trabajo | Flujo | XOR período / rango |
| EEPN | Flujo | XOR período / rango |
| EFE | Flujo | XOR período / rango |

> **Único caso "foto" hoy: Balance General.** Si mañana se agrega un reporte de saldo
> a una fecha (ej. arqueo, antigüedad de saldos), copiá el molde de Balance General,
> NO el de los flujos.

### R2 — Toggle "incluir anulados" en todo reporte que lea comprobantes

**Enunciado.** Cualquier reporte que derive sus números de comprobantes lleva el
toggle `incluirAnulados` (default `false`).

**Rationale.** §4.7 del core: los comprobantes anulados se **preservan** y están
**excluidos por default** de reportes oficiales, pero deben poder incluirse para
auditoría interna. El toggle es la materialización de esa regla en cada pantalla.

**Aplica / diverge.** Aplica a **los 8** reportes (todos leen comprobantes). Cero
divergencias.

### R3 — Filtro por cuenta SOLO en reportes de detalle por cuenta

**Enunciado.** El filtro/autocompletado de cuenta (`cuentaId`) aparece **solo** en
los reportes que muestran detalle **por cuenta**. Los reportes agregados NO lo llevan.

**Rationale.** Filtrar por una cuenta tiene sentido cuando el reporte lista
movimientos o saldos cuenta por cuenta (querés "ver solo Caja"). En un agregado
jerárquico (Balance General, Estado de Resultados) o en un cuadre global (Comprobación,
Hoja de Trabajo, EFE), filtrar por una cuenta rompería los totales y el cuadre.

**Aplica / diverge.**

- **Lo llevan**: Libro Diario, Libro Mayor (ambos son detalle por cuenta).
- **NO lo llevan**: Balance General, Estado de Resultados, Balance de Comprobación,
  Hoja de Trabajo, EEPN, EFE.

> Nota: el inventario histórico decía "típicamente solo Libro Mayor". Verificado: el
> **Libro Diario también** tiene `cuentaId`. Ambos son detalle por cuenta, así que es
> correcto. La regla es "detalle por cuenta", no "solo el Mayor".

### R4 — Headers agrupados (2 niveles) SOLO con pares de columnas conceptualmente unidos

**Enunciado.** La cabecera de tabla de 2 niveles (un header padre que agrupa
sub-columnas) se usa **solo** cuando hay **pares** de columnas conceptualmente unidos
(típicamente ≥6 columnas en pares Debe/Haber o Deudor/Acreedor).

**Rationale.** Un header de 2 niveles agrega complejidad visual; se justifica cuando
las columnas vienen de a pares que el contador lee como una unidad. Para una tabla
plana de 4–7 columnas independientes, un solo nivel de header es más claro.

**Aplica / diverge.**

- **Lo usa**: **solo la Hoja de Trabajo** (12 columnas = 6 pares: Sumas, Saldos,
  Ajustes, Saldos Ajustados, Estado de Resultados, Balance General).
- **NO lo usan**: todos los demás (tabla plana de 1 nivel o árbol jerárquico).

### R5 — Bloque de cuadre explícito SOLO cuando el cuadre puede fallar y es señal para el contador

**Enunciado.** El bloque visible de cuadre (indicador `cuadra:boolean` + `diferencia`,
con check verde / triángulo de alerta) se muestra **solo** cuando el cuadre puede
fallar y su fallo es información accionable para el contador.

**Rationale.** Mostrar "✓ cuadra" en un reporte que **siempre** cuadra por
construcción es ruido. Y mostrar un cuadre en un reporte que **no tiene por qué
cuadrar** confunde.

**Aplica / diverge.**

| Reporte | ¿Cuadre visible? | Por qué |
|---------|------------------|---------|
| Balance de Comprobación | ✅ | Sumas y saldos deben cuadrar; si no, hay error de carga |
| Hoja de Trabajo | ✅ (6 parciales + global) | Cada par de columnas tiene su control cruzado |
| EFE | ✅ (CONCILIACIÓN: `inicial + variación ≈ final`, ±Bs 0.01) | El cuadre valida la conciliación de efectivo |
| Balance General | ✅ | A = P + Pat. Cuadra **por construcción**, pero se muestra como sello de integridad |
| EEPN | ✅ | Saldo inicial + resultado + movimientos = saldo final |
| **Estado de Resultados** | ❌ | **No cuadra**: es ingresos − egresos = resultado, no una igualdad de control |
| Libro Diario / Mayor | ❌ | Son listados de detalle, no estados de control |

> **Matiz Balance General.** Cuadra por construcción (A=P+Pat es identidad contable),
> pero hoy **sí** muestra el sello de cuadre como confirmación de integridad de la
> carga. Es la única excepción a "solo cuando puede fallar"; se acepta porque el sello
> verde tranquiliza al contador y el costo visual es bajo. NO lo replicar en reportes
> donde el cuadre sería trivialmente siempre verde sin aportar señal (ej. un listado).

### R6 — Señales de calidad en reportes de CONTROL, no en los de presentación final

**Enunciado.** Las secciones de "señales de calidad" (`cuentasNaturalezaOpuesta`,
`advertencias`, conciliación de efectivo) se muestran en los reportes de **control
interno**, no en los de **presentación final** al usuario externo.

**Rationale.** Una señal de calidad ("esta cuenta DEUDORA tiene saldo acreedor",
"detecté efectivo por heurística") es una pista de **revisión** para el contador
mientras concilia. En un estado financiero de presentación (Balance General, Estado
de Resultados, EEPN) esas señales son ruido para el lector final.

**Aplica / diverge.**

- **Las muestran**: Balance de Comprobación (`cuentasNaturalezaOpuesta`), Hoja de
  Trabajo (`cuentasNaturalezaOpuesta`), EFE (`advertencias` +
  `cuentasEfectivoDetectadasPorHeuristica`).
- **NO las muestran**: Balance General, Estado de Resultados, EEPN, Libro Diario,
  Libro Mayor.

### R7 — Layout estándar de la barra de filtros

**Enunciado.** El bloque de filtros va envuelto en un card
`className="rounded-lg border bg-card p-4"`, con el botón de export arriba a la
derecha (en la cabecera de la página, junto al título) y el mismo orden de controles
(filtro temporal → toggles → botón "Buscar").

**Sub-regla — toggle período/rango.** En los reportes de flujo con XOR período/rango
(R1), el selector de modo tiene un orden y un default canónicos:

- El botón **"Por período"** va **primero**, **"Por rango de fechas"** **segundo**.
- El **modo por defecto es `'periodo'`** (el primer botón queda activo al cargar).

Razón: el contador piensa primero en el período fiscal, y el primer botón debe ser
siempre el modo activo por defecto (coherencia primer-botón = default). Mayoría 4/6.

**Rationale.** Consistencia visual: el usuario salta entre reportes y espera la misma
ergonomía. El card delimita la zona de filtros y la separa del resultado.

**Aplica / diverge.** Aplica a **TODOS**. **Drift histórico (corregido en este change)**:
(1) **Libro Diario y Libro Mayor** no tenían el card wrapper (filtros inline) — eran los
dos primeros de la cadena de clones, antes del molde EEFF. (2) **EFE y EEPN** tenían el
toggle invertido ("Por rango" primero) y default `'rango'` — nacieron del molde EEPN con
ese orden y el EFE lo heredó. Ambos drifts quedaron normalizados. Ver matriz §4.

### R8 — Query params canónicos (RESUELTA — 2026-06-16)

**Enunciado.** El nombre canónico de query param de rango es
`fechaDesde` / `fechaHasta` (+ `periodoFiscalId` / `incluirAnulados`). Un reporte
nuevo con rango **debe** usar `fechaDesde`/`fechaHasta`, NO `desde`/`hasta`.

**Rationale.** Tener dos convenciones (`desde`/`hasta` y `fechaDesde`/`fechaHasta`)
para lo mismo obligaba a cada dev a abrir la capa `api` para saber qué nombre usa cada
endpoint, y forzaba un mapeo manual en el frontend para 3 reportes. Se eligió
`fechaDesde`/`fechaHasta` como canónico porque (a) era la convención mayoritaria
(4 de 7 reportes de rango), (b) es la que ya usan los forms del frontend
(`*FiltroValues`), así que canonizar ahí **elimina** todo el código de mapeo en lugar
de propagarlo, y (c) es más descriptivo. `fecha` (corte único del Balance General) se
mantiene aparte — no es un rango (R1: foto, no flujo).

#### Estado — RESUELTA

Change dedicado (2026-06-16): se renombraron los 3 reportes que usaban `desde`/`hasta`
(Balance de Comprobación, Hoja de Trabajo, EFE) a `fechaDesde`/`fechaHasta`. Tocó el
DTO de query backend, el mapeo en `eeff.controller.ts`, los e2e (query HTTP) y la capa
`api` del frontend (se borraron los 3 transforms, incluida la "TRAMPA R2" del EFE).
El param interno del service quedó como `desde`/`hasta` (detalle de implementación, no
expuesto). OpenAPI + `api.generated.ts` regenerados; `contract-drift` verde.

| Reporte | Param de rango | ¿Cumple R8? |
|---------|----------------|-------------|
| Libro Diario | `fechaDesde` / `fechaHasta` | ✅ |
| Libro Mayor | `fechaDesde` / `fechaHasta` | ✅ |
| Estado de Resultados | `fechaDesde` / `fechaHasta` | ✅ |
| EEPN | `fechaDesde` / `fechaHasta` | ✅ |
| Balance de Comprobación | `fechaDesde` / `fechaHasta` | ✅ (migrado) |
| Hoja de Trabajo | `fechaDesde` / `fechaHasta` | ✅ (migrado) |
| EFE | `fechaDesde` / `fechaHasta` | ✅ (migrado) |
| Balance General | `fecha` (corte único, no es rango) | N-A (R1: foto) |

> **Nota — params no documentados en OpenAPI.** Ningún reporte declara hoy sus query
> params en `openapi.json` (los DTOs de query no llevan `@ApiPropertyOptional`), así que
> `contract-drift` no cubre los nombres de params — el contrato de params vive en el DTO
> backend + la capa `api` frontend + los e2e. Documentarlos en OpenAPI es una mejora
> transversal separada (gap preexistente, no de R8).

### R9 — Export Excel gateado por el permiso de lectura del propio reporte; `rango` derivado del RESPONSE

**Enunciado.** El botón de export a Excel se gatea con el **permiso de lectura del
propio reporte** (no uno genérico), y el `rango` que va al nombre del archivo y a la
cabecera se deriva del **`response` del backend** (las fechas resueltas), NO de los
filtros del usuario.

**Rationale.**

- **Gating por permiso propio**: exportar es leer; quien puede ver el reporte puede
  exportarlo, y quien no, no. Cada reporte usa su `contabilidad.<x>.read`.
- **`rango` del response, no de los filtros**: con el filtro XOR período/rango (R1),
  cuando el usuario elige un **período fiscal** los filtros del frontend solo tienen
  `periodoFiscalId` — **no tienen fechas**. Las fechas concretas las resuelve el
  **backend** y las devuelve en el `response` (`fechaDesde`/`fechaHasta` resueltos;
  `fechaCorte` para el Balance General). Por eso el `response` es la única fuente
  confiable del rango: derivar de los filtros funciona solo si el usuario eligió un
  rango explícito, y se rompe al elegir período (ver el bug de los libros abajo).

**Aplica / diverge.**

- **Permiso de export por reporte** (verificado): Libro Diario →
  `contabilidad.libroDiario.read`; Libro Mayor → `contabilidad.libroMayor.read`; los
  6 reportes EEFF restantes → `contabilidad.eeff.read` (permiso compartido del grupo
  EEFF, que es su permiso de lectura propio — correcto).
- **`rango` del response (correcto)**: lo cumplen **Balance General** (`data.fechaCorte`),
  **Estado de Resultados** (`data.fechaDesde/Hasta` con fallback a filtros), **Balance
  de Comprobación**, **Hoja de Trabajo**, **EEPN** y **EFE** (todos derivan de
  `data.fechaDesde/Hasta` resueltos). Estos 6 reportes traen las fechas resueltas en su
  DTO de respuesta, así que el export queda bien aun cuando se filtró por período.
- **Drift real (bug) — Libro Diario y Libro Mayor**: derivaban el `rango` de los
  FILTROS (`params.fechaDesde/fechaHasta`) con fallback a `params.periodoFiscalId`.
  Cuando el usuario filtraba por **período**, los filtros no tienen fechas y el archivo
  se descargaba con el **UUID del período en el nombre** (ej. `libro-diario_550e8400-…​.xlsx`).
  El backend **sí** traía las fechas resueltas: `LibroDiarioResponseDto` y
  `LibroMayorResponseDto` las exponen anidadas bajo `rango: RangoFechasDto`
  (`data.rango.fechaDesde`/`data.rango.fechaHasta`) — los EEFF las traen planas, pero en
  ambos casos están disponibles en el response. **El bug era 100% frontend**: la página
  ignoraba `data.rango` y usaba los filtros. Fix **frontend-puro** (corregido en este
  mismo change): derivar el `rango` de `data.rango.fechaDesde/Hasta`. NO requirió cambio
  de contrato — `contract-drift` quedó limpio.

---

## 4. Matriz de cumplimiento (estado actual al 2026-06-16, post-normalización)

`✓` cumple · `✗` no cumple (drift) · `N-A` no aplica por dominio. Todo el drift
detectado en la auditoría fue normalizado (R7 + R9 en PR #215; R8 en el change del
2026-06-16). La matriz refleja el estado **resuelto**; el historial vive en git y en
las notas "RESUELTA" de cada regla (§3).

| Reporte | R1 | R2 | R3 | R4 | R5 | R6 | R7 | R8 | R9 |
|---------|----|----|----|----|----|----|----|----|----|
| **Libro Diario** | ✓ | ✓ | ✓ | N-A | N-A | N-A | ✓ | ✓ | ✓ |
| **Libro Mayor** | ✓ | ✓ | ✓ | N-A | N-A | N-A | ✓ | ✓ | ✓ |
| **Balance General** | ✓ | ✓ | ✓ | N-A | ✓ | ✓ | ✓ | N-A | ✓ |
| **Estado de Resultados** | ✓ | ✓ | ✓ | N-A | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Balance de Comprobación** | ✓ | ✓ | ✓ | N-A | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Hoja de Trabajo** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **EEPN (Evolución Patrimonio)** | ✓ | ✓ | ✓ | N-A | ✓ | ✓ | ✓ | ✓ | ✓ |
| **EFE (Flujo de Efectivo)** | ✓ | ✓ | ✓ | N-A | ✓ | ✓ | ✓ | ✓ | ✓ |

### Drift detectado y resuelto (resumen)

1. **R7 — card wrapper** (frontend-puro, PR #215): Libro Diario y Libro Mayor no
   envolvían los filtros en `rounded-lg border bg-card p-4`. Normalizado. (También R7
   sub-regla: orden/default del toggle período/rango en EFE/EEPN.)
2. **R9 — bug del `rango` en los libros** (frontend-puro, PR #215): Libro Diario y Libro
   Mayor derivaban el rango de los filtros y, con período seleccionado, ponían el UUID
   del período en el nombre del archivo. El backend ya exponía las fechas resueltas bajo
   `data.rango`. Fix: derivar el rango de `data.rango.fechaDesde/Hasta`. Sin cambio de
   contrato.
3. **R8 — params canónicos** (backend + frontend, change 2026-06-16): Balance de
   Comprobación, Hoja de Trabajo y EFE usaban `desde`/`hasta`. Migrados a
   `fechaDesde`/`fechaHasta` (canónico). Cambio de contrato (DTO + e2e + capa `api`);
   OpenAPI + `api.generated.ts` regenerados, `contract-drift` verde. **RESUELTA**.

---

## 5. Diferencias que NO son drift (no las "homogeneices")

Estas diferencias entre pantallas son **correctas por dominio**. Si el próximo dev las
ve y las "unifica por consistencia", rompe la semántica. Quedan listadas explícitamente:

- **Balance General usa fecha de corte única, no rango** (R1). Es una foto. NO le
  agregues selector de período/rango "para que sea como los demás".
- **Solo los dos libros tienen filtro por cuenta** (R3). Los agregados NO deben
  tenerlo: filtrar por cuenta rompe totales y cuadre.
- **Solo la Hoja de Trabajo tiene headers agrupados de 2 niveles** (R4). Es la única
  con pares de columnas. NO conviertas las tablas planas a 2 niveles.
- **El Estado de Resultados NO tiene bloque de cuadre** (R5). No cuadra: es
  ingresos − egresos = resultado, no una igualdad de control. NO le agregues un "✓
  cuadra".
- **Las señales de calidad (`cuentasNaturalezaOpuesta`, `advertencias`) viven solo en
  los reportes de control** (R6): Comprobación, Hoja de Trabajo, EFE. NO las muevas a
  Balance General / Estado de Resultados / EEPN: son ruido para un estado de
  presentación.
- **Todos los reportes de rango usan `fechaDesde`/`fechaHasta`** (R8, canonizado el
  2026-06-16). Ya no hay mapeo en la capa `api` (la "TRAMPA R2" del EFE se eliminó). El
  form y el endpoint hablan el mismo nombre. El param interno del service de algunos
  reportes sigue siendo `desde`/`hasta` (detalle de implementación, no expuesto).

---

## 6. Checklist para agregar un reporte nuevo

Cuando clones el próximo reporte, seguí esta lista (derivada de R1–R9):

1. **Naturaleza (R1)**: ¿foto o flujo?
   - Foto → cloná **Balance General** (control `fecha` de corte único).
   - Flujo → cloná un reporte de flujo (control XOR período / rango).
2. **Anulados (R2)**: agregá el toggle `incluirAnulados` (default `false`) si el
   reporte lee comprobantes.
3. **Cuenta (R3)**: ¿es detalle por cuenta? Sí → filtro `cuentaId`. No → sin filtro de
   cuenta.
4. **Tabla (R4)**: ¿columnas en pares conceptuales (≥6)? Sí → headers de 2 niveles
   (cloná Hoja de Trabajo). No → tabla plana o árbol jerárquico.
5. **Cuadre (R5)**: ¿el cuadre puede fallar y es señal accionable? Sí → bloque de
   cuadre visible (`cuadra` + `diferencia`, check/alerta). No → sin bloque.
6. **Señales de calidad (R6)**: ¿es reporte de control? Sí → secciones de calidad
   (`cuentasNaturalezaOpuesta`/`advertencias`). No (presentación) → sin secciones.
7. **Layout (R7)**: envolvé los filtros en `rounded-lg border bg-card p-4`, botón de
   export arriba a la derecha, orden filtro temporal → toggles → "Buscar".
8. **Params (R8)**: usá `fechaDesde`/`fechaHasta`/`periodoFiscalId`/`incluirAnulados`.
   **NADA** de `desde`/`hasta` en un endpoint nuevo (canónico = `fechaDesde`/`fechaHasta`).
9. **Export (R9)**:
   - Gateá el botón con el permiso de lectura del **propio reporte**
     (`contabilidad.<x>.read`), vía `<PermissionButton>` / `<Can>` (fail-closed).
   - Derivá el `rango` del archivo del **`response`** (fechas resueltas por el backend:
     `data.fechaDesde/Hasta`, o `data.fechaCorte` para una foto), NO de los filtros —
     porque con selección de período los filtros no tienen las fechas. Asegurate de que
     el DTO de respuesta del reporte **incluya** esas fechas resueltas.
   - §4.5: montos `string` → celda numérica **sin recalcular**.
   - §4.6: fechas `YYYY-MM-DD` → `dd/mm/yyyy` **sin pasar por `Date`/UTC**.
10. **Tipos / contrato**: si tocaste un DTO backend, regenerá `openapi.json` +
    `api.generated.ts` (job CI `contract-drift`) — ver `CLAUDE.md` §10.10.
11. **Tests**: vitest del reporte (filtros, cuadre, export). §7 del core.

---

**Fin del documento.** Para dudas que no resuelve este archivo: preguntar antes de
decidir. Se versiona en git; cualquier cambio se discute en PR (regla anti-drift §12.3
del `CLAUDE.md`).
