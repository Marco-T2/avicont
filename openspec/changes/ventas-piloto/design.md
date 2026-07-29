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

### Decisión: `AuditedTransactionRunner` sube a `common/` — hoy Ventas no puede alcanzarlo

**Choice**: mover `AuditedTransactionRunner` de
`comprobantes/infrastructure/audited-transaction.runner.ts` a
`common/audited-transaction.runner.ts` (al lado de `PrismaService`, su única
dependencia), y registrarlo donde ya vive la infra transversal. Movimiento
**puro**: cero cambios de comportamiento, cero cambios de firma.

> **Hueco detectado 2026-07-29.** El Approach de este design dice que la venta y
> su comprobante nacen "en una sola TX vía `auditedTx.run`" y lo da por
> resuelto. **No lo estaba**: `ComprobantesModule` exporta únicamente
> `ComprobantesService` y `CIERRE_COMPROBANTE_WRITER_PORT`
> (`comprobantes.module.ts:93`), y el runner vive en `comprobantes/infrastructure/`,
> que §3.3 prohíbe importar desde otro módulo. Tal como estaba escrito, la
> primera task de Fase 4 chocaba contra la regla de imports sin tener a dónde ir.

| Opción | Costo |
|---|---|
| Exportar el runner desde `ComprobantesModule` | expone una clase de infraestructura concreta cruzando frontera de módulo — es exactamente lo que §3.3 prohíbe, y el precedente contagia |
| Que el writer port abra la TX (`enTransaccionAuditada(userId, fn)`) | respeta §3.3, pero deja a Ventas escribiendo **sus propias** tablas dentro de una TX que abre el port de otro módulo: inversión de control confusa y el port pasa a orquestar |
| **Mover a `common/`** | el runner depende **solo** de `PrismaService` (`@/common/prisma.service`) y no sabe nada de comprobantes: es infra transversal, que es literalmente lo que §3.1 define para `common/` |

**Rationale**: no es una dependencia entre dominios, es plomería de Prisma —
`$transaction` + cuatro `set_config`. Su propio docstring ya generaliza el
mandato (*"Toda operación que emita eventos de auditoría DEBE usar este
wrapper"*), y Compras va a necesitarlo por el mismo motivo. Dejarlo escondido
en un módulo de dominio obliga a inventar un port por cada consumidor nuevo.

**Riesgo acotado**: el runner tiene un único consumidor hoy
(`comprobantes.service.ts`), así que el movimiento es un cambio de import y
nada más. La suite de comprobantes es la red: si el actor dejara de llegar a
`comprobantes_audit`, revienta ahí.

### Decisión: extraer la validación de cuentas — hoy está copiada 3 veces

**Choice**: `validarLineasContraCuentas(lineas, cuentasMap, contactosMap)` en
`comprobantes/domain/`, consumida por el camino de usuario **y** el de sistema.

**Rationale**: `activa`/`esDetalle` está copiado en `contabilizar:454`,
`editarContabilizado:703` y `resolverYValidarBorrador:1286`. Ventas sería la
4.ª copia (Anti-01). El validador estructural (`comprobante-validator.ts`) ya
es dominio puro y se reusa tal cual; esto le suma lo que necesita I/O.

> **Corregido 2026-07-29 — el hueco de `requiereContacto` YA ESTÁ CERRADO.**
> Este bloque decía que `requiereContacto` se enforzaba en un solo lugar
> (`contabilizar`) y que `editarContabilizado` no lo validaba. **Era cierto al
> escribir el design y dejó de serlo antes de mergearlo**: el preflight #294
> (`950f644`, mergeado ANTES de este documento) agregó la validación en
> `comprobantes.service.ts:711`, con su propio comentario de §4.1.
>
> Lo que cambia para este change: **el extract sigue siendo obligatorio, pero
> por anti-duplicación (Anti-01), no por cerrar un agujero**. Hoy hay DOS copias
> de la regla de contacto, no una y un hueco; Ventas sería la tercera. Que nadie
> salga a buscar el bug: no está.

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

### Decisión: a `common/domain/` va el PREFIJO, no "el criterio"

**Choice**: mover **`CODIGO_EFECTIVO_PREFIJO`** y el predicado por-cuenta
`esEfectivoPorCodigo(cuenta)` a `common/domain/efectivo.ts`. `reportes` los
importa de ahí; `cuentas` expone
`CuentasEfectivoReaderPort.esElegibleComoDestino(...)`, que construye **su
propio** criterio sobre esa base.

> **Reconciliado 2026-07-29.** Este bloque se escribió cuando se creía que
> Ventas y el EFE iban a compartir UNA regla, y el título decía "el criterio de
> efectivo se extrae". La decisión de Marco más abajo (unión POR CUENTA) eligió
> a conciencia **dos criterios divergentes**, así que "el criterio" en singular
> ya no existe y este bloque no podía quedar como estaba.

Lo que se comparte y lo que no, explícito para que nadie lo reinvente:

| Pieza | Dónde vive | Quién la usa |
|---|---|---|
| `CODIGO_EFECTIVO_PREFIJO = '1.1.1'` | `common/domain/efectivo.ts` | EFE **y** Ventas/Cobros |
| `esEfectivoPorCodigo(cuenta)` (`esDetalle` ∧ prefijo) | `common/domain/efectivo.ts` | EFE **y** Ventas/Cobros |
| **Interruptor de organización** (si ALGUNA cuenta está marcada `EFECTIVO`, la heurística se apaga para TODAS) | `reportes/domain/estado-flujo-efectivo.ts` — **se queda ahí** | solo el EFE |
| **Elegibilidad como destino de cobro** (`activa` ∧ `esDetalle` ∧ (`EFECTIVO` ∪ prefijo)) | `cuentas` vía `CuentasEfectivoReaderPort` | solo Ventas/Cobros |

**Rationale**: lo que Anti-01 prohíbe es que el mismo hecho se escriba dos
veces, y el hecho compartido es **cuál es el prefijo del plan de cuentas** — ese
sí queda en un solo lugar. Las dos reglas de arriba **no son el mismo hecho**
(ver la decisión de elegibilidad más abajo): responden preguntas distintas y
tienen dueños distintos. Fusionarlas para "no duplicar" sería el error que la
decisión de Marco descartó.

⚠️ **El EFE no se toca funcionalmente.** Cambia de dónde importa dos símbolos;
su interruptor org-wide queda intacto. Cualquier cambio de conducta del EFE en
este change es una regresión, no una mejora — la task de Fase 2 lo verifica.

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
| `comprobantes/ports/comprobante-sistema-writer.port.ts` | Create | writer que re-valida + constantes `ORIGEN_TIPO_*` |
| `comprobantes/comprobante-sistema-writer.service.ts` | Create | implementación; reusa `repo.reemplazarComprobante` y los núcleos compartidos |
| `comprobantes/ports/comprobante.repository.port.ts` | Modify | `crearBorradorSistemaSiNoExiste` (alta idempotente por origen) + `eliminarBorradorSistema` |
| `comprobantes/domain/validacion-cuentas.ts` | Create | extract de las 3 copias |
| `comprobantes/comprobantes.service.ts` | Modify | consume el extract; expone `contabilizarEnTx`/`anularEnTx` (núcleos compartidos con el camino de sistema); `anular` rechaza origen comercial (REQ-CMP-VTA-04) |

> **La implementación es un SERVICIO, no un adapter** (ajustado 2026-07-29). El
> design la ubicaba en `adapters/`. Un adapter traduce hacia infraestructura, y
> esta pieza orquesta validación de dominio: resuelve el período, verifica las
> cuentas y aplica los invariantes de §4.1. La persistencia la delega en
> `ComprobanteRepositoryPort`, así que no tiene una línea de Prisma — que es
> justamente lo que la separa de un adapter.
>
> **No duplica el camino de usuario.** `contabilizarSistema` y `anularSistema`
> llaman a `ComprobantesService.contabilizarEnTx` / `.anularEnTx`, extraídos
> como refactor puro: las mismas secuencias que corre el contador, no copias.
> Ese fue el motivo de sumar los dos métodos a la tabla de arriba.
| `common/domain/efectivo.ts` | Create | `CODIGO_EFECTIVO_PREFIJO` + `esEfectivoPorCodigo` — la BASE compartida, no "el criterio" |
| `common/audited-transaction.runner.ts` | **Move** | desde `comprobantes/infrastructure/`; movimiento puro (ver decisión) |
| `comprobantes/infrastructure/` | **Delete** | el directorio queda vacío tras el movimiento; su barrel `index.ts` no lo importaba nadie |
| `comprobantes/comprobantes.module.ts` | Modify | cola del movimiento del runner |
| `reportes/domain/estado-flujo-efectivo.ts` | Modify | importa el prefijo de `common/`; **su interruptor org-wide NO se toca** |
| `items/`, `ventas/`, `cuentas-por-cobrar/` | Create | módulos hexagonales completos |
| `prisma/schema.prisma` | Modify | 6 modelos + `VENTA` en el enum + 2 campos en `OrgConfiguracionContable` + **`'VENTA'`/`'COBRO'` en el comentario-contrato de `origenTipo`** (B-13) |
| `prisma/migrations/` ×3 | Create | enum-only → tablas (+UNIQUE PARCIAL raw) → backfill data-only |
| `CLAUDE.md` §11.6 | Modify | sumar el UNIQUE PARCIAL de `Item.codigo` |
| `docs/claude/dominio-contable.md` §4.2 | Modify | fila `precioUnitario (18,6)` (B-7, §12.3) — **verificado 2026-07-29: la fila NO existe** |
| `frontend/src/components/nav-items.ts` | Modify | `NavSection += leadingGroups?: NavGroup[]` + grupo `comercial` (REQ-SB-15) |
| `frontend/src/components/nav-list.tsx` | Modify | renderizar `leadingGroups` ANTES de `items` — única línea de mecanismo nueva |
| `frontend/src/types/api.ts` | Modify | `VENTA` en `TipoComprobante` **e invertir su `satisfies`** para que la omisión rompa el build (ver abajo) |

> **`types/api.ts` no avisa hoy, y esa es la trampa.** `TipoComprobante` (línea
> 787) declara `as const satisfies Record<string, Schemas[…]['tipo']>`: la unión
> generada es el **VALOR**, así que el `satisfies` detecta un valor
> *equivocado* pero **NO** uno *faltante*. Olvidar `VENTA` ahí compila en verde.
> `PerfilExtracto` (línea 375) ya usa la forma correcta —la unión como
> **CLAVE**— justamente porque este repo se quemó con esto al sumar
> Fortaleza/BMSC. Este change invierte el de `TipoComprobante` y **valida por
> mutación** (sacar `VENTA` debe romper `tsc`). Sin eso, las 9 listas del
> frontend siguen siendo mecánicas y silenciosas; con eso, el compilador cubre
> la única que puede cubrir. El comentario de la línea 58 —que afirma que el
> `satisfies` "hace que `tsc` falle"— se corrige para decir *ante valores
> equivocados*, no ante omisiones.

## Interfaces / Contracts

```ts
export abstract class ComprobanteSistemaWriterPort {
  abstract crearBorradorSistema(d: CrearSistemaData, tx: Tx): Promise<{ id: string }>;
  /** Reemplazo en bloque §4.3: preserva cabecera, `id`, `numero` (§4.9) y `tipo`. */
  abstract regenerarLineasSistema(d: RegenerarSistemaData, tx: Tx): Promise<void>;
  abstract contabilizarSistema(id: string, tenantId: string, tx: Tx): Promise<{ numero: string }>;
  abstract anularSistema(d: AnularSistemaData, tx: Tx): Promise<void>;
  abstract eliminarBorradorSistema(id: string, tenantId: string, tx: Tx): Promise<void>;
}
```

> **Ajustado 2026-07-29 al implementar la task 2.7.** Tres cambios sobre la
> firma que este design traía, los tres para quitarle al caller maneras de
> quedar mal:
>
> 1. **`tx` pasa de opcional a REQUERIDO** en los cinco métodos. La venta y su
>    comprobante tienen que mutar en una sola TX, y los triggers de
>    `comprobantes_audit` leen el actor de `app.audit_user_id`, que inyecta
>    `AuditedTransactionRunner` al abrirla (§4.3). Con `tx?`, escribir fuera de
>    la transacción compila y graba la fila de auditoría **sin actor**: una
>    pérdida silenciosa. Requerido, no se puede escribir por accidente.
> 2. **`CrearSistemaData` y `RegenerarSistemaData` NO llevan `periodoFiscalId`**:
>    el writer lo resuelve desde `fechaContable`. Recibir los dos permite que no
>    coincidan, y un comprobante archivado en un período que no le corresponde
>    descuadra los reportes de ese mes sin que nada falle en el momento.
> 3. **`regenerarLineasSistema` no recibe `tipo`**: lo preserva del comprobante
>    existente, igual que el `id` y el `numero`.

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

## Architecture Decisions (continuación)

> Las tres decisiones que siguen estaban archivadas bajo *Migration / Rollout*,
> donde nadie las busca — «el redondeo es HALF-UP» no es una decisión de
> despliegue. Reagrupadas el 2026-07-29; el contenido no cambió.

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

### Decisión: elegibilidad de efectivo = marca explícita ∪ prefijo (por cuenta)

**Choice** (Marco, 2026-07-28): una cuenta es elegible como destino de cobro
⇔ `activa` ∧ `esDetalle` ∧ (`actividadFlujo = 'EFECTIVO'` **o** código bajo
`1.1.1`). Unión **por cuenta** — NO el interruptor de organización del EFE.

**Rationale**: son dos preguntas distintas. *"¿es efectivo y equivalente para
el flujo de caja?"* es de presentación; *"¿puede entrar plata acá?"* es
operativa. Una cuenta que el admin excluyó de su EFE sigue siendo un lugar
legítimo donde se recibe un cobro. El interruptor org-wide las fuerza a ser la
misma y produce el efecto de que marcar una cuenta **saque otra** del selector
— con `1.1.1.001 CAJA` como default, eso es romper la operación desde un
reporte.

**La configuración explícita ya existe y esta regla la aprovecha**: el `<Select>`
"Actividad de flujo de efectivo" de `/plan-cuentas` (modo edición) escribe
`Cuenta.actividadFlujo`. Con la unión, marcar `EFECTIVO` **agrega** la cuenta al
conjunto elegible, y las `1.1.1.*` siguen valiendo sin configurar nada — el
mismo Enfoque C del EFE (explícito gana, heurística de fallback), que hace que
funcione desde el día uno. Hoy las 110 cuentas están en `null`, así que no hay
migración.

**Deuda que abre, nombrada**: (1) el `hint` de ese Select dice que clasifica
"para el Estado de Flujo de Efectivo (NIC 7)" — si el campo además habilita
cuentas de cobro, el texto miente por omisión y **debe actualizarse en este
change**; (2) la unión no permite EXCLUIR una `1.1.1.*` de la elegibilidad. Si
algún día hace falta, va un campo propio, no un tercer significado encima de
`actividadFlujo`. No va en `OrgConfiguracionContable`: ese mapa es 1:1
(concepto → una cuenta) y acá el conjunto es de N cuentas.

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

## Migration / Rollout

Tres migraciones (D-22). La de tablas **no puede contener el literal
`'VENTA'`** (Postgres pre-COMMIT, R-6). Protocolo §11.6 **obligatorio**: grep
`^DROP (INDEX|EXTENSION|TYPE)` y rescate a mano — los `contactos_*_trgm_idx`
caen siempre. Aditivas salvo el backfill, que sí toca datos (idempotente).

Además, la migración de tablas lleva **escrito a mano** el UNIQUE PARCIAL de
`Item.codigo` (D-24), que entra a la tabla de objetos raw vivos de §11.6 desde
el día uno: cada regeneración futura tiene un objeto más que rescatar.

## Open Questions

**Ninguna.** Las tres que este design levantó están cerradas, más una cuarta que
apareció al auditarlo. El registro de checkboxes venía mintiendo —cuatro sin
tildar, **dos rotuladas BLOQUEANTE**, sobre temas que el propio documento
resolvía tres párrafos más arriba— y se saneó el 2026-07-29.

| # | Pregunta | Estado | Dónde se resolvió |
|---|---|---|---|
| 1 | `Money` sin API de redondeo; ¿half-up o half-even? | ✅ **half-up**, medido en las 3 capas | Decisión «el redondeo es HALF-UP…». `Money.redondearABob()` **ya existe en `main`** (#294) |
| 2 | El estado `BLOQUEADO` no aparece en ninguna spec | ✅ cartera = `estado IN (CONTABILIZADO, BLOQUEADO) AND anulado = false` | Decisión «la cartera se deriva de `anulado` + saldo». Texto de REQ-VTA-01 y REQ-CXC-01 **ya corregido** (#296) |
| 3 | El criterio de efectivo de la spec no es el del EFE | ✅ **unión POR CUENTA** (Marco, 2026-07-28) | Decisiones «elegibilidad de efectivo…» y «a `common/` va el PREFIJO, no el criterio» |
| 4 | *(detectada 2026-07-29)* Ventas no puede alcanzar `auditedTx.run` sin violar §3.3 | ✅ el runner sube a `common/` | Decisión «`AuditedTransactionRunner` sube a `common/`» |

Cerrada por Marco el 2026-07-29, fuera de este documento: **REQ-SB-15 exigía
renderizar un grupo ANTES de los ítems sueltos, y el contrato de `NavSection` no
lo permite** (`items` va arriba de `groups`, por tipo y por `NavList`). Va campo
`leadingGroups?: NavGroup[]` — ver el delta de `frontend-sidebar-nav`.

### Contexto histórico (por qué cada una era un problema real)

Se conserva porque explica decisiones que sin él se leen como arbitrarias.

**(1) Redondeo.** REQ-VTA-03 citaba "la política central de `Money` (Anti-04;
Anti-07: `toDecimalPlaces(2)` half-even como `Money.toBob`)" — **nada de eso
existía**: una cadena de tres documentos describiendo una API inventada.
`toBob()` usa `toFixed(2)` (half-up), `mul()` no redondea, y sin método propio
el redondeo lo terminaba haciendo **Postgres al insertar**, fuera del dominio
(Anti-04 en su peor forma). El escenario que traía la spec (`31.515 → 31.52`)
daba lo mismo con ambas políticas: **habría pasado en verde con la equivocada**.

**(2) `BLOQUEADO`.** Cerrar un período ejecuta `bloquearPorPeriodo`
(`prisma-comprobantes-lock.adapter.ts:23`) y pasa **todos** los comprobantes del
período de CONTABILIZADO a BLOQUEADO en masa — rutina mensual, no caso de borde.
Leído literal, el "sólo ventas CONTABILIZADAS" de REQ-CXC-01 **vaciaba el estado
de cuenta de cada cliente el día del cierre**, con las deudas intactas.

**(3) Efectivo — el contexto completo, que sigue siendo la mejor defensa de la
decisión.**

<details>
<summary>Texto original de la pregunta</summary>

**BLOQUEANTE — el criterio de efectivo de la spec NO es el del EFE.**
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

  | | A — alinear al EFE (interruptor de org) | **B — por cuenta (unión)** ← ELEGIDA |
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

</details>

**Lo que hace peligrosa a (3), y por lo que la spec tiene que decir EXACTO lo
que el código va a hacer**: con las 110 cuentas en `null`, A y B dan **hoy el
mismo resultado**. La divergencia no se manifiesta en el piloto — nace el día
que alguien marque una cuenta desde `/plan-cuentas`, o sea en producción y
lejos de este change. Un test escrito contra el texto viejo ("**o en su
defecto**") pasaría en verde igual, exactamente como el escenario de redondeo
de (1).
