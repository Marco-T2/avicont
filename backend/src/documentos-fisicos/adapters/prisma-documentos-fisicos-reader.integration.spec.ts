import { EstadoComprobante, Moneda, Prisma, PrismaClient, TipoComprobante } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaDocumentosFisicosReaderAdapter } from './prisma-documentos-fisicos-reader.adapter';

/**
 * Integration spec del método `listarAsociadosDeComprobante` del
 * `PrismaDocumentosFisicosReaderAdapter` contra Postgres real. Valida el JOIN
 * comprobante_documento_fisico → documentoFisico → tipoDocumento y el filtrado
 * por tenant.
 *
 * Cubre REQ-A-09 (shape enriquecido) + REQ-S-01 (multi-tenancy) a nivel
 * integration. El resto de métodos del reader (`obtenerBatchParaAsociar`,
 * `idsYaAsociadosAContabilizado`) los cubre el E2E 10.3.
 */
describe('PrismaDocumentosFisicosReaderAdapter.listarAsociadosDeComprobante (integration)', () => {
  const SLUG_A = 'org-test-reader-a';
  const SLUG_B = 'org-test-reader-b';
  const USER_EMAIL_PREFIX = 'user-seed-reader-';

  let prisma: PrismaClient;
  let adapter: PrismaDocumentosFisicosReaderAdapter;
  let tenantA: string;
  let tenantB: string;
  let userId: string;
  let tipoId: string;
  let tipoBId: string;
  let periodoId: string;
  let periodoBId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaDocumentosFisicosReaderAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();

    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org Reader A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org Reader B' } }),
    ]);
    tenantA = orgA.id;
    tenantB = orgB.id;

    const user = await prisma.user.create({
      data: { email: `${USER_EMAIL_PREFIX}main@test.local`, hashedPassword: 'x' },
    });
    userId = user.id;

    const [tA, tB] = await Promise.all([
      prisma.tipoDocumentoFisico.create({
        data: {
          organizationId: tenantA,
          nombre: 'Factura emitida',
          codigo: 'factura-emitida',
          esTributario: true,
          tiposComprobanteAplicables: [TipoComprobante.INGRESO],
          createdByUserId: userId,
        },
      }),
      prisma.tipoDocumentoFisico.create({
        data: {
          organizationId: tenantB,
          nombre: 'Factura B',
          codigo: 'factura-b',
          esTributario: true,
          tiposComprobanteAplicables: [TipoComprobante.INGRESO],
          createdByUserId: userId,
        },
      }),
    ]);
    tipoId = tA.id;
    tipoBId = tB.id;

    periodoId = await createPeriodo(tenantA);
    periodoBId = await createPeriodo(tenantB);
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.comprobanteDocumentoFisico.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.documentoFisico.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.tipoDocumentoFisico.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.comprobante.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.secuenciaComprobante.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.periodoFiscal.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.gestionFiscal.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: USER_EMAIL_PREFIX } } });
  }

  async function createPeriodo(orgId: string): Promise<string> {
    const gestion = await prisma.gestionFiscal.create({
      data: { organizationId: orgId, year: 2026, mesInicio: 1 },
    });
    const periodo = await prisma.periodoFiscal.create({
      data: {
        organizationId: orgId,
        gestionId: gestion.id,
        year: 2026,
        month: 4,
        ordenEnGestion: 4,
      },
    });
    return periodo.id;
  }

  async function createComprobante(orgId: string, pId: string): Promise<string> {
    const comp = await prisma.comprobante.create({
      data: {
        organizationId: orgId,
        tipo: TipoComprobante.INGRESO,
        estado: EstadoComprobante.BORRADOR,
        fechaContable: new Date('2026-04-15'),
        periodoFiscalId: pId,
        glosa: 'Test',
        monedaPrincipal: Moneda.BOB,
        createdByUserId: userId,
      },
    });
    return comp.id;
  }

  async function createDocumento(orgId: string, tId: string, numero = 'F-0001'): Promise<string> {
    const doc = await prisma.documentoFisico.create({
      data: {
        organizationId: orgId,
        tipoDocumentoFisicoId: tId,
        numero,
        fechaEmision: new Date('2026-04-01'),
        monto: new Prisma.Decimal('1150.00'),
        moneda: Moneda.BOB,
        createdByUserId: userId,
      },
    });
    return doc.id;
  }

  async function asociar(orgId: string, comprobanteId: string, documentoFisicoId: string) {
    await prisma.comprobanteDocumentoFisico.create({
      data: {
        organizationId: orgId,
        comprobanteId,
        documentoFisicoId,
        comprobanteEstado: EstadoComprobante.BORRADOR,
      },
    });
  }

  it('devuelve los documentos asociados con tipo embebido (REQ-A-09)', async () => {
    const compId = await createComprobante(tenantA, periodoId);
    const docId = await createDocumento(tenantA, tipoId, 'FAC-001');
    await asociar(tenantA, compId, docId);

    const docs = await adapter.listarAsociadosDeComprobante(tenantA, compId);

    expect(docs).toHaveLength(1);
    expect(docs[0]?.id).toBe(docId);
    expect(docs[0]?.numero).toBe('FAC-001');
    expect(docs[0]?.tipoDocumento).toMatchObject({ id: tipoId, nombre: 'Factura emitida' });
    expect(docs[0]?.monto?.toString()).toBe('1150');
  });

  it('devuelve lista vacía si el comprobante no tiene documentos', async () => {
    const compId = await createComprobante(tenantA, periodoId);

    const docs = await adapter.listarAsociadosDeComprobante(tenantA, compId);

    expect(docs).toEqual([]);
  });

  it('no cruza tenants: tenantB no ve documentos asociados del comprobante de tenantA (REQ-S-01)', async () => {
    const compA = await createComprobante(tenantA, periodoId);
    const docA = await createDocumento(tenantA, tipoId);
    await asociar(tenantA, compA, docA);

    // tenantB preguntando por el comprobante de tenantA.
    const docs = await adapter.listarAsociadosDeComprobante(tenantB, compA);

    expect(docs).toEqual([]);
    // Sanity: tenantB con su propio comprobante también queda aislado.
    const compB = await createComprobante(tenantB, periodoBId);
    const docB = await createDocumento(tenantB, tipoBId);
    await asociar(tenantB, compB, docB);
    const docsB = await adapter.listarAsociadosDeComprobante(tenantA, compB);
    expect(docsB).toEqual([]);
  });
});
