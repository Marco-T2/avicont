import { TipoEmpresa } from '@prisma/client';

import {
  calcularMesCierre,
  calcularMesInicio,
  CIERRE_FISCAL_POR_TIPO,
} from './cierre-fiscal-por-tipo-empresa';

describe('CIERRE_FISCAL_POR_TIPO (Ley 843 Art. 46)', () => {
  it.each([
    ['COMERCIAL', 1, 12],
    ['SERVICIOS', 1, 12],
    ['TRANSPORTE', 1, 12],
    ['INDUSTRIAL', 4, 3],
    ['CONSTRUCCION', 4, 3],
    ['PETROLERA', 4, 3],
    ['AGROPECUARIA', 7, 6],
    ['MINERA', 10, 9],
  ] as const)('%s → mesInicio=%i, mesCierre=%i', (tipo, mesInicio, mesCierre) => {
    expect(CIERRE_FISCAL_POR_TIPO[tipo as TipoEmpresa]).toEqual({
      mesInicio,
      mesCierre,
    });
  });

  it('calcularMesInicio() devuelve el mes correcto', () => {
    expect(calcularMesInicio('COMERCIAL')).toBe(1);
    expect(calcularMesInicio('INDUSTRIAL')).toBe(4);
    expect(calcularMesInicio('AGROPECUARIA')).toBe(7);
    expect(calcularMesInicio('MINERA')).toBe(10);
  });

  it('calcularMesCierre() devuelve el mes correcto', () => {
    expect(calcularMesCierre('COMERCIAL')).toBe(12);
    expect(calcularMesCierre('INDUSTRIAL')).toBe(3);
    expect(calcularMesCierre('AGROPECUARIA')).toBe(6);
    expect(calcularMesCierre('MINERA')).toBe(9);
  });

  it('cubre todos los valores del enum TipoEmpresa', () => {
    const tiposEnum: TipoEmpresa[] = [
      'COMERCIAL',
      'SERVICIOS',
      'TRANSPORTE',
      'INDUSTRIAL',
      'PETROLERA',
      'CONSTRUCCION',
      'AGROPECUARIA',
      'MINERA',
    ];
    for (const t of tiposEnum) {
      expect(CIERRE_FISCAL_POR_TIPO[t]).toBeDefined();
    }
  });
});
