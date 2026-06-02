import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

import { CLOCK_PORT, ClockPort } from '@/common/clock/clock.port';
import { redactarSensibles } from '@/common/redact-secrets';
import { PLATFORM_AUDIT_PORT, PlatformAuditPort } from '@/platform/ports/platform-audit.port';

/** Métodos HTTP que mutan estado y deben auditarse. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Interceptor de auditoría de plataforma (REQ-SA-08/09).
 *
 * Registra en `platform_audit` TODA request donde `req.user.isSuperAdmin === true` que:
 * - Mute estado (POST, PUT, PATCH, DELETE), O
 * - Acceda a datos cross-tenant (GET org-scoped con req.tenantId !== req.user.activeTenantId).
 *
 * Excluye GET sin contexto de tenant (listado global de orgs — ruido sin valor en audit).
 *
 * El write es best-effort: si falla, la request principal NO se interrumpe.
 * El error se descarta silenciosamente (void) para no degradar la experiencia.
 * Decisión documentada: el audit de plataforma es observabilidad de segundo orden —
 * la operación ya completó; un error de escritura de audit no debe deshacerla.
 * (Patrón idéntico al de ImpersonationAuditInterceptor del proyecto.)
 *
 * Timestamp vía ClockPort (CLAUDE.md §4.6 — NUNCA new Date()).
 */
@Injectable()
export class PlatformAuditInterceptor implements NestInterceptor {
  constructor(
    @Inject(PLATFORM_AUDIT_PORT) private readonly audit: PlatformAuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<{
      method: string;
      path: string;
      url: string;
      route?: { path?: string };
      tenantId?: string;
      body?: unknown;
      user?: {
        sub?: string;
        isSuperAdmin?: boolean;
        activeTenantId?: string;
      };
    }>();

    const user = req.user;
    if (user?.isSuperAdmin !== true) return next.handle();

    const method = req.method;
    const isMutacion = MUTATING_METHODS.has(method);

    // Para GETs, la decisión de auditar se difiere al tap (post-handler) porque
    // el controller puede poblar req.tenantId DENTRO del handler (antes de que el
    // interceptor capture el resultado). En ese momento req.tenantId ya está seteado.
    // Los métodos mutantes se auditan incondicionalmente para un SA.
    if (!isMutacion && method !== 'GET') return next.handle();

    return next.handle().pipe(
      tap(() => {
        const actorUserId = user.sub;
        if (!actorUserId) return;

        // Para GETs: re-evaluar isCrossTenantGet post-handler, cuando req.tenantId
        // ya fue poblado por el controller (patrón de listarMiembros y actualizarStatus).
        // Excluimos GETs sin tenantId (listado global org-less — sin valor en audit).
        if (method === 'GET') {
          const isCrossTenantGet =
            req.tenantId !== undefined && req.tenantId !== user.activeTenantId;
          if (!isCrossTenantGet) return;
        }

        const action = `${method} ${req.route?.path ?? req.url}`;
        const createdAt = this.clock.now();
        const payload = redactarSensibles(req.body);

        void this.audit.record({
          actorUserId,
          action,
          createdAt,
          ...(req.tenantId !== undefined ? { targetOrganizationId: req.tenantId } : {}),
          ...(Object.keys(payload).length > 0 ? { payload } : {}),
        });
      }),
    );
  }
}
