# Skill Registry — avicont

> Pre-resolved compact rules for sub-agent injection. The orchestrator reads this
> ONCE per session and injects matching `## Project Standards (auto-resolved)`
> blocks into every sub-agent prompt that reads, writes, or reviews code.

## Project Conventions (root)

- `CLAUDE.md` — fuente de verdad arquitectural (§1 idioma/nomenclatura, §2 código, §3 hexagonal estricto, §4 invariantes contables, §9 git, §10 índice de decisiones, §11 runbook, §12 docs extendidos).
- `docs/claude/dominio-contable.md` — detalle del dominio (decimales, partida doble, period lock, multi-moneda, UFV, LCV, plan de cuentas).
- `docs/claude/seguridad.md` — JWT/refresh/impersonation/RBAC.
- `docs/claude/errores-y-logs.md` — DomainError, GlobalExceptionFilter, redacción.
- `docs/claude/testing.md` — Honeycomb 60/25/10/5, sufijos, factories.
- `docs/claude/antipatrones.md` — 42 antipatrones; pasada obligatoria al revisar PR propio.
- `docs/deudas-arquitecturales.md` — estado vivo de deudas. Cero módulos Fase 0 sin hexagonalizar (snapshot 2026-04-25).

## Compact Rules — code-context bindings

### Trigger: editar `backend/src/**/domain/**`

**Standards**:
- Dominio puro: NO importar NestJS, Prisma runtime, ni librerías externas. `import type` de Prisma sí está permitido (divergencia aceptada §5 doc deudas).
- Value objects: `private constructor`, `static of(raw)` o `static fromX(...)`, métodos `toString()` y `equals(other)`. Self-validating en el factory.
- Errores de dominio: extender `DomainError` (NotFoundError/ConflictError/ValidationError/ForbiddenError/UnauthorizedError/InvalidStateError/ExternalServiceError). Code `{MODULO}_{SUBDOMINIO}_{CONDICION}` ESTABLE.
- `new Date()` PROHIBIDO en `domain/` y `*.service.ts` — usar `ClockPort.hoyEnLaPaz()` cuando se necesite tiempo.
- Idioma: nombres de clase y archivos en español (`Asiento`, `Comprobante`, `Cuenta`, `LineaComprobante`).
- Spec hermana `*.spec.ts` al lado del archivo, sin DB, sin NestJS.

### Trigger: editar `backend/src/**/ports/**`

**Standards**:
- `abstract class XxxPort` (no `interface`) para que NestJS pueda inyectar por la clase como token, además del `Symbol('XXX_PORT')`.
- Superficie mínima — exponer SOLO los métodos que el consumer concreto necesita. Si un caller solo necesita `belongsToTenant`, expone solo eso.
- JSDoc obligatorio en cada método del port (es el contrato público del módulo).
- Cross-module port → owner-owned: el módulo dueño del dominio define qué se puede leer de él (CLAUDE.md §3.7).
- Tipos de retorno proyectados al shape exacto del consumer; no exponer entidades Prisma completas si solo se necesita un subset.

### Trigger: editar `backend/src/**/adapters/**`

**Standards**:
- Adapter Prisma `extends XxxPort` y `super()` en constructor. Inyecta `PrismaService`.
- Toda query DEBE filtrar por `tenantId` (Anti-31, defense in depth). Excepto catálogos compartidos (PUCT, CotizacionUfv, TipoCambio) que no tienen tenantId.
- Prisma usa `@db.Decimal` para dinero (BOB/USD 18,2 / UFV 14,5 / TC 14,8 / % 5,4 / cantidades 18,6). En TS, `Money` value object con `decimal.js`.
- Integration spec hermana `*.integration.spec.ts` contra Postgres real (docker compose), patrón: `beforeAll` connect, `beforeEach` cleanup + setup, `afterAll` cleanup + disconnect. Crea `Organization` + `User` + dependencias mínimas.

### Trigger: editar `backend/src/**/*.service.ts`

**Standards**:
- Inyecta SOLO ports (cross-module y propios) — NUNCA services concretos de otro módulo. Excepción: services del mismo módulo OK.
- Throws SOLO `DomainError` subclasses; no `HttpException` directo. El `GlobalExceptionFilter` mapea ambos pero código nuevo usa DomainError.
- Patch parcial al persistir: `...(field !== undefined ? { field } : {})` por `exactOptionalPropertyTypes`.
- Tipo: `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`. Cero `any` en código de prod.
- Spec hermana `*.spec.ts` con ports mockeados (15-25 tests típico) o e2e completo si el flow cruza HTTP.

### Trigger: editar `backend/src/**/*.controller.ts`

**Standards**:
- Decoradores: `@ApiTags`, `@ApiBearerAuth('JWT-auth')`, `@Controller('en-español')`, `@UseGuards(JwtAuthGuard, TenantGuard?, PermissionsGuard?)`.
- `@RequirePermissions('modulo.recurso.accion')` para permisos del catálogo RBAC.
- DTOs con `class-validator` + `@ApiProperty`/`@ApiPropertyOptional`.
- URLs de recursos del dominio en español (`/api/asientos`, `/api/contactos`); técnicas en inglés (`/api/auth`, `/api/health`).
- El controller NO contiene lógica de negocio — solo transforma HTTP ↔ service.

### Trigger: editar `backend/src/**/*.module.ts`

**Standards**:
- Wiring: `{ provide: XXX_PORT, useExisting: XxxAdapter }` (NO `useClass` cuando ya está como provider) o `useClass` si no hay provider directo.
- Exporta SOLO ports — no services concretos. Service del módulo es interno; sus consumers van por port.
- `forwardRef(() => OtherModule)` para ciclos (memberships ↔ users, comprobantes ↔ periodos-fiscales).
- `PrismaService` + `TenantContextService` listados como providers per-module (patrón aceptado, fuera de scope migrar a PrismaModule global).

### Trigger: editar `backend/prisma/schema.prisma`

**Standards**:
- Toda entidad de dominio con `tenantId String` indexado y FK a `Organization`. Catálogos compartidos exceptos (PUCT, CotizacionUfv, TipoCambio).
- Decimales con `@db.Decimal(p, s)` exacto: BOB/USD `(18,2)`, UFV `(14,5)`, TC `(14,8)`, `%` `(5,4)`, cantidades `(18,6)`.
- `FechaContable` como `@db.Date` (sin time, sin timezone). `createdAt`/`updatedAt` como `DateTime @db.Timestamptz`.
- UNIQUE constraints para invariantes (Anti-22): `(tenantId, ...)` siempre. Defense in depth: UNIQUE en BD + chequeo en service.
- NO soft-delete en contabilidad (`Comprobante`, `Asiento`, `Factura`, `LineaComprobante`) — solo `ANULADO` con reversión de balances.
- Migration con nombre descriptivo: `npx prisma migrate dev --name add-documento-fisico`.

### Trigger: editar `backend/test/**.e2e-spec.ts`

**Standards**:
- Setup full stack via `Test.createTestingModule({ imports: [AppModule] })` + `app.init()` + `app.use()` global pipes/filters/interceptors igual que `main.ts`.
- Helpers de `test/helpers/test-factory.ts` para crear orgs/users/memberships. `ensurePuctSeeded()` en `beforeAll` si el test toca cuentas.
- Auth: usa `app.getHttpServer()` con Supertest, login real o token firmado a mano con `JWT_ACCESS_SECRET=test-secret`.
- `--runInBand --forceExit` obligatorio para e2e.

### Trigger: cualquier cambio en `backend/src` o tests

**Standards**:
- Verde entre commits: `npx tsc --noEmit -p tsconfig.json` + suite del subsistema.
- Conventional commits inglés con scope del módulo: `feat(comprobante): ...`, `refactor(tenants): ...`. NUNCA `Co-Authored-By:`. NUNCA `--no-verify`.
- Squash merge only; commits atómicos pequeños.

## Persistence

- Engram disponible: `mem_save`/`mem_search` para decisiones, bugfixes, descubrimientos.
- Engram convention: `topic_key` estable para upserts; títulos verbo+qué.
- Save proactivo después de: decisión arquitectural, bug fix con root cause, convención nueva, descubrimiento no obvio.
