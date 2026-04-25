# Design: documento-fisico

> Fecha: 2026-04-25
> Fase: design
> Slice: 2 de Fase 1.4
> Proyecto: avicont
> Owner: backend-lead

---

## 0. Convenciones del documento

- Las decisiones del proposal son **input cerrado**. Este doc baja a schema /
  módulos / ports / wiring concreto.
- En el código y BD, el campo de tenant se llama `organizationId` (es la
  convención del repo, ver `Comprobante`, `Contacto`, etc.). En este doc
  uso "tenant" semánticamente y `organizationId` cuando hablo de schema.
  Los puertos del proyecto reciben el parámetro como `tenantId: string`
  por convención (ver `ContactosReaderPort`) — mantenemos esa firma.
- Toda integración con `comprobantes` reusa el patrón ya establecido por
  `CONTACTOS_READER_PORT` (Fase 1.4 slice 1).

---

## 1. Schema Prisma (migration aditiva)

### 1.1 Modelo `TipoDocumentoFisico`

Catálogo per-tenant de tipos de documento físico. El admin del tenant lo
configura (parte del seed inicial, ampliable).

```prisma
// Tipo de documento físico: catálogo per-tenant del papel que respalda
// asientos contables. Los flag `esTributario=true` anticipan la futura
// relación 1:1 con `Factura` (slice 3 de Fase 1.4).
//
// Seed universal (8 tipos) al crear la organización. Editable y
// desactivable. NO eliminable si tiene documentos asociados (FK Restrict
// desde DocumentoFisico).
model TipoDocumentoFisico {
  id             String  @id @default(uuid())
  organizationId String

  // 1..100 chars, no vacío. Mostrado en UI al contador.
  nombre         String
  // 1..20 chars, kebab-case alfanumérico. Estable, único per-tenant.
  // Se usa para queries internas y como ancla del seed (idempotencia).
  codigo         String

  // Flag que distingue documentos tributarios (factura, nota crédito,
  // nota débito) de no-tributarios (recibo, vale, comprobante interno).
  // Anticipa el slice 3: cuando esTributario=true, exigirá Factura
  // adjunta antes de poder asociar a Comprobante CONTABILIZADO.
  esTributario   Boolean @default(false)

  // Soft-toggle de visibilidad. NO es soft-delete (CLAUDE.md §4.7) —
  // este modelo es catálogo, no documento contable. Inactivo = no
  // aparece en listas de creación; los documentos existentes lo
  // conservan como FK.
  activo         Boolean @default(true)

  // Lista explícita de tipos de comprobante con los que este tipo de
  // documento puede asociarse (proposal Decisión 11). Array nativo
  // Postgres de enum. Lista vacía = ningún tipo aplica (no wildcard).
  // El service valida esta lista al ejecutar POST /comprobantes/:id/documentos-fisicos.
  // El admin del tenant puede editarla vía PATCH.
  tiposComprobanteAplicables TipoComprobante[]

  createdAt       DateTime @default(now())
  createdByUserId String?
  updatedAt       DateTime @updatedAt

  organization     Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  documentos       DocumentoFisico[]

  @@unique([organizationId, codigo])
  @@index([organizationId, activo])
  @@map("tipos_documento_fisico")
}
```

**Notas:**
- `codigo` cumple dos roles: ID estable para el seed (idempotencia vía
  `upsert` por `(organizationId, codigo)`) y para queries internas. El
  `nombre` es libre y editable.
- `createdByUserId` es nullable porque el seed corre sin user context
  (sin `createdAt` audit del usuario humano — corre el sistema).
- No hay descripcion explícita; si emerge el caso, se agrega después.

### 1.2 Modelo `DocumentoFisico`

Cabecera del papel: tipo, número, fecha de emisión, monto, moneda,
contacto opcional. Tabla central del slice.

```prisma
// DocumentoFisico = el papel que respalda asientos contables.
// Cardinalidad N:M con Comprobante vía ComprobanteDocumentoFisico.
// Inmutable cuando está asociado a un comprobante CONTABILIZADO
// (Decisión 5 del proposal). Eliminable solo si nunca tuvo asociaciones.
model DocumentoFisico {
  id             String  @id @default(uuid())
  organizationId String

  tipoDocumentoFisicoId String

  // Número impreso en el papel. Normalizado en el VO NumeroDocumento:
  // trim + uppercase. Regex: ^[A-Z0-9./-]+$, longitud 1..50.
  // Decisión 3 del proposal: 0042 ≠ 42 (string exacto).
  numero         String

  // FechaContable: calendario puro, sin UTC, sin hora (CLAUDE.md §4.6).
  fechaEmision   DateTime @db.Date

  // Monto nullable por Decisión 4 (actualizada): obligatorio solo si
  // tipo.esTributario=true. Para documentos no-tributarios (recibo, vale,
  // comprobante interno) debe ser NULL — el monto vive en el Comprobante.
  // Para documentos tributarios (factura, nota c/d), es el total del papel
  // impreso (neto + IVA + IT). Decimal(18,2) para BOB/USD.
  // Validación condicional en service: ver proposal Decisión 4.
  monto          Decimal? @db.Decimal(18, 2)
  // Moneda nullable por la misma razón que monto. Sin default — el service
  // la asigna explícitamente solo si es tributario. BOB|USD.
  moneda         Moneda?

  // Glosa libre opcional, hasta 500 chars (descripción que el contador
  // tipea sobre el papel: "Pago a proveedor X", "Anticipo de salario").
  glosa          String?

  // Contacto opcional. Si esTributario=true (slice 3) será obligatorio
  // a través de Factura; en este slice se mantiene opcional para que
  // recibos sin contacto puedan registrarse.
  contactoId     String?

  createdAt       DateTime @default(now())
  createdByUserId String
  updatedAt       DateTime @updatedAt

  organization     Organization                 @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  // Restrict: no se puede eliminar un TipoDocumentoFisico si tiene
  // documentos asociados (deuda histórica protegida).
  tipoDocumento    TipoDocumentoFisico          @relation(fields: [tipoDocumentoFisicoId], references: [id], onDelete: Restrict)
  contacto         Contacto?                    @relation(fields: [contactoId], references: [id], onDelete: Restrict)
  asociaciones     ComprobanteDocumentoFisico[]

  // Unicidad: el mismo número del mismo tipo no se duplica per-tenant.
  // Defense in depth (CLAUDE.md §4.8): UNIQUE en BD + check en service.
  @@unique([organizationId, tipoDocumentoFisicoId, numero])

  // Filtros típicos del listado.
  @@index([organizationId, fechaEmision])
  @@index([organizationId, contactoId])
  @@index([organizationId, tipoDocumentoFisicoId])
  @@map("documentos_fisicos")
}
```

**Notas:**
- NO existe campo `estado` propio. El estado se deriva en runtime de la
  asociación (proposal Decisión 5 + cuestiones diferidas §3). Si emerge
  necesidad de query rápida por estado, se materializa después.
- NO existe `tipoCambio` ni multi-moneda real — Decisión 4 del proposal.
  El slice de `Factura` (slice 3) introduce los campos tributarios
  completos (NIT emisor, IVA, IT, etc.) y multi-moneda con tipo de
  cambio.
- `monto` y `moneda` son **nullable** desde el schema (Decisión 4
  actualizada). La obligatoriedad para documentos tributarios se enforza
  en el service, no en la BD. Para slice 3, `Factura` hereda
  `DocumentoFisico.monto` como el total del comprobante fiscal.

### 1.3 Tabla intermedia `ComprobanteDocumentoFisico`

Asociación N:M con cardinalidad lógica controlada vía UNIQUE PARCIAL.

```prisma
// Asociación N:M entre Comprobante y DocumentoFisico, a NIVEL CABECERA
// (proposal Decisión 8). La denormalización de organizationId permite
// queries y validaciones sin JOIN, consistente con LineaComprobante.
//
// Cardinalidad efectiva (proposal Decisión 2):
//   - Un Comprobante puede asociar 0..N DocumentosFisicos.
//   - Un DocumentoFisico puede aparecer en N comprobantes BORRADOR,
//     pero a lo sumo 1 comprobante CONTABILIZADO simultáneo.
//
// El segundo invariante se enforza con un UNIQUE PARCIAL raw SQL
// (Postgres `WHERE`), porque Prisma no expresa unique parciales nativos.
model ComprobanteDocumentoFisico {
  id             String   @id @default(uuid())
  organizationId String   // denormalizado para queries multi-tenant

  comprobanteId     String
  documentoFisicoId String

  // Cache denormalizado del estado del Comprobante en el momento de
  // la asociación. Actualizado por ComprobantesService en la misma TX
  // que cambia el estado del Comprobante. Necesario para que el
  // UNIQUE PARCIAL ("WHERE comprobanteEstado = 'CONTABILIZADO'")
  // funcione sin JOIN en el índice. Riesgo R1 documentado abajo.
  comprobanteEstado EstadoComprobante

  createdAt DateTime @default(now())

  organization    Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  // CASCADE desde Comprobante: si el comprobante se elimina (BORRADOR
  // descartado), las asociaciones se borran. Los DocumentosFisicos
  // sobreviven.
  comprobante     Comprobante      @relation(fields: [comprobanteId], references: [id], onDelete: Cascade)
  // Restrict desde DocumentoFisico: no se puede eliminar un documento
  // físico que tiene asociaciones (queda como histórico, proposal D5).
  documentoFisico DocumentoFisico  @relation(fields: [documentoFisicoId], references: [id], onDelete: Restrict)

  // No se duplica una asociación específica.
  @@unique([documentoFisicoId, comprobanteId])

  @@index([organizationId])
  @@index([comprobanteId])
  @@index([documentoFisicoId])
  @@map("comprobante_documento_fisico")
}
```

### 1.4 UNIQUE PARCIAL — raw SQL en migration

Prisma 5 no expresa `WHERE` en `@@unique`. Se aplica como SQL raw
**dentro de la misma migration**, después de los `CREATE TABLE`. La
migration la genera Prisma automáticamente; agregamos el `CREATE INDEX`
manual al final del `migration.sql` antes de aplicar:

```sql
-- Asegura que un DocumentoFisico esté asociado a a lo sumo UN comprobante
-- CONTABILIZADO simultáneamente. En BORRADOR no aplica restricción.
-- Ver proposal Decisión 2 y Riesgo R4.
CREATE UNIQUE INDEX IF NOT EXISTS "comprobante_documento_fisico_unique_contabilizado"
  ON "comprobante_documento_fisico" ("documentoFisicoId")
  WHERE "comprobanteEstado" = 'CONTABILIZADO';
```

**Notas operativas:**
- `IF NOT EXISTS` lo hace idempotente.
- El nombre `comprobante_documento_fisico_unique_contabilizado` es el
  identificador estable que el `GlobalExceptionFilter` matchea en
  `meta.target` para mapear a la `DomainError` (sección 5.5).
- El SQL se incluye en `prisma/migrations/<timestamp>_add_documento_fisico_and_tipo_and_asociacion/migration.sql`
  bajo un comentario "-- Manual UNIQUE PARTIAL — proposal D2".

### 1.5 Migration name

`add-documento-fisico-and-tipo-and-asociacion`

Comando local:

```bash
cd backend
DATABASE_URL=... npx prisma migrate dev --name add-documento-fisico-and-tipo-and-asociacion
# Editar migration.sql para agregar el CREATE UNIQUE INDEX … WHERE … al final.
DATABASE_URL=... npx prisma migrate deploy
```

### 1.6 Cambios en otros modelos del schema

- `Organization` (`schema.prisma` sección modelos):
  - Agregar relaciones inversas:
    - `tiposDocumentoFisico  TipoDocumentoFisico[]`
    - `documentosFisicos     DocumentoFisico[]`
    - `comprobantesDocumentosFisicos ComprobanteDocumentoFisico[]`
- `Contacto`:
  - Agregar relación inversa `documentosFisicos DocumentoFisico[]`.
- `Comprobante`:
  - Agregar relación inversa `documentosFisicosAsociados ComprobanteDocumentoFisico[]`.
- `LineaComprobante`:
  - **NO se toca**. Decisión 8 del proposal: la asociación es a nivel
    cabecera, no línea.

---

## 2. Estructura de los módulos nuevos

Dos módulos hexagonales separados (consistente con la separación de
permisos del proposal Decisión 7):

### 2.1 Módulo `tipos-documento-fisico`

Catálogo simple, admin-flavor.

```
backend/src/tipos-documento-fisico/
├── domain/
│   ├── tipo-documento-fisico-codigo.ts        VO kebab-case alfanumérico, 1..20.
│   ├── tipo-documento-fisico-codigo.spec.ts
│   ├── tipo-documento-fisico-nombre.ts        VO 1..100 chars, no vacío post-trim.
│   ├── tipo-documento-fisico-nombre.spec.ts
│   ├── tipo-documento-fisico-errors.ts        DomainError subclasses del catálogo.
│   ├── tipo-documento-fisico-validator.ts     Funciones puras: validarNombre, validarCodigo, normalizar.
│   └── tipo-documento-fisico-validator.spec.ts
│
├── ports/
│   ├── tipo-documento-fisico.repository.port.ts        INTERNAL al módulo.
│   ├── tipos-documento-fisico-reader.port.ts           CROSS-MODULE — consumido por documentos-fisicos.
│   └── tipos-documento-fisico-seeder.port.ts           CROSS-MODULE — consumido por tenants para seed inicial.
│
├── adapters/
│   ├── prisma-tipo-documento-fisico.repository.ts
│   ├── prisma-tipo-documento-fisico.repository.integration.spec.ts
│   ├── prisma-tipos-documento-fisico-reader.adapter.ts
│   └── prisma-tipos-documento-fisico-seeder.adapter.ts
│
├── dto/
│   ├── create-tipo-documento-fisico.dto.ts
│   ├── update-tipo-documento-fisico.dto.ts
│   └── tipo-documento-fisico-response.dto.ts
│
├── tipos-documento-fisico.service.ts
├── tipos-documento-fisico.service.spec.ts
├── tipos-documento-fisico.controller.ts
└── tipos-documento-fisico.module.ts
```

### 2.2 Módulo `documentos-fisicos`

Operativo: cargado a diario por el contador.

```
backend/src/documentos-fisicos/
├── domain/
│   ├── numero-documento.ts                    VO regex ^[A-Z0-9./-]+$, 1..50, normaliza trim+upper.
│   ├── numero-documento.spec.ts
│   ├── documento-fisico-errors.ts             DomainError subclasses (NotFound, NumeroDuplicado, Inmutable, etc.).
│   ├── documento-fisico-validator.ts          Funciones puras: validarMonto>0, validarGlosa, etc.
│   └── documento-fisico-validator.spec.ts
│
├── ports/
│   ├── documento-fisico.repository.port.ts    INTERNAL.
│   ├── asociacion-comprobante.repository.port.ts INTERNAL — operaciones sobre ComprobanteDocumentoFisico.
│   └── documentos-fisicos-reader.port.ts      CROSS-MODULE — consumido por comprobantes.
│
├── adapters/
│   ├── prisma-documento-fisico.repository.ts
│   ├── prisma-documento-fisico.repository.integration.spec.ts
│   ├── prisma-asociacion-comprobante.repository.ts
│   ├── prisma-asociacion-comprobante.repository.integration.spec.ts
│   └── prisma-documentos-fisicos-reader.adapter.ts
│
├── dto/
│   ├── create-documento-fisico.dto.ts
│   ├── update-documento-fisico.dto.ts
│   ├── listar-documentos-fisicos.dto.ts        query DTO con filtros + paginación.
│   ├── asociar-documentos.dto.ts               body para POST /comprobantes/:id/documentos-fisicos.
│   └── documento-fisico-response.dto.ts
│
├── documentos-fisicos.service.ts
├── documentos-fisicos.service.spec.ts
├── documentos-fisicos.controller.ts            endpoints standalone /api/documentos-fisicos.
└── documentos-fisicos.module.ts
```

**Endpoints de asociación** viven en `comprobantes.controller.ts` (no
acá), siguiendo el sub-recurso `/api/comprobantes/:id/documentos-fisicos`
(proposal Decisión 9).

---

## 3. Ports

### 3.1 `TipoDocumentoFisicoRepositoryPort` (interno)

```typescript
// tipos-documento-fisico/ports/tipo-documento-fisico.repository.port.ts

import type { Prisma, TipoDocumentoFisico } from '@prisma/client';

export const TIPO_DOCUMENTO_FISICO_REPOSITORY_PORT = Symbol(
  'TIPO_DOCUMENTO_FISICO_REPOSITORY_PORT',
);

export interface TipoDocumentoFisicoCreateData {
  nombre: string;
  codigo: string;
  esTributario: boolean;
  createdByUserId: string | null;
}

export interface TipoDocumentoFisicoUpdateData {
  nombre?: string;
  esTributario?: boolean;
  // codigo NO es editable: estable post-create (es el ancla del seed
  // y de queries cross-módulo). Si emerge el caso, se relaja después.
}

export interface TipoDocumentoFisicoSeedRow {
  codigo: string;
  nombre: string;
  esTributario: boolean;
  tiposComprobanteAplicables: TipoComprobante[];
}

export abstract class TipoDocumentoFisicoRepositoryPort {
  abstract create(
    tenantId: string,
    data: TipoDocumentoFisicoCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoDocumentoFisico>;

  abstract findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoDocumentoFisico | null>;

  abstract findByCodigo(
    tenantId: string,
    codigo: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoDocumentoFisico | null>;

  /** Lista paginada con filtros activo + búsqueda parcial. */
  abstract listar(
    tenantId: string,
    filtros: { activo?: boolean | 'all'; q?: string },
    pagination: { page: number; limit: number },
    tx?: Prisma.TransactionClient,
  ): Promise<{ items: TipoDocumentoFisico[]; total: number }>;

  abstract update(
    tenantId: string,
    id: string,
    data: TipoDocumentoFisicoUpdateData,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoDocumentoFisico>;

  abstract setActivo(
    tenantId: string,
    id: string,
    activo: boolean,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoDocumentoFisico>;

  /**
   * Cuenta documentos físicos asociados al tipo. >0 ⇒ no eliminable.
   * Defense in depth contra la FK Restrict.
   */
  abstract countDocumentosFisicos(
    tenantId: string,
    tipoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  abstract eliminar(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  /**
   * Upsert idempotente para el seed inicial. Ejecuta `upsert` por
   * `(organizationId, codigo)` — re-correr es no-op si ya existen.
   * Usado por `TipoDocumentoFisicoSeederPort.seedDefaultsForTenant`.
   */
  abstract upsertSeed(
    tenantId: string,
    seeds: TipoDocumentoFisicoSeedRow[],
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
}
```

### 3.2 `TiposDocumentoFisicoReaderPort` (cross-module — owner-owned)

Consumido por `documentos-fisicos.service` para validar que el
`tipoDocumentoFisicoId` existe y está activo al crear/editar.

```typescript
// tipos-documento-fisico/ports/tipos-documento-fisico-reader.port.ts

import type { Prisma } from '@prisma/client';

export const TIPOS_DOCUMENTO_FISICO_READER_PORT = Symbol(
  'TIPOS_DOCUMENTO_FISICO_READER_PORT',
);

export interface TipoDocumentoFisicoParaValidacion {
  id: string;
  codigo: string;
  esTributario: boolean;
  activo: boolean;
  // Incluido para que documentos-fisicos.service pueda validar la
  // regla de monto condicional al crear/editar sin un segundo query.
  // También expuesto en el shape DocumentoFisicoParaAsociar del reader
  // cross-module de documentos-fisicos (ver §3.6).
  tiposComprobanteAplicables: TipoComprobante[];
}

export abstract class TiposDocumentoFisicoReaderPort {
  /**
   * Lee un tipo por id, scopeado al tenant. Devuelve null si no existe
   * o pertenece a otro tenant. Superficie mínima: campos que el
   * documentos-fisicos.service usa al crear/editar.
   */
  abstract findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoDocumentoFisicoParaValidacion | null>;
}
```

### 3.3 `TipoDocumentoFisicoSeederPort` (cross-module — owner-owned)

Consumido por `tenants.service` post-create. Superficie mínima de un
solo método; mantiene `tenants` ignorante del contenido del seed.

```typescript
// tipos-documento-fisico/ports/tipos-documento-fisico-seeder.port.ts

import type { Prisma } from '@prisma/client';

export const TIPO_DOCUMENTO_FISICO_SEEDER_PORT = Symbol(
  'TIPO_DOCUMENTO_FISICO_SEEDER_PORT',
);

export abstract class TipoDocumentoFisicoSeederPort {
  /**
   * Siembra los 8 tipos universales en el tenant. Idempotente
   * (upsert por codigo). Recibe `tx` para participar de la TX que
   * crea la organización (tenant nace listo o no nace).
   */
  abstract seedDefaultsForTenant(
    tenantId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
}
```

### 3.4 `DocumentoFisicoRepositoryPort` (interno)

```typescript
// documentos-fisicos/ports/documento-fisico.repository.port.ts

import type { DocumentoFisico, Moneda, Prisma } from '@prisma/client';

export const DOCUMENTO_FISICO_REPOSITORY_PORT = Symbol(
  'DOCUMENTO_FISICO_REPOSITORY_PORT',
);

export interface DocumentoFisicoCreateData {
  tipoDocumentoFisicoId: string;
  numero: string;               // ya normalizado (trim + uppercase)
  fechaEmision: Date;           // FechaContable @db.Date
  // Nullable por Decisión 4 actualizada. El service asigna null para
  // no-tributarios y verifica obligatoriedad para tributarios antes
  // de llamar al repo.
  monto: Prisma.Decimal | null;
  moneda: Moneda | null;
  glosa: string | null;
  contactoId: string | null;
  createdByUserId: string;
}

export interface DocumentoFisicoUpdateData {
  tipoDocumentoFisicoId?: string;
  numero?: string;
  fechaEmision?: Date;
  // exactOptionalPropertyTypes: usar spread condicional en el adapter.
  monto?: Prisma.Decimal | null;
  moneda?: Moneda | null;
  glosa?: string | null;
  contactoId?: string | null;
}

export interface DocumentoFisicoListarFiltros {
  tipoDocumentoFisicoId?: string;
  fechaDesde?: Date;
  fechaHasta?: Date;
  contactoId?: string;
  /** Búsqueda parcial sobre numero (uppercase). */
  q?: string;
  /**
   * Filtro por estado derivado:
   *   'libre'         → no asociado a ningún comprobante
   *   'asociado'      → asociado a >=1 comprobante en cualquier estado
   *   'contabilizado' → asociado a >=1 comprobante CONTABILIZADO
   * Implementado vía sub-query EXISTS sobre ComprobanteDocumentoFisico.
   */
  estado?: 'libre' | 'asociado' | 'contabilizado';
}

export interface DocumentoFisicoListarPagination {
  page: number;
  limit: number;
  orderBy?: 'fechaEmision' | 'createdAt' | 'numero';
  orderDir?: 'asc' | 'desc';
}

export abstract class DocumentoFisicoRepositoryPort {
  abstract create(
    tenantId: string,
    data: DocumentoFisicoCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentoFisico>;

  abstract findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentoFisico | null>;

  abstract findByNumero(
    tenantId: string,
    tipoDocumentoFisicoId: string,
    numero: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentoFisico | null>;

  abstract listar(
    tenantId: string,
    filtros: DocumentoFisicoListarFiltros,
    pagination: DocumentoFisicoListarPagination,
    tx?: Prisma.TransactionClient,
  ): Promise<{ items: DocumentoFisico[]; total: number }>;

  abstract update(
    tenantId: string,
    id: string,
    data: DocumentoFisicoUpdateData,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentoFisico>;

  /** DELETE físico — el caller verificó countAsociaciones === 0. */
  abstract eliminar(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  /** Total de filas en ComprobanteDocumentoFisico (cualquier estado). */
  abstract countAsociaciones(
    tenantId: string,
    documentoFisicoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  /**
   * Cuenta asociaciones a comprobantes CONTABILIZADO. Usado por el
   * service para decidir si un PATCH es válido (>0 ⇒ inmutable).
   */
  abstract countAsociacionesContabilizadas(
    tenantId: string,
    documentoFisicoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;
}
```

### 3.5 `AsociacionComprobanteRepositoryPort` (interno)

Operaciones sobre `ComprobanteDocumentoFisico`. Vive dentro de
`documentos-fisicos` porque es el módulo dueño de la asociación.

```typescript
// documentos-fisicos/ports/asociacion-comprobante.repository.port.ts

import type { ComprobanteDocumentoFisico, EstadoComprobante, Prisma } from '@prisma/client';

export const ASOCIACION_COMPROBANTE_REPOSITORY_PORT = Symbol(
  'ASOCIACION_COMPROBANTE_REPOSITORY_PORT',
);

export interface AsociarInput {
  comprobanteId: string;
  documentoFisicoId: string;
  comprobanteEstado: EstadoComprobante;
}

export abstract class AsociacionComprobanteRepositoryPort {
  /**
   * Inserta una fila de asociación. El caller pre-validó existencia y
   * pertenencia al tenant. Si el UNIQUE PARCIAL revienta (race), el
   * adapter captura el P2002 y arroja el error de dominio mapeado.
   */
  abstract asociar(
    tenantId: string,
    input: AsociarInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteDocumentoFisico>;

  /** Borra UNA asociación específica. */
  abstract desasociar(
    tenantId: string,
    comprobanteId: string,
    documentoFisicoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  /**
   * Borra TODAS las asociaciones de un comprobante. Usado al ANULAR
   * el comprobante (libera los DocumentosFisicos). Se llama desde
   * comprobantes.service vía eventos o port (sección 4.4).
   */
  abstract desasociarTodasDelComprobante(
    tenantId: string,
    comprobanteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  /**
   * Refresca la columna cache `comprobanteEstado` para todas las filas
   * que asocian un comprobante dado. Se invoca desde
   * comprobantes.service en la misma TX que cambia el estado del
   * comprobante (CONTABILIZAR, ANULAR si no se borraron las filas).
   */
  abstract refrescarEstadoComprobante(
    tenantId: string,
    comprobanteId: string,
    nuevoEstado: EstadoComprobante,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  abstract listarPorComprobante(
    tenantId: string,
    comprobanteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteDocumentoFisico[]>;

  abstract listarPorDocumento(
    tenantId: string,
    documentoFisicoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteDocumentoFisico[]>;
}
```

### 3.6 `DocumentosFisicosReaderPort` (cross-module — owner-owned)

Consumido por `comprobantes.service` para validar al asociar y al
contabilizar. Inspirado en `ContactosReaderPort.obtenerBatch`.

```typescript
// documentos-fisicos/ports/documentos-fisicos-reader.port.ts

import type { Moneda, Prisma } from '@prisma/client';

export const DOCUMENTOS_FISICOS_READER_PORT = Symbol(
  'DOCUMENTOS_FISICOS_READER_PORT',
);

export interface DocumentoFisicoParaAsociar {
  id: string;
  numero: string;
  tipoDocumentoFisicoId: string;
  esTributario: boolean;              // del tipo, denormalizado en el resultado
  fechaEmision: Date;
  monto: Prisma.Decimal | null;       // nullable — Decisión 4 actualizada
  moneda: Moneda | null;              // nullable — Decisión 4 actualizada
  contactoId: string | null;
  // Incluido aquí para que comprobantes.service valide compatibilidad
  // de tipo (proposal Decisión 11) sin un segundo query al asociar.
  tiposComprobanteAplicables: TipoComprobante[];
}

export abstract class DocumentosFisicosReaderPort {
  /**
   * Lee un lote por ids, scopeados al tenant. El service de comprobantes
   * lo usa al asociar documentos físicos (POST /comprobantes/:id/documentos-fisicos)
   * para verificar: (a) existencia y pertenencia al tenant, (b) compatibilidad
   * de tipo (tiposComprobanteAplicables vs comprobante.tipo — Decisión 11).
   * Los ids ausentes del Map son inexistentes o de otro tenant.
   * Acepta `tx?` para participar de la TX del contabilizar.
   */
  abstract obtenerBatchParaAsociar(
    tenantId: string,
    documentoFisicoIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, DocumentoFisicoParaAsociar>>;

  /**
   * Devuelve los ids que ya están asociados a OTRO comprobante en
   * estado CONTABILIZADO (excluyendo `excluyendoComprobanteId`).
   * El service de comprobantes lo usa pre-INSERT para fallar fast con
   * un error claro antes de chocar contra el UNIQUE PARCIAL en BD.
   * Defense in depth (CLAUDE.md §4.8): el UNIQUE en BD es la última
   * línea; este método mejora la UX.
   *
   * NOTA: aún con esta pre-validación, el INSERT puede fallar por
   * race — el adapter mapea el P2002 al mismo error de dominio.
   */
  abstract idsYaAsociadosAContabilizado(
    tenantId: string,
    documentoFisicoIds: string[],
    excluyendoComprobanteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string[]>;
}
```

---

## 4. Integración con `comprobantes`

### 4.1 Endpoints de asociación

Tres endpoints REST nuevos en `comprobantes.controller.ts`. URLs en
español, sub-recurso del comprobante (proposal Decisión 9):

```
POST   /api/comprobantes/:comprobanteId/documentos-fisicos
       body: { documentoFisicoIds: string[] }
       respuesta: ComprobanteDocumentoFisico[] (las creadas)

DELETE /api/comprobantes/:comprobanteId/documentos-fisicos/:documentoFisicoId
       respuesta: 204 No Content

GET    /api/comprobantes/:comprobanteId/documentos-fisicos
       respuesta: DocumentoFisicoResponseDto[]
```

Permisos:
- POST/DELETE: `contabilidad.asientos.update` (requiere comprobante en
  BORRADOR — la asociación post-CONTABILIZADO viola inmutabilidad).
- GET: `contabilidad.asientos.read` || `contabilidad.documentos-fisicos.read`.

### 4.2 Flujo: crear/editar comprobante BORRADOR con documentos

`ComprobantesService.create` y `update` mantienen su comportamiento
actual; los documentos físicos se asocian **vía endpoints separados**
después de tener el comprobante (proposal Decisión 9, NO inline en
`CreateComprobanteDto`).

Pseudocódigo del nuevo método `asociarDocumentos`:

```typescript
// comprobantes.service.ts (nuevo método)
async asociarDocumentos(
  tenantId: string,
  comprobanteId: string,
  documentoFisicoIds: string[],
): Promise<ComprobanteDocumentoFisico[]> {
  // Anti-29: pagination input — limit razonable en el DTO (max 50).

  return this.prisma.$transaction(async (tx) => {
    // 1) Comprobante existe + estado BORRADOR (inmutabilidad post-CONTABILIZADO).
    const comp = await this.repo.findById(tenantId, comprobanteId, tx);
    if (!comp) throw new ComprobanteNoEncontradoError(comprobanteId);
    if (comp.estado !== 'BORRADOR') {
      throw new ComprobanteNoEsBorradorError(comprobanteId, comp.estado);
    }

    // 2) Documentos existen, pertenecen al tenant, y son compatibles
    //    con el tipo del comprobante (proposal Decisión 11).
    const docMap = await this.documentosFisicosReader.obtenerBatchParaAsociar(
      tenantId,
      documentoFisicoIds,
      tx,
    );
    for (const id of documentoFisicoIds) {
      const doc = docMap.get(id);
      if (!doc) {
        throw new DocumentoFisicoReferenciadoNoExisteError(id);
      }
      // Validar compatibilidad tipo documento ↔ tipo comprobante.
      if (!doc.tiposComprobanteAplicables.includes(comp.tipo)) {
        throw new TipoDocumentoIncompatibleConComprobanteError(
          doc.tipoDocumentoFisicoId,
          comp.tipo,
          doc.tiposComprobanteAplicables,
        );
      }
    }

    // 3) Insertar asociaciones (estado=BORRADOR, NO chequea UNIQUE PARCIAL aún).
    const result = [];
    for (const id of documentoFisicoIds) {
      result.push(await this.asociacionRepo.asociar(tenantId, {
        comprobanteId,
        documentoFisicoId: id,
        comprobanteEstado: 'BORRADOR',
      }, tx));
    }
    return result;
  });
}
```

### 4.3 Flujo: contabilizar comprobante (BORRADOR → CONTABILIZADO)

Modifica `ComprobantesService.contabilizar` (existente). Adiciones
inline dentro de la TX existente:

```typescript
// dentro de la TX de contabilizar(), antes del UPDATE final del estado:
const asociaciones = await this.asociacionRepo.listarPorComprobante(
  tenantId, comprobanteId, tx,
);

if (asociaciones.length > 0) {
  // Defense in depth: pre-validar que ningún docId esté ya CONTABILIZADO
  // en otro comprobante. UX-first; la BD lo enforza igual.
  const ids = asociaciones.map((a) => a.documentoFisicoId);
  const yaContab = await this.documentosFisicosReader.idsYaAsociadosAContabilizado(
    tenantId, ids, comprobanteId, tx,
  );
  if (yaContab.length > 0) {
    throw new DocumentoFisicoYaAsociadoAOtroContabilizadoError(yaContab);
  }

  // Actualizar el cache del estado en las filas asociadas.
  // El UPDATE dispara el UNIQUE PARCIAL: si hay race, P2002 se mapea
  // a DocumentoFisicoYaAsociadoAOtroContabilizadoError en el adapter.
  await this.asociacionRepo.refrescarEstadoComprobante(
    tenantId, comprobanteId, 'CONTABILIZADO', tx,
  );
}

// resto: numeración, UPDATE estado=CONTABILIZADO, auditoría, etc.
```

### 4.4 Flujo: anular comprobante (CONTABILIZADO → ANULADO)

Modifica `ComprobantesService.anular`. La política es **borrado
inmediato de las asociaciones** (proposal cuestiones diferidas §3,
decisión preliminar confirmada). El DocumentoFisico sobrevive y queda
disponible para re-asociar (típicamente al comprobante AJUSTE de
reversión, hecho en flujo separado).

```typescript
// dentro de la TX de anular():
await this.asociacionRepo.desasociarTodasDelComprobante(
  tenantId, comprobanteId, tx,
);
// resto: crear comprobante AJUSTE de reversión, UPDATE estado, auditoría.
```

### 4.5 Wiring del módulo `comprobantes`

`comprobantes.module.ts`:
- Importar `DocumentosFisicosModule` (sin `forwardRef` — la dependencia
  es unidireccional: comprobantes consume documentos-fisicos, no al revés).
- Inyectar `DOCUMENTOS_FISICOS_READER_PORT` y
  `ASOCIACION_COMPROBANTE_REPOSITORY_PORT` en `ComprobantesService`.

```typescript
// comprobantes.module.ts (cambios)
@Module({
  imports: [
    RbacModule,
    CuentasModule,
    forwardRef(() => PeriodosFiscalesModule),
    ContactosModule,
    DocumentosFisicosModule,   // NUEVO
  ],
  // ...
})
```

`DocumentosFisicosModule` exporta `DOCUMENTOS_FISICOS_READER_PORT` y
`ASOCIACION_COMPROBANTE_REPOSITORY_PORT`. El último cruza frontera de
módulo y técnicamente es interno — pero como las operaciones de
asociación las orquesta `ComprobantesService` (es la cabecera y dueña
del flujo), exponerlo es la opción más simple. Alternativa más
puritana: definir un `ComprobanteAsociacionPort` en `comprobantes/`
que envuelva al repo. Decisión: exponer el repo directamente —
sobreingeniería de un wrapper para una sola operación.

### 4.6 Errores nuevos en `comprobantes/domain/comprobante-errors.ts`

```typescript
export class DocumentoFisicoReferenciadoNoExisteError extends NotFoundError {
  constructor(documentoFisicoId: string) {
    super(
      'COMPROBANTE_DOCUMENTO_FISICO_NO_EXISTE',
      `El documento físico referenciado no existe en la organización`,
      { documentoFisicoId },
    );
  }
}

export class DocumentoFisicoYaAsociadoAOtroContabilizadoError extends ConflictError {
  constructor(ids: string[]) {
    super(
      'COMPROBANTE_DOCUMENTO_FISICO_YA_CONTABILIZADO',
      `Uno o más documentos físicos ya están asociados a un comprobante contabilizado`,
      { documentoFisicoIds: ids },
    );
  }
}

export class ComprobanteNoEsBorradorError extends ConflictError {
  constructor(comprobanteId: string, estadoActual: string) {
    super(
      'COMPROBANTE_NO_ES_BORRADOR',
      `El comprobante no admite cambios en sus asociaciones porque no está en BORRADOR`,
      { comprobanteId, estadoActual },
    );
  }
}

// Errores nuevos — Ajuste 1 (monto condicional según esTributario)
// Ambos extienden InvalidStateError (HTTP 422) de @/common/errors/.

// documentos-fisicos/domain/documento-fisico-errors.ts
export class DocumentoFisicoMontoRequeridoParaTributarioError extends InvalidStateError {
  constructor(campo: 'monto' | 'moneda') {
    super(
      'DOCUMENTO_FISICO_MONTO_REQUERIDO_PARA_TRIBUTARIO',
      `El tipo de documento tributario requiere ${campo}`,
      { campo },
    );
  }
}

export class DocumentoFisicoMontoNoPermitidoParaNoTributarioError extends InvalidStateError {
  constructor(campo: 'monto' | 'moneda') {
    super(
      'DOCUMENTO_FISICO_MONTO_NO_PERMITIDO_PARA_NO_TRIBUTARIO',
      `El tipo de documento no tributario no debe llevar ${campo}`,
      { campo },
    );
  }
}

// Ajuste 2 (compatibilidad tipo documento ↔ tipo comprobante)
// comprobantes/domain/comprobante-errors.ts (o documentos-fisicos/domain/ — donde lo lance el service)
export class TipoDocumentoIncompatibleConComprobanteError extends InvalidStateError {
  constructor(
    tipoDocumentoNombre: string,
    tipoComprobante: string,
    tiposPermitidos: string[],
  ) {
    super(
      'TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE',
      `El tipo de documento '${tipoDocumentoNombre}' no es aplicable a comprobantes de tipo ${tipoComprobante}. Tipos permitidos: ${tiposPermitidos.join(', ')}`,
      { tipoDocumentoNombre, tipoComprobante, tiposPermitidos },
    );
  }
}
```

---

## 5. Decisiones de diseño

### D1: Asociación a nivel cabecera, NO línea

(Reafirma proposal Decisión 8.) El schema **NO agrega**
`LineaComprobante.documentoFisicoId`. La realidad contable boliviana
confirma: un asiento de venta tiene típicamente 3 líneas (CuentaCliente
DR, VentaIVA13 CR, IVA débito CR), y las TRES respaldan UNA factura.
Replicar el documento por línea es redundante; asociar a una sola
línea es semánticamente arbitrario.

**Acción de doc**: durante el archive del slice, retirar la nota de
forward-compat de `docs/disenos/comprobantes-asientos.md` §12.3.

### D2: Cache denormalizado de `comprobanteEstado` en la tabla intermedia

`ComprobanteDocumentoFisico.comprobanteEstado` es un cache del estado
del Comprobante. Necesario para que el UNIQUE PARCIAL pueda usarse sin
JOIN. La sincronización es responsabilidad de `ComprobantesService`:
SIEMPRE actualizar dentro de la misma TX que cambia el estado del
comprobante.

**Mitigación de drift**: integration spec específico verifica que
después de `contabilizar()` y `anular()`, el cache refleja el estado
actual. Sin esta sincronización, el UNIQUE PARCIAL queda parcialmente
roto (R1).

### D3: Seed inicial universal de TiposDocumentoFisico

8 tipos universales (proposal Decisión 6 + Decisión 11):

| codigo                | nombre                       | esTributario | tiposComprobanteAplicables |
|-----------------------|------------------------------|--------------|----------------------------|
| factura-emitida       | Factura emitida              | true         | `[INGRESO, DIARIO]` |
| factura-recibida      | Factura recibida             | true         | `[EGRESO, DIARIO]` |
| nota-credito-emitida  | Nota de crédito (emitida)    | true         | `[EGRESO, AJUSTE, DIARIO]` |
| nota-debito-emitida   | Nota de débito (emitida)     | true         | `[INGRESO, AJUSTE, DIARIO]` |
| recibo-ingreso        | Recibo de ingreso            | false        | `[INGRESO, DIARIO]` |
| recibo-egreso         | Recibo de egreso             | false        | `[EGRESO, DIARIO]` |
| comprobante-interno   | Comprobante interno          | false        | `[APERTURA, DIARIO, INGRESO, EGRESO, AJUSTE, TRASPASO, CIERRE]` |
| vale-caja-chica       | Vale de caja chica           | false        | `[EGRESO, DIARIO]` |

**Disparador**: `TenantsService.create` invoca
`TipoDocumentoFisicoSeederPort.seedDefaultsForTenant(tenantId, tx)`
**dentro de la misma TX** que crea la organización. Si el seed falla,
la creación del tenant rollbackea (proposal R4 mitigado).

**Lugar del seed**:
`prisma/seeds/prod/tipos-documento-fisico/tipos-universales.ts` o como
constante en `tipos-documento-fisico/seed/seeds.ts` (decisión de
implementación menor; la seed se prefiere co-locada con el módulo
porque es lógica del módulo, no del schema). El `SeederPort` lo
consume vía `upsertSeed`.

### D4: Filtros y paginación de listado de DocumentosFisicos

```typescript
GET /api/documentos-fisicos
  ?tipoDocumentoFisicoId=...
  &fechaDesde=YYYY-MM-DD
  &fechaHasta=YYYY-MM-DD
  &contactoId=...
  &estado=libre|asociado|contabilizado
  &q=42                               (búsqueda parcial sobre numero post-uppercase)
  &page=1&limit=50&orderBy=fechaEmision&orderDir=desc
```

**Paginación**: offset-based (`page`, `limit`), consistente con
`contactos`. Cursor-based queda como deuda diferida si el listado
crece >100k filas (cuando aparezca, paginación vía `cursor=lastId`).

**Estado derivado**: implementado vía sub-query EXISTS sobre
`ComprobanteDocumentoFisico`:
- `libre`: `NOT EXISTS (SELECT 1 FROM comprobante_documento_fisico WHERE documentoFisicoId = df.id)`.
- `asociado`: `EXISTS (...)` sin filtrar por estado.
- `contabilizado`: `EXISTS (... WHERE comprobanteEstado = 'CONTABILIZADO')`.

### D5: Endpoint de asociación — sub-recurso del comprobante

(Reafirma proposal Decisión 9.) NO se acepta `documentoFisicoIds:
string[]` inline en `CreateComprobanteDto`. La operación es:

```
POST /api/documentos-fisicos                         (crear el doc)
POST /api/comprobantes                               (crear el comprobante)
POST /api/comprobantes/:id/documentos-fisicos        (asociar)
```

El front-end orquesta los 3 calls en un mismo formulario.

**Razón**: payload del Comprobante limpio, errores parciales claros,
auditoría nítida (cada asociación es un evento INSERT).

### D6: Mapping de errores de Prisma a DomainError

El `GlobalExceptionFilter` (`backend/src/common/filters/global-exception.filter.ts`)
mapea Prisma errors. Adiciones para este slice:

| Prisma code | meta.target / constraint                                            | DomainError                                              |
|-------------|---------------------------------------------------------------------|----------------------------------------------------------|
| P2002       | `documentos_fisicos_organizationId_tipoDocumentoFisicoId_numero_key` | `DocumentoFisicoNumeroDuplicadoError`                    |
| P2002       | `comprobante_documento_fisico_unique_contabilizado` (raw SQL)        | `DocumentoFisicoYaAsociadoAOtroContabilizadoError`       |
| P2002       | `tipos_documento_fisico_organizationId_codigo_key`                   | `TipoDocumentoFisicoCodigoDuplicadoError`                |
| P2003       | FK violations en delete de TipoDocumentoFisico con docs asociados   | `TipoDocumentoFisicoReferenciadoError`                   |
| P2003       | FK violations en delete de DocumentoFisico con asociaciones         | `DocumentoFisicoReferenciadoError`                       |
| P2003       | FK violations en delete de DocumentoFisico con Contacto referenciante | (improbable — Contacto NO referencia DocumentoFisico)  |
| P2025       | record not found en update/delete                                    | `DocumentoFisicoNoEncontradoError` o equivalente         |

El mapping vive en los **adapters** (capturan `P2xxx`), NO en el
service (que recibe siempre `DomainError`). Patrón consistente con
`PrismaContactosRepository.create` (cicatriz F-01, CLAUDE.md §4.8).

### D7: Política de mutabilidad de DocumentoFisico

(Reafirma proposal Decisión 5.) Al editar (`PATCH`):

1. Service llama `repo.countAsociacionesContabilizadas(tenantId, id)`.
2. Si `>0` → `DocumentoFisicoInmutableError`.
3. Si `0` → ejecuta el update.

Al eliminar (`DELETE`):

1. Service llama `repo.countAsociaciones(tenantId, id)`.
2. Si `>0` → `DocumentoFisicoReferenciadoError` (incluso si todas las
   asociaciones son a BORRADOR — Decisión 5 dice "una vez asociado, no
   se elimina").
3. Si `0` → DELETE físico.

El `repo.countAsociaciones` lee la tabla intermedia. Como las
asociaciones de comprobantes ANULADOS se borran (D2 sección 4.4), un
documento que respaldó un comprobante anulado vuelve a count=0 y SÍ es
elegible para DELETE. Esto es coherente con "queda en BD si tiene
asociaciones vivas". Si emerge necesidad de retener histórico de
asociaciones borradas, se materializa una tabla de auditoría aparte —
fuera del scope.

### D8: Política con Comprobantes BLOQUEADO

`EstadoComprobante.BLOQUEADO` ocurre cuando un período se cierra
(CLAUDE.md §4.4 cicatriz F-03). Las asociaciones existentes se
mantienen con `comprobanteEstado=BLOQUEADO`. El UNIQUE PARCIAL no
matchea (es WHERE CONTABILIZADO), pero efectivamente el documento
sigue ligado y NO se puede asociar a otro comprobante CONTABILIZADO
porque la regla de negocio de comprobantes lo impide (un comprobante
BLOQUEADO ya consumió su numeración).

Decisión: cuando el período reabre (`PeriodoFiscalReopening`) y el
comprobante vuelve a `CONTABILIZADO`, refrescar el cache de las
asociaciones a `CONTABILIZADO` también (en la TX de la reapertura).
Esto se enchufa en el módulo `periodos-fiscales` cuando ejecute
reapertura. Para este slice, basta documentar el caso y agregar un
test de integración. (El método `refrescarEstadoComprobante` ya
acepta cualquier estado.)

### D9: VOs del dominio

- `NumeroDocumento` (en `documentos-fisicos/domain/`):
  - `static of(raw: string): NumeroDocumento`.
  - Normaliza: `raw.trim().toUpperCase()`.
  - Valida: regex `/^[A-Z0-9./-]+$/`, longitud 1..50.
  - Errores: `NumeroDocumentoVacioError`, `NumeroDocumentoFormatoInvalidoError`,
    `NumeroDocumentoLongitudExcedidaError`.
- `TipoDocumentoFisicoCodigo` (en `tipos-documento-fisico/domain/`):
  - Regex `/^[a-z0-9]+(-[a-z0-9]+)*$/` (kebab-case alfanumérico).
  - Longitud 1..20.
- `TipoDocumentoFisicoNombre`:
  - Trim, no-vacío post-trim, longitud 1..100.

Todos: `private constructor`, `static of/fromX`, `toString()`,
`equals()`. Cero dependencias de NestJS/Prisma. Tests unit puros.

### D10: Validación condicional de monto/moneda en DocumentosFisicosService

Pseudocódigo de la validación en `create` y `update`:

```typescript
// documentos-fisicos.service.ts — método create (idem para update con valor nuevo del tipo)
async create(tenantId: string, dto: CreateDocumentoFisicoDto, userId: string) {
  // 1) Leer tipo para obtener esTributario (y tiposComprobanteAplicables).
  const tipo = await this.tiposReader.findById(tenantId, dto.tipoDocumentoFisicoId);
  if (!tipo) throw new TipoDocumentoFisicoNoEncontradoError(dto.tipoDocumentoFisicoId);
  if (!tipo.activo) throw new TipoDocumentoFisicoInactivoError(dto.tipoDocumentoFisicoId);

  // 2) Validación condicional monto/moneda según esTributario (Decisión 4 + REQ-D-13/14).
  if (tipo.esTributario) {
    if (dto.monto == null) throw new DocumentoFisicoMontoRequeridoParaTributarioError('monto');
    if (dto.moneda == null) throw new DocumentoFisicoMontoRequeridoParaTributarioError('moneda');
  } else {
    if (dto.monto != null) throw new DocumentoFisicoMontoNoPermitidoParaNoTributarioError('monto');
    if (dto.moneda != null) throw new DocumentoFisicoMontoNoPermitidoParaNoTributarioError('moneda');
  }

  // 3) Normalizar número y persistir.
  const numero = NumeroDocumento.of(dto.numero).toString();
  return this.repo.create(tenantId, {
    ...dto,
    numero,
    monto: dto.monto != null ? new Prisma.Decimal(dto.monto) : null,
    moneda: dto.moneda ?? null,
    createdByUserId: userId,
  });
}
```

Para `update` (PATCH), la validación de monto/moneda solo se ejecuta si el tipo
cambia (se provee `tipoDocumentoFisicoId` nuevo) o si se proveen `monto`/`moneda`
explícitamente. La regla: el estado final del documento debe ser consistente con
el `esTributario` del tipo resultante.

### D11: Filtro de compatibilidad tipo documento ↔ tipo comprobante

(Reafirma proposal Decisión 11.) Al ejecutar
`DocumentosFisicosService.asociarAComprobante`:

1. Obtener el `Comprobante` con su `tipo: TipoComprobante`.
2. Llamar `documentosFisicosReader.obtenerBatchParaAsociar(tenantId, ids, tx)` —
   devuelve el shape `DocumentoFisicoParaAsociar` que incluye
   `tiposComprobanteAplicables`.
3. Para cada documento: verificar
   `doc.tiposComprobanteAplicables.includes(comp.tipo)`. Si no, throw
   `TipoDocumentoIncompatibleConComprobanteError`.

**Defense in depth**: el frontend filtra el combobox de DocumentosFisicos
disponibles al seleccionar para un comprobante (UX — el usuario no ve
opciones incompatibles). El backend SIEMPRE valida (seguridad — el frontend
puede estar desactualizado).

**Array vacío = nada aplica**: si un tipo tiene `tiposComprobanteAplicables: []`,
NINGÚN comprobante puede asociarse con documentos de ese tipo. Es el
mecanismo que el admin usa para desactivar semánticamente un tipo sin
borrarlo.

---

## 6. Diagramas

### 6.1 Diagrama ER (texto)

```
Organization 1───* TipoDocumentoFisico
Organization 1───* DocumentoFisico
Organization 1───* ComprobanteDocumentoFisico

TipoDocumentoFisico 1───* DocumentoFisico
                                                       ┌── 1───* ComprobanteDocumentoFisico ───* 1 ──┐
DocumentoFisico  ─────────────────────────────────────┤                                              ├──── Comprobante
                                                       └─ * ─── * (N:M lógica) ─── * ─── 1 ──────────┘
DocumentoFisico  *───?  Contacto                       (UNIQUE WHERE comprobanteEstado='CONTABILIZADO')
```

### 6.2 Diagrama de secuencia: contabilizar Comprobante con DocumentosFisicos asociados

```
Cliente HTTP        ComprobantesController       ComprobantesService          AsociacionRepo                DocumentosFisicosReader        Postgres
    |                       |                            |                            |                             |                            |
    | POST /comprobantes/:id/contabilizar                |                            |                             |                            |
    |---------------------->|                            |                            |                             |                            |
    |                       | contabilizar(tenantId, id) |                            |                             |                            |
    |                       |--------------------------->|                            |                             |                            |
    |                       |                            | $transaction(async tx => { |                             |                            |
    |                       |                            |--------------------------- BEGIN TX -----------------------------------------------> |
    |                       |                            | comp = repo.findById(...)  |                             |                            |
    |                       |                            |                            | (validaciones partida doble, periodo abierto, etc.)    |
    |                       |                            | numero = secuencia.next(tipo,month,tx)                  | (FOR UPDATE atómico)        |
    |                       |                            |                            |                             |                            |
    |                       |                            | asocs = asociacionRepo.listarPorComprobante(...)        |                            |
    |                       |                            |---------------------------->|                            |                            |
    |                       |                            |                            | SELECT ... WHERE comprobanteId=... ----------------> | |
    |                       |                            |                            |                             |                            |
    |                       |                            | if asocs.length > 0:       |                             |                            |
    |                       |                            |   yaContab = readerPort.idsYaAsociadosAContabilizado(... tx)                          |
    |                       |                            |--------------------------------------------------->|                                  |
    |                       |                            |                            |                             | SELECT ... WHERE comprobanteEstado='CONTABILIZADO' AND comprobanteId<>... AND documentoFisicoId IN (...)
    |                       |                            |                            |                             |--------------------------> |
    |                       |                            |                            |                             |<-- ids ya contabilizados -|
    |                       |                            |   if yaContab.length>0: throw DocumentoFisicoYaAsociadoAOtroContabilizadoError        |
    |                       |                            |                            |                             |                            |
    |                       |                            |   asociacionRepo.refrescarEstadoComprobante(comprobanteId, 'CONTABILIZADO', tx)       |
    |                       |                            |---------------------------->|                            |                            |
    |                       |                            |                            | UPDATE comprobante_documento_fisico SET comprobanteEstado='CONTABILIZADO' WHERE comprobanteId=...
    |                       |                            |                            |--------------------------------------------------> |  | |
    |                       |                            |                            |                             |     UNIQUE PARCIAL: si race, P2002 ──┐
    |                       |                            |                            |<-- adapter mapea P2002 a DocumentoFisicoYaAsociadoAOtroContabilizadoError ──┘
    |                       |                            |                            |                             |                            |
    |                       |                            | repo.update(estado='CONTABILIZADO', numero=..., totales=...)                          |
    |                       |                            |--------------------------------------------------->                                   |
    |                       |                            | auditoria.registrar('CONTABILIZADO', ...)               |                            |
    |                       |                            | }) ---------------------- COMMIT TX ----------------------------------------------> |
    |                       |<-----------------------------                                                                                       |
    |<-- 200 OK Comprobante |                            |                            |                             |                            |
```

### 6.3 Diagrama de secuencia: anular Comprobante

```
ComprobantesService.anular(tenantId, id, motivo, userId)
  └─ $transaction(async tx => {
       comp = repo.findById(tenantId, id, tx)
       check: comp.estado === 'CONTABILIZADO'  → si no, ConflictError
       check: !comp.anulaAId  → no se anula una reversión
       check: comp.fechaContable en periodo abierto

       // NUEVO en este slice:
       asociacionRepo.desasociarTodasDelComprobante(tenantId, id, tx)
       // (DELETE FROM comprobante_documento_fisico WHERE comprobanteId=... )
       // → libera los DocumentosFisicos para re-asociación.

       reversion = crearComprobanteReversion(comp, motivo, userId, tx)
       repo.update(id, { estado: 'ANULADO', anuladoEn, anuladoPorUserId, motivo }, tx)
       auditoria.registrar('ANULADO', ..., tx)
     })
```

---

## 7. Cambios fuera del módulo

### 7.1 `backend/src/common/permisos/catalogo.ts`

Agregar al array `CATALOGO_PERMISOS`:

```typescript
{
  modulo: 'contabilidad',
  submodulo: 'tipos-documento-fisico',
  acciones: CRUD('tipos de documento físico'),
},
{
  modulo: 'contabilidad',
  submodulo: 'documentos-fisicos',
  acciones: CRUD('documentos físicos'),
},

// Cierre de deuda del slice 1 (proposal Decisión 7):
{
  modulo: 'contabilidad',
  submodulo: 'contactos',
  acciones: CRUD('contactos'),
},
```

Total: 8 permisos nuevos del slice + 4 que cierran la deuda. El
`@RequirePermissions(...)` en los controllers se decorará en la fase
apply.

### 7.2 `backend/src/tenants/tenants.service.ts`

Modificar `create()` para invocar el seed:

```typescript
@Injectable()
export class TenantsService {
  constructor(
    @Inject(TENANT_REPOSITORY_PORT) private readonly repo: TenantRepositoryPort,
    @Inject(MEMBERSHIPS_READER_PORT) private readonly memberships: MembershipsReaderPort,
    @Inject(GESTIONES_READER_PORT) private readonly gestionesReader: GestionesReaderPort,
    @Inject(TIPO_DOCUMENTO_FISICO_SEEDER_PORT)            // NUEVO
    private readonly tiposDocSeeder: TipoDocumentoFisicoSeederPort,
    private readonly redis: RedisService,
  ) {}

  async create(dto: CreateTenantDto, ownerId: string) {
    const slug = TenantSlug.fromName(dto.name).toString();
    if (await this.repo.existsBySlug(slug)) {
      throw new TenantSlugDuplicadoError(slug);
    }
    // Wrap en TX: el tenant nace listo (con tipos universales) o no nace.
    return this.prisma.$transaction(async (tx) => {
      const tenant = await this.repo.create(
        { slug, name: dto.name, ownerUserId: ownerId },
        tx,
      );
      await this.tiposDocSeeder.seedDefaultsForTenant(tenant.id, tx);
      return tenant;
    });
  }
}
```

**Implicaciones:**
- `TenantRepositoryPort.create` debe aceptar `tx?: Prisma.TransactionClient`
  como segundo parámetro. Si no lo acepta hoy, agregar el parámetro
  (cambio backwards-compatible).
- `TenantsModule` importa `TiposDocumentoFisicoModule` (sin
  `forwardRef`, dependencia unidireccional).
- Si el seed falla, todo rollbackea — patrón consistente con CLAUDE.md
  §4.4 (TX larga vs simplicidad: la simplicidad gana acá porque crear
  tenant es operación poco frecuente).

### 7.3 `backend/src/comprobantes/comprobantes.module.ts`

Importar `DocumentosFisicosModule`. Inyectar
`DOCUMENTOS_FISICOS_READER_PORT` y
`ASOCIACION_COMPROBANTE_REPOSITORY_PORT` en `ComprobantesService`. Ya
detallado en sección 4.5.

### 7.4 `backend/src/comprobantes/comprobantes.controller.ts`

Agregar 3 endpoints (sección 4.1).

### 7.5 `backend/src/comprobantes/comprobantes.service.ts`

- Nuevo método `asociarDocumentos(tenantId, comprobanteId, ids)`.
- Nuevo método `desasociarDocumento(tenantId, comprobanteId, documentoFisicoId)`.
- Nuevo método `listarDocumentosAsociados(tenantId, comprobanteId)`.
- Modificar `contabilizar()` y `anular()` (secciones 4.3 y 4.4).

### 7.6 Tests

- **Integration tests del adapter**: hermanos a cada repo, con Postgres
  real. Cubren UNIQUE PARCIAL, FK Restrict, idempotencia del seed,
  refresh del cache de estado, etc.
- **Service unit tests**: mocks del port; cubren reglas de
  inmutabilidad, estados derivados, validaciones VO.
- **E2E** (`backend/test/documentos-fisicos.e2e-spec.ts` +
  `backend/test/comprobantes.e2e-spec.ts` ampliado): flujos completos
  HTTP (crear tipo → crear documento → crear comprobante → asociar →
  contabilizar → anular).

Estimación: ~120 tests para los dos módulos nuevos + ~20 nuevos en
comprobantes.

---

## 8. Riesgos de implementación

- **R1: Drift del cache `comprobanteEstado`**. Si una transición de
  estado del Comprobante NO actualiza la tabla intermedia en la misma
  TX, el UNIQUE PARCIAL queda parcialmente roto: dos comprobantes
  marcados como BORRADOR (cache desincronizado) podrían contabilizarse
  ambos contra el mismo documento sin que el índice los detecte.
  **Mitigación**: integration spec dedicado en
  `prisma-asociacion-comprobante.repository.integration.spec.ts` que
  verifica el invariante después de `contabilizar`, `anular` y
  reapertura. Más: code review explícito busca toda transición de
  estado del comprobante y valida que se llame `refrescarEstadoComprobante`.

- **R2: Migration manual no idempotente**. El `CREATE UNIQUE INDEX … WHERE`
  no lo gestiona Prisma. Si se aplica dos veces, falla. **Mitigación**:
  `IF NOT EXISTS` en el SQL (sección 1.4).

- **R3: Race en asociación concurrente al contabilizar**. Dos
  contadores simultáneos contabilizan dos comprobantes que referencian
  el mismo `DocumentoFisico`. **Mitigación**: UNIQUE PARCIAL en BD
  garantiza que solo uno gana; el otro recibe P2002 que el adapter
  mapea a `DocumentoFisicoYaAsociadoAOtroContabilizadoError`. El
  reader port pre-valida con `tx?` para mejor UX (error claro antes
  del UPDATE real). Patrón consistente con CLAUDE.md §4.8 (defense in
  depth).

- **R4: Seed al crear tenant — TX larga**. El seed son 8 INSERTs
  pequeños; el costo es despreciable. La TX queda más larga, pero
  `Tenant.create` es low-frequency. **Mitigación**: aceptado, se
  monitorea con métricas de duración en sección 11 si emerge.

- **R5: Estado derivado en runtime puede sufrir N+1**. El listado de
  DocumentosFisicos con filtro `estado` requiere sub-query EXISTS;
  Prisma no lo expresa nativamente — se usa `findMany` con `where:
  { asociaciones: { some: { … } } }`. **Mitigación**: integration
  spec verifica plan de query (`EXPLAIN`) y agrega índice
  `(documentoFisicoId, comprobanteEstado)` si emerge regresión.

- **R6: La eliminación de un DocumentoFisico que solo tuvo
  asociaciones a comprobantes ANULADOS está permitida**. Esto puede
  sorprender al auditor que esperaba retener histórico. **Mitigación**:
  decisión documentada en D7. Si emerge requerimiento, materializar
  tabla de auditoría aparte sin afectar la lógica.

- **R7: Contradicción documental con `comprobantes-asientos.md`
  §12.3** (proposal R3). Resolver durante archive: actualizar el doc
  para reflejar la decisión cabecera-cabecera.

---

## 9. Forward-compat para Slice 3 (Factura)

Cuando se implemente `factura` (slice 3 de Fase 1.4):

- Nueva tabla `Factura` con FK 1:1 opcional a `DocumentoFisico` (ej.
  `Factura.documentoFisicoId String? @unique`).
- `Factura` hereda `DocumentoFisico.monto` como el **total del papel
  impreso** (neto + IVA + IT). El slice 3 agrega los desgloses
  (`montoNeto`, `montoIva`, `montoIt`) en `Factura` sin modificar
  `DocumentoFisico.monto` — que sigue siendo el total.
- Campos tributarios en `Factura`: `nitEmisor`, `razonSocialEmisor`,
  `nitReceptor`, `razonSocialReceptor`, `montoNeto`, `montoIva`,
  `montoIt?`, `codigoAutorizacion?`, `codigoControl?`, `dosificacion?`,
  `tipoCambio?`, etc.
- Nuevo invariante en `DocumentoFisicoService`: si `tipo.esTributario=true`,
  exigir `Factura` adjunta antes de poder asociar a Comprobante
  CONTABILIZADO. (Validación en el flujo de contabilizar.)
- Reader port nuevo `FACTURAS_READER_PORT` consumido por LCV (slice 4)
  para iterar solo sobre documentos tributarios.

Este slice **NO** agrega `Factura`. Sí deja:
- El flag `esTributario` en `TipoDocumentoFisico`.
- `DocumentoFisico.monto` ya poblado para documentos tributarios —
  slice 3 lo usa como total del papel (el LCV suma por `Factura`,
  que agrega los desgloses).
- La separación arquitectural que hace la migración a `Factura`
  trivial (1 tabla nueva + 1 columna FK opcional + 1 ruta condicional
  en el contabilizar).

---

## 10. Forward-compat para LCV (Slice 4)

LCV (Libro de Compras y Ventas) iterará sobre `Factura` (no sobre
`DocumentoFisico` directo). El slice 4 agregará una vista materializada
o queries ad-hoc que consuman `Factura.fechaEmision`, `nitEmisor`,
`montoNeto`, `montoIva`. La integración con `DocumentoFisico` será vía
JOIN cuando se necesite el "detalle visual" del documento.

---

## 11. Métricas y observabilidad (deuda menor)

Métricas Prometheus a agregar (instrumentación en service + adapter,
patrón de `Histogram` ya establecido en el proyecto):

- `documentos_fisicos_create_duration_seconds` (histogram).
- `documentos_fisicos_listar_duration_seconds` (con label `estado`).
- `comprobantes_asociar_documentos_duration_seconds`.
- `comprobantes_contabilizar_with_docs_count` (histogram de cuántos
  documentos por comprobante contabilizado).

Logs (Pino, ya configurado): info al asociar/desasociar/contabilizar
con docs, warn si UNIQUE PARCIAL race se dispara (frecuencia indicaría
problema de UX).

---

**Fin del design.** La fase `tasks` baja esto a checklist de
implementación granular.
