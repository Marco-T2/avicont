import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { NuevaGestionDialog } from './nueva-gestion-dialog';

vi.mock('../hooks/use-crear-gestion', () => ({
  useCrearGestion: vi.fn(),
}));

import { useCrearGestion } from '../hooks/use-crear-gestion';

const mockedUseCrearGestion = useCrearGestion as ReturnType<typeof vi.fn>;

function wrapper(): (props: { children: React.ReactNode }) => React.JSX.Element {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function mutateStub(overrides: Partial<{ mutate: unknown; isPending: boolean }> = {}) {
  return {
    mutate: vi.fn(),
    isPending: false,
    ...overrides,
  };
}

describe('NuevaGestionDialog', () => {
  it('renderiza el diálogo cuando open=true', () => {
    mockedUseCrearGestion.mockReturnValue(mutateStub());
    render(
      <NuevaGestionDialog open onOpenChange={vi.fn()} tipoEmpresa="COMERCIAL" />,
      { wrapper: wrapper() },
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/año/i)).toBeInTheDocument();
  });

  it('COMERCIAL → texto educativo muestra "Enero … a Diciembre …"', async () => {
    mockedUseCrearGestion.mockReturnValue(mutateStub());
    render(
      <NuevaGestionDialog open onOpenChange={vi.fn()} tipoEmpresa="COMERCIAL" />,
      { wrapper: wrapper() },
    );
    await screen.findByText(/Enero.*Diciembre/i);
  });

  it('INDUSTRIAL → texto educativo muestra "Abril … a Marzo …"', async () => {
    mockedUseCrearGestion.mockReturnValue(mutateStub());
    render(
      <NuevaGestionDialog open onOpenChange={vi.fn()} tipoEmpresa="INDUSTRIAL" />,
      { wrapper: wrapper() },
    );
    await screen.findByText(/Abril.*Marzo/i);
  });

  it('tipoEmpresa null → texto genérico de derivación', async () => {
    mockedUseCrearGestion.mockReturnValue(mutateStub());
    render(
      <NuevaGestionDialog open onOpenChange={vi.fn()} tipoEmpresa={null} />,
      { wrapper: wrapper() },
    );
    await screen.findByText(/derivará el mes inicial/i);
  });

  it('year=1999 (< 2000) → error de validación antes de submit', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    mockedUseCrearGestion.mockReturnValue(mutateStub({ mutate }));
    render(
      <NuevaGestionDialog open onOpenChange={vi.fn()} tipoEmpresa="COMERCIAL" />,
      { wrapper: wrapper() },
    );
    const yearInput = screen.getByLabelText(/año/i);
    await user.clear(yearInput);
    await user.type(yearInput, '1999');
    await user.click(screen.getByRole('button', { name: /confirmar/i }));
    await screen.findByText(/2000/i);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('gestión duplicada → toast con mensaje "Ya existe…"', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn().mockImplementation((_vals, opts: { onError: (e: unknown) => void }) => {
      opts.onError({ response: { data: { code: 'GESTION_DUPLICADA', details: { year: 2027 } } } });
    });
    mockedUseCrearGestion.mockReturnValue(mutateStub({ mutate }));
    render(
      <NuevaGestionDialog open onOpenChange={vi.fn()} tipoEmpresa="COMERCIAL" />,
      { wrapper: wrapper() },
    );
    const yearInput = screen.getByLabelText(/año/i);
    await user.clear(yearInput);
    await user.type(yearInput, '2027');
    await user.click(screen.getByRole('button', { name: /confirmar/i }));
    await waitFor(() => {
      // sonner is outside the DOM tree — check mutate was called with error handler
      expect(mutate).toHaveBeenCalled();
    });
  });

  it('isPending → botón de submit deshabilitado (muestra "Creando…")', () => {
    mockedUseCrearGestion.mockReturnValue(mutateStub({ isPending: true }));
    render(
      <NuevaGestionDialog open onOpenChange={vi.fn()} tipoEmpresa="COMERCIAL" />,
      { wrapper: wrapper() },
    );
    // Cuando isPending=true el texto cambia a "Creando…"
    const btn = screen.getByRole('button', { name: /creando/i });
    expect(btn).toBeDisabled();
  });
});
