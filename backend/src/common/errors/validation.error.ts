import { DomainError } from './domain.error';

/** Regla de negocio violada sobre el input del cliente. HTTP 400. */
export class ValidationError extends DomainError {
  readonly httpStatus = 400;
}
