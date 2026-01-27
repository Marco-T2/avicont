import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const Role = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const;

type RoleType = (typeof Role)[keyof typeof Role];

export class UpdateMembershipDto {
  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'MEMBER'], description: 'New role' })
  @IsEnum(Role)
  role!: RoleType;
}
