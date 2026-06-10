-- Agrega updatedAt a adjuntos_comprobante (W-04 — spec dice que reemplazar actualiza updatedAt).
-- CLAUDE.md §4.6: timestamps de auditoría en UTC (Timestamptz). No son FechaContable de dominio.
-- La columna no existía en la migration original; se agrega con DEFAULT NOW() para las filas
-- preexistentes (retrocompatibilidad), y Prisma la mantendrá automáticamente vía @updatedAt.
ALTER TABLE "adjuntos_comprobante"
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW();
