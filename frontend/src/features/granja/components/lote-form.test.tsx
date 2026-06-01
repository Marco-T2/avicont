import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { hoyEnLaPaz } from '../lib/hoy-en-la-paz';
import { LoteForm } from './lote-form';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('LoteForm — modo crear', () => {
  it('renderiza los campos obligatorios', () => {
    render(
      <LoteForm mode="create" onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper },
    );

    expect(screen.getByLabelText(/cantidad inicial/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fecha de ingreso/i)).toBeInTheDocument();
  });

  it('el campo cantidadInicial está habilitado en modo crear', () => {
    render(
      <LoteForm mode="create" onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper },
    );

    expect(screen.getByLabelText(/cantidad inicial/i)).not.toBeDisabled();
  });

  it('muestra error si se envía sin cantidadInicial', async () => {
    const user = userEvent.setup();
    render(
      <LoteForm mode="create" onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper },
    );

    await user.click(screen.getByRole('button', { name: /crear lote/i }));

    expect(await screen.findByText(/la cantidad inicial debe ser al menos 1/i)).toBeInTheDocument();
  });

  it('pre-carga la fecha de ingreso con el día de hoy (La Paz)', () => {
    render(
      <LoteForm mode="create" onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper },
    );

    expect(screen.getByLabelText(/fecha de ingreso/i)).toHaveValue(hoyEnLaPaz());
  });

  it('muestra error si se borra la fecha de ingreso y se envía', async () => {
    const user = userEvent.setup();
    render(
      <LoteForm mode="create" onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper },
    );

    // La fecha viene pre-cargada con hoy; el usuario la borra explícitamente.
    await user.clear(screen.getByLabelText(/fecha de ingreso/i));
    await user.click(screen.getByRole('button', { name: /crear lote/i }));

    expect(await screen.findByText(/la fecha de ingreso es obligatoria/i)).toBeInTheDocument();
  });

  it('llama a onSubmit con los valores correctos al completar el form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <LoteForm mode="create" onSubmit={onSubmit} isSubmitting={false} />,
      { wrapper },
    );

    // user.type en inputs number funciona en jsdom con userEvent v14.
    await user.type(screen.getByLabelText(/cantidad inicial/i), '5000');
    // La fecha viene pre-cargada con hoy; la limpiamos antes de tipear la nuestra.
    await user.clear(screen.getByLabelText(/fecha de ingreso/i));
    await user.type(screen.getByLabelText(/fecha de ingreso/i), '2026-01-15');

    await user.click(screen.getByRole('button', { name: /crear lote/i }));

    // RHF llama onSubmit(data, event) — el segundo argumento es el FormEvent.
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        cantidadInicial: 5000,
        fechaIngreso: '2026-01-15',
      }),
      expect.anything(),
    );
  });

  it('el botón submit está deshabilitado mientras isSubmitting=true (Anti-F-07)', () => {
    render(
      <LoteForm mode="create" onSubmit={vi.fn()} isSubmitting={true} />,
      { wrapper },
    );

    expect(screen.getByRole('button', { name: /creando/i })).toBeDisabled();
  });
});

describe('LoteForm — modo edición', () => {
  const initialData = {
    cantidadInicial: 5000,
    fechaIngreso: '2026-01-01',
    nombre: 'Lote A',
    galpon: 'Galpón 1',
  };

  it('el campo cantidadInicial está deshabilitado en modo edición', () => {
    render(
      <LoteForm mode="edit" initialData={initialData} onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper },
    );

    expect(screen.getByLabelText(/cantidad inicial/i)).toBeDisabled();
  });

  it('muestra los valores iniciales pre-cargados', () => {
    render(
      <LoteForm mode="edit" initialData={initialData} onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper },
    );

    expect(screen.getByDisplayValue('Lote A')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Galpón 1')).toBeInTheDocument();
  });

  it('el botón submit muestra "Guardar cambios" en modo edición', () => {
    render(
      <LoteForm mode="edit" initialData={initialData} onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper },
    );

    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeInTheDocument();
  });

  it('el botón submit está deshabilitado mientras isSubmitting=true en edición', () => {
    render(
      <LoteForm mode="edit" initialData={initialData} onSubmit={vi.fn()} isSubmitting={true} />,
      { wrapper },
    );

    expect(screen.getByRole('button', { name: /guardando/i })).toBeDisabled();
  });
});
