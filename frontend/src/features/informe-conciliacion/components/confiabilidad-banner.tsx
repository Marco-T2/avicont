import { CheckCircle2 } from 'lucide-react';

import type { MotivoNoConciliado } from '@/types/api';

import { mensajeMotivo } from '../lib/mensajes-confiabilidad';

interface ConfiabilidadBannerProps {
  conciliado: boolean;
  motivos: MotivoNoConciliado[];
}

/**
 * La confiabilidad CALIFICA el informe, nunca lo suprime (REQ-ICB-05): con
 * insumos dañados los números se muestran igual y lo que se retiene es la
 * CONCLUSIÓN. Cada motivo llega traducido a lenguaje de contador — el enum
 * crudo jamás se pinta.
 *
 * Par claro/oscuro explícito en los colores de estado (mismo criterio que
 * `estado-movimiento-badge.tsx`): la intención de Anti-F-10 se respeta.
 */
export function ConfiabilidadBanner({
  conciliado,
  motivos,
}: ConfiabilidadBannerProps): React.JSX.Element | null {
  if (conciliado) {
    return (
      <div
        role="status"
        className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900 dark:bg-green-950/40"
      >
        <CheckCircle2
          className="mt-0.5 h-4 w-4 shrink-0 text-green-700 dark:text-green-400"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-semibold text-green-700 dark:text-green-400">Conciliado</p>
          <p className="text-sm text-green-700 dark:text-green-400">
            Con arranque declarado e insumos sanos, la identidad cierra con residuo cero: la
            diferencia entre extracto y libros queda explicada partida por partida.
          </p>
        </div>
      </div>
    );
  }

  if (motivos.length === 0) return null;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
      <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
        El informe se emite igual, pero no afirma que la cuenta esté conciliada:
      </p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {motivos.map((m) => (
          // Anti-F-06: sin id propio, la identidad del motivo es su contenido
          // completo (server data inmutable dentro del render).
          <li key={JSON.stringify(m)} className="text-sm text-amber-700 dark:text-amber-400">
            {mensajeMotivo(m)}
          </li>
        ))}
      </ul>
    </div>
  );
}
