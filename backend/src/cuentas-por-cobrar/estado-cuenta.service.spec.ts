import { FakeClockAdapter } from '@/common/clock/fake-clock.adapter';
import { Money } from '@/common/domain/money';

import { EstadoCuentaService } from './estado-cuenta.service';
import type {
  CarteraReaderPort,
  CobroCarteraRow,
  VentaCarteraRow,
} from './ports/cartera-reader.port';

const TENANT = 'org-a';
const CONTACTO = 'contacto-1';
const RAZON_SOCIAL = 'Avícola Sur';

function ventaCartera(over: Partial<VentaCarteraRow> = {}): VentaCarteraRow {
  return {
    ventaId: 'venta-1',
    fechaContable: new Date(Date.UTC(2026, 6, 10)),
    fechaVencimiento: new Date(Date.UTC(2026, 7, 10)),
    createdAt: new Date('2026-07-10T10:00:00Z'),
    montoTotal: Money.of('1000.00'),
    totalAplicado: Money.ZERO,
    ...over,
  };
}

function cobroCartera(over: Partial<CobroCarteraRow> = {}): CobroCarteraRow {
  return {
    cobroId: 'cobro-1',
    monto: Money.of('500.00'),
    totalAplicado: Money.ZERO,
    ...over,
  };
}

describe('EstadoCuentaService (REQ-CXC-07)', () => {
  let cartera: { [K in keyof CarteraReaderPort]: jest.Mock };
  let clock: FakeClockAdapter;
  let service: EstadoCuentaService;

  beforeEach(() => {
    cartera = {
      listarVentasDeCartera: jest.fn().mockResolvedValue([]),
      listarCobrosDeContacto: jest.fn().mockResolvedValue([]),
      obtenerRazonSocialContacto: jest.fn().mockResolvedValue(RAZON_SOCIAL),
    };
    clock = new FakeClockAdapter();
    // Mediodía La Paz (16:00 UTC): el "hoy" contable es el 28-jul sin ambigüedad.
    clock.setTo('2026-07-28T16:00:00.000Z');
    service = new EstadoCuentaService(cartera as unknown as CarteraReaderPort, clock);
  });

  describe('obtener', () => {
    it('el contacto inexistente o ajeno responde el mismo 404 (§4.2, REQ-CXC-08)', async () => {
      cartera.obtenerRazonSocialContacto.mockResolvedValue(null);

      await expect(service.obtener(TENANT, CONTACTO)).rejects.toMatchObject({
        code: 'COBRO_CONTACTO_NO_ENCONTRADO',
      });
      expect(cartera.listarVentasDeCartera).not.toHaveBeenCalled();
    });

    it('deriva montoTotal, cobrado, saldoPendiente y estado comercial por venta — nada persistido (Anti-05)', async () => {
      cartera.listarVentasDeCartera.mockResolvedValue([
        ventaCartera({
          ventaId: 'venta-parcial',
          montoTotal: Money.of('1000.00'),
          totalAplicado: Money.of('400.00'),
        }),
        ventaCartera({
          ventaId: 'venta-abierta',
          fechaContable: new Date(Date.UTC(2026, 6, 12)),
          montoTotal: Money.of('300.00'),
          totalAplicado: Money.ZERO,
        }),
      ]);

      const res = await service.obtener(TENANT, CONTACTO);

      expect(res.contactoId).toBe(CONTACTO);
      expect(res.razonSocial).toBe(RAZON_SOCIAL);
      expect(res.ventas).toHaveLength(2);

      const parcial = res.ventas.find((v) => v.ventaId === 'venta-parcial');
      expect(parcial).toMatchObject({ estadoComercial: 'PARCIAL' });
      expect(parcial?.montoTotal.toBob()).toBe('1000.00');
      expect(parcial?.cobrado.toBob()).toBe('400.00');
      expect(parcial?.saldoPendiente.toBob()).toBe('600.00');

      const abierta = res.ventas.find((v) => v.ventaId === 'venta-abierta');
      expect(abierta).toMatchObject({ estadoComercial: 'ABIERTA' });
      expect(abierta?.saldoPendiente.toBob()).toBe('300.00');

      expect(res.totalSaldoPendiente.toBob()).toBe('900.00');
    });

    it('la venta SALDADA (saldo 0) no aparece: el estado de cuenta lista deuda viva', async () => {
      cartera.listarVentasDeCartera.mockResolvedValue([
        ventaCartera({
          ventaId: 'venta-saldada',
          montoTotal: Money.of('500.00'),
          totalAplicado: Money.of('500.00'),
        }),
        ventaCartera({ ventaId: 'venta-viva', montoTotal: Money.of('200.00') }),
      ]);

      const res = await service.obtener(TENANT, CONTACTO);

      expect(res.ventas.map((v) => v.ventaId)).toEqual(['venta-viva']);
      expect(res.totalSaldoPendiente.toBob()).toBe('200.00');
    });

    it('publica el orden canónico FIFO aunque el reader devuelva otro orden (REQ-CXC-05)', async () => {
      // El frontend auto-tilda sobre ESTE orden y no lo recalcula (B-9):
      // devolverlo desordenado vuelve arbitraria la sugerencia FIFO.
      cartera.listarVentasDeCartera.mockResolvedValue([
        ventaCartera({
          ventaId: 'venta-julio',
          fechaContable: new Date(Date.UTC(2026, 6, 1)),
          createdAt: new Date('2026-07-01T10:00:00Z'),
        }),
        ventaCartera({
          ventaId: 'venta-junio-tarde',
          fechaContable: new Date(Date.UTC(2026, 5, 15)),
          createdAt: new Date('2026-06-15T12:00:00Z'),
        }),
        ventaCartera({
          ventaId: 'venta-junio-temprano',
          fechaContable: new Date(Date.UTC(2026, 5, 15)),
          createdAt: new Date('2026-06-15T08:00:00Z'),
        }),
      ]);

      const res = await service.obtener(TENANT, CONTACTO);

      expect(res.ventas.map((v) => v.ventaId)).toEqual([
        'venta-junio-temprano',
        'venta-junio-tarde',
        'venta-julio',
      ]);
    });

    it('VENCIDA es una lectura contra ClockPort, no un evento (escenario REQ-CXC-01)', async () => {
      // DADO fechaVencimiento = 2026-07-27 y saldo > 0, CUANDO se consulta el
      // 2026-07-28 según ClockPort, ENTONCES informa VENCIDA con 1 día.
      cartera.listarVentasDeCartera.mockResolvedValue([
        ventaCartera({ fechaVencimiento: new Date(Date.UTC(2026, 6, 27)) }),
      ]);

      const res = await service.obtener(TENANT, CONTACTO);

      expect(res.ventas[0]).toMatchObject({ vencida: true, diasAtraso: 1 });
      expect(res.fechaCorte).toBe('2026-07-28');
    });

    it('el día del vencimiento la venta NO está vencida (estrictamente menor)', async () => {
      cartera.listarVentasDeCartera.mockResolvedValue([
        ventaCartera({ fechaVencimiento: new Date(Date.UTC(2026, 6, 28)) }),
      ]);

      const res = await service.obtener(TENANT, CONTACTO);

      expect(res.ventas[0]).toMatchObject({ vencida: false, diasAtraso: 0 });
    });

    it('el atraso se mide contra el ClockPort, jamás contra el reloj del sistema (§4.6, Anti-20)', async () => {
      // Fecha lejana al presente real: un `new Date()` escondido daría 0 días
      // (2030 todavía no llegó) y este test lo mata.
      clock.setTo('2030-01-10T16:00:00.000Z');
      cartera.listarVentasDeCartera.mockResolvedValue([
        ventaCartera({ fechaVencimiento: new Date(Date.UTC(2030, 0, 1)) }),
      ]);

      const res = await service.obtener(TENANT, CONTACTO);

      expect(res.ventas[0]).toMatchObject({ vencida: true, diasAtraso: 9 });
      expect(res.fechaCorte).toBe('2030-01-10');
    });

    it('la venta sin fechaVencimiento nunca se informa vencida', async () => {
      cartera.listarVentasDeCartera.mockResolvedValue([ventaCartera({ fechaVencimiento: null })]);

      const res = await service.obtener(TENANT, CONTACTO);

      expect(res.ventas[0]).toMatchObject({
        fechaVencimiento: null,
        vencida: false,
        diasAtraso: 0,
      });
    });

    it('saldo a favor = Σ (monto − aplicado) de los cobros del contacto', async () => {
      cartera.listarCobrosDeContacto.mockResolvedValue([
        cobroCartera({
          cobroId: 'c1',
          monto: Money.of('500.00'),
          totalAplicado: Money.of('400.00'),
        }),
        cobroCartera({ cobroId: 'c2', monto: Money.of('200.00'), totalAplicado: Money.ZERO }),
        cobroCartera({
          cobroId: 'c3',
          monto: Money.of('100.00'),
          totalAplicado: Money.of('100.00'),
        }),
      ]);

      const res = await service.obtener(TENANT, CONTACTO);

      expect(res.saldoAFavor.toBob()).toBe('300.00');
    });

    it('cliente sin cartera ni cobros: listas vacías y totales en cero, nunca un 404', async () => {
      const res = await service.obtener(TENANT, CONTACTO);

      expect(res.ventas).toEqual([]);
      expect(res.totalSaldoPendiente.toBob()).toBe('0.00');
      expect(res.saldoAFavor.toBob()).toBe('0.00');
    });

    it('expone las fechas como ISO de calendario puro, sin corrimiento UTC (§4.6)', async () => {
      cartera.listarVentasDeCartera.mockResolvedValue([ventaCartera()]);

      const res = await service.obtener(TENANT, CONTACTO);

      expect(res.ventas[0]).toMatchObject({
        fechaContable: '2026-07-10',
        fechaVencimiento: '2026-08-10',
      });
    });
  });
});
