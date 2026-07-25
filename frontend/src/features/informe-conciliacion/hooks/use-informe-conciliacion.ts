import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { InformeConciliacionParams } from '@/types/api';

import { getInformeConciliacion } from '../api/get-informe-conciliacion';

/**
 * Informe de conciliación a una fecha de corte. Solo dispara con cuenta
 * bancaria Y corte elegidos — el backend exige ambos parámetros.
 *
 * La ABSTENCIÓN llega como `data` normal (200), no como `error`: sin arranque
 * declarado `data.arranque === null` (y `partidas`/`residuo` también), con los
 * saldos presentes y `SIN_ARRANQUE` entre `data.confiabilidad.motivos`
 * (REQ-ICB-04/05). La vista discrimina; el hook no la degrada.
 *
 * `keepPreviousData`: al cambiar el corte la pantalla no parpadea en vacío.
 */
export function useInformeConciliacion(params: InformeConciliacionParams | null) {
  return useQuery({
    queryKey: ['informe-conciliacion', 'informe', params],
    queryFn: () => {
      if (params === null) throw new Error('params requeridos para el informe');
      return getInformeConciliacion(params);
    },
    enabled: params !== null,
    placeholderData: keepPreviousData,
  });
}
