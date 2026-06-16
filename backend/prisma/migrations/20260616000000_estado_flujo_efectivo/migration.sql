-- Estado de Flujo de Efectivo (EFE) — actividad por cuenta (NIC 7).
-- Migración ADITIVA (CLAUDE.md §11.6): solo CREATE TYPE + ADD COLUMN nullable.
--
-- NOTA §11.6: `prisma migrate dev` detectó como "drift" varios objetos raw SQL
-- vivos (tabla comprobantes_audit + triggers, índices trigram de contactos,
-- CHECKs de organizations/lotes, índice parcial de documento físico) e intentó
-- meter sus DROP en esta migración. Esos DROP fueron OMITIDOS a mano: esta
-- migración NO debe tocar ningún objeto raw SQL existente, solo agregar el enum
-- ActividadFlujo y la columna nullable Cuenta.actividadFlujo. Retrocompatible:
-- las cuentas existentes quedan en NULL y el reporte EFE resuelve por heurística.

-- CreateEnum
CREATE TYPE "ActividadFlujo" AS ENUM ('EFECTIVO', 'OPERACION', 'INVERSION', 'FINANCIACION');

-- AlterTable
ALTER TABLE "cuentas" ADD COLUMN "actividadFlujo" "ActividadFlujo";
