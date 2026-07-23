import { z } from 'zod';

import { PerfilExtracto } from '@/types/api';
import type { CuentaBancaria } from '@/types/api';

export const cuentaBancariaFormSchema = z.object({
  // No se valida formato UUID: el valor siempre sale del CuentaSelector
  // (nunca tipeado a mano por el usuario), un min(1) alcanza como validación UI.
  cuentaId: z.string().min(1, 'Seleccioná una cuenta del plan'),
  alias: z
    .string()
    .min(1, 'El alias es requerido')
    .max(100, 'El alias no puede superar 100 caracteres'),
  perfilExtracto: z.enum([
    PerfilExtracto.BANCOSOL_XLSX,
    PerfilExtracto.ECONOMICO_XLSX,
    PerfilExtracto.UNION_XLSX,
  ]),
  // Puede quedar vacío al crear — se captura en la primera importación (REQ-CB-16).
  numeroCuenta: z
    .string()
    .max(50, 'El número de cuenta no puede superar 50 caracteres')
    .nullable()
    .default(null),
  moneda: z.enum(['BOB', 'USD']),
  activa: z.boolean().default(true),
});

export type CuentaBancariaFormValues = z.infer<typeof cuentaBancariaFormSchema>;

export const DEFAULT_CREATE_VALUES: CuentaBancariaFormValues = {
  cuentaId: '',
  alias: '',
  perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
  numeroCuenta: null,
  moneda: 'BOB',
  activa: true,
};

export function mapCuentaBancariaToFormValues(cb: CuentaBancaria): CuentaBancariaFormValues {
  return {
    cuentaId: cb.cuentaId,
    alias: cb.alias,
    perfilExtracto: cb.perfilExtracto,
    numeroCuenta: cb.numeroCuenta,
    moneda: cb.moneda,
    activa: cb.activa,
  };
}
