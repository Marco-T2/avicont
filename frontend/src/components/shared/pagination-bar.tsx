import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface PaginationBarProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

/**
 * Barra de paginación con botones prev/next.
 * Calcula totalPages = Math.ceil(total / limit).
 * Botones deshabilitados en los extremos.
 */
export function PaginationBar({
  page,
  limit,
  total,
  onPageChange,
}: PaginationBarProps): React.JSX.Element | null {
  const totalPages = Math.ceil(total / limit);

  // No renderizar si solo hay 1 página
  if (totalPages <= 1) return null;

  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <div className="flex items-center justify-between gap-4 px-1 py-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page - 1)}
        disabled={!hasPrev}
        className="gap-1"
        aria-label="Página anterior"
      >
        <ChevronLeft className="h-4 w-4" />
        Anterior
      </Button>

      <span className="text-sm text-muted-foreground tabular-nums">
        Página {page} de {totalPages}
      </span>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={!hasNext}
        className="gap-1"
        aria-label="Página siguiente"
      >
        Siguiente
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
