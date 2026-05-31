# Delta Spec: libros-filtro-cuenta

<!--
Última edición: 2026-05-30
Última revisión contra core: 2026-05-30
Owner: backend-lead
-->

> Fecha: 2026-05-30
> Fase: spec
> Change: `libros-filtro-cuenta`
> Proyecto: avicont
> Specs vivos afectados: `openspec/specs/libro-diario/spec.md`

---

## Propósito de este delta

Este change agrega **filtro por Cuenta** a dos capabilities de reportes:

- **`libro-diario`** (backend + frontend): nuevo parámetro `cuentaId` en
  `GET /api/libros/diario`. El filtro es NUEVO en esta capability — el spec vivo
  actual (REQ-LD-01 al REQ-LD-11) no lo contempla.
- **`libro-mayor`** (frontend únicamente): el backend ya soporta `cuentaId`
  (REQ-LM-07 y REQ-LM-08 del spec vivo). El change SOLO expone el selector de
  cuenta en la UI del Mayor. No hay delta de comportamiento backend nuevo.

Este documento especifica los **requisitos delta** que se incorporan al spec vivo
al momento de la implementación. Los requisitos ya existentes (REQ-LD-01 al
REQ-LD-11, REQ-LM-01 al REQ-LM-13) NO se repiten aquí — siguen vigentes sin cambio.

---

## Glosario adicional

- **Cuenta de detalle**: cuenta con `esDetalle = true`. Única categoría con
  movimientos directos en `lineas_comprobante`. Las cuentas agrupadoras
  (`esDetalle = false`) no pueden filtrarse en el Libro Diario.
- **Asiento completo**: comprobante con TODAS sus `lineas_comprobante`, no solo
  las que pertenecen a la cuenta filtrada. La semántica elegida (Opción A)
  preserva la visualización de la partida doble completa.

---

## Capability `libro-diario` — Requisitos delta (nuevos)

Los siguientes requisitos se **agregan** al spec vivo
`openspec/specs/libro-diario/spec.md` como REQ-LD-12 en adelante.

---

### REQ-LD-12: Filtro por cuenta — parámetro opcional

El endpoint `GET /api/libros/diario` DEBE aceptar el parámetro opcional
`cuentaId` (UUID, formato RFC-4122).

Cuando `cuentaId` está presente, el sistema DEBE devolver únicamente los
comprobantes (asientos completos) que tengan **al menos una línea** asociada a
esa cuenta en el rango activo, respetando los filtros de estado y anulados ya
vigentes (REQ-LD-02 y REQ-LD-03).

Cuando `cuentaId` está ausente, el comportamiento actual (REQ-LD-01 al REQ-LD-11)
NO DEBE cambiar. La omisión de `cuentaId` equivale a "sin filtro de cuenta".

#### Escenario: filtro con cuenta válida con movimientos

- DADO un tenant con cuenta `1.1.01 Caja Bolivianos` (`esDetalle = true`)
- Y tres comprobantes CONTABILIZADOS en el rango, dos de los cuales tienen
  líneas en `1.1.01` y uno solo tiene líneas en otras cuentas
- CUANDO se consulta `GET /api/libros/diario?periodoFiscalId=<id>&cuentaId=<id-caja-bolivianos>`
- ENTONCES la respuesta incluye los dos comprobantes con líneas en `1.1.01`
- Y CADA asiento retornado incluye TODAS sus líneas (no solo la de `1.1.01`)
- Y el tercer comprobante (sin líneas en `1.1.01`) no aparece

#### Escenario: cuenta válida sin movimientos en el rango — resultado vacío

- DADO una cuenta `3.1.01 Capital Social` (`esDetalle = true`) sin movimientos
  en el período consultado
- CUANDO se consulta `GET /api/libros/diario?periodoFiscalId=<id>&cuentaId=<id-capital>`
- ENTONCES el sistema responde 200 con `asientos: []`,
  `totalDebeBob: "0.00"`, `totalHaberBob: "0.00"`
- Y NO se devuelve error

#### Escenario: regresión — sin cuentaId el comportamiento es idéntico al actual

- DADO un tenant con asientos en el rango
- CUANDO se consulta `GET /api/libros/diario?periodoFiscalId=<id>` sin `cuentaId`
- ENTONCES la respuesta es idéntica a la que devolvía antes de este change
- Y el filtro de cuenta NO se aplica de ninguna forma

---

### REQ-LD-13: Validación de cuenta — no encontrada (404)

Si se especifica `cuentaId` y la cuenta no existe o no pertenece al tenant activo,
el sistema DEBE responder HTTP 404 con código `LIBRO_DIARIO_CUENTA_NO_ENCONTRADA`.

El sistema NO DEBE distinguir "cuenta inexistente" de "cuenta de otro tenant" en
el mensaje de error — ambos casos devuelven el mismo 404 (§4.2 CLAUDE.md —
defense in depth anti cross-tenant).

#### Escenario: cuenta inexistente — 404

- CUANDO se consulta con un `cuentaId` que no existe en ningún tenant
- ENTONCES el sistema responde HTTP 404 con `LIBRO_DIARIO_CUENTA_NO_ENCONTRADA`

#### Escenario: cuenta de otro tenant — 404 (no fuga cross-tenant)

- DADO que la cuenta `<id-cuenta-tenant-B>` pertenece al Tenant B
- CUANDO el usuario del Tenant A consulta con ese `cuentaId`
- ENTONCES el sistema responde HTTP 404 con `LIBRO_DIARIO_CUENTA_NO_ENCONTRADA`
- Y NO devuelve ningún dato del Tenant B

---

### REQ-LD-14: Validación de cuenta — agrupadora rechazada (400)

Si se especifica `cuentaId` de una cuenta con `esDetalle = false` (cuenta
agrupadora / de nivel), el sistema DEBE rechazar la solicitud con HTTP 400 y
código `LIBRO_DIARIO_CUENTA_NO_DETALLE`.

Las cuentas agrupadoras no tienen líneas directas y no pueden usarse como
criterio de filtro en el Libro Diario.

#### Escenario: cuenta agrupadora rechazada

- DADO que existe la cuenta `1.1` con `esDetalle = false` (cabecera del grupo
  Caja y Bancos)
- CUANDO se consulta con el `cuentaId` de esa cuenta agrupadora
- ENTONCES el sistema responde HTTP 400 con `LIBRO_DIARIO_CUENTA_NO_DETALLE`

#### Escenario: cuenta de detalle — válida

- DADO que existe la cuenta `1.1.01 Caja Bolivianos` con `esDetalle = true`
- CUANDO se consulta con su `cuentaId`
- ENTONCES el sistema responde 200 (la validación pasa; el resultado puede ser vacío)

---

### REQ-LD-15: Semántica del filtro — asiento completo (Opción A)

Al filtrar por `cuentaId`, el sistema DEBE devolver el **comprobante completo**
(cabecera + TODAS sus líneas) de cada asiento que contenga al menos una línea
asociada a esa cuenta. NO DEBE devolver solo las líneas de esa cuenta.

Esta semántica preserva la partida doble completa visible en pantalla: el
contador puede ver el contraasiento de cada movimiento de la cuenta filtrada.

Ejemplo: si un comprobante tiene línea A (debe Bs 1000 en `1.1.01`) y línea B
(haber Bs 1000 en `2.1.01`), y se filtra por `1.1.01`, el comprobante aparece
con AMBAS líneas (A y B).

Los `totalDebeBob` y `totalHaberBob` de la respuesta DEBEN reflejar la suma de
TODAS las líneas de los comprobantes incluidos (no solo las líneas de la cuenta
filtrada).

#### Escenario: totales reflejan asientos completos, no solo la cuenta filtrada

- DADO un asiento CONTABILIZADO con:
  - Línea 1: debe Bs 1000 en cuenta `1.1.01` (la filtrada)
  - Línea 2: haber Bs 1000 en cuenta `2.1.01`
- CUANDO se consulta con `cuentaId` de `1.1.01`
- ENTONCES la respuesta incluye ese asiento con ambas líneas
- Y `totalDebeBob = "1000.00"`, `totalHaberBob = "1000.00"`
  (partida doble preservada en los totales)

---

### REQ-LD-16: Tope defensivo — count con filtro de cuenta aplicado

El tope defensivo (REQ-LD-10, límite de 5.000 asientos) DEBE contarse con el
**mismo filtro de cuenta** aplicado. Si se especifica `cuentaId`, el count previo
DEBE contar solo los asientos que tienen al menos una línea en esa cuenta,
con los filtros de rango y anulados activos.

El count sin cuenta vs count con cuenta DEBEN ser consistentes con el payload
que se devolvería. No puede haber discrepancia entre la validación del tope y
el resultado real.

#### Escenario: tope con cuenta filtrada — cuenta con pocos movimientos, rango grande

- DADO un tenant con 6.000 asientos CONTABILIZADOS en el rango, pero solo 200
  de ellos tienen líneas en la cuenta `1.1.01`
- CUANDO se consulta con `cuentaId` de `1.1.01` sobre ese rango
- ENTONCES el sistema responde 200 (el count es 200, por debajo del tope de 5.000)
- Y NO se lanza HTTP 422

#### Escenario: count sin cuenta vs count con cuenta — consistencia

- DADO un tenant con 4.800 asientos en el rango (sin filtro de cuenta),
  todos ellos con líneas en `1.1.01`
- CUANDO se consulta con `cuentaId` de `1.1.01`
- ENTONCES el count de los 4.800 asientos coincide con lo que se devuelve

---

### REQ-LD-17: Frontend — selector de cuenta en la pantalla del Libro Diario

La pantalla `frontend/src/features/libro-diario/` DEBE agregar un selector
opcional de cuenta (combobox/autocomplete) que permita al usuario elegir una
cuenta de detalle del plan de cuentas del tenant.

- El selector DEBE ser opcional: cuando está vacío, no se pasa `cuentaId` y
  el Libro Diario muestra todos los asientos del rango (comportamiento previo).
- Al seleccionar una cuenta, la consulta DEBE re-ejecutarse con `cuentaId`
  y la tabla DEBE actualizarse con los asientos filtrados.
- Si el backend responde 400 (`LIBRO_DIARIO_CUENTA_NO_DETALLE`), la pantalla
  DEBE mostrar un mensaje de error en el selector, no un error genérico.
- El estado "sin resultados" con cuenta seleccionada DEBE mostrar el estado
  vacío estándar con el contexto de la cuenta elegida (ej. "No hay asientos
  para Caja Bolivianos en el período seleccionado").

#### Escenario: selector vacío — comportamiento sin cambios

- DADO un usuario en la pantalla del Libro Diario sin cuenta seleccionada
- CUANDO ejecuta la consulta
- ENTONCES la tabla muestra todos los asientos del rango (sin filtro de cuenta)

#### Escenario: cuenta seleccionada — tabla filtrada

- DADO que el usuario selecciona `1.1.01 Caja Bolivianos` en el selector
- CUANDO ejecuta la consulta
- ENTONCES la tabla muestra solo los asientos que contienen líneas en `1.1.01`
- Y cada asiento visible muestra TODAS sus líneas (partida doble completa)

#### Escenario: cuenta sin movimientos — estado vacío contextual

- DADO que el usuario selecciona una cuenta sin movimientos en el rango
- CUANDO ejecuta la consulta
- ENTONCES la pantalla muestra el estado vacío con el nombre de la cuenta

---

## Capability `libro-mayor` — Nota sobre el filtro de cuenta en UI

El backend del Libro Mayor **ya soporta** el parámetro `cuentaId`:

- **REQ-LM-07** (spec vivo): cuenta agrupadora → 400 `LIBRO_MAYOR_CUENTA_NO_DETALLE`.
- **REQ-LM-08** (spec vivo): sin `cuentaId` → todas las cuentas de detalle.
- **REQ-LM-09** (spec vivo): con `cuentaId` → Mayor de esa cuenta específica.
- El port `LibroMayorFiltros.cuentaId?: string` ya está implementado.
- El adapter ya filtra por `cuentaId` cuando está presente.

Este change SOLO agrega la **exposición en UI** del filtro ya existente en el
backend. No hay delta de comportamiento backend — no se crea ningún REQ-LM nuevo.

La UI del Libro Mayor (`frontend/src/features/libro-mayor/`) DEBE agregar un
selector de cuenta (combobox/autocomplete, opcional) con las mismas reglas UX
que el selector del Libro Diario (REQ-LD-17): vacío = sin filtro, seleccionado
= Mayor de esa única cuenta, estado vacío contextual.

---

## Códigos de error nuevos (Libro Diario)

Los siguientes códigos se **agregan** a la tabla de errores del spec vivo del
Libro Diario:

| Código | HTTP | Descripción |
|--------|------|-------------|
| `LIBRO_DIARIO_CUENTA_NO_ENCONTRADA` | 404 | El `cuentaId` no existe o no pertenece al tenant activo |
| `LIBRO_DIARIO_CUENTA_NO_DETALLE` | 400 | El `cuentaId` corresponde a una cuenta agrupadora (`esDetalle=false`) |

---

## Impacto en specs vivos

| Spec vivo | Cambio |
|-----------|--------|
| `openspec/specs/libro-diario/spec.md` | Agregar REQ-LD-12 al REQ-LD-17 y dos códigos de error nuevos |
| `openspec/specs/libro-mayor/spec.md` | Sin cambio (backend ya completo; la UI era diferida — su spec se crea en el change de Mayor UI o se agrega una nota en REQ-LM-08) |

---

## Requisitos de testing (TDD estricto)

Siguiendo §7 del CLAUDE.md y el modo TDD activo del proyecto:

- **Unit**: `LibroDiarioService` — escenarios REQ-LD-12 a REQ-LD-16 mockeando el port.
  - filtro con cuenta válida con movimientos
  - filtro con cuenta válida sin movimientos (resultado vacío)
  - cuenta inexistente → 404
  - cuenta agrupadora → 400
  - cuenta de otro tenant → 404
  - tope defensivo cuenta aplicada (no lanza cuando cuenta tiene pocos asientos en rango grande)
  - sin `cuentaId` → comportamiento idéntico al pre-change (regresión)
  - `totalDebeBob`/`totalHaberBob` reflejan asientos completos (REQ-LD-15)

- **Integración** (`*.integration.spec.ts`): adapter Prisma
  `PrismaComprobantesReaderAdapter` contra Postgres real.
  - `contarAsientos` con `cuentaId` — cuenta solo asientos con esa cuenta
  - `obtenerAsientosParaLibroDiario` con `cuentaId` — devuelve asientos completos
  - filtro cross-tenant: cuentaId de otro tenant → 0 resultados (no fuga)

- **E2E**: al menos un escenario `GET /api/libros/diario` con `cuentaId` válido
  y uno con `cuentaId` de cuenta agrupadora (400).

- **Frontend**: cobertura de los componentes nuevos del selector de cuenta
  (happy path + estado vacío contextual).
