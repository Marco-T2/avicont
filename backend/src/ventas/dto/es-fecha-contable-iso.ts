import { registerDecorator, ValidationOptions } from 'class-validator';

import { FechaContable } from '@/common/domain/fecha-contable';

/**
 * Valida que el string sea una fecha de calendario ISO `YYYY-MM-DD` REAL
 * (§4.6) usando la misma pieza de dominio que el service va a consumir.
 *
 * Un `@Matches(/^\d{4}-\d{2}-\d{2}$/)` a secas no alcanza: "2026-02-31" pasa
 * el regex y `FechaContable.fromIso` lanza `RangeError` — que el filtro global
 * no mapea y saldría como 500. El DTO es la capa que lo convierte en 400.
 */
export function EsFechaContableIso(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'esFechaContableIso',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} debe ser una fecha de calendario válida YYYY-MM-DD, sin hora ni zona`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          try {
            FechaContable.fromIso(value);
            return true;
          } catch {
            return false;
          }
        },
      },
    });
  };
}
