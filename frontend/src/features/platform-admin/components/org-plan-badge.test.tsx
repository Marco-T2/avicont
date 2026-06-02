import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OrgPlanBadge } from './org-plan-badge';

describe('OrgPlanBadge', () => {
  it('renderiza una etiqueta legible para cada plan conocido', () => {
    const { rerender } = render(<OrgPlanBadge plan="FREE" />);
    expect(screen.getByText('Free')).toBeInTheDocument();

    rerender(<OrgPlanBadge plan="PRO" />);
    expect(screen.getByText('Pro')).toBeInTheDocument();
  });

  it('ante un valor inesperado muestra el string crudo sin romper (render defensivo)', () => {
    render(<OrgPlanBadge plan={'ENTERPRISE' as never} />);
    expect(screen.getByText('ENTERPRISE')).toBeInTheDocument();
  });
});
