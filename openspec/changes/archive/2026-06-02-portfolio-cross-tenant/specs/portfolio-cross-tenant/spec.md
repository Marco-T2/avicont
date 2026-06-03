# Delta Spec: portfolio-cross-tenant (Dashboard KPIs + Actividad reciente)

<!--
Última edición: 2026-06-02
Última revisión contra core: 2026-06-02
Owner: backend-lead
-->

> Fecha: 2026-06-02
> Fase: spec
> Change: `portfolio-cross-tenant`
> Proyecto: avicont
> Stack: backend (NestJS + Prisma + PostgreSQL + Redis) + frontend (Vite + React).
> Insumos: `proposal.md` + engram `sdd/portfolio-cross-tenant/proposal` (#632).
> Continúa: `super-admin` (#118-#127), `platform-admin-ui` v1 (#131-#138), `platform-admin-v1.1` (#140-#142).

---

## Propósito de este delta

Convertir la landing vacía de `/platform-admin` en un dashboard real con DOS vistas:

- **Vista A — KPIs agregados** (`GET /admin/platform/dashboard`): conteos de orgs por status,
  plan y vertical, totales de orgs y usuarios, y serie de altas por mes de los últimos 12 meses.
- **Vista B — Actividad reciente** (`GET /admin/platform/activity?limit&cursor&orgId?`):
  timeline paginado por cursor sobre `platform_audit`, con org y actor resueltos.

Ambos endpoints son **org-less**, protegidos por `JwtAuthGuard` + `SuperAdminGuard` y
auditados por `PlatformAuditInterceptor`. La data ya existe; el delta la expone y la muestra.

---

## Glosario

- **Cross-tenant deliberado**: queries que agregan TODAS las orgs sin filtrar por `tenantId`.
  Es CORRECTO en la superficie super-admin. La excepción a Anti-31 está documentada por diseño
  en el JSDoc de los ports y en esta spec (ver REQ-PCT-02 y REQ-PCT-06).
- **Cursor opaco**: string base64 que codifica `{ createdAt: string; id: string }` del último
  ítem recibido. Estable ante inserts concurrentes en `platform_audit` (append-only).
- **Epoch de cursor**: cada página se pide enviando `cursor=<valor>` del request anterior. La
  primera página no lleva cursor; cuando `nextCursor` es `null` se agotaron los ítems.
- **KPIs**: Key Performance Indicators — los conteos y totales de la Vista A.
- **Serie de altas**: array de `{ mes: string; cantidad: number }` ordenado ASC, un elemento por
  mes de los últimos 12 meses (inclusive el mes corriente).
- **`platform_audit`**: tabla append-only con índices `[actorUserId, createdAt]` y
  `[targetOrganizationId, createdAt]` (ya existente desde change `super-admin`).

---

## No-objetivos (OUT of scope — slice futuro)

- **Drill-down financiero por org**: volumen de comprobantes, montos, actividad contable por tenant.
- **Adopción de packs**: conteos de orgs con cada pack habilitado/activado.
- **Charting library dedicada**: la serie de altas se entrega como datos; visualización con primitivos.
- **Streaming / auto-refresh agresivo**: TanStack Query + `staleTime` es suficiente.
- **Exportación CSV/PDF** del portfolio.
- **Mostrar el campo `payload` crudo** del registro de auditoría: solo metadata (action, org, actor, fecha).

---

## Capacidad 1: Endpoint `GET /admin/platform/dashboard` — KPIs agregados

### REQ-PCT-01: Endpoint `/dashboard` — forma de la respuesta

El backend DEBE exponer `GET /admin/platform/dashboard` bajo `JwtAuthGuard` + `SuperAdminGuard`
+ `PlatformAuditInterceptor`. La respuesta DEBE ser un `PlatformDashboardResponseDto` con la
siguiente shape:

```
{
  orgs: {
    total: number;
    porStatus: { ACTIVE: number; SUSPENDED: number; ARCHIVED: number };
    porPlan:   { FREE: number; PRO: number };
    porVertical: { contabilidad: number; granja: number };
  };
  usuarios: {
    total: number;  // prisma.user.count() — todos los usuarios del sistema
  };
  altasPorMes: Array<{ mes: string; cantidad: number }>; // últimos 12 meses, ISO 'YYYY-MM', ASC
}
```

**Reglas:**
- `porVertical.contabilidad` = count de orgs con `contabilidadEnabled = true`.
- `porVertical.granja` = count de orgs con `granjaEnabled = true`.
- `altasPorMes` cubre los últimos 12 meses calendario (inclusive el mes corriente). Si un mes
  no tiene altas, aparece con `cantidad: 0` (no se omite del array).
- `usuarios.total` = `prisma.user.count()` — count global de filas en la tabla `users`, sin
  filtrar por memberships activas.
- El DTO DEBE estar decorado con `@ApiOkResponse` para que entre al OpenAPI dump
  (CLAUDE.md §10.10 — drift-gate de contrato).

#### Escenario: super-admin con datos — respuesta 200 con conteos correctos

- DADO un super-admin autenticado y la BD con orgs en distintos estados (ej: 5 ACTIVE, 2 SUSPENDED, 1 ARCHIVED)
- CUANDO llama `GET /admin/platform/dashboard`
- ENTONCES recibe `200` con `orgs.porStatus.ACTIVE = 5`, `orgs.porStatus.SUSPENDED = 2`, `orgs.porStatus.ARCHIVED = 1`
- Y `orgs.total = 8`
- Y `altasPorMes` tiene exactamente 12 elementos, ordenados ASC por mes

#### Escenario: mes sin altas aparece en la serie con cantidad 0

- DADO que en el mes corriente no se crearon orgs
- CUANDO el SA llama `GET /admin/platform/dashboard`
- ENTONCES el último elemento de `altasPorMes` tiene `cantidad: 0`
- Y el array sigue teniendo 12 elementos (no se omite el mes)

#### Escenario: BD sin orgs — todos los conteos en 0

- DADO una BD sin organizaciones registradas
- CUANDO el SA llama `GET /admin/platform/dashboard`
- ENTONCES todos los conteos son 0 y `altasPorMes` es un array de 12 elementos con `cantidad: 0`

#### Escenario: no-super-admin → 403

- DADO un usuario autenticado con `isSuperAdmin = false` (cualquier rol de tenant)
- CUANDO llama `GET /admin/platform/dashboard`
- ENTONCES recibe `403`
- Y no se devuelve ningún dato de KPIs

#### Escenario: sin token → 401

- DADO un request a `GET /admin/platform/dashboard` sin Bearer token
- CUANDO el guard evalúa la request
- ENTONCES `JwtAuthGuard` rechaza con `401` antes de que `SuperAdminGuard` evalúe

---

### REQ-PCT-02: Port `PlatformStatsReaderPort` — excepción cross-tenant documentada

El backend DEBE definir un `PlatformStatsReaderPort` (abstract class) con al menos:

```
abstract readDashboard(): Promise<PlatformDashboardData>;
```

El JSDoc del método DEBE contener explícitamente:

> "Query cross-tenant deliberada: agrega TODAS las orgs sin filtrar por tenantId.
> Excepción consciente a Anti-31. El enforcement vive en SuperAdminGuard. NO agregar
> filtro tenantId — hacerlo rompe el feature."

**Reglas:**
- El adapter Prisma implementa el port usando `groupBy`/`count` indexados.
- La serie de altas por mes usa `$queryRaw` con `date_trunc('month', "createdAt")` porque
  Prisma `groupBy` no trunca fechas a mes nativamente.
- El resultado raw de `$queryRaw` DEBE tipado explícitamente (cero `any`).
- `ClockPort` (inyectado) provee la fecha corriente para calcular los 12 meses — prohibido
  `new Date()` en el service/adapter (CLAUDE.md §4.6).

#### Escenario: el adapter NO filtra por tenantId (verificación de contrato del port)

- DADO el adapter Prisma implementando `PlatformStatsReaderPort`
- CUANDO se llama `readDashboard()`
- ENTONCES la query a `Organization` NO incluye cláusula `where: { id: tenantId }` ni similar
- Y el resultado agrega todas las orgs del sistema

---

## Capacidad 2: Endpoint `GET /admin/platform/activity` — Timeline paginado

### REQ-PCT-03: Endpoint `/activity` — forma de la respuesta y parámetros

El backend DEBE exponer `GET /admin/platform/activity` con los siguientes query params:
- `limit`: número de ítems por página. Entero positivo, default `20`, máximo `100`.
- `cursor?`: cursor opaco de la página anterior (ausente en la primera página).
- `orgId?`: filtra por `targetOrganizationId` (opcional).

La respuesta DEBE ser un `PlatformActivityResponseDto`:

```
{
  items: Array<{
    id:                    string;
    action:                string;
    createdAt:             string;  // ISO 8601
    targetOrganizationId?: string;
    targetOrgNombre?:      string;  // razonSocial de la org, null si no aplica
    actorUserId:           string;
    actorEmail:            string;
    actorDisplayName?:     string;
  }>;
  nextCursor: string | null;  // null = no hay más páginas
}
```

**Reglas:**
- El campo `payload` de `platform_audit` NO se expone en ningún ítem.
- `targetOrgNombre` se resuelve con `include`/join en la misma query (no loops de lookups).
- `actorEmail` y `actorDisplayName` se resuelven con `include` del user actor, misma query.
- Orden DESC por `createdAt`, desempate por `id` DESC (estable ante timestamps iguales).
- El DTO DEBE estar decorado con `@ApiOkResponse` para el drift-gate de contrato (CLAUDE.md §10.10).
- El cursor opaco codifica `{ createdAt: string; id: string }` del último ítem devuelto.

#### Escenario: primera página — sin cursor, devuelve ítems y nextCursor

- DADO un SA autenticado y `platform_audit` con 35 registros
- CUANDO llama `GET /admin/platform/activity?limit=20`
- ENTONCES recibe `200` con `items` de 20 elementos (los más recientes, DESC)
- Y `nextCursor` es un string no vacío (no `null`)

#### Escenario: segunda página — cursor correcto, sin solapar ni saltear

- DADO la primera página retornó los ítems del ID [35..16] y `nextCursor = <cursor>`
- CUANDO el SA llama `GET /admin/platform/activity?limit=20&cursor=<cursor>`
- ENTONCES recibe `items` con exactamente los ítems [15..1] (los restantes)
- Y `nextCursor` es `null` (no hay más)
- Y ningún ítem de la segunda página aparece en la primera (sin solapamiento)
- Y ningún ítem de [15..1] fue saltado

#### Escenario: última página — nextCursor null

- DADO que la segunda página retorna los ítems restantes (menos de `limit`)
- CUANDO el SA recibe esa página
- ENTONCES `nextCursor` es `null`
- Y `items.length < limit`

#### Escenario: filtro por orgId — solo ítems de esa org

- DADO `platform_audit` con ítems de dos orgs distintas (org-A y org-B)
- CUANDO el SA llama `GET /admin/platform/activity?orgId=org-A`
- ENTONCES todos los ítems de la respuesta tienen `targetOrganizationId = 'org-A'`
- Y no aparece ningún ítem de org-B

#### Escenario: orgId que no existe — lista vacía, no error

- DADO un `orgId` que no corresponde a ninguna org
- CUANDO el SA llama `GET /admin/platform/activity?orgId=org-inexistente`
- ENTONCES recibe `200` con `items: []` y `nextCursor: null`
- Y NO recibe `404`

#### Escenario: cursor inválido / malformado → 400

- DADO un cursor que no es un valor base64 válido o no decodifica a la shape esperada
- CUANDO el SA llama con ese cursor
- ENTONCES el sistema responde `400` con código `PLATFORM_CURSOR_INVALIDO`

#### Escenario: limit fuera de rango → 400

- DADO `limit=0` o `limit=101`
- CUANDO el SA llama con ese parámetro
- ENTONCES el sistema responde `400`

#### Escenario: no-super-admin → 403

- DADO un usuario autenticado con `isSuperAdmin = false`
- CUANDO llama `GET /admin/platform/activity`
- ENTONCES recibe `403`

#### Escenario: sin token → 401

- DADO un request sin Bearer token
- CUANDO llega al endpoint
- ENTONCES `JwtAuthGuard` rechaza con `401`

#### Escenario: `platform_audit` vacío — lista vacía sin error

- DADO una BD con `platform_audit` sin registros
- CUANDO el SA llama `GET /admin/platform/activity`
- ENTONCES recibe `200` con `items: []` y `nextCursor: null`

---

### REQ-PCT-04: Resolución de nombres sin N+1

El adapter Prisma de `PlatformActivityReaderPort.findRecent()` DEBE resolver `targetOrgNombre`,
`actorEmail` y `actorDisplayName` con un único `findMany` con `include` (join), sin loops de
lookups posteriores.

**Regla de seguridad**: el campo `payload` de la fila de `platform_audit` NO DEBE incluirse en
ningún `select` ni mapearse al DTO de respuesta (ni siquiera como campo oculto interno).

#### Escenario: resolución de nombres en una sola query

- DADO `platform_audit` con 5 registros, cada uno con `targetOrganizationId` y `actorUserId`
- CUANDO se llama `findRecent({ limit: 5 })`
- ENTONCES el adapter emite exactamente 1 query a la BD (con joins a `organizations` y `users`)
- Y cada ítem del resultado tiene `targetOrgNombre` y `actorEmail` populados

#### Escenario: payload no expuesto

- DADO un registro en `platform_audit` con `payload` que contiene datos sensibles
- CUANDO se llama `findRecent()`
- ENTONCES el resultado NO incluye ningún campo `payload` en ningún ítem del resultado

---

### REQ-PCT-05: Aislamiento de tenant — el insert concurrente no rompe la paginación

Propiedad de correctitud de la paginación cursor ante inserts concurrentes en `platform_audit`.

**Regla**: dos páginas sucesivas pedidas con el mismo `cursor` no deben solapar ni saltear ítems,
aunque entre la primera y la segunda página se inserten registros nuevos.

#### Escenario: insert concurrente entre páginas no produce duplicados ni gaps

- DADO que el SA recibió la primera página con `nextCursor = <cursor>` (último ítem con createdAt T, id I)
- Y entre la primera y la segunda llamada se insertan N nuevos registros en `platform_audit`
- CUANDO el SA pide la segunda página con `cursor=<cursor>`
- ENTONCES la segunda página contiene exactamente los ítems anteriores al punto de cursor (createdAt < T, o createdAt = T con id < I)
- Y los N nuevos registros NO aparecen en la segunda página

---

### REQ-PCT-06: Port `PlatformActivityReaderPort` — excepción cross-tenant documentada

El backend DEBE definir un `PlatformActivityReaderPort` (abstract class) dedicado, separado de
`PlatformAuditPort` (que es write-only). Su JSDoc DEBE contener explícitamente:

> "Lectura cross-tenant deliberada sobre platform_audit. Excepción consciente a Anti-31.
> El enforcement vive en SuperAdminGuard. NO agregar filtro tenantId."

**Reglas:**
- `PlatformAuditPort` (write) NO se extiende para leer: las responsabilidades de lectura y
  escritura están en puertos separados (patrón del proyecto).
- El port expone al menos: `findRecent(opts: { limit: number; cursor?: string; orgId?: string }): Promise<PlatformActivityPage>`.

---

## Capacidad 3: Frontend — Dashboard en `/platform-admin`

### REQ-PCT-07: Reemplazar `PlatformHomePage` con el dashboard real

El frontend DEBE reemplazar el placeholder de `platform-home-page.tsx` con un componente
contenedor que:
1. Consuma `GET /admin/platform/dashboard` vía hook `usePlatformDashboard` (TanStack Query,
   `staleTime` alto: 5 minutos).
2. Consuma `GET /admin/platform/activity` vía hook `usePlatformActivity` (TanStack Query,
   `useInfiniteQuery` con cursor).
3. Muestre cards de KPI (status / plan / vertical / totales) y la serie de altas.
4. Muestre la lista de actividad reciente con botón "Cargar más" que activa la siguiente página.

**Reglas de UX obligatorias:**
- Header canónico `frontend/CLAUDE.md §13.1`.
- Estados loading (skeleton), empty state en español, error (mensaje en español).
- Dark-mode (§6) y responsive (§7) según convenciones del frontend.
- Tipos de la respuesta desde `types/api.ts` regenerados del OpenAPI (CLAUDE.md §10.10).
  No DTOs a mano.
- El componente vive bajo `PlatformShell` + `RequireSuperAdmin` (igual que el resto del panel).

#### Escenario: dashboard con datos — cards y actividad visibles

- DADO el backend devuelve KPIs y actividad para el SA
- CUANDO el SA navega a `/platform-admin`
- ENTONCES ve cards con los conteos por status (ACTIVE/SUSPENDED/ARCHIVED), por plan (FREE/PRO)
  y por vertical (contabilidad/granja)
- Y ve la serie de altas por mes
- Y ve la lista de actividad reciente con acción, org, actor y fecha por ítem

#### Escenario: loading — skeleton visible antes de datos

- DADO las queries están en vuelo
- CUANDO se monta el dashboard
- ENTONCES se muestran skeletons (no contenido vacío, no error)

#### Escenario: empty state — sin orgs ni actividad

- DADO el backend devuelve conteos en 0 e items vacíos
- CUANDO se monta el dashboard
- ENTONCES se muestran los conteos en 0 y un mensaje de empty state en español para la actividad
  ("No hay actividad registrada")

#### Escenario: error de red — mensaje en español

- DADO la query falla con 500 o error de red
- CUANDO se monta el dashboard
- ENTONCES se muestra un mensaje de error en español (no los cards ni la tabla)

#### Escenario: botón "Cargar más" — carga la segunda página sin solapar

- DADO el SA ve la primera página de actividad (20 ítems)
- CUANDO pulsa "Cargar más"
- ENTONCES se añaden los ítems de la segunda página al final de la lista
- Y no hay ítems duplicados ni faltantes

#### Escenario: "Cargar más" desaparece al agotar páginas

- DADO que `nextCursor` de la última página es `null`
- CUANDO se renderiza la lista
- ENTONCES el botón "Cargar más" no se muestra (o está deshabilitado)

#### Escenario: ruta gateada — no-SA redirige a `/`

- DADO un usuario sin `isSuperAdmin` que navega directamente a `/platform-admin`
- CUANDO se monta `RequireSuperAdmin`
- ENTONCES redirige a `/` con `<Navigate replace>`
- Y el backend devolvería `403` si cualquiera de las queries llegara

---

### REQ-PCT-08: Funciones `api/` — convención del panel

El frontend DEBE implementar:
- `api/get-platform-dashboard.ts`: función pura que llama `GET /admin/platform/dashboard` vía
  `@/lib/api`. Devuelve el tipo generado de `types/api.ts`.
- `api/get-platform-activity.ts`: función pura que llama `GET /admin/platform/activity` con
  `{ limit, cursor?, orgId? }`. Devuelve el tipo generado de `types/api.ts`.

Ambas funciones siguen el patrón de las funciones `api/` existentes en `platform-admin/`.

---

## Capacidad 4: Contrato OpenAPI — drift-gate

### REQ-PCT-09: DTOs decorados con `@ApiOkResponse`

Los dos DTOs de respuesta nuevos (`PlatformDashboardResponseDto`, `PlatformActivityResponseDto`)
DEBEN estar decorados con `@ApiOkResponse` y sus propiedades con los decoradores `@ApiProperty`
necesarios para que aparezcan en el OpenAPI dump (`openapi.json`).

Tras el merge, correr `pnpm openapi:dump && pnpm gen:api-types` no DEBE producir cambios en
`frontend/src/types/api.generated.ts` (el CI `contract-drift` debe mantenerse verde).

#### Escenario: dump + gen no produce diff tras implementación

- DADO los DTOs decorados y el endpoint implementado
- CUANDO se corre `pnpm openapi:dump && pnpm gen:api-types` en el proyecto
- ENTONCES `git diff frontend/src/types/api.generated.ts` no produce cambios
- Y el job CI `contract-drift` pasa sin errores

---

## Códigos de error

| Código | HTTP | Descripción |
|--------|------|-------------|
| `PLATFORM_CURSOR_INVALIDO` | 400 | El cursor recibido no es válido o no decodifica a la shape esperada |

> Los códigos 401 (`JwtAuthGuard`) y 403 (`SuperAdminGuard`) son estándar del sistema;
> no requieren código de error de dominio propio (mismo patrón que el resto del panel).

---

## Notas de impacto sobre el core (CLAUDE.md)

- **§4.2 (Multi-tenant estricto)**: los dos ports nuevos constituyen excepción consciente.
  Documentados en JSDoc (REQ-PCT-02, REQ-PCT-06) como "cross-tenant deliberado".
  Ningún invariante de dominio contable (§4.1–§4.9) se toca.
- **§10.1 Riel de packs**: este change NO agrega métricas de adopción de packs (out of scope).
- **`platform_audit`**: se lee (no escribe). El índice `[targetOrganizationId, createdAt]`
  existente soporta el filtro por `orgId`. No se agrega migración.
- **CLAUDE.md §10.10 drift-gate**: dos DTOs nuevos → regenerar `api.generated.ts` y `types/api.ts`
  tras la implementación, o el CI `contract-drift` fallará.
