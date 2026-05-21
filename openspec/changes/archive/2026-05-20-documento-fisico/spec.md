# Spec: documento-fisico

> Fecha: 2026-04-25
> Fase: spec
> Slice: 2 de Fase 1.4
> Proyecto: avicont

---

## 1. Glosario

| Término | Definición |
|---------|-----------|
| **TipoDocumentoFisico** | Catálogo per-tenant del tipo de papel físico: factura recibida, recibo de ingreso, vale, etc. Configurable por el admin del tenant. |
| **DocumentoFisico** | Registro del papel físico que respalda una operación contable. Tiene número (del talonario), fecha de emisión, monto, moneda, contacto opcional, y tipo. Existe independientemente del comprobante — puede estar "suelto" (sin asociar), asociado a borradores, o vinculado a un comprobante CONTABILIZADO. |
| **ComprobanteDocumentoFisico** | Tabla de asociación N:M que relaciona un `Comprobante` con un `DocumentoFisico`. Un comprobante puede tener 0..N documentos físicos. Un documento físico puede estar en múltiples borradores simultáneos, pero solo en UN comprobante CONTABILIZADO a la vez. |
| **estado derivado** | El estado del `DocumentoFisico` (suelto / en borrador / contabilizado) se deriva en runtime de su asociación con comprobantes. No se persiste como columna propia. |
| **NumeroDocumento** | Value object que encapsula el número del documento físico: `^[A-Z0-9./-]+$`, longitud 1..50 chars. Se normaliza (trim + uppercase) al persistir. |
| **esTributario** | Flag en `TipoDocumentoFisico`. `true` para tipos que responden a documentos con requisitos tributarios (factura, nota crédito, nota débito). Anticipa la tabla `Factura` del slice 3. |
| **Moneda** | Enum `BOB | USD`. El `DocumentoFisico` registra la moneda del papel original. Obligatorio solo si `tipo.esTributario = true`; NULL si `esTributario = false`. |
| **tiposComprobanteAplicables** | Array de `TipoComprobante` en `TipoDocumentoFisico`. Lista explícita de tipos de comprobante con los que este tipo de documento puede asociarse. Array vacío `[]` = ningún tipo aplica. |
| **seed universal** | Los 8 tipos predefinidos que se crean al provisionar cualquier organización nueva. Idempotente via `upsert`. |

---

## 2. Requirements (RFC 2119: DEBE / NO DEBE / PUEDE)

### 2.1 TipoDocumentoFisico (catálogo per-tenant)

- **REQ-T-01**: El sistema DEBE permitir que un usuario con permiso `contabilidad.tipos-documento-fisico.create` cree un `TipoDocumentoFisico` con los campos: `nombre` (string 1..100 chars), `codigo` (string 1..20 chars, formato kebab-case alfanumérico `^[a-z0-9-]+$`), `esTributario` (boolean), `activo` (boolean, default `true`), `descripcion` (string 0..300 chars, opcional).

- **REQ-T-02**: El sistema DEBE garantizar unicidad de `(organizationId, codigo)` en `TipoDocumentoFisico`. Dos tipos con el mismo código en el mismo tenant constituyen un error de conflicto.

- **REQ-T-03**: El sistema DEBE garantizar unicidad de `(organizationId, nombre)` en `TipoDocumentoFisico`. Dos tipos con el mismo nombre en el mismo tenant constituyen un error de conflicto.

- **REQ-T-04**: El sistema DEBE permitir listar los `TipoDocumentoFisico` del tenant activo, incluyendo los inactivos (el front filtra). El listado NO incluye registros de otros tenants.

- **REQ-T-05**: El sistema DEBE permitir editar `nombre`, `descripcion`, `esTributario` y `activo` de un `TipoDocumentoFisico`. El campo `codigo` es **inmutable** desde el momento de la creación.

- **REQ-T-06**: El sistema NO DEBE permitir eliminar un `TipoDocumentoFisico` que tenga `DocumentoFisico` asociados (FK Restrict). La desactivación (`activo = false`) es la vía correcta.

- **REQ-T-07**: El sistema NO DEBE permitir crear `DocumentoFisico` con un `TipoDocumentoFisico` cuyo `activo = false`.

- **REQ-T-08**: El sistema DEBE sembrar automáticamente los 8 tipos universales al crear una organización (ver REQ-SEED-01). Este proceso es parte del flujo de creación de la organización, corre síncronamente en la misma transacción.

- **REQ-T-09**: El listado de `TipoDocumentoFisico` devuelve resultados ordenados: primero por `esTributario DESC` (tributarios primero), luego por `nombre ASC`.

- **REQ-T-10**: El sistema DEBE almacenar `tiposComprobanteAplicables: TipoComprobante[]` en cada `TipoDocumentoFisico`. La lista es **explícita siempre**: array vacío `[]` significa que este tipo no aplica a ningún tipo de comprobante (no es un wildcard). Todos los elementos del array DEBEN ser miembros válidos del enum `TipoComprobante`. El admin del tenant puede editar esta lista vía `PATCH /api/tipos-documento-fisico/:id`.

### 2.2 DocumentoFisico (registro)

- **REQ-D-01**: El sistema DEBE permitir que un usuario con permiso `contabilidad.documentos-fisicos.create` cree un `DocumentoFisico` con los campos: `tipoDocumentoFisicoId` (UUID, obligatorio), `numero` (NumeroDocumento, obligatorio), `fechaEmision` (FechaContable, obligatorio), `monto` (Decimal(18,2), nullable — obligatorio solo si `tipo.esTributario = true`, debe ser > 0 cuando se provee), `moneda` (enum `BOB|USD`, nullable — obligatorio solo si `tipo.esTributario = true`), `contactoId` (UUID, opcional), `glosa` (string 0..300, opcional). Ver REQ-D-13 y REQ-D-14 para las reglas de obligatoriedad condicional.

- **REQ-D-02**: El sistema DEBE normalizar el `numero` antes de persistir: `trim()` + `toUpperCase()`. La validación de unicidad opera sobre el valor normalizado.

- **REQ-D-03**: El sistema DEBE garantizar unicidad de `(organizationId, tipoDocumentoFisicoId, numero)` — donde `numero` es el valor normalizado. Dos documentos físicos con el mismo tipo y número en el mismo tenant constituyen un conflicto.

- **REQ-D-04**: El sistema DEBE validar que `tipoDocumentoFisicoId` existe, pertenece al tenant activo, y tiene `activo = true`.

- **REQ-D-05**: El sistema DEBE validar que `contactoId`, cuando se provee, existe y pertenece al tenant activo. El sistema NO DEBE exigir que el contacto esté activo al crear o editar un borrador (puede haberse desactivado mientras el contador editaba). Al re-validar al asociar al comprobante contabilizado no se valida el contacto del documento (solo existencia/pertenencia del propio documento).

- **REQ-D-06**: El sistema DEBE permitir editar `numero`, `fechaEmision`, `monto`, `moneda`, `contactoId`, `glosa` y `tipoDocumentoFisicoId` de un `DocumentoFisico` **siempre que no esté asociado a ningún comprobante CONTABILIZADO**. Estar asociado solo a comprobantes BORRADOR no impide la edición.

- **REQ-D-07**: El sistema NO DEBE permitir editar ningún campo de un `DocumentoFisico` que esté asociado a al menos un comprobante CONTABILIZADO. Cualquier intento retorna error `DOCUMENTO_FISICO_INMUTABLE_POR_COMPROBANTE_CONTABILIZADO`.

- **REQ-D-08**: El sistema DEBE permitir eliminar (DELETE físico) un `DocumentoFisico` **solo si nunca tuvo ninguna asociación con ningún comprobante en ningún estado**. Una vez referenciado por cualquier comprobante (aunque ese comprobante se anule o elimine), el documento físico **permanece** en BD.

- **REQ-D-09**: El sistema DEBE permitir listar `DocumentoFisico` del tenant activo con los siguientes filtros opcionales: `tipoDocumentoFisicoId`, `fechaDesde`, `fechaHasta`, `contactoId`, `estadoAsociacion` (`SUELTO` | `EN_BORRADOR` | `CONTABILIZADO`), texto libre sobre `numero`. Paginado por offset (`page`, `pageSize`, default 20, max 100).

- **REQ-D-10**: El sistema DEBE permitir obtener un `DocumentoFisico` por `id`, incluyendo en la respuesta: el tipo embebido como `{ id, nombre, codigo, esTributario }`, el contacto embebido como `{ id, razonSocial }` cuando existe, y la lista de comprobantes asociados como `[{ id, numero, estado }]`.

- **REQ-D-11**: El `monto` se recibe y retorna en DTOs HTTP como `string` (ej. `"1250.50"`) para evitar pérdida de precisión IEEE-754.

- **REQ-D-12**: El sistema DEBE registrar `organizationId` (denormalizado) en la tabla `DocumentoFisico` para que todas las queries puedan filtrar por tenant sin JOIN adicional al `TipoDocumentoFisico`.

- **REQ-D-13**: Si `tipo.esTributario = true` y `monto` es `null` en el body del request (crear o editar), el sistema DEBE rechazar con **422** `DOCUMENTO_FISICO_MONTO_REQUERIDO_PARA_TRIBUTARIO`. La misma regla aplica para `moneda`: si `moneda` es `null` y `esTributario = true`, rechazar con **422** `DOCUMENTO_FISICO_MONTO_REQUERIDO_PARA_TRIBUTARIO` (con `details.campo: "moneda"`).

- **REQ-D-14**: Si `tipo.esTributario = false` y `monto` NO es `null` en el body del request (crear o editar), el sistema DEBE rechazar con **422** `DOCUMENTO_FISICO_MONTO_NO_PERMITIDO_PARA_NO_TRIBUTARIO`. La misma regla aplica para `moneda`: si `moneda` NO es `null` y `esTributario = false`, rechazar con **422** `DOCUMENTO_FISICO_MONTO_NO_PERMITIDO_PARA_NO_TRIBUTARIO` (con `details.campo: "moneda"`).

### 2.3 Asociación Comprobante ↔ DocumentoFisico

- **REQ-A-01**: El sistema DEBE permitir asociar un `Comprobante` a 0..N `DocumentoFisico` mediante `POST /api/comprobantes/:comprobanteId/documentos-fisicos` con body `{ documentoFisicoIds: string[] }`. La operación es aditiva: no reemplaza asociaciones previas, solo agrega las nuevas.

- **REQ-A-02**: El sistema DEBE permitir desasociar un `DocumentoFisico` de un `Comprobante` mediante `DELETE /api/comprobantes/:comprobanteId/documentos-fisicos/:documentoFisicoId`, siempre que el comprobante esté en estado BORRADOR.

- **REQ-A-03**: El sistema NO DEBE permitir desasociar un `DocumentoFisico` de un `Comprobante` que ya esté CONTABILIZADO. Retorna `COMPROBANTE_DOCUMENTO_NO_DESASOCIABLE_CONTABILIZADO`.

- **REQ-A-04**: El sistema DEBE garantizar que un `DocumentoFisico` esté asociado a lo sumo a UN `Comprobante` en estado CONTABILIZADO simultáneamente. Constraint UNIQUE parcial a nivel BD: `UNIQUE(documentoFisicoId) WHERE comprobanteEstado = 'CONTABILIZADO'`. Implementado también como validación pre-INSERT en el servicio (defense in depth).

- **REQ-A-05**: El sistema DEBE permitir que un `DocumentoFisico` esté asociado a múltiples `Comprobante` en estado BORRADOR simultáneamente. El constraint parcial de REQ-A-04 no aplica a BORRADOR.

- **REQ-A-06**: El sistema DEBE validar al contabilizar un `Comprobante` (transición BORRADOR → CONTABILIZADO) que cada `DocumentoFisico` asociado: (a) existe y pertenece al tenant, (b) no está ya asociado a otro `Comprobante` CONTABILIZADO distinto. Esta validación corre dentro de la transacción del contabilizar, consumiendo `DOCUMENTOS_FISICOS_READER_PORT.idsYaAsociadosAContabilizado(tenantId, ids[], comprobanteId, tx)` (pre-validación UX; el UNIQUE PARCIAL de BD es la última línea, defense in depth).

- **REQ-A-07**: Al anular un `Comprobante` (estado → ANULADO), el sistema DEBE eliminar todas las filas de `ComprobanteDocumentoFisico` vinculadas a ese comprobante en la misma transacción del anular. Los `DocumentoFisico` referenciados NO se eliminan — quedan disponibles para re-asociar.

- **REQ-A-08**: El sistema DEBE registrar `organizationId` en la tabla de asociación `ComprobanteDocumentoFisico` como columna denormalizada para facilitar queries de auditoría.

- **REQ-A-09**: El sistema DEBE retornar la lista de `DocumentoFisico` asociados a un `Comprobante` mediante `GET /api/comprobantes/:comprobanteId/documentos-fisicos`. Cada ítem incluye `{ id, numero, tipoDocumentoFisico: { id, nombre }, monto, moneda, fechaEmision }`.

- **REQ-A-10**: El sistema NO DEBE permitir asociar un `DocumentoFisico` de un tenant distinto al `Comprobante`. La pertenencia al tenant se valida antes del INSERT.

- **REQ-A-11**: Al asociar un `DocumentoFisico` a un `Comprobante`, el sistema DEBE verificar que `TipoDocumentoFisico.tiposComprobanteAplicables` del documento incluye el `tipo` del comprobante. Si no está incluido, rechazar con **422** `TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE`. El service obtiene `tiposComprobanteAplicables` desde el shape `DocumentoFisicoParaAsociar` devuelto por `DOCUMENTOS_FISICOS_READER_PORT.obtenerBatchParaAsociar` (sin segundo query adicional).

### 2.4 Multi-tenancy y seguridad

- **REQ-S-01**: TODA query sobre `TipoDocumentoFisico`, `DocumentoFisico` y `ComprobanteDocumentoFisico` DEBE filtrar por `organizationId` tomado del `JWT.activeTenantId`. Ninguna capa confía en que la anterior filtró.

- **REQ-S-02**: Acceso cross-tenant DEBE retornar 404 (`*_NO_ENCONTRADO`), nunca 403, para evitar enumeración de recursos de otros tenants.

- **REQ-S-03**: El `organizationId` NUNCA se toma del body del request. Solo del JWT decodificado por el guard.

- **REQ-S-04**: El endpoint `GET /api/comprobantes/:comprobanteId/documentos-fisicos` verifica que el `comprobanteId` pertenece al tenant antes de listar sus documentos físicos.

### 2.5 Permisos RBAC

- **REQ-P-01**: `GET /api/tipos-documento-fisico` requiere permiso `contabilidad.tipos-documento-fisico.read`.
- **REQ-P-02**: `POST /api/tipos-documento-fisico` requiere permiso `contabilidad.tipos-documento-fisico.create`.
- **REQ-P-03**: `PATCH /api/tipos-documento-fisico/:id` requiere permiso `contabilidad.tipos-documento-fisico.update`.
- **REQ-P-04**: `DELETE /api/tipos-documento-fisico/:id` requiere permiso `contabilidad.tipos-documento-fisico.delete`.
- **REQ-P-05**: `GET /api/documentos-fisicos` y `GET /api/documentos-fisicos/:id` requieren permiso `contabilidad.documentos-fisicos.read`.
- **REQ-P-06**: `POST /api/documentos-fisicos` requiere permiso `contabilidad.documentos-fisicos.create`.
- **REQ-P-07**: `PATCH /api/documentos-fisicos/:id` requiere permiso `contabilidad.documentos-fisicos.update`.
- **REQ-P-08**: `DELETE /api/documentos-fisicos/:id` requiere permiso `contabilidad.documentos-fisicos.delete`.
- **REQ-P-09**: `POST /api/comprobantes/:id/documentos-fisicos` requiere permiso `contabilidad.documentos-fisicos.update` (asociar es una operación del documento) Y `contabilidad.asientos.update` (modificar el borrador del comprobante).
- **REQ-P-10**: `DELETE /api/comprobantes/:id/documentos-fisicos/:docId` requiere permiso `contabilidad.documentos-fisicos.update` Y `contabilidad.asientos.update`.
- **REQ-P-11**: `GET /api/comprobantes/:id/documentos-fisicos` requiere permiso `contabilidad.documentos-fisicos.read`.
- **REQ-P-12**: El catálogo `common/permisos/catalogo.ts` DEBE incluir los 8 permisos nuevos de este slice MÁS los 4 permisos retroactivos de contactos (`contabilidad.contactos.{read,create,update,delete}`).

### 2.6 Seed inicial al crear tenant

- **REQ-SEED-01**: Al crear una organización, el sistema DEBE sembrar los siguientes 8 `TipoDocumentoFisico` universales:

| Nombre | `codigo` | `esTributario` | `tiposComprobanteAplicables` |
|--------|----------|---------------|------------------------------|
| Factura emitida | `factura-emitida` | `true` | `[INGRESO, DIARIO]` |
| Factura recibida | `factura-recibida` | `true` | `[EGRESO, DIARIO]` |
| Nota de crédito (emitida) | `nota-credito-emitida` | `true` | `[EGRESO, AJUSTE, DIARIO]` |
| Nota de débito (emitida) | `nota-debito-emitida` | `true` | `[INGRESO, AJUSTE, DIARIO]` |
| Recibo de ingreso | `recibo-ingreso` | `false` | `[INGRESO, DIARIO]` |
| Recibo de egreso | `recibo-egreso` | `false` | `[EGRESO, DIARIO]` |
| Comprobante interno | `comprobante-interno` | `false` | `[APERTURA, DIARIO, INGRESO, EGRESO, AJUSTE, TRASPASO, CIERRE]` |
| Vale de caja chica | `vale-caja-chica` | `false` | `[EGRESO, DIARIO]` |

- **REQ-SEED-02**: El seed se implementa como `upsert` por `(organizationId, codigo)`. Es idempotente — ejecutarlo múltiples veces no crea duplicados.

- **REQ-SEED-03**: El seed corre síncronamente en la misma transacción de `Organization.create`. Si el seed falla, la creación de la organización falla entera.

- **REQ-SEED-04**: Los tipos sembrados por el seed son editables y desactivables por el admin del tenant. No son inmutables.

---

## 3. Escenarios (Given/When/Then)

### 3.1 Crear TipoDocumentoFisico

**E-T-01: Crear tipo no-tributario exitoso**
- **Given** un OWNER autenticado en tenant `acme` con permiso `contabilidad.tipos-documento-fisico.create`
- **When** envía `POST /api/tipos-documento-fisico` con `{ nombre: "Cupón de descuento", codigo: "cupon-descuento", esTributario: false }`
- **Then** respuesta **201 Created** con el tipo creado: `{ id, nombre, codigo, esTributario: false, activo: true, organizationId: "acme-id" }`
- **And** el registro persiste en BD con `organizationId` del JWT

**E-T-02: Crear tipo con código duplicado dentro del mismo tenant**
- **Given** ya existe `TipoDocumentoFisico` con `codigo: "factura-recibida"` en tenant `acme`
- **When** OWNER envía `POST /api/tipos-documento-fisico` con `{ nombre: "Otra factura", codigo: "factura-recibida", esTributario: true }`
- **Then** respuesta **409 Conflict** con `{ error: { code: "TIPO_DOCUMENTO_FISICO_CODIGO_DUPLICADO", message: "Ya existe un tipo con el código 'factura-recibida' en esta organización", ... } }`

**E-T-03: Crear tipo con nombre duplicado dentro del mismo tenant**
- **Given** ya existe `TipoDocumentoFisico` con `nombre: "Factura recibida"` en tenant `acme`
- **When** OWNER envía `POST /api/tipos-documento-fisico` con `{ nombre: "Factura recibida", codigo: "factura-recibida-v2", esTributario: true }`
- **Then** respuesta **409 Conflict** con `{ error: { code: "TIPO_DOCUMENTO_FISICO_NOMBRE_DUPLICADO", ... } }`

**E-T-04: Crear tipo con código de formato inválido**
- **When** OWNER envía `POST /api/tipos-documento-fisico` con `{ nombre: "Recibo", codigo: "Recibo Oficial", esTributario: false }`
- **Then** respuesta **400 Bad Request** (falla class-validator por formato de `codigo`)

**E-T-05: El mismo código es válido en tenants distintos**
- **Given** tenant `acme` tiene `TipoDocumentoFisico` con `codigo: "factura-recibida"`
- **When** tenant `beta` (distinto) crea `POST /api/tipos-documento-fisico` con `codigo: "factura-recibida"`
- **Then** respuesta **201 Created** — no hay conflicto entre tenants

**E-T-06: Editar nombre de un tipo existente**
- **Given** existe `TipoDocumentoFisico` id=`tipo-1` con `nombre: "Factura proveedor"` en tenant `acme`
- **When** OWNER envía `PATCH /api/tipos-documento-fisico/tipo-1` con `{ nombre: "Factura recibida de proveedor" }`
- **Then** respuesta **200 OK** con el tipo actualizado

**E-T-07: Intentar editar el codigo de un tipo**
- **When** OWNER envía `PATCH /api/tipos-documento-fisico/tipo-1` con `{ codigo: "nuevo-codigo" }`
- **Then** el campo `codigo` es ignorado (inmutable); los demás campos del body se aplican normalmente
- _Nota: la validación de inmutabilidad del código se aplica en el DTO/service rechazando el campo, no retornando error._

**E-T-08: Eliminar tipo sin documentos asociados**
- **Given** `TipoDocumentoFisico` id=`tipo-huerfano` no tiene `DocumentoFisico` asociados
- **When** ADMIN envía `DELETE /api/tipos-documento-fisico/tipo-huerfano`
- **Then** respuesta **204 No Content**

**E-T-09: Eliminar tipo con documentos asociados falla**
- **Given** `TipoDocumentoFisico` id=`tipo-usado` tiene al menos un `DocumentoFisico` asociado
- **When** ADMIN envía `DELETE /api/tipos-documento-fisico/tipo-usado`
- **Then** respuesta **409 Conflict** con `{ error: { code: "TIPO_DOCUMENTO_FISICO_CON_DOCUMENTOS", ... } }`

**E-T-10: Listar tipos ordena tributarios primero**
- **Given** tenant `acme` tiene 4 tipos: 2 tributarios y 2 no tributarios
- **When** contador envía `GET /api/tipos-documento-fisico`
- **Then** respuesta **200 OK** con los 2 tributarios primero (orden `esTributario DESC, nombre ASC`), sin registros de otros tenants

**E-T-11: Crear tipo con tiposComprobanteAplicables válida**
- **Given** OWNER autenticado en tenant `acme` con permiso `contabilidad.tipos-documento-fisico.create`
- **When** envía `POST /api/tipos-documento-fisico` con `{ nombre: "Liquidación de compra", codigo: "liquidacion-compra", esTributario: false, tiposComprobanteAplicables: ["EGRESO", "DIARIO"] }`
- **Then** respuesta **201 Created** con `tiposComprobanteAplicables: ["EGRESO", "DIARIO"]`

**E-T-12: Crear tipo con array vacío de tiposComprobanteAplicables (explícitamente sin aplicabilidad)**
- **Given** OWNER autenticado en tenant `acme` con permiso `contabilidad.tipos-documento-fisico.create`
- **When** envía `POST /api/tipos-documento-fisico` con `{ nombre: "Tipo sin uso", codigo: "tipo-sin-uso", esTributario: false, tiposComprobanteAplicables: [] }`
- **Then** respuesta **201 Created** con `tiposComprobanteAplicables: []`
- _Nota: array vacío es válido — significa que el admin ha deshabilitado este tipo para toda asociación_

### 3.2 Crear DocumentoFisico

**E-D-01: Crear documento físico no-tributario exitoso**
- **Given** CONTADOR autenticado en tenant `acme` con permiso `contabilidad.documentos-fisicos.create`
- **And** existe `TipoDocumentoFisico` id=`tipo-recibo` con `activo: true` en tenant `acme`
- **When** envía `POST /api/documentos-fisicos` con `{ tipoDocumentoFisicoId: "tipo-recibo", numero: "rec-0042", fechaEmision: "2026-03-15", monto: "1500.00", moneda: "BOB" }`
- **Then** respuesta **201 Created** con `{ id, numero: "REC-0042", fechaEmision: "2026-03-15", monto: "1500.00", moneda: "BOB", organizationId: "acme-id", tipoDocumentoFisico: { id, nombre, codigo, esTributario } }`
- **And** el `numero` se persistió normalizado en uppercase: `"REC-0042"`

**E-D-02: Normalización de numero (trim + uppercase)**
- **When** CONTADOR envía `POST /api/documentos-fisicos` con `{ numero: "  a-001  ", ... }`
- **Then** respuesta **201 Created** con `numero: "A-001"` en la respuesta
- **And** la unicidad se evalúa contra `"A-001"`

**E-D-03: Numero duplicado en mismo tipo y tenant**
- **Given** ya existe `DocumentoFisico` con `tipoDocumentoFisicoId: "tipo-recibo"` y `numero: "REC-0042"` en tenant `acme`
- **When** CONTADOR crea otro con el mismo tipo y número (incluso con distinta capitalización `"rec-0042"`)
- **Then** respuesta **409 Conflict** con `{ error: { code: "DOCUMENTO_FISICO_NUMERO_DUPLICADO", ... } }`

**E-D-04: Mismo numero con tipo distinto es válido**
- **Given** existe `DocumentoFisico` con `tipoDocumentoFisicoId: "tipo-recibo"` y `numero: "001"` en tenant `acme`
- **When** CONTADOR crea `DocumentoFisico` con `tipoDocumentoFisicoId: "tipo-factura"` y `numero: "001"`
- **Then** respuesta **201 Created** — la unicidad es por `(tenant, tipo, numero)`

**E-D-05: Tipo inactivo no permite crear documentos**
- **Given** `TipoDocumentoFisico` id=`tipo-inactivo` tiene `activo: false`
- **When** CONTADOR intenta crear `DocumentoFisico` con ese tipo
- **Then** respuesta **422 Unprocessable Entity** con `{ error: { code: "TIPO_DOCUMENTO_FISICO_INACTIVO", ... } }`

**E-D-06: Tipo de otro tenant no es visible**
- **Given** `TipoDocumentoFisico` id=`tipo-beta` pertenece a tenant `beta`
- **When** CONTADOR de tenant `acme` intenta crear documento con `tipoDocumentoFisicoId: "tipo-beta"`
- **Then** respuesta **404 Not Found** con `{ error: { code: "TIPO_DOCUMENTO_FISICO_NO_ENCONTRADO", ... } }`

**E-D-07: Monto debe ser positivo**
- **When** CONTADOR envía `{ monto: "0.00", ... }`
- **Then** respuesta **400 Bad Request** (validación de DTO)

**E-D-08: Crear documento con contacto válido**
- **Given** existe `Contacto` id=`contacto-1` activo en tenant `acme`
- **When** CONTADOR envía `POST /api/documentos-fisicos` con `{ ..., contactoId: "contacto-1" }`
- **Then** respuesta **201 Created** con `contacto: { id, razonSocial }`

**E-D-09: Crear documento con contacto inactivo**
- **Given** existe `Contacto` id=`contacto-inactivo` con `activo: false` en tenant `acme`
- **When** CONTADOR envía `POST /api/documentos-fisicos` con `{ ..., contactoId: "contacto-inactivo" }`
- **Then** respuesta **201 Created** — contacto inactivo se permite al crear (puede haberse desactivado mientras el contador editaba)

**E-D-10: Crear documento con contacto de otro tenant**
- **Given** `Contacto` id=`contacto-beta` pertenece a tenant `beta`
- **When** CONTADOR de tenant `acme` envía `POST /api/documentos-fisicos` con `{ ..., contactoId: "contacto-beta" }`
- **Then** respuesta **404 Not Found** con `{ error: { code: "CONTACTO_NO_ENCONTRADO", ... } }`

**E-D-11: Listar documentos con filtro por estado de asociacion**
- **Given** tenant `acme` tiene 5 documentos: 2 sueldos, 2 en borradores, 1 contabilizado
- **When** CONTADOR envía `GET /api/documentos-fisicos?estadoAsociacion=SUELTO`
- **Then** respuesta **200 OK** con solo los 2 documentos sueltos; ningún registro de otro tenant

**E-D-12: Ver detalle de documento incluye lista de comprobantes asociados**
- **Given** `DocumentoFisico` id=`doc-1` está asociado a `Comprobante` id=`comp-1` (BORRADOR) y `comp-2` (BORRADOR)
- **When** CONTADOR envía `GET /api/documentos-fisicos/doc-1`
- **Then** respuesta incluye `comprobantesAsociados: [{ id: "comp-1", numero: null, estado: "BORRADOR" }, { id: "comp-2", ... }]`

**E-D-13: Crear documento físico tributario con monto y moneda → 201 OK**
- **Given** existe `TipoDocumentoFisico` id=`tipo-factura-emitida` con `esTributario: true` en tenant `acme`
- **When** CONTADOR envía `POST /api/documentos-fisicos` con `{ tipoDocumentoFisicoId: "tipo-factura-emitida", numero: "FC-001", fechaEmision: "2026-04-01", monto: "1150.00", moneda: "BOB" }`
- **Then** respuesta **201 Created** con `monto: "1150.00"` y `moneda: "BOB"`

**E-D-14: Crear documento físico tributario sin monto → 422**
- **Given** existe `TipoDocumentoFisico` id=`tipo-factura-emitida` con `esTributario: true` en tenant `acme`
- **When** CONTADOR envía `POST /api/documentos-fisicos` con `{ tipoDocumentoFisicoId: "tipo-factura-emitida", numero: "FC-002", fechaEmision: "2026-04-01" }` (sin `monto` ni `moneda`)
- **Then** respuesta **422 Unprocessable Entity** con `{ error: { code: "DOCUMENTO_FISICO_MONTO_REQUERIDO_PARA_TRIBUTARIO", ... } }`

**E-D-15: Crear documento físico no-tributario sin monto → 201 OK**
- **Given** existe `TipoDocumentoFisico` id=`tipo-recibo-egreso` con `esTributario: false` en tenant `acme`
- **When** CONTADOR envía `POST /api/documentos-fisicos` con `{ tipoDocumentoFisicoId: "tipo-recibo-egreso", numero: "RE-001", fechaEmision: "2026-04-01" }` (sin `monto` ni `moneda`)
- **Then** respuesta **201 Created** con `monto: null` y `moneda: null`

**E-D-16: Crear documento físico no-tributario con monto → 422**
- **Given** existe `TipoDocumentoFisico` id=`tipo-recibo-egreso` con `esTributario: false` en tenant `acme`
- **When** CONTADOR envía `POST /api/documentos-fisicos` con `{ tipoDocumentoFisicoId: "tipo-recibo-egreso", numero: "RE-002", fechaEmision: "2026-04-01", monto: "500.00", moneda: "BOB" }`
- **Then** respuesta **422 Unprocessable Entity** con `{ error: { code: "DOCUMENTO_FISICO_MONTO_NO_PERMITIDO_PARA_NO_TRIBUTARIO", ... } }`

### 3.3 Asociar y desasociar a Comprobante

**E-A-01: Asociar un documento físico a un borrador exitoso**
- **Given** `Comprobante` id=`comp-borrador` está en estado BORRADOR en tenant `acme`
- **And** `DocumentoFisico` id=`doc-libre` existe en tenant `acme` y no está asociado a ningún comprobante
- **When** CONTADOR envía `POST /api/comprobantes/comp-borrador/documentos-fisicos` con `{ documentoFisicoIds: ["doc-libre"] }`
- **Then** respuesta **200 OK** con la lista actualizada de documentos del comprobante
- **And** existe fila en `ComprobanteDocumentoFisico(comprobanteId: "comp-borrador", documentoFisicoId: "doc-libre")`

**E-A-02: Asociar el mismo documento a dos borradores simultáneamente**
- **Given** `DocumentoFisico` id=`doc-1` existe y no está contabilizado
- **And** existen `Comprobante` id=`comp-A` y `comp-B` ambos en BORRADOR
- **When** CONTADOR asocia `doc-1` a `comp-A` y luego a `comp-B`
- **Then** ambas asociaciones se crean exitosamente (201/200)
- **And** la tabla tiene dos filas: `(comp-A, doc-1)` y `(comp-B, doc-1)`

**E-A-03: Contabilizar un comprobante con documentos asociados — el segundo contabilizar falla por conflicto**
- **Given** `doc-1` está asociado a `comp-A` (BORRADOR) y `comp-B` (BORRADOR)
- **When** `comp-A` se contabiliza (estado → CONTABILIZADO)
- **Then** `comp-A` contabiliza exitosamente
- **When** `comp-B` intenta contabilizarse
- **Then** respuesta **409 Conflict** con `{ error: { code: "DOCUMENTO_FISICO_YA_CONTABILIZADO_EN_OTRO_COMPROBANTE", details: { documentoFisicoId: "doc-1", comprobanteContabilizadoId: "comp-A" } } }`

**E-A-04: Desasociar documento de borrador exitoso**
- **Given** `doc-1` está asociado a `comp-borrador` (BORRADOR)
- **When** CONTADOR envía `DELETE /api/comprobantes/comp-borrador/documentos-fisicos/doc-1`
- **Then** respuesta **204 No Content**
- **And** no existe fila en `ComprobanteDocumentoFisico(comp-borrador, doc-1)`
- **And** `doc-1` sigue existiendo en BD

**E-A-05: Desasociar documento de comprobante contabilizado falla**
- **Given** `doc-1` está asociado a `comp-contabilizado` (CONTABILIZADO)
- **When** CONTADOR envía `DELETE /api/comprobantes/comp-contabilizado/documentos-fisicos/doc-1`
- **Then** respuesta **409 Conflict** con `{ error: { code: "COMPROBANTE_DOCUMENTO_NO_DESASOCIABLE_CONTABILIZADO", ... } }`

**E-A-06: Anular comprobante desasocia automáticamente sus documentos**
- **Given** `comp-contabilizado` (CONTABILIZADO) tiene `doc-1` y `doc-2` asociados
- **When** el comprobante se anula (estado → ANULADO)
- **Then** las filas de `ComprobanteDocumentoFisico` vinculadas a `comp-contabilizado` se eliminan en la misma TX
- **And** `doc-1` y `doc-2` persisten en BD con estado derivado `SUELTO`
- **And** `doc-1` y `doc-2` pueden re-asociarse a otro comprobante

**E-A-07: Asociar documento de otro tenant falla**
- **Given** `doc-beta` pertenece a tenant `beta`
- **And** `comp-acme` pertenece a tenant `acme`
- **When** CONTADOR de tenant `acme` intenta `POST /api/comprobantes/comp-acme/documentos-fisicos` con `{ documentoFisicoIds: ["doc-beta"] }`
- **Then** respuesta **404 Not Found** con `{ error: { code: "DOCUMENTO_FISICO_NO_ENCONTRADO", ... } }`

**E-A-08: Asociar múltiples documentos en una sola llamada**
- **Given** `comp-borrador` existe y `doc-1`, `doc-2`, `doc-3` son documentos válidos del mismo tenant
- **When** CONTADOR envía `POST /api/comprobantes/comp-borrador/documentos-fisicos` con `{ documentoFisicoIds: ["doc-1", "doc-2", "doc-3"] }`
- **Then** respuesta **200 OK** — las 3 asociaciones se crean en una sola operación

**E-A-09: Asociar Recibo de Egreso a Comprobante INGRESO → 422**
- **Given** `doc-recibo-egreso` tiene tipo `recibo-egreso` (con `tiposComprobanteAplicables: [EGRESO, DIARIO]`)
- **And** `comp-ingreso` es un `Comprobante` de tipo `INGRESO` en estado BORRADOR
- **When** CONTADOR envía `POST /api/comprobantes/comp-ingreso/documentos-fisicos` con `{ documentoFisicoIds: ["doc-recibo-egreso"] }`
- **Then** respuesta **422 Unprocessable Entity** con `{ error: { code: "TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE", details: { tipoDocumento: "Recibo de egreso", tipoComprobante: "INGRESO", tiposPermitidos: ["EGRESO", "DIARIO"] } } }`

**E-A-10: Asociar Factura Emitida a Comprobante INGRESO → asociación creada**
- **Given** `doc-factura` tiene tipo `factura-emitida` (con `tiposComprobanteAplicables: [INGRESO, DIARIO]`)
- **And** `comp-ingreso` es un `Comprobante` de tipo `INGRESO` en estado BORRADOR
- **When** CONTADOR envía `POST /api/comprobantes/comp-ingreso/documentos-fisicos` con `{ documentoFisicoIds: ["doc-factura"] }`
- **Then** respuesta **200 OK** — la asociación se crea exitosamente

**E-A-11: Asociar Comprobante Interno (todos los tipos) a Comprobante TRASPASO → asociación creada**
- **Given** `doc-interno` tiene tipo `comprobante-interno` (con `tiposComprobanteAplicables: [APERTURA, DIARIO, INGRESO, EGRESO, AJUSTE, TRASPASO, CIERRE]`)
- **And** `comp-traspaso` es un `Comprobante` de tipo `TRASPASO` en estado BORRADOR
- **When** CONTADOR envía `POST /api/comprobantes/comp-traspaso/documentos-fisicos` con `{ documentoFisicoIds: ["doc-interno"] }`
- **Then** respuesta **200 OK** — la asociación se crea exitosamente (TRASPASO está en la lista)

### 3.4 Multi-tenancy

**E-MT-01: Query de listado nunca retorna registros de otro tenant**
- **Given** tenant `acme` tiene 3 documentos físicos y tenant `beta` tiene 2
- **When** CONTADOR de `acme` envía `GET /api/documentos-fisicos`
- **Then** respuesta contiene solo los 3 documentos de `acme`; ningún documento de `beta`

**E-MT-02: Acceso cross-tenant retorna 404**
- **Given** `doc-beta` pertenece a tenant `beta`
- **When** CONTADOR de tenant `acme` envía `GET /api/documentos-fisicos/doc-beta`
- **Then** respuesta **404 Not Found** — no se confirma ni niega la existencia del recurso en otro tenant

**E-MT-03: Request sin JWT válido retorna 401**
- **When** se envía `GET /api/documentos-fisicos` sin token de autenticación
- **Then** respuesta **401 Unauthorized**

**E-MT-04: Request con JWT sin permiso retorna 403**
- **Given** usuario autenticado en tenant `acme` SIN permiso `contabilidad.documentos-fisicos.read`
- **When** envía `GET /api/documentos-fisicos`
- **Then** respuesta **403 Forbidden**

### 3.5 Editabilidad

**E-E-01: Editar documento suelto (sin asociaciones)**
- **Given** `doc-suelto` no tiene asociaciones con ningún comprobante
- **When** CONTADOR envía `PATCH /api/documentos-fisicos/doc-suelto` con `{ numero: "REC-0099", monto: "2000.00" }`
- **Then** respuesta **200 OK** con los valores actualizados

**E-E-02: Editar documento asociado solo a borradores**
- **Given** `doc-en-borrador` está asociado únicamente a `comp-borrador` (BORRADOR)
- **When** CONTADOR envía `PATCH /api/documentos-fisicos/doc-en-borrador` con `{ monto: "500.00" }`
- **Then** respuesta **200 OK** — asociación con borrador no impide editar

**E-E-03: Editar documento asociado a un contabilizado falla**
- **Given** `doc-contabilizado` está asociado a `comp-contabilizado` (CONTABILIZADO)
- **When** CONTADOR envía `PATCH /api/documentos-fisicos/doc-contabilizado` con `{ monto: "999.00" }`
- **Then** respuesta **409 Conflict** con `{ error: { code: "DOCUMENTO_FISICO_INMUTABLE_POR_COMPROBANTE_CONTABILIZADO", details: { documentoFisicoId, comprobanteContabilizadoId } } }`

**E-E-04: Documento asociado a borrador Y contabilizado — falla igual**
- **Given** `doc-mixto` está asociado a `comp-borrador` (BORRADOR) Y a `comp-contabilizado` (CONTABILIZADO)
- **When** CONTADOR intenta editar `doc-mixto`
- **Then** respuesta **409 Conflict** — el contabilizado tiene precedencia, bloquea la edición

**E-E-05: Normalización en edición también aplica uppercase**
- **Given** `doc-suelto` tiene `numero: "REC-001"`
- **When** CONTADOR envía `PATCH` con `{ numero: "  rec-002  " }`
- **Then** respuesta **200 OK** con `numero: "REC-002"` (normalizado)

### 3.6 Eliminación

**E-EL-01: Eliminar documento nunca asociado**
- **Given** `doc-nuevo` se creó hace 5 minutos y no tiene ninguna asociación (`ComprobanteDocumentoFisico` no tiene filas con ese id)
- **When** CONTADOR envía `DELETE /api/documentos-fisicos/doc-nuevo`
- **Then** respuesta **204 No Content**
- **And** el registro ya no existe en BD

**E-EL-02: Eliminar documento que alguna vez tuvo asociación (aunque el comprobante se anuló)**
- **Given** `doc-historico` estuvo asociado a `comp-anulado` (ANULADO), la asociación se eliminó al anular
- **And** `doc-historico` actualmente no tiene filas activas en `ComprobanteDocumentoFisico`
- **When** CONTADOR intenta `DELETE /api/documentos-fisicos/doc-historico`
- **Then** respuesta **409 Conflict** con `{ error: { code: "DOCUMENTO_FISICO_CON_HISTORIAL", ... } }`
- _Nota_: la permanencia se evalúa con una tabla de auditoría/historial o flag `tuvoAsociacion` marcado al primer INSERT de asociación — detalle de diseño a resolver en design.

**E-EL-03: Eliminar documento actualmente asociado a un borrador**
- **Given** `doc-en-borrador` está actualmente asociado a `comp-borrador` (BORRADOR)
- **When** CONTADOR intenta `DELETE /api/documentos-fisicos/doc-en-borrador`
- **Then** respuesta **409 Conflict** con `{ error: { code: "DOCUMENTO_FISICO_REFERENCIADO_POR_COMPROBANTE", details: { comprobanteId, estado: "BORRADOR" } } }`

**E-EL-04: Eliminar TipoDocumentoFisico con documentos**
- **Given** `tipo-activo` tiene al menos un `DocumentoFisico` asociado
- **When** ADMIN envía `DELETE /api/tipos-documento-fisico/tipo-activo`
- **Then** respuesta **409 Conflict** con `{ error: { code: "TIPO_DOCUMENTO_FISICO_CON_DOCUMENTOS", ... } }`

### 3.7 Seed inicial

**E-SEED-01: Al crear organización se siembran 8 tipos**
- **Given** se crea una organización nueva `nueva-org`
- **When** se consulta `GET /api/tipos-documento-fisico` con credenciales de `nueva-org`
- **Then** respuesta **200 OK** con exactamente 8 tipos: los del catálogo universal (REQ-SEED-01)
- **And** los 4 tributarios (`factura-recibida`, `factura-emitida`, `nota-credito-emitida`, `nota-debito-emitida`) tienen `esTributario: true`
- **And** los 4 no tributarios tienen `esTributario: false`
- **And** todos tienen `activo: true`

**E-SEED-02: El seed es idempotente**
- **Given** el seed ya se ejecutó para `org-A`
- **When** el seed se ejecuta nuevamente para `org-A` (ej. por re-provisioning)
- **Then** no se crean duplicados — el conteo sigue siendo 8 tipos

**E-SEED-03: Los tipos sembrados son editables por el admin**
- **Given** `org-A` fue recién creada y tiene el tipo `vale-caja-chica`
- **When** OWNER de `org-A` envía `PATCH /api/tipos-documento-fisico/<id>` con `{ activo: false }`
- **Then** respuesta **200 OK** — el tipo puede desactivarse

**E-SEED-04: Los 8 tipos sembrados tienen tiposComprobanteAplicables exactamente según la matriz**
- **Given** se crea una organización nueva `nueva-org`
- **When** se consulta `GET /api/tipos-documento-fisico` con credenciales de `nueva-org`
- **Then** cada tipo del catálogo universal tiene `tiposComprobanteAplicables` con los valores exactos de la matriz de REQ-SEED-01 (ej. `factura-emitida` → `[INGRESO, DIARIO]`, `comprobante-interno` → los 7 tipos)

---

## 4. Códigos de error

Todos extienden `DomainError`. El `GlobalExceptionFilter` los mapea al formato estándar (CLAUDE.md §6.4).

### 4.1 TipoDocumentoFisico

| Code | HTTP | Mensaje | Cuándo |
|------|------|---------|--------|
| `TIPO_DOCUMENTO_FISICO_NO_ENCONTRADO` | 404 | El tipo de documento físico no existe | findById cross-tenant o id inválido |
| `TIPO_DOCUMENTO_FISICO_CODIGO_DUPLICADO` | 409 | Ya existe un tipo con el código '{codigo}' en esta organización | UNIQUE `(organizationId, codigo)` violation |
| `TIPO_DOCUMENTO_FISICO_NOMBRE_DUPLICADO` | 409 | Ya existe un tipo con el nombre '{nombre}' en esta organización | UNIQUE `(organizationId, nombre)` violation |
| `TIPO_DOCUMENTO_FISICO_CON_DOCUMENTOS` | 409 | No se puede eliminar el tipo porque tiene documentos físicos asociados. Desactivalo en su lugar. | DELETE con FK activa (DocumentoFisico.tipoDocumentoFisicoId) |
| `TIPO_DOCUMENTO_FISICO_INACTIVO` | 422 | El tipo de documento físico está inactivo y no acepta documentos nuevos | Crear DocumentoFisico con tipo `activo = false` |

### 4.2 DocumentoFisico

| Code | HTTP | Mensaje | Cuándo |
|------|------|---------|--------|
| `DOCUMENTO_FISICO_NO_ENCONTRADO` | 404 | El documento físico no existe | findById cross-tenant o id inválido |
| `DOCUMENTO_FISICO_NUMERO_DUPLICADO` | 409 | Ya existe un documento con el número '{numero}' para ese tipo en esta organización | UNIQUE `(organizationId, tipoDocumentoFisicoId, numero)` violation |
| `DOCUMENTO_FISICO_INMUTABLE_POR_COMPROBANTE_CONTABILIZADO` | 409 | El documento físico no puede editarse porque está vinculado a un comprobante contabilizado | PATCH sobre documento con asociación CONTABILIZADA |
| `DOCUMENTO_FISICO_REFERENCIADO_POR_COMPROBANTE` | 409 | El documento físico no puede eliminarse porque está referenciado por un comprobante | DELETE con asociación activa (borrador o contabilizado) |
| `DOCUMENTO_FISICO_CON_HISTORIAL` | 409 | El documento físico no puede eliminarse porque tiene historial de asociaciones contables | DELETE sobre documento que tuvo asociación (aunque ya se anuló) |
| `DOCUMENTO_FISICO_NUMERO_FORMATO_INVALIDO` | 400 | El número del documento solo puede contener letras mayúsculas, dígitos y los caracteres . / - | Valor no coincide con `^[A-Z0-9./-]+$` post-normalización |
| `DOCUMENTO_FISICO_MONTO_REQUERIDO_PARA_TRIBUTARIO` | 422 | El tipo de documento tributario requiere monto y moneda | Crear/editar doc con `tipo.esTributario=true` y `monto` o `moneda` nulos — incluir `details.campo` indicando qué faltó |
| `DOCUMENTO_FISICO_MONTO_NO_PERMITIDO_PARA_NO_TRIBUTARIO` | 422 | El tipo de documento no tributario no debe llevar monto ni moneda | Crear/editar doc con `tipo.esTributario=false` y `monto` o `moneda` no nulos — incluir `details.campo` indicando cuál sobra |

### 4.3 Asociación Comprobante ↔ DocumentoFisico

| Code | HTTP | Mensaje | Cuándo |
|------|------|---------|--------|
| `DOCUMENTO_FISICO_YA_CONTABILIZADO_EN_OTRO_COMPROBANTE` | 409 | El documento físico '{numero}' ya está vinculado a otro comprobante contabilizado | Al contabilizar: UNIQUE parcial violation en ComprobanteDocumentoFisico |
| `COMPROBANTE_DOCUMENTO_NO_DESASOCIABLE_CONTABILIZADO` | 409 | No se puede desasociar un documento de un comprobante contabilizado | DELETE en endpoint de asociación cuando comprobante = CONTABILIZADO |
| `TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE` | 422 | El tipo de documento '{nombre}' no es aplicable a comprobantes de tipo {tipo}. Tipos permitidos: {lista} | Al asociar: `tiposComprobanteAplicables` del tipo no incluye el `tipo` del comprobante (REQ-A-11) |

### 4.4 Errores en módulo `comprobantes` (al contabilizar)

Viven en `comprobantes/domain/comprobante-errors.ts`:

| Code | HTTP | Mensaje | Cuándo |
|------|------|---------|--------|
| `DOCUMENTO_FISICO_REFERENCIADO_NO_EXISTE` | 422 | El documento físico referenciado no existe en esta organización | Al contabilizar: id no existe o es cross-tenant |
| `DOCUMENTO_FISICO_YA_ASOCIADO_A_OTRO_CONTABILIZADO` | 422 | El documento físico '{numero}' ya está contabilizado en otro comprobante | Al contabilizar: el reader port detecta conflicto de asociación |

---

## 5. Endpoints

### 5.1 TipoDocumentoFisico

| Método | Path | Permiso requerido | Body / Query | Response |
|--------|------|-------------------|--------------|---------|
| `GET` | `/api/tipos-documento-fisico` | `contabilidad.tipos-documento-fisico.read` | — | `TipoDocumentoFisicoDto[]` (ordenado esTributario DESC, nombre ASC) |
| `POST` | `/api/tipos-documento-fisico` | `contabilidad.tipos-documento-fisico.create` | `CreateTipoDocumentoFisicoDto` | `TipoDocumentoFisicoDto` (201) |
| `PATCH` | `/api/tipos-documento-fisico/:id` | `contabilidad.tipos-documento-fisico.update` | `UpdateTipoDocumentoFisicoDto` (sin `codigo`) | `TipoDocumentoFisicoDto` (200) |
| `DELETE` | `/api/tipos-documento-fisico/:id` | `contabilidad.tipos-documento-fisico.delete` | — | 204 No Content |

### 5.2 DocumentoFisico

| Método | Path | Permiso requerido | Body / Query | Response |
|--------|------|-------------------|--------------|---------|
| `GET` | `/api/documentos-fisicos` | `contabilidad.documentos-fisicos.read` | `ListarDocumentosFisicosDto` (query params) | `{ data: DocumentoFisicoDto[], total, page, pageSize }` |
| `GET` | `/api/documentos-fisicos/:id` | `contabilidad.documentos-fisicos.read` | — | `DocumentoFisicoDetalleDto` (con tipo, contacto, comprobantes asociados) |
| `POST` | `/api/documentos-fisicos` | `contabilidad.documentos-fisicos.create` | `CreateDocumentoFisicoDto` | `DocumentoFisicoDto` (201) |
| `PATCH` | `/api/documentos-fisicos/:id` | `contabilidad.documentos-fisicos.update` | `UpdateDocumentoFisicoDto` | `DocumentoFisicoDto` (200) |
| `DELETE` | `/api/documentos-fisicos/:id` | `contabilidad.documentos-fisicos.delete` | — | 204 No Content |

### 5.3 Asociación (endpoints bajo Comprobantes)

| Método | Path | Permiso requerido | Body | Response |
|--------|------|-------------------|------|---------|
| `GET` | `/api/comprobantes/:comprobanteId/documentos-fisicos` | `contabilidad.documentos-fisicos.read` | — | `DocumentoFisicoAsociadoDto[]` |
| `POST` | `/api/comprobantes/:comprobanteId/documentos-fisicos` | `contabilidad.documentos-fisicos.update` + `contabilidad.asientos.update` | `{ documentoFisicoIds: string[] }` | `DocumentoFisicoAsociadoDto[]` (200); puede retornar 422 con `TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE`, `DOCUMENTO_FISICO_MONTO_NO_PERMITIDO_PARA_NO_TRIBUTARIO` (si hay tipo mixto), o cualquier error de REQ-A-11 |
| `DELETE` | `/api/comprobantes/:comprobanteId/documentos-fisicos/:documentoFisicoId` | `contabilidad.documentos-fisicos.update` + `contabilidad.asientos.update` | — | 204 No Content |

### 5.4 Filtros de GET listado `/api/documentos-fisicos`

| Param | Tipo | Descripción |
|-------|------|-------------|
| `tipoDocumentoFisicoId` | `string` (UUID) | Filtrar por tipo |
| `fechaDesde` | `string` (YYYY-MM-DD) | Fecha emisión desde (inclusive) |
| `fechaHasta` | `string` (YYYY-MM-DD) | Fecha emisión hasta (inclusive) |
| `contactoId` | `string` (UUID) | Filtrar por contacto |
| `estadoAsociacion` | `SUELTO \| EN_BORRADOR \| CONTABILIZADO` | Estado derivado del documento |
| `numero` | `string` | Texto libre, búsqueda `ILIKE %numero%` |
| `page` | `number` (default 1) | Número de página (offset) |
| `pageSize` | `number` (default 20, max 100) | Tamaño de página |

---

## 6. Coverage objetivo

| Tipo | Target | Descripción |
|------|--------|-------------|
| Unit — domain VOs + validators | ≥ 95% | `NumeroDocumento` (normalización, regex), `TipoDocumentoFisico` validator (nombre, codigo), `DocumentoFisico` validator (monto > 0, fechaEmision), errores de dominio |
| Unit — service | ≥ 85% | Mocks de ports; cubre cada rama: crear/editar/eliminar con y sin asociaciones, seed, contabilizar con docs |
| Integration — adapters Prisma | ≥ 80% | Cada método del repositorio contra Postgres real; UNIQUE parcial (constraint `WHERE CONTABILIZADO`); cleanup atómico al anular; paginado; filtros por estadoAsociacion |
| E2E | Golden path + errores clave | Por cada endpoint: 201/200/204 golden path; 401 sin auth; 403 sin permiso; 404 cross-tenant; 409 conflictos principales |
| **Global** | **≥ 80%** | Línea base CLAUDE.md §10.6 |

---

## 7. DTOs (forma esperada)

```typescript
// CreateTipoDocumentoFisicoDto
{ nombre: string; codigo: string; esTributario: boolean; descripcion?: string; tiposComprobanteAplicables: TipoComprobante[]; }

// UpdateTipoDocumentoFisicoDto (codigo ausente — inmutable)
{ nombre?: string; esTributario?: boolean; activo?: boolean; descripcion?: string; tiposComprobanteAplicables?: TipoComprobante[]; }

// TipoDocumentoFisicoDto (respuesta)
{ id: string; nombre: string; codigo: string; esTributario: boolean; activo: boolean; descripcion?: string; tiposComprobanteAplicables: TipoComprobante[]; organizationId: string; createdAt: string; updatedAt: string; }

// CreateDocumentoFisicoDto
{ tipoDocumentoFisicoId: string; numero: string; fechaEmision: string; monto?: string | null; moneda?: "BOB" | "USD" | null; contactoId?: string; glosa?: string; }
// Nota: monto y moneda son opcionales en el DTO (validación condicional en service según esTributario)

// UpdateDocumentoFisicoDto (todos opcionales)
{ tipoDocumentoFisicoId?: string; numero?: string; fechaEmision?: string; monto?: string | null; moneda?: "BOB" | "USD" | null; contactoId?: string; glosa?: string; }

// DocumentoFisicoDto (listado)
{ id: string; numero: string; fechaEmision: string; monto: string | null; moneda: string | null; glosa?: string; tipoDocumentoFisico: { id: string; nombre: string; codigo: string; esTributario: boolean; }; contacto?: { id: string; razonSocial: string; }; organizationId: string; createdAt: string; }

// DocumentoFisicoDetalleDto (extends DocumentoFisicoDto, agrega)
{ comprobantesAsociados: { id: string; numero: string | null; estado: string; }[]; }

// DocumentoFisicoAsociadoDto (en endpoint de comprobante)
{ id: string; numero: string; tipoDocumentoFisico: { id: string; nombre: string; }; monto: string | null; moneda: string | null; fechaEmision: string; }

// ListarDocumentosFisicosDto (query)
{ tipoDocumentoFisicoId?: string; fechaDesde?: string; fechaHasta?: string; contactoId?: string; estadoAsociacion?: "SUELTO" | "EN_BORRADOR" | "CONTABILIZADO"; numero?: string; page?: number; pageSize?: number; }
```

---

**Fin del spec.**
