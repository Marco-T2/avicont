-- Change `verificador-movimientos-bancarios` (REQ-CB-21 / REQ-VMB-01).
-- Migración escrita A MANO (design D8, protocolo §11.6): aditiva pura, cero DROP.
-- `ordenFisico` nullable sin default: los movimientos preexistentes quedan en
-- NULL a propósito (el orden físico ya se descartó, no se reconstruye).

ALTER TABLE "movimientos_bancarios" ADD COLUMN "ordenFisico" INTEGER;

-- Índice para el listado cross-cuenta del verificador (filtra por tenant + rango).
CREATE INDEX "movimientos_bancarios_organizationId_fecha_idx"
  ON "movimientos_bancarios"("organizationId", "fecha");
