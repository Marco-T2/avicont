import { NaturalezaRegistro } from '../domain/enums';
import type { TipoRegistroSeedRow } from '../ports/tipo-registro.repository.port';

/**
 * Los 12 tipos de registro de fábrica para el vertical Granja.
 * Se siembran por tenant al activar el vertical (TipoRegistroSeederPort).
 * Son readonly: no se modifican en runtime.
 */
export const TIPOS_REGISTRO_FABRICA: readonly TipoRegistroSeedRow[] = [
  { nombre: 'Compra de pollitos', naturaleza: NaturalezaRegistro.INVERSION, esSistema: true },
  { nombre: 'Alimento', naturaleza: NaturalezaRegistro.INVERSION, esSistema: true },
  { nombre: 'Alquiler Galpón', naturaleza: NaturalezaRegistro.INVERSION, esSistema: true },
  { nombre: 'Mantenimiento Galpón', naturaleza: NaturalezaRegistro.INVERSION, esSistema: true },
  { nombre: 'Vacunas', naturaleza: NaturalezaRegistro.INVERSION, esSistema: true },
  { nombre: 'Veterinario', naturaleza: NaturalezaRegistro.INVERSION, esSistema: true },
  { nombre: 'Mano de Obra', naturaleza: NaturalezaRegistro.INVERSION, esSistema: true },
  { nombre: 'Chala', naturaleza: NaturalezaRegistro.INVERSION, esSistema: true },
  { nombre: 'Garrafas', naturaleza: NaturalezaRegistro.INVERSION, esSistema: true },
  { nombre: 'Agua y Luz', naturaleza: NaturalezaRegistro.INVERSION, esSistema: true },
  { nombre: 'Otros gastos', naturaleza: NaturalezaRegistro.INVERSION, esSistema: true },
  { nombre: 'Mortalidad', naturaleza: NaturalezaRegistro.CANTIDAD, esSistema: true },
] as const;
