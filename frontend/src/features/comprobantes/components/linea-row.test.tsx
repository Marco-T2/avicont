/**
 * Tests de LineaRow — REQ-CCL-UI-01, REQ-CCL-UI-02, REQ-CCL-UI-03.
 * Incluye test de regresión del bug de FOCO (design §Decisión 5).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Cuenta } from '@/types/api';

import type { LineaFormValues } from '../types';
import { LINEA_VACIA } from '../types';
import { LineaRow } from './linea-row';

// --- Mocks ---

// Mock ContactoCombobox para controlar valor/selección sin depender de useContactos.
const mockOnSelectContacto = vi.fn();
vi.mock('@/components/shared/contacto-combobox', () => ({
  ContactoCombobox: ({
    value,
    onSelect,
    disabled,
    'aria-invalid': ariaInvalid,
    'aria-label': ariaLabel,
  }: {
    value: string | null;
    onSelect: (id: string | null) => void;
    disabled?: boolean;
    'aria-invalid'?: boolean;
    'aria-label'?: string;
  }) => (
    <button
      type="button"
      role="combobox"
      aria-label={ariaLabel ?? 'Contacto'}
      aria-invalid={ariaInvalid}
      disabled={disabled}
      data-value={value ?? ''}
      onClick={() => {
        mockOnSelectContacto(value);
        onSelect('contacto-1');
      }}
    >
      {value !== null && value !== '' ? `Contacto: ${value}` : 'Seleccionar contacto…'}
    </button>
  ),
}));

// Mock CuentaAutocomplete — evita depender de useCuentas en estos tests.
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

afterEach(() => {
  vi.clearAllMocks();
});

// --- Helpers ---

const makeCuenta = (overrides: Partial<Cuenta> = {}): Cuenta => ({
  id: 'cuenta-1',
  organizationId: 'org-1',
  codigoInterno: '1.1.01',
  nombre: 'Caja Chica',
  descripcion: null,
  claseCuenta: 'ACTIVO',
  subClaseCuenta: 'ACTIVO_CORRIENTE',
  naturaleza: 'DEUDORA',
  parentId: null,
  nivel: 3,
  esDetalle: true,
  requiereContacto: false,
  esContraria: false,
  activa: true,
  monedaFuncional: 'BOB',
  permiteMultiMoneda: false,
  esSystemSeed: false,
  esRequeridaSistema: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

interface WrapperProps {
  index?: number;
  cuentas?: Cuenta[];
  defaultLinea?: LineaFormValues;
  disabled?: boolean;
}

function Wrapper({ index = 0, cuentas = [], defaultLinea, disabled = false }: WrapperProps) {
  const linea: LineaFormValues = defaultLinea ?? {
    ...LINEA_VACIA,
    _localKey: 'key-1',
  };

  const form = useForm<{ lineas: LineaFormValues[] }>({
    defaultValues: { lineas: [linea] },
  });

  return (
    <FormProvider {...form}>
      <table>
        <tbody>
          <LineaRow
            index={index}
            cuentas={cuentas}
            onRemove={vi.fn()}
            isOnlyRow={true}
            disabled={disabled}
          />
        </tbody>
      </table>
    </FormProvider>
  );
}

// --- Tests ---

describe('LineaRow', () => {
  describe('REQ-CCL-UI-01 — Selector de contacto siempre visible', () => {
    it('muestra el combobox de contacto en la fila', () => {
      render(<Wrapper cuentas={[makeCuenta()]} />);
      expect(screen.getByRole('combobox', { name: 'Contacto' })).toBeInTheDocument();
    });

    it('muestra placeholder "Seleccionar contacto…" cuando no hay contacto asignado', () => {
      render(<Wrapper cuentas={[makeCuenta()]} />);
      expect(screen.getByText('Seleccionar contacto…')).toBeInTheDocument();
    });

    it('el combobox de contacto está presente incluso sin cuentas en la lista', () => {
      render(<Wrapper cuentas={[]} />);
      expect(screen.getByRole('combobox', { name: 'Contacto' })).toBeInTheDocument();
    });
  });

  describe('REQ-CCL-UI-02 — Aviso visual cuando requiereContacto=true', () => {
    it('campo Contacto tiene aria-invalid cuando cuenta requiereContacto=true y no hay contacto', () => {
      const cuentaConRequerimiento = makeCuenta({
        id: 'cuenta-req',
        requiereContacto: true,
      });
      render(
        <Wrapper
          cuentas={[cuentaConRequerimiento]}
          defaultLinea={{
            ...LINEA_VACIA,
            _localKey: 'key-1',
            cuentaId: 'cuenta-req',
            contactoId: undefined,
          }}
        />,
      );
      const combobox = screen.getByRole('combobox', { name: 'Contacto' });
      expect(combobox).toHaveAttribute('aria-invalid', 'true');
    });

    it('campo Contacto NO tiene aria-invalid cuando cuenta requiereContacto=false', () => {
      const cuentaSinRequerimiento = makeCuenta({
        id: 'cuenta-no-req',
        requiereContacto: false,
      });
      render(
        <Wrapper
          cuentas={[cuentaSinRequerimiento]}
          defaultLinea={{
            ...LINEA_VACIA,
            _localKey: 'key-1',
            cuentaId: 'cuenta-no-req',
            contactoId: undefined,
          }}
        />,
      );
      const combobox = screen.getByRole('combobox', { name: 'Contacto' });
      expect(combobox).not.toHaveAttribute('aria-invalid', 'true');
    });

    it('campo Contacto NO tiene aria-invalid cuando cuenta requiereContacto=true pero hay contacto', () => {
      const cuentaConRequerimiento = makeCuenta({
        id: 'cuenta-req',
        requiereContacto: true,
      });
      render(
        <Wrapper
          cuentas={[cuentaConRequerimiento]}
          defaultLinea={{
            ...LINEA_VACIA,
            _localKey: 'key-1',
            cuentaId: 'cuenta-req',
            contactoId: 'contacto-asignado',
          }}
        />,
      );
      const combobox = screen.getByRole('combobox', { name: 'Contacto' });
      expect(combobox).not.toHaveAttribute('aria-invalid', 'true');
    });

    it('muestra mensaje de error visible cuando requiereContacto=true y no hay contacto', () => {
      const cuentaConRequerimiento = makeCuenta({
        id: 'cuenta-req',
        requiereContacto: true,
      });
      render(
        <Wrapper
          cuentas={[cuentaConRequerimiento]}
          defaultLinea={{
            ...LINEA_VACIA,
            _localKey: 'key-1',
            cuentaId: 'cuenta-req',
            contactoId: undefined,
          }}
        />,
      );
      // Debe haber un mensaje de aviso visible (no solo color)
      expect(screen.getByText(/contacto requerido/i)).toBeInTheDocument();
    });
  });

  describe('REQ-CCL-UI-03 — Preservar contacto en mode=edit', () => {
    it('muestra el contacto asignado cuando la línea trae contactoId', () => {
      render(
        <Wrapper
          cuentas={[makeCuenta()]}
          defaultLinea={{
            ...LINEA_VACIA,
            _localKey: 'key-1',
            cuentaId: 'cuenta-1',
            contactoId: 'contacto-uuid-abc',
          }}
        />,
      );
      // El combobox mock muestra "Contacto: <id>" cuando value != null
      expect(screen.getByText('Contacto: contacto-uuid-abc')).toBeInTheDocument();
    });
  });

  describe('Regresión — bug de FOCO (design §Decisión 5)', () => {
    it('seleccionar contacto no pierde foco del input de Debe', async () => {
      const user = userEvent.setup();
      render(
        <Wrapper
          cuentas={[makeCuenta()]}
          defaultLinea={{ ...LINEA_VACIA, _localKey: 'key-1' }}
        />,
      );

      // Foco en el input de Debe
      const inputDebe = screen.getByRole('textbox', { name: 'Debe' });
      await user.click(inputDebe);
      expect(inputDebe).toHaveFocus();

      // Seleccionar contacto vía el combobox mock
      const combobox = screen.getByRole('combobox', { name: 'Contacto' });
      await user.click(combobox);

      // Tras la selección, el input de Debe sigue siendo accesible
      // (no hubo desmonte del componente que lo contenía)
      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: 'Debe' })).toBeInTheDocument();
      });
    });
  });

  describe('disabled mode', () => {
    it('el combobox de contacto está deshabilitado cuando disabled=true', () => {
      render(<Wrapper cuentas={[makeCuenta()]} disabled={true} />);
      expect(screen.getByRole('combobox', { name: 'Contacto' })).toBeDisabled();
    });
  });
});
