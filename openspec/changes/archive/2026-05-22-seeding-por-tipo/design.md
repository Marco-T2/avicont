# Design: seeding-por-tipo

> Fecha: 2026-05-20
> Fase: design
> Proyecto: avicont
> Owner: backend-lead

---

## 0. Convenciones del documento

- Las decisiones del proposal son **input cerrado**. Decisión de producto
  confirmada: el alta captura SOLO el eje vertical/módulo
  (`CONTABILIDAD | GRANJA | OTROS`); el rubro (`tipoEmpresaPrincipal`) se
  **difiere** y NO entra en este diseño. El seeder contable usa siempre la
  variante `comercial` (única existente).
- En código y BD el campo de tenant se llama `organizationId`. Los ports
  reciben `tenantId: string` por convención del repo (ver `CuentasReaderPort`,
  `TipoDocumentoFisicoSeederPort`). Mantenemos esa firma.
- El módulo dueño del plan de cuentas es **`cuentas`** (verificado:
  `backend/src/cuentas/`, no existe `plan-cuentas/`).

---

## 1. Technical Approach

`TenantsService.create` pasa de un único `repo.create` (nested write
org+membership) a una orquestación **dentro de una TX** que: (1) crea la org +
membership, (2) deriva los feature flags del `modulo` elegido, y (3) invoca los
seeders del vertical en la MISMA TX. El `CreateTenantDto` gana un campo `modulo`
requerido. Se introduce `PlanCuentasSeederPort` (owner-owned en `cuentas`) que
envuelve `sembrarPlanCuentasComercial` + `poblarConfiguracionContableRequerida`
de `comercial.ts`. Este change **subsume** la task 9.1 de documento-fisico: el
`TipoDocumentoFisicoSeederPort` se invoca en la MISMA rama `CONTABILIDAD` del
switch, no por separado. **Sin migration de schema** — los flags y enums ya
existen.

---

> **Decisión de scope — Opción 1 (confirmada en apply, 2026-05-20)**
>
> La rama CONTABILIDAD del seeding sembrará **SOLO plan de cuentas** (111
> cuentas + `OrgConfiguracionContable` requerida) en el Batch 1.
> El `TipoDocumentoFisicoSeederPort` **NO se integra en este Batch** porque
> su adapter concreto no existe aún (el change `documento-fisico` está a mitad
> de apply). El `switch` + `$transaction` construido en Batch 1 deja el
> **slot listo** en el case `CONTABILIDAD` para que la task 9.1 de
> `documento-fisico` enchufe su seeder en el momento que el adapter exista.
> La subsunción documental (D7) queda diferida: la task 9.1 de
> `documento-fisico` NO se marca como absorbida hasta que el adapter real
> esté disponible.

---

## 2. Architecture Decisions

### D1: Reuso de flags existentes, SIN columna nueva — `modulo` es input transitorio

**Choice**: el `modulo` (`CONTABILIDAD|GRANJA|OTROS`) es un input transitorio del
DTO que el service traduce a los flags YA existentes del schema. NO se persiste
un enum/columna `modulo`.

| Opción | Tradeoff | Decisión |
|---|---|---|
| (a) `modulo` transitorio → setea `contabilidadEnabled`/`granjaEnabled` | Cero estado duplicado; el "vertical" se deriva de los flags que ya existen y ya consume `ModuleEnabledGuard` | **ELEGIDA** |
| (b) Persistir enum `modulo` además de los flags | Dos fuentes de verdad para el mismo concepto; riesgo de drift (flag dice una cosa, enum otra); migration innecesaria | Descartada |

**Rationale**: el schema ya modela el vertical como dos booleanos
(`contabilidadEnabled @default(true)`, `granjaEnabled @default(false)`),
consumidos por `ModuleEnabledGuard` y por `PATCH /tenants/current/features`.
Agregar un enum `modulo` sería un TERCER estado redundante y un invariante nuevo
que mantener (`modulo=CONTABILIDAD ⇔ contabilidadEnabled=true`). El mapeo es:

| `modulo`      | `contabilidadEnabled` | `granjaEnabled` | seeders |
|---------------|-----------------------|-----------------|---------|
| `CONTABILIDAD`| `true`                | `false`         | plan-cuentas + tipos-doc-fisico |
| `GRANJA`      | `false`               | `true`          | ninguno (placeholder) |
| `OTROS`       | `false`               | `false`         | ninguno |

**Consecuencia explícita: NO hay migration de schema en este change.** Solo
cambian el DTO (`tenants/dto/create-tenant.dto.ts`) y el service+repo de
`tenants`, más la adición del port+adapter en `cuentas`.

> Nota: `tiposEmpresaActivos TipoEmpresa[]` ya existe en el schema con el
> invariante `tipoEmpresaPrincipal ∈ tiposEmpresaActivos`. Este change NO lo
> toca (rubro diferido); queda con su default (`[]` / lo que herede). El eje B
> se agregará después como campo opcional sin breaking change.

### D2: Campo `modulo` en `CreateTenantDto` — requerido, sin default

**Choice**: `@IsEnum` requerido (`@IsNotEmpty`), SIN default en el DTO.

**Rationale**: forzar la elección consciente en el alta. Un default en el DTO
escondería la decisión y reintroduciría el problema actual (toda org nace
contable por inercia). El enum del DTO es técnico/de framework, valores en
mayúscula (`CONTABILIDAD|GRANJA|OTROS`) — no es un enum de dominio contable
boliviano, así que no aplica la regla §1 de "valores en español de negocio";
sigue la convención de los enums técnicos del DTO.

> Mitigación de la ventana frontend (proposal Decisión 5): el frontend aún no
> manda `modulo`. Si se quisiera tolerancia temporal, el service podría asumir
> `CONTABILIDAD` cuando llega `undefined`. **Decisión de este diseño: NO** —
> el DTO lo hace requerido y el frontend del change `*-ui` se ajusta. Mantener
> el DTO honesto evita un default fantasma. El backend puede mergear antes; los
> tests E2E mandan `modulo` explícito.

### D3: `PlanCuentasSeederPort` — owner-owned en `cuentas`, `tx` obligatorio

**Choice**: `abstract class` + Symbol token en `cuentas/ports/`, un solo método
con `tx` **obligatorio** (no `tx?`).

```typescript
// backend/src/cuentas/ports/plan-cuentas-seeder.port.ts
import type { Prisma } from '@prisma/client';

export const PLAN_CUENTAS_SEEDER_PORT = Symbol('PLAN_CUENTAS_SEEDER_PORT');

export abstract class PlanCuentasSeederPort {
  /**
   * Siembra el plan de cuentas COMERCIAL (111 cuentas) + la
   * OrgConfiguracionContable requerida en el tenant. Idempotente: usa
   * `upsert` por (organizationId, codigoInterno) y por organizationId,
   * así que re-ejecutar no duplica.
   *
   * `tx` es OBLIGATORIO: este seeder corre dentro de la TX que crea la
   * organización — el tenant nace listo o no nace (atomicidad).
   *
   * @throws Error si la plantilla COMERCIAL no sembró todas las cuentas
   *   requeridas por el sistema (fail loud de comercial.ts).
   */
  abstract seedDefaultsForTenant(
    tenantId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void>;
}
```

**Alternatives considered**: `tx?` opcional (como lo declaró
`TipoDocumentoFisicoSeederPort`) — descartado: la atomicidad ES el punto del
change; un `tx` opcional permitiría llamarlo fuera de TX y romper la garantía.

**Rationale**: superficie mínima (un método), owner-owned (proposal Decisión 4,
CLAUDE.md §3.7). `OrgConfiguracionContable` es propiedad de
`configuracion-contable`, pero su población es efecto downstream del seed del
plan (necesita los ids recién creados) → el port agrupa plan+config como una
unidad atómica opaca para el caller `tenants`.

**Nota de alineación (deuda menor)**: `TipoDocumentoFisicoSeederPort` declara
`tx?` opcional. Se recomienda alinearlo a `tx` obligatorio cuando se aplique
9.1-absorbida. No es bloqueante: invocar con `tx` presente funciona igual.

#### Adapter

```typescript
// backend/src/cuentas/adapters/prisma-plan-cuentas-seeder.adapter.ts
@Injectable()
export class PrismaPlanCuentasSeederAdapter extends PlanCuentasSeederPort {
  async seedDefaultsForTenant(tenantId: string, tx: Prisma.TransactionClient) {
    const { porCodigoInterno } = await sembrarPlanCuentasComercial(tx, tenantId);
    await poblarConfiguracionContableRequerida(tx, tenantId, porCodigoInterno);
  }
}
```

Encadena el `porCodigoInterno` que devuelve la primera función hacia la segunda.
El adapter es thin; vive en la capa sucia (puede importar el seed de `src/cuentas/adapters/seed/`). El archivo `comercial.ts` fue relocado de `prisma/seeds/prod/planes-cuentas/` a `src/cuentas/adapters/seed/` vía PR #21 (fix Docker `dist/main.js`).

### D4: R1 (bloqueante) — firma de las funciones de siembra acepta `Prisma.TransactionClient`

**Choice**: ampliar el parámetro `prisma` de ambas funciones de `comercial.ts`
a un **tipo unión** `PrismaClient | Prisma.TransactionClient`.

**Estado verificado**: hoy reciben `prisma: PrismaClient`
(`comercial.ts:321` y `:434`). `PrismaClient` y `Prisma.TransactionClient` NO
son intercambiables (el transaccional no tiene `$transaction`/`$connect`). Pero
ambas funciones SOLO usan `prisma.cuenta.upsert` y
`prisma.orgConfiguracionContable.upsert`, métodos presentes en AMBOS tipos.

**Fix mecánico** (no rompe el uso CLI/dev existente — el `require.main` standalone
sigue pasando un `PrismaClient` real, que es asignable a la unión):

```typescript
// comercial.ts (cambio de firma — sin cambio de cuerpo)
export async function sembrarPlanCuentasComercial(
  prisma: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
): Promise<SeedPlanCuentasResult> { /* cuerpo idéntico */ }

export async function poblarConfiguracionContableRequerida(
  prisma: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  porCodigoInterno: Record<string, string>,
): Promise<OrgConfiguracionContable> { /* cuerpo idéntico */ }
```

Import `Prisma` desde `@prisma/client` (ya importa `PrismaClient` de ahí). La
unión es preferible a tipar solo como `Prisma.TransactionClient` porque el
bloque `if (require.main === module)` instancia `new PrismaClient()` y lo pasa;
la unión preserva esa llamada sin cast. Sin este fix NO hay atomicidad.

### D5: Orquestación en `tenants.service.create` — switch dentro de `$transaction`

**Choice**: `TenantsService.create` envuelve todo en `prisma.$transaction`,
deriva flags y corre los seeders del vertical en la misma TX.

Pseudocódigo:

```typescript
async create(dto: CreateTenantDto, ownerId: string) {
  const slug = TenantSlug.fromName(dto.name).toString();
  if (await this.repo.existsBySlug(slug)) {
    throw new TenantSlugDuplicadoError(slug);  // defense in depth + UNIQUE en BD
  }

  const flags = this.flagsParaModulo(dto.modulo); // D1 mapping table

  return this.prisma.$transaction(async (tx) => {
    const org = await this.repo.create(
      { slug, name: dto.name, ownerUserId: ownerId, ...flags },
      tx,                                   // repo.create acepta tx? (D6)
    );

    switch (dto.modulo) {
      case 'CONTABILIDAD':
        await this.planCuentasSeeder.seedDefaultsForTenant(org.id, tx);
        await this.tiposDocSeeder.seedDefaultsForTenant(org.id, tx); // absorbe 9.1
        break;
      case 'GRANJA':
        // Placeholder: módulo granja sin código aún. Flags ya seteados arriba.
        break;
      case 'OTROS':
        break;                              // no-op
    }

    return org;
  });
}
```

**Alternatives considered** (del proposal Decisión 3): registro auto-descubierto
de seeders (over-engineering para 2-3 seeders, esconde el mapeo vertical→seeders)
y eventos `tenant.created` (asíncronos → NO participan de la TX, violan
atomicidad CLAUDE.md §3.7). Ambos descartados.

**Rationale**: el `switch` deja LEGIBLE en un punto qué corre por vertical. Es
el patrón ya establecido por documento-fisico §7.2 (seeder síncrono en TX).

`this.prisma` se inyecta en `TenantsService` (hoy `PrismaService` ya se registra
en `TenantsModule` por dependencia transitiva; pasa a inyectarse explícito para
abrir la TX). Alternativa: un método `repo.createWithSeeding(cb)` — descartado
por sobreingeniería; el service es el dueño legítimo de la orquestación.

### D6: `TenantRepositoryPort.create` acepta `tx?` (backwards-compatible)

**Choice**: agregar `tx?: Prisma.TransactionClient` a `create` y ampliar
`TenantCreateData` con los flags derivados.

```typescript
// tenant.repository.port.ts
export interface TenantCreateData {
  slug: string;
  name: string;
  ownerUserId: string;
  contabilidadEnabled: boolean;   // derivado del modulo (D1)
  granjaEnabled: boolean;
}

abstract create(
  data: TenantCreateData,
  tx?: Prisma.TransactionClient,
): Promise<OrganizationConMemberships>;
```

Adapter usa `(tx ?? this.prisma).organization.create({ ... })` con los flags en
el `data`. El nested write de membership se conserva.

**Rationale**: `tx?` opcional mantiene compatibilidad de firma (otros callers no
rompen). Los flags entran como datos derivados, no como `modulo` crudo —
`tenants` ya conoce sus propios flags; el repo no necesita saber del enum
`modulo`.

### D7: Unificación con documento-fisico task 9.1 (absorción)

**Choice**: este change SUBSUME 9.1. La rama `CONTABILIDAD` del switch invoca
AMBOS seeders (`PlanCuentasSeederPort` + `TipoDocumentoFisicoSeederPort`) en la
misma TX. `tenants` inyecta ambos ports cross-module.

**Acción durante apply** (NO ahora): marcar la task 9.1 de
`openspec/changes/documento-fisico/tasks.md` como absorbida por este change, para
evitar doble wiring (proposal R3). El `TipoDocumentoFisicoSeederPort` y su
adapter ya existen (tasks 3.1/4.2 de documento-fisico); este change solo los
cablea desde `tenants` junto al nuevo `PlanCuentasSeederPort`.

**Rationale**: ambos seeds son del vertical Contabilidad y deben ser atómicos
juntos. Un solo punto de orquestación elimina el riesgo de dos mecanismos
distintos de seed-at-creation.

### D8: Errores y atomicidad

**Choice**: si cualquier seeder lanza, la `$transaction` hace rollback → la org
NO se crea (ni la membership). El error de `comercial.ts` ("la plantilla no
sembró todas las cuentas requeridas") es un fail-loud interno (bug de plantilla),
no un error de usuario.

| Fallo | Comportamiento | Tipo de error |
|---|---|---|
| `slug` duplicado (pre-TX) | 409 amigable | `TenantSlugDuplicadoError` (existente) |
| `slug` duplicado (race, UNIQUE en BD dentro de TX) | rollback | mapeado por `GlobalExceptionFilter` (P2002) |
| Plantilla COMERCIAL incompleta | rollback, 500 | `Error` fail-loud de `comercial.ts` (bug, no UX) |

**Logging**: `this.logger.warn`/`error` en el catch de orquestación NO se
agrega — la TX propaga el error y el `GlobalExceptionFilter` ya loguea. Si se
quiere telemetría de provisioning, un `logger.info('tenant provisioned',
{ orgId, modulo })` post-commit es opcional (no bloqueante). No se introduce un
`DomainError` nuevo en este change: los fallos de seed son fallos de
infraestructura/plantilla, no condiciones de dominio del alta.

### D9: Idempotencia

**Choice**: confirmada por construcción. `sembrarPlanCuentasComercial` hace
`prisma.cuenta.upsert` por `(organizationId, codigoInterno)` con `update: {}`
(no toca si existe). `poblarConfiguracionContableRequerida` hace
`orgConfiguracionContable.upsert` por `organizationId`. Re-ejecutar el seed
sobre el mismo tenant NO duplica (mismo invariante que documento-fisico
`upsertSeed`). El alta normal crea un tenant nuevo cada vez; la idempotencia
protege re-runs/retries.

### D10: Hexagonal (CLAUDE.md §3.3 / §3.7)

**Choice**: `tenants` depende SOLO de los ports (`PlanCuentasSeederPort`,
`TipoDocumentoFisicoSeederPort`), NUNCA del concreto `CuentasService` ni de
`PrismaCuentaRepository`. Cumplimiento verificado: hoy no hay cross-import
`tenants↔cuentas` (grep limpio en ambos sentidos).

---

## 3. Data Flow

```
POST /tenants {name, modulo}
        │
        ▼
TenantsService.create ── existsBySlug? ──(409)
        │
        ▼  flagsParaModulo(modulo)
   prisma.$transaction(tx ─────────────────────────────┐
        │                                               │
   repo.create(data+flags, tx) ──► Organization+Membership
        │                                               │
   switch(modulo):                                       │
     CONTABILIDAD ─► PlanCuentasSeederPort.seed(org,tx) ─┤ 111 cuentas + config
                  └► TipoDocFisicoSeederPort.seed(org,tx)┤ 8 tipos-doc
     GRANJA       ─► (placeholder)                        │
     OTROS        ─► (no-op)                              │
        │                                               │
   commit ◄── todo OK / rollback ◄── cualquier throw ───┘
        │
        ▼  OrganizationConMemberships
```

---

## 4. File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/tenants/dto/create-tenant.dto.ts` | Modify | +campo `modulo` (`@IsEnum`, requerido, `@ApiProperty`) |
| `backend/src/tenants/tenants.service.ts` | Modify | `create` envuelto en `$transaction`; `flagsParaModulo`; switch de seeders; inyecta `PrismaService` + 2 seeder ports |
| `backend/src/tenants/ports/tenant.repository.port.ts` | Modify | `create(data, tx?)`; `TenantCreateData` +flags |
| `backend/src/tenants/adapters/prisma-tenant.repository.ts` | Modify | `create` usa `(tx ?? this.prisma)` y persiste flags |
| `backend/src/tenants/tenants.module.ts` | Modify | importa `CuentasModule` + módulo de tipos-doc-fisico; inyecta ports |
| `backend/src/tenants/tenants.service.spec.ts` | Modify | mocks de seeders + casos rollback/flags |
| `backend/src/cuentas/ports/plan-cuentas-seeder.port.ts` | Create | `PlanCuentasSeederPort` + Symbol |
| `backend/src/cuentas/adapters/prisma-plan-cuentas-seeder.adapter.ts` | Create | envuelve `comercial.ts` |
| `backend/src/cuentas/adapters/*.integration.spec.ts` | Create | integration spec del seeder |
| `backend/src/cuentas/cuentas.module.ts` | Modify | provee + exporta `PLAN_CUENTAS_SEEDER_PORT` |
| `backend/src/cuentas/adapters/seed/comercial.ts` | Modify | firmas → `PrismaClient \| Prisma.TransactionClient` (R1); relocado desde `prisma/seeds/prod/planes-cuentas/` por PR #21 (fix Docker `dist/main.js`) |
| `backend/prisma/schema.prisma` | **Sin cambios** | flags + enum ya existen — **NO migration** |

---

## 5. Wiring NestJS

- `cuentas.module.ts`: agrega
  `{ provide: PLAN_CUENTAS_SEEDER_PORT, useClass: PrismaPlanCuentasSeederAdapter }`
  a `providers`, y `PLAN_CUENTAS_SEEDER_PORT` a `exports`.
- `tenants.module.ts`: agrega `CuentasModule` y el módulo de tipos-doc-fisico a
  `imports`; `TenantsService` inyecta `@Inject(PLAN_CUENTAS_SEEDER_PORT)` y
  `@Inject(TIPO_DOCUMENTO_FISICO_SEEDER_PORT)`.
- **Riesgo de ciclo**: NINGUNO hoy (verificado). Dependencia unidireccional
  `tenants → cuentas`. Si en el futuro `cuentas` necesitara `tenants`, usar
  `forwardRef` (CLAUDE.md §3.7). El `forwardRef` existente con
  `PeriodosFiscalesModule` se conserva.

---

## 6. Testing Strategy

| Layer | What | How |
|-------|------|-----|
| Unit | `tenants.service` switch + rollback | mocks de los 2 seeder ports + `repo.create`. Casos: modulo=CONTABILIDAD llama ambos seeders con `org.id`+`tx`; GRANJA setea solo `granjaEnabled` y no llama seeders; OTROS no-op; seeder lanza → la TX no commitea (verificar que el resultado propaga el error y `repo.create` quedó en rollback) |
| Integration | adapter del seeder + `tenants.service` contra Postgres real | `*.integration.spec.ts`: crear org CONTABILIDAD siembra 111 cuentas + `OrgConfiguracionContable` poblada + 8 tipos-doc, todo en UNA TX; un fallo deliberado del seeder hace rollback total (cero cuentas, cero org); idempotencia (correr el adapter 2x → 111 cuentas, no 222) |
| E2E | `POST /tenants` por cada `modulo` | CONTABILIDAD → 201 + GET cuentas devuelve 111 + `contabilidadEnabled=true`; GRANJA → 201 + cero cuentas + `granjaEnabled=true`; OTROS → 201 + ambos flags false; `modulo` ausente/ inválido → 400 |

(Solo descripción — los tests se escriben en apply, TDD strict.)

---

## 7. Scope in / out

- **In**: backend completo — DTO, service+TX, repo port `tx?`, flags derivados,
  `PlanCuentasSeederPort`+adapter, fix R1 de `comercial.ts`, wiring, absorción
  de 9.1, tests unit/integration/e2e.
- **Out**: rubro (`tipoEmpresaPrincipal`) en el alta (diferido); variantes del
  plan por rubro; módulo granja real; cambio de vertical post-creación (re-seed).
- **Frontend (selector de 3 opciones)**: en un change **APARTE** de scope
  `*-ui`, NO en este change. Razón (CLAUDE.md §9.1, un scope por commit): este
  change es backend-puro; mezclar el selector React rompería el single-scope y
  bloquearía el merge del backend por la UI. El contrato HTTP que entrega este
  change es la frontera.

---

## 8. Migration / Rollout

**No migration de schema** (D1). Rollback trivial vía `git revert` del PR: el
DTO, service, port, adapter y el fix de firma de `comercial.ts` se revierten;
las orgs creadas durante la vigencia quedan sembradas con datos válidos
(idempotente, no requieren limpieza). Sin downtime más allá del deploy estándar.

## 9. Open Questions

- Ninguna bloqueante. (Alineación de `tx?`→`tx` en `TipoDocumentoFisicoSeederPort`
  es deuda menor opcional, no bloquea.)
