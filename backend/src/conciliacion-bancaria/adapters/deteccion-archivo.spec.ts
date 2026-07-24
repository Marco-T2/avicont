import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { detectarFamiliaArchivo } from './deteccion-archivo';

const FIXTURES_DIR = join(__dirname, '__fixtures__');

describe('detectarFamiliaArchivo (REQ-CB-04)', () => {
  it('un .xlsx real (magic bytes ZIP 50 4B 03 04) -> ZIP_OOXML', async () => {
    const buffer = readFileSync(join(FIXTURES_DIR, 'bancosol-a-mayo-junio.xlsx'));
    await expect(detectarFamiliaArchivo(buffer)).resolves.toBe('ZIP_OOXML');
  });

  it('un .xls legacy (magic bytes OLE2 D0 CF 11 E0 A1 B1 1A E1), aunque venga renombrado a .xlsx -> OLE2_LEGACY', async () => {
    const buffer = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(512),
    ]);
    await expect(detectarFamiliaArchivo(buffer)).resolves.toBe('OLE2_LEGACY');
  });

  it('buffer sin magic bytes reconocibles -> DESCONOCIDA', async () => {
    await expect(detectarFamiliaArchivo(Buffer.from('no soy un archivo binario'))).resolves.toBe(
      'DESCONOCIDA',
    );
  });
});
