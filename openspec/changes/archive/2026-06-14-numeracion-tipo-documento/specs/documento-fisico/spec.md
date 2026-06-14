# Delta para documento-fisico

> Change: numeracion-tipo-documento
> Fecha: 2026-06-14
> Spec viva base: openspec/specs/documento-fisico/spec.md (§2.2 DocumentoFisico, REQ-D-01/02/03)

---

## MODIFIED Requirements

### Requirement: REQ-D-01 — Creación de DocumentoFisico

El sistema DEBE permitir que un usuario con permiso `contabilidad.documentos-fisicos.create` cree un `DocumentoFisico` con los campos: `tipoDocumentoFisicoId` (UUID, obligatorio), `numero` (NumeroDocumento, **obligatorio solo si el tipo es manual**), `fechaEmision` (FechaContable, obligatorio), `monto` (Decimal(18,2), nullable — obligatorio solo si `tipo.esTributario = true`, debe ser > 0 cuando se provee), `moneda` (enum `BOB|USD`, nullable — obligatorio solo si `tipo.esTributario = true`), `contactoId` (UUID, opcional), `glosa` (string 0..300, opcional).

**Rama auto**: si `tipo.numeracionAutomatica = true`, el sistema DEBE asignar `numero` usando el contador atómico de la secuencia `(organizationId, tipoDocumentoFisicoId)`. Si el cliente envía `numero` en el body, el sistema DEBE rechazarlo con `DOCUMENTO_FISICO_NUMERO_NO_PERMITIDO_EN_TIPO_AUTO` (422). El número asignado sigue siendo normalizado y sujeto al VO `NumeroDocumento`.

**Rama manual**: si `tipo.numeracionAutomatica = false`, el comportamiento actual es idéntico: `numero` es obligatorio, se normaliza (REQ-D-02) y se valida unicidad (REQ-D-03).

(Previously: `numero` era obligatorio siempre. Ahora es obligatorio solo en tipos manuales; en tipos auto el sistema lo asigna y rechaza el del cliente.)

#### Scenario: E-D-AUTO-01 (+) Crear documento de tipo auto → sistema asigna numero

- GIVEN existe `TipoDocumentoFisico` id=`tipo-recibo-auto` con `numeracionAutomatica: true, numeroInicial: 100, esTributario: false, activo: true`
- AND no existe ningún documento de ese tipo en tenant `acme`
- WHEN CONTADOR de `acme` con permiso `contabilidad.documentos-fisicos.create` envía `POST /api/documentos-fisicos` con `{ tipoDocumentoFisicoId: "tipo-recibo-auto", fechaEmision: "2026-06-14" }` (sin `numero`)
- THEN respuesta **201 Created** con `{ numero: "100", tipoDocumentoFisico: { id, numeracionAutomatica: true } }`
- AND el documento persiste en BD con `numero = "100"`

#### Scenario: E-D-AUTO-02 (+) Segundo documento auto → número consecutivo

- GIVEN tipo `tipo-recibo-auto` con `numeroInicial: 100` y ya existe un documento con `numero: "100"`
- WHEN CONTADOR crea segundo documento del mismo tipo
- THEN respuesta **201 Created** con `{ numero: "101" }`

#### Scenario: E-D-AUTO-03 (−) Enviar numero en tipo auto → rechazo

- GIVEN tipo `tipo-recibo-auto` con `numeracionAutomatica: true`
- WHEN CONTADOR envía `POST /api/documentos-fisicos` con `{ tipoDocumentoFisicoId: "tipo-recibo-auto", numero: "MI-NUM", fechaEmision: "2026-06-14" }`
- THEN respuesta **422** con `{ error: { code: "DOCUMENTO_FISICO_NUMERO_NO_PERMITIDO_EN_TIPO_AUTO", message: "El número lo asigna el sistema para este tipo de documento" } }`

#### Scenario: E-D-AUTO-04 (+) Crear documento de tipo manual sin cambios → comportamiento actual

- GIVEN tipo `tipo-factura-recibida` con `numeracionAutomatica: false, esTributario: true, activo: true`
- WHEN CONTADOR envía `POST /api/documentos-fisicos` con `{ tipoDocumentoFisicoId: "tipo-factura-recibida", numero: "FC-0001", fechaEmision: "2026-06-14", monto: "1150.00", moneda: "BOB" }`
- THEN respuesta **201 Created** con `{ numero: "FC-0001" }` — flujo actual idéntico
- AND `numero` fue normalizado (trim + uppercase) según REQ-D-02

#### Scenario: E-D-AUTO-05 (−) Tipo manual sin numero → rechazo (comportamiento actual)

- GIVEN tipo con `numeracionAutomatica: false`
- WHEN CONTADOR envía `POST /api/documentos-fisicos` sin campo `numero`
- THEN respuesta **400 Bad Request** (DTO class-validator: campo requerido)

---

### Requirement: Invariante de contador atómico (concurrencia)

El sistema MUST garantizar que N creaciones simultáneas de documentos del mismo tipo automático en el mismo tenant produzcan exactamente N números distintos, consecutivos desde el último asignado, sin gaps ni duplicados. El contador se implementa con upsert atómico `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` sobre la tabla `secuencias_documento_fisico`. PROHIBIDO `SELECT MAX(numero)+1` o equivalentes (§4.9).

#### Scenario: E-D-AUTO-06 (+) Concurrencia — N simultáneos → N números sin duplicados

- GIVEN tipo `tipo-recibo-auto` con `numeroInicial: 1` y sin documentos previos en tenant `acme`
- WHEN 5 requests simultáneos crean documentos de ese tipo
- THEN los 5 documentos tienen números `{ 1, 2, 3, 4, 5 }` (sin repetición, sin gaps)
- AND la tabla `secuencias_documento_fisico` registra `ultimoNumero = 5`

---

### Requirement: Aislamiento multi-tenant de secuencias

El contador de secuencia es por `(organizationId, tipoDocumentoFisicoId)`. Dos tenants con el mismo tipo NO comparten contador. Dos tipos distintos dentro del mismo tenant tampoco comparten contador.

#### Scenario: E-D-AUTO-07 (+) Multi-tenant: secuencias independientes

- GIVEN tenant `acme` y tenant `beta` ambos tienen tipo `tipo-recibo-interno` con `numeracionAutomatica: true, numeroInicial: 1`
- WHEN `acme` crea 3 documentos y `beta` crea 2 documentos de ese tipo
- THEN `acme` tiene documentos `{ 1, 2, 3 }` y `beta` tiene documentos `{ 1, 2 }` — contadores independientes

#### Scenario: E-D-AUTO-08 (+) Dos tipos distintos en mismo tenant: secuencias independientes

- GIVEN tenant `acme` tiene `tipo-A` y `tipo-B` ambos con `numeracionAutomatica: true, numeroInicial: 1`
- WHEN crea un documento de `tipo-A` y un documento de `tipo-B`
- THEN ambos documentos tienen `numero: "1"` — sin colisión (la unicidad es por `(org, tipo, numero)`)

---

## ADDED Error Codes (documento-fisico)

| Code | HTTP | Mensaje | Cuándo |
|------|------|---------|--------|
| `DOCUMENTO_FISICO_NUMERO_NO_PERMITIDO_EN_TIPO_AUTO` | 422 | El número lo asigna el sistema para este tipo de documento | Crear documento de tipo auto enviando `numero` en el body |

---

## FUERA DE SCOPE (sin scenarios)

- Editar el `numero` de un documento creado con tipo auto (mismo invariante de inmutabilidad que §4.3).
- Saltar el contador a un valor arbitrario.
- Prefijo/padding configurable en el número asignado.
- Anulación con gestión de huecos en la secuencia (hueco = información de auditoría, no se reutiliza, §4.7).
