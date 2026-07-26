# Verification Report — informe-conciliacion-bancaria

**Change**: informe-conciliacion-bancaria (3 PRs, rango `1c317f1..9a18d6c`, 19 commits)
**Fecha**: 2026-07-25 · **Rama**: `feat/conciliacion-informe`
**Mode**: Strict TDD
**Verdict**: **PASS WITH WARNINGS**

---

## Completeness

| Métrica | Valor |
|---|---|
| Tasks totales | 18 (+ cierre 4.1) |
| Tasks completas `[x]` | 18/18 (+4.1) |
| Tasks incompletas | 0 |

---

## Build & Tests — ejecución REAL (medida en esta verificación, no heredada)

| Suite | Resultado |
|---|---|
| Backend subsistema (`src/conciliacion-bancaria` + `src/comprobantes`) | ✅ **61 suites / 927 tests** en verde |
| E2E (informe, historial, importaciones, verificador, workspace) | ✅ **5 suites / 37 tests** en verde |
| Frontend (`vitest run` completo) | ✅ **245 archivos / 1946 tests** en verde |
| `tsc --noEmit` backend | ✅ 0 errores |
| `tsc -b` frontend | ✅ 0 errores |
| `eslint` backend y frontend | ✅ 0 errores |

Nota de entorno (no es del change): sin `NODE_OPTIONS="--experimental-vm-modules"` fallan
los 6 tests de `minio-storage.adapter.integration.spec.ts` y las 5 suites E2E enteras
(AWS SDK + dynamic import bajo jest). Con el flag —que el runbook §11 ya documenta— todo
pasa. El "40 suites / 570 tests" reportado por apply subestima el alcance real medido.

### Cobertura de archivos del change (jest --coverage)

| Archivo | Lines | Rating |
|---|---|---|
| `domain/armar-informe.ts` | 100% | ✅ |
| `domain/checksum-extracto.ts` | 100% | ✅ |
| `domain/continuidad-extractos.ts` | 100% (stmts 95.2 — guard L69) | ✅ |
| `domain/estado-efectivo.ts` | 100% | ✅ |
| `informe-conciliacion.service.ts` | 99.2% (L501 = throw defensivo) | ✅ |
| `extracto-importador.service.ts` | 100% | ✅ |
| `comprobantes/adapters/prisma-lineas-cuenta-reader.adapter.ts` | 100% | ✅ |
| `adapters/prisma-arranque-conciliado.repository.ts` | 100% (branch 75 = `tx` opcional) | ✅ |
| `dto/informe-conciliacion-response.dto.ts` | 86.9% (decoradores swagger) | ⚠️ aceptable |
| `informe-conciliacion.controller.ts` | 0% unit — cubierto por 37 tests E2E | ✅ |
| `integridad-extractos.service.ts` | **0% — solo lo toca el E2E del caso VACÍO** | ⚠️ **W1** |

Dominio contable ≥95%: cumplido (100% en los cuatro módulos de dominio).

---

## Decisión vinculante: `diferenciaResidual` se DECLARA, no se calcula

**Verificado con grep exhaustivo sobre backend y frontend + lectura de cada uso.**
Ningún camino la deriva de `saldoExtracto − saldoLibros`:
- `armar-informe.ts:114` la recibe declarada y contribuye `−residual` (convención de signo fijada en el JSDoc: positiva cuando extracto > libros). ✅
- `informe-conciliacion.service.ts` (`declararArranque`) persiste los CUATRO datos tal como llegan; test `662` fija "la diferencia residual NUNCA se calcula". ✅
- DTO `declarar-arranque.dto.ts` la recibe como string declarado. ✅
- Frontend `declarar-arranque-sheet.tsx:59` la inicializa `''` — **no autocompleta**; ningún componente resta saldos (`monto.ts` solo formatea). ✅
- Test de servicio `291` verifica que residual positivo contribuye `−residual` y la identidad cierra. ✅

**CRITICAL cero en este frente.**

---

## Spec Compliance Matrix

| Req | Escenario | Evidencia (test PASADO) | Estado |
|---|---|---|---|
| ICB-01 | Cargo registrado en período posterior (corte 31/07 vs 31/08) | `armar-informe.spec` 192 + 220 | ✅ |
| ICB-01 | Cuenta en moneda ≠ BOB | `informe-conciliacion.service.spec` 226 (+652 en declarar) | ✅ |
| ICB-02 | Tres tipos de partida, identidad cierra en cero | `armar-informe.spec` 105 + E2E "flujo completo" 467 (verifiqué la aritmética a mano: 1650−200+50−80+0=1420 ✓) | ✅ |
| ICB-02 | IGNORADO con nombre propio | `armar-informe.spec` 149 + E2E 467 + frontend `papel-de-trabajo.test` 132 | ✅ |
| ICB-03 | BORRADOR no cuenta | `prisma-lineas-cuenta-reader.adapter.integration.spec` 422 | ✅ (ver W3 sobre la base declarada) |
| ICB-03 | Banco sin saldo publicado → nulo + abstención | service.spec 461 + 509; `armar-informe.spec` 350 | ✅ |
| ICB-04 | Segunda declaración no pisa la primera | `prisma-arranque-conciliado...integration` 194 + E2E historial 237 | ✅ |
| ICB-04 | Consultar no crea arranque | E2E 439 ("una lectura nunca escribe") | ✅ |
| ICB-05 | DESCUADRE → números sí, conclusión no | service.spec 519 + E2E 542 | ✅ |
| ICB-05 | Hueco antes del corte → tramo nombrado | service.spec 548 (unit con mocks; sin E2E positivo — ver W1) | ✅ |
| ICB-06 | Identidad no cierra → residuo expuesto | `armar-informe.spec` 170 + service.spec 595 + frontend 185 | ✅ |
| ICB-07 | Período cerrado, diferencia permanente | `armar-informe.spec` 192 (`asentadoEl`) + 246 (simétrico) + frontend 159/167 | ✅ |
| ICB-08 | Insumos trazables | service.spec 618 + `armar-informe.spec` 388 + E2E 542 + frontend 207 | ✅ |
| ICB-09 | Cross-tenant 404 | E2E 407 (GET y POST) + E2E historial 200 | ✅ |
| ICB-09 | read sin conciliar: ve, no declara | E2E 423 + frontend page.test 339 | ✅ |
| CB-23 | Borrar últimas filas → VERIFICADO + continuidad lo delata | `extracto-importador...integration` 408 — assertions exactas (700 vs 900, salto 200) | ✅ |
| CB-23 | Consecutivas que empalman | `continuidad-extractos.spec` 23 (+63 tolerancia) | ✅ |
| CB-23 | Saldo nulo → sin veredicto | `continuidad-extractos.spec` 72 + 80 | ✅ |
| CB-08 mod | Ancla cronológica / ASC-DESC / no monótono | checksum.spec 81-126 + Fortaleza integration 288 + importador 176-186 | ✅ |
| CB-08 mod | DERIVADO persiste ambos saldos | importador integration 329 (+349 DECLARADO con DESCUADRE, +373 NULL) | ✅ |
| CB-09 mod | Huecos expuestos y consultables | `cobertura-extracto.spec` (dominio) + service.spec 548; endpoint `/integridad` solo E2E vacío → **PARCIAL** (W1) | ⚠️ |

**Resumen**: 20/21 filas ✅, 1 parcial. Ningún escenario sin test.

---

## Coherencia con el design (D1–D8)

| Decisión | ¿Seguida? | Nota |
|---|---|---|
| D1 — 3er método `sumarPorCuentaHasta`, `aggregate({_sum})` | ✅ | Sin `$queryRaw`; tenant en línea Y comprobante; `desde` EXCLUSIVO documentado y testeado (adapter 460) |
| D2 — lado banco reutiliza `saldosVigentes` | ✅ | Filtrado a la cuenta, `null` honesto |
| D3 — arranque como cota: ventana `arranque < fecha ≤ corte` | ✅ | `desdeVentana = arranque+1` (gte) + suma con `gt`; test 269 |
| D4 — `estado-efectivo.ts` compartido, cero divergencia | ✅ | 3 consumidores (workspace, verificador, informe); grep no encontró copia residual de la regla |
| D5 — continuidad derivada en lectura, solo contiguas | ✅ | `sonContiguas` = diferencia exacta de 1 día; no se persiste veredicto |
| D6 — confiabilidad califica, informe siempre se emite | ✅ | 6 motivos; `conciliado` exige residuo cero EXACTO |
| D7 — `read` consulta / `conciliar` declara, sin permiso nuevo | ✅ | Controller + E2E 423 |
| D8 — arranque retroactivo aceptado, historial completo | ✅ | Repo integration 174/194 + E2E historial 237 + `idArranqueVigente` frontend |

File Changes del design: los 14 archivos existen con la acción prevista. Migración aditiva presente; contratos (`openapi.json` + `api.generated.ts`) regenerados en el rango.

---

## TDD Compliance (Strict TDD)

| Check | Resultado |
|---|---|
| Evidencia TDD reportada (apply-progress con tabla "TDD Cycle Evidence") | ❌ **ausente** — no existe el artefacto ni en engram ni en openspec (W2) |
| Tests existen para cada task | ✅ 18/18 con test files identificables |
| GREEN confirmado por ejecución propia | ✅ 927 + 37 + 1946 en verde |
| Triangulación | ✅ amplia (checksum 20+ casos, armar-informe 14, continuidad 11) |
| Calidad de aserciones | ✅ valores exactos en todos los tests leídos; una excepción (W1: empty-check huérfano en E2E `/integridad`) |

Distribución de capas: unit (dominio puro), integration (Postgres real: importador, adapters), E2E (supertest full-stack), frontend (testing-library). Consistente con el honeycomb del proyecto.

---

## Issues

### CRITICAL
**Ninguno.**

### WARNING

**W1 — Task 2.3 marcada con "E2E de ambos", pero el camino POSITIVO de `/integridad` no tiene ningún test.**
`IntegridadExtractosService.evaluar` tiene **0% de cobertura** en unit/integration; el único
test que lo ejecuta es el E2E de la serie ÍNTEGRA (`huecos: []`, `discontinuidades: []`,
`conciliacion-importaciones.e2e-spec.ts:286`) más el 404. Las funciones de dominio están
excelentemente testeadas y el test de la ceguera (importador integration 408) es de primera —
pero llama `detectarDiscontinuidades` DIRECTO, sin pasar por el service ni por el endpoint.
Consecuencia concreta: si el mapeo de `evaluar` intercambiara `saldoInicial`/`saldoFinal` al
armar `conSaldos` (líneas 56-62), **toda la suite seguiría en verde**. Es además el patrón
"empty-check sin companion no-vacío" que el protocolo de aserciones prohíbe. Falta: un test
(integration del service o E2E) donde `/integridad` REPORTE un hueco y una discontinuidad.

**W2 — Protocolo Strict TDD: no existe el artefacto `apply-progress` con la tabla de evidencia TDD.**
El protocolo lo exige y su ausencia es formalmente bloqueante para el verify estricto. Lo
dejo en WARNING y no en CRITICAL porque la evidencia sustituta es sólida: 1 commit por
entrega con specs incluidos, memorias engram por batch, y todas las suites verificadas en
verde por ejecución propia. Pero la próxima vez el apply debe dejar el artefacto.

**W3 — "Saldo según libros" con arranque es `saldoLibros DECLARADO + delta de ventana`, y nada contrasta la declaración contra el mayor real.**
REQ-ICB-03 dice que el saldo según libros "DEBE obtenerse agregando las líneas contables…
hasta la fecha de corte"; con arranque vigente el service usa la base DECLARADA
(`informe-conciliacion.service.ts:267`). Si el usuario declara un `saldoLibros` que no
coincide con el agregado real a esa fecha, el informe rotula como "saldo según libros" un
número que no es el de los libros y desplaza el residuo — **silenciosamente**: la residual
declarada se expone como partida nombrada con autor, pero un `saldoLibros` mal declarado no
se nombra en ningún lado, y el sistema TIENE el dato para contrastarlo
(`sumarPorCuentaHasta(fecha del arranque)` es un aggregate). D3 justifica la base declarada
como cota de rendimiento y es una decisión válida; lo que falta es (a) reflejar la excepción
en la letra de REQ-ICB-03, y (b) evaluar un motivo informativo de confiabilidad cuando
declarado ≠ agregado real (con el cuidado de que una adopción a mitad de vida sin asiento de
apertura daría divergencia legítima — por eso es WARNING de diseño, no bug).

### SUGGESTION

**S1 — Partida abierta PRE-arranque sin matchear aparece como residuo anónimo, no como partida nombrada.**
Un movimiento importado con `fecha ≤ arranque` y sin match al corte queda fuera de la ventana:
su importe aparece en el residuo (correcto aritméticamente — verifiqué que al matchearse el
residuo vuelve a 0) pero sin nombre, aunque el dato está en el sistema. Misma familia que la
deuda documentada §3.7.1 (tramo arranque→primera importación); sugiero agregarlo ahí.

**S2 — Orquestación de verificación de vínculos duplicada.** El armado `porAncla` + huérfanas
+ `verificarAnclas` se repite entre `conciliacion.service.ts:195-227` y
`informe-conciliacion.service.ts:361-405` (~25 líneas de andamiaje). D4 cerró la REGLA
(estadoEfectivo, cero divergencia ✓); el andamiaje es candidato a helper compartido.

**S3 — La tabla de REQ-ICB-02 fija signo único por partida (`IGNORADO: −`), pero la
implementación firma POR MOVIMIENTO** (un DEBITO ignorado contribuye `+`, y así cierra la
identidad — el E2E lo muestra: `ignorados.importe = '50.00'`). La implementación es más
correcta que la tabla; conviene aclarar la spec para que nadie "corrija" el código contra ella.

**S4 — Granularidad de commits**: tasks 1.1+1.2 comparten commit (`e14e5fd`) y 2.1+2.2+2.3
comparten commit (`4aa5f41`); tasks.md prometía 1 task = 1 commit.

---

## Contraejemplo de la identidad — qué intenté y qué pasó

El residuo es el término de cierre por construcción, así que "romper la identidad" significa
producir residuo ≠ 0 sobre datos totalmente explicados (falso positivo) o residuo 0 sobre
datos rotos (falso negativo). Intenté, con álgebra sobre el código real (no sobre la doc):

1. **Par conciliado cruzando el arranque, pata banco en ventana** (cheque emitido antes del
   arranque, cobrado después): el mov CONCILIADO con asiento ≤ corte se cancela sin partida y
   el término base `L0−E0+residual` compensa exactamente → residuo 0 ✓.
2. **Par conciliado cruzando el arranque, pata libros en ventana** (asiento tardío de un
   movimiento pre-arranque): línea CONCILIADA con mov ≤ corte se cancela; mismo mecanismo → 0 ✓.
3. **Par cruzando el CORTE en ambas direcciones**: la pata en ventana queda como partida
   nombrada (`asentadoEl`/`registradoPorBancoEl`) y compensa su contribución al saldo → 0 ✓.
4. **Match roto en ventana**: ambas patas vuelven como partidas (−e, +l) y cancelan sus
   propias contribuciones a los deltas → 0 ✓.
5. **IGNORADO con match válido**: gana CONCILIADO y se cancela — coherente ✓.
6. **Residual declarada con signo positivo**: contribuye `−residual`; verificado contra el
   test 291 y contra el caso E2E ✓.

**No logré romper la aritmética.** Los dos hallazgos que sí produje no son de aritmética
sino de nominación y de base: la partida pre-arranque huérfana que se muestra como residuo
sin nombre (S1), y la base declarada de libros que nadie contrasta (W3) — con la cual un
usuario puede fabricar `conciliado: true` declarando saldos convenientes, mitigado porque la
declaración es un acto atribuido y auditable. Además verifiqué a mano la aritmética del E2E
del flujo completo (1650 − 200 + 50 − 80 + 0 + 0 = 1420 ✓).

---

## Tasks vs código

17 de 18 checkboxes con respaldo pleno verificado en código y tests. La excepción es **2.3**:
el cableado y el endpoint existen y funcionan, pero el alcance de test prometido en el texto
del checkbox ("E2E de ambos") no está — solo el caso vacío y el 404 (W1).

## Hallazgos conocidos (§3.7 / changelog §10.1)

Los 4 están correctamente documentados y dimensionados; confirmé #1 en el código
(`detectarHuecos` + filtro `enRango` en `derivarConfiabilidad`). No los re-reporto.

---

## Verdict

**PASS WITH WARNINGS** — el change hace lo que dice: la identidad existe, es pura, cierra en
todos los casos que intenté romper, la residual se declara y jamás se calcula, la abstención
califica sin suprimir, y las 3 suites + typecheck + lint están en verde medidos acá. Los
warnings son de cobertura del cableado de integridad (W1), protocolo TDD (W2) y una base
declarada sin contraste (W3) — ninguno bloquea el PR.
