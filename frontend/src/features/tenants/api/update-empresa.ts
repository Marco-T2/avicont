import { api } from '@/lib/api';

import type { EmpresaFormValues } from '../schemas/empresa-form-schema';

// PATCH /api/tenants/current — actualiza los 6 campos fiscales.
// Campos string vacío ('') se envían como null para desmapear el valor en BD.
export async function updateEmpresa(data: EmpresaFormValues): Promise<void> {
  const payload = {
    razonSocial: data.razonSocial !== '' ? data.razonSocial : null,
    nit: data.nit !== '' ? data.nit : null,
    direccion: data.direccion !== '' ? data.direccion : null,
    representanteLegal: data.representanteLegal !== '' ? data.representanteLegal : null,
    telefono: data.telefono !== '' ? data.telefono : null,
    email: data.email !== '' ? data.email : null,
  };
  await api.patch('/api/tenants/current', payload);
}
