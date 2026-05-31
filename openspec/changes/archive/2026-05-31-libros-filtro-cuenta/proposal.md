# Change: libros-filtro-cuenta

> Filtro por Cuenta en los reportes Libro Diario y Libro Mayor.

## Intent

Permitir que el usuario filtre los reportes contables **Libro Diario** y **Libro Mayor** por una **cuenta específica** del plan de cuentas (ej. "Caja general"), de modo que el reporte traiga únicamente lo relativo a esa cuenta.

El Libro Mayor ya soporta el filtro en el backend; sólo le falta el cableado en el frontend. El Libro Diario no soporta el filtro en ninguna capa y requiere trabajo de backend + frontend.

## Motivación

- El contador necesita aislar el movimiento de una cuenta concreta sin recorrer todo el libro. Es una operación cotidiana en la revisión y conciliación contable.
- El backend del Libro Mayor ya expone `cuentaId` (DTO + validación + adapter `$queryRaw`), pero el frontend no lo cablea: hay deuda explícita anotada en `frontend/src/features/.../libro-mayor-page.tsx:22-26`. Es un quick win.
- El Libro Diario es el espejo natural del Mayor: ofrecer el filtro en uno y no en el otro es inconsistente para el usuario.
- El índice `@@index([organizationId, cuentaId])` sobre `lineas_comprobante` ya existe, por lo que el filtro del Diario es eficiente sin cambios de schema.

## Scope

### In scope

1. **Mayor — frontend** (quick win, backend listo):
   - Cablear el valor seleccionado del `cuenta-autocomplete` existente al parámetro `cuentaId` de la query del Libro Mayor.
   - Cerrar la deuda anotada en `libro-mayor-page.tsx:22-26`.

2. **Diario — backend** (Opción A confirmada por el usuario):
   - `dto/libro-diario-query.dto.ts`: agregar `cuentaId?: string` con `@IsUUID()` + `@IsOptional()` (espeja el DTO del Mayor).
   - `ports/comprobantes-reader.port.ts`: agregar `cuentaId?` a `LibroDiarioFiltros` y el método de lookup de cuenta que el service necesita para validar (el módulo dueño define qué se puede leer de él).
   - `libro-diario.service.ts`: validación de cuenta espejando el patrón del Mayor (`libro-mayor.service.ts:128-137`): cuenta inexistente / de otro tenant → 404 (`CuentaNoEncontradaError`), cuenta agrupadora / no-detalle → 400 (`CuentaNoDetalleError`).
   - `adapters/prisma-comprobantes-reader.adapter.ts`: aplicar el filtro **Opción A** `where: { lineas: { some: { cuentaId } } }` tanto en el `comprobante.findMany` como en el `contarAsientos` (el tope defensivo debe contar sobre el mismo conjunto filtrado). El comprobante se trae **completo, con todas sus líneas visibles** (no sólo las líneas de la cuenta filtrada).
   - `domain/libro-diario-errors.ts`: agregar `CuentaNoEncontradaError` y `CuentaNoDetalleError` (jerarquía `DomainError`, códigos estables `{MODULO}_{SUBDOMINIO}_{CONDICION}`, espejando los del Mayor).

3. **Diario — frontend**:
   - Reutilizar el componente `cuenta-autocomplete.tsx` y el hook `useCuentas({ esDetalle: true, activa: true })`.
   - Cablear la cuenta seleccionada al parámetro `cuentaId` de la query del Libro Diario.

### Out of scope

- **Paginación real** (diferida). El tope defensivo actual (count-previo → HTTP 422) ya cubre el caso PyME. Se documenta como follow-up futuro, no se implementa aquí.
- **Migración de schema**: ninguna. El índice `@@index([organizationId, cuentaId])` ya existe.
- Cambios en la semántica del agrupamiento del Libro Mayor (su backend ya está terminado y validado).
- Filtro multi-cuenta o por rango de cuentas (sólo una cuenta a la vez, vía autocomplete existente).

## Approach

### Libro Diario — Opción A (asiento completo)

Al filtrar por cuenta, se traen los **comprobantes (asientos) completos** que tocan esa cuenta, con **todas sus líneas** visibles, no sólo las líneas de la cuenta filtrada. El usuario ve el asiento entero para entender el contexto de los movimientos relacionados y la partida doble se preserva en pantalla.

Implementación en la query existente:

```typescript
// El predicado de tenant va primero (invariante §4.2, defense in depth).
where: {
  organizationId,
  ...(cuentaId !== undefined ? { lineas: { some: { cuentaId } } } : {}),
  // ...resto de filtros existentes (desde/hasta, tipo, estado, q)
}
```

El mismo predicado se aplica en `contarAsientos` para que el tope defensivo cuente sobre el conjunto realmente filtrado.

### Validación de cuenta (espejo del Mayor)

La forma se valida en el DTO (`@IsUUID`); la regla de negocio en el service:

- La cuenta debe existir y pertenecer al tenant. Una cuenta de otro tenant se trata como inexistente → 404 (`CuentaNoEncontradaError`). Defense in depth: el lookup filtra por `organizationId`.
- La cuenta debe ser de detalle (`esDetalle = true`). Una cuenta agrupadora → 400 (`CuentaNoDetalleError`).

El service consume el lookup de cuenta vía **port** del módulo dueño (cross-module → port, hexagonal estricto), no vía adapter concreto ni import directo de otro módulo.

### Frontend (ambos libros)

Se reutiliza `cuenta-autocomplete.tsx` (`useCuentas({ esDetalle: true, activa: true })`). En el Mayor se cierra la deuda del cableado; en el Diario se agrega el control y se cablea `cuentaId` a la query. UI en español.

## Riesgos

- **Coherencia del tope defensivo (Diario)**: si el filtro se aplica en `findMany` pero NO en `contarAsientos`, el conteo previo evalúa un universo distinto al resultado real y el 422 dispara mal. Mitigación: aplicar el mismo `where` en ambos métodos (verificado por test de integración vs Postgres real).
- **Fuga multi-tenant en el lookup de cuenta**: validar la cuenta sin filtrar por `organizationId` permitiría confirmar existencia de cuentas de otros tenants. Mitigación: el lookup filtra por tenant; cuenta de otro tenant → 404, cubierto con test (+ y −).
- **Divergencia Diario vs Mayor**: si los códigos de error / contratos del Diario no espejan los del Mayor, la UI y los tests divergen. Mitigación: replicar nombres de error y semántica (404 / 400) del Mayor.
- **`exactOptionalPropertyTypes`**: pasar `cuentaId: undefined` rompería el tipado. Mitigación: spread condicional `...(cuentaId !== undefined ? { cuentaId } : {})` en DTO → filtros → where.
- **Performance bajo el filtro `lineas: { some: { cuentaId } }`**: cubierto por el índice `@@index([organizationId, cuentaId])` existente; sin riesgo bajo volúmenes PyME.

## Alternativas consideradas

- **Libro Diario — Opción B (sólo las líneas de la cuenta)**: mostrar únicamente las líneas que tocan la cuenta filtrada, no el asiento completo. **Descartada por el usuario**: rompe la lectura de partida doble en pantalla y pierde el contexto de los movimientos relacionados.
- **Paginación real (cursor/offset) ahora**: descartada/diferida. El tope defensivo count-previo → 422 ya protege el caso PyME; introducir paginación ahora agrega complejidad sin beneficio para el volumen actual. Follow-up futuro.
- **Filtro de cuenta resuelto sólo en frontend (filtrando el array ya traído)**: descartada. Rompe el tope defensivo (traería todo igual), no escala y viola la responsabilidad del backend de filtrar por dominio.

## Follow-ups (fuera de este change)

- Paginación real de Libro Diario y Libro Mayor cuando el volumen lo justifique (hoy cubierto por el tope defensivo 422).
