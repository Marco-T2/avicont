import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TipoRegistroResponse } from '../api/granja.types';
import { hoyEnLaPaz } from '../lib/hoy-en-la-paz';
import { MovimientoInversionForm } from './movimiento-inversion-form';

// Mock de useTiposRegistro para que no haga llamadas reales.
vi.mock('../hooks/use-granja-queries', () => ({
  useTiposRegistro: vi.fn(),
}));

import { useTiposRegistro } from '../hooks/use-granja-queries';

// IDs en formato UUID v4 válido para pasar la validación del schema.
// El dígito en posición 13 debe ser '4' (versión) y posición 17 debe ser 8-b (variante).
const TIPO_ALIMENTO_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const TIPO_VETERINARIO_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6';

const tiposInversion: TipoRegistroResponse[] = [
  {
    id: TIPO_ALIMENTO_ID,
    nombre: 'Alimento',
    naturaleza: 'INVERSION',
    esSistema: true,
    activo: true,
    organizationId: '00000000-0000-0000-0000-000000000001',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: TIPO_VETERINARIO_ID,
    nombre: 'Veterinario',
    naturaleza: 'INVERSION',
    esSistema: true,
    activo: true,
    organizationId: '00000000-0000-0000-0000-000000000001',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.mocked(useTiposRegistro).mockReturnValue({
    data: tiposInversion,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useTiposRegistro>);
});

describe('MovimientoInversionForm', () => {
  it('renderiza el campo monto como input text (no number)', () => {
    render(
      <MovimientoInversionForm onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper },
    );

    const montoInput = screen.getByLabelText(/monto/i);
    expect(montoInput).toHaveAttribute('type', 'text');
  });

  it('muestra el selector de tipo de registro', () => {
    render(
      <MovimientoInversionForm onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper },
    );

    expect(screen.getByLabelText(/tipo de registro/i)).toBeInTheDocument();
  });

  it('muestra el campo fecha', () => {
    render(
      <MovimientoInversionForm onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper },
    );

    expect(screen.getByLabelText(/fecha/i)).toBeInTheDocument();
  });

  it('pre-carga la fecha con el día de hoy (La Paz)', () => {
    render(
      <MovimientoInversionForm onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper },
    );

    expect(screen.getByLabelText(/fecha/i)).toHaveValue(hoyEnLaPaz());
  });

  it('muestra error de validación si monto tiene formato inválido', async () => {
    const user = userEvent.setup();
    render(
      <MovimientoInversionForm onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper },
    );

    await user.type(screen.getByLabelText(/monto/i), 'abc');
    await user.click(screen.getByRole('button', { name: /registrar/i }));

    expect(
      await screen.findByText(/número positivo con hasta 2 decimales/i),
    ).toBeInTheDocument();
  });

  it('muestra error si monto está vacío al enviar', async () => {
    const user = userEvent.setup();
    render(
      <MovimientoInversionForm onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper },
    );

    await user.click(screen.getByRole('button', { name: /registrar/i }));

    expect(await screen.findByText(/el monto es obligatorio/i)).toBeInTheDocument();
  });

  it('acepta monto con formato decimal válido (1250.50)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <MovimientoInversionForm onSubmit={onSubmit} isSubmitting={false} />,
      { wrapper },
    );

    await user.type(screen.getByLabelText(/monto/i), '1250.50');
    // La fecha viene pre-cargada con hoy; la limpiamos antes de tipear la nuestra.
    await user.clear(screen.getByLabelText(/fecha/i));
    await user.type(screen.getByLabelText(/fecha/i), '2026-06-01');

    // Seleccionar el tipo de registro usando el select nativo.
    // user.selectOptions dispara todos los eventos del usuario correctamente.
    const select = screen.getByLabelText(/tipo de registro/i);
    await user.selectOptions(select, TIPO_ALIMENTO_ID);

    await user.click(screen.getByRole('button', { name: /registrar/i }));

    // RHF llama onSubmit(data, event) — el segundo argumento es el FormEvent.
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        monto: '1250.50',
        tipoRegistroId: TIPO_ALIMENTO_ID,
      }),
      expect.anything(),
    );
  });

  it('el botón submit está deshabilitado mientras isSubmitting=true (Anti-F-07)', () => {
    render(
      <MovimientoInversionForm onSubmit={vi.fn()} isSubmitting={true} />,
      { wrapper },
    );

    expect(screen.getByRole('button', { name: /registrando/i })).toBeDisabled();
  });
});
