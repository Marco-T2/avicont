import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────
vi.mock('../hooks/use-declarar-arranque', () => ({
  useDeclararArranque: vi.fn(),
}));
vi.mock('../hooks/use-candidatos-arranque', () => ({
  useCandidatosArranque: vi.fn(),
}));

import { useCandidatosArranque } from '../hooks/use-candidatos-arranque';
import { useDeclararArranque } from '../hooks/use-declarar-arranque';

import { DeclararArranqueSheet } from './declarar-arranque-sheet';

const mutateMock = vi.fn();

const CANDIDATO_CHEQUE = {
  referencia: 'LIN:comp-jun:1',
  origen: 'LINEA' as const,
  fecha: '2026-06-20',
  importe: '-400.00',
  descripcion: 'D2606-000012 — Pago con cheque 4471',
};
const CANDIDATO_APERTURA = {
  referencia: 'LIN:comp-apertura:1',
  origen: 'LINEA' as const,
  fecha: '2026-06-30',
  importe: '1000.00',
  descripcion: 'D2606-000001 — Asiento de apertura',
};

function mockCandidatos(
  data: { referencia: string; origen: string; fecha: string; importe: string; descripcion: string }[] = [],
): void {
  vi.mocked(useCandidatosArranque).mockReturnValue({
    data,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useCandidatosArranque>);
}

function mockMutation(overrides: { isPending?: boolean } = {}): void {
  vi.mocked(useDeclararArranque).mockReturnValue({
    mutate: mutateMock,
    isPending: overrides.isPending ?? false,
  } as unknown as ReturnType<typeof useDeclararArranque>);
}

function renderSheet(onOpenChange = vi.fn()) {
  render(
    <DeclararArranqueSheet
      open
      onOpenChange={onOpenChange}
      cuentaBancariaId="cb-1"
      fechaInicial="2026-07-31"
    />,
  );
  return onOpenChange;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMutation();
  mockCandidatos();
});

describe('DeclararArranqueSheet — declarar el punto de partida (REQ-ICB-04)', () => {
  it('la fecha arranca en el corte emitido y es editable', () => {
    renderSheet();

    expect(screen.getByLabelText(/fecha del arranque/i)).toHaveValue('2026-07-31');
  });

  it('envía los CUATRO datos declarados por el usuario más la cuenta', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.type(screen.getByLabelText(/saldo según extracto/i), '1000.00');
    await user.type(screen.getByLabelText(/saldo según libros/i), '990.00');
    await user.type(screen.getByLabelText(/diferencia residual/i), '10.00');
    await user.type(screen.getByLabelText(/nota/i), 'Adopción del sistema');
    await user.click(screen.getByRole('button', { name: /declarar arranque/i }));

    expect(mutateMock).toHaveBeenCalledWith(
      {
        cuentaBancariaId: 'cb-1',
        fecha: '2026-07-31',
        saldoExtracto: '1000.00',
        saldoLibros: '990.00',
        diferenciaResidual: '10.00',
        nota: 'Adopción del sistema',
        referenciasPartidas: [],
      },
      expect.anything(),
    );
  });

  it('sin nota, la nota no viaja en el payload', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.type(screen.getByLabelText(/saldo según extracto/i), '1000.00');
    await user.type(screen.getByLabelText(/saldo según libros/i), '1000.00');
    await user.type(screen.getByLabelText(/diferencia residual/i), '0.00');
    await user.click(screen.getByRole('button', { name: /declarar arranque/i }));

    expect(mutateMock).toHaveBeenCalledWith(
      {
        cuentaBancariaId: 'cb-1',
        fecha: '2026-07-31',
        saldoExtracto: '1000.00',
        saldoLibros: '1000.00',
        diferenciaResidual: '0.00',
        referenciasPartidas: [],
      },
      expect.anything(),
    );
  });

  it('la diferencia residual NO se autocompleta con extracto − libros: es una declaración', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.type(screen.getByLabelText(/saldo según extracto/i), '1000.00');
    await user.type(screen.getByLabelText(/saldo según libros/i), '990.00');

    // Tras tipear ambos saldos el campo sigue vacío — el usuario asume la
    // parte inexplicable, la UI no la calcula (decisión vinculante).
    expect(screen.getByLabelText(/diferencia residual/i)).toHaveValue('');
  });

  it('con la residual vacía NO envía y muestra el error', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.type(screen.getByLabelText(/saldo según extracto/i), '1000.00');
    await user.type(screen.getByLabelText(/saldo según libros/i), '990.00');
    await user.click(screen.getByRole('button', { name: /declarar arranque/i }));

    expect(mutateMock).not.toHaveBeenCalled();
    expect(
      screen.getAllByText(/debe ser un número decimal/i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('cierra el sheet cuando la mutación confirma (onSuccess)', async () => {
    const user = userEvent.setup();
    mutateMock.mockImplementation(
      (_body: unknown, opts: { onSuccess?: () => void } | undefined) => {
        opts?.onSuccess?.();
      },
    );
    const onOpenChange = renderSheet();

    await user.type(screen.getByLabelText(/saldo según extracto/i), '1000.00');
    await user.type(screen.getByLabelText(/saldo según libros/i), '990.00');
    await user.type(screen.getByLabelText(/diferencia residual/i), '10.00');
    await user.click(screen.getByRole('button', { name: /declarar arranque/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('el submit se deshabilita mientras la mutación está en curso (Anti-F-07)', () => {
    mockMutation({ isPending: true });
    renderSheet();

    expect(screen.getByRole('button', { name: /declarando/i })).toBeDisabled();
  });

  // ── Partidas abiertas: la propuesta que confirma quien concilia ─────────

  it('lista las partidas abiertas propuestas y NO marca ninguna por default', () => {
    // Marcar por default reproduciría el defecto en silencio: el asiento de
    // apertura entraría como partida sin que nadie lo mire.
    mockCandidatos([CANDIDATO_CHEQUE, CANDIDATO_APERTURA]);
    renderSheet();

    expect(screen.getByText(/Pago con cheque 4471/)).toBeInTheDocument();
    expect(screen.getByText(/Asiento de apertura/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Pago con cheque 4471/)).not.toBeChecked();
    expect(screen.getByLabelText(/Asiento de apertura/)).not.toBeChecked();
  });

  it('envía SOLO las referencias confirmadas', async () => {
    const user = userEvent.setup();
    mockCandidatos([CANDIDATO_CHEQUE, CANDIDATO_APERTURA]);
    renderSheet();

    await user.click(screen.getByLabelText(/Pago con cheque 4471/));
    await user.type(screen.getByLabelText(/saldo según extracto/i), '1000.00');
    await user.type(screen.getByLabelText(/saldo según libros/i), '600.00');
    await user.type(screen.getByLabelText(/diferencia residual/i), '0.00');
    await user.click(screen.getByRole('button', { name: /declarar arranque/i }));

    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ referenciasPartidas: ['LIN:comp-jun:1'] }),
      expect.anything(),
    );
  });

  it('la verificación aritmética avisa cuando la selección no cuadra, y confirma cuando sí', async () => {
    const user = userEvent.setup();
    mockCandidatos([CANDIDATO_CHEQUE, CANDIDATO_APERTURA]);
    renderSheet();

    // 600 − 1000 + 0 = −400: hay que marcar el cheque y NO la apertura.
    await user.type(screen.getByLabelText(/saldo según extracto/i), '1000.00');
    await user.type(screen.getByLabelText(/saldo según libros/i), '600.00');
    await user.type(screen.getByLabelText(/diferencia residual/i), '0.00');

    expect(screen.getByTestId('verificacion-partidas')).toHaveTextContent(/debería sumar/i);

    await user.click(screen.getByLabelText(/Pago con cheque 4471/));
    expect(screen.getByTestId('verificacion-partidas')).toHaveTextContent(/cierra/i);

    // Marcar además la apertura vuelve a romper la cuenta.
    await user.click(screen.getByLabelText(/Asiento de apertura/));
    expect(screen.getByTestId('verificacion-partidas')).toHaveTextContent(/debería sumar/i);
  });

  it('sin nada abierto a esa fecha lo dice', () => {
    mockCandidatos([]);
    renderSheet();

    expect(screen.getByText(/ambos lados arrancan parejos/i)).toBeInTheDocument();
  });
});
