import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ArranqueAplicado } from '@/types/api';

vi.mock('../hooks/use-anular-arranque', () => ({
  useAnularArranque: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

import { HistorialArranques } from './historial-arranques';

/** Declaración sana: cada test la especializa con lo que le importa. */
const BASE: ArranqueAplicado = {
  id: 'arr-base',
  fecha: '2026-06-30',
  saldoExtracto: '1000.00',
  saldoLibros: '990.00',
  diferenciaResidual: '10.00',
  nota: null,
  declaradoPorUserId: 'user-1',
  declaradoPorNombre: 'Ana Quispe',
  anulado: false,
  motivoAnulacion: null,
  anuladoPorUserId: null,
  anuladoPorNombre: null,
  anuladoEl: null,
  declaradoEl: '2026-07-01T12:00:00.000Z',
};

// Orden del backend: `fecha DESC, createdAt DESC` — el mismo desempate que
// `vigenteA`. El componente NO re-ordena.
const HISTORIAL: ArranqueAplicado[] = [
  {
    id: 'arr-dic',
    fecha: '2026-12-31',
    saldoExtracto: '2000.00',
    saldoLibros: '2000.00',
    diferenciaResidual: '0.00',
    nota: null,
    declaradoPorUserId: 'user-1',
    declaradoPorNombre: 'Ana Quispe',
    anulado: false,
    motivoAnulacion: null,
    anuladoPorUserId: null,
    anuladoPorNombre: null,
    anuladoEl: null,
    declaradoEl: '2027-01-05T10:00:00.000Z',
  },
  {
    id: 'arr-jun',
    fecha: '2026-06-30',
    saldoExtracto: '1000.00',
    saldoLibros: '480.00',
    diferenciaResidual: '500.00',
    nota: 'Adopción del sistema',
    declaradoPorUserId: 'user-9',
    declaradoPorNombre: 'Marco Tarqui',
    anulado: false,
    motivoAnulacion: null,
    anuladoPorUserId: null,
    anuladoPorNombre: null,
    anuladoEl: null,
    declaradoEl: '2026-07-01T12:00:00.000Z',
  },
];

function fila(fecha: string): HTMLElement {
  const el = screen.getByText(fecha).closest('li');
  if (el === null) throw new Error(`No hay fila para ${fecha}`);
  return el;
}

describe('HistorialArranques — el historial completo, señalando cuál aplica (D8)', () => {
  it('muestra TODAS las declaraciones: una posterior no borra ni oculta la anterior', () => {
    render(<HistorialArranques historial={HISTORIAL} corte="2026-07-31" isLoading={false}
      cuentaBancariaId="cb-1"
      puedeConciliar />);

    expect(screen.getByText('31/12/2026')).toBeInTheDocument();
    expect(screen.getByText('30/06/2026')).toBeInTheDocument();
  });

  it('señala la declaración que aplica al corte — la del 30/06, no la más nueva', () => {
    render(<HistorialArranques historial={HISTORIAL} corte="2026-07-31" isLoading={false}
      cuentaBancariaId="cb-1"
      puedeConciliar />);

    expect(within(fila('30/06/2026')).getByText(/aplica a este corte/i)).toBeInTheDocument();
    expect(
      within(fila('31/12/2026')).queryByText(/aplica a este corte/i),
    ).not.toBeInTheDocument();
  });

  it('cada declaración expone sus cuatro datos, la nota y la atribución (REQ-ICB-04)', () => {
    render(<HistorialArranques historial={HISTORIAL} corte="2026-07-31" isLoading={false}
      cuentaBancariaId="cb-1"
      puedeConciliar />);

    const junio = fila('30/06/2026');
    expect(within(junio).getByText('1.000,00')).toBeInTheDocument();
    expect(within(junio).getByText('500,00')).toBeInTheDocument(); // residual DECLARADA
    expect(within(junio).getByText('Adopción del sistema')).toBeInTheDocument();
    expect(within(junio).getByText(/por Marco Tarqui/i)).toBeInTheDocument();
    expect(within(junio).getByText(/01\/07\/2026/)).toBeInTheDocument();
  });

  it('si todas las declaraciones son posteriores al corte lo dice: ninguna aplica', () => {
    render(<HistorialArranques historial={HISTORIAL} corte="2026-01-31" isLoading={false}
      cuentaBancariaId="cb-1"
      puedeConciliar />);

    expect(screen.getByText(/ninguna declaración aplica a este corte/i)).toBeInTheDocument();
    expect(screen.queryByText(/aplica a este corte$/i)).not.toBeInTheDocument();
  });

  it('sin declaraciones explica que la cuenta todavía no tiene arranque', () => {
    render(<HistorialArranques historial={[]} corte="2026-07-31" isLoading={false}
      cuentaBancariaId="cb-1"
      puedeConciliar />);

    expect(
      screen.getByText(/todavía no hay declaraciones de arranque/i),
    ).toBeInTheDocument();
  });

  // ── Anulación (REQ-ICB-04, §4.7) ────────────────────────────────────────

  it('una declaración anulada se muestra con su marca, motivo y autor — no se oculta', () => {
    render(
      <HistorialArranques
        historial={[
          {
            ...BASE,
            id: 'arr-mala',
            fecha: '2026-07-31',
            anulado: true,
            motivoAnulacion: 'Se cargó con la fecha del cierre siguiente',
            anuladoPorNombre: 'Marco Tarqui',
            anuladoEl: '2026-07-26T18:00:00.000Z',
          },
        ]}
        corte="2026-07-31"
        isLoading={false}
        cuentaBancariaId="cb-1"
        puedeConciliar
      />,
    );

    expect(screen.getByText('Anulada')).toBeInTheDocument();
    expect(
      screen.getByText(/Se cargó con la fecha del cierre siguiente/),
    ).toBeInTheDocument();
    expect(screen.getByText(/por Marco Tarqui/)).toBeInTheDocument();
  });

  it('una anulada NO se señala como vigente aunque su fecha califique', () => {
    render(
      <HistorialArranques
        historial={[
          { ...BASE, id: 'anulada', fecha: '2026-07-31', anulado: true },
          { ...BASE, id: 'buena', fecha: '2026-06-30' },
        ]}
        corte="2026-07-31"
        isLoading={false}
        cuentaBancariaId="cb-1"
        puedeConciliar
      />,
    );

    const badges = screen.getAllByText('Aplica a este corte');
    expect(badges).toHaveLength(1);
    // La que aplica es la del 30/06, no la anulada del 31/07.
    expect(screen.getByText('30/06/2026').closest('li')).toContainElement(badges[0]!);
  });

  it('sin permiso de conciliar no se ofrece anular, aunque el historial se vea entero', () => {
    render(
      <HistorialArranques
        historial={[{ ...BASE, id: 'arr-1', fecha: '2026-06-30' }]}
        corte="2026-07-31"
        isLoading={false}
        cuentaBancariaId="cb-1"
        puedeConciliar={false}
      />,
    );

    expect(screen.getByText('30/06/2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /anular/i })).not.toBeInTheDocument();
  });

  it('una ya anulada no ofrece anularse de nuevo', () => {
    render(
      <HistorialArranques
        historial={[{ ...BASE, id: 'arr-1', fecha: '2026-06-30', anulado: true }]}
        corte="2026-07-31"
        isLoading={false}
        cuentaBancariaId="cb-1"
        puedeConciliar
      />,
    );

    expect(screen.queryByRole('button', { name: /anular/i })).not.toBeInTheDocument();
  });
});
