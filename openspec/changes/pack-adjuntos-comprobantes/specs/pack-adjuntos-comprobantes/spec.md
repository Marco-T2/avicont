# Especificación: Pack "Adjuntos a comprobantes"

<!--
Última edición: 2026-06-10
Última revisión contra core: 2026-06-10
Owner: backend-lead
-->

## Propósito

Capability NUEVA. Permite adjuntar archivos de respaldo digital (PDF, planillas, fotos
de recibo) directamente a un comprobante contable. Funcionalidad OPCIONAL de pago,
gateada por el pack `contabilidad.adjuntos`. El binario vive en MinIO (detrás de un
`StoragePort`); la BD guarda solo metadata y la key del objeto.

---

## Requisitos

### Requisito: Subir adjunto a un comprobante

El sistema DEBE aceptar la subida de un archivo de respaldo a un comprobante identificado
por su id. El archivo DEBE pertenecer a la org activa del usuario (`organizationId` del
JWT). El sistema DEBE validar el tipo MIME por **magic bytes**, ignorando el header
`content-type`. El sistema DEBE retornar la metadata del adjunto creado con HTTP 201.

**Whitelist de tipos MIME**: `application/pdf`, `application/vnd.ms-excel`,
`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
`application/msword`,
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
`text/plain`, `image/png`, `image/jpeg`.

> **DECISIÓN A CONFIRMAR (D-01)**: ¿Puede adjuntarse a un comprobante ANULADO? La
> propuesta no cerró este caso. Se propone: adjuntos gestionables en cualquier estado
> del comprobante (`BORRADOR`, `CONTABILIZADO`, `ANULADO`) mientras el período fiscal
> esté **abierto**. Si el período está cerrado o bloqueado, se rechaza la subida y el
> borrado con error `ADJUNTO_PERIODO_CERRADO`. Marco debe confirmar.

#### Escenario: Subir archivo válido — happy path

- DADO que la org tiene el pack `contabilidad.adjuntos` activo
- Y el usuario tiene permiso `contabilidad.asientos.update`
- Y el comprobante pertenece a la org activa
- Y el período fiscal del comprobante está abierto
- CUANDO se sube un archivo PDF de 1 MB con magic bytes PDF válidos
- ENTONCES el sistema responde 201 con `{ id, nombreOriginal, mimeType, tamanoBytes, createdAt }`
- Y el adjunto queda guardado en storage con key `{tenantId}/{comprobanteId}/{uuid}-{nombreSaneado}`

#### Escenario: Rechazo por tipo MIME no permitido (magic bytes)

- DADO que la org tiene el pack activo y el usuario tiene permiso `asientos.update`
- CUANDO se sube un archivo `.exe` renombrado como `.pdf` (content-type: `application/pdf`)
- ENTONCES el sistema responde 422 con código `ADJUNTO_MIME_NO_PERMITIDO`
- Y el archivo NO se guarda en storage

#### Escenario: Rechazo por tamaño superior a 25 MB

- DADO que la org tiene el pack activo y el usuario tiene permiso `asientos.update`
- CUANDO se sube un archivo de 26 MB con tipo MIME válido
- ENTONCES el sistema responde 422 con código `ADJUNTO_TAMANO_EXCEDIDO`

#### Escenario: Rechazo por exceder 10 adjuntos en el comprobante

- DADO que el comprobante ya tiene 10 adjuntos
- Y la org tiene el pack activo y el usuario tiene permiso `asientos.update`
- CUANDO se intenta subir un adjunto adicional
- ENTONCES el sistema responde 422 con código `ADJUNTO_TOPE_COMPROBANTE`

#### Escenario: Rechazo por falta de permiso de escritura

- DADO que la org tiene el pack activo
- Y el usuario tiene permiso `contabilidad.asientos.read` pero NO `contabilidad.asientos.update`
- CUANDO se intenta subir un adjunto
- ENTONCES el sistema responde 403

---

### Requisito: Listar adjuntos de un comprobante

El sistema DEBE retornar todos los adjuntos activos del comprobante que pertenezcan a la
org activa del usuario. El listado DEBE incluir únicamente adjuntos del tenant solicitante.
El sistema DEBE requerir permiso `contabilidad.asientos.read` y pack activo.

#### Escenario: Listar adjuntos — happy path

- DADO que la org tiene el pack activo y el usuario tiene permiso `asientos.read`
- Y el comprobante tiene 3 adjuntos de esa org
- CUANDO se solicita `GET /api/comprobantes/:id/adjuntos`
- ENTONCES el sistema responde 200 con array de 3 items con metadata de cada adjunto

#### Escenario: Comprobante sin adjuntos

- DADO que la org tiene el pack activo y el usuario tiene permiso `asientos.read`
- Y el comprobante no tiene adjuntos
- CUANDO se solicita el listado
- ENTONCES el sistema responde 200 con array vacío `[]`

---

### Requisito: Descargar un adjunto

El sistema DEBE servir el contenido del adjunto como stream HTTP, con el header
`Content-Disposition: attachment; filename="{nombreOriginal}"`. El backend DEBE
verificar `organizationId` + permiso `asientos.read` + pack activo ANTES de abrir el
stream. El sistema NO DEBE usar presigned URLs (saltaría el check de tenant/pack).

#### Escenario: Descarga exitosa

- DADO que la org tiene el pack activo y el usuario tiene permiso `asientos.read`
- Y el adjunto pertenece a la org activa
- CUANDO se solicita `GET /api/comprobantes/:id/adjuntos/:adjuntoId/download`
- ENTONCES el sistema responde 200 con el stream del archivo y `Content-Disposition` correcto

#### Escenario: Aislamiento multi-tenant en descarga

- DADO que el adjunto pertenece a la org B
- Y el usuario pertenece a la org A (con pack activo y permiso `asientos.read`)
- CUANDO el usuario solicita descargar el adjunto de la org B por su id
- ENTONCES el sistema responde 404
- Y NO revela que el adjunto existe en otra org

---

### Requisito: Reemplazar un adjunto existente

El sistema DEBE permitir reemplazar el binario de un adjunto ya existente, actualizando
`storageKey`, `nombreOriginal`, `mimeType`, `tamanoBytes` y `updatedAt`. El id del
adjunto DEBE mantenerse igual. Las mismas validaciones de MIME, tamaño y pack aplican.
El archivo anterior DEBE borrarse del storage tras guardar el nuevo.

#### Escenario: Reemplazo exitoso

- DADO que la org tiene el pack activo y el usuario tiene permiso `asientos.update`
- Y el adjunto pertenece a la org activa
- CUANDO se sube un archivo nuevo sobre el adjunto existente via `PUT /api/comprobantes/:id/adjuntos/:adjuntoId`
- ENTONCES el sistema responde 200 con la metadata actualizada del adjunto
- Y el archivo anterior es eliminado del storage

#### Escenario: Rechazo por tipo MIME no permitido en reemplazo

- DADO las mismas condiciones de permisos y pack
- CUANDO se intenta reemplazar con un archivo de tipo no permitido
- ENTONCES el sistema responde 422 con código `ADJUNTO_MIME_NO_PERMITIDO`
- Y el adjunto anterior NO se modifica

---

### Requisito: Borrar un adjunto

El sistema DEBE permitir borrar un adjunto específico de un comprobante. El borrado
DEBE eliminar tanto la metadata en BD como el objeto en storage. El sistema DEBE requerir
permiso `contabilidad.asientos.update` y pack activo.

#### Escenario: Borrado exitoso

- DADO que la org tiene el pack activo y el usuario tiene permiso `asientos.update`
- Y el adjunto pertenece al comprobante de la org activa
- CUANDO se solicita `DELETE /api/comprobantes/:id/adjuntos/:adjuntoId`
- ENTONCES el sistema responde 204
- Y el objeto es eliminado del storage
- Y la metadata ya no aparece en el listado

#### Escenario: Aislamiento multi-tenant en borrado

- DADO que el adjunto pertenece a la org B
- Y el usuario pertenece a la org A (con pack activo y permiso `asientos.update`)
- CUANDO el usuario intenta borrar el adjunto de la org B
- ENTONCES el sistema responde 404

---

### Requisito: Gating por pack inactivo

El sistema DEBE retornar 404 en todos los endpoints de adjuntos cuando la org no tiene
el pack `contabilidad.adjuntos` activo (sin importar permisos RBAC del usuario). El 404
es deliberado: no revela existencia del endpoint a orgs sin el pack.

#### Escenario: Endpoints inaccesibles sin pack activo

- DADO que la org NO tiene el pack `contabilidad.adjuntos` activo
- Y el usuario tiene permisos `asientos.read` y `asientos.update`
- CUANDO se llama a cualquier endpoint de adjuntos (upload/list/download/delete)
- ENTONCES el sistema responde 404 para todos ellos

---

### Requisito: Borrado en cascada desde el comprobante

El sistema DEBE borrar todos los adjuntos (metadata en BD Y objetos en storage) cuando
se borra el comprobante padre. El borrado en storage DEBE ocurrir como parte del mismo
flujo (compensación si falla parcialmente: ver design).

#### Escenario: Comprobante borrado elimina sus adjuntos

- DADO que un comprobante tiene 3 adjuntos
- CUANDO el comprobante es eliminado del sistema
- ENTONCES los 3 adjuntos desaparecen del listado
- Y los 3 objetos son eliminados del storage

> **DECISIÓN A CONFIRMAR (D-02)**: ¿Es posible borrar un comprobante en estado
> `CONTABILIZADO`? El CLAUDE.md §4.3 indica que no hay transición
> `CONTABILIZADO → BORRADOR`, y §4.7 dice que la anulación es vía flag. No hay
> delete de comprobante en el flujo actual. Si el borrado de comprobante no existe
> en la API, este requisito aplica solo a comprobantes en `BORRADOR`. Marco debe
> confirmar si se prevé borrado físico de comprobantes.

---

### Requisito: Aislamiento multi-tenant estricto

Todo adjunto DEBE llevar `organizationId`. Toda query sobre adjuntos DEBE filtrar por
el `organizationId` del tenant activo. Un tenant NO DEBE acceder a adjuntos de otro
tenant: la respuesta DEBE ser 404 (no 403) para no filtrar existencia de recursos.

#### Escenario: Acceso cross-tenant bloqueado en listado

- DADO que el usuario de la org A solicita adjuntos del comprobante de la org B (por id)
- CUANDO el sistema procesa la solicitud
- ENTONCES responde 404 (el comprobante de B no es visible desde A)

---

### Requisito: Autorización granular basada en permisos del comprobante

El sistema DEBE aplicar autorización diferenciada por acción:
- Listar y descargar: REQUIERE `contabilidad.asientos.read`
- Subir, reemplazar, borrar: REQUIERE `contabilidad.asientos.update`

No se crean permisos nuevos en el catálogo RBAC.

#### Escenario: Solo lectura puede listar y descargar pero no subir

- DADO que la org tiene el pack activo
- Y el usuario tiene `asientos.read` pero NO `asientos.update`
- CUANDO el usuario lista adjuntos → ENTONCES 200
- CUANDO el usuario descarga un adjunto → ENTONCES 200
- CUANDO el usuario sube un adjunto → ENTONCES 403
- CUANDO el usuario borra un adjunto → ENTONCES 403

---

## Notas y decisiones a confirmar

| Id | Descripción | Default propuesto |
|----|-------------|-------------------|
| D-01 | ¿Gestión de adjuntos en comprobante ANULADO? | Permitido si el período está abierto |
| D-02 | ¿Existe borrado físico de comprobantes? | Si no existe, cascada solo aplica a BORRADOR |
