import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import * as usePermissionsModule from '@/lib/use-permissions';

import type { LoteDashboardItem } from '../api/granja.types';
import { LoteCard } from './lote-card';

// Mock global de permisos: por default todos habilitados.
function mockPermissions(permissions: string[] = [], isOwner = false) {
  vi.spyOn(usePermissionsModule, 'usePermissions').mockReturnValue({
    isOwner,
    isLoading: false,
    permissions,
    has: (p: string) => isOwner || permissions.includes(p),
    hasAll: (ps: string[]) => isOwner || ps.every((p) => permissions.includes(p)),
  } as ReturnType<typeof usePermissionsModule.usePermissions>);
}

const loteActivo: LoteDashboardItem = {
  id: 'lote-1',
  nombre: 'Lote Enero 2026',
  galpon: 'Galpón A',
  estado: 'ACTIVO',
  cantidadInicial: 5000,
  fechaIngreso: '2026-01-01',
  edadDias: 45,
  avesVivas: 4900,
  costoAcumulado: '75000.00',
  costoPorPolloVivo: '15.31',
  porcentajeMortalidad: 0.02,
};

const loteCerrado: LoteDashboardItem = {
  ...loteActivo,
  id: 'lote-2',
  estado: 'CERRADO',
};

beforeEach(() => {
  mockPermissions(
    [
      'granja.lotes.read',
      'granja.lotes.update',
      'granja.movimientos.create',
      'granja.movimientos.read',
    ],
    false,
  );
});

function renderConTooltip(ui: React.ReactNode) {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
}

describe('LoteCard — datos visibles', () => {
  it('muestra el nombre del lote', () => {
    renderConTooltip(<LoteCard lote={loteActivo} onRegistrarMovimiento={vi.fn()} onCerrar={vi.fn()} />);
    expect(screen.getByText('Lote Enero 2026')).toBeInTheDocument();
  });

  it('muestra el galpón', () => {
    renderConTooltip(<LoteCard lote={loteActivo} onRegistrarMovimiento={vi.fn()} onCerrar={vi.fn()} />);
    expect(screen.getByText('Galpón A')).toBeInTheDocument();
  });

  it('muestra la edad en días', () => {
    renderConTooltip(<LoteCard lote={loteActivo} onRegistrarMovimiento={vi.fn()} onCerrar={vi.fn()} />);
    expect(screen.getByText(/45/)).toBeInTheDocument();
  });

  it('muestra las aves vivas', () => {
    renderConTooltip(<LoteCard lote={loteActivo} onRegistrarMovimiento={vi.fn()} onCerrar={vi.fn()} />);
    expect(screen.getByText(/4900/)).toBeInTheDocument();
  });

  it('muestra el porcentaje de mortalidad', () => {
    renderConTooltip(<LoteCard lote={loteActivo} onRegistrarMovimiento={vi.fn()} onCerrar={vi.fn()} />);
    // 0.02 → 2.00%
    expect(screen.getByText(/2\.00%/)).toBeInTheDocument();
  });

  it('muestra el costo por pollo', () => {
    renderConTooltip(<LoteCard lote={loteActivo} onRegistrarMovimiento={vi.fn()} onCerrar={vi.fn()} />);
    expect(screen.getByText('Bs 15.31')).toBeInTheDocument();
  });
});

describe('LoteCard — botones de acción con permiso', () => {
  it('muestra el botón "Registrar gasto o mortalidad" con permiso granja.movimientos.create', () => {
    mockPermissions(['granja.movimientos.create', 'granja.lotes.update']);
    renderConTooltip(<LoteCard lote={loteActivo} onRegistrarMovimiento={vi.fn()} onCerrar={vi.fn()} />);
    expect(screen.getByRole('button', { name: /registrar gasto/i })).toBeInTheDocument();
  });

  it('muestra el botón "Cerrar lote" con permiso granja.lotes.update', () => {
    mockPermissions(['granja.movimientos.create', 'granja.lotes.update']);
    renderConTooltip(<LoteCard lote={loteActivo} onRegistrarMovimiento={vi.fn()} onCerrar={vi.fn()} />);
    expect(screen.getByRole('button', { name: /cerrar lote/i })).toBeInTheDocument();
  });
});

describe('LoteCard — gating de permisos', () => {
  it('"Registrar gasto o mortalidad" deshabilitado sin permiso granja.movimientos.create', () => {
    mockPermissions(['granja.lotes.update']);
    renderConTooltip(<LoteCard lote={loteActivo} onRegistrarMovimiento={vi.fn()} onCerrar={vi.fn()} />);
    expect(screen.getByRole('button', { name: /registrar gasto/i })).toBeDisabled();
  });

  it('"Cerrar lote" deshabilitado sin permiso granja.lotes.update', () => {
    mockPermissions(['granja.movimientos.create']);
    renderConTooltip(<LoteCard lote={loteActivo} onRegistrarMovimiento={vi.fn()} onCerrar={vi.fn()} />);
    expect(screen.getByRole('button', { name: /cerrar lote/i })).toBeDisabled();
  });
});

describe('LoteCard — lote CERRADO', () => {
  it('no muestra botones de acción cuando el lote está CERRADO', () => {
    mockPermissions(['granja.movimientos.create', 'granja.lotes.update']);
    renderConTooltip(<LoteCard lote={loteCerrado} onRegistrarMovimiento={vi.fn()} onCerrar={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /registrar gasto/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cerrar lote/i })).not.toBeInTheDocument();
  });

  it('muestra un badge o indicador de estado CERRADO', () => {
    renderConTooltip(<LoteCard lote={loteCerrado} onRegistrarMovimiento={vi.fn()} onCerrar={vi.fn()} />);
    expect(screen.getByText(/cerrado/i)).toBeInTheDocument();
  });
});
