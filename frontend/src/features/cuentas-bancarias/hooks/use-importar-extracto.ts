import { useMutation, useQueryClient } from '@tanstack/react-query';

import { importarExtracto, type ImportarExtractoVars } from '../api/importar-extracto';

/**
 * Importación de un extracto bancario (REQ-CB-16).
 *
 * NO emite toast de éxito por su cuenta: el resultado tiene dos caminos muy
 * distintos (importó · falta confirmar el número de cuenta) y varios datos que
 * el usuario necesita leer con calma (nuevos, duplicados, checksum,
 * advertencias). El componente los renderiza; un toast se los comería.
 *
 * Tampoco emite toast de ERROR, y ahí se aparta a propósito de Anti-F-13 (que
 * reserva el toast justamente para errores de mutación). Los errores de
 * importación no son un aviso de "falló, reintentá": son instrucciones
 * accionables ("el archivo es .xls, guardalo como .xlsx", "el número de cuenta
 * del archivo es X y el de la cuenta es Y"). Un toast que se va solo a los
 * segundos se lleva el dato justo antes de que el usuario pueda actuar. El
 * componente los muestra en un panel fijo, al lado del input que hay que
 * corregir.
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
  });
}
