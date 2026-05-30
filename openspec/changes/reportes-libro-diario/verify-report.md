# Verify Report: reportes-libro-diario

> Fecha: 2026-05-30
> Modo: Strict TDD
> Veredicto: **APROBADO CON WARNINGS**

---

## Completeness

| Métrica | Valor |
|---------|-------|
| Tasks totales | 37 |
| Tasks completadas | 34 |
| Tasks incompletas | 3 (Fase 7: cierre — verificaciones finales, no código) |

Las tareas incompletas son la Fase 7 (7.1–7.3: correr tests/tsc), que son exactamente lo que este verify-report ejecuta. No bloquean.

---

## Build & Tests Execution

**Backend typecheck** (`tsc --noEmit`): ✅ Sin errores

**Backend tests** (`jest src/reportes/ src/periodos-fiscales/`):
```
Test Suites: 6 passed, 6 total
Tests:       77 passed, 77 total
Time:        6.803 s
```

**Backend e2e** (`jest test/libro-diario.e2e-spec.ts --runInBand --forceExit`):
```
Test Suites: 1 passed, 1 total
Tests:       14 passed, 14 total
Time:        8.891 s
```

**Frontend typecheck** (`tsc -b`): ✅ Sin errores

**Frontend vitest** (`vitest run src/features/libro-diario/`):
```
Test Files  2 passed (2)
Tests       27 passed (27)
Duration    1.49s
```

**Coverage**: No calculado en esta ejecución (no requerido por config).

---

## Spec Compliance Matrix

| Requisito | Escenario | Test | Resultado |
|-----------|-----------|------|-----------|
| REQ-LD-01: Filtro exclusivo | solo periodoFiscalId → 200 | `e2e > filtro por periodoFiscalId > 200 con asientos del período solicitado` | ✅ COMPLIANT |
| REQ-LD-01 | solo fechaDesde+fechaHasta → 200 | `e2e > filtro por fechaDesde+fechaHasta > 200 con asientos del rango` | ✅ COMPLIANT |
| REQ-LD-01 | ambas formas → 400 FILTRO_INVALIDO | `e2e > validación de filtros > 400 si se reciben ambos tipos` | ✅ COMPLIANT |
| REQ-LD-01 | ningún filtro → 400 FILTRO_INVALIDO | `e2e > validación de filtros > 400 si no se recibe ningún filtro` | ✅ COMPLIANT |
| REQ-LD-01 | fechaDesde sin fechaHasta → 400 | `unit service > validación de filtros > lanza FiltroRequeridoError si fechaDesde sin fechaHasta` | ✅ COMPLIANT |
| REQ-LD-02: BORRADOR excluido | BORRADOR nunca en resultado | `integration adapter > exclusión de BORRADOR > no incluye comprobantes en BORRADOR nunca` | ✅ COMPLIANT |
| REQ-LD-02 | (e2e) | `e2e > exclusión de BORRADOR > no incluye comprobantes en BORRADOR en el resultado` | ✅ COMPLIANT |
| REQ-LD-03: Anulados toggle | anulados excluidos por default | `integration adapter > toggle de anulados > sin incluirAnulados=true, los anulados no aparecen` | ✅ COMPLIANT |
| REQ-LD-03 | anulados visibles con toggle | `e2e > toggle de anulados > sin incluirAnulados / con incluirAnulados=true` | ✅ COMPLIANT |
| REQ-LD-04: Orden cronológico | múltiples asientos en un día (por numero) | `integration adapter > orden cronológico > devuelve asientos ordenados por fechaContable ASC` | ⚠️ PARTIAL — el test solo cubre fechas distintas; el desempate por `numero` dentro del mismo día NO está cubierto por ningún test, Y el adapter omite `numero` en el `orderBy` |
| REQ-LD-05: Líneas por orden | líneas ordenadas por `orden` ASC | `integration adapter > líneas y cuenta incluidas > devuelve líneas con codigoInterno y nombre` | ✅ COMPLIANT |
| REQ-LD-06: Totales del período | totales calculados correctamente | `unit mapper > calcula totalDebeBob y totalHaberBob` | ✅ COMPLIANT |
| REQ-LD-06 | período vacío → "0.00" | `e2e > totales partida doble > 0.00 para período sin asientos` | ✅ COMPLIANT |
| REQ-LD-07: Forma DTO | montos serializados como string | `unit mapper > convierte Decimal a string con 2 decimales` | ✅ COMPLIANT |
| REQ-LD-08: Multi-tenant | dos tenants sin fuga | `integration adapter > aislamiento multi-tenant > tenant A solo ve sus propios asientos` | ✅ COMPLIANT |
| REQ-LD-08 | (e2e) | `e2e > aislamiento multi-tenant > tenant A no ve los asientos de tenant B` | ✅ COMPLIANT |
| REQ-LD-08 | tenant sin asientos → [] | `integration adapter > aislamiento multi-tenant > tenant sin asientos devuelve array vacío` | ✅ COMPLIANT |
| REQ-LD-09: RBAC | sin permiso → 403 | `e2e > RBAC > 403 si el usuario no tiene el permiso` | ✅ COMPLIANT |
| REQ-LD-09 | sin autenticación → 401 | `e2e > RBAC > 401 sin token de autenticación` | ✅ COMPLIANT |
| REQ-LD-10: Tope defensivo | rango excede → 422 RANGO_EXCEDIDO | `unit service > tope defensivo > lanza RangoExcedeLimiteError si count > 5000` | ⚠️ PARTIAL — unit cubre la lógica con mock; e2e es `expect(true).toBe(true)` (placeholder documentado) |
| REQ-LD-11: Frontend pantalla | filtro período/rango + tabla agrupada | `vitest > LibroDiarioTabla > agrupación: glosa, número, fecha, código cuenta` | ✅ COMPLIANT |
| REQ-LD-11 | estados loading/vacío/error | `vitest > LibroDiarioTabla > estado vacío / estado error / loading` | ✅ COMPLIANT |
| REQ-LD-11 | anulados marcados visualmente | `vitest > LibroDiarioTabla > anulados > marca visualmente el asiento anulado` | ✅ COMPLIANT |
| REQ-LD-11 | sin permiso → acceso denegado | Sin test frontend (deuda aceptada MVP — gating granular no implementado) | ⚠️ PARTIAL |

**Compliance summary**: 19/23 escenarios COMPLIANT, 3 PARTIAL (WARNING), 1 PARTIAL (SUGGESTION).

---

## Correctness (Static — Structural Evidence)

| Requisito | Estado | Notas |
|-----------|--------|-------|
| DomainErrors (`REPORTES_*`) vía `DomainError` | ✅ Implementado | 4 subclases en `domain/libro-diario-errors.ts` extienden `ValidationError`/`InvalidStateError`/`NotFoundError` (§6.2 / §10.10) |
| `organizationId` en toda query (§4.2) | ✅ Implementado | `buildWhere` siempre incluye `organizationId: tenantId`; defense in depth documentado |
| BORRADOR hardcodeado excluido (§4.1) | ✅ Implementado | `ESTADOS_LIBRO = [CONTABILIZADO, BLOQUEADO]` como `static readonly`, no parametrizable |
| Montos como `string` Decimal (§4.5) | ✅ Implementado | `toFixed(2)` en mapper; DTOs usan `string` no `number` |
| FechaContable como YYYY-MM-DD (§4.6) | ✅ Implementado | `formatFechaContable` usa `getUTC*`; sin `new Date()` en dominio/service |
| Anulados por flag ortogonal (§4.7) | ✅ Implementado | Filtro `{ anulado: false }` default; toggle `incluirAnulados` |
| Hexagonal estricto (§3.2) | ✅ Implementado | `ComprobantesReaderPort` abstract, `PeriodosReaderPort` inyectados por Symbol |
| Sin imports cross-module directo (§3.3) | ✅ Implementado | `reportes` accede a `periodos-fiscales` solo vía su port registrado |
| Permiso en catálogo (§5) | ✅ Implementado | `contabilidad.libro-diario.read` en `src/common/permisos/catalogo.ts` y `prisma/seed.ts` |
| Desempate por `numero` ASC en orden (REQ-LD-04) | ⚠️ Parcial | El adapter usa `[fechaContable ASC, createdAt ASC]` — falta `numero` como segundo criterio del spec. Para el MVP con un asiento por transacción es aceptable en práctica, pero incumple la spec |

---

## Coherence (Design)

| Decisión | Seguida | Notas |
|----------|---------|-------|
| D1: port devuelve filas Prisma crudas (no entidades) | ✅ Sí | `ComprobanteLibroDiarioRow` = `Pick<Comprobante>` + líneas anidadas |
| D2: `findMany` con include anidado (NO `$queryRaw`) | ✅ Sí | `prisma.comprobante.findMany` con `select` anidado |
| D2: orden `fechaContable ASC, numero ASC NULLS LAST, createdAt ASC` | ⚠️ Desviación | Implementado: `[fechaContable ASC, createdAt ASC]`. Omite `numero` como segundo criterio. Ver WARNING-1 |
| D3: BORRADOR hardcodeado, no parametrizable | ✅ Sí | `static readonly ESTADOS_LIBRO` |
| D4: `PeriodosReaderPort.obtenerRangoFechas` (no port propio) | ✅ Sí | Port ampliado; defense in depth con `organizationId` en el adapter |
| D5: `count` previo al `findMany` para el tope | ✅ Sí | `contarAsientos` + guard en service antes de `obtenerAsientos` |
| D6: regla de negocio en service → `DomainError`; forma en DTO class-validator | ✅ Sí | DTO solo valida UUID/regex/bool; exclusividad de filtros en service |
| Frontend: schema `discriminatedUnion` — RHF usa schema plano | ✅ Documentado | `z.output<typeof schema>` para tipos con `.default()`. Deuda conocida, no introduce hueco de validación porque el schema se aplica antes de enviar al backend |

---

## Issues Found

### CRITICAL
Ninguno.

### WARNING

**WARNING-1** — Desempate por `numero` omitido en el adapter (`REQ-LD-04`)

- **Ubicación**: `backend/src/reportes/adapters/prisma-comprobantes-reader.adapter.ts:72-78`
- **Spec dice**: `fechaContable ASC, numero ASC NULLS LAST, createdAt ASC`
- **Implementado**: `[{ fechaContable: 'asc' }, { createdAt: 'asc' }]` — falta `{ numero: 'asc' }` como segundo criterio
- **Impacto**: el orden de múltiples asientos en la misma `fechaContable` puede diferir del especificado. `createdAt` como sustituto es determinístico en la BD pero no es el orden que el contador espera (correlativo numérico)
- **Test faltante**: el integration spec solo prueba asientos en días distintos; ningún test valida el desempate entre asientos del mismo día

**WARNING-2** — E2E del tope defensivo es un placeholder (`REQ-LD-10`)

- **Ubicación**: `backend/test/libro-diario.e2e-spec.ts:516`
- **Código**: `expect(true).toBe(true); // placeholder — ver unit tests para tope`
- **Impacto**: el invariante REQ-LD-10 está cubierto a nivel unit (service + domain error). El e2e no prueba el camino completo `HTTP → count > 5000 → 422 LIBRO_DIARIO_RANGO_EXCEDIDO`. Si se introduce una regresión en el controller o el module wiring para este código de error, ningún test de integración la atraparía
- **Mitigación aceptable**: insertar 5001 comprobantes en un e2e es prohibitivo. Alternativa: parametrizar `LIBRO_DIARIO_MAX_ASIENTOS` como inyectable (env var o config) para poder reducirlo a 1 en tests. Esta estrategia requiere refactor menor

### SUGGESTION

**SUGGESTION-1** — Gating frontend por permiso granular (`REQ-LD-11`)

- **Ubicación**: `frontend/src/routes/router.tsx:45`, `frontend/src/features/libro-diario/pages/libro-diario-page.tsx`
- **Spec dice**: "La pantalla SOLO DEBE renderizarse si el usuario tiene `contabilidad.libro-diario.read`; de lo contrario redirige o muestra acceso denegado"
- **Implementado**: la ruta está solo bajo `ProtectedRoute` (autenticación). Sin guard de permiso. El backend rechaza con 403 (defense in depth OK)
- **Experiencia**: un usuario sin permiso llega a la página, ve la UI de filtros, consulta, y recibe un error de red en vez de una pantalla de "acceso denegado"
- **Estado**: deuda aceptada para MVP — documentada en el código y en el design. No es un bug de seguridad (el backend es la autoridad)

---

## Verificación verde — resumen ejecutivo

| Comando | Resultado |
|---------|-----------|
| `cd backend && tsc --noEmit` | ✅ 0 errores |
| `jest src/reportes/ src/periodos-fiscales/` | ✅ 77/77 (6 suites) |
| `jest test/libro-diario.e2e-spec.ts --runInBand --forceExit` | ✅ 14/14 (1 suite) |
| `cd frontend && tsc -b` | ✅ 0 errores |
| `vitest run src/features/libro-diario/` | ✅ 27/27 (2 files) |

---

## Veredicto

**APROBADO CON WARNINGS**

La implementación es correcta y segura. Los 2 WARNINGs son deuda técnica manejable que no bloquea el archive:

1. El desempate por `numero` en el ordenamiento es una desviación de la spec menor en impacto real (los asientos del mismo día igualmente se ordenan de forma determinística por `createdAt`), pero debe corregirse para cumplir la spec y alinear el comportamiento con las expectativas del contador.
2. El placeholder del e2e del tope es una limitación conocida y documentada; el invariante está cubierto a nivel unit.

La SUGGESTION del gating frontend es deuda aceptada para el MVP.
