import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { mensajeConciliacion } from '@/lib/error-messages';

import { anularArranque } from '../api/anular-arranque';

/**
 * Anula una declaración de arranque. Invalida TODO el cache de la feature:
 * anular cambia cuál declaración aplica y, con ella, el informe entero
 * (ventana, partidas, residuo) además del historial.
 */
export function useAnularArranque() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      cuentaBancariaId,
      motivo,
    }: {
      id: string;
      cuentaBancariaId: string;
      motivo: string;
    }) => anularArranque(id, { cuentaBancariaId, motivo }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['informe-conciliacion'] });
      toast.success('Declaración anulada');
    },
    onError: (err) => {
      toast.error(mensajeConciliacion(err));
    },
  });
}
