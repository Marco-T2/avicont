-- Migration: user_is_super_admin_and_platform_audit
-- Migración ADITIVA (Slice 1 del change super-admin).
-- Solo ADD COLUMN + CREATE TABLE — sin DROPs de objetos raw SQL vivos (§11.6 CLAUDE.md).
--
-- Objetos raw SQL OMITIDOS intencionalmente (detectados por migrate diff, son drift legítimo):
--   DROP INDEX contactos_razonSocial_trgm_idx   — raw SQL migration 20260424020927 (pg_trgm GIN)
--   DROP INDEX contactos_nombreComercial_trgm_idx — ídem
--   DROP TABLE comprobantes_audit               — raw SQL migration 20260527190718 (trigger audit)
-- Estos objetos NO están en el schema.prisma y Prisma los detecta como drift.
-- Se mantienen intactos tal como los define su migration de origen.

-- AlterTable: agregar campo de identidad de plataforma a la tabla User.
-- Aditivo: todos los users existentes quedan con isSuperAdmin = false (default).
-- Nota: la tabla se llama "User" (sin @@map en schema.prisma).
-- Ver docs/disenos/super-admin-plataforma.md §3 y design.md §6.
ALTER TABLE "User" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: tabla de auditoría de acciones de plataforma.
-- Separada de audit_logs (organizationId NOT NULL) para soportar acciones org-less.
-- Ver docs/disenos/super-admin-plataforma.md §6 y design.md §5.
CREATE TABLE "platform_audit" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetOrganizationId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: búsquedas por actor con ordenamiento temporal (historial de acciones del super-admin).
CREATE INDEX "platform_audit_actorUserId_createdAt_idx" ON "platform_audit"("actorUserId", "createdAt");

-- CreateIndex: búsquedas por org afectada con ordenamiento temporal (historial de una org).
CREATE INDEX "platform_audit_targetOrganizationId_createdAt_idx" ON "platform_audit"("targetOrganizationId", "createdAt");

-- AddForeignKey: FK hacia User (actor del evento de plataforma).
-- Nota: la tabla se llama "User" (sin @@map en schema.prisma).
ALTER TABLE "platform_audit" ADD CONSTRAINT "platform_audit_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: FK hacia organizations (org afectada, nullable — SetNull si la org se borra).
ALTER TABLE "platform_audit" ADD CONSTRAINT "platform_audit_targetOrganizationId_fkey"
    FOREIGN KEY ("targetOrganizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
