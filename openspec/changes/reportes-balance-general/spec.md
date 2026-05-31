# Balance General — Especificación

<!--
Última edición: 2026-05-31
Última revisión contra core: 2026-05-31
Owner: backend-lead
-->

> Fecha: 2026-05-31
> Fase: spec
> Proyecto: avicont
> Change: reportes-balance-general (BACKEND-ONLY)
> Capability nueva: `balance-general` (no existe spec previa en `openspec/specs/`)

---

## Propósito

Consulta del Balance General (Estado de Situación Financiera): árbol jerárquico
Activo / Pasivo / Patrimonio con saldos agregados por estructura del plan de cuentas,
a una **fecha de corte** (`?fecha=YYYY-MM-DD`), para un único tenant. Tercer reporte
del módulo `reportes/`; primer Estado Financiero oficial.

El Balance introduce lógica de dominio nueva sobre el Mayor:

1. **Propagación jerárquica**: saldos de hojas (`esDetalle=true`) se propagan hacia
   agrupadores (`esDetalle=false`) recorriendo `parentId`/`nivel`.
2. **Cuentas contrarias** (`esContraria=true`, ej. Depreciación Acumulada): se
   **restan** del total de su grupo en lugar de sumarse.
3. **Resultado del Ejercicio** en Patrimonio: calculado como
   `Σ saldos INGRESO − Σ saldos EGRESO` de la gestión vigente hasta la fecha de
   corte, usando el mismo `BalanceReaderPort` que reutilizará el Estado de
   Resultados (Change 4).

---

## Glosario

- **Fecha de corte**: `?fecha=YYYY-MM-DD`. Fecha calendario puro; el backend
  acumula todos los movimientos con `fechaContable <= fecha` (§4.6 CLAUDE.md).
- **Gestión vigente**: `GestionFiscal` cuyo rango `(mesInicio, mesFin, year)`
  contiene la fecha de corte. Se infiere vía `PeriodosReaderPort`.
- **Cuenta hoja**: `esDetalle=true`; tiene movimientos reales.
- **Cuenta agrupadora**: `esDetalle=false`; su saldo = suma propagada de hijos.
- **Saldo neto de una hoja**: aplica signo por naturaleza —
  DEUDORA `= Σ debitoBob − Σ creditoBob`; ACREEDORA `= Σ creditoBob − Σ debitoBob`.
- **esContraria**: flag en `Cuenta`; la cuenta vive en una clase pero tiene
  naturaleza opuesta (ej. Depreciación Acumulada: ACTIVO / ACREEDORA). Se **resta**
  del total de su grupo en lugar de sumarse.
- **Resultado del Ejercicio**: `Σ saldoNeto(cuentas INGRESO) − Σ saldoNeto(cuentas EGRESO)`
  de la gestión vigente hasta la fecha de corte. Se inyecta en Patrimonio como
  línea calculada.
- **Resultados Acumulados**: saldo real de la cuenta configurada en
  `OrgConfiguracionContable.resultadosAcumuladosId` (utilidades retenidas de
  gestiones cerradas); sale de la suma histórica hasta la fecha de corte.
- **Cuadre**: `|Activo − (Pasivo + Patrimonio)| ≤ 0.01 BOB`. Tolerancia ±Bs 0.01
  (§4.1 CLAUDE.md — partida doble). Dato de salida, no error duro.
- **Monto string**: todo importe viaja como `string` decimal (`"1250.50"`), nunca
  `number` (§4.5 CLAUDE.md).
- **FechaContable**: fecha calendario puro `"YYYY-MM-DD"`, sin hora ni UTC
  (§4.6 CLAUDE.md).

---

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

### REQ-BG-01: Parámetro de corte — `fecha` obligatoria

El endpoint `GET /api/eeff/balance` DEBE requerir el parámetro `?fecha` en formato
`YYYY-MM-DD`. Si `fecha` está ausente o tiene formato inválido, el sistema DEBE
rechazar con HTTP 400 y código `BALANCE_GENERAL_FECHA_INVALIDA`.

El parámetro `fecha` es una `FechaContable` (calendario puro, sin hora ni zona
horaria). El sistema DEBE interpretar el corte como `fechaContable <= fecha`
(inclusive) al acumular movimientos.

#### Escenario: fecha válida

- DADO un tenant con comprobantes en 2026
- CUANDO se consulta `GET /api/eeff/balance?fecha=2026-05-31`
- ENTONCES el sistema responde 200 con el Balance General calculado al 31/05/2026

#### Escenario: fecha ausente — error 400

- CUANDO se consulta `GET /api/eeff/balance` sin el parámetro `fecha`
- ENTONCES el sistema responde HTTP 400 con `BALANCE_GENERAL_FECHA_INVALIDA`

#### Escenario: formato de fecha inválido — error 400

- CUANDO se consulta `GET /api/eeff/balance?fecha=31-05-2026` (formato incorrecto)
- ENTONCES el sistema responde HTTP 400 con `BALANCE_GENERAL_FECHA_INVALIDA`

---

### REQ-BG-02: Inferencia de gestión vigente

El sistema DEBE determinar automáticamente la **gestión fiscal vigente** para la
`fecha` de corte consultada, buscando la `GestionFiscal` cuyo rango contiene esa
fecha. Si ninguna gestión cubre la fecha indicada, el sistema DEBE responder HTTP 422
con código `BALANCE_GENERAL_FECHA_SIN_GESTION`.

La gestión vigente se usa exclusivamente para delimitar el período del
**Resultado del Ejercicio** (REQ-BG-07). Los Activos, Pasivos y el resto del
Patrimonio se calculan con acumulado histórico desde el primer movimiento hasta
la fecha de corte, sin restricción por gestión (REQ-BG-05).

#### Escenario: fecha dentro de una gestión abierta

- DADO que existe una `GestionFiscal` con `year=2026` y `status=ABIERTA`
  que cubre el rango 2026-01-01 / 2026-12-31
- CUANDO se consulta con `fecha=2026-05-31`
- ENTONCES el sistema infiere la gestión 2026 y la usa para el Resultado del Ejercicio

#### Escenario: fecha sin gestión asociada — error 422

- DADO que no existe ninguna `GestionFiscal` que cubra la fecha 2025-06-15
- CUANDO se consulta con `fecha=2025-06-15`
- ENTONCES el sistema responde HTTP 422 con `BALANCE_GENERAL_FECHA_SIN_GESTION`
  y un mensaje legible en español

---

### REQ-BG-03: Filtrado por estado — BORRADOR excluido siempre

El sistema DEBE incluir únicamente comprobantes con
`estado IN (CONTABILIZADO, BLOQUEADO)` al calcular todos los saldos del Balance.
El estado BORRADOR NUNCA DEBE aparecer ni contribuir a ningún saldo,
independientemente de cualquier parámetro.

#### Escenario: BORRADOR excluido de los saldos

- DADO una cuenta `1.1.01 Caja Bolivianos` con un comprobante BORRADOR
  (debe Bs 500) y un comprobante CONTABILIZADO (debe Bs 300) antes de la fecha de corte
- CUANDO se consulta el Balance General
- ENTONCES el saldo de `1.1.01` refleja solo los Bs 300 del CONTABILIZADO;
  el BORRADOR no contribuye al activo

---

### REQ-BG-04: Anulados — excluidos por default, incluibles con toggle

Por default (`incluirAnulados` ausente o `false`), los comprobantes con
`anulado = true` NO DEBEN contribuir a ningún saldo del Balance (§4.7 CLAUDE.md).
Si `incluirAnulados=true`, el sistema DEBE incluirlos en el cálculo.

> **Decisión de alcance**: el toggle `incluirAnulados` se incluye en este change
> (consulta de auditoría interna). La respuesta NO incluye marcador visual de
> anulados (es un reporte agregado, no listado de movimientos); la semántica es
> "calcular saldos con/sin anulados".

#### Escenario: anulados excluidos por default

- DADO una cuenta ACTIVO con un comprobante CONTABILIZADO anulado (debe Bs 1000)
  y uno vigente (debe Bs 500), ambos con `fechaContable <= fecha`
- CUANDO se consulta sin `incluirAnulados`
- ENTONCES el saldo de esa cuenta es Bs 500 (solo el vigente)

#### Escenario: anulados incluidos con toggle

- DADO el mismo escenario anterior
- CUANDO se consulta con `incluirAnulados=true`
- ENTONCES el saldo de esa cuenta es Bs 1500 (ambos comprobantes)

---

### REQ-BG-05: Saldo neto por cuenta hoja — fórmula por naturaleza

El sistema DEBE calcular el **saldo neto** de cada cuenta hoja (`esDetalle=true`)
como la suma acumulada de todas sus líneas con `fechaContable <= fechaCorte`,
`estado IN (CONTABILIZADO, BLOQUEADO)` y `anulado=false` (o `true` si el toggle
está activo), aplicando la fórmula de naturaleza:

<!-- Ley 843 y NCP bolivianas: cuentas de activo y egreso son DEUDORAS. -->
<!-- Las de pasivo, patrimonio e ingresos son ACREEDORAS. -->
- **DEUDORA**: `saldoNeto = Σ debitoBob − Σ creditoBob`
- **ACREEDORA**: `saldoNeto = Σ creditoBob − Σ debitoBob`

`TipoComprobante.APERTURA` NO recibe trato especial: su efecto ya está incluido
en la suma histórica hasta la fecha de corte (arrastre de gestión vía APERTURA,
exploración §B.3). Empresa nueva sin asiento APERTURA → saldo inicial 0 (correcto).

El campo `esContraria` NO modifica esta fórmula base. Lo que `esContraria` hace
es intervenir en la **propagación a grupos** (REQ-BG-06), no en el cálculo del
saldo individual de la hoja.

#### Escenario: saldo hoja cuenta DEUDORA (Activo)

- DADO la cuenta `1.1.01 Caja Bolivianos` con `naturaleza = DEUDORA`
- Y movimientos hasta la fecha de corte: debe Bs 5000, haber Bs 1200
- CUANDO se consulta el Balance General
- ENTONCES el saldo neto de `1.1.01` es `"3800.00"` (5000 − 1200)

#### Escenario: saldo hoja cuenta ACREEDORA (Pasivo)

- DADO la cuenta `2.1.01 Proveedores` con `naturaleza = ACREEDORA`
- Y movimientos: haber Bs 8000, debe Bs 2000
- CUANDO se consulta el Balance General
- ENTONCES el saldo neto de `2.1.01` es `"6000.00"` (8000 − 2000)

#### Escenario: empresa nueva sin asiento APERTURA

- DADO un tenant con comprobantes desde el inicio de la gestión, sin asiento
  `TipoComprobante.APERTURA`
- CUANDO se consulta el Balance General
- ENTONCES el sistema calcula los saldos desde Bs 0 correctamente
- Y no devuelve error por ausencia de APERTURA

---

### REQ-BG-06: Propagación jerárquica — hoja a agrupador

El sistema DEBE propagar los saldos de las cuentas hoja (`esDetalle=true`) hacia
sus agrupadores (`esDetalle=false`) recorriendo el árbol `parentId`/`nivel` en
memoria. Las cuentas agrupadoras NO tienen movimientos directos; su saldo es
siempre la suma propagada de sus hijos.

Reglas de propagación:

1. Solo cuentas hoja (`esDetalle=true`) aportan saldo real.
2. El saldo de un agrupador = `Σ saldos de hijos normales − Σ saldos de hijos con esContraria=true`.
3. La propagación es recursiva: un agrupador de nivel N suma los agrupadores de
   nivel N+1, que a su vez suman sus hojas.
4. Si un agrupador no tiene ningún descendiente con saldo ≠ 0, el agrupador
   se **omite** del reporte (ver REQ-BG-08).

<!-- Código Tributario art. 47: el árbol del plan de cuentas respeta la estructura -->
<!-- jerárquica del plan oficial; la suma siempre debe cuadrar en cada nivel. -->

#### Escenario: propagación de 3 niveles — Activo Corriente

- DADO el siguiente árbol:
  - `1` (ACTIVO, nivel 1, agrupador)
    - `1.1` (ACTIVO_CORRIENTE, nivel 2, agrupador)
      - `1.1.01` Caja Bolivianos (hoja, saldo Bs 3800)
      - `1.1.02` Banco BNB (hoja, saldo Bs 12000)
    - `1.2` (ACTIVO_NO_CORRIENTE, nivel 2, agrupador)
      - `1.2.01` Equipo de Computación (hoja, saldo Bs 8000)
- CUANDO se consulta el Balance General
- ENTONCES `1.1` tiene saldo Bs 15800 (3800 + 12000)
- Y `1` tiene saldo Bs 23800 (15800 + 8000)

#### Escenario: agrupador con un solo hijo — propagación correcta

- DADO un agrupador `2.2` con un único hijo hoja `2.2.01` con saldo Bs 5000
- CUANDO se consulta el Balance General
- ENTONCES `2.2` tiene saldo Bs 5000

---

### REQ-BG-06b: Propagación jerárquica — no doble conteo

El sistema NO DEBE doble-contar saldos. Un agrupador que aparece como hijo de
otro agrupador NO debe sumar los saldos ya propagados desde sus propias hojas Y
también los saldos directos de esas hojas. La propagación es estricta: solo las
hojas aportan saldo real; los agrupadores solo acumulan lo que sus hijos directos
les pasan.

#### Escenario: árbol de 4 niveles — sin doble conteo

- DADO el árbol:
  - `1` → `1.1` → `1.1.01` (hoja, saldo Bs 1000)
  - `1.1` propaga Bs 1000 a `1`
- CUANDO se consulta el Balance General
- ENTONCES `saldoTotal` de la sección ACTIVO incluye Bs 1000 UNA sola vez
- Y no se suma Bs 1000 desde `1.1` más Bs 1000 desde `1.1.01` (sería Bs 2000 erróneo)

---

### REQ-BG-07: Cuentas contrarias (`esContraria=true`) — se restan del grupo

Las cuentas con `esContraria=true` tienen naturaleza opuesta a su clase
(ej. Depreciación Acumulada: vive en ACTIVO pero es ACREEDORA). Al propagar,
el sistema DEBE **restar** su saldo neto del total de su grupo agrupador
en lugar de sumarlo.

Esta regla se aplica en la **propagación** (REQ-BG-06): el saldo neto de la
hoja contraria se calcula normalmente por su `naturaleza` (ACREEDORA →
`Σ haber − Σ debe`), pero al acumularse en el agrupador padre, se resta.

`esContraria` es irrelevante en el Libro Mayor (el Mayor usa `naturaleza`
directamente); solo interviene en el Balance y el Estado de Resultados.

#### Escenario: Depreciación Acumulada resta del Activo (CRÍTICO)

- DADO el árbol:
  - `1.2` Activo No Corriente (agrupador)
    - `1.2.01` Equipo de Computación (hoja, DEUDORA, saldo Bs 8000)
    - `1.2.02` Depreciación Acumulada Equipo (hoja, `esContraria=true`,
      ACREEDORA, saldo neto ACREEDORA = Bs 2000)
- CUANDO se consulta el Balance General
- ENTONCES el saldo de `1.2` es Bs 6000 (8000 − 2000)
- Y el saldo neto del grupo refleja el valor en libros (costo − depreciación)

#### Escenario: sin cuentas contrarias — comportamiento normal

- DADO un grupo ACTIVO sin ninguna cuenta `esContraria=true`
- CUANDO se consulta el Balance General
- ENTONCES todos los saldos hoja se suman normalmente (ninguno se resta)

#### Escenario: cuenta contraria con saldo 0 — sin efecto en el grupo

- DADO una cuenta `esContraria=true` con saldo neto 0 (sin movimientos)
- CUANDO se consulta el Balance General
- ENTONCES el grupo no se ve afectado (restar 0 no cambia el total)

---

### REQ-BG-08: Omisión de cuentas hoja con saldo 0

Las cuentas **hoja** (`esDetalle=true`) con saldo neto 0 DEBEN omitirse del
reporte. Las cuentas **agrupadoras** (`esDetalle=false`) se preservan mientras
tengan al menos un descendiente con saldo ≠ 0 para mantener la estructura del
reporte. Un agrupador sin ningún descendiente con saldo ≠ 0 DEBE omitirse también.

#### Escenario: cuenta hoja con saldo 0 — omitida

- DADO la cuenta `1.3.01 Depósitos en Garantía` con saldo neto 0
- CUANDO se consulta el Balance General
- ENTONCES `1.3.01` no aparece en el reporte

#### Escenario: agrupador con todos los hijos en saldo 0 — omitido

- DADO el grupo `1.3 Otros Activos` cuyas únicas hojas tienen saldo 0
- CUANDO se consulta el Balance General
- ENTONCES `1.3` tampoco aparece en el reporte

#### Escenario: agrupador con al menos un hijo con saldo — preservado

- DADO el grupo `1.1 Activo Corriente` con dos hojas:
  - `1.1.01` saldo Bs 3800 (≠ 0)
  - `1.1.02` saldo Bs 0 (omitida)
- CUANDO se consulta el Balance General
- ENTONCES `1.1` aparece en el reporte con saldo Bs 3800
- Y solo `1.1.01` aparece como hoja dentro de `1.1`

---

### REQ-BG-09: Resultado del Ejercicio — Patrimonio

El sistema DEBE calcular el **Resultado del Ejercicio** como:

```
ResultadoEjercicio = Σ saldoNeto(cuentas con claseCuenta=INGRESO, gestionVigente)
                   − Σ saldoNeto(cuentas con claseCuenta=EGRESO, gestionVigente)
```

donde `gestionVigente` = movimientos con `fechaContable` en el rango
`[inicioGestion, fechaCorte]` (inicio de la gestión inferiada hasta la fecha de
corte inclusive), estado `IN (CONTABILIZADO, BLOQUEADO)`.

El Resultado del Ejercicio se inyecta en la sección **Patrimonio** como una línea
calculada. Su valor PUEDE ser negativo (pérdida del ejercicio).

<!-- Esta es la misma fuente de verdad que reutilizará el Estado de Resultados -->
<!-- (Change 4). Opción (b) del proposal: port de saldos compartido; -->
<!-- garantiza que el Balance y el Estado de Resultados nunca diverjan. -->

Los **Resultados Acumulados** en Patrimonio (cuentas `PATRIMONIO_RESULTADOS` con
saldo real de gestiones cerradas) se calculan con el saldo histórico normal hasta
la fecha de corte (misma lógica REQ-BG-05). Son distintos del Resultado del
Ejercicio. El sistema DEBE tratar ambos por separado (**tratamiento dual**).

#### Escenario: Resultado del Ejercicio positivo (utilidad)

- DADO una gestión 2026 con:
  - Ingresos acumulados hasta 2026-05-31: Bs 50000
  - Egresos acumulados hasta 2026-05-31: Bs 35000
- CUANDO se consulta el Balance General con `fecha=2026-05-31`
- ENTONCES el Resultado del Ejercicio en Patrimonio es `"15000.00"`

#### Escenario: Resultado del Ejercicio negativo (pérdida)

- DADO ingresos Bs 20000 y egresos Bs 30000 en la gestión hasta la fecha de corte
- CUANDO se consulta el Balance General
- ENTONCES el Resultado del Ejercicio es `"-10000.00"` (pérdida; el Patrimonio baja)

#### Escenario: tratamiento dual — Resultados Acumulados ≠ Resultado del Ejercicio

- DADO:
  - Cuenta `3.2.01 Resultados Acumulados` con saldo real Bs 8000 (gestiones previas)
  - Gestión 2026 vigente con Resultado del Ejercicio Bs 15000 (calculado)
- CUANDO se consulta el Balance General
- ENTONCES Patrimonio muestra:
  - Resultados Acumulados: `"8000.00"` (saldo real de la cuenta)
  - Resultado del Ejercicio: `"15000.00"` (calculado, no saldo de cuenta)
- Y ambas cifras son independientes y sumadas al total Patrimonio

---

### REQ-BG-10: Estructura del reporte — árbol anidado Activo/Pasivo/Patrimonio

La respuesta DEBE devolver el balance como un árbol jerárquico con tres secciones
de primer nivel: `ACTIVO`, `PASIVO`, `PATRIMONIO`. Cada sección DEBE dividirse en
subsecciones según `subClaseCuenta` del plan de cuentas (Corriente / No Corriente
para Activo y Pasivo; Capital / Resultados para Patrimonio). Cada subsección
contiene los grupos y hojas con saldo que le correspondan.

La jerarquía dentro de cada subsección sigue `parentId`/`nivel` del plan de cuentas
del tenant. El orden dentro de cada nivel DEBE ser por `codigoInterno` ASC.

#### Escenario: estructura de tres secciones

- DADO un tenant con cuentas en Activo, Pasivo y Patrimonio con saldo ≠ 0
- CUANDO se consulta el Balance General
- ENTONCES la respuesta contiene `activo`, `pasivo` y `patrimonio` como claves raíz
- Y cada sección tiene `subSecciones` agrupadas por `subClaseCuenta`

---

### REQ-BG-11: Verificación de ecuación contable — `cuadra` y `diferencia`

El sistema DEBE verificar la ecuación contable `Activo = Pasivo + Patrimonio`
con tolerancia `±Bs 0.01` (§4.1 CLAUDE.md) y exponer el resultado como
`cuadra: boolean` y `diferencia: string` (diferencia absoluta en BOB) en
la raíz de la respuesta.

`cuadra=false` NO es un error duro: el sistema DEBE devolver HTTP 200 con el
Balance completo incluyendo `cuadra: false` y la diferencia. El descuadre indica
un problema en los datos (ej. asientos mal registrados), no en el endpoint.

<!-- Código Tributario art. 47: Activo = Pasivo + Patrimonio es la ecuación -->
<!-- fundamental de la partida doble. La tolerancia de Bs 0.01 permite redondeos -->
<!-- acumulados en operaciones legítimas. -->

#### Escenario: ecuación cuadra — cuadra=true

- DADO un Balance donde Activo = Bs 100000, Pasivo = Bs 60000, Patrimonio = Bs 40000
- CUANDO se consulta el Balance General
- ENTONCES `cuadra: true` y `diferencia: "0.00"`

#### Escenario: ecuación no cuadra — cuadra=false, respuesta 200

- DADO un Balance donde Activo = Bs 100000, Pasivo + Patrimonio = Bs 99998.50
  (diferencia de Bs 1.50 por datos inconsistentes)
- CUANDO se consulta el Balance General
- ENTONCES la respuesta es HTTP 200
- Y `cuadra: false`, `diferencia: "1.50"`, y el árbol completo está presente

#### Escenario: diferencia dentro de la tolerancia — cuadra=true

- DADO un Balance donde `|Activo − (Pasivo + Patrimonio)| = 0.005` (redondeo)
- CUANDO se consulta el Balance General
- ENTONCES `cuadra: true` (dentro de la tolerancia ±Bs 0.01)

---

### REQ-BG-12: Multi-tenant — aislamiento estricto (CRÍTICO)

El sistema DEBE filtrar todos los movimientos, saldos y estructura de cuentas
por el `organizationId` del JWT activo (§4.2 CLAUDE.md). El adapter Prisma
DEBE incluir `lc.organizationId = $tenant` como predicado explícito en la
query `$queryRaw` de saldos Y en el `findMany` de estructura de cuentas, sin excepción.

<!-- Anti-31 (CLAUDE.md): query sin filtro de tenantId es bug de seguridad. -->
<!-- Defense in depth: guard + service + adapter todos checan el organizationId. -->

Ningún saldo ni cuenta de otro tenant DEBE aparecer en el Balance,
aunque compartan la misma fecha de corte.

#### Escenario: dos tenants — sin fuga (CRÍTICO)

- DADO que el Tenant A tiene Activo Bs 200000 y el Tenant B tiene Activo Bs 500000,
  ambos con fecha de corte 2026-05-31
- CUANDO el usuario del Tenant A consulta `GET /api/eeff/balance?fecha=2026-05-31`
- ENTONCES el activo total de la respuesta refleja solo los datos del Tenant A
- Y ningún saldo, cuenta ni agrupador del Tenant B aparece en la respuesta

#### Escenario: tenant sin comprobantes — Balance en cero

- DADO un tenant recién creado sin ningún comprobante
- CUANDO consulta el Balance General
- ENTONCES la respuesta tiene `activo.total: "0.00"`, `pasivo.total: "0.00"`,
  `patrimonio.total: "0.00"`, `cuadra: true`, `diferencia: "0.00"`

---

### REQ-BG-13: RBAC — permiso requerido

El sistema DEBE proteger `GET /api/eeff/balance` con el permiso
`contabilidad.eeff.read`. Un usuario sin ese permiso DEBE recibir HTTP 403.

#### Escenario: sin permiso — 403

- DADO un usuario autenticado sin el permiso `contabilidad.eeff.read`
- CUANDO consulta `GET /api/eeff/balance?fecha=2026-05-31`
- ENTONCES el sistema responde HTTP 403

#### Escenario: sin autenticación — 401

- CUANDO se consulta `GET /api/eeff/balance?fecha=2026-05-31` sin JWT
- ENTONCES el sistema responde HTTP 401

---

### REQ-BG-14: Tenant sin plan de cuentas — Balance en cero (no error)

Si el tenant no tiene cuentas configuradas en el plan de cuentas, el sistema
DEBE devolver HTTP 200 con un Balance en cero (todas las secciones con total
`"0.00"`, `cuadra: true`). NO DEBE devolver un error 404 ni 422 por ausencia
de plan de cuentas.

#### Escenario: tenant sin cuentas

- DADO un tenant válido sin ninguna cuenta en el plan de cuentas
- CUANDO consulta el Balance General
- ENTONCES la respuesta es HTTP 200 con `activo.total: "0.00"`,
  `pasivo.total: "0.00"`, `patrimonio.total: "0.00"`, `cuadra: true`

---

### REQ-BG-15: Forma del DTO de respuesta

La respuesta DEBE cumplir esta forma exacta (montos `string`, fechas `"YYYY-MM-DD"`):

```
{
  fechaCorte: string,                   // "YYYY-MM-DD" — la fecha solicitada
  gestionId: string,                    // UUID de la GestionFiscal inferida
  activo: {
    total: string,                      // Σ de todas las subsecciones
    subSecciones: [
      {
        subClase: "ACTIVO_CORRIENTE" | "ACTIVO_NO_CORRIENTE",
        total: string,
        grupos: [
          {
            cuentaId: string,           // UUID del agrupador
            codigoInterno: string,      // ej. "1.1"
            nombre: string,
            total: string,
            cuentas: [                  // solo hojas con saldo ≠ 0
              {
                cuentaId: string,
                codigoInterno: string,  // ej. "1.1.01"
                nombre: string,
                esContraria: boolean,
                saldo: string           // monto neto de la hoja (siempre ≥ 0 en valor absoluto)
              }
            ]
          }
        ]
      }
    ]
  },
  pasivo: {                             // misma forma que activo, con subClase:
    total: string,                      // "PASIVO_CORRIENTE" | "PASIVO_NO_CORRIENTE"
    subSecciones: [...]
  },
  patrimonio: {
    total: string,                      // Σ capital + resultadosAcumulados + resultadoEjercicio
    subSecciones: [
      {
        subClase: "PATRIMONIO_CAPITAL" | "PATRIMONIO_RESULTADOS",
        total: string,
        grupos: [...]
      }
    ],
    resultadoEjercicio: string          // línea calculada (puede ser negativo: "-5000.00")
  },
  cuadra: boolean,                      // |activo − (pasivo + patrimonio)| ≤ 0.01
  diferencia: string                    // diferencia absoluta en BOB; "0.00" si cuadra
}
```

> Nota: el DTO NO incluye `generadoEn`. `new Date()` está prohibido en el
> service/dominio (§4.6). Si se necesita timestamp, se inyecta vía `ClockPort`
> en un change posterior.

#### Escenario: montos serializados como string

- DADO un Balance con un saldo de Bs 1.250,50
- CUANDO se consulta el Balance General
- ENTONCES todos los campos `saldo`, `total` y `resultadoEjercicio` en la respuesta JSON
  son strings como `"1250.50"`, nunca números como `1250.5`

#### Escenario: fechaCorte en la respuesta

- CUANDO se consulta con `?fecha=2026-05-31`
- ENTONCES `fechaCorte: "2026-05-31"` aparece en la raíz del DTO

---

### REQ-BG-16: Extracción del helper `saldo-naturaleza.ts`

El service del Balance DEBE usar el helper compartido de signo-por-naturaleza
(`reportes/domain/saldo-naturaleza.ts`) para calcular el saldo neto de cada hoja,
el mismo que usa el Libro Mayor. Este helper DEBE extraerse desde
`libro-mayor.service.ts` como refactoring **sin cambio de comportamiento**,
cubierto por los tests existentes del Mayor.

La extracción es parte de este change y garantiza que Balance y Mayor usen
exactamente la misma fórmula de naturaleza, previniendo divergencia.

#### Escenario: helper compartido — mismo resultado que el Mayor

- DADO una cuenta DEUDORA con debe Bs 5000 y haber Bs 1200
- CUANDO el Balance calcula el saldo de esa cuenta usando `saldo-naturaleza.ts`
- ENTONCES el saldo es `"3800.00"` (idéntico a lo que devolvería el Mayor)

---

## Código de errores

| Código | HTTP | Descripción |
|--------|------|-------------|
| `BALANCE_GENERAL_FECHA_INVALIDA` | 400 | `?fecha` ausente o con formato inválido (no `YYYY-MM-DD`) |
| `BALANCE_GENERAL_FECHA_SIN_GESTION` | 422 | No existe `GestionFiscal` que cubra la fecha de corte |

---

## Notas regulatorias

- El Balance General (Estado de Situación Financiera) es un estado financiero
  obligatorio según las Normas de Contabilidad Bolivianas (NCB) y el Código de
  Comercio de Bolivia (art. 36).
- La ecuación `Activo = Pasivo + Patrimonio` (§4.1 CLAUDE.md) refleja el
  principio de partida doble del Código Tributario art. 47.
- Los saldos se expresan en BOB (moneda funcional boliviana, §4.5). Los
  `debitoBob`/`creditoBob` en `lineas_comprobante` ya están en BOB; no se
  requiere conversión en runtime.
- La fecha de corte es `FechaContable` (calendario puro, sin UTC, sin hora),
  conforme §4.6 CLAUDE.md. El contenedor corre en `TZ=UTC`; la capa de
  presentación renderiza en `America/La_Paz`.
- El Resultado del Ejercicio calculado en este change es la misma cifra que
  aparecerá en el Estado de Resultados (Change 4). Al compartir el
  `BalanceReaderPort`, se garantiza que ambos reportes nunca diverjan —
  un requisito contable fundamental.
