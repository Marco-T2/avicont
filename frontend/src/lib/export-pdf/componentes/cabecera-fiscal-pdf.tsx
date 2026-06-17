import { Text, View, StyleSheet } from '@react-pdf/renderer';

import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';

/**
 * Mapa ordenado de campos del perfil fiscal a su etiqueta (espeja el del Excel).
 * razonSocial: encabezado en negrita, sin etiqueta. Resto: "Etiqueta: valor".
 */
const CAMPOS_FISCALES: ReadonlyArray<{ etiqueta?: string; campo: keyof EmpresaPerfil }> = [
  { campo: 'razonSocial' },
  { campo: 'nit', etiqueta: 'NIT' },
  { campo: 'direccion', etiqueta: 'Dirección' },
  { campo: 'representanteLegal', etiqueta: 'Representante Legal' },
  { campo: 'telefono', etiqueta: 'Teléfono' },
  { campo: 'email', etiqueta: 'Email' },
];

const styles = StyleSheet.create({
  bloque: { marginBottom: 12 },
  razonSocial: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  campo: { fontSize: 9, color: '#444444' },
});

interface Props {
  perfil: EmpresaPerfil;
}

/**
 * Bloque full-width de cabecera fiscal del informe.
 *
 * - Campos null se omiten (no se imprime "null").
 * - razonSocial va como encabezado en negrita; el resto como "Etiqueta: valor".
 */
export function CabeceraFiscalPdf({ perfil }: Props) {
  const campos = CAMPOS_FISCALES.filter(({ campo }) => perfil[campo] !== null);

  return (
    <View style={styles.bloque}>
      {campos.map(({ campo, etiqueta }) => {
        const valor = perfil[campo] as string;
        if (etiqueta === undefined) {
          return (
            <Text key={campo} style={styles.razonSocial}>
              {valor}
            </Text>
          );
        }
        return (
          <Text key={campo} style={styles.campo}>
            {`${etiqueta}: ${valor}`}
          </Text>
        );
      })}
    </View>
  );
}
