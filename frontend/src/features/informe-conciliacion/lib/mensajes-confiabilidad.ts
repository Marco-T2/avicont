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
    case 'ARRANQUE_EXTRACTO_NO_COINCIDE': {
      const fecha = motivo.fecha !== undefined ? ` del ${formatearFechaContable(motivo.fecha)}` : '';
      if (motivo.declarado !== undefined && motivo.real !== undefined) {
        const diferencia =
          motivo.diferencia !== undefined
            ? ` (diferencia de Bs ${formatearMontoBob(motivo.diferencia)})`
            : '';
        return `El arranque${fecha} declara un saldo de extracto de Bs ${formatearMontoBob(motivo.declarado)}, pero el extracto real a esa fecha es Bs ${formatearMontoBob(motivo.real)}${diferencia}: revisá la declaración del punto de partida.`;
      }
      return `El saldo de extracto declarado en el arranque${fecha} no coincide con el extracto real a esa fecha: revisá la declaración del punto de partida.`;
    }
    case 'ARRANQUE_LIBROS_NO_COINCIDE': {
      const fecha = motivo.fecha !== undefined ? ` del ${formatearFechaContable(motivo.fecha)}` : '';
      if (motivo.declarado !== undefined && motivo.real !== undefined) {
        const diferencia =
          motivo.diferencia !== undefined
            ? ` (diferencia de Bs ${formatearMontoBob(motivo.diferencia)})`
            : '';
        return `El arranque${fecha} declara un saldo según libros de Bs ${formatearMontoBob(motivo.declarado)}, pero el mayor de la cuenta a esa fecha suma Bs ${formatearMontoBob(motivo.real)}${diferencia}: puede faltar el asiento de apertura, o el punto de partida está mal declarado.`;
      }
      return `El saldo según libros declarado en el arranque${fecha} no coincide con el mayor de la cuenta a esa fecha: revisá la declaración del punto de partida.`;
    }
    case 'DESCUADRE':
      return 'Una importación del rango tiene descuadre de verificación: sus movimientos no reproducen el saldo que declara el extracto.';
    case 'HUECO': {
      if (motivo.desde !== undefined && motivo.hasta !== undefined) {
        return `Falta extracto entre el ${formatearFechaContable(motivo.desde)} y el ${formatearFechaContable(motivo.hasta)}: hay días sin cobertura antes del corte.`;
      }
      return 'Falta extracto: hay días sin cobertura antes del corte.';
    }
    case 'HUECO_INICIAL': {
      if (motivo.desde !== undefined && motivo.hasta !== undefined) {
        return `Falta extracto entre el ${formatearFechaContable(motivo.desde)} y el ${formatearFechaContable(motivo.hasta)}: el informe arranca sobre días que ningún extracto cubrió.`;
      }
      return 'Falta extracto al inicio: el informe arranca sobre días que ningún extracto cubrió.';
    }
    case 'HUECO_FINAL': {
      if (motivo.desde !== undefined && motivo.hasta !== undefined) {
        return `Falta extracto entre el ${formatearFechaContable(motivo.desde)} y el ${formatearFechaContable(motivo.hasta)}: la cobertura no llega al corte, así que el saldo bancario que se compara es anterior a la fecha pedida.`;
      }
      return 'Falta extracto al cierre: la cobertura no llega al corte, así que el saldo bancario que se compara es anterior a la fecha pedida.';
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
