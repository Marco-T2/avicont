# Balance de Comprobación de Sumas y Saldos — Especificación

<!--
Última edición: 2026-06-15 (frontend agregado — PR #201)
Última revisión contra core: 2026-06-15
Owner: backend-lead
-->

> Fecha: 2026-06-15
> Fase: spec canónica
> Proyecto: avicont
> Capability: `balance-comprobacion`

---

## Propósito

Reporte de control **Balance de Comprobación de Sumas y Saldos**: lista plana tabular
de las cuentas de **detalle** con movimiento en un rango `[desde, hasta]`, mostrando
cuatro columnas por cuenta — `sumasDebito`, `sumasCredito`, `saldoDeudor`, `saldoAcreedor`
— más totales de cada columna e invariantes de cuadre. Expone el endpoint
`GET /api/eeff/balance-comprobacion`.

El reporte es de **flujo del rango**: NO arrastra saldo inicial de gestiones previas.
Es el reporte que el contador boliviano usa para verificar la integridad de la
partida doble antes de emitir los EEFF, y para detectar cuentas con saldo de
naturaleza opuesta (anticipos no reclasificados, errores de carga).

Se ubica en el módulo `backend/src/reportes/` y reutiliza `EeffSaldosReaderPort`
(sin cambios al port) y `PeriodosReaderPort` ya existentes.

---

## Glosario

- **Cuenta de detalle**: `esDetalle=true` — cuenta imputable, tiene movimientos reales.
- **Cuenta agrupadora**: `esDetalle=false` — no aparece en el reporte.
- **Sumas Débito / Sumas Crédito**: suma de `debitoBob` / `creditoBob` de las líneas
  de la cuenta con `fechaContable` en `[desde, hasta]`, estados
  `IN (CONTABILIZADO, BLOQUEADO)`.
- **Saldo Deudor**: `MAX(sumasDebito − sumasCredito, 0)`.
- **Saldo Acreedor**: `MAX(sumasCredito − sumasDebito, 0)`.
- **Cuadre**: `SUM(saldosDeudores) ≈ SUM(saldosAcreedores)` Y
  `SUM(sumasDebito) ≈ SUM(sumasCredito)`, tolerancia `±Bs 0.01` (§4.1 CLAUDE.md).
- **Cuentas de naturaleza opuesta**: cuentas cuyo saldo cayó del lado opuesto a su
  `naturaleza` (DEUDORA con saldoAcreedor > 0, o ACREEDORA con saldoDeudor > 0).
  Señal de calidad para el contador; no afecta totales.
- **Monto string**: todo importe viaja como `string` decimal (`"1000.00"`), nunca
  `number` (§4.5 CLAUDE.md).
- **FechaContable**: fecha calendario puro `"YYYY-MM-DD"`, sin hora ni UTC (§4.6 CLAUDE.md).

---

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

### REQ-BC-01 — Endpoint y rango por dos modos mutuamente excluyentes

El sistema DEBE exponer `GET /api/eeff/balance-comprobacion` que acepta el rango
del reporte en exactamente UNO de dos modos:
- Modo rango: `fechaDesde` + `fechaHasta`, ambos `YYYY-MM-DD`.
- Modo período: `periodoFiscalId` (UUID v4), del cual deriva `[desde, hasta]`
  como el mes completo del período.

Además acepta `incluirAnulados?` (boolean, default `false`).

#### Escenario: rango directo válido

- DADO un tenant con comprobantes CONTABILIZADO en abril 2026
- CUANDO consulta `?fechaDesde=2026-04-01&fechaHasta=2026-04-30`
- ENTONCES responde 200 con las filas del rango y `fechaDesde="2026-04-01"`,
  `fechaHasta="2026-04-30"`.

#### Escenario: por periodoFiscalId

- DADO un período fiscal de abril 2026 con id `P`
- CUANDO consulta `?periodoFiscalId=P`
- ENTONCES el service resuelve el rango `[2026-04-01, 2026-04-30]` vía
  `PeriodosReaderPort.obtenerRangoFechas` y responde 200.

#### Escenario: se pasan ambos modos a la vez

- CUANDO consulta con `fechaDesde`/`fechaHasta` Y `periodoFiscalId` simultáneamente
- ENTONCES responde 422 con código `REPORTES_BALANCE_COMPROBACION_RANGO_AMBIGUO`.

#### Escenario: no se pasa ningún modo

- CUANDO consulta sin `fechaDesde`/`fechaHasta` ni `periodoFiscalId`
- ENTONCES responde 422 con código `REPORTES_BALANCE_COMPROBACION_RANGO_REQUERIDO`.

---

### REQ-BC-02 — Validación de fechas

El sistema DEBE validar el rango antes de leer saldos.

#### Escenario: formato inválido

- CUANDO `fechaDesde=2026-13-40` (formato/fecha imposible)
- ENTONCES 422 con código `REPORTES_BALANCE_COMPROBACION_RANGO_INVALIDO`.

#### Escenario: desde > hasta

- CUANDO `fechaDesde=2026-04-30&fechaHasta=2026-04-01`
- ENTONCES 422 con código `REPORTES_BALANCE_COMPROBACION_RANGO_INVALIDO`.

#### Escenario: solo una de las dos fechas del modo rango

- CUANDO `fechaDesde=2026-04-01` sin `fechaHasta` (modo rango incompleto)
- ENTONCES 422 con código `REPORTES_BALANCE_COMPROBACION_RANGO_INVALIDO`.

#### Escenario: periodoFiscalId inexistente o de otro tenant

- CUANDO `periodoFiscalId` no existe o pertenece a otro tenant
- ENTONCES 422 con código `REPORTES_BALANCE_COMPROBACION_PERIODO_NO_ENCONTRADO`
  (no distingue inexistente de ajeno — defense in depth §4.2).

---

### REQ-BC-03 — Cuatro columnas por cuenta de detalle

Por cada cuenta con `esDetalle = true` y movimiento en el rango, el sistema DEBE
calcular:
- `sumasDebito` = Σ débitos BOB del rango (de `obtenerSaldosEnRango`).
- `sumasCredito` = Σ créditos BOB del rango.
- `saldoDeudor` = `MAX(sumasDebito − sumasCredito, 0)`.
- `saldoAcreedor` = `MAX(sumasCredito − sumasDebito, 0)`.

`saldoDeudor` y `saldoAcreedor` son mutuamente excluyentes: a lo sumo uno es > 0.
NO depende de la naturaleza de la cuenta (es la mecánica universal del Balance de
Comprobación de Sumas y Saldos).

#### Escenario: cuenta con débito mayor que crédito

- DADO una cuenta con `sumasDebito=1000.00`, `sumasCredito=300.00`
- ENTONCES `saldoDeudor=700.00` y `saldoAcreedor=0.00`.

#### Escenario: cuenta con crédito mayor que débito

- DADO una cuenta con `sumasDebito=200.00`, `sumasCredito=900.00`
- ENTONCES `saldoDeudor=0.00` y `saldoAcreedor=700.00`.

#### Escenario: cuenta con débito igual a crédito (saldo cero pero con movimiento)

- DADO una cuenta con `sumasDebito=500.00`, `sumasCredito=500.00`
- ENTONCES aparece en el reporte (tiene movimiento) con
  `saldoDeudor=0.00` y `saldoAcreedor=0.00`.

---

### REQ-BC-04 — Solo cuentas de detalle con movimiento

El sistema DEBE incluir SOLO las cuentas que cumplen `esDetalle = true` Y
(`sumasDebito > 0` O `sumasCredito > 0`). Las cuentas agrupadoras NO aparecen
como filas (no son cuentas de movimiento). Las cuentas de detalle sin movimiento
en el rango se OMITEN.

#### Escenario: cuenta de detalle sin movimiento omitida

- DADO una cuenta de detalle activa sin líneas en el rango
- ENTONCES NO aparece en `lineas`.

#### Escenario: cuenta agrupadora omitida

- DADO una cuenta agrupadora (`esDetalle=false`) con descendientes con
  movimiento
- ENTONCES la agrupadora NO aparece como fila (solo aparecen sus hojas de
  detalle).

---

### REQ-BC-05 — Orden de las líneas

El sistema DEBE ordenar las líneas por `codigoInterno` ASC (`localeCompare`).

#### Escenario: orden por código

- DADO cuentas `1101`, `1102`, `4101` con movimiento
- ENTONCES las filas salen en orden `1101`, `1102`, `4101`.

---

### REQ-BC-06 — Totales de las cuatro columnas e invariantes de cuadre

El sistema DEBE devolver los totales `totalSumasDebito`, `totalSumasCredito`,
`totalSaldoDeudor`, `totalSaldoAcreedor` (suma de cada columna sobre las filas
incluidas) más:
- `cuadra: boolean` = (`totalSumasDebito ≈ totalSumasCredito`) Y
  (`totalSaldoDeudor ≈ totalSaldoAcreedor`), tolerancia ±Bs 0.01 (§4.1 CLAUDE.md).
- `diferenciaSumas` = `totalSumasDebito − totalSumasCredito` (string, puede ser
  negativo).
- `diferenciaSaldos` = `totalSaldoDeudor − totalSaldoAcreedor` (string).

#### Escenario: reporte cuadrado

- DADO comprobantes que respetan la partida doble
- ENTONCES `cuadra=true`, `diferenciaSumas="0.00"`, `diferenciaSaldos="0.00"`
  y `totalSumasDebito === totalSumasCredito` (±0.01).

#### Escenario: descuadre detectado

- DADO una fuente de saldos donde Σ débito ≠ Σ crédito (datos corruptos)
- ENTONCES `cuadra=false` y `diferenciaSumas` refleja la diferencia exacta.
  El reporte NO falla — reporta el descuadre como señal de control.

---

### REQ-BC-07 — Cuentas de naturaleza opuesta

El sistema DEBE devolver `cuentasNaturalezaOpuesta`: lista de las cuentas cuyo
saldo cayó del lado OPUESTO a su `naturaleza`:
- Cuenta `DEUDORA` con `saldoAcreedor > 0`.
- Cuenta `ACREEDORA` con `saldoDeudor > 0`.

Es una señal de calidad para el contador (anticipos no reclasificados, errores
de carga). NO afecta los totales ni el cuadre. Se computa en el dominio puro.

#### Escenario: cuenta deudora con saldo acreedor

- DADO una cuenta `naturaleza=DEUDORA` con `saldoAcreedor=150.00`
- ENTONCES aparece en `cuentasNaturalezaOpuesta` con su código, nombre,
  naturaleza y el saldo del lado opuesto; los totales NO cambian por ello.

#### Escenario: todas las cuentas con saldo de su naturaleza

- DADO todas las cuentas con saldo del lado esperado
- ENTONCES `cuentasNaturalezaOpuesta` es `[]`.

---

### REQ-BC-08 — Anulados excluidos por default

El sistema DEBE excluir comprobantes con `anulado=true` salvo que
`incluirAnulados=true` (§4.7 CLAUDE.md). BORRADOR nunca se incluye (lo garantiza
el port — §4.1).

#### Escenario: anulado excluido por default

- DADO un comprobante anulado en el rango
- CUANDO consulta sin `incluirAnulados`
- ENTONCES sus líneas NO suman a ninguna columna.

#### Escenario: anulado incluido con toggle

- CUANDO consulta con `incluirAnulados=true`
- ENTONCES las líneas del anulado sí suman.

---

### REQ-BC-09 — Multi-tenant aislado (CRÍTICO)

El sistema DEBE computar el reporte solo con datos del tenant del JWT activo. El
`tenantId` se resuelve del JWT y es el primer predicado de toda lectura (§4.2
CLAUDE.md, Anti-31).

#### Escenario: aislamiento entre tenants

- DADO dos tenants A y B con comprobantes en el mismo rango
- CUANDO un usuario de A consulta el reporte
- ENTONCES ninguna fila ni total incluye montos de B.

---

### REQ-BC-10 — RBAC y módulo

El endpoint DEBE exigir el permiso `contabilidad.eeff.read` y el módulo
`contabilidad` habilitado (`@RequireModule('contabilidad')`).

#### Escenario: sin permiso

- DADO un usuario sin `contabilidad.eeff.read`
- ENTONCES responde 403.

#### Escenario: módulo contabilidad deshabilitado

- DADO un tenant con el módulo contabilidad deshabilitado
- ENTONCES responde 403 (ModuleEnabledGuard).

---

### REQ-BC-11 — Serialización de montos y fechas

El sistema DEBE serializar todos los montos como `string` decimal con 2 lugares
("700.00", §4.5 CLAUDE.md) y las fechas como `"YYYY-MM-DD"` (§4.6 CLAUDE.md).

#### Escenario: tipos de la respuesta

- ENTONCES `sumasDebito`, `sumasCredito`, `saldoDeudor`, `saldoAcreedor`,
  totales y diferencias son strings; `fechaDesde`/`fechaHasta` son
  `"YYYY-MM-DD"`; `cuadra` es boolean.

---

### REQ-BC-12 — Sin plan de cuentas o sin movimiento → reporte vacío cuadrado

El sistema DEBE devolver un reporte válido (no error) cuando no hay cuentas con
movimiento en el rango.

#### Escenario: rango sin movimiento

- DADO un rango donde ninguna cuenta tiene líneas
- ENTONCES `lineas=[]`, todos los totales `"0.00"`, `cuadra=true`,
  `cuentasNaturalezaOpuesta=[]`.

---

### REQ-BC-13 — Robustez ante saldo sin cuenta o cuenta sin estructura

El sistema DEBE tolerar inconsistencias entre las dos fuentes de lectura:
- Una fila de saldo cuyo `cuentaId` no está en la estructura (cuenta inactiva o
  borrada) se IGNORA (no se puede clasificar ni mostrar nombre/naturaleza).
- Una cuenta de la estructura sin fila de saldo no aparece (sin movimiento,
  REQ-BC-04).

#### Escenario: saldo de cuenta ausente en estructura

- DADO una fila de saldo con `cuentaId` que no existe en la estructura activa
- ENTONCES esa fila se omite del reporte sin lanzar error y no afecta totales.

---

## Forma del DTO de respuesta

La respuesta cumple esta forma exacta (montos `string`, fechas `"YYYY-MM-DD"`).
El shape es una **lista plana** de cuentas de detalle con movimiento (no árbol
jerárquico — el cuadre es de período, no de balance permanente).

```typescript
{
  fechaDesde: string,               // "YYYY-MM-DD" — inicio del rango
  fechaHasta: string,               // "YYYY-MM-DD" — fin del rango

  lineas: [
    {
      cuentaId: string,
      codigoInterno: string,
      nombre: string,
      naturaleza: "DEUDORA" | "ACREEDORA",
      sumasDebito: string,          // "1000.00"
      sumasCredito: string,
      saldoDeudor: string,          // MAX(sumasDebito - sumasCredito, 0)
      saldoAcreedor: string         // MAX(sumasCredito - sumasDebito, 0)
    }
  ],

  totalSumasDebito: string,
  totalSumasCredito: string,
  totalSaldoDeudor: string,
  totalSaldoAcreedor: string,

  cuadra: boolean,                  // ambas diferencias ≤ Bs 0.01 (§4.1)
  diferenciaSumas: string,          // totalSumasDebito - totalSumasCredito
  diferenciaSaldos: string,         // totalSaldoDeudor - totalSaldoAcreedor

  cuentasNaturalezaOpuesta: [
    {
      cuentaId: string,
      codigoInterno: string,
      nombre: string,
      naturaleza: "DEUDORA" | "ACREEDORA",
      saldoOpuesto: string          // el lado contrario a su naturaleza
    }
  ]
}
```

---

## Códigos de error

| Código | HTTP | Descripción |
|--------|------|-------------|
| `REPORTES_BALANCE_COMPROBACION_RANGO_REQUERIDO` | 422 | No se proporcionó ningún modo de rango |
| `REPORTES_BALANCE_COMPROBACION_RANGO_AMBIGUO` | 422 | Se proporcionaron ambos modos simultáneamente |
| `REPORTES_BALANCE_COMPROBACION_RANGO_INVALIDO` | 422 | Fecha con formato inválido, `desde > hasta`, o modo rango incompleto |
| `REPORTES_BALANCE_COMPROBACION_PERIODO_NO_ENCONTRADO` | 422 | `periodoFiscalId` inexistente o de otro tenant |

---

## Notas de implementación

- **Sin migración**: el reporte se computa sobre datos existentes, reusando
  `EeffSaldosReaderPort.obtenerSaldosEnRango` + `obtenerEstructuraCuentas`.
  CERO cambios al port, CERO adapter nuevo.
- **Flujo puro del rango**: usa `obtenerSaldosEnRango`, NUNCA `obtenerSaldosHasta`
  (sin arrastre de saldo inicial).
- **Builder de dominio puro** (`domain/balance-comprobacion.ts`): función pura sin
  NestJS/Prisma. Cobertura ≥95% (§7.5 CLAUDE.md).
- **Cuadre con `Money.balanceadoEnBobCon`**: tolerancia ±Bs 0.01 ya implementada
  en el value object `Money`; se reutiliza sin reimplementar.
- **Frontend** (PR #201, 2026-06-15): feature `frontend/src/features/balance-comprobacion/`
  — filtro período XOR rango (clon de Libro Mayor, calza con los 2 modos del
  endpoint) + toggle incluir anulados; tabla plana de 7 columnas con totales,
  indicador de cuadre y sección destacada de `cuentasNaturalezaOpuesta`; export a
  Excel vía `lib/export-excel` (cabecera fiscal, §4.5 monto string→celda numérica,
  estilos), gateado por `contabilidad.eeff.read`. Ruta `/eeff/balance-comprobacion`
  + ítem de sidebar en Contabilidad. Frontend-puro, sin backend ni migración.

## Notas regulatorias

- El Balance de Comprobación de Sumas y Saldos verifica el invariante fundamental
  de la partida doble (Código Tributario art. 47): `Σ débitos = Σ créditos`.
- `SUM(saldosDeudores) = SUM(saldosAcreedores)` es consecuencia directa de la
  partida doble y es el control que el contador boliviano aplica mensualmente.
- Los montos se expresan en BOB (moneda funcional, §4.5 CLAUDE.md).
- Las fechas son `FechaContable` (calendario puro, §4.6 CLAUDE.md).
