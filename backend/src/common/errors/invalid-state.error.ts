import { DomainError } from './domain.error';

/** Transición de estado inválida (ej. intentar contabilizar un BORRADOR sin líneas). HTTP 422. */
export class InvalidStateError extends DomainError {
  readonly httpStatus = 422;
}
