import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { RefreshTokenService } from './refresh-token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET', 'dev_secret_fallback_min_64_chars_long_key_development_only'),
        signOptions: {
          expiresIn: config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    RefreshTokenService,
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [AuthService, JwtAuthGuard, TokenService],
})
export class AuthModule {}
