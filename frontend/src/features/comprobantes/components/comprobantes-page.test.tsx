import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ComprobantesPage } from './comprobantes-page';

// Mock de useNavigate para verificar navegación sin montar el router completo.
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock hooks de datos
vi.mock('../hooks/use-comprobantes', () => ({
  useComprobantes: () => ({
    data: { items: [], total: 0, page: 1, limit: 20 },
    isLoading: false,
    isError: false,
  }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ComprobantesPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ComprobantesPage (smoke)', () => {
  it('renderiza el header con el título', () => {
    renderPage();
    expect(screen.getByText('Comprobantes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nuevo comprobante/i })).toBeInTheDocument();
  });

  it('renderiza los filtros', () => {
    renderPage();
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
    expect(screen.getByLabelText('Estado')).toBeInTheDocument();
  });

  it('muestra empty state cuando no hay comprobantes', () => {
    renderPage();
    expect(
      screen.getByText(/No hay comprobantes para mostrar/i),
    ).toBeInTheDocument();
  });

  it('botón "Nuevo comprobante" navega a /comprobantes/nuevo', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /nuevo comprobante/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/comprobantes/nuevo');
  });
});
