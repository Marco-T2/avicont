# Design — Libros: filtro por cuenta (Diario + Mayor)

<!--
Última edición: 2026-05-30
Última revisión contra core: 2026-05-30
Owner: backend-lead
-->

## Contexto

El módulo `reportes` ya expone dos reportes contables:

- **Libro Mayor** — vista POR cuenta con saldos corrientes. `cuentaId` ya está validado en
  backend (`obtenerCuentaDetalle` → 404/400) y existe en `LibroMayorParams` (frontend) +
  la API call (`get-libro-mayor.ts`). PERO el control de selección NO está en la UI ni en el
  schema de validación: `libro-mayor-filtros.tsx` tiene **0** referencias a `cuentaId` y
  `libro-mayor-filtro-schema.ts` tampoco lo incluye. Feature a medio terminar en el front.
- **Libro Diario** — listado de asientos paginado, filtrando por rango/período. NO tiene
  filtro por cuenta en ninguna capa (backend ni frontend).

Este change: (1) agrega `cuentaId` **opcional** al Libro Diario end-to-end (backend + frontend),
y (2) completa el cableado del filtro de cuenta del Libro Mayor en el frontend (backend intacto).

### Hallazgos de la investigación del código real (corrigen supuestos del brief)

1. **`cuentas` SÍ expone un reader port cross-módulo, pero su superficie NO sirve para esto.**
   `CuentasReaderPort` (abstract) + `CUENTAS_READER_PORT` Symbol viven en
   `backend/src/cuentas/ports/cuentas-reader.port.ts`. `CuentasModule` lo registra y lo **exporta**
   (`exports: [..., CUENTAS_READER_PORT, ...]`). Su ÚNICO consumidor hoy es `comprobantes.service.ts`.
   **Su único método es `obtenerBatch(tenantId, cuentaIds: string[], tx?): Promise<Map<id, CuentaParaLinea>>`**
   — está diseñado para validar un lote de líneas de comprobante (`CuentaParaLinea` =
   `{ id, codigoInterno, nombre, activa, esDetalle, requiereContacto, permiteMultiMoneda, monedaFuncional }`),
   NO para un lookup puntual por id. Usarlo para validar una cuenta sería `obtenerBatch([cuentaId])`
   y leer del Map — funciona, pero es un encaje forzado. Además importar `CuentasModule` para
   consumirlo arrastra todo el grafo del módulo (riesgo de ciclo CJS prod, ver punto 3).
2. **El Mayor NO usa ese port.** `PrismaLibroMayorReaderAdapter.obtenerCuentaDetalle` lee
   `Cuenta` directo vía `prisma.cuenta.findFirst({ where: { id, organizationId }, select: { id, esDetalle } })`,
   devolviendo `CuentaDetalleResult | null` (`{ id, esDetalle }`). Es decir: el Mayor reimplementó
   un lookup de cuenta en su propio adapter en vez de consumir `CuentasReaderPort`.
3. **`reportes` NO importa nada de `cuentas/`.** Es self-contained; consume `PeriodosReaderModule`
   (leaf module) por DI, patrón establecido para evitar ciclos CJS en prod (memoria
   `prod-build-crash-ciclos`).
4. **Índice `@@index([organizationId, cuentaId])` en `lineas_comprobante` ya existe** → sin migración.
5. **El adapter del Diario NO tiene integration spec** (`prisma-comprobantes-reader.adapter`); el del
   Mayor sí. Habrá que crear uno (o extender e2e) para cubrir el `where` real.
6. **Frontend — formularios de filtros:** ambos (`libro-diario-filtros.tsx`, `libro-mayor-filtros.tsx`)
   usan `useForm` + `zodResolver(formSchema)` donde **`formSchema` es un `z.object` PLANO interno al
   componente** (NO el schema exportado). Los inputs de fecha usan `register`; los Select/Switch usan
   `setValue` + `watch`; **ningún campo usa `Controller`**. El payload final se arma en
   `handleSubmitInternal` y se pasa a `onBuscar(values: LibroXFiltroValues)`, donde el tipo viene del
   schema EXPORTADO (`discriminatedUnion('modo', ...)`, que NO actúa como resolver — solo tipa). Para
   cablear el autocomplete: `watch('cuentaId')` + `setValue('cuentaId', id)` (controlado, como los Select).
7. **`CuentaAutocomplete`** (`features/comprobantes/components/cuenta-autocomplete.tsx`) props:
   `{ value: string; onChange: (id: string) => void; disabled?; placeholder? }`. `value` es
   **`string`** (NO `string | null`); usa el hook `useCuentas({ esDetalle: true, activa: true, pageSize: 100 })`
   **siempre** (no hay prop `onlyDetalle` — ya filtra detalle/activa). Cross-feature permitido
   (frontend CLAUDE.md §14.6), requiere comentario `// Cross-feature:`.
8. **Tipos frontend** viven en `@/types/api`: `LibroDiarioParams` (sin `cuentaId`) y
   `LibroMayorParams` (CON `cuentaId?: string` ya presente).

## Decisiones

### D1 — Lookup de cuenta en el Diario: reutilizar `LibroMayorReaderPort.obtenerCuentaDetalle` (NO importar `CuentasModule`, NO crear port nuevo)

El `LibroDiarioService` necesita validar la cuenta (existe en tenant + `esDetalle`) antes de
filtrar. Tres opciones reales (no asumidas — el código las habilita a todas):

- **(a) Consumir `CuentasReaderPort`** del módulo `cuentas` (el dueño del dominio Cuenta, ya
  exporta el port) vía `obtenerBatch([cuentaId])`. `reportes.module.ts` importaría `CuentasModule`.
- **(b) Reutilizar `LibroMayorReaderPort.obtenerCuentaDetalle`** (vive en `reportes`, mismo
  bounded context, ya devuelve `{ id, esDetalle } | null` — justo lo que el Diario necesita).
- **(c) Crear un leaf `CuentasReaderModule`** (espejo de `PeriodosReaderModule`) que exporte solo
  el port sin arrastrar `CuentasService`/repo/seeder, e importarlo en `reportes`.

**Decisión: (b)** para ESTE change, con (c) anotada como deuda recomendada.

**Tradeoffs:**

- **(a)** es la opción "de libro" (consumir al dueño del dominio, §3.7) PERO arrastra problemas:
  primero, el contrato no encaja — `obtenerBatch` devuelve un `Map` pensado para validar lotes de
  líneas, no un lookup por id (encaje forzado). Segundo, `CuentasModule` registra `CuentasService`,
  `CUENTA_REPOSITORY_PORT`, `CUENTA_READER_PORT`, `PLAN_CUENTAS_SEEDER_PORT`, `MOVIMIENTOS_READER_PORT`
  y más. Importarlo entero a `reportes` infla el grafo de DI y reintroduce exactamente el riesgo de
  **ciclo de carga CJS en prod** que la memoria `prod-build-crash-ciclos` documenta (los e2e no lo
  agarran; crashea en `node dist/main.js`). El patrón vigente en `reportes` evita importar módulos
  pesados — usa leaf modules (`PeriodosReaderModule`).
- **(c)** resuelve el acople de (a) limpiamente (leaf module = solo el port, sin servicios — espejo
  exacto de `PeriodosReaderModule`: `providers: [PrismaService, TenantContextService, adapter, {provide: PORT, useExisting: adapter}]`,
  `exports: [PORT]`), y es la solución correcta a mediano plazo. Cuesta un archivo nuevo + un binding
  + un método de lookup por id en el port/adapter. NO se elige ahora porque el Mayor YA reimplementó
  el lookup por id en su propio adapter (hallazgo #2) y replicar la validación con (b) es **cero
  código de infraestructura nuevo**. Introducir (c) en este change mezclaría un refactor de acceso a
  cuentas con el feature de filtro — scope creep.
- **(b)** es pragmática y barata: el `LibroDiarioService` inyecta `LibroMayorReaderPort` y llama
  `obtenerCuentaDetalle(tenantId, cuentaId)`. Cero infraestructura nueva, cero riesgo de ciclo.

**Por qué (b) NO viola hexagonal (§3.7):** el Diario consume un **port abstracto**, no Prisma ni
un adapter. Que el port viva en `reportes` y se llame "Mayor" es deuda de naming, no de
arquitectura — ambos reportes están en el **mismo bounded context** (`reportes`), y §3.7 habilita
inyección directa / port compartido dentro del mismo módulo.

**Deuda registrada (no bloqueante, anotar en `docs/deudas-arquitecturales.md`):** consolidar el
acceso a Cuenta en `reportes`. Opción preferida: crear `CuentasReaderModule` leaf (c) y migrar
AMBOS reportes (Mayor y Diario) a consumir `CuentasReaderPort` del dueño del dominio, eliminando el
`obtenerCuentaDetalle` reimplementado en el adapter del Mayor. Disparador: tercer consumidor de
lectura de cuenta en `reportes`, o el primer refactor que toque el adapter del Mayor.

### D2 — Inyección y naming en el service del Diario

El `LibroDiarioService` recibe `LibroMayorReaderPort` con un nombre de propiedad que documenta la
intención y un comentario que justifica el préstamo:

```typescript
constructor(
  @Inject(COMPROBANTES_READER_PORT)
  private readonly comprobantesReader: ComprobantesReaderPort,
  @Inject(PERIODOS_READER_PORT)
  private readonly periodosReader: PeriodosReaderPort,
  // Reutiliza la validación de cuenta del Mayor (mismo bounded context, design D1).
  // Deuda: migrar a un CuentasReaderModule leaf compartido.
  @Inject(LIBRO_MAYOR_READER_PORT)
  private readonly cuentasReader: LibroMayorReaderPort,
  private readonly config: ConfigService,
) { ... }
```

Llamada: `await this.cuentasReader.obtenerCuentaDetalle(tenantId, query.cuentaId)`.

`reportes.module.ts`: **sin cambios estructurales** — `LIBRO_MAYOR_READER_PORT` ya está registrado
en el módulo (lo provee `PrismaLibroMayorReaderAdapter`), así que el Diario puede inyectarlo sin
tocar imports ni providers.

### D3 — Semántica del filtro en el Diario: Opción A (asiento completo)

Confirmado por la propuesta: si un asiento tiene **≥1 línea** con la cuenta filtrada, se devuelve el
asiento ENTERO (todas sus líneas), no solo las líneas de esa cuenta.

**Razón regulatoria:** el Libro Diario muestra asientos con partida doble visible (débito = crédito
por asiento, Código Tributario art. 47). Mostrar líneas sueltas de una sola cuenta rompería la
lectura: un asiento filtrado dejaría de cuadrar. Opción B (solo líneas de la cuenta) descartada.

**`where` exacto en el adapter** (`prisma-comprobantes-reader.adapter.ts`, método `buildWhere`):

```typescript
private buildWhere(tenantId: string, filtros: LibroDiarioFiltros) {
  const anulados = filtros.incluirAnulados ? {} : { anulado: false };

  return {
    organizationId: tenantId,                  // §4.2 primer predicado, defense in depth
    estado: { in: PrismaComprobantesReaderAdapter.ESTADOS_LIBRO },
    fechaContable: { gte: filtros.fechaDesde, lte: filtros.fechaHasta },
    ...anulados,
    // Opción A: el asiento entra si ALGUNA de sus líneas toca la cuenta filtrada.
    // El `select`/include de lineas NO se poda por este filtro `some` → asiento completo.
    ...(filtros.cuentaId !== undefined
      ? { lineas: { some: { cuentaId: filtros.cuentaId } } }
      : {}),
  };
}
```

**Consistencia con el conteo:** `buildWhere` es la ÚNICA fuente del `where` y la usan
`contarAsientos` (count) y `obtenerAsientosParaLibroDiario` (findMany). Agregar `cuentaId` ahí lo
propaga a ambos automáticamente → el tope defensivo 422 (`RangoExcedeLimiteError`) y el listado
quedan consistentes. NO se duplica lógica de filtrado.

**Nota Prisma (verificada como riesgo, mitigada en testing):** `lineas: { some: { cuentaId } }`
filtra los comprobantes pero el `select.lineas` sigue trayendo TODAS las líneas de cada comprobante
que matchea — Prisma no poda las relaciones seleccionadas por el filtro `some`. Esto es exactamente
lo que Opción A requiere. El integration spec lo verifica explícitamente.

### D4 — `cuentaId` opcional en port, DTO y service del Diario

**Port `ComprobantesReaderPort`** (`comprobantes-reader.port.ts`) — agregar a `LibroDiarioFiltros`:

```typescript
export interface LibroDiarioFiltros {
  readonly fechaDesde: Date;
  readonly fechaHasta: Date;
  readonly incluirAnulados: boolean;
  /** Si presente, solo asientos con ≥1 línea en esta cuenta (Opción A). */
  readonly cuentaId?: string;
}
```

**DTO** (`libro-diario-query.dto.ts`) — espeja `cuentaId?` del DTO del Mayor:

```typescript
@IsOptional()
@IsUUID('4')
cuentaId?: string;
```

**Service** (`libro-diario.service.ts`), en `consultarLibroDiario`:

1. Aceptar `cuentaId?` en el shape de `query`.
2. Validar cuenta DESPUÉS de resolver el rango de fechas y ANTES del tope/listado:
   ```typescript
   if (query.cuentaId !== undefined) {
     const cuenta = await this.cuentasReader.obtenerCuentaDetalle(tenantId, query.cuentaId);
     if (!cuenta) throw new CuentaNoEncontradaError(query.cuentaId);
     if (!cuenta.esDetalle) throw new CuentaNoDetalleError(query.cuentaId);
   }
   ```
3. Spread condicional al construir `filtros` (§2.5.1 `exactOptionalPropertyTypes`):
   ```typescript
   const filtros = {
     fechaDesde,
     fechaHasta,
     incluirAnulados: query.incluirAnulados,
     ...(query.cuentaId !== undefined ? { cuentaId: query.cuentaId } : {}),
   };
   ```

**Orden de validación (decisión):** rango de fechas → cuenta → tope (count) → listado. Razón: un
rango inválido falla barato (sin BD); una cuenta inexistente debe dar 404 explícito, no una lista
vacía silenciosa; el count va último porque ya depende de un `where` válido.

### D5 — Errores de dominio del Diario

Agregar a `domain/libro-diario-errors.ts`, espejando los del Mayor pero con namespace propio
`LIBRO_DIARIO_*` (códigos estables, §6.3). Las clases base son las mismas que ya usa el archivo
(`ValidationError`, `NotFoundError` de `@/common/errors`):

```typescript
/** El cuentaId no existe o no pertenece al tenant activo (no enumera ids ajenos, §4.2). */
export class CuentaNoEncontradaError extends NotFoundError {
  constructor(cuentaId: string) {
    super(
      'LIBRO_DIARIO_CUENTA_NO_ENCONTRADA',
      'La cuenta indicada no existe o no pertenece a esta organización',
      { cuentaId },
    );
  }
}

/** La cuenta es agrupadora (esDetalle=false) — no tiene movimientos directos. */
export class CuentaNoDetalleError extends ValidationError {  // 400
  constructor(cuentaId: string) {
    super(
      'LIBRO_DIARIO_CUENTA_NO_DETALLE',
      'La cuenta indicada es una cuenta agrupadora y no tiene movimientos directos. Seleccioná una cuenta de detalle.',
      { cuentaId },
    );
  }
}
```

**HTTP:** `CuentaNoEncontradaError` → 404 (vía `NotFoundError`), `CuentaNoDetalleError` → 400 (vía
`ValidationError`). El `GlobalExceptionFilter` ya mapea `DomainError` al formato estándar (§6.4).

**Nota de naming:** el Mayor usa `CuentaNoDetalleError` con código `LIBRO_MAYOR_CUENTA_NO_DETALLE`
(NO `CuentaNoEsDetalleError` como sugería el brief — verificado en `libro-mayor-errors.ts`). El
Diario usa el MISMO nombre de clase `CuentaNoDetalleError` pero en su propio archivo
(`libro-diario-errors.ts`) con código `LIBRO_DIARIO_CUENTA_NO_DETALLE`. Igual para
`CuentaNoEncontradaError`. No hay colisión: son clases distintas en módulos/archivos distintos; el
contrato público estable es el `code`, no el nombre de clase. Mantener nombres idénticos entre
ambos archivos es deliberado (consistencia de lectura).

### D6 — Frontend Libro Mayor: cablear `cuentaId` (schema interno + exported + autocomplete)

`cuentaId` ya está en `LibroMayorParams` y en `get-libro-mayor.ts` (API call). El form NO usa el
schema exportado como resolver: usa un **`formSchema` plano interno** al componente
(`z.object({ modo, periodoFiscalId, fechaDesde, fechaHasta, incluirAnulados, soloConMovimiento })`)
y construye el payload en `handleSubmitInternal`, que llama `onBuscar(values: LibroMayorFiltroValues)`.
El schema exportado `libroMayorFiltroSchema` es un `discriminatedUnion('modo', [...])` que tipa el
payload (`LibroMayorFiltroValues = z.output<...>`). Hay que tocar AMBOS:

- **`libro-mayor-filtros.tsx` (form interno):** agregar `cuentaId: z.string()` al `formSchema` plano
  con default `''`. Integrar `CuentaAutocomplete` con el patrón vigente (`useForm` + `watch` +
  `setValue`, NO `register`/`Controller` — hallazgo #6):
  ```tsx
  // Cross-feature: CuentaAutocomplete consume useCuentas({esDetalle:true,activa:true,pageSize:100}).
  // Límite backend pageSize 100 (ListarCuentasQueryDto @Max(100)). Ver frontend CLAUDE.md §14.6.
  const cuentaId = watch('cuentaId');   // '' = sin selección
  // ...
  <CuentaAutocomplete
    value={cuentaId}
    onChange={(id) => setValue('cuentaId', id)}
    placeholder="Todas las cuentas"
  />
  ```
  `CuentaAutocomplete.value` es `string` (no acepta `null`) → `''` representa "sin selección".
  En `handleSubmitInternal`, incluir `cuentaId` en el payload solo si `raw.cuentaId !== ''`
  (spread condicional), en AMBAS ramas (`periodo` y `rango`).
- **`libro-mayor-filtro-schema.ts` (exported, ambas ramas del discriminatedUnion):** agregar
  `cuentaId: z.string().uuid().optional()` al `togglesShape` (ya compartido entre ramas), para que
  `LibroMayorFiltroValues` (el tipo del payload de `onBuscar`) admita `cuentaId?`. **Opcional**: el
  backend trata el Mayor sin `cuentaId` como "todas las cuentas"; no se fuerza obligatorio para no
  cambiar la semántica. (Si UX decide que el Mayor SIEMPRE filtre por una cuenta, es decisión a
  confirmar; el diseño no la impone.)

### D7 — Frontend Libro Diario: agregar `cuentaId` end-to-end (opcional)

Misma arquitectura de form que el Mayor (flat `formSchema` interno + `handleSubmitInternal` +
exported `libroDiarioFiltroSchema` discriminatedUnion). Cambios:

- **`@/types/api` → `LibroDiarioParams`** (línea 829): agregar `cuentaId?: string;`.
- **`api/get-libro-diario.ts`**: agregar al spread condicional de `params`:
  `...(params.cuentaId !== undefined ? { cuentaId: params.cuentaId } : {})`.
- **`components/libro-diario-filtros.tsx` (form interno):** agregar `cuentaId: z.string()` al
  `formSchema` plano (default `''`); integrar `CuentaAutocomplete` con `watch`/`setValue` (mismo
  patrón que D6, placeholder "Todas las cuentas"); en `handleSubmitInternal` incluir `cuentaId` en
  el payload solo si `raw.cuentaId !== ''` (spread condicional, ambas ramas).
- **`schemas/libro-diario-filtro-schema.ts` (exported):** agregar
  `cuentaId: z.string().uuid().optional()` a AMBAS ramas del discriminatedUnion (no hay un
  `togglesShape` compartido como en el Mayor — el Diario inlinea `incluirAnulados` en cada rama;
  agregar `cuentaId` en cada una). Opcional porque el filtro no es obligatorio en el Diario. (Zod
  `.uuid()` valida RFC-4122.)
- El `hook`/`page` que arman los `LibroDiarioParams` para `useLibroDiario` reciben el payload de
  `onBuscar` (que ya incluye `cuentaId?` cuando se seleccionó); verificar en apply que el mapeo
  payload→params propague `cuentaId` (omitirlo cuando ausente, no mandar `''`).

**Reutilización:** un único `CuentaAutocomplete` sirve a ambos reportes. No se crea componente nuevo.

## Archivos afectados

### Backend (`backend/src/reportes/`)

| Archivo | Cambio |
|---------|--------|
| `ports/comprobantes-reader.port.ts` | + `cuentaId?: string` en `LibroDiarioFiltros` |
| `adapters/prisma-comprobantes-reader.adapter.ts` | `buildWhere` → `lineas: { some: { cuentaId } }` condicional (afecta count + findMany) |
| `dto/libro-diario-query.dto.ts` | + `cuentaId?` con `@IsOptional() @IsUUID('4')` |
| `libro-diario.service.ts` | inyectar `LibroMayorReaderPort`; aceptar `cuentaId?` en `query`; validar cuenta; spread al filtro |
| `domain/libro-diario-errors.ts` | + `CuentaNoEncontradaError` (404) + `CuentaNoDetalleError` (400) |

> `reportes.module.ts` **sin cambios** (LIBRO_MAYOR_READER_PORT ya registrado). **Sin migración.**
> `libro-diario.controller.ts`: el `cuentaId` del DTO se propaga vía el spread existente del query
> al service — verificar en apply que el controller pase `cuentaId` (probable spread condicional ya
> presente; si arma el objeto campo por campo, agregar `cuentaId`).

### Frontend

| Archivo | Cambio |
|---------|--------|
| `types/api.ts` (`LibroDiarioParams`, ~L829) | + `cuentaId?: string` |
| `features/libro-diario/api/get-libro-diario.ts` | + `cuentaId` en spread de params |
| `features/libro-diario/schemas/libro-diario-filtro-schema.ts` | + `cuentaId: z.string().uuid().optional()` en AMBAS ramas del discriminatedUnion |
| `features/libro-diario/components/libro-diario-filtros.tsx` | + `cuentaId` en `formSchema` plano interno + `CuentaAutocomplete` (watch/setValue) + spread en `handleSubmitInternal` |
| `features/libro-mayor/schemas/libro-mayor-filtro-schema.ts` | + `cuentaId: z.string().uuid().optional()` en `togglesShape` (compartido) |
| `features/libro-mayor/components/libro-mayor-filtros.tsx` | + `cuentaId` en `formSchema` plano interno + `CuentaAutocomplete` (watch/setValue) + spread en `handleSubmitInternal` |
| (reutilizado) `features/comprobantes/components/cuenta-autocomplete.tsx` | sin cambios |

## Estrategia de testing (TDD estricto — RED → GREEN → REFACTOR)

Coverage objetivo dominio contable: **95%** (§7.5). Invariantes con caso positivo Y negativo.

### Backend — unit del service (`libro-diario.service.spec.ts`, sin DB)

Mockear `ComprobantesReaderPort`, `PeriodosReaderPort`, `LibroMayorReaderPort` (NUNCA Prisma, §7.8).
Casos nuevos (los existentes son regresión):

- `cuentaId` ausente → NO se llama `obtenerCuentaDetalle`; `filtros` sin `cuentaId`.
- `cuentaId` presente + cuenta existe + `esDetalle=true` → se llama lookup; `filtros` incluye `cuentaId`.
- `cuentaId` presente + lookup devuelve `null` → `CuentaNoEncontradaError` (404); NO se llama listado.
- `cuentaId` presente + `esDetalle=false` → `CuentaNoDetalleError` (400); NO se llama listado.
- orden: rango inválido + `cuentaId` → falla por rango ANTES de validar cuenta.

### Backend — integration del adapter (Postgres real, TX por test)

Crear `adapters/prisma-comprobantes-reader.adapter.integration.spec.ts` (hoy no existe, hallazgo #5).
Verifica el `where` real:

- asiento que toca la cuenta filtrada → devuelto con **todas** sus líneas (Opción A, anti-poda).
- asiento que NO toca la cuenta → excluido.
- `contarAsientos` con `cuentaId` → consistente con el listado (mismo `where`).
- **multi-tenant (§4.2, obligatorio caso + y −):** asiento de OTRO `organizationId` con la misma
  `cuentaId` → excluido.
- combinación `cuentaId` + rango + anulados → AND correcto.

### Backend — e2e (`test/libro-diario.e2e-spec.ts`, HTTP real)

- `GET /api/libros/diario?cuentaId=<detalle-existente>` → 200, asientos completos.
- `cuentaId` inexistente → 404 `LIBRO_DIARIO_CUENTA_NO_ENCONTRADA`.
- `cuentaId` de cuenta agrupadora → 400 `LIBRO_DIARIO_CUENTA_NO_DETALLE`.
- `cuentaId` no-UUID → 400 (validación DTO).
- aislamiento de tenant vía JWT (`cuentaId` de otro tenant → 404).

### Frontend (Vitest, tests al lado)

- `libro-diario-filtros.test.tsx`: seleccionar cuenta → al aplicar, params incluyen `cuentaId`;
  sin seleccionar → params SIN `cuentaId` (opcional); deseleccionar (`''`) → vuelve a omitirlo.
- `libro-mayor-filtros.test.tsx`: render del `CuentaAutocomplete`; seleccionar → `cuentaId` fluye
  al submit. (Si UX decide cuenta obligatoria en Mayor, agregar test de error de schema.)
- `libro-diario-filtro-schema.test.ts` / `libro-mayor-filtro-schema.test.ts`: `cuentaId` válido
  pasa, UUID inválido falla, ausente pasa (opcional).

> Gotchas frontend confirmados: `pnpm exec tsc -b` (NO `--noEmit`); Zod `.uuid()` RFC-4122; los
> filtros usan `useForm` + `setValue`/`watch` (NO `register`/`Controller`); `CuentaAutocomplete.value`
> es `string` (mapear ausencia a `''`).

## Riesgos

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| Fuga multi-tenant vía `cuentaId` de otro tenant | Alto (seguridad §4.2) | `organizationId` primer predicado en `buildWhere` Y en `obtenerCuentaDetalle`; integration + e2e de aislamiento |
| `lineas: { some }` podara líneas del select | Bajo | Prisma NO poda relaciones seleccionadas por `some`; integration spec lo verifica explícitamente |
| `total` (count) ≠ página si el `where` difiere | Medio | `buildWhere` única fuente; integration compara count vs list |
| Importar `CuentasModule` reintroduce ciclo CJS prod | Evitado | D1 elige reutilizar el port del mismo módulo; NO se importa `CuentasModule` |
| Naming confuso: Diario inyecta `LibroMayorReaderPort` | Bajo | Comentario en constructor + deuda registrada (D1) |
| UX del Mayor: ¿cuenta obligatoria u opcional? | Bajo | Diseño deja `cuentaId` opcional (no rompe backend); confirmar UX en apply si se quiere forzar |
| Brief desactualizado (schema Mayor "ya tiene cuentaId") | Resuelto | Verificado: schema Mayor NO tiene cuentaId; D6 lo agrega |

## Notas anti-drift contra el core

- §3.7 (cross-module → port): respetado — el Diario consume un port abstracto del mismo bounded
  context; se evita conscientemente importar `CuentasModule` (riesgo de ciclo, memoria prod-crash).
- §4.2 (multi-tenant): `organizationId` primer predicado en todas las queries nuevas; lookup de
  cuenta scoped por tenant.
- §6.3 (códigos de error): namespace `LIBRO_DIARIO_CUENTA_*` estable y propio.
- §2.5.1 (exactOptionalPropertyTypes): spread condicional DTO→filtro y en params frontend.
- Sin migración (índice `@@index([organizationId, cuentaId])` ya existe en `lineas_comprobante`).
