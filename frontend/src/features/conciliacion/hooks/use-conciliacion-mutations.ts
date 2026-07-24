import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { mensajeConciliacion } from '@/lib/error-messages';
import type { ActualizarEstadoMovimientoRequest, CrearMatchRequest } from '@/types/api';

import { actualizarEstadoMovimiento } from '../api/actualizar-estado-movimiento';
import { borrarMatch } from '../api/borrar-match';
import { crearMatch } from '../api/crear-match';

/**
 * Invalida TODO el cache de la feature. Cualquier escritura cambia el
 * `estadoEfectivo` derivado y el pool de sugerencias de la misma respuesta
 * (REQ-CB-11/12) — refrescar solo una fila mostraría un panel desincronizado.
 */
function useInvalidarConciliacion(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['conciliacion'] });
  };
}

/** REQ-CB-17: confirmar el par movimiento ↔ línea contable. */
export function useCrearMatch() {
  const invalidar = useInvalidarConciliacion();
  return useMutation({
    mutationFn: (body: CrearMatchRequest) => crearMatch(body),
    onSuccess: () => {
      invalidar();
      toast.success('Movimiento conciliado');
    },
    onError: (err) => {
      toast.error(mensajeConciliacion(err));
    },
  });
}

/** REQ-CB-17: deshacer un match — el comprobante NO se toca. */
export function useBorrarMatch() {
  const invalidar = useInvalidarConciliacion();
  return useMutation({
    mutationFn: (matchId: string) => borrarMatch(matchId),
    onSuccess: () => {
      invalidar();
      toast.success('Match deshecho');
    },
    onError: (err) => {
      toast.error(mensajeConciliacion(err));
    },
  });
}

/** REQ-CB-18: ignorar / des-ignorar un movimiento bancario. */
export function useCambiarEstadoMovimiento() {
  const invalidar = useInvalidarConciliacion();
  return useMutation({
    mutationFn: (vars: { id: string; estado: ActualizarEstadoMovimientoRequest['estado'] }) =>
      actualizarEstadoMovimiento(vars.id, { estado: vars.estado }),
    onSuccess: (_data, vars) => {
      invalidar();
      toast.success(
        vars.estado === 'IGNORADO' ? 'Movimiento ignorado' : 'Movimiento devuelto a pendiente',
      );
    },
    onError: (err) => {
      toast.error(mensajeConciliacion(err));
    },
  });
}
