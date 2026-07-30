import { extractBackendError } from '@/lib/error-messages';

// Mapeo de los códigos de error del módulo items. Vive en el lib del feature
// (función pura, testeable) y usa el extractor compartido de @/lib/error-messages.
// Los otros módulos concentran sus mapeos en ese archivo compartido; si items
// suma más pantallas, consolidar ahí.
export function mensajeItems(err: unknown, fallback: string): string {
  const p = extractBackendError(err);
  switch (p.code) {
    case 'ITEM_NO_ENCONTRADO':
      return 'El ítem no existe o pertenece a otra organización.';

    case 'ITEM_CODIGO_DUPLICADO': {
      const codigo = p.details?.codigo;
      return typeof codigo === 'string'
        ? `Ya existe un ítem con el código "${codigo}".`
        : 'Ya existe un ítem con ese código.';
    }

    case 'ITEM_CUENTA_INGRESO_INVALIDA': {
      switch (p.details?.motivo) {
        case 'NO_ENCONTRADA':
          return 'La cuenta de ingreso seleccionada no existe en esta organización.';
        case 'NO_ES_DETALLE':
          return 'La cuenta de ingreso debe ser una cuenta de detalle, no una agrupadora.';
        case 'INACTIVA':
          return 'La cuenta de ingreso está inactiva. Reactivala o elegí otra.';
        default:
          return 'La cuenta de ingreso seleccionada no es válida.';
      }
    }

    default:
      return p.message ?? fallback;
  }
}
