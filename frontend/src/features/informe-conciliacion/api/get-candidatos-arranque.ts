import { api } from '@/lib/api';
import type { CandidatoPartidaArranque } from '@/types/api';

/**
 * GET /api/conciliacion/arranques/candidatos — las partidas que quedarían
 * ABIERTAS a una fecha, para que quien concilia confirme cuáles arrastrar.
 *
 * Lectura pura: no declara nada. Exige `contabilidad.conciliacion.conciliar`
 * porque es un paso de la declaración, no una consulta del informe.
 */
export async function getCandidatosArranque(
  cuentaBancariaId: string,
  fecha: string,
): Promise<CandidatoPartidaArranque[]> {
  const res = await api.get<CandidatoPartidaArranque[]>(
    '/api/conciliacion/arranques/candidatos',
    { params: { cuentaBancariaId, fecha } },
  );
  return res.data;
}
