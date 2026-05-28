import { useQuery } from '@tanstack/react-query';

import { getAuditoria } from '../api/get-auditoria';

export function useAuditoria(comprobanteId: string | null) {
  return useQuery({
    queryKey: ['comprobantes', 'auditoria', comprobanteId],
    queryFn: () => getAuditoria(comprobanteId!),
    // Solo fetchea cuando el sheet está abierto (comprobanteId !== null).
    enabled: comprobanteId !== null,
  });
}
