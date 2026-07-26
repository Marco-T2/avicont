/**
 * E2E — Informe de conciliación bancaria (tasks 3.6–3.8 de
 * `informe-conciliacion-bancaria`).
 *
 * Cubre:
 *   - REQ-ICB-09: 404 cross-tenant (GET y POST); `read` sin `conciliar` VE el
 *     informe y NO puede declarar un arranque.
 *   - REQ-ICB-04: el `GET` NO crea arranque — una lectura nunca escribe; sin
 *     arranque el informe se emite ABSTENIDO.
 *   - REQ-ICB-01/02/06: la identidad cierra con las tres partidas y residuo 0.
 *   - REQ-ICB-05: DESCUADRE en una importación del rango → el informe se
 *     emite igual y NO afirma "conciliado".
 *
 * Correr con:
 *   DATABASE_URL=... JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh \
 *   NODE_OPTIONS="--experimental-vm-modules" \
 *   pnpm exec jest test/informe-conciliacion.e2e-spec.ts --runInBand --forceExit
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ClaseCuenta,
  EstadoComprobante,
  EstadoMovimientoBancario,
  EstadoVerificacionExtracto,
  GestionFiscalStatus,
  LadoBancario,
  LadoContable,
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
const CORTE = '2026-07-31';

describe('Conciliación — Informe (e2e)', () => {
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
    periodoJulioId: string;
    importacionJulioId: string;
  }

  /** Org con pack + cuenta bancaria + período de julio + importación de julio. */
  async function seed(slug = 'org-inf'): Promise<Escenario> {
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);
    const owner = await prisma.user.create({
      data: { email: `owner+${slug}@inf.bo`, hashedPassword, isEmailVerified: true },
    });
    const org = await prisma.organization.create({
      data: {
        slug,
        name: `Org ${slug}`,
        memberships: { create: { userId: owner.id, systemRole: SystemRole.OWNER } },
      },
    });

    const packId = await prisma.pack
      .findUnique({ where: { clave: PACK_CLAVE } })
      .then((p) => p?.id ?? crearPack());
    await prisma.orgPackEntitlement.create({
      data: { organizationId: org.id, packId, activo: true, habilitadoPorUserId: owner.id },
    });

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
    const periodoJulio = await prisma.periodoFiscal.create({
      data: {
        organizationId: org.id,
        gestionId: gestion.id,
        year: 2026,
        month: 7,
        ordenEnGestion: 7,
        status: PeriodoFiscalStatus.ABIERTO,
      },
    });

    const importacionJulio = await crearImportacion(
      org.id,
      cuentaBancaria.id,
      owner.id,
      '2026-07-01',
      '2026-07-31',
    );

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `owner+${slug}@inf.bo`, password: PASSWORD });

    const escenario: Escenario = {
      token: loginRes.body.accessToken as string,
      orgId: org.id,
      ownerId: owner.id,
      cuentaBancoId: cuentaBanco,
      cuentaOtraId: cuentaOtra,
      cuentaBancariaId: cuentaBancaria.id,
      periodoJulioId: periodoJulio.id,
      importacionJulioId: importacionJulio,
    };

    // Asiento de APERTURA al 30/06 por Bs 1.000,00 — el mismo saldo que
    // `postArranque` declara por defecto.
    //
    // No es decoración del fixture: el informe exhibe el saldo del MAYOR, no
    // el declarado en el arranque. Sin este asiento la organización declararía
    // un punto de partida de 1.000 sobre un mayor vacío, y eso ya no pasa
    // callado — dispara ARRANQUE_LIBROS_NO_COINCIDE, que es exactamente la
    // situación que el motivo existe para nombrar.
    await crearComprobante(escenario, {
      fecha: '2026-06-30',
      monto: '1000.00',
      tipoBanco: 'DEBITO',
    });

    return escenario;
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

  let shaSeq = 0;
  async function crearImportacion(
    organizationId: string,
    cuentaBancariaId: string,
    userId: string,
    desde: string,
    hasta: string,
    estadoVerificacion: EstadoVerificacionExtracto = 'SIN_VERIFICAR',
  ): Promise<string> {
    shaSeq += 1;
    const imp = await prisma.importacionExtracto.create({
      data: {
        organizationId,
        cuentaBancariaId,
        nombreArchivo: `extracto-${shaSeq}.xlsx`,
        sha256Archivo: String(shaSeq).padStart(64, 'a'),
        tamanioBytes: 100,
        perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
        fechaDesde: new Date(`${desde}T00:00:00.000Z`),
        fechaHasta: new Date(`${hasta}T00:00:00.000Z`),
        coberturaDeclarada: false,
        estadoVerificacion,
        filasLeidas: 0,
        movimientosNuevos: 0,
        movimientosDuplicados: 0,
        importadoPorUserId: userId,
      },
    });
    return imp.id;
  }

  /** Miembro con CustomRole de permisos acotados (REQ-ICB-09). */
  async function seedMiembro(orgId: string, slug: string, permissions: string[]): Promise<string> {
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);
    const user = await prisma.user.create({
      data: { email: `member+${slug}@inf.bo`, hashedPassword, isEmailVerified: true },
    });
    const role = await prisma.customRole.create({
      data: { organizationId: orgId, slug: `rol-${slug}`, name: `Rol ${slug}`, permissions },
    });
    await prisma.membership.create({
      data: { organizationId: orgId, userId: user.id, customRoleId: role.id },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `member+${slug}@inf.bo`, password: PASSWORD });
    return loginRes.body.accessToken as string;
  }

  let hashSeq = 0;
  async function crearMovimiento(
    e: Escenario,
    opts: {
      fecha: string;
      monto: string;
      tipo: LadoBancario;
      saldo?: string;
      estado?: EstadoMovimientoBancario;
    },
  ) {
    hashSeq += 1;
    return prisma.movimientoBancario.create({
      data: {
        organizationId: e.orgId,
        cuentaBancariaId: e.cuentaBancariaId,
        importacionId: e.importacionJulioId,
        fecha: new Date(`${opts.fecha}T00:00:00.000Z`),
        hora: null,
        monto: new Prisma.Decimal(opts.monto),
        tipo: opts.tipo,
        moneda: Moneda.BOB,
        descripcion: 'MOVIMIENTO E2E',
        descripcionNormalizada: 'MOVIMIENTO E2E',
        referencia: null,
        saldo: opts.saldo === undefined ? null : new Prisma.Decimal(opts.saldo),
        contraparteNombre: null,
        contraparteDocumento: null,
        datosOriginales: {},
        ordinalDia: 0,
        hashDedup: `hash-inf-${hashSeq}`,
        estado: opts.estado ?? EstadoMovimientoBancario.PENDIENTE,
      },
    });
  }

  let numeroSeq = 0;
  /** Comprobante CONTABILIZADO con la pata banco en `tipoBanco` (débito o crédito). */
  async function crearComprobante(
    e: Escenario,
    opts: { fecha: string; monto: string; tipoBanco: LadoContable },
  ): Promise<string> {
    numeroSeq += 1;
    const debitoBanco = opts.tipoBanco === 'DEBITO';
    const monto = new Prisma.Decimal(opts.monto);
    const cero = new Prisma.Decimal(0);
    const comprobante = await prisma.comprobante.create({
      data: {
        organizationId: e.orgId,
        tipo: TipoComprobante.DIARIO,
        numero: `D2607-${String(numeroSeq).padStart(6, '0')}`,
        estado: EstadoComprobante.CONTABILIZADO,
        fechaContable: new Date(`${opts.fecha}T00:00:00.000Z`),
        periodoFiscalId: e.periodoJulioId,
        glosa: 'Comprobante e2e informe',
        monedaPrincipal: Moneda.BOB,
        totalDebitoBob: monto,
        totalCreditoBob: monto,
        createdByUserId: e.ownerId,
        lineas: {
          create: [
            {
              organizationId: e.orgId,
              orden: 1,
              cuentaId: e.cuentaBancoId,
              moneda: Moneda.BOB,
              debito: debitoBanco ? monto : cero,
              credito: debitoBanco ? cero : monto,
              tipoCambio: new Prisma.Decimal('1'),
              debitoBob: debitoBanco ? monto : cero,
              creditoBob: debitoBanco ? cero : monto,
            },
            {
              organizationId: e.orgId,
              orden: 2,
              cuentaId: e.cuentaOtraId,
              moneda: Moneda.BOB,
              debito: debitoBanco ? cero : monto,
              credito: debitoBanco ? monto : cero,
              tipoCambio: new Prisma.Decimal('1'),
              debitoBob: debitoBanco ? cero : monto,
              creditoBob: debitoBanco ? monto : cero,
            },
          ],
        },
      },
    });
    return comprobante.id;
  }

  async function crearMatch(
    e: Escenario,
    movimientoBancarioId: string,
    comprobanteId: string,
    opts: { fecha: string; monto: string; tipoBanco: LadoContable },
  ) {
    await prisma.movimientoBancario.update({
      where: { id: movimientoBancarioId },
      data: { estado: EstadoMovimientoBancario.CONCILIADO },
    });
    return prisma.matchConciliacion.create({
      data: {
        organizationId: e.orgId,
        movimientoBancarioId,
        comprobanteId,
        orden: 1,
        snapshotCuentaId: e.cuentaBancoId,
        snapshotMonto: new Prisma.Decimal(opts.monto),
        snapshotTipo: opts.tipoBanco,
        snapshotMoneda: Moneda.BOB,
        snapshotFecha: new Date(`${opts.fecha}T00:00:00.000Z`),
        confianzaSugerida: null,
        conciliadoPorUserId: e.ownerId,
      },
    });
  }

  function getInforme(token: string, cuentaBancariaId: string, corte = CORTE) {
    return request(app.getHttpServer())
      .get('/api/conciliacion/informe')
      .query({ cuentaBancariaId, corte })
      .set('Authorization', `Bearer ${token}`);
  }

  function postArranque(
    token: string,
    body: {
      cuentaBancariaId: string;
      fecha?: string;
      saldoExtracto?: string;
      saldoLibros?: string;
      diferenciaResidual?: string;
      nota?: string;
      referenciasPartidas?: string[];
    },
  ) {
    return request(app.getHttpServer())
      .post('/api/conciliacion/arranques')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fecha: '2026-06-30',
        saldoExtracto: '1000.00',
        saldoLibros: '1000.00',
        diferenciaResidual: '0.00',
        // Por defecto NO se arrastra nada: el asiento de apertura del seed
        // figura entre los candidatos y NO es una partida conciliatoria — su
        // saldo ya está dentro del extracto declarado. Confirmarlo sería el
        // error que este endpoint existe para evitar.
        referenciasPartidas: [],
        ...body,
      });
  }

  function getCandidatos(token: string, cuentaBancariaId: string, fecha: string) {
    return request(app.getHttpServer())
      .get('/api/conciliacion/arranques/candidatos')
      .query({ cuentaBancariaId, fecha })
      .set('Authorization', `Bearer ${token}`);
  }

  // ==========================================================
  // REQ-ICB-09 — 404 cross-tenant, nunca 403
  // ==========================================================

  it('404 cross-tenant — la cuenta bancaria de otra organización "no existe" (GET y POST)', async () => {
    const e1 = await seed('org-inf-a');
    const e2 = await seed('org-inf-b');

    const resGet = await getInforme(e1.token, e2.cuentaBancariaId);
    expect(resGet.status).toBe(404);

    const resPost = await postArranque(e1.token, { cuentaBancariaId: e2.cuentaBancariaId });
    expect(resPost.status).toBe(404);
    expect(await prisma.arranqueConciliado.count()).toBe(0);
  });

  // ==========================================================
  // REQ-ICB-09 — `read` sin `conciliar`: VE el informe, NO declara
  // ==========================================================

  it('usuario con read y sin conciliar → VE el informe (200) y recibe 403 al declarar', async () => {
    const e = await seed();
    const tokenLector = await seedMiembro(e.orgId, 'lector', ['contabilidad.conciliacion.read']);

    const resGet = await getInforme(tokenLector, e.cuentaBancariaId);
    expect(resGet.status).toBe(200);

    const resPost = await postArranque(tokenLector, { cuentaBancariaId: e.cuentaBancariaId });
    expect(resPost.status).toBe(403);
    expect(await prisma.arranqueConciliado.count()).toBe(0);
  });

  // ==========================================================
  // REQ-ICB-04 — el GET no crea arranque; sin arranque, ABSTENIDO
  // ==========================================================

  it('el GET no crea arranque: una lectura nunca escribe, y el informe indica la abstención', async () => {
    const e = await seed();
    await crearMovimiento(e, {
      fecha: '2026-07-10',
      monto: '200.00',
      tipo: 'CREDITO',
      saldo: '1200.00',
    });

    const res = await getInforme(e.token, e.cuentaBancariaId);

    expect(res.status).toBe(200);
    expect(res.body.arranque).toBeNull();
    expect(res.body.partidas).toBeNull();
    expect(res.body.residuo).toBeNull();
    expect(res.body.saldoExtracto).toBe('1200.00');
    expect(res.body.confiabilidad.conciliado).toBe(false);
    expect(res.body.confiabilidad.motivos).toEqual(
      expect.arrayContaining([{ tipo: 'SIN_ARRANQUE' }]),
    );
    // La lectura NO escribió: ninguna declaración apareció.
    expect(await prisma.arranqueConciliado.count()).toBe(0);
  });

  // ==========================================================
  // REQ-ICB-01/02/06 — la identidad cierra con las tres partidas
  // ==========================================================

  it('flujo completo: declarar arranque y obtener un informe que cierra con las tres partidas', async () => {
    const e = await seed();

    // Arranque declarado por comando explícito (REQ-ICB-04).
    const resArranque = await postArranque(e.token, {
      cuentaBancariaId: e.cuentaBancariaId,
      nota: 'adopción de la cuenta',
    });
    expect(resArranque.status).toBe(201);
    expect(resArranque.body.diferenciaResidual).toBe('0.00');

    // Julio del banco: +500 conciliado, +200 pendiente, −50 ignorado.
    const movConc = await crearMovimiento(e, {
      fecha: '2026-07-05',
      monto: '500.00',
      tipo: 'CREDITO',
      saldo: '1500.00',
    });
    await crearMovimiento(e, {
      fecha: '2026-07-10',
      monto: '200.00',
      tipo: 'CREDITO',
      saldo: '1700.00',
    });
    await crearMovimiento(e, {
      fecha: '2026-07-12',
      monto: '50.00',
      tipo: 'DEBITO',
      saldo: '1650.00',
      estado: 'IGNORADO',
    });

    // Julio de libros: +500 conciliada, −80 en tránsito (cheque no cobrado).
    const compConc = await crearComprobante(e, {
      fecha: '2026-07-05',
      monto: '500.00',
      tipoBanco: 'DEBITO',
    });
    await crearComprobante(e, { fecha: '2026-07-20', monto: '80.00', tipoBanco: 'CREDITO' });
    await crearMatch(e, movConc.id, compConc, {
      fecha: '2026-07-05',
      monto: '500.00',
      tipoBanco: 'DEBITO',
    });

    const res = await getInforme(e.token, e.cuentaBancariaId);

    expect(res.status).toBe(200);
    // Extracto: saldo del último movimiento ≤ corte. Libros: 1000 + 500 − 80.
    expect(res.body.saldoExtracto).toBe('1650.00');
    expect(res.body.saldoLibros).toBe('1420.00');
    expect(res.body.arranque).toMatchObject({
      fecha: '2026-06-30',
      diferenciaResidual: '0.00',
      declaradoPorUserId: e.ownerId,
    });

    // Cada grupo como partida separada (REQ-ICB-02), el conciliado se cancela.
    expect(res.body.partidas.pendientes.importe).toBe('-200.00');
    expect(res.body.partidas.pendientes.detalle).toHaveLength(1);
    expect(res.body.partidas.ignorados.importe).toBe('50.00');
    expect(res.body.partidas.ignorados.detalle).toHaveLength(1);
    expect(res.body.partidas.enTransito.importe).toBe('-80.00');
    expect(res.body.partidas.enTransito.detalle).toHaveLength(1);
    expect(res.body.partidas.arranque.importe).toBe('0.00');

    // La identidad cierra sola y la conclusión se afirma.
    expect(res.body.residuo).toBe('0.00');
    expect(res.body.confiabilidad).toEqual({ conciliado: true, motivos: [] });
  });

  // ==========================================================
  // REQ-ICB-05 — DESCUADRE: se emite igual, NO se afirma conciliado
  // ==========================================================

  it('DESCUADRE en una importación del rango → los números se muestran y la conclusión se retiene', async () => {
    const e = await seed();
    await postArranque(e.token, { cuentaBancariaId: e.cuentaBancariaId }).expect(201);

    const impDescuadre = await crearImportacion(
      e.orgId,
      e.cuentaBancariaId,
      e.ownerId,
      '2026-08-01',
      '2026-08-31',
      'DESCUADRE',
    );
    // La del rango es la de JULIO: un DESCUADRE en agosto (posterior al corte)
    // no retiene la conclusión — se marca la de julio.
    await prisma.importacionExtracto.update({
      where: { id: e.importacionJulioId },
      data: { estadoVerificacion: 'DESCUADRE' },
    });
    await crearMovimiento(e, {
      fecha: '2026-07-10',
      monto: '0.01',
      tipo: 'CREDITO',
      saldo: '1000.01',
    });

    const res = await getInforme(e.token, e.cuentaBancariaId);

    expect(res.status).toBe(200);
    // El puente se muestra igual (REQ-ICB-05): partidas y residuo presentes.
    expect(res.body.partidas.pendientes.importe).toBe('-0.01');
    expect(res.body.residuo).toBe('0.00');
    expect(res.body.confiabilidad.conciliado).toBe(false);
    expect(res.body.confiabilidad.motivos).toEqual([
      { tipo: 'DESCUADRE', importacionId: e.importacionJulioId },
    ]);
    // Trazabilidad (REQ-ICB-08): el insumo viaja con su estado.
    expect(res.body.insumos.importaciones).toEqual([
      expect.objectContaining({ id: e.importacionJulioId, estadoVerificacion: 'DESCUADRE' }),
    ]);
    expect(impDescuadre).toBeDefined();
  });

  // ==========================================================
  // ARRANQUE_EXTRACTO_NO_COINCIDE — el saldo DECLARADO se contrasta
  // contra el extracto REAL a la fecha del arranque
  // ==========================================================

  it('saldo de arranque declarado basura con residual "correcto" → residuo 0.00 y el motivo igual viaja por HTTP', async () => {
    const e = await seed();

    // El extracto real al 05/07 cierra en 714.99 (crédito de 699.00 sobre 15.99).
    await crearMovimiento(e, {
      fecha: '2026-07-05',
      monto: '699.00',
      tipo: 'CREDITO',
      saldo: '714.99',
    });

    // Se declara el arranque al 05/07 con el saldo de APERTURA del día (15.99)
    // en vez del de cierre — pero con la residual CORRECTA, que hace cerrar la
    // identidad igual: el caso que NADA detectaba antes de este contraste.
    //
    // El lado libros va sano a propósito (1.000,00 = el asiento de apertura,
    // que es el mayor real a esa fecha) para que el único motivo que pueda
    // aparecer sea el del extracto. La residual verdadera es
    // 714,99 − 1.000,00 = −285,01: negativa porque el extracto queda POR
    // DEBAJO de los libros.
    await postArranque(e.token, {
      cuentaBancariaId: e.cuentaBancariaId,
      fecha: '2026-07-05',
      saldoExtracto: '15.99',
      saldoLibros: '1000.00',
      diferenciaResidual: '-285.01',
    }).expect(201);

    const res = await getInforme(e.token, e.cuentaBancariaId);

    expect(res.status).toBe(200);
    // La identidad cierra "impecable"…
    expect(res.body.residuo).toBe('0.00');
    // …y aun así la conclusión se retiene: el punto de partida no coincide
    // con el extracto. Los TRES números viajan en el motivo.
    expect(res.body.confiabilidad.conciliado).toBe(false);
    expect(res.body.confiabilidad.motivos).toEqual([
      {
        tipo: 'ARRANQUE_EXTRACTO_NO_COINCIDE',
        fecha: '2026-07-05',
        declarado: '15.99',
        real: '714.99',
        diferencia: '699.00',
      },
    ]);
  });

  it('saldo según libros declarado ≠ mayor real → ARRANQUE_LIBROS_NO_COINCIDE, y el informe exhibe el MAYOR', async () => {
    const e = await seed();

    // El mayor tiene 1.000,00 (apertura al 30/06) + 200,00 de julio = 1.200,00.
    // Nada de esto lo declara el usuario: sale de los asientos.
    await crearComprobante(e, { fecha: '2026-07-10', monto: '200.00', tipoBanco: 'DEBITO' });
    await crearMovimiento(e, {
      fecha: '2026-07-10',
      monto: '200.00',
      tipo: 'CREDITO',
      saldo: '1200.00',
    });

    // Se declara un punto de partida de 250,00 sobre un mayor que dice 1.000,00.
    await postArranque(e.token, {
      cuentaBancariaId: e.cuentaBancariaId,
      saldoLibros: '250.00',
    }).expect(201);

    const res = await getInforme(e.token, e.cuentaBancariaId);

    expect(res.status).toBe(200);
    // El informe exhibe el MAYOR, no el declarado: 1.000 + 200 = 1.200,00.
    // Con el comportamiento anterior habría dicho 250 + 200 = 450,00, un
    // número que ningún asiento respalda.
    expect(res.body.saldoLibros).toBe('1200.00');
    expect(res.body.confiabilidad.conciliado).toBe(false);
    expect(res.body.confiabilidad.motivos).toContainEqual({
      tipo: 'ARRANQUE_LIBROS_NO_COINCIDE',
      fecha: '2026-06-30',
      declarado: '250.00',
      real: '1000.00',
      diferencia: '750.00',
    });
  });

  it('cheque girado ANTES del arranque y aún sin cobrar → partida nombrada, no residuo', async () => {
    const e = await seed();

    // Libros: apertura 1.000 (del seed) menos un cheque de 400 girado el 20/06
    // que el banco nunca cobró ⇒ mayor al 30/06 = 600.
    await crearComprobante(e, { fecha: '2026-06-20', monto: '400.00', tipoBanco: 'CREDITO' });

    // El sistema PROPONE las partidas abiertas al 30/06. Hay dos, y solo una
    // es conciliatoria: el cheque. La otra es el asiento de apertura, cuyo
    // saldo ya está dentro del extracto declarado — indistinguibles para el
    // sistema, obvias para quien concilia.
    const candidatos = await getCandidatos(e.token, e.cuentaBancariaId, '2026-06-30');
    expect(candidatos.status).toBe(200);
    expect(candidatos.body).toHaveLength(2);

    const cheque = (candidatos.body as { referencia: string; importe: string }[]).find(
      (c) => c.importe === '-400.00',
    );
    expect(cheque).toBeDefined();

    // Arranque al 30/06 coherente con el mayor. La residual va en 0 porque los
    // 400 NO son inexplicables: son un cheque en circulación, y el usuario lo
    // sabe. Verificación aritmética: Σ confirmadas debe dar
    // saldoLibros − saldoExtracto + residual = 600 − 1000 + 0 = −400. ✓
    await postArranque(e.token, {
      cuentaBancariaId: e.cuentaBancariaId,
      saldoExtracto: '1000.00',
      saldoLibros: '600.00',
      diferenciaResidual: '0.00',
      referenciasPartidas: [cheque!.referencia],
    }).expect(201);

    // Julio: un depósito de 200 que sí quedó conciliado contra su asiento.
    const movJulio = await crearMovimiento(e, {
      fecha: '2026-07-10',
      monto: '200.00',
      tipo: 'CREDITO',
      saldo: '1200.00',
    });
    const compJulio = await crearComprobante(e, {
      fecha: '2026-07-10',
      monto: '200.00',
      tipoBanco: 'DEBITO',
    });
    await crearMatch(e, movJulio.id, compJulio, {
      fecha: '2026-07-10',
      monto: '200.00',
      tipoBanco: 'DEBITO',
    });

    const res = await getInforme(e.token, e.cuentaBancariaId);

    expect(res.status).toBe(200);
    expect(res.body.saldoLibros).toBe('800.00');
    expect(res.body.saldoExtracto).toBe('1200.00');

    // El cheque de junio figura como partida EN TRÁNSITO, marcada como
    // anterior al arranque — no como un residuo sin nombre.
    expect(res.body.partidas.enTransito.detalle).toHaveLength(1);
    expect(res.body.partidas.enTransito.detalle[0]).toMatchObject({
      fecha: '2026-06-20',
      importe: '-400.00',
      anteriorAlArranque: true,
    });

    // La identidad cierra: 800 − 1200 − (−400) = 0.
    expect(res.body.residuo).toBe('0.00');
    expect(res.body.confiabilidad.motivos.map((m: { tipo: string }) => m.tipo)).not.toContain(
      'RESIDUO_NO_EXPLICADO',
    );
    expect(res.body.confiabilidad.conciliado).toBe(true);
  });

  it('confirmar una partida que ya no figura entre las abiertas → falla fuerte, no descarta en silencio', async () => {
    const e = await seed();

    const res = await postArranque(e.token, {
      cuentaBancariaId: e.cuentaBancariaId,
      referenciasPartidas: ['LIN:comprobante-que-no-existe:1'],
    });

    // 422 — el mapeo de `InvalidStateError`, el mismo que ya usa
    // CONCILIACION_MONEDA_NO_SOPORTADA.
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CONCILIACION_ARRANQUE_PARTIDAS_DESCONOCIDAS');
    expect(res.body.error.details.referencias).toEqual(['LIN:comprobante-que-no-existe:1']);
    // Nada persistido: o entra el acto entero o no entra.
    expect(await prisma.arranqueConciliado.count()).toBe(0);
  });
});
