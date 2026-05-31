import { describe, expect, it } from 'vitest';

import { matchesPermission } from './permission-matcher';

describe('matchesPermission', () => {
  it('el wildcard total * cubre cualquier permiso', () => {
    expect(matchesPermission('*', 'contabilidad.eeff.read')).toBe(true);
    expect(matchesPermission('*', 'organizacion.configuracion.read')).toBe(true);
    expect(matchesPermission('*', 'contabilidad.libro-diario.read')).toBe(true);
  });

  it('el wildcard de submódulo cubre cualquier acción del submódulo', () => {
    expect(matchesPermission('contabilidad.eeff.*', 'contabilidad.eeff.read')).toBe(true);
    expect(matchesPermission('contabilidad.eeff.*', 'contabilidad.eeff.export')).toBe(true);
    expect(matchesPermission('contabilidad.eeff.*', 'contabilidad.asientos.read')).toBe(false);
  });

  it('el permiso exacto solo cubre ese permiso', () => {
    expect(matchesPermission('contabilidad.eeff.read', 'contabilidad.eeff.read')).toBe(true);
    expect(matchesPermission('contabilidad.eeff.read', 'contabilidad.eeff.export')).toBe(false);
  });

  it('no cubre permisos de otro módulo', () => {
    expect(matchesPermission('granja.lotes.*', 'contabilidad.eeff.read')).toBe(false);
  });

  it('segmentos de longitud diferente no coinciden', () => {
    // contabilidad.* tiene 2 segmentos, contabilidad.eeff.read tiene 3 → false (backend behavior)
    expect(matchesPermission('contabilidad.*', 'contabilidad.eeff.read')).toBe(false);
  });

  it('wildcard en el medio del segmento correcto funciona', () => {
    // contabilidad.*.read: permiso en cualquier submódulo de contabilidad
    expect(matchesPermission('contabilidad.*.read', 'contabilidad.eeff.read')).toBe(true);
    expect(matchesPermission('contabilidad.*.read', 'contabilidad.libro-diario.read')).toBe(true);
    expect(matchesPermission('contabilidad.*.read', 'contabilidad.eeff.create')).toBe(false);
  });
});
