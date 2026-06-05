import { useState } from 'react';

import { PermissionButton } from '@/components/shared/permission-button';
import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { construirHoja, descargarBlob, generarNombreArchivo } from '@/lib/export-excel';
import { PERMISSIONS } from '@/lib/permissions';
import type { LibroMayorResponse } from '@/types/api';

import { mapearLibroMayorAFilas } from '../lib/exportar-libro-mayor';

/** Columnas para el Libro Mayor (7 columnas: Fecha, Comprobante, Glosa, Debe, Haber, Saldo, Estado). */
const COLUMNS_LIBRO_MAYOR = [
  { width: 14 }, // Fecha
  { width: 18 }, // Comprobante
  { width: 40 }, // Glosa
  { width: 16 }, // Debe (BOB)
  { width: 16 }, // Haber (BOB)
  { width: 16 }, // Saldo (BOB)
  { width: 10 }, // Estado
];

interface Props {
  /** Datos del Libro Mayor ya cargados en cache (no re-fetchea). */
  data: LibroMayorResponse | undefined;
  /** Perfil fiscal de la organización para la cabecera del informe. */
  perfil: EmpresaPerfil | null | undefined;
  /** Rango de fechas/período para el nombre del archivo. */
  rango: string;
}

/**
 * Botón "Exportar a Excel" gateado por permiso contabilidad.libro-mayor.read.
 *
 * - Deshabilitado si no hay data (query aún sin resultado).
 * - Deshabilitado con tooltip si el usuario no tiene permiso (§14.7).
 * - Muestra "Generando…" mientras el await procesa (Anti-F-07).
 * - Consume la data ya cargada — NO re-fetchea el informe.
 */
export function BotonExportarLibroMayor({ data, perfil, rango }: Props): React.JSX.Element {
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

      const filas = mapearLibroMayorAFilas(data, perfilFiscal);
      const blob = await construirHoja(filas, COLUMNS_LIBRO_MAYOR);
      descargarBlob(blob, generarNombreArchivo('libro-mayor', rango));
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
      {generando ? 'Generando…' : 'Exportar a Excel'}
    </PermissionButton>
  );
}
