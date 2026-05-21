import { api } from '@/lib/api';
import type { Contacto, ContactoInput } from '@/types/api';

// Campos de texto opcionales vacíos ('') se convierten a null antes de enviar.
// El backend tiene unique parcial WHERE documento IS NOT NULL — mandar '' rompe
// ese invariante; null es el valor correcto para "sin documento".
export async function createContacto(values: ContactoInput): Promise<Contacto> {
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
  const res = await api.post<Contacto>('/api/contactos', body);
  return res.data;
}
