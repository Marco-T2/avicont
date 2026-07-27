import { ChevronLeft } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { CustomRole } from '@/types/api';

import { RoleDetailPanel } from '../components/role-detail-panel';
import { RolesMaster } from '../components/roles-master';
import { useRoles } from '../hooks/use-roles';

const RUTA_BASE = '/settings/roles';

// /settings/roles — editor de roles personalizados, master-detail de dos paneles.
//
// Tres rutas montan esta misma pantalla y sólo cambia el panel derecho:
//   /settings/roles        → sin selección
//   /settings/roles/nuevo  → alta
//   /settings/roles/:id    → edición
//
// La selección vive en la URL y no en un `useState` para que el detalle sea
// enlazable y sobreviva a un refresh; es también lo que permite volver del
// detalle en mobile con el botón atrás del navegador.
//
// Los roles de sistema (OWNER/ADMIN) no se listan acá: son inmutables y se
// asignan desde /settings/members.
export function RolesPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const rolesQuery = useRoles();

  const creando = pathname === `${RUTA_BASE}/nuevo`;
  const roles = rolesQuery.data ?? [];
  const seleccionado = id === undefined ? undefined : roles.find((r) => r.id === id);
  const hayDetalle = creando || id !== undefined;

  function abrir(role: CustomRole): void {
    void navigate(`${RUTA_BASE}/${role.id}`);
  }

  function volverAlListado(): void {
    void navigate(RUTA_BASE);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Roles personalizados</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Creá perfiles de permisos específicos para tu organización (por
          ejemplo: "Contador Junior", "Auditor externo").
        </p>
      </div>

      {/* Banner inline en vez de toast: sin la lista no hay pantalla. Un
          `toast.error()` en el cuerpo del componente se dispara en CADA
          re-render mientras `isError` siga true (Anti-F-13). */}
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
        // Debajo de `lg` no entran dos paneles: se muestra UNO solo — la lista,
        // o el detalle con un botón de volver. Arriba de `lg`, los dos a la vez.
        <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-6">
          <div className={hayDetalle ? 'hidden lg:block' : ''}>
            <RolesMaster
              roles={roles}
              loading={rolesQuery.isLoading}
              seleccionado={creando ? 'nuevo' : id}
              onSeleccionar={abrir}
              onCrear={() => void navigate(`${RUTA_BASE}/nuevo`)}
            />
          </div>

          <div className={hayDetalle ? '' : 'hidden lg:block'}>
            {hayDetalle ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={volverAlListado}
                className="-ml-2 mb-2 gap-1 lg:hidden"
              >
                <ChevronLeft className="h-4 w-4" />
                Roles
              </Button>
            ) : null}

            <DetallePanel
              hayDetalle={hayDetalle}
              creando={creando}
              idPedido={id}
              role={seleccionado}
              cargando={rolesQuery.isLoading}
              onGuardado={abrir}
              onEliminado={volverAlListado}
              onCancelar={volverAlListado}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface DetallePanelProps {
  hayDetalle: boolean;
  creando: boolean;
  idPedido: string | undefined;
  role: CustomRole | undefined;
  cargando: boolean;
  onGuardado: (role: CustomRole) => void;
  onEliminado: () => void;
  onCancelar: () => void;
}

function DetallePanel({
  hayDetalle,
  creando,
  idPedido,
  role,
  cargando,
  onGuardado,
  onEliminado,
  onCancelar,
}: DetallePanelProps): React.JSX.Element {
  if (!hayDetalle) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">
          Elegí un rol de la lista, o creá uno nuevo.
        </p>
      </div>
    );
  }

  // Edición con el rol todavía sin resolver: el form vacío invitaría a guardar
  // y pisar el rol con campos en blanco.
  if (!creando && role === undefined) {
    if (cargando) {
      return (
        <div className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      );
    }
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
        <p className="text-sm">
          No encontramos el rol <code>{idPedido}</code>. Puede haber sido
          eliminado.
        </p>
      </div>
    );
  }

  return (
    <RoleDetailPanel
      role={creando ? undefined : role}
      onGuardado={onGuardado}
      onEliminado={onEliminado}
      onCancelar={onCancelar}
    />
  );
}
