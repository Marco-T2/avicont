// Tipos DTO espejados a mano del backend (Opción 1A según CLAUDE.md §10.10).
// Migraremos a openapi-typescript cuando haya 4-5 features consumiendo la API.
// Mantener en sincronía manual con backend/src/**/dto/*.ts.

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  // refreshToken va en cookie httpOnly, NO en el body.
  accessToken: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
}

export interface RegisterResponse {
  id: string;
  email: string;
}

// Decodificación del JWT access token (ver backend/src/auth/auth.service.ts).
// NOTA: el frontend NO valida la firma — solo usa los claims para UX.
// La validación real la hace el backend en cada request.
export interface JwtPayload {
  sub: string;
  email: string;
  activeTenantId?: string;
  roles?: string[];
  impersonatedBy?: string;
  impersonationId?: string;
  iat: number;
  exp: number;
}
