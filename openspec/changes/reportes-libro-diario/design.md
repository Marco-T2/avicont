# Design: Reporte Libro Diario (MVP módulo `reportes`)

## Technical Approach

Módulo backend nuevo `backend/src/reportes/` (hexagonal estricto, §3.2) que estrena
el sub-recurso "libros". El servicio depende de DOS puertos cross-module definidos
EN `reportes/ports/` (decisión cerrada #6): `ComprobantesReaderPort` (lee asientos
contabilizados/bloqueados + líneas + cuenta, adapter Prisma propio) y reusa el
`PeriodosReaderPort` ya existente (`PeriodosReaderModule` leaf) para resolver
`periodoFiscalId → rango de fechas`. El servicio mapea filas Prisma → DTO anidado
con montos `string` (§4.5) y fechas `"YYYY-MM-DD"` (§4.6). Frontend: feature nueva
`frontend/src/features/libro-diario/` siguiendo el patrón de `comprobantes`.

## Architecture Decisions

### Decisión 1: El `ComprobantesReaderPort` devuelve filas Prisma crudas (no entidad de dominio)

**Choice**: el port devuelve `ComprobanteLibroDiarioRow[]` = tipo derivado de Prisma
(`Comprobante & { lineas: (LineaComprobante & { cuenta: Pick<Cuenta,...> })[] }`).
El service mapea al DTO en el boundary.
**Alternatives**: crear entidades de dominio puras `AsientoLibroDiario`/`LineaLibroDiario`.
**Rationale**: el Libro Diario NO tiene invariantes de dominio que enforcar (es un
listado fiel de lo guardado, no calcula saldos). Crear entidades sería ceremonia sin
comportamiento. Coincide con la divergencia §5 YA aceptada del proyecto (PR D #38:
comprobantes/docs-fisicos devuelven rows Prisma y el service mapea en el boundary).
El port igual es la frontera: define el TIPO que expone, no Prisma libre.

### Decisión 2: Query Prisma `findMany` con include anidado (NO `$queryRaw`)

**Choice**: `prisma.comprobante.findMany({ where, include: { lineas: { include: { cuenta }, orderBy: { orden } } }, orderBy: [{fechaContable},{numero},{createdAt}] })`.
**Alternatives**: `$queryRaw` con JOIN manual.
**Rationale**: volumen PyME (tope ~5.000 asientos) no justifica SQL crudo; `findMany`
tipado evita el riesgo de `$queryRaw` sin `organization_id` (riesgo #1 del proposal,
§4.2). El filtro `organizationId` va en el `where` del adapter — defense in depth, no
en el controller. Orden cronológico estable: `fechaContable ASC, numero ASC NULLS LAST,
createdAt ASC` (el libro lista de más antiguo a más nuevo; sin BORRADOR no hay NULLs,
pero el NULLS LAST es defensivo).

### Decisión 3: Filtro de estado y anulados FIJO en el adapter

**Choice**: `where.estado = { in: [CONTABILIZADO, BLOQUEADO] }` SIEMPRE; `incluirAnulados`
controla solo `anulado` (default `{ anulado: false }`). BORRADOR nunca es parametrizable.
**Rationale**: invariante de negocio (el libro legal solo contiene asientos firmes).
Hardcodear el `in` cierra el riesgo "incluir BORRADOR por error" con un test negativo.

### Decisión 4: Resolución período → rango vía `PeriodosReaderPort`

**Choice**: si llega `periodoFiscalId`, el service lo resuelve a `(fechaDesde, fechaHasta)`
leyendo el período. El `PeriodosReaderPort` actual expone `obtenerPorFecha`/`obtenerReaperturaActiva`
— NO un `obtenerPorId` con year/month. **Se amplía el port** con
`obtenerRangoFechas(tenantId, periodoId): Promise<{ desde: Date; hasta: Date } | null>`
(deriva `[year-month-01, fin de mes]`). periodos-fiscales es dueño del dominio (§3.7),
así que ese método lo define y lo implementa él.
**Alternatives**: que reportes lea `PeriodoFiscal` por su cuenta → violaría §3.3 (import
directo cross-module) y §3.7 (dueño expone su superficie).
**FLAG**: ampliar `PeriodosReaderPort` toca un módulo ajeno. No es bloqueante (es additivo
y respeta §3.7), pero queda anotado para verify.

### Decisión 5: Tope defensivo por `count` previo (no `take`)

**Choice**: el service hace `contarAsientos(filtros)` (un `count`) ANTES del `findMany`;
si `> LIBRO_DIARIO_MAX_ASIENTOS` (5.000) lanza `ReportesError` (`REPORTES_LIBRO_DIARIO_RANGO_EXCEDE_LIMITE`).
**Alternatives**: `take: 5001` y detectar overflow.
**Rationale**: un libro truncado silenciosamente es PEOR que un error (un contador no
puede saber que faltan asientos). El error pide al usuario acotar el rango. El `count`
extra es barato con el índice `[org, fechaContable]` existente.

### Decisión 6: Validación — forma en DTO, regla de negocio en service como DomainError

**Choice**: class-validator en el DTO valida FORMA (uuid, `^\d{4}-\d{2}-\d{2}$`, boolean).
La regla "uno de período O rango es requerido" y "fechaDesde ≤ fechaHasta" se valida en
el SERVICE y lanza `ReportesError` (no `BadRequestException`). Errores nuevos vía
`DomainError` (§6.2 / regla de oro §10.10): `REPORTES_LIBRO_DIARIO_FILTRO_REQUERIDO`,
`REPORTES_LIBRO_DIARIO_RANGO_INVALIDO`, `REPORTES_LIBRO_DIARIO_RANGO_EXCEDE_LIMITE`,
`REPORTES_PERIODO_NO_ENCONTRADO`.
**Rationale**: §10.10 — forma en DTO, negocio en service. El `GlobalExceptionFilter` ya
mapea `DomainError` al formato `{ error: { code, message, ... } }`.

## Data Flow

    HTTP GET /api/libros/diario?periodoFiscalId|fechaDesde+fechaHasta&incluirAnulados
        │  AuthGuard + ModuleEnabledGuard('contabilidad') + PermissionsGuard
        │  @RequirePermissions('contabilidad.libro-diario.read')
        ▼
    LibroDiarioController ── resolveTenantId(req) (JWT.activeTenantId / X-Tenant-ID)
        ▼
    LibroDiarioService
        ├─ valida filtro (DomainError si falla)
        ├─ si periodoFiscalId → PeriodosReaderPort.obtenerRangoFechas() → {desde,hasta}
        ├─ ComprobantesReaderPort.contarAsientos(org, filtros)  → tope 5.000
        ├─ ComprobantesReaderPort.obtenerAsientosParaLibroDiario(org, filtros)
        └─ mapea rows Prisma → LibroDiarioResponseDto (Decimal→string, fecha→YYYY-MM-DD)
        ▼
    { rango, asientos:[{...,lineas:[...]}], totalDebeBob, totalHaberBob }

## File Changes

### Backend (`backend/src/reportes/`)

| File | Action | Description |
|------|--------|-------------|
| `domain/libro-diario-errors.ts` | Create | `ReportesError extends DomainError` + subtipos (FILTRO_REQUERIDO, RANGO_INVALIDO, RANGO_EXCEDE_LIMITE, PERIODO_NO_ENCONTRADO) |
| `ports/comprobantes-reader.port.ts` | Create | `ComprobantesReaderPort` abstract + Symbol + tipos `LibroDiarioFiltros`, `ComprobanteLibroDiarioRow` |
| `adapters/prisma-comprobantes-reader.adapter.ts` | Create | impl Prisma; `findMany` include anidado + `count`; filtro `organizationId` + estado IN + anulado |
| `adapters/prisma-comprobantes-reader.adapter.integration.spec.ts` | Create | integración vs Postgres real, 2 tenants |
| `dto/libro-diario-query.dto.ts` | Create | class-validator: `periodoFiscalId?`, `fechaDesde?`, `fechaHasta?` (regex ISO), `incluirAnulados?` (Transform→bool) |
| `dto/libro-diario-response.dto.ts` | Create | DTO anidado + función `toLibroDiarioResponse(rows, rango)` |
| `dto/libro-diario-response.dto.spec.ts` | Create | unit del mapper (Decimal→string, fecha, anidado) |
| `libro-diario.service.ts` | Create | orquesta validación + ports + mapeo + total |
| `libro-diario.service.spec.ts` | Create | unit con mocks de los ports (no Prisma) |
| `reportes.controller.ts` | Create | `@Controller('libros')`, `GET diario`, guards + RequirePermissions |
| `reportes.module.ts` | Create | DI: bindea `ComprobantesReaderPort`→adapter; importa `PeriodosReaderModule`, `RbacModule` |
| `backend/src/app.module.ts` | Modify | registrar `ReportesModule` |
| `backend/src/periodos-fiscales/ports/periodos-reader.port.ts` | Modify | + `obtenerRangoFechas()` |
| `backend/src/periodos-fiscales/adapters/prisma-periodos-reader.adapter.ts` | Modify | impl de `obtenerRangoFechas()` |
| `backend/test/libro-diario.e2e-spec.ts` | Create | e2e: RBAC, filtros, 2 tenants, sin BORRADOR |

### Frontend (`frontend/src/features/libro-diario/`)

| File | Action | Description |
|------|--------|-------------|
| `api/get-libro-diario.ts` | Create | `api.get('/api/libros/diario', { params })` |
| `hooks/use-libro-diario.ts` | Create | `useQuery(['libro-diario', params])`, `keepPreviousData`, `enabled` cuando hay filtro válido |
| `schemas/libro-diario-filtro-schema.ts` | Create | zod: refine "período O rango", fechaDesde ≤ fechaHasta, mensajes ES |
| `components/libro-diario-filtros.tsx` | Create | RHF + zodResolver; período select o rango fechas + toggle anulados |
| `components/libro-diario-tabla.tsx` | Create | tabla agrupada por asiento, total al pie; loading/empty/error inline (Anti-F-13) |
| `pages/libro-diario-page.tsx` | Create | contenedor: orquesta hook + filtros + tabla |
| `types.ts` | Create | tipos locales del DTO de respuesta |
| `frontend/src/types/api.ts` | Modify | `LibroDiarioParams`, `LibroDiarioResponse` |
| `frontend/src/routes/router.tsx` | Modify | ruta `/libros/diario` → `LibroDiarioPage` |
| `frontend/src/components/shells/dashboard-shell.tsx` (nav) | Modify | item de menú "Libro Diario" |

## Interfaces / Contracts

```typescript
// reportes/ports/comprobantes-reader.port.ts
export const COMPROBANTES_READER_PORT = Symbol('COMPROBANTES_READER_PORT');

export interface LibroDiarioFiltros {
  fechaDesde: Date;        // resuelto: rango directo o derivado del período
  fechaHasta: Date;
  incluirAnulados: boolean;
}

// Filas Prisma crudas (decisión 1). El service mapea en el boundary.
export type ComprobanteLibroDiarioRow = Comprobante & {
  lineas: (Pick<LineaComprobante, 'orden' | 'debitoBob' | 'creditoBob' | 'glosaLinea'> & {
    cuenta: Pick<Cuenta, 'codigoInterno' | 'nombre'>;
  })[];
};

export abstract class ComprobantesReaderPort {
  /** Cuenta asientos CONTABILIZADO/BLOQUEADO del rango (para el tope defensivo). */
  abstract contarAsientos(tenantId: string, filtros: LibroDiarioFiltros): Promise<number>;

  /**
   * Asientos CONTABILIZADO/BLOQUEADO del rango con líneas (orden ASC) y cuenta.
   * Ordenados fechaContable ASC, numero ASC NULLS LAST, createdAt ASC.
   * Filtra organizationId (§4.2). BORRADOR nunca incluido.
   */
  abstract obtenerAsientosParaLibroDiario(
    tenantId: string,
    filtros: LibroDiarioFiltros,
  ): Promise<ComprobanteLibroDiarioRow[]>;
}

// periodos-fiscales/ports/periodos-reader.port.ts  (additivo §3.7)
abstract obtenerRangoFechas(
  tenantId: string,
  periodoId: string,
): Promise<{ desde: Date; hasta: Date } | null>;
```

DTO de respuesta (montos `string`, fechas `YYYY-MM-DD`):

```typescript
interface LibroDiarioResponseDto {
  rango: { fechaDesde: string; fechaHasta: string };
  asientos: Array<{
    id: string; fechaContable: string; numero: string | null;
    tipo: TipoComprobante; estado: EstadoComprobante; glosa: string; anulado: boolean;
    lineas: Array<{ codigoCuenta: string; nombreCuenta: string;
                    glosa: string | null; debeBob: string; haberBob: string }>;
  }>;
  totalDebeBob: string;   // suma debitoBob de todas las líneas
  totalHaberBob: string;  // suma creditoBob — debe igualar totalDebeBob (partida doble §4.1)
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (service) | mapeo rows→DTO; total debe=haber; orden; validación filtro (DomainError); tope 5.000 | mocks de `ComprobantesReaderPort` + `PeriodosReaderPort`; NUNCA mock Prisma (§7.8) |
| Unit (mapper DTO) | Decimal→string `.toFixed(2)`; fecha `@db.Date`→`YYYY-MM-DD`; anidado líneas | función pura, sin NestJS |
| Integration (adapter) | filtro `organizationId` aísla 2 tenants; estado IN excluye BORRADOR; anulados toggle; orden cronológico | Postgres real (Testcontainers/DB real, §7.2), seed 2 tenants, TX por test |
| Integration (periodos adapter) | `obtenerRangoFechas` deriva fin de mes correcto; null si no existe | Postgres real |
| E2E | 401 sin token; 403 sin `contabilidad.libro-diario.read`; filtros período/rango; 2 tenants sin fuga; BORRADOR ausente; total debe=haber | Supertest + AppModule, `--runInBand --forceExit` |
| Frontend (vitest) | schema zod (período O rango, fechaDesde≤fechaHasta); tabla agrupa por asiento + total pie; estados loading/empty/error | Testing Library; lib/schema puro sin render |

Cobertura objetivo: ≥95% en dominio del módulo (§7.5). Invariante crítico con test + y − :
multi-tenant (2 tenants) y exclusión de BORRADOR.

## Migration / Rollout

No migration required. Solo lectura sobre datos existentes (`Comprobante`,
`LineaComprobante`, `Cuenta`). Permiso `contabilidad.libro-diario.read` ya en catálogo.
Rollback = revertir el PR (squash): quitar `ReportesModule` de `app.module.ts` y la ruta
frontend. El cambio additivo a `PeriodosReaderPort` queda inerte si reportes desaparece.

## Open Questions

- [ ] Frontend gating granular: hoy `use-permissions.ts` solo chequea SystemRole, NO hay
      `GET /me/permissions`. El item de nav del Libro Diario se mostraría a todos los
      miembros del módulo `contabilidad` y el backend rechaza con 403 si falta el permiso
      (defense in depth OK). ¿Aceptable para el MVP o se incluye gating fino? (GAP ya
      anotado en MEMORY.) — RECOMENDACIÓN: aceptar para MVP, el backend es la autoridad.
- [ ] `obtenerRangoFechas` amplía `PeriodosReaderPort` (módulo ajeno). Confirmar que es
      aceptable vs. que reportes defina su PROPIO `PeriodosReaderPort` de lectura (más
      consistente con decisión #6 de comprobantes, pero duplica superficie).
