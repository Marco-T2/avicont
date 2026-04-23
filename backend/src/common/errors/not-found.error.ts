import { DomainError } from './domain.error';

/** Entidad no existe. HTTP 404. */
export class NotFoundError extends DomainError {
  readonly httpStatus = 404;
}
