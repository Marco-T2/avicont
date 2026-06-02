import type { TipoPack, VerticalPack } from '@prisma/client';

/**
 * Entidad de dominio pura del catálogo de packs (eje 2 de la plataforma).
 * Un pack es una funcionalidad OPCIONAL que vive DENTRO de un vertical,
 * gobernada por la cadena entitlement → activación. Ver
 * `docs/disenos/packs-eje2.md` §4.3.
 *
 * Sin dependencias de NestJS ni Prisma: los tipos de enum son del modelo
 * generado de Prisma pero son uniones de strings, no clases de infraestructura.
 */
export interface Pack {
  readonly id: string;
  /** Clave estable namespaced por vertical. Ej: "contabilidad.adjuntos". */
  readonly clave: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  /** Vertical al que pertenece el pack (no rompe la exclusividad de vertical). */
  readonly verticalAplicable: VerticalPack;
  readonly tipo: TipoPack;
  /** Un pack retirado del catálogo no se vende (no afecta entitlements vivos). */
  readonly activo: boolean;
}
