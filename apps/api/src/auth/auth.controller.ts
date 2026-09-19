import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  private readonly cookieName: string;
  private readonly isProduction: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {
    this.cookieName = this.config.get<string>('JWT_REFRESH_COOKIE_NAME', 'tp_rt');
    this.isProduction = this.config.get<string>('NODE_ENV') === 'production';
  }

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    this.setRefreshTokenCookie(res, result.refreshToken);

    return {
      accessToken: result.accessToken,
      user: result.user,
      workspace: result.workspace,
      workspaces: result.workspaces,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    this.setRefreshTokenCookie(res, result.refreshToken);

    return {
      accessToken: result.accessToken,
      user: result.user,
      workspace: result.workspace,
      workspaces: result.workspaces,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      req.cookies?.[this.cookieName] ??
      (req.headers['x-refresh-token'] as string | undefined);

    if (!token) {
      throw new UnauthorizedException('Refresh token missing in request cookies or headers');
    }

    const { accessToken, newRefreshToken } = await this.authService.refresh(token);
    this.setRefreshTokenCookie(res, newRefreshToken);

    return { accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[this.cookieName];
    await this.authService.logout(token);
    this.clearRefreshTokenCookie(res);

    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.userId ?? user.id!);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me')
  @HttpCode(HttpStatus.OK)
  async postMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.userId ?? user.id!);
  }

  private setRefreshTokenCookie(res: Response, token: string): void {
    res.cookie(this.cookieName, token, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  }

  private clearRefreshTokenCookie(res: Response): void {
    res.clearCookie(this.cookieName, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      path: '/',
    });
  }
}
