# Delta spec — gestion-fiscal: gate de cierre de ejercicio

> Change: `cierre-ejercicio`
> Fecha: 2026-06-17
> Delta del capability `gestion-fiscal`. Agrega el gate que ata el cierre de la
> gestión a los comprobantes de cierre de ejercicio.
> Decisión spec-level FIRMADA: `cerrar()` EXIGE los 3 cierres CONTABILIZADO si
> existen, pero NO los genera (generar = acción separada del módulo
> `cierre-ejercicio`; 2 acciones, decisión LOCKED).

## ADDED Requirements

### REQ-GF-CIERRE-01 — `cerrar()` exige los cierres contabilizados si existen

El sistema DEBE, en `GestionesFiscalesService.cerrar()`, verificar el estado de
los comprobantes de cierre de ejercicio de la gestión:
- Si la gestión tiene comprobantes de cierre generados y NO todos están
  `CONTABILIZADO` → rechazar el cierre de la gestión con 409
  `CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO`.
- Si todos los comprobantes de cierre generados están `CONTABILIZADO` (o si tras
  SKIP-on-zero se generaron menos de 3, todos ellos CONTABILIZADO) → el cierre
  de la gestión procede con la lógica existente (valida 0 períodos ABIERTO y
  voltea el flag a `CERRADA`).

`cerrar()` NO genera ni contabiliza los cierres: solo verifica. La generación y
la contabilización son acciones previas y separadas (módulo `cierre-ejercicio` +
contabilización normal de comprobantes).

#### Escenario (−): cerrar con cierres en BORRADOR
- **DADO** una gestión con los 3 comprobantes de cierre en BORRADOR (no
  contabilizados)
- **CUANDO** se invoca `cerrar()` sobre la gestión
- **ENTONCES** responde 409 `CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO`; la
  gestión NO pasa a `CERRADA`.

#### Escenario (−): cerrar con contabilización parcial (1 de 3)
- **DADO** una gestión con #1 CONTABILIZADO y #2/#3 en BORRADOR
- **CUANDO** se invoca `cerrar()`
- **ENTONCES** responde 409 `CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO`.

#### Escenario (+): cerrar con los 3 cierres contabilizados
- **DADO** una gestión con los 3 comprobantes de cierre CONTABILIZADO y los 12
  períodos CERRADO
- **CUANDO** se invoca `cerrar()`
- **ENTONCES** responde 200 y la gestión pasa a `CERRADA` (lógica de cierre
  existente intacta).

#### Escenario (+): cerrar tras SKIP-on-zero (menos de 3 cierres)
- **DADO** una gestión sin gastos (solo se generaron #2 y #3), ambos
  CONTABILIZADO, y los 12 períodos CERRADO
- **CUANDO** se invoca `cerrar()`
- **ENTONCES** responde 200 y la gestión pasa a `CERRADA` (no se exige el #1
  inexistente).

### REQ-GF-CIERRE-02 — Orden de operaciones del cierre de gestión

El sistema DEBE respetar el orden (verificado: `contabilizar` exige período
ABIERTO; `cerrar(periodo)` exige 0 borradores; `cerrar(gestion)` exige 0 períodos
abiertos):
1. Períodos 1..11 CERRADO, período `mesCierre` ABIERTO.
2. Generar los (≤3) comprobantes de cierre en BORRADOR.
3. Contabilizar los comprobantes de cierre (período `mesCierre` aún ABIERTO).
4. Cerrar el período `mesCierre`.
5. `cerrar()` la gestión (los 12 períodos ya CERRADO + REQ-GF-CIERRE-01).

#### Escenario (−): intentar cerrar el período mesCierre con cierres en BORRADOR
- **DADO** los comprobantes de cierre en BORRADOR en el período `mesCierre`
- **CUANDO** se intenta cerrar el período `mesCierre`
- **ENTONCES** el cierre de período falla por borradores presentes (invariante
  existente §4.4) — los cierres deben contabilizarse antes de cerrar el período.

### REQ-GF-CIERRE-03 — Corrección post-cierre vía reapertura existente

El sistema DEBE corregir un cierre mal hecho usando el flujo de **reapertura de
período** existente (`POST /periodos/:id/reabrir`, OWNER/ADMIN, motivo ≥20
caracteres, log `PeriodoFiscalReopening`), sin mecanismo nuevo. Al reabrir el
período `mesCierre`: se desbloquean los comprobantes de cierre, el admin/contador
regenera (borra path-sistema + recalcula, REQ-CE-09) o anula+regenera, y luego
re-cierra. Un comprobante `generadoPorSistema` reabierto SIGUE siendo no-editable
a mano (REQ-CMP-SYS-02): solo se regenera.

#### Escenario (+): reabrir, regenerar y volver a cerrar
- **DADO** una gestión `CERRADA` con un cierre incorrecto
- **CUANDO** un OWNER/ADMIN reabre el período `mesCierre` con motivo válido,
  regenera el cierre y vuelve a contabilizar y cerrar
- **ENTONCES** la gestión vuelve a quedar `CERRADA` con el cierre corregido; los
  comprobantes de cierre nunca fueron editables a mano (solo regenerados).

> Nota: este requisito NO agrega comportamiento al flujo de reapertura — lo
> referencia como el canal de corrección. Su comportamiento detallado vive en el
> capability `periodo-fiscal` existente (§4.4).
