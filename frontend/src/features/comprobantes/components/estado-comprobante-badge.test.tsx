import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EstadoComprobanteBadge } from './estado-comprobante-badge';

describe('EstadoComprobanteBadge', () => {
  it('BORRADOR → texto "Borrador" visible', () => {
    render(<EstadoComprobanteBadge estado="BORRADOR" anulado={false} />);
    expect(screen.getByText('Borrador')).toBeInTheDocument();
  });

  it('CONTABILIZADO → texto "Contabilizado" visible', () => {
    render(<EstadoComprobanteBadge estado="CONTABILIZADO" anulado={false} />);
    expect(screen.getByText('Contabilizado')).toBeInTheDocument();
  });

  it('BLOQUEADO → texto "Cerrado" visible (no "BLOQUEADO")', () => {
    render(<EstadoComprobanteBadge estado="BLOQUEADO" anulado={false} />);
    expect(screen.getByText('Cerrado')).toBeInTheDocument();
    expect(screen.queryByText('BLOQUEADO')).not.toBeInTheDocument();
  });

  it('anulado=true ignora estado y muestra "Anulado"', () => {
    render(<EstadoComprobanteBadge estado="CONTABILIZADO" anulado={true} />);
    expect(screen.getByText('Anulado')).toBeInTheDocument();
    expect(screen.queryByText('Contabilizado')).not.toBeInTheDocument();
  });

  it('anulado=true aplica line-through en el texto', () => {
    const { container } = render(
      <EstadoComprobanteBadge estado="BORRADOR" anulado={true} />,
    );
    const badge = container.firstElementChild;
    expect(badge?.className).toContain('line-through');
  });

  it('tiene role="status" para accesibilidad', () => {
    render(<EstadoComprobanteBadge estado="BORRADOR" anulado={false} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
