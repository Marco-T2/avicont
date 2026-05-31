# Archive report — reportes-balance-general

**Archivado**: 2026-05-31
**Merge**: PR #75, squash commit `999c38e`
**Artifact store**: hybrid

## Resumen

Change que implementó el Balance General (Estado de Situación Financiera) como
tercer reporte del módulo `reportes/` y primer Estado Financiero oficial. Backend-only.
Introduce propagación jerárquica de saldos (hoja → agrupador), cuentas contrarias
(`esContraria=true`, restan del grupo), Resultado del Ejercicio como línea sintética
en Patrimonio, y verificación de ecuación contable.

## Lo entregado

- Endpoint `GET /api/eeff/balance?fecha=YYYY-MM-DD` con RBAC (`contabilidad.eeff.read`).
- Dentro del módulo `reportes`: port `BalanceReaderPort`, service `BalanceGeneralService`,
  adapter Prisma `PrismaBalanceReaderAdapter`, controller `EeffController` y DTO de
  respuesta `BalanceResponseDto`.
- Helper compartido `reportes/domain/saldo-naturaleza.ts` extraído desde el Libro Mayor:
  garantiza que Balance y Mayor usen la misma fórmula de naturaleza (REQ-BG-16).
- Poda de ramas vacías: hojas con saldo 0, agrupadoras sin descendientes con saldo y
  subsecciones sin contenido se omiten. Solo las 3 secciones raíz (Activo/Pasivo/Patrimonio)
  se preservan siempre (estilo QuickBooks/Sage, §10.9 CLAUDE.md).
- Sin migración: cero cambios en `schema.prisma`.
- Tests: 241 unit/integration + 16 E2E, todos verdes. Lint y typecheck limpios.

## Spec canónica generada

`openspec/specs/balance-general/spec.md`

La spec canónica refleja la implementación real:
- Codes de error: `REPORTES_BALANCE_FECHA_INVALIDA` y `REPORTES_BALANCE_SIN_GESTION`
  (prefijo `REPORTES_*` consistente con el módulo — override documentado en `tasks.md`).
- Shape DTO plano: `subsecciones[].cuentas[]` con campo `nivel` para jerarquía
  (sin capa intermedia `grupos`; nombres de campos: `totalBob`, `subClaseCuenta`,
  `diferenciaBob`, `resultadoEjercicioBob`, `saldoBob`).
- Decisión de poda (`esContraria` en REQ-BG-08 expandido) documentada explícitamente.

## Verify report

`openspec/changes/archive/2026-05-31-reportes-balance-general/verify-report.md`

Estado final: **APROBADO_CON_WARNINGS**.

| Hallazgo | Estado al archivar |
|----------|--------------------|
| WARNING-01: codes `REPORTES_BALANCE_*` divergían de spec original | Cerrado — spec canónica usa los codes reales de implementación |
| WARNING-02: E2E no asertaba `code` en 400 por fecha ausente/formato | Cerrado — commit `3f17f72` agregó test con fecha semánticamente inválida (`2026-02-30`) que aserta `REPORTES_BALANCE_FECHA_INVALIDA` |
| SUGGESTION-01: shape DTO divergía de spec original | Cerrado — spec canónica refleja el shape real del DTO (`subsecciones[].cuentas[]` con `nivel`) |

## Trazabilidad REQ-BG cubiertos

| REQ | Descripción breve | Cobertura |
|-----|------------------|-----------|
| REQ-BG-01 | Fecha obligatoria, `REPORTES_BALANCE_FECHA_INVALIDA` | COMPLETA |
| REQ-BG-02 | Inferencia gestión vigente, `REPORTES_BALANCE_SIN_GESTION` | COMPLETA |
| REQ-BG-03 | BORRADOR excluido siempre | COMPLETA |
| REQ-BG-04 | Toggle `incluirAnulados` | COMPLETA |
| REQ-BG-05 | Saldo neto por naturaleza (DEUDORA/ACREEDORA) | COMPLETA |
| REQ-BG-06 | Propagación jerárquica hoja → agrupador | COMPLETA |
| REQ-BG-06b | Sin doble conteo | COMPLETA |
| REQ-BG-07 | Cuentas contrarias restan del grupo | COMPLETA |
| REQ-BG-08 | Omisión de ramas vacías (poda) | COMPLETA |
| REQ-BG-09 | Resultado del Ejercicio en Patrimonio (línea sintética) | COMPLETA |
| REQ-BG-10 | Estructura árbol Activo/Pasivo/Patrimonio | COMPLETA |
| REQ-BG-11 | `cuadra` + `diferenciaBob`, tolerancia ±Bs 0.01 | COMPLETA |
| REQ-BG-12 | Multi-tenant aislamiento estricto (CRÍTICO) | COMPLETA |
| REQ-BG-13 | RBAC `contabilidad.eeff.read` | COMPLETA |
| REQ-BG-14 | Sin plan de cuentas → Balance en cero | COMPLETA |
| REQ-BG-15 | Forma DTO, montos string | COMPLETA |
| REQ-BG-16 | Helper `saldo-naturaleza.ts` compartido con Mayor | COMPLETA |

## Estado

Implementación completa y verificada en `main` (commit `999c38e`). La spec canónica
vive en `openspec/specs/balance-general/spec.md` como fuente de verdad del
contrato API del Balance General.
