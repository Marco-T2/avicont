import { api } from '@/lib/api';
import type { Item, UpdateItemRequest } from '@/types/api';

import type { ItemFormValues } from '../schemas/item-form-schema';

// El PATCH /api/items/:id NO acepta el campo `activo` — para eso están
// desactivar-item.ts (DELETE) y reactivar-item.ts (POST /reactivar).
// '' → null: en el PATCH, null LIMPIA el campo (mismo criterio que createItem).
export async function updateItem(id: string, values: ItemFormValues): Promise<Item> {
  const body: UpdateItemRequest = {
    nombre: values.nombre,
    tipo: values.tipo,
    codigo: values.codigo !== '' ? values.codigo : null,
    unidadMedida: values.unidadMedida !== '' ? values.unidadMedida : null,
    precioUnitarioSugerido:
      values.precioUnitarioSugerido !== '' ? values.precioUnitarioSugerido : null,
    cantidadPorDefecto: values.cantidadPorDefecto,
    cuentaIngresoId: values.cuentaIngresoId !== '' ? values.cuentaIngresoId : null,
  };
  const res = await api.patch<Item>(`/api/items/${id}`, body);
  return res.data;
}
