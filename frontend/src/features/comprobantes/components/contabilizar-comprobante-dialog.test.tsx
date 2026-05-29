import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContabilizarComprobanteDialog } from './contabilizar-comprobante-dialog';

const mockMutate = vi.fn();

vi.mock('../hooks/use-contabilizar-comprobante', () => ({
  useContabilizarComprobante: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function renderDialog(props: Partial<Parameters<typeof ContabilizarComprobanteDialog>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ContabilizarComprobanteDialog
        open={true}
        onOpenChange={vi.fn()}
        comprobanteId="comp-1"
        glosa="Pago de servicios"
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('ContabilizarComprobanteDialog', () => {
  describe('comportamiento base', () => {
    it('renderiza el diálogo con la glosa', () => {
      renderDialog();
      expect(screen.getByText('¿Contabilizar este comprobante?')).toBeInTheDocument();
      expect(screen.getByText('Pago de servicios')).toBeInTheDocument();
    });

    it('tiene botón "Contabilizar" y "Cancelar"', () => {
      renderDialog();
      expect(screen.getByRole('button', { name: 'Contabilizar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    });

    it('llama a mutate al confirmar', async () => {
      const user = userEvent.setup();
      renderDialog();
      await user.click(screen.getByRole('button', { name: 'Contabilizar' }));
      expect(mockMutate).toHaveBeenCalled();
    });

    it('no muestra glosa cuando es undefined', () => {
      renderDialog({ glosa: undefined });
      expect(screen.queryByText('Pago de servicios')).not.toBeInTheDocument();
    });
  });

  describe('REQ-CCL-UI-02 — Aviso pre-contabilizar de contacto faltante', () => {
    it('muestra aviso en español cuando hay líneas sin contacto requerido', () => {
      renderDialog({ lineasSinContacto: [1, 3] });
      // Debe mostrar aviso con role alert
      expect(screen.getByRole('alert')).toBeInTheDocument();
      // Debe mencionar las líneas afectadas
      expect(screen.getByText(/línea 1/i)).toBeInTheDocument();
      expect(screen.getByText(/línea 3/i)).toBeInTheDocument();
    });

    it('NO despacha la mutación cuando hay líneas sin contacto requerido', async () => {
      const user = userEvent.setup();
      renderDialog({ lineasSinContacto: [2] });

      const btnContabilizar = screen.getByRole('button', { name: 'Contabilizar' });
      await user.click(btnContabilizar);

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('NO muestra aviso cuando todas las líneas tienen contacto (lineasSinContacto vacío)', () => {
      renderDialog({ lineasSinContacto: [] });
      expect(screen.queryByText(/línea 1/i)).not.toBeInTheDocument();
    });

    it('NO muestra aviso cuando lineasSinContacto es undefined', () => {
      renderDialog({ lineasSinContacto: undefined });
      // Sin el aviso, el botón funciona normalmente
      expect(screen.queryByText(/línea \d/i)).not.toBeInTheDocument();
    });

    it('permite contabilizar cuando lineasSinContacto es un array vacío', async () => {
      const user = userEvent.setup();
      renderDialog({ lineasSinContacto: [] });

      await user.click(screen.getByRole('button', { name: 'Contabilizar' }));
      expect(mockMutate).toHaveBeenCalled();
    });
  });
});
