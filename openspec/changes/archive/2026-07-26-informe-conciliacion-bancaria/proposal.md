# Proposal: Informe de conciliación bancaria

## Intent

El módulo se llama conciliación bancaria y **no produce una conciliación**. `ResumenConciliacionDto` son 4 contadores sin importes: cuenta partidas, nunca las suma, **nunca se autovalida**. No existe "saldo según extracto ± partidas = saldo según libros", que es el papel de trabajo que justifica el saldo de Bancos ante un auditor.

Sin la ecuación, "cero pendientes" afirma algo sobre los movimientos que el pack conoce, no sobre la cuenta.

## Scope

### In Scope
- Método agregado en `LineasCuentaReaderPort` → saldo según libros acumulado a corte, en moneda original.
- Endpoint de informe: ecuación + puente detallado por partida a una **fecha de corte**.
- Punto de arranque conciliado: entidad nueva **append-only**, atribuida y fechada, fijada por `POST` explícito.
- Persistir `saldoInicial`/`saldoFinal` derivados (hoy NULL en los 4 bancos `DERIVADO`).
- Integridad: cablear `detectarHuecos` + continuidad `saldoFinal(n) ≟ saldoInicial(n+1)`.
- Pantalla propia en el grupo `bancos`.

### Out of Scope
- Cuentas en **USD** (modelo contable sin resolver).
- **Congelar** el informe como evidencia inmutable.
- Convertir la importación en bloqueante.
- Export PDF/Excel; atajo de comisión/ITF.

## Capabilities

### New Capabilities
- `informe-conciliacion-bancaria`: ecuación a fecha de corte, puente de partidas, punto de arranque, abstención ante insumo no confiable.

### Modified Capabilities
- `conciliacion-bancaria`: el checksum DEBE devolver ambos saldos derivados y la importación persistirlos (delta sobre REQ-CB-08); la cobertura DEBE exponerse y verificarse en continuidad (activa REQ-CB-09, hoy diferida).

## Approach

Saldos **acumulados a corte**, nunca flujos del período: un asiento tardío se autorresuelve en el corte siguiente; por flujos reaparecería invertido y no cerraría nunca.

Las partidas **ya se derivan solas** (`estadoEfectivo` + `verificarAnclas`): no se inventa un modelo, se suman. Los `IGNORADO` entran al puente con nombre propio — omitirlos rompe la ecuación sobre datos correctos; absorberlos la vuelve mentira.

Fuente del lado libros: `LineasCuentaReaderPort` (`comprobantes`), ya consumido por el módulo ⇒ cero wiring cross-módulo nuevo, moneda original preservada, acotado a una `cuentaId`. Amplía deliberadamente su "superficie mínima: dos métodos".

**3 PRs** (§9.1): (1) `fix` saldos derivados — habilita el resto; (2) `feat` integridad — **prerrequisito de credibilidad**, único chequeo que caza un archivo mutilado en los extremos; (3) `feat` informe.

## Affected Areas

| Área | Impacto | Descripción |
|---|---|---|
| `conciliacion-bancaria/domain/checksum-extracto.ts` | Modified | Devuelve `saldoInicial`/`saldoFinal` |
| `conciliacion-bancaria/extracto-importador.service.ts` | Modified | Persiste ambos en las dos ramas |
| `conciliacion-bancaria/domain/cobertura-extracto.ts` | Modified | Se cablea (diferimiento documentado que este change consume) |
| `comprobantes/ports/lineas-cuenta-reader.port.ts` | Modified | 3er método: agregado a corte |
| `prisma/schema.prisma` | New | Entidad del punto de arranque |
| `frontend/.../nav-items.ts` + `nav-list.test.tsx` | Modified | 4º ítem en `bancos`, con `pack` |

**Deuda bidireccional**: `comprobantes` ↔ `conciliacion-bancaria` se estrecha (un método más en un port ya existente). No se abre dependencia hacia `reportes`.

**Invariantes del core (§4)**: `organizationId` primer predicado (§4.2 Anti-31); `BORRADOR` nunca cuenta y anulados excluidos (§4.1/§4.7); montos STRING en DTOs (§4.5); `FechaContable` calendario puro (§4.6); **una lectura nunca escribe** (design §2.3) ⇒ el arranque se fija por comando, jamás al abrir el informe.

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| El arranque no cuadra y no hay forma de evitarlo | **Alta** | Se acepta UNA vez, declarado/fechado/atribuido, y se arrastra **visible**; nunca se absorbe |
| Bancos `DERIVADO` ciegos a filas borradas de los extremos | Media | PR 2 antes del PR 3; el informe se abstiene si el insumo no es confiable |
| Período cerrado ⇒ diferencia permanente | Alta | El diseño no asume convergencia a cero |
| Alcance doble (integridad + informe) | Media | 3 PRs; los dos primeros valen solos |

## Rollback Plan

Toca schema y dominio contable, así que por PR:

1. **PR 1** — sin migración. Revert del commit; `saldoInicial`/`saldoFinal` vuelven a NULL en `DERIVADO`. Los ya persistidos quedan (dato correcto, sin lectores). Cero pérdida.
2. **PR 2** — sin migración, solo lectura. Revert directo.
3. **PR 3** — migración **aditiva** (tabla nueva + índice). Rollback = revert de código; la tabla queda huérfana y se elimina en una migración posterior. **Ningún dato contable se toca**: el informe solo LEE. No hay asientos que deshacer.

## Dependencies

- PR 1 habilita PR 2 y PR 3 (sin ambos saldos no hay continuidad ni arranque).
- Ninguna dependencia externa ni de terceros.

## Success Criteria

- [ ] La ecuación **cierra** en una cuenta con partidas de los tres tipos, incluidos `IGNORADO`.
- [ ] Un residuo no explicado se **muestra**, jamás se absorbe.
- [ ] Con `DESCUADRE` o hueco en el rango, el informe **no afirma** "conciliado".
- [ ] Los 4 bancos `DERIVADO` persisten ambos saldos; borrar la última fila de un extracto se **detecta** en la continuidad.
- [ ] Un período cerrado con diferencia permanente se representa sin romper el informe.
- [ ] Cobertura ≥95% en `domain/` contable; `tsc`, `lint` y los 3 checks de CI verdes.
