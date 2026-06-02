# Propuesta: tipos compartidos vía openapi-typescript

## Intención

Eliminar la duplicación manual de tipos/DTOs entre backend y frontend generando
los tipos del frontend automáticamente desde el contrato OpenAPI del backend,
con un gate de CI que verifica el drift. Objetivo final: **cero deuda futura**
de sincronización manual y drift **imposible de mergear sin que CI lo cace**.

## Problema

Hoy `frontend/src/types/api.ts` (1198 líneas) espeja **a mano** ~50-70 tipos
del backend. El propio archivo lo admite en su cabecera:

```
// Migraremos a openapi-typescript cuando haya 4-5 features consumiendo la API.
// Mantener en sincronía manual con backend/src/**/dto/*.ts.
```

El trigger de la deuda §10.10 ("cuando haya 4-5 features consumiendo la API con
DTOs duplicados a mano") **ya se cumplió y se superó**: contactos, comprobantes,
documentos-físicos, cuentas, reportes (libro diario/mayor, balance, EEFF),
granja, me/permissions, platform-admin — 9+ features consumen la API con tipos
espejados.

Consecuencias del modelo manual:
- **Drift silencioso**: un campo nuevo o renombrado en un DTO del backend no
  rompe nada hasta que un humano nota el bug en runtime.
- **Doble esfuerzo**: cada feature obliga a escribir el DTO dos veces.
- **Enums duplicados**: `ClaseCuenta`, `Moneda`, `NaturalezaCuenta`, etc. viven
  en `backend/src/common/domain/enums.ts` Y re-tipeados como `as const` en el
  frontend.

## Hallazgo crítico de la exploración (reformula el alcance)

El brief asumía que el único DTO de response sin `@ApiProperty` era
`cuenta-response.dto.ts`. La auditoría real desmiente eso: hay **8 archivos de
DTO de response que son `export interface` puras, SIN `@ApiProperty`**, y por lo
tanto **ausentes del OpenAPI vivo** (`/docs-json` expone 46 schemas, todos de
input/Request; ningún `*ResponseDto` de estos 8 aparece):

| Archivo | Estado | Acción |
|---------|--------|--------|
| `cuenta-response.dto.ts` | interface pura (3 interfaces) | convertir a class + `@ApiProperty` |
| `me-permissions-response.dto.ts` | interface pura | convertir |
| `user-response.dto.ts` | interface pura | convertir |
| `configuracion-response.dto.ts` | interface pura | convertir |
| `libro-diario-response.dto.ts` | interfaces puras (anidadas) | convertir |
| `libro-mayor-response.dto.ts` | interfaces puras (anidadas) | convertir |
| `balance-response.dto.ts` | interfaces puras (árbol recursivo) | convertir |
| `eeff-resultados-response.dto.ts` | interfaces puras (árbol recursivo) | convertir |

Además, los archivos que SÍ tienen la `class` principal decorada
(contactos, comprobantes, documentos-físicos, lote, tipo-documento-físico)
conservan una **interface secundaria `Listar*ResponseDto`** (wrapper de
paginación) sin decorar — esas también deben volverse `class` para entrar al
schema, o el frontend perdería el tipo del listado.

Esto convierte el "fix previo" de un grep trivial en un **sub-proyecto real
(grupo B)** que es prerequisito duro: sin DTOs en el OpenAPI, no hay nada que
generar para esas features.

## Alcance

### IN

- Script en backend que **dumpea el documento OpenAPI a `backend/openapi.json`**
  sin levantar servidor HTTP (boot de Nest + build del documento + write + close).
- `openapi.json` **commiteado** al repo como artefacto versionado.
- Conversión de los 8 DTOs interface→class y de las interfaces wrapper
  `Listar*ResponseDto` / `Cuenta{List,TreeNode}Dto`, con `@ApiProperty`.
- Anotación de los controllers correspondientes con `@ApiOkResponse({ type })`
  donde haga falta para que el schema realmente se emita (una class sin
  referencia desde un endpoint NO entra a `components.schemas`).
- Dev-dep `openapi-typescript` en frontend + script `gen:api-types` que genera
  `frontend/src/types/api.generated.ts` desde `backend/openapi.json`.
- Refactor de `frontend/src/types/api.ts` a **capa de fachada** (alias sobre los
  tipos generados) preservando los imports `@/types/api` de los 245 consumidores.
- **Gate de CI anti-drift**: regenera `openapi.json` y `api.generated.ts` y hace
  `git diff --exit-code` sobre ambos. Si un DTO cambió y no se regeneró → CI rojo.

### OUT

- NO se cambia la lógica de negocio de ningún endpoint ni DTO de input.
- NO se generan clientes HTTP automáticos (seguimos con el wrapper axios
  `@/lib/api` + hooks TanStack por feature). Solo se generan **tipos**.
- NO se toca el modelo de validación runtime con zod del frontend (los schemas
  zod siguen escritos a mano donde existan; openapi-typescript da tipos, no
  validadores).
- NO se decoran DTOs que el frontend no consume (si los hubiera) más allá de lo
  necesario para cerrar la deuda de las features vivas.

## Approach elegido

**Fachada (anti-corruption layer) + `openapi.json` commiteado + CI drift gate.**

1. El backend produce un único artefacto determinístico `openapi.json`.
2. El frontend genera `api.generated.ts` de ese archivo (no del backend vivo).
3. `api.ts` deja de tener definiciones propias para los tipos que existen en el
   backend: pasan a ser `export type X = components['schemas']['XResponseDto']`.
   Los tipos client-only (JwtPayload, params de query no modelados, etc.) quedan
   a mano en `api.ts`.
4. CI regenera ambos artefactos y falla si difieren del commit → drift imposible.

### Por qué `openapi.json` commiteado (no backend vivo en CI)

- El frontend job de CI **no tiene Postgres ni Redis** (es Vite puro). Bootear el
  backend ahí para servir `/docs-json` agregaría servicios, migraciones y tiempo.
- Un archivo commiteado es **auditable en el diff del PR**: el revisor ve el
  cambio de contrato igual que ve el cambio de código.
- El gate de drift es trivial y rápido: `git diff --exit-code`.
- Trade-off: el `openapi.json` "engorda" el diff. Se acepta — es el costo de
  tener el contrato versionado y verificable.

## Riesgos

1. **Enums `as const` vs unions de openapi-typescript.** El frontend usa hoy
   objetos `as const` (`ClaseCuenta.ACTIVO`) como **valores** en runtime, no solo
   como tipos. openapi-typescript emite uniones de strings (solo tipos). La
   fachada debe **re-exportar los objetos `as const` a mano** (o moverlos a un
   módulo de constantes) y derivar el tipo del generado. Riesgo medio: si algún
   consumidor usa el enum como valor, romper su import. Mitigación: mantener los
   `as const` en `api.ts`, tipar contra el generado.

2. **Alcance B mayor de lo previsto.** 8 DTOs a convertir, 3 de ellos con árboles
   recursivos (balance, EEFF, libro-mayor). Convertir un árbol recursivo a class
   con `@ApiProperty` requiere `type: () => Clase` y cuidado con la
   auto-referencia. Riesgo: tiempo y posibles diferencias sutiles de shape
   (ej. `Date` serializado como `string`). Mitigación: TDD por DTO comparando el
   shape generado contra el tipo manual actual antes de borrar el manual.

3. **`Date` vs `string`.** Varios DTOs manuales tipan `createdAt: Date`. El
   backend serializa a `string` ISO (ver `toContactoResponse` → `.toISOString()`).
   El generado dirá `string`. Algún consumidor que haga `.getTime()` sobre un
   campo asumido `Date` rompería en tsc. Mitigación: el generado es la **verdad**
   (el wire format es string); ajustar los pocos consumidores que asuman `Date`.

4. **245 archivos consumidores.** Aunque la fachada preserva los imports, si un
   tipo cambia de nombre de campo al alinearse con el backend real, podría
   romper tsc en cascada. Mitigación: la meta es diff contenido; correr
   `tsc -b` del frontend tras la fachada y resolver lo mínimo. Los 1005 tests de
   Vitest son la red de seguridad.

5. **Drift gate en monorepo cross-stack.** El gate corre backend (`openapi:dump`)
   y frontend (`gen:api-types`) y compara. Requiere un job que tenga Node + pnpm
   en ambas carpetas. Riesgo: complejidad del workflow. Mitigación: job dedicado
   `contract-drift` independiente de los jobs `backend`/`frontend` existentes.
