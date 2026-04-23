# avicont/frontend

Frontend del sistema avicont en **Vite + React + TypeScript**. Consume la API del backend NestJS (carpeta hermana `../backend/`).

## Stack

| Pieza | Librería |
| ----- | -------- |
| Bundler / dev | Vite 8 + `@vitejs/plugin-react` |
| Framework | React 19 + TypeScript strict |
| Estilos | Tailwind v4 (CSS-first) + `tw-animate-css` |
| Componentes | shadcn/ui (`radix-vega`, base `neutral`) + lucide-react |
| Router | react-router-dom v7 |
| Server state | @tanstack/react-query |
| Forms | react-hook-form + zod |
| State (memoria) | Zustand |
| HTTP | Axios (con interceptors de refresh y Bearer) |
| Toasts | sonner |
| Tests | Vitest + Testing Library |

## Arranque local

Desde esta carpeta (`frontend/`):

```bash
npm install
npm run dev       # http://localhost:5173
```

Requiere que el **backend** esté corriendo en `http://localhost:3000` (ver `../backend/` y el docker-compose de la raíz). El `vite.config.ts` proxéa `/api → backend` automáticamente, así la cookie `refreshToken` viaja en same-origin.

### Otras acciones

```bash
npm run build     # tsc + vite build → dist/
npm run preview   # server estático sobre dist/
npm test          # vitest en watch mode (alias de `vitest`)
npx vitest run    # vitest una vez (para CI)
```

## Estructura

```
src/
├── components/
│   ├── ui/              shadcn components (Button, Card, Input, …)
│   ├── shells/          AuthShell + DashboardShell (layouts)
│   ├── app-sidebar.tsx
│   ├── topbar.tsx
│   ├── theme-toggle.tsx
│   └── bootstrap-gate.tsx   refresh inicial + theme apply
├── features/
│   ├── auth/            login form + page + schema
│   └── dashboard/       home con cards placeholder
├── routes/
│   ├── router.tsx       react-router config
│   └── protected-route.tsx
├── stores/
│   ├── auth-store.ts    accessToken en memoria + user decodificado del JWT
│   └── theme-store.ts   light/dark/system, persist a localStorage
├── lib/
│   ├── api.ts           Axios + interceptors + bootstrapAuth()
│   └── utils.ts         cn() de shadcn
├── types/api.ts         DTOs espejados a mano del backend
└── test/setup.ts        jest-dom para Vitest
```

## Autenticación

Esquema **access en memoria + refresh en httpOnly cookie** (ver `../CLAUDE.md §5` y §10.10):

1. **Login** → `POST /api/auth/login` → el accessToken se guarda en el Zustand `auth-store`; el refreshToken queda en cookie `HttpOnly; SameSite=Strict; Path=/api/auth`.
2. **Bootstrap** (cada reload del app) → `BootstrapGate` llama `POST /api/auth/refresh`. Si la cookie es válida, repone el accessToken; si no, el store queda vacío y el `ProtectedRoute` redirige a `/login`.
3. **Request con 401** → interceptor Axios intenta el refresh una vez (con deduplicación de llamadas concurrentes) y reintenta la request. Si el refresh falla, purga el store y deja caer la request original con 401.
4. **Logout** → `POST /api/auth/logout` borra la cookie server-side y limpiamos el store.

## Convenciones

- **Idioma UI** en español.
- Alias `@/...` → `src/...` (sincronizado en `vite.config.ts` + `tsconfig.app.json`).
- Sin `any` — TypeScript strict activado.
- Cada módulo de dominio vive en `features/<dominio>/` (feature-first, no type-first).
- Los tipos DTO se mantienen manualmente en `src/types/api.ts` hasta que migremos a `openapi-typescript` (ver `../CLAUDE.md §10.10`).
