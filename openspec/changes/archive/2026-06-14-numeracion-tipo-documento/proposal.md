# Proposal: Numeración configurable por TipoDocumentoFisico

## Intent

Hoy `DocumentoFisico.numero` es **siempre manual**: el usuario tipea cada número. Para tipos digitales (recibos internos, notas) el sistema debería numerar solo, correlativo y sin race conditions. Que el tipo decida — manual (talonario pre-impreso o factura recibida) o automático (el sistema asigna) — sin romper los miles de documentos manuales existentes.

## Scope

### In Scope
- `TipoDocumentoFisico` += `numeracionAutomatica: boolean` (default `false`, retrocompat) + `numeroInicial: int?` (solo si auto, default 1, **set-once** al crear el tipo).
- Validación de dominio: `numeracionAutomatica=true` solo si `esTributario=false` (facturas recibidas → número del emisor tercero).
- Nueva tabla `SecuenciaDocumentoFisico` clave `(organizationId, tipoDocumentoFisicoId)` con `ultimoNumero`; upsert atómico `INSERT ... ON CONFLICT DO UPDATE +1 RETURNING` (clon de `prisma-secuencia-comprobante.ts:30-46`). **Sin `year`** → secuencia continua; primer doc = `numeroInicial`.
- `documentos-fisicos.service.create`: tipo auto → el sistema genera `numero` (ignora/rechaza el del cliente); tipo manual → flujo actual intacto (`documentos-fisicos.service.ts:89-148`).
- Número PELADO (string del entero, sin prefijo ni padding). Sigue normalizado por VO `NumeroDocumento`.
- Frontend: form de tipo (campos nuevos) + form de documento (`numero` read-only cuando el tipo es auto).
- Tests unit + integration (Postgres real para el upsert) + e2e.

### Out of Scope (diferido a 2da iteración)
- "Saltar a número X" (adelantar el contador para un talonario perdido, ej 36→50).
- Anular número con motivo. Un hueco es **información de auditoría, no se reutiliza** (consistente con §4.7).
- Prefijo/padding configurable (el número pelado lo permite agregar después sin romper).
- Cambiar `numeroInicial` o togglear el modo después de crear el tipo (set-once).

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `tipos-documento-fisico`: el tipo gana atributos de numeración (`numeracionAutomatica`, `numeroInicial`), regla `auto ⇒ ¬tributario`, e inmutabilidad set-once de `numeroInicial`.
- `documento-fisico`: al crear, si el tipo es auto el `numero` lo asigna el sistema (contador atómico) y el del cliente se rechaza; si manual, comportamiento actual.

## Approach

Clonar el patrón de correlativo atómico de comprobantes (cicatriz `VOUCHER_NUMBER_CONTENTION` ya cerrada): tabla de secuencia + `SecuenciaDocumentoFisicoPort` con un único statement upsert `RETURNING` bajo el row-lock implícito del PK compuesto — **prohibido `MAX(numero)+1`** (§4.9). La secuencia es dueña del namespace de números auto; el `@@unique(organizationId, tipoDocumentoFisicoId, numero)` existente sigue como defense-in-depth. El número auto se asigna **al crear el documento**, independiente del estado del comprobante → cero acople (precedente verificado: el comprobante anulado conserva número y desasocia, no borra, sus docs físicos). Reader cross-módulo `TiposDocumentoFisicoReaderPort.TipoDocumentoFisicoParaValidacion` += `numeracionAutomatica` + `numeroInicial` para que el service decida.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `prisma/schema.prisma` + nueva migración | Modified/New | 2 columnas en `tipos_documento_fisico` (default `false`/null) + tabla `secuencias_documento_fisico`. Protocolo §11.6. |
| `tipos-documento-fisico/domain` + `.service.ts` | Modified | Atributos nuevos, regla auto⇒¬tributario, set-once de `numeroInicial`, DomainErrors estables. |
| `tipos-documento-fisico/ports/tipos-documento-fisico-reader.port.ts` | Modified | `TipoDocumentoFisicoParaValidacion` += `numeracionAutomatica`, `numeroInicial`. |
| `documentos-fisicos/ports` + `adapters` | New | `SecuenciaDocumentoFisicoPort` + adapter Prisma (upsert atómico). |
| `documentos-fisicos/documentos-fisicos.service.ts:89` | Modified | Rama auto vs manual en `create`. |
| `tipos-documento-fisico` + `documentos-fisicos` DTOs/controllers | Modified | Campos nuevos; OpenAPI regenerado (job `contract-drift`). |
| `frontend/` forms tipo + documento | Modified | Campos nuevos + `numero` read-only cuando auto. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Race condition al asignar número auto concurrente | Med | Upsert atómico `RETURNING`, nunca `MAX+1` (§4.9). Test de integración concurrente. |
| Colisión secuencia vs documento manual previo del mismo tipo | Low | El modo es set-once por tipo; `@@unique` existente + pre-check amigable atrapan; secuencia dueña del namespace auto. |
| Migración dropea objetos raw SQL (índices parciales, trigram, audit) | Med | Revisar `migration.sql` por protocolo §11.6 antes de aplicar; default `false` para filas existentes. |
| Drift OpenAPI front↔back | Low | Regenerar `openapi.json` + `api.generated.ts`; CI `contract-drift`. |

## Rollback Plan

Revertir el PR squash (`git revert <sha>`). La migración añade columnas nullable/default-false y una tabla nueva: un down-migration que dropee `secuencias_documento_fisico` y las 2 columnas restaura el estado previo sin pérdida (los documentos ya creados conservan su `numero` string). Ningún tipo existente queda en modo auto tras el revert (default `false`).

## Dependencies

- Patrón de referencia: `backend/src/comprobantes/adapters/prisma-secuencia-comprobante.ts` y su `.integration.spec.ts`.
- Postgres real (Testcontainers) para el test de integración del upsert.

## Success Criteria

- [ ] Tipos existentes siguen manuales (default `false`) — cero regresión en documentos manuales.
- [ ] Crear tipo con `numeracionAutomatica=true` y `esTributario=true` → DomainError estable (`TIPO_DOCUMENTO_FISICO_NUMERACION_AUTO_TRIBUTARIO_INVALIDA`).
- [ ] Editar `numeroInicial` post-create → DomainError estable (`TIPO_DOCUMENTO_FISICO_NUMERO_INICIAL_INMUTABLE`).
- [ ] Crear documento de tipo auto → `numero` lo asigna el sistema, consecutivo desde `numeroInicial`, ignora el del cliente.
- [ ] Test de integración concurrente: N creaciones simultáneas → N números distintos sin gaps ni duplicados.
- [ ] Crear documento de tipo manual → flujo actual idéntico.
