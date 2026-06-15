# Proposal — Hoja de Trabajo de 12 columnas (`hoja-trabajo-doce-columnas`)

> Reporte contable backend-only. Quinto reporte del módulo `backend/src/reportes/`.
> Read-only. Sin migración. Sin permiso RBAC nuevo (hereda `contabilidad.eeff.read`).

## Why

La **Hoja de Trabajo de 12 columnas** (worksheet / hoja de trabajo de cierre) es la
herramienta de papel de trabajo que el contador boliviano arma **antes de cerrar el
ejercicio**. Hoy Avicont entrega las piezas sueltas — Balance de Comprobación (sumas y
saldos), Balance General y Estado de Resultados — pero el contador tiene que reconciliar
manualmente la mecánica de cierre: tomar el balance de comprobación, aplicar los asientos
de ajuste, recomputar los saldos ajustados, y derivar a mano qué va al Estado de Resultados
y qué va al Balance General.

La Hoja de Trabajo consolida ese flujo en **una sola hoja auditable de 6 pares de columnas
por cuenta**, mostrando explícitamente la trazabilidad Sumas → Saldos → Ajustes → Saldos
Ajustados → Estado de Resultados → Balance General, más la fila sintética de
utilidad/pérdida del ejercicio que hace cuadrar las dos últimas secciones. Es el insumo
estándar del cierre contable y un control cruzado fuerte: sus Saldos Ajustados DEBEN
coincidir con los Saldos del Balance de Comprobación del mismo rango.

El costo de construirlo es bajo porque reusa casi toda la infraestructura del Balance de
Comprobación (mismo módulo, mismo port, misma mecánica universal de saldos, mismo flujo
XOR rango/período, misma señal de calidad de naturaleza opuesta).

## What Changes

Adiciones acotadas, todas dentro de `backend/src/reportes/`:

- **Dominio puro** — `domain/hoja-trabajo.ts`: builder `construirHojaTrabajo(params)`, 100%
  de cobertura, cero NestJS/Prisma (`import type` permitido). Reusa `calcularSaldoNeto` /
  la lógica de clasificación de `balance-arbol.ts` para `esContraria` y para mapear
  clase → sección.
- **Errores de dominio** — `domain/hoja-trabajo-errors.ts` SOLO si los códigos de error
  del flujo XOR rango/período no son reusables de `balance-comprobacion-errors.ts`. Si se
  pueden reusar tal cual, no se crea archivo nuevo (decisión a confirmar en spec/design).
- **DTOs** — `dto/hoja-trabajo-query.dto.ts` (clon de `balance-comprobacion-query.dto.ts`:
  XOR `desde`/`hasta` vs `periodoFiscalId` + `incluirAnulados`) y
  `dto/hoja-trabajo-response.dto.ts` (tipos internos `*Calculada` con `Money` + DTOs
  `string` + mapper `toHojaTrabajoResponse`).
- **Service** — `hoja-trabajo.service.ts`: inyecta SOLO ports (`EeffSaldosReaderPort` +
  `PeriodosReaderPort`), resuelve el rango, llama la nueva lectura, delega al builder puro,
  mapea a DTO. Espejo casi exacto de `balance-comprobacion.service.ts`.
- **UNA extensión de port** — nuevo método abstracto en `EeffSaldosReaderPort` que devuelve,
  por cuenta de detalle con movimiento en el rango, el **split AJUSTE vs ordinario** (cuatro
  agregados: ordinarioDebito, ordinarioCredito, ajusteDebito, ajusteCredito). Es la ÚNICA
  pieza de infra realmente nueva; las firmas existentes no cambian.
- **Adapter** — nuevo método en `PrismaEeffSaldosReaderAdapter` con agregación condicional
  (`SUM(...) FILTER (WHERE c.tipo = 'AJUSTE')` y bucket ordinario por exclusión), compartiendo
  un helper de WHERE con `obtenerSaldosEnRango` para no driftear el filtro base.
- **Endpoint** — `GET /api/eeff/hoja-trabajo` en `eeff.controller.ts`, gateado con
  `@RequirePermissions('contabilidad.eeff.read')` (el controller ya lleva
  `@RequireModule('contabilidad')` a nivel de clase).
- **DI** — registrar `HojaTrabajoService` en `reportes.module.ts` (reusa el provider
  `EEFF_SALDOS_READER_PORT` existente — NO se crea adapter nuevo).
- **Contrato** — regenerar `backend/openapi.json` + `frontend/src/types/api.generated.ts`
  (regla operativa §10.10: tocar un DTO backend ⇒ regenerar ambos artefactos o CI rojo).

**Explícitamente NO incluye:** ninguna migración Prisma; ningún permiso nuevo en el catálogo
RBAC (hereda `contabilidad.eeff.read`, igual que los otros EEFF); ningún cambio de schema.

## Approach

### Origen de los ajustes: data-derived (Opción A — LOCKED)
Los ajustes NO se persisten ni se proponen: son los comprobantes **tipo `AJUSTE`** ya
contabilizados/bloqueados en el rango. El split lo produce el adapter por agregación
condicional. Cero persistencia, cero estado nuevo.

### Tipos que cuentan como "ordinario" vs "ajuste" vs excluido
`TipoComprobante` tiene 7 valores. Para la Hoja de Trabajo:
- **Ordinario** (columnas Sumas/Saldos): `APERTURA, DIARIO, INGRESO, EGRESO, TRASPASO`.
- **Ajuste** (columnas Ajustes): `AJUSTE`.
- **Excluido de TODO** (LOCKED — la hoja es pre-cierre): `CIERRE`.

El adapter mantiene el estado fijo `c.estado IN ('CONTABILIZADO','BLOQUEADO')` (BORRADOR
nunca) y el toggle `anulado` exactamente como `obtenerSaldosEnRango`. El bucket ordinario
se define por **exclusión** (`c.tipo NOT IN ('AJUSTE','CIERRE')`) para que un tipo nuevo
futuro caiga por default en ordinario, no se pierda silenciosamente; CIERRE se excluye del
WHERE en ambos buckets.

### Matemática de las 12 columnas (6 pares), por cuenta `esDetalle` con movimiento
1. **Sumas: Debe / Haber** = Σ débitos / Σ créditos de comprobantes ordinarios.
2. **Saldos: Deudor / Acreedor** = `MAX(sumasDebe−sumasHaber,0)` / `MAX(sumasHaber−sumasDebe,0)`
   — mecánica universal, NO por naturaleza (idéntico a balance-comprobacion).
3. **Ajustes: Debe / Haber** = Σ débitos / Σ créditos de comprobantes tipo AJUSTE.
4. **Saldos Ajustados: Deudor / Acreedor** =
   `MAX((sumasDebe+ajustesDebe)−(sumasHaber+ajustesHaber),0)` / simétrico.
   **Control cruzado:** estos Saldos Ajustados DEBEN igualar los Saldos del Balance de
   Comprobación del mismo rango (porque BC ya agrega TODO incluyendo AJUSTE; la única
   diferencia es que la Hoja separa AJUSTE en su propia columna y CIERRE queda fuera de
   ambos).
5. **Estado de Resultados: Pérdidas / Ganancias** — por clase de cuenta:
   `EGRESO → saldoAjustadoDeudor` va a Pérdidas; `INGRESO → saldoAjustadoAcreedor` va a
   Ganancias. ACTIVO/PASIVO/PATRIMONIO no aportan a esta sección.
6. **Balance General: Activo / Pasivo-Patrimonio** — por clase de cuenta:
   `ACTIVO → saldoAjustadoDeudor` va a Activo; `PASIVO|PATRIMONIO → saldoAjustadoAcreedor`
   va a Pasivo-Patrimonio. INGRESO/EGRESO no aportan a esta sección.

### Cuentas contrarias (`esContraria`)
Se reusa el criterio de `balance-arbol.ts`: una cuenta contraria invierte el signo de su
aporte al total de su sección (ej. Depreciación Acumulada resta del Activo). En la Hoja de
Trabajo plana esto se aplica al ubicar el saldo ajustado en la columna BG correspondiente
(reflejar el manejo de signo de `balance-arbol.ts`, sin reimplementar la propagación de
árbol — la Hoja es lista plana, no jerarquía).

### Fila sintética de carry-over (utilidad/pérdida del ejercicio)
`utilidadEjercicio = Σganancias − Σpérdidas`.
- Si **positiva (utilidad)**: se suma a la columna **Pérdidas** (para cuadrar el ER:
  Pérdidas pasa a igualar Ganancias) Y a la columna **Pasivo-Patrimonio** (para cuadrar el
  BG: el resultado del ejercicio es patrimonio).
- Si **negativa (pérdida)**: simétrico — se suma a **Ganancias** y a **Activo**.

Tras el carry-over: `ΣbgActivo == ΣbgPasPat` y `ΣPérdidas == ΣGanancias`. La fila lleva
`esSintetica: true` y `cuentaId/codigoInterno = null`, igual que la línea de Resultado del
Ejercicio del Balance General.

### Señales de cuadre (todas ±Bs 0.01 vía `Money.balanceadoEnBobCon`)
`Σsumas Debe==Haber`; `Σsaldos Deudor==Acreedor`; `Σajustes Debe==Haber`;
`ΣsaldosAj Deudor==Acreedor`; post-carry-over `ΣbgActivo==ΣbgPasPat` y `ΣPérdidas==ΣGanancias`.
Un `cuadra` agregado (AND de todas) más las diferencias por par para diagnóstico. Plus se
reusa `cuentasNaturalezaOpuesta` (señal de calidad del balance-comprobacion: DEUDORA con
saldo acreedor o ACREEDORA con saldo deudor) — no afecta totales.

### Anti-drift del WHERE base
El nuevo método del adapter y `obtenerSaldosEnRango` comparten el predicado base
(organizationId primero — Anti-31 §4.2; estado fijo CONTABILIZADO/BLOQUEADO; manejo de
`anulado`; rango de `fechaContable`). Se extrae un helper de fragmento SQL compartido para
que el filtro no diverja entre las dos lecturas (misma cicatriz de drift que ya documentó
balance-comprobacion al reusar el port).

## Out of scope

- **Frontend** — vista + export a Excel de la Hoja de Trabajo: change futuro separado
  (la infra `lib/export-excel` ya existe; se enchufa después, igual que se hizo con
  balance-comprobacion).
- **Opción B** — ajustes propuestos/no contabilizados (borrador de ajustes que se aplican
  solo en el reporte): descartada por ahora; los ajustes son data-derived de comprobantes
  AJUSTE ya posteados.
- **Inclusión de CIERRE** — la hoja es pre-cierre por definición; los comprobantes tipo
  CIERRE quedan fuera de todas las columnas.
- **Export a Excel** del reporte (parte del frontend, futuro).

## Open questions / risks

- **Drift del adapter**: el nuevo método debe compartir el WHERE base con
  `obtenerSaldosEnRango`. Si se copia-pega el SQL sin helper, los dos filtros pueden
  diverger en un cambio futuro. Mitigación: helper de fragmento SQL compartido + test de
  integración que verifique que ordinario+ajuste reproducen el agregado total de
  `obtenerSaldosEnRango` para el mismo rango.
- **Manejo de signo de `esContraria`**: replicar el criterio de `balance-arbol.ts` sin la
  propagación de árbol (lista plana). Confirmar en design exactamente en qué columna BG cae
  una cuenta contraria y con qué signo.
- **Cuentas que solo tienen movimiento de ajuste**: una cuenta con sumas ordinarias en cero
  pero con movimiento AJUSTE en el rango DEBE aparecer como fila (saldo ordinario 0, ajuste
  > 0, saldo ajustado > 0). El builder no debe filtrarla por "sin movimiento ordinario".
- **Multi-moneda**: todas las columnas son en BOB (`*Bob`), igual que el resto de EEFF;
  no se exponen columnas por moneda. Tolerancia ±Bs 0.01 en todos los cuadres.
- **Códigos de error**: confirmar si se reusan los `*Error` de
  `balance-comprobacion-errors.ts` (RANGO_REQUERIDO / RANGO_AMBIGUO / RANGO_INVALIDO /
  PERIODO_NO_ENCONTRADO) o si la Hoja de Trabajo necesita su propio namespace de códigos
  `REPORTE_HOJA_TRABAJO_*` por estabilidad pública del contrato de errores.

## Impact

**Archivos nuevos** (`backend/src/reportes/`):
- `domain/hoja-trabajo.ts` (builder puro)
- `domain/hoja-trabajo-errors.ts` (condicional)
- `dto/hoja-trabajo-query.dto.ts`
- `dto/hoja-trabajo-response.dto.ts`
- `hoja-trabajo.service.ts`

**Archivos modificados:**
- `ports/eeff-saldos-reader.port.ts` (1 método abstracto nuevo + tipo de retorno con 4 agregados)
- `adapters/prisma-eeff-saldos-reader.adapter.ts` (1 método nuevo + helper WHERE compartido)
- `eeff.controller.ts` (1 endpoint nuevo)
- `reportes.module.ts` (registrar `HojaTrabajoService`)
- `backend/openapi.json` + `frontend/src/types/api.generated.ts` (regen)

**Sin cambios:** schema Prisma, migraciones, catálogo RBAC.

**Tests:**
- Unit del builder `domain/hoja-trabajo.spec.ts` (100% cobertura del dominio puro): cada par
  de columnas, derivación ER/BG por clase, `esContraria`, carry-over utilidad y pérdida,
  cuentas solo-ajuste, todas las señales de cuadre con + y −.
- Integración del adapter `*.integration.spec.ts` vs Postgres real: split AJUSTE vs ordinario,
  exclusión de CIERRE, toggle anulados, organizationId scoping (Anti-31), y el control de que
  ordinario+ajuste reproducen el agregado de `obtenerSaldosEnRango`.
- E2E del endpoint `GET /api/eeff/hoja-trabajo`: gating de permiso/módulo, XOR rango/período,
  cross-check de Saldos Ajustados == Saldos del Balance de Comprobación del mismo rango.

**Regresión esperada:** EEFF existentes (Balance General, Estado de Resultados, Balance de
Comprobación) sin tocar — el port solo gana un método, las firmas existentes no cambian.
