import { TipoEmpresa } from './enums';

/**
 * Mapeo normativo de cierre fiscal por tipo de empresa según Ley 843 art. 46.
 * Ver `docs/disenos/gestiones-periodos-fiscales-v3.md` §2.
 *
 * El `mesInicio` es el primer mes calendario de la gestión fiscal; el
 * `mesCierre` es el último. La gestión siempre dura 12 meses consecutivos.
 */
export const CIERRE_FISCAL_POR_TIPO: Record<TipoEmpresa, { mesInicio: number; mesCierre: number }> =
  {
    // Art. 46 Ley 843: cierre 31 de diciembre
    COMERCIAL: { mesInicio: 1, mesCierre: 12 },
    SERVICIOS: { mesInicio: 1, mesCierre: 12 },
    TRANSPORTE: { mesInicio: 1, mesCierre: 12 },
    // Art. 46 Ley 843: cierre 31 de marzo
    INDUSTRIAL: { mesInicio: 4, mesCierre: 3 },
    CONSTRUCCION: { mesInicio: 4, mesCierre: 3 },
    PETROLERA: { mesInicio: 4, mesCierre: 3 },
    // Art. 46 Ley 843: cierre 30 de junio
    AGROPECUARIA: { mesInicio: 7, mesCierre: 6 },
    // Art. 46 Ley 843: cierre 30 de septiembre
    MINERA: { mesInicio: 10, mesCierre: 9 },
  };

export function calcularMesInicio(tipoEmpresa: TipoEmpresa): number {
  return CIERRE_FISCAL_POR_TIPO[tipoEmpresa].mesInicio;
}

export function calcularMesCierre(tipoEmpresa: TipoEmpresa): number {
  return CIERRE_FISCAL_POR_TIPO[tipoEmpresa].mesCierre;
}
