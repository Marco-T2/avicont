import { useState } from 'react';

import { PermissionButton } from '@/components/shared/permission-button';
import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { construirHoja, descargarBlob, generarNombreArchivo } from '@/lib/export-excel';
import { PERMISSIONS } from '@/lib/permissions';
import type { EstadoFlujoEfectivoResponse } from '@/types/api';

import { mapearFlujoEfectivoAFilas } from '../lib/exportar-flujo-efectivo';

/** Columnas del EFE: Actividad + Línea + Tipo + Monto. */
const COLUMNS_EFE = [
  { width: 16 }, // Actividad
  { width: 40 }, // Línea
  { width: 28 }, // Tipo
  { width: 18 }, // Monto (BOB)
];

interface Props {
  /** Datos del EFE ya cargados en cache (no re-fetchea). */
  data: EstadoFlujoEfectivoResponse | undefined;
  /** Perfil fiscal de la organización para la cabecera del informe. */
  perfil: EmpresaPerfil | null | undefined;
}

/**
 * Botón "Exportar a Excel" del EFE, gateado por permiso contabilidad.eeff.read.
 *
 * - Deshabilitado si no hay data (query aún sin resultado).
 * - Deshabilitado con tooltip si el usuario no tiene permiso (§14.7).
 * - Muestra "Generando…" mientras el await procesa (Anti-F-07).
 * - Consume la data ya cargada — NO re-fetchea el informe.
 * - Nombre del archivo: `flujo-efectivo_<fechaDesde>_<fechaHasta>.xlsx`.
 *   Fechas tomadas del response sin conversión UTC (§4.6).
 */
export function BotonExportarFlujoEfectivo({ data, perfil }: Props): React.JSX.Element {
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

      const filas = mapearFlujoEfectivoAFilas(data, perfilFiscal);
      const blob = await construirHoja(filas, COLUMNS_EFE);
      // §4.6: fechaDesde/fechaHasta del response, sin conversión UTC
      const rango = `${data.fechaDesde}_${data.fechaHasta}`;
      descargarBlob(blob, generarNombreArchivo('flujo-efectivo', rango));
    } finally {
      setGenerando(false);
    }
  }

  return (
    <PermissionButton
      permission={PERMISSIONS.contabilidad.eeff.read}
      deniedReason="No tenés permiso para exportar el Estado de Flujo de Efectivo"
      disabled={!data || generando}
      onClick={() => {
        void handleExportar();
      }}
    >
      {generando ? 'Generando…' : 'Exportar a Excel'}
    </PermissionButton>
  );
}
