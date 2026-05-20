import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { LOGGER_PORT, LoggerPort } from '../../logger/ports/logger.port';
import { TRACING_PORT, TracingPort } from '../../tracing/ports/tracing.port';
import { DomainError } from '../errors';

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    traceId?: string;
    timestamp: string;
  };
}

interface MappedException {
  httpStatus: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Tabla de códigos de error inferidos del status de HttpException de NestJS.
// Usada para que los throws viejos que usan BadRequestException / NotFoundException
// aparezcan al cliente con el formato estándar sin refactor obligatorio.
// Ver CLAUDE.md §6.5 y deuda técnica anotada.
const HTTP_STATUS_TO_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'METHOD_NOT_ALLOWED',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.GONE]: 'GONE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.BAD_GATEWAY]: 'BAD_GATEWAY',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger: LoggerPort;

  constructor(
    @Inject(LOGGER_PORT) logger: LoggerPort,
    @Inject(TRACING_PORT) private readonly tracing: TracingPort,
  ) {
    this.logger = logger.child({ module: 'GlobalExceptionFilter' });
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const mapped = this.mapException(exception);
    const traceId = this.tracing.getCurrentContext()?.traceId;

    const body: ErrorResponseBody = {
      error: {
        code: mapped.code,
        message: mapped.message,
        ...(mapped.details !== undefined ? { details: mapped.details } : {}),
        ...(traceId !== undefined ? { traceId } : {}),
        timestamp: new Date().toISOString(),
      },
    };

    // 5xx = error del servidor (probablemente bug); logueamos stack completo.
    // 4xx = cliente se equivocó; info level, sin stack para no spamear.
    if (mapped.httpStatus >= 500) {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.path}`,
        { code: mapped.code, httpStatus: mapped.httpStatus, path: request.path },
        exception instanceof Error ? exception : new Error(String(exception)),
      );
    } else {
      this.logger.debug(`Handled ${mapped.code} on ${request.method} ${request.path}`, {
        code: mapped.code,
        httpStatus: mapped.httpStatus,
        path: request.path,
      });
    }

    response.status(mapped.httpStatus).json(body);
  }

  private mapException(exception: unknown): MappedException {
    if (exception instanceof DomainError) {
      return {
        httpStatus: exception.httpStatus,
        code: exception.code,
        message: exception.message,
        ...(exception.details !== undefined ? { details: exception.details } : {}),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.mapPrismaError(exception);
    }

    if (exception instanceof HttpException) {
      return this.mapHttpException(exception);
    }

    // Fallback: cualquier Error desconocido = 500 con mensaje genérico.
    // El stack trace se loguea pero NO se expone al cliente.
    return {
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado. Reintentá en unos segundos.',
    };
  }

  private mapHttpException(exception: HttpException): MappedException {
    const status = exception.getStatus();
    const response = exception.getResponse();

    // HttpException puede llevar la carga como:
    // - string: mensaje crudo → `new BadRequestException('msg')`.
    // - objeto { message: string | string[], ... }: por ValidationPipe o construcción manual.
    // - objeto { code, message, details }: patrón ya presente en cuentas /
    //   configuracion-contable que preserva el code estable del dominio
    //   aún sin migrar a DomainError (ver deuda técnica en CLAUDE.md §6.3).
    let message: string;
    let code: string | undefined;
    let details: Record<string, unknown> | undefined;

    if (typeof response === 'string') {
      message = response;
    } else if (typeof response === 'object' && response !== null) {
      const resObj = response as {
        message?: string | string[];
        code?: string;
        details?: Record<string, unknown>;
        error?: string;
      };

      if (typeof resObj.code === 'string') {
        code = resObj.code;
      }

      if (Array.isArray(resObj.message)) {
        // ValidationPipe devuelve array de mensajes; armamos string + guardamos todos en details
        message = resObj.message.join('; ');
        details = { validationErrors: resObj.message };
      } else if (typeof resObj.message === 'string') {
        message = resObj.message;
      } else {
        message = exception.message;
      }

      if (
        resObj.details !== undefined &&
        typeof resObj.details === 'object' &&
        resObj.details !== null
      ) {
        details = { ...(details ?? {}), ...resObj.details };
      }
    } else {
      message = exception.message;
    }

    return {
      httpStatus: status,
      code: code ?? HTTP_STATUS_TO_CODE[status] ?? 'HTTP_ERROR',
      message,
      ...(details !== undefined ? { details } : {}),
    };
  }

  // Códigos de Prisma relevantes:
  // P2002: unique constraint violation → Conflict
  // P2025: record not found → NotFound
  // P2003: FK constraint violation → BadRequest
  // P2000: value too long → BadRequest
  // Otros → 500 (bug interno)
  private mapPrismaError(exception: Prisma.PrismaClientKnownRequestError): MappedException {
    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta as { target?: string[] } | undefined)?.target;
        return {
          httpStatus: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'El recurso ya existe o viola una restricción de unicidad.',
          ...(target !== undefined ? { details: { fields: target } } : {}),
        };
      }
      case 'P2025':
        return {
          httpStatus: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'El recurso solicitado no existe.',
        };
      case 'P2003': {
        const field = (exception.meta as { field_name?: string } | undefined)?.field_name;
        return {
          httpStatus: HttpStatus.BAD_REQUEST,
          code: 'FK_CONSTRAINT_VIOLATION',
          message: 'La referencia a otro recurso no es válida.',
          ...(field !== undefined ? { details: { field } } : {}),
        };
      }
      default:
        return {
          httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
          code: 'DATABASE_ERROR',
          message: 'Ocurrió un error inesperado al acceder a la base de datos.',
        };
    }
  }
}
