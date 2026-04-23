import { api } from '@/lib/api';
import type { CatalogoAgrupado } from '@/types/api';

// GET /api/permissions/grouped — catálogo agrupado por módulo/submódulo
// para renderizar el picker.
export async function getPermissionsGrouped(): Promise<CatalogoAgrupado[]> {
  const res = await api.get<CatalogoAgrupado[]>('/api/permissions/grouped');
  return res.data;
}
