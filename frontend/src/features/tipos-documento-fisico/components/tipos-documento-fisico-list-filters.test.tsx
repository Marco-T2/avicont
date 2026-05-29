import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TiposDocumentoFisicoListFilters } from './tipos-documento-fisico-list-filters';

describe('TiposDocumentoFisicoListFilters', () => {
  it('cambiar select de estado dispara onEstadoChange con el valor correcto', async () => {
    const onEstadoChange = vi.fn();
    const user = userEvent.setup();

    render(
      <TiposDocumentoFisicoListFilters
        q=""
        onSearchChange={vi.fn()}
        estado="activos"
        onEstadoChange={onEstadoChange}
      />,
    );

    // Click en "Inactivos"
    await user.click(screen.getByRole('button', { name: /inactivos/i }));
    expect(onEstadoChange).toHaveBeenCalledWith('inactivos');
  });

  it('escribir en el input de búsqueda dispara onSearchChange', async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();

    render(
      <TiposDocumentoFisicoListFilters
        q=""
        onSearchChange={onSearchChange}
        estado="activos"
        onEstadoChange={vi.fn()}
      />,
    );

    await user.type(screen.getByRole('searchbox'), 'fact');
    expect(onSearchChange).toHaveBeenCalled();
  });

  it('botón limpiar aparece cuando q tiene texto y llama onSearchChange("")', async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();

    render(
      <TiposDocumentoFisicoListFilters
        q="fact"
        onSearchChange={onSearchChange}
        estado="activos"
        onEstadoChange={vi.fn()}
      />,
    );

    const limpiar = screen.getByRole('button', { name: /limpiar/i });
    await user.click(limpiar);
    expect(onSearchChange).toHaveBeenCalledWith('');
  });

  it('botón limpiar NO aparece cuando q está vacío', () => {
    render(
      <TiposDocumentoFisicoListFilters
        q=""
        onSearchChange={vi.fn()}
        estado="activos"
        onEstadoChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /limpiar/i })).not.toBeInTheDocument();
  });

  it('los 3 chips de estado están presentes', () => {
    render(
      <TiposDocumentoFisicoListFilters
        q=""
        onSearchChange={vi.fn()}
        estado="activos"
        onEstadoChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /^activos$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^inactivos$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^todos$/i })).toBeInTheDocument();
  });
});
