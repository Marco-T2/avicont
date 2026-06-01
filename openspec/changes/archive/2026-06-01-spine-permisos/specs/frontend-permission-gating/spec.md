# frontend-permission-gating — Especificación

<!--
Última edición: 2026-05-31
Última revisión contra core: 2026-05-31
Owner: backend-lead
-->

> Fecha: 2026-05-31
> Fase: spec
> Change: spine-permisos
> Capability: `frontend-permission-gating` (nueva — no existe spec previa)

---

## Propósito

Capa de gating de permisos en el frontend: hook `usePermissions`, componente
`<Can>`, extensión de `NavItem` con `requiredPermission`, y comportamiento de
páginas-ruta cuando el usuario no tiene el permiso requerido.

El gating es **solo UX**: oculta o deshabilita elementos para evitar fricciones,
pero NO reemplaza la autorización del backend. Un 403 del backend es siempre
posible y debe manejarse como error de red, no como bug.

---

## Glosario

- **Permiso efectivo**: string exacto del catálogo que el usuario tiene en su tenant activo. Viene de `GET /api/me/permissions`.
- **`isOwner`**: flag que indica que el usuario es OWNER del tenant y, por tanto, tiene acceso total sin chequear permisos individuales.
- **Gating de nav**: ocultar un ítem del menú si el usuario no tiene el permiso requerido.
- **Gating de acción**: deshabilitar un botón de acción con tooltip explicativo si el usuario no tiene el permiso.
- **Gating de ruta**: la página no muestra datos y muestra una pantalla de acceso denegado si el usuario navega a una URL sin el permiso requerido.
- **Patrón mixto**: el nav oculta ítems (sin permiso → invisible), las acciones deshabilitan (sin permiso → visible pero deshabilitado con tooltip).

---

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

### REQ-FG-01: Hook usePermissions

El sistema DEBE proveer un hook `usePermissions()` en `src/features/auth/hooks/use-permissions.ts`
(o ruta análoga dentro de `features/auth/`) que exponga:

```ts
{
  permissions: Set<string>,   // conjunto de permisos efectivos del usuario
  isOwner: boolean,
  has(permiso: string): boolean,  // true si isOwner || permiso está en permissions
  isLoading: boolean,         // true mientras la query a GET /api/me/permissions está en vuelo
}
```

El hook DEBE obtener los datos de `GET /api/me/permissions` usando TanStack Query.
NO DEBE leer el JWT decodificado del `auth-store` — los permisos efectivos vienen
del servidor, no del token.

`has()` DEBE retornar `true` si `isOwner === true`, independientemente del set de permisos.
`has()` DEBE retornar `true` si el permiso exacto está en el set.
`has()` DEBE retornar `false` en cualquier otro caso.

Mientras `isLoading === true`, `has()` DEBE retornar `false` (comportamiento conservador).

#### Escenario: usuario con permiso — has() retorna true

- DADO un usuario cuyos permisos efectivos incluyen `"contabilidad.libro-diario.read"`
- CUANDO el hook está cargado (`isLoading: false`)
- ENTONCES `has("contabilidad.libro-diario.read")` retorna `true`

#### Escenario: usuario sin permiso — has() retorna false

- DADO un usuario cuyos permisos efectivos NO incluyen `"contabilidad.libro-mayor.read"`
- CUANDO el hook está cargado (`isLoading: false`)
- ENTONCES `has("contabilidad.libro-mayor.read")` retorna `false`

#### Escenario: isOwner — has() siempre retorna true

- DADO un usuario con `isOwner: true`
- CUANDO se llama `has("cualquier.permiso.valido")`
- ENTONCES retorna `true` sin chequear el set de `permissions`

#### Escenario: mientras carga — has() retorna false conservador

- DADO que la query a `GET /api/me/permissions` está en vuelo (`isLoading: true`)
- CUANDO se llama `has("contabilidad.libro-diario.read")`
- ENTONCES retorna `false` (conservador — no muestra contenido hasta confirmar)

---

### REQ-FG-02: Componente Can

El sistema DEBE proveer un componente `<Can permission="x">children</Can>`
en `src/components/shared/can.tsx` (o ruta análoga en `components/shared/`).

Comportamiento:
- Si `has(permission)` es `true`: renderiza `children`.
- Si `has(permission)` es `false`: NO renderiza nada (retorna `null`).
- Si no se pasa `permission` (prop opcional): siempre renderiza `children`.
- Mientras `isLoading`: NO renderiza `children` (conservador, evita flash de contenido).

`<Can>` DEBE usar `usePermissions()` internamente. NO DEBE recibir los permisos por prop.

`<Can>` DEBE ser componente tipado estrictamente (cero `any`).

#### Escenario: con permiso — renderiza children

- DADO un usuario con `"contabilidad.asientos.create"` en sus permisos efectivos
- CUANDO se monta `<Can permission="contabilidad.asientos.create"><BotoNuevoAsiento /></Can>`
- ENTONCES `<BotoNuevoAsiento />` está presente en el DOM

#### Escenario: sin permiso — no renderiza nada

- DADO un usuario sin `"contabilidad.asientos.create"`
- CUANDO se monta `<Can permission="contabilidad.asientos.create"><BotoNuevoAsiento /></Can>`
- ENTONCES el DOM no contiene `<BotoNuevoAsiento />` (y tampoco un nodo vacío visible)

#### Escenario: sin prop permission — siempre renderiza

- CUANDO se monta `<Can><ContenidoPublico /></Can>` sin prop `permission`
- ENTONCES `<ContenidoPublico />` siempre está en el DOM independientemente de los permisos

#### Escenario: mientras carga — no renderiza (sin flash)

- DADO que `isLoading` es `true`
- CUANDO se monta `<Can permission="contabilidad.asientos.create"><Formulario /></Can>`
- ENTONCES `<Formulario />` NO está en el DOM hasta que la carga termine

---

### REQ-FG-03: Gating de acciones — deshabilitar con tooltip

Para botones de acción (crear, editar, anular, etc.), el patrón DEBE ser:
**deshabilitar el botón** (no ocultarlo) y mostrar un tooltip con texto
`"No tenés permiso para realizar esta acción"` cuando el usuario no tiene
el permiso requerido.

El componente `<ActionButton>` (o el patrón equivalente documentado en design)
DEBE aceptar una prop `requiredPermission?: string` que activa este comportamiento.

Razón del patrón mixto (ocultar en nav, deshabilitar en acciones): el nav es
navegación estructural (si no ves la sección, no hay confusión); los botones
de acción están dentro de una página que el usuario SÍ puede ver (ej. puede
leer comprobantes pero no crearlos), y deshabilitarlos con tooltip explica qué
está pasando.

#### Escenario: acción sin permiso — botón deshabilitado con tooltip

- DADO un usuario sin `"contabilidad.asientos.create"`
- CUANDO navega a la página de Comprobantes (que sí puede ver)
- ENTONCES el botón "Nuevo comprobante" está en el DOM pero con `disabled`
- Y al hacer hover aparece un Tooltip con texto que indica falta de permiso

#### Escenario: acción con permiso — botón habilitado

- DADO un usuario con `"contabilidad.asientos.create"`
- CUANDO navega a la página de Comprobantes
- ENTONCES el botón "Nuevo comprobante" está habilitado y sin tooltip de permiso

#### Escenario: mientras carga — botón deshabilitado (conservador)

- DADO que `isLoading` es `true`
- CUANDO la página de Comprobantes está montada
- ENTONCES el botón "Nuevo comprobante" está deshabilitado hasta confirmar permisos

---

### REQ-FG-04: NavItem con requiredPermission opcional

El tipo `NavItem` en `src/components/nav-items.ts` DEBE agregar la prop
`requiredPermission?: string`.

El componente `NavList` (o `NavItemRenderer`) DEBE evaluar `requiredPermission`:
- Si está presente y `has(requiredPermission)` es `false`: el ítem NO se renderiza.
- Si está presente y `has(requiredPermission)` es `true`: el ítem se renderiza normalmente.
- Si está ausente (undefined): el ítem siempre se renderiza.

`NavList` DEBE llamar a `usePermissions()` una sola vez y pasar el resultado
a cada item, NO llamar al hook una vez por item.

Ítems con `requiredPermission` que estén en modo `disabled: true` NO DEBEN
ocultarse por permiso — el flag `disabled` es independiente (ítem en construcción).

#### Escenario: ítem con permiso — visible en el nav

- DADO un usuario con `"contabilidad.libro-diario.read"` en sus permisos
- CUANDO se renderiza `NavList`
- ENTONCES el ítem "Libro Diario" (con `requiredPermission: "contabilidad.libro-diario.read"`) está en el DOM

#### Escenario: ítem sin permiso — oculto en el nav

- DADO un usuario sin `"contabilidad.libro-diario.read"`
- CUANDO se renderiza `NavList`
- ENTONCES el ítem "Libro Diario" NO está en el DOM

#### Escenario: ítem sin requiredPermission — siempre visible

- CUANDO se renderiza `NavList` con cualquier usuario autenticado
- ENTONCES los ítems sin `requiredPermission` (ej. "Panel", "Comprobantes") siempre están visibles

#### Escenario: isOwner — todos los ítems visibles

- DADO un usuario con `isOwner: true`
- CUANDO se renderiza `NavList`
- ENTONCES todos los ítems con `requiredPermission` son visibles (has() retorna true)

#### Escenario: mientras carga — ítems con requiredPermission ocultos

- DADO que `isLoading` es `true`
- CUANDO se renderiza `NavList`
- ENTONCES los ítems con `requiredPermission` NO están en el DOM (conservador)
- Y los ítems sin `requiredPermission` sí están visibles

---

### REQ-FG-05: Páginas-ruta gateadas — acceso denegado visible

Las páginas-ruta que requieren un permiso DEBEN mostrar una pantalla de acceso
denegado visible cuando el usuario abre la URL sin el permiso requerido.

El contrato observable es:
1. El usuario NO ve los datos del reporte/página.
2. El usuario SÍ ve una indicación clara de que no tiene acceso (título, descripción, y opcionalmente un CTA para volver al panel).
3. La URL NO cambia (no redirect automático a `/`). El usuario puede copiar/compartir la URL y, si obtiene el permiso más tarde, la misma URL funciona.

Las páginas-ruta inicialmente gateadas por este change son:
- `/libros/diario` → permiso `contabilidad.libro-diario.read`
- `/libros/mayor` → permiso `contabilidad.libro-mayor.read`
- `/eeff/balance` → permiso `contabilidad.eeff.read`
- `/eeff/resultados` → permiso `contabilidad.eeff.read`

El mecanismo de implementación PUEDE ser:
(a) Un componente `<RequirePermission>` que wrappea la página en el router, o
(b) Un early return en la función de la página al inicio del render.
El diseño elegirá el mecanismo; esta spec solo fija el comportamiento observable.

#### Escenario: usuario sin permiso navega a /libros/diario

- DADO un usuario sin `"contabilidad.libro-diario.read"`
- CUANDO navega a `/libros/diario` (por URL directa o link externo)
- ENTONCES NO ve la tabla del Libro Diario ni los filtros
- Y ve un componente de acceso denegado con indicación clara
- Y la URL permanece en `/libros/diario` (no redirige)

#### Escenario: usuario con permiso — página funciona normalmente

- DADO un usuario con `"contabilidad.libro-diario.read"`
- CUANDO navega a `/libros/diario`
- ENTONCES ve la pantalla del Libro Diario normalmente

#### Escenario: mientras carga — página no muestra datos prematuramente

- DADO que `isLoading` es `true` (permisos no resueltos aún)
- CUANDO la página está montada
- ENTONCES NO muestra el contenido de la página (muestra skeleton o pantalla de carga)
- Y NO muestra la pantalla de acceso denegado aún (espera a tener la respuesta)

#### Escenario: isOwner — accede a todas las páginas gateadas

- DADO un usuario con `isOwner: true`
- CUANDO navega a cualquier página gateada (`/libros/diario`, `/eeff/balance`, etc.)
- ENTONCES la página se muestra normalmente

---

### REQ-FG-06: Query key y staleTime de usePermissions

El hook `usePermissions()` DEBE usar query key `['me', 'permissions']` para que
las invalidaciones del cliente sean predecibles.

El `staleTime` DEBE ser de al menos 60 segundos (1 minuto) para evitar
refetches innecesarios mientras el usuario navega. Los permisos cambian raramente
(solo cuando un admin edita roles), y el admin que los cambia puede emitir un
nuevo token.

La query DEBE estar habilitada solo cuando hay `accessToken` en el `auth-store`
(usuario autenticado). NO DEBE hacer el fetch en usuarios no autenticados.

#### Escenario: query deshabilitada sin accessToken

- DADO que el `auth-store` no tiene `accessToken` (usuario no autenticado)
- CUANDO se monta un componente que usa `usePermissions()`
- ENTONCES NO se realiza ningún request a `GET /api/me/permissions`

#### Escenario: invalidación post-cambio de rol

- DADO que un admin cambia el rol de un usuario (futuro: trigger de invalidación)
- CUANDO se invalida `['me', 'permissions']` en el `queryClient`
- ENTONCES `usePermissions()` refetch el endpoint y actualiza el set de permisos

---

### REQ-FG-07: Sin lógica de permisos en componentes individuales

Los componentes presentacionales NO DEBEN llamar a `usePermissions()` directamente
para condicionar su render. El gating se hace en:
1. La **página contenedora** (early return o `<RequirePermission>`).
2. El componente `<Can>` para secciones dentro de la página.
3. El `NavList` para ítems de navegación.

Esto mantiene los componentes presentacionales testeables sin mockear el hook de permisos.

---

## Notas de la capability

- **El gating es solo UX**: el backend sigue siendo la autoridad de autorización. Un usuario
  con acceso a la URL que manipule el estado local para ver datos siempre recibirá 403 del
  backend si no tiene el permiso. Esta nota NO es un requisito testeable — es una restricción
  de diseño que define el nivel de confianza del sistema.
- **No implementar cache local de permisos** fuera de TanStack Query (no copiar a Zustand).
  Ver `frontend/CLAUDE.md §4` Anti-F-05.
- **Tipado estricto**: el tipo `NavItem.requiredPermission` es `string` literal (un permiso
  exacto del catálogo), no un patrón con wildcard. La expansión de wildcards la hace el backend.
