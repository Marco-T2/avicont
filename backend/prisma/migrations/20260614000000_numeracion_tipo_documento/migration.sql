-- Migration: numeracion-tipo-documento
-- Aditiva: 2 columnas nuevas en tipos_documento_fisico + nueva tabla secuencias_documento_fisico.
-- §11.6: el diff de Prisma incluye DROP INDEX para trigram de contactos y DROP TABLE
-- comprobantes_audit — ambos son objetos raw SQL fuera del schema Prisma (ver lista §11.6).
-- Esas líneas DROP se omiten aquí deliberadamente.

-- AlterTable: agregar campos de numeración automática a tipos_documento_fisico.
-- numeracionAutomatica: default false — retrocompatible; tipos existentes quedan en modo manual.
-- numeroInicial: nullable — null mientras numeracionAutomatica=false.
ALTER TABLE "tipos_documento_fisico"
  ADD COLUMN "numeracionAutomatica" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "numeroInicial" INTEGER;

-- CreateTable: contador atómico de numeración continua por (tenant, tipoDocumentoFisico).
-- Sin year/month: la secuencia es continua (NO reinicia mensualmente como SecuenciaComprobante).
-- El upsert INSERT ... ON CONFLICT DO UPDATE RETURNING garantiza atomicidad bajo concurrencia
-- (Anti-24, CLAUDE.md §4.9, cicatriz VOUCHER_NUMBER_CONTENTION).
CREATE TABLE "secuencias_documento_fisico" (
    "organizationId"        TEXT        NOT NULL,
    "tipoDocumentoFisicoId" TEXT        NOT NULL,
    "ultimoNumero"          INTEGER     NOT NULL,
    "updatedAt"             TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "secuencias_documento_fisico_pkey" PRIMARY KEY ("organizationId","tipoDocumentoFisicoId")
);
