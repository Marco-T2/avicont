import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { descargarBlob, generarNombreArchivo } from './descargar-blob';

describe('descargarBlob', () => {
  let mockLink: {
    click: ReturnType<typeof vi.fn>;
    setAttribute: ReturnType<typeof vi.fn>;
    style: { display: string };
    href: string;
    download: string;
  };

  beforeEach(() => {
    mockLink = {
      click: vi.fn(),
      setAttribute: vi.fn(),
      style: { display: '' },
      href: '',
      download: '',
    };

    vi.spyOn(document, 'createElement').mockReturnValue(
      mockLink as unknown as HTMLAnchorElement,
    );
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown as Node);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as unknown as Node);

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:test-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('crea un enlace con el blob como href y lo clica', () => {
    const blob = new Blob(['test'], { type: 'application/xlsx' });
    const nombre = 'libro-diario-2026-06.xlsx';

    descargarBlob(blob, nombre);

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(mockLink.href).toBe('blob:test-url');
    expect(mockLink.download).toBe(nombre);
    expect(mockLink.click).toHaveBeenCalledOnce();
  });

  it('revoca la ObjectURL tras disparar el clic (sin fuga)', () => {
    const blob = new Blob(['test'], { type: 'application/xlsx' });

    descargarBlob(blob, 'test.xlsx');

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });

  it('el nombre de archivo incluye referencia al informe y al período', () => {
    // §1: nombre en español con extensión .xlsx
    expect(generarNombreArchivo('libro-diario', '2026-06')).toBe('libro-diario-2026-06.xlsx');
    expect(generarNombreArchivo('libro-mayor', '2026-01')).toBe('libro-mayor-2026-01.xlsx');
  });
});
