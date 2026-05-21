-- Backfill de tipos de documento físico para organizaciones existentes (riesgo C-2).
--
-- Las organizaciones creadas ANTES de este slice no tienen los 8 tipos
-- universales: a partir de ahora `TenantsService.create` los siembra dentro
-- de la TX de creación (design §D3, §7.2), pero las orgs preexistentes quedaron
-- sin catálogo. Esta migración data-only los siembra solo para las orgs con
-- contabilidad habilitada (los tipos son una feature del módulo contabilidad;
-- mismo criterio que el seed runtime, que corre dentro del case CONTABILIDAD).
--
-- Es un SNAPSHOT point-in-time de `TIPOS_UNIVERSALES` (8 filas, design §D3). Si
-- esa lista cambia en el futuro, esta migración NO se re-edita — otra migración
-- lo maneja. Idempotente vía `ON CONFLICT ("organizationId", codigo) DO NOTHING`
-- contra el UNIQUE `tipos_documento_fisico_organizationId_codigo_key`: re-correr
-- no duplica ni pisa los tipos que la org ya tenga (incluso si fueron editados).
--
-- NOTA §11.6: esta migración fue escrita a mano (data-only, sin diff de schema).
-- Prisma había generado `DROP INDEX` de los índices GIN trigram de `contactos`
-- (`contactos_razonSocial_trgm_idx`, `contactos_nombreComercial_trgm_idx`) por
-- drift de objetos raw SQL legítimos (origen 20260424020927_fase_1_4_contactos);
-- esos DROP se eliminaron según el protocolo de CLAUDE.md §11.6 / deuda A8.

INSERT INTO "tipos_documento_fisico" (
  "id",
  "organizationId",
  "nombre",
  "codigo",
  "esTributario",
  "activo",
  "tiposComprobanteAplicables",
  "createdAt",
  "updatedAt",
  "createdByUserId"
)
SELECT
  gen_random_uuid()::text,
  o."id",
  t."nombre",
  t."codigo",
  t."esTributario",
  true,
  t."tiposComprobanteAplicables",
  now(),
  now(),
  NULL
FROM "organizations" o
CROSS JOIN (
  VALUES
    ('factura-emitida',      'Factura emitida',            true,  ARRAY['INGRESO','DIARIO']::"TipoComprobante"[]),
    ('factura-recibida',     'Factura recibida',           true,  ARRAY['EGRESO','DIARIO']::"TipoComprobante"[]),
    ('nota-credito-emitida', 'Nota de crédito (emitida)',  true,  ARRAY['EGRESO','AJUSTE','DIARIO']::"TipoComprobante"[]),
    ('nota-debito-emitida',  'Nota de débito (emitida)',   true,  ARRAY['INGRESO','AJUSTE','DIARIO']::"TipoComprobante"[]),
    ('recibo-ingreso',       'Recibo de ingreso',          false, ARRAY['INGRESO','DIARIO']::"TipoComprobante"[]),
    ('recibo-egreso',        'Recibo de egreso',           false, ARRAY['EGRESO','DIARIO']::"TipoComprobante"[]),
    ('comprobante-interno',  'Comprobante interno',        false, ARRAY['APERTURA','DIARIO','INGRESO','EGRESO','AJUSTE','TRASPASO','CIERRE']::"TipoComprobante"[]),
    ('vale-caja-chica',      'Vale de caja chica',         false, ARRAY['EGRESO','DIARIO']::"TipoComprobante"[])
) AS t ("codigo", "nombre", "esTributario", "tiposComprobanteAplicables")
WHERE o."contabilidadEnabled" = true
ON CONFLICT ("organizationId", "codigo") DO NOTHING;
