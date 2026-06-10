# Design: Pack "Adjuntos a comprobantes"

## Technical Approach

Primer pack concreto sobre el riel `packs-riel`. Se agrega un sub-recurso
`:comprobanteId/adjuntos` AL controller de comprobantes existente (espejando
`documentos-fisicos`), gateado por `@RequirePack('contabilidad.adjuntos')`. El
binario vive en MinIO tras un `StoragePort` hexagonal; la metadata en Prisma
(`AdjuntoComprobante`). Sin permisos RBAC nuevos: hereda los del comprobante.

## Architecture Decisions

| Decisión | Elección | Alternativa rechazada | Razón |
|----------|----------|-----------------------|-------|
| Relación metadata | Tabla 1-N directa `AdjuntoComprobante` (FK `comprobanteId`) | Tabla join | El adjunto pertenece a UN comprobante (no se comparte como `DocumentoFisico`); no hay N-M. |
| SDK storage | `@aws-sdk/client-s3` apuntado a MinIO | cliente `minio` | Swap futuro a S3/R2 = solo endpoint+creds, sin tocar código. |
| Descarga | Stream por backend (`StreamableFile`) | Presigned URL | Presigned salta el guard tenant/pack → rompe aislamiento (§4.2). |
| Upload buffer | multer `memoryStorage`, límite 25 MB en `FileInterceptor` | streaming a disco | Tope 25 MB es aceptable en memoria; simplicidad. (open Q) |
| Validación MIME | Magic bytes vía `file-type` | confiar en `content-type` header | El header es spoofeable; magic bytes es defensa real. |
| Bucket | Único multi-tenant con prefijo `{tenantId}/...` | bucket por tenant | Operativamente simple; aislamiento defensivo por prefijo + check en backend. |
| Creación bucket | Idempotente al boot (`OnModuleInit` del adapter, `ensureBucket`) | migración | El bucket es infra de storage, no schema SQL. |
| Cascada storage | Borrado explícito en el service (individual) + huérfanos aceptados en cascada de comprobante | hook/job de limpieza | Lo más simple/correcto: FK Cascade borra metadata; objetos huérfanos no rompen nada (open Q limpieza diferida). |

## Data Flow

    Upload:  Controller(FileInterceptor 25MB) ──{buffer,mime,nombre,tamano}──▶ Service
               Service: valida tenant+tope10 + magic-bytes ──▶ StoragePort.put(key) ──▶ MinIO
                       └──▶ Repo.crear(metadata) ──▶ Postgres

    Download: Controller ──▶ Service: check tenant+comprobante ──▶ Repo.obtener(adjuntoId)
                       └──▶ StoragePort.getStream(key) ──▶ StreamableFile(Content-Type/Disposition)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/prisma/schema.prisma` | Modify | Modelo `AdjuntoComprobante` + relación en `Comprobante` |
| `backend/prisma/migrations/<ts>_adjuntos_comprobante/` | Create | Migración nativa (verificar migration.sql, §11.6) |
| `backend/src/comprobantes/ports/storage.port.ts` | Create | `StoragePort` (put/getStream/delete/exists) |
| `backend/src/comprobantes/ports/adjunto-comprobante.repository.port.ts` | Create | Puerto del repo |
| `backend/src/comprobantes/adapters/minio-storage.adapter.ts` | Create | Adapter S3-SDK→MinIO, `ensureBucket` en `OnModuleInit` |
| `backend/src/comprobantes/adapters/prisma-adjunto-comprobante.repository.ts` | Create | Repo Prisma (filtra `organizationId`) |
| `backend/src/comprobantes/domain/adjunto-errors.ts` | Create | `AdjuntoNoEncontradoError`, `AdjuntoTopeExcedidoError`, `AdjuntoMimeNoPermitidoError` |
| `backend/src/comprobantes/domain/mime-whitelist.ts` | Create | Whitelist magic-bytes + validación |
| `backend/src/comprobantes/dto/adjunto-response.dto.ts` | Create | Response (sin buffer) |
| `backend/src/comprobantes/comprobantes.controller.ts` | Modify | 5 endpoints sub-recurso + `@RequirePack` |
| `backend/src/comprobantes/comprobantes.service.ts` | Modify | Métodos adjuntos |
| `backend/src/comprobantes/comprobantes.module.ts` | Modify | `PacksModule` import, providers, env config |
| `docker-compose.yml` | Modify | Servicio `minio` + volumen + healthcheck |
| `backend/package.json` | Modify | `@aws-sdk/client-s3`, `file-type` |
| `frontend/.../adjuntos-section.tsx` + detail page | Create/Modify | Sección gateada por `useMisPacks` |

## Interfaces / Contracts

```prisma
model AdjuntoComprobante {
  id              String   @id @default(uuid())
  organizationId  String
  comprobanteId   String
  storageKey      String   @unique          // {tenantId}/{comprobanteId}/{uuid}-{nombreSaneado}
  nombreOriginal  String
  mimeType        String
  tamanoBytes     Int                        // cabe (max 25 MB ≪ 2^31)
  sha256          String?                    // dedup opcional futuro (open Q)
  subidoPorUserId String
  createdAt       DateTime @default(now()) @db.Timestamptz(3)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  comprobante  Comprobante  @relation(fields: [comprobanteId],  references: [id], onDelete: Cascade)

  @@index([organizationId, comprobanteId])
  @@map("adjuntos_comprobante")
}
```

```typescript
export interface StoragePort {
  put(key: string, buffer: Buffer, contentType: string): Promise<void>;
  getStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
```

Endpoints (espejan `documentos-fisicos`, todos bajo `@RequirePack('contabilidad.adjuntos')`):

| Método | Ruta | Permiso |
|--------|------|---------|
| POST   | `:comprobanteId/adjuntos` (multipart `file`) | `contabilidad.asientos.update` |
| GET    | `:comprobanteId/adjuntos` | `contabilidad.asientos.read` |
| GET    | `:comprobanteId/adjuntos/:adjuntoId/download` | `contabilidad.asientos.read` |
| PUT    | `:comprobanteId/adjuntos/:adjuntoId` (reemplazar) | `contabilidad.asientos.update` |
| DELETE | `:comprobanteId/adjuntos/:adjuntoId` | `contabilidad.asientos.update` |

**Cadena de guards** (controller-level, ya presente + pack): `AuthGuard('jwt') →
PackEnabledGuard → ModuleEnabledGuard → PermissionsGuard`. `PackEnabledGuard` se
agrega a `@UseGuards` del controller; solo dispara en handlers con `@RequirePack`
(transparente para el resto). El arch-spec `require-pack-tenant-guard.arch.spec.ts`
ya exige que coexista con `PermissionsGuard` — se cumple.

Variables env nuevas: `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`,
`MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_USE_SSL`.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | Service: tope 10, MIME whitelist (magic bytes), filtro tenant, sanitización de key | `StoragePort` + repo mockeados |
| Integration | `MinioStorageAdapter` (put/getStream/delete/exists round-trip) + repo Prisma | Testcontainers MinIO + Postgres |
| E2E | 404 sin pack activo / 200 con pack; aislamiento org A↔B en download; upload→list→download→delete | AppModule full + servicio MinIO en CI |

MinIO en CI: servicio en el job de CI (igual que Postgres) o Testcontainers
(`minio/minio`). Recomendado Testcontainers para integration (aislado por suite).

## Migration / Rollout

Migración Prisma **nativa** (tabla nueva + relación) → §11.6 NO aplica (sin raw
SQL). Igual verificar el `migration.sql` generado: NO debe contener `DROP`
inesperado sobre objetos raw vivos. Aditiva, sin impacto en comprobantes
existentes. Rollback: revert del PR + `migrate` de reversa dropea la tabla;
binarios MinIO se purgan aparte (bucket dedicado).

## Open Questions

- [ ] Dedup por `sha256`: columna prevista nullable, pero ¿se computa/usa en v1 o se difiere? (recomendado: prever columna, NO deduplicar aún).
- [ ] Adjuntos en comprobante ANULADO: ¿read-only (solo ver/descargar) o se permite borrar? (recomendado: read-only, alinear con §4.7).
- [ ] memoryStorage vs streaming para 25 MB bajo concurrencia (recomendado: memoryStorage v1, medir antes de optimizar).
- [ ] Limpieza diferida de objetos huérfanos tras cascada de comprobante (recomendado: aceptar huérfanos en v1; job de barrido futuro).
