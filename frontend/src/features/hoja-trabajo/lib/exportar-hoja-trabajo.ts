import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { armarCabeceraFiscal } from '@/lib/export-excel';
import type { Celda, ColumnaHoja } from '@/lib/export-excel';
import type { HojaTrabajoResponse } from '@/types/api';

/**
 * Columnas de la Hoja de Trabajo (14 columnas: 2 de etiqueta + 12 de montos
 * agrupadas en 6 pares: Sumas / Saldos / Ajustes / Saldos Ajustados /
 * Estado de Resultados / Balance General).
 */
export const COLUMNS_HOJA_TRABAJO: ColumnaHoja[] = [
  { width: 12 }, // Código
  { width: 36 }, // Cuenta
  { width: 14 }, // Sumas Debe
  { width: 14 }, // Sumas Haber
  { width: 14 }, // Saldo Deudor
  { width: 14 }, // Saldo Acreedor
  { width: 14 }, // Ajustes Debe
  { width: 14 }, // Ajustes Haber
  { width: 15 }, // Saldo Ajustado Deudor
  { width: 15 }, // Saldo Ajustado Acreedor
  { width: 14 }, // ER Pérdidas
  { width: 14 }, // ER Ganancias
  { width: 14 }, // BG Activo
  { width: 16 }, // BG Pasivo-Patrimonio
];

const ENCABEZADOS: string[] = [
  'Código',
  'Cuenta',
  'Sumas Debe',
  'Sumas Haber',
  'Saldo Deudor',
  'Saldo Acreedor',
  'Ajustes Debe',
  'Ajustes Haber',
  'Saldo Aj. Deudor',
  'Saldo Aj. Acreedor',
  'ER Pérdidas',
  'ER Ganancias',
  'BG Activo',
  'BG Pasivo-Patrimonio',
];

/**
 * Mapea una respuesta de la Hoja de Trabajo a la matriz de celdas Excel.
 *
 * Estructura del resultado:
 * 1. Filas de cabecera fiscal (armarCabeceraFiscal — tolera null por campo).
 * 2. Fila de encabezados de columna (negrita).
 * 3. Una fila por cuenta de detalle con movimiento, INCLUIDA la fila sintética
 *    de Utilidad/Pérdida del Ejercicio (`esSintetica=true`).
 * 4. Fila de TOTALES (las 12 columnas de montos en negrita).
 * 5. Bloque de control de cuadre: los 6 cuadres con su diferencia (REQ-HT).
 * 6. Sección opcional "naturaleza opuesta" si hay cuentas a revisar.
 *
 * §4.5: todos los montos se pasan como CeldaNumero con el string del backend.
 * El builder (construir-hoja) hace el único boundary string→Number. NUNCA se
 * acumula en cliente: totales y diferencias son la verdad del backend.
 */
export function mapearHojaTrabajoAFilas(
  response: HojaTrabajoResponse,
  perfil: EmpresaPerfil,
): Celda[][] {
  const filas: Celda[][] = [];

  // 1. Cabecera fiscal (campos no-null del perfil)
  filas.push(...armarCabeceraFiscal(perfil));

  // 2. Encabezados de columna
  filas.push(ENCABEZADOS.map((value) => ({ type: 'texto', value, fontWeight: 'bold' })));

  // 3. Líneas de detalle (incluye la fila sintética). codigoInterno null → '' (§null-safe).
  for (const l of response.lineas) {
    filas.push([
      { type: 'texto', value: l.codigoInterno ?? '' },
      { type: 'texto', value: l.nombre },
      { type: 'numero', value: l.sumasDebe },
      { type: 'numero', value: l.sumasHaber },
      { type: 'numero', value: l.saldoDeudor },
      { type: 'numero', value: l.saldoAcreedor },
      { type: 'numero', value: l.ajustesDebe },
      { type: 'numero', value: l.ajustesHaber },
      { type: 'numero', value: l.saldoAjustadoDeudor },
      { type: 'numero', value: l.saldoAjustadoAcreedor },
      { type: 'numero', value: l.erPerdidas },
      { type: 'numero', value: l.erGanancias },
      { type: 'numero', value: l.bgActivo },
      { type: 'numero', value: l.bgPasPat },
    ]);
  }

  // 4. Totales de las 12 columnas (valores del backend, sin recalcular)
  const t = response.totales;
  filas.push([
    { type: 'texto', value: 'TOTALES', fontWeight: 'bold' },
    { type: 'texto', value: '' },
    { type: 'numero', value: t.sumasDebe, fontWeight: 'bold' },
    { type: 'numero', value: t.sumasHaber, fontWeight: 'bold' },
    { type: 'numero', value: t.saldoDeudor, fontWeight: 'bold' },
    { type: 'numero', value: t.saldoAcreedor, fontWeight: 'bold' },
    { type: 'numero', value: t.ajustesDebe, fontWeight: 'bold' },
    { type: 'numero', value: t.ajustesHaber, fontWeight: 'bold' },
    { type: 'numero', value: t.saldoAjustadoDeudor, fontWeight: 'bold' },
    { type: 'numero', value: t.saldoAjustadoAcreedor, fontWeight: 'bold' },
    { type: 'numero', value: t.perdidas, fontWeight: 'bold' },
    { type: 'numero', value: t.ganancias, fontWeight: 'bold' },
    { type: 'numero', value: t.activo, fontWeight: 'bold' },
    { type: 'numero', value: t.pasivoPatrimonio, fontWeight: 'bold' },
  ]);

  // 5. Control de cuadre: estado global + los 6 cuadres con su diferencia.
  const c = response.cuadres;
  filas.push([{ type: 'texto', value: '' }]); // espaciador
  filas.push([
    { type: 'texto', value: c.cuadra ? '✓ Cuadra' : '✗ No cuadra', fontWeight: 'bold' },
    { type: 'texto', value: 'Control de cuadre (±Bs 0.01)', fontWeight: 'bold' },
  ]);
  const cuadres: ReadonlyArray<[string, boolean, string]> = [
    ['Sumas', c.cuadraSumas, c.diferenciaSumas],
    ['Saldos', c.cuadraSaldos, c.diferenciaSaldos],
    ['Ajustes', c.cuadraAjustes, c.diferenciaAjustes],
    ['Saldos ajustados', c.cuadraSaldosAjustados, c.diferenciaSaldosAjustados],
    ['Estado de Resultados', c.cuadraEstadoResultados, c.diferenciaEstadoResultados],
    ['Balance General', c.cuadraBalanceGeneral, c.diferenciaBalanceGeneral],
  ];
  for (const [etiqueta, ok, diferencia] of cuadres) {
    filas.push([
      { type: 'texto', value: etiqueta },
      { type: 'texto', value: ok ? '✓ Cuadra' : '✗ No cuadra' },
      { type: 'numero', value: diferencia },
    ]);
  }

  // 6. Cuentas con saldo de naturaleza opuesta: señal de calidad para el contador.
  if (response.cuentasNaturalezaOpuesta.length > 0) {
    filas.push([{ type: 'texto', value: '' }]); // espaciador
    filas.push([
      {
        type: 'texto',
        value: 'CUENTAS CON SALDO DE NATURALEZA OPUESTA (revisar)',
        fontWeight: 'bold',
      },
    ]);
    filas.push([
      { type: 'texto', value: 'Código', fontWeight: 'bold' },
      { type: 'texto', value: 'Cuenta', fontWeight: 'bold' },
      { type: 'texto', value: 'Naturaleza', fontWeight: 'bold' },
      { type: 'texto', value: 'Saldo opuesto', fontWeight: 'bold' },
    ]);
    for (const cuenta of response.cuentasNaturalezaOpuesta) {
      filas.push([
        { type: 'texto', value: cuenta.codigoInterno },
        { type: 'texto', value: cuenta.nombre },
        { type: 'texto', value: cuenta.naturaleza },
        { type: 'numero', value: cuenta.saldoOpuesto },
      ]);
    }
  }

  return filas;
}
