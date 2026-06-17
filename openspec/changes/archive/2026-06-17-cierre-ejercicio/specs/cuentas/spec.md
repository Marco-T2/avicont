# Delta spec — cuentas: cuenta transitoria dual del resultado

> Change: `cierre-ejercicio`
> Fecha: 2026-06-17
> Delta del capability `cuentas` (seed + migración de datos).
> Decisión A FIRMADA: cuenta dual única `3.1.4.001 RESULTADO DE LA GESTIÓN`;
> eliminar `3.1.4.002 PÉRDIDA DE LA GESTIÓN`. Verificado en código: `3.1.4.001`
> es `esRequeridaSistema:true` mapeada a `resultadoEjercicioId`; `3.1.4.002` NO
> es requerida y NO está en `MAPEO_CODIGO_A_CONCEPTO` → eliminarla no rompe
> ninguna config mapeada.

## ADDED Requirements

### REQ-CTA-CIERRE-01 — Renombrar la transitoria a "RESULTADO DE LA GESTIÓN"

El seed del plan de cuentas DEBE nombrar la cuenta `3.1.4.001` como
**"RESULTADO DE LA GESTIÓN"** (antes "UTILIDAD DE LA GESTIÓN"), conservando
`esRequeridaSistema:true`, clase PATRIMONIO, subClase `PATRIMONIO_RESULTADOS`,
naturaleza ACREEDORA, y su mapeo `resultadoEjercicioId` intacto. Es la
transitoria dual del cierre (saldo acreedor=utilidad / deudor=pérdida).

#### Escenario: orgs nuevas
- **DADO** una org recién sembrada
- **ENTONCES** existe `3.1.4.001 "RESULTADO DE LA GESTIÓN"`,
  `esRequeridaSistema=true`, mapeada a `resultadoEjercicioId`.

#### Escenario: migración de orgs existentes (rename idempotente)
- **DADO** una org ya sembrada con `3.1.4.001 "UTILIDAD DE LA GESTIÓN"`
- **CUANDO** corre la migración de datos
- **ENTONCES** el nombre pasa a "RESULTADO DE LA GESTIÓN"; el `id`, mapeo y demás
  atributos se preservan; re-correr la migración no cambia nada (idempotente por
  filtro de nombre).

### REQ-CTA-CIERRE-02 — Eliminar `3.1.4.002 PÉRDIDA DE LA GESTIÓN`

El seed NO DEBE contener la cuenta `3.1.4.002 PÉRDIDA DE LA GESTIÓN`. Para orgs ya
sembradas, la migración DEBE eliminarla SOLO si NO tiene movimiento
(`NOT EXISTS` línea de comprobante que la referencie). Las orgs donde
excepcionalmente tuviera movimiento se dejan intactas y se reportan para
tratamiento manual (no debería ocurrir: la cuenta nunca tuvo flujo en producción
al no existir cierre aún).

#### Escenario: orgs nuevas no la incluyen
- **DADO** una org recién sembrada
- **ENTONCES** NO existe ninguna cuenta `3.1.4.002`.

#### Escenario: eliminación segura en orgs existentes sin movimiento
- **DADO** una org ya sembrada con `3.1.4.002` sin líneas de comprobante
- **CUANDO** corre la migración
- **ENTONCES** la cuenta se elimina.

#### Escenario: cuenta con movimiento se preserva
- **DADO** una org (caso raro) con `3.1.4.002` referenciada por alguna línea
- **CUANDO** corre la migración
- **ENTONCES** la cuenta NO se elimina (la FK `onDelete: Restrict` y el
  `NOT EXISTS` la protegen) y la migración no falla.

### REQ-CTA-CIERRE-03 — Coherencia del mapeo de cuentas requeridas

El sistema DEBE mantener el invariante existente: toda cuenta
`esRequeridaSistema=true` está en `MAPEO_CODIGO_A_CONCEPTO`. Tras el cambio,
`3.1.4.001` sigue mapeada y `3.1.4.002` ya no existe — el test de coherencia del
seed (`codigo-a-concepto.spec.ts`) sigue verde.

#### Escenario: coherencia del seed preservada
- **DADO** el seed tras el cambio
- **ENTONCES** todas las cuentas `esRequeridaSistema` están mapeadas y el seed NO
  contiene `3.1.4.002`.

> Nota (ambigüedad menor del design §11.1): el código verificado es
> `comercial.ts`. Si existen seeds por otro `tipoEmpresa` (servicios, industrial,
> etc.) con la misma cuenta, el rename + eliminación DEBE aplicarse igual en cada
> uno. La fase de tasks debe enumerar los seeds afectados.
