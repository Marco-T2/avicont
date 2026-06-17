# Proposal: Asiento de Cierre del Ejercicio (cierre-ejercicio)

> Artifact store: hybrid
> Topic key: sdd/cierre-ejercicio/proposal
> Exploración previa: `docs/disenos/cierre-ejercicio-exploracion.md`
> Fecha: 2026-06-17

## Intent / Por qué

Hoy `cerrarGestion()` solo voltea el flag de la `GestionFiscal` a `CERRADA`
(valida 12 períodos cerrados) — **NO genera ningún asiento**. El resultado del
ejercicio vive 100% derivado: la Hoja de Trabajo, el Balance General y el EEPN lo
**computan** sobre los saldos de flujo INGRESO/EGRESO del rango y nunca lo leen de
una cuenta. Es el modelo "blando" estilo QuickBooks.

El contador boliviano espera otra cosa: ver el **asiento de cierre en el Libro
Diario**, con las cuentas de resultado llevadas a cero y el resultado trasladado a
patrimonio (tradición canónica boliviana, Ley 843 art. 46). Sin él, el cierre de
gestión queda contablemente incompleto a los ojos del usuario y del auditor
interno.

Este change agrega el **lado explícito**: al cerrar una gestión, el sistema
**genera 3 asientos persistidos** (cerrar gastos/costos, cerrar ingresos,
trasladar resultado a Resultados Acumulados). El contador los revisa y los
contabiliza; la gestión queda `CERRADA` recién cuando los 3 están
`CONTABILIZADO`.

**Relación con §10.9 (posicionamiento PyME estilo QuickBooks/Sage):** la tensión
está resuelta y NO se re-litiga. El cierre explícito es **posicionamiento, no
prohibición**: el mercado boliviano exige el asiento visible. El insumo ya está
casi todo construido — la Hoja de Trabajo, la naturaleza por cuenta, los tipos
`CIERRE`/`APERTURA` y la numeración correlativa atómica ya existen.

**Hallazgo clave de la lectura de código (de-riesga el principal riesgo):** la
capa `reportes` YA está cableada para comprobantes `CIERRE` con asimetría
**deliberada y documentada** (§4.9):
- Estado de Resultados, Estado de Flujo de Efectivo → **excluyen** CIERRE.
- EEPN y Balance de Comprobación → **incluyen** CIERRE.
- El port `EeffSaldosReaderPort` ya expone el flag `excluirCierre`.
El riesgo de double-conteo no es greenfield: hay un contrato existente que el
DESIGN debe respetar y completar, no inventar.

## Scope IN

- **Servicio de cierre** (módulo nuevo o dentro de `comprobantes`/`periodos-fiscales`,
  a definir en DESIGN) que, al cerrar una gestión, arme y persista **3 asientos**:
  - **#1 Cerrar gastos y costos** — cuentas clase EGRESO con movimiento → 0,
    contrapartida en la cuenta transitoria.
  - **#2 Cerrar ingresos** — cuentas clase INGRESO con movimiento → 0,
    contrapartida en la misma transitoria.
  - **#3 Trasladar resultado** — vaciar la transitoria (utilidad o pérdida)
    contra `3.1.3.001 RESULTADOS ACUMULADOS`.
- **Algoritmo signed-net** por cuenta hoja con movimiento (builders puros, partida
  doble verificada vía `Money`, regla SKIP-on-zero).
- **Fecha del asiento = `mesCierre`** de la gestión (variable por tipo de empresa
  vía `calcularMesCierre`, NO 31-dic fijo).
- **Reuso de la Hoja de Trabajo / `EeffSaldosReaderPort`** para obtener los saldos
  por cuenta hoja del rango de la gestión.
- **Estado "borrador bloqueado generado por sistema"**: los 3 asientos nacen
  no-editables por el usuario pero contabilizables por el contador (modelado
  exacto → DESIGN, ver cuestión B).
- **Tipo `CIERRE`** (ya existe) + correlativo vía `SecuenciaComprobante`.
- **Cuenta transitoria dual única**: renombrar `3.1.4.001` a "RESULTADO DE LA
  GESTIÓN" (deudora=pérdida / acreedora=utilidad) y **eliminar** la redundante
  `3.1.4.002 PÉRDIDA DE LA GESTIÓN` del seed (con cuidado de orgs ya sembradas —
  cuestión E).
- **Guard de idempotencia / anti-doble-cierre** (posible UNIQUE parcial).
- **Gate**: ata la generación al `cerrarGestion()` existente; la gestión queda
  `CERRADA` recién cuando los 3 asientos están `CONTABILIZADO`.
- **DomainErrors** namespace `CIERRE_EJERCICIO_*`.
- **Tests** unit (builders puros, 95% dominio contable) + integración (2 tenants).
- **Verificación explícita** de que cada reporte sigue cuadrando con los nuevos
  asientos CIERRE presentes (sin double-conteo ni pérdida del resultado).

## Scope OUT

- **#4 Cierre de balance + #5 Apertura de gestión** — **DIFERIDOS, siempre como
  pareja inseparable**. Los saldos de balance arrastran solos porque los reportes
  son por rango de fecha; #4 sin #5 borraría saldos, #5 sin #4 los duplicaría. No
  se construye ninguno de los dos en este change.
- **Creación de la gestión fiscal siguiente** — feature **separada y desacoplada**.
  NO entra en la transacción atómica del cierre (§3.7: si falla, no debe revertir
  el cierre). Idempotente. Tratada fuera de scope de este proposal (puede ser su
  propio change o quedar como follow-up).
- **Frontend** (pantalla de cierre + preview del asiento) — **sesión siguiente**,
  change posterior. Este change es backend-first.
- **Migración a fin-de-gestión interactivo / reapertura de gestión cerrada** — no
  se toca el flujo de reapertura existente.

## Approach

1. **Obtener saldos** de las cuentas hoja (`esDetalle=true`) de clases INGRESO y
   EGRESO en el rango de la gestión, reusando `EeffSaldosReaderPort`
   (`obtenerSaldosEnRango` + `obtenerEstructuraCuentas`). Los CIERRE previos se
   excluyen del cálculo del propio cierre (no se cierra sobre un cierre).
2. **Signed-net por cuenta**: `net = (naturaleza ACREEDORA) ? credito−debito :
   debito−credito`. Si `net>0` → postear `|net|` en el lado **OPUESTO** a su
   naturaleza (la lleva a cero); si `net<0` (anomalía contraria) → mismo lado; si
   `net==0` → **skip**.
3. **Builders puros** (domain/, sin NestJS/Prisma) producen las líneas de cada
   asiento; partida doble verificada con `Money` (±Bs 0.01). Si un asiento queda
   sin líneas → **SKIP-on-zero** (se omite sin romper el flujo).
4. **Cuenta transitoria única dual** `3.1.4.001 RESULTADO DE LA GESTIÓN`: #1 y #2
   barren contra ella; #3 la vacía contra `3.1.3.001 RESULTADOS ACUMULADOS`.
   Queda deudora si pérdida, acreedora si utilidad.
5. **Fecha** = `mesCierre` de la gestión (`calcularMesCierre` por
   `tipoEmpresaPrincipal`).
6. **Persistencia** vía el flujo `postAsiento` / creación de comprobantes
   existente (partida doble, correlativo atómico, tipo `CIERRE`), en estado
   "borrador bloqueado generado por sistema".
7. **Cierre de gestión** solo se consuma cuando los 3 asientos están
   `CONTABILIZADO`.

## Decisiones cerradas (LOCKED — no se re-litigan)

1. **Cierre EXPLÍCITO** (postea asientos persistidos), no blando. Tensión con
   §10.9 resuelta: posicionamiento, no prohibición.
2. **DOS acciones separadas**: (a) cierre de gestión, (b) nueva gestión. NO
   atómico estilo referente.
3. **3 asientos**, corte por Estado de Resultados: #1 gastos/costos, #2 ingresos,
   #3 traslado de resultado a RESULTADOS ACUMULADOS.
4. Asientos en **BORRADOR BLOQUEADO ("generado por sistema", no editable)**. El
   contador los revisa y contabiliza. Gestión `CERRADA` recién con los 3
   `CONTABILIZADO`.
5. **#4 (cierre de balance) + #5 (apertura) DIFERIDOS**, siempre como **pareja
   inseparable**.
6. **Crear la gestión siguiente NO va en la TX atómica del cierre** (§3.7).
   Idempotente: si ya existe, no la toca.
7. **Cuenta transitoria SIN deuda**: una cuenta dual `3.1.4.001` renombrada
   "RESULTADO DE LA GESTIÓN"; **eliminar** la redundante `3.1.4.002`. Destino
   final `3.1.3.001 RESULTADOS ACUMULADOS`.
8. **Algoritmo signed-net** + builders puros con partida doble verificada vía
   `Money`, regla **SKIP-on-zero**, fecha = `mesCierre` (variable por tipo
   empresa).

## Cuestiones abiertas para DESIGN (NO resolver en PROPOSE)

**A. Mecánica de la transitoria sin romper BG / EEPN / Hoja de Trabajo.**
Hoy estos reportes DERIVAN el resultado y excluyen (BG/HT/ER/EFE) o incluyen
(EEPN/Balance Comprobación) CIERRE con asimetría deliberada. Definir cómo el
movimiento de la transitoria y de RESULTADOS ACUMULADOS convive con la derivación
existente sin que el resultado aparezca dos veces ni desaparezca.

**B. Modelado del "borrador bloqueado generado por sistema".**
Hoy `BORRADOR`=editable y `CONTABILIZADO`=posteado; el concepto "borrador
no-editable pero contabilizable" NO existe (verificado: no hay flag
`generadoPorSistema` en el schema). Opciones a evaluar:
(i) flag nuevo `generadoPorSistema` + bloqueo de edición en el service;
(ii) reuso de `BORRADOR` con el frontend ocultando "editar".
Es **la decisión de modelado más delicada** del change.

**C. [RIESGO CRÍTICO] Tratamiento de los comprobantes CIERRE en TODOS los
reportes.** Con asientos CIERRE reales, RESULTADOS ACUMULADOS en la gestión
siguiente debe reflejar el cierre, pero el resultado del ejercicio de la gestión
cerrada se sigue derivando. Hay que **mapear cada reporte** (ER, EFE, BG, HT,
EEPN, Balance de Comprobación) y garantizar **NO double-conteo** en patrimonio NI
pérdida del resultado. La capa ya tiene el flag `excluirCierre` y la asimetría
documentada (§4.9) — el DESIGN parte de ese contrato, lo audita reporte por
reporte y lo completa.

**D. Idempotencia / guard anti-doble-cierre.** Evaluar UNIQUE parcial `WHERE
tipo='CIERRE' AND gestionId` (requiere ligar el comprobante a la gestión) vs guard
de servicio vs `GestionFiscal.status`. Definir la fuente de verdad de
"ya se cerró".

**E. Orgs que YA sembraron `3.1.4.002 PÉRDIDA DE LA GESTIÓN`.** No se puede borrar
a ciegas si tuviera movimiento (probablemente nunca lo tuvo, pero hay que
verificarlo y definir la migración: rename de `3.1.4.001` + estrategia para
`3.1.4.002` existente, con protocolo §11.6).

## Risks

- **[PRINCIPAL] Double-conteo o pérdida del resultado en reportes (cuestión C).**
  El resultado del ejercicio es hoy 100% derivado; introducir asientos CIERRE
  reales que tocan patrimonio puede sumarlo dos veces (derivado + asiento) o
  perderlo (si un reporte excluye CIERRE y a la vez el ejercicio ya no aparece en
  ingresos/egresos). Mitigación: la asimetría `excluirCierre` ya existe y está
  documentada por reporte; el DESIGN audita los 6 reportes uno por uno y agrega
  cobertura de regresión que valide cuadre **antes y después** del cierre.
- **Modelado del borrador bloqueado (cuestión B)** introduce un tercer estado
  conceptual; mal modelado abre un hueco (asiento de sistema editable, o
  no-contabilizable). Mitigación: decidir en DESIGN entre flag vs reuso, con
  enforcement en service (defense in depth).
- **Migración de seed (cuestión E)** sobre orgs existentes; rename + eliminación
  de cuenta `esRequeridaSistema`. Mitigación: protocolo §11.6, verificar ausencia
  de movimiento antes de eliminar.
- **Atomicidad parcial**: la gestión solo cierra cuando los 3 asientos están
  CONTABILIZADO, pero se generan en borrador; un cierre "a medias" (1 de 3
  contabilizado) debe ser un estado consistente y reversible. Mitigación:
  definir el gate en DESIGN.

## Dependencias / reuso

- **Hoja de Trabajo / `EeffSaldosReaderPort`** (`obtenerSaldosEnRango`,
  `obtenerEstructuraCuentas`, flag `excluirCierre`) — fuente de saldos por cuenta
  hoja.
- **`calcularMesCierre`** (`common/domain/cierre-fiscal-por-tipo-empresa.ts`) —
  fecha del asiento por tipo de empresa (Ley 843 art. 46).
- **Flujo `postAsiento` / creación de comprobantes** existente — partida doble,
  correlativo atómico.
- **`SecuenciaComprobante`** — el tipo `CIERRE` ya numera atómicamente
  (`FOR UPDATE`, §4.9).
- **`GestionesFiscalesService.cerrar()`** — punto de enganche del gate.
- **Cuentas sembradas** `3.1.3.001 RESULTADOS ACUMULADOS`,
  `3.1.4.001 → resultadoEjercicioId`, mapeo en config contable.
- **`Money`** (decimal.js) — toda la aritmética y verificación de partida doble.
- **Asimetría CIERRE ya documentada** en `reportes/domain/evolucion-patrimonio.ts`,
  `estado-resultados.service.ts`, `estado-flujo-efectivo.service.ts`,
  `ports/eeff-saldos-reader.port.ts` (§4.9) — contrato existente a respetar.
