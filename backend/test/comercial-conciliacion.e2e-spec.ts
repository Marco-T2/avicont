/**
 * E2E — Frontera entre el módulo comercial y el pack de conciliación bancaria
 * (`ventas-piloto`, Fase 7).
 *
 * Cubre la task 7.5 / criterio 7: **los cobros a Caja General NO aparecen entre
 * los movimientos conciliables de la cuenta banco; el `TRASPASO` manual sí.**
 *
 * Es el test que prueba que Ventas no contaminó el pack de conciliación. El
 * riesgo que cubre no es teórico: el panel contable del workspace se arma
 * leyendo LÍNEAS por cuenta, así que si el asiento de un cobro tocara la cuenta
 * banco —o si el panel filtrara por otra cosa que la cuenta— el contador vería
 * plata para conciliar que nunca pasó por el banco.
 *
 * El modelo correcto es el que el negocio ya usa: la plata entra a Caja cuando
 * se cobra, y recién el depósito (un `TRASPASO` Caja → Banco) es lo que el
 * extracto va a mostrar.
 *
 * Correr con:
 *   DATABASE_URL=... JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh \
 *   NODE_OPTIONS="--experimental-vm-modules" \
 *   pnpm exec jest test/comercial-conciliacion.e2e-spec.ts --runInBand --forceExit
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Moneda, PerfilExtracto, TipoComprobante, TipoPack, VerticalPack } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

import { cuerpoVenta, EscenarioComercial, seedComercial } from './helpers/comercial-fixture';
import { cleanupTestData } from './helpers/test-factory';

const PACK_CLAVE = 'contabilidad.conciliacion';
const DESDE = '2026-07-01';
const HASTA = '2026-07-31';

describe('Comercial ↔ conciliación bancaria (e2e)', () => {
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
  // Fixture: escenario comercial + pack activo + cuenta bancaria
  // ==========================================================

  async function seedConPack(
    slug: string,
  ): Promise<EscenarioComercial & { cuentaBancariaId: string }> {
    const e = await seedComercial(app, prisma, { slug });

    const pack = await prisma.pack.upsert({
      where: { clave: PACK_CLAVE },
      update: {},
      create: {
        clave: PACK_CLAVE,
        nombre: 'Conciliación bancaria',
        descripcion: 'Importa extractos bancarios y concilia movimientos.',
        verticalAplicable: VerticalPack.CONTABILIDAD,
        tipo: TipoPack.DOMINIO,
        otorgadoPorDefecto: true,
      },
    });
    await prisma.orgPackEntitlement.create({
      data: {
        organizationId: e.orgId,
        packId: pack.id,
        activo: true,
        habilitadoPorUserId: e.ownerId,
      },
    });

    const cuentaBancaria = await prisma.cuentaBancaria.create({
      data: {
        organizationId: e.orgId,
        cuentaId: e.bancoId,
        alias: 'BancoSol corriente',
        perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
        numeroCuenta: '1191959-000-001',
        moneda: Moneda.BOB,
      },
    });

    return { ...e, cuentaBancariaId: cuentaBancaria.id };
  }

  /** Cobro a Caja General, contabilizado. Nunca toca la cuenta banco. */
  async function cobroACaja(e: EscenarioComercial, monto: string): Promise<string> {
    const crear = await request(app.getHttpServer())
      .post('/api/cobros')
      .set('Authorization', `Bearer ${e.token}`)
      .send({
        contactoId: e.contactoId,
        fechaContable: '2026-07-20',
        monto,
        cuentaDestinoId: e.cajaId,
        glosa: 'Cobro en efectivo del cliente',
      });
    expect(crear.status).toBe(201);

    const post = await request(app.getHttpServer())
      .post(`/api/cobros/${crear.body.id}/contabilizar`)
      .set('Authorization', `Bearer ${e.token}`);
    expect(post.status).toBe(200);
    return post.body.comprobanteId as string;
  }

  /** El depósito: TRASPASO manual Caja → Banco, contabilizado. */
  async function traspasoCajaABanco(e: EscenarioComercial, monto: string): Promise<string> {
    const crear = await request(app.getHttpServer())
      .post('/api/comprobantes')
      .set('Authorization', `Bearer ${e.token}`)
      .send({
        tipo: TipoComprobante.TRASPASO,
        fechaContable: '2026-07-22',
        glosa: 'Depósito de la recaudación en el banco',
        lineas: [
          {
            cuentaId: e.bancoId,
            moneda: 'BOB',
            debito: monto,
            credito: '0',
            tipoCambio: '1',
            debitoBob: monto,
            creditoBob: '0',
          },
          {
            cuentaId: e.cajaId,
            moneda: 'BOB',
            debito: '0',
            credito: monto,
            tipoCambio: '1',
            debitoBob: '0',
            creditoBob: monto,
          },
        ],
      });
    expect(crear.status).toBe(201);

    const post = await request(app.getHttpServer())
      .post(`/api/comprobantes/${crear.body.id}/contabilizar`)
      .set('Authorization', `Bearer ${e.token}`);
    expect(post.status).toBe(201);
    return crear.body.id as string;
  }

  async function workspace(e: EscenarioComercial & { cuentaBancariaId: string }) {
    const res = await request(app.getHttpServer())
      .get('/api/conciliacion')
      .query({ cuentaBancariaId: e.cuentaBancariaId, desde: DESDE, hasta: HASTA })
      .set('Authorization', `Bearer ${e.token}`);
    expect(res.status).toBe(200);
    return res.body as {
      lineas: Array<{ comprobanteId: string; orden: number; montoBob: string; tipo: string }>;
      resumen: { lineasEnTransito: number };
    };
  }

  // ==========================================================
  // 7.5
  // ==========================================================

  it('el cobro a Caja no entra al panel conciliable; el TRASPASO al banco sí, y solo por su línea de banco', async () => {
    const e = await seedConPack('org-conc-75');

    const comprobanteCobro = await cobroACaja(e, '600.00');
    const comprobanteTraspaso = await traspasoCajaABanco(e, '500.00');

    const ws = await workspace(e);

    const comprobantesEnPanel = ws.lineas.map((l) => l.comprobanteId);

    // El cobro NO está: su asiento debita Caja, no Banco.
    expect(comprobantesEnPanel).not.toContain(comprobanteCobro);

    // El traspaso SÍ, y con UNA sola línea — la del banco. La contrapartida de
    // Caja pertenece al mismo comprobante y no debe aparecer: el panel es de la
    // CUENTA, no del comprobante.
    expect(ws.lineas).toHaveLength(1);
    expect(ws.lineas[0]?.comprobanteId).toBe(comprobanteTraspaso);
    expect(Number(ws.lineas[0]?.montoBob)).toBe(500);
    expect(ws.resumen.lineasEnTransito).toBe(1);
  });

  it('tampoco entra una venta al CONTADO cobrada en Caja', async () => {
    // El gemelo por el otro documento comercial: si el panel se armara por
    // "movimientos de efectivo" en vez de por cuenta, esta venta se colaría.
    const e = await seedConPack('org-conc-75b');

    const crear = await request(app.getHttpServer())
      .post('/api/ventas')
      .set('Authorization', `Bearer ${e.token}`)
      .send(cuerpoVenta(e, { condicionPago: 'CONTADO', cantidad: '1', precioUnitario: '300.00' }));
    expect(crear.status).toBe(201);
    const post = await request(app.getHttpServer())
      .post(`/api/ventas/${crear.body.id}/contabilizar`)
      .set('Authorization', `Bearer ${e.token}`);
    expect(post.status).toBe(200);

    const ws = await workspace(e);
    expect(ws.lineas).toHaveLength(0);
    expect(ws.resumen.lineasEnTransito).toBe(0);
  });

  it('una venta al CONTADO cobrada DIRECTO al banco sí entra — el criterio es la cuenta, no el módulo', async () => {
    // La contra-prueba de los dos anteriores. Sin ella, un panel que devolviera
    // SIEMPRE cero pasaría los dos tests de arriba en verde.
    const e = await seedConPack('org-conc-75c');

    const crear = await request(app.getHttpServer())
      .post('/api/ventas')
      .set('Authorization', `Bearer ${e.token}`)
      .send(
        cuerpoVenta(e, {
          condicionPago: 'CONTADO',
          cantidad: '1',
          precioUnitario: '750.00',
          cuentaDestinoId: e.bancoId,
        }),
      );
    expect(crear.status).toBe(201);
    const post = await request(app.getHttpServer())
      .post(`/api/ventas/${crear.body.id}/contabilizar`)
      .set('Authorization', `Bearer ${e.token}`);
    expect(post.status).toBe(200);

    const ws = await workspace(e);
    expect(ws.lineas).toHaveLength(1);
    expect(ws.lineas[0]?.comprobanteId).toBe(post.body.comprobanteId);
    expect(Number(ws.lineas[0]?.montoBob)).toBe(750);
  });
});
