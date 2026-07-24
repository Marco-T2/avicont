import { useQuery } from '@tanstack/react-query';

import { getPerfilesExtracto } from '../api/get-perfiles-extracto';

/**
 * Catálogo de perfiles de extracto soportados. Reemplaza al catálogo estático
 * que vivía en `lib/perfil-extracto-options.ts`: la lista de bancos, su label
 * y su instructivo de descarga son del backend, que los deriva del registro de
 * parsers. Sumar un banco es agregar su dialecto — el frontend no se toca.
 *
 * `staleTime: Infinity` porque el catálogo solo cambia con un deploy: es
 * constante dentro de la vida de la sesión.
 */
export function usePerfilesExtracto() {
  return useQuery({
    queryKey: ['cuentas-bancarias', 'perfiles'],
    queryFn: getPerfilesExtracto,
    staleTime: Infinity,
  });
}
