# Technical Design — Reporte Estado de Resultados (backend)

> Change: `reportes-estado-resultados` (Change 4 — último del fasing de reportes)
> Artifact store: hybrid · Topic key: `sdd/reportes-estado-resultados/design`
> Scope: BACKEND-ONLY · Fecha: 2026-05-31
> Gemelo de `reportes-balance-general` (PR #77). Lee primero su `design.md`.

---

## 0. Resumen

El Estado de Resultados es un reporte de **FLUJO** en un rango `[desde, hasta]`:
las cuentas INGRESO/EGRESO parten de 0 al inicio del rango (no arrastran saldo).
Reusa al máximo la maquinaria del Balance: `calcularSaldoNeto` (signo por naturaleza),
la propagación jerárquica con `esContraria`, y el lector de saldos por rango. El total
(Resultado del Ejercicio) coincide con el del Balance **por construcción** (misma fuente).

---

## 1. Decisión D-01 — naming del port (CRÍTICA)

El proposal recomienda Opción (a): reusar `BalanceReaderPort` tal cual. Lo **rechazo
parcialmente** por honestidad de nombres (Screaming Architecture) y aplico la **regla de
oro de §10.10** (al tocar un módulo, mejorar lo que tocás). Elijo **(b) — rename**.

| Opción | Pro | Contra | Decisión |
|--------|-----|--------|----------|
| (a) reusar `BalanceReaderPort` sin tocar nada | cero cambios mergeados | el nombre MIENTE: un port "del Balance" sirviendo al Estado de Resultados rompe Screaming Arch | **NO** |
| (b) renombrar → `EeffSaldosReaderPort` (lector de saldos contables para EEFF) | nombre honesto; UN concepto de dominio ("leer saldos de cuentas para estados financieros") consumido por AMBOS EEFF | toca 7 archivos, todos en `reportes/`, refactor 100% mecánico | **SÍ** |
| (c) `ResultadosReaderPort` nuevo sobre el mismo adapter (`useExisting`) | cada reporte su port | DOS ports sobre UN adapter con superficie casi idéntica → duplica contrato sin ganancia, dos fuentes de verdad nominales | NO |

**Rationale**: leer saldos agregados de cuentas (por corte O por rango) + estructura del
plan es **un solo concepto de dominio** que sirve a TODA la familia EEFF, no al Balance
en particular. El nombre debe gritar ESO. El costo de (b) es bajo y acotado: las 7
referencias viven todas dentro de `reportes/` (verificado con grep — cero consumidores
externos), el rename es puramente mecánico y los tests del Balance (unit + integration)
son el safety net que prueba que no hay cambio funcional. Opción (c) introduciría
acoplamiento nominal (dos ports, un adapter) sin honestidad real. Como Strict TDD está
activo, el rename va en su **propio commit** con la suite del Balance verde antes y después.

**Rename concreto** (sin cambio de superficie):
- `BalanceReaderPort` → `EeffSaldosReaderPort`
- `BALANCE_READER_PORT` → `EEFF_SALDOS_READER_PORT`
- archivo `ports/balance-reader.port.ts` → `ports/eeff-saldos-reader.port.ts`
- adapter `PrismaBalanceReaderAdapter` → `PrismaEeffSaldosReaderAdapter`
  (archivo + `.integration.spec.ts` hermano)
- los tipos `SaldoCuentaRow`, `CuentaEstructuraRow`, `BalanceFiltros` se mantienen
  (ya son neutrales); se exportan desde el nuevo path.

> Si en `apply` el rename revela fricción inesperada (p. ej. import circular oculto),
> el fallback es Opción (a) documentado en el PR — pero el grep no muestra riesgo.

---

## 2. Estructura de archivos

### Nuevos
```
backend/src/reportes/
├── domain/
│   ├── resultados-arbol.ts                  (árbol de flujo Ingreso/Egreso, PURO)
│   ├── resultados-arbol.spec.ts
│   ├── resultados-errors.ts                 (REPORTES_RESULTADOS_*)
│   └── resultados-errors.spec.ts
├── dto/
│   ├── eeff-resultados-query.dto.ts         (rango / periodoFiscalId / gestionId)
│   ├── eeff-resultados-response.dto.ts      (árbol Ingreso/Egreso + Resultado + mapper)
│   └── eeff-resultados-response.dto.spec.ts
├── estado-resultados.service.ts             (orquestación)
└── estado-resultados.service.spec.ts        (unit, ports mockeados)
```

### Modificados
```
backend/src/reportes/
├── eeff.controller.ts        (+ @Get('resultados'))
├── reportes.module.ts        (+ EstadoResultadosService; reusa port renombrado + PeriodosReaderPort)
└── (rename D-01 — commit aparte) ports/, adapters/, balance-arbol.ts, balance-general.service.ts + sus specs
```
Sin migración de schema (Decisión 2 del proposal — índices existentes cubren el agregado por rango).

---

## 3. Reuso de dominio — `resultados-arbol.ts`

`balance-arbol.ts` y `resultados-arbol.ts` comparten la **mecánica de propagación**
(indexar por id/parentId, recorrer por nivel descendente, `esContraria` resta) pero
**divergen en el ensamblado** (el Balance arma ACTIVO/PASIVO/PATRIMONIO + línea sintética
de Resultado; Resultados arma INGRESO/EGRESO + escalar Resultado). 

**Decisión D-02 — duplicar la variante de flujo, NO generalizar ahora.** Extraer un helper
de propagación compartido tocaría `balance-arbol.ts` (mergeado) por una abstracción que hoy
tiene 2 usos con ensamblados distintos → riesgo > beneficio. `resultados-arbol.ts` **reusa
`calcularSaldoNeto`** (ya compartido) y replica el patrón de propagación con su propio
ensamblado de 2 secciones. Si un Change 5 sumara un tercer reporte jerárquico, ahí se
evalúa extraer `propagarArbol()` común (YAGNI hasta entonces). Documentado como follow-up.

`resultados-arbol.ts` (PURO, ≥95% cobertura §7.5):
1. Saldo de flujo por hoja: cruzar `cuentaId` con `saldosRango`; `calcularSaldoNeto(debe,
   haber, naturaleza)`. Hoja sin fila → `Money.ZERO` (parte de 0 — garantía de flujo).
2. Propagar hojas → agrupadores por nivel descendente; `esContraria` RESTA (idéntico al Balance).
3. Ensamblar **dos secciones**: INGRESO (subclases OPERATIVO / NO_OPERATIVO) y EGRESO
   (OPERATIVO / ADMINISTRATIVO / COMERCIALIZACION / FINANCIERO / NO_OPERATIVO),
   agrupando por `subClaseCuenta`. ACTIVO/PASIVO/PATRIMONIO se IGNORAN.
4. `ResultadoEjercicio = Σ saldoFlujo(INGRESO) − Σ saldoFlujo(EGRESO)` — MISMA fórmula
   que `calcularResultadoEjercicio` del Balance, sobre el mismo `obtenerSaldosEnRango`.
5. Omisión: hoja con flujo 0 se omite; agrupadora se incluye si tiene descendiente con flujo.

**Garantía de flujo (no arrastre)**: el service llama SOLO `obtenerSaldosEnRango(tenant,
desde, hasta, …)` — NUNCA `obtenerSaldosHasta`. La query filtra `c.fechaContable >= desde
AND <= hasta`, por lo que movimientos previos a `desde` quedan fuera por SQL. Test explícito
inserta un comprobante antes de `desde` y verifica que NO aparece.

---

## 4. Service — `estado-resultados.service.ts`

Inyecta SOLO ports: `EeffSaldosReaderPort` (renombrado), `PeriodosReaderPort`. Throws SOLO
`DomainError`. Cero `any`. Reusa `parseFechaContable` (extraer a helper común de `reportes/`
o duplicar — decisión menor de apply; preferible extraer junto al rename).

```
consultarEstadoResultados(tenantId, { fechaDesde?, fechaHasta?, periodoFiscalId?, gestionId?, incluirAnulados }):
  1. Resolver rango [desde, hasta] según la forma provista (§5). Validar exactamente UNA forma.
  2. saldosRango = eeffSaldosReader.obtenerSaldosEnRango(tenantId, desde, hasta, incluirAnulados)
     estructura  = eeffSaldosReader.obtenerEstructuraCuentas(tenantId)   (Promise.all)
  3. arbol = construirEstadoResultados({ estructura, saldosRango })   (resultados-arbol.ts)
  4. return toEstadoResultadosResponse(arbol, { desde, hasta })
```

---

## 5. Resolución del rango (P1 → default recomendado: 3 formas)

Prioridad `fechaDesde+fechaHasta` > `periodoFiscalId` > `gestionId`. Exactamente UNA forma:
- **fechas directas**: `parseFechaContable` ambas; `desde > hasta` → `RangoInvalidoError`.
- **periodoFiscalId**: `periodosReader.obtenerRangoFechas(tenant, periodoId)` (mes) → `null` → `PeriodoNoEncontradoError`.
- **gestionId**: `periodosReader.obtenerRangoGestion(tenant, gestionId)` (año fiscal) → `null` → `GestionNoEncontradaError`.

Ambos métodos de `PeriodosReaderPort` YA existen (los agregó el Balance — sin cambios al port).

---

## 6. DTOs

**Query** `eeff-resultados-query.dto.ts`: `fechaDesde?` `fechaHasta?` (`@Matches /^\d{4}-\d{2}-\d{2}$/`),
`periodoFiscalId?` `gestionId?` (`@IsUUID('4')`), `incluirAnulados?` (`@Transform` bool, default false).
Validación de FORMA en DTO; "exactamente una forma" + reglas de negocio en service con `DomainError` (§10.10).

**Response** `eeff-resultados-response.dto.ts` (montos `string`, fechas `"YYYY-MM-DD"`,
reusa `formatFechaContable` del Balance):
```typescript
export interface EstadoResultadosResponseDto {
  fechaDesde: string; fechaHasta: string;
  ingresos: SeccionResultadosDto;   // claseCuenta INGRESO + subsecciones + totalBob
  egresos:  SeccionResultadosDto;   // claseCuenta EGRESO
  totalIngresosBob: string;
  totalEgresosBob: string;
  resultadoEjercicioBob: string;    // Σ Ingresos − Σ Egresos
  esGanancia: boolean;              // resultadoEjercicio >= 0 (conveniencia UI)
}
```
`SeccionResultadosDto` / `SubseccionResultadosDto` / `CuentaResultadosDto` espejan los del
Balance (sin `esSintetica` — aquí no hay línea sintética). Tipos internos `*Calculado` con `Money`.

---

## 7. DomainErrors — `domain/resultados-errors.ts`

Prefijo `REPORTES_RESULTADOS_*`, extienden `@/common/errors`.

| Clase | Code | Base | HTTP |
|-------|------|------|------|
| `RangoInvalidoError` | `REPORTES_RESULTADOS_RANGO_INVALIDO` | `ValidationError` | 400 |
| `PeriodoNoEncontradoError` | `REPORTES_RESULTADOS_SIN_PERIODO` | `InvalidStateError` | 422 |
| `GestionNoEncontradaError` | `REPORTES_RESULTADOS_SIN_GESTION` | `InvalidStateError` | 422 |

`RANGO_INVALIDO` cubre: ninguna/múltiples formas, fecha mal formada, `desde > hasta`.

---

## 8. Controller + Module

`eeff.controller.ts` + método (mismos guards y RBAC que `balance`):
```typescript
@Get('resultados')
@RequirePermissions('contabilidad.eeff.read')
obtenerEstadoResultados(@Req() req, @Query() query: EstadoResultadosQueryDto) {
  const tenantId = resolveTenantId(req);
  return this.estadoResultadosService.consultarEstadoResultados(tenantId, { /* spread condicional §2.5.1 */ });
}
```
`reportes.module.ts`: `+ EstadoResultadosService` en providers; reusa el binding
`{ provide: EEFF_SALDOS_READER_PORT, useExisting: PrismaEeffSaldosReaderAdapter }` (renombrado)
y `PeriodosReaderModule`. Sin nuevos imports.

---

## 9. Coincidencia con el Balance (invariante de negocio)

El Resultado del Estado de Resultados sale de `obtenerSaldosEnRango` + `calcularSaldoNeto`
+ fórmula `Σ INGRESO − Σ EGRESO` — **exactamente** lo que usa `calcularResultadoEjercicio`
del Balance. Mismo port, mismo método, misma fórmula ⇒ coincidencia por construcción. Test de
integración compara el `resultadoEjercicioBob` de ambos endpoints para el mismo rango.

---

## 10. Plan de tests (Honeycomb, TDD estricto)

| Capa | Qué | Cómo |
|------|-----|------|
| Unit | `resultados-arbol.spec.ts` (≥95%): propagación, `esContraria` resta (devoluciones sobre ventas), hoja flujo 0 omitida, `Σ Ingresos − Σ Egresos`, signo ganancia/pérdida | función pura, fixtures en memoria |
| Unit | `estado-resultados.service.spec.ts`: resolución de rango (3 formas + prioridad), exactamente-una-forma, `desde>hasta`, período/gestión inexistente, `incluirAnulados` propagado | ports MOCKEADOS (nunca Prisma §7.8) |
| Unit | `resultados-errors.spec.ts` / `eeff-resultados-response.dto.spec.ts` | codes estables; Money→string, fecha→"YYYY-MM-DD" |
| Integración | rename: `prisma-eeff-saldos-reader.adapter.integration.spec.ts` (suite del Balance renombrada, sin cambio funcional) | Postgres real |
| Integración | **flujo NO arrastra**: comprobante antes de `desde` no aparece; multi-tenant 2 tenants mismo rango (§4.2 Anti-31); BORRADOR no afecta; toggle `incluirAnulados` | Postgres real, 2 tenants |
| E2E | `GET /api/eeff/resultados`: 200 árbol Ingreso/Egreso + Resultado string; 400 sin/múltiple forma; 403 sin permiso; 422 período/gestión inexistente; **coincidencia con `/eeff/balance`** mismo rango | Supertest + AppModule |

---

## 11. Migración / Rollout

No migration required. Cambios aditivos (endpoint nuevo) + un rename mecánico interno a
`reportes/`. Rollback = revertir el PR (squash); el rename se revierte con él.

---

## 12. Open Questions

- [ ] D-01 confirmado como **(b) rename a `EeffSaldosReaderPort`** salvo fricción en apply (fallback (a) documentado en PR).
- [ ] `parseFechaContable` y `resolveTenantId`/`formatFechaContable`: extraer a helper común de `reportes/` durante el rename (decisión menor de apply).

---

## 13. Invariantes CLAUDE.md en juego

§4.1 (estados CONTABILIZADO/BLOQUEADO, BORRADOR nunca) · §4.2 (multi-tenant defense in
depth, `organizationId` primer predicado — heredado del port) · §4.5 (Money/string, nunca
number) · §4.6 (FechaContable calendario puro, rango sin hora/UTC) · §4.7 (anulados
excluidos por default). §3.2/§3.3/§3.7 (hexagonal estricto, port owner-owned) · §10.10
(regla de oro: rename del port al tocar el módulo). §2.2 (comentarios regulatorios en
signo-por-naturaleza y fórmula del Resultado).
