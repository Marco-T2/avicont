# Delta para tipos-documento-fisico

> Change: numeracion-tipo-documento
> Fecha: 2026-06-14
> Spec viva base: openspec/specs/documento-fisico/spec.md (§2.1 TipoDocumentoFisico)

---

## ADDED Requirements

### Requirement: Atributos de numeración automática en TipoDocumentoFisico

El sistema DEBE aceptar dos nuevos campos opcionales al crear un `TipoDocumentoFisico`:
- `numeracionAutomatica` (boolean, default `false`). Si `false` (o ausente), el tipo es **manual**: comportamiento actual idéntico.
- `numeroInicial` (integer, nullable). Solo válido cuando `numeracionAutomatica = true`. DEBE ser ≥ 1. Si `numeracionAutomatica = false`, el campo DEBE ser null o ausente; si se envía con un valor, el sistema DEBE ignorarlo (no rechazar — borde más simple).

Los tipos existentes siguen siendo manuales (`numeracionAutomatica = false` por defecto en BD). Cero regresión.

#### Scenario: E-TN-01 (+) Crear tipo auto no-tributario con numeroInicial

- GIVEN OWNER autenticado en tenant `acme` con permiso `contabilidad.tipos-documento-fisico.create`
- WHEN envía `POST /api/tipos-documento-fisico` con `{ nombre: "Recibo interno", codigo: "recibo-interno", esTributario: false, numeracionAutomatica: true, numeroInicial: 100 }`
- THEN respuesta **201 Created** con `{ numeracionAutomatica: true, numeroInicial: 100 }`
- AND el tipo persiste en BD con `numeracionAutomatica = true` y `numeroInicial = 100`

#### Scenario: E-TN-02 (+) Crear tipo sin numeracionAutomatica → manual por defecto

- GIVEN OWNER autenticado en tenant `acme`
- WHEN envía `POST /api/tipos-documento-fisico` con `{ nombre: "Vale de caja", codigo: "vale-caja", esTributario: false }` (sin `numeracionAutomatica`)
- THEN respuesta **201 Created** con `{ numeracionAutomatica: false, numeroInicial: null }`
- AND tipos pre-existentes no se ven afectados

#### Scenario: E-TN-03 (+) Crear tipo auto sin numeroInicial → default 1

- GIVEN OWNER autenticado en tenant `acme`
- WHEN envía `POST /api/tipos-documento-fisico` con `{ numeracionAutomatica: true, esTributario: false, ... }` sin `numeroInicial`
- THEN respuesta **201 Created** con `{ numeracionAutomatica: true, numeroInicial: 1 }`

#### Scenario: E-TN-04 (−) numeroInicial enviado con tipo manual es ignorado

- WHEN OWNER envía `POST /api/tipos-documento-fisico` con `{ esTributario: false, numeracionAutomatica: false, numeroInicial: 50, ... }`
- THEN respuesta **201 Created** con `{ numeracionAutomatica: false, numeroInicial: null }`
- AND el valor 50 se descarta silenciosamente

---

### Requirement: Regla de dominio — auto solo si no tributario

El sistema MUST NOT permitir crear ni editar un `TipoDocumentoFisico` con `numeracionAutomatica = true` y `esTributario = true` simultáneamente. Los tipos tributarios (facturas recibidas) tienen número asignado por el emisor tercero — no por el sistema. Retorna DomainError `TIPO_DOCUMENTO_FISICO_NUMERACION_AUTO_TRIBUTARIO_INVALIDA` (422).

#### Scenario: E-TN-05 (−) Crear tipo auto-tributario → rechazo

- WHEN OWNER envía `POST /api/tipos-documento-fisico` con `{ esTributario: true, numeracionAutomatica: true, ... }`
- THEN respuesta **422** con `{ error: { code: "TIPO_DOCUMENTO_FISICO_NUMERACION_AUTO_TRIBUTARIO_INVALIDA", message: "Un tipo tributario no puede tener numeración automática" } }`

#### Scenario: E-TN-06 (−) Intentar cambiar numeracionAutomatica vía PATCH → rechazo set-once

- GIVEN existe tipo con `esTributario: true, numeracionAutomatica: false`
- WHEN OWNER envía `PATCH /api/tipos-documento-fisico/:id` con `{ numeracionAutomatica: true }`
- THEN respuesta **422** `TIPO_DOCUMENTO_FISICO_NUMERO_INICIAL_INMUTABLE`
- NOTA: el endpoint ahora expone `numeracionAutomatica` explícitamente en el DTO y lo rechaza con
  INMUTABLE (set-once) antes de evaluar la regla auto⇒¬tributario. El código INMUTABLE prevalece
  porque el rechazo se efectúa por PRESENCIA del campo, independientemente de su valor.

#### Scenario: E-TN-07 (−) Editar tipo manual→auto post-create → rechazo (set-once)

- GIVEN existe tipo con `esTributario: false, numeracionAutomatica: false`
- WHEN OWNER envía `PATCH /api/tipos-documento-fisico/:id` con `{ numeracionAutomatica: true, numeroInicial: 1 }`
- THEN respuesta **422** `TIPO_DOCUMENTO_FISICO_NUMERO_INICIAL_INMUTABLE`
- AND el modo de numeración solo se define al crear el tipo (togglearlo post-create está prohibido)

---

### Requirement: Inmutabilidad set-once de numeroInicial

`numeroInicial` es **set-once**: una vez persistido (al crear el tipo con `numeracionAutomatica = true`), MUST NOT poder modificarse. Cualquier intento de editarlo — incluso enviando el mismo valor — retorna DomainError `TIPO_DOCUMENTO_FISICO_NUMERO_INICIAL_INMUTABLE` (422). La razón: la secuencia ya puede haber emitido números desde `numeroInicial`; cambiarlo retroactivamente generaría huecos o colisiones.

Del mismo modo, togglear `numeracionAutomatica` de `true` a `false` (o viceversa) en un tipo ya persistido MUST NOT estar permitido — aplica el mismo DomainError. El modo se fija al crear el tipo (set-once); cambiarlo post-create está prohibido.

**Contrato HTTP actualizado**: `UpdateTipoDocumentoFisicoDto` ahora **expone** `numeracionAutomatica` y `numeroInicial` como campos opcionales (antes ausentes, descartados silenciosamente por whitelist). El service los rechaza con 422 ante cualquier presencia — no hay excepción de idempotencia. El rechazo es explícito, no silencioso.

#### Scenario: E-TN-08 (−) Editar numeroInicial post-create → rechazo 422 vía HTTP

- GIVEN existe tipo con `numeracionAutomatica: true, numeroInicial: 100` (puede tener o no documentos)
- WHEN OWNER envía `PATCH /api/tipos-documento-fisico/:id` con `{ numeroInicial: 200 }`
- THEN respuesta **422** `TIPO_DOCUMENTO_FISICO_NUMERO_INICIAL_INMUTABLE`
- NOTA: el endpoint ahora expone `numeroInicial` en el DTO de actualización para que el
  rechazo suceda vía HTTP (ya no silenciosamente por whitelist). El set-once se enforza en el service.

#### Scenario: E-TN-09 (−) Enviar mismo numeroInicial existente → rechazo igual

- GIVEN tipo con `numeroInicial: 100`
- WHEN OWNER envía `PATCH` con `{ numeroInicial: 100 }`
- THEN respuesta **422** `TIPO_DOCUMENTO_FISICO_NUMERO_INICIAL_INMUTABLE` (set-once sin excepción de idempotencia)

#### Scenario: E-TN-10 (−) Togglear numeracionAutomatica de true a false → rechazo

- GIVEN tipo con `numeracionAutomatica: true`
- WHEN OWNER envía `PATCH` con `{ numeracionAutomatica: false }`
- THEN respuesta **422** `TIPO_DOCUMENTO_FISICO_NUMERO_INICIAL_INMUTABLE`

#### Scenario: E-TN-11 (+) Editar otros campos del tipo auto → permitido

- GIVEN tipo con `numeracionAutomatica: true, numeroInicial: 1`
- WHEN OWNER envía `PATCH` con `{ nombre: "Recibo digital v2", descripcion: "Actualizado" }` (sin tocar numeroInicial ni numeracionAutomatica)
- THEN respuesta **200 OK** — los demás campos son editables normalmente

#### Scenario: E-TN-12 (−) Intentar convertir tipo auto en tributario vía PATCH → rechazo

- GIVEN existe tipo con `numeracionAutomatica: true, esTributario: false`
- WHEN OWNER envía `PATCH /api/tipos-documento-fisico/:id` con `{ esTributario: true }`
- THEN respuesta **422** `TIPO_DOCUMENTO_FISICO_NUMERACION_AUTO_TRIBUTARIO_INVALIDA`
- NOTA: el set-once se chequea PRIMERO (por presencia de numeracionAutomatica/numeroInicial);
  como en este caso NO vienen esos campos, el service evalúa la regla auto⇒¬tributario y
  retorna AUTO_TRIBUTARIO_INVALIDA (guardas en orden: set-once → auto⇒¬tributario).

---

## ADDED Error Codes (tipos-documento-fisico)

| Code | HTTP | Mensaje | Cuándo |
|------|------|---------|--------|
| `TIPO_DOCUMENTO_FISICO_NUMERACION_AUTO_TRIBUTARIO_INVALIDA` | 422 | Un tipo tributario no puede tener numeración automática | Crear o editar con `esTributario=true` y `numeracionAutomatica=true` |
| `TIPO_DOCUMENTO_FISICO_NUMERO_INICIAL_INMUTABLE` | 422 | El número inicial y el modo de numeración no pueden modificarse una vez configurados | Editar `numeroInicial` o togglear `numeracionAutomatica` en tipo ya persistido |

---

## FUERA DE SCOPE (sin scenarios)

- Saltar a número X, anular número con motivo, prefijo/padding.
- Retrocompatibilidad de tipos existentes: cero cambio, default `false`.

## IMPLEMENTADO (antes diferido)

- **Set-once de `numeracionAutomatica`/`numeroInicial` en HTTP**: el DTO de actualización ahora
  expone ambos campos y el service los rechaza con 422. Ya no se descartan silenciosamente
  por whitelist. Brecha W1/W2 del verify cerrada.
