-- Migración ADITIVA (cierre-ejercicio).
--
-- PROTOCOLO §11.6 APLICADO: la regeneración de Prisma detectó como "drift" varios
-- objetos raw SQL vivos que NO viven en schema.prisma. Esas líneas DROP fueron
-- removidas a mano para no romper invariantes de la BD:
--   - DROP INDEX "contactos_nombreComercial_trgm_idx"  (índice GIN trigram — origen 20260424020927_fase_1_4_contactos)
--   - DROP INDEX "contactos_razonSocial_trgm_idx"      (índice GIN trigram — origen 20260424020927_fase_1_4_contactos)
--   - DROP TABLE "comprobantes_audit"                   (tabla de auditoría raw + triggers/función — origen 20260527190718_comprobantes_anulacion_as_flag_and_audit_triggers)
--   - ALTER TABLE "adjuntos_comprobante" ALTER COLUMN "updatedAt" DROP DEFAULT  (drift incidental preexistente del @updatedAt — NO pertenece a este change)
-- Esta migración SOLO agrega la columna generadoPorSistema + el raw SQL de datos.

-- AlterTable: atributo de ORIGEN del comprobante (cierre, apertura, auto-entries).
-- Ortogonal al estado (como anulado). Retrocompatible: existentes quedan false.
ALTER TABLE "comprobantes" ADD COLUMN     "generadoPorSistema" BOOLEAN NOT NULL DEFAULT false;

-- ===== Migración de datos del seed de cuentas (cierre-ejercicio, cuestión E) =====

-- Rename transitoria (idempotente): UTILIDAD DE LA GESTIÓN → RESULTADO DE LA GESTIÓN.
-- REQ-CTA-CIERRE-01: cuenta dual única (utilidad=acreedor / pérdida=deudor); Ley 843 art. 46.
UPDATE cuentas
SET nombre = 'RESULTADO DE LA GESTIÓN'
WHERE "codigoInterno" = '3.1.4.001'
  AND nombre = 'UTILIDAD DE LA GESTIÓN';

-- Eliminar 3.1.4.002 PÉRDIDA DE LA GESTIÓN solo si NO tiene movimiento (FK Restrict).
-- REQ-CTA-CIERRE-02: no rompe config mapeada (no está en MAPEO_CODIGO_A_CONCEPTO,
-- esRequeridaSistema=false). El NOT EXISTS hace explícito el guard de seguridad:
-- si alguna org ya la usó (improbable, no había cierre), la cuenta se preserva.
DELETE FROM cuentas c
WHERE c."codigoInterno" = '3.1.4.002'
  AND NOT EXISTS (
    SELECT 1 FROM lineas_comprobante lc WHERE lc."cuentaId" = c.id
  );
