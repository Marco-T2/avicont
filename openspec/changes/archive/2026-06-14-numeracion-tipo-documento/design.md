# Design: Numeración configurable por TipoDocumentoFisico

## Technical Approach

Clonar el patrón de correlativo atómico de `comprobantes` (cicatriz `VOUCHER_NUMBER_CONTENTION`, §4.9): tabla de secuencia + `SecuenciaDocumentoFisicoPort` con un único `INSERT ... ON CONFLICT DO UPDATE RETURNING` bajo el row-lock implícito del PK compuesto. Diferencias contra el comprobante: clave **sin `year`** (secuencia continua) y valor inicial **parametrizado por `numeroInicial`** (no fijo en 1). La secuencia vive en `documentos-fisicos` (dueño de la numeración de sus documentos). El reader cross-módulo gana 2 campos para que el service bifurque sin segundo query. El número auto se asigna **al crear el documento**, en la MISMA TX que el insert, desacoplado del estado del comprobante.

## Architecture Decisions

| Decisión | Opción elegida | Alternativa rechazada | Rationale |
|----------|----------------|------------------------|-----------|
| Tabla de secuencia | `SecuenciaDocumentoFisico` PK `(organizationId, tipoDocumentoFisicoId)`, `ultimoNumero Int`, `updatedAt`, `@@map("secuencias_documento_fisico")`. **Sin `year`** | Reusar `SecuenciaComprobante`; o columna en `tipos_documento_fisico` | El comprobante reinicia por mes (`year`,`month` en PK); acá la secuencia es **continua** → PK sin fecha. Columna en el tipo violaría atomicidad (no se puede `INSERT ON CONFLICT RETURNING` sobre el catálogo sin lockear la fila del tipo). Tabla dedicada = mismo patrón probado. |
| Dónde vive la secuencia | Módulo `documentos-fisicos` (puerto + adapter) | Módulo `tipos-documento-fisico` | El documento físico es dueño del namespace de SUS números (§3.7: el módulo que consume la numeración la posee). El tipo solo aporta `numeracionAutomatica`/`numeroInicial` como dato de configuración, expuesto vía el reader ya existente. |
| Superficie cross-módulo | Ampliar `TipoDocumentoFisicoParaValidacion` (reader ya consumido) += `numeracionAutomatica`, `numeroInicial` | Nuevo puerto reader; segundo query | El service ya llama `tiposReader.findById` en `create` (`documentos-fisicos.service.ts:91`). Ampliar el shape = cero query extra, blast radius mínimo (§3.7). |
| `numero` del cliente cuando auto | **Rechazar con 422** (code estable) si el cliente envía `numero` para un tipo auto | Ignorar silenciosamente | Contrato explícito (la spec lo sella): el frontend pone `numero` read-only cuando el tipo es auto, así que ningún cliente legítimo lo envía; si llega, es mal uso → fallar fuerte lo hace visible en vez de descartar input en silencio (anti-sorpresa). El DTO marca `numero` opcional; el service valida la combinación `auto + numero presente`. |
| Set-once `numeroInicial` + regla `auto ⇒ ¬tributario` | Enforce en `tipos-documento-fisico.service` (`create` y `update`) | Enforce solo en BD; o en el DTO | Reglas de dominio → service (§3.5). BD no expresa set-once ni "auto solo si no-tributario" sin trigger. DTO valida forma, no invariantes de dominio. |

## Data Flow — `create` documento auto

    controller ─→ service.create(tenantId, input)
                      │
                      ├─ tiposReader.findById(tx) ─→ {esTributario, activo, numeracionAutomatica, numeroInicial}
                      │
                      ├─ if !auto:  flujo actual (numero del cliente → NumeroDocumento VO)
                      │
                      └─ if auto (DENTRO de prisma.$transaction):
                            secuenciaPort.siguienteNumero(tenantId, tipoId, numeroInicial, tx)
                                  │  INSERT ON CONFLICT DO UPDATE RETURNING  (atómico, mismo tx)
                                  └─→ n  ─→ NumeroDocumento.of(String(n))  ─→ repo.create(tx)

Atomicidad: `siguienteNumero` y `repo.create` comparten `tx`. Si el insert del documento falla (p.ej. unique colisión con un manual previo), la TX revierte y el número **no se consume** — igual que el comprobante en rollback (`prisma-secuencia-comprobante.integration.spec.ts:124-144`).

## Counter Arithmetic (sellado)

El statement clona `prisma-secuencia-comprobante.ts:30-46` con dos cambios: PK sin `year/month`, y `VALUES (... ${numeroInicial})` en vez de `1`.

```sql
INSERT INTO secuencias_documento_fisico
  ("organizationId", "tipoDocumentoFisicoId", "ultimoNumero", "updatedAt")
VALUES (${tenantId}, ${tipoDocumentoFisicoId}, ${numeroInicial}::int, now())
ON CONFLICT ("organizationId", "tipoDocumentoFisicoId") DO UPDATE SET
  "ultimoNumero" = secuencias_documento_fisico."ultimoNumero" + 1,
  "updatedAt"    = now()
RETURNING "ultimoNumero" AS "ultimoNumero"
```

Verificación con `numeroInicial = 36`:
- 1er doc → fila ausente → INSERT → `RETURNING 36` ✓ (= numeroInicial)
- 2do doc → conflict → `36 + 1` → `RETURNING 37` ✓
- 3er doc → conflict → `37 + 1` → `RETURNING 38` ✓

Default `numeroInicial = 1` reproduce exactamente la semántica del comprobante (1,2,3…). Bajo concurrencia, el row-lock del PK serializa writers → sin gaps ni duplicados (Anti-24).

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modify | `TipoDocumentoFisico` += `numeracionAutomatica Boolean @default(false)` + `numeroInicial Int?`; nuevo `model SecuenciaDocumentoFisico` (PK compuesta, `@@map`). |
| `prisma/migrations/<ts>_numeracion_tipo_documento/migration.sql` | Create | 2 columnas + tabla nueva. **§11.6**: revisar el SQL por `DROP INDEX/EXTENSION` de objetos raw (trigram contactos, índice parcial doc-fisico-contabilizado, audit triggers comprobantes) antes de aplicar. |
| `tipos-documento-fisico/ports/tipos-documento-fisico-reader.port.ts` | Modify | `TipoDocumentoFisicoParaValidacion` += `numeracionAutomatica: boolean`, `numeroInicial: number \| null`. |
| `tipos-documento-fisico/domain/tipo-documento-fisico-errors.ts` | Modify | + `TipoDocumentoFisicoNumeracionAutoTributarioInvalidaError`, + `TipoDocumentoFisicoNumeroInicialInmutableError`. |
| `tipos-documento-fisico/tipos-documento-fisico.service.ts` | Modify | `create`: regla `auto ⇒ ¬tributario` + acepta `numeroInicial`; `update`: rechaza cambio de `numeroInicial` y del modo (set-once). |
| `tipos-documento-fisico` DTOs/controller + adapter/repo port | Modify | Campos nuevos en create DTO; adapter persiste y proyecta los 2 campos en el reader. |
| `documentos-fisicos/ports/secuencia-documento-fisico.port.ts` | Create | `SecuenciaDocumentoFisicoPort.siguienteNumero(tenantId, tipoId, numeroInicial, tx?)`. |
| `documentos-fisicos/adapters/prisma-secuencia-documento-fisico.ts` | Create | Upsert atómico (statement de arriba). |
| `documentos-fisicos/adapters/prisma-secuencia-documento-fisico.integration.spec.ts` | Create | Clon del spec de comprobante con `numeroInicial`. |
| `documentos-fisicos/documentos-fisicos.service.ts` | Modify | Bifurcación auto/manual en `create` (envuelto en `$transaction`). |
| `documentos-fisicos/documentos-fisicos.module.ts` | Modify | Provider del nuevo puerto. |
| `backend/openapi.json` + `frontend/src/types/api.generated.ts` | Modify | Regenerar (job `contract-drift`). |
| `frontend/` forms tipo + documento | Modify | Campos nuevos; `numero` read-only cuando el tipo es auto. |

## Interfaces / Contracts

```typescript
// documentos-fisicos/ports/secuencia-documento-fisico.port.ts
export const SECUENCIA_DOCUMENTO_FISICO_PORT = Symbol('SECUENCIA_DOCUMENTO_FISICO_PORT');

export abstract class SecuenciaDocumentoFisicoPort {
  /**
   * Devuelve el siguiente número de la secuencia continua del tipo.
   * Primer documento del tipo ⇒ `numeroInicial`; siguientes ⇒ +1.
   * Atómico vía upsert RETURNING. **Prohibido** MAX+1 (§4.9).
   * Acepta `tx` para participar de la TX del insert del documento.
   */
  abstract siguienteNumero(
    tenantId: string,
    tipoDocumentoFisicoId: string,
    numeroInicial: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `auto ⇒ ¬tributario` (create rechaza), set-once `numeroInicial` (update rechaza), default `false` retrocompat. Service `create` doc: rama auto **rechaza** `numero` del cliente si llega (422 code estable), genera el número de la secuencia, rama manual intacta. | Jest con mocks del reader/secuencia/repo. |
| Integration | Upsert atómico contra Postgres real: primer doc = `numeroInicial`, incrementos, **N concurrentes → N distintos sin gaps**, rollback de TX no consume número. | Clon de `prisma-secuencia-comprobante.integration.spec.ts` con `numeroInicial` parametrizado y N concurrentes vía `Promise.all`. `DATABASE_URL` real. |
| E2E | Crear tipo auto (`numeracionAutomatica=true`, `esTributario=false`) → crear 2 documentos → `numero` = `numeroInicial`, `numeroInicial+1`; crear tipo auto+tributario → 422 code estable. | Supertest + AppModule. |

## Migration / Rollout

Migración aditiva: 2 columnas (`default false` / nullable) + tabla nueva → cero regresión, filas existentes quedan manuales. Sin backfill. **§11.6**: antes de `migrate deploy`, abrir el `migration.sql` y `grep -E "^DROP (INDEX|EXTENSION|TYPE)"`; borrar cualquier DROP de objeto raw vivo (lista §11.6). Rollback = revertir PR squash; un down-migration que dropee la tabla + 2 columnas restaura el estado (los documentos conservan su `numero` string).

## Open Questions

- Ninguna. (`numeroInicial` default 1 confirmado en proposal; `numero` del cliente en tipo auto **se rechaza con 422** —alineado con la spec—; secuencia vive en `documentos-fisicos`.)
