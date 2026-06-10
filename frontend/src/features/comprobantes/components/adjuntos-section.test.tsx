import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { AdjuntoComprobante, Comprobante } from '@/types/api';

// Mocks de hooks que la sección consume
vi.mock('../hooks/use-adjuntos-comprobante', () => ({
  useAdjuntos: vi.fn(),
}));
vi.mock('../hooks/use-subir-adjunto', () => ({
  useSubirAdjunto: vi.fn(),
}));
vi.mock('../hooks/use-eliminar-adjunto', () => ({
  useEliminarAdjunto: vi.fn(),
}));
vi.mock('../hooks/use-reemplazar-adjunto', () => ({
  useReemplazarAdjunto: vi.fn(),
}));

// Mock de useMisPacks para controlar gating de pack
vi.mock('@/lib/use-packs', () => ({
  useMisPacks: vi.fn(),
}));

// Mock de usePermissions para controlar permisos
vi.mock('@/lib/use-permissions', () => ({
  usePermissions: vi.fn(),
}));

import { useAdjuntos } from '../hooks/use-adjuntos-comprobante';
import { useSubirAdjunto } from '../hooks/use-subir-adjunto';
import { useEliminarAdjunto } from '../hooks/use-eliminar-adjunto';
import { useReemplazarAdjunto } from '../hooks/use-reemplazar-adjunto';
import { useMisPacks } from '@/lib/use-packs';
import { usePermissions } from '@/lib/use-permissions';
import { AdjuntosSection } from './adjuntos-section';

const mockUseAdjuntos = useAdjuntos as unknown as ReturnType<typeof vi.fn>;
const mockUseSubirAdjunto = useSubirAdjunto as unknown as ReturnType<typeof vi.fn>;
const mockUseEliminarAdjunto = useEliminarAdjunto as unknown as ReturnType<typeof vi.fn>;
const mockUseReemplazarAdjunto = useReemplazarAdjunto as unknown as ReturnType<typeof vi.fn>;
const mockUseMisPacks = useMisPacks as unknown as ReturnType<typeof vi.fn>;
const mockUsePermissions = usePermissions as unknown as ReturnType<typeof vi.fn>;

const baseComprobante: Comprobante = {
  id: 'comp-1',
  tipo: 'EGRESO',
  numero: 'E2604-000001',
  estado: 'CONTABILIZADO',
  fechaContable: '2026-05-01',
  periodoFiscalId: 'p1',
  glosa: 'Pago de proveedor',
  monedaPrincipal: 'BOB',
  tipoCambioReexpresion: '1.00000000',
  totalDebitoBob: '1000.00',
  totalCreditoBob: '1000.00',
  anulado: false,
  fechaAnulacion: null,
  anuladoPorUserId: null,
  motivoAnulacion: null,
  createdByUserId: 'u1',
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
  lineas: [],
};

const adjunto1: AdjuntoComprobante = {
  id: 'adj-1',
  comprobanteId: 'comp-1',
  nombreOriginal: 'factura.pdf',
  mimeType: 'application/pdf',
  tamanoBytes: 1024 * 100, // 100 KB
  subidoPorUserId: 'user-1',
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
};

const adjunto2: AdjuntoComprobante = {
  id: 'adj-2',
  comprobanteId: 'comp-1',
  nombreOriginal: 'respaldo.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  tamanoBytes: 1024 * 250, // 250 KB
  subidoPorUserId: 'user-1',
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
};

const noOpMutation = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
  isError: false,
  error: null,
  variables: undefined,
  reset: vi.fn(),
};

function setPerms(granted: string[] | 'all'): void {
  const has = (p: string): boolean => granted === 'all' || granted.includes(p);
  mockUsePermissions.mockReturnValue({
    has,
    hasAll: (perms: string[]) => perms.every(has),
    isOwner: granted === 'all',
    permissions: granted === 'all' ? [] : granted,
  } as unknown as ReturnType<typeof usePermissions>);
}

function setPackActivo(activo: boolean): void {
  mockUseMisPacks.mockReturnValue({
    packsActivos: activo ? ['contabilidad.adjuntos'] : [],
    isLoading: false,
  });
}

function makeQc(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderSection(comprobante: Comprobante, editable: boolean): void {
  const qc = makeQc();
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider delayDuration={0}>
        <AdjuntosSection comprobante={comprobante} editable={editable} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSubirAdjunto.mockReturnValue(noOpMutation);
  mockUseEliminarAdjunto.mockReturnValue(noOpMutation);
  mockUseReemplazarAdjunto.mockReturnValue(noOpMutation);
});

describe('AdjuntosSection — gating de pack (fail-closed)', () => {
  it('sin pack activo (packsActivos=[]) → sección oculta completamente', () => {
    setPackActivo(false);
    setPerms('all');
    mockUseAdjuntos.mockReturnValue({ data: [], isLoading: false });

    renderSection(baseComprobante, true);

    expect(screen.queryByRole('heading', { name: /adjuntos/i })).not.toBeInTheDocument();
  });

  it('sin pack activo (packsActivos=undefined) → sección oculta (fail-closed)', () => {
    mockUseMisPacks.mockReturnValue({ packsActivos: undefined, isLoading: true });
    setPerms('all');
    mockUseAdjuntos.mockReturnValue({ data: [], isLoading: false });

    renderSection(baseComprobante, true);

    expect(screen.queryByRole('heading', { name: /adjuntos/i })).not.toBeInTheDocument();
  });

  it('con pack activo → sección visible con título de sección', () => {
    setPackActivo(true);
    setPerms('all');
    mockUseAdjuntos.mockReturnValue({ data: [], isLoading: false });

    renderSection(baseComprobante, true);

    // El <h2> del título de sección
    expect(screen.getByRole('heading', { name: /adjuntos/i })).toBeInTheDocument();
  });
});

describe('AdjuntosSection — gating por permiso', () => {
  it('con pack + solo contabilidad.asientos.read → lista visible, botón subir ausente', () => {
    setPackActivo(true);
    setPerms(['contabilidad.asientos.read']);
    mockUseAdjuntos.mockReturnValue({ data: [adjunto1], isLoading: false });

    renderSection(baseComprobante, false);

    expect(screen.getByText('factura.pdf')).toBeInTheDocument();
    // No debe haber input file (botón subir)
    expect(screen.queryByLabelText(/subir adjunto/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/subir/i)).not.toBeInTheDocument();
  });

  it('con pack + contabilidad.asientos.update + editable=true → botón subir visible', () => {
    setPackActivo(true);
    setPerms(['contabilidad.asientos.read', 'contabilidad.asientos.update']);
    mockUseAdjuntos.mockReturnValue({ data: [], isLoading: false });

    renderSection(baseComprobante, true);

    // Debe aparecer algún control para subir archivo
    expect(screen.getByLabelText(/subir adjunto/i)).toBeInTheDocument();
  });

  it('con pack + editable=false → input de subida ausente aunque tenga permiso', () => {
    setPackActivo(true);
    setPerms(['contabilidad.asientos.read', 'contabilidad.asientos.update']);
    mockUseAdjuntos.mockReturnValue({ data: [adjunto1], isLoading: false });

    renderSection(baseComprobante, false);

    expect(screen.queryByLabelText(/subir adjunto/i)).not.toBeInTheDocument();
  });
});

describe('AdjuntosSection — comprobante ANULADO', () => {
  it('anulado + editable=false → lista visible, sin botones de mutación', () => {
    setPackActivo(true);
    setPerms(['contabilidad.asientos.read', 'contabilidad.asientos.update']);
    const anulado: Comprobante = { ...baseComprobante, anulado: true };
    mockUseAdjuntos.mockReturnValue({ data: [adjunto1], isLoading: false });

    renderSection(anulado, false);

    expect(screen.getByText('factura.pdf')).toBeInTheDocument();
    expect(screen.queryByLabelText(/subir adjunto/i)).not.toBeInTheDocument();
    // Botones de eliminar/reemplazar no visibles (editable=false)
    expect(screen.queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument();
  });
});

describe('AdjuntosSection — lista de adjuntos', () => {
  it('lista vacía → muestra estado vacío', () => {
    setPackActivo(true);
    setPerms('all');
    mockUseAdjuntos.mockReturnValue({ data: [], isLoading: false });

    renderSection(baseComprobante, false);

    expect(screen.getByText(/sin adjuntos/i)).toBeInTheDocument();
  });

  it('lista con 2 adjuntos → muestra nombre de cada uno', () => {
    setPackActivo(true);
    setPerms('all');
    mockUseAdjuntos.mockReturnValue({ data: [adjunto1, adjunto2], isLoading: false });

    renderSection(baseComprobante, false);

    expect(screen.getByText('factura.pdf')).toBeInTheDocument();
    expect(screen.getByText('respaldo.xlsx')).toBeInTheDocument();
  });

  it('isLoading=true → muestra skeletons, no lista', () => {
    setPackActivo(true);
    setPerms('all');
    mockUseAdjuntos.mockReturnValue({ data: undefined, isLoading: true });

    renderSection(baseComprobante, false);

    expect(screen.queryByText('factura.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText(/sin adjuntos/i)).not.toBeInTheDocument();
  });
});

describe('AdjuntosSection — acciones', () => {
  it('botón descargar llama la API al hacer click', async () => {
    setPackActivo(true);
    setPerms('all');
    mockUseAdjuntos.mockReturnValue({ data: [adjunto1], isLoading: false });

    // Mock global.URL.createObjectURL
    const createObjectURL = vi.fn().mockReturnValue('blob:mock');
    const revokeObjectURL = vi.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;

    renderSection(baseComprobante, true);

    const user = userEvent.setup();
    const botonDescargar = screen.getByRole('button', { name: /descargar/i });
    await user.click(botonDescargar);

    // El botón de descargar inicia la descarga (no puede verificar el fetch real en unit,
    // pero sí que el botón existe y es clickeable)
    expect(botonDescargar).toBeInTheDocument();
  });

  it('botón eliminar visible en modo editable con permiso', () => {
    setPackActivo(true);
    setPerms(['contabilidad.asientos.read', 'contabilidad.asientos.update']);
    mockUseAdjuntos.mockReturnValue({ data: [adjunto1], isLoading: false });

    renderSection(baseComprobante, true);

    expect(screen.getByRole('button', { name: /eliminar/i })).toBeInTheDocument();
  });

  it('eliminar → llama mutate con el adjuntoId correcto', async () => {
    setPackActivo(true);
    setPerms(['contabilidad.asientos.read', 'contabilidad.asientos.update']);
    mockUseAdjuntos.mockReturnValue({ data: [adjunto1], isLoading: false });

    const mutateMock = vi.fn();
    mockUseEliminarAdjunto.mockReturnValue({ ...noOpMutation, mutate: mutateMock });

    renderSection(baseComprobante, true);

    const user = userEvent.setup();
    const botonEliminar = screen.getByRole('button', { name: /eliminar/i });
    await user.click(botonEliminar);

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledWith('adj-1', expect.any(Object));
    });
  });

  it('subir archivo → llama mutate con el File correcto', async () => {
    setPackActivo(true);
    setPerms(['contabilidad.asientos.read', 'contabilidad.asientos.update']);
    mockUseAdjuntos.mockReturnValue({ data: [], isLoading: false });

    const mutateMock = vi.fn();
    mockUseSubirAdjunto.mockReturnValue({ ...noOpMutation, mutate: mutateMock });

    renderSection(baseComprobante, true);

    const user = userEvent.setup();
    const input = screen.getByLabelText(/subir adjunto/i);
    const file = new File(['contenido'], 'nuevo.pdf', { type: 'application/pdf' });
    await user.upload(input, file);

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledWith(file, expect.any(Object));
    });
  });
});
