# Proposal: Reporte Libro Diario (MVP del módulo `reportes`)

## Intent

El sistema registra comprobantes (asientos) pero NO ofrece ninguna vista de
libros contables. El **Libro Diario** es el reporte legal más simple: listado
CRONOLÓGICO de comprobantes CONTABILIZADOS/BLOQUEADOS en un rango, cada asiento
con cabecera (fecha, número, glosa) y sus líneas (cuenta, debe BOB, haber BOB).
NO calcula saldos — es un listado fiel de lo guardado. Por eso es el MVP: bajo
riesgo, verificable de inmediato, y **valida la arquitectura del módulo
`reportes/`** que luego soportará Mayor y EEFF.

## Scope

### In Scope
- Módulo backend nuevo `backend/src/reportes/` (hexagonal estricto).
- Endpoint `GET /api/libros/diario` (rango de fechas / período), protegido por
  `contabilidad.libro-diario.read`, multi-tenant.
- Port cross-module para leer comprobantes+líneas+cuentas (NO import directo).
- DTO de respuesta: asientos ordenados por `fechaContable` con sus líneas; montos como `string`.
- Frontend: feature nueva `frontend/src/features/libro-diario/` (filtro de
  fechas + tabla agrupada por asiento), patrón de `features/comprobantes`.

### Out of Scope
- Libro Mayor, Balance General, Estado de Resultados (changes 2-4 del fasing).
- Cálculo de saldos, subtotales acumulados o balance de comprobación.
- Migraciones de schema (todos los datos ya existen).
- Export PDF/Excel si se decide diferir (ver decisión abierta #4).

## Capabilities

### New Capabilities
- `libro-diario`: consulta del Libro Diario — listado cronológico de
  comprobantes contabilizados con sus líneas en BOB, filtrado por rango/período
  y tenant, con toggle de anulados.

### Modified Capabilities
- None.

## Approach

Módulo `reportes/` con sub-recurso "libros". El servicio depende de un
**`ComprobantesReaderPort`** (definido en `reportes/ports/`, implementado por un
adapter Prisma) que devuelve comprobantes CONTABILIZADOS/BLOQUEADOS con líneas y
datos de cuenta para un `(organizationId, rango)`. Toda query filtra
`organizationId` (§4.2). El servicio mapea a un DTO con montos `string` (§4.5) y
fechas calendario puro (§4.6). Decisiones abiertas (ver abajo) se cierran en design.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/reportes/**` | New | Módulo hexagonal: domain/ ports/ adapters/ dto/ service/ controller/ module |
| `backend/src/app.module.ts` | Modified | Registrar `ReportesModule` |
| `frontend/src/features/libro-diario/**` | New | api/ hooks/ pages/ components/ schemas |
| `frontend/` routing + nav | Modified | Ruta y entrada de menú al reporte |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Query/raw SQL sin `organizationId` (fuga cross-tenant) | High | Test con 2 tenants obligatorio; filtro en el port/adapter, no en el controller |
| Incluir BORRADOR por error | Med | Filtro fijo `estado IN (CONTABILIZADO, BLOQUEADO)`; test negativo |
| Montos serializados como `number` | Med | DTO `string`; lint de dinero; test de forma |
| Volumen alto degrada (rango anual grande) | Low | Índice `[org, fechaContable]` ya existe; ver decisión de paginación #2 |
| Import directo cross-module (viola §3.3) | Med | Port en `reportes/ports/`, adapter lo implementa; revisar en verify |

## Rollback Plan

Revertir el PR (squash). Módulo nuevo aislado: quitar `ReportesModule` del
`app.module.ts` y la ruta del frontend. Sin migraciones que deshacer, sin datos
afectados (solo lectura).

## Dependencies

- Datos existentes: `Comprobante`, `LineaComprobante`, `Cuenta` (sin migración).
- Permiso `contabilidad.libro-diario.read` ya en catálogo (`catalogo.ts:133-134`).
- Patrón frontend: `features/comprobantes` (TanStack Query + shadcn).

## Decisiones abiertas (a cerrar por Marco antes de specs)

> Cada una con recomendación + tradeoff. Ver resumen en el envelope.

1. **Endpoint y filtros** — `GET /api/libros/diario`. Reco: aceptar `periodoFiscalId`
   **O** `fechaDesde`+`fechaHasta` (uno requerido), `incluirAnulados` opcional
   (default false). Tradeoff: `periodoFiscalId` es el caso 90% (un mes); el rango
   da flexibilidad. Soportar ambos cuesta poco y reusa filtros existentes.
2. **Paginación** — Reco: SIN paginar en MVP (un mes PyME = decenas de asientos),
   con tope defensivo de seguridad (ej. 5.000) que devuelva error claro si se
   excede. Tradeoff: simplicidad y un PDF/tabla continuos vs. riesgo de payload
   grande en rangos anuales (que paginar romperia igual para un libro impreso).
3. **Agrupación/subtotales** — Reco: total del período al final (sum debe / sum
   haber, deben coincidir). Subtotales por día DIFERIDOS. Tradeoff: el subtotal
   diario es vista linda pero no exigido por el libro; suma trabajo en UI sin
   valor legal en el MVP.
4. **Export PDF/Excel** — Reco: DIFERIR a un change posterior; MVP entrega solo
   JSON + tabla UI. Tradeoff: el PDF es lo que el contador imprime, pero acoplar
   render de PDF al MVP infla riesgo y alcance; mejor validar el contrato primero.
5. **Forma del DTO** — Reco: `{ asientos: [{ fechaContable, numero, glosa,
   estado, anulado, lineas: [{ codigoCuenta, nombreCuenta, glosa, debeBob,
   haberBob }] }], totalDebeBob, totalHaberBob, rango }`; todos los montos
   `string`, fechas `"YYYY-MM-DD"`. Tradeoff: anidar líneas dentro del asiento
   (lo natural para el libro) vs. filas planas (mejor para export); el anidado
   gana porque la UI agrupa por asiento.
6. **Acceso a datos cross-module** — Reco: `reportes` define un
   `ComprobantesReaderPort` PROPIO (en `reportes/ports/`) con un método de
   consulta de lectura optimizado para reportes, implementado por un adapter
   Prisma del módulo `reportes`. Tradeoff: reusar el `ComprobanteRepositoryPort`
   de comprobantes acoplaría reportes a la superficie de escritura/dominio de
   otro módulo y violaría §3.7 (el dueño del dominio expone su superficie); un
   port propio de lectura mantiene la frontera limpia y la query afinada al reporte.

## Success Criteria

- [ ] `GET /api/libros/diario` devuelve asientos CONTABILIZADOS/BLOQUEADOS del
      rango/período, ordenados por `fechaContable`, con líneas y montos `string`.
- [ ] BORRADOR nunca aparece; anulados excluidos por default, visibles con toggle.
- [ ] Multi-tenant verificado con test de 2 tenants (sin fuga).
- [ ] `totalDebeBob === totalHaberBob` en la respuesta (partida doble del período).
- [ ] La UI muestra filtro de fechas/período y tabla agrupada por asiento.
- [ ] Cobertura ≥ 95% en lógica de dominio del módulo (§7.5); responsive + dark.
