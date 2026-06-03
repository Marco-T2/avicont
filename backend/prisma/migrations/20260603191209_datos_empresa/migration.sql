-- AlterTable: datos fiscales del perfil de la organización (RND 10-0025-14).
-- ADD COLUMN aditivo: nullable, sin default, sin backfill. Seguro en producción.
ALTER TABLE "organizations" ADD COLUMN "razonSocial" TEXT;
ALTER TABLE "organizations" ADD COLUMN "nit" TEXT;
ALTER TABLE "organizations" ADD COLUMN "direccion" TEXT;
ALTER TABLE "organizations" ADD COLUMN "representanteLegal" TEXT;
ALTER TABLE "organizations" ADD COLUMN "telefono" TEXT;
ALTER TABLE "organizations" ADD COLUMN "email" TEXT;
