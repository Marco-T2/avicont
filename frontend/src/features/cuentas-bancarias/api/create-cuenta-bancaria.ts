import { api } from '@/lib/api';
import type { CreateCuentaBancariaRequest, CuentaBancaria } from '@/types/api';

import type { CuentaBancariaFormValues } from '../schemas/cuenta-bancaria-form-schema';

export async function createCuentaBancaria(
  values: CuentaBancariaFormValues,
): Promise<CuentaBancaria> {
  const body: CreateCuentaBancariaRequest = {
    cuentaId: values.cuentaId,
    alias: values.alias,
    perfilExtracto: values.perfilExtracto,
    moneda: values.moneda,
    ...(values.numeroCuenta !== null && values.numeroCuenta !== ''
      ? { numeroCuenta: values.numeroCuenta }
      : {}),
  };
  const res = await api.post<CuentaBancaria>('/api/cuentas-bancarias', body);
  return res.data;
}
