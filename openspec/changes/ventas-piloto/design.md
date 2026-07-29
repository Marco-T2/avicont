# Design: Ventas y Cuentas por Cobrar — piloto

## Technical Approach

Tres módulos hexagonales nuevos (`items`, `ventas`, `cuentas-por-cobrar`) que
escriben el asiento por un **camino de sistema que re-valida**. El núcleo no
aprende que Ventas existe: `comprobantes` **posee** el writer port (§3.7) y
Ventas lo consume. La venta y su comprobante nacen y mutan en **una sola TX**
vía `auditedTx.run` — sin eso los triggers de `comprobantes_audit` pierden el
actor. Specs: `ventas`, `cuentas-por-cobrar`, `items`, delta `comprobante`.

## Architecture Decisions

### Decisión: `ComprobanteSistemaWriterPort` nuevo, NO extender el del cierre

**Choice**: port nuevo en `comprobantes/ports/`, hermano de
`CierreComprobanteWriterPort`, con `crearBorradorSistema` (líneas **con
`contactoId`**), `regenerarLineasSistema`, `contabilizarSistema`,
`anularSistema`, `eliminarBorradorSistema`.

**Alternatives**: (a) extender el port del cierre; (b) que Ventas llame a
`ComprobantesService` (imposible: `generadoPorSistema` lo bloquea).

**Rationale**: el writer del cierre **no valida nada** — escribe Prisma directo
y **hardcodea `contactoId: null`**
(`prisma-cierre-comprobante-writer.adapter.ts:59`). Con eso B-1 es
inalcanzable y REQ-CMP-VTA-03 pide lo contrario. Extenderlo obligaría a meterle
validación a un camino que hoy deliberadamente no la tiene, tocando el cierre.

### Decisión: extraer la validación de cuentas — hoy está copiada 3 veces

**Choice**: `validarLineasContraCuentas(lineas, cuentasMap, contactosMap)` en
`comprobantes/domain/`, consumida por el camino de usuario **y** el de sistema.

**Rationale**: `activa`/`esDetalle` está copiado en `contabilizar:451`,
`editarContabilizado:702` y `resolverYValidarBorrador:1277`. Ventas sería la
4.ª copia (Anti-01). El validador estructural (`comprobante-validator.ts`) ya
es dominio puro y se reusa tal cual; esto le suma lo que necesita I/O.

> **Hueco preexistente que esto cierra**: `requiereContacto` se enforcea en
> **un solo lugar** — `contabilizar:457`. `editarContabilizado` **no lo valida**
> (verificado: único call site de `ContactoRequeridoError`). O sea que el
> mecanismo de §4.3 que D-17 manda reusar permite hoy dejar una línea de CxC
> sin `contactoId`. Es exactamente el invariante de B-1, del que depende el
> aging. El extract lo cierra en los dos caminos.

### Decisión: el rastro de B-14 es tabla append-only, no soft-delete

**Choice**: `AplicacionCobroDesvinculada` (append-only: `cobroId`, `ventaId`,
`montoAplicado`, `motivo`, `userId`, `createdAt`). El borrado de
`AplicacionCobro` sigue siendo **físico** (D-12 intacto).

| Opción | Costo |
|---|---|
| Borrado físico solo | pierde el contexto del acto que §4.7 audita |
| Soft-delete en `AplicacionCobro` | **toda** derivación de `Σ montoAplicado` necesita `WHERE`; un filtro olvidado en el `SUM()` de B-6 sobre-aplica plata |
| **Tabla append-only** | derivaciones intactas; el acto queda |

**Rationale**: el riesgo del soft-delete cae justo sobre el invariante de
dinero (REQ-CXC-04). Precedente de la casa: `ArranqueConciliado` conserva el
acto anulado ("es parte del rastro, no algo a esconder"), y la convención ya
escrita es *los REPORTES se calculan, los ACTOS se guardan*. Los triggers de
`comprobantes_audit` **no sirven**: la función está clavada a `comprobante_id`
y ramifica por `TG_TABLE_NAME` — no es genérica.

### Decisión: el criterio de efectivo se extrae a `common/domain/` — ⚠ ver Open Questions

**Choice**: mover `CODIGO_EFECTIVO_PREFIJO` + el predicado a
`common/domain/efectivo.ts`; `cuentas` expone
`CuentasEfectivoReaderPort.esElegibleComoDestino(...)`; `reportes` lo importa
de `common/`.

**Rationale**: la regla vive en `reportes/domain/` y Ventas no puede importarla
(§3.3). `common/` la comparten los dos sin dueño en disputa, y evita el
precedente de duplicar (los `enum-mappers` de `cuentas`) que acá violaría
Anti-01 sobre plata.

## Data Flow

    POST /ventas ──► VentasService ─── auditedTx.run (UNA TX) ──────────┐
                          │                                            │
                          ├─► ItemsReaderPort.obtenerBatch  {id,activo} │
                          ├─► ContactosReaderPort.obtenerBatch          │
                          ├─► CuentasEfectivoReaderPort (CONTADO)       │
                          │                                            │
                          └─► ComprobanteSistemaWriterPort              │
                                   ├─ validarLineasContraCuentas ◄──────┤ compartido
                                   ├─ validarComprobanteParaContabilizar┤ con el
                                   └─ repo.reemplazarComprobante  ──────┘ camino usuario
                                        (id + numero PRESERVADOS §4.9)

Cobro → mismo camino, tipo `INGRESO`, `origenTipo='COBRO'`.
Aplicación → **no toca este flujo**: cero comprobantes (D-03).

## File Changes

| File | Action | Description |
|---|---|---|
| `comprobantes/ports/comprobante-sistema-writer.port.ts` | Create | writer que re-valida |
| `comprobantes/adapters/prisma-comprobante-sistema-writer.adapter.ts` | Create | reusa `repo.reemplazarComprobante` |
| `comprobantes/domain/validacion-cuentas.ts` | Create | extract de las 3 copias |
| `comprobantes/comprobantes.service.ts` | Modify | consume el extract; `anular` rechaza origen comercial (REQ-CMP-VTA-04) |
| `common/domain/efectivo.ts` | Create | predicado único de efectivo |
| `reportes/domain/estado-flujo-efectivo.ts` | Modify | importa de `common/` |
| `items/`, `ventas/`, `cuentas-por-cobrar/` | Create | módulos hexagonales completos |
| `prisma/migrations/` ×3 | Create | enum-only → tablas (+UNIQUE PARCIAL raw) → backfill data-only |
| `CLAUDE.md` §11.6 | Modify | sumar el UNIQUE PARCIAL de `Item.codigo` |
| `docs/claude/dominio-contable.md` §4.2 | Modify | fila `precioUnitario (18,6)` (B-7, §12.3) |

## Interfaces / Contracts

```ts
export abstract class ComprobanteSistemaWriterPort {
  abstract crearBorradorSistema(d: CrearSistemaData, tx?: Tx): Promise<{ id: string }>;
  /** Reemplazo en bloque §4.3: preserva cabecera, `id` y `numero` (§4.9). */
  abstract regenerarLineasSistema(d: RegenerarData, tx?: Tx): Promise<void>;
  abstract contabilizarSistema(id: string, tenantId: string, tx?: Tx): Promise<{ numero: string }>;
  abstract anularSistema(d: AnularSistemaData, tx?: Tx): Promise<void>;
  abstract eliminarBorradorSistema(id: string, tenantId: string, tx?: Tx): Promise<void>;
}
```

`ItemsReaderPort.obtenerBatch(tenantId, ids, tx?) → Map<id,{id,activo}>` —
espejo literal de `ContactosReaderPort` (REQ-ITM-04).

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | subtotales/`Money`, FIFO, recorte LIFO, normalización de `codigo`, predicado de efectivo | dominio puro, ≥95% (§7.5) |
| Integration | sobre-aplicación concurrente (`SUM()` + `FOR UPDATE`), idempotencia del upsert, UNIQUE PARCIAL | Postgres real; **acotar todo `count()` al tenant del test** (§11.3) |
| E2E | venta→cobro→aplicación; comprobante del cobro **byte-idéntico** tras re-imputar (criterio 4); anular vía comprobantes → 409 | supertest, `--runInBand` |

Regresión obligatoria: `catalogo-vs-controllers.spec.ts` (3 puntas) y
`catalogo-vs-espejo-frontend.spec.ts`.

## Migration / Rollout

Tres migraciones (D-22). La de tablas **no puede contener el literal
`'VENTA'`** (Postgres pre-COMMIT, R-6). Protocolo §11.6 **obligatorio**: grep
`^DROP (INDEX|EXTENSION|TYPE)` y rescate a mano — los `contactos_*_trgm_idx`
caen siempre. Aditivas salvo el backfill, que sí toca datos (idempotente).

### Decisión: el redondeo es HALF-UP y `Money` estrena `redondearABob()`

**Choice**: agregar `Money.redondearABob(): Money` (`toDecimalPlaces(2)`,
half-up). `subtotal` se redondea **explícitamente** antes de persistir;
`montoTotal = Σ subtotales ya redondeados`. Corregir Anti-04 y Anti-07.

**Rationale — medido en las tres capas, no elegido por gusto**:

| Capa | Política | Evidencia |
|---|---|---|
| `Money.div` | half-up | `money.spec.ts:206` lo fija por test |
| `Money.toBob` | half-up | `toFixed(2)`; comentario `money.ts:6` |
| Postgres `numeric(18,2)` | half-up | `31.525 → 31.53`, `0.005 → 0.01` (verificado en la BD local) |

Half-even —lo único que piden los docs— **no está implementado en ninguna
capa**, y adoptarlo desalinearía TS de Postgres: todo valor que llegara sin
redondear explícitamente se redondearía distinto en la BD. Sería peor que hoy.

**Por qué hace falta el método igual**: como Postgres redondea con la misma
política, el número por línea coincide — el descuadre aparece en el **total**.
Con 3 líneas de `10.005`: subtotales redondeados `10.01×3 = 30.03`, pero
`montoTotal` derivado de los crudos da `30.015 → 30.02`. **Un centavo de
diferencia entre `montoTotal` y `Σ subtotales`**, que es justo el invariante
que REQ-VTA-03 declara. Ese, y no el de la spec, es el test que discrimina: el
escenario `31.515 → 31.52` da lo mismo con half-up y half-even.

### Decisión: la cartera se deriva de `anulado` + saldo, NUNCA del estado

**Choice**: el conjunto vigente de CxC usa `estado IN (CONTABILIZADO,
BLOQUEADO) AND anulado = false`. La constante se extrae a un único lugar
consumible (hoy está **duplicada**: `prisma-lineas-cuenta-reader.adapter.ts:17`
y `match-conciliacion.service.ts:34`); Ventas sería la tercera copia.

**Rationale**: cerrar un período ejecuta `bloquearPorPeriodo`
(`periodos-fiscales.service.ts:147`) y pasa **todos** sus comprobantes de
CONTABILIZADO a BLOQUEADO; reabrir lo revierte. Leído literal, el
"CONTABILIZADAS" de REQ-CXC-01 **vaciaría el estado de cuenta de cada cliente
al cerrar el mes**. La conciliación ya resolvió exactamente esto con
`ESTADOS_CONCILIABLES` ("plata efectivamente movida"): mismo criterio, mismo
molde. La venta **no lleva estado propio espejado** — se lee del comprobante.

## Open Questions

- [ ] ~~`Money` sin API de redondeo~~ → **RESUELTO** arriba (half-up medido).
- [ ] ~~`BLOQUEADO` ausente de las specs~~ → **RESUELTO** arriba (molde
  `ESTADOS_CONCILIABLES`). Requiere corregir el texto de REQ-VTA-01 y REQ-CXC-01.
- [ ] **`Money` no tiene la API de redondeo que la spec cita** (contexto):
  REQ-VTA-03 fija `subtotal = redondear(cantidad × precioUnitario, 2)` "con la
  política central de `Money` (Anti-04; Anti-07: `toDecimalPlaces(2)` half-even
  como `Money.toBob`)". Verificado: **nada de eso existe**. `Money.toBob()` no
  recibe parámetros, usa `toFixed(2)` y es **half-up** — lo dice su propio
  comentario (`money.ts:6`); no hay `Decimal.set` global. `Money.redondear(...)`
  que promete Anti-04 tampoco existe, y `mul()` no redondea. Sin un método
  nuevo, el redondeo lo termina haciendo **Postgres al insertar en
  `Decimal(18,2)`**, en silencio — Anti-04 en su peor forma. Hay que (1)
  agregar `Money.redondearABob(): Money`, (2) decidir half-up (statu quo del
  sistema) vs half-even (lo que dicen los docs), y (3) corregir Anti-04/Anti-07,
  que documentan una API inexistente — mismo drift que `ClockPort.hoyEnLaPaz()`.
  El escenario de la spec (31.515 → 31.52) da **el mismo resultado con ambas
  políticas**: no discrimina, y pasaría con la equivocada.

- [ ] **BLOQUEANTE — el estado `BLOQUEADO` no aparece en ninguna de las 5 specs.**
  REQ-VTA-01 declara los estados "pegados" enumerando sólo BORRADOR↔BORRADOR y
  CONTABILIZADO↔CONTABILIZADO. Pero cerrar un período ejecuta
  `bloquearPorPeriodo` (`prisma-comprobantes-lock.adapter.ts:23`), que pasa
  **todos** los comprobantes del período de CONTABILIZADO a BLOQUEADO en masa —
  operación mensual de rutina, no un caso de borde. Dos consecuencias sin
  responder: qué estado toma la venta cuando su comprobante se bloquea, y sobre
  todo si REQ-CXC-01 ("sólo ventas CONTABILIZADAS integran la cartera") deja
  fuera del estado de cuenta a todas las ventas del mes recién cerrado. La
  cartera debe derivarse de `anulado` + saldo, **no** del estado del
  comprobante.

- [ ] **BLOQUEANTE — el criterio de efectivo de la spec NO es el del EFE.**
  REQ-CXC-02 lo describe por cuenta ("explícito, o **en su defecto** el prefijo
  `1.1.1`"). El EFE real usa un **interruptor de organización**
  (`estado-flujo-efectivo.ts:106-111`): si **alguna** cuenta está marcada
  `EFECTIVO`, la heurística del prefijo se apaga **para toda la org**.
  Implementar la spec al pie de la letra crea la segunda definición de
  "efectivo" que ella misma prohíbe (Anti-01).

  **Estado real medido en la BD local**: las **110 cuentas tienen
  `actividadFlujo = null`** — el interruptor nunca se activó. Cuentas bajo
  `1.1.1`: sólo **`1.1.1.001 CAJA` y `1.1.1.002 BANCOS`** son de detalle.
  Consecuencia: **hoy A y B dan el mismo resultado** y migrar cuesta cero. La
  divergencia nace el día que alguien marque una cuenta desde `/plan-cuentas`
  (la UI ya lo permite, change `cuenta-actividad-flujo-ui`).

  | | A — alinear al EFE (interruptor de org) | B — por cuenta (unión) |
  |---|---|---|
  | Definición de efectivo | una sola | dos, divergentes |
  | Marcar BANCOS como EFECTIVO | **CAJA deja de ser elegible** y era el default del cobro (D-05) | nada se rompe |
  | Riesgo | el admin mejora su EFE y rompe el selector de cobros | el selector y el EFE discrepan en silencio |

  El argumento que la investigación hizo aparecer y que antes no estaba:
  *"¿es efectivo y equivalente para el EFE?"* y *"¿puede recibir un cobro?"*
  **no son la misma pregunta**. Una cuenta que el admin excluyó del efectivo
  del EFE sigue siendo un lugar legítimo donde entra plata. El interruptor
  org-wide las fuerza a ser la misma. Decisión de producto de Marco; **(C)**
  cambiar el EFE queda descartada (toca un reporte en producción). Cualquiera
  de las dos exige corregir el texto de REQ-CXC-02.
