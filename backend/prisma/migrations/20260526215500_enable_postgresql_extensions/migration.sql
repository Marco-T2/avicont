-- NOTA: esta migration activa `previewFeatures = ["postgresqlExtensions"]` en
-- el generator y declara `extensions = [pgTrgm(map: "pg_trgm")]` en el datasource.
-- Cierra deuda §3.4/A8 a nivel EXTENSION: Prisma ya no genera DROP EXTENSION pg_trgm.
--
-- Los índices GIN trigram + UNIQUE PARCIAL + CHECK constraints siguen como raw SQL
-- (no expresables en schema.prisma). Prisma los detectó como drift y emitió
-- DROP INDEX sobre los 2 GIN trigram — removidos a mano (protocolo CLAUDE.md §11.6).
-- Objetos creados en 20260424020927_fase_1_4_contactos.

-- Idempotente: la extension ya existe (creada en 20260424020927_fase_1_4_contactos).
-- Esta línea hace explícito que esta migration la declara y queda libre del drift.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
