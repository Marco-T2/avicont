# Archive Report — informe-conciliacion-bancaria

**Archivado**: 2026-07-26
**Artifact store**: openspec

## Specs sincronizadas

| Dominio | Acción | Detalle |
|---|---|---|
| `conciliacion-bancaria` | Actualizada | +1 añadida (REQ-CB-23 continuidad de saldo), 2 modificadas (REQ-CB-08 checksum devuelve ambos saldos, REQ-CB-09 cobertura deja de estar diferida). 20 requirements previos preservados intactos: la spec va de 22 a 23. |
| `informe-conciliacion-bancaria` | Creada | Spec nueva, 12 requirements (REQ-ICB-01..11 + 05b). No existía spec principal, así que el delta ES la spec. |

## Requirements agregados DESPUÉS del merge original

El change se mergeó a `main` (dd01b17) y recién entonces una auditoría completa
encontró dos defectos críticos. Los tres requirements siguientes nacieron de
esa corrección y por eso no están en el `tasks.md` original:

- **REQ-ICB-05b** — el punto de partida declarado se contrasta contra la
  realidad por AMBOS lados. Existía el contraste del extracto; faltaba el de
  libros, que además es el más barato de los dos.
- **REQ-ICB-10** — partidas ya abiertas al declarar el arranque: se proponen,
  el contador confirma, y la aritmética `Σ = saldoLibros − saldoExtracto +
  residual` desambigua.
- **REQ-ICB-11** — anulación de una declaración por marca, jamás borrado (§4.7).

## Estado de los CRITICAL

El verify-report original salió en verde. Su addendum documenta dos CRITICAL
**encontrados después del merge y RESUELTOS antes de este archivado**:

| # | Defecto | Estado |
|---|---|---|
| 1 | Partidas abiertas anteriores al arranque salían como `RESIDUO_NO_EXPLICADO` | ✅ Cerrado — REQ-ICB-10 |
| 2 | El informe exhibía `arranque.saldoLibros + delta` en vez del mayor | ✅ Cerrado — cumple REQ-ICB-03 |

No queda ningún CRITICAL abierto. Se archiva.

## Lo que hay que llevarse de este change

**El CRÍTICO 2 no fue un hueco de la spec.** REQ-ICB-03 decía, desde el día
uno, que el saldo según libros se obtiene agregando las líneas contables hasta
el corte. El código hacía otra cosa, y el verify —cuyo trabajo es exactamente
contrastar implementación contra spec— lo dio por cumplido.

**Por qué se le escapó, que es lo reutilizable**: los dos defectos vivían en la
FRONTERA del dominio puro, no adentro. La aritmética de `armarInforme` era
correcta para los insumos que recibía; lo que estaba mal era qué se le pasaba.
Los unit tests mockean el port, así que nunca contrastan el saldo declarado
contra el mayor. Y el e2e, que sí podía, sembró los datos de forma consistente
con la declaración en vez de independiente.

> Un test que construye sus insumos desde la misma premisa que el código no
> puede refutar esa premisa. Puede confirmarla mil veces.

**Regla para los próximos verify**: cuando un valor se puede obtener por dos
caminos —declarado vs. derivado— el test DEBE construir uno y verificar el
otro. Si ambos salen de la misma fuente, la prueba no prueba nada.

**Y el smoke visual no es el trámite del final.** Encontró cuatro cosas que
ninguna suite iba a ver, porque no eran fallas de cálculo: un campo que se
guardaba sin leerse, etiquetas que empujaban al error contrario, la ausencia de
una forma de deshacer, y una lista que pide decidir sobre un asiento que no se
podía abrir.

## Deudas

**Cerrada**: la atribución cruda del historial (`declaradoPorUserId`) — se abrió
`UsuarioReaderPort`, el primer reader de identidad del repo.

**Abiertas y documentadas** en `docs/deudas-arquitecturales.md` §3.7: los
huecos de borde de la integridad (heredado del PR 2), el pre-marcado de
candidatos cuando hay cobertura anterior al arranque, y la restricción de
diseño que impide el anti-join "líneas sin match" (ancla sin FK + frontera del
arch test).

## Verificación al momento de archivar

| Suite | Resultado |
|---|---|
| Backend unit | 216 suites · 3.002 tests |
| Backend e2e | 49 suites · 626 tests |
| Frontend | 247 files · 1.977 tests |

`tsc` y `eslint` limpios en ambos stacks. Smoke visual hecho contra el proceso
vivo, con el escenario de `prisma/scripts/seed-smoke-conciliacion.ts`.
