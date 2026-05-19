import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/**
 * Global exception filter that catches Prisma errors and returns
 * meaningful HTTP responses instead of generic 500s.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : (res as any).message || exception.message;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = 'Un enregistrement avec ces données existe déjà';
          break;
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          message = 'Référence invalide — l\'entité liée n\'existe pas';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Enregistrement introuvable';
          break;
        case 'P2014':
          status = HttpStatus.BAD_REQUEST;
          message = 'La modification violerait une contrainte de relation';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          message = `Erreur base de données (${exception.code})`;
      }
      this.logger.error(`Prisma ${exception.code}: ${exception.message}`, { meta: exception.meta });
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      // Include a trimmed version of the validation message to help frontend display root cause
      const detail = exception.message?.split('\n').find(l => l.trim().startsWith('Argument')) || '';
      message = detail
        ? `Données invalides : ${detail.trim()}`
        : 'Données invalides envoyées à la base de données';
      this.logger.error('Prisma validation error:', exception.message);
    } else if (exception instanceof Prisma.PrismaClientInitializationError) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = 'Service temporairement indisponible — réessayez dans quelques secondes';
      this.logger.error('Prisma init error:', exception.message);
    } else {
      this.logger.error(
        `Unhandled exception on ${request?.method} ${request?.url}:`,
        exception instanceof Error ? exception.stack : exception,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request?.url,
    });
  }
}
