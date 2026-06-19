import { useState } from 'react';

import { PermissionButton } from '@/components/shared/permission-button';
import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { construirHoja, descargarBlob, generarNombreArchivo } from '@/lib/export-excel';
import { PERMISSIONS } from '@/lib/permissions';
import type { LibroDiarioResponse } from '@/types/api';

import { mapearLibroDiarioAFilas } from '../lib/exportar-libro-diario';

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

/**
 * Botón "Exportar a Excel" gateado por permiso contabilidad.libro-diario.read.
 *
 * - Deshabilitado si no hay data (query aún sin resultado).
 * - Deshabilitado con tooltip si el usuario no tiene permiso (§14.7).
 * - Muestra "Generando…" mientras el await procesa (Anti-F-07).
 * - Consume la data ya cargada — NO re-fetchea el informe.
 * - Usa el perfil fiscal del hook useEmpresa (pasado por prop desde la página).
 */
export function BotonExportarLibroDiario({
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
      // Perfil fiscal nullable — armarCabeceraFiscal tolera todos los campos null
      const perfilFiscal: EmpresaPerfil = perfil ?? {
        razonSocial: null,
        nit: null,
        direccion: null,
        representanteLegal: null,
        telefono: null,
        email: null,
      };

      const filas = mapearLibroDiarioAFilas(data, perfilFiscal, cuentaFiltro);
      const blob = await construirHoja(filas);
      descargarBlob(blob, generarNombreArchivo('libro-diario', rango));
    } finally {
      setGenerando(false);
    }
  }

  return (
    <PermissionButton
      permission={PERMISSIONS.contabilidad.libroDiario.read}
      deniedReason="No tenés permiso para exportar el Libro Diario"
      // El botón también se deshabilita si no hay datos para exportar
      disabled={!data || generando}
      onClick={() => {
        void handleExportar();
      }}
    >
      {generando ? 'Generando…' : 'Exportar a Excel'}
    </PermissionButton>
  );
}
