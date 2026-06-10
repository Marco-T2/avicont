import {
  EstadoComprobante,
  GestionFiscalStatus,
  Moneda,
  NaturalezaCuenta,
  PeriodoFiscalStatus,
  Prisma,
  PrismaClient,
  TipoComprobante,
} from '@prisma/client';

import { PrismaPeriodosReaderAdapter } from '@/periodos-fiscales/adapters/prisma-periodos-reader.adapter';
import { ComprobantesService } from '../comprobantes.service';
import { ComprobanteEditarContabilizadoEnPeriodoCerradoError } from '../domain/comprobante-errors';
import { AuditedTransactionRunner } from '../infrastructure/audited-transaction.runner';
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

// ============================================================
// Describe: tipoCambioReexpresion — PATCH integration (W-1)
// ============================================================
/**
 * Cubre los 3 scenarios de integración que el spec exige para
 * `tipoCambioReexpresion` en el flujo PATCH (W-1 del verify):
 *
 *   1. PATCH TCR en BORRADOR → campo actualizado, líneas sin cambio.
 *   2. PATCH TCR en CONTABILIZADO (período ABIERTO) → campo actualizado,
 *      líneas preservadas (mismos valores/amounts), balance inalterado.
 *   3. PATCH TCR en período CERRADO → lanza
 *      ComprobanteEditarContabilizadoEnPeriodoCerradoError (409).
 *
 * Tests 1 y 2: repositorio directo (`reemplazarComprobante`), sin NestJS.
 * Test 3: servicio con adapters reales para repo y períodos; ports restantes
 * mockeados con jest.fn() porque el error se lanza antes de alcanzarlos.
 *
 * Requiere Postgres corriendo en DATABASE_URL.
 */
describe('tipoCambioReexpresion — PATCH integration (W-1)', () => {
  const SLUG = 'org-test-tcr-patch';

  let prisma: PrismaClient;
  let repo: PrismaComprobanteRepository;
  let tenantId: string;
  let periodoAbierto: { id: string };
  let periodoCerrado: { id: string };

  // Las cuentas tienen FK desde lineas_comprobante (cuentaId → Restrict), por
  // lo que el cascade org→comprobante→lineas no permite borrar cuentas en un
  // solo paso. Limpiamos en orden: lineas → comprobantes → cuentas → org.
  //
  // NOTA: el trigger de auditoría (trg_comprobantes_audit) intenta parsear
  // `current_setting('app.audit_during_reopening')::boolean`. Si una TX
  // anterior (via AuditedTransactionRunner con PrismaClient plain) dejó la
  // session var como '' en la conexión reutilizada del pool, el cast falla.
  // Resolvemos seteando explícitamente las vars de auditoría antes de los DELETE.
  async function limpiarOrg(pc: PrismaClient) {
    const orgs = await pc.organization.findMany({ where: { slug: SLUG }, select: { id: true } });
    const ids = orgs.map((o) => o.id);
    if (ids.length === 0) return;

    // Resetear session vars de auditoría para que el trigger no falle con ''.
    await pc.$executeRaw`SELECT set_config('app.audit_user_id', 'cleanup', false)`;
    await pc.$executeRaw`SELECT set_config('app.audit_motivo', '', false)`;
    await pc.$executeRaw`SELECT set_config('app.audit_reapertura_id', '', false)`;
    await pc.$executeRaw`SELECT set_config('app.audit_during_reopening', 'false', false)`;

    await pc.lineaComprobante.deleteMany({ where: { organizationId: { in: ids } } });
    await pc.comprobante.deleteMany({ where: { organizationId: { in: ids } } });
    await pc.cuenta.deleteMany({ where: { organizationId: { in: ids } } });
    await pc.organization.deleteMany({ where: { slug: SLUG } });
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaComprobanteRepository(prisma as never);
  });

  afterAll(async () => {
    await limpiarOrg(prisma);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await limpiarOrg(prisma);

    const org = await prisma.organization.create({
      data: { slug: SLUG, name: 'Org Test TCR Patch' },
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

    const periodoAbiertoRow = await prisma.periodoFiscal.create({
      data: {
        organizationId: tenantId,
        gestionId: gestion.id,
        year: 2026,
        month: 4,
        ordenEnGestion: 4,
        status: PeriodoFiscalStatus.ABIERTO,
      },
    });
    periodoAbierto = periodoAbiertoRow;

    const periodoCerradoRow = await prisma.periodoFiscal.create({
      data: {
        organizationId: tenantId,
        gestionId: gestion.id,
        year: 2026,
        month: 5,
        ordenEnGestion: 5,
        status: PeriodoFiscalStatus.CERRADO,
      },
    });
    periodoCerrado = periodoCerradoRow;
  });

  it('PATCH solo TCR en BORRADOR: actualiza tipoCambioReexpresion y no modifica los valores de las líneas', async () => {
    // Arrange: comprobante BORRADOR con líneas balanceadas (débito = crédito = 500).
    // Cuenta mínima real para evitar FK violation; el repo no valida reglas de cuentas
    // (eso es responsabilidad del servicio en el paso de construcción de líneas).
    const cuenta = await prisma.cuenta.create({
      data: {
        organizationId: tenantId,
        codigoInterno: '1001',
        nombre: 'Caja TCR Test',
        claseCuenta: 'ACTIVO',
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 1,
        activa: true,
        esDetalle: true,
        requiereContacto: false,
        permiteMultiMoneda: false,
      },
    });

    const comprobante = await prisma.comprobante.create({
      data: {
        organizationId: tenantId,
        tipo: TipoComprobante.DIARIO,
        estado: EstadoComprobante.BORRADOR,
        fechaContable: new Date(Date.UTC(2026, 3, 15)),
        periodoFiscalId: periodoAbierto.id,
        glosa: 'Borrador TCR test',
        monedaPrincipal: Moneda.BOB,
        tipoCambioReexpresion: new Prisma.Decimal('1.00000000'),
        createdByUserId: 'user-tcr-test',
        lineas: {
          create: [
            {
              organizationId: tenantId,
              orden: 1,
              cuentaId: cuenta.id,
              moneda: Moneda.BOB,
              debito: new Prisma.Decimal('500.00'),
              credito: new Prisma.Decimal('0.00'),
              tipoCambio: new Prisma.Decimal('1'),
              debitoBob: new Prisma.Decimal('500.00'),
              creditoBob: new Prisma.Decimal('0.00'),
            },
            {
              organizationId: tenantId,
              orden: 2,
              cuentaId: cuenta.id,
              moneda: Moneda.BOB,
              debito: new Prisma.Decimal('0.00'),
              credito: new Prisma.Decimal('500.00'),
              tipoCambio: new Prisma.Decimal('1'),
              debitoBob: new Prisma.Decimal('0.00'),
              creditoBob: new Prisma.Decimal('500.00'),
            },
          ],
        },
      },
      include: { lineas: { orderBy: { orden: 'asc' as const } } },
    });

    // Act: PATCH con solo tipoCambioReexpresion cambiado; líneas copiadas sin modificación.
    const resultado = await repo.reemplazarComprobante(tenantId, comprobante.id, {
      tipo: comprobante.tipo,
      fechaContable: comprobante.fechaContable,
      periodoFiscalId: comprobante.periodoFiscalId,
      glosa: comprobante.glosa,
      monedaPrincipal: comprobante.monedaPrincipal,
      tipoCambioReexpresion: '7.10',
      lineas: comprobante.lineas.map((l) => ({
        orden: l.orden,
        cuentaId: l.cuentaId,
        contactoId: l.contactoId,
        moneda: l.moneda,
        debito: l.debito.toString(),
        credito: l.credito.toString(),
        tipoCambio: l.tipoCambio.toString(),
        debitoBob: l.debitoBob.toString(),
        creditoBob: l.creditoBob.toString(),
        glosaLinea: l.glosaLinea,
      })),
    });

    // Assert: TCR actualizado al nuevo valor (Prisma.Decimal normaliza trailing zeros).
    expect(
      new Prisma.Decimal(resultado.tipoCambioReexpresion.toString()).equals(
        new Prisma.Decimal('7.10'),
      ),
    ).toBe(true);

    // Assert: los valores de las líneas no fueron modificados (mismos amounts y orden).
    // Nota: Prisma.Decimal normaliza trailing zeros (500.00 → '500'), usamos .equals().
    expect(resultado.lineas).toHaveLength(2);
    const linea1 = resultado.lineas.find((l) => l.orden === 1)!;
    const linea2 = resultado.lineas.find((l) => l.orden === 2)!;
    expect(
      new Prisma.Decimal(linea1.debitoBob.toString()).equals(new Prisma.Decimal('500.00')),
    ).toBe(true);
    expect(
      new Prisma.Decimal(linea1.creditoBob.toString()).equals(new Prisma.Decimal('0.00')),
    ).toBe(true);
    expect(new Prisma.Decimal(linea2.debitoBob.toString()).equals(new Prisma.Decimal('0.00'))).toBe(
      true,
    );
    expect(
      new Prisma.Decimal(linea2.creditoBob.toString()).equals(new Prisma.Decimal('500.00')),
    ).toBe(true);

    // Assert: estado sigue siendo BORRADOR (reemplazarComprobante no cambia estado).
    expect(resultado.estado).toBe(EstadoComprobante.BORRADOR);
  });

  it('PATCH solo TCR en CONTABILIZADO (período ABIERTO): actualiza TCR, preserva balance y valores de líneas', async () => {
    // Arrange: comprobante CONTABILIZADO con líneas y período abierto.
    const cuenta = await prisma.cuenta.create({
      data: {
        organizationId: tenantId,
        codigoInterno: '1002',
        nombre: 'Banco TCR Test',
        claseCuenta: 'ACTIVO',
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 1,
        activa: true,
        esDetalle: true,
        requiereContacto: false,
        permiteMultiMoneda: false,
      },
    });

    const comprobante = await prisma.comprobante.create({
      data: {
        organizationId: tenantId,
        tipo: TipoComprobante.DIARIO,
        numero: 'D2604-000050',
        estado: EstadoComprobante.CONTABILIZADO,
        fechaContable: new Date(Date.UTC(2026, 3, 15)),
        periodoFiscalId: periodoAbierto.id,
        glosa: 'Contabilizado TCR test',
        monedaPrincipal: Moneda.BOB,
        tipoCambioReexpresion: new Prisma.Decimal('1.00000000'),
        totalDebitoBob: new Prisma.Decimal('1000.00'),
        totalCreditoBob: new Prisma.Decimal('1000.00'),
        createdByUserId: 'user-tcr-test',
        lineas: {
          create: [
            {
              organizationId: tenantId,
              orden: 1,
              cuentaId: cuenta.id,
              moneda: Moneda.BOB,
              debito: new Prisma.Decimal('1000.00'),
              credito: new Prisma.Decimal('0.00'),
              tipoCambio: new Prisma.Decimal('1'),
              debitoBob: new Prisma.Decimal('1000.00'),
              creditoBob: new Prisma.Decimal('0.00'),
            },
            {
              organizationId: tenantId,
              orden: 2,
              cuentaId: cuenta.id,
              moneda: Moneda.BOB,
              debito: new Prisma.Decimal('0.00'),
              credito: new Prisma.Decimal('1000.00'),
              tipoCambio: new Prisma.Decimal('1'),
              debitoBob: new Prisma.Decimal('0.00'),
              creditoBob: new Prisma.Decimal('1000.00'),
            },
          ],
        },
      },
      include: { lineas: { orderBy: { orden: 'asc' as const } } },
    });

    const lineasAntes = comprobante.lineas.length;

    // Act: PATCH con solo tipoCambioReexpresion; líneas copiadas literalmente.
    const resultado = await repo.reemplazarComprobante(tenantId, comprobante.id, {
      tipo: comprobante.tipo,
      fechaContable: comprobante.fechaContable,
      periodoFiscalId: comprobante.periodoFiscalId,
      glosa: comprobante.glosa,
      monedaPrincipal: comprobante.monedaPrincipal,
      tipoCambioReexpresion: '6.96',
      totalDebitoBob: comprobante.totalDebitoBob ?? undefined,
      totalCreditoBob: comprobante.totalCreditoBob ?? undefined,
      lineas: comprobante.lineas.map((l) => ({
        orden: l.orden,
        cuentaId: l.cuentaId,
        contactoId: l.contactoId,
        moneda: l.moneda,
        debito: l.debito.toString(),
        credito: l.credito.toString(),
        tipoCambio: l.tipoCambio.toString(),
        debitoBob: l.debitoBob.toString(),
        creditoBob: l.creditoBob.toString(),
        glosaLinea: l.glosaLinea,
      })),
    });

    // Assert: TCR actualizado al nuevo valor (Prisma.Decimal normaliza trailing zeros).
    expect(
      new Prisma.Decimal(resultado.tipoCambioReexpresion.toString()).equals(
        new Prisma.Decimal('6.96'),
      ),
    ).toBe(true);

    // Assert: la cantidad de líneas se preserva.
    expect(resultado.lineas).toHaveLength(lineasAntes);

    // Assert: los amounts de las líneas no fueron alterados (partida doble intacta).
    // Nota: Prisma.Decimal normaliza trailing zeros (1000.00 → '1000'), usamos .equals().
    const linea1 = resultado.lineas.find((l) => l.orden === 1)!;
    const linea2 = resultado.lineas.find((l) => l.orden === 2)!;
    expect(
      new Prisma.Decimal(linea1.debitoBob.toString()).equals(new Prisma.Decimal('1000.00')),
    ).toBe(true);
    expect(new Prisma.Decimal(linea1.creditoBob.toString()).equals(new Prisma.Decimal('0'))).toBe(
      true,
    );
    expect(new Prisma.Decimal(linea2.debitoBob.toString()).equals(new Prisma.Decimal('0'))).toBe(
      true,
    );
    expect(
      new Prisma.Decimal(linea2.creditoBob.toString()).equals(new Prisma.Decimal('1000.00')),
    ).toBe(true);

    // Assert: balance del encabezado sin cambio (Código Tributario art. 47).
    // Totales también normalizan trailing zeros vía Prisma.Decimal.
    expect(
      resultado.totalDebitoBob &&
        new Prisma.Decimal(resultado.totalDebitoBob.toString()).equals(new Prisma.Decimal('1000')),
    ).toBe(true);
    expect(
      resultado.totalCreditoBob &&
        new Prisma.Decimal(resultado.totalCreditoBob.toString()).equals(new Prisma.Decimal('1000')),
    ).toBe(true);

    // Assert: estado sigue siendo CONTABILIZADO.
    expect(resultado.estado).toBe(EstadoComprobante.CONTABILIZADO);
  });

  it('PATCH solo TCR en período CERRADO: lanza ComprobanteEditarContabilizadoEnPeriodoCerradoError', async () => {
    // Arrange: comprobante CONTABILIZADO cuyo período está CERRADO.
    const cuenta = await prisma.cuenta.create({
      data: {
        organizationId: tenantId,
        codigoInterno: '1003',
        nombre: 'Deudores TCR Test',
        claseCuenta: 'ACTIVO',
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 1,
        activa: true,
        esDetalle: true,
        requiereContacto: false,
        permiteMultiMoneda: false,
      },
    });

    await prisma.comprobante.create({
      data: {
        organizationId: tenantId,
        tipo: TipoComprobante.DIARIO,
        numero: 'D2605-000050',
        estado: EstadoComprobante.CONTABILIZADO,
        fechaContable: new Date(Date.UTC(2026, 4, 15)), // mayo → período cerrado
        periodoFiscalId: periodoCerrado.id,
        glosa: 'Contabilizado en período cerrado',
        monedaPrincipal: Moneda.BOB,
        tipoCambioReexpresion: new Prisma.Decimal('1.00000000'),
        totalDebitoBob: new Prisma.Decimal('800.00'),
        totalCreditoBob: new Prisma.Decimal('800.00'),
        createdByUserId: 'user-tcr-test',
        lineas: {
          create: [
            {
              organizationId: tenantId,
              orden: 1,
              cuentaId: cuenta.id,
              moneda: Moneda.BOB,
              debito: new Prisma.Decimal('800.00'),
              credito: new Prisma.Decimal('0.00'),
              tipoCambio: new Prisma.Decimal('1'),
              debitoBob: new Prisma.Decimal('800.00'),
              creditoBob: new Prisma.Decimal('0.00'),
            },
            {
              organizationId: tenantId,
              orden: 2,
              cuentaId: cuenta.id,
              moneda: Moneda.BOB,
              debito: new Prisma.Decimal('0.00'),
              credito: new Prisma.Decimal('800.00'),
              tipoCambio: new Prisma.Decimal('1'),
              debitoBob: new Prisma.Decimal('0.00'),
              creditoBob: new Prisma.Decimal('800.00'),
            },
          ],
        },
      },
    });

    const comprobanteEnCerrado = await prisma.comprobante.findFirstOrThrow({
      where: { organizationId: tenantId, periodoFiscalId: periodoCerrado.id },
    });

    // Construir el servicio con adapters reales (repo + periodos) y mocks mínimos.
    // Los ports que no se alcanzan antes del throw se pasan como jest.fn() vacíos.
    const periodosReader = new PrismaPeriodosReaderAdapter(prisma as never);
    const auditedTx = new AuditedTransactionRunner(prisma as never);
    const mockRbac = { hasPermission: jest.fn().mockResolvedValue(true) };
    const mockCuentas = { obtenerBatch: jest.fn() };
    const mockContactos = { obtenerBatch: jest.fn() };
    const mockClock = { currentDateLaPaz: jest.fn().mockReturnValue('2026-05-15') };
    const mockSecuencia = { siguienteNumero: jest.fn() };
    const mockDocFisicosReader = { obtenerBatchParaAsociar: jest.fn() };
    const mockAsociacionRepo = { asociar: jest.fn() };
    const mockPrismaService = {}; // editarContabilizado no llama this.prisma directamente

    const mockConfig = { get: jest.fn((key: string, defaultVal: unknown) => defaultVal) };
    const service = new ComprobantesService(
      repo,
      periodosReader,
      mockCuentas as never,
      mockContactos as never,
      mockClock as never,
      mockSecuencia as never,
      mockDocFisicosReader as never,
      mockAsociacionRepo as never,
      mockPrismaService as never,
      auditedTx,
      mockRbac as never,
      mockConfig as never,
      null as never, // storagePort — no usado en editarContabilizado
      null as never, // adjuntoRepo — no usado en editarContabilizado
    );

    // Act & Assert: PATCH con TCR en período cerrado → error de period-lock (§4.4).
    await expect(
      service.editarContabilizado(tenantId, 'user-test', comprobanteEnCerrado.id, {
        tipoCambioReexpresion: '7.50',
      }),
    ).rejects.toThrow(ComprobanteEditarContabilizadoEnPeriodoCerradoError);
  });
});

// ============================================================
// Describe: listarParaExport / contarParaExport — T2.1 (RED)
// ============================================================
describe('PrismaComprobanteRepository — listarParaExport / contarParaExport (integration vs Postgres)', () => {
  const SLUG = 'org-test-export';

  let prisma: PrismaClient;
  let repo: PrismaComprobanteRepository;
  let tenantIdA: string;
  let tenantIdB: string;
  let periodoIdA: string;
  let periodoIdA2: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaComprobanteRepository(prisma as never);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.organization.deleteMany({ where: { slug: { startsWith: SLUG } } });

    // Tenant A — principal
    const orgA = await prisma.organization.create({
      data: { slug: `${SLUG}-a`, name: 'Org Export A' },
    });
    tenantIdA = orgA.id;

    const gestionA = await prisma.gestionFiscal.create({
      data: {
        organizationId: tenantIdA,
        year: 2026,
        mesInicio: 4,
        status: GestionFiscalStatus.ABIERTA,
      },
    });
    const periodoA = await prisma.periodoFiscal.create({
      data: {
        organizationId: tenantIdA,
        gestionId: gestionA.id,
        year: 2026,
        month: 4,
        ordenEnGestion: 4,
        status: PeriodoFiscalStatus.ABIERTO,
      },
    });
    periodoIdA = periodoA.id;

    const periodoA2 = await prisma.periodoFiscal.create({
      data: {
        organizationId: tenantIdA,
        gestionId: gestionA.id,
        year: 2026,
        month: 5,
        ordenEnGestion: 5,
        status: PeriodoFiscalStatus.ABIERTO,
      },
    });
    periodoIdA2 = periodoA2.id;

    // Tenant B — para prueba de aislamiento Anti-31
    const orgB = await prisma.organization.create({
      data: { slug: `${SLUG}-b`, name: 'Org Export B' },
    });
    tenantIdB = orgB.id;

    const gestionB = await prisma.gestionFiscal.create({
      data: {
        organizationId: tenantIdB,
        year: 2026,
        mesInicio: 4,
        status: GestionFiscalStatus.ABIERTA,
      },
    });
    const periodoB = await prisma.periodoFiscal.create({
      data: {
        organizationId: tenantIdB,
        gestionId: gestionB.id,
        year: 2026,
        month: 4,
        ordenEnGestion: 4,
        status: PeriodoFiscalStatus.ABIERTO,
      },
    });

    // Crear comprobantes del tenant B para la prueba de aislamiento
    await prisma.comprobante.create({
      data: {
        organizationId: tenantIdB,
        tipo: TipoComprobante.DIARIO,
        numero: 'D2604-999001',
        estado: EstadoComprobante.CONTABILIZADO,
        fechaContable: new Date(Date.UTC(2026, 3, 1)),
        periodoFiscalId: periodoB.id,
        glosa: 'Comprobante del tenant B',
        monedaPrincipal: Moneda.BOB,
        totalDebitoBob: new Prisma.Decimal('500.00'),
        totalCreditoBob: new Prisma.Decimal('500.00'),
        createdByUserId: 'user-b',
      },
    });
  });

  async function crearComprobante(opts: {
    numero: string | null;
    fecha: Date;
    tipo?: TipoComprobante;
    estado?: EstadoComprobante;
    anulado?: boolean;
    periodoId?: string;
  }) {
    return prisma.comprobante.create({
      data: {
        organizationId: tenantIdA,
        tipo: opts.tipo ?? TipoComprobante.DIARIO,
        numero: opts.numero,
        estado: opts.estado ?? EstadoComprobante.CONTABILIZADO,
        anulado: opts.anulado ?? false,
        fechaContable: opts.fecha,
        periodoFiscalId: opts.periodoId ?? periodoIdA,
        glosa: `Comprobante ${opts.numero ?? 'BORRADOR'}`,
        monedaPrincipal: Moneda.BOB,
        totalDebitoBob: new Prisma.Decimal('1000.00'),
        totalCreditoBob: new Prisma.Decimal('1000.00'),
        createdByUserId: 'user-test',
      },
    });
  }

  it('(a) trae todas las filas sin paginar para el tenant', async () => {
    await crearComprobante({ numero: 'D2604-000001', fecha: new Date(Date.UTC(2026, 3, 1)) });
    await crearComprobante({ numero: 'D2604-000002', fecha: new Date(Date.UTC(2026, 3, 2)) });
    await crearComprobante({ numero: 'D2604-000003', fecha: new Date(Date.UTC(2026, 3, 3)) });

    const rows = await repo.listarParaExport(tenantIdA, {});
    expect(rows.length).toBe(3);
  });

  it('(b) ordena cronológicamente ASCENDENTE por fechaContable', async () => {
    await crearComprobante({ numero: 'D2604-000003', fecha: new Date(Date.UTC(2026, 3, 3)) });
    await crearComprobante({ numero: 'D2604-000001', fecha: new Date(Date.UTC(2026, 3, 1)) });
    await crearComprobante({ numero: 'D2604-000002', fecha: new Date(Date.UTC(2026, 3, 2)) });

    const rows = await repo.listarParaExport(tenantIdA, {});
    expect(rows.length).toBe(3);
    // Debe venir en orden cronológico ASC
    expect(rows[0]!.fechaContable.getTime()).toBeLessThanOrEqual(rows[1]!.fechaContable.getTime());
    expect(rows[1]!.fechaContable.getTime()).toBeLessThanOrEqual(rows[2]!.fechaContable.getTime());
  });

  it('(c) borradores (numero NULL) van al final dentro de la misma fecha — NULLS LAST', async () => {
    const fechaComun = new Date(Date.UTC(2026, 3, 10));
    await crearComprobante({
      numero: 'D2604-000002',
      fecha: fechaComun,
      estado: EstadoComprobante.CONTABILIZADO,
    });
    await crearComprobante({ numero: null, fecha: fechaComun, estado: EstadoComprobante.BORRADOR });
    await crearComprobante({
      numero: 'D2604-000001',
      fecha: fechaComun,
      estado: EstadoComprobante.CONTABILIZADO,
    });

    const rows = await repo.listarParaExport(tenantIdA, {});
    expect(rows.length).toBe(3);
    // El borrador con numero=null debe ser el último
    expect(rows[2]!.numero).toBeNull();
    // Los numerados deben ir primero en orden ASC
    expect(rows[0]!.numero).toBe('D2604-000001');
    expect(rows[1]!.numero).toBe('D2604-000002');
  });

  it('(d) Anti-31: el export del tenant A no ve los comprobantes del tenant B', async () => {
    await crearComprobante({ numero: 'D2604-000001', fecha: new Date(Date.UTC(2026, 3, 1)) });

    const rowsA = await repo.listarParaExport(tenantIdA, {});
    // Solo debe ver los suyos
    for (const row of rowsA) {
      expect(row.organizationId).toBe(tenantIdA);
    }

    const rowsB = await repo.listarParaExport(tenantIdB, {});
    // Tenant B solo ve sus propios
    for (const row of rowsB) {
      expect(row.organizationId).toBe(tenantIdB);
    }

    // Los conteos no se mezclan
    expect(rowsA.length).toBe(1);
    expect(rowsB.length).toBe(1);
  });

  it('(e) incluirAnulados=false excluye anulados; true los incluye', async () => {
    await crearComprobante({
      numero: 'D2604-000001',
      fecha: new Date(Date.UTC(2026, 3, 1)),
      anulado: false,
    });
    await crearComprobante({
      numero: 'D2604-000002',
      fecha: new Date(Date.UTC(2026, 3, 2)),
      anulado: true,
    });

    const sinAnulados = await repo.listarParaExport(tenantIdA, { incluirAnulados: false });
    expect(sinAnulados.length).toBe(1);
    expect(sinAnulados[0]!.anulado).toBe(false);

    const conAnulados = await repo.listarParaExport(tenantIdA, { incluirAnulados: true });
    expect(conAnulados.length).toBe(2);
  });

  it('(f) filtra por tipo, estado, periodoFiscalId y q', async () => {
    await crearComprobante({
      numero: 'D2604-000001',
      fecha: new Date(Date.UTC(2026, 3, 1)),
      tipo: TipoComprobante.DIARIO,
    });
    await crearComprobante({
      numero: 'I2604-000001',
      fecha: new Date(Date.UTC(2026, 3, 2)),
      tipo: TipoComprobante.INGRESO,
    });

    const filtroDiario = await repo.listarParaExport(tenantIdA, { tipo: TipoComprobante.DIARIO });
    expect(filtroDiario.length).toBe(1);
    expect(filtroDiario[0]!.tipo).toBe(TipoComprobante.DIARIO);

    // filtro por periodoFiscalId
    await crearComprobante({
      numero: 'D2605-000001',
      fecha: new Date(Date.UTC(2026, 4, 1)),
      periodoId: periodoIdA2,
    });
    const filtroPeriodo = await repo.listarParaExport(tenantIdA, { periodoFiscalId: periodoIdA2 });
    expect(filtroPeriodo.length).toBe(1);
    expect(filtroPeriodo[0]!.periodoFiscalId).toBe(periodoIdA2);

    // filtro por q (glosa)
    await prisma.comprobante.updateMany({
      where: { organizationId: tenantIdA, numero: 'D2604-000001' },
      data: { glosa: 'Venta especial' },
    });
    const filtroQ = await repo.listarParaExport(tenantIdA, { q: 'especial' });
    expect(filtroQ.length).toBeGreaterThanOrEqual(1);
    expect(filtroQ[0]!.glosa).toContain('especial');
  });

  it('(g) contarParaExport devuelve el count con el mismo WHERE', async () => {
    await crearComprobante({
      numero: 'D2604-000001',
      fecha: new Date(Date.UTC(2026, 3, 1)),
      anulado: false,
    });
    await crearComprobante({
      numero: 'D2604-000002',
      fecha: new Date(Date.UTC(2026, 3, 2)),
      anulado: true,
    });
    await crearComprobante({
      numero: 'I2604-000001',
      fecha: new Date(Date.UTC(2026, 3, 3)),
      tipo: TipoComprobante.INGRESO,
    });

    // Sin filtros, incluirAnulados=false (default)
    const countSinAnulados = await repo.contarParaExport(tenantIdA, {});
    const rowsSinAnulados = await repo.listarParaExport(tenantIdA, {});
    expect(countSinAnulados).toBe(rowsSinAnulados.length);

    // Con incluirAnulados=true
    const countConAnulados = await repo.contarParaExport(tenantIdA, { incluirAnulados: true });
    const rowsConAnulados = await repo.listarParaExport(tenantIdA, { incluirAnulados: true });
    expect(countConAnulados).toBe(rowsConAnulados.length);

    // Filtro por tipo
    const countTipo = await repo.contarParaExport(tenantIdA, {
      tipo: TipoComprobante.DIARIO,
      incluirAnulados: true,
    });
    const rowsTipo = await repo.listarParaExport(tenantIdA, {
      tipo: TipoComprobante.DIARIO,
      incluirAnulados: true,
    });
    expect(countTipo).toBe(rowsTipo.length);
  });
});
