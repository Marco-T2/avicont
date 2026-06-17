import { Text, View, StyleSheet } from '@react-pdf/renderer';

import type { Celda } from '@/lib/export-excel';

import { formatearMontoPdf } from '../formato-pdf';
import type { ColumnaPdf } from '../types';

const styles = StyleSheet.create({
  tabla: { borderTop: '1px solid #cccccc', borderLeft: '1px solid #cccccc' },
  fila: { flexDirection: 'row' },
  celda: {
    padding: 3,
    fontSize: 8,
    borderBottom: '1px solid #cccccc',
    borderRight: '1px solid #cccccc',
  },
});

interface Props {
  columnas: ColumnaPdf[];
  /** Matriz de celdas: fila 0 = encabezados; la negrita/alineación vienen en cada celda. */
  filas: Celda[][];
}

/**
 * Tabla genérica del informe PDF a partir de la matriz `Celda[][]`.
 *
 * - El ancho de cada columna se reparte por `flex` (proporcional).
 * - CeldaNumero: alineada a la derecha por default (§4.5 montos a la derecha) y
 *   formateada para presentación vía formatearMontoPdf — el value crudo nunca se opera.
 * - El `fontWeight: 'bold'` de la celda mapea a la fuente Helvetica-Bold.
 */
export function TablaPdf({ columnas, filas }: Props) {
  return (
    <View style={styles.tabla}>
      {filas.map((fila, i) => (
        <View key={`fila-${i}`} style={styles.fila} wrap={false}>
          {fila.map((celda, j) => {
            const flex = columnas[j]?.flex ?? 1;
            const align =
              celda.type === 'numero' ? (celda.align ?? 'right') : (celda.align ?? 'left');
            const texto = celda.type === 'numero' ? formatearMontoPdf(celda.value) : celda.value;
            return (
              <Text
                key={`celda-${i}-${j}`}
                style={[
                  styles.celda,
                  {
                    flexGrow: flex,
                    flexBasis: 0,
                    textAlign: align,
                    fontFamily: celda.fontWeight === 'bold' ? 'Helvetica-Bold' : 'Helvetica',
                  },
                ]}
              >
                {texto}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}
