# Cierre del Ejercicio Fiscal — Especificación Frontend

<!--
Última edición: 2026-06-17
Última revisión contra core: 2026-06-17
Owner: frontend-lead
-->

> Fecha: 2026-06-17
> Fase: delta-spec (change `cierre-ejercicio-frontend`)
> Proyecto: avicont
> Capability: `cierre-ejercicio-frontend`
> Alcance: FRONTEND-PURO (cero backend, cero migración, cero RBAC nuevo)
> Backend dependiente: PR #220 (`266da73`), change `cierre-ejercicio` — YA MERGEADO

---

## Propósito

Pantalla dedicada `/gestiones/:id/cierre` que guía al contador por el flujo
**generar → revisar inline → contabilizar** los asientos de cierre del ejercicio
fiscal boliviano. Los asientos de cierre (hasta 3: cerrar gastos, cerrar
ingresos, trasladar resultado) fueron generados por el backend en estado
BORRADOR no-editable (`generadoPorSistema=true`).

Sin esta UI, el flujo operativo es imposible para el usuario final: el botón
"Cerrar gestión" exige que los comprobantes de cierre estén CONTABILIZADO pero
no existe ninguna pantalla que conduzca ese paso previo.

---

## Glosario

- **Cierre**: conjunto de (≤3) comprobantes tipo `CIERRE` de una gestión,
  devuelto por `GET /api/gestiones/:id/cierre`.
- **Comprobante de cierre**: comprobante con `generadoPorSistema=true`,
  `origenTipo ∈ {CIERRE_GASTOS, CIERRE_INGRESOS, CIERRE_RESULTADO}`.
- **SKIP-on-zero**: el backend puede devolver menos de 3 comprobantes si alguno
  no tiene líneas (p.ej. gestión sin gastos → #1 no se genera). La UI itera
  sobre `cierres[]` tal cual viene.
- **Estado derivado de la pantalla**: se calcula desde `cierres[]`:
  - `SIN_CIERRES`: `cierres.length === 0`.
  - `EN_BORRADOR`: `cierres.length > 0` y ninguno es `CONTABILIZADO`.
  - `PARCIALMENTE_CONTABILIZADO`: algunos `CONTABILIZADO` y algunos no.
  - `TODOS_CONTABILIZADO`: todos los cierres son `CONTABILIZADO`.
- **Monto string**: todo importe viene como `string` decimal del backend
  (`"60000.00"`, §4.5 CLAUDE.md). Se renderiza sin recalcular vía `MontoCell`.
- **FechaContable**: `"YYYY-MM-DD"` sin hora ni UTC (§4.6 CLAUDE.md).
  Se formatea con `formatearFechaContable`.
- **OrigenTipo legible**: mapa español definido en `lib/labels-origen-cierre.ts`:
  - `CIERRE_GASTOS` → "Cierre de gastos y costos"
  - `CIERRE_INGRESOS` → "Cierre de ingresos"
  - `CIERRE_RESULTADO` → "Traslado del resultado"

---

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

### REQ-CEF-01 — Gating de ruta y navegación

La ruta `/gestiones/:id/cierre` DEBE estar gateada por:
- Permiso `contabilidad.gestiones.read` (vía `RequirePermission`).
- Módulo `contabilidad` habilitado (vía `RequireModule`).

Ambas condiciones son fail-closed: sin data de permisos, la ruta NO se monta.
El sidebar DEBE incluir un ítem "Cierre del ejercicio" en la sección
Contabilidad, gateado por el mismo permiso, que navega a la gestión más
reciente por defecto (`/gestiones/:idGestionActiva/cierre`).

#### Escenario: usuario con permiso accede a la ruta
- **DADO** un usuario con `contabilidad.gestiones.read` y módulo contabilidad habilitado
- **CUANDO** navega a `/gestiones/<id>/cierre`
- **ENTONCES** la pantalla se carga y consulta `GET /api/gestiones/:id/cierre`

#### Escenario: usuario sin permiso
- **DADO** un usuario sin `contabilidad.gestiones.read`
- **CUANDO** intenta navegar a la ruta
- **ENTONCES** la ruta no se renderiza (redirect al dashboard o pantalla 403)

#### Escenario: módulo contabilidad deshabilitado
- **DADO** un tenant con módulo contabilidad deshabilitado
- **CUANDO** intenta acceder
- **ENTONCES** la ruta no se monta (mismo gate que el resto del módulo contabilidad)

---

### REQ-CEF-02 — Estado SIN cierres (empty state)

Cuando `GET /api/gestiones/:id/cierre` responde con `cierres: []`, la pantalla
DEBE mostrar el empty state de página (§13.4 del CLAUDE.md frontend):

- Ícono representativo del dominio (p.ej. `BookX` o `Scale`).
- Título `"No hay asientos de cierre generados"`.
- Subtítulo explicativo en español.
- Botón `PermissionButton` con permiso `contabilidad.gestiones.cerrar` y texto
  "Generar asientos de cierre". Sin permiso → botón disabled con tooltip
  `"No tenés permiso para generar el cierre del ejercicio"`.

El botón "Generar asientos de cierre" es el único CTA de este estado. NO
mostrar botones de contabilizar ni de regenerar.

#### Escenario: sin cierres, con permiso de generar
- **DADO** `cierres: []` y usuario con `contabilidad.gestiones.cerrar`
- **ENTONCES** la página muestra el empty state con botón "Generar asientos de cierre" habilitado

#### Escenario: sin cierres, sin permiso de generar
- **DADO** `cierres: []` y usuario SIN `contabilidad.gestiones.cerrar`
- **ENTONCES** el botón "Generar asientos de cierre" está disabled con tooltip explicativo;
  el empty state sigue visible (el usuario sabe que la acción existe)

---

### REQ-CEF-03 — Acción generar / regenerar

Al ejecutar "Generar asientos de cierre" (POST a `/api/gestiones/:id/cierre`),
el sistema DEBE:
- Deshabilitar el botón mientras `mutation.isPending` (Anti-F-07 crítico).
- Mostrar spinner + texto "Generando…" durante la petición.
- En éxito: invalidar `['cierre-ejercicio', gestionId]` → la pantalla pasa al
  estado EN_BORRADOR automáticamente.
- En error: mostrar mensaje en español derivado del código del backend (tabla
  al final de esta spec). NUNCA mostrar el JSON crudo del backend. Si el error
  no tiene código conocido, usar el campo `message` que ya viene en español.

El botón "Regenerar" (disponible en estado EN_BORRADOR con todos en BORRADOR)
ejecuta el mismo endpoint. Se DEBE deshabilitar si algún cierre ya está
`CONTABILIZADO` (el backend devolvería 409 `CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO`).

#### Escenario: generar exitoso
- **DADO** estado SIN_CIERRES y usuario con permiso
- **CUANDO** hace click en "Generar asientos de cierre"
- **ENTONCES** el botón se deshabilita + spinner; tras éxito la pantalla muestra
  los (≤3) comprobantes en BORRADOR

#### Escenario: SKIP-on-zero — menos de 3 comprobantes generados
- **DADO** una gestión sin cuentas de egreso con movimiento
- **CUANDO** se genera el cierre
- **ENTONCES** la respuesta trae solo los comprobantes generados (p.ej. 2);
  la UI muestra exactamente esos 2 cards sin asumir que faltan

#### Escenario: error de gate — gestión no cerrada
- **DADO** una gestión con períodos previos aún ABIERTO
- **CUANDO** se intenta generar
- **ENTONCES** el backend responde 409 `CIERRE_EJERCICIO_PERIODO_NO_LISTO`;
  el frontend muestra "No todos los períodos anteriores están cerrados." (toast error o banner)

#### Escenario: error — configuración faltante
- **DADO** una org sin `resultadoEjercicioId` configurado
- **CUANDO** se intenta generar
- **ENTONCES** el backend responde 422 `CIERRE_EJERCICIO_CUENTA_DESTINO_FALTANTE`;
  el frontend muestra "Falta configurar la cuenta de resultado del ejercicio." con sugerencia
  de ir a Configuración contable

#### Escenario: regenerar con algún cierre CONTABILIZADO → botón deshabilitado
- **DADO** estado PARCIALMENTE_CONTABILIZADO
- **ENTONCES** el botón "Regenerar" está disabled; tooltip:
  "No se puede regenerar: al menos un asiento de cierre ya está contabilizado."

---

### REQ-CEF-04 — Estado EN_BORRADOR: preview inline de cada asiento

Cuando al menos un cierre existe y NINGUNO está CONTABILIZADO (o en el estado
PARCIALMENTE_CONTABILIZADO), la pantalla DEBE renderizar un `AsientoCierreCard`
por cada elemento de `cierres[]`. Cada card:

**Cabecera del card**:
- Label legible del `origenTipo` (desde `labels-origen-cierre.ts`).
- Glosa del comprobante.
- Badge de estado (`EstadoComprobanteBadge` reutilizado o equivalente).
- Total debe / haber en BOB (como string formateado via `MontoCell`, §4.5).
- Fecha contable formateada (`formatearFechaContable`, §4.6).

**Tabla de líneas** (read-only, 6 columnas):
`#` | `Cuenta` (código · nombre) | `Debe (BOB)` | `Haber (BOB)` | `Glosa` | `Contacto`.
- Montos via `MontoCell` (string sin recalcular, §4.5).
- Columna Contacto puede estar vacía.
- Tabla con scroll horizontal si las líneas son muchas (`overflow-x-auto`).

Para obtener las líneas, cada `AsientoCierreCard` DEBE hacer su propio
`GET /api/comprobantes/:id` (cross-feature via `useComprobante(cierre.id)`).
El `GET /api/gestiones/:id/cierre` solo trae el esqueleto sin líneas.

Mientras `useComprobante` está cargando, mostrar skeleton de la tabla (§14.5).
Si falla, mostrar mensaje de error inline dentro del card (no toast, per Anti-F-13).

#### Escenario: preview correcto de un asiento de cierre
- **DADO** estado EN_BORRADOR con 3 cierres en BORRADOR
- **ENTONCES** 3 `AsientoCierreCard` se renderizan, cada uno con su cabecera
  y tabla de líneas cargada vía `useComprobante`

#### Escenario: monto nunca recalculado
- **DADO** una línea con `debitoBob: "60000.00"` y `creditoBob: "0.00"`
- **ENTONCES** la UI muestra `"60000.00"` en la columna Debe sin operar
  ningún `parseFloat` ni aritmética sobre ese string

#### Escenario: fecha sin UTC
- **DADO** `fechaContable: "2026-12-31"`
- **ENTONCES** la UI muestra `"31/12/2026"` (o el formato local boliviano)
  sin interpretar la cadena como UTC ni aplicar `new Date()`

#### Escenario: skeleton mientras carga el comprobante
- **DADO** que `useComprobante` está en estado `isLoading`
- **ENTONCES** el body del card muestra skeleton; la cabecera puede mostrar
  el estado y label del `origenTipo` que vienen del `GET /cierre`

---

### REQ-CEF-05 — Contabilizar: acción secuencial con progreso

La pantalla DEBE incluir el componente `ContabilizarCierreBar` con UN botón
"Contabilizar cierre". Al presionarlo:

1. Se deshabilita el botón (`disabled={mutation.isPending}`, Anti-F-07 crítico).
2. Se postean los cierres en orden con `POST /api/comprobantes/:id/contabilizar`,
   **uno por uno, en secuencia**. Cada uno:
   - Muestra estado `contabilizando…` mientras procesa.
   - Muestra `contabilizado ✓` al completar.
   - Muestra `error` si falla, **y para inmediatamente** (no continúa con el siguiente).
3. Los cierres ya en estado `CONTABILIZADO` se DEBEN saltar (la mutación es resumable
   ante partial-failure: reintentar continúa desde el que falló, no desde el inicio).
4. Al fallar, muestra inline cuáles se postearon y el error del que falló.
5. En éxito total (todos quedan CONTABILIZADO): invalida `['cierre-ejercicio', gestionId]`
   y `['comprobantes']` → la pantalla pasa al estado TODOS_CONTABILIZADO.

El botón DEBE estar gateado por `contabilidad.asientos.post` (`PermissionButton`
o `disabled={!has(PERMISSIONS.contabilidad.asientos.post)}`). Sin permiso →
disabled con tooltip `"No tenés permiso para contabilizar asientos"`.

NO usar `Promise.all`. Usar un loop `for...of` con `await` para garantizar orden
y parada temprana.

#### Escenario: contabilizar todos exitoso
- **DADO** 3 cierres en BORRADOR y usuario con `contabilidad.asientos.post`
- **CUANDO** hace click en "Contabilizar cierre"
- **ENTONCES** el botón se deshabilita; cada cierre muestra progreso visual
  secuencial; al final todos muestran "contabilizado ✓" y la pantalla pasa a
  estado TODOS_CONTABILIZADO

#### Escenario: botón deshabilitado sin permiso
- **DADO** usuario SIN `contabilidad.asientos.post`
- **ENTONCES** el botón "Contabilizar cierre" está disabled con tooltip

#### Escenario: partial-failure — falla el 3er cierre
- **DADO** los cierres #1 y #2 se contabilizan, #3 falla
- **ENTONCES** el UI muestra #1 y #2 como contabilizados ✓ y #3 como error;
  muestra el mensaje de error del backend para #3;
  el botón vuelve a habilitarse (pendiente = false)

#### Escenario: resumable — reintentar tras partial-failure
- **DADO** #1 y #2 ya en CONTABILIZADO, #3 en BORRADOR
- **CUANDO** el usuario hace click en "Contabilizar cierre" de nuevo
- **ENTONCES** `useContabilizarCierre` salta #1 y #2 (ya CONTABILIZADO),
  postea solo #3; si tiene éxito, la pantalla pasa a TODOS_CONTABILIZADO

#### Escenario: no doble-post (Anti-F-07)
- **DADO** el usuario hace click y la mutation está en curso
- **ENTONCES** el botón sigue disabled; un segundo click no genera una segunda
  secuencia de posts

---

### REQ-CEF-06 — Estado TODOS_CONTABILIZADO

Cuando todos los cierres del array tienen `estado === 'CONTABILIZADO'`, la
pantalla DEBE mostrar:
- Los `AsientoCierreCard` con badge `CONTABILIZADO` y número correlativo asignado.
- Banner o sección de confirmación: "Cierre del ejercicio contabilizado
  correctamente."
- CTA "Cerrar gestión" o enlace hacia la sección de gestiones / `CerrarGestionButton`
  para que el contador complete el cierre de la gestión (el backend ya aceptará
  la operación porque todos los cierres están CONTABILIZADO).

El botón "Regenerar" DEBE estar deshabilitado en este estado.
El botón "Contabilizar cierre" DEBE estar oculto o deshabilitado en este estado
(no hay nada que contabilizar).

#### Escenario: pantalla tras contabilizar todos
- **DADO** todos los cierres en CONTABILIZADO
- **ENTONCES** los cards muestran badge CONTABILIZADO + número correlativo;
  aparece el banner de confirmación y el CTA "Cerrar gestión"

#### Escenario: botones de acción colapsados en estado final
- **DADO** todos los cierres en CONTABILIZADO
- **ENTONCES** "Regenerar" está disabled; "Contabilizar cierre" no se muestra
  o está disabled

---

### REQ-CEF-07 — Gestión inexistente o ajena

Cuando el `:id` de la URL no corresponde a una gestión del tenant activo,
el backend responde 404. La pantalla DEBE mostrar un banner de error inline
(no toast, Anti-F-13) con:
- Mensaje: "No se encontró la gestión solicitada."
- Botón "Volver a gestiones" que navega a `/periodos-fiscales`.

El mismo patrón aplica si la query falla con error de red (5xx): mostrar
el banner de error con opción de reintentar o volver.

NO redirigir automáticamente — el banner inline da contexto y acción.

#### Escenario: gestión inexistente
- **DADO** `GET /api/gestiones/:id/cierre` responde 404
- **ENTONCES** la pantalla muestra banner de error y botón "Volver a gestiones"

#### Escenario: gestión de otro tenant
- **DADO** id pertenece a otro tenant (el backend devuelve 404 por multi-tenant)
- **ENTONCES** la pantalla trata el 404 igual que gestión inexistente

#### Escenario: error de red
- **DADO** `GET /api/gestiones/:id/cierre` falla con 500 o timeout
- **ENTONCES** banner de error con opción "Reintentar"

---

### REQ-CEF-08 — Estado de carga inicial

Mientras `useCierre(gestionId)` tiene `isLoading: true`:
- DEBE mostrar skeletons de las cards de asientos (§14.5 frontend CLAUDE.md).
- NO mostrar el empty state ni los botones de acción hasta tener la data.

#### Escenario: carga inicial
- **DADO** la ruta acaba de montarse
- **MIENTRAS** la query está en vuelo
- **ENTONCES** se muestran skeletons proporcionales al contenido esperado;
  los botones de acción no se renderizan

---

### REQ-CEF-09 — Labels de origenTipo en español

La feature DEBE incluir `lib/labels-origen-cierre.ts` con el mapa:

```
CIERRE_GASTOS   → "Cierre de gastos y costos"
CIERRE_INGRESOS → "Cierre de ingresos"
CIERRE_RESULTADO → "Traslado del resultado"
```

Esta lib es función pura sin efectos ni dependencias React, testeable con
Vitest sin setup de DOM. El test DEBE cubrir los 3 mapeos + el fallback para
un valor desconocido.

#### Escenario: label correcto para cada origenTipo
- **DADO** `origenTipo = 'CIERRE_GASTOS'`
- **ENTONCES** `labelOrigenCierre('CIERRE_GASTOS')` devuelve
  `"Cierre de gastos y costos"`

#### Escenario: fallback para valor desconocido
- **DADO** `labelOrigenCierre('CIERRE_DESCONOCIDO')`
- **ENTONCES** devuelve el string original o un label genérico, nunca lanza excepción

---

### REQ-CEF-10 — Serialización de montos y fechas (§4.5 y §4.6)

La feature DEBE respetar los invariantes del core:

**Montos (§4.5)**: todo importe del backend llega como `string`. Se DEBE
renderizar via `MontoCell` o equivalente sin pasar por `parseFloat` / aritmética.
Prohibido `Number(monto)` en líneas de comprobante o totales.

**Fechas (§4.6)**: `fechaContable` es `"YYYY-MM-DD"`. Se DEBE formatear con
`formatearFechaContable` (que trata la cadena como fecha local sin UTC). Prohibido
`new Date(fechaContable)` directamente.

#### Escenario: monto string preservado
- **DADO** `debitoBob: "60000.00"` en la respuesta del backend
- **ENTONCES** la celda muestra `"60.000,00"` o equivalente es-BO sin recalcular

#### Escenario: fecha sin desplazamiento UTC
- **DADO** `fechaContable: "2026-12-31"`
- **ENTONCES** la UI muestra "31/12/2026"; nunca "30/12/2026" por offset UTC

---

### REQ-CEF-11 — Conducción desde CerrarGestionButton (toque mínimo)

Cuando `CerrarGestionButton` detecta que los 12 períodos están cerrados pero
el backend rechaza el cierre con `GESTION_CON_CIERRES_NO_CONTABILIZADOS` (o
similar), DEBE mostrar un hint o enlace hacia la pantalla de cierre del
ejercicio en lugar de un toast genérico.

Alternativa preferida: incluir en la pantalla `/gestiones/:id/cierre` un CTA
de conducción visible ANTES de que el contador llegue a "Cerrar gestión", de
forma que el flujo sea autodescubridor. En ese caso, `CerrarGestionButton`
no se modifica.

La decisión concreta (tocar el botón vs. solo la pantalla de cierre) DEBE
tomarse en el design, considerando el riesgo de regresión en
`cerrar-gestion-button.test.tsx`. Esta spec exige la conducción pero deja
el mecanismo al design.

#### Escenario: flujo autodescubridor desde períodos fiscales
- **DADO** un contador con todos los períodos cerrados
- **CUANDO** navega a la sección de períodos
- **ENTONCES** hay algún enlace o indicación que lo conduce a "Cierre del
  ejercicio" antes de intentar "Cerrar gestión"

---

## Mapeo de errores del backend a mensajes en español

La feature extiende `mensajePeriodosFiscales` (o crea un helper dedicado
`mensajeCierreEjercicio`) con los siguientes códigos:

| Código backend | Mensaje español para el usuario |
|---|---|
| `CIERRE_EJERCICIO_PERIODO_NO_LISTO` | "No todos los períodos anteriores están cerrados o el período de cierre no está abierto." |
| `CIERRE_EJERCICIO_GESTION_YA_CERRADA` | "La gestión ya está cerrada." |
| `CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO` | "No se puede regenerar: al menos un asiento de cierre ya está contabilizado." |
| `CIERRE_EJERCICIO_SIN_MOVIMIENTO` | "La gestión no tiene cuentas de resultado con movimiento." |
| `CIERRE_EJERCICIO_CUENTA_DESTINO_FALTANTE` | "Falta configurar la cuenta de resultado del ejercicio en Configuración contable." |
| `CIERRE_EJERCICIO_GESTION_NO_ENCONTRADA` | "No se encontró la gestión solicitada." |
| `COMPROBANTE_NO_EN_BORRADOR` | "El asiento de cierre ya fue contabilizado o no puede modificarse." |

Si el backend devuelve un código no listado, usar el campo `message` de la
respuesta (ya viene en español por contrato del backend, §6.4 CLAUDE.md).

---

## Tests requeridos

Los tests viven al lado del código (frontend CLAUDE.md §9). Stack: Vitest +
@testing-library/react + @testing-library/user-event.

### `lib/labels-origen-cierre.test.ts`
- Los 3 mapeos de origenTipo → label español.
- Fallback para valor desconocido.

### `components/asiento-cierre-card.test.tsx`
- Renders cabecera con label de `origenTipo`, glosa, badge de estado.
- Skeleton mientras `useComprobante` carga.
- Tabla de líneas: muestra código+nombre de cuenta, monto Debe, monto Haber.
- Monto string preservado (no recalculado).
- Fecha formateada sin UTC.

### `components/contabilizar-cierre-bar.test.tsx`
- Botón habilitado si el usuario tiene `contabilidad.asientos.post`.
- Botón disabled + tooltip si no tiene permiso. Envolver en `<TooltipProvider>`.
- Botón disabled mientras `isPending`.
- Muestra progreso: pendiente → contabilizando → contabilizado / error.

### `pages/cierre-ejercicio-page.test.tsx`
- Estado SIN_CIERRES: renderiza empty state + botón generar.
- Botón generar disabled sin `contabilidad.gestiones.cerrar`.
- Estado EN_BORRADOR: renderiza N cards (≤3, SKIP-on-zero).
- Botón "Regenerar" disabled si algún cierre es CONTABILIZADO.
- Estado TODOS_CONTABILIZADO: banner de confirmación + CTA "Cerrar gestión".
- 404 → banner de error + botón "Volver a gestiones".
- Skeleton durante carga inicial.

Mock de permisos: `vi.mock('@/lib/use-permissions', async (o) => ({ ...(await o()),
usePermissions: () => ({ has, hasAll, isOwner, permissions }) }))` (§14.7).

---

## Notas sobre el diseño de estado derivado

La pantalla NO almacena el estado de la UI en Zustand ni en `useState` ad-hoc.
El estado se DERIVA de `useCierre(gestionId).data.cierres` en cada render:

```
cierres.length === 0               → SIN_CIERRES
cierres.every(c => c.estado === 'CONTABILIZADO') → TODOS_CONTABILIZADO
cierres.some(c => c.estado === 'CONTABILIZADO')  → PARCIALMENTE_CONTABILIZADO
else                               → EN_BORRADOR
```

El progreso de la contabilización secuencial SÍ usa `useState` local
en `ContabilizarCierreBar` (es UI state local, no server state, per §4
del CLAUDE.md frontend).
