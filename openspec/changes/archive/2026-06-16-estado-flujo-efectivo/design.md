# Diseño técnico — Estado de Flujo de Efectivo (EFE) por método indirecto

> Change: `estado-flujo-efectivo`
> Proyecto: avicont
> Alcance: BACKEND-ONLY

---

## 1. Ubicación y piezas (molde EEPN — clonar 1:1 la estructura)

Módulo `backend/src/reportes/`. Espejo exacto del EEPN (`evolucion-patrimonio.*`):

| Pieza | Archivo |
|-------|---------|
| Builder de dominio PURO | `domain/estado-flujo-efectivo.ts` |
| Errores de dominio | `domain/estado-flujo-efectivo-errors.ts` |
| Service (orquestación) | `estado-flujo-efectivo.service.ts` |
| DTO de query | `dto/estado-flujo-efectivo-query.dto.ts` |
| DTO de respuesta + mapper | `dto/estado-flujo-efectivo-response.dto.ts` |
| Endpoint | método en `eeff.controller.ts` (existente) |
| Registro DI | `reportes.module.ts` (existente) |

Reutiliza sin tocar firmas: `EeffSaldosReaderPort`, `PeriodosReaderPort`,
`fecha-contable.ts` (`parseFechaContable`, `diaAnterior`, `formatFechaContable`),
`calcularSaldoNeto`, `calcularResultadoEjercicioBob`, `Money`.

---

## 2. Decisión EFECTIVO (punto abierto resuelto)

**Problema**: `subClaseCuenta` no tiene un valor "efectivo"; `ACTIVO_CORRIENTE` agrupa
caja, bancos, cuentas por cobrar, inventarios, etc. Y no hay UI para marcar
`actividadFlujo` todavía.

**Hallazgo del seed** (`src/cuentas/adapters/seed/comercial.ts`): existe convención de
código del plan de cuentas — el grupo `1.1.1` = "EFECTIVO Y EQUIVALENTES DE EFECTIVO" con
hojas `1.1.1.001 CAJA` y `1.1.1.002 BANCOS`. Pero es un seed editable: el admin puede
renombrar/recodificar, así que el prefijo es una **heurística confiable como fallback, no
una garantía**.

**Decisión (capas, de la más fuerte a la más débil)**:

1. **Explícito gana**: si alguna cuenta tiene `actividadFlujo='EFECTIVO'`, el conjunto de
   efectivo es exactamente esas cuentas. Es la fuente de verdad cuando exista la UI.
2. **Fallback heurístico por código**: si NINGUNA cuenta está marcada `EFECTIVO`, se
   identifican las cuentas de detalle cuyo `codigoInterno` empieza con el prefijo de
   efectivo `CODIGO_EFECTIVO_PREFIJO = '1.1.1'` (constante del builder, documentada como
   convención del seed comercial).
3. **Señal de calidad**: el reporte expone `advertencias` y
   `cuentasEfectivoDetectadasPorHeuristica` cuando (a) no se identificó ninguna cuenta de
   efectivo, o (b) se identificaron solo por heurística. Patrón espejo de
   `cuentasNaturalezaOpuesta`. El contador VE que el reporte usó una inferencia y puede
   marcar las cuentas cuando exista la UI.

**Por qué así y no otra cosa**:
- NO derivar `EFECTIVO` solo de `subClaseCuenta`: sería incorrecto (mezclaría cuentas por
  cobrar con caja, distorsionando la conciliación). El efectivo es el ancla del reporte;
  una mala identificación rompe todo el EFE.
- NO bloquear el reporte si no hay efectivo marcado: el Enfoque C exige que funcione el día
  uno. El fallback de código + las advertencias dan robustez sin acoplar a la UI inexistente.
- El campo explícito deja la puerta abierta a refinamiento sin re-diseño.

`CODIGO_EFECTIVO_PREFIJO` se compara con `codigoInterno.startsWith('1.1.1')` sobre cuentas
`esDetalle=true`. El prefijo de 3 segmentos evita colisiones (`1.1.10` no existe en el plan;
`1.1.1.*` sí son las hojas de efectivo). Documentar como constante con comentario.

---

## 3. Algoritmo del builder (método indirecto)

`construirEstadoFlujoEfectivo(params)` — función pura. Pasos:

1. **Indexar** `saldosInicial`, `saldosFinal`, `saldosRango` por `cuentaId` (Map).
2. **Clasificar** cada cuenta `esDetalle=true` con la función `resolverActividad(cuenta)`
   (campo explícito → heurística, ver §2 + REQ-FE-04).
3. **Identificar EFECTIVO** (§2). `efectivoInicial = Σ saldoNeto(inicial)` de las cuentas de
   efectivo; `efectivoFinal = Σ saldoNeto(final)`.
4. **Resultado del ejercicio** = `calcularResultadoEjercicioBob(estructura, saldosRango)`
   (anti-drift con BG/EEPN). Es el punto de partida de OPERACIÓN.
5. **Partidas no monetarias**: por cada cuenta `esContraria=true` clasificada como
   `INVERSION` (depreciación/amortización acumulada de activos no corrientes) — su
   variación de flujo del rango se SUMA de vuelta al resultado (no implicó salida de
   efectivo). Las cuentas de previsión (pasivos no corrientes contrarios o de operación
   marcadas) siguen el mismo criterio. Heurística mínima del día uno: `esContraria` sobre
   activos no corrientes (depreciación acumulada) es la señal robusta; el resto se refina
   con `actividadFlujo` explícito.
6. **Variaciones de capital de trabajo** (OPERACIÓN): por cada cuenta clasificada
   `OPERACION` que **NO** es de resultado (clase NO INGRESO/EGRESO) y NO es efectivo:
   `variacion = saldoNeto(final) − saldoNeto(inicial)`. Signo del flujo según naturaleza:
   - Activo (DEUDORA) que aumenta → consume efectivo → aporta `-variacion`.
   - Pasivo (ACREEDORA) que aumenta → libera efectivo → aporta `+variacion`.
   Implementación uniforme: para activos el flujo es `-(finalDeudor − inicialDeudor)`; para
   pasivos `+(finalAcreedor − inicialAcreedor)`. Como `saldoNeto` ya respeta la naturaleza,
   el flujo de operación de una cuenta no-efectivo es `signo(clase) * Δsaldo`. Ver §3.1.
7. **INVERSIÓN**: por cada cuenta clasificada `INVERSION` no contraria (los activos no
   corrientes "brutos"): `flujo = -(Δ saldoNeto)` (aumento de activo consume efectivo). Las
   contrarias ya entraron como partida no monetaria en operación; no se doble-cuentan acá.
8. **FINANCIACIÓN**: por cada cuenta clasificada `FINANCIACION` (pasivos no corrientes +
   patrimonio) que NO sea el resultado del ejercicio en curso: `flujo = +(Δ saldoNeto)`
   (aumento de pasivo/patrimonio libera efectivo).
9. **Totales**: `subtotalOperacion`, `subtotalInversion`, `subtotalFinanciacion`;
   `variacionNeta = subtotalOperacion + subtotalInversion + subtotalFinanciacion`.
10. **Cuadre**: `cuadra = (efectivoInicial + variacionNeta).balanceadoEnBobCon(efectivoFinal)`;
    `diferencia = (efectivoInicial + variacionNeta) − efectivoFinal`.
11. **Señales de calidad**: `advertencias` + `cuentasEfectivoDetectadasPorHeuristica`.

### 3.1 Convención de signo del flujo (única, evita errores)

Para una cuenta NO-efectivo y NO-resultado, definir `flujoCaja(cuenta)`:
```
Δsaldo = saldoNeto(final) − saldoNeto(inicial)   // respeta naturaleza
// Activo (DEUDORA): aumento consume efectivo → flujo = −Δsaldo
// Pasivo/Patrimonio (ACREEDORA): aumento libera efectivo → flujo = +Δsaldo
flujoCaja = (naturaleza === DEUDORA) ? Δsaldo.negated() : Δsaldo
```
Esta única regla sirve para operación (capital de trabajo), inversión y financiación. La
sección a la que va el `flujoCaja` la decide `resolverActividad`. El efectivo se excluye
(es el ancla) y las cuentas de resultado se excluyen (ya están en el resultado del
ejercicio). Las contrarias de inversión (depreciación) se redirigen a operación como
partida no monetaria con su `flujoCaja` (que ya tiene el signo correcto por naturaleza
ACREEDORA).

> **Comentario regulatorio obligatorio en el builder**:
> `// NIC 7: método indirecto — el flujo de operación parte del resultado del ejercicio`
> `// NIC 7: aumento de activo consume efectivo; aumento de pasivo lo libera`

---

## 4. Firma del builder

```typescript
// domain/estado-flujo-efectivo.ts  (PURO — sin NestJS/Prisma)

export interface ConstruirEstadoFlujoEfectivoParams {
  estructura: CuentaEstructuraRow[];        // con actividadFlujo: ActividadFlujo | null
  saldosInicial: SaldoCuentaRow[];          // obtenerSaldosHasta(diaAnterior(desde))
  saldosFinal: SaldoCuentaRow[];            // obtenerSaldosHasta(hasta)
  saldosRango: SaldoCuentaRow[];            // obtenerSaldosEnRango(desde, hasta)
}

export function construirEstadoFlujoEfectivo(
  params: ConstruirEstadoFlujoEfectivoParams,
): EstadoFlujoEfectivoResult;
```

Helper de clasificación interno (testeable):
```typescript
export function resolverActividadFlujo(cuenta: CuentaEstructuraRow): ActividadFlujo;
// y un helper de identificación de efectivo cuando actividadFlujo es null:
const CODIGO_EFECTIVO_PREFIJO = '1.1.1'; // convención seed comercial — "EFECTIVO Y EQUIVALENTES"
```

---

## 5. Shape del DTO de respuesta (contrato OpenAPI)

```typescript
// EstadoFlujoEfectivoResponseDto
{
  fechaDesde: string,              // "YYYY-MM-DD"
  fechaHasta: string,              // "YYYY-MM-DD"

  // Punto de partida del método indirecto (informativo, dentro de operación)
  resultadoEjercicio: string,      // BOB string (utilidad +, pérdida −)

  operacion: {                     // SeccionFlujoDto
    lineas: Array<LineaFlujoDto>,  // partidas no monetarias + variaciones de capital de trabajo
    subtotal: string,              // flujo neto de operación (incluye resultadoEjercicio + ajustes + Δ KT)
  },
  inversion: {
    lineas: Array<LineaFlujoDto>,
    subtotal: string,
  },
  financiacion: {
    lineas: Array<LineaFlujoDto>,
    subtotal: string,
  },

  // Conciliación de efectivo
  efectivoInicial: string,         // Σ saldoNeto(inicial) de cuentas de efectivo
  variacionNeta: string,           // subtotalOperacion + subtotalInversion + subtotalFinanciacion
  efectivoFinal: string,           // Σ saldoNeto(final) de cuentas de efectivo

  // Invariante de cuadre (±Bs 0.01)
  cuadra: boolean,                 // (efectivoInicial + variacionNeta) ≈ efectivoFinal
  diferencia: string,              // (efectivoInicial + variacionNeta) − efectivoFinal; "0.00" si cuadra

  // Señales de calidad (no afectan totales)
  advertencias: string[],          // p.ej. "No se identificó ninguna cuenta de efectivo"
  cuentasEfectivoDetectadasPorHeuristica: Array<{
    cuentaId: string,
    codigoInterno: string,
    nombre: string,
  }>,
}

// LineaFlujoDto — una línea dentro de una sección
{
  cuentaId: string | null,         // null en la línea sintética "Resultado del ejercicio"
  codigoInterno: string | null,
  nombre: string,                  // nombre de la cuenta o concepto sintético
  tipo: "RESULTADO_EJERCICIO" | "PARTIDA_NO_MONETARIA" | "VARIACION_CAPITAL_TRABAJO" | "VARIACION_CUENTA",
  monto: string,                   // flujo de caja con signo: "+x" libera, "-x" consume
}
```

- `operacion.lineas` incluye la línea sintética `RESULTADO_EJERCICIO` (cuentaId null) como
  primer renglón, luego las `PARTIDA_NO_MONETARIA`, luego las `VARIACION_CAPITAL_TRABAJO`.
  `inversion`/`financiacion` usan `VARIACION_CUENTA`.
- Igual que el EEPN: tipos internos del builder con `Money`; el mapper
  (`toEstadoFlujoEfectivoResponse`) serializa `Money → string` (`.toBob()`) y `Date →
  "YYYY-MM-DD"` (`formatFechaContable`). Montos negativos serializan con signo (`-`).

---

## 6. Service (orquestación)

Clon de `EvolucionPatrimonioService`:
1. Resolver rango: modo rango (`desde`+`hasta`) XOR `periodoFiscalId`. Ambos → AMBIGUO;
   ninguno → REQUERIDO; formato/orden inválido → INVALIDO; período inexistente/ajeno →
   PERIODO_NO_ENCONTRADO. Validación en el service, errores de dominio.
2. `Promise.all` de 4 lecturas del port:
   `obtenerSaldosHasta(diaAnterior(desde))`, `obtenerSaldosHasta(hasta)`,
   `obtenerSaldosEnRango(desde, hasta)`, `obtenerEstructuraCuentas`.
3. `construirEstadoFlujoEfectivo({...})`.
4. `toEstadoFlujoEfectivoResponse(result, { desde, hasta })`.

> **Diferencia con EEPN**: el EFE NO acepta `gestionId` como tercer modo (la spec define
> rango XOR período, como Balance de Comprobación y Hoja de Trabajo). Mantener simple.

---

## 7. Errores de dominio

```typescript
// domain/estado-flujo-efectivo-errors.ts
export class FlujoEfectivoRangoRequeridoError extends DomainError { code = 'REPORTES_FLUJO_EFECTIVO_RANGO_REQUERIDO'; /* 422 */ }
export class FlujoEfectivoRangoAmbiguoError  extends DomainError { code = 'REPORTES_FLUJO_EFECTIVO_RANGO_AMBIGUO'; /* 422 */ }
export class FlujoEfectivoRangoInvalidoError extends DomainError { code = 'REPORTES_FLUJO_EFECTIVO_RANGO_INVALIDO'; /* 422 */ }
export class FlujoEfectivoPeriodoNoEncontradoError extends DomainError { code = 'REPORTES_FLUJO_EFECTIVO_PERIODO_NO_ENCONTRADO'; /* 422 */ }
```
Subclases de la jerarquía `DomainError` correcta para HTTP 422 (seguir el patrón de
`evolucion-patrimonio-errors.ts` / `hoja-trabajo` errors). Mensajes al usuario en español.

---

## 8. Cambios al port (única extensión — sin método nuevo)

`CuentaEstructuraRow` (en `ports/eeff-saldos-reader.port.ts`) gana:
```typescript
  /** Actividad del EFE (NIC 7). Null → el reporte aplica default heurístico. */
  actividadFlujo: ActividadFlujo | null;
```
El adapter `prisma-eeff-saldos-reader.adapter.ts` agrega `actividadFlujo: true` al `select`
de `obtenerEstructuraCuentas` y lo mapea en el boundary (enum Prisma → enum dominio, vía
`enum-mappers.ts`). Las FIRMAS de los 4 métodos del port NO cambian. Los otros reportes que
consumen `CuentaEstructuraRow` ignoran el campo nuevo (retrocompatible).

`ActividadFlujo` (enum de dominio) se agrega a `@/common/domain/enums.ts`:
```typescript
// Actividad del Estado de Flujo de Efectivo (NIC 7). Dueño: módulo `cuentas`
// (campo Cuenta.actividadFlujo). Consumido por: `reportes` (EFE).
// EFECTIVO marca caja/bancos/equivalentes — es el ancla de la conciliación,
// no una sección de actividad.
export enum ActividadFlujo {
  EFECTIVO = 'EFECTIVO',
  OPERACION = 'OPERACION',
  INVERSION = 'INVERSION',
  FINANCIACION = 'FINANCIACION',
}
```

---

## 9. Migración Prisma (ADITIVA — protocolo §11.6)

`schema.prisma`:
```prisma
enum ActividadFlujo {
  EFECTIVO
  OPERACION
  INVERSION
  FINANCIACION
}

model Cuenta {
  // ...
  // Actividad del Estado de Flujo de Efectivo (NIC 7). Nullable: si null, el
  // reporte EFE aplica un default heurístico desde subClaseCuenta/código.
  actividadFlujo ActividadFlujo?
  // ...
}
```

Migration generada (`<timestamp>_estado_flujo_efectivo`):
```sql
CREATE TYPE "ActividadFlujo" AS ENUM ('EFECTIVO', 'OPERACION', 'INVERSION', 'FINANCIACION');
ALTER TABLE "cuentas" ADD COLUMN "actividadFlujo" "ActividadFlujo";
```

**Protocolo §11.6 OBLIGATORIO**: tras `prisma migrate dev`, abrir el `migration.sql` y
`grep -E "^DROP (INDEX|EXTENSION|TYPE)"`. Si Prisma metió `DROP` de objetos raw SQL vivos
(pg_trgm, índices trigram de contactos, triggers `comprobantes_audit`, CHECKs de
`organizations`/`lotes`, índice parcial de documento físico), **borrar esas líneas DROP** a
mano. La migración del EFE debe ser SOLO el `CREATE TYPE` + `ADD COLUMN`. Verificar
post-apply que los objetos raw siguen presentes (`\d cuentas`, `\d contactos`).

---

## 10. Tests (honeycomb §7.1, describe/it en español)

- **Unit (builder, ≥95%)** `domain/estado-flujo-efectivo.spec.ts`: clasificación
  explícita vs heurística, identificación de efectivo (explícito/heurística/ninguna),
  resultado del ejercicio como punto de partida, signo de variaciones (activo↑ consume,
  pasivo↑ libera), partidas no monetarias (depreciación), las 3 secciones, conciliación,
  cuadre con + y −, no doble-conteo de ingresos/egresos, robustez ante saldo sin cuenta en
  estructura, EFE vacío cuadrado.
- **Unit (helper)** `resolverActividadFlujo`: los 5 ramos del default + prioridad del campo
  explícito.
- **Unit (service)** `estado-flujo-efectivo.service.spec.ts`: resolución de rango (los 4
  errores), orquestación de las 4 lecturas (mocks del port — nunca Prisma), mapeo a DTO.
- **Integration** `prisma-eeff-saldos-reader.adapter.integration.spec.ts` (extender):
  `obtenerEstructuraCuentas` ahora trae `actividadFlujo` (NULL por default y valor cuando
  se setea). Postgres real.
- **E2E** `test/estado-flujo-efectivo.e2e-spec.ts`: 200 con rango, 200 con período, los 4
  422, 403 sin permiso/módulo, aislamiento multi-tenant, cuadre, señales de calidad, toggle
  `incluirAnulados`. Cross-check: `efectivoFinal − efectivoInicial == variacionNeta` (±0.01).

---

## 11. OpenAPI

DTO de respuesta decorado con `@ApiProperty` (nullable correctamente tipado, igual que
EEPN/Hoja de Trabajo). Endpoint con `@ApiOkResponse({ type: EstadoFlujoEfectivoResponseDto })`.
Tras implementar: `pnpm run openapi:dump` (backend) + `pnpm run gen:api-types` (frontend) y
commitear ambos artefactos — el job CI `contract-drift` rompe el build si hay drift
(§10.10). Aunque el change es backend-only, regenerar `api.generated.ts` es obligatorio.

---

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Identificación de efectivo incorrecta si el tenant recodificó el plan | Campo explícito gana; heurística solo como fallback; advertencias visibles |
| Doble-conteo de ingresos/egresos en operación | Excluir clase INGRESO/EGRESO de las variaciones de capital de trabajo (ya están en el resultado) — test dedicado |
| Partidas no monetarias mal clasificadas sin UI | Día uno: solo depreciación acumulada (`esContraria` en inversión) se trata como no monetaria; el resto se refina con `actividadFlujo` explícito; documentado como limitación conocida |
| `prisma migrate dev` dropea objetos raw SQL (§11.6) | Protocolo de revisión manual del `migration.sql` obligatorio antes de aplicar |
| Descuadre del EFE confunde al usuario | No falla el endpoint (200); `cuadra=false` + `diferencia` + advertencias lo explican |
