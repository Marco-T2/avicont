-- CreateTable
-- Pack "contabilidad.adjuntos": metadata de adjuntos digitales a comprobantes.
-- El binario vive en MinIO (StoragePort hexagonal). Este modelo es 1-N directa
-- desde Comprobante: un adjunto pertenece a UN comprobante.
-- storageKey @unique previene colisiones en el storage.
-- @@index([organizationId, comprobanteId]) para consultas multi-tenant eficientes (Anti-31).
-- CLAUDE.md §4.2: organizationId en toda query — defense in depth.
CREATE TABLE "adjuntos_comprobante" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanoBytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "subidoPorUserId" TEXT NOT NULL,
    -- CLAUDE.md §4.6: timestamps en UTC
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adjuntos_comprobante_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "adjuntos_comprobante_storageKey_key" ON "adjuntos_comprobante"("storageKey");

-- CreateIndex
CREATE INDEX "adjuntos_comprobante_organizationId_comprobanteId_idx" ON "adjuntos_comprobante"("organizationId", "comprobanteId");

-- AddForeignKey
ALTER TABLE "adjuntos_comprobante" ADD CONSTRAINT "adjuntos_comprobante_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjuntos_comprobante" ADD CONSTRAINT "adjuntos_comprobante_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "comprobantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
