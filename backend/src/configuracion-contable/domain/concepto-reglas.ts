// Tabla pura de reglas de validación por concepto contable.
// El servicio la consulta para verificar que la cuenta mapeada tenga la
// clase correcta. Testeable sin BD.
//
// Referencias:
//   - Ley 843: IVA (13%) en pasivo/activo según débito/crédito.
//   - RND 10-0021-16: IT (3%) en pasivo.
//   - Norma Contable N° 6: diferencias de cambio en cuentas separadas
//     de ingreso (ganancia) y egreso (pérdida); NO compensar.

import { ClaseCuenta } from '@/common/domain/enums';

// Nombres de los 12 conceptos mapeables en OrgConfiguracionContable.
// El orden refleja el schema. Si agregás un campo al modelo, añadilo acá
// y en `CONCEPTO_REGLAS`.
export const CONCEPTOS = [
  'ivaCreditoId',
  'ivaDebitoId',
  'ivaCreditoImportacionesId',
  'itPorPagarId',
  'iuePorPagarId',
  'rcIvaRetenidoId',
  'difCambioGananciaId',
  'difCambioPerdidaId',
  'resultadoEjercicioId',
  'resultadosAcumuladosId',
  'cajaChicaDefaultId',
  'ajustePorInflacionId',
] as const;

export type Concepto = (typeof CONCEPTOS)[number];

export const CONCEPTOS_SET: ReadonlySet<string> = new Set(CONCEPTOS);

export function esConceptoValido(x: string): x is Concepto {
  return CONCEPTOS_SET.has(x);
}

// Regla por concepto: qué claseCuenta debe tener la cuenta mapeada.
export interface ReglaConcepto {
  concepto: Concepto;
  claseEsperada: ClaseCuenta;
  descripcion: string;
}

export const CONCEPTO_REGLAS: Record<Concepto, ReglaConcepto> = {
  ivaCreditoId: {
    concepto: 'ivaCreditoId',
    claseEsperada: ClaseCuenta.ACTIVO,
    descripcion: 'IVA Crédito Fiscal (compras nacionales) — Ley 843',
  },
  ivaCreditoImportacionesId: {
    concepto: 'ivaCreditoImportacionesId',
    claseEsperada: ClaseCuenta.ACTIVO,
    descripcion: 'IVA Crédito Fiscal por importaciones — Ley 843',
  },
  ivaDebitoId: {
    concepto: 'ivaDebitoId',
    claseEsperada: ClaseCuenta.PASIVO,
    descripcion: 'IVA Débito Fiscal (ventas) — Ley 843',
  },
  itPorPagarId: {
    concepto: 'itPorPagarId',
    claseEsperada: ClaseCuenta.PASIVO,
    descripcion: 'Impuesto a las Transacciones (3%) — RND 10-0021-16',
  },
  iuePorPagarId: {
    concepto: 'iuePorPagarId',
    claseEsperada: ClaseCuenta.PASIVO,
    descripcion: 'Impuesto a las Utilidades de las Empresas (25%)',
  },
  rcIvaRetenidoId: {
    concepto: 'rcIvaRetenidoId',
    claseEsperada: ClaseCuenta.PASIVO,
    descripcion: 'Régimen Complementario al IVA retenido a empleados',
  },
  difCambioGananciaId: {
    concepto: 'difCambioGananciaId',
    claseEsperada: ClaseCuenta.INGRESO,
    descripcion: 'Diferencia de cambio — ganancia (Norma Contable N° 6)',
  },
  difCambioPerdidaId: {
    concepto: 'difCambioPerdidaId',
    claseEsperada: ClaseCuenta.EGRESO,
    descripcion: 'Diferencia de cambio — pérdida (Norma Contable N° 6)',
  },
  resultadoEjercicioId: {
    concepto: 'resultadoEjercicioId',
    claseEsperada: ClaseCuenta.PATRIMONIO,
    descripcion: 'Resultado del ejercicio (cierre)',
  },
  resultadosAcumuladosId: {
    concepto: 'resultadosAcumuladosId',
    claseEsperada: ClaseCuenta.PATRIMONIO,
    descripcion: 'Resultados acumulados (cierre)',
  },
  cajaChicaDefaultId: {
    concepto: 'cajaChicaDefaultId',
    claseEsperada: ClaseCuenta.ACTIVO,
    descripcion: 'Caja chica default para movimientos sin cuenta específica',
  },
  ajustePorInflacionId: {
    concepto: 'ajustePorInflacionId',
    claseEsperada: ClaseCuenta.PATRIMONIO,
    descripcion: 'Ajuste Integral por Inflación (AITB)',
  },
};

export function reglaParaConcepto(concepto: Concepto): ReglaConcepto {
  return CONCEPTO_REGLAS[concepto];
}
