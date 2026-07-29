-- Modulo comercial: Ventas y Cuentas por Cobrar (piloto).
-- 6 tablas nuevas + 2 columnas en org_configuracion_contable. ADITIVA PURA:
-- no altera ninguna tabla existente ni toca datos.
--
-- Migration ESCRITA A MANO (CLAUDE.md §11.6). `prisma migrate diff` propuso
-- CUATRO sentencias destructivas sobre objetos que NO viven en schema.prisma
-- y que fueron recortadas a mano acá:
--
--   1. DROP INDEX "contactos_nombreComercial_trgm_idx"   (GIN trigram, raw)
--   2. DROP INDEX "contactos_razonSocial_trgm_idx"       (GIN trigram, raw)
--        ambos de 20260424020927_fase_1_4_contactos — sostienen la busqueda
--        por nombre de contactos.
--   3. DROP TABLE "comprobantes_audit"                   (+ sus 2 triggers)
--        de 20260527190718_comprobantes_anulacion_as_flag_and_audit_triggers.
--        Es la auditoria de §4.3/§4.7 y hoy tiene ~210.000 filas.
--   4. ALTER TABLE "adjuntos_comprobante" ALTER COLUMN "updatedAt"
--      DROP DEFAULT — drift incidental PREEXISTENTE, ajeno a este change.
--        Se recorta por no arrastrar cambios que no son de acá.
--
-- Precedente identico (los mismos 4 recortes): 20260725000000_informe_conciliacion_arranque.

-- CreateEnum
CREATE TYPE "TipoItem" AS ENUM ('PRODUCTO', 'SERVICIO');

-- CreateEnum
CREATE TYPE "CondicionPago" AS ENUM ('CONTADO', 'CREDITO');

-- AlterTable
ALTER TABLE "org_configuracion_contable" ADD COLUMN     "cuentasPorCobrarId" TEXT,
ADD COLUMN     "ventasId" TEXT;

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "codigo" TEXT,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoItem" NOT NULL,
    "unidadMedida" TEXT,
    "precioUnitarioSugerido" DECIMAL(18,6),
    "cantidadPorDefecto" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "cuentaIngresoId" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactoId" TEXT NOT NULL,
    "fechaContable" DATE NOT NULL,
    "condicionPago" "CondicionPago" NOT NULL,
    "fechaVencimiento" DATE,
    "glosa" TEXT NOT NULL,
    "montoTotal" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineas_venta" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(18,6) NOT NULL,
    "precioUnitario" DECIMAL(18,6) NOT NULL,
    "cuentaIngresoId" TEXT NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "lineas_venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cobros" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactoId" TEXT NOT NULL,
    "fechaContable" DATE NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "cuentaDestinoId" TEXT NOT NULL,
    "glosa" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cobros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aplicaciones_cobro" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cobroId" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "montoAplicado" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "aplicaciones_cobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aplicaciones_cobro_desvinculadas" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cobroId" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "montoAplicado" DECIMAL(18,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aplicaciones_cobro_desvinculadas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "items_organizationId_idx" ON "items"("organizationId");

-- CreateIndex
CREATE INDEX "items_organizationId_activo_idx" ON "items"("organizationId", "activo");

-- CreateIndex
CREATE INDEX "items_organizationId_cuentaIngresoId_idx" ON "items"("organizationId", "cuentaIngresoId");

-- CreateIndex
CREATE INDEX "ventas_organizationId_idx" ON "ventas"("organizationId");

-- CreateIndex
CREATE INDEX "ventas_organizationId_contactoId_idx" ON "ventas"("organizationId", "contactoId");

-- CreateIndex
CREATE INDEX "ventas_organizationId_fechaContable_idx" ON "ventas"("organizationId", "fechaContable");

-- CreateIndex
CREATE INDEX "lineas_venta_organizationId_idx" ON "lineas_venta"("organizationId");

-- CreateIndex
CREATE INDEX "lineas_venta_ventaId_idx" ON "lineas_venta"("ventaId");

-- CreateIndex
CREATE INDEX "lineas_venta_organizationId_itemId_idx" ON "lineas_venta"("organizationId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "lineas_venta_ventaId_orden_key" ON "lineas_venta"("ventaId", "orden");

-- CreateIndex
CREATE INDEX "cobros_organizationId_idx" ON "cobros"("organizationId");

-- CreateIndex
CREATE INDEX "cobros_organizationId_contactoId_idx" ON "cobros"("organizationId", "contactoId");

-- CreateIndex
CREATE INDEX "cobros_organizationId_fechaContable_idx" ON "cobros"("organizationId", "fechaContable");

-- CreateIndex
CREATE INDEX "aplicaciones_cobro_organizationId_idx" ON "aplicaciones_cobro"("organizationId");

-- CreateIndex
CREATE INDEX "aplicaciones_cobro_cobroId_idx" ON "aplicaciones_cobro"("cobroId");

-- CreateIndex
CREATE INDEX "aplicaciones_cobro_ventaId_idx" ON "aplicaciones_cobro"("ventaId");

-- CreateIndex
CREATE INDEX "aplicaciones_cobro_desvinculadas_organizationId_idx" ON "aplicaciones_cobro_desvinculadas"("organizationId");

-- CreateIndex
CREATE INDEX "aplicaciones_cobro_desvinculadas_cobroId_idx" ON "aplicaciones_cobro_desvinculadas"("cobroId");

-- CreateIndex
CREATE INDEX "aplicaciones_cobro_desvinculadas_ventaId_idx" ON "aplicaciones_cobro_desvinculadas"("ventaId");

-- AddForeignKey
ALTER TABLE "org_configuracion_contable" ADD CONSTRAINT "org_configuracion_contable_cuentasPorCobrarId_fkey" FOREIGN KEY ("cuentasPorCobrarId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_configuracion_contable" ADD CONSTRAINT "org_configuracion_contable_ventasId_fkey" FOREIGN KEY ("ventasId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_cuentaIngresoId_fkey" FOREIGN KEY ("cuentaIngresoId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_contactoId_fkey" FOREIGN KEY ("contactoId") REFERENCES "contactos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_venta" ADD CONSTRAINT "lineas_venta_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_venta" ADD CONSTRAINT "lineas_venta_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_venta" ADD CONSTRAINT "lineas_venta_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_venta" ADD CONSTRAINT "lineas_venta_cuentaIngresoId_fkey" FOREIGN KEY ("cuentaIngresoId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_contactoId_fkey" FOREIGN KEY ("contactoId") REFERENCES "contactos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_cuentaDestinoId_fkey" FOREIGN KEY ("cuentaDestinoId") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_cobro" ADD CONSTRAINT "aplicaciones_cobro_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_cobro" ADD CONSTRAINT "aplicaciones_cobro_cobroId_fkey" FOREIGN KEY ("cobroId") REFERENCES "cobros"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_cobro" ADD CONSTRAINT "aplicaciones_cobro_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_cobro_desvinculadas" ADD CONSTRAINT "aplicaciones_cobro_desvinculadas_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_cobro_desvinculadas" ADD CONSTRAINT "aplicaciones_cobro_desvinculadas_cobroId_fkey" FOREIGN KEY ("cobroId") REFERENCES "cobros"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_cobro_desvinculadas" ADD CONSTRAINT "aplicaciones_cobro_desvinculadas_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- UNIQUE PARCIAL: la unicidad del codigo de item rige SOLO cuando el codigo
-- existe (D-24 — el codigo es opcional). Sin el `WHERE`, N items sin codigo
-- chocarian entre si por NULL... y peor: un UNIQUE comun sobre una columna
-- nullable en Postgres NO agrupa los NULL, asi que el constraint quedaria
-- mudo justo donde hace falta y estricto donde no.
--
-- Va como raw SQL porque Prisma no expresa indices parciales. SUMADO a la
-- tabla de objetos raw vivos de CLAUDE.md §11.6 — toda migration futura que
-- se regenere va a proponer dropearlo.
--
-- Precedente exacto: contactos_organizationId_documento_partial_key
-- (20260424020927_fase_1_4_contactos).
--
-- Enforcement SIMULTANEO con el guard de servicio ITEM_CODIGO_DUPLICADO
-- (Anti-23, cicatriz F-01): solo-servicio falla bajo concurrencia,
-- solo-constraint da un 500 criptico.
CREATE UNIQUE INDEX "items_organizationId_codigo_partial_key"
  ON "items" ("organizationId", "codigo")
  WHERE "codigo" IS NOT NULL;
