import { useState } from 'react';

import { PermissionButton } from '@/components/shared/permission-button';
import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { descargarBlob, formatearFechaCelda } from '@/lib/export-excel';
import { PERMISSIONS } from '@/lib/permissions';
import type { LibroDiarioResponse } from '@/types/api';

import { COLUMNAS_LIBRO_DIARIO_PDF, mapearLibroDiarioACeldasPdf } from '../lib/exportar-libro-diario-pdf';

interface Props {
  /** Datos del Libro Diario ya cargados en cache (no re-fetchea). */
  data: LibroDiarioResponse | undefined;
  /** Perfil fiscal de la organización para la cabecera del informe. */
  perfil: EmpresaPerfil | null | undefined;
  /** Rango de fechas/período para el nombre del archivo (ej. "2026-06"). */
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
 * Botón "Exportar a PDF" gateado por permiso contabilidad.libro-diario.read.
 *
 * - Generar el PDF es FREE (los números ya vienen del backend; el frontend maqueta).
 * - El motor react-pdf se carga con dynamic import en el click → fuera del chunk de la ruta.
 * - Deshabilitado sin data o sin permiso (§14.7); "Generando…" mientras procesa (Anti-F-07).
 */
export function BotonExportarLibroDiarioPdf({ data, perfil, rango }: Props): React.JSX.Element {
  const [generando, setGenerando] = useState(false);

  async function handleExportar(): Promise<void> {
    if (!data) return;

    setGenerando(true);
    try {
      const perfilFiscal: EmpresaPerfil = perfil ?? PERFIL_VACIO;
      const filas = mapearLibroDiarioACeldasPdf(data);
      const subtitulo = `${formatearFechaCelda(data.rango.fechaDesde)} — ${formatearFechaCelda(data.rango.fechaHasta)}`;

      // Dynamic import: @react-pdf/renderer (pesado) solo se carga al exportar.
      const { construirReportePdf } = await import('@/lib/export-pdf');
      const blob = await construirReportePdf({
        titulo: 'Libro Diario',
        subtitulo,
        perfil: perfilFiscal,
        columnas: COLUMNAS_LIBRO_DIARIO_PDF,
        filas,
        orientacion: 'landscape',
      });
      descargarBlob(blob, `libro-diario-${rango}.pdf`);
    } finally {
      setGenerando(false);
    }
  }

  return (
    <PermissionButton
      permission={PERMISSIONS.contabilidad.libroDiario.read}
      deniedReason="No tenés permiso para exportar el Libro Diario"
      disabled={!data || generando}
      onClick={() => {
        void handleExportar();
      }}
    >
      {generando ? 'Generando…' : 'Exportar a PDF'}
    </PermissionButton>
  );
}
