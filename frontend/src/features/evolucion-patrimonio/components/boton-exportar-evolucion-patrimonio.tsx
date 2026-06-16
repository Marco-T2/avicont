import { useState } from 'react';

import { PermissionButton } from '@/components/shared/permission-button';
import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { construirHoja, descargarBlob, generarNombreArchivo } from '@/lib/export-excel';
import { PERMISSIONS } from '@/lib/permissions';
import type { EvolucionPatrimonioResponse } from '@/types/api';

import { mapearEvolucionPatrimonioAFilas } from '../lib/exportar-evolucion-patrimonio';

/** Columnas del EEPN: Componente + 4 columnas de montos. */
const COLUMNS_EEPN = [
  { width: 40 }, // Componente
  { width: 18 }, // Saldo inicial
  { width: 22 }, // Resultado del ejercicio
  { width: 20 }, // Otros movimientos
  { width: 18 }, // Saldo final
];

interface Props {
  /** Datos del EEPN ya cargados en cache (no re-fetchea). */
  data: EvolucionPatrimonioResponse | undefined;
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
export function BotonExportarEvolucionPatrimonio({ data, perfil, rango }: Props): React.JSX.Element {
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

      const filas = mapearEvolucionPatrimonioAFilas(data, perfilFiscal);
      const blob = await construirHoja(filas, COLUMNS_EEPN);
      descargarBlob(blob, generarNombreArchivo('evolucion-patrimonio', rango));
    } finally {
      setGenerando(false);
    }
  }

  return (
    <PermissionButton
      permission={PERMISSIONS.contabilidad.eeff.read}
      deniedReason="No tenés permiso para exportar la Evolución del Patrimonio"
      disabled={!data || generando}
      onClick={() => {
        void handleExportar();
      }}
    >
      {generando ? 'Generando…' : 'Exportar a Excel'}
    </PermissionButton>
  );
}
