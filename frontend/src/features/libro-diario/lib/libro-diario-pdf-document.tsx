import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { CabeceraFiscalPdf, formatearMontoPdf } from '@/lib/export-pdf';

import type { AsientoPdf, LibroDiarioPdfModelo } from './exportar-libro-diario-pdf';

/**
 * Componentes react-pdf del Libro Diario AGRUPADO por comprobante.
 *
 * Vive separado del builder (`construir-libro-diario-pdf`) para cumplir la regla
 * react-refresh/only-export-components (este archivo SOLO exporta componentes) y
 * para espejar la separación de `lib/export-pdf` (componentes vs. builder).
 *
 * §4.5: los montos se formatean para presentación con formatearMontoPdf; el value
 * crudo del backend nunca se opera. §4.6: la fecha ya viene formateada del modelo.
 */

// Anchos relativos de las 4 columnas: Código | Detalle | Debe | Haber.
const COLS = [
  { flex: 16, align: 'left' as const },
  { flex: 52, align: 'left' as const },
  { flex: 16, align: 'right' as const },
  { flex: 16, align: 'right' as const },
];

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: 'Helvetica', color: '#1a1a1a' },
  titulo: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  subtitulo: { fontSize: 9, color: '#666666', marginBottom: 10 },
  cabeceraInforme: { marginBottom: 6 },

  encabezadoCols: {
    flexDirection: 'row',
    borderTop: '1px solid #333333',
    borderBottom: '1px solid #333333',
    backgroundColor: '#f0f0f0',
  },
  th: { padding: 4, fontSize: 8, fontFamily: 'Helvetica-Bold' },

  comprobante: {
    flexDirection: 'row',
    marginTop: 8,
    paddingBottom: 2,
    borderBottom: '1px solid #cccccc',
  },
  comprobanteTipo: { fontSize: 9, fontFamily: 'Helvetica-BoldOblique', flexGrow: 1, flexBasis: 0 },
  comprobanteFecha: { fontSize: 9, fontFamily: 'Helvetica-BoldOblique', textAlign: 'right' },
  anulado: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#b91c1c' },

  fila: { flexDirection: 'row' },
  celda: { paddingHorizontal: 4, paddingVertical: 2, fontSize: 8 },
  bold: { fontFamily: 'Helvetica-Bold' },

  totales: { flexDirection: 'row', borderTop: '1px solid #999999', marginTop: 1 },
  glosa: { fontSize: 8, marginTop: 3, marginBottom: 2 },
  glosaLabel: { fontFamily: 'Helvetica-Bold' },

  granTotal: { flexDirection: 'row', borderTop: '2px solid #333333', marginTop: 10 },
});

interface CeldaProps {
  col: number;
  texto: string;
  bold?: boolean;
}

/** Celda de una de las 4 columnas, con su ancho y alineación predefinidos. */
function Celda({ col, texto, bold = false }: CeldaProps): React.JSX.Element {
  const { flex, align } = COLS[col]!;
  return (
    <Text
      style={[
        styles.celda,
        { flexGrow: flex, flexBasis: 0, textAlign: align },
        ...(bold ? [styles.bold] : []),
      ]}
    >
      {texto}
    </Text>
  );
}

/** Fila full-width "etiqueta + montos" alineada a la columna Debe/Haber (Totales / TOTAL). */
function FilaTotales({
  etiqueta,
  debe,
  haber,
  estilo,
}: {
  etiqueta: string;
  debe: string;
  haber: string;
  estilo: (typeof styles)[keyof typeof styles];
}): React.JSX.Element {
  return (
    <View style={estilo} wrap={false}>
      <Celda col={0} texto="" />
      <Text
        style={[
          styles.celda,
          { flexGrow: COLS[1]!.flex, flexBasis: 0, textAlign: 'right' },
          styles.bold,
        ]}
      >
        {etiqueta}
      </Text>
      <Celda col={2} texto={formatearMontoPdf(debe)} bold />
      <Celda col={3} texto={formatearMontoPdf(haber)} bold />
    </View>
  );
}

/** Encabezado del comprobante: "Comprobante de {tipo}   Nro.: {numero}" + fecha (y marca de anulado). */
function EncabezadoComprobante({ asiento }: { asiento: AsientoPdf }): React.JSX.Element {
  return (
    <View style={styles.comprobante} wrap={false}>
      <Text style={styles.comprobanteTipo}>
        {`Comprobante de ${asiento.tipoLabel}   Nro.: ${asiento.numero}`}
        {asiento.anulado ? <Text style={styles.anulado}>{'   (ANULADO)'}</Text> : null}
      </Text>
      <Text style={styles.comprobanteFecha}>{asiento.fecha}</Text>
    </View>
  );
}

/** Un comprobante completo: encabezado → líneas → subtotal → glosa. */
function GrupoComprobante({ asiento }: { asiento: AsientoPdf }): React.JSX.Element {
  return (
    <View>
      <EncabezadoComprobante asiento={asiento} />

      {asiento.filas.map((fila, i) => (
        <View key={`linea-${i}`} style={styles.fila} wrap={false}>
          <Celda col={0} texto={fila.codigo} />
          <Celda col={1} texto={fila.nombre} />
          <Celda col={2} texto={formatearMontoPdf(fila.debe)} />
          <Celda col={3} texto={formatearMontoPdf(fila.haber)} />
        </View>
      ))}

      <FilaTotales
        etiqueta="Totales:"
        debe={asiento.totalDebe}
        haber={asiento.totalHaber}
        estilo={styles.totales}
      />

      <Text style={styles.glosa}>
        <Text style={styles.glosaLabel}>Glosa: </Text>
        {asiento.glosa}
      </Text>
    </View>
  );
}

export interface LibroDiarioPdfDocumentProps {
  titulo: string;
  subtitulo: string;
  perfil: EmpresaPerfil;
  modelo: LibroDiarioPdfModelo;
}

/**
 * Documento PDF del Libro Diario agrupado por comprobante (portrait).
 *
 * Los encabezados de columna se marcan `fixed` para repetirse en cada página del
 * informe multi-página.
 */
export function LibroDiarioPdfDocument({
  titulo,
  subtitulo,
  perfil,
  modelo,
}: LibroDiarioPdfDocumentProps): React.JSX.Element {
  return (
    <Document>
      <Page size="A4" orientation="portrait" style={styles.page}>
        <CabeceraFiscalPdf perfil={perfil} />
        <View style={styles.cabeceraInforme}>
          <Text style={styles.titulo}>{titulo}</Text>
          <Text style={styles.subtitulo}>{subtitulo}</Text>
        </View>

        <View style={styles.encabezadoCols} fixed>
          <Text style={[styles.th, { flexGrow: COLS[0]!.flex, flexBasis: 0 }]}>Código</Text>
          <Text style={[styles.th, { flexGrow: COLS[1]!.flex, flexBasis: 0 }]}>Detalle</Text>
          <Text style={[styles.th, { flexGrow: COLS[2]!.flex, flexBasis: 0, textAlign: 'right' }]}>
            Debe
          </Text>
          <Text style={[styles.th, { flexGrow: COLS[3]!.flex, flexBasis: 0, textAlign: 'right' }]}>
            Haber
          </Text>
        </View>

        {modelo.asientos.map((asiento, i) => (
          <GrupoComprobante key={`asiento-${i}`} asiento={asiento} />
        ))}

        <FilaTotales
          etiqueta="TOTAL:"
          debe={modelo.totalDebe}
          haber={modelo.totalHaber}
          estilo={styles.granTotal}
        />
      </Page>
    </Document>
  );
}
