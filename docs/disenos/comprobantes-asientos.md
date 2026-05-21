# Comprobantes y Asientos Contables — Fase 1.3

> **Estado: CERRADA** — toda la superficie descrita en este doc está
> implementada, con tests unit + integration vs Postgres real + E2E. Ver
> §12.1. Los campos forward-compat (`origenTipo/origenId/contactoId`) nacieron
> con el schema y se activan en Fases 1.4+ sin migración.

Documento de referencia para la implementación del módulo `comprobantes`.
Fuente de verdad para el agregado comprobante + líneas, numeración, transiciones
de estado, anulación con reversión, y el adapter que cierra la deuda dejada por
Fase 1.2 (`NoopComprobantesLockAdapter` → `PrismaComprobantesLockAdapter`).

Este doc **presupone** el core del `CLAUDE.md` §4 (invariantes no-negociables) y
`docs/claude/dominio-contable.md` §4.1. Si contradice algún invariante → va al
core primero, acá después (regla anti-drift, §12 core).

---

## 1. Conceptos y glosario

**Comprobante** — Cabecera del registro contable. Contiene fecha contable, tipo,
número, estado, glosa, moneda principal y totales en BOB. Raíz del agregado.

**LineaComprobante** — Detalle: cada línea afecta a una cuenta con un monto en
débito o crédito, opcionalmente referencia a un contacto, siempre con moneda y
tipo de cambio para producir `debitoBob`/`creditoBob`.

**Asiento contable** — Sinónimo de comprobante en el lenguaje del contador
boliviano. En código, la entidad **es `Comprobante`**. La palabra "asiento"
aparece solo en glosario, UI y logs orientados al usuario.

**Número de comprobante** — Identificador legible `{prefijo}{YY}{MM}-{correlativo:6}`
asignado atómicamente al pasar de BORRADOR a CONTABILIZADO. `prefijo` es una
**sola letra** derivada del `TipoComprobante` (ver §2). Ejemplo:
`I2604-000042` = 42º comprobante de Ingreso del mes 2026-04. Inmutable.

**Correlativo** — Contador consecutivo dentro de `(tenantId, tipo, year, month)`.
Reinicia cada mes. Sin saltos. Asignado con `SecuenciaComprobante` bajo
`SELECT FOR UPDATE` en la misma TX del contabilizar.

**Reversión** — Comprobante tipo AJUSTE con líneas invertidas (débitos ↔
créditos) que anula contablemente a otro. FK unidireccional con back-ref 1:1:
la reversión tiene `anulaAId → original.id` con constraint `@unique`, y
desde el original se accede a la reversión vía la back-ref implícita de
Prisma (`original.reversion`). Una anulación **siempre** crea una reversión;
nunca es solo cambio de estado.

**DEBE / HABER vs débito / crédito** — En el lenguaje del contador boliviano se
dice "DEBE" y "HABER". En el código y la base de datos las columnas se llaman
`debito` y `credito` (alineado con `CLAUDE.md §4.1`). La UI y los textos al
usuario usan "DEBE" / "HABER". Son sinónimos 1:1: `DEBE = debito`, `HABER = credito`.

**Auditoría de comprobante** — Cada creación, edición, contabilización y
anulación se persiste con diff, usuario, timestamp y flag
`fueDuranteReapertura` cuando aplica.

### 1.1 Forma del agregado (ejemplo ilustrativo)

Comprobante de Ingreso por venta de Bs 1.000 (IVA 13% discriminado):

```
Comprobante (cabecera)
├── numero: "I2604-000042"
├── tipo: INGRESO
├── fechaContable: 2026-04-22
├── periodoFiscalId: <uuid del período 2026-04>
├── estado: CONTABILIZADO
├── glosa: "Venta al contado a cliente X"
└── líneas (mínimo 2, suma DEBE = suma HABER en BOB)
    ├── LineaComprobante #1: Cuenta "Caja MN",     DEBE  1000,00
    ├── LineaComprobante #2: Cuenta "Ventas",      HABER  870,00
    └── LineaComprobante #3: Cuenta "IVA Débito",  HABER  130,00
```

- La **cabecera** (`Comprobante`) guarda datos globales y los totales cache en BOB.
- Las **líneas** (`LineaComprobante`) son la tabla de detalle donde viven los
  asientos propiamente dichos: `cuenta + monto + debe/haber + moneda + tipoCambio`.
- La suma de DEBE y HABER en BOB debe cuadrar (±Bs 0,01) al contabilizar
  (§5.1). En BORRADOR puede estar desbalanceado mientras se edita.

---

## 2. Tipos de comprobante

El tipo determina el **prefijo de numeración** y la **semántica** operativa.
Enum cerrado; no configurable per-tenant (es estándar boliviano).

| Tipo | Prefijo | Semántica | Cuándo se usa en Fase 1.3 |
|---|---|---|---|
| `APERTURA` | `A` | Saldos iniciales de la gestión. Uno por gestión (lógico, no enforzado por DB en 1.3). | Manual, al arrancar una gestión nueva |
| `DIARIO` | `D` | Asiento general, uso más común. Tipo por defecto en la UI. | Manual |
| `INGRESO` | `I` | Entradas de dinero (cobros, ventas cobradas, depósitos). | Manual |
| `EGRESO` | `E` | Salidas de dinero (pagos, compras pagadas, cheques emitidos). | Manual |
| `AJUSTE` | `J` | Ajustes contables, reversiones y reclasificaciones. | Manual + **automático (anulación)** |
| `TRASPASO` | `T` | Movimientos entre cuentas internas (caja→banco, transferencias internas). | Manual |
| `CIERRE` | `C` | Cierre de cuentas de resultado al final de la gestión. | Reservado — generación automática en Fase 1.5 |

**Regla**: en Fase 1.3 el tipo lo elige el usuario al crear el comprobante y es
inmutable post-creación. En Fase 1.5 se agregan generadores automáticos que
emiten `APERTURA` y `CIERRE` atómicamente; por eso la enumeración incluye esos
tipos desde 1.3 aunque la UI solo deje crearlos manualmente al principio.

**Prefijos — decisión final**: una sola letra por tipo. Ejemplo de número:
`I2604-000042` = 42º comprobante de Ingreso del mes 2026-04. Esto deviated
intencionalmente del sistema previo (avicont-ia usaba `CD`, `CI`, `CE`, `CT`,
`CA` de 2 letras) — la forma de 1 letra es más legible en listados y más fácil
de dictar por teléfono, y no hay ambigüedad porque el enum es cerrado.

---

## 3. Flujo operativo completo

### 3.1 Diagrama de estados

```
  [crear]
     │
     ▼
  BORRADOR ──────── [eliminar] ────▶ (desaparece)
     │
     │ [contabilizar]
     │   - valida partida doble, glosa, cuentas, contactos
     │   - asigna número atómicamente
     ▼
  CONTABILIZADO ◀──┐
     │             │ [reabrir período]
     │             │
     │ [cierre    │
     │  período]  │
     ▼            │
  BLOQUEADO ─────┘
     │
     │ [anular] (solo desde CONTABILIZADO, nunca desde BLOQUEADO)
     ▼
  ANULADO  ──── FK ───▶  Comprobante AJUSTE de reversión (CONTABILIZADO)
```

### 3.2 Crear borrador

Tenant postea `POST /api/comprobantes` con `{ tipo, fechaContable, glosa, lineas[] }`.

1. Resuelve `periodoFiscalId` desde `fechaContable` vía `PeriodosReaderPort`.
   Si el período no existe → `GESTION_NO_ABIERTA`. Si está CERRADO →
   `PERIODO_NO_ABIERTO`.
2. Calcula `debitoBob` y `creditoBob` de cada línea (`monto × tipoCambio`).
   En 1.3, `tipoCambio` lo manda el cliente. El validador de coherencia
   `debitoBob == debito × tipoCambio` con tolerancia ±0.01 corre siempre.
3. NO valida partida doble — un borrador puede estar desbalanceado.
4. NO asigna número.
5. Persiste con estado `BORRADOR` y registra auditoría `CREADO`.

**Invariantes mínimas del borrador:**
- `tipo` válido.
- `fechaContable` formato ISO `YYYY-MM-DD`, parseable a `FechaContable`.
- `fechaContable <= ClockPort.hoyEnLaPaz()` (no al futuro).
- `lineas.length >= 1` (al menos una; 2 las exige contabilizar).
- Cada línea: cuenta existe, activa, esDetalle (las cabeceras no reciben movimientos).
- Cada línea: débito XOR crédito (nunca ambos, nunca ninguno) — se permite `0` para
  ambos **solo si es una línea vacía temporal del editor**: `LINEA_SIN_MONTO` si
  ambos son 0 al intentar contabilizar, pero tolerado en borrador.
- `monedaPrincipal` del comprobante y `moneda` de cada línea compatibles con
  `cuenta.permiteMultiMoneda`.
- Si la cuenta tiene `requiereContacto: true` → `contactoId` obligatorio
  **solo al contabilizar**; en borrador puede estar vacío.

### 3.3 Editar borrador

`PATCH /api/comprobantes/:id` sobre estado `BORRADOR`.
Remplazo completo de `lineas` (no parcial) — simplifica reconciliación.
Cada edit registra auditoría `EDITADO` con diff de campos.

### 3.4 Contabilizar

`POST /api/comprobantes/:id/contabilizar`, sin body.
Todo en una TX:

1. Lock pesimista sobre el comprobante (`findFirst` + `FOR UPDATE`).
2. Validación completa (ver §5).
3. Asignar número desde `SecuenciaComprobante` con upsert + `FOR UPDATE`.
4. Calcular totales en BOB y persistirlos en la cabecera.
5. Update a `CONTABILIZADO`, auditoría `CONTABILIZADO` con `{numero, totales}`.

### 3.5 Anular

`POST /api/comprobantes/:id/anular` con `{ motivo: string }` (≥ 10 caracteres).

Solo desde estado **CONTABILIZADO**. Si está BLOQUEADO, el usuario debe
reabrir el período primero; el endpoint rechaza con `COMPROBANTE_BLOQUEADO`.

En una sola TX:
1. Crear comprobante `AJUSTE` con:
   - `fechaContable = ClockPort.hoyEnLaPaz()` (nunca la fecha del original)
   - `periodoFiscalId` resuelto desde esa fecha (debe estar ABIERTO)
   - `glosa = "Reversión de {numeroOriginal}: {motivo}"`
   - `lineas` con `debito ↔ credito` invertidos (también en BOB)
   - `estado = CONTABILIZADO` (se contabiliza directamente, no pasa por borrador)
   - Número propio asignado con la misma secuencia atómica
   - `anulaAId` apunta al original
2. Update del original: `estado = ANULADO`, `anuladoEn`, `anuladoPorUserId`,
   `motivoAnulacion`. No hace falta setear `anuladoPorId` — la back-ref
   `original.reversion` resuelve a la reversión vía el `@unique([anulaAId])`.
3. Auditoría en ambos comprobantes.

**Por qué fecha actual y no la del original**: anular en el mismo día que el
original distorsiona el libro diario del día original — un auditor que pide
el histórico del 15/04 no debería ver una reversión creada el 22/04. La
reversión es un evento posterior que refleja la realidad de **cuándo se
decidió revertir**.

**Por qué período ABIERTO**: la reversión se contabiliza como asiento nuevo y
requiere período abierto en su fecha. Si el período del original está cerrado
(BLOQUEADO), el usuario reabre el período y anula ahí, o anula en la fecha de
hoy (período corriente abierto). Esto es consistente con el invariante
"período cerrado es inmutable" (§4.4 core).

### 3.6 Bloqueo automático en cierre de período

Cierra `periodos-fiscales` vía `ComprobantesLockPort.bloquearPorPeriodo(tx, periodoId)`:
`UPDATE comprobantes SET estado='BLOQUEADO' WHERE periodo_fiscal_id = ? AND estado='CONTABILIZADO'`.

La TX es la misma del cierre del período (atomicidad garantizada, Anti-12).
`PrismaComprobantesLockAdapter` **reemplaza** el `NoopComprobantesLockAdapter`
en el binding del módulo `periodos-fiscales` — el contrato no cambia.

### 3.7 Edición en ventana de reapertura

Cuando `periodos-fiscales` ejecuta una reapertura, los comprobantes vuelven a
`CONTABILIZADO`. En esa ventana, `PATCH /api/comprobantes/:id` funciona bajo
permiso específico `contabilidad.comprobantes.editar_reapertura` (separado del
`editar_borrador`, §4.2).

Cada edición registra auditoría con `fueDuranteReapertura: true` y `reaperturaId`
apuntando al registro de `PeriodoFiscalReopening`. El número, tipo y
`fechaContable` siguen siendo **inmutables** (§4.3 core) — solo se pueden
editar líneas, glosa y contactos.

---

## 4. Modelo de datos (Prisma)

### 4.1 Enums

```prisma
enum TipoComprobante {
  APERTURA
  DIARIO
  INGRESO
  EGRESO
  AJUSTE
  TRASPASO
  CIERRE
}

enum EstadoComprobante {
  BORRADOR
  CONTABILIZADO
  BLOQUEADO
  ANULADO
}
```

### 4.2 Comprobante

```prisma
model Comprobante {
  id              String            @id @default(uuid())
  organizationId  String
  tipo            TipoComprobante
  numero          String?           // NULL en BORRADOR. Asignado al CONTABILIZAR.
  estado          EstadoComprobante @default(BORRADOR)

  fechaContable   DateTime          @db.Date       // calendario puro, §4.6 core
  periodoFiscalId String                           // resuelto al create, inmutable

  glosa           String
  monedaPrincipal Moneda            @default(BOB)

  // Totales cache (calculados al contabilizar, validan partida doble)
  totalDebitoBob  Decimal           @default(0) @db.Decimal(18, 2)
  totalCreditoBob Decimal           @default(0) @db.Decimal(18, 2)

  // Origen (auto-entries de Fase 1.5+; en 1.3 siempre NULL)
  origenTipo      String?                          // "VENTA" | "COMPRA" | "PAGO" | NULL
  origenId        String?                          // id del documento origen

  // Anulación / reversión — una sola FK (1:1). Solo la reversión tiene
  // anulaAId apuntando al original; el original accede a su reversión
  // por la back-ref implícita (`reversion`), resuelta 1:1 gracias a
  // @unique([anulaAId]). Los metadatos de la anulación viven en el original.
  anulaAId         String?                         // AJUSTE → original (NULL en el original)
  anuladoEn        DateTime?                       // solo en el original (timestamptz UTC)
  anuladoPorUserId String?                         // solo en el original
  motivoAnulacion  String?                         // solo en el original

  createdAt       DateTime  @default(now())
  createdByUserId String
  updatedAt       DateTime  @updatedAt

  organization   Organization           @relation(fields: [organizationId], references: [id],  onDelete: Cascade)
  periodoFiscal  PeriodoFiscal          @relation(fields: [periodoFiscalId], references: [id], onDelete: Restrict)
  lineas         LineaComprobante[]
  auditorias     ComprobanteAuditoria[]
  // Lado con FK: este comprobante es una reversión y apunta al original.
  anulaA         Comprobante?           @relation("ComprobanteReversion", fields: [anulaAId], references: [id])
  // Back-ref 1:1: si este comprobante está ANULADO, su reversión es el
  // único Comprobante cuyo anulaAId = this.id.
  reversion      Comprobante?           @relation("ComprobanteReversion")

  // Unicidad del número por (tenant, tipo, numero). numero es NULL en BORRADOR
  // y Postgres permite múltiples NULL en un UNIQUE, así que no colisiona.
  @@unique([organizationId, tipo, numero])

  // Unicidad de auto-entries (§4.9 core, Anti-17). origenTipo/origenId NULL
  // en 1.3 => no colisiona. Campo presente para no migrar en Fase 1.5.
  @@unique([organizationId, origenTipo, origenId])

  // Reversión 1:1 (una anulación genera exactamente una reversión).
  @@unique([anulaAId])

  @@index([organizationId, periodoFiscalId, estado])
  @@index([organizationId, fechaContable])
  @@index([organizationId, tipo, fechaContable])
  @@map("comprobantes")
}
```

### 4.3 LineaComprobante

```prisma
model LineaComprobante {
  id              String   @id @default(uuid())
  organizationId  String                 // denormalizado → queries cross-cuenta sin JOIN
  comprobanteId   String
  orden           Int                    // 1..N, inmutable post-create

  cuentaId        String
  contactoId      String?                // requerido si cuenta.requiereContacto

  // Multi-moneda estructural (§4.5 core). Siempre presente, incluso BOB.
  moneda          Moneda
  debito          Decimal  @default(0) @db.Decimal(18, 2)
  credito         Decimal  @default(0) @db.Decimal(18, 2)
  tipoCambio      Decimal  @default(1) @db.Decimal(14, 8)
  debitoBob       Decimal  @default(0) @db.Decimal(18, 2)
  creditoBob      Decimal  @default(0) @db.Decimal(18, 2)

  glosaLinea      String?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  comprobante     Comprobante @relation(fields: [comprobanteId], references: [id], onDelete: Cascade)
  cuenta          Cuenta      @relation(fields: [cuentaId],      references: [id])

  @@unique([comprobanteId, orden])
  @@index([organizationId, cuentaId])
  @@index([organizationId, comprobanteId])
  @@map("lineas_comprobante")
}
```

**Nota sobre `contactoId`**: el módulo `contactos` vive en Fase 1.4. En 1.3 el
campo es un `String?` libre (UUID) sin FK. Al migrar contactos en 1.4, se
agrega la FK con `onDelete: Restrict`. El validador "cuenta requiere contacto
→ contactoId no nulo" vale igual en 1.3 — solo se enforza existencia del
contacto cuando el módulo exista.

### 4.4 SecuenciaComprobante

```prisma
model SecuenciaComprobante {
  organizationId String
  tipo           TipoComprobante
  year           Int
  month          Int
  ultimoNumero   Int      @default(0)

  updatedAt      DateTime @updatedAt

  @@id([organizationId, tipo, year, month])
  @@map("secuencias_comprobante")
}
```

Una fila por `(tenant, tipo, YYYY, MM)`. Se crea con `ON CONFLICT DO UPDATE`
la primera vez que se contabiliza en ese bucket. El `UPDATE` incrementa
`ultimoNumero` bajo lock de fila (Postgres por default) — lo que da atomicidad
suficiente **siempre que el statement sea un único `UPDATE … RETURNING` o el
`INSERT … ON CONFLICT DO UPDATE`**. Ver §10.3 para el snippet.

### 4.5 ComprobanteAuditoria

```prisma
model ComprobanteAuditoria {
  id                   String   @id @default(uuid())
  organizationId       String
  comprobanteId        String
  userId               String
  accion               String   // CREADO | EDITADO | CONTABILIZADO | ANULADO |
                                // CREADO_POR_REVERSION | EDIT_EN_REAPERTURA
  diff                 Json     // { antes, despues, campos: [...] } libre
  fueDuranteReapertura Boolean  @default(false)
  reaperturaId         String?  // FK a PeriodoFiscalReopening cuando aplique
  timestamp            DateTime @default(now())  // timestamptz UTC

  comprobante  Comprobante              @relation(fields: [comprobanteId], references: [id], onDelete: Cascade)
  reapertura   PeriodoFiscalReopening?  @relation(fields: [reaperturaId],  references: [id])

  @@index([organizationId, comprobanteId, timestamp])
  @@index([organizationId, userId, timestamp])
  @@map("comprobantes_auditoria")
}
```

> Convive con el `AuditLog` genérico del starter (usado para impersonation,
> cambios de rol, etc.). Tabla separada porque el volumen y las queries de
> negocio son específicas (drill-down por comprobante, filtros por reapertura).

---

## 5. Invariantes críticos (aterrizados a cada operación)

Los 9 invariantes del core §4 se enforzan así:

### 5.1 Partida doble (§4.1 core)

Al contabilizar:
- `SUM(debitoBob) === SUM(creditoBob)` con tolerancia `±Bs 0.01`.
- Cada línea: `debito >= 0 && credito >= 0 && (debito > 0) XOR (credito > 0)`.
- `comprobante.lineas.length >= 2`.
- `SUM(debitoBob) > 0` (no se contabiliza un asiento de Bs 0).
- `glosa` no vacía tras `trim()`.
- Cada línea: `cuenta.activa === true && cuenta.esDetalle === true`.
- Coherencia: para cada línea, `|debitoBob - debito × tipoCambio| <= 0.01` y
  análogo para crédito.

### 5.2 Multi-tenancy (§4.2 core)

- Guard + servicio + repositorio filtran por `tenantId` desde `JWT.activeTenantId`.
- `LineaComprobante.organizationId` denormalizado para auditorías y reportes
  sin JOIN al comprobante.
- Queries del módulo **nunca** aceptan `where` sin `organizationId`.

### 5.3 Inmutabilidad post-CONTABILIZADO (§4.3 core)

- `numero`, `tipo`, `fechaContable`, `periodoFiscalId` → inmutables una vez
  asignado el número.
- Corrección = anular + re-crear. El endpoint `PATCH` rechaza cambios a estos
  campos con `COMPROBANTE_CAMPOS_INMUTABLES`.
- Transiciones prohibidas: `BLOQUEADO → CONTABILIZADO` (solo vía reapertura),
  `ANULADO → *`, `CONTABILIZADO → BORRADOR`.

### 5.4 Period lock (§4.4 core)

- Al crear/editar: `periodoFiscal.status === ABIERTO`. Validado dentro de la
  misma TX del write (Anti-12), con `findFirst` sobre el período
  (no hace falta `FOR UPDATE` porque el estado del período solo cambia desde
  `periodos-fiscales` con su propia TX, y ambas pelean por el mismo row-lock
  si chocan).
- Al anular: la **fecha de la reversión** (hoy) define el período, y ese
  período debe estar ABIERTO.

### 5.5 Decimal, nunca Float (§4.5 core)

- Prisma `@db.Decimal` en todos los campos monetarios (tabla §4.2 de
  `dominio-contable.md`).
- DTOs cruzan como `string`; value objects `Money` internos.
- ESLint prohíbe `number` en props con nombre `*monto|*amount|*total|*debito|*credito|*iva|*tipoCambio`.

### 5.6 FechaContable ≠ timestamp (§4.6 core)

- `fechaContable` es `@db.Date`. Parsed a value object `FechaContable`.
- `anuladoEn`, `createdAt`, `updatedAt`, `ComprobanteAuditoria.timestamp` son
  `timestamptz` UTC.
- `new Date()` **prohibido** en el servicio y dominio del módulo. Solo
  `ClockPort.hoyEnLaPaz()` y `ClockPort.nowUtc()` (Anti-20).

### 5.7 No soft-delete (§4.7 core)

- No hay `deletedAt` en `Comprobante` ni `LineaComprobante`.
- `DELETE /api/comprobantes/:id` borra físicamente **solo borradores**. Un
  CONTABILIZADO se anula (genera reversión). Un BLOQUEADO ni se borra ni se
  anula directo — primero se reabre el período.

### 5.8 Unicidad (§4.8 core)

- UNIQUE DB + guard en servicio para `(tenant, tipo, numero)` y para
  `(tenant, origenTipo, origenId)`.
- Las auto-entries futuras (Fase 1.5) usan `upsert`, nunca `create` ciego.

### 5.9 Correlativos atómicos (§4.9 core)

- `SecuenciaComprobante` con upsert atómico + `RETURNING`.
- Formato `{prefijo}{YY}{MM}-{correlativo:6}`. `YY` = últimos 2 dígitos de
  `year`, `MM` = mes calendario con padding. Correlativo reinicia cada mes.
- **Prohibido** `SELECT MAX(numero) + 1` o variantes (Anti-24,
  VOUCHER_NUMBER_CONTENTION).

---

## 6. Endpoints y permisos RBAC

### 6.1 Permisos nuevos al catálogo

```typescript
// common/permisos/catalogo-permisos.ts
export const CATALOGO_PERMISOS = {
  contabilidad: {
    // ... existentes ...
    comprobantes: [
      'read',
      'create',
      'editar_borrador',       // PATCH y DELETE sobre BORRADOR
      'contabilizar',          // POST /contabilizar
      'anular',                // POST /anular
      'editar_reapertura',     // PATCH sobre CONTABILIZADO en ventana de reapertura
    ],
  },
};
```

### 6.2 Endpoints

| Método | Path | Permiso | Propósito |
|---|---|---|---|
| `POST` | `/api/comprobantes` | `comprobantes.create` | Crear borrador |
| `GET`  | `/api/comprobantes` | `comprobantes.read` | Listar con filtros + paginación |
| `GET`  | `/api/comprobantes/:id` | `comprobantes.read` | Detalle + líneas + anulación info |
| `PATCH` | `/api/comprobantes/:id` | `editar_borrador` / `editar_reapertura` | Editar borrador o CONTABILIZADO en reapertura |
| `DELETE` | `/api/comprobantes/:id` | `editar_borrador` | Borrar BORRADOR (físico) |
| `POST` | `/api/comprobantes/:id/contabilizar` | `contabilizar` | BORRADOR → CONTABILIZADO con numeración |
| `POST` | `/api/comprobantes/:id/anular` | `anular` | CONTABILIZADO → ANULADO + reversión AJUSTE |
| `GET`  | `/api/comprobantes/:id/auditoria` | `comprobantes.read` | Historial de cambios |

### 6.3 Filtros y paginación del listado

`GET /api/comprobantes?periodoFiscalId=...&tipo=DIARIO&estado=CONTABILIZADO&fechaDesde=2026-04-01&fechaHasta=2026-04-30&q=...&page=1&limit=50`

- `q` busca en `numero`, `glosa`, `origenTipo`.
- `limit` con default 50, máximo 200 (Anti-28: paginación siempre obligatoria).
- Ordena por `fechaContable DESC, numero DESC NULLS FIRST` para ver los más
  recientes arriba y los borradores mezclados por fecha.

### 6.4 Distribución sugerida por rol

| Rol | Permisos de comprobantes |
|---|---|
| OWNER | `read`, `create`, `editar_borrador`, `contabilizar`, `anular`, `editar_reapertura` |
| ADMIN | Todos excepto `editar_reapertura` |
| CONTADOR SENIOR | `read`, `create`, `editar_borrador`, `contabilizar`, `anular` |
| CONTADOR JUNIOR | `read`, `create`, `editar_borrador` (no contabiliza; otro revisa) |
| AUDITOR EXTERNO | `read` solamente |

---

## 7. Códigos de error

Todos mapeados vía `DomainError → GlobalExceptionFilter` (§6 errores-y-logs.md).

### 7.1 Validación de estructura (422)

| Código | Cuándo |
|---|---|
| `COMPROBANTE_SIN_LINEAS` | `lineas.length < 2` al contabilizar |
| `COMPROBANTE_DESBALANCEADO` | `abs(totalDebitoBob - totalCreditoBob) > 0.01` al contabilizar |
| `COMPROBANTE_MONTO_CERO` | `totalDebitoBob === 0` al contabilizar |
| `GLOSA_REQUERIDA` | Glosa vacía al contabilizar |
| `LINEA_SIN_MONTO` | `debito === 0 && credito === 0` al contabilizar |
| `LINEA_AMBIGUA_DEBITO_CREDITO` | Ambos > 0 en la misma línea |
| `MONTO_BOB_INCOHERENTE` | `|debitoBob - debito × tipoCambio| > 0.01` |
| `TIPO_CAMBIO_INVALIDO` | `tipoCambio <= 0` o `moneda = BOB` con `tipoCambio ≠ 1` |
| `FECHA_FUTURA_NO_PERMITIDA` | `fechaContable > hoy La Paz` |

### 7.2 Validación contra plan de cuentas / configuración (422)

| Código | Cuándo |
|---|---|
| `CUENTA_NO_DETALLE` | `cuenta.esDetalle === false` |
| `CUENTA_INACTIVA` | `cuenta.activa === false` |
| `CUENTA_TENANT_AJENO` | `cuenta.organizationId !== tenantId` |
| `CONTACTO_REQUERIDO` | `cuenta.requiereContacto && !contactoId` |
| `MONEDA_INCOMPATIBLE_CUENTA` | `linea.moneda !== cuenta.monedaFuncional && !cuenta.permiteMultiMoneda` |

### 7.3 Estado / transición (409)

| Código | Cuándo |
|---|---|
| `COMPROBANTE_NO_ENCONTRADO` | ID inválido o de otro tenant (404) |
| `COMPROBANTE_ESTADO_INVALIDO` | Operación no aplicable al estado actual |
| `COMPROBANTE_BLOQUEADO` | Intento de editar/anular un BLOQUEADO |
| `COMPROBANTE_YA_ANULADO` | Intento de anular un ya ANULADO |
| `COMPROBANTE_CAMPOS_INMUTABLES` | PATCH sobre `numero`, `tipo`, `fechaContable`, `periodoFiscalId` |

### 7.4 Integración con períodos (409 / 422)

| Código | Cuándo |
|---|---|
| `PERIODO_NO_ABIERTO` | `fechaContable` cae en período CERRADO |
| `GESTION_NO_ABIERTA` | No existe gestión/período para la fecha |

### 7.5 Anulación (400 / 409)

| Código | Cuándo |
|---|---|
| `MOTIVO_ANULACION_REQUERIDO` | Motivo vacío o < 10 caracteres |
| `PERIODO_REVERSION_NO_ABIERTO` | Hoy cae en período CERRADO (caso borde) |

### 7.6 Autorización (403)

Reusa los del core `@RequirePermissions`. El servicio no vuelve a chequear
permisos; solo enforza reglas de dominio.

---

## 8. Consideraciones de implementación

### 8.1 Atomicidad

Toda operación de estado (`contabilizar`, `anular`, bloqueo por cierre de
período) ocurre en una única TX con `this.prisma.$transaction(...)`. Dentro:
lock pesimista sobre el comprobante, validaciones, mutaciones, auditoría.

### 8.2 Concurrencia de numeración

El patrón atómico es **un solo statement** `INSERT ... ON CONFLICT DO UPDATE ...
RETURNING ultimo_numero`. Postgres bloquea la fila del conflicto y serializa
writers sin necesidad de `SELECT FOR UPDATE` explícito. Dos contabilizaciones
concurrentes del mismo bucket se serializan; la segunda ve el valor incrementado.

**Nunca** hacer `SELECT ... FOR UPDATE` + `UPDATE` en dos statements: abre
ventana de fallo (Anti-24, VOUCHER_NUMBER_CONTENTION). Siempre el upsert
atómico.

### 8.3 Validación de cuentas en batch

Evitar N+1: cargar todas las cuentas referenciadas en las líneas con un solo
`findMany({ where: { id: { in: [...] } } })` y validar en memoria. Lo mismo
para contactos cuando el módulo exista.

### 8.4 Reversión en ANULAR

La reversión invierte débitos/créditos **también en BOB**. Mantener los mismos
`tipoCambio` y `moneda` del original es correcto: la anulación es un hecho
contable **con la misma tasa original**, no con la del día de la anulación.
Esto preserva la simetría contable (suma original + suma reversión = 0 en
cada cuenta).

Campos específicos de la reversión:
- `numero`: nuevo, de tipo AJUSTE, secuencia del mes de la anulación.
- `fechaContable`: hoy La Paz.
- `glosa`: `"Reversión de {numeroOriginal}: {motivo}"` (prefijo consistente
  para filtrar/auditar).
- `createdByUserId`: usuario que disparó la anulación.
- `anulaAId`: FK al original.
- Estado **directo a CONTABILIZADO** (no pasa por BORRADOR).

### 8.5 PrismaComprobantesLockAdapter

Reemplaza el `NoopComprobantesLockAdapter` en el binding del módulo
`periodos-fiscales`. El contrato (`ComprobantesLockPort`) no cambia.

Implementaciones:
- `bloquearPorPeriodo(tx, periodoId)`: `updateMany` filtrando por tenantId
  implícito (el port recibe la tx; el periodoId ya está scopeado porque
  `PeriodoFiscal` tiene `organizationId`).
- `desbloquearPorPeriodo`: análogo, `BLOQUEADO → CONTABILIZADO`.
- `contarBorradoresEnPeriodo`: `count({ where: { periodoFiscalId, estado: BORRADOR } })`.
- `obtenerResumenEnPeriodo`: agrega contadores + sumas con `groupBy` +
  `aggregate` sobre `Comprobante` y `LineaComprobante`.

### 8.6 Auditoría y diff

El `diff` en `ComprobanteAuditoria` se guarda como JSON libre. Propuesta de shape:

```json
{
  "campos": ["glosa", "lineas"],
  "antes": { "glosa": "Venta X", "lineasCount": 3, "totalBob": "500.00" },
  "despues": { "glosa": "Venta X (corregida)", "lineasCount": 4, "totalBob": "620.00" }
}
```

En 1.3 el diff es resumen (counts + totales), no el array completo de líneas
(rápidamente infla). Si auditoría demanda diff fino, se agrega columna
`lineasSnapshot` en Fase 1.4.

### 8.7 Eventos para efectos colaterales

Al contabilizar y al anular se emite `EventEmitter2`:
- `comprobante.contabilizado` con `{ comprobanteId, tenantId, tipo, periodoId, totales }`
- `comprobante.anulado` con `{ comprobanteId, reversionId, tenantId }`

Consumidores **en Fase 1.3**: ninguno obligatorio. El evento se emite de todas
formas para que Fase 1.4 (Libro Mayor, AccountBalance si se introduce) no
tenga que tocar el servicio de comprobantes. Los eventos NO participan de la
TX del write (dispatch después del commit, §3.7 core).

---

## 9. Tests obligatorios (pirámide honeycomb)

### 9.1 Integración (Postgres real vía Testcontainers) — 60%

| Caso | Invariante |
|---|---|
| Crear borrador con 1 línea → OK | Borrador tolera desbalance |
| Crear borrador con `fechaContable` en período CERRADO → `PERIODO_NO_ABIERTO` | §4.4 core |
| Crear borrador en fecha sin gestión → `GESTION_NO_ABIERTA` | §4.4 core |
| Contabilizar con débitos ≠ créditos → `COMPROBANTE_DESBALANCEADO` | §4.1 core |
| Contabilizar con tolerancia ±0.01 → OK | Tolerancia de redondeo |
| Contabilizar con 1 línea → `COMPROBANTE_SIN_LINEAS` | §4.1 core |
| Contabilizar con glosa vacía → `GLOSA_REQUERIDA` | §4.1 core |
| Contabilizar con cuenta `esDetalle=false` → `CUENTA_NO_DETALLE` | §4.1 core |
| Contabilizar con cuenta `activa=false` → `CUENTA_INACTIVA` | §4.1 core |
| Contabilizar con línea sin contacto en cuenta que lo requiere → `CONTACTO_REQUERIDO` | Cuenta.requiereContacto |
| Contabilizar dos veces en paralelo el mismo mes → números 1 y 2 **sin colisión** | Atomicidad correlativo |
| Contabilizar 100 concurrentes en mismo mes → correlativos 1..100 sin saltos ni duplicados | Anti-24 |
| Contabilizar con monto BOB que no cuadra `monto × tipoCambio` → `MONTO_BOB_INCOHERENTE` | §4.5 core |
| Anular CONTABILIZADO → original ANULADO + reversión AJUSTE contabilizada | Flujo reversión |
| Reversión tiene débitos/créditos invertidos en BOB | Simetría contable |
| Reversión usa `fechaContable = hoy La Paz` y período abierto correspondiente | §8.4 |
| Anular BLOQUEADO → `COMPROBANTE_BLOQUEADO` | §4.3 core |
| Anular ya ANULADO → `COMPROBANTE_YA_ANULADO` | Idempotencia |
| Cerrar período → CONTABILIZADO pasa a BLOQUEADO via `PrismaComprobantesLockAdapter` | Port integration |
| Reabrir período → BLOQUEADO vuelve a CONTABILIZADO | Port integration |
| Editar CONTABILIZADO fuera de reapertura → `COMPROBANTE_ESTADO_INVALIDO` | §4.3 core |
| Editar CONTABILIZADO durante reapertura → OK + auditoría con `fueDuranteReapertura=true` | §3.7 |
| PATCH intentando cambiar `numero` → `COMPROBANTE_CAMPOS_INMUTABLES` | §4.3 core |
| DELETE sobre CONTABILIZADO → rechaza | §4.7 core |
| DELETE sobre BORRADOR → OK + desaparece | §4.7 core |
| Query de otro tenant → 404 `COMPROBANTE_NO_ENCONTRADO` | §4.2 core |

### 9.2 Unit — 25%

- Validador: partida doble, líneas, glosa, coherencia BOB, XOR débito/crédito.
- Generador de número: prefijo por tipo, `YY`, `MM`, padding del correlativo.
- Builder de reversión: invierte débitos/créditos de N líneas correctamente.
- `ClockPort` fake: tests deterministas (Anti-39: mock via puerto, nunca
  `Date.now = ...`).
- DTO validators: formatos, rangos.

### 9.3 E2E — 10%

- Happy path completo: login → crear borrador → editar → contabilizar → ver en
  listado → anular → ver reversión.
- Escenario de concurrencia light: dos sesiones contabilizan simultáneamente
  distintos comprobantes en el mismo bucket; ambos quedan con número válido.

### 9.4 Contract — 5%

- El adapter Prisma del `ComprobantesLockPort` cumple el contrato del port
  (mismo shape que espera `periodos-fiscales`).

### 9.5 Cobertura objetivo

- Dominio (`domain/`, validadores, generador de número, builder de reversión): **95%**.
- Servicio + adapter: **≥ 80%** (global del módulo).

---

## 10. Snippets de implementación clave

### 10.1 `contabilizar(id, userId, tenantId)`

```typescript
async contabilizar(
  id: string,
  userId: string,
  tenantId: string,
): Promise<Comprobante> {
  return this.prisma.$transaction(async (tx) => {
    const comp = await tx.comprobante.findFirstOrThrow({
      where: { id, organizationId: tenantId },
      include: { lineas: true, periodoFiscal: true },
    });

    if (comp.estado !== EstadoComprobante.BORRADOR) {
      throw new ComprobanteEstadoInvalidoError(id, comp.estado);
    }
    if (comp.periodoFiscal.status !== PeriodoFiscalStatus.ABIERTO) {
      throw new PeriodoNoAbiertoError(comp.periodoFiscalId);
    }

    // Código Tributario art. 47: partida doble obligatoria.
    this.validator.validarParaContabilizar(comp.lineas, comp.glosa, tx);

    const fecha = FechaContable.fromDbDate(comp.fechaContable);
    const numero = await this.asignarNumero(tx, {
      tenantId,
      tipo: comp.tipo,
      year:  fecha.year,
      month: fecha.month,
    });

    const totales = this.validator.calcularTotalesBob(comp.lineas);

    const actualizado = await tx.comprobante.update({
      where: { id },
      data: {
        numero,
        estado:          EstadoComprobante.CONTABILIZADO,
        totalDebitoBob:  totales.debito.toFixed(2),
        totalCreditoBob: totales.credito.toFixed(2),
      },
    });

    await this.auditoria.registrar(tx, {
      comprobanteId: id,
      userId,
      accion: 'CONTABILIZADO',
      diff:   { numero, totales: { debito: totales.debito.toFixed(2), credito: totales.credito.toFixed(2) } },
    });

    // Evento post-commit (el EventEmitter2 dispatch lo hacemos fuera del $transaction,
    // tras `return` — este servicio publica por un EventsPort inyectado.)
    this.events.enqueue({ type: 'comprobante.contabilizado', payload: { comprobanteId: id, tenantId, tipo: comp.tipo } });

    return actualizado;
  });
}
```

### 10.2 `anular(id, userId, motivo, tenantId)`

```typescript
async anular(
  id: string,
  userId: string,
  motivo: string,
  tenantId: string,
): Promise<{ original: Comprobante; reversion: Comprobante }> {
  if (motivo.trim().length < 10) {
    throw new MotivoAnulacionRequeridoError();
  }

  return this.prisma.$transaction(async (tx) => {
    const original = await tx.comprobante.findFirstOrThrow({
      where: { id, organizationId: tenantId },
      include: { lineas: { orderBy: { orden: 'asc' } } },
    });

    if (original.estado === EstadoComprobante.BLOQUEADO) {
      throw new ComprobanteBloqueadoError(id);
    }
    if (original.estado !== EstadoComprobante.CONTABILIZADO) {
      throw new ComprobanteEstadoInvalidoError(id, original.estado);
    }
    if (original.estado === EstadoComprobante.ANULADO) {
      throw new ComprobanteYaAnuladoError(id);
    }

    const hoy = this.clock.hoyEnLaPaz();
    const periodoReversion = await this.periodos.obtenerAbiertoPorFecha(tx, tenantId, hoy);
    if (!periodoReversion) {
      throw new PeriodoReversionNoAbiertoError(hoy.toString());
    }

    const numeroReversion = await this.asignarNumero(tx, {
      tenantId,
      tipo:  TipoComprobante.AJUSTE,
      year:  hoy.year,
      month: hoy.month,
    });

    const lineasInvertidas = original.lineas.map((l) => ({
      organizationId: tenantId,
      orden:      l.orden,
      cuentaId:   l.cuentaId,
      contactoId: l.contactoId,
      moneda:     l.moneda,
      debito:     l.credito,
      credito:    l.debito,
      tipoCambio: l.tipoCambio,
      debitoBob:  l.creditoBob,
      creditoBob: l.debitoBob,
      glosaLinea: l.glosaLinea,
    }));

    const reversion = await tx.comprobante.create({
      data: {
        organizationId:  tenantId,
        tipo:            TipoComprobante.AJUSTE,
        numero:          numeroReversion,
        estado:          EstadoComprobante.CONTABILIZADO,
        fechaContable:   hoy.toDbDate(),
        periodoFiscalId: periodoReversion.id,
        glosa:           `Reversión de ${original.numero}: ${motivo}`,
        monedaPrincipal: original.monedaPrincipal,
        totalDebitoBob:  original.totalCreditoBob,
        totalCreditoBob: original.totalDebitoBob,
        createdByUserId: userId,
        anulaAId:        original.id,
        lineas:          { create: lineasInvertidas },
      },
    });

    // anuladoPorId NO existe: la back-ref `original.reversion` resuelve a
    // la reversión gracias a @unique([anulaAId]) en el lado AJUSTE.
    const originalAnulado = await tx.comprobante.update({
      where: { id: original.id },
      data: {
        estado:           EstadoComprobante.ANULADO,
        anuladoEn:        this.clock.nowUtc(),
        anuladoPorUserId: userId,
        motivoAnulacion:  motivo,
      },
    });

    await this.auditoria.registrar(tx, {
      comprobanteId: original.id, userId, accion: 'ANULADO',
      diff: { motivo, reversionId: reversion.id, reversionNumero: numeroReversion },
    });
    await this.auditoria.registrar(tx, {
      comprobanteId: reversion.id, userId, accion: 'CREADO_POR_REVERSION',
      diff: { anulaAId: original.id, anulaANumero: original.numero },
    });

    return { original: originalAnulado, reversion };
  });
}
```

### 10.3 `asignarNumero(tx, ...)` — upsert atómico con `RETURNING`

```typescript
private async asignarNumero(
  tx: Prisma.TransactionClient,
  { tenantId, tipo, year, month }: { tenantId: string; tipo: TipoComprobante; year: number; month: number },
): Promise<string> {
  // Anti-24: PROHIBIDO `SELECT MAX(numero) + 1`. Este statement único hace
  // el lock de fila implícito y serializa writers concurrentes.
  const rows = await tx.$queryRaw<{ ultimoNumero: number }[]>`
    INSERT INTO secuencias_comprobante (organization_id, tipo, year, month, ultimo_numero, updated_at)
    VALUES (${tenantId}::uuid, ${tipo}::"TipoComprobante", ${year}, ${month}, 1, now())
    ON CONFLICT (organization_id, tipo, year, month)
    DO UPDATE SET ultimo_numero = secuencias_comprobante.ultimo_numero + 1,
                  updated_at    = now()
    RETURNING ultimo_numero AS "ultimoNumero"
  `;

  if (rows.length !== 1 || rows[0] === undefined) {
    throw new Error('SecuenciaComprobante: upsert no devolvió fila (invariante rota)');
  }

  const prefijo      = PREFIJO_POR_TIPO[tipo];              // A, D, I, E, J, T, C
  const yy           = String(year).padStart(4, '0').slice(-2);
  const mm           = String(month).padStart(2, '0');
  const correlativo  = String(rows[0].ultimoNumero).padStart(6, '0');
  return `${prefijo}${yy}${mm}-${correlativo}`;             // ej: I2604-000042
}

const PREFIJO_POR_TIPO: Record<TipoComprobante, string> = {
  APERTURA: 'A',
  DIARIO:   'D',
  INGRESO:  'I',
  EGRESO:   'E',
  AJUSTE:   'J',
  TRASPASO: 'T',
  CIERRE:   'C',
};
```

### 10.4 `PrismaComprobantesLockAdapter`

```typescript
@Injectable()
export class PrismaComprobantesLockAdapter extends ComprobantesLockPort {
  async bloquearPorPeriodo(tx: Prisma.TransactionClient, periodoId: string): Promise<number> {
    const res = await tx.comprobante.updateMany({
      where: { periodoFiscalId: periodoId, estado: EstadoComprobante.CONTABILIZADO },
      data:  { estado: EstadoComprobante.BLOQUEADO },
    });
    return res.count;
  }

  async desbloquearPorPeriodo(tx: Prisma.TransactionClient, periodoId: string): Promise<number> {
    const res = await tx.comprobante.updateMany({
      where: { periodoFiscalId: periodoId, estado: EstadoComprobante.BLOQUEADO },
      data:  { estado: EstadoComprobante.CONTABILIZADO },
    });
    return res.count;
  }

  async contarBorradoresEnPeriodo(tx: Prisma.TransactionClient, periodoId: string): Promise<number> {
    return tx.comprobante.count({
      where: { periodoFiscalId: periodoId, estado: EstadoComprobante.BORRADOR },
    });
  }

  async obtenerResumenEnPeriodo(tx: Prisma.TransactionClient, periodoId: string): Promise<ResumenPeriodo> {
    const [contadores, totales, borradoresList] = await Promise.all([
      tx.comprobante.groupBy({
        by: ['estado'],
        where:   { periodoFiscalId: periodoId },
        _count:  { _all: true },
      }),
      tx.comprobante.aggregate({
        where:   { periodoFiscalId: periodoId, estado: EstadoComprobante.CONTABILIZADO },
        _sum:    { totalDebitoBob: true, totalCreditoBob: true },
      }),
      tx.comprobante.findMany({
        where:    { periodoFiscalId: periodoId, estado: EstadoComprobante.BORRADOR },
        select:   { id: true, fechaContable: true, glosa: true, totalDebitoBob: true },
        orderBy:  { fechaContable: 'asc' },
        take:     50,
      }),
    ]);

    const count = (est: EstadoComprobante) =>
      contadores.find((c) => c.estado === est)?._count._all ?? 0;

    return {
      contabilizados: count(EstadoComprobante.CONTABILIZADO),
      borradores:     count(EstadoComprobante.BORRADOR),
      anulados:       count(EstadoComprobante.ANULADO),
      totalDebeBob:   (totales._sum.totalDebitoBob  ?? new Decimal(0)).toFixed(2),
      totalHaberBob:  (totales._sum.totalCreditoBob ?? new Decimal(0)).toFixed(2),
      borradoresList: borradoresList.map((b) => ({
        id:            b.id,
        fechaContable: FechaContable.fromDbDate(b.fechaContable).toString(),
        glosa:         b.glosa,
        totalBob:      b.totalDebitoBob.toFixed(2),
      })),
    };
  }
}
```

---

## 11. Integración con otros módulos (puertos)

### 11.1 Puertos consumidos

| Port | Dueño | Uso en comprobantes | Fallback / noop |
|---|---|---|---|
| `PeriodosReaderPort` | `periodos-fiscales` (nuevo, expone para 1.3) | Resolver `periodoFiscalId` desde `fechaContable`, validar `status === ABIERTO`, obtener período abierto por fecha en la anulación | N/A — dependencia hard |
| `CuentasReaderPort` | `cuentas` (nuevo, expone para 1.3) | Validar batch de cuentas: existencia, `activa`, `esDetalle`, `requiereContacto`, `permiteMultiMoneda`, `monedaFuncional` | N/A |
| `ClockPort` | `common/clock` (ya existe) | `hoyEnLaPaz()` para la fecha de la reversión, `nowUtc()` para timestamps | `FakeClockAdapter` en tests |
| `ConfiguracionContableReaderPort` | `configuracion-contable` (ya existe) | **No se usa en 1.3**. Reservado para Fase 1.5 (auto-entries IVA/dif. cambio). Mencionado acá para contrato estable. | — |

**Shape mínimo de los puertos nuevos:**

```typescript
// periodos-fiscales/ports/periodos-reader.port.ts
export abstract class PeriodosReaderPort {
  /**
   * Obtiene el período fiscal que contiene la fecha dada, solo si está ABIERTO.
   * Devuelve null si no existe gestión o el período está CERRADO.
   */
  abstract obtenerAbiertoPorFecha(
    tx: Prisma.TransactionClient,
    organizationId: string,
    fecha: FechaContable,
  ): Promise<{ id: string; status: PeriodoFiscalStatus } | null>;
}

// cuentas/ports/cuentas-reader.port.ts
export abstract class CuentasReaderPort {
  abstract obtenerBatch(
    tx: Prisma.TransactionClient,
    organizationId: string,
    cuentaIds: string[],
  ): Promise<Map<string, CuentaLite>>;
}

export interface CuentaLite {
  id: string;
  codigoInterno: string;
  activa: boolean;
  esDetalle: boolean;
  requiereContacto: boolean;
  permiteMultiMoneda: boolean;
  monedaFuncional: Moneda;
}
```

### 11.2 Puerto expuesto

| Port | Consumidor | Uso |
|---|---|---|
| `ComprobantesLockPort` | `periodos-fiscales` | Cierre/reapertura atómicos (ya definido en Fase 1.2) |

En Fase 1.3 el binding de ese port cambia en `PeriodosFiscalesModule`:
`NoopComprobantesLockAdapter` → `PrismaComprobantesLockAdapter`. El resto del
módulo `periodos-fiscales` no se toca — contrato idéntico. Las suites de tests
de `periodos-fiscales` que antes validaban con el Noop ahora validan con el
Prisma y corren bajo `beforeAll → ensurePuctSeeded + createTenantWithConfig`.

### 11.3 Eventos emitidos (dispatch post-commit)

| Evento | Payload | Quién lo consume |
|---|---|---|
| `comprobante.contabilizado` | `{ comprobanteId, tenantId, tipo, periodoFiscalId, totales }` | Nadie en 1.3. Reservado para Libro Mayor (Fase 1.4) y reportería. |
| `comprobante.anulado` | `{ comprobanteId, reversionId, tenantId }` | Nadie en 1.3. Ídem. |

---

## 12. Alcance Fase 1.3 vs diferido

### 12.1 Dentro de 1.3 — **CERRADO**

| Feature | Estado | Detalle |
|---|---|---|
| CRUD manual de comprobantes | ✅ | POST/GET/PATCH/DELETE + listado paginado con filtros (periodoFiscalId, tipo, estado, rango fechas, texto) |
| Numeración atómica | ✅ | `SecuenciaComprobante` + upsert `ON CONFLICT DO UPDATE RETURNING` (statement único). Integration test vs Postgres real valida 50 writers concurrentes → 1..50 sin gaps |
| Partida doble en BOB | ✅ | Validación en TX al contabilizar, tolerancia ±Bs 0.01 (Código Tributario art. 47) |
| Multi-moneda estructural | ✅ | `moneda`, `monto`, `tipoCambio`, `montoBob` persistidos siempre, también BOB con `tipoCambio=1`. Coherencia `monto × tipoCambio ≈ montoBob` validada |
| Anulación con reversión | ✅ | POST `/anular` crea AJUSTE con líneas invertidas, FK única `anulaAId`, back-ref `original.reversion`. Original queda ANULADO con metadata |
| Bloqueo por cierre de período | ✅ | `PrismaComprobantesLockAdapter` reemplaza `NoopComprobantesLockAdapter`; contrato del port idéntico. Integration test valida aislamiento por `periodoFiscalId` |
| Edición en reapertura | ⏸ Diferido | El esquema de auditoría tiene `fueDuranteReapertura` + `reaperturaId`; el permiso específico y la rama del service quedan para Fase 1.3.x si la UX lo demanda |
| Auditoría por comprobante | ✅ | Tabla `ComprobanteAuditoria` separada. Enum `AccionAuditoriaComprobante` cubre CREADO, EDITADO, CONTABILIZADO, ANULADO, CREADO_POR_REVERSION, EDIT_EN_REAPERTURA. Endpoint `GET /:id/auditoria` |
| Eventos post-commit | ⏸ Diferido | Sin consumidores reales en 1.3 y añadir el canal abre blast radius. Se activa en 1.4 (Libro Mayor) con el primer consumidor real |
| Tests integración + unit + E2E | ✅ | 297 unit/integration + 75 E2E. Cobertura dominio ≥ 95% (validator + FechaContable + numeracion) |

Commits de Fase 1.3 en `main`: `b9c23d3` (schema) · `50db79f` (domain/errors/validator) · `b9d3b36` (reader ports) · `adf2205` (service CRUD borrador) · `3bdcb5f` (contabilizar) · `2001d47` (anular) · `f625162` (lock adapter swap) · controller + E2E (este commit).

### 12.2 Fuera de 1.3

| Feature | Fase |
|---|---|
| Documentos físicos (`DocumentoFisico`, asociación con comprobante) | 1.4 (slice 2 — implementado, cabecera-cabecera vía `comprobante_documento_fisico`; ver `docs/disenos/documento-fisico.md`) |
| Contactos como tabla FK (`Contacto`) | 1.4 |
| Libro Mayor / Balance de Comprobación | 1.4 |
| ~~Libro de Compras IVA (LCV)~~ | ⊘ FUERA DE SCOPE — reemplazado por el RCV del SIN (SIAT), externo. Decisión 2026-05-21, ver `CLAUDE.md §10.9` |
| ~~Libro de Ventas IVA~~ | ⊘ FUERA DE SCOPE — ídem (RCV externo) |
| Cargador automático de Tipo de Cambio (BCB) | 1.5 |
| Cargador automático de UFV | 1.5 |
| Auto-entries de ventas/compras/pagos | 1.5 |
| Asientos automáticos de cierre de gestión (resultado ejercicio, distribución) | 1.5 |
| `AccountBalance` denormalizado (cache de saldos por período) | 1.4 (evaluar) |
| Split screen / stacking de comprobantes en UI | Frontend 1.4 |
| Importación masiva de comprobantes desde Excel | 1.6+ |

### 12.3 Campos que nacen en 1.3 pero se usan después

Estos campos se persisten en 1.3 aunque ningún código del módulo los escribe
con valor no nulo. La razón es evitar migraciones futuras que alteren tablas
con millones de filas.

| Campo | Tabla | Usado en |
|---|---|---|
| `origenTipo`, `origenId` | `comprobantes` | Auto-entries (Fase 1.5) |
| `contactoId` | `lineas_comprobante` | Contactos (Fase 1.4) |

> **Documentos físicos — NO es un campo forward-compat aquí.** La asociación
> comprobante ↔ documento físico (slice 2 de Fase 1.4) NO vive como columna en
> `lineas_comprobante` ni en `comprobantes`: es una relación **cabecera-cabecera**
> N:M materializada en la tabla `comprobante_documento_fisico` (proposal Decisión 8
> / design D1). No existe `LineaComprobante.documentoFisicoId`. El detalle del
> modelo, los invariantes (UNIQUE PARCIAL de un solo CONTABILIZADO por documento)
> y el flujo de asociar/contabilizar/anular están en
> `docs/disenos/documento-fisico.md`.

---

## 13. Resumen ejecutivo

| Aspecto | Decisión |
|---|---|
| Agregado | `Comprobante` (raíz) + `LineaComprobante` (detalle). Sinónimo "asiento" solo en glosario/UI. |
| Tipos de comprobante | 7: APERTURA, DIARIO, INGRESO, EGRESO, AJUSTE, TRASPASO, CIERRE. Enum hardcoded, no configurable per-tenant. |
| Prefijos | 1 letra: `A`, `D`, `I`, `E`, `J`, `T`, `C`. Ejemplo de número: `I2604-000042`. |
| Estados | 4: BORRADOR, CONTABILIZADO, BLOQUEADO, ANULADO. Transiciones según diagrama §3.1. |
| Numeración | `{prefijo}{YY}{MM}-{correlativo:6}` atómica via `SecuenciaComprobante` + upsert `RETURNING`. Reinicia mensual. |
| Partida doble | Validada en BOB con tolerancia ±Bs 0.01, dentro de la TX del contabilizar. |
| Multi-moneda | Estructural desde día 1: cada línea tiene `moneda`, `monto`, `tipoCambio`, `montoBob`. Cargador BCB es Fase 1.5. |
| Anulación | Crea comprobante AJUSTE de reversión (líneas invertidas). FK bidireccional. Estado `ANULADO` + `anuladoPorId`. Nunca solo cambio de estado. |
| Fecha de la reversión | `hoyEnLaPaz()` y período abierto correspondiente, no la fecha del original. |
| Bloqueo por cierre | `PrismaComprobantesLockAdapter` reemplaza el Noop de Fase 1.2. Mismo contrato `ComprobantesLockPort`. |
| Auditoría | Tabla `ComprobanteAuditoria` separada del `AuditLog` genérico. Diff resumen, flag `fueDuranteReapertura`. |
| Documentos físicos | Implementado en Fase 1.4 (slice 2): relación cabecera-cabecera N:M `comprobante_documento_fisico`, NO un campo en `LineaComprobante`. Ver `docs/disenos/documento-fisico.md`. |
| Auto-entries (ventas/compras/pagos) | Fuera de scope. Fase 1.5. Campos `origenTipo/origenId` presentes para evitar migración futura. |
| Libro Mayor | Fuera de scope de 1.3, **planificado para 1.4**. Eventos `comprobante.contabilizado`/`anulado` ya emitidos esperando este primer consumidor. |
| LCV/RCV (Libro/Registro de Compras y Ventas IVA) | ⊘ FUERA DE SCOPE — lo genera el SIN (SIAT/RCV). No se construye in-house (decisión 2026-05-21, `CLAUDE.md §10.9`). |

---

**Fin del documento.**
Cualquier ajuste de scope o invariante debe registrarse en PR. Si un cambio
contradice un invariante de `CLAUDE.md §4` o `docs/claude/dominio-contable.md`,
va al core primero (regla anti-drift §12 core).
