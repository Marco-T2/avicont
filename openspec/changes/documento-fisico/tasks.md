# Tasks: documento-fisico

> Breakdown en commits atómicos. Cada checkbox = un commit. **Verde entre cada
> commit** (regla #1 del doc de deudas). Mismo patrón que slice `contactos`
> de Fase 1.4 y `impersonation` de §3.2.d.

## Reglas globales

- Idioma de código: español dominio + inglés framework (CLAUDE.md §1).
- Branch: `feat/documento-fisico` — squash merge al final contra `main`.
- Verde antes de cada commit: `npx tsc --noEmit -p tsconfig.json` + `npx jest src/<modulo-tocado>/`.
- Suite E2E completa antes del commit final del slice (Fase 8).
- TDD strict: spec falla primero, implementación verde después (CLAUDE.md §10.6 — Strict TDD Mode activo).
- Todos los `adapters` filtran `tenantId` en TODA query (CLAUDE.md §4.2, §3.2 regla de importación).
- `monto` siempre `Decimal @db.Decimal(18,2)`, transportado como `string` en HTTP (CLAUDE.md §4.5).
- Cero `any`. `abstract class XxxPort` + `Symbol` en cada puerto. Errores: solo `DomainError`.
- UNIQUE PARCIAL del index de Postgres no lo gestiona Prisma: edición manual obligatoria de `migration.sql`.

---

## Fase 1 — Schema y migration

### 1.1 ☑ `feat(db): add tipos-documento-fisico, documentos-fisicos and asociacion schema`

**Entrega**: 3 modelos Prisma nuevos (`TipoDocumentoFisico`, `DocumentoFisico`,
`ComprobanteDocumentoFisico`) con relaciones inversas en `Organization`, `Contacto`
y `Comprobante`. Migration `add-documento-fisico-and-tipo-and-asociacion`
generada + edición manual para agregar el UNIQUE PARCIAL raw SQL.

**Delta de schema (ajustes confirmados)**:
- `TipoDocumentoFisico`: agrega campo `tiposComprobanteAplicables TipoComprobante[]`
  (array nativo de enum Postgres, sin default — se popula vía seed).
- `DocumentoFisico`: `monto Decimal? @db.Decimal(18, 2)` (nullable) y
  `moneda Moneda?` (nullable, sin default) — Decisión 4 actualizada.

**Archivos**:
- `backend/prisma/schema.prisma` — modelos nuevos + relaciones inversas en
  `Organization` (`tiposDocumentoFisico`, `documentosFisicos`,
  `comprobantesDocumentosFisicos`), `Contacto` (`documentosFisicos`),
  `Comprobante` (`documentosFisicosAsociados`). `LineaComprobante` NO se toca.
- `backend/prisma/migrations/<timestamp>_add_documento_fisico_and_tipo_and_asociacion/migration.sql`
  — incluye al final (sección "Manual UNIQUE PARTIAL — proposal D2"):
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS "comprobante_documento_fisico_unique_contabilizado"
    ON "comprobante_documento_fisico" ("documentoFisicoId")
    WHERE "comprobanteEstado" = 'CONTABILIZADO';
  ```

**Proceso**:
1. `DATABASE_URL=... npx prisma migrate dev --name add-documento-fisico-and-tipo-and-asociacion`
2. Editar el `migration.sql` generado para agregar el `CREATE UNIQUE INDEX` al final.
3. `DATABASE_URL=... npx prisma generate`
4. `DATABASE_URL=... npx prisma migrate deploy`

**Tests que se agregan**: ninguno en este commit — solo schema.

**Verificación**: `npx prisma generate` sin errores + `npx tsc --noEmit` verde.

**Cubre**: REQ-T-02, REQ-T-03, REQ-T-10, REQ-D-03, REQ-D-12, REQ-A-04, REQ-A-08. D1, D2, D11 (schema). Decisión 4 (nullable monto/moneda), Decisión 11 (tiposComprobanteAplicables en schema).

---

## Fase 2 — Domain: VOs y errores

### 2.1 ☑ `feat(tipos-documento-fisico): add domain VOs and errors`

**Entrega**: value objects del catálogo de tipos + errores de dominio.
Dominio puro, cero dependencias NestJS/Prisma.

**Archivos** (nuevos):
- `backend/src/tipos-documento-fisico/domain/tipo-documento-fisico-codigo.ts`
  — VO `TipoDocumentoFisicoCodigo`. Regex `/^[a-z0-9]+(-[a-z0-9]+)*$/`, 1..20 chars.
  `static of(raw: string)`, `toString()`, `equals()`. Normaliza: `trim().toLowerCase()`.
- `backend/src/tipos-documento-fisico/domain/tipo-documento-fisico-codigo.spec.ts`
  — unit puro, sin DB. Casos: formato válido, trim, formato inválido (espacios,
  mayúsculas, caracteres especiales), longitud mínima/máxima.
- `backend/src/tipos-documento-fisico/domain/tipo-documento-fisico-nombre.ts`
  — VO `TipoDocumentoFisicoNombre`. Trim + no-vacío post-trim, longitud 1..100.
- `backend/src/tipos-documento-fisico/domain/tipo-documento-fisico-nombre.spec.ts`
  — casos: nombre normal, trim aplicado, vacío (falla), solo espacios (falla),
  nombre de 100 chars (OK), 101 chars (falla).
- `backend/src/tipos-documento-fisico/domain/tipo-documento-fisico-errors.ts`
  — `TipoDocumentoFisicoNoEncontradoError`, `TipoDocumentoFisicoCodigoDuplicadoError`,
  `TipoDocumentoFisicoNombreDuplicadoError`, `TipoDocumentoFisicoConDocumentosError`,
  `TipoDocumentoFisicoInactivoError`. Todas extienden las clases base de
  `@/common/errors/`.
- `TipoDocumentoIncompatibleConComprobanteError` (en `documentos-fisicos/domain/documento-fisico-errors.ts`
  o en `comprobantes/domain/comprobante-errors.ts` — donde lo lanza el service de asociación).
  Extiende `InvalidStateError` (HTTP 422). Ver design §4.6. **Cubre**: REQ-A-11.

**Tests que se agregan**: spec de cada VO (mínimo 8 casos por VO).

**Verificación**: `npx tsc --noEmit` + `npx jest src/tipos-documento-fisico/` verde.

**Cubre**: D9 (VOs del catálogo), D11 (error de compatibilidad), códigos de error §4.1 y §4.3 del spec.

---

### 2.2 ☑ `feat(documentos-fisicos): add domain VOs and errors`

**Entrega**: VO `NumeroDocumento` + errores de dominio del módulo operativo.

**Archivos** (nuevos):
- `backend/src/documentos-fisicos/domain/numero-documento.ts`
  — VO `NumeroDocumento`. `static of(raw: string)`: normaliza `trim().toUpperCase()`.
  Valida regex `/^[A-Z0-9.\/\-]+$/`, longitud 1..50 post-normalización.
  Errores específicos: `NumeroDocumentoVacioError`, `NumeroDocumentoFormatoInvalidoError`,
  `NumeroDocumentoLongitudExcedidaError`.
- `backend/src/documentos-fisicos/domain/numero-documento.spec.ts`
  — unit puro. Casos: normalización trim+uppercase (`"  a-001  "` → `"A-001"`),
  formato válido (`"REC-0042"`, `"FC.2026/01"`, `"42"`), formato inválido (espacio,
  acento, lowercase residual post-upper), vacío (falla), longitud exactamente 50
  (OK), 51 (falla), `"0042"` ≠ `"42"` (son distintos — unicidad por string exacto).
- `backend/src/documentos-fisicos/domain/documento-fisico-errors.ts`
  — `DocumentoFisicoNoEncontradoError`, `DocumentoFisicoNumeroDuplicadoError`,
  `DocumentoFisicoInmutablePorComprobanteContabilizadoError`,
  `DocumentoFisicoReferenciadoPorComprobanteError`, `DocumentoFisicoConHistorialError`,
  `DocumentoFisicoNumeroFormatoInvalidoError`.
  - **Nuevos** (Ajuste 1 — monto condicional):
    - `DocumentoFisicoMontoRequeridoParaTributarioError` extends `InvalidStateError` (422).
      Code: `DOCUMENTO_FISICO_MONTO_REQUERIDO_PARA_TRIBUTARIO`. **Cubre**: REQ-D-13.
    - `DocumentoFisicoMontoNoPermitidoParaNoTributarioError` extends `InvalidStateError` (422).
      Code: `DOCUMENTO_FISICO_MONTO_NO_PERMITIDO_PARA_NO_TRIBUTARIO`. **Cubre**: REQ-D-14.
  - Ambos reciben `campo: 'monto' | 'moneda'` en el constructor para el `details` del error.

**Tests que se agregan**: spec de `NumeroDocumento` (mínimo 10 casos), tipos de
error instanciables sin throw (smoke test, incluyendo los 2 nuevos).

**Verificación**: `npx tsc --noEmit` + `npx jest src/documentos-fisicos/` verde.

**Cubre**: D9 (NumeroDocumento), D10 (errors de validación monto), REQ-D-02 (normalización),
REQ-D-13, REQ-D-14, códigos de error §4.2 del spec. Escenario E-D-02 cubierto a nivel unit.

---

## Fase 3 — Ports

### 3.1 ☑ `feat(tipos-documento-fisico): add repository and cross-module ports`

**Entrega**: contratos (ports) del módulo `tipos-documento-fisico`.
Superficie mínima por port; `abstract class` + `Symbol` por convención.

**Archivos** (nuevos):
- `backend/src/tipos-documento-fisico/ports/tipo-documento-fisico.repository.port.ts`
  — `TipoDocumentoFisicoRepositoryPort` (INTERNAL). Métodos: `create`, `findById`,
  `findByCodigo`, `listar`, `update`, `setActivo`, `countDocumentosFisicos`,
  `eliminar`, `upsertSeed`. Symbol: `TIPO_DOCUMENTO_FISICO_REPOSITORY_PORT`.
  Ver design §3.1 para firmas completas.
- `backend/src/tipos-documento-fisico/ports/tipos-documento-fisico-reader.port.ts`
  — `TiposDocumentoFisicoReaderPort` (CROSS-MODULE — consumido por `documentos-fisicos`).
  Un solo método: `findById(tenantId, id, tx?)`. Devuelve `TipoDocumentoFisicoParaValidacion | null`.
  Symbol: `TIPOS_DOCUMENTO_FISICO_READER_PORT`. Ver design §3.2.
- `backend/src/tipos-documento-fisico/ports/tipos-documento-fisico-seeder.port.ts`
  — `TipoDocumentoFisicoSeederPort` (CROSS-MODULE — consumido por `tenants`).
  Un solo método: `seedDefaultsForTenant(tenantId, tx?)`. Symbol: `TIPO_DOCUMENTO_FISICO_SEEDER_PORT`.
  Ver design §3.3.

**Tests que se agregan**: ninguno (ports son interfaces/abstract classes, no tienen lógica).

**Verificación**: `npx tsc --noEmit` verde.

**Cubre**: D (arquitectura hexagonal). REQ-T-08, REQ-SEED-02 (seeder port).

---

### 3.2 ☑ `feat(documentos-fisicos): add repository and cross-module ports`

**Entrega**: contratos del módulo `documentos-fisicos` — repo interno,
repo de asociación y reader cross-module.

**Archivos** (nuevos):
- `backend/src/documentos-fisicos/ports/documento-fisico.repository.port.ts`
  — `DocumentoFisicoRepositoryPort` (INTERNAL). Métodos: `create`, `findById`,
  `findByNumero`, `listar`, `update`, `eliminar`, `countAsociaciones`,
  `countAsociacionesContabilizadas`. Symbol: `DOCUMENTO_FISICO_REPOSITORY_PORT`.
  Ver design §3.4 para firmas + interfaces `DocumentoFisicoCreateData`,
  `DocumentoFisicoUpdateData`, `DocumentoFisicoListarFiltros`, `DocumentoFisicoListarPagination`.
- `backend/src/documentos-fisicos/ports/asociacion-comprobante.repository.port.ts`
  — `AsociacionComprobanteRepositoryPort` (INTERNAL). Métodos: `asociar`,
  `desasociar`, `desasociarTodasDelComprobante`, `refrescarEstadoComprobante`,
  `listarPorComprobante`, `listarPorDocumento`. Symbol: `ASOCIACION_COMPROBANTE_REPOSITORY_PORT`.
  Ver design §3.5 para firmas + interface `AsociarInput`.
- `backend/src/documentos-fisicos/ports/documentos-fisicos-reader.port.ts`
  — `DocumentosFisicosReaderPort` (CROSS-MODULE — consumido por `comprobantes`).
  Métodos: `obtenerBatchParaAsociar(tenantId, ids[], tx?)` (shape `DocumentoFisicoParaAsociar`
  con `tiposComprobanteAplicables: TipoComprobante[]` — Decisión 11),
  `idsYaAsociadosAContabilizado(tenantId, ids[], excluyendoComprobanteId, tx?)`.
  Symbol: `DOCUMENTOS_FISICOS_READER_PORT`. Ver design §3.6.

**Tests que se agregan**: ninguno (ports son contratos).

**Verificación**: `npx tsc --noEmit` verde.

**Cubre**: REQ-A-06, REQ-A-07 (ports de asociación). D (arquitectura hexagonal).

---

## Fase 4 — Adapters Prisma + integration specs

### 4.1 ☑ `feat(tipos-documento-fisico): add PrismaTipoDocumentoFisicoRepository + integration spec`

**Entrega**: implementación del `TipoDocumentoFisicoRepositoryPort` contra Postgres real.

**Archivos** (nuevos):
- `backend/src/tipos-documento-fisico/adapters/prisma-tipo-documento-fisico.repository.ts`
  — `PrismaTipoDocumentoFisicoRepository implements TipoDocumentoFisicoRepositoryPort`.
  TODA query filtra `organizationId`. Mapeo Prisma P2002 con `meta.target`
  `tipos_documento_fisico_organizationId_codigo_key` → `TipoDocumentoFisicoCodigoDuplicadoError`;
  `tipos_documento_fisico_organizationId_nombre_key` (si existe UNIQUE en nombre,
  agregar al schema) → `TipoDocumentoFisicoNombreDuplicadoError`. P2003 → `TipoDocumentoFisicoConDocumentosError`.
  `upsertSeed` hace `prisma.tipoDocumentoFisico.upsert({ where: {organizationId_codigo}, ... })`.
- `backend/src/tipos-documento-fisico/adapters/prisma-tipo-documento-fisico.repository.integration.spec.ts`
  — tests contra Postgres real (Testcontainers o instancia local).
  Escenarios: crear tipo OK, duplicado codigo 409, duplicado nombre 409, listar por tenant
  (sin registros ajenos), actualizar, desactivar, count docs > 0 bloquea DELETE, upsertSeed
  idempotente (ejecutar 2x → 8 filas, no 16).

**Tests que se agregan**: ≥ 15 integration specs.

**Verificación**: `DATABASE_URL=... npx jest src/tipos-documento-fisico/` verde.

**Cubre**: REQ-T-01, REQ-T-02, REQ-T-03, REQ-T-04, REQ-T-06, REQ-SEED-02.
E-T-02, E-T-03, E-T-05 (aislamiento tenant) a nivel integration.

---

### 4.2 ☑ `feat(tipos-documento-fisico): add PrismaTiposDocumentoFisicoReaderAdapter and SeederAdapter`

**Entrega**: implementaciones de los dos ports cross-module del catálogo.

**Archivos** (nuevos):
- `backend/src/tipos-documento-fisico/adapters/prisma-tipos-documento-fisico-reader.adapter.ts`
  — `PrismaTiposDocumentoFisicoReaderAdapter implements TiposDocumentoFisicoReaderPort`.
  `findById`: query con `where: { id, organizationId }`. Mapea al tipo
  `TipoDocumentoFisicoParaValidacion`. Early-return si `id` vacío → `null`.
- `backend/src/tipos-documento-fisico/adapters/prisma-tipos-documento-fisico-seeder.adapter.ts`
  — `PrismaTiposDocumentoFisicoSeederAdapter implements TipoDocumentoFisicoSeederPort`.
  `seedDefaultsForTenant`: itera sobre el array `TIPOS_UNIVERSALES` (8 items, constante
  en el mismo archivo o en `tipos-documento-fisico/seed/tipos-universales.ts`) y llama
  `repo.upsertSeed(tenantId, TIPOS_UNIVERSALES, tx)`. Ver D3 del design para la tabla exacta.

**Tests que se agregan**: los integration spec de 4.1 ya cubren `upsertSeed`.
El reader no tiene spec propio — cubierto por E2E de fase 8 (la integración más real).

**Verificación**: `npx tsc --noEmit` verde.

**Cubre**: REQ-T-07 (reader verifica `activo`), REQ-SEED-01, REQ-SEED-02. D3.

---

### 4.3 ☑ `feat(documentos-fisicos): add PrismaDocumentoFisicoRepository + integration spec`

**Entrega**: implementación del `DocumentoFisicoRepositoryPort`.

**Archivos** (nuevos):
- `backend/src/documentos-fisicos/adapters/prisma-documento-fisico.repository.ts`
  — TODA query filtra `organizationId`. `create`: recibe datos ya normalizados
  (número en uppercase ya normalizado por el servicio antes de llamar al repo).
  Mapea P2002 con `meta.target` `documentos_fisicos_organizationId_tipoDocumentoFisicoId_numero_key`
  → `DocumentoFisicoNumeroDuplicadoError`. `listar`: implementa filtros de
  `DocumentoFisicoListarFiltros`; filtro `estado` vía `prisma.where` con
  `asociaciones: { some: { comprobanteEstado: 'CONTABILIZADO' } }` para `contabilizado`,
  `asociaciones: { none: {} }` para `libre`, `asociaciones: { some: {} }` para `asociado`.
  `countAsociaciones`: `prisma.comprobanteDocumentoFisico.count({ where: { documentoFisicoId, organizationId } })`.
  `countAsociacionesContabilizadas`: agrega filtro `comprobanteEstado: 'CONTABILIZADO'`.
- `backend/src/documentos-fisicos/adapters/prisma-documento-fisico.repository.integration.spec.ts`
  — tests contra Postgres real. Escenarios: crear OK, número duplicado mismo tipo 409,
  número duplicado tipo distinto OK (E-D-04), listar con cada filtro (tipo, fecha, contacto,
  estado libre/asociado/contabilizado), paginación page 1/2, count asociaciones, editar campos.

**Tests que se agregan**: ≥ 20 integration specs.

**Verificación**: `DATABASE_URL=... npx jest src/documentos-fisicos/` verde.

**Cubre**: REQ-D-03, REQ-D-09, REQ-D-12. E-D-03, E-D-04, E-D-11 (a nivel integration).
D4 (filtros + paginación offset), D7 (count para mutabilidad).

---

### 4.4 ☑ `feat(documentos-fisicos): add PrismaAsociacionComprobanteRepository + integration spec`

**Entrega**: implementación del `AsociacionComprobanteRepositoryPort`. Commit crítico:
cubre el UNIQUE PARCIAL y el cache `comprobanteEstado`.

**Archivos** (nuevos):
- `backend/src/documentos-fisicos/adapters/prisma-asociacion-comprobante.repository.ts`
  — `PrismaAsociacionComprobanteRepository`. `asociar`: `prisma.comprobanteDocumentoFisico.create`.
  Captura P2002 con `meta.target === 'comprobante_documento_fisico_unique_contabilizado'`
  (nombre exacto del UNIQUE PARCIAL del migration.sql) → `DocumentoFisicoYaAsociadoAOtroContabilizadoError`.
  Captura P2002 con `meta.target` del UNIQUE normal `(documentoFisicoId, comprobanteId)` → ignora
  (ya estaba asociado = idempotente o error claro según contexto).
  `refrescarEstadoComprobante`: `UPDATE comprobante_documento_fisico SET comprobanteEstado = $estado WHERE comprobanteId = $id AND organizationId = $tenant`.
  `desasociarTodasDelComprobante`: `DELETE WHERE comprobanteId AND organizationId`.
- `backend/src/documentos-fisicos/adapters/prisma-asociacion-comprobante.repository.integration.spec.ts`
  — **Casos críticos**:
  1. Un `docId` asociado a dos BORRADOR → OK (E-A-02 a nivel integration).
  2. Un `docId` asociado a BORRADOR `comp-A`, se ejecuta `refrescarEstadoComprobante(comp-A, CONTABILIZADO)`, luego otro BORRADOR `comp-B` intenta `refrescarEstadoComprobante(comp-B, CONTABILIZADO)` con el mismo `docId` → P2002 mapeado a error de dominio (E-A-03 a nivel integration, cubre R3).
  3. `desasociarTodasDelComprobante` borra solo las filas de ese comprobante.
  4. Cache drift: verificar que después de `refrescarEstadoComprobante(CONTABILIZADO)` el campo `comprobanteEstado` en BD es `CONTABILIZADO` (cubre R1).

**Tests que se agregan**: ≥ 12 integration specs.

**Verificación**: `DATABASE_URL=... npx jest src/documentos-fisicos/` verde.

**Cubre**: REQ-A-04, REQ-A-05, REQ-A-07. D2 (cache estado), R1 (drift), R3 (race).
E-A-02, E-A-03, E-A-06 a nivel integration.

---

### 4.5 ☑ `feat(documentos-fisicos): add PrismaDocumentosFisicosReaderAdapter`

**Entrega**: implementación del `DocumentosFisicosReaderPort` (cross-module,
consumido por `comprobantes`). Método renombrado a `obtenerBatchParaAsociar`
(antes `obtenerBatchParaValidacion`) con shape extendido `DocumentoFisicoParaAsociar`
que incluye `tiposComprobanteAplicables`.

**Archivos** (nuevos):
- `backend/src/documentos-fisicos/adapters/prisma-documentos-fisicos-reader.adapter.ts`
  — `PrismaDocumentosFisicosReaderAdapter implements DocumentosFisicosReaderPort`.
  `obtenerBatchParaAsociar`: deduplica ids, early-return si lista vacía,
  `prisma.documentoFisico.findMany({ where: { id: { in: ids }, organizationId: tenantId }, include: { tipoDocumento: { select: { esTributario: true, tiposComprobanteAplicables: true } } } })`.
  Proyecta todos los campos de `DocumentoFisicoParaAsociar` incluyendo
  `tiposComprobanteAplicables` (del JOIN al tipo). Devuelve `Map<string, DocumentoFisicoParaAsociar>`.
  `idsYaAsociadosAContabilizado`: query sobre `ComprobanteDocumentoFisico` con
  `where: { documentoFisicoId: { in: ids }, comprobanteEstado: 'CONTABILIZADO', NOT: { comprobanteId: excluyendoComprobanteId }, organizationId: tenantId }`.
  Devuelve los ids encontrados.

**Tests que se agregan**: los casos del reader quedan cubiertos por las integration specs
del servicio `comprobantes` (fase 6) y por los E2E. No se agrega integration spec propio
aquí — el adapter es muy delgado (thin).

**Verificación**: `npx tsc --noEmit` verde.

**Cubre**: REQ-A-06 (pre-validación al contabilizar), REQ-A-11 (shape con tiposComprobanteAplicables). D11 (reader port extendido). D (reader port pattern de contactos).

---

## Fase 5 — Services + unit specs (TDD)

### 5.1 ☑ `feat(tipos-documento-fisico): add TiposDocumentoFisicoService + unit spec`

**Entrega**: lógica de negocio del catálogo. Inyecta SOLO el port.
TDD: spec primero (todos los casos en rojo), luego implementación hasta verde.

**Archivos** (nuevos):
- `backend/src/tipos-documento-fisico/tipos-documento-fisico.service.spec.ts`
  — mocks del `TipoDocumentoFisicoRepositoryPort`. Casos:
  - `create`: OK con VOs, error si codigo duplicado, error si nombre duplicado,
    error formato codigo inválido (delegado al VO).
  - `findById`: encontrado, no encontrado → `TipoDocumentoFisicoNoEncontradoError`.
  - `listar`: devuelve solo los del tenant (la lógica de filtro está en el repo).
  - `update`: OK, code campo ignorado si llega en el body (inmutabilidad),
    no encontrado.
  - `setActivo(false)`: desactivar OK; type inactivo → crear doc falla.
  - `eliminar`: OK si count=0, falla si count>0 → `TipoDocumentoFisicoConDocumentosError`
    (defense in depth antes del FK Restrict).
- `backend/src/tipos-documento-fisico/tipos-documento-fisico.service.ts`
  — `TiposDocumentoFisicoService @Injectable()`. Inyecta
  `@Inject(TIPO_DOCUMENTO_FISICO_REPOSITORY_PORT)`. Cero `any`. Throws solo DomainError.

**Tests que se agregan**: ≥ 20 unit specs.

**Verificación**: `npx tsc --noEmit` + `npx jest src/tipos-documento-fisico/` verde.

**Cubre**: REQ-T-01 a REQ-T-09. E-T-07 (codigo inmutable en service), E-T-08, E-T-09.

---

### 5.2 ☑ `feat(documentos-fisicos): add DocumentosFisicosService + unit spec`

**Entrega**: lógica de negocio del módulo operativo (CRUD + política de mutabilidad).
TDD strict.

**Archivos** (nuevos):
- `backend/src/documentos-fisicos/documentos-fisicos.service.spec.ts`
  — mocks de `DocumentoFisicoRepositoryPort` y `TiposDocumentoFisicoReaderPort`
  (y `ContactosReaderPort` para validar contacto). Casos:
  - `create`: OK con normalización número, tipo inactivo → `TipoDocumentoFisicoInactivoError`,
    tipo de otro tenant → `TipoDocumentoFisicoNoEncontradoError`, contacto inactivo OK
    (E-D-09), contacto de otro tenant → `ContactoNoEncontradoError`.
  - `create` (validación monto condicional — REQ-D-13/14):
    - tipo tributario + monto null → `DocumentoFisicoMontoRequeridoParaTributarioError` (E-D-14).
    - tipo tributario + moneda null → `DocumentoFisicoMontoRequeridoParaTributarioError` con `campo: 'moneda'`.
    - tipo tributario + monto + moneda → OK (E-D-13).
    - tipo no-tributario + monto null → OK (E-D-15).
    - tipo no-tributario + monto no-null → `DocumentoFisicoMontoNoPermitidoParaNoTributarioError` (E-D-16).
    - tipo no-tributario + moneda no-null → `DocumentoFisicoMontoNoPermitidoParaNoTributarioError` con `campo: 'moneda'`.
  - `findById`: encontrado con tipo + contacto embebidos, no encontrado.
  - `listar`: delega a repo; filtros correctamente mapeados de query DTO a filtros internos.
  - `update` (PATCH): suelto OK, borrador OK (E-E-02), contabilizado falla →
    `DocumentoFisicoInmutablePorComprobanteContabilizadoError` (E-E-03), mixto falla (E-E-04),
    normalización en edición también aplica (E-E-05).
  - `eliminar`: nunca asociado OK, actualmente en borrador → `DocumentoFisicoReferenciadoPorComprobanteError`
    (E-EL-03), nunca tuvo asociaciones activas pero hubo historial → `DocumentoFisicoConHistorialError`
    (E-EL-02, implementar via `countAsociaciones > 0` incluyendo las ya borradas —
    **ver nota de D7**: en este slice, `countAsociaciones` lee la tabla intermedia
    actual; si las asociaciones de ANULADOS se borraron, el doc queda eliminable.
    Si se quiere retener historial, materializar tabla de auditoría aparte).
- `backend/src/documentos-fisicos/documentos-fisicos.service.ts`
  — `DocumentosFisicosService @Injectable()`. Inyecta los 3 ports.

**Nota sobre E-EL-02** (historial): per design D7, después de que un comprobante se anula
las asociaciones se borran en la TX del anular. Por lo tanto, `countAsociaciones = 0`
y el documento SÍ es eliminable post-anulación. E-EL-02 del spec asume que hay un flag
`tuvoAsociacion` o tabla de auditoría — esto se deja como **deuda documentada** en el
task 9.4, y el test E-EL-02 se marca como `it.todo` en esta fase.

**Tests que se agregan**: ≥ 25 unit specs.

**Verificación**: `npx tsc --noEmit` + `npx jest src/documentos-fisicos/` verde.

**Cubre**: REQ-D-01 a REQ-D-14, REQ-D-07 (inmutabilidad), REQ-D-08 (eliminación).
E-D-01 a E-D-16, E-E-01 a E-E-05, E-EL-01, E-EL-03. D10 (validación monto condicional).

---

### 5.3 ⊘ ANULADA — reconciliada con design §4.2/§4.5/§4.6

**Por qué se anula**: esta task ubicaba la orquestación asociar/desasociar/listar
en `DocumentosFisicosService`. El design la asigna a `ComprobantesService` (§4.2:
`asociarDocumentos` valida el comprobante con su propio repo y consume
`DocumentosFisicosReaderPort` + `AsociacionComprobanteRepositoryPort`). Implementarla
en `documentos-fisicos` exigiría leer `comprobantes` → **dependencia inversa que el
§4.5 prohíbe** ("comprobantes consume documentos-fisicos, no al revés") y reintroduce
el ciclo de prod (cicatriz `prod-build-crash-ciclos`). El reader cross-module ya
proyecta `esTributario` + `tiposComprobanteAplicables`, así que `ComprobantesService`
tiene todo para validar sin tocar `documentos-fisicos`.

**Dónde vive ahora**: la lógica + los ≥15 unit specs se **absorben en task 6.3**
(`ComprobantesService.asociarDocumentos/desasociarDocumento/listarDocumentosAsociados`
+ casos en `comprobantes.service.spec.ts`). Los errores del flujo de asociar se crean
en 6.3 (`comprobantes/domain`); `TipoDocumentoIncompatibleConComprobanteError` ya se
reubicó a `comprobantes/domain` (commit `f632bf8`).

**Cubría** (todo migrado a 6.3): REQ-A-01 a REQ-A-11. E-A-01, E-A-02, E-A-04, E-A-05, E-A-07, E-A-08, E-A-09, E-A-10, E-A-11. D11.

---

## Fase 6 — Controllers + DTOs

### 6.1 ☑ `feat(tipos-documento-fisico): add DTOs, controller and module wiring`

> **Nota apply (commit `6c1db82`)**: dos desvíos respecto del texto original, decididos en la sesión:
> 1. **`descripcion` DIFERIDO** — el spec §7 + REQ-T-01/T-05 lo piden, pero schema (1.1) y service (5.1) lo omitieron. Para no meter una migración en un commit HTTP se sacó `descripcion` de los DTOs (slice queda consistente). **Deuda**: si se quiere, agregar columna nullable `descripcion String?` + service inputs + repo + response mapper en commit aparte. **E-T (fase 10.1) NO debe asertar round-trip de `descripcion`.**
> 2. **Catálogo RBAC fuera de este commit** — la edición de `catalogo.ts` (permisos del slice + retroactivos de contactos) es responsabilidad de la **task 8.1** (REQ-P-12). Se revirtió de acá para respetar atomicidad/§9.1. `app.module.ts` SÍ se tocó (registrar el módulo es parte legítima de la capa HTTP).

**Entrega**: capa HTTP del catálogo de tipos.

**Archivos** (nuevos):
- `backend/src/tipos-documento-fisico/dto/create-tipo-documento-fisico.dto.ts`
  — `@IsString() @MinLength(1) @MaxLength(100) nombre`, `@IsString() @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/) @MaxLength(20) codigo`,
  `@IsBoolean() esTributario`, `@IsOptional() @IsString() @MaxLength(300) descripcion`.
- `backend/src/tipos-documento-fisico/dto/update-tipo-documento-fisico.dto.ts`
  — igual pero todos opcionales, SIN campo `codigo` (inmutable, se omite del DTO).
- `backend/src/tipos-documento-fisico/dto/tipo-documento-fisico-response.dto.ts`
  — campos de respuesta (ver spec §7).
- `backend/src/tipos-documento-fisico/tipos-documento-fisico.controller.ts`
  — 4 endpoints (GET, POST, PATCH, DELETE). `@UseGuards(JwtAuthGuard, PermissionsGuard)`.
  `@RequirePermissions(...)` por endpoint (REQ-P-01 a REQ-P-04).
  `tenantId` solo del JWT (REQ-S-03). Orden de respuesta: `esTributario DESC, nombre ASC`
  (REQ-T-09) — pasado como parámetro al service/repo.
- `backend/src/tipos-documento-fisico/tipos-documento-fisico.module.ts`
  — providers: `PrismaTipoDocumentoFisicoRepository`, `PrismaTiposDocumentoFisicoReaderAdapter`,
  `PrismaTiposDocumentoFisicoSeederAdapter`. Exports: `TIPOS_DOCUMENTO_FISICO_READER_PORT`,
  `TIPO_DOCUMENTO_FISICO_SEEDER_PORT`.

**Tests que se agregan**: ninguno nuevo — cubiertos por unit specs (fase 5.1) y E2E (fase 8.1).

**Verificación**: `npx tsc --noEmit` + `npx jest src/tipos-documento-fisico/` verde.

**Cubre**: REQ-P-01 a REQ-P-04, REQ-T-09. E-T-10 (orden listado).

---

### 6.2 ☑ `feat(documentos-fisicos): add DTOs, controller and module wiring`

> **Nota apply (commit `da66e43`)**: el primer intento metió `PrismaService` directo en el controller para enriquecer lecturas (tipo+contacto+comprobantes) — **violación hexagonal §3.2/§3.5**. Se corrigió DENTRO del mismo commit (amend): el enriquecimiento de lectura vive ahora en repo→service. Se agregaron al `DocumentoFisicoRepositoryPort` los read-models `DocumentoFisicoConRelaciones`/`ComprobanteAsociadoView`/`DocumentoFisicoConDetalle` + métodos `findByIdConRelaciones`/`findDetalleById`/`listarConRelaciones`; el service expone `obtenerConRelaciones`/`obtenerDetalle`/`listarConRelaciones`; el controller solo consume el service. +8 integration specs (read enriquecido + comprobantesAsociados) y +5 unit. `monto`/`moneda` quedaron OPCIONALES+nullable en los DTOs (spec §7, validación condicional en service). **Para 6.3**: el read-model `DocumentoFisicoConRelaciones` vive en el port — importarlo de ahí; NO meter Prisma/repo concreto en el controller de comprobantes (misma violación). El `DOCUMENTOS_FISICOS_READER_PORT` puede no exponer estos read-models enriquecidos — verificar su superficie antes de 6.3.

**Entrega**: capa HTTP del módulo operativo de documentos físicos.

**Archivos** (nuevos):
- `backend/src/documentos-fisicos/dto/create-documento-fisico.dto.ts`
  — `@IsUUID() tipoDocumentoFisicoId`, `@IsString() @MinLength(1) @MaxLength(50) numero`,
  `@IsDateString() fechaEmision`, `@IsNumberString() monto` (validar > 0 en service),
  `@IsEnum(Moneda) @IsOptional() moneda`, `@IsUUID() @IsOptional() contactoId`,
  `@IsString() @MaxLength(500) @IsOptional() glosa`.
- `backend/src/documentos-fisicos/dto/update-documento-fisico.dto.ts`
  — todos opcionales, mismos campos que create.
- `backend/src/documentos-fisicos/dto/listar-documentos-fisicos.dto.ts`
  — query params: `tipoDocumentoFisicoId?`, `fechaDesde?`, `fechaHasta?`, `contactoId?`,
  `estadoAsociacion? (SUELTO|EN_BORRADOR|CONTABILIZADO)`, `numero?`,
  `page? (default 1)`, `pageSize? (default 20, max 100)`.
- `backend/src/documentos-fisicos/dto/documento-fisico-response.dto.ts`
  — `DocumentoFisicoDto` (listado), `DocumentoFisicoDetalleDto` (con `comprobantesAsociados`),
  `DocumentoFisicoAsociadoDto` (en endpoint de comprobante). Ver spec §7.
- `backend/src/documentos-fisicos/documentos-fisicos.controller.ts`
  — 5 endpoints CRUD (`GET /documentos-fisicos`, `GET /:id`, `POST`, `PATCH /:id`,
  `DELETE /:id`). Guards + permisos REQ-P-05 a REQ-P-08.
- `backend/src/documentos-fisicos/documentos-fisicos.module.ts`
  — imports: `TiposDocumentoFisicoModule`, `ContactosModule`, `PrismaService`.
  providers: todos los adapters + `DocumentosFisicosService`.
  exports: `DOCUMENTOS_FISICOS_READER_PORT`, `ASOCIACION_COMPROBANTE_REPOSITORY_PORT`.

**Tests que se agregan**: ninguno nuevo en este commit.

**Verificación**: `npx tsc --noEmit` + `npx jest src/documentos-fisicos/` verde.

**Cubre**: REQ-D-01, REQ-D-09, REQ-D-10, REQ-D-11. REQ-P-05 a REQ-P-08. D4 (paginación offset).

---

### 6.3 ☑ `feat(comprobante): add asociacion sub-resource endpoints`

> **Nota apply (commit `1ce0ec1`)**: implementada con opus. 3 endpoints sub-recurso bajo `/:comprobanteId/documentos-fisicos` (POST/DELETE/GET) + `ComprobantesService.asociarDocumentos/desasociarDocumento/listarDocumentosAsociados` (asociar dentro de `this.prisma.$transaction`, patrón existente) + 3 errores nuevos en `comprobantes/domain` (`ComprobanteNoEsBorradorError`, `DocumentoFisicoReferenciadoNoExisteError`, `ComprobanteDocumentoNoDesasociableContabilizadoError`) + `asociar-documentos.dto.ts` + `comprobantes.module` importa `DocumentosFisicosModule` (sin forwardRef, §4.5) + 18 unit specs. Dirección comprobantes→documentos-fisicos solo vía ports; cero Prisma en comprobantes (controller y service, salvo `$transaction`). Detalles:
> - **Permisos**: se siguió el SPEC (REQ-P-09/10/11), no el design §4.1 (que pedía solo `asientos.update`). POST y DELETE requieren `documentos-fisicos.update` **Y** `asientos.update`; GET requiere `documentos-fisicos.read`. El design §4.1 quedó desactualizado en este punto.
> - **`listarDocumentosAsociados` enriquecido**: el reader port `DocumentosFisicosReaderPort` se extendió con `listarAsociadosDeComprobante` (JOIN a tipo+contacto en el adapter) — NO se metió Prisma en comprobantes. + 3 integration specs.
> - **Calidad**: `DocumentoFisicoParaAsociar` se extendió con `tipoDocumentoNombre` (denormalizado del tipo, como `esTributario`) para que `TipoDocumentoIncompatibleConComprobanteError` muestre el NOMBRE del tipo y no el número del documento (§1, mensajes claros).
> - **Riesgos 7.1/7.2**: `refrescarEstadoComprobante` mapea el P2002 del UNIQUE parcial a `DocumentoFisicoYaAsociadoAOtroContabilizadoError` con `documentoFisicoId` vacío (placeholder) — en 7.1 enriquecer el id desde el contexto de la TX. `DocumentoFisicoYaAsociadoAOtroContabilizadoError` se IMPORTA de `documentos-fisicos/domain` (no recrear).

**Entrega**: 3 endpoints de asociación en `comprobantes.controller.ts` +
métodos delegadores en `ComprobantesService`.

**Archivos** (modificados):
- `backend/src/documentos-fisicos/dto/asociar-documentos.dto.ts` (nuevo si no existe)
  — `@IsArray() @IsUUID(undefined, { each: true }) @ArrayMaxSize(50) documentoFisicoIds: string[]`.
- `backend/src/comprobantes/comprobantes.controller.ts`
  — agregar 3 endpoints nuevos bajo el path `/:comprobanteId/documentos-fisicos`:
  - `POST`: body `AsociarDocumentosDto`, permisos `contabilidad.documentos-fisicos.update`
    + `contabilidad.asientos.update` (REQ-P-09). Puede retornar 422
    `TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE` (REQ-A-11) o 422
    `DOCUMENTO_FISICO_MONTO_REQUERIDO_PARA_TRIBUTARIO` si algún doc tributario
    no tiene monto.
  - `DELETE /:documentoFisicoId`: permisos REQ-P-10.
  - `GET`: permiso `contabilidad.documentos-fisicos.read` (REQ-P-11).
  Los 3 endpoints viven en el controller de **comprobantes** y delegan a
  `ComprobantesService` (su propio service, que orquesta el flujo §4.2). El controller
  NO inyecta `DocumentosFisicosService` — la dependencia es unidireccional
  (comprobantes → documentos-fisicos vía ports, §4.5).
- `backend/src/comprobantes/comprobantes.service.ts`
  — agregar 3 métodos públicos con la **lógica completa** (absorbida de la ex-task 5.3):
  `asociarDocumentos`, `desasociarDocumento`, `listarDocumentosAsociados`, según design §4.2.
  Inyectar `DOCUMENTOS_FISICOS_READER_PORT` y `ASOCIACION_COMPROBANTE_REPOSITORY_PORT`.
  Validar comprobante BORRADOR (su propio `repo.findById`), existencia/tenant de los docs
  y compatibilidad de tipo (`tiposComprobanteAplicables` del reader vs `comprobante.tipo`).
- `backend/src/comprobantes/domain/comprobante-errors.ts`
  — crear los errores del flujo de asociar (design §4.6): `ComprobanteNoEsBorradorError`,
  `DocumentoFisicoReferenciadoNoExisteError`, `ComprobanteDocumentoNoDesasociableContabilizadoError`.
  `TipoDocumentoIncompatibleConComprobanteError` ya vive acá (commit `f632bf8`).
- `backend/src/comprobantes/comprobantes.module.ts`
  — importar `DocumentosFisicosModule`.

**Tests que se agregan**: ≥ 15 unit specs en `comprobantes.service.spec.ts` (absorbidos
de la ex-task 5.3), mockeando el comprobante-repo + `DOCUMENTOS_FISICOS_READER_PORT` +
`ASOCIACION_COMPROBANTE_REPOSITORY_PORT`. Casos: `asociarDocumentos` (ids vacíos no-op;
doc de otro tenant → `DocumentoFisicoReferenciadoNoExisteError` E-A-07; comprobante no
BORRADOR → `ComprobanteNoEsBorradorError`; idempotente; multi-id E-A-08; incompatibilidad
de tipo → `TipoDocumentoIncompatibleConComprobanteError` E-A-09/10/11);
`desasociarDocumento` (BORRADOR OK E-A-04; CONTABILIZADO →
`ComprobanteDocumentoNoDesasociableContabilizadoError` E-A-05); `listarDocumentosAsociados`
(solo del tenant). El flujo completo se valida además por E2E (fase 8.3).

**Verificación**: `npx tsc --noEmit` + `npx jest src/comprobantes/` verde.

**Cubre**: REQ-A-01 a REQ-A-11 (lógica de asociar, absorbida de 5.3). REQ-P-09 a REQ-P-11.
D5 (endpoints sub-recurso), D11 (compatibilidad tipo). E-A-01, E-A-02, E-A-04, E-A-05, E-A-07 a E-A-11.

---

## Fase 7 — Wiring con comprobantes (contabilizar + anular)

### 7.1 ☑ `refactor(comprobante): integrate DocumentosFisicos validation in contabilizar`

> **Nota apply (commit `1c43958`)**: dentro de la TX de `contabilizar()`, paso "3.5" (después de `validarComprobanteParaContabilizar`, ANTES de `secuencia.siguienteCorrelativo` → si la pre-validación falla NO se consume numeración): `listarPorComprobante` → si hay asociaciones, `idsYaAsociadosAContabilizado(tenantId, ids, id, tx)` → si hay conflicto `throw DocumentoFisicoYaAsociadoAOtroContabilizadoError(<primer id real>)` → `refrescarEstadoComprobante(CONTABILIZADO)`. Lógica contable existente intacta. **`DocumentoFisicoYaAsociadoAOtroContabilizadoError` es SINGULAR (`documentoFisicoId: string`)**, no array — el design §4.3/§4.6 decía array; se tomó el primer id de `idsYaAsociadosAContabilizado()` type-safe (cubre el id vacío que dejaba el adapter en el race). Se IMPORTA de `documentos-fisicos/domain`. **GlobalExceptionFilter SIN cambios**: los adapters 4.3/4.4 ya mapean los P2002 a DomainError; importar errores de módulo al common filter invertiría la dependencia (§3.3/§3.5). +3 unit specs.

**Entrega**: `ComprobantesService.contabilizar()` valida los documentos físicos
asociados antes de la transición BORRADOR → CONTABILIZADO. El cache
`comprobanteEstado` se actualiza en la misma TX.

**Archivos** (modificados):
- `backend/src/comprobantes/comprobantes.service.ts`
  — dentro de `contabilizar()`, dentro del bloque `$transaction`:
  1. `asociaciones = await this.asociacionRepo.listarPorComprobante(tenantId, id, tx)`.
  2. Si `asociaciones.length > 0`: llamar `documentosFisicosReader.idsYaAsociadosAContabilizado(tenantId, ids, comprobanteId, tx)`.
  _Nota: el método `obtenerBatchParaAsociar` (renombrado desde `obtenerBatchParaValidacion`) se usa en el flujo de ASOCIAR (task 6.3, `ComprobantesService.asociarDocumentos`), no en el de contabilizar. El contabilizar usa `idsYaAsociadosAContabilizado` que no cambia de nombre._
  3. Si `yaContab.length > 0`: throw `DocumentoFisicoYaAsociadoAOtroContabilizadoError(yaContab)`.
  4. `await this.asociacionRepo.refrescarEstadoComprobante(tenantId, comprobanteId, 'CONTABILIZADO', tx)`.
  Ver design §4.3 para pseudocódigo exacto.
- `backend/src/comprobantes/domain/comprobante-errors.ts`
  — el contabilizar usa `DocumentoFisicoYaAsociadoAOtroContabilizadoError`, que **ya existe
  en `documentos-fisicos/domain`** (creado en task 4.4; lo lanza el adapter al chocar el
  UNIQUE PARCIAL). Importarlo desde ahí (dirección permitida comprobantes → documentos-fisicos,
  §4.5) — NO recrearlo. Los errores de ASOCIAR (`ComprobanteNoEsBorradorError`,
  `DocumentoFisicoReferenciadoNoExisteError`, `ComprobanteDocumentoNoDesasociableContabilizadoError`)
  ya se crearon en 6.3.
- `backend/src/common/filters/global-exception.filter.ts`
  — agregar mapping de P2002 con `meta.target`:
  `documentos_fisicos_organizationId_tipoDocumentoFisicoId_numero_key` →
  `DocumentoFisicoNumeroDuplicadoError`; `comprobante_documento_fisico_unique_contabilizado` →
  `DocumentoFisicoYaAsociadoAOtroContabilizadoError`; `tipos_documento_fisico_organizationId_codigo_key` →
  `TipoDocumentoFisicoCodigoDuplicadoError`. P2003 con FK de `TipoDocumentoFisico` →
  `TipoDocumentoFisicoConDocumentosError`. P2003 con FK de `DocumentoFisico` →
  `DocumentoFisicoReferenciadoPorComprobanteError`. Ver design §D6.

  > ⚠️ **Corrección empírica (descubierta en 4.4)**: Prisma NO expone el nombre del
  > índice raw SQL en `meta.target`. Para el UNIQUE PARCIAL reporta `["documentoFisicoId"]`
  > (array de 1 campo), y para el UNIQUE normal `(documentoFisicoId, comprobanteId)` reporta
  > `["documentoFisicoId", "comprobanteId"]` (2 campos). NO mapear por el string
  > `comprobante_documento_fisico_unique_contabilizado` (eso deja el 500 sin mapear).
  > El adapter de 4.4 ya distingue por longitud del array; el `GlobalExceptionFilter` es
  > red de seguridad secundaria — el error ya se mapea en la capa repo/service. Si igual
  > se agrega al filter, usar el shape normalizado, no el nombre del índice.

**Tests que se agregan**: ampliar `comprobantes.service.spec.ts` con casos:
  - contabilizar sin docs asociados → flujo existente sin cambios.
  - contabilizar con docs válidos → OK + cache actualizado.
  - contabilizar con doc ya contabilizado en otro → `DocumentoFisicoYaAsociadoAOtroContabilizadoError`.

**Verificación**: `npx tsc --noEmit` + `npx jest src/comprobantes/` verde.

**Cubre**: REQ-A-06. E-A-03 (a nivel unit/service). D2 (cache sync), R3 (defense in depth).

---

### 7.2 ☑ `refactor(comprobante): integrate DocumentosFisicos cleanup in anular`

> **Nota apply (commit `78ed3ce`)**: dentro de la TX de `anular()` (tras validar período de reversión ABIERTO, antes de `siguienteCorrelativo`): `await this.asociacionRepo.desasociarTodasDelComprobante(tenantId, id, tx)`. El DocumentoFisico sobrevive y queda re-asociable. Reversión AJUSTE / líneas invertidas / ANULADO / auditoría intactos. +2 unit specs. (Checkbox de 7.1 y 7.2 folded en este commit HEAD.)

**Entrega**: `ComprobantesService.anular()` desasocia todos los documentos físicos
del comprobante dentro de la misma TX del anulado.

**Archivos** (modificados):
- `backend/src/comprobantes/comprobantes.service.ts`
  — dentro de `anular()`, dentro del bloque `$transaction`, agregar:
  `await this.asociacionRepo.desasociarTodasDelComprobante(tenantId, comprobanteId, tx)`.
  Ver design §4.4 para contexto exacto.

**Tests que se agregan**: ampliar `comprobantes.service.spec.ts`:
  - anular comprobante con docs → docs desasociados (mock de `desasociarTodasDelComprobante`
    verifica que se llamó con los parámetros correctos).
  - anular comprobante sin docs → `desasociarTodasDelComprobante` se llama igual
    (idempotente → no-op en adapter).

**Verificación**: `npx tsc --noEmit` + `npx jest src/comprobantes/` verde.

**Cubre**: REQ-A-07. E-A-06 (a nivel unit/service).

---

## Fase 8 — RBAC y permisos

### 8.1 ☑ `feat(rbac): add documentos-fisicos and tipos-documento-fisico permissions`

> **Nota apply**: 12 permisos agregados a `CATALOGO_PERMISOS` vía helper `CRUD()` (read/create/update/delete c/u): `contabilidad.contactos.*` (retroactivo slice 1), `contabilidad.tipos-documento-fisico.*`, `contabilidad.documentos-fisicos.*`. (Originalmente el sub-agent de 6.1 los había metido ahí por error; se revirtieron y se hacen acá, su lugar correcto.) `asientos.update` ya existía (lo usa el POST/DELETE de asociación junto con `documentos-fisicos.update`). No hay spec del catálogo; tsc + rbac/common verdes.

**Entrega**: 8 permisos nuevos del slice + 4 permisos retroactivos de `contactos`
en el catálogo de permisos.

**Archivos** (modificados):
- `backend/src/common/permisos/catalogo.ts`
  — agregar al array `CATALOGO_PERMISOS`:
  - `{ modulo: 'contabilidad', submodulo: 'tipos-documento-fisico', acciones: CRUD('tipos de documento físico') }` (4 permisos)
  - `{ modulo: 'contabilidad', submodulo: 'documentos-fisicos', acciones: CRUD('documentos físicos') }` (4 permisos)
  - `{ modulo: 'contabilidad', submodulo: 'contactos', acciones: CRUD('contactos') }` (4 permisos — cierre de deuda del slice 1)
  Ver design §7.1 para la forma exacta (puede ser helper `CRUD()` si existe).

**Tests que se agregan**: si existe un test del catálogo, agregar assertion de que
los 12 nuevos permisos están presentes en el array.

**Verificación**: `npx tsc --noEmit` verde. `npx jest src/common/permisos/` verde si hay specs.

**Cubre**: REQ-P-12. Proposal Decisión 7. Deuda `contabilidad.contactos.*`.

---

## Fase 9 — Seed al crear tenant

### 9.1 ☑ `refactor(tenants): seed default TiposDocumentoFisico on tenant creation` + backfill C-2

> **Nota apply (commits `94ca6b2` core + `7a543bb` backfill)**:
> - **9.1 core** (`94ca6b2`): `TenantsService.create()` ya estaba en `$transaction` con un `switch(dto.modulo)` que siembra plan de cuentas; el seed de tipos se enchufó en el `case CONTABILIDAD` (los tipos son feature del módulo contabilidad), junto al planCuentasSeeder, mismo `tx`. `tenants.module` importa `TiposDocumentoFisicoModule` (sin forwardRef, sin ciclo). +4 unit specs + integration. NO se rompió la lógica de membership/owner.
> - **Backfill C-2** (`7a543bb`, scope `db` separado): migración data-only que siembra los 8 tipos en orgs preexistentes **filtrando `WHERE contabilidadEnabled = true`** (coincide con el criterio del runtime — se corrigió de un primer intento que sembraba TODAS las orgs). `INSERT...SELECT...CROSS JOIN VALUES...ON CONFLICT (organizationId,codigo) DO NOTHING`, idempotente, snapshot point-in-time de TIPOS_UNIVERSALES. Tabla orgs = `organizations`; `id`/`updatedAt` sin default → `gen_random_uuid()::text`/`now()`. **§11.6 SE DISPARÓ**: Prisma metió `DROP INDEX` de los 2 índices GIN trigram de contactos (drift de objetos raw SQL legítimos) → se eliminaron del migration.sql por protocolo; verificado post-apply que ambos índices siguen vivos. Aplicada en dev (3 orgs × 8 = 24 tipos), checksum resincronizado.

**Entrega**: `TenantsService.create()` invoca el seed dentro de la TX de creación.
El tenant nace listo (con 8 tipos) o no nace.

**Archivos** (modificados):
- `backend/src/tenants/tenants.service.ts`
  — inyectar `@Inject(TIPO_DOCUMENTO_FISICO_SEEDER_PORT) private readonly tiposDocSeeder: TipoDocumentoFisicoSeederPort`.
  Modificar `create()` para envolver en `prisma.$transaction` y llamar
  `await this.tiposDocSeeder.seedDefaultsForTenant(tenant.id, tx)` después de crear el tenant.
  Ver design §7.2 para pseudocódigo completo con `PrismaService.$transaction`.
- `backend/src/tenants/tenants.module.ts`
  — importar `TiposDocumentoFisicoModule`.
- `backend/src/tipos-documento-fisico/seed/tipos-universales.ts` (o constante en el
  seeder adapter) — la lista `TIPOS_UNIVERSALES` de 8 items ahora incluye
  `tiposComprobanteAplicables` por cada tipo. Ver design §D3 para la tabla exacta.
  El `upsert` por `(organizationId, codigo)` se extiende para incluir
  `tiposComprobanteAplicables` en el `update`/`create`. Idempotente — re-run actualiza
  el campo si cambió.
- `backend/src/tenants/tenants.service.spec.ts`
  — agregar mock de `TIPO_DOCUMENTO_FISICO_SEEDER_PORT`. Caso: crear tenant exitoso →
  mock del seeder fue llamado con el tenantId correcto. Caso: seeder falla →
  tenant no se crea (TX rollback — verificar que el mock de repo.create NO persistió).

**Tests que se agregan**: 3 unit specs en `tenants.service.spec.ts`.

**Verificación**: `npx tsc --noEmit` + `npx jest src/tenants/` verde.

**Cubre**: REQ-T-08, REQ-SEED-01 (matriz actualizada), REQ-SEED-03 (síncrono en TX). D3 (seed al crear tenant, con tiposComprobanteAplicables).

---

## Fase 10 — E2E tests

### 10.1 ☑ `test(tipos-documento-fisico): add e2e for tipos catalog CRUD`

> **Nota apply (commit `f68836d`)**: 12 escenarios verdes. La org de fixtures se crea
> directo por Prisma (`prisma.organization.create`) → arranca SIN tipos sembrados (control
> total del catálogo). 403 (E-MT-04): miembro con `CustomRole` de permisos limitados (sin
> `systemRole` → no es OWNER/ADMIN, entra al chequeo de wildcards). El `cleanupTestData` de
> `test/helpers/test-factory.ts` se extendió con las 3 tablas nuevas (`comprobanteDocumentoFisico`,
> `documentoFisico`, `tipoDocumentoFisico`) en orden de FK — incluido en este commit.

**Entrega**: suite E2E completa para el catálogo de tipos.

**Archivos** (nuevos):
- `backend/test/tipos-documento-fisico.e2e-spec.ts`
  — Escenarios cubiertos:
  - E-T-01: crear tipo no-tributario exitoso → 201.
  - E-T-02: código duplicado mismo tenant → 409 con `TIPO_DOCUMENTO_FISICO_CODIGO_DUPLICADO`.
  - E-T-03: nombre duplicado mismo tenant → 409 con `TIPO_DOCUMENTO_FISICO_NOMBRE_DUPLICADO`.
  - E-T-04: código con formato inválido → 400.
  - E-T-05: mismo código en tenants distintos → 201 (aislamiento multi-tenant).
  - E-T-06: editar nombre → 200.
  - E-T-07: campo `codigo` ignorado en PATCH → no retorna error, valor no cambia.
  - E-T-08: eliminar tipo sin docs → 204.
  - E-T-09: eliminar tipo con docs → 409 con `TIPO_DOCUMENTO_FISICO_CON_DOCUMENTOS`.
  - E-T-10: listado ordena tributarios primero, sin registros de otro tenant.
  - E-MT-03: sin JWT → 401.
  - E-MT-04: sin permiso → 403.

**Tests que se agregan**: ≥ 12 E2E scenarios.

**Verificación**: `DATABASE_URL=... JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh npx jest test/tipos-documento-fisico --runInBand --forceExit` verde.

**Cubre**: E-T-01 a E-T-10, REQ-S-01 a REQ-S-04.

---

### 10.2 ☑ `test(documentos-fisicos): add e2e for documentos CRUD and listado`

> **Nota apply (commits `40861c9` fix + `5a8508d` e2e)**: 27 escenarios verdes.
> - **Gap encontrado y corregido (E-D-07)**: el spec REQ-D-01 + E-D-07 exigen `monto > 0`
>   (400 a nivel DTO), pero Fases 5/6 nunca lo implementaron — un documento tributario con
>   `monto: "0.00"` devolvía 201. Fix en commit aparte `40861c9`: `@Matches(DECIMAL_POSITIVO)`
>   en `create`/`update` DTO (`/^(?!0+(\.0+)?$)\d+(\.\d+)?$/`, análogo a `DECIMAL_NO_NEG` de
>   comprobantes) + unit spec del DTO. Decisión del usuario: implementar ahora (la rama no está
>   mergeada, completar el invariante es parte del apply).
> - **E-D-10** (contacto de otro tenant): el service lanza `ContactoNoEncontradoError` →
>   404 `CONTACTO_NO_ENCONTRADO` (no un error propio del módulo).
> - **E-D-13** (round-trip de monto): `Decimal.toString()` descarta ceros finales
>   ("1150.00" → "1150"), igual que en comprobantes. El test usa `"1150.55"` para una aserción
>   determinística.
> - Los escenarios de mutabilidad/eliminación (E-E-02/03/04, E-EL-03, E-D-11/12) requieren
>   maquinaria de comprobantes (gestión + cuentas + asociar/contabilizar), montada con helpers
>   en la misma suite.

**Entrega**: suite E2E del módulo operativo.

**Archivos** (nuevos):
- `backend/test/documentos-fisicos.e2e-spec.ts`
  — Escenarios cubiertos:
  - E-D-01: crear documento no-tributario → 201 con tipo embebido.
  - E-D-02: normalización número (trim + uppercase) → `numero: "A-001"`.
  - E-D-03: número duplicado mismo tipo y tenant → 409.
  - E-D-04: mismo número con tipo distinto → 201.
  - E-D-05: tipo inactivo no permite crear → 422.
  - E-D-06: tipo de otro tenant → 404.
  - E-D-07: monto = "0.00" → 400.
  - E-D-08: documento con contacto válido → 201 con contacto embebido.
  - E-D-09: contacto inactivo → 201 (permitido al crear).
  - E-D-10: contacto de otro tenant → 404.
  - E-D-11: listar con filtro `estadoAsociacion=SUELTO`.
  - E-D-12: GET /:id incluye `comprobantesAsociados`.
  - E-MT-01: listado no retorna registros de otro tenant.
  - E-MT-02: acceso cross-tenant → 404.
  - E-MT-03: sin JWT → 401.
  - E-MT-04: sin permiso → 403.
  - E-E-01: editar documento suelto → 200.
  - E-E-02: editar documento en borrador → 200.
  - E-E-03: editar documento contabilizado → 409.
  - E-E-04: editar documento en borrador + contabilizado → 409.
  - E-E-05: normalización en PATCH también aplica uppercase.
  - E-EL-01: eliminar documento nunca asociado → 204.
  - E-EL-03: eliminar documento con borrador activo → 409.
  - **E-D-13**: crear documento tributario con monto + moneda → 201.
  - **E-D-14**: crear documento tributario sin monto → 422 `DOCUMENTO_FISICO_MONTO_REQUERIDO_PARA_TRIBUTARIO`.
  - **E-D-15**: crear documento no-tributario sin monto → 201 (monto null en respuesta).
  - **E-D-16**: crear documento no-tributario con monto → 422 `DOCUMENTO_FISICO_MONTO_NO_PERMITIDO_PARA_NO_TRIBUTARIO`.

**Tests que se agregan**: ≥ 27 E2E scenarios.

**Verificación**: `DATABASE_URL=... npx jest test/documentos-fisicos --runInBand --forceExit` verde.

**Cubre**: E-D-01 a E-D-16, E-MT-01 a E-MT-04, E-E-01 a E-E-05, E-EL-01, E-EL-03. REQ-D-13, REQ-D-14.

---

### 10.3 ☑ `test(documentos-fisicos): add e2e for asociacion and contabilizar`

> **Nota apply (commit `9cf9796`)**: 17 escenarios verdes. Desvíos vs el texto original
> (escrito antes de implementar la capa HTTP):
> - **Status de asociar**: el POST `/:comprobanteId/documentos-fisicos` NO tiene `@HttpCode`
>   → devuelve **201** (default), no 200 como decían E-A-01/02/08/10/11. Los tests asertan 201.
> - **E-A-03 código real**: el conflicto del UNIQUE PARCIAL emite
>   `DOCUMENTO_FISICO_YA_ASOCIADO_A_OTRO_CONTABILIZADO` (409), NO
>   `COMPROBANTE_DOCUMENTO_FISICO_YA_CONTABILIZADO` del texto. Se asertó el código real.
> - **E-A-07 código**: doc de otro tenant → 404 `COMPROBANTE_DOCUMENTO_FISICO_NO_EXISTE`
>   (de `comprobantes/domain`, no de `documentos-fisicos`).
> - **E-SEED**: la org se crea por el flujo real `POST /api/tenants {modulo: CONTABILIDAD}`
>   (siembra 8 tipos + 111 cuentas) + re-login para que el JWT lleve `activeTenantId` de la
>   nueva org (CLAUDE.md §4.2 — tenantId sale del JWT, no de header). Matriz de
>   `tiposComprobanteAplicables` comparada importando `TIPOS_UNIVERSALES`.
> - **E-SEED-02 idempotencia**: no hay endpoint para re-disparar el seed → se obtiene el
>   `TipoDocumentoFisicoSeederPort` del contenedor DI (`app.get(SYMBOL, { strict: false })`)
>   y se re-ejecuta `seedDefaultsForTenant`; el upsert mantiene 8 (no 16).
> - **E-T-11/12**: el `codigo` respeta `@MaxLength(20)` (códigos cortos kebab-case).

**Entrega**: suite E2E del flujo de asociación + contabilizar + anular.
Cubre el caso crítico del UNIQUE PARCIAL (concurrencia simulada).

**Archivos** (nuevos):
- `backend/test/documentos-fisicos-asociacion.e2e-spec.ts`
  — Escenarios cubiertos:
  - E-A-01: asociar un documento a borrador → 200.
  - E-A-02: asociar el mismo documento a dos borradores → ambos 200.
  - E-A-03 (crítico): contabilizar `comp-A` con `doc-1` → OK; contabilizar `comp-B` con
    el mismo `doc-1` → 409 `COMPROBANTE_DOCUMENTO_FISICO_YA_CONTABILIZADO`.
    Esto simula el race mediante ejecución secuencial (la BD garantiza el constraint).
  - E-A-04: desasociar documento de borrador → 204.
  - E-A-05: desasociar documento de contabilizado → 409.
  - E-A-06: anular comprobante contabilizado → docs quedan SUELTOS y re-asociables.
  - E-A-07: asociar doc de otro tenant → 404.
  - E-A-08: asociar múltiples docs en una llamada → 200.
  - **E-A-09**: asociar Recibo de Egreso a Comprobante INGRESO → 422 `TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE`.
  - **E-A-10**: asociar Factura Emitida a Comprobante INGRESO → 200 (tipo incluido en lista).
  - **E-A-11**: asociar Comprobante Interno a Comprobante TRASPASO → 200 (lista con todos los 7 tipos).
  - E-SEED-01: crear org nueva → GET tipos devuelve exactamente 8 tipos con los codes correctos.
  - E-SEED-02: idempotencia del seed → 2 runs → 8 tipos, no 16.
  - E-SEED-03: tipos sembrados son editables (PATCH `activo: false`).
  - **E-SEED-04**: post-creación de tenant, cada tipo tiene `tiposComprobanteAplicables` exactamente según la matriz de REQ-SEED-01.
  - **E-T-11**: crear tipo con `tiposComprobanteAplicables: ["EGRESO", "DIARIO"]` → 201 con el array en respuesta.
  - **E-T-12**: crear tipo con `tiposComprobanteAplicables: []` → 201 (array vacío válido).

**Tests que se agregan**: ≥ 16 E2E scenarios.

**Verificación**: `DATABASE_URL=... npx jest test/documentos-fisicos-asociacion --runInBand --forceExit` verde.

**Cubre**: E-A-01 a E-A-11, E-SEED-01 a E-SEED-04, E-T-11, E-T-12. REQ-A-11, REQ-T-10. R3 (race en contabilizar). D11 (compatibilidad tipo).

---

## Fase 11 — Cierre y documentación

### 11.1 ☑ `docs(disenos): clarify documento-fisico association is cabecera-cabecera`

> **Nota apply (commit `27f0e3f`)**: el doc NO contenía ninguna afirmación de
> `LineaComprobante.documentoFisicoId` (la premisa de "remover" era hipotética — R7 no se
> materializó en este doc). En su lugar se AGREGÓ una aclaración en §12.3 (la asociación es
> cabecera-cabecera vía `comprobante_documento_fisico`, no hay columna a nivel línea) +
> referencias al nuevo `docs/disenos/documento-fisico.md` en §12.2 y §13. Cierra R7.

**Entrega**: actualizar `docs/disenos/comprobantes-asientos.md` §12.3 para
reflejar la decisión cabecera-cabecera (proposal Decisión 8 / design D1).
Retirar o aclarar cualquier mención a `LineaComprobante.documentoFisicoId`.

**Archivos** (modificados):
- `backend/docs/disenos/comprobantes-asientos.md` o `docs/disenos/comprobantes-asientos.md`
  — actualizar §12.3: reemplazar la nota de forward-compat de `documentoFisicoId` por
  la referencia a `ComprobanteDocumentoFisico` (tabla de asociación cabecera-cabecera,
  documentada en `docs/disenos/documento-fisico.md`).

**Tests que se agregan**: ninguno.

**Verificación**: diff legible, sin mentions de `documentoFisicoId` en `LineaComprobante`.

**Cubre**: R7 (contradicción documental), design D1 (acción de doc).

---

### 11.2 ☑ `docs(disenos): add documento-fisico design doc`

> **Nota apply (commit `ac897a6`)**: `docs/disenos/documento-fisico.md` creado con el header
> estándar de versionado. Versión simplificada del design (no las 1570 líneas): schema de los
> 3 modelos + UNIQUE PARCIAL, módulos/estructura, ports clave, tabla D1-D11, matriz exacta de
> los 8 tipos universales, flujos (asociar/contabilizar/anular) con códigos de error reales,
> riesgos R1-R7, forward-compat slice 3 (Factura) y slice 4 (LCV). Fiel al as-built.

**Entrega**: doc de diseño persistido en `docs/disenos/` para referencia futura
de devs, auditores y próximas fases.

**Archivos** (nuevos):
- `docs/disenos/documento-fisico.md` — copia simplificada del design del openspec
  con el encabezado estándar del repo:
  ```
  <!-- Última edición: YYYY-MM-DD. Última revisión contra core: YYYY-MM-DD. Owner: backend-lead -->
  ```
  Incluir: schema, módulos, ports clave, decisiones D1-D9, riesgos R1-R7,
  forward-compat para slice 3 (Factura) y slice 4 (LCV).

**Tests que se agregan**: ninguno.

**Verificación**: archivo creado, sin errores de tsc.

**Cubre**: CLAUDE.md §12 (docs extendidos), R7.

---

### 11.3 ☑ `docs: update deudas-arquitecturales.md for slice 2 completion`

> **Nota apply (commit `d1fd367`)**: nueva subsección §3.6. Cerradas: `contabilidad.contactos.*`
> en `catalogo.ts` (8.1) + el `monto > 0` (gap destapado por el E2E, fix en `40861c9`). Abiertas:
> E-EL-02 (historial de asociaciones / tabla de auditoría), estado derivado materializable (R5),
> reapertura + `refrescarEstadoComprobante` (R1/D8), y el campo `descripcion` diferido (task 6.1).
> Scope `docs:` en vez de `chore(infra)` — es cambio de documentación (§9.1).

**Entrega**: actualizar `docs/deudas-arquitecturales.md` con:
- Deudas cerradas en este slice: `contabilidad.contactos.*` en `catalogo.ts`.
- Deudas abiertas por este slice:
  - E-EL-02 (`DOCUMENTO_FISICO_CON_HISTORIAL`): requiere tabla de auditoría de
    asociaciones para rastrear docs que tuvieron asociación y luego se anularon.
    Actualmente un doc cuya asociación se eliminó al anular es elegible para DELETE.
  - Estado derivado `SUELTO|EN_BORRADOR|CONTABILIZADO`: materializable como columna
    si el listado por estado se vuelve lento (>100k filas).
  - Reapertura de período + `refrescarEstadoComprobante`: enchufe pendiente en
    `PeriodosFiscalesModule` cuando se implemente reapertura.

**Archivos** (modificados):
- `docs/deudas-arquitecturales.md` o equivalente en el repo.

**Tests que se agregan**: ninguno.

**Verificación**: commit limpio, doc legible.

**Cubre**: D8 (estado BLOQUEADO + reapertura), D7 (historial de asociaciones).

---

## Estimación

| Fase | Commits | Tiempo estimado |
|------|---------|-----------------|
| 1 — Schema | 1 | ~40 min (schema + migration manual) |
| 2 — Domain VOs | 2 | ~1h (VOs + errores + tests) |
| 3 — Ports | 2 | ~30 min (interfaces puras) |
| 4 — Adapters + integration | 5 | ~3h (lo más costoso: integration specs con Postgres) |
| 5 — Services + unit specs (TDD) | 3 | ~2.5h (30+ unit specs con mocks) |
| 6 — Controllers + DTOs | 3 | ~1.5h (capa HTTP) |
| 7 — Wiring comprobantes | 2 | ~1h (modifica código existente — riesgoso, probar bien) |
| 8 — RBAC | 1 | ~20 min |
| 9 — Seed al crear tenant | 1 | ~45 min |
| 10 — E2E tests | 3 | ~2.5h (flujos completos HTTP) |
| 11 — Docs + cierre | 3 | ~40 min |
| **Total** | **26 commits** | **~14h efectivos** |

---

## Dependencias entre fases

```
1 (schema) → 2 (VOs) → 3 (ports) → 4 (adapters) → 5 (services) → 6 (controllers)
                                                                         ↓
                                                               7 (wiring comprobantes)
                                                                         ↓
                                                               8 (RBAC) → 9 (seed)
                                                                         ↓
                                                              10 (E2E) → 11 (docs)
```

- Fases 5 y 6 se pueden paralelizar PARCIALMENTE (unit specs del service antes que
  el controller, pero los DTOs del controller pueden adelantarse en paralelo con el service).
- Fase 8 (RBAC) no depende de adapters — puede hacerse antes de fase 4 si se quiere
  cerrar la deuda de `contactos.*` rápido.
- Fase 10 depende de TODO 1-9 verde.

---

## Risks recordatorios desde design

| Riesgo | Commit donde se mitiga |
|--------|------------------------|
| R1 (drift cache `comprobanteEstado`) | 4.4 (integration spec verifica cache), 7.1 (refrescar en TX) |
| R2 (migration manual no idempotente) | 1.1 (`IF NOT EXISTS` en SQL) |
| R3 (race en contabilizar) | 4.4 (integration spec), 7.1 (UNIQUE PARCIAL + defense in depth), 10.3 (E2E) |
| R4 (TX larga al crear tenant) | 9.1 (aceptado; 8 INSERTs pequeños) |
| R5 (N+1 en filtro estado derivado) | 4.3 (Prisma `where: { asociaciones: { some: {} } }` — revisar plan) |
| R6 (eliminación post-anulación) | 5.2 (documentado como `it.todo`), 11.3 (deuda en el doc) |
| R7 (contradicción documental) | 11.1 (actualizar comprobantes-asientos.md) |

## Commit de mayor riesgo

**4.4** (`PrismaAsociacionComprobanteRepository`): es el corazón del UNIQUE PARCIAL.
✅ **RESUELTO (commit `988698c`)**. El integration spec confirmó empíricamente que Prisma
NO reporta el nombre del índice en `meta.target`, sino el shape normalizado de campos:
`["documentoFisicoId"]` (1 campo) para el UNIQUE PARCIAL, `["documentoFisicoId", "comprobanteId"]`
(2 campos) para el UNIQUE normal. El adapter distingue por longitud del array y mapea el
parcial a `DocumentoFisicoYaAsociadoAOtroContabilizadoError`. Verificado: el race deliberado
en el spec devuelve el `DomainError` (no un 500 genérico). Esto invalida la suposición original
de mapear por nombre de índice — ver corrección en 7.1.

**7.1** (`contabilizar` + integración documentos): modifica código existente y testeado.
Riesgo de regresión. Mitigación: correr la suite completa de `comprobantes` antes de
hacer commit, incluyendo los tests E2E existentes de comprobantes.
