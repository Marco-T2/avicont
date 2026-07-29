-- Backfill DATA-ONLY: habilita el tipo de comprobante VENTA en los tipos de
-- documento fisico que hoy admiten INGRESO.
--
-- Por que hace falta: `tiposComprobanteAplicables` es una lista EXPLICITA sin
-- wildcard (lista vacia = ningun tipo aplica). El seed universal ya siembra
-- VENTA para las organizaciones NUEVAS (src/tipos-documento-fisico/seed/
-- tipos-universales.ts), pero las que ya existen tienen la lista congelada:
-- sin este backfill, una factura emitida no podria asociarse a la venta que
-- la origina.
--
-- Los 4 tipos alcanzados —los mismos que enumera el seed— son
-- factura-emitida, nota-debito-emitida, recibo-ingreso y comprobante-interno.
-- No se los nombra por codigo a proposito: el catalogo es EDITABLE per-tenant,
-- asi que el criterio correcto es "los que hoy admiten INGRESO", no una lista
-- de codigos que el usuario pudo haber tocado.
--
-- IDEMPOTENTE: el `NOT ... = ANY(...)` hace que re-correrla sea un no-op.
--
-- Va SEPARADA de la migration de tablas porque toca datos, no estructura, y
-- separada de la del enum porque Postgres no permite usar un valor de enum
-- recien agregado en la transaccion que lo agrega (55P04).
--
-- El valor se APENDEA al final de la lista, mientras que el seed lo ubica
-- junto a INGRESO. La diferencia es cosmetica: el orden de esta lista no
-- tiene semantica — el servicio solo pregunta por pertenencia.
UPDATE "tipos_documento_fisico"
SET "tiposComprobanteAplicables" =
      "tiposComprobanteAplicables" || 'VENTA'::"TipoComprobante"
WHERE 'INGRESO' = ANY ("tiposComprobanteAplicables")
  AND NOT ('VENTA' = ANY ("tiposComprobanteAplicables"));
