import { Can } from '@/components/shared/can';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface PermissionButtonProps extends React.ComponentProps<typeof Button> {
  /** Permiso requerido para habilitar el botón. */
  permission: string;
  /** Texto del tooltip cuando el usuario no tiene permiso. */
  deniedReason?: string;
}

/**
 * Botón gateado por permiso (afordancia honesta, no engañosa).
 *
 * - Con permiso → se comporta como un `<Button>` normal.
 * - Sin permiso → deshabilitado, con un tooltip que explica por qué.
 *
 * Construido sobre `<Can>`: la autoridad real sigue siendo el backend
 * (CLAUDE.md §5 defense in depth). Esto es solo UX — no muestra acciones
 * habilitadas que el backend rechazaría con 403.
 */
export function PermissionButton({
  permission,
  deniedReason = 'No tenés permiso para esta acción',
  children,
  ...buttonProps
}: PermissionButtonProps): React.JSX.Element {
  return (
    <Can permission={permission}>
      {(allowed) =>
        allowed ? (
          <Button {...buttonProps}>{children}</Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* El span es necesario: un button deshabilitado tiene
                  pointer-events:none y nunca dispararía el hover del tooltip. */}
              <span className="inline-flex">
                <Button {...buttonProps} disabled>
                  {children}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{deniedReason}</TooltipContent>
          </Tooltip>
        )
      }
    </Can>
  );
}
