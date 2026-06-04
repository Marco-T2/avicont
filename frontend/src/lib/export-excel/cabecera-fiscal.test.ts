import { describe, expect, it } from 'vitest';

import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';

import { armarCabeceraFiscal } from './cabecera-fiscal';

const perfilCompleto: EmpresaPerfil = {
  razonSocial: 'Avicont S.R.L.',
  nit: '1234567',
  direccion: 'Av. Siempre Viva 123, Santa Cruz',
  representanteLegal: 'Juan Pérez',
  telefono: '+591 70000000',
  email: 'admin@avicont.bo',
};

const perfilTodoNull: EmpresaPerfil = {
  razonSocial: null,
  nit: null,
  direccion: null,
  representanteLegal: null,
  telefono: null,
  email: null,
};

describe('armarCabeceraFiscal', () => {
  it('incluye una fila por cada campo presente (6/6)', () => {
    const filas = armarCabeceraFiscal(perfilCompleto);
    expect(filas).toHaveLength(6);
    // Verifica orden: razonSocial, nit, direccion, representanteLegal, telefono, email
    expect(filas[0]?.[0]).toEqual({ type: 'texto', value: 'Avicont S.R.L.' });
    expect(filas[1]?.[0]).toEqual({ type: 'texto', value: '1234567' });
    expect(filas[2]?.[0]).toEqual({ type: 'texto', value: 'Av. Siempre Viva 123, Santa Cruz' });
    expect(filas[3]?.[0]).toEqual({ type: 'texto', value: 'Juan Pérez' });
    expect(filas[4]?.[0]).toEqual({ type: 'texto', value: '+591 70000000' });
    expect(filas[5]?.[0]).toEqual({ type: 'texto', value: 'admin@avicont.bo' });
  });

  it('devuelve array vacío cuando todos los campos son null', () => {
    const filas = armarCabeceraFiscal(perfilTodoNull);
    expect(filas).toHaveLength(0);
  });

  it('no lanza error cuando todos los campos son null', () => {
    expect(() => armarCabeceraFiscal(perfilTodoNull)).not.toThrow();
  });

  it('incluye solo las filas de campos presentes (mezcla razonSocial+nit, 4 en null)', () => {
    const perfil: EmpresaPerfil = {
      razonSocial: 'Avicont',
      nit: '1234567',
      direccion: null,
      representanteLegal: null,
      telefono: null,
      email: null,
    };
    const filas = armarCabeceraFiscal(perfil);
    expect(filas).toHaveLength(2);
    expect(filas[0]?.[0]).toEqual({ type: 'texto', value: 'Avicont' });
    expect(filas[1]?.[0]).toEqual({ type: 'texto', value: '1234567' });
  });

  it('nunca escribe la cadena literal "null" en ninguna celda', () => {
    const filas = armarCabeceraFiscal(perfilTodoNull);
    const todasLasCeldas = filas.flatMap((fila) => fila.map((celda) => celda.value));
    expect(todasLasCeldas.some((v) => v === 'null')).toBe(false);
  });
});
