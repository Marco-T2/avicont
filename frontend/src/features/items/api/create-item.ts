import { api } from '@/lib/api';
import type { CreateItemRequest, Item } from '@/types/api';

import type { ItemFormValues } from '../schemas/item-form-schema';

// Los opcionales vacíos ('') se convierten a null antes de enviar: el backend
// tiene unique parcial WHERE codigo IS NOT NULL — mandar '' rompería ese
// invariante; null es el valor correcto para "sin código" (REQ-ITM-02).
// La normalización del código (trim + toUpperCase) es del backend; acá no se duplica.
export async function createItem(values: ItemFormValues): Promise<Item> {
  const body: CreateItemRequest = {
    nombre: values.nombre,
    tipo: values.tipo,
    codigo: values.codigo !== '' ? values.codigo : null,
    unidadMedida: values.unidadMedida !== '' ? values.unidadMedida : null,
    precioUnitarioSugerido:
      values.precioUnitarioSugerido !== '' ? values.precioUnitarioSugerido : null,
    cantidadPorDefecto: values.cantidadPorDefecto,
    cuentaIngresoId: values.cuentaIngresoId !== '' ? values.cuentaIngresoId : null,
  };
  const res = await api.post<Item>('/api/items', body);
  return res.data;
}
