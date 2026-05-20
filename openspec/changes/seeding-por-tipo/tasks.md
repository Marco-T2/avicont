# Tasks: seeding-por-tipo

> Breakdown en commits atómicos. Cada checkbox = un commit. **Verde entre cada
> commit** (tsc + suite del módulo tocado). TDD estricto: spec roja → implementación
> verde → refactor.
>
> Branch: `feat/seeding-por-tipo` — squash merge contra `main`.

## Reglas globales

- Idioma de código: español dominio + inglés framework (CLAUDE.md §1).
- Verde antes de cada commit: `npx tsc --noEmit -p tsconfig.json` + `npx jest src/<modulo-tocado>/`.
- Suite E2E completa antes del commit final (Fase 6).
- TDD strict: spec falla primero, implementación verde después (Strict TDD Mode activo).
- Ports: `abstract class` + Symbol, JSDoc, superficie mínima, cross-module owner-owned (CLAUDE.md §3.7).
- Service: inyecta SOLO ports cross-module; throws DomainError; cero `any`.
- Wiring: `{ provide: PORT, useClass: Adapter }`; módulo exporta solo ports.
- Comando integración/e2e necesita `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas"` inline.
- E2E: `--runInBand --forceExit`.
- Commits: conventional inglés scope módulo (`feat(cuentas):`, `feat(tenants):`, `refactor(db):`). Squash only. NUNCA Co-Authored-By.
- Absorción 9.1 de documento-fisico: marcar al INICIO del apply (antes de tocar código).

---

## Orden de dependencias entre fases

```
Fase 0 (coordinación: absorber 9.1)
       ↓
Fase 1 (fix R1: firma comercial.ts)   ← prerequisito de TODO lo demás
       ↓
Fase 2 (port PlanCuentasSeederPort)
       ↓
Fase 3 (adapter + integration spec)
       ↓
Fase 4 (wiring cuentas.module + DTO tenants)   ← pueden ir en el mismo batch
       ↓
Fase 5 (port repo TenantRepositoryPort + adapter tenants)
       ↓
Fase 6 (service tenants: switch + TX + unit spec)
       ↓
Fase 7 (wiring tenants.module)
       ↓
Fase 8 (integration spec tenants contra Postgres)
       ↓
Fase 9 (E2E POST /tenants)
       ↓
Fase 10 (verde final)
```

---

## Fase 0 — Coordinación: absorción de documento-fisico task 9.1

> **Nota de scope Opción 1 (confirmada en apply, 2026-05-20)**: La absorción
> de la task 9.1 de `documento-fisico` queda **diferida** — el adapter
> `PrismaTiposDocumentoFisicoSeederAdapter` no existe aún. El Batch 1 construye
> el port `PlanCuentasSeederPort` + adapter + wiring, y deja el slot en el
> switch para que `documento-fisico` task 9.1 enchufe su seeder cuando esté listo.
> La task 0.1 a continuación NO se ejecuta en Batch 1; permanece pendiente.

### 0.1 - [ ] `chore(docs): mark documento-fisico task 9.1 as absorbed by seeding-por-tipo`

**Entrega**: coordinar la absorción antes de tocar código, para evitar
doble wiring del `TipoDocumentoFisicoSeederPort` entre los dos changes.

**DIFERIDO (Batch 2 / cuando adapter documento-fisico esté disponible)**: este
wiring depende del `PrismaTiposDocumentoFisicoSeederAdapter` que aún no existe.
Ver design §1 Decisión de scope Opción 1.

**Acción (cuando se reactive)**: en `openspec/changes/documento-fisico/tasks.md`,
localizar la task 9.1 y agregar una nota al inicio:

```markdown
> ⚠ ABSORBIDA — este wiring lo realiza `seeding-por-tipo` (ver
> `openspec/changes/seeding-por-tipo/tasks.md`). No implementar
> aquí para evitar doble wiring del `TipoDocumentoFisicoSeederPort`.
```

Cambiar el checkbox de la task 9.1 de `- [ ]` a `- [~]` (o un marker claro
de "absorbida por otro change").

**Archivos**:
- `openspec/changes/documento-fisico/tasks.md` — nota de absorción en task 9.1.

**Tests que se agregan**: ninguno.

**Verificación**: diff legible, sin impacto en código.

**Cubre**: Design D7, Spec REQ-SEED-02 (nota de subsunción), Risk R3 del proposal.

---

## Fase 1 — Fix R1: ampliar firma de `comercial.ts` (prerequisito de todo)

### 1.1 - [ ] `refactor(db): accept PrismaClient | TransactionClient in plan-cuentas seed functions`

**Entrega**: ampliar el tipo del parámetro `prisma` de las dos funciones de
`comercial.ts` a la unión `PrismaClient | Prisma.TransactionClient`. Sin
cambio de cuerpo. El uso CLI standalone (que pasa `new PrismaClient()`)
sigue compilando y corriendo sin modificación.

**Archivos** (modificados):
- `backend/prisma/seeds/prod/planes-cuentas/comercial.ts`
  — cambiar firmas de `sembrarPlanCuentasComercial` (línea ~321) y
  `poblarConfiguracionContableRequerida` (línea ~434) de `prisma: PrismaClient`
  a `prisma: PrismaClient | Prisma.TransactionClient`.
  Agregar import de `Prisma` desde `@prisma/client` si no está.

**Tests que se agregan**: ninguno de runtime. La verificación es compilación.

**Verificación**:
```bash
cd backend
npx tsc --noEmit -p tsconfig.json
# Confirmar que el bloque require.main sigue pasando PrismaClient (asignable a la unión)
```

**Cubre**: Design D4, Spec REQ-PORT-04, Escenario E-FIRMA-01, E-FIRMA-02.

---

## Fase 2 — Port `PlanCuentasSeederPort` en módulo `cuentas`

### 2.1 - [ ] `feat(cuentas): add PlanCuentasSeederPort`

**Entrega**: contrato cross-module que `tenants` consume para sembrar el
plan de cuentas COMERCIAL + `OrgConfiguracionContable`. Abstract class +
Symbol. `tx` obligatorio (no `tx?`). JSDoc explica atomicidad e idempotencia.

**Archivos** (nuevos):
- `backend/src/cuentas/ports/plan-cuentas-seeder.port.ts`
  — `PlanCuentasSeederPort` (abstract class) + `PLAN_CUENTAS_SEEDER_PORT` (Symbol).
  Firma del método:
  ```typescript
  abstract seedDefaultsForTenant(
    tenantId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void>;
  ```
  JSDoc: mencionar idempotencia (upsert), atomicidad (tx obligatorio), fail-loud
  si la plantilla COMERCIAL no sembró las cuentas requeridas.

**Tests que se agregan**: ninguno (abstract class sin lógica).

**Verificación**: `npx tsc --noEmit` verde.

**Cubre**: Design D3, Spec REQ-PORT-01, REQ-PORT-02, Escenario E-PORT-04.

---

## Fase 3 — Adapter `PrismaPlanCuentasSeederAdapter` + integration spec (TDD)

### 3.1 - [ ] `feat(cuentas): add PrismaPlanCuentasSeederAdapter integration spec (RED)`

**Entrega**: integration spec del adapter en ROJO — escribe los tests primero,
sin implementación. Los tests deben fallar porque el adapter no existe aún.

**Archivos** (nuevos):
- `backend/src/cuentas/adapters/prisma-plan-cuentas-seeder.adapter.integration.spec.ts`
  — tests contra Postgres real. Escenarios requeridos:
  - **siembra exitosa**: invocar `seedDefaultsForTenant(orgId, tx)` dentro de una TX
    real → `SELECT COUNT(*) FROM cuentas WHERE "organizationId" = orgId` = 111;
    existe exactamente 1 registro en `OrgConfiguracionContable` para ese orgId.
  - **idempotencia**: invocar el adapter 2 veces sobre el mismo tenant dentro de TXs
    separadas → sigue siendo 111 cuentas, no 222 (upsert no duplica).
  - **aislamiento multi-tenant**: crear dos orgs A y B, sembrar ambas → A tiene 111
    cuentas con su `organizationId`, B tiene 111 con el suyo; ninguna cuenta de A
    tiene el `organizationId` de B.
  - **rollback**: invocar dentro de una TX que luego se revierte → 0 cuentas persistidas.

**Fixture**: cada test crea una `Organization` temporal (puede ser una fila
mínima en la tabla) para obtener un `organizationId` válido, corre el seeder
dentro de `prisma.$transaction`, y verifica/limpia.

**Tests que se agregan**: ≥ 4 integration specs (todos en ROJO).

**Verificación**: `DATABASE_URL=... npx jest src/cuentas/ --testPathPattern=integration` —
todos fallan con "cannot find module" o similar (ROJO esperado).

---

### 3.2 - [ ] `feat(cuentas): implement PrismaPlanCuentasSeederAdapter (GREEN)`

**Entrega**: implementación del adapter que encadena `sembrarPlanCuentasComercial`
+ `poblarConfiguracionContableRequerida` con el `tx` recibido. Pasar integration
spec a VERDE.

**Archivos** (nuevos):
- `backend/src/cuentas/adapters/prisma-plan-cuentas-seeder.adapter.ts`
  — `PrismaPlanCuentasSeederAdapter extends PlanCuentasSeederPort`.
  ```typescript
  async seedDefaultsForTenant(tenantId: string, tx: Prisma.TransactionClient) {
    const { porCodigoInterno } = await sembrarPlanCuentasComercial(tx, tenantId);
    await poblarConfiguracionContableRequerida(tx, tenantId, porCodigoInterno);
  }
  ```
  El adapter importa directamente de `backend/prisma/seeds/prod/planes-cuentas/comercial.ts`
  (capa sucia — adapter puede importar infra). Cero lógica de negocio adicional.

**Tests que se agregan**: ninguno (solo se hace pasar la spec de 3.1).

**Verificación**:
```bash
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
  npx jest src/cuentas/ --testPathPattern=integration
npx tsc --noEmit
```

**Cubre**: Design D3 (adapter), Spec REQ-PORT-03, REQ-IDEM-01, REQ-IDEM-02,
REQ-MT-01, Escenarios E-PORT-03, E-IDEM-01, E-IDEM-02.

---

## Fase 4 — Wiring en `cuentas.module` + campo `modulo` en `CreateTenantDto` (TDD)

Las dos tasks de esta fase son independientes entre sí y pueden comitearse
en cualquier orden, pero ambas deben completarse antes de la Fase 5.

### 4.1 - [ ] `feat(cuentas): provide and export PLAN_CUENTAS_SEEDER_PORT in CuentasModule`

**Entrega**: registrar y exportar el nuevo port en el módulo dueño.

**Archivos** (modificados):
- `backend/src/cuentas/cuentas.module.ts`
  — en `providers`: agregar
  `{ provide: PLAN_CUENTAS_SEEDER_PORT, useClass: PrismaPlanCuentasSeederAdapter }`.
  — en `exports`: agregar `PLAN_CUENTAS_SEEDER_PORT`.

**Tests que se agregan**: ninguno (wiring puro).

**Verificación**: `npx tsc --noEmit` verde.

**Cubre**: Design §5, Spec REQ-PORT-05.

---

### 4.2 - [ ] `feat(tenants): add modulo field to CreateTenantDto with validation (TDD)`

**Entrega**: campo `modulo` requerido en `CreateTenantDto`. TDD: spec primero.

**Archivos** (modificados/nuevos):
- `backend/src/tenants/dto/create-tenant.dto.ts`
  — agregar campo `modulo: 'CONTABILIDAD' | 'GRANJA' | 'OTROS'` con decoradores
  `@IsEnum(['CONTABILIDAD', 'GRANJA', 'OTROS'])` + `@IsNotEmpty()` + `@ApiProperty`.
  Sin default. Sin persistencia (input transitorio per Design D2).

**Tests (spec TDD)**:
- Agregar o ampliar `backend/src/tenants/dto/create-tenant.dto.spec.ts` (si no existe, crear).
  Casos con `class-validator.validate()`:
  - `modulo: 'CONTABILIDAD'` → 0 errores.
  - `modulo: 'GRANJA'` → 0 errores.
  - `modulo: 'OTROS'` → 0 errores.
  - `modulo` ausente → error de validación en campo `modulo`.
  - `modulo: null` → error de validación.
  - `modulo: 'FARMACIA'` → error de validación con mención al enum.
  - `modulo: ''` → error de validación.

**Tests que se agregan**: ≥ 7 unit specs del DTO (rojo primero, verde tras implementar).

**Verificación**: `npx tsc --noEmit` + `npx jest src/tenants/` verde.

**Cubre**: Design D2, Spec REQ-DTO-01, REQ-DTO-02, REQ-DTO-03, REQ-DTO-04,
Escenarios E-DTO-01, E-DTO-02, E-DTO-03, E-DTO-04.

---

## Fase 5 — Actualizar `TenantRepositoryPort` y adapter (TDD)

### 5.1 - [ ] `feat(tenants): extend TenantRepositoryPort.create with tx? and flags (TDD)`

**Entrega**: port y adapter del repositorio extendidos para recibir `tx?` y
persistir los flags derivados. TDD: spec primero.

**Archivos (port)**:
- `backend/src/tenants/ports/tenant.repository.port.ts`
  — ampliar `TenantCreateData` con campos `contabilidadEnabled: boolean` y
  `granjaEnabled: boolean`.
  — cambiar firma de `create` a:
  ```typescript
  abstract create(
    data: TenantCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<OrganizationConMemberships>;
  ```
  Agregar import de `Prisma` desde `@prisma/client`.

**Archivos (adapter)**:
- `backend/src/tenants/adapters/prisma-tenant.repository.ts`
  — actualizar el método `create` para usar `(tx ?? this.prisma).organization.create({...})`
  con `contabilidadEnabled` y `granjaEnabled` incluidos en el `data`.
  La nested write de membership OWNER se conserva igual.

**Tests que se agregan** (spec TDD antes de implementar):
- En `backend/src/tenants/adapters/prisma-tenant.repository.spec.ts` (o crear si no existe):
  - `create` con `tx` undefined usa `this.prisma` (mock).
  - `create` con `tx` provisto usa el cliente transaccional (mock).
  - los flags `contabilidadEnabled` y `granjaEnabled` se pasan al `organization.create`.
  ≥ 3 unit specs.

**Verificación**: `npx tsc --noEmit` + `npx jest src/tenants/` verde.

**Cubre**: Design D6, Spec REQ-REPO-01, REQ-REPO-02, REQ-REPO-03.

---

## Fase 6 — `TenantsService.create` con switch + TX + unit spec (TDD)

### 6.1 - [ ] `feat(tenants): add unit spec for TenantsService.create with modulo (RED)`

**Entrega**: spec completa de la nueva lógica del service en ROJO.
Todos los casos de TDD deben fallar porque el service aún no implementa `modulo`.

**Archivos** (modificados):
- `backend/src/tenants/tenants.service.spec.ts`
  — ampliar (o reescribir la suite `create`) con mocks de:
  - `PLAN_CUENTAS_SEEDER_PORT` (mock con spy).
  - `TIPO_DOCUMENTO_FISICO_SEEDER_PORT` (mock con spy).
  - `TenantRepositoryPort.create` (mock).
  - `PrismaService.$transaction` (mock que ejecuta el callback con un `tx` falso).

  **Casos requeridos** (todos en ROJO):
  - `modulo=CONTABILIDAD`: invoca `PlanCuentasSeederPort.seedDefaultsForTenant` con
    `org.id` y `tx`; invoca `TipoDocumentoFisicoSeederPort.seedDefaultsForTenant`
    con `org.id` y `tx`; ambos después de `repo.create`.
  - `modulo=CONTABILIDAD`: flags derivados son `contabilidadEnabled=true, granjaEnabled=false`
    → `repo.create` es llamado con esos flags en `data`.
  - `modulo=GRANJA`: NO invoca `PlanCuentasSeederPort` (0 invocaciones);
    NO invoca `TipoDocumentoFisicoSeederPort` (0 invocaciones);
    flags derivados son `granjaEnabled=true, contabilidadEnabled=false`.
  - `modulo=OTROS`: NO invoca ningún seeder; flags `contabilidadEnabled=false,
    granjaEnabled=false`.
  - Seeder `PlanCuentasSeederPort` lanza → el error se propaga (simula rollback:
    verificar que el resultado del `create` es el error, no la org).
  - Seeder `TipoDocumentoFisicoSeederPort` lanza → ídem.
  - Slug duplicado pre-TX → `TenantSlugDuplicadoError` sin abrir TX (mock de
    `existsBySlug` retorna `true`).
  - `modulo=CONTABILIDAD` golden path: retorna `OrganizationConMemberships`.

**Tests que se agregan**: ≥ 8 unit specs (todos en ROJO).

**Verificación**: `DATABASE_URL=... npx jest src/tenants/tenants.service.spec.ts` — todos fallan (ROJO esperado). `npx tsc --noEmit` verde (el spec compila aunque falle en runtime).

---

### 6.2 - [ ] `feat(tenants): implement TenantsService.create with modulo switch and TX (GREEN)`

**Entrega**: implementación completa de `TenantsService.create` que pasa la spec de 6.1.

**Archivos** (modificados):
- `backend/src/tenants/tenants.service.ts`
  — inyectar `PrismaService` (para `$transaction`), `@Inject(PLAN_CUENTAS_SEEDER_PORT)
    planCuentasSeeder: PlanCuentasSeederPort`, `@Inject(TIPO_DOCUMENTO_FISICO_SEEDER_PORT)
    tiposDocSeeder: TipoDocumentoFisicoSeederPort`.
  — método privado `flagsParaModulo(modulo: 'CONTABILIDAD' | 'GRANJA' | 'OTROS')` que retorna
    `{ contabilidadEnabled: boolean; granjaEnabled: boolean }` según el mapeo del design D1.
  — `create(dto, ownerId)` envuelto en `prisma.$transaction`:
    1. `existsBySlug` pre-TX (defense in depth).
    2. `repo.create({ ...flags, slug, name, ownerUserId }, tx)`.
    3. `switch(dto.modulo)`:
       - `CONTABILIDAD`: `await planCuentasSeeder.seedDefaultsForTenant(org.id, tx)` y
         luego `await tiposDocSeeder.seedDefaultsForTenant(org.id, tx)`.
       - `GRANJA`: placeholder (comentario explícito).
       - `OTROS`: no-op.
    4. `return org`.

**Tests que se agregan**: ninguno (solo se hace pasar la spec de 6.1).

**Verificación**: `npx tsc --noEmit` + `npx jest src/tenants/tenants.service.spec.ts` — todos VERDES.

**Cubre**: Design D5, Spec REQ-SEED-01, REQ-SEED-02, REQ-SEED-03, REQ-SEED-04,
REQ-SEED-05, REQ-FLAGS-01, REQ-FLAGS-02, REQ-FLAGS-03, REQ-FLAGS-04, REQ-ATOM-01,
REQ-ATOM-02, Escenarios E-GRAN-01, E-GRAN-02, E-OTROS-01, E-OTROS-02,
E-PORT-01, E-PORT-02, E-ATOM-01, E-ATOM-02, E-ATOM-04 (pre-TX).

---

## Fase 7 — Wiring en `tenants.module`

### 7.1 - [ ] `feat(tenants): wire CuentasModule and TiposDocumentoFisicoModule in TenantsModule`

**Entrega**: cablear los módulos dueños de los seeder ports en el módulo `tenants`
para que la inyección de `PLAN_CUENTAS_SEEDER_PORT` y `TIPO_DOCUMENTO_FISICO_SEEDER_PORT`
se resuelva en el contenedor de NestJS.

**Archivos** (modificados):
- `backend/src/tenants/tenants.module.ts`
  — en `imports`: agregar `CuentasModule` y el módulo que exporta `TIPO_DOCUMENTO_FISICO_SEEDER_PORT`
  (verificar cómo se llama ese módulo — probablemente `TiposDocumentoFisicoModule`).
  — en `providers` de `TenantsService`: agregar los tokens de los dos ports inyectados
  vía `@Inject()` en el service.

**Precaución ciclos**: `tenants → cuentas` es unidireccional hoy (verificado en design D10).
No se usa `forwardRef` salvo que TS lo reclame. Si `TiposDocumentoFisicoModule` no está
aún en el grafo del `AppModule`, agregarlo también allí.

**Tests que se agregan**: ninguno (wiring puro).

**Verificación**:
```bash
cd backend
npx tsc --noEmit -p tsconfig.json
npx jest src/tenants/
```
El contenedor NestJS resuelve los tokens sin circular dependency error.

**Cubre**: Design §5 (wiring), Spec REQ-PORT-05.

---

## Fase 8 — Integration spec de `tenants` contra Postgres real

### 8.1 - [ ] `test(tenants): add integration spec for TenantsService.create with Postgres (RED)`

**Entrega**: integration spec completa en ROJO — spec antes de que el wiring real
esté validado end-to-end con la BD.

**Archivos** (nuevos):
- `backend/src/tenants/tenants.service.integration.spec.ts`
  — tests contra Postgres real con `PrismaService` real (no mocks).
  Levanta los adapters reales (o usa el módulo NestJS Testing con imports reales).

  **Escenarios requeridos** (todos ROJO hasta que 7.1 esté verde):
  - **Alta CONTABILIDAD exitosa (E-CONT-01)**:
    POST semántico: `create({ name, modulo: 'CONTABILIDAD' }, ownerId)` →
    `SELECT COUNT(*) FROM cuentas WHERE "organizationId" = orgId` = 111 +
    existe `OrgConfiguracionContable` + `contabilidadEnabled = true` +
    `granjaEnabled = false` + membership OWNER creada.
  - **Conteo exacto 111 cuentas (E-CONT-02)**: mismo anterior, conteo estricto.
  - **Multi-tenant (E-MT-01/02)**: crear orgs A y B con CONTABILIDAD → A tiene 111
    cuentas con su `organizationId`; B tiene 111 con el suyo; cuentas de A no tienen
    `organizationId` de B.
  - **Alta GRANJA (E-GRAN-01)**: `modulo: 'GRANJA'` → 201 semántico + 0 cuentas +
    `granjaEnabled = true` + `contabilidadEnabled = false`.
  - **Alta OTROS (E-OTROS-01)**: `modulo: 'OTROS'` → 0 cuentas + ambos flags false.
  - **Rollback total (E-ATOM-01)**: seeder lanza (mock parcial del `planCuentasSeeder`)
    → 0 orgs creadas, 0 memberships, 0 cuentas.

**Tests que se agregan**: ≥ 6 integration specs (ROJO).

**Verificación**: `DATABASE_URL=... npx jest src/tenants/ --testPathPattern=integration` — todos ROJOS.

---

### 8.2 - [ ] `test(tenants): integration spec turns GREEN after full wiring`

**No hay código nuevo aquí** — este checkpoint verifica que la spec de 8.1
queda verde tras completar las fases 1–7. Si algún test sigue rojo, es señal
de que hay un problema de wiring o de lógica.

**Acción**: correr la suite integration y depurar si hay fallos.

**Verificación**:
```bash
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
  npx jest src/tenants/ --testPathPattern=integration --runInBand
npx tsc --noEmit
```

**Cubre**: Spec §6 (Coverage objetivo — integration layer), Escenarios E-CONT-01,
E-CONT-02, E-MT-01, E-GRAN-01, E-OTROS-01, E-ATOM-01.

---

## Fase 9 — E2E `POST /tenants`

### 9.1 - [ ] `test(tenants): add e2e spec for POST /tenants with modulo (RED)`

**Entrega**: suite E2E en ROJO — escribe los tests antes del deploy.

**Archivos** (nuevos o extendidos):
- `backend/test/tenants.e2e-spec.ts` (extender la suite existente o crear nueva sección)

  **Escenarios requeridos**:
  - **E-DTO-01**: `POST /api/tenants` sin `modulo` → 400 con error de validación.
  - **E-DTO-02**: `POST /api/tenants` con `modulo: 'FARMACIA'` → 400 con detalle del enum.
  - **E-DTO-03**: `POST /api/tenants` con `modulo: null` → 400.
  - **E-DTO-04**: los tres valores del enum producen 201 (3 requests, nombres distintos).
  - **E-CONT-01**: `modulo: 'CONTABILIDAD'` → 201 + `contabilidadEnabled: true` +
    `granjaEnabled: false` en respuesta; GET cuentas devuelve exactamente 111.
  - **E-CONT-04**: los 8 `TipoDocumentoFisico` sembrados tienen los codes correctos
    (`factura-emitida`, `factura-recibida`, `nota-credito-emitida`, etc.).
  - **E-GRAN-01**: `modulo: 'GRANJA'` → 201 + `granjaEnabled: true` +
    `contabilidadEnabled: false`; 0 cuentas.
  - **E-OTROS-01**: `modulo: 'OTROS'` → 201 + ambos flags false; 0 cuentas.
  - **E-MT-03**: org GRANJA intenta `GET /api/plan-cuentas` → 403 Forbidden
    (`ModuleEnabledGuard` bloquea).

**Tests que se agregan**: ≥ 9 E2E scenarios (ROJO).

**Verificación**:
```bash
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
  JWT_ACCESS_SECRET="test-secret" \
  JWT_REFRESH_SECRET="test-refresh" \
  npx jest test/tenants --runInBand --forceExit
```

---

### 9.2 - [ ] `test(tenants): e2e spec turns GREEN`

**No hay código nuevo** — checkpoint de verde E2E. Si hay fallos, depurar
antes de continuar.

**Verificación**:
```bash
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
  JWT_ACCESS_SECRET="test-secret" \
  JWT_REFRESH_SECRET="test-refresh" \
  npx jest test/tenants --runInBand --forceExit
```

**Cubre**: Spec §6 (coverage E2E), Escenarios E-DTO-01 a E-DTO-04,
E-CONT-01, E-CONT-04, E-GRAN-01, E-OTROS-01, E-MT-03.

---

## Fase 10 — Verde final

### 10.1 - [ ] `chore(tenants): final green check — tsc + full test suite`

**Entrega**: verificación de que el change completo no rompió nada.

**Comandos**:
```bash
cd backend

# TypeCheck completo
npx tsc --noEmit -p tsconfig.json

# Suite de módulos tocados (unit + integration)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
  npx jest src/cuentas/ src/tenants/

# E2E tenants
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
  JWT_ACCESS_SECRET="test-secret" \
  JWT_REFRESH_SECRET="test-refresh" \
  npx jest test/tenants --runInBand --forceExit
```

**Todo verde → el PR está listo para squash merge.**

**Cubre**: CLAUDE.md §10.6 (coverage ≥ 80% global, ≥ 95% dominio).

---

## Estimación

| Fase | Tasks | Tiempo estimado |
|------|-------|-----------------|
| 0 — Coordinación absorción | 1 | ~10 min |
| 1 — Fix R1 (`comercial.ts`) | 1 | ~20 min |
| 2 — Port `PlanCuentasSeederPort` | 1 | ~20 min |
| 3 — Adapter + integration spec (TDD) | 2 | ~1.5h |
| 4 — Wiring `cuentas.module` + DTO `tenants` | 2 | ~40 min |
| 5 — Port repo + adapter | 1 | ~45 min |
| 6 — Service switch + TX (TDD) | 2 | ~1.5h |
| 7 — Wiring `tenants.module` | 1 | ~20 min |
| 8 — Integration spec tenants | 2 | ~1.5h |
| 9 — E2E | 2 | ~1h |
| 10 — Verde final | 1 | ~15 min |
| **Total** | **16 tasks** | **~8h efectivos** |

---

## Risks recordatorios desde design

| Riesgo | Task donde se mitiga |
|--------|----------------------|
| R1 (firma `comercial.ts` — prerequisito bloqueante) | 1.1 |
| R2 (doble wiring de `TipoDocumentoFisicoSeederPort`) | 0.1 (absorción documental) |
| R3 (ciclo de módulo `tenants → cuentas`) | 7.1 (verificar en wiring, no usar `forwardRef` si no es necesario) |
| R4 (TX larga al crear tenant) | 3.2 (integration spec cubre el timing), 8.2 (verde con Postgres real) |

## Task de mayor riesgo

**Fase 1.1** (`comercial.ts`): cambio de tipo en funciones que corren en producción
y en seeds de dev. Sin test de runtime adicional — solo compilación. Mitigación:
verificar explícitamente que el bloque `if (require.main === module)` sigue pasando
`PrismaClient` (que es asignable a la unión) y que no hay cast implícito que rompa.

**Fase 7.1** (wiring `tenants.module`): importar `CuentasModule` desde `tenants`
introduce una dependencia nueva en el grafo de módulos. Si `CuentasModule` transitivamente
importa `TenantsModule`, hay un ciclo. Mitigación: `grep -r "TenantsModule\|tenants.module"
src/cuentas/` debe retornar vacío (verificado en design D10, pero re-verificar en apply).
