import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Helper canónico de shadcn: compone classNames condicionales con clsx y
 * deduplica clases Tailwind conflictivas (ej: "px-2" + "px-4" → "px-4") con
 * tailwind-merge. Usar en TODO componente con variantes de className.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
