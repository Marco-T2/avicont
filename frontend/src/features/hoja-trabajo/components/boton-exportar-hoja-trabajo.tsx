import { useState } from 'react';

import { PermissionButton } from '@/components/shared/permission-button';
import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { construirHoja, descargarBlob, generarNombreArchivo } from '@/lib/export-excel';
import { PERMISSIONS } from '@/lib/permissions';
import type { HojaTrabajoResponse } from '@/types/api';

import { COLUMNS_HOJA_TRABAJO, mapearHojaTrabajoAFilas } from '../lib/exportar-hoja-trabajo';

interface Props {
  /** Datos de la Hoja de Trabajo ya cargados en cache (no re-fetchea). */
  data: HojaTrabajoResponse | undefined;
  /** Perfil fiscal de la organización para la cabecera del informe. */
  perfil: EmpresaPerfil | null | undefined;
  /** Rango para el nombre del archivo. */
  rango: string;
}

/**
 * Botón "Exportar a Excel" gateado por permiso contabilidad.eeff.read.
 *
 * - Deshabilitado si no hay data (query aún sin resultado).
 * - Deshabilitado con tooltip si el usuario no tiene permiso (§14.7).
 * - Muestra "Generando…" mientras el await procesa (Anti-F-07).
 * - Consume la data ya cargada — NO re-fetchea el informe.
 */
export function BotonExportarHojaTrabajo({ data, perfil, rango }: Props): React.JSX.Element {
  const [generando, setGenerando] = useState(false);

  async function handleExportar(): Promise<void> {
    if (!data) return;

    setGenerando(true);
    try {
      const perfilFiscal: EmpresaPerfil = perfil ?? {
        razonSocial: null,
        nit: null,
        direccion: null,
        representanteLegal: null,
        telefono: null,
        email: null,
      };

      const filas = mapearHojaTrabajoAFilas(data, perfilFiscal);
      const blob = await construirHoja(filas, COLUMNS_HOJA_TRABAJO);
      descargarBlob(blob, generarNombreArchivo('hoja-trabajo', rango));
    } finally {
      setGenerando(false);
    }
  }

  return (
    <PermissionButton
      permission={PERMISSIONS.contabilidad.eeff.read}
      deniedReason="No tenés permiso para exportar la Hoja de Trabajo"
      disabled={!data || generando}
      onClick={() => {
        void handleExportar();
      }}
    >
      {generando ? 'Generando…' : 'Exportar a Excel'}
    </PermissionButton>
  );
}
