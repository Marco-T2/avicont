<!--
Última edición: 2026-06-15
Tipo: exploración (NO es spec ni diseño cerrado)
Estado: BASES — sin código. Backend = próxima sesión. Frontend = sesión siguiente.
Owner: backend-lead
-->

# Asiento de Cierre del Ejercicio — Exploración

> Sesión de exploración pura. NO se escribió código ni se cerró diseño.
> Objetivo: dejar las bases cruzando 3 fuentes — el sistema de referencia
> `Marco-T2/avicont-ia`, el método contable boliviano canónico
> (boliviaimpuestos / práctica), y lo que YA tiene Avicont.

---

## 1. Las 3 fuentes

### 1.1 Sistema de referencia — `avicont-ia` (módulo `annual-close`)

Implementa el cierre anual boliviano canónico como **5 comprobantes** emitidos
atómicamente dentro de una sola transacción, con regla **SKIP-on-zero** (si un
asiento queda sin líneas, se omite sin romper la atomicidad):

| # | Asiento | Tipo | Fecha | Qué hace |
|---|---------|------|-------|----------|
| 1 | **Cerrar Gastos y Costos** | CC (cierre) | 31-dic | Lleva a cero las cuentas EGRESO; contrapartida en cuenta de resultado transitoria |
| 2 | **Cerrar Ingresos** | CC | 31-dic | Lleva a cero las cuentas INGRESO; contrapartida en la misma cuenta transitoria |
| 3 | **Cerrar P&G → Resultados Acumulados** | CC | 31-dic | Vacía la cuenta transitoria (resultado neto) contra Resultados Acumulados |
| 4 | **Cerrar Balance** | CC | 31-dic | Lleva a cero ACTIVO/PASIVO/PATRIMONIO (cierre "a la antigua") |
| 5 | **Apertura de Gestión** | CA (apertura) | 01-ene (año+1) | Inversión exacta del #4: reabre los saldos de balance en la gestión nueva |

**Cuentas clave del referente:**
- `3.2.2 Resultado de la Gestión` — cuenta **transitoria** (los #1 y #2 barren aquí; el #3 la deja en cero).
- `3.2.1 Resultados Acumulados` — destino final del resultado neto.

**Mecánica de cada línea (signed-net):** por cada cuenta hoja con movimiento,
`net = (naturaleza DEUDORA) ? débito−crédito : crédito−débito`; si `net>0` se
postea el `|net|` en el lado OPUESTO a su naturaleza (la deja en cero); si `net<0`
(anomalía contraria) en el mismo lado. Invariante de partida doble verificado por
builder con `Decimal.equals`.

**Gate de habilitación (`decideGate`):**
- Camino estándar: 11 meses cerrados + diciembre ABIERTO.
- Camino borde: 12 meses cerrados + gestión aún ABIERTA.
- Idempotencia = `FiscalYear.status === 'CLOSED'` (no un flag aparte).
- Justificación obligatoria ≥ 50 caracteres.
- Re-validaciones TOCTOU dentro de la TX (re-lee estado de FY, de diciembre,
  re-asegura balance año-agregado = 0 antes de postear).

**Orden estricto dentro de la TX:** los 4 CC entran a diciembre ABIERTO → recién
después cascada de lock + marcar diciembre CERRADO → crear los 12 períodos del
año+1 → postear la apertura (CA) en enero → marcar FY CERRADA (guardado contra
carrera). El #5 reusa el output del #4 invirtiendo débito/crédito en memoria (sin
segunda agregación a BD).

Archivos núcleo (referencia): `modules/annual-close/application/annual-close.service.ts`,
`*-close-line.builder.ts` (gastos/ingresos/resultado/balance/apertura),
`domain/value-objects/closing-entry-kind.ts`.

### 1.2 Método boliviano canónico (boliviaimpuestos / práctica contable)

> Fuentes: [boliviaimpuestos — Asientos de cierre ejemplo](https://boliviaimpuestos.com/asientos-de-cierre-ejemplo/)
> (fetch directo bloqueado por anti-bot; contenido recuperado vía búsqueda),
> [Asientos de Cierre CIES Bolivia (Scribd)](https://www.scribd.com/document/950165566/Asientos-Cierre-CIES-Bolivia-1-Copy),
> [boliviaimpuestos — Curso de ajustes y asientos de cierre](https://boliviaimpuestos.com/curso-de-ajustes-contables-y-asientos/).

Definición: los asientos de cierre cierran **a fin de gestión** los saldos de
todas las cuentas que tuvieron movimiento, para impedir incorporar transacciones
posteriores y **eliminar las cuentas de resultado** (costo, gastos, ingresos).

Proceso típico (basado en la Hoja de Trabajo de columnas — la que YA tenemos):
1. **Cierre de costos y gastos**: debitar "Pérdidas y Ganancias" por el total de
   la columna de gastos de la hoja de trabajo; acreditar cada cuenta de costo/gasto.
2. **Cierre de ingresos**: acreditar "Pérdidas y Ganancias" por el total de
   ingresos; debitar cada cuenta de ingreso.
3. **Determinación del resultado**: el saldo de "Pérdidas y Ganancias" (utilidad
   o pérdida) se traslada a la cuenta patrimonial (Resultados Acumulados / del
   Ejercicio).
4. *(Opcional, escuela tradicional)* **Cierre de balance** + **asiento de apertura**.

Coincide con el referente salvo que el #4 (cierre de balance) y #5 (apertura) son
**opcionales** en la práctica moderna — muchos sistemas dejan que los saldos de
balance arrastren naturalmente.

### 1.3 Avicont HOY — qué ya existe

**Modelo fiscal (ya Bolivia-normativo):**
- `GestionFiscal` (`status: ABIERTA|CERRADA`, `mesInicio`, `closedAt`, `closedByUserId`).
  El cierre de gestión hoy **solo voltea el flag** — NO genera asientos.
- Fin de gestión **configurable por tipo de empresa** (`cierre-fiscal-por-tipo-empresa.ts`):
  comercial 31-dic, industrial 31-mar, agropecuaria 30-jun, minera 30-sep.
  ⚠️ **Divergencia con el referente**, que asume 31-dic fijo.
- `PeriodoFiscal` (12 por gestión, auto-creados; `status: ABIERTO|CERRADO`;
  `esDefinitivo` bloquea reapertura; `ordenEnGestion`).
- `cerrarGestion()` exige los 12 períodos CERRADO; `cerrar(periodo)` exige cero borradores.

**Tipos de comprobante:** `CIERRE` (C) y `APERTURA` (A) **ya existen** en el enum,
sin lógica que los genere. `SecuenciaComprobante` ya numera por `(tenant, tipo, year, month)`
de forma atómica (`FOR UPDATE`) → un CIERRE tendría su propio correlativo.

**Cuentas de resultado (seed comercial):**
- `3.1.3.001 RESULTADOS ACUMULADOS` (`esRequeridaSistema`, PATRIMONIO_RESULTADOS).
- `3.1.4.001 UTILIDAD DE LA GESTIÓN` (`esRequeridaSistema`).
- `3.1.4.002 PÉRDIDA DE LA GESTIÓN`.
- Mapeo en config: `3.1.3.001 → resultadosAcumuladosId`, `3.1.4.001 → resultadoEjercicioId`.
- ⚠️ **NO existe una cuenta transitoria única** tipo "Resultado de la Gestión" / "Pérdidas
  y Ganancias" como la `3.2.2` del referente. Tenemos UTILIDAD y PÉRDIDA separadas.

**La Hoja de Trabajo de 12 columnas YA calcula el resultado** (fila sintética
`utilidadEjercicio = Σganancias − Σperdidas`, lo rutea a ER/BG) y **EXCLUYE
deliberadamente los comprobantes CIERRE** del reporte (§4.9 / comentario en
`hoja-trabajo.ts`) — porque un asiento de cierre distorsiona las secciones ER/BG.

**Naturaleza:** columna `Cuenta.naturaleza` (DEUDORA/ACREEDORA), derivada de
`ClaseCuenta` al sembrar (ACTIVO/EGRESO→DEUDORA; PASIVO/PATRIMONIO/INGRESO→ACREEDORA),
con `esContraria` para invertir. Es exactamente el insumo del algoritmo signed-net.

---

## 2. Comparación rápida de enfoques

| Dimensión | Referente `avicont-ia` | Boliviano canónico | QuickBooks / SaaS moderno |
|-----------|------------------------|--------------------|---------------------------|
| ¿Genera asientos persistidos? | **Sí, 5** | Sí, 2–5 según escuela | **No** — cierre "blando": calcula Net Income y lo arrastra a Retained Earnings; usa "closing date" con password, sin asientos |
| Cuentas de resultado | Zeradas con asientos | Zeradas con asientos | No se zeran; el reporte las muestra por rango y reinician por período |
| Cuenta transitoria | `3.2.2` (P&G transit) | "Pérdidas y Ganancias" | N/A |
| Cierre de balance + apertura | Sí (#4 y #5) | Opcional | No (arrastre natural) |
| Idempotencia | `FY.status=CLOSED` | — | Fecha de cierre |

**Tensión de fondo para Avicont:** CLAUDE.md §10.9 nos posiciona como "PyMEs
bolivianas con control interno, estilo QuickBooks/Sage default". QuickBooks **no
postea asientos de cierre** (cierre computado). PERO el contador boliviano espera
ver el asiento de cierre en el Libro Diario, y nuestra Hoja de Trabajo ya está
armada para alimentarlo. Hoy tenemos el lado "blando" (resultado computado en la
Hoja). La pregunta es si agregamos el lado "explícito" (asientos persistidos).

---

## 3. Qué se reusa y qué falta (para la sesión de backend)

**Ya existe (reusable):**
- Cálculo de utilidad/pérdida y saldos ajustados por cuenta → `reportes/domain/hoja-trabajo.ts` + `EeffSaldosReaderPort`.
- Naturaleza por cuenta + `esContraria` → insumo del signed-net.
- Tipos `CIERRE` y `APERTURA` + numeración correlativa atómica.
- Cuentas destino sembradas (`RESULTADOS ACUMULADOS`, `UTILIDAD/PÉRDIDA DE LA GESTIÓN`).
- Flujo de creación/contabilización de comprobantes (valida partida doble, asigna correlativo).
- `cerrarGestion()` con gate de 12 períodos cerrados.

**Falta (a construir, próxima sesión):**
- Servicio que arme las líneas de cierre (barrer INGRESO/EGRESO, calcular neto, postear).
- Decisión sobre cuenta transitoria (agregar "Resultado de la Gestión" al seed, o usar UTILIDAD/PÉRDIDA directo).
- Atar la generación al cierre de gestión + guardar contra doble-cierre.
- Endpoint de disparo.
- Reconciliar la divergencia de fin-de-gestión (no es 31-dic fijo; usar `mesInicio`/`mesCierre` por tipo de empresa).

---

## 4. Decisiones de diseño pendientes (las VERDADERAS bases)

Ordenadas de más a menos estructural. Estas se cierran al arrancar el backend:

1. **¿Cierre explícito o blando?** — ¿Avicont POSTEA asientos de cierre (tradición
   boliviana, lo que hace el referente) o se queda en cierre computado estilo
   QuickBooks (lo que ya hace la Hoja de Trabajo)? Recomendación preliminar:
   **explícito**, porque el contador boliviano lo espera en el Libro Diario y ya
   tenemos casi todo el insumo. Pero hay que confirmarlo contra §10.9.

2. **¿Cuántos asientos?** — Mínimo realista boliviano = **3** (cerrar gastos,
   cerrar ingresos, trasladar resultado a patrimonio). El #4 (cierre de balance)
   y #5 (apertura) son la escuela tradicional "a la antigua": ¿los incluimos o
   dejamos que los saldos de balance arrastren naturalmente? Para "sin lógica
   compleja", arrancar con **3 asientos** y diferir #4/#5.

3. **¿Cuenta transitoria "Resultado de la Gestión"?** — ¿Agregamos una cuenta
   transit (como `3.2.2` del referente) al seed, o trasladamos directo a
   UTILIDAD/PÉRDIDA (3.1.4.x) y de ahí a RESULTADOS ACUMULADOS (3.1.3.001)?
   Define cuántas líneas y qué cuentas toca el seed.

4. **¿A qué cuenta va el resultado neto?** — ¿UTILIDAD/PÉRDIDA DE LA GESTIÓN
   (3.1.4.x) y luego a RESULTADOS ACUMULADOS, o directo a RESULTADOS ACUMULADOS?

5. **Fin de gestión variable** — el asiento se fecha en el `mesCierre` de la
   gestión (no 31-dic fijo). Usar `cierre-fiscal-por-tipo-empresa.ts`.

6. **Idempotencia y gate** — atar al `cerrarGestion()` existente; un solo cierre
   por gestión (guard + posible UNIQUE parcial `WHERE tipo='CIERRE' AND gestionId`).

7. **Interacción con la exclusión de CIERRE en reportes** — la Hoja de Trabajo y
   demás EEFF ya excluyen CIERRE. Confirmar que el asiento de cierre NO se
   double-cuente en ningún reporte.

---

## 5. Pendiente para sesiones futuras

- **Comparar con QuickBooks/Sage en detalle** (cierre computado vs explícito) —
  Marco lo mencionó; relevante para la decisión #1.
- Backend (próxima sesión): cerrar decisiones §4 → diseño → TDD.
- Frontend (sesión siguiente): pantalla de cierre de gestión + preview del asiento.
