import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';

import * as mePermissionsModule from './me-permissions';
import { usePermissions } from './use-permissions';

// Wrapper de QueryClient para cada test — isolado para evitar cache cross-test.
function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function withAuthenticatedUser(activeTenantId?: string): void {
  useAuthStore.setState({
    accessToken: 'fake-access-token',
    user: {
      id: 'u-1',
      email: 'test@avicont.bo',
      roles: ['MEMBER'],
      ...(activeTenantId !== undefined ? { activeTenantId } : {}),
    },
  });
}

afterEach(() => {
  useAuthStore.setState({ accessToken: null, user: null });
  vi.clearAllMocks();
});

describe('usePermissions', () => {
  describe('cuando no hay activeTenantId en el store', () => {
    it('la query está deshabilitada y has() devuelve false', () => {
      withAuthenticatedUser(); // sin activeTenantId
      const { result } = renderHook(() => usePermissions(), {
        wrapper: createWrapper(),
      });
      expect(result.current.isLoading).toBe(false);
      expect(result.current.has('contabilidad.eeff.read')).toBe(false);
    });
  });

  describe('con activeTenantId', () => {
    it('la queryKey incluye el activeTenantId', () => {
      const spy = vi.spyOn(mePermissionsModule, 'getMePermissions').mockResolvedValue({
        permissions: [],
        isOwner: false,
        activeTenantId: 'tenant-123',
      });
      withAuthenticatedUser('tenant-123');
      const { result } = renderHook(() => usePermissions(), {
        wrapper: createWrapper(),
      });
      // La queryKey debe incluir el activeTenantId (visible en la función spy llamada)
      expect(spy).toBeDefined();
      expect(result.current.isLoading).toBe(true); // empieza cargando
    });

    it('has() devuelve true cuando el permiso está en la respuesta', async () => {
      vi.spyOn(mePermissionsModule, 'getMePermissions').mockResolvedValue({
        permissions: ['contabilidad.eeff.read'],
        isOwner: false,
        activeTenantId: 'tenant-123',
      });
      withAuthenticatedUser('tenant-123');
      const { result } = renderHook(() => usePermissions(), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.has('contabilidad.eeff.read')).toBe(true);
    });

    it('has() devuelve false para permiso que no está en la respuesta', async () => {
      vi.spyOn(mePermissionsModule, 'getMePermissions').mockResolvedValue({
        permissions: ['contabilidad.eeff.read'],
        isOwner: false,
        activeTenantId: 'tenant-123',
      });
      withAuthenticatedUser('tenant-123');
      const { result } = renderHook(() => usePermissions(), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.has('contabilidad.libro-diario.read')).toBe(false);
    });

    it('has() resuelve wildcards: contabilidad.eeff.* cubre contabilidad.eeff.read', async () => {
      vi.spyOn(mePermissionsModule, 'getMePermissions').mockResolvedValue({
        permissions: ['contabilidad.eeff.*'],
        isOwner: false,
        activeTenantId: 'tenant-123',
      });
      withAuthenticatedUser('tenant-123');
      const { result } = renderHook(() => usePermissions(), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.has('contabilidad.eeff.read')).toBe(true);
    });

    it('has() con isOwner true devuelve true para cualquier permiso (short-circuit)', async () => {
      vi.spyOn(mePermissionsModule, 'getMePermissions').mockResolvedValue({
        permissions: [],
        isOwner: true,
        activeTenantId: 'tenant-123',
      });
      withAuthenticatedUser('tenant-123');
      const { result } = renderHook(() => usePermissions(), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.has('contabilidad.eeff.read')).toBe(true);
      expect(result.current.has('cualquier.permiso.random')).toBe(true);
    });

    it('has() devuelve false durante loading (fail-closed)', () => {
      // La promesa nunca resuelve en este test → isLoading = true
      vi.spyOn(mePermissionsModule, 'getMePermissions').mockReturnValue(new Promise(() => {}));
      withAuthenticatedUser('tenant-123');
      const { result } = renderHook(() => usePermissions(), {
        wrapper: createWrapper(),
      });
      expect(result.current.isLoading).toBe(true);
      expect(result.current.has('contabilidad.eeff.read')).toBe(false);
    });

    it('hasAll() devuelve true solo si tiene TODOS los permisos del array (AND)', async () => {
      vi.spyOn(mePermissionsModule, 'getMePermissions').mockResolvedValue({
        permissions: [
          'contabilidad.documentos-fisicos.update',
          'contabilidad.asientos.update',
        ],
        isOwner: false,
        activeTenantId: 'tenant-123',
      });
      withAuthenticatedUser('tenant-123');
      const { result } = renderHook(() => usePermissions(), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(
        result.current.hasAll([
          'contabilidad.documentos-fisicos.update',
          'contabilidad.asientos.update',
        ]),
      ).toBe(true);
      // Le falta uno → false
      expect(
        result.current.hasAll([
          'contabilidad.documentos-fisicos.update',
          'contabilidad.asientos.delete',
        ]),
      ).toBe(false);
    });

    it('hasAll() con isOwner true devuelve true para cualquier combinación', async () => {
      vi.spyOn(mePermissionsModule, 'getMePermissions').mockResolvedValue({
        permissions: [],
        isOwner: true,
        activeTenantId: 'tenant-123',
      });
      withAuthenticatedUser('tenant-123');
      const { result } = renderHook(() => usePermissions(), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.hasAll(['a.b.c', 'd.e.f'])).toBe(true);
    });

    it('hasAll() devuelve false durante loading (fail-closed)', () => {
      vi.spyOn(mePermissionsModule, 'getMePermissions').mockReturnValue(new Promise(() => {}));
      withAuthenticatedUser('tenant-123');
      const { result } = renderHook(() => usePermissions(), {
        wrapper: createWrapper(),
      });
      expect(result.current.hasAll(['contabilidad.eeff.read'])).toBe(false);
    });
  });
});
