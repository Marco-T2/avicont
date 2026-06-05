# Design: Exportación a Excel — Fase C (Listado de Comprobantes)

> Artifact store: hybrid
> Topic key: `sdd/exportacion-excel-fase-c/design`
> Fecha: 2026-06-05
> Strict TDD Mode: ACTIVO — cada unidad se especifica test-first (RED → GREEN).

## 1. Ubicación del endpoint

El endpoint vive en el módulo **`comprobantes/`** (NO en `reportes/`). Justificación:
- El listado sin paginar es la **misma proyección** que el listado paginado (`toComprobanteListItem`),
  no agrega, no transforma, no calcula saldos. `reportes/` es para informes con agregación contable
  (Libro Diario/Mayor, EE.FF.).
- El port `ComprobanteRepositoryPort`, el tipo `ComprobanteListRow`, el `LIST_INCLUDE` y el mapeo
  `toComprobanteListItem` ya están en `comprobantes/`. Cruzar a `reportes/` duplicaría todo.
- Hexagonal §3: nuevo método en el port del propio módulo + adapter. Cero cruce ilegal.

Ruta: `GET /api/comprobantes/export`. Va declarado en el controller **ANTES** del `@Get(':id')` para
que `export` no sea capturado como un `id` (el `@Get(':id')` usa `ParseUUIDPipe`, así que `export` no
matchearía un UUID y devolvería 400 — pero por claridad y para evitar sorpresas, declararlo antes).
Punto de toque: `comprobantes.controller.ts:84` (justo después del `@Get()` del listado).

## 2. Hallazgo clave: NO existe `numeroReferencia`

Verificado contra el código real (`prisma/schema.prisma:662` modelo `Comprobante`,
`comprobante-response.dto.ts:72` `ComprobanteListItemDto`):

- **NO hay** ningún campo `numeroReferencia` en el modelo ni en el DTO.
- La columna "Nro. Ref." de la tabla en pantalla (`comprobantes-table.tsx:137,169`) sale de
  `documentosRespaldo[].numero` vía el helper `etiquetaDocumentoNumero`.
- La columna "Documento" sale de `documentosRespaldo[].tipoNombre` vía `etiquetaDocumentoTipo`.

**Decisión:** el export reusa `ComprobanteListItemDto` tal cual (ya trae todo lo necesario). En el
Excel, "Documento respaldo" = `documentosRespaldo[].tipoNombre` concatenados con `" / "`, y "Nro. Ref."
= `documentosRespaldo[].numero` concatenados con `" / "`. Ambas columnas salen del MISMO array
`documentosRespaldo[]`. NO se agrega ningún campo nuevo al modelo ni al DTO.

A diferencia de la tabla en pantalla (que muestra "Varios" cuando hay >1), el **Excel concatena todos**
(tiene espacio horizontal y es un documento de auditoría — conviene el detalle completo). Por eso NO se
reusan `etiquetaDocumentoTipo`/`etiquetaDocumentoNumero`/`etiquetaContacto` (devuelven "Varios"); el
mapeo de export usa su propia concatenación con `" / "`.

## 3. Backend — port + adapter

### 3.1 Port

`comprobante.repository.port.ts` — firma EXACTA del `listar` existente (`:185`):
```ts
abstract listar(
  tenantId: string,
  filtros: ListarFiltros,
  pagination: { page: number; limit: number },
  tx?: Prisma.TransactionClient,
): Promise<{ items: ComprobanteListRow[]; total: number }>;
```

Se ADICIONAN dos métodos (reusan `ListarFiltros` y `ComprobanteListRow`, ya definidos en el port):
```ts
/**
 * Cuenta los comprobantes del tenant que matchean los filtros, sin paginar.
 * Para el tope defensivo del export (REQ cap). Mismo WHERE que listarParaExport.
 */
abstract contarParaExport(
  tenantId: string,
  filtros: ListarFiltros,
  tx?: Prisma.TransactionClient,
): Promise<number>;

/**
 * Lista TODOS los comprobantes del tenant que matchean los filtros, SIN paginar.
 * Orden cronológico ASCENDENTE (fechaContable ASC, numero ASC NULLS LAST) — para
 * lectura de auditoría. DISTINTO del orden DESC del listado paginado.
 * El caller (service) ya validó el tope vía contarParaExport.
 */
abstract listarParaExport(
  tenantId: string,
  filtros: ListarFiltros,
  tx?: Prisma.TransactionClient,
): Promise<ComprobanteListRow[]>;
```

> Decisión `contarParaExport` separado vs reusar un count: el `listar` actual hace su propio
> `client.comprobante.count` inline. Exponer `contarParaExport` en el port mantiene el cap del service
> testeable con mock trivial (sin Prisma) y el WHERE encapsulado en el adapter. Alternativa rechazada:
> hacer el count en el service con Prisma directo → viola Anti-31 (el service no toca Prisma).

### 3.2 Adapter — extraer helper de WHERE (mitigación de drift Anti-31)

`prisma-comprobante.repository.ts`. Hoy el WHERE vive inline en `listar` (`:222-245`). Para que
`listar` y `listarParaExport`/`contarParaExport` **NO dupliquen** la lógica de aislamiento por tenant
(riesgo de drift de seguridad), extraer un helper privado:

```ts
private construirWhereListado(
  tenantId: string,
  filtros: ListarFiltros,
): Prisma.ComprobanteWhereInput {
  return {
    organizationId: tenantId, // Anti-31 — SIEMPRE
    ...(!filtros.incluirAnulados ? { anulado: false } : {}),
    ...(filtros.periodoFiscalId ? { periodoFiscalId: filtros.periodoFiscalId } : {}),
    ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
    ...(filtros.estado ? { estado: filtros.estado } : {}),
    ...(filtros.fechaDesde || filtros.fechaHasta
      ? { fechaContable: {
          ...(filtros.fechaDesde ? { gte: filtros.fechaDesde } : {}),
          ...(filtros.fechaHasta ? { lte: filtros.fechaHasta } : {}),
        } }
      : {}),
    ...(filtros.q
      ? { OR: [
          { numero: { contains: filtros.q, mode: 'insensitive' as const } },
          { glosa: { contains: filtros.q, mode: 'insensitive' as const } },
        ] }
      : {}),
  };
}
```

`listar` se refactoriza para usar `construirWhereListado` (su comportamiento no cambia — sus tests
existentes deben seguir verdes). `contarParaExport` y `listarParaExport` lo reusan:

```ts
async contarParaExport(tenantId, filtros, tx?) {
  const client = tx ?? this.prisma;
  return client.comprobante.count({ where: this.construirWhereListado(tenantId, filtros) });
}

async listarParaExport(tenantId, filtros, tx?) {
  const client = tx ?? this.prisma;
  return client.comprobante.findMany({
    where: this.construirWhereListado(tenantId, filtros),
    include: LIST_INCLUDE,                                       // reuso del listado
    orderBy: [{ fechaContable: 'asc' }, { numero: { sort: 'asc', nulls: 'last' } }],
    // SIN skip/take — trae todo el rango
  });
}
```

**Orden ASC con NULLS LAST** (decisión #4 producto): cronológico ascendente para auditoría; los
borradores (numero NULL) van AL FINAL dentro de cada fecha. El listado paginado usa `desc` + `nulls:
'first'` (`:251`) — el export es deliberadamente lo opuesto.

## 4. Backend — DTOs

### 4.1 Query DTO

`listar-comprobantes.dto.ts`. Nuevo `ExportarComprobantesQueryDto`: copia de
`ListarComprobantesQueryDto` SIN `page`/`limit`. Conserva `periodoFiscalId`, `tipo`, `estado`,
`fechaDesde`, `fechaHasta`, `q`, `incluirAnulados` (con sus mismos decoradores `class-validator` y el
mismo `@Transform` del boolean de `incluirAnulados`). Se conservan `fechaDesde`/`fechaHasta` por
consistencia con `ListarFiltros` y porque el backend los soporta gratis (la UI no los emite hoy).

> No se hereda con `extends ... OmitType(...)` para evitar acoplar los dos DTOs y romper el contrato
> de OpenAPI si el listado cambia su paginación. Se define plano (mismo estilo que el resto del repo).

### 4.2 Response DTO

`comprobante-response.dto.ts`. Nuevo wrapper (REUSA `ComprobanteListItemDto` ya existente, que expone
TODOS los campos de las 9 columnas):
```ts
export class ExportarComprobantesResponseDto {
  @ApiProperty({ type: () => [ComprobanteListItemDto] }) items!: ComprobanteListItemDto[];
}
```
NO se crea un DTO de fila nuevo. El `toComprobanteListItem` (`:107`) se reusa tal cual para mapear cada
`ComprobanteListRow`.

## 5. Backend — error de dominio (cap)

`comprobante-errors.ts`. Nuevo error que espeja `RangoExcedeLimiteError` del Libro Diario
(`libro-diario-errors.ts:50`, code `LIBRO_DIARIO_RANGO_EXCEDIDO`, extiende `InvalidStateError` → 422):
```ts
export class ComprobanteExportRangoExcedidoError extends InvalidStateError {
  constructor(cantidad: number, limite: number) {
    super(
      'COMPROBANTE_EXPORT_RANGO_EXCEDIDO',
      `El export contiene ${cantidad} comprobantes, que supera el límite de ${limite}. Acotá los filtros.`,
      { cantidad, limite },
    );
  }
}
```
Code estable `COMPROBANTE_EXPORT_RANGO_EXCEDIDO` (formato `{MODULO}_{SUBDOMINIO}_{CONDICION}`, §6.3).
`InvalidStateError` ya está importado en `comprobante-errors.ts:18`.

## 6. Backend — service

`comprobantes.service.ts`. El service hoy NO inyecta `ConfigService` (verificado: constructor `:120`
no lo tiene). Hay que **inyectarlo** (igual que `LibroDiarioService:43`) y leer el cap en el
constructor. Patrón espejado de `LibroDiarioService`:

```ts
export const COMPROBANTES_EXPORT_MAX_ENV = 'COMPROBANTES_EXPORT_MAX';
export const COMPROBANTES_EXPORT_MAX_DEFAULT = 1_000;

// en el constructor:
this.exportMax = this.config.get<number>(COMPROBANTES_EXPORT_MAX_ENV, COMPROBANTES_EXPORT_MAX_DEFAULT);

async exportar(
  tenantId: string,
  query: ExportarComprobantesQueryDto,
): Promise<ExportarComprobantesResponseDto> {
  const filtros: ListarFiltros = {
    ...(query.periodoFiscalId ? { periodoFiscalId: query.periodoFiscalId } : {}),
    ...(query.tipo ? { tipo: query.tipo } : {}),
    ...(query.estado ? { estado: query.estado } : {}),
    ...(query.fechaDesde ? { fechaDesde: FechaContable.fromIso(query.fechaDesde).toDbDate() } : {}),
    ...(query.fechaHasta ? { fechaHasta: FechaContable.fromIso(query.fechaHasta).toDbDate() } : {}),
    ...(query.q ? { q: query.q } : {}),
    incluirAnulados: query.incluirAnulados ?? false,
  };

  const cantidad = await this.repo.contarParaExport(tenantId, filtros);
  if (cantidad > this.exportMax) {
    throw new ComprobanteExportRangoExcedidoError(cantidad, this.exportMax);
  }

  const rows = await this.repo.listarParaExport(tenantId, filtros);
  return { items: rows.map(toComprobanteListItem) };
}
```

El armado de `filtros` reproduce el de `listar` (`:171-184`). El `count` previo replica el patrón del
Libro Diario (`libro-diario.service.ts:136-139`): comparación `> cap` (NO `>=`), error de dominio.

## 7. Backend — controller

`comprobantes.controller.ts`. Nuevo endpoint (declarar ANTES de `@Get(':id')`):
```ts
@Get('export')
@RequirePermissions('contabilidad.asientos.read')
@ApiOperation({ summary: 'Exportar el listado de comprobantes (todo el rango filtrado, sin paginar) ...' })
@ApiOkResponse({ type: ExportarComprobantesResponseDto })
exportar(@Req() req: AuthenticatedRequest, @Query() query: ExportarComprobantesQueryDto) {
  return this.service.exportar(resolveTenantId(req), query);
}
```
El controller ya tiene los guards de clase (`AuthGuard('jwt')`, `ModuleEnabledGuard`,
`PermissionsGuard`) y `@RequireModule('contabilidad')` (`:61-62`) — el export los hereda. Mismo
`resolveTenantId(req)` que el resto.

## 8. contract-drift

El nuevo `ExportarComprobantesQueryDto` + `ExportarComprobantesResponseDto` + el endpoint con
`@ApiOkResponse` cambian el contrato OpenAPI. Obligatorio (CLAUDE.md §10.10):
1. `cd backend && pnpm run openapi:dump` → actualiza `backend/openapi.json`.
2. `cd frontend && pnpm run gen:api-types` → actualiza `frontend/src/types/api.generated.ts`.
3. Commitear ambos. El job CI `contract-drift` rompe el build si están desincronizados.
4. En `frontend/src/types/api.ts` agregar los alias (estilo existente):
   `export type ExportarComprobantesResponse = Schemas['ExportarComprobantesResponseDto'];` y los params
   del export (puede reusarse `ListarComprobantesParams` sin `page`/`limit`, o un tipo dedicado).

## 9. Frontend — fetch on-demand (diferencia con Fase A/B)

Fase A/B exportaban sobre `data` ya en cache (los informes no paginan). El listado de comprobantes SÍ
pagina: el cache (`['comprobantes','list',params]`, `use-comprobantes.ts:11`) solo tiene la página
visible. Por eso el export **FETCHEA on-demand** en el click, NO consume el cache.

### 9.1 api/export-comprobantes.ts (NEW)

```ts
import { api } from '@/lib/api';
import type { ExportarComprobantesResponse } from '@/types/api';

export interface ExportarComprobantesParams {
  tipo?: string; estado?: string; periodoFiscalId?: string; q?: string; incluirAnulados?: boolean;
}

export async function exportComprobantes(
  params: ExportarComprobantesParams = {},
): Promise<ExportarComprobantesResponse> {
  const res = await api.get<ExportarComprobantesResponse>('/api/comprobantes/export', { params });
  return res.data;
}
```
Toda request vía `@/lib/api` (frontend §8 / Anti-F-03). El tipo exacto de params se alinea con el del
listado menos page/limit.

> Decisión: fetch directo en el handler del botón (con `useState` para `generando`), NO un
> `useQuery`/`useMutation`. El export es un side-effect one-shot (fetch → blob → descarga), no server
> state cacheable. Espeja el patrón de `BotonExportarLibroDiario` (que también hace todo en el handler),
> con la única diferencia de que acá el fetch ocurre dentro del handler en vez de leer `data`. Excepción
> documentada a "componentes importan solo del hook" (§8): el botón de export consume `api/` porque NO
> hay server state que cachear — el resultado se descarga, no se renderiza.

### 9.2 lib/exportar-comprobantes.ts (NEW, función pura)

```ts
import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { armarCabeceraFiscal, formatearFechaCelda } from '@/lib/export-excel';
import type { Celda } from '@/lib/export-excel';
import type { ComprobanteListItem } from '@/types/api';

const SEP = ' / ';

export function mapearComprobantesAFilas(
  items: ComprobanteListItem[],
  perfil: EmpresaPerfil,
): Celda[][] {
  const filas: Celda[][] = [];
  filas.push(...armarCabeceraFiscal(perfil));               // cabecera fiscal (tolera null)
  filas.push([
    { type: 'texto', value: 'Fecha' },
    { type: 'texto', value: 'Número' },
    { type: 'texto', value: 'Tipo' },
    { type: 'texto', value: 'Documento respaldo' },
    { type: 'texto', value: 'Nro. Ref.' },
    { type: 'texto', value: 'Contacto' },
    { type: 'texto', value: 'Glosa' },
    { type: 'texto', value: 'Estado' },
    { type: 'texto', value: 'Total BOB' },
  ]);
  for (const c of items) {
    filas.push([
      { type: 'texto', value: formatearFechaCelda(c.fechaContable) },         // §4.6
      { type: 'texto', value: c.numero ?? '' },                                // BORRADOR → vacío
      { type: 'texto', value: c.tipo },
      { type: 'texto', value: c.documentosRespaldo.map((d) => d.tipoNombre).join(SEP) },
      { type: 'texto', value: c.documentosRespaldo.map((d) => d.numero).join(SEP) },
      { type: 'texto', value: c.contactos.map((co) => co.nombre).join(SEP) },
      { type: 'texto', value: c.glosa },
      { type: 'texto', value: c.anulado ? 'Anulado' : c.estado },             // §4.7
      { type: 'numero', value: c.totalDebitoBob },                            // §4.5
    ]);
  }
  return filas;
}
```
Columnas (anchos) para `construirHoja` — definir un `COLUMNS_COMPROBANTES: ColumnaHoja[]` de 9 entradas
(p.ej. Fecha 14, Número 16, Tipo 12, Documento 18, Nro. Ref. 14, Contacto 28, Glosa 40, Estado 14,
Total 16) y pasarlo a `construirHoja(filas, COLUMNS_COMPROBANTES)`.

### 9.3 components/boton-exportar-comprobantes.tsx (NEW)

Espeja `BotonExportarLibroDiario` pero fetchea en el handler:
```ts
interface Props {
  filtros: ExportarComprobantesParams;      // filtros activos de la URL
  perfil: EmpresaPerfil | null | undefined;
  rango: string;                            // p.ej. periodo o "todos" para el nombre de archivo
}
// handler:
//   setGenerando(true)
//   try { const { items } = await exportComprobantes(filtros);
//         const filas = mapearComprobantesAFilas(items, perfil ?? {todos null});
//         const blob = await construirHoja(filas, COLUMNS_COMPROBANTES);
//         descargarBlob(blob, generarNombreArchivo('comprobantes', rango)); }
//   finally { setGenerando(false) }
```
`PermissionButton permission={PERMISSIONS.contabilidad.asientos.read}`, `disabled={generando}`, texto
`{generando ? 'Generando…' : 'Exportar a Excel'}`. Manejo de error del fetch: `try/catch` con
`toast.error` (mutación-like, Anti-F-13 permite toast en handler de acción del usuario).

### 9.4 comprobantes-page.tsx (MODIFIED)

Montar el botón en el header (`:66`, al lado de "Nuevo comprobante", dentro del mismo flex), consumir
`useEmpresa()`, y pasarle los filtros activos (los que ya arma `params` en `:36-44`, sin page/limit).
`rango` para el nombre de archivo: usar el `periodoFiscalId` si está, o `'todos'`.

## 10. Decisiones residuales para el apply

- **Desempate del orden**: `numero ASC NULLS LAST` justificado porque el correlativo dentro de una
  misma fecha refleja el orden de contabilización (ascendente = cronológico); los borradores (sin
  número) son los "más nuevos" sin numerar → al final.
- **Concatenación `" / "`**: el Excel concatena TODOS los contactos/documentos (no usa "Varios" de la
  tabla). Decidido por el detalle de auditoría.
- **Nombre de archivo**: `generarNombreArchivo('comprobantes', rango)` → `comprobantes-<rango>.xlsx`.
  `rango` = periodoFiscalId activo o `'todos'`. (Decisión menor, el apply puede afinarla.)
- **`fechaDesde`/`fechaHasta` en el DTO pero no en la UI**: el DTO los acepta (paridad con el listado),
  la UI no los emite. No bloquea nada.

## 11. Testing (TDD, honeycomb §7)

- **Adapter (integration, Postgres real, al lado del adapter)**: orden ASC con NULLS LAST; sin paginar
  (trae todo); Anti-31 (dos tenants, aislamiento); incluirAnulados true/false; filtros tipo/estado/
  periodo/q; `contarParaExport` cuenta lo mismo que el WHERE.
- **Service (unit, mock del port)**: cap excedido (caso +) → `ComprobanteExportRangoExcedidoError`;
  cap no excedido (caso −) → devuelve items; filtros pasados correctamente al port; count previo
  invocado antes de listar.
- **Controller/e2e (si aplica)**: 403 sin permiso; 200 con permiso; cap → 422 con code estable mapeado
  por `GlobalExceptionFilter`.
- **Frontend (Vitest, describe/it español)**: `mapearComprobantesAFilas` — 9 columnas en orden; arrays
  0/1/2 (concatenación con " / "); borrador `numero=null` → vacío; anulado → "Anulado"; cabecera fiscal
  completa y con nulls; monto §4.5 (celda numero, no recalculo); fecha §4.6 (sin corrimiento UTC).
  Botón — gating (sin permiso → deshabilitado + tooltip, envolver en `TooltipProvider`); estado
  "Generando…".
