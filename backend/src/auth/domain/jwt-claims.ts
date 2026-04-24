import { JwtClaimsInvalidosError } from './auth-errors';

/**
 * Payload tal como se firma en el JWT (CLAUDE.md §5.2).
 *
 * - `sub` / `email`: obligatorios siempre.
 * - `activeTenantId` / `roles`: presentes en tokens de usuarios regulares.
 * - `impersonatedBy` / `impersonationId`: presentes SOLO en tokens de
 *   impersonation emitidos por ImpersonationService.
 */
export interface JwtPayload {
  sub: string;
  email: string;
  activeTenantId?: string;
  roles?: string[];
  impersonatedBy?: string;
  impersonationId?: string;
}

/**
 * Factory centralizado para armar el payload de un access token de usuario
 * regular (no impersonation). Concentra la validación de claims y el manejo
 * de `exactOptionalPropertyTypes` en un único lugar.
 */
export class JwtClaims {
  private constructor(private readonly payload: JwtPayload) {}

  static forUser(params: {
    userId: string;
    email: string;
    activeTenantId?: string;
    roles?: string[];
  }): JwtClaims {
    if (typeof params.userId !== 'string' || params.userId.length === 0) {
      throw new JwtClaimsInvalidosError('userId requerido');
    }
    if (typeof params.email !== 'string' || params.email.length === 0) {
      throw new JwtClaimsInvalidosError('email requerido');
    }
    if (params.activeTenantId !== undefined && params.activeTenantId.length === 0) {
      throw new JwtClaimsInvalidosError('activeTenantId no puede ser string vacío');
    }

    const payload: JwtPayload = {
      sub: params.userId,
      email: params.email,
      roles: params.roles ?? [],
      ...(params.activeTenantId !== undefined
        ? { activeTenantId: params.activeTenantId }
        : {}),
    };
    return new JwtClaims(payload);
  }

  toPayload(): JwtPayload {
    return this.payload;
  }
}
