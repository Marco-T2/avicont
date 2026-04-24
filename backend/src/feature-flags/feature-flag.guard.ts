import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { FEATURE_FLAG_KEY } from './feature-flag.decorator';
import {
  FEATURE_FLAG_READER_PORT,
  type FeatureFlagReaderPort,
} from './ports/feature-flag-reader.port';

/**
 * Guard que verifica si una feature flag está habilitada para el tenant actual.
 * Uso: @UseGuards(JwtAuthGuard, TenantGuard, FeatureFlagGuard)
 *      @RequireFeature('my_feature')
 *
 * Depende sólo del puerto de lectura — el guard no conoce Prisma ni cache.
 */
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(FEATURE_FLAG_READER_PORT)
    private readonly reader: FeatureFlagReaderPort,
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

    const isEnabled = await this.reader.isEnabled(requiredFeature, tenantId);

    if (!isEnabled) {
      throw new ForbiddenException(
        `Feature '${requiredFeature}' is not enabled for your organization`,
      );
    }

    return true;
  }
}
