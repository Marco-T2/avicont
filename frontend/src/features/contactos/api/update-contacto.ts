import { api } from '@/lib/api';
import type { Contacto, ContactoInput } from '@/types/api';

// El PATCH /api/contactos/:id NO acepta el campo `activo`.
// Para desactivar/reactivar usar desactivar-contacto.ts / reactivar-contacto.ts.
// Campos de texto opcionales vacíos ('') se convierten a null (mismo criterio
// que createContacto — ver create-contacto.ts).
export async function updateContacto(
  id: string,
  values: ContactoInput,
): Promise<Contacto> {
  const body = {
    razonSocial: values.razonSocial,
    nombreComercial: values.nombreComercial !== '' ? values.nombreComercial : null,
    documento: values.documento !== '' ? values.documento : null,
    email: values.email !== '' ? values.email : null,
    telefono: values.telefono !== '' ? values.telefono : null,
    direccion: values.direccion !== '' ? values.direccion : null,
    esCliente: values.esCliente,
    esProveedor: values.esProveedor,
  };
  const res = await api.patch<Contacto>(`/api/contactos/${id}`, body);
  return res.data;
}
