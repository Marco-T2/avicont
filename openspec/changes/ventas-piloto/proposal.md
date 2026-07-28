# Proposal: Ventas y Cuentas por Cobrar — piloto

## Intent

Avicont registra contabilidad pero **no registra la operación que la origina**.
Una venta hoy se carga tipeando un comprobante manual: el contador elige las
cuentas, arma el débito y el crédito, y escribe la glosa. Nadie que venda pollo
va a hacer eso por cada despacho — y sin eso, el sistema no reemplaza al
cuaderno.

Falta además la pregunta que el negocio hace todos los días: **¿quién me debe y
cuánto?**. Hoy la única respuesta es el saldo del mayor de Cuentas por Cobrar,
que dice el total y no dice de quién.

Este change es un **piloto**: valida el flujo completo
`venta → cuenta por cobrar → cobro → aplicación` con el mínimo de piezas, para
que sobre él se monten después Compras, Inventario y el pack Avícola. No
pretende ser fiscalmente completo (ver Out of Scope) ni cubrir el ciclo avícola.

Corre en **organización de prueba**, no en producción.

## Scope

### In Scope

**Catálogo de ítems (mínimo)**
- `Item`: código **opcional** (único solo cuando existe, D-24), nombre,
  `tipo PRODUCTO | SERVICIO`, unidad de medida, precio unitario sugerido
  (opcional), cantidad por defecto (D-25), cuenta de ingreso (opcional, cae al
  default), `activo` (soft-delete, espejo de Contactos).
- **Módulo propio compartido** `backend/src/items/` con `ItemsReaderPort` de
  superficie mínima (D-15). No es una tabla escondida dentro de Ventas.
- CRUD y listado. Sin inventario, sin stock, sin costo.
- `cantidad` en las líneas de venta **aunque no haya inventario**: es la base
  del cálculo (`cantidad × precio = subtotal`).

**Ventas**
- Cabecera: contacto (cliente), fecha contable, `condicionPago CONTADO | CREDITO`,
  fecha de vencimiento (solo crédito), glosa.
- Líneas: ítem (FK viva **y** snapshot de descripción/precio/cuenta, D-28),
  descripción, cantidad, precio unitario, subtotal.
- **Todo en BOB** (D-10). Las líneas contables se emiten con el tri-valor del
  núcleo fijo en `moneda = BOB`, `tipoCambio = 1`, `debitoBob = debito`.
- **La venta ES su propio comprobante** (D-02), **desde el borrador**: el
  `Comprobante` nace junto con la venta y sus estados van pegados
  (BORRADOR ↔ BORRADOR). Al contabilizar se asigna el número correlativo, no se
  crea el comprobante (D-19).
- Tipo `VENTA` nuevo (prefijo `V`) con secuencia mensual propia (D-06).
  El costo real de agregar un valor al enum está medido en R-6 — es bastante
  mayor que lo que estimó la exploración.
- Dos acciones: **Guardar borrador** y **Guardar y contabilizar** (primario, D-08).
- Anulación por flag, disparada desde ventas (Anti-14), nunca desde comprobantes.

**Cuentas por Cobrar**
- **Sin tabla auxiliar** (D-07): la venta a crédito ES la partida abierta.
- `saldoPendiente = montoTotal − Σ aplicaciones`, **derivado**.
- Estado comercial `ABIERTA | PARCIAL | SALDADA`, **derivado**, ortogonal al
  estado contable.
- `VENCIDA` derivado comparando `fechaVencimiento` contra
  `ClockPort.currentDateLaPaz()` — nunca almacenado, nunca por cron.

**Cobros y aplicaciones**
- `Cobro`: contacto, fecha, monto, **cuenta destino elegible** (Caja/Banco/lo
  que el contador decida, D-05), glosa. Existe **por sí solo**, sin depender de
  ninguna venta.
- `AplicacionCobro`: N vínculos editables `cobro → venta`, con monto aplicado.
- Saldo no aplicado = `montoCobro − Σ aplicaciones`, derivado → saldo a favor.
- **La aplicación NO genera asiento** (D-03). El asiento del cobro es siempre
  `Debe <cuenta destino> / Haber CxC`, se aplique a lo que se aplique.
- **El comprobante del cobro es de tipo `INGRESO`** (prefijo `I`, secuencia
  mensual ya existente), con `origenTipo = 'COBRO'` y `origenId = cobro.id`
  (D-11). **Sin tipo nuevo en el enum.**
- Sugerencia FIFO (más vieja primero) **siempre overrideable**.

**Pantallas**
- Listado y alta/edición de ventas.
- **Cobro** al estilo *Receive Payment*: elegís cliente → se listan sus ventas
  abiertas con saldo → escribís el monto → auto-tilda de la más vieja hacia
  adelante → destildable y con monto editable por fila (H-5).
- Estado de cuenta por cliente: ventas abiertas, saldo, días de atraso.

**Configuración**
- `cuentasPorCobrarId` y `ventasId` como conceptos nuevos en
  `OrgConfiguracionContable`, mapeados desde `1.1.2.001` y `4.1.1.001` en
  `MAPEO_CODIGO_A_CONCEPTO`.

### Out of Scope

- **IVA débito e IT** (D-09). Las cuentas existen y ya están cableadas; el
  cálculo entra en v2. El piloto corre en org de prueba por esto. **La forma
  que tomará en v2 ya quedó fijada en D-29** — campo separado de `tipo`,
  referencia configurable, nunca enum ni booleano.
- **Compras / CxP.** Espejo, change propio.
- **Inventario, costo de ventas, stock.** Pack aparte.
- **Pack Avícola** (Despacho, Boleta Cerrada, faena, merma, landed cost).
  Ver Q-1 de la exploración: el diseño de v1 no debe cerrarle la puerta, pero
  no se construye acá.
- **Anticipos como pasivo separado.** Descartado (D-03).
- **Campo "Deposit" en la factura** (pago parcial en el acto en una sola
  pantalla). Es crédito + cobro, dos pasos. **El camino preferido para cuando
  entre quedó anotado en D-30** — atributo de la factura, no documento aparte.
- **Reclasificación de presentación** de CxC acreedor en el Balance General.
  Se agrega el día que moleste, sobre datos históricos.
- **Notas de crédito / devoluciones.**
- **Multi-moneda operativa** (D-10). El núcleo ya es multi-moneda *estructural*
  y aceptaría líneas en USD hoy mismo; lo que **no existe** es la fuente del
  tipo de cambio (no hay tabla `TipoCambio` ni cotizaciones — el T/C lo manda
  el cliente en el payload y el backend solo verifica coherencia aritmética).
  Vender en USD obligaría a construir esa fuente. El piloto es BOB.
- **Exportación a Excel/PDF** de los listados nuevos.

## Decisiones cerradas en el pulido (2026-07-28)

Verificadas contra el código, no razonadas en el aire. Corrigen o completan lo
que dejó la exploración.

### D-10 — El piloto es BOB, y el campo `moneda` NO va en la Venta

`LineaComprobante` guarda **tri-valor** (`moneda`, `debito`/`credito`,
`tipoCambio`, `debitoBob`/`creditoBob` — `schema.prisma:769-775`); la partida
doble se valida **solo** sobre los `*Bob` y **todos** los reportes suman
exclusivamente columnas `*Bob`. La **cabecera** del comprobante está lockeada a
BOB por el servicio (`comprobantes.service.ts:1218`,
`COMPROBANTE_MONEDA_NO_PERMITIDA`).

O sea: el receptor está construido, el **proveedor del tipo de cambio no**. No
hay tabla ni servicio de cotizaciones; el frontend de comprobantes hardcodea
`BOB`/`TC=1` y esconde las columnas. Poner `moneda` en la cabecera de la Venta
sería hacerse cargo de conseguir el T/C y convertir a BOB en la frontera.

Se emite el tri-valor fijo en BOB, que es exactamente lo que hace hoy el resto
del sistema.

### D-11 — El comprobante del cobro es `INGRESO`, sin tipo nuevo

`schema.prisma:669` documenta `INGRESO` como *"I — entradas de dinero (cobros,
ventas)"*. Con la venta llevándose su tipo propio (D-06), `INGRESO` queda para
lo que la práctica contable boliviana siempre entendió por comprobante de
ingreso: **el recibo del dinero que entra**.

El cobro se identifica por `origenTipo = 'COBRO'`, no por el tipo del
comprobante. Esto es legítimo y tiene precedente: **`origenTipo` es un `String?`
libre** (`schema.prisma:715`, comentario `// "VENTA" | "COMPRA" | "PAGO" | NULL`)
y **no hay acople 1:1 con `TipoComprobante`** — el cierre de ejercicio ya mapea
**tres** `origenTipo` distintos al **mismo** `tipo = CIERRE`
(`cierre-ejercicio.service.ts:140-142`).

Costo: cero archivos extra. Un tipo `COBRO` propio habría exigido además elegir
letra libre — `A/D/I/E/J/T/C` están tomados y el mapa inverso
`TIPO_POR_PREFIJO` (`numero-comprobante.ts:29-31`) **exige prefijos únicos de
una sola letra**.

### D-12 — Anular desvincula, en los dos sentidos

Contrastado contra la matriz completa de QuickBooks (15 operaciones sobre
factura / cobro / crédito).

- **Anular un cobro** borra sus `AplicacionCobro`. Las ventas vuelven a quedar
  pendientes **por derivación pura** — no hay estado que "reabrir". El usuario
  carga un cobro nuevo y las ve normalmente en la pantalla de cobro.
- **Anular una venta** borra sus `AplicacionCobro`. Los cobros quedan con saldo
  no aplicado, o sea saldo a favor del cliente, disponible para otra venta.
- **No existe el `delete`.** QB usa el borrado como herramienta cotidiana
  (*"borrar el Receive Payment es el método oficial para pasar una factura de
  Paid a Unpaid"*); acá §4.7 lo prohíbe: el comprobante anulado se preserva para
  siempre y su número no se reutiliza. La anulación es **lógica**, y con la
  desvinculación alcanza para cubrir el mismo caso de uso.

*Detalle para el design*: las aplicaciones son **vínculos, no hechos
contables** (no generan asiento, D-03), así que borrarlas físicamente es
coherente. La contra: se pierde el rastro de a qué estuvo aplicado un cobro
antes de anularse. Aceptable en el piloto; nombrarlo, no descubrirlo.

### D-13 — El desfase Caja/depósito NO se valida: es trabajo del contador

QB bloquea por **dependencia física**: no podés borrar un cobro que ya forma
parte de un depósito bancario. Nuestra Caja General (D-05) es el equivalente de
su Undeposited Funds, pero el traspaso Caja → Banco es un `TRASPASO` **suelto**:
no agrupa los cobros que lo componen, así que no hay vínculo que bloquear.

Consecuencia conocida y **asumida**: se puede anular un cobro cuyo dinero ya fue
depositado, y Caja General queda con saldo acreedor. La conciliación bancaria no
lo detecta —del lado banco todo cuadra— pero **el arqueo de caja sí**.

**No se construye ni el objeto depósito ni un guard de saldo de Caja.**
Verificar y corregir ese desfase es parte del oficio del contador; automatizarlo
agrega lógica que nadie pidió para un caso que el arqueo ya destapa.

### D-14 — Presupuesto de fricción: se gasta una sola vez

De la matriz de QB se desprende una jerarquía de respuestas. Para Avicont lleva
**un escalón más arriba**, porque §4.4 no tiene bypass de admin:

```
resolver  <  obligar a decidir  <  advertir  <  bloquear  <  exigir reapertura formal
```

Regla de producto: **el sistema no interroga al usuario**.

- **Cero** confirmaciones al guardar, contabilizar, aplicar, reaplicar o
  destildar. Aplicar y desaplicar no tocan contabilidad (D-03) — pedir permiso
  ahí es ruido puro.
- **Una sola** al anular: la que §4.7 ya exige con su `motivoAnulacion`
  (mínimo 10 caracteres). Es el único acto irreversible del flujo y queda en la
  auditoría para siempre; la fricción está bien puesta ahí. **No se le apila
  ninguna otra.**
- El reemplazo de *"¿está seguro?"* no es sacar el diálogo: es **mostrar la
  consecuencia concreta** — *"este cobro está aplicado a 3 ventas por Bs 4.500;
  al anularlo vuelven a quedar pendientes"*. Un cartel genérico no informa nada,
  y por eso cansa.
- Período cerrado: **reapertura formal**, igual que cualquier comprobante. Sin
  contraseña de override al estilo QB (§4.4 no lo permite).

⚠️ **Punto abierto de core**: si el `motivoAnulacion` obligatorio resultara
demasiado pesado en el flujo comercial, sacarlo es un cambio a §4.7 — va en PR
propio y con discusión explícita (§12.3), nunca por decisión de este módulo.

### Matriz de operaciones (resuelve Q-6)

| # | Operación | Respuesta | Por qué |
|---|---|---|---|
| 1 | Subir el monto de una venta cobrada | **resolver** | el saldo pendiente es derivado; cambia solo |
| 2 | Bajar el monto, pero ≥ lo cobrado | **resolver** | ídem, nada que desaplicar |
| 3 | Bajar el monto **por debajo** de lo cobrado | **resolver** | se recortan las aplicaciones **de la más reciente hacia atrás** (D-21); el excedente queda como saldo a favor por aritmética |
| 4 | Anular la venta | **advertir + motivo** | desvincula sus cobros (D-12) |
| 5 | Borrar la venta | **ilegal** | §4.7: no hay borrado físico |
| 6 | Cambiar el cliente de la venta | **advertir** | permitido (D-20: el contacto vive en la línea); desvincula todo, o quedaría un cobro del cliente A aplicado a una venta del cliente B |
| 7 | Subir el monto del cobro | **resolver** | el excedente queda como saldo a favor |
| 8 | Bajar el cobro **por debajo** de lo aplicado | **obligar a decidir** | el recorte se reparte entre ventas distinguibles; el sistema no elige |
| 9 | Anular el cobro | **advertir + motivo** | desvincula sus ventas (D-12) |
| 10 | Borrar el cobro | **ilegal** | §4.7 |
| 11 | Reaplicar a otra venta | **resolver** | cero asientos (D-03); es mover una fila |
| 12 | Cambiar el cliente del cobro | **advertir** | desvincula todo |
| 13 | Cobro ya depositado vía traspaso | **nada** | D-13: lo destapa el arqueo |
| 14 | Cualquiera de las anteriores en período cerrado | **exigir reapertura** | §4.4, sin bypass |

**El criterio del escalón 1 vs. el 2**, que es el único no obvio: se **resuelve
solo** cuando el excedente colapsa a **un agregado** (el saldo a favor del
cliente, donde da igual de qué cobro salió); se **obliga a decidir** cuando el
recorte se reparte entre **entidades distinguibles** (qué venta vuelve a quedar
abierta, y por cuánto). No es "hay ambigüedad" — es si el resultado colapsa a un
número o no.

*Nota de método*: la matriz de QB se usó como **evidencia de qué funcionó en el
mercado**, no como fuente normativa. Varias de sus filas provienen de foros de
usuarios, no de documentación, y mezclan QBO con Desktop.

### D-15 — `items` es módulo propio compartido, con la disciplina de Contactos

Resuelve Q-3 por el camino B (catálogo compartido), **sin pagar el precio que
parecía tener**. La clave está en el precedente: `ContactosReaderPort` expone al
resto del sistema exactamente **dos campos** —
`obtenerBatch(tenantId, ids, tx?) → Map<id, {id, activo}>`— con el comentario
*"No expone razón social, documento, ni otros campos — mantener el blast radius
acotado"*. Contactos son ~2.000 líneas de backend y ~2.000 de frontend; lo
*compartido* son dos campos.

O sea: "compartido" acá **no significa** diseñar para consumidores que no
existen. El CRUD, la tabla y la UI se necesitan igual en las dos opciones; el
diferencial real es dónde vive la carpeta y si hay un port de 15 líneas.

Forma de v1:

| Decisión | Valor |
|---|---|
| Módulo | `backend/src/items/`, hexagonal completo (§3.2) |
| Campos | `codigo`, `nombre`, `tipo PRODUCTO \| SERVICIO`, `unidadMedida`, `precioUnitarioSugerido?`, `cuentaIngresoId?`, `activo`, `createdByUserId` |
| Índices | `[organizationId]`, `[organizationId, activo]`, unique `[organizationId, codigo]` |
| Port | `ItemsReaderPort.obtenerBatch(...) → Map<id, {id, activo}>` — espejo exacto de Contactos |
| Cableado | **Patrón A** (port exportado del módulo principal), no módulo-hoja: no hay riesgo de ciclo — nadie de quien `items` dependa lo consume. Es como vive Contactos |

Lo que **NO** entra, a propósito:

- **Cero campos anticipando Inventario**: sin costo, sin stock, sin cuenta de
  inventario. El doc de ideas ya define que Ventas depende de Inventario de
  forma **opcional** (con Inventario apagado la venta funciona igual).
- **Sin `esVendible` / `esComprable`.** Contactos tiene sus flags porque tiene
  dos consumidores reales; acá habría un único valor posible durante todo el
  piloto. Cuando llegue Compras son dos columnas aditivas — rutina en este repo.
- `cuentaIngresoId` **se queda en el ítem** aunque tenga sabor a Ventas. Cuando
  llegue Compras sumará su `cuentaGastoId`: simétrico y explícito. Sacar el
  mapeo cuenta↔ítem a una tabla intermedia se paga siempre y acá no compra nada.

Dato de contexto: **no existe hoy ninguna entidad de producto/artículo vendible
en el repo** — ni en granja (`TipoRegistro` clasifica movimientos, `Lote` es
cría) ni en ningún lado. `Item` es el primero; no se duplica nada.

> ⚠️ **Ajustada por el estudio comparado (2026-07-28)** — la tabla de campos e
> índices de arriba se lee con cuatro correcciones: `codigo` pasa a opcional
> con UNIQUE PARCIAL (D-24), se suma `cantidadPorDefecto` (D-25), la semántica
> de `tipo` y el destino del stock quedan firmados (D-26), y la exclusión de
> `esVendible`/`esComprable` queda documentada como divergencia deliberada
> contra el consenso del mercado, no como omisión (D-27).

### D-16 — FIFO es política de la casa, no aplicación de la ley

Resuelve Q-4. **La sugerencia se queda como está**: campo de importe recibido,
auto-tilda de la más vieja hacia adelante, y el contador cambia lo que quiera a
mano. Abierto como QuickBooks, sin bloqueos ni validaciones extra.

Lo verificado, para que nadie lo reinvente ni lo cite mal:

- **Código Civil (D.L. 12760/1975), arts. 316 a 318** — "De la aplicación de los
  pagos". Verificado con dos fuentes independientes que coinciden literalmente
  (PDF del Código Civil hosteado por la OEA + InfoLeyes Bolivia).
- Art. 316-II, orden supletorio cuando el deudor **no** declara: *vencida →
  menos garantizada → más onerosa para el deudor → más antigua → proporcional*.
  **La antigüedad es el cuarto criterio, no el primero.**
- Art. 316-I: el deudor **puede** declarar a qué deuda imputa. Art. 318: el
  acreedor puede imputar en el **recibo**, y si el deudor lo acepta queda firme
  salvo sorpresa o dolo.
- El **Código de Comercio no tiene regla propia** de imputación (verificado
  sobre el PDF oficial de ASFI); rige el Civil por remisión de su art. 1. Ojo
  con el art. 788 CC, que también se llama "Imputación de pagos" pero es del
  contrato de sociedad civil — **no es este**.

**Por qué esto NO cambia el código**: el art. 316-II es una regla **supletoria**
—existe para dirimir un conflicto posterior, no para dictar el orden de una
lista— y el art. 318 habilita expresamente al acreedor a imputar. Ninguna norma
obliga a un default determinado. Es política de la empresa.

⚠️ **Consecuencia para §2.2: ese `ORDER BY` NO lleva comentario regulatorio.**
FIFO no implementa el art. 316-II, y etiquetarlo como si lo hiciera sería darle
falsa autoridad a una decisión de producto. Queda documentado acá justamente
para que nadie le agregue después un `// Código Civil art. 316: FIFO` que es
falso.

*Nota para v2*: si algún día se cobran intereses por mora, el **art. 317** sí
manda imputar a intereses y gastos **antes** que a capital, con una regla
peculiar boliviana (un quinto al capital y el saldo a intereses cuando el pago
se hace a ambos sin observación del acreedor). Ahí sí habrá que citar la norma.

### D-17 — El asiento se regenera como cualquier edición: líneas sí, cabecera no

Resuelve Q-5, y **el mecanismo ya existe y está probado** — es el de §4.3, no
uno nuevo. Editar una venta contabilizada reemplaza **las líneas en bloque**
(borrado físico + re-inserción) y **preserva la cabecera con su `id`**, o sea
con su `numero`. El número correlativo nunca se toca: sigue siendo inmutable
desde la primera contabilización (§4.9).

*Corrección al análisis previo*: se había dicho que "no hay precedente". Lo hay
— lo que no sirve de molde es el **cierre de ejercicio**, que borra y recrea el
comprobante ENTERO, cosa que solo puede hacer porque sus asientos viven en
BORRADOR. El camino de **edición** de comprobantes hace exactamente lo que hace
falta acá.

**Consecuencia que sí hay que resolver en el design**: el comprobante de la
venta lleva `generadoPorSistema = true`, y ese flag **bloquea
`editarContabilizado`** (`comprobantes.service.ts:594`). Ventas no puede usar el
camino de usuario: el `ComprobanteWriterPort` necesita un **método de
sistema** que reutilice la misma mecánica de reemplazo de líneas. El precedente
del bypass ya existe — el writer del cierre borra con `generadoPorSistema: true`
en el `where`.

Detalle heredado del core, no decisión nueva: el número codifica `YYMM`, así que
mover la `fechaContable` de una venta a otro mes **conserva** su número original
(`V2606-000042` con fecha de julio). Es la conducta que §4.3 ya acepta para
cualquier comprobante; que nadie la "arregle" después.

> **Refuerzo externo (2026-07-28)**: ver «Evidencia VeriFactu» al final de las
> decisiones del estudio comparado. La libertad de edición de esta decisión se
> sostiene porque corre sobre los rieles de §4.3/§4.4/§4.9; Invoice Ninja, sin
> esos rieles, tuvo que apagar la suya entera con un `if` al entrar en régimen
> fiscal estricto.

### D-18 — Anular desvincula el match; la conciliación se re-vincula sola

Resuelve Q-7, y la respuesta es que **ya está construido**. `LineasCuentaReaderPort`
—el único puerto por el que la conciliación ve el núcleo— resuelve el caso por
construcción:

- `listarPorCuentaEnRango` devuelve solo `CONTABILIZADO`/`BLOQUEADO` con
  `anulado = false`. El comentario del port lo dice: *"un BORRADOR no movió
  plata y un anulado dejó de moverla — ninguno de los dos es conciliable"*.
  Anulado el comprobante, su línea **desaparece del conjunto conciliable sola**.
- `listarPorAnclas` existe **exactamente para esto**: *"NO filtra por `anulado`
  ni por `estado`: existe para DIAGNOSTICAR por qué se rompió un vínculo —
  distinguir 'la línea no existe' de 'el comprobante fue anulado' exige poder
  VER la línea anulada"*.

O sea: el match queda como **ancla huérfana**, la conciliación puede explicar
por qué se rompió, y el usuario re-vincula el movimiento contra la línea
correcta. **Nada que construir, ningún evento, ningún acople nuevo** — el core
sigue sin saber que la conciliación existe.

Encuadre de Marco, que es el que corresponde: **la conciliación es un método de
apoyo**, no una autoridad sobre el asiento. Un vínculo roto es información para
el contador, no un error del sistema.

### D-19 — El comprobante nace con el borrador de la venta

Resuelve B-3. **La venta ES su propio comprobante también cuando es borrador**:
guardar un borrador de venta crea el `Comprobante` en BORRADOR, y los dos
estados van pegados. Contabilizar **no crea** el comprobante — le asigna el
número correlativo, que es lo que §4.9 siempre hizo.

Con esto **el cierre de período no se toca**: una venta en borrador ES un
comprobante en borrador, así que el chequeo "cero borradores en N" de §4.4 la ve
sin aprender nada nuevo. La alternativa —enseñarle al cierre a mirar `Venta`—
habría metido a Ventas dentro de un invariante del core, que es exactamente lo
que no queremos.

Consecuencias para el design:

- Eliminar un borrador de venta **debe** eliminar su comprobante borrador. Y
  como el comprobante lleva `generadoPorSistema = true`, eso solo se puede por
  el camino de sistema (`eliminarBorradorSistema` ya existe como precedente).
- Editar un borrador de venta regenera las líneas del comprobante borrador por
  la misma mecánica de D-17.
- El comprobante borrador **no tiene número** hasta contabilizar. Nada cambia
  respecto de cualquier otro comprobante.

### D-20 — El contacto SÍ es editable, porque vive en la línea

Resuelve B-4. La auditoría señaló que **Anti-15** declara el contacto inmutable
tras CONTABILIZADO y exige anular + recrear, y pidió alinearse o justificar por
escrito. Acá va la justificación.

**El contacto no es un campo de la cabecera: vive en la línea de detalle del
comprobante.** Y las líneas se borran y se re-insertan en bloque en cada edición
(§4.3, D-17). O sea que cambiar el contacto **no es una excepción al mecanismo:
es el mecanismo funcionando**. La cabecera, su `id` y su número quedan intactos.

Por qué los daños que enumera Anti-15 no aplican acá:

| Daño que cita Anti-15 | Estado en Avicont |
|---|---|
| Rompe el LCV / RCV | **Fuera de scope** (§10.9): el sistema no lo genera |
| Rompe la reconciliación SIN | **Fuera de scope**: no hay integración |
| Rompe CxC y el aging | **Es justamente lo que se quiere corregir**: CxC ES la venta, y si el contacto estaba mal, el aging estaba mal |

Anti-15 habla textualmente del **NIT** del contacto, y el NIT importa para el
LCV — que no construimos. Lo que queda de su preocupación se cubre con la regla
de la matriz: **cambiar el contacto desvincula TODAS las aplicaciones** (filas 6
y 12). Sin eso quedaría un cobro del cliente A aplicado a una venta del cliente
B, que es el agujero real. Con eso, no queda nada colgado.

### D-21 — El recorte de aplicaciones es LIFO: espejo exacto del FIFO

Resuelve B-5. La auditoría detectó —con razón— que la matriz ponía la fila 3 en
"resolver" hablando de *"la aplicación"* en singular, y que con varios cobros
aplicados hay que elegir cuál se recorta.

**La salida no es molestar al usuario: es definir el orden inverso.** Se aplica
de lo **más viejo** hacia adelante; se recorta de lo **más reciente** hacia
atrás. Lo último que entró es lo primero que sale. Es la conducta de QuickBooks
y es determinista, así que la fila 3 se queda en el escalón "resolver" — ahora
con una regla enunciada en vez de un singular que escondía el caso.

```
Venta 1.000        Cobro 1: 500     Cobro 2: 500

Se baja la venta a 800
                   Cobro 1: 500     Cobro 2: 300   → saldo a favor 200
```

El excedente liberado queda como **saldo no aplicado del cobro recortado**, o
sea saldo a favor del cliente, disponible para otra venta. El recorte cascadea
hacia atrás hasta absorber toda la diferencia.

### D-22 — El backfill de `tiposComprobanteAplicables` es OBLIGATORIO

Cierra la decisión que R-7 dejaba abierta. **No es comodidad: sin backfill,
ninguna venta podría llevar factura adjunta.** Tres hechos verificados:

1. **Array vacío significa NINGUNO, no "todos".** El comentario del schema es
   literal: *"Lista vacía = ningún tipo aplica (no wildcard)"*
   (`schema.prisma:920`), y el DTO lo repite. No hay fallback.
2. **La validación es rechazo duro del backend**, no filtro de UI:
   `comprobantes.service.ts:1080` lanza
   `TipoDocumentoIncompatibleConComprobanteError` si el tipo del comprobante no
   está en el array. El frontend refuerza el bloqueo — el combobox filtra por lo
   mismo, así que el usuario **ni vería opciones**.
3. **El tipo que parecía comodín tampoco salva**: `comprobante-interno` del seed
   no usa wildcard, **enumera los 7 valores explícitamente**. Agregar `VENTA` al
   enum no lo incluiría.

**Regla del backfill**: agregar `VENTA` a todo `TipoDocumentoFisico` cuyo array
ya contenga `INGRESO`. Alcanza a los cuatro que corresponden —
`factura-emitida`, `recibo-ingreso`, `nota-debito-emitida` y
`comprobante-interno`— es idempotente, y respeta a quien haya personalizado sus
tipos.

**Y hay que tocar el seed también.** `TIPOS_UNIVERSALES`
(`backend/src/tipos-documento-fisico/seed/tipos-universales.ts`) siembra los 8
tipos al crear cada organización: sin actualizarlo, el backfill arregla las orgs
de hoy y **el problema se reproduce en cada tenant nuevo**.

Precedente exacto: `20260521000633_backfill_tipos_documento_fisico` ya hizo un
backfill data-only de esta misma tabla, idempotente y escrito a mano — y en su
propio texto **prescribe una migración nueva para justo este caso**. Volumen
local: 8 filas.

⇒ **Son TRES migraciones**: enum, tablas, y backfill data-only. El Rollback Plan
se corrige en consecuencia.

### D-23 — Permisos del template Contador

El criterio implícito del template, leído de los hechos: **el Contador
contabiliza y anula asientos, pero no cierra nada** — tiene
`asientos.{CRUD, post, void, edit-posted}` y **ningún** verbo irreversible
(`gestiones.cerrar`, `periodos.cerrar/reabrir/marcar-definitivo`). *Corrección
del relevamiento original*: acá figuraba también `cierre-mensual.execute` como
verbo real — **no lo es**. `cierre-mensual.{read,execute}` son legacy
declarados sin endpoint; el cierre mensual de verdad se enforcea como
`contabilidad.periodos.cerrar` (verificado en el PR de RBAC, ver abajo).

Por simetría, Ventas recibe el mismo trato que asientos:

| Submódulo | Verbos para el Contador |
|---|---|
| `ventas` | `read, create, update, delete, post, void` |
| `cobros` | `read, create, update, delete, post, void` |
| `items` | `read, create, update, delete` |

Un contador que puede contabilizar y anular un asiento manual puede hacerlo con
una venta: es el mismo acto. Ningún verbo de cierre.

**Actualizado tras el PR de RBAC (#291, abierto en paralelo el 2026-07-28)**
— dos datos de esta decisión cambiaron de signo y uno se confirma:

- **El argumento "está en juego menos de lo que parece" se dio vuelta.** Esta
  decisión minimizaba el impacto porque el seed hacía `upsert` con
  `update: {}` — el rol contador existente no se tocaba y sumar strings solo
  afectaba roles creados desde cero. **Ya no**: #291 pasa los upserts de
  contador y granjero a `update: { permissions: ... }`, así que el template se
  refresca en cada corrida del seed y **sumar permisos SÍ alcanza a la org
  piloto**. Consecuencia: la lista de verbos de la tabla de arriba deja de ser
  un default inofensivo — es lo que el rol va a tener de verdad.
- **Las organizaciones nuevas siguen sin recibir ningún template** — esto NO
  cambió: `TenantsService.create` siembra plan de cuentas, tipos de documento
  y tipos de registro, pero no crea ningún `CustomRole`. Lo que #291 corrigió
  es el **comentario mentiroso** de `schema.prisma:274` ("se precargan al
  crear la org"), no el comportamiento.

⚠️ **Hallazgo colateral — RESUELTO en #291** (acá estaba anotado como "va en
PR de RBAC propio"; ese PR ya existe y lo que encontró difiere del
relevamiento original):

- `contabilidad.asientos.edit-posted` **sí se enforcea** (2 call sites en
  `ComprobantesService` vía `rbac.hasPermission`) y **quedó declarado en el
  catálogo** ⇒ pasa a ser asignable desde la UI, marcado como acción sensible.
  **Esto habilita D-17/D-20 para Ventas**: el molde del permiso
  estado-dependiente ya existe y está catalogado.
- `contabilidad.periodos.create` **no lo enforcea nadie**: los 12 períodos
  nacen al crear la gestión fiscal, y ese endpoint exige `gestiones.create`.
  Sale del template; entran `gestiones.{read,create}`.
- `contabilidad.cierre-mensual.create` **tampoco lo enforcea nadie**, y el
  relevamiento original de esta decisión estaba equivocado en el verbo: el
  real no es `execute` — `cierre-mensual.{read,execute}` son legacy sin
  endpoint y el cierre mensual se enforcea como `contabilidad.periodos.cerrar`
  (corregido arriba).
- El hueco de fondo era **del test**: escaneaba solo decoradores en
  controllers. `catalogo-vs-controllers.spec.ts` ahora confronta el catálogo
  contra **tres puntas** — decoradores, `.hasPermission(...)` en todo `src/`,
  y `seed.ts ⊆ catálogo`. Barrido completo: **cero fantasmas adicionales**.

**Y el criterio de esta decisión ya actuó como guarda, no como preferencia**:
la primera versión de #291 le otorgaba `contabilidad.periodos.cerrar` al
Contador; Marco lo frenó **citando D-23**, y se corrigió. El template queda
con `periodos.read` + `cierre-mensual.read` + `gestiones.{read,create}` y
**ningún verbo irreversible** — `periodos.cerrar` se evaluó explícitamente y
se descartó. La tabla de verbos de Ventas de arriba sigue el mismo criterio,
ahora probado en combate.

### D-06 — sigue en pie, pero su costo estaba mal medido

La exploración dice que agregar `TipoComprobante.VENTA` *"cuesta un valor en el
enum + una línea en `PREFIJO_POR_TIPO`"*. **Es falso**, y la decisión se
reconfirma **conociendo el precio real** (detalle en R-6): lo que se compra es
la serie de numeración `V2607-000001` separada de los `I`.

## Decisiones del estudio comparado (2026-07-28)

Salen de leer el **código** de los cuatro sistemas de referencia desplegados en
`~/proyectos`: Odoo 19, ERPNext v16, Bigcapital e Invoice Ninja 5.13. Mismo
criterio de método que la matriz de QB (D-12/D-14): evidencia de qué funcionó
—y qué dolió— en el mercado, no fuente normativa. Las citas de archivo y línea
están verificadas contra los repos locales, no contra documentación.

### D-24 — `codigo` del ítem es OPCIONAL, con UNIQUE PARCIAL (ajusta D-15)

Invoice Ninja tiene **un solo campo obligatorio** en el producto: el concepto
(`product_key` — `app/DataMapper/InvoiceItem.php:23`); todo lo demás es
opcional. Es el sistema de mostrador de los cuatro, y la lección es de
fricción pura: **obligar a inventar un código antes de poder guardar es
pedirle nomenclatura a quien solo quiere cobrar**. El negocio que trabaja con
códigos los va a cargar; al que no, el sistema no lo detiene.

- `codigo` pasa a nullable. Unicidad **solo cuando existe**: UNIQUE PARCIAL
  sobre `(organizationId, codigo) WHERE "codigo" IS NOT NULL`.
- **Precedente exacto en casa**:
  `contactos_organizationId_documento_partial_key` (UNIQUE PARCIAL
  `WHERE documento IS NOT NULL`, migración `20260424020927_fase_1_4_contactos`,
  en la tabla de objetos raw vivos de `CLAUDE.md` §11.6) — el mismo problema
  (`documento` opcional, único cuando está) resuelto de la misma forma.
- Enforcement **simultáneo** constraint + guard de servicio con error amigable
  (cicatriz F-01: solo-servicio falla bajo concurrencia; solo-constraint da un
  500 críptico).
- **Costo asumido con los ojos abiertos**: un unique parcial no se expresa en
  `schema.prisma` — es **objeto raw SQL** y arrastra el protocolo §11.6
  completo. Va escrito a mano al final de la migración de tablas, entra a la
  tabla de objetos raw vivos de `CLAUDE.md` §11.6, y **toda migración
  regenerada de acá en adelante va a intentar dropearlo** (los `contactos_*`
  aparecen en cada regeneración desde 2026-04; este se les suma).

La fila de índices de D-15 queda corregida: donde decía
`unique [organizationId, codigo]` va el parcial.

### D-25 — `cantidadPorDefecto` entra; `unidadMedida` no se toca (ajusta D-15)

Dos calibraciones del mismo estudio, en direcciones opuestas:

- **`cantidadPorDefecto` entra** (`@db.Decimal(18,6)`, default 1). Invoice
  Ninja lo trae en el producto como "Cantidad por Defecto" (`Product.php`,
  campo `quantity`). Un campo, cero lógica: si el negocio vende en cajas de 12
  o jaulas de 20, la línea nace pre-llenada y el vendedor confirma en vez de
  tipear. Relación costo/valor difícil de superar.
- **`unidadMedida` se conserva como string en el ítem.** Los dos extremos del
  mercado la encuadran: Invoice Ninja NO la tiene; ERPNext le dedica un
  DocType entero (`UOM`) con tabla de conversiones. Nuestro string libre es el
  punto medio correcto para un negocio que vende por kilo — nombra la unidad
  sin comprarse un motor de conversiones que nadie pidió.

### D-26 — `tipo PRODUCTO | SERVICIO` se queda, pero el stock JAMÁS será un tercer valor (ajusta D-15)

El estudio destapó que el enum puede estar cortando por el eje equivocado.
Bigcapital usa **tres** valores — `service | non-inventory | inventory`
(`Item.schema.ts:7`) — porque separa dos preguntas que nuestro `tipo` mezcla
en una: *¿es físico?* y *¿le sigo el stock?*. Y `non-inventory` es
**exactamente el caso del piloto**: vendemos cosas físicas sin llevar stock.
ERPNext corta por el otro lado: no tiene campo tipo — tiene un booleano
`is_stock_item` y nada más.

La disyuntiva, con honestidad: en el piloto `tipo` no alimenta ninguna lógica.
Podría borrarse (camino ERPNext) o triplicarse (camino Bigcapital). Decisión
tomada:

- **Se queda con dos valores**, con la semántica redefinida por escrito:
  `tipo` responde *¿es físico?* y nada más. Es la distinción que el negocio
  nombra ("vendo pollo y también flete") y mantenerla no cuesta nada.
- **"¿Le sigo el stock?" será un booleano aditivo** (`llevaStock` o el nombre
  que fije el pack Inventario), a la ERPNext — **nunca un tercer valor
  `INVENTARIO` del enum**. Dos razones, las dos medidas:
  1. El costo real de un valor de enum en este repo: 4 archivos backend que el
     compilador exige + **9 listas hardcodeadas del frontend que NO avisan**
     (medido en R-6 para `TipoComprobante`; el enum de `Item` va a criar sus
     propias listas y pagará el mismo precio por cada valor).
  2. Mezclar ejes en un solo campo es la pendiente que termina en la lista de
     9 valores de Invoice Ninja (ver D-29): cada combinación nueva de los ejes
     exige un valor nuevo, y a los dos ejes siguientes la lista es
     incomprensible.

### D-27 — Sin `esVendible`/`esComprable`: divergencia DELIBERADA contra el consenso (confirma D-15)

**3 de los 4 sistemas los tienen**: Odoo (`sale_ok`/`purchase_ok`), ERPNext
(`is_sales_item`/`is_purchase_item`), Bigcapital (`sellable`/`purchasable` —
`Item.dto.ts:54,90`). D-15 los dejó afuera por YAGNI y **la decisión se
sostiene**: durante todo el piloto hay un único consumidor (Ventas), así que
los flags tendrían un único valor posible — un campo que no puede variar no es
un campo, es una constante con disfraz.

Lo que cambia es el registro: **queda escrito como divergencia deliberada
contra el consenso del mercado, no como omisión**. Una omisión sin documentar
se lee como olvido. El que llegue con Compras en la mano tiene que encontrar
esta nota: ahí los flags pasan a tener dos consumidores reales y entran como
dos columnas aditivas — rutina en este repo, tal como D-15 ya anticipó.

### D-28 — `LineaVenta` lleva FK al ítem Y snapshot: las dos cosas

El patrón **unánime y no declarado** en los cuatro sistemas: el documento
guarda una **copia de la configuración vigente al momento de emitirse**
(descripción, precio, cuentas). El ítem del catálogo cambia mañana; la venta
de ayer es un hecho y no se mueve.

Y la advertencia del que tiró de más: Invoice Ninja guarda en la línea SOLO el
snapshot — `product_key` como string suelto, **sin `product_id`**
(`app/DataMapper/InvoiceItem.php`: cero apariciones; las líneas son un blob
JSON en la factura). Consecuencia verificada en su propio código: "ventas por
producto" **no se puede responder en SQL** — `ProductSalesExport.php:88`
filtra con `whereJsonContains` y después **recorre las facturas en PHP**
(`:162-166`) comparando strings; renombrar el producto rompe la serie
histórica. Los otros 3 conservan la referencia (ERPNext `item_code`, Odoo
`product_id`) y son los que pueden agregar.

Para `LineaVenta`:

| Pieza | Qué guarda | Para qué |
|---|---|---|
| `itemId` FK | referencia viva al catálogo | "ventas por ítem" es un JOIN; el rename no rompe historia |
| `descripcion` snapshot | el texto al momento de vender, editable por línea | el documento dice lo que se pactó |
| `precioUnitario` snapshot | el precio pactado, no el sugerido vigente | ídem |
| `cuentaIngresoId` snapshot | la cuenta resuelta al crear la línea | la regeneración (D-17) reproduce el MISMO asiento aunque la config del ítem haya cambiado |

El snapshot de la cuenta no es cosmético: sin él, editar una venta
contabilizada re-resolvería la cuenta desde la config **actual** del ítem, y
la regeneración de D-17 produciría un asiento distinto del original por un
cambio de configuración que nada tuvo que ver con la edición. La re-validación
del Approach sigue aplicando entera: cuenta desactivada en el snapshot →
error, no bypass.

### D-29 — Anotación para v2: el tratamiento del IVA será una REFERENCIA configurable, separada de `tipo` (anota D-09)

D-09 dejó el IVA fuera del piloto y **sigue fuera**. Esto fija la forma que
tendrá cuando entre, para que nadie la improvise en caliente:

1. **Campo separado de `tipo`.** Invoice Ninja fundió los dos ejes en una sola
   lista de 9 valores (`Product.php:73-81`: Físico / Servicio / Digital /
   Envío / Exento / Tasa reducida / Override / Tasa cero / Inverso), y el
   resultado es que **no puede decir que un bien físico está exento** — un
   campo, un valor. Esa lista existe para serializar el código UBL de la
   factura electrónica europea (`'S'`/`'E'`/`'Z'`/`'AE'` —
   `Product.php:117-120`): es **destino de serialización, no modelo**.
2. **Referencia a un registro configurable, no enum ni booleano.** El patrón
   correcto es `sell_tax_rate_id` de Bigcapital / `account.tax` de Odoo. Un
   booleano `exento` tiene una trampa específica: **exento ≠ tasa cero** (la
   tasa cero permite recuperar crédito fiscal; la exención no), un booleano
   los vuelve indistinguibles y la diferencia recién aparece en la
   declaración, cuando ya es tarde.

Nada de esto toca el piloto: el `Item` de v1 **no lleva ningún campo de IVA**.

### D-30 — Anotación para v2: el anticipo exigible como ATRIBUTO de la factura (anota D-04)

D-04 dejó el "Deposit" fuera del piloto y **sigue fuera**. Camino preferido
cuando entre: el de Invoice Ninja — `partial` + `partial_due_date` como
**atributos de la factura** (`Invoice.php:195,228`), con estado propio
`PARTIAL` y el vencido calculado contra **ambas** fechas
(`Invoice.php:503-511`). Para un negocio que trabaja con seña ("50% para
despachar, saldo a 30 días") es un solo documento con dos vencimientos — más
natural que fabricar dos documentos. No pisa D-03/D-07: el anticipo exigible
es un atributo de la venta, no un pasivo separado ni una tabla nueva.

### Evidencia VeriFactu — el modelo libre se apaga solo al entrar en régimen estricto

La cita de oro del estudio, dicha por el código de un competidor. Invoice
Ninja —el más permisivo de los cuatro con editar y borrar— al activar
**VeriFactu** (facturación electrónica española) **bloquea borrar, cancelar y
revertir sus propias facturas**:
`app/Utils/Traits/Invoice/ActionsInvoice.php` — `invoiceDeletable` (:41-53),
`invoiceCancellable` (:67-77), `invoiceReversable` (:89-92); la rama
`verifactuEnabled()` devuelve `false` para casi todo lo que en modo libre
devuelve `true`.

Por qué pesa acá: es la prueba —dicha por el que la sufrió— de que **el modelo
libre no sobrevive a la contabilidad seria**. El mismo producto, al entrar en
régimen fiscal estricto, apaga su propia flexibilidad con un `if`. Avicont ya
está parado del lado correcto: el borrado está prohibido desde el día uno
(§4.7, D-12), el número correlativo es inmutable (§4.9, D-17), y la edición
libre corre solo dentro de período abierto y con auditoría por triggers
(§4.3). Lo que Invoice Ninja tuvo que apagar de apuro, acá nunca estuvo
prendido. Si algún día el SIN exige un régimen equivalente (R-1), el punto de
partida es este — no el de ellos.

## Capabilities

- `ventas` — nueva. Documento comercial, ciclo, líneas, generación del asiento.
- `cuentas-por-cobrar` — nueva. Cobros, aplicaciones, saldos, estado de cuenta.
- `items` — nueva. Catálogo mínimo compartido.
- `comprobante` — MODIFIED. Tipo `VENTA` nuevo en el enum; `origenTipo`
  `'VENTA'` y `'COBRO'`. **No es el primer uso de `origenTipo`**: el cierre de
  ejercicio ya lo usa con tres slots — sí es el primero disparado por un flujo
  de usuario y no por un proceso de sistema.
- `frontend-sidebar-nav` — MODIFIED. Grupo `comercial` en la sección
  Contabilidad.

## Approach

**Hexagonal estricto** (§3.2). Módulos nuevos `backend/src/{items,ventas,cuentas-por-cobrar}/`
con `domain/`, `ports/`, `adapters/`, `dto/`.

**Cross-módulo por port** (§3.3). Ventas no importa nada concreto de
comprobantes: declara `ComprobanteWriterPort` y el módulo comprobantes registra
el adapter. Mismo criterio para `ContactosReaderPort` (ya existe) y
`ConfiguracionContableReaderPort`.

**Idempotencia del auto-asiento** (§4.9, Anti-17). El comprobante de una venta
lleva `origenTipo = 'VENTA'`, `origenId = venta.id`, sobre el
`@@unique([organizationId, origenTipo, origenId])` que ya existe en el schema.
Nunca `create` ciego.

**El mecanismo está resuelto en D-17**: reemplazo de **líneas** al estilo §4.3,
preservando cabecera, `id` y `numero`. **No** se copia el patrón del cierre de
ejercicio (delete + create del comprobante entero,
`cierre-ejercicio.service.ts:127-152`): ese solo funciona porque sus asientos
viven en BORRADOR, y aplicado a una venta ya contabilizada le cambiaría el
número correlativo, que es inmutable (§4.9).

**El comprobante generado no se edita a mano.** Se marca
`generadoPorSistema = true` (mecanismo ya construido por el cierre de
ejercicio): bloquea `actualizarBorrador`/`eliminarBorrador`/`editarContabilizado`
(`comprobantes.service.ts:332,379,594`) y **no** bloquea contabilizar. Se edita
la **venta**; el asiento se regenera por el mecanismo de D-17.

⚠️ **El método de sistema debe RE-VALIDAR, no solo reemplazar.** Las
validaciones de §4.1 —partida doble ±0.01, ≥2 líneas, suma > 0, glosa no vacía,
cuenta `activa` **y** `esDetalle`, y `contactoId` cuando la cuenta lo exige—
viven justo en `contabilizar` y `editarContabilizado`, que son los métodos que
el flag bloquea. Un writer de sistema que esquive la guarda **y no re-valide**
produce asientos desbalanceados o contra cuentas desactivadas. El caso es real,
no teórico: `Item.cuentaIngresoId` es configuración **almacenada**, y la cuenta
puede desactivarse después de haberse configurado. Defense in depth (§4.2):
ninguna capa confía en que la anterior hizo su trabajo.

**La regeneración lee los snapshots, no el catálogo** (D-28). El asiento se
reconstruye desde `LineaVenta` (precio y cuenta copiados al crear la línea),
nunca re-resolviendo la config vigente del ítem: así editar una venta
reproduce el mismo asiento salvo lo que el usuario efectivamente editó. La
re-validación del párrafo anterior corre igual sobre esos snapshots.

**Gating**: `@RequireModule('contabilidad')` solamente (D-01). Sin pack — un
submódulo que no es pack queda **asignable automáticamente**
(`catalogo-asignable.ts:75-77`), y OWNER/ADMIN reciben todo permiso nuevo solo,
porque `rbac.service.ts:52` expande `'*'` contra el catálogo.

Tres altas de permisos, verificadas:

| Submódulo | Estado hoy | Acción |
|---|---|---|
| `contabilidad.ventas.*` | declarado sin endpoint (`catalogo.ts:135-142`), incluidos `post` y `void` | sacar las 6 entradas de `DECLARADOS_SIN_ENDPOINT` |
| `contabilidad.items.*` | **no existe** | declarar en el catálogo |
| `contabilidad.cobros.*` | **no existe** | declarar en el catálogo |

Tres trampas que el design tiene que respetar:

1. `catalogo-vs-controllers.spec.ts` **escanea los controllers como texto** con
   la regex `@RequirePermissions\(([^)]*)\)` y **solo acepta literales string**.
   Pasar una constante lo marca como "opaco" y **falla el test**.
2. Su comparación contra `DECLARADOS_SIN_ENDPOINT` es **igualdad exacta en las
   dos direcciones**: declarar una acción sin endpoint todavía obliga a
   agregarla a esa lista, y a sacarla al implementarla.
3. El espejo del frontend `frontend/src/lib/permissions.ts` está **escrito a
   mano**, no generado. Lo vigila un test que vive en el **backend** y lee ese
   archivo del frontend como texto (`catalogo-vs-espejo-frontend.spec.ts`): un
   typo en el string rompe el build.

Decisión de producto: el template **Contador** es una lista manual en
`prisma/seed.ts` que ya tiene `ventas.{read,create,update,delete}` pero
**no** `post` ni `void`, ni nada de `items`/`cobros`. Los verbos que recibe
quedaron decididos en D-23 — y desde #291 el upsert del seed **refresca** los
permisos en cada corrida, así que sumar los strings al template alcanza a la
org piloto de verdad (D-23, actualización).

**Dinero**: `Money` (decimal.js) en TS, `@db.Decimal(18,2)` en Prisma, `string`
en los DTOs (§4.5). Cantidades `@db.Decimal(18,6)`.

**Fechas**: `FechaContable` calendario puro (§4.6). `ClockPort` inyectado para
el cálculo de vencido — cero `new Date()` en dominio y servicios.

⚠️ **El método se llama `currentDateLaPaz()` y devuelve un `string` ISO
`YYYY-MM-DD`, no un `Date`.** `ClockPort.hoyEnLaPaz()` **NO EXISTE** — es un
símbolo fantasma que `CLAUDE.md:621`, `docs/claude/antipatrones.md:91`,
`.atl/skill-registry.md:25` y cuatro docs de diseño citan como si existiera. La
superficie real del port (`common/clock/clock.port.ts`) es `now()`,
`currentYearLaPaz()` y `currentDateLaPaz()`. **Drift del core doc, no de este
change** — pero cualquiera que implemente citando el CLAUDE.md va a buscar un
método inexistente. Corregirlo va en PR propio de docs.

## Affected Areas

| Área | Cambio |
|---|---|
| `backend/src/items/` | **nuevo** |
| `backend/src/ventas/` | **nuevo** |
| `backend/src/cuentas-por-cobrar/` | **nuevo** |
| `schema.prisma` | modelos `Item` (`codigo` nullable D-24, `cantidadPorDefecto` D-25), `Venta`, `LineaVenta` (FK + snapshots D-28), `Cobro`, `AplicacionCobro`; valor `VENTA` en `TipoComprobante`; 2 campos en `OrgConfiguracionContable` |
| `prisma/migrations/` | **tres** migraciones: enum-only escrita a mano, tablas (ver R-6) **+ el UNIQUE PARCIAL de `Item.codigo` como raw SQL a mano dentro de la de tablas (D-24)**, y backfill data-only (D-22) |
| `CLAUDE.md` §11.6 | sumar el UNIQUE PARCIAL de `Item.codigo` a la tabla de objetos raw SQL vivos (D-24) — sin eso, la próxima migración regenerada lo dropea y nadie lo rescata |
| `tipos-documento-fisico/seed/tipos-universales.ts` | `VENTA` en los tipos que hoy llevan `INGRESO` (D-22) — si no, cada tenant nuevo reproduce el problema |
| `comprobantes/` | `ComprobanteWriterPort` + adapter |
| `cuentas/adapters/seed/comercial.ts` | `MAPEO_CODIGO_A_CONCEPTO` += CxC y Ventas |
| `common/permisos/catalogo.ts` | submódulos `items` y `cobros` |
| `catalogo-vs-controllers.spec.ts` | sacar 6 entradas `contabilidad.ventas.*` |
| `prisma/seed.ts` | `CONTADOR_PERMISSIONS` (decisión de producto) |
| `frontend/src/features/{items,ventas,cobros}/` | **nuevo** |
| `frontend/src/lib/permissions.ts` | espejo a mano de los 3 submódulos |
| `frontend/src/components/nav-items.ts` + `routes/router.tsx` | grupo `comercial` + `RequirePermission` |
| `openapi.json` + `api.generated.ts` | regenerar (`contract-drift`) |

**Cola del valor `VENTA` en el enum** — medida, no estimada. Los `Record`
exhaustivos hacen que el compilador exija los primeros; el frontend **no avisa**:

| Archivo | Por qué |
|---|---|
| `comprobantes/domain/numeracion.ts` | `PREFIJO_POR_TIPO` es `Record<TipoComprobante, string>` — el compilador obliga |
| `common/domain/enums.ts` | espejo del enum en dominio |
| `comprobantes/adapters/enum-mappers.ts` | mapeo Prisma ↔ dominio |
| `frontend`: `comprobantes-filters.tsx`, `comprobante-cabecera-form.tsx`, `comprobante-detail-page.tsx`, `schemas/crear-comprobante-schema.ts`, `schemas/editar-comprobante-schema.ts`, `libro-diario/lib/exportar-libro-diario-pdf.ts`, `tipos-documento-fisico/schemas/…-form-schema.ts`, `lib/build-tipos-documento-fisico-params.ts`, `types/api.ts` | **9 listas hardcodeadas** del enum (opciones y labels) |

## Risks

- **R-1 — El piloto se convierte en producción.** Sin IVA, las ventas cargadas
  son fiscalmente incompletas y no se arreglan sin rehacer asientos
  contabilizados. *Mitigación*: org de prueba, y decirlo en la UI del piloto.
  La evidencia VeriFactu (estudio comparado) es el recordatorio de qué pasa
  cuando un modelo flexible choca con un régimen fiscal estricto: Invoice
  Ninja tuvo que apagar el suyo con un `if`.
- **R-2 — Fricción del period lock.** carmen eliminó su estado de bloqueo
  porque el negocio lo rechazó (H-4). Cerrar un mes va a impedir corregir
  ventas. *Mitigación*: el flujo de reapertura ya existe (§4.4); el borrador
  tiene que ser cómodo.
- **R-3 — Sidebar.** Contabilidad ya está en 17 filas plegado; el grupo
  `comercial` la empuja contra el disparador de anti-agobio. Palancas sin
  consumir: página índice `/reportes`, Cmd+K.
- **R-4 — CxC neteado en el Balance General.** Asumido en D-03. Se vuelve
  material si los anticipos son plata significativa en el rubro.
- **R-5 — El piloto se come el core.** Si el pack Avícola se construye antes de
  que Ventas FREE esté firme, CxC y cobranza terminan dentro del pack y
  extraerlos después es caro. *Mitigación*: este change va primero.
- **R-6 — La migración del enum.** Riesgo **acotado y con receta verificada**.
  Hay **4 precedentes** de `ALTER TYPE … ADD VALUE` en el repo
  (`20260423030130` y los tres de perfiles de extracto bancario), y **ninguno
  usa el valor nuevo dentro del mismo archivo**; dos `ADD VALUE` en una misma
  migración también está probado (`20260724220000`). Postgres 17 + Prisma
  6.19.3. La restricción de Postgres —un valor agregado con `ADD VALUE` no
  puede *usarse* antes del COMMIT— **no nos toca mientras la migración de las
  tablas no contenga ningún literal `'VENTA'`** (default, CHECK, backfill o
  índice parcial). Receta alineada al precedente: **dos migraciones**, enum-only
  a mano primero, tablas después.
  Lo que **sí** muerde es §11.6: al regenerar la migración de las tablas,
  Prisma emite `DROP` de los objetos raw que no viven en `schema.prisma`. Los
  `contactos_*_trgm_idx` **aparecieron en TODAS las migraciones regeneradas
  desde `20260425163325`** — no es hipotético, pasa siempre. Grep obligatorio de
  `^DROP (INDEX|EXTENSION|TYPE)` y rescate a mano contra la lista de
  `CLAUDE.md:1130-1147`.
  *Corrección al texto anterior*: el índice parcial
  `comprobante_documento_fisico_unique_contabilizado` depende de
  **`EstadoComprobante`, no de `TipoComprobante`** — un `ADD VALUE` acá no lo
  afecta funcionalmente, pero hay que rescatarlo igual si Prisma lo dropea.
  Y D-24 **suma un objeto raw nuevo a la lista**: el UNIQUE PARCIAL de
  `Item.codigo` nace escrito a mano dentro de la migración de tablas y entra a
  la tabla de §11.6 desde el día uno — cada regeneración futura tiene un
  objeto más que rescatar.
- **R-7 — `tiposComprobanteAplicables` no se entera del valor nuevo.**
  `TipoDocumentoFisico.tiposComprobanteAplicables` es `"TipoComprobante"[]`
  (`schema.prisma:923`): agregar `VENTA` al enum **no** lo agrega a los tipos de
  documento ya configurados. Quedan sin `VENTA` hasta que alguien los edite uno
  por uno. *Mitigación*: decidir en el design si va backfill (migración
  data-only aparte, patrón probado en `20260521000633`) o si se documenta como
  paso de configuración.

## Rollback Plan

**Tres migraciones** (D-22): (1) enum-only `ALTER TYPE … ADD VALUE 'VENTA'`,
escrita a mano; (2) tablas nuevas + dos columnas nullable en
`OrgConfiguracionContable` + el UNIQUE PARCIAL de `Item.codigo` como raw SQL a
mano (D-24 — aditivo también, pero deja la migración fuera de lo puramente
generado); (3) backfill data-only de `tiposComprobanteAplicables`.

Las dos primeras son **aditivas puras** y no tocan datos existentes. **La
tercera SÍ toca datos existentes**: hace `UPDATE` sobre
`tipos_documento_fisico`, agregando `VENTA` donde ya está `INGRESO`. Es
idempotente y aditiva a nivel de fila (agrega un valor a un array, no reemplaza
nada), así que revertirla es quitar ese valor del array — pero **no es cierto
que ninguna migración toque datos**, y por eso se dice acá.

Ninguna toca el dominio contable vigente.

Revertir = `git revert` del squash + dejar las tablas huérfanas (vacías en org
de prueba). El valor `VENTA` del enum **no se puede quitar** en Postgres sin
recrear el tipo; queda inerte si nadie lo usa, lo cual es aceptable.

Si hay que abandonar a mitad: las ventas del piloto viven en org de prueba y se
borran con la org.

## Dependencies

- Nada bloqueante. Todo lo que hace falta ya existe: plan de cuentas comercial
  completo, `origenTipo`/`origenId` con su unique, `generadoPorSistema`,
  `SecuenciaComprobante`, `ContactosReaderPort`, `ClockPort`, `Money`,
  `TipoComprobante.TRASPASO` para el depósito manual.
- **Decisiones y brechas abiertas**: ver la sección siguiente.

## Decisiones pendientes y brechas de especificación

Estado tras la auditoría de 2026-07-28 (cuatro lentes: invariantes del core,
coherencia interna, antipatrones y verificación de citas contra el repo).

### Preguntas de la exploración

- ~~**Q-3 — Ítems**~~ — **RESUELTO**. Ver D-15.
- ~~**Q-4 — Imputación de pagos**~~ — **RESUELTO**. Ver D-16: verificado
  (Código Civil arts. 316-318) y decidido que **no cambia el código**.
- ~~**Q-5 — Mecanismo de regeneración**~~ — **RESUELTO**. Ver D-17: reemplazo
  de líneas al estilo §4.3, cabecera y número intactos.
- ~~**Q-6 — Invariantes de borde**~~ — **RESUELTO**. Ver la matriz de
  operaciones y D-12/D-13/D-14 en "Decisiones cerradas en el pulido".
- ~~**Q-7 — Conciliación vs. anulación**~~ — **RESUELTO**. Ver D-18: ya está
  resuelto por construcción en `LineasCuentaReaderPort`.

> *Nota de trazabilidad*: **Q-5, Q-6 y Q-7 nunca fueron formuladas** en la
> exploración (que solo tiene Q-1 a Q-4). Surgieron durante el pulido y se
> tacharon acá como resueltas sin haber sido escritas nunca como preguntas. Se
> deja constancia en vez de fabricar el enunciado retroactivo.

### Q-2 — recuperada de la exploración

La exploración planteó **Q-2 (apagado de pack)** y su corolario **nunca se
trasladó a esta propuesta**, pese a ser requisito de diseño de v1 y no una
pregunta filosófica:

> Desactivar un pack **no puede volver ilegible un asiento contabilizado**. El
> comprobante se lee siempre por el core; se pierde crear nuevos y la vista
> especializada. Corolario: **la glosa del asiento debe ser autosuficiente** —
> `"Despacho #42"` no alcanza.

**Aplica a este change aunque Ventas sea FREE**: la glosa que Ventas escriba en
el comprobante tiene que sostenerse sola en el Libro Diario, sin que el lector
tenga que abrir la venta. Vale igual para el asiento del cobro.

### Decisiones de producto todavía abiertas

**Ninguna.** Las cinco quedaron cerradas: borrador vs. cierre (D-19), cambio de
contacto (D-20), recorte con varios cobros (D-21), backfill de
`tiposComprobanteAplicables` (D-22) y permisos del template Contador (D-23).

Fuera de este change quedan dos PRs propios, identificados en el camino:

- **RBAC**: ~~pendiente~~ → **abierto como #291** (`fix/rbac-permisos-fantasma`).
  `edit-posted` declarado en el catálogo (asignable desde la UI), los dos
  fantasmas sin enforcement (`periodos.create`, `cierre-mensual.create`) fuera
  del template, y el test confrontando tres puntas (decoradores +
  `.hasPermission` + seed). Detalle y correcciones al relevamiento original en
  D-23, que quedó actualizado.
- **Docs**: `ClockPort.hoyEnLaPaz()`, `nowUtc()` y `yearEnLaPaz()` son símbolos
  **fantasma** citados en 23 líneas de docs y comentarios vivos.

### Brechas de especificación — obligatorias para `sdd-spec`

No son decisiones abiertas: son cosas que la propuesta da por sabidas y que la
spec **tiene que enunciar** o se pierden en la implementación.

- **B-1 — `contactoId` en las líneas generadas contra CxC.** `1.1.2.001 CUENTAS
  POR COBRAR` tiene `requiereContacto: true` en el seed, y el servicio de
  comprobantes **rechaza al contabilizar** cualquier línea contra esa cuenta sin
  `contactoId`. Ni el asiento de la venta a crédito ni el del cobro lo
  mencionan: **la primera venta a crédito fallaría en runtime**. Evitado hoy por
  accidente (el módulo no existe), no por diseño. Corolario: el aging del estado
  de cuenta depende de ese mismo campo.
- **B-2 — Multi-tenant en las 4 tablas restantes.** D-15 detalla los índices de
  `Item` al milímetro y `Venta`, `LineaVenta`, `Cobro` y `AplicacionCobro` no
  dicen una palabra de `organizationId`. `AplicacionCobro` es un **vínculo entre
  dos entidades**: el agujero clásico es aplicar un cobro del tenant A a una
  venta del tenant B. §4.2 rotula esto "bug de seguridad si se viola" — no puede
  quedar implícito.
- ~~**B-3 — Borrador de venta invisible para el cierre**~~ — **RESUELTO**. Ver
  D-19: el comprobante nace con el borrador; el cierre no se toca.
- ~~**B-4 — Cambiar el contacto**~~ — **RESUELTO**. Ver D-20: permitido, con la
  justificación escrita que Anti-15 exige.
- ~~**B-5 — Recorte con varios cobros**~~ — **RESUELTO**. Ver D-21: LIFO,
  espejo del FIFO de aplicación.
- **B-6 — El invariante `Σ aplicaciones ≤ monto` no está declarado.** Ni
  `Σ aplicaciones ≤ montoCobro` ni `Σ aplicaciones ≤ montoTotal` de la venta, ni
  su mecanismo. Una suma no se protege con un constraint de DB: exige `SUM()`
  **dentro de la transacción** con lock, y validación pre-TX **y** intra-TX. Es
  la cicatriz F-03 (check-then-act) aplicada a un flujo de plata: dos
  aplicaciones concurrentes al mismo cobro pueden sobre-aplicar.
- **B-7 — Decimales del precio unitario y redondeo del subtotal.** La tabla
  definitiva de decimales del core **no tiene fila para precio unitario**, y la
  propuesta no la propone. Tampoco define el redondeo de
  `cantidad(18,6) × precio = subtotal(?)`, ni el invariante
  `Σ subtotales === montoTotal === total del asiento` dentro de ±Bs 0.01. Por la
  regla anti-drift (§12.3) la fila nueva se fija **en el core doc**, no se
  improvisa acá.
- **B-8 — `subtotal` y `montoTotal`: ¿persistidos o derivados?** `saldoPendiente`,
  el estado comercial y `VENCIDA` están explícitamente declarados derivados;
  estos dos no. Y la matriz permite subir y bajar el monto de una venta sin
  decir quién recalcula qué.
- **B-9 — Dónde vive el cálculo.** La repartición FIFO está descrita solo como
  conducta de pantalla y el cálculo de subtotales no tiene dueño. Si el frontend
  calcula y el backend solo persiste lo recibido, la regla queda del lado del
  cliente (Anti-18) y se duplica en cuanto un endpoint la necesite (Anti-01).
  **El backend recalcula y valida al write; el frontend muestra.**
- **B-10 — Anti-42: `esRequeridaSistema` en las cuentas mapeadas.** `1.1.2.001` y
  `4.1.1.001` **no** lo tienen hoy. El enforcement exige bidireccionalidad
  estricta (toda cuenta en `MAPEO_CODIGO_A_CONCEPTO` debe ser
  `esRequeridaSistema: true` y viceversa) y hay una guarda de regresión que fija
  **8 conceptos requeridos** → pasa a 10.
- **B-11 — Anti-41: `CONCEPTO_FIELDS` y `Item.cuentaIngresoId`.** El guard que
  impide desactivar una cuenta cableada filtra contra una **lista hardcodeada**
  (`prisma-cuenta.repository.ts:182`). Sumar dos columnas a
  `OrgConfiguracionContable` sin sumarlas ahí deja CxC y Ventas desactivables
  aunque el auto-asiento dependa de ellas. Y `Item.cuentaIngresoId` no tiene
  guard equivalente ni FK `onDelete: Restrict`.
- **B-12 — Conceptos nuevos nullable sin backfill.** En cualquier org sin
  mapear, la primera contabilización de venta falla en runtime. Para la org de
  prueba alcanza, pero hace falta un error de dominio con nombre
  (`..._CONCEPTO_NO_CONFIGURADO`) en vez de un 500.
- **B-13 — Contrato del comentario de `origenTipo`.** `schema.prisma:715`
  documenta `// "VENTA" | "COMPRA" | "PAGO" | NULL`. Este change introduce
  `'COBRO'`, que no está en la lista y se pisa semánticamente con `'PAGO'`.
  Actualizar el comentario en el mismo change, y usar **constantes de dominio**
  en vez de literales sueltos: son strings libres comparados en varios call
  sites, y un typo es un `false` silencioso.
- **B-14 — Rastro de las aplicaciones borradas.** D-12 borra físicamente las
  `AplicacionCobro` al anular; los triggers de `comprobantes_audit` **no cubren**
  las tablas de Ventas. El único acto que §4.7 exige auditar para siempre
  destruye parte de su propio contexto. Riesgo aceptado y nombrado; el design
  debería evaluar un soft-delete, que costaría poco.
- **B-15 — Normalización del `codigo` opcional.** Nace de D-24: el UNIQUE
  PARCIAL es case-sensitive y sensible a espacios por default — `"ABC"`,
  `"abc"` y `"ABC "` serían tres códigos distintos. La spec tiene que decidir
  si se normaliza (trim y/o case) antes de persistir, con el precedente de
  cómo lo resuelve `Contactos.documento` como referencia — no dejarlo al
  criterio del que implemente.

## Success Criteria

1. Un vendedor carga una venta al contado eligiendo cliente e ítems, aprieta
   **un** botón, y el asiento `Debe Caja / Haber Ventas` queda contabilizado con
   su número `V2607-000001`. **Nunca ve un débito ni un crédito.**
2. Una venta a crédito aparece en el estado de cuenta del cliente con su saldo y
   sus días de atraso.
3. Un cobro de Bs 1.000 se aplica 600 a una venta y deja 400 a favor; los 400 se
   aplican otro día a otra venta **sin generar ningún asiento nuevo**.
4. Editar la imputación de un cobro **no toca contabilidad** — verificado por
   test: el comprobante del cobro es byte-idéntico antes y después.
5. Anular una venta contabilizada la saca del estado de cuenta y deja el
   comprobante anulado por flag, con su número conservado.
6. Regenerar el asiento de una venta editada **no duplica** el comprobante
   (test de idempotencia sobre `origenTipo`/`origenId`) **y le conserva su
   número correlativo** (§4.9: el número es inmutable desde la primera
   contabilización).
7. Los cobros a Caja General **no aparecen** en la conciliación bancaria; el
   traspaso manual Caja → Banco **sí**, y matchea 1:1 con la línea del extracto.
8. `catalogo-vs-controllers.spec.ts` en verde con las 6 entradas
   `contabilidad.ventas.*` fuera de `DECLARADOS_SIN_ENDPOINT`, y
   `catalogo-vs-espejo-frontend.spec.ts` en verde con `ventas`, `items` y
   `cobros` en el espejo del frontend.
9. Un cobro genera un comprobante `INGRESO` con `origenTipo = 'COBRO'`, y el
   listado de comprobantes lo distingue de una venta **sin mirar el tipo**.
10. Un ítem se guarda con solo el nombre — sin código (D-24). Dos ítems sin
    código conviven en la misma org; dos con el mismo código chocan, con
    constraint de DB **y** error amigable del servicio.
11. Cambiar el precio sugerido o la cuenta de ingreso de un ítem **no altera**
    ninguna venta existente ni su asiento (snapshot, D-28), y "ventas por
    ítem" se responde con un JOIN por `itemId` — no parseando strings.
