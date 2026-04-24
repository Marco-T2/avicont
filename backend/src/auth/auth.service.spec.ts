import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

import { PrismaService } from '../common/prisma.service';
import { USERS_READER_PORT, type UsersReaderPort } from '../users/ports/users-reader.port';
import { USERS_WRITER_PORT, type UsersWriterPort } from '../users/ports/users-writer.port';

import { AuthService } from './auth.service';
import { TokenInvalidoError } from './domain/auth-errors';
import {
  CREDENTIALS_REPOSITORY_PORT,
  type CredentialsRepositoryPort,
} from './ports/credentials.repository.port';

/**
 * Unit tests de AuthService. Sirven como safety net adicional al e2e para los
 * flujos que cruzan el port de credentials (§2.1 Sesión B, paso 6 del plan).
 *
 * `prisma.membership.*` todavía se usa directo en login/refreshTokens/
 * switchTenant — los tests que lo requieren llegan cuando ese acceso se
 * extraiga al MEMBERSHIPS_READER_PORT (commit siguiente).
 */
describe('AuthService (unit)', () => {
  let service: AuthService;
  let credentials: jest.Mocked<CredentialsRepositoryPort>;

  beforeEach(async () => {
    credentials = {
      findActiveByHash: jest.fn(),
      create: jest.fn(),
      revokeById: jest.fn(),
      revokeByHash: jest.fn(),
    };

    const usersReader: UsersReaderPort = {
      findByEmail: jest.fn(),
    };
    const usersWriter: UsersWriterPort = {
      create: jest.fn(),
    };
    const prisma = {
      membership: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') } as unknown as JwtService;
    const config = {
      get: jest.fn().mockReturnValue('30d'),
    } as unknown as ConfigService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: USERS_READER_PORT, useValue: usersReader },
        { provide: USERS_WRITER_PORT, useValue: usersWriter },
        { provide: CREDENTIALS_REPOSITORY_PORT, useValue: credentials },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('logout', () => {
    it('revoca el token por hash con motivo "logout"', async () => {
      const raw = 'raw-refresh-token';
      const expectedHash = crypto.createHash('sha256').update(raw).digest('hex');

      await service.logout(raw);

      expect(credentials.revokeByHash).toHaveBeenCalledWith(expectedHash, 'logout');
      expect(credentials.revokeByHash).toHaveBeenCalledTimes(1);
    });

    it('no levanta si el hash no corresponde a ningún token', async () => {
      credentials.revokeByHash.mockResolvedValue();
      await expect(service.logout('desconocido')).resolves.toBeUndefined();
    });
  });

  describe('refreshTokens', () => {
    it('lanza TokenInvalidoError si no existe un token activo con ese hash', async () => {
      credentials.findActiveByHash.mockResolvedValue(null);

      await expect(service.refreshTokens('cualquier-token')).rejects.toBeInstanceOf(
        TokenInvalidoError,
      );

      expect(credentials.revokeById).not.toHaveBeenCalled();
      expect(credentials.create).not.toHaveBeenCalled();
    });

    it('al rotar: revoca el anterior y crea uno nuevo preservando familyId', async () => {
      credentials.findActiveByHash.mockResolvedValue({
        id: 'stored-1',
        userId: 'user-1',
        userEmail: 'user@example.com',
        organizationId: null,
        familyId: '123e4567-e89b-42d3-a456-426614174000',
      });

      const result = await service.refreshTokens('raw-token');

      expect(credentials.revokeById).toHaveBeenCalledWith('stored-1', 'rotated');
      expect(credentials.create).toHaveBeenCalledTimes(1);
      const createArgs = credentials.create.mock.calls[0]?.[0];
      expect(createArgs?.userId).toBe('user-1');
      expect(createArgs?.familyId).toBe('123e4567-e89b-42d3-a456-426614174000');
      expect(createArgs?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).not.toBe('raw-token');
    });
  });
});
