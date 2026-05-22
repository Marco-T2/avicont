# avicont

SaaS contable multi-tenant para asociaciones de avicultores en Bolivia.

Este repositorio es un **monorepo**: contiene todas las piezas del sistema en un solo lugar. La fuente de verdad sobre cómo se construye el proyecto es [`CLAUDE.md`](./CLAUDE.md) — léelo antes de aportar cambios.

## Estructura

```
avicont/
├── backend/          # API NestJS + Prisma + PostgreSQL
├── frontend/         # Vite + React + TypeScript (shell + auth listos)
├── docs/             # Diseños de dominio transversales
├── observability/    # Configs de Grafana, Loki, Prometheus, Tempo
├── docker-compose.yml
├── CLAUDE.md         # Constitución del proyecto
└── README.md
```

## Qué hace el sistema

- **Contabilidad boliviana**: plan de cuentas, asientos con partida doble, períodos fiscales, libros mayor y compras/ventas, estados financieros. Sin integración automática al SIN — el contador sube el LCV manualmente.
- **Módulo granja**: operativo simple con asistente IA para registros productivos.
- **Multi-tenant flat**: cada organización es una isla. Un usuario puede pertenecer a varias con distintos roles.

## Arrancar en local

Requiere Docker, Docker Compose y Node 22+.

```bash
# 1. Levantar el stack (postgres, redis y observabilidad opcional)
docker compose up -d postgres redis

# 2. Instalar deps y arrancar el backend
cd backend
pnpm install
cp .env.example .env    # ajustar si hace falta
pnpm run prisma:migrate
pnpm run start:dev
```

El backend queda en `http://localhost:3000`, con Swagger en `/docs` y health en `/api/health`.

```bash
# 3. En otra terminal: arrancar el frontend
cd frontend
pnpm install
pnpm run dev            # http://localhost:5173 (proxy /api → backend)
```

Para el stack completo con observabilidad (Grafana, Loki, Prometheus, Tempo, dbgate):

```bash
docker compose up -d
```

> Cómo está montado el stack (servicios, volúmenes, red, dependencias), las recetas
> completas para levantarlo y los gotchas de WSL2 (Grafana sin dashboards): ver
> [`docs/entorno-local.md`](./docs/entorno-local.md).

Puertos expuestos (ver `CLAUDE.md §11.1` para la tabla completa):

| Servicio   | URL                          |
| ---------- | ---------------------------- |
| Frontend   | http://localhost:5173        |
| Backend    | http://localhost:3000        |
| Swagger    | http://localhost:3000/docs |
| Grafana    | http://localhost:3001 (admin/admin) |
| dbgate     | http://localhost:3100        |
| Prometheus | http://localhost:9090        |

## Contribuir

1. Leer `CLAUDE.md` completo antes de tocar código.
2. Seguir conventional commits con scope por módulo (`feat(cuentas): ...`, `fix(comprobante): ...`).
3. Squash merge only. Branches cortas (≤3 días).
4. Todo PR responde **Qué / Por qué / Cómo probar** en la descripción.

## Estado

- ✅ Fase 0 — Identidad (auth, RBAC, invitaciones, impersonación, feature flags)
- ✅ Fase 1.0 — Plan de cuentas + configuración contable (151 tests verdes)
- ✅ Auth hardening — access token en memoria + refresh token en httpOnly cookie
- ✅ Frontend shell — Vite + React + shadcn/ui + login + dashboard con dark mode
- 🔲 Fase 1.1 — Asientos contables con partida doble
- 🔲 Frontend — plan de cuentas viewer + configuración contable UI
- 🔲 Fase 1.2+ — Periodos fiscales, libros, estados financieros

## Licencia

Ver [`LICENSE`](./LICENSE).
