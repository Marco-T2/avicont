import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';

/**
 * Celda de texto para la cabecera fiscal.
 * Definida localmente para no depender de construir-hoja.ts en este módulo.
 * El tipo completo Celda/CeldaTexto se exporta desde construir-hoja.ts y el index.
 */
interface CeldaTextoLocal {
  type: 'texto';
  value: string;
}

/**
 * Convierte el perfil fiscal de la organización en filas de cabecera para el informe Excel.
 *
 * - Los campos null se omiten (no generan fila).
 * - Nunca escribe la cadena literal "null".
 * - Nunca rompe ante cualquier combinación de campos null.
 *
 * Orden de campos: razonSocial, nit, direccion, representanteLegal, telefono, email.
 */
export function armarCabeceraFiscal(perfil: EmpresaPerfil): CeldaTextoLocal[][] {
  const campos: Array<string | null> = [
    perfil.razonSocial,
    perfil.nit,
    perfil.direccion,
    perfil.representanteLegal,
    perfil.telefono,
    perfil.email,
  ];

  return campos
    .filter((campo): campo is string => campo !== null)
    .map((campo) => [{ type: 'texto' as const, value: campo }]);
}
