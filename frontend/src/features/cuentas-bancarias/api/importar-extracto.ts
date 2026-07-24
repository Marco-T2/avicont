import { api } from '@/lib/api';
import type { ImportarExtractoResponse } from '@/types/api';

export interface ImportarExtractoVars {
  cuentaBancariaId: string;
  file: File;
  /**
   * Segundo viaje del flujo de REQ-CB-16: la cuenta no tenía `numeroCuenta`
   * cargado, el parser lo detectó en la cabecera del archivo y el usuario lo
   * confirmó. Sin esta confirmación explícita el backend NO persiste nada.
   */
  confirmarNumeroCuenta?: boolean;
}

/**
 * POST /api/cuentas-bancarias/:id/importaciones — Importa un extracto (multipart).
 *
 * Siempre responde 200: el resultado exitoso es un resumen de operación
 * (contadores + checksum), y el caso "falta confirmar el número de cuenta"
 * tampoco crea nada. El discriminador es `requiereConfirmacionCuenta`.
 */
export async function importarExtracto({
  cuentaBancariaId,
  file,
  confirmarNumeroCuenta = false,
}: ImportarExtractoVars): Promise<ImportarExtractoResponse> {
  const formData = new FormData();
  formData.append('file', file);
  // multipart no tipa booleanos: el backend espera el string 'true'/'false'.
  if (confirmarNumeroCuenta) formData.append('confirmarNumeroCuenta', 'true');

  const res = await api.post<ImportarExtractoResponse>(
    `/api/cuentas-bancarias/${cuentaBancariaId}/importaciones`,
    formData,
  );
  return res.data;
}
