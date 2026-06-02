import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OrgStatusBadge } from './org-status-badge';

describe('OrgStatusBadge', () => {
  it('renderiza una etiqueta legible para cada status conocido', () => {
    const { rerender } = render(<OrgStatusBadge status="ACTIVE" />);
    expect(screen.getByText('Activa')).toBeInTheDocument();

    rerender(<OrgStatusBadge status="SUSPENDED" />);
    expect(screen.getByText('Suspendida')).toBeInTheDocument();

    rerender(<OrgStatusBadge status="ARCHIVED" />);
    expect(screen.getByText('Archivada')).toBeInTheDocument();
  });

  it('ante un valor inesperado muestra el string crudo sin romper (render defensivo)', () => {
    // El backend tipa status como string; un valor nuevo no debe romper la tabla.
    render(<OrgStatusBadge status={'PENDING_REVIEW' as never} />);
    expect(screen.getByText('PENDING_REVIEW')).toBeInTheDocument();
  });
});
