import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { OrgPackEntitlement } from '@/types/api';

vi.mock('../hooks/use-activar-pack', () => ({
  useActivarPack: vi.fn(),
}));

import * as useActivarPackModule from '../hooks/use-activar-pack';
import { ComplementoRow } from './complemento-row';

function mockUseActivarPack(
  overrides: Partial<ReturnType<typeof useActivarPackModule.useActivarPack>>,
) {
  vi.mocked(useActivarPackModule.useActivarPack).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isIdle: true,
    isSuccess: false,
    isError: false,
    ...overrides,
  } as ReturnType<typeof useActivarPackModule.useActivarPack>);
}

function makeEntitlement(activo: boolean): OrgPackEntitlement {
  return {
    id: 'ent-1',
    packId: 'pack-1',
    organizationId: 'org-1',
    activo,
    habilitadoPorUserId: 'user-1',
    pack: {
      id: 'pack-1',
      clave: 'contabilidad.adjuntos',
      nombre: 'Adjuntos',
      descripcion: 'Adjuntos a comprobantes',
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

describe('<ComplementoRow>', () => {
  it('switch checked refleja entitlement.activo=true', () => {
    mockUseActivarPack({});
    render(
      <Wrapper>
        <ComplementoRow entitlement={makeEntitlement(true)} />
      </Wrapper>,
    );
    const switcher = screen.getByRole('switch');
    expect(switcher).toBeChecked();
  });

  it('switch checked refleja entitlement.activo=false', () => {
    mockUseActivarPack({});
    render(
      <Wrapper>
        <ComplementoRow entitlement={makeEntitlement(false)} />
      </Wrapper>,
    );
    const switcher = screen.getByRole('switch');
    expect(switcher).not.toBeChecked();
  });

  it('onCheckedChange → mutate({ clave, activo }) con la clave del pack', async () => {
    const mutateMock = vi.fn();
    mockUseActivarPack({ mutate: mutateMock });
    render(
      <Wrapper>
        <ComplementoRow entitlement={makeEntitlement(false)} />
      </Wrapper>,
    );
    const switcher = screen.getByRole('switch');
    await userEvent.click(switcher);
    expect(mutateMock).toHaveBeenCalledWith({ clave: 'contabilidad.adjuntos', activo: true });
  });

  it('disabled cuando isPending', () => {
    mockUseActivarPack({ isPending: true });
    render(
      <Wrapper>
        <ComplementoRow entitlement={makeEntitlement(false)} />
      </Wrapper>,
    );
    const switcher = screen.getByRole('switch');
    expect(switcher).toBeDisabled();
  });
});
