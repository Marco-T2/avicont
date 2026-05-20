-- Drop de la maquinaria PUCT: tabla `catalogo_puct` (catálogo SIN especulativo,
-- nunca tuvo flujo contable real) + las 3 columnas de mapeo en `cuentas` y su índice.
-- Ver openspec/changes/remover-catalogo-puct (design Decisión 4).

-- NOTA §11.6 (drift de raw SQL): `prisma migrate diff` quiso dropear también
-- `contactos_razonSocial_trgm_idx` y `contactos_nombreComercial_trgm_idx`
-- (índices GIN trigram raw SQL de la migration 20260424020927_fase_1_4_contactos,
-- objetos VIVOS ajenos a este cambio). Esas líneas DROP se eliminaron a mano
-- para que sobrevivan; este migration solo toca catalogo_puct y cuentas.codigoPuct.

-- DropForeignKey
ALTER TABLE "catalogo_puct" DROP CONSTRAINT "catalogo_puct_padre_fkey";

-- DropIndex
DROP INDEX "cuentas_organizationId_codigoPuct_idx";

-- AlterTable
ALTER TABLE "cuentas" DROP COLUMN "codigoPuct",
DROP COLUMN "nombrePuctSnapshot",
DROP COLUMN "versionPuctMapeado";

-- DropTable
DROP TABLE "catalogo_puct";
