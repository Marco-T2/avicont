import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';

import type { ItemFormValues } from '../schemas/item-form-schema';

import { updateItem } from './update-item';

vi.mock('@/lib/api', () => ({
  api: { patch: vi.fn() },
}));

const patchMock = vi.mocked(api.patch);

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
  patchMock.mockReset();
  patchMock.mockResolvedValue({ data: {} });
});

describe('updateItem', () => {
  it('convierte los opcionales vacíos a null — null LIMPIA el campo en el backend', async () => {
    await updateItem('item-1', VALUES);

    expect(patchMock).toHaveBeenCalledWith('/api/items/item-1', {
      nombre: 'Pollo entero',
      tipo: 'PRODUCTO',
      codigo: null,
      unidadMedida: null,
      precioUnitarioSugerido: null,
      cantidadPorDefecto: '1',
      cuentaIngresoId: null,
    });
  });

  it('NO manda el campo activo — desactivar/reactivar tienen endpoints propios', async () => {
    await updateItem('item-1', VALUES);

    const body = patchMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect('activo' in body).toBe(false);
  });
});
