/**
 * E2E — Cobros y sus aplicaciones (`ventas-piloto`, Fase 7).
 *
 * Cubre la task 7.2 / criterio 4: **re-imputar un cobro no toca contabilidad**.
 * Una `AplicacionCobro` es un VÍNCULO, no un hecho contable (D-03): el asiento
 * del cobro ya registró la entrada de plata, y a quién se le imputa esa plata
 * no cambia ni un débito.
 *
 * "Byte-idéntico" se mide contra la FILA de la base —cabecera y líneas, con
 * `updatedAt` incluido— y no contra la respuesta HTTP: si el comprobante se
 * reescribiera con los mismos valores, el DTO no lo delataría y `updatedAt` sí.
 *
 * Correr con:
 *   DATABASE_URL=... JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh \
 *   NODE_OPTIONS="--experimental-vm-modules" \
 *   pnpm exec jest test/cobros.e2e-spec.ts --runInBand --forceExit
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

import { cuerpoVenta, EscenarioComercial, seedComercial } from './helpers/comercial-fixture';
import { cleanupTestData } from './helpers/test-factory';

describe('Cobros — aplicaciones (e2e)', () => {
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
  // Helpers
  // ==========================================================

  /** Venta a CRÉDITO ya contabilizada: la única que integra la cartera (D-04). */
  async function ventaCreditoContabilizada(
    e: EscenarioComercial,
    precioUnitario: string,
  ): Promise<string> {
    const crear = await request(app.getHttpServer())
      .post('/api/ventas')
      .set('Authorization', `Bearer ${e.token}`)
      .send(cuerpoVenta(e, { condicionPago: 'CREDITO', cantidad: '1', precioUnitario }));
    expect(crear.status).toBe(201);
    const ventaId = crear.body.id as string;

    const post = await request(app.getHttpServer())
      .post(`/api/ventas/${ventaId}/contabilizar`)
      .set('Authorization', `Bearer ${e.token}`);
    expect(post.status).toBe(200);
    return ventaId;
  }

  async function cobroContabilizado(
    e: EscenarioComercial,
    monto: string,
  ): Promise<{ cobroId: string; comprobanteId: string }> {
    const crear = await request(app.getHttpServer())
      .post('/api/cobros')
      .set('Authorization', `Bearer ${e.token}`)
      .send({
        contactoId: e.contactoId,
        fechaContable: '2026-07-20',
        monto,
        cuentaDestinoId: e.cajaId,
        glosa: 'Pago del cliente',
      });
    expect(crear.status).toBe(201);
    const cobroId = crear.body.id as string;

    const post = await request(app.getHttpServer())
      .post(`/api/cobros/${cobroId}/contabilizar`)
      .set('Authorization', `Bearer ${e.token}`);
    expect(post.status).toBe(200);
    return { cobroId, comprobanteId: post.body.comprobanteId as string };
  }

  /** Snapshot completo desde la BD: cabecera + líneas, sin proyectar nada. */
  async function snapshotComprobante(comprobanteId: string) {
    const comprobante = await prisma.comprobante.findUniqueOrThrow({
      where: { id: comprobanteId },
      include: { lineas: { orderBy: { orden: 'asc' } } },
    });
    // `JSON.parse(JSON.stringify(...))` normaliza Decimal y Date a primitivos
    // para que `toEqual` compare por VALOR y no por identidad de objeto.
    return JSON.parse(JSON.stringify(comprobante)) as unknown;
  }

  async function aplicar(
    e: EscenarioComercial,
    cobroId: string,
    ventaId: string,
    montoAplicado: string,
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/api/cobros/${cobroId}/aplicaciones`)
      .set('Authorization', `Bearer ${e.token}`)
      .send({ ventaId, montoAplicado });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  // ==========================================================
  // 7.2 — re-imputar no toca contabilidad
  // ==========================================================

  it('aplicar, editar el monto, desaplicar y re-aplicar a OTRA venta deja el comprobante del cobro byte-idéntico', async () => {
    const e = await seedComercial(app, prisma, { slug: 'org-cob-72' });

    const ventaA = await ventaCreditoContabilizada(e, '1000.00');
    const ventaB = await ventaCreditoContabilizada(e, '1000.00');
    const { cobroId, comprobanteId } = await cobroContabilizado(e, '600.00');

    const original = await snapshotComprobante(comprobanteId);

    // 1) Aplicar los 600 a la venta A.
    const aplicacionId = await aplicar(e, cobroId, ventaA, '600.00');
    expect(await snapshotComprobante(comprobanteId)).toEqual(original);

    // 2) Bajar la imputación a 400 (quedan 200 a favor).
    const editar = await request(app.getHttpServer())
      .put(`/api/cobros/${cobroId}/aplicaciones/${aplicacionId}`)
      .set('Authorization', `Bearer ${e.token}`)
      .send({ montoAplicado: '400.00' });
    expect(editar.status).toBe(204);
    expect(await snapshotComprobante(comprobanteId)).toEqual(original);

    // 3) Desaplicar por completo.
    const borrar = await request(app.getHttpServer())
      .delete(`/api/cobros/${cobroId}/aplicaciones/${aplicacionId}`)
      .set('Authorization', `Bearer ${e.token}`);
    expect(borrar.status).toBe(204);
    expect(await snapshotComprobante(comprobanteId)).toEqual(original);

    // 4) Re-imputar los mismos 600 a OTRA venta — el caso que da nombre a la task.
    await aplicar(e, cobroId, ventaB, '600.00');
    expect(await snapshotComprobante(comprobanteId)).toEqual(original);

    // Y la plata terminó donde la mandamos: A vuelve a deber todo, B debe 400.
    const ec = await request(app.getHttpServer())
      .get(`/api/estado-cuenta/${e.contactoId}`)
      .set('Authorization', `Bearer ${e.token}`);
    expect(ec.status).toBe(200);
    const porVenta = new Map<string, string>(
      (ec.body.ventas as Array<{ ventaId: string; saldoPendiente: string }>).map((v) => [
        v.ventaId,
        v.saldoPendiente,
      ]),
    );
    expect(porVenta.get(ventaA)).toBe('1000.00');
    expect(porVenta.get(ventaB)).toBe('400.00');
  });

  it('el snapshot detecta un cambio real: anular el cobro SÍ mueve su comprobante', async () => {
    // Contra-prueba del test de arriba. Sin esto, `toEqual(original)` pasaría
    // igual si el snapshot no mirara nada útil — es el gemelo que exige la
    // regla de "los tests de un invariante necesitan las dos direcciones".
    const e = await seedComercial(app, prisma, { slug: 'org-cob-72b' });
    const { cobroId, comprobanteId } = await cobroContabilizado(e, '600.00');

    const original = await snapshotComprobante(comprobanteId);

    const anular = await request(app.getHttpServer())
      .post(`/api/cobros/${cobroId}/anular`)
      .set('Authorization', `Bearer ${e.token}`)
      .send({ motivo: 'El cliente desconoció el depósito' });
    expect(anular.status).toBe(204);

    expect(await snapshotComprobante(comprobanteId)).not.toEqual(original);
  });
});
