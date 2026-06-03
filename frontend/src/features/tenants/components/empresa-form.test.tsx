import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EmpresaForm } from './empresa-form';

describe('EmpresaForm', () => {
  it('renderiza el campo NIT con su label accesible', () => {
    render(<EmpresaForm defaultValues={{}} onSubmit={vi.fn()} isPending={false} />);
    expect(screen.getByLabelText(/NIT/i)).toBeInTheDocument();
  });

  it('renderiza el campo email con su label accesible', () => {
    render(<EmpresaForm defaultValues={{}} onSubmit={vi.fn()} isPending={false} />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it('renderiza el campo razón social con su label accesible', () => {
    render(<EmpresaForm defaultValues={{}} onSubmit={vi.fn()} isPending={false} />);
    expect(screen.getByLabelText(/razón social/i)).toBeInTheDocument();
  });

  it('NIT inválido muestra mensaje de error en español', async () => {
    const user = userEvent.setup();
    render(<EmpresaForm defaultValues={{}} onSubmit={vi.fn()} isPending={false} />);
    const nitInput = screen.getByLabelText(/NIT/i);
    await user.type(nitInput, '12345AB');
    await user.click(screen.getByRole('button', { name: /guardar/i }));
    expect(
      await screen.findByText(/El NIT debe tener entre 7 y 12 dígitos/i),
    ).toBeInTheDocument();
  });

  it('email malformado muestra mensaje de error en español', async () => {
    const user = userEvent.setup();
    render(<EmpresaForm defaultValues={{}} onSubmit={vi.fn()} isPending={false} />);
    const emailInput = screen.getByLabelText(/email/i);
    await user.type(emailInput, 'no-es-un-email');
    await user.click(screen.getByRole('button', { name: /guardar/i }));
    expect(await screen.findByText(/Email inválido/i)).toBeInTheDocument();
  });

  it('botón de guardar está deshabilitado cuando isPending es true (Anti-F-07)', () => {
    render(<EmpresaForm defaultValues={{}} onSubmit={vi.fn()} isPending={true} />);
    const button = screen.getByRole('button', { name: /guardando/i });
    expect(button).toBeDisabled();
  });

  it('botón de guardar está habilitado cuando isPending es false', () => {
    render(<EmpresaForm defaultValues={{}} onSubmit={vi.fn()} isPending={false} />);
    const button = screen.getByRole('button', { name: /guardar cambios/i });
    expect(button).not.toBeDisabled();
  });

  it('los valores iniciales aparecen precargados en los campos', () => {
    render(
      <EmpresaForm
        defaultValues={{
          razonSocial: 'Avicultura Norte S.R.L.',
          nit: '1234567',
        }}
        onSubmit={vi.fn()}
        isPending={false}
      />,
    );
    expect(screen.getByDisplayValue('Avicultura Norte S.R.L.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1234567')).toBeInTheDocument();
  });

  it('submit con datos válidos llama onSubmit una sola vez', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <EmpresaForm
        defaultValues={{ razonSocial: 'Mi Empresa', nit: '1234567' }}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));
    // Wait for async validation
    await screen.findByRole('button', { name: /guardar cambios/i });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
