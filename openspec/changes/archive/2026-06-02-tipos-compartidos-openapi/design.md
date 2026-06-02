# Diseño técnico: tipos-compartidos-openapi

## 1. Backend — script de dump sin servidor HTTP

### Ubicación y wiring
- Archivo: `backend/scripts/dump-openapi.ts`.
- pnpm script: `"openapi:dump": "ts-node scripts/dump-openapi.ts"` (ya existe
  `ts-node@10.9.2` en devDependencies; el patrón es idéntico a
  `prisma/scripts/super-admin.ts` y `prisma/seed.ts`).

### Cómo bootear Nest sin abrir puerto
La clave: usar `NestFactory.create(AppModule, { logger: false })` —
**`create` NO escucha** un puerto; solo `app.listen()` lo hace. Por lo tanto el
documento se puede construir tras `create()` sin `listen()`:

```ts
// backend/scripts/dump-openapi.ts
import './../src/tracing/otel-bootstrap'; // si es necesario por orden de imports
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api'); // MISMO prefijo que main.ts → paths correctos

  // MISMO DocumentBuilder que src/main.ts (mantener en sync — ver §1.1)
  const config = new DocumentBuilder()
    .setTitle('Multi-Tenant SaaS API')
    .setDescription('...')
    .setVersion('1.0')
    .addBearerAuth(/* ...idéntico a main.ts... */)
    .addApiKey(/* ... */)
    .addTag(/* ... */)
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const out = join(__dirname, '..', 'openapi.json');
  writeFileSync(out, JSON.stringify(document, null, 2) + '\n', 'utf8');
  await app.close(); // cierra el contexto → sin handles colgados
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

> Nota: si bootear el `AppModule` completo trae dependencias pesadas (Redis,
> OTel exporters) que fallan sin infra, evaluar `process.env` mínimos o un
> `.env.example`-like. En CI ya se copia `.env.example`; el dump puede correr en
> el job backend que ya tiene Postgres/Redis. Verificar en apply si `create()`
> exige conexiones vivas — si el módulo conecta en `onModuleInit`, el dump
> necesitará la infra arriba (es aceptable: corre en el job backend, no en el
> frontend).

### 1.1 Riesgo de drift del DocumentBuilder
El `DocumentBuilder` se duplica entre `main.ts` y el script. Para evitar drift,
**extraer la construcción del config a una función compartida**:
`src/openapi/build-openapi-config.ts` que exporta `buildOpenApiConfig(): Omit<OpenAPIObject,...>`
o directamente el `DocumentBuilder` configurado. Tanto `main.ts` como el script
la importan. Así hay UNA fuente del título/tags/security.

### 1.2 Determinismo del JSON
- `JSON.stringify(document, null, 2)` con `SwaggerModule.createDocument` produce
  salida estable entre corridas con el mismo input (Nest itera metadata en orden
  de declaración). Si en apply se observa orden no determinístico, ordenar claves
  de `components.schemas` antes de serializar.

---

## 2. Backend — conversión de DTOs interface→class (grupo B, prerequisito duro)

### Taxonomía verificada (de la exploración)

**(B1) Interfaces puras, totalmente ausentes del OpenAPI — convertir a class + decorar:**
- `cuentas/dto/cuenta-response.dto.ts` → `CuentaResponseDto`, `CuentaListResponseDto`, `CuentaTreeNodeDto` (árbol recursivo: `hijas: CuentaTreeNodeDto[]`).
- `me/dto/me-permissions-response.dto.ts` → `MePermissionsResponseDto` (+ tipo `VerticalActivo`).
- `users/dto/user-response.dto.ts` → `UserResponseDto`.
- `configuracion-contable/dto/configuracion-response.dto.ts` → `ConfiguracionContableResponseDto`.
- `reportes/dto/libro-diario-response.dto.ts` → DTOs anidados.
- `reportes/dto/libro-mayor-response.dto.ts` → DTOs anidados.
- `reportes/dto/balance-response.dto.ts` → árbol recursivo (Seccion→Subseccion→Cuenta).
- `reportes/dto/eeff-resultados-response.dto.ts` → árbol recursivo.

**(B2) Class principal ya decorada, pero interface wrapper de listado sin decorar:**
- `contactos` → `ListarContactosResponseDto`
- `comprobantes` → `ListarComprobantesResponseDto`
- `documentos-fisicos` → `ListarDocumentosFisicosResponseDto`
- `granja/lote` → `ListarLotesResponseDto`
- `tipos-documento-fisico` → `ListarTiposDocumentoFisicoResponseDto`

### Patrón de conversión
```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CuentaResponseDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) descripcion!: string | null;
  @ApiProperty({ enum: ClaseCuenta }) claseCuenta!: ClaseCuenta;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string; // string, NO Date
  // ...
}

// árbol recursivo: self-reference con type: () =>
export class CuentaTreeNodeDto extends CuentaResponseDto {
  @ApiProperty({ type: () => [CuentaTreeNodeDto] }) hijas!: CuentaTreeNodeDto[];
}

// wrapper de listado:
export class CuentaListResponseDto {
  @ApiProperty({ type: () => [CuentaResponseDto] }) items!: CuentaResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
```

**Detalle de fechas**: las funciones `toXResponse` ya serializan con
`.toISOString()`. El campo tipado como `Date` en la interface es **mentira sobre
el wire**: el JSON real lleva `string`. La conversión tipa `string` (la verdad).
Esto puede romper consumidores que asuman `Date` → se ajustan en el frontend
(ver §4, riesgo aceptado).

### Anotación de controllers (sin esto el schema NO aparece)
Una `class` decorada SOLO entra a `components.schemas` si algún endpoint la
referencia. Por cada DTO convertido, anotar el método del controller:
```ts
@ApiOkResponse({ type: CuentaListResponseDto })
@Get()
findAll(/* ... */): Promise<CuentaListResponseDto> { /* ... */ }
```
Auditar cada controller de los 8+5 archivos y agregar `@ApiOkResponse({ type })`
donde falte. Este es el paso que cierra REQ-OAPI-02 escenario −.

### Enums en el OpenAPI
Usar `@ApiProperty({ enum: ClaseCuenta })`. openapi-typescript lo emitirá como
unión de strings. Los valores en runtime los sigue dando el frontend (ver §5).

---

## 3. Frontend — generación

### Dev-dep y script
```jsonc
// frontend/package.json
"devDependencies": { "openapi-typescript": "^7.x" },
"scripts": {
  "gen:api-types": "openapi-typescript ../backend/openapi.json -o src/types/api.generated.ts"
}
```
El path relativo `../backend/openapi.json` es correcto desde `frontend/`
(monorepo hermano). El generado expone `export interface components { schemas: { ... } }`.

### Archivo generado
`frontend/src/types/api.generated.ts` — **commiteado**, marcado como generado
(cabecera "DO NOT EDIT") y excluido del lint/format si hace ruido
(`// eslint-disable` o entry en `.eslintignore` / `eslint.config` ignores).

---

## 4. Frontend — fachada (`src/types/api.ts`)

### Estructura objetivo
```ts
import type { components } from './api.generated';

type Schemas = components['schemas'];

// --- Alias de DTOs del backend (antes manuales) ---
export type Contacto = Schemas['ContactoResponseDto'];
export type ContactoList = Schemas['ListarContactosResponseDto'];
export type Cuenta = Schemas['CuentaResponseDto'];
export type CuentaTreeNode = Schemas['CuentaTreeNodeDto'];
export type MePermissions = Schemas['MePermissionsResponseDto'];
// ... resto de los DTOs

// --- Enums como VALOR en runtime (no se pueden aliasar, ver §5) ---
export const ClaseCuenta = { ACTIVO:'ACTIVO', /* ... */ } as const;
export type ClaseCuenta = (typeof ClaseCuenta)[keyof typeof ClaseCuenta];
//  ^ tipo idéntico al de Schemas[...]['claseCuenta']; opcionalmente
//    `satisfies` para garantizar compatibilidad con el schema.

// --- Tipos client-only (NO existen en backend) — quedan a mano ---
export interface JwtPayload { /* ... */ }
export interface LoginRequest { email: string; password: string }
// params de query no modelados como DTO, etc.
```

### Mapa de qué es qué
- **Aliasable** (existe como schema): todos los `*ResponseDto`, los Request/input
  DTOs que ya están en el OpenAPI (`LoginDto`, `CreateContactoDto`, etc.).
- **Manual / client-only**: `JwtPayload` (decodificación de JWT, no es un DTO),
  tipos de params de query que el backend recibe como query params sueltos (no
  como un DTO con `@ApiProperty`), cualquier helper de UI.
- En apply, recorrer las ~40 secciones de `api.ts` y clasificar cada bloque:
  alias vs manual. Borrar la definición manual SOLO cuando exista el schema
  equivalente y el shape coincida.

### Garantía de no romper consumidores
Los 245 archivos importan `{ Nombre } from '@/types/api'`. Mientras `api.ts`
re-exporte cada `Nombre` (como alias o como const), los imports no cambian.
Verificación: `tsc -b` + `vitest run`.

---

## 5. Decisión sobre enums

openapi-typescript v7 emite enums como **uniones de strings** (tipos), no como
objetos runtime. El frontend HOY usa `ClaseCuenta.ACTIVO` como **valor**
(ej. en selects, comparaciones). Por lo tanto:

- **NO** se reemplazan los objetos `as const` por un alias de tipo del generado
  (rompería los usos como valor — REQ-OAPI-06 escenario −).
- Se **conservan los objetos `as const` en `api.ts`** escritos a mano.
- Para evitar drift entre el objeto `as const` y el enum del backend, se agrega
  un check de tipo: `const _check: Schemas['CuentaResponseDto']['claseCuenta'] = ...`
  o un `satisfies` que falle en `tsc` si el backend agrega un valor de enum no
  reflejado en el `as const`. Esto da una red parcial sin runtime.
- Trade-off aceptado: el VALOR del enum sigue duplicado a mano, pero su
  **compatibilidad de tipo** queda verificada por tsc contra el generado. Es el
  mínimo costo: openapi-typescript no genera objetos runtime y no queremos un
  generador de enums custom en esta iteración.

---

## 6. Gate de CI anti-drift

### Job dedicado en `.github/workflows/ci.yml`
Nuevo job `contract-drift` (separado de `backend` y `frontend`):

```yaml
  contract-drift:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:14, ports: ['5432:5432'], env: {...}, options: ... }
      redis: { image: redis:6, ports: ['6379:6379'], options: ... }
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4 { version: 11 }
      - uses: actions/setup-node@v5 { node-version: 24.11.0 }
      # backend
      - run: pnpm install
        working-directory: backend
      - run: cp .env.example .env
        working-directory: backend
      - run: pnpm exec prisma generate
        working-directory: backend
      - run: pnpm run openapi:dump
        working-directory: backend
        env: { DATABASE_URL: ..., REDIS_HOST: localhost }
      # frontend
      - run: pnpm install
        working-directory: frontend
      - run: pnpm run gen:api-types
        working-directory: frontend
      # drift check
      - run: git diff --exit-code -- backend/openapi.json frontend/src/types/api.generated.ts
```

- Si `openapi:dump` necesita infra viva (Redis/Postgres por `onModuleInit`), el
  job ya los provee como services. Confirmar en apply el mínimo de env.
- `git diff --exit-code` sobre **ambos** archivos: si cualquiera difiere → exit 1
  → job rojo (REQ-OAPI-05 todos los escenarios).

### Alternativa considerada (rechazada): backend vivo servido en CI
Levantar el backend y hacer `curl /docs-json` en el job frontend. Rechazada:
agrega servicios al job frontend (hoy sin infra), más lento, y no versiona el
contrato en el repo (pierde la auditabilidad en el diff del PR).

---

## 7. Cómo se mantienen verdes los 1005 tests

1. La fachada preserva los **nombres** exportados → imports intactos.
2. Donde el shape real difiere del manual (`Date`→`string` principalmente), se
   ajustan los **pocos** consumidores que asuman `Date`, guiados por errores de
   `tsc -b`.
3. Los tests de Vitest no dependen del nombre interno del tipo, sino del shape
   de los datos mockeados — que ya reflejan el wire real (strings ISO). Por eso
   el riesgo de romper tests es bajo.
4. Orden de verificación en apply (grupo F): `tsc -b` primero (cae rápido),
   luego `vitest run` (1005), luego `pnpm run build`.

---

## 8. Trade-offs resumidos

| Decisión | Alternativa | Por qué la elegida |
|----------|-------------|--------------------|
| `openapi.json` commiteado | backend vivo en CI frontend | auditable en diff, gate trivial, job frontend sin infra |
| Fachada de alias | reescribir 245 imports a `api.generated` | cero churn en consumidores, anti-corruption layer |
| Enums `as const` a mano + check de tipo | generador de enums runtime custom | openapi-ts no emite runtime; check de tipo da red sin tooling extra |
| `ts-node` para el dump | compilar y correr JS | consistente con seed/super-admin; sin paso de build |
| Config OpenAPI compartido (`build-openapi-config.ts`) | duplicar DocumentBuilder | una fuente de verdad title/tags/security |
