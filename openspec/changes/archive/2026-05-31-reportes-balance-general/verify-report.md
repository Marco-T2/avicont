<!--
Última edición: 2026-05-31
Última revisión contra core: 2026-05-31
Owner: backend-lead
-->

# Verify Report — Balance General (backend)

> Change: `reportes-balance-general`
> Branch: `feat/reportes-balance-general`
> Reviewer: sdd-verify (sub-agente adversarial independiente)
> Fecha: 2026-05-31

---

## Status: APROBADO_CON_WARNINGS

---

## Executive Summary

La implementación cubre correctamente los invariantes críticos del dominio: multi-tenant estricto (defense in depth en las 3 queries), `esContraria` se resta correctamente del grupo, montos serializados como `string` vía `Money.toBob()`, `GestionNoEncontradaError` retorna HTTP 422, y la propagación jerárquica no tiene doble conteo. Todos los tests corren verde: 241 unit/integration + 16 E2E.

Dos hallazgos WARNING y un SUGGESTION. Ningún CRITICAL.

---

## Tests Corridos

| Suite | Resultado | Counts |
|-------|-----------|--------|
| `pnpm exec tsc --noEmit` | VERDE | 0 errores |
| `pnpm run lint` | VERDE | 0 warnings/errors |
| `jest src/reportes src/periodos-fiscales` (unit + integration) | VERDE | 241 passed, 16 suites |
| `jest test/balance-general.e2e-spec.ts` (E2E) | VERDE | 16 passed, 1 suite |

---

## Hallazgos

### WARNING-01: Divergencia de error codes entre spec y implementación (REQ-BG-01)

**Archivo**: `backend/src/reportes/domain/balance-errors.ts:23`

**Descripción**: La spec (REQ-BG-01, tabla de códigos) define el código como `BALANCE_GENERAL_FECHA_INVALIDA`. La implementación usa `REPORTES_BALANCE_FECHA_INVALIDA`. Esta decisión está documentada en `tasks.md` (preamble línea 17) como override deliberado para consistencia con el prefijo de módulo `REPORTES_*`. Sin embargo, el contrato público del error code (§6.3 CLAUDE.md: "IDs estables hacia el cliente") diverge de lo que la spec prometió al cliente del API.

**Impacto**: Si hay consumers de la API que ya codificaron contra `BALANCE_GENERAL_FECHA_INVALIDA` (documentación externa, frontend), recibirán `REPORTES_BALANCE_FECHA_INVALIDA` en cambio. La spec también aplica a `BALANCE_GENERAL_FECHA_SIN_GESTION` → implementado como `REPORTES_BALANCE_SIN_GESTION`.

**Acción recomendada**: Actualizar la spec para reflejar los códigos finales (`REPORTES_BALANCE_*`) o revertir la decisión de tasks.md. La spec es el contrato externo; no puede divergir en silencio.

---

### WARNING-02: E2E no verifica el `code` del error 400 fecha inválida (REQ-BG-01)

**Archivo**: `backend/test/balance-general.e2e-spec.ts:246-266`

**Descripción**: Los dos tests de `400 sin ?fecha` y `400 con fecha formato inválido` solo assertan `expect(res.status).toBe(400)`. NO verifican `res.body.error?.code`. Para el caso de fecha ausente, la intercepta el ValidationPipe de NestJS (antes de llegar al service), por lo que el código `REPORTES_BALANCE_FECHA_INVALIDA` del `FechaCorteInvalidaError` es inalcanzable para ese path específico. El code comentado en el título del test ("400 sin ?fecha → code REPORTES_BALANCE_FECHA_INVALIDA") no se verifica.

**Detalle técnico**: `FechaCorteInvalidaError` sí es alcanzable cuando la fecha pasa el regex `^\d{4}-\d{2}-\d{2}$` pero es inválida semánticamente (ej. `2026-02-30`, `2026-13-45`). Para esos casos el code sería correcto. Sin embargo, el E2E solo prueba `?fecha` ausente (ValidationPipe) y `31-05-2026` (ValidationPipe), ambos interceptados antes del service.

**Acción recomendada**: Agregar un test que use una fecha que pase el regex pero falle semánticamente (ej. `2026-02-30`) y aserte `res.body.error?.code === 'REPORTES_BALANCE_FECHA_INVALIDA'`. Esto cierra el gap de cobertura de REQ-BG-01.

---

### SUGGESTION-01: DTO shape diverge de la spec REQ-BG-15 (forma del árbol)

**Archivos**: `backend/src/reportes/dto/balance-response.dto.ts`, `openspec/changes/reportes-balance-general/spec.md:523-564`

**Descripción**: La spec REQ-BG-15 define una forma con `subSecciones[].grupos[].cuentas[]` (tres niveles: subsección → grupo → cuentas hoja). El design §7.2 y la implementación adoptan una forma más plana: `subsecciones[].cuentas[]` con `nivel` para indicar la jerarquía. Diferencias en nombres de campos:

| Campo spec | Campo implementación |
|-----------|---------------------|
| `activo.total` | `activo.totalBob` |
| `subSecciones` | `subsecciones` |
| `subClase` | `subClaseCuenta` |
| `grupos[].total` | (no hay grupos, `cuentas` planas con nivel) |
| `diferencia` | `diferenciaBob` |
| `patrimonio.resultadoEjercicio` | `resultadoEjercicioBob` (raíz) + línea sintética |
| `saldo` (en cuenta) | `saldoBob` |

La decisión está documentada en design §7.2 ("anidamiento por subClaseCuenta con detalle de cuentas hoja/agrupadoras planas"). El design puede override la spec en detalles de implementación. Sin embargo, la spec es el documento que el frontend léerá para saber qué esperar del endpoint. Hoy el frontend no existe, así que no hay impacto inmediato.

**Acción recomendada**: Actualizar la spec REQ-BG-15 para reflejar la forma real del DTO. Previene confusión cuando el frontend implemente el Balance.

---

## Invariantes Críticos

| Invariante | Estado | Evidencia |
|-----------|--------|-----------|
| **Multi-tenant (§4.2)** — queries filtran `organizationId` | **PASS** | `lc."organizationId" = ${tenantId}` como PRIMER predicado en los 3 `$queryRaw`/`findMany`. Test integration 2-tenants verde. E2E multi-tenant verde (8000 ≠ 9999). |
| **esContraria** — resta del grupo, no suma | **PASS** | Lógica en propagación (línea 132-134) + en `ensamblarSeccion` para roots (línea 291-292). Test dominio espejo del REQ-BG-07 verde (10000−2000=8000). E2E verde (10000−10000=0). |
| **Money = string (§4.5)** — montos nunca `number` | **PASS** | Toda serialización vía `Money.toBob()` en el mapper. DTOs con campos `string`. Tests de forma verifican tipo string. |
| **BORRADOR excluido** | **PASS** | `c.estado IN ('CONTABILIZADO','BLOQUEADO')` fijo en ambas queries. Tests integration y E2E verifican. |
| **Anulados por default excluidos** | **PASS** | `AND c.anulado = false` en rama false. Toggle propagado a ambas queries. |
| **Sin migración** | **PASS** | `schema.prisma` sin cambios en la diff. Cero migrations nuevas. |
| **FechaContable calendario puro** | **PASS** | Construcción explícita con `Date.UTC`. `parseFechaContable` valida año/mes/día post-parse. |
| **No doble conteo (REQ-BG-06b)** | **PASS** | Solo `esDetalle=true` tiene saldo propio; agrupadores arrancan en 0 y acumulan hijos. `ensamblarSeccion` suma únicamente nodos raíz de la subclase. Test 4 niveles verde. |
| **Resultado del Ejercicio — línea sintética** | **PASS** | `cuentaId:null`, `esSintetica:true`, no se inyecta en saldo real de cuenta de cierre. |
| **Cuadre ecuación** | **PASS** | `|Activo − (Pasivo+Patrimonio)| ≤ Money.TOLERANCIA_BOB (0.01)`. HTTP 200 siempre. |

---

## Trazabilidad REQ-BG

| REQ | Cobertura | Notas |
|-----|-----------|-------|
| REQ-BG-01 (fecha obligatoria YYYY-MM-DD) | PARCIAL | Status 400 cubierto. **Code no asertado en E2E** (ver WARNING-02). |
| REQ-BG-02 (inferencia gestión vigente, 422) | COMPLETA | Unit + E2E. Code `REPORTES_BALANCE_SIN_GESTION` asertado en E2E. |
| REQ-BG-03 (BORRADOR excluido) | COMPLETA | Integration + E2E. |
| REQ-BG-04 (toggle incluirAnulados) | COMPLETA | Integration + E2E. |
| REQ-BG-05 (saldo neto por naturaleza) | COMPLETA | Unit (saldo-naturaleza + balance-arbol). |
| REQ-BG-06 (propagación jerárquica) | COMPLETA | Unit (árbol 3-4 niveles). Sin E2E con árbol real multinivel (no CRITICAL, dominio testeado). |
| REQ-BG-06b (sin doble conteo) | COMPLETA | Unit específico 4 niveles. |
| REQ-BG-07 (esContraria, CRÍTICO) | COMPLETA | Unit + E2E. |
| REQ-BG-08 (omisión saldo 0) | COMPLETA | Unit (hoja y agrupador). |
| REQ-BG-09 (Resultado del Ejercicio) | COMPLETA | Unit + E2E (línea sintética, cuentaId null). |
| REQ-BG-10 (estructura árbol Activo/Pasivo/Patrimonio) | COMPLETA | E2E 3 secciones presentes. |
| REQ-BG-11 (cuadra + diferencia) | COMPLETA | Unit (tolerancia 0.01) + E2E (diferenciaBob string). |
| REQ-BG-12 (multi-tenant, CRÍTICO) | COMPLETA | Integration 2 tenants + E2E 8000≠9999. |
| REQ-BG-13 (RBAC contabilidad.eeff.read) | COMPLETA | E2E 401/403/200. |
| REQ-BG-14 (sin plan de cuentas → balance en cero) | COMPLETA | E2E + unit service. |
| REQ-BG-15 (forma DTO, montos string) | PARCIAL | Montos/fecha cubiertos. **Shape difiere de spec** (ver SUGGESTION-01, shape del design aplicado). |
| REQ-BG-16 (helper saldo-naturaleza extraído) | COMPLETA | saldo-naturaleza.ts + Mayor rewired + suites Mayor sin tocar. |

---

## Desviaciones del Apply vs Spec/Design

| Desviación | Evaluación |
|-----------|-----------|
| `GestionNoEncontradaError` → HTTP 422 (spec) vs 404 (design) | **CORRECTO**: spec prevalece (422 es más semánticamente preciso para este caso). |
| Doble conteo corregido | Verificado: la corrección es correcta. Solo `esDetalle=true` tiene saldo propio; agrupadores puros arrancan en 0. No hay doble conteo. |
| E2E fecha inválida solo verifica status 400, no code dominio | Gap real: `REPORTES_BALANCE_FECHA_INVALIDA` no asertado para los paths cubiertos por ValidationPipe (ver WARNING-02). El code sí es alcanzable para fechas semánticamente inválidas. |
| Error codes `REPORTES_BALANCE_*` (no `BALANCE_GENERAL_*`) | Decisión documentada en tasks.md. Spec debe actualizarse (ver WARNING-01). |
| DTO shape: plana (subsecciones → cuentas) en vez de `grupos` anidados | Design §7.2 override consciente. Spec debe actualizarse (ver SUGGESTION-01). |

---

## Veredicto

**APROBADO_CON_WARNINGS**

La implementación es sólida en todos los invariantes críticos de dominio y seguridad. Los dos WARNINGs son de documentación/testing (codes de error y shape del DTO divergen de la spec; E2E no aserta el code del 400). Ninguno afecta el comportamiento en runtime. Se recomienda resolverlos antes del merge para mantener la spec como fuente de verdad del contrato API.

`skill_resolution: injected`
