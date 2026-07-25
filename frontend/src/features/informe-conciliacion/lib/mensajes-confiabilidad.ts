import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
import { formatearMontoBob } from '@/lib/formatear-monto-bob';
import type { MotivoNoConciliado } from '@/types/api';

/**
 * Traduce un motivo de no-conciliación a una frase que un contador entienda —
 * el enum crudo jamás llega a pantalla (REQ-ICB-05: el informe NOMBRA el
 * problema, no lo codifica).
 *
 * `MotivoNoConciliadoDto` es una clase APLANADA con opcionales por tipo
 * (swagger no soporta uniones discriminadas): acá se discrimina por `tipo` y
 * se usan solo los campos que ese tipo transporta. Si un campo esperado no
 * viene (contrato degradado), la frase se emite sin él — nunca se inventa.
 */
export function mensajeMotivo(motivo: MotivoNoConciliado): string {
  switch (motivo.tipo) {
    case 'SIN_ARRANQUE':
      return 'No hay punto de arranque declarado: el informe no puede fijar desde dónde comparar ambos lados.';
    case 'SIN_SALDO_EXTRACTO':
      return 'Ningún movimiento del extracto hasta el corte publica saldo: falta el saldo bancario contra el cual conciliar.';
    case 'DESCUADRE':
      return 'Una importación del rango tiene descuadre de verificación: sus movimientos no reproducen el saldo que declara el extracto.';
    case 'HUECO': {
      if (motivo.desde !== undefined && motivo.hasta !== undefined) {
        return `Falta extracto entre el ${formatearFechaContable(motivo.desde)} y el ${formatearFechaContable(motivo.hasta)}: hay días sin cobertura antes del corte.`;
      }
      return 'Falta extracto: hay días sin cobertura antes del corte.';
    }
    case 'DISCONTINUIDAD': {
      const diferencia =
        motivo.diferencia !== undefined ? ` de Bs ${formatearMontoBob(motivo.diferencia)}` : '';
      return `El saldo final de un extracto no empalma con el inicial del siguiente: hay una diferencia${diferencia} entre importaciones consecutivas.`;
    }
    case 'RESIDUO_NO_EXPLICADO': {
      const importe = motivo.importe !== undefined ? ` de Bs ${formatearMontoBob(motivo.importe)}` : '';
      return `Queda un residuo${importe} que las partidas no explican: algo tocó la cuenta banco fuera de lo que este módulo conoce.`;
    }
  }
}
