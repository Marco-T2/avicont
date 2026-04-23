import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CuentaListFilters } from './cuenta-list-filters';

describe('CuentaListFilters', () => {
  it('al escribir en el input, dispara onSearchChange con el valor', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    render(
      <CuentaListFilters
        search=""
        onSearchChange={onSearchChange}
        clase={null}
        onClaseChange={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText(/buscar cuenta/i), 'c');
    expect(onSearchChange).toHaveBeenCalledWith('c');
  });

  it('click en un chip de clase dispara onClaseChange con esa clase', async () => {
    const user = userEvent.setup();
    const onClaseChange = vi.fn();
    render(
      <CuentaListFilters
        search=""
        onSearchChange={vi.fn()}
        clase={null}
        onClaseChange={onClaseChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Pasivo' }));
    expect(onClaseChange).toHaveBeenCalledWith('PASIVO');
  });

  it('click en el chip ya activo lo deselecciona (→ null)', async () => {
    const user = userEvent.setup();
    const onClaseChange = vi.fn();
    render(
      <CuentaListFilters
        search=""
        onSearchChange={vi.fn()}
        clase="INGRESO"
        onClaseChange={onClaseChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Ingreso' }));
    expect(onClaseChange).toHaveBeenCalledWith(null);
  });

  it('el botón "Limpiar búsqueda" solo aparece cuando hay texto', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    const { rerender } = render(
      <CuentaListFilters
        search=""
        onSearchChange={onSearchChange}
        clase={null}
        onClaseChange={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/limpiar búsqueda/i)).not.toBeInTheDocument();

    rerender(
      <CuentaListFilters
        search="caja"
        onSearchChange={onSearchChange}
        clase={null}
        onClaseChange={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText(/limpiar búsqueda/i));
    expect(onSearchChange).toHaveBeenCalledWith('');
  });
});
