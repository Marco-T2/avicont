import { normalizarCodigo, normalizarOpcional } from './item-validator';

describe('normalizarCodigo', () => {
  // La normalización corre ANTES de persistir Y antes de comparar (B-15). Si
  // sólo corriera al persistir, el guard de unicidad compararía el string
  // crudo del cliente contra el normalizado de la BD y no encontraría el
  // duplicado — el 409 amigable no saldría nunca y el choque llegaría al
  // constraint como un 500.

  describe('ausencia de código (D-24: el código es opcional)', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['string vacío', ''],
      ['sólo espacios', '   '],
      ['sólo tabs y saltos', '\t\n  '],
    ])('%s → null', (_caso, input) => {
      expect(normalizarCodigo(input)).toBeNull();
    });

    // El null es lo que hace que el UNIQUE PARCIAL deje convivir N ítems sin
    // código: Postgres no agrupa NULLs. Devolver '' en su lugar los haría
    // chocar entre sí.
    it('nunca devuelve string vacío', () => {
      expect(normalizarCodigo('  ')).not.toBe('');
    });
  });

  describe('normalización a mayúsculas', () => {
    it('pasa a mayúsculas', () => {
      expect(normalizarCodigo('ab-9')).toBe('AB-9');
    });

    it('trimea y pasa a mayúsculas en una sola pasada', () => {
      expect(normalizarCodigo('  ab-9 ')).toBe('AB-9');
    });

    it('deja intacto lo que ya está normalizado', () => {
      expect(normalizarCodigo('P-01')).toBe('P-01');
    });

    // El escenario de la spec: "P-01" y "p-01 " tienen que colapsar al mismo
    // código. Es la divergencia deliberada contra `normalizarDocumento` de
    // contactos, que no toca el case porque un documento son dígitos.
    it('colapsa variantes de case y espacios al mismo valor', () => {
      expect(normalizarCodigo('p-01 ')).toBe(normalizarCodigo('P-01'));
    });

    it('no altera dígitos ni separadores', () => {
      expect(normalizarCodigo('1.2.3-a/b')).toBe('1.2.3-A/B');
    });
  });

  describe('no colapsa códigos que son genuinamente distintos', () => {
    // Guarda contra una implementación que "normalice de más" (ej. sacar
    // guiones o espacios internos): eso fusionaría ítems distintos y el
    // usuario no podría explicar por qué le rechazan un código.
    it('conserva los espacios internos', () => {
      expect(normalizarCodigo('POLLO ENTERO')).toBe('POLLO ENTERO');
      expect(normalizarCodigo('POLLOENTERO')).not.toBe(normalizarCodigo('POLLO ENTERO'));
    });

    it('conserva los guiones', () => {
      expect(normalizarCodigo('P-01')).not.toBe(normalizarCodigo('P01'));
    });
  });
});

describe('normalizarOpcional', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['string vacío', ''],
    ['sólo espacios', '  '],
  ])('%s → null', (_caso, input) => {
    expect(normalizarOpcional(input)).toBeNull();
  });

  it('trimea sin tocar el case', () => {
    // A diferencia del código, la unidad de medida es texto que el usuario
    // lee: "kg" no se muestra como "KG".
    expect(normalizarOpcional('  kg ')).toBe('kg');
  });
});
