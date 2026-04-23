import { DomainError } from './domain.error';

/** No autenticado. HTTP 401. */
export class UnauthorizedError extends DomainError {
  readonly httpStatus = 401;
}
