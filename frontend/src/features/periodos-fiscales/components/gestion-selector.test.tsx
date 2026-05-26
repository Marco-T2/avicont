import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Gestion } from '@/types/api';

import { GestionSelector } from './gestion-selector';

const G2024: Gestion = {
  id: 'g2024',
  year: 2024,
  mesInicio: 1,
  status: 'CERRADA',
  closedAt: '2025-01-10T00:00:00Z',
  closedByUserId: 'u1',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2025-01-10T00:00:00Z',
};

const G2025: Gestion = {
  id: 'g2025',
  year: 2025,
  mesInicio: 1,
  status: 'ABIERTA',
  closedAt: null,
  closedByUserId: null,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

const G2026: Gestion = {
  id: 'g2026',
  year: 2026,
  mesInicio: 1,
  status: 'ABIERTA',
  closedAt: null,
  closedByUserId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('GestionSelector', () => {
  it('no renderiza nada si la lista está vacía', () => {
    const { container } = render(
      <GestionSelector gestiones={[]} value={null} onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('muestra las gestiones en el trigger con el año seleccionado', () => {
    render(
      <GestionSelector
        gestiones={[G2025, G2026]}
        value="g2026"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('Gestión 2026')).toBeInTheDocument();
  });

  it('muestra placeholder si value es null', () => {
    render(
      <GestionSelector
        gestiones={[G2026]}
        value={null}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('llama onChange con el id de la gestión seleccionada', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <GestionSelector
        gestiones={[G2024, G2025, G2026]}
        value="g2026"
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    const option = await screen.findByText('Gestión 2025');
    await user.click(option);
    expect(onChange).toHaveBeenCalledWith('g2025');
  });

  it('muestra las gestiones ordenadas DESC por year', async () => {
    const user = userEvent.setup();
    render(
      <GestionSelector
        gestiones={[G2024, G2025, G2026]}
        value="g2026"
        onChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    const options = await screen.findAllByRole('option');
    const textos = options.map((o) => o.textContent ?? '');
    // 2026 debe aparecer antes que 2025 y 2024
    expect(textos[0]).toContain('2026');
    expect(textos[1]).toContain('2025');
    expect(textos[2]).toContain('2024');
  });

  it('gestión CERRADA muestra chip "Cerrada"', async () => {
    const user = userEvent.setup();
    render(
      <GestionSelector
        gestiones={[G2024, G2025]}
        value="g2025"
        onChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    const cerradaTexts = await screen.findAllByText('Cerrada');
    expect(cerradaTexts.length).toBeGreaterThan(0);
  });
});
