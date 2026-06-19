import { useState } from 'react';

import { PermissionButton } from '@/components/shared/permission-button';
import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { descargarBlob, formatearFechaCelda } from '@/lib/export-excel';
import { PERMISSIONS } from '@/lib/permissions';
import type { LibroDiarioResponse } from '@/types/api';

import { mapearLibroDiarioADocumentoPdf } from '../lib/exportar-libro-diario-pdf';

interface Props {
  /** Datos del Libro Diario ya cargados en cache (no re-fetchea). */
  data: LibroDiarioResponse | undefined;
  /** Perfil fiscal de la organización para la cabecera del informe. */
  perfil: EmpresaPerfil | null | undefined;
  /** Rango de fechas/período para el nombre del archivo (ej. "2026-06"). */
  rango: string;
  /** Etiqueta "código — nombre" de la cuenta filtrada; se declara en el encabezado. */
  cuentaFiltro?: string;
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
export function BotonExportarLibroDiarioPdf({
  data,
  perfil,
  rango,
  cuentaFiltro,
}: Props): React.JSX.Element {
  const [generando, setGenerando] = useState(false);

  async function handleExportar(): Promise<void> {
    if (!data) return;

    setGenerando(true);
    try {
      const perfilFiscal: EmpresaPerfil = perfil ?? PERFIL_VACIO;
      const modelo = mapearLibroDiarioADocumentoPdf(data);
      const rangoTexto = `Del ${formatearFechaCelda(data.rango.fechaDesde)} al ${formatearFechaCelda(data.rango.fechaHasta)}`;
      // Segunda línea del subtítulo si el informe está filtrado: react-pdf respeta el \n.
      const subtitulo =
        cuentaFiltro !== undefined
          ? `${rangoTexto}\nFiltrado por cuenta: ${cuentaFiltro}`
          : rangoTexto;

      // Dynamic import: @react-pdf/renderer (pesado) solo se carga al exportar.
      const { construirLibroDiarioPdf } = await import('../lib/construir-libro-diario-pdf');
      const blob = await construirLibroDiarioPdf({
        titulo: 'Libro Diario',
        subtitulo,
        perfil: perfilFiscal,
        modelo,
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
