import type { AdjuntoComprobante } from '@prisma/client';

import {
  ADJUNTO_COMPROBANTE_REPOSITORY_PORT,
  type AdjuntoComprobanteRepositoryPort,
  type CrearAdjuntoData,
} from './adjunto-comprobante.repository.port';

/**
 * Verifica que el token de inyección `ADJUNTO_COMPROBANTE_REPOSITORY_PORT`
 * resuelve al tipo correcto y que un mock puede implementar la interfaz.
 */
describe('AdjuntoComprobanteRepositoryPort', () => {
  const mockAdjunto: AdjuntoComprobante = {
    id: 'adjunto-uuid',
    organizationId: 'org-uuid',
    comprobanteId: 'comp-uuid',
    storageKey: 'org-uuid/comp-uuid/file.pdf',
    nombreOriginal: 'factura.pdf',
    mimeType: 'application/pdf',
    tamanoBytes: 12345,
    sha256: null,
    subidoPorUserId: 'user-uuid',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRepo: AdjuntoComprobanteRepositoryPort = {
    crear: jest.fn().mockResolvedValue(mockAdjunto),
    listar: jest.fn().mockResolvedValue([mockAdjunto]),
    obtenerPorId: jest.fn().mockResolvedValue(mockAdjunto),
    actualizar: jest.fn().mockResolvedValue(mockAdjunto),
    eliminar: jest.fn().mockResolvedValue(true),
    contarPorComprobante: jest.fn().mockResolvedValue(1),
  };

  it('token es un string no vacío', () => {
    expect(typeof ADJUNTO_COMPROBANTE_REPOSITORY_PORT).toBe('string');
    expect(ADJUNTO_COMPROBANTE_REPOSITORY_PORT.length).toBeGreaterThan(0);
  });

  it('crear devuelve AdjuntoComprobante', async () => {
    const data: CrearAdjuntoData = {
      organizationId: 'org-uuid',
      comprobanteId: 'comp-uuid',
      storageKey: 'org-uuid/comp-uuid/file.pdf',
      nombreOriginal: 'factura.pdf',
      mimeType: 'application/pdf',
      tamanoBytes: 12345,
      subidoPorUserId: 'user-uuid',
    };
    const result = await mockRepo.crear(data);
    expect(result).toEqual(mockAdjunto);
  });

  it('listar devuelve array de AdjuntoComprobante', async () => {
    const result = await mockRepo.listar('org-uuid', 'comp-uuid');
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toEqual(mockAdjunto);
  });

  it('obtenerPorId devuelve null para cross-tenant (anti-31)', async () => {
    const mockRepoNull: AdjuntoComprobanteRepositoryPort = {
      ...mockRepo,
      obtenerPorId: jest.fn().mockResolvedValue(null),
    };
    const result = await mockRepoNull.obtenerPorId('otro-org-uuid', 'adjunto-uuid');
    expect(result).toBeNull();
  });

  it('eliminar devuelve boolean', async () => {
    const result = await mockRepo.eliminar('org-uuid', 'adjunto-uuid');
    expect(typeof result).toBe('boolean');
  });

  it('contarPorComprobante devuelve number', async () => {
    const result = await mockRepo.contarPorComprobante('org-uuid', 'comp-uuid');
    expect(typeof result).toBe('number');
  });
});
