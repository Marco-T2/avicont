import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  override handleRequest<TUser = unknown>(err: unknown, user: TUser | false): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or missing token');
    }
    return user as TUser;
  }

  override canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
