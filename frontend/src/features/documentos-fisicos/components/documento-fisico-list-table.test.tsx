import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DocumentoFisico } from '@/types/api';

import { DocumentoFisicoListTable } from './documento-fisico-list-table';

afterEach(() => vi.clearAllMocks());

const base: DocumentoFisico = {
  id: 'doc-1',
  numero: 'F-001',
  fechaEmision: '2026-05-01',
  monto: '1250.50',
  moneda: 'BOB',
  glosa: 'Factura de compra',
  tipoDocumentoFisico: {
    id: 'tipo-1',
    nombre: 'Factura recibida',
    codigo: 'factura-recibida',
    esTributario: true,
  },
  contacto: { id: 'cont-1', razonSocial: 'Proveedor S.R.L.' },
  organizationId: 'org-1',
  createdAt: '2026-05-01T00:00:00.000Z',
};

const sinContacto: DocumentoFisico = {
  ...base,
  id: 'doc-2',
  numero: 'INT-001',
  monto: null,
  moneda: null,
  contacto: null,
  tipoDocumentoFisico: {
    id: 'tipo-2',
    nombre: 'Comprobante interno',
    codigo: 'interno',
    esTributario: false,
  },
};

describe('DocumentoFisicoListTable', () => {
  it('isLoading=true + items=[] → muestra skeleton (no hay tabla)', () => {
    render(
      <DocumentoFisicoListTable
        items={[]}
        isLoading={true}
        onVerDetalle={vi.fn()}
        onEditar={vi.fn()}
        onEliminar={vi.fn()}
      />,
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('isLoading=false + items=[] → muestra empty state con mensaje', () => {
    render(
      <DocumentoFisicoListTable
        items={[]}
        isLoading={false}
        onVerDetalle={vi.fn()}
        onEditar={vi.fn()}
        onEliminar={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/no hay documentos físicos/i),
    ).toBeInTheDocument();
  });

  it('con items → tabla con fila y datos correctos', () => {
    render(
      <DocumentoFisicoListTable
        items={[base]}
        isLoading={false}
        onVerDetalle={vi.fn()}
        onEditar={vi.fn()}
        onEliminar={vi.fn()}
      />,
    );
    expect(screen.getByText('F-001')).toBeInTheDocument();
    expect(screen.getByText('Factura recibida')).toBeInTheDocument();
    expect(screen.getByText('Proveedor S.R.L.')).toBeInTheDocument();
  });

  it('monto null → muestra "—" en columna Monto', () => {
    render(
      <DocumentoFisicoListTable
        items={[sinContacto]}
        isLoading={false}
        onVerDetalle={vi.fn()}
        onEditar={vi.fn()}
        onEliminar={vi.fn()}
      />,
    );
    // Al menos un "—" en la tabla (monto y contacto nulos)
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('click en Ver → llama onVerDetalle con el item', async () => {
    const onVerDetalle = vi.fn();
    const user = userEvent.setup();

    render(
      <DocumentoFisicoListTable
        items={[base]}
        isLoading={false}
        onVerDetalle={onVerDetalle}
        onEditar={vi.fn()}
        onEliminar={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^ver$/i }));
    expect(onVerDetalle).toHaveBeenCalledOnce();
    expect(onVerDetalle).toHaveBeenCalledWith(base);
  });

  it('click en Editar → llama onEditar con el item', async () => {
    const onEditar = vi.fn();
    const user = userEvent.setup();

    render(
      <DocumentoFisicoListTable
        items={[base]}
        isLoading={false}
        onVerDetalle={vi.fn()}
        onEditar={onEditar}
        onEliminar={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /editar/i }));
    expect(onEditar).toHaveBeenCalledOnce();
    expect(onEditar).toHaveBeenCalledWith(base);
  });

  it('click en Eliminar → llama onEliminar con el item', async () => {
    const onEliminar = vi.fn();
    const user = userEvent.setup();

    render(
      <DocumentoFisicoListTable
        items={[base]}
        isLoading={false}
        onVerDetalle={vi.fn()}
        onEditar={vi.fn()}
        onEliminar={onEliminar}
      />,
    );

    await user.click(screen.getByRole('button', { name: /eliminar/i }));
    expect(onEliminar).toHaveBeenCalledOnce();
    expect(onEliminar).toHaveBeenCalledWith(base);
  });
});
