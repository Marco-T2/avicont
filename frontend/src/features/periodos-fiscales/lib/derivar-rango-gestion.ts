import type { TipoEmpresa } from '@/types/api';

// Mes de inicio del año fiscal por tipo de empresa (Ley 843 art. 46).
// Espejo de backend/src/common/domain/cierre-fiscal-por-tipo-empresa.ts.
const MES_INICIO: Record<TipoEmpresa, number> = {
  COMERCIAL: 1,
  SERVICIOS: 1,
  TRANSPORTE: 1,
  INDUSTRIAL: 4,
  CONSTRUCCION: 4,
  PETROLERA: 4,
  AGROPECUARIA: 7,
  MINERA: 10,
};

const NOMBRE_MES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/**
 * Convierte `(tipoEmpresa, year)` a texto humano del rango fiscal.
 * Ejemplo: `derivarRangoGestion('INDUSTRIAL', 2026)` → "Abril 2026 a Marzo 2027".
 * Función pura, sin I/O, testeable sin setup.
 */
export function derivarRangoGestion(tipoEmpresa: TipoEmpresa, year: number): string {
  const mesInicio = MES_INICIO[tipoEmpresa];
  const mesCierre = mesInicio === 1 ? 12 : mesInicio - 1;
  const yearCierre = mesInicio === 1 ? year : year + 1;
  const nombreInicio = NOMBRE_MES[mesInicio - 1];
  const nombreCierre = NOMBRE_MES[mesCierre - 1];
  return `${nombreInicio} ${year} a ${nombreCierre} ${yearCierre}`;
}
