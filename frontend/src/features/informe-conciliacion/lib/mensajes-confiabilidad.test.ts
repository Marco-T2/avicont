import { describe, expect, it } from 'vitest';

import type { MotivoNoConciliado } from '@/types/api';

import { mensajeMotivo } from './mensajes-confiabilidad';

describe('mensajeMotivo — cada motivo en lenguaje de contador, nunca el enum crudo', () => {
  it('SIN_ARRANQUE explica que falta el punto de partida', () => {
    const motivo: MotivoNoConciliado = { tipo: 'SIN_ARRANQUE' };
    expect(mensajeMotivo(motivo)).toBe(
      'No hay punto de arranque declarado: el informe no puede fijar desde dónde comparar ambos lados.',
    );
  });

  it('SIN_SALDO_EXTRACTO explica que el banco no publica saldo en el rango', () => {
    const motivo: MotivoNoConciliado = { tipo: 'SIN_SALDO_EXTRACTO' };
    expect(mensajeMotivo(motivo)).toBe(
      'Ningún movimiento del extracto hasta el corte publica saldo: falta el saldo bancario contra el cual conciliar.',
    );
  });

  it('DESCUADRE explica que una importación no reproduce el saldo declarado', () => {
    const motivo: MotivoNoConciliado = { tipo: 'DESCUADRE', importacionId: 'imp-1' };
    expect(mensajeMotivo(motivo)).toBe(
      'Una importación del rango tiene descuadre de verificación: sus movimientos no reproducen el saldo que declara el extracto.',
    );
  });

  it('HUECO nombra el tramo de calendario sin cobertura', () => {
    const motivo: MotivoNoConciliado = {
      tipo: 'HUECO',
      desde: '2026-07-11',
      hasta: '2026-07-19',
    };
    expect(mensajeMotivo(motivo)).toBe(
      'Falta extracto entre el 11/07/2026 y el 19/07/2026: hay días sin cobertura antes del corte.',
    );
  });

  it('DISCONTINUIDAD nombra la diferencia entre importaciones consecutivas', () => {
    const motivo: MotivoNoConciliado = {
      tipo: 'DISCONTINUIDAD',
      anteriorId: 'imp-1',
      siguienteId: 'imp-2',
      diferencia: '200.00',
    };
    expect(mensajeMotivo(motivo)).toBe(
      'El saldo final de un extracto no empalma con el inicial del siguiente: hay una diferencia de Bs 200,00 entre importaciones consecutivas.',
    );
  });

  it('RESIDUO_NO_EXPLICADO expone el importe sin absorberlo', () => {
    const motivo: MotivoNoConciliado = { tipo: 'RESIDUO_NO_EXPLICADO', importe: '-0.01' };
    expect(mensajeMotivo(motivo)).toBe(
      'Queda un residuo de Bs -0,01 que las partidas no explican: algo tocó la cuenta banco fuera de lo que este módulo conoce.',
    );
  });

  it('ARRANQUE_EXTRACTO_NO_COINCIDE nombra la causa con los tres números y la fecha del arranque', () => {
    const motivo: MotivoNoConciliado = {
      tipo: 'ARRANQUE_EXTRACTO_NO_COINCIDE',
      fecha: '2026-06-05',
      declarado: '15.99',
      real: '714.99',
      diferencia: '699.00',
    };
    expect(mensajeMotivo(motivo)).toBe(
      'El arranque del 05/06/2026 declara un saldo de extracto de Bs 15,99, pero el extracto real a esa fecha es Bs 714,99 (diferencia de Bs 699,00): revisá la declaración del punto de partida.',
    );
  });

  it('ARRANQUE_EXTRACTO_NO_COINCIDE sin montos (contrato degradado) no inventa números', () => {
    const motivo: MotivoNoConciliado = { tipo: 'ARRANQUE_EXTRACTO_NO_COINCIDE' };
    expect(mensajeMotivo(motivo)).toBe(
      'El saldo de extracto declarado en el arranque no coincide con el extracto real a esa fecha: revisá la declaración del punto de partida.',
    );
  });

  it('HUECO sin fechas (contrato degradado) no inventa un tramo', () => {
    const motivo: MotivoNoConciliado = { tipo: 'HUECO' };
    expect(mensajeMotivo(motivo)).toBe(
      'Falta extracto: hay días sin cobertura antes del corte.',
    );
  });
});
