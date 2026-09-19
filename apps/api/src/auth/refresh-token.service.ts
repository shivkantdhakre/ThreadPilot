import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@threadpilot/database';
import { createLogger } from '@threadpilot/observability';
import crypto from 'crypto';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

const logger = createLogger({ service: 'RefreshTokenService' });
const REFRESH_TTL_DAYS = 30;

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Creates a new refresh token family for a freshly logged-in user.
   * Returns composite token: `${tokenId}.${rawSecret}`.
   */
  async createInitialToken(userId: string): Promise<string> {
    const familyId = crypto.randomUUID();
    return this.issueTokenInFamily(userId, familyId);
  }

  /**
   * Rotates a refresh token:
   * 1. Validates token format: `${tokenId}.${rawSecret}`
   * 2. Fetches token record from DB
   * 3. Verifies secret hash
   * 4. Checks revocation & expiration
   * 5. Checks reuse detection: if usedAt is already set -> REVOKE ALL TOKENS IN FAMILY -> 401
   * 6. Issues replacement token in same family, marks old token as used
   */
  async rotateToken(rawCompositeToken: string): Promise<{ userId: string; newCompositeToken: string }> {
    const dotIndex = rawCompositeToken.indexOf('.');
    if (dotIndex === -1) {
      throw new UnauthorizedException('Invalid refresh token format');
    }

    const tokenId = rawCompositeToken.substring(0, dotIndex);
    const rawSecret = rawCompositeToken.substring(dotIndex + 1);

    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { id: tokenId },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('Refresh token not recognized');
    }

    // Cryptographic verification
    const isValidSecret = await this.passwordService.verify(tokenRecord.tokenHash, rawSecret);
    if (!isValidSecret) {
      throw new UnauthorizedException('Invalid refresh token signature');
    }

    // Reuse detection
    if (tokenRecord.revokedAt) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (tokenRecord.usedAt) {
      logger.warn(
        { userId: tokenRecord.userId, familyId: tokenRecord.familyId, tokenId },
        'REUSE DETECTION TRIGGERED: Stale refresh token presented. Revoking entire token family.',
      );

      // Invalidate the entire token family
      await prisma.refreshToken.updateMany({
        where: { familyId: tokenRecord.familyId },
        data: { revokedAt: new Date() },
      });

      throw new UnauthorizedException('Refresh token reuse detected. Access revoked.');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Issue successor token in the same family atomically
    const newCompositeToken = await prisma.$transaction(async (tx) => {
      const rawNewSecret = this.tokenService.generateRawRefreshToken();
      const newSecretHash = await this.passwordService.hash(rawNewSecret);
      const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

      const successor = await tx.refreshToken.create({
        data: {
          userId: tokenRecord.userId,
          familyId: tokenRecord.familyId,
          tokenHash: newSecretHash,
          expiresAt,
        },
      });

      await tx.refreshToken.update({
        where: { id: tokenRecord.id },
        data: {
          usedAt: new Date(),
          replacedById: successor.id,
        },
      });

      return `${successor.id}.${rawNewSecret}`;
    });

    return {
      userId: tokenRecord.userId,
      newCompositeToken,
    };
  }

  async revokeFamily(familyId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { familyId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokenInFamily(userId: string, familyId: string): Promise<string> {
    const rawSecret = this.tokenService.generateRawRefreshToken();
    const tokenHash = await this.passwordService.hash(rawSecret);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

    const token = await prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash,
        expiresAt,
      },
    });

    return `${token.id}.${rawSecret}`;
  }
}
