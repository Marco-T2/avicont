import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import * as usePermissionsModule from '@/lib/use-permissions';
import type { Comprobante } from '@/types/api';

import { ComprobanteActionsBar } from './comprobante-actions-bar';

// La barra usa <PermissionButton> (vía <Can> → usePermissions). Por default
// concedemos todos los permisos para que los smoke tests de visibilidad sigan
// asertando los botones habilitados; los tests de gating sobreescriben el mock.
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
  mockPermissions();
});

const baseComprobante: Comprobante = {
  id: 'comp-1',
  tipo: 'DIARIO',
  numero: null,
  estado: 'BORRADOR',
  fechaContable: '2026-05-27',
  periodoFiscalId: 'p1',
  glosa: 'Pago de servicios',
  monedaPrincipal: 'BOB',
  tipoCambioReexpresion: '1.00000000',
  totalDebitoBob: '1000.00',
  totalCreditoBob: '1000.00',
  anulado: false,
  fechaAnulacion: null,
  anuladoPorUserId: null,
  motivoAnulacion: null,
  createdByUserId: 'u1',
  createdAt: '2026-05-27T00:00:00Z',
  updatedAt: '2026-05-27T00:00:00Z',
  lineas: [],
};

const defaultProps = {
  onEdit: vi.fn(),
  onContabilizar: vi.fn(),
  onAnular: vi.fn(),
  onEliminar: vi.fn(),
  onVerAuditoria: vi.fn(),
};

describe('ComprobanteActionsBar (smoke)', () => {
  it('BORRADOR: muestra Editar, Contabilizar, Eliminar, Ver auditoría', () => {
    render(
      <ComprobanteActionsBar
        comprobante={{ ...baseComprobante, estado: 'BORRADOR' }}
        {...defaultProps}
      />,
    );
    expect(screen.getByRole('button', { name: /editar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /contabilizar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /eliminar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /auditoría/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /anular/i })).not.toBeInTheDocument();
  });

  it('CONTABILIZADO (no anulado): muestra Editar, Anular, Ver auditoría', () => {
    render(
      <ComprobanteActionsBar
        comprobante={{ ...baseComprobante, estado: 'CONTABILIZADO', numero: 'D2604-000042' }}
        {...defaultProps}
      />,
    );
    expect(screen.getByRole('button', { name: /editar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /anular/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /auditoría/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /contabilizar/i })).not.toBeInTheDocument();
  });

  it('CONTABILIZADO anulado: solo Ver auditoría', () => {
    render(
      <ComprobanteActionsBar
        comprobante={{
          ...baseComprobante,
          estado: 'CONTABILIZADO',
          anulado: true,
          fechaAnulacion: '2026-05-10T00:00:00Z',
        }}
        {...defaultProps}
      />,
    );
    expect(screen.getByRole('button', { name: /auditoría/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /anular/i })).not.toBeInTheDocument();
  });

  it('BLOQUEADO: solo Ver auditoría', () => {
    render(
      <ComprobanteActionsBar
        comprobante={{ ...baseComprobante, estado: 'BLOQUEADO' }}
        {...defaultProps}
      />,
    );
    expect(screen.getByRole('button', { name: /auditoría/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
  });
});

describe('ComprobanteActionsBar — gating de permisos', () => {
  function renderConPermisos(
    comprobante: Comprobante,
    permissions: string[],
  ) {
    mockPermissions({ isOwner: false, permissions });
    return render(
      <TooltipProvider delayDuration={0}>
        <ComprobanteActionsBar comprobante={comprobante} {...defaultProps} />
      </TooltipProvider>,
    );
  }

  it('BORRADOR sin permisos de escritura: Editar/Contabilizar/Eliminar deshabilitados', () => {
    renderConPermisos(
      { ...baseComprobante, estado: 'BORRADOR' },
      ['contabilidad.asientos.read'],
    );
    expect(screen.getByRole('button', { name: /editar/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /contabilizar/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /eliminar/i })).toBeDisabled();
    // "Ver auditoría" no se gatea — sigue habilitado.
    expect(screen.getByRole('button', { name: /auditoría/i })).toBeEnabled();
  });

  it('BORRADOR con solo post: Contabilizar habilitado, Editar/Eliminar deshabilitados', () => {
    renderConPermisos(
      { ...baseComprobante, estado: 'BORRADOR' },
      ['contabilidad.asientos.post'],
    );
    expect(screen.getByRole('button', { name: /contabilizar/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /editar/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /eliminar/i })).toBeDisabled();
  });

  it('CONTABILIZADO sin void: Anular deshabilitado; con update: Editar habilitado', () => {
    renderConPermisos(
      { ...baseComprobante, estado: 'CONTABILIZADO', numero: 'D2604-000042' },
      ['contabilidad.asientos.update'],
    );
    expect(screen.getByRole('button', { name: /editar/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /anular/i })).toBeDisabled();
  });
});
