# Ventas — Specification

> Change: `ventas-piloto`. Capability NUEVA.
> Fuente: `proposal.md` (D-02, D-04..D-06, D-08..D-10, D-12..D-14, D-16..D-22,
> D-28) + matriz de 14 operaciones + brechas B-1, B-2, B-7, B-8, B-9, B-10,
> B-11, B-12, B-14 + Q-2.

## Purpose

Documento comercial de venta que **ES su propio comprobante** (D-02) desde el
borrador (D-19): registra la operación en el idioma del negocio (cliente,
ítems, cantidades, precios) y emite el asiento sin que el vendedor vea jamás
un débito o un crédito. Todo en BOB (D-10). Módulo `backend/src/ventas/`,
hexagonal §3.2, FREE sin pack (D-01). Piloto: corre en organización de
prueba, sin IVA/IT (D-09; la forma de v2 quedó fijada en D-29).

## Requirements

### REQ-VTA-01: La venta ES su propio comprobante, desde el borrador (D-02, D-19)

Guardar un borrador de venta DEBE crear el `Comprobante` en BORRADOR en la
misma transacción, con `generadoPorSistema = true`, `origenTipo = 'VENTA'`,
`origenId = venta.id` y tipo `VENTA`. Contabilizar NO crea el comprobante: le
asigna el número correlativo (§4.9).

**La venta NO lleva estado propio espejado**: se lee del comprobante. Decir
que "los estados van pegados" sería inexacto — `EstadoComprobante` tiene
**tres** valores y el tercero lo produce una operación de rutina: cerrar un
período ejecuta `bloquearPorPeriodo` y pasa TODOS sus comprobantes de
`CONTABILIZADO` a `BLOQUEADO` (reabrir lo revierte). Un estado espejado en
`Venta` se desincronizaría en ese mismo instante, en masa y en silencio.

Para toda lectura que pregunte "¿esta venta cuenta?" el criterio es
`estado IN (CONTABILIZADO, BLOQUEADO) AND anulado = false` — "plata
efectivamente movida", el mismo predicado que ya usa `ESTADOS_CONCILIABLES`
en `comprobantes/adapters/prisma-lineas-cuenta-reader.adapter.ts`. La
constante se extrae a un lugar único (hoy está duplicada en dos archivos);
PROHIBIDO comparar contra `CONTABILIZADO` a secas.

Eliminar un borrador de venta DEBE eliminar su comprobante borrador por el
camino de sistema (el flag bloquea la operación de usuario). Editar un
borrador regenera las líneas del comprobante por la mecánica de D-17. El
comprobante borrador no tiene número hasta contabilizar.

Consecuencia deliberada: **el cierre de período no se toca** — una venta en
borrador ES un comprobante en borrador y el chequeo "cero borradores en N" de
§4.4 la ve sin aprender nada nuevo.

#### Escenario: borrador de venta bloquea el cierre del período

- DADO una venta en BORRADOR con `fechaContable` en el período N
- CUANDO se intenta cerrar el período N
- ENTONCES el cierre rechaza por "borradores pendientes" sin que el módulo de
  períodos conozca la entidad `Venta`

#### Escenario: eliminar el borrador elimina su comprobante

- DADO una venta en BORRADOR con su comprobante borrador
- CUANDO el usuario elimina la venta
- ENTONCES el comprobante borrador desaparece con ella, vía camino de sistema

#### Escenario: cerrar el período NO saca la venta de la cartera

- DADO una venta a crédito CONTABILIZADA con saldo pendiente, en el período N
- CUANDO se cierra el período N y su comprobante pasa a `BLOQUEADO`
- ENTONCES la venta sigue en el estado de cuenta del cliente, con el mismo
  saldo y los mismos días de atraso
- Y al reabrir el período tampoco cambia nada: el criterio no mira la
  transición, mira `anulado` y el saldo

### REQ-VTA-02: Estructura del documento y snapshots (D-28)

Cabecera: `contactoId` (cliente, obligatorio), `fechaContable`
(`FechaContable` calendario puro §4.6), `condicionPago CONTADO | CREDITO`,
`fechaVencimiento` (obligatoria solo en CREDITO; prohibida en CONTADO),
`glosa`.

`LineaVenta` DEBE llevar **FK viva Y snapshot** (D-28):

| Pieza | Semántica |
|---|---|
| `itemId` FK | referencia al catálogo — "ventas por ítem" es un JOIN |
| `descripcion` snapshot | texto al momento de vender, editable por línea |
| `precioUnitario` snapshot | precio pactado, no el sugerido vigente |
| `cuentaIngresoId` snapshot | cuenta resuelta al CREAR la línea (ítem → o default `ventasId`) |
| `cantidad` | base del cálculo aunque no haya inventario |

Cambiar el catálogo después NO altera ventas existentes ni sus asientos: la
regeneración (D-17) lee los snapshots, nunca re-resuelve la config vigente.

#### Escenario: el rename del ítem no rompe la historia

- DADO una venta contabilizada con una línea del ítem "Pollo entero"
- CUANDO el ítem se renombra y se le cambia el precio sugerido y la cuenta
- ENTONCES la venta, su línea y su asiento quedan byte-idénticos
- Y "ventas por ítem" sigue encontrando la venta vía `itemId`

#### Escenario: crédito exige vencimiento

- DADO un alta de venta con `condicionPago = CREDITO` sin `fechaVencimiento`
- CUANDO se guarda
- ENTONCES rechaza con 422 (`VENTA_VENCIMIENTO_REQUERIDO`)

### REQ-VTA-03: Cálculo, decimales y quién lo hace (B-7, B-8, B-9)

Decimales (fija la fila que falta en la tabla de `docs/claude/dominio-contable.md`
§4.2 — por §12.3 la fila DEBE agregarse a ese doc en este mismo change, no
improvisarse acá y quedar huérfana):

| Campo | Tipo |
|---|---|
| `precioUnitario` | `@db.Decimal(18,6)` — precio por unidad puede necesitar sub-centavo (precio por kg); el redondeo a moneda ocurre UNA sola vez, en el subtotal |
| `cantidad` | `@db.Decimal(18,6)` (fila existente "cantidades") |
| `subtotal`, `montoTotal` | `@db.Decimal(18,2)` |

Reglas:

- `subtotal = Money.of(cantidad).mul(precioUnitario).redondearABob()` — la
  política única de la casa es **half-up**, no half-even (Anti-04). El método
  `redondearABob()` es obligatorio y explícito: `mul()` NO redondea y `toBob()`
  devuelve `string` (formato), así que sin él el valor llega crudo al `INSERT`
  y lo redondea Postgres `numeric(18,2)` — fuera del dominio. PROHIBIDO
  redondeo ad-hoc.
- `subtotal` y `montoTotal` DEBEN **persistirse** (B-8) — son hechos del
  documento pactado, como `LineaComprobante.debitoBob` — y DEBEN recalcularse
  por el backend en cada write, en la misma transacción que reemplaza las
  líneas. No es la denormalización silenciosa de Anti-05: la re-escritura es
  atómica con las líneas y la cubre un test de integridad
  (after write, compute and compare).
- `montoTotal = Σ subtotales` **exacto** (se suman valores ya redondeados) y
  el total del asiento generado = `montoTotal` exacto. La tolerancia ±Bs 0.01
  de §4.1 sigue siendo la del core para la partida doble, no una licencia para
  descuadrar acá.
- **El backend calcula y valida al write; el frontend muestra** (B-9,
  Anti-18): `subtotal`/`montoTotal` enviados por el cliente se ignoran — el
  backend deriva desde `cantidad` y `precioUnitario`. `Money` en TS, `string`
  en DTOs (§4.5): PROHIBIDO `number` para plata.
- `saldoPendiente`, estado comercial y `VENCIDA` son DERIVADOS y NUNCA se
  persisten (ver `cuentas-por-cobrar` REQ-CXC-01).

#### Escenario: el cliente no dicta los totales

- DADO un create con `cantidad = "5"`, `precioUnitario = "6.305"` y un
  `subtotal` malicioso de `"999.99"` en el payload
- CUANDO el backend procesa
- ENTONCES persiste `subtotal = "31.53"` calculado por él

> El caso está elegido para que **discrimine**: `31.525` da `31.53` con
> half-up y `31.52` con half-even. El ejemplo anterior de esta spec
> (`3 × 10.505 = 31.515`) daba `31.52` con **ambas** políticas, así que el
> test habría pasado en verde con la política equivocada.

#### Escenario: el total suma subtotales ya redondeados

- DADO una venta con 3 líneas de `cantidad = "1"` y `precioUnitario = "10.005"`
- CUANDO el backend calcula
- ENTONCES cada `subtotal` persiste `"10.01"` y `montoTotal` persiste `"30.03"`
- Y NO `"30.02"`, que es lo que daría redondear la suma de los valores crudos
  (`30.015`) — de ahí la regla de sumar redondeados

#### Escenario: editar recalcula en la misma transacción

- DADO una venta con `montoTotal = "1000.00"`
- CUANDO se edita una línea a `cantidad = "2"` × `precioUnitario = "400.00"`
- ENTONCES `montoTotal` persiste como la nueva Σ exacta de subtotales en la
  misma TX que re-inserta las líneas

### REQ-VTA-04: El asiento generado (D-04, D-05, B-1, Q-2)

| Condición | Asiento |
|---|---|
| CONTADO | `Debe <cuenta destino ELEGIDA> / Haber <cuenta de ingreso por línea>` |
| CREDITO | `Debe CxC (concepto cuentasPorCobrarId) / Haber <cuenta de ingreso por línea>` |

- PROHIBIDO modelar contado como "crédito cobrado inmediatamente" (D-04): una
  venta CONTADO no crea partida abierta ni toca el mayor de CxC.
- **PA-1 cerrada (Marco, 2026-07-28)**: la venta CONTADO lleva **selector de
  cuenta destino, precargado en Caja General** — mismo trato que el `Cobro`,
  extendiendo D-05 en vez de crear una excepción: dos formularios que hacen
  lo mismo (recibir plata) no piden datos distintos, y quien cobra por
  transferencia no necesita un asiento de traslado para reflejar lo que ya
  sabe al vender. La elegibilidad es **el criterio definido en REQ-CXC-02 y no
  se re-enuncia acá** (Anti-01): `activa` ∧ `esDetalle` ∧
  (`actividadFlujo = 'EFECTIVO'` **∪** prefijo `1.1.1`), unión **por cuenta** —
  la marca agrega, nunca quita, y **no es la regla del EFE**, que usa un
  interruptor de organización (la divergencia es deliberada; ver el bloque de
  advertencia de REQ-CXC-02).
  Cuenta fuera del criterio → 422 `VENTA_CUENTA_DESTINO_NO_ELEGIBLE`. El
  asiento debita **la cuenta elegida**, nunca una constante. El default es
  precarga de UI: si `1.1.1.001` no existe o no es elegible, el formulario
  no precarga — jamás un 500; una org sin ninguna cuenta elegible cae en el
  mismo 422 del criterio (cubierto por la elegibilidad, no se duplica con un
  `*_CONCEPTO_NO_CONFIGURADO`).
- **B-1 — obligatorio**: toda línea contra la cuenta CxC (`1.1.2.001`,
  `requiereContacto: true`) DEBE llevar `contactoId = venta.contactoId`. Sin
  esto la primera venta a crédito falla en runtime al contabilizar, y el aging
  del estado de cuenta depende de ese mismo campo.
- Las líneas se emiten con el tri-valor fijo en BOB (D-10): `moneda = BOB`,
  `tipoCambio = 1`, `debitoBob = debito`.
- Idempotencia (§4.9, Anti-17): generación vía `upsert` sobre
  `@@unique([organizationId, origenTipo, origenId])`, nunca `create` ciego.
- **Q-2 — glosa autosuficiente**: la glosa del comprobante DEBE sostenerse
  sola en el Libro Diario — identifica la operación y el cliente sin abrir la
  venta. `"Venta #42"` NO cumple.

#### Escenario: venta a crédito lleva el contacto en la línea CxC

- DADO una venta CREDITO del cliente Avícola Sur
- CUANDO se contabiliza
- ENTONCES la línea `Debe CxC` lleva `contactoId` del cliente
- Y el comprobante pasa la validación `requiereContacto` del core

#### Escenario: venta al contado no ensucia CxC

- DADO una venta CONTADO con cuenta destino `1.1.1.002 BANCOS` elegida
- CUANDO se contabiliza
- ENTONCES el asiento debita `1.1.1.002` (la elegida, no Caja General) y NO
  toca `1.1.2.001`
- Y no aparece en el estado de cuenta del cliente

#### Escenario (−): cuenta destino no elegible

- DADO una venta CONTADO cuya cuenta destino es una cuenta de gasto (`5.x`)
  activa y de detalle
- CUANDO se guarda o contabiliza
- ENTONCES rechaza con 422 `VENTA_CUENTA_DESTINO_NO_ELEGIBLE`

#### Escenario (−): cuenta destino inactiva

- DADO una venta CONTADO cuya cuenta destino cumple el criterio de efectivo
  pero tiene `activa = false`
- CUANDO se contabiliza
- ENTONCES rechaza — §4.1 exige cuenta activa, y el criterio de REQ-CXC-02 la
  excluye de elegible

#### Escenario (−): cuenta destino no es de detalle

- DADO una venta CONTADO cuya cuenta destino es la agrupadora `1.1.1`
  (`esDetalle = false`)
- CUANDO se contabiliza
- ENTONCES rechaza — §4.1 exige `esDetalle = true`

#### Escenario: el default ausente no rompe nada

- DADO una organización cuyo plan no tiene `1.1.1.001` pero sí otra cuenta
  elegible
- CUANDO se abre el formulario y se vende al contado contra esa otra cuenta
- ENTONCES el formulario no precarga default, la venta procede y en ningún
  caso hay un 500

#### Escenario: regenerar no duplica

- DADO una venta con su comprobante generado
- CUANDO el generador corre dos veces (retry, edición)
- ENTONCES existe UN solo comprobante para `('VENTA', venta.id)` en la
  organización

### REQ-VTA-05: Contabilizar — número propio y re-validación (D-06, D-08)

Al contabilizar, el comprobante DEBE recibir número de la serie propia del
tipo `VENTA`: `V{YY}{MM}-{correlativo:6}`, secuencia mensual por
`(tenantId, VENTA, year, month)` bajo `FOR UPDATE` (§4.9), independiente de la
serie `I` de INGRESO.

El camino de sistema DEBE **RE-VALIDAR, no solo escribir** (Approach ⚠️,
detalle en REQ-CMP-VTA-03): partida doble ±0.01, ≥2 líneas, suma > 0, glosa
no vacía, cuenta `activa` Y `esDetalle`, `contactoId` donde
`requiereContacto`. El caso es real: `cuentaIngresoId` es configuración
almacenada y la cuenta puede desactivarse después (snapshot inactivo → error
`VENTA_CUENTA_SNAPSHOT_INACTIVA`, no bypass).

UI (D-08, D-14): dos acciones — "Guardar borrador" y "Guardar y contabilizar"
(primario). **Cero confirmaciones** al guardar, contabilizar, aplicar o
destildar; la única fricción del flujo es el motivo de anulación (§4.7).

#### Escenario: primera venta del mes

- DADO ninguna venta contabilizada en julio 2026 para la organización
- CUANDO se contabiliza la primera
- ENTONCES recibe `V2607-000001`
- Y un `INGRESO` contabilizado el mismo día recibe número de SU serie `I`, sin
  interferencia

#### Escenario (−): cuenta del snapshot desactivada

- DADO una línea cuyo `cuentaIngresoId` snapshot apunta a una cuenta hoy
  `activa = false`
- CUANDO se intenta contabilizar
- ENTONCES rechaza con 422 `VENTA_CUENTA_SNAPSHOT_INACTIVA` nombrando la cuenta

### REQ-VTA-06: Edición post-CONTABILIZADO (D-17, D-20, D-21; matriz 1-3, 6)

Editar una venta contabilizada (período ABIERTO, §4.3/§4.4) DEBE regenerar el
asiento reemplazando **líneas en bloque** y preservando cabecera, `id` y
`numero` (inmutable §4.9). La regeneración lee los **snapshots** de
`LineaVenta`, no el catálogo (D-28). Mover `fechaContable` a otro mes conserva
el número original con su `YYMM` — conducta que §4.3 ya acepta; no se
"arregla".

Matriz de operaciones sobre el monto (el saldo es derivado — "resolver"):

| Operación | Conducta |
|---|---|
| Subir el monto | nada que tocar: el saldo pendiente crece solo |
| Bajar el monto, ≥ lo cobrado | ídem |
| Bajar el monto POR DEBAJO de lo cobrado | recorte **LIFO** de aplicaciones (D-21): de la más reciente hacia atrás, en cascada hasta absorber la diferencia; el excedente queda como saldo no aplicado del cobro recortado (saldo a favor) |

**Fila 7 — pasar de CREDITO a CONTADO con aplicaciones vivas: RECHAZAR**
(agregado 2026-07-30 por auditoría de la Fase 5; no estaba en la spec y era un
agujero real, verificado por probe de integración).

Una venta CONTADO **no integra la cartera** (REQ-VTA-04, D-04): se cobró en el
acto. Sin esta regla, el flip produce por la puerta de atrás exactamente el
estado que REQ-CXC-03 prohíbe crear —una `AplicacionCobro` contra una venta
fuera de la cartera— con tres consecuencias:

1. La venta desaparece del estado de cuenta, pero su aplicación **sigue
   restando saldo a favor del cobro** (el saldo no aplicado suma *todas* las
   aplicaciones): plata del cliente consumida sin deuda visible en ningún lado.
2. El asiento regenerado pasa a debitar la cuenta destino, así que **Caja queda
   debitada dos veces** —por la venta CONTADO y por el cobro— por un solo
   movimiento real, y CxC queda con un haber sin contrapartida.
3. No queda **rastro** en `AplicacionCobroDesvinculada` (B-14): el acto
   desaparece.

Se rechaza con 422 `VENTA_CONDICION_PAGO_CON_APLICACIONES` en vez de
desvincular en silencio: misma postura que la fila 8 de REQ-CXC-06
(`COBRO_MONTO_INFERIOR_APLICADO`) — cuando el reparto es entre cobros
distinguibles el sistema NO elige, el usuario desaplica primero. Desvincular
además **no arreglaría** el doble débito de Caja.

El guard se evalúa **antes** que la rama del cambio de contacto (fila 6): al
revés, un flip que además cambia el cliente desvincularía primero y pasaría.
La dirección inversa (CONTADO → CREDITO) **no se bloquea** — devuelve la venta
a la cartera, donde sus aplicaciones vuelven a tener sentido.

#### Escenario (−): flip a CONTADO con un cobro aplicado

- DADO una venta a crédito contabilizada con un cobro aplicado
- CUANDO se la edita a CONTADO
- ENTONCES rechaza con 422 `VENTA_CONDICION_PAGO_CON_APLICACIONES`
- Y no se toca la venta, ni su asiento (sigue debitando CxC), ni la aplicación

#### Escenario: sin aplicaciones el flip procede

- DADO una venta a crédito contabilizada sin ningún cobro aplicado
- CUANDO se la edita a CONTADO
- ENTONCES la edición procede — la regla protege el vínculo, no la condición de
  pago

Cambiar el **contacto** DEBE permitirse (D-20: vive en la línea, el reemplazo
en bloque ES el mecanismo — justificación escrita contra Anti-15, cuyos daños
LCV/SIN están fuera de scope §10.9) y DEBE **desvincular TODAS las
aplicaciones** de la venta (matriz fila 6): sin eso queda un cobro del cliente
A aplicado a una venta del cliente B. La UI advierte mostrando la consecuencia
concreta (D-14), sin diálogo genérico.

#### Escenario: recorte LIFO con dos cobros

- DADO una venta de 1.000 con Cobro 1 aplicado 500 y Cobro 2 aplicado 500
- CUANDO la venta se baja a 800
- ENTONCES la aplicación del Cobro 2 (más reciente) queda en 300 y la del
  Cobro 1 intacta
- Y el Cobro 2 queda con 200 de saldo a favor

#### Escenario: cambiar el contacto desvincula todo

- DADO una venta del cliente A con aplicaciones de dos cobros
- CUANDO se cambia el contacto al cliente B
- ENTONCES las aplicaciones se eliminan y los cobros quedan con saldo no
  aplicado a favor del cliente A
- Y el número del comprobante no cambia

#### Escenario: la edición conserva el número

- DADO la venta `V2606-000042` contabilizada en junio, período abierto
- CUANDO se le mueve la `fechaContable` a julio
- ENTONCES conserva `V2606-000042`

### REQ-VTA-07: Anulación (D-12, D-14, §4.7, Anti-14, B-14)

La anulación DEBE dispararse **desde el módulo ventas**, nunca desde
comprobantes (Anti-14; ver REQ-CMP-VTA-05). Aplica §4.7 completo: flag
`anulado`, motivo ≥ 10 caracteres significativos, comprobante preservado para
siempre, número no reutilizado, excluida de reportes por default.

Anular una venta DEBE eliminar sus `AplicacionCobro` (D-12): los cobros quedan
con saldo no aplicado (saldo a favor del cliente) por derivación pura, sin
estado que "reabrir". La venta anulada sale del estado de cuenta.

Antes de anular, la UI DEBE mostrar la **consecuencia concreta** (D-14):
cuántos cobros se desvinculan y por cuánto. Es la única confirmación del
flujo.

**B-14 — RESUELTO por `sdd-design`, ya no es un SHOULD**: toda `AplicacionCobro`
que se elimine al anular la venta DEBE registrarse en
`AplicacionCobroDesvinculada` (tabla **append-only**: `cobroId`, `ventaId`,
`montoAplicado`, `motivo`, `userId`, `createdAt`). El borrado de
`AplicacionCobro` sigue siendo **físico** (D-12 intacto).

Por qué append-only y no soft-delete: con `deletedAt` en `AplicacionCobro`,
**toda** derivación de `Σ montoAplicado` necesitaría un `WHERE`, y un filtro
olvidado en el `SUM()` de REQ-CXC-04 **sobre-aplica plata**. El riesgo cae justo
sobre el invariante de dinero. Precedente de la casa: `ArranqueConciliado`
conserva el acto anulado; la convención escrita es *los REPORTES se calculan,
los ACTOS se guardan*. Los triggers de `comprobantes_audit` NO sirven: la
función está clavada a `comprobante_id` y ramifica por `TG_TABLE_NAME`.

Mismo tratamiento en la anulación del **cobro** (REQ-CXC-06).

#### Escenario: anular desvincula y preserva

- DADO una venta contabilizada con 2 cobros aplicados por Bs 4.500
- CUANDO se anula con motivo válido
- ENTONCES la advertencia previa dice "este cobro está aplicado a N ventas por
  Bs X" (consecuencia concreta)
- Y las aplicaciones se eliminan, los cobros quedan con saldo a favor
- Y el comprobante queda `anulado = true`, CONTABILIZADO, con su número

#### Escenario (−): borrar una venta es ilegal

- DADO una venta contabilizada
- CUANDO se intenta un DELETE físico
- ENTONCES no existe tal operación en la API (matriz fila 5, §4.7)

### REQ-VTA-08: Multi-tenant estricto (B-2)

`Venta` y `LineaVenta` DEBEN llevar `organizationId` no nulo (la línea con el
suyo propio, no solo vía la cabecera) y TODA query DEBE filtrar por él en
guard + servicio + repositorio (§4.2). Venta ajena → 404. Los cruces
(`contactoId`, `itemId`, cuentas) DEBEN validarse contra el MISMO tenant.

#### Escenario: ítem de otro tenant en una línea

- DADO un `itemId` perteneciente a la organización B
- CUANDO un usuario de la organización A crea una venta con ese ítem
- ENTONCES rechaza — el batch del `ItemsReaderPort` acotado al tenant no lo
  devuelve

### REQ-VTA-09: Period lock sin bypass (§4.4; matriz 14)

Crear, contabilizar, editar o anular una venta cuya `fechaContable` cae en un
período que no está `ABIERTO` DEBE rechazarse. El único camino es la
reapertura formal (`PeriodoFiscalReopening`) — sin contraseña de override ni
excepción de admin (D-14: escalón "exigir reapertura formal").

**Precisión de vocabulario**: `PeriodoFiscalStatus` tiene sólo `ABIERTO` y
`CERRADO` — **no existe un período `BLOQUEADO`** (`BLOQUEADO` es valor de
`EstadoComprobante`, otro enum; confundirlos es fácil y esta spec lo hacía).
Lo que se le parece es el booleano `PeriodoFiscal.esDefinitivo`, que NO
bloquea la escritura —eso ya lo hace `status = CERRADO`— sino que impide
**reabrir**: un período definitivo se queda sin la salida de la reapertura.

#### Escenario: editar venta de período cerrado

- DADO una venta contabilizada en un período CERRADO
- CUANDO se intenta editarla o anularla
- ENTONCES rechaza indicando el flujo de reapertura

### REQ-VTA-10: Configuración contable — conceptos protegidos (B-10, B-11, B-12)

- `OrgConfiguracionContable` suma `cuentasPorCobrarId` y `ventasId`, mapeados
  en `MAPEO_CODIGO_A_CONCEPTO` desde `1.1.2.001` y `4.1.1.001`.
- **B-10 (Anti-42)**: ambas cuentas pasan a `esRequeridaSistema: true` en el
  seed. La bidireccionalidad estricta se conserva (toda cuenta mapeada es
  requerida y viceversa) y la guarda de regresión del seed pasa de **8 a 10
  conceptos requeridos**.
- **B-11 (Anti-41)**: los dos campos entran a `CONCEPTO_FIELDS`
  (`prisma-cuenta.repository.ts`) y llevan FK `onDelete: Restrict` — sin eso,
  CxC y Ventas quedan desactivables aunque el auto-asiento dependa de ellas.
- **B-12**: en una organización sin los conceptos mapeados, contabilizar DEBE
  fallar con `VENTA_CONCEPTO_NO_CONFIGURADO` (422) nombrando el concepto
  faltante en `details` — un error de dominio con nombre, no un 500.

#### Escenario: desactivar la cuenta de ventas mapeada

- DADO `4.1.1.001` mapeada como `ventasId`
- CUANDO se intenta desactivarla
- ENTONCES rechaza con `CUENTA_CONFIGURADA_COMO_CONCEPTO` listando `ventasId`

#### Escenario (−): org sin concepto mapeado

- DADO una organización cuyo `cuentasPorCobrarId` es null
- CUANDO se contabiliza una venta a crédito
- ENTONCES responde 422 `VENTA_CONCEPTO_NO_CONFIGURADO` con el concepto en `details`

### REQ-VTA-11: RBAC — `contabilidad.ventas.*` (D-23)

Las 6 entradas `contabilidad.ventas.{read,create,update,delete,post,void}` ya
declaradas DEBEN salir de `DECLARADOS_SIN_ENDPOINT` al montar los controllers
(el test es igualdad exacta en las dos direcciones). Decoradores con literales
string (el escaneo es texto). Template Contador: los 6 verbos (D-23 —
contabiliza y anula, ningún verbo de cierre; desde #291 el upsert del seed
refresca el template en cada corrida). Espejo manual
`frontend/src/lib/permissions.ts` actualizado. Gating
`@RequireModule('contabilidad')`, SIN pack (D-01).

`post` gatea contabilizar; `void` gatea anular; `update` cubre la edición
post-CONTABILIZADO de la venta (el comprobante `generadoPorSistema` no se
edita a mano — el molde del permiso estado-dependiente `edit-posted` ya está
catalogado, #291).

#### Escenario: vendedor sin `post`

- DADO un usuario con `ventas.create` pero sin `ventas.post`
- CUANDO llama "Guardar y contabilizar"
- ENTONCES responde 403 y el borrador NO queda contabilizado

## Códigos de error (nuevos, namespace `VENTA_*`)

> **Reconciliado con el código el 2026-07-29, al cerrar la Fase 4.** Esta tabla
> listaba 5 códigos y la implementación tiene **16**. Los 11 que faltaban no son
> invención: son las condiciones que los requisitos ya exigen (period lock,
> multi-tenant, ítem/contacto inválidos) y que la tabla nunca nombró. El HTTP sale
> de la subclase de `DomainError` (`NotFoundError` 404, `InvalidStateError` 422,
> `ConflictError` 409), no se elige suelto.
>
> Los dos `500` son deliberados: señalan **bugs de dominio**, no errores del
> usuario. `montoTotal` y los subtotales los calcula el backend, así que un
> descuadre o un subtotal negativo sólo pueden venir de un defecto del caller —
> devolver 422 los disfrazaría de dato inválido del cliente.

| Código | HTTP | Condición |
|---|---|---|
| `VENTA_VENCIMIENTO_REQUERIDO` | 422 | CREDITO sin `fechaVencimiento` (o CONTADO con ella) |
| `VENTA_CONCEPTO_NO_CONFIGURADO` | 422 | `cuentasPorCobrarId`/`ventasId` sin mapear (B-12) |
| `VENTA_CUENTA_DESTINO_NO_ELEGIBLE` | 422 | cuenta destino del CONTADO fuera del criterio de efectivo/equivalentes (PA-1, criterio en REQ-CXC-02); incluye el CONTADO sin `cuentaDestinoId` |
| `VENTA_CUENTA_SNAPSHOT_INACTIVA` | 422 | cuenta del snapshot inactiva o no-detalle al generar el asiento |
| `VENTA_ANULADA_NO_EDITABLE` | 409 | editar/anular una venta ya anulada (§4.7) |
| `VENTA_NO_ENCONTRADA` | 404 | venta inexistente **o de otro tenant** — 404 y no 403, para no confirmar que existe (§4.2, REQ-VTA-08) |
| `VENTA_CONTACTO_NO_ENCONTRADO` | 404 | el `contactoId` no existe en el tenant |
| `VENTA_ITEM_NO_ENCONTRADO` | 404 | un `itemId` de las líneas no existe en el tenant (REQ-VTA-08) |
| `VENTA_CONTACTO_INACTIVO` | 422 | el contacto existe pero está inactivo |
| `VENTA_ITEM_INACTIVO` | 422 | un ítem de las líneas está inactivo (`ItemsReaderPort` devuelve `{id, activo}`) |
| `VENTA_GESTION_NO_ABIERTA` | 422 | no existe período fiscal para la `fechaContable` (sin gestión creada) — REQ-VTA-09 |
| `VENTA_PERIODO_NO_ABIERTO` | 409 | el período de la `fechaContable` está `CERRADO`; el mensaje nombra el flujo de reapertura formal. **Sin bypass de admin** (REQ-VTA-09) |
| `VENTA_NO_ES_BORRADOR` | 409 | eliminar o contabilizar una venta que ya no está en BORRADOR |
| `VENTA_ASIENTO_SIN_MONTO` | 422 | la venta no mueve monto alguno; §4.1 exige suma total > 0 |
| `VENTA_ASIENTO_DESCUADRADO` | 500 | `montoTotal` ≠ Σ subtotales — **bug de dominio**, los dos los calcula el backend |
| `VENTA_LINEA_SUBTOTAL_NEGATIVO` | 500 | subtotal negativo — **bug de dominio**, §4.1 exige débitos y créditos ≥ 0 |
| `VENTA_CONDICION_PAGO_CON_APLICACIONES` | 422 | pasar la venta de CREDITO a CONTADO teniendo aplicaciones vivas (fila 7; agregado 2026-07-30 por auditoría de la Fase 5) |

Códigos de **otros namespaces** que salen por endpoints de ventas, porque la
validación vive en el writer del núcleo y NO se duplicó (Anti-01):

| Código | HTTP | Condición |
|---|---|---|
| `COMPROBANTE_ANULAR_MOTIVO_INVALIDO` | 422 | motivo de anulación con menos de 10 caracteres significativos (§4.7) |
| `COMPROBANTE_ANULAR_BORRADOR_NO_PERMITIDO` | 409 | anular una venta en BORRADOR — se elimina, no se anula |

## Preguntas abiertas

**Ninguna.** PA-1 (cuenta destino de la venta CONTADO — selector precargado
en Caja General, criterio de elegibilidad en REQ-CXC-02) y PA-2 (grupo
`comercial` primero en la sección Contabilidad — ver delta de
`frontend-sidebar-nav`) fueron cerradas por Marco el 2026-07-28 e
incorporadas a los requisitos.

## Nota §2.2 — qué NO lleva comentario regulatorio

El orden FIFO/LIFO de aplicaciones es **política de la casa** (D-16): el
Código Civil arts. 316-318 fue verificado y NO obliga ningún default (316-II
es supletorio; 318 habilita al acreedor). PROHIBIDO etiquetar ese `ORDER BY`
con `// Código Civil art. 316` — sería darle falsa autoridad. Sí llevan
referencia normativa, cuando entren en v2, el IVA (Ley 843) y la imputación a
intereses (art. 317).
