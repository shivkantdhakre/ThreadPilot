import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { prisma } from '@threadpilot/database';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { RefreshTokenService } from './refresh-token.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    workspaceId: string;
    workspaceName: string;
  };
  workspace?: WorkspaceInfo | undefined;
  workspaces?: WorkspaceInfo[] | undefined;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const { user, workspace } = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash,
        },
      });

      const workspaceName = dto.name || dto.workspaceName || 'Personal Workspace';
      const newWorkspace = await tx.workspace.create({
        data: {
          userId: newUser.id,
          name: workspaceName,
        },
      });

      await tx.userProfile.create({
        data: {
          workspaceId: newWorkspace.id,
          profileVersion: 1,
        },
      });

      await tx.userPreferences.create({
        data: {
          workspaceId: newWorkspace.id,
          preferredTimezone: 'UTC',
        },
      });

      return { user: newUser, workspace: newWorkspace };
    });

    const refreshToken = await this.refreshTokenService.createInitialToken(user.id);
    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id,
      email: user.email,
      workspaceId: workspace.id,
    });

    const wsInfo: WorkspaceInfo = {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      role: 'OWNER',
    };

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
      },
      workspace: wsInfo,
      workspaces: [wsInfo],
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        workspaces: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isValidPassword = await this.passwordService.verify(user.passwordHash, dto.password);
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid email or password');
    }

    let defaultWorkspace = user.workspaces[0];
    if (!defaultWorkspace) {
      defaultWorkspace = await prisma.workspace.create({
        data: {
          userId: user.id,
          name: 'Personal Workspace',
        },
      });
    }

    const refreshToken = await this.refreshTokenService.createInitialToken(user.id);
    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id,
      email: user.email,
      workspaceId: defaultWorkspace.id,
    });

    const wsList: WorkspaceInfo[] = user.workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      slug: w.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      role: 'OWNER',
    }));

    const finalWsList: WorkspaceInfo[] = wsList.length > 0 ? wsList : [{
      id: defaultWorkspace.id,
      name: defaultWorkspace.name,
      slug: defaultWorkspace.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      role: 'OWNER',
    }];

    const primaryWorkspace = finalWsList[0]!;

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        workspaceId: defaultWorkspace.id,
        workspaceName: defaultWorkspace.name,
      },
      workspace: primaryWorkspace,
      workspaces: finalWsList,
    };
  }

  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        workspaces: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const defaultWs = user.workspaces[0];
    const wsList: WorkspaceInfo[] = user.workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      slug: w.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      role: 'OWNER',
    }));

    return {
      user: {
        id: user.id,
        email: user.email,
        workspaceId: defaultWs?.id ?? '',
        workspaceName: defaultWs?.name ?? '',
        createdAt: user.createdAt.toISOString(),
      },
      workspace: wsList[0] ?? null,
      workspaces: wsList,
    };
  }

  async refresh(rawRefreshToken: string): Promise<{ accessToken: string; newRefreshToken: string }> {
    const { userId, newCompositeToken } = await this.refreshTokenService.rotateToken(rawRefreshToken);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        workspaces: {
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!user || !user.workspaces[0]) {
      throw new UnauthorizedException('User account or workspace not found');
    }

    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id,
      email: user.email,
      workspaceId: user.workspaces[0].id,
    });

    return {
      accessToken,
      newRefreshToken: newCompositeToken,
    };
  }

  async logout(rawRefreshToken?: string, userId?: string): Promise<void> {
    if (rawRefreshToken && rawRefreshToken.includes('.')) {
      const tokenId = rawRefreshToken.substring(0, rawRefreshToken.indexOf('.'));
      const token = await prisma.refreshToken.findUnique({ where: { id: tokenId } });
      if (token) {
        await this.refreshTokenService.revokeFamily(token.familyId);
        return;
      }
    }

    if (userId) {
      await this.refreshTokenService.revokeAllUserTokens(userId);
    }
  }
}
