import { useState } from 'react';
import { toast } from 'sonner';

import { PermissionButton } from '@/components/shared/permission-button';
import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { construirHoja, descargarBlob, generarNombreArchivo } from '@/lib/export-excel';
import { PERMISSIONS } from '@/lib/permissions';
import type { ExportarComprobantesParams } from '@/types/api';

import { exportComprobantes } from '../api/export-comprobantes';
import { COLUMNS_COMPROBANTES, mapearComprobantesAFilas } from '../lib/exportar-comprobantes';

interface Props {
  /** Filtros activos de la URL (sin page/limit). */
  filtros: ExportarComprobantesParams;
  /** Perfil fiscal de la organización para la cabecera del informe. */
  perfil: EmpresaPerfil | null | undefined;
  /** Rango para el nombre del archivo (ej. periodo o "todos"). */
  rango: string;
}

/**
 * Botón "Exportar a Excel" para el listado de comprobantes.
 *
 * A diferencia de Fase A/B (que reusan la data del cache), este botón
 * FETCHEA on-demand en el click porque el cache del listado solo tiene
 * la página visible.
 *
 * - Gateado por permiso contabilidad.asientos.read (§14.7).
 * - Muestra "Generando…" mientras procesa (Anti-F-07).
 * - Errores via toast (ok en handler de acción del usuario — Anti-F-13).
 */
export function BotonExportarComprobantes({ filtros, perfil, rango }: Props): React.JSX.Element {
  const [generando, setGenerando] = useState(false);

  async function handleExportar(): Promise<void> {
    setGenerando(true);
    try {
      const { items } = await exportComprobantes(filtros);

      // Perfil fiscal nullable — armarCabeceraFiscal tolera todos los campos null
      const perfilFiscal: EmpresaPerfil = perfil ?? {
        razonSocial: null,
        nit: null,
        direccion: null,
        representanteLegal: null,
        telefono: null,
        email: null,
      };

      const filas = mapearComprobantesAFilas(items, perfilFiscal);
      const blob = await construirHoja(filas, COLUMNS_COMPROBANTES);
      descargarBlob(blob, generarNombreArchivo('comprobantes', rango));
    } catch {
      toast.error('No se pudo exportar el listado de comprobantes. Intentá de nuevo.');
    } finally {
      setGenerando(false);
    }
  }

  return (
    <PermissionButton
      permission={PERMISSIONS.contabilidad.asientos.read}
      deniedReason="No tenés permiso para exportar comprobantes"
      disabled={generando}
      onClick={() => {
        void handleExportar();
      }}
    >
      {generando ? 'Generando…' : 'Exportar a Excel'}
    </PermissionButton>
  );
}
