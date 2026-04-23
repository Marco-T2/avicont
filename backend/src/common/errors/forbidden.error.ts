import { DomainError } from './domain.error';

/** Autenticado pero sin permisos para la acción. HTTP 403. */
export class ForbiddenError extends DomainError {
  readonly httpStatus = 403;
}
