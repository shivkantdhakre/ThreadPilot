import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { createLogger } from '@threadpilot/observability';

const logger = createLogger({ service: 'GlobalExceptionFilter' });

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (exceptionResponse && typeof exceptionResponse === 'object') {
      const resp = exceptionResponse as Record<string, unknown>;
      message = (resp['message'] as string | string[]) ?? message;
      error = (resp['error'] as string) ?? error;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (status >= 500) {
      logger.error(
        {
          err: exception,
          path: request.url,
          method: request.method,
          status,
        },
        'Unhandled server exception',
      );
    } else {
      logger.warn(
        {
          path: request.url,
          method: request.method,
          status,
          message,
        },
        'Client HTTP exception',
      );
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
