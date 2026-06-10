import type { AdjuntoComprobante } from '@prisma/client';

import { toAdjuntoResponseDto } from './adjunto-response.dto';

/**
 * Verifica el mapeo de AdjuntoComprobante (Prisma) → AdjuntoResponseDto.
 * TDD RED: escrito antes que el DTO y la función de mapeo existan.
 */
describe('AdjuntoResponseDto', () => {
  const mockAdjunto: AdjuntoComprobante = {
    id: 'adj-uuid',
    organizationId: 'org-uuid',
    comprobanteId: 'comp-uuid',
    storageKey: 'org-uuid/comp-uuid/uuid-factura.pdf',
    nombreOriginal: 'factura.pdf',
    mimeType: 'application/pdf',
    tamanoBytes: 25000,
    sha256: null,
    subidoPorUserId: 'user-uuid',
    createdAt: new Date('2026-01-15T10:30:00.000Z'),
    updatedAt: new Date('2026-01-15T11:00:00.000Z'),
  };

  describe('toAdjuntoResponseDto', () => {
    it('mapea todos los campos del DTO correctamente', () => {
      const dto = toAdjuntoResponseDto(mockAdjunto);

      expect(dto.id).toBe('adj-uuid');
      expect(dto.nombreOriginal).toBe('factura.pdf');
      expect(dto.mimeType).toBe('application/pdf');
      expect(dto.tamanoBytes).toBe(25000);
      expect(dto.subidoPorUserId).toBe('user-uuid');
      expect(dto.createdAt).toBe('2026-01-15T10:30:00.000Z');
    });

    it('NO incluye storageKey ni organizationId (datos internos de storage)', () => {
      const dto = toAdjuntoResponseDto(mockAdjunto);
      const keys = Object.keys(dto);

      expect(keys).not.toContain('storageKey');
      expect(keys).not.toContain('organizationId');
    });

    it('incluye comprobanteId para que el cliente pueda correlacionar', () => {
      const dto = toAdjuntoResponseDto(mockAdjunto);
      expect(dto.comprobanteId).toBe('comp-uuid');
    });

    it('serializa createdAt como string ISO (§4.6 UTC)', () => {
      const dto = toAdjuntoResponseDto(mockAdjunto);
      expect(typeof dto.createdAt).toBe('string');
      // Formato ISO con Z (UTC) — §4.6: timestamps en UTC
      expect(dto.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('serializa updatedAt como string ISO (§4.6 UTC)', () => {
      const dto = toAdjuntoResponseDto(mockAdjunto);
      expect(typeof dto.updatedAt).toBe('string');
      expect(dto.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(dto.updatedAt).toBe('2026-01-15T11:00:00.000Z');
    });
  });

  describe('instancia de AdjuntoResponseDto', () => {
    it('tiene todos los campos definidos (no undefined)', () => {
      const dto = toAdjuntoResponseDto(mockAdjunto);
      expect(dto.id).toBeDefined();
      expect(dto.comprobanteId).toBeDefined();
      expect(dto.nombreOriginal).toBeDefined();
      expect(dto.mimeType).toBeDefined();
      expect(dto.tamanoBytes).toBeDefined();
      expect(dto.subidoPorUserId).toBeDefined();
      expect(dto.createdAt).toBeDefined();
      expect(dto.updatedAt).toBeDefined();
    });
  });
});
