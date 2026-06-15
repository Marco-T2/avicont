# Change: balance-comprobacion

## Qué

Agregar el reporte **Balance de Comprobación de Sumas y Saldos** al módulo
`backend/src/reportes/`. Es un Estado Financiero más: por cada cuenta de
**detalle** con movimiento en un rango `[desde, hasta]`, muestra cuatro
columnas — `sumasDebito`, `sumasCredito`, `saldoDeudor`, `saldoAcreedor` — más
los totales de cada columna y dos invariantes de cuadre. Expone un endpoint
`GET /api/eeff/balance-comprobacion`.

El reporte es de **flujo del rango**: NO arrastra saldo inicial de gestiones
previas (Avicont no tiene mecanismo de apertura — mismo concepto de "flujo puro"
que el Estado de Resultados). El rango se especifica por `desde`/`hasta`
(YYYY-MM-DD) o por `periodoFiscalId` (UUID), exactamente uno de los dos.

## Por qué

El módulo `reportes` ya tiene Libro Diario, Libro Mayor, Balance General y
Estado de Resultados, pero falta el **Balance de Comprobación**, que es el
reporte de control que el contador boliviano usa para verificar la integridad
de la partida doble antes de emitir los EEFF. Sin él, no hay forma rápida de
detectar un descuadre acumulado ni cuentas con saldo de naturaleza opuesta
(anticipos no reclasificados, errores de carga).

El invariante de cuadre `SUM(saldosDeudores) === SUM(saldosAcreedores)` ya está
documentado en `docs/claude/dominio-contable.md` §4.1 ("Libros contables") como
una regla del dominio que el sistema debe poder verificar. Este change la
materializa como reporte consultable.

## Scope (SOLO BACKEND)

- Dominio puro: builder `domain/balance-comprobacion.ts` + tipos de fila/total +
  detección de cuentas de naturaleza opuesta.
- Errores de dominio `domain/balance-comprobacion-errors.ts` (`DomainError`,
  códigos estables).
- Service `BalanceComprobacionService` (orquesta lecturas + dominio + mapeo DTO).
- DTOs: `dto/balance-comprobacion-query.dto.ts` + `dto/balance-comprobacion-response.dto.ts`.
- Endpoint `GET /api/eeff/balance-comprobacion` en `EeffController`.
- Registro en `reportes.module.ts`.
- `@ApiOkResponse` + regeneración de `openapi.json` y `api.generated.ts`
  (job CI `contract-drift`).
- Tests: unit del builder (≥95% cobertura dominio, §7.5), service spec,
  integración/e2e del endpoint.

**Reutiliza infra existente SIN tocarla:**
- `EeffSaldosReaderPort.obtenerSaldosEnRango(...)` (sumas débito/crédito por
  cuenta en el rango, estados CONTABILIZADO/BLOQUEADO, filtra tenantId) +
  `obtenerEstructuraCuentas(...)`. **CERO cambios al port, CERO adapter nuevo.**
- `PeriodosReaderPort.obtenerRangoFechas(...)` para resolver `periodoFiscalId`.
- Helpers `parseFechaContable` / `formatFechaContable`, value object `Money`,
  helper `calcularSaldoNeto` (referencia conceptual; el balance de comprobación
  usa sumas, no saldo neto firmado).

## Out of scope

- **Frontend** (botón/pantalla del reporte) — change posterior.
- **Exportación a Excel** del Balance de Comprobación — depende del frontend
  (capability frontend §10.1) y es change posterior.
- **Migración de BD** — ninguna. El reporte se computa sobre datos existentes.
- **Cambios al `EeffSaldosReaderPort`** o a su adapter — no se necesitan.
- **Saldo inicial / asientos de apertura** — Avicont no los tiene; el reporte es
  de flujo puro del rango.
- **PDF** — el backend solo expone JSON.

## RBAC y módulo

- Permiso: `contabilidad.eeff.read` (es un Estado Financiero más — sin permiso
  nuevo en el catálogo).
- `@RequireModule('contabilidad')` (mismo controller que balance y resultados).
