# Design — Libros: filtro por cuenta (Diario + Mayor)

<!--
Última edición: 2026-05-31
Última revisión contra core: 2026-05-31
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

### D1 — Lookup de cuenta en el Diario: crear un leaf `CuentasReaderModule` propio del dominio Cuenta (opción c)

El `LibroDiarioService` necesita validar la cuenta (existe en tenant + `esDetalle`) antes de
filtrar. Cuatro opciones reales (el código las habilita a todas):

- **(a) Consumir `CuentasReaderPort`** del módulo `cuentas` vía `obtenerBatch([cuentaId])`.
  `reportes.module.ts` importaría `CuentasModule` entero.
- **(b) Reutilizar `LibroMayorReaderPort.obtenerCuentaDetalle`** (vive en `reportes`, mismo
  bounded context, ya devuelve `{ id, esDetalle } | null`). El Diario inyectaría el port del Mayor.
- **(c) Crear un leaf `CuentasReaderModule`** (espejo exacto de `PeriodosReaderModule`) que exporte
  SOLO un `CuentasReaderPort` de lookup por id (`obtenerCuentaDetalle`) sin arrastrar
  `CuentasService`/repo/seeder/movimientos. Lo importan los reportes que lo necesiten.
- **(d) Agregar `obtenerCuentaDetalle` al propio `ComprobantesReaderPort`** del Diario y
  reimplementar el `findFirst` en `PrismaComprobantesReaderAdapter`.

**Decisión: (c).** El Diario consume un `CuentasReaderPort` honesto desde un leaf
`CuentasReaderModule` nuevo; en ESTE change solo se cablea el Diario (el Mayor NO se migra —
queda como deuda con disparador explícito).

**Tradeoffs:**

- **(a) descartada.** El contrato no encaja: `obtenerBatch` devuelve un `Map` pensado para validar
  LOTES de líneas de comprobante, no un lookup puntual por id (encaje forzado). Peor: `CuentasModule`
  registra `CuentasService`, `CUENTA_REPOSITORY_PORT`, `CUENTA_READER_PORT`, `PLAN_CUENTAS_SEEDER_PORT`,
  `MOVIMIENTOS_READER_PORT` y más. Importarlo entero a `reportes` infla el grafo de DI y reintroduce
  exactamente el riesgo de **ciclo de carga CJS en prod** que la memoria `prod-build-crash-ciclos`
  documenta (los e2e NO lo agarran; crashea en `node dist/main.js`). El patrón vigente en `reportes`
  es justamente evitar módulos pesados usando leaf modules.

- **(b) descartada — miente en el boundary de DI.** Pragmática y barata en código, pero el
  `LibroDiarioService` terminaría inyectando `LIBRO_MAYOR_READER_PORT` bajo una propiedad
  `cuentasReader` con un comentario que pide disculpas (ver el constructor que proponía D2 en la
  versión anterior). El TIPO dice "Mayor reader", el uso dice "cuentas reader": **mentira semántica
  en el grafo de inyección**. Esto no es deuda de naming cosmética — es el contrato de DI mintiendo
  sobre qué consume el Diario. Síntoma concreto: cuando se fue a implementar, `tasks.md` se desvió
  SILENCIOSAMENTE a (d) en vez de (b) — señal de que (b) no sobrevive al contacto con el código.
  Además acopla la capability Diario a la capability Mayor sin razón de dominio: si mañana el Mayor
  cambia la firma de `obtenerCuentaDetalle`, rompe el Diario sin que nada en el dominio lo justifique.

- **(d) descartada — duplica y contamina.** Reimplementar `prisma.cuenta.findFirst({ where: { id,
  organizationId }, select: { id, esDetalle } })` en `PrismaComprobantesReaderAdapter` DUPLICA
  byte-por-byte el mismo lookup que ya vive en el adapter del Mayor (verificado en
  `prisma-libro-mayor-reader.adapter.ts:329-347`) — dos `findFirst` idénticos en dos adapters del
  MISMO módulo. Y obliga a que `ComprobantesReaderPort` — cuyo header documenta que su razón de ser
  es "lee comprobantes" — pase a leer también cuentas. Dos smells (duplicación + port con doble
  responsabilidad) para esquivar un archivo nuevo.

- **(c) elegida.** Es un leaf module de ~2 archivos que ESPEJA `PeriodosReaderModule`
  (`providers: [PrismaService, TenantContextService, adapter, {provide: PORT, useExisting: adapter}]`,
  `exports: [PORT]`) — un patrón ya bendecido en este repo precisamente para consumir un dominio
  ajeno sin arrastrar su módulo pesado ni cerrar ciclos CJS. Da un `CuentasReaderPort` HONESTO: el
  Diario inyecta algo que dice "cuentas" y ES cuentas. Cero duplicación nueva respecto del Diario,
  cero mentira semántica, cero riesgo de ciclo. **El esfuerzo es comparable a (d)** — ambas agregan
  un método de lookup con su `findFirst`; la diferencia es que (c) lo pone en un port honesto del
  dominio Cuenta en vez de duplicarlo dentro del port de comprobantes. **No es scope creep:** en este
  change el Mayor NO se toca (sigue con su `obtenerCuentaDetalle` propio); solo se crea el leaf y se
  cablea el Diario.

**Por qué (c) respeta hexagonal (§3.2, §3.7):** cruzar la frontera de módulo (`reportes` lee del
dominio `Cuenta`) se hace vía **port abstracto**, no Prisma ni adapter concreto. El leaf
`CuentasReaderModule` vive junto al dominio que expone (`cuentas/`) y publica un contrato mínimo de
solo-lectura — el dueño del dominio controla su superficie pública (§3.7). Es el MISMO patrón con que
`reportes` consume períodos hoy.

**Deuda registrada (no bloqueante, anotar en `docs/deudas-arquitecturales.md`):** migrar el Libro
Mayor a consumir el nuevo `CuentasReaderPort` del leaf, eliminando el `obtenerCuentaDetalle`
reimplementado en `PrismaLibroMayorReaderAdapter` (líneas 329-347). Disparador: el primer refactor
que toque ese adapter del Mayor, o cuando se quiera unificar el contrato de lectura de cuenta entre
ambos reportes. Tras esa migración, `CuentaDetalleResult` puede moverse del port del Mayor al port
del leaf y el Mayor lo importa desde ahí.

### D2 — El leaf `CuentasReaderModule`, el port honesto y la inyección en el Diario

**Nuevo leaf module** `backend/src/cuentas/cuentas-reader.module.ts` — espejo EXACTO de
`PeriodosReaderModule`. Vive junto al dominio Cuenta (`cuentas/`), expone solo el binding del port:

```typescript
import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';

import { PrismaCuentasReaderLookupAdapter } from './adapters/prisma-cuentas-reader-lookup.adapter';
import { CUENTAS_READER_LOOKUP_PORT } from './ports/cuentas-reader-lookup.port';

// Módulo-puerto cross-módulo: expone SOLO el lookup de cuenta por id (consumido
// por `reportes` para validar la cuenta del filtro). Vive separado de `CuentasModule`
// para que `reportes` lo importe sin tirar del require de `cuentas.module.ts` —
// evita el ciclo de carga CJS en prod (mismo patrón que PeriodosReaderModule).
@Module({
  providers: [
    PrismaService,
    TenantContextService,
    PrismaCuentasReaderLookupAdapter,
    { provide: CUENTAS_READER_LOOKUP_PORT, useExisting: PrismaCuentasReaderLookupAdapter },
  ],
  exports: [CUENTAS_READER_LOOKUP_PORT],
})
export class CuentasReaderModule {}
```

**Nuevo port** `backend/src/cuentas/ports/cuentas-reader-lookup.port.ts` — contrato honesto del
dominio Cuenta para lookup por id. JSDoc obligatorio (port = contrato público, §2.3):

```typescript
export const CUENTAS_READER_LOOKUP_PORT = Symbol('CUENTAS_READER_LOOKUP_PORT');

/** Resultado del lookup puntual de cuenta por id (existencia + esDetalle). */
export interface CuentaLookupResult {
  id: string;
  esDetalle: boolean;
}

export abstract class CuentasReaderLookupPort {
  /**
   * Busca una cuenta por id dentro del tenant (defense in depth §4.2).
   * Filtra por organizationId — una cuenta de otro tenant devuelve `null`,
   * misma respuesta que inexistente (Anti-31: no enumera ids ajenos).
   *
   * @param tenantId - organizationId del JWT activo
   * @param cuentaId - UUID de la cuenta a verificar
   */
  abstract obtenerCuentaDetalle(
    tenantId: string,
    cuentaId: string,
  ): Promise<CuentaLookupResult | null>;
}
```

> **Naming (§1):** se usa `CuentasReaderLookupPort` / `CUENTAS_READER_LOOKUP_PORT` (con sufijo
> `Lookup`) para NO colisionar con el `CuentasReaderPort` / `CUENTAS_READER_PORT` ya existente en
> `cuentas/ports/cuentas-reader.port.ts` (el del `obtenerBatch`, opción a). Son dos contratos
> distintos del mismo dominio con propósitos distintos; conviven sin ambigüedad de símbolo.

**Nuevo adapter** `backend/src/cuentas/adapters/prisma-cuentas-reader-lookup.adapter.ts` — el
`findFirst` scoped por tenant (idéntico en forma al del Mayor, pero ahora ÚNICO y en su lugar
correcto, dueño del dominio):

```typescript
@Injectable()
export class PrismaCuentasReaderLookupAdapter extends CuentasReaderLookupPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async obtenerCuentaDetalle(
    tenantId: string,
    cuentaId: string,
  ): Promise<CuentaLookupResult | null> {
    // Defense in depth (§4.2): organizationId en el where. Otro tenant → null.
    return this.prisma.cuenta.findFirst({
      where: { id: cuentaId, organizationId: tenantId },
      select: { id: true, esDetalle: true },
    });
  }
}
```

**Inyección en el Diario** — el `LibroDiarioService` inyecta un port que dice "cuentas" y ES
cuentas (sin comentario de disculpa, sin mentira de tipo):

```typescript
constructor(
  @Inject(COMPROBANTES_READER_PORT)
  private readonly comprobantesReader: ComprobantesReaderPort,
  @Inject(PERIODOS_READER_PORT)
  private readonly periodosReader: PeriodosReaderPort,
  @Inject(CUENTAS_READER_LOOKUP_PORT)
  private readonly cuentasReader: CuentasReaderLookupPort,
  private readonly config: ConfigService,
) { ... }
```

Llamada: `await this.cuentasReader.obtenerCuentaDetalle(tenantId, query.cuentaId)`.

**`reportes.module.ts`:** agregar `CuentasReaderModule` a `imports` (junto a `PeriodosReaderModule`
y `RbacModule`). NO se importa `CuentasModule`. El `ComprobantesReaderPort` NO se toca — sigue
leyendo solo comprobantes. El `LibroMayorReaderPort.obtenerCuentaDetalle` queda intacto (deuda D1).

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

### Backend (`backend/src/` — paths relativos a `src/`)

| Archivo | Cambio |
|---------|--------|
| `cuentas/ports/cuentas-reader-lookup.port.ts` | **NUEVO** — `CuentasReaderLookupPort` + `CUENTAS_READER_LOOKUP_PORT` + `CuentaLookupResult` |
| `cuentas/adapters/prisma-cuentas-reader-lookup.adapter.ts` | **NUEVO** — `findFirst` scoped por tenant (`id`, `esDetalle`) |
| `cuentas/cuentas-reader.module.ts` | **NUEVO** — leaf module (espejo de `PeriodosReaderModule`), exporta el port |
| `reportes/reportes.module.ts` | + `CuentasReaderModule` en `imports` (NO `CuentasModule`) |
| `reportes/ports/comprobantes-reader.port.ts` | + `cuentaId?: string` en `LibroDiarioFiltros` (NO se agrega método de lookup — sigue leyendo solo comprobantes) |
| `reportes/adapters/prisma-comprobantes-reader.adapter.ts` | `buildWhere` → `lineas: { some: { cuentaId } }` condicional (afecta count + findMany) |
| `reportes/dto/libro-diario-query.dto.ts` | + `cuentaId?` con `@IsOptional() @IsUUID('4')` |
| `reportes/libro-diario.service.ts` | inyectar `CuentasReaderLookupPort`; aceptar `cuentaId?` en `query`; validar cuenta; spread al filtro |
| `reportes/domain/libro-diario-errors.ts` | + `CuentaNoEncontradaError` (404) + `CuentaNoDetalleError` (400) |

> **Sin migración** (índice `@@index([organizationId, cuentaId])` ya existe).
> `PrismaComprobantesReaderAdapter` **NO** gana un `obtenerCuentaDetalle` — el lookup vive en el
> nuevo leaf de `cuentas`, no duplicado en el adapter de comprobantes (decisión D1, descarta opción d).
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

Mockear `ComprobantesReaderPort`, `PeriodosReaderPort`, `CuentasReaderLookupPort` (NUNCA Prisma,
§7.8). Casos nuevos (los existentes son regresión):

- `cuentaId` ausente → NO se llama `obtenerCuentaDetalle`; `filtros` sin `cuentaId`.
- `cuentaId` presente + cuenta existe + `esDetalle=true` → se llama lookup; `filtros` incluye `cuentaId`.
- `cuentaId` presente + lookup devuelve `null` → `CuentaNoEncontradaError` (404); NO se llama listado.
- `cuentaId` presente + `esDetalle=false` → `CuentaNoDetalleError` (400); NO se llama listado.
- orden: rango inválido + `cuentaId` → falla por rango ANTES de validar cuenta.

### Backend — integration del adapter de comprobantes (Postgres real, TX por test)

Crear `reportes/adapters/prisma-comprobantes-reader.adapter.integration.spec.ts` (hoy no existe,
hallazgo #5). Verifica el `where` real del FILTRO (no el lookup de cuenta — ese vive en el leaf):

- asiento que toca la cuenta filtrada → devuelto con **todas** sus líneas (Opción A, anti-poda).
- asiento que NO toca la cuenta → excluido.
- `contarAsientos` con `cuentaId` → consistente con el listado (mismo `where`).
- **multi-tenant (§4.2, obligatorio caso + y −):** asiento de OTRO `organizationId` con la misma
  `cuentaId` → excluido.
- combinación `cuentaId` + rango + anulados → AND correcto.

### Backend — integration del adapter del leaf de cuentas (Postgres real, TX por test)

Crear `cuentas/adapters/prisma-cuentas-reader-lookup.adapter.integration.spec.ts`. Verifica el
lookup por id scoped al tenant (la pieza que antes la opción d hubiera duplicado en el adapter de
comprobantes):

- cuenta de detalle del tenant → `{ id, esDetalle: true }`.
- cuenta agrupadora del tenant → `{ id, esDetalle: false }`.
- UUID inexistente → `null`.
- **multi-tenant (§4.2):** cuenta de OTRO tenant → `null` (Anti-31, no enumera ids ajenos).

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
| Importar `CuentasModule` reintroduce ciclo CJS prod | Evitado | D1 elige leaf `CuentasReaderModule` (espejo `PeriodosReaderModule`); NO se importa `CuentasModule` |
| Lookup de cuenta duplicado entre Mayor y leaf nuevo | Bajo (transitorio) | En este change el Mayor NO se migra; el `findFirst` queda duplicado a propósito hasta la deuda D1 (disparador: refactor del adapter del Mayor). El leaf es la fuente única a futuro |
| Colisión de símbolo con `CUENTAS_READER_PORT` existente | Bajo | Nombre nuevo `CUENTAS_READER_LOOKUP_PORT` + `CuentasReaderLookupPort` (sufijo `Lookup`) — sin colisión |
| UX del Mayor: ¿cuenta obligatoria u opcional? | Bajo | Diseño deja `cuentaId` opcional (no rompe backend); confirmar UX en apply si se quiere forzar |
| Brief desactualizado (schema Mayor "ya tiene cuentaId") | Resuelto | Verificado: schema Mayor NO tiene cuentaId; D6 lo agrega |

## Notas anti-drift contra el core

- §3.2 / §3.7 (cross-module → port): respetado — el Diario consume un port abstracto del dominio
  Cuenta (`CuentasReaderLookupPort`) vía un leaf module (`CuentasReaderModule`), patrón ya
  establecido con `PeriodosReaderModule`. Se evita conscientemente importar `CuentasModule` (riesgo
  de ciclo CJS, memoria prod-crash) y se evita la mentira semántica de inyectar el port del Mayor.
- §4.2 (multi-tenant): `organizationId` primer predicado en todas las queries nuevas; lookup de
  cuenta scoped por tenant.
- §6.3 (códigos de error): namespace `LIBRO_DIARIO_CUENTA_*` estable y propio.
- §2.5.1 (exactOptionalPropertyTypes): spread condicional DTO→filtro y en params frontend.
- Sin migración (índice `@@index([organizationId, cuentaId])` ya existe en `lineas_comprobante`).
