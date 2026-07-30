import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';

import type { ItemFormValues } from '../schemas/item-form-schema';

import { createItem } from './create-item';

vi.mock('@/lib/api', () => ({
  api: { post: vi.fn() },
}));

const postMock = vi.mocked(api.post);

const VALUES: ItemFormValues = {
  nombre: 'Pollo entero',
  tipo: 'PRODUCTO',
  codigo: '',
  unidadMedida: '',
  precioUnitarioSugerido: '',
  cantidadPorDefecto: '1',
  cuentaIngresoId: '',
};

beforeEach(() => {
  postMock.mockReset();
  postMock.mockResolvedValue({ data: {} });
});

describe('createItem — conversión "" → null en la capa api', () => {
  it('convierte los opcionales vacíos a null antes de enviar', async () => {
    await createItem(VALUES);

    expect(postMock).toHaveBeenCalledWith('/api/items', {
      nombre: 'Pollo entero',
      tipo: 'PRODUCTO',
      codigo: null,
      unidadMedida: null,
      precioUnitarioSugerido: null,
      cantidadPorDefecto: '1',
      cuentaIngresoId: null,
    });
  });

  it('pasa los campos con contenido tal cual — sin normalizar el código', async () => {
    // La normalización (trim + toUpperCase) es del BACKEND (REQ-ITM-02);
    // el frontend no la duplica.
    await createItem({
      ...VALUES,
      codigo: '  ab-9 ',
      unidadMedida: 'kg',
      precioUnitarioSugerido: '6.305000',
      cantidadPorDefecto: '12',
      cuentaIngresoId: 'uuid-1',
    });

    const body = postMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).toMatchObject({
      codigo: '  ab-9 ',
      unidadMedida: 'kg',
      precioUnitarioSugerido: '6.305000',
      cantidadPorDefecto: '12',
      cuentaIngresoId: 'uuid-1',
    });
  });

  it('el precio y la cantidad viajan como STRING, nunca number (§4.5)', async () => {
    await createItem({
      ...VALUES,
      precioUnitarioSugerido: '6.305000',
      cantidadPorDefecto: '12',
    });

    const body = postMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(typeof body.precioUnitarioSugerido).toBe('string');
    expect(typeof body.cantidadPorDefecto).toBe('string');
  });
});
