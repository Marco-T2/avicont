-- NOTE: Prisma generó DROP INDEX para contactos_nombreComercial_trgm_idx y
-- contactos_razonSocial_trgm_idx porque los índices GIN trigram viven en raw
-- SQL en la migration de contactos (Fase 1.4 slice 1) y no se declaran en
-- schema.prisma. Eliminados manualmente para preservar la búsqueda ILIKE.
-- Ver deuda A8 en docs/deudas/ y protocolo en CLAUDE.md §11 (Runbook).

-- CreateTable
CREATE TABLE "tipos_documento_fisico" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "esTributario" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "tiposComprobanteAplicables" "TipoComprobante"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tipos_documento_fisico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos_fisicos" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tipoDocumentoFisicoId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fechaEmision" DATE NOT NULL,
    "monto" DECIMAL(18,2),
    "moneda" "Moneda",
    "glosa" TEXT,
    "contactoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documentos_fisicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprobante_documento_fisico" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "documentoFisicoId" TEXT NOT NULL,
    "comprobanteEstado" "EstadoComprobante" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comprobante_documento_fisico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tipos_documento_fisico_organizationId_activo_idx" ON "tipos_documento_fisico"("organizationId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_documento_fisico_organizationId_codigo_key" ON "tipos_documento_fisico"("organizationId", "codigo");

-- CreateIndex
CREATE INDEX "documentos_fisicos_organizationId_fechaEmision_idx" ON "documentos_fisicos"("organizationId", "fechaEmision");

-- CreateIndex
CREATE INDEX "documentos_fisicos_organizationId_contactoId_idx" ON "documentos_fisicos"("organizationId", "contactoId");

-- CreateIndex
CREATE INDEX "documentos_fisicos_organizationId_tipoDocumentoFisicoId_idx" ON "documentos_fisicos"("organizationId", "tipoDocumentoFisicoId");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_fisicos_organizationId_tipoDocumentoFisicoId_num_key" ON "documentos_fisicos"("organizationId", "tipoDocumentoFisicoId", "numero");

-- CreateIndex
CREATE INDEX "comprobante_documento_fisico_organizationId_idx" ON "comprobante_documento_fisico"("organizationId");

-- CreateIndex
CREATE INDEX "comprobante_documento_fisico_comprobanteId_idx" ON "comprobante_documento_fisico"("comprobanteId");

-- CreateIndex
CREATE INDEX "comprobante_documento_fisico_documentoFisicoId_idx" ON "comprobante_documento_fisico"("documentoFisicoId");

-- CreateIndex
CREATE UNIQUE INDEX "comprobante_documento_fisico_documentoFisicoId_comprobanteI_key" ON "comprobante_documento_fisico"("documentoFisicoId", "comprobanteId");

-- AddForeignKey
ALTER TABLE "tipos_documento_fisico" ADD CONSTRAINT "tipos_documento_fisico_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_fisicos" ADD CONSTRAINT "documentos_fisicos_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_fisicos" ADD CONSTRAINT "documentos_fisicos_tipoDocumentoFisicoId_fkey" FOREIGN KEY ("tipoDocumentoFisicoId") REFERENCES "tipos_documento_fisico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_fisicos" ADD CONSTRAINT "documentos_fisicos_contactoId_fkey" FOREIGN KEY ("contactoId") REFERENCES "contactos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante_documento_fisico" ADD CONSTRAINT "comprobante_documento_fisico_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante_documento_fisico" ADD CONSTRAINT "comprobante_documento_fisico_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "comprobantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante_documento_fisico" ADD CONSTRAINT "comprobante_documento_fisico_documentoFisicoId_fkey" FOREIGN KEY ("documentoFisicoId") REFERENCES "documentos_fisicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Manual UNIQUE PARTIAL — proposal D2
-- Asegura que un DocumentoFisico esté asociado a a lo sumo UN comprobante
-- CONTABILIZADO simultáneamente. En BORRADOR no aplica restricción.
-- Nombre estable: el GlobalExceptionFilter matchea este identificador en
-- meta.target para mapearlo a DomainError (ver design.md §5.5).
CREATE UNIQUE INDEX IF NOT EXISTS "comprobante_documento_fisico_unique_contabilizado"
  ON "comprobante_documento_fisico" ("documentoFisicoId")
  WHERE "comprobanteEstado" = 'CONTABILIZADO';
