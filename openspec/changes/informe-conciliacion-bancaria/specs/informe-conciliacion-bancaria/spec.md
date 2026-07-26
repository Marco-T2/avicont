# Informe de Conciliación Bancaria — Specification

## Purpose

Producir la conciliación que el módulo nombra y no entrega: la identidad
`saldo según extracto ± partidas conciliatorias = saldo según libros` a una
**fecha de corte**, con el puente detallado. Instrumento de control **no
bloqueante**: calcula e informa, no gatea el cierre ni toca los EEFF.

Alcance v1: cuentas en **BOB** únicamente.

## Requirements

### REQ-ICB-01: La identidad se plantea sobre saldos ACUMULADOS a la fecha de corte

El informe DEBE comparar saldos **acumulados hasta la fecha de corte**
(inclusive), NUNCA flujos del período. Un asiento tardío —el cargo del 31/07
registrado en agosto— se autorresuelve en el corte siguiente porque ambos
acumulados terminan incluyéndolo. Por flujos reaparecería invertido en el
período siguiente y la identidad no cerraría nunca.

El informe DEBE rechazar con `CONCILIACION_MONEDA_NO_SOPORTADA` una cuenta
bancaria cuya moneda no sea BOB: el lado libros y el lado banco no son
comparables sin un tipo de cambio único, que no existe.

#### Scenario: Cargo bancario registrado en un período posterior

- GIVEN un cargo del banco con fecha 31/07 cuyo comprobante se asienta el 15/08
- WHEN se pide el informe al corte 31/07 y luego al corte 31/08
- THEN al 31/07 el cargo figura como partida conciliatoria
- AND al 31/08 la identidad cierra sin esa partida

#### Scenario: Cuenta en moneda distinta de BOB

- GIVEN una cuenta bancaria en USD
- WHEN se pide el informe
- THEN falla con `CONCILIACION_MONEDA_NO_SOPORTADA`

### REQ-ICB-02: Composición del puente — las cuatro partidas

El puente DEBE componerse de estas partidas, todas acotadas a `fecha ≤ corte`:

| Partida | Signo | Significado |
|---|---|---|
| Movimientos `PENDIENTE` | − | el banco lo registró, los libros no |
| Movimientos `IGNORADO` | − | el banco lo registró y los libros **nunca** lo harán |
| Líneas `EN_TRANSITO` | + | los libros lo registraron, el banco no |
| Diferencia de arranque | ± | residuo declarado al fijar el punto de partida |

Los movimientos `IGNORADO` DEBEN figurar como partida **con nombre propio**.
Son movimientos reales, están dentro del saldo que el banco publica y no
tienen contrapartida contable. Omitirlos rompe la identidad sobre datos
correctos; absorberlos en silencio la convierte en una afirmación falsa.

#### Scenario: Cuenta con partidas de los tres tipos

- GIVEN movimientos `PENDIENTE`, movimientos `IGNORADO` y líneas `EN_TRANSITO` ≤ corte
- WHEN se pide el informe
- THEN cada grupo aparece como partida separada con su importe
- AND la identidad cierra con residuo cero

#### Scenario: Movimiento ignorado dentro del rango

- GIVEN un movimiento marcado `IGNORADO` con fecha ≤ corte
- WHEN se pide el informe
- THEN figura como partida propia, identificada como ignorado deliberadamente
- AND NO se omite ni se suma dentro de otra partida

### REQ-ICB-03: Origen de cada lado de la identidad

El **saldo según libros** DEBE obtenerse agregando las líneas contables de la
cuenta del plan vinculada, en **moneda original**, hasta la fecha de corte:
solo comprobantes `CONTABILIZADO`/`BLOQUEADO` y `anulado = false`. Un
`BORRADOR` no movió plata y un anulado dejó de moverla.

El **saldo según extracto** DEBE ser el saldo del último movimiento con
`fecha ≤ corte` de esa cuenta bancaria. Si ningún movimiento en el rango
publica saldo, DEBE quedar nulo y el informe DEBE abstenerse (REQ-ICB-05).

#### Scenario: Comprobante en BORRADOR no cuenta

- GIVEN una línea sobre la cuenta banco en un comprobante `BORRADOR`
- WHEN se calcula el saldo según libros
- THEN esa línea NO se incluye

#### Scenario: El banco no publica saldo en el rango

- GIVEN una cuenta cuyos movimientos ≤ corte tienen `saldo` nulo
- WHEN se pide el informe
- THEN el saldo según extracto es nulo y el informe se abstiene de concluir

### REQ-ICB-04: Punto de arranque conciliado — acto atribuido, append-only

Comparar acumulados exige que ambos lados partan del mismo punto. El lado
banco solo conoce lo importado; los libros arrancan en el origen de la
organización.

El sistema DEBE permitir declarar un **punto de arranque** por cuenta
bancaria: una fecha, el saldo del extracto a esa fecha, el saldo según libros
a esa fecha y la **diferencia residual aceptada**. La declaración DEBE ser
**append-only**, atribuida a un usuario y fechada. Una declaración posterior
NO DEBE borrar ni sobrescribir las anteriores.

El arranque DEBE fijarse por **comando explícito**. Consultar el informe NO
DEBE crear, modificar ni inferir un arranque: una lectura nunca escribe.

El informe DEBE aplicar la declaración más reciente con fecha ≤ corte, y su
diferencia residual DEBE exhibirse como partida nombrada, con su fecha y su
autor. NUNCA DEBE absorberse dentro de otra partida.

#### Scenario: Segunda declaración no pisa la primera

- GIVEN un arranque declarado al 30/06 con residuo 500
- WHEN se declara otro al 31/12 con residuo 0
- THEN ambas declaraciones persisten y son auditables
- AND el informe al corte 31/07 aplica la del 30/06

#### Scenario: Consultar el informe no crea arranque

- GIVEN una cuenta sin arranque declarado
- WHEN se consulta el informe
- THEN no se crea ninguna declaración
- AND el informe indica que no hay punto de arranque

### REQ-ICB-05: Abstención ante insumo no confiable

Si alguna importación que cubre el rango hasta el corte tiene
`estadoVerificacion = DESCUADRE`, o si existe un hueco de cobertura, o una
discontinuidad de saldo entre importaciones consecutivas, el informe DEBE
mostrar los números y los insumos, **nombrar el problema** y **NO afirmar**
que la cuenta está conciliada.

El sistema NO DEBE ocultar el informe ni rechazar la consulta: lo que se
retiene es la **conclusión**, no el dato. Mismo criterio que `SIN_VERIFICAR`:
un "no puedo afirmarlo" honesto vale más que una certificación inventada.

#### Scenario: Una importación del rango tiene descuadre

- GIVEN una importación con `estadoVerificacion = DESCUADRE` que cubre parte del rango
- WHEN se pide el informe
- THEN los importes y el puente se muestran igual
- AND el informe declara el descuadre y NO afirma "conciliado"

#### Scenario: Hueco de cobertura antes del corte

- GIVEN importaciones que dejan un tramo de calendario sin cubrir ≤ corte
- WHEN se pide el informe
- THEN el tramo faltante se nombra explícitamente
- AND el informe NO afirma "conciliado"

### REQ-ICB-06: Residuo no explicado — se muestra, jamás se absorbe

Si la identidad no cierra, el sistema DEBE exponer la diferencia sobrante
como **residuo no explicado**, con su importe. NUNCA DEBE ajustarla
automáticamente, distribuirla entre partidas ni ocultarla.

Un residuo distinto de cero significa que algo toca la cuenta banco fuera del
universo conocido por el módulo. Esa señal es el valor del instrumento.

#### Scenario: La identidad no cierra

- GIVEN partidas que no explican la diferencia completa entre ambos saldos
- WHEN se pide el informe
- THEN el sobrante se expone como residuo no explicado con su importe
- AND ninguna partida se altera para forzar el cuadre

### REQ-ICB-07: Diferencia permanente de período cerrado

Cuando un movimiento del banco pertenece a un período fiscal ya `CERRADO` y
su comprobante se asienta en un período posterior, la diferencia de ese corte
**nunca llegará a cero**. El informe DEBE representarla sin degradarse: no
DEBE asumir convergencia a cero ni tratar el caso como error.

#### Scenario: Cargo de un período cerrado asentado en el siguiente

- GIVEN julio `CERRADO` y un cargo del 31/07 asentado el 15/08
- WHEN se pide el informe al corte 31/07
- THEN la partida se muestra como diferencia que no se resolverá en ese corte
- AND el informe se emite normalmente

### REQ-ICB-08: Trazabilidad de los insumos

El informe DEBE exponer con qué se calculó: fecha de corte, saldo del
extracto utilizado, estado de verificación de las importaciones que cubren el
rango, huecos detectados y arranque aplicado. Permite reproducir el resultado
y habilita congelarlo en un slice posterior sin rediseñar el contrato.

#### Scenario: Respuesta con insumos

- GIVEN un informe emitido a una fecha de corte
- WHEN se inspecciona la respuesta
- THEN incluye corte, saldo de extracto usado, estados de verificación, huecos y arranque aplicado

### REQ-ICB-09: Permiso y aislamiento multi-tenant

Consultar el informe DEBE exigir `contabilidad.conciliacion.read`. Declarar un
punto de arranque DEBE exigir `contabilidad.conciliacion.conciliar` — es un
acto de responsabilidad contable, no una lectura, y comparte permiso con
confirmar y deshacer un match. NO se introduce permiso nuevo: el pack ya
declara `read`, `create`, `update`, `delete`, `importar` y `conciliar`.

Un usuario con `read` pero sin `conciliar` DEBE poder consultar el informe y
NO DEBE poder declarar un arranque: quien solo mira no fija el saldo de
partida sobre el que se apoyan todos los informes futuros.

Una cuenta bancaria de otra organización DEBE responder 404, nunca 403: la
existencia de recursos ajenos no se revela.

#### Scenario: Cuenta bancaria de otro tenant

- GIVEN una cuenta bancaria de otra organización
- WHEN se pide su informe
- THEN responde 404

#### Scenario: Usuario de solo lectura intenta declarar un arranque

- GIVEN un usuario con `contabilidad.conciliacion.read` y sin `conciliar`
- WHEN intenta declarar un punto de arranque
- THEN la operación es rechazada por permisos
- AND ese mismo usuario SÍ puede consultar el informe
