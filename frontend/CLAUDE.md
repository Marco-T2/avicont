# Avicont — Frontend

> Complemento del [`../CLAUDE.md`](../CLAUDE.md) raíz. Aplica a todo código bajo `frontend/`.

## 1. Alcance y precedencia

Este archivo se **apila sobre** el `CLAUDE.md` raíz cuando Claude trabaja en `frontend/**`. Reglas:

- **Las reglas del raíz aplican a todo el proyecto** (idioma del dominio, git, multi-tenant, decisiones cerradas, runbook).
- **Si una regla de este archivo contradice al raíz, prevalece ESTA.** Es el contrato específico de frontend.
- **Si una regla del raíz no aplica al frontend** (ej. §5 defense-in-depth del `tenantId` en queries Prisma, §6.8 "loggear en service/repo"), se ignora sin contradicción — no es falta de adherencia, es scope distinto.
- Cuando haya ambigüedad genuina: preguntá antes de decidir.

## 2. Arquitectura y estructura de carpetas (Screaming Architecture)

> **La estructura de `src/features/` debe GRITAR qué hace el producto, no que es una app React.**

Un dev externo entra al repo, abre `src/features/` y debe poder adivinar el dominio:

```
src/features/
├── auth/                       ← "este sistema autentica usuarios"
├── cuentas/                    ← "maneja cuentas contables"
├── plan-cuentas/               ← "tiene un plan de cuentas (PUCT)"
├── asientos/                   ← "registra asientos con partida doble"
├── periodos/                   ← "tiene períodos fiscales"
├── libro-diario/
├── libro-mayor/
├── configuracion-contable/     ← "mapea conceptos a cuentas"
├── members/                    ← "tiene miembros y roles"
├── invitations/
└── granja/                     ← "tiene operativo avícola con IA"
```

**NO hacer** (anti-screaming — grita "es una SPA", no grita dominio):

```
src/
├── pages/        ❌
├── containers/   ❌
├── hooks/        ❌ (a nivel raíz; sí dentro de cada feature)
├── utils/        ❌ (a nivel raíz; usar lib/ con nombres semánticos)
```

**Estructura interna de una feature** — misma forma para todas:

```
src/features/cuentas/
├── api/                    Funciones puras de request (1 archivo por endpoint)
│   ├── get-cuentas.ts
│   ├── get-cuenta-tree.ts
│   ├── create-cuenta.ts
│   └── mapear-puct.ts
├── hooks/                  Wrappers de TanStack Query/Mutation (1 por uso)
│   ├── use-cuentas.ts
│   ├── use-cuenta-tree.ts
│   └── use-create-cuenta.ts
├── components/             Componentes propios de la feature
│   ├── cuenta-form.tsx
│   ├── cuenta-tree-view.tsx
│   └── cuenta-delete-dialog.tsx
├── pages/                  Páginas-contenedor (orquestan hooks + componentes)
│   ├── cuentas-page.tsx
│   └── cuenta-detail-page.tsx
├── schemas/                Zod schemas (form validation)
│   └── cuenta-form-schema.ts
├── lib/                    Utilidades PURAS del feature (funciones, cálculos,
│   │                       helpers). Sin React, sin I/O, sin side effects.
│   └── sugerir-codigo-hijo.ts
└── types.ts                Tipos locales a la feature (no compartidos)
```

**Regla para `lib/` dentro de un feature:**
- Funciones **puras** (determinísticas, sin efectos).
- **Sin** dependencias de React (si necesita `useState`, va a `hooks/`).
- **Sin** I/O: si hace `fetch`, va a `api/`.
- Tests unitarios al lado (`sugerir-codigo-hijo.test.ts`). Es el lugar más
  barato de testear del feature — funciones puras sin setup.
- Ejemplo canónico: `sugerirCodigoHijo(padre, hijas): string` — recibe
  data, devuelve data, sin tocar nada más.

**Otras carpetas de la raíz de `src/`:**

| Carpeta | Rol |
|---------|-----|
| `components/ui/` | Primitivos shadcn (Button, Card, Input) — NO gritan dominio, son el ladrillo |
| `components/shells/` | Layouts transversales (`AuthShell`, `DashboardShell`) |
| `components/shared/` | Componentes cross-feature reutilizables (DataTable genérica, EmptyState) |
| `stores/` | Zustand stores globales (`auth-store`, `theme-store`) |
| `lib/` | Utilidades transversales (`api.ts`, `utils.ts`, `error-messages.ts`) |
| `routes/` | Config de React Router + guards |
| `types/` | Tipos compartidos entre features (`api.ts` con DTOs del backend) |
| `test/` | Setup de Vitest (los tests viven al lado del código) |

## 3. Componentes

### Naming

| Artefacto | Caso | Ejemplo |
|-----------|------|---------|
| Archivos | `kebab-case` | `cuenta-form.tsx`, `use-cuentas.ts` |
| Componentes React | `PascalCase` | `CuentaForm`, `CuentaTreeView` |
| Hooks | `camelCase` con prefijo `use` | `useCuentas`, `useCreateCuenta` |
| Funciones | `camelCase` | `getCuentas`, `buildTree` |
| Constantes module-level | `SCREAMING_SNAKE_CASE` | `REFRESH_INTERVAL_MS` |
| Tipos / interfaces | `PascalCase` | `Cuenta`, `CuentaFormValues` |

### Patrón container/presentational

- **Páginas** (`features/<x>/pages/*.tsx`) son **contenedores**: orquestan hooks, manejan loading/error, pasan data plana a componentes.
- **Componentes** (`features/<x>/components/*.tsx`) son **presentacionales** cuando se puede: reciben props, renderizan, emiten callbacks. Ideal para testing con Testing Library.
- Componentes que incluyen lógica de fetching (ej. un selector que carga sus opciones) están bien, pero **deben usar el hook de la feature**, nunca `api.ts` directo.

### Atomic design (versión pragmática)

- **UI primitives** (shadcn) → `components/ui/*` — único lugar que expone `forwardRef` + `cva` + props raw.
- **Composites** (transversales) → `components/shared/*` — armados con primitives, ej. `DataTable`, `ConfirmDialog`.
- **Domain components** → `features/<x>/components/*` — armados con primitives + composites, conocen del dominio.
- **Pages** → `features/<x>/pages/*` — orquestan todo.

Esta jerarquía de dependencias **no se viola**: un primitivo NO importa de un composite, un composite NO importa de una feature, una page NO importa de otra page.

## 4. State management (sección crítica)

> Esta es la sección que más fácil se pudre en proyectos React. Reglas duras, sin excepciones.

### Tabla de decisión

| Tipo de estado | Tool | Ejemplos |
|----------------|------|----------|
| Server state (data del backend) | **TanStack Query** | Lista de cuentas, usuario actual, árbol PUCT |
| Global UI state (cross-feature) | **Zustand** | Access token, tenant activo, sidebar abierto, tema |
| Forms | **react-hook-form + zod** | Todos los formularios SIN excepción |
| Local UI state (dentro de un componente) | **`useState`** | Toggle de modal, tab seleccionada |
| Derived state | **`useMemo`** o cálculo inline | `const total = lineas.reduce(...)` |
| URL state (filtros, paginación, tabs de URL) | **`useSearchParams`** (react-router) | `?page=3&estado=CONTABILIZADO` |

### Regla negativa (la más importante)

**Nunca duplicar server state en Zustand.** Si la data viene del backend, vive en el cache de TanStack Query y punto. Copiar esa data a un store global se desincroniza al primer mutación y genera bugs invisibles.

```ts
// ❌ MAL — user duplicado entre Zustand y Query
const user = useAuthStore((s) => s.user);           // del JWT decodificado, OK
const { data: membresias } = useMembresias();        // server state
useAuthStore.setState({ membresias: membresias });  // ❌ nunca

// ✅ BIEN — cada estado en su lugar
const user = useAuthStore((s) => s.user);           // claims del JWT (no viene de GET)
const { data: membresias } = useMembresias();        // server state en Query cache
```

**Excepción aceptada** para `auth-store`: el `user` derivado del JWT se guarda en Zustand porque el token es lo que el interceptor Axios consulta en cada request; decodificarlo en cada `useAuthStore()` es re-hacer trabajo. Es un caso borde documentado.

### Derived state: NUNCA con `useEffect + useState`

```tsx
// ❌ MAL — re-render innecesario, race condition
const [total, setTotal] = useState(0);
useEffect(() => {
  setTotal(lineas.reduce((s, l) => s + l.monto, 0));
}, [lineas]);

// ✅ BIEN — cálculo durante el render
const total = useMemo(
  () => lineas.reduce((s, l) => s + l.monto, 0),
  [lineas],
);

// ✅ PERFECTO si no es caro — inline, React se encarga
const total = lineas.reduce((s, l) => s + l.monto, 0);
```

## 5. Formularios

### Reglas

- **Toda entrada de usuario va en `react-hook-form` + `zodResolver`.** Nada de `useState` para campos.
- **Schemas zod en `features/<x>/schemas/`** con mensajes **en español**.
- **Tipar `Values` con `z.infer<typeof schema>`** — single source of truth.
- **Accesibilidad obligatoria**: `<label htmlFor>` + `aria-invalid` + mensaje de error asociado.
- **Botón de submit siempre refleja `isPending`** (ver Antipatrón 7 más abajo).

### Ejemplo canónico

```tsx
// features/cuentas/schemas/cuenta-form-schema.ts
export const cuentaFormSchema = z.object({
  codigoInterno: z
    .string()
    .min(1, 'El código interno es obligatorio')
    .regex(/^[0-9]+(\.[0-9]+)*$/, 'Solo segmentos numéricos separados por puntos'),
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  claseCuenta: z.enum(['ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'EGRESO']),
});
export type CuentaFormValues = z.infer<typeof cuentaFormSchema>;

// features/cuentas/components/cuenta-form.tsx
const { register, handleSubmit, formState: { errors } } = useForm<CuentaFormValues>({
  resolver: zodResolver(cuentaFormSchema),
});
const createMutation = useCreateCuenta();

<Button type="submit" disabled={createMutation.isPending}>
  {createMutation.isPending ? 'Guardando...' : 'Crear cuenta'}
</Button>
```

## 6. Estilos — Tailwind + tema + dark mode

### Dark mode: **ACTIVO** desde el día 1

El sistema tiene toggle (`ThemeToggle`) y el tema se aplica vía clase `.dark` en `<html>`. **Cualquier clase Tailwind que uses debe respetar ambos modos automáticamente.**

### Regla de oro del tema

> **Usar variables semánticas del tema. Nunca colores literales de Tailwind.**

```tsx
// ✅ BIEN — variables del tema, se adaptan a dark/light
<div className="bg-background text-foreground border-border">
<span className="text-muted-foreground">
<Button className="bg-primary text-primary-foreground">

// ❌ MAL — colores literales, rompe en dark mode
<div className="bg-white text-gray-900 border-gray-200">
<span className="text-gray-500">
<button className="bg-black text-white">
```

### Variables disponibles (definidas en `src/index.css`)

`background`, `foreground`, `card`, `card-foreground`, `popover`, `popover-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `muted`, `muted-foreground`, `accent`, `accent-foreground`, `destructive`, `border`, `input`, `ring`, `sidebar-*`, `chart-1..5`.

**Si necesitás un color semántico no cubierto** (ej. verde de éxito contable, naranja de advertencia): agregar la variable a `src/index.css` en `:root` **y** en `.dark`. Nunca hardcodear.

### Componer classnames: `cn()` siempre

```tsx
import { cn } from '@/lib/utils';

<div className={cn(
  'rounded-md px-4 py-2',
  isActive && 'bg-accent',
  className,  // merge con className del caller
)}>
```

## 7. Responsive y mobile

### Postura del proyecto: **mobile-usable**

- **Desktop es la experiencia óptima** para trabajo contable pesado (asientos con muchas líneas, estados financieros, libro mayor). El contador vive en la laptop.
- **Mobile funciona para consulta y operaciones rápidas**: dashboard, aprobaciones, cambiar tenant, chat de granja, notificaciones. Siempre usable, no siempre ideal.
- **Excepción — `features/granja/**` es mobile-first estricto**: el usuario opera en el gallinero con el celular. Ahí la feel tiene que ser igual de buena que en desktop.

### Breakpoints

Los estándar de Tailwind, sin personalizar:

| Prefijo | Ancho | Device referencia |
|---------|-------|-------------------|
| (ninguno) | < 640 px | Mobile portrait (iPhone SE 375 px) |
| `sm:` | ≥ 640 px | Mobile landscape / phablet |
| `md:` | ≥ 768 px | Tablet portrait (iPad 768 px) |
| `lg:` | ≥ 1024 px | Tablet landscape / laptop chica |
| `xl:` | ≥ 1280 px | Laptop estándar (1440 px target) |
| `2xl:` | ≥ 1536 px | Desktop grande |

**Viewports de testing obligatorios** antes de merge: **375 px** (iPhone SE) + **768 px** (iPad) + **1440 px** (laptop).

### Reglas duras

#### Mobile-first siempre
- Clases sin prefijo = mobile. `md:` y arriba son **upgrades**, no overrides.
- ✅ `className="flex-col md:flex-row gap-2 md:gap-4"`
- ❌ `className="flex-row md:flex-col"` (empieza desktop, baja a mobile — al revés)

#### Tap targets mínimos 44×44 px (Apple HIG)
- Todo `<Button>`, `<a>`, item de lista tocable, icono clickeable.
- Button de shadcn size `default` (h-9 = 36 px) **no cumple**; para elementos críticos en mobile usar `size="lg"` (h-10 = 40 px) o agregar `py-3 px-4` al wrap.
- Los icon-only buttons (`size="icon"` = h-9 w-9) requieren `h-10 w-10` o mayor en contextos mobile.

#### Inputs con `font-size ≥ 16 px` en mobile
- iOS Safari **hace auto-zoom** al focusear inputs con font < 16 px. Es visualmente destructivo.
- shadcn Input default es `text-sm` (14 px). **Forzar `text-base` (16 px) en mobile**:
  ```tsx
  <Input className="text-base md:text-sm" />
  ```
- O mejor: ajustar la base del componente `ui/input.tsx` para que arranque `text-base` y suba a `text-sm` en `md:`.

#### Sidebar: fixed en desktop, drawer en mobile
- `md:flex` para el sidebar fijo. En `< md`, oculto.
- **Botón hamburger visible solo en mobile** (`md:hidden`) en el topbar, abre un `Sheet` (shadcn) con los mismos items.
- **Los items del nav viven en un solo lugar** (constante compartida), ambos modos los consumen.

#### Modales: centrados en desktop, fullscreen en mobile
- `Dialog` de shadcn default es centrado con `max-w-lg`.
- En mobile, formulario de crear asiento con 10 campos dentro de un modal chico es inmanejable.
- Patrón: `className="sm:max-w-lg max-w-none h-full sm:h-auto"` o usar `Sheet` desde bottom/fullscreen.

#### Tablas con muchas columnas
- El dominio contable tiene tablas de 8-15 columnas (libro mayor, plan de cuentas con codigoInterno + codigoPuct + nombre + clase + subclase + estado + …).
- Dos patrones aceptados según el caso:
  - **Scroll horizontal**: `<div className="overflow-x-auto"><table className="min-w-[900px]">...</table></div>`. Con sticky de primera columna (`sticky left-0 bg-background`) si el contexto lo necesita.
  - **Card stack en mobile**: en `< md` la tabla se transforma en lista de cards apiladas. Mejor lectura, peor para comparar filas.
- Decisión por tabla, no global. Documentarla en el componente.

#### Formularios en mobile
- Labels **siempre arriba** del input (nunca inline en `< md`).
- Submit button **full-width** en mobile (`w-full md:w-auto`).
- Si el form tiene ≥ 6 campos, considerar wizard multi-step en mobile aunque en desktop sea single-page.

#### Toast (`sonner`)
- Desktop: `position="top-right"` (default ya configurado).
- Mobile: el toast top-right queda cortado. Usar `top-center` o `bottom-right`.
- Patrón: detectar ancho y setear position responsive, o aceptar `top-center` como unificado.

#### Viewport meta y meta tags
- `index.html` debe tener `<meta name="viewport" content="width=device-width, initial-scale=1.0">`.
- **No** usar `maximum-scale=1.0` ni `user-scalable=no`: bloquea el zoom de accesibilidad del usuario. Los inputs con `font-size ≥ 16 px` ya evitan el auto-zoom molesto.

### Checklist pre-commit de cambios de UI

Este checklist es **obligatorio** antes de commitear cualquier cambio que toque
componentes, layouts o estilos. Su ausencia es la causa #1 de regresiones
visuales en mobile o dark mode. Copiarlo al cuerpo del commit o del PR:

- [ ] Renderizado correcto en **375 px** (iPhone SE, viewport mobile)
- [ ] Renderizado correcto en **768 px** (iPad, breakpoint `md:`)
- [ ] Renderizado correcto en **1440 px** (laptop, breakpoint `xl:` target)
- [ ] Tap targets ≥ **44×44 px** en todos los botones/items interactivos de mobile
- [ ] **Modo oscuro** verificado — ningún color literal (ver §6, Anti-F-10).
      Usar variables del tema (`text-foreground`, `bg-primary`, `bg-clase-activo-bg`, …).
- [ ] Navegación accesible en `< md` (drawer/hamburger funciona)
- [ ] Inputs no disparan auto-zoom en iOS (text-base en mobile)
- [ ] Tablas con estrategia explícita (scroll-x + sticky first col, o card stack)
- [ ] Modales no atrapan al usuario en mobile (fullscreen o sheet, no centered)
- [ ] Si el feature tiene formularios: submit deshabilitado con `isPending`
      (Anti-F-07 crítico para sistemas transaccionales)

> El agente que abre un PR sin este checklist debe pedir al caller humano que
> lo complete antes de mergear. No es opcional cuando hay cambios visuales.

## 8. API client y handlers por feature

### Cliente único

**Toda request HTTP va vía `src/lib/api.ts`.** Sin excepciones:

- Nada de `fetch()` directo.
- Nada de `axios.create()` nuevo en otras carpetas.
- Nada de `axios.get(...)` usando el default export de axios.

Razón: el cliente central tiene el interceptor de Bearer + el de 401 → refresh con deduplicación. Cualquier request por fuera del cliente pierde ambos.

### Handlers por feature (separación en capas)

Cada feature tiene dos capas:

```
features/cuentas/
├── api/              ← funciones puras, tipadas, 1 archivo por endpoint
│   ├── get-cuentas.ts
│   ├── create-cuenta.ts
│   └── mapear-puct.ts
└── hooks/            ← wrappers de TanStack Query/Mutation
    ├── use-cuentas.ts
    ├── use-create-cuenta.ts
    └── use-mapear-puct.ts
```

```ts
// features/cuentas/api/get-cuentas.ts
import { api } from '@/lib/api';
import type { Cuenta } from '@/types/api';

export interface ListarCuentasParams {
  page?: number;
  pageSize?: number;
  claseCuenta?: 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'INGRESO' | 'EGRESO';
}

export async function getCuentas(params: ListarCuentasParams = {}) {
  const res = await api.get<{ items: Cuenta[]; total: number; page: number }>(
    '/api/cuentas',
    { params },
  );
  return res.data;
}
```

```ts
// features/cuentas/hooks/use-cuentas.ts
import { useQuery } from '@tanstack/react-query';
import { getCuentas, type ListarCuentasParams } from '../api/get-cuentas';

export function useCuentas(params: ListarCuentasParams = {}) {
  return useQuery({
    queryKey: ['cuentas', params],
    queryFn: () => getCuentas(params),
  });
}
```

### Regla dura

> **Los componentes nunca importan de `features/<x>/api/*.ts`. Siempre importan del hook.**

Razón: si el componente llama directo a `getCuentas()`, se pierde el cache de TanStack Query, invalidation cross-component, optimistic updates, etc. Esta regla se enforza en code review.

Excepción única: el archivo `hooks/use-*.ts` es el lugar donde `api/*.ts` se importa — ningún otro.

### Query keys

Convención: `[featureName, operation, ...params]`:

```ts
['cuentas']                           // lista raíz
['cuentas', 'tree']                   // árbol
['cuentas', 'detalle', id]            // uno
['cuentas', 'conceptos-que-usan', id] // endpoint específico
```

Mantener la convención facilita invalidations bulk: `queryClient.invalidateQueries({ queryKey: ['cuentas'] })` limpia todo el cache de la feature.

### Mapeo de error codes del backend

El backend devuelve `{ code, message, details? }` con codes estables (ver `../CLAUDE.md §6.3`). El frontend los traduce vía un helper:

```ts
// src/lib/error-messages.ts
export function mensajeDeError(err: unknown): string {
  // ... extrae code, busca en el catálogo de traducciones UI, fallback al message genérico
}
```

Mostrar el `message` del backend directamente **está permitido** porque ya viene en español, pero para errores con acción clara (ej. `CUENTA_CONFIGURADA_COMO_CONCEPTO` con lista de conceptos) el frontend compone un mensaje más útil con `details`.

## 9. Testing

### Stack

- **Vitest** + **@testing-library/react** + **@testing-library/user-event** + **@testing-library/jest-dom**.
- Setup global en `src/test/setup.ts`.
- Config en `vite.config.ts` (bloque `test`).

### Ubicación

Tests **al lado del código**, mismo patrón que backend:

```
features/cuentas/
├── components/
│   ├── cuenta-form.tsx
│   └── cuenta-form.test.tsx       ← al lado
├── hooks/
│   ├── use-cuentas.ts
│   └── use-cuentas.test.ts        ← al lado
```

### Prioridades

1. **Componentes: user interactions sobre implementation details.** Query por rol/label/texto visible (`getByRole`, `getByLabelText`), no por `data-testid` excepto último recurso.
2. **Hooks de dominio pesado**: tests con `renderHook` si vale la pena (ej. derivaciones complejas).
3. **Lógica pura** (validators, mapeadores, helpers): tests unitarios directos sin render.
4. **NO testear wrappers triviales de TanStack Query** — cubrir el `api/` puro si hay lógica, pero `use-cuentas.ts` que es solo `useQuery({...})` no necesita test.

### Mock de API

Hoy no usamos MSW porque los tests cubren validación de forms y stores. Cuando tengamos queries con orquestación (invalidations, optimistic updates), migrar a **MSW** (Mock Service Worker) — anotado como deuda.

## 10. Accesibilidad mínima

- `<label htmlFor="id">` asociado a `<input id="id">` — siempre.
- Botones con solo ícono: `aria-label="Cerrar sesión"` obligatorio.
- Form errors accesibles: `aria-invalid={hasError}` en el input + mensaje con texto visible (pantallas lectores lo agarran).
- No quitar `outline-ring` de focus — shadcn lo maneja bien; forzar un estado de focus propio solo si es mejor, no porque molesta.
- **Contraste**: las variables del tema (oklch) ya cumplen WCAG AA para pares `foreground`/`background`. Si agregás colores propios, verificar.

## 11. Git

- **Conventional commits** siguiendo la regla de `../CLAUDE.md §9.1`.
- **Scope** para cambios solo frontend: `<modulo>-ui` o `frontend` si es transversal.
  - `feat(cuentas-ui): add tree view page`
  - `feat(auth-ui): add organization switcher`
  - `chore(frontend): upgrade Vite to 8.1`
- Cuando un cambio toca backend + frontend en el mismo slice vertical: scope del módulo de dominio, sin sufijo:
  - `feat(invitations): backend flow + frontend accept page`

## 12. Antipatrones del frontend

Cada antipatrón: **Qué** (una línea), **Por qué duele** (con foco en un sistema contable), **Regla**.

### Anti-F-01: `any` en código de producción
- **Qué**: `let x: any = response.data`.
- **Por qué duele**: apagás el compilador donde más lo necesitás. En formulario de asiento, un `any` puede mandar string donde se espera number y romper la partida doble.
- **Regla**: `unknown` con narrowing, o tipo específico. `@typescript-eslint/no-explicit-any: error`.

### Anti-F-02: `useEffect` para derivar state
- **Qué**: `const [total, setTotal] = useState(0); useEffect(() => setTotal(sum(lines)), [lines]);`.
- **Por qué duele**: render doble, posibles inconsistencias entre `lines` y `total` dentro de una misma frame.
- **Regla**: `useMemo` o cálculo inline durante el render. `useEffect` se reserva para efectos (subscripciones, callbacks al DOM, sincronización con stores externos).

### Anti-F-03: Fetch directo fuera de `src/lib/api.ts`
- **Qué**: `const res = await fetch('/api/cuentas');` en un componente o hook.
- **Por qué duele**: pierde el interceptor de Bearer → 401 sin refresh automático → usuario desloggeado de repente; o peor, request sin autenticación que al backend le da 401 silencioso.
- **Regla**: toda request va vía `api.get/post/patch/delete`. Excepción única: el propio `refreshAccessToken()` dentro de `src/lib/api.ts` usa `axios.post` directo para evitar recursión en el interceptor.

### Anti-F-04: Mutar Zustand fuera de sus acciones
- **Qué**: `useAuthStore.setState({ accessToken: 'raw' })` en un componente.
- **Por qué duele**: la acción oficial (`setToken`) decodifica el JWT y pobla `user`. Saltarla deja el store inconsistente.
- **Regla**: el store expone acciones; los callers usan esas acciones. Nunca `setState` crudo fuera del archivo del store.

### Anti-F-05: Server state duplicado en Zustand
- **Qué**: `useAuthStore.setState({ cuentas: await getCuentas() })`.
- **Por qué duele**: después de un `POST /cuentas`, el store queda stale hasta que alguien lo refresque manualmente. La UI miente.
- **Regla**: server state vive en TanStack Query cache. Invalidations con `queryClient.invalidateQueries({ queryKey: ['cuentas'] })`. Ver §4.

### Anti-F-06: Key de lista con index
- **Qué**: `items.map((item, i) => <Row key={i} item={item} />)`.
- **Por qué duele**: rompe animaciones, rompe estado interno de hijos cuando el array cambia orden o inserta al medio. En una tabla de líneas de asiento donde reordenás, el foco del input salta a la fila anterior.
- **Regla**: usar un ID estable (`item.id`). Si realmente no hay ID, generar uno estable al crear el item, no al renderizar.

### Anti-F-07: Formulario sin `isPending` deshabilitando submit
- **Qué**: `<Button type="submit">Guardar</Button>` sin chequear el pending de la mutation.
- **Por qué duele**: **crítico en contexto contable**. Usuario apura el click, backend tarda 800 ms procesando. Segundo click dispara otro `POST /asientos` → comprobante duplicado con mismo correlativo no (por la atómica) pero líneas duplicadas sí.
- **Regla**: `<Button disabled={mutation.isPending}>`. Idealmente también spinner visible. Esta regla NO tiene excepción.

### Anti-F-08: Callbacks inline pesados sin `useCallback`
- **Qué**: componente padre con `<ChildMemo onAction={() => doStuff()} />` donde `ChildMemo` es `React.memo`.
- **Por qué duele**: `React.memo` compara referencias. Una función inline cambia identidad en cada render → `ChildMemo` re-renderiza siempre → el memo no sirve para nada.
- **Regla**: si el hijo es `memo` o la función se pasa a un efecto en el hijo, envolver con `useCallback`. Si no (hijo no-memo, prop simple), inline está bien. No memoizar por costumbre.

### Anti-F-09: Navegación con `window.location.href`
- **Qué**: `window.location.href = '/login'` en un handler.
- **Por qué duele**: recarga la app entera, **perdiendo el access token en memoria** (todo el punto de tener el token en memoria es NO perderlo entre SPA transitions). Además pierde estado de TanStack Query, Zustand, etc.
- **Regla**: `const navigate = useNavigate(); navigate('/login')`. Excepción ÚNICA: logout "hard" donde se quiere invalidar todo intencionalmente — pero aún así, `navigate('/login', { replace: true })` + `clear()` del store cubre el 99% de casos.

### Anti-F-10: Colores hardcoded de Tailwind
- **Qué**: `className="text-gray-900 bg-white border-gray-200"`.
- **Por qué duele**: rompe dark mode. El usuario que trabaja con el plan de cuentas a las 23:00 cambia a dark y ve un card blanco gigante que le quema los ojos.
- **Regla**: variables semánticas (`text-foreground`, `bg-card`, `border-border`). Ver §6.

### Anti-F-11: Componente-página que accede a Zustand Y hooks de API sin separar
- **Qué**: la página llama `useAuthStore`, `useCuentas`, `useCreateCuenta`, `useMapearPuct`, `useDesactivarCuenta` en 50 líneas y renderiza 200 más.
- **Por qué duele**: imposible de testear, imposible de leer. Cuando hay bug, el diff mezcla cambios de fetch con cambios de UI.
- **Regla**: la **page** orquesta hooks y compone un objeto plano; los **componentes** reciben props y emiten callbacks. Testeable con Testing Library sin montar el Query provider ni el store.

### Anti-F-12: Llamar a `api/*.ts` directamente desde un componente
- **Qué**: `import { getCuentas } from '@/features/cuentas/api/get-cuentas'` en `cuentas-page.tsx`.
- **Por qué duele**: pierde cache, pierde dedup, pierde invalidations. Dos componentes montados piden la misma data dos veces.
- **Regla**: componentes importan **solo** del hook (`use-cuentas`). El hook es la fachada de la feature. Ver §8.

### Anti-F-13: `toast.error()` en el cuerpo del componente (en cada render)
- **Qué**: `if (query.isError) { toast.error('No se pudo cargar') }` escrito directamente en el cuerpo de un componente que se re-renderiza.
- **Por qué duele**: el toast se dispara en CADA re-render mientras `isError === true`. Con un backend caído, sonner muestra 20-50 toasts por segundo y la pantalla se vuelve inusable. El error real queda oculto detrás del spam.
- **Regla**: nunca disparar side effects (toasts, fetch, navigate) desde el cuerpo de un componente. Opciones:
  - **Si la query es crítica para el render** (la página no puede mostrar nada sin ese dato): early return con banner inline `<div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">` + botón de "Volver" o "Reintentar". No usar toast.
  - **Si la query es secundaria** (es 1 query entre varias): pasar `onError` al hook (`useQuery({ ..., meta: { onError } })`) o `useEffect(() => { if (isError) toast.error(...); }, [isError])` con dep array explícito.
  - **El `toast.error()` se reserva para errores de mutaciones** (`onError` callback de `useMutation`), donde se dispara una vez por intento del usuario.

### Anti-F-14: `Textarea` dentro de Sheet/Dialog sin `[field-sizing:fixed]`
- **Qué**: `<Textarea {...register('motivo')} />` dentro de un `<Sheet>` o `<Dialog>` sin clases que controlen el sizing.
- **Por qué duele**: el componente `Textarea` de shadcn usa `field-sizing-content` por defecto (CSS nuevo que crece con el contenido). Si el usuario pega una línea larga sin espacios (URL, hash, JSON inlineado), el textarea **expande horizontalmente** y empuja el contenedor del Sheet/Dialog, rompiendo el layout y forzando scroll horizontal. El bug es invisible en testing porque solo se reproduce con texto real.
- **Regla**: todo `<Textarea>` dentro de `<Sheet>` o `<Dialog>` debe llevar:
  ```tsx
  <Textarea
    className="w-full max-w-full resize-y [field-sizing:fixed] min-h-[80px]"
    {...register('campo')}
  />
  ```
  El `min-h` es libre por contexto (72/80/100 px). `[field-sizing:fixed]` desactiva el sizing automático, `w-full max-w-full` fuerza al input a respetar el ancho del padre, `resize-y` permite que el usuario lo agrande verticalmente. **El `text-base md:text-sm` se mantiene** por la regla de mobile auto-zoom (§7).

### Anti-F-15: selector de Zustand que devuelve una referencia nueva
- **Qué**: `useStore((s) => s.user?.roles ?? [])` — el `?? []` (o `?? {}`, `.filter(...)`, `.map(...)`, un objeto literal) corre **dentro** del selector.
- **Por qué duele**: Zustand compara el resultado del selector con `Object.is`. Si devuelve una referencia nueva en cada render (un `[]` fresco cuando el valor real es `undefined`/`null`), el store cree que el snapshot cambió y fuerza otro render → **loop infinito** ("Maximum update depth exceeded"). Es invisible mientras el valor exista; explota justo cuando se vuelve nulo (ej. logout con el componente montado). Bug real cazado en `members-list`.
- **Regla**: el selector devuelve **solo el valor crudo del store** (referencia estable); cualquier default/derivación va **fuera**:
  ```tsx
  // ❌ array nuevo dentro del selector
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  // ✅ selector estable; el ?? va afuera
  const roles = useAuthStore((s) => s.user?.roles) ?? [];
  ```
  Si necesitás derivar varios campos, usá `useMemo` sobre los valores crudos, o el selector con `shallow` de `zustand/shallow`.

---

## 13. Page chrome y componentes compartidos

> Esta sección documenta los patrones que TODA página de listado/detalle debe seguir. Surge de divergencias detectadas en code review: cuando no hay regla escrita, cada feature reinventa el header con valores distintos y la UI termina sintiéndose inconsistente entre pantallas.

### 13.1 Header canónico de página de listado

**Estructura obligatoria** (copy-paste):

```tsx
<div className="space-y-6">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div>
      <h1 className="text-2xl md:text-3xl font-bold">{titulo}</h1>
      <p className="text-sm md:text-base text-muted-foreground">
        {subtitulo}
      </p>
    </div>
    <Button onClick={...} className="self-start">
      <Plus className="h-4 w-4 mr-2" />
      {accionPrimaria}
    </Button>
  </div>

  {/* resto de la página */}
</div>
```

**Reglas duras**:
1. **El container raíz NO agrega padding propio.** El `DashboardShell` ya provee `px-4 py-6 lg:px-8` en el `<main>`. Agregar `p-4 md:p-6` produce padding DOBLE y empuja el contenido hacia adentro vs. todas las demás pantallas.
2. **`space-y-6` entre el header y el resto del contenido.** No `space-y-4` ni `space-y-5`.
3. **Title h1 escalable**: `text-2xl md:text-3xl font-bold`. NO usar `tracking-tight` — no se usa en ninguna otra página.
4. **Subtítulo escalable**: `text-sm md:text-base text-muted-foreground`. NO usar `mt-0.5` — el `<div>` padre ya da el spacing necesario.
5. **Layout responsive**: `flex-col gap-3` en mobile, `sm:flex-row sm:items-start sm:justify-between` en tablet+. NO usar `items-center` — `items-start` alinea el botón al borde superior cuando el subtítulo se wrappea.
6. **Botón con `self-start`** para que en mobile no se estire al ancho del contenedor.
7. **Texto del botón en imperativo**: "Nueva cuenta", "Nuevo comprobante", "Nueva gestión". Singular, sin artículos.

**Páginas de detalle y editor** (no listado): la regla del container `space-y-6` sin padding propio se mantiene; el header difiere porque suele tener back-button + título contextual en lugar de h1 + acción primaria. Patrón:

```tsx
<div className="space-y-6">
  <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1 -ml-2">
    <ChevronLeft className="h-4 w-4" />
    {textoBack}
  </Button>
  <div>
    <h1 className="text-2xl md:text-3xl font-bold">{titulo}</h1>
    <p className="text-sm md:text-base text-muted-foreground">{descripcion}</p>
  </div>
  {/* resto */}
</div>
```

### 13.2 Header de sección interna

Para encabezar una sección dentro de una página o drawer (ej. "Líneas", "Comprobantes", "Totales"):

```tsx
<h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
  Líneas
</h2>
```

- `<h2>` si es el primer nivel de subsección en la página; `<h3>` si está dentro de un drawer o un card.
- `mb-3` (no `mb-2`) para spacing consistente con el contenido siguiente.
- Texto en español capitalizado solo en la primera letra; el uppercase lo aplica CSS.

### 13.3 Paginación

Usar el componente shared `@/components/shared/pagination-bar`:

```tsx
import { PaginationBar } from '@/components/shared/pagination-bar';

<PaginationBar
  page={page}
  limit={DEFAULT_LIMIT}
  total={data.total}
  onPageChange={handlePageChange}
/>
```

- **NO reimplementar inline** con `<Button><ChevronLeft /></Button>` y label custom. El componente shared maneja: no renderizar si total ≤ limit, label "Página X de Y", botones con texto + icono.
- Si el componente shared no cubre un caso (paginación con jump-to-page, infinite scroll), discutir antes de fork-ear.

### 13.4 Empty states

Dos variantes según el contexto:

**Empty state de tabla** (filtros activos sin resultados — la entidad existe pero no hay matches):
```tsx
<div className="flex h-40 items-center justify-center rounded-md border border-dashed">
  <p className="text-sm text-muted-foreground">No se encontraron resultados.</p>
</div>
```
Sin ícono, sin CTA — el usuario ya está en la pantalla, solo le mostramos que su filtro no devolvió nada.

**Empty state de página** (primera vez, la entidad no existe todavía):
```tsx
<div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
  <Icono className="mx-auto h-12 w-12 text-muted-foreground" />
  <h2 className="mt-4 text-lg font-semibold">No hay {entidades} todavía</h2>
  <p className="mt-1 text-sm text-muted-foreground">{copy explicativo de 1 línea}</p>
  <Button onClick={onCrear} className="mt-4">
    <Plus className="h-4 w-4 mr-2" />
    {accionPrimaria}
  </Button>
</div>
```
Con ícono del dominio + h2 + copy + CTA. Es la primera impresión del feature, vale la pena el peso visual.

---

## 14. Convenciones secundarias (consistencia)

> Estas reglas no atrapan bugs (a diferencia de §12), pero evitan que la UI se vea distinta entre features sin razón. Surgen de la auditoría que detectó 12 patrones repetidos sin documentar.

### 14.1 Detail drawer — estructura canónica

Drawers que muestran detalle de una entidad (sin form):

```tsx
<Sheet open={open} onOpenChange={onOpenChange}>
  <SheetContent
    side="right"
    className="w-full sm:max-w-xl overflow-y-auto overflow-x-hidden"
  >
    <SheetHeader>{/* título + badge de estado */}</SheetHeader>
    <div className="px-4 py-2 space-y-4">
      {isLoading ? <Skeleton /> : null}
      {isError ? <p className="text-sm text-destructive">…</p> : null}
      {data !== undefined ? <DetailBody data={data} /> : null}
    </div>
    <SheetFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
      <div className="flex gap-2">{/* acciones */}</div>
    </SheetFooter>
  </SheetContent>
</Sheet>
```

- **Ancho**: `sm:max-w-xl` por default. Subir a `sm:max-w-2xl` solo si el contenido lo justifica (tabla embebida).
- **Body**: `space-y-4` entre secciones.
- **Footer**: Cerrar a la izquierda (variant outline), acciones primarias/destructivas a la derecha.

### 14.2 Form Sheet — criterio de ancho

Sheets que contienen un form (crear/editar):

| Tamaño del form | Ancho |
|---|---|
| 1-2 campos (ej. confirmar con motivo) | `sm:max-w-md` |
| 3-6 campos (ej. crear contacto) | `sm:max-w-xl` |
| 7+ campos o selects con texto largo (ej. crear cuenta con jerarquía) | `sm:max-w-3xl` |

El form va envuelto en `<div className="px-4 pb-6">` para consistencia con el body de los detail drawers.

### 14.3 Confirm dialogs — AlertDialog con preventDefault

Toda confirmación destructiva usa `AlertDialog` (no `Dialog`). El `AlertDialogAction` lleva `e.preventDefault()` para controlar el cierre manual desde el `onSuccess` de la mutation:

```tsx
<AlertDialogAction
  onClick={(e) => {
    e.preventDefault();
    mutation.mutate(payload, {
      onSuccess: () => onOpenChange(false),
    });
  }}
>
  Confirmar
</AlertDialogAction>
```

**Cuándo colorear el botón en rojo** (`className="bg-destructive ..."`):
- **SÍ** si la acción es **irreversible**: eliminar permanente (`DELETE` hard), anular comprobante.
- **NO** si es **reversible**: desactivar, archivar, soft-delete. El default del `AlertDialogAction` ya transmite seriedad sin gritar.

### 14.4 Botón destructivo en drawer/page footer

Posición y variant según severidad:

```tsx
// Acción REVERSIBLE (desactivar, archivar) — outline + texto rojo, a la izquierda del primario:
<Button
  variant="outline"
  className="text-destructive hover:text-destructive"
  onClick={onDeactivate}
>
  <Power className="h-4 w-4 mr-2" />
  Desactivar
</Button>

// Acción IRREVERSIBLE (eliminar permanente) — variant destructive, único CTA o al extremo derecho:
<Button variant="destructive" onClick={onDelete}>
  <Trash2 className="h-4 w-4 mr-2" />
  Eliminar
</Button>
```

Nunca `variant="destructive"` para acciones reversibles — visualmente es demasiado agresivo y desensibiliza al usuario para los casos genuinamente peligrosos.

### 14.5 Skeleton — filas vs bloques

**Skeleton de tabla** (lista que está cargando):

```tsx
<div className="space-y-2">
  {Array.from({ length: 5 }).map((_, i) => (
    <Skeleton key={i} className="h-10 w-full" />
  ))}
</div>
```

Va FUERA del `<TableBody>`, reemplazando la tabla entera mientras `isLoading`. Cantidad: 5-8 filas (suficiente para sugerir contenido, sin saturar).

**Skeleton de página** (detail/editor cargando):

```tsx
<div className="space-y-4">
  <Skeleton className="h-8 w-48" />     {/* título */}
  <Skeleton className="h-32 w-full" />  {/* cabecera/card */}
  <Skeleton className="h-48 w-full" />  {/* tabla/body */}
</div>
```

Las alturas son proporcionales al contenido esperado — no usar el mismo `h-10` para todo.

### 14.6 Cross-feature: importar hook de otra feature

Permitido (§3 lo habilita). Convención de cómo documentar la dependencia:

```tsx
// Cross-feature: cuentas de detalle activas para el CuentaAutocomplete.
// pageSize 100 = límite del backend (ListarCuentasQueryDto @Max(100)). Si un
// tenant supera 100 cuentas de detalle, migrar a server-side search.
const { data: cuentasData } = useCuentas({
  esDetalle: true,
  activa: true,
  pageSize: 100,
});
```

Reglas:
- **Importar SOLO del hook** (`@/features/<x>/hooks/use-<y>`). NO importar de `api/` ni de `components/` de otra feature.
- **Comentario obligatorio** que empiece con `// Cross-feature:` explicando el motivo.
- **Si la dependencia es un workaround** (ej. `pageSize` hardcodeado por límite del backend), anotar la deuda en el mismo comentario.

### 14.7 Gating de permisos en acciones (UX honesta)

El gating del frontend es **UX, no seguridad**: el candado real es el backend (RBAC → 403,
ver `../CLAUDE.md §4.2/§5`). El frontend solo evita mostrar acciones habilitadas que el backend
rechazaría. **Afordancia: deshabilitar + tooltip, NO ocultar** (el usuario ve que la acción
existe pero entiende por qué no puede usarla). Para nav/rutas sí se oculta/bloquea (es navegación,
no una acción puntual).

**Herramientas (ya existen, NO reinventar):**
- `usePermissions()` (`@/lib/use-permissions`) → `has(p)`, `hasAll([p1, p2])`, `isOwner`.
  Fail-closed: sin data → `false`. Espeja el backend (`hasAllPermissions`); por eso `hasAll` es
  AND y **no hay OR** (el backend tampoco lo tiene para permisos finos).
- `<PermissionButton permission={…} deniedReason="…">` (`@/components/shared/permission-button`):
  botón que se deshabilita + muestra tooltip si falta el permiso. `permission` acepta `string`
  o `string[]` (AND). **Es el camino por defecto para un botón de acción.**
- `<Can permission={…}>` para mostrar/ocultar bloques no-botón (o render-prop `{(allowed) => …}`).
- Las keys viven en `@/lib/permissions.ts` (`PERMISSIONS.*`), que **espeja 1:1** el catálogo
  backend (`backend/src/common/permisos/catalogo.ts`). Nunca strings sueltos.

**Reglas por tipo de control:**
- **Botón real** → `<PermissionButton>` (disable + tooltip).
- **`DropdownMenuItem`** (acciones en menú "…") → NO es un botón: deshabilitar con
  `disabled={!has(permiso) || <condiciones de negocio>}`. Sin tooltip (un menu-item Radix
  deshabilitado no lo dispara de forma fiable; el gris ya es la señal).
- **Acción que el backend exige por SystemRole** (OWNER/ADMIN, ej. reabrir período, impersonar)
  → gatear con `useHasSystemRole(['OWNER','ADMIN'])` / `isOwner`, **no** con un permiso fino.
- **Componente recursivo** (árbol): resolvé el permiso UNA vez en la raíz y propagalo por prop;
  no llames `usePermissions()` por nodo.

**Tests:** el mecanismo (`PermissionButton`/`Can`) ya está cubierto; testeá la **lógica custom**
(menu-items, gating de árbol). Mockeá con `vi.mock('@/lib/use-permissions', async (o) => ({ ...(await o()), usePermissions: () => ({ has, hasAll, isOwner, permissions }) }))`
— el `importOriginal` preserva `usePuedeReabrir`/`useHasSystemRole`. Para alternar permiso por test
usá `vi.hoisted(() => ({ hasMock: vi.fn(() => true) }))`. Si el componente real entra al gate
(fail-closed → tooltip), envolvé el render en `<TooltipProvider>`. Un `DropdownMenuItem`
deshabilitado se assertea con `toHaveAttribute('data-disabled')` (no `toBeDisabled`).

> Smoke manual end-to-end: `docs/smoke-gating.md` (Parte A nav/rutas, Parte B botones).

---

**Fin del documento.** Este archivo se versiona en git; cualquier cambio se discute en PR.
