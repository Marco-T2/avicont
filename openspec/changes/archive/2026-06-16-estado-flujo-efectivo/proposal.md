# Propuesta — Estado de Flujo de Efectivo (EFE) por método indirecto

> Fecha: 2026-06-16
> Capability: `estado-flujo-efectivo`
> Proyecto: avicont
> Alcance: **BACKEND-ONLY** (frontend explícitamente fuera)

---

## Qué

Agregar el **Estado de Flujo de Efectivo (EFE)** por **método indirecto** como quinto
reporte del módulo `backend/src/reportes/`, expuesto en `GET /api/eeff/flujo-efectivo`.

El reporte parte del **resultado del ejercicio** del período y lo concilia hasta la
**variación neta de efectivo**, clasificando los movimientos en las 3 actividades de la
NIC 7: **operación, inversión y financiación**. El bottom line se cuadra contra la
variación real del efectivo (`efectivo_final − efectivo_inicial`) con tolerancia ±Bs 0.01.

Para clasificar cada cuenta se introduce un campo nuevo **nullable** `actividadFlujo`
(enum `ActividadFlujo` de 4 valores: `EFECTIVO | OPERACION | INVERSION | FINANCIACION`)
en el modelo `Cuenta`. Cuando el campo es `NULL`, el reporte aplica un **default
heurístico** derivado de `subClaseCuenta` / `claseCuenta`, de modo que el reporte
funciona desde el día uno sin necesidad de marcar cuentas manualmente.

## Por qué

- **Obligación normativa**: la NC N°11 (CTNAC/CAUB) obliga a presentar el flujo de
  efectivo dentro del juego de estados financieros. El método se rige supletoriamente
  por la **NIC 7** (Resolución CTNAC 01/2012). Bolivia no tiene norma nacional propia
  del método.
- **Método de facto**: el indirecto es el usado en la práctica boliviana (Formulario 605
  del SIN lo emplea).
- **Completa el juego de EEFF**: Avicont ya tiene Balance General, Estado de Resultados,
  EEPN, Balance de Comprobación y Hoja de Trabajo. El EFE es el estado financiero formal
  que faltaba.

## Cómo (resumen — el detalle va en `design.md`)

- **Cero método nuevo de port**. Se reutiliza `EeffSaldosReaderPort`:
  `obtenerSaldosHasta(diaAnterior(desde))` → saldos INICIALES; `obtenerSaldosHasta(hasta)`
  → saldos FINALES; `obtenerSaldosEnRango(desde, hasta)` → flujo del período (para el
  resultado del ejercicio y las partidas no monetarias); `obtenerEstructuraCuentas`.
  La **variación por cuenta** (final − inicial respetando naturaleza) es el insumo
  central del método indirecto.
- **Única extensión de tipo del port**: `CuentaEstructuraRow` gana el campo
  `actividadFlujo: ActividadFlujo | null` (el adapter lo agrega al `select` de
  `obtenerEstructuraCuentas`). La FIRMA del método NO cambia.
- **Builder de dominio puro** `backend/src/reportes/domain/estado-flujo-efectivo.ts`
  (sin NestJS/Prisma), cobertura ≥95%. El service orquesta y delega.
- **Migración aditiva** (§11.6): `CREATE TYPE "ActividadFlujo"` + `ALTER TABLE "cuentas"
  ADD COLUMN "actividadFlujo" "ActividadFlujo"` (nullable, sin default). Retrocompatible.

## Decisiones ya locked (no se reabren)

1. Método **indirecto** partiendo del resultado del ejercicio.
2. **Enfoque C**: campo `actividadFlujo` nullable + default heurístico al calcular.
3. Enum de dominio en español, 4 valores: `EFECTIVO | OPERACION | INVERSION | FINANCIACION`.
4. **Cuadre** `efectivo_inicial + flujo_neto_total = efectivo_final` (±Bs 0.01) como
   invariante de calidad del reporte (no falla el endpoint; reporta el descuadre).

## Decisión tomada en esta planificación (punto abierto resuelto)

**Identificación de cuentas EFECTIVO**: el reporte clasifica una cuenta como efectivo si
`actividadFlujo === 'EFECTIVO'` (campo explícito) **O**, cuando el campo es NULL, si su
`codigoInterno` cae bajo el **prefijo de efectivo y equivalentes del plan de cuentas**
(`1.1.1` en el seed → "EFECTIVO Y EQUIVALENTES DE EFECTIVO", con hojas CAJA `1.1.1.001` y
BANCOS `1.1.1.002`). El reporte además **expone como señal de calidad**
(`advertencias` + `cuentasEfectivoDetectadasPorHeuristica`) cuando no se identificó
ninguna cuenta de efectivo o cuando las identificó solo por heurística — patrón espejo de
`cuentasNaturalezaOpuesta` (Balance de Comprobación / Hoja de Trabajo). Justificación
completa en `design.md` §Decisión EFECTIVO.

## Qué NO incluye

- **Frontend**: ninguna pantalla, ruta, hook ni componente. Solo backend + OpenAPI
  regenerado.
- **UI para editar `actividadFlujo`**: el campo se agrega al schema pero NO se expone aún
  por HTTP (ni `CreateCuentaDto`, ni `UpdateCuentaDto`). Queda como follow-up explícito.
- **Permiso nuevo**: reusa `contabilidad.eeff.read` (heredado). NO se agrega al catálogo.
- **Método directo** del EFE: fuera de scope (Bolivia usa indirecto).
- **Reclasificación de intereses/dividendos** entre actividades a nivel de configuración
  fina: el default heurístico es suficiente para el día uno; el refinamiento se hace
  marcando `actividadFlujo` cuenta por cuenta (cuando exista la UI).
- **Seed de `actividadFlujo`**: las cuentas se siembran con el campo NULL; el reporte
  resuelve por heurística. Sembrar valores explícitos es follow-up.
