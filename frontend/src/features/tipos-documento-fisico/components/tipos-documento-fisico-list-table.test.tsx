import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { TipoDocumentoFisico } from '@/types/api';

import { TiposDocumentoFisicoListTable } from './tipos-documento-fisico-list-table';

const base: TipoDocumentoFisico = {
  id: 'tdf-1',
  nombre: 'Factura recibida',
  codigo: 'factura-recibida',
  esTributario: true,
  activo: true,
  tiposComprobanteAplicables: ['DIARIO'],
  organizationId: 'org-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const inactivo: TipoDocumentoFisico = {
  ...base,
  id: 'tdf-2',
  nombre: 'Recibo',
  codigo: 'recibo',
  activo: false,
  tiposComprobanteAplicables: [],
};

describe('TiposDocumentoFisicoListTable', () => {
  it('isLoading=true + items=[] → muestra skeleton (no hay tabla)', () => {
    render(
      <TiposDocumentoFisicoListTable
        items={[]}
        isLoading={true}
        onEditar={vi.fn()}
        onDesactivar={vi.fn()}
        onActivar={vi.fn()}
      />,
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('!isLoading + items=[] → muestra empty state con mensaje', () => {
    render(
      <TiposDocumentoFisicoListTable
        items={[]}
        isLoading={false}
        onEditar={vi.fn()}
        onDesactivar={vi.fn()}
        onActivar={vi.fn()}
      />,
    );
    expect(screen.getByText(/no hay tipos de documento/i)).toBeInTheDocument();
  });

  it('fila activa → muestra nombre, código, Sí tributario, badge Activo y badge de tipo', () => {
    render(
      <TiposDocumentoFisicoListTable
        items={[base]}
        isLoading={false}
        onEditar={vi.fn()}
        onDesactivar={vi.fn()}
        onActivar={vi.fn()}
      />,
    );

    expect(screen.getByText('Factura recibida')).toBeInTheDocument();
    expect(screen.getByText('factura-recibida')).toBeInTheDocument();
    expect(screen.getByText('Sí')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.getByText('Diario')).toBeInTheDocument();
  });

  it('fila inactiva → muestra badge Inactivo y botón Activar', () => {
    render(
      <TiposDocumentoFisicoListTable
        items={[inactivo]}
        isLoading={false}
        onEditar={vi.fn()}
        onDesactivar={vi.fn()}
        onActivar={vi.fn()}
      />,
    );

    expect(screen.getByText('Inactivo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /activar/i })).toBeInTheDocument();
  });

  it('fila activa → muestra botón Desactivar', () => {
    render(
      <TiposDocumentoFisicoListTable
        items={[base]}
        isLoading={false}
        onEditar={vi.fn()}
        onDesactivar={vi.fn()}
        onActivar={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /desactivar/i })).toBeInTheDocument();
  });

  it('click Activar en fila inactiva → llama onActivar con el id (sin dialog)', async () => {
    const onActivar = vi.fn();
    const user = userEvent.setup();

    render(
      <TiposDocumentoFisicoListTable
        items={[inactivo]}
        isLoading={false}
        onEditar={vi.fn()}
        onDesactivar={vi.fn()}
        onActivar={onActivar}
      />,
    );

    await user.click(screen.getByRole('button', { name: /activar/i }));
    expect(onActivar).toHaveBeenCalledOnce();
    expect(onActivar).toHaveBeenCalledWith(inactivo.id);
  });

  it('click Desactivar en fila activa → llama onDesactivar con el tipo', async () => {
    const onDesactivar = vi.fn();
    const user = userEvent.setup();

    render(
      <TiposDocumentoFisicoListTable
        items={[base]}
        isLoading={false}
        onEditar={vi.fn()}
        onDesactivar={onDesactivar}
        onActivar={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /desactivar/i }));
    expect(onDesactivar).toHaveBeenCalledOnce();
    expect(onDesactivar).toHaveBeenCalledWith(base);
  });

  it('tiposComprobanteAplicables [] → muestra "—"', () => {
    render(
      <TiposDocumentoFisicoListTable
        items={[inactivo]}
        isLoading={false}
        onEditar={vi.fn()}
        onDesactivar={vi.fn()}
        onActivar={vi.fn()}
      />,
    );

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('togglePendingId === id de fila activa → botón Desactivar está disabled (REQ-TDF-04.3)', () => {
    render(
      <TiposDocumentoFisicoListTable
        items={[base]}
        isLoading={false}
        onEditar={vi.fn()}
        onDesactivar={vi.fn()}
        onActivar={vi.fn()}
        togglePendingId={base.id}
      />,
    );

    expect(screen.getByRole('button', { name: /desactivar/i })).toBeDisabled();
  });

  it('togglePendingId === id de fila inactiva → botón Activar está disabled (REQ-TDF-04.3)', () => {
    render(
      <TiposDocumentoFisicoListTable
        items={[inactivo]}
        isLoading={false}
        onEditar={vi.fn()}
        onDesactivar={vi.fn()}
        onActivar={vi.fn()}
        togglePendingId={inactivo.id}
      />,
    );

    expect(screen.getByRole('button', { name: /activar/i })).toBeDisabled();
  });

  it('togglePendingId de otra fila → botones de esta fila siguen habilitados', () => {
    render(
      <TiposDocumentoFisicoListTable
        items={[base, inactivo]}
        isLoading={false}
        onEditar={vi.fn()}
        onDesactivar={vi.fn()}
        onActivar={vi.fn()}
        togglePendingId={inactivo.id}
      />,
    );

    // La fila de base (activo) no está en pending → Desactivar habilitado
    expect(screen.getByRole('button', { name: 'Desactivar' })).not.toBeDisabled();
    // La fila de inactivo sí está en pending → Activar deshabilitado
    expect(screen.getByRole('button', { name: 'Activar' })).toBeDisabled();
  });
});
