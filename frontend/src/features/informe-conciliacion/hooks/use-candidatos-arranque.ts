import { useQuery } from '@tanstack/react-query';

import type { CandidatoPartidaArranque } from '@/types/api';

import { getCandidatosArranque } from '../api/get-candidatos-arranque';

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Partidas abiertas propuestas para una fecha de arranque.
 *
 * Se re-consulta cuando cambia la fecha: mover el punto de partida cambia por
 * completo qué quedó abierto. No corre con una fecha a medio escribir — el
 * input de tipo date emite valores intermedios inválidos.
 */
export function useCandidatosArranque(cuentaBancariaId: string, fecha: string) {
  return useQuery<CandidatoPartidaArranque[]>({
    queryKey: ['informe-conciliacion', 'candidatos-arranque', cuentaBancariaId, fecha],
    queryFn: () => getCandidatosArranque(cuentaBancariaId, fecha),
    enabled: cuentaBancariaId !== '' && FECHA_ISO.test(fecha),
  });
}
