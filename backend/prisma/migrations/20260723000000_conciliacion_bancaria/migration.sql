-- Migración ADITIVA (conciliacion-bancaria, pack `contabilidad.conciliacion`).
--
-- PROTOCOLO §11.6 APLICADO: la regeneración de Prisma detectó como "drift" varios
-- objetos raw SQL vivos que NO viven en schema.prisma. Esas líneas DROP fueron
-- removidas a mano para no romper invariantes de la BD:
--   - DROP INDEX "contactos_nombreComercial_trgm_idx"  (índice GIN trigram — origen 20260424020927_fase_1_4_contactos)
--   - DROP INDEX "contactos_razonSocial_trgm_idx"      (índice GIN trigram — origen 20260424020927_fase_1_4_contactos)
--   - DROP TABLE "comprobantes_audit"                   (tabla de auditoría raw + triggers/función — origen 20260527190718_comprobantes_anulacion_as_flag_and_audit_triggers)
--   - ALTER TABLE "adjuntos_comprobante" ALTER COLUMN "updatedAt" DROP DEFAULT  (drift incidental preexistente del @updatedAt — NO pertenece a este change, mismo criterio que 20260617000000_cierre_resultado_gestion)
-- Esta migración SOLO agrega: 5 enums nuevos del pack de conciliación bancaria,
-- Pack.otorgadoPorDefecto, y las 4 tablas del módulo (cuentas_bancarias,
-- movimientos_bancarios, importaciones_extracto, matches_conciliacion). Cero DROP,
-- cero destructivo. Ver openspec/changes/conciliacion-bancaria/design.md §9.

-- CreateEnum
CREATE TYPE "PerfilExtracto" AS ENUM ('BANCOSOL_XLSX', 'ECONOMICO_XLSX', 'UNION_XLSX');

-- CreateEnum
CREATE TYPE "LadoBancario" AS ENUM ('DEBITO', 'CREDITO');

-- CreateEnum
CREATE TYPE "EstadoMovimientoBancario" AS ENUM ('PENDIENTE', 'CONCILIADO', 'IGNORADO');

-- CreateEnum
CREATE TYPE "EstadoVerificacionExtracto" AS ENUM ('VERIFICADO', 'SIN_VERIFICAR', 'DESCUADRE');

-- CreateEnum
CREATE TYPE "LadoContable" AS ENUM ('DEBITO', 'CREDITO');

-- AlterTable
ALTER TABLE "packs" ADD COLUMN     "otorgadoPorDefecto" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "cuentas_bancarias" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "perfilExtracto" "PerfilExtracto" NOT NULL,
    "numeroCuenta" TEXT,
    "moneda" "Moneda" NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cuentas_bancarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_bancarios" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cuentaBancariaId" TEXT NOT NULL,
    "importacionId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "hora" TEXT,
    "monto" DECIMAL(18,2) NOT NULL,
    "tipo" "LadoBancario" NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "descripcionNormalizada" TEXT NOT NULL,
    "referencia" TEXT,
    "saldo" DECIMAL(18,2),
    "contraparteNombre" TEXT,
    "contraparteDocumento" TEXT,
    "datosOriginales" JSONB NOT NULL,
    "ordinalDia" INTEGER NOT NULL,
    "hashDedup" TEXT NOT NULL,
    "estado" "EstadoMovimientoBancario" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "movimientos_bancarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importaciones_extracto" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cuentaBancariaId" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "sha256Archivo" TEXT NOT NULL,
    "tamanioBytes" INTEGER NOT NULL,
    "perfilExtracto" "PerfilExtracto" NOT NULL,
    "fechaDesde" DATE NOT NULL,
    "fechaHasta" DATE NOT NULL,
    "coberturaDeclarada" BOOLEAN NOT NULL,
    "saldoInicial" DECIMAL(18,2),
    "saldoFinal" DECIMAL(18,2),
    "estadoVerificacion" "EstadoVerificacionExtracto" NOT NULL,
    "diferencia" DECIMAL(18,2),
    "filasLeidas" INTEGER NOT NULL,
    "movimientosNuevos" INTEGER NOT NULL,
    "movimientosDuplicados" INTEGER NOT NULL,
    "importadoPorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importaciones_extracto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches_conciliacion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "movimientoBancarioId" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "snapshotCuentaId" TEXT NOT NULL,
    "snapshotMonto" DECIMAL(18,2) NOT NULL,
    "snapshotTipo" "LadoContable" NOT NULL,
    "snapshotMoneda" "Moneda" NOT NULL,
    "snapshotFecha" DATE NOT NULL,
    "confianzaSugerida" TEXT,
    "conciliadoPorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matches_conciliacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_bancarias_cuentaId_key" ON "cuentas_bancarias"("cuentaId");

-- CreateIndex
CREATE INDEX "cuentas_bancarias_organizationId_activa_idx" ON "cuentas_bancarias"("organizationId", "activa");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_bancarias_organizationId_cuentaId_key" ON "cuentas_bancarias"("organizationId", "cuentaId");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_bancarias_organizationId_perfilExtracto_numeroCuent_key" ON "cuentas_bancarias"("organizationId", "perfilExtracto", "numeroCuenta");

-- CreateIndex
CREATE INDEX "movimientos_bancarios_organizationId_cuentaBancariaId_fecha_idx" ON "movimientos_bancarios"("organizationId", "cuentaBancariaId", "fecha");

-- CreateIndex
CREATE INDEX "movimientos_bancarios_cuentaBancariaId_estado_fecha_idx" ON "movimientos_bancarios"("cuentaBancariaId", "estado", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_bancarios_cuentaBancariaId_hashDedup_key" ON "movimientos_bancarios"("cuentaBancariaId", "hashDedup");

-- CreateIndex
CREATE INDEX "importaciones_extracto_organizationId_cuentaBancariaId_crea_idx" ON "importaciones_extracto"("organizationId", "cuentaBancariaId", "createdAt");

-- CreateIndex
CREATE INDEX "importaciones_extracto_cuentaBancariaId_sha256Archivo_idx" ON "importaciones_extracto"("cuentaBancariaId", "sha256Archivo");

-- CreateIndex
CREATE UNIQUE INDEX "matches_conciliacion_movimientoBancarioId_key" ON "matches_conciliacion"("movimientoBancarioId");

-- CreateIndex
CREATE INDEX "matches_conciliacion_organizationId_comprobanteId_idx" ON "matches_conciliacion"("organizationId", "comprobanteId");

-- CreateIndex
CREATE UNIQUE INDEX "matches_conciliacion_organizationId_movimientoBancarioId_key" ON "matches_conciliacion"("organizationId", "movimientoBancarioId");

-- CreateIndex
CREATE UNIQUE INDEX "matches_conciliacion_organizationId_comprobanteId_orden_key" ON "matches_conciliacion"("organizationId", "comprobanteId", "orden");

-- AddForeignKey
ALTER TABLE "cuentas_bancarias" ADD CONSTRAINT "cuentas_bancarias_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_bancarias" ADD CONSTRAINT "cuentas_bancarias_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_bancarios" ADD CONSTRAINT "movimientos_bancarios_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_bancarios" ADD CONSTRAINT "movimientos_bancarios_cuentaBancariaId_fkey" FOREIGN KEY ("cuentaBancariaId") REFERENCES "cuentas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_bancarios" ADD CONSTRAINT "movimientos_bancarios_importacionId_fkey" FOREIGN KEY ("importacionId") REFERENCES "importaciones_extracto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importaciones_extracto" ADD CONSTRAINT "importaciones_extracto_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importaciones_extracto" ADD CONSTRAINT "importaciones_extracto_cuentaBancariaId_fkey" FOREIGN KEY ("cuentaBancariaId") REFERENCES "cuentas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches_conciliacion" ADD CONSTRAINT "matches_conciliacion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches_conciliacion" ADD CONSTRAINT "matches_conciliacion_movimientoBancarioId_fkey" FOREIGN KEY ("movimientoBancarioId") REFERENCES "movimientos_bancarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
