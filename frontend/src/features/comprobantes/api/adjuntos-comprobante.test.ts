import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdjuntoComprobante } from '@/types/api';

// Mock del cliente api central — no se llama fetch directo (Anti-F-03).
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { api } from '@/lib/api';
import {
  getAdjuntos,
  subirAdjunto,
  descargarAdjunto,
  reemplazarAdjunto,
  eliminarAdjunto,
} from './adjuntos-comprobante';

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const adjuntoBase: AdjuntoComprobante = {
  id: 'adj-1',
  comprobanteId: 'comp-1',
  nombreOriginal: 'factura.pdf',
  mimeType: 'application/pdf',
  tamanoBytes: 1024,
  subidoPorUserId: 'user-1',
  createdAt: '2026-06-10T00:00:00Z',
  updatedAt: '2026-06-10T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('getAdjuntos', () => {
  it('llama GET /api/comprobantes/:id/adjuntos y retorna el array', async () => {
    mockApi.get.mockResolvedValue({ data: [adjuntoBase] });

    const result = await getAdjuntos('comp-1');

    expect(mockApi.get).toHaveBeenCalledWith('/api/comprobantes/comp-1/adjuntos');
    expect(result).toEqual([adjuntoBase]);
  });

  it('retorna array vacío cuando la respuesta tiene data vacía', async () => {
    mockApi.get.mockResolvedValue({ data: [] });

    const result = await getAdjuntos('comp-2');

    expect(result).toEqual([]);
  });
});

describe('subirAdjunto', () => {
  it('llama POST /api/comprobantes/:id/adjuntos con FormData y retorna el adjunto creado', async () => {
    mockApi.post.mockResolvedValue({ data: adjuntoBase });

    const file = new File(['contenido'], 'factura.pdf', { type: 'application/pdf' });
    const result = await subirAdjunto('comp-1', file);

    expect(mockApi.post).toHaveBeenCalledOnce();
    const [url, body, config] = mockApi.post.mock.calls[0] as [string, FormData, { headers: Record<string, string> }];
    expect(url).toBe('/api/comprobantes/comp-1/adjuntos');
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('file')).toBeInstanceOf(File);
    expect(config?.headers?.['Content-Type']).toBe('multipart/form-data');
    expect(result).toEqual(adjuntoBase);
  });
});

describe('descargarAdjunto', () => {
  it('llama GET /api/comprobantes/:id/adjuntos/:adjuntoId/download como blob y retorna Blob', async () => {
    const blob = new Blob(['datos'], { type: 'application/pdf' });
    mockApi.get.mockResolvedValue({ data: blob });

    const result = await descargarAdjunto('comp-1', 'adj-1');

    expect(mockApi.get).toHaveBeenCalledWith(
      '/api/comprobantes/comp-1/adjuntos/adj-1/download',
      { responseType: 'blob' },
    );
    expect(result).toBe(blob);
  });
});

describe('reemplazarAdjunto', () => {
  it('llama PUT /api/comprobantes/:id/adjuntos/:adjuntoId con FormData y retorna el adjunto actualizado', async () => {
    const adjuntoActualizado = { ...adjuntoBase, nombreOriginal: 'nuevo.pdf' };
    mockApi.put.mockResolvedValue({ data: adjuntoActualizado });

    const file = new File(['nuevo'], 'nuevo.pdf', { type: 'application/pdf' });
    const result = await reemplazarAdjunto('comp-1', 'adj-1', file);

    expect(mockApi.put).toHaveBeenCalledOnce();
    const [url, body, config] = mockApi.put.mock.calls[0] as [string, FormData, { headers: Record<string, string> }];
    expect(url).toBe('/api/comprobantes/comp-1/adjuntos/adj-1');
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('file')).toBeInstanceOf(File);
    expect(config?.headers?.['Content-Type']).toBe('multipart/form-data');
    expect(result).toEqual(adjuntoActualizado);
  });
});

describe('eliminarAdjunto', () => {
  it('llama DELETE /api/comprobantes/:id/adjuntos/:adjuntoId y no retorna datos', async () => {
    mockApi.delete.mockResolvedValue({ data: undefined });

    await eliminarAdjunto('comp-1', 'adj-1');

    expect(mockApi.delete).toHaveBeenCalledWith(
      '/api/comprobantes/comp-1/adjuntos/adj-1',
    );
  });
});
