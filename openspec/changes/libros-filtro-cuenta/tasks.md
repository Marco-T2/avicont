# Tasks: libros-filtro-cuenta — Filtro por Cuenta en Libro Diario y Libro Mayor

> Strict TDD Mode: RED → GREEN por tarea de implementación.
> Sin migración — cero cambios en `schema.prisma`. El índice
> `@@index([organizationId, cuentaId])` sobre `lineas_comprobante` ya existe.
>
> **Estrategia de PRs**: 3 PRs independientes en este orden:
> - **PR A** `feat(reportes): filtro-cuenta mayor frontend` — Fase 1 (quick win).
> - **PR B** `feat(reportes): filtro-cuenta diario backend` — Fases 2-5.
> - **PR C** `feat(reportes-ui): filtro-cuenta diario frontend` — Fases 6-7.
>
> PR A puede ir a main sin bloquear al resto; PR C depende de PR B (tipos del backend).
>
> **Scopes de commit**: `reportes` para cambios de backend; `reportes-ui` para
> cambios de frontend puro; si una tarea toca ambos, usar el scope del cambio dominante.

---

## Fase 0 — Setup y baseline

- [x] 0.1 **[setup]** Crear branch `feat/reportes-mayor-filtro-cuenta-ui` desde `main`.
  Ejecutar suite completa para confirmar baseline verde:
  ```bash
  # Backend — desde backend/
  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" \
    pnpm exec jest src/ --runInBand
  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" \
    JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" \
    pnpm exec jest test/ --runInBand --forceExit
  pnpm exec tsc --noEmit -p tsconfig.json
  pnpm run lint
  # Frontend — desde frontend/
  pnpm exec tsc -b
  pnpm exec vitest run
  ```
  **Criterio de entrada**: todo verde. Si hay rojo pre-existente, reportar antes de continuar.
  > Precondición del change.

---

## Fase 1 — Frontend Mayor: cablear `cuentaId` (PR A — quick win)

> Este bloque cierra la deuda explícita en `libro-mayor-page.tsx:22-26`.
> Backend ya soporta `cuentaId`: el port, el service y el adapter existen y están verdes.
> Solo falta el cableado en la UI.

- [x] 1.1 **[RED vitest]** Crear `frontend/src/features/libro-mayor/schemas/libro-mayor-filtro-schema.test.ts`
  — **agregar casos** al archivo de test existente (que ya existe; NO reemplazar):
  - Modo `periodo`: con `cuentaId` UUID válido → schema lo acepta y lo preserva en output.
  - Modo `periodo`: con `cuentaId` string vacío → schema rechaza (si se opta por validación mínima)
    O lo acepta como ausente (si es opcional sin restricción en schema). Definir la regla antes
    de implementar: **`cuentaId` es opcional en schema, pasa a través sin validación de formato** —
    el backend valida `@IsUUID`.
  - Modo `rango`: con `cuentaId` → acepta igual.
  - Sin `cuentaId` → comportamiento idéntico al pre-change (los casos existentes NO deben romperse).
  > Spec: Capability `libro-mayor` — nota UI.

- [x] 1.2 **[GREEN]** Modificar `frontend/src/features/libro-mayor/schemas/libro-mayor-filtro-schema.ts`:
  - Agregar `cuentaId: z.string().optional()` a AMBAS ramas del `discriminatedUnion`
    (`modo: 'periodo'` y `modo: 'rango'`).
  - El campo no tiene validación de UUID en el schema del formulario — se delega al backend.
    Razón: el `CuentaAutocomplete` siempre entrega un UUID válido o string vacío; la validación
    dura ya ocurre en el backend.
  - `LibroMayorFiltroValues` se actualiza automáticamente vía `z.output<typeof libroMayorFiltroSchema>`.
  > Spec: Capability `libro-mayor` — nota UI.

  _Commit sugerido_: `feat(reportes-ui): agregar cuentaId al schema de filtros del Libro Mayor`

- [x] 1.3 **[RED vitest]** Crear
  `frontend/src/features/libro-mayor/components/libro-mayor-filtros.test.tsx`:
  - render del componente con `usePeriodos` mockeado.
  - El `CuentaAutocomplete` está presente en el DOM (buscar por placeholder o label).
  - Al seleccionar una cuenta (simular `onChange` del autocomplete), el valor interno del
    formulario se actualiza (spy en el callback `onBuscar`).
  - Sin cuenta seleccionada → `onBuscar` se llama sin `cuentaId` (o con `cuentaId: undefined`).
  - Con cuenta seleccionada → `onBuscar` incluye el UUID en `cuentaId`.
  > Spec: Capability `libro-mayor` — nota UI.

- [x] 1.4 **[GREEN]** Modificar
  `frontend/src/features/libro-mayor/components/libro-mayor-filtros.tsx`:
  - Agregar campo `cuentaId` al `formSchema` plano del componente (opcional, `z.string().default('')`).
  - Agregar `cuentaId` al `defaultValues` (`''` como vacío).
  - Agregar el control `CuentaAutocomplete` en la fila de filtros (cross-feature, importar de
    `@/features/comprobantes/components/cuenta-autocomplete`).
  - Comentario cross-feature obligatorio (CLAUDE.md frontend §14.6):
    ```tsx
    // Cross-feature: reutilizamos CuentaAutocomplete de comprobantes — filtra
    // cuentas de detalle activas con pageSize 100.
    ```
  - En `handleSubmitInternal`: extraer `cuentaId` de `raw.cuentaId`; si es string vacío no
    pasarlo (spread condicional por `exactOptionalPropertyTypes`):
    ```tsx
    ...(raw.cuentaId !== '' ? { cuentaId: raw.cuentaId } : {})
    ```
  - Label en español: `Cuenta (opcional)`.
  - Accesibilidad: `<Label htmlFor="mayor-cuenta">` + `id` pasado al autocomplete
    (si el componente lo soporta) o wrapper con `aria-label`.
  > Spec: Capability `libro-mayor` — nota UI.

  _Commit sugerido_: `feat(reportes-ui): CuentaAutocomplete en filtros del Libro Mayor`

- [x] 1.5 **[GREEN]** Modificar
  `frontend/src/features/libro-mayor/pages/libro-mayor-page.tsx`:
  - En `handleBuscar`: agregar `...(values.cuentaId !== undefined ? { cuentaId: values.cuentaId } : {})`
    en AMBAS ramas del if (modo `periodo` y modo `rango`). Spread condicional obligatorio
    por `exactOptionalPropertyTypes` (CLAUDE.md §2.5.1).
  - Cerrar la deuda documentada en `libro-mayor-page.tsx:22-26` (remover el comentario de deuda).
  - `tieneParams` no cambia — el filtro de cuenta es opcional, no determina si hay búsqueda activa.
  > Spec: Capability `libro-mayor` — nota UI.

  _Commit sugerido_: `feat(reportes-ui): cablear cuentaId en handleBuscar del Libro Mayor (cierra deuda)`

- [x] 1.6 **[verde PR A]** Typecheck + vitest frontend:
  ```bash
  # Frontend — desde frontend/
  pnpm exec tsc -b
  pnpm exec vitest run
  ```
  Todo verde. Sin regresiones en los tests del Mayor existentes (`libro-mayor-tabla.test.tsx`).
  Abrir PR A, mergear con squash a `main`.

---

## Fase 2 — Backend Diario: errores de dominio nuevos

> Empieza el branch `feat/reportes-filtro-cuenta-diario-backend` (desde `main` post-PR A).

- [x] 2.1 **[RED unit]** Ampliar `backend/src/reportes/domain/libro-diario-errors.spec.ts`
  — agregar describe anidado `'errores de cuenta'` al final:
  - `CuentaNoEncontradaError` → `httpStatus 404`, `code 'LIBRO_DIARIO_CUENTA_NO_ENCONTRADA'`,
    `details.cuentaId` presente.
  - `CuentaNoDetalleError` → `httpStatus 400`, `code 'LIBRO_DIARIO_CUENTA_NO_DETALLE'`,
    `details.cuentaId` presente.
  - Ambas deben ser instancias de `NotFoundError` / `ValidationError` respectivamente
    (espejando el patrón de `libro-mayor-errors.ts`).
  > REQ-LD-13, REQ-LD-14.

- [x] 2.2 **[GREEN]** Ampliar `backend/src/reportes/domain/libro-diario-errors.ts`
  — agregar al final del archivo:
  ```typescript
  // ============================================================
  // 404 — cuenta no encontrada (REQ-LD-13)
  // ============================================================

  /**
   * El cuentaId no existe o no pertenece al tenant activo.
   * Defense in depth (CLAUDE.md §4.2): no distinguir inexistente de otro tenant.
   */
  export class CuentaNoEncontradaError extends NotFoundError {
    constructor(cuentaId: string) {
      super('LIBRO_DIARIO_CUENTA_NO_ENCONTRADA', ...);
    }
  }

  // ============================================================
  // 400 — cuenta agrupadora (REQ-LD-14)
  // ============================================================

  /**
   * La cuenta no es de detalle (esDetalle=false).
   * Las cuentas agrupadoras no tienen líneas directas en lineas_comprobante.
   * Código de Comercio art. 36: el plan analítico distingue cuentas de detalle
   * de cuentas de agrupación — solo las primeras tienen movimientos directos.
   */
  export class CuentaNoDetalleError extends ValidationError {
    constructor(cuentaId: string) {
      super('LIBRO_DIARIO_CUENTA_NO_DETALLE', ...);
    }
  }
  ```
  Códigos estables: `LIBRO_DIARIO_CUENTA_NO_ENCONTRADA` (404), `LIBRO_DIARIO_CUENTA_NO_DETALLE` (400).
  > REQ-LD-13, REQ-LD-14.

  _Commit sugerido_: `feat(reportes): CuentaNoEncontradaError + CuentaNoDetalleError en libro-diario-errors`

---

## Fase 3 — Backend: leaf `CuentasReaderModule` (lookup de cuenta del dominio)

> Decisión D1/D2 (design): el lookup de cuenta NO se mete en `ComprobantesReaderPort` (opción d,
> descartada — duplicaba el `findFirst` del Mayor y contaminaba el port de comprobantes) NI se
> reutiliza el port del Mayor (opción b, descartada — mentira semántica en el DI). Se crea un leaf
> module honesto del dominio Cuenta, espejo EXACTO de `PeriodosReaderModule`. En este change el
> Mayor NO se migra (deuda D1).
>
> ⚠️ El integration spec de la tarea 3.3 **requiere Postgres** (`docker compose up -d postgres`).

- [x] 3.1 **[GREEN — forma]** Crear `backend/src/cuentas/ports/cuentas-reader-lookup.port.ts`:
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
     * Filtra por organizationId — una cuenta de otro tenant devuelve `null`
     * (Anti-31: no distingue inexistente de ajena, no enumera ids).
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
  - Nombre `CuentasReaderLookupPort` / `CUENTAS_READER_LOOKUP_PORT` (sufijo `Lookup`) para NO
    colisionar con el `CuentasReaderPort` / `CUENTAS_READER_PORT` existente (el del `obtenerBatch`).
  - JSDoc obligatorio (port = contrato público, §2.3 CLAUDE.md).
  > REQ-LD-13, REQ-LD-14: contrato de validación de cuenta.

- [x] 3.2 **[GREEN — forma]** Crear
  `backend/src/cuentas/adapters/prisma-cuentas-reader-lookup.adapter.ts`:
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
  - `findFirst` (no `findUnique`) para filtrar por dos campos sin asumir índice compuesto único.
  - `override` obligatorio (`noImplicitOverride`, §2.5.1).
  > REQ-LD-13, REQ-LD-14.

- [x] 3.3 **[RED integration]** Crear
  `backend/src/cuentas/adapters/prisma-cuentas-reader-lookup.adapter.integration.spec.ts`
  (Postgres real, TX por test, NUNCA mockear Prisma §7.8):
  - Cuenta de detalle del tenant → `{ id, esDetalle: true }`.
  - Cuenta agrupadora del tenant → `{ id, esDetalle: false }`.
  - UUID inexistente → `null`.
  - **CRÍTICO multi-tenant (§4.2):** cuenta de OTRO tenant → `null` (Anti-31, no enumera ids ajenos).
  > REQ-LD-13, REQ-LD-14.

- [x] 3.4 **[GREEN — forma]** Crear `backend/src/cuentas/cuentas-reader.module.ts` (espejo EXACTO de
  `backend/src/periodos-fiscales/periodos-reader.module.ts`):
  ```typescript
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
  - Comentario de cabecera justificando el leaf (evita ciclo CJS prod, igual que `PeriodosReaderModule`).
  > Decisión D2.

- [x] 3.5 **[GREEN — forma]** Modificar `backend/src/reportes/reportes.module.ts`:
  - Agregar `CuentasReaderModule` a `imports` (junto a `PeriodosReaderModule` y `RbacModule`).
  - **NO** importar `CuentasModule` (riesgo de ciclo CJS, memoria `prod-build-crash-ciclos`).
  - `ComprobantesReaderPort` y `LibroMayorReaderPort` NO se tocan.
  > Decisión D2.

- [x] 3.6 **[GREEN — forma]** Ampliar `backend/src/reportes/dto/libro-diario-query.dto.ts`:
  - Agregar campo:
    ```typescript
    @IsOptional()
    @IsUUID('4')
    cuentaId?: string;
    ```
  - Poner debajo de `incluirAnulados` (último campo, alfabéticamente coherente).
  - JSDoc: "UUID de la cuenta. Si se pasa, solo asientos con al menos una línea en esa cuenta."
  - Sin default: `undefined` cuando no viene (espeja patrón del Mayor en `libro-mayor-query.dto.ts`).
  > REQ-LD-12: validación de forma en DTO; la regla de negocio en el service.

- [x] 3.7 **[GREEN — forma]** Ampliar
  `backend/src/reportes/ports/comprobantes-reader.port.ts`:
  - Agregar SOLO `cuentaId?: string` a `LibroDiarioFiltros` (NO se agrega método de lookup — el
    port sigue leyendo solo comprobantes; el lookup vive en el leaf `CuentasReaderLookupPort`):
    ```typescript
    export interface LibroDiarioFiltros {
      fechaDesde: Date;
      fechaHasta: Date;
      incluirAnulados: boolean;
      /** UUID de cuenta de detalle. Si presente, solo asientos con ≥1 línea en esa cuenta. */
      cuentaId?: string;
    }
    ```
  > REQ-LD-12: contrato del filtro del adapter.

  _Commit sugerido_: `feat(reportes): leaf CuentasReaderModule + cuentaId en query/filtros del Diario`

---

## Fase 4 — Backend Diario: Service (validación de cuenta)

> Modificar el service existente, NO crearlo de cero.

- [x] 4.1 **[RED unit]** Ampliar `backend/src/reportes/libro-diario.service.spec.ts`
  — agregar describe anidado `'validación de cuenta (REQ-LD-12..16)'`:

  **Helpers adicionales necesarios**:
  - Nuevo mock `makeCuentasReaderLookupMock()` → `{ obtenerCuentaDetalle: jest.fn() }` tipado como
    `jest.Mocked<CuentasReaderLookupPort>` (el lookup NO va en el mock de comprobantes — vive en su
    propio port). Registrar el provider `CUENTAS_READER_LOOKUP_PORT` en el `TestingModule`.
  - Helper `makeCuentaDetalle(overrides = {})` → `{ id: 'cuenta-1', esDetalle: true, ...overrides }`.

  **Casos RED — cuenta inexistente / otro tenant (REQ-LD-13)**:
  - `obtenerCuentaDetalle` devuelve `null` → lanza `CuentaNoEncontradaError` (404).
  - Verificar que `contarAsientos` NO fue llamado (corto-circuito antes del tope).

  **Casos RED — cuenta agrupadora (REQ-LD-14)**:
  - `obtenerCuentaDetalle` devuelve `{ id: '...', esDetalle: false }` → lanza `CuentaNoDetalleError` (400).
  - Verificar que `contarAsientos` NO fue llamado.

  **Caso RED — cuenta de detalle válida (REQ-LD-12)**:
  - `obtenerCuentaDetalle` devuelve `{ id: '...', esDetalle: true }`.
  - `contarAsientos` es llamado con filtros que incluyen `cuentaId`.
  - `obtenerAsientosParaLibroDiario` es llamado con filtros que incluyen `cuentaId`.
  - El resultado es el DTO mapeado (mismo que sin filtro de cuenta).

  **Caso RED — sin cuentaId (regresión REQ-LD-12)**:
  - Query sin `cuentaId` → `obtenerCuentaDetalle` NO es llamado.
  - `contarAsientos` es llamado con filtros sin `cuentaId` (comportamiento pre-change idéntico).
  - El resultado es el DTO mapeado sin filtro de cuenta.

  **Caso RED — tope defensivo con cuentaId (REQ-LD-16)**:
  - `obtenerCuentaDetalle` retorna cuenta válida.
  - `contarAsientos` retorna valor por encima del tope (inyectado reducido).
  - Lanza `RangoExcedeLimiteError` (422).
  - Cuenta filtrada con pocos asientos (bajo tope) → NO lanza 422.
  > REQ-LD-12, REQ-LD-13, REQ-LD-14, REQ-LD-16.

- [x] 4.2 **[GREEN]** Modificar `backend/src/reportes/libro-diario.service.ts`:
  - Inyectar el nuevo port en el constructor (port HONESTO del dominio Cuenta — sin mentira de tipo):
    ```typescript
    @Inject(CUENTAS_READER_LOOKUP_PORT)
    private readonly cuentasReader: CuentasReaderLookupPort,
    ```
  - Agregar `cuentaId?: string` al shape del parámetro `query` de `consultarLibroDiario`.
  - Antes del paso 3 (tope defensivo), agregar paso 2.5:
    ```typescript
    // ── 2.5. Validación de cuenta (REQ-LD-12..14) ───────────────────────────
    if (query.cuentaId !== undefined) {
      const cuenta = await this.cuentasReader.obtenerCuentaDetalle(
        tenantId,
        query.cuentaId,
      );
      if (cuenta === null) throw new CuentaNoEncontradaError(query.cuentaId);
      // Código de Comercio art. 36: solo cuentas de detalle tienen movimientos directos.
      if (!cuenta.esDetalle) throw new CuentaNoDetalleError(query.cuentaId);
    }
    ```
  - Incluir `cuentaId` en el objeto `filtros` con spread condicional:
    ```typescript
    const filtros = {
      fechaDesde,
      fechaHasta,
      incluirAnulados: query.incluirAnulados,
      ...(query.cuentaId !== undefined ? { cuentaId: query.cuentaId } : {}),
    };
    ```
  - El resto del flow (`contarAsientos`, `obtenerAsientosParaLibroDiario`, mapeo) no cambia.
  > REQ-LD-12, REQ-LD-13, REQ-LD-14, REQ-LD-16.

  _Commit sugerido_: `feat(reportes): validación de cuenta en LibroDiarioService (REQ-LD-12..14)`

---

## Fase 5 — Backend Diario: Adapter Prisma (filtro en findMany + count)

> ⚠️ **Requiere Postgres** (`docker compose up -d postgres`).
> Correr desde `backend/`:
> ```bash
> DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" \
>   pnpm exec jest src/reportes/adapters/prisma-comprobantes-reader.adapter.integration.spec.ts \
>   --runInBand
> ```

- [x] 5.1 **[RED integration]** Ampliar
  `backend/src/reportes/adapters/prisma-comprobantes-reader.adapter.integration.spec.ts`
  — agregar describe anidado `'filtro por cuentaId (REQ-LD-12, REQ-LD-16)'`:

  **Setup adicional de seed**: los helpers `crearAsiento(...)` existentes se reutilizan.
  Necesitamos 3 asientos en el rango:
  - Asiento 1: línea en `cajaAId` + línea en `ventasAId`.
  - Asiento 2: línea en `cajaAId` + línea en otra cuenta `bancoAId`.
  - Asiento 3: SOLO líneas en `ventasAId` + otra (sin `cajaAId`).

  **Casos RED — `contarAsientos` con `cuentaId`**:
  - `cuentaId = cajaAId` → `count = 2` (solo asientos 1 y 2).
  - `cuentaId = ventasAId` → `count = 2` (asientos 1 y 3, ya que asiento 1 también toca ventas).
  - Cuenta sin movimientos en el rango → `count = 0`.
  - CRÍTICO: 2 tenants, `cajaAId` en Tenant A y cuenta homóloga `cajaBId` en Tenant B →
    `contarAsientos(tenantA, { cuentaId: cajaAId })` NO cuenta asientos de Tenant B (multi-tenant §4.2).

  **Casos RED — `obtenerAsientosParaLibroDiario` con `cuentaId`**:
  - `cuentaId = cajaAId` → retorna asientos 1 y 2 COMPLETOS (todas sus líneas, Opción A REQ-LD-15).
    Verificar que el asiento 1 incluye AMBAS líneas (caja + ventas), no solo la de caja.
  - Asiento 3 (sin `cajaAId`) NO aparece en el resultado.
  - `cuentaId = ventasAId` → retorna asientos 1 y 3 completos.
  - Sin `cuentaId` → comportamiento idéntico al pre-change (todos los asientos del rango).
  - CRÍTICO multi-tenant: `obtenerAsientosParaLibroDiario(tenantA, { cuentaId: cajaAId })` →
    solo asientos de Tenant A (defense in depth Anti-31).
  - `incluirAnulados=false` + asiento anulado con `cajaAId` → excluido.
  - `incluirAnulados=true` → asiento anulado con `cajaAId` incluido.

  > El lookup de cuenta (`obtenerCuentaDetalle`) NO se testea acá — vive en el leaf
  > `CuentasReaderLookupPort` y su integration spec es la tarea 3.3 (decisión D1, descarta opción d).
  > REQ-LD-12, REQ-LD-15, REQ-LD-16.

- [x] 5.2 **[GREEN]** Modificar
  `backend/src/reportes/adapters/prisma-comprobantes-reader.adapter.ts`:

  **`buildWhere` — agregar `cuentaId`**:
  ```typescript
  private buildWhere(tenantId: string, filtros: LibroDiarioFiltros) {
    // Defense in depth (§4.2): organizationId SIEMPRE primer predicado.
    const anulados = filtros.incluirAnulados ? {} : { anulado: false };
    const filtroCuenta =
      filtros.cuentaId !== undefined
        ? { lineas: { some: { cuentaId: filtros.cuentaId } } }
        : {};

    return {
      organizationId: tenantId,
      estado: { in: PrismaComprobantesReaderAdapter.ESTADOS_LIBRO },
      fechaContable: { gte: filtros.fechaDesde, lte: filtros.fechaHasta },
      ...anulados,
      ...filtroCuenta,
    };
  }
  ```
  El mismo `buildWhere` se usa en `contarAsientos` Y `obtenerAsientosParaLibroDiario`:
  la coherencia count/payload (REQ-LD-16) está garantizada por compartir el mismo helper.

  > **NO** se agrega `obtenerCuentaDetalle` a este adapter (decisión D1, descarta opción d). El
  > lookup de cuenta vive en `PrismaCuentasReaderLookupAdapter` (Fase 3.2) — este adapter sigue
  > leyendo SOLO comprobantes.
  > REQ-LD-12, REQ-LD-15, REQ-LD-16.

  _Commit sugerido_: `feat(reportes): filtro cuentaId en PrismaComprobantesReaderAdapter (Opción A)`

---

## Fase 6 — Backend Diario: Controller + E2E

- [x] 6.1 **[GREEN — controller]** Modificar
  `backend/src/reportes/reportes.controller.ts`:
  - En el método `obtenerLibroDiario`, extraer `cuentaId` del DTO y pasarlo al service
    con spread condicional:
    ```typescript
    return this.libroDiarioService.consultarLibroDiario(tenantId, {
      ...(query.periodoFiscalId !== undefined ? { periodoFiscalId: query.periodoFiscalId } : {}),
      ...(query.fechaDesde !== undefined ? { fechaDesde: query.fechaDesde } : {}),
      ...(query.fechaHasta !== undefined ? { fechaHasta: query.fechaHasta } : {}),
      incluirAnulados: query.incluirAnulados ?? false,
      ...(query.cuentaId !== undefined ? { cuentaId: query.cuentaId } : {}),
    });
    ```
  - `exactOptionalPropertyTypes` activo: nunca pasar `cuentaId: undefined` explícito.
  - Sin lógica nueva en el controller — solo resolución de tenant + spread + delegación.
  > REQ-LD-12 (exposición del parámetro vía HTTP).

- [x] 6.2 **[RED e2e]** Ampliar `backend/test/libro-diario.e2e-spec.ts`
  — agregar describe anidado `'filtro por cuentaId'`:

  **Setup adicional del seed**: reutilizar helpers `seedTenant`, `seedComprobante`
  existentes. Necesitar un helper `seedCuentaAgrupadora(tenantId, codigo)`.
  Seed: Tenant A con 3 asientos (2 con `cajaId`, 1 sin), una cuenta agrupadora.

  **Casos RED — validación (REQ-LD-13, REQ-LD-14)**:
  - UUID que no existe → `GET /api/libros/diario?periodoFiscalId=<id>&cuentaId=<uuid-fake>`
    → 404, `code: 'LIBRO_DIARIO_CUENTA_NO_ENCONTRADA'`.
  - UUID de cuenta agrupadora (`esDetalle=false`) → 400, `code: 'LIBRO_DIARIO_CUENTA_NO_DETALLE'`.
  - UUID de cuenta de otro tenant → 404, `code: 'LIBRO_DIARIO_CUENTA_NO_ENCONTRADA'`
    (no fuga cross-tenant).

  **Casos RED — happy path (REQ-LD-12, REQ-LD-15)**:
  - `cuentaId` de cuenta con 2 asientos → 200, `asientos` tiene 2 items.
  - Cada asiento retornado tiene TODAS sus líneas (no solo la de la cuenta filtrada).
  - Cuenta sin movimientos en el rango → 200, `asientos: []`, `totalDebeBob: "0.00"`.

  **Caso RED — regresión sin `cuentaId` (REQ-LD-12)**:
  - Sin `cuentaId` → 200, retorna los 3 asientos del seed (comportamiento pre-change).

  **Caso RED — tope defensivo con cuenta (REQ-LD-16)**:
  - Inyectar `LIBRO_DIARIO_MAX_ASIENTOS=2` vía env en el AppModule del E2E.
  - Cuenta con 3 asientos → 422, `code: 'LIBRO_DIARIO_RANGO_EXCEDIDO'`.
  - Cuenta con 1 asiento (del total de 3) → 200 (el count de 1 no supera el tope de 2).

  **Caso RED — `incluirAnulados` + `cuentaId`**:
  - Seed un asiento anulado con `cajaId`. Sin `incluirAnulados` → no aparece.
  - Con `incluirAnulados=true` → aparece con `anulado: true`.
  > REQ-LD-12..16.

- [x] 6.3 **[GREEN]** Hacer pasar todos los E2E del 6.2. Las implementaciones de Fases 4-6.1
  ya deben cubrirlos. Si algún caso falla, ajustar la implementación (NO el test).

  _Commit sugerido_: `feat(reportes): E2E libro-diario con filtro cuentaId (REQ-LD-12..16)`

- [x] 6.4 **[verde PR B]** Suite completa verde desde `backend/`:
  ```bash
  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" \
    pnpm exec jest src/ --runInBand
  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" \
    JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" \
    pnpm exec jest test/ --runInBand --forceExit
  pnpm exec tsc --noEmit -p tsconfig.json
  pnpm run lint
  ```
  Verificar: cero `any` en producción, cero `new Date()` en service, cero query sin
  `organizationId`. Abrir PR B, mergear con squash a `main`.

---

## Fase 7 — Frontend Diario: agregar `cuentaId` (PR C)

> Branch: `feat/reportes-filtro-cuenta-diario-ui` desde `main` post-PR B.
> `LibroDiarioParams` ya tiene `cuentaId?: string` (agregar en esta fase; si
> PR B modifica el tipo, rebasar desde main).

- [ ] 7.1 **[GREEN — tipos]** Ampliar `frontend/src/types/api.ts`:
  - Agregar a `LibroDiarioParams`:
    ```typescript
    /** UUID de cuenta de detalle. Solo asientos con ≥1 línea en esa cuenta. */
    cuentaId?: string;
    ```
  > REQ-LD-12, REQ-LD-17.

- [ ] 7.2 **[GREEN — api]** Ampliar `frontend/src/features/libro-diario/api/get-libro-diario.ts`:
  - Agregar spread condicional de `cuentaId` en `params`:
    ```typescript
    ...(params.cuentaId !== undefined ? { cuentaId: params.cuentaId } : {}),
    ```
  - Ubicar después de `periodoFiscalId` para coherencia con `get-libro-mayor.ts`.
  > REQ-LD-12, REQ-LD-17.

- [ ] 7.3 **[RED vitest]** Ampliar
  `frontend/src/features/libro-diario/schemas/libro-diario-filtro-schema.test.ts`
  — agregar describe anidado `'campo cuentaId'`:
  - Modo `periodo` con `cuentaId` UUID → schema lo acepta y lo preserva.
  - Modo `rango` con `cuentaId` → ídem.
  - Sin `cuentaId` → `output.cuentaId === undefined` (campo ausente, no string vacío).
  > REQ-LD-12, REQ-LD-17.

- [ ] 7.4 **[GREEN]** Modificar
  `frontend/src/features/libro-diario/schemas/libro-diario-filtro-schema.ts`:
  - Agregar `cuentaId: z.string().optional()` a AMBAS ramas del `discriminatedUnion`
    (mismo patrón que el Mayor en Fase 1.2).
  - `LibroDiarioFiltroValues` se actualiza automáticamente.
  > REQ-LD-12, REQ-LD-17.

  _Commit sugerido_: `feat(reportes-ui): agregar cuentaId al schema de filtros del Libro Diario`

- [ ] 7.5 **[RED vitest]** Crear
  `frontend/src/features/libro-diario/components/libro-diario-filtros.test.tsx`:
  - render del componente con `usePeriodos` mockeado.
  - `CuentaAutocomplete` presente en el DOM (label "Cuenta (opcional)").
  - Sin cuenta → `onBuscar` no incluye `cuentaId`.
  - Con cuenta seleccionada → `onBuscar` incluye el UUID en `cuentaId`.
  > REQ-LD-17.

- [ ] 7.6 **[GREEN]** Modificar
  `frontend/src/features/libro-diario/components/libro-diario-filtros.tsx`:
  - Espeja exactamente el patrón aplicado al Mayor en Fase 1.4.
  - Agregar `cuentaId` al `formSchema` plano y `defaultValues`.
  - Agregar `CuentaAutocomplete` con la misma etiqueta `Cuenta (opcional)` y comentario
    cross-feature.
  - En `handleSubmitInternal` de ambas ramas: spread condicional del `cuentaId`.
  - Mismo tratamiento UX: campo vacío = sin filtro; seleccionado = con filtro.
  > REQ-LD-17.

  _Commit sugerido_: `feat(reportes-ui): CuentaAutocomplete en filtros del Libro Diario`

- [ ] 7.7 **[GREEN]** Modificar
  `frontend/src/features/libro-diario/pages/libro-diario-page.tsx`:
  - En `handleBuscar`: agregar `cuentaId` con spread condicional en AMBAS ramas
    (mismo patrón que el Mayor en Fase 1.5).
  - `tieneParams` no cambia.
  > REQ-LD-17.

  _Commit sugerido_: `feat(reportes-ui): cablear cuentaId en handleBuscar del Libro Diario`

---

## Fase 8 — Verde final (PR C)

- [ ] 8.1 **[verde — frontend]** Desde `frontend/`:
  ```bash
  pnpm exec tsc -b
  pnpm exec vitest run
  ```
  Todo verde. Sin regresiones en tests de tabla (`libro-diario-tabla.test.tsx`,
  `libro-mayor-tabla.test.tsx`) ni en schema tests existentes.

- [ ] 8.2 **[verde — backend regresión]** Desde `backend/`:
  ```bash
  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" \
    pnpm exec jest src/ --runInBand
  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" \
    JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" \
    pnpm exec jest test/ --runInBand --forceExit
  pnpm exec tsc --noEmit -p tsconfig.json
  pnpm run lint
  ```
  Confirmar que PR C (solo frontend) no rompe el backend. Si algún tipo de `api.ts`
  no matchea, ajustar en el mismo PR.

- [ ] 8.3 **[lint visual — checklist UI]** Completar el checklist de `frontend/CLAUDE.md §7`:
  - Renderizado correcto en 375 px, 768 px y 1440 px.
  - Modo oscuro: `CuentaAutocomplete` usa variables del tema, no colores hardcoded.
  - Tap targets del autocomplete ≥ 44×44 px en mobile.
  - Vacío contextual correcto cuando la cuenta no tiene asientos (patrón §13.4).
  Incluir resultado del checklist en el body del PR C.

  _Commit sugerido (si hay fixes del checklist)_: `fix(reportes-ui): tap targets y dark mode en CuentaAutocomplete de filtros`

- [ ] 8.4 **[cierre PR C]** Abrir PR C, mergear con squash a `main`.

---

## Resumen de tareas por fase

| Fase | Tareas | Tipo | Dependencias |
|------|--------|------|--------------|
| 0 — Setup | 0.1 | baseline | — |
| 1 — Frontend Mayor | 1.1–1.6 | RED vitest → GREEN | baseline verde |
| 2 — Errores Diario | 2.1–2.2 | RED unit → GREEN | — (paralelo a Fase 1) |
| 3 — Leaf CuentasReaderModule + DTO + Port | 3.1–3.7 | GREEN (forma) + RED integration (3.3, Postgres) | Fase 2 |
| 4 — Service Diario | 4.1–4.2 | RED unit → GREEN | Fases 2–3 |
| 5 — Adapter Diario | 5.1–5.2 | RED integration (Postgres) → GREEN | Fase 3 |
| 6 — Controller + E2E Diario | 6.1–6.4 | GREEN + RED e2e | Fases 4–5 |
| 7 — Frontend Diario | 7.1–7.7 | RED vitest → GREEN | Fase 6 (tipos) |
| 8 — Verde final | 8.1–8.4 | verificación | Fases 7 |
| **Total** | **34** | | |

**Distribución**: 2 RED unit (2.1, 4.1) + 2 RED integration (3.3 leaf cuentas, 5.1 adapter
comprobantes) + 1 RED e2e (6.2) + 4 RED vitest (1.1, 1.3, 7.3, 7.5) + el resto GREEN/verificación.

---

## Archivos nuevos y modificados

| Archivo | Acción | Fase |
|---------|--------|------|
| `backend/src/reportes/domain/libro-diario-errors.ts` | Modificar — agregar 2 subclases | 2.2 |
| `backend/src/reportes/domain/libro-diario-errors.spec.ts` | Modificar — agregar 2 casos | 2.1 |
| `backend/src/cuentas/ports/cuentas-reader-lookup.port.ts` | **Crear** — `CuentasReaderLookupPort` + symbol + `CuentaLookupResult` | 3.1 |
| `backend/src/cuentas/adapters/prisma-cuentas-reader-lookup.adapter.ts` | **Crear** — `findFirst` scoped por tenant | 3.2 |
| `backend/src/cuentas/adapters/prisma-cuentas-reader-lookup.adapter.integration.spec.ts` | **Crear** — ~4 casos (incl. multi-tenant) | 3.3 |
| `backend/src/cuentas/cuentas-reader.module.ts` | **Crear** — leaf module (espejo `PeriodosReaderModule`) | 3.4 |
| `backend/src/reportes/reportes.module.ts` | Modificar — `+ CuentasReaderModule` en `imports` | 3.5 |
| `backend/src/reportes/dto/libro-diario-query.dto.ts` | Modificar — agregar `cuentaId?` | 3.6 |
| `backend/src/reportes/ports/comprobantes-reader.port.ts` | Modificar — solo `cuentaId?` en filtros (SIN método de lookup) | 3.7 |
| `backend/src/reportes/libro-diario.service.ts` | Modificar — inyectar `CuentasReaderLookupPort` + paso 2.5 de validación | 4.2 |
| `backend/src/reportes/libro-diario.service.spec.ts` | Modificar — agregar ~8 casos + mock del port nuevo | 4.1 |
| `backend/src/reportes/adapters/prisma-comprobantes-reader.adapter.ts` | Modificar — solo `buildWhere` (SIN `obtenerCuentaDetalle`) | 5.2 |
| `backend/src/reportes/adapters/prisma-comprobantes-reader.adapter.integration.spec.ts` | Crear/ampliar — ~6 casos del filtro (sin lookup) | 5.1 |
| `backend/src/reportes/reportes.controller.ts` | Modificar — spread `cuentaId` | 6.1 |
| `backend/test/libro-diario.e2e-spec.ts` | Modificar — agregar ~8 casos E2E | 6.2 |
| `frontend/src/types/api.ts` | Modificar — agregar `cuentaId?` a `LibroDiarioParams` | 7.1 |
| `frontend/src/features/libro-diario/api/get-libro-diario.ts` | Modificar — spread `cuentaId` | 7.2 |
| `frontend/src/features/libro-diario/schemas/libro-diario-filtro-schema.ts` | Modificar — `cuentaId?` en ambas ramas | 7.4 |
| `frontend/src/features/libro-diario/schemas/libro-diario-filtro-schema.test.ts` | Modificar — agregar casos | 7.3 |
| `frontend/src/features/libro-diario/components/libro-diario-filtros.tsx` | Modificar — agregar `CuentaAutocomplete` | 7.6 |
| `frontend/src/features/libro-diario/components/libro-diario-filtros.test.tsx` | Crear | 7.5 |
| `frontend/src/features/libro-diario/pages/libro-diario-page.tsx` | Modificar — spread `cuentaId` en `handleBuscar` | 7.7 |
| `frontend/src/features/libro-mayor/schemas/libro-mayor-filtro-schema.ts` | Modificar — `cuentaId?` en ambas ramas | 1.2 |
| `frontend/src/features/libro-mayor/schemas/libro-mayor-filtro-schema.test.ts` | Modificar — agregar casos | 1.1 |
| `frontend/src/features/libro-mayor/components/libro-mayor-filtros.tsx` | Modificar — agregar `CuentaAutocomplete` | 1.4 |
| `frontend/src/features/libro-mayor/components/libro-mayor-filtros.test.tsx` | Crear | 1.3 |
| `frontend/src/features/libro-mayor/pages/libro-mayor-page.tsx` | Modificar — spread `cuentaId` + cerrar deuda | 1.5 |

Sin migración. Sin tocar `schema.prisma`. Sin tocar `app.module.ts` (el leaf `CuentasReaderModule`
se cablea SOLO en `reportes.module.ts` vía `imports`, no a nivel raíz). `reportes.module.ts` SÍ se
modifica (agrega `CuentasReaderModule` a `imports`). NO se importa `CuentasModule` (riesgo de ciclo
CJS prod). El Mayor NO se migra en este change (deuda D1).
