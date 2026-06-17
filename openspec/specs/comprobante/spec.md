# Comprobante — Especificación

<!--
Última edición: 2026-06-17
Última revisión contra core: 2026-06-17
Owner: backend-lead
-->

> Fecha: 2026-06-17
> Fase: spec canónica
> Proyecto: avicont
> Capability: `comprobante`
> Alcance: BACKEND

---

## Propósito

Especificación de los invariantes del módulo `comprobantes` relevantes para la
integración con el módulo `cierre-ejercicio`. Cubre el atributo de origen
`generadoPorSistema` y las restricciones de edición/borrado/anulación de
comprobantes generados por el sistema.

El ciclo contable completo (BORRADOR → CONTABILIZADO → BLOQUEADO, anulación,
correlativo atómico) está documentado en CLAUDE.md §4.

---

## Requirements

---

### REQ-CMP-SYS-01 — Atributo de origen `generadoPorSistema`

El sistema DEBE tener en `Comprobante` la columna
`generadoPorSistema Boolean @default(false)` (migración ADITIVA, §11.6;
retrocompatible, sin backfill). El flag es un atributo de **origen** ortogonal
al `estado` del ciclo contable: marca los comprobantes que produjo el sistema
(cierre de ejercicio, y a futuro apertura y auto-entries) y que el usuario NO
debe editar a mano.

#### Escenario: comprobante de usuario por default
- **DADO** un comprobante creado por el flujo normal de usuario
- **ENTONCES** `generadoPorSistema=false`.

#### Escenario: comprobante de sistema marcado
- **DADO** un comprobante de cierre creado por el módulo `cierre-ejercicio`
- **ENTONCES** `generadoPorSistema=true`.

---

### REQ-CMP-SYS-02 — No editable vía API mientras BORRADOR

El sistema DEBE rechazar `actualizarBorrador` y `patch` sobre un comprobante con
`generadoPorSistema=true` (aunque su `estado===BORRADOR`) con 409
`COMPROBANTE_GENERADO_SISTEMA_NO_EDITABLE`. El enforcement vive en
`comprobantes.service` (defense in depth §4.2).

#### Escenario (−): intento de editar un cierre en BORRADOR
- **DADO** un comprobante de cierre con `generadoPorSistema=true`, `estado=BORRADOR`
- **CUANDO** un usuario llama `PUT/PATCH` para modificar sus líneas o cabecera
  vía API
- **ENTONCES** responde 409 `COMPROBANTE_GENERADO_SISTEMA_NO_EDITABLE`.

#### Escenario (+): editar un comprobante de usuario sigue funcionando
- **DADO** un comprobante normal con `generadoPorSistema=false`, `estado=BORRADOR`
- **CUANDO** el usuario edita sus líneas
- **ENTONCES** responde 200 y persiste el cambio.

---

### REQ-CMP-SYS-03 — No eliminable vía API por el usuario

El sistema DEBE rechazar `eliminarBorrador` sobre un comprobante con
`generadoPorSistema=true` con 409 `COMPROBANTE_GENERADO_SISTEMA_NO_ELIMINABLE`.
El borrado de un comprobante de sistema SOLO ocurre por el path-sistema (el
writer port del módulo `cierre-ejercicio` al regenerar).

#### Escenario (−): intento de borrar un cierre vía API de usuario
- **DADO** un comprobante de cierre con `generadoPorSistema=true`, `estado=BORRADOR`
- **CUANDO** un usuario llama `DELETE` sobre él
- **ENTONCES** responde 409 `COMPROBANTE_GENERADO_SISTEMA_NO_ELIMINABLE`.

#### Escenario (+): borrado por path-sistema permitido (regenerar)
- **DADO** el módulo `cierre-ejercicio` regenerando los cierres en BORRADOR
- **CUANDO** usa el writer port para borrar los cierres previos
- **ENTONCES** el borrado procede sin pasar por la operación de usuario.

---

### REQ-CMP-SYS-04 — Contabilizable por el contador

El sistema DEBE PERMITIR `contabilizar` un comprobante con
`generadoPorSistema=true`. La contabilización reusa la lógica existente: período
de `fechaContable` ABIERTO, cuentas `activa`+`esDetalle`, partida doble,
correlativo atómico `FOR UPDATE` (§4.9).

#### Escenario (+): contador contabiliza un cierre
- **DADO** un comprobante de cierre con `generadoPorSistema=true`, `estado=BORRADOR`,
  período ABIERTO, con permiso `contabilidad.asientos.post`
- **CUANDO** el contador llama `POST /api/asientos/:id/contabilizar`
- **ENTONCES** responde 200, el comprobante pasa a CONTABILIZADO y recibe su
  número correlativo.

---

### REQ-CMP-SYS-05 — Inmutable tras CONTABILIZADO

El sistema DEBE rechazar `editarContabilizado` sobre un comprobante con
`generadoPorSistema=true` con 409 `COMPROBANTE_GENERADO_SISTEMA_NO_EDITABLE`.

#### Escenario (−): editar un cierre contabilizado
- **DADO** un comprobante de cierre `generadoPorSistema=true`, `estado=CONTABILIZADO`,
  período abierto
- **CUANDO** un usuario intenta editar su glosa/líneas
- **ENTONCES** responde 409 `COMPROBANTE_GENERADO_SISTEMA_NO_EDITABLE`.

---

### REQ-CMP-SYS-06 — Anulación condicionada al estado de la gestión

El sistema DEBE PERMITIR `anular` un comprobante con `generadoPorSistema=true` y
`tipo=CIERRE` SOLO mientras la gestión asociada NO esté `CERRADA`. Si la gestión
está `CERRADA`, la anulación se rechaza con 409
`CIERRE_EJERCICIO_GESTION_YA_CERRADA`. Para tocar un cierre de una gestión
cerrada, el admin pasa por el flujo de **reapertura de período** existente
(`PeriodoFiscalReopening`, §4.4).

El estado de la gestión se consulta cross-módulo vía `GestionStatusReaderPort`
(registrado en `periodos-reader.module.ts`).

#### Escenario (+): anular un cierre con la gestión aún abierta
- **DADO** un comprobante de cierre CONTABILIZADO cuya gestión NO está cerrada y
  cuyo período está ABIERTO
- **CUANDO** el usuario lo anula con motivo válido (≥10 caracteres, §4.7)
- **ENTONCES** responde 200 y el comprobante queda anulado.

#### Escenario (−): anular un cierre con la gestión ya cerrada
- **DADO** un comprobante de cierre CONTABILIZADO cuya gestión está `CERRADA`
- **CUANDO** el usuario intenta anularlo
- **ENTONCES** responde 409 `CIERRE_EJERCICIO_GESTION_YA_CERRADA`.

---

## Códigos de error (módulo comprobantes — generadoPorSistema)

| Código | HTTP | Descripción |
|--------|------|-------------|
| `COMPROBANTE_GENERADO_SISTEMA_NO_EDITABLE` | 409 | Intento de editar un comprobante generado por sistema (BORRADOR o CONTABILIZADO) |
| `COMPROBANTE_GENERADO_SISTEMA_NO_ELIMINABLE` | 409 | Intento de borrar un comprobante generado por sistema vía API de usuario |
| `CIERRE_EJERCICIO_GESTION_YA_CERRADA` | 409 | Intento de anular un cierre de una gestión ya cerrada |
