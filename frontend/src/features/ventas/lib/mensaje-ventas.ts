import { extractBackendError } from '@/lib/error-messages';

// Mapeo de los códigos de error del módulo ventas (namespace VENTA_* del
// backend, `backend/src/ventas/domain/venta-errors.ts`). Vive en el lib del
// feature como los de items — deuda conocida: consolidar estos mapeos en
// `src/lib/error-messages.ts`, que hoy tocan varios agentes en paralelo.
export function mensajeVentas(err: unknown, fallback: string): string {
  const p = extractBackendError(err);
  switch (p.code) {
    case 'VENTA_VENCIMIENTO_REQUERIDO':
      return 'Una venta a crédito necesita fecha de vencimiento (y una al contado no debe llevarla).';

    case 'VENTA_CUENTA_DESTINO_NO_ELEGIBLE':
      return 'La cuenta destino debe ser una cuenta de efectivo o equivalente, activa y de detalle. Elegí otra cuenta.';

    case 'VENTA_CUENTA_SNAPSHOT_INACTIVA':
      return 'Una cuenta de ingreso de las líneas está inactiva. Reactivala en el plan de cuentas o corregí la línea antes de contabilizar.';

    case 'VENTA_CONDICION_PAGO_CON_APLICACIONES':
      // Fila 7 de REQ-VTA-06: el sistema NO elige qué cobros soltar.
      return 'Esta venta tiene cobros aplicados: no puede pasar a contado. Desaplicá primero los cobros y volvé a intentar.';

    case 'VENTA_CONCEPTO_NO_CONFIGURADO':
      return 'La organización no tiene mapeadas las cuentas de ventas/cuentas por cobrar. Configuralas en Configuración contable.';

    case 'VENTA_PERIODO_NO_ABIERTO':
      return 'El período contable de esa fecha está cerrado. Para modificarla, un administrador debe reabrir el período.';

    case 'VENTA_GESTION_NO_ABIERTA':
      return 'No existe un período fiscal para esa fecha. Creá la gestión correspondiente antes de registrar la venta.';

    case 'VENTA_NO_ES_BORRADOR':
      return 'La venta ya no está en borrador: no se puede eliminar ni volver a contabilizar.';

    case 'VENTA_ANULADA_NO_EDITABLE':
      return 'La venta está anulada y no admite cambios.';

    case 'VENTA_NO_ENCONTRADA':
      return 'La venta no existe o pertenece a otra organización.';

    case 'VENTA_CONTACTO_NO_ENCONTRADO':
      return 'El cliente seleccionado no existe en esta organización.';

    case 'VENTA_CONTACTO_INACTIVO':
      return 'El cliente seleccionado está inactivo. Reactivalo o elegí otro.';

    case 'VENTA_ITEM_NO_ENCONTRADO':
      return 'Un ítem de las líneas no existe en esta organización.';

    case 'VENTA_ITEM_INACTIVO':
      return 'Un ítem de las líneas está inactivo. Reactivalo o quitá la línea.';

    case 'COMPROBANTE_ANULAR_MOTIVO_INVALIDO':
      return 'El motivo de anulación debe tener al menos 10 caracteres significativos.';

    default:
      return p.message ?? fallback;
  }
}
