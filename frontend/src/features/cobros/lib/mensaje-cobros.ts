import { extractBackendError } from '@/lib/error-messages';

// Mapeo de los códigos de error del módulo cuentas-por-cobrar (namespaces
// COBRO_* / APLICACION_*, ver backend/src/cuentas-por-cobrar/domain/).
// Vive en el lib del feature (función pura, testeable) igual que
// features/items/lib/mensaje-items.ts; si cobros suma más pantallas fuera de
// la feature, consolidar en @/lib/error-messages.ts.
export function mensajeCobros(err: unknown, fallback: string): string {
  const p = extractBackendError(err);
  switch (p.code) {
    case 'COBRO_NO_ENCONTRADO':
      return 'El cobro no existe o pertenece a otra organización.';

    case 'COBRO_CONTACTO_NO_ENCONTRADO':
      return 'El cliente no existe o pertenece a otra organización.';

    case 'COBRO_CONTACTO_INACTIVO':
      return 'El cliente está inactivo: no admite cobros nuevos. Reactivalo primero.';

    case 'COBRO_CONCEPTO_NO_CONFIGURADO':
      return 'La organización no tiene mapeada la cuenta de Cuentas por Cobrar. Configurala en Configuración contable antes de registrar cobros.';

    case 'COBRO_CUENTA_DESTINO_NO_ELEGIBLE':
      return 'La cuenta destino no puede recibir efectivo: elegí una cuenta de efectivo o equivalentes (bajo 1.1.1, o marcada como EFECTIVO en el plan de cuentas).';

    // Matriz fila 8: el sistema NO elige qué aplicación recortar — el usuario
    // desaplica primero.
    case 'COBRO_MONTO_INFERIOR_APLICADO': {
      const desaplicar = p.details?.montoADesaplicarBob;
      const detalle =
        typeof desaplicar === 'string' ? ` Desaplicá Bs ${desaplicar} primero.` : ' Desaplicá primero.';
      return `El cobro tiene aplicado a ventas más que el monto nuevo: el sistema no elige qué aplicación recortar.${detalle}`;
    }

    case 'COBRO_NO_ES_BORRADOR':
      return 'El cobro ya está contabilizado: esta operación solo aplica a borradores.';

    case 'COBRO_ANULADO_NO_EDITABLE':
      return 'El cobro está anulado: no admite cambios ni una nueva anulación.';

    case 'COBRO_ASIENTO_SIN_MONTO':
      return 'El monto del cobro debe ser mayor a 0.';

    case 'COBRO_GESTION_NO_ABIERTA':
      return 'No existe una gestión fiscal para esa fecha. Creá la gestión primero.';

    // Period lock §4.4: sin bypass — la reapertura formal es el único camino.
    case 'COBRO_PERIODO_NO_ABIERTO':
      return 'El período fiscal de esa fecha está cerrado. Para modificarlo, un administrador debe reabrir el período (flujo de reapertura formal).';

    case 'APLICACION_EXCEDE_COBRO': {
      const disponible = p.details?.disponibleBob;
      return typeof disponible === 'string'
        ? `La aplicación excede el cobro: quedan Bs ${disponible} disponibles.`
        : 'La aplicación excede el monto del cobro.';
    }

    case 'APLICACION_EXCEDE_VENTA': {
      const disponible = p.details?.disponibleBob;
      return typeof disponible === 'string'
        ? `La aplicación excede la venta: quedan Bs ${disponible} por cobrar.`
        : 'La aplicación excede el total de la venta.';
    }

    case 'APLICACION_CONTACTO_DISTINTO':
      return 'El cobro y la venta pertenecen a clientes distintos: no se puede aplicar.';

    case 'APLICACION_VENTA_CONTADO':
      return 'Esa venta es al contado: se cobró en el acto y no admite aplicaciones.';

    case 'APLICACION_PUNTA_NO_CONTABILIZADA':
      return 'Solo se aplican cobros y ventas ya contabilizados. Contabilizá el cobro primero.';

    case 'APLICACION_MONTO_NO_POSITIVO':
      return 'El monto a aplicar debe ser mayor a 0.';

    case 'APLICACION_NO_ENCONTRADA':
      return 'La aplicación no existe o ya fue eliminada.';

    case 'APLICACION_VENTA_NO_ENCONTRADA':
      return 'La venta no existe o pertenece a otra organización.';

    default:
      return p.message ?? fallback;
  }
}
