import { describe, expect, it } from 'vitest';

import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import type { ComprobanteListItem } from '@/types/api';

import { mapearComprobantesAFilas } from './exportar-comprobantes';

// ============================================================
// Fixtures
// ============================================================

const perfilCompleto: EmpresaPerfil = {
  razonSocial: 'Avicont S.R.L.',
  nit: '1234567',
  direccion: 'Av. Siempre Viva 123',
  representanteLegal: 'Juan Pérez',
  telefono: '+591 70000000',
  email: 'admin@avicont.bo',
};

const perfilTodoNull: EmpresaPerfil = {
  razonSocial: null,
  nit: null,
  direccion: null,
  representanteLegal: null,
  telefono: null,
  email: null,
};

function crearItem(overrides?: Partial<ComprobanteListItem>): ComprobanteListItem {
  return {
    id: 'comp-1',
    tipo: 'DIARIO',
    numero: 'D2604-000001',
    estado: 'CONTABILIZADO',
    fechaContable: '2026-04-22',
    periodoFiscalId: 'periodo-1',
    glosa: 'Venta al contado',
    monedaPrincipal: 'BOB',
    tipoCambioReexpresion: '1.00000000',
    totalDebitoBob: '1250.50',
    totalCreditoBob: '1250.50',
    anulado: false,
    fechaAnulacion: null,
    anuladoPorUserId: null,
    motivoAnulacion: null,
    createdByUserId: 'user-1',
    createdAt: '2026-04-22T10:00:00Z',
    updatedAt: '2026-04-22T10:00:00Z',
    contactos: [],
    documentosRespaldo: [],
    ...overrides,
  };
}

// ============================================================
// Tests — T10.1 (RED)
// ============================================================

describe('mapearComprobantesAFilas', () => {
  it('(1) devuelve al menos la fila de encabezados de columna (9 columnas)', () => {
    const filas = mapearComprobantesAFilas([], perfilCompleto);
    // cabecera fiscal + encabezados — al menos la fila de encabezados
    const encabezados = filas.find((f) =>
      f.some((c) => c.type === 'texto' && c.value === 'Fecha'),
    );
    expect(encabezados).toBeDefined();
    expect(encabezados).toHaveLength(9);
  });

  it('(2) los encabezados tienen los 9 nombres correctos en orden', () => {
    const filas = mapearComprobantesAFilas([], perfilCompleto);
    const encabezados = filas.find((f) =>
      f.some((c) => c.type === 'texto' && c.value === 'Fecha'),
    );
    const nombres = encabezados?.map((c) => c.value);
    expect(nombres).toEqual([
      'Fecha',
      'Número',
      'Tipo',
      'Documento respaldo',
      'Nro. Ref.',
      'Contacto',
      'Glosa',
      'Estado',
      'Total BOB',
    ]);
  });

  it('(3) fila de datos mapea los 9 campos del item en orden correcto', () => {
    const item = crearItem({
      fechaContable: '2026-04-22',
      numero: 'D2604-000042',
      tipo: 'INGRESO',
      documentosRespaldo: [{ id: 'd1', tipoNombre: 'Factura', numero: '0042' }],
      contactos: [{ id: 'c1', nombre: 'Cliente X' }],
      glosa: 'Venta al contado',
      estado: 'CONTABILIZADO',
      anulado: false,
      totalDebitoBob: '999.00',
    });

    const filas = mapearComprobantesAFilas([item], perfilTodoNull);
    const filasDatos = filas.filter((f) =>
      f.some((c) => c.type === 'texto' && c.value === 'D2604-000042'),
    );

    expect(filasDatos).toHaveLength(1);
    const fila = filasDatos[0]!;
    expect(fila).toHaveLength(9);
    expect(fila[0]).toMatchObject({ type: 'texto' }); // Fecha
    expect(fila[1]).toMatchObject({ type: 'texto', value: 'D2604-000042' }); // Número
    expect(fila[2]).toMatchObject({ type: 'texto', value: 'INGRESO' }); // Tipo
    expect(fila[3]).toMatchObject({ type: 'texto', value: 'Factura' }); // Documento
    expect(fila[4]).toMatchObject({ type: 'texto', value: '0042' }); // Nro. Ref.
    expect(fila[5]).toMatchObject({ type: 'texto', value: 'Cliente X' }); // Contacto
    expect(fila[6]).toMatchObject({ type: 'texto', value: 'Venta al contado' }); // Glosa
    expect(fila[7]).toMatchObject({ type: 'texto', value: 'CONTABILIZADO' }); // Estado (no anulado)
    expect(fila[8]).toMatchObject({ type: 'numero', value: '999.00' }); // Total BOB
  });

  it('(4) borrador con numero=null → celda de Número vacía (§4.7 comprobante sin correlativo)', () => {
    const item = crearItem({ numero: null, estado: 'BORRADOR' });
    const filas = mapearComprobantesAFilas([item], perfilTodoNull);
    const filaDatos = filas[filas.length - 1]!;
    expect(filaDatos[1]).toMatchObject({ type: 'texto', value: '' });
  });

  it('(5) item anulado → Estado = "Anulado" (§4.7)', () => {
    const item = crearItem({ anulado: true, estado: 'CONTABILIZADO' });
    const filas = mapearComprobantesAFilas([item], perfilTodoNull);
    const filaDatos = filas[filas.length - 1]!;
    expect(filaDatos[7]).toMatchObject({ type: 'texto', value: 'Anulado' });
  });

  it('(6) item no anulado → Estado = valor del campo estado', () => {
    const item = crearItem({ anulado: false, estado: 'BLOQUEADO' });
    const filas = mapearComprobantesAFilas([item], perfilTodoNull);
    const filaDatos = filas[filas.length - 1]!;
    expect(filaDatos[7]).toMatchObject({ type: 'texto', value: 'BLOQUEADO' });
  });

  it('(7) múltiples documentosRespaldo → concatenados con " / " (tipoNombre y numero)', () => {
    const item = crearItem({
      documentosRespaldo: [
        { id: 'd1', tipoNombre: 'Factura', numero: '0001' },
        { id: 'd2', tipoNombre: 'Recibo', numero: '0099' },
      ],
    });
    const filas = mapearComprobantesAFilas([item], perfilTodoNull);
    const filaDatos = filas[filas.length - 1]!;
    expect(filaDatos[3]).toMatchObject({ type: 'texto', value: 'Factura / Recibo' });
    expect(filaDatos[4]).toMatchObject({ type: 'texto', value: '0001 / 0099' });
  });

  it('(8) múltiples contactos → concatenados con " / "', () => {
    const item = crearItem({
      contactos: [
        { id: 'c1', nombre: 'Empresa A' },
        { id: 'c2', nombre: 'Empresa B' },
      ],
    });
    const filas = mapearComprobantesAFilas([item], perfilTodoNull);
    const filaDatos = filas[filas.length - 1]!;
    expect(filaDatos[5]).toMatchObject({ type: 'texto', value: 'Empresa A / Empresa B' });
  });

  it('(9) totalDebitoBob → tipo numero (§4.5 — string del DTO, sin recalcular)', () => {
    const item = crearItem({ totalDebitoBob: '1250.50' });
    const filas = mapearComprobantesAFilas([item], perfilTodoNull);
    const filaDatos = filas[filas.length - 1]!;
    // §4.5: la celda debe ser tipo numero con el string del backend — el builder convierte
    expect(filaDatos[8]).toEqual({ type: 'numero', value: '1250.50' });
  });

  it('(12) fila de encabezados de columna → todas las celdas con fontWeight:"bold"', () => {
    const filas = mapearComprobantesAFilas([], perfilTodoNull);

    // Sin cabecera fiscal (todo null), la fila 0 = encabezados
    const filaEncabezados = filas[0];
    expect(filaEncabezados).toBeDefined();
    filaEncabezados!.forEach((celda) => {
      expect(celda).toMatchObject({ fontWeight: 'bold' });
    });
  });

  it('(13) NO existe fila de totales — este informe no agrega montos', () => {
    // El informe de comprobantes lista sin totalizar. Las filas de datos no son negrita.
    const item = crearItem();
    const filas = mapearComprobantesAFilas([item], perfilTodoNull);

    // La última fila es de datos, no de totales
    const ultimaFila = filas[filas.length - 1];
    // Si existiera una fila de totales, tendría 'fontWeight' en TODAS sus celdas.
    // Una fila de datos normal no tiene fontWeight en sus celdas (pueden variar).
    // Verificar que la celda de Tipo (índice 2) NO tiene fontWeight (es un dato normal)
    expect(ultimaFila?.[2]).not.toMatchObject({ fontWeight: 'bold' });
  });

  it('(10) cabecera fiscal presente cuando el perfil tiene datos', () => {
    const filas = mapearComprobantesAFilas([], perfilCompleto);
    // armarCabeceraFiscal agrega filas antes de los encabezados de columna
    // Al menos debe haber 2 filas: 1+ de cabecera fiscal + encabezados
    expect(filas.length).toBeGreaterThanOrEqual(2);
    // Verificar que la razonSocial esté en alguna fila de la cabecera
    const hayRazonSocial = filas.some((f) =>
      f.some((c) => typeof c.value === 'string' && c.value.includes('Avicont S.R.L.')),
    );
    expect(hayRazonSocial).toBe(true);
  });

  it('(11) cabecera fiscal tolera perfil con todos null (sin crash)', () => {
    expect(() => mapearComprobantesAFilas([], perfilTodoNull)).not.toThrow();
  });
});
