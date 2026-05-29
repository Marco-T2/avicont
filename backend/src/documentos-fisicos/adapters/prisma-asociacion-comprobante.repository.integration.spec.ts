import { EstadoComprobante, Moneda, Prisma, PrismaClient, TipoComprobante } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { DocumentoFisicoYaAsociadoAOtroContabilizadoError } from '../domain/documento-fisico-errors';
import type { AsociarInput } from '../ports/asociacion-comprobante.repository.port';
import { PrismaAsociacionComprobanteRepository } from './prisma-asociacion-comprobante.repository';

/**
 * Integration spec del `PrismaAsociacionComprobanteRepository` contra
 * Postgres real. Valida las reglas que SOLO Postgres puede garantizar:
 *
 *   - UNIQUE `(documentoFisicoId, comprobanteId)` — idempotencia / error claro.
 *   - UNIQUE PARCIAL `comprobante_documento_fisico_unique_contabilizado`
 *     → mapeado a `DocumentoFisicoYaAsociadoAOtroContabilizadoError` (R3).
 *   - `refrescarEstadoComprobante`: UPDATE en BD → estado cache correcto (R1).
 *   - `desasociarTodasDelComprobante`: borra SOLO filas del comprobante.
 *   - Multi-tenancy: ningún método cruza tenants.
 *   - `listarPorComprobante` y `listarPorDocumento` filtran por tenant.
 *
 * Cubre: REQ-A-04, REQ-A-05, REQ-A-07. D2 (cache estado), R1, R3.
 * E-A-02, E-A-03, E-A-06 a nivel integration.
 */
describe('PrismaAsociacionComprobanteRepository (integration)', () => {
  const SLUG_A = 'org-test-asoc-a';
  const SLUG_B = 'org-test-asoc-b';
  const USER_EMAIL_PREFIX = 'user-seed-asoc-';

  let prisma: PrismaClient;
  let repo: PrismaAsociacionComprobanteRepository;
  let tenantA: string;
  let tenantB: string;
  let userId: string;
  let tipoId: string;
  let tipoBId: string;
  let periodoId: string;
  let periodoBId: string;

  // ----------------------------------------------------------------
  // Setup / teardown
  // ----------------------------------------------------------------

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaAsociacionComprobanteRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();

    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org Asoc A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org Asoc B' } }),
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
          nombre: 'Factura',
          codigo: 'factura',
          esTributario: true,
          tiposComprobanteAplicables: [TipoComprobante.EGRESO],
          createdByUserId: userId,
        },
      }),
      prisma.tipoDocumentoFisico.create({
        data: {
          organizationId: tenantB,
          nombre: 'Factura B',
          codigo: 'factura-b',
          esTributario: true,
          tiposComprobanteAplicables: [TipoComprobante.EGRESO],
          createdByUserId: userId,
        },
      }),
    ]);
    tipoId = tA.id;
    tipoBId = tB.id;

    periodoId = await createPeriodo(tenantA);
    periodoBId = await createPeriodo(tenantB);
  });

  // ----------------------------------------------------------------
  // Cleanup helpers
  // ----------------------------------------------------------------

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      // Orden FK: asociaciones → documentos → tipos → comprobantes → org
      await prisma.comprobanteDocumentoFisico.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.documentoFisico.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.tipoDocumentoFisico.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.comprobante.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.secuenciaComprobante.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.periodoFiscal.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.gestionFiscal.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
    }
    await prisma.organization.deleteMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: USER_EMAIL_PREFIX } },
    });
  }

  // ----------------------------------------------------------------
  // Fixture helpers
  // ----------------------------------------------------------------

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

  async function createComprobante(
    orgId: string,
    pId: string,
    estado: EstadoComprobante = EstadoComprobante.BORRADOR,
  ): Promise<string> {
    const comp = await prisma.comprobante.create({
      data: {
        organizationId: orgId,
        tipo: TipoComprobante.EGRESO,
        estado,
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
        monto: new Prisma.Decimal('100.00'),
        moneda: Moneda.BOB,
        createdByUserId: userId,
      },
    });
    return doc.id;
  }

  function buildAsociarInput(
    comprobanteId: string,
    documentoFisicoId: string,
    estado: EstadoComprobante = EstadoComprobante.BORRADOR,
  ): AsociarInput {
    return { comprobanteId, documentoFisicoId, comprobanteEstado: estado };
  }

  // ================================================================
  // asociar — happy path
  // ================================================================

  it('asociar — crea la asociación y retorna la fila creada', async () => {
    const compId = await createComprobante(tenantA, periodoId);
    const docId = await createDocumento(tenantA, tipoId);

    const fila = await repo.asociar(tenantA, buildAsociarInput(compId, docId));

    expect(fila.id).toBeDefined();
    expect(fila.organizationId).toBe(tenantA);
    expect(fila.comprobanteId).toBe(compId);
    expect(fila.documentoFisicoId).toBe(docId);
    expect(fila.comprobanteEstado).toBe(EstadoComprobante.BORRADOR);
  });

  // E-A-02: un mismo docId puede asociarse a múltiples BORRADORes
  it('asociar — mismo docId en dos BORRADOR es permitido (E-A-02)', async () => {
    const comp1 = await createComprobante(tenantA, periodoId);
    const comp2 = await createComprobante(tenantA, periodoId);
    const docId = await createDocumento(tenantA, tipoId);

    const f1 = await repo.asociar(tenantA, buildAsociarInput(comp1, docId));
    const f2 = await repo.asociar(tenantA, buildAsociarInput(comp2, docId));

    expect(f1.id).toBeDefined();
    expect(f2.id).toBeDefined();
    expect(f1.id).not.toBe(f2.id);
  });

  // E-A-03 + R3: UNIQUE PARCIAL viola → DocumentoFisicoYaAsociadoAOtroContabilizadoError
  // CRÍTICO: este test provoca la violación y verifica el mapeo de meta.target.
  it(
    'asociar + refrescarEstadoComprobante — UNIQUE PARCIAL: docId en comp-A→CONTABILIZADO, ' +
      'luego comp-B→CONTABILIZADO con el mismo docId → DocumentoFisicoYaAsociadoAOtroContabilizadoError (E-A-03)',
    async () => {
      const compA = await createComprobante(tenantA, periodoId);
      const compB = await createComprobante(tenantA, periodoId);
      const docId = await createDocumento(tenantA, tipoId);

      // Ambos comprobantes inician en BORRADOR con el mismo docId
      await repo.asociar(tenantA, buildAsociarInput(compA, docId, EstadoComprobante.BORRADOR));
      await repo.asociar(tenantA, buildAsociarInput(compB, docId, EstadoComprobante.BORRADOR));

      // comp-A se contabiliza: su fila de asociación pasa a CONTABILIZADO
      await repo.refrescarEstadoComprobante(tenantA, compA, EstadoComprobante.CONTABILIZADO);

      // comp-B intenta contabilizarse: UNIQUE PARCIAL debe reventar
      await expect(
        repo.refrescarEstadoComprobante(tenantA, compB, EstadoComprobante.CONTABILIZADO),
      ).rejects.toBeInstanceOf(DocumentoFisicoYaAsociadoAOtroContabilizadoError);
    },
  );

  // E-A-12 + E-A-17 + REQ-A-13: asociar DIRECTAMENTE con comprobanteEstado=CONTABILIZADO
  // (rama nueva de asociarDocumentos sobre un comprobante ya contabilizado).
  // El cache se persiste como CONTABILIZADO y el UNIQUE PARCIAL bloquea un
  // segundo INSERT del mismo docId en otro comprobante CONTABILIZADO.
  it(
    'asociar con comprobanteEstado=CONTABILIZADO — persiste el cache y el UNIQUE PARCIAL ' +
      'rechaza un segundo CONTABILIZADO para el mismo docId (E-A-12/E-A-17, REQ-A-13)',
    async () => {
      const compA = await createComprobante(tenantA, periodoId, EstadoComprobante.CONTABILIZADO);
      const compB = await createComprobante(tenantA, periodoId, EstadoComprobante.CONTABILIZADO);
      const docId = await createDocumento(tenantA, tipoId);

      const fila = await repo.asociar(
        tenantA,
        buildAsociarInput(compA, docId, EstadoComprobante.CONTABILIZADO),
      );
      expect(fila.comprobanteEstado).toBe(EstadoComprobante.CONTABILIZADO);

      // Verificación directa en BD del cache (REQ-A-13: no hardcode a BORRADOR).
      const persistida = await prisma.comprobanteDocumentoFisico.findFirst({
        where: { comprobanteId: compA, documentoFisicoId: docId },
      });
      expect(persistida?.comprobanteEstado).toBe(EstadoComprobante.CONTABILIZADO);

      // Segundo CONTABILIZADO con el mismo docId → UNIQUE PARCIAL revienta.
      await expect(
        repo.asociar(tenantA, buildAsociarInput(compB, docId, EstadoComprobante.CONTABILIZADO)),
      ).rejects.toBeInstanceOf(DocumentoFisicoYaAsociadoAOtroContabilizadoError);
    },
  );

  // REQ-A-05: con comprobanteEstado=BORRADOR, el mismo docId SÍ puede asociarse
  // a un comprobante adicional aunque ya esté en uno CONTABILIZADO — el índice
  // parcial solo aplica a filas CONTABILIZADO.
  it('asociar — un docId ya CONTABILIZADO en compA SÍ admite una fila BORRADOR en compB (REQ-A-05)', async () => {
    const compA = await createComprobante(tenantA, periodoId, EstadoComprobante.CONTABILIZADO);
    const compB = await createComprobante(tenantA, periodoId, EstadoComprobante.BORRADOR);
    const docId = await createDocumento(tenantA, tipoId);

    await repo.asociar(tenantA, buildAsociarInput(compA, docId, EstadoComprobante.CONTABILIZADO));
    const fila = await repo.asociar(
      tenantA,
      buildAsociarInput(compB, docId, EstadoComprobante.BORRADOR),
    );

    expect(fila.id).toBeDefined();
    expect(fila.comprobanteEstado).toBe(EstadoComprobante.BORRADOR);
  });

  // ================================================================
  // refrescarEstadoComprobante — R1 (cache drift)
  // ================================================================

  it('refrescarEstadoComprobante — actualiza comprobanteEstado en BD a CONTABILIZADO (R1)', async () => {
    const compId = await createComprobante(tenantA, periodoId);
    const docId = await createDocumento(tenantA, tipoId);

    await repo.asociar(tenantA, buildAsociarInput(compId, docId));

    const filas = await repo.refrescarEstadoComprobante(
      tenantA,
      compId,
      EstadoComprobante.CONTABILIZADO,
    );
    expect(filas).toBe(1);

    // Verificar en BD directamente
    const fila = await prisma.comprobanteDocumentoFisico.findFirst({
      where: { comprobanteId: compId, documentoFisicoId: docId },
    });
    expect(fila?.comprobanteEstado).toBe(EstadoComprobante.CONTABILIZADO);
  });

  it('refrescarEstadoComprobante — retorna 0 si el comprobante no tiene asociaciones', async () => {
    const compId = await createComprobante(tenantA, periodoId);

    const count = await repo.refrescarEstadoComprobante(
      tenantA,
      compId,
      EstadoComprobante.CONTABILIZADO,
    );
    expect(count).toBe(0);
  });

  it('refrescarEstadoComprobante — no afecta filas de otro tenant', async () => {
    const compA = await createComprobante(tenantA, periodoId);
    const compB = await createComprobante(tenantB, periodoBId);
    const docA = await createDocumento(tenantA, tipoId);
    const docB = await createDocumento(tenantB, tipoBId);

    await repo.asociar(tenantA, buildAsociarInput(compA, docA));
    await repo.asociar(tenantB, buildAsociarInput(compB, docB));

    // Solo refrescar el de tenantA
    await repo.refrescarEstadoComprobante(tenantA, compA, EstadoComprobante.CONTABILIZADO);

    // La fila de tenantB sigue en BORRADOR
    const filaB = await prisma.comprobanteDocumentoFisico.findFirst({
      where: { comprobanteId: compB },
    });
    expect(filaB?.comprobanteEstado).toBe(EstadoComprobante.BORRADOR);
  });

  it('refrescarEstadoComprobante — actualiza todas las filas del comprobante', async () => {
    const compId = await createComprobante(tenantA, periodoId);
    const doc1 = await createDocumento(tenantA, tipoId, 'F-0001');
    const doc2 = await createDocumento(tenantA, tipoId, 'F-0002');

    await repo.asociar(tenantA, buildAsociarInput(compId, doc1));
    await repo.asociar(tenantA, buildAsociarInput(compId, doc2));

    const count = await repo.refrescarEstadoComprobante(
      tenantA,
      compId,
      EstadoComprobante.CONTABILIZADO,
    );
    expect(count).toBe(2);

    const filas = await prisma.comprobanteDocumentoFisico.findMany({
      where: { comprobanteId: compId },
    });
    expect(filas.every((f) => f.comprobanteEstado === EstadoComprobante.CONTABILIZADO)).toBe(true);
  });

  // ================================================================
  // desasociarTodasDelComprobante
  // ================================================================

  it('desasociarTodasDelComprobante — borra SOLO las filas del comprobante indicado', async () => {
    const compA = await createComprobante(tenantA, periodoId);
    const compB = await createComprobante(tenantA, periodoId);
    const doc1 = await createDocumento(tenantA, tipoId, 'F-0001');
    const doc2 = await createDocumento(tenantA, tipoId, 'F-0002');

    await repo.asociar(tenantA, buildAsociarInput(compA, doc1));
    await repo.asociar(tenantA, buildAsociarInput(compB, doc2));

    const count = await repo.desasociarTodasDelComprobante(tenantA, compA);
    expect(count).toBe(1);

    // La fila de compB sigue intacta
    const filasB = await prisma.comprobanteDocumentoFisico.findMany({
      where: { comprobanteId: compB },
    });
    expect(filasB.length).toBe(1);
  });

  it('desasociarTodasDelComprobante — retorna 0 si no hay asociaciones (idempotente)', async () => {
    const compId = await createComprobante(tenantA, periodoId);
    const count = await repo.desasociarTodasDelComprobante(tenantA, compId);
    expect(count).toBe(0);
  });

  it('desasociarTodasDelComprobante — no cruza tenants', async () => {
    const compB = await createComprobante(tenantB, periodoBId);
    const docB = await createDocumento(tenantB, tipoBId);

    await repo.asociar(tenantB, buildAsociarInput(compB, docB));

    // Intentar desasociar con tenantA para el compId de B → no debe afectar nada de B
    const count = await repo.desasociarTodasDelComprobante(tenantA, compB);
    expect(count).toBe(0);

    // La fila de B sigue intacta
    const filasB = await prisma.comprobanteDocumentoFisico.findMany({
      where: { comprobanteId: compB },
    });
    expect(filasB.length).toBe(1);
  });

  // ================================================================
  // desasociar (una fila específica)
  // ================================================================

  it('desasociar — borra la fila indicada y retorna 1', async () => {
    const compId = await createComprobante(tenantA, periodoId);
    const docId = await createDocumento(tenantA, tipoId);

    await repo.asociar(tenantA, buildAsociarInput(compId, docId));

    const count = await repo.desasociar(tenantA, compId, docId);
    expect(count).toBe(1);

    const fila = await prisma.comprobanteDocumentoFisico.findFirst({
      where: { comprobanteId: compId, documentoFisicoId: docId },
    });
    expect(fila).toBeNull();
  });

  it('desasociar — retorna 0 si la fila no existía (idempotente)', async () => {
    const compId = await createComprobante(tenantA, periodoId);
    const docId = await createDocumento(tenantA, tipoId);

    const count = await repo.desasociar(tenantA, compId, docId);
    expect(count).toBe(0);
  });

  it('desasociar — no cruza tenants', async () => {
    const compA = await createComprobante(tenantA, periodoId);
    const docA = await createDocumento(tenantA, tipoId);

    await repo.asociar(tenantA, buildAsociarInput(compA, docA));

    // Intento de desasociar con tenantB → no debe borrar nada
    const count = await repo.desasociar(tenantB, compA, docA);
    expect(count).toBe(0);

    // La fila de tenantA sigue intacta
    const fila = await prisma.comprobanteDocumentoFisico.findFirst({
      where: { comprobanteId: compA, documentoFisicoId: docA },
    });
    expect(fila).not.toBeNull();
  });

  // ================================================================
  // listarPorComprobante
  // ================================================================

  it('listarPorComprobante — devuelve solo las filas del comprobante y tenant indicados', async () => {
    const compA = await createComprobante(tenantA, periodoId);
    const compB = await createComprobante(tenantA, periodoId);
    const doc1 = await createDocumento(tenantA, tipoId, 'F-0001');
    const doc2 = await createDocumento(tenantA, tipoId, 'F-0002');

    await repo.asociar(tenantA, buildAsociarInput(compA, doc1));
    await repo.asociar(tenantA, buildAsociarInput(compB, doc2));

    const filas = await repo.listarPorComprobante(tenantA, compA);
    expect(filas.length).toBe(1);
    expect(filas[0]?.documentoFisicoId).toBe(doc1);
  });

  it('listarPorComprobante — no cruza tenants', async () => {
    const compA = await createComprobante(tenantA, periodoId);
    const docA = await createDocumento(tenantA, tipoId);

    await repo.asociar(tenantA, buildAsociarInput(compA, docA));

    // tenantB preguntando por el compId de tenantA
    const filas = await repo.listarPorComprobante(tenantB, compA);
    expect(filas.length).toBe(0);
  });

  // ================================================================
  // listarPorDocumento
  // ================================================================

  it('listarPorDocumento — devuelve todas las asociaciones del documento en el tenant', async () => {
    const comp1 = await createComprobante(tenantA, periodoId);
    const comp2 = await createComprobante(tenantA, periodoId);
    const docId = await createDocumento(tenantA, tipoId);

    await repo.asociar(tenantA, buildAsociarInput(comp1, docId));
    await repo.asociar(tenantA, buildAsociarInput(comp2, docId));

    const filas = await repo.listarPorDocumento(tenantA, docId);
    expect(filas.length).toBe(2);
  });

  it('listarPorDocumento — no cruza tenants', async () => {
    const compA = await createComprobante(tenantA, periodoId);
    const docA = await createDocumento(tenantA, tipoId);

    await repo.asociar(tenantA, buildAsociarInput(compA, docA));

    // tenantB preguntando por el docId de tenantA
    const filas = await repo.listarPorDocumento(tenantB, docA);
    expect(filas.length).toBe(0);
  });
});
