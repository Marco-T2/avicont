# Proposal: Reporte Libro Mayor (backend) — segundo libro del módulo `reportes`

## Intent

El sistema ya entrega el **Libro Diario** (PR #61), que es un listado fiel y
cronológico de comprobantes — NO calcula nada. El **Libro Mayor** es el segundo
libro contable principal: la vista por CUENTA. Toma todos los movimientos de una
cuenta en un rango y los presenta con su **saldo inicial** (acarreo histórico),
sus débitos/créditos del período y un **saldo corriente acumulado** movimiento a
movimiento, con el signo determinado por la `naturaleza` de la cuenta. Es la
contrapartida del Diario (Diario = por fecha; Mayor = por cuenta) y la base sobre
la que después se arman el Balance de Comprobación y los Estados Financieros.

A diferencia del Diario, el Mayor introduce **lógica de cálculo nueva** en el
codebase (saldo inicial = suma histórica, saldo corriente acumulado, signo por
naturaleza DEUDORA/ACREEDORA). Por eso este change es **backend-first**:
estabilizar y verificar el contrato de API y la lógica de cálculo en TDD estricto
ANTES de construir la UI (que será un change posterior, el Mayor frontend).

## Scope

### In Scope
- Endpoint nuevo `GET /api/libros/mayor` en el módulo existente
  `backend/src/reportes/`, protegido por `contabilidad.libro-mayor.read`,
  multi-tenant estricto.
- `LibroMayorService` con la lógica de cálculo (saldo inicial histórico, saldo
  corriente acumulado, signo por naturaleza), dependiendo solo de ports.
- Port nuevo de lectura en `reportes/ports/` para el Mayor (movimientos de
  cuenta por rango + saldo histórico previo + lookup de cuentas), implementado
  por un adapter Prisma con **query JOIN** `lineas_comprobante` → `comprobantes`
  por `fechaContable` (decisión cerrada: sin migración).
- DTOs de query y respuesta (montos `string`, fechas `"YYYY-MM-DD"`).
- DomainErrors `REPORTES_LIBRO_MAYOR_*`.
- Bindings en `reportes.module.ts`. Tests unit + integración (2 tenants).

### Out of Scope
- **Frontend del Mayor** — feature `frontend/src/features/libro-mayor/`. Change
  posterior, una vez verificado el contrato de API.
- **Migración de schema** — se usa JOIN con los índices existentes; no se toca
  `schema.prisma`. Desnormalizar `fechaContable` en la línea (Opción C del
  explore) queda diferido; disparador para revisar: queries de Mayor >500ms
  medidas en prod.
- **Cuentas agrupadoras con subtotales** — MVP cubre solo cuentas
  `esDetalle=true`. Una cuenta agrupadora pasada como `cuentaId` retorna error de
  negocio; acumular hojas en agrupadores queda para después.
- **Export PDF/Excel**, balance de comprobación, materialización/cache de saldos,
  Estados Financieros.

## Capabilities

### New Capabilities
- `libro-mayor`: consulta del Libro Mayor — movimientos por cuenta en un rango,
  con saldo inicial (acarreo histórico), totales debe/haber del período, saldo
  corriente acumulado por movimiento y saldo final, con signo según la naturaleza
  de la cuenta; filtrado por tenant.

### Modified Capabilities
- None. (El módulo `reportes` ya existe; este change le agrega un endpoint sin
  alterar el contrato del Libro Diario.)

## Approach

El módulo `reportes/` ya existe (lo creó el Libro Diario). Este change agrega un
segundo sub-recurso "mayor" siguiendo el mismo patrón hexagonal:

- **Port de lectura propio** (`reportes/ports/libro-mayor-reader.port.ts`,
  abstract class + Symbol) que expone lo que el Mayor necesita: (a) los
  movimientos de líneas de una cuenta en un rango con datos del comprobante
  cabecera, (b) el saldo histórico previo a `fechaDesde`, (c) el catálogo de
  cuentas de detalle del tenant para el lookup. **No** se importa el repositorio
  de `comprobantes` (§3.3): reportes define su propia superficie de lectura.
- **Adapter Prisma** que implementa el port con query JOIN
  `lineas_comprobante lc JOIN comprobantes c ON lc.comprobanteId = c.id`,
  filtrando SIEMPRE `lc.organizationId = $tenant` (§4.2, defense in depth) y
  `c.estado IN ('CONTABILIZADO','BLOQUEADO')`, usando los índices existentes
  (`[organizationId, cuentaId]` en lc, `[organizationId, fechaContable]` en c).
- **Service**: resuelve el rango (período fiscal XOR fechas), valida que la
  cuenta sea de detalle, obtiene saldo inicial y movimientos vía port, y calcula
  en memoria (NO en DB) el saldo corriente acumulado y el saldo final, aplicando
  el signo según `naturaleza`. Devuelve DTO con montos `string`.
- **Controller**: agrega `obtenerLibroMayor()` al controller existente de
  reportes, con Guards + `@RequirePermissions('contabilidad.libro-mayor.read')`
  + Swagger; sin lógica.

### Cálculo del saldo (regla de dominio)

```
DEUDORA  (Activos, Egresos):       saldo += debeBob  − haberBob
ACREEDORA (Pasivos, Patrimonio, Ingresos): saldo += haberBob − debeBob
saldoInicial = Σ(movimientos con fechaContable < fechaDesde), misma fórmula por naturaleza
```

`esContraria` NO interviene en el Mayor (solo afecta al Balance General); el Mayor
usa `naturaleza` directamente. `TipoComprobante.APERTURA` no recibe trato especial:
su efecto ya está incluido en la suma histórica del saldo inicial.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/reportes/ports/libro-mayor-reader.port.ts` | New | Port de lectura del Mayor (movimientos + saldo previo + cuentas) |
| `backend/src/reportes/adapters/prisma-libro-mayor-reader.adapter.ts` | New | Adapter Prisma con JOIN, filtra `organizationId` |
| `backend/src/reportes/libro-mayor.service.ts` | New | Lógica de cálculo (saldo inicial, corriente, signo por naturaleza) |
| `backend/src/reportes/dto/libro-mayor-query.dto.ts` | New | Query params (cuentaId?, período XOR fechas, toggles) |
| `backend/src/reportes/dto/libro-mayor-response.dto.ts` | New | DTO de respuesta (montos `string`) |
| `backend/src/reportes/domain/libro-mayor-errors.ts` | New | DomainErrors `REPORTES_LIBRO_MAYOR_*` |
| `backend/src/reportes/*.controller.ts` | Modified | Agregar `obtenerLibroMayor()` (sin tocar el del Diario) |
| `backend/src/reportes/reportes.module.ts` | Modified | Bindings del port/adapter/service del Mayor |

## API Contract (resumen)

`GET /api/libros/mayor`

Query params:
- `cuentaId?: string` — UUID de cuenta de detalle. Si se omite: todas las cuentas con movimiento en el rango.
- `periodoFiscalId?: string` — **XOR** con `fechaDesde`+`fechaHasta`.
- `fechaDesde?: string`, `fechaHasta?: string` — `"YYYY-MM-DD"`, ambas juntas, XOR con `periodoFiscalId`.
- `incluirAnulados?: boolean` — default `false`.
- `soloConMovimiento?: boolean` — default `true` (si `false`, incluye cuentas con saldo inicial pero sin movimientos en el rango).

Respuesta `LibroMayorResponseDto` (montos `string`, fechas `"YYYY-MM-DD"`):

```
{
  rango: { fechaDesde, fechaHasta },
  cuentas: [
    {
      cuentaId, codigoInterno, nombreCuenta,
      naturaleza: "DEUDORA" | "ACREEDORA",
      saldoInicialBob,           // acarreo histórico < fechaDesde
      totalDebeBob,              // Σ debe del rango
      totalHaberBob,             // Σ haber del rango
      saldoFinalBob,             // saldoInicial ± movimientos
      movimientos: [
        {
          fechaContable, numeroComprobante, glosa, glosaLinea,
          debeBob, haberBob,
          saldoCorrienteBob,     // acumulado tras este movimiento
          anulado
        }
      ]
    }
  ],
  generadoEn                     // ISO timestamp
}
```

Movimientos ordenados por `fechaContable` ASC, desempate por `numero` ASC y luego
`orden` de línea, para que el saldo corriente sea determinístico.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| JOIN sin filtro `organizationId` en la línea → fuga cross-tenant (Anti-31, §4.2) | High | Filtrar `lc.organizationId` SIEMPRE en el adapter; test obligatorio con 2 tenants y datos en el mismo rango |
| Incluir BORRADOR en el saldo o en los movimientos | Med | Filtro fijo `estado IN (CONTABILIZADO, BLOQUEADO)` en saldo inicial Y movimientos; test negativo |
| Montos serializados como `number` (pierde precisión IEEE-754) | Med | DTO `string`; cálculo con `Money`/`Decimal`, nunca `number`; test de forma JSON |
| Saldo corriente o inicial calculado en DB en vez del service | Med | El adapter devuelve filas crudas; el service acumula en memoria con `Money`; test unitario del cálculo aislado del adapter |
| Signo invertido por naturaleza (DEUDORA vs ACREEDORA) | High | Tests del cálculo para ambas naturalezas con + y −; fórmula documentada en el spec |
| Cuenta agrupadora consultada como `cuentaId` | Med | Lookup valida `esDetalle=true`; error `REPORTES_LIBRO_MAYOR_CUENTA_NO_DETALLE` |
| Volumen alto degrada el JOIN (rango anual, todas las cuentas) | Low | Índices existentes cubren el JOIN; volumen PyME ~15k líneas; tope defensivo si aplica |

## Rollback Plan

Revertir el PR (squash). Cambios aislados: el endpoint del Mayor es aditivo y no
toca el contrato del Libro Diario. Quitar los bindings del Mayor de
`reportes.module.ts` y el método del controller. Sin migraciones que deshacer, sin
datos afectados (solo lectura).

## Dependencies

- Datos existentes: `Comprobante` (`fechaContable`, `estado`, `anulado`, `numero`,
  `glosa`), `LineaComprobante` (`organizationId`, `cuentaId`, `debitoBob`,
  `creditoBob`, `orden`), `Cuenta` (`naturaleza`, `esDetalle`). Sin migración.
- Permiso `contabilidad.libro-mayor.read` ya en el catálogo RBAC.
- Módulo `reportes/` ya existe (creado por el Libro Diario, PR #61); patrón a seguir.

## Decisiones cerradas (referencia — NO re-abrir)

Cerradas por Marco antes de esta propuesta (engram `sdd/reportes-libro-mayor/decisiones`):

1. **Alcance = backend-first** — solo `GET /api/libros/mayor` + tests TDD; frontend diferido a un change posterior.
2. **Schema = JOIN sin migración** (Opción A del explore) — sin tocar `schema.prisma`; desnormalizar `fechaContable` (Opción C) diferido.
3. **Saldo inicial = suma histórica** de líneas con `fechaContable < fechaDesde`, estado IN (CONTABILIZADO, BLOQUEADO), `anulado=false`. `APERTURA` sin trato especial.
4. **MVP solo cuentas de detalle** (`esDetalle=true`); agrupadora → error de negocio.
5. **Signo por `naturaleza`** (DEUDORA = débitos − créditos; ACREEDORA = créditos − débitos); `esContraria` no aplica al Mayor.
6. **Permiso** `contabilidad.libro-mayor.read` (ya en catálogo).

## Success Criteria

- [ ] `GET /api/libros/mayor` devuelve, por cuenta de detalle, `saldoInicialBob`,
      `totalDebeBob`, `totalHaberBob`, `saldoFinalBob` y `movimientos[]` con
      `saldoCorrienteBob` acumulado; montos `string`, fechas `"YYYY-MM-DD"`.
- [ ] El saldo inicial es la suma histórica de movimientos previos a `fechaDesde`
      (CONTABILIZADO/BLOQUEADO, no anulados), con signo por naturaleza.
- [ ] El saldo corriente es determinístico (orden fecha → número → orden de línea)
      y consistente: `saldoFinal = saldoInicial ± movimientos`.
- [ ] BORRADOR nunca aparece ni afecta saldos; anulados excluidos por default,
      incluibles con `incluirAnulados=true` (marcados).
- [ ] Cuenta agrupadora consultada → error `REPORTES_LIBRO_MAYOR_CUENTA_NO_DETALLE`.
- [ ] Multi-tenant verificado con test de 2 tenants en el mismo rango (sin fuga).
- [ ] Cobertura ≥ 95% en la lógica de dominio del Mayor (§7.5); cero migración.
