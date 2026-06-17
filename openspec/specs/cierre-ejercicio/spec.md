# Cierre del Ejercicio — Especificación

<!--
Última edición: 2026-06-17
Última revisión contra core: 2026-06-17
Owner: backend-lead
-->

> Fecha: 2026-06-17
> Fase: spec canónica
> Proyecto: avicont
> Capability: `cierre-ejercicio`
> Alcance: BACKEND-ONLY (frontend = change posterior)

---

## Propósito

Al cerrar una gestión fiscal, el sistema genera **3 comprobantes tipo `CIERRE`**
(cerrar gastos/costos, cerrar ingresos, trasladar resultado a Resultados
Acumulados) en estado **BORRADOR no-editable (`generadoPorSistema=true`)**. El
contador los revisa y los contabiliza; la gestión queda `CERRADA` recién cuando
los 3 están `CONTABILIZADO`.

Referencia regulatoria: Ley 843 art. 46 (cierre de cuentas de resultado y
traslado a patrimonio) + Código Tributario art. 47 (partida doble débito=crédito).

Módulo: `backend/src/cierre-ejercicio/`.
Migración: `20260617000000_cierre_resultado_gestion` (§11.6-safe: solo `ADD COLUMN`
+ raw SQL de datos en mismo archivo; sin objetos raw SQL nuevos).

---

## Glosario

- **Comprobante de cierre**: tipo `CIERRE`, `generadoPorSistema=true`, generado por
  el módulo `cierre-ejercicio` (no por el flujo de usuario).
- **Transitoria dual**: cuenta `3.1.4.001 RESULTADO DE LA GESTIÓN` (`esRequeridaSistema=true`,
  mapeada a `resultadoEjercicioId`). Saldo acreedor = utilidad; deudor = pérdida.
- **Signed-net**: `net = (naturaleza ACREEDORA) ? creditoBob − debitoBob : debitoBob − creditoBob`.
  `net > 0` → línea al lado OPUESTO a la naturaleza (lleva a cero); `net < 0` (anomalía) → lado
  IGUAL a la naturaleza; `net === 0` → omitir (SKIP-on-zero).
- **SKIP-on-zero**: cuenta con `net === 0` no aporta línea; comprobante sin líneas no se genera.
- **mesCierre**: mes (12/3/6/9) derivado de `tipoEmpresaPrincipal` vía `calcularMesCierre`
  (Ley 843 art. 46). La fecha del asiento es el último día de ese mes en el año del período
  `ordenEnGestion=12`.
- **excluirCierre**: flag del port `EeffSaldosReaderPort` que excluye comprobantes tipo CIERRE
  del cálculo de saldos. Se usa siempre al leer saldos para el cierre.
- **Monto string**: todo importe viaja como `string` decimal (`"60000.00"`, §4.5 CLAUDE.md).
- **FechaContable**: fecha calendario puro `"YYYY-MM-DD"`, sin hora ni UTC (§4.6 CLAUDE.md).

---

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

### REQ-CE-01 — Endpoint de generación del cierre

El sistema DEBE exponer `POST /api/gestiones/:id/cierre` que, dada una
`GestionFiscal` por `id`, genere (o regenere) los comprobantes de cierre de esa
gestión. El endpoint es idempotente (REQ-CE-09). Permiso `contabilidad.gestiones.cerrar`
(reuso, sin permiso nuevo) y módulo `contabilidad` habilitado (REQ-CE-14).

El sistema DEBE exponer además `GET /api/gestiones/:id/cierre` que devuelve el
estado actual de los (≤3) comprobantes de cierre de la gestión (preview /
seguimiento), con permiso `contabilidad.gestiones.read`.

#### Escenario: generación exitosa con saldos
- **DADO** una gestión `G` con movimientos en cuentas INGRESO y EGRESO y los 11
  períodos previos CERRADO y el período `mesCierre` ABIERTO
- **CUANDO** un usuario con `contabilidad.gestiones.cerrar` invoca
  `POST /api/gestiones/G/cierre`
- **ENTONCES** responde 201 con los 3 comprobantes tipo `CIERRE` en estado
  BORRADOR, `generadoPorSistema=true`.

#### Escenario: preview de estado
- **DADO** una gestión `G` con los 3 cierres ya generados en BORRADOR
- **CUANDO** consulta `GET /api/gestiones/G/cierre`
- **ENTONCES** responde 200 con los 3 comprobantes y su estado actual, sin
  generarlos de nuevo.

---

### REQ-CE-02 — Tres comprobantes de cierre con sus líneas (signed-net)

El sistema DEBE generar hasta 3 comprobantes tipo `CIERRE`, cada uno construido
por un builder de dominio puro:

- **#1 Cerrar gastos y costos** — por cada cuenta hoja (`esDetalle=true`) clase
  EGRESO con `net>0` (naturaleza DEUDORA, saldo deudor): línea al HABER por
  `|net|` (la lleva a cero). Contrapartida agregada: al DEBE de la transitoria
  `3.1.4.001 RESULTADO DE LA GESTIÓN` por `Σ|net|` de gastos.
  Invariante: `Σ haber (gastos) === debe (transitoria)`.
- **#2 Cerrar ingresos** — por cada cuenta hoja clase INGRESO con `net>0`
  (naturaleza ACREEDORA, saldo acreedor): línea al DEBE por `|net|`.
  Contrapartida agregada: al HABER de la transitoria por `Σ|net|` de ingresos.
  Invariante: `Σ debe (ingresos) === haber (transitoria)`.
- **#3 Trasladar resultado** — vacía la transitoria contra
  `3.1.3.001 RESULTADOS ACUMULADOS` (REQ-CE-04).

Las líneas se computan en dominio puro con `Money`; cada comprobante verifica
partida doble en BOB (`Σdebe ≈ Σhaber`, ±Bs 0.01, §4.1) y lanza
`CierrePartidaDobleError` si no cuadra.

#### Escenario: cuenta EGRESO con saldo deudor (caso normal)
- **DADO** una cuenta EGRESO (naturaleza DEUDORA) con `debitoBob=60000.00`,
  `creditoBob=0.00`
- **ENTONCES** el comprobante #1 incluye una línea al HABER de esa cuenta por
  `60000.00` y suma `60000.00` al DEBE agregado de la transitoria.

#### Escenario: cuenta INGRESO con saldo acreedor (caso normal)
- **DADO** una cuenta INGRESO (naturaleza ACREEDORA) con `creditoBob=100000.00`,
  `debitoBob=0.00`
- **ENTONCES** el comprobante #2 incluye una línea al DEBE de esa cuenta por
  `100000.00` y suma `100000.00` al HABER agregado de la transitoria.

#### Escenario: cuenta con saldo contrario a su naturaleza (anomalía, net<0)
- **DADO** una cuenta EGRESO (naturaleza DEUDORA) con `creditoBob=500.00`,
  `debitoBob=0.00` (net = `−500.00`)
- **ENTONCES** la línea de cierre va al MISMO lado que su naturaleza (al DEBE)
  por `|net| = 500.00`, llevándola a cero igual; el comprobante sigue cuadrando.

#### Escenario: partida doble del comprobante verificada
- **DADO** cualquier comprobante de cierre generado
- **ENTONCES** `Σ debito === Σ credito` en BOB (±Bs 0.01); de no cuadrar, el
  builder lanza `CierrePartidaDobleError` (`CIERRE_EJERCICIO_PARTIDA_DOBLE`, 500)
  — bug de dominio, no debería ocurrir nunca.

---

### REQ-CE-03 — Caso utilidad vs caso pérdida (lado del asiento #3)

El comprobante #3 DEBE cambiar de lado según el signo del resultado
(`resultado = Σingresos − Σgastos`):

- **Utilidad** (`resultado > 0`, transitoria queda ACREEDORA tras #1+#2): línea
  al DEBE de la transitoria por el resultado + línea al HABER de
  `3.1.3.001 RESULTADOS ACUMULADOS` por el resultado. Patrimonio crece.
- **Pérdida** (`resultado < 0`, transitoria queda DEUDORA): línea al HABER de la
  transitoria + línea al DEBE de RESULTADOS ACUMULADOS por `|resultado|`.
  Patrimonio se reduce.

#### Escenario: utilidad (ingresos > gastos)
- **DADO** Ventas (INGRESO) 100000.00 cr; Costo de ventas (EGRESO) 60000.00 db;
  Sueldos (EGRESO) 20000.00 db → resultado = `+20000.00`
- **ENTONCES** #1 cierra gastos: HABER Costo 60000.00, HABER Sueldos 20000.00,
  DEBE transitoria 80000.00 (cuadre 80000.00)
- **Y** #2 cierra ingresos: DEBE Ventas 100000.00, HABER transitoria 100000.00
  (cuadre 100000.00)
- **Y** #3 traslada: DEBE transitoria 20000.00, HABER Resultados Acumulados
  20000.00; tras #3 la transitoria queda en 0 y Resultados Acumulados crece
  20000.00 acreedor.

#### Escenario: pérdida (gastos > ingresos)
- **DADO** Ventas (INGRESO) 50000.00 cr; Costo de ventas (EGRESO) 70000.00 db →
  resultado = `−20000.00`
- **ENTONCES** #1: HABER Costo 70000.00, DEBE transitoria 70000.00
- **Y** #2: DEBE Ventas 50000.00, HABER transitoria 50000.00
- **Y** #3 traslada: DEBE Resultados Acumulados 20000.00, HABER transitoria
  20000.00; tras #3 la transitoria queda en 0 y Resultados Acumulados se reduce
  20000.00 (debe).

---

### REQ-CE-04 — Cuenta transitoria dual única y cuenta destino

El sistema DEBE usar `3.1.4.001 RESULTADO DE LA GESTIÓN` (renombrada desde
"UTILIDAD DE LA GESTIÓN", `esRequeridaSistema=true`, mapeo `resultadoEjercicioId`
intacto) como transitoria dual:
- saldo ACREEDOR si la gestión da utilidad, DEUDOR si da pérdida.

El destino final del resultado es `3.1.3.001 RESULTADOS ACUMULADOS`
(`resultadosAcumuladosId`). NO existe la cuenta separada `3.1.4.002 PÉRDIDA DE LA
GESTIÓN` (eliminada del seed y de orgs ya sembradas).

#### Escenario: una sola transitoria para utilidad y pérdida
- **DADO** dos gestiones distintas, una con utilidad y otra con pérdida
- **ENTONCES** ambas usan la misma cuenta `3.1.4.001 RESULTADO DE LA GESTIÓN`
  como transitoria; ninguna referencia a `3.1.4.002`.

#### Escenario: cuentas destino no configuradas
- **DADO** una org sin `resultadoEjercicioId` o sin `resultadosAcumuladosId`
  configurados
- **CUANDO** se invoca la generación del cierre
- **ENTONCES** responde 422 con código
  `CIERRE_EJERCICIO_CUENTA_DESTINO_FALTANTE`, sin generar comprobantes.

---

### REQ-CE-05 — SKIP-on-zero (líneas y comprobantes)

El sistema DEBE omitir:
- toda cuenta hoja con `net === 0` (no aporta línea);
- todo comprobante cuyo conjunto de líneas resulte vacío (no se genera el
  comprobante).

En particular: si no hay gastos con movimiento, #1 NO se genera; si no hay
ingresos, #2 NO se genera; si `resultado === 0`, #3 NO se genera.

#### Escenario: cuenta sin movimiento neto omitida
- **DADO** una cuenta hoja con `debitoBob === creditoBob` (net 0)
- **ENTONCES** NO aparece como línea en ningún comprobante de cierre.

#### Escenario: gestión sin gastos → #1 omitido
- **DADO** una gestión con ingresos pero sin ninguna cuenta EGRESO con movimiento
- **ENTONCES** el comprobante #1 NO se genera; se generan solo #2 y #3.

#### Escenario: resultado exactamente cero → #3 omitido
- **DADO** una gestión donde `Σingresos === Σgastos` (resultado 0)
- **ENTONCES** se generan #1 y #2 (vacían las cuentas de resultado y dejan la
  transitoria en 0) pero #3 NO se genera (nada que trasladar).

#### Escenario: gestión sin INGRESO ni EGRESO con movimiento
- **DADO** una gestión sin ninguna cuenta de resultado con movimiento
- **CUANDO** se invoca la generación
- **ENTONCES** responde 422 con código `CIERRE_EJERCICIO_SIN_MOVIMIENTO`; no se
  genera comprobante alguno.

---

### REQ-CE-06 — Saldos leídos excluyendo CIERRE previo

El sistema DEBE leer los saldos de las cuentas de resultado del rango de la
gestión con `excluirCierre=true` (vía `EeffSaldosReaderPort.obtenerSaldosEnRango`
+ `obtenerEstructuraCuentas`), para no cerrar sobre cierres previos y para que un
re-cierre idempotente recalcule sobre el resultado operativo.

#### Escenario: re-generación no acumula sobre el cierre anterior
- **DADO** una gestión cuyos cierres en BORRADOR ya se generaron una vez
- **CUANDO** se regenera el cierre
- **ENTONCES** los saldos base se leen con `excluirCierre=true`; las líneas
  recalculadas son idénticas a las de la primera generación.

---

### REQ-CE-07 — Fecha del asiento = mesCierre por tipo de empresa

El sistema DEBE fechar los 3 comprobantes de cierre en el `mesCierre` de la
gestión, derivado de `tipoEmpresaPrincipal` vía `calcularMesCierre` (12/3/6/9
según tipo — Ley 843 art. 46), NO 31-dic fijo. La fecha es el último día de ese
mes en el año calendario del período `ordenEnGestion=12`.

#### Escenario: empresa comercial cierra en diciembre
- **DADO** una org `tipoEmpresaPrincipal=COMERCIAL` (mesCierre 12) y una gestión
  cuyo último período es diciembre 2026
- **ENTONCES** los 3 comprobantes de cierre llevan `fechaContable="2026-12-31"`.

#### Escenario: empresa agropecuaria cierra en junio
- **DADO** una org `tipoEmpresaPrincipal=AGROPECUARIA` (mesCierre 6) y una
  gestión cuyo período de cierre cae en junio 2026
- **ENTONCES** los 3 comprobantes llevan la fecha del último día de junio 2026.

---

### REQ-CE-08 — Comprobantes generados-por-sistema (BORRADOR bloqueado)

El sistema DEBE crear los 3 comprobantes con `generadoPorSistema=true`, tipo
`CIERRE`, estado inicial BORRADOR, vía un writer port dedicado (no por los
métodos de creación de usuario). El correlativo se asigna al contabilizar (§4.9),
no al generar el borrador.

#### Escenario: comprobantes nacen marcados
- **DADO** una generación de cierre exitosa
- **ENTONCES** los 3 comprobantes persisten con `generadoPorSistema=true`,
  `tipo=CIERRE`, `estado=BORRADOR`.

---

### REQ-CE-09 — Idempotencia / anti-doble-cierre

El sistema DEBE garantizar que no existan dos comprobantes de cierre del mismo
slot para la misma gestión, mediante:
- unicidad DB (hard): reuso de `@@unique([organizationId, origenTipo, origenId])`
  con `origenTipo` por slot (`CIERRE_GASTOS`/`CIERRE_INGRESOS`/`CIERRE_RESULTADO`)
  y `origenId=gestionId`;
- guard de servicio (friendly): antes de generar, si ya existen cierres de la
  gestión, decide regenerar (todos BORRADOR → borra path-sistema y recalcula) o
  rechazar (si alguno está CONTABILIZADO);
- `GestionFiscal.status`: si la gestión está `CERRADA`, el endpoint rechaza de
  entrada (REQ-CE-11).

#### Escenario: regenerar con cierres en BORRADOR (reemplaza)
- **DADO** una gestión con los 3 cierres en BORRADOR
- **CUANDO** se invoca `POST /api/gestiones/G/cierre` de nuevo
- **ENTONCES** los 3 borradores anteriores se borran (path-sistema) y se
  recrean con los saldos actuales; NO quedan duplicados.

#### Escenario: regenerar con un cierre ya CONTABILIZADO → rechazo
- **DADO** una gestión con #1 CONTABILIZADO y #2/#3 en BORRADOR
- **CUANDO** se invoca la regeneración
- **ENTONCES** responde 409 con código
  `CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO`; no se borra ni recrea nada.

#### Escenario: concurrencia no duplica
- **DADO** dos invocaciones concurrentes de generación para la misma gestión sin
  cierres previos
- **ENTONCES** la constraint `@@unique` impide insertar dos veces el mismo slot.

---

### REQ-CE-10 — Gate de períodos (precondición para generar)

El sistema DEBE exigir, para generar el cierre, que los 11 períodos previos de la
gestión estén CERRADO y que el período `mesCierre` esté ABIERTO. Si la
precondición no se cumple, responde 409 `CIERRE_EJERCICIO_PERIODO_NO_LISTO`.

La corrección post-cierre usa el flujo de reapertura existente (REQ-CE-13), que
vuelve a abrir el período y rehabilita la regeneración.

#### Escenario: período de cierre cerrado prematuramente
- **DADO** una gestión donde el período `mesCierre` ya está CERRADO
- **CUANDO** se invoca la generación
- **ENTONCES** responde 409 `CIERRE_EJERCICIO_PERIODO_NO_LISTO`.

#### Escenario: períodos previos sin cerrar
- **DADO** una gestión con algún período previo (1..11) aún ABIERTO
- **CUANDO** se invoca la generación
- **ENTONCES** responde 409 `CIERRE_EJERCICIO_PERIODO_NO_LISTO`.

---

### REQ-CE-11 — Gestión no encontrada o ya cerrada

El sistema DEBE rechazar la generación cuando:
- la gestión no existe (o es de otro tenant) → 404
  `CIERRE_EJERCICIO_GESTION_NO_ENCONTRADA`;
- la gestión ya está `CERRADA` → 409 `CIERRE_EJERCICIO_GESTION_YA_CERRADA`.

#### Escenario: gestión inexistente o ajena
- **CUANDO** se invoca el cierre con un `id` que no existe o pertenece a otro
  tenant
- **ENTONCES** responde 404 `CIERRE_EJERCICIO_GESTION_NO_ENCONTRADA`.

#### Escenario: gestión ya cerrada
- **DADO** una gestión en estado `CERRADA`
- **CUANDO** se invoca la generación
- **ENTONCES** responde 409 `CIERRE_EJERCICIO_GESTION_YA_CERRADA`.

---

### REQ-CE-12 — Multi-tenant aislado (CRÍTICO)

El sistema DEBE operar solo sobre la gestión, saldos, cuentas y comprobantes del
tenant del JWT activo (§4.2, Anti-31). El `tenantId` es el primer predicado de
toda lectura y escritura.

#### Escenario: aislamiento entre tenants
- **DADO** dos tenants A y B, cada uno con una gestión homónima con movimientos
- **CUANDO** un usuario de A genera el cierre de su gestión
- **ENTONCES** ni los saldos leídos ni los comprobantes creados incluyen datos
  de B; B no puede generar ni ver el cierre de la gestión de A.

---

### REQ-CE-13 — Generación atómica y atomicidad parcial al contabilizar

El sistema DEBE crear los (≤3) comprobantes de cierre en UNA transacción. La
contabilización es posterior y se hace por comprobante (cada `contabilizar` su
propia TX); un estado "1 de 3 contabilizado" es consistente y reversible.

#### Escenario: generación atómica
- **DADO** una falla a mitad de la creación de los comprobantes
- **ENTONCES** la TX revierte y NO queda ningún comprobante de cierre a medias.

#### Escenario: contabilización parcial reversible
- **DADO** una gestión con #1 CONTABILIZADO y #2/#3 en BORRADOR, gestión aún
  ABIERTA
- **ENTONCES** es un estado válido: el contador puede contabilizar #2 y #3, o
  anular #1 y regenerar.

---

### REQ-CE-14 — RBAC y módulo

El endpoint DEBE exigir el permiso `contabilidad.gestiones.cerrar` (reuso, sin
permiso nuevo) y el módulo `contabilidad` habilitado (`@RequireModule('contabilidad')`).

#### Escenario: sin permiso
- **DADO** un usuario sin `contabilidad.gestiones.cerrar`
- **ENTONCES** responde 403.

#### Escenario: módulo contabilidad deshabilitado
- **DADO** un tenant con el módulo contabilidad deshabilitado
- **ENTONCES** responde 403/404 (ModuleEnabledGuard).

---

### REQ-CE-15 — Serialización de montos y fechas

El sistema DEBE serializar todos los montos de las líneas como `string` decimal
con 2 lugares ("60000.00", §4.5) y las fechas como `"YYYY-MM-DD"` (§4.6).

---

### REQ-CE-16 — Regresión de cuadre de reportes (decisión C FIRMADA)

El sistema DEBE preservar, con los comprobantes CIERRE reales presentes, los 4
invariantes de cuadre. El contrato `excluirCierre` de los reportes existentes NO
se toca. Sea `R` el resultado del ejercicio de la gestión `G` y `RA` el saldo
de RESULTADOS ACUMULADOS:

1. ER / EFE / Balance de Comprobación / Hoja de Trabajo de `G` (excluyen CIERRE)
   reportan `R` operativo **idéntico antes y después** de contabilizar los cierres.
2. BG de `G` a fecha mesCierre: la línea sintética "Resultado del Ejercicio" da
   ≈0 tras el cierre, pero `patrimonioTotal(BG)` es **idéntico** antes y después
   (±Bs 0.01) — el resultado migró de la línea sintética a RA.
3. RESULTADOS ACUMULADOS al inicio de la gestión siguiente (`G+1`) refleja `R`
   **exactamente una vez**: `RA(inicio G+1) === RA(fin G previo) + R`.
4. EEPN de `G` (incluye CIERRE): el traslado #3 aparece en `otrosMovimientos` y
   cuadra con `saldoFinal`.

La regresión de cuadre PRUEBA R exactamente una vez (no 2R — no doble-conteo).

#### Escenario: ER invariante ante el cierre (utilidad)
- **DADO** una gestión con utilidad `R` y un snapshot del ER antes del cierre
- **CUANDO** se contabilizan los 3 cierres
- **ENTONCES** el ER de la misma gestión sigue mostrando `R` (idéntico ±Bs 0.01).

#### Escenario: patrimonio del BG conservado (utilidad y pérdida)
- **DADO** snapshots del BG a fecha mesCierre antes y después del cierre
- **ENTONCES** `patrimonioTotal` es idéntico (±Bs 0.01) en ambos snapshots.

#### Escenario: Resultados Acumulados no se duplica en la gestión siguiente
- **DADO** la gestión `G` cerrada con resultado `R`
- **ENTONCES** RESULTADOS ACUMULADOS al inicio de `G+1` es exactamente
  `RA(fin G previo) + R` (una sola vez, no `+2R`).

#### Escenario: EEPN cuadra con el traslado (pérdida)
- **DADO** una gestión con pérdida `R<0` y sus 3 cierres CONTABILIZADO
- **ENTONCES** el EEPN incluye el traslado #3 en `otrosMovimientos` y cuadra.

---

## Códigos de error

| Código | HTTP | Descripción |
|--------|------|-------------|
| `CIERRE_EJERCICIO_GESTION_NO_ENCONTRADA` | 404 | Gestión inexistente o de otro tenant |
| `CIERRE_EJERCICIO_GESTION_YA_CERRADA` | 409 | Gestión ya en estado CERRADA |
| `CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO` | 409 | Algún cierre ya CONTABILIZADO — regenerar bloqueado |
| `CIERRE_EJERCICIO_PERIODO_NO_LISTO` | 409 | Períodos previos no cerrados o mesCierre ya cerrado |
| `CIERRE_EJERCICIO_SIN_MOVIMIENTO` | 422 | Gestión sin cuentas de resultado con movimiento |
| `CIERRE_EJERCICIO_CUENTA_DESTINO_FALTANTE` | 422 | `resultadoEjercicioId` o `resultadosAcumuladosId` no configurados |
| `CIERRE_EJERCICIO_PARTIDA_DOBLE` | 500 | Bug de dominio: builder generó comprobante sin cuadre |

Namespace `CIERRE_EJERCICIO_*` propio (§6.3 CLAUDE.md).

---

## Notas regulatorias

- **Ley 843 art. 46**: cierre de cuentas de resultado al fin del ejercicio fiscal
  y traslado del resultado neto a patrimonio. Mes de cierre variable por tipo de
  empresa (COMERCIAL=dic, AGROPECUARIA=jun, PETROLERA=mar, MINERA=sep, etc.).
- **Código Tributario art. 47**: partida doble — débito debe igualar crédito.
- Los comentarios regulatorios en código deben referenciar estas normas en el
  formato `// Ley 843 art. 46 + Código Tributario art. 47: <descripción>`.
