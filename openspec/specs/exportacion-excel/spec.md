# Exportación a Excel — Especificación

<!--
Última edición: 2026-06-09
Última revisión contra core: 2026-06-09
Owner: backend-lead
-->

## Propósito

Infraestructura frontend reutilizable para serializar informes contables bolivianos a `.xlsx`, con cabecera fiscal de la organización, formateo es-BO, montos escritos como celda numérica (sin recálculo) y descarga del blob en el navegador.

**Alcance (Fases A + B + C):** Libro Diario (piloto), Libro Mayor, Balance General, Estado de Resultados y listado de Comprobantes exportan a Excel.

La infraestructura frontend (`frontend/src/lib/export-excel/`) es reutilizable para todos los informes. **Fases A y B** (los 4 informes contables) generan el Excel **100% frontend** sobre el JSON ya cacheado: cero backend, sin endpoint dedicado, sin Port nuevo. **Fase C** (Comprobantes) introduce el primer endpoint backend de la capability — `GET /api/comprobantes/export` en el módulo `comprobantes/` — porque el listado pagina y el cache solo tiene la página visible; el mismo pipeline de serialización frontend se reutiliza.

---

## Requisitos

### Requisito: Builder genérico de hoja Excel

El builder DEBE recibir una matriz de celdas tipadas (cada celda con su tipo `texto` o `numero`) y producir un blob `.xlsx`. Las celdas numéricas DEBEN escribirse con `type: Number` y formato `#,##0.00`. Las celdas de texto DEBEN escribirse como string. Un monto que llega como **string decimal** del backend DEBE escribirse como **número** en la celda, sin recalcular ni perder precisión (§4.5): la conversión `string → Number` ocurre solo en el boundary de serialización a celda y nunca para hacer aritmética.

#### Escenario: Celda numérica con formato de moneda

- DADO una fila con una celda de tipo `numero` cuyo valor proviene del string `"1250.50"`
- CUANDO el builder construye la hoja
- ENTONCES la celda resultante tiene `type: Number`, valor numérico `1250.50` y formato `#,##0.00`

#### Escenario: Celda de texto

- DADO una fila con una celda de tipo `texto` con valor `"Compra de insumos"`
- CUANDO el builder construye la hoja
- ENTONCES la celda resultante es de tipo string con el mismo texto, sin formato numérico

#### Escenario: Monto string decimal no pierde precisión (caso +)

- DADO una celda numérica cuyo valor proviene del string `"1234567.89"`
- CUANDO el builder construye la hoja
- ENTONCES la celda contiene el número `1234567.89` exacto, sin redondeo ni recálculo

#### Escenario: El builder no realiza aritmética sobre los montos (caso −)

- DADO una hoja con varias celdas numéricas de montos (débitos y créditos) y una fila de totales cuyos valores ya vienen calculados del backend
- CUANDO el builder construye la hoja
- ENTONCES los valores de la fila de totales son exactamente los recibidos (el builder NO suma columnas ni deriva totales en el cliente)

#### Escenario: Produce un blob descargable

- DADO una matriz de celdas válida con al menos una fila
- CUANDO el builder genera la salida
- ENTONCES devuelve un `Blob` con MIME type de hoja de cálculo Excel (`.xlsx`)

---

### Requisito: Bloque de cabecera fiscal

A partir del perfil (`razonSocial`, `nit`, `direccion`, `representanteLegal`, `telefono`, `email`, todos `string | null`), el helper DEBE armar filas de texto. `razonSocial` presente DEBE ser primera fila con `fontWeight: 'bold'` y SIN etiqueta. Los demás presentes DEBEN llevar etiqueta fija: `"NIT: <v>"`, `"Dirección: <v>"`, `"Representante Legal: <v>"`, `"Teléfono: <v>"`, `"Email: <v>"`. Campo `null` DEBE omitirse; NUNCA se imprime `"null"`. Si `razonSocial` es `null`, ninguna fila lleva negrita.

#### Escenario: Todos los campos presentes

- DADO un perfil con los 6 campos seteados
- CUANDO se arma la cabecera
- ENTONCES la primera fila tiene `value === razonSocial` con `fontWeight === 'bold'`; las siguientes tienen `"NIT: ..."`, `"Dirección: ..."`, etc., sin `fontWeight`, en orden

#### Escenario: razonSocial null — sin negrita

- DADO un perfil con `razonSocial: null` y `nit` seteado
- CUANDO se arma la cabecera
- ENTONCES la primera fila es `"NIT: <valor>"` sin `fontWeight`

#### Escenario: Campo null omitido

- DADO un perfil con `direccion: null`
- CUANDO se arma la cabecera
- ENTONCES no hay fila de Dirección y ninguna celda contiene la cadena `"null"`

#### Escenario: Todos null — sin error

- DADO un perfil con todos los campos en `null`
- CUANDO se arma la cabecera
- ENTONCES el bloque no tiene líneas y el armado no lanza error

---

### Requisito: Formateo es-BO de montos y fechas

El formateo DEBE seguir las convenciones bolivianas. Una fecha de dominio en formato `"YYYY-MM-DD"` DEBE convertirse a `"dd/mm/yyyy"` **sin construir un `Date` UTC** (§4.6), para no corromper el día por zona horaria; la fecha se escribe como **texto** (no como celda de fecha de Excel). Para el valor de celda numérica, un monto string decimal DEBE convertirse a `Number` (§4.5); NO se reutiliza el formateador de pantalla `formatearMontoBob` (que devuelve un string locale, no un número).

#### Escenario: Fecha de día intermedio

- DADO la fecha `"2026-06-15"`
- CUANDO se formatea a es-BO
- ENTONCES el resultado es `"15/06/2026"`

#### Escenario: Fecha de fin de mes no se corre de día (caso límite)

- DADO la fecha `"2026-01-31"`
- CUANDO se formatea a es-BO
- ENTONCES el resultado es `"31/01/2026"` (no `"30/01/2026"` ni `"01/02/2026"`)

#### Escenario: Fecha de fin de año no se corre de día (caso límite)

- DADO la fecha `"2026-12-31"`
- CUANDO se formatea a es-BO
- ENTONCES el resultado es `"31/12/2026"`

#### Escenario: Fecha del día 01 no se corre al mes anterior (caso límite)

- DADO la fecha `"2026-03-01"`
- CUANDO se formatea a es-BO
- ENTONCES el resultado es `"01/03/2026"`

#### Escenario: Monto string decimal a número de celda (caso +)

- DADO el monto string `"1250.50"`
- CUANDO se convierte para celda numérica
- ENTONCES el resultado es el número `1250.50` (no el string `"1.250,50"`)

#### Escenario: Monto entero sin decimales

- DADO el monto string `"1000"`
- CUANDO se convierte para celda numérica
- ENTONCES el resultado es el número `1000`

#### Escenario: Monto string inválido (caso −)

- DADO un monto string que no representa un número (`"abc"` o `""`)
- CUANDO se convierte para celda numérica
- ENTONCES se aplica un fallback determinístico (`0` o se marca como celda de texto vacía) sin lanzar `NaN` a la celda numérica

---

### Requisito: Descarga del blob en el navegador

Dado un blob `.xlsx` y los datos del informe, la descarga DEBE dispararse en el navegador con un nombre de archivo derivado del informe más su período o fecha. El nombre DEBE estar en español y tener extensión `.xlsx`.

#### Escenario: Nombre de archivo derivado del informe y el rango

- DADO un blob de Libro Diario para el rango `"2026-06"`
- CUANDO se dispara la descarga
- ENTONCES el nombre de archivo incluye una referencia al informe (`libro-diario`) y al período/fecha, y termina en `.xlsx`

#### Escenario: Se dispara la descarga

- DADO un blob válido y un nombre de archivo
- CUANDO se invoca la descarga
- ENTONCES se crea un enlace de descarga con el blob como `href` y se libera la URL del objeto tras disparar el clic (sin fuga de `ObjectURL`)

---

### Requisito: Libro Diario — Exportar a Excel (piloto, Fase A)

La pantalla del Libro Diario DEBE ofrecer un botón "Exportar a Excel" (texto en español), gateado por el permiso `contabilidad.libro-diario.read` a través del `PermissionButton` existente. Al accionarlo, DEBE generar el `.xlsx` con la cabecera fiscal de la organización seguida de los asientos aplanados (asiento → líneas), con los montos débito/crédito como celdas numéricas formateadas y las fechas en `dd/mm/yyyy`. El botón consume la `data` ya cargada en cache (no re-fetchea el informe) y la cabecera fiscal del hook `useEmpresa()` existente.

> **Nota de alcance:** este requisito cubre el Libro Diario (informe piloto de la Fase A). El Libro Mayor, Balance General y Estado de Resultados se implementaron en la Fase B (ver requisitos más abajo). El listado de Comprobantes se implementó en la Fase C (ver requisito más abajo).

#### Escenario: Mapeo de Libro Diario a hoja (estructura anidada aplanada)

- DADO una respuesta de Libro Diario con 2 asientos, el primero con 2 líneas y el segundo con 3 líneas
- CUANDO se mapea a la matriz de celdas
- ENTONCES la hoja contiene una fila por cada línea (5 filas de detalle), cada una con su fecha contable en `dd/mm/yyyy`, código y nombre de cuenta, glosa, y los montos `debeBob`/`haberBob` como celdas numéricas

#### Escenario: Fila de totales con los valores del backend

- DADO una respuesta de Libro Diario con `totalDebeBob` y `totalHaberBob` ya calculados por el backend
- CUANDO se mapea a la matriz de celdas
- ENTONCES la hoja incluye una fila de totales con esos valores escritos tal cual (sin recálculo en el cliente)

#### Escenario: Asiento anulado marcado en la hoja

- DADO una respuesta de Libro Diario con un asiento cuyo flag `anulado` es `true`
- CUANDO se mapea a la matriz de celdas
- ENTONCES las filas de ese asiento incluyen una marca de "Anulado" (texto), distinguiéndolo de los asientos vigentes

#### Escenario: Glosa null en una línea no rompe el mapeo

- DADO una línea de asiento con `glosa: null`
- CUANDO se mapea a la matriz de celdas
- ENTONCES la celda de glosa queda vacía (sin imprimir `"null"`) y el mapeo no lanza error

#### Escenario: Export con cabecera fiscal completa produce el archivo

- DADO un perfil fiscal con todos los campos y una respuesta de Libro Diario con N asientos
- CUANDO se genera el `.xlsx`
- ENTONCES el archivo contiene primero el bloque de cabecera fiscal y luego las filas de los asientos, y la descarga se dispara

#### Escenario: Export con cabecera fiscal con campos null no rompe (caso −)

- DADO un perfil fiscal con todos los campos en `null` y una respuesta de Libro Diario con asientos
- CUANDO se genera el `.xlsx`
- ENTONCES el archivo se genera igual, omitiendo las líneas de cabecera vacías, sin lanzar error

#### Escenario: Botón gateado sin permiso

- DADO un usuario sin el permiso `contabilidad.libro-diario.read`
- CUANDO ve la pantalla del Libro Diario
- ENTONCES el botón "Exportar a Excel" está deshabilitado (con tooltip), reusando el comportamiento del `PermissionButton`

#### Escenario: Botón deshabilitado sin datos

- DADO la pantalla del Libro Diario cuya query aún no tiene `data` (cargando o vacío)
- CUANDO se renderiza el botón
- ENTONCES el botón "Exportar a Excel" está deshabilitado hasta que haya datos para exportar

---

---

### Requisito: Aplanado de árbol jerárquico de 3 niveles (helper reutilizable)

La infraestructura DEBE proveer un helper reutilizable que aplane un árbol contable de
3 niveles (`Sección → Subsección → Cuenta`) a filas de celdas para el Excel, compartido
entre el Balance General y el Estado de Resultados. El helper DEBE recibir una lista de
secciones homogéneas (cada sección con `titulo`, `totalBob` y sus subsecciones; cada
subsección con `titulo`, `totalBob` y sus cuentas; cada cuenta con `nombre`, `codigoInterno`
opcional/nullable y `saldoBob`) y producir filas que representen la jerarquía por **nivel
(indentación)**, intercalando las **filas de subtotal de sección y de subsección con los
totales que ya vienen del backend**. El helper NO DEBE recalcular ningún total ni saldo: los
montos string se escriben como celda numérica (§4.5), sin aritmética en cliente.

#### Escenario: Aplana sección con una subsección y dos cuentas

- DADO una sección con `totalBob`, una subsección con `totalBob` y dos cuentas con `saldoBob`
- CUANDO se aplana el árbol a filas
- ENTONCES la hoja contiene: una fila de título/subtotal de la sección, una fila de título/subtotal de la subsección, y una fila por cada cuenta con su nombre (indentado por nivel), su código si lo tiene, y su `saldoBob` como celda numérica

#### Escenario: La indentación refleja el nivel jerárquico

- DADO un árbol con cuentas en una subsección dentro de una sección
- CUANDO se aplana
- ENTONCES las filas de sección, subsección y cuenta se distinguen por nivel (indentación creciente o columna de nivel), de modo que la jerarquía es legible en la hoja

#### Escenario: Subtotales del backend, sin recálculo (caso −)

- DADO una sección cuyo `totalBob` y subsecciones cuyos `totalBob` NO son la suma aritmética de las cuentas listadas (por ejemplo, porque el backend agrega líneas no expuestas)
- CUANDO se aplana el árbol
- ENTONCES las filas de subtotal usan exactamente los `totalBob` recibidos del backend (el helper NO suma las cuentas para derivar el subtotal)

#### Escenario: Sección sin subsecciones (rama vacía)

- DADO una sección cuyo arreglo de subsecciones está vacío
- CUANDO se aplana
- ENTONCES la sección aparece con su título/subtotal y sin filas de detalle, y el aplanado no lanza error

#### Escenario: Subsección sin cuentas

- DADO una subsección con `totalBob` y cuentas vacías
- CUANDO se aplana
- ENTONCES la subsección aparece con su título/subtotal y sin filas de cuenta, sin error

#### Escenario: Cuenta sin código interno (línea sintética)

- DADO una cuenta con `codigoInterno: null` (línea sintética del Balance)
- CUANDO se aplana
- ENTONCES la fila de esa cuenta omite el código (sin imprimir `"null"`) y mantiene nombre y `saldoBob`, sin error

---

### Requisito: Libro Mayor — Exportar a Excel

La pantalla del Libro Mayor DEBE ofrecer un botón "Exportar a Excel" (texto en español),
gateado por el permiso `contabilidad.libro-mayor.read` mediante el `PermissionButton`
existente. Al accionarlo, DEBE generar el `.xlsx` con la cabecera fiscal de la organización
seguida del Libro Mayor **aplanado cuenta → movimientos**: por cada cuenta, una fila de
cabecera de cuenta (código, nombre, naturaleza, saldo inicial, total debe, total haber, saldo
final) seguida de una fila por cada movimiento con su fecha contable en `dd/mm/yyyy`,
comprobante, glosa, debe, haber y **saldo corriente acumulado** (`saldoCorrienteBob`). Al pie,
una fila de total general del rango con `totalDebeBob`/`totalHaberBob` del backend. El botón
consume la `data` ya cargada en cache (no re-fetchea) y la cabecera fiscal de `useEmpresa()`.

#### Escenario: Mapeo de Libro Mayor a hoja (cuenta → movimientos aplanado)

- DADO una respuesta de Libro Mayor con 2 cuentas, la primera con 3 movimientos y la segunda con 2
- CUANDO se mapea a la matriz de celdas
- ENTONCES la hoja contiene, por cada cuenta, una fila de cabecera de cuenta y una fila por movimiento (3 + 2 = 5 filas de movimiento), cada movimiento con su fecha `dd/mm/yyyy`, comprobante, glosa, debe, haber y saldo corriente

#### Escenario: El saldo corriente se escribe como celda numérica del backend (sin recálculo)

- DADO un movimiento con `saldoCorrienteBob` ya calculado por el backend
- CUANDO se mapea a la matriz de celdas
- ENTONCES la celda de saldo corriente es numérica con ese valor exacto (el cliente NO acumula débitos/créditos para derivar el saldo)

#### Escenario: Fila de total general con los valores del backend

- DADO una respuesta con `totalDebeBob` y `totalHaberBob` ya calculados
- CUANDO se mapea
- ENTONCES la hoja incluye una fila de total general con esos valores tal cual, sin recálculo en cliente

#### Escenario: Movimiento anulado marcado en la hoja

- DADO un movimiento cuyo flag `anulado` es `true`
- CUANDO se mapea
- ENTONCES la fila de ese movimiento incluye una marca de "Anulado" (texto), distinguiéndolo de los vigentes

#### Escenario: Fecha de movimiento sin corrimiento de día por UTC

- DADO un movimiento con `fechaContable: "2026-01-31"`
- CUANDO se mapea
- ENTONCES la celda de fecha es el texto `"31/01/2026"` (no `"30/01/2026"`)

#### Escenario: Glosa null en un movimiento no rompe el mapeo

- DADO un movimiento con `glosaLinea: null`
- CUANDO se mapea
- ENTONCES la celda de glosa queda vacía (sin imprimir `"null"`) y el mapeo no lanza error

#### Escenario: Botón gateado sin permiso

- DADO un usuario sin el permiso `contabilidad.libro-mayor.read`
- CUANDO ve la pantalla del Libro Mayor
- ENTONCES el botón "Exportar a Excel" está deshabilitado (con tooltip), reusando el `PermissionButton`

#### Escenario: Botón deshabilitado sin datos

- DADO la pantalla del Libro Mayor cuya query aún no tiene `data`
- CUANDO se renderiza el botón
- ENTONCES el botón "Exportar a Excel" está deshabilitado hasta que haya datos para exportar

---

### Requisito: Balance General — Exportar a Excel

La pantalla del Balance General DEBE ofrecer un botón "Exportar a Excel" (texto en español),
gateado por el permiso `contabilidad.eeff.read` mediante el `PermissionButton` existente. Al
accionarlo, DEBE generar el `.xlsx` con la cabecera fiscal de la organización seguida del
árbol del Balance (secciones `Activo`, `Pasivo`, `Patrimonio`) **aplanado con el helper de
árbol de 3 niveles**, y una fila de cuadre de la ecuación contable al pie usando los campos
`totalActivoBob`, `totalPasivoBob`, `totalPatrimonioBob`, `cuadra` y `diferenciaBob` del
backend. El botón consume la `data` ya cargada en cache (no re-fetchea) y la cabecera fiscal
de `useEmpresa()`.

#### Escenario: Mapeo del Balance a hoja vía el helper de aplanado

- DADO una respuesta de Balance con las secciones Activo, Pasivo y Patrimonio, cada una con subsecciones y cuentas
- CUANDO se mapea a la matriz de celdas
- ENTONCES la hoja contiene las tres secciones aplanadas (sección → subsección → cuenta, con indentación por nivel) y los subtotales de sección/subsección del backend

#### Escenario: Fila de cuadre con los valores del backend

- DADO una respuesta con `totalActivoBob`, `totalPasivoBob`, `totalPatrimonioBob`, `cuadra` y `diferenciaBob`
- CUANDO se mapea
- ENTONCES la hoja incluye una fila de cuadre con esos valores tal cual (el cliente NO suma Pasivo + Patrimonio para el archivo; usa los totales y el `cuadra`/`diferenciaBob` que provee el backend)

#### Escenario: Cuenta contraria marcada en la hoja

- DADO una cuenta con `esContraria: true`
- CUANDO se mapea
- ENTONCES la fila de esa cuenta indica que es contraria (texto/marca), respetando la convención contable de valor que resta del grupo

#### Escenario: Export con cabecera fiscal con campos null no rompe (caso −)

- DADO un perfil fiscal con todos los campos en `null` y una respuesta de Balance
- CUANDO se genera el `.xlsx`
- ENTONCES el archivo se genera igual, omitiendo las líneas de cabecera vacías, sin lanzar error

#### Escenario: Botón gateado sin permiso

- DADO un usuario sin el permiso `contabilidad.eeff.read`
- CUANDO ve la pantalla del Balance General
- ENTONCES el botón "Exportar a Excel" está deshabilitado (con tooltip), reusando el `PermissionButton`

#### Escenario: Botón deshabilitado sin datos

- DADO la pantalla del Balance General cuya query aún no tiene `data`
- CUANDO se renderiza el botón
- ENTONCES el botón "Exportar a Excel" está deshabilitado hasta que haya datos para exportar

---

### Requisito: Estado de Resultados — Exportar a Excel

La pantalla del Estado de Resultados DEBE ofrecer un botón "Exportar a Excel" (texto en
español), gateado por el permiso `contabilidad.eeff.read` mediante el `PermissionButton`
existente. Al accionarlo, DEBE generar el `.xlsx` con la cabecera fiscal de la organización
seguida del árbol del Estado de Resultados (secciones `Ingreso`, `Egreso`) **aplanado con el
mismo helper de árbol de 3 niveles** que el Balance, y una fila de Resultado del Ejercicio al
pie usando `totalIngresoBob`, `totalEgresoBob`, `resultadoEjercicioBob` y `esGanancia` del
backend. El botón consume la `data` ya cargada en cache (no re-fetchea) y la cabecera fiscal
de `useEmpresa()`.

#### Escenario: Mapeo del Estado de Resultados a hoja vía el helper de aplanado

- DADO una respuesta de Estado de Resultados con las secciones Ingreso y Egreso, cada una con subsecciones y cuentas
- CUANDO se mapea a la matriz de celdas
- ENTONCES la hoja contiene las dos secciones aplanadas (sección → subsección → cuenta, con indentación por nivel) y los subtotales de sección/subsección del backend

#### Escenario: Fila de Resultado del Ejercicio con los valores del backend

- DADO una respuesta con `totalIngresoBob`, `totalEgresoBob`, `resultadoEjercicioBob` y `esGanancia`
- CUANDO se mapea
- ENTONCES la hoja incluye una fila de Resultado del Ejercicio con esos valores tal cual, indicando ganancia o pérdida según `esGanancia` (el cliente NO resta Ingreso − Egreso para el archivo)

#### Escenario: Reutiliza el helper de aplanado del Balance

- DADO que Balance y Estado de Resultados comparten la forma `Sección → Subsección → Cuenta`
- CUANDO ambos informes generan su hoja
- ENTONCES ambos usan el mismo helper `aplanar-arbol` para las filas de detalle (no se duplica la lógica de aplanado)

#### Escenario: Botón gateado sin permiso

- DADO un usuario sin el permiso `contabilidad.eeff.read`
- CUANDO ve la pantalla del Estado de Resultados
- ENTONCES el botón "Exportar a Excel" está deshabilitado (con tooltip), reusando el `PermissionButton`

#### Escenario: Botón deshabilitado sin datos

- DADO la pantalla del Estado de Resultados cuya query aún no tiene `data`
- CUANDO se renderiza el botón
- ENTONCES el botón "Exportar a Excel" está deshabilitado hasta que haya datos para exportar

---

### Requisito: Endpoint de export del listado de comprobantes (sin paginar)

El sistema DEBE exponer `GET /api/comprobantes/export` en el módulo `comprobantes`, gateado por el
permiso `contabilidad.asientos.read` (el mismo que el listado). El endpoint DEBE aceptar los mismos
filtros del listado — `periodoFiscalId`, `tipo`, `estado`, `q`, `incluirAnulados` — SIN parámetros de
paginación (`page`/`limit`). DEBE devolver TODOS los comprobantes del tenant activo que matchean los
filtros, como `{ items: ComprobanteListItemDto[] }`, sin `total`/`page`/`limit`. Toda query DEBE
filtrar SIEMPRE por `organizationId = tenantId` (Anti-31, CLAUDE.md §4.2). Los montos DEBEN viajar
como string decimal (§4.5) y las fechas contables como calendario puro `YYYY-MM-DD` (§4.6), igual que
el listado paginado.

#### Escenario: Trae todas las filas del rango filtrado sin paginar

- DADO un tenant con 35 comprobantes que matchean los filtros activos
- CUANDO se invoca `GET /api/comprobantes/export` con esos filtros
- ENTONCES la respuesta contiene los 35 items, sin recortar por página

#### Escenario: Respeta los filtros del listado

- DADO comprobantes de varios tipos y estados, y filtros `tipo=INGRESO` y `estado=CONTABILIZADO`
- CUANDO se invoca el export con esos filtros
- ENTONCES la respuesta contiene solo los comprobantes de tipo INGRESO y estado CONTABILIZADO

#### Escenario: Aislamiento estricto por tenant (Anti-31)

- DADO dos organizaciones A y B, cada una con comprobantes propios
- CUANDO un usuario de la organización A invoca el export
- ENTONCES la respuesta contiene solo comprobantes de A y NINGUNO de B

#### Escenario: Sin permiso, el endpoint rechaza

- DADO un usuario sin el permiso `contabilidad.asientos.read`
- CUANDO invoca `GET /api/comprobantes/export`
- ENTONCES el backend responde 403 (RBAC), sin devolver datos

#### Escenario: Montos como string decimal y fechas como calendario puro

- DADO un comprobante con `totalDebitoBob = 1250.50` y `fechaContable = 2026-04-22`
- CUANDO se invoca el export
- ENTONCES el item trae `totalDebitoBob` como string `"1250.50"` (§4.5) y `fechaContable` como `"2026-04-22"` (§4.6), sin pasar por Float ni por UTC

---

### Requisito: Orden cronológico ascendente del export

El export DEBE ordenar las filas por `fechaContable` **ascendente**, con desempate por `numero`
ascendente y los `numero` nulos (borradores) **al final** (`NULLS LAST`). Este orden es DISTINTO del
listado paginado (que ordena `fechaContable DESC`, `numero DESC NULLS FIRST`): el export sigue el
estándar de auditoría contable (lectura cronológica de lo más antiguo a lo más reciente).

#### Escenario: Filas ordenadas de la fecha más antigua a la más reciente

- DADO comprobantes con fechas contables 2026-04-30, 2026-04-01 y 2026-04-15
- CUANDO se invoca el export
- ENTONCES los items aparecen en orden 2026-04-01, 2026-04-15, 2026-04-30

#### Escenario: Borradores (sin número) al final dentro de la misma fecha

- DADO dos comprobantes en la misma fecha: uno CONTABILIZADO con `numero` asignado y uno BORRADOR con `numero = null`
- CUANDO se invoca el export
- ENTONCES el CONTABILIZADO aparece antes que el BORRADOR (NULLS LAST en el desempate por número)

---

### Requisito: Cap de seguridad configurable del export

El export DEBE aplicar un tope defensivo de filas, configurable por la variable de entorno
`COMPROBANTES_EXPORT_MAX` (default 1000). El servicio DEBE contar las filas que matchean los filtros
ANTES de traerlas y, si la cantidad SUPERA el tope, DEBE lanzar un error de dominio con code estable
`COMPROBANTE_EXPORT_RANGO_EXCEDIDO` (formato `{MODULO}_{SUBDOMINIO}_{CONDICION}`, §6.3, 422) en lugar
de materializar un dataset enorme. Este patrón espeja `LIBRO_DIARIO_MAX_ASIENTOS` del Libro Diario.

#### Escenario: El rango excede el tope (caso +)

- DADO un tope `COMPROBANTES_EXPORT_MAX = 2` y filtros que matchean 3 comprobantes
- CUANDO se invoca el export
- ENTONCES el servicio lanza un error de dominio con code `COMPROBANTE_EXPORT_RANGO_EXCEDIDO` y NO devuelve filas, indicando que se acote el rango

#### Escenario: El rango no excede el tope (caso −)

- DADO un tope `COMPROBANTES_EXPORT_MAX = 2` y filtros que matchean 2 comprobantes
- CUANDO se invoca el export
- ENTONCES el servicio devuelve los 2 items normalmente, sin error

---

### Requisito: incluirAnulados espeja el toggle de pantalla

El export DEBE respetar el parámetro `incluirAnulados` (default false). Cuando es false, los
comprobantes anulados DEBEN excluirse; cuando es true, DEBEN incluirse y, en el Excel resultante, las
filas anuladas DEBEN llevar la marca "Anulado" en la columna Estado (mismo criterio §4.7 que el Libro
Diario). El frontend DEBE pasar al endpoint el mismo valor de `incluirAnulados` que está activo en los
filtros de la pantalla.

#### Escenario: Anulados excluidos por default

- DADO comprobantes contabilizados y uno anulado, y `incluirAnulados` ausente (default false)
- CUANDO se invoca el export
- ENTONCES la respuesta NO contiene el comprobante anulado

#### Escenario: Anulados incluidos y marcados

- DADO el toggle "incluir anulados" activo en pantalla y un comprobante anulado en el rango
- CUANDO se exporta a Excel
- ENTONCES el comprobante anulado aparece en la hoja con "Anulado" en la columna Estado

---

### Requisito: Mapeo del listado de comprobantes a la hoja Excel (9 columnas)

A partir de los items del export y del perfil fiscal de la organización, el frontend DEBE construir la
hoja con: las filas de cabecera fiscal (reutilizando `armarCabeceraFiscal`), una fila de encabezados de
columna, y una fila por comprobante. Las columnas DEBEN ser, en este orden: **Fecha, Número, Tipo,
Documento respaldo, Nro. Ref., Contacto, Glosa, Estado, Total BOB**. El mapeo DEBE reutilizar la
infraestructura de export existente (`construirHoja`, `formatearFechaCelda`, celda numérica para el
monto) y NO DEBE recalcular ningún total.

- **Fecha**: `fechaContable` formateada `dd/mm/yyyy` sin Date/UTC (§4.6).
- **Número**: `numero` tal cual; si es `null` (BORRADOR) → celda vacía (nunca "null").
- **Tipo**: el tipo del comprobante.
- **Documento respaldo**: los `tipoNombre` de `documentosRespaldo[]` concatenados con `" / "`; vacío si no hay.
- **Nro. Ref.**: los `numero` de `documentosRespaldo[]` concatenados con `" / "`; vacío si no hay.
- **Contacto**: los `nombre` de `contactos[]` concatenados con `" / "`; vacío si no hay.
- **Glosa**: la glosa.
- **Estado**: "Anulado" si `anulado === true`; si no, el `estado` del comprobante.
- **Total BOB**: `totalDebitoBob` como celda numérica `#,##0.00` (§4.5, string→Number solo en el boundary).

> **Nota de hallazgo:** NO existe un campo `numeroReferencia` independiente en el modelo `Comprobante`.
> La columna "Nro. Ref." proviene de `documentosRespaldo[].numero` (el número del documento físico de
> respaldo), igual que "Documento respaldo" proviene de `documentosRespaldo[].tipoNombre`. Ambas
> columnas salen del MISMO array. A diferencia de la tabla en pantalla (que muestra "Varios" cuando
> hay >1), el Excel concatena todos los valores (documento de auditoría, conviene el detalle completo).

#### Escenario: Fila de comprobante contabilizado completo

- DADO un comprobante CONTABILIZADO con número, tipo, un documento de respaldo, un contacto, glosa y `totalDebitoBob`
- CUANDO se mapea a la hoja
- ENTONCES su fila tiene la fecha `dd/mm/yyyy`, el número, el tipo, el tipo de documento, el número de documento, el nombre del contacto, la glosa, el estado, y el total como celda numérica

#### Escenario: Borrador sin número

- DADO un comprobante BORRADOR con `numero = null`
- CUANDO se mapea a la hoja
- ENTONCES la celda de la columna Número queda vacía (no imprime "null")

#### Escenario: Múltiples contactos y documentos concatenados

- DADO un comprobante con dos contactos y dos documentos de respaldo
- CUANDO se mapea a la hoja
- ENTONCES la celda Contacto contiene los dos nombres unidos por `" / "`, la celda Documento respaldo los dos tipos unidos por `" / "`, y la celda Nro. Ref. los dos números unidos por `" / "`

#### Escenario: Comprobante sin contacto ni documentos

- DADO un comprobante con `contactos = []` y `documentosRespaldo = []`
- CUANDO se mapea a la hoja
- ENTONCES las celdas Contacto, Documento respaldo y Nro. Ref. quedan vacías, sin error

#### Escenario: Comprobante anulado marcado en Estado

- DADO un comprobante con `anulado = true`
- CUANDO se mapea a la hoja
- ENTONCES la celda Estado contiene "Anulado"

#### Escenario: Cabecera fiscal con campos null

- DADO un perfil fiscal con algunos campos `null`
- CUANDO se arma la hoja
- ENTONCES los campos null se omiten de la cabecera (no se imprime "null") y la hoja se genera sin error

#### Escenario: El monto no se recalcula (caso −)

- DADO un comprobante cuyo `totalDebitoBob` viene como string del backend
- CUANDO se mapea a la hoja
- ENTONCES la celda Total BOB contiene exactamente ese número (§4.5), sin que el cliente sume líneas ni derive el total

---

### Requisito: Botón "Exportar a Excel" en el listado de comprobantes

La pantalla `ComprobantesPage` DEBE ofrecer un único botón "Exportar a Excel" en su header, gateado por
`contabilidad.asientos.read`. Al activarse, DEBE traer del backend TODO el rango que matchea los filtros
activos de la pantalla (sin paginar — NO la página visible), mapearlo y descargar el `.xlsx`. El botón
DEBE deshabilitarse con tooltip si el usuario no tiene el permiso (§14.7) y DEBE reflejar el estado
"Generando…" mientras dura el fetch y el armado (Anti-F-07). El fetch ocurre on-demand en el click
(no reutiliza el cache del listado paginado). NO DEBE existir opción de "página actual" ni export de
detalle individual.

#### Escenario: Usuario con permiso exporta el rango filtrado

- DADO un usuario con `contabilidad.asientos.read` y filtros activos en la pantalla
- CUANDO presiona "Exportar a Excel"
- ENTONCES el sistema trae todo el rango filtrado del backend (no la página visible) y descarga un `.xlsx`

#### Escenario: Usuario sin permiso ve el botón deshabilitado

- DADO un usuario sin `contabilidad.asientos.read`
- CUANDO observa la pantalla de comprobantes
- ENTONCES el botón "Exportar a Excel" aparece deshabilitado con un tooltip que explica por qué

#### Escenario: Feedback durante la generación

- DADO que el fetch del export + armado de la hoja toma tiempo
- CUANDO el usuario presiona el botón
- ENTONCES el botón muestra "Generando…" y queda deshabilitado hasta que la descarga se dispara

---

### Requisito: Props de estilo opcionales en `Celda`

`Celda` DEBE extenderse con `fontWeight?: 'bold'` y `align?: 'left'|'center'|'right'` opcionales. Sin estas props la serialización DEBE ser idéntica a hoy. El value numérico NO SE altera; `parsearMontoCelda` sigue siendo el único boundary `string → Number` con `format '#,##0.00'` (§4.5).

#### Escenario: fontWeight se propaga

- DADO una `CeldaTexto` con `fontWeight: 'bold'`
- CUANDO el builder construye la hoja
- ENTONCES la celda resultante tiene `fontWeight === 'bold'`

#### Escenario: Sin estilo — retrocompatible

- DADO una `CeldaTexto` sin `fontWeight` ni `align`
- CUANDO el builder construye la hoja
- ENTONCES el objeto resultante NO contiene las propiedades `fontWeight` ni `align`

#### Escenario: §4.5 intacto con estilo

- DADO una `CeldaNumero` con `fontWeight: 'bold'` y value `"1250.50"`
- CUANDO el builder construye la hoja
- ENTONCES la celda tiene `value === 1250.50`, `format === '#,##0.00'` y `fontWeight === 'bold'`

---

### Requisito: Alineación derecha por defecto en `CeldaNumero`

El builder DEBE aplicar `align: 'right'` a toda `CeldaNumero` sin `align` explícito. Un override explícito DEBE prevalecer. `CeldaTexto` sin `align` NO recibe default.

#### Escenario: Default right y override

- DADO una `CeldaNumero` sin `align` y otra con `align: 'left'`
- CUANDO el builder construye la hoja
- ENTONCES la primera tiene `align === 'right'` y la segunda `align === 'left'`

#### Escenario: CeldaTexto sin align

- DADO una `CeldaTexto` sin `align`
- CUANDO el builder construye la hoja
- ENTONCES el objeto resultante NO contiene `align`

---

### Requisito: Cabeceras de columna en negrita

En cada uno de los 5 informes, la fila de encabezados de columna DEBE tener `fontWeight: 'bold'` en todas sus celdas.

#### Escenario: Encabezados en negrita

- DADO cualquiera de los 5 informes exportado
- CUANDO se construye la hoja
- ENTONCES cada celda de la fila de encabezados tiene `fontWeight === 'bold'`

---

### Requisito: Filas de totales y subtotales en negrita

Las filas de total general y las filas de subtotal de sección/subsección (Balance, Estado de Resultados) DEBEN tener `fontWeight: 'bold'`. El informe de Comprobantes no tiene fila de totales.

#### Escenario: Total general en negrita

- DADO un informe con fila de total (Libro Diario o Libro Mayor)
- CUANDO se construye la hoja
- ENTONCES las celdas de la fila de total tienen `fontWeight === 'bold'`

#### Escenario: Subtotales jerárquicos en negrita, detalle sin negrita

- DADO un árbol aplanado (Balance o Estado de Resultados)
- CUANDO se construye la hoja
- ENTONCES las filas de subtotal de sección y subsección tienen `fontWeight === 'bold'`; las filas de cuenta de detalle NO tienen `fontWeight`

#### Escenario: Comprobantes — sin fila de totales

- DADO el informe de Comprobantes exportado
- CUANDO se construye la hoja
- ENTONCES no hay fila de totales; la única negrita es la fila de encabezados

---

## Restricciones

- **Fases A y B (informes contables):** la generación es 100% frontend sobre el JSON ya fetcheado: sin endpoint de export, sin `StreamableFile`, sin Port nuevo, sin dependencia de export en backend.
- **Fase C (Comprobantes):** introduce `GET /api/comprobantes/export` en el módulo `comprobantes/` porque el listado pagina. El mismo pipeline de serialización frontend se reutiliza. Cap defensivo `COMPROBANTES_EXPORT_MAX` (default 1000) aplicado server-side con count previo; si se supera → error de dominio 422 `COMPROBANTE_EXPORT_RANGO_EXCEDIDO`. Sin paginar: devuelve TODO el rango filtrado. Toda query filtra por `organizationId = tenantId` (Anti-31, §4.2).
- §4.5 (Money): los montos llegan como string decimal y se escriben como celda numérica; la conversión `string → Number` ocurre solo en el boundary de serialización y nunca para recalcular. Los totales son los del backend. Esto aplica a todos los informes: subtotales de sección/subsección, saldo corriente del Mayor, total general, cuadre del Balance, resultado del ejercicio de Resultados y `totalDebitoBob` de Comprobantes son valores del backend; el cliente NUNCA los recalcula.
- §4.6 (FechaContable): las fechas `"YYYY-MM-DD"` se formatean a `"dd/mm/yyyy"` sin pasar por `Date`/UTC y se escriben como texto, no como celda de fecha de Excel. El Libro Mayor y el export de Comprobantes tienen fechas por movimiento/comprobante; Balance y Resultados usan fecha de corte/rango en cabecera.
- §4.7 (Anulados): los movimientos anulados del Libro Mayor se marcan visualmente; Balance y Resultados consumen la `data` ya filtrada; el export de Comprobantes respeta `incluirAnulados` (parámetro del endpoint) y marca los anulados con "Anulado" en la columna Estado.
- §1 (idioma): textos de UI, marcas ("Anulado", "Contraria") y nombre de archivo en español.
- El helper de aplanado jerárquico (`aplanar-arbol.ts`) vive en `frontend/src/lib/export-excel/` (infra cross-feature) y lo consumen Balance y Estado de Resultados sin duplicación.
- `construirHoja` acepta `columns` (anchos) como parámetro opcional retrocompatible; el default mantiene el comportamiento de la Fase A.
- No se agrega ninguna dependencia nueva: `write-excel-file` ya está instalada (Fase A).
- **Estilos básicos (Estilos):** `CeldaEstilo` base con `fontWeight?: 'bold'` y `align?: 'left'|'center'|'right'` propagados en `construirHoja` vía spread condicional. Retrocompatible: sin props → serialización idéntica a antes. Implementado en change `exportacion-excel-estilos` (2026-06-09, PR #185). Sin deps nuevas: sigue usando `write-excel-file`.
- Fuera de scope: export a PDF; estilos ricos (logo embebido, merge de celdas, freeze panes, temas de color).
