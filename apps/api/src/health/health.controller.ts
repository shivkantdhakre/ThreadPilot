import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { prisma } from '@threadpilot/database';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', prisma, { timeout: 15000 }),
    ]);
  }
}
