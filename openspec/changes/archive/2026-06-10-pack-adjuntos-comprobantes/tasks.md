# Tasks: Pack "Adjuntos a comprobantes"

> Strict TDD: cada unidad sigue RED (test falla) → GREEN (mínimo que pasa) → REFACTOR (limpieza).
> Requiere Postgres+Redis: marcado con 🐘. Requiere MinIO: marcado con 🪣.

---

## Fase 1 — Infra y dependencias

- [x] 1.1 `backend/package.json` — agregar `@aws-sdk/client-s3` y `file-type` (verificar que `@nestjs/platform-express` ya trae multer ✅)
- [x] 1.2 `docker-compose.yml` — agregar servicio `minio` (imagen `minio/minio`, puertos 9000/9001, volumen persistente, healthcheck, env `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`), servicio `createbuckets` opcional de bootstrap
- [x] 1.3 `backend/.env` + `backend/.env.example` — agregar `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_USE_SSL`

---

## Fase 2 — Schema Prisma y migración 🐘

- [x] 2.1 **RED** `backend/prisma/schema.prisma` — escribir modelo `AdjuntoComprobante` (columnas + FK + @@index + @@map) y relación `adjuntos` en modelo `Comprobante`; el proyecto NO compila hasta que se genere el cliente
- [x] 2.2 **GREEN** — correr `prisma migrate dev --name adjuntos_comprobante`; abrir `migration.sql` generado y verificar §11.6 (sin `DROP` sobre objetos raw vivos de la tabla §11.6)
- [x] 2.3 — correr `prisma generate`; verificar que `AdjuntoComprobante` aparece en el cliente

---

## Fase 3 — StoragePort + adapter MinIO

- [x] 3.1 **RED** `backend/src/comprobantes/ports/storage.port.ts` — crear interface `StoragePort` (`put`, `getStream`, `delete`, `exists`); escribir test unit que verifica que el token de inyección resuelve a un mock que implementa la interface
- [x] 3.2 **RED** 🪣 `backend/src/comprobantes/adapters/minio-storage.adapter.integration.spec.ts` (integration) — tests round-trip `put→getStream→delete→exists` contra MinIO real (localhost:9000) — 6/6 pasan con NODE_OPTIONS=--experimental-vm-modules
- [x] 3.3 **GREEN** `backend/src/comprobantes/adapters/minio-storage.adapter.ts` — implementar con `@aws-sdk/client-s3`; `ensureBucket` idempotente en `OnModuleInit`
- [x] 3.4 `backend/src/comprobantes/comprobantes.module.ts` — importar `PacksModule`, registrar `MinioStorageAdapter` como provider con token `StoragePort`, inyectar `ConfigService` para las env vars

---

## Fase 4 — Validación MIME magic bytes

- [x] 4.1 **RED** `backend/src/comprobantes/domain/mime-whitelist.spec.ts` — casos: PDF real → permitido; `.exe` renombrado `.pdf` → rechazado; xlsx, docx, png, jpeg, txt → permitidos; `application/octet-stream` sin magic bytes reconocido → rechazado — 8/8 pasan
- [x] 4.2 **GREEN** `backend/src/comprobantes/domain/mime-whitelist.ts` — función `validarMimeMagicBytes(buffer: Buffer): string` usando `file-type` v16 (CJS); lanza `AdjuntoMimeNoPermitidoError` si el tipo no está en whitelist o no se detecta

---

## Fase 5 — Errores de dominio

- [x] 5.1 **RED** `backend/src/comprobantes/domain/adjunto-errors.spec.ts` — 14/14 pasan
- [x] 5.2 **GREEN** `backend/src/comprobantes/domain/adjunto-errors.ts` — 6 errores de dominio creados con codes estables

---

## Fase 6 — Repository port + adapter Prisma 🐘

- [x] 6.1 **RED** `backend/src/comprobantes/ports/adjunto-comprobante.repository.port.ts` — interface con `crear`, `listar`, `obtenerPorId`, `actualizar`, `eliminar`, `contarPorComprobante`; 6/6 unit tests pasan
- [x] 6.2 **RED** 🐘 `backend/src/comprobantes/adapters/prisma-adjunto-comprobante.repository.integration.spec.ts` — 8/8 tests de integración (crear, listar, obtenerPorId cross-tenant→null, eliminar, contarPorComprobante)
- [x] 6.3 **GREEN** `backend/src/comprobantes/adapters/prisma-adjunto-comprobante.repository.ts` — implementado filtrando siempre por `organizationId`; registrado en `comprobantes.module.ts`

---

## Fase 7 — DTOs

- [x] 7.1 **RED** `backend/src/comprobantes/dto/adjunto-response.dto.ts` — DTO de respuesta (sin buffer): `id`, `nombreOriginal`, `mimeType`, `tamanoBytes`, `subidoPorUserId`, `createdAt`; decoradores `@ApiProperty`; 5/5 unit tests pasan

---

## Fase 8 — Service 🐘

- [x] 8.1 **RED** `backend/src/comprobantes/comprobantes.service.spec.ts` (adjuntos) — casos: subir → happy path devuelve AdjuntoResponseDto; subir → tope 10 lanza `AdjuntoTopeExcedidoError`; subir → MIME inválido lanza `AdjuntoMimeNoPermitidoError`; subir → tamaño > 25 MB lanza `AdjuntoTamanoExcedidoError`; subir → período cerrado lanza `AdjuntoPeriodoCerradoError` (D-02); subir → comprobante anulado lanza `AdjuntoComprobanteAnuladoError` (D-01); subir → comprobante de otro tenant lanza `AdjuntoNoEncontradoError`; descargar → devuelve stream + metadata; descargar → cross-tenant lanza 404; reemplazar → borra storage anterior + actualiza metadata; borrar → llama `StoragePort.delete` + `repo.eliminar`; listar → devuelve array vacío si sin adjuntos
- [x] 8.2 **GREEN** `backend/src/comprobantes/comprobantes.service.ts` — implementar métodos: `subirAdjunto`, `listarAdjuntos`, `obtenerStreamAdjunto`, `reemplazarAdjunto`, `eliminarAdjunto`; orchestrar `StoragePort` + `AdjuntoComprobanteRepositoryPort`; validar estado comprobante (D-01) y período (D-02) antes de mutar; generar `storageKey` como `{tenantId}/{comprobanteId}/{uuid}-{nombreSaneado}`; `sha256` = null (v1)

---

## Fase 9 — Controller + endpoints 🐘 🪣

- [x] 9.1 **RED** `backend/src/comprobantes/comprobantes.controller.e2e-spec.ts` (adjuntos) — casos E2E: POST sin pack activo → 404; POST con pack + `asientos.update` → 201; GET listado con pack + `asientos.read` → 200 []; upload→list→download→delete ciclo completo; PUT reemplazo actualiza metadata; DELETE 204; cross-tenant en download → 404; `asientos.read` intenta POST → 403; MIME inválido → 422 `ADJUNTO_MIME_NO_PERMITIDO`; tamaño > 25 MB → 422 `ADJUNTO_TAMANO_EXCEDIDO`; tope 10 → 422 `ADJUNTO_TOPE_COMPROBANTE`
- [x] 9.2 **GREEN** `backend/src/comprobantes/comprobantes.controller.ts` — agregar 5 endpoints sub-recurso bajo `@RequirePack('contabilidad.adjuntos')`; `POST` con `FileInterceptor('file', { limits: { fileSize: 25*1024*1024 }, storage: memoryStorage() })`; `GET download` con `StreamableFile` y `Content-Disposition`; cadena guards ya presente (`@UseGuards(PackEnabledGuard, ...)`) aplicar a nivel controller o handler según corresponda; `@ApiConsumes('multipart/form-data')` en POST/PUT

---

## Fase 10 — OpenAPI sync 🐘

- [x] 10.1 `backend/` — ejecutar `pnpm run openapi:dump` para regenerar `openapi.json` con los 5 endpoints nuevos; también se agregaron `@ApiCreatedResponse`, `@ApiOkResponse`, `@ApiNoContentResponse` en los endpoints de adjunto para que `AdjuntoResponseDto` entre al schema
- [x] 10.2 `frontend/` — ejecutar `pnpm run gen:api-types` para regenerar `src/types/api.generated.ts`; actualizar fachada `src/types/api.ts` con alias `AdjuntoComprobante`; verificado idempotente (re-ejecutar dump+gen produce cero diff adicional)

---

## Fase 11 — Frontend

- [x] 11.1 **RED** `frontend/src/features/comprobantes/api/adjuntos-comprobante.ts` — funciones `getAdjuntos`, `subirAdjunto`, `descargarAdjunto` (blob), `reemplazarAdjunto`, `eliminarAdjunto`; test unitario mock de fetch verifica paths y métodos HTTP
- [x] 11.2 **RED** `frontend/src/features/comprobantes/hooks/use-adjuntos-comprobante.ts` + `use-subir-adjunto.ts` + `use-eliminar-adjunto.ts` + `use-reemplazar-adjunto.ts`— tests con `renderHook` + mock de servidor (msw o vi.fn); cubrir estado loading/error/success
- [x] 11.3 **RED** `frontend/src/features/comprobantes/components/adjuntos-section.test.tsx` — casos: sin pack → sección oculta (fail-closed); con pack + solo `asientos.read` → lista visible, botón subir ausente; con pack + `asientos.update` → botón subir visible; comprobante ANULADO → botones mutar deshabilitados/ocultos; sube archivo → POST llamado con FormData; descarga → trigger download; eliminar → DELETE llamado + item desaparece
- [x] 11.4 **GREEN** `frontend/src/features/comprobantes/components/adjuntos-section.tsx` — componente que espeja `DocumentosRespaldoSection`; gateado por `useMisPacks({ clave: 'contabilidad.adjuntos' })` fail-closed; `<Can permission="contabilidad.asientos.update">` sobre botones mutar; `<input type="file" accept="...">` para subida; lista de adjuntos con botón descargar y eliminar por ítem
- [x] 11.5 `frontend/src/features/comprobantes/components/comprobante-detail-page.tsx` — importar e insertar `<AdjuntosSection>` tras `<DocumentosRespaldoSection>`, pasando `comprobante` y `editable` (misma lógica D5 del caller)

---

## Fase 12 — Cierre y calidad

- [x] 12.1 🐘 backend — correr suite completa `pnpm exec jest src/ test/ --runInBand --forceExit` con `DATABASE_URL` + vars MinIO; confirmar 0 regresiones
- [x] 12.2 Frontend — correr `pnpm exec vitest run`; confirmar 0 regresiones
- [x] 12.3 Backend — `pnpm exec tsc --noEmit` + `pnpm run lint`; 0 errores
- [x] 12.4 Frontend — `pnpm exec tsc -b` + `pnpm run lint`; 0 errores
- [x] 12.5 🪣 Smoke manual (Marco) — levantar `docker compose up -d` con MinIO; activar pack `contabilidad.adjuntos` en org de prueba; subir PDF real → listar → descargar → reemplazar → eliminar; intentar subir desde org sin pack → confirmar 404; intentar subir con usuario solo-read → confirmar 403
