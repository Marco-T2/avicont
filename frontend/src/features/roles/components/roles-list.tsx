import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { backendErrorMessage } from '@/lib/error-messages';
import { PERMISSIONS } from '@/lib/permissions';
import { usePermissions } from '@/lib/use-permissions';
import type { CustomRole } from '@/types/api';

import { useDeleteRole } from '../hooks/use-roles';

import { RoleFormDialog } from './role-form-dialog';

interface RolesListProps {
  roles: CustomRole[];
  loading?: boolean;
}

export function RolesList({
  roles,
  loading = false,
}: RolesListProps): React.JSX.Element {
  const [editRole, setEditRole] = useState<CustomRole | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomRole | null>(null);
  const deleteMutation = useDeleteRole();

  // Gating de permisos: los ítems de menú se deshabilitan (no se ocultan) cuando
  // falta el permiso, sumándose a la condición de negocio `isEditable`. Sin
  // tooltip porque un DropdownMenuItem deshabilitado no lo dispara de forma fiable.
  const { has } = usePermissions();
  const puedeActualizar = has(PERMISSIONS.organizacion.roles.update);
  const puedeEliminar = has(PERMISSIONS.organizacion.roles.delete);

  if (loading && roles.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (roles.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          No hay roles personalizados todavía. Creá uno con el botón de arriba.
        </p>
      </div>
    );
  }

  function handleConfirmDelete(): void {
    if (deleteTarget === null) return;
    const role = deleteTarget;
    deleteMutation.mutate(role.id, {
      onSuccess: () => {
        toast.success(`Rol "${role.name}" eliminado`);
        setDeleteTarget(null);
      },
      onError: (err) =>
        toast.error(backendErrorMessage(err, 'No se pudo eliminar el rol')),
    });
  }

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow>
              <TableHead>Rol</TableHead>
              <TableHead>Permisos</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id}>
                <TableCell>
                  <div className="min-w-0">
                    <p className="font-medium">{role.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <code>{role.slug}</code>
                    </p>
                    {role.description !== null ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {role.description}
                      </p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {role.permissions.length} permiso
                    {role.permissions.length === 1 ? '' : 's'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {role.isSystemDefault ? (
                    <Badge variant="outline">Plantilla</Badge>
                  ) : (
                    <Badge variant="outline">Personalizado</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 md:h-9 md:w-9"
                        aria-label={`Acciones para ${role.name}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        onClick={() => setEditRole(role)}
                        disabled={!role.isEditable || !puedeActualizar}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleteTarget(role)}
                        disabled={!role.isEditable || !puedeEliminar}
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editRole !== null ? (
        <RoleFormDialog
          open={true}
          onOpenChange={(o) => {
            if (!o) setEditRole(null);
          }}
          role={editRole}
        />
      ) : null}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar rol</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar el rol <b>{deleteTarget?.name}</b>? Los miembros
              asignados a este rol quedarán sin rol hasta que les asignes uno
              nuevo. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
