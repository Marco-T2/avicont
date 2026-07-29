# Tasks: Ventas y Cuentas por Cobrar — piloto

TDD estricto (RED → GREEN). 1 task = 1 commit; cierra con `tsc` + suite del subsistema en verde.

## Fase 1 — Schema y migraciones

- [ ] 1.1 Migración **enum-only** a mano: `ADD VALUE 'VENTA'`. Ningún otro literal `'VENTA'`.
- [ ] 1.2 `schema.prisma`: los 6 modelos del design con `organizationId` no nulo; 2 campos en `OrgConfiguracionContable`; FK `Item.cuentaIngresoId` `onDelete: Restrict`.
- [ ] 1.3 Generar migración de tablas. **§11.6**: grep `^DROP (INDEX|EXTENSION|TYPE)` y rescatar los objetos raw.
- [ ] 1.4 UNIQUE PARCIAL raw de `Item.codigo` al final de esa migración + fila en §11.6.
- [ ] 1.5 Migración **data-only** idempotente: `VENTA` donde ya hay `INGRESO`.
- [ ] 1.6 `seed/tipos-universales.ts`: `VENTA` en los 4 tipos con `INGRESO`.
- [ ] 1.7 Seed comercial: `1.1.2.001` y `4.1.1.001` a `esRequeridaSistema` + `MAPEO_CODIGO_A_CONCEPTO`; `CONCEPTO_FIELDS` en `prisma-cuenta.repository.ts`.
- [ ] 1.8 RBAC: declarar `items.*`/`cobros.*`, sacar las 6 `ventas.*` de `DECLARADOS_SIN_ENDPOINT`, espejo `lib/permissions.ts`, `CONTADOR_PERMISSIONS`.
- [ ] 1.9 Cola del enum: `PREFIJO_POR_TIPO`, `common/domain/enums.ts`, `enum-mappers.ts` + 9 listas del frontend.

## Fase 2 — Núcleo compartido

- [ ] 2.1 RED/GREEN `common/domain/efectivo.ts`: `activa ∧ esDetalle ∧ (EFECTIVO ∪ prefijo 1.1.1)`.
- [ ] 2.2 `estado-flujo-efectivo.ts` importa el prefijo de `common/`; EEFF sin regresión.
- [ ] 2.3 `CuentasEfectivoReaderPort` + adapter + wiring en `cuentas`.
- [ ] 2.4 Extraer `validarLineasContraCuentas` a `comprobantes/domain/`; usarla en sus 3 call sites.
- [ ] 2.5 Extraer `ESTADOS_CONCILIABLES` a un lugar único; consumirlo en sus 2 call sites.
- [ ] 2.6 RED/GREEN `ComprobanteSistemaWriterPort` + adapter (5 métodos del design). Preserva `id`/`numero`; **todos re-validan**.
- [ ] 2.7 `comprobantes.service.anular` → 409 `COMPROBANTE_ANULACION_DESDE_ORIGEN` si el origen es comercial.
- [ ] 2.8 Constantes `ORIGEN_TIPO_VENTA` / `ORIGEN_TIPO_COBRO`.

## Fase 3 — `items`

- [ ] 3.1 RED/GREEN dominio: normalizar `codigo` (trim → null, `toUpperCase`).
- [ ] 3.2 Repositorio + `ItemsReaderPort` (`obtenerBatch → {id, activo}`) + `ITEM_CODIGO_DUPLICADO`.
- [ ] 3.3 Service, controller, DTOs, módulo. `@RequireModule('contabilidad')`, decoradores literales.
- [ ] 3.4 Guard `CUENTA_REFERENCIADA_POR_ITEMS` al desactivar una cuenta.

## Fase 4 — `ventas`

- [ ] 4.1 RED/GREEN dominio: `subtotal = mul().redondearABob()`, `montoTotal = Σ subtotales`. Casos `5 × 6.305` y `3 × 10.005`.
- [ ] 4.2 RED/GREEN builder del asiento: CONTADO vs CREDITO, `contactoId` en la línea CxC, tri-valor BOB.
- [ ] 4.3 Repositorio + puertos consumidos.
- [ ] 4.4 Service: borrador + comprobante en la misma TX (`auditedTx.run`), upsert por origen.
- [ ] 4.5 Service: contabilizar (serie `V`), editar post-CONTABILIZADO, recorte LIFO.
- [ ] 4.6 Service: anular → desvincula y registra en `AplicacionCobroDesvinculada`.
- [ ] 4.7 Controller, DTOs, módulo.

## Fase 5 — `cuentas-por-cobrar`

- [ ] 5.1 RED/GREEN dominio: saldo, estado comercial, `VENCIDA` vía `ClockPort`, orden FIFO.
- [ ] 5.2 RED/GREEN sobre-aplicación: `SUM()` intra-TX bajo `FOR UPDATE`.
- [ ] 5.3 Cobro: service + asiento `INGRESO` con `origenTipo='COBRO'`.
- [ ] 5.4 Aplicaciones: CRUD sin asiento, mismo contacto, fuera del period lock.
- [ ] 5.5 Estado de cuenta (cartera = `CONTABILIZADO ∪ BLOQUEADO`, no anulada).
- [ ] 5.6 Controllers, DTOs, módulo.

## Fase 6 — Frontend

- [ ] 6.1 Regenerar `openapi.json` + `api.generated.ts` + alias. Verde `contract-drift`.
- [ ] 6.2 `features/items/`: listado y form.
- [ ] 6.3 `features/ventas/`: listado y alta/edición, dos acciones, cero confirmaciones.
- [ ] 6.4 `features/cobros/`: *Receive Payment* con auto-tilde FIFO overrideable.
- [ ] 6.5 Estado de cuenta por cliente.
- [ ] 6.6 Grupo `comercial` PRIMERO en Contabilidad (`ShoppingCart`) + rutas gateadas.
- [ ] 6.7 Hint del Select de `/plan-cuentas`: sumar que habilita cuentas de cobro.

## Fase 7 — Verificación

- [ ] 7.1 E2E: venta CONTADO y CREDITO → asiento con número propio.
- [ ] 7.2 E2E: re-imputar deja el comprobante del cobro **byte-idéntico**.
- [ ] 7.3 E2E: anular desde comprobantes → 409; desde ventas → procede.
- [ ] 7.4 E2E: cerrar el período NO saca la venta del estado de cuenta.
- [ ] 7.5 Suite completa + `tsc` + `lint` + `gate:ui` + `gate:tap`.
- [ ] 7.6 Checklist §7 de `frontend/CLAUDE.md`; lo no verificado, sin tildar.
