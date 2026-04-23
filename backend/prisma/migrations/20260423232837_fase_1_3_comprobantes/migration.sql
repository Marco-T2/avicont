-- CreateEnum
CREATE TYPE "TipoComprobante" AS ENUM ('APERTURA', 'DIARIO', 'INGRESO', 'EGRESO', 'AJUSTE', 'TRASPASO', 'CIERRE');

-- CreateEnum
CREATE TYPE "EstadoComprobante" AS ENUM ('BORRADOR', 'CONTABILIZADO', 'BLOQUEADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "AccionAuditoriaComprobante" AS ENUM ('CREADO', 'EDITADO', 'CONTABILIZADO', 'ANULADO', 'CREADO_POR_REVERSION', 'EDIT_EN_REAPERTURA');

-- CreateTable
CREATE TABLE "comprobantes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tipo" "TipoComprobante" NOT NULL,
    "numero" TEXT,
    "estado" "EstadoComprobante" NOT NULL DEFAULT 'BORRADOR',
    "fechaContable" DATE NOT NULL,
    "periodoFiscalId" TEXT NOT NULL,
    "glosa" TEXT NOT NULL,
    "monedaPrincipal" "Moneda" NOT NULL DEFAULT 'BOB',
    "totalDebitoBob" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalCreditoBob" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "origenTipo" TEXT,
    "origenId" TEXT,
    "anulaAId" TEXT,
    "anuladoEn" TIMESTAMP(3),
    "anuladoPorUserId" TEXT,
    "motivoAnulacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comprobantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineas_comprobante" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "contactoId" TEXT,
    "moneda" "Moneda" NOT NULL,
    "debito" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credito" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tipoCambio" DECIMAL(14,8) NOT NULL DEFAULT 1,
    "debitoBob" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditoBob" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "glosaLinea" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lineas_comprobante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secuencias_comprobante" (
    "organizationId" TEXT NOT NULL,
    "tipo" "TipoComprobante" NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "ultimoNumero" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "secuencias_comprobante_pkey" PRIMARY KEY ("organizationId","tipo","year","month")
);

-- CreateTable
CREATE TABLE "comprobantes_auditoria" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accion" "AccionAuditoriaComprobante" NOT NULL,
    "diff" JSONB NOT NULL,
    "fueDuranteReapertura" BOOLEAN NOT NULL DEFAULT false,
    "reaperturaId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comprobantes_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comprobantes_organizationId_periodoFiscalId_estado_idx" ON "comprobantes"("organizationId", "periodoFiscalId", "estado");

-- CreateIndex
CREATE INDEX "comprobantes_organizationId_fechaContable_idx" ON "comprobantes"("organizationId", "fechaContable");

-- CreateIndex
CREATE INDEX "comprobantes_organizationId_tipo_fechaContable_idx" ON "comprobantes"("organizationId", "tipo", "fechaContable");

-- CreateIndex
CREATE UNIQUE INDEX "comprobantes_organizationId_tipo_numero_key" ON "comprobantes"("organizationId", "tipo", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "comprobantes_organizationId_origenTipo_origenId_key" ON "comprobantes"("organizationId", "origenTipo", "origenId");

-- CreateIndex
CREATE UNIQUE INDEX "comprobantes_anulaAId_key" ON "comprobantes"("anulaAId");

-- CreateIndex
CREATE INDEX "lineas_comprobante_organizationId_cuentaId_idx" ON "lineas_comprobante"("organizationId", "cuentaId");

-- CreateIndex
CREATE INDEX "lineas_comprobante_organizationId_comprobanteId_idx" ON "lineas_comprobante"("organizationId", "comprobanteId");

-- CreateIndex
CREATE UNIQUE INDEX "lineas_comprobante_comprobanteId_orden_key" ON "lineas_comprobante"("comprobanteId", "orden");

-- CreateIndex
CREATE INDEX "comprobantes_auditoria_organizationId_comprobanteId_timesta_idx" ON "comprobantes_auditoria"("organizationId", "comprobanteId", "timestamp");

-- CreateIndex
CREATE INDEX "comprobantes_auditoria_organizationId_userId_timestamp_idx" ON "comprobantes_auditoria"("organizationId", "userId", "timestamp");

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_periodoFiscalId_fkey" FOREIGN KEY ("periodoFiscalId") REFERENCES "periodos_fiscales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_anulaAId_fkey" FOREIGN KEY ("anulaAId") REFERENCES "comprobantes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_comprobante" ADD CONSTRAINT "lineas_comprobante_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "comprobantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_comprobante" ADD CONSTRAINT "lineas_comprobante_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes_auditoria" ADD CONSTRAINT "comprobantes_auditoria_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "comprobantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes_auditoria" ADD CONSTRAINT "comprobantes_auditoria_reaperturaId_fkey" FOREIGN KEY ("reaperturaId") REFERENCES "periodo_fiscal_reopenings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
