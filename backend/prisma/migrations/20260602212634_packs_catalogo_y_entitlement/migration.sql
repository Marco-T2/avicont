-- Riel de packs (eje 2). Ver docs/disenos/packs-eje2.md §4.
--
-- NOTA §11.6: el diff generado por Prisma incluía tres DROP de drift sobre
-- objetos raw SQL legítimos que NO se expresan en schema.prisma:
--   - DROP INDEX "contactos_nombreComercial_trgm_idx"  (GIN trigram, migration 20260424020927)
--   - DROP INDEX "contactos_razonSocial_trgm_idx"       (GIN trigram, migration 20260424020927)
--   - DROP TABLE "comprobantes_audit"                   (audit raw,    migration 20260527190718)
-- Esos DROP se OMITIERON deliberadamente (protocolo §11.6): son objetos vivos,
-- no parte de este cambio. Esta migración es estrictamente aditiva.

-- CreateEnum
CREATE TYPE "VerticalPack" AS ENUM ('CONTABILIDAD', 'GRANJA');

-- CreateEnum
CREATE TYPE "TipoPack" AS ENUM ('DOMINIO', 'CAPACIDAD');

-- CreateTable
CREATE TABLE "packs" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "verticalAplicable" "VerticalPack" NOT NULL,
    "tipo" "TipoPack" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_pack_entitlements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "habilitadoPorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "org_pack_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "packs_clave_key" ON "packs"("clave");

-- CreateIndex
CREATE INDEX "org_pack_entitlements_organizationId_idx" ON "org_pack_entitlements"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "org_pack_entitlements_organizationId_packId_key" ON "org_pack_entitlements"("organizationId", "packId");

-- AddForeignKey
ALTER TABLE "org_pack_entitlements" ADD CONSTRAINT "org_pack_entitlements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_pack_entitlements" ADD CONSTRAINT "org_pack_entitlements_packId_fkey" FOREIGN KEY ("packId") REFERENCES "packs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
