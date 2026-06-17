# Cuentas — Especificación

<!--
Última edición: 2026-06-17
Última revisión contra core: 2026-06-17
Owner: backend-lead
-->

> Fecha: 2026-06-17
> Fase: spec canónica
> Proyecto: avicont
> Capability: `cuentas`
> Alcance: BACKEND + seed

---

## Propósito

Especificación de los cambios al seed del plan de cuentas y a la lógica de
cuentas requeridas por el módulo `cierre-ejercicio`. Documenta la cuenta
transitoria dual única y la eliminación de la cuenta redundante de pérdida.

El plan de cuentas completo (estructura, jerarquía, cuentas requeridas por
sistema, mapeo `MAPEO_CODIGO_A_CONCEPTO`) está documentado en CLAUDE.md §4 y
`docs/claude/dominio-contable.md`.

---

## Requirements

---

### REQ-CTA-CIERRE-01 — Renombrar la transitoria a "RESULTADO DE LA GESTIÓN"

El seed del plan de cuentas DEBE nombrar la cuenta `3.1.4.001` como
**"RESULTADO DE LA GESTIÓN"** (antes "UTILIDAD DE LA GESTIÓN"), conservando
`esRequeridaSistema:true`, clase PATRIMONIO, subClase `PATRIMONIO_RESULTADOS`,
naturaleza ACREEDORA, y su mapeo `resultadoEjercicioId` intacto. Es la
transitoria dual del cierre (saldo acreedor=utilidad / deudor=pérdida).

La migración de datos (`20260617000000_cierre_resultado_gestion`) renombra la
cuenta en orgs existentes de forma idempotente (filtra por nombre anterior).

#### Escenario: orgs nuevas
- **DADO** una org recién sembrada
- **ENTONCES** existe `3.1.4.001 "RESULTADO DE LA GESTIÓN"`,
  `esRequeridaSistema=true`, mapeada a `resultadoEjercicioId`.

#### Escenario: migración de orgs existentes (rename idempotente)
- **DADO** una org ya sembrada con `3.1.4.001 "UTILIDAD DE LA GESTIÓN"`
- **CUANDO** corre la migración de datos
- **ENTONCES** el nombre pasa a "RESULTADO DE LA GESTIÓN"; el `id`, mapeo y demás
  atributos se preservan; re-correr la migración no cambia nada.

---

### REQ-CTA-CIERRE-02 — Eliminar `3.1.4.002 PÉRDIDA DE LA GESTIÓN`

El seed NO DEBE contener la cuenta `3.1.4.002 PÉRDIDA DE LA GESTIÓN`. Para orgs ya
sembradas, la migración DEBE eliminarla SOLO si NO tiene movimiento
(`NOT EXISTS` línea de comprobante que la referencie). Las orgs donde
excepcionalmente tuviera movimiento se dejan intactas (protegidas por FK
`onDelete: Restrict`).

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
- **ENTONCES** la cuenta NO se elimina y la migración no falla.

---

### REQ-CTA-CIERRE-03 — Coherencia del mapeo de cuentas requeridas

El sistema DEBE mantener el invariante existente: toda cuenta
`esRequeridaSistema=true` está en `MAPEO_CODIGO_A_CONCEPTO`. Tras el cambio,
`3.1.4.001` sigue mapeada y `3.1.4.002` ya no existe. El test de coherencia del
seed (`codigo-a-concepto.spec.ts`) sigue verde. El seed `comercial.ts` siembra
110 cuentas (antes 111: `3.1.4.002` eliminada).

#### Escenario: coherencia del seed preservada
- **DADO** el seed tras el cambio
- **ENTONCES** todas las cuentas `esRequeridaSistema` están mapeadas y el seed NO
  contiene `3.1.4.002`.

---

## Notas

- Solo existe `backend/src/cuentas/adapters/seed/comercial.ts` (único seed de tipo
  de empresa). El rename + eliminación aplica en ese archivo.
- El total de cuentas sembradas baja de 111 a 110 tras eliminar `3.1.4.002`.
  Los tests de integración `prisma-plan-cuentas-seeder.adapter.integration.spec.ts`
  y `tenants.service.integration.spec.ts` que asertan 111 se actualizan a 110.
