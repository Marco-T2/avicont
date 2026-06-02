# Tasks: tipos-compartidos-openapi

Orden de ejecución estricto. Strict TDD donde aplique (marcado `[TDD]`).
Cada grupo termina con su verificación local antes de avanzar.

Convención de commits: `build`/`infra` para tooling, `cuentas`/`reportes`/etc.
para los fixes de DTO por módulo. Sin Co-Authored-By. Squash al mergear.

---

## A. Backend — script de dump + `openapi.json`

- [ ] A1. Extraer la construcción del config Swagger a `backend/src/openapi/build-openapi-config.ts` (función `buildOpenApiConfig()` que devuelve el `DocumentBuilder().build()` con title/version/bearer/apiKey/tags idénticos a `main.ts`).
- [ ] A2. Refactor `src/main.ts` para usar `buildOpenApiConfig()` en lugar del `DocumentBuilder` inline (no cambia comportamiento; verificar que `/docs` sigue igual).
- [ ] A3. Crear `backend/scripts/dump-openapi.ts`: `NestFactory.create(AppModule, { logger: false })` + `setGlobalPrefix('api')` + `SwaggerModule.createDocument` + `writeFileSync` de `openapi.json` (2 spaces, newline final) + `app.close()` + `process.exit(0/1)`. SIN `app.listen()`.
- [ ] A4. Agregar pnpm script `"openapi:dump": "ts-node scripts/dump-openapi.ts"` en `backend/package.json`.
- [ ] A5. Correr `DATABASE_URL=... REDIS_HOST=localhost pnpm run openapi:dump` (con Postgres+Redis arriba) → genera `backend/openapi.json`. Verificar que el proceso termina solo (sin colgarse) y que el archivo tiene `components.schemas`.
- [ ] A6. Verificar determinismo: correr el dump dos veces, `git diff backend/openapi.json` debe ser vacío en la 2da. Si no, ordenar claves de `components.schemas` antes de serializar.
- [ ] A7. Commit `build(infra): script openapi:dump y artefacto openapi.json` (incluye `openapi.json` inicial — aún SIN los DTOs del grupo B; se regenera al final de B).

## B. Backend — decorar DTOs de response ausentes (prerequisito duro)

> Por cada DTO: convertir `interface`→`class` con `@ApiProperty`, anotar el
> controller con `@ApiOkResponse({ type })`, y verificar que aparece en el
> OpenAPI regenerado. `[TDD]`: cuando un módulo tenga test e2e que valide el
> shape de response, correrlo; además agregar/usar un assert de que el schema
> existe en el dump.

### B0. Auditoría
- [ ] B0. Confirmar el inventario exacto (ya verificado en exploración): 8 archivos interface-pura (cuenta, me-permissions, user, configuracion, libro-diario, libro-mayor, balance, eeff-resultados) + 5 interfaces wrapper `Listar*ResponseDto` (contactos, comprobantes, documentos-fisicos, lote, tipo-documento-fisico). Re-grep `export interface .*ResponseDto` por si entró algo nuevo.

### B1. DTOs planos
- [ ] B1.1. `cuentas/dto/cuenta-response.dto.ts`: `CuentaResponseDto`, `CuentaListResponseDto` → class; `CuentaTreeNodeDto` → class con `@ApiProperty({ type: () => [CuentaTreeNodeDto] }) hijas`. Tipar `createdAt`/`updatedAt` como `string`. Ajustar `toCuentaResponse` si tipa `Date`. Commit `fix(cuentas): cuenta-response.dto como class con @ApiProperty`.
- [ ] B1.2. `cuentas/*.controller.ts`: `@ApiOkResponse({ type })` en findAll/tree/byId. Verificar `CuentaResponseDto` presente en el dump.
- [ ] B1.3. `me/dto/me-permissions-response.dto.ts` → class + controller anotado. Commit `fix(me): me-permissions-response como class`.
- [ ] B1.4. `users/dto/user-response.dto.ts` → class + controller anotado. Commit `fix(users): user-response como class`.
- [ ] B1.5. `configuracion-contable/dto/configuracion-response.dto.ts` → class + controller. Commit `fix(configuracion-contable): response dto como class`.

### B2. DTOs de reportes (anidados / recursivos)
- [ ] B2.1. `reportes/dto/libro-diario-response.dto.ts` → todas las interfaces a class con `@ApiProperty({ type: () => [...] })` para los anidados. Controller anotado. Commit `fix(reportes): libro-diario response dtos como class`.
- [ ] B2.2. `reportes/dto/libro-mayor-response.dto.ts` → idem (cuidado con `*Calculada` interno que NO va al wire: solo decorar los DTOs de salida, no los tipos de cálculo interno). Commit.
- [ ] B2.3. `reportes/dto/balance-response.dto.ts` → árbol Seccion→Subseccion→Cuenta a class; separar los tipos `*Calculada` internos (NO decorar) de los DTOs de salida (decorar). Commit `fix(reportes): balance response dtos como class`.
- [ ] B2.4. `reportes/dto/eeff-resultados-response.dto.ts` → idem balance. Commit.
- [ ] B2.5. Controllers de reportes: `@ApiOkResponse({ type })` en cada endpoint (libro-diario, libro-mayor, balance, estado-resultados).

### B3. Wrappers de listado
- [ ] B3.1. Convertir a class las interfaces wrapper en: `ListarContactosResponseDto`, `ListarComprobantesResponseDto`, `ListarDocumentosFisicosResponseDto`, `ListarLotesResponseDto`, `ListarTiposDocumentoFisicoResponseDto`. Anotar el endpoint de listado de cada controller con `@ApiOkResponse({ type })`. Commits por módulo (`fix(contactos): ...`, etc.).

### B4. Verificación grupo B
- [ ] B4.1. Regenerar: `pnpm run openapi:dump`. Confirmar que TODOS los DTOs antes ausentes ahora están en `components.schemas` (grep del dump por cada nombre).
- [ ] B4.2. `pnpm exec tsc --noEmit` backend limpio.
- [ ] B4.3. `pnpm run lint` backend limpio.
- [ ] B4.4. Correr e2e de los módulos tocados (`jest test/` de cuentas, reportes, contactos, comprobantes, docs-fisicos, granja) → verdes.
- [ ] B4.5. Commit `build(infra): regenerar openapi.json con DTOs de response` (el `openapi.json` ahora completo).

## C. Frontend — openapi-typescript + generado

- [ ] C1. `pnpm add -D openapi-typescript` en `frontend/`.
- [ ] C2. Agregar script `"gen:api-types": "openapi-typescript ../backend/openapi.json -o src/types/api.generated.ts"` en `frontend/package.json`.
- [ ] C3. Correr `pnpm run gen:api-types` → genera `src/types/api.generated.ts`. Cabecera "AUTOGENERADO — DO NOT EDIT".
- [ ] C4. Excluir el generado del lint si genera ruido (ignore en eslint config). Verificar `pnpm run lint` no rompe por el generado.
- [ ] C5. Commit `build(infra): openapi-typescript + api.generated.ts en frontend`.

## D. Frontend — fachada `src/types/api.ts`

- [ ] D1. Recorrer las ~40 secciones de `api.ts` y clasificar cada tipo: **aliasable** (existe como schema) vs **client-only** (no existe en backend: `JwtPayload`, params de query, helpers UI).
- [ ] D2. Reemplazar cada tipo aliasable por `export type X = components['schemas']['XResponseDto']` (importando `components` del generado). Borrar la definición manual SOLO cuando el schema exista y el shape coincida.
- [ ] D3. Enums: conservar los objetos `as const` a mano; agregar check de compatibilidad de tipo contra el schema (`satisfies` o `const _check`) para que tsc cace drift de valores de enum. NO reemplazar el objeto por alias de tipo.
- [ ] D4. Tipos client-only: dejarlos escritos a mano en `api.ts` con comentario de por qué no se aliasan.
- [ ] D5. `pnpm exec tsc -b` frontend. Resolver errores: principalmente `Date`→`string` en consumidores que asuman `Date`. Ajuste mínimo, documentar cada uno en el commit body.
- [ ] D6. Commit `refactor(infra): convertir types/api.ts en fachada sobre tipos generados`.

## E. CI — gate anti-drift

- [ ] E1. Agregar job `contract-drift` a `.github/workflows/ci.yml`: services Postgres+Redis, install backend, `cp .env.example .env`, `prisma generate`, `openapi:dump` (con DATABASE_URL/REDIS_HOST), install frontend, `gen:api-types`, y `git diff --exit-code -- backend/openapi.json frontend/src/types/api.generated.ts`.
- [ ] E2. (Local) Simular el gate: tras regenerar ambos artefactos y commitearlos, `git diff --exit-code` debe pasar. Luego cambiar un campo de un DTO SIN regenerar → el diff debe fallar (prueba manual del gate).
- [ ] E3. Commit `ci(infra): job contract-drift verifica openapi.json y api.generated.ts`.

## F. Verificación final

- [ ] F1. `cd backend && pnpm exec tsc --noEmit && pnpm run lint` → limpio.
- [ ] F2. `cd frontend && pnpm exec tsc -b && pnpm run lint` → limpio.
- [ ] F3. `cd frontend && pnpm exec vitest run` → 1005/1005 verdes.
- [ ] F4. `cd frontend && pnpm run build` → build OK.
- [ ] F5. Backend e2e de módulos tocados verdes (ver B4.4).
- [ ] F6. Sanity: `git diff --exit-code` tras regenerar ambos artefactos = vacío (el gate de E pasaría).
- [ ] F7. Verificar que NINGÚN consumidor cambió su import `@/types/api` (grep de diff sobre líneas `from '@/types/api'` = 0 cambios, salvo ajustes Date documentados).
