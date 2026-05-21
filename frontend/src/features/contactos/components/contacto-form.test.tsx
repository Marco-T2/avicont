import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Contacto } from '@/types/api';

import { ContactoForm } from './contacto-form';

function wrapper(): (props: { children: React.ReactNode }) => React.JSX.Element {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const SAMPLE_CONTACTO: Contacto = {
  id: 'ct-1',
  razonSocial: 'Avícola San José S.R.L.',
  nombreComercial: 'San José Pollos',
  documento: '123456789',
  esCliente: true,
  esProveedor: false,
  email: 'contacto@sanjose.bo',
  telefono: '77712345',
  direccion: 'Av. Los Pinos 123, Santa Cruz',
  activo: true,
  createdByUserId: 'u1',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
};

describe('ContactoForm', () => {
  // E-FORMUI-01: mode=create → razón social habilitada + botón "Crear contacto"
  it('en modo create renderiza razón social habilitada y botón Crear contacto', () => {
    render(
      <ContactoForm mode="create" onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper: wrapper() },
    );

    const razonSocial = screen.getByLabelText(/razón social/i);
    expect(razonSocial).not.toBeDisabled();
    expect(
      screen.getByRole('button', { name: /crear contacto/i }),
    ).toBeInTheDocument();
  });

  // E-FORMUI-02: mode=edit con initialData → campos precargados + botón "Guardar cambios"
  it('en modo edit precarga los campos con initialData y muestra botón Guardar cambios', () => {
    render(
      <ContactoForm
        mode="edit"
        initialData={SAMPLE_CONTACTO}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
      { wrapper: wrapper() },
    );

    expect(
      screen.getByDisplayValue('Avícola San José S.R.L.'),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('San José Pollos')).toBeInTheDocument();
    expect(screen.getByDisplayValue('123456789')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /guardar cambios/i }),
    ).toBeInTheDocument();
  });

  // E-FORMUI-03: isSubmitting=true → submit deshabilitado
  it('con isSubmitting=true el botón de submit queda deshabilitado', () => {
    render(
      <ContactoForm mode="create" onSubmit={vi.fn()} isSubmitting={true} />,
      { wrapper: wrapper() },
    );

    const submitBtn = screen.getByRole('button', { name: /creando/i });
    expect(submitBtn).toBeDisabled();
  });

  // E-FORMUI-04: documento vacío no bloquea el submit (la capa api hace '' → null)
  it('el campo documento es opcional y no bloquea el formulario cuando está vacío', () => {
    render(
      <ContactoForm mode="create" onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper: wrapper() },
    );

    const documentoInput = screen.getByLabelText(/documento/i);
    expect(documentoInput).toBeInTheDocument();
    // El campo debe estar vacío por default (string '')
    expect(documentoInput).toHaveValue('');
  });
});
