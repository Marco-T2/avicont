# Design: migrar-a-pnpm

> Fecha: 2026-05-22
> Fase: design
> Proyecto: avicont
> Owner: backend-lead

---

## 0. Convenciones del documento

- Las **Decisiones cerradas** del proposal (nivel de seguridad MÁXIMO,
  provisioning de 3 vías, un solo PR `chore(infra)`) son **input cerrado**. Este
  doc documenta el **CÓMO** — bloques de config y procedimientos exactos —, NO
  re-discute el QUÉ ni el PORQUÉ.
- pnpm objetivo: **11.2.2** (pin único en CI/Docker/local).
- Versiones de Node de los archivos reales: CI usa `24.11.0`, Docker usa
  `node:24-alpine`. **No se tocan** en este change.
- `ENV TZ=UTC` del `runner` stage del Dockerfile (CLAUDE.md §4.6) es
  **intocable**. Se preserva carácter por carácter.
- Este es el documento que **apply seguirá al pie de la letra**. Donde hay un
  bloque de código/config, es el contenido literal a escribir.

---

## 1. Resumen de la estrategia

Migración paralela de npm → pnpm 11.2.2 en los dos proyectos Node independientes
del monorepo (`backend/`, `frontend/`), en **nivel de seguridad MÁXIMO**, dentro
de **un único PR** `chore(infra)`. Cada proyecto lleva su propio `pnpm-lock.yaml`
y su propio `pnpm-workspace.yaml` de configuración single-project (NO hay npm
workspaces ni `package.json` raíz).

El **porqué** (supply-chain: bloqueo de lifecycle scripts, cooldown de versiones,
node_modules estricto sin phantom deps) está en `proposal.md §Why` — no se repite.

Cuatro frentes de cambio:

1. **Config de proyecto** — `pnpm-workspace.yaml` (allowBuilds + cooldown) y
   campo `packageManager` en cada `package.json`.
2. **CI** (`.github/workflows/ci.yml`) — provisioning de pnpm + cache + install +
   step `pnpm audit` bloqueante + reemplazo de cada `npm`/`npx`.
3. **Docker** (`backend/Dockerfile`) — pnpm global + `--frozen-lockfile` explícito
   + COPY de archivos de config pnpm, preservando `TZ=UTC`.
4. **Docs y artefactos** — CLAUDE.md §11, README, `docs/entorno-local.md`,
   `openspec/config.yaml`; eliminación de `package-lock.json` + `.gitignore`.

---

## 2. Decisión: provisioning de pnpm por entorno (3 vías)

El proposal fijó tres mecanismos distintos, uno por entorno. Justificación y
forma concreta de cada uno:

| Entorno | Mecanismo | Versión | Forma exacta | Justificación |
|---|---|---|---|---|
| **CI** (GitHub Actions) | `pnpm/action-setup@v4` | `version: 11` | Step ANTES de `actions/setup-node`; habilita `cache: 'pnpm'` | Método oficial; se integra con el cache de setup-node. **Orden crítico** (ver §5, R5/H4): action-setup primero o el cache rompe. |
| **Docker** (`backend/Dockerfile`) | `npm i -g pnpm@11.2.2` | pin `11.2.2` | `RUN npm i -g pnpm@11.2.2` en cada stage que instale/buildee | NO corepack (ver nota abajo). El base image `node:24-alpine` trae npm → instalar pnpm global con él es directo y reproducible. |
| **Local** (dev) | campo `packageManager` | `pnpm@11.2.2` | `"packageManager": "pnpm@11.2.2"` en ambos `package.json` | pnpm respeta este campo para fijar la versión del dev. No requiere herramienta extra si el dev ya tiene pnpm. |

> **Nota corepack → removido en Node 25.** Corepack (el shim que históricamente
> provisiona pnpm/yarn desde el `packageManager`) **se remueve del runtime de
> Node a partir de Node 25**. Atarse a corepack sería deuda inmediata: al subir
> el base image a Node 25 dejaría de existir. Por eso NO usamos corepack en
> ningún entorno. El campo `packageManager` se mantiene igual (es metadata del
> package.json, no depende de corepack para existir) pero su rol queda como
> **pin de versión documental para dev local**, no como mecanismo de
> provisioning ejecutable en CI/Docker.

**Tradeoff aceptado** (proposal Decisión 2): tres mecanismos distintos en vez de
uno unificado. Es el precio de no depender de corepack y usar la mejor
herramienta de cada contexto.

---

## 3. Decisión: configuración de seguridad MÁXIMO

Nivel MÁXIMO = `allowBuilds` conservador + cooldown de 72h estricto +
`pnpm audit --audit-level high` bloqueante en CI (el audit vive en el CI, §5).

### 3.1 Hallazgos de config que rigen estos bloques

- **H1**: pnpm 11 ELIMINÓ `onlyBuiltDependencies` de `package.json`. La config
  de un proyecto single-project va en `pnpm-workspace.yaml` **SIN campo
  `packages`** (ese campo es solo para monorepos con workspaces reales, que no
  usamos). El mapa de builds permitidos/bloqueados es `allowBuilds: { pkg: true|false }`.
- **H2**: `minimumReleaseAge` va en `pnpm-workspace.yaml`, en **minutos**.
  `4320 = 72h`. `minimumReleaseAgeStrict: true` extiende el cooldown también a
  dependencias transitivas/peer (no solo directas).
- **H3**: lista de `allowBuilds` verificada por proyecto (abajo).

### 3.2 `backend/pnpm-workspace.yaml`

> **OJO — orden de generación**: este archivo se construye en **dos fases** (ver
> §4). El bloque de abajo es el **estado FINAL** (con cooldown). En la fase de
> generación del lockfile, el archivo arranca SIN las líneas `minimumReleaseAge`
> / `minimumReleaseAgeStrict` y se completan DESPUÉS.

```yaml
# backend/pnpm-workspace.yaml
# Configuración single-project de pnpm 11 (NO hay campo `packages`: este repo no
# usa workspaces reales; cada proyecto Node es independiente). H1.

# Bloqueo de lifecycle scripts (vector #1 de supply-chain). pnpm NO corre el
# build/postinstall de una dependencia salvo que esté en `true` aquí.
# Conservador: solo los paquetes que GENUINAMENTE necesitan compilar/generar.
allowBuilds:
  # --- true: necesitan correr su build/postinstall para funcionar ---
  bcrypt: true            # binding nativo (node-gyp); sin build no hashea passwords
  prisma: true            # CLI: descarga/posiciona los query engines
  '@prisma/client': true  # postinstall genera el client tipado contra el schema
  '@prisma/engines': true # posiciona los binarios de engine de Prisma
  # --- false: postinstall de telemetría/innecesario; bloquear es seguro ---
  '@nestjs/core': false   # postinstall solo emite telemetría de instalación
  '@scarf/scarf': false   # paquete de analytics de terceros; cero valor funcional
  protobufjs: false       # postinstall innecesario para nuestro uso (OTel)
  unrs-resolver: false    # postinstall de binarios no requeridos en runtime

# Cooldown de versiones nuevas (proposal Decisión 1 — nivel MÁXIMO). En MINUTOS.
# 4320 = 72h. Una versión publicada hace < 72h NO se instala (la mayoría de los
# ataques de supply-chain se detectan/yankean en las primeras horas).
# Default de pnpm 11 es 1440 (24h); lo subimos a 72h.
minimumReleaseAge: 4320
# Strict: el cooldown aplica también a transitivas/peer, no solo a deps directas.
minimumReleaseAgeStrict: true
```

### 3.3 `frontend/pnpm-workspace.yaml`

```yaml
# frontend/pnpm-workspace.yaml
# Configuración single-project de pnpm 11 (sin campo `packages`). H1.

# Cero install scripts en el árbol del frontend (verificado, H3): allowBuilds
# vacío bloquea TODO build de dependencia. Si pnpm reporta un build ignorado en
# `pnpm install`, NO agregar a ciegas: investigar el paquete primero.
allowBuilds: {}

# Cooldown de 72h, estricto — igual que backend (nivel MÁXIMO).
minimumReleaseAge: 4320
minimumReleaseAgeStrict: true
```

> **Nota de operación de `allowBuilds`** (proposal R1): si una dep que necesita
> build queda fuera de la lista, `pnpm install` falla **ruidosamente** con
> `ERR_PNPM_IGNORED_BUILDS` (exit 1) — no es un fallo silencioso. Si eso pasa en
> apply, evaluar si el paquete realmente necesita build antes de agregarlo a
> `true`.

---

## 4. Procedimiento de generación de lockfile (GOTCHA crítico — orden obligatorio)

> ⚠️ **CORRECCIÓN (verificada empíricamente durante apply, 2026-05-22).** El
> procedimiento de 3 pasos que describía esta sección estaba INVERTIDO. Generar
> el lockfile SIN cooldown y agregarlo después produce un lockfile con versiones
> publicadas hace <72h que `minimumReleaseAgeStrict: true` luego RECHAZA en cada
> install ("The lockfile contains entries that the active policies reject").
>
> **Orden CORRECTO:**
> 1. Escribir `pnpm-workspace.yaml` CON `minimumReleaseAge: 4320` +
>    `minimumReleaseAgeStrict: true` desde el inicio (junto a `allowBuilds`).
> 2. Estado TOTALMENTE limpio: `rm -rf node_modules pnpm-lock.yaml` **y** borrar
>    `package-lock.json` (si existe, pnpm IMPORTA sus versiones, reintroduciendo
>    las demasiado-nuevas).
> 3. `pnpm install` → con estado limpio, el cooldown actúa como **filtro de
>    resolución**: pnpm elige la última versión ≥72h que satisface cada rango
>    (ej. bajó `ts-jest` 29.4.11→29.4.10). El lockfile nace consistente.
> 4. Verificar: `pnpm install --frozen-lockfile` NO debe imprimir "reject"/"cutoff".
>
> El cooldown SOLO filtra en estado limpio; con `node_modules` viejo presente,
> pnpm reusa la resolución vieja y solo advierte (exit 0 engañoso) — en CI limpio
> el frozen install rompería. Los pasos numerados de abajo quedan como registro
> histórico del razonamiento original.

> **R4 / H7 — el gotcha más peligroso del change.** Con `minimumReleaseAge: 4320`
> ya activo, **generar el lockfile desde cero FALLA** si alguna dependencia
> resuelve a una versión publicada hace menos de 72h: pnpm se niega a instalarla
> y aborta el `pnpm install`. Por eso el cooldown se agrega DESPUÉS de tener el
> lockfile, no antes.

**Apply DEBE ejecutar esta secuencia exacta, en este orden, por cada proyecto
(`backend/` y `frontend/`):**

1. **Crear `pnpm-workspace.yaml` SOLO con `allowBuilds`** (sin las dos líneas de
   cooldown). Para backend, el bloque `allowBuilds` completo de §3.2; para
   frontend, `allowBuilds: {}` de §3.3. NADA de `minimumReleaseAge` todavía.

2. **Generar el lockfile** corriendo `pnpm install` en el directorio del
   proyecto. Sin cooldown activo, pnpm resuelve el árbol equivalente al de npm,
   produce `pnpm-lock.yaml` y deja `node_modules` funcional. Aquí se valida que
   `allowBuilds` está bien (bcrypt + Prisma generan en backend; cero builds
   ignorados problemáticos en frontend).

   ```bash
   # desde backend/  (y luego, idéntico, desde frontend/)
   pnpm install
   ```

3. **AGREGAR el cooldown al `pnpm-workspace.yaml`** — recién ahora añadir
   `minimumReleaseAge: 4320` + `minimumReleaseAgeStrict: true` para dejar el
   archivo en su estado FINAL (§3.2 / §3.3).

**Por qué este orden funciona**: una vez committeado el `pnpm-lock.yaml`, todos
los installs posteriores corren con `--frozen-lockfile` (en CI lo activa
`CI=true` automático; en Docker se pasa explícito, ver §6/H5). Con lockfile
congelado, pnpm instala exactamente las versiones pineadas **sin re-evaluar el
chequeo de age** → el cooldown no vuelve a bloquear nada. El cooldown solo actúa
cuando se intenta **resolver/agregar** una versión nueva (un futuro
`pnpm add`/`pnpm update`), que es justo donde lo queremos.

> No invertir el orden. No "simplificar" escribiendo el workspace.yaml completo
> de una y después correr install: eso es exactamente lo que falla.

---

## 5. Diseño del CI (`.github/workflows/ci.yml`)

Dos jobs: `build-and-test` (backend) y `frontend`. En ambos se aplica el mismo
patrón de migración. **Lo que NO cambia**: `name`, triggers (`on:`), `services`
(postgres/redis del backend), `defaults.run.working-directory`, los `env` de cada
step, `node-version`, los servicios. **Lo que cambia**: provisioning de pnpm,
cache, install, y cada comando `npm`/`npx`.

### 5.1 Tabla de reemplazo de comandos (CI)

| Antes (npm) | Después (pnpm) | Notas |
|---|---|---|
| `cache: 'npm'` | `cache: 'pnpm'` | en `actions/setup-node` |
| `cache-dependency-path: <proj>/package-lock.json` | `cache-dependency-path: <proj>/pnpm-lock.yaml` | |
| `npm ci` | `pnpm install` | frozen-lockfile automático en Actions (`CI=true`, H4) |
| `npx prisma generate` | `pnpm exec prisma generate` | binario local |
| `npx prisma migrate deploy` | `pnpm exec prisma migrate deploy` | binario local |
| `npm run lint --if-present` | `pnpm run lint --if-present` | |
| `npx jest src/ --runInBand` | `pnpm exec jest src/ --runInBand` | binario local |
| `npx jest test/ --runInBand --forceExit` | `pnpm exec jest test/ --runInBand --forceExit` | binario local |
| `npm run lint` | `pnpm run lint` | (frontend) |
| `npx vitest run` | `pnpm exec vitest run` | binario local (frontend) |
| `npm run build` | `pnpm run build` | (frontend) |

> **Orden crítico (R5/H4)**: el step `pnpm/action-setup@v4` DEBE ir **ANTES** de
> `actions/setup-node`. Si se invierte, `cache: 'pnpm'` falla porque pnpm aún no
> existe cuando setup-node intenta resolver el cache.

> **Ubicación del audit gate**: `pnpm audit --audit-level high` se coloca
> **inmediatamente después del install** y **antes** de cualquier build/test/lint
> en cada job. Razón: si hay una vuln `high`/`critical`, el build debe romper lo
> antes posible (fail-fast), sin gastar minutos de CI en tests que igual no se
> mergean. Es **bloqueante**: `pnpm audit` sale con exit ≠ 0 ante vulns del nivel
> indicado y rompe el step.

### 5.2 Job `build-and-test` (backend) — bloque exacto de steps

```yaml
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      # pnpm/action-setup ANTES de setup-node, o el cache 'pnpm' falla (H4/R5).
      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 11

      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: '24.11.0'
          cache: 'pnpm'
          # El lock vive en backend/, no en la raíz del monorepo.
          cache-dependency-path: backend/pnpm-lock.yaml

      - name: Install dependencies
        # En GitHub Actions CI=true → pnpm usa --frozen-lockfile automático (H4).
        run: pnpm install

      # Gate de seguridad supply-chain (nivel MÁXIMO): rompe el build ante
      # cualquier vuln high/critical. Bloqueante, fail-fast tras el install.
      - name: Security audit
        run: pnpm audit --audit-level high

      - name: Copy env
        run: cp .env.example .env

      - name: Generate Prisma Client
        run: pnpm exec prisma generate

      - name: Run Prisma migrations
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/saas
        run: pnpm exec prisma migrate deploy

      - name: Lint
        run: pnpm run lint --if-present

      - name: Unit + Integration tests
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/saas
          REDIS_HOST: localhost
        run: pnpm exec jest src/ --runInBand

      # E2E full-stack a través de HTTP (Supertest + AppModule). Ver CLAUDE.md §11.3.
      # --forceExit porque PrismaClient deja handles que Jest no detecta.
      - name: E2E tests
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/saas
          REDIS_HOST: localhost
        run: pnpm exec jest test/ --runInBand --forceExit
```

> El bloque `services:` (postgres/redis), `defaults.run.working-directory: backend`
> y el comentario "El backend es un proyecto Node autocontenido…" se conservan
> tal cual están en el archivo actual. Solo se reescriben los `steps`.

### 5.3 Job `frontend` — bloque exacto de steps

```yaml
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      # pnpm/action-setup ANTES de setup-node, o el cache 'pnpm' falla (H4/R5).
      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 11

      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: '24.11.0'
          cache: 'pnpm'
          # El lock vive en frontend/, no en la raíz del monorepo.
          cache-dependency-path: frontend/pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install

      # Gate de seguridad supply-chain (nivel MÁXIMO), bloqueante, fail-fast.
      - name: Security audit
        run: pnpm audit --audit-level high

      - name: Lint
        run: pnpm run lint

      - name: Unit tests
        run: pnpm exec vitest run

      - name: Build
        run: pnpm run build
```

> `defaults.run.working-directory: frontend` y el comentario "El frontend es un
> proyecto Vite + React autocontenido…" se conservan.

---

## 6. Diseño del Dockerfile (`backend/Dockerfile`)

Multi-stage `builder` + `runner` sobre `node:24-alpine`. Cambios vs. el actual:

- `npm i -g pnpm@11.2.2` en cada stage que use pnpm (provisioning Docker, §2).
- `COPY package*.json ./` → `COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./`
  (Docker necesita los tres archivos de config de pnpm para un install reproducible).
- `npm ci` → `pnpm install --frozen-lockfile` **explícito** (Docker NO setea
  `CI=true`, H5 — sin `--frozen-lockfile` pnpm podría intentar resolver/actualizar).
- `npm run prisma:generate` → `pnpm run prisma:generate`; `npm run build` →
  `pnpm run build`.
- `COPY --from=builder /app/node_modules ./node_modules` se **mantiene**: los
  symlinks de pnpm son **relativos** dentro de `node_modules/.pnpm`, así que la
  copia entre stages funciona (H6). `pnpm deploy` NO aplica (requiere workspaces).
- `COPY --from=builder /app/package*.json ./` → en el runner basta
  `COPY --from=builder /app/package.json ./` (el runner ya no necesita el
  lockfile ni el workspace.yaml: no corre install; solo `prisma migrate deploy`
  vía binario ya presente en node_modules y `node dist/main.js`).
- `CMD` se conserva **idéntico** salvo el `npx` → se mantiene como está usando el
  binario de prisma vía `node_modules/.bin` (ver nota CMD abajo).
- **`ENV TZ=UTC` se preserva intacto** (CLAUDE.md §4.6).

### 6.1 Archivo completo resultante

```dockerfile
FROM node:24-alpine AS builder

WORKDIR /app

# Provisioning de pnpm en Docker (NO corepack: se remueve en Node 25).
RUN npm i -g pnpm@11.2.2

# pnpm necesita los tres archivos de config para un install reproducible:
# package.json (deps), pnpm-lock.yaml (versiones pineadas) y
# pnpm-workspace.yaml (allowBuilds + cooldown).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma/

# --frozen-lockfile EXPLÍCITO: Docker no setea CI=true, así que pnpm no lo
# infiere solo (H5). Sin esto, pnpm podría intentar resolver/actualizar el árbol.
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run prisma:generate
RUN pnpm run build

FROM node:24-alpine AS runner

WORKDIR /app

# Zona horaria fija en UTC: todo timestamp se persiste en UTC; la conversión a
# America/La_Paz es responsabilidad de la capa de presentación (CLAUDE.md §4.6).
ENV TZ=UTC

COPY --from=builder /app/dist ./dist
# Los symlinks de pnpm son relativos dentro de node_modules/.pnpm: copiar el
# node_modules entre stages funciona sin re-instalar (H6).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
```

> **Nota sobre el CMD**: el original usaba `npx prisma migrate deploy`. En el
> runner NO instalamos pnpm (no hay `pnpm install` en ese stage), así que para
> evitar depender de `npx`/`pnpm exec` en runtime se invoca el binario local
> directamente: `node_modules/.bin/prisma` (que ya viene copiado desde el
> builder). Es más explícito y no requiere provisioning de pnpm en el runner.
> Si apply prefiere mantener simetría con pnpm, la alternativa equivalente es
> agregar `RUN npm i -g pnpm@11.2.2` también al runner y usar
> `pnpm exec prisma migrate deploy` — pero la opción del binario directo es más
> liviana (no agrega pnpm a la imagen final). **Decisión: binario directo.**

---

## 7. Cambios en `package.json` (ambos proyectos)

### 7.1 Campo `packageManager`

Agregar a `backend/package.json` y `frontend/package.json`:

```json
  "packageManager": "pnpm@11.2.2"
```

Convención de ubicación: como sibling top-level (junto a `engines` en el backend;
junto a `type`/`version` en el frontend). Es metadata; el orden exacto de las
keys lo decide apply, pero debe quedar como una key top-level válida del JSON.

### 7.2 Scripts — ¿se tocan?

**No se tocan.** Verificado en ambos `package.json`:

- Backend: `build` (`nest build`), `lint` (`eslint src`), `test` (`jest`),
  `prisma:generate` (`prisma generate`), `prisma:migrate` (`prisma migrate dev`),
  `seed` (`ts-node ...`), etc. — **todos invocan el binario directo** (`nest`,
  `eslint`, `jest`, `prisma`, `ts-node`), NO `npm`/`npx`.
- Frontend: `dev` (`vite`), `build` (`tsc -b && vite build`), `lint`
  (`eslint .`), `preview` (`vite preview`) — **todos binario directo**.

Como ningún script llama `npm run X` ni `npx Y` internamente, pnpm los ejecuta
sin cambios: `pnpm run build` corre el mismo string. **Lo único que cambia es
CÓMO se invocan desde afuera** (CI/Docker/docs): `pnpm run <script>` en vez de
`npm run <script>`. Esto se documenta (§9), no se edita en `package.json`.

> Cualquier `engines` existente (`backend`: `"node": ">=24.11.0"`) se conserva.

---

## 8. Gestión de lockfiles y `.gitignore`

### 8.1 Eliminar los lockfiles de npm

Borrar del repo (en el mismo PR):

- `backend/package-lock.json`
- `frontend/package-lock.json`

Razón (proposal R2): si un `package-lock.json` sobrevive, algún entorno podría
seguir usando npm → árbol distinto + scripts corriendo. La coexistencia de
lockfiles es un riesgo de seguridad que anula el cooldown.

### 8.2 `.gitignore` raíz

El `.gitignore` actual de la raíz es:

```
node_modules
dist
.env
*.log
coverage
.DS_Store
.claude/
```

Agregar `package-lock.json` para impedir que vuelva a colarse (en cualquier
subcarpeta, ya que el patrón sin slash matchea recursivamente en git):

```
node_modules
dist
.env
*.log
coverage
.DS_Store
.claude/
package-lock.json
```

> **NO** ignorar `pnpm-lock.yaml` ni `pnpm-workspace.yaml` — esos SÍ se
> committean (son el corazón del lockfile reproducible y de la config de
> seguridad). Ignorar solo el lockfile de npm.

---

## 9. Mapa de cambios documentales

Reemplazo de comandos `npm`/`npx` → pnpm en cuatro artefactos. Cero cambio
funcional; solo el comando que el lector copia/pega.

### 9.1 Tabla de equivalencias npm → pnpm (referencia para todos los docs)

| npm | pnpm | Cuándo |
|---|---|---|
| `npm ci` | `pnpm install --frozen-lockfile` | install reproducible (CI/Docker/prod) |
| `npm install` | `pnpm install` | install de dev (resuelve si falta lockfile) |
| `npm install <pkg>` | `pnpm add <pkg>` | agregar dependencia |
| `npm run <script>` | `pnpm run <script>` (o `pnpm <script>`) | correr un script del package.json |
| `npm test` | `pnpm test` | atajo de `pnpm run test` |
| `npx <bin>` | `pnpm exec <bin>` | ejecutar un **binario local** (ya instalado en node_modules) |
| `npx <pkg>` (no instalado) | `pnpm dlx <pkg>` | descargar y ejecutar **efímero** (no persiste) |

> **`pnpm exec` vs `pnpm dlx` — la distinción clave**:
> - `pnpm exec <bin>`: corre un binario que **ya está** en `node_modules/.bin`
>   (jest, vitest, prisma, tsc, eslint, nest). Es el reemplazo de `npx` para
>   herramientas que son dependencias del proyecto. **Es el caso del 100% de
>   nuestros `npx`** (todos apuntan a binarios ya instalados).
> - `pnpm dlx <pkg>`: descarga el paquete a un store temporal, lo ejecuta y lo
>   descarta. Reemplaza `npx <pkg>` cuando el paquete NO es dependencia del
>   proyecto (ej. un generador one-off). **No lo necesitamos en este change.**

### 9.2 Artefactos a editar

| Artefacto | Refs npm/npx aprox. | Qué reemplazar |
|---|---|---|
| `CLAUDE.md` §11 (runbook) | ~22 | Todos los `npm ci`/`npm install`/`npm run X`/`npx Y`/`npm test`. Los comandos Prisma con `DATABASE_URL=... npx prisma ...` → `DATABASE_URL=... pnpm exec prisma ...`. Los E2E con `npx jest test/ --runInBand --forceExit` → `pnpm exec jest test/ --runInBand --forceExit`. `npm run start:dev` → `pnpm run start:dev`. |
| `docs/entorno-local.md` | ~9 (líneas 25, 127-128, 145, 162-168, 265, 298) | `npm install` → `pnpm install`; `npm run dev`/`npm run prisma:migrate`/`npm run start:dev` → `pnpm run …`; `npx ts-node prisma/seeds/...` → `pnpm exec ts-node prisma/seeds/...`; `cd frontend && npm run dev` → `cd frontend && pnpm run dev`. |
| `README.md` | ~5 (líneas 36-39, 47-48) | `npm install` → `pnpm install`; `npm run prisma:migrate`/`npm run start:dev`/`npm run dev` → `pnpm run …`. |
| `openspec/config.yaml` | 6 campos | Ver tabla §9.3. |

### 9.3 `openspec/config.yaml` — campos exactos

| Campo (path en el YAML) | Valor actual | Valor nuevo |
|---|---|---|
| `testing.test_runner.command` | `npm test` | `pnpm test` |
| `testing.test_runner.integration_command` | `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/saas npx jest src/` | `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/saas pnpm exec jest src/` |
| `testing.test_runner.e2e_command` | `DATABASE_URL=... JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh npx jest test/ --runInBand --forceExit` | `DATABASE_URL=... JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh pnpm exec jest test/ --runInBand --forceExit` |
| `testing.coverage.command` | `npx jest --coverage` | `pnpm exec jest --coverage` |
| `testing.quality.linter.command` | `npm run lint` | `pnpm run lint` |
| `testing.quality.formatter.command` | `npm run format` | `pnpm run format` |

> `testing.quality.type_checker.command` (`npx tsc --noEmit -p tsconfig.json`)
> también debe pasar a `pnpm exec tsc --noEmit -p tsconfig.json` por consistencia
> (es un binario local). Incluirlo en el reemplazo aunque la consigna lo listara
> aparte.

---

## 10. Plan de verificación

Comandos exactos para validar **en local** antes de pushear (asumen pnpm 11.2.2
instalado y el lockfile ya generado por el procedimiento de §4). Postgres+Redis
arriba para integración/e2e: `docker compose up -d postgres redis`.

### 10.1 Backend

```bash
# desde backend/
pnpm install                         # exit 0; node_modules funcional
pnpm exec tsc --noEmit -p tsconfig.json   # typecheck limpio
pnpm run lint                        # eslint sin errores
pnpm run prisma:generate             # genera el client (valida allowBuilds @prisma/client)
pnpm run build                       # nest build → dist/ generado
pnpm audit --audit-level high        # gate de seguridad (igual que CI); debe pasar

# tests (requieren Postgres/Redis arriba):
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
  pnpm exec jest src/ --runInBand    # unit + integración
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
JWT_ACCESS_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh" \
  pnpm exec jest test/ --runInBand --forceExit   # e2e
```

Validación específica del nivel MÁXIMO en backend:
- **bcrypt compiló**: `node -e "require('bcrypt').hashSync('x',10)"` no lanza.
- **Prisma generó**: `pnpm exec prisma generate` termina exit 0.
- `pnpm install` NO reportó builds ignorados de bcrypt/prisma/@prisma/client/@prisma/engines.

### 10.2 Frontend

```bash
# desde frontend/
pnpm install                         # exit 0; cero builds ignorados problemáticos
pnpm run lint                        # eslint sin errores
pnpm exec vitest run                 # suite vitest verde
pnpm run build                       # tsc -b && vite build → dist/ generado
pnpm audit --audit-level high        # gate de seguridad; debe pasar
```

### 10.3 Imagen Docker (backend)

```bash
# desde backend/
docker build -t avicont-backend:pnpm-test .
# Verificar TZ=UTC preservado y arranque:
docker run --rm avicont-backend:pnpm-test sh -c 'echo $TZ'   # → UTC
# (arranque completo requiere DATABASE_URL/Redis; verificar al menos que
#  `node dist/main.js` no crashea por deps faltantes en el bootstrap)
```

### 10.4 Higiene del repo

- `git status` no muestra ningún `package-lock.json` tracked.
- `pnpm-lock.yaml` + `pnpm-workspace.yaml` presentes y committeados en ambos proyectos.
- Cada `pnpm-workspace.yaml` tiene `minimumReleaseAge: 4320` + `minimumReleaseAgeStrict: true`.
- `grep -rn -E "npm (ci|install|run|test)|npx " CLAUDE.md README.md docs/entorno-local.md openspec/config.yaml` → cero residuos.

> **Pre-merge crítico (R3)**: correr `pnpm audit --audit-level high` en local en
> AMBOS proyectos ANTES de mergear. Si aparece una vuln `high`/`critical` sin fix
> disponible, decidir la mitigación (`pnpm.overrides`, esperar fix, o
> justificación documentada) ANTES, no descubrirlo cuando el gate rompa `main`.

---

## 11. Rollback

Cambio **sin migration de schema y sin cambios de dominio** → rollback trivial,
sin pérdida de datos. Pasos concretos:

1. **`git revert <sha-del-PR>`**. Como el merge es squash (un solo commit por
   PR), un único revert deshace TODO: CI vuelve a `npm`, Dockerfile vuelve a
   `npm ci`, docs y `openspec/config.yaml` vuelven a npm, y se **restauran** los
   `backend/package-lock.json` / `frontend/package-lock.json` (el revert
   re-agrega los archivos eliminados desde el git history) y se eliminan
   `pnpm-lock.yaml` / `pnpm-workspace.yaml` y el campo `packageManager`.

2. **CI post-revert**: `actions/setup-node` vuelve a `cache: 'npm'` y corre
   `npm ci` contra los `package-lock.json` restaurados. El step `pnpm audit` y el
   step `Setup pnpm` desaparecen con el revert. No requiere intervención manual.

3. **Docker post-revert**: el Dockerfile vuelve a `npm ci`; rebuild de la imagen
   con el patrón npm original. `TZ=UTC` sigue presente (nunca se tocó).

4. **Local de cada dev**: tras hacer pull del revert, borrar `node_modules` y el
   `pnpm-lock.yaml` residual local (si quedó sin trackear) y reinstalar con
   `npm ci`:
   ```bash
   rm -rf node_modules pnpm-lock.yaml pnpm-workspace.yaml
   npm ci
   ```

5. **Sin estado persistido a limpiar**: la migración no escribe en BD ni cambia
   datos. El árbol de dependencias resuelto por pnpm es equivalente al de npm, así
   que volver a npm no cambia el comportamiento de la app.

---

## 12. Trazabilidad con el proposal (riesgos → mitigación de diseño)

| Riesgo (proposal) | Cómo lo cubre este diseño |
|---|---|
| R1 `allowBuilds` mal config | §3.2/§3.3 lista verificada; §10.1 valida bcrypt+Prisma; fallo es ruidoso (`ERR_PNPM_IGNORED_BUILDS`). |
| R2 coexistencia de lockfiles | §8.1 elimina ambos `package-lock.json`; §8.2 los agrega a `.gitignore`. |
| R3 audit gate rompe CI día 1 | §10 pre-merge: correr `pnpm audit` local en ambos proyectos antes de mergear. |
| R4 generación de lockfile con cooldown | §4 procedimiento de 3 pasos obligatorio (allowBuilds → install → cooldown). |
| R5 orden de steps en CI | §5.2/§5.3: `pnpm/action-setup` ANTES de `actions/setup-node`, en ambos jobs. |

---

**Fin del design.** Apply sigue §4 (orden de generación), §5 (CI), §6 (Docker),
§7-§9 (config y docs) al pie de la letra. Verificación en §10; rollback en §11.
