import { NumeroCuentaBancaria } from './numero-cuenta-bancaria';

describe('NumeroCuentaBancaria — test adversarial (design §4.4, REQ-CB-16)', () => {
  // Las 3 cuentas reales del usuario en BancoSol difieren SOLO en el dígito
  // final. Si el VO comparara por prefijo o substring, las tres darían
  // "iguales" entre sí — validación inservible y PEOR que no tenerla.
  const cuenta1 = NumeroCuentaBancaria.of('1191959-000-001');
  const cuenta2 = NumeroCuentaBancaria.of('1191959-000-002');
  const cuenta3 = NumeroCuentaBancaria.of('1191959-000-003');

  it.each([
    ['cuenta1', 'cuenta2'],
    ['cuenta1', 'cuenta3'],
    ['cuenta2', 'cuenta1'],
    ['cuenta2', 'cuenta3'],
    ['cuenta3', 'cuenta1'],
    ['cuenta3', 'cuenta2'],
  ])('%s.equals(%s) → false (6 pares cruzados)', (aName, bName) => {
    const mapa = { cuenta1, cuenta2, cuenta3 };
    const a = mapa[aName as keyof typeof mapa];
    const b = mapa[bName as keyof typeof mapa];
    expect(a.equals(b)).toBe(false);
  });

  it('cada cuenta es igual a sí misma (mismo string)', () => {
    expect(cuenta1.equals(NumeroCuentaBancaria.of('1191959-000-001'))).toBe(true);
    expect(cuenta2.equals(NumeroCuentaBancaria.of('1191959-000-002'))).toBe(true);
    expect(cuenta3.equals(NumeroCuentaBancaria.of('1191959-000-003'))).toBe(true);
  });

  describe('normalización — equivalencias', () => {
    it('guiones vs sin separadores', () => {
      expect(
        NumeroCuentaBancaria.of('1191959-000-001').equals(NumeroCuentaBancaria.of('1191959000001')),
      ).toBe(true);
    });

    it('espacios comunes', () => {
      expect(
        NumeroCuentaBancaria.of('1191959 000 001').equals(
          NumeroCuentaBancaria.of('1191959-000-001'),
        ),
      ).toBe(true);
    });

    it('NBSP (U+00A0) tratado como separador', () => {
      expect(
        NumeroCuentaBancaria.of('1191959 000 001').equals(
          NumeroCuentaBancaria.of('1191959-000-001'),
        ),
      ).toBe(true);
    });

    it('puntos como separador de miles', () => {
      expect(
        NumeroCuentaBancaria.of('1.191.959.000.001').equals(
          NumeroCuentaBancaria.of('1191959000001'),
        ),
      ).toBe(true);
    });

    it('mayúsculas/minúsculas no afectan (uppercase interno)', () => {
      expect(NumeroCuentaBancaria.of('ab-001').equals(NumeroCuentaBancaria.of('AB-001'))).toBe(
        true,
      );
    });

    it('pero un dígito distinto SIGUE dando false tras normalizar', () => {
      expect(
        NumeroCuentaBancaria.of('1191959.000.001').equals(
          NumeroCuentaBancaria.of('1191959-000-002'),
        ),
      ).toBe(false);
    });
  });

  describe('superficie de tipo — sin getter del normalizado', () => {
    it('toString() devuelve el ORIGINAL, no el normalizado', () => {
      expect(NumeroCuentaBancaria.of('1191959-000-001').toString()).toBe('1191959-000-001');
    });

    it('equals() es el único método de comparación disponible en runtime', () => {
      const vo = NumeroCuentaBancaria.of('1191959-000-001');
      const propios = Object.getOwnPropertyNames(Object.getPrototypeOf(vo)).filter(
        (n) => n !== 'constructor',
      );
      expect(propios.sort()).toEqual(['equals', 'toString'].sort());
    });

    it('un startsWith externo no debe compilar contra el tipo (chequeo estático)', () => {
      const vo = NumeroCuentaBancaria.of('1191959-000-001');
      // @ts-expect-error — el VO no expone el string normalizado; esta línea
      // NO debe tipar. Si algún día se agrega un getter, tsc fallará acá
      // porque @ts-expect-error exige un error real debajo.
      vo.normalizado.startsWith('1191959');
    });
  });

  describe('validación de entrada', () => {
    it('rechaza string vacío', () => {
      expect(() => NumeroCuentaBancaria.of('')).toThrow();
    });

    it('rechaza string que queda vacío tras normalizar (solo separadores)', () => {
      expect(() => NumeroCuentaBancaria.of('---   ...')).toThrow();
    });
  });
});
