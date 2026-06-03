# Tasks: portfolio-cross-tenant (Dashboard KPIs + Actividad reciente)

> TDD strict: cada tarea de producción va precedida de su tarea de test (RED → GREEN).
> Batches son independientes entre sí pero tienen dependencias internas.
> Verde entre batches: `pnpm exec tsc --noEmit -p tsconfig.json`.

---

## Batch 1 — Backend núcleo puro sin DB (cursor codec + error de dominio)

- [x] 1.1 **[TEST]** Unit `platform/lib/activity-cursor.spec.ts`: roundtrip encode→decode válido; decode de base64 malformado → lanza `PlatformActivityCursorInvalidoError`; decode de JSON sin shape → lanza el error.
- [x] 1.2 **[IMPL]** `platform/lib/activity-cursor.ts`: `encode({ createdAt, id })→string` (base64) y `decode(str)→{createdAt,id}` (lanza `PlatformActivityCursorInvalidoError` ante malformado).
- [x] 1.3 **[IMPL]** `platform/domain/platform-errors.ts` (ya existe): agregar `PlatformActivityCursorInvalidoError extends BadRequestError` con código `PLATFORM_CURSOR_INVALIDO`.

---

## Batch 2 — Backend ports + DTOs de dominio

- [x] 2.1 **[IMPL]** `platform/ports/platform-stats-reader.port.ts`: abstract class `PlatformStatsReaderPort` con `readDashboard(): Promise<PlatformDashboardData>`; JSDoc con excepción cross-tenant Anti-31.
- [x] 2.2 **[IMPL]** `platform/ports/platform-activity-reader.port.ts`: abstract class `PlatformActivityReaderPort` con `findRecent(opts): Promise<PlatformActivityPage>`; JSDoc con excepción cross-tenant Anti-31. Tipos `PlatformActivityPage` y `PlatformActivityItem` definidos inline o en `platform/domain/`.
- [x] 2.3 **[IMPL]** DTOs de respuesta en `platform/dto/`: `OrgStatusCountDto`, `OrgPlanCountDto`, `AltasPorMesDto`, `PlatformDashboardResponseDto` — todos con `@ApiProperty` completo y `@ApiOkResponse` en el controller (se decorará en batch 3).
- [x] 2.4 **[IMPL]** DTOs de actividad: `PlatformActivityItemDto`, `PlatformActivityResponseDto`, `PlatformActivityQueryDto` (`limit @Min(1)@Max(100)@Default(20)`, `cursor?`, `orgId? @IsUUID`).

---

## Batch 3 — Backend adapters + service + controller wiring

- [x] 3.1 **[TEST]** Integration spec `tenants/adapters/prisma-platform-stats-reader.adapter.integration.spec.ts`: groupBy/count correcto por status/plan/vertical; serie 12 meses con mes vacío → cantidad 0; BD vacía → todos ceros.
- [x] 3.2 **[IMPL]** `tenants/adapters/prisma-platform-stats-reader.adapter.ts`: `groupBy` para status/plan/vertical; `$queryRaw date_trunc('month',...)` para altas 12 meses; `ClockPort` inyectado para calcular ventana; narrowing estricto del raw (cero `any`).
- [x] 3.3 **[TEST]** Integration spec `platform/adapters/prisma-platform-activity-reader.adapter.integration.spec.ts`: cursor page1→page2 sin solapamiento; filtro orgId; orgId inexistente → lista vacía; include actor+org en una sola query; campo payload NO presente en resultado.
- [x] 3.4 **[IMPL]** `platform/adapters/prisma-platform-activity-reader.adapter.ts`: `findMany` con `include:{actor:{select:{email,displayName}},targetOrganization:{select:{name}}}`, predicado cursor OR, orden `createdAt DESC, id DESC`, take `limit+1` para detectar `nextCursor`.
- [x] 3.5 **[TEST]** Unit `platform-admin.service.spec.ts` (ya existe, ampliar): `getDashboard()` orquesta `PlatformStatsReaderPort.readDashboard`; `getActivity()` decodifica cursor via lib, propaga `PlatformActivityCursorInvalidoError` en cursor inválido, pasa opts al port.
- [x] 3.6 **[IMPL]** `platform-admin.service.ts`: agregar `getDashboard()` y `getActivity(query)` — inyectar `PlatformStatsReaderPort` y `PlatformActivityReaderPort`.
- [x] 3.7 **[IMPL]** `platform-admin.controller.ts`: endpoints `GET /dashboard` y `GET /activity` con `@ApiOkResponse` en ambos y `@ApiQuery` para `PlatformActivityQueryDto`; guard chain ya existente (`JwtAuthGuard+SuperAdminGuard+PlatformAuditInterceptor`).
- [x] 3.8 **[IMPL]** `platform.module.ts`: registrar `PlatformStatsReaderPort → PrismaOrgsReaderAdapter` (importar de `TenantsModule`) y `PlatformActivityReaderPort → PrismaActivityReaderAdapter`.
- [x] 3.9 **[TEST]** E2E `test/platform-dashboard.e2e-spec.ts`: SA → 200 `/dashboard` con shape correcta; SA → 200 `/activity` page1+page2 sin solapamiento; filtro orgId; no-SA → 403; sin token → 401; cursor inválido → 400 `PLATFORM_CURSOR_INVALIDO`.
- [x] 3.10 **[IMPL]** Regenerar `backend/openapi.json`: `cd backend && pnpm run openapi:dump`.

---

## Batch 4 — Frontend api functions + hooks + types/api.ts

- [x] 4.1 **[IMPL]** Regenerar `frontend/src/types/api.generated.ts` y actualizar `frontend/src/types/api.ts` con alias `PlatformDashboard`, `PlatformActivity`, `PlatformActivityItem` desde los schemas generados.
- [x] 4.2 **[IMPL]** `frontend/src/features/platform-admin/api/get-platform-dashboard.ts`: función pura `GET /admin/platform/dashboard` → tipo `PlatformDashboard`.
- [x] 4.3 **[IMPL]** `frontend/src/features/platform-admin/api/get-platform-activity.ts`: función pura `GET /admin/platform/activity?limit&cursor?&orgId?` → tipo `PlatformActivity`.
- [ ] 4.4 **[TEST]** Unit `hooks/use-platform-dashboard.test.ts`: TanStack Query mock; devuelve data; estado loading; estado error. *(Cubierto por el test del container page; hook trivial — omitido per §9 de frontend/CLAUDE.md)*
- [x] 4.5 **[IMPL]** `frontend/src/features/platform-admin/hooks/use-platform-dashboard.ts`: `useQuery` con `staleTime: 60_000`.
- [ ] 4.6 **[TEST]** Unit `hooks/use-platform-activity.test.ts`: `useInfiniteQuery` mock. *(Cubierto por el test del container page; hook trivial — omitido per §9 de frontend/CLAUDE.md)*
- [x] 4.7 **[IMPL]** `frontend/src/features/platform-admin/hooks/use-platform-activity.ts`: `useInfiniteQuery`, `getNextPageParam: (page) => page.nextCursor ?? undefined`.

---

## Batch 5 — Frontend componentes + PlatformHomePage

- [x] 5.1 **[TEST]** Unit `components/kpi-card.test.tsx`: renderiza label y valor; clase CSS correcta.
- [x] 5.2 **[IMPL]** `frontend/src/features/platform-admin/components/kpi-card.tsx`: card simple (label, valor, label opcional).
- [x] 5.3 **[TEST]** Unit `components/dashboard-kpis.test.tsx`: renderiza cards de status/plan/vertical y totales; sin sección vertical cuando lista vacía.
- [x] 5.4 **[IMPL]** `frontend/src/features/platform-admin/components/dashboard-kpis.tsx`: grid de cards con secciones por grupo; dark-mode+responsive.
- [x] 5.5 **[TEST]** Unit `components/altas-chart.test.tsx`: renderiza N barras (1 por mes); empty state; aria-label.
- [x] 5.6 **[IMPL]** `frontend/src/features/platform-admin/components/altas-chart.tsx`: barras con primitivos HTML/CSS (sin charting lib externa); 12 meses fijos.
- [x] 5.7 **[TEST]** Unit `components/activity-timeline.test.tsx`: renderiza ítems; "Cargar más" visible si `hasNextPage`; oculto si `!hasNextPage`; clic dispara `onFetchMore`; empty state en español; "No hay más actividad".
- [x] 5.8 **[IMPL]** `frontend/src/features/platform-admin/components/activity-timeline.tsx`: lista, botón "Cargar más", skeleton, empty state "Sin actividad registrada.", "No hay más actividad."
- [x] 5.9 **[TEST]** Unit `pages/platform-home-page.test.tsx`: renderiza dashboard con datos mockeados; skeleton en loading; errores en español; empty states.
- [x] 5.10 **[IMPL]** `frontend/src/features/platform-admin/pages/platform-home-page.tsx`: reemplazar placeholder; componer `DashboardKpis` + `AltasChart` + `ActivityTimeline`; header canónico §13.1.

---

## Batch 6 — Verde full + verificación contrato

- [ ] 6.1 Correr suite completa backend: `DATABASE_URL=... pnpm exec jest src/ --passWithNoTests` + `pnpm exec jest test/ --runInBand --forceExit`.
- [x] 6.2 Correr suite frontend: `pnpm exec vitest run`. → 1054/1054 ✅
- [x] 6.3 Typecheck frontend: `cd frontend && pnpm exec tsc -b`. → limpio ✅
- [x] 6.4 Gate contract-drift (frontend): `pnpm run gen:api-types` re-ejecutado — api.generated.ts y api.ts en sync ✅
- [x] 6.5 Lint frontend: `pnpm run lint`. → 0 errores ✅
