# Cuentas por Cobrar — Specification

> Change: `ventas-piloto`. Capability NUEVA.
> Fuente: `proposal.md` (D-03, D-05, D-07, D-11, D-12, D-13, D-16, D-18, D-21)
> + matriz de operaciones (filas 7-13) + brechas B-1, B-2, B-6, B-9.

## Purpose

Responder "¿quién me debe y cuánto?" sin tabla auxiliar: **la venta a crédito
ES la partida abierta** (D-07). Cobros como hechos contables independientes;
aplicaciones como vínculos editables que **no generan asiento** (D-03, modelo
QuickBooks — posicionamiento §10.9). Módulo
`backend/src/cuentas-por-cobrar/`, hexagonal §3.2, FREE sin pack (D-01).

## Requirements

### REQ-CXC-01: Saldos y estados DERIVADOS, nunca almacenados (D-07)

- `saldoPendiente(venta) = montoTotal − Σ montoAplicado` — derivado.
- Estado comercial `ABIERTA | PARCIAL | SALDADA` — derivado del saldo,
  **ortogonal** al estado contable y al flag `anulado` (D-02: nunca un enum
  combinado `CONTABILIZADO_PARCIALMENTE_COBRADO`).
- `VENCIDA = fechaVencimiento < hoy AND saldoPendiente > 0` — derivada
  comparando contra `ClockPort.currentDateLaPaz()` (string ISO que se eleva
  con `FechaContable`). NUNCA columna, NUNCA cron que flipee filas a
  medianoche, NUNCA `new Date()` en dominio/servicio (§4.6, Anti-20).
- Ninguno de los tres se persiste (Anti-05). Solo ventas CONTABILIZADAS y no
  anuladas integran la cartera.

#### Escenario: el estado cambia solo al aplicar

- DADO una venta a crédito de 1.000 con saldo 1.000 (ABIERTA)
- CUANDO se aplica un cobro de 400
- ENTONCES la venta se lee PARCIAL con saldo 600, sin que ninguna columna de
  la venta haya cambiado

#### Escenario: VENCIDA es una lectura, no un evento

- DADO una venta con `fechaVencimiento = 2026-07-27` y saldo > 0
- CUANDO se consulta el 2026-07-28 según `ClockPort`
- ENTONCES se informa VENCIDA con 1 día de atraso, sin ningún job de por medio

### REQ-CXC-02: El Cobro — hecho contable independiente (D-05, D-11, B-1)

`Cobro`: `contactoId`, `fechaContable`, `monto` (> 0, `Money`, string en DTO
§4.5), **cuenta destino elegible** (D-05), `glosa`. DEBE existir por sí solo,
sin depender de ninguna venta.

**Criterio de elegibilidad de la cuenta destino — ÚNICO y definido acá**
(lo comparte la venta CONTADO, REQ-VTA-04; PA-1 cerrada por Marco
2026-07-28). Una cuenta es elegible ⇔ `activa = true` ∧ `esDetalle = true` ∧
identificada como **efectivo/equivalentes** por la regla que YA existe en el
EFE: marca explícita `actividadFlujo = 'EFECTIVO'`, o en su defecto código
bajo el prefijo `1.1.1` ("EFECTIVO Y EQUIVALENTES DE EFECTIVO",
`CODIGO_EFECTIVO_PREFIJO`). No se inventa una segunda definición de
"efectivo" (Anti-01: la regla vive en un solo lugar). Cuenta no elegible →
422 `COBRO_CUENTA_DESTINO_NO_ELEGIBLE`.

El **default Caja General** (`1.1.1.001`) es **precarga de UI**, no concepto
de backend: el backend siempre recibe la cuenta destino explícita y valida
elegibilidad. Si `1.1.1.001` no existe o no es elegible en el plan del
tenant, el formulario no precarga y el usuario elige — NUNCA un 500; una
organización sin ninguna cuenta elegible cae en el mismo 422 del criterio (no
se duplica con un `*_CONCEPTO_NO_CONFIGURADO`).

Su comprobante es de tipo **`INGRESO`** (serie `I` existente, SIN tipo nuevo —
D-11), `generadoPorSistema = true`, `origenTipo = 'COBRO'`,
`origenId = cobro.id`, idempotente vía el unique de origen (Anti-17). El
asiento es SIEMPRE:

```
Debe  <cuenta destino>   monto
Haber CxC                monto      ← con contactoId del cobro (B-1)
```

se aplique a lo que se aplique. La línea `Haber CxC` DEBE llevar
`contactoId = cobro.contactoId` (`1.1.2.001` tiene `requiereContacto: true`;
sin esto el primer cobro falla en runtime). Glosa autosuficiente (Q-2). En una
organización sin `cuentasPorCobrarId` mapeado → 422
`COBRO_CONCEPTO_NO_CONFIGURADO` (B-12, espejo de ventas).

El listado de comprobantes distingue un cobro de una venta por `origenTipo`,
no por el tipo del comprobante (D-11).

#### Escenario: cobro sin venta

- DADO un cliente sin ninguna venta abierta
- CUANDO se registra un cobro de 500 (anticipo)
- ENTONCES el cobro se contabiliza `Debe Caja General / Haber CxC` con el
  contacto en la línea CxC
- Y queda con 500 de saldo no aplicado (saldo a favor)

#### Escenario (−): cuenta destino no elegible

- DADO un cobro cuya cuenta destino es una cuenta de gasto (`5.x`) activa y
  de detalle
- CUANDO se registra
- ENTONCES rechaza con 422 `COBRO_CUENTA_DESTINO_NO_ELEGIBLE`

#### Escenario: los cobros son invisibles para la conciliación (D-05, D-13)

- DADO cobros del lunes a Caja General y un `TRASPASO` manual Caja → Banco del
  martes
- CUANDO se listan los movimientos conciliables de la cuenta banco
- ENTONCES los cobros NO aparecen (nunca tocaron la cuenta banco) y el
  traspaso SÍ, matcheando 1:1 con la línea del extracto

### REQ-CXC-03: Aplicaciones — vínculos, no hechos contables (D-03)

`AplicacionCobro`: N vínculos `cobro → venta` con `montoAplicado > 0`,
editables. Crear, editar, mover o borrar una aplicación **NO genera asiento
ni toca ningún comprobante** (D-03): el comprobante del cobro DEBE quedar
byte-idéntico ante cualquier re-imputación (criterio de éxito 4, verificado
por test). Ambas puntas DEBEN ser del MISMO `contactoId`. Saldo no aplicado
del cobro = `monto − Σ aplicaciones`, derivado → saldo a favor del cliente.

Consecuencia de period lock (D-03): aplicar y desaplicar NO tocan
contabilidad, así que DEBEN permitirse aunque el cobro o la venta pertenezcan
a un período cerrado — no hay hecho contable nuevo que fechar.

#### Escenario: reaplicar es mover una fila

- DADO un cobro de un período CERRADO con 400 de saldo a favor
- CUANDO se aplica ese saldo a una venta nueva
- ENTONCES la aplicación se crea sin ningún asiento y sin chocar con el
  period lock
- Y el comprobante del cobro es byte-idéntico al de antes

#### Escenario (−): aplicar a una venta de otro cliente

- DADO un cobro del cliente A y una venta abierta del cliente B
- CUANDO se intenta aplicar
- ENTONCES rechaza con 422 `APLICACION_CONTACTO_DISTINTO`

### REQ-CXC-04: Invariante de sobre-aplicación (B-6, cicatriz F-03)

Invariantes declarados — ninguno estaba escrito en ningún lado y una suma no
se protege con un constraint:

```
Σ montoAplicado(cobro)  ≤  cobro.monto
Σ montoAplicado(venta)  ≤  venta.montoTotal
```

Enforcement obligatorio en TODA escritura de aplicaciones (crear, editar,
recortar): validación **pre-TX** (fail fast, error amigable) **Y dentro de la
transacción** con `SUM()` en SQL bajo lock `FOR UPDATE` sobre el cobro y la
venta involucrados (Anti-11, Anti-12 — check-then-act aplicado a plata). Dos
aplicaciones concurrentes al mismo cobro NO pueden sobre-aplicarlo.

#### Escenario (−): exceder el cobro

- DADO un cobro de 500 con 400 ya aplicados
- CUANDO se intenta aplicar 200 más
- ENTONCES rechaza con 422 `APLICACION_EXCEDE_COBRO`

#### Escenario: concurrencia — solo una gana

- DADO un cobro de 500 sin aplicaciones y dos requests simultáneos de 300
- CUANDO ambos ejecutan
- ENTONCES exactamente uno commitea y el otro rechaza — el `SUM()` intra-TX
  bajo lock ve la aplicación del primero

#### Escenario (−): exceder la venta

- DADO una venta de 1.000 con 900 aplicados desde otro cobro
- CUANDO se intenta aplicar 200
- ENTONCES rechaza con 422 `APLICACION_EXCEDE_VENTA`

### REQ-CXC-05: FIFO sugiere, el usuario decide, el backend valida (D-16, B-9)

La pantalla de cobro (estilo *Receive Payment*, H-5): elegir cliente → listar
sus ventas abiertas con saldo → escribir el monto → auto-tilde de la **más
vieja hacia adelante** — SIEMPRE destildable y con monto editable por fila.

Reparto de responsabilidades (B-9, Anti-18/Anti-01):
- El orden canónico (antigüedad) lo publica el **backend** en el listado de
  ventas abiertas — el frontend auto-tilda sobre ese orden, no lo recalcula.
- Las aplicaciones efectivas viajan **explícitas** en el payload (venta +
  monto por fila); el backend valida REQ-CXC-03/04 sobre lo recibido. La
  sugerencia nunca se convierte en auto-match silencioso.
- El recorte LIFO (D-21) es regla de **backend** — vive con el invariante,
  no en la pantalla.

**§2.2**: FIFO es política de la casa, NO aplicación del Código Civil arts.
316-318 (D-16, verificado). Ese `ORDER BY` NO lleva comentario regulatorio.

#### Escenario: auto-tilde FIFO overrideable

- DADO un cliente con ventas abiertas del 01-jun (300), 15-jun (500) y
  01-jul (400), y un cobro de 600
- CUANDO la pantalla sugiere
- ENTONCES tilda 300 a la del 01-jun y 300 a la del 15-jun
- Y el usuario puede destildar la del 01-jun y aplicar 600 a las otras dos —
  el backend acepta lo explícito

### REQ-CXC-06: Mutaciones del cobro — matriz (filas 7, 8, 9, 12; D-12, D-14)

| Operación | Conducta |
|---|---|
| Subir `monto` | **resolver**: el excedente colapsa al saldo a favor (agregado) |
| Bajar `monto` POR DEBAJO de lo aplicado | **obligar a decidir**: el recorte se reparte entre ventas distinguibles; el sistema NO elige — rechaza con 422 `COBRO_MONTO_INFERIOR_APLICADO` y el usuario desaplica primero |
| Anular el cobro | **advertir + motivo** (§4.7): elimina sus aplicaciones (D-12); las ventas vuelven a quedar pendientes **por derivación pura** — no hay estado que reabrir |
| Borrar el cobro | **ilegal** (§4.7): no existe el DELETE |
| Cambiar el `contactoId` | **advertir**: desvincula TODAS las aplicaciones |
| Cobro ya depositado vía traspaso | **nada** (D-13): sin objeto depósito ni guard de saldo de Caja; el desfase lo destapa el arqueo — trabajo del contador, asumido |

La anulación se dispara desde este módulo, nunca desde comprobantes (Anti-14),
con la consecuencia concreta en pantalla (D-14) y el rastro de B-14 con el
mismo tratamiento que en ventas (SHOULD, resuelve `sdd-design`).

#### Escenario: anular un cobro reabre por derivación

- DADO un cobro aplicado 600 a una venta (saldo 0, SALDADA)
- CUANDO se anula el cobro con motivo válido
- ENTONCES sus aplicaciones se eliminan y la venta vuelve a leerse ABIERTA con
  saldo 600 — sin ninguna columna de la venta tocada
- Y el comprobante del cobro queda anulado por flag, número conservado

#### Escenario (−): bajar el cobro por debajo de lo aplicado

- DADO un cobro de 1.000 con 800 aplicados a dos ventas
- CUANDO se intenta bajarlo a 500
- ENTONCES rechaza con 422 `COBRO_MONTO_INFERIOR_APLICADO` indicando cuánto
  hay que desaplicar

#### Escenario: anular un cobro ya depositado no se bloquea (D-13)

- DADO un cobro a Caja General cuyo importe ya salió en un `TRASPASO` a banco
- CUANDO se anula el cobro
- ENTONCES la anulación procede; Caja General puede quedar con saldo acreedor
  y eso lo detecta el arqueo, no un guard

### REQ-CXC-07: Estado de cuenta por cliente

Por contacto: ventas CONTABILIZADAS no anuladas con saldo > 0, cada una con
`montoTotal`, cobrado, `saldoPendiente`, `fechaVencimiento` y **días de
atraso** (derivados vía `ClockPort`, dependen del `contactoId` de la línea CxC
— B-1), más el saldo a favor (Σ saldos no aplicados de sus cobros). Las
anuladas salen del estado de cuenta (§4.7); las CONTADO nunca entran (D-04).

#### Escenario: la venta anulada desaparece del estado de cuenta

- DADO un cliente con dos ventas abiertas, una de ellas luego anulada
- CUANDO se consulta su estado de cuenta
- ENTONCES solo la vigente aparece, y el saldo total refleja solo esa

### REQ-CXC-08: Multi-tenant estricto en el vínculo (B-2)

`Cobro` y `AplicacionCobro` DEBEN llevar `organizationId` propio no nulo y
toda query filtra por él (guard + servicio + repositorio, §4.2).
`AplicacionCobro` es un vínculo entre dos entidades: el agujero clásico es
aplicar un cobro del tenant A a una venta del tenant B. Al escribir una
aplicación, el servicio Y el repositorio DEBEN verificar que
`cobro.organizationId === venta.organizationId === tenantId` del JWT. Recurso
ajeno → 404.

#### Escenario (−): aplicación cross-tenant

- DADO un cobro del tenant A y una venta del tenant B con ids conocidos
- CUANDO un usuario del tenant A intenta aplicar
- ENTONCES responde 404 (la venta ajena no existe para él) y nada se escribe

### REQ-CXC-09: Period lock sobre el cobro (§4.4)

Crear, editar o anular un **cobro** con `fechaContable` en período
CERRADO/BLOQUEADO DEBE rechazarse — es un hecho contable. Reapertura formal,
sin bypass (matriz fila 14). Las **aplicaciones** quedan explícitamente fuera
del lock (REQ-CXC-03: no son hechos contables).

#### Escenario: cobro en mes cerrado

- DADO julio CERRADO
- CUANDO se intenta registrar un cobro con fecha 15-jul
- ENTONCES rechaza indicando la reapertura como único camino

### REQ-CXC-10: RBAC — `contabilidad.cobros.*` (D-23)

DEBE declararse `contabilidad.cobros.{read,create,update,delete,post,void}`
en el catálogo (submódulo NUEVO; el test de tres puntas rompe el build si
falta), con literales string en los decoradores. Template Contador: los 6
verbos (D-23 — mismo trato que asientos, ningún verbo de cierre). Espejo
manual `frontend/src/lib/permissions.ts` actualizado.
`@RequireModule('contabilidad')`, SIN pack. Aplicar/desaplicar quedan bajo
`cobros.update` (mutan el vínculo, no crean hecho contable).

#### Escenario: usuario de solo lectura

- DADO un usuario con `cobros.read` únicamente
- CUANDO intenta registrar o aplicar un cobro
- ENTONCES responde 403, y SÍ puede ver el estado de cuenta

## Códigos de error (nuevos, namespaces `COBRO_*` / `APLICACION_*`)

| Código | HTTP | Condición |
|---|---|---|
| `COBRO_CONCEPTO_NO_CONFIGURADO` | 422 | `cuentasPorCobrarId` sin mapear (B-12) |
| `COBRO_CUENTA_DESTINO_NO_ELEGIBLE` | 422 | cuenta destino fuera del criterio de efectivo/equivalentes (PA-1) |
| `COBRO_MONTO_INFERIOR_APLICADO` | 422 | bajar el monto por debajo de lo aplicado (matriz fila 8) |
| `APLICACION_EXCEDE_COBRO` | 422 | Σ aplicaciones superaría el monto del cobro (B-6) |
| `APLICACION_EXCEDE_VENTA` | 422 | Σ aplicaciones superaría el total de la venta (B-6) |
| `APLICACION_CONTACTO_DISTINTO` | 422 | cobro y venta de contactos distintos |
