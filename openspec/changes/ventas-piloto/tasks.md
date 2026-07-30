# Tasks: Ventas y Cuentas por Cobrar — piloto

TDD estricto (RED → GREEN). 1 task = 1 commit; cierra con `tsc` + suite del subsistema en verde.

> **Revisado 2026-07-29** tras auditar los 6 artefactos entre sí y contra el
> código de `main`. El desglose anterior tenía **un requisito entero sin ninguna
> task** (REQ-CXC-06) y cuatro obligaciones declaradas en design/spec que no
> aparecían acá. Registro completo de cambios al final del archivo.

## Fase 1 — Schema y migraciones

- [x] 1.1 Migración **enum-only** a mano: `ADD VALUE 'VENTA'`. Ningún otro literal `'VENTA'`. Va junto con 1.10 en un commit: sin la cola del compilador el árbol no compila, así que separarlas dejaba un commit rojo.
- [x] 1.2 `schema.prisma`: los **6** modelos del design (`Item`, `Venta`, `LineaVenta`, `Cobro`, `AplicacionCobro`, `AplicacionCobroDesvinculada`) con `organizationId` no nulo; 2 campos en `OrgConfiguracionContable`; FK `Item.cuentaIngresoId` `onDelete: Restrict`.
- [x] 1.3 `schema.prisma`: sumar `'VENTA'` y `'COBRO'` a los **valores vivos** del comentario-contrato de `origenTipo` (líneas 714-721). Es enumerativo — sin esto miente por omisión (B-13).
- [x] 1.4 Generar migración de tablas. **§11.6**: se activó — `migrate diff` proponía **4** sentencias destructivas (los 2 `contactos_*_trgm_idx`, `DROP TABLE comprobantes_audit` con sus 2 triggers, y un `DROP DEFAULT` incidental preexistente en `adjuntos_comprobante`); las 4 recortadas y justificadas en la cabecera del `.sql`. Verificado post-apply que los 5 objetos raw siguen vivos. Nota: `migrate dev` no se pudo usar —una migración vieja tiene checksum local desincronizado y exige `reset`—, así que el SQL salió de `migrate diff`, que no toca la BD.
- [x] 1.5 UNIQUE PARCIAL raw de `Item.codigo` al final de esa migración + fila nueva en `CLAUDE.md` §11.6. Verificado **por comportamiento** (no por la definición del índice): dos ítems sin código conviven, el código repetido rebota.
- [x] 1.6 Migración **data-only** idempotente: `VENTA` donde ya hay `INGRESO`. Filtra por "los que hoy admiten INGRESO" y **no** por código, porque el catálogo es editable per-tenant. Verificada con filas sintéticas en estado viejo: `UPDATE 2` la primera corrida, `UPDATE 0` la segunda.
- [x] 1.7 `seed/tipos-universales.ts`: `VENTA` en los 4 tipos que hoy llevan `INGRESO` — `factura-emitida`, `nota-debito-emitida`, `recibo-ingreso`, `comprobante-interno` (verificado).
- [x] 1.8 Seed comercial: `1.1.2.001` y `4.1.1.001` a `esRequeridaSistema` + `MAPEO_CODIGO_A_CONCEPTO` (**8 → 10**); `CONCEPTO_FIELDS` en `prisma-cuenta.repository.ts` (**12 → 14**). La guarda que fija 8 estaba en **`comercial.integration.spec.ts`** (dos aserciones) más el conteo de `prisma-plan-cuentas-seeder.adapter.integration.spec.ts`; la de `codigo-a-concepto.spec.ts` ya era derivada. **Extra**: se agregó `concepto-fields.spec.ts` — `CONCEPTO_FIELDS` era una lista manual sin nada que la atara al schema y **verificado por mutación** sacar `ventasId` pasaba las 10 suites de `cuentas` en verde (el spec del service mockea `conceptosQueUsanCuenta`). Ahora la lista esperada se deriva del DMMF.
- [x] 1.9 RBAC: declarar `items.*`/`cobros.*`, espejo `frontend/src/lib/permissions.ts`, `CONTADOR_PERMISSIONS`. **Corrección**: las 6 `ventas.*` NO salen de `DECLARADOS_SIN_ENDPOINT` acá — la aserción es igualdad exacta en las dos direcciones y REQ-VTA-11 dice "al montar los controllers", que es la Fase 4. Sacarlas ahora rompe el build. Por lo mismo, los 10 permisos nuevos ENTRAN a esa lista hasta las fases 3 y 5. Además el template Contador recibió `ventas.post`/`ventas.void`, que le faltaban desde siempre (tenía sólo el CRUD y D-23 pide los 6 verbos).
- [x] 1.10 Cola del enum en **backend**: `PREFIJO_POR_TIPO` (`comprobantes/domain/numeracion.ts`), `common/domain/enums.ts`, `enum-mappers.ts`. El compilador los exige.
- [x] 1.11 `docs/claude/dominio-contable.md` §4.2: agregar la fila `precioUnitario → @db.Decimal(18,6)` a la tabla de decimales. **Verificado 2026-07-29: la fila NO existe.** Va por §12.3 — la regla se fija en el core doc, no se improvisa en la spec.

## Fase 2 — Núcleo compartido

- [x] 2.1 Mover `AuditedTransactionRunner` a `common/audited-transaction.runner.ts`. Movimiento **puro** (su única dependencia es `PrismaService`); ajustar `comprobantes/infrastructure/index.ts` y `comprobantes.module.ts`. **Bloquea la Fase 4**: hoy el runner vive en `comprobantes/infrastructure/` y §3.3 impide que Ventas lo alcance.
- [x] 2.2 RED/GREEN `common/domain/efectivo.ts`: `CODIGO_EFECTIVO_PREFIJO` + `esEfectivoPorCodigo(cuenta)`. Solo la BASE compartida — el criterio completo NO vive acá.
- [x] 2.3 `reportes/domain/estado-flujo-efectivo.ts` importa prefijo y predicado de `common/`. **Su interruptor org-wide se queda donde está**: correr la regresión de EEFF: cualquier cambio de conducta del EFE es un bug de este change, no una mejora.
- [x] 2.4 RED/GREEN `CuentasEfectivoReaderPort.esElegibleComoDestino`: `activa ∧ esDetalle ∧ (actividadFlujo = 'EFECTIVO' **∪** prefijo 1.1.1)`. **El test tiene que DISCRIMINAR unión de fallback**: cuenta bajo `1.1.1` marcada `OPERACION` → **sigue elegible**; cuenta fuera del prefijo marcada `EFECTIVO` → elegible. Sin ese par, una implementación con "en su defecto" pasa en verde. Adapter + wiring en `cuentas`.
- [x] 2.5 Extraer `validarLineasContraCuentas` a `comprobantes/domain/`; consumirla en sus 3 call sites (`contabilizar:454`, `editarContabilizado:703`, `resolverYValidarBorrador:1286`). Es **anti-duplicación**: `requiereContacto` ya está en dos de ellos desde #294 — el extract unifica, no tapa un agujero.
- [x] 2.6 Extraer `ESTADOS_CONCILIABLES` a un lugar único; consumirlo en sus 2 call sites (`prisma-lineas-cuenta-reader.adapter.ts:17` y `match-conciliacion.service.ts:34`).
- [x] 2.7 RED/GREEN `ComprobanteSistemaWriterPort` + implementación (5 métodos). Preserva `id`/`numero`; **todos re-validan**. La implementación quedó como **servicio** (`comprobante-sistema-writer.service.ts`), no como adapter: orquesta validación de dominio y delega la persistencia en el repo port, así que no toca Prisma. `contabilizarSistema`/`anularSistema` reusan los núcleos `contabilizarEnTx`/`anularEnTx` extraídos de `ComprobantesService` (refactor puro) en vez de repetir las secuencias. El port cambió tres cosas frente al design —`tx` requerido, sin `periodoFiscalId`, sin `tipo` en regenerar—, todas documentadas ahí.
- [x] 2.8 `comprobantes.service.anular` → 409 `COMPROBANTE_ANULACION_DESDE_ORIGEN` si el origen es comercial. La guarda mira el ORIGEN y no `generadoPorSistema`, para no atrapar a los asientos de cierre (que tienen su propia regla); vive sólo en la operación de usuario, no en `anularEnTx`.
- [x] 2.9 Constantes `ORIGEN_TIPO_VENTA` / `ORIGEN_TIPO_COBRO` en el archivo del port (molde: `CierreOrigenTipo`), junto con `esOrigenComercial` y `nombreDeOrigenComercial` — el consumidor real necesita los predicados, no los literales.

## Fase 3 — `items`

- [x] 3.1 RED/GREEN dominio: normalizar `codigo` (trim → null, `toUpperCase`). 100% cobertura; 4 mutantes verificados (sin uppercase, vacío→`''`, uppercase en `normalizarOpcional`, normalizar de más sacando guiones). Se sumó `normalizarOpcional` para `unidadMedida`, que SÍ conserva el case.
- [x] 3.2 Repositorio + `ItemsReaderPort` (`obtenerBatch → {id, activo}`) + `ITEM_CODIGO_DUPLICADO`. 41 tests de integración contra Postgres. El test del port assertea las **claves** del objeto, no los valores, para que sumar un campo al `select` rompa. `findByCodigo(null)` no consulta: devolver "el primer ítem sin código" haría que el guard rechazara toda alta sin código a partir de la segunda. Sin borrado físico (REQ-ITM-01).
- [x] 3.3 Service, controller, DTOs, módulo. `@RequireModule('contabilidad')`, decoradores con literales string. Las 4 `contabilidad.items.*` **salen** de `DECLARADOS_SIN_ENDPOINT` acá (la Fase 1 las había metido). `DELETE` = desactivar, y devuelve el ítem para que el cliente vea `activo: false` sin re-consultar. **Error nuevo, fuera de la tabla de la spec**: `ITEM_CUENTA_INGRESO_INVALIDA` — sin validar `cuentaIngresoId` contra el tenant, la FK aceptaría el id de otra organización (§4.2, bug de seguridad), y la venta explotaría mucho después al generar el asiento. El guard de unicidad excluye el ítem propio.
- [x] 3.4 Guard `CUENTA_REFERENCIADA_POR_ITEMS` al desactivar una cuenta. Vive en el repositorio de `cuentas` (`itemsActivosQueUsanCuenta`), que lee la tabla de `items` — mismo patrón que `contactos.countLineasReferenciadoras` leyendo `lineas_comprobante`: responder "¿quién me referencia?" es del dueño del recurso protegido, y así `ItemsReaderPort` no crece (REQ-ITM-04). `details` lleva la LISTA, no un conteo. Mira sólo los ítems ACTIVOS: uno desactivado no genera ventas nuevas, así que bloquear por él sería un bloqueo sin causa. Filtro probado en integración (un mock devuelve lo que se le diga); 3 mutantes mueren.

## Fase 4 — `ventas`

- [x] 4.1 RED/GREEN dominio: `subtotal = mul().redondearABob()`, `montoTotal = Σ subtotales`. Casos `5 × 6.305` y `3 × 10.005` (los que discriminan half-up de half-even). **Hallazgo**: asertear el monto vía `toBob()` NO prueba que se redondeó — `toFixed(2)` también es half-up, así que un `31.525` crudo se imprime `"31.53"` igual y el test pasaría en verde con el bug puesto. Los asertos van contra `toString()` (valor interno del Decimal). 10 tests, 100% cobertura, 2 mutantes.
- [x] 4.2 RED/GREEN builder del asiento: CONTADO vs CREDITO, `contactoId` en la línea CxC, tri-valor BOB. Unión discriminada: una venta CONTADO **no puede ni nombrar** la cuenta CxC → D-04 garantizado por construcción (el mutante "CONTADO debita CxC" NO COMPILA, no falla un test). SKIP-on-zero como el cierre (ítem bonificado queda en el documento sin emitir línea contable; todas en cero → `VENTA_ASIENTO_SIN_MONTO`). **Decisión**: un haber POR CADA línea de venta, sin agregar por cuenta — agregar le quita al contador el desglose en el Mayor. **Decisión + trampa para la Fase 5**: la línea de débito lleva `contactoId` también en CONTADO (el writer nunca lo prohíbe y el Mayor de Caja documenta quién pagó) ⇒ el estado de cuenta DEBE filtrar por la cuenta CxC y no sólo por `contactoId`, o las ventas al contado se cuelan en la cartera (REQ-VTA-04 lo prohíbe). Hoy ningún consumidor filtra así (verificado). **3 errores fuera de la tabla de la spec** — `VENTA_ASIENTO_DESCUADRADO` (500), `VENTA_ASIENTO_SIN_MONTO` (422), `VENTA_LINEA_SUBTOTAL_NEGATIVO` (500): deben entrar a la spec antes de archivar. 13 tests, 100% cobertura, 8 mutantes.
- [x] 4.3 Repositorio + puertos consumidos. La venta NO espeja el estado del comprobante (REQ-VTA-01): se lee vía `obtenerComprobantesDeVentas`; la cartera usa `ESTADOS_CONCILIABLES` + `anulado = false`. **Dos mutantes SOBREVIVIERON** y obligaron a endurecer los tests: (1) quitar el filtro por `organizationId` de la query de ventas de la cartera sobrevivía porque la query de comprobantes, que sí estaba scopeada, **enmascaraba el leak** — se mata fabricando la colisión de `origenId` entre dos tenants; (2) quitar el scope del update sobrevivía porque `rejects.toThrow()` pasaba por `P2002` (colisión de `orden`) en vez de `P2025` — la aserción ahora exige el código exacto, y de paso devolver `P2002` a una venta ajena le confirma al atacante que existe (Anti-31). Lección: con defense in depth, el mutante de UNA capa puede quedar invisible detrás de otra. 28 tests de integración, 9 mutantes. **Dos huecos reportados, no improvisados** → resueltos en 4.4: no existe port de config para `cuentasPorCobrarId`/`ventasId` (va `VentasConfigReaderPort`, molde `CierreConfigReaderPort`), y ningún port expone `Item.cuentaIngresoId` mientras REQ-ITM-04 prohíbe que `ItemsReaderPort` crezca (va read-surface propia por proyección Prisma, el patrón que sancionó la Fase 3).
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

- [x] 6.1 Regenerar `openapi.json` + `api.generated.ts` + alias. Verde `contract-drift`. **Adelantada a la Fase 1**: el valor `VENTA` del enum aparece en 8 lugares del OpenAPI, así que sin regenerar el job `contract-drift` rompía el CI del PR de schema. No requirió alias nuevos.
- [x] 6.2 `types/api.ts`: sumar `VENTA` a `TipoComprobante` **e invertir su `satisfies`** a `Record<Schemas[…]['tipo'], string>` (la unión como CLAVE, como ya hace `PerfilExtracto`). Hoy usa `Record<string, …>` y **la omisión compila en verde**. Corregir además el comentario de la línea 58, que afirma que el `satisfies` "hace que `tsc` falle" — cierto ante valores equivocados, falso ante faltantes. **Validar por mutación**: sacar `VENTA` debe romper `tsc`. **Adelantada por 6.1**: regenerar `api.generated.ts` hacía que el union con `VENTA` no encajara en la const escrita a mano, así que sumarlo dejó de ser opcional. Mutación hecha y precisa: con la dirección NUEVA el error sale **en `api.ts`** (TS1360, la unión como clave); con la VIEJA, `api.ts` queda mudo ante la omisión.
- [~] 6.3 Cola del enum en frontend: **7 de las 9** listas hechas acá, arrastradas por 6.2 (el compilador las exigió o quedaban mintiendo). **Falta**: `comprobante-cabecera-form` — se dejó SIN `VENTA` a propósito, no por olvido: es el `<Select>` de creación manual y ya excluye `CIERRE` por el mismo motivo (tipos generados por sistema no se ofrecen); un comprobante VENTA cargado a mano sería un huérfano sin `Venta` detrás. El zod de crear/editar SÍ lo suma porque es whitelist de validación —espejo de Prisma— y tiene que poder representar lo que el backend devuelve. La novena entrada de la lista era `types/api.ts`, que es 6.2. Las **9 listas** hardcodeadas (`comprobantes-filters`, `comprobante-cabecera-form`, `comprobante-detail-page` en `components/`, `crear-comprobante-schema`, `editar-comprobante-schema`, `exportar-libro-diario-pdf`, `tipo-documento-fisico-form-schema`, `build-tipos-documento-fisico-params`, `types/api.ts`).
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
