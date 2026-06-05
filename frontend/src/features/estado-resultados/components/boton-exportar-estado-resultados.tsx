import { useState } from 'react';

import { PermissionButton } from '@/components/shared/permission-button';
import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { construirHoja, descargarBlob, generarNombreArchivo } from '@/lib/export-excel';
import { PERMISSIONS } from '@/lib/permissions';
import type { EstadoResultadosResponse } from '@/types/api';

import { mapearEstadoResultadosAFilas } from '../lib/exportar-estado-resultados';

/** Columnas para el Estado de Resultados (2 columnas: Concepto, Saldo). */
const COLUMNS_EEFF = [
  { width: 60 }, // Concepto (con sangría jerárquica)
  { width: 18 }, // Saldo (BOB)
];

interface Props {
  /** Datos del Estado de Resultados ya cargados en cache (no re-fetchea). */
  data: EstadoResultadosResponse | undefined;
  /** Perfil fiscal de la organización para la cabecera del informe. */
  perfil: EmpresaPerfil | null | undefined;
  /** Rango de fechas para el nombre del archivo. */
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
export function BotonExportarEstadoResultados({ data, perfil, rango }: Props): React.JSX.Element {
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

      const filas = mapearEstadoResultadosAFilas(data, perfilFiscal);
      const blob = await construirHoja(filas, COLUMNS_EEFF);
      descargarBlob(blob, generarNombreArchivo('estado-resultados', rango));
    } finally {
      setGenerando(false);
    }
  }

  return (
    <PermissionButton
      permission={PERMISSIONS.contabilidad.eeff.read}
      deniedReason="No tenés permiso para exportar el Estado de Resultados"
      disabled={!data || generando}
      onClick={() => {
        void handleExportar();
      }}
    >
      {generando ? 'Generando…' : 'Exportar a Excel'}
    </PermissionButton>
  );
}
