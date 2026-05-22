# Proposal: migrar-a-pnpm

> Fecha: 2026-05-22
> Fase: proposal
> Proyecto: avicont

---

## Resumen

Migrar el gestor de paquetes de **npm → pnpm 11.2.2** en los dos proyectos Node
del monorepo (`backend/` y `frontend/`), configurado en **nivel de seguridad
máximo**, para cerrar los principales vectores de ataque supply-chain del
ecosistema npm. Cambio de tooling transversal, scope `infra`, un solo PR.

---

## Why

La motivación es **seguridad de la cadena de suministro (supply-chain)**. npm
ejecuta scripts de ciclo de vida (`preinstall`/`install`/`postinstall`) de
**todas** las dependencias en cada `npm install`, sin distinción. Un paquete
comprometido (typosquatting, cuenta de mantenedor hackeada, dependencia
transitiva envenenada) corre código arbitrario en la máquina del dev y en CI
con un simple install. Hoy el proyecto es vulnerable a esto por default.

pnpm cierra ese vector y agrega defensas adicionales. Tres razones técnicas
concretas:

1. **Bloqueo de install/lifecycle scripts por default** (vector #1 de
   supply-chain). pnpm NO corre scripts de build de dependencias salvo que se
   listen explícitamente en `allowBuilds`. npm los corre siempre. Esto reduce la
   superficie de ataque de "cualquier dep del árbol" a "solo los paquetes que YO
   autoricé a buildear".
2. **Cooldown de versiones nuevas** (`minimumReleaseAge`). pnpm puede negarse a
   instalar versiones publicadas hace menos de N minutos. La mayoría de los
   ataques de supply-chain se detectan y retiran (yank) en las primeras horas;
   un cooldown largo evita instalar la versión maliciosa en esa ventana.
3. **`node_modules` estricto sin phantom dependencies.** pnpm usa un store con
   symlinks: un paquete solo ve lo que declaró en su `package.json`. Elimina las
   "phantom deps" (usar un paquete que no declaraste, que funciona por accidente
   porque otro lo trajo) — que además son un riesgo si esa dep transitiva
   desaparece o se compromete.

---

## What Changes

Migración paralela en **ambos proyectos** del monorepo. Cada proyecto es un Node
package independiente (NO hay npm workspaces ni `package.json` raíz), así que
cada uno lleva su propio lockfile y su propio `pnpm-workspace.yaml` de
configuración single-project.

### Archivos nuevos

- `backend/pnpm-lock.yaml`, `frontend/pnpm-lock.yaml` — lockfiles de pnpm.
- `backend/pnpm-workspace.yaml`, `frontend/pnpm-workspace.yaml` — config de
  proyecto single (`allowBuilds` + `minimumReleaseAge`; SIN campo `packages`,
  ver Hallazgo H1).
- Campo `"packageManager": "pnpm@11.2.2"` en ambos `package.json` (pin para
  desarrollo local; corepack/pnpm lo respetan).

### Archivos a eliminar

- `backend/package-lock.json`, `frontend/package-lock.json`.
- Agregar `package-lock.json` a `.gitignore` (la raíz solo ignora `node_modules`
  hoy) para impedir que vuelvan a colarse.

### Archivos a modificar

- `.github/workflows/ci.yml` — **dos jobs** (`build-and-test` backend +
  `frontend`). En ambos: agregar `pnpm/action-setup@v4` (version 11) ANTES de
  `actions/setup-node`, cambiar `cache: 'npm'` → `cache: 'pnpm'`,
  `cache-dependency-path` → `<proj>/pnpm-lock.yaml`, `npm ci` → `pnpm install`,
  `npm run X`/`npx Y` → `pnpm X`/`pnpm exec Y`. Agregar step
  **`pnpm audit --audit-level high` BLOQUEANTE**.
- `backend/Dockerfile` — multi-stage (`builder` + `runner` sobre `node:24-alpine`).
  Instalar pnpm con `npm i -g pnpm@11.2.2` en cada stage que lo necesite (NO
  corepack, ver Decisión 2), `npm ci` → `pnpm install --frozen-lockfile`
  (explícito: Docker no setea `CI=true`, ver H5), `COPY package*.json` →
  `COPY package.json pnpm-lock.yaml pnpm-workspace.yaml`, comandos `npm run`/`npx`
  → `pnpm`. La copia de `node_modules` entre stages se mantiene (los symlinks de
  pnpm son relativos dentro de `node_modules/.pnpm`, ver H6).
- `CLAUDE.md` §11 (~22 refs `npm`/`npx`), `docs/entorno-local.md`, `README.md`
  (~5 refs) — actualizar los comandos operativos a pnpm.
- `openspec/config.yaml` — comandos `npm test`/`npm run lint`/`npm run format` de
  las secciones `testing` y `quality` a su equivalente pnpm.

### Configuración de `allowBuilds` (Hallazgo H3 verificado)

- **backend** — `true`: `bcrypt`, `prisma`, `@prisma/client`, `@prisma/engines`.
  `false`: `@nestjs/core`, `@scarf/scarf`, `protobufjs`, `unrs-resolver`
  (telemetría/postinstall innecesarios; bloquearlos es seguro).
- **frontend** — `allowBuilds: {}` (cero install scripts).

---

## What Does NOT Change (out of scope)

- **No se dockeriza el frontend.** No existe `frontend/Dockerfile` hoy y este
  cambio no lo crea (queda como deuda, ver Affected/Deudas).
- **No se agrega Dependabot ni Renovate ni `dependency-review-action`** en este
  PR. Son el companion natural del cooldown (auto-PRs de bump + gate de licencias
  /vulns en PRs), pero van en un cambio aparte (deuda diferida).
- **No se tocan versiones de dependencias** salvo lo que pnpm resuelva al generar
  el lockfile desde los `package.json` actuales (debe ser equivalente al árbol de
  npm; cualquier diferencia se revisa en apply). No es un upgrade de deps.
- **No se toca `docker-compose.yml`.** El volume anónimo `/app/node_modules`
  sigue siendo válido con pnpm.
- **No se toca configuración de build/test:** `tsconfig.json`, `vite.config`,
  `jest.config`, ni el código de aplicación.

---

## Decisiones cerradas

Decididas por Marco; documentadas con su tradeoff aceptado. **No re-abrir.**

### Decisión 1: Nivel de seguridad — MÁXIMO

El proyecto quedará idle mientras Marco trabaja en otro, así que el costo del
cooldown largo NO molesta. Concretamente:

- `minimumReleaseAge: 4320` (72h) + `minimumReleaseAgeStrict: true` en cada
  `pnpm-workspace.yaml`. (Default de pnpm 11 ya es 1440 = 24h; lo subimos a 72h.)
- `pnpm audit --audit-level high` como step **BLOQUEANTE** de CI: rompe el build
  ante cualquier vuln `high`/`critical`.
- `allowBuilds` conservador: solo los paquetes críticos en `true` (los que de
  verdad necesitan compilar/generar para funcionar — bcrypt nativo, engines de
  Prisma); todo lo demás en `false`.

**Tradeoff aceptado**: no se puede instalar una versión recién publicada por 72h
(incluso fixes urgentes esperan, salvo override manual del cooldown). Como el
proyecto está pausado, el tradeoff es favorable: prioriza seguridad sobre
inmediatez de updates.

### Decisión 2: Provisioning de pnpm por entorno

- **CI**: `pnpm/action-setup@v4` con `version: 11`. Es el método oficial y se
  integra con el cache de `actions/setup-node` (`cache: 'pnpm'`).
- **Docker**: `npm i -g pnpm@11.2.2`. NO usamos corepack porque **corepack se
  remueve en Node 25** — atarse a corepack es deuda inmediata.
- **Local**: campo `"packageManager": "pnpm@11.2.2"` en ambos `package.json`,
  que pnpm respeta para fijar la versión del dev.

**Tradeoff aceptado**: tres mecanismos de provisioning distintos (uno por
entorno) en vez de uno unificado. Es el precio de no depender de corepack y de
usar la mejor herramienta de cada contexto.

### Decisión 3: Estructura de entrega — un solo PR `chore(infra)`

Toda la migración (config + lockfiles + CI + Docker + docs) viaja en **un único
PR** con scope `chore(infra)`, docs incluidas.

**Rationale**: la migración es atómica e indivisible — un PR parcial dejaría el
repo en estado inconsistente (lockfile de pnpm sin CI que lo use, o CI con pnpm
sin lockfile committeado). Squash merge: revertir = un solo `git revert`.

**Tradeoff aceptado**: el PR toca varios archivos a la vez (CI, Docker, docs,
config). Es transversal por naturaleza; no se puede partir por módulo porque no
afecta a ningún módulo de dominio.

---

## Affected Modules y deudas bidireccionales

Este cambio **NO toca ningún módulo de dominio** (`backend/src/**`). Afecta solo
la capa de tooling/infra del monorepo.

| Área | Tipo de cambio | Blast radius |
|---|---|---|
| `.github/workflows/ci.yml` | Modificación | 2 jobs migrados a pnpm + step `pnpm audit` bloqueante. Riesgo: si el orden `action-setup` → `setup-node` se invierte, el cache falla (H4). |
| `backend/Dockerfile` | Modificación | pnpm global + `--frozen-lockfile` explícito + COPY de archivos de config pnpm. Preservar `ENV TZ=UTC` (§4.6). |
| `backend/`, `frontend/` (config Node) | Adición | `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `packageManager`. Eliminación de `package-lock.json`. |
| `CLAUDE.md` §11, `docs/entorno-local.md`, `README.md`, `openspec/config.yaml` | Modificación | Comandos operativos npm → pnpm. Cero cambio funcional. |
| `backend/src/**`, `frontend/src/**` | Sin cambios | Código de app intacto. |
| `prisma/schema.prisma`, migrations | Sin cambios | Cero migration. |
| `docker-compose.yml` | Sin cambios | Volume `node_modules` sigue válido. |

### Deudas que abre (futuras)

- **corepack → Node 25**: con Node 25, corepack desaparece. El provisioning vía
  `npm i -g pnpm@<v>` (Docker) y `pnpm/action-setup` (CI) ya lo evita, pero el
  pin de versión deberá mantenerse manualmente al subir de Node.
- **Dependabot / `dependency-review-action`** como companion del cooldown:
  diferido a un PR separado. El cooldown bloquea instalar versiones nuevas pero
  no genera PRs de bump ni revisa licencias/vulns en cada PR — eso lo cubre el
  companion.
- **`frontend/Dockerfile`**: el frontend hoy no se dockeriza. Cuando se haga,
  deberá nacer ya con pnpm (mismo patrón que el backend).

---

## Invariantes del core a respetar (CLAUDE.md §4)

Este cambio es **tooling puro**: NO toca dominio contable, schema, ni código de
aplicación. Por lo tanto, **§4.1–§4.5, §4.7–§4.9 NO aplican** (partida doble,
multi-tenant, inmutabilidad post-contabilizado, period lock, dinero=Decimal,
no-soft-delete, unicidad de documentos, correlativos atómicos): no hay dominio
contable involucrado.

Aplican / se respetan:

- **§4.6 (FechaContable / TZ=UTC)**: el `ENV TZ=UTC` del `runner` stage del
  `backend/Dockerfile` se **preserva intacto**. La migración a pnpm NO toca esa
  línea. Verificar en apply que sigue presente tras editar el Dockerfile.
- **§9 (Git/commits/branches)**: commit `chore(infra)` (tooling transversal),
  Conventional Commits en inglés, GitHub Flow (branch por feature, PR
  obligatorio, push directo a `main` prohibido), squash merge only, SIN
  `Co-Authored-By:`, SIN `--no-verify`.

---

## Plan de rollback

Cambio **sin migration de schema y sin cambios de dominio** → rollback trivial,
sin pérdida de datos ni downtime más allá del deploy estándar.

1. `git revert <sha-del-PR>`: revierte CI, Dockerfile, docs, config y la
   eliminación de los `package-lock.json` (los lockfiles de npm viven en el git
   history y el revert los restaura tal cual estaban).
2. Tras el revert, `actions/setup-node` vuelve a `cache: 'npm'` y CI corre
   `npm ci` contra los `package-lock.json` restaurados. El Dockerfile vuelve a
   `npm ci`.
3. Los `pnpm-lock.yaml` / `pnpm-workspace.yaml` quedan eliminados por el revert;
   borrar `node_modules` locales y reinstalar con `npm ci` si se trabaja en local.
4. No hay estado persistido a limpiar: la migración no escribe en BD ni cambia
   datos. El árbol de dependencias resuelto por pnpm es equivalente al de npm.

---

## Riesgos

- **R1: `allowBuilds` mal configurado rompe deps nativas/críticas.** Si `bcrypt`
  o los engines de Prisma quedan sin `allowBuilds: true`, no compilan/no se
  generan y la app revienta en runtime (hash de passwords, queries). Mitigación:
  la lista de H3 está verificada con pnpm 11.2.2; tras `pnpm install` validar
  `bcrypt` y `prisma generate` antes de mergear. Recordar que SIN `allowBuilds`
  correcto `pnpm install` sale con **exit 1** (`ERR_PNPM_IGNORED_BUILDS`) — el
  fallo es ruidoso, no silencioso (bueno).
- **R2: coexistencia de lockfiles.** Si un `package-lock.json` sobrevive al PR,
  algún entorno podría seguir usando npm (árbol distinto, scripts corriendo).
  Mitigación: eliminar AMBOS lockfiles npm en el mismo PR + agregarlos a
  `.gitignore`.
- **R3: el audit gate bloqueante puede romper CI el día 1.** Si el árbol actual
  ya tiene una vuln `high`/`critical` sin fix disponible, `pnpm audit
  --audit-level high` rompe el build apenas se mergea. Mitigación: correr
  `pnpm audit` en local ANTES de mergear; si aparece una vuln sin fix, decidir
  (override puntual / `pnpm.overrides` / esperar fix) ANTES, no descubrirlo en
  `main`.
- **R4 (orden de generación, GOTCHA crítico — H7): con cooldown 72h activo,
  generar el lockfile desde cero FALLA** si alguna dep matchea una versión
  publicada hace <72h. Mitigación / **secuencia obligatoria en apply**:
  (1) generar `pnpm-lock.yaml` PRIMERO, con el `pnpm-workspace.yaml` conteniendo
  SOLO `allowBuilds`; (2) recién DESPUÉS agregar `minimumReleaseAge` +
  `minimumReleaseAgeStrict` al workspace. Una vez committeado el lockfile, los
  installs usan `--frozen-lockfile` (en CI lo activa `CI=true` automático; en
  Docker se pasa explícito) y el chequeo de age NO se vuelve a aplicar.
- **R5: orden de steps en CI.** `pnpm/action-setup` DEBE ir ANTES de
  `actions/setup-node`, o el `cache: 'pnpm'` falla porque pnpm aún no existe
  cuando setup-node intenta cachear (H4). Mitigación: verificado; respetar el
  orden en ambos jobs.

---

## Hallazgos técnicos verificados (de la fase explore — pnpm 11.2.2)

- **H1**: pnpm 11 ELIMINÓ `onlyBuiltDependencies` de `package.json`. La config de
  un proyecto single va en `pnpm-workspace.yaml` (SIN campo `packages`), con el
  mapa `allowBuilds: { pkg: true|false }`.
- **H2**: `minimumReleaseAge` va en `pnpm-workspace.yaml`, en **minutos**; default
  de pnpm 11 ya es 1440 (24h).
- **H3**: `allowBuilds` por proyecto (ver sección What Changes).
- **H4**: en CI, `pnpm/action-setup` ANTES de `actions/setup-node` o el cache
  falla. `pnpm install` usa `--frozen-lockfile` automático en Actions (`CI=true`).
- **H5**: Docker NO setea `CI=true` → pasar `--frozen-lockfile` explícito.
- **H6**: `COPY node_modules` entre stages de Docker funciona (los symlinks de
  pnpm son relativos dentro de `node_modules/.pnpm`). `pnpm deploy` NO aplica
  (requiere workspaces, que no usamos).
- **H7**: el CI ya corre `npx prisma generate` como step separado → bloquear el
  `postinstall` de `@prisma/client` es seguro. (Y ver R4 sobre el orden de
  generación del lockfile con cooldown.)

---

## Success Criteria

- [ ] `pnpm install` en `backend/` y `frontend/` sale con exit 0 y deja
      `node_modules` funcional (bcrypt + Prisma generan en backend).
- [ ] CI verde en ambos jobs con pnpm: lint + unit/integration + e2e (backend),
      lint + vitest + build (frontend).
- [ ] `pnpm audit --audit-level high` pasa (o las vulns están resueltas/justificadas
      antes del merge).
- [ ] La imagen Docker del backend buildea con pnpm y `node dist/main.js`
      arranca; `ENV TZ=UTC` sigue presente.
- [ ] No quedan `package-lock.json` en el repo y están en `.gitignore`.
- [ ] `pnpm-workspace.yaml` de ambos proyectos tiene `minimumReleaseAge: 4320` +
      `minimumReleaseAgeStrict: true`.
- [ ] CLAUDE.md §11, `docs/entorno-local.md`, `README.md` y `openspec/config.yaml`
      sin comandos `npm`/`npx` residuales.

---

**Fin del proposal.**
