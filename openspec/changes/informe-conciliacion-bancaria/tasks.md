# Tasks: Informe de conciliación bancaria

TDD estricto: cada task es **rojo → verde → refactor** y cierra con
`pnpm exec tsc --noEmit -p tsconfig.json` + suite del subsistema en verde.
1 task = 1 commit atómico. Cobertura: 80 global, **95 en `domain/` contable**.

---

## PR 1 — `fix(conciliacion)`: los saldos derivados dejan de descartarse

Sin migración. **Habilita PR 2 y PR 3.**

- [x] 1.1 `domain/checksum-extracto.ts`: ampliar `ResultadoChecksum` con
      `saldoInicial`/`saldoFinal` (`Money | null`). DECLARADO devuelve los de
      cabecera; DERIVADO el ya calculado en `:90-93` y el `ultimo.saldo` de
      `:95`. `IMPOSIBLE`, secuencia no monótona o dato ausente ⇒ ambos `null`.
      Tests: un caso por estrategia + no-monótono deja ambos `null`.
- [x] 1.2 `extracto-importador.service.ts:214-215`: persistir desde el
      resultado del checksum, no desde `parseado.saldoInicialDeclarado/
      saldoFinalDeclarado`. Test de integración: los 4 perfiles `DERIVADO`
      guardan ambos saldos; los 3 `DECLARADO` no cambian de comportamiento.

---

## PR 2 — `feat(conciliacion)`: integridad de extractos

Sin migración, solo lectura. **Prerrequisito de credibilidad del PR 3.**

- [x] 2.1 `domain/continuidad-extractos.ts`: función pura (molde de
      `cobertura-extracto.ts`) que recibe `(fechaDesde, fechaHasta,
      saldoInicial, saldoFinal)[]` y devuelve discontinuidades comparando con
      `Money.igualaConTolerancia`. Saldo `null` ⇒ sin veredicto.
- [x] 2.2 **Test de la ceguera (REQ-CB-23)**: un extracto `DERIVADO` al que se
      le borran las últimas filas da `estadoVerificacion = VERIFICADO`, y la
      discontinuidad contra el extracto siguiente **sí** lo detecta.
- [x] 2.3 Cablear `detectarHuecos` + continuidad para una cuenta bancaria y
      exponerlos. Ninguna importación se rechaza: advierte. E2E de ambos.

---

## PR 3 — `feat(conciliacion)`: el informe

Migración **aditiva**, sin backfill.

### Fundación

- [x] 3.1 `schema.prisma`: modelo `ArranqueConciliado` + migración aditiva.
      **Sin `@@unique(cuenta, fecha)`** — append-only.
      `@@index([organizationId, cuentaBancariaId, fecha])`.
- [x] 3.2 `ports/arranque-conciliado.repository.port.ts` + adapter:
      `vigenteA(corte)` (`fecha <= corte ORDER BY fecha DESC, createdAt DESC
      LIMIT 1`), `listarHistorial`, `crear`. Integración: aislamiento por
      tenant; una declaración posterior no borra la anterior.
- [x] 3.3 `lineas-cuenta-reader.port.ts`: `sumarPorCuentaHasta` + adapter con
      `aggregate({_sum})` (**no** `$queryRaw`). `organizationId` en la línea Y
      en el comprobante. Documentar por qué se amplía la "superficie mínima".
      Integración: `BORRADOR` y anulados excluidos.

### Dominio

- [x] 3.4 Extraer `domain/estado-efectivo.ts` desde `conciliacion.service.ts`
      y hacer que el workspace lo consuma. **Refactor puro: la suite existente
      debe quedar intacta, sin cambiar comportamiento observable.**
      _Follow-up (D4, aprobado por Marco): el verificador también consume la
      función de dominio — copia duplicada eliminada de
      `movimientos-bancarios.service.ts`._
- [x] 3.5 `domain/armar-informe.ts`: la identidad, pura y sin I/O. Tests de
      `IGNORADO` con nombre propio, residuo ≠ 0 expuesto sin absorber, y
      diferencia permanente de período cerrado.
      _Clasificación RELATIVA AL CORTE: un CONCILIADO con asiento posterior
      al corte sigue siendo partida en ese corte (`asentadoEl`), y la línea
      conciliada con movimiento posterior sigue en tránsito
      (`registradoPorBancoEl`). Convención fijada:
      `diferenciaResidual = saldoExtracto − saldoLibros` al arranque._

### Servicio y HTTP

- [x] 3.6 `informe-conciliacion.service.ts`: orquesta reutilizando
      `saldosVigentes` (ya existe). Ventana acotada a
      `arranque.fecha < fecha <= corte`; **sin arranque ⇒ informe abstenido**.
      Cuenta no BOB ⇒ `CONCILIACION_MONEDA_NO_SOPORTADA`.
- [x] 3.7 Propagar la abstención: sección `confiabilidad` del DTO con
      `conciliado: boolean` + motivos (descuadre, hueco, discontinuidad). El
      informe **siempre se emite**. Montos como STRING (§4.5).
- [x] 3.8 `informe-conciliacion.controller.ts`: `GET` informe (`read`) y `POST`
      arranque (`conciliar`). E2E: 404 cross-tenant; `read` sin `conciliar` ve
      el informe y no puede declarar; **el `GET` no crea arranque**.
      _Alcance agregado (omisión del desglose, habilita 3.11): `GET
      /conciliacion/arranques` (`read`) expone `listarHistorial` — orden
      `fecha DESC, createdAt DESC`, el mismo desempate que `vigenteA`._

### Frontend

- [x] 3.9 `features/informe-conciliacion/`: hook TanStack Query + ruta.
- [ ] 3.10 Vista del puente como **papel de trabajo** (no una tabla más):
      ambos saldos, partidas con signo, residuo destacado y la abstención
      visible cuando corresponda.
- [ ] 3.11 Declaración de arranque + historial completo señalando cuál aplica.
- [ ] 3.12 `nav-items.ts`: 4º ítem en el grupo `bancos` con
      `pack: 'contabilidad.conciliacion'`. Actualizar `nav-list.test.tsx`
      (guard bidireccional).

---

## Cierre

- [ ] 4.1 Fila de changelog en `CLAUDE.md`; revisar si corresponde tocar
      `docs/deudas-arquitecturales.md`.
