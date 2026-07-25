-- AlterEnum
-- Perfil de extracto Banco FIE. Aditivo puro: no toca datos existentes ni el
-- resto del schema.
--
-- Migration ESCRITA A MANO a proposito (CLAUDE.md §11.6). `prisma migrate dev`
-- detecta como drift los objetos raw SQL que no viven en schema.prisma y
-- genera un `DROP TABLE "comprobantes_audit"` junto con sus triggers. Ver la
-- migration 20260527190718_comprobantes_anulacion_as_flag_and_audit_triggers
-- y el precedente inmediato 20260724220000_conciliacion_perfiles_fortaleza_bmsc.
ALTER TYPE "PerfilExtracto" ADD VALUE 'FIE_XLSX';
