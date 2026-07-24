/**
 * E2E — Workspace de conciliación (slice 5 de `conciliacion-bancaria`).
 *
 * Cubre:
 *   - task 5.32 / REQ-CB-12: sugerencias ALTA/MEDIA/BAJA calculadas sobre el
 *     workspace real; ninguna sugerencia crea un `MatchConciliacion` sin
 *     acción explícita del usuario.
 *   - task 5.33 / REQ-CB-14: fail-closed — usuario con solo `.read` recibe 403
 *     en TODA escritura; con `.read` + `.conciliar` las acciones pasan.
 *   - Flujo completo: sugerir → confirmar → deshacer → ignorar.
 *   - 404 sin pack activo (PackEnabledGuard).
 *
 * Correr con:
 *   DATABASE_URL=... JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh \
 *   NODE_OPTIONS="--experimental-vm-modules" \
 *   pnpm exec jest test/conciliacion-workspace.e2e-spec.ts --runInBand --forceExit
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

describe('Conciliación — Workspace (e2e)', () => {
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
    periodoId: string;
    importacionId: string;
  }

  /**
   * Org con pack activo + cuenta bancaria vinculada + período abierto +
   * importación (contenedor de los movimientos). Sin movimientos ni
   * comprobantes: cada test arma los suyos.
   */
  async function seed(slug = 'org-ws', conPack = true): Promise<Escenario> {
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);
    const owner = await prisma.user.create({
      data: { email: `owner+${slug}@ws.bo`, hashedPassword, isEmailVerified: true },
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

    const cuentaBancaria = await prisma.cuentaBancaria.create({
      data: {
        organizationId: org.id,
        cuentaId: cuentaBanco,
        alias: 'BancoSol corriente',
        perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
        numeroCuenta: '1191959-000-001',
        moneda: Moneda.BOB,
      },
    });

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

    const importacion = await prisma.importacionExtracto.create({
      data: {
        organizationId: org.id,
        cuentaBancariaId: cuentaBancaria.id,
        nombreArchivo: 'extracto.xlsx',
        sha256Archivo: 'a'.repeat(64),
        tamanioBytes: 100,
        perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
        fechaDesde: new Date(Date.UTC(2026, 5, 1)),
        fechaHasta: new Date(Date.UTC(2026, 5, 30)),
        coberturaDeclarada: false,
        estadoVerificacion: 'SIN_VERIFICAR',
        filasLeidas: 0,
        movimientosNuevos: 0,
        movimientosDuplicados: 0,
        importadoPorUserId: owner.id,
      },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `owner+${slug}@ws.bo`, password: PASSWORD });

    return {
      token: loginRes.body.accessToken as string,
      orgId: org.id,
      ownerId: owner.id,
      cuentaBancoId: cuentaBanco,
      cuentaOtraId: cuentaOtra,
      cuentaBancariaId: cuentaBancaria.id,
      periodoId: periodo.id,
      importacionId: importacion.id,
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

  /** Miembro con CustomRole de permisos acotados (REQ-CB-14). */
  async function seedMiembro(
    orgId: string,
    slug: string,
    permissions: string[],
  ): Promise<string> {
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);
    const user = await prisma.user.create({
      data: { email: `member+${slug}@ws.bo`, hashedPassword, isEmailVerified: true },
    });
    const role = await prisma.customRole.create({
      data: { organizationId: orgId, slug: `rol-${slug}`, name: `Rol ${slug}`, permissions },
    });
    await prisma.membership.create({
      data: { organizationId: orgId, userId: user.id, customRoleId: role.id },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `member+${slug}@ws.bo`, password: PASSWORD });
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
  async function crearMovimiento(e: Escenario, opts: { dia: number; monto: string }) {
    hashSeq += 1;
    return prisma.movimientoBancario.create({
      data: {
        organizationId: e.orgId,
        cuentaBancariaId: e.cuentaBancariaId,
        importacionId: e.importacionId,
        fecha: new Date(Date.UTC(2026, 5, opts.dia)),
        hora: null,
        monto: new Prisma.Decimal(opts.monto),
        tipo: 'CREDITO',
        moneda: Moneda.BOB,
        descripcion: 'DEPOSITO EN EFECTIVO',
        descripcionNormalizada: 'DEPOSITO EN EFECTIVO',
        referencia: null,
        saldo: null,
        contraparteNombre: null,
        contraparteDocumento: null,
        datosOriginales: {},
        ordinalDia: 0,
        hashDedup: `hash-e2e-${hashSeq}`,
        estado: EstadoMovimientoBancario.PENDIENTE,
      },
    });
  }

  function getWorkspace(token: string, cuentaBancariaId: string) {
    return request(app.getHttpServer())
      .get('/api/conciliacion')
      .query({ cuentaBancariaId, desde: DESDE, hasta: HASTA })
      .set('Authorization', `Bearer ${token}`);
  }

  // ==========================================================
  // 404 sin pack activo
  // ==========================================================

  it('404 sin pack activo — el workspace "no existe" para la org', async () => {
    const e = await seed('org-ws-nopack', false);
    const res = await getWorkspace(e.token, e.cuentaBancariaId);
    expect(res.status).toBe(404);
  });

  // ==========================================================
  // 5.32 — REQ-CB-12: sugerencias sobre el workspace real, sin auto-match
  // ==========================================================

  it('5.32 — sugerencias ALTA / MEDIA / BAJA calculadas sobre el workspace real', async () => {
    const e = await seed();

    // ALTA: par único, misma fecha, mismo monto.
    const compAlta = await crearComprobante(e, { dia: 10, monto: '1500.00' });
    const movAlta = await crearMovimiento(e, { dia: 10, monto: '1500.00' });

    // MEDIA: par único, 2 días de diferencia.
    const compMedia = await crearComprobante(e, { dia: 14, monto: '2500.00' });
    const movMedia = await crearMovimiento(e, { dia: 12, monto: '2500.00' });

    // BAJA: un movimiento que calza contra DOS líneas → ambigüedad.
    await crearComprobante(e, { dia: 20, monto: '900.00' });
    await crearComprobante(e, { dia: 20, monto: '900.00' });
    const movBaja = await crearMovimiento(e, { dia: 20, monto: '900.00' });

    const res = await getWorkspace(e.token, e.cuentaBancariaId);
    expect(res.status).toBe(200);

    const porMovimiento = new Map<string, string[]>();
    for (const s of res.body.sugerencias as Array<{ movimientoId: string; confianza: string }>) {
      porMovimiento.set(s.movimientoId, [...(porMovimiento.get(s.movimientoId) ?? []), s.confianza]);
    }

    expect(porMovimiento.get(movAlta.id)).toEqual(['ALTA']);
    expect(porMovimiento.get(movMedia.id)).toEqual(['MEDIA']);
    expect(porMovimiento.get(movBaja.id)).toEqual(['BAJA', 'BAJA']);

    const sugerenciaAlta = (
      res.body.sugerencias as Array<{ movimientoId: string; comprobanteId: string; orden: number }>
    ).find((s) => s.movimientoId === movAlta.id);
    expect(sugerenciaAlta).toEqual({
      movimientoId: movAlta.id,
      comprobanteId: compAlta,
      orden: 1,
      confianza: 'ALTA',
      diferenciaDias: 0,
    });
    expect(compMedia).toBeDefined();

    // NINGUNA sugerencia crea un match sin acción explícita del usuario.
    expect(await prisma.matchConciliacion.count()).toBe(0);
    expect(
      (
        res.body.movimientos as Array<{ estadoEfectivo: string }>
      ).every((m) => m.estadoEfectivo === 'PENDIENTE'),
    ).toBe(true);
    expect(res.body.resumen.lineasEnTransito).toBe(4);
  });

  // ==========================================================
  // Flujo completo: confirmar → deshacer → ignorar
  // ==========================================================

  it('flujo completo — confirmar un match, verlo CONCILIADO, deshacerlo e ignorar el movimiento', async () => {
    const e = await seed();
    const comprobanteId = await crearComprobante(e, { dia: 10, monto: '1500.00' });
    const movimiento = await crearMovimiento(e, { dia: 10, monto: '1500.00' });

    // Confirmar
    const crearRes = await request(app.getHttpServer())
      .post('/api/conciliacion/matches')
      .set('Authorization', `Bearer ${e.token}`)
      .send({
        movimientoBancarioId: movimiento.id,
        comprobanteId,
        orden: 1,
        confianzaSugerida: 'ALTA',
      });
    expect(crearRes.status).toBe(201);
    expect(crearRes.body.snapshotMonto).toBe('1500.00');
    expect(crearRes.body.snapshotTipo).toBe('DEBITO');
    expect(crearRes.body.snapshotFecha).toBe('2026-06-10');
    const matchId = crearRes.body.id as string;

    // El workspace lo muestra CONCILIADO y la línea sale del pool.
    const wsConciliado = await getWorkspace(e.token, e.cuentaBancariaId);
    expect(wsConciliado.body.movimientos[0].estadoEfectivo).toBe('CONCILIADO');
    expect(wsConciliado.body.movimientos[0].vinculo.roto).toBeNull();
    expect(wsConciliado.body.resumen.movimientosConciliados).toBe(1);
    expect(wsConciliado.body.resumen.lineasEnTransito).toBe(0);
    expect(wsConciliado.body.sugerencias).toEqual([]);

    // Deshacer
    const borrarRes = await request(app.getHttpServer())
      .delete(`/api/conciliacion/matches/${matchId}`)
      .set('Authorization', `Bearer ${e.token}`);
    expect(borrarRes.status).toBe(204);

    const wsPendiente = await getWorkspace(e.token, e.cuentaBancariaId);
    expect(wsPendiente.body.movimientos[0].estadoEfectivo).toBe('PENDIENTE');
    expect(wsPendiente.body.movimientos[0].vinculo).toBeNull();
    expect(wsPendiente.body.resumen.lineasEnTransito).toBe(1);

    // Ignorar (REQ-CB-18)
    const ignorarRes = await request(app.getHttpServer())
      .patch(`/api/movimientos-bancarios/${movimiento.id}/estado`)
      .set('Authorization', `Bearer ${e.token}`)
      .send({ estado: 'IGNORADO' });
    expect(ignorarRes.status).toBe(200);
    expect(ignorarRes.body.estado).toBe('IGNORADO');

    const wsIgnorado = await getWorkspace(e.token, e.cuentaBancariaId);
    expect(wsIgnorado.body.movimientos[0].estadoEfectivo).toBe('IGNORADO');
    expect(wsIgnorado.body.resumen.movimientosIgnorados).toBe(1);
    // Un movimiento ignorado no genera sugerencias.
    expect(wsIgnorado.body.sugerencias).toEqual([]);
  });

  it('ignorar un movimiento CONCILIADO con vínculo sano ⇒ 422 CONCILIACION_MOVIMIENTO_YA_CONCILIADO', async () => {
    const e = await seed();
    const comprobanteId = await crearComprobante(e, { dia: 10, monto: '1500.00' });
    const movimiento = await crearMovimiento(e, { dia: 10, monto: '1500.00' });

    await request(app.getHttpServer())
      .post('/api/conciliacion/matches')
      .set('Authorization', `Bearer ${e.token}`)
      .send({ movimientoBancarioId: movimiento.id, comprobanteId, orden: 1 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/movimientos-bancarios/${movimiento.id}/estado`)
      .set('Authorization', `Bearer ${e.token}`)
      .send({ estado: 'IGNORADO' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CONCILIACION_MOVIMIENTO_YA_CONCILIADO');
  });

  it('confirmar contra una línea ya conciliada con vínculo sano ⇒ 409 CONCILIACION_LINEA_YA_CONCILIADA', async () => {
    const e = await seed();
    const comprobanteId = await crearComprobante(e, { dia: 10, monto: '1500.00' });
    const primero = await crearMovimiento(e, { dia: 10, monto: '1500.00' });
    const segundo = await crearMovimiento(e, { dia: 10, monto: '1500.00' });

    await request(app.getHttpServer())
      .post('/api/conciliacion/matches')
      .set('Authorization', `Bearer ${e.token}`)
      .send({ movimientoBancarioId: primero.id, comprobanteId, orden: 1 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/conciliacion/matches')
      .set('Authorization', `Bearer ${e.token}`)
      .send({ movimientoBancarioId: segundo.id, comprobanteId, orden: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONCILIACION_LINEA_YA_CONCILIADA');
    expect(await prisma.matchConciliacion.count()).toBe(1);
  });

  // ==========================================================
  // 5.33 — REQ-CB-14: gating fail-closed
  // ==========================================================

  it('5.33 — usuario con solo .read: ve el workspace pero toda escritura devuelve 403', async () => {
    const e = await seed();
    const comprobanteId = await crearComprobante(e, { dia: 10, monto: '1500.00' });
    const movimiento = await crearMovimiento(e, { dia: 10, monto: '1500.00' });

    const tokenLectura = await seedMiembro(e.orgId, 'solo-lectura', [
      'contabilidad.conciliacion.read',
    ]);

    // Lee el workspace completo, con sugerencias incluidas.
    const lectura = await getWorkspace(tokenLectura, e.cuentaBancariaId);
    expect(lectura.status).toBe(200);
    expect(lectura.body.movimientos).toHaveLength(1);
    expect(lectura.body.sugerencias).toHaveLength(1);

    // Confirmar → 403
    const confirmar = await request(app.getHttpServer())
      .post('/api/conciliacion/matches')
      .set('Authorization', `Bearer ${tokenLectura}`)
      .send({ movimientoBancarioId: movimiento.id, comprobanteId, orden: 1 });
    expect(confirmar.status).toBe(403);

    // Ignorar → 403
    const ignorar = await request(app.getHttpServer())
      .patch(`/api/movimientos-bancarios/${movimiento.id}/estado`)
      .set('Authorization', `Bearer ${tokenLectura}`)
      .send({ estado: 'IGNORADO' });
    expect(ignorar.status).toBe(403);

    // Deshacer → 403 (antes incluso de resolver el id).
    const deshacer = await request(app.getHttpServer())
      .delete('/api/conciliacion/matches/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${tokenLectura}`);
    expect(deshacer.status).toBe(403);

    // Nada se escribió.
    expect(await prisma.matchConciliacion.count()).toBe(0);
    const movEnDb = await prisma.movimientoBancario.findUniqueOrThrow({
      where: { id: movimiento.id },
    });
    expect(movEnDb.estado).toBe(EstadoMovimientoBancario.PENDIENTE);
  });

  it('5.33bis — usuario con .read + .conciliar: las acciones pasan', async () => {
    const e = await seed();
    const comprobanteId = await crearComprobante(e, { dia: 10, monto: '1500.00' });
    const movimiento = await crearMovimiento(e, { dia: 10, monto: '1500.00' });

    const token = await seedMiembro(e.orgId, 'conciliador', [
      'contabilidad.conciliacion.read',
      'contabilidad.conciliacion.conciliar',
    ]);

    const confirmar = await request(app.getHttpServer())
      .post('/api/conciliacion/matches')
      .set('Authorization', `Bearer ${token}`)
      .send({ movimientoBancarioId: movimiento.id, comprobanteId, orden: 1 });
    expect(confirmar.status).toBe(201);

    const deshacer = await request(app.getHttpServer())
      .delete(`/api/conciliacion/matches/${confirmar.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deshacer.status).toBe(204);

    const ignorar = await request(app.getHttpServer())
      .patch(`/api/movimientos-bancarios/${movimiento.id}/estado`)
      .set('Authorization', `Bearer ${token}`)
      .send({ estado: 'IGNORADO' });
    expect(ignorar.status).toBe(200);
  });

  it('5.33ter — usuario sin .read: el workspace devuelve 403', async () => {
    const e = await seed();
    const token = await seedMiembro(e.orgId, 'sin-conciliacion', ['contabilidad.asientos.read']);

    const res = await getWorkspace(token, e.cuentaBancariaId);
    expect(res.status).toBe(403);
  });

  // ==========================================================
  // REQ-CB-13 — aislamiento cross-tenant
  // ==========================================================

  it('REQ-CB-13 — el workspace de una cuenta bancaria de otro tenant ⇒ 404', async () => {
    const a = await seed('org-ws-a');
    const b = await seed('org-ws-b');

    const res = await getWorkspace(b.token, a.cuentaBancariaId);
    expect(res.status).toBe(404);
  });

  it('query inválida (sin rango) ⇒ 400', async () => {
    const e = await seed();
    const res = await request(app.getHttpServer())
      .get('/api/conciliacion')
      .query({ cuentaBancariaId: e.cuentaBancariaId })
      .set('Authorization', `Bearer ${e.token}`);
    expect(res.status).toBe(400);
  });
});
