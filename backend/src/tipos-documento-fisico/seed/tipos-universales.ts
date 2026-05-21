import type { TipoDocumentoFisicoSeedRow } from '../ports/tipo-documento-fisico.repository.port';

/**
 * Los 8 tipos de documento físico universales que se siembran al crear una
 * organización (design §D3, REQ-SEED-01). Son universales: NO dependen de
 * `tipoEmpresaPrincipal` — todo tenant arranca con el mismo catálogo,
 * editable y desactivable después.
 *
 * Los 4 tributarios anticipan el slice 3 (`Factura`): hoy solo fuerzan
 * `monto`/`moneda` obligatorios en el documento. `tiposComprobanteAplicables`
 * restringe a qué tipos de comprobante puede asociarse cada documento (D11).
 */
export const TIPOS_UNIVERSALES: readonly TipoDocumentoFisicoSeedRow[] = [
  {
    codigo: 'factura-emitida',
    nombre: 'Factura emitida',
    esTributario: true,
    tiposComprobanteAplicables: ['INGRESO', 'DIARIO'],
  },
  {
    codigo: 'factura-recibida',
    nombre: 'Factura recibida',
    esTributario: true,
    tiposComprobanteAplicables: ['EGRESO', 'DIARIO'],
  },
  {
    codigo: 'nota-credito-emitida',
    nombre: 'Nota de crédito (emitida)',
    esTributario: true,
    tiposComprobanteAplicables: ['EGRESO', 'AJUSTE', 'DIARIO'],
  },
  {
    codigo: 'nota-debito-emitida',
    nombre: 'Nota de débito (emitida)',
    esTributario: true,
    tiposComprobanteAplicables: ['INGRESO', 'AJUSTE', 'DIARIO'],
  },
  {
    codigo: 'recibo-ingreso',
    nombre: 'Recibo de ingreso',
    esTributario: false,
    tiposComprobanteAplicables: ['INGRESO', 'DIARIO'],
  },
  {
    codigo: 'recibo-egreso',
    nombre: 'Recibo de egreso',
    esTributario: false,
    tiposComprobanteAplicables: ['EGRESO', 'DIARIO'],
  },
  {
    codigo: 'comprobante-interno',
    nombre: 'Comprobante interno',
    esTributario: false,
    tiposComprobanteAplicables: [
      'APERTURA',
      'DIARIO',
      'INGRESO',
      'EGRESO',
      'AJUSTE',
      'TRASPASO',
      'CIERRE',
    ],
  },
  {
    codigo: 'vale-caja-chica',
    nombre: 'Vale de caja chica',
    esTributario: false,
    tiposComprobanteAplicables: ['EGRESO', 'DIARIO'],
  },
];
