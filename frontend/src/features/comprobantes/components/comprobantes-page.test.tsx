import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ComprobantesPage } from './comprobantes-page';

// Mock hooks de datos
vi.mock('../hooks/use-comprobantes', () => ({
  useComprobantes: () => ({
    data: { items: [], total: 0, page: 1, limit: 20 },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/features/plan-cuentas/hooks/use-cuentas', () => ({
  useCuentas: () => ({ data: { items: [] } }),
}));

// Mock del EditarComprobanteSheet para evitar FormProvider complejo
vi.mock('./editar-comprobante-sheet', () => ({
  EditarComprobanteSheet: () => null,
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
});
