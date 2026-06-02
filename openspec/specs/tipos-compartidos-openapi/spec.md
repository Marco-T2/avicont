# Spec delta: tipos-compartidos-openapi

Capability afectada: **tooling de contrato API frontend↔backend** (nueva).

Formato de escenarios: `DADO` / `CUANDO` / `ENTONCES`. Cada requisito incluye
al menos un escenario positivo (+) y uno negativo (−).

---

## REQ-OAPI-01 — El backend produce un artefacto OpenAPI determinístico

El backend DEBE exponer un comando que escriba el documento OpenAPI a
`backend/openapi.json` sin levantar un servidor HTTP, usando el mismo
`DocumentBuilder` que `src/main.ts`.

### Escenario + : dump exitoso
- **DADO** el backend con su `AppModule` y la config Swagger de `main.ts`
- **CUANDO** se ejecuta `pnpm run openapi:dump` desde `backend/`
- **ENTONCES** se escribe `backend/openapi.json` con `info.title`, `info.version`
  y `components.schemas`, y el proceso termina con código 0 sin abrir un puerto.

### Escenario + : determinismo
- **DADO** que no cambió ningún DTO ni controller
- **CUANDO** se ejecuta `openapi:dump` dos veces seguidas
- **ENTONCES** el `openapi.json` resultante es **byte-idéntico** entre corridas
  (claves ordenadas de forma estable).

### Escenario − : el comando no debe colgar el proceso
- **DADO** que el dump terminó de escribir el archivo
- **CUANDO** el script finaliza
- **ENTONCES** NO queda un servidor escuchando ni handles abiertos que impidan
  salir (el contexto Nest se cierra explícitamente).

---

## REQ-OAPI-02 — Todos los DTOs de response consumidos por el frontend aparecen en el OpenAPI

Todo DTO de response que el frontend consume DEBE estar presente como schema en
`components.schemas` del `openapi.json`.

### Escenario + : DTOs antes ausentes ahora presentes
- **DADO** los 8 DTOs hoy `interface` pura (cuenta, me-permissions, user,
  configuracion, libro-diario, libro-mayor, balance, eeff-resultados) y las
  interfaces wrapper `Listar*ResponseDto`
- **CUANDO** se regenera `openapi.json`
- **ENTONCES** cada uno aparece como `class` decorada con `@ApiProperty` en
  `components.schemas`, referenciado por su endpoint vía `@ApiOkResponse`.

### Escenario − : una class sin referencia desde endpoint NO basta
- **DADO** un DTO convertido a `class` con `@ApiProperty` pero SIN
  `@ApiOkResponse({ type })` en su controller
- **CUANDO** se regenera `openapi.json`
- **ENTONCES** el schema NO aparece (regresión a evitar): la tarea de
  conversión SOLO se considera completa cuando el schema está presente.

---

## REQ-OAPI-03 — El frontend genera sus tipos desde el artefacto, no a mano

El frontend DEBE generar `src/types/api.generated.ts` desde
`backend/openapi.json` mediante `openapi-typescript`, y NO redefinir
manualmente tipos que existen como schema en ese OpenAPI.

### Escenario + : generación
- **DADO** un `backend/openapi.json` válido
- **CUANDO** se ejecuta `pnpm run gen:api-types` desde `frontend/`
- **ENTONCES** se crea/actualiza `src/types/api.generated.ts` con
  `components['schemas'][...]` para cada DTO del backend.

### Escenario − : prohibición de redefinición manual
- **DADO** un tipo que existe como schema en el OpenAPI (ej. `ContactoResponseDto`)
- **CUANDO** se inspecciona `src/types/api.ts`
- **ENTONCES** ese tipo NO está redefinido a mano: es un alias
  `export type Contacto = components['schemas']['ContactoResponseDto']`.

---

## REQ-OAPI-04 — La fachada preserva los imports de los consumidores existentes

Los consumidores DEBEN seguir importando los nombres de tipo de dominio desde
`@/types/api` sin cambios de import.

### Escenario + : import estable
- **DADO** un componente que hace `import type { Contacto } from '@/types/api'`
- **CUANDO** se aplica la fachada
- **ENTONCES** el import sigue compilando: `Contacto` ahora es un alias del tipo
  generado, con el mismo shape efectivo.

### Escenario + : compilación intacta
- **DADO** el frontend tras aplicar la fachada
- **CUANDO** se corre `pnpm exec tsc -b`
- **ENTONCES** compila sin errores (ajustes mínimos documentados permitidos
  donde el shape real difiera del manual, p.ej. `Date`→`string`).

### Escenario + : tests verdes
- **DADO** la suite Vitest del frontend (1005 tests)
- **CUANDO** se corre `pnpm exec vitest run` tras la fachada
- **ENTONCES** los 1005 tests siguen verdes.

### Escenario − : tipos client-only no se borran
- **DADO** un tipo que NO existe en el backend (ej. `JwtPayload`, params de query
  no modelados como DTO)
- **CUANDO** se aplica la fachada
- **ENTONCES** ese tipo permanece escrito a mano en `api.ts` (no se intenta
  aliasarlo a un schema inexistente).

---

## REQ-OAPI-05 — CI caza el drift de contrato

CI DEBE fallar si `openapi.json` o `api.generated.ts` están desactualizados
respecto al código fuente.

### Escenario − : DTO cambiado sin regenerar → CI rojo
- **DADO** un PR que agrega/renombra un campo en un DTO del backend
- **Y** el autor NO corrió `openapi:dump` + `gen:api-types`
- **CUANDO** corre el job `contract-drift` en CI
- **ENTONCES** `git diff --exit-code` sobre `backend/openapi.json` y/o
  `frontend/src/types/api.generated.ts` detecta diferencias y **el job falla**.

### Escenario + : artefactos al día → CI verde
- **DADO** un PR donde el autor regeneró ambos artefactos y los commiteó
- **CUANDO** corre el job `contract-drift`
- **ENTONCES** `git diff --exit-code` no encuentra diferencias y el job pasa.

### Escenario − : drift en solo uno de los dos artefactos también rompe
- **DADO** que se regeneró `openapi.json` pero NO `api.generated.ts`
- **CUANDO** corre el job `contract-drift`
- **ENTONCES** el job falla sobre `api.generated.ts`.

---

## REQ-OAPI-06 — Los enums compartidos preservan su uso en runtime

Los enums que el frontend usa como **valor** en runtime (objetos `as const`)
DEBEN seguir disponibles como valor, derivando su tipo del OpenAPI.

### Escenario + : enum como valor sigue funcionando
- **DADO** un consumidor que usa `ClaseCuenta.ACTIVO` como valor en runtime
- **CUANDO** se aplica la fachada
- **ENTONCES** `ClaseCuenta` sigue exportado como objeto `as const` desde
  `@/types/api`, y su tipo es compatible con el schema del OpenAPI.

### Escenario − : no se pierde el objeto al solo aliasar el tipo
- **DADO** que openapi-typescript solo emite una unión de strings para el enum
- **CUANDO** se construye la fachada
- **ENTONCES** NO se reemplaza el objeto `as const` por un mero alias de tipo
  (eso rompería los usos como valor).
