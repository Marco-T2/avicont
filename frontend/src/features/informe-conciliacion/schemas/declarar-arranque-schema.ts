import { z } from 'zod';

// Decimal FIRMADO como string — §4.5: punto decimal, sin separador de miles.
// La residual admite negativo (extracto por debajo de los libros); los saldos
// también (una cuenta puede estar sobregirada).
//
// DOS decimales como máximo, el MISMO límite que `DeclararArranqueDto` en el
// backend (`Decimal(18,2)` en el schema). Sin ese tope el form aceptaba
// "1000.123" y el usuario recibía un 400 del servidor por un dato que la
// pantalla le había dado por bueno: el borde que valida tiene que ser el que
// le habla.
const DECIMAL_FIRMADO = z
  .string()
  .regex(
    /^-?\d+(\.\d{1,2})?$/,
    'Debe ser un número decimal con hasta 2 decimales (ej. "1000.00" o "-10.50")',
  );

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
