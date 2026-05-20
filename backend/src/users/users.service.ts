import { Inject, Injectable } from '@nestjs/common';

import {
  MEMBERSHIPS_READER_PORT,
  type MembershipsReaderPort,
} from '../memberships/ports/memberships-reader.port';

import { UpdateUserDto } from './dto/update-user.dto';
import { toUserResponseDto, type UserResponseDto } from './dto/user-response.dto';
import { USER_REPOSITORY_PORT, type UserRepositoryPort } from './ports/user.repository.port';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY_PORT)
    private readonly repo: UserRepositoryPort,
    @Inject(MEMBERSHIPS_READER_PORT)
    private readonly memberships: MembershipsReaderPort,
  ) {}

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.repo.update(id, dto);
    return toUserResponseDto(user);
  }

  async getProfile(userId: string) {
    const user = await this.repo.findById(userId);
    if (!user) return null;

    const memberships = await this.memberships.findActivasConOrganizacionByUserId(userId);

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      isEmailVerified: user.isEmailVerified,
      tenants: memberships.map((m) => ({
        id: m.organizationId,
        name: m.organizationName,
        slug: m.organizationSlug,
        // Rol efectivo: systemRole si lo tiene (OWNER/ADMIN),
        // si no el slug del CustomRole asignado.
        role: m.systemRole ?? m.customRoleSlug,
      })),
    };
  }
}
