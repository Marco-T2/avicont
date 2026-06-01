import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import * as usePermissionsModule from '@/lib/use-permissions';

import { ComprobantesPage } from './comprobantes-page';

// "Nuevo comprobante" usa <PermissionButton>. Default: todos los permisos.
function mockPermissions(overrides: { isOwner?: boolean; permissions?: string[] } = {}) {
  const { isOwner = true, permissions = [] } = overrides;
  vi.spyOn(usePermissionsModule, 'usePermissions').mockReturnValue({
    isOwner,
    isLoading: false,
    permissions,
    has: (p: string) => isOwner || permissions.includes(p),
  } as unknown as ReturnType<typeof usePermissionsModule.usePermissions>);
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockPermissions();
});

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
        <TooltipProvider delayDuration={0}>
          <ComprobantesPage />
        </TooltipProvider>
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

  it('sin permiso create: "Nuevo comprobante" deshabilitado y no navega', async () => {
    mockPermissions({ isOwner: false, permissions: ['contabilidad.asientos.read'] });
    const user = userEvent.setup();
    renderPage();
    const btn = screen.getByRole('button', { name: /nuevo comprobante/i });
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
