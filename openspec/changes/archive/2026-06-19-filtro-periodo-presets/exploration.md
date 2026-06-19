# Exploración: Filtro de Período con Presets (QuickBooks-style)

<!--
Artifact: explore
Change: filtro-periodo-presets
Fecha: 2026-06-19
Status: COMPLETADO
-->

## 1. Confirmación de hallazgos del orquestador

### BUG CONFIRMADO: fechaInicio/fechaFin no se proyectan en GET /periodos

**Impacto exacto:**

- `backend/src/periodos-fiscales/dto/periodo-fiscal-response.dto.ts` (línea 4-41): `PeriodoFiscalResponseDto` NO declara `fechaInicio`/`fechaFin`. El mapper `toPeriodoResponse` tampoco las calcula ni las incluye.
- `backend/src/periodos-fiscales/periodos-fiscales.controller.ts` (línea 57): `periodos.map(toPeriodoResponse)` — el controller usa el mapper sin modificación.
- `frontend/src/types/api.ts` (líneas 524-526): `Periodo.fechaInicio: string` y `Periodo.fechaFin: string` están declarados como obligatorios en el tipo TypeScript, pero en runtime son `undefined`.
- `frontend/src/components/shared/periodo-gestion-filtro.tsx` (línea 132): `primero.fechaInicio` y `ultimo.fechaFin` son `undefined` en runtime → el componente emite `{ modo: 'rango', fechaDesde: undefined, fechaHasta: undefined }`.

**Por qué el CI contract-drift no lo detectó:**

`PeriodoFiscalResponseDto` y `GestionResponseDto` NO están decorados con `@ApiOkResponse` en el controller (ver `periodos-fiscales.controller.ts` — no tiene `@ApiOkResponse`). Por tanto NO entran al `openapi.json`. Los tipos `Gestion` y `Periodo` en `api.ts` llevan el comentario explícito (línea 470-472): _"Client-only: los DTOs de respuesta (Gestion/Periodo) aún no están referenciados por @ApiOkResponse"_. El contrato entre tipos hand-written en `api.ts` y el backend real es manual → ningún mecanismo automático lo valida.

**Por qué los tests no lo detectaron:**

Todos los tests de `periodo-gestion-filtro.test.tsx` y los `*-filtros.test.tsx` usan `vi.mock` para `useGestiones` y `usePeriodos`. Los fixtures (`buildPeriodo`) incluyen `fechaInicio`/`fechaFin` como strings — los tests PASAN con datos correctos que el backend real nunca envía.

---

## 2. Gap 1: Gestiones y su rango de fechas

### ¿Qué datos tiene una Gestión?

**Schema Prisma** (`backend/prisma/schema.prisma` líneas 568-586):

```
GestionFiscal {
  id, organizationId, year, mesInicio, status, closedAt, closedByUserId, createdAt, updatedAt
}
```

**Campos clave**: `year` (año fiscal, no necesariamente calendario) y `mesInicio` (1-12, derivado de `tipoEmpresaPrincipal` en el momento de creación, Ley 843 art. 46).

**NO hay `fechaInicio`/`fechaFin` en `GestionFiscal`**. El rango se deriva de `year + mesInicio`.

### ¿Cómo derivar el rango de una gestión?

```
mesInicio     = gestion.mesInicio          // 1-12
mesCierre     = mesInicio === 1 ? 12 : mesInicio - 1
yearInicio    = gestion.year
yearCierre    = mesInicio === 1 ? gestion.year : gestion.year + 1
fechaInicio   = YYYY-MM-01  (primer día del mesInicio, yearInicio)
fechaFin      = YYYY-MM-DD  (último día del mesCierre, yearCierre — calcular días del mes)
```

**Precedente exacto en el frontend**: `frontend/src/features/periodos-fiscales/lib/derivar-rango-gestion.ts` — calcula el texto legible del rango pero NO calcula YYYY-MM-DD. El backend tiene `backend/src/periodos-fiscales/domain/rango-periodo-fiscal.ts` con `RangoPeriodoFiscal.of(year, month).inicio()/.fin()` que hace el cálculo en enteros sin `new Date()`.

**Fuente de verdad del mesInicio**: `GET /api/gestiones` → `Gestion.mesInicio: number`. Campo siempre presente en la response. La gestión activa tiene `status: 'ABIERTA'`.

### ¿Qué devuelve GET /api/gestiones?

`Gestion[]` — lista plana SIN períodos. Contiene `mesInicio` pero no los períodos.

`GET /api/gestiones/:id` → `GestionConPeriodosResponseDto` que en backend es `{...GestionResponseDto, periodos: PeriodoFiscalResponseDto[]}`. **NOTA**: el tipo frontend `GestionConPeriodos` declara `fechaInicio`, `fechaFin`, `mesCierre`, `tipoEmpresaPrincipal` — pero el backend NO los devuelve (deuda de tipo hand-written, similar a `Periodo.fechaInicio`). La página `periodos-fiscales-page.tsx` accede a `detalleQuery.data?.tipoEmpresaPrincipal ?? null` — en runtime es `undefined`, el `?? null` protege el acceso.

### Conclusión para el preset "Esta gestión"

Para calcular el rango de fechas de una gestión (preset "Esta gestión"), basta con `Gestion.year + Gestion.mesInicio` — ambos vienen del `GET /api/gestiones` que ya ejecuta `useGestiones()` en el componente. **No se necesita un request adicional al backend.**

---

## 3. Gap 2: "Hoy" para presets relativos

**Ya existe** `frontend/src/lib/fecha-actual.ts`:

```ts
// Espeja ClockPort.hoyEnLaPaz() del backend. Sin UTC.
export function hoyEnLaPazISO(clock: () => Date = () => new Date()): string
export function primerDiaDelAnioISO(clock: () => Date = () => new Date()): string
```

- `hoyEnLaPazISO()` usa `Intl.DateTimeFormat` con `timeZone: 'America/La_Paz'` — correcto, §4.6.
- `primerDiaDelAnioISO()` devuelve `{año en La Paz}-01-01` — apropiado para preset "Este año".
- Ambas son inyectables para tests (parámetro `clock`).

**Para presets de mes ("Este mes")**: se necesita el primer y último día del mes actual en La Paz. `fecha-actual.ts` NO tiene esta función todavía. Se puede agregar `primerDiaDelMesISO(clock)` y `ultimoDiaDelMesISO(clock)` — puras, sin `Date` nativo para cálculos (solo para obtener year/month, luego aritméticos).

**Conclusión**: usar `hoyEnLaPazISO` como base para presets. Para "Este mes" agregar helpers en `fecha-actual.ts`. Para "Esta gestión" derivar con función pura desde `Gestion.year + Gestion.mesInicio`.

---

## 4. Gap 3: Inventario de los 6 filtros y sus tests

### Notas previas importantes

- Los reportes **Balance General** y **Estado de Resultados** tienen sus PROPIOS filtros que NO usan `PeriodoGestionFiltro`. Balance General = fecha de corte única (`fecha`). Estado de Resultados = fechaDesde/fechaHasta directo con inputs de tipo date. El nuevo diseño QuickBooks aplica a los 6 reportes que SÍ usan `PeriodoGestionFiltro` (ver abajo). No aplica a BG ni ER.
- Hay 8 features con filtros en total; el cambio toca 6.

### Los 6 features que usan PeriodoGestionFiltro

| Feature | Filtros file | Schema | API file | Param names | Tests (it count) |
|---------|-------------|--------|----------|-------------|-----------------|
| libro-diario | `libro-diario-filtros.tsx` | `libro-diario-filtro-schema.ts` | `get-libro-diario.ts` | `periodoFiscalId` XOR `fechaDesde+fechaHasta` | 6 it |
| libro-mayor | `libro-mayor-filtros.tsx` | `libro-mayor-filtro-schema.ts` | `get-libro-mayor.ts` | `periodoFiscalId` XOR `fechaDesde+fechaHasta` | 6 it |
| balance-comprobacion | `balance-comprobacion-filtros.tsx` | `balance-comprobacion-filtro-schema.ts` | `get-balance-comprobacion.ts` | `periodoFiscalId` XOR `fechaDesde+fechaHasta` | 4 it |
| hoja-trabajo | `hoja-trabajo-filtros.tsx` | `hoja-trabajo-filtro-schema.ts` | `get-hoja-trabajo.ts` | `periodoFiscalId` XOR `fechaDesde+fechaHasta` | 4 it |
| flujo-efectivo | `flujo-efectivo-filtros.tsx` | `flujo-efectivo-filtro-schema.ts` | `get-flujo-efectivo.ts` | `periodoFiscalId` XOR `fechaDesde+fechaHasta` | 4 it |
| evolucion-patrimonio | `evolucion-patrimonio-filtros.tsx` | `evolucion-patrimonio-filtro-schema.ts` | `get-evolucion-patrimonio.ts` | `periodoFiscalId` XOR `fechaDesde+fechaHasta` | 4 it |

**Observación crítica**: TODOS los 6 features ya usan `periodoFiscalId XOR fechaDesde+fechaHasta`. El contrato del backend NO cambia. Solo cambia la UX de cómo el usuario selecciona esas fechas.

**Nombre de parámetros**: TODOS usan `fechaDesde`/`fechaHasta` (no hay variantes `desde`/`hasta`). El orquestador mencionó posibles diferencias — verificado: no las hay. Flujo-efectivo usa `fechaDesde`/`fechaHasta` igual que el resto.

**Hooks**: dos patrones de `enabled`:
- Libro Diario y Libro Mayor: `enabled = periodoFiscalId !== undefined || (fechaDesde !== undefined && fechaHasta !== undefined)` + `placeholderData: keepPreviousData`
- Balance Comprobación, Hoja Trabajo, Flujo Efectivo, EEPN: `enabled: filtros !== null` (sin keepPreviousData)

**Tests existentes de filtros** (todos en `features/<x>/components/<x>-filtros.test.tsx`):
- `PeriodoGestionFiltro` shared: 242 líneas, múltiples `describe`
- Libro Diario filtros: 294 líneas, 6 tests
- Libro Mayor filtros: 296 líneas, 6 tests
- Balance Comprobación, Hoja Trabajo, Flujo Efectivo, EEPN: ~207 líneas cada uno, 4 tests cada uno

**Todos los tests de filtros mockean `useGestiones` y `usePeriodos` e incluyen `fechaInicio`/`fechaFin` en los fixtures de períodos**. Deben ser actualizados si el componente cambia su forma de consumir los datos.

---

## 5. Gap 4: Tipo Periodo en api.ts — ¿manual o derivado?

**Escrito a mano** (`frontend/src/types/api.ts`, líneas 467-537 con comentario explícito):

> _"Client-only: los DTOs de respuesta (Gestion/Periodo) aún no están referenciados por @ApiOkResponse, así que no entran al OpenAPI."_

El job CI `contract-drift` no caza esta deuda porque:
1. `GET /periodos` en `openapi.json` tiene response vacío `{}` (sin schema anotado)
2. El frontend usa tipos hand-written, no `Schemas['PeriodoFiscalResponseDto']`

**Implicación para el cambio**: agregar `fechaInicio`/`fechaFin` al backend NO activa automáticamente ningún check de contrato. Hay que:
1. Agregar `@ApiOkResponse({ type: [PeriodoFiscalResponseDto] })` al controller (el `PeriodoFiscalResponseDto` ya está decorado con `@ApiProperty`)
2. Agregar los nuevos campos `@ApiProperty` al DTO
3. Regenerar `openapi.json` → `api.generated.ts`
4. Migrar el tipo `Periodo` en `api.ts` de hand-written a alias generado (o añadir los campos al hand-written si se posterga la migración)

Esta es una **deuda de contrato** que el cambio puede cerrar parcialmente (al menos para `Periodo`). Hacerlo correctamente implica decorar los 5 endpoints de períodos con `@ApiOkResponse`.

---

## 6. Gap 5: Backend — cómo proyectar fechaInicio/fechaFin

### toPeriodoResponse (actual)

`backend/src/periodos-fiscales/dto/periodo-fiscal-response.dto.ts` (línea 27-41):

```ts
export function toPeriodoResponse(p: PeriodoFiscal): PeriodoFiscalResponseDto {
  return {
    id: p.id, gestionId: p.gestionId, year: p.year, month: p.month,
    ordenEnGestion: p.ordenEnGestion, status: p.status, esDefinitivo: p.esDefinitivo,
    closedAt: ..., closedByUserId: ..., createdAt: ..., updatedAt: ...,
    // NO hay fechaInicio/fechaFin
  };
}
```

### Fix minimal propuesto (diff conceptual)

```ts
// 1. Agregar @ApiProperty y campos al DTO:
@ApiProperty({ example: '2026-01-01', description: 'Primer día del mes calendario' })
fechaInicio!: string;
@ApiProperty({ example: '2026-01-31', description: 'Último día del mes calendario' })
fechaFin!: string;

// 2. Modificar toPeriodoResponse para que use RangoPeriodoFiscal:
import { RangoPeriodoFiscal } from '../domain/rango-periodo-fiscal';

export function toPeriodoResponse(p: PeriodoFiscal): PeriodoFiscalResponseDto {
  const rango = RangoPeriodoFiscal.of(p.year, p.month);
  return {
    ...camposExistentes,
    fechaInicio: rango.inicio(),  // YYYY-MM-01, puro aritmético
    fechaFin: rango.fin(),        // YYYY-MM-DD, puro aritmético
  };
}
```

**`RangoPeriodoFiscal.of(year, month)` ya existe** en `backend/src/periodos-fiscales/domain/rango-periodo-fiscal.ts`. El precedente exacto está en `obtenerResumenPrecierre` del service (línea 92-93): `const rango = RangoPeriodoFiscal.of(periodo.year, periodo.month)`.

**Alcance del change en backend**:
- `PeriodoFiscalResponseDto` (+2 campos `@ApiProperty`)
- `toPeriodoResponse` (+2 líneas)
- `periodos-fiscales.controller.ts` (+5 `@ApiOkResponse` — uno por endpoint)
- Regenerar `openapi.json` + `api.generated.ts`

**Sin migración de BD**: `fechaInicio`/`fechaFin` son derivadas en cómputo, no persistidas.

---

## 7. Gap 6: Tests backend del periodo response

**No hay tests unitarios de `toPeriodoResponse`** — la función es un mapper de 12 líneas, sin lógica de dominio propia.

**Tests existentes que sí testean la respuesta**:
- `backend/test/periodos-fiscales.e2e-spec.ts`: 
  - `GET /periodos lista los 12 del tenant` (línea 239): chequea `res.body.length === 12` y `res.body[0].year === 2026` — NO chequea `fechaInicio`/`fechaFin`
  - `GET /periodos/:id/resumen-precierre` (línea 254): chequea `res.body.periodo.fechaInicio` y `res.body.periodo.fechaFin` — pero este endpoint es diferente (el resumen SÍ tiene las fechas hoy)

**Tests a crear/actualizar**:
1. Unit test de `toPeriodoResponse` con `fechaInicio`/`fechaFin` (nuevo, en `periodo-fiscal-response.dto.spec.ts`)
2. E2E: actualizar `GET /periodos lista los 12` para assertar `fechaInicio`/`fechaFin` en cada item del array

---

## 8. Gap 7: Riesgos y sorpresas

### R1: PeriodoGestionFiltro lo consumen 8 features (no 6)

Consumers de `PeriodoGestionFiltro`:
1. `features/flujo-efectivo/components/flujo-efectivo-filtros.tsx`
2. `features/evolucion-patrimonio/components/evolucion-patrimonio-filtros.tsx`
3. `features/balance-comprobacion/components/balance-comprobacion-filtros.tsx`
4. `features/libro-mayor/components/libro-mayor-filtros.tsx`
5. `features/hoja-trabajo/components/hoja-trabajo-filtros.tsx`
6. `features/libro-diario/components/libro-diario-filtros.tsx`

Solo 6 features — la búsqueda no encontró más consumidores. Balance General y Estado de Resultados NO usan `PeriodoGestionFiltro`.

### R2: Balance General es "as of date" — no es rango, no entra en el rediseño

`balance-general-filtro-schema.ts`: campo único `fecha: string` (fecha de corte). El backend infiere la gestión. **No usar `PeriodoGestionFiltro`**, no aplica el rediseño QuickBooks de presets.

Estado de Resultados: usa `fechaDesde`/`fechaHasta` pero con inputs de tipo date directos (no `PeriodoGestionFiltro`). Tampoco entra en el rediseño.

### R3: GestionConPeriodos frontend type tiene campos fantasma

El tipo frontend `GestionConPeriodos` declara `fechaInicio`, `fechaFin`, `mesCierre`, `tipoEmpresaPrincipal` — pero el backend NO los retorna en `GET /api/gestiones/:id`. Estos campos son `undefined` en runtime. `periodos-fiscales-page.tsx` ya usa `?? null` como defensa. Este tipo desordenado es una deuda preexistente; el cambio actual puede ignorarla o resolverla como side-effect al decorar los DTOs con `@ApiOkResponse`.

### R4: Modelo "siempre rango" implica eliminar modo 'periodo'

El objetivo QuickBooks es: el query SIEMPRE va por `fechaDesde`/`fechaHasta`. Esto implica **eliminar el modo `'periodo'`** del `PeriodoSeleccion` y de los schemas zod. Todos los endpoints seguirán aceptando `periodoFiscalId` en el backend (no hay cambio backend en los EEFF endpoints), pero la UI nunca lo enviará.

Impacto: los 6 schemas discriminados `z.discriminatedUnion('modo', ['periodo', 'rango'])` se simplifican a un schema plano `{fechaDesde, fechaHasta}`. Los 6 API handlers pierden la rama `periodoFiscalId`. Los tests de filtros se actualizan.

**Tradeoff**: si en el futuro se quiere el modo `periodoFiscalId` en algún report (ej. para exact-period cache), la eliminación lo hace más difícil de restaurar. Alternativa: mantener el tipo interno pero nunca enviarlo desde la UI de presets (la UI siempre resuelve a fechas antes de llamar al API).

### R5: El preset "Esta gestión" requiere cálculo de rango de gestión en frontend

Para el preset "Esta gestión" el frontend debe derivar `fechaInicio`/`fechaFin` de `Gestion.year + Gestion.mesInicio`. La función `derivarRangoGestion` en `periodos-fiscales/lib/` solo devuelve texto legible. **Falta una función pura** que devuelva `{fechaInicio: string, fechaFin: string}` YYYY-MM-DD. Debe ser agregada a `periodos-fiscales/lib/` (o `fecha-actual.ts`), sin `Date` nativo en los cálculos (solo para obtener el año/mes actual cuando se compara con "hoy").

### R6: Hay que eliminar usePeriodos del componente compartido (si se va al modelo "siempre rango")

Si el nuevo `PeriodoGestionFiltro` rediseñado ya no necesita seleccionar un período específico (porque el output SIEMPRE es fechaDesde/fechaHasta), entonces ya no necesita `usePeriodos` (que cargaba los períodos de una gestión para el select de mes). Solo necesita `useGestiones` para derivar el rango de la gestión seleccionada.

El modelo QuickBooks puro tiene: presets que rellenan las fechas → el usuario ve/edita las fechas → el query va por fechas. El select de mes desaparece de la UX; el "Todos los meses" implícito se logra vía el rango completo de la gestión. Esto simplifica el componente pero es un cambio de UX relevante.

---

## 9. Mapa de blast radius

### Backend (cambio minimal para el fix de datos)

| Archivo | Cambio |
|---------|--------|
| `backend/src/periodos-fiscales/dto/periodo-fiscal-response.dto.ts` | +2 campos DTO, +import RangoPeriodoFiscal, +2 líneas en `toPeriodoResponse` |
| `backend/src/periodos-fiscales/periodos-fiscales.controller.ts` | +`@ApiOkResponse` en 5 endpoints |
| `backend/openapi.json` | Regenerar (chore automático) |
| `frontend/src/types/api.generated.ts` | Regenerar (chore automático) |
| `frontend/src/types/api.ts` | Actualizar `Periodo` con los nuevos campos (o migrar a alias generado) |
| `backend/test/periodos-fiscales.e2e-spec.ts` | Agregar assert de `fechaInicio`/`fechaFin` en GET lista |

### Frontend (rediseño QuickBooks del componente + 6 filtros)

| Archivo | Cambio |
|---------|--------|
| `frontend/src/components/shared/periodo-gestion-filtro.tsx` | Rediseño completo del componente |
| `frontend/src/components/shared/periodo-gestion-filtro.test.tsx` | Reescritura completa de tests |
| `frontend/src/features/periodos-fiscales/lib/` | Nueva función `calcularRangoGestionISO(year, mesInicio)` |
| `frontend/src/lib/fecha-actual.ts` | Opcional: +`primerDiaDelMesISO` / `ultimoDiaDelMesISO` |
| `frontend/src/features/{6-features}/components/*-filtros.tsx` | Actualizar UI (si el contrato del componente cambia) |
| `frontend/src/features/{6-features}/components/*-filtros.test.tsx` | Actualizar tests (fixtures, expects) |
| `frontend/src/features/{6-features}/schemas/*-filtro-schema.ts` | Si se elimina el modo 'periodo', simplificar schema |
| `frontend/src/features/{6-features}/api/get-*.ts` | Si se elimina rama periodoFiscalId, simplificar |
| `frontend/src/features/{6-features}/hooks/use-*.ts` | Si se elimina enabled condicional por modo |

**Archivos NO tocados**: ningún backend de EEFF endpoints. El query siempre por fechas.

---

## 10. Opciones de diseño para la fase Propose

### Opción A: Preset en componente compartido (reemplaza PeriodoGestionFiltro actual)

**Descripción**: El componente `PeriodoGestionFiltro` se rediseña para ofrecer:
- Fechas Desde/Hasta siempre visibles (inputs de tipo date)
- Botonera/Select de presets: "Este mes", "Esta gestión", "Gestión anterior", "Personalizado"
- Al elegir un preset, rellena automáticamente los campos Desde/Hasta
- Al editar a mano los inputs, el preset pasa a "Personalizado"
- El output siempre es `{ modo: 'rango', fechaDesde, fechaHasta }` (eliminar modo 'periodo')

**Tradeoffs**:
- ✅ Un solo lugar de cambio en la UX
- ✅ Todos los 6 reportes se benefician automáticamente
- ✅ Simplifica schemas y API handlers de cada feature
- ❌ El componente sabe de gestiones (cross-feature) — ya lo sabe hoy (usa `useGestiones`)
- ❌ "Esta gestión" y "Gestión anterior" requieren que el usuario haya creado gestiones (error state existente ya cubierto)
- Complejidad de estado: hay que detectar cuándo el usuario editó a mano para poner "Personalizado"

**Cómo modelar "Personalizado"**: el estado interno guarda `preset: 'este-mes' | 'esta-gestion' | 'gestion-anterior' | 'personalizado'`. Si `fechaDesde` o `fechaHasta` cambian por input del usuario, se fuerza `preset = 'personalizado'`. El preset NO controla el estado de las fechas — las fechas son siempre el estado de verdad; el preset es un acelerador de selección.

### Opción B: Presets en cada feature (mantiene PeriodoGestionFiltro pero lo acota)

**Descripción**: `PeriodoGestionFiltro` pasa a ser solo los inputs Desde/Hasta. Cada feature tiene sus propios presets locales (botones o select) que llaman `setValue('fechaDesde', ...)` via RHF.

**Tradeoffs**:
- ✅ Menor cambio al componente compartido
- ❌ Duplicación de lógica de presets en 6 features
- ❌ Mantiene el riesgo de divergencia

### Opción C: Híbrida — componente compartido con presets pero sin gestiones

**Descripción**: El componente compartido ofrece presets "Este mes", "Este trimestre", "Este año", "Personalizado". Los presets de "Esta gestión" / "Gestión anterior" los agrega cada feature que lo necesite (porque requieren conocer la gestión).

**Tradeoffs**:
- ✅ El componente compartido queda sin cross-feature (no necesita useGestiones)
- ❌ Los presets de gestión (los más útiles en contexto contable boliviano) quedan en cada feature
- ❌ El contador de hecho trabaja en base a gestiones, no a meses del calendario

### Recomendación para la fase Propose

**Opción A es la más consistente** con el modelo QuickBooks y la UX contable: el contador piensa en gestiones. El componente ya tiene `useGestiones` hoy; la dependencia cross-feature existe. La clave es modelar el estado correctamente: fechas como verdad, preset como acelerador.

Los presets mínimos: "Este mes" / "Esta gestión" / "Gestión anterior" / "Personalizado". Se puede agregar "Último trimestre" después si se pide.

---

## 11. Preguntas abiertas para Propose/Design

1. **¿Se elimina el modo `'periodo'` completamente?** Si la UI nunca envía `periodoFiscalId`, ¿vale la pena limpiar los schemas y APIs? O se mantiene el tipo `PeriodoSeleccion` internamente pero la salida siempre resuelve a fechas (el componente hace la resolución).

2. **¿Qué presets exactos quiere Marco?** "Este mes" + "Esta gestión" + "Gestión anterior" parecen el mínimo. ¿Se agrega "Último trimestre", "Año calendario"? ¿O se deja solo los 3 contables?

3. **¿Cómo se determina "Esta gestión" vs "Gestión en curso"?** Usar la gestión con `status: 'ABIERTA'` más reciente, o la última por `year DESC`. ¿Qué pasa si hay dos abiertas?

4. **¿"Gestión anterior" = gestión cerrada más reciente, o la gestión con `year = gestionActual.year - 1`?** Pueden diferir para empresas industriales (gestión 2025 = abr2025-mar2026).

5. **¿El preset se persiste en URL (useSearchParams)?** Si el usuario navega fuera y vuelve, ¿debería recordar el preset/fechas? Los reports actuales no persisten nada en URL.

6. **¿Aplica a Balance General y Estado de Resultados?** Hoy no usan `PeriodoGestionFiltro`. Si Marco quiere que también tengan presets, es un cambio adicional (BG especialmente es distinto: es "as of date" no rango).

7. **¿El fix del backend (proyectar fechaInicio/fechaFin) debe ir PRIMERO como PR separado?** Dado que el nuevo componente Opción A ya no necesitaría `Periodo.fechaInicio/fechaFin` (usaría `Gestion.mesInicio` para derivar), podría ser un fix independiente que cierra la deuda de contrato.

8. **¿Cuándo el usuario cambia preset, el campo Desde/Hasta se sobreescribe silenciosamente?** ¿Hay que mostrar un confirm si el usuario editó las fechas a mano?

---

## 12. Archivos de referencia clave

| Archivo | Relevancia |
|---------|-----------|
| `backend/src/periodos-fiscales/dto/periodo-fiscal-response.dto.ts` | Fix principal backend — agregar fechaInicio/fechaFin |
| `backend/src/periodos-fiscales/domain/rango-periodo-fiscal.ts` | Lógica de derivación de fechas (no usa Date nativo) |
| `backend/src/periodos-fiscales/periodos-fiscales.controller.ts` | Agregar @ApiOkResponse |
| `frontend/src/components/shared/periodo-gestion-filtro.tsx` | Componente a rediseñar |
| `frontend/src/components/shared/periodo-gestion-filtro.test.tsx` | Tests a reescribir |
| `frontend/src/lib/fecha-actual.ts` | Helper existente para "hoy" en La Paz |
| `frontend/src/features/periodos-fiscales/lib/derivar-rango-gestion.ts` | Texto legible de rango — extender para YYYY-MM-DD |
| `frontend/src/types/api.ts` (líneas 514-528) | Tipo Periodo con los campos fantasma |
| `frontend/src/features/{6-features}/components/*-filtros.tsx` | 6 componentes de filtro a actualizar |
| `backend/test/periodos-fiscales.e2e-spec.ts` | Tests e2e — agregar asserts para fechas |
