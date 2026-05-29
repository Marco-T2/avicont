import { z } from 'zod';

import type { TipoDocumentoFisico } from '@/types/api';

export const tipoDocumentoFisicoFormSchema = z.object({
  nombre: z
    .string()
    .min(1, 'El nombre es requerido')
    .max(100, 'El nombre no puede superar 100 caracteres'),
  codigo: z
    .string()
    .min(1, 'El código es requerido')
    .max(20, 'El código no puede superar 20 caracteres')
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Debe ser kebab-case alfanumérico (ej: factura-recibida)',
    ),
  esTributario: z.boolean().default(false),
  activo: z.boolean().default(true),
  // Array vacío es permitido — el backend no requiere mínimo 1 (solo @IsArray()).
  tiposComprobanteAplicables: z
    .array(
      z.enum([
        'APERTURA',
        'DIARIO',
        'INGRESO',
        'EGRESO',
        'AJUSTE',
        'TRASPASO',
        'CIERRE',
      ]),
    )
    .default([]),
});

export type TipoDocumentoFisicoFormValues = z.infer<typeof tipoDocumentoFisicoFormSchema>;

export const DEFAULT_CREATE_VALUES: TipoDocumentoFisicoFormValues = {
  nombre: '',
  codigo: '',
  esTributario: false,
  activo: true,
  tiposComprobanteAplicables: [],
};

export function mapTipoToFormValues(t: TipoDocumentoFisico): TipoDocumentoFisicoFormValues {
  return {
    nombre: t.nombre,
    codigo: t.codigo,
    esTributario: t.esTributario,
    activo: t.activo,
    tiposComprobanteAplicables: t.tiposComprobanteAplicables,
  };
}
