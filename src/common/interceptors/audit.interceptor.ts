import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { sub?: string };
    const tenantId = request.tenantId as string | undefined;
    const entity = `${request.method} ${request.route?.path ?? request.url}`;

    return next.handle().pipe(
      tap((responseBody) => {
        void this.auditService.log({
          action: entity,
          entity: 'http-request',
          entityId: request.id ?? request.url,
          tenantId,
          userId: user?.sub,
          metadata: { status: request.res?.statusCode, response: responseBody },
        });
      }),
    );
  }
}
