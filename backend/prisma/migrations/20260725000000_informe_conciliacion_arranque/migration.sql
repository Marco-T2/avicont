-- Change `informe-conciliacion-bancaria` (REQ-ICB-04, design D3/D8).
-- Migración ADITIVA pura, SIN backfill: sin arranque declarado el informe se
-- emite abstenido, así que las filas nuevas solo aparecen por comando explícito.
--
-- PROTOCOLO §11.6 APLICADO: el diff regenerado contra el historial de
-- migraciones volvió a detectar como "drift" los objetos raw SQL vivos que NO
-- viven en schema.prisma. Estas líneas fueron REMOVIDAS a mano de este archivo:
--   - DROP INDEX "contactos_nombreComercial_trgm_idx"  (GIN trigram — origen 20260424020927_fase_1_4_contactos)
--   - DROP INDEX "contactos_razonSocial_trgm_idx"      (GIN trigram — origen 20260424020927_fase_1_4_contactos)
--   - DROP TABLE "comprobantes_audit"                   (auditoría raw + triggers — origen 20260527190718_comprobantes_anulacion_as_flag_and_audit_triggers)
--   - ALTER TABLE "adjuntos_comprobante" ALTER COLUMN "updatedAt" DROP DEFAULT (drift incidental preexistente del @updatedAt — NO pertenece a este change)
--
-- SIN UNIQUE sobre (cuentaBancariaId, fecha) a propósito: append-only (D8) —
-- una declaración posterior, incluso sobre la misma fecha, NUNCA pisa la
-- anterior. `vigenteA` desempata por `fecha DESC, createdAt DESC`.

-- CreateTable
CREATE TABLE "arranques_conciliados" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cuentaBancariaId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "saldoExtracto" DECIMAL(18,2) NOT NULL,
    "saldoLibros" DECIMAL(18,2) NOT NULL,
    "diferenciaResidual" DECIMAL(18,2) NOT NULL,
    "nota" TEXT,
    "declaradoPorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arranques_conciliados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (cota de rendimiento de `vigenteA`, design D3)
CREATE INDEX "arranques_conciliados_organizationId_cuentaBancariaId_fecha_idx" ON "arranques_conciliados"("organizationId", "cuentaBancariaId", "fecha");

-- AddForeignKey
ALTER TABLE "arranques_conciliados" ADD CONSTRAINT "arranques_conciliados_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (Restrict: un acto contable declarado no se borra por arrastre)
ALTER TABLE "arranques_conciliados" ADD CONSTRAINT "arranques_conciliados_cuentaBancariaId_fkey" FOREIGN KEY ("cuentaBancariaId") REFERENCES "cuentas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
