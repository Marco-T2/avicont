import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router';

import { PermissionButton } from '@/components/shared/permission-button';
import { PERMISSIONS } from '@/lib/permissions';

import { RolesList } from '../components/roles-list';
import { useRoles } from '../hooks/use-roles';

// /settings/roles — admin de roles personalizados del tenant activo.
// Los roles de sistema (OWNER/ADMIN) no se listan acá: son inmutables y se
// asignan desde /settings/members.
export function RolesPage(): React.JSX.Element {
  const navigate = useNavigate();
  const rolesQuery = useRoles();

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
          onClick={() => void navigate('/settings/roles/nuevo')}
          className="self-start"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo rol
        </PermissionButton>
      </div>

      {/* Banner inline en vez de toast: la lista es lo único que renderiza esta
          página, así que el error es crítico para el render. Un `toast.error()`
          en el cuerpo del componente se dispara en CADA re-render mientras
          `isError` siga true (Anti-F-13). */}
      {rolesQuery.isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p className="text-sm">
            No se pudieron cargar los roles.{' '}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => void rolesQuery.refetch()}
            >
              Reintentar
            </button>
          </p>
        </div>
      ) : (
        <RolesList roles={rolesQuery.data ?? []} loading={rolesQuery.isLoading} />
      )}
    </div>
  );
}
