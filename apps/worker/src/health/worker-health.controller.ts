import { Controller, Get } from '@nestjs/common';

/**
 * Worker health endpoint.
 * Checked by Docker Compose healthcheck and Phase 0 gate verification.
 * GET /healthz → { status: 'ok' }
 */
@Controller()
export class WorkerHealthController {
  @Get('healthz')
  healthz(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
