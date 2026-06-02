import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ImpersonationController } from './impersonation.controller';
import { ImpersonationService } from './impersonation.service';
import { StartImpersonationDto } from './dto/start-impersonation.dto';

/** Mock de ImpersonationService: solo expone start() y end() como jest.fn(). */
const mockService = {
  start: jest.fn(),
  end: jest.fn(),
};

/**
 * Construye un request tipado para el controller.
 * Permite simular SA org-less (sin activeTenantId) o OWNER (con header/JWT).
 */
function buildReq(overrides: {
  isSuperAdmin?: boolean;
  activeTenantId?: string;
  xTenantId?: string;
  impersonationId?: string;
  sub?: string;
}) {
  return {
    user: {
      sub: overrides.sub ?? 'caller-user-id',
      ...(overrides.activeTenantId !== undefined
        ? { activeTenantId: overrides.activeTenantId }
        : {}),
      ...(overrides.isSuperAdmin !== undefined ? { isSuperAdmin: overrides.isSuperAdmin } : {}),
      ...(overrides.impersonationId !== undefined
        ? { impersonationId: overrides.impersonationId }
        : {}),
    },
    headers: {
      ...(overrides.xTenantId !== undefined ? { 'x-tenant-id': overrides.xTenantId } : {}),
    },
  };
}

describe('ImpersonationController', () => {
  let controller: ImpersonationController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImpersonationController],
      providers: [{ provide: ImpersonationService, useValue: mockService }],
    }).compile();

    controller = module.get<ImpersonationController>(ImpersonationController);
  });

  describe('start() — resolución de organizationId', () => {
    const targetUserId = 'target-user-id';
    const reason = 'Soporte: revisión de cuenta del cliente';
    const saOrgId = 'sa-target-org-id';
    const ownerOrgId = 'owner-org-id';

    it('SA + dto.organizationId → service.start recibe dto.organizationId como organizationId arg', () => {
      const dto: StartImpersonationDto = { targetUserId, reason, organizationId: saOrgId };
      const req = buildReq({ isSuperAdmin: true });
      // service.start retorna una promesa
      mockService.start.mockResolvedValue({
        impersonationToken: 'tok',
        expiresAt: new Date(),
        impersonationId: 'imp-id',
      });

      controller.start(req as never, dto);

      expect(mockService.start).toHaveBeenCalledWith(
        'caller-user-id',
        saOrgId, // organizationId = dto.organizationId
        dto,
        true, // callerEsSuperAdmin = true
      );
    });

    it('SA sin dto.organizationId → service.start recibe la org del contexto (X-Tenant-ID)', () => {
      // SA que por algún motivo sí tiene contexto (ej: después de un switch-tenant)
      const dto: StartImpersonationDto = { targetUserId, reason };
      const req = buildReq({ isSuperAdmin: true, xTenantId: ownerOrgId });
      mockService.start.mockResolvedValue({
        impersonationToken: 'tok',
        expiresAt: new Date(),
        impersonationId: 'imp-id',
      });

      controller.start(req as never, dto);

      // SA pero sin dto.organizationId → resolveTenantId(req) = X-Tenant-ID
      expect(mockService.start).toHaveBeenCalledWith('caller-user-id', ownerOrgId, dto, true);
    });

    it('OWNER sin dto.organizationId → service.start recibe resolveTenantId(req) = X-Tenant-ID', () => {
      const dto: StartImpersonationDto = { targetUserId, reason };
      const req = buildReq({ isSuperAdmin: false, xTenantId: ownerOrgId });
      mockService.start.mockResolvedValue({
        impersonationToken: 'tok',
        expiresAt: new Date(),
        impersonationId: 'imp-id',
      });

      controller.start(req as never, dto);

      expect(mockService.start).toHaveBeenCalledWith(
        'caller-user-id',
        ownerOrgId, // resolveTenantId usa header
        dto,
        false, // callerEsSuperAdmin = false
      );
    });

    it('OWNER sin dto.organizationId → service.start recibe resolveTenantId(req) = JWT.activeTenantId', () => {
      const dto: StartImpersonationDto = { targetUserId, reason };
      const req = buildReq({ isSuperAdmin: false, activeTenantId: ownerOrgId });
      mockService.start.mockResolvedValue({
        impersonationToken: 'tok',
        expiresAt: new Date(),
        impersonationId: 'imp-id',
      });

      controller.start(req as never, dto);

      expect(mockService.start).toHaveBeenCalledWith(
        'caller-user-id',
        ownerOrgId, // resolveTenantId usa JWT.activeTenantId
        dto,
        false,
      );
    });

    it('OWNER envía dto.organizationId de otra org → ignorado; resolveTenantId usa X-Tenant-ID', () => {
      // El OWNER no es SA → organizationId en body es ignorado
      const dto: StartImpersonationDto = {
        targetUserId,
        reason,
        organizationId: 'ajena-org-id',
      };
      const req = buildReq({ isSuperAdmin: false, xTenantId: ownerOrgId });
      mockService.start.mockResolvedValue({
        impersonationToken: 'tok',
        expiresAt: new Date(),
        impersonationId: 'imp-id',
      });

      controller.start(req as never, dto);

      // El 3er arg es ownerOrgId (del contexto), no 'ajena-org-id'
      expect(mockService.start).toHaveBeenCalledWith('caller-user-id', ownerOrgId, dto, false);
    });

    it('SA org-less (sin xTenantId ni activeTenantId) sin dto.organizationId → ForbiddenException', () => {
      const dto: StartImpersonationDto = { targetUserId, reason };
      const req = buildReq({ isSuperAdmin: true }); // sin header ni activeTenantId

      expect(() => controller.start(req as never, dto)).toThrow(ForbiddenException);
    });

    it('caller con impersonationId activo → ForbiddenException (no anidar)', () => {
      const dto: StartImpersonationDto = {
        targetUserId,
        reason,
        organizationId: saOrgId,
      };
      const req = buildReq({ isSuperAdmin: true, impersonationId: 'existing-imp-id' });

      expect(() => controller.start(req as never, dto)).toThrow(ForbiddenException);
      expect(mockService.start).not.toHaveBeenCalled();
    });
  });
});
