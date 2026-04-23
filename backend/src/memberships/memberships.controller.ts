import { Controller, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { MembershipsService } from './memberships.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';

@ApiTags('Memberships')
@ApiBearerAuth('JWT-auth')
@ApiSecurity('X-Tenant-ID')
@Controller('memberships')
@UseGuards(JwtAuthGuard, TenantGuard)
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Post('invite')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('users.invite')
  @ApiOperation({ summary: 'Invite a user to the current tenant' })
  @ApiResponse({ status: 201, description: 'Invitation created' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 409, description: 'User already a member' })
  async invite(@Body() dto: InviteUserDto) {
    return this.membershipsService.invite(dto);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Update a member role' })
  @ApiResponse({ status: 200, description: 'Membership updated' })
  @ApiResponse({ status: 403, description: 'Cannot change owner role' })
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateMembershipDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.membershipsService.updateRole(id, dto, user.sub);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Remove a member from the tenant' })
  @ApiResponse({ status: 200, description: 'Member removed' })
  @ApiResponse({ status: 403, description: 'Cannot remove owner' })
  async remove(@Param('id') id: string, @CurrentUser() user: { sub: string }) {
    return this.membershipsService.remove(id, user.sub);
  }

  @Delete('leave')
  @ApiOperation({ summary: 'Leave the current tenant' })
  @ApiResponse({ status: 200, description: 'Left tenant successfully' })
  @ApiResponse({ status: 403, description: 'Owner cannot leave' })
  async leave(@CurrentTenant() tenantId: string, @CurrentUser() user: { sub: string }) {
    return this.membershipsService.leave(tenantId, user.sub);
  }
}
