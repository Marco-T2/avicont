/**
 * "XLSX core-compartido" (design §4.5): UNA clase parametrizada por un
 * `DialectoXlsx`, instanciada una vez por perfil (BancoSol, Económico — y en
 * el futuro Unión, si el motor le alcanza). Cero ramas por banco: todo lo
 * que varía entre bancos vive en el objeto `DialectoXlsx`.
 *
 * `reconoce()` NO puede discriminar BancoSol de Económico solo por las
 * etiquetas de columna — comparten generador, columnas idénticas (design
 * §4.5). El discriminador estructural real es el TIPO de la celda `Fecha`
 * de la primera fila de datos: `Date` nativo (BancoSol, celda con formato de
 * fecha en Excel) vs `string` de texto (Económico, `DD/Mmm/YYYY` sin formato
 * de fecha) — ver `leer-matriz-xlsx.ts` para la evidencia del descubrimiento.
 */
import type { LadoBancario, Moneda } from '@prisma/client';

import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';

import { ArchivoFormatoNoReconocidoError } from '../domain/importacion-errors';
import { normalizarDescripcion as normalizarParaBusqueda } from '../domain/normalizar-descripcion';
import type {
  DescriptorPerfilExtracto,
  ExtractoParseado,
  MovimientoParseado,
} from '../ports/extracto-parser.port';
import { ExtractoParserPort } from '../ports/extracto-parser.port';
import type { DialectoXlsx } from './dialectos/dialecto-xlsx';
import { leerMontoCelda } from './parsing/dinero';
import type { FechaLeida } from './parsing/fechas';
import { leerFechaCelda } from './parsing/fechas';
import { buscarFilaEncabezados, buscarValorDeEtiqueta } from './xlsx/escaneo-cabecera';
import { extraerNumeroCuenta } from './xlsx/extraer-numero-cuenta';
import type { CeldaCruda, FilaCruda } from './xlsx/leer-matriz-xlsx';
import { leerMatrizXlsx } from './xlsx/leer-matriz-xlsx';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Convierte un `Date` YA resuelto por `read-excel-file` (celda con formato
 * de fecha de Excel) directamente a `FechaContable` + hora, vía los getters
 * UTC — sin re-serializar a string ni volver a pasar por la aritmética de
 * época (evita el ruido de precisión de un round-trip float, ver
 * `leer-matriz-xlsx.ts`). `FechaContable.of` sigue siendo la única
 * autoridad de validación de calendario.
 */
function fechaDesdeDateExcel(date: Date): FechaLeida {
  const fecha = FechaContable.of(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  const hora = [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()].map(pad2).join(':');
  return { fecha, hora };
}

function leerFechaDeCelda(cruda: CeldaCruda, dialecto: DialectoXlsx): FechaLeida {
  if (cruda instanceof Date) return fechaDesdeDateExcel(cruda);
  if (typeof cruda === 'string') return leerFechaCelda(cruda, dialecto.dialectoFecha);
  throw new ArchivoFormatoNoReconocidoError(
    `celda de fecha con tipo inesperado (${typeof cruda}) en la fila de movimientos`,
  );
}

function celdaAString(cruda: CeldaCruda): string | null {
  if (cruda === null) return null;
  if (cruda instanceof Date) return cruda.toISOString();
  if (typeof cruda === 'boolean') return String(cruda);
  return cruda;
}

function etiquetasRequeridas(dialecto: DialectoXlsx): string[] {
  const base = [dialecto.etiquetaFecha, dialecto.etiquetaMonto, dialecto.etiquetaSaldo];
  if (dialecto.etiquetaHora !== undefined) base.push(dialecto.etiquetaHora);
  if (dialecto.etiquetaReferencia !== undefined) base.push(dialecto.etiquetaReferencia);
  return [...base, ...dialecto.columnasDescripcion];
}

/** Lee el valor de `etiqueta` en `fila` usando el mapa de columnas del header. Null si la etiqueta no aplica a este dialecto. */
function valorColumna(
  fila: FilaCruda,
  columnas: ReadonlyMap<string, number>,
  etiqueta: string | undefined,
): CeldaCruda {
  if (etiqueta === undefined) return null;
  // El mapa de columnas usa la misma normalización que `buscarFilaEncabezados`.
  const idx = columnas.get(normalizarParaBusqueda(etiqueta));
  if (idx === undefined) return null;
  return fila[idx] ?? null;
}

export class XlsxCoreExtractoParser extends ExtractoParserPort {
  constructor(private readonly dialecto: DialectoXlsx) {
    super();
  }

  get descriptor(): DescriptorPerfilExtracto {
    const d = this.dialecto;
    return {
      perfil: d.perfil,
      banco: d.banco,
      formato: d.formato,
      extensiones: ['.xlsx'],
      mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      estrategiaChecksum: d.estrategiaChecksum,
      soportaContraparte: d.soportaContraparte,
      soportaHora: d.soportaHora,
      exponeNumeroCuenta: d.exponeNumeroCuenta,
      instruccionesDescarga: d.instruccionesDescarga,
      ...(d.advertencia !== undefined ? { advertencia: d.advertencia } : {}),
    };
  }

  async reconoce(buffer: Buffer): Promise<boolean> {
    const matriz = await leerMatrizXlsx(buffer);
    const encabezados = buscarFilaEncabezados(
      matriz,
      etiquetasRequeridas(this.dialecto),
      this.dialecto.filasMaxEscaneoEncabezados,
    );
    if (!encabezados) return false;

    const primeraFilaDatos = matriz[encabezados.indiceFila + 1];
    const columnaFecha = encabezados.columnas.get(
      normalizarParaBusqueda(this.dialecto.etiquetaFecha),
    );
    if (!primeraFilaDatos || columnaFecha === undefined) return true; // sin filas de datos: headers ya son suficientes

    const celdaFecha = primeraFilaDatos[columnaFecha] ?? null;
    if (celdaFecha === null) return true; // fila en blanco al pie de la tabla — no descarta el reconocimiento

    if (this.dialecto.tipoCeldaFecha === 'DATE_EXCEL') {
      return celdaFecha instanceof Date;
    }
    return typeof celdaFecha === 'string';
  }

  async parse(buffer: Buffer): Promise<ExtractoParseado> {
    const d = this.dialecto;
    const matriz = await leerMatrizXlsx(buffer);
    const encabezados = buscarFilaEncabezados(
      matriz,
      etiquetasRequeridas(d),
      d.filasMaxEscaneoEncabezados,
    );
    if (!encabezados) {
      throw new ArchivoFormatoNoReconocidoError(
        `no se encontró la fila de encabezados esperada para el perfil ${d.perfil}`,
      );
    }

    const filasDatos = matriz.slice(encabezados.indiceFila + 1);
    const movimientos: MovimientoParseado[] = [];

    for (const fila of filasDatos) {
      const celdaFecha = valorColumna(fila, encabezados.columnas, d.etiquetaFecha);
      // Fin de la tabla de movimientos: la PRIMERA fila en blanco en la
      // columna Fecha la marca (bug real hallado en slice 4 — Unión). No
      // alcanza con `continue`: su bloque de totales al pie reutiliza la
      // MISMA columna que "Fecha Movimiento" para etiquetas ("Total
      // Créditos:", "Tránsito", …) — seguir escaneando tras la fila en
      // blanco intentaría parsear esas etiquetas como fecha y reventaría
      // (o, peor, las leería como datos si alguna vez calzaran el formato).
      // BancoSol/Económico no tienen filas en blanco tras el header (data
      // corrida hasta EOF, verificado en los 4 fixtures reales) — `break`
      // es equivalente a `continue` para ellos, cero cambio de conducta.
      if (celdaFecha === null) break;

      const { fecha, hora: horaDeCeldaFecha } = leerFechaDeCelda(celdaFecha, d);
      // TEXTO_ES_DD_MMM_YYYY (Económico) no trae hora embebida en la celda
      // Fecha — viene en una columna 'Hora' separada, ya como string
      // 'HH:MM:SS'. SERIAL_EXCEL (BancoSol) ya la trae en `horaDeCeldaFecha`.
      const celdaHoraSeparada = valorColumna(fila, encabezados.columnas, d.etiquetaHora);
      const hora =
        horaDeCeldaFecha ?? (typeof celdaHoraSeparada === 'string' ? celdaHoraSeparada : null);

      const celdaMonto = valorColumna(fila, encabezados.columnas, d.etiquetaMonto);
      if (typeof celdaMonto !== 'string') {
        throw new ArchivoFormatoNoReconocidoError('la celda de Monto no es un valor numérico');
      }
      const { monto, tipo } = leerMontoCelda(celdaMonto, d.dialectoMonto);

      const celdaSaldo = valorColumna(fila, encabezados.columnas, d.etiquetaSaldo);
      const saldo =
        typeof celdaSaldo === 'string' ? leerSaldoCelda(celdaSaldo, d.dialectoMonto) : null;

      const celdaReferencia = valorColumna(fila, encabezados.columnas, d.etiquetaReferencia);
      const referencia = typeof celdaReferencia === 'string' ? celdaReferencia : null;

      const descripcion = d.columnasDescripcion
        .map((etiqueta) => {
          const v = valorColumna(fila, encabezados.columnas, etiqueta);
          return typeof v === 'string' ? v : '';
        })
        .join(' ');

      const datosOriginales: Record<string, string | null> = {};
      for (const [etiquetaNormalizada, idx] of encabezados.columnas) {
        datosOriginales[etiquetaNormalizada] = celdaAString(fila[idx] ?? null);
      }

      movimientos.push({
        fecha,
        hora: d.soportaHora ? hora : null,
        monto,
        tipo: tipo as LadoBancario,
        descripcion,
        referencia,
        saldo,
        contraparteNombre: null,
        contraparteDocumento: null,
        datosOriginales,
      });
    }

    const cobertura = calcularCobertura(movimientos);

    let saldoInicialDeclarado: Money | null = null;
    let saldoFinalDeclarado: Money | null = null;
    if (d.etiquetasSaldoDeclarado) {
      const inicialRaw = buscarValorDeEtiqueta(
        matriz,
        d.etiquetasSaldoDeclarado.inicial,
        d.filasMaxBloqueCabecera,
      );
      const finalRaw = buscarValorDeEtiqueta(
        matriz,
        d.etiquetasSaldoDeclarado.final,
        d.filasMaxBloqueCabecera,
      );
      if (typeof inicialRaw === 'string') {
        saldoInicialDeclarado = leerSaldoCelda(inicialRaw, d.dialectoMonto);
      }
      if (typeof finalRaw === 'string') {
        saldoFinalDeclarado = leerSaldoCelda(finalRaw, d.dialectoMonto);
      }
    }

    const numeroCuentaDeclarado = d.exponeNumeroCuenta
      ? extraerNumeroCuenta(matriz, d.numeroCuenta, d.filasMaxBloqueCabecera)
      : null;

    return {
      movimientos,
      cobertura,
      saldoInicialDeclarado,
      saldoFinalDeclarado,
      monedaDeclarada: null as Moneda | null,
      numeroCuentaDeclarado,
    };
  }
}

/**
 * El saldo corrido puede ser negativo (sobregiro) — a diferencia del monto
 * del movimiento (SIEMPRE positivo, el signo se traduce a `tipo`), el saldo
 * conserva su signo. Reusa `leerMontoCelda` para el trabajo de limpieza
 * (prefijo de moneda, separador de miles/decimal) y reconstituye el signo.
 */
function leerSaldoCelda(raw: string, dialectoMonto: Parameters<typeof leerMontoCelda>[1]): Money {
  const { monto, tipo } = leerMontoCelda(raw, dialectoMonto);
  return tipo === 'DEBITO' ? monto.mul(-1) : monto;
}

function calcularCobertura(
  movimientos: readonly MovimientoParseado[],
): ExtractoParseado['cobertura'] {
  if (movimientos.length === 0) {
    const hoy = FechaContable.of(1900, 1, 1);
    return { desde: hoy, hasta: hoy, declarada: false };
  }
  let desde = movimientos[0]!.fecha;
  let hasta = movimientos[0]!.fecha;
  for (const m of movimientos) {
    if (m.fecha.isBefore(desde)) desde = m.fecha;
    if (m.fecha.isAfter(hasta)) hasta = m.fecha;
  }
  return { desde, hasta, declarada: false };
}
