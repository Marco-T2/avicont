import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { WorkspaceConciliacionParams } from '@/types/api';

import { getWorkspaceConciliacion } from '../api/get-workspace-conciliacion';

/**
 * Workspace de conciliación. Solo dispara cuando hay cuenta bancaria Y rango
 * completo — el backend exige los 3 parámetros.
 *
 * `keepPreviousData`: al cambiar de rango la pantalla no parpadea en vacío.
 */
export function useWorkspaceConciliacion(params: WorkspaceConciliacionParams | null) {
  return useQuery({
    queryKey: ['conciliacion', 'workspace', params],
    queryFn: () => {
      if (params === null) throw new Error('params requeridos para el workspace');
      return getWorkspaceConciliacion(params);
    },
    enabled: params !== null,
    placeholderData: keepPreviousData,
  });
}
