# Tasks: Ventas y Cuentas por Cobrar — piloto

TDD estricto (RED → GREEN). 1 task = 1 commit; cierra con `tsc` + suite del subsistema en verde.

> **Revisado 2026-07-29** tras auditar los 6 artefactos entre sí y contra el
> código de `main`. El desglose anterior tenía **un requisito entero sin ninguna
> task** (REQ-CXC-06) y cuatro obligaciones declaradas en design/spec que no
> aparecían acá. Registro completo de cambios al final del archivo.

## Fase 1 — Schema y migraciones

- [ ] 1.1 Migración **enum-only** a mano: `ADD VALUE 'VENTA'`. Ningún otro literal `'VENTA'`.
- [ ] 1.2 `schema.prisma`: los **6** modelos del design (`Item`, `Venta`, `LineaVenta`, `Cobro`, `AplicacionCobro`, `AplicacionCobroDesvinculada`) con `organizationId` no nulo; 2 campos en `OrgConfiguracionContable`; FK `Item.cuentaIngresoId` `onDelete: Restrict`.
- [ ] 1.3 `schema.prisma`: sumar `'VENTA'` y `'COBRO'` a los **valores vivos** del comentario-contrato de `origenTipo` (líneas 714-721). Es enumerativo — sin esto miente por omisión (B-13).
- [ ] 1.4 Generar migración de tablas. **§11.6**: grep `^DROP (INDEX|EXTENSION|TYPE)` y rescatar los objetos raw a mano (los `contactos_*_trgm_idx` caen SIEMPRE).
- [ ] 1.5 UNIQUE PARCIAL raw de `Item.codigo` al final de esa migración + fila nueva en `CLAUDE.md` §11.6.
- [ ] 1.6 Migración **data-only** idempotente: `VENTA` donde ya hay `INGRESO`.
- [ ] 1.7 `seed/tipos-universales.ts`: `VENTA` en los 4 tipos que hoy llevan `INGRESO` — `factura-emitida`, `nota-debito-emitida`, `recibo-ingreso`, `comprobante-interno` (verificado).
- [ ] 1.8 Seed comercial: `1.1.2.001` y `4.1.1.001` a `esRequeridaSistema` + `MAPEO_CODIGO_A_CONCEPTO` (**8 → 10**); `CONCEPTO_FIELDS` en `prisma-cuenta.repository.ts` (**12 → 14**). Actualizar la guarda de regresión del seed, que fija 8.
- [ ] 1.9 RBAC: declarar `items.*`/`cobros.*`, sacar las 6 `ventas.*` de `DECLARADOS_SIN_ENDPOINT`, espejo `frontend/src/lib/permissions.ts`, `CONTADOR_PERMISSIONS`.
- [ ] 1.10 Cola del enum en **backend**: `PREFIJO_POR_TIPO` (`comprobantes/domain/numeracion.ts`), `common/domain/enums.ts`, `enum-mappers.ts`. El compilador los exige.
- [ ] 1.11 `docs/claude/dominio-contable.md` §4.2: agregar la fila `precioUnitario → @db.Decimal(18,6)` a la tabla de decimales. **Verificado 2026-07-29: la fila NO existe.** Va por §12.3 — la regla se fija en el core doc, no se improvisa en la spec.

## Fase 2 — Núcleo compartido

- [x] 2.1 Mover `AuditedTransactionRunner` a `common/audited-transaction.runner.ts`. Movimiento **puro** (su única dependencia es `PrismaService`); ajustar `comprobantes/infrastructure/index.ts` y `comprobantes.module.ts`. **Bloquea la Fase 4**: hoy el runner vive en `comprobantes/infrastructure/` y §3.3 impide que Ventas lo alcance.
- [x] 2.2 RED/GREEN `common/domain/efectivo.ts`: `CODIGO_EFECTIVO_PREFIJO` + `esEfectivoPorCodigo(cuenta)`. Solo la BASE compartida — el criterio completo NO vive acá.
- [x] 2.3 `reportes/domain/estado-flujo-efectivo.ts` importa prefijo y predicado de `common/`. **Su interruptor org-wide se queda donde está**: correr la regresión de EEFF: cualquier cambio de conducta del EFE es un bug de este change, no una mejora.
- [ ] 2.4 RED/GREEN `CuentasEfectivoReaderPort.esElegibleComoDestino`: `activa ∧ esDetalle ∧ (actividadFlujo = 'EFECTIVO' **∪** prefijo 1.1.1)`. **El test tiene que DISCRIMINAR unión de fallback**: cuenta bajo `1.1.1` marcada `OPERACION` → **sigue elegible**; cuenta fuera del prefijo marcada `EFECTIVO` → elegible. Sin ese par, una implementación con "en su defecto" pasa en verde. Adapter + wiring en `cuentas`.
- [ ] 2.5 Extraer `validarLineasContraCuentas` a `comprobantes/domain/`; consumirla en sus 3 call sites (`contabilizar:454`, `editarContabilizado:703`, `resolverYValidarBorrador:1286`). Es **anti-duplicación**: `requiereContacto` ya está en dos de ellos desde #294 — el extract unifica, no tapa un agujero.
- [ ] 2.6 Extraer `ESTADOS_CONCILIABLES` a un lugar único; consumirlo en sus 2 call sites (`prisma-lineas-cuenta-reader.adapter.ts:17` y `match-conciliacion.service.ts:34`).
- [ ] 2.7 RED/GREEN `ComprobanteSistemaWriterPort` + adapter (5 métodos del design). Preserva `id`/`numero`; **todos re-validan**.
- [ ] 2.8 `comprobantes.service.anular` → 409 `COMPROBANTE_ANULACION_DESDE_ORIGEN` si el origen es comercial.
- [ ] 2.9 Constantes `ORIGEN_TIPO_VENTA` / `ORIGEN_TIPO_COBRO` (molde ya existente: `CierreOrigenTipo`).

## Fase 3 — `items`

- [ ] 3.1 RED/GREEN dominio: normalizar `codigo` (trim → null, `toUpperCase`).
- [ ] 3.2 Repositorio + `ItemsReaderPort` (`obtenerBatch → {id, activo}`) + `ITEM_CODIGO_DUPLICADO`.
- [ ] 3.3 Service, controller, DTOs, módulo. `@RequireModule('contabilidad')`, decoradores con literales string.
- [ ] 3.4 Guard `CUENTA_REFERENCIADA_POR_ITEMS` al desactivar una cuenta.

## Fase 4 — `ventas`

- [ ] 4.1 RED/GREEN dominio: `subtotal = mul().redondearABob()`, `montoTotal = Σ subtotales`. Casos `5 × 6.305` y `3 × 10.005` (los que discriminan half-up de half-even).
- [ ] 4.2 RED/GREEN builder del asiento: CONTADO vs CREDITO, `contactoId` en la línea CxC, tri-valor BOB.
- [ ] 4.3 Repositorio + puertos consumidos.
- [ ] 4.4 Service: borrador + comprobante en la misma TX (`auditedTx.run`, ya en `common/` por 2.1), upsert por origen.
- [ ] 4.5 Service: contabilizar (serie `V`), editar post-CONTABILIZADO, recorte LIFO.
- [ ] 4.6 Service: **cambiar el contacto desvincula TODAS las aplicaciones** de la venta (REQ-VTA-06, matriz fila 6) y registra cada una en `AplicacionCobroDesvinculada`. Sin esto queda un cobro del cliente A aplicado a una venta del cliente B.
- [ ] 4.7 Service: anular → desvincula, registra en `AplicacionCobroDesvinculada`, aplica §4.7 (motivo ≥ 10 caracteres).
- [ ] 4.8 Period lock (REQ-VTA-09): crear, contabilizar, editar y anular rechazan si el período de `fechaContable` no está `ABIERTO`. **Sin bypass de admin.** Ojo con el vocabulario: `PeriodoFiscalStatus` es `ABIERTO | CERRADO` — **no existe** un período `BLOQUEADO`.
- [ ] 4.9 Controller, DTOs, módulo.

## Fase 5 — `cuentas-por-cobrar`

- [ ] 5.1 RED/GREEN dominio: saldo, estado comercial, `VENCIDA` vía `ClockPort.currentDateLaPaz()`, orden FIFO.
- [ ] 5.2 RED/GREEN sobre-aplicación: `SUM()` intra-TX bajo `FOR UPDATE`, más validación pre-TX.
- [ ] 5.3 Cobro: service + asiento `INGRESO` con `origenTipo = 'COBRO'`, cuenta destino validada contra 2.4.
- [ ] 5.4 Aplicaciones: CRUD sin asiento, mismo contacto, **fuera** del period lock.
- [ ] 5.5 **Cobro — editar el monto (REQ-CXC-06, matriz filas 7 y 8)**: subir **resuelve** (el excedente colapsa a saldo a favor); bajar por debajo de lo aplicado **rechaza** con 422 `COBRO_MONTO_INFERIOR_APLICADO` indicando cuánto hay que desaplicar. NO se recorta solo: el reparto es entre ventas distinguibles y el sistema no elige.
- [ ] 5.6 **Cobro — anular (REQ-CXC-06, matriz fila 9)**: §4.7 con motivo, elimina sus `AplicacionCobro`, **registra cada una en `AplicacionCobroDesvinculada`** (mismo trato que la venta, B-14), y las ventas vuelven a quedar pendientes por derivación pura. Anular un cobro ya depositado vía traspaso **procede** (D-13: sin guard de saldo de Caja).
- [ ] 5.7 **Cobro — cambiar `contactoId` (REQ-CXC-06, matriz fila 12)**: desvincula TODAS las aplicaciones, con el mismo rastro que 5.6.
- [ ] 5.8 Period lock sobre el **cobro** (REQ-CXC-09): crear, editar y anular rechazan fuera de período abierto. Las **aplicaciones** quedan explícitamente EXENTAS (no son hechos contables) — test de que aplicar contra un cobro de período cerrado procede.
- [ ] 5.9 Estado de cuenta por cliente (cartera = `estado IN (CONTABILIZADO, BLOQUEADO) AND anulado = false`, saldo > 0).
- [ ] 5.10 Controllers, DTOs, módulo.

## Fase 6 — Frontend

- [ ] 6.1 Regenerar `openapi.json` + `api.generated.ts` + alias. Verde `contract-drift`.
- [ ] 6.2 `types/api.ts`: sumar `VENTA` a `TipoComprobante` **e invertir su `satisfies`** a `Record<Schemas[…]['tipo'], string>` (la unión como CLAVE, como ya hace `PerfilExtracto`). Hoy usa `Record<string, …>` y **la omisión compila en verde**. Corregir además el comentario de la línea 58, que afirma que el `satisfies` "hace que `tsc` falle" — cierto ante valores equivocados, falso ante faltantes. **Validar por mutación**: sacar `VENTA` debe romper `tsc`.
- [ ] 6.3 Cola del enum en frontend: las **9 listas** hardcodeadas (`comprobantes-filters`, `comprobante-cabecera-form`, `comprobante-detail-page` en `components/`, `crear-comprobante-schema`, `editar-comprobante-schema`, `exportar-libro-diario-pdf`, `tipo-documento-fisico-form-schema`, `build-tipos-documento-fisico-params`, `types/api.ts`).
- [ ] 6.4 `features/items/`: listado y form.
- [ ] 6.5 `features/ventas/`: listado y alta/edición, dos acciones, cero confirmaciones.
- [ ] 6.6 `features/cobros/`: *Receive Payment* con auto-tilde FIFO overrideable sobre el orden que publica el backend.
- [ ] 6.7 Estado de cuenta por cliente.
- [ ] 6.8 `NavSection += leadingGroups?: NavGroup[]` + `nav-list.tsx` renderiza `leadingGroups` ANTES de `items` (REQ-SB-16). Test de que las 4 secciones que no lo declaran quedan idénticas.
- [ ] 6.9 Grupo `comercial` en `leadingGroups` de Contabilidad (`ShoppingCart`) + rutas gateadas con `RequirePermission`.
- [ ] 6.10 Hint del `<Select>` "Actividad de flujo de efectivo" de `/plan-cuentas`: sumar que el campo **también habilita cuentas como destino de cobro**. Hoy dice solo "para el Estado de Flujo de Efectivo (NIC 7)" y con este change miente por omisión.

## Fase 7 — Verificación

- [ ] 7.1 E2E: venta CONTADO y CREDITO → asiento con número propio de la serie `V`.
- [ ] 7.2 E2E: re-imputar un cobro deja su comprobante **byte-idéntico** (criterio 4).
- [ ] 7.3 E2E: anular desde comprobantes → 409; desde ventas → procede (criterio 5).
- [ ] 7.4 E2E: cerrar el período NO saca la venta del estado de cuenta (el comprobante pasa a `BLOQUEADO` y la cartera no se mueve).
- [ ] 7.5 E2E: los cobros a Caja General **NO** aparecen entre los movimientos conciliables de la cuenta banco; el `TRASPASO` manual sí (criterio 7 — es el que prueba que Ventas no contaminó el pack de conciliación).
- [ ] 7.6 E2E: dos ítems sin código conviven; dos con el mismo código chocan por el guard de servicio **y** por el constraint parcial (criterio 10).
- [ ] 7.7 Regresión obligatoria: `catalogo-vs-controllers.spec.ts` (3 puntas), `catalogo-vs-espejo-frontend.spec.ts`, y la suite de EEFF sin cambios de conducta (por 2.3).
- [ ] 7.8 Suite completa + `tsc` + `lint` + `gate:ui` + `gate:tap`.
- [ ] 7.9 Checklist §7 de `frontend/CLAUDE.md`; lo que no se verificó va **sin tildar** y nombrado en el PR.

---

## Registro de correcciones (2026-07-29)

Qué cambió respecto del desglose mergeado en el #298, y por qué.

| Cambio | Origen |
|---|---|
| **Fase 5: +5.5, +5.6, +5.7** | **REQ-CXC-06 completo no tenía ninguna task.** Faltaban editar el monto del cobro (con `COBRO_MONTO_INFERIOR_APLICADO`, 1 de los 6 error codes de CxC), anular el cobro y cambiar su contacto |
| **+4.6** | REQ-VTA-06 exige que cambiar el contacto desvincule TODAS las aplicaciones (matriz fila 6); no estaba |
| **+1.11** | El design lo lista en *File Changes* y REQ-VTA-03 lo declara obligatorio "en este mismo change por §12.3". Verificado: la fila `precioUnitario` NO está en la tabla de `dominio-contable.md` §4.2 |
| **+2.1** | El design daba por resuelto el "todo en una TX vía `auditedTx.run`", pero `ComprobantesModule` no exporta el runner y §3.3 impide importarlo. Decisión nueva: sube a `common/` |
| **+1.3** | La actualización del comentario-contrato de `origenTipo` (B-13) no tenía task propia |
| **+4.8, +5.8** | Period lock (REQ-VTA-09 / REQ-CXC-09) no tenía task, incluido el caso de que las aplicaciones quedan EXENTAS |
| **+6.2** | `types/api.ts` usa el `satisfies` en la dirección débil: olvidar `VENTA` **compila en verde**. `PerfilExtracto` ya usa la correcta tras haberse quemado con esto |
| **+6.8** | REQ-SB-15 pedía un orden que el contrato de `NavSection` no admite. Marco cerró: campo `leadingGroups` (REQ-SB-16) |
| **+6.10** | El design nombra el hint del Select de `/plan-cuentas` como deuda "que debe actualizarse en este change"; no tenía task |
| **+7.5, +7.6** | Criterios de éxito 7 y 10 sin cobertura e2e |
| **2.4 reescrita** | El test tiene que **discriminar unión de fallback**, o pasa en verde con la regla equivocada — el mismo defecto que tenía el escenario de redondeo |
| **2.3 reescrita** | Explicitar que el interruptor org-wide del EFE **no se toca**: la divergencia con Ventas es deliberada |
| **2.5 reescrita** | El hueco de `requiereContacto` ya lo cerró #294; el extract queda por anti-duplicación |
| Números de línea | `contabilizar` 451→454, `editarContabilizado` 702→703, `resolverYValidarBorrador` 1277→1286 (drift de #294) |
| 6.3 | Se conserva el "9 listas" —**verificado exacto**— con los archivos enumerados para que no se busque en el lugar equivocado |
