import { ImpersonationJwtClaimsInvalidosError } from './impersonation-errors';

/**
 * Payload del access token DURANTE una sesión de impersonation (CLAUDE.md §5.6).
 *
 * Es distinto del `JwtPayload` genérico de auth porque acá los claims de
 * impersonation (`impersonatedBy` / `impersonationId`) son OBLIGATORIOS, no
 * opcionales. Esto evita que alguien emita un token "de impersonation" sin
 * los claims que lo distinguen.
 */
export interface ImpersonationJwtPayload {
  sub: string;
  email: string;
  activeTenantId: string;
  roles: string[];
  impersonatedBy: string;
  impersonationId: string;
}

/**
 * Factory centralizado para armar el payload JWT de impersonation. Concentra
 * la validación en un único lugar: si cualquier claim viene vacío, el token
 * no se emite.
 */
export class ImpersonationJwtClaims {
  private constructor(private readonly payload: ImpersonationJwtPayload) {}

  static forImpersonation(params: {
    targetUserId: string;
    targetEmail: string;
    activeTenantId: string;
    roles: string[];
    adminUserId: string;
    impersonationId: string;
  }): ImpersonationJwtClaims {
    assertNonEmpty('targetUserId', params.targetUserId);
    assertNonEmpty('targetEmail', params.targetEmail);
    assertNonEmpty('activeTenantId', params.activeTenantId);
    assertNonEmpty('adminUserId', params.adminUserId);
    assertNonEmpty('impersonationId', params.impersonationId);
    if (!Array.isArray(params.roles)) {
      throw new ImpersonationJwtClaimsInvalidosError('roles debe ser un array');
    }

    const payload: ImpersonationJwtPayload = {
      sub: params.targetUserId,
      email: params.targetEmail,
      activeTenantId: params.activeTenantId,
      roles: [...params.roles],
      impersonatedBy: params.adminUserId,
      impersonationId: params.impersonationId,
    };
    return new ImpersonationJwtClaims(payload);
  }

  toPayload(): ImpersonationJwtPayload {
    return this.payload;
  }
}

function assertNonEmpty(field: string, value: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ImpersonationJwtClaimsInvalidosError(`${field} requerido`);
  }
}
