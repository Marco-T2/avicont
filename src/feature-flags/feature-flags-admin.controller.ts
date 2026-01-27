import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import { CreateFeatureFlagDto, UpdateFeatureFlagDto } from './dto/feature-flag.dto';

/**
 * Admin controller for managing global feature flags
 * Should be protected by admin-only middleware in production
 */
@Controller('admin/feature-flags')
export class FeatureFlagsAdminController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  /**
   * List all global feature flags
   */
  @Get()
  async listGlobal() {
    return this.featureFlagsService.listGlobal();
  }

  /**
   * Create a new global feature flag
   */
  @Post()
  async createGlobal(@Body() dto: CreateFeatureFlagDto) {
    return this.featureFlagsService.createGlobal(dto);
  }

  /**
   * Update a global feature flag
   */
  @Put(':key')
  async updateGlobal(@Param('key') key: string, @Body() dto: UpdateFeatureFlagDto) {
    return this.featureFlagsService.updateGlobal(key, dto);
  }

  /**
   * Toggle a global feature flag
   */
  @Post(':key/toggle')
  async toggleGlobal(@Param('key') key: string) {
    const enabled = await this.featureFlagsService.toggleGlobal(key);
    return { key, enabled };
  }

  /**
   * Delete a global feature flag
   */
  @Delete(':key')
  async deleteGlobal(@Param('key') key: string) {
    await this.featureFlagsService.deleteGlobal(key);
    return { success: true };
  }
}
