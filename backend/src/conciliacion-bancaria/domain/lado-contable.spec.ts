import { ladoContableEsperado } from './lado-contable';

// design §5.1: la inversión de lado es la pieza más fácil de invertir por
// error de todo el módulo. El extracto habla desde la perspectiva del BANCO
// (LadoBancario); el libro contable habla desde la perspectiva de la EMPRESA
// (LadoContable) — son DOS enums distintos, no el mismo reusado.
describe('ladoContableEsperado (design §5.1)', () => {
  it('un CREDITO bancario (entra plata) espera DEBITO contable (cuenta de activo)', () => {
    expect(ladoContableEsperado('CREDITO')).toBe('DEBITO');
  });

  it('un DEBITO bancario (sale plata) espera CREDITO contable', () => {
    expect(ladoContableEsperado('DEBITO')).toBe('CREDITO');
  });

  it('CREDITO y DEBITO dan resultados distintos entre sí (no es una función constante)', () => {
    expect(ladoContableEsperado('CREDITO')).not.toBe(ladoContableEsperado('DEBITO'));
  });
});
