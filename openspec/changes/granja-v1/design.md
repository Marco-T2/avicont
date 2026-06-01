# Diseño técnico: `granja-v1` — vertical Granja (engorde de pollos parrilleros)

> Fase SDD: **design** — 2026-06-01
> Artifact store: **hybrid** (este archivo + engram `sdd/granja-v1/design`)
> Inputs: `proposal.md`, `docs/disenos/granja.md` (fuente de verdad del modelo), `exploration.md`.
> Criterio rector: **NO-DEUDA**. Cada decisión elige la opción que no obliga a una migración destructiva en v1.5/v2.
> Módulo espejo: `backend/src/tipos-documento-fisico/` (hexagonal + seed por tenant + CRUD). Se copia EXACTO su patrón de ports (abstract class + Symbol token), adapter Prisma filtrando por `organizationId`, y `module.ts` con `useExisting`.

---

## 1. Resumen arquitectónico

`backend/src/granja/` es un módulo hexagonal estricto, mundo separado del vertical Contabilidad (no comparte dominio, navegación ni reportes — plataforma §6.2). Reutiliza SOLO la base de plataforma: `Organization`/multi-tenancy, flag `granjaEnabled`, `@RequireModule('granja')` + `ModuleEnabledGuard`, catálogo de permisos `granja.*` (YA existe), `Money`, `FechaContable`, `ClockPort`, `VerticalNoExclusivoError`.

`Lote` es el **aggregate root**: todo cuelga del lote y todo se calcula POR lote. Los derivados (`avesVivas`, `costoAcumulado`, `costoPorPolloVivo`, `edadDias`, `porcentajeMortalidad`) NUNCA se persisten — se calculan en lectura (espejo del patrón de saldos contables, evita drift). Dos tablas de movimiento separadas y de naturaleza única (`MovimientoInversion` lleva `monto`, `MovimientoCantidad` lleva `cantidad`); `TipoRegistro.naturaleza` rutea cada tipo a su tabla.

Capas: `domain/` (puro, sin NestJS/Prisma) → `ports/` (abstract class + Symbol) → `adapters/` (Prisma, filtran por `organizationId`) → `dto/` → `*.service.ts` (inyectan ports) → controllers (`/api/granja/*`) → `granja.module.ts`. El seeder se expone como port para que `TenantsModule` lo consuma al activar el vertical.

---

## 2. Layout de archivos completo

```
backend/src/granja/
├── domain/
│   ├── enums.ts                              EstadoLote, NaturalezaRegistro (propios, P2 — NO de Prisma)
│   ├── lote.ts                               aggregate root: entidad pura + invariantes de raíz
│   ├── lote.spec.ts
│   ├── tipo-registro.ts                      entidad pura
│   ├── tipo-registro.spec.ts
│   ├── movimiento-inversion.ts               entidad pura (monto: Money)
│   ├── movimiento-cantidad.ts                entidad pura (cantidad: int)
│   ├── resumen-lote.ts                       value/read struct de derivados (avesVivas, costo/pollo, etc.)
│   ├── resumen-lote.spec.ts                  cálculo costo/pollo (la joya) — unit puro
│   └── granja.errors.ts                      DomainErrors GRANJA_*
├── ports/
│   ├── lote.repository.port.ts               LOTE_REPOSITORY_PORT
│   ├── tipo-registro.repository.port.ts      TIPO_REGISTRO_REPOSITORY_PORT
│   ├── movimiento.repository.port.ts         MOVIMIENTO_REPOSITORY_PORT (inversión + cantidad + FOR UPDATE)
│   ├── lote-resumen.reader.port.ts           LOTE_RESUMEN_READER_PORT (read-model BATCH — P3)
│   └── tipo-registro-seeder.port.ts          TIPO_REGISTRO_SEEDER_PORT (lo consume TenantsModule)
├── adapters/
│   ├── prisma-lote.repository.ts
│   ├── prisma-lote.repository.integration.spec.ts
│   ├── prisma-tipo-registro.repository.ts
│   ├── prisma-tipo-registro.repository.integration.spec.ts
│   ├── prisma-movimiento.repository.ts
│   ├── prisma-movimiento.repository.integration.spec.ts
│   ├── prisma-lote-resumen.reader.ts          read-model batch (groupBy WHERE loteId IN (...))
│   ├── prisma-lote-resumen.reader.integration.spec.ts
│   ├── prisma-tipo-registro-seeder.adapter.ts
│   └── prisma-tipo-registro-seeder.adapter.spec.ts
├── seed/
│   ├── tipos-registro-fabrica.ts              12 filas readonly (esSistema=true) — espeja tipos-universales.ts
│   └── tipos-registro-fabrica.spec.ts
├── dto/
│   ├── create-lote.dto.ts
│   ├── update-lote.dto.ts
│   ├── lote-response.dto.ts                    incluye resumen (derivados como string para Money)
│   ├── lote-dashboard-response.dto.ts          item del dashboard (resumen + datos mínimos del lote)
│   ├── create-tipo-registro.dto.ts
│   ├── update-tipo-registro.dto.ts
│   ├── tipo-registro-response.dto.ts
│   ├── create-movimiento-inversion.dto.ts      monto como string, detalle @MaxLength(500)
│   ├── create-movimiento-cantidad.dto.ts       cantidad int, detalle @MaxLength(500)
│   └── movimiento-response.dto.ts
├── lote.service.ts                             CRUD lote + cerrar + detalle con resumen
├── lote.service.spec.ts
├── tipo-registro.service.ts                    CRUD tipo-registro + soft-disable
├── tipo-registro.service.spec.ts
├── movimiento.service.ts                       registrar inversión/cantidad (FOR UPDATE), listar, eliminar
├── movimiento.service.spec.ts
├── dashboard.service.ts                        orquesta lote-resumen reader batch
├── dashboard.service.spec.ts
├── lotes.controller.ts                         /api/granja/lotes (+ /:id/cerrar, /:id/movimientos/*)
├── tipos-registro.controller.ts                /api/granja/tipos-registro
├── dashboard.controller.ts                     /api/granja/dashboard
└── granja.module.ts
```

`test/granja.e2e-spec.ts` (en `backend/test/`) para el e2e multi-tenant + module-gating + inmutabilidad de `cantidadInicial`.

**Por qué 3 controllers y no uno**: espeja el resto del repo (cada recurso su controller). Los movimientos cuelgan de `lotes.controller.ts` como sub-recurso del lote (`/lotes/:id/movimientos/*`), porque el lote es el aggregate root.

---

## 3. Schema Prisma

Va al final de `backend/prisma/schema.prisma`, sección nueva `// ===== GRANJA =====`. Convenciones copiadas de los modelos contables: `@@map` snake_case plural, `@db.Timestamptz(3)` en `createdAt/updatedAt`, `@db.Date` para `FechaContable` (calendario puro, §4.6), `@db.Decimal(18,2)` para `monto` BOB, índices multi-tenant `@@index([organizationId, ...])`.

```prisma
// =====================================================================
// GRANJA (vertical de engorde — operativo, NO contable)
// Ver docs/disenos/granja.md y openspec/changes/granja-v1/design.md.
// Mundo separado de Contabilidad: sin partida doble, sin asientos.
// =====================================================================

enum EstadoLote {
  ACTIVO
  CERRADO
}

// Declara a qué tabla de movimiento pertenece un TipoRegistro.
// Enum EXTENSIBLE: agregar VENTA en v2 es migración aditiva, no rediseño (riel v1.5/v2).
enum NaturalezaRegistro {
  INVERSION
  CANTIDAD
}

model Lote {
  id              String     @id @default(uuid())
  organizationId  String     // multi-tenant (§4.2) — NOT NULL, toda query filtra

  nombre          String?    // etiqueta humana opcional
  galpon          String?    // texto libre, sin unicidad (granja.md §5.1)
  fechaIngreso    DateTime   @db.Date  // FechaContable (calendario puro, §4.6)
  cantidadInicial Int        // pollitos BB. > 0 (CHECK). INMUTABLE post-create (service)
  estado          EstadoLote @default(ACTIVO)

  fechaEstimadaSaca DateTime? @db.Date  // FechaContable opcional
  fechaCierre       DateTime? @db.Date  // se setea al cerrar
  detalle           String?             // observaciones libres

  // ----- RIEL ADITIVO v1.5 (NO se construye en v1; columnas futuras nullable) -----
  // precioVentaFinal    Decimal? @db.Decimal(18,2)  // snapshot al cerrar (v1.5)
  // costoPorPolloFinal  Decimal? @db.Decimal(18,2)  // snapshot derivado al cerrar (v1.5)
  // mortalidadFinal     Decimal? @db.Decimal(5,4)   // snapshot % al cerrar (v1.5)
  // Quedan documentadas, NO declaradas: agregarlas en v1.5 es ALTER ADD COLUMN nullable (no destructivo).

  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  organization         Organization          @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  movimientosInversion MovimientoInversion[]
  movimientosCantidad  MovimientoCantidad[]

  @@index([organizationId, estado])  // dashboard: lotes ACTIVO por org
  @@index([organizationId, fechaIngreso])
  @@map("lotes")
}

model TipoRegistro {
  id             String             @id @default(uuid())
  organizationId String             // multi-tenant. Los esSistema se siembran por org al activar granja
  nombre         String
  naturaleza     NaturalezaRegistro
  esSistema      Boolean            @default(false)  // true = seed, no eliminable
  activo         Boolean            @default(true)   // soft-disable

  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  organization         Organization          @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  movimientosInversion MovimientoInversion[]
  movimientosCantidad  MovimientoCantidad[]

  @@unique([organizationId, nombre])  // unicidad por org (defense in depth + upsert idempotente del seed)
  @@index([organizationId, naturaleza])
  @@map("tipos_registro")
}

model MovimientoInversion {
  id              String   @id @default(uuid())
  organizationId  String   // denormalizado para queries sin JOIN (patrón LineaComprobante)
  loteId          String
  tipoRegistroId  String
  fecha           DateTime @db.Date  // FechaContable; PUEDE ser anterior a fechaIngreso (gastos previos)
  monto           Decimal  @db.Decimal(18, 2)  // > 0 (service). Money, nunca number (§4.5)
  detalle         String?  // @MaxLength(500) en DTO

  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  lote         Lote         @relation(fields: [loteId], references: [id], onDelete: Cascade)
  tipoRegistro TipoRegistro @relation(fields: [tipoRegistroId], references: [id], onDelete: Restrict)

  @@index([organizationId, loteId])  // sirve también al read-model batch (WHERE loteId IN (...))
  @@index([loteId, tipoRegistroId])  // desglose de costos por tipo (informe del lote)
  @@map("movimientos_inversion")
}

model MovimientoCantidad {
  id              String   @id @default(uuid())
  organizationId  String   // denormalizado
  loteId          String
  tipoRegistroId  String
  fecha           DateTime @db.Date  // FechaContable
  cantidad        Int      // > 0 (service). Aves que SALEN (resta) — granja.md §5.4
  detalle         String?  // @MaxLength(500) en DTO

  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  lote         Lote         @relation(fields: [loteId], references: [id], onDelete: Cascade)
  tipoRegistro TipoRegistro @relation(fields: [tipoRegistroId], references: [id], onDelete: Restrict)

  @@index([organizationId, loteId])
  @@map("movimientos_cantidad")
}
```

Más backrelations en `model Organization` (agregar al bloque de relaciones existente):
```prisma
  lotes         Lote[]
  tiposRegistro TipoRegistro[]
  movimientosInversion MovimientoInversion[]
  movimientosCantidad  MovimientoCantidad[]
```

### CHECK `cantidadInicial > 0` (raw SQL aditivo en la migration)

Prisma no expresa CHECK de columna en el schema. Se agrega como raw SQL al final del `migration.sql` (igual que el CHECK de vertical exclusivo y el de contactos, §11.6):

```sql
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_cantidad_inicial_positiva_check" CHECK ("cantidadInicial" > 0);
```

**Agregar a la tabla de objetos raw SQL vivos del CLAUDE.md §11.6** (para que futuras regeneraciones no lo dropeen). Mismo protocolo que los CHECK existentes.

### Por qué NO hay CHECK de `avesVivas >= 0` (P6, decisión deliberada)

`avesVivas = cantidadInicial − Σ(MovimientoCantidad.cantidad)` es un AGREGADO sobre filas de otra tabla. Un CHECK de columna no puede expresarlo (solo lo haría un trigger, fuera de scope v1). El invariante vive en el **service bajo `SELECT FOR UPDATE`** (ver §7) + test. NO se agrega trigger: es complejidad no justificada para uso single-user/org.

---

## 4. Entidades de dominio puras (firmas TS)

Las entidades viven en `granja/domain/`, sin NestJS ni Prisma. Reciben/exponen `Money` y `FechaContable`. El adapter mapea row Prisma → entidad de dominio en el boundary (siguiendo el criterio L2 "domain puro": las entidades son puras; el repo puede devolver la entidad mapeada).

### `enums.ts` (P2 — propios, espejan Prisma sin importarlo)
```typescript
export enum EstadoLote { ACTIVO = 'ACTIVO', CERRADO = 'CERRADO' }
export enum NaturalezaRegistro { INVERSION = 'INVERSION', CANTIDAD = 'CANTIDAD' }
```

### `Lote` (aggregate root)
```typescript
export class Lote {
  private constructor(
    readonly id: string,
    readonly organizationId: string,
    readonly nombre: string | null,
    readonly galpon: string | null,
    readonly fechaIngreso: FechaContable,
    readonly cantidadInicial: number,
    readonly estado: EstadoLote,
    readonly fechaEstimadaSaca: FechaContable | null,
    readonly fechaCierre: FechaContable | null,
    readonly detalle: string | null,
  ) {}

  /** Crea un lote nuevo validando cantidadInicial > 0 (lanza RangeError si <= 0). estado=ACTIVO. */
  static crear(props: {...}): Lote;

  /** Reconstruye desde persistencia (sin re-validar; ya estaba en BD). */
  static rehidratar(props: {...}): Lote;

  get estaActivo(): boolean;     // estado === ACTIVO
  get estaCerrado(): boolean;

  /** Invariante de raíz: solo un lote ACTIVO admite movimientos nuevos. Lanza LoteCerradoError si está CERRADO. */
  assertAdmiteMovimientos(): void;

  /** edadDias relativo a "hoy" calendario La Paz. Recibe la fecha hoy (el service la trae de ClockPort, el dominio no toca el reloj). */
  edadDias(hoy: FechaContable): number;
}
```

### `TipoRegistro`
```typescript
export class TipoRegistro {
  private constructor(
    readonly id: string,
    readonly organizationId: string,
    readonly nombre: string,
    readonly naturaleza: NaturalezaRegistro,
    readonly esSistema: boolean,
    readonly activo: boolean,
  ) {}
  static crear(props: {...}): TipoRegistro;   // valida nombre no vacío (VO o trim+throw)
  static rehidratar(props: {...}): TipoRegistro;

  /** El tipo debe matchear la naturaleza del movimiento que se intenta crear. */
  esDeNaturaleza(n: NaturalezaRegistro): boolean;
  get eseliminable(): boolean;  // !esSistema
}
```

### `MovimientoInversion` / `MovimientoCantidad`
```typescript
export class MovimientoInversion {
  private constructor(
    readonly id: string, readonly organizationId: string, readonly loteId: string,
    readonly tipoRegistroId: string, readonly fecha: FechaContable,
    readonly monto: Money, readonly detalle: string | null,
  ) {}
  static crear(props: {...}): MovimientoInversion;  // valida monto > 0 (lanza MontoInvalidoError si <= 0)
}

export class MovimientoCantidad {
  private constructor(
    readonly id: string, readonly organizationId: string, readonly loteId: string,
    readonly tipoRegistroId: string, readonly fecha: FechaContable,
    readonly cantidad: number, readonly detalle: string | null,
  ) {}
  static crear(props: {...}): MovimientoCantidad;  // valida cantidad > 0 entero (lanza CantidadInvalidaError)
}
```

### `ResumenLote` (struct de derivados — el corazón del read)
```typescript
export class ResumenLote {
  private constructor(
    readonly loteId: string,
    readonly cantidadInicial: number,
    readonly totalMuertes: number,
    readonly avesVivas: number,          // cantidadInicial - totalMuertes (>= 0 garantizado por invariante)
    readonly costoAcumulado: Money,      // Σ inversiones
    readonly costoPorPolloVivo: Money | null,  // avesVivas > 0 ? costo/aves : null
    readonly porcentajeMortalidad: number,     // totalMuertes / cantidadInicial (0..1)
  ) {}

  /** Construye el resumen a partir de los agregados crudos del read-model. PURO, testeable sin DB. */
  static calcular(input: {
    loteId: string;
    cantidadInicial: number;
    totalMuertes: number;
    costoAcumulado: Money;
  }): ResumenLote;
}
```

### Invariantes — dónde viven

| Invariante | Dónde | Por qué |
|------------|-------|---------|
| `cantidadInicial > 0` | entidad `Lote.crear` + CHECK BD | self-validating + defense in depth |
| `monto > 0` | entidad `MovimientoInversion.crear` | self-validating |
| `cantidad > 0` (entero) | entidad `MovimientoCantidad.crear` | self-validating |
| Movimiento solo sobre lote ACTIVO | entidad `Lote.assertAdmiteMovimientos` (lo invoca el service) | regla de estado de la raíz |
| `tipoRegistro.naturaleza == tabla del movimiento` | **service** (`MovimientoService`) — cruza dos entidades | requiere leer el TipoRegistro; no es invariante de una sola entidad |
| `avesVivas >= 0` (Σ muertes ≤ cantidadInicial) | **service** bajo `SELECT FOR UPDATE` (§7) | agregado multi-fila, no expresable en entidad ni BD |
| `cantidadInicial` inmutable post-create | **service** (`update` la ignora) + test del PATCH | la columna existe; el service es la autoridad |
| filtro `organizationId` en toda query | **adapter** (defense in depth) | §4.2 |

---

## 5. Contratos de ports (abstract class + Symbol token)

Todos espejan el patrón de `TipoDocumentoFisicoRepositoryPort`: `abstract class`, Symbol exportado, `tx?: Prisma.TransactionClient` en cada método, `organizationId` como primer parámetro siempre.

### `LoteRepositoryPort` — `LOTE_REPOSITORY_PORT`
```typescript
abstract class LoteRepositoryPort {
  abstract create(organizationId: string, data: LoteCreateData, tx?: Tx): Promise<Lote>;
  abstract findById(organizationId: string, id: string, tx?: Tx): Promise<Lote | null>;
  abstract listar(organizationId: string, filtros: { estado?: EstadoLote }, pagination: Pagination, tx?: Tx): Promise<{ items: Lote[]; total: number }>;
  /** PATCH; NO toca cantidadInicial (no figura en LoteUpdateData — inmutable). */
  abstract update(organizationId: string, id: string, data: LoteUpdateData, tx?: Tx): Promise<Lote>;
  /** Setea estado=CERRADO + fechaCierre. Separado de update() para que el cierre sea explícito. */
  abstract cerrar(organizationId: string, id: string, fechaCierre: FechaContable, tx?: Tx): Promise<Lote>;
  /** ★ Lock pesimista del lote dentro de una TX (SELECT ... FOR UPDATE). Para el invariante avesVivas. */
  abstract findByIdForUpdate(organizationId: string, id: string, tx: Tx): Promise<Lote | null>;
}
```

### `TipoRegistroRepositoryPort` — `TIPO_REGISTRO_REPOSITORY_PORT`
```typescript
abstract class TipoRegistroRepositoryPort {
  abstract create(organizationId: string, data: TipoRegistroCreateData, tx?: Tx): Promise<TipoRegistro>;
  abstract findById(organizationId: string, id: string, tx?: Tx): Promise<TipoRegistro | null>;
  abstract findByNombre(organizationId: string, nombre: string, tx?: Tx): Promise<TipoRegistro | null>;  // pre-check unicidad (F-01)
  abstract listar(organizationId: string, filtros: { naturaleza?: NaturalezaRegistro; activo?: boolean | 'all' }, tx?: Tx): Promise<TipoRegistro[]>;
  abstract update(organizationId: string, id: string, data: TipoRegistroUpdateData, tx?: Tx): Promise<TipoRegistro>;  // solo nombre
  abstract setActivo(organizationId: string, id: string, activo: boolean, tx?: Tx): Promise<TipoRegistro>;
  abstract countMovimientos(organizationId: string, tipoRegistroId: string, tx?: Tx): Promise<number>;  // >0 ⇒ no eliminable
  abstract eliminar(organizationId: string, id: string, tx?: Tx): Promise<number>;
  /** ★ Upsert idempotente del seed por (organizationId, nombre). Re-correr = no-op. */
  abstract upsertSeed(organizationId: string, seeds: TipoRegistroSeedRow[], tx?: Tx): Promise<void>;
}
```

### `MovimientoRepositoryPort` — `MOVIMIENTO_REPOSITORY_PORT`
Un solo port para ambos movimientos (cohesión: el service los orquesta juntos en la misma TX).
```typescript
abstract class MovimientoRepositoryPort {
  abstract createInversion(organizationId: string, data: MovimientoInversionCreateData, tx?: Tx): Promise<MovimientoInversion>;
  abstract createCantidad(organizationId: string, data: MovimientoCantidadCreateData, tx?: Tx): Promise<MovimientoCantidad>;
  /** ★ Suma de muertes del lote DENTRO de la TX (para el chequeo avesVivas >= 0 tras el FOR UPDATE). */
  abstract sumCantidadByLote(organizationId: string, loteId: string, tx: Tx): Promise<number>;
  abstract listInversionByLote(organizationId: string, loteId: string, tx?: Tx): Promise<MovimientoInversion[]>;
  abstract listCantidadByLote(organizationId: string, loteId: string, tx?: Tx): Promise<MovimientoCantidad[]>;
  abstract eliminarInversion(organizationId: string, loteId: string, movimientoId: string, tx?: Tx): Promise<number>;
  abstract eliminarCantidad(organizationId: string, loteId: string, movimientoId: string, tx?: Tx): Promise<number>;
}
```

### `LoteResumenReaderPort` — `LOTE_RESUMEN_READER_PORT` (★ read-model BATCH, P3)
```typescript
/** Agregados crudos por lote — el cálculo de Money/derivados lo hace ResumenLote.calcular en el service. */
export interface AgregadosLote {
  loteId: string;
  totalMuertes: number;     // Σ MovimientoCantidad.cantidad
  costoAcumulado: string;   // Σ MovimientoInversion.monto (Decimal serializado; el service lo envuelve en Money)
}
/** Desglose por tipo para el informe del lote (un solo lote). */
export interface DesgloseCostoPorTipo {
  tipoRegistroId: string;
  tipoNombre: string;
  total: string;            // Decimal serializado
}

abstract class LoteResumenReaderPort {
  /**
   * ★ MÉTODO ESTRELLA. Agregados de N lotes en 2 queries TOTALES (no N×2):
   *   - groupBy MovimientoCantidad WHERE loteId IN (...) → totalMuertes por lote
   *   - groupBy MovimientoInversion WHERE loteId IN (...) → costoAcumulado por lote
   * Devuelve un Map<loteId, AgregadosLote>. Lotes sin movimientos → {totalMuertes:0, costoAcumulado:'0'}.
   */
  abstract agregadosPorLotes(organizationId: string, loteIds: string[]): Promise<Map<string, AgregadosLote>>;
  /** Desglose de costos por TipoRegistro para UN lote (informe detallado). groupBy tipoRegistroId. */
  abstract desgloseCostoPorTipo(organizationId: string, loteId: string): Promise<DesgloseCostoPorTipo[]>;
}
```

### `TipoRegistroSeederPort` — `TIPO_REGISTRO_SEEDER_PORT` (lo consume TenantsModule)
```typescript
abstract class TipoRegistroSeederPort {
  /** Siembra los 12 tipos de fábrica en el tenant. Idempotente (upsert por (organizationId, nombre)). */
  abstract seedDefaultsForTenant(organizationId: string, tx?: Prisma.TransactionClient): Promise<void>;
}
```
> A diferencia de `TipoDocumentoFisicoSeederPort` (donde `tx` es OBLIGATORIO porque corre dentro de la TX de creación de la org), acá `tx` es **opcional**: el seed de granja se dispara en `updateFeatures` (activación posterior), no necesariamente dentro de una TX de creación. El adapter abre su propia operación si no recibe `tx`.

---

## 6. El cálculo costo/pollo (read-model, sin N×2)

**Dónde vive el cálculo de Money/derivados**: en `ResumenLote.calcular` (dominio puro, testeable sin DB). **Dónde vive la agregación SQL**: en `LoteResumenReaderPort` (adapter Prisma). El `DashboardService`/`LoteService` orquesta: pide agregados crudos al reader, envuelve `costoAcumulado` en `Money`, llama `ResumenLote.calcular`.

Fórmula (con `Money`, espejo de saldos contables):
```
avesVivas            = cantidadInicial − totalMuertes            (int; >= 0 por invariante del service)
costoAcumulado       = Money.of(Σ monto)                          (>= 0)
costoPorPolloVivo    = avesVivas > 0 ? costoAcumulado dividido entre avesVivas : null
porcentajeMortalidad = cantidadInicial > 0 ? totalMuertes / cantidadInicial : 0
```

**División por cero (`avesVivas = 0`, mortalidad total)**: `costoPorPolloVivo = null`. El DTO lo serializa como `null`; la UI muestra "—". NUNCA se divide por 0. El CHECK `cantidadInicial > 0` garantiza que el denominador de `porcentajeMortalidad` nunca es 0.

> `Money` no expone `div` hoy (ver `money.ts`). El diseño requiere **agregar `Money.div(divisor: number): Money`** al value object compartido (`common/domain/money.ts`), envolviendo `Prisma.Decimal.div` con redondeo a 2 decimales (`toFixed(2)` semántica BOB). Es un método aditivo, no rompe nada. Alternativa si se prefiere no tocar `common`: calcular con `costoAcumulado.toPrismaDecimal().div(avesVivas)` en el service — pero agregar `div` a `Money` es más limpio y reutilizable. **Decisión: agregar `Money.div`** (commit separado, scope `common`, con su test).

**Dashboard de N lotes en 2 queries (no N×2)** — el anti-patrón sería: por cada lote, una query de muertes + una de costo (= 2N). El read-model batch lo evita:

```
DashboardService.lotesActivosConResumen(organizationId):
  1. lotes = loteRepo.listar(organizationId, { estado: ACTIVO })        // 1 query (índice @@index([organizationId, estado]))
  2. loteIds = lotes.map(l => l.id)
  3. agregados = loteResumenReader.agregadosPorLotes(organizationId, loteIds)  // 2 queries TOTALES (groupBy IN)
  4. lotes.map(l => ResumenLote.calcular({ ...l, ...agregados.get(l.id) }))     // cálculo puro en memoria
  → TOTAL: 3 queries para N lotes, constante.
```

Las dos queries de agregación usan `prisma.movimientoCantidad.groupBy({ by: ['loteId'], where: { organizationId, loteId: { in: loteIds } }, _sum: { cantidad: true } })` y el equivalente para `movimientoInversion._sum.monto`. El índice `@@index([organizationId, loteId])` de cada tabla de movimiento las sirve.

---

## 7. Estrategia transaccional (invariante `avesVivas >= 0`)

**Race condition** (proposal §8, exploration P6): dos `MovimientoCantidad` concurrentes sobre el mismo lote, cada uno leyendo `avesVivas` antes de que el otro escriba, podrían dejar `Σ muertes > cantidadInicial`. Severidad baja (uso single-user/org), pero el invariante es duro → se enforza con lock pesimista, NO con read-then-write optimista.

`MovimientoService.registrarCantidad`:
```
prisma.$transaction(async (tx) => {
  const lote = await loteRepo.findByIdForUpdate(organizationId, loteId, tx);   // SELECT ... FOR UPDATE
  if (!lote) throw new LoteNoEncontradoError(loteId);
  lote.assertAdmiteMovimientos();                                              // 422 si CERRADO
  const tipo = await tipoRegistroRepo.findById(organizationId, tipoRegistroId, tx);
  // valida tipo existe, activo, naturaleza === CANTIDAD → si no, NaturalezaInvalidaError
  const muertesActuales = await movimientoRepo.sumCantidadByLote(organizationId, loteId, tx);
  const avesVivas = lote.cantidadInicial - muertesActuales;
  if (cantidad > avesVivas) throw new MovimientoCantidadExcedeVivasError(loteId, avesVivas, cantidad);  // 422
  return movimientoRepo.createCantidad(organizationId, { ...data }, tx);
});
```

`findByIdForUpdate` se implementa con `tx.$queryRaw\`SELECT id, "cantidadInicial", estado FROM lotes WHERE id = ${id} AND "organizationId" = ${organizationId} FOR UPDATE\`` (Prisma no expone `FOR UPDATE` en el query builder; raw parametrizado, sin interpolación de strings). El `FOR UPDATE` serializa las TX concurrentes sobre la misma fila `lote`: la segunda espera a que la primera commitee, lee `muertesActuales` ya actualizado, y el chequeo `cantidad > avesVivas` la rechaza correctamente. Justificación: bloquear la RAÍZ (el lote) y no las filas de movimiento es lo correcto porque el lote es el aggregate root y el invariante es sobre su total.

`registrarInversion` NO necesita `FOR UPDATE` (sumar costo no tiene invariante de tope). Va en una operación simple validando lote ACTIVO + naturaleza INVERSION.

---

## 8. Seed-on-activation (wiring en TenantsService.updateFeatures)

El seed de granja sigue el patrón `TipoDocumentoFisico` pero se dispara en **`updateFeatures`** (activación posterior), no en `create` (donde el branch GRANJA hoy es un no-op placeholder, `tenants.service.ts:93-95`).

**Cambios en `TenantsModule`/`TenantsService`** (Slice 5):
1. `GranjaModule` exporta `TIPO_REGISTRO_SEEDER_PORT` (igual que `TiposDocumentoFisicoModule` exporta el suyo).
2. `TenantsModule` importa `GranjaModule` y `TenantsService` inyecta `@Inject(TIPO_REGISTRO_SEEDER_PORT) tipoRegistroSeeder`.
3. En `updateFeatures`, tras el `updateFeatures` exitoso, si granja pasó de OFF→ON, sembrar:

```typescript
async updateFeatures(tenantId, dto) {
  const current = await this.repo.findFeatures(tenantId);
  if (!current) throw new TenantNoEncontradoError({ id: tenantId });
  const contabilidadEnabled = dto.contabilidadEnabled ?? current.contabilidadEnabled;
  const granjaEnabled = dto.granjaEnabled ?? current.granjaEnabled;
  if (contabilidadEnabled && granjaEnabled) throw new VerticalNoExclusivoError(tenantId);  // YA existe (P5)

  const seSembrarGranja = granjaEnabled && !current.granjaEnabled;  // transición OFF→ON

  const updated = await this.repo.updateFeatures(tenantId, dto);
  if (seSembrarGranja) {
    // Idempotente (upsert por (organizationId, nombre)) — re-activar no duplica.
    await this.tipoRegistroSeeder.seedDefaultsForTenant(tenantId);
  }
  // invalidar cache ModuleEnabledGuard (igual que hoy)
  ...
}
```

> El seed NO va dentro de una TX con el `updateFeatures` (el flag y el seed son operaciones separadas; si el seed fallara, el flag ya está ON y un re-trigger re-siembra idempotente). Trade-off aceptable vs. el seed de creación de org (que SÍ es atómico porque la org no debe nacer a medias). Aquí la org ya existe; la activación es incremental.

Para orgs creadas vía `create` con `ModuloOrganizacion.GRANJA`, el branch placeholder (`tenants.service.ts:93`) se reemplaza por `await this.tipoRegistroSeeder.seedDefaultsForTenant(org.id, tx)` (dentro de la TX de creación, `tx` presente).

### Lista de TipoRegistro de fábrica (`seed/tipos-registro-fabrica.ts`)
`readonly TipoRegistroSeedRow[]` con `{ nombre, naturaleza, esSistema: true }`:

| naturaleza | nombre |
|------------|--------|
| INVERSION | Compra de pollitos |
| INVERSION | Alimento |
| INVERSION | Alquiler Galpón |
| INVERSION | Mantenimiento Galpón |
| INVERSION | Vacunas |
| INVERSION | Veterinario |
| INVERSION | Mano de Obra |
| INVERSION | Chala |
| INVERSION | Garrafas |
| INVERSION | Agua y Luz |
| INVERSION | Otros gastos |
| CANTIDAD | Mortalidad |

`upsertSeed` hace `upsert` por `organizationId_nombre` (el `@@unique([organizationId, nombre])`), `create` con `esSistema: true`, `update` no-op o refresca `naturaleza`.

---

## 9. Endpoints (`/api/granja/*` — P4)

Todos bajo `@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard)` + `@RequireModule('granja')`. `resolveTenantId(req)` igual que `tipos-documento-fisico.controller.ts`.

| Método | Ruta | Permiso | Notas |
|--------|------|---------|-------|
| GET | `/api/granja/dashboard` | `granja.dashboard.read` | lotes ACTIVO + resumen batch |
| POST | `/api/granja/lotes` | `granja.lotes.create` | crea lote (cantidadInicial > 0) |
| GET | `/api/granja/lotes` | `granja.lotes.read` | listar (filtro estado, paginado) |
| GET | `/api/granja/lotes/:id` | `granja.lotes.read` | detalle + resumen + desglose por tipo |
| PATCH | `/api/granja/lotes/:id` | `granja.lotes.update` | edita; IGNORA cantidadInicial |
| POST | `/api/granja/lotes/:id/cerrar` | `granja.lotes.update` | estado→CERRADO + fechaCierre |
| GET | `/api/granja/tipos-registro` | `granja.tipos-registro.read` | fábrica + propios (filtro naturaleza/activo) |
| POST | `/api/granja/tipos-registro` | `granja.tipos-registro.create` | crea propio (esSistema=false) |
| PATCH | `/api/granja/tipos-registro/:id` | `granja.tipos-registro.update` | edita nombre / toggle activo |
| DELETE | `/api/granja/tipos-registro/:id` | `granja.tipos-registro.delete` | 409 si esSistema o tiene movimientos |
| POST | `/api/granja/lotes/:id/movimientos/inversion` | `granja.movimientos.create` | monto > 0, lote ACTIVO |
| POST | `/api/granja/lotes/:id/movimientos/cantidad` | `granja.movimientos.create` | FOR UPDATE + avesVivas >= 0 |
| GET | `/api/granja/lotes/:id/movimientos` | `granja.movimientos.read` | inversión + cantidad del lote |
| DELETE | `/api/granja/lotes/:id/movimientos/inversion/:movId` | `granja.movimientos.delete` | borra movimiento de inversión |
| DELETE | `/api/granja/lotes/:id/movimientos/cantidad/:movId` | `granja.movimientos.delete` | borra movimiento de cantidad |

15 endpoints. (`granja.chat.interact` existe en el catálogo pero es v2 — no se implementa endpoint en v1.)

**DTOs clave**: `monto` cruza HTTP como **string** (`"1250.50"`, §4.5) con `@IsNumberString` o `@Matches(/^\d+(\.\d{1,2})?$/)`; el service hace `Money.of(dto.monto)`. `cantidad` es `@IsInt @Min(1)`. `detalle` es `@IsOptional @IsString @MaxLength(500)` (P7). Fechas como ISO `YYYY-MM-DD` → `FechaContable.fromIso`. Responses serializan `costoAcumulado`/`costoPorPolloVivo` como `string | null` (`Money.toBob()`), `avesVivas`/`edadDias`/`cantidad` como number, `porcentajeMortalidad` como string con 4 decimales.

---

## 10. Errores del módulo (`granja.errors.ts`, códigos GRANJA_*)

Subclases de `DomainError` (mapeadas por `GlobalExceptionFilter`, §6.2). Códigos estables.

| Clase | Base | Code | HTTP |
|-------|------|------|------|
| `LoteNoEncontradoError` | NotFoundError | `GRANJA_LOTE_NO_ENCONTRADO` | 404 |
| `LoteCerradoError` | InvalidStateError | `GRANJA_LOTE_CERRADO` | 422 |
| `CantidadInicialInvalidaError` | ValidationError | `GRANJA_LOTE_CANTIDAD_INICIAL_INVALIDA` | 400 |
| `TipoRegistroNoEncontradoError` | NotFoundError | `GRANJA_TIPO_REGISTRO_NO_ENCONTRADO` | 404 |
| `TipoRegistroNombreDuplicadoError` | ConflictError | `GRANJA_TIPO_REGISTRO_NOMBRE_DUPLICADO` | 409 |
| `TipoRegistroNaturalezaInvalidaError` | InvalidStateError | `GRANJA_TIPO_REGISTRO_NATURALEZA_INVALIDA` | 422 |
| `TipoRegistroInactivoError` | InvalidStateError | `GRANJA_TIPO_REGISTRO_INACTIVO` | 422 |
| `TipoRegistroSistemaNoEliminableError` | ConflictError | `GRANJA_TIPO_REGISTRO_SISTEMA_NO_ELIMINABLE` | 409 |
| `TipoRegistroConMovimientosError` | ConflictError | `GRANJA_TIPO_REGISTRO_CON_MOVIMIENTOS` | 409 |
| `MovimientoCantidadExcedeVivasError` | InvalidStateError | `GRANJA_MOVIMIENTO_CANTIDAD_EXCEDE_VIVAS` | 422 |
| `MontoInvalidoError` | ValidationError | `GRANJA_MOVIMIENTO_MONTO_INVALIDO` | 400 |
| `CantidadInvalidaError` | ValidationError | `GRANJA_MOVIMIENTO_CANTIDAD_INVALIDA` | 400 |
| `MovimientoNoEncontradoError` | NotFoundError | `GRANJA_MOVIMIENTO_NO_ENCONTRADO` | 404 |

---

## 11. Frontend (alto nivel — Slice 6)

`frontend/src/features/granja/` (screaming, §2 frontend): `api/`, `hooks/`, `components/`, `pages/`, `schemas/`, `lib/`. **Mobile-first ESTRICTO** (base 375px, tap targets ≥44px, inputs `text-base md:text-sm`, costo/pollo como dato más prominente).

**Bloque `granja` a crear en `frontend/src/lib/permissions.ts`** (FALTA hoy — riesgo alto, va ANTES de cualquier componente). Keys exactas del catálogo backend (`granja.{submodulo}.{accion}`):
```ts
granja: {
  dashboard: { read: 'granja.dashboard.read' },
  lotes: {
    read: 'granja.lotes.read',
    create: 'granja.lotes.create',
    update: 'granja.lotes.update',
    delete: 'granja.lotes.delete',
  },
  tiposRegistro: {
    read: 'granja.tipos-registro.read',
    create: 'granja.tipos-registro.create',
    update: 'granja.tipos-registro.update',
    delete: 'granja.tipos-registro.delete',
  },
  movimientos: {
    read: 'granja.movimientos.read',
    create: 'granja.movimientos.create',
    update: 'granja.movimientos.update',
    delete: 'granja.movimientos.delete',
  },
  chat: { interact: 'granja.chat.interact' },  // v2; se declara para espejar 1:1 el catálogo
},
```
> El submódulo backend es `tipos-registro` (kebab); la key del objeto es `tiposRegistro` (camel) pero el **string** debe ser `granja.tipos-registro.*` (mismo cuidado que `tiposDocumento` en contabilidad).

Páginas: `dashboard-page` (cards de lotes activos con costo/pollo grande), `lotes-page` (listado + crear/cerrar), `lote-detail-page` (resumen + desglose costos por tipo + % mortalidad + edad + aves vivas + registrar movimientos), `tipos-registro-page`. Gating con `<Can>`/`<PermissionButton>` (§14.7 frontend). Forms RHF + Zod con mensajes en español. Toggle de activación del vertical (Slice 7, último): OWNER/ADMIN llama al endpoint de features; renderiza `VerticalNoExclusivoError` amigable si la org tiene `contabilidadEnabled`.

---

## 12. Mapa slice → archivos

| Slice | Crea/Toca | TDD |
|-------|-----------|-----|
| **S1 — Schema + migración** | `schema.prisma` (+2 enums, +4 modelos, backrelations en Organization); migration con raw SQL CHECK `cantidadInicial > 0`; actualizar tabla §11.6 CLAUDE.md | no (schema only) |
| **S2 — Dominio + ports** | `domain/{enums,lote,tipo-registro,movimiento-inversion,movimiento-cantidad,resumen-lote,granja.errors}.ts`; `ports/{lote,tipo-registro,movimiento}.repository.port.ts`, `lote-resumen.reader.port.ts`, `tipo-registro-seeder.port.ts`; **`common/domain/money.ts` (+`Money.div`)** | unit: invariantes entidades + `ResumenLote.calcular` (lote vacío, 1/varios mov, mortalidad total→null) + `Money.div` |
| **S3 — Adapters CRUD + services base** | `adapters/prisma-{lote,tipo-registro}.repository.ts` + seeder adapter; `seed/tipos-registro-fabrica.ts`; `lote.service.ts` (CRUD sin derivados), `tipo-registro.service.ts`; wiring base `granja.module.ts` | integration adapters (Postgres); unit services con mocks de ports |
| **S4 — Movimientos + read-model (la joya)** | `adapters/prisma-movimiento.repository.ts` (+`sumCantidadByLote`, `findByIdForUpdate` raw `FOR UPDATE`), `prisma-lote-resumen.reader.ts` (batch groupBy); `movimiento.service.ts` (TX + invariante), `dashboard.service.ts` | unit cálculo + invariante avesVivas; integration concurrencia FOR UPDATE + read-model batch |
| **S5 — Controllers + DTO + RBAC + seed wiring** | `dto/*`; `lotes.controller.ts`, `tipos-registro.controller.ts`, `dashboard.controller.ts`; `granja.module.ts` (exporta seeder port); `tenants.service.ts` (+seed en `updateFeatures` OFF→ON y en `create` branch GRANJA); `tenants.module.ts` (importa GranjaModule); `test/granja.e2e-spec.ts` | e2e: multi-tenant aislado + 404 módulo OFF + 403 sin permiso + PATCH cantidadInicial ignorado |
| **S6 — Frontend mobile-first** | `frontend/src/lib/permissions.ts` (+bloque granja); `features/granja/{api,hooks,components,pages,schemas,lib}/*`; ruta + nav item | componentes (Testing Library) + lógica pura en `lib/` |
| **S7 — Toggle activación UI** | toggle en config de org (features endpoint); manejo de `VerticalNoExclusivoError` | componente del toggle |

---

## 13. Decisiones de diseño con tradeoffs

| # | Decisión | Tradeoff / por qué NO-DEUDA |
|---|----------|------------------------------|
| D1 | **`Money.div` aditivo** en `common/domain/money.ts` | Alternativa: hacer la división con `Prisma.Decimal` crudo en el service (rompe la regla "operar siempre con Money"). Agregar `div` es aditivo, reutilizable y mantiene el dinero encapsulado. |
| D2 | **`findByIdForUpdate` con raw `FOR UPDATE`** | Prisma no expone lock pesimista. Optimistic (version column) sería over-engineering para uso single-user. Raw parametrizado es el patrón ya usado en el repo (SecuenciaComprobante, periodos §4.4). |
| D3 | **Un solo `MovimientoRepositoryPort`** para inversión + cantidad | Cohesión: el service los orquesta juntos (mismo lote, misma TX). Dos ports separados duplicarían el manejo de `tx` sin ganancia. |
| D4 | **Read-model en port aparte** (`LoteResumenReaderPort`) | Separa la lectura agregada (batch, performance) de la persistencia CRUD. El dashboard depende solo del reader; no infla el repo principal. |
| D5 | **Agregados crudos del reader, cálculo en dominio** (`ResumenLote.calcular`) | El adapter devuelve `number`/`string` (sin Money — no debe conocer el VO); el dominio puro hace el cálculo (testeable sin DB). Espeja "comprobantes devuelve rows, el service mapea en el boundary" (L2 PR-D). |
| D6 | **Seed en `updateFeatures` (no TX) + en `create` (TX)** | En creación la org debe nacer atómica → TX. En activación posterior la org ya existe → seed idempotente fuera de TX; si falla, re-activar re-siembra sin daño. |
| D7 | **`@@unique([organizationId, nombre])` en TipoRegistro** (no por `codigo`) | TipoRegistro no tiene `codigo` estable (a diferencia de TipoDocumentoFisico). El nombre ES el identificador de negocio; el upsert del seed lo usa como ancla. Defense in depth F-01: pre-check `findByNombre` + UNIQUE. |
| D8 | **`detalle @MaxLength(500)`** (P7) | Igual que `glosa` de DocumentoFisico. Suficiente para la "válvula de presión" (yutes, cables) sin permitir abuso. |

---

## 14. Riel aditivo v1.5 / v2 (NO se construye, se deja la puerta abierta)

| Futuro | Cómo encaja SIN migración destructiva |
|--------|----------------------------------------|
| **Cierre con snapshot de precio (v1.5)** | `ALTER TABLE lotes ADD COLUMN precioVentaFinal / costoPorPolloFinal / mortalidadFinal` — todas **nullable**. Documentadas (comentadas) en el bloque `Lote` del schema. El cierre v1 ya setea `estado=CERRADO` + `fechaCierre`; v1.5 solo agrega la captura del snapshot al cerrar. |
| **Ventas reales (v2)** | **Nueva tabla `MovimientoVenta`** (loteId, cantidad, precioUnitario, fecha) — aditiva, no toca las dos tablas existentes. v1 mantiene `MovimientoInversion`/`MovimientoCantidad` de naturaleza ÚNICA y limpia: nunca se mete semántica de venta en ellas. |
| **Naturaleza VENTA (v2)** | `enum NaturalezaRegistro { INVERSION CANTIDAD VENTA }` — agregar valor de enum Postgres es `ALTER TYPE ADD VALUE` (aditivo). |
| **Galpón como entidad (v2)** | Hoy `galpon String?`. Futuro: tabla `Galpon` + FK nullable `Lote.galponId`, manteniendo el texto como fallback durante migración. |
| **Calculadora what-if (v1.5)** | Aritmética pura sobre derivados ya calculados; no toca schema ni modelo. Componente frontend + (opcional) endpoint sin persistencia. |

---

*Diseño completado. Próximo paso: `sdd-tasks granja-v1`.*
