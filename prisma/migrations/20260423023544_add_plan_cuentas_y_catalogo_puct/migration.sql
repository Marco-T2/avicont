-- CreateEnum
CREATE TYPE "TipoEmpresa" AS ENUM ('COMERCIAL', 'SERVICIOS', 'TRANSPORTE', 'INDUSTRIAL', 'PETROLERA', 'CONSTRUCCION', 'AGROPECUARIA', 'MINERA');

-- CreateEnum
CREATE TYPE "Moneda" AS ENUM ('BOB', 'USD');

-- CreateEnum
CREATE TYPE "ClaseCuenta" AS ENUM ('ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'EGRESO');

-- CreateEnum
CREATE TYPE "NaturalezaCuenta" AS ENUM ('DEUDORA', 'ACREEDORA');

-- CreateEnum
CREATE TYPE "SubClaseCuenta" AS ENUM ('ACTIVO_CORRIENTE', 'ACTIVO_NO_CORRIENTE', 'PASIVO_CORRIENTE', 'PASIVO_NO_CORRIENTE', 'PATRIMONIO_CAPITAL', 'PATRIMONIO_RESULTADOS', 'INGRESO_OPERATIVO', 'INGRESO_NO_OPERATIVO', 'EGRESO_OPERATIVO', 'EGRESO_ADMINISTRATIVO', 'EGRESO_FINANCIERO', 'EGRESO_NO_OPERATIVO');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "tipoEmpresaPrincipal" "TipoEmpresa" NOT NULL DEFAULT 'COMERCIAL',
ADD COLUMN     "tiposEmpresaActivos" "TipoEmpresa"[];

-- CreateTable
CREATE TABLE "catalogo_puct" (
    "codigo" TEXT NOT NULL,
    "nivel" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "claseCuenta" "ClaseCuenta" NOT NULL,
    "padre" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "tiposEmpresa" "TipoEmpresa"[],
    "versionPuct" TEXT NOT NULL,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalogo_puct_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "cuentas" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "codigoInterno" TEXT NOT NULL,
    "codigoPuct" TEXT,
    "nombrePuctSnapshot" TEXT,
    "versionPuctMapeado" TEXT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "claseCuenta" "ClaseCuenta" NOT NULL,
    "subClaseCuenta" "SubClaseCuenta",
    "naturaleza" "NaturalezaCuenta" NOT NULL,
    "parentId" TEXT,
    "nivel" INTEGER NOT NULL,
    "esDetalle" BOOLEAN NOT NULL DEFAULT false,
    "requiereContacto" BOOLEAN NOT NULL DEFAULT false,
    "esContraria" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "monedaFuncional" "Moneda" NOT NULL DEFAULT 'BOB',
    "permiteMultiMoneda" BOOLEAN NOT NULL DEFAULT true,
    "esSystemSeed" BOOLEAN NOT NULL DEFAULT false,
    "esRequeridaSistema" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuentas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_configuracion_contable" (
    "organizationId" TEXT NOT NULL,
    "ivaCreditoId" TEXT,
    "ivaDebitoId" TEXT,
    "ivaCreditoImportacionesId" TEXT,
    "itPorPagarId" TEXT,
    "iuePorPagarId" TEXT,
    "rcIvaRetenidoId" TEXT,
    "difCambioGananciaId" TEXT,
    "difCambioPerdidaId" TEXT,
    "resultadoEjercicioId" TEXT,
    "resultadosAcumuladosId" TEXT,
    "cajaChicaDefaultId" TEXT,
    "ajustePorInflacionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_configuracion_contable_pkey" PRIMARY KEY ("organizationId")
);

-- CreateIndex
CREATE INDEX "catalogo_puct_nivel_idx" ON "catalogo_puct"("nivel");

-- CreateIndex
CREATE INDEX "catalogo_puct_padre_idx" ON "catalogo_puct"("padre");

-- CreateIndex
CREATE INDEX "catalogo_puct_claseCuenta_idx" ON "catalogo_puct"("claseCuenta");

-- CreateIndex
CREATE INDEX "catalogo_puct_tiposEmpresa_idx" ON "catalogo_puct" USING GIN ("tiposEmpresa");

-- CreateIndex
CREATE INDEX "cuentas_organizationId_codigoPuct_idx" ON "cuentas"("organizationId", "codigoPuct");

-- CreateIndex
CREATE INDEX "cuentas_organizationId_claseCuenta_idx" ON "cuentas"("organizationId", "claseCuenta");

-- CreateIndex
CREATE INDEX "cuentas_organizationId_subClaseCuenta_idx" ON "cuentas"("organizationId", "subClaseCuenta");

-- CreateIndex
CREATE INDEX "cuentas_parentId_idx" ON "cuentas"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_organizationId_codigoInterno_key" ON "cuentas"("organizationId", "codigoInterno");

-- AddForeignKey
ALTER TABLE "catalogo_puct" ADD CONSTRAINT "catalogo_puct_padre_fkey" FOREIGN KEY ("padre") REFERENCES "catalogo_puct"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "cuentas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_configuracion_contable" ADD CONSTRAINT "org_configuracion_contable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_configuracion_contable" ADD CONSTRAINT "org_configuracion_contable_ivaCreditoId_fkey" FOREIGN KEY ("ivaCreditoId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_configuracion_contable" ADD CONSTRAINT "org_configuracion_contable_ivaDebitoId_fkey" FOREIGN KEY ("ivaDebitoId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_configuracion_contable" ADD CONSTRAINT "org_configuracion_contable_ivaCreditoImportacionesId_fkey" FOREIGN KEY ("ivaCreditoImportacionesId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_configuracion_contable" ADD CONSTRAINT "org_configuracion_contable_itPorPagarId_fkey" FOREIGN KEY ("itPorPagarId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_configuracion_contable" ADD CONSTRAINT "org_configuracion_contable_iuePorPagarId_fkey" FOREIGN KEY ("iuePorPagarId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_configuracion_contable" ADD CONSTRAINT "org_configuracion_contable_rcIvaRetenidoId_fkey" FOREIGN KEY ("rcIvaRetenidoId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_configuracion_contable" ADD CONSTRAINT "org_configuracion_contable_difCambioGananciaId_fkey" FOREIGN KEY ("difCambioGananciaId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_configuracion_contable" ADD CONSTRAINT "org_configuracion_contable_difCambioPerdidaId_fkey" FOREIGN KEY ("difCambioPerdidaId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_configuracion_contable" ADD CONSTRAINT "org_configuracion_contable_resultadoEjercicioId_fkey" FOREIGN KEY ("resultadoEjercicioId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_configuracion_contable" ADD CONSTRAINT "org_configuracion_contable_resultadosAcumuladosId_fkey" FOREIGN KEY ("resultadosAcumuladosId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_configuracion_contable" ADD CONSTRAINT "org_configuracion_contable_cajaChicaDefaultId_fkey" FOREIGN KEY ("cajaChicaDefaultId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_configuracion_contable" ADD CONSTRAINT "org_configuracion_contable_ajustePorInflacionId_fkey" FOREIGN KEY ("ajustePorInflacionId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
