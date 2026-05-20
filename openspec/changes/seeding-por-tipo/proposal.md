# Proposal: seeding-por-tipo

> Fecha: 2026-05-20
> Fase: proposal
> Proyecto: avicont

---

## Why

Crear una organización **por la app** hoy NO siembra nada. `TenantsService.create`
(`backend/src/tenants/tenants.service.ts`) solo persiste la `Organization` + la
membership del OWNER. El plan de cuentas y la `OrgConfiguracionContable` quedan
vacíos, así que la org nace **inutilizable para contabilidad**: no se puede
crear un comprobante porque no hay cuentas ni conceptos contables mapeados.

Las funciones de siembra **ya existen y son idempotentes** (upsert por
`organizationId_codigoInterno` / `organizationId`):
`sembrarPlanCuentasComercial(prisma, organizationId)` (111 cuentas) y
`poblarConfiguracionContableRequerida(prisma, organizationId, porCodigoInterno)`
en `backend/prisma/seeds/prod/planes-cuentas/comercial.ts`. El GAP es puro
**cableado**: hoy solo se invocan desde seeds de dev o por CLI standalone, nunca
desde el flujo HTTP de creación.

Además, este cambio **converge con documento-fisico task 9.1** (pendiente, en
`openspec/changes/documento-fisico/`), que introduce el mismo concepto de
"seed-at-tenant-creation" para `TipoDocumentoFisico` vía
`TipoDocumentoFisicoSeederPort.seedDefaultsForTenant(tenantId, tx)`. Hay que
resolver el seed-at-creation **UNIFICADO**, no dos mecanismos distintos.

Por último, hoy `create` NO captura el TIPO de organización: toda org nace con
`contabilidadEnabled=true` / `granjaEnabled=false` (defaults del schema) sin que
el usuario lo elija. Una org de granja arrastraría 111 cuentas contables que no
usa ("data muerta" lógica — filas que nunca se tocan).

---

## What Changes

- `CreateTenantDto` captura el **vertical/módulo** elegido (eje A):
  `Contabilidad` / `Granja` / `Otros`. Hoy solo tiene `name`.
- `TenantsService.create` corre dentro de una **TX** (`prisma.$transaction`) y,
  según el vertical, invoca el seeder correspondiente y setea los feature flags:
  - **Contabilidad** → seeder de plan de cuentas + config contable;
    `contabilidadEnabled=true`, `granjaEnabled=false`.
  - **Granja** → seeder de granja (**placeholder**, módulo sin código aún);
    `granjaEnabled=true`, `contabilidadEnabled=false`. CERO siembra contable.
  - **Otros** → ningún seeder; ambos flags en `false` (placeholder).
- Nuevo `PlanCuentasSeederPort` (cross-module, owner-owned) en el módulo
  **`cuentas`**, consumido por `tenants`. Mismo molde que el
  `TipoDocumentoFisicoSeederPort` de documento-fisico.
- `TenantRepositoryPort.create` acepta `tx?: Prisma.TransactionClient` (cambio
  backwards-compatible) para participar de la TX de creación.
- **Unificación** del seed-at-creation: `tenants.service.create` orquesta un
  conjunto de seeders por vertical en la MISMA TX (ver Decisión 3). Esto
  **subsume** documento-fisico task 9.1.

---

## Scope

### In scope

- Campo de vertical en `CreateTenantDto` + validación + Swagger.
- Wrap de `TenantsService.create` en TX con orquestación de seeders por vertical.
- `PlanCuentasSeederPort` en `cuentas` + su adapter Prisma, que envuelve las
  funciones existentes de `comercial.ts`.
- Ajuste de firma de las funciones de siembra para aceptar
  `Prisma.TransactionClient` (ver Riesgo R1 — es bloqueante para la atomicidad).
- Set de feature flags (`contabilidadEnabled`/`granjaEnabled`) coherente con el
  vertical, dentro de la TX.
- Placeholder explícito para Granja y Otros (rama del switch sin seeder real).
- Tests: unit (`tenants.service.spec.ts` con mocks de seeders + rollback),
  integración del adapter del seeder, E2E del flujo `POST /tenants`.

### Out of scope (defer)

- **Captura del rubro contable** (eje B: `tipoEmpresaPrincipal`) en el alta.
  Solo existe la variante `comercial` del plan; capturar rubro hoy sería UI que
  no hace nada (ver Decisión 2). Se siembra siempre COMERCIAL por ahora.
- **Variantes del plan de cuentas** para SERVICIOS, TRANSPORTE, INDUSTRIAL,
  AGROPECUARIA, etc. (deuda preexistente del seed — no la abre este cambio).
- **Módulo granja** completo. Este cambio solo deja la rama del switch lista
  para enchufar su seeder cuando exista.
- **Frontend (selector de vertical)**. Va en un cambio aparte de scope `*-ui`
  (ver Decisión 5). Este cambio entrega el contrato HTTP.
- **Cambio de vertical post-creación** (re-seed al activar contabilidad después).
  El toggle de flags ya existe (`PATCH /tenants/current/features`); el re-seed
  on-demand es deuda separada.

---

## Capabilities

### New Capabilities

- `tenant-seeding`: siembra de datos por defecto al crear una organización,
  condicional al vertical elegido (orquestación de seeders en TX, idempotente).
- `plan-cuentas-seeder-port`: contrato cross-module owner-owned expuesto por
  `cuentas` para sembrar el plan de cuentas + config contable de un tenant.

### Modified Capabilities

- `tenant-management`: `POST /tenants` ahora captura el vertical y deja la org
  sembrada+lista (o no creada) atómicamente; los feature flags se derivan del
  vertical en vez de tomar siempre los defaults del schema.

---

## Decisiones clave del proposal

### Decisión 1: Eje A (vertical) vs Eje B (rubro) — distinguirlos explícitamente

Son **dos ejes ortogonales** que se confunden:

- **Eje A — Vertical/módulo**: `Contabilidad` / `Granja` / `Otros`. Decide
  `contabilidadEnabled`/`granjaEnabled` y **qué seeder** corre.
- **Eje B — Rubro contable**: el schema ya tiene
  `tipoEmpresaPrincipal TipoEmpresa @default(COMERCIAL)` (8 valores: COMERCIAL,
  SERVICIOS, TRANSPORTE, INDUSTRIAL, PETROLERA, CONSTRUCCION, AGROPECUARIA,
  MINERA). Decide **qué variante** del plan se siembra. HOY solo existe la
  variante `comercial`.

**Decisión**: este cambio captura **solo el eje A**. El eje B se asume
`COMERCIAL` (default del schema). Ver Decisión 2 para el rationale.

### Decisión 2: Capturar solo el vertical (eje A), rubro = COMERCIAL fijo

Opciones evaluadas:

- **(a) Solo eje A, rubro=COMERCIAL fijo** ← **RECOMENDADA**. `CreateTenantDto`
  agrega `modulo: 'CONTABILIDAD' | 'GRANJA' | 'OTROS'`. El seeder contable usa
  siempre la variante comercial. Cero UI muerta.
- **(b) Eje A + eje B desde el alta**. `CreateTenantDto` agrega vertical + rubro.
  Problema: solo existe la variante `comercial`; un selector con 8 rubros que
  todos siembran lo mismo es **UI que miente**. Se descarta hasta tener variantes.
- **(c) Solo eje B (rubro), sin vertical**. Reusa `tipoEmpresaPrincipal`. No
  resuelve el problema real: el vertical (contabilidad vs granja) no es un rubro
  contable, y `AGROPECUARIA` no implica "vertical granja". Se descarta.

**Rationale**: capturar el rubro hoy sin variantes sembrables es prometer algo
que el backend no cumple. El default `COMERCIAL` ya cubre el 95% (es el plan
genérico boliviano). Cuando lleguen las variantes por rubro, se agrega el eje B
al DTO **sin breaking change** (campo opcional adicional).

**Tradeoff**: una org de servicios/transporte arranca con plan comercial y el
admin ajusta cuentas a mano. Aceptable: las funciones de siembra ya permiten
crear/editar/desactivar libremente (salvo las 8 `esRequeridaSistema`).

### Decisión 3: Patrón de orquestación de seeders — switch por vertical en `tenants`

Opciones evaluadas:

- **(a) Un `SeederPort` por módulo + switch por vertical en `tenants.service`**
  ← **RECOMENDADA**. `tenants` inyecta los seeders cross-module que conoce
  (`PlanCuentasSeederPort` de `cuentas`, `TipoDocumentoFisicoSeederPort` de
  documento-fisico, futuro `GranjaSeederPort`) y un `switch (modulo)` decide
  cuáles correr en la TX. Es el patrón YA establecido por documento-fisico §7.2.
- **(b) Registro/array de seeders auto-descubierto** (un token multi-provider
  que cada módulo alimenta). Más "elegante" pero esconde QUÉ corre por vertical
  detrás de indirección; el mapeo vertical→seeders deja de ser legible en un
  punto. Se descarta por ahora (over-engineering para 2-3 seeders).
- **(c) Eventos `tenant.created` con handlers por módulo**. Viola la atomicidad
  exigida: un evento es asíncrono/desacoplado y NO participa de la TX. La regla
  del core (CLAUDE.md §3.7) dice: si al fallar debe fallar la operación
  principal → **port síncrono**, no evento. El seed DEBE ser síncrono. Se descarta.

**Unificación con documento-fisico task 9.1**: ambos seeds (plan de cuentas y
tipos de documento físico) son del vertical **Contabilidad** y corren en la
MISMA TX dentro del mismo `switch case 'CONTABILIDAD'`. Este cambio **subsume**
la task 9.1: en vez de cablear el `TipoDocumentoFisicoSeederPort` por separado,
se agrega a la rama contable junto al `PlanCuentasSeederPort`. Coordinar con el
estado de documento-fisico para no duplicar el wiring (ver Riesgo R3).

### Decisión 4: Dueño del `PlanCuentasSeederPort` y su firma

**Decisión**: el port vive en el módulo **`cuentas`** (owner del dominio plan de
cuentas — `backend/src/cuentas/`). Symbol `PLAN_CUENTAS_SEEDER_PORT`. Firma
alineada con `TipoDocumentoFisicoSeederPort`:

```typescript
export abstract class PlanCuentasSeederPort {
  /**
   * Siembra el plan de cuentas COMERCIAL (111 cuentas) + la
   * OrgConfiguracionContable requerida en el tenant. Idempotente
   * (upsert). Recibe `tx` para participar de la TX que crea la
   * organización (el tenant nace listo o no nace).
   */
  abstract seedDefaultsForTenant(
    tenantId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void>;
}
```

El adapter (`PrismaPlanCuentasSeederAdapter`) envuelve las funciones existentes
de `comercial.ts` (`sembrarPlanCuentasComercial` + `poblarConfiguracionContableRequerida`),
encadenando el `porCodigoInterno` que la primera devuelve hacia la segunda.

**Nota de dominio**: `OrgConfiguracionContable` es propiedad del módulo
`configuracion-contable`, pero su población es un **efecto downstream** de
sembrar el plan (necesita los ids de las cuentas recién creadas). El port lo
agrupa porque es una unidad de trabajo atómica del seed contable — el caller
(`tenants`) trata el plan+config como una sola operación opaca.

**Tradeoff**: `tx` se vuelve **obligatorio** (no `tx?`) en este port, porque la
atomicidad es el punto entero. documento-fisico lo declaró `tx?` opcional; se
recomienda alinear ambos a `tx` obligatorio en el contexto de creación (ver R1).

### Decisión 5: Frontend (selector de vertical) — cambio aparte

**Decisión**: el selector de vertical en la UI de alta de organización va en un
cambio **separado de scope `*-ui`**, NO en este cambio.

**Rationale**: este cambio es backend-puro (DTO + service + port + TX). El
frontend ya tiene `frontend/src/features/tenants` y consume `POST /tenants`;
agregar el selector es trabajo de presentación con su propio ciclo de tests.
Separarlo mantiene el commit atómico (CLAUDE.md §9.1, un scope por commit) y
permite mergear el backend sin bloquear por la UI. El contrato HTTP que entrega
este cambio es la frontera.

**Tradeoff**: por una ventana corta, el backend acepta `modulo` pero la UI aún
no lo manda. Mitigación: default seguro — si `modulo` no viene, asumir
`CONTABILIDAD` (preserva el comportamiento esperado del vertical contable, que
es el primero del producto).

---

## Affected Modules

| Módulo | Tipo de cambio | Blast radius |
|---|---|---|
| `tenants` | Modificación | `CreateTenantDto` (+campo `modulo`); `TenantsService.create` envuelto en TX + orquestación de seeders + set de flags; `TenantRepositoryPort.create` acepta `tx?`; `TenantsModule` importa `CuentasModule` (y documento-fisico). Unit/E2E nuevos. |
| `cuentas` | Adición | Nuevo `PlanCuentasSeederPort` + `PrismaPlanCuentasSeederAdapter` (envuelve `comercial.ts`); export del port. Integration spec. |
| `prisma/seeds/prod/planes-cuentas/comercial.ts` | Modificación | Las funciones aceptan `Prisma.TransactionClient` además de `PrismaClient` (tipo unión o `Prisma.TransactionClient` — ver R1). |
| `documento-fisico` (change en curso) | Coordinación | Su task 9.1 se **subsume** acá; no se cablea el seeder por separado. |
| `prisma/schema.prisma` | Sin cambios | `tipoEmpresaPrincipal`, flags y enum `TipoEmpresa` ya existen. Cero migration. |
| `granja` (no existe) | Placeholder | Rama del switch sin seeder real; lista para enchufar. |
| `frontend` | Sin cambios (este change) | Selector de vertical va en change `*-ui` aparte (Decisión 5). |

---

## Risks & Rollback

### Riesgos

- **R1 (bloqueante): las funciones de siembra reciben `PrismaClient`, NO
  `Prisma.TransactionClient`.** Firmas reales:
  `sembrarPlanCuentasComercial(prisma: PrismaClient, organizationId)` y
  `poblarConfiguracionContableRequerida(prisma: PrismaClient, organizationId,
  porCodigoInterno)`. `PrismaClient` y `Prisma.TransactionClient` NO son
  intercambiables (este último no tiene `$transaction`, `$connect`, etc.).
  **Para correr dentro de `prisma.$transaction(tx => ...)` la firma DEBE
  cambiar** al tipo del cliente transaccional. Las funciones solo usan
  `.cuenta.upsert` y `.orgConfiguracionContable.upsert`, que existen en ambos
  tipos → el fix es mecánico (tipar el parámetro como `Prisma.TransactionClient`
  o el subconjunto común). Sin este cambio, NO hay atomicidad. **Hay que
  verificarlo en design/apply.**
- **R2: TX más larga al crear tenant.** El vertical contable inserta 111 cuentas
  + config + (8 tipos de doc físico de la task 9.1). Es una TX de ~120 INSERTs
  pequeños, single-tenant, sin contención cross-tenant. documento-fisico ya
  aceptó este riesgo para 8 inserts (su R4); 111 es más pero sigue siendo
  aceptable (creación de org es operación rara y secuencial). Mitigación: medir;
  si molesta, mover a job async post-create con estado `PROVISIONING` (deuda).
- **R3: doble wiring del seed-at-creation con documento-fisico.** Si task 9.1 se
  aplica por su lado Y este cambio agrega su propia orquestación, el
  `TipoDocumentoFisicoSeederPort` podría cablearse dos veces. Mitigación:
  coordinar el estado de ambos changes; este proposal declara que **subsume**
  9.1 — la rama contable del switch corre AMBOS seeders. Marcar 9.1 como
  absorbida en su tasks.md durante apply.
- **R4: ciclo de dependencias `tenants` ↔ `cuentas`.** Verificado: hoy NO hay
  cross-import (ni `cuentas` importa `tenants` ni viceversa). `tenants` importará
  `CuentasModule` solo para el provider del port → dependencia unidireccional,
  sin ciclo. Si en el futuro `cuentas` necesitara algo de `tenants`, usar
  `forwardRef`. Riesgo BAJO hoy.

### Rollback plan

Cambio **sin migration de schema** → rollback trivial:

1. `git revert` del PR: revierte DTO, service, port, adapter y ajuste de firma.
2. Las funciones de `comercial.ts` vuelven a aceptar `PrismaClient` (si se
   amplió a unión, revertir el tipo).
3. Orgs creadas durante la vigencia del cambio quedan sembradas — el seed es
   idempotente y los datos son válidos; no requieren limpieza.
4. El feature flag por vertical vuelve a los defaults del schema.

Sin downtime más allá del deploy estándar. Sin pérdida de datos.

---

## Dependencias

- `cuentas` (módulo) — cerrado. Owner del plan de cuentas; expone el nuevo port.
- `comercial.ts` (seed prod) — existente, idempotente. Se envuelve, no se reescribe.
- `documento-fisico` (change en curso) — su task 9.1 converge acá; coordinar.
- `tenants` (módulo) — cerrado; se modifica `create` + DTO + repo port.

## Desbloquea

- **Variantes del plan por rubro (eje B)** — una vez sembrables, se agrega el
  campo rubro al DTO sin breaking change.
- **Módulo granja** — su seeder enchufa en la rama `GRANJA` del switch ya lista.
- **Frontend selector de vertical** (change `*-ui`) — consume el contrato HTTP.

---

## Success Criteria

- [ ] `POST /tenants` con `modulo=CONTABILIDAD` crea la org con 111 cuentas +
      `OrgConfiguracionContable` poblada + `contabilidadEnabled=true`, todo en
      una sola TX (verificado por E2E).
- [ ] Si el seeder falla, la org NO se crea (rollback de la TX, verificado en unit).
- [ ] `modulo=GRANJA` crea la org con `granjaEnabled=true` y CERO cuentas contables.
- [ ] `modulo=OTROS` crea la org sin sembrar nada.
- [ ] Re-ejecutar la creación (mismo tenant) no duplica datos (idempotencia).
- [ ] `npx tsc --noEmit` + suite de `tenants` y `cuentas` en verde.

---

**Fin del proposal.**
