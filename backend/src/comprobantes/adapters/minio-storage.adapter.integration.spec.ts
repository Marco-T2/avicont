import { Readable } from 'stream';

import { MinioStorageAdapter } from './minio-storage.adapter';

/**
 * Integration spec del MinioStorageAdapter.
 * Requiere MinIO corriendo en localhost:9000 con credenciales minioadmin/minioadmin.
 *
 * Cubre round-trip completo: put → getStream → delete → exists.
 *
 * Correr con:
 *   DATABASE_URL=... pnpm exec jest src/comprobantes/adapters/minio-storage.adapter.integration
 */
describe('MinioStorageAdapter (integración — requiere MinIO en localhost:9000)', () => {
  let adapter: MinioStorageAdapter;

  // Bucket de test: el adapter lo crea en ensureBucket() al inicializar.
  const TEST_BUCKET = 'avicont-adjuntos-test';

  beforeAll(async () => {
    adapter = new MinioStorageAdapter({
      endpoint: 'localhost',
      port: 9000,
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
      bucket: TEST_BUCKET,
      useSsl: false,
    });
    // Inicializar el adapter (ensureBucket idempotente).
    await adapter.onModuleInit();
  });

  const STORAGE_KEY = `test-tenant/test-comp/round-trip-test.pdf`;
  const TEST_CONTENT = Buffer.from('%PDF-1.4 test content');
  const TEST_MIME = 'application/pdf';

  it('put: sube un objeto al storage sin error', async () => {
    await expect(adapter.put(STORAGE_KEY, TEST_CONTENT, TEST_MIME)).resolves.toBeUndefined();
  });

  it('exists: devuelve true para un objeto que acaba de subirse', async () => {
    await adapter.put(STORAGE_KEY, TEST_CONTENT, TEST_MIME);
    const resultado = await adapter.exists(STORAGE_KEY);
    expect(resultado).toBe(true);
  });

  it('exists: devuelve false para una clave inexistente', async () => {
    const resultado = await adapter.exists('no-existe/en/el-storage.pdf');
    expect(resultado).toBe(false);
  });

  it('getStream: devuelve un stream legible con el contenido correcto', async () => {
    await adapter.put(STORAGE_KEY, TEST_CONTENT, TEST_MIME);

    const stream = await adapter.getStream(STORAGE_KEY);
    expect(stream).toBeInstanceOf(Readable);

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }
    const content = Buffer.concat(chunks);
    expect(content).toEqual(TEST_CONTENT);
  });

  it('delete: borra un objeto existente sin error', async () => {
    await adapter.put(STORAGE_KEY, TEST_CONTENT, TEST_MIME);
    await expect(adapter.delete(STORAGE_KEY)).resolves.toBeUndefined();
    const existe = await adapter.exists(STORAGE_KEY);
    expect(existe).toBe(false);
  });

  it('delete: es idempotente — no lanza error si el objeto no existe', async () => {
    await expect(adapter.delete('no-existe/en/el-storage.pdf')).resolves.toBeUndefined();
  });
});
