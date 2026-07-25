# Delta for conciliacion-bancaria

> Change: `verificador-movimientos-bancarios`. La importación pasa a
> persistir `ordenFisico` y el orden de lectura canónico del módulo se
> amplía. Ningún requisito existente cambia de comportamiento — en
> particular el hash de dedup (REQ-CB-07) queda EXACTAMENTE igual — por eso
> es ADDED y no MODIFIED.

## ADDED Requirements

### REQ-CB-21: La importación persiste `ordenFisico` derivado del orden cronológico

Cada `MovimientoBancario` nuevo DEBE persistirse con `ordenFisico` = índice
(0-based) del movimiento dentro del orden CRONOLÓGICO ascendente del archivo
— el mismo orden que ancla el checksum `DERIVADO` (REQ-CB-08) — NUNCA el
índice crudo de la fila física: en un export DESC la fila 0 es la más NUEVA
y ordenar por ella mostraría el día al revés. Cuando la secuencia física no
es monótona por fecha, `ordenFisico` DEBE quedar `null` — no se adivina
(misma familia que `SIN_VERIFICAR` y que `saldo` nullable).

El cálculo del hash de dedup (REQ-CB-07) NO DEBE cambiar: misma entrada,
misma firma, mismos hashes. Si cambiara, una re-importación duplicaría todo
lo ya cargado. Los movimientos importados antes de este change quedan con
`ordenFisico=null` — el orden físico ya se descartó y no se reconstruye
(sin backfill).

El **orden de presentación** de los listados que consumen `ordenFisico` DEBE
ser `fecha ASC, hora ASC NULLS LAST, ordenFisico ASC NULLS LAST, id ASC`. La
`hora` manda sobre `ordenFisico`; para filas con `ordenFisico=null` el orden
degrada a `fecha, hora, id`. `ordenFisico` solo es comparable dentro de una
misma importación — con el orden cerrado, el caso ambiguo queda acotado a un
perfil sin hora (Unión), misma cuenta, mismo día y dos importaciones
aportando a ese día.

> **Terminología — no confundir con el orden CANÓNICO.** En este módulo
> "orden canónico" es un término cargado: designa el orden de DEDUP
> (`ordenarCanonico`, REQ-CB-07), que ordena por atributos intrínsecos y
> **descarta la posición física a propósito** para que el hash sea idéntico
> venga el archivo ASC o DESC. El orden de PRESENTACIÓN definido acá es otra
> cosa y no lo toca. Confundir ambos es exactamente el bug que produjo el
> descuadre fantasma de Fortaleza (PR #250); la separación es deliberada.

#### Scenario: Export DESC — la fila física 0 recibe el `ordenFisico` máximo

- GIVEN un extracto cuyas filas vienen en orden descendente (fila física 0 =
  movimiento más nuevo)
- WHEN se importa el archivo
- THEN el movimiento cronológicamente PRIMERO recibe `ordenFisico=0` y la
  fila física 0 recibe el `ordenFisico` máximo

#### Scenario: Secuencia no monótona — `ordenFisico` null, nunca adivinado

- GIVEN un archivo cuyas filas no están ordenadas por fecha en ninguna
  dirección
- WHEN se importa
- THEN todos los movimientos de esa importación se persisten con
  `ordenFisico=null`

#### Scenario: El hash de dedup no cambia — reimportar no duplica

- GIVEN un extracto importado ANTES de este change, con N movimientos
- WHEN se reimporta el mismo archivo después del change
- THEN el resultado reporta "0 nuevos, N ya existían"
- AND los movimientos preexistentes conservan `ordenFisico=null` sin
  modificarse

#### Scenario: Movimientos de Unión de un mismo día salen en el orden del extracto

- GIVEN un perfil que no publica `hora` (Unión) con varios movimientos el
  mismo día, importados de un archivo con secuencia monótona
- WHEN se listan esos movimientos con el orden de presentación
- THEN aparecen en el orden cronológico del extracto, desempatados por
  `ordenFisico`

### REQ-CB-22: El workspace adopta el mismo orden de presentación

El panel de movimientos del workspace (REQ-CB-17) DEBE usar el MISMO orden de
presentación que define REQ-CB-21: `fecha ASC, hora ASC NULLS LAST,
ordenFisico ASC NULLS LAST, id ASC`.

Motivo: hoy ese panel ordena por `fecha ASC, ordinalDia ASC, id ASC`, y
`ordinalDia` **no es una posición** — es el índice de ocurrencia dentro del
grupo de tupla idéntica (REQ-CB-07), que vale `0` para prácticamente todo
movimiento. El desempate intra-día efectivo es hoy `id ASC`, es decir orden
de UUID: **arbitrario**. Es la misma arbitrariedad que `ordenFisico` viene a
corregir, y dos pantallas que ordenan distinto los mismos movimientos del
mismo día erosionan la confianza en una herramienta cuyo propósito es
verificar.

Cambia comportamiento OBSERVABLE del workspace (ningún requisito previo
fijaba ese orden — vivía solo en el adapter), así que sus tests de orden
deben actualizarse.

#### Scenario: Mismos movimientos, mismo orden en las dos pantallas

- GIVEN una cuenta bancaria con varios movimientos el mismo día
- WHEN se listan en el workspace y en el listado cross-cuenta filtrado por
  esa misma cuenta y rango
- THEN ambos devuelven los movimientos en el MISMO orden relativo

#### Scenario: Perfil con hora — el desempate deja de ser el UUID

- GIVEN tres movimientos de una misma cuenta el mismo día con horas
  `09:15`, `14:02` y `21:40`, cuyos `id` no siguen ese orden
- WHEN se consulta el workspace
- THEN salen ordenados `09:15`, `14:02`, `21:40`
