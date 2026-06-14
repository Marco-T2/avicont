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
  // Regla auto⇒¬tributario: set-once, inmutable post-creación.
  numeracionAutomatica: z.boolean().default(false),
  // Solo aplica cuando numeracionAutomatica=true. Entero ≥ 1.
  numeroInicial: z
    .number()
    .int('El número inicial debe ser un entero')
    .min(1, 'El número inicial debe ser al menos 1')
    .nullable()
    .default(null),
});

export type TipoDocumentoFisicoFormValues = z.infer<typeof tipoDocumentoFisicoFormSchema>;

export const DEFAULT_CREATE_VALUES: TipoDocumentoFisicoFormValues = {
  nombre: '',
  codigo: '',
  esTributario: false,
  activo: true,
  tiposComprobanteAplicables: [],
  numeracionAutomatica: false,
  numeroInicial: null,
};

export function mapTipoToFormValues(t: TipoDocumentoFisico): TipoDocumentoFisicoFormValues {
  return {
    nombre: t.nombre,
    codigo: t.codigo,
    esTributario: t.esTributario,
    activo: t.activo,
    tiposComprobanteAplicables: t.tiposComprobanteAplicables,
    numeracionAutomatica: t.numeracionAutomatica,
    // api.generated.ts emite numeroInicial como Record<string,never>|null por quirk de
    // openapi-typescript con nullable Int. En runtime es number|null. Cast seguro.
    numeroInicial: (t.numeroInicial as number | null) ?? null,
  };
}
