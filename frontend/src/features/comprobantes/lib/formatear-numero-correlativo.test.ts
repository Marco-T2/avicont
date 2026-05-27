import { describe, expect, it } from 'vitest';

import { formatearNumeroCorrelativo, prefijoDe, secuenciaDe } from './formatear-numero-correlativo';

describe('formatearNumeroCorrelativo', () => {
  it('retorna el número tal cual para un string completo', () => {
    expect(formatearNumeroCorrelativo('D2604-000042')).toBe('D2604-000042');
  });

  it('retorna "—" para null', () => {
    expect(formatearNumeroCorrelativo(null)).toBe('—');
  });

  it('retorna "—" para undefined', () => {
    expect(formatearNumeroCorrelativo(undefined)).toBe('—');
  });

  it('retorna "—" para string vacío', () => {
    expect(formatearNumeroCorrelativo('')).toBe('—');
  });

  it('maneja formato con prefijo largo', () => {
    expect(formatearNumeroCorrelativo('APERTURA2604-000001')).toBe('APERTURA2604-000001');
  });
});

describe('prefijoDe', () => {
  it('extrae la parte antes del guión', () => {
    expect(prefijoDe('D2604-000042')).toBe('D2604');
  });

  it('retorna string completo si no tiene guión', () => {
    expect(prefijoDe('D2604000042')).toBe('D2604000042');
  });

  it('retorna null para null', () => {
    expect(prefijoDe(null)).toBeNull();
  });
});

describe('secuenciaDe', () => {
  it('extrae la parte después del guión', () => {
    expect(secuenciaDe('D2604-000042')).toBe('000042');
  });

  it('retorna null si no tiene guión', () => {
    expect(secuenciaDe('D2604000042')).toBeNull();
  });

  it('retorna null para null', () => {
    expect(secuenciaDe(null)).toBeNull();
  });
});
