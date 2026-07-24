import { Eye } from 'lucide-react';

/**
 * Aviso de "modo consulta" (REQ-CB-14 escenario 1).
 *
 * **Excepción documentada a `frontend/CLAUDE.md §14.7`**, decidida para esta
 * pantalla: la regla general para un botón de acción es deshabilitar + tooltip,
 * NO ocultar. Acá las acciones se repiten por fila en dos paneles: llenar la
 * pantalla de decenas de botones grises con el mismo tooltip satura la
 * afordancia y deja de informar. El banner honra el POR QUÉ de §14.7 — que el
 * usuario entienda su situación — una sola vez y a nivel pantalla.
 *
 * NO generalizar: en pantallas con acciones puntuales sigue mandando
 * `<PermissionButton>`. La ruta y el ítem de sidebar sí se ocultan fail-closed
 * sin `.read` (eso es navegación, y ahí §14.7 manda ocultar).
 */
export function ModoConsultaBanner(): React.JSX.Element {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-muted px-4 py-3">
      <Eye className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="text-sm">
        <p className="font-medium">Modo consulta</p>
        <p className="text-muted-foreground">
          Tenés permiso de lectura sobre la conciliación: podés ver movimientos, líneas,
          sugerencias e historial, pero no confirmar, deshacer ni ignorar. Pedí el permiso
          &ldquo;conciliar&rdquo; a un administrador si necesitás operar.
        </p>
      </div>
    </div>
  );
}
