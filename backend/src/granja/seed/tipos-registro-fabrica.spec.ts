import { NaturalezaRegistro } from '../domain/enums';
import { TIPOS_REGISTRO_FABRICA } from './tipos-registro-fabrica';

describe('TIPOS_REGISTRO_FABRICA', () => {
  it('contiene exactamente 12 elementos', () => {
    expect(TIPOS_REGISTRO_FABRICA).toHaveLength(12);
  });

  it('tiene exactamente 11 tipos con naturaleza INVERSION', () => {
    const inversiones = TIPOS_REGISTRO_FABRICA.filter(
      (t) => t.naturaleza === NaturalezaRegistro.INVERSION,
    );
    expect(inversiones).toHaveLength(11);
  });

  it('tiene exactamente 1 tipo con naturaleza CANTIDAD y nombre "Mortalidad"', () => {
    const cantidades = TIPOS_REGISTRO_FABRICA.filter(
      (t) => t.naturaleza === NaturalezaRegistro.CANTIDAD,
    );
    expect(cantidades).toHaveLength(1);
    expect(cantidades[0]?.nombre).toBe('Mortalidad');
  });

  it('todos tienen esSistema = true', () => {
    TIPOS_REGISTRO_FABRICA.forEach((t) => {
      expect(t.esSistema).toBe(true);
    });
  });

  it('no hay nombres duplicados en la lista', () => {
    const nombres = TIPOS_REGISTRO_FABRICA.map((t) => t.nombre);
    const unicos = new Set(nombres);
    expect(unicos.size).toBe(nombres.length);
  });

  it('contiene todos los nombres esperados', () => {
    const nombresEsperados = [
      'Compra de pollitos',
      'Alimento',
      'Alquiler Galpón',
      'Mantenimiento Galpón',
      'Vacunas',
      'Veterinario',
      'Mano de Obra',
      'Chala',
      'Garrafas',
      'Agua y Luz',
      'Otros gastos',
      'Mortalidad',
    ];
    const nombresReales = TIPOS_REGISTRO_FABRICA.map((t) => t.nombre);
    nombresEsperados.forEach((nombre) => {
      expect(nombresReales).toContain(nombre);
    });
  });
});
