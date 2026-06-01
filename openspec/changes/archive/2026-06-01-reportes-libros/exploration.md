# Exploration: Reportes / Libros Contables + Estados Financieros

> Artifact store: hybrid  
> Topic key: sdd/reportes-libros/explore  
> Fecha: 2026-05-30

---

## A. Estado actual del backend

### Entidades y tablas disponibles

Toda la data necesaria ya existe en el schema. No falta nada estructural.

**`Comprobante`** (`backend/prisma/schema.prisma:647`):
- `organizationId`, `fechaContable` (`@db.Date`), `periodoFiscalId`, `tipo`, `estado`, `numero`, `glosa`, `monedaPrincipal`
- Totales cache: `totalDebitoBob` y `totalCreditoBob` (`Decimal(18,2)`) — calculados y guardados al contabilizar. Crítico: el Balance de Comprobación puede hacerse con solo esta tabla sin sumar líneas.
- Flag `anulado: Boolean @default(false)` ortogonal al estado — los reportes oficiales EXCLUYEN anulados por default.
- Índices útiles para reportes: `[organizationId, fechaContable]`, `[organizationId, tipo, fechaContable]`, `[organizationId, periodoFiscalId, estado]`.

**`LineaComprobante`** (`schema.prisma:712`):
- `organizationId` (denormalizado), `comprobanteId`, `cuentaId`, `moneda`, `debitoBob`, `creditoBob` (`Decimal(18,2)`).
- **`debitoBob` y `creditoBob` ya están en BOB**: la partida doble se valida en `montoBob`, por lo que para calcular saldos en reportes siempre se suman estas columnas. Multi-moneda ya resuelto.
- Índices: `[organizationId, cuentaId]` — fundamental para el Libro Mayor (movimientos por cuenta).
- NO hay índice compuesto `[organizationId, cuentaId, comprobanteId.fechaContable]`. Para reportes por cuenta+fecha necesitaría un JOIN a `comprobantes`.

**`Cuenta`** (`schema.prisma:369`):
- `claseCuenta` (`ClaseCuenta`: ACTIVO/PASIVO/PATRIMONIO/INGRESO/EGRESO) — mapeo directo a secciones del Balance y Estado de Resultados.
- `subClaseCuenta` (`SubClaseCuenta`): 13 valores que cubren Corriente/No Corriente para Activo/Pasivo, Operativo/No Operativo para Ingresos/Egresos, Capital/Resultados para Patrimonio. Diseñado explícitamente para EEFF (`schema.prisma:92-115`).
- `naturaleza` (`NaturalezaCuenta`: DEUDORA/ACREEDORA) — determina si un saldo es positivo o negativo para el tipo de cuenta.
- `esContraria: Boolean` — cuentas que viven en una clase pero tienen naturaleza opuesta (ej: Depreciación Acumulada en ACTIVO pero ACREEDORA). En reportes se **RESTAN** del total del grupo (`schema.prisma:399`).
- `esDetalle: Boolean` — solo las cuentas `esDetalle=true` tienen movimientos. Las cuentas raíz/agrupadores son `esDetalle=false` y su saldo es la suma de sus hijos. Jerarquía: `parentId`, `nivel` (1..8).
- `nivel` (Int) y `parentId` (String?) — árbol hasta 8 niveles; el seed usa hasta 5.
- Índices: `[organizationId, claseCuenta]`, `[organizationId, subClaseCuenta]`.

**`PeriodoFiscal`** (`schema.prisma:567`):
- `year`, `month`, `status` (ABIERTO/CERRADO), `gestionId`.
- FK: `comprobantes ↔ periodoFiscal` con `onDelete: Restrict` — integridad garantizada.

**`GestionFiscal`** (`schema.prisma:538`):
- `year`, `mesInicio`, `status` (ABIERTA/CERRADA).
- Contiene 12 períodos. Necesaria para el Balance General (fecha de corte = cierre de gestión o fecha dentro de una gestión abierta).

**`OrgConfiguracionContable`** (`schema.prisma:455`):
- FKs a cuentas específicas: `resultadoEjercicioId`, `resultadosAcumuladosId`, etc.
- **Crítico para el Balance General**: el "Resultado del Ejercicio" en Patrimonio se calcula como `SUM(Ingresos) - SUM(Egresos)` del período, y se mapea a la cuenta configurada en `resultadoEjercicioId`. Esta cuenta vive bajo `PATRIMONIO_RESULTADOS`.

### Módulos de reportes existentes

**NO existe ningún módulo `reportes`, `libros`, `libro-diario` ni `libro-mayor`** en `backend/src/`.

El catálogo de permisos SÍ los anticipa (`backend/src/common/permisos/catalogo.ts:134-140`):
```
contabilidad.libro-diario.read
contabilidad.libro-mayor.read
contabilidad.eeff.read
```

Esto significa que el RBAC ya está preparado — solo falta implementar los endpoints.

### Cómo filtra comprobantes hoy

`ListarFiltros` en `comprobante.repository.port.ts:73-82`:
- `periodoFiscalId`, `tipo`, `estado`, `fechaDesde` / `fechaHasta`, `q`, `incluirAnulados`.
- El repo construye `WHERE anulado = false` por default (`prisma-comprobante.repository.ts:225`).
- Ordenamiento: `fechaContable DESC`, `numero DESC` (NULLs primero).
- Paginación obligatoria.

Para el **Libro Diario** esto es exactamente lo necesario, pero sin paginación (o con una muy alta). Para el **Libro Mayor** necesita agrupación por `cuentaId` que hoy no existe.

---

## B. Decisiones de dominio a resolver

### B.1 Saldo del Mayor: on-the-fly vs materializado

**On-the-fly** (sumar `debitoBob`/`creditoBob` de `lineas_comprobante` por cuenta):
- Pros: sin deuda de sincronización; siempre consistente; simple de implementar.
- Contras: sin índice compuesto `(organizationId, cuentaId, fechaContable)`, cada query de Mayor necesita JOIN `lineas → comprobantes` para filtrar por fecha. Para una PyME con 5.000 comprobantes/año × 3 años = ~15.000 filas de lineas — perfectamente manejable on-the-fly con el índice `[organizationId, cuentaId]` existente.
- **Veredicto para PyME avícola: on-the-fly es suficiente**. El índice `[organizationId, cuentaId]` existente más un índice en `comprobantes.fechaContable` (ya existe) son suficientes.

**Materializado** (tabla de saldos por cuenta/período):
- Pros: consultas instantáneas; necesario si hay muchos períodos acumulados.
- Contras: sincronización extra en cada contabilización/anulación/edición de comprobante; deuda de consistencia; complejidad de migración si la lógica cambia.
- **Veredicto: diferir**. Agregar solo si la performance on-the-fly fuera inaceptable (medir antes de construir). Si se añade en el futuro, es un adapter adicional — no cambia el puerto.

### B.2 Mapeo cuenta → sección de reporte

El mapeo YA ESTÁ CODIFICADO en el schema:
- `claseCuenta` → sección del Balance (`ACTIVO`, `PASIVO`, `PATRIMONIO`) o del Estado de Resultados (`INGRESO`, `EGRESO`).
- `subClaseCuenta` → subsección (Corriente/No Corriente, Operativo/No Operativo, etc.).
- `esContraria=true` → la cuenta se RESTA de su grupo en lugar de sumarse.
- `esDetalle=false` → cuenta agrupadora, su saldo = suma de hijos (recalcular en runtime o propagar desde hojas).

No se necesita config explícita adicional. El plan de cuentas seeded ya tiene `claseCuenta` y `subClaseCuenta` correctos.

### B.3 Saldo inicial / arrastre entre gestiones

Este es el edge case más complejo:
- El Balance General a una fecha T necesita saldos acumulados desde el inicio de la gestión (o desde el asiento de apertura `TipoComprobante.APERTURA`).
- El asiento de **APERTURA** (`TipoComprobante.APERTURA`) es el mecanismo de traspaso de saldos entre gestiones. Existe en el schema pero aún no tiene lógica de cierre anual automático.
- **Para el MVP**: calcular el Balance con todos los comprobantes CONTABILIZADOS del tenant desde la fecha del primer asiento de apertura hasta la fecha de corte, filtrando por `anulado=false`. El arrastre entre gestiones se maneja vía el asiento de APERTURA de la gestión actual.
- **Edge case**: si no hay asiento de APERTURA (gestión recién creada), el saldo inicial es 0 para todas las cuentas. Esto es correcto para una empresa nueva.

### B.4 Anulados

Ya resuelto en el sistema: `anulado=false` es el default en todos los filtros (`REQ-COMP-REPORTES-01`). Los reportes heredan esta política. El toggle `incluirAnulados=true` existe para auditoría interna.

### B.5 Multi-moneda en reportes

`debitoBob` y `creditoBob` en `lineas_comprobante` ya son el importe en BOB (moneda funcional boliviana). Los reportes solo suman estas columnas. No se necesita conversión en runtime para el flujo principal. El campo `tipoCambioReexpresion` en `Comprobante` es para re-expresión opcional (no para partida doble).

### B.6 Cálculo en SQL vs en memoria

- **Libro Diario**: fetch de comprobantes con líneas por rango de fechas. Con paginación, puede ser Prisma puro (findMany con include). Sin paginación (descarga completa para PDF), usar `$queryRaw` con CTE para evitar N+1.
- **Libro Mayor**: agrupación por `cuentaId` con SUM de `debitoBob`/`creditoBob`. Ideal con `groupBy` de Prisma o `$queryRaw`. Filtrado por `[organizationId, cuentaId]` más JOIN a `comprobantes` por fechas.
- **Balance / Estado de Resultados**: agrupación por `cuentaId` + `claseCuenta` + `subClaseCuenta`. Un solo `$queryRaw` con CTE puede devolver todos los saldos de cuentas detalle en una pasada; el servicio construye el árbol jerárquico en memoria.
- **Invariante tenantId**: TODA query raw debe incluir `organization_id = $tenantId::uuid` explícitamente. Sin excepción.

---

## C. Approaches candidatos

### Approach 1: Módulo `reportes` unificado con sub-servicios

Crear un único módulo `backend/src/reportes/` con:
```
reportes/
├── domain/           # tipos de reporte (LibroDiario, LibroMayor, etc.)
├── ports/            # ReporteRepository port (cross-module reader)
├── adapters/         # PrismaReporteRepository (queries complejas)
├── services/         # LibroDiarioService, LibroMayorService, EeffService
├── dto/              # query DTOs y response DTOs por reporte
├── reportes.controller.ts
└── reportes.module.ts
```

- Pros: cohesión — toda la lógica de reportes en un lugar; un solo módulo que consume ComprobantesReaderPort + CuentasReaderPort; fácil de agregar PDF export después.
- Contras: módulo puede crecer mucho si se agregan muchos reportes; el `adapter/` tendrá queries SQL muy distintas entre sí.
- Esfuerzo: **Medio**.
- **Esta es la opción recomendada**.

### Approach 2: Reportes como sub-funcionalidades en módulos existentes

Extender `comprobantes` con endpoints `/api/libros/diario` y `/api/libros/mayor`, y agregar endpoints de EEFF a `cuentas`.

- Pros: reutiliza código existente; no crea dependencia cruzada nueva.
- Contras: viola SRP — el módulo `comprobantes` mezcla operaciones CRUD con reportes; el módulo `cuentas` termina conociendo de comprobantes; dificulta añadir export PDF; cada módulo crece sin dirección clara.
- Esfuerzo: **Bajo** (inicialmente) pero deuda alta a mediano plazo.

### Approach 3: Módulos separados por reporte

`libros/`, `eeff/`, cada uno con su stack hexagonal.

- Pros: separación máxima; se pueden hacer PRs independientes por tipo de reporte.
- Contras: over-engineering para el volumen actual; mucho boilerplate; comparten casi todo el código de acceso a datos.
- Esfuerzo: **Alto**.

---

## D. Recomendación de alcance y fasing

### MVP de mayor valor

**Orden sugerido de PRs incrementales:**

#### Change 1: `reportes-libro-diario` (MVP inmediato, máximo valor práctico)
- Endpoint `GET /api/libros/diario` con filtros `fechaDesde`, `fechaHasta`, `periodoFiscalId`, `tipo`, `incluirAnulados`.
- Devuelve comprobantes CONTABILIZADOS con sus líneas y datos de cuenta (código, nombre).
- Backend: `ReportesModule` con `LibroDiarioService` + `PrismaReporteRepository` + DTOs.
- Frontend: tabla con paginación y filtros. Sin export PDF en este slice.
- **Este change valida la arquitectura del módulo `reportes`**.

#### Change 2: `reportes-libro-mayor`
- Endpoint `GET /api/libros/mayor` con filtros de cuenta, fecha, período.
- Agrupación por cuenta: saldo inicial + movimientos + saldo final, todo en BOB.
- Requiere índice compuesto nuevo en `lineas_comprobante`: `(organizationId, cuentaId, comprobanteId)` — el JOIN a `comprobantes` para filtrar por fecha requiere esta optimización.
- **Dependencia**: necesita el módulo `reportes` creado en Change 1.

#### Change 3: `reportes-balance-general`
- Endpoint `GET /api/eeff/balance` con fecha de corte.
- Lógica de árbol jerárquico: suma saldos de hijos → propaga a padres.
- Secciones: Activo Corriente / No Corriente, Pasivo Corriente / No Corriente, Patrimonio (Capital + Resultado del Ejercicio calculado).
- **Dependencia**: Change 2 (reutiliza la lógica de saldos del Mayor).

#### Change 4: `reportes-estado-resultados`
- Endpoint `GET /api/eeff/resultados` con rango de fechas o período/gestión.
- Secciones: Ingreso Operativo/No Operativo, Egreso Operativo/Administrativo/Comercialización/Financiero/No Operativo.
- Resultado del ejercicio = `SUM(Ingresos en BOB) - SUM(Egresos en BOB)`.
- **Dependencia**: Change 2 (misma lógica de saldo por clase).

---

## E. Riesgos y dependencias

### Invariantes en juego

1. **Multi-tenant** (§4.2 CLAUDE.md): TODA query de reporte debe incluir `organizationId = $tenantId`. Riesgo crítico en `$queryRaw` — fácil olvidar el filtro. Mitigación: test de integración con dos tenants.

2. **Excluir BORRADOR** (§4.1): Los reportes solo incluyen comprobantes `CONTABILIZADO` o `BLOQUEADO`. `BORRADOR` nunca aparece. El filtro `estado NOT IN ('BORRADOR')` o `estado = 'CONTABILIZADO' OR estado = 'BLOQUEADO'` es obligatorio en todas las queries de reporte.

3. **Excluir anulados por default** (§4.7): `anulado = false` en todas las queries. Toggle solo para auditoría interna.

4. **Dinero = Decimal** (§4.5): los DTOs de respuesta deben serializar `debitoBob`/`creditoBob`/saldos como `string`, no como `number`.

5. **`esContraria`**: las cuentas contrarias (ej: Depreciación Acumulada) deben restarse del total de su clase, no sumarse. Si se ignora, el Balance General mostrará activos inflados.

6. **Cuentas sin movimiento**: deben aparecer en el Mayor con saldo 0 si el contador explícitamente selecciona una cuenta. En el Balance no aparecen (solo las que tienen saldo ≠ 0 o las que son estructurales del plan). Decisión a tomar en el proposal.

7. **Cuentas agrupadores (`esDetalle=false`)**: no tienen líneas directas. Su saldo = suma recursiva de hijos con `esDetalle=true`. La consulta del Mayor y del Balance necesita considerar esto para presentar subtotales. Estrategia: calcular solo en hojas (`esDetalle=true`), luego agregar en servicio usando el árbol de cuentas.

8. **Período abierto en Balance**: el Balance General es válido en cualquier momento (períodos ABIERTOS o CERRADOS). No requiere período cerrado. Diferente del cierre mensual/anual que SÍ requiere períodos cerrados.

9. **Índice faltante para el Mayor**: el índice `[organizationId, cuentaId]` en `lineas_comprobante` existe, pero para filtrar por fecha necesita JOIN a `comprobantes.fechaContable`. Considerar agregar índice compuesto `(organizationId, cuentaId)` más `comprobantes.fechaContable` vía JOIN. Alternativamente, desnormalizar `fechaContable` en `lineas_comprobante` (tiene precedente: `organizationId` ya está desnormalizado). Esta decisión va en el design.

10. **`StubMovimientosReader`**: el stub en `cuentas/adapters/stub-movimientos-reader.ts` devuelve `false` siempre. El módulo `reportes` NO usa este port, pero al implementar el `PrismaMovimientosReader` real (pendiente desde Fase 1.1), el stub se reemplaza automáticamente. No bloquea el desarrollo de reportes.

### Dependencias externas

- **Permisos RBAC**: `contabilidad.libro-diario.read`, `contabilidad.libro-mayor.read`, `contabilidad.eeff.read` ya están en el catálogo. Solo agregar `@RequirePermissions` en los controllers.
- **Plan de cuentas**: debe tener `claseCuenta`, `subClaseCuenta`, `naturaleza` y `esContraria` correctamente asignados en el seed. Verificar antes del Balance. El seed de `plan-cuentas-comercial.md` ya define todo esto.
- **Asientos de APERTURA**: para Balance General con arrastre correcto entre gestiones, el asiento de APERTURA de cada gestión debe existir. Si no existe (primera gestión), el saldo inicial es 0 — comportamiento correcto para empresa nueva.

---

## Ready for Proposal

**Sí** — la exploración revela que:
1. Toda la data estructural ya existe y está modelada correctamente.
2. No se necesitan migraciones de schema para los reportes básicos (Libro Diario, Mayor, Balance, Estado de Resultados).
3. La única migración posible es un índice de optimización para el Mayor (desnormalizar `fechaContable` en `lineas_comprobante` o agregar índice compuesto), y solo si las mediciones de performance lo justifican.
4. El approach es módulo único `reportes/` con sub-servicios por tipo de reporte.
5. El fasing natural es 4 changes incrementales, con Libro Diario como MVP.

El orchestrador debería recomendar al usuario iniciar con `sdd-propose` para `reportes-libro-diario`.
