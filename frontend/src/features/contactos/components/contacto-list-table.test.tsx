import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Contacto } from '@/types/api';

import { ContactoListTable } from './contacto-list-table';

const base: Contacto = {
  id: '1',
  razonSocial: 'Empresa ABC S.R.L.',
  nombreComercial: null,
  documento: null,
  esCliente: true,
  esProveedor: false,
  email: null,
  telefono: null,
  direccion: null,
  activo: true,
  createdByUserId: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('ContactoListTable', () => {
  it('muestra skeleton cuando está cargando y no hay datos', () => {
    render(<ContactoListTable contactos={[]} isLoading onSelect={vi.fn()} />);
    // Los skeletons no tienen rol semántico; verificamos que la tabla no esté
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('muestra mensaje de vacío cuando no hay contactos y no está cargando', () => {
    render(<ContactoListTable contactos={[]} isLoading={false} onSelect={vi.fn()} />);
    expect(screen.getByText('No hay contactos registrados.')).toBeInTheDocument();
  });

  it('llama onSelect con el contacto correcto al hacer click en una fila', async () => {
    const onSelect = vi.fn();
    const contactoProveedor: Contacto = {
      ...base,
      id: '2',
      razonSocial: 'Proveedor XYZ',
      esCliente: false,
      esProveedor: true,
    };
    const user = userEvent.setup();

    render(
      <ContactoListTable
        contactos={[base, contactoProveedor]}
        isLoading={false}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByText('Proveedor XYZ'));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(contactoProveedor);
  });

  it('muestra ambos badges cuando el contacto es cliente y proveedor', () => {
    const ambos: Contacto = { ...base, esCliente: true, esProveedor: true };
    render(<ContactoListTable contactos={[ambos]} isLoading={false} onSelect={vi.fn()} />);
    expect(screen.getByText('Cliente')).toBeInTheDocument();
    expect(screen.getByText('Proveedor')).toBeInTheDocument();
  });

  it('muestra placeholder cuando nombreComercial y documento son null', () => {
    render(<ContactoListTable contactos={[base]} isLoading={false} onSelect={vi.fn()} />);
    // Hay dos celdas con "—": nombreComercial y documento
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});
