import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';

import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import type { Celda } from '@/lib/export-excel';

import { CabeceraFiscalPdf } from './componentes/cabecera-fiscal-pdf';
import { TablaPdf } from './componentes/tabla-pdf';
import type { ColumnaPdf, OrientacionPdf } from './types';

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: 'Helvetica', color: '#1a1a1a' },
  titulo: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  subtitulo: { fontSize: 9, color: '#666666', marginBottom: 12 },
  cabeceraInforme: { marginBottom: 4 },
});

export interface ConstruirReportePdfParams {
  /** Título del informe (ej. "Libro Diario"). */
  titulo: string;
  /** Subtítulo: rango/período legible (ej. "01/06/2026 — 30/06/2026"). */
  subtitulo: string;
  /** Perfil fiscal para la cabecera del informe (campos null se omiten). */
  perfil: EmpresaPerfil;
  /** Columnas con su reparto de ancho (flex). */
  columnas: ColumnaPdf[];
  /** Cuerpo del informe: fila 0 = encabezados de columna. */
  filas: Celda[][];
  /** Orientación de la página. Default 'portrait'; usar 'landscape' en tablas anchas. */
  orientacion?: OrientacionPdf;
}

/**
 * Ensambla un informe contable en PDF y devuelve su Blob.
 *
 * Render frontend-puro (§ decisión PDF = FREE): los números ya vienen computados
 * del backend; este builder solo MAQUETA. No realiza aritmética de dominio.
 *
 * Este módulo importa `@react-pdf/renderer` (pesado) — debe consumirse vía
 * dynamic import desde el handler del botón para no entrar al chunk de la ruta.
 */
export async function construirReportePdf(params: ConstruirReportePdfParams): Promise<Blob> {
  const { titulo, subtitulo, perfil, columnas, filas, orientacion = 'portrait' } = params;

  const documento = (
    <Document>
      <Page size="A4" orientation={orientacion} style={styles.page}>
        <CabeceraFiscalPdf perfil={perfil} />
        <View style={styles.cabeceraInforme}>
          <Text style={styles.titulo}>{titulo}</Text>
          <Text style={styles.subtitulo}>{subtitulo}</Text>
        </View>
        <TablaPdf columnas={columnas} filas={filas} />
      </Page>
    </Document>
  );

  return pdf(documento).toBlob();
}
