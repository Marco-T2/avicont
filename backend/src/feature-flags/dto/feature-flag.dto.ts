import { IsString, IsBoolean, IsOptional, IsObject, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFeatureFlagDto {
  @ApiProperty({
    example: 'new_dashboard',
    pattern: '^[a-z][a-z0-9_]*$',
    description: 'Unique flag key',
  })
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      'Key must be lowercase, start with a letter, and contain only letters, numbers, and underscores',
  })
  key!: string;

  @ApiProperty({ example: 'New Dashboard', maxLength: 200, description: 'Human-readable name' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Enable the new dashboard experience', maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ default: false, description: 'Whether the flag is enabled' })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ example: { rollout_percentage: 50 }, description: 'Additional metadata' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class UpdateFeatureFlagDto {
  @ApiPropertyOptional({ example: 'New Dashboard V2', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description', maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Whether the flag is enabled' })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class FeatureFlagResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  key!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiProperty()
  enabled!: boolean;

  @ApiPropertyOptional({ format: 'uuid' })
  tenantId?: string | null;

  @ApiPropertyOptional()
  metadata?: Record<string, unknown> | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
