import type { LineaVentaFormValues } from './schemas/venta-form-schema';

// Fila vacía del editor de líneas (precedente: LINEA_VACIA de comprobantes).
// Vive acá y no en el componente por la regla react-refresh/only-export-components.
export const LINEA_VENTA_VACIA: LineaVentaFormValues = {
  itemId: '',
  descripcion: '',
  cantidad: '',
  precioUnitario: '',
};
