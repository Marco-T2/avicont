import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSIONS } from '@/lib/permissions';
import type { FeatureFlag } from '@/types/api';

import { FeatureFlagRow } from './feature-flag-row';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const { hasMock } = vi.hoisted(() => ({
  hasMock: vi.fn<(permiso: string) => boolean>(() => true),
}));

vi.mock('@/lib/use-permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/use-permissions')>()),
  usePermissions: () => ({
    has: hasMock,
    hasAll: () => true,
    isOwner: false,
    permissions: [],
  }),
}));

function wrapper(): (props: { children: React.ReactNode }) => React.JSX.Element {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const FLAG: FeatureFlag = {
  id: 'ff-1',
  key: 'contabilidad_features',
  name: 'Contabilidad',
  description: 'Módulo contable completo',
  enabled: true,
} as FeatureFlag;

// El gating del toggle es lógica custom (un Switch no es <Button>, así que no
// pasa por PermissionButton): va testeado, §14.7. Importa desde que los
// endpoints de flags exigen `organizacion.feature-flags.*` — antes exigían un
// permiso fuera del catálogo y sólo entraba OWNER/ADMIN con wildcard, así que
// el caso "puede ver pero no editar" era imposible.
describe('FeatureFlagRow — gating del toggle', () => {
  it('habilita el switch cuando el usuario tiene el permiso de update', () => {
    hasMock.mockImplementation((p) => p === PERMISSIONS.organizacion.featureFlags.update);

    render(<FeatureFlagRow flag={FLAG} hasOverride={false} />, { wrapper: wrapper() });

    expect(screen.getByRole('switch')).toBeEnabled();
  });

  it('deshabilita el switch cuando falta el permiso de update', () => {
    hasMock.mockImplementation(() => false);

    render(<FeatureFlagRow flag={FLAG} hasOverride={false} />, { wrapper: wrapper() });

    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('el permiso de lectura por sí solo no habilita el toggle', () => {
    hasMock.mockImplementation((p) => p === PERMISSIONS.organizacion.featureFlags.read);

    render(<FeatureFlagRow flag={FLAG} hasOverride={false} />, { wrapper: wrapper() });

    expect(screen.getByRole('switch')).toBeDisabled();
  });
});
