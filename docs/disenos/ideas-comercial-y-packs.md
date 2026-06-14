<!--
Última edición: 2026-06-14
Última revisión contra core: 2026-06-14
Owner: backend-lead
-->

# Ideas futuras — Comercial (Ventas/Compras/Cobranzas) y packs de dominio

> **Estado: IDEAS / EXPLORACIÓN — NADA CONSTRUIDO.**
> Este documento captura decisiones de producto y dirección arquitectónica
> acordadas en conversación (2026-06-14) para construir **más adelante**. No es
> una spec viva ni un change en curso: es el registro de "hacia dónde vamos" para
> que no se pierda entre sesiones. Cuando alguna de estas piezas pase a
> construcción, se abre su propio change SDD y este doc se reconcilia.
>
> Presupone: `CLAUDE.md` raíz (verticales §10.4, packs §10.1, comprobantes §4,
> auto-asientos §4.9), `docs/disenos/packs-eje2.md` (riel de packs) y
> `docs/disenos/plataforma-multi-vertical.md` (tres ejes). Si algo acá contradijera
> un invariante del core → va al core primero (regla anti-drift §12).

---

## 1. Bounded context: el pack "Avícola" es de Contabilidad, NO de Granja

Decisión cerrada por producto. Son **dos negocios distintos**:

| Vertical / pack | Negocio | Qué maneja |
|---|---|---|
| **Vertical Granja** | el granjero que **cría** aves | lotes, movimientos, operativo simple con IA. Exclusivo para granjeros. |
| **Pack "Avícola"** (del vertical **Contabilidad**) | el que **compra pollo vivo, lo procesa y comercializa** | compra de pollo vivo → faena → despacho/venta/traspasos. NO toca granja. |

- El pack Avícola es **exclusivo para negocios que lo requieran** (comercializadores/
  faenadores), montado sobre el vertical Contabilidad.
- Registra **solo el ciclo del pollo comprado vivo hasta su venta o traspaso**. Nada
  de cría ni de lotes de granja.
- Esto resuelve la tensión de **vertical exclusivo** (`organizations_vertical_exclusivo_check`):
  un negocio es Granja **o** Contabilidad, nunca ambos. El faenador es Contabilidad +
  pack; el granjero es Granja. Sin solapamiento.

---

## 2. Ventas y Compras = FREE (modelo QuickBooks)

Decisión cerrada: el ciclo comercial **básico** es FREE, no un pack de pago.

**Razón**: si se cobra por registrar una venta/compra, el tier gratis es inusable
(nadie tipea asientos manuales por cada operación). La venta/compra básica es lo que
hace **usable** la contabilidad. Se monetiza la **especialización**, no lo básico.
Es exactamente cómo QuickBooks engancha (facturación + gastos en la base) y sube a
inventario/nómina como pago.

### 2.1 Frontera FREE vs PACK (afinada)

La línea NO es "sub-dominio = pack". La línea fina es:

| Criterio | Clasificación |
|---|---|
| **Consecuencia inherente de una transacción** — el asiento, la cuenta por cobrar que nace de vender a crédito, aplicarle un pago | **FREE** |
| **Capa de tracking que se monta encima** (stock de inventario en el tiempo, vector store RAG) o **sub-dominio especializado** (faena avícola, RRHH/nómina, POS) | **PACK** |

- Vender a crédito **inevitablemente** crea una cuenta por cobrar → FREE.
- Trackear stock en el tiempo es **opcional** (se puede vender sin control de
  inventario) → PACK.

### 2.2 Mapeo a QuickBooks

```
QuickBooks base    →  Ventas + Compras + ítems + contactos      →  FREE
QuickBooks Plus    →  + Inventario (control de stock)           →  PACK "Inventario"
QuickBooks add-on  →  + Payroll (nómina)                        →  PACK "RRHH"
(no existe en QB)  →  + Faena avícola                           →  PACK "Avícola"  ← diferenciador
```

---

## 3. Catálogo de ítems = FREE compartido (espejo de Contactos)

Lo necesitan Ventas, Compras, Inventario y POS. Es **master data compartida, FREE**,
paralela a `Contactos` (que ya es FREE y compartido vía `ContactosReaderPort`).

- Cada ítem lleva un **tipo**: `PRODUCTO | SERVICIO` (o `controlaStock: boolean`).
- El tipo decide el comportamiento, **por ítem, no por pack**:

| Pack Inventario | Tipo del ítem | ¿Descuenta stock? | ¿Línea de costo de ventas? |
|---|---|---|---|
| OFF | cualquiera | No | No |
| ON | PRODUCTO | **Sí** | **Sí** |
| ON | SERVICIO | **No** | No |

- Un servicio es el caso **más simple**: solo ingreso + IVA, sin inventario ni costo.
  No necesita un "pack de servicios".
- Naming: como aguanta servicios, es un **"catálogo de ítems"**, no "de productos".

---

## 4. Pack "Inventario" (capacidad) — separado de Ventas/Compras

Modelo de descomposición correcto (ERP): Ventas y Compras **dependen opcionalmente**
de Inventario vía `InventarioPort`. NO lo embeben.

- ¿Inventario activo? → la venta descuenta stock + genera asiento de costo de ventas.
- ¿Inventario NO activo? → la venta funciona igual (servicio o mercadería sin stock).
- **FIFO de inventario** (costeo de capas) vive acá. QuickBooks Online usa FIFO;
  Desktop usa promedio por default. Decisión a cerrar al construir.
- Inventario por **peso** (kg, `@db.Decimal(18,6)`) es solo la unidad de medida del
  ítem — no es un pack aparte.

---

## 5. Pack "Avícola" — faena, merma, landed cost, despacho por peso

Sub-dominio especializado. Se monta sobre Compras + Inventario + Ventas.

### 5.1 El costo se ACUMULA y cristaliza tarde

Ejemplo: compra de pollo vivo → matadero → faena → despacho.

1. **Compra pollo vivo**: 1.000 kg @ Bs 12 → `Debe Inv. pollo vivo / Haber Proveedor`.
2. **Flete de entrada**: se **capitaliza** en el inventario (landed cost), no se gasta
   suelto → `Debe Inv. pollo vivo / Haber Caja`. Ahora vale Bs 12,50/kg.
3. **Faena con merma**: 1.000 kg vivo → 750 kg faenado (merma 25%) + costo matadero
   Bs 1.000 → `Debe Inv. pollo faenado 13.500 / Haber Inv. pollo vivo 12.500 / Haber
   Caja 1.000`. **Recién acá** cristaliza el costo: 13.500 / 750 kg = **Bs 18/kg**.
4. **Despacho/venta por peso**: 750 kg @ Bs 25 → asiento de venta + costo de ventas.

### 5.2 Reglas del dominio

- **Merma normal**: NO es pérdida; el costo se **reconcentra** sobre el peso resultante
  (sube el costo/kg). **Merma anormal** (error/mortandad) SÍ es pérdida → gasto separado.
  El pack debe distinguirlas.
- **Inventario en proceso**: el pollo vivo "en tránsito" hacia faena necesita su propio
  estado; el costo de ventas nace **diferido** (post-faena), no al comprar.
- **Costeo por proceso**, no por orden.

### 5.3 Dependencia entre packs (feature del riel a diseñar)

El pack Avícola **requiere** Inventario activo. Hoy el riel modela packs sueltos, sin
prerequisitos. A diseñar: **packs con prerequisitos** — ¿activar Avícola auto-activa
Inventario, o lo bloquea con "activá Inventario primero"?

```
FREE:  Ventas · Compras · Catálogo ítems · Contactos · Comprobantes
PACK:  Inventario
           ▲
PACK:  Avícola ──depende──▶ Inventario
```

---

## 6. Cuentas por Cobrar / Pagar = FREE, modelo open-item

CxC/CxP es la consecuencia inherente de vender/comprar a crédito → **FREE**, parte de
Ventas/Compras.

### 6.1 Open-item (partidas abiertas), NO balance-forward

Cada factura se trackea individual (ABIERTA/PARCIAL/SALDADA). El pago se **aplica a
facturas específicas**. Se necesita un **auxiliar** (`DocumentoPorCobrar` /
`DocumentoPorPagar`: `contactoId`, `comprobanteOrigenId`, `montoOriginal`,
`saldoPendiente`, `estado`). **El mayor solo lleva el saldo**; el detalle de qué
factura está abierta vive en el auxiliar.

### 6.2 Aplicación de cobros: FIFO default + override manual (como QuickBooks)

QuickBooks **no usa FIFO rígido**: sugiere la factura más vieja primero, pero el
usuario aplica manualmente a facturas específicas. Mismo asiento en el mayor sin
importar a qué factura se impute; lo que cambia es el **auxiliar**.

- Política: **FIFO por default, siempre overrideable**.
- Nota legal: el Código Civil boliviano regula la **imputación de pagos** cuando el
  deudor no especifica (probablemente coincide con oldest-first). **Verificar el
  artículo exacto al construir** (CLAUDE.md §2.2 exige cita normativa; no inventar el
  número).

### 6.3 Modelo abierto "dinero primero, aplicación después"

Tres entidades **separadas** (esto es lo que da la flexibilidad de QuickBooks):

```
1. EL COBRO          → evento de dinero real, existe SOLO (sin depender de factura).
2. LAS APLICACIONES  → N vínculos (cobroId → documentoPorCobrarId, montoAplicado). EDITABLE.
3. SALDO NO APLICADO → montoCobro − SUM(aplicaciones). Si > 0 → saldo a favor (anticipo).
```

- **Cobro sin marcar factura** → todo queda como **saldo a favor / anticipo**.
- **Sobrepago** = saldo no aplicado = **mismo mecanismo** (un concepto cubre ambos).
- **Editar monto a la baja** (1.000 → 100) → se **desmarcan** las aplicaciones que ya
  no caben; sus facturas vuelven a ABIERTO.
- **Anular el cobro** (§4.7, flag, no borrado físico) → cascada: las facturas que
  saldaba vuelven a ABIERTO; auditado por triggers Postgres.
- Mutabilidad gobernada por **§4.3** (editable mientras el período esté abierto).

### 6.4 Anticipos = PASIVO (sutileza contable clave)

Un cobro **no aplicado** NO genera el mismo asiento que uno aplicado:

```
Aplicado a factura:      Debe Banco / Haber Cuentas por cobrar
NO aplicado (anticipo):  Debe Banco / Haber Anticipos de clientes (PASIVO)
Al aplicarlo después:    Debe Anticipos de clientes / Haber Cuentas por cobrar
```

- Recibir plata sin entregar/facturar = **le debés al cliente** → pasivo, no ingreso.
- Decisión a cerrar: cuenta de pasivo separada (riguroso, mejor EEFF) **vs** crédito
  dentro de CxC (QuickBooks pragmático, deja CxC negativo). **Recomendado: pasivo
  separado** para que el Balance General boliviano lo muestre bien.

### 6.5 Invariantes (defense in depth, §4)

1. `SUM(aplicaciones de un cobro) ≤ montoCobro`.
2. `saldoPendiente(factura) = montoOriginal − SUM(aplicaciones contra ella)`.
3. **El auxiliar SIEMPRE cuadra con el mayor**:
   `saldo CxC mayor = SUM(saldos pendientes) − SUM(saldos a favor)`.

---

## 7. Secuencia tentativa de construcción (menor → mayor dependencia)

1. **Catálogo de ítems** (FREE compartido, tipos PRODUCTO/SERVICIO).
2. **Ventas** (FREE) — genera comprobante vía auto-asiento (`origenTipo="VENTA"`).
3. **Compras** (FREE) — espejo, `origenTipo="COMPRA"`.
4. **CxC/CxP open-item** (FREE) — auxiliar + cobros/pagos + aplicación FIFO/manual +
   anticipos. `origenTipo="COBRO"`/`"PAGO"`.
5. **Inventario** (PACK) — stock, FIFO de costo, `InventarioPort`.
6. **Avícola** (PACK) — faena/merma/landed cost/despacho; requiere Inventario; diseñar
   packs-con-prerequisitos en el riel.
7. RRHH/nómina, POS, RAG — packs posteriores.

> Recordar: todo pack de dominio es **fuente** de asientos; el comprobante es el
> **sumidero** (`origenTipo`/`origenId` + upsert, §4.9). Agregar un pack no toca el
> core ni los otros packs.

---

## 8. Decisiones abiertas (a cerrar al construir cada pieza)

| Decisión | Recomendación | Cuándo |
|---|---|---|
| Anticipos: pasivo separado vs crédito en CxC | Pasivo separado | CxC |
| FIFO de inventario vs promedio | A evaluar (QBO=FIFO) | Inventario |
| Packs con prerequisitos (Avícola→Inventario): auto-activar vs bloquear | A diseñar en el riel | Avícola |
| Inventario de Granja (`MovimientoCantidad`) vs Inventario mercantil: ¿mismo concepto? | Cerrar bounded context antes de construir cualquiera | Inventario / Granja |
| Artículo del Código Civil para imputación de pagos | Verificar, no inventar | CxC |
| Naming "catálogo de ítems" vs "productos" | Ítems (aguanta servicios) | Catálogo |

---

**Fin del documento.** Ideas para construir más adelante; cada pieza abre su change
SDD propio cuando se decida. Se versiona en git.
