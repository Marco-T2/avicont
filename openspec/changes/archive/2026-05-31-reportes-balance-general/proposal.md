# Proposal: Reporte Balance General (backend) — Estado Financiero #1 del módulo `reportes`

> Artifact store: hybrid
> Topic key: sdd/reportes-balance-general/proposal
> Change 3 del fasing de reportes (ver `openspec/changes/reportes-libros/exploration.md` §D)
> Fecha: 2026-05-30

## Intent

El sistema ya entrega el **Libro Diario** (PR #61) y el **Libro Mayor** (PR
mergeada, change archivado `2026-05-30-reportes-libro-mayor`). El siguiente paso
natural del fasing es el primer **Estado Financiero oficial**: el **Balance
General** (Estado de Situación Financiera).

Mientras el Mayor presenta saldos **por cuenta individual**, el Balance General
los presenta **agregados por estructura del plan de cuentas** a una **fecha de
corte**: Activo (Corriente / No Corriente), Pasivo (Corriente / No Corriente) y
Patrimonio (Capital + Resultado del Ejercicio). Es la foto patrimonial de la
empresa a una fecha, y la base sobre la que un contador valida que
`Activo = Pasivo + Patrimonio` (ecuación contable fundamental).

El Balance introduce **lógica de dominio nueva** sobre lo ya construido en el
Mayor:
1. **Propagación jerárquica**: los saldos de las cuentas hoja (`esDetalle=true`)
   se suman hacia sus agrupadores (`esDetalle=false`) recorriendo el árbol
   `parentId`/`nivel`.
2. **Cuentas contrarias** (`esContraria=true`, ej. Depreciación Acumulada): se
   **restan** del total de su grupo en lugar de sumarse.
3. **Resultado del Ejercicio**: el Patrimonio incluye una línea calculada como
   `SUM(saldos INGRESO) − SUM(saldos EGRESO)` del período/gestión vigente — lógica
   que el Estado de Resultados (Change 4) reutilizará.

Por eso este change es **backend-first**: estabilizar y verificar en TDD estricto
el contrato de API, la propagación jerárquica, el tratamiento de `esContraria` y
el cálculo del Resultado del Ejercicio ANTES de construir la UI (que será un
change posterior).

## Scope

### In Scope (BACKEND-ONLY)
- Endpoint nuevo `GET /api/eeff/balance` en el módulo existente
  `backend/src/reportes/`, protegido por `contabilidad.eeff.read`, multi-tenant
  estricto.
- `BalanceGeneralService` con la lógica de dominio:
  - saldo neto por cuenta hoja (`esDetalle=true`) acumulado **hasta** la fecha de
    corte (inclusive), con signo por `naturaleza` (misma fórmula que el Mayor);
  - construcción del árbol jerárquico en memoria y propagación de saldos hoja →
    agrupadores;
  - aplicación de `esContraria` (resta del total del grupo);
  - cálculo del **Resultado del Ejercicio** = `Σ saldos INGRESO − Σ saldos EGRESO`
    del período de la gestión vigente, inyectado en Patrimonio;
  - verificación de la ecuación contable `Activo = Pasivo + Patrimonio` (±Bs 0.01)
    como dato de salida (`cuadra: boolean` + diferencia), no como error duro.
- Port nuevo de lectura en `reportes/ports/` para el Balance (saldo neto por cuenta
  hoja ≤ fecha corte + metadata estructural de TODAS las cuentas del tenant para
  armar el árbol), implementado por un adapter Prisma con **query JOIN** y
  agregados `$queryRaw` (sin migración).
- DTOs de query y respuesta (montos `string`, fechas `"YYYY-MM-DD"`, árbol anidado).
- DomainErrors `REPORTES_BALANCE_*`.
- Bindings en `reportes.module.ts`. Tests unit + integración (2 tenants).

### Out of Scope
- **Frontend del Balance General** — feature `frontend/src/features/`. Change
  posterior, una vez verificado el contrato de API. (Mismo patrón que Diario y
  Mayor: backend-first, UI después.)
- **Estado de Resultados completo (Change 4)** — este change calcula el
  **Resultado del Ejercicio** como un escalar (Σ ingresos − Σ egresos) para
  inyectarlo en Patrimonio, pero NO produce el desglose por subclase
  (Operativo/No Operativo, Administrativo, Comercialización, Financiero) ni su
  endpoint `GET /api/eeff/resultados`. Ese desglose es Change 4 y **reutilizará el
  mismo port/lógica de saldos** que este change establece (ver Approach).
- **Migración de schema** — se usa JOIN + agregados con los índices existentes
  (`[organizationId, cuentaId]` en `lineas_comprobante`,
  `[organizationId, fechaContable]` en `comprobantes`,
  `[organizationId, claseCuenta]` en `cuentas`). No se toca `schema.prisma`.
- **Cierre de gestión / asientos de CIERRE automáticos** — el Balance se calcula
  sobre libros vivos. El arrastre entre gestiones se apoya en el asiento de
  `APERTURA` ya existente (sin trato especial: su efecto está en la suma
  histórica). Generar asientos de cierre es Fase 1.5, fuera de este change.
- **Export PDF/Excel**, comparativo entre fechas/gestiones, re-expresión por
  inflación (AITB), materialización/cache de saldos.

## Capabilities

### New Capabilities
- `balance-general`: consulta del Balance General (Estado de Situación Financiera)
  a una fecha de corte — saldos agregados por estructura del plan de cuentas
  (Activo Corriente/No Corriente, Pasivo Corriente/No Corriente, Patrimonio con
  Resultado del Ejercicio), con propagación jerárquica, tratamiento de cuentas
  contrarias y verificación de la ecuación contable; filtrado por tenant.

### Modified Capabilities
- None. (El módulo `reportes` ya existe; este change le agrega un endpoint sin
  alterar el contrato del Libro Diario ni del Libro Mayor.)

## Approach

El módulo `reportes/` ya existe (Diario + Mayor). Este change agrega un tercer
sub-recurso bajo un nuevo prefijo `eeff` siguiendo el **mismo patrón hexagonal**
que el Mayor: **port de lectura propio + adapter Prisma `$queryRaw` + service que
calcula en memoria + DTO con montos `string`**.

### Decisión arquitectónica CRÍTICA — Resultado del Ejercicio

El Balance General incluye en Patrimonio el **Resultado del Ejercicio =
Σ(Ingresos) − Σ(Egresos)** del período. Esa es lógica del Estado de Resultados
(Change 4), que aún no existe. Tres opciones evaluadas:

| Opción | Descripción | Tradeoff |
|--------|-------------|----------|
| (a) Inline duplicado | Calcular el Resultado dentro del Balance con su propia query/lógica; Change 4 luego reescribe o duplica | Rápido ahora, pero duplica la fuente de verdad del resultado → riesgo de divergencia Balance vs Estado de Resultados (dos cifras que DEBEN coincidir y podrían no hacerlo) |
| (b) **Port de saldos reutilizable** | Definir un `BalanceReaderPort` que devuelve **saldo neto por cuenta hoja a una fecha de corte** (TODAS las clases, incluidas INGRESO/EGRESO). El service del Balance suma INGRESO−EGRESO para el Resultado; Change 4 consume el MISMO port para el desglose | Más diseño ahora, pero UNA sola fuente de verdad de saldos → el Resultado del Balance y el del Estado de Resultados salen del mismo cálculo por construcción. Cero divergencia |
| (c) Reusar `LibroMayorReaderPort` | Reaprovechar el port del Mayor para obtener saldos | El Mayor devuelve **movimientos línea a línea + saldo inicial separado** y exige `cuentaId` o trae todo el detalle — su forma es "running balance por cuenta", no "saldo neto agregado a una fecha". Forzarlo distorsiona ambos contratos |

**Recomendación: Opción (b)** — port de lectura propio del Balance que expone
exactamente lo que el EEFF necesita: **saldo neto por cuenta hoja ≤ fecha corte**
(un `GROUP BY cuentaId` con `SUM(debitoBob)`/`SUM(creditoBob)`), más la **metadata
estructural de todas las cuentas** del tenant (`id, parentId, nivel, esDetalle,
claseCuenta, subClaseCuenta, naturaleza, esContraria, codigoInterno, nombre`) para
armar el árbol.

Esto es esencialmente la query `obtenerSaldosIniciales` del Mayor (saldo
histórico acumulado), pero con el corte en `≤ fechaCorte` en lugar de
`< fechaDesde` y sin restringir a una sola cuenta. El cálculo de signo por
`naturaleza` (`DEUDORA: debe−haber`, `ACREEDORA: haber−debe`) es **idéntico** y se
factoriza como helper compartido en el módulo `reportes` (hoy vive como función
`calcularSaldoInicial` en `libro-mayor.service.ts` — se extrae a un util de
dominio `reportes/domain/saldo-naturaleza.ts` reutilizable por Mayor, Balance y el
futuro Estado de Resultados, sin cambiar comportamiento del Mayor).

**Por qué (b) y no (a)**: en contabilidad, el Resultado del Ejercicio que muestra
el Balance y el que muestra el Estado de Resultados son **la misma cifra** — si
divergen, el reporte está roto y el contador pierde confianza en el sistema. La
opción (b) lo hace imposible por diseño: ambos leen el saldo neto de las mismas
cuentas INGRESO/EGRESO desde el mismo port. El costo extra de diseño es un port
que Change 4 igual iba a necesitar.

### Componentes

- **Port de lectura propio** (`reportes/ports/balance-reader.port.ts`, abstract
  class + Symbol):
  - `obtenerSaldosHasta(tenantId, fechaCorte, incluirAnulados)` → saldo neto por
    cuenta hoja (filas `{ cuentaId, naturaleza, totalDebitoBob, totalCreditoBob }`)
    con `c.fechaContable <= fechaCorte`, estado IN (CONTABILIZADO, BLOQUEADO),
    `lc.organizationId = $tenant` SIEMPRE como primer predicado (§4.2);
  - `obtenerEstructuraCuentas(tenantId)` → metadata estructural de TODAS las
    cuentas activas del tenant para armar el árbol (incluidas las agrupadoras sin
    movimiento, que SÍ aparecen como nodos estructurales).
  - **No** se importa el repositorio de `comprobantes` ni de `cuentas` (§3.3):
    `reportes` define su propia superficie de lectura, como ya hace con el Mayor.
- **Adapter Prisma** (`prisma-balance-reader.adapter.ts`) que implementa el port
  con `$queryRaw` JOIN `lineas_comprobante lc JOIN comprobantes c` (agregado por
  cuenta) y un `findMany` de cuentas para la estructura. `organizationId`
  filtrado en AMBAS consultas (defense in depth, Anti-31).
- **Service** (`balance-general.service.ts`): resuelve la fecha de corte, obtiene
  saldos + estructura vía port, calcula saldo neto por hoja con signo por
  naturaleza, construye el árbol en memoria, propaga hoja → agrupadores aplicando
  `esContraria`, calcula el Resultado del Ejercicio (Σ INGRESO − Σ EGRESO),
  ensambla las secciones del Balance y verifica `Activo = Pasivo + Patrimonio`.
  Devuelve DTO con montos `string`.
- **Controller**: agrega `obtenerBalanceGeneral()` al controller existente, con un
  segundo `@Controller('eeff')` o ruta `eeff/balance` (decisión de routing abajo),
  Guards + `@RequirePermissions('contabilidad.eeff.read')` + Swagger; sin lógica.

### Reglas de dominio (resumen — el detalle va al spec)

```
saldoHoja(cuenta) =  naturaleza DEUDORA  → Σdebe − Σhaber   (hasta fechaCorte)
                     naturaleza ACREEDORA → Σhaber − Σdebe
saldoGrupo(nodo)  =  Σ saldoHoja(hijos detalle)
                       − Σ saldoHoja(hijos con esContraria=true)   (las contrarias restan)
ResultadoEjercicio = Σ saldoNeto(cuentas INGRESO) − Σ saldoNeto(cuentas EGRESO)
                       del período de la gestión vigente
Patrimonio.total  =  Σ(cuentas PATRIMONIO_CAPITAL/RESULTADOS) + ResultadoEjercicio
cuadra            =  |Activo − (Pasivo + Patrimonio)| ≤ 0.01   (Código Tributario art. 47)
```

`esContraria` SÍ interviene aquí (a diferencia del Mayor, donde no aplicaba).
`TipoComprobante.APERTURA` no recibe trato especial: su efecto ya está en la suma
histórica hasta la fecha de corte (arrastre de gestión vía APERTURA, exploración
§B.3).

## Decisiones cerradas

1. **Alcance = backend-only** — solo `GET /api/eeff/balance` + tests TDD; frontend
   diferido a un change posterior.
2. **Schema = JOIN + agregados sin migración** — no se toca `schema.prisma`; los
   índices existentes cubren el agregado por cuenta y el corte por fecha.
3. **Resultado del Ejercicio = Opción (b)**: port de saldos reutilizable; el
   Resultado se calcula como `Σ INGRESO − Σ EGRESO` de la gestión vigente, misma
   fuente de verdad que reutilizará el Estado de Resultados (Change 4). Se extrae
   el helper de signo-por-naturaleza a `reportes/domain/saldo-naturaleza.ts`.
4. **Árbol jerárquico en memoria**: el adapter trae saldos planos por hoja +
   estructura de cuentas; el service arma el árbol con `parentId`/`nivel` y propaga
   hoja → agrupadores. (Coherente con exploración §B.6 y §E.7.)
5. **`esContraria` se RESTA** del total de su grupo (exploración §E.5).
6. **Cuentas sin saldo**: las cuentas **hoja** con saldo 0 se **omiten** del
   detalle; las cuentas **agrupadoras estructurales** (`esDetalle=false`)
   aparecen siempre que tengan al menos un descendiente con saldo, para preservar
   la estructura del reporte. Un grupo sin ningún saldo se omite. (Confirma
   exploración §E.6.)
7. **Saldo inicial / arrastre**: vía suma histórica hasta fecha de corte; el
   asiento `APERTURA` aporta el saldo inicial de la gestión sin lógica especial
   (exploración §B.3). Empresa nueva sin APERTURA → saldos parten de 0 (correcto).
8. **Estados incluidos**: solo `CONTABILIZADO` + `BLOQUEADO`; `BORRADOR` nunca
   (§4.1). Anulados excluidos por default; toggle `incluirAnulados` para auditoría
   interna (§4.7).
9. **El Balance NO requiere período cerrado** — es válido en cualquier momento,
   con períodos abiertos o cerrados (exploración §E.8).
10. **RBAC**: permiso `contabilidad.eeff.read` (ya en el catálogo,
    `catalogo.ts:188`).
11. **Money**: todos los saldos como `string` decimal en el DTO; cálculo con
    `Money`/`Decimal`, nunca `number` (§4.5).

## Preguntas abiertas para Marco

1. **Parámetro de corte del endpoint**: tres formas posibles —
   (i) `fecha` de corte directa (`"YYYY-MM-DD"`),
   (ii) `periodoFiscalId` (corte = fin del período),
   (iii) `gestionId` (corte = fin de la gestión).
   La exploración §D usa `fecha` de corte. **Recomendación: aceptar `fecha` como
   parámetro primario** (el más flexible para el contador), y opcionalmente
   `gestionId` para delimitar de qué gestión se toma el "Resultado del Ejercicio".
   **Sutileza a confirmar**: el Resultado del Ejercicio es el de UNA gestión
   (no acumulado histórico). Si solo se pasa `fecha`, hay que inferir la gestión a
   la que pertenece esa fecha (vía `PeriodosReaderPort`). ¿Confirmás `fecha` +
   inferencia de gestión, o preferís pasar `gestionId` explícito?

2. **Resultados Acumulados vs Resultado del Ejercicio**: el plan distingue
   `resultadoEjercicioId` (resultado de la gestión vigente) de
   `resultadosAcumuladosId` (utilidades retenidas de gestiones cerradas), ambos en
   `PATRIMONIO_RESULTADOS` (`OrgConfiguracionContable`). En este MVP, los
   "Resultados Acumulados" salen del **saldo real de esa cuenta** (movimientos de
   cierres de gestiones anteriores), y el "Resultado del Ejercicio" se **calcula**
   (Σ ingresos − egresos de la gestión vigente, que aún no tiene asiento de
   cierre). ¿Confirmás este tratamiento dual, o el MVP trata todo el Patrimonio
   como saldos reales sin calcular el Resultado por separado?

3. **Routing**: `GET /api/eeff/balance` (segundo controller `eeff` en el módulo
   `reportes`) vs mantener todo bajo el controller actual. **Recomendación**: un
   `EeffController` separado con `@Controller('eeff')` dentro del mismo módulo
   `reportes` (los EEFF son una familia distinta de los Libros; Change 4 agregará
   `eeff/resultados` al mismo controller). ¿De acuerdo?

> Si Marco no responde, el spec/design asumirá los **defaults recomendados**:
> P1 → `fecha` + inferencia de gestión; P2 → tratamiento dual; P3 → `EeffController`.

## Riesgos / invariantes en juego

| Riesgo | Likelihood | Mitigación |
|--------|------------|------------|
| JOIN/agregado sin filtro `organizationId` → fuga cross-tenant (Anti-31, §4.2) | High | `lc.organizationId = $tenant` SIEMPRE como primer predicado en AMBAS queries; test obligatorio con 2 tenants y datos en el mismo rango |
| `esContraria` ignorada → Activo inflado (Depreciación no resta) | High | Tests con cuenta contraria (Depreciación Acumulada en ACTIVO/ACREEDORA); el grupo resta su saldo; caso documentado en el spec |
| Resultado del Ejercicio divergente entre Balance y futuro Estado de Resultados | High | Opción (b): misma fuente de verdad (port de saldos compartido); Change 4 reusa el mismo helper |
| Propagación jerárquica incorrecta (doble conteo si una agrupadora tuviera movimientos, o hijos huérfanos) | Med | Solo `esDetalle=true` aporta saldo; agrupadoras solo suman hijos; test con árbol de 3-4 niveles; validar nivel = parent.nivel+1 (ya invariante del schema) |
| Incluir BORRADOR en saldos | Med | Estado FIJO `IN (CONTABILIZADO, BLOQUEADO)`; test negativo |
| Montos serializados como `number` (pierde precisión IEEE-754) | Med | DTO `string`; cálculo con `Money`/`Decimal`; test de forma JSON |
| Ecuación contable no cuadra por redondeo | Low | Tolerancia ±Bs 0.01 (§4.1); `cuadra` + `diferencia` como dato de salida, no error duro; el descuadre real (datos corruptos) se ve en la diferencia |
| Inferir mal la gestión del "Resultado del Ejercicio" a partir de `fecha` | Med | Resolver vía `PeriodosReaderPort`; cubierto por P1 — confirmar con Marco antes del spec |
| Volumen alto degrada el agregado (gestión completa, todas las cuentas) | Low | Índices existentes cubren el JOIN; volumen PyME ~15k líneas; un solo agregado en una pasada |

### Invariantes CLAUDE.md tocados
- §4.1 partida doble / ecuación contable (`Activo = Pasivo + Patrimonio`, ±Bs 0.01).
- §4.2 multi-tenant estricto (defense in depth en `$queryRaw`).
- §4.5 dinero = Decimal/string, nunca `number`.
- §4.6 `FechaContable` calendario puro (fecha de corte sin hora/UTC).
- §4.7 anulados excluidos por default.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/reportes/ports/balance-reader.port.ts` | New | Port de lectura del Balance (saldos hoja ≤ corte + estructura de cuentas) |
| `backend/src/reportes/adapters/prisma-balance-reader.adapter.ts` | New | Adapter Prisma `$queryRaw` agregado + findMany estructura; filtra `organizationId` |
| `backend/src/reportes/balance-general.service.ts` | New | Árbol jerárquico, propagación, `esContraria`, Resultado del Ejercicio, cuadre |
| `backend/src/reportes/domain/saldo-naturaleza.ts` | New | Helper compartido signo-por-naturaleza (extraído del Mayor, sin cambio de comportamiento) |
| `backend/src/reportes/domain/balance-errors.ts` | New | DomainErrors `REPORTES_BALANCE_*` |
| `backend/src/reportes/dto/balance-query.dto.ts` | New | Query params (fecha de corte, gestionId?, incluirAnulados?) |
| `backend/src/reportes/dto/balance-response.dto.ts` | New | DTO árbol anidado (montos `string`, fechas `"YYYY-MM-DD"`) |
| `backend/src/reportes/eeff.controller.ts` | New (o modificar el existente) | `obtenerBalanceGeneral()` con Guards + permiso eeff |
| `backend/src/reportes/reportes.module.ts` | Modified | Bindings del port/adapter/service del Balance; import `OrgConfigReader` si P2 lo exige |
| `backend/src/reportes/libro-mayor.service.ts` | Modified (refactor) | Reusar `saldo-naturaleza.ts` extraído (sin cambio funcional; cubierto por tests existentes) |

## Dependencies

- Datos existentes (sin migración): `Comprobante` (`fechaContable`, `estado`,
  `anulado`), `LineaComprobante` (`organizationId`, `cuentaId`, `debitoBob`,
  `creditoBob`), `Cuenta` (`claseCuenta`, `subClaseCuenta`, `naturaleza`,
  `esContraria`, `esDetalle`, `parentId`, `nivel`, `codigoInterno`, `nombre`,
  `activa`).
- Posible: `OrgConfiguracionContable` (`resultadoEjercicioId`,
  `resultadosAcumuladosId`) — solo si P2 confirma el tratamiento dual; se leería
  vía un reader cross-module (a definir en design si aplica).
- `PeriodosReaderPort` (ya importado por `reportes` vía `PeriodosReaderModule`)
  para inferir la gestión de la fecha de corte (P1).
- Permiso `contabilidad.eeff.read` ya en el catálogo RBAC.
- Módulo `reportes/` ya existe (Diario + Mayor); patrón a seguir.

## Rollback Plan

Revertir el PR (squash). Cambios aditivos: el endpoint del Balance no toca el
contrato del Diario ni del Mayor. La única modificación a código existente es la
extracción del helper `saldo-naturaleza.ts` desde `libro-mayor.service.ts` (sin
cambio de comportamiento, cubierto por los tests del Mayor). Quitar los bindings
del Balance de `reportes.module.ts` y el controller/método. Sin migraciones, sin
datos afectados (solo lectura).

## Success Criteria

- [ ] `GET /api/eeff/balance` devuelve el árbol Activo / Pasivo / Patrimonio con
      subtotales por subclase (Corriente/No Corriente), saldos `string`, fecha de
      corte `"YYYY-MM-DD"`.
- [ ] Los saldos hoja se calculan con signo por `naturaleza` y se propagan
      correctamente a los agrupadores (`esDetalle=false`).
- [ ] Las cuentas `esContraria=true` se RESTAN del total de su grupo (test con
      Depreciación Acumulada).
- [ ] El Patrimonio incluye el **Resultado del Ejercicio** = Σ ingresos − Σ egresos
      de la gestión vigente, con la MISMA fuente de verdad que reutilizará el
      Estado de Resultados (Change 4).
- [ ] La respuesta expone `cuadra` (`|Activo − (Pasivo + Patrimonio)| ≤ 0.01`) y la
      `diferencia`.
- [ ] BORRADOR nunca afecta saldos; anulados excluidos por default, incluibles con
      `incluirAnulados=true`.
- [ ] Cuentas hoja con saldo 0 omitidas; agrupadoras estructurales preservadas
      según la regla de la Decisión 6.
- [ ] Multi-tenant verificado con test de 2 tenants en la misma fecha de corte (sin
      fuga).
- [ ] Cobertura ≥ 95% en la lógica de dominio del Balance (§7.5); cero migración.
