# Exploración: granja-v1

> Generado por sdd-explore — 2026-06-01
> Artifact store: hybrid (openspec + engram topic_key `sdd/granja-v1/explore`)

---

## 1. Resumen del problema e intención

Granja v1 es el **vertical operativo avícola** de Avicont, pensado para ser usado **desde el celular en el gallinero**. No tiene relación contable (sin partida doble, sin asientos). El norte es una sola métrica: **"costo por pollo vivo en tiempo real"** = Σ inversiones / (pollitos iniciales − muertes). El modelo ya está diseñado y documentado en `docs/disenos/granja.md`; lo que falta es la implementación completa: schema Prisma, backend hexagonal, y frontend mobile-first. El andamiaje de plataforma (flag `granjaEnabled`, guard `@RequireModule('granja')`, permisos en catálogo, template `Granjero` en seed) ya existe — granja solo necesita enchufarse a él.

---

## 2. Inventario: lo que YA EXISTE vs. lo que hay que CONSTRUIR

### 2.1 Andamiaje de plataforma — YA EXISTE

| Pieza | Path | Estado |
|-------|------|--------|
| Flag `granjaEnabled` en `Organization` | `backend/prisma/schema.prisma` línea 154 | ✅ `@default(false)` |
| CHECK vertical exclusivo `organizations_vertical_exclusivo_check` | `backend/prisma/migrations/20260531180000_*/migration.sql` | ✅ NOT (contabilidadEnabled AND granjaEnabled) |
| `@RequireModule('granja')` decorator | `backend/src/common/decorators/require-module.decorator.ts` | ✅ `FeatureModule = 'contabilidad' \| 'granja'` |
| `ModuleEnabledGuard` — guard para flag de módulo | `backend/src/common/guards/module-enabled.guard.ts` | ✅ leer de Redis (TTL 5 min) → 404 si disabled |
| Permisos granja en catálogo | `backend/src/common/permisos/catalogo.ts` líneas 216-242 | ✅ 5 submodulos: dashboard, lotes, tipos-registro, movimientos, chat |
| Template `Granjero` en seed con GRANJERO_PERMISSIONS | `backend/prisma/seed.ts` líneas 49-64 | ✅ 14 permisos completos incluyendo chat |
| Value objects `Money`, `FechaContable`, `ClockPort` | `backend/src/common/domain/` y `backend/src/common/clock/` | ✅ listos para reusar |
| `<Can>` + `<PermissionButton>` (gating frontend) | `frontend/src/components/shared/` | ✅ con soporte `string\|string[]` AND |
| `PERMISSIONS` object frontend | `frontend/src/lib/permissions.ts` | ⚠️ FALTA el bloque `granja` (contabilidad y organizacion sí están) |

### 2.2 Lo que hay que CONSTRUIR (gap completo)

#### Backend
- [ ] **Schema Prisma**: 4 tablas (`Lote`, `TipoRegistro`, `MovimientoInversion`, `MovimientoCantidad`) + 2 enums (`EstadoLote`, `NaturalezaRegistro`). Relacionar con `Organization` (multi-tenant). Migración limpia.
- [ ] **Módulo `backend/src/granja/`** con estructura hexagonal completa:
  - `domain/`: entidades puras `Lote`, `TipoRegistro`, `MovimientoInversion`, `MovimientoCantidad`
  - `ports/`: `LoteRepositoryPort`, `TipoRegistroRepositoryPort`, `MovimientoInversionRepositoryPort`, `MovimientoCantidadRepositoryPort`
  - `adapters/`: implementaciones Prisma para cada port
  - `dto/`: DTOs de request/response
  - Services: `LoteService`, `TipoRegistroService`, `MovimientoService`
  - Controller: `GranjaController` (o controllers separados por recurso)
  - `GranjaModule`
- [ ] **Cálculo costo/pollo vivo en lectura** (en el service, usando `Money`, nunca persistido)
- [ ] **Seed de TipoRegistro de fábrica** al activar granja (port `TipoRegistroSeederPort` + adapter, mismo patrón que `TiposDocumentoFisicoSeeder`)
- [ ] **Wiring con `TenantsService`** para sembrar TipoRegistros cuando `granjaEnabled` pasa a `true`
- [ ] **RBAC en cada endpoint**: `@RequireModule('granja')` + `@RequirePermissions(...)`
- [ ] **Tests**: unit de cálculo de costo/pollo + invariantes de dominio; integration del adapter Prisma; e2e de endpoints con multi-tenant estricto

#### Frontend
- [ ] **`frontend/src/features/granja/`** con estructura screaming: `api/`, `hooks/`, `components/`, `pages/`, `schemas/`, `lib/`
- [ ] **Agregar bloque `granja` a `frontend/src/lib/permissions.ts`** espejando el catálogo backend
- [ ] **Dashboard**: lista de lotes activos con costo/pollo en tiempo real, móbile-first
- [ ] **CRUD Lotes**: crear (con validación inmutable de cantidadInicial post-create), listar, ver detalle, editar, cerrar
- [ ] **TiposRegistro**: listar (tipos de fábrica + propios), crear, editar, desactivar
- [ ] **Movimientos**: registrar inversión y cantidad sobre un lote activo; listar por lote
- [ ] **Vista de detalle del lote**: desglose de costos por tipo, % mortalidad, edad en días, aves vivas, costo por pollo
- [ ] **Tests frontend**: components con Testing Library + lógica pura en `lib/`

---

## 3. Mapa de entidades, enums y relaciones

### Enums (dominio español)

```
EstadoLote          = ACTIVO | CERRADO
NaturalezaRegistro  = INVERSION | CANTIDAD
```

### Entidades y relaciones

```
Organization 1──< Lote            (organizationId — multi-tenant NOT NULL)
Organization 1──< TipoRegistro    (organizationId — multi-tenant NOT NULL)

Lote 1──< MovimientoInversion     (loteId + organizationId denormalizado)
Lote 1──< MovimientoCantidad      (loteId + organizationId denormalizado)

MovimientoInversion >──1 TipoRegistro  (tipoRegistroId, naturaleza = INVERSION)
MovimientoCantidad  >──1 TipoRegistro  (tipoRegistroId, naturaleza = CANTIDAD)
```

### Claves multi-tenant

Cada tabla lleva `organizationId` NOT NULL. Defense in depth: el guard + service + repo filtran por él independientemente. El denormalizado en `MovimientoInversion.organizationId` y `MovimientoCantidad.organizationId` sigue el patrón de `LineaComprobante.organizationId` (para queries sin JOIN). Se valida en el service que el `loteId` pertenece al mismo `organizationId` antes de crear un movimiento.

### Derivados (NUNCA almacenados, calculados en lectura)

| Derivado | Fórmula | Notas |
|----------|---------|-------|
| `avesVivas` | `cantidadInicial − Σ(MovimientoCantidad.cantidad)` | Int. Nunca < 0 (invariante) |
| `costoAcumulado` | `Σ(MovimientoInversion.monto)` | `Money`. Siempre ≥ 0 |
| `costoPorPolloVivo` | `avesVivas > 0 ? costoAcumulado / avesVivas : null` | `Money` o null. "—" en UI |
| `edadDias` | `ClockPort.currentDateLaPaz() − fechaIngreso` | Int |
| `porcentajeMortalidad` | `Σ(muertes) / cantidadInicial * 100` | Decimal(5,2) |

### Seed de TipoRegistro (12 tipos de fábrica, `esSistema = true`)

**INVERSION (11):** Compra de pollitos, Alimento, Alquiler Galpón, Mantenimiento Galpón, Vacunas, Veterinario, Mano de Obra, Chala, Garrafas (gas), Agua y Luz, Otros gastos.

**CANTIDAD (1):** Mortalidad.

---

## 4. Slicing recomendado v1

El criterio de corte es: **cada slice es verticalmennte entregable e incrementalmente testeable** (TDD Strict activado). El más pequeño que entrega valor es el cálculo de costo, pero necesita base. Propuesta de 7 slices:

### Slice 1 — Schema Prisma + Migración (fundación)
**Backend only.** Crear los 2 enums + 4 tablas en `schema.prisma`. Migración limpia siguiendo §11.6. Constraints de BD: `UNIQUE(organizationId, nombre)` en `TipoRegistro`; índices por `organizationId`, `loteId`, `estado`. Índice parcial `WHERE estado = 'ACTIVO'` en `Lote` para el dashboard query.
**TDD**: no aplica (schema solo).
**Entrega**: migración aplicable y verificada con `\d lotes`.

### Slice 2 — Dominio puro + Ports (contratos)
**Backend only.** Entidades de dominio en `granja/domain/` (sin NestJS, sin Prisma). Enums de dominio propios (no importar los de Prisma, espejados en `granja/domain/enums.ts`). Value objects si hacen falta (`LoteNombre`, `GalponTexto`). Ports: `LoteRepositoryPort`, `TipoRegistroRepositoryPort`, `MovimientoInversionRepositoryPort`, `MovimientoCantidadRepositoryPort`. Port seeder: `TipoRegistroSeederPort`.
**TDD**: tests unitarios del dominio puro (invariantes: `avesVivas ≥ 0`, `cantidadInicial > 0`, no agregar movimiento a lote cerrado, naturaleza del TipoRegistro debe matchear la tabla del movimiento).

### Slice 3 — Adapters Prisma + Services básicos (Lote + TipoRegistro)
**Backend only.** `PrismaLoteRepository`, `PrismaTipoRegistroRepository`. `LoteService` + `TipoRegistroService` (CRUD) sin cálculo derivado todavía. `PrismaTipoRegistroSeederAdapter`. Wiring básico del `GranjaModule`.
**TDD**: integration tests de los adapters (Postgres real, `DATABASE_URL` env). Tests unitarios del service con mocks de los ports.

### Slice 4 — Movimientos + Cálculo costo/pollo (la joya)
**Backend only.** Adapters `PrismaMovimientoInversionRepository` y `PrismaTipoRegistroRepository`. Service `MovimientoService` con cálculo de derivados usando `Money` y `ClockPort`. Invariante `avesVivas ≥ 0` enforzado al crear `MovimientoCantidad`. Método `calcularResumenLote(loteId, organizationId)` retorna struct con todos los derivados.
**TDD**: tests unitarios del cálculo de costo (casos: lote vacío, 1 movimiento, varios, mortalidad total, monto nulo → null). Tests de la invariante de avesVivas negativo.

### Slice 5 — Controllers + DTOs + RBAC (superficie API)
**Backend only.** `GranjaController` (o `LotesController`, `TiposRegistroController`, `MovimientosController`). DTOs de request/response. `@RequireModule('granja')` + `@RequirePermissions(...)` en cada endpoint. Dashboard endpoint: `GET /api/granja/dashboard`. Endpoints URLs en español (ver §7 granja.md). Integrar seed en el flujo `TenantsService.updateFeatures` (cuando `granjaEnabled` → `true`, sembrar TipoRegistros).
**TDD**: e2e tests de los endpoints con multi-tenant estricto (un tenant no accede al lote de otro). Tests de 404 cuando `granjaEnabled = false`.

### Slice 6 — Frontend (mobile-first)
**Frontend only.** `frontend/src/features/granja/` completa. Dashboard + Lotes + Tipos Registro + Movimientos. Agregar bloque `granja` a `PERMISSIONS`. Gating con `<Can>` / `<PermissionButton>`. Formularios con RHF + Zod. Mobile-first estricto (breakpoint base = 375px).
**TDD**: tests de componentes con Testing Library; lógica pura en `lib/` (si la hay).

### Slice 7 — Activación del vertical en la plataforma (toggle UI)
Agregar el flujo de UI para que un OWNER/ADMIN active el vertical granja (toggle en configuración de la org que llama al endpoint de feature flags, con el CHECK de vertical exclusivo produciendo error amigable si la org tiene `contabilidadEnabled = true`). Backend ya tiene el endpoint de feature flags; solo necesita la UI.

---

## 5. Preguntas abiertas / riesgos / decisiones pendientes

### P1: ¿El seed de TipoRegistro corre por org al activar el vertical, o es global en Prisma `seed.ts`?
**Contexto**: `TipoDocumentoFisico` usa `TiposDocumentoFisicoSeederPort` invocado por `TenantsService` al crear la org. Para granja, la activación puede ser posterior a la creación de la org. Opciones:
- A) `TipoRegistroSeederPort.seedDefaultsForTenant()` invocado por `TenantsService.updateFeatures(granjaEnabled=true)`.
- B) Global en `seed.ts` por org existente (solo funciona si todas las orgs activan granja).
**Recomendación de la exploración**: opción A (igual que `TipoDocumentoFisico`), pero hay que decidir qué pasa si el seed ya corrió (idempotencia via `upsert` por `(organizationId, nombre, naturaleza)` o por un `codigo` estable).
**Decisión pendiente para proposal**.

### P2: ¿Los enums de dominio de granja van en un archivo compartido con los enums contables, o en `granja/domain/enums.ts` propio?
**Contexto**: `backend/src/common/domain/enums.ts` existe. `EstadoLote` y `NaturalezaRegistro` son exclusivos de granja. La convención de `tipos-documento-fisico` es tener errores propios en `domain/`. Los enums de Prisma son infraestructura y no deben entrar al dominio puro.
**Recomendación**: archivo `granja/domain/enums.ts` aislado, espejando los de Prisma. Confirmación en proposal.

### P3: ¿El cálculo `costoPorPolloVivo` vive en el `LoteService` (inline al leer el lote) o en un `GranjaDashboardService` separado?
**Contexto**: el dashboard necesita calcular para N lotes en paralelo. Si está solo en `LoteService.findById`, el dashboard hace N llamadas. Alternativa: un método `LoteService.findAllConResumen(tenantId)` que hace las queries de movimientos en batch.
**Opción**: 1 service con método de resumen en batch para dashboard + método individual para detalle. Pero hay que diseñar si el port expone el resumen o si el service orquesta múltiples ports.
**Decisión pendiente para design**.

### P4: ¿Los endpoints de lotes van en `/api/lotes` o en `/api/granja/lotes`?
**Contexto**: `granja.md` §7 propone `/api/lotes` (raíz) para CRUD de lotes pero `/api/granja/dashboard` y `/api/granja/tipos-registro`. En el backend, el `GranjaController` puede tener prefijos distintos. Es consistencia de la API.
**Recomendación de la exploración**: unificar todo bajo `/api/granja/` (lotes, tipos-registro, movimientos, dashboard) para namespace claro del vertical. Confirmar en proposal.

### P5: ¿Qué pasa si se intenta activar granja en una org que ya tiene `contabilidadEnabled = true`?
**Contexto**: el CHECK `organizations_vertical_exclusivo_check` en BD tira un constraint error. `TenantsService` debe capturarlo y devolver un `DomainError` amigable antes que llegue al constraint (defense in depth, patrón de F-01).
**Solución obvia**: `VerticalNoExclusivoError` en `TenantsService.updateFeatures`. ¿Ya existe? Verificar — el schema y el guard existen, pero el error amigable puede no estar implementado.

### P6: ¿La invariante `avesVivas ≥ 0` se enforza solo en el service o también con un CHECK en la BD?
**Contexto**: en contabilidad, la partida doble se enforza en service + con `totalDebitoBob = totalCreditoBob` al contabilizar (ambos totales en BD). Para granja, el denominador del costo no puede ser negativo. Un CHECK `cantidadInicial > 0` sí va en BD; pero la condición `Σ(muertes) ≤ cantidadInicial` es una regla que involucra un agregado y no puede ir en un simple CHECK de columna. **Solo en service es suficiente** (no hay forma de expresarlo en BD sin trigger), pero el service debe ser la autoridad.
**Aclaración para design**: no hay check de BD posible para avesVivas. El invariante es solo del service.

### P7: ¿El campo `detalle` de `MovimientoInversion` y `MovimientoCantidad` tiene longitud máxima definida?
**Contexto**: el diseño dice "texto libre". Para el DTO necesitamos un `@MaxLength`. Nada establecido en el diseño.
**Decisión pendiente**: Marco propone en proposal. Sugerencia: 500 chars (igual que `glosa` en `DocumentoFisico`).

### P8: ¿Existe el endpoint/UI para que el OWNER active `granjaEnabled` en una org existente?
**Contexto**: `TenantsService.updateFeatures` (endpoint de feature flags) probablemente existe para el módulo de contabilidad. Pero no se verificó si el flujo de UI para activar granja está implementado o solo el backend. Parte del Slice 7.

---

## 6. Módulo de referencia: `tipos-documento-fisico/`

La referencia más cercana para granja por tener seed de fábrica + CRUD + hexagonal. Layout para espejarlo:

```
backend/src/granja/
├── domain/
│   ├── enums.ts                          (EstadoLote, NaturalezaRegistro — propios, no de Prisma)
│   ├── lote.ts                           (entidad pura Lote)
│   ├── tipo-registro.ts
│   ├── movimiento-inversion.ts
│   ├── movimiento-cantidad.ts
│   └── granja.errors.ts                  (DomainErrors: GRANJA_LOTE_*, GRANJA_MOVIMIENTO_*)
├── ports/
│   ├── lote.repository.port.ts           (abstract class + Symbol)
│   ├── tipo-registro.repository.port.ts
│   ├── movimiento-inversion.repository.port.ts
│   ├── movimiento-cantidad.repository.port.ts
│   └── tipo-registro-seeder.port.ts
├── adapters/
│   ├── prisma-lote.repository.ts
│   ├── prisma-lote.repository.integration.spec.ts
│   ├── prisma-tipo-registro.repository.ts
│   ├── prisma-tipo-registro.repository.integration.spec.ts
│   ├── prisma-movimiento-inversion.repository.ts
│   ├── prisma-movimiento-cantidad.repository.ts
│   └── prisma-tipo-registro-seeder.adapter.ts
├── seed/
│   └── tipos-registro-fabrica.ts         (los 12 tipos, esSistema=true — igual que tipos-universales.ts)
├── dto/
│   ├── create-lote.dto.ts
│   ├── update-lote.dto.ts
│   ├── lote-response.dto.ts
│   ├── create-tipo-registro.dto.ts
│   ├── update-tipo-registro.dto.ts
│   ├── tipo-registro-response.dto.ts
│   ├── create-movimiento-inversion.dto.ts
│   ├── create-movimiento-cantidad.dto.ts
│   └── movimiento-response.dto.ts
├── lote.service.ts                       (inyecta LoteRepositoryPort + MovimientosPorts + ClockPort)
├── lote.service.spec.ts
├── tipo-registro.service.ts
├── tipo-registro.service.spec.ts
├── movimiento.service.ts                 (orquesta inversión + cantidad + cálculo resumen)
├── movimiento.service.spec.ts
├── granja.controller.ts                  (o lotes.controller.ts + tipos-registro.controller.ts)
└── granja.module.ts
```

**Seed pattern**: `seed/tipos-registro-fabrica.ts` expone un array `readonly` de filas con `{ nombre, naturaleza, esSistema: true }`. El seeder adapter hace `upsert` idempotente por `(organizationId, nombre, naturaleza)`. Disparado por `TenantsService` al activar granja.

**Port pattern**: `abstract class` con `Symbol` de inyección, mismo patrón que `TIPO_DOCUMENTO_FISICO_REPOSITORY_PORT`.

**Module pattern**: proveedor + `useExisting` para el Symbol. Exportar el seeder port para que `TenantsModule` lo importe.

---

## 7. Frontend: stack y gating (confirmación)

### Stack confirmado
- React 19 + Vite + TanStack Query + Zustand + react-hook-form + Zod + Tailwind.
- `<Can permission={...}>` + `<PermissionButton permission={...} deniedReason="...">` en `frontend/src/components/shared/`.
- `usePermissions()` en `frontend/src/lib/use-permissions.ts`.

### Gap en `PERMISSIONS` object
`frontend/src/lib/permissions.ts` tiene bloques para `contabilidad` y `organizacion` pero **no tiene el bloque `granja`**. Hay que agregarlo espejando el catálogo (Slice 6):

```ts
granja: {
  dashboard: { read: 'granja.dashboard.read' },
  lotes: { read, create, update, delete },
  tiposRegistro: { read, create, update, delete },
  movimientos: { read, create, update, delete },
  chat: { interact: 'granja.chat.interact' },
}
```

### Mobile-first estricto (granja es la excepción del §7 de frontend/CLAUDE.md)
- Breakpoints: base = 375px (iPhone SE, el granjero en el gallinero).
- Tap targets ≥ 44×44 px en todos los botones.
- Inputs `text-base` en mobile (evita iOS auto-zoom).
- Formularios con submit full-width en mobile.
- El costo por pollo debe ser el dato más visible en el dashboard y en el detalle del lote.

---

## 8. Riesgos identificados

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| `cantidadInicial` es inmutable post-create pero Prisma no tiene un CHECK que lo enforze — solo el service lo valida | Media | En el service: si el campo viene en el PATCH, ignorarlo o lanzar `BadRequestException`. No olvidar el test del PATCH con intento de cambiar cantidadInicial. |
| El cálculo de costo en el dashboard N lotes hace N × 2 queries (inversiones + cantidades) si se hace ingenuamente | Media | Diseñar el port/adapter de resumen para hacer batch queries `WHERE loteId IN (...)` en vez de N loops. Decisión del Slice 4 design. |
| La invariante `avesVivas ≥ 0` tiene una race condition si dos movimientos de cantidad se registran concurrentemente y llegarían a dejar avesVivas en negativo | Baja (uso single-user por org) | Añadir `SELECT FOR UPDATE` sobre el lote al registrar `MovimientoCantidad`. Documentar la decisión en el design. |
| El seed de TipoRegistro puede ser invocado múltiples veces si `updateFeatures` es llamado varias veces con `granjaEnabled=true` | Baja | Upsert idempotente por `(organizationId, nombre, naturaleza)` lo resuelve. |
| `PERMISSIONS.granja` faltante en frontend puede causar que botones no se gateen correctamente si se usan strings sueltos en lugar del objeto centralizado | Alta | Agregar el bloque en Slice 6 antes de cualquier componente. El eslint no lo detecta actualmente. |

---

*Exploración completada. Próximo paso recomendado: `sdd-propose granja-v1`.*
