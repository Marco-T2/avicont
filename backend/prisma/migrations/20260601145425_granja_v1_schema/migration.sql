-- CreateEnum
CREATE TYPE "EstadoLote" AS ENUM ('ACTIVO', 'CERRADO');

-- CreateEnum
CREATE TYPE "NaturalezaRegistro" AS ENUM ('INVERSION', 'CANTIDAD');

-- Protocolo §11.6 CLAUDE.md: los siguientes objetos raw SQL son LEGÍTIMOS y no deben dropearse.
-- DROP INDEX "contactos_nombreComercial_trgm_idx";  -- GIN trigram, migration 20260424020927_fase_1_4_contactos
-- DROP INDEX "contactos_razonSocial_trgm_idx";       -- GIN trigram, migration 20260424020927_fase_1_4_contactos
-- DROP TABLE "comprobantes_audit";                   -- tabla de auditoría raw, migration 20260527190718_comprobantes_anulacion_as_flag_and_audit_triggers

-- CreateTable
CREATE TABLE "lotes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nombre" TEXT,
    "galpon" TEXT,
    "fechaIngreso" DATE NOT NULL,
    "cantidadInicial" INTEGER NOT NULL,
    "estado" "EstadoLote" NOT NULL DEFAULT 'ACTIVO',
    "fechaEstimadaSaca" DATE,
    "fechaCierre" DATE,
    "detalle" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipos_registro" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "naturaleza" "NaturalezaRegistro" NOT NULL,
    "esSistema" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tipos_registro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_inversion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "tipoRegistroId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "detalle" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "movimientos_inversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_cantidad" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "tipoRegistroId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "detalle" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "movimientos_cantidad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lotes_organizationId_estado_idx" ON "lotes"("organizationId", "estado");

-- CreateIndex
CREATE INDEX "lotes_organizationId_fechaIngreso_idx" ON "lotes"("organizationId", "fechaIngreso");

-- CreateIndex
CREATE INDEX "tipos_registro_organizationId_naturaleza_idx" ON "tipos_registro"("organizationId", "naturaleza");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_registro_organizationId_nombre_key" ON "tipos_registro"("organizationId", "nombre");

-- CreateIndex
CREATE INDEX "movimientos_inversion_organizationId_loteId_idx" ON "movimientos_inversion"("organizationId", "loteId");

-- CreateIndex
CREATE INDEX "movimientos_inversion_loteId_tipoRegistroId_idx" ON "movimientos_inversion"("loteId", "tipoRegistroId");

-- CreateIndex
CREATE INDEX "movimientos_cantidad_organizationId_loteId_idx" ON "movimientos_cantidad"("organizationId", "loteId");

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tipos_registro" ADD CONSTRAINT "tipos_registro_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inversion" ADD CONSTRAINT "movimientos_inversion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inversion" ADD CONSTRAINT "movimientos_inversion_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inversion" ADD CONSTRAINT "movimientos_inversion_tipoRegistroId_fkey" FOREIGN KEY ("tipoRegistroId") REFERENCES "tipos_registro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_cantidad" ADD CONSTRAINT "movimientos_cantidad_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_cantidad" ADD CONSTRAINT "movimientos_cantidad_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_cantidad" ADD CONSTRAINT "movimientos_cantidad_tipoRegistroId_fkey" FOREIGN KEY ("tipoRegistroId") REFERENCES "tipos_registro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraint raw SQL: cantidadInicial > 0 (invariante §4.2 del design).
-- Prisma no expresa CHECK de columna en el schema; se agrega como raw SQL (ver CLAUDE.md §11.6).
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_cantidad_inicial_positiva_check" CHECK ("cantidadInicial" > 0);
