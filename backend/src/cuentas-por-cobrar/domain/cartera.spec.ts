import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';

import {
  diasAtraso,
  estadoComercial,
  estaVencida,
  ordenarCarteraFifo,
  saldoPendiente,
  type VentaOrdenCartera,
} from './cartera';

const fecha = (iso: string): FechaContable => FechaContable.fromIso(iso);

describe('cartera (REQ-CXC-01) — todo derivado, nada persistido', () => {
  describe('saldoPendiente', () => {
    it('deriva montoTotal − Σ montoAplicado, exacto', () => {
      const saldo = saldoPendiente(Money.of('1000.00'), Money.of('400.00'));

      // toString() assertea el valor INTERNO del Decimal, no el formato:
      // toBob()/toFixed enmascararían un crudo sin redondear.
      expect(saldo.toString()).toBe('600');
    });

    it('una venta sin aplicaciones tiene saldo = montoTotal', () => {
      expect(saldoPendiente(Money.of('1000.00'), Money.ZERO).toString()).toBe('1000');
    });

    it('una venta totalmente aplicada tiene saldo exactamente 0', () => {
      expect(saldoPendiente(Money.of('1000.00'), Money.of('1000.00')).toString()).toBe('0');
    });

    it('conserva los centavos sin re-redondear (los inputs ya vienen redondeados)', () => {
      expect(saldoPendiente(Money.of('100.10'), Money.of('0.01')).toString()).toBe('100.09');
    });
  });

  describe('estadoComercial — trío ABIERTA | PARCIAL | SALDADA', () => {
    it('sin nada aplicado es ABIERTA (borde: saldo = total exacto)', () => {
      expect(estadoComercial(Money.of('1000.00'), Money.ZERO)).toBe('ABIERTA');
    });

    it('con Bs 0.01 aplicado deja de ser ABIERTA y es PARCIAL', () => {
      expect(estadoComercial(Money.of('1000.00'), Money.of('0.01'))).toBe('PARCIAL');
    });

    it('aplicada parcialmente es PARCIAL', () => {
      expect(estadoComercial(Money.of('1000.00'), Money.of('400.00'))).toBe('PARCIAL');
    });

    it('a Bs 0.01 de saldarse sigue siendo PARCIAL (borde: saldo 0.01)', () => {
      expect(estadoComercial(Money.of('1000.00'), Money.of('999.99'))).toBe('PARCIAL');
    });

    it('con saldo exactamente 0 es SALDADA (borde: aplicado = total)', () => {
      expect(estadoComercial(Money.of('1000.00'), Money.of('1000.00'))).toBe('SALDADA');
    });

    it('un invariante violado (Σ aplicado > total) se LEE como SALDADA — la lectura no revienta', () => {
      expect(estadoComercial(Money.of('1000.00'), Money.of('1000.01'))).toBe('SALDADA');
    });
  });

  describe('estaVencida — VENCIDA = fechaVencimiento < hoy AND saldo > 0', () => {
    it('vencimiento anterior a hoy con saldo > 0 está VENCIDA (escenario spec: 27 vs 28)', () => {
      expect(estaVencida(fecha('2026-07-27'), fecha('2026-07-28'), Money.of('600.00'))).toBe(true);
    });

    it('el día del vencimiento NO está vencida (borde exacto: < estricto, no <=)', () => {
      expect(estaVencida(fecha('2026-07-28'), fecha('2026-07-28'), Money.of('600.00'))).toBe(false);
    });

    it('un día después del vencimiento SÍ está vencida (el par que discrimina < de <=)', () => {
      expect(estaVencida(fecha('2026-07-28'), fecha('2026-07-29'), Money.of('600.00'))).toBe(true);
    });

    it('vencimiento pasado pero saldo 0 NO está vencida (la deuda saldada no vence)', () => {
      expect(estaVencida(fecha('2026-07-01'), fecha('2026-07-28'), Money.ZERO)).toBe(false);
    });

    it('vencimiento futuro NO está vencida', () => {
      expect(estaVencida(fecha('2026-08-15'), fecha('2026-07-28'), Money.of('600.00'))).toBe(false);
    });
  });

  describe('diasAtraso (REQ-CXC-07)', () => {
    it('un día después del vencimiento informa 1 día de atraso (escenario spec)', () => {
      expect(diasAtraso(fecha('2026-07-27'), fecha('2026-07-28'), Money.of('600.00'))).toBe(1);
    });

    it('el día del vencimiento informa 0 (no vencida)', () => {
      expect(diasAtraso(fecha('2026-07-28'), fecha('2026-07-28'), Money.of('600.00'))).toBe(0);
    });

    it('cruza el fin de mes en calendario puro: venció 30-jun, hoy 05-jul → 5 días', () => {
      expect(diasAtraso(fecha('2026-06-30'), fecha('2026-07-05'), Money.of('600.00'))).toBe(5);
    });

    it('una venta saldada nunca acumula atraso aunque el vencimiento haya pasado', () => {
      expect(diasAtraso(fecha('2026-06-30'), fecha('2026-07-28'), Money.ZERO)).toBe(0);
    });
  });

  describe('ordenarCarteraFifo (REQ-CXC-05) — orden canónico que publica el backend', () => {
    const venta = (over: Partial<VentaOrdenCartera> & { id: string }): VentaOrdenCartera => ({
      fechaContable: fecha('2026-06-15'),
      createdAt: new Date('2026-06-15T12:00:00Z'),
      ...over,
    });

    it('ordena TRES ventas de la más vieja a la más nueva por fechaContable', () => {
      const jun01 = venta({ id: 'v-jun01', fechaContable: fecha('2026-06-01') });
      const jun15 = venta({ id: 'v-jun15', fechaContable: fecha('2026-06-15') });
      const jul01 = venta({ id: 'v-jul01', fechaContable: fecha('2026-07-01') });

      const ordenadas = ordenarCarteraFifo([jul01, jun01, jun15]);

      expect(ordenadas.map((v) => v.id)).toEqual(['v-jun01', 'v-jun15', 'v-jul01']);
    });

    it('la antigüedad la manda fechaContable, NO createdAt: una venta backdateada va primera', () => {
      // Registrada en julio pero con fecha contable de junio: para la cartera
      // es la más vieja. Un sort por createdAt la mandaría al final.
      const backdateada = venta({
        id: 'v-backdateada',
        fechaContable: fecha('2026-06-01'),
        createdAt: new Date('2026-07-10T09:00:00Z'),
      });
      const jun15 = venta({
        id: 'v-jun15',
        fechaContable: fecha('2026-06-15'),
        createdAt: new Date('2026-06-15T09:00:00Z'),
      });
      const jul01 = venta({
        id: 'v-jul01',
        fechaContable: fecha('2026-07-01'),
        createdAt: new Date('2026-07-01T09:00:00Z'),
      });

      const ordenadas = ordenarCarteraFifo([jun15, jul01, backdateada]);

      expect(ordenadas.map((v) => v.id)).toEqual(['v-backdateada', 'v-jun15', 'v-jul01']);
    });

    it('a igual fechaContable desempata por createdAt asc (orden de registro)', () => {
      const primera = venta({
        id: 'v-registrada-temprano',
        createdAt: new Date('2026-06-15T08:00:00Z'),
      });
      const segunda = venta({
        id: 'v-registrada-tarde',
        createdAt: new Date('2026-06-15T17:00:00Z'),
      });

      const ordenadas = ordenarCarteraFifo([segunda, primera]);

      expect(ordenadas.map((v) => v.id)).toEqual(['v-registrada-temprano', 'v-registrada-tarde']);
    });

    it('a igual fechaContable e igual createdAt desempata por id asc — el orden es SIEMPRE determinístico', () => {
      const instante = new Date('2026-06-15T12:00:00.000Z');
      const a = venta({ id: 'aaa-primera', createdAt: instante });
      const b = venta({ id: 'zzz-segunda', createdAt: instante });

      expect(ordenarCarteraFifo([b, a]).map((v) => v.id)).toEqual(['aaa-primera', 'zzz-segunda']);
      // El mismo par en el orden inverso produce el MISMO resultado.
      expect(ordenarCarteraFifo([a, b]).map((v) => v.id)).toEqual(['aaa-primera', 'zzz-segunda']);
    });

    it('dos filas iguales en las tres claves comparan 0: el sort es total y no revienta', () => {
      const instante = new Date('2026-06-15T12:00:00.000Z');
      const duplicada1 = venta({ id: 'v-duplicada', createdAt: instante });
      const duplicada2 = venta({ id: 'v-duplicada', createdAt: instante });

      const ordenadas = ordenarCarteraFifo([duplicada1, duplicada2]);

      expect(ordenadas.map((v) => v.id)).toEqual(['v-duplicada', 'v-duplicada']);
    });

    it('no muta la lista recibida (§2.4: mutación de parámetros prohibida)', () => {
      const jun01 = venta({ id: 'v-jun01', fechaContable: fecha('2026-06-01') });
      const jul01 = venta({ id: 'v-jul01', fechaContable: fecha('2026-07-01') });
      const original = [jul01, jun01];

      ordenarCarteraFifo(original);

      expect(original.map((v) => v.id)).toEqual(['v-jul01', 'v-jun01']);
    });
  });
});
