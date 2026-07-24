import { PerfilExtracto } from '@prisma/client';

import type {
  DescriptorPerfilExtracto,
  ExtractoParseado,
  ExtractoParserPort,
} from './extracto-parser.port';
import { ExtractoParserRegistry } from './extracto-parser.registry';

/**
 * Fake mínimo del puerto — implementa la interfaz sin lógica real de parsing.
 * Los adapters reales (BancoSol/Económico/Unión) llegan en slices 3-4; acá
 * solo interesa el `descriptor.perfil` para ejercitar el registry.
 */
function fakeParser(perfil: PerfilExtracto): ExtractoParserPort {
  const descriptor: DescriptorPerfilExtracto = {
    perfil,
    banco: `Banco ${perfil}`,
    formato: 'Excel (.xlsx)',
    extensiones: ['.xlsx'],
    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    estrategiaChecksum: 'DECLARADO',
    soportaContraparte: false,
    soportaHora: false,
    exponeNumeroCuenta: true,
    instruccionesDescarga: 'Descargá el extracto en formato Excel.',
  };
  return {
    get descriptor() {
      return descriptor;
    },
    reconoce: () => Promise.resolve(false),
    parse: () =>
      Promise.resolve({
        movimientos: [],
        cobertura: {
          desde: undefined as unknown as ExtractoParseado['cobertura']['desde'],
          hasta: undefined as unknown as ExtractoParseado['cobertura']['hasta'],
          declarada: false,
        },
        saldoInicialDeclarado: null,
        saldoFinalDeclarado: null,
        monedaDeclarada: null,
        numeroCuentaDeclarado: null,
      } satisfies ExtractoParseado),
  };
}

const TODOS_LOS_PERFILES = Object.values(PerfilExtracto);

describe('ExtractoParserRegistry (fail-fast en bootstrap, design §4.5)', () => {
  it('construye correctamente cuando hay un adapter por cada valor del enum PerfilExtracto', () => {
    const parsers = TODOS_LOS_PERFILES.map((p) => fakeParser(p));

    const registry = new ExtractoParserRegistry(parsers);

    expect(registry.descriptores()).toHaveLength(TODOS_LOS_PERFILES.length);
  });

  it('para(perfil) devuelve el adapter correcto', () => {
    const parsers = TODOS_LOS_PERFILES.map((p) => fakeParser(p));
    const registry = new ExtractoParserRegistry(parsers);

    const primero = TODOS_LOS_PERFILES[0];
    if (primero === undefined) throw new Error('PerfilExtracto sin valores');

    expect(registry.para(primero).descriptor.perfil).toBe(primero);
  });

  it('falla al construir si dos adapters registran el mismo perfil (perfil duplicado)', () => {
    const [primero, segundo] = TODOS_LOS_PERFILES;
    if (primero === undefined || segundo === undefined) {
      throw new Error('Se necesitan al menos 2 valores en PerfilExtracto para este test');
    }
    const parsers = [fakeParser(primero), fakeParser(primero), fakeParser(segundo)];

    expect(() => new ExtractoParserRegistry(parsers)).toThrow(/duplicado/i);
  });

  it('falla al construir si falta un adapter para algún valor del enum (cobertura incompleta)', () => {
    // Deja fuera el último valor del enum a propósito.
    const parsers = TODOS_LOS_PERFILES.slice(0, -1).map((p) => fakeParser(p));

    expect(() => new ExtractoParserRegistry(parsers)).toThrow(/falta/i);
  });
});
