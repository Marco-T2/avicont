import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const Role = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const;

type RoleType = (typeof Role)[keyof typeof Role];

export class InviteUserDto {
  @ApiProperty({ example: 'newuser@example.com', description: 'Email to invite' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({
    enum: ['OWNER', 'ADMIN', 'MEMBER'],
    default: 'MEMBER',
    description: 'Role to assign',
  })
  @IsOptional()
  @IsEnum(Role)
  role?: RoleType;
}
