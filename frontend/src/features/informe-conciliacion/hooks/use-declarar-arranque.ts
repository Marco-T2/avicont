import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { mensajeConciliacion } from '@/lib/error-messages';
import type { DeclararArranqueRequest } from '@/types/api';

import { declararArranque } from '../api/declarar-arranque';

/**
 * Declara un punto de arranque conciliado (REQ-ICB-04). Invalida TODO el cache
 * de la feature: un arranque nuevo puede cambiar cuál declaración aplica y,
 * con ella, el informe entero (ventana, partidas, residuo) y el historial.
 */
export function useDeclararArranque() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DeclararArranqueRequest) => declararArranque(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['informe-conciliacion'] });
      toast.success('Arranque declarado');
    },
    onError: (err) => {
      toast.error(mensajeConciliacion(err));
    },
  });
}
