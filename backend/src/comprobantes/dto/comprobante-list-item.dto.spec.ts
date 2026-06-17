import { EstadoComprobante, Moneda, Prisma, TipoComprobante } from '@prisma/client';

import { toComprobanteListItem } from './comprobante-response.dto';

import type { ComprobanteListRow } from '../ports/comprobante.repository.port';

type Contacto = { id: string; razonSocial: string };

function row(overrides: Partial<ComprobanteListRow> = {}): ComprobanteListRow {
  return {
    id: 'comp-1',
    organizationId: 'org-1',
    tipo: TipoComprobante.DIARIO,
    numero: 'D2604-000042',
    estado: EstadoComprobante.CONTABILIZADO,
    fechaContable: new Date('2026-04-22T00:00:00.000Z'),
    periodoFiscalId: 'per-1',
    glosa: 'Glosa de prueba',
    monedaPrincipal: Moneda.BOB,
    tipoCambioReexpresion: new Prisma.Decimal('1'),
    totalDebitoBob: new Prisma.Decimal('1250.00'),
    totalCreditoBob: new Prisma.Decimal('1250.00'),
    origenTipo: null,
    origenId: null,
    generadoPorSistema: false,
    anulado: false,
    fechaAnulacion: null,
    anuladoPorUserId: null,
    motivoAnulacion: null,
    createdAt: new Date('2026-04-22T10:00:00.000Z'),
    createdByUserId: 'user-1',
    updatedAt: new Date('2026-04-22T10:00:00.000Z'),
    lineas: [],
    documentosFisicosAsociados: [],
    ...overrides,
  };
}

function lineaCon(contacto: Contacto | null): ComprobanteListRow['lineas'][number] {
  return { contacto };
}

describe('toComprobanteListItem', () => {
  describe('contactos (dedupe por id)', () => {
    it('cuenta contactos DISTINTOS, no líneas: el mismo contacto en varias líneas → uno solo', () => {
      const avicola: Contacto = { id: 'c-1', razonSocial: 'Avícola Sur S.R.L.' };
      const item = toComprobanteListItem(
        row({ lineas: [lineaCon(avicola), lineaCon(avicola), lineaCon(avicola)] }),
      );

      expect(item.contactos).toEqual([{ id: 'c-1', nombre: 'Avícola Sur S.R.L.' }]);
    });

    it('dos contactos diferentes → dos entradas', () => {
      const a: Contacto = { id: 'c-1', razonSocial: 'Avícola Sur S.R.L.' };
      const b: Contacto = { id: 'c-2', razonSocial: 'Molinos SA' };
      const item = toComprobanteListItem(row({ lineas: [lineaCon(a), lineaCon(b)] }));

      expect(item.contactos).toHaveLength(2);
      expect(item.contactos.map((c) => c.id)).toEqual(['c-1', 'c-2']);
    });

    it('líneas sin contacto (null) se ignoran → array vacío', () => {
      const item = toComprobanteListItem(row({ lineas: [lineaCon(null), lineaCon(null)] }));

      expect(item.contactos).toEqual([]);
    });

    it('mezcla de líneas con y sin contacto, mismo contacto repetido → uno solo', () => {
      const a: Contacto = { id: 'c-1', razonSocial: 'Avícola Sur S.R.L.' };
      const item = toComprobanteListItem(
        row({ lineas: [lineaCon(a), lineaCon(null), lineaCon(a)] }),
      );

      expect(item.contactos).toEqual([{ id: 'c-1', nombre: 'Avícola Sur S.R.L.' }]);
    });
  });

  describe('documentos de respaldo', () => {
    it('mapea tipoNombre y numero de cada documento asociado', () => {
      const item = toComprobanteListItem(
        row({
          documentosFisicosAsociados: [
            {
              documentoFisico: {
                id: 'd-1',
                numero: '0042',
                tipoDocumento: { nombre: 'Factura' },
              },
            },
          ],
        }),
      );

      expect(item.documentosRespaldo).toEqual([
        { id: 'd-1', tipoNombre: 'Factura', numero: '0042' },
      ]);
    });

    it('sin documentos → array vacío', () => {
      const item = toComprobanteListItem(row());
      expect(item.documentosRespaldo).toEqual([]);
    });
  });

  it('proyecta los campos escalares (sin líneas en el item)', () => {
    const item = toComprobanteListItem(row());

    expect(item.id).toBe('comp-1');
    expect(item.numero).toBe('D2604-000042');
    expect(item.fechaContable).toBe('2026-04-22');
    expect(item.totalDebitoBob).toBe('1250.00');
    expect(item).not.toHaveProperty('lineas');
  });
});
