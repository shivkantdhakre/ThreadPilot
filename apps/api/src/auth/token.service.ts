import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  workspaceId: string;
}

@Injectable()
export class TokenService {
  private readonly accessSecret: string;
  private readonly accessExpiresIn: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {
    this.accessSecret = this.config.get<string>('JWT_ACCESS_SECRET', 'dev_secret_fallback_min_64_chars_long_key_development_only');
    this.accessExpiresIn = this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');
  }

  generateAccessToken(payload: AccessTokenPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessExpiresIn as any,
    });
  }

  generateRawRefreshToken(): string {
    return crypto.randomBytes(48).toString('base64url');
  }
}
