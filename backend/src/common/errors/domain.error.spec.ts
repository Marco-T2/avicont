import {
  ConflictError,
  DomainError,
  ExternalServiceError,
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from './index';

describe('DomainError — jerarquía base', () => {
  it('expone code, message y httpStatus según subclase', () => {
    const err = new NotFoundError('USER_NOT_FOUND', 'Usuario no existe');
    expect(err.code).toBe('USER_NOT_FOUND');
    expect(err.message).toBe('Usuario no existe');
    expect(err.httpStatus).toBe(404);
    expect(err.name).toBe('NotFoundError');
  });

  it('acepta details opcionales', () => {
    const err = new ValidationError('AMOUNT_INVALID', 'Monto inválido', {
      monto: '-100',
      limite: '0',
    });
    expect(err.details).toEqual({ monto: '-100', limite: '0' });
  });

  it('sin details → propiedad no aparece (undefined)', () => {
    const err = new ValidationError('CODE', 'msg');
    expect(err.details).toBeUndefined();
  });

  it('instanceof funciona con DomainError y con la subclase específica', () => {
    const err = new ConflictError('DUP', 'duplicado');
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err).toBeInstanceOf(Error);
  });

  it.each([
    [NotFoundError, 404],
    [ValidationError, 400],
    [ConflictError, 409],
    [UnauthorizedError, 401],
    [ForbiddenError, 403],
    [InvalidStateError, 422],
    [ExternalServiceError, 502],
  ])('%p tiene httpStatus %i', (ErrorCtor, expectedStatus) => {
    const err = new ErrorCtor('TEST', 'test');
    expect(err.httpStatus).toBe(expectedStatus);
  });

  it('stack trace se preserva (puede ser logueado)', () => {
    const err = new NotFoundError('X', 'y');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('NotFoundError');
  });
});
