import { api } from '@/lib/api';
import type { Cuenta } from '@/types/api';

import type { CuentaFormValues } from '../schemas/cuenta-form-schema';

// UpdateCuentaDto del backend acepta: nombre, descripcion, requiereContacto,
// permiteMultiMoneda, monedaFuncional, actividadFlujo (nullable).
// Los campos estructurales se ignoran silenciosamente por whitelist del pipe.
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
    // undefined del form (campo no tocado en create) → null explícito al backend
    // para mantener semántica "sin clasificar". Cuando el campo tiene valor, lo manda.
    actividadFlujo: values.actividadFlujo ?? null,
  };
  const res = await api.patch<Cuenta>(`/api/cuentas/${id}`, body);
  return res.data;
}
