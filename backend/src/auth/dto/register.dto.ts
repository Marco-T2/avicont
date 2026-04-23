import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'securePassword123',
    minLength: 8,
    description: 'Password (min 8 chars)',
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ example: 'John Doe', description: 'Display name' })
  @IsOptional()
  @IsString()
  displayName?: string;
}
