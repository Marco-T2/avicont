# Tasks: Org Status Enforcement

## Phase 1: Infraestructura (base de la que depende todo lo demás)

- [ ] 1.1 Crear `src/common/errors/org-status-no-activa.error.ts` — `OrgStatusNoActivaError extends ForbiddenError`, code `ORG_STATUS_NO_ACTIVE`, mensaje ES, `details:{status}`.
- [ ] 1.2 Exportar `OrgStatusNoActivaError` desde `src/common/errors/index.ts`.
- [ ] 1.3 Crear `src/common/ports/org-status-reader.port.ts` — abstract class `OrgStatusReaderPort` con `getStatus(id: string): Promise<OrganizationStatus | null>`.
- [ ] 1.4 Crear `src/common/decorators/allow-on-non-active-org.decorator.ts` — `SetMetadata('allowOnNonActiveOrg', true)`.

## Phase 2: Adapter Prisma (requiere Phase 1)

- [ ] 2.1 **[RED]** Crear `src/tenants/adapters/prisma-org-status-reader.adapter.integration.spec.ts` — test contra Postgres real: devuelve `ACTIVE` para org conocida, `null` para id inexistente.
- [ ] 2.2 **[GREEN]** Crear `src/tenants/adapters/prisma-org-status-reader.adapter.ts` — implementa `OrgStatusReaderPort`, `findUnique({where:{id}, select:{status}})`.
- [ ] 2.3 Registrar y exportar el adapter en `src/tenants/tenants.module.ts` con token `ORG_STATUS_READER_PORT`.

## Phase 3: Guard principal (requiere Phase 1 y Phase 2)

- [ ] 3.1 **[RED]** Crear `src/common/guards/org-status.guard.spec.ts` con la matriz completa de unit tests:
  - Status ACTIVE + POST → `true` (no bloquea)
  - Status SUSPENDED + POST → lanza `OrgStatusNoActivaError` con `details.status='SUSPENDED'`
  - Status ARCHIVED + DELETE → lanza `OrgStatusNoActivaError` con `details.status='ARCHIVED'`
  - GET/HEAD/OPTIONS + cualquier status → `true`
  - `isSuperAdmin=true` + SUSPENDED + POST → `true` (bypass)
  - Sin token (JWT inválido/ausente) → `true` (transparente)
  - Sin `tenantId` en claims → `true` (transparente)
  - `getStatus` devuelve `null` → `true` (transparente, no existe la org)
  - Cache hit → `true` sin llamar al port
  - Cache miss → llama port, setea cache, evalúa
  - Redis falla → `logger.warn` + fallback BD, no rompe request
  - `@AllowOnNonActiveOrg()` presente + SUSPENDED + POST → `true`
- [ ] 3.2 **[GREEN]** Crear `src/common/guards/org-status.guard.ts`:
  - Inyecta `JwtService`, `ORG_STATUS_READER_PORT`, `RedisService`, `Reflector`, `LoggerPort`.
  - `canActivate`: decodifica JWT best-effort (`JwtService.verify` con `JWT_ACCESS_SECRET`), extrae `activeTenantId` e `isSuperAdmin`.
  - Bypass: sin token, sin `tenantId`, SA, GET/HEAD/OPTIONS, decorator presente → `return true`.
  - Cache get `org-status:<tenantId>` → miss → `getStatus` → cache set TTL 300s (fallo Redis → warn + continúa).
  - `status !== ACTIVE` → `throw new OrgStatusNoActivaError({ status })`.
- [ ] 3.3 Exportar `OrgStatusGuard` desde `src/common/guards/index.ts`.

## Phase 4: Wiring en AppModule (requiere Phase 3)

- [ ] 4.1 En `src/app.module.ts`: importar `JwtModule.register({ secret: configService.get('JWT_ACCESS_SECRET') })` (necesario para inyectar `JwtService` en el guard).
- [ ] 4.2 En `src/app.module.ts`: asegurar que `TenantsModule` esté importado (para que `ORG_STATUS_READER_PORT` sea resolvible).
- [ ] 4.3 En `src/app.module.ts`: registrar `{ provide: APP_GUARD, useClass: OrgStatusGuard }` (después de `ThrottlerGuard` si existe).

## Phase 5: Invalidación de caché (requiere Phase 2)

- [ ] 5.1 **[RED]** En el spec existente de `PlatformAdminService` (o uno nuevo `platform-admin.service.spec.ts`), agregar test: `actualizarStatus` llama `redisService.del('org-status:<orgId>')` tras el update.
- [ ] 5.2 **[GREEN]** En `src/platform/platform-admin.service.ts`: inyectar `RedisService` si no está; en `actualizarStatus` llamar `await this.redis.del(\`org-status:${orgId}\`)` después del `update`.

## Phase 6: Tests E2E (requiere Phase 4 + Phase 5)

- [ ] 6.1 Crear `test/org-status-enforcement.e2e-spec.ts`:
  - Setup: crear org ACTIVE, obtener JWT usuario normal + JWT SA.
  - Scenario A: POST en org ACTIVE → 201 (no bloqueado).
  - Scenario B: GET en org SUSPENDED → 200 (lectura libre).
  - Scenario C: POST en org SUSPENDED → 403, body `{error:{code:'ORG_STATUS_NO_ACTIVE',…}}`.
  - Scenario D: DELETE en org ARCHIVED → 403, `details.status='ARCHIVED'`.
  - Scenario E: SA + POST en org SUSPENDED → no-403 (bypass SA).
  - Scenario F: `PATCH /admin/platform/orgs/:id/status` a SUSPENDED → siguiente POST del user → 403 (sin esperar TTL, caché invalidado).

## Phase 7: Verificación final

- [ ] 7.1 `cd backend && pnpm exec tsc --noEmit -p tsconfig.json` — 0 errores.
- [ ] 7.2 `cd backend && pnpm run lint` — 0 warnings nuevos.
- [ ] 7.3 `cd backend && pnpm exec jest src/common/guards/org-status.guard.spec.ts` — todos verdes (unit).
- [ ] 7.4 `cd backend && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" pnpm exec jest src/tenants/adapters/prisma-org-status-reader.adapter.integration.spec.ts` — verde (integration).
- [ ] 7.5 `cd backend && DATABASE_URL="..." JWT_ACCESS_SECRET="..." JWT_REFRESH_SECRET="..." pnpm exec jest test/org-status-enforcement.e2e-spec.ts --runInBand --forceExit` — todos los scenarios verdes.
- [ ] 7.6 Regresión completa: `DATABASE_URL="..." ... pnpm exec jest test/ --runInBand --forceExit` — sin regresiones en suite E2E existente.
