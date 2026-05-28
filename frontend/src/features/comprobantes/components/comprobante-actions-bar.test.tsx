import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Comprobante } from '@/types/api';

import { ComprobanteActionsBar } from './comprobante-actions-bar';

const baseComprobante: Comprobante = {
  id: 'comp-1',
  tipo: 'DIARIO',
  numero: null,
  estado: 'BORRADOR',
  fechaContable: '2026-05-27',
  periodoFiscalId: 'p1',
  glosa: 'Pago de servicios',
  monedaPrincipal: 'BOB',
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
  it('BORRADOR: muestra Editar, Contabilizar, Eliminar', () => {
    render(
      <ComprobanteActionsBar
        comprobante={{ ...baseComprobante, estado: 'BORRADOR' }}
        {...defaultProps}
      />,
    );
    expect(screen.getByRole('button', { name: /editar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /contabilizar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /eliminar/i })).toBeInTheDocument();
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
