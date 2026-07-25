# Proposal: Verificador de movimientos bancarios (mayor unificado)

## Intent

El módulo de conciliación no tiene puerta de entrada: para ver un solo movimiento
hay que elegir una cuenta bancaria y un rango. El lunes, tras bajar los extractos
de los 7 bancos, no existe forma de mirar todo junto y detectar qué pagos y gastos
no están registrados en comprobantes.

**Principio rector (firmado)**: la herramienta es de **apoyo, no limitante**. El
estado de conciliación es una señal informativa, nunca una compuerta — mismo grano
que el checksum (informa, no rechaza) y las sugerencias (ranquean, no auto-matchean).

## Scope

### In Scope
- `GET /api/movimientos-bancarios` cross-cuenta, offset (default 50 / max 200),
  filtros: rango, cuenta, estado, monto, glosa (`ILIKE` sobre `descripcionNormalizada`).
- **Vista por defecto SIN filtro de estado**; el filtro es opt-in.
- Estado derivado por página: 3 queries acotadas + count. Auditoría de vínculos
  rotos en franja **aparte** de la paginación.
- Saldo dual: con una cuenta → `saldo` del banco; en cualquier otro modo → saldo
  vigente por cuenta a fecha de corte, **siempre con `fechaUltimoMovimiento`**.
- Totales **por moneda**, subtotales separados.
- Columna `ordenFisico Int?` derivada de `ordenarCronologico`.
- **El workspace adopta el mismo orden de presentación** (hoy su desempate
  intra-día es el UUID, porque `ordinalDia` no es una posición). Sumado al alcance
  tras el hallazgo en `sdd-spec`.
- Endurecer `no-escribe-comprobantes.arch.spec.ts` para cubrir `$queryRaw`.
- Frontend: feature nueva + nav item gateado.

### Out of Scope
- Conversión a BOB de movimientos bancarios (no existe `montoBob`).
- Índice GIN trigram para la glosa (disparador: ~100k movimientos o p95 > 300 ms).
- Backfill de `ordenFisico` — el orden físico ya se descartó; inventarlo violaría
  la regla de no fabricar datos.
- **Slice futuro**: evento de `comprobantes` al anular/editar que invalide matches
  y vuelva confiable la proyección `estado` (§3.7). Es la causa de fondo de la deriva.

## Capabilities

### New Capabilities
- `verificador-movimientos-bancarios`: listado cross-cuenta con estado derivado,
  saldos duales, totales por moneda y auditoría de vínculos.

### Modified Capabilities
- `conciliacion-bancaria`: la importación persiste `ordenFisico` (REQ-CB-21) y el
  workspace adopta el mismo orden de presentación (REQ-CB-22).

## Approach

Extiende `movimientos-bancarios.controller.ts` (ya tiene la cadena de guards y
`@RequirePack`). Reusa `listarPorMovimientos` + `listarPorAnclas` — **cero métodos
nuevos en `LineasCuentaReaderPort`**, no se toca `comprobantes/`. Una lectura nunca
escribe: no se auto-cura `estado`. Orden cerrado
`fecha, hora NULLS LAST, ordenFisico NULLS LAST, id` — el `id` final es obligatorio
porque la paginación offset exige `ORDER BY` determinístico.

## Affected Areas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `movimientos-bancarios.controller.ts` | Modified | `GET /` con `.read` |
| `ports/movimiento-bancario.repository.port.ts` + adapter | Modified | Listado cross-cuenta, count, saldos vigentes |
| `extracto-importador.service.ts` | Modified | Captura de `ordenFisico` |
| `prisma/schema.prisma` | Modified | `ordenFisico Int?` + `@@index([organizationId, fecha])` |
| `frontend/src/features/` | New | Pantalla + nav item |

## Invariantes del core a respetar

§4.2 multi-tenant (toda query filtra `organizationId`), §4.5 dinero como
Decimal/string nunca `number`, §4.6 `FechaContable` sin UTC, §14.7 gating
fail-closed. REQ-CB-15: el módulo **solo lee** del núcleo contable —
`no-escribe-comprobantes.arch.spec.ts` debe seguir verde.

## Risks

| Riesgo | Prob. | Mitigación |
|--------|-------|------------|
| Saldo vigente desactualizado presentado como saldo de hoy | Alta | `fechaUltimoMovimiento` por cuenta, visible |
| El filtro opt-in de estado esconde pendientes reales | Media | Default sin filtro + auditoría de vínculos |
| `ordenFisico` no comparable entre importaciones | Baja | Acotado a Unión/misma cuenta/mismo día; documentado |
| Primer `$queryRaw` del módulo | Media | Cubierto con `*.integration.spec.ts` contra Postgres real |

## Rollback Plan

Migración **aditiva pura**: columna nullable + índice. Revertir = `git revert` del
PR + migración inversa (`DROP INDEX`, `DROP COLUMN`). Ningún dato existente se
modifica ni se borra: `ordenFisico` nace `null` para todo lo ya importado y el
orden degrada a `fecha, hora, id`. Aplica el protocolo §11.6 — revisar `DROP` de
objetos raw SQL en el `migration.sql` regenerado antes de aplicarlo.

## Dependencies

Ninguna externa. Sin paquetes nuevos, sin permisos nuevos.

## Success Criteria

- [ ] Un solo request muestra los movimientos de todos los bancos del rango.
- [ ] La vista por defecto no oculta ningún movimiento del rango.
- [ ] El saldo cross-banco viene con la fecha de su último movimiento por cuenta.
- [ ] Un vínculo roto aparece en la franja de auditoría, no escondido.
- [ ] Los movimientos de Unión de un mismo día salen en el orden del extracto.
- [ ] `no-escribe-comprobantes.arch.spec.ts` y la suite del módulo, verdes.
