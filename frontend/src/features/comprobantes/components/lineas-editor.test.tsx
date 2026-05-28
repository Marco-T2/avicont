import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import type { Cuenta } from '@/types/api';
import type { LineaFormValues } from '../types';
import { LINEA_VACIA } from '../types';
import { LineasEditor } from './lineas-editor';

// Mock de CuentaAutocomplete — simplifica el test para que no dependa de useCuentas
vi.mock('./cuenta-autocomplete', () => ({
  CuentaAutocomplete: ({
    value,
    onChange,
    disabled,
  }: {
    value: string;
    onChange: (id: string) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      role="combobox"
      aria-label="Seleccionar cuenta"
      onClick={() => onChange('cuenta-test-id')}
      disabled={disabled}
      data-value={value}
    >
      {value !== '' ? 'Cuenta seleccionada' : 'Seleccionar cuenta…'}
    </button>
  ),
}));

const CUENTAS_MOCK: Cuenta[] = [];

interface TestFormValues {
  lineas: LineaFormValues[];
}

function Wrapper({
  defaultLineas = [{ ...LINEA_VACIA, _localKey: 'key-1' }],
  mode = 'nuevo' as const,
}: {
  defaultLineas?: LineaFormValues[];
  mode?: 'nuevo' | 'borrador' | 'contabilizado';
}) {
  const form = useForm<TestFormValues>({
    defaultValues: { lineas: defaultLineas },
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(() => {})}>
        <LineasEditor mode={mode} cuentas={CUENTAS_MOCK} />
        <button type="submit">Guardar</button>
      </form>
    </FormProvider>
  );
}

describe('LineasEditor', () => {
  describe('modo nuevo/borrador', () => {
    it('renderiza con la fila inicial', () => {
      render(<Wrapper />);
      // Header debe estar visible
      expect(screen.getByText('Cuenta')).toBeInTheDocument();
      expect(screen.getByText('+ Agregar línea')).toBeInTheDocument();
    });

    it('agregar línea aumenta el contador de filas', async () => {
      const user = userEvent.setup();
      render(<Wrapper />);

      const btnAgregar = screen.getByText('+ Agregar línea');
      await user.click(btnAgregar);

      // Ahora debería haber 2 botones de "Eliminar fila"
      const botonesEliminar = screen.getAllByRole('button', { name: /eliminar fila/i });
      expect(botonesEliminar).toHaveLength(2);
    });

    it('eliminar fila reduce el contador (disabled cuando solo queda 1)', async () => {
      const user = userEvent.setup();
      render(
        <Wrapper
          defaultLineas={[
            { ...LINEA_VACIA, _localKey: 'key-1' },
            { ...LINEA_VACIA, _localKey: 'key-2' },
          ]}
        />,
      );

      const botonesEliminar = screen.getAllByRole('button', { name: /eliminar fila/i });
      expect(botonesEliminar).toHaveLength(2);

      await user.click(botonesEliminar[0]!);

      await waitFor(() => {
        const botones = screen.getAllByRole('button', { name: /eliminar fila/i });
        expect(botones).toHaveLength(1);
        // Con solo 1 fila, el botón debe estar disabled
        expect(botones[0]).toBeDisabled();
      });
    });

    it('botón eliminar deshabilitado cuando hay solo 1 fila', () => {
      render(<Wrapper />);
      const btnEliminar = screen.getByRole('button', { name: /eliminar fila/i });
      expect(btnEliminar).toBeDisabled();
    });

    it('muestra footer con totales', () => {
      render(<Wrapper />);
      expect(screen.getByText(/Total Debe/i)).toBeInTheDocument();
      expect(screen.getByText(/Total Haber/i)).toBeInTheDocument();
    });

    it('footer muestra badge balanceado cuando debe=haber=0', () => {
      render(<Wrapper />);
      // Con valores por defecto '0', está balanceado
      expect(screen.getByText(/balanceado/i)).toBeInTheDocument();
    });

    it('footer muestra desbalanceado cuando totales difieren', () => {
      render(
        <Wrapper
          defaultLineas={[
            {
              ...LINEA_VACIA,
              _localKey: 'key-1',
              debito: '1000',
              debitoBob: '1000.00',
              credito: '0',
              creditoBob: '0.00',
            },
            {
              ...LINEA_VACIA,
              _localKey: 'key-2',
              debito: '0',
              debitoBob: '0.00',
              credito: '500',
              creditoBob: '500.00',
            },
          ]}
        />,
      );
      expect(screen.getByText(/desbalanceado/i)).toBeInTheDocument();
    });
  });

  describe('modo contabilizado', () => {
    it('muestra WarningBanner en modo contabilizado', () => {
      render(<Wrapper mode="contabilizado" />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('inputs deshabilitados por defecto en modo contabilizado', () => {
      render(<Wrapper mode="contabilizado" />);
      // El botón de agregar debe estar deshabilitado
      const btnAgregar = screen.getByText('+ Agregar línea');
      expect(btnAgregar).toBeDisabled();
    });

    it('toggle "Reemplazar líneas" habilita el editor', async () => {
      const user = userEvent.setup();
      render(<Wrapper mode="contabilizado" />);

      const toggle = screen.getByRole('checkbox', { name: /reemplazar líneas/i });
      await user.click(toggle);

      // Tras activar el toggle, el botón agregar debe habilitarse
      await waitFor(() => {
        const btnAgregar = screen.getByText('+ Agregar línea');
        expect(btnAgregar).not.toBeDisabled();
      });
    });
  });

  describe('totales calculados', () => {
    it('calcula totalDebitoBob sumando debitoBob de todas las líneas', () => {
      render(
        <Wrapper
          defaultLineas={[
            {
              ...LINEA_VACIA,
              _localKey: 'k1',
              debito: '1000',
              debitoBob: '1000.00',
              credito: '0',
              creditoBob: '0.00',
            },
            {
              ...LINEA_VACIA,
              _localKey: 'k2',
              debito: '500',
              debitoBob: '500.00',
              credito: '0',
              creditoBob: '0.00',
            },
            {
              ...LINEA_VACIA,
              _localKey: 'k3',
              debito: '0',
              debitoBob: '0.00',
              credito: '1500',
              creditoBob: '1500.00',
            },
          ]}
        />,
      );

      // Total debe BOB = 1500.00 y total haber BOB = 1500.00 (balanceado)
      // getAllByText porque ambos totales muestran 1500.00 simultáneamente (Anti-JSDOM-dup)
      const totalesEl = screen.getAllByText('1500.00');
      expect(totalesEl.length).toBeGreaterThanOrEqual(1);
      // Balanceado (1500 = 1500)
      expect(screen.getByText(/balanceado/i)).toBeInTheDocument();
    });
  });

  describe('keyboard shortcuts', () => {
    it('Alt+Delete sobre una fila la elimina (cuando hay 2 filas)', async () => {
      const user = userEvent.setup();
      render(
        <Wrapper
          defaultLineas={[
            { ...LINEA_VACIA, _localKey: 'key-1' },
            { ...LINEA_VACIA, _localKey: 'key-2' },
          ]}
        />,
      );

      // Hay 2 filas
      expect(screen.getAllByRole('button', { name: /eliminar fila/i })).toHaveLength(2);

      // Simular Alt+Delete en la primera fila enfocando su botón eliminar
      const botonesEliminar = screen.getAllByRole('button', { name: /eliminar fila/i });
      botonesEliminar[0]!.focus();
      await user.keyboard('{Alt>}{Delete}{/Alt}');

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /eliminar fila/i })).toHaveLength(1);
      });
    });
  });
});
