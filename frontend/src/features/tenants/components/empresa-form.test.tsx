import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';

import { EmpresaForm } from './empresa-form';

// Helper: envuelve en TooltipProvider (necesario cuando el Select disabled dispara tooltip).
function renderForm(props: Parameters<typeof EmpresaForm>[0]) {
  return render(
    <TooltipProvider>
      <EmpresaForm {...props} />
    </TooltipProvider>,
  );
}

// defaultValues base con tipoEmpresaPrincipal válido para evitar error de schema en otros tests.
const BASE_DEFAULTS = { tipoEmpresaPrincipal: 'COMERCIAL' as const };

describe('EmpresaForm', () => {
  it('renderiza el campo NIT con su label accesible', () => {
    renderForm({
      defaultValues: BASE_DEFAULTS,
      onSubmit: vi.fn(),
      isPending: false,
      tipoEmpresaEditable: true,
    });
    expect(screen.getByLabelText(/NIT/i)).toBeInTheDocument();
  });

  it('renderiza el campo email con su label accesible', () => {
    renderForm({
      defaultValues: BASE_DEFAULTS,
      onSubmit: vi.fn(),
      isPending: false,
      tipoEmpresaEditable: true,
    });
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it('renderiza el campo razón social con su label accesible', () => {
    renderForm({
      defaultValues: BASE_DEFAULTS,
      onSubmit: vi.fn(),
      isPending: false,
      tipoEmpresaEditable: true,
    });
    expect(screen.getByLabelText(/razón social/i)).toBeInTheDocument();
  });

  it('NIT inválido muestra mensaje de error en español', async () => {
    const user = userEvent.setup();
    renderForm({
      defaultValues: BASE_DEFAULTS,
      onSubmit: vi.fn(),
      isPending: false,
      tipoEmpresaEditable: true,
    });
    const nitInput = screen.getByLabelText(/NIT/i);
    await user.type(nitInput, '12345AB');
    await user.click(screen.getByRole('button', { name: /guardar/i }));
    expect(
      await screen.findByText(/El NIT debe tener entre 7 y 12 dígitos/i),
    ).toBeInTheDocument();
  });

  it('email malformado muestra mensaje de error en español', async () => {
    const user = userEvent.setup();
    renderForm({
      defaultValues: BASE_DEFAULTS,
      onSubmit: vi.fn(),
      isPending: false,
      tipoEmpresaEditable: true,
    });
    const emailInput = screen.getByLabelText(/email/i);
    await user.type(emailInput, 'no-es-un-email');
    await user.click(screen.getByRole('button', { name: /guardar/i }));
    expect(await screen.findByText(/Email inválido/i)).toBeInTheDocument();
  });

  it('botón de guardar está deshabilitado cuando isPending es true (Anti-F-07)', () => {
    renderForm({
      defaultValues: BASE_DEFAULTS,
      onSubmit: vi.fn(),
      isPending: true,
      tipoEmpresaEditable: true,
    });
    const button = screen.getByRole('button', { name: /guardando/i });
    expect(button).toBeDisabled();
  });

  it('botón de guardar está habilitado cuando isPending es false', () => {
    renderForm({
      defaultValues: BASE_DEFAULTS,
      onSubmit: vi.fn(),
      isPending: false,
      tipoEmpresaEditable: true,
    });
    const button = screen.getByRole('button', { name: /guardar cambios/i });
    expect(button).not.toBeDisabled();
  });

  it('los valores iniciales aparecen precargados en los campos', () => {
    renderForm({
      defaultValues: {
        tipoEmpresaPrincipal: 'COMERCIAL',
        razonSocial: 'Avicultura Norte S.R.L.',
        nit: '1234567',
      },
      onSubmit: vi.fn(),
      isPending: false,
      tipoEmpresaEditable: true,
    });
    expect(screen.getByDisplayValue('Avicultura Norte S.R.L.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1234567')).toBeInTheDocument();
  });

  it('submit con datos válidos llama onSubmit una sola vez', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderForm({
      defaultValues: {
        tipoEmpresaPrincipal: 'COMERCIAL',
        razonSocial: 'Mi Empresa',
        nit: '1234567',
      },
      onSubmit,
      isPending: false,
      tipoEmpresaEditable: true,
    });
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));
    // Wait for async validation
    await screen.findByRole('button', { name: /guardar cambios/i });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('EmpresaForm — Select tipoEmpresaPrincipal (D1)', () => {
  it('renderiza el select de tipo de empresa con su label', () => {
    renderForm({
      defaultValues: BASE_DEFAULTS,
      onSubmit: vi.fn(),
      isPending: false,
      tipoEmpresaEditable: true,
    });
    expect(screen.getByLabelText(/tipo de empresa/i)).toBeInTheDocument();
  });

  it('el select muestra los 8 tipos de empresa disponibles', async () => {
    const user = userEvent.setup();
    renderForm({
      defaultValues: BASE_DEFAULTS,
      onSubmit: vi.fn(),
      isPending: false,
      tipoEmpresaEditable: true,
    });
    // Abre el select
    await user.click(screen.getByRole('combobox', { name: /tipo de empresa/i }));
    const opciones = ['Comercial', 'Servicios', 'Transporte', 'Industrial', 'Petrolera', 'Construcción', 'Agropecuaria', 'Minera'];
    for (const opcion of opciones) {
      expect(await screen.findByRole('option', { name: opcion })).toBeInTheDocument();
    }
  });

  it('cuando tipoEmpresaEditable es false el select está deshabilitado', () => {
    renderForm({
      defaultValues: BASE_DEFAULTS,
      onSubmit: vi.fn(),
      isPending: false,
      tipoEmpresaEditable: false,
    });
    const trigger = screen.getByRole('combobox', { name: /tipo de empresa/i });
    expect(trigger).toBeDisabled();
  });

  it('cuando tipoEmpresaEditable es false el tooltip explica la inmutabilidad', async () => {
    const user = userEvent.setup();
    renderForm({
      defaultValues: BASE_DEFAULTS,
      onSubmit: vi.fn(),
      isPending: false,
      tipoEmpresaEditable: false,
    });
    // Hover sobre el trigger envuelto (o el span wrapper) para disparar tooltip
    await user.hover(screen.getByRole('combobox', { name: /tipo de empresa/i }));
    // findAllByText porque Radix puede renderizar el portal más de una vez en JSDOM
    const tooltips = await screen.findAllByText(/no se puede cambiar.*gestión fiscal/i);
    expect(tooltips.length).toBeGreaterThan(0);
  });

  it('el valor seleccionado llega al onSubmit', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderForm({
      defaultValues: {
        tipoEmpresaPrincipal: 'COMERCIAL',
        razonSocial: 'Mi Empresa',
        nit: '1234567',
      },
      onSubmit,
      isPending: false,
      tipoEmpresaEditable: true,
    });
    // El valor inicial COMERCIAL ya está precargado → submit directo
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));
    await screen.findByRole('button', { name: /guardar cambios/i });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // El primer argumento es el objeto de valores del form.
    const firstArg = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstArg).toMatchObject({ tipoEmpresaPrincipal: 'COMERCIAL' });
  });
});
