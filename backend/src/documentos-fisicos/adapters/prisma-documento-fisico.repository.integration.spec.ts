import { EstadoComprobante, Moneda, Prisma, PrismaClient, TipoComprobante } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { DocumentoFisicoNumeroDuplicadoError } from '../domain/documento-fisico-errors';
import {
  type DocumentoFisicoCreateData,
  type DocumentoFisicoListarFiltros,
  type DocumentoFisicoListarPagination,
} from '../ports/documento-fisico.repository.port';
import { PrismaDocumentoFisicoRepository } from './prisma-documento-fisico.repository';

/**
 * Integration spec del `PrismaDocumentoFisicoRepository` contra
 * Postgres real. Valida las reglas que SOLO Postgres puede contestar:
 *
 *   - UNIQUE `(organizationId, tipoDocumentoFisicoId, numero)`.
 *   - Número duplicado con tipo DISTINTO → permitido (E-D-04).
 *   - Multi-tenancy: ningún método cruza tenants.
 *   - Filtros de estado derivado vía `asociaciones` Prisma.
 *   - Paginación offset correcta.
 *   - countAsociaciones y countAsociacionesContabilizadas.
 *   - PATCH parcial (update) sólo toca los campos enviados.
 *
 * Cubre: REQ-D-03, REQ-D-09, REQ-D-12. E-D-03, E-D-04, E-D-11.
 * D4 (filtros + paginación offset). D7 (count para mutabilidad).
 */
describe('PrismaDocumentoFisicoRepository (integration)', () => {
  const SLUG_A = 'org-test-df-a';
  const SLUG_B = 'org-test-df-b';
  const USER_EMAIL_PREFIX = 'user-seed-df-';

  let prisma: PrismaClient;
  let repo: PrismaDocumentoFisicoRepository;
  let tenantA: string;
  let tenantB: string;
  let userId: string;
  let tipoTributario: string;
  let tipoNoTributario: string;
  let tipoB: string; // tipo del tenant B

  // ----------------------------------------------------------------
  // Setup / teardown
  // ----------------------------------------------------------------

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaDocumentoFisicoRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();

    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org DF A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org DF B' } }),
    ]);
    tenantA = orgA.id;
    tenantB = orgB.id;

    const user = await prisma.user.create({
      data: { email: `${USER_EMAIL_PREFIX}main@test.local`, hashedPassword: 'x' },
    });
    userId = user.id;

    const [tA1, tA2, tB1] = await Promise.all([
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
          organizationId: tenantA,
          nombre: 'Recibo',
          codigo: 'recibo',
          esTributario: false,
          tiposComprobanteAplicables: [TipoComprobante.INGRESO],
          createdByUserId: userId,
        },
      }),
      prisma.tipoDocumentoFisico.create({
        data: {
          organizationId: tenantB,
          nombre: 'Recibo B',
          codigo: 'recibo-b',
          esTributario: false,
          tiposComprobanteAplicables: [],
          createdByUserId: userId,
        },
      }),
    ]);
    tipoTributario = tA1.id;
    tipoNoTributario = tA2.id;
    tipoB = tB1.id;
  });

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      // Orden FK: asociaciones → documentos → tipos → comprobantes (cascade) → org
      await prisma.comprobanteDocumentoFisico.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.documentoFisico.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      // Contactos: FK Restrict desde DocumentoFisico → borrar DESPUÉS de documentos.
      await prisma.contacto.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.tipoDocumentoFisico.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      // Comprobante cascadea lineas y auditorias
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

  /** Dato base válido para crear un DocumentoFisico tributario en tenantA. */
  function baseCreateData(
    overrides: Partial<DocumentoFisicoCreateData> = {},
  ): DocumentoFisicoCreateData {
    return {
      tipoDocumentoFisicoId: tipoTributario,
      numero: 'F-0001',
      fechaEmision: new Date('2026-04-01'),
      monto: new Prisma.Decimal('150.00'),
      moneda: Moneda.BOB,
      glosa: null,
      contactoId: null,
      createdByUserId: userId,
      ...overrides,
    };
  }

  const defaultPagination: DocumentoFisicoListarPagination = { page: 1, limit: 20 };

  // ----------------------------------------------------------------
  // Helpers para crear fixtures relacionados (Comprobante + Periodo)
  // ----------------------------------------------------------------

  async function createPeriodo(tenantId: string): Promise<string> {
    const gestion = await prisma.gestionFiscal.create({
      data: { organizationId: tenantId, year: 2026, mesInicio: 1 },
    });
    const periodo = await prisma.periodoFiscal.create({
      data: {
        organizationId: tenantId,
        gestionId: gestion.id,
        year: 2026,
        month: 4,
        ordenEnGestion: 4,
      },
    });
    return periodo.id;
  }

  async function createComprobante(
    tenantId: string,
    periodoId: string,
    estado: EstadoComprobante = EstadoComprobante.BORRADOR,
  ): Promise<string> {
    const comp = await prisma.comprobante.create({
      data: {
        organizationId: tenantId,
        tipo: TipoComprobante.EGRESO,
        estado,
        fechaContable: new Date('2026-04-15'),
        periodoFiscalId: periodoId,
        glosa: 'Test',
        monedaPrincipal: Moneda.BOB,
        createdByUserId: userId,
      },
    });
    return comp.id;
  }

  async function asociar(
    tenantId: string,
    comprobanteId: string,
    documentoFisicoId: string,
    estado: EstadoComprobante = EstadoComprobante.BORRADOR,
  ) {
    return prisma.comprobanteDocumentoFisico.create({
      data: {
        organizationId: tenantId,
        comprobanteId,
        documentoFisicoId,
        comprobanteEstado: estado,
      },
    });
  }

  async function createContacto(tenantId: string, razonSocial: string): Promise<string> {
    const contacto = await prisma.contacto.create({
      data: {
        organizationId: tenantId,
        razonSocial,
        esProveedor: true,
        createdByUserId: userId,
      },
    });
    return contacto.id;
  }

  // ==========================================================
  // create — happy path
  // ==========================================================

  it('create — persiste el documento y retorna el registro creado', async () => {
    const doc = await repo.create(tenantA, baseCreateData());
    expect(doc.id).toBeDefined();
    expect(doc.organizationId).toBe(tenantA);
    expect(doc.numero).toBe('F-0001');
    expect(doc.tipoDocumentoFisicoId).toBe(tipoTributario);
    expect(new Prisma.Decimal(doc.monto!).equals(new Prisma.Decimal('150.00'))).toBe(true);
    expect(doc.moneda).toBe(Moneda.BOB);
  });

  it('create — acepta monto y moneda nulos (tipo no-tributario)', async () => {
    const doc = await repo.create(
      tenantA,
      baseCreateData({ tipoDocumentoFisicoId: tipoNoTributario, monto: null, moneda: null }),
    );
    expect(doc.monto).toBeNull();
    expect(doc.moneda).toBeNull();
  });

  it('create — guarda glosa cuando se provee', async () => {
    const doc = await repo.create(tenantA, baseCreateData({ glosa: 'Pago proveedor ABC' }));
    expect(doc.glosa).toBe('Pago proveedor ABC');
  });

  // ==========================================================
  // UNIQUE numero — E-D-03 y E-D-04
  // ==========================================================

  it('UNIQUE numero — mismo tipo mismo tenant → DocumentoFisicoNumeroDuplicadoError (E-D-03)', async () => {
    await repo.create(tenantA, baseCreateData({ numero: 'F-0001' }));
    await expect(repo.create(tenantA, baseCreateData({ numero: 'F-0001' }))).rejects.toBeInstanceOf(
      DocumentoFisicoNumeroDuplicadoError,
    );
  });

  it('UNIQUE numero — mismo numero con tipo DISTINTO → permitido (E-D-04)', async () => {
    await repo.create(
      tenantA,
      baseCreateData({ tipoDocumentoFisicoId: tipoTributario, numero: 'DOC-001' }),
    );
    const doc2 = await repo.create(
      tenantA,
      baseCreateData({
        tipoDocumentoFisicoId: tipoNoTributario,
        numero: 'DOC-001',
        monto: null,
        moneda: null,
      }),
    );
    expect(doc2.id).toBeDefined();
  });

  it('UNIQUE numero — mismo numero mismo tipo en tenant DISTINTO → permitido (aislamiento)', async () => {
    await repo.create(tenantA, baseCreateData({ numero: 'F-0001' }));
    const doc2 = await repo.create(
      tenantB,
      baseCreateData({ tipoDocumentoFisicoId: tipoB, numero: 'F-0001', monto: null, moneda: null }),
    );
    expect(doc2.id).toBeDefined();
  });

  // ==========================================================
  // findById — multi-tenancy
  // ==========================================================

  it('findById — retorna el documento si es del tenant correcto', async () => {
    const doc = await repo.create(tenantA, baseCreateData());
    const found = await repo.findById(tenantA, doc.id);
    expect(found?.id).toBe(doc.id);
  });

  it('findById — retorna null si el id pertenece a otro tenant (defense in depth)', async () => {
    const doc = await repo.create(tenantA, baseCreateData());
    const cross = await repo.findById(tenantB, doc.id);
    expect(cross).toBeNull();
  });

  it('findById — retorna null si el id no existe', async () => {
    const notFound = await repo.findById(tenantA, '00000000-0000-0000-0000-000000000000');
    expect(notFound).toBeNull();
  });

  // ==========================================================
  // findByNumero
  // ==========================================================

  it('findByNumero — devuelve el documento si existe en el tenant', async () => {
    const doc = await repo.create(tenantA, baseCreateData({ numero: 'F-0001' }));
    const found = await repo.findByNumero(tenantA, tipoTributario, 'F-0001');
    expect(found?.id).toBe(doc.id);
  });

  it('findByNumero — no cruza tenants', async () => {
    await repo.create(tenantA, baseCreateData({ numero: 'F-0001' }));
    const cross = await repo.findByNumero(tenantB, tipoTributario, 'F-0001');
    expect(cross).toBeNull();
  });

  it('findByNumero — distingue por tipo (mismo numero, tipo distinto → null)', async () => {
    await repo.create(
      tenantA,
      baseCreateData({ tipoDocumentoFisicoId: tipoTributario, numero: 'DOC-001' }),
    );
    const cross = await repo.findByNumero(tenantA, tipoNoTributario, 'DOC-001');
    expect(cross).toBeNull();
  });

  // ==========================================================
  // listar — filtros básicos
  // ==========================================================

  it('listar — no cruza tenants (aislamiento multi-tenant)', async () => {
    await repo.create(tenantA, baseCreateData());
    const { total } = await repo.listar(tenantB, {}, defaultPagination);
    expect(total).toBe(0);
  });

  it('listar — filtra por tipoDocumentoFisicoId', async () => {
    await repo.create(
      tenantA,
      baseCreateData({ tipoDocumentoFisicoId: tipoTributario, numero: 'F-001' }),
    );
    await repo.create(
      tenantA,
      baseCreateData({
        tipoDocumentoFisicoId: tipoNoTributario,
        numero: 'R-001',
        monto: null,
        moneda: null,
      }),
    );
    const filtros: DocumentoFisicoListarFiltros = { tipoDocumentoFisicoId: tipoTributario };
    const { items, total } = await repo.listar(tenantA, filtros, defaultPagination);
    expect(total).toBe(1);
    expect(items[0]?.tipoDocumentoFisicoId).toBe(tipoTributario);
  });

  it('listar — filtra por fechaDesde y fechaHasta', async () => {
    await repo.create(
      tenantA,
      baseCreateData({ numero: 'F-001', fechaEmision: new Date('2026-03-01') }),
    );
    await repo.create(
      tenantA,
      baseCreateData({ numero: 'F-002', fechaEmision: new Date('2026-04-15') }),
    );
    await repo.create(
      tenantA,
      baseCreateData({ numero: 'F-003', fechaEmision: new Date('2026-05-01') }),
    );

    const filtros: DocumentoFisicoListarFiltros = {
      fechaDesde: new Date('2026-04-01'),
      fechaHasta: new Date('2026-04-30'),
    };
    const { items, total } = await repo.listar(tenantA, filtros, defaultPagination);
    expect(total).toBe(1);
    expect(items[0]?.numero).toBe('F-002');
  });

  // ==========================================================
  // listar — filtro estado derivado (E-D-11)
  // ==========================================================

  it('listar estado=libre — solo documentos sin ninguna asociación', async () => {
    const periodoId = await createPeriodo(tenantA);
    const compId = await createComprobante(tenantA, periodoId);

    const doc1 = await repo.create(tenantA, baseCreateData({ numero: 'F-001' }));
    const doc2 = await repo.create(tenantA, baseCreateData({ numero: 'F-002' }));

    // Solo doc2 queda libre
    await asociar(tenantA, compId, doc1.id);

    const filtros: DocumentoFisicoListarFiltros = { estado: 'libre' };
    const { items, total } = await repo.listar(tenantA, filtros, defaultPagination);
    expect(total).toBe(1);
    expect(items[0]?.id).toBe(doc2.id);
  });

  it('listar estado=asociado — solo documentos con >= 1 asociación (cualquier estado)', async () => {
    const periodoId = await createPeriodo(tenantA);
    const compId = await createComprobante(tenantA, periodoId);

    const doc1 = await repo.create(tenantA, baseCreateData({ numero: 'F-001' }));
    await repo.create(tenantA, baseCreateData({ numero: 'F-002' }));

    // Solo doc1 tiene asociación
    await asociar(tenantA, compId, doc1.id);

    const filtros: DocumentoFisicoListarFiltros = { estado: 'asociado' };
    const { items, total } = await repo.listar(tenantA, filtros, defaultPagination);
    expect(total).toBe(1);
    expect(items[0]?.id).toBe(doc1.id);
  });

  it('listar estado=contabilizado — solo documentos con >= 1 asociación CONTABILIZADA', async () => {
    const periodoId = await createPeriodo(tenantA);
    const compBorradorId = await createComprobante(tenantA, periodoId, EstadoComprobante.BORRADOR);
    const compContId = await createComprobante(tenantA, periodoId, EstadoComprobante.CONTABILIZADO);

    const doc1 = await repo.create(tenantA, baseCreateData({ numero: 'F-001' }));
    const doc2 = await repo.create(tenantA, baseCreateData({ numero: 'F-002' }));

    // doc1 solo tiene asociación BORRADOR
    await asociar(tenantA, compBorradorId, doc1.id, EstadoComprobante.BORRADOR);
    // doc2 tiene asociación CONTABILIZADA
    await asociar(tenantA, compContId, doc2.id, EstadoComprobante.CONTABILIZADO);

    const filtros: DocumentoFisicoListarFiltros = { estado: 'contabilizado' };
    const { items, total } = await repo.listar(tenantA, filtros, defaultPagination);
    expect(total).toBe(1);
    expect(items[0]?.id).toBe(doc2.id);
  });

  // ==========================================================
  // listar — paginación offset
  // ==========================================================

  it('paginación — page 1 y page 2 devuelven conjuntos distintos', async () => {
    // Crea 5 documentos
    for (let i = 1; i <= 5; i++) {
      await repo.create(
        tenantA,
        baseCreateData({ numero: `F-00${i}`, fechaEmision: new Date(`2026-04-0${i}`) }),
      );
    }
    const page1 = await repo.listar(tenantA, {}, { page: 1, limit: 3 });
    const page2 = await repo.listar(tenantA, {}, { page: 2, limit: 3 });

    expect(page1.items.length).toBe(3);
    expect(page2.items.length).toBe(2);
    expect(page1.total).toBe(5);
    expect(page2.total).toBe(5);

    const ids1 = page1.items.map((i) => i.id);
    const ids2 = page2.items.map((i) => i.id);
    // No deben solaparse
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  });

  it('paginación — total refleja el universo completo sin importar la página', async () => {
    for (let i = 1; i <= 4; i++) {
      await repo.create(tenantA, baseCreateData({ numero: `F-00${i}` }));
    }
    const { total } = await repo.listar(tenantA, {}, { page: 2, limit: 10 });
    expect(total).toBe(4);
  });

  // ==========================================================
  // update — PATCH semántico
  // ==========================================================

  it('update — sólo modifica los campos presentes en el data', async () => {
    const doc = await repo.create(tenantA, baseCreateData({ glosa: 'original', numero: 'F-001' }));
    const updated = await repo.update(tenantA, doc.id, { glosa: 'actualizada' });
    expect(updated.glosa).toBe('actualizada');
    expect(updated.numero).toBe('F-001'); // intacto
    expect(updated.tipoDocumentoFisicoId).toBe(tipoTributario); // intacto
  });

  it('update — puede cambiar el numero del documento', async () => {
    const doc = await repo.create(tenantA, baseCreateData({ numero: 'F-001' }));
    const updated = await repo.update(tenantA, doc.id, { numero: 'F-999' });
    expect(updated.numero).toBe('F-999');
  });

  it('update — puede setear monto y moneda a null', async () => {
    const doc = await repo.create(
      tenantA,
      baseCreateData({ monto: new Prisma.Decimal('100.00'), moneda: Moneda.BOB }),
    );
    const updated = await repo.update(tenantA, doc.id, { monto: null, moneda: null });
    expect(updated.monto).toBeNull();
    expect(updated.moneda).toBeNull();
  });

  it('update — no afecta a documentos de otro tenant', async () => {
    const docA = await repo.create(tenantA, baseCreateData({ numero: 'F-001' }));
    // Intento de update desde tenant B: el documento no existe para B
    await expect(repo.update(tenantB, docA.id, { glosa: 'hack' })).rejects.toBeDefined();
  });

  // ==========================================================
  // eliminar
  // ==========================================================

  it('eliminar — devuelve 1 cuando el documento existe', async () => {
    const doc = await repo.create(tenantA, baseCreateData());
    const count = await repo.eliminar(tenantA, doc.id);
    expect(count).toBe(1);
    expect(await repo.findById(tenantA, doc.id)).toBeNull();
  });

  it('eliminar — devuelve 0 si el id pertenece a otro tenant', async () => {
    const doc = await repo.create(tenantA, baseCreateData());
    const count = await repo.eliminar(tenantB, doc.id);
    expect(count).toBe(0);
    // Documento sigue existiendo en tenantA
    expect(await repo.findById(tenantA, doc.id)).not.toBeNull();
  });

  // ==========================================================
  // countAsociaciones — D7 (para política de mutabilidad)
  // ==========================================================

  it('countAsociaciones — retorna 0 si el documento no tiene asociaciones', async () => {
    const doc = await repo.create(tenantA, baseCreateData());
    const count = await repo.countAsociaciones(tenantA, doc.id);
    expect(count).toBe(0);
  });

  it('countAsociaciones — cuenta asociaciones en cualquier estado', async () => {
    const periodoId = await createPeriodo(tenantA);
    const comp1 = await createComprobante(tenantA, periodoId, EstadoComprobante.BORRADOR);
    const comp2 = await createComprobante(tenantA, periodoId, EstadoComprobante.CONTABILIZADO);

    const doc = await repo.create(tenantA, baseCreateData());
    await asociar(tenantA, comp1, doc.id, EstadoComprobante.BORRADOR);
    await asociar(tenantA, comp2, doc.id, EstadoComprobante.CONTABILIZADO);

    const count = await repo.countAsociaciones(tenantA, doc.id);
    expect(count).toBe(2);
  });

  it('countAsociaciones — no cruza tenants', async () => {
    const periodoA = await createPeriodo(tenantA);
    const compA = await createComprobante(tenantA, periodoA);
    const doc = await repo.create(tenantA, baseCreateData());
    await asociar(tenantA, compA, doc.id);

    // Consultar desde tenantB con el mismo docId → 0
    const count = await repo.countAsociaciones(tenantB, doc.id);
    expect(count).toBe(0);
  });

  // ==========================================================
  // countAsociacionesContabilizadas — D7
  // ==========================================================

  it('countAsociacionesContabilizadas — retorna 0 si no hay asociaciones contabilizadas', async () => {
    const periodoId = await createPeriodo(tenantA);
    const comp = await createComprobante(tenantA, periodoId, EstadoComprobante.BORRADOR);
    const doc = await repo.create(tenantA, baseCreateData());
    await asociar(tenantA, comp, doc.id, EstadoComprobante.BORRADOR);

    const count = await repo.countAsociacionesContabilizadas(tenantA, doc.id);
    expect(count).toBe(0);
  });

  it('countAsociacionesContabilizadas — cuenta solo asociaciones CONTABILIZADAS', async () => {
    const periodoId = await createPeriodo(tenantA);
    const compBorrador = await createComprobante(tenantA, periodoId, EstadoComprobante.BORRADOR);
    const compCont = await createComprobante(tenantA, periodoId, EstadoComprobante.CONTABILIZADO);

    const doc = await repo.create(tenantA, baseCreateData());
    await asociar(tenantA, compBorrador, doc.id, EstadoComprobante.BORRADOR);
    await asociar(tenantA, compCont, doc.id, EstadoComprobante.CONTABILIZADO);

    const count = await repo.countAsociacionesContabilizadas(tenantA, doc.id);
    expect(count).toBe(1);
  });

  // ==========================================================
  // findByIdConRelaciones — lectura enriquecida (tipo + contacto)
  // ==========================================================

  it('findByIdConRelaciones — devuelve el documento con tipo y contacto embebidos', async () => {
    const contactoId = await createContacto(tenantA, 'Proveedor ABC SRL');
    const doc = await repo.create(tenantA, baseCreateData({ contactoId }));

    const found = await repo.findByIdConRelaciones(tenantA, doc.id);

    expect(found?.id).toBe(doc.id);
    expect(found?.tipoDocumento).toEqual({
      id: tipoTributario,
      nombre: 'Factura',
      codigo: 'factura',
      esTributario: true,
      numeracionAutomatica: false,
    });
    expect(found?.contacto).toEqual({ id: contactoId, razonSocial: 'Proveedor ABC SRL' });
  });

  it('findByIdConRelaciones — contacto = null cuando el documento no tiene contacto', async () => {
    const doc = await repo.create(tenantA, baseCreateData({ contactoId: null }));
    const found = await repo.findByIdConRelaciones(tenantA, doc.id);
    expect(found?.contacto).toBeNull();
    expect(found?.tipoDocumento.codigo).toBe('factura');
  });

  it('findByIdConRelaciones — retorna null si el id pertenece a otro tenant (defense in depth)', async () => {
    const doc = await repo.create(tenantA, baseCreateData());
    const cross = await repo.findByIdConRelaciones(tenantB, doc.id);
    expect(cross).toBeNull();
  });

  // ==========================================================
  // listarConRelaciones — listado enriquecido
  // ==========================================================

  it('listarConRelaciones — los items traen tipo y contacto embebidos', async () => {
    const contactoId = await createContacto(tenantA, 'Cliente XYZ');
    await repo.create(tenantA, baseCreateData({ numero: 'F-001', contactoId }));

    const { items, total } = await repo.listarConRelaciones(tenantA, {}, defaultPagination);

    expect(total).toBe(1);
    expect(items[0]?.tipoDocumento.codigo).toBe('factura');
    expect(items[0]?.contacto).toEqual({ id: contactoId, razonSocial: 'Cliente XYZ' });
  });

  it('listarConRelaciones — respeta filtros y paginación igual que listar', async () => {
    await repo.create(
      tenantA,
      baseCreateData({ tipoDocumentoFisicoId: tipoTributario, numero: 'F-001' }),
    );
    await repo.create(
      tenantA,
      baseCreateData({
        tipoDocumentoFisicoId: tipoNoTributario,
        numero: 'R-001',
        monto: null,
        moneda: null,
      }),
    );

    const { items, total } = await repo.listarConRelaciones(
      tenantA,
      { tipoDocumentoFisicoId: tipoNoTributario },
      { page: 1, limit: 1 },
    );

    expect(total).toBe(1);
    expect(items.length).toBe(1);
    expect(items[0]?.tipoDocumento.codigo).toBe('recibo');
    expect(items[0]?.contacto).toBeNull();
  });

  it('listarConRelaciones — no trae documentos de otro tenant', async () => {
    await repo.create(tenantA, baseCreateData());
    const { total } = await repo.listarConRelaciones(tenantB, {}, defaultPagination);
    expect(total).toBe(0);
  });

  // ==========================================================
  // findDetalleById — detalle con comprobantes asociados
  // ==========================================================

  it('findDetalleById — array vacío cuando el documento está suelto', async () => {
    const doc = await repo.create(tenantA, baseCreateData());
    const detalle = await repo.findDetalleById(tenantA, doc.id);
    expect(detalle?.id).toBe(doc.id);
    expect(detalle?.tipoDocumento.codigo).toBe('factura');
    expect(detalle?.comprobantesAsociados).toEqual([]);
  });

  it('findDetalleById — devuelve comprobantesAsociados con numero y estado correctos', async () => {
    const periodoId = await createPeriodo(tenantA);
    const compId = await createComprobante(tenantA, periodoId, EstadoComprobante.CONTABILIZADO);

    const doc = await repo.create(tenantA, baseCreateData());
    await asociar(tenantA, compId, doc.id, EstadoComprobante.CONTABILIZADO);

    const detalle = await repo.findDetalleById(tenantA, doc.id);

    expect(detalle?.comprobantesAsociados).toHaveLength(1);
    expect(detalle?.comprobantesAsociados[0]).toEqual({
      comprobanteId: compId,
      comprobanteNumero: null, // BORRADOR/CONTABILIZADO de fixture sin numero asignado
      comprobanteEstado: EstadoComprobante.CONTABILIZADO,
    });
  });

  it('findDetalleById — retorna null si el id pertenece a otro tenant (defense in depth)', async () => {
    const doc = await repo.create(tenantA, baseCreateData());
    const cross = await repo.findDetalleById(tenantB, doc.id);
    expect(cross).toBeNull();
  });

  // ==========================================================
  // listar — filtro disponibleParaAsociar
  // ==========================================================

  it('disponibleParaAsociar=true — excluye documento asociado a un comprobante CONTABILIZADO', async () => {
    const periodoId = await createPeriodo(tenantA);
    const compContId = await createComprobante(tenantA, periodoId, EstadoComprobante.CONTABILIZADO);

    const docConsumido = await repo.create(tenantA, baseCreateData({ numero: 'F-001' }));
    const docSuelto = await repo.create(tenantA, baseCreateData({ numero: 'F-002' }));

    await asociar(tenantA, compContId, docConsumido.id, EstadoComprobante.CONTABILIZADO);

    const filtros: DocumentoFisicoListarFiltros = { disponibleParaAsociar: true };
    const { items, total } = await repo.listar(tenantA, filtros, defaultPagination);

    expect(total).toBe(1);
    expect(items[0]?.id).toBe(docSuelto.id);
  });

  it('disponibleParaAsociar=true — incluye documento suelto (sin ninguna asociación)', async () => {
    const docSuelto = await repo.create(tenantA, baseCreateData({ numero: 'F-001' }));

    const filtros: DocumentoFisicoListarFiltros = { disponibleParaAsociar: true };
    const { items, total } = await repo.listar(tenantA, filtros, defaultPagination);

    expect(total).toBe(1);
    expect(items[0]?.id).toBe(docSuelto.id);
  });

  it('disponibleParaAsociar=true — incluye documento que solo está en un BORRADOR', async () => {
    const periodoId = await createPeriodo(tenantA);
    const compBorradorId = await createComprobante(tenantA, periodoId, EstadoComprobante.BORRADOR);

    const docEnBorrador = await repo.create(tenantA, baseCreateData({ numero: 'F-001' }));

    await asociar(tenantA, compBorradorId, docEnBorrador.id, EstadoComprobante.BORRADOR);

    const filtros: DocumentoFisicoListarFiltros = { disponibleParaAsociar: true };
    const { items, total } = await repo.listar(tenantA, filtros, defaultPagination);

    expect(total).toBe(1);
    expect(items[0]?.id).toBe(docEnBorrador.id);
  });

  it('disponibleParaAsociar=undefined — devuelve todos sin excluir nada', async () => {
    const periodoId = await createPeriodo(tenantA);
    const compContId = await createComprobante(tenantA, periodoId, EstadoComprobante.CONTABILIZADO);
    const compBorradorId = await createComprobante(tenantA, periodoId, EstadoComprobante.BORRADOR);

    const docConsumido = await repo.create(tenantA, baseCreateData({ numero: 'F-001' }));
    const docEnBorrador = await repo.create(tenantA, baseCreateData({ numero: 'F-002' }));
    const docSuelto = await repo.create(tenantA, baseCreateData({ numero: 'F-003' }));

    await asociar(tenantA, compContId, docConsumido.id, EstadoComprobante.CONTABILIZADO);
    await asociar(tenantA, compBorradorId, docEnBorrador.id, EstadoComprobante.BORRADOR);

    const { total } = await repo.listar(tenantA, {}, defaultPagination);

    expect(total).toBe(3);
    void docSuelto; // referenciado solo para claridad del test
  });

  it('disponibleParaAsociar=true — se compone (AND) con tipoDocumentoFisicoId', async () => {
    const periodoId = await createPeriodo(tenantA);
    const compContId = await createComprobante(tenantA, periodoId, EstadoComprobante.CONTABILIZADO);

    // docA: tipo tributario, consumido → excluir
    const docConsumido = await repo.create(
      tenantA,
      baseCreateData({ tipoDocumentoFisicoId: tipoTributario, numero: 'F-001' }),
    );
    // docB: tipo no-tributario, suelto → incluir
    const docDisponible = await repo.create(
      tenantA,
      baseCreateData({
        tipoDocumentoFisicoId: tipoNoTributario,
        numero: 'R-001',
        monto: null,
        moneda: null,
      }),
    );
    // docC: tipo no-tributario, consumido → excluir
    const docNoTribConsumido = await repo.create(
      tenantA,
      baseCreateData({
        tipoDocumentoFisicoId: tipoNoTributario,
        numero: 'R-002',
        monto: null,
        moneda: null,
      }),
    );

    await asociar(tenantA, compContId, docConsumido.id, EstadoComprobante.CONTABILIZADO);
    await asociar(tenantA, compContId, docNoTribConsumido.id, EstadoComprobante.CONTABILIZADO);

    // Filtro: disponibleParaAsociar=true AND tipoDocumentoFisicoId=tipoNoTributario
    const filtros: DocumentoFisicoListarFiltros = {
      disponibleParaAsociar: true,
      tipoDocumentoFisicoId: tipoNoTributario,
    };
    const { items, total } = await repo.listar(tenantA, filtros, defaultPagination);

    expect(total).toBe(1);
    expect(items[0]?.id).toBe(docDisponible.id);
    void docConsumido;
    void docNoTribConsumido;
  });
});
