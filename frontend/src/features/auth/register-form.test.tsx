import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { RegisterForm } from './register-form';

function renderRegisterForm(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <RegisterForm />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RegisterForm', () => {
  it('muestra errores de validación si los campos obligatorios están vacíos', async () => {
    const user = userEvent.setup();
    renderRegisterForm();
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));
    expect(
      await screen.findByText(/el email es obligatorio/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/el nombre de la organización es obligatorio/i),
    ).toBeInTheDocument();
  });

  it('incluye el selector de tipo de organización', () => {
    renderRegisterForm();
    expect(
      screen.getByRole('combobox', { name: /tipo de organización/i }),
    ).toBeInTheDocument();
  });

  it('muestra error si el password tiene menos de 8 caracteres', async () => {
    const user = userEvent.setup();
    renderRegisterForm();
    await user.type(screen.getByLabelText(/email/i), 'a@b.bo');
    await user.type(screen.getByLabelText(/contraseña/i), '123');
    await user.type(
      screen.getByLabelText(/nombre de la organización/i),
      'Mi Asociación',
    );
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));
    expect(
      await screen.findByText(/mínimo 8 caracteres/i),
    ).toBeInTheDocument();
  });
});
