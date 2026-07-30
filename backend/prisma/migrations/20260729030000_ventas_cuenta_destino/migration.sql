-- Cuenta destino de la venta CONTADO (PA-1, change `ventas-piloto` Fase 4).
--
-- ESCRITA A MANO, protocolo §11.6 del CLAUDE.md. `prisma migrate dev` no se
-- puede usar en este repo: exige resetear la base de desarrollo porque una
-- migración anterior (20260726010000_arranque_anulacion) fue editada a mano
-- para rescatar objetos raw SQL vivos, y el checksum ya no coincide. Un reset
-- borraría los datos locales. Mismo camino que las migraciones de los perfiles
-- de extracto BCP, Fortaleza/BMSC y FIE.
--
-- ADITIVA PURA: un ADD COLUMN nullable y su FK. CERO `DROP` — verificado con
-- `grep -E "^DROP (INDEX|EXTENSION|TYPE|TABLE)"`, que no devuelve nada. No
-- toca `comprobantes_audit` ni sus triggers, ni los índices GIN trigram de
-- `contactos`, ni ninguno de los uniques parciales de la tabla de §11.6.
--
-- Nullable a propósito: una venta CREDITO no cobra nada al vender —su
-- contrapartida es CxC— así que la columna no aplica. Sin backfill: no hay
-- ventas en ninguna base todavía (el módulo se está construyendo).
--
-- Sin índice, por simetría deliberada con `cobros.cuentaDestinoId`, que
-- tampoco lo lleva: Postgres no indexa las FK automáticamente y no hay ninguna
-- consulta medida que filtre ventas por cuenta destino.

ALTER TABLE "ventas" ADD COLUMN "cuentaDestinoId" TEXT;

ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cuentaDestinoId_fkey" FOREIGN KEY ("cuentaDestinoId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
