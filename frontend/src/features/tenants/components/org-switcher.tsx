import { Building2, Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { backendErrorMessage } from '@/lib/error-messages';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import type { UserTenant } from '@/types/api';

import { useMyProfile } from '../hooks/use-my-profile';
import { useSwitchTenant } from '../hooks/use-switch-tenant';

// OrgSwitcher — dropdown en el topbar con la org activa y lista de orgs
// donde el user es miembro. Al clickear una distinta, dispara POST
// /api/auth/switch-tenant y refresca el cache global.
//
// Cuando el user solo tiene 1 org, no renderiza el dropdown (muestra la
// org como span estático, sin affordance inútil).
//
// Cuando el user tiene 0 orgs (caso borde post-logout de todas las membresías),
// muestra "Sin organización" deshabilitado.
export function OrgSwitcher(): React.JSX.Element {
  const { data, isLoading } = useMyProfile();
  const activeTenantId = useAuthStore((s) => s.user?.activeTenantId);
  const switchMutation = useSwitchTenant();
  const navigate = useNavigate();

  if (isLoading && data === undefined) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="hidden sm:inline">Cargando…</span>
      </div>
    );
  }

  const tenants = data?.tenants ?? [];
  const active = tenants.find((t) => t.id === activeTenantId) ?? tenants[0];

  if (tenants.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Building2 className="h-4 w-4" />
        <span className="truncate max-w-[140px] sm:max-w-[200px]">
          Sin organización
        </span>
      </div>
    );
  }

  // Una sola org: sin dropdown, muestra el nombre y listo.
  if (tenants.length === 1) {
    return (
      <div className="flex items-center gap-2">
        <OrgInitials name={active?.name ?? ''} />
        <div className="min-w-0 hidden sm:block">
          <p className="truncate text-sm font-medium leading-tight max-w-[200px]">
            {active?.name}
          </p>
          {active?.role !== null && active?.role !== undefined ? (
            <p className="truncate text-xs text-muted-foreground leading-tight">
              {active.role}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  function handleSelect(tenantId: string): void {
    if (tenantId === activeTenantId) return;
    switchMutation.mutate(tenantId, {
      onSuccess: () => {
        const nombre = tenants.find((t) => t.id === tenantId)?.name ?? '';
        toast.success(`Cambiado a ${nombre}`);
        // Tras el switch, volver al inicio: IndexRedirect enruta al home del
        // vertical correcto y desmonta la página actual. Sin esto, una ruta de
        // otro vertical (ej. /granja/tipos-registro) queda montada y su query,
        // ya invalidada por el reset de cache, se re-dispara contra el tenant
        // nuevo → 403/404 del backend → flash de error de una página huérfana.
        navigate('/', { replace: true });
      },
      onError: (err) => {
        toast.error(backendErrorMessage(err, 'No se pudo cambiar de organización'));
      },
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto gap-2 px-2 py-1.5 data-[state=open]:bg-accent"
          aria-label="Cambiar de organización"
        >
          <OrgInitials name={active?.name ?? ''} />
          <div className="min-w-0 hidden sm:block text-left">
            <p className="truncate text-sm font-medium leading-tight max-w-[180px]">
              {active?.name}
            </p>
            {active?.role !== null && active?.role !== undefined ? (
              <p className="truncate text-xs text-muted-foreground leading-tight">
                {active.role}
              </p>
            ) : null}
          </div>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Tus organizaciones
        </DropdownMenuLabel>
        {tenants.map((t) => (
          <TenantMenuItem
            key={t.id}
            tenant={t}
            isActive={t.id === activeTenantId}
            isSwitching={switchMutation.isPending}
            onSelect={() => handleSelect(t.id)}
          />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled
          title="Próximamente — requiere UI de alta de organización"
        >
          <Plus className="h-4 w-4 mr-2" />
          Crear organización
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ------------------------------------------------------------

interface TenantMenuItemProps {
  tenant: UserTenant;
  isActive: boolean;
  isSwitching: boolean;
  onSelect: () => void;
}

function TenantMenuItem({
  tenant,
  isActive,
  isSwitching,
  onSelect,
}: TenantMenuItemProps): React.JSX.Element {
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        if (!isActive) onSelect();
      }}
      disabled={isSwitching}
      className="cursor-pointer"
    >
      <OrgInitials name={tenant.name} small />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{tenant.name}</p>
        {tenant.role !== null ? (
          <p className="truncate text-xs text-muted-foreground leading-tight">
            {tenant.role}
          </p>
        ) : null}
      </div>
      {isActive ? (
        <Check className="h-4 w-4 text-muted-foreground shrink-0" />
      ) : null}
    </DropdownMenuItem>
  );
}

// Avatar mini con las iniciales de la org — evita depender de logos subidos
// que hoy no manejamos.
function OrgInitials({
  name,
  small = false,
}: {
  name: string;
  small?: boolean;
}): React.JSX.Element {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground font-semibold',
        small ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs',
      )}
      aria-hidden="true"
    >
      {initials.length > 0 ? initials : <Building2 className="h-4 w-4" />}
    </div>
  );
}
