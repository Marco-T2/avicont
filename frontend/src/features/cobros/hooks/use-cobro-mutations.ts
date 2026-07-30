import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { UpdateCobroRequest } from '@/types/api';

import { anularCobro } from '../api/anular-cobro';
import { contabilizarCobro } from '../api/contabilizar-cobro';
import { deleteCobro } from '../api/delete-cobro';
import { updateCobro } from '../api/update-cobro';
import { mensajeCobros } from '../lib/mensaje-cobros';

/**
 * Invalidación para HECHOS CONTABLES del cobro (crear/editar/contabilizar/
 * anular): además de la feature, se invalidan el estado de cuenta (saldos
 * derivados) y los comprobantes (el cobro genera/regenera su asiento INGRESO).
 */
export function useInvalidateCobros(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['cobros'] });
    void qc.invalidateQueries({ queryKey: ['estado-cuenta'] });
    void qc.invalidateQueries({ queryKey: ['comprobantes'] });
  };
}

export function useUpdateCobro(id: string) {
  const invalidate = useInvalidateCobros();
  return useMutation({
    mutationFn: (body: UpdateCobroRequest) => updateCobro(id, body),
    onSuccess: () => {
      invalidate();
      toast.success('Cambios guardados');
    },
    onError: (err) => {
      toast.error(mensajeCobros(err, 'No se pudieron guardar los cambios'));
    },
  });
}

export function useEliminarCobro(id: string) {
  const invalidate = useInvalidateCobros();
  return useMutation({
    mutationFn: () => deleteCobro(id),
    onSuccess: () => {
      invalidate();
      toast.success('Borrador eliminado');
    },
    onError: (err) => {
      toast.error(mensajeCobros(err, 'No se pudo eliminar el borrador'));
    },
  });
}

export function useContabilizarCobro(id: string) {
  const invalidate = useInvalidateCobros();
  return useMutation({
    mutationFn: () => contabilizarCobro(id),
    onSuccess: (data) => {
      invalidate();
      toast.success(`Cobro contabilizado — comprobante ${data.numero}`);
    },
    onError: (err) => {
      toast.error(mensajeCobros(err, 'No se pudo contabilizar el cobro'));
    },
  });
}

export function useAnularCobro(id: string) {
  const invalidate = useInvalidateCobros();
  return useMutation({
    mutationFn: (motivo: string) => anularCobro(id, motivo),
    onSuccess: () => {
      invalidate();
      toast.success('Cobro anulado — las ventas volvieron a quedar pendientes');
    },
    onError: (err) => {
      toast.error(mensajeCobros(err, 'No se pudo anular el cobro'));
    },
  });
}
