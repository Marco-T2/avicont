import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { CLOCK_PORT } from '@/common/clock/clock.port';
import { FakeClockAdapter } from '@/common/clock/fake-clock.adapter';
import { RedisService } from '@/cache/redis.service';
import {
  MEMBERSHIPS_READER_PORT,
  type MembershipsReaderPort,
} from '../memberships/ports/memberships-reader.port';
import { USERS_READER_PORT, type UsersReaderPort } from '../users/ports/users-reader.port';
import { USERS_WRITER_PORT, type UsersWriterPort } from '../users/ports/users-writer.port';

import { MetricsService } from '../metrics/metrics.service';
import { AuthService } from './auth.service';
import {
  CredencialesInvalidasError,
  NoMiembroDeTenantError,
  TokenInvalidoError,
} from './domain/auth-errors';
import {
  CREDENTIALS_REPOSITORY_PORT,
  type CredentialsRepositoryPort,
} from './ports/credentials.repository.port';

/**
 * Unit tests de AuthService. Sirven como safety net adicional al e2e
 * validando el cableado entre AuthService y los ports (credentials,
 * memberships, users) sin tocar DB ni red (§2.1 Sesión B, paso 6).
 */
describe('AuthService (unit)', () => {
  let service: AuthService;
  let credentials: jest.Mocked<CredentialsRepositoryPort>;
  let memberships: jest.Mocked<MembershipsReaderPort>;
  let usersReader: jest.Mocked<UsersReaderPort>;
  let usersWriter: jest.Mocked<UsersWriterPort>;
  let jwt: { sign: jest.Mock };
  let metrics: { recordLogin: jest.Mock; recordTokenRefresh: jest.Mock };
  let clock: FakeClockAdapter;

  beforeEach(async () => {
    credentials = {
      findActiveByHash: jest.fn(),
      create: jest.fn(),
      revokeById: jest.fn(),
      revokeByHash: jest.fn(),
    };
    memberships = {
      findActivasByUserId: jest.fn().mockResolvedValue([]),
      findActivaByUserAndTenant: jest.fn(),
      findActivasConOrganizacionByUserId: jest.fn().mockResolvedValue([]),
      findForImpersonation: jest.fn(),
      findAllByTenant: jest.fn().mockResolvedValue([]),
    };
    usersReader = {
      findByEmail: jest.fn(),
      findMinimalByEmail: jest.fn(),
      findFlagsSeguridadById: jest.fn().mockResolvedValue({ isSuperAdmin: false }),
    };
    usersWriter = { create: jest.fn() };
    jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    metrics = { recordLogin: jest.fn(), recordTokenRefresh: jest.fn() };
    clock = new FakeClockAdapter();
    const config = {
      get: jest.fn().mockReturnValue('30d'),
    } as unknown as ConfigService;
    const redis = { set: jest.fn(), get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: USERS_READER_PORT, useValue: usersReader },
        { provide: USERS_WRITER_PORT, useValue: usersWriter },
        { provide: CREDENTIALS_REPOSITORY_PORT, useValue: credentials },
        { provide: MEMBERSHIPS_READER_PORT, useValue: memberships },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: MetricsService, useValue: metrics },
        { provide: CLOCK_PORT, useValue: clock },
        { provide: 'RedisService', useValue: redis },
        // RedisService inyectado por clase (no por token), usamos useValue directo
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('validateUser', () => {
    it('lanza CredencialesInvalidasError si el email no existe', async () => {
      usersReader.findByEmail.mockResolvedValue(null);
      await expect(service.validateUser('x@y.com', 'pw')).rejects.toBeInstanceOf(
        CredencialesInvalidasError,
      );
    });

    it('lanza CredencialesInvalidasError si la password no matchea', async () => {
      const hashedPassword = await bcrypt.hash('correcta', 10);
      usersReader.findByEmail.mockResolvedValue({
        id: 'u-1',
        email: 'x@y.com',
        hashedPassword,
        isActive: true,
        isSuperAdmin: false,
      });
      await expect(service.validateUser('x@y.com', 'mala')).rejects.toBeInstanceOf(
        CredencialesInvalidasError,
      );
    });

    it('lanza CredencialesInvalidasError si el user está desactivado', async () => {
      const hashedPassword = await bcrypt.hash('correcta', 10);
      usersReader.findByEmail.mockResolvedValue({
        id: 'u-1',
        email: 'x@y.com',
        hashedPassword,
        isActive: false,
        isSuperAdmin: false,
      });
      await expect(service.validateUser('x@y.com', 'correcta')).rejects.toBeInstanceOf(
        CredencialesInvalidasError,
      );
    });

    it('retorna el user si email, password y estado son válidos', async () => {
      const hashedPassword = await bcrypt.hash('correcta', 10);
      const user = {
        id: 'u-1',
        email: 'x@y.com',
        hashedPassword,
        isActive: true,
        isSuperAdmin: false,
      };
      usersReader.findByEmail.mockResolvedValue(user);
      await expect(service.validateUser('x@y.com', 'correcta')).resolves.toBe(user);
    });
  });

  describe('login', () => {
    const setupValidUser = async () => {
      const hashedPassword = await bcrypt.hash('pw', 10);
      usersReader.findByEmail.mockResolvedValue({
        id: 'u-1',
        email: 'x@y.com',
        hashedPassword,
        isActive: true,
        isSuperAdmin: false,
      });
    };

    it('usa el primer tenant como activo y extrae roles (systemRole prioriza sobre customRole)', async () => {
      await setupValidUser();
      memberships.findActivasByUserId.mockResolvedValue([
        { organizationId: 'org-1', systemRole: 'OWNER', customRoleSlug: null },
        { organizationId: 'org-2', systemRole: null, customRoleSlug: 'contador' },
      ]);

      const result = await service.login({ email: 'x@y.com', password: 'pw' });

      const signedPayload = jwt.sign.mock.calls[0]?.[0];
      expect(signedPayload.sub).toBe('u-1');
      expect(signedPayload.activeTenantId).toBe('org-1');
      expect(signedPayload.roles).toEqual(['OWNER']);
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toMatch(/^[0-9a-f]{64}$/);
      expect(credentials.create).toHaveBeenCalledTimes(1);
    });

    it('sin memberships: activeTenantId undefined y roles vacíos', async () => {
      await setupValidUser();
      memberships.findActivasByUserId.mockResolvedValue([]);

      await service.login({ email: 'x@y.com', password: 'pw' });

      const signedPayload = jwt.sign.mock.calls[0]?.[0];
      expect(signedPayload).not.toHaveProperty('activeTenantId');
      expect(signedPayload.roles).toEqual([]);
    });

    it('registra la métrica de login exitoso', async () => {
      await setupValidUser();
      memberships.findActivasByUserId.mockResolvedValue([
        { organizationId: 'org-1', systemRole: 'OWNER', customRoleSlug: null },
      ]);

      await service.login({ email: 'x@y.com', password: 'pw' });

      expect(metrics.recordLogin).toHaveBeenCalledWith(true);
    });

    it('registra la métrica de login fallido y propaga el error', async () => {
      usersReader.findByEmail.mockResolvedValue(null);

      await expect(service.login({ email: 'x@y.com', password: 'mala' })).rejects.toBeInstanceOf(
        CredencialesInvalidasError,
      );
      expect(metrics.recordLogin).toHaveBeenCalledWith(false);
    });
  });

  describe('logout', () => {
    it('revoca el token por hash con motivo "logout"', async () => {
      const raw = 'raw-refresh-token';
      const expectedHash = crypto.createHash('sha256').update(raw).digest('hex');

      await service.logout(raw);

      expect(credentials.revokeByHash).toHaveBeenCalledWith(expectedHash, 'logout');
      expect(credentials.revokeByHash).toHaveBeenCalledTimes(1);
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
      expect(metrics.recordTokenRefresh).toHaveBeenCalledWith(false);
    });

    it('rota: revoca el anterior y crea uno nuevo preservando familyId', async () => {
      credentials.findActiveByHash.mockResolvedValue({
        id: 'stored-1',
        userId: 'user-1',
        userEmail: 'user@example.com',
        organizationId: 'org-1',
        familyId: '123e4567-e89b-42d3-a456-426614174000',
      });
      memberships.findActivasByUserId.mockResolvedValue([
        { organizationId: 'org-1', systemRole: 'ADMIN', customRoleSlug: null },
      ]);

      const result = await service.refreshTokens('raw-token');

      expect(credentials.revokeById).toHaveBeenCalledWith('stored-1', 'rotated');
      const createArgs = credentials.create.mock.calls[0]?.[0];
      expect(createArgs?.userId).toBe('user-1');
      expect(createArgs?.familyId).toBe('123e4567-e89b-42d3-a456-426614174000');
      expect(createArgs?.organizationId).toBe('org-1');
      expect(result.refreshToken).not.toBe('raw-token');
      expect(metrics.recordTokenRefresh).toHaveBeenCalledWith(true);
    });
  });

  describe('createRefreshToken — expiresAt determinista vía clock', () => {
    it('expiresAt del refresh token = clock.now() + duración parseada (sin flakiness de ±ms)', async () => {
      const frozenNow = new Date('2026-06-01T00:00:00.000Z');
      clock.setTo(frozenNow);

      const hashedPassword = await bcrypt.hash('pw', 10);
      usersReader.findByEmail.mockResolvedValue({
        id: 'u-1',
        email: 'x@y.com',
        hashedPassword,
        isActive: true,
        isSuperAdmin: false,
      });
      memberships.findActivasByUserId.mockResolvedValue([]);

      await service.login({ email: 'x@y.com', password: 'pw' });

      const createArgs = credentials.create.mock.calls[0]?.[0];
      // 30d = 30 * 24 * 60 * 60 * 1000 ms
      const expected = new Date(frozenNow.getTime() + 30 * 24 * 60 * 60 * 1000);
      expect(createArgs?.expiresAt).toEqual(expected);
    });
  });

  describe('switchTenant', () => {
    it('lanza NoMiembroDeTenantError si el port devuelve null', async () => {
      memberships.findActivaByUserAndTenant.mockResolvedValue(null);

      await expect(service.switchTenant('u-1', 'org-x')).rejects.toBeInstanceOf(
        NoMiembroDeTenantError,
      );
      expect(credentials.create).not.toHaveBeenCalled();
    });

    it('emite JWT con el tenant solicitado y rol efectivo del membership', async () => {
      memberships.findActivaByUserAndTenant.mockResolvedValue({
        organizationId: 'org-2',
        systemRole: null,
        customRoleSlug: 'granjero',
        userEmail: 'u@example.com',
      });

      await service.switchTenant('u-1', 'org-2');

      const signedPayload = jwt.sign.mock.calls[0]?.[0];
      expect(signedPayload.sub).toBe('u-1');
      expect(signedPayload.email).toBe('u@example.com');
      expect(signedPayload.activeTenantId).toBe('org-2');
      expect(signedPayload.roles).toEqual(['granjero']);
      expect(credentials.create).toHaveBeenCalledTimes(1);
    });
  });
});
