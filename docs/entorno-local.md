<!--
Última edición: 2026-05-19
Owner: backend-lead
Complementa CLAUDE.md §11 (comandos operativos). No lo reemplaza:
acá vive la ARQUITECTURA del stack local (cómo está montado) + los GOTCHAS
de WSL2. Los comandos detallados de Prisma/tests/lint siguen en CLAUDE.md §11.
-->

# Entorno local — cómo se levanta y cómo está montado

Este documento responde tres cosas:

1. **Cómo está montado el stack** — servicios, puertos, volúmenes, red, dependencias.
2. **Cuál es la forma correcta de levantar el proyecto completo** — recetas según el flujo de trabajo.
3. **Gotchas de WSL2** — por qué Grafana a veces aparece sin dashboards y cómo se arregla.

> Para los comandos operativos detallados (migraciones Prisma, tests, lint, seeds)
> la fuente de verdad es **`CLAUDE.md §11`**. Acá no se duplican: se referencian.

---

## 1. Arquitectura del stack local

El sistema corre como **8 contenedores Docker** + el **frontend en local** (Vite).
El frontend NO está dockerizado: se corre con `pnpm run dev` y proxea `/api` al backend.

### 1.1 Servicios y puertos

Todos los contenedores viven en la red bridge `saas_network` y se hablan entre sí
**por nombre de servicio** (`postgres`, `redis`, `loki`, `tempo`, `app`…), no por
`localhost`. Los puertos de abajo son los expuestos **al host** (tu máquina).

| Servicio     | Contenedor       | Puerto host → contenedor | Rol |
|--------------|------------------|--------------------------|-----|
| `app`        | `saas_app`       | `3000 → 3000`            | Backend NestJS. API en `/api/*`, Swagger en `/docs` |
| `postgres`   | `saas_postgres`  | `5432 → 5432`            | BD principal (`saas`, `postgres/postgres`). Tuneada vía flags `-c` |
| `redis`      | `saas_redis`     | `6379 → 6379`            | Cache + blocklist de JWT revocados. `maxmemory 256mb`, LRU, AOF |
| `dbgate`     | `saas_dbgate`    | `3100 → 3000`            | UI web para Postgres y Redis (conexiones precargadas) |
| `grafana`    | `saas_grafana`   | `3001 → 3000`            | Dashboards (login `admin/admin`, anónimo habilitado como Admin) |
| `loki`       | `saas_loki`      | `3101 → 3100`            | Agregador de logs |
| `prometheus` | `saas_prometheus`| `9090 → 9090`            | Scrape de métricas |
| `tempo`      | `saas_tempo`     | `3200`, `4317`, `4318`   | Traces. `4317` OTLP gRPC, `4318` OTLP HTTP |
| **frontend** | *(no dockerizado)* | `5173` (local)         | Vite + React. Proxy `/api` → `localhost:3000` |

> **Swagger está en `/docs`, no en `/api/docs`.** El backend aplica prefijo global
> `/api` a la API (health, metrics, recursos), pero el Swagger UI se monta en la raíz.
> URLs útiles: API health `http://localhost:3000/api/health`,
> métricas `http://localhost:3000/api/metrics`, Swagger `http://localhost:3000/docs`.

### 1.2 Quién depende de quién

`docker compose up` respeta este orden automáticamente:

```
postgres (healthy) ─┐
redis    (healthy) ─┼─→ dbgate
                    └─→ app ─→ (también espera loki, tempo "started")
loki     ─┐
prometheus┼─→ grafana
tempo    ─┘
```

- `app` arranca **solo cuando** `postgres` y `redis` pasan su healthcheck (y `loki`/`tempo` están iniciados).
- `grafana` espera a `loki`, `prometheus` y `tempo`.
- `postgres` y `redis` tienen healthcheck real (`pg_isready`, `redis-cli ping`); el resto solo "started".

### 1.3 Conexiones entre servicios (dentro de `saas_network`)

| Origen       | Destino            | Para qué |
|--------------|--------------------|----------|
| `app`        | `postgres:5432`    | BD (`DATABASE_URL`) |
| `app`        | `redis:6379`       | Cache / blocklist JWT |
| `app`        | `loki:3100`        | Envío de logs (`LOG_PROVIDER=loki`) |
| `app`        | `tempo:4318`       | Export de traces OTLP HTTP |
| `prometheus` | `app:3000/api/metrics` | Scrape cada 10s (job `saas-api`) |
| `prometheus` | `tempo:3200`       | Scrape de métricas de Tempo |
| `grafana`    | `loki`, `prometheus`, `tempo` | Datasources |
| `dbgate`     | `postgres`, `redis`| Exploración de datos |

### 1.4 Almacenamiento: named volumes vs bind mounts

**Esta distinción es la clave del gotcha de la sección 3.** Hay dos tipos de montaje:

**Named volumes** — los gestiona Docker en su propio almacenamiento
(`/var/lib/docker/volumes/`). Sobreviven reinicios y NO sufren el bug de WSL2.
Guardan **datos**:

| Volume            | Montado en (contenedor)        |
|-------------------|--------------------------------|
| `postgres_data`   | `/var/lib/postgresql/data`     |
| `redis_data`      | `/data`                        |
| `dbgate_data`     | `/root/.dbgate`                |
| `loki_data`       | `/loki`                        |
| `prometheus_data` | `/prometheus`                  |
| `tempo_data`      | `/tmp/tempo`                   |
| `grafana_data`    | `/var/lib/grafana`             |

**Bind mounts** — mapean una carpeta de **tu host** dentro del contenedor.
Guardan **configuración**. En Docker Desktop + WSL2 son **frágiles** (sección 3):

| Carpeta del host (`./…`)                   | Montado en (contenedor)              |
|--------------------------------------------|--------------------------------------|
| `./observability/grafana/provisioning`     | `/etc/grafana/provisioning`          |
| `./observability/loki-config.yaml`         | `/etc/loki/local-config.yaml`        |
| `./observability/prometheus.yaml`          | `/etc/prometheus/prometheus.yml`     |
| `./observability/tempo-config.yaml`        | `/etc/tempo/tempo.yaml`              |
| `./backend/src`                            | `/app/src` — ⚠️ **inerte**, ver §2.2 |

---

## 2. Cómo levantar el proyecto completo

### 2.1 Receta recomendada: todo en Docker + frontend local

Es el flujo por defecto. El backend y toda la infra corren en Docker; solo el
frontend se corre local para tener hot-reload de UI.

```bash
# 1. Desde la raíz del repo: levantar los 8 servicios
docker compose up -d

# 2. Verificar estado y puertos
docker compose ps --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}"

# 3. En otra terminal: frontend local
cd frontend
pnpm install           # solo la primera vez
pnpm run dev           # http://localhost:5173
```

Listo:
- Frontend → http://localhost:5173
- Backend / Swagger → http://localhost:3000/docs
- Grafana → http://localhost:3001 (`admin/admin`)
- dbgate → http://localhost:3100

**Primera vez (BD vacía):** el contenedor `app` corre `prisma migrate deploy`
automáticamente al arrancar (está en su `Dockerfile`), así que las migraciones
se aplican solas. Lo que **NO** corre solo es el **seed del catálogo PUCT** —
hay que sembrarlo a mano una vez:

```bash
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
  pnpm exec ts-node prisma/seeds/prod/puct/catalogo-puct.seed.ts
```

### 2.2 Variante mínima: infra en Docker + backend local con hot-reload

Si vas a **desarrollar el backend** activamente, conviene correrlo local
(`nest start --watch` recarga en caliente). En ese caso NO levantes el contenedor
`app` (chocaría con el puerto 3000):

```bash
# 1. Solo infra (sin el backend, sin observabilidad si no la necesitás)
docker compose up -d postgres redis
#    …o con observabilidad pero sin el backend:
#    docker compose up -d postgres redis loki prometheus tempo grafana

# 2. Backend local en watch mode
cd backend
pnpm install
cp .env.example .env          # ajustar si hace falta
pnpm run prisma:migrate
pnpm run start:dev            # http://localhost:3000, recarga al guardar

# 3. Frontend local (otra terminal)
cd frontend && pnpm run dev
```

### 2.3 Bajar el stack

```bash
docker compose down            # detiene todo, MANTIENE los datos (volúmenes)
docker compose down -v         # ⚠️ DESTRUCTIVO: borra también los volúmenes (BD, etc.)
```

---

## 3. Gotcha de WSL2: bind-mounts vacíos (Grafana sin dashboards)

### 3.1 Síntoma

Grafana arranca bien pero **no muestra ningún dashboard ni datasource**, aunque
los archivos existen en `observability/grafana/provisioning/`. En los logs:

```
level=error msg="can't read dashboard provisioning files from directory"
  path=/etc/grafana/provisioning/dashboards
  error="open /etc/grafana/provisioning/dashboards: no such file or directory"
```

### 3.2 Causa raíz

Docker Desktop sobre WSL2 **no monta tu carpeta del host directamente**: crea un
*snapshot* intermedio en `/run/desktop/mnt/host/wsl/docker-desktop-bind-mounts/…`.
Si Docker Desktop reinicia (o el contenedor se creó cuando la carpeta estaba en
otro estado), ese snapshot queda **vacío o desincronizado**, y el contenedor ve
un `/etc/grafana/provisioning` sin contenido. Grafana no encuentra nada y
provisiona cero.

Afecta **solo a bind mounts** (sección 1.4). Los named volumes (incluido
`grafana_data`) NO se afectan, porque viven en el almacenamiento gestionado por
Docker, no en una carpeta del host.

`docker compose up -d` por sí solo **no lo arregla**: ve el contenedor como
"Running" y no lo recrea, así que sigue apuntando al snapshot viejo.

### 3.3 Diagnóstico

```bash
# ¿Qué bind-mount ve Docker? (un path docker-desktop-bind-mounts/… es la señal)
docker inspect saas_grafana --format \
  '{{range .Mounts}}{{.Type}}  {{.Source}} -> {{.Destination}}{{println}}{{end}}'

# ¿Está vacío adentro del contenedor?
docker exec saas_grafana ls -R /etc/grafana/provisioning/
```

Si la última lista sale vacía (solo `.` y `..`), es este bug.

### 3.4 Fix

Recrear el contenedor fuerza a Docker a reconstruir el bind-mount contra la
carpeta actual del host:

```bash
docker compose up -d --force-recreate grafana
```

Verificar que quedó OK:

```bash
docker exec saas_grafana ls -R /etc/grafana/provisioning/   # debe listar dashboards/ y datasources/
curl -s "http://localhost:3001/api/search?type=dash-db"     # debe listar los dashboards
curl -s "http://localhost:3001/api/datasources"             # debe listar Loki/Prometheus/Tempo
```

Como `grafana_data` (named volume) persiste, no perdés nada al recrear: solo se
re-lee el provisioning.

### 3.5 Aplica a cualquier servicio con bind-mount de config

Si Loki, Prometheus o Tempo arrancan ignorando su `*-config.yaml`, es el mismo
problema. Mismo fix, cambiando el nombre del servicio:

```bash
docker compose up -d --force-recreate loki        # o prometheus / tempo
```

Si tras reiniciar Docker Desktop / la PC falla más de un servicio de
observabilidad, recrealos todos de una:

```bash
docker compose up -d --force-recreate grafana loki prometheus tempo
```

---

## 4. Hot-reload: qué recarga y qué no

| Componente            | ¿Hot-reload? | Para tomar cambios |
|-----------------------|--------------|--------------------|
| **Frontend** (Vite)   | ✅ Sí         | Automático al guardar |
| **Backend local** (`pnpm run start:dev`) | ✅ Sí | Automático (`nest --watch`) |
| **Backend en Docker** (`app`) | ❌ **No** | `docker compose up -d --build app` |

⚠️ **El contenedor `app` NO tiene hot-reload**, aunque el `docker-compose.yml`
monte `./backend/src:/app/src` con un comentario que sugiere lo contrario. El
motivo: el `Dockerfile` (etapa `runner`) corre **`node dist/main.js`**, es decir,
el JS **compilado** que quedó horneado en la imagen en build-time. El proceso
nunca lee de `src/`, así que ese bind-mount es **inerte**.

Por eso, para tomar cambios de código del backend en Docker hay que **rebuildear
la imagen**, no basta `restart`:

```bash
docker compose up -d --build app     # ✅ recompila dist/ y recrea el contenedor
docker compose restart app           # ❌ NO toma cambios: reusa el dist/ viejo de la imagen
```

Si vas a iterar mucho sobre el backend, usá la variante local (§2.2) en vez de Docker.

---

## 5. Referencia rápida de comandos

| Necesito… | Comando |
|-----------|---------|
| Levantar todo | `docker compose up -d` |
| Solo infra (dev backend local) | `docker compose up -d postgres redis` |
| Ver estado | `docker compose ps` |
| Logs de un servicio | `docker compose logs -f <servicio>` |
| Rebuild del backend en Docker | `docker compose up -d --build app` |
| Arreglar Grafana sin dashboards | `docker compose up -d --force-recreate grafana` |
| Bajar (conserva datos) | `docker compose down` |
| Bajar y borrar datos | `docker compose down -v` ⚠️ |
| Frontend | `cd frontend && pnpm run dev` |

Para **Prisma (migraciones/seeds), tests (unit/integration/E2E), lint y typecheck**
→ ver **`CLAUDE.md §11`**, que es la fuente de verdad de esos comandos.
