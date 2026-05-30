# Libro Mayor — Especificación

> Fecha: 2026-05-30
> Fase: spec
> Proyecto: avicont
> Capability nueva: `libro-mayor` (no existe spec previa en `openspec/specs/`)

---

## Propósito

Consulta del Libro Mayor contable: vista por CUENTA de todos los movimientos de
una o todas las cuentas de detalle en un rango de fechas, con saldo inicial
(acarreo histórico), saldo corriente acumulado movimiento a movimiento y saldo
final, para un único tenant. Segundo reporte del módulo `reportes/`; complementa
el Libro Diario (PR #61, vista por fecha).

El Mayor introduce lógica de cálculo nueva en el codebase: saldo inicial = suma
histórica de movimientos anteriores al rango, saldo corriente acumulado con signo
determinado por la `naturaleza` de la cuenta (DEUDORA / ACREEDORA). La UI queda
diferida a un change posterior; este change es backend-first.

---

## Glosario

- **Mayor de una cuenta**: todos los movimientos (líneas de comprobantes) de una cuenta de detalle en un rango, con su saldo inicial y saldo corriente acumulado.
- **Saldo inicial**: suma histórica de movimientos con `fechaContable < fechaDesde`, estado IN (CONTABILIZADO, BLOQUEADO), `anulado=false`, aplicando el signo de la naturaleza. Empresa sin historial previo → 0.
- **Saldo corriente**: acumulado tras cada movimiento: DEUDORA `+= debeBob − haberBob`; ACREEDORA `+= haberBob − debeBob`. Partiendo del saldo inicial.
- **Saldo final**: saldo inicial ± suma de todos los movimientos del rango (misma fórmula). Debe coincidir con el saldo corriente del último movimiento.
- **Naturaleza DEUDORA**: cuenta que aumenta con DEBE (Activos, Egresos).
- **Naturaleza ACREEDORA**: cuenta que aumenta con HABER (Pasivos, Patrimonio, Ingresos).
- **esContraria**: flag de cuenta (ej. Depreciación Acumulada). NO afecta el cálculo del Mayor; el Mayor usa `naturaleza` directamente. Solo relevante para el Balance General.
- **Rango activo**: `periodoFiscalId` O la dupla `fechaDesde`+`fechaHasta` (nunca ambos, nunca ninguno).
- **Monto string**: todo importe viaja como `string` decimal (`"1250.50"`), nunca `number` (§4.5 CLAUDE.md).
- **FechaContable**: fecha calendario puro `"YYYY-MM-DD"`, sin hora ni UTC (§4.6 CLAUDE.md).
- **soloConMovimiento**: si `true` (default), incluye solo cuentas con al menos un movimiento en el rango. Si `false`, incluye también cuentas con saldo inicial pero sin movimientos en el rango.

---

## Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

---

### REQ-LM-01: Filtro de rango — exclusividad

El sistema DEBE aceptar exactamente una de estas dos formas de rango:
(a) `periodoFiscalId` (string, requerido solo) — resuelve internamente sus fechas.
(b) `fechaDesde` + `fechaHasta` (ambas requeridas juntas).

Si se reciben ambas formas simultáneamente, o si no se recibe ninguna, el sistema
DEBE rechazar la solicitud con HTTP 400 y código `REPORTES_LIBRO_MAYOR_FILTRO_INVALIDO`.
Si se recibe solo `fechaDesde` sin `fechaHasta` (o viceversa), ídem.

#### Escenario: solo periodoFiscalId — válido

- DADO que existe un período fiscal ABIERTO para el tenant activo con rango 2026-05-01 / 2026-05-31
- CUANDO se consulta `GET /api/libros/mayor?periodoFiscalId=<id>`
- ENTONCES el sistema responde 200 con movimientos cuya `fechaContable` cae en ese rango

#### Escenario: solo fechaDesde + fechaHasta — válido

- DADO un tenant con movimientos en mayo 2026
- CUANDO se consulta `GET /api/libros/mayor?fechaDesde=2026-05-01&fechaHasta=2026-05-31`
- ENTONCES el sistema responde 200 con los movimientos del rango

#### Escenario: ambas formas presentes — error

- CUANDO se envía `periodoFiscalId` junto con `fechaDesde` o `fechaHasta`
- ENTONCES el sistema responde HTTP 400 con `REPORTES_LIBRO_MAYOR_FILTRO_INVALIDO`

#### Escenario: ningún filtro de rango — error

- CUANDO se consulta sin `periodoFiscalId` ni `fechaDesde`/`fechaHasta`
- ENTONCES el sistema responde HTTP 400 con `REPORTES_LIBRO_MAYOR_FILTRO_INVALIDO`

#### Escenario: fechaDesde sin fechaHasta — error

- CUANDO se envía `fechaDesde` pero no `fechaHasta` (o viceversa)
- ENTONCES el sistema responde HTTP 400 con `REPORTES_LIBRO_MAYOR_FILTRO_INVALIDO`

---

### REQ-LM-02: Filtrado por estado — BORRADOR excluido siempre

El sistema DEBE incluir únicamente líneas de comprobantes con
`estado IN (CONTABILIZADO, BLOQUEADO)` al calcular el saldo inicial Y al listar
los movimientos del rango. El estado BORRADOR NUNCA DEBE aparecer ni contribuir a
ningún saldo, independientemente de cualquier parámetro.

#### Escenario: BORRADOR excluido de los movimientos del rango

- DADO un tenant con cuenta `1.1.01` con dos comprobantes en mayo 2026: uno BORRADOR (Bs 500) y uno CONTABILIZADO (Bs 300)
- CUANDO se consulta el Mayor para esa cuenta en mayo 2026
- ENTONCES `movimientos` contiene solo la línea del CONTABILIZADO; el BORRADOR no aparece y no afecta `totalDebeBob`, `totalHaberBob` ni `saldoFinalBob`

#### Escenario: BORRADOR excluido del saldo inicial

- DADO una cuenta con un comprobante BORRADOR en marzo 2026 y uno CONTABILIZADO en abril 2026, ambos antes del rango de consulta (mayo 2026)
- CUANDO se consulta el Mayor para esa cuenta en mayo 2026
- ENTONCES `saldoInicialBob` refleja solo el CONTABILIZADO de abril; el BORRADOR no contribuye al saldo

---

### REQ-LM-03: Anulados — excluidos por default, incluibles con toggle

Por default (`incluirAnulados` ausente o `false`), las líneas de comprobantes con
`anulado = true` NO DEBEN aparecer en los movimientos ni contribuir al saldo inicial.
Si `incluirAnulados=true`, el sistema DEBE incluirlos marcados con `"anulado": true`
en cada movimiento (§4.7 CLAUDE.md).

#### Escenario: anulados excluidos de movimientos por default

- DADO una cuenta con dos comprobantes CONTABILIZADOS en el rango: uno anulado (Bs 200 debe) y uno vigente (Bs 100 debe)
- CUANDO se consulta sin `incluirAnulados`
- ENTONCES `movimientos` contiene solo el vigente; `totalDebeBob = "100.00"`; el anulado no aparece

#### Escenario: anulados excluidos del saldo inicial por default

- DADO una cuenta con un comprobante CONTABILIZADO anulado antes del rango (Bs 500 debe) y uno vigente antes del rango (Bs 300 debe)
- CUANDO se consulta sin `incluirAnulados`
- ENTONCES `saldoInicialBob` es `"300.00"` (solo el vigente); el anulado no contribuye

#### Escenario: anulados incluidos con toggle

- DADO el mismo escenario anterior (anulado + vigente en el rango)
- CUANDO se consulta con `incluirAnulados=true`
- ENTONCES `movimientos` contiene ambos; el movimiento anulado tiene `"anulado": true`; `totalDebeBob = "300.00"`

---

### REQ-LM-04: Saldo inicial por naturaleza

El sistema DEBE calcular `saldoInicialBob` como la suma de TODAS las líneas de la
cuenta con `fechaContable < fechaDesde`, `estado IN (CONTABILIZADO, BLOQUEADO)` y
`anulado=false` (salvo que `incluirAnulados=true`), aplicando la fórmula de
naturaleza:

<!-- Regla de dominio: naturaleza de cuenta determina el signo del saldo. -->
<!-- Ley 843 y NCP bolivianas: cuentas de activo y egreso son DEUDORAS (aumentan con debe). -->
- **DEUDORA**: `saldoInicialBob = Σ debitoBob − Σ creditoBob`
- **ACREEDORA**: `saldoInicialBob = Σ creditoBob − Σ debitoBob`

Si no hay movimientos previos al rango, `saldoInicialBob DEBE ser "0.00"`.
El saldo inicial PUEDE ser negativo (ej. una cuenta DEUDORA con más créditos que
débitos en su historial — situación válida en ajustes y correcciones).

`TipoComprobante.APERTURA` NO recibe trato especial: el asiento de apertura es el
mecanismo de traspaso de saldos entre gestiones y ya está incluido en la suma
histórica. No se filtra ni pondera distinto.

#### Escenario: saldo inicial correcto — cuenta DEUDORA

- DADO una cuenta con `naturaleza = DEUDORA`
- Y movimientos previos al rango: línea debe Bs 1000, línea haber Bs 300 (ambos CONTABILIZADOS, no anulados)
- CUANDO se consulta el Mayor para un rango posterior
- ENTONCES `saldoInicialBob = "700.00"` (1000 − 300)

#### Escenario: saldo inicial correcto — cuenta ACREEDORA

- DADO una cuenta con `naturaleza = ACREEDORA`
- Y movimientos previos: línea haber Bs 800, línea debe Bs 200 (CONTABILIZADOS)
- CUANDO se consulta el Mayor
- ENTONCES `saldoInicialBob = "600.00"` (800 − 200)

#### Escenario: saldo inicial negativo — válido

- DADO una cuenta DEUDORA con más créditos que débitos en su historial (Bs 100 debe, Bs 400 haber)
- CUANDO se consulta el Mayor
- ENTONCES `saldoInicialBob = "-300.00"` (no es error; es un saldo deudor negativo)

#### Escenario: sin historial previo — saldo inicial cero

- DADO una cuenta sin ningún movimiento anterior al rango consultado
- CUANDO se consulta el Mayor
- ENTONCES `saldoInicialBob = "0.00"`

---

### REQ-LM-05: Saldo corriente (running balance) — determinismo y acumulación

El sistema DEBE calcular `saldoCorrienteBob` para cada movimiento como el
acumulado parcial desde el saldo inicial hasta ese movimiento inclusive. El orden
de acumulación DEBE ser determinístico:

1. `fechaContable` ASC
2. `numero` del comprobante ASC NULLS LAST (comprobante CONTABILIZADO siempre tiene número; BLOQUEADO puede tener null — ver §4.9 CLAUDE.md)
3. `orden` de la línea (`LineaComprobante.orden`) ASC como desempate final

La fórmula por movimiento aplica la misma naturaleza que el saldo inicial:
- **DEUDORA**: `saldoCorriente[i] = saldoCorriente[i-1] + debeBob[i] − haberBob[i]`
- **ACREEDORA**: `saldoCorriente[i] = saldoCorriente[i-1] + haberBob[i] − debeBob[i]`

donde `saldoCorriente[0]` parte del `saldoInicialBob`.

#### Escenario: acumulación correcta en ≥ 3 movimientos — cuenta DEUDORA

- DADO una cuenta DEUDORA con `saldoInicialBob = "500.00"` y tres movimientos en el rango (en ese orden):
  - mov1: debe Bs 200, haber Bs 0
  - mov2: debe Bs 0, haber Bs 100
  - mov3: debe Bs 50, haber Bs 0
- CUANDO se consulta el Mayor
- ENTONCES `movimientos[0].saldoCorrienteBob = "700.00"`, `movimientos[1].saldoCorrienteBob = "600.00"`, `movimientos[2].saldoCorrienteBob = "650.00"`

#### Escenario: determinismo por fecha y número

- DADO dos movimientos en la misma `fechaContable` con números D2605-000001 y D2605-000002
- CUANDO se consulta el Mayor
- ENTONCES el movimiento con número D2605-000001 aparece primero y su `saldoCorrienteBob` se calcula antes que el del D2605-000002

#### Escenario: acumulación correcta — cuenta ACREEDORA

- DADO una cuenta ACREEDORA con `saldoInicialBob = "1000.00"` y dos movimientos:
  - mov1: haber Bs 500, debe Bs 0
  - mov2: debe Bs 200, haber Bs 0
- CUANDO se consulta el Mayor
- ENTONCES `movimientos[0].saldoCorrienteBob = "1500.00"` y `movimientos[1].saldoCorrienteBob = "1300.00"`

---

### REQ-LM-06: Saldo final — consistencia con saldo inicial y movimientos

El sistema DEBE calcular `saldoFinalBob` como:
- **DEUDORA**: `saldoFinalBob = saldoInicialBob + totalDebeBob − totalHaberBob`
- **ACREEDORA**: `saldoFinalBob = saldoInicialBob + totalHaberBob − totalDebeBob`

`saldoFinalBob` DEBE coincidir con el `saldoCorrienteBob` del último movimiento del
rango. Si no hay movimientos en el rango, `saldoFinalBob DEBE igualar a saldoInicialBob`.

#### Escenario: saldo final consistente con movimientos — cierre aritmético

- DADO una cuenta DEUDORA con:
  - `saldoInicialBob = "500.00"`
  - movimientos del rango: debe Bs 300, haber Bs 100 (en dos líneas separadas)
- CUANDO se consulta el Mayor
- ENTONCES `totalDebeBob = "300.00"`, `totalHaberBob = "100.00"`, `saldoFinalBob = "700.00"` (500 + 300 − 100)
- Y el `saldoCorrienteBob` del último movimiento también es `"700.00"`

#### Escenario: sin movimientos en el rango — saldo final igual al inicial

- DADO una cuenta con `saldoInicialBob = "1200.00"` y ningún movimiento en el rango consultado
- CUANDO se consulta el Mayor
- ENTONCES `movimientos = []`, `totalDebeBob = "0.00"`, `totalHaberBob = "0.00"`, `saldoFinalBob = "1200.00"`

---

### REQ-LM-07: Cuenta agrupadora — error de negocio

Si se especifica `cuentaId` de una cuenta con `esDetalle = false` (cuenta
agrupadora / de nivel), el sistema DEBE rechazar la solicitud con HTTP 400 y código
`REPORTES_LIBRO_MAYOR_CUENTA_NO_DETALLE`. Las cuentas agrupadoras no tienen líneas
de movimiento directas y no pueden tener un Mayor calculado en esta versión.

#### Escenario: cuenta agrupadora rechazada

- DADO que existe la cuenta `1.1` con `esDetalle = false` (es la cabecera del grupo Caja y Bancos)
- CUANDO se consulta `GET /api/libros/mayor?cuentaId=<id-cuenta-agrupadora>&fechaDesde=...&fechaHasta=...`
- ENTONCES el sistema responde HTTP 400 con `REPORTES_LIBRO_MAYOR_CUENTA_NO_DETALLE`

#### Escenario: cuenta de detalle — válida

- DADO que existe la cuenta `1.1.01 Caja Bolivianos` con `esDetalle = true`
- CUANDO se consulta con su `cuentaId`
- ENTONCES el sistema responde 200 con el Mayor de esa cuenta

---

### REQ-LM-08: Sin cuentaId — todas las cuentas de detalle

Si no se especifica `cuentaId`, el sistema DEBE devolver el Mayor de todas las
cuentas de detalle (`esDetalle = true`) del tenant que cumplan la condición de
inclusión. Con `soloConMovimiento=true` (default) DEBE incluirse solo las cuentas
con al menos un movimiento en el rango. Con `soloConMovimiento=false` DEBE incluir
también las cuentas que, no teniendo movimientos en el rango, tienen `saldoInicialBob ≠ 0`.

Las cuentas DEBEN ordenarse por `codigoInterno` ASC en la respuesta.

#### Escenario: sin cuentaId con soloConMovimiento=true (default) — solo cuentas con movimiento

- DADO un tenant con 3 cuentas de detalle; dos tienen movimientos en el rango y una no
- CUANDO se consulta sin `cuentaId`
- ENTONCES la respuesta incluye exactamente las 2 cuentas con movimiento; la tercera no aparece

#### Escenario: sin cuentaId con soloConMovimiento=false — incluye cuentas con saldo previo

- DADO el mismo tenant; la tercera cuenta (sin movimientos en el rango) tiene `saldoInicialBob = "500.00"`
- CUANDO se consulta con `soloConMovimiento=false`
- ENTONCES la respuesta incluye las 3 cuentas; la tercera tiene `movimientos = []` y `saldoFinalBob = "500.00"`

#### Escenario: tenant sin ninguna cuenta con movimiento — respuesta vacía

- DADO un tenant sin comprobantes CONTABILIZADOS en el rango
- CUANDO se consulta sin `cuentaId`
- ENTONCES el sistema responde 200 con `cuentas: []` (no un error)

---

### REQ-LM-09: Multi-tenant — aislamiento estricto

El sistema DEBE filtrar todos los movimientos y cuentas por el `organizationId` del
JWT activo (§4.2 CLAUDE.md). El adapter Prisma DEBE filtrar SIEMPRE
`lc.organizationId = $tenant` en la query de líneas, sin excepción.

<!-- Anti-31 (CLAUDE.md): query sin filtro de tenantId es bug de seguridad. -->
<!-- Defense in depth: guard + service + adapter todos checan el organizationId. -->

Ningún movimiento, saldo ni cuenta de otro tenant DEBE aparecer en la respuesta,
aunque compartan el mismo rango de fechas o los mismos códigos de cuenta.

#### Escenario: dos tenants — sin fuga (CRÍTICO)

- DADO que el Tenant A y el Tenant B tienen ambos una cuenta `1.1.01` con movimientos en el mismo rango de fechas
- CUANDO el usuario del Tenant A consulta `GET /api/libros/mayor?fechaDesde=...&fechaHasta=...`
- ENTONCES la respuesta contiene solo movimientos con `organizationId` del Tenant A
- Y el `saldoInicialBob` del Tenant A no incluye movimientos del Tenant B

#### Escenario: tenant sin movimientos — respuesta vacía (no error)

- DADO un tenant sin comprobantes CONTABILIZADOS en el rango
- CUANDO consulta el Libro Mayor
- ENTONCES la respuesta retorna `cuentas: []` con HTTP 200

---

### REQ-LM-10: Forma del DTO de respuesta

La respuesta DEBE cumplir esta forma exacta (montos `string`, fechas `"YYYY-MM-DD"`):

```
{
  rango: {
    fechaDesde: string,              // "YYYY-MM-DD"
    fechaHasta: string               // "YYYY-MM-DD"
  },
  cuentas: [
    {
      cuentaId: string,              // UUID
      codigoInterno: string,         // ej. "1.1.01"
      nombreCuenta: string,          // ej. "Caja Bolivianos"
      naturaleza: "DEUDORA" | "ACREEDORA",
      saldoInicialBob: string,       // acarreo histórico < fechaDesde; "0.00" si sin historial
      totalDebeBob: string,          // Σ debe del rango
      totalHaberBob: string,         // Σ haber del rango
      saldoFinalBob: string,         // saldoInicial ± movimientos
      movimientos: [
        {
          fechaContable: string,     // "YYYY-MM-DD"
          numeroComprobante: string | null,
          glosa: string,             // glosa de la cabecera del comprobante
          glosaLinea: string | null, // glosa de la línea (puede ser null)
          debeBob: string,           // "0.00" si no aplica
          haberBob: string,          // "0.00" si no aplica
          saldoCorrienteBob: string, // acumulado tras este movimiento
          anulado: boolean
        }
      ]
    }
  ],
  generadoEn: string                 // ISO timestamp UTC
}
```

#### Escenario: montos serializados como string

- DADO una cuenta con una línea de Bs 1.250,50
- CUANDO se consulta el Libro Mayor
- ENTONCES los campos `debeBob`, `haberBob`, `saldoCorrienteBob`, `saldoInicialBob`, `saldoFinalBob` en la respuesta JSON son strings `"1250.50"`, no números `1250.5`

#### Escenario: glosaLinea null cuando la línea no tiene glosa propia

- DADO una línea de comprobante sin `glosa` en la línea (glosa solo en la cabecera)
- CUANDO se consulta el Mayor
- ENTONCES `glosaLinea` es `null` y `glosa` contiene la glosa del comprobante cabecera

---

### REQ-LM-11: RBAC — permiso requerido

El sistema DEBE proteger `GET /api/libros/mayor` con el permiso
`contabilidad.libro-mayor.read`. Un usuario sin ese permiso DEBE recibir HTTP 403.

#### Escenario: sin permiso — 403

- DADO un usuario autenticado sin el permiso `contabilidad.libro-mayor.read`
- CUANDO consulta `GET /api/libros/mayor`
- ENTONCES el sistema responde HTTP 403

#### Escenario: sin autenticación — 401

- CUANDO se consulta `GET /api/libros/mayor` sin JWT
- ENTONCES el sistema responde HTTP 401

---

### REQ-LM-12: Tope defensivo

Si el rango consultado (combinando todas las cuentas o la cuenta específica) implica
procesar más de **10.000 líneas** que cumplan los filtros (estado + anulados), el
sistema DEBE rechazar la solicitud con HTTP 422 y código
`REPORTES_LIBRO_MAYOR_RANGO_EXCEDIDO`. El límite DEBE ser inyectable (constante de
módulo / variable de entorno) para facilitar ajuste sin re-deploy. NO DEBE devolver
payload parcial silencioso.

El tope aplica sobre el total de líneas candidatas ANTES del agrupamiento por cuenta,
de modo que sea calculable sin procesar toda la data.

#### Escenario: rango excede el tope

- DADO un tenant con 10.001 líneas CONTABILIZADAS en el rango especificado
- CUANDO se consulta ese rango
- ENTONCES el sistema responde HTTP 422 con `REPORTES_LIBRO_MAYOR_RANGO_EXCEDIDO` y un mensaje legible en español

#### Escenario: rango dentro del tope — responde normalmente

- DADO un tenant con 500 líneas en el rango
- CUANDO se consulta
- ENTONCES el sistema responde 200 normalmente

---

### REQ-LM-13: Período fiscal — resolución y no encontrado

Si se usa `periodoFiscalId`, el sistema DEBE resolver las fechas del período y
verificar que pertenezca al tenant activo. Si el período no existe o pertenece a
otro tenant, DEBE responder HTTP 404 con `REPORTES_LIBRO_MAYOR_PERIODO_NO_ENCONTRADO`.

#### Escenario: periodoFiscalId de otro tenant — 404

- DADO un `periodoFiscalId` que pertenece al Tenant B
- CUANDO el usuario del Tenant A lo usa en la consulta
- ENTONCES el sistema responde HTTP 404 con `REPORTES_LIBRO_MAYOR_PERIODO_NO_ENCONTRADO`

#### Escenario: periodoFiscalId inexistente — 404

- CUANDO se usa un UUID que no corresponde a ningún período fiscal
- ENTONCES el sistema responde HTTP 404 con `REPORTES_LIBRO_MAYOR_PERIODO_NO_ENCONTRADO`

---

## Código de errores

| Código | HTTP | Descripción |
|--------|------|-------------|
| `REPORTES_LIBRO_MAYOR_FILTRO_INVALIDO` | 400 | Filtros de rango inválidos (ninguno, ambos, o dupla incompleta) |
| `REPORTES_LIBRO_MAYOR_CUENTA_NO_DETALLE` | 400 | El `cuentaId` corresponde a una cuenta agrupadora (`esDetalle=false`) |
| `REPORTES_LIBRO_MAYOR_PERIODO_NO_ENCONTRADO` | 404 | El `periodoFiscalId` no existe o no pertenece al tenant |
| `REPORTES_LIBRO_MAYOR_RANGO_EXCEDIDO` | 422 | El rango supera el límite inyectable de líneas (default 10.000) |

---

## Notas regulatorias

- El Libro Mayor es un libro auxiliar exigido por el Código de Comercio de Bolivia (art. 36). Su presentación al contador es por cuenta, con saldo inicial (saldo anterior) y movimientos del período.
- La fórmula de naturaleza (DEUDORA/ACREEDORA) sigue las Normas de Contabilidad Bolivianas (NCB) y la Ley 843 en la clasificación de cuentas.
- El saldo inicial incluye el asiento `APERTURA` sin trato especial: en Bolivia, el asiento de apertura (`TipoComprobante.APERTURA`) es simplemente el traspaso de saldos iniciales de la nueva gestión; ya está capturado en la suma histórica.
