# Exploration: informe-conciliacion-bancaria (v2)

## Current State

El módulo se llama conciliación bancaria y **no produce una conciliación**. Hoy existe:

- **Workspace** (`GET /api/conciliacion`): acotado a UNA cuenta bancaria y un RANGO `[desde, hasta]`. Devuelve movimientos, líneas contables, sugerencias y un resumen.
- **Verificador** (`GET /api/movimientos-bancarios`): mayor unificado cross-cuenta, paginado.
- **Importador de extractos**: 7 perfiles de banco, checksum informativo, dedup estructural por `hashDedup`.

`ResumenConciliacionDto` son **4 contadores sin importes**: `movimientosPendientes`, `movimientosConciliados`, `movimientosIgnorados`, `lineasEnTransito`. El pack cuenta partidas pero nunca las suma, así que **nunca se autovalida**.

Búsqueda de `saldoContable` / `según libros` en `backend/src`, `frontend/src` y `openspec`: **cero resultados**. El vínculo `CuentaBancaria.cuentaId` (1:1 con el plan, `@@unique([organizationId, cuentaId])`) se usa solo para filtrar líneas candidatas y validar la cuenta — nunca para comparar totales.

### Lo que YA está resuelto y es reutilizable

El workspace deriva en cada lectura, sin escribir nunca (`conciliacion.service.ts:112-121`, design §2.3):

| Conjunto | Estado derivado | Significado en el puente |
|---|---|---|
| Movimientos bancarios | `PENDIENTE` | el banco lo registró, los libros no |
| Movimientos bancarios | `CONCILIADO` | ambos lados, con vínculo VÁLIDO |
| Movimientos bancarios | `IGNORADO` | el banco lo registró y **nunca** irá a libros |
| Líneas contables | `EN_TRANSITO` | los libros lo registraron, el banco no |
| Líneas contables | `CONCILIADO` | reclamada por un vínculo válido |

`verificarAnclas` re-verifica los 5 campos del snapshot en CADA lectura: un match roto (`LINEA_INEXISTENTE`, `COMPROBANTE_ANULADO`, `MONTO_CAMBIADO`, …) devuelve el movimiento a `PENDIENTE` y su línea al pool en la misma respuesta.

**Esto responde la pregunta B casi entera**: las partidas conciliatorias ya se derivan solas. No hay que inventar un modelo de partidas — hay que sumarlas.

## Affected Areas

- `backend/src/conciliacion-bancaria/conciliacion.service.ts` — el workspace es RANGO; el informe necesita ACUMULADO a corte. Query distinta, no reutilizable tal cual.
- `backend/src/conciliacion-bancaria/domain/checksum-extracto.ts` — `verificarChecksum` calcula el saldo inicial derivado (`:90-93`) y lo DESCARTA.
- `backend/src/conciliacion-bancaria/extracto-importador.service.ts:214-215` — persiste `saldoInicial` Y `saldoFinal` solo en la rama `DECLARADO`.
- `backend/src/conciliacion-bancaria/domain/cobertura-extracto.ts` — `detectarHuecos`, sin consumidores **por decisión documentada**.
- `backend/src/comprobantes/ports/lineas-cuenta-reader.port.ts` — candidato principal para el saldo según libros (ver Approaches).
- `backend/src/reportes/ports/eeff-saldos-reader.port.ts:116` — candidato alternativo.
- `backend/prisma/schema.prisma:1418-1446` — `ImportacionExtracto`; posible tabla nueva para el punto de arranque.
- `frontend/src/features/conciliacion/` — panel o pantalla nueva.
- `frontend/src/components/nav-items.ts:220-259` — grupo `bancos`, 3 ítems hoy; guard anti-drift bidireccional en `nav-list.test.tsx`.

## Hallazgos que corrigen supuestos de entrada

### 1. `detectarHuecos` NO es un olvido — es un diferimiento documentado

`cobertura-extracto.ts:1-7` dice literalmente:

> *"Capacidad de DOMINIO, no una feature expuesta: v1 no tiene endpoint ni pantalla que la sirva (proposal.md la deja fuera de alcance). Queda lista para un slice posterior (drawer de historial, alertas de importación incompleta). **NO cablear a ningún controller en v1**."*

El autor la construyó, la probó y la dejó explícitamente fuera. **Este change ES ese slice posterior.** Cablearla ahora es exactamente lo previsto, no rescatar código muerto.

### 2. `saldoFinal` tiene el MISMO bug que `saldoInicial` — el fix es simétrico

`extracto-importador.service.ts:214-215` persiste ambos solo desde la rama `DECLARADO`. Para los 4 bancos `DERIVADO` (BancoSol, BMSC, Unión, Fortaleza) **los dos quedan NULL**, aunque el checksum ya tiene ambos a mano (`checksum-extracto.ts:90` el inicial, `:95` compara contra `ultimo.saldo` que es el final).

Esto importa: la continuidad entre extractos necesita `saldoFinal(julio) ≟ saldoInicial(agosto)`. **Con solo arreglar `saldoInicial` el chequeo seguiría sin poder construirse.**

### 3. Trampa: los movimientos `IGNORADO` rompen la ecuación si se los omite

Un `IGNORADO` es un movimiento REAL del banco: está dentro del saldo que el banco publica. Pero no tiene ni tendrá contrapartida en libros.

Si el puente lo excluye, la ecuación **no cierra** y el informe parece roto sobre datos correctos. Si lo absorbe en silencio, **miente**. Tiene que aparecer como partida conciliatoria con nombre propio ("ignorado deliberadamente"). Hoy `movimientosIgnorados` es solo un contador.

### 4. Tensión de diseño: persistir el arranque contradice "una lectura nunca escribe"

El workspace tiene como principio explícito que **una lectura NUNCA escribe** (design §2.3): no auto-cura estados, no borra matches rotos. Fijar el punto de arranque conciliado ES una escritura.

⇒ El arranque **no puede ser un efecto secundario de abrir el informe**. Tiene que ser un comando explícito del usuario (`POST`), fechado y atribuido. Eso además es lo correcto desde lo contable: alguien se hace responsable del saldo de partida.

## Approaches — de dónde sale el "saldo según libros"

Ésta es la decisión técnica central y **el supuesto de entrada era subóptimo**.

### 1. `EeffSaldosReaderPort.obtenerSaldosHasta` (el supuesto de entrada)

Port de `reportes`, ya consumido por Balance General y por `cierre-ejercicio` vía adapter.

- **Pros**: existe sin tocar nada; agrega en SQL; precedente de cruce de frontera ya probado (`eeff-cierre-saldos.adapter.ts`).
- **Cons**:
  - **Solo BOB** (`totalDebitoBob`/`totalCreditoBob`) ⇒ cierra la puerta a USD para siempre.
  - Devuelve **TODAS las cuentas del tenant** (GROUP BY sobre el plan entero) cuando se necesita UNA.
  - Suma una dependencia cross-módulo NUEVA (conciliación → reportes): port propio + adapter + wiring.
- **Effort**: Medium

### 2. Método nuevo en `LineasCuentaReaderPort` (recomendado)

Port de `comprobantes`, **ya consumido por conciliación** vía el módulo leaf `lineas-cuenta-reader.module.ts`.

`LineaCuentaRow` trae `debito`/`credito` en **MONEDA ORIGINAL** además de `debitoBob`/`creditoBob`. El comentario en `:32` es explícito: *"Moneda original — `LibroMayorReaderPort` solo trae los equivalentes en BOB."*

Filtro ya idéntico al que necesita el informe: `CONTABILIZADO`/`BLOQUEADO` y `anulado = false`.

- **Pros**:
  - **Cero wiring nuevo** — la dependencia ya existe y está probada en este mismo módulo.
  - **Moneda original** ⇒ USD entra después sin rediseñar nada.
  - Acotado a UNA `cuentaId` ⇒ query barata y con índice.
  - Semántica de filtros ya validada para exactamente este uso.
- **Cons**: agrega un tercer método a un port cuyo doc dice *"Superficie MÍNIMA: dos métodos"* — hay que justificarlo en el design.
- **Effort**: Low-Medium

### 3. Reutilizar `listarPorCuentaEnRango` sumando en memoria

- **Pros**: cero cambios de contrato.
- **Cons**: traer TODAS las líneas desde el inicio de los tiempos para sumarlas en Node. No escala y desperdicia lo que Postgres hace mejor.
- **Effort**: Low ahora, deuda garantizada después.

## Recommendation

**Approach 2** — método agregado nuevo en `LineasCuentaReaderPort`.

Gana por tres razones independientes: (a) no inventa una dependencia cross-módulo que ya está resuelta por otro camino, (b) preserva la moneda original y por lo tanto **no hipoteca USD** aunque USD esté fuera de alcance hoy, y (c) es la query más barata de las tres.

El costo —romper el "superficie mínima: dos métodos"— es honesto y se documenta: ese comentario describía las necesidades del workspace de v1, y este change amplía deliberadamente esas necesidades.

### Forma del informe

```
Saldo según extracto (a fecha de corte)              X
  − movimientos PENDIENTE ≤ corte      (banco sí, libros no)
  − movimientos IGNORADO  ≤ corte      (banco sí, libros nunca)
  + líneas EN_TRANSITO    ≤ corte      (libros sí, banco no)
  ± diferencia de arranque declarada   (si existe, VISIBLE)
                                                  ─────
Saldo según libros (a fecha de corte)                Y
```

Si la identidad no cierra: hay algo tocando la cuenta Banco fuera del universo de matching del pack. **Ese residuo es el valor del instrumento** y debe mostrarse, nunca absorberse — mismo criterio que `SIN_VERIFICAR`.

### Secuenciación sugerida (3 PRs, §9.1 prohíbe scope doble)

1. **`fix(conciliacion)`** — checksum devuelve `saldoInicial`/`saldoFinal` derivados; el importador los persiste en ambas ramas. Habilita todo lo demás.
2. **`feat(conciliacion)`** — integridad: cablear `detectarHuecos` + continuidad de saldo entre importaciones.
3. **`feat(conciliacion)`** — el informe: port agregado, punto de arranque, endpoint, vista.

## Risks

- **El arranque puede no cuadrar y no hay forma de evitarlo.** El saldo del extracto es el lado banco; `obtenerSaldosHasta(fechaDesde−1)` es el lado libros. Si difieren, conciliar hacia atrás es regresión infinita. Única salida honesta: aceptar la diferencia UNA vez, declarada, fechada y atribuida, y **arrastrarla visible para siempre**. Absorberla contamina todas las conciliaciones futuras haciéndolas parecer limpias.
- **Los 4 bancos `DERIVADO` son ciegos a filas borradas de los EXTREMOS del archivo.** El subconjunto restante sigue siendo un prefijo/sufijo coherente del saldo corrido ⇒ `VERIFICADO` sobre un archivo mutilado. Solo el borrado del MEDIO se detecta. **Únicamente la continuidad entre extractos lo caza** — lo que convierte el PR 2 en prerrequisito de credibilidad del PR 3, no en un extra.
- **Períodos cerrados producen diferencias permanentes.** `PeriodoFiscal.status` ABIERTO/CERRADO con reaperturas auditadas. El informe de un período cerrado puede no llegar nunca a cero y eso es correcto — el diseño no puede asumir convergencia.
- **`ordenFisico` es `null`** para todo lo importado antes del change anterior y para secuencias no monótonas. No afecta la ecuación (que suma, no ordena) pero sí el detalle mostrado.
- **Riesgo de alcance**: integridad de extractos + informe en un solo change. Mitigado por los 3 PRs; el 1 y el 2 tienen valor propio aunque el 3 se demore.
- **Guard de CI**: si el informe agrega un `NAV_ITEM`, `nav-list.test.tsx` exige `pack: 'contabilidad.conciliacion'` y pertenencia al grupo `bancos` (guard bidireccional). Un ítem nuevo sin pack rompe el build.

## Open Questions para la propuesta

1. **¿El informe es un panel dentro de `/conciliacion` o una pantalla propia?** El grupo `bancos` tiene 3 ítems; un 4º es viable pero el sidebar se acaba de ordenar. Panel = cero fricción de navegación y contexto compartido con el workspace; pantalla propia = fecha de corte independiente del rango del workspace, que es conceptualmente más limpio (corte ≠ rango).
2. **¿El punto de arranque es por cuenta bancaria (1:1) o histórico (N reaperturas)?** Un histórico permite auditar quién declaró qué y cuándo; 1:1 es más simple. Dado `PeriodoFiscalReopening` como precedente en el repo, el histórico es coherente con la casa.
3. **¿El informe se congela?** Hoy sería siempre recalculado. Congelarlo lo convierte en evidencia (papel de trabajo real) pero agrega una entidad y un ciclo de vida. Se puede diferir sin bloquear.

## Ready for Proposal

**Sí.** El alcance está acotado, los dos anclas existen, la fuente del lado libros quedó decidida con evidencia y los riesgos están nombrados.

Decir a Marco: la recomendación técnica **cambió** respecto de lo que habíamos supuesto — el saldo según libros conviene sacarlo de `LineasCuentaReaderPort` (que conciliación ya consume y que trae moneda original) y no de `EeffSaldosReaderPort`. Además aparecieron tres cosas nuevas: `saldoFinal` tiene el mismo bug que `saldoInicial` (el fix es simétrico), los movimientos `IGNORADO` tienen que entrar al puente o la ecuación no cierra, y `detectarHuecos` no era un olvido sino un diferimiento documentado que este change viene a consumir.
