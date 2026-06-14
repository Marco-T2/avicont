# Tasks: Numeración configurable por TipoDocumentoFisico

> Change: numeracion-tipo-documento | Mode: hybrid | TDD: enabled (test-rojo → código-verde)

---

## Phase 1: Schema + Migración Prisma

- [x] 1.1 `prisma/schema.prisma`: en `TipoDocumentoFisico` añadir `numeracionAutomatica Boolean @default(false)` y `numeroInicial Int?`; añadir modelo `SecuenciaDocumentoFisico` (PK `(organizationId, tipoDocumentoFisicoId)`, `ultimoNumero Int`, `updatedAt DateTime`, `@@map("secuencias_documento_fisico")`).
- [x] 1.2 Generar migración: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" pnpm exec prisma migrate dev --name numeracion_tipo_documento` desde `backend/`. Nota: entorno no-interactivo → migración creada manualmente + aplicada con `migrate deploy`.
- [x] 1.3 **§11.6**: abrir `migration.sql` generado; `grep -E "^DROP (INDEX|EXTENSION|TYPE)"` y eliminar DROPs de objetos raw vivos (trigram contactos, `comprobante_documento_fisico_unique_contabilizado`, audit triggers comprobantes, `organizations_vertical_exclusivo_check`). Detectados y omitidos: DROP INDEX trigram×2, DROP TABLE comprobantes_audit. El migration.sql final es 100% aditivo.
- [x] 1.4 `DATABASE_URL=... pnpm exec prisma generate` para regenerar el cliente Prisma.

---

## Phase 2: DomainErrors + Reader cross-módulo

- [x] 2.1 **[TEST ROJO]** `tipos-documento-fisico/domain/tipo-documento-fisico-errors.spec.ts`: tests unit para `TipoDocumentoFisicoNumeracionAutoTributarioInvalidaError` (code `TIPO_DOCUMENTO_FISICO_NUMERACION_AUTO_TRIBUTARIO_INVALIDA`) y `TipoDocumentoFisicoNumeroInicialInmutableError` (code `TIPO_DOCUMENTO_FISICO_NUMERO_INICIAL_INMUTABLE`).
- [x] 2.2 **[VERDE]** `tipos-documento-fisico/domain/tipo-documento-fisico-errors.ts`: añadir las dos clases de error (extends `InvalidStateError`, HTTP 422, con los códigos estables).
- [x] 2.3 `tipos-documento-fisico/ports/tipos-documento-fisico-reader.port.ts`: ampliar `TipoDocumentoFisicoParaValidacion` += `numeracionAutomatica: boolean`, `numeroInicial: number | null`.
- [x] 2.4 `tipos-documento-fisico/adapters/prisma-tipos-documento-fisico-reader.adapter.ts`: proyectar los 2 campos nuevos en la consulta que devuelve `TipoDocumentoFisicoParaValidacion`.

---

## Phase 3: Service + DTOs de tipos-documento-fisico

- [x] 3.1 **[TEST ROJO]** `tipos-documento-fisico/tipos-documento-fisico.service.spec.ts`: tests unit para scenarios E-TN-01..E-TN-11 — regla `auto ⇒ ¬tributario` en create y update (E-TN-05/06/07), set-once `numeroInicial` y toggle (E-TN-08/09/10), default `false` (E-TN-02), default `numeroInicial=1` (E-TN-03), `numeroInicial` ignorado en manual (E-TN-04), otros campos editables (E-TN-11).
- [x] 3.2 `tipos-documento-fisico/dto/create-tipo-documento-fisico.dto.ts`: añadir `numeracionAutomatica?: boolean` y `numeroInicial?: number` (opcional, `@IsInt()`, `@Min(1)`).
- [x] 3.3 `tipos-documento-fisico/dto/update-tipo-documento-fisico.dto.ts`: NO expone campos (set-once); defense-in-depth en el service.
- [x] 3.4 `tipos-documento-fisico/dto/tipo-documento-fisico-response.dto.ts`: añadir `numeracionAutomatica: boolean` y `numeroInicial: number | null`.
- [x] 3.5 **[VERDE]** `tipos-documento-fisico/tipos-documento-fisico.service.ts` — `create`: si `numeracionAutomatica=true && esTributario=true` → lanzar `TipoDocumentoFisicoNumeracionAutoTributarioInvalidaError`; si `numeracionAutomatica=false`, ignorar `numeroInicial`; si `numeracionAutomatica=true` y `numeroInicial` ausente → default `1`.
- [x] 3.6 **[VERDE]** `tipos-documento-fisico/tipos-documento-fisico.service.ts` — `update`: si el payload trae `numeroInicial` o `numeracionAutomatica` → lanzar `TipoDocumentoFisicoNumeroInicialInmutableError`; si el tipo ya auto y se intenta poner `esTributario=true` → lanzar `NumeracionAutoTributarioInvalidaError`.
- [x] 3.7 `tipos-documento-fisico/adapters/prisma-tipo-documento-fisico.repository.ts`: persistir 2 campos nuevos en `create`; `findById`/`findAll` los devuelven automáticamente (Prisma selecciona todos los campos por default).

---

## Phase 4: Puerto + Adapter de secuencia en documentos-fisicos

- [x] 4.1 **[TEST ROJO — integración]** `documentos-fisicos/adapters/prisma-secuencia-documento-fisico.integration.spec.ts`: clonar `prisma-secuencia-comprobante.integration.spec.ts`; parametrizar `numeroInicial`; cubrir: primer doc = `numeroInicial`, segundo = `+1`, **N concurrentes vía `Promise.all` → N números distintos sin gaps** (E-D-AUTO-06), rollback de TX no consume número, aislamiento por `(organizationId, tipoDocumentoFisicoId)` (E-D-AUTO-07/08). Usar `DATABASE_URL` real contra Postgres.
- [x] 4.2 `documentos-fisicos/ports/secuencia-documento-fisico.port.ts`: crear puerto `SecuenciaDocumentoFisicoPort` con `siguienteNumero(tenantId, tipoDocumentoFisicoId, numeroInicial, tx?)`.
- [x] 4.3 **[VERDE]** `documentos-fisicos/adapters/prisma-secuencia-documento-fisico.ts`: upsert atómico `INSERT ... VALUES (${numeroInicial}) ON CONFLICT DO UPDATE SET ultimoNumero+1 RETURNING` (SQL sellado, clon de `prisma-secuencia-comprobante.ts:30-46`). Sin `year` en PK (secuencia continua).
- [x] 4.4 `documentos-fisicos/documentos-fisicos.module.ts`: registrar `SECUENCIA_DOCUMENTO_FISICO_PORT` → `PrismaSecuenciaDocumentoFisico` como provider.

---

## Phase 5: Service de documentos-fisicos — bifurcación auto/manual

- [x] 5.1 **[TEST ROJO — unit]** `documentos-fisicos/documentos-fisicos.service.spec.ts`: añadir tests para rama auto — scenario E-D-AUTO-03 (cliente envía `numero` → 422 `DOCUMENTO_FISICO_NUMERO_NO_PERMITIDO_EN_TIPO_AUTO`), E-D-AUTO-01 (número asignado = `numeroInicial`), E-D-AUTO-02 (consecutivo), rama manual idéntica (E-D-AUTO-04/05). Mockear `tiposReader` con `numeracionAutomatica`, `numeroInicial`; mockear `secuenciaPort`.
- [x] 5.2 `documentos-fisicos/domain/documento-fisico-errors.ts`: añadir `DocumentoFisicoNumeroNoPermitidoEnTipoAutoError` (code `DOCUMENTO_FISICO_NUMERO_NO_PERMITIDO_EN_TIPO_AUTO`, 422).
- [x] 5.3 `documentos-fisicos/dto/create-documento-fisico.dto.ts`: hacer `numero` opcional (`@IsOptional()`).
- [x] 5.4 **[VERDE]** `documentos-fisicos/documentos-fisicos.service.ts` — `create`: leer `numeracionAutomatica`/`numeroInicial` del reader ya inyectado; si auto + `numero` presente → lanzar `DocumentoFisicoNumeroNoPermitidoEnTipoAutoError`; si auto → envolver en `prisma.$transaction`, llamar `secuenciaPort.siguienteNumero(tenantId, tipoId, numeroInicial, tx)` + `repo.create(tx)` con `numero = NumeroDocumento.of(String(n))`; si manual → flujo actual idéntico (verificar que `numero` sigue validándose como requerido en ese caso — lanzar error correspondiente si ausente).

---

## Phase 6: OpenAPI + frontend

- [x] 6.1 Regenerar `backend/openapi.json`: `pnpm run openapi:dump` desde `backend/`.
- [x] 6.2 Regenerar `frontend/src/types/api.generated.ts`: `pnpm run gen:api-types` desde `frontend/` (o script equivalente).
- [x] 6.3 **[TEST]** `frontend/` — form de TipoDocumentoFisico: añadir toggle `numeracionAutomatica` + campo condicional `numeroInicial` (visible solo cuando auto=true); tests vitest para renderizado condicional del campo y validación `@Min(1)`. COMPLETADO: Switch numeracionAutomatica (disabled si esTributario o mode=edit); numeroInicial visible solo en create+auto; mapTipoToFormValues actualizado; create API envía campos set-once; 8 tests nuevos (25 total en form.test.tsx).
- [x] 6.4 **[TEST]** `frontend/` — form de DocumentoFisico: campo `numero` read-only/oculto cuando el tipo seleccionado es auto; tests vitest para el comportamiento del campo. COMPLETADO: numero oculto (hint auto) cuando esAutoNumerico; resolver dinámico vía ref+useLayoutEffect; buildFormSchema(esTributario, esAutoNumerico); numero omitido del payload en auto; 3 tests nuevos (10 total en form.test.tsx).

---

## Phase 7: E2E + verificación final

- [x] 7.1 **[E2E]** `test/tipos-documento-fisico.e2e-spec.ts` (o archivo existente): añadir suite — tipo auto+tributario → 422 `TIPO_DOCUMENTO_FISICO_NUMERACION_AUTO_TRIBUTARIO_INVALIDA` (E-TN-05); crear tipo auto → 201; editar `numeroInicial` → 422 `TIPO_DOCUMENTO_FISICO_NUMERO_INICIAL_INMUTABLE` (E-TN-08/09); toggle auto→false → 422 (E-TN-10); editar otros campos → 200 (E-TN-11).
- [x] 7.2 **[E2E]** `test/documentos-fisicos.e2e-spec.ts` (o archivo existente): flujo auto — crear tipo, 2 documentos → `numero=100`/`101` (E-D-AUTO-01/02); enviar `numero` en tipo auto → 422 (E-D-AUTO-03); regresión: tipo manual crea normal (E-D-AUTO-04).
- [x] 7.3 Verificación final: tsc backend 0, lint 0, jest src/ (unit+integration) verde, e2e 491/491, contract-drift idempotente (regen A==B byte-idéntico). Frontend tsc -b 0, vitest 1299/1299.
