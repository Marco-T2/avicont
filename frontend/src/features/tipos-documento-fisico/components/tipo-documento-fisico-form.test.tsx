import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { TipoDocumentoFisico } from '@/types/api';

import { TipoDocumentoFisicoForm } from './tipo-documento-fisico-form';

function wrapper(): (props: { children: React.ReactNode }) => React.JSX.Element {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const SAMPLE: TipoDocumentoFisico = {
  id: 'tdf-1',
  nombre: 'Factura recibida',
  codigo: 'factura-recibida',
  esTributario: true,
  activo: true,
  tiposComprobanteAplicables: ['DIARIO', 'INGRESO'],
  organizationId: 'org-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('TipoDocumentoFisicoForm', () => {
  // mode=create: campos habilitados, botón "Crear tipo"
  it('en modo create renderiza nombre y código habilitados y botón Crear tipo', () => {
    render(
      <TipoDocumentoFisicoForm mode="create" onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper: wrapper() },
    );

    expect(screen.getByLabelText(/nombre/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/código/i)).not.toBeDisabled();
    expect(
      screen.getByRole('button', { name: /crear tipo/i }),
    ).toBeInTheDocument();
  });

  // mode=create: los 7 labels del checkbox group presentes
  it('en modo create muestra los 7 tipos de comprobante como opciones', () => {
    render(
      <TipoDocumentoFisicoForm mode="create" onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper: wrapper() },
    );

    expect(screen.getByText('Apertura')).toBeInTheDocument();
    expect(screen.getByText('Diario')).toBeInTheDocument();
    expect(screen.getByText('Ingreso')).toBeInTheDocument();
    expect(screen.getByText('Egreso')).toBeInTheDocument();
    expect(screen.getByText('Ajuste / reversión')).toBeInTheDocument();
    expect(screen.getByText('Traspaso')).toBeInTheDocument();
    expect(screen.getByText('Cierre')).toBeInTheDocument();
  });

  // mode=create: marcar un TipoComprobante → onSubmit recibe el valor
  it('en modo create marcar un tipo de comprobante y hacer submit incluye el valor', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <TipoDocumentoFisicoForm mode="create" onSubmit={onSubmit} isSubmitting={false} />,
      { wrapper: wrapper() },
    );

    // Completar campos requeridos para pasar la validación
    await user.type(screen.getByLabelText(/nombre/i), 'Mi tipo');
    await user.type(screen.getByLabelText(/código/i), 'mi-tipo');

    // Marcar "Diario" en el checkbox group
    const diarioCheckbox = screen.getByRole('checkbox', { name: /diario/i });
    await user.click(diarioCheckbox);

    await user.click(screen.getByRole('button', { name: /crear tipo/i }));

    expect(onSubmit).toHaveBeenCalledOnce();
    const callArg = onSubmit.mock.calls[0]?.[0] as { tiposComprobanteAplicables: string[] };
    expect(callArg.tiposComprobanteAplicables).toContain('DIARIO');
  });

  // mode=edit: campos pre-poblados
  it('en modo edit precarga los campos con initialData', () => {
    render(
      <TipoDocumentoFisicoForm
        mode="edit"
        initialData={SAMPLE}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
      { wrapper: wrapper() },
    );

    expect(screen.getByDisplayValue('Factura recibida')).toBeInTheDocument();
    expect(screen.getByDisplayValue('factura-recibida')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /guardar cambios/i }),
    ).toBeInTheDocument();
  });

  // mode=edit: campo código disabled
  it('en modo edit el campo código está deshabilitado', () => {
    render(
      <TipoDocumentoFisicoForm
        mode="edit"
        initialData={SAMPLE}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
      { wrapper: wrapper() },
    );

    // El input de código está disabled en modo edit
    const codigoInput = screen.getByDisplayValue('factura-recibida');
    expect(codigoInput).toBeDisabled();
  });

  // isSubmitting=true → botón submit disabled
  it('con isSubmitting=true el botón de submit queda deshabilitado', () => {
    render(
      <TipoDocumentoFisicoForm mode="create" onSubmit={vi.fn()} isSubmitting={true} />,
      { wrapper: wrapper() },
    );

    // Cuando está enviando, el botón muestra "Guardando..." o similar y está disabled
    const submitBtn = screen.getByRole('button', { name: /guardando/i });
    expect(submitBtn).toBeDisabled();
  });

  // mode=edit: checkbox activo presente y refleja initialData.activo
  it('en modo edit muestra el checkbox activo con el valor correcto', () => {
    render(
      <TipoDocumentoFisicoForm
        mode="edit"
        initialData={{ ...SAMPLE, activo: false }}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
      { wrapper: wrapper() },
    );

    const activoCheckbox = screen.getByRole('checkbox', { name: /activo/i });
    expect(activoCheckbox).toBeInTheDocument();
    // activo: false → no chequeado
    expect(activoCheckbox).not.toBeChecked();
  });

  // mode=create: campo activo NO presente
  it('en modo create no muestra el checkbox activo', () => {
    render(
      <TipoDocumentoFisicoForm mode="create" onSubmit={vi.fn()} isSubmitting={false} />,
      { wrapper: wrapper() },
    );

    // El checkbox de activo solo aparece en modo edit
    expect(screen.queryByRole('checkbox', { name: /activo/i })).not.toBeInTheDocument();
  });
});
