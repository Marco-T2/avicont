# Exploration: ventas-piloto

> Conversación 2026-07-28 con Marco. Explora el primer módulo comercial del
> vertical Contabilidad. Presupone `docs/disenos/ideas-comercial-y-packs.md`
> (dirección de producto, 2026-06-14) y lo corrige donde hizo falta.

## Current State

**No existe módulo comercial.** Una venta hoy se registra tipeando un
comprobante manual. Lo único que hay es infraestructura preparada:

| Pieza | Dónde | Estado |
|---|---|---|
| `origenTipo` / `origenId` + `@@unique([organizationId, origenTipo, origenId])` | `schema.prisma:715,745` | presente desde Fase 1.3, sin usar por ventas |
| Permisos `contabilidad.ventas.{read,create,update,delete,post,void}` | `common/permisos/catalogo.ts:136` | declarados, **sin endpoint** |
| Cuentas del plan comercial | `cuentas/adapters/seed/comercial.ts` | completas (ver abajo) |
| `TipoComprobante` | enum de 7 valores + `PREFIJO_POR_TIPO` | sin valor para ventas |
| Riel de packs | `packs/` | Ventas NO es pack (ver decisión D-01) |

### Cuentas que YA existen en el plan comercial

`1.1.1.001` CAJA · `1.1.1.002` BANCOS · `1.1.2.001` CUENTAS POR COBRAR
(`requiereContacto: true`) · `1.1.2.011` ANTICIPOS POR COBRAR ·
`2.1.4.001` IVA DÉBITO FISCAL · `2.1.4.004` IT POR PAGAR ·
`4.1.1.001` INGRESOS POR VENTAS DE MERCADERÍAS · `5.1.1.001` COSTO DE VENTAS ·
`5.2.5.002` IMPUESTO A LAS TRANSACCIONES (gasto).

`MAPEO_CODIGO_A_CONCEPTO` (comercial.ts:415) ya cablea `ivaDebitoId` e
`itPorPagarId` a `OrgConfiguracionContable` al crear la org. **Faltan** como
conceptos de configuración: `cuentasPorCobrarId` y `ventasId`.

## Hallazgos que corrigen supuestos de entrada

### H-1 — El catálogo de permisos ya asumió el modelo

`catalogo.ts:136` declara para `ventas` los verbos **`post`** ("Contabilizar
ventas") y **`void`** ("Anular ventas") — **los mismos que `asientos`**
(línea 117). Quien escribió el catálogo ya asumió que una venta recorre el
ciclo de un comprobante. Es evidencia independiente de la decisión D-02.

El test `catalogo-vs-controllers.spec.ts` es exacto en las dos direcciones:
al montar los controllers **obliga** a sacar las 12 entradas
`contabilidad.{ventas,compras}.*` de `DECLARADOS_SIN_ENDPOINT`.

### H-2 — `ANULADO` no es un estado

`EstadoComprobante` tiene **3 valores: BORRADOR, CONTABILIZADO, BLOQUEADO**.
`anulado` es una **columna booleana ortogonal** (§4.7). Un comprobante anulado
sigue siendo CONTABILIZADO. Modelarlo como cuarto valor del enum rompe:
preservación perpetua, no-reutilización del número, exclusión por default de
EEFF con toggle, y marca visual en reportes oficiales.

El tercer estado real es **BLOQUEADO**, el que pone el cierre de período
(error `COMPROBANTE_BLOQUEADO`: *"primero reabrí el período"*).

### H-3 — carmen2026 ya implementó esto, y está en producción

Sistema PHP/MySQL en `C:\web\stack\carmen2026`. `insertarDespacho()`
(`public/app/controllers/despachos/create.php`) crea **un** comprobante en
**una** transacción:

```
tb_comprobantes  (cabecera: tipo, serie, correlativo, código, fecha, gestión)
  ├── tb_transacciones        → EL ASIENTO      (Debe CxC / Haber Ventas)
  ├── tb_detalletransacciones → EL COMERCIAL    (cajas, pesoB, pesoN, precio)
  └── tb_boleta_cerrada       → CAMPOS PROPIOS  (PK = id_comprobante, 1:1, CASCADE)
```

**No hay tabla "venta".** El despacho ES el comprobante; el detalle comercial
es un hijo más, hermano del asiento.

**Taxonomía completa** (7 tipos, whitelist en `public/despachos/create.php`):
15 Pollo vivo · 13 Flete vivo · 14 Servicio matadero · 16 Traspaso pollo
faenado · 12 Flete faenado · **7 Despacho** · **11 Boleta cerrada**. Mapea 1:1
con el ciclo avícola del §5.1 del doc de ideas. **Solo 2 de los 7 son ventas**;
el resto son compras y costos.

**Marco confirmó que el traspaso/faena (16) NO está implementado** — servía de
registro informativo para saber cuánto pagar. Para faena **no hay
implementación de referencia**, solo el diseño teórico del §5.1.

#### Para copiar

- **Numeración dentro de la transacción.** Comentario textual del código: *"Si
  algo falla luego, el rollBack revierte también el correlativo; un intento
  fallido NO consume numeración."* Es §4.9 bien hecho. Tiene además modo
  AUTO/MANUAL por tipo — el mismo mecanismo que `TipoDocumentoFisico`.
- **Guardar los tres totales**: exacto / truncado / redondeado. Preserva la
  trazabilidad del redondeo en vez de tirar los pasos intermedios.
- **Extensión 1:1 por tipo** con PK = `id_comprobante` y `ON DELETE CASCADE`.

#### Para NO copiar

- **Dinero en float de PHP.** `nfloat()` = `(float)number_format(...)`, con
  `floor((x + 1e-9) * 10)/10` como parche: la cicatriz de IEEE-754 (§4.5/Anti-19).
- **Regla de redondeo sin documentar.** El CxC se trunca a 1 decimal y luego se
  redondea a **entero** con umbral `0.7` (`$frac >= 0.7 ? ceil : floor`). El
  asiento va en bolivianos enteros. **Preguntar al negocio de dónde sale ese
  0.7 antes de reimplementarlo** — §2.2 exige la cita.
- **Pérdida silenciosa de datos.** `SHOW TABLES LIKE` + `try/catch` alrededor
  del INSERT + `error_log` sin lanzar: si la tabla o las columnas faltan, el
  comprobante **commitea igual** y granja/merma/tara se pierden sin ruido.
- **Duplicación**: 5 `create_*_1X.php` de 810 líneas que difieren en **4
  constantes**; 5 `edit_*` de 890; los 7 handlers `store_*` son el mismo archivo
  de 499 bytes. ~8.500 líneas que son un form parametrizado.

### H-4 — El negocio de carmen RECHAZÓ el bloqueo por estado

Migración `2026_02_09_eliminar_estado_cerrado.sql`:

> *"Eliminar funcionalidad de Cerrar Corte. Todos los cortes pasan a estado
> ABIERTO. La columna 'estado' se mantiene por compatibilidad pero ya no se usa
> para bloquear edición."*

Tenían un estado que bloqueaba edición y **lo sacaron**; la columna quedó
zombie. La corrección de un despacho hoy es `delete.php`/`restore.php` — borrado
lógico, no anulación por flag.

**Consecuencia para el piloto**: el period lock sobre ventas va a encontrar la
misma fricción. No invalida la decisión (§4.4 es invariante del core), pero
obliga a que el BORRADOR sea cómodo de verdad.

### H-5 — QuickBooks: cómo funciona el cobro

Dos pantallas espejo: **Receive Payment** (cliente/CxC) y **Pay Bills**
(proveedor/CxP). El flujo de *Receive Payment*: elegís cliente → se puebla
"Outstanding Transactions" con las facturas abiertas → escribís "Amount
received" → QBO auto-tilda de la más vieja hacia adelante → podés destildar y
**editar el monto por fila** (pago parcial) → sección "Credits" para aplicar
saldos a favor previos → el excedente queda sin aplicar.

Se puede hacer un *Receive Payment* de **importe 0** y solo aplicar un crédito.

Distingue además **Invoice** (crédito → CxC) de **Sales Receipt** (contado →
directo al banco/caja): son dos documentos distintos, no uno con variantes.

**El hallazgo contable**: imputar un cobro a una factura u otra **no genera
asiento**. El asiento del cobro es idéntico; lo único que cambia es el
auxiliar. Por eso QBO puede re-imputar libremente.

## Decisiones cerradas en esta exploración

### D-01 — Ventas/Compras es FREE, no pack

Gating por `@RequireModule('contabilidad')` **solamente**. Sin fila en `Pack`,
sin `OrgPackEntitlement`, sin `PackEnabledGuard`, sin pantalla de Complementos.
Barrido de los 20 controllers: lo FREE lleva solo `@RequireModule`; lo de pack
lleva **ambos** decoradores.

Razón (doc de ideas §2): si se cobra por registrar una venta, el tier gratis es
inusable. Se monetiza la especialización (Inventario, Avícola, RRHH, POS).

### D-02 — Un documento, tres ejes independientes

La venta **es** su propio comprobante. No genera un segundo asiento aparte.

```
Eje contable:  BORRADOR ──▶ CONTABILIZADO ──▶ BLOQUEADO
Anulación:     ───── flag booleano, ortogonal (§4.7) ─────
Eje comercial: ABIERTA / PARCIAL / SALDADA   ← derivado, NO almacenado
```

El eje comercial **no va en el enum del estado** (produce
`CONTABILIZADO_PARCIALMENTE_COBRADO` y explosión combinatoria). Es ortogonal,
igual que `anulado`.

**VENCIDO no es un cuarto valor**: es `fechaVencimiento < hoy AND saldo > 0`,
derivado vía `ClockPort.currentDateLaPaz()` (§4.6 prohíbe `new Date()` en dominio y
servicios). Como estado exigiría un cron que a medianoche flipee filas.

### D-03 — CxC estilo QuickBooks: crédito dentro de CxC

**Se descarta el §6.4 del doc de ideas** (cuenta de pasivo separada para
anticipos), que recomendaba lo contrario.

| | Crédito en CxC (elegido) | Pasivo separado (descartado) |
|---|---|---|
| Asiento del cobro | siempre `Debe Banco/Caja / Haber CxC` | depende de cuánto se aplicó |
| Aplicar / desaplicar | **cero asientos** | asiento nuevo / inverso |
| Period lock | nunca lo toca | choca si el cobro es de un mes cerrado |

Razón decisiva: **`CLAUDE.md` §10.9 ya posicionó el producto** como *"PyMEs
bolivianas con control contable interno (estilo QuickBooks/Sage default)"*, y
explícitamente **fuera** de auditoría externa rígida. El pasivo separado es la
opción de rigor del segmento descartado.

**Lo que NO se cae**: el §6.3 queda intacto — cobro (evento real) /
aplicaciones (N vínculos editables) / saldo no aplicado (derivado). El auxiliar
sigue sabiendo que hay saldo a favor; simplemente no se asienta por separado.
Por eso la decisión es **reversible**: cambia el tratamiento contable, no el
modelo de datos.

**Consecuencia asumida**: el Balance General muestra CxC neteado; si un cliente
tiene saldo a favor, el activo queda subvaluado y hay un pasivo que no se ve.
Es error de **presentación**, no de cuadre. La salida barata —reclasificación
de presentación en el reporte, sin tocar asientos— se puede agregar el día que
moleste, sobre datos históricos.

### D-04 — Contado y crédito son caminos propios

```
CONTADO   Debe Caja/Banco / Haber Ventas      ← sin auxiliar, sin CxC
CRÉDITO   Debe CxC        / Haber Ventas      ← crea la partida abierta
```

**No modelar contado como "crédito cobrado inmediatamente"**: generaría tres
registros (partida que nace saldada + cobro + aplicación) y llenaría el Libro
Mayor de CxC de débitos y créditos por el mismo importe, de ventas que nunca
generaron una cuenta por cobrar.

Pago parcial en el acto = crédito + cobro inmediato, **dos pasos**. El campo
"Deposit" de la factura de QBO queda fuera del piloto.

### D-05 — Cuenta puente = Caja General (criterio de Marco)

No hace falta cuenta nueva. El efectivo entra a Caja General y el traspaso
Caja → Banco se hace **a mano**, con la fecha del depósito real:

```
Lun 27  Cobros A/B/C   Debe Caja General 1.000/2.000/2.000 / Haber CxC
Mar 28  Depósito       Debe Banco 5.000 / Haber Caja General 5.000
                       └─ extracto Mar 28: +5.000 ✓ match 1:1
```

La cuenta puente **desacopla la fecha del cobro de la del depósito**. Sin ella,
3 movimientos del lunes pelean contra una línea de banco del martes.

**Sale gratis**: los cobros nunca tocan la cuenta banco, y el módulo de
conciliación lee los movimientos **de la cuenta banco** ⇒ los cobros son
invisibles para él **por construcción**. La regla de Marco —*"no interesa quién
depositó qué monto, interesa que lo depositado sea igual al extracto"*— no hay
que programarla.

**Bonus**: el saldo de Caja General es control real — lo cobrado y no
depositado (arqueo de caja).

El traspaso **ya existe** como `TipoComprobante.TRASPASO` (T, *"movimientos
entre cuentas internas"*). Cero trabajo para el piloto.

**Push-back registrado y aceptado**: para una **transferencia** recibida la
plata nunca estuvo en el cajón; ruteo por Caja es un rodeo, y si el traspaso no
lleva la misma fecha el arqueo miente y la conciliación se corre de fecha. Se
resuelve con el campo **cuenta destino elegible** en el cobro: la política
("dónde cayó la plata realmente" vs. "todo por Caja") queda del lado del
contador, sin diferencia de código.

### D-06 — Tipo `VENTA` nuevo en el enum

`V2607-000001`, con su propia secuencia mensual, en vez de mezclarse en el
contador de `INGRESO`. Cuesta un valor en el enum + una línea en
`PREFIJO_POR_TIPO` (que es `Record<TipoComprobante, string>`: **el compilador
obliga a mapearlo**).

> Distinción que importa: agregar `VENTA` está bien porque ventas es **core
> FREE**. Agregar `DESPACHO`/`BOLETA_CERRADA` **rompería el riel** — son tipos
> de pack y el core no puede conocerlos (ver Q-1).

### D-07 — La Venta ES la cuenta por cobrar

Sin tabla auxiliar espejo (`DocumentoPorCobrar`). La venta ya tiene contacto,
fecha y monto; el saldo pendiente = monto − Σ aplicaciones. Es el modelo de
QBO: la factura *es* el receivable.

Corrige el §6.1 del doc de ideas, que postulaba tabla propia. Si la consulta de
aging pesa, se denormaliza **con el número medido**, no antes.

### D-08 — Dos botones, "Contabilizar" primario

```
[ Guardar borrador ]        [ Guardar y contabilizar ]  ← primario
```

QBO y carmen postean de una. Se conserva el borrador porque **en el rubro el
peso vuelve después**: el camión sale y el peso confirmado llega cuando vuelve.
El vendedor normal aprieta el primario y nunca ve un borrador.

### D-09 — Sin impuestos en el piloto

No por costo técnico (las cuentas existen y están cableadas), sino porque en
Bolivia el IVA va **por dentro** (Ley 843):

```
Debe CxC          100
  Haber Ventas     87
  Haber IVA Déb.   13     ← el 13% sale de adentro del precio
Debe Gasto IT       3     ← 3% sobre el bruto, asiento aparte
  Haber IT x Pagar  3
```

Cambia el DTO de la línea (precio con/sin impuesto, base imponible) y duplica
lo que hay que testear. El piloto valida el **flujo**. carmen tampoco los
calcula: sus despachos son `Debe CxC / Haber Ventas` pelado.

⚠️ **Condición**: el piloto corre en **org de prueba**. Ventas reales sin IVA no
se arreglan después sin rehacer asientos contabilizados.

## Open Questions para la propuesta

- **Q-1 — Tipos de venta del pack Avícola.** Despacho y Boleta Cerrada son
  ventas **del pack**, con campos propios (`granja`, `merma_general_pct`,
  `tara_kg`, `faltante_kg`, `neto_real_kg`, `nro_pollos`). La dirección
  acordada: el pack **consume** Ventas vía `VentasWriterPort` (la flecha va del
  pack al core, nunca al revés); campos propios en tabla de extensión 1:1 en el
  pack; numeración contable compartida (`V`) + número de documento propio vía
  el riel `TipoDocumentoFisico` + `SecuenciaDocumentoFisico`, que ya existe.
  **Fuera del piloto**, pero el diseño de v1 no debe cerrarle la puerta.
- **Q-2 — Apagado de pack.** Desactivar un pack **no puede volver ilegible un
  asiento contabilizado**: el comprobante se lee siempre por el core; se pierde
  crear nuevos y la vista especializada. Corolario: **la glosa del asiento debe
  ser autosuficiente** ("Despacho #42" no alcanza).
- **Q-3 — Ítems**: ¿`Item` mínimo propio del piloto o catálogo compartido desde
  el día uno? El doc de ideas §3 lo quiere FREE compartido, espejo de Contactos.
- **Q-4 — Imputación de pagos**: FIFO por default con override manual. El
  **Código Civil boliviano** regula la imputación cuando el deudor no
  especifica. **Verificar el artículo exacto, no inventarlo** (§2.2).

## Ready for Proposal

Sí. Alcance de v1 en `proposal.md`.
