import { Download, Paperclip, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { mensajeComprobantes } from '@/lib/error-messages';
import { PERMISSIONS } from '@/lib/permissions';
import { useMisPacks } from '@/lib/use-packs';
import { usePermissions } from '@/lib/use-permissions';
import type { AdjuntoComprobante, Comprobante } from '@/types/api';

import { descargarAdjunto } from '../api/adjuntos-comprobante';
import { useAdjuntos } from '../hooks/use-adjuntos-comprobante';
import { useEliminarAdjunto } from '../hooks/use-eliminar-adjunto';
import { useSubirAdjunto } from '../hooks/use-subir-adjunto';

/** Whitelist de tipos MIME aceptados en el file input (orientativo; validación real en backend). */
const MIME_ACCEPT = [
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/jpg',
].join(',');

/** Tamaño máximo orientativo (25 MB). El backend enforza el tope real. */
const MAX_SIZE_MB = 25;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AdjuntoItemProps {
  adjunto: AdjuntoComprobante;
  editable: boolean;
  onEliminar: (id: string) => void;
  isEliminando: boolean;
}

function AdjuntoItem({
  adjunto,
  editable,
  onEliminar,
  isEliminando,
}: AdjuntoItemProps): React.JSX.Element {
  const { has } = usePermissions();
  const tienePermisoRead = has(PERMISSIONS.contabilidad.asientos.read);
  const tienePermisoUpdate = has(PERMISSIONS.contabilidad.asientos.update);

  async function handleDescargar(): Promise<void> {
    try {
      const blob = await descargarAdjunto(adjunto.comprobanteId, adjunto.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = adjunto.nombreOriginal;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('No se pudo descargar el adjunto.');
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
      <div className="min-w-0 flex items-center gap-2">
        <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" title={adjunto.nombreOriginal}>
            {adjunto.nombreOriginal}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatearTamano(adjunto.tamanoBytes)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {tienePermisoRead ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Descargar ${adjunto.nombreOriginal}`}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => void handleDescargar()}
          >
            <Download className="h-4 w-4" />
          </Button>
        ) : null}

        {editable && tienePermisoUpdate ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Eliminar ${adjunto.nombreOriginal}`}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            disabled={isEliminando}
            onClick={() => onEliminar(adjunto.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

interface AdjuntosSectionProps {
  comprobante: Comprobante;
  /**
   * D5: editable = !anulado && estado∈{BORRADOR,CONTABILIZADO} && (BORRADOR ‖ puedeEditarContabilizado)
   * El caller (detail-page) ya calcula esto correctamente.
   */
  editable: boolean;
}

/**
 * Sección "Adjuntos" dentro del detalle de comprobante.
 * Gateada por pack 'contabilidad.adjuntos' (fail-closed).
 * Muestra lista de adjuntos con descarga, eliminación y subida de nuevos.
 * Permisos: asientos.read → listar/descargar; asientos.update → subir/eliminar.
 */
export function AdjuntosSection({
  comprobante,
  editable,
}: AdjuntosSectionProps): React.JSX.Element | null {
  const { packsActivos } = useMisPacks();
  const { has } = usePermissions();
  const inputRef = useRef<HTMLInputElement>(null);

  const packActivo = packsActivos?.includes('contabilidad.adjuntos') === true;

  // Fail-closed: si el pack no está activo (incluyendo undefined mientras carga), ocultar.
  if (!packActivo) return null;

  const tienePermisoUpdate = has(PERMISSIONS.contabilidad.asientos.update);

  return (
    <AdjuntosSectionInner
      comprobante={comprobante}
      editable={editable}
      tienePermisoUpdate={tienePermisoUpdate}
      inputRef={inputRef}
    />
  );
}

/** Parte interna — separada para que el early return en AdjuntosSection no tenga hooks después. */
function AdjuntosSectionInner({
  comprobante,
  editable,
  tienePermisoUpdate,
  inputRef,
}: {
  comprobante: Comprobante;
  editable: boolean;
  tienePermisoUpdate: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}): React.JSX.Element {
  const { data: adjuntos, isLoading } = useAdjuntos(comprobante.id);
  const subirMutation = useSubirAdjunto(comprobante.id);
  const eliminarMutation = useEliminarAdjunto(comprobante.id);

  function handleSubir(file: File): void {
    if (file.size > MAX_SIZE_BYTES) {
      toast.error(`El archivo supera el límite de ${MAX_SIZE_MB} MB.`);
      return;
    }
    subirMutation.mutate(file, {
      onSuccess: () => {
        toast.success('Adjunto subido correctamente.');
      },
      onError: (err) => {
        toast.error(mensajeComprobantes(err));
      },
    });
  }

  function handleEliminar(adjuntoId: string): void {
    eliminarMutation.mutate(adjuntoId, {
      onSuccess: () => {
        toast.success('Adjunto eliminado.');
      },
      onError: (err) => {
        toast.error(mensajeComprobantes(err));
      },
    });
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Adjuntos
      </h2>

      {/* Lista de adjuntos */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : adjuntos === undefined || adjuntos.length === 0 ? (
        <div className="flex h-16 items-center justify-center rounded-md border border-dashed">
          <p className="text-sm text-muted-foreground">Sin adjuntos.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {adjuntos.map((adj) => (
            <AdjuntoItem
              key={adj.id}
              adjunto={adj}
              editable={editable}
              onEliminar={handleEliminar}
              isEliminando={
                eliminarMutation.isPending && eliminarMutation.variables === adj.id
              }
            />
          ))}
        </div>
      )}

      {/* Input de subida — solo en modo editable con permiso */}
      {editable && tienePermisoUpdate ? (
        <div>
          <input
            ref={inputRef}
            id={`adjunto-input-${comprobante.id}`}
            type="file"
            accept={MIME_ACCEPT}
            aria-label="Subir adjunto"
            className="sr-only"
            disabled={subirMutation.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file !== undefined) {
                handleSubir(file);
                // Limpiar el input para permitir subir el mismo archivo de nuevo
                e.target.value = '';
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={subirMutation.isPending}
            onClick={() => inputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
            {subirMutation.isPending ? 'Subiendo...' : 'Adjuntar archivo'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
