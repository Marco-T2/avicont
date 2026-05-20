import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ConflictError, NotFoundError, ValidationError } from '../errors';
import type { LoggerPort } from '../../logger/ports/logger.port';
import type { TracingPort } from '../../tracing/ports/tracing.port';

import { GlobalExceptionFilter } from './global-exception.filter';

// Shape del payload que escribe el filter — replicamos acá para tipar los asserts.
interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    traceId?: string;
    timestamp: string;
  };
}

function makeLoggerMock(): jest.Mocked<LoggerPort> & { _child: jest.Mocked<LoggerPort> } {
  const child: jest.Mocked<LoggerPort> = {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn(),
    forContext: jest.fn(),
    setLevel: jest.fn(),
  } as unknown as jest.Mocked<LoggerPort>;

  const root: jest.Mocked<LoggerPort> & { _child: jest.Mocked<LoggerPort> } = {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn().mockReturnValue(child),
    forContext: jest.fn(),
    setLevel: jest.fn(),
    _child: child,
  } as unknown as jest.Mocked<LoggerPort> & { _child: jest.Mocked<LoggerPort> };

  return root;
}

function makeTracingMock(traceId?: string): jest.Mocked<TracingPort> {
  return {
    startSpan: jest.fn(),
    startActiveSpan: jest.fn(),
    getActiveSpan: jest.fn(),
    getCurrentContext: jest
      .fn()
      .mockReturnValue(
        traceId !== undefined ? { traceId, spanId: 'span-1', traceFlags: 1 } : undefined,
      ),
    inject: jest.fn(),
    extract: jest.fn(),
    shutdown: jest.fn(),
  } as unknown as jest.Mocked<TracingPort>;
}

interface CaughtResponse {
  status: number;
  body: ErrorResponseBody;
}

function makeHost(): {
  host: ArgumentsHost;
  captured: CaughtResponse;
} {
  const captured: CaughtResponse = {
    status: 0,
    body: { error: { code: '', message: '', timestamp: '' } },
  };

  const response = {
    status: jest.fn().mockImplementation((s: number) => {
      captured.status = s;
      return {
        json: jest.fn().mockImplementation((b: ErrorResponseBody) => {
          captured.body = b;
        }),
      };
    }),
  };

  const request = { method: 'GET', path: '/api/test' };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, captured };
}

describe('GlobalExceptionFilter', () => {
  function makeFilter(traceId?: string): {
    filter: GlobalExceptionFilter;
    logger: ReturnType<typeof makeLoggerMock>;
    tracing: jest.Mocked<TracingPort>;
  } {
    const logger = makeLoggerMock();
    const tracing = makeTracingMock(traceId);
    const filter = new GlobalExceptionFilter(logger, tracing);
    return { filter, logger, tracing };
  }

  describe('DomainError', () => {
    it('mapea a httpStatus + code + message del error', () => {
      const { filter } = makeFilter();
      const { host, captured } = makeHost();

      filter.catch(new NotFoundError('ASIENTO_NO_ENCONTRADO', 'Asiento no existe'), host);

      expect(captured.status).toBe(404);
      expect(captured.body.error.code).toBe('ASIENTO_NO_ENCONTRADO');
      expect(captured.body.error.message).toBe('Asiento no existe');
      expect(captured.body.error.timestamp).toEqual(expect.any(String));
    });

    it('incluye details cuando el error los tiene', () => {
      const { filter } = makeFilter();
      const { host, captured } = makeHost();

      filter.catch(
        new ValidationError(
          'ASIENTO_PARTIDA_DOBLE_VIOLATED',
          'Los débitos deben igualar a los créditos',
          { totalDebito: '1000.00', totalCredito: '950.00' },
        ),
        host,
      );

      expect(captured.status).toBe(400);
      expect(captured.body.error.details).toEqual({
        totalDebito: '1000.00',
        totalCredito: '950.00',
      });
    });

    it('mapea ConflictError a 409', () => {
      const { filter } = makeFilter();
      const { host, captured } = makeHost();

      filter.catch(new ConflictError('GESTION_DUPLICADA', 'ya existe'), host);

      expect(captured.status).toBe(409);
      expect(captured.body.error.code).toBe('GESTION_DUPLICADA');
    });
  });

  describe('HttpException de NestJS (fallback para throws viejos)', () => {
    it('BadRequestException con string → code BAD_REQUEST', () => {
      const { filter } = makeFilter();
      const { host, captured } = makeHost();

      filter.catch(new BadRequestException('Email already in use'), host);

      expect(captured.status).toBe(400);
      expect(captured.body.error.code).toBe('BAD_REQUEST');
      expect(captured.body.error.message).toBe('Email already in use');
    });

    it('NotFoundException → code NOT_FOUND, status 404', () => {
      const { filter } = makeFilter();
      const { host, captured } = makeHost();

      filter.catch(new NotFoundException('User not found'), host);

      expect(captured.status).toBe(404);
      expect(captured.body.error.code).toBe('NOT_FOUND');
    });

    it('ForbiddenException → code FORBIDDEN, status 403', () => {
      const { filter } = makeFilter();
      const { host, captured } = makeHost();

      filter.catch(new ForbiddenException('Tenant required'), host);

      expect(captured.status).toBe(403);
      expect(captured.body.error.code).toBe('FORBIDDEN');
    });

    it('HttpException con array de mensajes (ValidationPipe) los junta y guarda en details', () => {
      const { filter } = makeFilter();
      const { host, captured } = makeHost();

      const validationResponse = {
        statusCode: 400,
        message: ['email must be an email', 'password too short'],
        error: 'Bad Request',
      };
      filter.catch(new HttpException(validationResponse, HttpStatus.BAD_REQUEST), host);

      expect(captured.status).toBe(400);
      expect(captured.body.error.message).toBe('email must be an email; password too short');
      expect(captured.body.error.details).toEqual({
        validationErrors: ['email must be an email', 'password too short'],
      });
    });

    it('HttpException con { code, message, details } preserva el code del dominio (compat para throws viejos)', () => {
      const { filter } = makeFilter();
      const { host, captured } = makeHost();

      filter.catch(
        new BadRequestException({
          code: 'CUENTA_PADRE_INVALIDA',
          message: 'La cuenta padre no existe en este tenant',
          details: { parentId: 'abc-123' },
        }),
        host,
      );

      expect(captured.status).toBe(400);
      expect(captured.body.error.code).toBe('CUENTA_PADRE_INVALIDA');
      expect(captured.body.error.message).toBe('La cuenta padre no existe en este tenant');
      expect(captured.body.error.details).toEqual({ parentId: 'abc-123' });
    });

    it('HttpException con status no mapeado → code HTTP_ERROR', () => {
      const { filter } = makeFilter();
      const { host, captured } = makeHost();

      filter.catch(new HttpException('teapot', HttpStatus.I_AM_A_TEAPOT), host);

      expect(captured.status).toBe(418);
      expect(captured.body.error.code).toBe('HTTP_ERROR');
    });
  });

  describe('PrismaClientKnownRequestError', () => {
    it('P2002 (unique constraint) → 409 CONFLICT con fields en details', () => {
      const { filter } = makeFilter();
      const { host, captured } = makeHost();

      const err = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
        meta: { target: ['email'] },
      });
      filter.catch(err, host);

      expect(captured.status).toBe(409);
      expect(captured.body.error.code).toBe('CONFLICT');
      expect(captured.body.error.details).toEqual({ fields: ['email'] });
    });

    it('P2025 (record not found) → 404 NOT_FOUND', () => {
      const { filter } = makeFilter();
      const { host, captured } = makeHost();

      const err = new Prisma.PrismaClientKnownRequestError('nf', {
        code: 'P2025',
        clientVersion: 'x',
      });
      filter.catch(err, host);

      expect(captured.status).toBe(404);
      expect(captured.body.error.code).toBe('NOT_FOUND');
    });

    it('código Prisma desconocido → 500 DATABASE_ERROR', () => {
      const { filter, logger } = makeFilter();
      const { host, captured } = makeHost();

      const err = new Prisma.PrismaClientKnownRequestError('oops', {
        code: 'P9999',
        clientVersion: 'x',
      });
      filter.catch(err, host);

      expect(captured.status).toBe(500);
      expect(captured.body.error.code).toBe('DATABASE_ERROR');
      expect(logger._child.error).toHaveBeenCalled();
    });
  });

  describe('fallback — Error genérico', () => {
    it('devuelve 500 INTERNAL_ERROR sin exponer stack ni mensaje interno', () => {
      const { filter, logger } = makeFilter();
      const { host, captured } = makeHost();

      filter.catch(new Error('secret internals: db password=xxx'), host);

      expect(captured.status).toBe(500);
      expect(captured.body.error.code).toBe('INTERNAL_ERROR');
      // Mensaje genérico, no el error original
      expect(captured.body.error.message).not.toContain('secret');
      expect(captured.body.error.message).not.toContain('password');
      // Stack al logger
      expect(logger._child.error).toHaveBeenCalled();
    });

    it('valor no-Error (string, número, null) → 500 INTERNAL_ERROR', () => {
      const { filter } = makeFilter();
      const { host, captured } = makeHost();

      filter.catch('just a string', host);

      expect(captured.status).toBe(500);
      expect(captured.body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('traceId de OpenTelemetry', () => {
    it('incluye traceId cuando el tracing lo provee', () => {
      const { filter } = makeFilter('trace-abc-123');
      const { host, captured } = makeHost();

      filter.catch(new ValidationError('TEST_CODE', 'test message'), host);

      expect(captured.body.error.traceId).toBe('trace-abc-123');
    });

    it('omite traceId cuando el tracing no está activo', () => {
      const { filter } = makeFilter();
      const { host, captured } = makeHost();

      filter.catch(new ValidationError('TEST_CODE', 'test message'), host);

      expect(captured.body.error.traceId).toBeUndefined();
    });
  });

  describe('logging', () => {
    it('4xx se loguea a nivel debug (no spamea error log)', () => {
      const { filter, logger } = makeFilter();
      const { host } = makeHost();

      filter.catch(new NotFoundError('TEST_NF', 'not found'), host);

      expect(logger._child.debug).toHaveBeenCalled();
      expect(logger._child.error).not.toHaveBeenCalled();
    });

    it('5xx se loguea a nivel error con el exception original', () => {
      const { filter, logger } = makeFilter();
      const { host } = makeHost();

      const err = new Error('oops');
      filter.catch(err, host);

      expect(logger._child.error).toHaveBeenCalled();
      expect(logger._child.debug).not.toHaveBeenCalled();
    });
  });
});
