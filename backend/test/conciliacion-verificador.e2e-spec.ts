/**
 * E2E — Verificador de movimientos bancarios (`GET /api/movimientos-bancarios`).
 *
 * Cubre:
 *   - REQ-VMB-01/03: listado cross-cuenta con rango obligatorio y filtros
 *     combinados (cuenta, monto, glosa con diacríticos).
 *   - REQ-VMB-02: la vista por defecto SIN `estado` muestra TODOS los
 *     movimientos del rango — sin filtro implícito de "pendientes".
 *   - REQ-VMB-04/05: paginación offset con `total` correcto y sin
 *     duplicar/perder filas entre páginas.
 *   - REQ-VMB-06/07: vínculo roto ⇒ `estadoEfectivo=PENDIENTE` en la página
 *     (sin escribir nada) y franja `auditoriaVinculos` solo con filtro `estado`.
 *   - REQ-VMB-08/09: franja de saldos vigentes con null honesto.
 *   - REQ-VMB-11: totales por moneda sin conversión a BOB.
 *   - REQ-VMB-12: asimetría de permisos — `.read` 200 / sin `.read` 403 /
 *     sin pack 404.
 *   - REQ-VMB-13: multi-tenant en página, totales y saldos.
 *
 * Correr con:
 *   DATABASE_URL=... JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh \
 *   NODE_OPTIONS="--experimental-vm-modules" \
 *   pnpm exec jest test/conciliacion-verificador.e2e-spec.ts --runInBand --forceExit
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ClaseCuenta,
  EstadoComprobante,
  EstadoMovimientoBancario,
  GestionFiscalStatus,
  Moneda,
  NaturalezaCuenta,
  PeriodoFiscalStatus,
  PerfilExtracto,
  Prisma,
  SystemRole,
  TipoComprobante,
  TipoPack,
  VerticalPack,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

import { cleanupTestData } from './helpers/test-factory';

const PACK_CLAVE = 'contabilidad.conciliacion';
const PASSWORD = 'password123';
const DESDE = '2026-06-01';
const HASTA = '2026-06-30';

describe('Conciliación — Verificador de movimientos bancarios (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true }),
    );
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  // ==========================================================
  // Fixtures
  // ==========================================================

  async function crearPack(): Promise<string> {
    const pack = await prisma.pack.create({
      data: {
        clave: PACK_CLAVE,
        nombre: 'Conciliación bancaria',
        descripcion: 'Importa extractos bancarios y concilia movimientos.',
        verticalAplicable: VerticalPack.CONTABILIDAD,
        tipo: TipoPack.DOMINIO,
        otorgadoPorDefecto: true,
      },
    });
    return pack.id;
  }

  interface Escenario {
    token: string;
    orgId: string;
    ownerId: string;
    cuentaBancoId: string;
    cuentaOtraId: string;
    cuentaBancariaId: string;
    importacionId: string;
    periodoId: string;
  }

  /**
   * Org con pack activo + cuenta bancaria vinculada + período abierto +
   * importación (contenedor de los movimientos). Sin movimientos ni
   * comprobantes: cada test arma los suyos.
   */
  async function seed(slug = 'org-verif', conPack = true): Promise<Escenario> {
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);
    const owner = await prisma.user.create({
      data: { email: `owner+${slug}@verif.bo`, hashedPassword, isEmailVerified: true },
    });
    const org = await prisma.organization.create({
      data: {
        slug,
        name: `Org ${slug}`,
        memberships: { create: { userId: owner.id, systemRole: SystemRole.OWNER } },
      },
    });

    if (conPack) {
      const packId = await prisma.pack
        .findUnique({ where: { clave: PACK_CLAVE } })
        .then((p) => p?.id ?? crearPack());
      await prisma.orgPackEntitlement.create({
        data: { organizationId: org.id, packId, activo: true, habilitadoPorUserId: owner.id },
      });
    }

    const [cuentaBanco, cuentaOtra] = await Promise.all([
      crearCuenta(org.id, '1.1.1.002', 'Banco cuenta corriente'),
      crearCuenta(org.id, '1.1.1.003', 'Caja chica'),
    ]);

    const { cuentaBancariaId, importacionId } = await crearCuentaBancariaConImportacion(
      org.id,
      owner.id,
      cuentaBanco,
      `BancoSol ${slug}`,
    );

    const gestion = await prisma.gestionFiscal.create({
      data: {
        organizationId: org.id,
        year: 2026,
        mesInicio: 1,
        status: GestionFiscalStatus.ABIERTA,
      },
    });
    const periodo = await prisma.periodoFiscal.create({
      data: {
        organizationId: org.id,
        gestionId: gestion.id,
        year: 2026,
        month: 6,
        ordenEnGestion: 6,
        status: PeriodoFiscalStatus.ABIERTO,
      },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `owner+${slug}@verif.bo`, password: PASSWORD });

    return {
      token: loginRes.body.accessToken as string,
      orgId: org.id,
      ownerId: owner.id,
      cuentaBancoId: cuentaBanco,
      cuentaOtraId: cuentaOtra,
      cuentaBancariaId,
      importacionId,
      periodoId: periodo.id,
    };
  }

  async function crearCuenta(
    organizationId: string,
    codigoInterno: string,
    nombre: string,
  ): Promise<string> {
    const cuenta = await prisma.cuenta.create({
      data: {
        organizationId,
        codigoInterno,
        nombre,
        claseCuenta: ClaseCuenta.ACTIVO,
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 4,
        esDetalle: true,
        requiereContacto: false,
      },
    });
    return cuenta.id;
  }

  let importacionSeq = 0;
  /** CuentaBancaria + su ImportacionExtracto contenedora de movimientos. */
  async function crearCuentaBancariaConImportacion(
    orgId: string,
    ownerId: string,
    cuentaId: string,
    alias: string,
  ): Promise<{ cuentaBancariaId: string; importacionId: string }> {
    importacionSeq += 1;
    const cuentaBancaria = await prisma.cuentaBancaria.create({
      data: {
        organizationId: orgId,
        cuentaId,
        alias,
        perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
        numeroCuenta: `119195${importacionSeq}-000-001`,
        moneda: Moneda.BOB,
      },
    });
    const importacion = await prisma.importacionExtracto.create({
      data: {
        organizationId: orgId,
        cuentaBancariaId: cuentaBancaria.id,
        nombreArchivo: `extracto-${importacionSeq}.xlsx`,
        sha256Archivo: String(importacionSeq).repeat(64).slice(0, 64),
        tamanioBytes: 100,
        perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
        fechaDesde: new Date(Date.UTC(2026, 5, 1)),
        fechaHasta: new Date(Date.UTC(2026, 5, 30)),
        coberturaDeclarada: false,
        estadoVerificacion: 'SIN_VERIFICAR',
        filasLeidas: 0,
        movimientosNuevos: 0,
        movimientosDuplicados: 0,
        importadoPorUserId: ownerId,
      },
    });
    return { cuentaBancariaId: cuentaBancaria.id, importacionId: importacion.id };
  }

  /** Miembro con CustomRole de permisos acotados (REQ-VMB-12). */
  async function seedMiembro(orgId: string, slug: string, permissions: string[]): Promise<string> {
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);
    const user = await prisma.user.create({
      data: { email: `member+${slug}@verif.bo`, hashedPassword, isEmailVerified: true },
    });
    const role = await prisma.customRole.create({
      data: { organizationId: orgId, slug: `rol-${slug}`, name: `Rol ${slug}`, permissions },
    });
    await prisma.membership.create({
      data: { organizationId: orgId, userId: user.id, customRoleId: role.id },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `member+${slug}@verif.bo`, password: PASSWORD });
    return loginRes.body.accessToken as string;
  }

  let numeroSeq = 0;
  async function crearComprobante(
    e: Escenario,
    opts: { dia: number; monto: string },
  ): Promise<string> {
    numeroSeq += 1;
    const comprobante = await prisma.comprobante.create({
      data: {
        organizationId: e.orgId,
        tipo: TipoComprobante.DIARIO,
        numero: `D2606-${String(numeroSeq).padStart(6, '0')}`,
        estado: EstadoComprobante.CONTABILIZADO,
        fechaContable: new Date(Date.UTC(2026, 5, opts.dia)),
        periodoFiscalId: e.periodoId,
        glosa: 'Depósito de clientes',
        monedaPrincipal: Moneda.BOB,
        totalDebitoBob: new Prisma.Decimal(opts.monto),
        totalCreditoBob: new Prisma.Decimal(opts.monto),
        createdByUserId: e.ownerId,
        lineas: {
          create: [
            {
              organizationId: e.orgId,
              orden: 1,
              cuentaId: e.cuentaBancoId,
              moneda: Moneda.BOB,
              debito: new Prisma.Decimal(opts.monto),
              credito: new Prisma.Decimal('0'),
              tipoCambio: new Prisma.Decimal('1'),
              debitoBob: new Prisma.Decimal(opts.monto),
              creditoBob: new Prisma.Decimal('0'),
            },
            {
              organizationId: e.orgId,
              orden: 2,
              cuentaId: e.cuentaOtraId,
              moneda: Moneda.BOB,
              debito: new Prisma.Decimal('0'),
              credito: new Prisma.Decimal(opts.monto),
              tipoCambio: new Prisma.Decimal('1'),
              debitoBob: new Prisma.Decimal('0'),
              creditoBob: new Prisma.Decimal(opts.monto),
            },
          ],
        },
      },
    });
    return comprobante.id;
  }

  let hashSeq = 0;
  async function crearMovimiento(
    e: Escenario,
    opts: {
      dia: number;
      monto: string;
      descripcion?: string;
      saldo?: string | null;
      cuentaBancariaId?: string;
      importacionId?: string;
    },
  ) {
    hashSeq += 1;
    const descripcion = opts.descripcion ?? 'DEPOSITO EN EFECTIVO';
    return prisma.movimientoBancario.create({
      data: {
        organizationId: e.orgId,
        cuentaBancariaId: opts.cuentaBancariaId ?? e.cuentaBancariaId,
        importacionId: opts.importacionId ?? e.importacionId,
        fecha: new Date(Date.UTC(2026, 5, opts.dia)),
        hora: null,
        monto: new Prisma.Decimal(opts.monto),
        tipo: 'CREDITO',
        moneda: Moneda.BOB,
        descripcion,
        descripcionNormalizada: descripcion,
        referencia: null,
        saldo:
          opts.saldo === undefined || opts.saldo === null ? null : new Prisma.Decimal(opts.saldo),
        contraparteNombre: null,
        contraparteDocumento: null,
        datosOriginales: {},
        ordinalDia: 0,
        hashDedup: `hash-verif-${hashSeq}`,
        estado: EstadoMovimientoBancario.PENDIENTE,
      },
    });
  }

  function getVerificador(token: string, query: Record<string, string> = {}) {
    return request(app.getHttpServer())
      .get('/api/movimientos-bancarios')
      .query({ desde: DESDE, hasta: HASTA, ...query })
      .set('Authorization', `Bearer ${token}`);
  }

  // ==========================================================
  // REQ-VMB-12 — pack y permisos
  // ==========================================================

  it('404 sin pack activo — el verificador "no existe" para la org', async () => {
    const e = await seed('org-verif-nopack', false);
    const res = await getVerificador(e.token);
    expect(res.status).toBe(404);
  });

  it('REQ-VMB-12 — con solo .read consulta (200); sin .read recibe 403', async () => {
    const e = await seed();
    await crearMovimiento(e, { dia: 10, monto: '1500.00' });

    const tokenLectura = await seedMiembro(e.orgId, 'solo-lectura', [
      'contabilidad.conciliacion.read',
    ]);
    const lectura = await getVerificador(tokenLectura);
    expect(lectura.status).toBe(200);
    expect(lectura.body.movimientos).toHaveLength(1);
    expect(lectura.body.total).toBe(1);

    const tokenSinRead = await seedMiembro(e.orgId, 'sin-conciliacion', [
      'contabilidad.asientos.read',
    ]);
    const sinRead = await getVerificador(tokenSinRead);
    expect(sinRead.status).toBe(403);
  });

  // ==========================================================
  // REQ-VMB-02 — default sin `estado` muestra TODO
  // ==========================================================

  it('REQ-VMB-02 — sin filtro de estado nada se esconde: PENDIENTE, CONCILIADO e IGNORADO aparecen', async () => {
    const e = await seed();

    const movPendiente = await crearMovimiento(e, { dia: 5, monto: '100.00' });

    const comprobanteId = await crearComprobante(e, { dia: 10, monto: '1500.00' });
    const movConciliado = await crearMovimiento(e, { dia: 10, monto: '1500.00' });
    await request(app.getHttpServer())
      .post('/api/conciliacion/matches')
      .set('Authorization', `Bearer ${e.token}`)
      .send({ movimientoBancarioId: movConciliado.id, comprobanteId, orden: 1 })
      .expect(201);

    const movIgnorado = await crearMovimiento(e, { dia: 15, monto: '200.00' });
    await request(app.getHttpServer())
      .patch(`/api/movimientos-bancarios/${movIgnorado.id}/estado`)
      .set('Authorization', `Bearer ${e.token}`)
      .send({ estado: 'IGNORADO' })
      .expect(200);

    const res = await getVerificador(e.token);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.movimientos).toHaveLength(3);

    const porId = new Map(
      (res.body.movimientos as Array<{ id: string; estadoEfectivo: string }>).map((m) => [
        m.id,
        m.estadoEfectivo,
      ]),
    );
    expect(porId.get(movPendiente.id)).toBe('PENDIENTE');
    expect(porId.get(movConciliado.id)).toBe('CONCILIADO');
    expect(porId.get(movIgnorado.id)).toBe('IGNORADO');

    // Sin filtro `estado` la auditoría NO se aplica (REQ-VMB-07).
    expect(res.body.auditoriaVinculos).toEqual({ aplicada: false, total: 0, rotos: [] });

    // REQ-VMB-11: totales por moneda, montos string, sin conversión a BOB.
    expect(res.body.totales).toEqual([
      { moneda: 'BOB', totalDebitos: '0.00', totalCreditos: '1800.00', cantidad: 3 },
    ]);
  });

  // ==========================================================
  // REQ-VMB-01/03 — filtros combinados
  // ==========================================================

  it('REQ-VMB-03 — filtros combinados: cuenta + rango de monto + glosa con diacríticos', async () => {
    const e = await seed();

    const segunda = await crearCuentaBancariaConImportacion(
      e.orgId,
      e.ownerId,
      e.cuentaOtraId,
      'Banco segundo',
    );

    const movEsperado = await crearMovimiento(e, { dia: 10, monto: '150.00' });
    await crearMovimiento(e, { dia: 12, monto: '800.00' }); // fuera del rango de monto
    await crearMovimiento(e, {
      dia: 14,
      monto: '200.00',
      descripcion: 'PAGO PROVEEDOR',
      cuentaBancariaId: segunda.cuentaBancariaId,
      importacionId: segunda.importacionId,
    }); // otra cuenta y otra glosa

    // Un solo request cross-cuenta trae los movimientos de ambas cuentas (REQ-VMB-01).
    const sinFiltros = await getVerificador(e.token);
    expect(sinFiltros.body.total).toBe(3);
    const cuentasEnPagina = new Set(
      (sinFiltros.body.movimientos as Array<{ cuentaBancariaId: string }>).map(
        (m) => m.cuentaBancariaId,
      ),
    );
    expect(cuentasEnPagina).toEqual(new Set([e.cuentaBancariaId, segunda.cuentaBancariaId]));

    // Glosa con diacríticos matchea la descripción normalizada (REQ-VMB-03).
    const porGlosa = await getVerificador(e.token, { glosa: 'depósito' });
    expect(porGlosa.body.total).toBe(2);

    // Cuenta + monto + glosa combinados.
    const combinado = await getVerificador(e.token, {
      cuentaBancariaId: e.cuentaBancariaId,
      montoDesde: '100.00',
      montoHasta: '500.00',
      glosa: 'depósito',
    });
    expect(combinado.status).toBe(200);
    expect(combinado.body.total).toBe(1);
    expect(combinado.body.movimientos).toHaveLength(1);
    expect(combinado.body.movimientos[0].id).toBe(movEsperado.id);
    expect(combinado.body.movimientos[0].monto).toBe('150.00');
    expect(combinado.body.movimientos[0].fecha).toBe('2026-06-10');
    expect(combinado.body.movimientos[0].cuentaBancariaId).toBe(e.cuentaBancariaId);
  });

  // ==========================================================
  // REQ-VMB-04/05 — paginación con total, sin perder ni duplicar
  // ==========================================================

  it('REQ-VMB-04 — paginación offset con total correcto; páginas consecutivas sin duplicar ni perder', async () => {
    const e = await seed();
    const creados = await Promise.all(
      [1, 2, 3, 4, 5].map((dia) => crearMovimiento(e, { dia, monto: '100.00' })),
    );

    const pagina1 = await getVerificador(e.token, { page: '1', limit: '2' });
    const pagina2 = await getVerificador(e.token, { page: '2', limit: '2' });
    const pagina3 = await getVerificador(e.token, { page: '3', limit: '2' });

    expect(pagina1.body.total).toBe(5);
    expect(pagina1.body.movimientos).toHaveLength(2);
    expect(pagina2.body.movimientos).toHaveLength(2);
    expect(pagina3.body.movimientos).toHaveLength(1);

    const idsVistos = [pagina1, pagina2, pagina3].flatMap((p) =>
      (p.body.movimientos as Array<{ id: string }>).map((m) => m.id),
    );
    expect(new Set(idsVistos).size).toBe(5);
    expect(new Set(idsVistos)).toEqual(new Set(creados.map((m) => m.id)));

    // Página más allá del total — vacía, con total correcto.
    const masAlla = await getVerificador(e.token, { page: '5', limit: '50' });
    expect(masAlla.body.movimientos).toEqual([]);
    expect(masAlla.body.total).toBe(5);
  });

  it('validación de query — limit fuera de rango 400, rango invertido 422, rango ausente 400', async () => {
    const e = await seed();

    const limitInvalido = await getVerificador(e.token, { limit: '500' });
    expect(limitInvalido.status).toBe(400);

    const invertido = await request(app.getHttpServer())
      .get('/api/movimientos-bancarios')
      .query({ desde: HASTA, hasta: DESDE })
      .set('Authorization', `Bearer ${e.token}`);
    expect(invertido.status).toBe(422);
    expect(invertido.body.error.code).toBe('CONCILIACION_LISTADO_RANGO_INVALIDO');

    const sinRango = await request(app.getHttpServer())
      .get('/api/movimientos-bancarios')
      .query({ desde: DESDE })
      .set('Authorization', `Bearer ${e.token}`);
    expect(sinRango.status).toBe(400);
  });

  // ==========================================================
  // REQ-VMB-06/07 — vínculo roto: página sin escrituras + franja de auditoría
  // ==========================================================

  it('REQ-VMB-07 — el filtro `estado` escondería un pendiente real: la auditoría lo destapa, sin escribir nada', async () => {
    const e = await seed();
    const comprobanteId = await crearComprobante(e, { dia: 10, monto: '1500.00' });
    const movimiento = await crearMovimiento(e, { dia: 10, monto: '1500.00' });

    await request(app.getHttpServer())
      .post('/api/conciliacion/matches')
      .set('Authorization', `Bearer ${e.token}`)
      .send({ movimientoBancarioId: movimiento.id, comprobanteId, orden: 1 })
      .expect(201);

    // Romper el ancla: anular el comprobante (REQ-CB-10 ⇒ COMPROBANTE_ANULADO).
    await prisma.comprobante.update({
      where: { id: comprobanteId },
      data: {
        anulado: true,
        fechaAnulacion: new Date(),
        motivoAnulacion: 'Anulado para el e2e del verificador',
        anuladoPorUserId: e.ownerId,
      },
    });

    // Sin filtro `estado`: el movimiento aparece en la página con el estado
    // DERIVADO (PENDIENTE) aunque la columna cacheada diga CONCILIADO (REQ-VMB-06).
    const sinFiltro = await getVerificador(e.token);
    expect(sinFiltro.body.movimientos).toHaveLength(1);
    expect(sinFiltro.body.movimientos[0].estado).toBe('CONCILIADO');
    expect(sinFiltro.body.movimientos[0].estadoEfectivo).toBe('PENDIENTE');
    expect(sinFiltro.body.movimientos[0].vinculo.roto).toBe('COMPROBANTE_ANULADO');
    expect(sinFiltro.body.auditoriaVinculos.aplicada).toBe(false);

    // Con `estado=PENDIENTE`: la columna cacheada lo excluye de la página,
    // pero la franja de auditoría lo destapa (REQ-VMB-07).
    const filtrado = await getVerificador(e.token, { estado: 'PENDIENTE' });
    expect(filtrado.status).toBe(200);
    expect(filtrado.body.movimientos).toEqual([]);
    expect(filtrado.body.auditoriaVinculos.aplicada).toBe(true);
    expect(filtrado.body.auditoriaVinculos.total).toBe(1);
    expect(filtrado.body.auditoriaVinculos.rotos).toEqual([
      {
        movimientoBancarioId: movimiento.id,
        cuentaBancariaId: e.cuentaBancariaId,
        fecha: '2026-06-10',
        monto: '1500.00',
        moneda: 'BOB',
        descripcion: 'DEPOSITO EN EFECTIVO',
        motivo: 'COMPROBANTE_ANULADO',
      },
    ]);

    // La lectura NUNCA escribe: ni el match ni la columna `estado` se tocaron.
    expect(await prisma.matchConciliacion.count({ where: { organizationId: e.orgId } })).toBe(1);
    const movEnDb = await prisma.movimientoBancario.findUniqueOrThrow({
      where: { id: movimiento.id },
    });
    expect(movEnDb.estado).toBe(EstadoMovimientoBancario.CONCILIADO);
  });

  // ==========================================================
  // REQ-VMB-08/09 — saldos vigentes con null honesto
  // ==========================================================

  it('REQ-VMB-08/09 — franja de saldos: último saldo con fecha, null honesto sin fallback, cuenta sin movimientos null/null', async () => {
    const e = await seed();

    // Cuenta 1: el ÚLTIMO movimiento tiene saldo=null aunque el anterior
    // publica 500.00 ⇒ null honesto, sin escanear hacia atrás (REQ-VMB-09).
    await crearMovimiento(e, { dia: 5, monto: '100.00', saldo: '500.00' });
    await crearMovimiento(e, { dia: 10, monto: '100.00', saldo: null });

    // Cuenta 2: último movimiento con saldo publicado.
    const segunda = await crearCuentaBancariaConImportacion(
      e.orgId,
      e.ownerId,
      e.cuentaOtraId,
      'Banco con saldo',
    );
    await crearMovimiento(e, {
      dia: 8,
      monto: '300.00',
      saldo: '1500.00',
      cuentaBancariaId: segunda.cuentaBancariaId,
      importacionId: segunda.importacionId,
    });

    // Cuenta 3: sin movimientos ⇒ null/null, nunca 0 (REQ-VMB-08).
    const cuentaVacia = await crearCuenta(e.orgId, '1.1.1.004', 'Banco sin movimientos');
    const tercera = await crearCuentaBancariaConImportacion(
      e.orgId,
      e.ownerId,
      cuentaVacia,
      'Banco vacío',
    );

    const res = await getVerificador(e.token);
    expect(res.status).toBe(200);

    const porCuenta = new Map(
      (
        res.body.saldos as Array<{
          cuentaBancariaId: string;
          saldo: string | null;
          fechaUltimoMovimiento: string | null;
        }>
      ).map((s) => [s.cuentaBancariaId, s]),
    );
    expect(porCuenta.size).toBe(3);
    expect(porCuenta.get(e.cuentaBancariaId)).toMatchObject({
      saldo: null,
      fechaUltimoMovimiento: '2026-06-10',
    });
    expect(porCuenta.get(segunda.cuentaBancariaId)).toMatchObject({
      saldo: '1500.00',
      fechaUltimoMovimiento: '2026-06-08',
    });
    expect(porCuenta.get(tercera.cuentaBancariaId)).toMatchObject({
      saldo: null,
      fechaUltimoMovimiento: null,
    });
  });

  // ==========================================================
  // REQ-VMB-13 — aislamiento multi-tenant
  // ==========================================================

  it('REQ-VMB-13 — movimientos ajenos invisibles en página, totales y saldos; filtrar por cuenta ajena ⇒ vacío', async () => {
    const a = await seed('org-verif-a');
    const b = await seed('org-verif-b');

    const movA = await crearMovimiento(a, { dia: 10, monto: '100.00', saldo: '900.00' });
    await crearMovimiento(b, { dia: 10, monto: '7777.77', saldo: '7777.77' });

    const res = await getVerificador(a.token);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.movimientos).toHaveLength(1);
    expect(res.body.movimientos[0].id).toBe(movA.id);

    // Totales y saldos reflejan SOLO datos de A.
    expect(res.body.totales).toEqual([
      { moneda: 'BOB', totalDebitos: '0.00', totalCreditos: '100.00', cantidad: 1 },
    ]);
    const cuentasEnSaldos = (res.body.saldos as Array<{ cuentaBancariaId: string }>).map(
      (s) => s.cuentaBancariaId,
    );
    expect(cuentasEnSaldos).toEqual([a.cuentaBancariaId]);
    expect(res.body.saldos[0].saldo).toBe('900.00');

    // Filtrar por una cuenta de OTRO tenant ⇒ vacío, sin revelar su existencia.
    const cuentaAjena = await getVerificador(a.token, { cuentaBancariaId: b.cuentaBancariaId });
    expect(cuentaAjena.status).toBe(200);
    expect(cuentaAjena.body.total).toBe(0);
    expect(cuentaAjena.body.movimientos).toEqual([]);
  });
});
