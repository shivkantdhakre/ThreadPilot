import { Controller, Get } from '@nestjs/common';

@Controller('version')
export class VersionController {
  @Get()
  getVersion() {
    return {
      version: '1.0.0',
      commitSha:
        process.env['RENDER_GIT_COMMIT'] ||
        process.env['VERCEL_GIT_COMMIT_SHA'] ||
        process.env['GIT_COMMIT_SHA'] ||
        '3bba917',
      buildTimestamp: process.env['BUILD_TIMESTAMP'] || new Date().toISOString(),
      environment: process.env['NODE_ENV'] || 'development',
    };
  }
}
