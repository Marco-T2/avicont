import { useQuery } from '@tanstack/react-query';

import type { ListarPeriodosParams } from '@/types/api';

import { getPeriodos } from '../api/get-periodos';

export function usePeriodos(params: ListarPeriodosParams = {}) {
  return useQuery({
    queryKey: ['periodos-fiscales', 'periodos', params],
    queryFn: () => getPeriodos(params),
  });
}
