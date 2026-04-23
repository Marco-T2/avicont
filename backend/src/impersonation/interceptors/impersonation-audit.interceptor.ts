import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { ImpersonationService } from '../impersonation.service';

// Cuando el JWT del request trae impersonationId, registra cada llamada en
// ImpersonationAction (auditoría doble: la acción ya fue registrada en la
// tabla del dominio con userId = target; acá registramos al admin real).
//
// No bloquea la respuesta: el log se hace en el tap del Observable (post-handler).
@Injectable()
export class ImpersonationAuditInterceptor implements NestInterceptor {
  constructor(private readonly impersonation: ImpersonationService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest();
    const user = req.user as { impersonationId?: string } | undefined;
    if (!user?.impersonationId) return next.handle();

    const impersonationId = user.impersonationId;
    const method = req.method as string;
    const url = req.url as string;
    const path = req.path as string;
    const action = `${method} ${path}`;

    return next.handle().pipe(
      tap({
        next: () => {
          void this.impersonation.logAction({
            impersonationLogId: impersonationId,
            action,
            resource: url,
            metadata: {
              statusCode: req.res?.statusCode,
            },
          });
        },
        error: (err) => {
          void this.impersonation.logAction({
            impersonationLogId: impersonationId,
            action,
            resource: url,
            metadata: {
              error: (err as Error).message,
              statusCode: (err as { status?: number }).status,
            },
          });
        },
      }),
    );
  }
}
