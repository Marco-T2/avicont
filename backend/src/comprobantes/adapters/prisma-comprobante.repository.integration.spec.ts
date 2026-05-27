import {
  EstadoComprobante,
  GestionFiscalStatus,
  Moneda,
  PeriodoFiscalStatus,
  Prisma,
  PrismaClient,
  TipoComprobante,
} from '@prisma/client';

import { PrismaComprobanteRepository } from './prisma-comprobante.repository';

/**
 * Integration spec del repositorio de comprobantes (tasks 6.1 y 6.3 —
 * comprobantes-anulacion-refactor).
 *
 * Cubre:
 *   — anular(): UPDATE in-place del flag + metadatos + verificación de la
 *     entry de auditoría en comprobantes_audit (task 6.1, RED antes de 6.2).
 *   — listarAuditoria(): $queryRaw sobre comprobantes_audit (task 6.3).
 *
 * Requiere Postgres corriendo en DATABASE_URL. Corre con:
 *   DATABASE_URL=... pnpm exec jest src/comprobantes/adapters/prisma-comprobante.repository.integration
 */

// Tipo de fila raw que devuelve comprobantes_audit. Coincide con las columnas
// reales en la BD (confirmar con \d comprobantes_audit).
type RawAuditRow = {
  id: string;
  tabla: string;
  operacion: string;
  comprobante_id: string;
  organization_id: string;
  usuario_id: string | null;
  motivo: string | null;
  durante_reapertura: boolean;
  reapertura_id: string | null;
  datos_antes: unknown;
  datos_despues: unknown;
  ts: Date;
};

// Shape camelCase que listarAuditoria() devuelve (tarea 6.3 — ComprobanteAuditEntry).
// Se define localmente aquí para que los tests del describe compilen antes de
// que el tipo real exista en comprobante-audit.types.ts.
type AuditEntry = {
  id: string;
  tableName: string;
  operation: string;
  comprobanteId: string;
  organizationId: string;
  userId: string | null;
  motivo: string | null;
  fueDuranteReapertura: boolean;
  reaperturaId: string | null;
  rowOld: unknown;
  rowNew: unknown;
  ts: string; // ISO
};

// ============================================================
// Describe: anular() — task 6.1 / 6.2 GREEN
// ============================================================
describe('PrismaComprobanteRepository — anular() (integration vs Postgres)', () => {
  const SLUG = 'org-test-repo-anular';

  let prisma: PrismaClient;
  let repo: PrismaComprobanteRepository;
  let tenantId: string;
  let periodoId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    // PrismaComprobanteRepository acepta PrismaClient porque comparte el contrato.
    repo = new PrismaComprobanteRepository(prisma as never);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { slug: SLUG } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.organization.deleteMany({ where: { slug: SLUG } });

    const org = await prisma.organization.create({
      data: { slug: SLUG, name: 'Org Test Repo Anular' },
    });
    tenantId = org.id;

    const gestion = await prisma.gestionFiscal.create({
      data: {
        organizationId: tenantId,
        year: 2026,
        mesInicio: 4,
        status: GestionFiscalStatus.ABIERTA,
      },
    });

    const periodo = await prisma.periodoFiscal.create({
      data: {
        organizationId: tenantId,
        gestionId: gestion.id,
        year: 2026,
        month: 4,
        ordenEnGestion: 4,
        status: PeriodoFiscalStatus.ABIERTO,
      },
    });
    periodoId = periodo.id;
  });

  async function crearContabilizado(numero: string) {
    return prisma.comprobante.create({
      data: {
        organizationId: tenantId,
        tipo: TipoComprobante.DIARIO,
        numero,
        estado: EstadoComprobante.CONTABILIZADO,
        fechaContable: new Date(Date.UTC(2026, 3, 15)),
        periodoFiscalId: periodoId,
        glosa: 'Comprobante de prueba',
        monedaPrincipal: Moneda.BOB,
        totalDebitoBob: new Prisma.Decimal('1000.00'),
        totalCreditoBob: new Prisma.Decimal('1000.00'),
        createdByUserId: 'user-test',
      },
    });
  }

  it('UPDATE: setea los 4 campos de anulación correctamente (REQ-COMP-ANULAR-01)', async () => {
    const original = await crearContabilizado('D2604-000001');
    const fechaAnulacion = new Date(Date.UTC(2026, 3, 22, 14, 30, 0));

    const result = await repo.anular(tenantId, original.id, {
      fechaAnulacion,
      motivoAnulacion: 'Error en imputación al cliente original',
      anuladoPorUserId: 'user-auditor',
    });

    // Los 4 campos deben setearse correctamente.
    expect(result.anulado).toBe(true);
    expect(result.fechaAnulacion).toEqual(fechaAnulacion);
    expect(result.motivoAnulacion).toBe('Error en imputación al cliente original');
    expect(result.anuladoPorUserId).toBe('user-auditor');
  });

  it('UPDATE: preserva estado=CONTABILIZADO y numero (REQ-COMP-ANULAR-05, §4.9)', async () => {
    const original = await crearContabilizado('D2604-000002');

    const result = await repo.anular(tenantId, original.id, {
      fechaAnulacion: new Date(),
      motivoAnulacion: 'Preservación de número correlativo',
      anuladoPorUserId: 'user-test',
    });

    // El estado es ortogonal al flag (§4.7 CLAUDE.md).
    expect(result.estado).toBe(EstadoComprobante.CONTABILIZADO);
    // El número correlativo es inmutable (§4.9 CLAUDE.md).
    expect(result.numero).toBe('D2604-000002');
  });

  it('emite una entry en comprobantes_audit con operacion=UPDATE y row_old.anulado=false / row_new.anulado=true (REQ-COMP-AUDIT-01)', async () => {
    const original = await crearContabilizado('D2604-000003');

    // Sin AuditedTransactionRunner, usuario_id queda NULL — aceptable (REQ-COMP-AUDIT-03).
    await repo.anular(tenantId, original.id, {
      fechaAnulacion: new Date(),
      motivoAnulacion: 'Prueba de audit entry en comprobantes_audit',
      anuladoPorUserId: 'user-test',
    });

    const rows = await prisma.$queryRaw<RawAuditRow[]>`
      SELECT id, tabla, operacion, comprobante_id, organization_id,
             usuario_id, motivo, durante_reapertura, reapertura_id,
             datos_antes, datos_despues, ts
      FROM comprobantes_audit
      WHERE comprobante_id = ${original.id}::uuid
        AND tabla = 'comprobantes'
        AND operacion = 'UPDATE'
      ORDER BY ts ASC
    `;

    // Debe existir al menos una entry de UPDATE para la anulación.
    expect(rows.length).toBeGreaterThanOrEqual(1);

    const auditEntry = rows[rows.length - 1]!;
    // La operación debe ser UPDATE.
    expect(auditEntry.operacion).toBe('UPDATE');
    // datos_antes.anulado debe ser false (estado previo).
    expect((auditEntry.datos_antes as Record<string, unknown>)['anulado']).toBe(false);
    // datos_despues.anulado debe ser true (estado posterior).
    expect((auditEntry.datos_despues as Record<string, unknown>)['anulado']).toBe(true);
    // El organization_id debe coincidir con el tenant (defense in depth).
    expect(auditEntry.organization_id).toBe(tenantId);
    // Sin AuditedTransactionRunner, usuario_id queda NULL (REQ-COMP-AUDIT-03).
    expect(auditEntry.usuario_id).toBeNull();
  });
});

// ============================================================
// Describe: listarAuditoria() — task 6.3 GREEN
// ============================================================
describe('PrismaComprobanteRepository — listarAuditoria() (integration vs Postgres)', () => {
  const SLUG = 'org-test-repo-audit';

  let prisma: PrismaClient;
  let repo: PrismaComprobanteRepository;
  let tenantId: string;
  let periodoId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaComprobanteRepository(prisma as never);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { slug: SLUG } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.organization.deleteMany({ where: { slug: SLUG } });

    const org = await prisma.organization.create({
      data: { slug: SLUG, name: 'Org Test Repo Audit' },
    });
    tenantId = org.id;

    const gestion = await prisma.gestionFiscal.create({
      data: {
        organizationId: tenantId,
        year: 2026,
        mesInicio: 4,
        status: GestionFiscalStatus.ABIERTA,
      },
    });

    const periodo = await prisma.periodoFiscal.create({
      data: {
        organizationId: tenantId,
        gestionId: gestion.id,
        year: 2026,
        month: 4,
        ordenEnGestion: 4,
        status: PeriodoFiscalStatus.ABIERTO,
      },
    });
    periodoId = periodo.id;
  });

  async function crearContabilizado(numero: string) {
    return prisma.comprobante.create({
      data: {
        organizationId: tenantId,
        tipo: TipoComprobante.DIARIO,
        numero,
        estado: EstadoComprobante.CONTABILIZADO,
        fechaContable: new Date(Date.UTC(2026, 3, 15)),
        periodoFiscalId: periodoId,
        glosa: 'Comprobante para prueba de auditoria',
        monedaPrincipal: Moneda.BOB,
        totalDebitoBob: new Prisma.Decimal('1000.00'),
        totalCreditoBob: new Prisma.Decimal('1000.00'),
        createdByUserId: 'user-test',
      },
    });
  }

  it('ordena las entries por ts ASC (REQ-COMP-AUDIT-05)', async () => {
    const comp = await crearContabilizado('D2604-000010');

    // El INSERT del comprobante ya generó una entry. Hacemos un UPDATE para
    // generar una segunda entry con ts posterior.
    await prisma.comprobante.update({
      where: { id: comp.id },
      data: { glosa: 'Glosa actualizada para audit test' },
    });

    const entries = (await repo.listarAuditoria(tenantId, comp.id)) as unknown as AuditEntry[];

    expect(entries.length).toBeGreaterThanOrEqual(2);

    // Las entries deben estar en orden cronológico ascendente.
    for (let i = 1; i < entries.length; i++) {
      const prev = new Date(entries[i - 1]!.ts);
      const curr = new Date(entries[i]!.ts);
      expect(curr.getTime()).toBeGreaterThanOrEqual(prev.getTime());
    }
  });

  it('filtra por organizationId — otro tenant no aparece (defense in depth)', async () => {
    const comp = await crearContabilizado('D2604-000011');

    // Crear un segundo tenant con su propio comprobante.
    const otroOrg = await prisma.organization.create({
      data: { slug: 'org-otro-tenant-audit', name: 'Otro Tenant' },
    });
    const otraGestion = await prisma.gestionFiscal.create({
      data: {
        organizationId: otroOrg.id,
        year: 2026,
        mesInicio: 4,
        status: GestionFiscalStatus.ABIERTA,
      },
    });
    const otroPeriodo = await prisma.periodoFiscal.create({
      data: {
        organizationId: otroOrg.id,
        gestionId: otraGestion.id,
        year: 2026,
        month: 4,
        ordenEnGestion: 4,
        status: PeriodoFiscalStatus.ABIERTO,
      },
    });
    await prisma.comprobante.create({
      data: {
        organizationId: otroOrg.id,
        tipo: TipoComprobante.DIARIO,
        numero: 'D2604-000012',
        estado: EstadoComprobante.CONTABILIZADO,
        fechaContable: new Date(Date.UTC(2026, 3, 15)),
        periodoFiscalId: otroPeriodo.id,
        glosa: 'Comprobante del otro tenant',
        monedaPrincipal: Moneda.BOB,
        totalDebitoBob: new Prisma.Decimal('500.00'),
        totalCreditoBob: new Prisma.Decimal('500.00'),
        createdByUserId: 'user-otro',
      },
    });

    const entries = (await repo.listarAuditoria(tenantId, comp.id)) as unknown as AuditEntry[];

    // Todas las entries deben pertenecer al tenant correcto.
    for (const entry of entries) {
      expect(entry.organizationId).toBe(tenantId);
    }

    // Cleanup del segundo tenant.
    await prisma.organization.deleteMany({ where: { slug: 'org-otro-tenant-audit' } });
  });

  it('mapea columnas snake_case → camelCase correctamente', async () => {
    const comp = await crearContabilizado('D2604-000013');

    const entries = (await repo.listarAuditoria(tenantId, comp.id)) as unknown as AuditEntry[];

    expect(entries.length).toBeGreaterThanOrEqual(1);
    const entry = entries[0]!;

    // Los campos deben llegar con nombres camelCase.
    expect(entry).toHaveProperty('id');
    expect(entry).toHaveProperty('tableName');
    expect(entry).toHaveProperty('operation');
    expect(entry).toHaveProperty('comprobanteId');
    expect(entry).toHaveProperty('organizationId');
    expect(entry).toHaveProperty('userId');
    expect(entry).toHaveProperty('motivo');
    expect(entry).toHaveProperty('fueDuranteReapertura');
    expect(entry).toHaveProperty('reaperturaId');
    expect(entry).toHaveProperty('rowOld');
    expect(entry).toHaveProperty('rowNew');
    expect(entry).toHaveProperty('ts');

    // El INSERT inicial del comprobante: rowOld = null, rowNew populado.
    expect(entry.rowOld).toBeNull();
    expect(entry.rowNew).not.toBeNull();
    // fueDuranteReapertura debe ser false por default.
    expect(entry.fueDuranteReapertura).toBe(false);
    // ts debe ser un string ISO.
    expect(typeof entry.ts).toBe('string');
    expect(new Date(entry.ts).getTime()).not.toBeNaN();
  });

  it('incluye entries de tablas comprobantes y lineas_comprobante (si existen líneas)', async () => {
    const comp = await crearContabilizado('D2604-000014');

    const entries = (await repo.listarAuditoria(tenantId, comp.id)) as unknown as AuditEntry[];

    // Debe haber al menos una entry de la tabla comprobantes.
    const comprobanteEntries = entries.filter((e) => e.tableName === 'comprobantes');
    expect(comprobanteEntries.length).toBeGreaterThanOrEqual(1);

    // comprobanteId debe coincidir con el comprobante consultado en toda entry.
    for (const entry of entries) {
      expect(entry.comprobanteId).toBe(comp.id);
    }
  });
});
