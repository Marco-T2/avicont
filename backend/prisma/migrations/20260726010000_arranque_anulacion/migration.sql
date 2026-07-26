-- Anulación de una declaración de arranque (REQ-ICB-04).
--
-- Por flag, jamás DELETE: el mismo modelo que §4.7 usa para comprobantes. El
-- acto anulado se conserva y sigue visible en el historial con su marca — que
-- alguien haya fijado mal el saldo de partida es parte del rastro.
--
-- Migración ADITIVA pura. `anulado` arranca en false para todas las
-- declaraciones existentes, que es exactamente su estado actual.
--
-- PROTOCOLO §11.6: escrita A MANO, sin `prisma migrate dev`, para no arrastrar
-- los DROP de los objetos raw SQL que no viven en schema.prisma (índices GIN
-- trigram de contactos, tabla comprobantes_audit y sus triggers).

ALTER TABLE "arranques_conciliados"
  ADD COLUMN "anulado"          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "fechaAnulacion"   TIMESTAMPTZ(3),
  ADD COLUMN "motivoAnulacion"  TEXT,
  ADD COLUMN "anuladoPorUserId" TEXT;

-- SIN índice parcial para las vigentes, a propósito: sería un objeto raw que
-- no vive en schema.prisma y el protocolo §11.6 ya documenta el costo de eso
-- (cada migración regenerada intenta DROPearlo y hay que sacarlo a mano). Una
-- cuenta bancaria acumula unas pocas declaraciones; el índice existente
-- (organizationId, cuentaBancariaId, fecha) alcanza de sobra y descartar las
-- anuladas sobre ese conjunto no se nota.
