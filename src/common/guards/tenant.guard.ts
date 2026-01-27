import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { TenantContextService } from '../tenant-context/tenant-context.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly tenantContext: TenantContextService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const tenantId = req.tenantId || this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context is required');
    }
    return true;
  }
}
