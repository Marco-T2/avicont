export class AssignableRoleDto {
  id!: string; // system: 'ADMIN'|'OWNER'; custom: uuid
  name!: string; // 'Administrador'|'Propietario'|CustomRole.name
  kind!: 'system' | 'custom';
  description?: string;
}
