# shell-vertical — Especificación

<!--
Última edición: 2026-06-02
Última revisión contra core: 2026-06-02
Owner: backend-lead
-->

> Fecha: 2026-06-02
> Fase: spec (live)
> Proyecto: avicont
> Capability nueva: `shell-vertical` (no existía spec previa)
> Origen: change `shell-por-vertical` (archivado 2026-06-02)
> Stack: frontend (Vite + React 19 + TanStack Query)

---

## Propósito

El frontend DEBE afirmar explícitamente el vertical activo de la organización
(`CONTABILIDAD` / `GRANJA`), en vez de inferirlo como efecto colateral del RBAC.

Esta capability cubre: el hook que expone el vertical activo desde el cache
compartido de `/me/permissions`, el filtrado del nav por vertical (aditivo al
RBAC), la ruta default por vertical, y el tratamiento del caso `null` (org sin
vertical asignado).

> **Dependencia**: requiere el campo `vertical` en la respuesta de
> `GET /api/me/permissions` (REQ-MP-V1 en `openspec/specs/me-permissions/spec.md`).

---

## Glosario

- **Vertical**: clasificación de producto mutuamente exclusiva de una organización.
  Valores de dominio (CLAUDE.md §1, español, mayúsculas): `CONTABILIDAD`, `GRANJA`,
  o `null` (organización sin vertical asignado — caso `OTROS` del alta, o data legacy).
- **Vertical activo (`verticalActivo`)**: el vertical de la organización indicada por
  `activeTenantId` del JWT en el momento de la consulta. NO viaja en el JWT (se resuelve
  por server state).
- **Item de administración**: ítem de nav del namespace `organizacion.*` (Miembros,
  Roles, Módulos activos, Configuración) — visible en AMBOS verticales porque la
  administración es cross-vertical.
- **Item de operación**: ítem de nav `contabilidad.*` o `granja.*` — visible solo en
  su vertical.
- **Fail-closed (vertical)**: mientras el vertical NO está resuelto (query pending o sin
  data), el frontend NO asume un vertical por defecto: oculta los items de operación de
  ambos verticales y NO redirige a un dashboard de operación. Evita el flash de la
  pantalla contable antes de saber el vertical.

---

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

### REQ-SV-1: Hook de vertical activo desde el cache compartido

El frontend DEBE exponer el vertical activo a través de un hook que lee del MISMO
cache de TanStack Query que `usePermissions` (queryKey `['me-permissions', activeTenantId]`),
SIN realizar una segunda request de red.

El hook DEBE ser **fail-closed**:

- Mientras la query está pending o sin data → el vertical expuesto es `undefined`
  (estado "todavía no sé"), NO un valor por defecto.
- Cuando hay data → expone el `vertical` recibido (`'CONTABILIDAD' | 'GRANJA' | null`).

El vertical es **server state** y NO se DEBE duplicar en Zustand / `auth-store`
(Anti-F-05). No DEBE agregarse al JWT.

#### Escenario: comparte cache, no agrega red

- DADO que `usePermissions()` ya pobló el cache `['me-permissions', activeTenantId]`
- CUANDO un componente usa el hook de vertical
- ENTONCES obtiene el `vertical` del cache existente
- Y NO se dispara una segunda request HTTP a `/me/*`

#### Escenario: fail-closed mientras carga

- DADO que la query de `/me/permissions` está pending (sin data)
- CUANDO el hook de vertical se evalúa
- ENTONCES devuelve `undefined` (estado indeterminado)
- Y NO devuelve `'CONTABILIDAD'` ni ningún vertical por defecto

#### Escenario: refleja el cambio de tenant sin staleness

- DADO un usuario que cambia de una org `CONTABILIDAD` a una org `GRANJA` (switch-tenant)
- CUANDO el `activeTenantId` cambia y la query se re-ejecuta con la nueva key
- ENTONCES el hook expone `'GRANJA'` una vez resuelta la nueva query
- Y NO conserva el vertical de la org anterior

---

### REQ-SV-2: Filtrado del nav por vertical (aditivo al RBAC)

`NavItem` DEBE ganar un campo opcional `vertical?: 'CONTABILIDAD' | 'GRANJA'`.

- Items de operación (`contabilidad.*`) DEBEN declarar `vertical: 'CONTABILIDAD'`.
- Items de operación (`granja.*`) DEBEN declarar `vertical: 'GRANJA'`.
- Items de administración (`organizacion.*`) y el "Panel" raíz NO DEBEN declarar
  `vertical` → visibles en AMBOS verticales.

`nav-list.tsx` DEBE filtrar un ítem como visible si y solo si se cumplen AMBOS predicados:

1. **Permiso** (gating actual, intacto): `item.requiredPermission === undefined || has(item.requiredPermission)`.
2. **Vertical** (gating nuevo): `item.vertical === undefined || item.vertical === verticalActivo`.

El predicado de vertical es **fail-closed**: si `verticalActivo` es `undefined`
(cargando) o `null` (org sin vertical), ningún ítem con `vertical` declarado pasa el
filtro (no se muestran items de operación de ningún vertical). Los items de
administración (sin `vertical`) siguen sujetos solo a su `requiredPermission`.

#### Escenario: granjero NO ve items de contabilidad (caso negativo)

- DADO `verticalActivo === 'GRANJA'`
- Y un usuario con permisos `granja.*` y `organizacion.*`
- CUANDO se renderiza el nav
- ENTONCES NO aparecen los items `contabilidad.*` (Plan de cuentas, Comprobantes,
  Libro Diario, Libro Mayor, Balance General, Estado de Resultados, Contactos,
  Tipos de documento, Documentos físicos, Períodos fiscales)
- Y SÍ aparecen los items `granja.*` (Dashboard, Mis Lotes, Tipos de Registro)

#### Escenario: contable NO ve items de granja (caso negativo)

- DADO `verticalActivo === 'CONTABILIDAD'`
- Y un usuario con permisos `contabilidad.*` y `organizacion.*`
- CUANDO se renderiza el nav
- ENTONCES NO aparecen los items `granja.*` (Dashboard de granja, Mis Lotes,
  Tipos de Registro)
- Y SÍ aparecen los items `contabilidad.*` para los que tiene permiso

#### Escenario: items de administración SIEMPRE visibles en ambos verticales

- DADO un usuario OWNER/ADMIN (tiene `organizacion.*`)
- CUANDO `verticalActivo === 'GRANJA'`
- ENTONCES los items `organizacion.*` (Miembros, Roles, Módulos activos) están visibles
- Y CUANDO `verticalActivo === 'CONTABILIDAD'`
- ENTONCES esos mismos items de administración siguen visibles
- Y el "Panel" raíz está visible en ambos casos

#### Escenario: defensa en profundidad — vertical oculta aunque el permiso pasara

- DADO `verticalActivo === 'GRANJA'`
- Y (hipotético error de configuración RBAC) un usuario que recibió por error
  un permiso `contabilidad.eeff.read`
- CUANDO se renderiza el nav
- ENTONCES el ítem "Balance General" NO aparece (el filtro de vertical lo oculta
  aunque `has()` diera true)

#### Escenario: fail-closed — vertical sin resolver oculta toda operación

- DADO que `verticalActivo === undefined` (query de vertical pending)
- CUANDO se renderiza el nav
- ENTONCES ningún ítem con `vertical` declarado aparece (ni contabilidad ni granja)
- Y los items de administración aparecen según su `requiredPermission`
- Y el "Panel" raíz aparece

#### Escenario: org sin vertical (`null`) — solo administración en el nav

- DADO `verticalActivo === null` (org tipo `OTROS`)
- CUANDO se renderiza el nav
- ENTONCES no aparece ningún ítem de operación (contabilidad ni granja)
- Y aparecen los items de administración para los que el usuario tenga permiso

---

### REQ-SV-3: Ruta default por vertical

La ruta index `/` DEBE redirigir al destino correspondiente al vertical activo,
en lugar de renderizar siempre el dashboard contable:

- `verticalActivo === 'GRANJA'` → navegar a `/granja` (dashboard de granja).
- `verticalActivo === 'CONTABILIDAD'` → renderizar el `DashboardPage` contable actual.
- `verticalActivo === null` → llevar al usuario al flujo de activación de módulo
  existente (`/settings/features` — "Módulos activos"), NO a un dashboard de operación.
  Ver REQ-SV-4.

El redirect DEBE ser **fail-closed contra el flash**: mientras `verticalActivo`
es `undefined` (query pending), `/` DEBE mostrar un skeleton/estado de carga y NO
renderizar el `DashboardPage` contable ni redirigir prematuramente. Solo una vez
resuelto el vertical se decide el destino.

El redirect DEBE usar navegación de React Router (`<Navigate replace>` o
`useNavigate`), NUNCA `window.location` (Anti-F-09). El uso de `replace` evita que
`/` quede en el historial y cause un back-loop.

El catch-all `path: '*' → <Navigate to="/" replace />` se mantiene: cualquier ruta
desconocida cae en `/`, que ahora resuelve por vertical.

#### Escenario: granjero aterriza en su dashboard de granja

- DADO `verticalActivo === 'GRANJA'`
- CUANDO el usuario navega a `/` (login, recarga, o catch-all)
- ENTONCES es redirigido a `/granja`
- Y NO ve, ni siquiera por un instante, el dashboard contable

#### Escenario: contable aterriza en el dashboard contable

- DADO `verticalActivo === 'CONTABILIDAD'`
- CUANDO el usuario navega a `/`
- ENTONCES se renderiza el `DashboardPage` contable actual (comportamiento previo)
- Y NO hay redirect adicional

#### Escenario: vertical sin resolver — skeleton, sin flash (caso negativo)

- DADO que la query de `/me/permissions` está pending (`verticalActivo === undefined`)
- CUANDO el usuario está en `/`
- ENTONCES se muestra un skeleton/estado de carga
- Y NO se renderiza el `DashboardPage` contable
- Y NO se ejecuta ningún `<Navigate>` hasta que el vertical resuelve

#### Escenario: org sin vertical — al flujo de activación, no a un dashboard (caso negativo)

- DADO `verticalActivo === null`
- CUANDO el usuario navega a `/`
- ENTONCES NO se renderiza el dashboard contable
- Y NO se redirige a `/granja`
- Y se lo lleva al flujo de activación de módulo (REQ-SV-4)

---

### REQ-SV-4: Tratamiento de `vertical: null` (sin onboarding paralelo)

Cuando `verticalActivo === null`, el frontend NO DEBE asumir contabilidad por
defecto NI inventar una pantalla de onboarding nueva. El tratamiento depende
del rol del usuario:

- **Admin** (`isOwner` o `useHasSystemRole(['OWNER','ADMIN'])` de
  `@/lib/use-permissions`): DEBE ver un mensaje informativo "No hay un módulo
  activo" con un botón/enlace a `/settings/features` ("Activá un módulo").
  El gateo se hace con el hook de SystemRole, NO con `has()` de permiso fino,
  porque la pantalla de activación está gateada por SystemRole en el backend.
- **No-admin**: DEBE ver el mensaje informativo "Tu organización no tiene un
  módulo activo. Pedile a tu administrador que active uno." SIN ningún botón
  de acción (no se puede hacer nada desde ese rol).

Ambos casos se implementan mediante un componente liviano `<SinModulo>` (NO
un redirect a `/settings/features`). El NO-admin especialmente NO debe ser
redirigido: el RBAC de `/settings/features` le mostraría el estado denegado
de `RequirePermission`, que no es la UX correcta.

> Nota de no-deuda: este change NO crea una pantalla de onboarding nueva. El
> componente `<SinModulo>` es liviano (mensaje + botón condicional). Si en el
> futuro `null` se vuelve un estado común, se evaluará un onboarding más rico
> en un change aparte.

#### Escenario: admin con org sin vertical → mensaje con enlace a activación

- DADO `verticalActivo === null`
- Y un usuario OWNER o ADMIN (`useHasSystemRole(['OWNER','ADMIN'])` es `true`)
- CUANDO navega a `/`
- ENTONCES ve el componente `<SinModulo>` con el mensaje "No hay un módulo activo"
- Y ve un botón/enlace que lleva a `/settings/features`
- Y NO es redirigido directamente (ve el mensaje y decide)

#### Escenario: miembro sin rol admin y org sin vertical → mensaje sin acción

- DADO `verticalActivo === null`
- Y un usuario que NO es OWNER ni ADMIN
- CUANDO navega a `/`
- ENTONCES ve el componente `<SinModulo>` con el mensaje "Tu organización no
  tiene un módulo activo. Pedile a tu administrador que active uno."
- Y NO hay botón de acción (no se puede navegar a `/settings/features` desde acá)
- Y el nav no muestra items de operación de ningún vertical (REQ-SV-2)
