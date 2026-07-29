# Verify Report — `ventas-piloto`, Fases 1, 2 y 3

**Fecha**: 2026-07-29
**Alcance**: tasks 1.1–1.11, 2.1–2.9, 3.1–3.4, 6.1–6.2 (+6.3 parcial).
Fases 4, 5, 7 y el resto de la 6 **no implementadas por plan** — no se reportan como faltantes.
**Rango auditado**: `01d501d..0816af5` (PRs #303, #305, #306, #307).
**Modo**: Strict TDD · artifact store `hybrid`
**Veredicto**: **PASS WITH WARNINGS** — 0 CRITICAL, 3 WARNING, 3 SUGGESTION

> **Estado de los hallazgos (2026-07-29, mismo día)**: W-1 y W-2 **corregidos** en la
> rama `fix/comprobante-idempotencia-y-origenes`. W-1 tenía un defecto real y ahora
> tiene test de concurrencia con mutante muerto 3/3. W-2 resultó menos grave de lo
> reportado al principio — ver la nota de severidad en su sección. W-3 y las 3
> SUGGESTION quedan abiertas.

---

## Completeness

| Métrica | Valor |
|---|---|
| Tasks del change | 62 |
| Completas `[x]` | 26 |
| Parciales `[~]` | 1 (6.3, con la omisión justificada en el propio task) |
| Pendientes por plan | 35 (fases 4, 5, 7 y 6.4–6.10) |
| Tasks EN ALCANCE completas | 26/26 |

---

## Build & Tests

| Chequeo | Resultado |
|---|---|
| `jest src/` | ✅ **233 suites, 3215 passed**, 1 todo, 0 failed (38 s) |
| `tsc --noEmit` | ✅ limpio |
| `pnpm run lint` (src + test) | ✅ limpio |
| Migraciones | ✅ 3 aplicadas, §11.6 respetado |

---

## Spec Compliance Matrix

| Requisito | Escenario | Evidencia | Estado |
|---|---|---|---|
| REQ-ITM-01 | alta con solo el nombre | `items.service.spec` › guarda con sólo nombre y tipo · `prisma-items.repository.integration` › guarda un ítem con sólo el nombre | ✅ |
| REQ-ITM-01 | desactivar, nunca borrar | `items.service.spec` › desactivar es idempotente y no borra · integration › desactiva sin borrar | ✅ |
| REQ-ITM-02 | dos ítems sin código conviven | integration › deja convivir N ítems sin código | ✅ |
| REQ-ITM-02 | mismo código choca por los dos mecanismos | service › rechaza el código ya ocupado (guard) + integration › rechaza el mismo código (constraint) + `traducirCodigoDuplicado` P2002→409 | ✅ |
| REQ-ITM-02 | normalización al persistir | `item-validator.spec` (9 casos, ambas direcciones) | ✅ |
| REQ-ITM-03 | ítem de otro tenant → 404 | integration › no cruza tenants (404, no 403) · service › 404 si es de otro tenant | ✅ |
| REQ-ITM-04 | la superficie no crece | `prisma-items-reader.adapter.integration` › devuelve SOLO id y activo (assertea CLAVES) | ✅ |
| REQ-ITM-05 | desactivar cuenta enchufada a ítems | `prisma-cuenta-items-referencia.integration` (5 tests, incl. OMITE inactivos y no cruza tenants) | ✅ |
| REQ-ITM-05 | cuenta libre se desactiva normalmente | ídem, caso vacío | ✅ |
| REQ-ITM-06 | usuario sin permiso → 403 | `catalogo-vs-controllers.spec` (3 puntas) + `PermissionsGuard` fail-closed + seed Contador | ✅ |
| REQ-CMP-VTA-01 | serie propia desde la primera venta | `PREFIJO_POR_TIPO.VENTA = 'V'` presente; **el comportamiento e2e es la task 7.1** | ⚠️ PARCIAL (por plan) |
| REQ-CMP-VTA-01 | (−) la migración de tablas no usa el valor nuevo | verificado por inspección: **cero** ocurrencias de `VENTA` en `20260729010000` | ✅ (sin test automatizado) |
| REQ-CMP-VTA-02 | idempotencia del auto-asiento | integration › corriendo dos veces deja UN solo comprobante + no pisa glosa ni líneas | ⚠️ **secuencial sí, concurrente NO** → W-1 |
| REQ-CMP-VTA-02 | el listado distingue cobro de venta | constantes y predicados listos; consumo en fases 4–5 | ⚠️ PARCIAL (por plan) |
| REQ-CMP-VTA-03 | regenerar preserva el número | `comprobante-sistema-writer.service.spec` › reemplaza en bloque y NO borra + preserva el tipo + recalcula totales | ✅ |
| REQ-CMP-VTA-03 | (−) el writer rechaza un asiento inválido | ídem: partida doble, cuenta inactiva, no-detalle, sin contacto, período cerrado origen/destino, anulado (30 tests) | ✅ |
| REQ-CMP-VTA-04 | (−) anular por la API de comprobantes → 409 | `comprobantes.service.spec` › origen comercial: VENTA y COBRO + `repo.anular` no llamado | ✅ |
| REQ-CMP-VTA-04 | (+) anular desde ventas sí procede | `anularSistema` delega en `anularEnTx`; guarda ausente ahí a propósito | ✅ |
| REQ-CMP-VTA-05 | org existente tras el backfill | migración idempotente (`NOT ... = ANY`), criterio por `INGRESO` y no por código | ✅ (sin test automatizado) |
| REQ-CMP-VTA-05 | org nueva nace correcta | `tipos-universales.spec` | ✅ |

**Compliance**: 17 escenarios ✅ · 3 PARCIAL por plan · 1 con hueco real (W-1). **Cero FAILING, cero UNTESTED no planificado.**

---

## Coherence (Design)

| Decisión del design | ¿Seguida? | Nota |
|---|---|---|
| `ComprobanteSistemaWriterPort` nuevo, no extender el del cierre | ✅ | Poseído por `comprobantes` (§3.7) |
| `tx` REQUERIDO en los 5 métodos | ✅ | Documentado en el port; imposible escribir fuera de la TX auditada |
| Sin `periodoFiscalId` en el caller; lo resuelve el writer | ✅ | `resolverPeriodoAbierto` desde `fechaContable` |
| `regenerarLineasSistema` preserva `tipo` | ✅ | Test dedicado |
| `AuditedTransactionRunner` sube a `common/` | ✅ | Movimiento puro (R068), specs movidos con él |
| Implementación es SERVICIO, no adapter | ✅ | Cero líneas de Prisma; delega en el repo port |
| `contabilizarEnTx`/`anularEnTx` compartidos, no copiados | ✅ | Refactor puro verificado en el diff |
| A `common/` va el PREFIJO, no "el criterio" | ✅ | `efectivo.ts` = prefijo + predicado; interruptor org-wide del EFE intacto |
| Elegibilidad = unión POR CUENTA, no fallback | ✅ | Test discriminante: bajo `1.1.1` marcada `OPERACION` **sigue** elegible |
| El EFE no cambia de conducta | ✅ | Suite de EEFF verde; solo cambió de dónde importa 2 símbolos |
| `ESTADOS_CONCILIABLES` a un lugar único | ✅ | `common/estados-comprobante.ts`, 2 call sites |
| Comparación por segmento, no `startsWith` | ✅ | Test `1.1.10` vs `1.1.1` |
| Escribir con `upsert`, nunca `create` ciego | ❌ **DESVIADA** | Ver W-1 |

---

## Issues

### CRITICAL
Ninguno.

### WARNING

**W-1 — `crearBorradorSistemaSiNoExiste` es check-then-act, no `upsert`.**
`backend/src/comprobantes/adapters/prisma-comprobante.repository.ts:215-265`

REQ-CMP-VTA-02 exige *"escriben sobre el `@@unique(...)` con **`upsert`, nunca `create` ciego** (Anti-17, §4.9)"*, y el JSDoc del propio port repite la promesa: *"escribe con `upsert` … nunca con `create` ciego. Correr el generador dos veces (retry, doble submit) deja UN solo comprobante."*

La implementación es `findUnique` → `if (existente) return` → `create`. Sin `upsert`, sin `ON CONFLICT`, sin captura de `P2002`.

- **Secuencial (retry tras TX cerrada)**: funciona y está probado. Es el caso común.
- **Concurrente (doble submit en paralelo)**: ambas TX no encuentran nada, ambas insertan, la segunda viola el unique → `P2002` → el filtro global lo mapea a **409 genérico** (`'El recurso ya existe o viola una restricción de unicidad.'`) y la TX de la venta entera revierte.

Impacto acotado: **no hay corrupción de datos** — el constraint aguanta, que es la defensa en profundidad funcionando. Lo que se rompe es el contrato de idempotencia justo en el caso que el doc dice cubrir. Es la cicatriz F-01 del propio CLAUDE.md ("enforcement solo en servicio falla bajo concurrencia") en versión atenuada.

El *Testing Strategy* del design listaba "**idempotencia del upsert**" como asunto de integración; el eje concurrente no quedó cubierto.

**W-2 — `ORIGENES_COMERCIALES` promete una garantía del compilador que no da.**
`backend/src/comprobantes/ports/comprobante-sistema-writer.port.ts:52-60`

> **Severidad rebajada durante el fix.** El primer diagnóstico decía que la omisión "mergea en verde" y abría un agujero Anti-14. **Era una conclusión sacada de una medición incompleta**: corrí sólo `tsc` y no la suite. Ver la corrección abajo, que es lo que vale.

El comentario afirma: *"Se declara con la unión como tipo del array (no `string[]`) para que sumar un origen nuevo a `OrigenTipoComercial` y olvidarlo acá NO compile."* Esa afirmación **es falsa** y se midió: un array no exige exhaustividad — `readonly OrigenTipoComercial[]` acepta 2 de 3 valores y `tsc` sale en 0. Agregando un tercer origen, el compilador señala `NOMBRE_POR_ORIGEN` (un `Record`, ese sí exhaustivo) y el `Record` del spec, pero **no** el array.

**Lo que corrige el diagnóstico inicial**: la omisión NO llega a producción. El test «exhaustividad del catálogo» de `comprobante-sistema-writer.port.spec.ts` compara el array contra un `Record<OrigenTipoComercial, true>` y **falla**. Medido con el mutante completo: `tsc` EXIT 0 **pero 1 test failed**. O sea que rompe CI, no el runtime.

Queda entonces así: la protección existe, pero en una capa más débil que la anunciada —CI en vez del editor— y el comentario mandaba explícitamente a no revisarlo. No es un agujero de seguridad; es una promesa incumplida sobre dónde salta la red.

Vale arreglarlo igual, y el fix es barato: derivar el array del `Record` elimina la segunda lista, así que no hay nada que sincronizar y la omisión pasa a ser **imposible por construcción** en vez de detectada después del hecho. Mismo movimiento que ató `CONCEPTO_FIELDS` al DMMF en la task 1.8.

**Lección propia, que es el hallazgo más útil de esta auditoría**: verifiqué una garantía de compilador corriendo sólo el compilador. La pregunta era "¿esto llega a producción?" y para eso hacía falta la suite. Un mutante que no se corre contra **todas** las redes existentes sobreestima el agujero.

**W-3 — No existe el artefacto `apply-progress` ni su tabla de TDD Evidence.**
Ni en `openspec/changes/ventas-piloto/` ni en engram (`mem_search` sin resultados). El modo del change es `hybrid`, que obliga a los dos lados.

La regla del módulo Strict TDD marca esto **CRITICAL**; lo bajo a WARNING a conciencia y digo por qué: la evidencia **existe**, en otra forma. `tasks.md` la lleva por task y con detalle no trivial — mutantes plantados y muertos (3.1: 4 mutantes; 3.4: 3; 1.8: verificado que sacar `ventasId` pasaba 10 suites en verde), qué se verificó por comportamiento y no por definición (1.5), y qué se dejó afuera a propósito (6.3). Lo que falta es el artefacto en el lugar que el protocolo espera, no la disciplina. Las fases se corrieron inline sin la skill `sdd-apply`, por decisión explícita, y ahí se perdió el artefacto.

### SUGGESTION

**S-1 — `reactivar` no re-valida `cuentaIngresoId`.**
`backend/src/items/items.service.ts:157-160`

Secuencia legítima que deja un ítem activo apuntando a una cuenta inactiva: desactivar ítem → desactivar la cuenta (permitido: el guard mira sólo ítems **activos**, decisión correcta de la task 3.4) → **reactivar el ítem**. `actualizar` valida la cuenta cuando se la envía; `reactivar` no revisa la que ya está.

No es incumplimiento: REQ-ITM-05 declara explícitamente al writer como red de defensa (*"si a pesar del guard una cuenta del snapshot llega inactiva … el writer re-valida y rechaza — error, no bypass"*), y el writer efectivamente rechaza (probado). Pero el usuario se enteraría al vender, no al reactivar, que es el momento barato para decírselo.

**S-2 — `esOrigenComercial` podría ser type predicate y borrar un cast.**
`comprobantes.service.ts:840` hace `comprobantePreTx.origenTipo as OrigenTipoComercial` inmediatamente después del `if`. Con la firma `origenTipo is OrigenTipoComercial` el compilador lo estrecha solo y el `as` desaparece.

**S-3 — El `ConflictException` nuevo de `cuentas.service.ts:233` extiende la deuda de §10.10.**
CLAUDE.md pide no agregar throws con `*Exception` de NestJS en código nuevo. Acá es defendible —REQ-ITM-05 pidió *"mismo patrón que `CUENTA_CONFIGURADA_COMO_CONCEPTO`"* y divergir dejaría dos estilos de error en el mismo método—, así que **es conforme**. Queda anotado: la migración del módulo `cuentas` a `DomainError` sigue pendiente y este método la hereda.

---

## Assertion Quality

**✅ Sin aserciones triviales.** Cero tautologías, cero loops fantasma, cero smoke-only, cero aserciones sobre `className`.

Tres patrones que merecen mención por ser lo contrario del problema que este chequeo busca:

- `concepto-fields.spec.ts` usa `expect(faltantes).toEqual([])` — un array vacío, que normalmente se marca como aserción débil. Acá **no lo es**: un tercer test (`el DMMF encuentra conceptos`) existe sólo para impedir que los dos primeros pasen por vacío. Es la defensa explícita contra el falso verde.
- `item-validator.spec.ts` prueba las **dos direcciones** de la normalización: que `"p-01 "` y `"P-01"` colapsen, y que los guiones y espacios internos **no** se toquen. Sin el segundo grupo, "normalizar de más" pasaba en verde.
- `elegibilidad-efectivo.spec.ts` incluye el par que **discrimina unión de fallback** (cuenta bajo `1.1.1` marcada `OPERACION` sigue elegible). Sin él, una implementación con "en su defecto" —la que traía la spec antes de corregirse— habría pasado.

---

## Verificado y descartado como hallazgo

Lo dejo escrito para que nadie vuelva a gastar el tiempo:

- **`X-Tenant-ID` sobre el JWT en `items.controller.ts`.** Parecía violar §4.2 (header sólo para super-admin). Es patrón del repo (16 de 34 controllers) y **es seguro**: `PermissionsGuard` resuelve el `tenantId` por el mismo camino y llama `hasAllPermissions(user, tenantId, …)` — sin membresía no hay permisos → 403. Fail-closed verificado leyendo el guard.
- **Anti-31 en los adapters nuevos.** `prisma-items.repository.ts` muestra 6 referencias a `organizationId` para 7 operaciones: no falta ninguna — `listar` comparte un único `where` entre `findMany` y `count`.
- **§4.5 / §4.6 en el código nuevo.** Cero `new Date()` en dominio y services; cero `number` en campos de dinero (los `total: number` son conteos de filas). DTOs de `items` cruzan montos como `string` con regex propia.
- **§11.6 en las 3 migraciones.** Los `DROP` que aparecen en la de tablas son **comentarios** documentando lo recortado a mano (2 índices GIN trigram, `comprobantes_audit` + sus triggers). Cero `DROP` ejecutable. El UNIQUE PARCIAL de `Item.codigo` está escrito a mano y sumado a la tabla de §11.6.
- **La migración de tablas no contiene el literal `VENTA`** (escenario negativo de REQ-CMP-VTA-01): cero ocurrencias.
