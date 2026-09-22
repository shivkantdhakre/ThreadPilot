import {
  Controller,
  Get,
  Post,
  All,
  Query,
  Body,
  UseGuards,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { ThreadsAuthService } from './threads-auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceScopeGuard } from '../common/guards/workspace-scope.guard';
import { WorkspaceId } from '../common/decorators/workspace.decorator';

@Controller('threads-auth')
export class ThreadsAuthController {
  private readonly appPublicUrl: string;

  constructor(
    private readonly threadsAuthService: ThreadsAuthService,
    private readonly config: ConfigService,
  ) {
    this.appPublicUrl = this.config.get<string>('APP_PUBLIC_URL', 'http://localhost:3000');
  }

  @Get('connect')
  @UseGuards(JwtAuthGuard, WorkspaceScopeGuard)
  async connect(@WorkspaceId() workspaceId: string) {
    return this.threadsAuthService.initiate(workspaceId);
  }

  @Post('connect')
  @UseGuards(JwtAuthGuard, WorkspaceScopeGuard)
  async connectPost(@WorkspaceId() workspaceId: string) {
    return this.threadsAuthService.initiate(workspaceId);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    try {
      const result = await this.threadsAuthService.handleCallback(code, state);

      // Redirect user back to web app callback page
      const redirectUrl = new URL('/callback/threads', this.appPublicUrl);
      redirectUrl.searchParams.set('socialAccountId', result.socialAccountId);
      redirectUrl.searchParams.set('username', result.username);

      return res.redirect(redirectUrl.toString());
    } catch (err: any) {
      // If code/state was already consumed (e.g. browser refresh or back button navigation),
      // redirect gracefully back to the web app's connect page instead of displaying raw JSON error.
      const redirectUrl = new URL('/connect', this.appPublicUrl);
      redirectUrl.searchParams.set('authStatus', 'completed');
      return res.redirect(redirectUrl.toString());
    }
  }

  @Post('callback')
  async callbackPost(@Res() res: Response) {
    return res.status(200).json({ status: 'ok' });
  }

  @All('deauthorize')
  @All('uninstall')
  async deauthorize(@Res() res: Response) {
    return res.status(200).json({ status: 'ok' });
  }

  @All('delete')
  async deleteData(@Res() res: Response) {
    return res.status(200).json({
      url: `${this.appPublicUrl}/data-deletion-status`,
      confirmation_code: 'del_' + Date.now(),
    });
  }

  @Post('disconnect')
  @UseGuards(JwtAuthGuard, WorkspaceScopeGuard)
  async disconnect(
    @WorkspaceId() workspaceId: string,
    @Body('socialAccountId') socialAccountId: string,
  ) {
    return this.threadsAuthService.disconnect(workspaceId, socialAccountId);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard, WorkspaceScopeGuard)
  async getStatus(@WorkspaceId() workspaceId: string) {
    return this.threadsAuthService.getStatus(workspaceId);
  }
}
