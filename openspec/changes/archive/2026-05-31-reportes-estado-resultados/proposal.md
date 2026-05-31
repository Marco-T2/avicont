# Proposal: Reporte Estado de Resultados (backend) — Estado Financiero #2 del módulo `reportes`

> Artifact store: hybrid
> Topic key: sdd/reportes-estado-resultados/proposal
> Change 4 (último) del fasing de reportes (ver `openspec/changes/reportes-libros/exploration.md` §D)
> Fecha: 2026-05-31

## Intent

El módulo `reportes` ya entrega el **Libro Diario** (PR #61), el **Libro Mayor**
(archivado) y el **Balance General** (PR #77). El cierre natural del fasing es el
segundo Estado Financiero oficial: el **Estado de Resultados** (Income Statement,
"Estado de Ganancias y Pérdidas").

El Estado de Resultados es el **gemelo** del Balance General: vive en el mismo
módulo, usa la **misma maquinaria de saldos por clase** (`saldo-naturaleza.ts`,
árbol jerárquico, `esContraria`) y comparte el `BalanceReaderPort` ya construido.
La **diferencia conceptual clave**: el Balance es una **foto de saldo a una fecha
de corte** (cuentas patrimoniales arrastran saldo histórico); el Estado de
Resultados es un **reporte de FLUJO en un período** — solo movimientos dentro del
rango `[fechaDesde, fechaHasta]`, sin arrastre. Las cuentas de resultado
(INGRESO/EGRESO) parten de 0 al inicio del rango.

Esta cifra NO es nueva: el Balance General ya calcula el **Resultado del
Ejercicio** = `Σ saldoNeto(INGRESO) − Σ saldoNeto(EGRESO)` de la gestión, vía
`obtenerSaldosEnRango`. Este change toma esa MISMA fuente de verdad y produce su
**desglose detallado** por sección (Ingreso/Egreso) y subclase
(Operativo/No Operativo, Administrativo, Comercialización, Financiero). Por
construcción, el total del Estado de Resultados coincide con el Resultado del
Ejercicio del Balance — cero divergencia.

Backend-first (igual que el Balance): estabilizar y verificar en TDD estricto el
contrato de API y el árbol de flujo ANTES de la UI (change posterior).

## Scope

### In Scope (BACKEND-ONLY)
- Endpoint nuevo `GET /api/eeff/resultados` en el `EeffController` existente,
  protegido por `contabilidad.eeff.read`, multi-tenant estricto.
- `EstadoResultadosService` con la lógica de dominio:
  - saldo neto por cuenta hoja INGRESO/EGRESO acotado al rango `[desde, hasta]`
    (movimientos del período, NO acumulado histórico), con signo por `naturaleza`;
  - construcción del árbol jerárquico de Ingreso/Egreso (propagación hoja →
    agrupadores) reutilizando la lógica de `balance-arbol.ts`;
  - aplicación de `esContraria` (resta del total del grupo);
  - cálculo del **Resultado del Ejercicio** = `Σ Ingresos − Σ Egresos`, con la
    MISMA fórmula/port que el Balance (coincidencia garantizada).
- Resolución del rango: `fechaDesde`/`fechaHasta` directos, o `periodoFiscalId`,
  o `gestionId` (vía `PeriodosReaderPort` ya inyectado en el módulo).
- DTOs de query y respuesta (montos `string`, fechas `"YYYY-MM-DD"`, árbol anidado
  Ingreso/Egreso + total Resultado).
- DomainErrors `REPORTES_RESULTADOS_*`.
- Bindings en `reportes.module.ts`. Tests unit + integración (2 tenants).

### Out of Scope
- **Frontend del Estado de Resultados** — change posterior, mismo patrón que
  Balance/Mayor (backend-first, UI después).
- **Migración de schema** — toda la data existe; se reusa el `BalanceReaderPort`
  (`obtenerSaldosEnRango` + `obtenerEstructuraCuentas`) con los índices actuales
  (`[organizationId, cuentaId]`, `[organizationId, fechaContable]`,
  `[organizationId, claseCuenta]`). No se toca `schema.prisma`.
- **Comparativo entre períodos/gestiones**, márgenes/ratios (margen bruto,
  EBITDA), export PDF/Excel, re-expresión por inflación (AITB).
- **Cierre de gestión / asientos de CIERRE automáticos** — el reporte se calcula
  sobre libros vivos. Las cuentas INGRESO/EGRESO no requieren asiento de cierre
  para reportarse; su saldo de flujo se computa por rango (Fase 1.5, fuera).

## Capabilities

### New Capabilities
- `estado-resultados`: consulta del Estado de Resultados (Income Statement) para un
  rango de fechas o período/gestión — saldos de FLUJO agregados por estructura del
  plan de cuentas (Ingreso Operativo/No Operativo; Egreso Operativo/Administrativo/
  Comercialización/Financiero/No Operativo), con propagación jerárquica, tratamiento
  de cuentas contrarias y cálculo del Resultado del Ejercicio; filtrado por tenant.

### Modified Capabilities
- None. (El módulo `reportes` y el `EeffController` ya existen; este change agrega
  un endpoint sin alterar el contrato del Diario, Mayor ni Balance.)

## Approach

El Estado de Resultados reutiliza la maquinaria del Balance al máximo. Mismo patrón
hexagonal: **port de lectura + adapter `$queryRaw` + service que calcula en memoria
+ DTO con montos `string`**. La pieza central ya está construida.

### Decisión arquitectónica CRÍTICA — reuso del `BalanceReaderPort`

El Balance ya expone `obtenerSaldosEnRango(tenantId, desde, hasta, incluirAnulados)`
(saldos por cuenta acotados a un rango) y `obtenerEstructuraCuentas(tenantId)`. Son
EXACTAMENTE lo que necesita el Estado de Resultados.

| Opción | Descripción | Tradeoff |
|--------|-------------|----------|
| (a) Reusar `BalanceReaderPort` | El service del Estado de Resultados inyecta el port existente y llama `obtenerSaldosEnRango` + `obtenerEstructuraCuentas` | Cero duplicación de SQL; el Resultado del Estado de Resultados sale del MISMO origen que el del Balance → coincidencia por construcción. Acopla los dos EEFF al mismo port (aceptable: son la misma familia y el port es del propio módulo) |
| (b) Port propio `EstadoResultadosReaderPort` | Definir un port nuevo con sus queries dedicadas | Aísla contratos, pero duplica el SQL de agregado por rango y la query de estructura → dos fuentes de verdad del flujo → riesgo de divergencia con el Balance |
| (c) Extraer `SaldoReaderPort` compartido | Renombrar/generalizar el port del Balance | Más limpio conceptualmente, pero toca el Balance ya mergeado (refactor con riesgo) sin ganancia funcional |

**Recomendación: Opción (a)** — el `EstadoResultadosService` inyecta el
`BalanceReaderPort` existente. Es la misma decisión "una sola fuente de verdad del
saldo" que tomó el Balance (Opción b de su proposal), llevada a su conclusión: si
ambos EEFF leen el flujo INGRESO/EGRESO del mismo método, el total del Estado de
Resultados y el Resultado del Ejercicio del Balance son la misma cifra **por
diseño**. Si en el futuro el contrato del port creciera para un EEFF y no el otro,
se evalúa extraer (c); hoy sería over-engineering.

> **Sutileza de naming**: el port se llama `BalanceReaderPort` pero su superficie
> (`obtenerSaldosEnRango`, `obtenerEstructuraCuentas`) ya es genérica de "saldos de
> reportes". Reusarlo es correcto; un rename a `EeffReaderPort` es un follow-up
> cosmético opcional, NO bloqueante (a decidir en design).

### Reglas de dominio (resumen — el detalle va al spec)

```
saldoFlujo(cuenta) = naturaleza ACREEDORA (INGRESO) → Σhaber − Σdebe   en [desde,hasta]
                     naturaleza DEUDORA  (EGRESO)   → Σdebe − Σhaber   en [desde,hasta]
saldoGrupo(nodo)   = Σ saldoFlujo(hijos detalle) − Σ saldoFlujo(hijos esContraria)
ResultadoEjercicio = Σ saldoFlujo(cuentas INGRESO) − Σ saldoFlujo(cuentas EGRESO)
```

Diferencia ESENCIAL con el Balance: se usa SOLO `obtenerSaldosEnRango` (flujo del
período), NUNCA `obtenerSaldosHasta` (saldo histórico). Las cuentas de resultado no
arrastran saldo inicial — parten de 0 al inicio del rango. `esContraria` interviene
igual que en el Balance (ej. devoluciones/descuentos sobre ventas restan del Ingreso).
`TipoComprobante.APERTURA` NO debe afectar el flujo del período si su fecha cae fuera
del rango — y como las cuentas de resultado normalmente no reciben apertura, el caso
es naturalmente correcto (a verificar en spec).

### Componentes

- **Service** (`estado-resultados.service.ts`): resuelve el rango (fechas directas
  o vía `PeriodosReaderPort` para período/gestión), obtiene saldos por rango +
  estructura vía `BalanceReaderPort`, filtra a INGRESO/EGRESO, calcula saldo de
  flujo por hoja con signo por naturaleza, arma el árbol y propaga aplicando
  `esContraria`, ensambla secciones Ingreso/Egreso por subclase, calcula el
  Resultado del Ejercicio. Devuelve DTO con montos `string`.
- **Dominio puro** (`estado-resultados-arbol.ts`): función pura que construye el
  árbol Ingreso/Egreso. Reusa `calcularSaldoNeto` de `saldo-naturaleza.ts` y el
  patrón de propagación de `balance-arbol.ts` (extraer helper común si conviene,
  sin cambiar comportamiento del Balance — decisión de design).
- **DTOs** (`estado-resultados-query.dto.ts`, `estado-resultados-response.dto.ts`):
  query con rango/período/gestión; respuesta árbol anidado Ingreso/Egreso + total
  Resultado, montos `string`, fechas `"YYYY-MM-DD"`.
- **DomainErrors** (`estado-resultados-errors.ts`): `REPORTES_RESULTADOS_*` (rango
  inválido, período/gestión no encontrado).
- **Controller**: agrega `obtenerEstadoResultados()` al `EeffController` existente
  (`@Get('resultados')`), Guards + `@RequirePermissions('contabilidad.eeff.read')`
  + Swagger; sin lógica.
- **Module**: bindings del nuevo service en `reportes.module.ts`; reusa el binding
  existente de `BalanceReaderPort` y `PeriodosReaderPort`.

## Decisiones cerradas

1. **Alcance = backend-only** — solo `GET /api/eeff/resultados` + tests TDD; UI
   diferida.
2. **Schema = sin migración** — se reusa `BalanceReaderPort.obtenerSaldosEnRango` +
   `obtenerEstructuraCuentas`; índices existentes cubren el agregado por rango.
3. **Reuso del port (Opción a)** — el service inyecta el `BalanceReaderPort`
   existente; el Resultado del Estado de Resultados y el del Balance comparten
   fuente de verdad → coinciden por construcción.
4. **Reporte de FLUJO, no de saldo** — solo movimientos en `[desde, hasta]`; las
   cuentas de resultado parten de 0 al inicio del rango. Nunca `obtenerSaldosHasta`.
5. **`esContraria` se RESTA** del total de su grupo (ej. devoluciones sobre ventas).
6. **Cuentas sin movimiento en el rango**: hojas con flujo 0 se omiten del detalle;
   agrupadoras estructurales se preservan solo si tienen descendiente con flujo
   (misma regla que el Balance, Decisión 6 de su proposal).
7. **Estados incluidos**: solo `CONTABILIZADO` + `BLOQUEADO`; `BORRADOR` nunca
   (§4.1). Anulados excluidos por default; toggle `incluirAnulados` (§4.7).
8. **No requiere período cerrado** — válido en cualquier momento.
9. **RBAC**: `contabilidad.eeff.read` (ya en catálogo, `catalogo.ts:188`).
10. **Money**: saldos como `string` decimal en el DTO; cálculo con `Money`, nunca
    `number` (§4.5).

## Preguntas abiertas para Marco

1. **Parámetro de rango del endpoint**: tres formas — (i) `fechaDesde`+`fechaHasta`
   directas, (ii) `periodoFiscalId` (rango = el mes del período), (iii) `gestionId`
   (rango = la gestión completa). **Recomendación: aceptar las tres**, con prioridad
   `fechaDesde/fechaHasta` > `periodoFiscalId` > `gestionId`, validando que se pase
   exactamente una forma. ¿De acuerdo, o preferís solo rango de fechas directo (más
   simple para el MVP)?
2. **Rename del port**: ¿extraés/renombrás `BalanceReaderPort` → `EeffReaderPort`
   (cosmético, toca el Balance) o lo dejás como está y el Estado de Resultados
   simplemente lo reusa con su nombre actual? **Recomendación: dejarlo** (no tocar
   código mergeado por cosmética); rename como follow-up si molesta.

> Si Marco no responde, el spec/design asume los **defaults recomendados**:
> P1 → aceptar las tres formas con prioridad; P2 → reusar `BalanceReaderPort` sin rename.

## Riesgos / invariantes en juego

| Riesgo | Likelihood | Mitigación |
|--------|------------|------------|
| Usar saldo histórico (`obtenerSaldosHasta`) en vez de flujo → cifras infladas | High | Service usa SOLO `obtenerSaldosEnRango`; test que verifica que movimientos previos al rango NO aparecen |
| Resultado del Estado de Resultados ≠ Resultado del Ejercicio del Balance | High | Opción (a): misma fuente de verdad (port + fórmula compartidos); test de coincidencia Balance vs Estado de Resultados para el mismo rango |
| Query/agregado sin filtro `organizationId` → fuga cross-tenant (§4.2, Anti-31) | High | El `BalanceReaderPort` ya filtra `organizationId` como primer predicado; test obligatorio con 2 tenants en el mismo rango |
| `esContraria` ignorada → Ingreso inflado (devoluciones no restan) | Med | Test con cuenta contraria de Ingreso; el grupo resta su saldo |
| Incluir BORRADOR en el flujo | Med | Estado FIJO `IN (CONTABILIZADO, BLOQUEADO)` (heredado del port); test negativo |
| Montos serializados como `number` (pierde precisión IEEE-754) | Med | DTO `string`; cálculo con `Money`; test de forma JSON |
| Rango mal resuelto (período/gestión inexistente, desde > hasta) | Med | Validación de forma en DTO + `DomainError` en service; cubierto por P1 |

### Invariantes CLAUDE.md tocados
- §4.2 multi-tenant estricto (filtro en el port reusado).
- §4.5 dinero = Decimal/string, nunca `number`.
- §4.6 `FechaContable` calendario puro (rango de fechas sin hora/UTC).
- §4.7 anulados excluidos por default.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/reportes/estado-resultados.service.ts` | New | Resuelve rango, lee flujo vía `BalanceReaderPort`, arma árbol Ingreso/Egreso, calcula Resultado |
| `backend/src/reportes/domain/estado-resultados-arbol.ts` | New | Función pura: árbol de flujo Ingreso/Egreso, propagación, `esContraria` |
| `backend/src/reportes/domain/estado-resultados-errors.ts` | New | DomainErrors `REPORTES_RESULTADOS_*` |
| `backend/src/reportes/dto/estado-resultados-query.dto.ts` | New | Query (rango fechas / período / gestión, incluirAnulados?) |
| `backend/src/reportes/dto/estado-resultados-response.dto.ts` | New | DTO árbol Ingreso/Egreso + Resultado (montos `string`, fechas `"YYYY-MM-DD"`) |
| `backend/src/reportes/eeff.controller.ts` | Modified | `obtenerEstadoResultados()` (`@Get('resultados')`) con Guards + permiso eeff |
| `backend/src/reportes/reportes.module.ts` | Modified | Binding del `EstadoResultadosService`; reusa `BalanceReaderPort` y `PeriodosReaderPort` |
| `backend/src/reportes/domain/saldo-naturaleza.ts` | Reused | Helper de signo-por-naturaleza, sin cambios |
| `backend/src/reportes/ports/balance-reader.port.ts` | Reused | `obtenerSaldosEnRango` + `obtenerEstructuraCuentas` ya existentes |

## Dependencies

- Datos existentes (sin migración): `Comprobante` (`fechaContable`, `estado`,
  `anulado`), `LineaComprobante` (`organizationId`, `cuentaId`, `debitoBob`,
  `creditoBob`), `Cuenta` (`claseCuenta` INGRESO/EGRESO, `subClaseCuenta`,
  `naturaleza`, `esContraria`, `esDetalle`, `parentId`, `nivel`, `codigoInterno`,
  `nombre`, `activa`).
- `BalanceReaderPort` + su adapter Prisma (ya implementados en PR #77).
- `PeriodosReaderPort` (ya importado por `reportes`) para resolver período/gestión.
- Permiso `contabilidad.eeff.read` ya en el catálogo RBAC.
- `EeffController` ya existe (Balance); se le agrega un método.

## Rollback Plan

Revertir el PR (squash). Cambios aditivos: el endpoint del Estado de Resultados no
toca el contrato del Diario, Mayor ni Balance. Quitar el método del `EeffController`,
el binding del `EstadoResultadosService` de `reportes.module.ts` y los archivos
nuevos. Sin migraciones, sin datos afectados (solo lectura). Si se decidió el rename
del port (P2), revertirlo también — por eso se recomienda NO renombrar.

## Success Criteria

- [ ] `GET /api/eeff/resultados` devuelve el árbol Ingreso / Egreso con subtotales
      por subclase (Operativo, No Operativo, Administrativo, Comercialización,
      Financiero), saldos `string`, rango `fechaDesde`/`fechaHasta` `"YYYY-MM-DD"`.
- [ ] Los saldos son de FLUJO (solo movimientos en el rango); movimientos previos al
      `fechaDesde` NO afectan el reporte (test explícito).
- [ ] El Resultado del Ejercicio = `Σ Ingresos − Σ Egresos` coincide con el Resultado
      del Ejercicio del Balance General para el mismo rango (test de coincidencia).
- [ ] Las cuentas `esContraria=true` se RESTAN del total de su grupo.
- [ ] Saldos hoja calculados con signo por `naturaleza` y propagados a agrupadores.
- [ ] BORRADOR nunca afecta el flujo; anulados excluidos por default, incluibles con
      `incluirAnulados=true`.
- [ ] Multi-tenant verificado con test de 2 tenants en el mismo rango (sin fuga).
- [ ] Cobertura ≥ 95% en la lógica de dominio (§7.5); cero migración.
