-- Slice 2 (Fase 1.4) — `documento-fisico` task 4.1 prerequisite.
-- Agrega UNIQUE `(organizationId, nombre)` a `tipos_documento_fisico` para
-- enforce defense in depth del invariante "nombre único por tenant"
-- (CLAUDE.md §4.8). El service ya hace pre-check con error amigable
-- (`TipoDocumentoFisicoNombreDuplicadoError`); este UNIQUE es la última línea
-- contra race conditions (cicatriz F-01).
--
-- La tabla está vacía (sin filas históricas que puedan duplicar `nombre`),
-- así que el ALTER no requiere data backfill ni tiene riesgo de fallar.

-- CreateIndex
CREATE UNIQUE INDEX "tipos_documento_fisico_organizationId_nombre_key" ON "tipos_documento_fisico"("organizationId", "nombre");
