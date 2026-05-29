import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DocumentoFisicoListFilters } from './documento-fisico-list-filters';

afterEach(() => vi.clearAllMocks());

const defaultProps = {
  numero: '',
  onNumeroChange: vi.fn(),
  tipoId: undefined,
  onTipoChange: vi.fn(),
  estadoAsociacion: undefined,
  onEstadoAsociacionChange: vi.fn(),
  fechaDesde: '',
  onFechaDesdeChange: vi.fn(),
  fechaHasta: '',
  onFechaHastaChange: vi.fn(),
  tipos: [],
};

describe('DocumentoFisicoListFilters', () => {
  it('escribir en el input de número → llama onNumeroChange', async () => {
    const onNumeroChange = vi.fn();
    const user = userEvent.setup();

    render(
      <DocumentoFisicoListFilters
        {...defaultProps}
        onNumeroChange={onNumeroChange}
      />,
    );

    const input = screen.getByPlaceholderText(/buscar por número/i);
    await user.type(input, 'F-00');
    expect(onNumeroChange).toHaveBeenCalled();
  });

  it('chips de estadoAsociacion: click "Sueltos" → onEstadoAsociacionChange("SUELTO")', async () => {
    const onEstadoAsociacionChange = vi.fn();
    const user = userEvent.setup();

    render(
      <DocumentoFisicoListFilters
        {...defaultProps}
        onEstadoAsociacionChange={onEstadoAsociacionChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: /sueltos/i }));
    expect(onEstadoAsociacionChange).toHaveBeenCalledWith('SUELTO');
  });

  it('chip "Todos" → onEstadoAsociacionChange(undefined)', async () => {
    const onEstadoAsociacionChange = vi.fn();
    const user = userEvent.setup();

    render(
      <DocumentoFisicoListFilters
        {...defaultProps}
        estadoAsociacion="SUELTO"
        onEstadoAsociacionChange={onEstadoAsociacionChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: /todos/i }));
    expect(onEstadoAsociacionChange).toHaveBeenCalledWith(undefined);
  });

  it('los 4 chips de estado están presentes (Todos, Sueltos, En borrador, Contabilizados)', () => {
    render(<DocumentoFisicoListFilters {...defaultProps} />);

    expect(screen.getByRole('button', { name: /todos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sueltos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /en borrador/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /contabilizados/i })).toBeInTheDocument();
  });
});
