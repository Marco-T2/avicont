import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrgPackEntitlement, Pack, PlatformOrg } from '@/types/api';

// RED: estos mocks van a fallar hasta que se creen los hooks y el componente
vi.mock('../hooks/use-packs-catalogo', () => ({
  usePacksCatalogo: vi.fn(),
}));

vi.mock('../hooks/use-org-packs', () => ({
  useOrgPacks: vi.fn(),
}));

vi.mock('../hooks/use-habilitar-pack', () => ({
  useHabilitarPack: vi.fn(),
}));

vi.mock('../hooks/use-revocar-pack', () => ({
  useRevocarPack: vi.fn(),
}));

import { usePacksCatalogo } from '../hooks/use-packs-catalogo';
import { useOrgPacks } from '../hooks/use-org-packs';
import { useHabilitarPack } from '../hooks/use-habilitar-pack';
import { useRevocarPack } from '../hooks/use-revocar-pack';
import { OrgPacksSheet } from './org-packs-sheet';

// --- fixtures ---

const PACK_CONTABILIDAD_ADJUNTOS: Pack = {
  id: 'pack-1',
  clave: 'contabilidad.adjuntos',
  nombre: 'Adjuntos a comprobantes',
  descripcion: 'Subí archivos adjuntos a tus comprobantes contables.',
  verticalAplicable: 'CONTABILIDAD',
  tipo: 'CAPACIDAD',
  activo: true,
};

const PACK_CONTABILIDAD_RAG: Pack = {
  id: 'pack-2',
  clave: 'contabilidad.rag',
  nombre: 'Asistente contable (RAG)',
  descripcion: 'IA que responde preguntas sobre tus asientos.',
  verticalAplicable: 'CONTABILIDAD',
  tipo: 'CAPACIDAD',
  activo: true,
};

const PACK_GRANJA_RAG: Pack = {
  id: 'pack-3',
  clave: 'granja.rag',
  nombre: 'Asistente granja (RAG)',
  descripcion: 'IA para el módulo de granja.',
  verticalAplicable: 'GRANJA',
  tipo: 'CAPACIDAD',
  activo: true,
};

const ORG_CONTABILIDAD: PlatformOrg = {
  id: 'org-1',
  name: 'Avícola del Valle',
  slug: 'avicola-del-valle',
  status: 'ACTIVE',
  plan: 'FREE',
  contabilidadEnabled: true,
  granjaEnabled: false,
  createdAt: '2026-06-01T10:00:00Z',
};

const ORG_GRANJA: PlatformOrg = {
  id: 'org-2',
  name: 'Granja San José',
  slug: 'granja-san-jose',
  status: 'ACTIVE',
  plan: 'FREE',
  contabilidadEnabled: false,
  granjaEnabled: true,
  createdAt: '2026-06-01T10:00:00Z',
};

const ENTITLEMENT_ADJUNTOS: OrgPackEntitlement = {
  id: 'ent-1',
  organizationId: 'org-1',
  packId: 'pack-1',
  activo: false,
  habilitadoPorUserId: 'user-sa',
  pack: PACK_CONTABILIDAD_ADJUNTOS,
};

type QueryStub<T> = {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
};

type MutationStub = {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
};

function mockQueryStub<T>(data?: T): QueryStub<T> {
  return { data, isLoading: false, isError: false };
}

function mockMutationStub(overrides: Partial<MutationStub> = {}): MutationStub {
  return { mutate: vi.fn(), isPending: false, ...overrides };
}

describe('OrgPacksSheet', () => {
  beforeEach(() => {
    vi.mocked(usePacksCatalogo).mockReset();
    vi.mocked(useOrgPacks).mockReset();
    vi.mocked(useHabilitarPack).mockReset();
    vi.mocked(useRevocarPack).mockReset();
  });

  describe('org CONTABILIDAD con 2 packs CONTABILIDAD (1 habilitado, 1 no)', () => {
    beforeEach(() => {
      vi.mocked(usePacksCatalogo).mockReturnValue(
        mockQueryStub([PACK_CONTABILIDAD_ADJUNTOS, PACK_CONTABILIDAD_RAG, PACK_GRANJA_RAG]) as ReturnType<typeof usePacksCatalogo>,
      );
      vi.mocked(useOrgPacks).mockReturnValue(
        mockQueryStub([ENTITLEMENT_ADJUNTOS]) as ReturnType<typeof useOrgPacks>,
      );
      vi.mocked(useHabilitarPack).mockReturnValue(
        mockMutationStub() as unknown as ReturnType<typeof useHabilitarPack>,
      );
      vi.mocked(useRevocarPack).mockReturnValue(
        mockMutationStub() as unknown as ReturnType<typeof useRevocarPack>,
      );
    });

    it('muestra badge "Habilitado" y botón "Revocar" para el pack con entitlement', () => {
      render(
        <OrgPacksSheet
          org={ORG_CONTABILIDAD}
          open
          onOpenChange={vi.fn()}
        />,
      );

      expect(screen.getByText('Habilitado')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /revocar/i })).toBeInTheDocument();
    });

    it('muestra botón "Habilitar" para el pack sin entitlement', () => {
      render(
        <OrgPacksSheet
          org={ORG_CONTABILIDAD}
          open
          onOpenChange={vi.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: /habilitar/i })).toBeInTheDocument();
    });

    it('NO muestra los packs de GRANJA para una org CONTABILIDAD', () => {
      render(
        <OrgPacksSheet
          org={ORG_CONTABILIDAD}
          open
          onOpenChange={vi.fn()}
        />,
      );

      expect(screen.queryByText('Asistente granja (RAG)')).not.toBeInTheDocument();
    });

    it('click "Habilitar" llama a mutate con { orgId, clave } (no el id del pack)', async () => {
      const mutateHabilitar = vi.fn();
      vi.mocked(useHabilitarPack).mockReturnValue(
        { mutate: mutateHabilitar, isPending: false } as unknown as ReturnType<typeof useHabilitarPack>,
      );
      const user = userEvent.setup();
      render(
        <OrgPacksSheet
          org={ORG_CONTABILIDAD}
          open
          onOpenChange={vi.fn()}
        />,
      );

      await user.click(screen.getByRole('button', { name: /habilitar/i }));

      await waitFor(() => expect(mutateHabilitar).toHaveBeenCalledTimes(1));
      expect(mutateHabilitar).toHaveBeenCalledWith({
        orgId: ORG_CONTABILIDAD.id,
        clave: PACK_CONTABILIDAD_RAG.clave,
      });
    });

    it('click "Revocar" llama a mutate con { orgId, packId }', async () => {
      const mutateRevocar = vi.fn();
      vi.mocked(useRevocarPack).mockReturnValue(
        { mutate: mutateRevocar, isPending: false } as unknown as ReturnType<typeof useRevocarPack>,
      );
      const user = userEvent.setup();
      render(
        <OrgPacksSheet
          org={ORG_CONTABILIDAD}
          open
          onOpenChange={vi.fn()}
        />,
      );

      await user.click(screen.getByRole('button', { name: /revocar/i }));

      await waitFor(() => expect(mutateRevocar).toHaveBeenCalledTimes(1));
      expect(mutateRevocar).toHaveBeenCalledWith({
        orgId: ORG_CONTABILIDAD.id,
        packId: ENTITLEMENT_ADJUNTOS.id,
      });
    });

    it('botón deshabilitado cuando isPending de habilitar', () => {
      vi.mocked(useHabilitarPack).mockReturnValue(
        { mutate: vi.fn(), isPending: true } as unknown as ReturnType<typeof useHabilitarPack>,
      );
      render(
        <OrgPacksSheet
          org={ORG_CONTABILIDAD}
          open
          onOpenChange={vi.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: /habilitar/i })).toBeDisabled();
    });
  });

  describe('filtro de vertical', () => {
    it('org GRANJA solo muestra packs con verticalAplicable === "GRANJA"', () => {
      vi.mocked(usePacksCatalogo).mockReturnValue(
        mockQueryStub([PACK_CONTABILIDAD_ADJUNTOS, PACK_CONTABILIDAD_RAG, PACK_GRANJA_RAG]) as ReturnType<typeof usePacksCatalogo>,
      );
      vi.mocked(useOrgPacks).mockReturnValue(
        mockQueryStub([]) as ReturnType<typeof useOrgPacks>,
      );
      vi.mocked(useHabilitarPack).mockReturnValue(
        mockMutationStub() as unknown as ReturnType<typeof useHabilitarPack>,
      );
      vi.mocked(useRevocarPack).mockReturnValue(
        mockMutationStub() as unknown as ReturnType<typeof useRevocarPack>,
      );

      render(
        <OrgPacksSheet
          org={ORG_GRANJA}
          open
          onOpenChange={vi.fn()}
        />,
      );

      expect(screen.getByText('Asistente granja (RAG)')).toBeInTheDocument();
      expect(screen.queryByText('Adjuntos a comprobantes')).not.toBeInTheDocument();
      expect(screen.queryByText('Asistente contable (RAG)')).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('org sin vertical muestra empty state apropiado', () => {
      vi.mocked(usePacksCatalogo).mockReturnValue(
        mockQueryStub([PACK_CONTABILIDAD_ADJUNTOS]) as ReturnType<typeof usePacksCatalogo>,
      );
      vi.mocked(useOrgPacks).mockReturnValue(
        mockQueryStub([]) as ReturnType<typeof useOrgPacks>,
      );
      vi.mocked(useHabilitarPack).mockReturnValue(
        mockMutationStub() as unknown as ReturnType<typeof useHabilitarPack>,
      );
      vi.mocked(useRevocarPack).mockReturnValue(
        mockMutationStub() as unknown as ReturnType<typeof useRevocarPack>,
      );

      const orgOtros: PlatformOrg = {
        ...ORG_CONTABILIDAD,
        contabilidadEnabled: false,
        granjaEnabled: false,
      };

      render(
        <OrgPacksSheet
          org={orgOtros}
          open
          onOpenChange={vi.fn()}
        />,
      );

      expect(
        screen.getByText(/no tiene un vertical activo/i),
      ).toBeInTheDocument();
    });
  });

  describe('integración con orgs-page', () => {
    it('el sheet renderiza el título con el nombre de la org', () => {
      vi.mocked(usePacksCatalogo).mockReturnValue(
        mockQueryStub([]) as ReturnType<typeof usePacksCatalogo>,
      );
      vi.mocked(useOrgPacks).mockReturnValue(
        mockQueryStub([]) as ReturnType<typeof useOrgPacks>,
      );
      vi.mocked(useHabilitarPack).mockReturnValue(
        mockMutationStub() as unknown as ReturnType<typeof useHabilitarPack>,
      );
      vi.mocked(useRevocarPack).mockReturnValue(
        mockMutationStub() as unknown as ReturnType<typeof useRevocarPack>,
      );

      render(
        <OrgPacksSheet
          org={ORG_CONTABILIDAD}
          open
          onOpenChange={vi.fn()}
        />,
      );

      expect(screen.getByText(/avícola del valle/i)).toBeInTheDocument();
    });
  });
});
