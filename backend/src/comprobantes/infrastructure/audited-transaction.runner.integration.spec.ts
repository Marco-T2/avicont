import { PrismaClient } from '@prisma/client';

import { AuditedTransactionRunner } from './audited-transaction.runner';

/**
 * Integration spec de AuditedTransactionRunner contra Postgres real (task 3.3).
 *
 * Verifica dos propiedades críticas que solo son testables contra la BD:
 *   1. current_setting('app.audit_user_id', true) devuelve el userId seteado
 *      DENTRO de la TX vía set_config(..., true).
 *   2. Tras el COMMIT, las session vars NO se filtran a la sesión: el
 *      siguiente query fuera de TX devuelve '' (set_config con is_local=true
 *      se descarta automáticamente al cierre de la TX).
 *
 * Requiere Postgres corriendo en DATABASE_URL.
 * Correr con:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/saas \
 *     pnpm exec jest src/comprobantes/infrastructure/audited-transaction.runner.integration.spec.ts
 */
describe('AuditedTransactionRunner — integration vs Postgres', () => {
  let prisma: PrismaClient;
  let runner: AuditedTransactionRunner;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    // AuditedTransactionRunner solo necesita PrismaService.$transaction.
    // PrismaClient implementa el mismo contrato, así que el cast funciona.
    runner = new AuditedTransactionRunner(prisma as never);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('visibilidad de session vars dentro de la TX', () => {
    it('current_setting(app.audit_user_id) retorna el userId seteado dentro de la TX', async () => {
      const userId = 'integ-user-001';

      const resultInTx = await runner.run({ userId }, async (tx) => {
        const rows = await tx.$queryRaw<[{ value: string }]>`
          SELECT current_setting('app.audit_user_id', true) AS value
        `;
        return rows[0]?.value;
      });

      expect(resultInTx).toBe(userId);
    });

    it('current_setting(app.audit_motivo) retorna el motivo seteado dentro de la TX', async () => {
      const motivo = 'Corrección de partida doble por error de glosa';

      const resultInTx = await runner.run({ userId: 'integ-user-002', motivo }, async (tx) => {
        const rows = await tx.$queryRaw<[{ value: string }]>`
          SELECT current_setting('app.audit_motivo', true) AS value
        `;
        return rows[0]?.value;
      });

      expect(resultInTx).toBe(motivo);
    });

    it('current_setting(app.audit_motivo) retorna "" si no se pasa motivo', async () => {
      const resultInTx = await runner.run({ userId: 'integ-user-003' }, async (tx) => {
        const rows = await tx.$queryRaw<[{ value: string }]>`
          SELECT current_setting('app.audit_motivo', true) AS value
        `;
        return rows[0]?.value;
      });

      expect(resultInTx).toBe('');
    });

    it('current_setting(app.audit_during_reopening) es "true" si se pasa reaperturaId', async () => {
      const resultInTx = await runner.run(
        { userId: 'integ-user-004', reaperturaId: 'reap-integ-001' },
        async (tx) => {
          const rows = await tx.$queryRaw<[{ value: string }]>`
            SELECT current_setting('app.audit_during_reopening', true) AS value
          `;
          return rows[0]?.value;
        },
      );

      expect(resultInTx).toBe('true');
    });

    it('current_setting(app.audit_during_reopening) es "false" si no se pasa reaperturaId', async () => {
      const resultInTx = await runner.run({ userId: 'integ-user-005' }, async (tx) => {
        const rows = await tx.$queryRaw<[{ value: string }]>`
          SELECT current_setting('app.audit_during_reopening', true) AS value
        `;
        return rows[0]?.value;
      });

      expect(resultInTx).toBe('false');
    });

    it('current_setting(app.audit_reapertura_id) retorna el reaperturaId seteado', async () => {
      const reaperturaId = 'reap-integ-xyz';

      const resultInTx = await runner.run(
        { userId: 'integ-user-006', reaperturaId },
        async (tx) => {
          const rows = await tx.$queryRaw<[{ value: string }]>`
            SELECT current_setting('app.audit_reapertura_id', true) AS value
          `;
          return rows[0]?.value;
        },
      );

      expect(resultInTx).toBe(reaperturaId);
    });
  });

  describe('no filtrado de session vars fuera de la TX (SET LOCAL)', () => {
    it('tras el COMMIT, current_setting(app.audit_user_id) es vacío o nulo fuera de TX', async () => {
      // Correr la TX primero para setear el valor
      await runner.run({ userId: 'integ-user-007' }, async () => 'done');

      // Fuera de la TX, el valor no debe estar disponible.
      // current_setting con missing_ok=true devuelve '' cuando la var no está seteada.
      const rows = await prisma.$queryRaw<[{ value: string }]>`
        SELECT current_setting('app.audit_user_id', true) AS value
      `;
      const valueAfterCommit = rows[0]?.value;

      // El valor debe ser '' (no seteado) o cualquier valor excepto el de la TX.
      // is_local=true en set_config garantiza que se descarta al cierre de la TX.
      expect(valueAfterCommit).not.toBe('integ-user-007');
    });

    it('tras el COMMIT, current_setting(app.audit_during_reopening) no es "true" fuera de TX', async () => {
      await runner.run(
        { userId: 'integ-user-008', reaperturaId: 'reap-leak-test' },
        async () => 'done',
      );

      const rows = await prisma.$queryRaw<[{ value: string }]>`
        SELECT current_setting('app.audit_during_reopening', true) AS value
      `;
      const valueAfterCommit = rows[0]?.value;

      // Nunca debe ser 'true' fuera de TX — confirma is_local=true.
      expect(valueAfterCommit).not.toBe('true');
    });
  });

  describe('comportamiento del callback fn', () => {
    it('devuelve el valor retornado por fn', async () => {
      const result = await runner.run({ userId: 'integ-user-009' }, async () => 99);
      expect(result).toBe(99);
    });

    it('propaga el error de fn como rechazo de la promesa', async () => {
      await expect(
        runner.run({ userId: 'integ-user-010' }, async () => {
          throw new Error('error desde fn en integración');
        }),
      ).rejects.toThrow('error desde fn en integración');
    });

    it('rechaza antes de abrir la TX si userId es vacío', async () => {
      await expect(runner.run({ userId: '' }, async () => 'ok')).rejects.toThrow(
        'AuditedTransactionRunner: userId is required',
      );
    });
  });
});
