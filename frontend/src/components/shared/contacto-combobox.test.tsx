import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContactoCombobox } from './contacto-combobox';

// Mock de useContactos para controlar respuestas en tests sin red real.
const mockUseContactos = vi.fn();
vi.mock('@/features/contactos/hooks/use-contactos', () => ({
  useContactos: (...args: unknown[]) => mockUseContactos(...args),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function renderCombobox(props: Partial<Parameters<typeof ContactoCombobox>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ContactoCombobox
        value={null}
        onSelect={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('ContactoCombobox', () => {
  it('renderiza sin errores con value=null', () => {
    mockUseContactos.mockReturnValue({ data: undefined, isLoading: false });
    renderCombobox({ value: null });
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('muestra el placeholder por defecto cuando no hay contacto seleccionado', () => {
    mockUseContactos.mockReturnValue({ data: undefined, isLoading: false });
    renderCombobox({ value: null });
    expect(screen.getByText('Seleccionar contacto…')).toBeInTheDocument();
  });

  it('muestra placeholder personalizado', () => {
    mockUseContactos.mockReturnValue({ data: undefined, isLoading: false });
    renderCombobox({ value: null, placeholder: 'Elegir…' });
    expect(screen.getByText('Elegir…')).toBeInTheDocument();
  });

  it('muestra "Sin resultados" cuando el hook devuelve array vacío', async () => {
    const user = userEvent.setup();
    mockUseContactos.mockReturnValue({ data: { items: [] }, isLoading: false });
    renderCombobox({ value: null });

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => {
      expect(screen.getByText('No se encontraron contactos.')).toBeInTheDocument();
    });
  });

  it('muestra los contactos cuando el hook devuelve resultados', async () => {
    const user = userEvent.setup();
    mockUseContactos.mockReturnValue({
      data: {
        items: [
          { id: 'c-1', razonSocial: 'Avícola Sur' },
          { id: 'c-2', razonSocial: 'Granja Norte' },
        ],
      },
      isLoading: false,
    });
    renderCombobox({ value: null });

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => {
      expect(screen.getByText('Avícola Sur')).toBeInTheDocument();
      expect(screen.getByText('Granja Norte')).toBeInTheDocument();
    });
  });

  it('llama a onSelect con el id al seleccionar un contacto', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    mockUseContactos.mockReturnValue({
      data: {
        items: [{ id: 'c-1', razonSocial: 'Avícola Sur' }],
      },
      isLoading: false,
    });
    renderCombobox({ value: null, onSelect });

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => expect(screen.getByText('Avícola Sur')).toBeInTheDocument());
    await user.click(screen.getByText('Avícola Sur'));

    expect(onSelect).toHaveBeenCalledWith('c-1');
  });

  it('muestra razonSocial cuando value está seleccionado y contacto cargado', () => {
    mockUseContactos.mockReturnValue({
      data: {
        items: [{ id: 'c-1', razonSocial: 'Avícola Sur' }],
      },
      isLoading: false,
    });
    renderCombobox({ value: 'c-1' });
    expect(screen.getByText('Avícola Sur')).toBeInTheDocument();
  });

  it('muestra "Cargando…" cuando value está seteado pero contactos aún no llegaron', () => {
    mockUseContactos.mockReturnValue({ data: undefined, isLoading: false });
    renderCombobox({ value: 'c-1' });
    expect(screen.getByText('Cargando…')).toBeInTheDocument();
  });

  it('muestra "Buscando…" cuando isLoading=true', async () => {
    const user = userEvent.setup();
    mockUseContactos.mockReturnValue({ data: undefined, isLoading: true });
    renderCombobox({ value: null });

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => {
      expect(screen.getByText('Buscando…')).toBeInTheDocument();
    });
  });

  it('está deshabilitado cuando disabled=true', () => {
    mockUseContactos.mockReturnValue({ data: undefined, isLoading: false });
    renderCombobox({ value: null, disabled: true });
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('muestra opción "Ninguno" para limpiar cuando hay un valor seleccionado', async () => {
    const user = userEvent.setup();
    mockUseContactos.mockReturnValue({
      data: {
        items: [{ id: 'c-1', razonSocial: 'Avícola Sur' }],
      },
      isLoading: false,
    });
    renderCombobox({ value: 'c-1' });

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => {
      expect(screen.getByText('Ninguno (quitar contacto)')).toBeInTheDocument();
    });
  });

  it('llama a onSelect(null) al limpiar la selección', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    mockUseContactos.mockReturnValue({
      data: {
        items: [{ id: 'c-1', razonSocial: 'Avícola Sur' }],
      },
      isLoading: false,
    });
    renderCombobox({ value: 'c-1', onSelect });

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => expect(screen.getByText('Ninguno (quitar contacto)')).toBeInTheDocument());
    await user.click(screen.getByText('Ninguno (quitar contacto)'));

    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

// ============================================================
// W-03 — Debounce: múltiples keystrokes NO disparan una búsqueda por tecla
// ============================================================

describe('ContactoCombobox — debounce de búsqueda (W-03)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('tipear múltiples caracteres no dispara useContactos con q por cada tecla antes de 350 ms', () => {
    // Capturar los valores de q con los que se invoca useContactos.
    const qsRecibidos: string[] = [];
    mockUseContactos.mockImplementation((params: { q?: string }) => {
      if (params?.q !== undefined) {
        qsRecibidos.push(params.q);
      }
      return { data: { items: [] }, isLoading: false };
    });

    renderCombobox({ value: null });

    // Abrir el popover con fireEvent (síncrono, no avanza fake timers)
    act(() => {
      fireEvent.click(screen.getByRole('combobox'));
    });

    const input = screen.getByPlaceholderText('Buscar contacto…');

    // Tipear 'A', 'AB', 'ABC' usando fireEvent.change (síncrono, sin timers de userEvent)
    act(() => {
      fireEvent.change(input, { target: { value: 'A' } });
    });
    act(() => {
      fireEvent.change(input, { target: { value: 'AB' } });
    });
    act(() => {
      fireEvent.change(input, { target: { value: 'ABC' } });
    });

    // Inmediatamente después de los cambios: el debouncedSearch todavía es '' porque
    // el timeout de 350 ms no expiró. useContactos NO debe haber recibido q aún.
    expect(qsRecibidos.length).toBe(0);

    // Avanzar el reloj 350 ms: ahora el useDebouncedValue dispara con 'ABC'.
    act(() => {
      vi.advanceTimersByTime(350);
    });

    // Después del bounce, useContactos recibe q='ABC' (un solo call, no 3).
    expect(qsRecibidos).toContain('ABC');
    // Solo 1 call con q — no hubo 3 calls (una por tecla).
    expect(qsRecibidos.length).toBe(1);
  });
});
