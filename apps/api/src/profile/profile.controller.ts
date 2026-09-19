import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceScopeGuard } from '../common/guards/workspace-scope.guard';
import { WorkspaceId } from '../common/decorators/workspace.decorator';
import { ProfileService } from './profile.service';
import {
  UpdateProfileDto,
  UserPreferencesDto,
  UserProfileDto,
  StyleExampleDto,
  StyleProfileSnapshotDto,
} from '@threadpilot/types';

@Controller('profile')
@UseGuards(JwtAuthGuard, WorkspaceScopeGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  async getProfile(@WorkspaceId() workspaceId: string): Promise<UserProfileDto> {
    return this.profileService.getProfile(workspaceId);
  }

  @Patch()
  async updateProfile(
    @WorkspaceId() workspaceId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileDto> {
    return this.profileService.updateProfile(workspaceId, dto);
  }

  @Get('preferences')
  async getPreferences(@WorkspaceId() workspaceId: string) {
    return this.profileService.getPreferences(workspaceId);
  }

  @Patch('preferences')
  async updatePreferences(
    @WorkspaceId() workspaceId: string,
    @Body() dto: Partial<UserPreferencesDto>,
  ) {
    return this.profileService.updatePreferences(workspaceId, dto);
  }

  @Post('extract-style')
  async extractStyle(
    @WorkspaceId() workspaceId: string,
    @Body() body: { socialAccountId?: string; sampleSize?: number },
  ) {
    return this.profileService.extractStyle(workspaceId, body.socialAccountId, body.sampleSize);
  }

  @Get('style')
  async getStyle(@WorkspaceId() workspaceId: string): Promise<StyleExampleDto[]> {
    return this.profileService.getStyleExamples(workspaceId);
  }

  @Get('style/examples')
  async getStyleExamples(@WorkspaceId() workspaceId: string): Promise<StyleExampleDto[]> {
    return this.profileService.getStyleExamples(workspaceId);
  }

  @Patch('style/examples/:id/rating')
  async rateStyleExample(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body('rating') rating: number,
  ): Promise<StyleExampleDto> {
    return this.profileService.rateStyleExample(workspaceId, id, rating);
  }

  @Get('style/snapshots')
  async getSnapshots(@WorkspaceId() workspaceId: string): Promise<StyleProfileSnapshotDto[]> {
    return this.profileService.getSnapshots(workspaceId);
  }
}
