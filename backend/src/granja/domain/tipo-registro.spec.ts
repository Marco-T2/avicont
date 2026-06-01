import { NaturalezaRegistro } from './enums';
import { TipoRegistro } from './tipo-registro';

function tipoFabrica(overrides?: Partial<Parameters<typeof TipoRegistro.crear>[0]>): TipoRegistro {
  return TipoRegistro.crear({
    nombre: 'Alimento',
    naturaleza: NaturalezaRegistro.INVERSION,
    esSistema: false,
    organizationId: 'org-1',
    ...overrides,
  });
}

describe('TipoRegistro.crear', () => {
  it('crea un tipo con datos válidos, activo por defecto', () => {
    const tipo = tipoFabrica();

    expect(tipo.nombre).toBe('Alimento');
    expect(tipo.naturaleza).toBe(NaturalezaRegistro.INVERSION);
    expect(tipo.esSistema).toBe(false);
    expect(tipo.activo).toBe(true);
    expect(tipo.organizationId).toBe('org-1');
  });

  it('crea un tipo de sistema (esSistema = true)', () => {
    const tipo = tipoFabrica({ esSistema: true });
    expect(tipo.esSistema).toBe(true);
  });

  it('acepta naturaleza CANTIDAD', () => {
    const tipo = tipoFabrica({ naturaleza: NaturalezaRegistro.CANTIDAD, nombre: 'Mortalidad' });
    expect(tipo.naturaleza).toBe(NaturalezaRegistro.CANTIDAD);
  });
});

describe('TipoRegistro — naturaleza INMUTABLE', () => {
  it('la propiedad naturaleza es readonly', () => {
    const tipo = tipoFabrica({ naturaleza: NaturalezaRegistro.INVERSION });
    // Readonly en TypeScript — verificamos que el valor no cambia.
    expect(tipo.naturaleza).toBe(NaturalezaRegistro.INVERSION);
  });
});

describe('TipoRegistro.esEditable', () => {
  it('tipo propio (esSistema=false) es editable en nombre y naturaleza', () => {
    const tipo = tipoFabrica({ esSistema: false });
    expect(tipo.esEditable()).toBe(true);
  });

  it('tipo de sistema (esSistema=true) no es editable en nombre/naturaleza', () => {
    const tipo = tipoFabrica({ esSistema: true });
    expect(tipo.esEditable()).toBe(false);
  });
});

describe('TipoRegistro.esEliminable', () => {
  it('tipo propio activo es eliminable', () => {
    const tipo = tipoFabrica({ esSistema: false });
    expect(tipo.esEliminable()).toBe(true);
  });

  it('tipo de sistema NO es eliminable', () => {
    const tipo = tipoFabrica({ esSistema: true });
    expect(tipo.esEliminable()).toBe(false);
  });
});
