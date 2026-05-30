import { parseDbQuery } from './prisma.service';

/**
 * parseDbQuery extrae operación y tabla del SQL crudo que emite Prisma vía el
 * evento 'query', para etiquetar la métrica db_query_duration_seconds sin alta
 * cardinalidad. El parseo es heurístico: ante SQL desconocido devuelve 'unknown'.
 */
describe('parseDbQuery', () => {
  it('extrae operación y tabla de un SELECT con esquema public', () => {
    const sql =
      'SELECT "public"."User"."id", "public"."User"."email" FROM "public"."User" WHERE "id" = $1';
    expect(parseDbQuery(sql)).toEqual({ operation: 'select', table: 'User' });
  });

  it('extrae tabla de un INSERT INTO', () => {
    const sql = 'INSERT INTO "public"."RefreshToken" ("id","hash") VALUES ($1,$2)';
    expect(parseDbQuery(sql)).toEqual({ operation: 'insert', table: 'RefreshToken' });
  });

  it('extrae tabla de un UPDATE', () => {
    const sql = 'UPDATE "public"."comprobantes" SET "glosa" = $1 WHERE "id" = $2';
    expect(parseDbQuery(sql)).toEqual({ operation: 'update', table: 'comprobantes' });
  });

  it('extrae tabla de un DELETE FROM', () => {
    const sql = 'DELETE FROM "public"."lineas_comprobante" WHERE "comprobanteId" = $1';
    expect(parseDbQuery(sql)).toEqual({ operation: 'delete', table: 'lineas_comprobante' });
  });

  it('devuelve table unknown para SQL sin tabla identificable', () => {
    expect(parseDbQuery('SELECT 1')).toEqual({ operation: 'select', table: 'unknown' });
  });

  it('maneja sentencias de transacción sin tabla', () => {
    expect(parseDbQuery('BEGIN')).toEqual({ operation: 'begin', table: 'unknown' });
  });

  it('devuelve unknown/unknown para input vacío', () => {
    expect(parseDbQuery('')).toEqual({ operation: 'unknown', table: 'unknown' });
  });
});
