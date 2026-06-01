import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import * as usePermissionsModule from '@/lib/use-permissions';

import { PermissionButton } from './permission-button';

// Mismo patrón de mock que can.test.tsx: reemplazamos usePermissions para
// controlar el estado sin tocar el backend ni el cache real.
function mockPermissions(overrides: { isOwner?: boolean; permissions?: string[] }) {
  const { isOwner = false, permissions = [] } = overrides;
  vi.spyOn(usePermissionsModule, 'usePermissions').mockReturnValue({
    isOwner,
    isLoading: false,
    permissions,
    has: (p: string) => isOwner || permissions.includes(p),
  } as unknown as ReturnType<typeof usePermissionsModule.usePermissions>);
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

describe('<PermissionButton>', () => {
  it('con permiso: renderiza el botón habilitado y dispara onClick', async () => {
    const onClick = vi.fn();
    mockPermissions({ permissions: ['contabilidad.asientos.create'] });
    const user = userEvent.setup();
    render(
      <Wrapper>
        <PermissionButton permission="contabilidad.asientos.create" onClick={onClick}>
          Nuevo comprobante
        </PermissionButton>
      </Wrapper>,
    );
    const btn = screen.getByRole('button', { name: /nuevo comprobante/i });
    expect(btn).toBeEnabled();
    await user.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('isOwner: renderiza habilitado para cualquier permiso', () => {
    mockPermissions({ isOwner: true });
    render(
      <Wrapper>
        <PermissionButton permission="contabilidad.asientos.void">Anular</PermissionButton>
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /anular/i })).toBeEnabled();
  });

  it('sin permiso: renderiza el botón deshabilitado y NO dispara onClick', async () => {
    const onClick = vi.fn();
    mockPermissions({ permissions: [] });
    const user = userEvent.setup();
    render(
      <Wrapper>
        <PermissionButton permission="contabilidad.asientos.post" onClick={onClick}>
          Contabilizar
        </PermissionButton>
      </Wrapper>,
    );
    const btn = screen.getByRole('button', { name: /contabilizar/i });
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('sin permiso: muestra el tooltip con el motivo al hacer hover', async () => {
    mockPermissions({ permissions: [] });
    const user = userEvent.setup();
    render(
      <Wrapper>
        <PermissionButton
          permission="contabilidad.asientos.post"
          deniedReason="No tenés permiso para contabilizar asientos"
        >
          Contabilizar
        </PermissionButton>
      </Wrapper>,
    );
    // El span envuelve al botón disabled para que el hover dispare el tooltip
    // (un button disabled tiene pointer-events:none y no recibiría el evento).
    await user.hover(screen.getByRole('button', { name: /contabilizar/i }).parentElement!);
    // Radix renderiza el contenido del tooltip dos veces (visible + copia
    // accesible oculta), por eso findAllByText en vez de findByText.
    const matches = await screen.findAllByText('No tenés permiso para contabilizar asientos');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});
