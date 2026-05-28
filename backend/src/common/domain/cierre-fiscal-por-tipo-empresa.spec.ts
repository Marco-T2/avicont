import {
  calcularMesCierre,
  calcularMesInicio,
  CIERRE_FISCAL_POR_TIPO,
} from './cierre-fiscal-por-tipo-empresa';
import { TipoEmpresa } from './enums';

describe('CIERRE_FISCAL_POR_TIPO (Ley 843 Art. 46)', () => {
  it.each([
    [TipoEmpresa.COMERCIAL, 1, 12],
    [TipoEmpresa.SERVICIOS, 1, 12],
    [TipoEmpresa.TRANSPORTE, 1, 12],
    [TipoEmpresa.INDUSTRIAL, 4, 3],
    [TipoEmpresa.CONSTRUCCION, 4, 3],
    [TipoEmpresa.PETROLERA, 4, 3],
    [TipoEmpresa.AGROPECUARIA, 7, 6],
    [TipoEmpresa.MINERA, 10, 9],
  ] as const)('%s → mesInicio=%i, mesCierre=%i', (tipo, mesInicio, mesCierre) => {
    expect(CIERRE_FISCAL_POR_TIPO[tipo]).toEqual({
      mesInicio,
      mesCierre,
    });
  });

  it('calcularMesInicio() devuelve el mes correcto', () => {
    expect(calcularMesInicio(TipoEmpresa.COMERCIAL)).toBe(1);
    expect(calcularMesInicio(TipoEmpresa.INDUSTRIAL)).toBe(4);
    expect(calcularMesInicio(TipoEmpresa.AGROPECUARIA)).toBe(7);
    expect(calcularMesInicio(TipoEmpresa.MINERA)).toBe(10);
  });

  it('calcularMesCierre() devuelve el mes correcto', () => {
    expect(calcularMesCierre(TipoEmpresa.COMERCIAL)).toBe(12);
    expect(calcularMesCierre(TipoEmpresa.INDUSTRIAL)).toBe(3);
    expect(calcularMesCierre(TipoEmpresa.AGROPECUARIA)).toBe(6);
    expect(calcularMesCierre(TipoEmpresa.MINERA)).toBe(9);
  });

  it('cubre todos los valores del enum TipoEmpresa', () => {
    const tiposEnum: TipoEmpresa[] = [
      TipoEmpresa.COMERCIAL,
      TipoEmpresa.SERVICIOS,
      TipoEmpresa.TRANSPORTE,
      TipoEmpresa.INDUSTRIAL,
      TipoEmpresa.PETROLERA,
      TipoEmpresa.CONSTRUCCION,
      TipoEmpresa.AGROPECUARIA,
      TipoEmpresa.MINERA,
    ];
    for (const t of tiposEnum) {
      expect(CIERRE_FISCAL_POR_TIPO[t]).toBeDefined();
    }
  });
});
