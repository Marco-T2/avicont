import { parsearPuct } from '../parser';

describe('parsearPuct', () => {
  let records: ReturnType<typeof parsearPuct>;

  beforeAll(() => {
    records = parsearPuct();
  });

  it('debe extraer exactamente 538 registros (niveles 1-4)', () => {
    expect(records.length).toBe(538);
  });

  it('debe respetar la distribución por nivel del PUCT oficial', () => {
    const porNivel = records.reduce<Record<number, number>>(
      (acc, r) => ({ ...acc, [r.nivel]: (acc[r.nivel] ?? 0) + 1 }),
      {},
    );
    expect(porNivel).toEqual({ 1: 5, 2: 15, 3: 54, 4: 464 });
  });

  it('debe tener las 5 clases en nivel 1', () => {
    const clases = records
      .filter((r) => r.nivel === 1)
      .map((r) => r.claseCuenta)
      .sort();
    expect(clases).toEqual(['ACTIVO', 'EGRESO', 'INGRESO', 'PASIVO', 'PATRIMONIO']);
  });

  it('debe construir códigos jerárquicos válidos', () => {
    const caja = records.find((r) => r.nombre === 'CAJA');
    expect(caja).toBeDefined();
    expect(caja!.codigo).toMatch(/^1\.1\.1\.\d{3}$/);
    expect(caja!.nivel).toBe(4);
    expect(caja!.claseCuenta).toBe('ACTIVO');
  });

  it('debe asignar padre correctamente (jerarquía)', () => {
    const subgrupo = records.find((r) => r.nivel === 3);
    expect(subgrupo).toBeDefined();
    const padre = records.find((r) => r.codigo === subgrupo!.padre);
    expect(padre).toBeDefined();
    expect(padre!.nivel).toBe(2);
  });

  it('todas las cuentas no-raíz deben tener padre que existe en el conjunto', () => {
    const codigosSet = new Set(records.map((r) => r.codigo));
    for (const r of records) {
      if (r.nivel > 1) {
        expect(r.padre).not.toBeNull();
        expect(codigosSet.has(r.padre!)).toBe(true);
      }
    }
  });

  it('debe ignorar plantillas con nombre "XXX"', () => {
    const xxx = records.filter((r) => r.nombre === 'XXX');
    expect(xxx.length).toBe(0);
  });

  it('todas deben tener versionPuct seteada', () => {
    for (const r of records) {
      expect(r.versionPuct).toBeTruthy();
    }
  });

  it('debe asignar tipos de empresa a cuentas operativas', () => {
    // CAJA aplica a TODOS los tipos de empresa.
    const caja = records.find((r) => r.nombre === 'CAJA');
    expect(caja!.tiposEmpresa).toEqual(
      expect.arrayContaining([
        'COMERCIAL',
        'SERVICIOS',
        'TRANSPORTE',
        'INDUSTRIAL',
        'PETROLERA',
        'CONSTRUCCION',
        'AGROPECUARIA',
        'MINERA',
      ]),
    );
  });
});
