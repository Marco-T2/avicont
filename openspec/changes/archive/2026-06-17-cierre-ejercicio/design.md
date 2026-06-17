# Diseño técnico — Asiento de Cierre del Ejercicio (`cierre-ejercicio`)

> Change: `cierre-ejercicio`
> Proyecto: avicont — Backend NestJS + Prisma + PostgreSQL
> Alcance: BACKEND-ONLY (frontend = change posterior)
> Artifact store: hybrid
> Topic key: sdd/cierre-ejercicio/design
> Proposal: `openspec/changes/cierre-ejercicio/proposal.md`
> Exploración: `docs/disenos/cierre-ejercicio-exploracion.md`

---

## 0. Resumen ejecutivo

Al cerrar una gestión fiscal, el sistema **genera 3 comprobantes tipo `CIERRE`**
(cerrar gastos/costos, cerrar ingresos, trasladar resultado a Resultados
Acumulados) en estado **BORRADOR no-editable (`generadoPorSistema=true`)**. El
contador los revisa y contabiliza; la gestión queda `CERRADA` recién cuando los
3 están `CONTABILIZADO`.

El insumo ya existe casi entero: `EeffSaldosReaderPort` da los saldos por cuenta
hoja; el flujo `crearBorrador`/`contabilizar` valida partida doble y asigna
correlativo atómico; el tipo `CIERRE` ya numera; la capa `reportes` ya trata
CIERRE con asimetría deliberada (§4.9). Este diseño **respeta ese contrato** y NO
inventa double-conteo: lo audita reporte por reporte (sección 5).

**Las 3 decisiones más delicadas** (transitoria, modelo borrador-bloqueado,
matriz CIERRE-en-reportes) están en la sección final con recomendación y firma
pendiente de Marco.

---

## 1. Verdades del código verificadas (de-riesga el diseño)

Leído en código, no asumido:

| Hallazgo | Archivo:línea | Implicación de diseño |
|----------|---------------|------------------------|
| `Comprobante` NO tiene `generadoPorSistema` ni `gestionId`. Sí tiene `origenTipo`/`origenId` con `@@unique([organizationId, origenTipo, origenId])`, hoy NULL. | `schema.prisma:677-737` | Idempotencia (D) vía `origenTipo`/`origenId` SIN columna nueva. `generadoPorSistema` SÍ es columna nueva (B). |
| `actualizarBorrador` / `eliminarBorrador` / `patch` validan SOLO `estado===BORRADOR`. | `comprobantes.service.ts:317,360,348` | **Hueco de seguridad**: un cierre en BORRADOR sería editable/borrable vía API. Hay que cerrarlo (B). |
| `anular` exige `CONTABILIZADO`, sin restricción por tipo `CIERRE`. | `comprobantes.service.ts:758-840` | Un CIERRE contabilizado se podría anular y dejar la gestión `CERRADA` huérfana. Hay que decidir (B). |
| `contabilizar` exige período de `fechaContable` **ABIERTO** + cuentas `activa`+`esDetalle` + partida doble + correlativo atómico `FOR UPDATE`. | `comprobantes.service.ts:394-533` | Los 3 cierres se contabilizan en el ÚLTIMO período (mesCierre) **mientras sigue ABIERTO**, antes de cerrar períodos/gestión. Orden crítico (sección 7). |
| NO existe port writer cross-módulo de comprobantes. `reportes` define ports de LECTURA dentro de sí mismo (§3.7). | `reportes/ports/*.port.ts` | El módulo de cierre necesita un **writer port** nuevo, dueño = `comprobantes`. |
| Matriz CIERRE-en-reportes ya cableada y documentada (§4.9): ER/EFE/Balance-Comprobación/Hoja-Trabajo **excluyen** CIERRE; BG (saldosHasta) y EEPN **incluyen** CIERRE. La asimetría es DELIBERADA. | sección 5 | El diseño NO toca firmas del port; solo **verifica cuadre** antes/después. |
| `calcularResultadoEjercicioBob` solo mira clases INGRESO/EGRESO, transparente al tipo de comprobante. | `reportes/domain/resultado-ejercicio.ts:31-60` | Tras cierre, con saldos que incluyen CIERRE, da ≈0; con `excluirCierre` da el resultado operativo. Ambos correctos por reporte. |
| `3.1.4.001 UTILIDAD DE LA GESTIÓN` es `esRequeridaSistema:true`, mapeada a `resultadoEjercicioId`. `3.1.4.002 PÉRDIDA DE LA GESTIÓN` NO es requerida y NO está en `MAPEO_CODIGO_A_CONCEPTO`. Ambas `PATRIMONIO_RESULTADOS`. | `cuentas/adapters/seed/comercial.ts:93-95,414-423` | Eliminar `3.1.4.002` NO rompe ninguna config mapeada (E). El rename de `3.1.4.001` preserva el mapeo `resultadoEjercicioId`. |
| `calcularMesCierre(tipoEmpresa)` devuelve solo el **mes** (12/3/6/9). | `common/domain/cierre-fiscal-por-tipo-empresa.ts:30` | La fecha del asiento es el último día de ese mes en el año calendario del último período de la gestión. Se deriva del período `ordenEnGestion=12`. |
| `cerrar()` valida 0 períodos ABIERTO y voltea el flag en una TX. | `gestiones-fiscales.service.ts:88-112` | El gate de cierre se integra acá, pero el cierre-de-asientos es una acción PREVIA y separada (2 acciones, decisión LOCKED). |

---

## 2. Ubicación del módulo

**Decisión: módulo nuevo `backend/src/cierre-ejercicio/` hexagonal.**

Justificación (Screaming Architecture §3.2):
- El cierre del ejercicio es un **bounded context propio**: orquesta lectura de
  saldos (de `reportes`), escritura de comprobantes (de `comprobantes`), lectura
  de config contable (de `configuracion-contable`/`cuentas`) y lectura de
  gestión (de `periodos-fiscales`). Meterlo dentro de `comprobantes` lo
  contaminaría con dependencias de 4 módulos; meterlo en `periodos-fiscales`
  mezclaría "calendario fiscal" con "lógica contable de resultado".
- Los **builders puros** (signed-net, partida doble) son dominio de cierre, no de
  comprobantes ni de reportes.
- Sigue el precedente del repo: cada capacidad contable nueva (reportes EEFF) es
  su propio riel.

Estructura:

```
backend/src/cierre-ejercicio/
├── domain/
│   ├── cierre-builders.ts            # buildCerrarGastos / buildCerrarIngresos / buildTrasladarResultado (PURO)
│   ├── signed-net.ts                 # net por cuenta hoja + lado (PURO)
│   └── cierre-errors.ts              # DomainErrors CIERRE_EJERCICIO_*
├── ports/
│   ├── cierre-saldos-reader.port.ts  # superficie de lectura de saldos de cierre (dueño: cierre-ejercicio)
│   ├── cierre-config-reader.port.ts  # cuentas destino (transitoria, resultados acumulados) + tipoEmpresa
│   └── cierre-comprobante-writer.port.ts  # crear borrador-sistema + contabilizar (dueño real: comprobantes)
├── adapters/
│   ├── eeff-cierre-saldos.adapter.ts # delega a EeffSaldosReaderPort de reportes
│   └── ...                           # adapters de los ports consumidos
├── cierre-ejercicio.service.ts       # orquestación
├── cierre-ejercicio.controller.ts    # endpoints
└── cierre-ejercicio.module.ts        # DI
```

### Ports que consume (cruce de frontera vía port, §3.3/§3.7)

1. **Lectura de saldos** → `cierre-ejercicio` define `CierreSaldosReaderPort`; su
   adapter delega en `EeffSaldosReaderPort` de `reportes` (`obtenerSaldosEnRango`
   con `excluirCierre=true` + `obtenerEstructuraCuentas`). Se pasa `excluirCierre=true`
   para que el cierre NO se calcule sobre cierres previos (no se cierra sobre un
   cierre) — y de paso para que un re-cierre idempotente lea el operativo.
2. **Cuentas destino + tipoEmpresa** → `CierreConfigReaderPort`: obtiene
   `resultadoEjercicioId` (transitoria) y `resultadosAcumuladosId` de
   `OrgConfiguracionContable`, y `tipoEmpresaPrincipal` para `calcularMesCierre`.
   Adapter en `configuracion-contable`/`tenants`.
3. **Escritura de comprobantes** → `CierreComprobanteWriterPort` (dueño =
   `comprobantes`, registrado en `comprobantes.module.ts`): crea el borrador
   marcado `generadoPorSistema` y lo contabiliza reusando la lógica existente.
4. **Clock** → `ClockPort` (ya existe), para la fecha del asiento.
5. **Lectura de gestión** → `GestionFiscalReaderPort` (de `periodos-fiscales`):
   estado de la gestión, sus períodos, el rango de fechas y el período del
   `mesCierre`.

---

## 3. CUESTIÓN A — Mecánica de la transitoria (líneas exactas de cada asiento)

### 3.1 Cuenta transitoria (decisión LOCKED)

`3.1.4.001` renombrada **"RESULTADO DE LA GESTIÓN"** es la transitoria dual:
- Naturaleza `ACREEDORA` (clase PATRIMONIO), subClase `PATRIMONIO_RESULTADOS`.
- Si la gestión da **utilidad** → queda con saldo ACREEDOR tras #1+#2.
- Si da **pérdida** → queda con saldo DEUDOR.
- El #3 la vacía contra `3.1.3.001 RESULTADOS ACUMULADOS`.

`3.1.4.002 PÉRDIDA DE LA GESTIÓN` se **elimina** del seed (cuestión E).

### 3.2 Algoritmo signed-net por cuenta hoja (PURO)

Por cada cuenta hoja (`esDetalle=true`) de clase INGRESO o EGRESO con saldo en el
rango (saldos leídos con `excluirCierre=true`):

```
net = (naturaleza === ACREEDORA) ? creditoBob − debitoBob : debitoBob − creditoBob
```

- `net > 0` (saldo normal en su naturaleza) → la línea de cierre va en el lado
  **OPUESTO** a la naturaleza, por `|net|`, para llevar la cuenta a cero.
- `net < 0` (anomalía: saldo contrario a la naturaleza) → línea en el lado
  **MISMO** que la naturaleza, por `|net|`.
- `net === 0` → **skip** (cuenta sin saldo neto, no aporta línea).

La contrapartida total va a la transitoria (un solo renglón agregado por asiento).

> Comentario regulatorio en código: `// Ley 843 art. 46 + Código Tributario art. 47: cierre de cuentas de resultado y traslado a patrimonio; partida doble débito=crédito.`

### 3.3 Las 3 piezas con sus líneas

**#1 Cerrar gastos y costos** (`tipo=CIERRE`, glosa "Cierre de cuentas de gastos y costos — gestión {year}")
- Por cada cuenta EGRESO con `net>0` (naturaleza DEUDORA → saldo deudor): línea
  **al HABER** por `|net|` (la lleva a cero).
- Renglón contrapartida: **al DEBE** de la transitoria por `Σ|net|` de gastos.
- Invariante: `Σ haber (gastos) === debe (transitoria)`.

**#2 Cerrar ingresos** (glosa "Cierre de cuentas de ingresos — gestión {year}")
- Por cada cuenta INGRESO con `net>0` (naturaleza ACREEDORA → saldo acreedor):
  línea **al DEBE** por `|net|`.
- Renglón contrapartida: **al HABER** de la transitoria por `Σ|net|` de ingresos.
- Invariante: `Σ debe (ingresos) === haber (transitoria)`.

**#3 Trasladar resultado** (glosa "Traslado del resultado de la gestión a Resultados Acumulados — gestión {year}")
- Tras #1+#2, la transitoria tiene saldo neto = `Σingresos − Σgastos` = resultado.
- Si **utilidad** (transitoria ACREEDORA): línea **al DEBE** de la transitoria por
  el resultado + línea **al HABER** de `3.1.3.001 RESULTADOS ACUMULADOS`.
- Si **pérdida** (transitoria DEUDORA): línea **al HABER** de la transitoria +
  línea **al DEBE** de RESULTADOS ACUMULADOS.
- Si resultado === 0 → **SKIP-on-zero del asiento entero** (#3 no se genera).

### 3.4 Ejemplo numérico — UTILIDAD

Saldos del rango (Bs): Ventas (INGRESO, acreedora) 100.000 cr; Costo de ventas
(EGRESO, deudora) 60.000 db; Sueldos (EGRESO) 20.000 db. Resultado = 100.000 − 80.000 = **20.000 utilidad**.

| # | Cuenta | Debe | Haber |
|---|--------|------|-------|
| **#1 Cerrar gastos** | Costo de ventas (5.1.1.001) | | 60.000 |
| | Sueldos (5.2.1.001) | | 20.000 |
| | RESULTADO DE LA GESTIÓN (3.1.4.001) | 80.000 | |
| | **Cuadre** | **80.000** | **80.000** |
| **#2 Cerrar ingresos** | RESULTADO DE LA GESTIÓN (3.1.4.001) | | 100.000 |
| | Ventas (4.1.1.001) | 100.000 | |
| | **Cuadre** | **100.000** | **100.000** |
| **#3 Traslado** | RESULTADO DE LA GESTIÓN (3.1.4.001) | 20.000 | |
| | RESULTADOS ACUMULADOS (3.1.3.001) | | 20.000 |
| | **Cuadre** | **20.000** | **20.000** |

Transitoria tras #1 (debe 80.000), #2 (haber 100.000) → saldo acreedor 20.000;
#3 lo debita → queda en 0. Resultados Acumulados +20.000 acreedor (patrimonio
crece). ✓

### 3.5 Ejemplo numérico — PÉRDIDA

Ventas 50.000 cr; Costo de ventas 70.000 db. Resultado = 50.000 − 70.000 = **−20.000 pérdida**.

| # | Cuenta | Debe | Haber |
|---|--------|------|-------|
| **#1 Cerrar gastos** | Costo de ventas | | 70.000 |
| | RESULTADO DE LA GESTIÓN | 70.000 | |
| **#2 Cerrar ingresos** | RESULTADO DE LA GESTIÓN | | 50.000 |
| | Ventas | 50.000 | |
| **#3 Traslado** | RESULTADOS ACUMULADOS (3.1.3.001) | 20.000 | |
| | RESULTADO DE LA GESTIÓN | | 20.000 |

Transitoria tras #1 (debe 70.000), #2 (haber 50.000) → saldo deudor 20.000; #3 lo
acredita → queda en 0. Resultados Acumulados −20.000 (debe → reduce patrimonio). ✓

### 3.6 Convivencia con la derivación existente (el punto fino de A)

Hoy BG y EEPN **derivan** el resultado vía `calcularResultadoEjercicioBob` sobre
saldos INGRESO/EGRESO. Tras los cierres reales:
- BG → `obtenerSaldosEnRango` SIN `excluirCierre` (incluye CIERRE): los saldos
  INGRESO/EGRESO quedan ≈0 (los anuló el cierre), por lo que la línea sintética
  "Resultado del Ejercicio" del BG da ≈0 **y** el resultado ya vive en
  RESULTADOS ACUMULADOS (que `obtenerSaldosHasta` lee, incluye CIERRE). NO hay
  double-conteo: el resultado migró de la línea sintética al patrimonio real.
- EEPN → incluye CIERRE deliberadamente: el traslado #3 aparece como movimiento
  real de patrimonio y cuadra con `saldoFinal`. Correcto por diseño existente.
- ER / EFE / Balance-Comprobación / Hoja-Trabajo → `excluirCierre=true`: siguen
  mostrando el resultado **operativo** del período como si no se hubiera cerrado.
  Es lo deseado: el contador quiere ver el ER de la gestión, no un ER vaciado.

Conclusión A: la transitoria NO rompe nada porque el sistema ya distingue
"resultado operativo" (excluir CIERRE) de "patrimonio acumulado" (incluir CIERRE).
La matriz de la sección 5 lo formaliza.

---

## 4. CUESTIÓN B — Modelo del "borrador bloqueado generado por sistema"

### 4.1 Opciones evaluadas

- **(b1) Flag `generadoPorSistema: boolean` en `Comprobante`** + bloqueo de
  edición/borrado en el service mientras esté BORRADOR. ✅ RECOMENDADA.
- (b2) Reuso de BORRADOR + frontend oculta "editar". ❌ RECHAZADA: deja el hueco
  backend abierto (verificado: `actualizarBorrador`/`eliminarBorrador` editan
  cualquier BORRADOR vía API). Viola defense-in-depth §4.2. El frontend NO es una
  capa de seguridad.
- (b3) Estado nuevo en el enum (`BORRADOR_SISTEMA`). ❌ RECHAZADA: contamina el
  enum de estados (que modela el ciclo contable BORRADOR→CONTABILIZADO→BLOQUEADO)
  con una preocupación ortogonal (autoría). "Generado por sistema" es un atributo
  de **origen**, no un estado del ciclo. Un flag booleano es la forma correcta;
  igual que `anulado` es flag ortogonal al estado (§4.7).

### 4.2 Diseño elegido (b1)

Columna nueva **`generadoPorSistema Boolean @default(false)`** en `Comprobante`.
Los 3 cierres nacen con `generadoPorSistema=true`. Enforcement defense-in-depth:

| Operación | Comportamiento con `generadoPorSistema=true` |
|-----------|----------------------------------------------|
| `actualizarBorrador` / `patch` (a BORRADOR) | **PROHIBIDO** → `CierreComprobanteNoEditableError` (409). El contador NO edita líneas de un cierre; si los datos están mal, **regenera** (4.3). |
| `eliminarBorrador` | **PROHIBIDO** directo por el usuario → `CierreComprobanteNoEliminableError` (409). El borrado solo ocurre vía "regenerar cierre" (path de sistema, 4.3). |
| `contabilizar` | **PERMITIDO**. El contador revisa y contabiliza. Es la acción que el flag justamente NO bloquea. |
| `editarContabilizado` (post-CONTABILIZADO) | **PROHIBIDO** para `generadoPorSistema` → mismo error. El cierre contabilizado es inmutable salvo reapertura+anulación. |
| `anular` | **PERMITIDO pero condicionado**: solo si la gestión NO está aún `CERRADA`. Ver 4.4. |

Implementación: el chequeo vive en `comprobantes.service.ts` (el dueño del
invariante), agregando `if (actual.generadoPorSistema) throw ...` en
`actualizarBorrador`, `eliminarBorrador`, `editarContabilizado`. El service de
cierre usa el **writer port** (no estos métodos de usuario) para crear/regenerar.

### 4.3 Regenerar el cierre (rehacer)

Si el contador detecta saldos mal antes de contabilizar (p.ej. faltó un ajuste),
necesita **rehacer**. Flujo idempotente del service de cierre:
1. Endpoint `POST /api/gestiones/:id/cierre` (re-invocable).
2. Si ya existen los 3 cierres en BORRADOR (idempotencia D) → los **borra**
   (path de sistema, vía writer port que sí puede borrar `generadoPorSistema`) y
   **recalcula** con los saldos actuales.
3. Si alguno ya está CONTABILIZADO → `CierreYaParcialmenteContabilizadoError`
   (409): para rehacer hay que anular los contabilizados primero (4.4).

Así el usuario nunca edita un cierre a mano; solo regenera (recalcula desde la
verdad de los saldos) — más seguro y sin drift.

### 4.4 ¿Se puede anular un cierre? ¿qué pasa con la gestión?

- Mientras la gestión está **ABIERTA** (cierres en BORRADOR o algunos
  CONTABILIZADO pero gestión no cerrada): anular un cierre CONTABILIZADO está
  **permitido** (devuelve la posibilidad de regenerar). El `anular` de
  comprobantes ya valida período abierto; el período del cierre (mesCierre) debe
  estar ABIERTO o en reapertura.
- Una vez la gestión está **CERRADA**: anular un cierre se **bloquea** →
  `CierreGestionCerradaError`. Para tocarlo, el admin pasa por el flujo de
  **reapertura de período** existente (`PeriodoFiscalReopening`), que es el canal
  auditado para cambios excepcionales (§4.4). NO se inventa un bypass.

Enforcement: en `comprobantes.service.anular`, si
`actual.generadoPorSistema && actual.tipo===CIERRE`, consultar el estado de la
gestión vía el reader port; si `CERRADA` → bloquear. (Cross-módulo vía port.)

---

## 5. CUESTIÓN C [CRÍTICO] — Matriz CIERRE en los 6 reportes

Partimos del contrato existente (verificado en código, §4.9). El diseño **NO
cambia ninguna firma de `EeffSaldosReaderPort`**; solo formaliza y agrega
regresión.

| Reporte | ¿Excluye CIERRE hoy? | Mecanismo | ¿Cambia con este change? | Riesgo / razón |
|---------|----------------------|-----------|--------------------------|----------------|
| **Estado de Resultados** | SÍ (`excluirCierre=true`) | `estado-resultados.service.ts:101` | NO | Sin riesgo. Muestra resultado OPERATIVO; el cierre no lo vacía. |
| **Estado de Flujo de Efectivo** | SÍ (`excluirCierre=true`) | `estado-flujo-efectivo.service.ts:105` | NO | Sin riesgo. Parte del resultado operativo. |
| **Balance de Comprobación** | SÍ (`excluirCierre=true`) | `balance-comprobacion.service.ts:96` | NO | Sin riesgo. Balance PRE-cierre del rango. |
| **Hoja de Trabajo 12 col** | SÍ (siempre, SQL incondicional) | `prisma-eeff-saldos-reader.adapter.ts:157` | NO | Sin riesgo. El cierre distorsionaría ER/BG de la hoja. |
| **Balance General** | NO en `obtenerSaldosHasta` (incluye); `obtenerSaldosEnRango` SIN flag (incluye) | `balance-general.service.ts:86-96` | NO | **Punto fino**: tras cierre, la línea sintética "Resultado del Ejercicio" da ≈0 y el resultado vive en RESULTADOS ACUMULADOS (vía saldosHasta que incluye CIERRE). NO double-conteo: el resultado migró, no se duplicó. |
| **EEPN** | NO (incluye, deliberado) | `evolucion-patrimonio.service.ts:104` | NO | El traslado #3 aparece como movimiento real de patrimonio y cuadra con saldoFinal. Es el reporte que DEBE ver el cierre. |

### 5.1 El invariante a preservar (formal)

Sea `R` el resultado del ejercicio de la gestión G (derivado, excluyendo CIERRE).
Sea `RA_post` el saldo de RESULTADOS ACUMULADOS tras contabilizar los 3 cierres.

1. **ER/EFE/Balance-Comprobación/Hoja-Trabajo de G** (excluyen CIERRE) → siguen
   reportando `R` operativo, idéntico antes y después del cierre. *Test: cuadre
   invariante ante presencia/ausencia de los CIERRE.*
2. **BG de G a fecha mesCierre** → línea sintética "Resultado del Ejercicio" ≈ 0
   tras cierre; `RA = RA_inicial + R` (incluido en saldosHasta). El **total de
   patrimonio del BG es idéntico** antes y después del cierre (el resultado pasó
   de la línea sintética a RA, misma magnitud). *Test: patrimonioTotal(BG antes) ===
   patrimonioTotal(BG después) ±0.01.*
3. **RESULTADOS ACUMULADOS en la gestión SIGUIENTE** refleja `R` **exactamente
   una vez** (no se re-deriva: la gestión siguiente parte de saldosHasta que
   incluye el cierre de G). *Test: RA(inicio gestión G+1) === RA(fin G) + R.*
4. **EEPN de G** → `otrosMovimientos` contiene el traslado #3; cuadra con
   `saldoFinal`. *Test: EEPN cuadra con CIERRE presente.*

### 5.2 Riesgo residual y mitigación

- **Gestión parcialmente cerrada** (1 o 2 de 3 cierres contabilizados): los
  reportes quedan en un estado transitorio inconsistente (p.ej. gastos cerrados,
  ingresos no). Mitigación: la gestión NO se considera cerrada hasta los 3
  CONTABILIZADO; los reportes que excluyen CIERRE no se afectan; el BG/EEPN
  muestran un estado intermedio real (no es corrupción, es el reflejo fiel del
  libro). Se documenta como esperado.
- **No se agrega ningún parámetro ni método al port** → cero superficie de
  regresión nueva en la firma; solo data nueva (comprobantes CIERRE reales).

### 5.3 Tests de regresión del cuadre (los que prueban antes/después)

Suite integración nueva `cierre-reportes-cuadre.integration.spec.ts` (2 tenants):
sembrar una gestión con movimientos → snapshot de los 6 reportes ANTES del cierre
→ generar+contabilizar los 3 cierres → snapshot DESPUÉS → assert de los 4
invariantes de 5.1. Caso utilidad y caso pérdida.

---

## 6. CUESTIÓN D — Idempotencia / anti-doble-cierre (defense in depth)

**Fuente de verdad triple, sin columna nueva para esto:**

1. **DB (hard)**: reusar `@@unique([organizationId, origenTipo, origenId])` ya
   existente. Cada cierre se persiste con `origenTipo="CIERRE_GESTION"` y
   `origenId="{gestionId}:{slot}"` donde `slot ∈ {GASTOS, INGRESOS, RESULTADO}`.
   Esto da unicidad por (tenant, gestión, slot) → imposible insertar dos veces el
   mismo asiento de cierre de la misma gestión bajo concurrencia. (NB: el slot va
   en `origenId` porque la unique es de 3 columnas; alternativa = `origenTipo`
   por slot `CIERRE_GASTOS`/`CIERRE_INGRESOS`/`CIERRE_RESULTADO` con
   `origenId=gestionId` — equivalente; se elige la que deje `origenTipo` estable.)
   **Recomendado**: `origenTipo` por slot, `origenId=gestionId`.
2. **Servicio (friendly)**: el service de cierre, antes de generar, consulta si
   ya existen cierres para la gestión (vía reader port por `origenTipo`/`origenId`)
   y decide regenerar (si BORRADOR) o rechazar (si alguno CONTABILIZADO) — 4.3.
3. **`GestionFiscal.status`**: es el invariante de alto nivel — si `CERRADA`, el
   endpoint de cierre rechaza de entrada (`CierreGestionCerradaError`).

No se agrega `gestionId` FK a `Comprobante`: la liga gestión↔cierre se hace por
`origenId` + el `periodoFiscalId` (que ya resuelve a la gestión). Evita migración
de FK sobre tabla grande.

---

## 7. Servicio de cierre — orquestación y ordering

```
POST /api/gestiones/:id/cierre   (genera/regenera los 3 borradores-sistema)
POST /api/gestiones/:id/cierre/contabilizar  (contabiliza los 3 — o se contabilizan 1×1 vía comprobantes)
```

### 7.1 Generar (idempotente)

1. Leer gestión por `id` (reader port). Si `CERRADA` → `CierreGestionCerradaError`.
2. Gate previo: para **generar** NO se exige aún 0 períodos abiertos (el contador
   prepara el cierre antes de cerrar el último período). Sí se exige que los 11
   períodos previos estén CERRADO y el período `mesCierre` ABIERTO (espejo del
   gate del referente: "11 cerrados + último abierto"). *Decisión a confirmar con
   spec: si se permite generar con el último período ya cerrado vía reapertura.*
3. Resolver `tipoEmpresaPrincipal` → `calcularMesCierre` → fecha = último día del
   `month` en el año calendario del período `ordenEnGestion=12`. Resolver
   `periodoFiscalId` de esa fecha.
4. Leer saldos INGRESO/EGRESO del rango de la gestión (`excluirCierre=true`).
5. Builders puros → líneas de #1, #2, #3 (SKIP-on-zero por asiento y por línea).
6. Idempotencia: si ya existen cierres de la gestión:
   - todos BORRADOR → borrarlos (writer port) y recrear;
   - alguno CONTABILIZADO → `CierreYaParcialmenteContabilizadoError`.
7. En **1 TX**: crear los (≤3) comprobantes `tipo=CIERRE`,
   `generadoPorSistema=true`, `origenTipo`/`origenId` por slot, vía writer port.

### 7.2 Contabilizar y consumar el cierre de gestión

- El contador contabiliza los 3 (vía el endpoint de contabilizar comprobante
  normal — el flag NO bloquea contabilizar — o vía un endpoint batch del cierre).
- Cuando los 3 están CONTABILIZADO, el flujo de **cerrar la gestión** procede:
  reusa `GestionesFiscalesService.cerrar()` (valida 0 períodos abiertos → cierra
  el último período → voltea el flag a `CERRADA`).
- **Ordering crítico** (verificado: `contabilizar` exige período ABIERTO):
  1. Generar borradores (período mesCierre ABIERTO).
  2. Contabilizar los 3 (período mesCierre ABIERTO).
  3. Cerrar el período mesCierre.
  4. `cerrar()` la gestión (los 12 períodos ya CERRADO).
- La relación con `cerrar()`: se puede acoplar opcionalmente un gate en `cerrar()`
  que verifique "si la gestión tiene cierres y no están los 3 contabilizados →
  rechazar". *Decisión de spec: ¿`cerrar()` exige cierre contabilizado, o son
  flujos independientes y el usuario debe cerrar manualmente?* Recomendación:
  `cerrar()` exige los 3 cierres CONTABILIZADO si existen (consistencia), pero NO
  los genera (2 acciones separadas, LOCKED).

### 7.3 Atomicidad parcial

Generar es atómico (1 TX, los 3 borradores o ninguno). Contabilizar es 3
operaciones independientes (cada `contabilizar` su propia TX) — un cierre "1 de 3"
es un estado consistente y reversible (se anula y regenera, o se contabilizan los
2 restantes). La gestión NO se cierra hasta los 3.

---

## 8. Builders de dominio puros (TDD)

`backend/src/cierre-ejercicio/domain/cierre-builders.ts` — cero NestJS/Prisma.

```ts
interface SaldoCuentaCierre {
  cuentaId: string;
  clase: ClaseCuenta;          // INGRESO | EGRESO
  naturaleza: NaturalezaCuenta;
  debitoBob: Money;
  creditoBob: Money;
}

interface LineaCierre {
  cuentaId: string;
  debito: Money;   // uno de los dos es ZERO (XOR)
  credito: Money;
}

interface AsientoCierre {
  glosa: string;
  lineas: LineaCierre[];        // [] ⇒ SKIP (no se genera el asiento)
}

// #1
function buildCerrarGastos(saldos: SaldoCuentaCierre[], transitoriaId: string, year: number): AsientoCierre;
// #2
function buildCerrarIngresos(saldos: SaldoCuentaCierre[], transitoriaId: string, year: number): AsientoCierre;
// #3
function buildTrasladarResultado(resultado: Money, transitoriaId: string, resultadosAcumuladosId: string, year: number): AsientoCierre;
```

Cada builder:
- aplica signed-net (`signed-net.ts`),
- omite cuentas con `net===0`,
- arma la contrapartida agregada a la transitoria,
- **verifica partida doble con `Money`** (`Σdebe.equals(Σhaber)` ±Bs 0.01) y lanza
  si no cuadra (defensa de dominio),
- devuelve `lineas: []` si no hubo aporte → SKIP-on-zero.

`signed-net.ts`: `function netDe(saldo, naturaleza): { lado: 'DEBE'|'HABER', monto: Money } | null`.

---

## 9. Schema / migración (protocolo §11.6)

### 9.1 Columna nueva

```prisma
model Comprobante {
  // ...
  generadoPorSistema Boolean @default(false)  // cierre, apertura, auto-entries: no editable por usuario
}
```

Migración ADITIVA (`ADD COLUMN ... DEFAULT false NOT NULL`) — retrocompatible, sin
backfill (todos los existentes quedan `false`). Protocolo §11.6: revisar el
`migration.sql` regenerado por DROP de objetos raw SQL (trigram, índices
parciales, triggers `comprobantes_audit`, CHECKs) y **borrar las líneas DROP** de
los objetos vivos de la tabla `comprobantes`/`lineas_comprobante` (lista §11.6:
`comprobante_documento_fisico_unique_contabilizado`, `trg_audit_comprobantes`,
`trg_audit_lineas_comprobante`). Verificar post-apply con `\d comprobantes`.

### 9.2 Sin enum nuevo

`TipoComprobante.CIERRE` ya existe. `origenTipo`/`origenId` ya existen. NO se
agrega `gestionId`. NO se toca `EstadoComprobante`.

### 9.3 Seed (cuestión E) — sección 11.

---

## 10. Endpoint(s), permisos, decoradores

| Método | Ruta | Permiso | Decoradores |
|--------|------|---------|-------------|
| `POST` | `/api/gestiones/:id/cierre` | `contabilidad.gestiones.cerrar` (reuso) | `@RequireModule('contabilidad')` |
| `GET` | `/api/gestiones/:id/cierre` (preview/estado de los 3) | `contabilidad.gestiones.read` (reuso) | idem |
| (contabilizar) | reusa `POST /api/asientos/:id/contabilizar` existente | `contabilidad.asientos.post` (existente) | idem |

**Recomendación de permiso**: reusar `contabilidad.gestiones.cerrar` (ya existe,
`gestiones-fiscales.controller.ts:86`). Generar el cierre ES parte de cerrar la
gestión. NO agregar permiso nuevo. *Alternativa si se quiere granularidad:
`contabilidad.gestiones.generar-cierre` — diferida, no la pide nadie.*

El controller puede vivir como métodos nuevos en `gestiones-fiscales.controller.ts`
(la ruta cuelga de `/gestiones/:id`) delegando al `CierreEjercicioService`, o en
un controller propio del módulo de cierre montado en el mismo path. Se elige
**delegación desde `gestiones-fiscales.controller`** para no fragmentar la ruta
`/gestiones/:id`, manteniendo la lógica en el módulo de cierre.

---

## 11. CUESTIÓN E — Migración del seed (orgs existentes)

### 11.1 Cambios al seed (orgs nuevas)

En `cuentas/adapters/seed/comercial.ts`:
- Renombrar `3.1.4.001` de `'UTILIDAD DE LA GESTIÓN'` a `'RESULTADO DE LA GESTIÓN'`
  (sigue `esRequeridaSistema:true`, mapeo `resultadoEjercicioId` intacto).
- **Eliminar** la entrada `3.1.4.002 'PÉRDIDA DE LA GESTIÓN'` de
  `CUENTAS_HOJA_COMERCIAL`. NO está en `MAPEO_CODIGO_A_CONCEPTO` → ningún concepto
  de config se rompe. (Verificar el mismo cambio en seeds de otros tipos de
  empresa si existen — el código leído es `comercial.ts`; revisar `servicios.ts`,
  etc. si los hubiera.)

### 11.2 Migración de datos para orgs YA sembradas

Camino seguro (data migration en `prisma/migrations/<ts>_cierre_resultado_gestion/`):

1. **Rename**: `UPDATE cuentas SET nombre='RESULTADO DE LA GESTIÓN' WHERE
   "codigoInterno"='3.1.4.001' AND nombre='UTILIDAD DE LA GESTIÓN'`. Idempotente
   por el filtro de nombre.
2. **Eliminar `3.1.4.002` solo si NO tiene movimiento**:
   ```sql
   DELETE FROM cuentas c
   WHERE c."codigoInterno"='3.1.4.002'
     AND NOT EXISTS (SELECT 1 FROM lineas_comprobante lc WHERE lc."cuentaId"=c.id);
   ```
   La FK `LineaComprobante.cuenta` es `onDelete: Restrict` → si tuviera
   movimiento, el DELETE fallaría igual; el `NOT EXISTS` lo hace explícito y deja
   la cuenta intacta (sin romper la migración) en el caso raro de que alguna org
   ya la haya usado. Esas orgs se reportan para tratamiento manual (no debería
   pasar: la cuenta nunca tuvo flujo en producción al no haber cierre aún).
3. **`esRequeridaSistema` NO complica el delete**: `3.1.4.002` tiene
   `esRequeridaSistema=false` (no está en el mapeo) → no hay guard de "cuenta
   requerida" que bloquee. Si por seguridad el schema/servicio tuviera un guard,
   la migración SQL lo bypassa (es raw SQL directo, no pasa por el service).

### 11.3 Test de coherencia del seed

`codigo-a-concepto.spec.ts` (existente) valida que toda cuenta `esRequeridaSistema`
esté mapeada. Tras el cambio sigue verde (3.1.4.001 sigue mapeada; 3.1.4.002 ya no
existe). Agregar test: el seed NO contiene `3.1.4.002`.

---

## 12. Errores nuevos (namespace `CIERRE_EJERCICIO_*`)

`domain/cierre-errors.ts`, todos `extends DomainError` (§6.2):

| Error | Code | HTTP | Cuándo |
|-------|------|------|--------|
| `CierreGestionNoEncontradaError` | `CIERRE_EJERCICIO_GESTION_NO_ENCONTRADA` | 404 | gestión inexistente |
| `CierreGestionCerradaError` | `CIERRE_EJERCICIO_GESTION_YA_CERRADA` | 409 | generar/anular sobre gestión CERRADA |
| `CierreYaParcialmenteContabilizadoError` | `CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO` | 409 | regenerar con ≥1 cierre CONTABILIZADO |
| `CierrePeriodoNoListoError` | `CIERRE_EJERCICIO_PERIODO_NO_LISTO` | 409 | gate de períodos previos no cumplido |
| `CierreSinResultadoError` (informativo/skip) | `CIERRE_EJERCICIO_SIN_MOVIMIENTO` | 422 | gestión sin INGRESO/EGRESO → nada que cerrar |
| `CierreConfigCuentaFaltanteError` | `CIERRE_EJERCICIO_CUENTA_DESTINO_FALTANTE` | 422 | `resultadoEjercicioId`/`resultadosAcumuladosId` no configurados |
| `CierrePartidaDobleError` | `CIERRE_EJERCICIO_PARTIDA_DOBLE` | 500 | builder no cuadra (bug de dominio — no debería pasar) |

En `comprobantes` (namespace existente del módulo):
| `CierreComprobanteNoEditableError` | `COMPROBANTE_GENERADO_SISTEMA_NO_EDITABLE` | 409 |
| `CierreComprobanteNoEliminableError` | `COMPROBANTE_GENERADO_SISTEMA_NO_ELIMINABLE` | 409 |

---

## 13. Plan de tests (honeycomb)

### Unit (dominio puro, 95% — §7.5)
- `signed-net.spec.ts`: net>0 deudora/acreedora, net<0 (contraria), net===0 skip.
- `cierre-builders.spec.ts`:
  - `buildCerrarGastos`: cuadre, SKIP si sin gastos, cuenta contraria.
  - `buildCerrarIngresos`: cuadre, SKIP si sin ingresos.
  - `buildTrasladarResultado`: utilidad (transitoria→RA), pérdida (RA→transitoria),
    resultado 0 → SKIP.
  - Casos numéricos de 3.4 (utilidad) y 3.5 (pérdida) verificados línea a línea.
  - Negativos: partida doble forzada a no cuadrar lanza `CierrePartidaDobleError`.

### Integración (Postgres real, 2 tenants — §7.2)
- `cierre-ejercicio.service.integration.spec.ts`: genera los 3 borradores; verifica
  `generadoPorSistema=true`, `origenTipo`/`origenId`, tipo CIERRE, fecha=mesCierre.
- Idempotencia: re-invocar regenera (borra BORRADOR y recrea); con uno
  CONTABILIZADO rechaza.
- Aislamiento tenant: tenant B no ve/cierra la gestión de A.
- Enforcement borrador-sistema: `actualizarBorrador`/`eliminarBorrador`/
  `editarContabilizado` sobre un cierre → error (huecos B cerrados, casos + y −).
- Anular: permitido con gestión ABIERTA; bloqueado con gestión CERRADA.
- **`cierre-reportes-cuadre.integration.spec.ts`** (sección 5.3): los 4 invariantes
  de cuadre antes/después, caso utilidad y pérdida.

### E2E (HTTP, §7.3)
- `cierre-ejercicio.e2e-spec.ts`: flujo feliz POST cierre → 3 borradores → 
  contabilizar → cerrar gestión → 200; permisos (sin `gestiones.cerrar` → 403);
  `@RequireModule('contabilidad')` (vertical granja → 404/403).

---

## 14. DECISIONES QUE REQUIEREN FIRMA DEL USUARIO

> El orquestador pausa acá y muestra esto a Marco antes de pasar a SPEC.

**A — Mecánica de la transitoria.**
- **Recomendado**: cuenta dual única `3.1.4.001 "RESULTADO DE LA GESTIÓN"`
  (deudora=pérdida / acreedora=utilidad); #1 y #2 barren contra ella; #3 la vacía
  contra `3.1.3.001 RESULTADOS ACUMULADOS`. Líneas exactas y ejemplos numéricos en
  §3.3–3.5.
- **Por qué**: una sola transitoria refleja el método boliviano canónico (P&G),
  evita la redundancia UTILIDAD/PÉRDIDA, y NO rompe la derivación de reportes
  (§3.6) porque el sistema ya separa resultado-operativo de patrimonio-acumulado.
- **Descartado**: mantener `3.1.4.001 UTILIDAD` + `3.1.4.002 PÉRDIDA` separadas
  (deuda de modelo: dos cuentas para un concepto dual, lógica condicional extra).

**B — Modelo del "borrador bloqueado generado por sistema".**
- **Recomendado**: columna nueva `generadoPorSistema: boolean` + enforcement en el
  service de `comprobantes` (bloquea editar/borrar/editar-contabilizado; permite
  contabilizar; anular condicionado al estado de la gestión). Regenerar = borrar
  (path sistema) + recalcular.
- **Por qué**: cierra el hueco de seguridad real (verificado: hoy `actualizarBorrador`
  edita cualquier BORRADOR vía API); "generado por sistema" es atributo de origen,
  no estado del ciclo → flag ortogonal, como `anulado`. Defense-in-depth §4.2.
- **Descartado**: reusar BORRADOR y ocultar "editar" en el frontend (deja el hueco
  backend abierto — el frontend no es seguridad) y estado nuevo en el enum
  (contamina el ciclo contable con autoría).

**C — Tratamiento de CIERRE en los 6 reportes.**
- **Recomendado**: NO cambiar ninguna firma ni comportamiento del contrato
  `excluirCierre` existente (matriz §5: ER/EFE/Balance-Comprobación/Hoja-Trabajo
  excluyen; BG/EEPN incluyen). Agregar solo la suite de regresión de cuadre
  antes/después (§5.3) que prueba los 4 invariantes (§5.1).
- **Por qué**: la asimetría ya está cableada y documentada (§4.9), y es
  contablemente correcta: el resultado del ejercicio se sigue viendo operativo en
  ER/BG de la gestión cerrada, y RESULTADOS ACUMULADOS de la gestión siguiente lo
  refleja exactamente una vez (migró, no se duplicó). Cambiar el contrato
  introduciría el double-conteo que hoy NO existe.
- **Descartado**: hacer que el BG excluya CIERRE en `obtenerSaldosEnRango` (rompería
  el EEPN que comparte el método sin flag, y haría desaparecer el resultado del
  patrimonio acumulado).
