import { z } from 'zod';

import { superRefinePartidaDoble } from '../lib/partida-doble';
import { lineaSchema } from './linea-schema';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const TIPOS_COMPROBANTE = [
  'APERTURA',
  'DIARIO',
  'INGRESO',
  'EGRESO',
  'AJUSTE',
  'TRASPASO',
  'CIERRE',
] as const;

// Valida un decimal positivo estricto (> 0). Espejo del DECIMAL_POSITIVE del backend.
const DECIMAL_POSITIVE = /^(?!0+(\.0+)?$)\d+(\.\d+)?$/;

// Schema para editar un comprobante (BORRADOR o CONTABILIZADO).
// Todos los campos de cabecera son opcionales — solo se envían los que cambian.
// El campo `lineas` es opcional — si se provee, reemplaza todas las líneas
// (delete-and-reinsert atómico en backend — CLAUDE.md §4.3).
// El campo `motivo` es para auditoría al editar CONTABILIZADO.
// monedaPrincipal omitida — el backend lockea a BOB; la UI no expone ese campo.
export const editarComprobanteSchema = z.object({
  tipo: z.enum(TIPOS_COMPROBANTE).optional(),

  fechaContable: z
    .string()
    .regex(ISO_DATE_REGEX, 'La fecha debe estar en formato YYYY-MM-DD')
    .optional(),

  glosa: z
    .string()
    .min(1, 'La glosa no puede estar vacía')
    .max(500, 'La glosa no puede superar 500 caracteres')
    .optional(),

  // T/C de re-expresión: solo presentación; no afecta la contabilidad.
  tipoCambioReexpresion: z
    .string()
    .regex(DECIMAL_POSITIVE, 'El T/C de re-expresión debe ser un número mayor a cero')
    .optional(),

  lineas: z.array(lineaSchema).optional(),

  // Campo de motivo para edición de CONTABILIZADO — guardado en auditoría.
  // 3 chars mínimo (decisión: suficiente para "OK" en correcciones triviales).
  motivo: z
    .string()
    .min(3, 'El motivo debe tener al menos 3 caracteres')
    .max(500, 'El motivo no puede superar 500 caracteres')
    .optional(),
})
.superRefine((data, ctx) => {
  // Validar partida doble solo cuando se proveen líneas (PATCH parcial — CLAUDE.md §4.1).
  if (data.lineas !== undefined) {
    superRefinePartidaDoble(data.lineas, ctx);
  }
});

export type EditarComprobanteValues = z.infer<typeof editarComprobanteSchema>;
