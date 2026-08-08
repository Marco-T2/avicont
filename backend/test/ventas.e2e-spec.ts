/**
 * E2E — Ventas (`ventas-piloto`, Fase 7).
 *
 * Cubre:
 *   - task 7.1 / criterio 1-2: venta CONTADO y CREDITO → asiento contabilizado
 *     con número propio de la serie `V`, y la contrapartida correcta en cada
 *     caso (Caja elegida vs. CxC del concepto).
 *   - task 7.3 / criterio 5: anular el comprobante DESDE comprobantes → 409;
 *     desde ventas → procede, con número y comprobante preservados.
 *   - task 7.4: cerrar el período NO saca la venta del estado de cuenta — el
 *     comprobante pasa a `BLOQUEADO` y la cartera no se mueve.
 *
 * Correr con:
 *   DATABASE_URL=... JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh \
 *   NODE_OPTIONS="--experimental-vm-modules" \
 *   pnpm exec jest test/ventas.e2e-spec.ts --runInBand --forceExit
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EstadoComprobante, TipoComprobante } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

import { cuerpoVenta, EscenarioComercial, seedComercial } from './helpers/comercial-fixture';
import { cleanupTestData } from './helpers/test-factory';

describe('Ventas (e2e)', () => {
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
  // Helpers locales
  // ==========================================================

  async function crearVenta(
    e: EscenarioComercial,
    opts: Parameters<typeof cuerpoVenta>[1],
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/ventas')
      .set('Authorization', `Bearer ${e.token}`)
      .send(cuerpoVenta(e, opts));
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function contabilizarVenta(
    e: EscenarioComercial,
    ventaId: string,
  ): Promise<{ comprobanteId: string; numero: string }> {
    const res = await request(app.getHttpServer())
      .post(`/api/ventas/${ventaId}/contabilizar`)
      .set('Authorization', `Bearer ${e.token}`);
    expect(res.status).toBe(200);
    return { comprobanteId: res.body.comprobanteId, numero: res.body.numero };
  }

  interface LineaLeida {
    cuentaId: string;
    debitoBob: string;
    creditoBob: string;
  }

  async function leerComprobante(e: EscenarioComercial, comprobanteId: string) {
    const res = await request(app.getHttpServer())
      .get(`/api/comprobantes/${comprobanteId}`)
      .set('Authorization', `Bearer ${e.token}`);
    expect(res.status).toBe(200);
    return res.body as {
      id: string;
      tipo: TipoComprobante;
      numero: string | null;
      estado: EstadoComprobante;
      anulado: boolean;
      lineas: LineaLeida[];
    };
  }

  /**
   * El par (cuenta, lado, importe) de cada línea, para comparar el asiento
   * completo de una sola vez.
   *
   * El importe se compara NUMÉRICO a propósito: lo que este test verifica es
   * QUÉ cuenta se debita y por cuánto, no cómo se serializa el decimal. Atarlo
   * al string acopla el test a un formato que hoy además es inconsistente
   * dentro del propio `comprobante-response.dto.ts` (la cabecera usa
   * `toFixed(2)` y las líneas `toString()`, así que `1000.00` sale `"1000"`).
   * Ese desprolijo es real y está reportado aparte — pero es de `comprobantes`,
   * no de ventas, y no es lo que este caso está probando.
   */
  function resumirLineas(
    lineas: LineaLeida[],
  ): Array<{ cuentaId: string; lado: 'D' | 'H'; monto: number }> {
    return lineas
      .map((l) => {
        const debe = Number(l.debitoBob);
        return debe > 0
          ? { cuentaId: l.cuentaId, lado: 'D' as const, monto: debe }
          : { cuentaId: l.cuentaId, lado: 'H' as const, monto: Number(l.creditoBob) };
      })
      .sort((a, b) => a.lado.localeCompare(b.lado));
  }

  // ==========================================================
  // 7.1 — asiento con número propio de la serie V
  // ==========================================================

  describe('7.1 — el asiento de la venta lleva número propio de la serie V', () => {
    it('CONTADO debita la cuenta destino elegida; CREDITO debita CxC; ambos comparten la serie V y la consumen consecutiva', async () => {
      const e = await seedComercial(app, prisma, { slug: 'org-vta-71' });

      const contadoId = await crearVenta(e, { condicionPago: 'CONTADO' });
      const creditoId = await crearVenta(e, { condicionPago: 'CREDITO' });

      const contado = await contabilizarVenta(e, contadoId);
      const credito = await contabilizarVenta(e, creditoId);

      // El número sale de la serie propia `V`, con el mes de la FECHA CONTABLE
      // (2026-07), no del día en que se corre el test.
      expect(contado.numero).toBe('V2607-000001');
      expect(credito.numero).toBe('V2607-000002');

      const compContado = await leerComprobante(e, contado.comprobanteId);
      const compCredito = await leerComprobante(e, credito.comprobanteId);

      expect(compContado.tipo).toBe(TipoComprobante.VENTA);
      expect(compContado.estado).toBe(EstadoComprobante.CONTABILIZADO);
      expect(compCredito.tipo).toBe(TipoComprobante.VENTA);

      // 100 × 10.00 = 1000.00 en las dos. Lo que cambia es QUÉ cuenta se debita.
      expect(resumirLineas(compContado.lineas)).toEqual([
        { cuentaId: e.cajaId, lado: 'D', monto: 1000 },
        { cuentaId: e.ventasCuentaId, lado: 'H', monto: 1000 },
      ]);
      expect(resumirLineas(compCredito.lineas)).toEqual([
        { cuentaId: e.cxcId, lado: 'D', monto: 1000 },
        { cuentaId: e.ventasCuentaId, lado: 'H', monto: 1000 },
      ]);
    });

    it('la serie V es PROPIA: un asiento manual del mismo mes no la consume ni la corre', async () => {
      const e = await seedComercial(app, prisma, { slug: 'org-vta-71b' });

      // Asiento manual de tipo DIARIO en el mismo mes.
      const manualRes = await request(app.getHttpServer())
        .post('/api/comprobantes')
        .set('Authorization', `Bearer ${e.token}`)
        .send({
          tipo: TipoComprobante.DIARIO,
          fechaContable: '2026-07-10',
          glosa: 'Asiento manual del contador',
          lineas: [
            {
              cuentaId: e.cajaId,
              moneda: 'BOB',
              debito: '50.00',
              credito: '0',
              tipoCambio: '1',
              debitoBob: '50.00',
              creditoBob: '0',
            },
            {
              cuentaId: e.ventasCuentaId,
              moneda: 'BOB',
              debito: '0',
              credito: '50.00',
              tipoCambio: '1',
              debitoBob: '0',
              creditoBob: '50.00',
            },
          ],
        });
      expect(manualRes.status).toBe(201);
      const postManual = await request(app.getHttpServer())
        .post(`/api/comprobantes/${manualRes.body.id}/contabilizar`)
        .set('Authorization', `Bearer ${e.token}`);
      expect(postManual.status).toBe(201);
      expect(postManual.body.numero).toBe('D2607-000001');

      // La venta sigue arrancando en 1 de SU serie: las series no se comparten.
      const ventaId = await crearVenta(e, { condicionPago: 'CONTADO' });
      const { numero } = await contabilizarVenta(e, ventaId);
      expect(numero).toBe('V2607-000001');
    });
  });

  // ==========================================================
  // 7.3 — anular desde comprobantes → 409; desde ventas → procede
  // ==========================================================

  describe('7.3 — la anulación entra por la venta, no por el comprobante', () => {
    it('anular el comprobante de una venta desde /comprobantes devuelve 409 y no lo toca', async () => {
      const e = await seedComercial(app, prisma, { slug: 'org-vta-73a' });
      const ventaId = await crearVenta(e, { condicionPago: 'CREDITO' });
      const { comprobanteId } = await contabilizarVenta(e, ventaId);

      const res = await request(app.getHttpServer())
        .post(`/api/comprobantes/${comprobanteId}/anular`)
        .set('Authorization', `Bearer ${e.token}`)
        .send({ motivo: 'Intento de anulación por la puerta de atrás' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('COMPROBANTE_ANULACION_DESDE_ORIGEN');

      // El rechazo no dejó nada a medias.
      const comp = await leerComprobante(e, comprobanteId);
      expect(comp.anulado).toBe(false);
      expect(comp.estado).toBe(EstadoComprobante.CONTABILIZADO);
    });

    it('anular desde /ventas procede: la venta queda anulada y el comprobante conserva su número', async () => {
      const e = await seedComercial(app, prisma, { slug: 'org-vta-73b' });
      const ventaId = await crearVenta(e, { condicionPago: 'CREDITO' });
      const { comprobanteId, numero } = await contabilizarVenta(e, ventaId);

      const res = await request(app.getHttpServer())
        .post(`/api/ventas/${ventaId}/anular`)
        .set('Authorization', `Bearer ${e.token}`)
        .send({ motivo: 'Venta duplicada por error de carga' });
      expect(res.status).toBe(204);

      const ventaRes = await request(app.getHttpServer())
        .get(`/api/ventas/${ventaId}`)
        .set('Authorization', `Bearer ${e.token}`);
      expect(ventaRes.status).toBe(200);
      expect(ventaRes.body.anulado).toBe(true);

      // §4.7: el comprobante se preserva con su número; no se borra ni se renumera.
      const comp = await leerComprobante(e, comprobanteId);
      expect(comp.anulado).toBe(true);
      expect(comp.numero).toBe(numero);

      // Y sale de la cartera: el estado de cuenta ya no la lista.
      const ec = await request(app.getHttpServer())
        .get(`/api/estado-cuenta/${e.contactoId}`)
        .set('Authorization', `Bearer ${e.token}`);
      expect(ec.status).toBe(200);
      expect(ec.body.ventas).toHaveLength(0);
    });
  });

  // ==========================================================
  // 7.4 — cerrar el período no mueve la cartera
  // ==========================================================

  describe('7.4 — el cierre del período bloquea el asiento, no la deuda', () => {
    it('tras cerrar el período el comprobante queda BLOQUEADO y la venta sigue en el estado de cuenta con el mismo saldo', async () => {
      const e = await seedComercial(app, prisma, { slug: 'org-vta-74' });

      // Enero: cerrar el período 1 no exige cerrar ningún anterior (§4.4).
      const ventaId = await crearVenta(e, {
        condicionPago: 'CREDITO',
        fechaContable: '2026-01-15',
        fechaVencimiento: '2026-02-15',
      });
      const { comprobanteId } = await contabilizarVenta(e, ventaId);

      const antes = await request(app.getHttpServer())
        .get(`/api/estado-cuenta/${e.contactoId}`)
        .set('Authorization', `Bearer ${e.token}`);
      expect(antes.status).toBe(200);
      expect(antes.body.ventas).toHaveLength(1);
      const saldoAntes = antes.body.ventas[0].saldoPendiente as string;
      expect(saldoAntes).toBe('1000.00');

      // Cerrar el período de enero.
      const periodosRes = await request(app.getHttpServer())
        .get('/api/periodos')
        .set('Authorization', `Bearer ${e.token}`);
      expect(periodosRes.status).toBe(200);
      const enero = (periodosRes.body as Array<{ id: string; month: number }>).find(
        (p) => p.month === 1,
      );
      expect(enero).toBeDefined();

      const cerrarRes = await request(app.getHttpServer())
        .post(`/api/periodos/${enero!.id}/cerrar`)
        .set('Authorization', `Bearer ${e.token}`);
      expect(cerrarRes.status).toBe(201);
      expect(cerrarRes.body.status).toBe('CERRADO');

      // El comprobante se bloquea…
      const comp = await leerComprobante(e, comprobanteId);
      expect(comp.estado).toBe(EstadoComprobante.BLOQUEADO);
      expect(comp.anulado).toBe(false);

      // …y la cartera NO se mueve. Es el punto del test: `ESTADOS_CONCILIABLES`
      // incluye BLOQUEADO, así que el cierre mensual no hace desaparecer la
      // deuda del cliente (§4.4, corolario).
      const despues = await request(app.getHttpServer())
        .get(`/api/estado-cuenta/${e.contactoId}`)
        .set('Authorization', `Bearer ${e.token}`);
      expect(despues.status).toBe(200);
      expect(despues.body.ventas).toHaveLength(1);
      expect(despues.body.ventas[0].ventaId).toBe(ventaId);
      expect(despues.body.ventas[0].saldoPendiente).toBe(saldoAntes);
      expect(despues.body.totalSaldoPendiente).toBe(antes.body.totalSaldoPendiente);
    });
  });
});
