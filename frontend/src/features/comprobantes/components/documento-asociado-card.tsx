import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { DocumentoFisico } from '@/types/api';

import { formatearFechaContable } from '../lib/formatear-fecha-contable';

interface DocumentoAsociadoCardProps {
  documento: DocumentoFisico;
  editable: boolean;
  onDesasociar: (docId: string) => void;
  isDesasociando?: boolean;
}

/**
 * Ítem de la lista de documentos físicos asociados a un comprobante.
 * Muestra tipo/número/fecha y monto+moneda si el tipo es tributario.
 * Botón de desasociar solo si `editable`.
 */
export function DocumentoAsociadoCard({
  documento,
  editable,
  onDesasociar,
  isDesasociando = false,
}: DocumentoAsociadoCardProps): React.JSX.Element {
  const esTributario = documento.tipoDocumentoFisico.esTributario;

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium">
            {documento.tipoDocumentoFisico.nombre}
          </span>
          <span className="font-mono text-sm font-semibold">{documento.numero}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span>{formatearFechaContable(documento.fechaEmision)}</span>
          {esTributario && documento.monto !== null ? (
            <span className="font-medium text-foreground">
              {documento.moneda} {documento.monto}
            </span>
          ) : null}
        </div>
      </div>
      {editable ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Desasociar documento ${documento.numero}`}
          disabled={isDesasociando}
          onClick={() => onDesasociar(documento.id)}
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
