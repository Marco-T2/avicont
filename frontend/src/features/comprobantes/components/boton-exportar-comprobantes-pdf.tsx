import { useState } from 'react';
import { toast } from 'sonner';

import { PermissionButton } from '@/components/shared/permission-button';
import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { descargarBlob } from '@/lib/export-excel';
import { PERMISSIONS } from '@/lib/permissions';
import type { ExportarComprobantesParams } from '@/types/api';

import { exportComprobantes } from '../api/export-comprobantes';
import {
  COLUMNAS_PDF_COMPROBANTES,
  mapearComprobantesAFilasDatos,
} from '../lib/exportar-comprobantes';

interface Props {
  /** Filtros activos de la URL (sin page/limit). */
  filtros: ExportarComprobantesParams;
  /** Perfil fiscal de la organización para la cabecera del informe. */
  perfil: EmpresaPerfil | null | undefined;
  /** Rango para el nombre del archivo (ej. periodo o "todos"). */
  rango: string;
}

const PERFIL_VACIO: EmpresaPerfil = {
  razonSocial: null,
  nit: null,
  direccion: null,
  representanteLegal: null,
  telefono: null,
  email: null,
};

/**
 * Botón "Exportar a PDF" del listado de comprobantes, gateado por contabilidad.asientos.read.
 *
 * - FETCHEA on-demand en el click (el cache del listado solo tiene la página visible).
 * - 9 columnas → orientación landscape (excede el ancho útil de A4 portrait).
 * - Builder genérico construirReportePdf; cabecera fiscal vía `perfil`.
 * - react-pdf por dynamic import (fuera del chunk de la ruta).
 * - Errores vía toast (ok en handler de acción del usuario — Anti-F-13).
 */
export function BotonExportarComprobantesPdf({ filtros, perfil, rango }: Props): React.JSX.Element {
  const [generando, setGenerando] = useState(false);

  async function handleExportar(): Promise<void> {
    setGenerando(true);
    try {
      const { items } = await exportComprobantes(filtros);

      const perfilFiscal: EmpresaPerfil = perfil ?? PERFIL_VACIO;
      const filas = mapearComprobantesAFilasDatos(items);

      const { construirReportePdf } = await import('@/lib/export-pdf');
      const blob = await construirReportePdf({
        titulo: 'Comprobantes',
        subtitulo: 'Listado de comprobantes',
        perfil: perfilFiscal,
        columnas: COLUMNAS_PDF_COMPROBANTES,
        filas,
        orientacion: 'landscape',
      });
      descargarBlob(blob, `comprobantes-${rango}.pdf`);
    } catch {
      toast.error('No se pudo exportar el listado de comprobantes a PDF. Intentá de nuevo.');
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
      {generando ? 'Generando…' : 'Exportar a PDF'}
    </PermissionButton>
  );
}
