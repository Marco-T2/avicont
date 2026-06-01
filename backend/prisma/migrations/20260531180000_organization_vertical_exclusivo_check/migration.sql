-- §10.4 (docs/disenos/plataforma-multi-vertical.md): vertical EXCLUSIVO por org.
-- Una organización es de UN solo vertical (Contabilidad O Granja, no ambos).
-- Antes de esto la regla era solo convención del flujo de alta (flagsParaModulo);
-- ahora es invariante de base. El caso OTROS (ambos en false) sigue permitido.
--
-- Defense in depth (CLAUDE.md §4.8): este CHECK (hard) + el guard
-- VerticalNoExclusivoError en TenantsService.updateFeatures (friendly error).
--
-- Objeto raw SQL: no se expresa en schema.prisma. Si una migration se regenera,
-- Prisma lo detecta como drift y mete un DROP — ver CLAUDE.md §11.6 y la tabla
-- de objetos raw SQL vivos.
ALTER TABLE "organizations"
    ADD CONSTRAINT "organizations_vertical_exclusivo_check"
    CHECK (NOT ("contabilidadEnabled" AND "granjaEnabled"));
