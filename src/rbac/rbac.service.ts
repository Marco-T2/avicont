import { Injectable } from '@nestjs/common';

const Role = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const;

type RoleType = (typeof Role)[keyof typeof Role];

export type Permission =
  | 'users.invite'
  | 'users.manage'
  | 'billing.read'
  | 'billing.manage'
  | 'tenant.update'
  | 'audit.read'
  | 'settings.read'
  | 'settings.write';

const ROLE_PERMISSIONS: Record<RoleType, Permission[]> = {
  [Role.OWNER]: [
    'users.invite',
    'users.manage',
    'billing.read',
    'billing.manage',
    'tenant.update',
    'audit.read',
    'settings.read',
    'settings.write',
  ],
  [Role.ADMIN]: ['users.invite', 'users.manage', 'billing.read', 'audit.read', 'settings.read'],
  [Role.MEMBER]: [],
};

@Injectable()
export class RbacService {
  getPermissionsForRole(role: RoleType): Permission[] {
    return ROLE_PERMISSIONS[role] ?? [];
  }

  getPermissionsForRoles(roles: RoleType[]): Permission[] {
    const permissions = new Set<Permission>();
    for (const role of roles) {
      for (const perm of this.getPermissionsForRole(role)) {
        permissions.add(perm);
      }
    }
    return Array.from(permissions);
  }

  hasPermission(roles: RoleType[], permission: Permission): boolean {
    return this.getPermissionsForRoles(roles).includes(permission);
  }

  hasAnyPermission(roles: RoleType[], permissions: Permission[]): boolean {
    const userPermissions = this.getPermissionsForRoles(roles);
    return permissions.some((p) => userPermissions.includes(p));
  }

  hasAllPermissions(roles: RoleType[], permissions: Permission[]): boolean {
    const userPermissions = this.getPermissionsForRoles(roles);
    return permissions.every((p) => userPermissions.includes(p));
  }
}
