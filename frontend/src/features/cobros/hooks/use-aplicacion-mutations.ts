import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { CrearAplicacionRequest, EditarAplicacionRequest } from '@/types/api';

import { crearAplicacion } from '../api/crear-aplicacion';
import { editarAplicacion } from '../api/editar-aplicacion';
import { eliminarAplicacion } from '../api/eliminar-aplicacion';
import { mensajeCobros } from '../lib/mensaje-cobros';

/**
 * Invalidación para APLICACIONES: cobros + estado de cuenta. A propósito NO
 * invalida ['comprobantes'] — una aplicación no genera asiento ni toca ningún
 * comprobante (D-03): el comprobante del cobro queda byte-idéntico.
 */
export function useInvalidateAplicaciones(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['cobros'] });
    void qc.invalidateQueries({ queryKey: ['estado-cuenta'] });
  };
}

export function useCrearAplicacion(cobroId: string) {
  const invalidate = useInvalidateAplicaciones();
  return useMutation({
    mutationFn: (body: CrearAplicacionRequest) => crearAplicacion(cobroId, body),
    onSuccess: () => {
      invalidate();
      toast.success('Aplicación registrada');
    },
    onError: (err) => {
      toast.error(mensajeCobros(err, 'No se pudo aplicar el cobro a la venta'));
    },
  });
}

export function useEditarAplicacion(cobroId: string) {
  const invalidate = useInvalidateAplicaciones();
  return useMutation({
    mutationFn: (input: { aplicacionId: string; body: EditarAplicacionRequest }) =>
      editarAplicacion(cobroId, input.aplicacionId, input.body),
    onSuccess: () => {
      invalidate();
      toast.success('Aplicación actualizada');
    },
    onError: (err) => {
      toast.error(mensajeCobros(err, 'No se pudo actualizar la aplicación'));
    },
  });
}

export function useEliminarAplicacion(cobroId: string) {
  const invalidate = useInvalidateAplicaciones();
  return useMutation({
    mutationFn: (aplicacionId: string) => eliminarAplicacion(cobroId, aplicacionId),
    onSuccess: () => {
      invalidate();
      toast.success('Aplicación quitada — la venta vuelve a quedar pendiente');
    },
    onError: (err) => {
      toast.error(mensajeCobros(err, 'No se pudo quitar la aplicación'));
    },
  });
}
