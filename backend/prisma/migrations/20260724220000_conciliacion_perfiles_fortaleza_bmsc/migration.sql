-- AlterEnum
-- Perfiles de extracto Banco Fortaleza y Banco Mercantil Santa Cruz. Aditivo
-- puro: no toca datos existentes ni el resto del schema.
--
-- Migration ESCRITA A MANO a proposito (CLAUDE.md §11.6). `prisma migrate dev`
-- detecta como drift los objetos raw SQL que no viven en schema.prisma y
-- genera un `DROP TABLE "comprobantes_audit"` junto con sus triggers. Ver la
-- migration 20260527190718_comprobantes_anulacion_as_flag_and_audit_triggers
-- y el precedente inmediato 20260724200000_conciliacion_perfil_bcp.
ALTER TYPE "PerfilExtracto" ADD VALUE 'FORTALEZA_XLSX';
ALTER TYPE "PerfilExtracto" ADD VALUE 'BMSC_XLSX';
