import type { DragEndEvent } from '@dnd-kit/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Cuenta } from '@/types/api';
import type { LineaFormValues } from '../types';
import { LINEA_VACIA } from '../types';
import { LineasEditor } from './lineas-editor';

// Capturamos el `onDragEnd` que LineasEditor pasa al DndContext para poder
// dispararlo manualmente. JSDOM no implementa PointerEvent/DOMRect reales, así que
// NO testeamos la mecánica de arrastre de la librería: invocamos onDragEnd con
// `active`/`over` mockeados (por id) y verificamos el RESULTADO del reorden.
let capturedOnDragEnd: ((event: DragEndEvent) => void) | undefined;

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: ReactNode;
      onDragEnd?: (event: DragEndEvent) => void;
    }) => {
      capturedOnDragEnd = onDragEnd;
      return <>{children}</>;
    },
  };
});

// Mock de ContactoCombobox — evita depender de useContactos en estos tests.
vi.mock('@/components/shared/contacto-combobox', () => ({
  ContactoCombobox: ({
    value,
    onSelect,
    disabled,
  }: {
    value: string | null;
    onSelect: (id: string | null) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      role="combobox"
      aria-label="Contacto"
      onClick={() => onSelect('contacto-test-id')}
      disabled={disabled}
      data-value={value ?? ''}
    >
      {value !== null ? `Contacto: ${value}` : 'Seleccionar contacto…'}
    </button>
  ),
}));

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

afterEach(() => {
  capturedOnDragEnd = undefined;
  vi.clearAllMocks();
});

/**
 * Lee los `field.id` (id de sortable) de cada fila renderizada, en orden.
 * El `<tr>` los expone via `data-field-id` para que el test pueda construir
 * el DragEndEvent con ids reales de RHF (que son auto-generados).
 */
function idsDeFilas(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('tr[data-field-id]')).map(
    (tr) => tr.dataset.fieldId ?? '',
  );
}

/** Dispara el reorden (active sobre over) dentro de act() para que React flushee el move(). */
function dispararDrag(activeId: string, overId: string | null): void {
  act(() => {
    capturedOnDragEnd?.({
      active: { id: activeId },
      over: overId === null ? null : { id: overId },
    } as DragEndEvent);
  });
}

describe('LineasEditor', () => {
  describe('modo nuevo/borrador', () => {
    it('renderiza con la fila inicial', () => {
      render(<Wrapper />);
      // Header debe estar visible
      expect(screen.getByText('Cuenta')).toBeInTheDocument();
      expect(screen.getByText('Agregar línea')).toBeInTheDocument();
    });

    it('columnas Moneda y T.C. no aparecen en el header de la tabla', () => {
      render(<Wrapper />);
      // Las columnas de moneda y tipo de cambio por línea están ocultas.
      // El header de la tabla no debe mostrar esas columnas.
      expect(screen.queryByRole('columnheader', { name: /^moneda$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('columnheader', { name: /^t\.c\.$/i })).not.toBeInTheDocument();
    });

    it('agregar línea aumenta el contador de filas', async () => {
      const user = userEvent.setup();
      render(<Wrapper />);

      const btnAgregar = screen.getByText('Agregar línea');
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
              credito: '0',
            },
            {
              ...LINEA_VACIA,
              _localKey: 'key-2',
              debito: '0',
              credito: '500',
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
      const btnAgregar = screen.getByText('Agregar línea');
      expect(btnAgregar).toBeDisabled();
    });

    it('toggle "Reemplazar líneas" habilita el editor', async () => {
      const user = userEvent.setup();
      render(<Wrapper mode="contabilizado" />);

      const toggle = screen.getByRole('checkbox', { name: /reemplazar líneas/i });
      await user.click(toggle);

      // Tras activar el toggle, el botón agregar debe habilitarse
      await waitFor(() => {
        const btnAgregar = screen.getByText('Agregar línea');
        expect(btnAgregar).not.toBeDisabled();
      });
    });
  });

  describe('totales calculados', () => {
    it('calcula totalDebitoBob sumando debito × tipoCambio de todas las líneas', () => {
      render(
        <Wrapper
          defaultLineas={[
            {
              ...LINEA_VACIA,
              _localKey: 'k1',
              debito: '1000',
              credito: '0',
            },
            {
              ...LINEA_VACIA,
              _localKey: 'k2',
              debito: '500',
              credito: '0',
            },
            {
              ...LINEA_VACIA,
              _localKey: 'k3',
              debito: '0',
              credito: '1500',
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

  describe('REQ-DDL-UI-01/02 — Drag & drop para reordenar líneas', () => {
    it('cada fila muestra un handle de arrastre dedicado', () => {
      render(
        <Wrapper
          defaultLineas={[
            { ...LINEA_VACIA, _localKey: 'k1' },
            { ...LINEA_VACIA, _localKey: 'k2' },
          ]}
        />,
      );
      expect(screen.getAllByRole('button', { name: /reordenar línea/i })).toHaveLength(2);
    });

    it('reordenar la primera fila a la última posición invierte el orden (REQ-DDL-UI-02)', () => {
      render(
        <Wrapper
          defaultLineas={[
            { ...LINEA_VACIA, _localKey: 'k1', glosaLinea: 'Linea A' },
            { ...LINEA_VACIA, _localKey: 'k2', glosaLinea: 'Linea B' },
          ]}
        />,
      );

      const glosasIniciales = screen
        .getAllByRole('textbox', { name: 'Glosa de línea' })
        .map((el) => (el as HTMLInputElement).value);
      expect(glosasIniciales).toEqual(['Linea A', 'Linea B']);

      const [idA, idB] = idsDeFilas();
      expect(capturedOnDragEnd).toBeDefined();
      // Arrastrar la fila A sobre la posición de la fila B.
      dispararDrag(idA ?? '', idB ?? '');

      const glosasFinales = screen
        .getAllByRole('textbox', { name: 'Glosa de línea' })
        .map((el) => (el as HTMLInputElement).value);
      expect(glosasFinales).toEqual(['Linea B', 'Linea A']);
    });

    it('el reorden conserva los valores Debe/Haber de cada línea', () => {
      render(
        <Wrapper
          defaultLineas={[
            { ...LINEA_VACIA, _localKey: 'k1', debito: '100', glosaLinea: 'A' },
            { ...LINEA_VACIA, _localKey: 'k2', credito: '100', glosaLinea: 'B' },
          ]}
        />,
      );

      const [idA, idB] = idsDeFilas();
      dispararDrag(idA ?? '', idB ?? '');

      // Tras el reorden la fila "B" (credito 100) queda primera, "A" (debito 100) segunda.
      const glosas = screen
        .getAllByRole('textbox', { name: 'Glosa de línea' })
        .map((el) => (el as HTMLInputElement).value);
      expect(glosas).toEqual(['B', 'A']);

      const debes = screen
        .getAllByRole('textbox', { name: 'Debe' })
        .map((el) => (el as HTMLInputElement).value);
      const haberes = screen
        .getAllByRole('textbox', { name: 'Haber' })
        .map((el) => (el as HTMLInputElement).value);
      // Fila B primera: debe '0', haber '100'. Fila A segunda: debe '100', haber '0'.
      expect(debes).toEqual(['0', '100']);
      expect(haberes).toEqual(['100', '0']);
    });

    it('no reordena cuando over es null (drop fuera de la lista)', () => {
      render(
        <Wrapper
          defaultLineas={[
            { ...LINEA_VACIA, _localKey: 'k1', glosaLinea: 'A' },
            { ...LINEA_VACIA, _localKey: 'k2', glosaLinea: 'B' },
          ]}
        />,
      );

      const [idA] = idsDeFilas();
      dispararDrag(idA ?? '', null);

      const glosas = screen
        .getAllByRole('textbox', { name: 'Glosa de línea' })
        .map((el) => (el as HTMLInputElement).value);
      expect(glosas).toEqual(['A', 'B']);
    });
  });

  describe('REQ-DDL-UI-05 — Alt+Delete elimina la fila correcta tras un reorden', () => {
    it('tras invertir el orden, Alt+Delete sobre la primera fila elimina la que ahora está primera', async () => {
      const user = userEvent.setup();
      render(
        <Wrapper
          defaultLineas={[
            { ...LINEA_VACIA, _localKey: 'k1', glosaLinea: 'A' },
            { ...LINEA_VACIA, _localKey: 'k2', glosaLinea: 'B' },
            { ...LINEA_VACIA, _localKey: 'k3', glosaLinea: 'C' },
          ]}
        />,
      );

      // Reordenar: mover A (primera) a la posición de C (última) → orden B, C, A.
      const [idA, , idC] = idsDeFilas();
      dispararDrag(idA ?? '', idC ?? '');

      await waitFor(() => {
        const glosas = screen
          .getAllByRole('textbox', { name: 'Glosa de línea' })
          .map((el) => (el as HTMLInputElement).value);
        expect(glosas).toEqual(['B', 'C', 'A']);
      });

      // Alt+Delete con foco en el botón eliminar de la primera fila (ahora "B").
      const botonesEliminar = screen.getAllByRole('button', { name: /eliminar fila/i });
      botonesEliminar[0]!.focus();
      await user.keyboard('{Alt>}{Delete}{/Alt}');

      await waitFor(() => {
        const glosas = screen
          .getAllByRole('textbox', { name: 'Glosa de línea' })
          .map((el) => (el as HTMLInputElement).value);
        // Se eliminó "B" (la primera post-reorden), quedan C, A.
        expect(glosas).toEqual(['C', 'A']);
      });
    });
  });
});
