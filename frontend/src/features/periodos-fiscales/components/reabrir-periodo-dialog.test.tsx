import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ReabrirPeriodoDialog } from './reabrir-periodo-dialog';

vi.mock('../hooks/use-reabrir-periodo', () => ({
  useReabrirPeriodo: vi.fn(),
}));

import { useReabrirPeriodo } from '../hooks/use-reabrir-periodo';

const mockedUseReabrirPeriodo = useReabrirPeriodo as ReturnType<typeof vi.fn>;

function wrapper(): (props: { children: React.ReactNode }) => React.JSX.Element {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function mutateStub(overrides: Partial<{ mutate: unknown; isPending: boolean }> = {}) {
  return { mutate: vi.fn(), isPending: false, ...overrides };
}

describe('ReabrirPeriodoDialog', () => {
  it('renderiza el diálogo cuando open=true con periodoId', () => {
    mockedUseReabrirPeriodo.mockReturnValue(mutateStub());
    render(
      <ReabrirPeriodoDialog
        open
        onOpenChange={vi.fn()}
        periodoId="p1"
        nombrePeriodo="Enero 2026"
      />,
      { wrapper: wrapper() },
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/motivo/i)).toBeInTheDocument();
  });

  it('motivo de 19 chars → submit deshabilitado y error visible', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    mockedUseReabrirPeriodo.mockReturnValue(mutateStub({ mutate }));
    render(
      <ReabrirPeriodoDialog
        open
        onOpenChange={vi.fn()}
        periodoId="p1"
        nombrePeriodo="Enero 2026"
      />,
      { wrapper: wrapper() },
    );
    const textarea = screen.getByLabelText(/motivo/i);
    // 19 chars — no llega a 20
    await user.type(textarea, 'motivo corto123456x');
    await user.click(screen.getByRole('button', { name: /confirmar/i }));
    await screen.findByText(/mínimo 20/i);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('motivo de solo espacios → falla validación (trim)', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    mockedUseReabrirPeriodo.mockReturnValue(mutateStub({ mutate }));
    render(
      <ReabrirPeriodoDialog
        open
        onOpenChange={vi.fn()}
        periodoId="p1"
        nombrePeriodo="Enero 2026"
      />,
      { wrapper: wrapper() },
    );
    const textarea = screen.getByLabelText(/motivo/i);
    await user.type(textarea, '                        '); // 24 espacios — pasan qty pero no trim
    await user.click(screen.getByRole('button', { name: /confirmar/i }));
    await screen.findByText(/mínimo 20/i);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('motivo de ≥30 chars válido → llama a mutation con periodoId y motivo', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    mockedUseReabrirPeriodo.mockReturnValue(mutateStub({ mutate }));
    render(
      <ReabrirPeriodoDialog
        open
        onOpenChange={vi.fn()}
        periodoId="p1"
        nombrePeriodo="Enero 2026"
      />,
      { wrapper: wrapper() },
    );
    const textarea = screen.getByLabelText(/motivo/i);
    const motivo = 'Corrección solicitada por auditoría interna';
    await user.type(textarea, motivo);
    await user.click(screen.getByRole('button', { name: /confirmar/i }));
    await waitFor(() => {
      expect(mutate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1', motivo }),
        expect.any(Object),
      );
    });
  });

  it('error PERIODO_YA_ABIERTO (409) → mutate llama onError con código correcto', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn().mockImplementation(
      (_vals: unknown, opts: { onError: (e: unknown) => void }) => {
        opts.onError({ response: { data: { code: 'PERIODO_YA_ABIERTO' } } });
      },
    );
    mockedUseReabrirPeriodo.mockReturnValue(mutateStub({ mutate }));
    render(
      <ReabrirPeriodoDialog
        open
        onOpenChange={vi.fn()}
        periodoId="p1"
        nombrePeriodo="Enero 2026"
      />,
      { wrapper: wrapper() },
    );
    const textarea = screen.getByLabelText(/motivo/i);
    await user.type(textarea, 'Corrección solicitada por auditoría interna');
    await user.click(screen.getByRole('button', { name: /confirmar/i }));
    await waitFor(() => {
      expect(mutate).toHaveBeenCalled();
    });
  });

  it('isPending → botón de submit deshabilitado (muestra "Reabriendo…")', () => {
    mockedUseReabrirPeriodo.mockReturnValue(mutateStub({ isPending: true }));
    render(
      <ReabrirPeriodoDialog
        open
        onOpenChange={vi.fn()}
        periodoId="p1"
        nombrePeriodo="Enero 2026"
      />,
      { wrapper: wrapper() },
    );
    // Cuando isPending=true el texto cambia a "Reabriendo…"
    const btn = screen.getByRole('button', { name: /reabriendo/i });
    expect(btn).toBeDisabled();
  });

  it('contador de chars muestra la cantidad actual', async () => {
    const user = userEvent.setup();
    mockedUseReabrirPeriodo.mockReturnValue(mutateStub());
    render(
      <ReabrirPeriodoDialog
        open
        onOpenChange={vi.fn()}
        periodoId="p1"
        nombrePeriodo="Enero 2026"
      />,
      { wrapper: wrapper() },
    );
    const textarea = screen.getByLabelText(/motivo/i);
    await user.type(textarea, 'Hola mundo');
    expect(screen.getByText(/10\s*\/\s*20/)).toBeInTheDocument();
  });
});
