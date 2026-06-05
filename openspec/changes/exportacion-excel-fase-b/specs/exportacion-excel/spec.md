# Exportación a Excel — Especificación (DELTA Fase B)

<!--
Última edición: 2026-06-05
Última revisión contra core: 2026-06-05
Owner: frontend-lead
-->

> **Naturaleza de este documento:** delta-spec de la **Fase B**. ADICIONA requisitos
> para Libro Mayor, Balance General y Estado de Resultados a la capability
> `exportacion-excel`. NO contradice ni reemplaza los requisitos de la Fase A
> (builder genérico, cabecera fiscal, formateo es-BO, descarga, Libro Diario piloto),
> que siguen vigentes tal como están en `openspec/specs/exportacion-excel/spec.md`.
> Al archivar, estos requisitos se fusionan en esa spec viva.

---

## Requisitos ADICIONADOS

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

## Restricciones ADICIONADAS (sobre las de Fase A)

- El helper de aplanado jerárquico vive en `frontend/src/lib/export-excel/` (infra cross-feature) y lo consumen Balance y Estado de Resultados sin duplicación.
- §4.5 (Money): subtotales de sección/subsección, saldo corriente del Mayor, total general, cuadre del Balance y resultado del ejercicio de Resultados son **valores del backend**; el cliente NUNCA los recalcula. La conversión `string → Number` ocurre solo en el boundary de celda.
- §4.6 (FechaContable): las fechas del Libro Mayor se formatean con `formatearFechaCelda` (split de string, sin `Date`/UTC) y se escriben como texto.
- §4.7 (anulados): los movimientos anulados del Libro Mayor se marcan visualmente; Balance y Resultados consumen la `data` ya filtrada por el `incluirAnulados` del fetch (no re-filtran en el export).
- §1 (idioma): textos de UI, marcas ("Anulado", "Contraria") y nombre de archivo en español.
- No se agrega ninguna dependencia nueva: `write-excel-file` ya está instalada (Fase A).
- Fuera de scope (de esta fase): Comprobantes (Fase C); export a PDF; estilos ricos (logo, merge de celdas, freeze panes, temas).
