# Proposal: Pack "Adjuntos a comprobantes"

## Intent

Primer pack concreto sobre el riel ya construido (PRs #150–#157). El contador necesita
adjuntar el **respaldo digital** (PDF de factura, foto del recibo, planilla) directamente
al comprobante, no solo registrar metadata del papel (`DocumentoFisico`). Hoy el binario
vive fuera del sistema. Es funcionalidad OPCIONAL de PAGO, gateada por entitlement →
activación de la org (clave `contabilidad.adjuntos`, ya en el catálogo placeholder).

## Scope

### In Scope
- Entidad `AdjuntoComprobante` (metadata + key del objeto, NO el binario) + migración Prisma.
- `StoragePort` (abstracción hexagonal) + adapter MinIO (`@aws-sdk/client-s3` → MinIO).
- Contenedor `minio` nuevo en `docker-compose.yml` + bucket bootstrap + env.
- Endpoints sub-recurso del comprobante bajo `@RequirePack('contabilidad.adjuntos')`:
  upload (multipart), list, download, delete.
- Frontend: sección "Adjuntos" en el detalle del comprobante, gateada por pack.
- Tests TDD: unit service (StoragePort mock), integration adapter MinIO, e2e con guard de pack.

### Out of Scope
- Vectorización / RAG / agente (es el pack `contabilidad.rag`, separado y diferido).
- OCR / extracción de contenido del adjunto.
- Permisos RBAC nuevos en el catálogo (decisión cerrada: hereda los del comprobante).
- Adjuntos en otros módulos (granja, contactos, docs-físicos como tales).
- Integración SIN / facturación electrónica.

## Capabilities

### New Capabilities
- `pack-adjuntos-comprobantes`: subir/listar/descargar/borrar archivos de respaldo
  vinculados a un comprobante, gateado por el pack; storage tras `StoragePort`.

### Modified Capabilities
- None. (El riel `packs-riel` se CONSUME tal cual, no cambia su spec. RBAC NO cambia.)

## Approach

- **Modelo**: `AdjuntoComprobante` (id, `organizationId`, `comprobanteId`, `storageKey`,
  `nombreOriginal`, `mimeType`, `tamanoBytes Int`, `subidoPorUserId`, `createdAt`). FK
  Cascade desde `Comprobante` y `Organization`. Multi-tenant estricto (Anti-31): toda
  query filtra `organizationId`. Tope 10/comprobante validado en servicio + índice.
- **Hexagonal**: `StoragePort` (puerto del módulo `comprobantes`, en `ports/`) con `put`,
  `getStream`, `delete`; adapter `MinioStorageAdapter` en `adapters/`. El service no
  conoce MinIO. Swap futuro a S3/R2 = endpoint + credenciales. SDK recomendado:
  **`@aws-sdk/client-s3`** apuntado a MinIO — mismo SDK sirve para el swap a S3/R2 real
  sin cambiar código (vs. `minio` client, atado al vendor).
- **Upload**: `@nestjs/platform-express` ya está; usar `FileInterceptor` (multer
  **memoryStorage**, límite 25 MB) en el controller (capa sucia). El service recibe
  `{buffer, mimeType, nombreOriginal, tamano}` plano, valida y delega al `StoragePort`.
  Whitelist MIME por **magic bytes** (no confiar en el header `content-type`, spoofeable).
- **Download**: **stream por backend** (no presigned URL). El backend chequea
  `organizationId` + permiso de lectura del comprobante + pack ANTES de servir. Presigned
  URL saltaría el guard de tenant/pack → se descarta por aislamiento (riesgo abajo).
- **Key del objeto**: `{tenantId}/{comprobanteId}/{uuid}-{nombreSaneado}` (tenant como
  prefijo = aislamiento defensivo en el propio storage).
- **Enchufe al riel**: `@RequirePack('contabilidad.adjuntos')` en el controller (orden
  JwtAuthGuard → PackEnabledGuard → PermissionsGuard); autorización de acción reusa
  `contabilidad.asientos.read` (ver) y `contabilidad.asientos.update` (subir/reemplazar/
  borrar). Frontend: `NavItem.pack` ya existe; sección del detalle gateada por `useMisPacks`.
- **Tests (TDD)**: unit del service con `StoragePort` mockeado (topes, MIME, tenant);
  integration del `MinioStorageAdapter` (Testcontainers MinIO o servicio compose en CI);
  e2e del endpoint validando 404 sin pack activo y 200 con pack.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/prisma/schema.prisma` + migración | New | Modelo `AdjuntoComprobante`, relación en `Comprobante` |
| `backend/src/comprobantes/ports/storage.port.ts` | New | Puerto de storage abstracto |
| `backend/src/comprobantes/adapters/minio-storage.adapter.ts` | New | Adapter MinIO (S3 SDK) |
| `backend/src/comprobantes/{service,controller,module,dto}` | Modified | Endpoints adjuntos + wiring |
| `docker-compose.yml` | Modified | Servicio `minio` + bucket + env |
| `backend/package.json` | Modified | `@aws-sdk/client-s3` |
| `frontend/.../comprobante-detail-page.tsx` + sección adjuntos | Modified/New | UI gateada por pack |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Presigned URL rompería aislamiento tenant/pack | Alta (si se elige) | Servir por stream con check en backend; NO presigned |
| MIME spoofeado vía header `content-type` | Media | Validar por magic bytes, no por header |
| Upload 25 MB en memoria (memoryStorage) | Media | Límite duro multer 25 MB; aceptable para el tope; evaluar streaming si molesta |
| MinIO en CI (integration/e2e) | Media | Testcontainers MinIO o servicio en compose de CI |
| Migración raw SQL drift (§11.6) | Baja | Modelo nativo Prisma sin raw SQL → no aplica §11.6, verificar al generar |

## Rollback Plan

Pack desactivable por la org (entitlement) → endpoints 404 sin tocar código. Revert del
PR (squash) elimina endpoints/UI. La migración es aditiva (tabla nueva): un `migrate` de
reversa la dropea; los binarios en MinIO se purgan aparte (bucket dedicado). Sin impacto
en comprobantes existentes.

## Dependencies

- Riel de packs (`packs-riel`, PRs #150–#157) — YA presente.
- Catálogo: `Pack` `contabilidad.adjuntos` — YA seedeado (placeholder).
- Contenedor MinIO nuevo (infra local + CI).

## Success Criteria

- [ ] Org con pack activo: sube/lista/descarga/borra adjuntos del comprobante.
- [ ] Org sin pack activo: endpoints devuelven 404 (guard), sección UI oculta.
- [ ] Tope 10/comprobante y 25 MB/archivo enforced; MIME fuera de whitelist rechazado.
- [ ] Aislamiento tenant: org A nunca accede a adjuntos de org B (download incluido).
- [ ] StoragePort mockeable; adapter MinIO cubierto por integration test.
- [ ] tsc/lint 0, suites verde, verify 0 CRITICAL.
