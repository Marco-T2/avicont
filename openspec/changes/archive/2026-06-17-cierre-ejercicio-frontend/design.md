# Diseño técnico: Cierre del ejercicio fiscal — Frontend

<!--
Última edición: 2026-06-17
Última revisión contra core: 2026-06-17
Owner: frontend-lead
-->

> Change: `cierre-ejercicio-frontend`
> Tipo: frontend-puro (cero backend, cero migración, cero RBAC nuevo)
> Backend dependiente: PR #220 (`266da73`) — YA MERGEADO
> Insumos: [`proposal.md`](./proposal.md) + [`specs/cierre-ejercicio-frontend.md`](./specs/cierre-ejercicio-frontend.md) (fuente de verdad del comportamiento, REQ-CEF-01..11)

---

## 1. Contexto

El backend del cierre del ejercicio genera hasta 3 comprobantes tipo `CIERRE` en BORRADOR
bloqueado (`generadoPorSistema=true`) vía endpoints ya mergeados. Falta la UI que conduzca el
flujo **generar → revisar inline → contabilizar**. Esta feature es frontend-puro: consume
endpoints existentes, no toca backend ni schema ni RBAC.

Molde principal: `frontend/src/features/periodos-fiscales/` (page contenedora + hooks react-query
+ components). Molde de la tabla de líneas: `frontend/src/features/comprobantes/components/comprobante-detail-page.tsx`.

### 1.1 Contrato backend (verificado contra `frontend/src/types/api.ts`)

| Endpoint | Método | Permiso backend | Respuesta | Alias frontend |
|---|---|---|---|---|
| `/api/gestiones/:id/cierre` | GET | `contabilidad.gestiones.read` | `{ gestionId, cierres: [{ id, origenTipo, estado }] }` **sin líneas** | `CierreEjercicioResponse` (`api.ts:577`) ✅ existe |
| `/api/gestiones/:id/cierre` | POST | `contabilidad.gestiones.cerrar` | mismo shape, ≤3 comprobantes BORRADOR (SKIP-on-zero) | mismo alias |
| `/api/comprobantes/:id` | GET | `contabilidad.asientos.read` | `Comprobante` completo con `lineas[]` | `Comprobante` (`api.ts:634`) ✅ existe |
| `/api/comprobantes/:id/contabilizar` | POST | `contabilidad.asientos.post` | `Comprobante` | `Comprobante` |

**Verificación de aliases**: `CierreEjercicioResponse` y `Comprobante` ya existen en `types/api.ts`
(no son `*Dto`; el alias frontend es el nombre sin sufijo). **NO se regenera `api.generated.ts`**.
`EstadoComprobante` está en `api.ts:611` como `const … as const`. No hace falta agregar ningún
alias nuevo.

---

## 2. Decisiones de diseño (las 3 abiertas + ruta)

### D-1 — Ruta `/gestiones/:id/cierre` (CONFIRMADA, gestionId en el path)

La spec ya fija `/gestiones/:id/cierre`. La page lee `useParams<{ id: string }>()` (mismo patrón
que `comprobante-detail-page.tsx`). Gating en `router.tsx`:

```tsx
{
  path: '/gestiones/:id/cierre',
  element: (
    <RequirePermission permission={PERMISSIONS.contabilidad.gestiones.read}>
      <CierreEjercicioPage />
    </RequirePermission>
  ),
}
```

> **Sobre `RequireModule`** (REQ-CEF-01 menciona módulo contabilidad): las rutas de contabilidad
> del router actual (`/comprobantes/:id`, `/eeff/*`, `/periodos-fiscales`) **NO** envuelven con
> `RequireModule` — el gate de módulo se aplica vía el ítem de sidebar (`vertical: 'CONTABILIDAD'`,
> filtrado por `NavList`) y por el hecho de que sin el módulo el usuario no tiene los permisos
> `contabilidad.*`. Para ser fiel al patrón existente (consistencia > teoría), la ruta se gatea
> SOLO con `RequirePermission(gestiones.read)`, igual que sus hermanas. El item de sidebar lleva
> `vertical: 'CONTABILIDAD'`, que es el mecanismo real de gating por vertical en este repo.

El ítem de sidebar navega a la gestión activa por default. Como `nav-items.ts` es una constante
estática (`to` es un string fijo), **no puede** derivar la gestión activa. Solución: el ítem
apunta a una ruta canónica `/gestiones/cierre` (sin id) que monta un componente redirector
`CierreGestionActivaRedirect` → lee `useGestiones`, deriva la más reciente (year desc, misma
lógica que `periodos-fiscales-page.tsx:25-30`) y hace `navigate('/gestiones/<id>/cierre', { replace: true })`;
si no hay gestiones, redirige a `/periodos-fiscales`. Así el sidebar tiene un `to` estático y la
resolución de la gestión vive en un componente.

### D-2 — REQ-CEF-11 conducción desde CerrarGestionButton: **NO se toca el botón** (decisión cerrada)

**Mecanismo elegido: pantalla autodescubridora + ítem de sidebar dedicado.** NO se modifica
`cerrar-gestion-button.tsx`.

Justificación:
- El botón existente (`cerrar-gestion-button.tsx`) tiene un test (`cerrar-gestion-button.test.tsx`)
  con lógica delicada (se renderiza solo si los 12 períodos están CERRADO). Tocarlo introduce
  riesgo de regresión por una mejora que es puramente de conducción/UX.
- El ítem de sidebar "Cierre del ejercicio" en la sección Contabilidad ya hace el flujo
  autodescubridor: el contador lo ve junto a los reportes EEFF, antes de ir a "Períodos fiscales"
  a cerrar la gestión.
- Si el backend rechaza "Cerrar gestión" porque faltan cierres contabilizados, el toast de error
  ya existente (`mensajePeriodosFiscales(err)`) mapeará el código del backend a un mensaje en
  español accionable (se agrega ese código al helper — ver §6). El mensaje dice explícitamente
  que hay que contabilizar el cierre del ejercicio primero.

**Consecuencia**: REQ-CEF-11 se satisface por (a) el ítem de sidebar + (b) un CTA/banner en la
propia pantalla de cierre en estado TODOS_CONTABILIZADO que enlaza a `/periodos-fiscales` (donde
vive `CerrarGestionButton`). `cerrar-gestion-button.test.tsx` **no se toca** → cero riesgo de
regresión.

### D-3 — Estado PARCIALMENTE_CONTABILIZADO: comunicación visual propia (mínima)

Se resuelve como una variante del estado EN_BORRADOR (mismos cards), con dos diferencias visuales:
- Cada `AsientoCierreCard` ya muestra su badge de estado real (`BORRADOR` vs `CONTABILIZADO`), así
  que la mezcla es visible per-card sin trabajo extra.
- El botón "Regenerar" se deshabilita (tooltip: "No se puede regenerar: al menos un asiento de
  cierre ya está contabilizado.") — el backend devolvería 409.
- El botón "Contabilizar cierre" sigue habilitado y al reintentar es **resumable** (salta los
  CONTABILIZADO, postea solo los BORRADOR).
- Un aviso inline blando (banner `bg-muted`) arriba de los cards: "El cierre quedó parcialmente
  contabilizado. Volvé a contabilizar para completar los asientos pendientes."

No necesita un empty-state propio ni una pantalla separada. Es EN_BORRADOR + Regenerar deshabilitado
+ banner informativo.

### D-4 — Los 3 GET extra: `useComprobante(cierre.id)` por card, queryKey `['comprobantes','detail',id]`

Cada `AsientoCierreCard` invoca el hook cross-feature `useComprobante(cierre.id)` de
`@/features/comprobantes/hooks/use-comprobante` para traer las líneas (el `GET /cierre` solo trae
el esqueleto). El queryKey REAL verificado en el código es **`['comprobantes', 'detail', id]`**
(NO `'detalle'`). Esto da dedupe + cache: si el usuario navega al detalle del comprobante por otra
vía, comparte cache. Con ≤3 cards son ≤3 requests, aceptable (documentado como riesgo bajo).

Import cross-feature con comentario obligatorio (§14.6):
```tsx
// Cross-feature: detalle del comprobante de cierre para renderizar sus líneas.
// El GET /api/gestiones/:id/cierre solo trae el esqueleto (id, origenTipo, estado),
// no las líneas. queryKey ['comprobantes','detail',id] → dedupe/cache con el detalle de comprobante.
const { data: comprobante, isLoading, isError } = useComprobante(cierre.id);
```

---

## 3. Árbol de archivos de la feature

```
frontend/src/features/cierre-ejercicio/
├── api/
│   ├── get-cierre.ts          GET /api/gestiones/:id/cierre → CierreEjercicioResponse
│   └── generar-cierre.ts      POST /api/gestiones/:id/cierre → CierreEjercicioResponse
│
├── hooks/
│   ├── use-cierre.ts          useQuery(['cierre-ejercicio', gestionId]) envolviendo get-cierre
│   ├── use-generar-cierre.ts  useMutation generar-cierre; invalida ['cierre-ejercicio', gestionId]
│   └── use-contabilizar-cierre.ts  mutation orquestadora secuencial (ver §5)
│
├── components/
│   ├── cierre-ejercicio-page.tsx       (en pages/ — ver abajo)
│   ├── asiento-cierre-card.tsx         preview inline de UN comprobante (cabecera + tabla líneas)
│   ├── asiento-cierre-card.test.tsx
│   ├── contabilizar-cierre-bar.tsx     botón único "Contabilizar cierre" + progreso por asiento
│   ├── contabilizar-cierre-bar.test.tsx
│   ├── cierre-confirmado-banner.tsx    banner estado TODOS_CONTABILIZADO + CTA a /periodos-fiscales
│   └── cierre-gestion-activa-redirect.tsx  resuelve gestión activa → redirige a /gestiones/:id/cierre
│
├── pages/
│   ├── cierre-ejercicio-page.tsx       page contenedora (orquesta hooks + estados derivados)
│   └── cierre-ejercicio-page.test.tsx
│
└── lib/
    ├── labels-origen-cierre.ts         mapa origenTipo → label español (función pura)
    ├── labels-origen-cierre.test.ts
    └── derivar-estado-cierre.ts        cierres[] → 'SIN_CIERRES'|'EN_BORRADOR'|'PARCIALMENTE_CONTABILIZADO'|'TODOS_CONTABILIZADO' (función pura)
        derivar-estado-cierre.test.ts
```

Responsabilidades clave:

- **`api/get-cierre.ts`** — `getCierre(gestionId): Promise<CierreEjercicioResponse>` vía `api.get`.
- **`api/generar-cierre.ts`** — `generarCierre(gestionId): Promise<CierreEjercicioResponse>` vía `api.post`.
- **`hooks/use-cierre.ts`** — `useQuery({ queryKey: ['cierre-ejercicio', gestionId], queryFn, enabled: gestionId !== undefined })`.
- **`hooks/use-generar-cierre.ts`** — `useMutation({ mutationFn: generarCierre, onSuccess: () => qc.invalidateQueries({ queryKey: ['cierre-ejercicio', gestionId] }) })`. Se usa para "Generar" y "Regenerar" (mismo endpoint idempotente).
- **`hooks/use-contabilizar-cierre.ts`** — ver §5; expone `mutate(cierres)`, `isPending`, y un estado de progreso por comprobante.
- **`components/asiento-cierre-card.tsx`** — presentacional + un `useComprobante(cierre.id)` propio. Clona la tabla de líneas read-only de `comprobante-detail-page.tsx` (6 columnas, `MontoCell`, lookup `useCuentas`/`useContactos` con cap pageSize 100/50 y fallback a UUID). Cabecera: label `origenTipo`, glosa, badge estado, totales, fecha. Skeleton mientras carga; banner inline si error (Anti-F-13, NO toast).
- **`components/contabilizar-cierre-bar.tsx`** — un `PermissionButton` (`contabilidad.asientos.post`) + render del progreso. `disabled={isPending}` (Anti-F-07).
- **`pages/cierre-ejercicio-page.tsx`** — contenedora: `useParams`, `useCierre`, deriva estado con `derivarEstadoCierre`, ramifica los 4 estados + loading + 404. Maneja `onError` de la mutation con `toast.error(mensajeCierreEjercicio(err))`.

> Nota: `cierre-ejercicio-page.tsx` vive en `pages/` (página-contenedor, §2 frontend). Los demás
> componentes en `components/`. Componentes importan del hook, nunca de `api/*` (§8).

---

## 4. Máquina de estados de la pantalla

Estado DERIVADO de `useCierre(gestionId).data.cierres` en cada render (función pura
`derivarEstadoCierre`, sin Zustand, sin `useState` para el estado de pantalla):

```ts
// lib/derivar-estado-cierre.ts
export type EstadoCierrePantalla =
  | 'SIN_CIERRES'
  | 'EN_BORRADOR'
  | 'PARCIALMENTE_CONTABILIZADO'
  | 'TODOS_CONTABILIZADO';

export function derivarEstadoCierre(
  cierres: { estado: EstadoComprobante }[],
): EstadoCierrePantalla {
  if (cierres.length === 0) return 'SIN_CIERRES';
  const contabilizados = cierres.filter((c) => c.estado === 'CONTABILIZADO').length;
  if (contabilizados === 0) return 'EN_BORRADOR';
  if (contabilizados === cierres.length) return 'TODOS_CONTABILIZADO';
  return 'PARCIALMENTE_CONTABILIZADO';
}
```

| Estado | Render |
|---|---|
| (query `isLoading`) | Skeleton de página (§14.5): título + cards skeleton. Sin empty state ni botones (REQ-CEF-08). |
| (query `isError` / 404) | Banner inline de error + botón "Volver a gestiones" → `/periodos-fiscales` (Anti-F-13, REQ-CEF-07). |
| `SIN_CIERRES` | Empty state de página (§13.4): ícono `BookX`, título, copy, `PermissionButton(gestiones.cerrar)` "Generar asientos de cierre" (REQ-CEF-02/03). |
| `EN_BORRADOR` | N `AsientoCierreCard` (N = `cierres.length`, ≤3) + botón "Regenerar" (gestiones.cerrar) + `ContabilizarCierreBar` (REQ-CEF-04/05). |
| `PARCIALMENTE_CONTABILIZADO` | Igual que EN_BORRADOR + banner `bg-muted` informativo + "Regenerar" deshabilitado con tooltip (D-3, REQ-CEF-03/05). |
| `TODOS_CONTABILIZADO` | N cards con badge CONTABILIZADO + número correlativo + `CierreConfirmadoBanner` (CTA "Cerrar gestión" → `/periodos-fiscales`). "Regenerar" deshabilitado, "Contabilizar" oculto (REQ-CEF-06). |

El progreso de la contabilización secuencial SÍ usa `useState` local en `useContabilizarCierre` /
`ContabilizarCierreBar` (es UI state local, no server state — §4 frontend).

---

## 5. Flujo de contabilización secuencial (REQ-CEF-05)

`useContabilizarCierre(gestionId)` expone una mutación orquestadora que postea los ≤3 cierres
**uno por uno, en orden**, resumable y con parada temprana.

### 5.1 Shape del estado de progreso

```ts
type EstadoPaso = 'pendiente' | 'contabilizando' | 'contabilizado' | 'error';

interface ProgresoPaso {
  comprobanteId: string;
  estado: EstadoPaso;
  error?: string;   // mensaje en español si estado === 'error'
}
```

`useContabilizarCierre` mantiene `progreso: ProgresoPaso[]` en `useState` local y lo expone junto
con `contabilizar(cierres)` e `isPending`.

### 5.2 Algoritmo (for...of + await, NO Promise.all)

```ts
async function contabilizar(cierres: { id: string; estado: EstadoComprobante }[]) {
  setIsPending(true);
  // Inicializar progreso: los ya CONTABILIZADO arrancan en 'contabilizado'.
  setProgreso(cierres.map((c) => ({
    comprobanteId: c.id,
    estado: c.estado === 'CONTABILIZADO' ? 'contabilizado' : 'pendiente',
  })));

  for (const cierre of cierres) {
    if (cierre.estado === 'CONTABILIZADO') continue;   // resumable: saltar ya posteados
    marcarPaso(cierre.id, 'contabilizando');
    try {
      await contabilizarComprobante(cierre.id);        // cross-feature api (vía el hook fachada)
      marcarPaso(cierre.id, 'contabilizado');
    } catch (err) {
      marcarPaso(cierre.id, 'error', mensajeComprobantes(err));
      setIsPending(false);
      return { ok: false, falloEn: cierre.id };         // PARADA TEMPRANA
    }
  }

  // Éxito total: invalidar para refrescar estados desde el backend.
  qc.invalidateQueries({ queryKey: ['cierre-ejercicio', gestionId] });
  qc.invalidateQueries({ queryKey: ['comprobantes'] });
  setIsPending(false);
  return { ok: true };
}
```

- **NO `Promise.all`**: se necesita orden y parada en el primer fallo.
- **Resumable**: los CONTABILIZADO se saltan; reintentar tras partial-failure continúa desde el
  que quedó en BORRADOR.
- **Anti-F-07**: `ContabilizarCierreBar` pasa `disabled={isPending}` al `PermissionButton`; un
  segundo click durante `isPending` no dispara otra secuencia.
- **Invalidación**: al éxito total, invalida `['cierre-ejercicio', gestionId]` (refresca estados de
  los cierres) + `['comprobantes']` (los detalles de cada card se refrescan; el queryKey de cada
  card es `['comprobantes','detail',id]`, hijo de `['comprobantes']`).

### 5.3 Reusar la API de comprobantes

Para el POST de contabilizar se reusa `contabilizarComprobante` de
`@/features/comprobantes/api/contabilizar-comprobante`. **Excepción a la regla "componente importa
solo del hook"**: el import de `api/*` cross-feature ocurre **dentro de `use-contabilizar-cierre.ts`**
(que es un hook), no en un componente — cumple §8 ("el archivo `hooks/use-*.ts` es el único lugar
donde `api/*.ts` se importa"). El hook `useContabilizarComprobante` de comprobantes no se reusa
porque su `onSuccess`/invalidación está pensado para un solo comprobante; la orquestación secuencial
necesita control fino del loop. Se llama la función `api` directamente desde nuestro hook.

---

## 6. Mapeo de errores

Se crea un helper dedicado **`mensajeCierreEjercicio(err)`** en `frontend/src/lib/error-messages.ts`
(mismo patrón switch-por-code que `mensajePeriodosFiscales` / `mensajeComprobantes`), con los
códigos `CIERRE_EJERCICIO_*` de la spec y fallback a `p.message`. Para los errores del POST de
contabilizar se reusa `mensajeComprobantes` (códigos `COMPROBANTE_*`).

Además, al helper existente **`mensajePeriodosFiscales`** se le agrega el código que el backend
devuelve al rechazar "Cerrar gestión" cuando faltan cierres contabilizados (REQ-CEF-11, D-2), de
modo que el toast del `CerrarGestionButton` (que ya usa `mensajePeriodosFiscales`) guíe al contador
hacia el cierre del ejercicio sin tocar el componente.

> Los códigos exactos (`CIERRE_EJERCICIO_PERIODO_NO_LISTO`, `..._PARCIALMENTE_CONTABILIZADO`,
> `..._CUENTA_DESTINO_FALTANTE`, etc.) se confirman contra los `DomainError` del backend mergeado
> al implementar; la spec lista los esperados. Si un código no coincide, se ajusta el switch y se
> cae al `message` del backend (ya en español) mientras tanto.

---

## 7. Cambios a archivos existentes

| Archivo | Cambio |
|---|---|
| `frontend/src/routes/router.tsx` | Agregar ruta `/gestiones/:id/cierre` (RequirePermission `gestiones.read` → `CierreEjercicioPage`) + ruta `/gestiones/cierre` (RequirePermission `gestiones.read` → `CierreGestionActivaRedirect`). Imports lazy/eager consistentes con el resto del archivo. |
| `frontend/src/components/nav-items.ts` | Agregar ítem en la sección `contabilidad` (`kind: 'modulo'`): `{ to: '/gestiones/cierre', label: 'Cierre del ejercicio', icon: <Lucide>, requiredPermission: PERMISSIONS.contabilidad.gestiones.read, vertical: 'CONTABILIDAD' }`. Posición sugerida: después de "Estado de Flujo de Efectivo" / antes de "Plan de cuentas" (junto a los reportes EEFF). Ícono candidato: `Lock`, `BookCheck` o `Archive` (elegir uno no usado ya en la sección). |
| `frontend/src/lib/error-messages.ts` | Nuevo `export function mensajeCierreEjercicio(err)` con códigos `CIERRE_EJERCICIO_*` + reuso de `mensajeComprobantes` para contabilizar. Agregar 1 caso a `mensajePeriodosFiscales` para el rechazo de cierre de gestión por cierres no contabilizados. |
| `frontend/src/features/periodos-fiscales/components/cerrar-gestion-button.tsx` | **NO se toca** (D-2). |
| `frontend/src/types/api.ts` | **NO se toca** — `CierreEjercicioResponse` y `Comprobante` ya existen. |
| `frontend/src/types/api.generated.ts` | **NO se regenera** — backend ya mergeado, tipos presentes. |

---

## 8. Plan de tests (Vitest + @testing-library/react, al lado del código)

Alineado con la sección "Tests requeridos" de la spec.

### `lib/labels-origen-cierre.test.ts`
- Los 3 mapeos (`CIERRE_GASTOS`/`CIERRE_INGRESOS`/`CIERRE_RESULTADO`) → labels español.
- Fallback para valor desconocido (devuelve el original o genérico, nunca lanza).

### `lib/derivar-estado-cierre.test.ts`
- `[]` → `SIN_CIERRES`. Todos BORRADOR → `EN_BORRADOR`. Mezcla → `PARCIALMENTE_CONTABILIZADO`.
  Todos CONTABILIZADO → `TODOS_CONTABILIZADO`. Caso ≤3 (SKIP-on-zero) cubierto.

### `components/asiento-cierre-card.test.tsx`
- Cabecera con label de `origenTipo`, glosa, badge de estado.
- Skeleton mientras `useComprobante` (mockeado) está `isLoading`.
- Tabla: muestra código·nombre de cuenta, monto Debe/Haber.
- Monto string preservado (no recalculado) — assertear el string crudo en el DOM.
- Fecha formateada sin UTC (`"2026-12-31"` → `"31/12/2026"`).
- Banner inline (no toast) si `useComprobante` da error.
- Mock de `useComprobante`, `useCuentas`, `useContactos` con `vi.mock`.

### `components/contabilizar-cierre-bar.test.tsx`
- Botón habilitado con `contabilidad.asientos.post`; disabled + tooltip sin permiso (envolver en `<TooltipProvider>`).
- Botón disabled mientras `isPending`.
- Render del progreso: pendiente → contabilizando → contabilizado / error.
- Mock de permisos: `vi.mock('@/lib/use-permissions', async (o) => ({ ...(await o()), usePermissions: () => ({ has, hasAll, isOwner, permissions }) }))` (§14.7).

### `pages/cierre-ejercicio-page.test.tsx`
- `SIN_CIERRES` → empty state + botón "Generar"; disabled sin `gestiones.cerrar`.
- `EN_BORRADOR` → N cards (probar N=2 por SKIP-on-zero y N=3).
- `PARCIALMENTE_CONTABILIZADO` → "Regenerar" disabled + banner informativo.
- `TODOS_CONTABILIZADO` → banner de confirmación + CTA "Cerrar gestión".
- 404 → banner de error + botón "Volver a gestiones".
- Skeleton durante carga inicial.
- Mock de `useCierre`, `useGenerarCierre`, `useContabilizarCierre`, permisos.

---

## 9. Riesgos y mitigaciones

1. **3 GET extra (`useComprobante` por card)**: ≤3 requests, dedupe por queryKey `['comprobantes','detail',id]`. Riesgo bajo; documentado en el card con comentario `// Cross-feature:`.
2. **Partial-failure al contabilizar**: el flujo es resumable (salta CONTABILIZADO) y reporta cuál falló. "Regenerar" se deshabilita si hay algún CONTABILIZADO (backend 409). Banner informativo en estado parcial (D-3).
3. **Códigos de error `CIERRE_EJERCICIO_*` exactos**: la spec lista los esperados pero el nombre real lo fija el backend mergeado; mientras no coincidan, el switch cae al `p.message` del backend (ya en español). Confirmar en apply contra los `DomainError` reales.
4. **`RequireModule` ausente en la ruta**: decisión consciente (D-1) por consistencia con las rutas hermanas de contabilidad; el gate real por vertical es el ítem de sidebar + la ausencia de permisos `contabilidad.*` sin el módulo. Si el equipo decide endurecer rutas de contabilidad con `RequireModule`, hacerlo de forma transversal (todas las rutas), no solo esta.
5. **Ícono de sidebar**: elegir uno no repetido en la sección Contabilidad (ya usa Scale, ListChecks, Columns3, TrendingUp, Landmark, Droplet, BookText, BookMarked, BookOpen, FileText, Contact, FileStack). Candidatos libres: `Lock`, `BookCheck`, `Archive`, `CalendarCheck`.
6. **Conducción REQ-CEF-11 sin tocar el botón**: cero riesgo de regresión en `cerrar-gestion-button.test.tsx` (D-2). El trade-off es que la guía depende del ítem de sidebar + el mensaje de error del toast; aceptable y reversible.
