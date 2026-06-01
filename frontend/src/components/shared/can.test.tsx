import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as usePermissionsModule from '@/lib/use-permissions';

import { Can } from './can';

// Mock del hook usePermissions para controlar el estado en los tests.
function mockPermissions(overrides: {
  isOwner?: boolean;
  isLoading?: boolean;
  permissions?: string[];
}) {
  const { isOwner = false, isLoading = false, permissions = [] } = overrides;
  const has = (p: string): boolean => {
    if (isLoading) return false;
    if (isOwner) return true;
    return permissions.includes(p);
  };
  vi.spyOn(usePermissionsModule, 'usePermissions').mockReturnValue({
    isOwner,
    isLoading,
    permissions,
    has,
    hasAll: (perms: string[]) => perms.every(has),
  } as unknown as ReturnType<typeof usePermissionsModule.usePermissions>);
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('<Can>', () => {
  it('con isOwner: true renderiza children', () => {
    mockPermissions({ isOwner: true });
    render(
      <Wrapper>
        <Can permission="contabilidad.eeff.read">
          <span>contenido protegido</span>
        </Can>
      </Wrapper>,
    );
    expect(screen.getByText('contenido protegido')).toBeInTheDocument();
  });

  it('con permiso en la lista renderiza children', () => {
    mockPermissions({ permissions: ['contabilidad.eeff.read'] });
    render(
      <Wrapper>
        <Can permission="contabilidad.eeff.read">
          <span>contenido protegido</span>
        </Can>
      </Wrapper>,
    );
    expect(screen.getByText('contenido protegido')).toBeInTheDocument();
  });

  it('sin permiso NO renderiza children (retorna null)', () => {
    mockPermissions({ permissions: [] });
    render(
      <Wrapper>
        <Can permission="contabilidad.eeff.read">
          <span>contenido protegido</span>
        </Can>
      </Wrapper>,
    );
    expect(screen.queryByText('contenido protegido')).not.toBeInTheDocument();
  });

  it('en loading (isLoading: true) NO renderiza children (default seguro)', () => {
    mockPermissions({ isLoading: true });
    render(
      <Wrapper>
        <Can permission="contabilidad.eeff.read">
          <span>contenido protegido</span>
        </Can>
      </Wrapper>,
    );
    expect(screen.queryByText('contenido protegido')).not.toBeInTheDocument();
  });

  it('con render-prop invoca con allowed=true cuando tiene permiso', () => {
    mockPermissions({ permissions: ['contabilidad.eeff.read'] });
    render(
      <Wrapper>
        <Can permission="contabilidad.eeff.read">
          {(allowed) => <span>allowed: {String(allowed)}</span>}
        </Can>
      </Wrapper>,
    );
    expect(screen.getByText('allowed: true')).toBeInTheDocument();
  });

  it('con render-prop invoca con allowed=false cuando no tiene permiso', () => {
    mockPermissions({ permissions: [] });
    render(
      <Wrapper>
        <Can permission="contabilidad.eeff.read">
          {(allowed) => <span>allowed: {String(allowed)}</span>}
        </Can>
      </Wrapper>,
    );
    expect(screen.getByText('allowed: false')).toBeInTheDocument();
  });

  it('acepta fallback prop y lo renderiza cuando no tiene permiso', () => {
    mockPermissions({ permissions: [] });
    render(
      <Wrapper>
        <Can permission="contabilidad.eeff.read" fallback={<span>sin acceso</span>}>
          <span>contenido protegido</span>
        </Can>
      </Wrapper>,
    );
    expect(screen.queryByText('contenido protegido')).not.toBeInTheDocument();
    expect(screen.getByText('sin acceso')).toBeInTheDocument();
  });

  describe('con array de permisos (AND)', () => {
    it('renderiza children solo si tiene TODOS los permisos', () => {
      mockPermissions({
        permissions: [
          'contabilidad.documentos-fisicos.update',
          'contabilidad.asientos.update',
        ],
      });
      render(
        <Wrapper>
          <Can
            permission={[
              'contabilidad.documentos-fisicos.update',
              'contabilidad.asientos.update',
            ]}
          >
            <span>contenido protegido</span>
          </Can>
        </Wrapper>,
      );
      expect(screen.getByText('contenido protegido')).toBeInTheDocument();
    });

    it('NO renderiza children si falta alguno de los permisos', () => {
      mockPermissions({ permissions: ['contabilidad.documentos-fisicos.update'] });
      render(
        <Wrapper>
          <Can
            permission={[
              'contabilidad.documentos-fisicos.update',
              'contabilidad.asientos.update',
            ]}
          >
            <span>contenido protegido</span>
          </Can>
        </Wrapper>,
      );
      expect(screen.queryByText('contenido protegido')).not.toBeInTheDocument();
    });

    it('render-prop recibe allowed=false si falta alguno', () => {
      mockPermissions({ permissions: ['contabilidad.asientos.update'] });
      render(
        <Wrapper>
          <Can
            permission={[
              'contabilidad.documentos-fisicos.update',
              'contabilidad.asientos.update',
            ]}
          >
            {(allowed) => <span>allowed: {String(allowed)}</span>}
          </Can>
        </Wrapper>,
      );
      expect(screen.getByText('allowed: false')).toBeInTheDocument();
    });
  });
});
