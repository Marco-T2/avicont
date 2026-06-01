import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CostoPorPolloCard } from './costo-por-pollo-card';

describe('CostoPorPolloCard', () => {
  it('muestra el costo por pollo vivo de forma prominente cuando hay valor', () => {
    render(
      <CostoPorPolloCard
        costoPorPolloVivo="15.31"
        avesVivas={4900}
        costoAcumulado="75000.00"
      />,
    );

    expect(screen.getByText('Bs 15.31')).toBeInTheDocument();
  });

  it('muestra "—" cuando costoPorPolloVivo es null', () => {
    render(
      <CostoPorPolloCard
        costoPorPolloVivo={null}
        avesVivas={0}
        costoAcumulado="75000.00"
      />,
    );

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('muestra estilo de mortalidad total cuando avesVivas=0 y costo es alto', () => {
    const { container } = render(
      <CostoPorPolloCard
        costoPorPolloVivo={null}
        avesVivas={0}
        costoAcumulado="75000.00"
      />,
    );

    // El componente aplica una clase de alerta cuando hay mortalidad total
    expect(container.querySelector('[data-mortalidad-total="true"]')).toBeInTheDocument();
  });

  it('muestra el costo acumulado en el card', () => {
    render(
      <CostoPorPolloCard
        costoPorPolloVivo="15.00"
        avesVivas={5000}
        costoAcumulado="75000.00"
      />,
    );

    expect(screen.getByText(/75000\.00/)).toBeInTheDocument();
  });

  it('muestra la cantidad de aves vivas', () => {
    render(
      <CostoPorPolloCard
        costoPorPolloVivo="15.31"
        avesVivas={4900}
        costoAcumulado="75000.00"
      />,
    );

    expect(screen.getByText(/4900/)).toBeInTheDocument();
  });
});
