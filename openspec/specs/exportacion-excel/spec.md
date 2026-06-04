# Exportación a Excel — Especificación

<!--
Última edición: 2026-06-03
Última revisión contra core: 2026-06-03
Owner: frontend-lead
-->

## Propósito

Infraestructura frontend reutilizable para serializar informes contables bolivianos a `.xlsx`, con cabecera fiscal de la organización, formateo es-BO, montos escritos como celda numérica (sin recálculo) y descarga del blob en el navegador.

**Alcance actual (Fase A):** el Libro Diario es el informe piloto. Las Fases B (Libro Mayor, Balance General, Estado de Resultados) y C (Comprobantes) quedan fuera del scope actual; reutilizarán esta misma infraestructura cuando se implementen.

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

> **Nota de alcance:** este requisito cubre solo el Libro Diario (informe piloto de la Fase A). El Libro Mayor, Balance General, Estado de Resultados y Comprobantes son informes de las Fases B y C; cuando se implementen, extenderán esta capability reutilizando la infraestructura `frontend/src/lib/export-excel/`.

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

## Restricciones

- La generación es 100% frontend sobre el JSON ya fetcheado: sin endpoint de export, sin `StreamableFile`, sin Port nuevo, sin dependencia de export en backend.
- §4.5 (Money): los montos llegan como string decimal y se escriben como celda numérica; la conversión `string → Number` ocurre solo en el boundary de serialización y nunca para recalcular. Los totales son los del backend.
- §4.6 (FechaContable): las fechas `"YYYY-MM-DD"` se formatean a `"dd/mm/yyyy"` sin pasar por `Date`/UTC y se escriben como texto, no como celda de fecha de Excel.
- §1 (idioma): textos de UI, estados y nombre de archivo en español.
- Fuera de scope de la Fase A (y de esta spec en su estado actual): Libro Mayor, Balance General, Estado de Resultados (Fase B); Comprobantes (Fase C); export a PDF; estilos ricos (logo embebido, temas).
