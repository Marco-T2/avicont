# conciliacion-bancaria — Especificación

<!--
Última edición: 2026-07-23 (actualización post-design: C-1 crítica, R-1 con
  fixture real, refinamiento de ordinalDia)
Última revisión contra core: 2026-07-23
Owner: backend-lead
Change de origen: conciliacion-bancaria (en progreso)
-->

> Capability NUEVA (no existía spec previa). Decisiones 1-11 firmadas
> (`architecture/conciliacion-bancaria` #952) + 3 resoluciones (R-1/R-2/R-3,
> `architecture/conciliacion-bancaria-resoluciones` #956) + análisis de formatos
> (`architecture/conciliacion-formatos-bancos` #953) **NO se re-litigan**.
> Propuesta completa: `openspec/changes/conciliacion-bancaria/proposal.md`.

## Propósito

Herramienta de apoyo para que el contador cruce el extracto bancario contra el
Libro Mayor de la cuenta banco. Importa extractos reales de bancos bolivianos,
deduplica de forma idempotente, sugiere pares ranqueados por confianza y deja
que el usuario confirme siempre. **El módulo SOLO LEE del núcleo contable —
nunca escribe comprobantes.** Nada es inmutable ni bloqueante (decisión 3).

## Requirements

### REQ-CB-01: Configuración de cuenta bancaria (`CuentaBancaria`)

El sistema DEBE permitir vincular una `Cuenta` del plan de cuentas (elegida
explícitamente por el usuario, `esDetalle=true AND activa=true`) a una
`CuentaBancaria`, con `@@unique([organizationId, cuentaId])` — una cuenta del
plan mapea a lo sumo una `CuentaBancaria`.

`CuentaBancaria` DEBE llevar **un único campo `perfilExtracto`** (enum, ej.
`BANCOSOL_XLSX`), NO dos campos separados `banco`+`formato` (R-3). El
adaptador correspondiente al perfil aporta `banco` y `formato` como metadata
de solo-lectura para la UI (agrupación, catálogo de perfiles).

`numeroCuenta` PUEDE quedar vacío al crear la `CuentaBancaria` — no es
obligatorio en el alta. Cuando está vacío, se captura y confirma en la
primera importación (REQ-CB-16), que es también quien valida contra él en
cada importación posterior.

#### Scenario: Vincular una cuenta del plan — alta

- GIVEN una `Cuenta` con `esDetalle=true`, `activa=true`, sin `CuentaBancaria` asociada
- WHEN el usuario crea una `CuentaBancaria` con `cuentaId` + `perfilExtracto=BANCOSOL_XLSX`
- THEN la `CuentaBancaria` se crea y queda disponible para importar extractos

#### Scenario: Cuenta del plan ya vinculada — rechazo

- GIVEN una `Cuenta` ya vinculada a una `CuentaBancaria` existente
- WHEN se intenta crear una segunda `CuentaBancaria` con el mismo `cuentaId`
- THEN el sistema rechaza con `CONCILIACION_CUENTA_BANCARIA_YA_VINCULADA` (409)

### REQ-CB-02: Moneda de la cuenta bancaria validada contra la cuenta del plan

Un extracto tiene una única moneda por definición. `CuentaBancaria.moneda` es
un campo propio; si `cuenta.permiteMultiMoneda === false`, DEBE coincidir con
`cuenta.monedaFuncional`.

#### Scenario: Cuenta restringida a BOB, CuentaBancaria en USD — rechazo

- GIVEN una `Cuenta` con `permiteMultiMoneda=false` y `monedaFuncional=BOB`
- WHEN se crea una `CuentaBancaria` sobre esa cuenta con `moneda=USD`
- THEN el sistema rechaza con `CONCILIACION_MONEDA_INCOMPATIBLE` (422)

#### Scenario: Cuenta multi-moneda — cualquier moneda permitida

- GIVEN una `Cuenta` con `permiteMultiMoneda=true`
- WHEN se crea una `CuentaBancaria` con `moneda=USD`
- THEN la creación se acepta

### REQ-CB-03: Validación de perfil del archivo importado

El archivo subido DEBE corresponder al `perfilExtracto` declarado en la
`CuentaBancaria` (decisión 10: una cuenta = un perfil; mezclar formatos del
mismo banco genera duplicados porque las descripciones difieren → distinto
hash). El sistema DEBE rechazar con mensaje claro cuando no corresponde,
NUNCA importar "lo que pueda" de un archivo con estructura ajena al perfil.

**Alcance de esta validación — solo ESTRUCTURA, no identidad de cuenta**:
que un archivo tenga la estructura/cabecera correcta del perfil NO implica
que sea el extracto de LA cuenta bancaria correcta (R-5: el usuario puede
tener varias cuentas del mismo banco, mismo `perfilExtracto`, que solo
difieren en el número de cuenta — ej. `1191959-000-001` vs `-002` vs `-003`).
Esa distinción la hace REQ-CB-16, como validación adicional e independiente
que corre después de que esta pase.

#### Scenario: Archivo corresponde al perfil declarado

- GIVEN una `CuentaBancaria` con `perfilExtracto=BANCOSOL_XLSX`
- WHEN se sube un `.xlsx` con las columnas/cabecera del generador BancoSol/Económico
- THEN el adaptador `ExtractoParserPort` lo procesa

#### Scenario: Archivo no corresponde al perfil declarado — rechazo

- GIVEN una `CuentaBancaria` con `perfilExtracto=BANCOSOL_XLSX`
- WHEN se sube un archivo con la estructura/cabecera del perfil `UNION_XLSX`
- THEN el sistema rechaza con `CONCILIACION_ARCHIVO_PERFIL_NO_COINCIDE` (422)
  y un mensaje que nombra el perfil esperado vs el detectado

### REQ-CB-04: Detección de `.xls` legacy por magic bytes

`read-excel-file` solo lee `.xlsx` (OOXML/ZIP), no `.xls` legacy (BIFF/OLE2).
El sistema DEBE detectar la familia real del archivo por magic bytes
(`50 4B 03 04` = ZIP/OOXML vs `D0 CF 11 E0 A1 B1 1A E1` = OLE2 legacy)
reusando `file-type` (ya dependencia del backend, usada en
`comprobantes/domain/mime-whitelist.ts`) ANTES de intentar parsear, para
perfiles que declaran formato XLSX. El mensaje de error DEBE ser accionable
("Este archivo es Excel 97-2003. Abrilo en Excel y guardalo como .xlsx"),
NUNCA un genérico "formato inválido".

#### Scenario: Archivo `.xlsx` real — aceptado

- GIVEN un perfil que espera XLSX
- WHEN se sube un archivo cuyos primeros bytes son `50 4B 03 04`
- THEN el sistema continúa con el parseo normal

#### Scenario: Archivo `.xls` legacy con extensión renombrada a `.xlsx` — rechazo accionable

- GIVEN un perfil que espera XLSX
- WHEN se sube un archivo cuyos primeros bytes son `D0 CF 11 E0 A1 B1 1A E1`
  (independientemente del nombre/extensión declarados)
- THEN el sistema rechaza con `CONCILIACION_ARCHIVO_XLS_LEGACY` (422) y el
  mensaje instruye reguardar como `.xlsx` en Excel
- AND el archivo NUNCA llega al parser `read-excel-file`

### REQ-CB-05: Importación acumulativa e idempotente

Importar el mismo archivo dos veces NO DEBE crear movimientos duplicados ni
borrar movimientos existentes. El sistema DEBE reportar explícitamente
cuántos movimientos son nuevos y cuántos ya existían — nunca en silencio.

**Orden de validaciones (R-5)**: esta garantía de idempotencia aplica
**después** de que el archivo pasó la validación de perfil (REQ-CB-03) y la
de número de cuenta (REQ-CB-16). Un archivo rechazado por perfil o por
cuenta incorrecta es un **fallo duro** (422, mensaje explícito) — nunca se
reporta como "0 nuevos, 0 ya existían", y no crea ninguna fila de
`ImportacionExtracto` ni de `MovimientoBancario`. "Ya existían" describe
únicamente movimientos que SÍ pasaron ambas validaciones y coincidieron por
`hashDedup` con algo ya persistido.

#### Scenario: Reimportar el mismo archivo — cero nuevos

- GIVEN un extracto ya importado con N movimientos
- WHEN se importa el mismo archivo (idéntico o re-descargado) por segunda vez
- THEN el resultado reporta "0 nuevos, N ya existían"
- AND ningún `MovimientoBancario` existente se modifica ni se borra

#### Scenario: Importar un rango que solapa un rango ya importado

- GIVEN una importación previa que cubre movimientos del 01/06 al 30/06
- WHEN se importa un nuevo extracto que cubre del 15/06 al 15/07
- THEN los movimientos del 15/06 al 30/06 se reportan como "ya existían"
- AND los movimientos del 01/07 al 15/07 se agregan como "nuevos"
- AND la unión de ambos rangos queda representada sin huecos ni duplicados

#### Scenario: Fixture real R-1 — dos exports reales solapados de BancoSol (criterio de aceptación literal)

- GIVEN `docs/extractosBancos/bancosol-A-mayo-junio.xlsx` (60 movimientos, cobertura
  2026-05-14…2026-06-30) y `docs/extractosBancos/bancosol-B-junio-julio.xlsx`
  (80 movimientos, cobertura 2026-06-05…2026-07-21, solapado con A)
- WHEN se importa primero A
- THEN el resultado reporta **60 nuevos, 0 ya existían**
- WHEN a continuación se importa B
- THEN el resultado reporta **21 nuevos, 59 ya existían**
- AND el total de `MovimientoBancario` distintos para la `CuentaBancaria` es **81**

### REQ-CB-06: Metadata de importación sin binario (R-2)

**v1 NO persiste el archivo original** (sin MinIO). Por cada `ImportacionExtracto`
el sistema DEBE guardar: `sha256Archivo`, `nombreArchivo`, tamaño en bytes,
`fechaDesde`/`fechaHasta` cubiertas, `filasLeidas`, `movimientosNuevos`,
`movimientosDuplicados`, y el resultado del checksum (`estadoVerificacion` +
`diferencia?`). El binario queda fuera de v1 (slice posterior); la
recuperación se apoya en que todos los bancos permiten re-exportar por rango.

#### Scenario: Importación exitosa registra metadata sin guardar el binario

- GIVEN un archivo válido subido para una `CuentaBancaria`
- WHEN la importación se completa
- THEN existe una fila `ImportacionExtracto` con `sha256Archivo`, rango
  cubierto, filas leídas y contadores nuevos/duplicados
- AND el contenido binario del archivo NO se persiste en ningún storage

### REQ-CB-07: Hash de deduplicación — `ordinalDia` por grupo de tupla idéntica

El hash de deduplicación de cada `MovimientoBancario` se calcula como
`(cuentaBancariaId, fecha, monto, tipo[DEBITO|CREDITO], descripcionNormalizada,
ordinalDia)`, con `@@unique([cuentaBancariaId, hashDedup])` — la idempotencia
es estructural, enforzada en DB.

**Definición precisa de `ordinalDia`** (refinada en diseño): es el **índice de
ocurrencia (0-based) del movimiento dentro de su grupo de tupla idéntica**
`(fecha, monto, tipo, descripcionNormalizada)` — NO un ordinal calculado sobre
una clave de orden global del día. Antes de agrupar y asignar `ordinalDia`,
los movimientos DEBEN reordenarse según un **orden canónico determinístico**
calculado por el sistema sobre atributos intrínsecos del dato (nunca la
posición física de la fila en el archivo importado) — un mismo banco puede
exportar el mismo período en orden ascendente o descendente (verificado:
Fortaleza invierte el orden según el modo de export) y el resultado DEBE ser
idéntico en ambos casos.

De esta única regla —contar por grupo de tupla, sobre orden canónico— salen
las dos propiedades exigidas: dos movimientos idénticos el mismo día
sobreviven ambos (grupos con más de un elemento reciben ordinales distintos),
y reimportar un rango solapado deduplica (el mismo grupo, recompuesto en el
mismo orden canónico, regenera los mismos ordinales).

#### Scenario: Dos movimientos idénticos el mismo día — ambos sobreviven

- GIVEN dos líneas del extracto con la misma `fecha`, `monto=Bs 3.00`,
  `tipo=DEBITO` y `descripcionNormalizada` (ej. dos comisiones ITF idénticas)
  — un único grupo de tupla con 2 elementos
- WHEN se importa el archivo
- THEN el sistema crea DOS `MovimientoBancario` distintos, con `ordinalDia=0`
  y `ordinalDia=1` respectivamente (índice de ocurrencia dentro del grupo)
- AND ninguno de los dos se descarta como duplicado del otro

#### Scenario: Reimportar un rango solapado — cero duplicados

- GIVEN una importación previa con movimientos ya persistidos, incluyendo
  grupos de tupla con más de un elemento en algún día
- WHEN se reimporta un archivo cuyo rango solapa total o parcialmente
- THEN cada movimiento reimportado recompone el mismo grupo de tupla en el
  mismo orden canónico y recalcula el mismo `hashDedup` que su contraparte ya
  persistida
- AND el conteo de "nuevos" excluye exactamente esos movimientos

#### Scenario: Mismo período exportado en orden ascendente y descendente — hashes idénticos

- GIVEN el mismo banco exporta el mismo período dos veces, una en orden
  ascendente y otra en orden descendente (mismos movimientos subyacentes)
- WHEN se importa cualquiera de los dos archivos
- THEN el orden canónico normaliza ambos a la misma secuencia antes de
  agrupar, y cada movimiento produce el mismo `hashDedup` en ambos casos
- AND importar el segundo archivo tras el primero no genera duplicados

#### Scenario: Fixture real R-1 — dedup medida sobre datos reales de BancoSol (criterio de aceptación literal)

- GIVEN `docs/extractosBancos/bancosol-A-mayo-junio.xlsx` (60 movimientos) y
  `docs/extractosBancos/bancosol-B-junio-julio.xlsx` (80 movimientos,
  solapado con A)
- WHEN se importa A y luego B, en ese orden
- THEN A aporta **60 nuevos**, B aporta **21 nuevos + 59 ya existentes**
- AND el total de `MovimientoBancario` distintos es **81** — ni uno más
  (falso-negativo de dedup) ni uno menos (colisión indebida de hash)

### REQ-CB-08: Checksum por perfil (3 estrategias)

Cada perfil DEBE declarar su estrategia de verificación de saldo:
**declarado** (el archivo trae saldo inicial/final en su cabecera — BCP, FIE,
Económico), **derivado** (se calcula acumulando desde la columna saldo de la
fila más antigua del rango — BMSC, BancoSol, Fortaleza, Unión), o
**imposible** (el formato no trae columna de saldo — ej. un futuro perfil
ancho fijo sin columna de saldo, fuera de v1). El sistema NUNCA DEBE fingir
que verificó un saldo que no puede verificar, ni hardcodear una estrategia
que no aplique al perfil.

> Nota: con Unión pasando a XLSX (`UNION_XLSX`, checksum `DERIVADO`
> verificado sobre datos reales — no declara saldo inicial, solo totales,
> así que no califica como `DECLARADO` bajo esta definición), **los 3
> perfiles de v1 soportan checksum** — ninguno cae en `IMPOSIBLE` hoy. La
> estrategia sigue siendo necesaria como mecanismo general: un adaptador
> ancho-fijo futuro (ej. el TXT de Unión, documentado pero diferido) sí
> caería en `IMPOSIBLE`.

**Un perfil PUEDE declarar verificaciones adicionales más allá de su
estrategia primaria**, sin que eso cambie su clasificación DECLARADO /
DERIVADO / IMPOSIBLE. Ej.: Unión (`DERIVADO`) además reconcilia los totales
`Total Créditos`, `Total Débitos` y `Total` que trae en su cabecera contra
la suma de movimientos importados — una verificación extra del adaptador,
no la estrategia primaria (que sigue siendo derivar desde la columna
saldo). Estas verificaciones adicionales alimentan el mismo
`estadoVerificacion`/`diferencia` informativo — tampoco bloquean la
importación.

`estadoVerificacion` es informativo — un `DESCUADRE` NO rechaza la
importación (decisión 3: nada bloqueante).

#### Scenario: Perfil con saldo declarado — cuadra

- GIVEN un perfil con estrategia `DECLARADO` (ej. BCP)
- WHEN la suma de movimientos importados reconcilia con el saldo
  inicial/final declarado en el archivo
- THEN `estadoVerificacion = VERIFICADO`

#### Scenario: Perfil con saldo declarado — no cuadra

- GIVEN un perfil con estrategia `DECLARADO`
- WHEN la suma de movimientos NO reconcilia con el saldo declarado
- THEN `estadoVerificacion = DESCUADRE` con `diferencia` calculada
- AND la importación se completa igual (no se rechaza)

#### Scenario: Perfil con saldo derivado — deriva de la fila más antigua

- GIVEN un perfil con estrategia `DERIVADO` (ej. BancoSol)
- WHEN se importa el archivo
- THEN el saldo base se toma de la columna saldo de la fila más antigua del
  rango, y el checksum se deriva acumulando los movimientos desde ahí

#### Scenario: Perfil sin columna de saldo — sin verificar, visible

- GIVEN un perfil con estrategia `IMPOSIBLE` (ningún perfil de v1 cae acá;
  ejemplo de un futuro perfil ancho-fijo sin columna de saldo)
- WHEN se importa el archivo
- THEN `estadoVerificacion = SIN_VERIFICAR`
- AND la pantalla de importaciones muestra ese estado explícitamente (nunca
  se omite ni se muestra como si hubiera verificado)

### REQ-CB-09: Detección de huecos de cobertura (capacidad de dominio, DIFERIDA sin endpoint en v1)

**Alcance v1**: esta es una capacidad de **dominio puro**, no una feature
expuesta. `proposal.md` la deja explícitamente fuera de alcance ("no se
expone en v1") — v1 NO tiene endpoint ni pantalla que la sirva. El
requisito normativo es sobre la **función de dominio**, no sobre un
comportamiento observable por HTTP: no hay nada que un cliente pueda
"consultar" en v1.

A partir de una lista de rangos `(fechaDesde, fechaHasta)` — el mismo dato
que expone cada `ImportacionExtracto` — el sistema DEBE proveer una
función de dominio pura (`detectarHuecos`) que identifique los tramos de
calendario NO cubiertos por ningún rango de la lista. Esta función queda
lista para ser expuesta en un slice posterior (drawer de historial,
alertas de importación incompleta), pero **NO DEBE** cablearse a ningún
endpoint ni pantalla en v1.

#### Scenario: Dos rangos dejan un hueco entre ellos

- GIVEN la función recibe los rangos `[01/06, 10/06]` y `[20/06, 30/06]`
- WHEN se invoca `detectarHuecos(rangos)`
- THEN devuelve el tramo `[11/06, 19/06]` como no cubierto

#### Scenario: Rangos contiguos o solapados — sin huecos

- GIVEN la función recibe rangos contiguos o solapados sin días sueltos
  entre ellos
- WHEN se invoca `detectarHuecos(rangos)`
- THEN devuelve una lista vacía de tramos no cubiertos

### REQ-CB-10: Verificación del ancla obligatoria en cada lectura

`MatchConciliacion.comprobanteId` NO lleva FK (deliberado: `Restrict`
bloquearía editar/borrar comprobantes violando decisión 3; `Cascade` dejaría
el movimiento `CONCILIADO` apuntando a un match borrado en silencio,
violando decisión 4).

**Corrección crítica (C-1, hallada en diseño): `(comprobanteId, orden)` NO es
estable en el tiempo.** `comprobantes.service.ts:670-698` reasigna `orden`
por la posición del array recibido cada vez que el `dto.lineas` está
presente (insertar, borrar o reordenar líneas) — solo las ediciones que NO
tocan el conjunto de líneas (glosa, fecha, tipo de cabecera) preservan
`orden`. Insertar una línea al principio de un comprobante corre el `orden`
de todas las líneas siguientes. **El snapshot deja de ser defensa en
profundidad y pasa a ser EL mecanismo de correctitud**: sin él, un ancla que
sigue resolviendo a una fila real podría estar apuntando, en silencio, a una
línea completamente distinta.

El snapshot guarda **5 campos**, cada uno capaz de invalidar el vínculo por
sí solo: `snapshotCuentaId`, `snapshotMonto`, `snapshotTipo`
(`DEBITO`\|`CREDITO`), `snapshotMoneda`, `snapshotFecha`. Toda lectura DEBE
recalcular, en memoria, sobre los datos ya obtenidos para el workspace (sin
queries extra en el camino feliz):

1. Buscar la línea en `(comprobanteId, orden)`. Si no existe → vínculo roto (`LINEA_INEXISTENTE`).
2. Si existe pero `anulado=true` → vínculo roto (`COMPROBANTE_ANULADO`).
3. Comparar `cuentaId`, `monto` (tolerancia `±0.01`), `tipo` (débito/crédito), `moneda` y `fecha` de la línea actual contra el snapshot. Cualquier diferencia → vínculo roto con el motivo específico (`CUENTA_CAMBIADA` \| `MONTO_CAMBIADO` \| `LADO_CAMBIADO` \| `MONEDA_CAMBIADA` \| `FECHA_CAMBIADA`).
4. Si TODO coincide → vínculo válido.

**Caso benigno explícito** (decisión 1: un comprobante puede tener 2 líneas
del mismo monto contra la cuenta banco): si tras una edición el `orden` se
corrió pero la línea que terminó ocupando ese `orden` sigue coincidiendo con
el snapshot en los 5 campos, el vínculo se considera **válido** — es
económicamente equivalente para efectos de conciliación, aunque
técnicamente sea "otra fila".

**Una lectura NUNCA escribe.** `MatchConciliacion` y la columna persistida
`MovimientoBancario.estado` permanecen intactos ante un vínculo roto — lo
que cambia es el `estadoEfectivo` **derivado** devuelto en la respuesta de
consulta (`PENDIENTE` cuando el vínculo está roto, con el motivo visible),
nunca una fila en base de datos. El sistema NUNCA debe **mostrar** un
movimiento como `CONCILIADO` cuando su vínculo no calza — pero tampoco debe
persistir ese hallazgo como si fuera un evento de escritura.

#### Scenario: Línea intacta — vínculo válido, se muestra CONCILIADO

- GIVEN un `MatchConciliacion` con snapshot `(cuentaId=X, monto=100.00, tipo=DEBITO, moneda=BOB, fecha=2026-06-10)`
- WHEN se consulta el estado y la línea en `(comprobanteId, orden)` sigue
  existiendo con esos 5 valores idénticos y `anulado=false`
- THEN el movimiento se muestra con `estadoEfectivo=CONCILIADO`

#### Scenario: Caso benigno — `orden` se corrió pero el snapshot sigue coincidiendo

- GIVEN un `MatchConciliacion` anclado a `(comprobanteId=C, orden=2)` con
  snapshot `(cuentaId=X, monto=100.00, tipo=DEBITO, moneda=BOB, fecha=2026-06-10)`
- WHEN el comprobante se edita insertando una línea al principio (el
  `dto.lineas` reasigna `orden` por posición) y la línea que termina en
  `orden=2` tiene, por coincidencia o porque el comprobante registra dos
  depósitos del mismo monto a la misma cuenta banco, exactamente
  `(cuentaId=X, monto=100.00, tipo=DEBITO, moneda=BOB, fecha=2026-06-10)`
- THEN el vínculo se considera **válido** — el movimiento se sigue mostrando
  `CONCILIADO`

#### Scenario: Se inserta una línea al principio — el vínculo se rompe

- GIVEN un `MatchConciliacion` anclado a `(comprobanteId=C, orden=3)` con
  snapshot `(cuentaId=X, monto=100.00, tipo=DEBITO, moneda=BOB, fecha=2026-06-10)`
- WHEN el comprobante se edita insertando una línea nueva al principio, lo
  que corre el `orden` de todas las líneas siguientes, y la línea que
  termina ocupando `orden=3` tiene un `monto` o `cuentaId` distinto al
  snapshot
- THEN el sistema detecta que el snapshot no coincide (`MONTO_CAMBIADO` o
  `CUENTA_CAMBIADA`) y trata el ancla como inválida
- AND el movimiento se muestra con `estadoEfectivo=PENDIENTE` y una marca
  visible del motivo — sin ningún `UPDATE` sobre `MatchConciliacion` ni sobre
  `MovimientoBancario.estado`

#### Scenario: Monto de la línea editado — vínculo roto

- GIVEN un `MatchConciliacion` con snapshot `monto=100.00`
- WHEN el comprobante se edita (con o sin reordenar líneas) y la línea que
  resuelve en `(comprobanteId, orden)` tiene ahora `monto=150.00`
- THEN el movimiento se muestra con `estadoEfectivo=PENDIENTE` y motivo
  `MONTO_CAMBIADO`

#### Scenario: Lado contable invertido (débito↔crédito) — vínculo roto

- GIVEN un `MatchConciliacion` con snapshot `tipo=DEBITO`
- WHEN la línea que resuelve en `(comprobanteId, orden)` ahora es `CREDITO`
- THEN el movimiento se muestra con `estadoEfectivo=PENDIENTE` y motivo
  `LADO_CAMBIADO`

#### Scenario: Comprobante (BORRADOR) eliminado — vínculo roto

- GIVEN un `MatchConciliacion` anclado a un comprobante en estado `BORRADOR`
- WHEN el comprobante se elimina físicamente
- THEN la búsqueda en `(comprobanteId, orden)` no devuelve ninguna línea
  (`LINEA_INEXISTENTE`)
- AND el movimiento se muestra con `estadoEfectivo=PENDIENTE` y la marca visible

#### Scenario: Comprobante anulado — vínculo roto

- GIVEN un `MatchConciliacion` cuyo comprobante pasa a `anulado=true`
  (`cuentaId`/`monto` de la línea permanecen sin cambios)
- WHEN se consulta el estado del match
- THEN el sistema lee el flag `anulado` de la línea (expuesto por
  `LineasCuentaReaderPort`) y lo trata como ancla inválida (`COMPROBANTE_ANULADO`)
- AND el movimiento se muestra con `estadoEfectivo=PENDIENTE` — un asiento
  anulado no debe seguir mostrándose como conciliado

### REQ-CB-11: Estados del movimiento y `EN_TRANSITO` derivado

`MovimientoBancario.estado` (columna persistida) PUEDE ser `PENDIENTE`,
`CONCILIADO` o `IGNORADO`, mantenida por los caminos de escritura (crear
match → `CONCILIADO`; borrar match → `PENDIENTE`) y usada solo para
filtrar/contar con índice. **No es la fuente de verdad para lo que se
muestra**: la pantalla usa el `estadoEfectivo` derivado (REQ-CB-10), que
puede diferir de la columna cuando el vínculo está roto — un match sigue
existiendo (columna `CONCILIADO`) pero el `estadoEfectivo` mostrado es
`PENDIENTE` hasta que el usuario re-confirme o el match roto se reemplace.

El estado `EN_TRANSITO` (líneas contables de la cuenta banco en el rango
consultado sin un vínculo válido — incluye tanto las que nunca tuvieron
match como las que lo tenían pero se rompió) NO se persiste — SIEMPRE se
deriva en tiempo de consulta comparando las líneas de
`LineasCuentaReaderPort` contra los `MatchConciliacion` vigentes
(post-verificación del ancla, REQ-CB-10).

#### Scenario: Movimiento con vínculo válido

- GIVEN un `MovimientoBancario` con un `MatchConciliacion` cuyo vínculo calza
  (REQ-CB-10)
- WHEN se consulta el panel de conciliación
- THEN el movimiento se muestra con `estadoEfectivo=CONCILIADO`

#### Scenario: Movimiento sin match

- GIVEN un `MovimientoBancario` sin ningún `MatchConciliacion`
- WHEN se consulta el panel
- THEN el movimiento se muestra con `estadoEfectivo=PENDIENTE`

#### Scenario: Movimiento con match roto — columna dice CONCILIADO, pantalla muestra PENDIENTE

- GIVEN un `MovimientoBancario` cuya columna persistida `estado=CONCILIADO`
  porque tiene un `MatchConciliacion`, pero ese vínculo está roto (REQ-CB-10)
- WHEN se consulta el panel de conciliación
- THEN el movimiento se muestra con `estadoEfectivo=PENDIENTE` (derivado),
  sin que la columna `MovimientoBancario.estado` se haya tocado

#### Scenario: Línea contable sin contraparte bancaria — en tránsito

- GIVEN una línea contable de la cuenta banco vinculada, dentro del rango
  consultado, sin un `MatchConciliacion` con vínculo válido que la referencie
- WHEN se consulta el panel de conciliación
- THEN la línea aparece en el panel marcada `EN_TRANSITO`
- AND no existe ninguna fila persistida en base de datos para ese estado

### REQ-CB-12: Sugerencias ranqueadas por confianza, sin auto-match

El motor de sugerencias compara movimientos con `estadoEfectivo=PENDIENTE`
(incluye los que nunca tuvieron match y los que lo tenían pero el vínculo se
rompió, REQ-CB-10/11) contra líneas `EN_TRANSITO` de la misma
`CuentaBancaria`, y ranquea por confianza. El sistema NUNCA DEBE confirmar
un match automáticamente — el usuario SIEMPRE confirma explícitamente
(decisión 2).

Ranking:
- **Alta**: monto exacto + fecha exacta, candidato único.
- **Media**: monto exacto + fecha dentro de la ventana `±3 días`.
- **Baja**: monto exacto con múltiples candidatos ambiguos (misma fecha o
  ventana, sin forma de desempatar automáticamente).

#### Scenario: Monto y fecha exactos — confianza alta

- GIVEN un movimiento bancario `PENDIENTE` y una única línea `EN_TRANSITO`
  con el mismo monto y la misma fecha
- WHEN se calculan las sugerencias
- THEN se ofrece esa línea como sugerencia con `confianza=ALTA`

#### Scenario: Monto exacto, fecha dentro de la ventana — confianza media

- GIVEN un movimiento con monto exacto contra una línea `EN_TRANSITO` con el
  mismo monto pero fecha a 2 días de diferencia
- WHEN se calculan las sugerencias
- THEN se ofrece con `confianza=MEDIA`

#### Scenario: Monto exacto, varios candidatos — confianza baja

- GIVEN un movimiento con monto exacto que calza contra 3 líneas
  `EN_TRANSITO` distintas dentro de la ventana
- WHEN se calculan las sugerencias
- THEN las 3 se ofrecen con `confianza=BAJA`, sin preseleccionar ninguna

#### Scenario: Ninguna sugerencia se auto-confirma

- GIVEN cualquier sugerencia de cualquier nivel de confianza
- WHEN el sistema calcula las sugerencias
- THEN ningún `MatchConciliacion` se crea sin una acción explícita del
  usuario confirmando el par

### REQ-CB-13: Multi-tenant en toda tabla y query nuevas

Las **4 tablas nuevas** del módulo DEBEN llevar `organizationId` no nulo, y
toda query sobre CADA UNA DEBE filtrar por él independientemente
(defense in depth: guard + servicio + repositorio, §4.2 core, Anti-31) —
enumeradas explícitamente para que la cobertura sea exigible tabla por
tabla, no solo a nivel de módulo:

1. `CuentaBancaria`
2. `MovimientoBancario`
3. `ImportacionExtracto`
4. `MatchConciliacion`

#### Scenario: Acceso a `CuentaBancaria` de otro tenant — no encontrado

- GIVEN una `CuentaBancaria` de la organización A
- WHEN un usuario autenticado en la organización B intenta consultarla por id
- THEN el sistema responde como si no existiera (404), nunca expone datos de A

#### Scenario: Listado de `MovimientoBancario` siempre acotado al tenant activo

- GIVEN movimientos bancarios en las organizaciones A y B
- WHEN un usuario de la organización A lista movimientos
- THEN solo ve los de la organización A, sin importar los filtros aplicados

#### Scenario: Acceso a `ImportacionExtracto` de otro tenant — no encontrado

- GIVEN una `ImportacionExtracto` de la organización A
- WHEN un usuario autenticado en la organización B intenta consultarla por id
- THEN el sistema responde como si no existiera (404), nunca expone metadata
  de la importación de A

#### Scenario: Acceso a `MatchConciliacion` de otro tenant — no encontrado

- GIVEN un `MatchConciliacion` de la organización A
- WHEN un usuario autenticado en la organización B intenta operarlo
  (confirmar, deshacer) por id
- THEN el sistema responde como si no existiera (404), nunca permite deshacer
  ni leer un match de A

### REQ-CB-14: Modo consulta con gating fail-closed

La misma pantalla de conciliación DEBE servir a un usuario con solo
`contabilidad.conciliacion.read`: ve cuentas bancarias, movimientos,
importaciones y sugerencias, pero sin poder ejecutar acciones (importar,
confirmar match, ignorar, deshacer) — fail-closed.

**Modo consulta a nivel pantalla.** Cuando falta
`contabilidad.conciliacion.conciliar`, el workspace muestra un banner que
explica la situación UNA vez, arriba, y las acciones por fila no se renderizan.

Esto es una **excepción deliberada y acotada** a `frontend/CLAUDE.md §14.7`
("deshabilitar + tooltip, NO ocultar"): esta pantalla repite las mismas
acciones en cada fila de dos paneles, así que decenas de botones grises con
idéntico tooltip saturan la afordancia en vez de informar. El banner cumple el
propósito de §14.7 —que el usuario entienda POR QUÉ no puede actuar— sin ese
ruido. La excepción aplica sólo a pantallas densas en acciones repetidas por
fila; en el resto del proyecto sigue mandando `<PermissionButton>`.

Ruta y nav item se ocultan/bloquean sin `.read` — ahí §14.7 SÍ manda ocultar,
porque es navegación y no una acción puntual.

#### Scenario: Usuario solo con `.read` — ve datos en modo consulta

- GIVEN un usuario con `contabilidad.conciliacion.read` y ningún otro permiso
  del submódulo
- WHEN accede al workspace de conciliación
- THEN ve cuentas bancarias, movimientos y su estado, sugerencias e historial
- AND ve un banner de modo consulta que explica que sólo tiene permiso de lectura
- AND no ve los botones de importar, confirmar, ignorar ni deshacer

#### Scenario: Usuario sin `.read` — ruta y nav item ocultos

- GIVEN un usuario sin `contabilidad.conciliacion.read`
- WHEN intenta navegar a `/conciliacion` por URL directa
- THEN la ruta lo bloquea (fail-closed) y el ítem no aparece en el sidebar

#### Scenario: Usuario con `.read` + `.conciliar` — acciones visibles

- GIVEN un usuario con `contabilidad.conciliacion.read` y
  `contabilidad.conciliacion.conciliar`
- WHEN accede al workspace
- THEN ve además los botones de confirmar match, ignorar y deshacer

### REQ-CB-15: El módulo solo lee del núcleo contable

`conciliacion-bancaria` NO DEBE escribir comprobantes, líneas ni ningún otro
dato del núcleo contable. No existe ningún writer-port hacia `comprobantes/`.
El "asiento de comisión/ITF" es un borrador de usuario normal, creado en el
formulario existente de comprobantes (`/comprobantes/nuevo`) con campos
prellenados por navegación del frontend — el módulo de conciliación solo
arma la URL/estado de precarga, nunca llama a `ComprobantesService.create`
por su cuenta.

#### Scenario: Atajo de asiento de comisión/ITF navega al formulario existente

- GIVEN un movimiento `EN_TRANSITO` identificado como comisión/ITF sin
  contrapartida contable
- WHEN el usuario usa el atajo "crear asiento"
- THEN el frontend navega a `/comprobantes/nuevo` con campos prellenados
  (fecha, monto, cuenta banco)
- AND el comprobante solo se crea cuando el usuario confirma el formulario,
  como cualquier otro borrador de usuario

#### Scenario: Ningún endpoint de conciliación crea comprobantes

- GIVEN cualquier endpoint bajo `/api/cuentas-bancarias`, `/api/conciliacion`
  o `/api/movimientos-bancarios`
- WHEN se inspecciona su implementación
- THEN ninguno invoca creación, edición ni anulación de `Comprobante` o
  `LineaComprobante`

### REQ-CB-16: Validación del número de cuenta del extracto contra la `CuentaBancaria` destino

Cuando el perfil expone el número de cuenta en la cabecera del archivo
(confirmado para los 3 perfiles de v1: BancoSol y Económico bajo la misma
etiqueta `Cuenta:`, Unión bajo `Cuenta:` — si un perfil futuro no lo
expusiera, aplica el fallback de advertencia sin rechazo descrito más
abajo), el servicio de importación DEBE extraerlo y
compararlo contra `CuentaBancaria.numeroCuenta` **antes de persistir
cualquier movimiento o fila de `ImportacionExtracto`**.

**El valor bajo la etiqueta puede necesitar limpieza específica del
dialecto antes de comparar.** Verificado sobre el archivo real de
Económico: la etiqueta es `Cuenta:` (idéntica a BancoSol), pero el VALOR
es `CA: 2031262031 (Bs)` — con prefijo de producto (`CA:`) y sufijo de
moneda (`(Bs)`). El parser de cada perfil DEBE devolver el número YA
limpio (sin ese ruido); esa limpieza es dato del dialecto del adaptador
(qué prefijo/sufijo esperar), NUNCA lógica genérica de comparación. La
comparación exacta descrita abajo solo normaliza separadores (guiones,
espacios) — **NUNCA tolera prefijos alfabéticos** (un `startsWith` o strip
silencioso ahí desarmaría la regla técnica crítica). Si el parser no
reconoce el prefijo/sufijo esperado de su dialecto, es un error de
formato del archivo, no un strip silencioso.

Complementa
REQ-CB-03 (que valida estructura/formato, no identidad de cuenta): varias
cuentas del mismo banco pueden compartir `perfilExtracto` y solo diferir en
el número de cuenta (ej. `1191959-000-001` / `-002` / `-003`) — importar el
extracto de una cuenta en otra es el error más probable del módulo, y es
**irreversible**: una `ImportacionExtracto` con movimientos no se puede
eliminar (`onDelete: Restrict`); solo se puede deshacer un match, no una
importación entera.

**Regla técnica crítica — comparación EXACTA sobre el número normalizado.**
La normalización quita guiones, espacios y demás separadores de ambos
números y compara el resultado completo, carácter por carácter
(`1191959-000-001` ≡ `1191959000001` ≡ `1191959 000 001`, pero `...001` ≠
`...002`). El sistema **NUNCA** DEBE usar `startsWith`, `includes`, ni
ninguna forma de comparación por prefijo o substring para esta validación:
con números que difieren solo en el dígito final, un match parcial haría
pasar cualquier combinación entre las cuentas del usuario y volvería la
validación **peor que no tenerla** — daría confianza falsa donde antes al
menos no había ninguna.

Si la comparación no coincide, el sistema DEBE rechazar la importación
completa (`CONCILIACION_ARCHIVO_CUENTA_NO_COINCIDE`, 422) antes de escribir
nada, con un mensaje que muestre **los dos números juntos** — "El archivo
corresponde a la cuenta `X` y lo estás importando en `Y`. Verificá que
bajaste el extracto de la cuenta correcta." — nunca un genérico "cuenta
incorrecta": con números casi idénticos el usuario necesita ver ambos para
detectar el dígito que difiere.

Si el perfil no expone número de cuenta en la cabecera, o el parser no logra
extraerlo de un archivo concreto, el sistema DEBE advertir de forma visible
y CONTINUAR con la importación — no se rechaza por la ausencia de un dato
que el formato no garantiza.

En la primera importación de una `CuentaBancaria` sin `numeroCuenta` cargado
(REQ-CB-01), el sistema DEBE tomar el número del archivo y presentarlo al
usuario para **confirmación explícita** antes de guardarlo — nunca asumirlo
en silencio; esto elimina el error de transcripción manual al dar de alta la
cuenta.

**No contradice la decisión 3**: el rechazo ocurre del lado de la
importación — un archivo que todavía no tocó la base de datos — no del
núcleo contable. Comprobantes, líneas, anulaciones, borradores y períodos
fiscales siguen editables/anulables/cerrables sin ninguna restricción nueva.

#### Scenario: Número de cuenta coincide — importa normal

- GIVEN una `CuentaBancaria` con `numeroCuenta="1191959-000-001"` y un
  archivo con cabecera `Cuenta: 1191959-000-001`
- WHEN se importa
- THEN la validación de número de cuenta pasa y el flujo continúa con el
  resto de las validaciones (REQ-CB-03 a REQ-CB-08)

#### Scenario: Mismo número con formato distinto — normaliza y coincide

- GIVEN una `CuentaBancaria` con `numeroCuenta="1191959-000-001"` y un
  archivo con cabecera `Cuenta: 1191959000001` (sin guiones)
- WHEN se importa
- THEN ambos números se normalizan quitando separadores, coinciden, y la
  importación continúa

#### Scenario: Archivo de otra cuenta del mismo banco — rechazo con ambos números visibles

- GIVEN una `CuentaBancaria` con `numeroCuenta="1191959-000-001"` y un
  archivo con cabecera `Cuenta: 1191959-000-002`
- WHEN se importa
- THEN el sistema rechaza con `CONCILIACION_ARCHIVO_CUENTA_NO_COINCIDE` (422)
- AND cero movimientos y cero filas de `ImportacionExtracto` quedan persistidos
- AND el mensaje incluye ambos números: `1191959-000-002` (el del archivo) y
  `1191959-000-001` (el de la cuenta destino)

#### Scenario: Comparación por prefijo NUNCA es aceptable

- GIVEN `1191959-000-001` (cuenta destino) y `1191959-000-002` (archivo) —
  comparten los primeros 12 caracteres normalizados
- WHEN el sistema los normaliza y compara
- THEN se consideran **DISTINTOS**; ninguna implementación de esta
  validación puede usar `startsWith`/`includes`/prefijo, solo igualdad exacta
  de la cadena normalizada completa

#### Scenario: Perfil sin número de cuenta en cabecera — advierte, no rechaza

- GIVEN un perfil cuyo descriptor no expone extracción de número de cuenta,
  o el parser no logra extraerlo de un archivo concreto
- WHEN se importa
- THEN el sistema muestra una advertencia visible y la importación continúa
  sin bloquearse por la ausencia del dato

#### Scenario: Primera importación sin número cargado — captura y confirma

- GIVEN una `CuentaBancaria` recién creada con `numeroCuenta` vacío
- WHEN se sube el primer archivo y el parser extrae un número de cuenta de
  la cabecera
- THEN el sistema lo muestra al usuario ("Este extracto dice cuenta X. ¿Es
  esta cuenta?") y solo lo persiste en `CuentaBancaria.numeroCuenta` tras
  confirmación explícita — nunca lo asume en silencio

### REQ-CB-17: Confirmar y deshacer un match de conciliación

Esta es la acción central del producto (decisión 2: **el usuario SIEMPRE
confirma**). El motor de sugerencias (REQ-CB-12) solo ranquea — este
requisito cubre qué pasa cuando el usuario efectivamente confirma o
deshace un par.

**Confirmar** DEBE crear un `MatchConciliacion` con el snapshot completo de
5 campos (REQ-CB-10: `cuentaId`, `monto`, `tipo`, `moneda`, `fecha` de la
línea contable en el momento de confirmar) y dejar la columna persistida
`MovimientoBancario.estado = CONCILIADO` (REQ-CB-11).

**Regla 1↔1 ESTRICTA en v1** — enforzada por DOS constraints de unicidad:
`@@unique([organizationId, movimientoBancarioId])` (un movimiento tiene a
lo sumo un match) y `@@unique([organizationId, comprobanteId, orden])` (una
línea contable tiene a lo sumo un match). v1 NO soporta N↔1: un depósito
registrado en 2+ líneas contables no se puede conciliar del todo con un
único movimiento bancario — la salida es marcar el movimiento `IGNORADO`
(REQ-CB-18) o ajustar el asiento, nunca forzar un match parcial.

Cuando el usuario intenta confirmar contra una línea `(comprobanteId,
orden)` que YA tiene un match:
- Si ese match existente tiene el vínculo **sano** (REQ-CB-10) → el
  sistema DEBE rechazar con `CONCILIACION_LINEA_YA_CONCILIADA` (409).
- Si ese match existente tiene el vínculo **roto** (REQ-CB-10) → el
  sistema DEBE **reemplazarlo**: borra el match roto (escritura explícita
  disparada por la confirmación del usuario — no contradice "una lectura
  nunca escribe" de REQ-CB-10, porque esto es una escritura, no una
  lectura) y crea el nuevo match en su lugar.
  **En la MISMA transacción DEBE devolver a `PENDIENTE` el movimiento
  bancario que quedó sin match** al borrarse el roto. Sin eso ese movimiento
  quedaría con `estado=CONCILIADO` y sin ningún match apuntándolo, violando
  la invariante `estado==='CONCILIADO' ⟺ existe MatchConciliacion` y —peor—
  sin forma de deshacerlo desde la UI, porque no habría match que borrar.

Cuando el usuario intenta confirmar contra un **movimiento** que ya tiene un
match, el sistema DEBE rechazar con `CONCILIACION_MOVIMIENTO_YA_TIENE_MATCH`
(409). Es un code DISTINTO de `CONCILIACION_MOVIMIENTO_YA_CONCILIADO` (422,
REQ-CB-18): son condiciones distintas y un mismo code estable no puede viajar
con dos estados HTTP en un contrato público.

**Deshacer** un match DEBE borrar el `MatchConciliacion` y devolver
`MovimientoBancario.estado = PENDIENTE`. Deshacer NUNCA toca el
comprobante ni sus líneas (decisión 3, REQ-CB-15) — es una operación
exclusiva de la tabla de conciliación.

#### Scenario: Confirmar una sugerencia — crea el match

- GIVEN una sugerencia (cualquier nivel de confianza) entre un movimiento
  `PENDIENTE` sin match y una línea `EN_TRANSITO` sin match
- WHEN el usuario confirma esa sugerencia
- THEN se crea un `MatchConciliacion` con snapshot de los 5 campos de la
  línea en ese instante
- AND `MovimientoBancario.estado` pasa a `CONCILIADO`

#### Scenario: Confirmar contra un movimiento ya conciliado — rechazo

- GIVEN un `MovimientoBancario` que ya tiene un `MatchConciliacion` válido
- WHEN el usuario intenta confirmar otro match para ese mismo movimiento
- THEN el sistema rechaza con `CONCILIACION_MOVIMIENTO_YA_TIENE_MATCH` (409)
- AND la constraint `@@unique([organizationId, movimientoBancarioId])` lo
  garantiza también en la base, aunque el servicio fallara (defense in depth)

#### Scenario: Confirmar contra una línea ya conciliada con vínculo sano — 409

- GIVEN una línea `(comprobanteId, orden)` con un `MatchConciliacion`
  existente cuyo vínculo está sano (REQ-CB-10)
- WHEN el usuario intenta confirmar un nuevo match contra esa misma línea
  (desde otro movimiento)
- THEN el sistema rechaza con `CONCILIACION_LINEA_YA_CONCILIADA` (409)
- AND el match existente permanece intacto

#### Scenario: Confirmar contra una línea cuyo match previo está roto — reemplazo

- GIVEN una línea `(comprobanteId, orden)` con un `MatchConciliacion`
  existente cuyo vínculo está roto (REQ-CB-10 — ej. el comprobante se
  editó y esa línea ya no coincide con el snapshot viejo)
- WHEN el usuario confirma un nuevo match contra esa línea
- THEN el sistema borra el match roto y crea el nuevo
- AND no queda ningún match huérfano apuntando a un snapshot viejo

#### Scenario: Deshacer un match

- GIVEN un `MovimientoBancario` con `estado=CONCILIADO` y su
  `MatchConciliacion` correspondiente
- WHEN el usuario deshace el match
- THEN el `MatchConciliacion` se borra y `MovimientoBancario.estado` vuelve
  a `PENDIENTE`
- AND el comprobante y sus líneas contables no se modifican

### REQ-CB-18: Ignorar y des-ignorar un movimiento bancario

`MovimientoBancario.estado` PUEDE marcarse `IGNORADO` — la salida honesta
para movimientos que v1 no puede conciliar 1↔1 (ej. un depósito compuesto
registrado en varias líneas contables, REQ-CB-17) sin forzar un match
incorrecto. Ignorar es reversible (des-ignorar) y NUNCA borra el
movimiento ni crea o borra ningún `MatchConciliacion`.

Un movimiento con un match **válido** (`estado=CONCILIADO` con vínculo
sano) NO PUEDE pasar directo a `IGNORADO` — el sistema DEBE rechazar esa
transición y exigir deshacer el match primero (REQ-CB-17), para no dejar
un movimiento simultáneamente "conciliado" e "ignorado".

#### Scenario: Ignorar un movimiento pendiente

- GIVEN un `MovimientoBancario` con `estado=PENDIENTE`
- WHEN el usuario lo marca como ignorado
- THEN `estado` pasa a `IGNORADO`

#### Scenario: Des-ignorar — vuelve a pendiente

- GIVEN un `MovimientoBancario` con `estado=IGNORADO`
- WHEN el usuario lo des-ignora
- THEN `estado` vuelve a `PENDIENTE`

#### Scenario: Ignorar no crea ni borra ningún match

- GIVEN un `MovimientoBancario` con `estado=PENDIENTE` y sin ningún
  `MatchConciliacion`
- WHEN el usuario lo marca como ignorado
- THEN sigue sin existir ningún `MatchConciliacion` para ese movimiento
- AND el movimiento en sí no se borra, solo cambia su `estado`

#### Scenario: Ignorar un movimiento con match válido — rechazo

- GIVEN un `MovimientoBancario` con `estado=CONCILIADO` y un
  `MatchConciliacion` con vínculo sano
- WHEN el usuario intenta marcarlo como ignorado directamente
- THEN el sistema rechaza con `CONCILIACION_MOVIMIENTO_YA_CONCILIADO` (422)
  y exige deshacer el match primero (REQ-CB-17)
