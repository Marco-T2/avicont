import { CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';

/**
 * Banner de confirmación del estado TODOS_CONTABILIZADO.
 * Muestra el mensaje de éxito y un CTA para ir a cerrar la gestión.
 */
export function CierreConfirmadoBanner(): React.JSX.Element {
  return (
    <div
      role="status"
      className="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/40 px-4 py-4"
    >
      <CheckCircle2 className="h-6 w-6 shrink-0 text-green-600 dark:text-green-400" />
      <div className="flex-1 space-y-1">
        <p className="text-sm font-semibold text-green-800 dark:text-green-300">
          Cierre del ejercicio contabilizado correctamente.
        </p>
        <p className="text-xs text-green-700 dark:text-green-400">
          Los asientos de cierre fueron contabilizados. Podés proceder a cerrar la gestión fiscal.
        </p>
      </div>
      <Button asChild variant="outline" size="sm" className="shrink-0">
        <Link to="/periodos-fiscales">Cerrar gestión</Link>
      </Button>
    </div>
  );
}
