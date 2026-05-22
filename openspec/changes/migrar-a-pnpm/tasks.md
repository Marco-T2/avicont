# Tasks: migrar-a-pnpm

> Breakdown en commits atómicos. Cada checkbox = un commit que squashea en el
> PR `chore(infra)`. **Verde entre cada commit** (typecheck + build del
> sub-proyecto afectado).
>
> Branch: `chore/infra-migrar-a-pnpm` — squash merge contra `main`.

## Reglas globales

- Idioma de código: inglés (tooling e infra puro; no hay dominio de negocio).
- Verde antes de cada commit: `pnpm exec tsc --noEmit -p tsconfig.json` para backend; `pnpm run build` para frontend.
- Commits: `chore(infra): ...` (conventional commits en inglés; NO se usa `npx` en ningun commit ni en comandos de verificación).
- Un único PR; squash merge; nunca `Co-Authored-By:`; nunca `--no-verify`.
- El `ENV TZ=UTC` del Dockerfile runner es **intocable** (CLAUDE.md §4.6).
- Orden de generación de lockfile (GOTCHA crítico — design §4): PRIMERO generar el lockfile con `allowBuilds` solo, LUEGO agregar el cooldown. No invertir.
- `package-lock.json` de backend y frontend DEBEN eliminarse y estar en `.gitignore`.
- `pnpm-lock.yaml` y `pnpm-workspace.yaml` SÍ se committean.

---

## Orden de dependencias entre tareas

```
Task 1.1 (backend workspace.yaml solo allowBuilds)
    ↓
Task 1.2 (pnpm install backend — genera lockfile)
    ↓
Task 1.3 (activar cooldown en backend workspace.yaml + packageManager + borrar package-lock.json)
    ↓
Task 2.1 (frontend workspace.yaml solo allowBuilds)
    ↓
Task 2.2 (pnpm install frontend — genera lockfile)
    ↓
Task 2.3 (activar cooldown en frontend workspace.yaml + packageManager + borrar package-lock.json)
    ↓
Task 3.1 (CI — reescribir ambos jobs en ci.yml)
    ↓
Task 4.1 (Docker — reescribir Dockerfile backend)
    ↓
Task 5.1 (.gitignore raíz)
    ↓
Task 6.1 (Docs — CLAUDE.md §11, README.md, docs/entorno-local.md, openspec/config.yaml)
    ↓
Task 7.1 (Verificación final local — build backend+frontend + docker build)
```

> Tasks 1.x y 2.x son secuenciales entre sí dentro de cada proyecto.
> Task 3.1 (CI) puede ir en paralelo con 4.1 (Docker) — no se pisan.
> Task 5.1 (.gitignore) es independiente; puede ir antes o después de 3.1/4.1.
> Task 6.1 (docs) puede ir en cualquier orden tras 1.3 y 2.3.
> Task 7.1 es siempre la última.

---

## Fase 1 — Backend: switch a pnpm

### 1.1 - [ ] Crear `backend/pnpm-workspace.yaml` (SOLO `allowBuilds`, sin cooldown)

**Entrega**: archivo de configuración de proyecto single-project de pnpm 11,
con SOLO el bloque `allowBuilds` (sin `minimumReleaseAge` ni `minimumReleaseAgeStrict`).
Esta es la fase 1 del procedimiento de generación de lockfile (design §4, GOTCHA crítico).
El cooldown se agrega en la task 1.3, DESPUÉS de que el lockfile esté generado.

**Archivos** (nuevos):
- `backend/pnpm-workspace.yaml` — contenido exacto (design §3.2, bloque sin cooldown):

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
```

> **NO agregar las líneas de cooldown todavía.** Se agregan en task 1.3.

**Archivos** (sin tocar): `backend/package.json` (se toca en task 1.3), `backend/package-lock.json` (se elimina en task 1.3).

**Tests que se agregan**: ninguno (config pura).

**Verificación**: el archivo existe y es YAML válido. No hay `minimumReleaseAge` ni `minimumReleaseAgeStrict` en él.

**Cubre**: spec REQ-BUILD-01, REQ-BUILD-03, REQ-BUILD-04; design §3.2; gotcha R4/H7 del proposal.

**Commit sugerido**: `chore(infra): add backend pnpm-workspace.yaml with allowBuilds only`

---

### 1.2 - [ ] Generar `backend/pnpm-lock.yaml` con `pnpm install`

**Entrega**: lockfile de pnpm para el backend, generado CON cooldown desactivado
(el `pnpm-workspace.yaml` de la task 1.1 no tiene `minimumReleaseAge` todavía).
Fase 2 del procedimiento de generación de lockfile (design §4).

**Acción manual** (desde `backend/`):
```bash
pnpm install
```

Esto produce:
- `backend/pnpm-lock.yaml` — árbol de dependencias resuelto por pnpm.
- `backend/node_modules/` — instalación funcional (bcrypt compila, prisma engines se posicionan).

**Validaciones post-install** (antes de committear):
```bash
# desde backend/
# bcrypt compila correctamente (binding nativo autorizado por allowBuilds)
node -e "require('bcrypt').hashSync('x', 10)" && echo "bcrypt OK"

# prisma generate funciona (client tipado generado)
pnpm exec prisma generate
```

**Verificación de integridad del lockfile**:
- `pnpm install` no reportó `ERR_PNPM_IGNORED_BUILDS` para bcrypt, prisma, @prisma/client, @prisma/engines.
- Si alguno de los paquetes bloqueados (false) reporta un script ignorado, es esperado y correcto.
- El árbol de dependencias es funcionalmente equivalente al de npm (revisar si hay versiones muy distintas).

**Archivos** (nuevos):
- `backend/pnpm-lock.yaml` — committear este archivo.

**Archivos** (sin tocar todavía): `backend/package-lock.json` (se elimina en task 1.3), `backend/package.json` (se toca en task 1.3), `backend/pnpm-workspace.yaml` (se completa en task 1.3).

**Tests que se agregan**: ninguno.

**Verificación**:
```bash
# desde backend/
pnpm exec tsc --noEmit -p tsconfig.json    # typecheck limpio con pnpm
pnpm run build                             # nest build → dist/ generado con pnpm
```

**Cubre**: spec REQ-PKG-03, REQ-REPRO-04; design §4; escenarios E-PKG-01, E-BUILD-01, E-BUILD-02, E-FUNC-01.

**Commit sugerido**: `chore(infra): add backend pnpm-lock.yaml (generated without cooldown)`

---

### 1.3 - [ ] Activar cooldown en backend, agregar `packageManager`, eliminar `package-lock.json`

**Entrega**: estado FINAL del backend tras la migración. Tres cambios atómicos
en un solo commit:
1. Añadir cooldown de 72h al `pnpm-workspace.yaml` (design §3.2, bloque final).
2. Agregar `"packageManager": "pnpm@11.2.2"` en `backend/package.json`.
3. Eliminar `backend/package-lock.json` del git history.

**Archivos** (modificados):
- `backend/pnpm-workspace.yaml` — agregar al final del archivo:
  ```yaml
  # Cooldown de versiones nuevas (proposal Decisión 1 — nivel MÁXIMO). En MINUTOS.
  # 4320 = 72h. Una versión publicada hace < 72h NO se instala (la mayoría de los
  # ataques de supply-chain se detectan/yankean en las primeras horas).
  # Default de pnpm 11 es 1440 (24h); lo subimos a 72h.
  minimumReleaseAge: 4320
  # Strict: el cooldown aplica también a transitivas/peer, no solo a deps directas.
  minimumReleaseAgeStrict: true
  ```
- `backend/package.json` — agregar como campo top-level:
  ```json
  "packageManager": "pnpm@11.2.2"
  ```

**Archivos** (eliminados):
- `backend/package-lock.json` — `git rm backend/package-lock.json`

**Tests que se agregan**: ninguno.

**Verificación**:
```bash
# Verificar que el cooldown está presente en el workspace.yaml
grep -c "minimumReleaseAge" backend/pnpm-workspace.yaml    # → 1
grep -c "minimumReleaseAgeStrict" backend/pnpm-workspace.yaml  # → 1

# Verificar que packageManager está en package.json
grep "packageManager" backend/package.json   # → "packageManager": "pnpm@11.2.2"

# Verificar que package-lock.json no está tracked
git ls-files backend/package-lock.json       # → sin salida

# Install con lockfile congelado (simula CI/Docker — no debe re-resolver)
pnpm install --frozen-lockfile               # exit 0

# Verde técnico
cd backend && pnpm exec tsc --noEmit -p tsconfig.json
```

**Cubre**: spec REQ-PKG-02, REQ-PKG-04, REQ-COOL-01, REQ-COOL-02, REQ-COOL-03, REQ-PROV-04; design §3.2, §7, §8.1; escenarios E-PKG-03, E-COOL-01, E-PROV-05.

**Commit sugerido**: `chore(infra): enable 72h cooldown, add packageManager field, remove backend package-lock.json`

---

## Fase 2 — Frontend: switch a pnpm

### 2.1 - [ ] Crear `frontend/pnpm-workspace.yaml` (SOLO `allowBuilds: {}`, sin cooldown)

**Entrega**: archivo de configuración de proyecto single-project para el frontend,
con `allowBuilds: {}` (mapa vacío — el frontend no tiene ningún paquete que
necesite lifecycle scripts). Sin cooldown todavía (mismo gotcha que en 1.1).

**Archivos** (nuevos):
- `frontend/pnpm-workspace.yaml` — contenido exacto (design §3.3, sin cooldown):

```yaml
# frontend/pnpm-workspace.yaml
# Configuración single-project de pnpm 11 (sin campo `packages`). H1.

# Cero install scripts en el árbol del frontend (verificado, H3): allowBuilds
# vacío bloquea TODO build de dependencia. Si pnpm reporta un build ignorado en
# `pnpm install`, NO agregar a ciegas: investigar el paquete primero.
allowBuilds: {}
```

> **NO agregar las líneas de cooldown todavía.** Se agregan en task 2.3.

**Tests que se agregan**: ninguno.

**Verificación**: archivo existe, YAML válido, no contiene `minimumReleaseAge`.

**Cubre**: spec REQ-BUILD-02, REQ-BUILD-05; design §3.3; gotcha R4/H7.

**Commit sugerido**: `chore(infra): add frontend pnpm-workspace.yaml with empty allowBuilds`

---

### 2.2 - [ ] Generar `frontend/pnpm-lock.yaml` con `pnpm install`

**Entrega**: lockfile de pnpm para el frontend, generado sin cooldown activo.
Fase 2 del procedimiento de generación de lockfile para el frontend (design §4).

**Acción manual** (desde `frontend/`):
```bash
pnpm install
```

Esto produce:
- `frontend/pnpm-lock.yaml` — árbol de dependencias resuelto.
- `frontend/node_modules/` — instalación funcional (React, Vite, TanStack Query, etc.).

**Verificación post-install**:
- `pnpm install` no reportó `ERR_PNPM_IGNORED_BUILDS` problemáticos (el frontend no debe tener builds).
- Si algún paquete reporta un script ignorado, revisar si es seguro bloquearlo o si hay que agregarlo a `allowBuilds`.

**Archivos** (nuevos):
- `frontend/pnpm-lock.yaml` — committear este archivo.

**Tests que se agregan**: ninguno.

**Verificación**:
```bash
# desde frontend/
pnpm run build         # tsc -b && vite build → dist/ generado con pnpm
pnpm exec vitest run   # suite vitest verde con pnpm
```

**Cubre**: spec REQ-PKG-03, REQ-REPRO-04, REQ-FUNC-06; design §4; escenarios E-PKG-02, E-BUILD-05, E-FUNC-07, E-FUNC-08, E-FUNC-09.

**Commit sugerido**: `chore(infra): add frontend pnpm-lock.yaml (generated without cooldown)`

---

### 2.3 - [ ] Activar cooldown en frontend, agregar `packageManager`, eliminar `package-lock.json`

**Entrega**: estado FINAL del frontend tras la migración. Tres cambios atómicos
análogos a la task 1.3 del backend.

**Archivos** (modificados):
- `frontend/pnpm-workspace.yaml` — agregar al final del archivo:
  ```yaml
  # Cooldown de 72h, estricto — igual que backend (nivel MÁXIMO).
  minimumReleaseAge: 4320
  minimumReleaseAgeStrict: true
  ```
- `frontend/package.json` — agregar como campo top-level:
  ```json
  "packageManager": "pnpm@11.2.2"
  ```

**Archivos** (eliminados):
- `frontend/package-lock.json` — `git rm frontend/package-lock.json`

**Tests que se agregan**: ninguno.

**Verificación**:
```bash
# Verificar cooldown presente
grep -c "minimumReleaseAge" frontend/pnpm-workspace.yaml    # → 1
grep -c "minimumReleaseAgeStrict" frontend/pnpm-workspace.yaml  # → 1

# Verificar packageManager
grep "packageManager" frontend/package.json   # → "packageManager": "pnpm@11.2.2"

# Verificar que package-lock.json no está tracked
git ls-files frontend/package-lock.json       # → sin salida

# Install congelado
cd frontend && pnpm install --frozen-lockfile  # exit 0

# Verde técnico
pnpm run build
pnpm exec vitest run
```

**Cubre**: spec REQ-PKG-02, REQ-PKG-04, REQ-COOL-01, REQ-COOL-02, REQ-PROV-04; design §3.3, §7, §8.1; escenarios E-BUILD-05, E-COOL-01, E-PROV-05.

**Commit sugerido**: `chore(infra): enable 72h cooldown, add packageManager field, remove frontend package-lock.json`

---

## Fase 3 — CI: migrar `.github/workflows/ci.yml` a pnpm

### 3.1 - [ ] Reescribir ambos jobs del CI con pnpm (design §5)

**Entrega**: los dos jobs de `.github/workflows/ci.yml` (`build-and-test` para
backend y `frontend`) migrados a pnpm. La estructura de cada job (name, triggers,
services, defaults.run.working-directory, env vars, node-version) se conserva
íntegramente. Solo se reescriben los `steps:`.

**Archivos** (modificados):
- `.github/workflows/ci.yml`

**Cambios por job:**

**Job `build-and-test` (backend)** — reemplazar el bloque `steps:` completo con (design §5.2):
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

**Job `frontend`** — reemplazar el bloque `steps:` completo con (design §5.3):
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

**Verificación de integridad (inspección manual del YAML resultante)**:
```bash
# Orden crítico: action-setup DEBE aparecer ANTES que setup-node en ambos jobs
grep -n "action-setup\|setup-node" .github/workflows/ci.yml

# No deben quedar referencias a npm/npx en el archivo
grep -n "npm \|npx " .github/workflows/ci.yml   # → cero resultados

# El audit step NO tiene continue-on-error: true
grep -A2 "audit-level" .github/workflows/ci.yml | grep "continue-on-error"  # → sin salida

# Los cache-dependency-path apuntan a pnpm-lock.yaml (no a package-lock.json)
grep "cache-dependency-path" .github/workflows/ci.yml
```

**Tests que se agregan**: ninguno (cambio de infraestructura; se valida en CI al abrir el PR).

**Cubre**: spec REQ-REPRO-01, REQ-REPRO-02, REQ-REPRO-03, REQ-AUDIT-01, REQ-AUDIT-02, REQ-AUDIT-04, REQ-PROV-01, REQ-PROV-02; design §5.1, §5.2, §5.3; escenarios E-REPRO-02, E-AUDIT-01, E-AUDIT-04, E-PKG-05, E-PROV-01, E-PROV-02.

**Commit sugerido**: `chore(infra): migrate CI jobs to pnpm with action-setup and audit gate`

---

## Fase 4 — Docker: reescribir `backend/Dockerfile`

### 4.1 - [ ] Reescribir el Dockerfile del backend para usar pnpm (design §6)

**Entrega**: `backend/Dockerfile` migrado a pnpm. Multi-stage `builder` +
`runner` sobre `node:24-alpine`. `ENV TZ=UTC` preservado intacto en el runner.
El CMD usa el binario local `node_modules/.bin/prisma` (no `npx` ni `pnpm exec`)
— decisión explícita del design §6 (el runner no instala pnpm).

**Archivos** (modificados):
- `backend/Dockerfile` — contenido completo resultante (design §6.1):

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

**Verificación**:
```bash
# Construir la imagen localmente
docker build -t avicont-backend:pnpm-test ./backend

# Verificar TZ=UTC preservado
docker run --rm avicont-backend:pnpm-test sh -c 'echo $TZ'   # → UTC

# Verificar que no hay corepack ni npx en el Dockerfile
grep -E "corepack|npx" backend/Dockerfile   # → sin salida

# Verificar --frozen-lockfile explícito en el builder
grep "frozen-lockfile" backend/Dockerfile   # → debe aparecer

# Verde técnico final del builder
# (el build de la imagen valida que pnpm install + build funcionan en Docker)
```

**Tests que se agregan**: ninguno.

**Cubre**: spec REQ-REPRO-02, REQ-FUNC-04, REQ-FUNC-05, REQ-FUNC-06, REQ-PROV-03; design §6, §6.1; escenarios E-REPRO-01, E-FUNC-04, E-FUNC-05, E-FUNC-06, E-PROV-04.

**Commit sugerido**: `chore(infra): migrate backend Dockerfile to pnpm with frozen-lockfile`

---

## Fase 5 — `.gitignore`: bloquear `package-lock.json`

### 5.1 - [ ] Agregar `package-lock.json` al `.gitignore` raíz

**Entrega**: `package-lock.json` agregado al `.gitignore` de la raíz del monorepo
para impedir que npm lo regenere y lo cuele en un futuro commit. El patrón sin
slash matchea recursivamente en git (cubre `backend/package-lock.json` y
`frontend/package-lock.json`).

**Archivos** (modificados):
- `.gitignore` (raíz) — agregar al final:
  ```
  package-lock.json
  ```

El archivo resultante (design §8.2):
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

> **NO ignorar** `pnpm-lock.yaml` ni `pnpm-workspace.yaml` — esos SÍ se committean.

**Tests que se agregan**: ninguno.

**Verificación**:
```bash
# Verificar que el patrón está presente
grep "package-lock.json" .gitignore   # → package-lock.json

# Verificar que pnpm-lock.yaml NO está en .gitignore
grep "pnpm-lock" .gitignore           # → sin salida
```

**Cubre**: spec REQ-PKG-02; design §8.2; escenario E-PKG-04.

**Commit sugerido**: `chore(infra): ignore package-lock.json in .gitignore`

---

## Fase 6 — Docs: actualizar referencias npm/npx en documentos operativos

### 6.1 - [ ] Actualizar CLAUDE.md §11, README.md, `docs/entorno-local.md`, `openspec/config.yaml`

**Entrega**: cero referencias a `npm install`, `npm ci`, `npm run`, `npm test`
ni `npx` en los cuatro artefactos documentales operativos. Reemplazo limpio
según tabla de equivalencias (design §9.1):

| npm | pnpm |
|-----|------|
| `npm ci` | `pnpm install --frozen-lockfile` |
| `npm install` | `pnpm install` |
| `npm run <script>` | `pnpm run <script>` |
| `npm test` | `pnpm test` |
| `npx <bin>` | `pnpm exec <bin>` |

**Archivos** (modificados):

**`CLAUDE.md` §11** (~22 referencias — design §9.2):
- Subsección 11.2 (Prisma): `DATABASE_URL=... npx prisma migrate dev ...` → `DATABASE_URL=... pnpm exec prisma migrate dev ...`; ídem para `migrate deploy`, `migrate status`, `generate`, `studio`.
- Subsección 11.3 (Tests): `npx jest src/` → `pnpm exec jest src/`; `npx jest test/ --runInBand --forceExit` → `pnpm exec jest test/ --runInBand --forceExit`; `npm test` → `pnpm test`.
- Subsección 11.4 (Lint): `npx tsc --noEmit` → `pnpm exec tsc --noEmit`; `npm run lint` → `pnpm run lint`; `npm run format` → `pnpm run format`.
- Subsección 11.5 (Checklist): `npm run start:dev` → `pnpm run start:dev`.
- Subsección 11.6 (Protocolo migrations): cualquier referencia residual a `npx prisma` → `pnpm exec prisma`.

**`docs/entorno-local.md`** (~9 referencias — design §9.2):
- `npm install` → `pnpm install`.
- `npm run dev`/`npm run prisma:migrate`/`npm run start:dev` → `pnpm run dev`/`pnpm run prisma:migrate`/`pnpm run start:dev`.
- `npx ts-node prisma/seeds/...` → `pnpm exec ts-node prisma/seeds/...`.
- `cd frontend && npm run dev` → `cd frontend && pnpm run dev`.

**`README.md`** (~5 referencias — design §9.2):
- `npm install` → `pnpm install`.
- `npm run prisma:migrate`/`npm run start:dev`/`npm run dev` → `pnpm run ...`.

**`openspec/config.yaml`** (6+ campos — design §9.3):

| Campo | Valor actual | Valor nuevo |
|-------|--------------|-------------|
| `testing.test_runner.command` | `npm test` | `pnpm test` |
| `testing.test_runner.integration_command` | `DATABASE_URL=... npx jest src/` | `DATABASE_URL=... pnpm exec jest src/` |
| `testing.test_runner.e2e_command` | `DATABASE_URL=... npx jest test/ --runInBand --forceExit` | `DATABASE_URL=... pnpm exec jest test/ --runInBand --forceExit` |
| `testing.coverage.command` | `npx jest --coverage` | `pnpm exec jest --coverage` |
| `testing.quality.linter.command` | `npm run lint` | `pnpm run lint` |
| `testing.quality.formatter.command` | `npm run format` | `pnpm run format` |
| `testing.quality.type_checker.command` | `npx tsc --noEmit -p tsconfig.json` | `pnpm exec tsc --noEmit -p tsconfig.json` |

**Tests que se agregan**: ninguno.

**Verificación (grep de residuos — spec §2.7 REQ-DOC-05)**:
```bash
# Ninguno de estos debe devolver resultados
grep -n "npm install\|npm ci\|npm run\|npm test\|npx " CLAUDE.md
grep -n "npm install\|npm ci\|npm run\|npm test\|npx " README.md
grep -n "npm install\|npm ci\|npm run\|npm test\|npx " docs/entorno-local.md
grep -n "npm install\|npm ci\|npm run\|npm test\|npx " openspec/config.yaml
```

> Es aceptable que `CLAUDE.md` contenga la tabla de equivalencias npm → pnpm del §9.1 del design
> (que menciona `npm` como referencia documental). Esas menciones son intencionales y
> no son comandos operativos a ejecutar. El grep de REQ-DOC-05 aplica a la sección §11
> (runbook operativo), no al glosario.

**Cubre**: spec REQ-DOC-01, REQ-DOC-02, REQ-DOC-03, REQ-DOC-04, REQ-DOC-05; design §9.1, §9.2, §9.3; escenarios E-DOC-01, E-DOC-02, E-DOC-03, E-DOC-04.

**Commit sugerido**: `chore(infra): update operational docs to pnpm commands`

---

## Fase 7 — Verificación final local

### 7.1 - [ ] Verde final: build backend + frontend + imagen Docker

**Entrega**: checkpoint de que el change completo funciona de principio a fin
antes de abrir el PR. No hay código nuevo; solo validación.

**Comandos** (desde la raíz del monorepo, con Postgres y Redis arriba):

```bash
# Paso 0: levantar servicios mínimos
docker compose up -d postgres redis

# ─── BACKEND ───────────────────────────────────────────────────────────
cd backend

# Install con lockfile congelado (simula CI y Docker)
pnpm install --frozen-lockfile

# TypeCheck limpio
pnpm exec tsc --noEmit -p tsconfig.json

# Lint
pnpm run lint

# Prisma generate (valida allowBuilds @prisma/client)
pnpm run prisma:generate

# Build de producción
pnpm run build

# Audit gate (igual que CI — pre-merge obligatorio)
pnpm audit --audit-level high

# Tests unitarios + integración
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
  pnpm exec jest src/ --runInBand

# E2E
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
JWT_ACCESS_SECRET="test-secret" \
JWT_REFRESH_SECRET="test-refresh" \
  pnpm exec jest test/ --runInBand --forceExit

# ─── FRONTEND ──────────────────────────────────────────────────────────
cd ../frontend

pnpm install --frozen-lockfile
pnpm run lint
pnpm exec vitest run
pnpm run build
pnpm audit --audit-level high

# ─── DOCKER ────────────────────────────────────────────────────────────
cd ..
docker build -t avicont-backend:pnpm-test ./backend

# TZ=UTC preservado (CLAUDE.md §4.6)
docker run --rm avicont-backend:pnpm-test sh -c 'echo $TZ'   # → UTC

# ─── HIGIENE DEL REPO ──────────────────────────────────────────────────
# pnpm-lock.yaml committeado en ambos proyectos
git ls-files backend/pnpm-lock.yaml frontend/pnpm-lock.yaml

# package-lock.json NO en el repo
git ls-files backend/package-lock.json frontend/package-lock.json   # → sin salida

# Cooldown presente en ambos workspace.yaml
grep "minimumReleaseAge: 4320" backend/pnpm-workspace.yaml frontend/pnpm-workspace.yaml

# Cero residuos npm/npx en docs operativos
grep -rn "npm install\|npm ci\|npm run\|npm test\|npx " \
  CLAUDE.md README.md docs/entorno-local.md openspec/config.yaml
```

**Todo verde → el PR está listo para squash merge.**

**Cubre**: spec §6 (Coverage objetivo — todas las verificaciones de tooling);
design §10 (Plan de verificación completo); escenarios E-PKG-01 a E-PKG-05,
E-REPRO-01, E-BUILD-01 a E-BUILD-05, E-COOL-01, E-AUDIT-01, E-AUDIT-03,
E-AUDIT-04, E-FUNC-01 a E-FUNC-09, E-DOC-01 a E-DOC-04, E-PROV-01 a E-PROV-05.

> Este checkpoint no genera un commit propio — es el gate de calidad antes de
> abrir el PR. Si algo falla, se corrige en la tarea de la fase correspondiente
> y se re-verifica.

---

## Estimación

| Fase | Tasks | Tiempo estimado |
|------|-------|-----------------|
| 1 — Backend switch a pnpm | 3 | ~45 min (1.2 depende de velocidad de red para descargar engines) |
| 2 — Frontend switch a pnpm | 3 | ~30 min |
| 3 — CI | 1 | ~30 min |
| 4 — Docker | 1 | ~30 min (más tiempo de build de imagen) |
| 5 — .gitignore | 1 | ~5 min |
| 6 — Docs | 1 | ~30 min |
| 7 — Verificación final | 1 | ~20 min |
| **Total** | **11 tasks / 7 commits** | **~3h efectivos** |

---

## Orden crítico recordatorio

```
OBLIGATORIO (gotcha R4/H7):
  1.1 (workspace sin cooldown) → 1.2 (generar lockfile) → 1.3 (activar cooldown)
  2.1 (workspace sin cooldown) → 2.2 (generar lockfile) → 2.3 (activar cooldown)

Si se invierte el orden y se pone el cooldown ANTES de generar el lockfile,
pnpm rechaza instalar deps publicadas hace <72h y el install falla con exit 1.

OBLIGATORIO (orden CI — gotcha R5/H4):
  En ci.yml, `pnpm/action-setup@v4` DEBE estar ANTES que `actions/setup-node`.
  Si se invierte, el cache de pnpm falla porque pnpm no existe cuando setup-node
  intenta resolverlo.
```

---

## Riesgos recordatorios desde design

| Riesgo | Task donde se mitiga |
|--------|----------------------|
| R1 (`allowBuilds` mal config rompe bcrypt o Prisma) | 1.2 (validar bcrypt + prisma generate post-install) |
| R2 (coexistencia de lockfiles npm+pnpm) | 1.3 y 2.3 (git rm de ambos package-lock.json) + 5.1 (.gitignore) |
| R3 (audit gate rompe CI el día 1 por vuln pre-existente) | 7.1 (correr pnpm audit local en ambos proyectos antes de abrir el PR) |
| R4 (generar lockfile con cooldown activo falla) | 1.1→1.2→1.3 y 2.1→2.2→2.3 (orden estricto, sin shortcut) |
| R5 (orden steps CI: action-setup después de setup-node) | 3.1 (verificar grep del orden en ci.yml post-edición) |

## Task de mayor riesgo

**Task 1.2** (`pnpm install` backend): si `allowBuilds` está mal configurado,
`bcrypt` o los engines de Prisma fallan en compilar y el install termina con
`ERR_PNPM_IGNORED_BUILDS`. Mitigación: validar explícitamente
`node -e "require('bcrypt').hashSync('x', 10)"` y `pnpm exec prisma generate`
antes de committear el lockfile.

**Task 3.1** (CI): el orden `pnpm/action-setup` → `actions/setup-node` es
no-negociable. Un grep post-edición (`grep -n "action-setup\|setup-node" ci.yml`)
confirma el orden visualmente antes de pushear.
