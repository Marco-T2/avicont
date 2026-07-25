# Delta for conciliacion-bancaria

## ADDED Requirements

### REQ-CB-23: Continuidad de saldo entre importaciones consecutivas

El sistema DEBE verificar, para importaciones consecutivas de una misma
cuenta bancaria ordenadas por cobertura, que
`saldoFinal(n) ≟ saldoInicial(n+1)`. Una discrepancia DEBE registrarse como
advertencia visible; NO DEBE rechazar la importación.

**Por qué este chequeo es necesario y no redundante con REQ-CB-08:** el
checksum `DERIVADO` es **ciego a filas borradas de los EXTREMOS** del
archivo. Deriva el saldo inicial de la primera fila presente y lo compara
contra el saldo de la última fila presente; si alguien elimina filas del
comienzo o del final, el subconjunto restante sigue siendo un prefijo o
sufijo internamente coherente del saldo corrido del banco y la aritmética
cierra igual — devolviendo `VERIFICADO` sobre un archivo mutilado. Solo el
borrado del MEDIO produce descuadre. Afecta a los cuatro perfiles `DERIVADO`
(BancoSol, BMSC, Unión, Fortaleza); los tres `DECLARADO` (BCP, FIE,
Económico) son inmunes porque la cabecera declara el inicial y el final
verdaderos. **La continuidad entre importaciones es el único mecanismo que
detecta esta manipulación.**

Cuando alguno de los dos saldos comparados sea nulo, el sistema NO DEBE
reportar discontinuidad: sin dato no hay veredicto.

#### Scenario: Se borran las últimas filas de un extracto

- GIVEN una importación `DERIVADO` de julio a la que se le eliminaron las
  últimas filas antes de subirla, con `estadoVerificacion = VERIFICADO`
- WHEN se importa el extracto de agosto de la misma cuenta
- THEN el sistema detecta que `saldoFinal(julio) ≠ saldoInicial(agosto)`
- AND registra la discontinuidad como advertencia
- AND la importación de agosto se completa igual

#### Scenario: Importaciones consecutivas que empalman

- GIVEN dos importaciones consecutivas cuyo saldo final e inicial coinciden
- WHEN se verifica la continuidad
- THEN no se reporta discontinuidad

#### Scenario: Saldo nulo — sin veredicto

- GIVEN una importación cuyo `saldoFinal` quedó nulo
- WHEN se verifica la continuidad contra la siguiente
- THEN NO se reporta discontinuidad

## MODIFIED Requirements

### REQ-CB-08: Checksum por perfil (3 estrategias)

(Previously: el checksum solo devolvía `estadoVerificacion` y `diferencia`;
los saldos inicial y final se persistían únicamente en la rama `DECLARADO`,
quedando nulos en los cuatro perfiles `DERIVADO`.)

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

**El checksum `DERIVADO` DEBE anclar el saldo en el orden CRONOLÓGICO de los
movimientos, NUNCA en el orden canónico de deduplicación.** Son dos órdenes
con propósitos distintos y no son intercambiables: el canónico ordena por
atributos intrínsecos (`fecha → monto → tipo → …`) e ignora la hora a
propósito, porque es lo que hace que un mismo movimiento produzca el mismo
hash venga el archivo en ASC o en DESC. Pero eso significa que su primer
elemento es el de MENOR MONTO del día más antiguo, no el que ocurrió primero
— y el saldo corrido de ese movimiento no sirve como ancla.

El orden cronológico se deriva del **orden físico de las filas**: los bancos
emiten el extracto ordenado por tiempo real, incluso dentro de un mismo día y
aunque el formato no publique la hora. Solo varía la dirección, que se detecta
comparando fechas. Si la secuencia física NO es monótona por fecha, el sistema
NO DEBE adivinar el ancla: el checksum queda `SIN_VERIFICAR`. Un "no pude
verificar" honesto es preferible a un descuadre inventado — la señal de
descuadre solo sirve si el contador puede confiar en ella.

**La verificación DEBE devolver, además del veredicto, el saldo inicial y el
saldo final que utilizó**, y la importación DEBE persistir ambos en las **dos**
estrategias. En `DECLARADO` provienen de la cabecera; en `DERIVADO` son el
saldo derivado de la fila cronológicamente primera y el saldo corrido de la
última. Son datos REALES observados del banco, no estimaciones: hoy la rama
`DERIVADO` los calcula y los descarta, dejándolos nulos en cuatro de siete
perfiles e impidiendo verificar la continuidad entre importaciones
(REQ-CB-23) y fijar el punto de arranque del informe de conciliación.

Cuando la estrategia sea `IMPOSIBLE`, cuando la secuencia no sea monótona o
cuando el dato no exista en el archivo, ambos saldos DEBEN quedar **nulos**.
El sistema NUNCA DEBE inventar un saldo que no observó.

#### Scenario: Día más antiguo con varios movimientos — el ancla es el cronológicamente primero

- GIVEN un extracto `DERIVADO` cuyo día más antiguo trae tres movimientos, y
  el de menor monto NO es el que ocurrió primero
- WHEN se verifica el checksum
- THEN el saldo inicial se deriva del movimiento que ocurrió PRIMERO según el
  orden físico del archivo
- AND el resultado es `VERIFICADO`, no un descuadre por la diferencia entre
  los montos del día

#### Scenario: El mismo período exportado en ASC y en DESC da el mismo veredicto

- GIVEN dos exports del mismo banco que cubren días en común, uno en orden
  ascendente y otro descendente
- WHEN se verifica el checksum de cada uno
- THEN ambos dan el mismo `estadoVerificacion`

#### Scenario: Archivo no ordenado por fecha — SIN_VERIFICAR, nunca un descuadre inventado

- GIVEN un extracto cuyas filas no vienen ordenadas por fecha en ninguna
  dirección
- WHEN se verifica el checksum con estrategia `DERIVADO`
- THEN el resultado es `SIN_VERIFICAR`
- AND el sistema NO reporta `DESCUADRE`
- AND `saldoInicial` y `saldoFinal` quedan nulos

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
- AND `saldoInicial` y `saldoFinal` quedan persistidos

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

#### Scenario: Perfil derivado — ambos saldos quedan persistidos

- GIVEN un perfil con estrategia `DERIVADO` (ej. BMSC) con secuencia monótona
- WHEN se importa el archivo
- THEN `saldoInicial` persiste el valor derivado de la fila cronológicamente
  primera
- AND `saldoFinal` persiste el saldo corrido de la última fila
- AND ninguno de los dos queda nulo

#### Scenario: Perfil sin columna de saldo — sin verificar, visible

- GIVEN un perfil con estrategia `IMPOSIBLE` (ningún perfil de v1 cae acá;
  ejemplo de un futuro perfil ancho-fijo sin columna de saldo)
- WHEN se importa el archivo
- THEN `estadoVerificacion = SIN_VERIFICAR`
- AND la pantalla de importaciones muestra ese estado explícitamente (nunca
  se omite ni se muestra como si hubiera verificado)
- AND `saldoInicial` y `saldoFinal` quedan nulos

### REQ-CB-09: Detección de huecos de cobertura

(Previously: capacidad de dominio DIFERIDA, con prohibición explícita de
cablearla a ningún endpoint o pantalla en v1.)

A partir de una lista de rangos `(fechaDesde, fechaHasta)` — el mismo dato
que expone cada `ImportacionExtracto` — el sistema DEBE proveer una función
de dominio pura (`detectarHuecos`) que identifique los tramos de calendario
NO cubiertos por ningún rango de la lista.

**Esta capacidad DEBE exponerse.** La versión anterior del requisito la
dejaba deliberadamente diferida "para un slice posterior (drawer de
historial, alertas de importación incompleta)"; este change **es** ese slice.
Los huecos de cobertura de una cuenta bancaria DEBEN quedar disponibles para
el informe de conciliación, que los usa para abstenerse de afirmar que la
cuenta está conciliada cuando el calendario tiene tramos sin extracto
(REQ-ICB-05).

Un hueco de cobertura NO DEBE rechazar ninguna importación: advierte, no
bloquea.

#### Scenario: Dos rangos dejan un hueco entre ellos

- GIVEN la función recibe los rangos `[01/06, 10/06]` y `[20/06, 30/06]`
- WHEN se invoca `detectarHuecos(rangos)`
- THEN devuelve el tramo `[11/06, 19/06]` como no cubierto

#### Scenario: Rangos contiguos o solapados — sin huecos

- GIVEN la función recibe rangos contiguos o solapados sin días sueltos
  entre ellos
- WHEN se invoca `detectarHuecos(rangos)`
- THEN devuelve una lista vacía de tramos no cubiertos

#### Scenario: Los huecos de una cuenta quedan consultables

- GIVEN una cuenta bancaria con importaciones que dejan un tramo sin cubrir
- WHEN el informe de conciliación evalúa la cobertura hasta su fecha de corte
- THEN el tramo faltante está disponible y se nombra en la respuesta
- AND ninguna importación fue rechazada por ese hueco
