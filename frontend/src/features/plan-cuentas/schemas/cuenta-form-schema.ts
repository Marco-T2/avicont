import { z } from 'zod';

import {
  ClaseCuenta,
  Moneda,
  NaturalezaCuenta,
  SubClaseCuenta,
} from '@/types/api';

// Schema que replica las invariantes del backend (backend/src/cuentas/domain/
// cuenta-validator.ts). Defensa en frontend — la validación real vuelve a
// correrse en el servidor. Si algún check cruzado es complejo (ej. nivel
// derivado del código debe coincidir con parent.nivel+1), lo dejamos al
// backend y mostramos el error code del response.
export const cuentaFormSchema = z
  .object({
    codigoInterno: z
      .string()
      .min(1, 'El código interno es obligatorio')
      .regex(
        /^[0-9]+(\.[0-9]+)*$/,
        'Formato: segmentos numéricos separados por punto (ej. "1.1.1.001")',
      )
      .refine(
        (v) => v.split('.').length <= 8,
        'El código interno excede el máximo de 8 niveles',
      ),
    nombre: z
      .string()
      .min(1, 'El nombre es obligatorio')
      .max(200, 'Máximo 200 caracteres'),
    descripcion: z
      .string()
      .max(500, 'Máximo 500 caracteres')
      .optional()
      .or(z.literal('')),
    claseCuenta: z.enum(
      [
        ClaseCuenta.ACTIVO,
        ClaseCuenta.PASIVO,
        ClaseCuenta.PATRIMONIO,
        ClaseCuenta.INGRESO,
        ClaseCuenta.EGRESO,
      ] as const,
    ),
    subClaseCuenta: z
      .enum([
        SubClaseCuenta.ACTIVO_CORRIENTE,
        SubClaseCuenta.ACTIVO_NO_CORRIENTE,
        SubClaseCuenta.PASIVO_CORRIENTE,
        SubClaseCuenta.PASIVO_NO_CORRIENTE,
        SubClaseCuenta.PATRIMONIO_CAPITAL,
        SubClaseCuenta.PATRIMONIO_RESULTADOS,
        SubClaseCuenta.INGRESO_OPERATIVO,
        SubClaseCuenta.INGRESO_NO_OPERATIVO,
        SubClaseCuenta.EGRESO_OPERATIVO,
        SubClaseCuenta.EGRESO_ADMINISTRATIVO,
        SubClaseCuenta.EGRESO_COMERCIALIZACION,
        SubClaseCuenta.EGRESO_FINANCIERO,
        SubClaseCuenta.EGRESO_NO_OPERATIVO,
      ] as const)
      .optional(),
    naturaleza: z.enum([NaturalezaCuenta.DEUDORA, NaturalezaCuenta.ACREEDORA] as const),
    parentId: z.string().uuid('Seleccioná una cuenta padre válida').optional(),
    esDetalle: z.boolean(),
    requiereContacto: z.boolean(),
    esContraria: z.boolean(),
    monedaFuncional: z.enum([Moneda.BOB, Moneda.USD] as const),
    permiteMultiMoneda: z.boolean(),
  })
  // Cross-field: subClaseCuenta debe corresponder a claseCuenta. El backend
  // valida lo mismo, pero mostrarlo en el form evita roundtrips innecesarios.
  .refine(
    (v) => {
      if (v.subClaseCuenta === undefined) return true; // válido solo para raíz
      return SUBCLASES_POR_CLASE[v.claseCuenta].includes(v.subClaseCuenta);
    },
    {
      message: 'La subclase seleccionada no corresponde a la clase elegida',
      path: ['subClaseCuenta'],
    },
  );

export type CuentaFormValues = z.infer<typeof cuentaFormSchema>;

// Tabla expuesta para que los selects del form filtren las opciones
// correctas por clase (p. ej. claseCuenta ACTIVO solo permite
// ACTIVO_CORRIENTE / ACTIVO_NO_CORRIENTE).
export const SUBCLASES_POR_CLASE: Record<ClaseCuenta, readonly SubClaseCuenta[]> = {
  ACTIVO: [SubClaseCuenta.ACTIVO_CORRIENTE, SubClaseCuenta.ACTIVO_NO_CORRIENTE],
  PASIVO: [SubClaseCuenta.PASIVO_CORRIENTE, SubClaseCuenta.PASIVO_NO_CORRIENTE],
  PATRIMONIO: [
    SubClaseCuenta.PATRIMONIO_CAPITAL,
    SubClaseCuenta.PATRIMONIO_RESULTADOS,
  ],
  INGRESO: [SubClaseCuenta.INGRESO_OPERATIVO, SubClaseCuenta.INGRESO_NO_OPERATIVO],
  EGRESO: [
    SubClaseCuenta.EGRESO_OPERATIVO,
    SubClaseCuenta.EGRESO_ADMINISTRATIVO,
    SubClaseCuenta.EGRESO_COMERCIALIZACION,
    SubClaseCuenta.EGRESO_FINANCIERO,
    SubClaseCuenta.EGRESO_NO_OPERATIVO,
  ],
};

// Labels UI para los enums.
export const LABELS_CLASE: Record<ClaseCuenta, string> = {
  ACTIVO: 'Activo',
  PASIVO: 'Pasivo',
  PATRIMONIO: 'Patrimonio',
  INGRESO: 'Ingreso',
  EGRESO: 'Egreso',
};

export const LABELS_SUBCLASE: Record<SubClaseCuenta, string> = {
  ACTIVO_CORRIENTE: 'Activo corriente',
  ACTIVO_NO_CORRIENTE: 'Activo no corriente',
  PASIVO_CORRIENTE: 'Pasivo corriente',
  PASIVO_NO_CORRIENTE: 'Pasivo no corriente',
  PATRIMONIO_CAPITAL: 'Patrimonio — Capital',
  PATRIMONIO_RESULTADOS: 'Patrimonio — Resultados',
  INGRESO_OPERATIVO: 'Ingreso operativo',
  INGRESO_NO_OPERATIVO: 'Ingreso no operativo',
  EGRESO_OPERATIVO: 'Egreso operativo (costos)',
  EGRESO_ADMINISTRATIVO: 'Egreso administrativo',
  EGRESO_COMERCIALIZACION: 'Egreso comercialización',
  EGRESO_FINANCIERO: 'Egreso financiero',
  EGRESO_NO_OPERATIVO: 'Egreso no operativo',
};

export const LABELS_NATURALEZA: Record<NaturalezaCuenta, string> = {
  DEUDORA: 'Deudora (aumenta con Debe)',
  ACREEDORA: 'Acreedora (aumenta con Haber)',
};

export const LABELS_MONEDA: Record<Moneda, string> = {
  BOB: 'BOB — Boliviano',
  USD: 'USD — Dólar',
};
