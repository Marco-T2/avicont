# Verify Report — cierre-ejercicio-frontend

<!--
Change: cierre-ejercicio-frontend
Verificado: 2026-06-17
Verifier: sdd-verify sub-agent (adversarial)
Status: APPROVED_WITH_WARNINGS
-->

## Resultado: APPROVED_WITH_WARNINGS

- **CRITICALs**: 0
- **WARNINGs**: 2
- **SUGGESTIONs**: 1

---

## Gates ejecutados (resultados reales)

```
cd frontend
pnpm exec tsc -b       → VERDE (0 errores)
pnpm run lint          → VERDE (0 errores, 0 warnings)
pnpm vitest run        → VERDE (1453/1453 — 33 tests nuevos del change + 1420 regresión)
```

Tests nuevos del change: **33** (distribuidos en 6 archivos de test).

---

## Checks adversariales — resultado detallado

### 1. Máquina de estados derivada (REQ-CEF, D-3) ✅

`derivarEstadoCierre` en `lib/derivar-estado-cierre.ts` es función pura que cubre los 4 estados exactamente como el design §4. No hay `useState`/Zustand redundante — el estado se deriva en cada render:

```ts
const estadoCierre = data !== undefined ? derivarEstadoCierre(data.cierres) : null;
```

SKIP-on-zero funciona correctamente: la función itera `cierres[]` tal como viene, sin asumir longitud 3. Caso N=1 CONTABILIZADO → TODOS_CONTABILIZADO cubierto por test. Caso N=2 (SKIP-on-zero) cubierto en el test de la page (EN_BORRADOR con N=2).

### 2. Contabilización secuencial (REQ-CEF-05, §5) ✅

`use-contabilizar-cierre.ts` implementa exactamente el algoritmo del design:

- `for...of` + `await` (NO `Promise.all`) — verificado en código.
- Salta CONTABILIZADO: `if (cierre.estado === 'CONTABILIZADO') continue;` — correcto.
- Parada temprana en primer fallo: `return { ok: false, falloEn: cierre.id }` — correcto.
- Reporta cuál falló: `marcarPaso(cierre.id, 'error', mensajeComprobantes(err))` — correcto.
- Invalida `['cierre-ejercicio', gestionId]` y `['comprobantes']` al éxito total — verificado.
- Progreso es `useState` local — no confunde server state. Correcto.

Tests del hook (4 casos) cubren: éxito total, parada temprana, resumable, Anti-F-07.

### 3. Anti-F-07 (doble-click) ✅

Ambos botones con `disabled={isPending}`:

- Generar: `disabled={generarMutation.isPending}` en `PermissionButton` del empty state y en Regenerar.
- Contabilizar: `disabled={isPending}` en `ContabilizarCierreBar` → propagado al `PermissionButton`.

Un segundo click durante el loop no dispara segunda secuencia. Verificado en código y test.

### 4. Gating fail-closed (§14.7) ✅

- Rutas: `RequirePermission(PERMISSIONS.contabilidad.gestiones.read)` en ambas rutas de router.tsx.
- Generar: `PermissionButton` con `permission={PERMISSIONS.contabilidad.gestiones.cerrar}`.
- Regenerar: mismo `PermissionButton` con `PERMISSIONS.contabilidad.gestiones.cerrar`.
- Contabilizar: `PermissionButton` con `permission={PERMISSIONS.contabilidad.asientos.post}`.
- Sidebar: `requiredPermission: PERMISSIONS.contabilidad.gestiones.read` + `vertical: 'CONTABILIDAD'`.

**Sin strings de permiso hardcodeados** — todos via `PERMISSIONS.*`. Fail-closed verificado: sin data de permisos, `has()` devuelve `false` → botones disabled.

### 5. Montos §4.5 ✅

`MontoCell` recibe el string crudo del backend y lo renderiza sin aritmética ni `parseFloat`. En `asiento-cierre-card.tsx` todos los montos pasan por `<MontoCell monto={...} />` tanto en la cabecera (totales) como en la tabla de líneas (debitoBob, creditoBob). Sin `Number(x)` ni operaciones sobre los strings. Test en `asiento-cierre-card.test.tsx` verifica que `"60000.00"` aparece en el DOM sin recalcular.

### 6. Fechas §4.6 ✅

`formatearFechaContable` en `formatear-fecha-contable.ts` usa `new Date(\`${fechaIso}T12:00:00\`)` (mediodía local, no UTC) con `Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz' })`. Esto evita el desplazamiento UTC. La función ya existía y está testeada. En la feature se usa correctamente en `asiento-cierre-card.tsx`. Test confirma `"2026-12-31"` → `"31/12/2026"`.

### 7. Anti-F-13 (errores carga vs acción) ✅

- **Errores de carga** (`useCierre` → `isError`): banner inline `role="alert"` en `cierre-ejercicio-page.tsx`, NO toast. `useComprobante` → `isError`: banner inline dentro del card, NO toast.
- **Errores de acción** (mutation generar/regenerar): `onError: (err) => toast.error(mensajeCierreEjercicio(err))` — toast correcto.
- La distinción carga vs acción está respetada en todos los casos.

### 8. Cross-feature §14.6 ✅

Todos los imports cross-feature llevan comentario `// Cross-feature:`:

- `useComprobante` en `asiento-cierre-card.tsx` — con comentario de 3 líneas explicando el porqué y el queryKey.
- `contabilizarComprobante` en `use-contabilizar-cierre.ts` — con comentario explicando la excepción §8.
- `useGestiones` en `cierre-gestion-activa-redirect.tsx` — con comentario.
- `useCuentas` y `useContactos` en `asiento-cierre-card.tsx` — con comentarios.

QueryKey verificado: `['comprobantes', 'detail', id]` (NO `'detalle'`) — correcto per D-4 y PF-2.

### 9. Orden de rutas en router.tsx ✅

```tsx
// Línea 170-177: /gestiones/cierre ANTES de /gestiones/:id/cierre
{
  path: '/gestiones/cierre',
  element: <RequirePermission ...><CierreGestionActivaRedirect /></RequirePermission>,
},
{
  path: '/gestiones/:id/cierre',
  element: <RequirePermission ...><CierreEjercicioPage /></RequirePermission>,
},
```

Con comentario explícito. Correcto — el redirector no pierde su match.

### 10. Mapeo de errores ✅ (con observación menor)

`mensajeCierreEjercicio` mapea los 6 códigos reales del backend:
- `CIERRE_EJERCICIO_PERIODO_NO_LISTO` ✅
- `CIERRE_EJERCICIO_GESTION_YA_CERRADA` ✅
- `CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO` ✅
- `CIERRE_EJERCICIO_SIN_MOVIMIENTO` ✅
- `CIERRE_EJERCICIO_CUENTA_DESTINO_FALTANTE` ✅
- `CIERRE_EJERCICIO_GESTION_NO_ENCONTRADA` ✅

`mensajePeriodosFiscales` tiene el case `CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO` (REQ-CEF-11, D-2) ✅.

El backend **no tiene** `COMPROBANTE_NO_EN_BORRADOR` — ese código listado en la spec no existe en `comprobante-errors.ts`. Los errores de contabilizar viajan por `mensajeComprobantes` (que cubre `COMPROBANTE_ESTADO_INVALIDO`) con fallback al `message` en español. Esto es **correcto** — la spec tiene un code ficticio en la tabla de errores pero el design ya lo resuelve usando `mensajeComprobantes` para el POST de contabilizar. Sin impacto en runtime.

---

## WARNINGs

### W-1: Tooltip del botón "Regenerar" en PARCIALMENTE_CONTABILIZADO es nativo (title), no Radix UI

**Archivo**: `frontend/src/features/cierre-ejercicio/pages/cierre-ejercicio-page.tsx` líneas 155-159

**Qué**: cuando el usuario TIENE el permiso `gestiones.cerrar` pero el botón "Regenerar" está deshabilitado por estado (PARCIALMENTE_CONTABILIZADO), el código pasa `title="No se puede regenerar..."` al `PermissionButton`. Como el usuario tiene permiso, `PermissionButton` renderiza `<Button disabled title="...">` — el `title` es un atributo HTML nativo que los browsers muestran como tooltip básico solo en algunos contextos (no funciona consistentemente en botones disabled en todos los browsers/OS).

**Spec**: REQ-CEF-03 dice explícitamente "tooltip: 'No se puede regenerar...'", y §14.7 del CLAUDE.md frontend especifica Radix UI tooltip para botones de acción.

**Impacto**: UX incompleta en PARCIALMENTE_CONTABILIZADO — el tooltip explicativo del estado puede no mostrarse en todos los contextos. El botón SÍ está deshabilitado correctamente (funcional correcto), solo falla el feedback visual.

**Sugerencia de fix**: Envolver el `PermissionButton` de Regenerar en un `<Tooltip>` de Radix cuando `estadoCierre === 'PARCIALMENTE_CONTABILIZADO'`, o usar un patrón similar al que usa `PermissionButton` internamente (span wrapper + `TooltipContent`).

### W-2: `CierreConfirmadoBanner` usa texto hardcoded "tres asientos de cierre" (SKIP-on-zero incorrecto)

**Archivo**: `frontend/src/features/cierre-ejercicio/components/cierre-confirmado-banner.tsx` línea 21

```tsx
<p className="text-xs text-green-700 dark:text-green-400">
  Los tres asientos de cierre fueron contabilizados. Podés proceder...
```

**Qué**: el texto dice "Los **tres** asientos" pero SKIP-on-zero permite que la gestión tenga solo 1 o 2 cierres contabilizados. En ese caso el estado TODOS_CONTABILIZADO mostrará el banner con un texto incorrecto ("tres" cuando fueron "dos").

**Spec**: REQ-CEF-03 escenario SKIP-on-zero: "la UI muestra exactamente esos 2 cards sin asumir que faltan". El banner viola este principio al hardcodear "tres".

**Impacto**: Texto incorrecto para gestiones con SKIP-on-zero (sin gastos → solo 2 cierres). No rompe funcionalidad pero es text bug observable.

**Sugerencia de fix**: Cambiar a texto genérico: "Los asientos de cierre fueron contabilizados." o parametrizar con `n` (recibir `cierres.length` como prop).

---

## SUGGESTIONS

### S-1: Test de `ContabilizarCierreBar` no verifica disabled por permiso con Radix tooltip

El test `contabilizar-cierre-bar.test.tsx` verifica que el botón esté `disabled` cuando el usuario no tiene permiso, pero no verifica que el tooltip con `deniedReason` sea accesible. Esto es cosmético y dentro del patrón aceptado (§14.7: "el mecanismo ya está cubierto; testea la lógica custom"). No es un gap funcional.

---

## Verificación cruzada con spec

| REQ | Estado |
|-----|--------|
| REQ-CEF-01 (gating ruta + sidebar) | ✅ COMPLETO |
| REQ-CEF-02 (empty state SIN_CIERRES) | ✅ COMPLETO |
| REQ-CEF-03 (generar / regenerar) | ✅ COMPLETO (W-1 en tooltip de Regenerar disabled) |
| REQ-CEF-04 (preview inline EN_BORRADOR) | ✅ COMPLETO |
| REQ-CEF-05 (contabilizar secuencial + progreso) | ✅ COMPLETO |
| REQ-CEF-06 (TODOS_CONTABILIZADO) | ✅ COMPLETO (W-2 en texto del banner) |
| REQ-CEF-07 (gestión inexistente / 404) | ✅ COMPLETO |
| REQ-CEF-08 (estado de carga / skeleton) | ✅ COMPLETO |
| REQ-CEF-09 (labels origenTipo) | ✅ COMPLETO |
| REQ-CEF-10 (montos string + fechas sin UTC) | ✅ COMPLETO |
| REQ-CEF-11 (conducción desde CerrarGestion) | ✅ COMPLETO (D-2: via mensajePeriodosFiscales + sidebar) |

---

## Archivos verificados

- `frontend/src/features/cierre-ejercicio/` (18 archivos nuevos)
- `frontend/src/routes/router.tsx` — rutas agregadas en orden correcto
- `frontend/src/components/nav-items.ts` — ítem "Cierre del ejercicio" con BookCheck, vertical CONTABILIDAD
- `frontend/src/lib/error-messages.ts` — `mensajeCierreEjercicio` + case en `mensajePeriodosFiscales`
- `frontend/src/features/comprobantes/lib/formatear-fecha-contable.ts` — confirmado sin UTC
- `frontend/src/features/comprobantes/components/monto-cell.tsx` — confirmado sin aritmética
- `backend/src/cierre-ejercicio/domain/cierre-errors.ts` — códigos reales confirmados

---

## Next recommended

1. Mergear el change: los 2 warnings son menores (UX), no funcionales. El change es production-ready.
2. (Opcional, baja prioridad) W-1: fix del tooltip nativo → Radix en Regenerar disabled. Un sprint de deuda cosmética.
3. (Opcional, baja prioridad) W-2: fix del texto "tres" → genérico en `CierreConfirmadoBanner`.
4. Proceder con `sdd-archive` para cerrar el change.
