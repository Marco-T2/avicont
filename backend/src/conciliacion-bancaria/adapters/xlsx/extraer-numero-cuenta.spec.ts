import { extraerNumeroCuenta } from './extraer-numero-cuenta';
import type { MatrizXlsx } from './leer-matriz-xlsx';

describe('extraerNumeroCuenta (design §4.3, REQ-CB-16, CRITICAL-2)', () => {
  it('BancoSol: valor limpio, sin prefijo/sufijo que stripear', () => {
    const matriz: MatrizXlsx = [
      [],
      [],
      [],
      ['Titular:', null, 'X', null, 'Cuenta:', null, '5799375-760-305'],
    ];

    expect(extraerNumeroCuenta(matriz, { etiqueta: 'Cuenta:' }, 10)).toBe('5799375-760-305');
  });

  it('Económico — CRITICAL-2: strippea prefijo "CA:" y sufijo "(Bs)" del valor contaminado', () => {
    const matriz: MatrizXlsx = [
      [],
      [],
      [],
      ['Titular:', null, 'X', null, 'Cuenta:', null, 'CA: 6484254835 (Bs)'],
    ];

    const resultado = extraerNumeroCuenta(
      matriz,
      { etiqueta: 'Cuenta:', prefijoProducto: 'CA:', sufijoMoneda: '(Bs)' },
      10,
    );

    expect(resultado).toBe('6484254835');
  });

  it('prefijo esperado ausente -> error de formato, NUNCA strip silencioso', () => {
    const matriz: MatrizXlsx = [
      [],
      [],
      [],
      ['Titular:', null, 'X', null, 'Cuenta:', null, '6484254835 (Bs)'], // sin 'CA:'
    ];

    expect(() =>
      extraerNumeroCuenta(matriz, { etiqueta: 'Cuenta:', prefijoProducto: 'CA:' }, 10),
    ).toThrow(/CA:/);
  });

  it('sufijo esperado ausente -> error de formato', () => {
    const matriz: MatrizXlsx = [
      [],
      [],
      [],
      ['Titular:', null, 'X', null, 'Cuenta:', null, 'CA: 6484254835'], // sin '(Bs)'
    ];

    expect(() =>
      extraerNumeroCuenta(matriz, { etiqueta: 'Cuenta:', sufijoMoneda: '(Bs)' }, 10),
    ).toThrow(/\(Bs\)/);
  });

  it('etiqueta ausente en el bloque de cabecera -> null (perfil no expone / archivo dañado)', () => {
    const matriz: MatrizXlsx = [['Titular:', 'X']];
    expect(extraerNumeroCuenta(matriz, { etiqueta: 'Cuenta:' }, 10)).toBeNull();
  });
});
