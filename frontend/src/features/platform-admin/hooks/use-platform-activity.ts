import { useInfiniteQuery } from '@tanstack/react-query';

import { getPlatformActivity } from '../api/get-platform-activity';

export interface UsePlatformActivityOptions {
  /** UUID de la organización para filtrar (opcional). */
  orgId?: string;
  /** Cantidad de items por página (backend default 20, máximo 100). */
  limit?: number;
}

/**
 * Timeline de actividad de plataforma (super-admin). Usa cursor-based infinite
 * pagination: el backend devuelve `{ items, nextCursor }`.
 *
 * Patrón useInfiniteQuery (TanStack v5):
 *   - `initialPageParam`: cursor inicial = undefined (primera página sin cursor).
 *   - `getNextPageParam`: extrae `nextCursor` de la última página;
 *     `undefined` indica que no hay más páginas (TanStack v5 detiene fetchNextPage).
 *
 * queryKey ['platform-activity', orgId, limit] — varía por filtros.
 */
export function usePlatformActivity(options: UsePlatformActivityOptions = {}) {
  const { orgId, limit } = options;

  return useInfiniteQuery({
    queryKey: ['platform-activity', orgId, limit],
    queryFn: ({ pageParam }) =>
      getPlatformActivity({
        cursor: pageParam,
        ...(orgId !== undefined ? { orgId } : {}),
        ...(limit !== undefined ? { limit } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
