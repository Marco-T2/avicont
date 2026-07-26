-- Partidas ya ABIERTAS a la fecha del arranque (change `informe-conciliacion-
-- bancaria`, corrección del CRÍTICO 1 de la auditoría).
--
-- Migración ADITIVA pura, SIN backfill. Los arranques ya declarados quedan sin
-- partidas congeladas: su informe se comporta como hasta ahora (lo que estaba
-- abierto antes del arranque cae al residuo). Se corrige volviendo a declarar
-- el arranque — que es append-only y por lo tanto siempre disponible.
--
-- PROTOCOLO §11.6: escrita A MANO. NO se regeneró con `prisma migrate dev`
-- justamente para no volver a arrastrar los DROP de los objetos raw SQL que no
-- viven en schema.prisma (índices GIN trigram de contactos, tabla
-- comprobantes_audit y sus triggers).

-- CreateEnum
-- Tres orígenes, no dos: un movimiento IGNORADO anterior al arranque está
-- dentro del saldo que el banco publica y NUNCA va a tener contrapartida
-- contable, así que es partida para siempre — y con nombre propio
-- (REQ-ICB-02). Meterlo con los pendientes lo haría parecer transitorio.
CREATE TYPE "OrigenPartidaArranque" AS ENUM ('MOVIMIENTO_PENDIENTE', 'MOVIMIENTO_IGNORADO', 'LINEA');

-- CreateTable
CREATE TABLE "arranque_partidas_abiertas" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "arranqueId" TEXT NOT NULL,
    "origen" "OrigenPartidaArranque" NOT NULL,
    "movimientoBancarioId" TEXT,
    "comprobanteId" TEXT,
    "orden" INTEGER,
    "fecha" DATE NOT NULL,
    "importe" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "arranque_partidas_abiertas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "arranque_partidas_abiertas_organizationId_arranqueId_idx" ON "arranque_partidas_abiertas"("organizationId", "arranqueId");

-- AddForeignKey (Cascade: las partidas congeladas son parte del acto declarado,
-- no tienen vida propia fuera de él)
ALTER TABLE "arranque_partidas_abiertas" ADD CONSTRAINT "arranque_partidas_abiertas_arranqueId_fkey" FOREIGN KEY ("arranqueId") REFERENCES "arranques_conciliados"("id") ON DELETE CASCADE ON UPDATE CASCADE;
