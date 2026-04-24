import { EstadoComprobante, Prisma } from '@prisma/client';

import { PrismaComprobantesLockAdapter } from './prisma-comprobantes-lock.adapter';

// Mock del tx.comprobante — cada método devuelve lo que el adapter necesita.
function makeTxMock() {
  return {
    comprobante: {
      updateMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

describe('PrismaComprobantesLockAdapter', () => {
  let adapter: PrismaComprobantesLockAdapter;
  let tx: ReturnType<typeof makeTxMock>;

  beforeEach(() => {
    adapter = new PrismaComprobantesLockAdapter();
    tx = makeTxMock();
  });

  describe('bloquearPorPeriodo', () => {
    it('filtra CONTABILIZADO del período y actualiza a BLOQUEADO', async () => {
      tx.comprobante.updateMany.mockResolvedValue({ count: 7 });

      const n = await adapter.bloquearPorPeriodo(tx as unknown as Prisma.TransactionClient, 'p-1');

      expect(n).toBe(7);
      expect(tx.comprobante.updateMany).toHaveBeenCalledWith({
        where: {
          periodoFiscalId: 'p-1',
          estado: EstadoComprobante.CONTABILIZADO,
        },
        data: { estado: EstadoComprobante.BLOQUEADO },
      });
    });
  });

  describe('desbloquearPorPeriodo', () => {
    it('filtra BLOQUEADO del período y actualiza a CONTABILIZADO', async () => {
      tx.comprobante.updateMany.mockResolvedValue({ count: 3 });

      const n = await adapter.desbloquearPorPeriodo(
        tx as unknown as Prisma.TransactionClient,
        'p-1',
      );

      expect(n).toBe(3);
      expect(tx.comprobante.updateMany).toHaveBeenCalledWith({
        where: {
          periodoFiscalId: 'p-1',
          estado: EstadoComprobante.BLOQUEADO,
        },
        data: { estado: EstadoComprobante.CONTABILIZADO },
      });
    });
  });

  describe('contarBorradoresEnPeriodo', () => {
    it('cuenta comprobantes BORRADOR del período', async () => {
      tx.comprobante.count.mockResolvedValue(5);

      const n = await adapter.contarBorradoresEnPeriodo(
        tx as unknown as Prisma.TransactionClient,
        'p-1',
      );

      expect(n).toBe(5);
      expect(tx.comprobante.count).toHaveBeenCalledWith({
        where: {
          periodoFiscalId: 'p-1',
          estado: EstadoComprobante.BORRADOR,
        },
      });
    });
  });

  describe('obtenerResumenEnPeriodo', () => {
    it('combina contadores, totales y lista de borradores', async () => {
      tx.comprobante.groupBy.mockResolvedValue([
        { estado: EstadoComprobante.CONTABILIZADO, _count: { _all: 10 } },
        { estado: EstadoComprobante.BORRADOR, _count: { _all: 2 } },
        { estado: EstadoComprobante.ANULADO, _count: { _all: 1 } },
      ]);
      tx.comprobante.aggregate.mockResolvedValue({
        _sum: {
          totalDebitoBob: new Prisma.Decimal('12345.67'),
          totalCreditoBob: new Prisma.Decimal('12345.67'),
        },
      });
      tx.comprobante.findMany.mockResolvedValue([
        {
          id: 'bor-1',
          fechaContable: new Date(Date.UTC(2026, 3, 15)),
          glosa: 'Venta a cliente pendiente',
          totalDebitoBob: new Prisma.Decimal('500.00'),
        },
        {
          id: 'bor-2',
          fechaContable: new Date(Date.UTC(2026, 3, 20)),
          glosa: 'Compra pendiente de contabilizar',
          totalDebitoBob: new Prisma.Decimal('750.25'),
        },
      ]);

      const r = await adapter.obtenerResumenEnPeriodo(
        tx as unknown as Prisma.TransactionClient,
        'p-1',
      );

      expect(r).toEqual({
        contabilizados: 10,
        borradores: 2,
        anulados: 1,
        totalDebeBob: '12345.67',
        totalHaberBob: '12345.67',
        borradoresList: [
          {
            id: 'bor-1',
            fechaContable: '2026-04-15',
            glosa: 'Venta a cliente pendiente',
            totalBob: '500.00',
          },
          {
            id: 'bor-2',
            fechaContable: '2026-04-20',
            glosa: 'Compra pendiente de contabilizar',
            totalBob: '750.25',
          },
        ],
      });
    });

    it('maneja período vacío: devuelve ceros y lista vacía', async () => {
      tx.comprobante.groupBy.mockResolvedValue([]);
      tx.comprobante.aggregate.mockResolvedValue({
        _sum: { totalDebitoBob: null, totalCreditoBob: null },
      });
      tx.comprobante.findMany.mockResolvedValue([]);

      const r = await adapter.obtenerResumenEnPeriodo(
        tx as unknown as Prisma.TransactionClient,
        'p-vacio',
      );

      expect(r).toEqual({
        contabilizados: 0,
        borradores: 0,
        anulados: 0,
        totalDebeBob: '0.00',
        totalHaberBob: '0.00',
        borradoresList: [],
      });
    });
  });
});
