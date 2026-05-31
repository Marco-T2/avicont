# Estado de Resultados — Especificación

<!--
Última edición: 2026-05-31
Última revisión contra core: 2026-05-31
Owner: backend-lead
-->

> Fecha: 2026-05-31
> Fase: spec
> Proyecto: avicont
> Change: reportes-estado-resultados (BACKEND-ONLY)
> Capability nueva: `estado-resultados` (no existe spec previa en `openspec/specs/`)

---

## Propósito

Consulta del Estado de Resultados (Income Statement): árbol jerárquico
Ingreso / Egreso con saldos de **flujo** agregados por estructura del plan de cuentas,
para un rango de fechas `[fechaDesde, fechaHasta]` (o período/gestión equivalente),
para un único tenant. Cuarto reporte del módulo `reportes/`; segundo Estado Financiero
oficial.

Diferencia fundamental con el Balance General: **reporte de FLUJO**, no de saldo.
Las cuentas de resultado (INGRESO/EGRESO) parten de 0 al inicio del rango; solo
los movimientos dentro de `[fechaDesde, fechaHasta]` cuentan. El Resultado del
Ejercicio que produce este reporte coincide con el del Balance General para el
mismo período, porque ambos usan el mismo `BalanceReaderPort.obtenerSaldosEnRango`.

---

## Glosario

- **fechaDesde / fechaHasta**: rango calendario puro `"YYYY-MM-DD"` que delimita los
  movimientos incluidos en el flujo (§4.6 CLAUDE.md). Ambas son inclusive.
- **Saldo de flujo**: suma de movimientos en `[fechaDesde, fechaHasta]` — NO acumulado
  histórico. Cuentas de resultado parten de 0 al inicio del rango.
- **Cuenta hoja**: `esDetalle=true`; aporta saldo de flujo real.
- **Cuenta agrupadora**: `esDetalle=false`; saldo = suma propagada de hijos.
- **Saldo neto hoja (flujo)**:
  DEUDORA (EGRESO) → `Σ debitoBob − Σ creditoBob` en el rango.
  ACREEDORA (INGRESO) → `Σ creditoBob − Σ debitoBob` en el rango.
- **esContraria**: flag en `Cuenta`; la cuenta se **resta** del total de su grupo
  en la propagación (ej. devoluciones sobre ventas restan del Ingreso Operativo).
- **Resultado del Ejercicio**: `Σ saldoFlujo(INGRESO) − Σ saldoFlujo(EGRESO)` en el
  rango. Puede ser negativo (pérdida del período).
- **Monto string**: todo importe viaja como `string` decimal (`"1250.50"`) (§4.5).

---

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

### REQ-ER-01: Parámetros de rango — tres formas, exactamente una requerida

El endpoint `GET /api/eeff/resultados` DEBE aceptar exactamente una de estas tres
formas para delimitar el rango de flujo:

1. **Rango directo**: `fechaDesde` + `fechaHasta` (ambas `YYYY-MM-DD`, ambas requeridas juntas).
2. **Por período fiscal**: `periodoFiscalId` (UUID); el rango es el mes del período.
3. **Por gestión**: `gestionId` (UUID); el rango es la gestión completa.

Prioridad si se pasan varias formas: `fechaDesde/fechaHasta` > `periodoFiscalId` > `gestionId`.
Si se pasan formas mutuamente excluyentes, el sistema DEBE usar la forma de mayor prioridad.
Si ninguna forma se proporciona, el sistema DEBE responder HTTP 400 con
`REPORTES_RESULTADOS_RANGO_INVALIDO`.
Si `fechaDesde > fechaHasta` o el rango está mal formado, DEBE responder HTTP 400 con
`REPORTES_RESULTADOS_RANGO_INVALIDO`.
Si un `periodoFiscalId` o `gestionId` no existe para el tenant, DEBE responder HTTP 422
con `REPORTES_RESULTADOS_SIN_PERIODO` o `REPORTES_RESULTADOS_SIN_GESTION`.

#### Escenario: rango directo válido

- DADO un tenant con comprobantes en mayo 2026
- CUANDO se consulta `GET /api/eeff/resultados?fechaDesde=2026-05-01&fechaHasta=2026-05-31`
- ENTONCES el sistema responde 200 con el Estado de Resultados del flujo de mayo 2026

#### Escenario: por período fiscal válido

- DADO un `periodoFiscalId` existente que cubre 2026-05
- CUANDO se consulta `?periodoFiscalId={uuid}`
- ENTONCES el sistema resuelve `fechaDesde=2026-05-01`, `fechaHasta=2026-05-31` y devuelve 200

#### Escenario: sin rango — error 400

- CUANDO se consulta `GET /api/eeff/resultados` sin ningún parámetro de rango
- ENTONCES el sistema responde HTTP 400 con `REPORTES_RESULTADOS_RANGO_REQUERIDO`

#### Escenario: fechaDesde > fechaHasta — error 400

- CUANDO se consulta con `fechaDesde=2026-06-01&fechaHasta=2026-05-01`
- ENTONCES el sistema responde HTTP 400 con `REPORTES_RESULTADOS_RANGO_INVALIDO`

#### Escenario: períodoFiscalId inexistente — error 422

- CUANDO se consulta con un `periodoFiscalId` que no existe para el tenant activo
- ENTONCES el sistema responde HTTP 422 con `REPORTES_RESULTADOS_SIN_PERIODO`

---

### REQ-ER-02: Reporte de FLUJO — sin arrastre histórico (CRÍTICO)

El sistema DEBE calcular saldos usando ÚNICAMENTE movimientos con
`fechaContable >= fechaDesde AND fechaContable <= fechaHasta`.
Los movimientos con `fechaContable < fechaDesde` NO DEBEN afectar ningún saldo
del Estado de Resultados, independientemente de que sean CONTABILIZADOS o BLOQUEADOS.
Las cuentas de resultado parten de 0 al inicio del rango.

<!-- NCB: el Estado de Resultados reporta actividad del período, no saldo histórico. -->

#### Escenario: movimientos previos al rango excluidos (CRÍTICO)

- DADO la cuenta `4.1.01 Ventas` con:
  - Comprobante CONTABILIZADO en 2026-04-15 (haber Bs 10000) — FUERA del rango
  - Comprobante CONTABILIZADO en 2026-05-10 (haber Bs 5000) — DENTRO del rango
- CUANDO se consulta con `fechaDesde=2026-05-01&fechaHasta=2026-05-31`
- ENTONCES el saldo de flujo de `4.1.01` es `"5000.00"` (solo el de mayo)
- Y el comprobante de abril NO aparece ni contribuye al resultado

#### Escenario: rango sin movimientos — saldo cero, no error

- DADO un tenant con cuentas de resultado sin ningún movimiento en el rango solicitado
- CUANDO se consulta el Estado de Resultados
- ENTONCES el sistema responde HTTP 200 con todas las secciones en `"0.00"`
- Y `resultadoEjercicioBob: "0.00"`

---

### REQ-ER-03: Filtrado por estado — BORRADOR excluido siempre

El sistema DEBE incluir únicamente comprobantes con
`estado IN (CONTABILIZADO, BLOQUEADO)` al calcular todos los saldos de flujo.
El estado BORRADOR NUNCA DEBE aparecer ni contribuir a ningún saldo,
independientemente de cualquier parámetro.

#### Escenario: BORRADOR excluido del flujo

- DADO la cuenta `4.1.01 Ventas` con un comprobante BORRADOR (haber Bs 5000)
  y uno CONTABILIZADO (haber Bs 3000), ambos con `fechaContable` dentro del rango
- CUANDO se consulta el Estado de Resultados
- ENTONCES el saldo de flujo de `4.1.01` es `"3000.00"` (solo el CONTABILIZADO)

---

### REQ-ER-04: Anulados — excluidos por default, incluibles con toggle

Por default (`incluirAnulados` ausente o `false`), los comprobantes con
`anulado=true` NO DEBEN contribuir a ningún saldo (§4.7 CLAUDE.md).
Si `incluirAnulados=true`, el sistema DEBE incluirlos en el cálculo.

#### Escenario: anulados excluidos por default

- DADO la cuenta `4.1.01 Ventas` con un comprobante CONTABILIZADO anulado (haber Bs 2000)
  y uno vigente (haber Bs 3000), ambos dentro del rango
- CUANDO se consulta sin `incluirAnulados`
- ENTONCES el saldo de flujo es `"3000.00"` (solo el vigente)

#### Escenario: anulados incluidos con toggle

- DADO el mismo escenario anterior
- CUANDO se consulta con `incluirAnulados=true`
- ENTONCES el saldo de flujo es `"5000.00"` (ambos comprobantes)

---

### REQ-ER-05: Saldo neto de flujo por cuenta hoja — fórmula por naturaleza

El sistema DEBE calcular el **saldo de flujo** de cada cuenta hoja (`esDetalle=true`)
como la suma de sus líneas con `fechaContable` en `[fechaDesde, fechaHasta]`,
`estado IN (CONTABILIZADO, BLOQUEADO)` y filtro de anulados según toggle,
aplicando la fórmula de naturaleza:

<!-- NCB: cuentas de ingreso son ACREEDORAS; cuentas de egreso son DEUDORAS. -->
- **ACREEDORA** (INGRESO): `saldoFlujo = Σ creditoBob − Σ debitoBob`
- **DEUDORA** (EGRESO): `saldoFlujo = Σ debitoBob − Σ creditoBob`

El campo `esContraria` NO modifica esta fórmula base; solo interviene en la
propagación jerárquica (REQ-ER-06).

#### Escenario: saldo flujo cuenta ACREEDORA (Ingreso Operativo)

- DADO la cuenta `4.1.01 Ventas` con `naturaleza=ACREEDORA`
- Y movimientos en el rango: haber Bs 20000, debe Bs 500 (devoluciones en misma cuenta)
- CUANDO se consulta el Estado de Resultados
- ENTONCES el saldo de flujo de `4.1.01` es `"19500.00"` (20000 − 500)

#### Escenario: saldo flujo cuenta DEUDORA (Egreso Operativo)

- DADO la cuenta `5.1.01 Costo de Ventas` con `naturaleza=DEUDORA`
- Y movimientos en el rango: debe Bs 12000, haber Bs 0
- CUANDO se consulta el Estado de Resultados
- ENTONCES el saldo de flujo de `5.1.01` es `"12000.00"`

---

### REQ-ER-06: Propagación jerárquica — hoja a agrupador con esContraria

El sistema DEBE propagar los saldos de flujo de cuentas hoja (`esDetalle=true`)
hacia agrupadores (`esDetalle=false`) recorriendo `parentId`/`nivel` en memoria.

Reglas de propagación:

1. Solo cuentas hoja aportan saldo de flujo real.
2. Saldo de agrupador = `Σ saldos hijos normales − Σ saldos hijos con esContraria=true`.
3. Propagación recursiva: agrupador de nivel N suma sus hijos directos, que a su
   vez pueden ser agrupadores con saldo ya propagado.
4. No doble conteo: un agrupador NO suma el saldo propagado de un descendiente Y
   también el saldo directo de las hojas de ese descendiente.

#### Escenario: propagación de 3 niveles — Ingreso Operativo

- DADO el árbol:
  - `4` (INGRESO, nivel 1, agrupador)
    - `4.1` (INGRESO_OPERATIVO, nivel 2, agrupador)
      - `4.1.01` Ventas (hoja, saldo flujo Bs 20000)
      - `4.1.02` Servicios (hoja, saldo flujo Bs 5000)
- CUANDO se consulta el Estado de Resultados
- ENTONCES `4.1` tiene saldo Bs 25000 (20000 + 5000)
- Y `4` tiene saldo Bs 25000

#### Escenario: cuenta contraria de Ingreso — devolución resta (CRÍTICO)

- DADO el árbol:
  - `4.1` (INGRESO_OPERATIVO, agrupador)
    - `4.1.01` Ventas (hoja, saldo flujo Bs 30000)
    - `4.1.02` Devoluciones sobre Ventas (hoja, `esContraria=true`, saldo flujo Bs 2000)
- CUANDO se consulta el Estado de Resultados
- ENTONCES `4.1` tiene saldo Bs 28000 (30000 − 2000)
- Y la cuenta `4.1.02` aparece marcada con `esContraria=true` en el detalle

#### Escenario: sin cuentas contrarias — propagación normal

- DADO un grupo EGRESO sin ninguna cuenta `esContraria=true`
- CUANDO se consulta el Estado de Resultados
- ENTONCES todos los saldos hoja se suman normalmente

---

### REQ-ER-07: Omisión de cuentas hoja con saldo de flujo 0

Las cuentas **hoja** con saldo de flujo 0 en el rango DEBEN omitirse del reporte.
Los **agrupadores** se preservan mientras tengan al menos un descendiente con
saldo de flujo ≠ 0. Un agrupador sin ningún descendiente con saldo ≠ 0 DEBE omitirse.

#### Escenario: cuenta hoja sin movimientos en el rango — omitida

- DADO la cuenta `5.2.01 Depreciación` con saldo de flujo 0 en el rango consultado
- CUANDO se consulta el Estado de Resultados
- ENTONCES `5.2.01` no aparece en el reporte

#### Escenario: agrupador con todos los hijos en 0 — omitido

- DADO el grupo `5.3 Gastos Financieros` cuyas únicas hojas tienen saldo de flujo 0
- CUANDO se consulta el Estado de Resultados
- ENTONCES `5.3` tampoco aparece en el reporte

---

### REQ-ER-08: Resultado del Ejercicio — fórmula y coincidencia con Balance

El sistema DEBE calcular el **Resultado del Ejercicio** como:

```
ResultadoEjercicio = Σ saldoFlujo(cuentas INGRESO en [desde, hasta])
                   − Σ saldoFlujo(cuentas EGRESO en [desde, hasta])
```

El valor PUEDE ser negativo (pérdida del período). Se expone en la raíz del DTO.

El `EstadoResultadosService` DEBE usar el mismo `BalanceReaderPort.obtenerSaldosEnRango`
que el `BalanceService` para calcular estos saldos — garantizando que el
Resultado del Ejercicio del Estado de Resultados y el del Balance General
(REQ-BG-09) coincidan para el mismo rango, por construcción.

<!-- NCB: el Resultado del Ejercicio debe cuadrar entre el Estado de Resultados -->
<!-- y el Balance General. Al compartir el port, la coincidencia es estructural. -->

#### Escenario: Resultado del Ejercicio positivo (utilidad)

- DADO un rango mayo 2026 con:
  - Σ Ingresos en el rango: Bs 50000
  - Σ Egresos en el rango: Bs 35000
- CUANDO se consulta el Estado de Resultados
- ENTONCES `resultadoEjercicioBob: "15000.00"`

#### Escenario: Resultado del Ejercicio negativo (pérdida)

- DADO ingresos Bs 20000 y egresos Bs 30000 en el rango
- CUANDO se consulta el Estado de Resultados
- ENTONCES `resultadoEjercicioBob: "-10000.00"`

#### Escenario: coincidencia Balance vs Estado de Resultados (CRÍTICO)

- DADO un tenant con ingresos y egresos en una gestión
- CUANDO se consulta el Balance General con `fecha=<fin de la gestión>` (rango = gestión completa)
- Y se consulta el Estado de Resultados con el mismo rango de la gestión
- ENTONCES `balanceResponse.resultadoEjercicioBob === estadoResultadosResponse.resultadoEjercicioBob`
- Y ambas cifras son exactamente iguales (mismo port, misma fuente de verdad)

---

### REQ-ER-09: Estructura del reporte — árbol Ingreso/Egreso por subclase

La respuesta DEBE devolver el estado de resultados como un árbol con dos secciones
de primer nivel: `ingreso` y `egreso`. Cada sección DEBE dividirse en subsecciones
según `subClaseCuenta` del plan de cuentas:

- **Ingreso**: `INGRESO_OPERATIVO` | `INGRESO_NO_OPERATIVO`
- **Egreso**: `EGRESO_OPERATIVO` | `EGRESO_ADMINISTRATIVO` | `EGRESO_COMERCIALIZACION` | `EGRESO_FINANCIERO` | `EGRESO_NO_OPERATIVO`

El orden dentro de cada nivel DEBE ser por `codigoInterno` ASC.
Solo aparecen subsecciones con al menos un descendiente con saldo ≠ 0.

#### Escenario: estructura de dos secciones con subsecciones

- DADO un tenant con cuentas INGRESO_OPERATIVO y EGRESO_OPERATIVO con saldo ≠ 0
- CUANDO se consulta el Estado de Resultados
- ENTONCES la respuesta contiene `ingreso` y `egreso` como claves raíz
- Y `ingreso.subsecciones` contiene al menos una subsección `INGRESO_OPERATIVO`
- Y `egreso.subsecciones` contiene al menos una subsección `EGRESO_OPERATIVO`

---

### REQ-ER-10: Multi-tenant — aislamiento estricto (CRÍTICO)

El sistema DEBE filtrar todos los movimientos y estructura de cuentas por el
`organizationId` del JWT activo (§4.2 CLAUDE.md). El adapter Prisma DEBE incluir
`organizationId` como predicado explícito en todas las queries, sin excepción.

<!-- Anti-31 (CLAUDE.md): query sin filtro de tenantId es bug de seguridad. -->

#### Escenario: dos tenants en el mismo rango — sin fuga (CRÍTICO)

- DADO que Tenant A tiene Ingresos Bs 100000 y Tenant B tiene Ingresos Bs 300000
  en el mismo rango `[2026-05-01, 2026-05-31]`
- CUANDO el usuario del Tenant A consulta el Estado de Resultados para ese rango
- ENTONCES `ingreso.totalBob` refleja solo los datos del Tenant A (`"100000.00"`)
- Y ningún saldo, cuenta ni agrupador del Tenant B aparece en la respuesta

#### Escenario: tenant sin comprobantes en el rango — resultado cero, no error

- DADO un tenant recién creado sin ningún comprobante
- CUANDO consulta el Estado de Resultados
- ENTONCES la respuesta es HTTP 200 con `ingreso.totalBob: "0.00"`,
  `egreso.totalBob: "0.00"`, `resultadoEjercicioBob: "0.00"`

---

### REQ-ER-11: RBAC — permiso requerido

El sistema DEBE proteger `GET /api/eeff/resultados` con el permiso
`contabilidad.eeff.read`. Un usuario sin ese permiso DEBE recibir HTTP 403.

#### Escenario: sin permiso — 403

- DADO un usuario autenticado sin el permiso `contabilidad.eeff.read`
- CUANDO consulta `GET /api/eeff/resultados?fechaDesde=2026-05-01&fechaHasta=2026-05-31`
- ENTONCES el sistema responde HTTP 403

#### Escenario: sin autenticación — 401

- CUANDO se consulta el endpoint sin JWT
- ENTONCES el sistema responde HTTP 401

---

### REQ-ER-12: Forma del DTO de respuesta

La respuesta DEBE cumplir esta forma exacta (montos `string`, fechas `"YYYY-MM-DD"`):

```typescript
{
  fechaDesde: string,                  // "YYYY-MM-DD" — inicio del rango
  fechaHasta: string,                  // "YYYY-MM-DD" — fin del rango

  ingreso: {
    claseCuenta: "INGRESO",
    titulo: string,
    totalBob: string,
    subsecciones: [
      {
        subClaseCuenta: "INGRESO_OPERATIVO" | "INGRESO_NO_OPERATIVO",
        titulo: string,
        totalBob: string,
        cuentas: [
          {
            cuentaId: string,
            codigoInterno: string,
            nombre: string,
            nivel: number,
            esContraria: boolean,
            saldoBob: string              // monto neto de flujo en BOB
          }
        ]
      }
    ]
  },

  egreso: {
    claseCuenta: "EGRESO",
    titulo: string,
    totalBob: string,
    subsecciones: [
      {
        subClaseCuenta: "EGRESO_OPERATIVO" | "EGRESO_ADMINISTRATIVO"
                      | "EGRESO_COMERCIALIZACION" | "EGRESO_FINANCIERO"
                      | "EGRESO_NO_OPERATIVO",
        titulo: string,
        totalBob: string,
        cuentas: [                        // misma forma que ingreso.cuentas
          { cuentaId, codigoInterno, nombre, nivel, esContraria, saldoBob }
        ]
      }
    ]
  },

  resultadoEjercicioBob: string,         // Σ INGRESO − Σ EGRESO; puede ser negativo
  totalIngresoBob: string,               // atajo = ingreso.totalBob
  totalEgresoBob: string                 // atajo = egreso.totalBob
}
```

> No incluye `generadoEn` — `new Date()` prohibido en dominio/service (§4.6).

#### Escenario: montos serializados como string

- DADO un Estado de Resultados con saldo de ingreso Bs 1.250,50
- CUANDO se consulta
- ENTONCES todos los campos `saldoBob`, `totalBob`, `totalIngresoBob`,
  `totalEgresoBob`, `resultadoEjercicioBob` en la respuesta JSON
  son strings como `"1250.50"`, nunca números como `1250.5`

#### Escenario: fechas de rango en la respuesta

- CUANDO se consulta con `fechaDesde=2026-05-01&fechaHasta=2026-05-31`
- ENTONCES `fechaDesde: "2026-05-01"` y `fechaHasta: "2026-05-31"` aparecen en la raíz

---

## Código de errores

| Código | HTTP | Descripción |
|--------|------|-------------|
| `REPORTES_RESULTADOS_RANGO_INVALIDO` | 400 | Ningún parámetro de rango, o rango mal formado (`fechaDesde > fechaHasta`, formato inválido) |
| `REPORTES_RESULTADOS_SIN_PERIODO` | 422 | `periodoFiscalId` no existe para el tenant |
| `REPORTES_RESULTADOS_SIN_GESTION` | 422 | `gestionId` no existe para el tenant |

---

## Notas regulatorias

- El Estado de Resultados (Estado de Ganancias y Pérdidas) es un estado financiero
  obligatorio según las NCB y el Código de Comercio de Bolivia (art. 36).
- El reporte es de **flujo del período**, no de saldo histórico. NCB y NIC 1
  exigen presentarlo para el período (mes, trimestre, gestión), sin arrastre.
- Los saldos se expresan en BOB (§4.5). `debitoBob`/`creditoBob` ya están en BOB.
- Las fechas son `FechaContable` (calendario puro, §4.6). Sin UTC, sin hora.
- El Resultado del Ejercicio del Estado de Resultados coincide con el del Balance
  General porque ambos usan `BalanceReaderPort.obtenerSaldosEnRango` — misma
  fuente de verdad, garantía contable fundamental (NCB, Código Tributario art. 47).
