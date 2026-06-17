import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// Cross-feature: POST contabilizar un comprobante de cierre.
// Se llama directo desde el hook (no el hook envoltorio de comprobantes)
// porque la orquestación secuencial necesita control fino del loop. §5.3 del design.
import { contabilizarComprobante } from '@/features/comprobantes/api/contabilizar-comprobante';
import { mensajeComprobantes } from '@/lib/error-messages';
import type { EstadoComprobante } from '@/types/api';

export type EstadoPaso = 'pendiente' | 'contabilizando' | 'contabilizado' | 'error';

export interface ProgresoPaso {
  comprobanteId: string;
  estado: EstadoPaso;
  error?: string;
}

/**
 * Hook orquestador para contabilizar los comprobantes de cierre secuencialmente.
 * - for...of + await (NO Promise.all) para garantizar orden y parada temprana.
 * - Resumable: los ya CONTABILIZADO se saltan automáticamente.
 * - Anti-F-07: isPending se vuelve false tanto en éxito como en error.
 */
export function useContabilizarCierre(gestionId: string) {
  const qc = useQueryClient();
  const [progreso, setProgreso] = useState<ProgresoPaso[]>([]);
  const [isPending, setIsPending] = useState(false);

  function marcarPaso(
    comprobanteId: string,
    estado: EstadoPaso,
    errorMsg?: string,
  ): void {
    setProgreso((prev) =>
      prev.map((p) =>
        p.comprobanteId === comprobanteId
          ? { ...p, estado, ...(errorMsg !== undefined ? { error: errorMsg } : {}) }
          : p,
      ),
    );
  }

  async function contabilizar(
    cierres: { id: string; estado: EstadoComprobante }[],
  ): Promise<{ ok: boolean; falloEn?: string }> {
    setIsPending(true);

    // Inicializar progreso: los ya CONTABILIZADO arrancan en 'contabilizado'.
    setProgreso(
      cierres.map((c) => ({
        comprobanteId: c.id,
        estado: c.estado === 'CONTABILIZADO' ? 'contabilizado' : 'pendiente',
      })),
    );

    for (const cierre of cierres) {
      if (cierre.estado === 'CONTABILIZADO') continue; // resumable: saltar ya posteados

      marcarPaso(cierre.id, 'contabilizando');

      try {
        await contabilizarComprobante(cierre.id);
        marcarPaso(cierre.id, 'contabilizado');
      } catch (err) {
        marcarPaso(cierre.id, 'error', mensajeComprobantes(err));
        setIsPending(false);
        return { ok: false, falloEn: cierre.id }; // PARADA TEMPRANA
      }
    }

    // Éxito total: invalidar para refrescar estados desde el backend.
    void qc.invalidateQueries({ queryKey: ['cierre-ejercicio', gestionId] });
    void qc.invalidateQueries({ queryKey: ['comprobantes'] });

    setIsPending(false);
    return { ok: true };
  }

  return { contabilizar, progreso, isPending };
}
