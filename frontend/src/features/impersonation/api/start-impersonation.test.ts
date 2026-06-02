import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock del cliente api para interceptar llamadas
vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn(),
  },
}));

import { api } from '@/lib/api';
import type { StartImpersonationResponse } from '@/types/api';

import { startImpersonation } from './start-impersonation';

const mockPost = vi.mocked(api.post);

const fakeResponse: StartImpersonationResponse = {
  impersonationToken: 'tok-abc',
  expiresAt: '2026-06-02T16:00:00.000Z',
  impersonationId: 'imp-uuid',
};

describe('startImpersonation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ data: fakeResponse });
  });

  it('con organizationId → body incluye el campo organizationId', async () => {
    await startImpersonation({
      targetUserId: 'user-123',
      reason: 'Soporte: revisión de cuenta del cliente',
      organizationId: 'org-456',
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/api/admin/impersonate',
      {
        targetUserId: 'user-123',
        reason: 'Soporte: revisión de cuenta del cliente',
        organizationId: 'org-456',
      },
    );
  });

  it('sin organizationId → body NO incluye el campo organizationId', async () => {
    await startImpersonation({
      targetUserId: 'user-123',
      reason: 'Soporte: revisión de cuenta del cliente',
    });

    const body = mockPost.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(body).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(body, 'organizationId')).toBe(false);
  });

  it('retorna el StartImpersonationResponse del backend', async () => {
    const result = await startImpersonation({
      targetUserId: 'user-123',
      reason: 'Soporte: revisión de cuenta del cliente',
    });

    expect(result).toEqual(fakeResponse);
  });
});
