import { DomainError } from './domain.error';

/** Falla en servicio externo (SIN, BCB, mailer, etc.). HTTP 502. */
export class ExternalServiceError extends DomainError {
  readonly httpStatus = 502;
}
