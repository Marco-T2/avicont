import { DomainError } from './domain.error';

/** Conflicto de estado: duplicado, concurrencia, recurso ya en estado incompatible. HTTP 409. */
export class ConflictError extends DomainError {
  readonly httpStatus = 409;
}
