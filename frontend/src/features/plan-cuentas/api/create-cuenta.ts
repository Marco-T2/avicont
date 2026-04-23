import { api } from '@/lib/api';
import type { Cuenta } from '@/types/api';

import type { CuentaFormValues } from '../schemas/cuenta-form-schema';

// El backend acepta el DTO con codigoPuct opcional; en este slice el mapeo
// PUCT va por el endpoint dedicado, así que NO se envía desde el form.
export async function createCuenta(values: CuentaFormValues): Promise<Cuenta> {
  const body = {
    codigoInterno: values.codigoInterno,
    nombre: values.nombre,
    ...(values.descripcion !== undefined && values.descripcion !== ''
      ? { descripcion: values.descripcion }
      : {}),
    claseCuenta: values.claseCuenta,
    ...(values.subClaseCuenta !== undefined
      ? { subClaseCuenta: values.subClaseCuenta }
      : {}),
    naturaleza: values.naturaleza,
    ...(values.parentId !== undefined ? { parentId: values.parentId } : {}),
    esDetalle: values.esDetalle,
    requiereContacto: values.requiereContacto,
    esContraria: values.esContraria,
    monedaFuncional: values.monedaFuncional,
    permiteMultiMoneda: values.permiteMultiMoneda,
  };
  const res = await api.post<Cuenta>('/api/cuentas', body);
  return res.data;
}
