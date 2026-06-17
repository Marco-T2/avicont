# Propuesta: Cierre del ejercicio fiscal — Frontend

> Change: `cierre-ejercicio-frontend`
> Tipo: **frontend-puro** (cero backend, cero migración, cero RBAC nuevo)
> Backend dependiente: YA MERGEADO (PR #220, commit `266da73`, change `cierre-ejercicio`)

## Why (intent / motivación)

El backend del cierre del ejercicio fiscal boliviano ya está construido y mergeado: genera
hasta 3 comprobantes tipo `CIERRE` (cerrar gastos/costos, cerrar ingresos, trasladar el
resultado a RESULTADOS ACUMULADOS), idempotente, en estado BORRADOR bloqueado
(`generadoPorSistema=true`). Hoy **NO hay ninguna forma de operar ese flujo desde la UI**: el
contador no puede generar los asientos de cierre, no puede revisarlos antes de comprometerlos,
ni puede contabilizarlos. La única vía sería Swagger o `curl`, inaceptable para el usuario
final (contadores de PyMEs bolivianas).

Además, el botón existente `CerrarGestionButton` ahora exige —por la lógica del backend— que
los 3 comprobantes de cierre estén CONTABILIZADO antes de poder cerrar la gestión. Sin una
pantalla que conduzca ese paso previo, el botón "Cerrar gestión" quedaría en un callejón sin
salida: visible (12 períodos cerrados) pero rechazado por el backend con un error que el usuario
no sabe cómo resolver.

Este change cierra esa brecha: una **pantalla dedicada** que guía al contador por el flujo
generar → revisar inline → contabilizar, y que enlaza naturalmente con el cierre de gestión ya
existente.

## What changes (scope acotado)

Feature nueva: `frontend/src/features/cierre-ejercicio/` siguiendo Screaming Architecture (mismo
molde que `periodos-fiscales/`).

### Archivos NUEVOS por capa

**`api/`** (funciones puras de request, 1 por endpoint — todos endpoints existentes):
- `get-cierre.ts` → `GET /api/gestiones/:id/cierre` → `CierreEjercicioResponse` (alias ya existe en `types/api.ts:577`).
- `generar-cierre.ts` → `POST /api/gestiones/:id/cierre` → `CierreEjercicioResponse`.
- (NO se crea api para `GET /api/comprobantes/:id` ni `POST /api/comprobantes/:id/contabilizar`: ya existen en `features/comprobantes/api/` y se consumen vía cross-feature import del hook, §14.6.)

**`hooks/`** (wrappers TanStack Query/Mutation):
- `use-cierre.ts` → `useQuery(['cierre-ejercicio', gestionId])` envolviendo `get-cierre`.
- `use-generar-cierre.ts` → `useMutation` envolviendo `generar-cierre`; `onSuccess` invalida `['cierre-ejercicio', gestionId]`.
- `use-contabilizar-cierre.ts` → mutation orquestadora que postea los 3 comprobantes secuencialmente (ver Approach). Reusa `contabilizarComprobante` (cross-feature) e invalida `['cierre-ejercicio', gestionId]` + `['comprobantes']`.

**`components/`** (presentacionales, reciben props):
- `cierre-ejercicio-page.tsx` (page-contenedor que orquesta los 3 estados).
- `asiento-cierre-card.tsx` — preview inline de UN comprobante de cierre: cabecera (label del `origenTipo`, glosa, totales, estado badge) + tabla de líneas read-only. **Clon adaptado** de la tabla de líneas de `comprobante-detail-page.tsx` (6 columnas: # | Cuenta | Debe | Haber | Glosa | Contacto, con `MontoCell` + lookup `useCuentas`/`useContactos`).
- `contabilizar-cierre-bar.tsx` — el único botón "Contabilizar cierre" + render del progreso por asiento (pendiente / contabilizando / contabilizado / error).
- (posible) `estado-cierre-badge.tsx` si no se reusa `EstadoComprobanteBadge` cross-feature.

**`lib/`** (puro): `labels-origen-cierre.ts` — mapa `origenTipo` → label español (`CIERRE_GASTOS` → "Cierre de gastos y costos", etc.).

**`pages/`**: si se separa page de components, `cierre-ejercicio-page.tsx` vive en `pages/`.

### Archivos que se TOCAN (modificación, no creación)

- `frontend/src/routes/router.tsx` — agregar la ruta dedicada (ver Approach §ruta), gateada por `RequirePermission` con `PERMISSIONS.contabilidad.gestiones.read`.
- `frontend/src/components/nav-items.ts` — agregar ítem "Cierre del ejercicio" en la sección Contabilidad (`kind: 'modulo'`), gateado por permiso, después de los reportes EEFF / antes de Plan de cuentas (decisión de orden a refinar en spec).
- `frontend/src/features/periodos-fiscales/components/cerrar-gestion-button.tsx` — **toque mínimo**: cuando los 12 períodos están cerrados pero el cierre del ejercicio aún no está contabilizado, ofrecer un enlace/CTA hacia la pantalla de cierre (en vez de dejar el botón "Cerrar gestión" que el backend rechazaría). Alternativa de menor acoplamiento: no tocar el botón y resolver la conducción enteramente desde la pantalla de cierre + un hint. **Decisión final en design/spec.**
- `frontend/src/lib/error-messages.ts` — agregar al helper `mensajePeriodosFiscales` (o uno dedicado) los códigos `CIERRE_EJERCICIO_*` del backend (p. ej. `CIERRE_YA_PARCIALMENTE_CONTABILIZADO`) mapeados a mensajes en español. Reusar `mensajeComprobantes` para los errores de contabilizar (`COMPROBANTE_NO_EN_BORRADOR`, partida-doble-no-cuadra).
- `frontend/src/types/api.ts` — SOLO si falta algún alias. `CierreEjercicioResponse` y `Comprobante` ya existen (`api.ts:577` y `api.ts:634`). **NO se regenera `api.generated.ts`** (el backend ya está mergeado y los tipos están presentes).

### Tests nuevos (al lado del código, Vitest + Testing Library)
- `asiento-cierre-card.test.tsx`, `contabilizar-cierre-bar.test.tsx`, `cierre-ejercicio-page.test.tsx` (los 3 estados), `labels-origen-cierre.test.ts`. Gating con el patrón de mock de `@/lib/use-permissions` (§14.7).

## Approach (alto nivel)

### Decisión de ruta (justificada)

**Ruta elegida: `/gestiones/:id/cierre`** (la gestión va en el path, NO query param).

Justificación contra el router actual (`router.tsx`):
- El cierre es **una operación sobre una gestión concreta** (genera comprobantes ligados a `gestionId`, los endpoints son sub-recursos `/api/gestiones/:id/cierre`). Modelar el `gestionId` en el path es consistente con el contrato REST y con el patrón ya usado para `/comprobantes/:id` y `/comprobantes/:id/editar` (recurso identificado en el segmento).
- Evita el problema de "qué gestión está seleccionada" que tendría una ruta plana `/cierre` (necesitaría leer estado de la página de períodos, acoplándose). Con `:id` la pantalla es self-contained y enlazable/bookmarkeable.
- La page lee `useParams<{ id: string }>()` (mismo patrón que `comprobante-detail-page.tsx`) y arranca el flujo sin depender de estado externo.
- El ítem de sidebar "Cierre del ejercicio" navega a la gestión activa por default (más reciente, misma derivación `year desc` que ya hace `periodos-fiscales-page.tsx:25-30`); si no hay gestión, muestra empty state.

Descartado `/periodos-fiscales/cierre` (sin `:id`): forzaría a propagar la gestión seleccionada por estado o query param, contradiciendo el self-containment.

### Flujo de los 3 estados (resuelto, sin preguntar)

La page consume `useCierre(gestionId)` y derive el estado:

1. **Sin cierres generados** (`cierres` vacío) → empty state de página (§13.4) con CTA `PermissionButton` "Generar asientos de cierre" (permiso `contabilidad.gestiones.cerrar`). Click → `useGenerarCierre`. Si el backend rechaza por gate previo (gestión no cerrada, períodos no listos) → toast con `mensajePeriodosFiscales(err)`.

2. **Cierres en BORRADOR** → para cada uno de los (≤3) `cierres`, un `AsientoCierreCard` que hace su **propio** `useComprobante(cierre.id)` (cross-feature) para traer las líneas y renderizar el preview inline completo (cabecera + tabla). Esto implica los **3 GET extra** (uno por card). Acciones:
   - "Regenerar" (`PermissionButton`, `useGenerarCierre`): re-ejecuta el POST idempotente (el backend borra+recrea los BORRADOR).
   - "Contabilizar cierre" (`ContabilizarCierreBar`).

3. **Todos CONTABILIZADO** → estado "cierre contabilizado" (los 3 cards muestran número correlativo + badge CONTABILIZADO) + CTA/enlace hacia "Cerrar gestión" (que conduce al `CerrarGestionButton` existente, cuyo gate del backend ahora se satisface).

> SKIP-on-zero: el backend puede devolver **menos de 3** comprobantes (omite el que daría líneas vacías). La page itera sobre `cierres` tal cual viene — nunca asume exactamente 3.

### Contabilizar los 3 secuencialmente (resumable, partial-failure)

`useContabilizarCierre` recibe la lista de `cierres` y postea **uno por uno en orden**:
- Salta los que ya están `CONTABILIZADO` (idempotente / resumable: si un intento previo posteó 2 de 3 y falló el 3°, reintentar continúa desde el 3°).
- Mantiene un estado de progreso por comprobante (`pendiente | contabilizando | contabilizado | error`) que `ContabilizarCierreBar` renderiza.
- **Para en el primer fallo** y reporta cuáles se postearon y cuál falló (toast + estado visual). No usa `Promise.all` (necesita orden y parada temprana) — un loop `for...of` con `await`.
- El botón disparador es **`disabled={mutation.isPending}`** (Anti-F-07 crítico: evita doble-post de comprobantes). Único botón, no uno por asiento.

### Convenciones aplicadas
- Money = string formateado sin recalcular vía `MontoCell` (§4.5). FechaContable = `YYYY-MM-DD` sin UTC vía `formatearFechaContable` (§4.6).
- Server state SOLO en TanStack Query, nunca Zustand. Componentes importan del hook, nunca de `api/*` directo.
- Gating fail-closed: `PermissionButton`/`Can` con keys de `PERMISSIONS.*`. Generar/regenerar/contabilizar → permisos `contabilidad.gestiones.cerrar` y `contabilidad.asientos.post` (el backend es la verdad; el frontend es UX honesta).
- Estilos: variables semánticas, dark mode, `cn()`. Textos en español.

## Out of scope (explícito)

- **Backend**: cero cambios. Endpoints, servicio, dominio del cierre ya mergeados (PR #220). No se toca `backend/`.
- **Migración / schema**: ninguna.
- **RBAC / permisos nuevos**: ninguno. Se reusan `contabilidad.gestiones.{cerrar,read}` y `contabilidad.asientos.post`, ya en catálogo y en `PERMISSIONS.*`.
- **Regenerar `api.generated.ts`**: no. Los tipos ya están dumpeados desde el backend mergeado.
- **El botón "Cerrar gestión"** (`CerrarGestionButton`): NO se reimplementa — ya existe y funciona. A lo sumo se le agrega un enlace/CTA de conducción hacia la pantalla de cierre (toque mínimo, decisión en design).
- **El flujo de reapertura de período** (corrección post-cierre): fuera de scope, ya existe.
- **Asientos #4 (cierre de balance) y #5 (apertura)**: diferidos en el backend mismo; no aplican.

## Risks

1. **3 GET extra (`GET /api/comprobantes/:id` por card)**: cada `AsientoCierreCard` hace su propio fetch para traer las líneas (el `GET .../cierre` solo trae el esqueleto sin líneas). Mitigación: TanStack Query dedupe + cache por `['comprobantes','detail',id]`; las cards solo se montan en estado BORRADOR/CONTABILIZADO (≤3 requests, aceptable). Riesgo bajo, documentado.
2. **Partial-failure al contabilizar**: si falla a mitad (p. ej. partida-doble-no-cuadra en el 3°), quedan 2 CONTABILIZADO y 1 BORRADOR. Mitigación: el flujo es resumable (salta los ya posteados al reintentar) y reporta explícitamente cuáles posteó. Un comprobante de cierre CONTABILIZADO ya no puede regenerarse (el backend devuelve 409 `CIERRE_YA_PARCIALMENTE_CONTABILIZADO` ante regenerar) — el frontend debe deshabilitar "Regenerar" si algún cierre ya está CONTABILIZADO y mostrar el motivo.
3. **Gating fail-closed**: si `usePermissions()` no tiene data, todo se deshabilita (correcto). Riesgo: que un permiso mal elegido (p. ej. usar `asientos.post` donde el backend exige `gestiones.cerrar` para generar) muestre un botón habilitado que el backend rechaza. Mitigación: alinear cada acción al permiso que el backend realmente valida (generar/regenerar → `gestiones.cerrar`; contabilizar → `asientos.post`), verificable contra el contrato del backend.
4. **Conducción desde períodos**: si se toca `CerrarGestionButton`, riesgo de regresión en su test existente (`cerrar-gestion-button.test.tsx`). Mitigación: preferir el toque mínimo (enlace/hint) o resolver la conducción enteramente en la pantalla de cierre; decisión en design con su test.
5. **Empty/error states de gestión inexistente**: ruta `/gestiones/:id/cierre` con `:id` inválido → la query 404. Manejar con banner inline + botón "Volver" (Anti-F-13, mismo patrón que `comprobante-detail-page.tsx`), nunca toast en el cuerpo del render.
