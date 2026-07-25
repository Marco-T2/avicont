# verificador-movimientos-bancarios — Especificación

<!--
Change de origen: verificador-movimientos-bancarios (fase sdd-spec)
Capability NUEVA sobre el pack `contabilidad.conciliacion`.
Principio rector FIRMADO: herramienta de APOYO, no limitante — el estado de
conciliación es señal informativa, nunca compuerta (mismo grano que el
checksum de REQ-CB-08 y las sugerencias de REQ-CB-12).
-->

## Propósito

Puerta de entrada al módulo de conciliación: un mayor unificado cross-cuenta
que muestra en un solo request los movimientos de todos los bancos de un
rango, con estado derivado como señal, saldos vigentes por cuenta y totales
por moneda. Solo LEE — nunca escribe comprobantes ni columnas de estado.

## Requirements

### REQ-VMB-01: Listado cross-cuenta con rango obligatorio

El sistema DEBE exponer `GET /api/movimientos-bancarios` que liste los
movimientos bancarios de TODAS las cuentas bancarias del tenant dentro de un
rango de fechas obligatorio (`desde`/`hasta`, formato `YYYY-MM-DD`, §4.6 —
sin UTC ni hora). Los montos DEBEN viajar como string (§4.5), nunca `number`.
Cada fila DEBE incluir su `cuentaBancariaId` y su `ordenFisico` (`number | null`).

#### Scenario: Un solo request muestra todos los bancos

- GIVEN tres `CuentaBancaria` de bancos distintos con movimientos en junio
- WHEN se consulta `GET /api/movimientos-bancarios?desde=2026-06-01&hasta=2026-06-30`
- THEN la respuesta incluye movimientos de las tres cuentas, cada uno con su
  `cuentaBancariaId`, sin exigir elegir una cuenta

#### Scenario: Rango invertido — rechazo

- GIVEN `desde=2026-06-30` y `hasta=2026-06-01`
- WHEN se consulta el listado
- THEN el sistema rechaza con `CONCILIACION_LISTADO_RANGO_INVALIDO` (422)

#### Scenario: Rango ausente — rechazo de validación

- GIVEN un request sin `desde` o sin `hasta`
- WHEN se consulta el listado
- THEN la validación del DTO lo rechaza (400) antes de tocar el repositorio

### REQ-VMB-02: La vista por defecto NO aplica filtro de estado

Cuando el request NO incluye `estado`, el sistema DEBE devolver TODOS los
movimientos del rango, sin importar su estado. NO DEBE existir un filtro de
estado implícito ni un default "pendientes". El estado derivado acompaña cada
fila como señal informativa, nunca como compuerta.

#### Scenario: Sin filtro de estado, nada se esconde

- GIVEN un rango con movimientos `PENDIENTE`, `CONCILIADO` e `IGNORADO`
- WHEN se consulta el listado sin el parámetro `estado`
- THEN los movimientos de los tres estados aparecen y `total` cuenta todos
  los movimientos del rango
- AND cada fila trae su `estadoEfectivo` derivado como dato informativo

### REQ-VMB-03: Filtros opcionales opt-in

El sistema DEBE aceptar los filtros opcionales `cuentaBancariaId`, `estado`,
`montoDesde`/`montoHasta` (strings decimales) y `glosa`. El filtro de glosa
DEBE normalizarse con la misma función que produce `descripcionNormalizada`
y matchear por substring — insensible a mayúsculas y diacríticos.

#### Scenario: Glosa con diacríticos matchea la descripción normalizada

- GIVEN un movimiento con `descripcionNormalizada = "DEPOSITO EN EFECTIVO"`
- WHEN se filtra con `glosa=depósito`
- THEN el movimiento aparece en el resultado

#### Scenario: Filtro por cuenta y por monto combinados

- GIVEN movimientos de varias cuentas con montos diversos
- WHEN se filtra con `cuentaBancariaId=X`, `montoDesde=100.00`, `montoHasta=500.00`
- THEN solo aparecen movimientos de la cuenta X con `100.00 ≤ monto ≤ 500.00`

### REQ-VMB-04: Paginación offset con total

El listado DEBE paginar por offset: `page`/`limit`, default 50, máximo 200.
La respuesta DEBE incluir el `total` de movimientos que satisfacen los
filtros. Un `limit` mayor a 200 DEBE rechazarse por validación.

#### Scenario: Página más allá del total — vacía, con total correcto

- GIVEN un rango con 30 movimientos
- WHEN se consulta `page=5&limit=50`
- THEN `movimientos` viene vacío y `total=30`

#### Scenario: Limit fuera de rango — rechazo

- GIVEN un request con `limit=500`
- WHEN se consulta el listado
- THEN la validación lo rechaza (400)

### REQ-VMB-05: Orden total y determinístico

El listado DEBE ordenarse por `fecha ASC, hora ASC NULLS LAST,
ordenFisico ASC NULLS LAST, id ASC`. El `id` final es obligatorio: la
paginación offset exige un `ORDER BY` totalmente determinístico. El
`NULLS LAST` de `hora` es convención de presentación, no afirmación
cronológica entre bancos distintos.

#### Scenario: Dos páginas consecutivas no duplican ni pierden filas

- GIVEN 120 movimientos donde varios empatan en `fecha`, `hora` y
  `ordenFisico` (todos `null` incluidos)
- WHEN se consultan `page=1&limit=50` y `page=2&limit=50` con los mismos filtros
- THEN ningún movimiento aparece en ambas páginas y la unión de las páginas
  sucesivas cubre los 120 sin omisiones

#### Scenario: Movimiento sin hora se presenta al final de su día

- GIVEN un día con movimientos con `hora` y uno con `hora=null`
- WHEN se consulta el listado
- THEN el movimiento sin hora se lista después de los que tienen hora en ese día

#### Scenario: Movimientos con `ordenFisico` null degradan el orden

- GIVEN movimientos importados antes del change (`ordenFisico=null`) en un mismo día
- WHEN se consulta el listado
- THEN esos movimientos se ordenan por `fecha, hora, id` sin error

### REQ-VMB-06: Estado derivado por página — una lectura nunca escribe

El `estadoEfectivo` de cada fila DEBE derivarse en cada lectura verificando
las anclas de sus matches (REQ-CB-10), acotado a la página devuelta — NUNCA
leerse de la columna cacheada `estado` como verdad. Regla: vínculo válido ⇒
`CONCILIADO`; vínculo roto o sin match ⇒ `IGNORADO` si la columna lo dice,
si no `PENDIENTE`. La lectura NO DEBE escribir `MatchConciliacion` ni
`MovimientoBancario.estado` (no se auto-cura).

#### Scenario: Vínculo roto — la respuesta dice PENDIENTE aunque la columna diga CONCILIADO

- GIVEN un movimiento con columna `estado=CONCILIADO` cuyo match tiene el
  ancla rota (ej. comprobante anulado, REQ-CB-10)
- WHEN se consulta el listado y el movimiento entra en la página
- THEN la fila trae `estadoEfectivo=PENDIENTE` con el motivo del vínculo roto
- AND ni `MatchConciliacion` ni la columna `estado` sufren ningún `UPDATE`

#### Scenario: Movimiento sin match — PENDIENTE

- GIVEN un movimiento sin ningún `MatchConciliacion`
- WHEN entra en la página consultada
- THEN se muestra con `estadoEfectivo=PENDIENTE`

### REQ-VMB-07: Auditoría de vínculos rotos SOLO con filtro de estado activo

Cuando el request incluye el filtro `estado`, el sistema DEBE verificar los
vínculos de TODOS los movimientos con match del rango filtrado (aplicando
los demás filtros pero SIN el de estado) y devolver los rotos en una franja
`auditoriaVinculos` SEPARADA de la paginación, con un tope de 100 filas y el
`total` real de rotos. Sin filtro `estado`, la franja DEBE venir con
`aplicada=false` y sin verificación extra — sin filtro nada se esconde.

#### Scenario: El filtro escondería un pendiente real — la auditoría lo destapa

- GIVEN un movimiento con columna `estado=CONCILIADO` y vínculo roto, y un
  request con `estado=PENDIENTE` (la columna lo excluye de la página)
- WHEN se consulta el listado
- THEN el movimiento aparece en `auditoriaVinculos.rotos` con su motivo,
  fuera de la paginación

#### Scenario: Sin filtro de estado — auditoría no aplicada

- GIVEN un request sin el parámetro `estado`
- WHEN se consulta el listado
- THEN `auditoriaVinculos.aplicada=false` y `rotos` viene vacío

#### Scenario: Más de 100 rotos — franja al tope con total real

- GIVEN 150 vínculos rotos en el rango filtrado
- WHEN se consulta con filtro `estado`
- THEN `rotos` trae 100 elementos y `auditoriaVinculos.total=150`

### REQ-VMB-08: Franja de saldos vigentes por cuenta con `fechaUltimoMovimiento` SIEMPRE

La respuesta DEBE incluir SIEMPRE la franja `saldos` con una entrada por
CADA cuenta bancaria del tenant: el `saldo` publicado por el banco en el
último movimiento importado con `fecha ≤ hasta` — elegido por la inversión
exacta del orden de presentación (`fecha DESC, hora DESC NULLS FIRST,
ordenFisico DESC NULLS FIRST, id DESC`) — junto con su
`fechaUltimoMovimiento`, que DEBE estar SIEMPRE presente: el saldo puede
estar desactualizado y la pantalla responde "cuánto tengo hoy para
transferir". Una cuenta sin movimientos hasta el corte DEBE aparecer con
`saldo=null` y `fechaUltimoMovimiento=null`.

#### Scenario: Saldo vigente con su fecha visible

- GIVEN una cuenta cuyo último movimiento importado es del 2026-06-10 con
  `saldo=1500.00`
- WHEN se consulta con `hasta=2026-06-30`
- THEN la franja trae `saldo="1500.00"` y `fechaUltimoMovimiento="2026-06-10"`

#### Scenario: Cuenta sin movimientos — null/null, nunca 0

- GIVEN una `CuentaBancaria` sin ningún movimiento con `fecha ≤ hasta`
- WHEN se consulta el listado
- THEN la cuenta aparece en la franja con `saldo=null` y
  `fechaUltimoMovimiento=null`

#### Scenario: El "último" es la misma fila que cierra el listado

- GIVEN un día de corte con tres movimientos de la misma cuenta, uno sin `hora`
- WHEN se comparan el último movimiento del listado de presentación y el
  elegido para el saldo vigente
- THEN es la MISMA fila (la inversión `DESC NULLS FIRST` espeja el
  `ASC NULLS LAST` de presentación)

### REQ-VMB-09: `saldo` null honesto — sin fallback

Si el último movimiento de una cuenta tiene `saldo=null` (perfil que no lo
publica), el saldo vigente DEBE ser `null`. El sistema NO DEBE escanear
hacia atrás buscando una fila anterior con saldo ni devolver `0` — misma
familia que `SIN_VERIFICAR` (REQ-CB-08): no inventar.

#### Scenario: Último movimiento sin saldo — null aunque haya saldos anteriores

- GIVEN una cuenta cuyo último movimiento tiene `saldo=null` y el anterior
  `saldo=500.00`
- WHEN se consulta la franja de saldos
- THEN esa cuenta viene con `saldo=null`, no `500.00` ni `0`

### REQ-VMB-10: Presentación dual del saldo (frontend)

Con una `cuentaBancariaId` seleccionada, la tabla DEBE mostrar la columna
`saldo` que publica el banco por fila. En modo cross-cuenta esa columna
DEBE ocultarse (no se promete cronología intra-día entre bancos) y DEBE
mostrarse la franja de saldos por cuenta con `fechaUltimoMovimiento` y una
marca de desactualización cuando es anterior a `hasta`. La suma de saldos
PUEDE mostrarse solo entre cuentas de la MISMA moneda; una cuenta con
`saldo=null` DEBE excluirse de la suma con un indicador visible.

#### Scenario: Cross-cuenta oculta la columna saldo y marca desactualización

- GIVEN el modo cross-cuenta con una cuenta cuya `fechaUltimoMovimiento` es
  anterior a `hasta`
- WHEN se renderiza la pantalla
- THEN la columna `saldo` de la tabla no se muestra y esa cuenta exhibe su
  fecha con la marca de desactualización

#### Scenario: Cuenta con saldo null excluida de la suma, con indicador

- GIVEN dos cuentas BOB con saldo y una BOB con `saldo=null`
- WHEN se muestra la suma de saldos BOB
- THEN la suma cubre solo las dos primeras y la tercera exhibe un indicador
  de saldo no disponible

### REQ-VMB-11: Totales por moneda, sin conversión a BOB

La respuesta DEBE incluir totales agrupados POR MONEDA, con débitos,
créditos y cantidad separados, montos como string. NO DEBE existir
conversión a BOB ni un total combinado entre monedas — los movimientos
bancarios no tienen `montoBob`.

#### Scenario: Rango con BOB y USD — subtotales separados

- GIVEN movimientos en BOB y en USD dentro del rango filtrado
- WHEN se consulta el listado
- THEN `totales` trae una entrada por moneda con `totalDebitos`,
  `totalCreditos` y `cantidad` propios
- AND no existe ningún total agregado que mezcle monedas

### REQ-VMB-12: Permisos y pack — sin permisos nuevos

`GET /api/movimientos-bancarios` DEBE exigir
`contabilidad.conciliacion.read`. Sin ese permiso → 403. Sin el pack
`contabilidad.conciliacion` habilitado y activo → 404 (el pack gatea el
controller completo). El change NO DEBE introducir permisos nuevos.

#### Scenario: Solo `.read` — puede consultar

- GIVEN un usuario con `contabilidad.conciliacion.read` y sin `.conciliar`
- WHEN consulta el listado
- THEN recibe 200 con la respuesta completa

#### Scenario: Sin `.read` — 403

- GIVEN un usuario del tenant sin `contabilidad.conciliacion.read`
- WHEN consulta el listado
- THEN recibe 403

#### Scenario: Sin pack — 404

- GIVEN una organización sin el pack `contabilidad.conciliacion` activo
- WHEN cualquier usuario consulta el listado
- THEN recibe 404

### REQ-VMB-13: Multi-tenant en todas las vistas y agregados

Toda query del listado (página, count, totales, saldos, auditoría) DEBE
filtrar por `organizationId` (§4.2, defense in depth). Un movimiento de otro
tenant NO DEBE aparecer en NINGUNA vista ni agregado. Filtrar por una
`cuentaBancariaId` de otro tenant DEBE comportarse como si la cuenta no
existiera.

#### Scenario: Movimientos ajenos invisibles en página, totales y saldos

- GIVEN movimientos de las organizaciones A y B en el mismo rango
- WHEN un usuario de A consulta el listado
- THEN los movimientos, totales, saldos y auditoría reflejan SOLO datos de A

#### Scenario: Filtro con cuenta de otro tenant — vacío

- GIVEN una `cuentaBancariaId` perteneciente a la organización B
- WHEN un usuario de A filtra por esa cuenta
- THEN el resultado es vacío (`total=0`), sin revelar la existencia de la cuenta

### REQ-VMB-14: Nav item y ruta frontend fail-closed

El ítem "Movimientos bancarios" DEBE vivir en la sección Contabilidad,
gateado por `contabilidad.conciliacion.read` Y el pack
`contabilidad.conciliacion` (§14.7, fail-closed). Sin cualquiera de los dos,
el ítem NO se muestra y la ruta `/movimientos-bancarios` bloquea el acceso
por URL directa.

#### Scenario: Sin permiso o sin pack — ítem oculto y ruta bloqueada

- GIVEN un usuario sin `contabilidad.conciliacion.read` o cuya organización
  no tiene el pack activo
- WHEN abre el sidebar o navega a `/movimientos-bancarios` por URL directa
- THEN el ítem no aparece y la ruta bloquea el acceso
