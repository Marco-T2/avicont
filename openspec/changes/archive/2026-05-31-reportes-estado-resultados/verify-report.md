# Verification Report — reportes-estado-resultados

**Change**: reportes-estado-resultados (Estado de Resultados, backend-only)
**Mode**: Strict TDD — APROBADO_CON_WARNINGS (tests verde confirmado por orquestador: 0 errores typecheck, 192 unit, 20 integration, 19 E2E estado-resultados, 17 E2E balance)
**Fecha**: 2026-05-31
**Reviewer**: sdd-verify (adversarial, independiente)

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 27 |
| Tasks complete | 27 |
| Tasks incomplete | 0 |

Todas las tareas [x] marcadas. Sin tareas incompletas.

---

## Build & Tests Execution

**Typecheck**: ✅ 0 errores (confirmado por orquestador — `pnpm exec tsc --noEmit -p tsconfig.json`)
**Unit tests**: ✅ 192 passed (suite completa reportes)
**Integration tests**: ✅ 20 passed (adapter Postgres real)
**E2E estado-resultados**: ✅ 19 passed
**E2E balance**: ✅ 17 passed (sin regresión post-rename D-01)
**Coverage**: No ejecutado inline (test runner ya reportó verde por el orquestador).

---

## Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| REQ-ER-01 (3 formas rango) | rango directo válido | `e2e > 200 con JWT válido` | ✅ COMPLIANT |
| REQ-ER-01 | por períodoFiscal | `service.spec > periodoFiscalId válido` | ✅ COMPLIANT |
| REQ-ER-01 | sin rango → 400 RANGO_INVALIDO | `e2e > 400 sin ningún parámetro` | ✅ COMPLIANT |
| REQ-ER-01 | fechaDesde > fechaHasta → 400 | `e2e + service.spec > fechaDesde > fechaHasta` | ✅ COMPLIANT |
| REQ-ER-01 | períodoFiscalId inexistente → 422 | `e2e > 422 SIN_PERIODO` | ✅ COMPLIANT |
| REQ-ER-01 | **sin rango → 400 RANGO_REQUERIDO** | `e2e > usa RANGO_INVALIDO` | ⚠️ PARTIAL — ver WARNING W-1 |
| REQ-ER-01 | **422 PERIODO_NO_ENCONTRADO** | `e2e > usa SIN_PERIODO` | ⚠️ PARTIAL — ver WARNING W-2 |
| REQ-ER-01 | **422 GESTION_NO_ENCONTRADA** | `e2e > usa SIN_GESTION` | ⚠️ PARTIAL — ver WARNING W-2 |
| REQ-ER-02 (flujo sin arrastre) | movimientos previos excluidos (CRÍTICO) | `integration > CRÍTICO: comprobante < fechaDesde NO aparece` | ✅ COMPLIANT |
| REQ-ER-02 | rango sin movimientos → 0, no error | `e2e + service.spec > tenant sin comprobantes` | ✅ COMPLIANT |
| REQ-ER-02 | service NUNCA llama obtenerSaldosHasta | `service.spec > NUNCA llama obtenerSaldosHasta` | ✅ COMPLIANT |
| REQ-ER-03 (BORRADOR excluido) | BORRADOR no contribuye | `e2e + integration > BORRADOR no aporta al flujo` | ✅ COMPLIANT |
| REQ-ER-04 (toggle anulados) | anulados excluidos por default | `e2e > incluirAnulados=false` | ✅ COMPLIANT |
| REQ-ER-04 | anulados incluidos con toggle | `e2e + integration > incluirAnulados=true` | ✅ COMPLIANT |
| REQ-ER-05 (saldo neto flujo) | hoja ACREEDORA: crédito − débito | `resultados-arbol.spec > hoja ACREEDORA` | ✅ COMPLIANT |
| REQ-ER-05 | hoja DEUDORA: débito − crédito | `resultados-arbol.spec > hoja DEUDORA` | ✅ COMPLIANT |
| REQ-ER-06 (propagación + esContraria) | propagación 3 niveles INGRESO | `resultados-arbol.spec > árbol 3 niveles` | ✅ COMPLIANT |
| REQ-ER-06 | cuenta contraria RESTA (CRÍTICO) | `resultados-arbol.spec + e2e > esContraria resta` | ✅ COMPLIANT |
| REQ-ER-06 | sin contrarias → suma normal | `resultados-arbol.spec > grupo sin cuentas contrarias` | ✅ COMPLIANT |
| REQ-ER-07 (omisión saldo 0) | hoja con saldo 0 omitida | `resultados-arbol.spec + e2e > saldo 0 ausente` | ✅ COMPLIANT |
| REQ-ER-07 | agrupador todos hijos 0 omitido | `resultados-arbol.spec > agrupador todos en 0` | ✅ COMPLIANT |
| REQ-ER-08 (Resultado + coincidencia Balance) | resultado positivo (utilidad) | `e2e > resultado positivo + esGanancia=true` | ✅ COMPLIANT |
| REQ-ER-08 | resultado negativo (pérdida) | `e2e + dto.spec > resultadoEjercicio negativo` | ✅ COMPLIANT |
| REQ-ER-08 | **coincidencia Balance vs ER (CRÍTICO)** | `e2e > CRÍTICO: coincidencia Balance vs Estado de Resultados` | ✅ COMPLIANT |
| REQ-ER-09 (árbol Ingreso/Egreso) | estructura 2 secciones | `resultados-arbol.spec + e2e > secciones ingreso/egreso` | ✅ COMPLIANT |
| REQ-ER-09 | solo subsecciones con saldo ≠ 0 | `resultados-arbol.spec + e2e > subsecciones vacías omitidas` | ✅ COMPLIANT |
| REQ-ER-09 | orden codigoInterno ASC | `resultados-arbol.spec > orden por codigoInterno ASC` | ✅ COMPLIANT |
| REQ-ER-10 (multi-tenant CRÍTICO) | dos tenants, sin fuga (CRÍTICO) | `e2e + integration > Tenant A no ve Tenant B` | ✅ COMPLIANT |
| REQ-ER-10 | tenant sin comprobantes → cero, no error | `e2e > tenant sin comprobantes` | ✅ COMPLIANT |
| REQ-ER-11 (RBAC) | sin JWT → 401 | `e2e > 401 sin JWT` | ✅ COMPLIANT |
| REQ-ER-11 | sin permiso → 403 | `e2e > 403 sin permiso` | ✅ COMPLIANT |
| REQ-ER-12 (forma DTO) | montos como string | `e2e + dto.spec > montos string "NNN.NN"` | ✅ COMPLIANT |
| REQ-ER-12 | fechas YYYY-MM-DD en raíz | `e2e + dto.spec > fechaDesde/fechaHasta` | ✅ COMPLIANT |

**Compliance summary**: 30/33 scenarios COMPLIANT, 3 PARTIAL (todos son divergencias spec↔design de error codes — ver Warnings).

---

## Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|-------------|--------|-------|
| REQ-ER-01: tres formas rango | ✅ Implemented | Service implementa prioridad fechas > periodoId > gestionId correctamente |
| REQ-ER-02: flujo sin arrastre | ✅ Implemented | `obtenerSaldosEnRango` nunca `obtenerSaldosHasta` en el service — verificado en código |
| REQ-ER-03: BORRADOR excluido | ✅ Implemented | SQL hardcoded `estado IN ('CONTABILIZADO','BLOQUEADO')` |
| REQ-ER-04: toggle anulados | ✅ Implemented | Flag propagado correctamente al adapter |
| REQ-ER-05: saldo neto flujo | ✅ Implemented | `calcularSaldoNeto` reutilizado de `saldo-naturaleza.ts` |
| REQ-ER-06: esContraria RESTA | ✅ Implemented | `saldoAgrupado.minus(hijoNodo.saldoNeto)` cuando `esContraria=true` |
| REQ-ER-07: omisión saldo 0 | ✅ Implemented | `tieneContenido && !saldoNeto.isZero()` en `recolectarCuentasResultados` |
| REQ-ER-08: Resultado + coincidencia | ✅ Implemented | Mismo port `obtenerSaldosEnRango` — coincidencia por construcción |
| REQ-ER-09: árbol estructura | ✅ Implemented | DOS secciones INGRESO/EGRESO con subsecciones por subClaseCuenta |
| REQ-ER-10: multi-tenant | ✅ Implemented | `organizationId` como primer predicado en todos los $queryRaw y findMany |
| REQ-ER-11: RBAC | ✅ Implemented | `@RequirePermissions('contabilidad.eeff.read')` + `PermissionsGuard` |
| REQ-ER-12: forma DTO | ✅ Implemented | `Money.toBob()` → string; `formatFechaContable` → YYYY-MM-DD |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D-01: rename `BalanceReaderPort` → `EeffSaldosReaderPort` | ✅ Yes | Rename completo en todos los 7 archivos de `reportes/`. Sin referencias viejas en `src/`. (`dist/` tiene artefactos stale pero eso es output de build, no fuente.) |
| D-02: duplicar propagación de flujo (no generalizar) | ✅ Yes | `resultados-arbol.ts` reusa `calcularSaldoNeto` y duplica el patrón de propagación |
| Endpoint `GET /eeff/resultados` en EeffController | ✅ Yes | Implementado correctamente con mismo patrón de guards que `GET /eeff/balance` |
| Errores prefijo `REPORTES_RESULTADOS_*` | ✅ Yes | Prefijo correcto en los 3 errores |
| Hexagonal estricto | ✅ Yes | Service inyecta `EeffSaldosReaderPort` + `PeriodosReaderPort` (no adapters concretos) |
| Dominio puro (`resultados-arbol.ts`) | ✅ Yes | Cero `@Injectable()`, cero imports NestJS/Prisma |
| `parseFechaContable` duplicada (D-02 follow-up) | ⚠️ Deuda documentada | Presente en `balance-general.service.ts` y `estado-resultados.service.ts` como función local — ver WARNING W-3 |

---

## Issues Found

### CRITICAL
Ninguno.

---

### WARNING

**W-1 — Divergencia error code: spec `REPORTES_RESULTADOS_RANGO_REQUERIDO` vs impl `REPORTES_RESULTADOS_RANGO_INVALIDO` para el caso "sin parámetros"**

- **Ubicación**: `spec.md` §REQ-ER-01 + tabla de errores (líneas 68, 88, 445) vs `resultados-errors.ts` + `e2e-spec.ts`
- **Detalle**: La spec define DOS códigos distintos:
  - `REPORTES_RESULTADOS_RANGO_REQUERIDO` (400) → ningún parámetro de rango proporcionado
  - `REPORTES_RESULTADOS_RANGO_INVALIDO` (400) → fechaDesde > fechaHasta o formato inválido
- La implementación (y el design §7) define un solo error `RangoInvalidoError` con código `REPORTES_RESULTADOS_RANGO_INVALIDO` que cubre AMBOS casos. Los tests E2E asumen `RANGO_INVALIDO` para el caso de sin parámetros.
- **Impacto**: El cliente que integre contra la spec observará `RANGO_INVALIDO` donde esperaba `RANGO_REQUERIDO` para el caso "sin parámetros". Rompe el contrato público (§6.3 CLAUDE.md: códigos estables hacia el cliente).
- **Decisión**: El design tomó conscientemente la decisión de colapsar ambos en `RANGO_INVALIDO` ("cubre: ninguna/múltiples formas, fecha mal formada, desde > hasta") pero la spec no fue actualizada. La spec es la fuente de verdad del contrato público.
- **Acción recomendada**: Antes de archive, decidir y documentar: (a) actualizar la spec para que `RANGO_REQUERIDO` no exista y `RANGO_INVALIDO` cubra todo, O (b) agregar `RangoRequeridoError` con código `REPORTES_RESULTADOS_RANGO_REQUERIDO` para distinguir el caso "sin parámetros" del "formato/rango inválido".

**W-2 — Divergencia error codes: spec `PERIODO_NO_ENCONTRADO`/`GESTION_NO_ENCONTRADA` vs impl `SIN_PERIODO`/`SIN_GESTION`**

- **Ubicación**: `spec.md` líneas 71, 98, 447-448 vs `resultados-errors.ts` líneas 47, 68
- **Detalle**:
  - Spec: `REPORTES_RESULTADOS_PERIODO_NO_ENCONTRADO` | Impl: `REPORTES_RESULTADOS_SIN_PERIODO`
  - Spec: `REPORTES_RESULTADOS_GESTION_NO_ENCONTRADA` | Impl: `REPORTES_RESULTADOS_SIN_GESTION`
- **Impacto**: Mismo que W-1 — contrato público roto. Un cliente que espera `PERIODO_NO_ENCONTRADO` recibirá `SIN_PERIODO`.
- **Acción recomendada**: Sincronizar spec o implementación. El design (§7) eligió `SIN_PERIODO`/`SIN_GESTION` conscientemente (más corto, patrón coherente con otros errores del módulo). Actualizar spec.md §REQ-ER-01 y tabla de errores para reflejar los códigos reales.

**W-3 — `parseFechaContable` duplicada en 4 servicios (deuda D-02)**

- **Ubicación**: `libro-diario.service.ts:147`, `libro-mayor.service.ts:331`, `balance-general.service.ts:22`, `estado-resultados.service.ts:26`
- **Detalle**: La misma función está copiada en 4 lugares. El design §5 menciona "extraer a helper común de `reportes/`" como decisión menor de apply, pero no se extrajo. Tampoco hay `reportes/fecha-contable.ts` ni helper compartido.
- **Impacto**: DRY violation. Un bug en el parser debe corregirse en 4 lugares. Riesgo de divergencia silenciosa (ej: `libro-mayor` lanza excepción, `balance-general` y `estado-resultados` retornan `null`).
- **Acción recomendada**: Extraer a `src/reportes/fecha-contable.ts` (o `src/common/fecha-contable.ts` dado que ya es compartido por 4 servicios del mismo módulo) y centralizar. No bloqueante para archive, pero es deuda técnica real.

---

### SUGGESTION

**S-1 — `dist/` contiene artefactos del pre-rename (no es fuente)**

Los archivos compilados en `backend/dist/` aún muestran `balance-reader.port.js`, `PrismaBalanceReaderAdapter`, etc. Esto es esperado si no se hizo `build` después del rename, pero puede confundir a herramientas que lean `dist/` directamente (debugging, análisis estático sobre compiled output). Limpiar `dist/` o hacer un build actualizado antes de deploy.

**S-2 — `parseFechaContable` en `estado-resultados.service.ts` tiene semántica distinta a la de `libro-diario.service.ts`**

- `balance-general.service.ts` y `estado-resultados.service.ts`: retornan `Date | null` (graceful, el caller maneja el null lanzando `DomainError`)
- `libro-diario.service.ts` y `libro-mayor.service.ts`: retornan `Date` (lanzan excepción si falla)

Cuando se extraiga el helper (W-3), elegir una semántica uniforme.

**S-3 — Error code del spec dice "RANGO_REQUERIDO" pero el escenario "`fechaDesde` sin `fechaHasta`" no tiene código propio**

La spec solo tiene `RANGO_REQUERIDO` para "ningún parámetro" y `RANGO_INVALIDO` para "fechaDesde > fechaHasta / formato inválido". El caso de "fechaDesde sin fechaHasta" (una sola fecha) cae en `RANGO_INVALIDO` — lo cual es correcto, pero la spec no lo documenta explícitamente. El test de service cubre el caso. Documentar en spec §REQ-ER-01.

---

## Verdict

### APROBADO_CON_WARNINGS

La implementación es correcta, completa y pasa todos los tests (192 unit + 20 integration + 19 E2E + 0 errores typecheck, confirmado por orquestador). Las invariantes críticas de dominio están bien implementadas:

- Multi-tenant defense in depth: ✅ (`organizationId` primer predicado en todos los queries)
- Flujo sin arrastre histórico: ✅ (NUNCA `obtenerSaldosHasta` en el service de resultados)
- `esContraria` RESTA del grupo: ✅ (verificado en código y E2E)
- Montos como string: ✅ (`Money.toBob()` en todos los campos monetarios)
- DomainError estable, sin HttpException nuevo: ✅
- `new Date()` en service no genera "hoy" — `parseFechaContable` parsea fechas de cliente con `Date.UTC()`: ✅ (mismo patrón que `balance-general.service.ts`)
- Hexagonal estricto: ✅ (service inyecta solo ports)
- D-01 rename completo: ✅ (sin referencias viejas en `src/`)

**Los 3 warnings son divergencias entre spec y design/implementación en nombres de error codes.** La spec no fue actualizada cuando el design eligió nombres distintos. Esto NO rompe la lógica de negocio ni los tests (los tests fueron escritos contra la implementación real), pero SÍ rompe el contrato documental. La acción mínima antes de archive es documentar la decisión: actualizar `spec.md` para reflejar los códigos reales (`RANGO_INVALIDO` colapsa ambos casos, `SIN_PERIODO`, `SIN_GESTION`).
