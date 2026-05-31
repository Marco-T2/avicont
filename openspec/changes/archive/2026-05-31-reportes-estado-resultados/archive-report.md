# Archive Report: reportes-estado-resultados

**Status**: ARCHIVADO COMPLETO
**Fecha de archivado**: 2026-05-31
**Cambio**: reportes-estado-resultados (backend-only, APROBADO_CON_WARNINGS)
**Almacenado en**: `openspec/changes/archive/2026-05-31-reportes-estado-resultados/`
**Spec Canónica**: `openspec/specs/reportes/estado-resultados-spec.md`

---

## Resumen Ejecutivo

El change **reportes-estado-resultados** ha sido completamente archivado tras implementación y verificación exitosa (APROBADO_CON_WARNINGS). Se resolvieron dos warnings de especificación (W-1, W-2) sincronizando los error codes delta spec con la implementación real, y se canonizó la spec en el catálogo oficial.

**Ciclo SDD completado**: exploration → proposal → spec → design → tasks → implementation (apply) → verification (APPROVED_CON_WARNINGS) → **archive** (this phase)

---

## Cambios en Especificación — Resolución de Warnings

### W-1: Error Code `RANGO_REQUERIDO` vs `RANGO_INVALIDO`

**Problema**: spec mencionaba DOS códigos:
- `REPORTES_RESULTADOS_RANGO_REQUERIDO` (cuando no hay parámetros)
- `REPORTES_RESULTADOS_RANGO_INVALIDO` (cuando rango está mal formado)

**Implementación real**: UN código unificado:
- `REPORTES_RESULTADOS_RANGO_INVALIDO` (cubre ambos casos: ausente + formato inválido)

**Resolución**: Se actualizó `spec.md` (líneas 68-70, 87-89, 445-446) para consolidar bajo `RANGO_INVALIDO`:
- Eliminadas referencias a `RANGO_REQUERIDO`
- Documentación clarificada: "rango no proporcionado O mal formado → `RANGO_INVALIDO`"
- Tabla de errores actualizada (3 códigos totales, no 4)
- **Cambios en líneas**: 
  - L68: cambio de `RANGO_REQUERIDO` a `RANGO_INVALIDO`
  - L88-89: actualización de escenario "sin rango — error 400"
  - L445: tabla de errores consolidada

### W-2: Nombres de Error Codes — Long vs Short

**Problema**: spec usaba nombres LARGOS:
- `REPORTES_RESULTADOS_PERIODO_NO_ENCONTRADO`
- `REPORTES_RESULTADOS_GESTION_NO_ENCONTRADA`

**Implementación real**: nombres CORTOS:
- `REPORTES_RESULTADOS_SIN_PERIODO` (en `backend/src/reportes/domain/resultados-errors.ts:47`)
- `REPORTES_RESULTADOS_SIN_GESTION` (en `backend/src/reportes/domain/resultados-errors.ts:68`)

**Resolución**: Se actualizó `spec.md` (líneas 71-72, 96-99, 447-448) para usar nombres cortos:
- Línea 71-72: cambio de `PERIODO_NO_ENCONTRADO` a `SIN_PERIODO`
- Línea 72: cambio de `GESTION_NO_ENCONTRADA` a `SIN_GESTION`
- Línea 98-99: escenario "períodoFiscalId inexistente" actualizado
- Línea 447-448: tabla de errores con códigos cortos
- Todos los escenarios de período/gestión no encontrado renombrados
- Documentación ahora refleja código real testeado

---

## Spec Canónica Creada

- **Ruta**: `openspec/specs/reportes/estado-resultados-spec.md` (NUEVA)
- **Status**: CANONIZADA (spec official para futuros cambios en el módulo `reportes/`)
- **Contiene**: 
  - Propósito y contexto
  - Glosario con 8 términos clave
  - 12 requirements detallados (REQ-ER-01 a REQ-ER-12) con escenarios
  - Tabla de 3 error codes (RANGO_INVALIDO, SIN_PERIODO, SIN_GESTION)
  - Notas regulatorias (NCB, Código Tributario)
  - Deudas técnicas documentadas (D-02: `parseFechaContable` duplicada)
- **Sincronización**: Delta spec de change → spec canónica (merge complete)

---

## Contenido del Change Archivado

Carpeta: `openspec/changes/archive/2026-05-31-reportes-estado-resultados/`

| Artefacto | Tamaño | Status |
|-----------|--------|--------|
| `proposal.md` | 16,605 bytes | Propuesta de capability (scope, riesgos, rollback) |
| `spec.md` | 19,006 bytes | **ACTUALIZADO** (W-1, W-2 resueltos) — delta synced to canon |
| `design.md` | 13,177 bytes | Diseño con DTOs, repositorio, servicio, error handling |
| `tasks.md` | 22,914 bytes | 28 tareas de implementación (todas completadas ✅) |
| `verify-report.md` | 13,940 bytes | Verificación: 12/12 reqs CUMPLIDO, 3 warnings reportados |
| `archive-report.md` | (this file) | Cierre de ciclo SDD, resolución W-1/W-2, canonización |

---

## Verification Report (Resumen)

**Estatus final**: ✅ APROBADO_CON_WARNINGS

Resultados de verificación (fase anterior, sdd-verify):
- **12/12 requerimientos verificados** como CUMPLIDO
- **1/1 test suite de integración** pasando (E2E coverage completa)
- **Escenarios críticos testeados**:
  - Partida doble en rango
  - Multi-tenant aislamiento
  - Filtrado por estado (BORRADOR excluido)
  - Toggle de anulados
  - Propagación jerárquica
  - Coincidencia Balance vs Estado de Resultados

- **3 warnings identificados**:
  - **W-1**: Error code consolidation → RESUELTO en este archive
  - **W-2**: Error code naming alignment → RESUELTO en este archive
  - **W-3**: Deuda técnica D-02 documentada → NO BLOQUEA, follow-up futuro

---

## Multi-Tenant y Seguridad

- ✅ Aislamiento estricto por `organizationId` (REQ-ER-10)
- ✅ Filtros `WHERE organizationId = ?` en todas las queries
- ✅ RBAC: permiso `contabilidad.eeff.read` protege el endpoint
- ✅ No diferencia "no existe" de "no es tuyo" (defense in depth §5.7 CLAUDE.md)
- ✅ JWT.activeTenantId es fuente de verdad para aislamiento

---

## Reglas Contables Verificadas

- ✅ Partida doble en BOB (§4.1 CLAUDE.md)
- ✅ Reporte de **flujo**, no saldo histórico (sin arrastre)
- ✅ Cuentas resultado parten de 0 en rango (REQ-ER-02, CRÍTICO)
- ✅ Estados CONTABILIZADO|BLOQUEADO incluidos; BORRADOR excluido siempre (REQ-ER-03)
- ✅ Anulados excluidos por default; toggle `incluirAnulados` disponible (REQ-ER-04)
- ✅ Fórmula: ACREEDORA=(cré−dé), DEUDORA=(dé−cré) por naturaleza (REQ-ER-05)
- ✅ Propagación jerárquica con `esContraria` (REQ-ER-06)
- ✅ Coincidencia Resultado del Ejercicio con Balance General (mismo port BalanceReaderPort, REQ-ER-08 CRÍTICO)

---

## Deudas Técnicas Documentadas

### D-02: Duplicación de `parseFechaContable` (BAJA PRIORIDAD)

**Ubicación**: Función duplicada en 4 servicios:
- `src/reportes/adapters/libro-diario.repository.ts`
- `src/reportes/adapters/libro-mayor.repository.ts`
- `src/reportes/adapters/balance-general.repository.ts`
- `src/reportes/adapters/estado-resultados.repository.ts`

**Follow-up recomendado**: Extraer a utilidad común
- Ubicación propuesta: `src/reportes/domain/fecha-utils.ts`
- Importar en los 4 adapters
- Estimada: 1-2 horas en próxima sesión contable

**Nota**: La duplicación NO afecta funcionalidad ni seguridad. Es limpieza técnica (DRY), no bug de negocio.

---

## Siguientes Pasos Recomendados

1. **Próxima feature de reportes**: 
   - Reutilizar `BalanceReaderPort.obtenerSaldosEnRango` (ya está en core, no reduplicate)
   - Considerar crear `EstadoFinancieroReportService` base para compartir lógica común

2. **Follow-up técnico D-02** (OPCIONAL, baja urgencia):
   - Extraer `parseFechaContable` a `src/reportes/domain/fecha-utils.ts`
   - Refactor en los 4 adapters
   - Agregar unit tests a la utilidad (1-2 horas)

3. **Próximo change propuesto** (FULL-STACK):
   - **Gating de permisos granular** por módulo (sin `RequireModule` global)
   - Depende de `GET /me/permissions` endpoint (no existe aún)
   - Alto impacto: RBAC fine-grained en todas las features

---

## Ciclo SDD Completado

```
[exploration ✅] → [proposal ✅] → [spec ✅] → [design ✅] → [tasks ✅]
                              ↓
                        [apply ✅] → [verify ✅ WARNINGS] → [ARCHIVE ✅]
```

**Duración**: 2026-05-24 a 2026-05-31 (7 días)
**Commits**: 9 commits en `feat/reportes-estado-resultados`
**Branch**: Sin merge a `main` (a cargo del orquestador)
**Modo**: Hybrid (openspec + engram)
**Team**: Marco Tarqui (backend-lead)

**Status**: ✅ LISTO PARA SIGUIENTE CICLO SDD

---

## Archivos de Referencia

**En el proyecto**:
- Spec canónica: `openspec/specs/reportes/estado-resultados-spec.md`
- Implementación: `backend/src/reportes/` (4 archivos nuevos + 1 modificado)
- Tests: `backend/test/reportes/estado-resultados.e2e-spec.ts`
- Error domain: `backend/src/reportes/domain/resultados-errors.ts`

**En el archive**:
- Propuesta: `proposal.md`
- Diseño: `design.md`
- Tareas: `tasks.md`
- Verificación: `verify-report.md`
- **Este reporte**: `archive-report.md`

**En Engram** (persistent memory):
- Topic key: `sdd/reportes-estado-resultados/archive-report`
- Tipo: architecture
- Proyecto: avicont
- Accesible en futuras sesiones para contexto del change archivado
