import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { mensajeConciliacion } from '@/lib/error-messages';

import { importarExtracto, type ImportarExtractoVars } from '../api/importar-extracto';

/**
 * Importación de un extracto bancario (REQ-CB-16).
 *
 * NO emite toast de éxito por su cuenta: el resultado tiene dos caminos muy
 * distintos (importó · falta confirmar el número de cuenta) y varios datos que
 * el usuario necesita leer con calma (nuevos, duplicados, checksum,
 * advertencias). El componente los renderiza; un toast se los comería.
 */
export function useImportarExtracto() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (vars: ImportarExtractoVars) => importarExtracto(vars),
    onSuccess: (data) => {
      // Solo hay movimientos nuevos cuando la importación se concretó.
      if (data.requiereConfirmacionCuenta) return;
      void qc.invalidateQueries({ queryKey: ['cuentas-bancarias'] });
      // Los movimientos nuevos cambian los dos paneles del workspace.
      void qc.invalidateQueries({ queryKey: ['conciliacion'] });
    },
    onError: (err) => {
      toast.error(mensajeConciliacion(err));
    },
  });
}
