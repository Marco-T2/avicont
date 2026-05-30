import {
  ClaseCuenta,
  EstadoComprobante,
  Moneda,
  NaturalezaCuenta,
  PrismaClient,
  TipoComprobante,
} from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaComprobantesReaderAdapter } from './prisma-comprobantes-reader.adapter';

/**
 * Integration spec del adapter `PrismaComprobantesReaderAdapter` contra Postgres real.
 *
 * Valida:
 *   - aislamiento multi-tenant (2 tenants, §4.2 CLAUDE.md)
 *   - exclusión de BORRADOR siempre (REQ-LD-02)
 *   - toggle de anulados (REQ-LD-03)
 *   - orden cronológico estable (REQ-LD-04)
 *   - contarAsientos cuenta correctamente para el tope (REQ-LD-10)
 */
describe('PrismaComprobantesReaderAdapter (integration)', () => {
  const SLUG_A = 'org-comp-reader-a';
  const SLUG_B = 'org-comp-reader-b';

  let prisma: PrismaClient;
  let adapter: PrismaComprobantesReaderAdapter;
  let tenantA: string;
  let tenantB: string;

  // IDs de cuentas
  let cajaAId: string;
  let ventasAId: string;
  let cajaBId: string;
  let ventasBId: string;

  // Fixture helpers
  let periodoAId: string;
  let periodoBId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaComprobantesReaderAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();

    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org Comp A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org Comp B' } }),
    ]);
    tenantA = orgA.id;
    tenantB = orgB.id;

    // Gestiones + períodos para ambos tenants
    const [gestionA, gestionB] = await Promise.all([
      prisma.gestionFiscal.create({ data: { organizationId: tenantA, year: 2026, mesInicio: 1 } }),
      prisma.gestionFiscal.create({ data: { organizationId: tenantB, year: 2026, mesInicio: 1 } }),
    ]);

    const [pA, pB] = await Promise.all([
      prisma.periodoFiscal.create({
        data: {
          organizationId: tenantA,
          gestionId: gestionA.id,
          year: 2026,
          month: 1,
          ordenEnGestion: 1,
          status: 'ABIERTO',
        },
      }),
      prisma.periodoFiscal.create({
        data: {
          organizationId: tenantB,
          gestionId: gestionB.id,
          year: 2026,
          month: 1,
          ordenEnGestion: 1,
          status: 'ABIERTO',
        },
      }),
    ]);
    periodoAId = pA.id;
    periodoBId = pB.id;

    // Cuentas para ambos tenants (esDetalle = true)
    const [cA, vA, cB, vB] = await Promise.all([
      prisma.cuenta.create({
        data: {
          organizationId: tenantA,
          codigoInterno: '1.1.1.001',
          nombre: 'Caja MN',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
      prisma.cuenta.create({
        data: {
          organizationId: tenantA,
          codigoInterno: '4.1.1.001',
          nombre: 'Ventas',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
      prisma.cuenta.create({
        data: {
          organizationId: tenantB,
          codigoInterno: '1.1.1.001',
          nombre: 'Caja MN B',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
      prisma.cuenta.create({
        data: {
          organizationId: tenantB,
          codigoInterno: '4.1.1.001',
          nombre: 'Ventas B',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
    ]);
    cajaAId = cA.id;
    ventasAId = vA.id;
    cajaBId = cB.id;
    ventasBId = vB.id;
  });

  async function cleanup() {
    // El cleanup debe respetar el orden de las FKs.
    // lineas_comprobante tiene FK cuentaId con onDelete: Restrict → se borra primero.
    // Las comprobantes y líneas cascadean desde organization (onDelete: Cascade),
    // pero Postgres ejecuta la cascada intentando borrar cuentas antes de las líneas
    // que las referencian. Borramos explícitamente en orden.
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      // Borrar líneas (FK cuentaId Restrict) antes que las cuentas
      await prisma.lineaComprobante.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
    }
    await prisma.organization.deleteMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
    });
  }

  /** Crea un comprobante CONTABILIZADO para el tenant con un par caja/ventas. */
  async function crearAsientoContabilizado(
    tenantId: string,
    periodoId: string,
    cajaId: string,
    ventasId: string,
    fechaContable: Date,
    userId: string = 'user-test',
    anulado = false,
  ) {
    const comp = await prisma.comprobante.create({
      data: {
        organizationId: tenantId,
        tipo: TipoComprobante.DIARIO,
        estado: EstadoComprobante.CONTABILIZADO,
        numero: `D${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`,
        fechaContable,
        periodoFiscalId: periodoId,
        glosa: 'Asiento de prueba',
        totalDebitoBob: 1000,
        totalCreditoBob: 1000,
        createdByUserId: userId,
        anulado,
      },
    });

    await prisma.lineaComprobante.createMany({
      data: [
        {
          organizationId: tenantId,
          comprobanteId: comp.id,
          orden: 1,
          cuentaId: cajaId,
          moneda: Moneda.BOB,
          debito: 1000,
          credito: 0,
          debitoBob: 1000,
          creditoBob: 0,
        },
        {
          organizationId: tenantId,
          comprobanteId: comp.id,
          orden: 2,
          cuentaId: ventasId,
          moneda: Moneda.BOB,
          debito: 0,
          credito: 1000,
          debitoBob: 0,
          creditoBob: 1000,
        },
      ],
    });

    return comp;
  }

  const filtrosEnero: {
    fechaDesde: Date;
    fechaHasta: Date;
    incluirAnulados: boolean;
  } = {
    fechaDesde: new Date(Date.UTC(2026, 0, 1)),
    fechaHasta: new Date(Date.UTC(2026, 0, 31)),
    incluirAnulados: false,
  };

  // ============================================================
  // aislamiento multi-tenant (REQ-LD-08)
  // ============================================================

  describe('aislamiento multi-tenant', () => {
    it('tenant A solo ve sus propios asientos, no los de tenant B', async () => {
      await crearAsientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 5)),
      );
      await crearAsientoContabilizado(
        tenantB,
        periodoBId,
        cajaBId,
        ventasBId,
        new Date(Date.UTC(2026, 0, 5)),
      );

      const resultA = await adapter.obtenerAsientosParaLibroDiario(tenantA, filtrosEnero);
      const resultB = await adapter.obtenerAsientosParaLibroDiario(tenantB, filtrosEnero);

      // Cada tenant ve solo sus asientos
      expect(resultA).toHaveLength(1);
      expect(resultA[0]?.organizationId).toBe(tenantA);

      expect(resultB).toHaveLength(1);
      expect(resultB[0]?.organizationId).toBe(tenantB);
    });

    it('tenant sin asientos en el rango devuelve array vacío (no error)', async () => {
      // Crear asiento para tenant B pero consultar tenant A (sin asientos)
      await crearAsientoContabilizado(
        tenantB,
        periodoBId,
        cajaBId,
        ventasBId,
        new Date(Date.UTC(2026, 0, 5)),
      );

      const result = await adapter.obtenerAsientosParaLibroDiario(tenantA, filtrosEnero);
      expect(result).toHaveLength(0);
    });
  });

  // ============================================================
  // exclusión de BORRADOR (REQ-LD-02)
  // ============================================================

  describe('exclusión de BORRADOR', () => {
    it('no incluye comprobantes en BORRADOR nunca', async () => {
      // Crear un BORRADOR para tenantA
      await prisma.comprobante.create({
        data: {
          organizationId: tenantA,
          tipo: TipoComprobante.DIARIO,
          estado: EstadoComprobante.BORRADOR,
          fechaContable: new Date(Date.UTC(2026, 0, 10)),
          periodoFiscalId: periodoAId,
          glosa: 'Borrador que no debe aparecer',
          createdByUserId: 'user-test',
        },
      });
      // Crear un CONTABILIZADO para comparar
      await crearAsientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 10)),
      );

      const result = await adapter.obtenerAsientosParaLibroDiario(tenantA, filtrosEnero);

      // Solo el CONTABILIZADO debe aparecer
      expect(result).toHaveLength(1);
      expect(result[0]?.estado).toBe(EstadoComprobante.CONTABILIZADO);
    });

    it('incluye BLOQUEADO además de CONTABILIZADO', async () => {
      await crearAsientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 10)),
      );
      // Crear un BLOQUEADO
      const bloqueado = await prisma.comprobante.create({
        data: {
          organizationId: tenantA,
          tipo: TipoComprobante.DIARIO,
          estado: EstadoComprobante.BLOQUEADO,
          numero: 'D202601-000099',
          fechaContable: new Date(Date.UTC(2026, 0, 11)),
          periodoFiscalId: periodoAId,
          glosa: 'Comprobante bloqueado',
          totalDebitoBob: 500,
          totalCreditoBob: 500,
          createdByUserId: 'user-test',
        },
      });
      await prisma.lineaComprobante.createMany({
        data: [
          {
            organizationId: tenantA,
            comprobanteId: bloqueado.id,
            orden: 1,
            cuentaId: cajaAId,
            moneda: Moneda.BOB,
            debito: 500,
            credito: 0,
            debitoBob: 500,
            creditoBob: 0,
          },
          {
            organizationId: tenantA,
            comprobanteId: bloqueado.id,
            orden: 2,
            cuentaId: ventasAId,
            moneda: Moneda.BOB,
            debito: 0,
            credito: 500,
            debitoBob: 0,
            creditoBob: 500,
          },
        ],
      });

      const result = await adapter.obtenerAsientosParaLibroDiario(tenantA, filtrosEnero);

      expect(result).toHaveLength(2);
      const estados = result.map((r) => r.estado);
      expect(estados).toContain(EstadoComprobante.CONTABILIZADO);
      expect(estados).toContain(EstadoComprobante.BLOQUEADO);
    });
  });

  // ============================================================
  // toggle de anulados (REQ-LD-03)
  // ============================================================

  describe('toggle de anulados', () => {
    it('sin incluirAnulados=true, los anulados no aparecen', async () => {
      await crearAsientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 5)),
      );
      await crearAsientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 6)),
        'user-test',
        true, // anulado
      );

      const result = await adapter.obtenerAsientosParaLibroDiario(tenantA, filtrosEnero);
      expect(result).toHaveLength(1);
      expect(result[0]?.anulado).toBe(false);
    });

    it('con incluirAnulados=true, los anulados aparecen junto a los normales', async () => {
      await crearAsientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 5)),
      );
      await crearAsientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 6)),
        'user-test',
        true, // anulado
      );

      const result = await adapter.obtenerAsientosParaLibroDiario(tenantA, {
        ...filtrosEnero,
        incluirAnulados: true,
      });
      expect(result).toHaveLength(2);
    });
  });

  // ============================================================
  // orden cronológico (REQ-LD-04)
  // ============================================================

  describe('orden cronológico', () => {
    it('devuelve asientos ordenados por fechaContable ASC', async () => {
      // Crear en orden inverso para verificar el sort
      await crearAsientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 15)),
      );
      await crearAsientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 5)),
      );
      await crearAsientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 10)),
      );

      const result = await adapter.obtenerAsientosParaLibroDiario(tenantA, filtrosEnero);

      expect(result).toHaveLength(3);
      const fechas = result.map((r) => new Date(r.fechaContable).getUTCDate());
      expect(fechas).toEqual([5, 10, 15]);
    });
  });

  // ============================================================
  // contarAsientos (REQ-LD-10)
  // ============================================================

  describe('contarAsientos', () => {
    it('cuenta correctamente los asientos del rango con filtros aplicados', async () => {
      // 2 normales + 1 anulado + 1 borrador (no debe contar)
      await crearAsientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 5)),
      );
      await crearAsientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 6)),
      );
      await crearAsientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 7)),
        'user-test',
        true, // anulado
      );
      await prisma.comprobante.create({
        data: {
          organizationId: tenantA,
          tipo: TipoComprobante.DIARIO,
          estado: EstadoComprobante.BORRADOR, // no debe contar
          fechaContable: new Date(Date.UTC(2026, 0, 8)),
          periodoFiscalId: periodoAId,
          glosa: 'Borrador',
          createdByUserId: 'user-test',
        },
      });

      // Sin incluirAnulados: 2
      const sinAnulados = await adapter.contarAsientos(tenantA, filtrosEnero);
      expect(sinAnulados).toBe(2);

      // Con incluirAnulados: 3
      const conAnulados = await adapter.contarAsientos(tenantA, {
        ...filtrosEnero,
        incluirAnulados: true,
      });
      expect(conAnulados).toBe(3);
    });

    it('cuenta solo asientos del tenant correcto (no de otros tenants)', async () => {
      // Tenant A: 2 asientos; Tenant B: 5 asientos
      for (let i = 0; i < 2; i++) {
        await crearAsientoContabilizado(
          tenantA,
          periodoAId,
          cajaAId,
          ventasAId,
          new Date(Date.UTC(2026, 0, i + 1)),
        );
      }
      for (let i = 0; i < 5; i++) {
        await crearAsientoContabilizado(
          tenantB,
          periodoBId,
          cajaBId,
          ventasBId,
          new Date(Date.UTC(2026, 0, i + 1)),
        );
      }

      const countA = await adapter.contarAsientos(tenantA, filtrosEnero);
      const countB = await adapter.contarAsientos(tenantB, filtrosEnero);

      expect(countA).toBe(2);
      expect(countB).toBe(5);
    });
  });

  // ============================================================
  // líneas incluidas con cuenta
  // ============================================================

  describe('líneas y cuenta incluidas', () => {
    it('devuelve líneas con codigoInterno y nombre de cuenta', async () => {
      await crearAsientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 5)),
      );

      const result = await adapter.obtenerAsientosParaLibroDiario(tenantA, filtrosEnero);

      expect(result).toHaveLength(1);
      const asiento = result[0];
      expect(asiento).toBeDefined();
      expect(asiento!.lineas).toHaveLength(2);

      const linea1 = asiento!.lineas[0];
      expect(linea1).toBeDefined();
      expect(linea1!.cuenta.codigoInterno).toBe('1.1.1.001');
      expect(linea1!.cuenta.nombre).toBe('Caja MN');
      expect(linea1!.debitoBob.toNumber()).toBe(1000);
      expect(linea1!.creditoBob.toNumber()).toBe(0);
    });
  });
});
