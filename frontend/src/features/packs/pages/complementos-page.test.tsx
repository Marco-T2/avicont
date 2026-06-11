import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { OrgPackEntitlement } from '@/types/api';

// Mock the hook module before importing the page
vi.mock('../hooks/use-mis-packs-gestion', () => ({
  useMisPacksGestion: vi.fn(),
}));

// Mock the row component to isolate page rendering
vi.mock('../components/complemento-row', () => ({
  ComplementoRow: ({ entitlement }: { entitlement: OrgPackEntitlement }) => (
    <div data-testid="complemento-row" data-activo={String(entitlement.activo)}>
      {entitlement.pack.nombre}
    </div>
  ),
}));

import * as useMisPacksGestionModule from '../hooks/use-mis-packs-gestion';
import { ComplementosPage } from './complementos-page';

function mockMisPacksGestion(
  overrides: Partial<ReturnType<typeof useMisPacksGestionModule.useMisPacksGestion>>,
) {
  vi.mocked(useMisPacksGestionModule.useMisPacksGestion).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    isPending: false,
    isSuccess: false,
    error: null,
    ...overrides,
  } as ReturnType<typeof useMisPacksGestionModule.useMisPacksGestion>);
}

function makeEntitlement(overrides: { clave: string; nombre: string; activo?: boolean }): OrgPackEntitlement {
  return {
    id: `ent-${overrides.clave}`,
    packId: `pack-${overrides.clave}`,
    organizationId: 'org-1',
    activo: overrides.activo ?? false,
    habilitadoPorUserId: 'user-1',
    pack: {
      id: `pack-${overrides.clave}`,
      clave: overrides.clave,
      nombre: overrides.nombre,
      descripcion: 'Descripción de prueba',
      tipo: 'CAPACIDAD',
      verticalAplicable: 'CONTABILIDAD',
      activo: true,
    },
  };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('<ComplementosPage>', () => {
  it('data vacía → empty state con el copy exacto', () => {
    mockMisPacksGestion({ data: [], isSuccess: true });
    render(
      <Wrapper>
        <ComplementosPage />
      </Wrapper>,
    );
    expect(
      screen.getByText(
        'Tu organización no tiene complementos habilitados. Contactá al administrador de la plataforma.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('complemento-row')).not.toBeInTheDocument();
  });

  it('data con 2 entitlements → renderiza 2 ComplementoRow con el flag activo correcto', () => {
    const ents = [
      makeEntitlement({ clave: 'contabilidad.adjuntos', nombre: 'Adjuntos', activo: true }),
      makeEntitlement({ clave: 'contabilidad.rag', nombre: 'Asistente IA', activo: false }),
    ];
    mockMisPacksGestion({ data: ents, isSuccess: true });
    render(
      <Wrapper>
        <ComplementosPage />
      </Wrapper>,
    );
    const rows = screen.getAllByTestId('complemento-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-activo', 'true');
    expect(rows[1]).toHaveAttribute('data-activo', 'false');
  });

  it('isError → banner inline visible (no toast en el cuerpo)', () => {
    mockMisPacksGestion({ isError: true, error: new Error('fail') });
    render(
      <Wrapper>
        <ComplementosPage />
      </Wrapper>,
    );
    expect(
      screen.getByText(/No se pudieron cargar los complementos/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('complemento-row')).not.toBeInTheDocument();
  });
});
