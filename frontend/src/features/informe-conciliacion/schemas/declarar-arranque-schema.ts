import { z } from 'zod';

// Decimal FIRMADO como string — §4.5: punto decimal, sin separador de miles.
// La residual admite negativo (extracto por debajo de los libros); los saldos
// también (una cuenta puede estar sobregirada).
const DECIMAL_FIRMADO = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, 'Debe ser un número decimal (ej. "1000.00" o "-10.50")');

/**
 * Declaración de arranque (REQ-ICB-04): los CUATRO datos — fecha, ambos
 * saldos y la diferencia residual — los DECLARA el usuario. En particular la
 * residual jamás se calcula como extracto − libros (esa resta incluiría las
 * partidas en tránsito abiertas, que se resuelven solas): es la parte que el
 * usuario asume como inexplicable. Positiva cuando el extracto queda por
 * encima de los libros.
 */
export const declararArranqueSchema = z.object({
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Seleccioná la fecha del arranque (YYYY-MM-DD)'),
  saldoExtracto: DECIMAL_FIRMADO,
  saldoLibros: DECIMAL_FIRMADO,
  diferenciaResidual: DECIMAL_FIRMADO,
  nota: z.string().max(500, 'La nota no puede superar 500 caracteres').optional(),
});

export type DeclararArranqueValues = z.infer<typeof declararArranqueSchema>;
