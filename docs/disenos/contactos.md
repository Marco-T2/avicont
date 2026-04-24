# Contactos — Fase 1.4 (submódulo)

> **Estado: EN DISEÑO** — este doc se congela al comenzar la implementación.
> Fuente de verdad para el submódulo `contactos`, primer slice de Fase 1.4.
>
> Presupone el core del `CLAUDE.md` (§1–§4, §9–§11) y `docs/claude/dominio-contable.md`.
> Si contradice algún invariante → va al core primero, acá después (regla anti-drift, §12 core).

Fase 1.4 completa cubre cuatro submódulos independientes. **Este doc cubre
solo Contactos**, que es el primero porque los demás dependen de él:

1. **Contactos** ← este doc
2. DocumentoFisico + TipoDocumentoFisico (talonarios)
3. Libro Mayor (read-side)
4. LCV (IVA — Libro de Compras / Libro de Ventas)

---

## 1. Conceptos y glosario

**Contacto** — Persona natural o jurídica con la que la asociación tiene
vínculo contable. Clientes (a quienes se vende) y proveedores (a quienes se
compra) se modelan en un único registro con flags, porque en el gremio
avicultor el mismo asociado suele ser ambos (vende huevos, compra
balanceado).

**Documento** — Identificador fiscal o personal de contacto. Texto libre
opcional (NIT, CI, CEX, pasaporte, "sin documento"). En este slice NO se
valida formato — se acepta tal cual lo escribe el contador. La única regla
es unicidad parcial por tenant (§5.1).

**Razón social** — Nombre con el que aparece el contacto en facturación.
Obligatorio. En persona jurídica es la razón social; en persona natural,
nombre + apellido.

**Nombre comercial** — Alias opcional. Ej: razón social "Sociedad Avícola
Santa Cruz S.A." con nombre comercial "Granjas El Sol".

**esCliente / esProveedor** — Flags booleanos. Al menos uno debe estar en
`true`. Ambos en `true` es válido y común. Ambos en `false` es inválido.

**Contacto activo** — `activo = true` por default. Un contacto inactivo no
puede referenciarse desde una línea de comprobante nueva; los comprobantes
ya contabilizados lo siguen referenciando sin romperse (FK con
`onDelete: Restrict`).

### 1.1 Forma del agregado

Simple, agregado de una sola entidad (no tiene hijos):

```
Contacto
├── id: uuid
├── organizationId: string (tenantId)
├── razonSocial: "Granjas El Sol SRL"
├── nombreComercial: "El Sol" (opcional)
├── documento: "1234567019" (opcional — NIT o CI, texto libre)
├── esCliente: true
├── esProveedor: true
├── email: "ventas@elsol.bo" (opcional)
├── telefono: "+591 3 1234567" (opcional)
├── direccion: "Av. Alemana 123, Santa Cruz" (opcional)
├── activo: true
└── timestamps auditoría (createdAt, updatedAt, createdByUserId)
```

---

## 2. Flujo operativo

### 2.1 Diagrama de estados

```
(creación) ──→ [ACTIVO] ⇄ [INACTIVO]
                   │           │
                   ▼           ▼
              (editable)  (editable, pero no
                           referenciable en
                           comprobantes nuevos)
```

No hay estado "ELIMINADO". Los contactos nunca se borran físicamente si
están referenciados por un comprobante (FK `Restrict`). Si no están
referenciados, se pueden eliminar — útil para limpiar errores de tipeo
recientes.

### 2.2 Crear contacto

Entrada: `razonSocial`, `documento?`, `nombreComercial?`, `esCliente`,
`esProveedor`, `email?`, `telefono?`, `direccion?`.

Validaciones (orden importa):
1. `razonSocial` no vacía (trim + longitud mínima 2).
2. `esCliente || esProveedor` — al menos uno en true.
3. Si `documento` viene, se trimea. Si queda vacío tras trim → `null`.
4. Si `documento !== null`, unicidad parcial `(organizationId, documento)`.
5. `email` formato válido si viene.

Salida: `Contacto` con `activo = true` y timestamps.

### 2.3 Editar contacto

Mismos campos que crear, todos opcionales (PATCH semantics). Si se cambia
`documento` a un valor ya usado por otro contacto del mismo tenant →
`ContactoDocumentoDuplicadoError` (409).

**No se permite desactivar ambos flags** — si `esCliente` y `esProveedor`
quedan en `false` tras el update, el update falla.

### 2.4 Desactivar / reactivar

Toggle explícito `activo`. No afecta a comprobantes ya contabilizados.
Intento de crear un comprobante nuevo referenciando un contacto inactivo
→ `ContactoInactivoError` (422) desde el service de comprobantes.

### 2.5 Eliminar

Solo permitido si NINGÚN `LineaComprobante` lo referencia. El FK con
`onDelete: Restrict` bloquea a nivel BD; el service hace un `count` previo
para devolver un error amigable `ContactoReferenciadoError` (409) en vez
de un error crudo de Postgres.

No hay soft-delete en este módulo. Los contactos no son parte del "libro"
contable (§4.7 core — no soft-delete en contabilidad), pero siguen la
misma lógica por consistencia: un contacto importante de hace 3 años no
debería desaparecer porque alguien apretó "eliminar".

---

## 3. Modelo de datos (Prisma)

### 3.1 Modelo `Contacto`

```prisma
model Contacto {
  id              String   @id @default(uuid())
  organizationId  String

  razonSocial     String
  nombreComercial String?
  // Texto libre, acepta NIT, CI, CEX, pasaporte, o cualquier otro
  // identificador. NO se valida formato en este slice — se acepta tal
  // cual lo escribe el contador. Deuda conocida: al implementar LCV
  // (Fase 1.4 slice 4) habrá que distinguir NIT formal vs CI para IVA.
  documento       String?

  esCliente       Boolean  @default(false)
  esProveedor     Boolean  @default(false)

  email           String?
  telefono        String?
  direccion       String?

  activo          Boolean  @default(true)

  createdAt       DateTime @default(now())
  createdByUserId String
  updatedAt       DateTime @updatedAt

  organization    Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  lineasComprobante LineaComprobante[]

  // Reglas que viven en migration raw SQL (Prisma no las declara):
  //   1. Unicidad parcial: (organizationId, documento) único cuando
  //      documento IS NOT NULL.
  //   2. CHECK ("esCliente" = true OR "esProveedor" = true) — al menos
  //      un flag activo (§5.3).
  //   3. Índices GIN trigram sobre razonSocial y nombreComercial para
  //      búsqueda ILIKE eficiente.
  @@index([organizationId])
  @@index([organizationId, activo])
  @@index([organizationId, esCliente])
  @@index([organizationId, esProveedor])
  @@map("Contacto")
}
```

Índices declarativos (Prisma):
- `(organizationId)` — multi-tenancy; toda query filtra por tenant.
- `(organizationId, activo)` — listado por default filtra activos.
- `(organizationId, esCliente)` / `(organizationId, esProveedor)` —
  soportan los listados "solo clientes" / "solo proveedores" que pedirá
  el listado de ventas/compras más adelante.

Índices adicionales en raw SQL (Prisma no soporta índices parciales ni GIN
con operator classes de forma declarativa):

**Índice parcial único — anti-duplicados por documento:**

```sql
CREATE UNIQUE INDEX "Contacto_organizationId_documento_partial_key"
  ON "Contacto" ("organizationId", "documento")
  WHERE "documento" IS NOT NULL;
```

Permite N contactos sin documento dentro del mismo tenant, pero rechaza
dos contactos con el mismo documento. Cicatriz F-01 (§4.8 core):
enforcement en BD **y** en service — nunca solo uno.

**Índices GIN trigram — búsqueda primaria por nombre:**

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Contacto_razonSocial_trgm_idx"
  ON "Contacto" USING GIN ("razonSocial" gin_trgm_ops);

CREATE INDEX "Contacto_nombreComercial_trgm_idx"
  ON "Contacto" USING GIN ("nombreComercial" gin_trgm_ops);
```

**Por qué GIN trigram y no B-tree simple**: el filtro `q` del listado
(§6.3) hace `ILIKE '%Marc%'` para encontrar "Marcos Pérez Olivera". Un
B-tree solo acelera `LIKE 'Marc%'` (prefijo), pero ILIKE con wildcard
inicial lo ignora — haría full scan. GIN trigram sí acelera ILIKE
parcial porque indexa trigramas de la cadena.

**Extensión pg_trgm**: creada idempotentemente en esta migración
(`IF NOT EXISTS`). Primera vez que el proyecto la usa. Documentar en el
runbook (§11 core) si se agregan más índices trigram en módulos futuros.

El documento sigue siendo buscable por igualdad exacta (filtro
`documento=XXX`) pero NO por ILIKE — porque la búsqueda real siempre
es por nombre. Si un contador busca por NIT, escribe el NIT completo.

### 3.2 Cambios en `LineaComprobante`

Conversión del campo `contactoId` de string libre a FK:

```prisma
model LineaComprobante {
  // ... resto igual ...
  contactoId      String?

  // ... relations existentes ...
  contacto        Contacto? @relation(fields: [contactoId], references: [id], onDelete: Restrict)

  @@index([organizationId, contactoId])  // nuevo — soporta LCV y listados por contacto
}
```

`onDelete: Restrict` bloquea eliminar un contacto referenciado. Nueva
relación en `Contacto.lineasComprobante` ya declarada arriba.

### 3.3 Cambios en `Organization`

Agregar la back-ref:

```prisma
model Organization {
  // ... resto ...
  contactos  Contacto[]
}
```

---

## 4. Migración

Una sola migración atómica `fase_1_4_contactos`. Pasos en orden:

```sql
-- 1. Crear tabla Contacto
CREATE TABLE "Contacto" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "razonSocial" TEXT NOT NULL,
  "nombreComercial" TEXT,
  "documento" TEXT,
  "esCliente" BOOLEAN NOT NULL DEFAULT false,
  "esProveedor" BOOLEAN NOT NULL DEFAULT false,
  "email" TEXT,
  "telefono" TEXT,
  "direccion" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- 2. CHECK constraint: al menos uno de los flags en true.
--    Defense in depth (§4.8 core) junto con la validación de service.
ALTER TABLE "Contacto"
  ADD CONSTRAINT "Contacto_es_cliente_o_proveedor_check"
  CHECK ("esCliente" = true OR "esProveedor" = true);

-- 3. Índices normales
CREATE INDEX "Contacto_organizationId_idx" ON "Contacto"("organizationId");
CREATE INDEX "Contacto_organizationId_activo_idx" ON "Contacto"("organizationId", "activo");
CREATE INDEX "Contacto_organizationId_esCliente_idx" ON "Contacto"("organizationId", "esCliente");
CREATE INDEX "Contacto_organizationId_esProveedor_idx" ON "Contacto"("organizationId", "esProveedor");

-- 4. Índice parcial único (documento)
CREATE UNIQUE INDEX "Contacto_organizationId_documento_partial_key"
  ON "Contacto"("organizationId", "documento")
  WHERE "documento" IS NOT NULL;

-- 5. Extensión e índices GIN trigram para búsqueda ILIKE por nombre
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Contacto_razonSocial_trgm_idx"
  ON "Contacto" USING GIN ("razonSocial" gin_trgm_ops);

CREATE INDEX "Contacto_nombreComercial_trgm_idx"
  ON "Contacto" USING GIN ("nombreComercial" gin_trgm_ops);

-- 6. Limpiar contactoId existente (migración seca, no hay data real de prod)
UPDATE "LineaComprobante" SET "contactoId" = NULL;

-- 7. Convertir contactoId a FK
ALTER TABLE "LineaComprobante"
  ADD CONSTRAINT "LineaComprobante_contactoId_fkey"
  FOREIGN KEY ("contactoId") REFERENCES "Contacto"("id") ON DELETE RESTRICT;

-- 8. Índice de apoyo para queries cross-contacto
CREATE INDEX "LineaComprobante_organizationId_contactoId_idx"
  ON "LineaComprobante"("organizationId", "contactoId");
```

**Paso 4** es el paso "seco": limpia los strings libres que hayan quedado
en dev/test. Confirmado con el usuario que no hay data real hoy. La
migración NO incluye data migration inteligente (crear Contactos
placeholder) porque sería cargar ruido en prod — si hubiese datos reales
habría que diseñar una migración separada.

---

## 5. Invariantes críticos

### 5.1 Unicidad de documento (defense in depth)

- **BD**: índice parcial único `(organizationId, documento) WHERE documento IS NOT NULL`.
- **Service**: busca por `(organizationId, documento)` antes de crear/editar; si encuentra otro contacto, lanza `ContactoDocumentoDuplicadoError` (409).
- Cicatriz F-01 (§4.8 core): ambas capas son necesarias. La BD gana la
  race condition; el service devuelve mensaje amigable en el caso común.

### 5.2 Multi-tenancy (§4.2 core)

- Toda query filtra por `organizationId`.
- Defense in depth: tenant extraído de JWT + guard + service + repo.
- El `organizationId` NUNCA viene del payload del cliente — siempre del
  contexto de autenticación.

### 5.3 Al menos un flag (defense in depth)

- **BD**: CHECK constraint `"esCliente" = true OR "esProveedor" = true`. Ver §4 paso 2.
- **Service**: misma regla validada antes de llamar al repo; lanza `ContactoFlagsInvalidosError` (422) con mensaje amigable en vez de un error crudo de constraint violation.
- Cicatriz F-01 aplicada acá también (§4.8 core): enforcement en BD **y** en service, nunca solo uno. La BD es la red de seguridad frente a bugs de scripts/seeds/data-migrations que salten el service; el service devuelve el mensaje útil en el caso común.

### 5.4 FK Restrict, no Cascade

- Un contacto referenciado por un `LineaComprobante` **no se puede
  eliminar**. El FK lo bloquea a nivel BD; el service lo bloquea con
  mensaje amigable.
- Razón: la contabilidad es inmutable (§4.3, §4.7 core). Eliminar un
  contacto referenciado dejaría comprobantes huérfanos o con referencias
  dangling — inaceptable para un libro contable.

### 5.5 No soft-delete

- No hay `deletedAt` en `Contacto`.
- Toggle `activo` cumple la necesidad operativa (ocultar del picker
  principal) sin corromper el histórico.

---

## 6. Endpoints y permisos RBAC

### 6.1 Permisos nuevos al catálogo

Agregar a `backend/prisma/seed.ts` dentro de `CONTADOR_PERMISSIONS`:

```typescript
'contabilidad.contactos.read',
'contabilidad.contactos.create',
'contabilidad.contactos.update',
'contabilidad.contactos.delete',
```

Formato consistente con `contabilidad.asientos.*` y `contabilidad.plan-cuentas.*`.

### 6.2 Endpoints

Todos bajo `/api/contactos`, módulo `ContactosController`.

| Método | Path | Permiso | Descripción |
|--------|------|---------|-------------|
| `POST` | `/api/contactos` | `contabilidad.contactos.create` | Crea un contacto |
| `GET` | `/api/contactos` | `contabilidad.contactos.read` | Lista paginada con filtros |
| `GET` | `/api/contactos/:id` | `contabilidad.contactos.read` | Obtiene un contacto |
| `PATCH` | `/api/contactos/:id` | `contabilidad.contactos.update` | Edita un contacto |
| `POST` | `/api/contactos/:id/desactivar` | `contabilidad.contactos.update` | Marca inactivo |
| `POST` | `/api/contactos/:id/reactivar` | `contabilidad.contactos.update` | Marca activo |
| `DELETE` | `/api/contactos/:id` | `contabilidad.contactos.delete` | Elimina si no referenciado |

### 6.3 Filtros del listado

Query params:
- `q?` — búsqueda por `razonSocial` o `nombreComercial` (ILIKE parcial).
- `documento?` — búsqueda por documento exacto.
- `esCliente?`, `esProveedor?` — filtros bool.
- `activo?` — default `true` (solo activos); explícito `false` para inactivos; `all` para ambos.
- `page`, `pageSize` — paginación estándar (pageSize default 50, max 200).
- `orderBy?` — `razonSocial` (default) | `createdAt`.

Respuesta: `{ items: ContactoResponseDto[], total: number, page, pageSize }`.

---

## 7. Códigos de error

Todos extienden `DomainError` (§6.2 extendido en `docs/claude/errores-y-logs.md`).

### 7.1 Validación (422)

- `ContactoRazonSocialRequeridaError` — razonSocial vacía o < 2 chars.
- `ContactoFlagsInvalidosError` — ambos flags en false.
- `ContactoEmailInvalidoError` — email con formato inválido.

### 7.2 Unicidad (409)

- `ContactoDocumentoDuplicadoError` — documento ya usado por otro contacto del mismo tenant.
  - `details: { documento, contactoExistenteId }`

### 7.3 Estado / referencias (409)

- `ContactoReferenciadoError` — intento de eliminar un contacto con líneas de comprobante.
  - `details: { lineasCount }`

### 7.4 Not found (404)

- `ContactoNotFoundError` — id no existe o pertenece a otro tenant.

---

## 8. Integración con Comprobantes

### 8.1 Port owner-owned

El módulo `contactos` expone un port read-only para que `comprobantes`
valide el `contactoId`:

```typescript
// backend/src/contactos/ports/contactos-reader.port.ts
export const CONTACTOS_READER_PORT = Symbol('CONTACTOS_READER_PORT');

export abstract class ContactosReaderPort {
  abstract existe(organizationId: string, contactoId: string): Promise<boolean>;
  abstract estaActivo(organizationId: string, contactoId: string): Promise<boolean>;
}
```

Patrón coherente con `PeriodosReaderPort` y `CuentasReaderPort` de Fase 1.3.

### 8.2 Cambios en `comprobantes.service.ts`

Hoy (línea 293 aprox):

```typescript
if (cuenta.requiereContacto && !linea.contactoId) {
  throw new ContactoRequeridoError(...);
}
```

Se agrega validación adicional **cuando viene contactoId** (no solo cuando
la cuenta lo requiere):

```typescript
if (linea.contactoId) {
  const existe = await this.contactosReader.existe(orgId, linea.contactoId);
  if (!existe) throw new ContactoNotFoundError(linea.contactoId);

  // Solo al CONTABILIZAR validamos que esté activo. En BORRADOR
  // permitimos referenciar inactivos para no romper la edición de un
  // asiento cuyo contacto se desactivó mientras estaba en edición.
  if (estado === 'CONTABILIZADO') {
    const activo = await this.contactosReader.estaActivo(orgId, linea.contactoId);
    if (!activo) throw new ContactoInactivoError(linea.contactoId);
  }
}
```

Dos errores nuevos en `comprobantes/domain/errors/`:

- `ContactoReferenciadoNoExisteError` (422) — contactoId no existe.
- `ContactoInactivoError` (422) — contactoId existe pero está inactivo y
  se intenta contabilizar.

### 8.3 Módulo wiring

- `ContactosModule` expone `CONTACTOS_READER_PORT` en su `exports`.
- `ComprobantesModule` lo importa y lo inyecta en el service.

---

## 9. Testing

Pirámide del proyecto (§7.1 extendido): honeycomb 60/25/10/5. Para
Contactos específicamente:

### 9.1 Unit tests (`*.spec.ts`)

- `contactos.service.spec.ts` — mocks del port de repo.
  - Crea con datos válidos.
  - Rechaza razonSocial vacía.
  - Rechaza ambos flags en false.
  - Rechaza documento duplicado (friendly error antes de BD).
  - Edita conservando flags.
  - Desactiva / reactiva.
  - Eliminar bloqueado si lineasCount > 0.

### 9.2 Integration tests (`*.integration.spec.ts`)

Al lado del adapter que testean (§11.3 core).

- `prisma-contactos.repository.integration.spec.ts`:
  - Unicidad parcial: dos contactos sin documento en mismo tenant → OK.
  - Unicidad parcial: dos contactos con mismo documento en mismo tenant → falla con Postgres unique violation.
  - FK Restrict: eliminar contacto con lineaComprobante asociada → falla.
  - Multi-tenancy: listar de otro tenant devuelve vacío.

### 9.3 E2E (`test/contactos.e2e-spec.ts`)

- CRUD completo vía HTTP + JWT.
- 403 sin permiso `contabilidad.contactos.*`.
- Crear comprobante con `contactoId` inexistente → 422.
- Crear comprobante con contacto inactivo → 422 al contabilizar, 200 al borrador.

### 9.4 Cleanup

Actualizar `test/helpers/test-factory.ts` `cleanupTestData` para borrar
contactos DESPUÉS de comprobantes (FK Restrict):

```typescript
await prisma.lineaComprobante.deleteMany(...);
await prisma.comprobante.deleteMany(...);
await prisma.contacto.deleteMany(...);   // ← nuevo
```

---

## 10. Alcance y no-alcance

### Dentro de alcance

- CRUD básico de contactos con flags cliente/proveedor.
- Documento libre con unicidad parcial por tenant.
- Activación / desactivación.
- FK Restrict hacia `LineaComprobante`.
- Port de lectura para `comprobantes`.
- Validación cruzada al crear/contabilizar comprobantes.

### Fuera de alcance (diferido)

- **Validación de formato de NIT**. El módulo `Nit` value object existe, pero
  en este slice el documento es texto libre. Se endurece cuando LCV lo pida.
- **Consulta online al padrón del SIN**. Nunca — ver §10.9 core ("lo que NO hace el sistema").
- **Múltiples documentos por contacto** (NIT + CI para misma persona). No lo pidió ningún contador del gremio; se evalúa si aparece.
- **Historial de cambios de contacto** (quién editó el email cuándo).
  La tabla `audit` global ya captura esto — no necesitamos una tabla específica tipo `ContactoAuditoria`.
- **Import masivo desde Excel**. **Deuda futura explícita** — se reevalúa cuando los primeros tenants superen ~50 contactos o migren desde un sistema existente. Pensado como endpoint `POST /api/contactos/import` que reciba un CSV/XLSX con dry-run previo y reporte de conflictos (documento duplicado, email inválido). No bloquea nada del core contable.
- **Categorización de contactos** (socio activo / socio baja / proveedor externo).
  Si aparece, es un enum futuro — no bloquea este slice.

---

## 11. Orden de commits sugerido

Consistente con el patrón de Fase 1.3 (§commits pequeños + verde entre cada uno):

1. `feat(contacto): schema + migration — tabla Contacto + FK desde LineaComprobante`
2. `feat(contacto): domain (entidad + errors) + validator puro`
3. `feat(contacto): port + PrismaContactosRepository + integration spec`
4. `feat(contacto): service CRUD + unit tests`
5. `feat(contacto): controller + DTOs + endpoints + permisos en seed`
6. `feat(contacto): ContactosReaderPort + integración en comprobantes.service`
7. `feat(contacto): E2E + cleanup helper + cierre de Fase 1.4 slice 1`

Cada commit debe pasar `tsc --noEmit`, `lint`, y la suite de tests del
subsistema tocado. No se mergea a main con rojo.

---

## 12. Referencias

- `CLAUDE.md` §1 (naming), §3 (arquitectura hexagonal), §4.2 (multi-tenant),
  §4.7 (no soft-delete en contabilidad), §4.8 (unicidad defense in depth).
- `docs/disenos/comprobantes-asientos.md` §4.3 (LineaComprobante — fuente
  del `contactoId` hoy como string libre).
- `docs/claude/dominio-contable.md` §4.1 (plan de cuentas,
  `requiereContacto`).
- `docs/claude/errores-y-logs.md` §6.2–§6.3 (jerarquía `DomainError`).
- `docs/claude/testing.md` §7.1–§7.3 (pirámide, sufijos, ubicación).
