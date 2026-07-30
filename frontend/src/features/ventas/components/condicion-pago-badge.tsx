import { Badge } from '@/components/ui/badge';
import type { CondicionPago } from '@/types/api';

const LABEL: Record<CondicionPago, string> = {
  CONTADO: 'Contado',
  CREDITO: 'Crédito',
};

/** Badge de la condición de pago de la venta (CONTADO/CREDITO). */
export function CondicionPagoBadge({
  condicionPago,
}: {
  condicionPago: CondicionPago;
}): React.JSX.Element {
  return (
    <Badge variant="outline" className="font-normal text-xs">
      {LABEL[condicionPago]}
    </Badge>
  );
}
