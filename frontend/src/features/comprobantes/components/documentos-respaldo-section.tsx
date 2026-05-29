import { toast } from 'sonner';

import { Skeleton } from '@/components/ui/skeleton';
import { mensajeComprobantes } from '@/lib/error-messages';
import type { Comprobante } from '@/types/api';

import { useDocumentosAsociados } from '../hooks/use-documentos-asociados';
import { useDesasociarDocumento } from '../hooks/use-desasociar-documento';
import { DocumentoAsociadoCard } from './documento-asociado-card';
import { DocumentoFisicoCombobox } from './documento-fisico-combobox';

interface DocumentosRespaldoSectionProps {
  comprobante: Comprobante;
  /**
   * D5: editable = !anulado && estado∈{BORRADOR,CONTABILIZADO} && (BORRADOR ‖ puedeEditarContabilizado)
   * El caller (detail-page o editar-page) ya calcula esto correctamente.
   */
  editable: boolean;
}

/**
 * Sección "Documentos de respaldo" dentro del comprobante.
 * Orquesta useDocumentosAsociados, lista de DocumentoAsociadoCard y DocumentoFisicoCombobox.
 * Modo editable: muestra combobox + botones desasociar.
 * Modo read-only: lista sin botones.
 */
export function DocumentosRespaldoSection({
  comprobante,
  editable,
}: DocumentosRespaldoSectionProps): React.JSX.Element {
  const { data: documentos, isLoading } = useDocumentosAsociados(comprobante.id);
  const desasociarMutation = useDesasociarDocumento(comprobante.id);

  function handleDesasociar(docId: string): void {
    desasociarMutation.mutate(docId, {
      onSuccess: () => {
        toast.success('Documento desasociado correctamente');
      },
      onError: (err) => {
        toast.error(mensajeComprobantes(err));
      },
    });
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Documentos de respaldo
      </h2>

      {/* Lista de documentos asociados */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : documentos === undefined || documentos.length === 0 ? (
        <div className="flex h-16 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">Sin documentos de respaldo.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documentos.map((doc) => (
            <DocumentoAsociadoCard
              key={doc.id}
              documento={doc}
              editable={editable}
              onDesasociar={handleDesasociar}
              isDesasociando={
                desasociarMutation.isPending &&
                desasociarMutation.variables === doc.id
              }
            />
          ))}
        </div>
      )}

      {/* Combobox solo en modo editable */}
      {editable ? (
        <DocumentoFisicoCombobox
          comprobanteId={comprobante.id}
          tipoComprobante={comprobante.tipo}
        />
      ) : null}
    </div>
  );
}
