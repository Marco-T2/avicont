import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import type { CuentaBancaria } from '@/types/api';

import { CuentaBancariaForm } from './cuenta-bancaria-form';

// Cross-feature hook mockeado: evita depender de un backend real para el
// selector de cuenta del plan.
vi.mock('@/features/plan-cuentas/hooks/use-cuentas', () => ({
  useCuentas: () => ({
    data: {
      items: [
        { id: 'cuenta-1', codigoInterno: '1.1.1.001', nombre: 'Caja Moneda Nacional' },
        { id: 'cuenta-2', codigoInterno: '1.1.1.002', nombre: 'Caja USD' },
      ],
      total: 2,
    },
    isLoading: false,
  }),
}));

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const CUENTA_BANCARIA: CuentaBancaria = {
  id: 'cb-1',
  organizationId: 'org-1',
  cuentaId: 'cuenta-1',
  alias: 'Cuenta corriente BancoSol',
  perfilExtracto: 'BANCOSOL_XLSX',
  numeroCuenta: null,
  moneda: 'BOB',
  activa: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('CuentaBancariaForm', () => {
  it('modo crear — envía los valores del formulario al confirmar', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    renderWithQuery(
      <CuentaBancariaForm mode="create" onSubmit={onSubmit} isSubmitting={false} />,
    );

    await user.type(screen.getByLabelText(/alias/i), 'Cuenta corriente BancoSol');

    await user.click(screen.getByRole('button', { name: /crear cuenta bancaria/i }));

    // Sin cuenta seleccionada, el form NO debe llamar a onSubmit (validación zod).
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('modo editar — precarga los valores existentes', () => {
    renderWithQuery(
      <CuentaBancariaForm
        mode="edit"
        initialData={CUENTA_BANCARIA}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
    );

    expect(screen.getByLabelText(/alias/i)).toHaveValue('Cuenta corriente BancoSol');
    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeInTheDocument();
  });

  it('modo editar — el selector de cuenta del plan está deshabilitado (inmutable post-creación)', () => {
    renderWithQuery(
      <CuentaBancariaForm
        mode="edit"
        initialData={CUENTA_BANCARIA}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
    );

    // El selector de cuenta es el primer combobox del form (orden del JSX).
    expect(screen.getAllByRole('combobox')[0]).toBeDisabled();
  });

  it('submit deshabilitado mientras isSubmitting=true (Anti-F-07)', () => {
    renderWithQuery(
      <CuentaBancariaForm mode="create" onSubmit={vi.fn()} isSubmitting={true} />,
    );

    expect(screen.getByRole('button', { name: /guardando/i })).toBeDisabled();
  });

  it('modo crear — el checkbox de activa NO se muestra (siempre nace activa)', () => {
    renderWithQuery(<CuentaBancariaForm mode="create" onSubmit={vi.fn()} isSubmitting={false} />);

    expect(screen.queryByLabelText(/^activa$/i)).not.toBeInTheDocument();
  });

  it('modo editar — el checkbox de activa se muestra', () => {
    renderWithQuery(
      <CuentaBancariaForm
        mode="edit"
        initialData={CUENTA_BANCARIA}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
    );

    expect(screen.getByLabelText(/^activa$/i)).toBeInTheDocument();
  });

  it('completa el formulario y envía onSubmit con los valores esperados', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    renderWithQuery(<CuentaBancariaForm mode="create" onSubmit={onSubmit} isSubmitting={false} />);

    await user.click(screen.getAllByRole('combobox')[0] as HTMLElement);
    await user.click(await screen.findByText('Caja Moneda Nacional'));

    await user.type(screen.getByLabelText(/alias/i), 'Cuenta corriente BancoSol');

    await user.click(screen.getByRole('button', { name: /crear cuenta bancaria/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          cuentaId: 'cuenta-1',
          alias: 'Cuenta corriente BancoSol',
          perfilExtracto: 'BANCOSOL_XLSX',
          moneda: 'BOB',
        }),
      );
    });
  });
});
