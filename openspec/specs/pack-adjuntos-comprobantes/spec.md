# Pack "Adjuntos a comprobantes" — Spec viva

<!--
Última edición: 2026-06-10
Última revisión contra core: 2026-06-10
Owner: backend-lead
Change de origen: pack-adjuntos-comprobantes (PR #187, main ef9074e)
-->

## Propósito

Primer pack concreto sobre el riel construido (change `packs-riel`, PRs #150–#157).
Permite adjuntar archivos de respaldo digital (PDF, planillas, fotos de recibo)
directamente a un comprobante contable. Funcionalidad OPCIONAL de pago, gateada por
el pack `contabilidad.adjuntos`. El binario vive en MinIO detrás de un `StoragePort`
hexagonal; la BD guarda solo metadata y la key del objeto.

Diseño completo: `docs/disenos/packs-eje2.md`.

**Decisiones cerradas durante la implementación:**
- **D-01**: Adjuntos en comprobante ANULADO = **read-only** (solo ver/descargar;
  subir y borrar rechazados con `ADJUNTO_COMPROBANTE_ANULADO`). Alineado con §4.7.
- **D-02**: No existe borrado físico de comprobantes `CONTABILIZADO` en el sistema
  (§4.7 + §4.3). La cascada de borrado aplica solo a comprobantes en `BORRADOR`.

---

## Schema (`schema.prisma`)

```prisma
model AdjuntoComprobante {
  id              String   @id @default(uuid())
  organizationId  String
  comprobanteId   String
  storageKey      String   @unique          // {tenantId}/{comprobanteId}/{uuid}-{nombreSaneado}
  nombreOriginal  String
  mimeType        String
  tamanoBytes     Int                        // cabe (max 25 MB << 2^31)
  sha256          String?                    // dedup opcional futuro
  subidoPorUserId String
  createdAt       DateTime @default(now()) @db.Timestamptz(3)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  comprobante  Comprobante  @relation(fields: [comprobanteId],  references: [id], onDelete: Cascade)

  @@index([organizationId, comprobanteId])
  @@map("adjuntos_comprobante")
}
```

Migración: `adjuntos_comprobante`. Tabla nativa Prisma (sin raw SQL) → no aplica
el protocolo §11.6.

---

## Ports e interfaces clave

```typescript
export interface StoragePort {
  put(key: string, buffer: Buffer, contentType: string): Promise<void>;
  getStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
```

Adapter: `MinioStorageAdapter` (`@aws-sdk/client-s3` apuntado a MinIO). Swap futuro
a S3/R2 = solo endpoint + credenciales, sin cambiar código.

---

## Endpoints

Todos bajo `@RequirePack('contabilidad.adjuntos')` en el controller de comprobantes
(sub-recurso `:comprobanteId/adjuntos`):

| Método | Ruta | Permiso requerido |
|--------|------|-------------------|
| POST   | `/api/comprobantes/:id/adjuntos` | `contabilidad.asientos.update` |
| GET    | `/api/comprobantes/:id/adjuntos` | `contabilidad.asientos.read` |
| GET    | `/api/comprobantes/:id/adjuntos/:adjuntoId/download` | `contabilidad.asientos.read` |
| PUT    | `/api/comprobantes/:id/adjuntos/:adjuntoId` | `contabilidad.asientos.update` |
| DELETE | `/api/comprobantes/:id/adjuntos/:adjuntoId` | `contabilidad.asientos.update` |

Cadena de guards (controller-level): `JwtAuthGuard → PackEnabledGuard →
ModuleEnabledGuard → PermissionsGuard`.

---

## Requirement: Subir adjunto a un comprobante

El sistema DEBE aceptar la subida de un archivo de respaldo a un comprobante
identificado por su id. El archivo DEBE pertenecer a la org activa del usuario
(`organizationId` del JWT). El sistema DEBE validar el tipo MIME por **magic bytes**
(ignorando el header `content-type`). El sistema DEBE retornar la metadata del
adjunto creado con HTTP 201.

**Whitelist de tipos MIME**: `application/pdf`, `application/vnd.ms-excel`,
`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
`application/msword`,
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
`text/plain`, `image/png`, `image/jpeg`.

Upload: `FileInterceptor` con `memoryStorage`, límite 25 MB en multer.
Key del objeto: `{tenantId}/{comprobanteId}/{uuid}-{nombreSaneado}`.

### Scenario: Subir archivo válido — happy path

- DADO que la org tiene el pack `contabilidad.adjuntos` activo
- Y el usuario tiene permiso `contabilidad.asientos.update`
- Y el comprobante pertenece a la org activa y su período fiscal está abierto
- CUANDO se sube un archivo PDF de 1 MB con magic bytes PDF válidos
- ENTONCES el sistema responde 201 con `{ id, nombreOriginal, mimeType, tamanoBytes, createdAt }`
- Y el adjunto queda guardado en storage con key `{tenantId}/{comprobanteId}/{uuid}-{nombreSaneado}`

### Scenario: Rechazo por tipo MIME no permitido (magic bytes)

- DADO que la org tiene el pack activo y el usuario tiene permiso `asientos.update`
- CUANDO se sube un archivo `.exe` renombrado como `.pdf` (content-type: `application/pdf`)
- ENTONCES el sistema responde 422 con código `ADJUNTO_MIME_NO_PERMITIDO`
- Y el archivo NO se guarda en storage

### Scenario: Rechazo por tamaño superior a 25 MB

- DADO que la org tiene el pack activo y el usuario tiene permiso `asientos.update`
- CUANDO se sube un archivo de 26 MB con tipo MIME válido
- ENTONCES el sistema responde 422 con código `ADJUNTO_TAMANO_EXCEDIDO`

### Scenario: Rechazo por exceder 10 adjuntos en el comprobante

- DADO que el comprobante ya tiene 10 adjuntos
- Y la org tiene el pack activo y el usuario tiene permiso `asientos.update`
- CUANDO se intenta subir un adjunto adicional
- ENTONCES el sistema responde 422 con código `ADJUNTO_TOPE_COMPROBANTE`

### Scenario: Rechazo por falta de permiso de escritura

- DADO que la org tiene el pack activo
- Y el usuario tiene permiso `contabilidad.asientos.read` pero NO `contabilidad.asientos.update`
- CUANDO se intenta subir un adjunto
- ENTONCES el sistema responde 403

### Scenario: Rechazo por comprobante anulado (D-01)

- DADO que el comprobante está en estado `ANULADO`
- Y la org tiene el pack activo y el usuario tiene permiso `asientos.update`
- CUANDO se intenta subir un adjunto
- ENTONCES el sistema responde 422 con código `ADJUNTO_COMPROBANTE_ANULADO`

---

## Requirement: Listar adjuntos de un comprobante

El sistema DEBE retornar todos los adjuntos activos del comprobante que pertenezcan
a la org activa del usuario. El listado DEBE incluir únicamente adjuntos del tenant
solicitante. El sistema DEBE requerir permiso `contabilidad.asientos.read` y pack
activo.

### Scenario: Listar adjuntos — happy path

- DADO que la org tiene el pack activo y el usuario tiene permiso `asientos.read`
- Y el comprobante tiene 3 adjuntos de esa org
- CUANDO se solicita `GET /api/comprobantes/:id/adjuntos`
- ENTONCES el sistema responde 200 con array de 3 items con metadata de cada adjunto

### Scenario: Comprobante sin adjuntos

- DADO que la org tiene el pack activo y el usuario tiene permiso `asientos.read`
- Y el comprobante no tiene adjuntos
- CUANDO se solicita el listado
- ENTONCES el sistema responde 200 con array vacío `[]`

---

## Requirement: Descargar un adjunto

El sistema DEBE servir el contenido del adjunto como stream HTTP, con el header
`Content-Disposition: attachment; filename="{nombreOriginal}"`. El backend DEBE
verificar `organizationId` + permiso `asientos.read` + pack activo ANTES de abrir
el stream. El sistema NO usa presigned URLs (saltarían el check de tenant/pack).

### Scenario: Descarga exitosa

- DADO que la org tiene el pack activo y el usuario tiene permiso `asientos.read`
- Y el adjunto pertenece a la org activa
- CUANDO se solicita `GET /api/comprobantes/:id/adjuntos/:adjuntoId/download`
- ENTONCES el sistema responde 200 con el stream del archivo y `Content-Disposition` correcto

### Scenario: Aislamiento multi-tenant en descarga

- DADO que el adjunto pertenece a la org B
- Y el usuario pertenece a la org A (con pack activo y permiso `asientos.read`)
- CUANDO el usuario solicita descargar el adjunto de la org B por su id
- ENTONCES el sistema responde 404
- Y NO revela que el adjunto existe en otra org

---

## Requirement: Reemplazar un adjunto existente

El sistema DEBE permitir reemplazar el binario de un adjunto ya existente,
actualizando `storageKey`, `nombreOriginal`, `mimeType`, `tamanoBytes` y `updatedAt`.
El id del adjunto DEBE mantenerse igual. Las mismas validaciones de MIME, tamaño y
pack aplican. El archivo anterior DEBE borrarse del storage tras guardar el nuevo.

### Scenario: Reemplazo exitoso

- DADO que la org tiene el pack activo y el usuario tiene permiso `asientos.update`
- Y el adjunto pertenece a la org activa
- CUANDO se sube un archivo nuevo sobre el adjunto existente via `PUT /api/comprobantes/:id/adjuntos/:adjuntoId`
- ENTONCES el sistema responde 200 con la metadata actualizada del adjunto
- Y el archivo anterior es eliminado del storage

### Scenario: Rechazo por tipo MIME no permitido en reemplazo

- DADO las mismas condiciones de permisos y pack
- CUANDO se intenta reemplazar con un archivo de tipo no permitido
- ENTONCES el sistema responde 422 con código `ADJUNTO_MIME_NO_PERMITIDO`
- Y el adjunto anterior NO se modifica

---

## Requirement: Borrar un adjunto

El sistema DEBE permitir borrar un adjunto específico de un comprobante. El borrado
DEBE eliminar tanto la metadata en BD como el objeto en storage. El sistema DEBE
requerir permiso `contabilidad.asientos.update` y pack activo.

### Scenario: Borrado exitoso

- DADO que la org tiene el pack activo y el usuario tiene permiso `asientos.update`
- Y el adjunto pertenece al comprobante de la org activa
- CUANDO se solicita `DELETE /api/comprobantes/:id/adjuntos/:adjuntoId`
- ENTONCES el sistema responde 204
- Y el objeto es eliminado del storage
- Y la metadata ya no aparece en el listado

### Scenario: Aislamiento multi-tenant en borrado

- DADO que el adjunto pertenece a la org B
- Y el usuario pertenece a la org A (con pack activo y permiso `asientos.update`)
- CUANDO el usuario intenta borrar el adjunto de la org B
- ENTONCES el sistema responde 404

### Scenario: Rechazo de borrado en comprobante anulado (D-01)

- DADO que el comprobante está en estado `ANULADO`
- Y la org tiene el pack activo y el usuario tiene permiso `asientos.update`
- CUANDO se intenta borrar un adjunto
- ENTONCES el sistema responde 422 con código `ADJUNTO_COMPROBANTE_ANULADO`

---

## Requirement: Gating por pack inactivo

El sistema DEBE retornar 404 en todos los endpoints de adjuntos cuando la org no
tiene el pack `contabilidad.adjuntos` activo (sin importar permisos RBAC del
usuario). El 404 es deliberado: no revela existencia del endpoint a orgs sin el pack.

### Scenario: Endpoints inaccesibles sin pack activo

- DADO que la org NO tiene el pack `contabilidad.adjuntos` activo
- Y el usuario tiene permisos `asientos.read` y `asientos.update`
- CUANDO se llama a cualquier endpoint de adjuntos (upload/list/download/delete)
- ENTONCES el sistema responde 404 para todos ellos

---

## Requirement: Borrado en cascada desde el comprobante

FK `onDelete: Cascade` en `AdjuntoComprobante.comprobanteId` borra la metadata en
BD automáticamente cuando se borra el comprobante padre. El borrado de objetos en
storage se realiza explícitamente en el service antes de borrar el comprobante. Los
objetos huérfanos (si el borrado de storage falla parcialmente) son aceptados en v1
(job de barrido diferido).

> Aplica solo a comprobantes en `BORRADOR` — no existe borrado físico de
> comprobantes `CONTABILIZADO` en el sistema (D-02, §4.7 + §4.3).

### Scenario: Comprobante borrado elimina sus adjuntos

- DADO que un comprobante en `BORRADOR` tiene 3 adjuntos
- CUANDO el comprobante es eliminado del sistema
- ENTONCES los 3 adjuntos desaparecen del listado
- Y los 3 objetos son eliminados del storage

---

## Requirement: Aislamiento multi-tenant estricto

Todo adjunto DEBE llevar `organizationId`. Toda query sobre adjuntos DEBE filtrar
por el `organizationId` del tenant activo. Un tenant NO DEBE acceder a adjuntos de
otro tenant: la respuesta DEBE ser 404 (no 403) para no filtrar existencia de
recursos.

### Scenario: Acceso cross-tenant bloqueado en listado

- DADO que el usuario de la org A solicita adjuntos del comprobante de la org B
- CUANDO el sistema procesa la solicitud
- ENTONCES responde 404 (el comprobante de B no es visible desde A)

---

## Requirement: Autorización granular basada en permisos del comprobante

El sistema DEBE aplicar autorización diferenciada por acción:
- Listar y descargar: REQUIERE `contabilidad.asientos.read`
- Subir, reemplazar, borrar: REQUIERE `contabilidad.asientos.update`

No se crean permisos nuevos en el catálogo RBAC: el pack hereda los permisos
existentes del comprobante.

### Scenario: Solo lectura puede listar y descargar pero no subir

- DADO que la org tiene el pack activo
- Y el usuario tiene `asientos.read` pero NO `asientos.update`
- CUANDO el usuario lista adjuntos → ENTONCES 200
- CUANDO el usuario descarga un adjunto → ENTONCES 200
- CUANDO el usuario sube un adjunto → ENTONCES 403
- CUANDO el usuario borra un adjunto → ENTONCES 403

---

## Infra local y CI

- Servicio `minio` en `docker-compose.yml` (imagen `minio/minio`, puertos 9000/9001,
  volumen persistente, healthcheck).
- Servicio `minio` en `.github/workflows/ci.yml` para integration/E2E tests.
- Variables env: `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`,
  `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_USE_SSL`.

---

## Códigos de error estables

| Código | HTTP | Condición |
|--------|------|-----------|
| `ADJUNTO_NO_ENCONTRADO` | 404 | Adjunto no existe o pertenece a otro tenant |
| `ADJUNTO_TOPE_COMPROBANTE` | 422 | Comprobante ya tiene 10 adjuntos |
| `ADJUNTO_MIME_NO_PERMITIDO` | 422 | Tipo MIME no está en la whitelist (magic bytes) |
| `ADJUNTO_TAMANO_EXCEDIDO` | 422 | Archivo supera 25 MB |
| `ADJUNTO_PERIODO_CERRADO` | 422 | Período fiscal del comprobante está cerrado o bloqueado |
| `ADJUNTO_COMPROBANTE_ANULADO` | 422 | Comprobante en estado `ANULADO` (D-01: read-only) |
