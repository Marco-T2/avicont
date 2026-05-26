import { describe, expect, it } from 'vitest';

import { TipoEmpresa } from '@/types/api';

import { derivarRangoGestion } from './derivar-rango-gestion';

describe('derivarRangoGestion', () => {
  it('COMERCIAL 2026 → Enero 2026 a Diciembre 2026', () => {
    expect(derivarRangoGestion(TipoEmpresa.COMERCIAL, 2026)).toBe(
      'Enero 2026 a Diciembre 2026',
    );
  });

  it('SERVICIOS 2027 → mismo grupo que COMERCIAL', () => {
    expect(derivarRangoGestion(TipoEmpresa.SERVICIOS, 2027)).toBe(
      'Enero 2027 a Diciembre 2027',
    );
  });

  it('TRANSPORTE 2026 → mismo grupo que COMERCIAL', () => {
    expect(derivarRangoGestion(TipoEmpresa.TRANSPORTE, 2026)).toBe(
      'Enero 2026 a Diciembre 2026',
    );
  });

  it('INDUSTRIAL 2026 → Abril 2026 a Marzo 2027', () => {
    expect(derivarRangoGestion(TipoEmpresa.INDUSTRIAL, 2026)).toBe(
      'Abril 2026 a Marzo 2027',
    );
  });

  it('CONSTRUCCION 2026 → mismo grupo que INDUSTRIAL', () => {
    expect(derivarRangoGestion(TipoEmpresa.CONSTRUCCION, 2026)).toBe(
      'Abril 2026 a Marzo 2027',
    );
  });

  it('PETROLERA 2026 → mismo grupo que INDUSTRIAL', () => {
    expect(derivarRangoGestion(TipoEmpresa.PETROLERA, 2026)).toBe(
      'Abril 2026 a Marzo 2027',
    );
  });

  it('AGROPECUARIA 2026 → Julio 2026 a Junio 2027', () => {
    expect(derivarRangoGestion(TipoEmpresa.AGROPECUARIA, 2026)).toBe(
      'Julio 2026 a Junio 2027',
    );
  });

  it('MINERA 2026 → Octubre 2026 a Septiembre 2027', () => {
    expect(derivarRangoGestion(TipoEmpresa.MINERA, 2026)).toBe(
      'Octubre 2026 a Septiembre 2027',
    );
  });
});
