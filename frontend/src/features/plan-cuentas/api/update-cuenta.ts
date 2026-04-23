import { api } from '@/lib/api';
import type { Cuenta } from '@/types/api';

import type { CuentaFormValues } from '../schemas/cuenta-form-schema';

// UpdateCuentaDto del backend solo acepta: nombre, descripcion,
// requiereContacto, permiteMultiMoneda, monedaFuncional. Los campos
// estructurales se ignoran silenciosamente por whitelist del pipe.
export async function updateCuenta(
  id: string,
  values: CuentaFormValues,
): Promise<Cuenta> {
  const body = {
    nombre: values.nombre,
    descripcion:
      values.descripcion !== undefined && values.descripcion !== ''
        ? values.descripcion
        : null,
    requiereContacto: values.requiereContacto,
    permiteMultiMoneda: values.permiteMultiMoneda,
    monedaFuncional: values.monedaFuncional,
  };
  const res = await api.patch<Cuenta>(`/api/cuentas/${id}`, body);
  return res.data;
}
