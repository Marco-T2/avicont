-- Protocolo §11.6: las líneas DROP que Prisma genera por drift de objetos raw SQL
-- han sido eliminadas manualmente. Los objetos afectados son legítimos y deben
-- preservarse (ver tabla §11.6 en CLAUDE.md):
--   - contactos_nombreComercial_trgm_idx (INDEX GIN trigram — 20260424020927)
--   - contactos_razonSocial_trgm_idx     (INDEX GIN trigram — 20260424020927)
--   - comprobantes_audit                 (TABLE raw SQL audit — 20260527190718)
-- Esta migración es SOLO aditiva: agrega una columna a `comprobantes`.

-- AlterTable
ALTER TABLE "comprobantes" ADD COLUMN "tipoCambioReexpresion" DECIMAL(14,8) NOT NULL DEFAULT 1;
