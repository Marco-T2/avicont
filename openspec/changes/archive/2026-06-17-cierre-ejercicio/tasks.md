# Tasks — Cierre del Ejercicio (`cierre-ejercicio`)

> Change: `cierre-ejercicio` · BACKEND-ONLY · Strict TDD (red→green) · describe/it en español
> Comandos operativos: CLAUDE.md §11 (correr desde `backend/`, `DATABASE_URL` inline).
> Spec: `openspec/changes/cierre-ejercicio/specs/` (28 REQ, 57 escenarios)
> Design: `openspec/changes/cierre-ejercicio/design.md`
>
> Orden de ejecución: Batch 1 → 2 → 3 → 4 → 5 → 6 → Cierre
> Los batches 3 y 4 pueden ejecutarse en paralelo entre sí SOLO después de que el
> Batch 2 haya terminado (necesitan los errores de comprobante ya definidos).
> El Batch 5 depende de que el Batch 4 esté completo.

---

## Batch 1 — Fundación: schema + migración + seed

> **Precondición**: ninguna. Es el punto de entrada.
> **Parallelizable con**: nada (los demás batches dependen de este).

### 1.1 — Schema: columna `generadoPorSistema`

- [x] En `backend/prisma/schema.prisma`, model `Comprobante`: agregar el campo
  `generadoPorSistema Boolean @default(false)` con comentario `// cierre, apertura, auto-entries: no editable por usuario (REQ-CMP-SYS-01)`.
  Verificar que el campo quede DESPUÉS de `origenId` para minimizar diff de migración.
  *(test-first NO aplica a schema — el test lo cubre el Batch 2)*

### 1.2 — Migración aditiva (protocolo §11.6 OBLIGATORIO)

- [x] Generar la migración:
  ```
  cd backend && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
    pnpm exec prisma migrate dev --name cierre_resultado_gestion
  ```
  La migración combina la columna `generadoPorSistema` + el rename/delete de cuentas
  (tareas 1.3–1.4) en UN solo `migration.sql` — generarla DESPUÉS de escribir el
  raw SQL de datos en el mismo archivo (abrir el archivo y agregar al final).

- [x] Abrir `backend/prisma/migrations/<timestamp>_cierre_resultado_gestion/migration.sql`
  y `grep -E "^DROP (INDEX|EXTENSION|TYPE|TRIGGER|FUNCTION|TABLE)"`.
  Borrar a mano cualquier `DROP` de los objetos raw SQL vivos de la lista §11.6:
  - `comprobante_documento_fisico_unique_contabilizado` (índice parcial)
  - `trg_audit_comprobantes` (trigger en `comprobantes`)
  - `trg_audit_lineas_comprobante` (trigger en `lineas_comprobante`)
  - `comprobantes_audit`, `comprobantes_audit_*_idx` (tabla + índices audit)
  - `trg_comprobantes_audit` (función plpgsql)
  - contactos trigram, `pg_trgm`, CHECK de `organizations`, CHECK de `lotes`
  Agregar comentario corto junto a cada línea borrada explicando el motivo.
  La migración resultante debe tener SOLO `ADD COLUMN` + el raw SQL de datos.

- [x] Agregar al final de `migration.sql` el raw SQL de datos (cuestión E del design):
  ```sql
  -- Rename transitoria (idempotente): UTILIDAD DE LA GESTIÓN → RESULTADO DE LA GESTIÓN
  -- REQ-CTA-CIERRE-01: cuenta dual única; Ley 843 art. 46.
  UPDATE cuentas
  SET nombre = 'RESULTADO DE LA GESTIÓN'
  WHERE "codigoInterno" = '3.1.4.001'
    AND nombre = 'UTILIDAD DE LA GESTIÓN';

  -- Eliminar 3.1.4.002 PÉRDIDA DE LA GESTIÓN solo si sin movimiento (FK Restrict).
  -- REQ-CTA-CIERRE-02: no rompe config mapeada (no está en MAPEO_CODIGO_A_CONCEPTO).
  DELETE FROM cuentas c
  WHERE c."codigoInterno" = '3.1.4.002'
    AND NOT EXISTS (
      SELECT 1 FROM lineas_comprobante lc WHERE lc."cuentaId" = c.id
    );
  ```

- [x] Aplicar la migración:
  ```
  cd backend && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
    pnpm exec prisma migrate deploy
  ```
  Verificar post-apply:
  - `\d comprobantes` muestra `generadoPorSistema`
  - `\d contactos` conserva índices trigram
  - `\d comprobantes` conserva triggers `trg_audit_comprobantes`
  - `SELECT nombre FROM cuentas WHERE "codigoInterno"='3.1.4.001'` → `RESULTADO DE LA GESTIÓN`
  - `SELECT COUNT(*) FROM cuentas WHERE "codigoInterno"='3.1.4.002'` → `0` (en orgs sin movimiento)

### 1.3 — `prisma generate`

- [x] Regenerar el cliente Prisma:
  ```
  cd backend && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
    pnpm exec prisma generate
  ```
  Verificar que el tipo `Comprobante` del cliente incluye `generadoPorSistema: boolean`.

### 1.4 — Actualizar seed `comercial.ts` (REQ-CTA-CIERRE-01/02/03)

- [x] En `backend/src/cuentas/adapters/seed/comercial.ts`:
  - Renombrar la cuenta `3.1.4.001` de `'UTILIDAD DE LA GESTIÓN'` a `'RESULTADO DE LA GESTIÓN'`
    (preservar `esRequeridaSistema: true`, clase PATRIMONIO, subClase `PATRIMONIO_RESULTADOS`,
    naturaleza ACREEDORA y el mapeo `resultadoEjercicioId` intacto).
  - Eliminar la entrada de `3.1.4.002 'PÉRDIDA DE LA GESTIÓN'` del array de cuentas hoja.
  *(No hay otros seeds de tipo de empresa — solo `comercial.ts` existe en el directorio)*

- [x] (RED) Agregar en `backend/src/cuentas/adapters/seed/comercial.integration.spec.ts`
  un test nuevo: *"el seed NO contiene la cuenta 3.1.4.002"* (assert que ninguna
  entrada tiene `codigoInterno === '3.1.4.002'`).
  *(test-first: el test falla hasta ejecutar 1.4 seed; pasa con el nuevo seed)*

- [x] (GREEN) Verificar que `comercial.integration.spec.ts` pasa (incluido el test nuevo)
  y que `codigo-a-concepto.spec.ts` sigue verde (toda `esRequeridaSistema` mapeada).

---

## Batch 2 — Enforcement `generadoPorSistema` en `comprobantes` (TDD)

> **Precondición**: Batch 1 completo (cliente Prisma con `generadoPorSistema`).
> **Parallelizable con**: nada (Batch 3 y 4 dependen de los errores definidos aquí).
>
> **Notas de implementación (apply Batch 2):**
> - El port `GestionStatusReaderPort` se registró/exportó en `periodos-reader.module.ts`
>   (módulo-puerto LEAF), NO en `periodos-fiscales.module.ts`. Razón: `comprobantes`
>   importa el leaf (no el módulo completo) para romper el ciclo CJS comprobantes↔periodos
>   (ver comentario en `comprobantes.module.ts`). Registrarlo en el módulo completo lo
>   dejaría inalcanzable para comprobantes. `comprobantes.module.ts` no necesitó cambios:
>   ya importa `PeriodosReaderModule`, que ahora exporta el nuevo port.
> - Firma del port: `estaGestionCerradaPorPeriodo(periodoFiscalId, tenantId)` — se recibe el
>   `periodoFiscalId` (el comprobante ya lo tiene) y el adapter navega periodoFiscal→gestion→status
>   (más directo que derivar el gestionId, como permite la tarea 2.5).
> - Vía de borrado por path-sistema (tarea 5 del prompt): se definió la FIRMA del writer port
>   en `comprobantes/ports/cierre-comprobante-writer.port.ts` (`crearBorradorSistema` +
>   `eliminarBorradorSistema`), SIN adapter ni wiring ni consumo — el adapter + registro en
>   `comprobantes.module.ts` los hace el Batch 4 (tasks.md 4.5).
> - Regresión Batch-1 detectada (FUERA de Batch 2, NO tocada): los specs de integración
>   `prisma-plan-cuentas-seeder.adapter.integration.spec.ts` y `tenants.service.integration.spec.ts`
>   asertan 111 cuentas, pero el seed `comercial.ts` ahora siembra 110 (Batch 1 borró 3.1.4.002).
>   Actualizar esas 2 aserciones a 110 en el Batch 1 (o en el Batch de Cierre C.3).

### 2.1 — Errores de dominio en módulo `comprobantes` (REQ-CMP-SYS-02/03)

- [x] En `backend/src/comprobantes/domain/comprobante-errors.ts`, agregar las 2 subclases
  `DomainError` (namespace del módulo comprobantes, HTTP 409, §6.2):
  - `CierreComprobanteNoEditableError` → code `COMPROBANTE_GENERADO_SISTEMA_NO_EDITABLE`
  - `CierreComprobanteNoEliminableError` → code `COMPROBANTE_GENERADO_SISTEMA_NO_ELIMINABLE`
  Seguir el patrón de los errores existentes en el mismo archivo.

- [x] En `backend/src/comprobantes/domain/comprobante-errors.spec.ts`, agregar tests
  unitarios que verifican que los 2 errores tienen el code correcto y HTTP 409.

### 2.2 — Bloqueo en `comprobantes.service`: `actualizarBorrador` / `patch` (REQ-CMP-SYS-02)

- [x] (RED) En `backend/src/comprobantes/comprobantes.service.spec.ts`, agregar escenarios:
  - *(−)* `actualizarBorrador` con `generadoPorSistema=true` → lanza `CierreComprobanteNoEditableError`
  - *(+)* `actualizarBorrador` con `generadoPorSistema=false` → flujo normal (mock existente)

- [x] (GREEN) En `backend/src/comprobantes/comprobantes.service.ts`, en el método
  `actualizarBorrador` (y en `patch` que lo delega vía `actualizarBorrador`), agregar
  inmediatamente después de cargar `actual` (la entidad del repo):
  ```typescript
  if (actual.generadoPorSistema) throw new CierreComprobanteNoEditableError(id);
  ```
  El chequeo va ANTES del chequeo de `estado`.

### 2.3 — Bloqueo en `comprobantes.service`: `eliminarBorrador` (REQ-CMP-SYS-03)

- [x] (RED) En `comprobantes.service.spec.ts`, agregar:
  - *(−)* `eliminarBorrador` con `generadoPorSistema=true` → lanza `CierreComprobanteNoEliminableError`
  - *(+)* `eliminarBorrador` con `generadoPorSistema=false` → flujo normal

- [x] (GREEN) En `comprobantes.service.ts`, método `eliminarBorrador`, agregar después de
  cargar `actual`:
  ```typescript
  if (actual.generadoPorSistema) throw new CierreComprobanteNoEliminableError(id);
  ```

### 2.4 — Bloqueo en `comprobantes.service`: `editarContabilizado` (REQ-CMP-SYS-05)

- [x] (RED) En `comprobantes.service.spec.ts`, agregar:
  - *(−)* `editarContabilizado` con `generadoPorSistema=true` → lanza `CierreComprobanteNoEditableError`
  - *(+)* `editarContabilizado` con `generadoPorSistema=false` y estado CONTABILIZADO → flujo normal

- [x] (GREEN) En `comprobantes.service.ts`, método `editarContabilizado`, agregar el chequeo
  de `generadoPorSistema` antes de la lógica de edición. Mismo error que actualizarBorrador.

### 2.5 — Bloqueo de anulación condicionado al estado de la gestión (REQ-CMP-SYS-06)

> Este bloqueo requiere un port cross-módulo para consultar si la gestión está CERRADA.
> Se define el port mínimo necesario (solo la consulta que necesita este bloqueo).

- [x] Crear `backend/src/periodos-fiscales/ports/gestion-status-reader.port.ts`:
  ```typescript
  export abstract class GestionStatusReaderPort {
    abstract estaGestionCerrada(gestionId: string, tenantId: string): Promise<boolean>;
  }
  export const GESTION_STATUS_READER_PORT = Symbol('GESTION_STATUS_READER_PORT');
  ```
  *(Port mínimo: solo lo que comprobantes necesita para el bloqueo de anulación)*

- [x] Crear el adapter en `backend/src/periodos-fiscales/adapters/prisma-gestion-status-reader.adapter.ts`
  que implemente `GestionStatusReaderPort` consultando el campo `status` de `GestionFiscal`
  filtrado por `(id, organizationId)` con `tenantId`.

- [x] Registrar `GestionStatusReaderPort` en `backend/src/periodos-fiscales/periodos-fiscales.module.ts`
  (y en `periodos-reader.module.ts` si este se usa en imports de otros módulos).

- [x] Exportar `GestionStatusReaderPort` desde `periodos-fiscales.module.ts` para que
  `comprobantes.module.ts` pueda importarlo.

- [x] (RED) En `comprobantes.service.spec.ts`, agregar:
  - *(−)* `anular` con `generadoPorSistema=true`, `tipo=CIERRE`, gestión `CERRADA`
    → lanza `CierreGestionCerradaError` (código `CIERRE_EJERCICIO_GESTION_YA_CERRADA`)
  - *(+)* `anular` con `generadoPorSistema=true`, `tipo=CIERRE`, gestión ABIERTA
    → flujo normal (anulación permitida)
  - *(+)* `anular` con `generadoPorSistema=false` → flujo normal (sin chequeo de gestión)

- [x] Agregar el error `CierreGestionCerradaError` a `backend/src/comprobantes/domain/comprobante-errors.ts`
  (es un error del namespace CIERRE_EJERCICIO que se lanza desde comprobantes; code
  `CIERRE_EJERCICIO_GESTION_YA_CERRADA`, HTTP 409) — los errores de namespace CIERRE_EJERCICIO
  que se lanzan desde comprobantes viven en los errores de comprobante por conveniencia de
  import; los mismos códigos se definirán también en el módulo de cierre para los errores
  que nacen allá (ver Batch 3).

  > Alternativa más limpia: importar `CierreGestionCerradaError` desde el módulo de cierre.
  > Se elige definirlo también aquí para no crear dependencia circular en el momento del
  > Batch 2 (el módulo cierre-ejercicio aún no existe). Cuando se cree en Batch 3, unificar
  > si hay duplicación.

- [x] (GREEN) En `comprobantes.service.ts`, método `anular`, inyectar `GestionStatusReaderPort`
  y agregar después de cargar `actual`:
  ```typescript
  if (actual.generadoPorSistema && actual.tipo === TipoComprobante.CIERRE) {
    const cerrada = await this.gestionStatusReader.estaGestionCerrada(
      // derivar gestionId desde actual.periodoFiscalId — ver adapter
    );
    if (cerrada) throw new CierreGestionCerradaError();
  }
  ```
  *(El `gestionId` se deriva via la relación `periodo → gestion`; ajustar la firma del port si es más directo pasar el `periodoFiscalId`)*

- [x] Inyectar `GestionStatusReaderPort` en `comprobantes.module.ts` (importar
  `PeriodosFiscalesModule` o `PeriodsReaderModule` según cómo estén exportados).

### 2.6 — Verificación de tests de Batch 2

- [x] `cd backend && pnpm exec jest src/comprobantes/ --testPathPattern="service.spec|errors.spec"` → verde.
- [x] `cd backend && pnpm exec tsc --noEmit -p tsconfig.json` → 0 errores en los archivos tocados.

---

## Batch 3 — Dominio puro del cierre (TDD, ≥95% coverage)

> **Precondición**: Batch 1 completo. Los tipos/enums del dominio no dependen del Batch 2.
> **Parallelizable con**: Batch 4 puede arrancar en paralelo SI el sub-agente de Batch 4
>   escribe los ports/adapters/module sin correr tests (los tests de integración del Batch 4
>   necesitan el módulo del Batch 3 implementado).

### 3.1 — Estructura de carpetas del módulo nuevo

- [x] Crear la estructura vacía:
  ```
  backend/src/cierre-ejercicio/
  ├── domain/
  ├── ports/
  ├── adapters/
  ```
  *(Los archivos se crearán en los pasos siguientes; no crear archivos vacíos)*

### 3.2 — Errores de dominio del módulo `cierre-ejercicio` (REQ-CE-11/REQ-GF-CIERRE-01)

- [x] Crear `backend/src/cierre-ejercicio/domain/cierre-errors.ts` con las 7 subclases
  `DomainError` del namespace `CIERRE_EJERCICIO_*` (§6.2, HTTP indicado):
  - `CierreGestionNoEncontradaError` → `CIERRE_EJERCICIO_GESTION_NO_ENCONTRADA` (404)
  - `CierreGestionCerradaError` → `CIERRE_EJERCICIO_GESTION_YA_CERRADA` (409)
  - `CierreYaParcialmenteContabilizadoError` → `CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO` (409)
  - `CierrePeriodoNoListoError` → `CIERRE_EJERCICIO_PERIODO_NO_LISTO` (409)
  - `CierreSinResultadoError` → `CIERRE_EJERCICIO_SIN_MOVIMIENTO` (422)
  - `CierreConfigCuentaFaltanteError` → `CIERRE_EJERCICIO_CUENTA_DESTINO_FALTANTE` (422)
  - `CierrePartidaDobleError` → `CIERRE_EJERCICIO_PARTIDA_DOBLE` (500)

  > Nota: `CierreGestionCerradaError` tiene el mismo code que el error del Batch 2.
  > Unificar: el error del Batch 2 debe importar este (ajustar si Batch 2 ya creó una
  > versión local). El error canónico vive en `cierre-ejercicio/domain/cierre-errors.ts`.

- [x] (RED→GREEN) Crear `backend/src/cierre-ejercicio/domain/cierre-errors.spec.ts`
  que verifica codes y HTTP status de los 7 errores.

### 3.3 — Helper `signed-net` (puro, sin dependencias)

- [x] (RED) Crear `backend/src/cierre-ejercicio/domain/signed-net.spec.ts` con los escenarios:
  - cuenta DEUDORA con `debitoBob > creditoBob` (net positivo en su naturaleza) → `{lado: 'HABER', monto: Money(net)}`
  - cuenta ACREEDORA con `creditoBob > debitoBob` → `{lado: 'DEBE', monto: Money(net)}`
  - cuenta DEUDORA con saldo contrario (net negativo): `creditoBob > debitoBob` → `{lado: 'DEBE', monto: Money(|net|)}`
  - cuenta ACREEDORA con saldo contrario → `{lado: 'HABER', monto: Money(|net|)}`
  - `debitoBob === creditoBob` (net 0) → `null` (skip)

- [x] (GREEN) Crear `backend/src/cierre-ejercicio/domain/signed-net.ts`:
  ```typescript
  // Ley 843 art. 46 + Código Tributario art. 47: cierre de cuentas de resultado
  // y traslado a patrimonio; partida doble débito=crédito.
  export function netDe(
    debitoBob: Money,
    creditoBob: Money,
    naturaleza: NaturalezaCuenta,
  ): { lado: 'DEBE' | 'HABER'; monto: Money } | null
  ```
  Formula: `net = (naturaleza === ACREEDORA) ? credit − debit : debit − credit`.
  `net > 0` → lado OPUESTO a la naturaleza. `net < 0` → lado IGUAL a la naturaleza.
  `net === 0` → `null`.

### 3.4 — Builders de dominio puros (REQ-CE-02/03/05)

- [x] (RED) Crear `backend/src/cierre-ejercicio/domain/cierre-builders.spec.ts` con los
  escenarios del design §8 y spec REQ-CE-02/03/05:
  - `buildCerrarGastos` con gastos normales (utilidad): cuadre exacto, contrapartida agregada
    a transitoria, número de líneas correcto.
  - `buildCerrarGastos` con cuenta EGRESO de saldo contrario (anomalía, net<0): línea al DEBE.
  - `buildCerrarGastos` sin cuentas EGRESO con movimiento → `lineas: []` (SKIP).
  - `buildCerrarIngresos` análogo al anterior.
  - `buildTrasladarResultado` con resultado positivo (utilidad): transitoria al DEBE, RA al HABER.
  - `buildTrasladarResultado` con resultado negativo (pérdida): RA al DEBE, transitoria al HABER.
  - `buildTrasladarResultado` con resultado 0 → `lineas: []` (SKIP-on-zero).
  - Caso numérico utilidad del design §3.4: Ventas 100.000, Costo 60.000, Sueldos 20.000 →
    cuadre línea a línea de #1, #2, #3.
  - Caso numérico pérdida del design §3.5: Ventas 50.000, Costo 70.000 → cuadre línea a línea.
  - Negativo: si un builder genera líneas con `Σdebe ≠ Σhaber` → lanza `CierrePartidaDobleError`.

- [x] (GREEN) Crear `backend/src/cierre-ejercicio/domain/cierre-builders.ts` con los tipos
  internos y las 3 funciones puras:
  ```typescript
  interface SaldoCuentaCierre {
    cuentaId: string;
    clase: ClaseCuenta;
    naturaleza: NaturalezaCuenta;
    debitoBob: Money;
    creditoBob: Money;
  }
  interface LineaCierre { cuentaId: string; debito: Money; credito: Money; }
  interface AsientoCierre { glosa: string; lineas: LineaCierre[]; }

  export function buildCerrarGastos(
    saldos: SaldoCuentaCierre[], transitoriaId: string, year: number
  ): AsientoCierre;
  export function buildCerrarIngresos(
    saldos: SaldoCuentaCierre[], transitoriaId: string, year: number
  ): AsientoCierre;
  export function buildTrasladarResultado(
    resultado: Money, transitoriaId: string, resultadosAcumuladosId: string, year: number
  ): AsientoCierre;
  ```
  Cada builder: aplica `netDe`, omite net===0, arma contrapartida agregada, verifica
  partida doble con `Money` (±Bs 0.01), devuelve `lineas:[]` si sin aporte.
  Comentario regulatorio: `// Ley 843 art. 46 + Código Tributario art. 47`.

- [x] Verificar cobertura de dominio: `pnpm exec jest src/cierre-ejercicio/domain/ --coverage`
  → ≥95% en `signed-net.ts` y `cierre-builders.ts`.

---

## Batch 4 — Ports + adapters + servicio + orquestación

> **Precondición**: Batch 1 completo (cliente Prisma). Puede arrancar en paralelo con
>   Batch 3 para definir ports/adapters; los tests de integración del servicio esperan
>   que Batch 3 esté terminado.
> **Parallelizable con**: Batch 3 (ver nota arriba).
>
> **Notas de implementación (apply Batch 4 — COMPLETO):**
> - **Reuso de saldos**: el adapter `EeffCierreSaldosAdapter` inyecta
>   `EeffSaldosReaderPort` (`EEFF_SALDOS_READER_PORT`) y llama
>   `obtenerSaldosEnRango(tenantId, desde, hasta, false, true)` (excluirCierre=true,
>   REQ-CE-06) + `obtenerEstructuraCuentas` para resolver clase/naturaleza; filtra
>   cuentas hoja INGRESO/EGRESO y mapea Decimal→Money. Se creó el módulo-puerto LEAF
>   `reportes/eeff-saldos-reader.module.ts` que exporta `EEFF_SALDOS_READER_PORT`
>   (`ReportesModule` no exportaba nada) — patrón de `PeriodosReaderModule`, ciclo-safe.
> - **Config/gestión adapters self-contained**: `PrismaCierreConfigReaderAdapter` y
>   `PrismaCierreGestionReaderAdapter` leen su PROPIA superficie Prisma
>   (OrgConfiguracionContable + Organization.tipoEmpresaPrincipal; GestionFiscal +
>   períodos + comprobantes de cierre), en vez de importar el repo de
>   configuracion-contable/tenants/periodos (que NO exportan sus ports y exigirían
>   editar módulos ajenos + riesgo de ciclo). El port lo posee cierre-ejercicio; el
>   adapter lee Prisma — patrón de los adapters de `reportes` (§3.7).
> - **Idempotencia (final)**: `origenTipo` POR SLOT (`CIERRE_GASTOS`/`CIERRE_INGRESOS`/
>   `CIERRE_RESULTADO`) + `origenId=gestionId`. Calza con
>   `@@unique([organizationId, origenTipo, origenId])` SIN columna nueva (design §6 paso 1).
> - **Fecha del asiento**: el gestion reader deriva `periodoMesCierre.fechaCierre` =
>   último día calendario del mesCierre (`Date.UTC(y, m, 0)`) en infra, manteniendo
>   `new Date()` FUERA del service/domain (§4.6). == REQ-CE-07.
> - **Writer port `createdByUserId`**: la firma de B2 no lo traía pero el schema
>   exige `createdByUserId` no-nulo → se agregó a `CrearCierreData`. El adapter
>   `prisma-cierre-comprobante-writer.adapter.ts` escribe DIRECTO sobre la tabla
>   (no por `crearBorrador` de usuario). Registrado + exportado en `comprobantes.module.ts`.
> - **TX**: el service inyecta `PrismaService` solo para `$transaction`; queries por
>   ports. SKIP-on-zero por asiento; sin movimiento → `CierreSinResultadoError`.
> - **port_wiring OK, sin ciclos**: `CierreEjercicioModule` importa `ComprobantesModule`
>   + `EeffSaldosReaderModule` (leaf). El wiring en `app.module.ts` y el gate de
>   `cerrar()` quedan para Batch 5.
> - **Tests**: service unit 18/18, integration 12/12 vs Postgres real (2 tenants,
>   utilidad+pérdida, idempotencia, aislamiento, gates). tsc + lint limpios.

### 4.1 — Port `CierreSaldosReaderPort` (dueño: `cierre-ejercicio`)

- [x] Crear `backend/src/cierre-ejercicio/ports/cierre-saldos-reader.port.ts`:
  Expone lo que el servicio de cierre necesita leer:
  - `obtenerSaldosDeResultado(tenantId, desde, hasta): Promise<SaldoCuentaCierre[]>`
    — internamente delega en `EeffSaldosReaderPort.obtenerSaldosEnRango` con
    `excluirCierre=true`, filtrando solo clases INGRESO y EGRESO.
  - `obtenerEstructuraCuentasResultado(tenantId): Promise<CuentaEstructuraRow[]>`
    — delega en `EeffSaldosReaderPort.obtenerEstructuraCuentas` para resolver
    `naturaleza` y `clase` de cada cuenta (necesario para el signed-net).
  *(Interfaz mínima: no exponer métodos del port de reportes que el cierre no usa)*

### 4.2 — Adapter `EeffCierreSaldosAdapter`

- [x] Crear `backend/src/cierre-ejercicio/adapters/eeff-cierre-saldos.adapter.ts`:
  - Implementa `CierreSaldosReaderPort`.
  - Inyecta `EeffSaldosReaderPort` del módulo `reportes`.
  - `obtenerSaldosDeResultado`: llama `obtenerSaldosEnRango(..., excluirCierre=true)`,
    join con `obtenerEstructuraCuentas` para obtener `clase`/`naturaleza`, filtra
    `clase === INGRESO || clase === EGRESO`, mapea a `SaldoCuentaCierre[]`.
  - Los cálculos con `Decimal` del adapter se convierten a `Money` antes de devolver.

### 4.3 — Port `CierreConfigReaderPort` (dueño: `cierre-ejercicio`)

- [x] Crear `backend/src/cierre-ejercicio/ports/cierre-config-reader.port.ts`:
  ```typescript
  export interface CierreConfig {
    resultadoEjercicioId: string;       // transitoria (3.1.4.001)
    resultadosAcumuladosId: string;     // destino (3.1.3.001)
    tipoEmpresaPrincipal: TipoEmpresa;  // para calcularMesCierre
  }
  export abstract class CierreConfigReaderPort {
    abstract obtenerConfig(tenantId: string): Promise<CierreConfig>;
    // lanza CierreConfigCuentaFaltanteError si algún id es null
  }
  ```

- [x] Crear `backend/src/cierre-ejercicio/adapters/prisma-cierre-config-reader.adapter.ts`:
  - Lee `OrgConfiguracionContable` vía `ConfiguracionContableRepositoryPort` (cross-módulo).
  - Lee `Organization.tipoEmpresaPrincipal` vía una query directa a Prisma (o exponer un
    port mínimo desde `tenants/` si no existe — revisar si `TenantReaderPort` ya existe).
  - Lanza `CierreConfigCuentaFaltanteError` si `resultadoEjercicioId` o
    `resultadosAcumuladosId` son null/undefined.

### 4.4 — Port `CierreGestionReaderPort` (dueño: `cierre-ejercicio`)

- [x] Crear `backend/src/cierre-ejercicio/ports/cierre-gestion-reader.port.ts`:
  ```typescript
  export interface GestionParaCierre {
    id: string;
    status: GestionFiscalStatus;
    desde: FechaContable;
    hasta: FechaContable;
    periodoMesCierre: { id: string; fechaFin: FechaContable; orden: number };
    periodosCount: number;            // total períodos de la gestión
    periodosCerradosCount: number;   // para el gate REQ-CE-10
    comprobantesDecierre: Array<{    // para la idempotencia REQ-CE-09
      id: string;
      origenTipo: string;
      estado: EstadoComprobante;
      generadoPorSistema: boolean;
    }>;
  }
  export abstract class CierreGestionReaderPort {
    abstract obtenerParaCierre(gestionId: string, tenantId: string): Promise<GestionParaCierre>;
    // lanza CierreGestionNoEncontradaError si no existe/no es del tenant
  }
  ```

- [x] Crear `backend/src/cierre-ejercicio/adapters/prisma-cierre-gestion-reader.adapter.ts`
  que implementa `CierreGestionReaderPort` con una query Prisma que incluye los períodos
  y los comprobantes de cierre (filtrando por `origenTipo IN ('CIERRE_GASTOS',
  'CIERRE_INGRESOS','CIERRE_RESULTADO')`).

### 4.5 — Port `CierreComprobanteWriterPort` (dueño: `comprobantes`)

- [x] Crear `backend/src/comprobantes/ports/cierre-comprobante-writer.port.ts`
  (dueño real = módulo `comprobantes`, registrado en `comprobantes.module.ts`):
  ```typescript
  export interface CrearCierreData {
    tenantId: string;
    periodoFiscalId: string;
    fechaContable: FechaContable;
    tipo: TipoComprobante.CIERRE;       // siempre CIERRE
    glosa: string;
    origenTipo: 'CIERRE_GASTOS' | 'CIERRE_INGRESOS' | 'CIERRE_RESULTADO';
    origenId: string;                   // = gestionId
    lineas: Array<{ cuentaId: string; debito: Decimal; credito: Decimal }>;
  }
  export abstract class CierreComprobanteWriterPort {
    abstract crearBorradorSistema(data: CrearCierreData, tx?: PrismaTransaction): Promise<{ id: string }>;
    abstract eliminarBorradorSistema(comprobanteId: string, tenantId: string, tx?: PrismaTransaction): Promise<void>;
    // eliminarBorradorSistema es el path-sistema (bypassa el chequeo generadoPorSistema del service)
  }
  ```

- [x] Crear `backend/src/comprobantes/adapters/prisma-cierre-comprobante-writer.adapter.ts`:
  - `crearBorradorSistema`: escribe directamente en el repositorio de comprobantes con
    `generadoPorSistema=true`. NO pasa por `comprobantes.service` (evita la validación de
    usuario). Reusa `ComprobanteRepositoryPort` existente.
  - `eliminarBorradorSistema`: borra el comprobante en BORRADOR sin chequeo de
    `generadoPorSistema` (es el path-sistema autorizado — REQ-CMP-SYS-03).

- [x] Registrar `CierreComprobanteWriterPort` en `backend/src/comprobantes/comprobantes.module.ts`
  (provider + export) para que `CierreEjercicioModule` pueda importarlo.

### 4.6 — Servicio `CierreEjercicioService`

- [x] (RED) Crear `backend/src/cierre-ejercicio/cierre-ejercicio.service.spec.ts` con tests
  unitarios (mocks de todos los ports, NUNCA Prisma, §7.8):
  - *Generar exitoso*: saldos con INGRESO y EGRESO, 11 períodos cerrados, mesCierre abierto →
    crea 3 comprobantes en TX, `origenTipo` por slot, `generadoPorSistema=true`.
  - *SKIP-on-zero #1*: sin cuentas EGRESO → crea solo #2 y #3.
  - *SKIP-on-zero #3*: resultado 0 → crea #1 y #2, no crea #3.
  - *Sin ningún movimiento de resultado*: lanza `CierreSinResultadoError`.
  - *Gate períodos*: mesCierre CERRADO → lanza `CierrePeriodoNoListoError`.
  - *Gate períodos*: período previo ABIERTO → lanza `CierrePeriodoNoListoError`.
  - *Gestión CERRADA*: → lanza `CierreGestionCerradaError`.
  - *Gestión no encontrada*: → lanza `CierreGestionNoEncontradaError`.
  - *Config cuentas faltante*: → lanza `CierreConfigCuentaFaltanteError`.
  - *Idempotencia — todos BORRADOR*: borra los 3 previos (writer) y recrea.
  - *Idempotencia — alguno CONTABILIZADO*: → lanza `CierreYaParcialmenteContabilizadoError`.
  - *Fecha del asiento*: empresa COMERCIAL mesCierre=12, período diciembre 2026 →
    `fechaContable="2026-12-31"`.
  - *Fecha del asiento*: empresa AGROPECUARIA mesCierre=6, período junio 2026 →
    `fechaContable="2026-06-30"`.
  - *Preview*: `obtenerEstadoCierre` devuelve los comprobantes existentes sin generarlos.

- [x] (GREEN) Crear `backend/src/cierre-ejercicio/cierre-ejercicio.service.ts`
  orquestando los ports:
  1. Leer gestión (reader) → validar existencia, status CERRADA, gate períodos.
  2. Leer config → obtener `resultadoEjercicioId`, `resultadosAcumuladosId`, `tipoEmpresa`.
  3. `calcularMesCierre(tipoEmpresa)` → derivar fecha = último día del mes en el año
     del período `ordenEnGestion=12` (usar `ClockPort` o `FechaContable` puro).
  4. Chequeo de idempotencia: si existen cierres, decidir regenerar o rechazar.
  5. Leer saldos INGRESO/EGRESO con `excluirCierre=true`.
  6. Llamar builders puros → `AsientoCierre[]`.
  7. En 1 TX: `eliminarBorradorSistema` de los previos (si regenerando) + `crearBorradorSistema`
     de los nuevos (≤3, con SKIP-on-zero).
  8. Para preview: `obtenerEstadoCierre(gestionId, tenantId)` → retornar los comprobantes
     existentes del lector.

### 4.7 — Test de integración del servicio (REQ-CE-12, 2 tenants)

- [x] (RED) Crear `backend/src/cierre-ejercicio/cierre-ejercicio.service.integration.spec.ts`
  (Postgres real, 2 tenants, §7.2):
  - Semilla: 2 orgs, cada una con una gestión, plan de cuentas, movimientos en INGRESO/EGRESO.
  - Genera los 3 borradores → verifica `generadoPorSistema=true`, `origenTipo` por slot,
    tipo CIERRE, fecha=mesCierre.
  - Re-invoca la generación (idempotencia) → verifica que los borradores se reconstruyen,
    no se duplican (constraint `@@unique` no viola).
  - Con uno CONTABILIZADO → rechaza con `CierreYaParcialmenteContabilizadoError`.
  - Aislamiento: tenant B no puede generar el cierre de la gestión de A.
  - Enforcement Batch 2: intentar `actualizarBorrador`/`eliminarBorrador` de un cierre
    (vía `comprobantes.service`) → errores correctos.
  - Anular con gestión ABIERTA → OK. Anular con gestión CERRADA → `CierreGestionCerradaError`.

- [x] (GREEN) Tests de integración verdes contra Postgres real:
  ```
  cd backend && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
    pnpm exec jest src/cierre-ejercicio/ --testPathPattern="integration.spec"
  ```

---

## Batch 5 — Gate en `cerrar()` + Endpoint + RBAC + Módulo NestJS + E2E

> **Precondición**: Batch 4 completo.
> **Parallelizable con**: nada (este batch completa el flujo end-to-end).

### 5.1 — Gate en `GestionesFiscalesService.cerrar()` (REQ-GF-CIERRE-01)

- [x] (RED) En `backend/src/periodos-fiscales/gestiones-fiscales.service.spec.ts` (si existe)
  o en un nuevo spec de integración, agregar escenarios:
  - *(−)* `cerrar()` con los 3 cierres en BORRADOR → lanza
    `CierreYaParcialmenteContabilizadoError` (el gate bloquea).
  - *(−)* `cerrar()` con #1 CONTABILIZADO y #2/#3 en BORRADOR → igual.
  - *(+)* `cerrar()` con los 3 cierres CONTABILIZADO y 12 períodos CERRADO → OK.
  - *(+)* `cerrar()` con SKIP-on-zero (solo #2 y #3 generados, ambos CONTABILIZADO) → OK.
  - *(+)* `cerrar()` sin ningún cierre generado (la gestión no tiene INGRESO/EGRESO,
    no se generaron cierres) → OK (no se exige cierre si no se generó ninguno).

- [x] (GREEN) En `backend/src/periodos-fiscales/gestiones-fiscales.service.ts`, método
  `cerrar()`, agregar antes de la lógica de cierre actual:
  ```typescript
  // REQ-GF-CIERRE-01: si la gestión tiene cierres generados, todos deben estar CONTABILIZADO.
  const cierresExistentes = await this.repo.obtenerCierresDeGestion(tenantId, id);
  const hayBorradores = cierresExistentes.some(c => c.estado !== EstadoComprobante.CONTABILIZADO);
  if (cierresExistentes.length > 0 && hayBorradores) {
    throw new CierreYaParcialmenteContabilizadoError();
  }
  ```
  *(Agregar `obtenerCierresDeGestion` al port `GestionFiscalRepositoryPort` si no existe,
  o derivar vía `ComprobanteRepositoryPort` — elegir la ruta más simple)*

### 5.2 — DTOs de respuesta del cierre

- [x] Crear `backend/src/cierre-ejercicio/dto/cierre-response.dto.ts`:
  - `CierreComprobanteDto`: `id`, `origenTipo`, `estado`, `fechaContable (string YYYY-MM-DD)`,
    `numero?: string`, `lineas[]` con `cuentaId`, `debito (string 2dec)`, `credito (string 2dec)`.
  - `CierreEjercicioResponseDto`: `gestionId`, `cierres: CierreComprobanteDto[]`, `generadoEn`.
  - Decoradores `@ApiProperty` en todos los campos (§10.10 contrato OpenAPI).
  - Mapper `toCierreEjercicioResponse(...)` que convierte Money→string, Date→`YYYY-MM-DD`.

### 5.3 — Controller `CierreEjercicioController`

- [x] Crear `backend/src/cierre-ejercicio/cierre-ejercicio.controller.ts`:
  - Montar el controller delegado desde `gestiones-fiscales.controller.ts` vía importar
    el módulo de cierre e inyectar `CierreEjercicioService`. El controller propio maneja
    las rutas `/gestiones/:id/cierre`:
    - `POST /api/gestiones/:id/cierre` — `@RequirePermissions('contabilidad.gestiones.cerrar')`
    - `GET /api/gestiones/:id/cierre` — `@RequirePermissions('contabilidad.gestiones.read')`
  - Ambas rutas con `@RequireModule('contabilidad')` (a nivel de clase o en el módulo padre).
  - `@ApiOkResponse({ type: CierreEjercicioResponseDto })` + `@ApiCreatedResponse` para POST.

  > Estrategia de montaje: agregar los 2 métodos al `GestionesFiscalesController` existente
  > (inyectando `CierreEjercicioService` en ese controller) para no fragmentar la ruta
  > `/gestiones/:id` — tal como indica el design §10. Si el controller ya está muy grande,
  > crear un controller propio y registrarlo en el mismo módulo.

### 5.4 — Módulo NestJS `CierreEjercicioModule`

- [x] Crear `backend/src/cierre-ejercicio/cierre-ejercicio.module.ts`:
  - Providers: `CierreEjercicioService`, los adapters de los 4 ports propios.
  - Imports: `ReportesModule` (o `ReportesReaderModule`) para `EeffSaldosReaderPort`;
    `ConfiguracionContableModule`; `ComprobantesModule` para `CierreComprobanteWriterPort`;
    `PeriodosFiscalesModule` (o `PeriodsReaderModule`) para `CierreGestionReaderPort`.
  - Exports: `CierreEjercicioService` (para que `PeriodosFiscalesModule` lo consuma en el gate).

- [x] Importar `CierreEjercicioModule` en `backend/src/app.module.ts`.

- [x] Importar `CierreEjercicioModule` (o solo el service) en
  `backend/src/periodos-fiscales/periodos-fiscales.module.ts` para poder inyectar
  `CierreEjercicioService` en `GestionesFiscalesService` o `GestionesFiscalesController`.
  *(Verificar que no haya ciclo: el módulo de cierre importa periodos, y periodos importa
  cierre — si hay ciclo, resolver con forwardRef o extrayendo el gate a un método del
  propio módulo de cierre que `cerrar()` llame vía event / port)*

### 5.5 — Tests E2E (REQ-CE-14, REQ-CE-12, REQ-GF-CIERRE-01)

- [x] (RED) Crear `backend/test/cierre-ejercicio.e2e-spec.ts` con los escenarios HTTP:
  - Flujo feliz: POST → 201 con 3 cierres en BORRADOR; verificar `generadoPorSistema=true`.
  - GET preview → 200 con los 3 cierres.
  - Contabilizar los 3 vía endpoint existente `POST /api/asientos/:id/contabilizar`.
  - Cerrar la gestión vía `POST /api/gestiones/:id/cerrar` → 200.
  - RBAC: sin `contabilidad.gestiones.cerrar` → 403 en el POST de cierre.
  - Módulo: vertical granja → 403/404 del `ModuleEnabledGuard`.
  - Gate cerrar gestión con cierres en BORRADOR → 409 `CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO`.
  - Aislamiento multi-tenant (2 apps, 2 JWTs): usuario de tenant B no puede ver/generar
    el cierre de la gestión de A.
  - Regeneración: POST dos veces → segundo set reemplaza el primero, sin duplicados.
  - Gestión ya CERRADA → 409 `CIERRE_EJERCICIO_GESTION_YA_CERRADA`.
  - Gestión inexistente → 404 `CIERRE_EJERCICIO_GESTION_NO_ENCONTRADA`.

- [x] (GREEN) E2E verdes:
  ```
  cd backend && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
    JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" \
    pnpm exec jest test/cierre-ejercicio.e2e-spec.ts --runInBand --forceExit
  ```

---

## Batch 6 — Regresión de cuadre de reportes (REQ-CE-16)

> **Precondición**: Batch 4 completo (el servicio de cierre puede generar y contabilizar
>   comprobantes). Puede correr en paralelo con Batch 5.
> **Parallelizable con**: Batch 5.

### 6.1 — Suite de integración `cierre-reportes-cuadre`

- [x] (RED) Crear `backend/src/cierre-ejercicio/cierre-reportes-cuadre.integration.spec.ts`
  (Postgres real, 2 tenants) con los 4 invariantes de REQ-CE-16 para caso utilidad y pérdida:

  **Setup**: semilla con gestión completa (cuentas INGRESO/EGRESO con movimientos reales),
  snapshot de los 6 reportes ANTES de contabilizar los cierres.

  - **Invariante 1 — ER operativo invariante**: ER de la gestión con `excluirCierre=true`
    reporta el resultado `R` ANTES y DESPUÉS de contabilizar los 3 cierres (idéntico ±Bs 0.01).
  - **Invariante 2 — Patrimonio del BG conservado**: `patrimonioTotal(BG a fecha mesCierre)`
    es idéntico antes y después del cierre (±Bs 0.01); la línea sintética "Resultado del
    Ejercicio" pasa de `R` a ≈0; RESULTADOS ACUMULADOS crece/reduce en `|R|`.
  - **Invariante 3 — RA no se duplica**: `RA(inicio gestión G+1) === RA(fin G previo) + R`
    (solo una vez; G+1 se simula como saldo inicial de RA un día después de mesCierre).
  - **Invariante 4 — EEPN cuadra**: el traslado #3 aparece en `otrosMovimientos` del EEPN
    y el `saldoFinal` cuadra con `saldoInicial + Σmovimientos`.

  Ambos casos (utilidad y pérdida) en la misma suite. Los servicios de reportes se
  inyectan directamente en el test (no vía HTTP) para minimizar boilerplate.

- [x] (GREEN) La suite verde confirma que la decisión C (no tocar el contrato
  `excluirCierre`) es correcta y que los 4 invariantes se preservan con datos reales.

---

## Batch de Cierre — OpenAPI + typecheck + lint + verificación final

> **Precondición**: todos los batches anteriores completos.

### C.1 — OpenAPI regenerado

- [ ] `cd backend && pnpm run openapi:dump` → regenerar `backend/openapi.json`.
- [ ] `cd frontend && pnpm run gen:api-types` → regenerar `frontend/src/types/api.generated.ts`.
- [ ] Agregar aliases en `frontend/src/types/api.ts` para los tipos nuevos si los hay
  (p.ej. `CierreEjercicioResponse`, `CierreComprobanteDto`).
- [ ] Commitear ambos artefactos (el job CI `contract-drift` rompe ante drift, §10.10).

### C.2 — Typecheck y lint limpios

- [ ] `cd backend && pnpm exec tsc --noEmit -p tsconfig.json` → 0 errores.
- [ ] `cd backend && pnpm run lint` → 0 errores.
- [ ] `cd frontend && pnpm exec tsc -b` → 0 errores (tras regenerar tipos).

### C.3 — Todos los tests verdes

- [ ] Unit + integración backend:
  ```
  cd backend && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
    pnpm exec jest src/
  ```
- [ ] E2E backend:
  ```
  cd backend && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
    JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" \
    pnpm exec jest test/ --runInBand --forceExit
  ```
- [ ] E2E de regresión de reportes (correr suite completa para verificar no-regresión):
  verificar que las suites de `balance-comprobacion`, `estado-resultados`,
  `hoja-trabajo`, `balance-general`, `evolucion-patrimonio` y `estado-flujo-efectivo`
  siguen verdes con los comprobantes CIERRE presentes en la BD de test.

### C.4 — Commits convencionales (scope por módulo, §9.1)

Orden sugerido de commits (uno por batch o por archivo significativo):

```
feat(db): agregar columna generadoPorSistema en Comprobante y migración de seed cuentas
feat(comprobante): bloquear edición/borrado/edit-contabilizado de comprobantes generados-por-sistema
feat(cierre): dominio puro — signed-net y builders de cierre del ejercicio
feat(cierre): ports, adapters y servicio de orquestación del cierre
feat(cierre): endpoint POST/GET /api/gestiones/:id/cierre y módulo NestJS
feat(gestion-fiscal): gate en cerrar() — exige cierres CONTABILIZADO si existen
test(cierre): regresión de cuadre de reportes antes/después del cierre
chore: regenerar openapi.json y api.generated.ts
```

---

## Resumen de dependencias entre batches

```
Batch 1 (schema + seed)
    └── Batch 2 (enforcement comprobantes) ──┐
                                              ├── Batch 3 (dominio puro)
                                              └── Batch 4 (ports + service) ──┬── Batch 5 (controller + e2e)
                                                                                └── Batch 6 (regresión reportes)
                                                                                        └── Batch Cierre
```

Batch 3 y Batch 4 pueden ejecutarse EN PARALELO por sub-agentes distintos después de que
Batch 2 haya terminado, con esta división:
- Sub-agente A: Batch 3 (solo dominio puro, sin Prisma, sin NestJS).
- Sub-agente B: Batch 4 tareas 4.1–4.5 (definir ports y adapters; puede arrancar sin esperar el dominio
  del batch 3, aunque los tests de integración 4.7 sí esperan el Batch 3 completo).

Batch 5 y Batch 6 pueden ejecutarse EN PARALELO después de que Batch 4 esté completo.

---

## Tabla de archivos nuevos y modificados

| Archivo | Acción | Batch |
|---------|--------|-------|
| `backend/prisma/schema.prisma` | MOD (campo `generadoPorSistema`) | 1 |
| `backend/prisma/migrations/<ts>_cierre_resultado_gestion/migration.sql` | NUEVO | 1 |
| `backend/src/cuentas/adapters/seed/comercial.ts` | MOD (rename 3.1.4.001, delete 3.1.4.002) | 1 |
| `backend/src/cuentas/adapters/seed/comercial.integration.spec.ts` | MOD (test no-3.1.4.002) | 1 |
| `backend/src/comprobantes/domain/comprobante-errors.ts` | MOD (2 errores nuevos) | 2 |
| `backend/src/comprobantes/domain/comprobante-errors.spec.ts` | MOD (tests errores) | 2 |
| `backend/src/comprobantes/comprobantes.service.ts` | MOD (3 bloqueos + anulación) | 2 |
| `backend/src/comprobantes/comprobantes.service.spec.ts` | MOD (escenarios + y −) | 2 |
| `backend/src/periodos-fiscales/ports/gestion-status-reader.port.ts` | NUEVO | 2 |
| `backend/src/periodos-fiscales/adapters/prisma-gestion-status-reader.adapter.ts` | NUEVO | 2 |
| `backend/src/periodos-fiscales/periodos-fiscales.module.ts` | MOD (registrar/exportar port) | 2 |
| `backend/src/comprobantes/comprobantes.module.ts` | MOD (importar port de gestión) | 2 |
| `backend/src/cierre-ejercicio/domain/cierre-errors.ts` | NUEVO | 3 |
| `backend/src/cierre-ejercicio/domain/cierre-errors.spec.ts` | NUEVO | 3 |
| `backend/src/cierre-ejercicio/domain/signed-net.ts` | NUEVO | 3 |
| `backend/src/cierre-ejercicio/domain/signed-net.spec.ts` | NUEVO | 3 |
| `backend/src/cierre-ejercicio/domain/cierre-builders.ts` | NUEVO | 3 |
| `backend/src/cierre-ejercicio/domain/cierre-builders.spec.ts` | NUEVO | 3 |
| `backend/src/cierre-ejercicio/ports/cierre-saldos-reader.port.ts` | NUEVO | 4 |
| `backend/src/cierre-ejercicio/ports/cierre-config-reader.port.ts` | NUEVO | 4 |
| `backend/src/cierre-ejercicio/ports/cierre-gestion-reader.port.ts` | NUEVO | 4 |
| `backend/src/cierre-ejercicio/adapters/eeff-cierre-saldos.adapter.ts` | NUEVO | 4 |
| `backend/src/cierre-ejercicio/adapters/prisma-cierre-config-reader.adapter.ts` | NUEVO | 4 |
| `backend/src/cierre-ejercicio/adapters/prisma-cierre-gestion-reader.adapter.ts` | NUEVO | 4 |
| `backend/src/comprobantes/ports/cierre-comprobante-writer.port.ts` | NUEVO | 4 |
| `backend/src/comprobantes/adapters/prisma-cierre-comprobante-writer.adapter.ts` | NUEVO | 4 |
| `backend/src/comprobantes/comprobantes.module.ts` | MOD (registrar writer port) | 4 |
| `backend/src/cierre-ejercicio/cierre-ejercicio.service.ts` | NUEVO | 4 |
| `backend/src/cierre-ejercicio/cierre-ejercicio.service.spec.ts` | NUEVO | 4 |
| `backend/src/cierre-ejercicio/cierre-ejercicio.service.integration.spec.ts` | NUEVO | 4 |
| `backend/src/periodos-fiscales/gestiones-fiscales.service.ts` | MOD (gate en cerrar()) | 5 |
| `backend/src/periodos-fiscales/gestiones-fiscales.service.spec.ts` | MOD (escenarios gate) | 5 |
| `backend/src/cierre-ejercicio/dto/cierre-response.dto.ts` | NUEVO | 5 |
| `backend/src/cierre-ejercicio/cierre-ejercicio.controller.ts` | NUEVO | 5 |
| `backend/src/cierre-ejercicio/cierre-ejercicio.module.ts` | NUEVO | 5 |
| `backend/src/app.module.ts` | MOD (importar módulo cierre) | 5 |
| `backend/test/cierre-ejercicio.e2e-spec.ts` | NUEVO | 5 |
| `backend/src/cierre-ejercicio/cierre-reportes-cuadre.integration.spec.ts` | NUEVO | 6 |
| `backend/openapi.json` | REGEN | Cierre |
| `frontend/src/types/api.generated.ts` | REGEN | Cierre |
| `frontend/src/types/api.ts` | MOD (aliases) | Cierre |
