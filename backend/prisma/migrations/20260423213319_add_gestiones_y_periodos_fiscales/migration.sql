-- CreateEnum
CREATE TYPE "GestionFiscalStatus" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "PeriodoFiscalStatus" AS ENUM ('ABIERTO', 'CERRADO');

-- CreateTable
CREATE TABLE "gestiones_fiscales" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "mesInicio" INTEGER NOT NULL,
    "status" "GestionFiscalStatus" NOT NULL DEFAULT 'ABIERTA',
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gestiones_fiscales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodos_fiscales" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "gestionId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "ordenEnGestion" INTEGER NOT NULL,
    "status" "PeriodoFiscalStatus" NOT NULL DEFAULT 'ABIERTO',
    "esDefinitivo" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "periodos_fiscales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodo_fiscal_reopenings" (
    "id" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "reopenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reopenedByUserId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "reclosedAt" TIMESTAMP(3),
    "reclosedByUserId" TEXT,

    CONSTRAINT "periodo_fiscal_reopenings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gestiones_fiscales_organizationId_status_idx" ON "gestiones_fiscales"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gestiones_fiscales_organizationId_year_key" ON "gestiones_fiscales"("organizationId", "year");

-- CreateIndex
CREATE INDEX "periodos_fiscales_organizationId_status_idx" ON "periodos_fiscales"("organizationId", "status");

-- CreateIndex
CREATE INDEX "periodos_fiscales_gestionId_idx" ON "periodos_fiscales"("gestionId");

-- CreateIndex
CREATE UNIQUE INDEX "periodos_fiscales_organizationId_year_month_key" ON "periodos_fiscales"("organizationId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "periodos_fiscales_gestionId_ordenEnGestion_key" ON "periodos_fiscales"("gestionId", "ordenEnGestion");

-- CreateIndex
CREATE INDEX "periodo_fiscal_reopenings_periodoId_idx" ON "periodo_fiscal_reopenings"("periodoId");

-- AddForeignKey
ALTER TABLE "gestiones_fiscales" ADD CONSTRAINT "gestiones_fiscales_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodos_fiscales" ADD CONSTRAINT "periodos_fiscales_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodos_fiscales" ADD CONSTRAINT "periodos_fiscales_gestionId_fkey" FOREIGN KEY ("gestionId") REFERENCES "gestiones_fiscales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodo_fiscal_reopenings" ADD CONSTRAINT "periodo_fiscal_reopenings_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "periodos_fiscales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
