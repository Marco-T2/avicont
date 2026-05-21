import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ContactoListFilters } from './contacto-list-filters';

describe('ContactoListFilters', () => {
  it('E-FILT-01: click en "Clientes" dispara onRolChange("clientes")', async () => {
    const user = userEvent.setup();
    const onRolChange = vi.fn();
    render(
      <ContactoListFilters
        rol="todos"
        onRolChange={onRolChange}
        incluirInactivos={false}
        onIncluirInactivosChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Clientes' }));
    expect(onRolChange).toHaveBeenCalledWith('clientes');
  });

  it('E-FILT-02: click en "Proveedores" dispara onRolChange("proveedores")', async () => {
    const user = userEvent.setup();
    const onRolChange = vi.fn();
    render(
      <ContactoListFilters
        rol="todos"
        onRolChange={onRolChange}
        incluirInactivos={false}
        onIncluirInactivosChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Proveedores' }));
    expect(onRolChange).toHaveBeenCalledWith('proveedores');
  });

  it('E-FILT-03: encender el switch "Incluir inactivos" dispara onIncluirInactivosChange(true)', async () => {
    const user = userEvent.setup();
    const onIncluirInactivosChange = vi.fn();
    render(
      <ContactoListFilters
        rol="todos"
        onRolChange={vi.fn()}
        incluirInactivos={false}
        onIncluirInactivosChange={onIncluirInactivosChange}
        search=""
        onSearchChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('switch', { name: /incluir inactivos/i }));
    expect(onIncluirInactivosChange).toHaveBeenCalledWith(true);
  });

  it('E-FILT-04: escribir en el buscador dispara onSearchChange con el texto', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    render(
      <ContactoListFilters
        rol="todos"
        onRolChange={vi.fn()}
        incluirInactivos={false}
        onIncluirInactivosChange={vi.fn()}
        search=""
        onSearchChange={onSearchChange}
      />,
    );
    await user.type(screen.getByRole('textbox', { name: /buscar contacto/i }), 'A');
    expect(onSearchChange).toHaveBeenCalledWith('A');
  });
});
