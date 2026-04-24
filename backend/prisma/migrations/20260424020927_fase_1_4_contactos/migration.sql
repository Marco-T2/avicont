-- ============================================================
-- Fase 1.4 slice 1 — Contactos
-- Ver docs/disenos/contactos.md §4 para el diseño de la migración.
-- ============================================================

-- 1. CreateTable
CREATE TABLE "contactos" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "nombreComercial" TEXT,
    "documento" TEXT,
    "esCliente" BOOLEAN NOT NULL DEFAULT false,
    "esProveedor" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contactos_pkey" PRIMARY KEY ("id")
);

-- 2. CHECK constraint: al menos uno de los flags en true.
--    Defense in depth (CLAUDE.md §4.8) junto con la validación de service.
ALTER TABLE "contactos"
    ADD CONSTRAINT "contactos_es_cliente_o_proveedor_check"
    CHECK ("esCliente" = true OR "esProveedor" = true);

-- 3. Índices normales (declarativos desde Prisma)
CREATE INDEX "contactos_organizationId_idx" ON "contactos"("organizationId");
CREATE INDEX "contactos_organizationId_activo_idx" ON "contactos"("organizationId", "activo");
CREATE INDEX "contactos_organizationId_esCliente_idx" ON "contactos"("organizationId", "esCliente");
CREATE INDEX "contactos_organizationId_esProveedor_idx" ON "contactos"("organizationId", "esProveedor");

-- 4. Índice parcial único — anti-duplicados por documento dentro del tenant.
--    Permite N contactos sin documento (NULL ignorado por el WHERE).
CREATE UNIQUE INDEX "contactos_organizationId_documento_partial_key"
    ON "contactos"("organizationId", "documento")
    WHERE "documento" IS NOT NULL;

-- 5. Extensión e índices GIN trigram para búsqueda ILIKE parcial por nombre.
--    Primera vez que el proyecto usa pg_trgm; creación idempotente.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "contactos_razonSocial_trgm_idx"
    ON "contactos" USING GIN ("razonSocial" gin_trgm_ops);

CREATE INDEX "contactos_nombreComercial_trgm_idx"
    ON "contactos" USING GIN ("nombreComercial" gin_trgm_ops);

-- 6. Migración seca: limpiar contactoId existente antes de convertir a FK.
--    Confirmado con el owner: no hay data real en prod. Strings libres de
--    dev/test se descartan — si hubiese datos reales, se haría data
--    migration separada con contactos placeholder.
UPDATE "lineas_comprobante" SET "contactoId" = NULL;

-- 7. FK LineaComprobante.contactoId -> Contacto.id (Restrict).
--    onDelete: Restrict — un contacto referenciado nunca se elimina.
ALTER TABLE "lineas_comprobante"
    ADD CONSTRAINT "lineas_comprobante_contactoId_fkey"
    FOREIGN KEY ("contactoId") REFERENCES "contactos"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 8. Índice de apoyo para queries cross-contacto (LCV, listados).
CREATE INDEX "lineas_comprobante_organizationId_contactoId_idx"
    ON "lineas_comprobante"("organizationId", "contactoId");

-- 9. FK Contacto.organizationId -> Organization.id (Cascade).
ALTER TABLE "contactos"
    ADD CONSTRAINT "contactos_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
