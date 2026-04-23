import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { LoginForm } from './login-form';

function renderLoginForm(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LoginForm />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginForm', () => {
  it('muestra error de validación si el email está vacío', async () => {
    const user = userEvent.setup();
    renderLoginForm();
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(await screen.findByText(/el email es obligatorio/i)).toBeInTheDocument();
  });

  it('muestra error si el password tiene menos de 8 caracteres', async () => {
    const user = userEvent.setup();
    renderLoginForm();
    await user.type(screen.getByLabelText(/email/i), 'a@b.bo');
    await user.type(screen.getByLabelText(/contraseña/i), '123');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    expect(await screen.findByText(/mínimo 8 caracteres/i)).toBeInTheDocument();
  });
});
