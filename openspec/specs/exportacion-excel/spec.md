# Exportación a Excel — Especificación

<!--
Última edición: 2026-06-05
Última revisión contra core: 2026-06-05
Owner: frontend-lead
-->

## Propósito

Infraestructura frontend reutilizable para serializar informes contables bolivianos a `.xlsx`, con cabecera fiscal de la organización, formateo es-BO, montos escritos como celda numérica (sin recálculo) y descarga del blob en el navegador.

**Alcance actual (Fases A + B):** Libro Diario (piloto), Libro Mayor, Balance General y Estado de Resultados exportan a Excel. La Fase C (Comprobantes) queda fuera del scope actual; reutilizará esta misma infraestructura cuando se implemente.

La generación es **100% frontend** sobre el JSON ya fetcheado: cero backend, sin endpoint de export, sin Port nuevo.

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

A partir del perfil fiscal de la organización (`razonSocial`, `nit`, `direccion`, `representanteLegal`, `telefono`, `email`, **todos `string | null`**, obtenido de `GET /tenants/current`), el helper DEBE armar el bloque de cabecera del informe como filas de celdas de texto. Un campo `null` DEBE omitirse (no genera línea) y NUNCA debe imprimirse la cadena literal `"null"`. El armado NO DEBE romper ante cualquier combinación de campos null.

#### Escenario: Todos los campos fiscales presentes

- DADO un perfil con los 6 campos seteados
- CUANDO se arma la cabecera fiscal
- ENTONCES la cabecera contiene una línea por cada campo presente con su valor, en orden (`razonSocial`, `nit`, `direccion`, `representanteLegal`, `telefono`, `email`)

#### Escenario: Todos los campos null

- DADO un perfil con los 6 campos en `null`
- CUANDO se arma la cabecera fiscal
- ENTONCES el bloque no contiene líneas de datos fiscales y no aparece la cadena `"null"` en ninguna celda
- Y el armado no lanza error

#### Escenario: Mezcla de campos presentes y null

- DADO un perfil con `razonSocial` y `nit` seteados y los otros 4 en `null`
- CUANDO se arma la cabecera fiscal
- ENTONCES la cabecera incluye solo las líneas de `razonSocial` y `nit`, omitiendo las líneas de los campos null

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

> **Nota de alcance:** este requisito cubre el Libro Diario (informe piloto de la Fase A). El Libro Mayor, Balance General y Estado de Resultados se implementaron en la Fase B (ver requisitos más abajo). Comprobantes es la Fase C, pendiente.

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

## Restricciones

- La generación es 100% frontend sobre el JSON ya fetcheado: sin endpoint de export, sin `StreamableFile`, sin Port nuevo, sin dependencia de export en backend.
- §4.5 (Money): los montos llegan como string decimal y se escriben como celda numérica; la conversión `string → Number` ocurre solo en el boundary de serialización y nunca para recalcular. Los totales son los del backend. Esto aplica a todos los informes: subtotales de sección/subsección, saldo corriente del Mayor, total general, cuadre del Balance y resultado del ejercicio de Resultados son valores del backend; el cliente NUNCA los recalcula.
- §4.6 (FechaContable): las fechas `"YYYY-MM-DD"` se formatean a `"dd/mm/yyyy"` sin pasar por `Date`/UTC y se escriben como texto, no como celda de fecha de Excel. Solo el Libro Mayor tiene fechas por movimiento; Balance y Resultados usan fecha de corte/rango en cabecera.
- §4.7 (Anulados): los movimientos anulados del Libro Mayor se marcan visualmente; Balance y Resultados consumen la `data` ya filtrada por el `incluirAnulados` del fetch (no re-filtran en el export).
- §1 (idioma): textos de UI, marcas ("Anulado", "Contraria") y nombre de archivo en español.
- El helper de aplanado jerárquico (`aplanar-arbol.ts`) vive en `frontend/src/lib/export-excel/` (infra cross-feature) y lo consumen Balance y Estado de Resultados sin duplicación.
- `construirHoja` acepta `columns` (anchos) como parámetro opcional retrocompatible; el default mantiene el comportamiento de la Fase A.
- No se agrega ninguna dependencia nueva: `write-excel-file` ya está instalada (Fase A).
- Fuera de scope (de las Fases A y B): Comprobantes (Fase C); export a PDF; estilos ricos (logo embebido, merge de celdas, freeze panes, temas).
