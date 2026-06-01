# Tasks — `granja-v1` — vertical Granja (engorde de pollos parrilleros), núcleo operativo

<!--
Última edición: 2026-06-01
Owner: backend-lead
-->

> Change: granja-v1
> Fase: tasks
> Specs de referencia: specs/granja-lotes · specs/granja-movimientos · specs/granja-costo-pollo · specs/granja-tipos-registro · specs/granja-rbac-activacion
> Diseño técnico: openspec/changes/granja-v1/design.md (fuente primaria)
> Cada slice = 1 PR. Orden TDD ESTRICTO dentro de cada slice: `[test]` ANTES de `[impl]`.

---

## Resumen de slices

| Slice | Nombre | Tareas | Scope commit | Dependencias |
|-------|--------|--------|--------------|--------------|
| S0 | Money.div (pre-tarea, commit separado `common`) | 3 | `feat(common): Money.div` | — |
| S1 | Schema Prisma + migración | 5 | `feat(db): granja schema` | — |
| S2 | Dominio puro + ports | 14 | `feat(granja): domain + ports` | S0 |
| S3 | Adapters CRUD + services base | 15 | `feat(granja): adapters + CRUD services` | S1, S2 |
| S4 | Movimientos + read-model (la joya) | 16 | `feat(granja): movimientos + costo-pollo read-model` | S3 |
| S5 | Controllers + DTOs + RBAC + seed wiring | 18 | `feat(granja): controllers + e2e + seed wiring` | S4 |
| S6 | Frontend mobile-first | 22 | `feat(granja): frontend mobile-first` | S5 |
| S7 | Toggle activación UI | 6 | `feat(granja): toggle activacion vertical` | S6 |

**Total: 99 tareas**

---

## Gotchas de proyecto (aplicar en las tareas indicadas)

- **G-1** Tests integración/e2e backend: Postgres en `127.0.0.1`, `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas"` inline. El sandbox no lee `.env`.
- **G-2** Frontend CI: `pnpm exec tsc -b` (NO `tsc --noEmit`) — typechequea project refs.
- **G-3** `lint` backend = `eslint src/` (NO cubre `test/`) → lint e2e explícito si se toca código en `test/`.
- **G-4** Tras editar archivos EXISTENTES (app.module, tenants.service, schema.prisma) verificar con grep que el cambio quedó.
- **G-5** `describe`/`it` de tests en **español** (§7.6 CLAUDE.md).
- **G-6** `Money` para todo dinero. `FechaContable`/`ClockPort.hoyEnLaPaz()` para fechas. `any` prohibido.
- **G-7** `organizationId` en CADA query del adapter (defense in depth §4.2). Una query sin él = bug de seguridad.
- **G-8** `findByIdForUpdate` usa `tx.$queryRaw` parametrizado — Prisma no expone `FOR UPDATE`. Sin interpolación de strings.
- **G-9** `PERMISSIONS.granja` en `frontend/src/lib/permissions.ts` — ojo drift key camel `tiposRegistro` ↔ string `granja.tipos-registro.*`.
- **G-10** Protocolo §11.6 CLAUDE.md tras crear la migración: verificar con `grep -E "^DROP" migration.sql` antes de aplicar.

---

## Slice 0 — Money.div (pre-tarea, commit separado, scope `common`)

> **Commit AISLADO** antes de S2/S4 — `Money.div` es requerido por `ResumenLote.calcular`. Va en su propio commit `feat(common): add Money.div`.
> Sin dependencias. Sin PR separado: puede ir al inicio de la branch de S2 o en su propio commit previo.

- [ ] **S0.1** `[test]` RED — tests unitarios de `Money.div` en `backend/src/common/domain/money.spec.ts` (o extender el spec existente)
  - `describe('Money.div')` en español:
    - `Money.of('75000').div(4900)` → `Bs 15.31` (redondeo half-up a 2 decimales)
    - `Money.of('75000').div(5000)` → `Bs 15.00`
    - `Money.of('30').div(3)` → `Bs 10.00`
    - `Money.of('1').div(3)` → `Bs 0.33` (redondeo)
    - `Money.div(0)` → lanza `RangeError` (división por cero no se admite — caller verifica `avesVivas > 0` antes de llamar)
  - Ejecutar: `cd backend && pnpm exec jest src/common/domain/money.spec.ts` → **RED**

- [ ] **S0.2** `[impl]` GREEN — implementar `Money.div(divisor: number): Money` en `backend/src/common/domain/money.ts`
  - Método: `div(divisor: number): Money { if (divisor === 0) throw new RangeError('Money: division por cero'); return new Money(this.amount.div(divisor).toDecimalPlaces(2)); }`
  - Envuelve `Prisma.Decimal.div` con `toDecimalPlaces(2)` (half-up semántica BOB §4.5)
  - Ejecutar: `cd backend && pnpm exec jest src/common/domain/money.spec.ts` → **GREEN**

- [ ] **S0.3** Typecheck + lint + commit
  - `cd backend && pnpm exec tsc --noEmit -p tsconfig.json` → 0 errores
  - `cd backend && pnpm run lint` → 0 errores
  - Commit: `feat(common): add Money.div for cost-per-unit calculations`

---

## Slice 1 — Schema Prisma + migración

> Branch: `feat/granja-schema`. 1 PR. No tiene TDD (schema only). Depende de: nada.

- [ ] **S1.1** Agregar sección granja al final de `backend/prisma/schema.prisma`
  - Agregar enums `EstadoLote` y `NaturalezaRegistro` (ver design.md §3 — copiar bloque exacto)
  - Agregar modelos `Lote`, `TipoRegistro`, `MovimientoInversion`, `MovimientoCantidad` con todas las relaciones, índices y `@@map`
  - **Recordatorio G-4**: `grep -c "EstadoLote\|NaturalezaRegistro\|lotes\|tipos_registro" backend/prisma/schema.prisma` para confirmar

- [ ] **S1.2** Agregar backrelations en `model Organization`
  - En el bloque de relaciones de `Organization`, agregar:
    ```
    lotes                Lote[]
    tiposRegistro        TipoRegistro[]
    movimientosInversion MovimientoInversion[]
    movimientosCantidad  MovimientoCantidad[]
    ```
  - **Recordatorio G-4**: `grep "tiposRegistro\|lotes" backend/prisma/schema.prisma`

- [ ] **S1.3** Generar migración y agregar CHECK raw SQL
  - `cd backend && DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" pnpm exec prisma migrate dev --name granja_v1_schema`
  - Abrir el `migration.sql` generado — **Recordatorio G-10**: `grep -E "^DROP" backend/prisma/migrations/<timestamp>_granja_v1_schema/migration.sql` → si hay DROPs, revisar protocolo §11.6 CLAUDE.md
  - Agregar al final del `migration.sql` (raw SQL aditivo):
    ```sql
    ALTER TABLE "lotes" ADD CONSTRAINT "lotes_cantidad_inicial_positiva_check" CHECK ("cantidadInicial" > 0);
    ```
  - Si se necesita aplicar después de editar: `cd backend && DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" pnpm exec prisma migrate deploy`

- [ ] **S1.4** Actualizar tabla de objetos raw SQL en `CLAUDE.md §11.6`
  - Agregar fila a la tabla de "objetos raw SQL vivos":
    ```
    | `lotes_cantidad_inicial_positiva_check` | CHECK | `<timestamp>_granja_v1_schema` |
    ```
  - Este objeto NO debe ser dropeado en futuras regeneraciones de migración

- [ ] **S1.5** Verificar migración aplicada + CHECK presente
  - `docker compose exec postgres psql -U postgres -d saas -c "\d lotes"` → confirmar que el CHECK aparece en la sección de constraints
  - `cd backend && DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" pnpm exec prisma generate` → cliente Prisma regenerado sin errores
  - Commit: `feat(db): add granja schema (lotes, tipos_registro, movimientos)`

---

## Slice 2 — Dominio puro + ports

> Branch: `feat/granja-domain-ports`. 1 PR. TDD estricto: tests ANTES de la entidad/port.
> Depende de: S0 (Money.div). No toca adapters ni NestJS.

### S2-A — Errores del módulo (base de todo)

- [ ] **S2.1** `[impl]` Crear `backend/src/granja/domain/granja.errors.ts`
  - Subclases de `DomainError` (§6.2) para todos los errores del design.md §10:
    `LoteNoEncontradoError`, `LoteCerradoError`, `LoteCerradoNoEditableError` (422, el lote no admite movimientos ni edición), `LoteYaCerradoError` (422, ya estaba cerrado al intentar cerrarlo de nuevo), `CantidadInicialInvalidaError`, `CantidadInicialInmutableError` (400), `TipoRegistroNoEncontradoError`, `TipoRegistroNombreDuplicadoError`, `TipoRegistroNaturalezaInvalidaError`, `TipoRegistroNaturalezaInmutableError`, `TipoRegistroInactivoError`, `TipoRegistroSistemaNoEliminableError`, `TipoRegistroSistemaNoEditableError`, `TipoRegistroConMovimientosError`, `MovimientoCantidadExcedeVivasError`, `MontoInvalidoError`, `CantidadInvalidaError`, `MovimientoNoEncontradoError`
  - Códigos `GRANJA_{SUBDOMINIO}_{CONDICION}` (ver design.md §10 para la tabla completa)

### S2-B — Enums de dominio propios

- [ ] **S2.2** `[impl]` Crear `backend/src/granja/domain/enums.ts`
  - `EstadoLote { ACTIVO = 'ACTIVO', CERRADO = 'CERRADO' }` — espeja Prisma sin importarlo (P2)
  - `NaturalezaRegistro { INVERSION = 'INVERSION', CANTIDAD = 'CANTIDAD' }` — ídem

### S2-C — Entidad `Lote` (aggregate root)

- [ ] **S2.3** `[test]` RED — `backend/src/granja/domain/lote.spec.ts`
  - `describe('Lote.crear')`:
    - crea con campos válidos → estado ACTIVO, fechaCierre null
    - `cantidadInicial = 0` → lanza `CantidadInicialInvalidaError` (spec: GRANJA_LOTE_CANTIDAD_INICIAL_INVALIDA)
    - `cantidadInicial = -1` → lanza `CantidadInicialInvalidaError`
    - `cantidadInicial = 5000` → `estaActivo = true`, `estaCerrado = false`
  - `describe('Lote.assertAdmiteMovimientos')`:
    - lote ACTIVO → no lanza
    - lote CERRADO → lanza `LoteCerradoError` (GRANJA_LOTE_CERRADO)
  - `describe('Lote.edadDias')`:
    - `fechaIngreso = 2026-06-01`, `hoy = 2026-06-15` → `edadDias = 14`
    - `fechaIngreso = hoy` → `edadDias = 0`
  - `describe('Lote.rehidratar')`:
    - reconstruye sin validar (acepta `cantidadInicial` ya persistida)
  - Ejecutar: `cd backend && pnpm exec jest src/granja/domain/lote.spec.ts` → **RED**

- [ ] **S2.4** `[impl]` GREEN — Crear `backend/src/granja/domain/lote.ts` (ver firmas en design.md §4)
  - Clase con `private constructor`, `static crear(props)`, `static rehidratar(props)`
  - `crear` valida `cantidadInicial > 0` (lanza `CantidadInicialInvalidaError`)
  - `assertAdmiteMovimientos` lanza `LoteCerradoError` si `estado === EstadoLote.CERRADO`
  - `edadDias(hoy: FechaContable): number` — diff de días calendario
  - `get estaActivo`, `get estaCerrado`
  - Sin imports de NestJS ni Prisma
  - Ejecutar: `cd backend && pnpm exec jest src/granja/domain/lote.spec.ts` → **GREEN**

### S2-D — Entidad `TipoRegistro`

- [ ] **S2.5** `[test]` RED — `backend/src/granja/domain/tipo-registro.spec.ts`
  - `describe('TipoRegistro.crear')`:
    - nombre vacío → lanza (validar `trim().length > 0`)
    - nombre válido, `esSistema = false` → `eseliminable = true`
    - `esSistema = true` → `eseliminable = false`
  - `describe('TipoRegistro.esDeNaturaleza')`:
    - tipo INVERSION → `esDeNaturaleza(INVERSION) = true`, `esDeNaturaleza(CANTIDAD) = false`
  - Ejecutar: `cd backend && pnpm exec jest src/granja/domain/tipo-registro.spec.ts` → **RED**

- [ ] **S2.6** `[impl]` GREEN — Crear `backend/src/granja/domain/tipo-registro.ts`
  - `static crear(props)` — valida nombre no vacío
  - `static rehidratar(props)`
  - `esDeNaturaleza(n: NaturalezaRegistro): boolean`
  - `get eseliminable(): boolean` — `!esSistema`
  - Ejecutar: verde

### S2-E — Entidades de movimiento

- [ ] **S2.7** `[test]` RED — tests en `backend/src/granja/domain/movimiento-inversion.spec.ts` y `movimiento-cantidad.spec.ts`
  - `MovimientoInversion.crear`: `monto = 0` → lanza `MontoInvalidoError`; `monto > 0` → ok
  - `MovimientoInversion.crear`: `monto = -50` → lanza `MontoInvalidoError`
  - `MovimientoCantidad.crear`: `cantidad = 0` → lanza `CantidadInvalidaError`; `cantidad > 0` → ok
  - `MovimientoCantidad.crear`: `cantidad = -5` → lanza `CantidadInvalidaError`
  - Ejecutar: → **RED**

- [ ] **S2.8** `[impl]` GREEN — Crear `backend/src/granja/domain/movimiento-inversion.ts` y `movimiento-cantidad.ts`
  - `monto: Money` en `MovimientoInversion` — `Money.of(props.monto)` en `crear`, valida `> 0`
  - `cantidad: number` en `MovimientoCantidad` — valida entero `> 0`
  - Ejecutar: verde

### S2-F — ResumenLote (el corazón del cálculo)

- [ ] **S2.9** `[test]` RED — `backend/src/granja/domain/resumen-lote.spec.ts`
  - Cubre specs/granja-costo-pollo §Requirements completo:
  - `describe('ResumenLote.calcular')`:
    - lote sin inversiones ni muertes → `costoAcumulado = Bs 0.00`, `avesVivas = 3000`, `costoPorPolloVivo = Bs 0.00`
    - inversiones = 75000, muertes = 100, cantInicial = 5000 → `avesVivas = 4900`, `costoPorPolloVivo = Bs 15.31`
    - mortalidad encarece: muertes = 500 con mismo costo → `costoPorPolloVivo` SUBE (15.00 → 16.67)
    - mortalidad total (avesVivas = 0) → `costoPorPolloVivo = null` (NO divide por cero)
    - `porcentajeMortalidad` con 5000 muertes / 5000 inicial = 1.0 (100%)
    - `avesVivas` = cantInicial - totalMuertes ≥ 0 siempre
  - Ejecutar: `cd backend && pnpm exec jest src/granja/domain/resumen-lote.spec.ts` → **RED**

- [ ] **S2.10** `[impl]` GREEN — Crear `backend/src/granja/domain/resumen-lote.ts`
  - `static calcular({ loteId, cantidadInicial, totalMuertes, costoAcumulado: Money })`: ResumenLote
  - `avesVivas = cantidadInicial - totalMuertes`
  - `costoPorPolloVivo = avesVivas > 0 ? costoAcumulado.div(avesVivas) : null` (usa `Money.div`)
  - `porcentajeMortalidad = cantidadInicial > 0 ? totalMuertes / cantidadInicial : 0`
  - Puro: sin NestJS, sin Prisma, sin ClockPort
  - Ejecutar: verde

### S2-G — Ports (contratos)

- [ ] **S2.11** `[impl]` Crear los 5 ports en `backend/src/granja/ports/`
  - `lote.repository.port.ts` — `abstract class LoteRepositoryPort` + `export const LOTE_REPOSITORY_PORT = Symbol('LoteRepositoryPort')` (ver firmas exactas design.md §5)
    - Incluye `findByIdForUpdate(organizationId, id, tx: Tx): Promise<Lote | null>` (★ lock pesimista)
    - `LoteUpdateData` NO incluye `cantidadInicial` (inmutable — no figura en el tipo)
  - `tipo-registro.repository.port.ts` — `abstract class TipoRegistroRepositoryPort` + Symbol
    - Incluye `upsertSeed` + `countMovimientos` + `setActivo` + `findByNombre`
  - `movimiento.repository.port.ts` — `abstract class MovimientoRepositoryPort` + Symbol
    - Incluye `sumCantidadByLote(organizationId, loteId, tx: Tx): Promise<number>` (★ para el invariante)
  - `lote-resumen.reader.port.ts` — `abstract class LoteResumenReaderPort` + Symbol
    - `agregadosPorLotes(organizationId, loteIds): Promise<Map<string, AgregadosLote>>`
    - `desgloseCostoPorTipo(organizationId, loteId): Promise<DesgloseCostoPorTipo[]>`
  - `tipo-registro-seeder.port.ts` — `abstract class TipoRegistroSeederPort` + Symbol
    - `seedDefaultsForTenant(organizationId, tx?: Tx): Promise<void>`

- [ ] **S2.12** Definir tipos de datos de soporte en los ports
  - `LoteCreateData`, `LoteUpdateData` (sin `cantidadInicial`)
  - `TipoRegistroCreateData`, `TipoRegistroUpdateData`
  - `MovimientoInversionCreateData`, `MovimientoCantidadCreateData`
  - `TipoRegistroSeedRow { nombre: string; naturaleza: NaturalezaRegistro; esSistema: true }`
  - `AgregadosLote`, `DesgloseCostoPorTipo` (interfaces del reader port)
  - Tipo `Tx = Prisma.TransactionClient` — importar Prisma SOLO en los ports (los adapters implementan); el dominio puro NO lo importa

- [ ] **S2.13** Typecheck de dominio puro
  - `cd backend && pnpm exec tsc --noEmit -p tsconfig.json` → 0 errores
  - Los archivos en `granja/domain/` NO deben tener imports de `@nestjs/*` ni de `@prisma/client`

- [ ] **S2.14** Lint + resumen de slice
  - `cd backend && pnpm run lint` → 0 errores
  - `cd backend && pnpm exec jest src/granja/domain/` → todos los tests domain verdes
  - Commit: `feat(granja): domain entities, ports, ResumenLote.calcular`

---

## Slice 3 — Adapters CRUD + services base

> Branch: `feat/granja-adapters-crud`. 1 PR. TDD: tests de integración de adapters y unit de services.
> Depende de: S1 (schema migrado, cliente Prisma generado), S2 (ports definidos).

### S3-A — Seed de fábrica

- [ ] **S3.1** `[test]` RED — `backend/src/granja/seed/tipos-registro-fabrica.spec.ts`
  - `describe('TIPOS_REGISTRO_FABRICA')`:
    - contiene exactamente 12 elementos
    - exactamente 11 con `naturaleza = INVERSION`
    - exactamente 1 con `naturaleza = CANTIDAD` y `nombre = 'Mortalidad'`
    - todos tienen `esSistema = true`
    - no hay nombres duplicados en la lista
    - todos los nombres esperados están presentes (lista: Compra de pollitos, Alimento, Alquiler Galpón, Mantenimiento Galpón, Vacunas, Veterinario, Mano de Obra, Chala, Garrafas, Agua y Luz, Otros gastos, Mortalidad)
  - Ejecutar: `cd backend && pnpm exec jest src/granja/seed/tipos-registro-fabrica.spec.ts` → **RED**

- [ ] **S3.2** `[impl]` GREEN — Crear `backend/src/granja/seed/tipos-registro-fabrica.ts`
  - `export const TIPOS_REGISTRO_FABRICA: readonly TipoRegistroSeedRow[]` con los 12 tipos (ver design.md §8)
  - Sin imports de NestJS ni Prisma — es solo datos puros
  - Ejecutar: verde

### S3-B — Adapter `PrismaLoteRepository`

- [ ] **S3.3** `[test]` RED — `backend/src/granja/adapters/prisma-lote.repository.integration.spec.ts`
  - **Recordatorio G-1**: requiere Postgres, `DATABASE_URL` inline
  - Setup: `beforeEach` crea org de test, `afterEach` limpia con `prisma.lote.deleteMany`
  - `describe('PrismaLoteRepository')`:
    - `create`: persiste el lote y filtra por `organizationId`
    - `findById`: retorna null si no existe; retorna null si es de otra org (**multi-tenant G-7**)
    - `listar`: solo lotes de la org; filtra por `estado` correctamente
    - `update`: actualiza campos mutables; NO acepta `cantidadInicial` en `LoteUpdateData`
    - `cerrar`: setea `estado = CERRADO` + `fechaCierre`
    - multi-tenant: `listar` con dos orgs distintas devuelve solo los de la org pedida
  - Ejecutar: → **RED**

- [ ] **S3.4** `[impl]` GREEN — Crear `backend/src/granja/adapters/prisma-lote.repository.ts`
  - Implementa `LoteRepositoryPort`
  - Toda query filtra por `organizationId` (**G-7**)
  - Mapea row Prisma → entidad `Lote` con `Lote.rehidratar`
  - `update` NO incluye `cantidadInicial` en el objeto `data` de Prisma (inmutable)
  - `cerrar`: `prisma.lote.update({ where: { id, organizationId }, data: { estado: 'CERRADO', fechaCierre } })`
  - Ejecutar: verde

### S3-C — Adapter `PrismaTipoRegistroRepository` + seeder

- [ ] **S3.5** `[test]` RED — `backend/src/granja/adapters/prisma-tipo-registro.repository.integration.spec.ts`
  - `describe('PrismaTipoRegistroRepository')`:
    - `create`: unicidad `(organizationId, nombre)` — doble create con mismo nombre lanza conflicto
    - `findByNombre`: retorna null si no existe, o el tipo si existe
    - `listar`: filtros por `naturaleza` y `activo`; aislamiento multi-tenant
    - `setActivo`: toggle funciona
    - `countMovimientos`: cuenta movimientos asociados (0 si sin movimientos)
    - `eliminar`: elimina si no tiene movimientos
    - `upsertSeed` (idempotencia): primera vez crea 12 tipos; segunda vez no duplica
    - `upsertSeed` con org "A" y org "B": cada una tiene sus propios 12 tipos
  - Ejecutar: → **RED**

- [ ] **S3.6** `[impl]` GREEN — Crear `backend/src/granja/adapters/prisma-tipo-registro.repository.ts`
  - Implementa `TipoRegistroRepositoryPort`
  - `upsertSeed`: `prisma.tipoRegistro.upsert({ where: { organizationId_nombre: { organizationId, nombre } }, create: { ...seed }, update: {} })` para cada tipo de la lista — `update: {}` es el no-op del upsert idempotente
  - Toda query filtra `organizationId` (**G-7**)
  - Ejecutar: verde

- [ ] **S3.7** `[test]` RED — `backend/src/granja/adapters/prisma-tipo-registro-seeder.adapter.spec.ts`
  - Unit test (mock del repo): `seedDefaultsForTenant` llama a `upsertSeed` con los 12 tipos de fábrica
  - Ejecutar: → **RED**

- [ ] **S3.8** `[impl]` GREEN — Crear `backend/src/granja/adapters/prisma-tipo-registro-seeder.adapter.ts`
  - Implementa `TipoRegistroSeederPort`
  - `seedDefaultsForTenant(organizationId, tx?)`: llama `tipoRegistroRepo.upsertSeed(organizationId, TIPOS_REGISTRO_FABRICA, tx)`
  - Ejecutar: verde

### S3-D — Services CRUD base (sin derivados aún)

- [ ] **S3.9** `[test]` RED — `backend/src/granja/lote.service.spec.ts`
  - Unit test con mocks de `LoteRepositoryPort` y `ClockPort`
  - `describe('LoteService.create')`:
    - llama al repo; `cantidadInicial` queda en el lote
    - no toca el reloj al crear
  - `describe('LoteService.update')`:
    - campo `cantidadInicial` en el PATCH → lanza `CantidadInicialInmutableError` (400)
    - lote CERRADO + PATCH → lanza `LoteCerradoNoEditableError` (422)
    - campos mutables → delega al repo
  - `describe('LoteService.cerrar')`:
    - lote ACTIVO → delega al repo con `fechaCierre = ClockPort.hoyEnLaPaz()`
    - lote CERRADO → lanza `LoteYaCerradoError` (422)
    - lote de otra org → lanza `LoteNoEncontradoError` (404)
  - Ejecutar: `cd backend && pnpm exec jest src/granja/lote.service.spec.ts` → **RED**

- [ ] **S3.10** `[impl]` GREEN — Crear `backend/src/granja/lote.service.ts`
  - Inyecta `LoteRepositoryPort` y `ClockPort`
  - `update`: si `dto.cantidadInicial !== undefined` lanza `CantidadInicialInmutableError`; verifica lote ACTIVO antes de delegar
  - `cerrar`: llama `lote.assertAdmiteMovimientos()` o verifica `lote.estaActivo`; usa `ClockPort.hoyEnLaPaz()` para `fechaCierre`; lanza `LoteYaCerradoError` si ya cerrado
  - Ejecutar: verde

- [ ] **S3.11** `[test]` RED — `backend/src/granja/tipo-registro.service.spec.ts`
  - `describe('TipoRegistroService.create')`:
    - pre-check `findByNombre` → si existe lanza `TipoRegistroNombreDuplicadoError` (409)
    - si no existe, crea con `esSistema = false`
  - `describe('TipoRegistroService.update')`:
    - tipo sistema → intento de cambiar `nombre` lanza `TipoRegistroSistemaNoEditableError`
    - intento de cambiar `naturaleza` → lanza `TipoRegistroNaturalezaInmutableError`
    - toggle `activo` en tipo sistema → permitido
  - `describe('TipoRegistroService.eliminar')`:
    - `esSistema = true` → lanza `TipoRegistroSistemaNoEliminableError` (409)
    - `countMovimientos > 0` → lanza `TipoRegistroConMovimientosError` (409)
    - tipo propio sin movimientos → elimina
  - Ejecutar: `cd backend && pnpm exec jest src/granja/tipo-registro.service.spec.ts` → **RED**

- [ ] **S3.12** `[impl]` GREEN — Crear `backend/src/granja/tipo-registro.service.ts`
  - Inyecta `TipoRegistroRepositoryPort`
  - Implementa toda la lógica de protección de tipos sistema y unicidad de nombre
  - Ejecutar: verde

### S3-E — Wiring base del módulo

- [ ] **S3.13** Crear `backend/src/granja/granja.module.ts` (versión base, sin controllers aún)
  - Providers: los adapters registrados contra sus tokens Symbol (`useClass`)
  - `provide: LOTE_REPOSITORY_PORT, useClass: PrismaLoteRepository`
  - Ídem para los demás ports
  - Exports: `TIPO_REGISTRO_SEEDER_PORT` (lo consumirá `TenantsModule` en S5)
  - No declara controllers todavía (se agregan en S5)

- [ ] **S3.14** Typecheck + lint + suite S3
  - `cd backend && pnpm exec tsc --noEmit -p tsconfig.json` → 0 errores
  - `cd backend && pnpm run lint` → 0 errores
  - `cd backend && pnpm exec jest src/granja/` → verde (unit + integración adapters)

- [ ] **S3.15** Commit
  - `feat(granja): adapters Prisma + CRUD services (lotes, tipos-registro, seed fabrica)`

---

## Slice 4 — Movimientos + read-model (la joya)

> Branch: `feat/granja-movimientos-readmodel`. 1 PR. TDD estricto.
> Depende de: S3 completo. Es el slice más complejo — lock pesimista + batch read-model.

### S4-A — Adapter de movimientos

- [ ] **S4.1** `[test]` RED — `backend/src/granja/adapters/prisma-movimiento.repository.integration.spec.ts`
  - `describe('PrismaMovimientoRepository')`:
    - `createInversion`: persiste; `organizationId` denormalizado desde el lote
    - `createCantidad`: ídem
    - `listInversionByLote`: solo inversiones del lote, filtradas por `organizationId` (**G-7**)
    - `listCantidadByLote`: ídem
    - `sumCantidadByLote`: suma correctamente (0 si sin movimientos; suma si hay varios)
    - `eliminarInversion`: elimina solo el movimiento correcto de la org correcta
    - multi-tenant: operaciones sobre lote de otra org devuelven vacío/0
  - Ejecutar: → **RED**

- [ ] **S4.2** `[impl]` GREEN — Crear `backend/src/granja/adapters/prisma-movimiento.repository.ts`
  - Implementa `MovimientoRepositoryPort`
  - `sumCantidadByLote`: `prisma.movimientoCantidad.aggregate({ where: { organizationId, loteId }, _sum: { cantidad: true } })` — devuelve `_sum.cantidad ?? 0`
  - Toda query filtra `organizationId` (**G-7**)
  - Ejecutar: verde

- [ ] **S4.3** `[test]` RED — test de `findByIdForUpdate` en el mismo spec de integración
  - `describe('findByIdForUpdate')`:
    - retorna el lote con lock (dentro de una TX simulada)
    - retorna null si el lote es de otra org (**G-7**)
    - la query raw usa parámetros, no interpolación de strings (**G-8**)
  - Ejecutar: → **RED**

- [ ] **S4.4** `[impl]` GREEN — Implementar `LoteRepositoryPort.findByIdForUpdate` en `prisma-lote.repository.ts`
  - Usa `tx.$queryRaw<Array<{id: string; cantidadInicial: number; estado: string}>>\`SELECT id, "cantidadInicial", estado, ... FROM lotes WHERE id = ${id} AND "organizationId" = ${organizationId} FOR UPDATE\``
  - Mapea el resultado a `Lote` con `Lote.rehidratar` si existe, `null` si vacío
  - **G-8**: sin interpolación de strings — solo tagged template literals de `$queryRaw` con parámetros posicionales
  - Ejecutar: verde

### S4-B — Read-model batch (`LoteResumenReader`)

- [ ] **S4.5** `[test]` RED — `backend/src/granja/adapters/prisma-lote-resumen.reader.integration.spec.ts`
  - `describe('PrismaLoteResumenReader.agregadosPorLotes')`:
    - lotes sin movimientos → `{ totalMuertes: 0, costoAcumulado: '0' }` para cada uno
    - lote con 3 inversiones → `costoAcumulado` correcto
    - lote con 2 movimientos cantidad → `totalMuertes` correcto
    - N lotes → usa exactamente 2 queries (no N×2) — verificable con spy o explicado en comentario del test
    - multi-tenant: solo agrega movimientos de la org pedida
  - `describe('PrismaLoteResumenReader.desgloseCostoPorTipo')`:
    - lote con inversiones de 3 tipos → desglose con subtotal por tipo
    - lote sin inversiones → lista vacía
  - Ejecutar: → **RED**

- [ ] **S4.6** `[impl]` GREEN — Crear `backend/src/granja/adapters/prisma-lote-resumen.reader.ts`
  - Implementa `LoteResumenReaderPort`
  - `agregadosPorLotes`: 2 queries groupBy (`_sum`) con `loteId: { in: loteIds }` — ver design.md §6
  - Construye `Map<loteId, AgregadosLote>` mergeando los dos resultados; lotes sin movimientos → valores por defecto `{ totalMuertes: 0, costoAcumulado: '0' }`
  - `desgloseCostoPorTipo`: groupBy `tipoRegistroId` con join para `tipoNombre`
  - Toda query filtra `organizationId` (**G-7**)
  - Ejecutar: verde

### S4-C — MovimientoService (la lógica de negocio + invariante)

- [ ] **S4.7** `[test]` RED — `backend/src/granja/movimiento.service.spec.ts`
  - Unit test con mocks de todos los ports
  - `describe('MovimientoService.registrarInversion')`:
    - lote CERRADO → lanza `LoteCerradoError`
    - tipo no existe → lanza `TipoRegistroNoEncontradoError`
    - tipo inactivo → lanza `TipoRegistroInactivoError`
    - tipo con naturaleza CANTIDAD → lanza `TipoRegistroNaturalezaInvalidaError`
    - caso feliz → crea el movimiento
    - `monto = 0` → lanza `MontoInvalidoError` (la entidad lo valida antes de llegar al repo)
  - `describe('MovimientoService.registrarCantidad')`:
    - lote CERRADO → lanza `LoteCerradoError`
    - tipo naturaleza INVERSION → lanza `TipoRegistroNaturalezaInvalidaError`
    - `cantidad > avesVivas` → lanza `MovimientoCantidadExcedeVivasError`
    - `cantidad == avesVivas` → acepta (avesVivas queda en 0)
    - `cantidad = 0` → lanza `CantidadInvalidaError`
    - `organizationId` del lote ≠ del tipo → lanza `TipoRegistroNoEncontradoError`
  - `describe('MovimientoService.eliminarInversion')`:
    - lote CERRADO → lanza `LoteCerradoError` (spec: no se borran movimientos en lote cerrado)
    - movimiento de otra org → lanza `MovimientoNoEncontradoError`
  - Ejecutar: `cd backend && pnpm exec jest src/granja/movimiento.service.spec.ts` → **RED**

- [ ] **S4.8** `[impl]` GREEN — Crear `backend/src/granja/movimiento.service.ts`
  - Inyecta `LoteRepositoryPort`, `TipoRegistroRepositoryPort`, `MovimientoRepositoryPort`, `PrismaService`
  - `registrarCantidad`: implementa la TX con `SELECT FOR UPDATE` (ver design.md §7):
    ```
    prisma.$transaction(async (tx) => {
      const lote = await loteRepo.findByIdForUpdate(organizationId, loteId, tx);  // FOR UPDATE
      if (!lote) throw new LoteNoEncontradoError(loteId);
      lote.assertAdmiteMovimientos();
      const tipo = await tipoRegistroRepo.findById(organizationId, tipoRegistroId, tx);
      // validar tipo existe, activo, naturaleza CANTIDAD
      const muertesActuales = await movimientoRepo.sumCantidadByLote(organizationId, loteId, tx);
      const avesVivas = lote.cantidadInicial - muertesActuales;
      if (cantidad > avesVivas) throw new MovimientoCantidadExcedeVivasError(loteId, avesVivas, cantidad);
      return movimientoRepo.createCantidad(organizationId, { ... }, tx);
    })
    ```
  - `registrarInversion`: sin FOR UPDATE — solo valida lote ACTIVO + tipo INVERSION activo
  - Ejecutar: verde

### S4-D — DashboardService

- [ ] **S4.9** `[test]` RED — `backend/src/granja/dashboard.service.spec.ts`
  - Unit test con mocks de `LoteRepositoryPort`, `LoteResumenReaderPort`, `ClockPort`
  - `describe('DashboardService.lotesActivosConResumen')`:
    - sin lotes activos → retorna `[]`
    - 3 lotes activos → retorna 3 ítems con `ResumenLote` calculado
    - lote cerrado → no aparece en el resultado
    - calcula `edadDias` usando `ClockPort.hoyEnLaPaz()` (no `new Date()`) (**G-6**)
    - pasa el `loteId` correcto al reader (batch, no N loops)
  - Ejecutar: `cd backend && pnpm exec jest src/granja/dashboard.service.spec.ts` → **RED**

- [ ] **S4.10** `[impl]` GREEN — Crear `backend/src/granja/dashboard.service.ts`
  - Implementa el patrón 3-queries (ver design.md §6):
    1. `loteRepo.listar(organizationId, { estado: ACTIVO })` (1 query)
    2. `reader.agregadosPorLotes(organizationId, loteIds)` (2 queries batch)
    3. `lotes.map(l => ResumenLote.calcular(...))` (puro, en memoria)
  - `edadDias` usa `clockPort.hoyEnLaPaz()` — NO `new Date()` (**G-6**)
  - Ejecutar: verde

- [ ] **S4.11** Agregar `PrismaLoteResumenReader` y `PrismaMovimientoRepository` a `granja.module.ts` (providers)
  - `provide: LOTE_RESUMEN_READER_PORT, useClass: PrismaLoteResumenReader`
  - `provide: MOVIMIENTO_REPOSITORY_PORT, useClass: PrismaMovimientoRepository`

- [ ] **S4.12** `[test]` RED — test de concurrencia en integration spec (spec: granja-movimientos Scenario: Concurrencia)
  - Crear test de concurrencia en `prisma-movimiento.repository.integration.spec.ts` o en un spec dedicado
  - `describe('invariante avesVivas >= 0 bajo concurrencia')`:
    - GIVEN lote con `cantidadInicial = 100`, `avesVivas = 10`
    - WHEN dos requests concurrentes intentan registrar `cantidad = 8`
    - THEN uno tiene éxito (avesVivas queda 2) y el otro falla con `MovimientoCantidadExcedeVivasError`; el estado final nunca negativo
    - Usa `Promise.all` con dos llamadas simultáneas al `movimientoService.registrarCantidad`
  - Ejecutar: → **RED**

- [ ] **S4.13** `[impl]` GREEN — verificar que el `FOR UPDATE` en el lote serializa correctamente
  - El test anterior pasa gracias al lock en `findByIdForUpdate` + la TX
  - Ejecutar: verde

- [ ] **S4.14** Typecheck + lint + suite S4

- [ ] **S4.15** `cd backend && pnpm exec jest src/granja/` → todos los tests verdes (unit + integración)

- [ ] **S4.16** Commit
  - `feat(granja): movimientos con FOR UPDATE, read-model batch costo-pollo`

---

## Slice 5 — Controllers + DTOs + RBAC + seed wiring

> Branch: `feat/granja-controllers-rbac`. 1 PR.
> Depende de: S4 completo.

### S5-A — DTOs

- [ ] **S5.1** `[impl]` Crear todos los DTOs en `backend/src/granja/dto/`
  - `create-lote.dto.ts`: `cantidadInicial @IsInt @Min(1)`, `fechaIngreso @IsDateString`, `nombre @IsOptional @IsString @MaxLength(120)`, `galpon @IsOptional @IsString`, `fechaEstimadaSaca @IsOptional @IsDateString`, `detalle @IsOptional @IsString`
  - `update-lote.dto.ts`: todos opcionales **excepto** que NO incluye `cantidadInicial` (inmutable — omitir el campo del DTO)
  - `lote-response.dto.ts`: incluye campos del lote + `resumen` con derivados (`avesVivas`, `costoAcumulado: string`, `costoPorPolloVivo: string | null`, `edadDias`, `porcentajeMortalidad`)
  - `lote-dashboard-response.dto.ts`: versión compacta para el dashboard
  - `create-tipo-registro.dto.ts`: `nombre @IsString @MinLength(1) @MaxLength(100)`, `naturaleza @IsEnum(NaturalezaRegistro)`
  - `update-tipo-registro.dto.ts`: `nombre @IsOptional`, `activo @IsOptional @IsBoolean`
  - `tipo-registro-response.dto.ts`
  - `create-movimiento-inversion.dto.ts`: `monto @IsString @Matches(/^\d+(\.\d{1,2})?$/)`, `fecha @IsDateString`, `tipoRegistroId @IsUUID`, `detalle @IsOptional @IsString @MaxLength(500)` (**G-6** §4.5 — monto como string)
  - `create-movimiento-cantidad.dto.ts`: `cantidad @IsInt @Min(1)`, `fecha @IsDateString`, `tipoRegistroId @IsUUID`, `detalle @IsOptional @IsString @MaxLength(500)`
  - `movimiento-response.dto.ts`

### S5-B — Controllers

- [ ] **S5.2** `[impl]` Crear `backend/src/granja/lotes.controller.ts`
  - `@Controller('granja/lotes')`, `@UseGuards(JwtAuthGuard, ModuleEnabledGuard, PermissionsGuard)`, `@RequireModule('granja')`
  - `resolveTenantId(req)` igual que `tipos-documento-fisico.controller.ts`
  - Endpoints: `POST /` (`@RequirePermissions('granja.lotes.create')`), `GET /` (read), `GET /:id` (read), `PATCH /:id` (update + rejecting cantidadInicial), `POST /:id/cerrar` (update), `POST /:id/movimientos/inversion` (movimientos.create), `POST /:id/movimientos/cantidad` (movimientos.create), `GET /:id/movimientos` (movimientos.read), `DELETE /:id/movimientos/inversion/:movId` (movimientos.delete), `DELETE /:id/movimientos/cantidad/:movId` (movimientos.delete)

- [ ] **S5.3** `[impl]` Crear `backend/src/granja/tipos-registro.controller.ts`
  - `@Controller('granja/tipos-registro')`, guards + `@RequireModule('granja')`
  - Endpoints: `GET /` (read), `POST /` (create), `PATCH /:id` (update), `DELETE /:id` (delete)

- [ ] **S5.4** `[impl]` Crear `backend/src/granja/dashboard.controller.ts`
  - `@Controller('granja/dashboard')`, guards + `@RequireModule('granja')`
  - `GET /` → `@RequirePermissions('granja.dashboard.read')` → `dashboardService.lotesActivosConResumen`

### S5-C — Seed wiring en TenantsService

- [ ] **S5.5** Actualizar `backend/src/granja/granja.module.ts` — agregar controllers y exportar seeder port
  - Agregar los 3 controllers a `controllers: [...]`
  - Confirmar `exports: [TIPO_REGISTRO_SEEDER_PORT]` (para que `TenantsModule` lo consuma)
  - `GranjaModule` importa `PrismaModule`, `CacheModule`, `ClockModule` (ver dependencias de los services)

- [ ] **S5.6** `[test]` RED — test en `backend/src/tenants/tenants.service.spec.ts` (extender)
  - `describe('updateFeatures — seed granja')`:
    - transición OFF→ON (`granjaEnabled: false → true`) → llama a `tipoRegistroSeeder.seedDefaultsForTenant`
    - ON→ON (re-activar) → también llama al seeder (idempotente, el seeder no duplica)
    - ON→OFF → NO llama al seeder
    - activar granja con `contabilidadEnabled = true` → lanza `VerticalNoExclusivoError` y NO llama al seeder
  - `describe('create — branch GRANJA')`:
    - crear org con `ModuloOrganizacion.GRANJA` → llama `tipoRegistroSeeder.seedDefaultsForTenant(org.id, tx)` dentro de la TX
  - Ejecutar: → **RED**

- [ ] **S5.7** `[impl]` GREEN — Modificar `backend/src/tenants/tenants.service.ts`
  - Inyectar `@Inject(TIPO_REGISTRO_SEEDER_PORT) private readonly tipoRegistroSeeder: TipoRegistroSeederPort`
  - En `updateFeatures`: tras la actualización exitosa, si `granjaEnabled && !current.granjaEnabled` (OFF→ON) → `await this.tipoRegistroSeeder.seedDefaultsForTenant(tenantId)` (sin TX — ver design.md §8)
  - En `create`: reemplazar el placeholder branch GRANJA (`tenants.service.ts:93-95`) por `await this.tipoRegistroSeeder.seedDefaultsForTenant(org.id, tx)` (dentro de la TX)
  - **Recordatorio G-4**: `grep "tipoRegistroSeeder" backend/src/tenants/tenants.service.ts`
  - Ejecutar: verde

- [ ] **S5.8** Modificar `backend/src/tenants/tenants.module.ts`
  - Agregar `GranjaModule` al array `imports`
  - **Recordatorio G-4**: `grep "GranjaModule" backend/src/tenants/tenants.module.ts`

### S5-D — E2E multi-tenant + gating

- [ ] **S5.9** `[test]` RED — Crear `backend/test/granja.e2e-spec.ts`
  - Bootstrap `AppModule`, setup fixtures de 2 orgs (A con granja, B sin granja)
  - Cubre spec granja-rbac-activacion + aislamiento multi-tenant:
  - `describe('Module gating — granja')`:
    - org con `granjaEnabled = false` → `GET /api/granja/dashboard` → 404
    - org con `granjaEnabled = true` + permiso → 200
    - sin permiso `granja.lotes.create` → `POST /api/granja/lotes` → 403
    - `POST /api/granja/lotes/:id/cerrar` sin `granja.lotes.update` → 403
  - `describe('Aislamiento multi-tenant — lotes')`:
    - usuario org A no puede ver lote de org B → 404
    - usuario org A no puede editar lote de org B → 404
    - usuario org A no puede registrar movimiento en lote de org B → 404
    - usuario org A no puede usar TipoRegistro de org B → 404
  - `describe('cantidadInicial inmutable')`:
    - `PATCH /lotes/:id` con `cantidadInicial` → error `GRANJA_LOTE_CANTIDAD_INICIAL_INMUTABLE`
  - `describe('invariante avesVivas')`:
    - mortalidad que excede avesVivas → 422 `GRANJA_MOVIMIENTO_CANTIDAD_EXCEDE_VIVAS`
  - `describe('Seed al activar granja')`:
    - activar granja en org elegible → `GET /api/granja/tipos-registro` devuelve 12 tipos
    - re-activar → sigue siendo 12 (idempotente)
  - **Recordatorio G-1**: `DATABASE_URL` + `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET` inline; `--runInBand --forceExit`
  - Ejecutar: `cd backend && DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/granja.e2e-spec.ts --runInBand --forceExit` → **RED**

- [ ] **S5.10** GREEN — verificar que todos los e2e pasen con los controllers + wiring del seed implementados
  - Ejecutar: → **GREEN**

- [ ] **S5.11** Registrar `GranjaModule` en `backend/src/app.module.ts`
  - **Recordatorio G-4**: `grep "GranjaModule" backend/src/app.module.ts`

- [ ] **S5.12** Typecheck + lint + suite completa backend
  - `cd backend && pnpm exec tsc --noEmit -p tsconfig.json` → 0 errores
  - `cd backend && pnpm run lint` → 0 errores
  - `cd backend && DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" pnpm exec jest test/ --runInBand --forceExit` → verde

- [ ] **S5.13** `cd backend && pnpm exec jest src/granja/` → suite granja completa verde

- [ ] **S5.14** `cd backend && DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saas" pnpm exec jest src/tenants/` → suite tenants verde (cubre el seed wiring)

- [ ] **S5.15** Verificar los 15 endpoints en Swagger (`GET /api/docs`) o con curl: cada ruta responde correctamente con el guard de módulo

- [ ] **S5.16** Commit
  - `feat(granja): controllers, DTOs, RBAC gating, seed wiring on vertical activation`

- [ ] **S5.17** Cerrar 3 verificaciones de integridad finales del backend:
  - `grep -r "organizationId" backend/src/granja/adapters/` → cada adapter menciona `organizationId` en sus queries (defense in depth **G-7**)
  - `grep -r "new Date()" backend/src/granja/` → 0 resultados (prohibido en domain/services **G-6**)
  - `grep -r ": any" backend/src/granja/` → 0 resultados (**G-6** §2.5)

- [ ] **S5.18** PR description incluye Qué/Por qué/Cómo probar (§9.4 CLAUDE.md)

---

## Slice 6 — Frontend mobile-first

> Branch: `feat/granja-frontend`. 1 PR.
> Depende de: S5 completo (todos los endpoints funcionando).
> Mobile-first estricto: base 375px, tap targets ≥ 44px, `text-base` en inputs, costo/pollo como dato más prominente.

### S6-A — PERMISSIONS.granja (PRIMERO, antes de cualquier componente)

- [ ] **S6.1** `[test]` RED — test en `frontend/src/lib/permissions.test.ts` (crear si no existe)
  - `describe('PERMISSIONS.granja')`:
    - `PERMISSIONS.granja.dashboard.read === 'granja.dashboard.read'`
    - `PERMISSIONS.granja.lotes.create === 'granja.lotes.create'`
    - `PERMISSIONS.granja.tiposRegistro.read === 'granja.tipos-registro.read'` (**G-9** ojo: camel vs kebab)
    - `PERMISSIONS.granja.tiposRegistro.update === 'granja.tipos-registro.update'`
    - `PERMISSIONS.granja.movimientos.create === 'granja.movimientos.create'`
  - Ejecutar: `cd frontend && pnpm exec vitest run src/lib/permissions.test.ts` → **RED**

- [ ] **S6.2** `[impl]` GREEN — Agregar bloque `granja` a `frontend/src/lib/permissions.ts`
  - Copiar el bloque exacto del design.md §11 (con `tiposRegistro` camel → string `granja.tipos-registro.*`)
  - **G-9**: `tiposRegistro: { read: 'granja.tipos-registro.read', create: 'granja.tipos-registro.create', update: 'granja.tipos-registro.update', delete: 'granja.tipos-registro.delete' }`
  - Ejecutar: verde
  - `cd frontend && pnpm exec tsc -b` → 0 errores (**G-2**)

### S6-B — API layer

- [ ] **S6.3** `[impl]` Crear `frontend/src/features/granja/api/granja.api.ts`
  - Funciones de fetching para los 15 endpoints (getDashboard, createLote, getLotes, getLote, updateLote, cerrarLote, getTiposRegistro, createTipoRegistro, updateTipoRegistro, deleteTipoRegistro, createMovimientoInversion, createMovimientoCantidad, getMovimientos, deleteMovimientoInversion, deleteMovimientoCantidad)
  - Tipos TS para requests/responses en `frontend/src/features/granja/api/granja.types.ts`
  - `monto` como `string` en requests; `costoAcumulado`/`costoPorPolloVivo` como `string | null` en responses

- [ ] **S6.4** `[test]` RED + `[impl]` GREEN — tests de la lógica pura en `frontend/src/features/granja/lib/`
  - `describe('formatCostoPorPollo')`: `null` → `"—"`, `"15.31"` → `"Bs 15.31"`
  - `describe('formatPorcentajeMortalidad')`: `0.0512` → `"5.12%"`
  - Ejecutar: → RED → implementar → GREEN

### S6-C — Hooks

- [ ] **S6.5** `[impl]` Crear hooks en `frontend/src/features/granja/hooks/`
  - `useDashboard()` — `useQuery` con `queryKey: ['granja-dashboard', activeTenantId]`
  - `useLotes(estado?)` — `useQuery` con `queryKey: ['granja-lotes', activeTenantId, estado]`
  - `useLote(id)` — `useQuery` con `queryKey: ['granja-lote', activeTenantId, id]`
  - `useTiposRegistro(naturaleza?)` — `useQuery`
  - `useMovimientos(loteId)` — `useQuery`
  - Mutations: `useCreateLote`, `useUpdateLote`, `useCerrarLote`, `useCreateTipoRegistro`, `useUpdateTipoRegistro`, `useDeleteTipoRegistro`, `useCreateMovimientoInversion`, `useCreateMovimientoCantidad`, `useDeleteMovimiento`
  - `enabled: Boolean(activeTenantId)` en todos

### S6-D — Schemas Zod (validación de forms)

- [ ] **S6.6** `[impl]` Crear `frontend/src/features/granja/schemas/`
  - `lote.schema.ts`: `cantidadInicial` min(1) int, `fechaIngreso` date string
  - `tipo-registro.schema.ts`: `nombre` min(1) max(100), `naturaleza` enum
  - `movimiento-inversion.schema.ts`: `monto` regex `/^\d+(\.\d{1,2})?$/`, `fecha` date, `tipoRegistroId` uuid, `detalle` optional max(500)
  - `movimiento-cantidad.schema.ts`: `cantidad` int min(1), `fecha` date, `tipoRegistroId` uuid, `detalle` optional max(500)
  - Mensajes de error en español

### S6-E — Componentes

- [ ] **S6.7** `[test]` RED — `frontend/src/features/granja/components/costo-por-pollo-card.test.tsx`
  - `describe('CostoPorPolloCard')`:
    - `costoPorPolloVivo = "15.31"` → muestra `Bs 15.31` como dato prominente
    - `costoPorPolloVivo = null` → muestra "—"
    - `avesVivas = 0` y costo alto → muestra mortalidad total con estilo visual diferente

- [ ] **S6.8** `[impl]` GREEN — Crear `frontend/src/features/granja/components/costo-por-pollo-card.tsx`
  - Mobile-first: costo/pollo como texto grande prominente (el norte del módulo)
  - Tap target ≥ 44px en acciones

- [ ] **S6.9** `[test]` RED — `frontend/src/features/granja/components/lote-card.test.tsx`
  - `describe('LoteCard')`:
    - muestra nombre, galpón, edad en días, aves vivas, porcentaje mortalidad, costo/pollo
    - `<PermissionButton>` "Registrar movimiento" solo visible con `granja.movimientos.create`
    - `<PermissionButton>` "Cerrar lote" solo visible con `granja.lotes.update`
    - lote CERRADO → no muestra botones de acción

- [ ] **S6.10** `[impl]` GREEN — Crear `frontend/src/features/granja/components/lote-card.tsx`
  - Usa `<Can permission={PERMISSIONS.granja.movimientos.create}>` para acciones
  - Mobile-first

- [ ] **S6.11** `[test]` RED + `[impl]` GREEN — form de crear/editar lote
  - `frontend/src/features/granja/components/lote-form.tsx`
  - RHF + Zod (`lote.schema.ts`)
  - `cantidadInicial` deshabilitado en modo edición (NO en el form de creación)
  - Mensajes de error en español

- [ ] **S6.12** `[test]` RED + `[impl]` GREEN — form de movimiento inversión
  - `frontend/src/features/granja/components/movimiento-inversion-form.tsx`
  - `monto` como input text (no number), validación del patrón `/^\d+(\.\d{1,2})?$/`
  - Selector de TipoRegistro filtrado por `naturaleza = INVERSION`

- [ ] **S6.13** `[test]` RED + `[impl]` GREEN — form de movimiento cantidad
  - `frontend/src/features/granja/components/movimiento-cantidad-form.tsx`
  - `cantidad` como input numérico int, min 1
  - Selector de TipoRegistro filtrado por `naturaleza = CANTIDAD`

### S6-F — Páginas

- [ ] **S6.14** `[impl]` Crear `frontend/src/features/granja/pages/dashboard-page.tsx`
  - Grid de `LoteCard` de lotes activos, mobile-first
  - Gating: `<RequirePermission permission={PERMISSIONS.granja.dashboard.read}>`
  - Empty state amigable

- [ ] **S6.15** `[impl]` Crear `frontend/src/features/granja/pages/lotes-page.tsx`
  - Listado con filtro por estado (ACTIVO/CERRADO/todos)
  - `<Can permission={PERMISSIONS.granja.lotes.create}>` para el botón "Nuevo lote"
  - Gating: `<RequirePermission permission={PERMISSIONS.granja.lotes.read}>`

- [ ] **S6.16** `[impl]` Crear `frontend/src/features/granja/pages/lote-detail-page.tsx`
  - Resumen del lote + desglose de costos por tipo + % mortalidad + edad + aves vivas + costo/pollo
  - Tabs o secciones para inversiones y cantidades
  - Formularios de registro de movimiento (inline o modal)
  - Botón "Cerrar lote" con confirmación

- [ ] **S6.17** `[impl]` Crear `frontend/src/features/granja/pages/tipos-registro-page.tsx`
  - Lista separada por naturaleza (INVERSION / CANTIDAD)
  - `<Can>` para crear/editar/eliminar según permisos
  - Toggle de `activo`

### S6-G — Routing y navegación

- [ ] **S6.18** Agregar rutas granja en el router de frontend
  - `/granja` → `DashboardPage`
  - `/granja/lotes` → `LotesPage`
  - `/granja/lotes/:id` → `LoteDetailPage`
  - `/granja/tipos-registro` → `TiposRegistroPage`
  - Todas con `<RequirePermission>` apropiado

- [ ] **S6.19** Agregar ítems de navegación para granja en `NAV_ITEMS`
  - "Dashboard" con `requiredPermission: PERMISSIONS.granja.dashboard.read`
  - "Mis Lotes" con `requiredPermission: PERMISSIONS.granja.lotes.read`
  - "Tipos de Registro" con `requiredPermission: PERMISSIONS.granja.tiposRegistro.read`
  - Solo visibles cuando el módulo granja está habilitado (condicionar por `granjaEnabled` del org store o equivalente)

### S6-H — Verificación final frontend

- [ ] **S6.20** `cd frontend && pnpm exec tsc -b` → 0 errores (**G-2**)

- [ ] **S6.21** `cd frontend && pnpm exec vitest run src/features/granja/` → todos los tests verdes

- [ ] **S6.22** Commit
  - `feat(granja): frontend mobile-first (dashboard, lotes, movimientos, tipos-registro)`

---

## Slice 7 — Toggle de activación del vertical en UI

> Branch: `feat/granja-toggle-activacion`. 1 PR. No bloquea el núcleo (P8).
> Depende de: S6 completo.

- [ ] **S7.1** `[test]` RED — `frontend/src/features/granja/components/toggle-vertical-granja.test.tsx`
  - `describe('ToggleVerticalGranja')`:
    - `granjaEnabled = false` → muestra botón "Activar Granja" (con `<PermissionButton>` para `organizacion.features.update` o equivalente)
    - `granjaEnabled = true` → muestra estado activo, botón "Desactivar"
    - al activar con `contabilidadEnabled = true` → muestra `VerticalNoExclusivoError` amigable en español ("Esta organización ya tiene el módulo de Contabilidad activo. Los módulos son exclusivos.")
    - al activar con éxito → muestra confirmación y el listado granja pasa a ser accesible
  - Ejecutar: → **RED**

- [ ] **S7.2** `[impl]` GREEN — Crear `frontend/src/features/granja/components/toggle-vertical-granja.tsx`
  - Llama a `PATCH /api/tenants/:id/features` con `{ granjaEnabled: true/false }`
  - Maneja `VerticalNoExclusivoError` (409) con mensaje amigable en español
  - Invalida queries relevantes tras activación exitosa

- [ ] **S7.3** Agregar el toggle en la página de configuración de organización
  - Buscar la página/sección donde viven los features flags de la org (probablemente en `settings` o `admin`)
  - Solo visible para OWNER/ADMIN

- [ ] **S7.4** `cd frontend && pnpm exec tsc -b` → 0 errores

- [ ] **S7.5** `cd frontend && pnpm exec vitest run src/features/granja/components/toggle-vertical-granja.test.tsx` → verde

- [ ] **S7.6** Commit
  - `feat(granja): toggle UI para activar/desactivar vertical granja`

---

## Resumen de archivos nuevos/modificados

### Slice 0 (common)
- `backend/src/common/domain/money.ts` — agregar `Money.div(divisor: number): Money`
- `backend/src/common/domain/money.spec.ts` — tests de `Money.div`

### Slice 1 (db)
- `backend/prisma/schema.prisma` — sección GRANJA
- `backend/prisma/migrations/<timestamp>_granja_v1_schema/migration.sql` — incluye raw SQL CHECK
- `CLAUDE.md §11.6` — agregar `lotes_cantidad_inicial_positiva_check` a la tabla

### Slice 2 (granja domain)
- `backend/src/granja/domain/enums.ts`
- `backend/src/granja/domain/granja.errors.ts`
- `backend/src/granja/domain/lote.ts` + `lote.spec.ts`
- `backend/src/granja/domain/tipo-registro.ts` + `tipo-registro.spec.ts`
- `backend/src/granja/domain/movimiento-inversion.ts` + `movimiento-inversion.spec.ts`
- `backend/src/granja/domain/movimiento-cantidad.ts` + `movimiento-cantidad.spec.ts`
- `backend/src/granja/domain/resumen-lote.ts` + `resumen-lote.spec.ts`
- `backend/src/granja/ports/lote.repository.port.ts`
- `backend/src/granja/ports/tipo-registro.repository.port.ts`
- `backend/src/granja/ports/movimiento.repository.port.ts`
- `backend/src/granja/ports/lote-resumen.reader.port.ts`
- `backend/src/granja/ports/tipo-registro-seeder.port.ts`

### Slice 3 (granja adapters CRUD)
- `backend/src/granja/seed/tipos-registro-fabrica.ts` + `.spec.ts`
- `backend/src/granja/adapters/prisma-lote.repository.ts` + `.integration.spec.ts`
- `backend/src/granja/adapters/prisma-tipo-registro.repository.ts` + `.integration.spec.ts`
- `backend/src/granja/adapters/prisma-tipo-registro-seeder.adapter.ts` + `.spec.ts`
- `backend/src/granja/lote.service.ts` + `lote.service.spec.ts`
- `backend/src/granja/tipo-registro.service.ts` + `tipo-registro.service.spec.ts`
- `backend/src/granja/granja.module.ts` (versión base)

### Slice 4 (granja movimientos + read-model)
- `backend/src/granja/adapters/prisma-movimiento.repository.ts` + `.integration.spec.ts`
- `backend/src/granja/adapters/prisma-lote-resumen.reader.ts` + `.integration.spec.ts`
- `backend/src/granja/movimiento.service.ts` + `movimiento.service.spec.ts`
- `backend/src/granja/dashboard.service.ts` + `dashboard.service.spec.ts`
- `backend/src/granja/granja.module.ts` (actualizado con nuevos providers)

### Slice 5 (controllers + RBAC + seed wiring)
- `backend/src/granja/dto/*.ts` (10 DTOs)
- `backend/src/granja/lotes.controller.ts`
- `backend/src/granja/tipos-registro.controller.ts`
- `backend/src/granja/dashboard.controller.ts`
- `backend/src/granja/granja.module.ts` (versión final con controllers y exports)
- `backend/test/granja.e2e-spec.ts`
- `backend/src/tenants/tenants.service.ts` — seed wiring
- `backend/src/tenants/tenants.module.ts` — importar GranjaModule
- `backend/src/app.module.ts` — importar GranjaModule

### Slice 6 (frontend)
- `frontend/src/lib/permissions.ts` — bloque granja
- `frontend/src/lib/permissions.test.ts`
- `frontend/src/features/granja/api/granja.api.ts` + `granja.types.ts`
- `frontend/src/features/granja/hooks/*.ts` (12 hooks)
- `frontend/src/features/granja/schemas/*.ts` (4 schemas)
- `frontend/src/features/granja/lib/formatters.ts` + `.test.ts`
- `frontend/src/features/granja/components/*.tsx` + `.test.tsx` (al menos 7)
- `frontend/src/features/granja/pages/*.tsx` (4 páginas)
- `frontend/src/routes/router.tsx` — 4 rutas granja
- `frontend/src/components/nav-items.ts` — 3 ítems granja

### Slice 7 (toggle activación)
- `frontend/src/features/granja/components/toggle-vertical-granja.tsx` + `.test.tsx`
- Página de configuración de org (modificar) — agregar el toggle

---

## Notas de apply

- **Orden crítico de commits dentro de S0**: `Money.div` debe estar commiteado antes de que `ResumenLote.calcular` lo use en S2. Si están en la misma branch, basta con que `money.ts` esté en un commit anterior al `resumen-lote.ts`.
- **CHECK raw SQL en migration**: SIEMPRE revisar el `migration.sql` con `grep -E "^DROP"` ANTES de aplicar (§11.6 CLAUDE.md). El CHECK `lotes_cantidad_inicial_positiva_check` NO debe aparecer en ningún DROP futuro.
- **`findByIdForUpdate` con raw SQL**: usar tagged template literal de Prisma (`$queryRaw\`...\``) con parámetros posicionales — nunca concatenar strings. Ver design.md §7 para el ejemplo exacto.
- **`upsertSeed` idempotencia**: el `update: {}` en el upsert es deliberado — no sobrescribe nada si ya existe. Esto garantiza que re-activar granja no resetea los tipos que el usuario haya modificado (ej. desactivado un tipo de sistema).
- **Frontend mobile-first**: `text-base` (16px) en inputs siempre — evita el zoom automático en iOS. `min-h-[44px]` en botones y tap targets. Costo/pollo como `text-3xl` o equivalente prominente.
- **`PERMISSIONS.granja.tiposRegistro.read`** → string `'granja.tipos-registro.read'` (camel en el key TS, kebab en el string). Esta asimetría es intencional y espeja `tiposDocumento` en contabilidad. No "corregirla".
- **Spec `GRANJA_TIPO_REGISTRO_EN_USO`** vs design `GRANJA_TIPO_REGISTRO_CON_MOVIMIENTOS`: las specs llaman al error `GRANJA_TIPO_REGISTRO_EN_USO` en el scenario "Borrar tipo con movimientos". El design lo llama `TipoRegistroConMovimientosError`. Usar la clase del design (`TipoRegistroConMovimientosError`), pero asegurarse de que el `code` visible sea el que la spec menciona (`GRANJA_TIPO_REGISTRO_CON_MOVIMIENTOS` o `GRANJA_TIPO_REGISTRO_EN_USO` — decidir en S2.1 y ser consistente). Recomendado: `code: 'GRANJA_TIPO_REGISTRO_CON_MOVIMIENTOS'` porque es más descriptivo que "en uso".
- **Error `GRANJA_LOTE_CERRADO_NO_EDITABLE`**: la spec usa este código para "no se puede editar lote cerrado" y "no se puede registrar movimiento en lote cerrado". El design usa `LoteCerradoError` con `GRANJA_LOTE_CERRADO`. Unificar en S2.1: usar `LoteCerradoError` (code `GRANJA_LOTE_CERRADO`) para ambos casos (el lote está cerrado, sea para editar o para movimientos) — es la misma condición semántica.
