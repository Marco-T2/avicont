import {
  EstadoComprobante,
  Moneda,
  PeriodoFiscalStatus,
  Prisma,
  TipoComprobante,
} from '@prisma/client';

import type { ClockPort } from '@/common/clock/clock.port';
import type { ContactosReaderPort } from '@/contactos/ports/contactos-reader.port';
import type { CuentaParaLinea, CuentasReaderPort } from '@/cuentas/ports/cuentas-reader.port';
import type { PeriodosReaderPort } from '@/periodos-fiscales/ports/periodos-reader.port';

import { ComprobanteSistemaWriterService } from './comprobante-sistema-writer.service';
import type { ComprobantesService } from './comprobantes.service';
import {
  ComprobanteAnuladoNoEditableError,
  ComprobanteAnularMotivoInvalidoError,
  ComprobanteDesbalanceadoError,
  ComprobanteNoEncontradoError,
  ComprobanteNoEsDeSistemaError,
  ContactoRequeridoError,
  CuentaInactivaError,
  CuentaNoDetalleError,
  GestionNoAbiertaError,
  PeriodoNoAbiertoError,
} from './domain/comprobante-errors';
import { ORIGEN_TIPO_VENTA } from './ports/comprobante-sistema-writer.port';
import type { ComprobanteRepositoryPort } from './ports/comprobante.repository.port';

const TENANT = 'org-1';
const COMPROBANTE_ID = 'comp-1';
const PERIODO_ID = 'periodo-1';
const CUENTA_CAJA = 'cuenta-caja';
const CUENTA_CXC = 'cuenta-cxc';
const HOY = '2026-07-20';
const FECHA = new Date(Date.UTC(2026, 6, 15));

function dec(v: string) {
  return new Prisma.Decimal(v);
}

function cuenta(over: Partial<CuentaParaLinea> = {}): CuentaParaLinea {
  return {
    id: CUENTA_CAJA,
    codigoInterno: '1.1.1.001',
    nombre: 'Caja General',
    activa: true,
    esDetalle: true,
    requiereContacto: false,
    permiteMultiMoneda: false,
    monedaFuncional: Moneda.BOB,
    ...over,
  };
}

/** Asiento mínimo válido: 100 al debe contra 100 al haber. */
function lineasBalanceadas() {
  return [
    {
      cuentaId: CUENTA_CAJA,
      contactoId: null,
      moneda: Moneda.BOB,
      debito: dec('100.00'),
      credito: dec('0'),
      tipoCambio: dec('1'),
      debitoBob: dec('100.00'),
      creditoBob: dec('0'),
      glosaLinea: null,
    },
    {
      cuentaId: CUENTA_CAJA,
      contactoId: null,
      moneda: Moneda.BOB,
      debito: dec('0'),
      credito: dec('100.00'),
      tipoCambio: dec('1'),
      debitoBob: dec('0'),
      creditoBob: dec('100.00'),
      glosaLinea: null,
    },
  ];
}

function comprobanteRow(over: Record<string, unknown> = {}) {
  return {
    id: COMPROBANTE_ID,
    organizationId: TENANT,
    tipo: TipoComprobante.INGRESO,
    numero: null,
    estado: EstadoComprobante.BORRADOR,
    generadoPorSistema: true,
    anulado: false,
    fechaContable: FECHA,
    periodoFiscalId: PERIODO_ID,
    glosa: 'Venta 001',
    monedaPrincipal: Moneda.BOB,
    lineas: [],
    ...over,
  } as never;
}

describe('ComprobanteSistemaWriterService', () => {
  let repo: { [K in keyof ComprobanteRepositoryPort]: jest.Mock };
  let cuentas: { obtenerBatch: jest.Mock };
  let contactos: { obtenerBatch: jest.Mock };
  let periodos: { [K in keyof PeriodosReaderPort]: jest.Mock };
  let clock: { [K in keyof ClockPort]: jest.Mock };
  let comprobantes: { contabilizarEnTx: jest.Mock; anularEnTx: jest.Mock };
  let service: ComprobanteSistemaWriterService;
  const tx = {} as Prisma.TransactionClient;

  beforeEach(() => {
    repo = {
      crearBorrador: jest.fn(),
      findById: jest.fn().mockResolvedValue(comprobanteRow()),
      reemplazarComprobante: jest.fn(),
      contabilizar: jest.fn(),
      anular: jest.fn(),
      eliminarBorrador: jest.fn(),
      crearBorradorSistemaSiNoExiste: jest.fn().mockResolvedValue({ id: COMPROBANTE_ID }),
      eliminarBorradorSistema: jest.fn().mockResolvedValue(1),
      listar: jest.fn(),
      listarAuditoria: jest.fn(),
      contarParaExport: jest.fn(),
      listarParaExport: jest.fn(),
    };
    cuentas = { obtenerBatch: jest.fn().mockResolvedValue(new Map([[CUENTA_CAJA, cuenta()]])) };
    contactos = { obtenerBatch: jest.fn().mockResolvedValue(new Map()) };
    periodos = {
      obtenerPorFecha: jest
        .fn()
        .mockResolvedValue({ id: PERIODO_ID, status: PeriodoFiscalStatus.ABIERTO }),
      obtenerRangoFechas: jest.fn(),
      obtenerReaperturaActiva: jest.fn(),
      obtenerRangoGestionPorFecha: jest.fn(),
      obtenerRangoGestion: jest.fn(),
    };
    clock = {
      now: jest.fn().mockReturnValue(new Date()),
      currentYearLaPaz: jest.fn().mockReturnValue(2026),
      currentDateLaPaz: jest.fn().mockReturnValue(HOY),
    };
    comprobantes = {
      contabilizarEnTx: jest.fn().mockResolvedValue(comprobanteRow({ numero: 'I2607-000001' })),
      anularEnTx: jest.fn().mockResolvedValue(comprobanteRow()),
    };

    service = new ComprobanteSistemaWriterService(
      repo as unknown as ComprobanteRepositoryPort,
      cuentas as unknown as CuentasReaderPort,
      contactos as unknown as ContactosReaderPort,
      periodos as unknown as PeriodosReaderPort,
      clock as unknown as ClockPort,
      comprobantes as unknown as ComprobantesService,
    );
  });

  function datosCrear(over: Record<string, unknown> = {}) {
    return {
      tenantId: TENANT,
      tipo: TipoComprobante.INGRESO,
      fechaContable: FECHA,
      glosa: 'Venta 001 al contado',
      monedaPrincipal: Moneda.BOB,
      origenTipo: ORIGEN_TIPO_VENTA as typeof ORIGEN_TIPO_VENTA,
      origenId: 'venta-1',
      createdByUserId: 'user-1',
      lineas: lineasBalanceadas(),
      ...over,
    };
  }

  function datosRegenerar(over: Record<string, unknown> = {}) {
    return {
      tenantId: TENANT,
      comprobanteId: COMPROBANTE_ID,
      fechaContable: FECHA,
      glosa: 'Venta 001 al contado (editada)',
      monedaPrincipal: Moneda.BOB,
      lineas: lineasBalanceadas(),
      ...over,
    };
  }

  // ============================================================
  describe('crearBorradorSistema', () => {
    it('resuelve el período desde la fecha y lo pasa al repo', async () => {
      await service.crearBorradorSistema(datosCrear(), tx);

      expect(periodos.obtenerPorFecha).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ year: 2026, month: 7 }),
        tx,
      );
      expect(repo.crearBorradorSistemaSiNoExiste).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ periodoFiscalId: PERIODO_ID, origenTipo: 'VENTA' }),
        tx,
      );
    });

    it('asigna el orden de las líneas por posición, 1-based', async () => {
      await service.crearBorradorSistema(datosCrear(), tx);

      const [, data] = repo.crearBorradorSistemaSiNoExiste.mock.calls[0] as [
        string,
        { lineas: { orden: number }[] },
      ];
      expect(data.lineas.map((l) => l.orden)).toEqual([1, 2]);
    });

    it('rechaza si el período está CERRADO (§4.4)', async () => {
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.CERRADO,
      });

      await expect(service.crearBorradorSistema(datosCrear(), tx)).rejects.toThrow(
        PeriodoNoAbiertoError,
      );
      expect(repo.crearBorradorSistemaSiNoExiste).not.toHaveBeenCalled();
    });

    it('rechaza si la fecha no cae en ninguna gestión abierta', async () => {
      periodos.obtenerPorFecha.mockResolvedValue(null);

      await expect(service.crearBorradorSistema(datosCrear(), tx)).rejects.toThrow(
        GestionNoAbiertaError,
      );
    });

    // El caso real de REQ-VTA-05: la cuenta viene de configuración almacenada
    // y pudo desactivarse después de configurada.
    it('rechaza si una cuenta del asiento fue desactivada', async () => {
      cuentas.obtenerBatch.mockResolvedValue(new Map([[CUENTA_CAJA, cuenta({ activa: false })]]));

      await expect(service.crearBorradorSistema(datosCrear(), tx)).rejects.toThrow(
        CuentaInactivaError,
      );
      expect(repo.crearBorradorSistemaSiNoExiste).not.toHaveBeenCalled();
    });

    it('rechaza si una cuenta del asiento no es de detalle', async () => {
      cuentas.obtenerBatch.mockResolvedValue(
        new Map([[CUENTA_CAJA, cuenta({ esDetalle: false })]]),
      );

      await expect(service.crearBorradorSistema(datosCrear(), tx)).rejects.toThrow(
        CuentaNoDetalleError,
      );
    });

    // B-1: el invariante del que depende el aging de cartera.
    it('rechaza una línea sin contacto contra una cuenta que lo exige', async () => {
      cuentas.obtenerBatch.mockResolvedValue(
        new Map([[CUENTA_CXC, cuenta({ id: CUENTA_CXC, requiereContacto: true })]]),
      );
      const lineas = lineasBalanceadas().map((l) => ({ ...l, cuentaId: CUENTA_CXC }));

      await expect(service.crearBorradorSistema(datosCrear({ lineas }), tx)).rejects.toThrow(
        ContactoRequeridoError,
      );
    });

    // El corazón de REQ-CMP-VTA-03: este camino esquiva la guarda del flag, así
    // que si no revalidara, un generador con un bug escribiría un asiento
    // desbalanceado directo a la base.
    it('rechaza un asiento que no cumple partida doble, aunque sea BORRADOR', async () => {
      const lineas = lineasBalanceadas();
      lineas[1] = { ...lineas[1]!, credito: dec('90.00'), creditoBob: dec('90.00') };

      await expect(service.crearBorradorSistema(datosCrear({ lineas }), tx)).rejects.toThrow(
        ComprobanteDesbalanceadoError,
      );
      expect(repo.crearBorradorSistemaSiNoExiste).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  describe('regenerarLineasSistema', () => {
    it('reemplaza en bloque y NO borra el comprobante (§4.9: el número es inmutable)', async () => {
      repo.findById.mockResolvedValue(
        comprobanteRow({ estado: EstadoComprobante.CONTABILIZADO, numero: 'I2607-000042' }),
      );

      await service.regenerarLineasSistema(datosRegenerar(), tx);

      expect(repo.reemplazarComprobante).toHaveBeenCalledTimes(1);
      expect(repo.eliminarBorradorSistema).not.toHaveBeenCalled();
      expect(repo.crearBorradorSistemaSiNoExiste).not.toHaveBeenCalled();
    });

    // El caller no manda el tipo justamente para no poder cambiarlo. Se usa
    // DIARIO porque difiere del INGRESO que arma `datosCrear`: si el writer
    // tomara el tipo de otro lado, este test lo vería.
    it('preserva el tipo del comprobante existente', async () => {
      repo.findById.mockResolvedValue(comprobanteRow({ tipo: TipoComprobante.DIARIO }));

      await service.regenerarLineasSistema(datosRegenerar(), tx);

      const [, , data] = repo.reemplazarComprobante.mock.calls[0] as [
        string,
        string,
        { tipo: TipoComprobante },
      ];
      expect(data.tipo).toBe(TipoComprobante.DIARIO);
    });

    it('recalcula los totales en BOB a partir de las líneas nuevas', async () => {
      await service.regenerarLineasSistema(datosRegenerar(), tx);

      const [, , data] = repo.reemplazarComprobante.mock.calls[0] as [
        string,
        string,
        { totalDebitoBob: Prisma.Decimal; totalCreditoBob: Prisma.Decimal },
      ];
      expect(data.totalDebitoBob.toString()).toBe('100');
      expect(data.totalCreditoBob.toString()).toBe('100');
    });

    it('rechaza si el comprobante no existe en el tenant', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.regenerarLineasSistema(datosRegenerar(), tx)).rejects.toThrow(
        ComprobanteNoEncontradoError,
      );
    });

    // La guarda que protege al contador de un id equivocado del módulo comercial.
    it('rechaza un comprobante que NO es de sistema', async () => {
      repo.findById.mockResolvedValue(comprobanteRow({ generadoPorSistema: false }));

      await expect(service.regenerarLineasSistema(datosRegenerar(), tx)).rejects.toThrow(
        ComprobanteNoEsDeSistemaError,
      );
      expect(repo.reemplazarComprobante).not.toHaveBeenCalled();
    });

    it('rechaza regenerar un comprobante anulado (§4.7: la anulación es terminal)', async () => {
      repo.findById.mockResolvedValue(comprobanteRow({ anulado: true }));

      await expect(service.regenerarLineasSistema(datosRegenerar(), tx)).rejects.toThrow(
        ComprobanteAnuladoNoEditableError,
      );
    });

    it('rechaza si el período de ORIGEN ya está cerrado', async () => {
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO_ID,
        status: PeriodoFiscalStatus.CERRADO,
      });

      await expect(service.regenerarLineasSistema(datosRegenerar(), tx)).rejects.toThrow(
        PeriodoNoAbiertoError,
      );
    });

    // Mover la fecha a un mes cerrado metería el asiento en un balance ya emitido.
    it('rechaza si la fecha nueva cae en un período cerrado', async () => {
      const fechaOtroMes = new Date(Date.UTC(2026, 7, 10));
      periodos.obtenerPorFecha
        .mockResolvedValueOnce({ id: PERIODO_ID, status: PeriodoFiscalStatus.ABIERTO })
        .mockResolvedValueOnce({ id: 'periodo-agosto', status: PeriodoFiscalStatus.CERRADO });

      await expect(
        service.regenerarLineasSistema(datosRegenerar({ fechaContable: fechaOtroMes }), tx),
      ).rejects.toThrow(PeriodoNoAbiertoError);
    });
  });

  // ============================================================
  describe('contabilizarSistema', () => {
    it('delega en el núcleo compartido y devuelve el número asignado', async () => {
      const res = await service.contabilizarSistema(COMPROBANTE_ID, TENANT, tx);

      expect(comprobantes.contabilizarEnTx).toHaveBeenCalledWith(TENANT, COMPROBANTE_ID, tx);
      expect(res).toEqual({ numero: 'I2607-000001' });
    });

    it('rechaza un comprobante que NO es de sistema', async () => {
      repo.findById.mockResolvedValue(comprobanteRow({ generadoPorSistema: false }));

      await expect(service.contabilizarSistema(COMPROBANTE_ID, TENANT, tx)).rejects.toThrow(
        ComprobanteNoEsDeSistemaError,
      );
      expect(comprobantes.contabilizarEnTx).not.toHaveBeenCalled();
    });

    it('rechaza si el comprobante no existe en el tenant', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.contabilizarSistema(COMPROBANTE_ID, TENANT, tx)).rejects.toThrow(
        ComprobanteNoEncontradoError,
      );
    });
  });

  // ============================================================
  describe('anularSistema', () => {
    const datosAnular = {
      tenantId: TENANT,
      comprobanteId: COMPROBANTE_ID,
      motivo: 'Cliente devolvió la mercadería',
      anuladoPorUserId: 'user-1',
    };

    it('delega en el núcleo compartido con el motivo trimmeado', async () => {
      await service.anularSistema({ ...datosAnular, motivo: '  Cliente anuló el pedido  ' }, tx);

      expect(comprobantes.anularEnTx).toHaveBeenCalledWith(
        TENANT,
        COMPROBANTE_ID,
        expect.objectContaining({ motivoTrim: 'Cliente anuló el pedido' }),
        tx,
      );
    });

    // El camino de sistema NO hereda la excepción de reapertura: tocar un
    // período cerrado sigue siendo potestad del admin (§4.4, sin bypass).
    it('no admite período cerrado por reapertura', async () => {
      await service.anularSistema(datosAnular, tx);

      expect(comprobantes.anularEnTx).toHaveBeenCalledWith(
        TENANT,
        COMPROBANTE_ID,
        expect.objectContaining({ hayReaperturaActiva: false }),
        tx,
      );
    });

    it('rechaza un motivo que no llega al mínimo significativo (§4.7)', async () => {
      await expect(service.anularSistema({ ...datosAnular, motivo: 'corto' }, tx)).rejects.toThrow(
        ComprobanteAnularMotivoInvalidoError,
      );
      expect(comprobantes.anularEnTx).not.toHaveBeenCalled();
    });

    it('rechaza un comprobante que NO es de sistema', async () => {
      repo.findById.mockResolvedValue(comprobanteRow({ generadoPorSistema: false }));

      await expect(service.anularSistema(datosAnular, tx)).rejects.toThrow(
        ComprobanteNoEsDeSistemaError,
      );
      expect(comprobantes.anularEnTx).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  describe('eliminarBorradorSistema', () => {
    it('borra el borrador de sistema', async () => {
      await service.eliminarBorradorSistema(COMPROBANTE_ID, TENANT, tx);

      expect(repo.eliminarBorradorSistema).toHaveBeenCalledWith(TENANT, COMPROBANTE_ID, tx);
    });

    // Idempotente: un reintento del módulo origen no tiene por qué fallar.
    it('no falla si el comprobante ya no está', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.eliminarBorradorSistema(COMPROBANTE_ID, TENANT, tx),
      ).resolves.toBeUndefined();
      expect(repo.eliminarBorradorSistema).not.toHaveBeenCalled();
    });

    it('rechaza borrar un comprobante que NO es de sistema', async () => {
      repo.findById.mockResolvedValue(comprobanteRow({ generadoPorSistema: false }));

      await expect(service.eliminarBorradorSistema(COMPROBANTE_ID, TENANT, tx)).rejects.toThrow(
        ComprobanteNoEsDeSistemaError,
      );
      expect(repo.eliminarBorradorSistema).not.toHaveBeenCalled();
    });

    // Un CONTABILIZADO ya emitió su número: se anula, no se borra (§4.7).
    it('rechaza borrar un comprobante ya CONTABILIZADO', async () => {
      repo.findById.mockResolvedValue(
        comprobanteRow({ estado: EstadoComprobante.CONTABILIZADO, numero: 'I2607-000042' }),
      );

      await expect(service.eliminarBorradorSistema(COMPROBANTE_ID, TENANT, tx)).rejects.toThrow(
        ComprobanteNoEsDeSistemaError,
      );
      expect(repo.eliminarBorradorSistema).not.toHaveBeenCalled();
    });
  });
});
