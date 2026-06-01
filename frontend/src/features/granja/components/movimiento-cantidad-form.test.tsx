import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TipoRegistroResponse } from '../api/granja.types';
import { MovimientoCantidadForm } from './movimiento-cantidad-form';

// Mock de useTiposRegistro para que no haga llamadas reales.
vi.mock('../hooks/use-granja-queries', () => ({
  useTiposRegistro: vi.fn(),
}));

import { useTiposRegistro } from '../hooks/use-granja-queries';

// ID en formato UUID v4 válido para pasar la validación del schema.
// El dígito en posición 13 debe ser '4' (versión) y posición 17 debe ser 8-b (variante).
const TIPO_MORTALIDAD_ID = 'c3d4e5f6-a7b8-4c9d-a0e1-f2a3b4c5d6e7';

const tiposCantidad: TipoRegistroResponse[] = [
  {
    id: TIPO_MORTALIDAD_ID,
    nombre: 'Mortalidad',
    naturaleza: 'CANTIDAD',
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
    data: tiposCantidad,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useTiposRegistro>);
});

describe('MovimientoCantidadForm', () => {
  it('renderiza el campo cantidad como input numérico', () => {
    render(
      <MovimientoCantidadForm onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper },
    );

    expect(screen.getByLabelText(/cantidad/i)).toBeInTheDocument();
  });

  it('muestra el selector de tipo de registro', () => {
    render(
      <MovimientoCantidadForm onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper },
    );

    expect(screen.getByLabelText(/tipo de registro/i)).toBeInTheDocument();
  });

  it('muestra el campo fecha', () => {
    render(
      <MovimientoCantidadForm onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper },
    );

    expect(screen.getByLabelText(/fecha/i)).toBeInTheDocument();
  });

  it('muestra error si cantidad es 0 o negativa al enviar', async () => {
    const user = userEvent.setup();
    render(
      <MovimientoCantidadForm onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper },
    );

    const cantidadInput = screen.getByLabelText(/cantidad/i);
    await user.type(cantidadInput, '0');
    await user.click(screen.getByRole('button', { name: /registrar/i }));

    expect(
      await screen.findByText(/la cantidad debe ser al menos 1/i),
    ).toBeInTheDocument();
  });

  it('muestra error si cantidad está vacía al enviar', async () => {
    const user = userEvent.setup();
    render(
      <MovimientoCantidadForm onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper },
    );

    await user.click(screen.getByRole('button', { name: /registrar/i }));

    expect(await screen.findByText(/la cantidad debe ser al menos 1/i)).toBeInTheDocument();
  });

  it('llama a onSubmit con la cantidad correcta al completar el form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <MovimientoCantidadForm onSubmit={onSubmit} isSubmitting={false} />,
      { wrapper },
    );

    await user.type(screen.getByLabelText(/cantidad/i), '50');
    // user.type en inputs date funciona en jsdom con userEvent v14.
    await user.type(screen.getByLabelText(/fecha/i), '2026-06-01');

    // user.selectOptions dispara todos los eventos del usuario correctamente.
    const select = screen.getByLabelText(/tipo de registro/i);
    await user.selectOptions(select, TIPO_MORTALIDAD_ID);

    await user.click(screen.getByRole('button', { name: /registrar/i }));

    // RHF llama onSubmit(data, event) — el segundo argumento es el FormEvent.
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        cantidad: 50,
        tipoRegistroId: TIPO_MORTALIDAD_ID,
      }),
      expect.anything(),
    );
  });

  it('el botón submit está deshabilitado mientras isSubmitting=true (Anti-F-07)', () => {
    render(
      <MovimientoCantidadForm onSubmit={vi.fn()} isSubmitting={true} />,
      { wrapper },
    );

    expect(screen.getByRole('button', { name: /registrando/i })).toBeDisabled();
  });
});
