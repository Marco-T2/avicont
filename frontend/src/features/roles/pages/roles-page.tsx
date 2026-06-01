import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { PermissionButton } from '@/components/shared/permission-button';
import { PERMISSIONS } from '@/lib/permissions';

import { RoleFormDialog } from '../components/role-form-dialog';
import { RolesList } from '../components/roles-list';
import { useRoles } from '../hooks/use-roles';

// /settings/roles — admin de roles personalizados del tenant activo.
// Los roles de sistema (OWNER/ADMIN) no se listan acá: son inmutables y se
// asignan desde /settings/members.
export function RolesPage(): React.JSX.Element {
  const [createOpen, setCreateOpen] = useState(false);
  const rolesQuery = useRoles();

  if (rolesQuery.isError) {
    toast.error('No se pudieron cargar los roles');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Roles personalizados</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Creá perfiles de permisos específicos para tu organización (por
            ejemplo: "Contador Junior", "Auditor externo").
          </p>
        </div>
        <PermissionButton
          permission={PERMISSIONS.organizacion.roles.create}
          deniedReason="No tenés permiso para crear roles"
          onClick={() => setCreateOpen(true)}
          className="self-start"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo rol
        </PermissionButton>
      </div>

      <RolesList
        roles={rolesQuery.data ?? []}
        loading={rolesQuery.isLoading}
      />

      <RoleFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
