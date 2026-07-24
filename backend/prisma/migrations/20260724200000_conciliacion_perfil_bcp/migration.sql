-- AlterEnum
-- Perfil de extracto BCP XLSX. Aditivo puro: no toca datos existentes ni el
-- resto del schema.
--
-- Migration ESCRITA A MANO a proposito (CLAUDE.md §11.6). `prisma migrate dev`
-- detecta como drift los objetos raw SQL que no viven en schema.prisma y
-- genera un `DROP TABLE "comprobantes_audit"` (210.017 filas al momento de
-- escribir esto) junto con sus triggers. Ver la migration
-- 20260527190718_comprobantes_anulacion_as_flag_and_audit_triggers.
ALTER TYPE "PerfilExtracto" ADD VALUE 'BCP_XLSX';
