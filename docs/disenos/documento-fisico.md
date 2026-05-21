<!--
Última edición: 2026-05-21
Última revisión contra core: 2026-05-21
Owner: backend-lead
-->

# Documento Físico — Fase 1.4 (slice 2)

> **Estado: IMPLEMENTADO** — schema + dominio + ports + adapters + services +
> controllers + RBAC + seed al crear tenant + suites E2E. Tests unit/integration
> al lado del código y E2E en `backend/test/{tipos-documento-fisico,documentos-fisicos,documentos-fisicos-asociacion}.e2e-spec.ts`.
>
> Doc de referencia para devs, auditores y los slices siguientes (Factura,
> LCV). Versión simplificada del design del change `documento-fisico`
> (`openspec/changes/documento-fisico/`). Para el detalle exhaustivo de cada
> decisión, ver ese change.

El **documento físico** es el papel que respalda los asientos contables: facturas,
recibos, notas, vales. Este slice introduce dos módulos nuevos —el catálogo de
**tipos** y los **documentos** operativos— y los conecta con `comprobantes` mediante
una asociación N:M **cabecera-cabecera**.

---

## 1. Modelos (schema)

Tres modelos nuevos en `backend/prisma/schema.prisma`:

### `TipoDocumentoFisico` (catálogo, tabla `tipos_documento_fisico`)
- `codigo` (kebab-case, 1..20, único per-tenant) — ancla estable del seed.
- `nombre` (1..100, único per-tenant).
- `esTributario` (bool) — distingue tributarios (factura, NC, ND) de no-tributarios
  (recibo, vale, comprobante interno). Hoy fuerza `monto`/`moneda`; anticipa el slice 3.
- `activo` (bool) — soft-toggle de visibilidad. **NO es soft-delete** (CLAUDE.md §4.7):
  es catálogo, no documento contable.
- `tiposComprobanteAplicables: TipoComprobante[]` — lista explícita de tipos de
  comprobante a los que un documento de este tipo puede asociarse (D11). Lista vacía =
  ningún tipo aplica (no hay wildcard).
- `@@unique([organizationId, codigo])`, `@@unique([organizationId, nombre])`.

### `DocumentoFisico` (operativo, tabla `documentos_fisicos`)
- `tipoDocumentoFisicoId` (FK **Restrict** hacia el tipo).
- `numero` (VO `NumeroDocumento`: trim + uppercase, regex `^[A-Z0-9./-]+$`, 1..50).
  `0042 ≠ 42` (unicidad por string exacto, D3).
- `fechaEmision` (`@db.Date`, calendario puro — CLAUDE.md §4.6).
- `monto Decimal? @db.Decimal(18,2)` + `moneda Moneda?` — **nullable, condicional**:
  obligatorios y `> 0` si `esTributario=true`; **prohibidos** si no (D4 / D10).
- `glosa?` (0..500), `contactoId?` (FK **Restrict** hacia `Contacto`).
- `@@unique([organizationId, tipoDocumentoFisicoId, numero])` (defense in depth, §4.8).

### `ComprobanteDocumentoFisico` (asociación, tabla `comprobante_documento_fisico`)
- N:M **a nivel cabecera** entre `Comprobante` y `DocumentoFisico` (D1 — NO hay
  `LineaComprobante.documentoFisicoId`).
- `comprobanteEstado` — **cache denormalizado** del estado del comprobante, actualizado
  por `ComprobantesService` en la MISMA TX que cambia el estado (D2). Necesario para que
  el UNIQUE PARCIAL funcione sin JOIN. Riesgo R1.
- `onDelete`: Cascade desde `Comprobante` y `Organization`; **Restrict** desde
  `DocumentoFisico` (un documento con asociaciones no se borra).
- `@@unique([documentoFisicoId, comprobanteId])` (no se duplica una asociación).
- **UNIQUE PARCIAL raw SQL** (Prisma no lo expresa): un documento puede estar en N
  comprobantes BORRADOR pero a lo sumo **1 CONTABILIZADO** simultáneo:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS "comprobante_documento_fisico_unique_contabilizado"
    ON "comprobante_documento_fisico" ("documentoFisicoId")
    WHERE "comprobanteEstado" = 'CONTABILIZADO';
  ```
  Es un objeto raw SQL vivo — protegido por el protocolo §11.6 de `CLAUDE.md`.

---

## 2. Módulos y estructura

Dos módulos hexagonales nuevos en `backend/src/`:

- `tipos-documento-fisico/` — catálogo. domain (VOs `TipoDocumentoFisicoCodigo`/`Nombre`,
  errores), ports (repository interno + reader cross-module + seeder cross-module),
  adapters Prisma, dto, service, controller, module + `seed/tipos-universales.ts`.
- `documentos-fisicos/` — operativo. domain (VO `NumeroDocumento`, errores), ports
  (repository interno + asociación + reader cross-module), adapters Prisma, dto, service,
  controller, module.

La orquestación de **asociar/desasociar/contabilizar/anular** vive en
`ComprobantesService` (NO en `documentos-fisicos`): la dirección de dependencia es
`comprobantes → documentos-fisicos` vía ports, nunca al revés (evita el ciclo de prod
documentado en la cicatriz `prod-build-crash-ciclos`).

---

## 3. Ports clave

- `TIPOS_DOCUMENTO_FISICO_READER_PORT` (`findById`) — consumido por `documentos-fisicos`
  para validar tipo (existencia + activo + `esTributario`).
- `TIPO_DOCUMENTO_FISICO_SEEDER_PORT` (`seedDefaultsForTenant`) — consumido por `tenants`
  al crear una org CONTABILIDAD. Idempotente (upsert por `(organizationId, codigo)`).
- `DOCUMENTOS_FISICOS_READER_PORT` — consumido por `comprobantes`:
  `obtenerBatchParaAsociar` (devuelve `DocumentoFisicoParaAsociar` con `esTributario` +
  `tiposComprobanteAplicables` + `tipoDocumentoNombre`), `idsYaAsociadosAContabilizado`
  (pre-validación del race) y `listarAsociadosDeComprobante`.
- `ASOCIACION_COMPROBANTE_REPOSITORY_PORT` — `asociar`, `desasociar`,
  `desasociarTodasDelComprobante`, `refrescarEstadoComprobante`, `listarPorComprobante`.

---

## 4. Decisiones (resumen)

| # | Decisión |
|---|----------|
| D1 | Asociación **cabecera-cabecera** (`ComprobanteDocumentoFisico`), no a nivel línea. |
| D2 | Cache `comprobanteEstado` en la tabla intermedia, refrescado en la TX de la transición. |
| D3 | Seed universal de 8 tipos al crear org CONTABILIDAD (no depende de `tipoEmpresaPrincipal`). |
| D4 | `monto`/`moneda` condicionales por `esTributario` (obligatorios+>0 si tributario; prohibidos si no). |
| D5 | Endpoints de asociación como **sub-recurso** del comprobante (`/comprobantes/:id/documentos-fisicos`). |
| D6 | Mapping de P2002/P2003 de Prisma a `DomainError` en los adapters (no en el `GlobalExceptionFilter`). |
| D7 | Mutabilidad: documento inmutable si está en ≥1 CONTABILIZADO; eliminable solo sin asociaciones vivas. |
| D8 | Comprobante BLOQUEADO (período cerrado): el cache se respeta; la reapertura re-sincroniza. |
| D9 | VOs de dominio puro: `TipoDocumentoFisicoCodigo`, `TipoDocumentoFisicoNombre`, `NumeroDocumento`. |
| D10 | Validación condicional de monto/moneda en el service + `monto > 0` en el DTO. |
| D11 | Compatibilidad tipo-documento ↔ tipo-comprobante vía `tiposComprobanteAplicables`. |

### Catálogo sembrado (D3 / D11 — matriz exacta)

`backend/src/tipos-documento-fisico/seed/tipos-universales.ts`:

| codigo | esTributario | tiposComprobanteAplicables |
|--------|--------------|----------------------------|
| `factura-emitida` | sí | INGRESO, DIARIO |
| `factura-recibida` | sí | EGRESO, DIARIO |
| `nota-credito-emitida` | sí | EGRESO, AJUSTE, DIARIO |
| `nota-debito-emitida` | sí | INGRESO, AJUSTE, DIARIO |
| `recibo-ingreso` | no | INGRESO, DIARIO |
| `recibo-egreso` | no | EGRESO, DIARIO |
| `comprobante-interno` | no | los 7 tipos |
| `vale-caja-chica` | no | EGRESO, DIARIO |

---

## 5. Flujos

- **Asociar** (`POST /comprobantes/:id/documentos-fisicos`, permisos
  `documentos-fisicos.update` + `asientos.update`): valida que el comprobante sea
  BORRADOR, que cada documento exista en el tenant y que su tipo sea compatible con el
  tipo del comprobante (D11). Devuelve **201**.
- **Desasociar** (`DELETE /comprobantes/:id/documentos-fisicos/:docId`): solo si el
  comprobante es BORRADOR (204). Si está CONTABILIZADO → 409.
- **Contabilizar** (`ComprobantesService.contabilizar`, dentro de la TX, ANTES de
  consumir numeración): si hay documentos asociados, `idsYaAsociadosAContabilizado`
  rechaza el race (409 `DOCUMENTO_FISICO_YA_ASOCIADO_A_OTRO_CONTABILIZADO`); luego
  `refrescarEstadoComprobante(CONTABILIZADO)`.
- **Anular** (`ComprobantesService.anular`, dentro de la TX): `desasociarTodasDelComprobante`
  libera los documentos (sobreviven y quedan re-asociables). El número del comprobante se
  conserva (§4.7).

### Códigos de error (estables hacia el cliente)
`TIPO_DOCUMENTO_FISICO_{NO_ENCONTRADO|CODIGO_DUPLICADO|NOMBRE_DUPLICADO|CON_DOCUMENTOS|INACTIVO}`,
`DOCUMENTO_FISICO_{NO_ENCONTRADO|NUMERO_DUPLICADO|INMUTABLE_POR_COMPROBANTE_CONTABILIZADO|REFERENCIADO_POR_COMPROBANTE|YA_ASOCIADO_A_OTRO_CONTABILIZADO|MONTO_REQUERIDO_PARA_TRIBUTARIO|MONTO_NO_PERMITIDO_PARA_NO_TRIBUTARIO}`,
`TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE`, `COMPROBANTE_DOCUMENTO_FISICO_NO_EXISTE`,
`COMPROBANTE_NO_ES_BORRADOR`, `COMPROBANTE_DOCUMENTO_NO_DESASOCIABLE_CONTABILIZADO`.

---

## 6. Riesgos

| # | Riesgo | Mitigación |
|---|--------|------------|
| R1 | Drift del cache `comprobanteEstado`. | `refrescarEstadoComprobante` en la misma TX; integration spec verifica el invariante. |
| R2 | Migration manual (UNIQUE PARCIAL) no idempotente. | `IF NOT EXISTS` en el SQL. |
| R3 | Race al contabilizar el mismo documento. | UNIQUE PARCIAL en BD + pre-validación con `tx` (defense in depth, §4.8). |
| R4 | TX larga al crear tenant (seed). | Aceptado: 8 INSERTs pequeños, `Tenant.create` es low-frequency. |
| R5 | N+1 en filtro de estado derivado del listado. | `where: { asociaciones: { some/none } }`; índice si emerge regresión. |
| R6 | Eliminación de documento que solo tuvo asociaciones ANULADAS. | Documentado en D7 (deuda E-EL-02); materializar auditoría aparte si se pide. |
| R7 | Contradicción documental con `comprobantes-asientos.md`. | Resuelto: §12.3 de ese doc aclara la decisión cabecera-cabecera. |

---

## 7. Forward-compat

### Slice 3 — Factura
- Tabla `Factura` con FK 1:1 opcional a `DocumentoFisico` (`documentoFisicoId String? @unique`).
- `DocumentoFisico.monto` = total del papel (neto + IVA + IT); `Factura` agrega los
  desgloses (`montoNeto`, `montoIva`, `montoIt?`) + datos tributarios (`nitEmisor`,
  `codigoAutorizacion`, etc.) sin tocar `DocumentoFisico`.
- Nuevo invariante: si `tipo.esTributario`, exigir `Factura` adjunta antes de asociar a
  un comprobante CONTABILIZADO.

### Slice 4 — LCV
- El Libro de Compras y Ventas itera sobre `Factura` (no sobre `DocumentoFisico` directo),
  vía `FACTURAS_READER_PORT`. JOIN a `DocumentoFisico` solo para el detalle visual.

Este slice deja listo: el flag `esTributario`, `monto` ya poblado para tributarios, y la
separación arquitectural que hace la migración a `Factura` trivial.
