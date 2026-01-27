import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureFlagsService } from './feature-flags.service';
import { FEATURE_FLAG_KEY } from './feature-flag.decorator';

/**
 * Guard that checks if a feature flag is enabled for the current tenant
 * Usage: @UseGuards(JwtAuthGuard, TenantGuard, FeatureFlagGuard)
 *        @RequireFeature('my_feature')
 */
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlagsService: FeatureFlagsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<string>(FEATURE_FLAG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredFeature) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tenantId = request.tenantId;

    const isEnabled = await this.featureFlagsService.isEnabled(requiredFeature, tenantId);

    if (!isEnabled) {
      throw new ForbiddenException(
        `Feature '${requiredFeature}' is not enabled for your organization`,
      );
    }

    return true;
  }
}
