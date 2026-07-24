import { api } from '@/lib/api';
import type { CuentaBancaria, UpdateCuentaBancariaRequest } from '@/types/api';

import type { CuentaBancariaFormValues } from '../schemas/cuenta-bancaria-form-schema';

// cuentaId y perfilExtracto son inmutables post-creación (backend no los
// expone en UpdateCuentaBancariaDto) — no se envían acá.
export async function updateCuentaBancaria(
  id: string,
  values: CuentaBancariaFormValues,
): Promise<CuentaBancaria> {
  const body: UpdateCuentaBancariaRequest = {
    alias: values.alias,
    moneda: values.moneda,
    activa: values.activa,
    // api.generated.ts emite numeroCuenta como Record<string,never>|null por
    // quirk de openapi-typescript con nullable string (mismo patrón que
    // numeroInicial en tipos-documento-fisico). En runtime es string|null.
    numeroCuenta: values.numeroCuenta as UpdateCuentaBancariaRequest['numeroCuenta'],
  };
  const res = await api.patch<CuentaBancaria>(`/api/cuentas-bancarias/${id}`, body);
  return res.data;
}
