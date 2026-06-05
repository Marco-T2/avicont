# Exportación a Excel — Especificación (DELTA Fase C)

<!--
Última edición: 2026-06-05
Última revisión contra core: 2026-06-05
Owner: backend-lead
-->

> **Naturaleza de este documento:** delta-spec de la **Fase C**. ADICIONA requisitos para el
> export del **listado de comprobantes** a la capability `exportacion-excel`. NO contradice ni
> reemplaza los requisitos de las Fases A y B (builder genérico, cabecera fiscal, formateo es-BO,
> descarga, Libro Diario, Libro Mayor, Balance General, Estado de Resultados, helper de aplanado),
> que siguen vigentes tal como están en `openspec/specs/exportacion-excel/spec.md`.
>
> **Diferencia estructural respecto a Fase A/B:** los 4 informes anteriores exportaban
> **frontend-puro** sobre el JSON ya cacheado (no paginan). El listado de comprobantes SÍ pagina,
> así que esta fase introduce el PRIMER requisito CON backend de la capability: un endpoint que
> trae el rango completo sin paginar. Esto AMPLÍA (no invalida) el alcance "100% frontend" de las
> fases previas: ese alcance sigue valiendo para los informes; el listado de comprobantes es la
> excepción justificada por su paginación.
>
> Al archivar, estos requisitos se fusionan en la spec viva.

---

## Requisitos ADICIONADOS

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
(formato `{MODULO}_{SUBDOMINIO}_{CONDICION}`, ej. `COMPROBANTE_EXPORT_RANGO_EXCEDIDO`) en lugar de
materializar un dataset enorme. Este patrón espeja `LIBRO_DIARIO_MAX_ASIENTOS` del Libro Diario.

#### Escenario: El rango excede el tope (caso +)

- DADO un tope `COMPROBANTES_EXPORT_MAX = 2` y filtros que matchean 3 comprobantes
- CUANDO se invoca el export
- ENTONCES el servicio lanza un error de dominio con code estable y NO devuelve filas, indicando que se acote el rango

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
> La columna "Nro. Ref." de la tabla en pantalla y de este Excel proviene de `documentosRespaldo[].numero`
> (el número del documento físico de respaldo), igual que "Documento respaldo" proviene de
> `documentosRespaldo[].tipoNombre`. Ambas columnas salen del MISMO array.

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
"Generando…" mientras dura el fetch y el armado (Anti-F-07). NO DEBE existir opción de "página actual"
ni export de detalle individual.

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
