# Frontend del Estado de Flujo de Efectivo (EFE) — Propuesta

> Fecha: 2026-06-16
> Fase: proposal del change `flujo-efectivo-frontend`
> Proyecto: avicont
> Capability: `estado-flujo-efectivo` (la misma del backend; este change AGREGA la capa frontend)
> Alcance: FRONTEND-ONLY

---

## Intent

El backend del EFE por método indirecto ya está en `main` (PR #211): endpoint
`GET /api/eeff/flujo-efectivo` + `EstadoFlujoEfectivoResponseDto` ya generado en
`frontend/src/types/api.generated.ts`. **Falta la UI.**

Este change construye la pantalla del EFE en el frontend, clonando el molde del
reporte hermano más reciente: el **EEPN** (`frontend/src/features/evolucion-patrimonio/`,
PR #210). Es un clon mecánico de estructura — sin decisiones arquitectónicas
grandes. Las únicas variaciones de forma respecto del EEPN nacen de la forma del
DTO del EFE (3 secciones de actividad + conciliación de efectivo, vs. la lista de
componentes del EEPN). Ver `design.md`.

## Scope

### In scope

- Feature `frontend/src/features/flujo-efectivo/` con la estructura screaming
  estándar (`api/ hooks/ components/ pages/ schemas/ lib/`).
- Alias `EstadoFlujoEfectivoResponse` en `frontend/src/types/api.ts` (gap: el DTO
  existe en `api.generated.ts` pero no tiene fachada en `api.ts`).
- Filtro período XOR rango + toggle `incluirAnulados` (sin `gestionId` — el
  endpoint del EFE no lo expone, a diferencia del EEPN).
- Render de las 3 secciones de actividad (OPERACIÓN / INVERSIÓN / FINANCIACIÓN)
  con sus subtotales, la línea de **resultado del ejercicio** como punto de
  partida del método indirecto, y el bloque de **conciliación**
  (efectivoInicial → variaciónNeta → efectivoFinal) con indicador de cuadre.
- Señales de calidad VISIBLES (no muertas en el JSON): `advertencias[]` y
  `cuentasEfectivoDetectadasPorHeuristica[]`.
- Export a Excel gateado por `contabilidad.eeff.read` (reusa `@/lib/export-excel`,
  §4.5 monto string→celda numérica SIN recalcular, §4.6 fecha sin UTC).
- Ruta `/eeff/flujo-efectivo` (gateada por `contabilidad.eeff.read`).
- Ítem de sidebar en la sección Contabilidad (icono `Droplet`, vertical
  `CONTABILIDAD`).
- Tests: schema, mapeador de export, y tabla (render / descuadre / empty / error).

### Out of scope

- **Backend**: ya está en `main` (PR #211). Cero cambios de backend, cero
  migración, cero DTO nuevo.
- **Clasificación manual de `actividadFlujo`**: la UI para que el contador marque
  cuentas con su actividad (EFECTIVO/OPERACION/INVERSION/FINANCIACION) queda
  DIFERIDA. Hoy el backend funciona con la heurística por defecto; esta pantalla
  solo MUESTRA las cuentas detectadas por heurística como señal de calidad. (El
  backend tampoco lo expone aún en `CreateCuentaDto`/`UpdateCuentaDto`.)
- **Permiso nuevo**: reusa `contabilidad.eeff.read` (heredado, igual que todos los
  EEFF). Cero cambios al catálogo RBAC.

## Enfoque

Clon 1:1 del EEPN como molde, file por file:

| EEPN (molde) | EFE (este change) |
|---|---|
| `pages/evolucion-patrimonio-page.tsx` | `pages/flujo-efectivo-page.tsx` |
| `hooks/use-evolucion-patrimonio.ts` | `hooks/use-flujo-efectivo.ts` |
| `api/get-evolucion-patrimonio.ts` | `api/get-flujo-efectivo.ts` |
| `components/evolucion-patrimonio-filtros.tsx` | `components/flujo-efectivo-filtros.tsx` |
| `components/evolucion-patrimonio-tabla.tsx` | `components/flujo-efectivo-tabla.tsx` |
| `schemas/evolucion-patrimonio-filtro-schema.ts` | `schemas/flujo-efectivo-filtro-schema.ts` |
| `lib/exportar-evolucion-patrimonio.ts` + `.test.ts` | `lib/exportar-flujo-efectivo.ts` + `.test.ts` |
| `components/boton-exportar-evolucion-patrimonio.tsx` | `components/boton-exportar-flujo-efectivo.tsx` |
| `components/evolucion-patrimonio-tabla.test.tsx` | `components/flujo-efectivo-tabla.test.tsx` |

El filtro/schema/api son idénticos salvo que el EFE **NO tiene `gestionId`** (su
schema ya es período XOR rango, que es exactamente lo que el EEPN dejó). La
diferencia real está en la TABLA y el EXPORT, por la forma del DTO (secciones +
conciliación + líneas con `tipo` enum, vs. la lista plana de componentes del EEPN).

## Riesgos

- **R1 — Estructura del render distinta al EEPN**: el EFE no es una tabla plana de
  filas homogéneas; son 3 secciones con subtotal + una línea de arranque
  (resultado del ejercicio) + un bloque de conciliación. Mitigación: el `design.md`
  fija el layout (bloques por sección + footer de conciliación reutilizando el
  patrón `CuadreFooter` del EEPN). Riesgo bajo, es composición de patrones ya
  existentes.
- **R2 — `tipo` enum de las líneas**: `LineaFlujoDto.tipo` es un enum
  (`RESULTADO_EJERCICIO` | `PARTIDA_NO_MONETARIA` | `VARIACION_CAPITAL_TRABAJO` |
  `VARIACION_CUENTA`). Si se muestra crudo, es ruido técnico para el contador.
  Mitigación: mapa de etiquetas legibles en español (ver `design.md`).
- **R3 — Señales de calidad olvidadas**: el patrón del EEPN no tiene
  `advertencias`/heurística. Riesgo de que se rendericen "muertas" o se omitan.
  Mitigación: requirement explícito en el delta spec + bloque visual dedicado.
- **R4 — Conciliación: efectivo es ancla, NO sección**: error conceptual de
  mostrar el efectivo como una 4.ª actividad. Mitigación: el efectivo va SOLO en
  el bloque de conciliación (inicial / variación neta / final), separado de las 3
  secciones. Documentado en el delta spec y el design.
