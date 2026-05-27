import { Prisma } from '@prisma/client';

import { AuditedTransactionRunner } from './audited-transaction.runner';

/**
 * Unit spec de AuditedTransactionRunner (task 3.1 — comprobantes-anulacion-refactor).
 *
 * Verifica el contrato del wrapper:
 *   - exige userId no vacío antes de abrir la TX.
 *   - setea las 4 session vars via set_config(..., true) en el orden correcto.
 *   - invoca fn(tx) con el cliente transaccional.
 *
 * Sin DB — PrismaService.$transaction y tx.$executeRaw están mockeados.
 */
describe('AuditedTransactionRunner', () => {
  let mockTx: {
    $executeRaw: jest.Mock;
  };
  let mockPrismaService: {
    $transaction: jest.Mock;
  };
  let runner: AuditedTransactionRunner;

  beforeEach(() => {
    mockTx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    // PrismaService.$transaction con callback — invoca el callback con mockTx
    mockPrismaService = {
      $transaction: jest
        .fn()
        .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
    };

    runner = new AuditedTransactionRunner(mockPrismaService as never);
  });

  describe('validación de userId', () => {
    it('lanza error si userId es un string vacío', async () => {
      await expect(runner.run({ userId: '' }, async () => 'ok')).rejects.toThrow(
        'AuditedTransactionRunner: userId is required',
      );
    });

    it('lanza error si userId no está definido', async () => {
      await expect(
        runner.run({ userId: undefined as unknown as string }, async () => 'ok'),
      ).rejects.toThrow('AuditedTransactionRunner: userId is required');
    });

    it('no lanza error con userId válido', async () => {
      await expect(
        runner.run({ userId: 'user-123' }, async () => 'resultado'),
      ).resolves.toBe('resultado');
    });
  });

  describe('invocación de $transaction', () => {
    it('abre una transacción Prisma con el callback', async () => {
      await runner.run({ userId: 'user-abc' }, async () => 'done');
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('set_config de session vars', () => {
    it('setea app.audit_user_id con el userId provisto como primer call', async () => {
      await runner.run({ userId: 'user-xyz' }, async () => undefined);

      // Primer llamado a $executeRaw debe ser set_config('app.audit_user_id', userId, true)
      const firstCall = mockTx.$executeRaw.mock.calls[0];
      // $executeRaw recibe el tagged template como Prisma.Sql — verificar strings y values
      const sql = firstCall[0] as Prisma.Sql;
      expect(sql.strings.join('?')).toContain('set_config');
      expect(sql.strings.join('?')).toContain('app.audit_user_id');
      expect(sql.values).toContain('user-xyz');
    });

    it('setea app.audit_motivo como string vacío si no se pasa motivo', async () => {
      await runner.run({ userId: 'user-xyz' }, async () => undefined);

      const calls = mockTx.$executeRaw.mock.calls.map(([sql]: [Prisma.Sql]) => ({
        sql: sql.strings.join(''),
        values: sql.values,
      }));

      const motivoCall = calls.find((c) => c.sql.includes('app.audit_motivo'));
      expect(motivoCall).toBeDefined();
      expect(motivoCall!.values).toContain('');
    });

    it('setea app.audit_motivo con el motivo provisto si se pasa', async () => {
      await runner.run({ userId: 'user-xyz', motivo: 'Corrección de glosa' }, async () => undefined);

      const calls = mockTx.$executeRaw.mock.calls.map(([sql]: [Prisma.Sql]) => ({
        sql: sql.strings.join(''),
        values: sql.values,
      }));

      const motivoCall = calls.find((c) => c.sql.includes('app.audit_motivo'));
      expect(motivoCall).toBeDefined();
      expect(motivoCall!.values).toContain('Corrección de glosa');
    });

    it('setea app.audit_during_reopening a "true" si se pasa reaperturaId', async () => {
      await runner.run(
        { userId: 'user-xyz', reaperturaId: 'reap-001' },
        async () => undefined,
      );

      const calls = mockTx.$executeRaw.mock.calls.map(([sql]: [Prisma.Sql]) => ({
        sql: sql.strings.join(''),
        values: sql.values,
      }));

      const reopeningCall = calls.find((c) => c.sql.includes('app.audit_during_reopening'));
      expect(reopeningCall).toBeDefined();
      expect(reopeningCall!.values).toContain('true');
    });

    it('setea app.audit_during_reopening a "false" si no se pasa reaperturaId', async () => {
      await runner.run({ userId: 'user-xyz' }, async () => undefined);

      const calls = mockTx.$executeRaw.mock.calls.map(([sql]: [Prisma.Sql]) => ({
        sql: sql.strings.join(''),
        values: sql.values,
      }));

      const reopeningCall = calls.find((c) => c.sql.includes('app.audit_during_reopening'));
      expect(reopeningCall).toBeDefined();
      expect(reopeningCall!.values).toContain('false');
    });

    it('llama a $executeRaw exactamente 4 veces (una por session var)', async () => {
      await runner.run({ userId: 'user-xyz' }, async () => undefined);
      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(4);
    });
  });

  describe('invocación del callback fn', () => {
    it('invoca fn con el cliente de transacción Prisma', async () => {
      const fn = jest.fn().mockResolvedValue('resultado');

      await runner.run({ userId: 'user-abc' }, fn);

      expect(fn).toHaveBeenCalledTimes(1);
      // fn recibe el tx client (mockTx en este contexto)
      expect(fn).toHaveBeenCalledWith(mockTx);
    });

    it('devuelve el valor retornado por fn', async () => {
      const result = await runner.run({ userId: 'user-abc' }, async () => 42);
      expect(result).toBe(42);
    });

    it('propaga el error lanzado por fn', async () => {
      await expect(
        runner.run({ userId: 'user-abc' }, async () => {
          throw new Error('error desde fn');
        }),
      ).rejects.toThrow('error desde fn');
    });
  });
});
