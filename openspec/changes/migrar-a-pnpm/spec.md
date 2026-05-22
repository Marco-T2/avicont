# Spec: migrar-a-pnpm

> Fecha: 2026-05-22
> Fase: spec
> Proyecto: avicont

---

## 1. Glosario

| Término | Definición |
|---------|-----------|
| **pnpm** | Gestor de paquetes alternativo a npm, con store de symlinks, bloqueo de lifecycle scripts por defecto y soporte nativo para cooldown de versiones. Versión fijada: `11.2.2`. |
| **lockfile** | Archivo que fija el árbol de dependencias resuelto. pnpm usa `pnpm-lock.yaml`; npm usa `package-lock.json`. El lockfile DEBE estar committeado para garantizar reproducibilidad. |
| **pnpm-workspace.yaml** | Archivo de configuración del proyecto pnpm. En este monorepo cada sub-proyecto (backend, frontend) es un proyecto single; el `pnpm-workspace.yaml` de cada uno lleva `allowBuilds` y `minimumReleaseAge`. SIN campo `packages` (no hay workspace multi-paquete). |
| **allowBuilds** | Mapa explícito en `pnpm-workspace.yaml` que declara qué paquetes pueden ejecutar lifecycle scripts (`preinstall`/`install`/`postinstall`). Todo lo no declarado con `true` NO ejecuta scripts. Un paquete bloqueado que intenta correr un script termina el install con exit 1. |
| **minimumReleaseAge** | Umbral de edad mínima (en minutos) de una versión publicada para que pnpm acepte instalarla. Valor en este proyecto: `4320` (72h). Solo aplica a resolución nueva; installs con `--frozen-lockfile` no aplican el cooldown. |
| **minimumReleaseAgeStrict** | Flag que convierte el cooldown en un error hard (exit 1) en vez de warning. Valor: `true`. |
| **frozen-lockfile** | Modo de instalación que prohíbe modificar el lockfile. pnpm lo activa automáticamente cuando `CI=true` (GitHub Actions). En Docker debe pasarse explícito porque Docker no setea `CI=true`. |
| **audit gate** | Step de CI que ejecuta `pnpm audit --audit-level high` y rompe el build si detecta vulnerabilidades de nivel `high` o `critical`. |
| **phantom dependency** | Dependencia que un paquete usa sin declararla en su `package.json`. Funciona en npm porque `node_modules` es plano; pnpm lo bloquea porque cada paquete solo ve lo que declaró. |
| **provisioning** | Mecanismo de instalación de pnpm según el entorno: `pnpm/action-setup@v4` en CI, `npm i -g pnpm@11.2.2` en Docker, campo `packageManager` en `package.json` para dev local. |

---

## 2. Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

### 2.1 Gestor de paquetes único

- **REQ-PKG-01**: El proyecto DEBE usar pnpm versión `11.2.2` como único gestor de paquetes en ambos sub-proyectos del monorepo (`backend/` y `frontend/`).

- **REQ-PKG-02**: `backend/package-lock.json` y `frontend/package-lock.json` NO DEBEN existir en el repositorio tras la migración. Ambos archivos DEBEN ser eliminados del git history y DEBEN estar listados en `.gitignore` para impedir que vuelvan a colarse.

- **REQ-PKG-03**: `backend/pnpm-lock.yaml` y `frontend/pnpm-lock.yaml` DEBEN existir y estar committeados en el repositorio. Representan el árbol de dependencias resuelto por pnpm y son la fuente de verdad para reproducir el entorno.

- **REQ-PKG-04**: Ambos `package.json` (`backend/package.json`, `frontend/package.json`) DEBEN declarar el campo `"packageManager": "pnpm@11.2.2"`. Este campo es el mecanismo de pin de versión para desarrollo local.

### 2.2 Reproducibilidad — instalación congelada en CI y Docker

- **REQ-REPRO-01**: En GitHub Actions (CI), la instalación de dependencias DEBE ejecutarse con lockfile congelado. GitHub Actions setea `CI=true` de forma automática; pnpm respeta esa variable y activa `--frozen-lockfile` sin que sea necesario pasarlo explícitamente.

- **REQ-REPRO-02**: En Docker, la instalación de dependencias DEBE ejecutarse con el flag explícito `--frozen-lockfile` (ya que Docker no setea `CI=true`). Un Dockerfile que omita este flag NO DEBE mergear.

- **REQ-REPRO-03**: Cualquier instalación que requiera modificar el lockfile (porque las dependencias declaradas en `package.json` no coinciden con el lockfile actual) DEBE fallar con exit 1 en CI y en Docker. Esta falla es deliberada: indica que el lockfile está desactualizado y debe corregirse en un commit separado.

- **REQ-REPRO-04**: El árbol de dependencias resuelto por pnpm DEBE ser funcionalmente equivalente al árbol previo de npm. Cualquier diferencia detectada durante el apply (dep nueva, versión diferente) DEBE revisarse y justificarse antes de mergear.

### 2.3 Bloqueo de build scripts (allowBuilds)

- **REQ-BUILD-01**: `backend/pnpm-workspace.yaml` DEBE declarar explícitamente la lista de paquetes autorizados a ejecutar lifecycle scripts con `allowBuilds`. Solo los siguientes paquetes PUEDEN tener `allowBuilds: true` en el backend: `bcrypt`, `prisma`, `@prisma/client`, `@prisma/engines`. Todos los demás paquetes DEBEN tener `allowBuilds: false` o no estar declarados.

- **REQ-BUILD-02**: `frontend/pnpm-workspace.yaml` DEBE declarar `allowBuilds: {}` (mapa vacío). El frontend no tiene ningún paquete que necesite compilar código nativo ni generar artefactos en install. Ningún paquete del frontend PUEDE ejecutar lifecycle scripts.

- **REQ-BUILD-03**: Si un paquete no declarado en `allowBuilds` intenta ejecutar un lifecycle script durante `pnpm install`, la instalación DEBE fallar con exit 1 (código `ERR_PNPM_IGNORED_BUILDS`). Este fallo es ruidoso e intencional: indica que un paquete nuevo requiere revisión explícita antes de autorizarse.

- **REQ-BUILD-04**: Los paquetes `@nestjs/core`, `@scarf/scarf`, `protobufjs` y `unrs-resolver` NO DEBEN tener `allowBuilds: true` en el backend. Sus lifecycle scripts son telemetría o postinstall innecesarios para el funcionamiento del proyecto.

- **REQ-BUILD-05**: El step de `prisma generate` en CI DEBE mantenerse como un step explícito separado del install. Dado que el `postinstall` de `@prisma/client` queda bloqueado por `allowBuilds`, la generación del cliente Prisma DEBE ocurrir vía `pnpm exec prisma generate` (o equivalente) como step independiente.

### 2.4 Cooldown de versiones — nivel de seguridad máximo

- **REQ-COOL-01**: `backend/pnpm-workspace.yaml` y `frontend/pnpm-workspace.yaml` DEBEN declarar `minimumReleaseAge: 4320`. Este valor representa 72 horas expresadas en minutos. pnpm rechazará instalar versiones publicadas hace menos de 72h durante la resolución del árbol de dependencias.

- **REQ-COOL-02**: Ambos archivos `pnpm-workspace.yaml` DEBEN declarar `minimumReleaseAgeStrict: true`. Este flag convierte el cooldown en un error hard (exit 1) en vez de una advertencia ignorable.

- **REQ-COOL-03**: La restricción de cooldown NO DEBE aplicarse a instalaciones con `--frozen-lockfile`. Una vez que el lockfile está generado y committeado, instalar desde él NO verifica la edad de las versiones. Solo la resolución de un lockfile nuevo o la adición de dependencias nuevas está sujeta al cooldown.

- **REQ-COOL-04**: Para generar los lockfiles iniciales durante el apply, la secuencia DEBE ser: (1) generar `pnpm-lock.yaml` con `pnpm-workspace.yaml` conteniendo SOLO `allowBuilds`; (2) una vez committeado el lockfile, agregar `minimumReleaseAge` y `minimumReleaseAgeStrict`. Esta secuencia es obligatoria porque intentar generar el lockfile con el cooldown activo falla si alguna dep fue publicada hace menos de 72h.

### 2.5 Audit gate en CI

- **REQ-AUDIT-01**: El job de CI del backend DEBE incluir un step `pnpm audit --audit-level high` que sea **bloqueante**: si detecta vulnerabilidades de nivel `high` o `critical`, el job DEBE fallar con exit distinto de cero, impidiendo el merge del PR.

- **REQ-AUDIT-02**: El step de audit DEBE ejecutarse en CI sobre el árbol de dependencias instalado, no como chequeo local opcional. No existe override automático: cualquier vuln `high`/`critical` sin fix disponible DEBE resolverse (bump de versión, `pnpm.overrides`, o justificación documentada) ANTES de mergear.

- **REQ-AUDIT-03**: Si el árbol de dependencias actual al momento del apply ya presenta una vulnerabilidad `high`/`critical` sin fix disponible, el committer DEBE ejecutar `pnpm audit` en local, decidir la estrategia de mitigación, y aplicarla en el mismo PR. No se acepta mergear un PR que deje CI roto por audit.

### 2.6 Funcionalidad preservada tras la migración

- **REQ-FUNC-01**: Tras la migración, `backend/` DEBE compilar sin errores con `pnpm exec tsc --noEmit`. El cambio de gestor de paquetes NO DEBE introducir errores de tipos ni de compilación.

- **REQ-FUNC-02**: Los tests unitarios e de integración del backend DEBEN pasar con `pnpm test` (o `pnpm exec jest src/`). El cambio de gestor de paquetes NO DEBE romper ningún test existente.

- **REQ-FUNC-03**: Los tests E2E del backend DEBEN pasar con `DATABASE_URL=... pnpm exec jest test/ --runInBand --forceExit`. Se mantienen las mismas variables de entorno requeridas.

- **REQ-FUNC-04**: La imagen Docker del backend DEBE construirse exitosamente con pnpm. Una vez construida, `node dist/main.js` DEBE arrancar sin errores. El flow de arranque incluye `prisma migrate deploy` seguido de `node dist/main.js` en el container runner.

- **REQ-FUNC-05**: La variable de entorno `ENV TZ=UTC` del stage `runner` en `backend/Dockerfile` DEBE preservarse intacta tras la migración. Esta variable es requerida por el invariante §4.6 (FechaContable) del CLAUDE.md y NO DEBE eliminarse ni modificarse.

- **REQ-FUNC-06**: El frontend DEBE pasar lint (`pnpm run lint`), tests Vitest (`pnpm test`) y build de producción (`pnpm run build`) tras la migración. El cambio de gestor de paquetes NO DEBE romper el pipeline de frontend.

### 2.7 Consistencia documental

- **REQ-DOC-01**: `CLAUDE.md §11` (Entorno local y comandos operativos, ~22 referencias a `npm`/`npx`) DEBE actualizarse reemplazando todos los comandos `npm`/`npx` por sus equivalentes en pnpm. No DEBEN quedar referencias residuales a `npm` o `npx` en esa sección.

- **REQ-DOC-02**: `docs/entorno-local.md` DEBE actualizarse con los comandos pnpm equivalentes. Todas las instrucciones de instalación y ejecución que mencionen `npm` o `npx` DEBEN reemplazarse.

- **REQ-DOC-03**: `README.md` (~5 referencias a npm) DEBE actualizarse con los comandos pnpm equivalentes.

- **REQ-DOC-04**: `openspec/config.yaml` DEBE actualizarse: los campos `testing.test_runner.command`, `testing.test_runner.integration_command`, `testing.test_runner.e2e_command`, `testing.coverage.command`, `testing.quality.linter.command`, `testing.quality.type_checker.command` y `testing.quality.formatter.command` DEBEN referenciar comandos pnpm, no npm ni npx.

- **REQ-DOC-05**: Tras la migración, NO DEBEN existir referencias a `npm install`, `npm ci`, `npm run`, `npm test` ni `npx` en ninguno de los documentos operativos listados en REQ-DOC-01 a REQ-DOC-04. La búsqueda textual de `npm ` (npm seguido de espacio) en esos archivos DEBE devolver cero resultados.

### 2.8 Provisioning de pnpm por entorno

- **REQ-PROV-01**: En GitHub Actions, pnpm DEBE instalarse usando el action oficial `pnpm/action-setup@v4` con `version: 11`. Este step DEBE ubicarse ANTES del step `actions/setup-node` en ambos jobs del CI (`build-and-test` backend y `frontend`). Invertir el orden hace que el cache de pnpm falle porque pnpm no existe aún cuando `setup-node` intenta configurarlo.

- **REQ-PROV-02**: En GitHub Actions, `actions/setup-node` DEBE configurarse con `cache: 'pnpm'` y `cache-dependency-path` apuntando al `pnpm-lock.yaml` del sub-proyecto correspondiente (`backend/pnpm-lock.yaml` para el job de backend, `frontend/pnpm-lock.yaml` para el job de frontend).

- **REQ-PROV-03**: En Docker, pnpm DEBE instalarse con `npm i -g pnpm@11.2.2` en cada stage que lo requiera (`builder` y opcionalmente `runner`). NO DEBE usarse corepack como mecanismo de provisioning en Docker, dado que corepack será eliminado en Node 25.

- **REQ-PROV-04**: Ambos `package.json` (`backend/package.json` y `frontend/package.json`) DEBEN declarar `"packageManager": "pnpm@11.2.2"`. Este campo fija la versión para el entorno de desarrollo local y es respetado por pnpm al ejecutar comandos.

---

## 3. Escenarios (Given/When/Then)

### 3.1 Gestión de paquetes y lockfiles

**E-PKG-01: pnpm install en backend produce node_modules funcional**
- **Given** el repositorio clonado con `backend/pnpm-lock.yaml` presente
- **When** se ejecuta `pnpm install --frozen-lockfile` en `backend/`
- **Then** el comando termina con exit 0
- **And** `node_modules/` contiene las dependencias resueltas (incluye `bcrypt`, `@prisma/client`, `@prisma/engines`)
- **And** `pnpm exec prisma generate` termina con exit 0 y genera el cliente Prisma

**E-PKG-02: pnpm install en frontend produce node_modules funcional**
- **Given** el repositorio clonado con `frontend/pnpm-lock.yaml` presente
- **When** se ejecuta `pnpm install --frozen-lockfile` en `frontend/`
- **Then** el comando termina con exit 0
- **And** `node_modules/` contiene todas las dependencias del frontend (incluye React, Vite, TanStack Query)

**E-PKG-03: package-lock.json no existe en el repositorio**
- **Given** el estado del repositorio tras la migración mergeada
- **When** se ejecuta `git ls-files backend/package-lock.json frontend/package-lock.json`
- **Then** el comando no produce ninguna salida (los archivos no están trackeados)

**E-PKG-04: package-lock.json está bloqueado por .gitignore**
- **Given** un desarrollador que ejecuta `npm install` accidentalmente en `backend/` o `frontend/`
- **When** npm genera un `package-lock.json`
- **Then** `git status` muestra el archivo como untracked pero NO como modificación a stagear (está en `.gitignore`)
- **And** el archivo no puede colarse en un commit por `git add .` sin ser explícitamente ignorado

**E-PKG-05: lockfile desactualizado hace fallar el install en CI**
- **Given** un `pnpm-lock.yaml` que no coincide con las dependencias en `package.json` (ej. se agregó una dep sin regenerar el lockfile)
- **When** CI ejecuta `pnpm install` (que activa `--frozen-lockfile` via `CI=true`)
- **Then** el comando termina con exit 1 y un mensaje que indica que el lockfile está desactualizado
- **And** el job de CI falla antes de llegar a los tests

### 3.2 Reproducibilidad — frozen lockfile

**E-REPRO-01: Docker usa --frozen-lockfile explícito**
- **Given** el `backend/Dockerfile` tras la migración
- **When** se inspecciona el comando de instalación de dependencias en el stage `builder`
- **Then** el comando es `pnpm install --frozen-lockfile` (el flag está explícito)
- **And** no existe ningún `pnpm install` sin `--frozen-lockfile` en el Dockerfile

**E-REPRO-02: CI activa frozen-lockfile automáticamente via CI=true**
- **Given** el job de CI en `.github/workflows/ci.yml` tras la migración
- **When** Actions ejecuta `pnpm install` (sin el flag explícito)
- **Then** pnpm detecta `CI=true` en el entorno de GitHub Actions y activa `--frozen-lockfile` automáticamente
- **And** el install termina con exit 0 si el lockfile coincide con `package.json`

**E-REPRO-03: Instalación en Docker falla si se omite --frozen-lockfile y el lockfile difiere**
- **Given** un Dockerfile hipotético que usa `pnpm install` sin `--frozen-lockfile`
- **And** un `package.json` con una dep que no está en el lockfile
- **When** se construye la imagen Docker
- **Then** Docker resuelve las dependencias desde internet y modifica el lockfile en memoria (comportamiento incorrecto)
- _Nota: este escenario documenta el riesgo que REQ-REPRO-02 previene. El Dockerfile final DEBE incluir `--frozen-lockfile` explícito para evitarlo._

### 3.3 Bloqueo de build scripts

**E-BUILD-01: bcrypt compila correctamente tras la migración (build script autorizado)**
- **Given** `backend/pnpm-workspace.yaml` con `allowBuilds: { bcrypt: true }`
- **When** se ejecuta `pnpm install --frozen-lockfile` en `backend/`
- **Then** el lifecycle script de `bcrypt` (compilación de addon nativo) se ejecuta con exit 0
- **And** `require('bcrypt')` funciona correctamente en runtime (no falla por falta de binario nativo)

**E-BUILD-02: @prisma/engines genera correctamente (build script autorizado)**
- **Given** `backend/pnpm-workspace.yaml` con `allowBuilds: { "@prisma/engines": true, "@prisma/client": true, prisma: true }`
- **When** se ejecuta `pnpm install --frozen-lockfile` seguido de `pnpm exec prisma generate`
- **Then** el cliente Prisma se genera correctamente en `node_modules/.prisma/client`
- **And** el backend puede importar `PrismaClient` sin errores en runtime

**E-BUILD-03: @scarf/scarf no ejecuta su script de telemetría (build script bloqueado)**
- **Given** `backend/pnpm-workspace.yaml` con `@scarf/scarf` sin `allowBuilds: true` (o con `allowBuilds: false`)
- **When** se ejecuta `pnpm install --frozen-lockfile` en `backend/`
- **Then** el postinstall de `@scarf/scarf` NO se ejecuta
- **And** el install termina con exit 0 (pnpm silencia el script bloqueado sin hacer fallar la instalación cuando el paquete está en el lockfile)

**E-BUILD-04: un build script no autorizado nuevo hace fallar el install**
- **Given** se agrega una dependencia nueva al `backend/package.json` que tiene un lifecycle script
- **And** ese paquete NO está declarado en `allowBuilds` del `pnpm-workspace.yaml`
- **When** se intenta regenerar el lockfile con `pnpm install` (sin frozen-lockfile, en desarrollo local)
- **Then** pnpm termina con exit 1 y el código de error `ERR_PNPM_IGNORED_BUILDS`
- **And** el mensaje indica qué paquete tiene el script no autorizado, permitiendo al dev decidir si agregarlo a `allowBuilds` o bloquearlo explícitamente

**E-BUILD-05: frontend no autoriza ningún build script**
- **Given** `frontend/pnpm-workspace.yaml` con `allowBuilds: {}` (mapa vacío)
- **When** se ejecuta `pnpm install --frozen-lockfile` en `frontend/`
- **Then** ningún lifecycle script de ninguna dependencia del frontend se ejecuta
- **And** el install termina con exit 0

### 3.4 Cooldown de versiones

**E-COOL-01: instalación desde lockfile congelado no aplica el cooldown**
- **Given** `backend/pnpm-workspace.yaml` con `minimumReleaseAge: 4320` y `minimumReleaseAgeStrict: true`
- **And** `backend/pnpm-lock.yaml` committeado con versiones existentes (incluso si alguna fue publicada hace menos de 72h cuando se generó el lockfile)
- **When** se ejecuta `pnpm install --frozen-lockfile`
- **Then** el install termina con exit 0 sin verificar la edad de las versiones del lockfile
- **And** el cooldown no se aplica a instalaciones reproducibles desde lockfile

**E-COOL-02: agregar una dep publicada hace menos de 72h es rechazado**
- **Given** `backend/pnpm-workspace.yaml` con `minimumReleaseAge: 4320` y `minimumReleaseAgeStrict: true`
- **And** un desarrollador que intenta agregar `some-package@1.2.3`, publicada hace 1 hora
- **When** se ejecuta `pnpm add some-package@1.2.3` en `backend/` (sin frozen-lockfile)
- **Then** pnpm rechaza la instalación con exit 1
- **And** el mensaje de error indica que la versión `1.2.3` fue publicada hace menos de 72h y no puede instalarse
- **And** el lockfile no se modifica

**E-COOL-03: agregar una dep publicada hace más de 72h es aceptada**
- **Given** `backend/pnpm-workspace.yaml` con `minimumReleaseAge: 4320` y `minimumReleaseAgeStrict: true`
- **And** un desarrollador que intenta agregar `some-package@1.0.0`, publicada hace 5 días
- **When** se ejecuta `pnpm add some-package@1.0.0` en `backend/`
- **Then** pnpm acepta la versión y la agrega al lockfile
- **And** el install termina con exit 0

**E-COOL-04: generación inicial del lockfile se realiza sin cooldown activo**
- **Given** el proceso de apply de esta migración
- **When** se genera `pnpm-lock.yaml` por primera vez
- **Then** el `pnpm-workspace.yaml` contiene SOLO `allowBuilds` (sin `minimumReleaseAge` ni `minimumReleaseAgeStrict`)
- **And** la generación del lockfile termina con exit 0 independientemente de cuándo se publicaron las versiones
- **And** SOLO DESPUÉS de commitear el lockfile se agrega `minimumReleaseAge: 4320` y `minimumReleaseAgeStrict: true` al `pnpm-workspace.yaml`

### 3.5 Audit gate en CI

**E-AUDIT-01: CI pasa el audit gate cuando no hay vulns high/critical**
- **Given** el árbol de dependencias del backend sin vulnerabilidades de nivel `high` o `critical`
- **When** el job de CI ejecuta `pnpm audit --audit-level high`
- **Then** el comando termina con exit 0
- **And** el job de CI continúa hacia los steps siguientes (typecheck, test, build)

**E-AUDIT-02: CI falla el audit gate ante una vulnerabilidad critical**
- **Given** el árbol de dependencias del backend con una vulnerabilidad `critical` en alguna dep transitiva
- **When** el job de CI ejecuta `pnpm audit --audit-level high`
- **Then** el comando termina con exit distinto de cero
- **And** el job de CI falla y el PR no puede mergearse hasta que la vulnerabilidad sea resuelta

**E-AUDIT-03: vulnerabilidades de nivel moderate o low no bloquean CI**
- **Given** el árbol de dependencias del backend con vulnerabilidades de nivel `moderate` o `low` (pero ninguna `high`/`critical`)
- **When** el job de CI ejecuta `pnpm audit --audit-level high`
- **Then** el comando termina con exit 0 (las vulns de menor severidad se ignoran por el threshold configurado)
- **And** el job de CI continúa sin bloquear el merge

**E-AUDIT-04: el step de audit es bloqueante (no puede ignorarse con continue-on-error)**
- **Given** el archivo `.github/workflows/ci.yml` tras la migración
- **When** se inspecciona el step de `pnpm audit --audit-level high`
- **Then** el step NO tiene `continue-on-error: true`
- **And** un exit 1 en ese step hace fallar el job completo

### 3.6 Funcionalidad preservada — backend

**E-FUNC-01: backend compila sin errores tras la migración**
- **Given** `backend/` con pnpm instalado y dependencias resueltas
- **When** se ejecuta `pnpm exec tsc --noEmit -p tsconfig.json`
- **Then** el comando termina con exit 0 y cero errores de tipos

**E-FUNC-02: tests unitarios del backend pasan con pnpm**
- **Given** `backend/` con pnpm instalado
- **When** se ejecuta `pnpm test` (equivalente a `pnpm exec jest src/` para tests unitarios)
- **Then** todos los tests unitarios pasan con exit 0
- **And** el reporte de cobertura es equivalente al obtenido con npm

**E-FUNC-03: tests E2E del backend pasan con pnpm**
- **Given** Postgres corriendo localmente, `backend/` con pnpm instalado y el cliente Prisma generado
- **When** se ejecuta `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/saas JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh pnpm exec jest test/ --runInBand --forceExit`
- **Then** todos los tests E2E pasan con exit 0

**E-FUNC-04: imagen Docker del backend construye exitosamente con pnpm**
- **Given** `backend/Dockerfile` actualizado para usar pnpm
- **When** se ejecuta `docker build -t avicont-backend ./backend`
- **Then** la imagen se construye sin errores
- **And** el stage `builder` instala dependencias con `pnpm install --frozen-lockfile`
- **And** el stage `runner` arranca con `node dist/main.js` sin errores de módulos faltantes

**E-FUNC-05: ENV TZ=UTC está presente en la imagen Docker tras la migración**
- **Given** `backend/Dockerfile` actualizado para usar pnpm
- **When** se inspecciona la imagen construida con `docker inspect avicont-backend`
- **Then** la variable de entorno `TZ=UTC` está presente en la configuración del container
- **And** el comportamiento de `FechaContable` en runtime es idéntico al pre-migración

**E-FUNC-06: prisma migrate deploy corre correctamente en el container**
- **Given** la imagen Docker construida con pnpm y una instancia de Postgres accesible
- **When** el container ejecuta `prisma migrate deploy` al arrancar
- **Then** el comando termina con exit 0 y aplica las migraciones pendientes
- **And** la base de datos queda en el schema esperado

### 3.7 Funcionalidad preservada — frontend

**E-FUNC-07: lint del frontend pasa con pnpm**
- **Given** `frontend/` con pnpm instalado
- **When** se ejecuta `pnpm run lint`
- **Then** el comando termina con exit 0 y sin errores de ESLint

**E-FUNC-08: tests Vitest del frontend pasan con pnpm**
- **Given** `frontend/` con pnpm instalado
- **When** se ejecuta `pnpm test` (Vitest)
- **Then** todos los tests pasan con exit 0
- **And** el reporte de tests es equivalente al obtenido con npm

**E-FUNC-09: build de producción del frontend pasa con pnpm**
- **Given** `frontend/` con pnpm instalado
- **When** se ejecuta `pnpm run build`
- **Then** el comando termina con exit 0
- **And** el directorio `dist/` contiene los artefactos de producción esperados

### 3.8 Consistencia documental

**E-DOC-01: CLAUDE.md §11 no contiene referencias a npm/npx tras la migración**
- **Given** `CLAUDE.md` actualizado
- **When** se ejecuta `grep -n "npm \|npx " CLAUDE.md` acotado a la sección §11
- **Then** el comando no produce ninguna salida (cero matches)

**E-DOC-02: CLAUDE.md §11 muestra comandos pnpm equivalentes**
- **Given** `CLAUDE.md §11` tras la migración
- **When** un desarrollador sigue las instrucciones de la subsección 11.2 (Prisma)
- **Then** los comandos mostrados son de la forma `DATABASE_URL=... pnpm exec prisma migrate dev --name <nombre>` (no `npx prisma ...`)

**E-DOC-03: openspec/config.yaml referencia comandos pnpm**
- **Given** `openspec/config.yaml` actualizado
- **When** se inspeccionan los campos `testing.test_runner.command`, `testing.test_runner.integration_command`, `testing.test_runner.e2e_command`, `testing.coverage.command`, `testing.quality.*`
- **Then** ninguno contiene `npm` ni `npx`
- **And** los comandos usan `pnpm` (ej. `pnpm test`, `pnpm exec jest`, `pnpm run lint`, `pnpm run format`)

**E-DOC-04: README.md no contiene referencias a npm**
- **Given** `README.md` actualizado
- **When** se ejecuta `grep -n "npm " README.md`
- **Then** el comando no produce ninguna salida relevante a comandos de instalación o ejecución (cero matches de `npm install`, `npm run`, `npm test`)

### 3.9 Provisioning por entorno

**E-PROV-01: CI instala pnpm con pnpm/action-setup@v4 antes de setup-node**
- **Given** `.github/workflows/ci.yml` tras la migración
- **When** se inspeccionan los steps del job `build-and-test` (backend)
- **Then** el step `pnpm/action-setup@v4` aparece ANTES del step `actions/setup-node`
- **And** `actions/setup-node` tiene `cache: 'pnpm'` y `cache-dependency-path: backend/pnpm-lock.yaml`

**E-PROV-02: CI del frontend también sigue el orden correcto de steps**
- **Given** `.github/workflows/ci.yml` tras la migración
- **When** se inspeccionan los steps del job `frontend`
- **Then** el step `pnpm/action-setup@v4` aparece ANTES del step `actions/setup-node`
- **And** `actions/setup-node` tiene `cache: 'pnpm'` y `cache-dependency-path: frontend/pnpm-lock.yaml`

**E-PROV-03: CI con setup-node ANTES de action-setup hace fallar el cache (caso negativo)**
- **Given** un workflow hipotético donde `actions/setup-node` precede a `pnpm/action-setup@v4`
- **When** `actions/setup-node` intenta configurar el cache de pnpm
- **Then** el step falla porque pnpm no está instalado aún y `pnpm store path` no puede ejecutarse
- _Nota: este escenario documenta el riesgo que REQ-PROV-01 previene. El orden correcto es obligatorio._

**E-PROV-04: Docker instala pnpm con npm i -g sin corepack**
- **Given** `backend/Dockerfile` tras la migración
- **When** se inspeccionan los stages `builder` y `runner`
- **Then** pnpm se instala con `npm i -g pnpm@11.2.2` (versión pinned)
- **And** NO existe ninguna referencia a `corepack enable`, `corepack prepare` ni `corepack use` en el Dockerfile

**E-PROV-05: package.json declara packageManager en ambos sub-proyectos**
- **Given** `backend/package.json` y `frontend/package.json` tras la migración
- **When** se inspeccionan los campos de cada archivo
- **Then** ambos contienen `"packageManager": "pnpm@11.2.2"`
- **And** un desarrollador que ejecuta cualquier comando pnpm en esas carpetas usa la versión `11.2.2` sin configuración adicional

---

## 4. Códigos de error

Este change NO introduce entidades de dominio ni endpoints nuevos. No aplica la jerarquía `DomainError` del proyecto. Los "errores" relevantes son comportamientos observables del tooling:

| Condición | Exit code | Indicador observable |
|-----------|-----------|----------------------|
| Install con lockfile desactualizado en CI/Docker | 1 | pnpm imprime que el lockfile necesita actualización; job CI falla |
| Build script no autorizado durante resolución nueva | 1 | `ERR_PNPM_IGNORED_BUILDS`; mensaje indica el paquete bloqueado |
| Dep publicada hace <72h con cooldown activo | 1 | pnpm indica que la versión no cumple `minimumReleaseAge`; install rechazado |
| Audit con vuln high/critical | 1 | `pnpm audit` lista las vulns; job CI falla en el step de audit |
| Setup-node antes de pnpm/action-setup (orden incorrecto) | 1 | GitHub Actions falla en el step de cache de pnpm; log indica que pnpm no está disponible |

---

## 5. Archivos afectados

Este change NO toca ningún módulo de dominio (`backend/src/**`). Afecta exclusivamente capa de tooling/infra:

| Archivo | Tipo de cambio |
|---------|---------------|
| `backend/pnpm-lock.yaml` | Nuevo — lockfile de pnpm para el backend |
| `frontend/pnpm-lock.yaml` | Nuevo — lockfile de pnpm para el frontend |
| `backend/pnpm-workspace.yaml` | Nuevo — config de proyecto single con `allowBuilds` y cooldown |
| `frontend/pnpm-workspace.yaml` | Nuevo — config de proyecto single con `allowBuilds: {}` y cooldown |
| `backend/package.json` | Modificado — agrega campo `packageManager` |
| `frontend/package.json` | Modificado — agrega campo `packageManager` |
| `backend/package-lock.json` | Eliminado — reemplazado por `pnpm-lock.yaml` |
| `frontend/package-lock.json` | Eliminado — reemplazado por `pnpm-lock.yaml` |
| `.gitignore` (raíz) | Modificado — agrega `package-lock.json` |
| `.github/workflows/ci.yml` | Modificado — dos jobs migrados a pnpm + step de audit bloqueante |
| `backend/Dockerfile` | Modificado — instala pnpm global + frozen-lockfile explícito + COPY de config pnpm |
| `CLAUDE.md` | Modificado — §11 actualizado con comandos pnpm |
| `docs/entorno-local.md` | Modificado — comandos pnpm |
| `README.md` | Modificado — comandos pnpm |
| `openspec/config.yaml` | Modificado — comandos pnpm en secciones testing y quality |

---

## 6. Coverage objetivo

Este change NO introduce lógica de dominio testeable con Jest/Vitest. Las verificaciones son de comportamiento de tooling y se validan en el proceso de apply y verify:

| Verificación | Tipo | Cuándo |
|-------------|------|--------|
| `pnpm install --frozen-lockfile` en backend y frontend termina con exit 0 | Manual / CI | Apply + Verify |
| `pnpm exec prisma generate` termina con exit 0 | Manual / CI | Apply + Verify |
| CI verde en ambos jobs (lint + tests + build) con pnpm | CI | PR de apply |
| `pnpm audit --audit-level high` pasa (exit 0) | CI / Manual | Apply (pre-merge) |
| `docker build` con pnpm termina sin errores | Manual / CI | Verify |
| `node dist/main.js` arranca en container con `ENV TZ=UTC` | Manual | Verify |
| Cero `npm`/`npx` residuales en docs operativos | `grep` | Verify |
| `pnpm-lock.yaml` committeado; `package-lock.json` en `.gitignore` | `git ls-files` | Verify |
| `minimumReleaseAge: 4320` + `minimumReleaseAgeStrict: true` presentes | Inspección | Verify |
| Orden correcto de steps en CI (`pnpm/action-setup` antes de `setup-node`) | Inspección | Verify |

---

**Fin del spec.**
