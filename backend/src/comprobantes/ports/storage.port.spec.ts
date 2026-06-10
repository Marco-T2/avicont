import { Readable } from 'stream';

import { STORAGE_PORT, type StoragePort } from './storage.port';

/**
 * Verifica que el token de inyección `STORAGE_PORT` resuelve al tipo correcto
 * y que un mock puede implementar la interfaz sin errores de tipo.
 *
 * Este test es un contrato: si alguien cambia la firma del puerto el test rojo
 * indica que todos los mocks del servicio necesitan actualizarse.
 */
describe('StoragePort', () => {
  describe('token de inyección', () => {
    it('STORAGE_PORT es un string no vacío', () => {
      expect(typeof STORAGE_PORT).toBe('string');
      expect(STORAGE_PORT.length).toBeGreaterThan(0);
    });
  });

  describe('contrato de la interfaz', () => {
    // Un mock minimalista que implementa StoragePort completo.
    const mockStorage: StoragePort = {
      put: jest.fn().mockResolvedValue(undefined),
      getStream: jest.fn().mockResolvedValue(Readable.from([])),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    };

    it('put acepta key, buffer y contentType y devuelve Promise<void>', async () => {
      await expect(
        mockStorage.put('tenant/comp/uuid-archivo.pdf', Buffer.from('test'), 'application/pdf'),
      ).resolves.toBeUndefined();
    });

    it('getStream acepta key y devuelve Promise<Readable>', async () => {
      const stream = await mockStorage.getStream('tenant/comp/uuid-archivo.pdf');
      expect(stream).toBeInstanceOf(Readable);
    });

    it('delete acepta key y devuelve Promise<void>', async () => {
      await expect(mockStorage.delete('tenant/comp/uuid-archivo.pdf')).resolves.toBeUndefined();
    });

    it('exists acepta key y devuelve Promise<boolean>', async () => {
      const resultado = await mockStorage.exists('tenant/comp/uuid-archivo.pdf');
      expect(typeof resultado).toBe('boolean');
    });
  });
});
