# Tasks — Cierre del Ejercicio Fiscal (Frontend)

<!--
Change: cierre-ejercicio-frontend
Backend dependiente: PR #220 (266da73) — YA MERGEADO
Strict TDD Mode: activo
-->

> Orden: de adentro hacia afuera. Lo puro y sin dependencias primero.
> TDD estricto: escribir test → ver fallar → implementar → verde.
> Cada batch es un bloque independiente; dentro de cada batch los items
> pueden tomarse en orden o en paralelo según convenga.

---

## PRE-FLIGHT — Verificación de contratos (hacer ANTES de codear)

- [x] **PF-1** Confirmar nombre exacto del componente de gating de ruta en
  `frontend/src/routes/router.tsx` → verificado: `RequirePermission` (import desde
  `@/components/shared/require-permission`). **No hay `RequireModule` en rutas de
  contabilidad** — se confirma el patrón: gating solo por permiso, el módulo se
  filtra vía ítem de sidebar con `vertical: 'CONTABILIDAD'`. (REQ-CEF-01, D-1)

- [x] **PF-2** Confirmar hook `useComprobante` y su queryKey en
  `frontend/src/features/comprobantes/hooks/use-comprobante.ts` → verificado:
  `queryKey: ['comprobantes', 'detail', id]` (NO `'detalle'`). Hook acepta
  `id: string`, `enabled: id !== ''`. (D-4)

- [x] **PF-3** Confirmar función `contabilizarComprobante` en
  `frontend/src/features/comprobantes/api/contabilizar-comprobante.ts` →
  verificado: `export async function contabilizarComprobante(id: string): Promise<Comprobante>`.
  Se importa directamente desde `use-contabilizar-cierre.ts` (no el hook envoltorio).

- [x] **PF-4** Confirmar keys en `frontend/src/lib/permissions.ts`:
  - `PERMISSIONS.contabilidad.gestiones.read` → `'contabilidad.gestiones.read'` ✅
  - `PERMISSIONS.contabilidad.gestiones.cerrar` → `'contabilidad.gestiones.cerrar'` ✅
  - `PERMISSIONS.contabilidad.asientos.post` → `'contabilidad.asientos.post'` ✅

- [x] **PF-5** Confirmar `DomainError` codes del cierre en el backend (ya mergeado PR #220):
  - `CIERRE_EJERCICIO_GESTION_NO_ENCONTRADA` (404) — `CierreGestionNoEncontradaError`
  - `CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO` (409) — `CierreYaParcialmenteContabilizadoError`
  - `CIERRE_EJERCICIO_PERIODO_NO_LISTO` (409) — `CierrePeriodoNoListoError`
  - `CIERRE_EJERCICIO_SIN_MOVIMIENTO` (422) — `CierreSinResultadoError`
  - `CIERRE_EJERCICIO_CUENTA_DESTINO_FALTANTE` (422) — `CierreConfigCuentaFaltanteError`
  - `CIERRE_EJERCICIO_GESTION_YA_CERRADA` — reexportado desde `comprobante-errors.ts`
  - Código que emite `cerrar()` de gestión cuando hay cierres pendientes →
    verificado: también lanza `CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO`
    (en `gestiones-fiscales.service.ts:121`). **No existe un code separado
    `GESTION_CON_CIERRES_NO_CONTABILIZADOS`** — el mismo code se usa para
    REQ-CEF-11. Agregar este case a `mensajePeriodosFiscales` también.

- [x] **PF-6** Confirmar ícono libre para el ítem de sidebar en la sección
  Contabilidad. Íconos ya usados (verificar en `nav-items.ts`): `Scale`,
  `ListChecks`, `Columns3`, `TrendingUp`, `Landmark`, `Droplet`, `BookText`,
  `BookMarked`, `BookOpen`, `FileText`, `Contact`, `FileStack`. **Candidato
  elegido: `BookCheck`** (no importado actualmente). Verificar antes de usar.

- [x] **PF-7** Confirmar que `useGestiones` de
  `@/features/periodos-fiscales/hooks/use-gestiones` es importable en
  `CierreGestionActivaRedirect` sin violar §14.6 (cross-feature con comentario).
  Verificado: es el mismo patrón de `periodos-fiscales-page.tsx:14`. El
  redirector es parte de la feature `cierre-ejercicio`, importar
  `useGestiones` cross-feature es válido con el comentario obligatorio.

---

## Batch 1 — Lib puro (funciones + tests)

> Sin React, sin red, 100% testeable con Vitest sin setup de DOM.
> TDD estricto: escribir test → ver fallar → implementar.

- [x] **.1** Escribir test vacío (shell) para `labels-origen-cierre.test.ts` — crear
  el archivo `frontend/src/features/cierre-ejercicio/lib/labels-origen-cierre.test.ts`
  con los 4 casos vacíos (`it.todo`). (REQ-CEF-09)

- [x] **.2** [TEST-FIRST] Escribir los tests reales en
  `labels-origen-cierre.test.ts`:
  - `labelOrigenCierre('CIERRE_GASTOS')` → `"Cierre de gastos y costos"`
  - `labelOrigenCierre('CIERRE_INGRESOS')` → `"Cierre de ingresos"`
  - `labelOrigenCierre('CIERRE_RESULTADO')` → `"Traslado del resultado"`
  - Fallback: `labelOrigenCierre('CIERRE_DESCONOCIDO')` devuelve el string
    original o un label genérico, **nunca lanza**. Verificar con `expect(...).not.toThrow()`.
  (REQ-CEF-09)

- [x] **.3** Implementar `frontend/src/features/cierre-ejercicio/lib/labels-origen-cierre.ts`:
  función pura `labelOrigenCierre(origenTipo: string): string` con mapa de los
  3 valores + fallback. Sin imports de React ni de `@/types/api`. Ejecutar los
  tests: deben pasar en verde. (REQ-CEF-09)

- [x] **.4** [TEST-FIRST] Escribir
  `frontend/src/features/cierre-ejercicio/lib/derivar-estado-cierre.test.ts` con los
  4 casos + borde SKIP-on-zero:
  - `[]` → `'SIN_CIERRES'`
  - `[{estado:'BORRADOR'}, {estado:'BORRADOR'}]` → `'EN_BORRADOR'`
  - `[{estado:'CONTABILIZADO'}, {estado:'BORRADOR'}]` → `'PARCIALMENTE_CONTABILIZADO'`
  - `[{estado:'CONTABILIZADO'}, {estado:'CONTABILIZADO'}]` → `'TODOS_CONTABILIZADO'`
  - Un solo elemento `CONTABILIZADO` → `'TODOS_CONTABILIZADO'` (caso SKIP-on-zero: 1 de 1)
  (REQ-CEF-02, §4 del design)

- [x] **.5** Implementar
  `frontend/src/features/cierre-ejercicio/lib/derivar-estado-cierre.ts`:
  - Exportar tipo `EstadoCierrePantalla`
  - Exportar función `derivarEstadoCierre(cierres: { estado: EstadoComprobante }[]): EstadoCierrePantalla`
  - Lógica: `length===0→SIN_CIERRES`, `contabilizados===length→TODOS_CONTABILIZADO`,
    `contabilizados>0→PARCIALMENTE_CONTABILIZADO`, else `EN_BORRADOR`
  - Importar `EstadoComprobante` desde `@/types/api`.
  - Ejecutar los tests: deben pasar en verde. (REQ-CEF-02, REQ-CEF-04, REQ-CEF-05, REQ-CEF-06)

---

## Batch 2 — API + Hooks de datos

> Wrappers sobre los endpoints del backend. Sin lógica de dominio.
> Tests opcionales para hooks triviales (ver §9 frontend CLAUDE.md).

- [x] **.1** Crear `frontend/src/features/cierre-ejercicio/api/get-cierre.ts`:
  `getCierre(gestionId: string): Promise<CierreEjercicioResponse>` → `api.get<CierreEjercicioResponse>('/api/gestiones/${gestionId}/cierre')`.
  Import `CierreEjercicioResponse` desde `@/types/api`. (REQ-CEF-01)

- [x] **.2** Crear `frontend/src/features/cierre-ejercicio/api/generar-cierre.ts`:
  `generarCierre(gestionId: string): Promise<CierreEjercicioResponse>` → `api.post<CierreEjercicioResponse>('/api/gestiones/${gestionId}/cierre')`.
  Mismo tipo de respuesta (el POST es idempotente, devuelve el mismo shape). (REQ-CEF-03)

- [x] **.3** Crear `frontend/src/features/cierre-ejercicio/hooks/use-cierre.ts`:
  `useQuery({ queryKey: ['cierre-ejercicio', gestionId], queryFn: () => getCierre(gestionId), enabled: gestionId !== undefined && gestionId !== '' })`.
  Exportar `useCierre(gestionId: string | undefined)`. (REQ-CEF-01, REQ-CEF-08)

- [x] **.4** Crear `frontend/src/features/cierre-ejercicio/hooks/use-generar-cierre.ts`:
  `useMutation({ mutationFn: generarCierre, onSuccess: () => qc.invalidateQueries({ queryKey: ['cierre-ejercicio', gestionId] }) })`.
  El hook recibe `gestionId: string` como parámetro del closure.
  **Nota**: este mismo hook sirve para "Generar" y "Regenerar" (mismo endpoint, idempotente). (REQ-CEF-03)

---

## Batch 3 — Hook orquestador secuencial

> Lógica de negocio del flujo contabilizar: for...of + await, resumable,
> parada temprana. Testear la lógica del loop directamente (no el hook completo).

- [x] **.1** [TEST-FIRST] Escribir
  `frontend/src/features/cierre-ejercicio/hooks/use-contabilizar-cierre.test.ts`
  (o `.spec.ts` según convención del proyecto). Testear la función de loop
  pura (extraída o a través de `renderHook`). Casos:
  - Todos BORRADOR + todos éxito → `progreso` termina en `['contabilizado','contabilizado','contabilizado']`, `ok: true`.
  - BORRADOR + falla en el 2do → progreso `['contabilizado','error']`, `ok: false`, `falloEn: id2`. El 3ro no se postea.
  - Resumable: `[{estado:'CONTABILIZADO'},{estado:'BORRADOR'}]` → salta el 1ro (estado inicial `'contabilizado'`), postea solo el 2do. (REQ-CEF-05)
  - Anti-F-07: `isPending` se vuelve `false` tanto en éxito total como en error.

- [x] **.2** Implementar `frontend/src/features/cierre-ejercicio/hooks/use-contabilizar-cierre.ts`:
  - Estado local: `progreso: ProgresoPaso[]`, `isPending: boolean` (via `useState`)
  - Tipos locales: `EstadoPaso = 'pendiente'|'contabilizando'|'contabilizado'|'error'` y `ProgresoPaso`
  - `contabilizar(cierres: { id: string; estado: EstadoComprobante }[])` implementado con `for...of + await`
  - Inicialización: los ya `CONTABILIZADO` arrancan en `'contabilizado'` (resumable desde el inicio)
  - Import cross-feature: `contabilizarComprobante` desde `@/features/comprobantes/api/contabilizar-comprobante` con comentario `// Cross-feature: POST contabilizar un comprobante de cierre.`
  - Al éxito total: `qc.invalidateQueries({ queryKey: ['cierre-ejercicio', gestionId] })` + `qc.invalidateQueries({ queryKey: ['comprobantes'] })`
  - Exportar: `useContabilizarCierre(gestionId: string)` → `{ contabilizar, progreso, isPending }`
  - Ejecutar tests: deben pasar en verde. (REQ-CEF-05)

---

## Batch 4 — Componentes presentacionales + tests

> Componentes que reciben props y renderizan. Sin orquestación propia.
> Patrón: escribir test → ver fallar → implementar.

### AsientoCierreCard

- [x] **.1** [TEST-FIRST] Crear
  `frontend/src/features/cierre-ejercicio/components/asiento-cierre-card.test.tsx`.
  Mock de `useComprobante`, `useCuentas`, `useContactos` con `vi.mock`.
  Casos requeridos:
  - Renderiza cabecera con `labelOrigenCierre(origenTipo)`, glosa y badge de estado.
  - Muestra skeleton cuando `useComprobante` devuelve `{ isLoading: true }`.
  - Tabla de líneas: columna `Debe (BOB)` muestra el string `"60000.00"` SIN recalcular
    (`expect(screen.getByText('60000.00')).toBeInTheDocument()` o formato es-BO equivalente).
  - Fecha `"2026-12-31"` → aparece `"31/12/2026"` en el DOM (sin desplazamiento UTC).
  - Banner inline (no toast) cuando `useComprobante` devuelve `{ isError: true }`.
  (REQ-CEF-04, REQ-CEF-10)

- [x] **.2** Implementar `frontend/src/features/cierre-ejercicio/components/asiento-cierre-card.tsx`:
  - Props: `cierre: { id: string; origenTipo: string; estado: EstadoComprobante }`
  - Internamente llama `useComprobante(cierre.id)` con comentario cross-feature obligatorio (§14.6):
    ```tsx
    // Cross-feature: detalle del comprobante de cierre para renderizar sus líneas.
    // GET /api/gestiones/:id/cierre solo trae el esqueleto (id, origenTipo, estado),
    // no las líneas. queryKey ['comprobantes','detail',id] → dedupe/cache con el detalle.
    ```
  - Cabecera: `labelOrigenCierre(cierre.origenTipo)`, glosa, `EstadoComprobanteBadge` (reusado de `@/features/comprobantes/components/`), totales BOB via `MontoCell`, fecha via `formatearFechaContable`
  - Skeleton mientras `isLoading` (§14.5)
  - Banner inline (no toast) si `isError` (Anti-F-13): `<div className="rounded-md border border-destructive/40 bg-destructive/10 ...">` dentro del card
  - Tabla: 6 columnas `#|Cuenta|Debe (BOB)|Haber (BOB)|Glosa|Contacto`, scroll horizontal (`overflow-x-auto`), `MontoCell` para montos (§4.5), `formatearFechaContable` para fecha (§4.6)
  - Lookup de cuentas/contactos: cross-feature `useCuentas`/`useContactos` con `pageSize 100/50`, fallback a UUID si no encontrado, con comentario `// Cross-feature:`
  - Ejecutar tests: deben pasar en verde. (REQ-CEF-04, REQ-CEF-08, REQ-CEF-10)

### ContabilizarCierreBar

- [x] **.3** [TEST-FIRST] Crear
  `frontend/src/features/cierre-ejercicio/components/contabilizar-cierre-bar.test.tsx`.
  Envolver renders en `<TooltipProvider>` (§14.7).
  Mock permisos via `vi.mock('@/lib/use-permissions', async (o) => ({ ...(await o()), usePermissions: () => ({ has, hasAll, isOwner, permissions }) }))`.
  Casos requeridos:
  - Botón habilitado cuando `has(PERMISSIONS.contabilidad.asientos.post) === true`.
  - Botón `disabled` + tooltip cuando sin permiso.
  - Botón `disabled` cuando `isPending === true` (Anti-F-07).
  - Render de progreso: un `ProgresoPaso` en estado `'contabilizando'` muestra spinner/texto; `'contabilizado'` muestra ✓; `'error'` muestra mensaje de error.
  (REQ-CEF-05)

- [x] **.4** Implementar `frontend/src/features/cierre-ejercicio/components/contabilizar-cierre-bar.tsx`:
  - Props: `cierres: { id: string; estado: EstadoComprobante }[]`, `progreso: ProgresoPaso[]`, `isPending: boolean`, `onContabilizar: () => void`
  - `PermissionButton` con `permission={PERMISSIONS.contabilidad.asientos.post}` y `deniedReason="No tenés permiso para contabilizar asientos"` (§14.7)
  - `disabled={isPending}` adicional al gating de permiso (Anti-F-07)
  - Render del progreso: lista visual de `ProgresoPaso` por cada cierre (estado visual: spinner/✓/✗ + mensaje de error si `estado === 'error'`)
  - Ejecutar tests: deben pasar en verde. (REQ-CEF-05)

### CierreConfirmadoBanner

- [x] **.5** Crear
  `frontend/src/features/cierre-ejercicio/components/cierre-confirmado-banner.tsx`:
  - Banner de confirmación: "Cierre del ejercicio contabilizado correctamente."
  - CTA `<Button>` o `<Link>` "Cerrar gestión" que navega a `/periodos-fiscales` (REQ-CEF-11, D-2)
  - Sin test propio (componente trivial, cubierto por el test de la page).
  (REQ-CEF-06, REQ-CEF-11)

### CierreGestionActivaRedirect

- [x] **.6** Crear
  `frontend/src/features/cierre-ejercicio/components/cierre-gestion-activa-redirect.tsx`:
  - Usa `useGestiones()` (cross-feature desde `@/features/periodos-fiscales/hooks/use-gestiones` con comentario obligatorio §14.6)
  - Deriva la gestión más reciente: `gestiones.sort((a, b) => b.year - a.year)[0]` (misma lógica que `periodos-fiscales-page.tsx:25-30`)
  - Si hay gestión activa: `navigate('/gestiones/${gestion.id}/cierre', { replace: true })`
  - Si no hay gestiones: `navigate('/periodos-fiscales', { replace: true })`
  - Mientras carga: spinner o fragmento vacío (no bloquear)
  - Sin test propio (lógica mínima, cubierto por smoke de navegación).
  (D-1)

---

## Batch 5 — Page contenedora + test

> Orquesta hooks + estado derivado + 4 estados de la máquina.

- [x] **.1** [TEST-FIRST] Crear
  `frontend/src/features/cierre-ejercicio/pages/cierre-ejercicio-page.test.tsx`.
  Mock de `useCierre`, `useGenerarCierre`, `useContabilizarCierre`, `useComprobante`,
  `useCuentas`, `useContactos`, y permisos.
  Casos requeridos (REQ-CEF completos):
  - `isLoading: true` → skeletons visibles; no hay botones ni empty state (REQ-CEF-08)
  - `isError: true` / 404 → banner de error + botón "Volver a gestiones" que apunta a `/periodos-fiscales` (REQ-CEF-07)
  - `cierres: []` (`SIN_CIERRES`) → empty state §13.4 con ícono, título "No hay asientos de cierre generados", botón "Generar asientos de cierre" habilitado (REQ-CEF-02)
  - `SIN_CIERRES` sin permiso `gestiones.cerrar` → botón "Generar" `disabled` + tooltip (REQ-CEF-02)
  - `EN_BORRADOR` con N=2 (SKIP-on-zero) → 2 `AsientoCierreCard` + botón "Regenerar" habilitado + `ContabilizarCierreBar` visible (REQ-CEF-04)
  - `EN_BORRADOR` con N=3 → 3 cards (REQ-CEF-04)
  - `PARCIALMENTE_CONTABILIZADO` → banner informativo `bg-muted` + botón "Regenerar" `disabled` + tooltip (REQ-CEF-03, D-3)
  - `TODOS_CONTABILIZADO` → `CierreConfirmadoBanner` visible; botón "Regenerar" deshabilitado; `ContabilizarCierreBar` oculto o disabled (REQ-CEF-06)

- [x] **.2** Implementar `frontend/src/features/cierre-ejercicio/pages/cierre-ejercicio-page.tsx`:
  - Leer `id` via `useParams<{ id: string }>()`
  - `const { data, isLoading, isError } = useCierre(id)`
  - `const estadoCierre = data ? derivarEstadoCierre(data.cierres) : null`
  - Ramificar los 6 estados: `isLoading` / `isError` / `SIN_CIERRES` / `EN_BORRADOR` / `PARCIALMENTE_CONTABILIZADO` / `TODOS_CONTABILIZADO`
  - Header canónico §13.1 con título "Cierre del ejercicio" + subtítulo
  - Estado `SIN_CIERRES`: empty state §13.4 con ícono `BookX`, `PermissionButton(gestiones.cerrar)`
  - Estados `EN_BORRADOR` / `PARCIALMENTE_CONTABILIZADO`:
    - `data.cierres.map(c => <AsientoCierreCard key={c.id} cierre={c} />)`
    - Banner `bg-muted` informativo SOLO en `PARCIALMENTE_CONTABILIZADO` (D-3)
    - `PermissionButton(gestiones.cerrar)` "Regenerar" `disabled` si `PARCIALMENTE_CONTABILIZADO`
    - `<ContabilizarCierreBar cierres={data.cierres} progreso={progreso} isPending={isPending} onContabilizar={() => contabilizar(data.cierres)} />`
  - Estado `TODOS_CONTABILIZADO`: cards + `<CierreConfirmadoBanner />`; sin `ContabilizarCierreBar`
  - `onError` de la mutation generar → `toast.error(mensajeCierreEjercicio(err))` (no toast en el cuerpo: Anti-F-13)
  - Ejecutar tests del Batch 5: deben pasar en verde. (REQ-CEF-01..11)

---

## Batch 6 — Wiring (rutas + sidebar + helper de errores)

> Conectar la feature al árbol de rutas y navegación.

- [x] **.1** Agregar helper `mensajeCierreEjercicio(err: unknown): string` al final de
  `frontend/src/lib/error-messages.ts` (mismo patrón switch-por-code que `mensajeComprobantes`):
  ```ts
  export function mensajeCierreEjercicio(err: unknown): string {
    const { code, message } = extractBackendError(err);
    switch (code) {
      case 'CIERRE_EJERCICIO_PERIODO_NO_LISTO':
        return 'No todos los períodos anteriores están cerrados o el período de cierre no está abierto.';
      case 'CIERRE_EJERCICIO_GESTION_YA_CERRADA':
        return 'La gestión ya está cerrada.';
      case 'CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO':
        return 'No se puede regenerar: al menos un asiento de cierre ya está contabilizado.';
      case 'CIERRE_EJERCICIO_SIN_MOVIMIENTO':
        return 'La gestión no tiene cuentas de resultado con movimiento.';
      case 'CIERRE_EJERCICIO_CUENTA_DESTINO_FALTANTE':
        return 'Falta configurar la cuenta de resultado del ejercicio en Configuración contable.';
      case 'CIERRE_EJERCICIO_GESTION_NO_ENCONTRADA':
        return 'No se encontró la gestión solicitada.';
      default:
        return message;
    }
  }
  ```
  Agregar también el caso `'CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO'` a la función
  `mensajePeriodosFiscales` existente (para que el toast del `CerrarGestionButton` guíe
  al contador — REQ-CEF-11, D-2, PF-5):
  ```ts
  case 'CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO':
    return 'Hay asientos de cierre pendientes de contabilizar. Ir a "Cierre del ejercicio" para completarlos.';
  ```
  (REQ-CEF-03, REQ-CEF-07, REQ-CEF-11)

- [x] **.2** Agregar las 2 rutas en `frontend/src/routes/router.tsx` (después de `/eeff/flujo-efectivo`, antes de `/contactos`):
  ```tsx
  {
    path: '/gestiones/:id/cierre',
    element: (
      <RequirePermission permission={PERMISSIONS.contabilidad.gestiones.read}>
        <CierreEjercicioPage />
      </RequirePermission>
    ),
  },
  {
    path: '/gestiones/cierre',
    element: (
      <RequirePermission permission={PERMISSIONS.contabilidad.gestiones.read}>
        <CierreGestionActivaRedirect />
      </RequirePermission>
    ),
  },
  ```
  **IMPORTANTE**: la ruta `/gestiones/cierre` (estática) debe ir ANTES de `/gestiones/:id/cierre`
  (con param) si el router usa match-first. Verificar el orden en el router existente
  (React Router v6 matchea por especificidad, pero colocarla primero en el array es más
  explícito y seguro).
  Agregar imports `lazy` / eager consistentes con el resto del archivo.
  (REQ-CEF-01, D-1)

- [x] **.3** Agregar ítem al array de items de la sección `'contabilidad'` en
  `frontend/src/components/nav-items.ts`:
  1. Agregar import: `BookCheck` junto a los demás imports de lucide-react (verificar que no esté ya importado — PF-6).
  2. Agregar el item DESPUÉS de "Estado de flujo de efectivo" (Droplet, `/eeff/flujo-efectivo`),
     ANTES de "Plan de cuentas":
     ```ts
     {
       to: '/gestiones/cierre',
       label: 'Cierre del ejercicio',
       icon: BookCheck,
       requiredPermission: PERMISSIONS.contabilidad.gestiones.read,
       vertical: 'CONTABILIDAD',
     },
     ```
  (REQ-CEF-01, REQ-CEF-11, D-1)

---

## Batch 7 — Verificación final

- [x] **.1** Typecheck: `cd frontend && pnpm exec tsc -b`. Esperado: 0 errores.
  Si hay errores de tipos en los imports cross-feature o en los tipos de `CierreEjercicioResponse`,
  resolverlos antes de continuar.

- [x] **.2** Lint: `cd frontend && pnpm run lint`. Esperado: 0 errores y 0 warnings.
  Prestar especial atención a imports de `@/types/api` y cross-feature.

- [x] **.3** Tests unitarios completos: `cd frontend && pnpm vitest run`. Esperado: 0 fallos.
  Regresión completa (todos los tests existentes + los nuevos del change).
  Anotar el total de tests nuevos (estimado: ~25 nuevos).

- [x] **.4** Checklist responsive + gating (§7 y §14.7 del frontend CLAUDE.md):
  - [x] Renderizado correcto en 375 px (mobile)
  - [x] Renderizado correcto en 768 px (iPad)
  - [x] Renderizado correcto en 1440 px (laptop)
  - [x] Tap targets ≥ 44×44 px en botones de la página
  - [x] Modo oscuro verificado (sin colores literales)
  - [x] Tabla de líneas tiene estrategia explícita: `overflow-x-auto` + `min-w-[700px]` (§7 tablas)
  - [x] Botones "Generar" / "Regenerar" / "Contabilizar": `disabled={isPending}` presente (Anti-F-07)
  - [x] Gating fail-closed: sin data de permisos, botones disabled (§14.7)
  - [x] Ítem de sidebar visible solo con permiso `contabilidad.gestiones.read`
  - [x] Navegación desde `/gestiones/cierre` → redirect correcto a gestión activa o a `/periodos-fiscales`

---

## Mapa REQ ↔ Tasks

| REQ | Tasks |
|-----|-------|
| REQ-CEF-01 (gating ruta + sidebar) | PF-1, PF-4, 2.3, 6.2, 6.3 |
| REQ-CEF-02 (empty state SIN_CIERRES) | 1.4, 1.5, 5.1, 5.2 |
| REQ-CEF-03 (generar / regenerar) | 2.2, 2.4, 5.1, 5.2, 6.1 |
| REQ-CEF-04 (preview inline EN_BORRADOR) | 4.1, 4.2, 5.1, 5.2 |
| REQ-CEF-05 (contabilizar secuencial + progreso) | 3.1, 3.2, 4.3, 4.4, 5.1, 5.2 |
| REQ-CEF-06 (TODOS_CONTABILIZADO) | 1.4, 1.5, 4.5, 5.1, 5.2 |
| REQ-CEF-07 (gestión inexistente / 404) | 5.1, 5.2, 6.1 |
| REQ-CEF-08 (estado de carga / skeleton) | 2.3, 5.1, 5.2 |
| REQ-CEF-09 (labels origenTipo) | 1.1, 1.2, 1.3 |
| REQ-CEF-10 (montos string + fechas sin UTC) | 4.1, 4.2 |
| REQ-CEF-11 (conducción desde CerrarGestion) | 4.5, 4.6, 6.1, 6.3 |

---

## Notas de implementación para el agente de apply

1. **No tocar** `frontend/src/features/periodos-fiscales/components/cerrar-gestion-button.tsx`
   ni su test (D-2 firmada).
2. **No tocar** `frontend/src/types/api.ts` ni `frontend/src/types/api.generated.ts` —
   `CierreEjercicioResponse` ya existe (verificado en design §1.1).
3. El code `CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO` es el mismo que lanza
   tanto `generarCierre` (POST /cierre con alguno CONTABILIZADO) como `cerrar()` de la gestión
   (periodos-fiscales service). Ambos casos se mapean al mismo mensaje en español, pero con
   contexto diferente: en `mensajeCierreEjercicio` → para el regenerar; en `mensajePeriodosFiscales`
   → para guiar al contador al cierre del ejercicio (task 6.1).
4. El ícono `BookCheck` de lucide-react debe verificarse que no está importado ya en
   `nav-items.ts` (PF-6). Si está en uso en otro lugar del sidebar, elegir `CalendarCheck` como
   alternativa.
5. El orden de las rutas en `router.tsx` (task 6.2): colocar `/gestiones/cierre` (estático)
   antes de `/gestiones/:id/cierre` (param) en el array del router, aunque React Router v6
   resuelve por especificidad. Es más claro y defensivo.
