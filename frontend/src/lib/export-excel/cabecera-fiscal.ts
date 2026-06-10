import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';

import type { CeldaTexto } from './construir-hoja';

/**
 * Mapa ordenado de campos del perfil fiscal a su etiqueta de presentación.
 * razonSocial: sin etiqueta (encabezado en negrita).
 * Resto: "Etiqueta: valor".
 */
const CAMPOS_FISCALES: ReadonlyArray<{
  etiqueta?: string;
  campo: keyof EmpresaPerfil;
}> = [
  { campo: 'razonSocial' },
  { campo: 'nit', etiqueta: 'NIT' },
  { campo: 'direccion', etiqueta: 'Dirección' },
  { campo: 'representanteLegal', etiqueta: 'Representante Legal' },
  { campo: 'telefono', etiqueta: 'Teléfono' },
  { campo: 'email', etiqueta: 'Email' },
];

/**
 * Convierte el perfil fiscal de la organización en filas de cabecera para el informe Excel.
 *
 * - Los campos null se omiten (no generan fila).
 * - Nunca escribe la cadena literal "null".
 * - Nunca rompe ante cualquier combinación de campos null.
 * - razonSocial: encabezado en negrita (fontWeight:'bold'), sin etiqueta.
 * - Demás campos: "Etiqueta: valor" (sin negrita).
 *
 * Orden de campos: razonSocial, nit, direccion, representanteLegal, telefono, email.
 */
export function armarCabeceraFiscal(perfil: EmpresaPerfil): CeldaTexto[][] {
  return CAMPOS_FISCALES
    .filter(({ campo }) => perfil[campo] !== null)
    .map(({ campo, etiqueta }) => {
      const valor = perfil[campo] as string;
      const value = etiqueta !== undefined ? `${etiqueta}: ${valor}` : valor;
      // Solo la razón social (sin etiqueta) lleva negrita — es el encabezado del informe
      const celda: CeldaTexto = etiqueta === undefined
        ? { type: 'texto', value, fontWeight: 'bold' }
        : { type: 'texto', value };
      return [celda];
    });
}
