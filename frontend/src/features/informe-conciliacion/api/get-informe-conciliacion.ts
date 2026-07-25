import { api } from '@/lib/api';
import type { InformeConciliacion, InformeConciliacionParams } from '@/types/api';

/**
 * GET /api/conciliacion/informe — el puente a una fecha de corte:
 * saldo según extracto ± partidas = saldo según libros (REQ-ICB-01/02).
 *
 * LECTURA PURA (REQ-ICB-04): consultar jamás crea, modifica ni infiere un
 * arranque. Sin arranque declarado la respuesta es 200 ABSTENIDA — `arranque`,
 * `partidas` y `residuo` en `null`, saldos presentes y motivo `SIN_ARRANQUE`
 * en `confiabilidad` — NO un error (REQ-ICB-05).
 */
export async function getInformeConciliacion(
  params: InformeConciliacionParams,
): Promise<InformeConciliacion> {
  const res = await api.get<InformeConciliacion>('/api/conciliacion/informe', { params });
  return res.data;
}
