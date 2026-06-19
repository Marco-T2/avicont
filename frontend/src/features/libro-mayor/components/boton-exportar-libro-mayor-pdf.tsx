import { useState } from 'react';
import { toast } from 'sonner';

import { PermissionButton } from '@/components/shared/permission-button';
import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { descargarBlob, formatearFechaCelda } from '@/lib/export-excel';
import { PERMISSIONS } from '@/lib/permissions';
import type { LibroMayorResponse } from '@/types/api';

import {
  COLUMNAS_PDF_LIBRO_MAYOR,
  mapearLibroMayorAFilasDatos,
} from '../lib/exportar-libro-mayor';

interface Props {
  /** Datos del Libro Mayor ya cargados en cache (no re-fetchea). */
  data: LibroMayorResponse | undefined;
  /** Perfil fiscal de la organización para la cabecera del informe. */
  perfil: EmpresaPerfil | null | undefined;
  /** Rango de fechas/período para el nombre del archivo. */
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
 * Botón "Exportar a PDF" del Libro Mayor, gateado por contabilidad.libro-mayor.read.
 *
 * - Usa el builder genérico construirReportePdf (informe tabular plano, portrait).
 * - La cabecera fiscal va por `perfil` (el builder la renderiza una sola vez);
 *   las filas son solo datos (mapearLibroMayorAFilasDatos).
 * - El motor react-pdf se carga con dynamic import en el click → fuera del chunk de la ruta.
 * - Deshabilitado sin data o sin permiso (§14.7); "Generando…" mientras procesa (Anti-F-07).
 * - Errores vía toast (ok en handler de acción del usuario — Anti-F-13).
 */
export function BotonExportarLibroMayorPdf({ data, perfil, rango }: Props): React.JSX.Element {
  const [generando, setGenerando] = useState(false);

  async function handleExportar(): Promise<void> {
    if (!data) return;

    setGenerando(true);
    try {
      const perfilFiscal: EmpresaPerfil = perfil ?? PERFIL_VACIO;
      const filas = mapearLibroMayorAFilasDatos(data);
      const subtitulo = `Del ${formatearFechaCelda(data.rango.fechaDesde)} al ${formatearFechaCelda(data.rango.fechaHasta)}`;

      // Dynamic import: @react-pdf/renderer (pesado) solo se carga al exportar.
      const { construirReportePdf } = await import('@/lib/export-pdf');
      const blob = await construirReportePdf({
        titulo: 'Libro Mayor',
        subtitulo,
        perfil: perfilFiscal,
        columnas: COLUMNAS_PDF_LIBRO_MAYOR,
        filas,
        orientacion: 'portrait',
      });
      descargarBlob(blob, `libro-mayor-${rango}.pdf`);
    } catch {
      toast.error('No se pudo exportar el Libro Mayor a PDF. Intentá de nuevo.');
    } finally {
      setGenerando(false);
    }
  }

  return (
    <PermissionButton
      permission={PERMISSIONS.contabilidad.libroMayor.read}
      deniedReason="No tenés permiso para exportar el Libro Mayor"
      disabled={!data || generando}
      onClick={() => {
        void handleExportar();
      }}
    >
      {generando ? 'Generando…' : 'Exportar a PDF'}
    </PermissionButton>
  );
}
