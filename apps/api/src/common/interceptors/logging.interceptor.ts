import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { createLogger } from '@threadpilot/observability';

const logger = createLogger({ service: 'HttpLoggingInterceptor' });

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, ip } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse<Response>();
        const duration = Date.now() - startTime;
        logger.info(
          {
            method,
            url,
            statusCode: response.statusCode,
            durationMs: duration,
            ip,
          },
          `${method} ${url} ${response.statusCode} - ${duration}ms`,
        );
      }),
    );
  }
}
