import { useState } from 'react';
import { toast } from 'sonner';

import { PermissionButton } from '@/components/shared/permission-button';
import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { descargarBlob, formatearFechaCelda } from '@/lib/export-excel';
import { PERMISSIONS } from '@/lib/permissions';
import type { BalanceComprobacionResponse } from '@/types/api';

import {
  COLUMNAS_PDF_BALANCE_COMPROBACION,
  mapearBalanceComprobacionAFilasDatos,
} from '../lib/exportar-balance-comprobacion';

interface Props {
  /** Datos del Balance de Comprobación ya cargados en cache (no re-fetchea). */
  data: BalanceComprobacionResponse | undefined;
  /** Perfil fiscal de la organización para la cabecera del informe. */
  perfil: EmpresaPerfil | null | undefined;
  /** Rango para el nombre del archivo. */
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
 * Botón "Exportar a PDF" del Balance de Comprobación, gateado por contabilidad.eeff.read.
 *
 * - Builder genérico construirReportePdf (tabular plano, portrait), con totales,
 *   fila de cuadre y sección opcional de naturaleza opuesta dentro de las filas.
 * - La cabecera fiscal va por `perfil` (el builder la renderiza una sola vez).
 * - react-pdf por dynamic import (fuera del chunk de la ruta).
 * - Deshabilitado sin data o sin permiso (§14.7); "Generando…" mientras procesa (Anti-F-07).
 * - Errores vía toast (ok en handler de acción del usuario — Anti-F-13).
 */
export function BotonExportarBalanceComprobacionPdf({
  data,
  perfil,
  rango,
}: Props): React.JSX.Element {
  const [generando, setGenerando] = useState(false);

  async function handleExportar(): Promise<void> {
    if (!data) return;

    setGenerando(true);
    try {
      const perfilFiscal: EmpresaPerfil = perfil ?? PERFIL_VACIO;
      const filas = mapearBalanceComprobacionAFilasDatos(data);
      const subtitulo = `Del ${formatearFechaCelda(data.fechaDesde)} al ${formatearFechaCelda(data.fechaHasta)}`;

      const { construirReportePdf } = await import('@/lib/export-pdf');
      const blob = await construirReportePdf({
        titulo: 'Balance de Comprobación',
        subtitulo,
        perfil: perfilFiscal,
        columnas: COLUMNAS_PDF_BALANCE_COMPROBACION,
        filas,
        orientacion: 'portrait',
      });
      descargarBlob(blob, `balance-comprobacion-${rango}.pdf`);
    } catch {
      toast.error('No se pudo exportar el Balance de Comprobación a PDF. Intentá de nuevo.');
    } finally {
      setGenerando(false);
    }
  }

  return (
    <PermissionButton
      permission={PERMISSIONS.contabilidad.eeff.read}
      deniedReason="No tenés permiso para exportar el Balance de Comprobación"
      disabled={!data || generando}
      onClick={() => {
        void handleExportar();
      }}
    >
      {generando ? 'Generando…' : 'Exportar a PDF'}
    </PermissionButton>
  );
}
