import { render, screen } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import { ComprobanteCabeceraForm } from './comprobante-cabecera-form';

function Wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  const methods = useForm({
    defaultValues: {
      tipo: 'DIARIO',
      fechaContable: '2026-05-27',
      glosa: '',
      monedaPrincipal: 'BOB',
    },
  });
  return <FormProvider {...methods}>{children}</FormProvider>;
}

describe('ComprobanteCabeceraForm', () => {
  it('renderiza los campos de la cabecera', () => {
    render(
      <Wrapper>
        <ComprobanteCabeceraForm />
      </Wrapper>,
    );

    expect(screen.getByLabelText('Fecha contable')).toBeInTheDocument();
    expect(screen.getByLabelText('Glosa')).toBeInTheDocument();
  });

  it('muestra el número correlativo readonly cuando se provee', () => {
    render(
      <Wrapper>
        <ComprobanteCabeceraForm numeroCorrelativo="D2604-000042" />
      </Wrapper>,
    );

    const input = screen.getByDisplayValue('D2604-000042');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('readonly');
  });

  it('no muestra el número cuando es null', () => {
    render(
      <Wrapper>
        <ComprobanteCabeceraForm numeroCorrelativo={null} />
      </Wrapper>,
    );

    expect(screen.queryByDisplayValue('—')).not.toBeInTheDocument();
  });
});
