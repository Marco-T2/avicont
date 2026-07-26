import { describe, expect, it } from 'vitest';

import type { ArranqueAplicado } from '@/types/api';

import { idArranqueVigente } from './arranque-vigente';

function arranque(overrides: Partial<ArranqueAplicado> & Pick<ArranqueAplicado, 'id' | 'fecha'>): ArranqueAplicado {
  return {
    saldoExtracto: '1000.00',
    saldoLibros: '990.00',
    diferenciaResidual: '10.00',
    nota: null,
    declaradoPorUserId: 'user-1',
    declaradoPorNombre: 'Ana Quispe',
    declaradoEl: '2026-07-01T12:00:00.000Z',
    ...overrides,
  };
}

// El historial llega con el MISMO desempate que `vigenteA` en el backend
// (`fecha DESC, createdAt DESC`): la vigente a un corte es la PRIMERA fila
// con `fecha <= corte`. La función confía en ese orden — no re-ordena.
const HISTORIAL: ArranqueAplicado[] = [
  arranque({ id: 'arr-dic', fecha: '2026-12-31' }),
  arranque({ id: 'arr-jun', fecha: '2026-06-30' }),
];

describe('idArranqueVigente — señala cuál declaración aplica (REQ-ICB-04, D8)', () => {
  it('a un corte intermedio aplica la anterior, no la más nueva (escenario del spec)', () => {
    // GIVEN arranque al 30/06 y otro al 31/12 → el corte 31/07 aplica el del 30/06.
    expect(idArranqueVigente(HISTORIAL, '2026-07-31')).toBe('arr-jun');
  });

  it('a un corte posterior a todas aplica la más reciente', () => {
    expect(idArranqueVigente(HISTORIAL, '2027-01-31')).toBe('arr-dic');
  });

  it('a un corte anterior a todas no aplica ninguna', () => {
    expect(idArranqueVigente(HISTORIAL, '2026-01-31')).toBeNull();
  });

  it('una corrección con la MISMA fecha aplica la declarada más recientemente (createdAt DESC)', () => {
    const conCorreccion: ArranqueAplicado[] = [
      arranque({ id: 'arr-corregido', fecha: '2026-06-30', declaradoEl: '2026-08-01T09:00:00.000Z' }),
      arranque({ id: 'arr-original', fecha: '2026-06-30' }),
    ];

    expect(idArranqueVigente(conCorreccion, '2026-07-31')).toBe('arr-corregido');
  });

  it('sin historial no hay vigente', () => {
    expect(idArranqueVigente([], '2026-07-31')).toBeNull();
  });
});
