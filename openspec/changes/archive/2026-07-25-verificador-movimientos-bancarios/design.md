# Design: Verificador de movimientos bancarios (mayor unificado)

## Technical Approach

Todo vive en `conciliacion-bancaria/` (hexagonal existente). El `GET /` entra al
controller ya montado; el listado y sus agregados son **métodos nuevos en
`MovimientoBancarioRepositoryPort`** (port propio); el estado se deriva por
página reusando `listarPorMovimientos` + `listarPorAnclas` + `verificarAnclas`
— **cero métodos nuevos en `LineasCuentaReaderPort`**, cero imports nuevos hacia
`comprobantes/` (`conciliacion.service.ts` ya importa el port; el arch-spec
sigue verde: solo prohíbe `$executeRaw` y escrituras).

## Architecture Decisions

| # | Decisión | Alternativa rechazada | Razón |
|---|----------|----------------------|-------|
| D1 | Listado con **query builder** de Prisma, no raw. **Verificado contra el client 6.19.3 generado**: `hora?: SortOrderInput \| SortOrder` existe; `ordenFisico Int?` lo generará igual. | `$queryRaw` para el `NULLS LAST` | Prisma lo expresa nativo; filtro de tenant estáticamente visible; menos superficie raw |
| D2 | Saldos vigentes con `$queryRaw` + `DISTINCT ON` — **primer raw del módulo** (verificado: hoy cero). Precedente: `reportes/prisma-eeff-saldos-reader.adapter.ts`. | Query por cuenta (N+1) | Una pasada; `DISTINCT ON` no existe en el builder |
| D3 | **Inversión correcta del orden**: el "último" movimiento se elige con `fecha DESC, hora DESC NULLS FIRST, "ordenFisico" DESC NULLS FIRST, id DESC`. **Corrige la exploración** (decía `NULLS LAST`): la inversión de `ASC NULLS LAST` es `DESC NULLS FIRST` — debe elegir la misma fila que cierra el listado de presentación | Copiar el sketch de la exploración | Con `NULLS LAST` una fila sin hora jamás sería "la última" aunque el listado la muestre última |
| D4 | Glosa: normalizar el término con `normalizarDescripcion(q)` y `contains` a secas (sin `mode: 'insensitive'`) | `ILIKE` sobre texto crudo | Ambos lados quedan uppercase/sin diacríticos por la misma función — matchea "depósito" contra "DEPOSITO" gratis |
| D5 | Auditoría de vínculos **solo cuando hay filtro `estado`** en el request | Siempre | Sin filtro nada se esconde (principio "apoyo, no limitante"); default queda en 5 queries |
| D6 | Backend siempre devuelve la franja `saldos` (corte = `hasta`); el frontend decide cuándo mostrarla | Bifurcar contrato por modo | 1 query barata; contrato único |
| D7 | `saldo` vigente = el del último movimiento, **sin fallback** a filas anteriores con saldo; `null` honesto | Escanear hacia atrás | Misma familia que `SIN_VERIFICAR`: no inventar |
| D8 | Migración **escrita a mano** (aditiva pura) | `prisma migrate dev` ciego | §11.6: el drift regenerado mete `DROP` de triggers/índices raw (precedente BCP: `DROP TABLE comprobantes_audit`) |
| D9 | **Endurecer `no-escribe-comprobantes.arch.spec.ts`**: el chequeo de SQL crudo pasa de `$executeRaw` a `$executeRaw \|\| $queryRaw` contra `TABLAS_PROHIBIDAS` | Dejarlo como está | Hoy la línea 118 solo mira `$executeRaw`, así que un `SELECT` crudo contra `comprobantes`/`lineas_comprobante` pasaría invisible. Era inocuo mientras el módulo tenía CERO raw; **este change introduce el primero** y normaliza el patrón. El `$queryRaw` de D2 va contra `movimientos_bancarios`, así que el test sigue verde — es cerrar la puerta antes de que alguien la cruce |

## Data Flow (GET /api/movimientos-bancarios)

```
Controller (.read) → MovimientosBancariosService.listar
  ├─ [paralelo] listarCrossCuenta(filtros, skip/take)   ── página (≤200)
  │             contarCrossCuenta(filtros)              ── total
  │             totalesPorMoneda(filtros)               ── groupBy moneda+tipo
  │             saldosVigentes(corte=hasta)             ── $queryRaw DISTINCT ON
  ├─ matches.listarPorMovimientos(ids página)           ── 1 query
  ├─ lineasCuenta.listarPorAnclas(anclas matches)       ── 1 query ≤N   ┐ cross-módulo,
  ├─ verificarAnclas EN MEMORIA (aSnapshot/aLineaContableActual)        ┘ solo lectura
  └─ SI filtro estado: auditoría
       listarIdsConMatch(filtros SIN estado) → listarPorMovimientos (chunk 1000)
       → listarPorAnclas (chunk 200 anclas — el OR pega contra @@unique([comprobanteId, orden]))
       → rotos a franja SEPARADA (cap 100 + total)
```

Derivación por movimiento = misma regla de `aMovimientoView`: vínculo válido ⇒
`CONCILIADO`; roto o sin match ⇒ `IGNORADO` si columna lo dice, sino `PENDIENTE`.
Lectura **nunca** escribe `estado` (design conciliación §2.3).

## Captura de `ordenFisico` (importador)

En `extracto-importador.service.ts`: **mover `ordenarCronologico` arriba de
`ordenarCanonico`** (hoy línea 165 → antes de la 154) y reusar el MISMO array
para checksum y para un `Map` de identidad:

```ts
const cronologico = ordenarCronologico(parseado.movimientos);
const posCronologica = new Map<MovimientoParseado, number>();
cronologico?.forEach((mov, i) => posCronologica.set(mov, i));
// … canonico / asignarOrdinalDia intactos; identidad de objeto se preserva
// (verificado: asignarOrdinalDia envuelve la MISMA referencia en { movimiento, ordinalDia })
construirMovimientoCreateData(item, …, posCronologica.get(item.movimiento) ?? null)
```

`calcularHashDedup` **no se toca** (firma y entrada idénticas ⇒ hashes
idénticos, cero re-duplicación). `MovimientoBancarioCreateData` gana
`ordenFisico: number | null`; `crearMuchos` lo mapea. `NO_MONOTONA` ⇒ `null`.

## File Changes

| Archivo | Acción | Qué |
|---------|--------|-----|
| `prisma/schema.prisma` | Mod | `ordenFisico Int?` + `@@index([organizationId, fecha])` en `MovimientoBancario` |
| `prisma/migrations/<ts>_verificador_orden_fisico/` | New | A MANO: `ALTER TABLE … ADD COLUMN "ordenFisico" INTEGER;` + `CREATE INDEX "movimientos_bancarios_organizationId_fecha_idx" …` — cero `DROP` |
| `ports/movimiento-bancario.repository.port.ts` | Mod | +5 métodos (abajo) + `ordenFisico` en CreateData |
| `adapters/prisma-movimiento-bancario.repository.ts` | Mod | Implementación (incl. el `$queryRaw` con `Prisma.sql`) |
| `extracto-importador.service.ts` | Mod | Captura `ordenFisico` |
| `adapters/prisma-movimiento-bancario.repository.ts` → `listarPorCuentaBancariaEnRango` | Mod | **D10**: el workspace adopta el mismo orden de presentación (hoy `[{fecha},{ordinalDia},{id}]`, y `ordinalDia` vale 0 casi siempre ⇒ desempate real = UUID). Actualizar su JSDoc en el port y los tests de orden del workspace |
| `movimientos-bancarios.service.ts` | Mod | `listar()` — orquesta, deriva, audita |
| `movimientos-bancarios.controller.ts` | Mod | `@Get()` con `contabilidad.conciliacion.read` |
| `dto/listar-movimientos-bancarios.dto.ts` | New | Query + response DTOs |
| `frontend/src/features/verificador-bancario/` | New | `api/ hooks/ components/ pages/` (molde conciliación) |
| `frontend/src/components/nav-items.ts` | Mod | Ítem "Movimientos bancarios" en Contabilidad, `conciliacion.read` + `pack` (molde línea 189) |
| `no-escribe-comprobantes.arch.spec.ts` | Mod | D9: el chequeo de SQL crudo cubre también `$queryRaw` |

## Interfaces / Contracts

```ts
// port — filtros ya normalizados por el service (glosa pasa por normalizarDescripcion)
export interface FiltrosListadoMovimientos {
  fechaDesde: Date; fechaHasta: Date;
  cuentaBancariaId?: string;
  estado?: EstadoMovimientoBancario;          // columna cacheada — documentado
  montoDesde?: Prisma.Decimal; montoHasta?: Prisma.Decimal;
  glosaNormalizada?: string;
}
abstract listarCrossCuenta(tenantId, filtros, pag: { skip: number; take: number }): Promise<MovimientoBancario[]>;
// orderBy: [{ fecha:'asc' }, { hora:{sort:'asc',nulls:'last'} }, { ordenFisico:{sort:'asc',nulls:'last'} }, { id:'asc' }]
abstract contarCrossCuenta(tenantId, filtros): Promise<number>;
abstract totalesPorMoneda(tenantId, filtros): Promise<{ moneda: Moneda; tipo: LadoBancario; total: Prisma.Decimal; cantidad: number }[]>;
abstract listarIdsConMatch(tenantId, filtros: Omit<FiltrosListadoMovimientos,'estado'>): Promise<{ id: string }[]>; // where match: { isNot: null }, select id
abstract saldosVigentes(tenantId, corte: Date): Promise<{ cuentaBancariaId: string; fecha: Date; saldo: Prisma.Decimal | null }[]>;
```

```sql
SELECT DISTINCT ON ("cuentaBancariaId") "cuentaBancariaId", fecha, saldo
FROM movimientos_bancarios
WHERE "organizationId" = ${tenantId} AND fecha <= ${corte}
ORDER BY "cuentaBancariaId", fecha DESC, hora DESC NULLS FIRST,
         "ordenFisico" DESC NULLS FIRST, id DESC
```

`Prisma.sql` con params bindeados; `numeric` vuelve como string ⇒ convertir a
`Decimal` en el boundary del adapter (precedente reportes).

Response (montos STRING §4.5, fechas `YYYY-MM-DD` §4.6, formato workspace):

```ts
{ desde, hasta, page, limit, total,
  movimientos: MovimientoConciliacionView & { cuentaBancariaId, ordenFisico: number|null }[],
  totales: { moneda; totalDebitos: string; totalCreditos: string; cantidad }[],
  saldos:  { cuentaBancariaId; alias; moneda; saldo: string|null; fechaUltimoMovimiento: string|null }[], // merge con CuentaBancariaRepositoryPort.listar — cuentas sin movimientos salen con null/null
  auditoriaVinculos: { aplicada: boolean; total: number;
    rotos: { movimientoBancarioId; cuentaBancariaId; fecha; monto; moneda; descripcion; motivo: MotivoVinculoRoto }[] } }
```

Query DTO: `desde!`/`hasta!` obligatorios (`YYYY-MM-DD`, molde workspace),
`page`/`limit` (default 50 / max 200, molde `ListarComprobantesQueryDto`),
montos como string `@Matches(/^\d+(\.\d{1,2})?$/)`.

## Frontend

Ruta `/movimientos-bancarios`. Hook `useMovimientosBancarios(filtros, page)`
(`useQuery`, key `['movimientos-bancarios','list',…]`). Saldo dual: con
`cuentaBancariaId` seleccionada la tabla muestra la columna `saldo` del banco;
en modo cross-cuenta esa columna se OCULTA (no prometer cronología intra-día
entre bancos) y se muestra la franja de saldos por cuenta con
`fechaUltimoMovimiento` y badge de desactualización cuando `< hasta`. Total
"suma de saldos" solo entre cuentas de la MISMA moneda; `null` excluye la cuenta
de la suma con indicador. Franja de auditoría con contador y link al workspace
de la cuenta. Badges reusados de `features/conciliacion`.

## Testing Strategy

| Capa | Qué | Dónde |
|------|-----|-------|
| Unit | Derivación de estado + auditoría + armado de response (ports mockeados); DTO validation; captura `ordenFisico` (Map de identidad, `null` en NO_MONOTONA) | `movimientos-bancarios.service.spec.ts`, `dto/*.spec.ts` |
| Integración (Postgres real, **obligatorio para el raw**) | `listarCrossCuenta` (orden con `hora`/`ordenFisico` null, determinismo offset — 2 páginas sin duplicar/perder fila), `contarCrossCuenta`, `totalesPorMoneda`, `listarIdsConMatch`, `saldosVigentes` (empates intra-día, `hora` null, `saldo` null ⇒ null, multi-tenant Anti-31) | `prisma-movimiento-bancario.repository.integration.spec.ts` |
| Integración importador | `ordenFisico` persistido con fixture DESC (fila física 0 ⇒ ordenFisico máximo), `null` en no-monótono, hashes SIN cambio contra fixtures existentes | `extracto-importador.service.integration.spec.ts` (extender) |
| E2E | `GET /` con filtros; asimetría `.read`/`.conciliar`; 404 sin pack; default sin filtro estado muestra todo; vínculo roto en franja | `test/conciliacion-verificador.e2e-spec.ts` |
| Arch | `no-escribe-comprobantes.arch.spec.ts`: sigue verde con el `$queryRaw` nuevo, **y se endurece** (D9) para cubrir `$queryRaw` contra las tablas prohibidas. Validar por MUTACIÓN: un `$queryRaw` de prueba contra `comprobantes` debe ponerlo rojo | `no-escribe-comprobantes.arch.spec.ts` |

## Migration / Rollout

Aditiva pura, a mano (D8). Aplicar con `migrate deploy`; si se regenera con
`migrate dev`, correr el protocolo §11.6 (`grep "^DROP"` contra la tabla de
objetos raw vivos). Rollback: `git revert` + `DROP INDEX` + `DROP COLUMN`.
Backfill: NO (el orden físico ya se descartó); orden degrada a `fecha, hora, id`.

## Open Questions

Ninguna bloqueante.
