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
    // Verifica orden: razonSocial (negrita, sin etiqueta), luego campos con etiqueta
    expect(filas[0]?.[0]).toMatchObject({ type: 'texto', value: 'Avicont S.R.L.' });
    expect(filas[1]?.[0]).toMatchObject({ type: 'texto', value: 'NIT: 1234567' });
    expect(filas[2]?.[0]).toMatchObject({ type: 'texto', value: 'Dirección: Av. Siempre Viva 123, Santa Cruz' });
    expect(filas[3]?.[0]).toMatchObject({ type: 'texto', value: 'Representante Legal: Juan Pérez' });
    expect(filas[4]?.[0]).toMatchObject({ type: 'texto', value: 'Teléfono: +591 70000000' });
    expect(filas[5]?.[0]).toMatchObject({ type: 'texto', value: 'Email: admin@avicont.bo' });
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
    expect(filas[0]?.[0]).toMatchObject({ type: 'texto', value: 'Avicont' });
    expect(filas[1]?.[0]).toMatchObject({ type: 'texto', value: 'NIT: 1234567' });
  });

  it('nunca escribe la cadena literal "null" en ninguna celda', () => {
    const filas = armarCabeceraFiscal(perfilTodoNull);
    const todasLasCeldas = filas.flatMap((fila) => fila.map((celda) => celda.value));
    expect(todasLasCeldas.some((v) => v === 'null')).toBe(false);
  });

  it('(estilo-a) razón social → fila con fontWeight:"bold" y value === razonSocial SIN etiqueta', () => {
    const filas = armarCabeceraFiscal(perfilCompleto);
    const primeraFila = filas[0]?.[0];
    expect(primeraFila).toBeDefined();
    expect(primeraFila!.fontWeight).toBe('bold');
    expect(primeraFila!.value).toBe('Avicont S.R.L.');
  });

  it('(estilo-b) nit presente → value === "NIT: <valor>" SIN fontWeight', () => {
    const filas = armarCabeceraFiscal(perfilCompleto);
    const filaNit = filas[1]?.[0];
    expect(filaNit).toBeDefined();
    expect(filaNit!.value).toBe('NIT: 1234567');
    expect(filaNit!.fontWeight).toBeUndefined();
  });

  it('(estilo-c) campo null (direccion) → no genera fila, nunca "Dirección: null"', () => {
    const perfil: EmpresaPerfil = {
      razonSocial: 'Empresa',
      nit: '123456',
      direccion: null,
      representanteLegal: null,
      telefono: null,
      email: null,
    };
    const filas = armarCabeceraFiscal(perfil);
    const valores = filas.flatMap((f) => f.map((c) => c.value));
    expect(valores.some((v) => v.includes('null'))).toBe(false);
    expect(valores.some((v) => v.includes('Dirección'))).toBe(false);
  });

  it('(estilo-d) todos null salvo email → 1 fila con "Email: ..." SIN fontWeight (negrita solo en razonSocial)', () => {
    const perfil: EmpresaPerfil = {
      razonSocial: null,
      nit: null,
      direccion: null,
      representanteLegal: null,
      telefono: null,
      email: 'solo@email.bo',
    };
    const filas = armarCabeceraFiscal(perfil);
    expect(filas).toHaveLength(1);
    const celda = filas[0]?.[0];
    expect(celda!.value).toBe('Email: solo@email.bo');
    expect(celda!.fontWeight).toBeUndefined();
  });

  it('(estilo-e) orden preservado: razonSocial, NIT, Dirección, Representante Legal, Teléfono, Email', () => {
    const filas = armarCabeceraFiscal(perfilCompleto);
    const valores = filas.map((f) => f[0]?.value ?? '');
    expect(valores[0]).toBe('Avicont S.R.L.');
    expect(valores[1]).toContain('NIT');
    expect(valores[2]).toContain('Dirección');
    expect(valores[3]).toContain('Representante Legal');
    expect(valores[4]).toContain('Teléfono');
    expect(valores[5]).toContain('Email');
  });

  it('(W1) razonSocial null pero nit presente → fila del NIT sin fontWeight (negrita solo en razonSocial)', () => {
    const perfil: EmpresaPerfil = {
      razonSocial: null,
      nit: '9876543',
      direccion: null,
      representanteLegal: null,
      telefono: null,
      email: null,
    };
    const filas = armarCabeceraFiscal(perfil);
    // Solo hay 1 fila (el NIT); razonSocial null → no genera fila
    expect(filas).toHaveLength(1);
    const celdaNit = filas[0]?.[0];
    expect(celdaNit).toBeDefined();
    expect(celdaNit!.value).toBe('NIT: 9876543');
    // La negrita es exclusiva de razonSocial; si falta, ninguna fila lleva fontWeight
    expect(celdaNit!.fontWeight).toBeUndefined();
    expect('fontWeight' in celdaNit!).toBe(false);
  });
});
